import {
	EXPORT_BUNDLE_VERSION,
	type ExportBundle,
	ExportBundleError,
	parseExportBundle,
} from "../core/exportBundle.js";
import {
	buildHistory,
	matchesForPlayer,
	type PlayerHistory,
	type SeasonHistory,
} from "../core/history.js";
import { LIMITS } from "../core/limits.js";
import {
	type MatchFile,
	MatchFileError,
	parseMatchFile,
} from "../core/matchFile.js";
import { buildPlayerIdMap, type PlayerIdMap } from "../core/playerIdentity.js";
import {
	type AbsenceReason,
	type AvailabilityEntry,
	type AvailabilityStatus,
	type DevelopmentArea,
	type PlayerNotesFile,
	seasonFeedback,
	withAvailability,
	withDevelopment,
} from "../core/playerNotes.js";
import { buildSeasonReport, type SeasonReport } from "../core/seasonReport.js";
import {
	decryptJson,
	encryptJson,
	parseSecurePackage,
	SecurePackageError,
	securePackageToJson,
} from "../core/securePackage.js";
import {
	developmentTimeline,
	monthlyMinutes,
	recentStartFrequency,
} from "../core/visualizations.js";
import { readItem, STORAGE_KEYS, writeItem } from "./appStorage.js";
import { confirmWithSecondTap } from "./confirmButton.js";
import { loadDraft, saveDraft } from "./draftStorage.js";
import { createDriveAuth } from "./driveAuth.js";
import { createDriveBackup } from "./driveBackup.js";
import {
	DRIVE_APP_ID,
	DRIVE_CLIENT_ID,
	DRIVE_PICKER_API_KEY,
	DRIVE_SCOPE,
} from "./driveConfig.js";
import { pickFolder } from "./drivePicker.js";
import { keepMatchFiles, loadMatchFiles } from "./matchFileStorage.js";
import { loadPlayerNotes, savePlayerNotes } from "./playerNotesStorage.js";
import { lineName } from "./reportText.js";
import { TEXT } from "./text.js";

function byId(id: string): HTMLElement {
	const node = document.getElementById(id);
	if (!node) throw new Error(`Missing element #${id}`);
	return node;
}

/** The lines in the order a coach reads them: goal, then back to attack. */
const LINE_ORDER = ["goal", "back", "dmid", "mid", "amid", "fwd"];

function card(title: string): HTMLElement {
	const section = document.createElement("section");
	section.className = "card";
	const heading = document.createElement("h2");
	heading.textContent = title;
	section.append(heading);
	return section;
}

function table(
	headers: readonly string[],
	rows: readonly (readonly string[])[],
): HTMLTableElement {
	const el = document.createElement("table");
	el.className = "report-table";
	const head = el.appendChild(document.createElement("thead"));
	const headRow = head.appendChild(document.createElement("tr"));
	for (const header of headers) {
		const th = document.createElement("th");
		th.scope = "col";
		th.textContent = header;
		headRow.append(th);
	}
	const body = el.appendChild(document.createElement("tbody"));
	for (const values of rows) {
		const row = body.appendChild(document.createElement("tr"));
		values.forEach((text, i) => {
			const cell = document.createElement(i === 0 ? "th" : "td");
			if (cell instanceof HTMLTableCellElement && i === 0) cell.scope = "row";
			cell.textContent = text;
			row.append(cell);
		});
	}
	return el;
}

/** A labelled field, the same field/field-label wrapper the setup screen uses. */
function field(
	labelText: string,
	control: HTMLElement,
	id: string,
): HTMLElement {
	control.id = id;
	const wrap = document.createElement("div");
	wrap.className = "field";
	const label = document.createElement("label");
	label.className = "field-label";
	label.textContent = labelText;
	label.htmlFor = id;
	wrap.append(label, control);
	return wrap;
}

/** A labelled <select> field; returns both the wrapper and the select to wire up. */
function selectField(
	labelText: string,
	id: string,
	options: readonly (readonly [string, string])[],
): { wrap: HTMLElement; select: HTMLSelectElement } {
	const select = document.createElement("select");
	for (const [value, text] of options) {
		const opt = document.createElement("option");
		opt.value = value;
		opt.textContent = text;
		select.append(opt);
	}
	return { wrap: field(labelText, select, id), select };
}

const SVG_NS = "http://www.w3.org/2000/svg";
const CHART_COLORS = ["#127a3e", "#f07a1a", "#1554d1", "#b81f35", "#7b3f98"];
const chartColor = (index: number): string =>
	CHART_COLORS[index % CHART_COLORS.length] ?? "#127a3e";

function svgNode(name: string): SVGElement {
	return document.createElementNS(SVG_NS, name);
}

function svgText(text: string, x: number, y: number): SVGTextElement {
	const node = svgNode("text") as SVGTextElement;
	node.setAttribute("x", String(x));
	node.setAttribute("y", String(y));
	node.textContent = text;
	return node;
}

function monthlyMinutesChart(history: SeasonHistory): SVGSVGElement {
	const model = monthlyMinutes(history);
	const width = 360;
	const left = 92;
	const top = 22;
	const rowHeight = 30;
	const chartWidth = width - left - 8;
	const monthWidth = chartWidth / Math.max(model.months.length, 1);
	const height = top + model.series.length * rowHeight + 28;
	const max = Math.max(1, ...model.series.flatMap((series) => series.minutes));
	const svg = svgNode("svg") as SVGSVGElement;
	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	svg.setAttribute("role", "img");
	svg.setAttribute("aria-label", TEXT.history.visualizations.monthlyMinutes);

	model.series.forEach((series, playerIndex) => {
		const y = top + playerIndex * rowHeight;
		svg.append(svgText(series.name, 4, y + 16));
		series.minutes.forEach((minutes, monthIndex) => {
			const bar = svgNode("rect");
			bar.setAttribute("x", String(left + monthIndex * monthWidth + 2));
			bar.setAttribute("y", String(y + 4));
			bar.setAttribute("width", String(Math.max(1, monthWidth - 5)));
			bar.setAttribute("height", String((minutes / max) * 18));
			bar.setAttribute(
				"transform",
				`translate(0 ${18 - (minutes / max) * 18})`,
			);
			bar.setAttribute("fill", chartColor(playerIndex));
			svg.append(bar);
		});
	});
	model.months.forEach((month, index) => {
		svg.append(
			svgText(month.slice(5), left + index * monthWidth + 4, height - 4),
		);
	});
	return svg;
}

function startFrequencyChart(history: SeasonHistory): SVGSVGElement {
	const model = recentStartFrequency(history);
	const width = 360;
	const left = 92;
	const top = 8;
	const rowHeight = 28;
	const barWidth = width - left - 34;
	const height = top + model.length * rowHeight;
	const svg = svgNode("svg") as SVGSVGElement;
	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	svg.setAttribute("role", "img");
	svg.setAttribute("aria-label", TEXT.history.visualizations.startFrequency);

	model.forEach((player, index) => {
		const y = top + index * rowHeight;
		svg.append(svgText(player.name, 4, y + 16));
		const bar = svgNode("rect");
		bar.setAttribute("x", String(left));
		bar.setAttribute("y", String(y + 4));
		bar.setAttribute("width", String((player.percentage / 100) * barWidth));
		bar.setAttribute("height", "18");
		bar.setAttribute("fill", chartColor(index));
		svg.append(
			bar,
			svgText(`${player.percentage}%`, left + barWidth + 4, y + 17),
		);
	});
	return svg;
}

function buildVisualizationCard(history: SeasonHistory): HTMLElement {
	const t = TEXT.history.visualizations;
	const section = card(t.title);
	const description = document.createElement("p");
	description.className = "hint";
	description.textContent = t.chartDescription;
	section.append(description);

	const monthly = document.createElement("div");
	monthly.className = "history-chart";
	const monthlyHeading = document.createElement("h3");
	monthlyHeading.textContent = t.monthlyMinutes;
	monthly.append(monthlyHeading, monthlyMinutesChart(history));
	section.append(monthly);

	const starts = document.createElement("div");
	starts.className = "history-chart";
	const startsHeading = document.createElement("h3");
	startsHeading.textContent = t.startFrequency;
	starts.append(startsHeading, startFrequencyChart(history));
	section.append(starts);

	const timeline = document.createElement("div");
	timeline.className = "history-chart";
	const timelineHeading = document.createElement("h3");
	timelineHeading.textContent = t.developmentTimeline;
	timeline.append(timelineHeading);
	const entries = developmentTimeline(history, loadPlayerNotes());
	if (entries.length === 0) {
		const empty = document.createElement("p");
		empty.className = "hint";
		empty.textContent = t.noDevelopmentNotes;
		timeline.append(empty);
	} else {
		const list = document.createElement("ol");
		list.className = "development-timeline";
		for (const entry of entries) {
			const item = document.createElement("li");
			item.textContent = `${entry.date} · ${entry.name} · ${TEXT.history.playerNotes.area[entry.area]}: ${entry.note}`;
			list.append(item);
		}
		timeline.append(list);
	}
	section.append(timeline);
	return section;
}

/**
 * Wires the "backup to Google Drive" card; hidden when no client id is
 * set. The folder is chosen via drivePicker.ts (#70) rather than the app
 * silently creating one, both so it is easy to find and so a folder
 * shared between coaches can be picked by each of them. Every file is
 * encrypted with a password the coach types in for each call (#81); it is
 * never saved anywhere.
 */
function setUpDriveBackup(refresh: () => void): void {
	const card = byId("historyBackupCard");
	if (DRIVE_CLIENT_ID === "") return;
	card.hidden = false;

	const connectBtn = byId("driveConnectBtn") as HTMLButtonElement;
	const chooseFolderBtn = byId("driveChooseFolderBtn") as HTMLButtonElement;
	const folderStatus = byId("driveFolderStatus");
	const folderLink = byId("driveFolderLink") as HTMLAnchorElement;
	const passwordField = byId("drivePasswordField");
	const passwordInput = byId("drivePasswordInput") as HTMLInputElement;
	const backupBtn = byId("driveBackupBtn") as HTMLButtonElement;
	const restoreBtn = byId("driveRestoreBtn") as HTMLButtonElement;
	const status = byId("driveStatus");
	const t = TEXT.history.drive;

	const auth = createDriveAuth(DRIVE_CLIENT_ID, DRIVE_SCOPE);
	const backup = createDriveBackup(auth);

	function showFolder(id: string, name: string): void {
		writeItem(STORAGE_KEYS.driveFolderId, id);
		writeItem(STORAGE_KEYS.driveFolderName, name);
		folderLink.textContent = name;
		folderLink.href = `https://drive.google.com/drive/folders/${id}`;
		folderStatus.hidden = false;
		chooseFolderBtn.textContent = t.changeFolder;
		passwordField.hidden = false;
		backupBtn.hidden = false;
		restoreBtn.hidden = false;
	}

	const storedFolderId = readItem(STORAGE_KEYS.driveFolderId);
	const storedFolderName = readItem(STORAGE_KEYS.driveFolderName);
	if (storedFolderId !== null && storedFolderName !== null) {
		showFolder(storedFolderId, storedFolderName);
	}

	connectBtn.addEventListener("click", async () => {
		status.textContent = t.connecting;
		try {
			await auth.accessToken();
			connectBtn.hidden = true;
			chooseFolderBtn.hidden = false;
			status.textContent = t.signedIn;
		} catch {
			status.textContent = t.signInFailed;
		}
	});

	chooseFolderBtn.addEventListener("click", async () => {
		status.textContent = t.choosingFolder;
		chooseFolderBtn.disabled = true;
		try {
			const token = await auth.accessToken();
			const chosen = await pickFolder(
				token,
				DRIVE_PICKER_API_KEY,
				DRIVE_APP_ID,
			);
			if (chosen) {
				showFolder(chosen.id, chosen.name);
				status.textContent = t.folderLabel(chosen.name);
			} else {
				// Cancelling "Byt mapp" leaves the previously chosen folder
				// active (it is still in storage, and backup/restore still
				// work against it) - only claim "no folder chosen" when
				// that is actually true.
				const currentName = readItem(STORAGE_KEYS.driveFolderName);
				status.textContent =
					currentName !== null ? t.folderLabel(currentName) : t.noFolderChosen;
			}
		} catch {
			status.textContent = t.folderPickerFailed;
		} finally {
			chooseFolderBtn.disabled = false;
		}
	});

	function currentFolderId(): string | null {
		return readItem(STORAGE_KEYS.driveFolderId);
	}

	backupBtn.addEventListener("click", async () => {
		const folderId = currentFolderId();
		if (folderId === null) return;
		if (passwordInput.value === "") {
			status.textContent = t.needPassword;
			return;
		}
		status.textContent = t.backingUp;
		backupBtn.disabled = true;
		try {
			const { uploaded } = await backup.backup(folderId, passwordInput.value);
			status.textContent = t.backedUp(uploaded);
		} catch (err) {
			status.textContent =
				err instanceof SecurePackageError ? t.wrongPassword : t.failed;
		} finally {
			backupBtn.disabled = false;
		}
	});

	restoreBtn.addEventListener("click", async () => {
		const folderId = currentFolderId();
		if (folderId === null) return;
		if (passwordInput.value === "") {
			status.textContent = t.needPassword;
			return;
		}
		status.textContent = t.restoring;
		restoreBtn.disabled = true;
		try {
			const { downloaded } = await backup.restore(
				folderId,
				passwordInput.value,
			);
			status.textContent = t.restored(downloaded);
			refresh();
		} catch (err) {
			status.textContent =
				err instanceof SecurePackageError ? t.wrongPassword : t.failed;
		} finally {
			restoreBtn.disabled = false;
		}
	});
}

/**
 * The "Säker export och import" card (#81): a coach's whole local season -
 * roster draft, every match file, player notes - as one file protected by
 * one password (core/exportBundle.ts, core/securePackage.ts), for moving
 * everything to another device without Google Drive. Purely local: no
 * network, no sign-in.
 */
function setUpSecureExport(refresh: () => void): void {
	const passwordInput = byId("secureExportPasswordInput") as HTMLInputElement;
	const exportBtn = byId("secureExportBtn") as HTMLButtonElement;
	const fileInput = byId("secureImportFileInput") as HTMLInputElement;
	const importBtn = byId("secureImportBtn") as HTMLButtonElement;
	const status = byId("secureExportStatus");
	const t = TEXT.history.secureExport;

	let pendingFile: File | null = null;

	exportBtn.addEventListener("click", async () => {
		if (passwordInput.value === "") {
			status.textContent = t.needPassword;
			return;
		}
		const bundle: ExportBundle = {
			schemaVersion: EXPORT_BUNDLE_VERSION,
			roster: loadDraft(),
			matches: loadMatchFiles(),
			playerNotes: loadPlayerNotes(),
		};
		const pkg = await encryptJson(passwordInput.value, bundle);
		downloadJson(
			`matchplanner-export-${new Date().toISOString().slice(0, 10)}.json`,
			securePackageToJson(pkg),
		);
		status.textContent = t.exported;
	});

	fileInput.addEventListener("change", () => {
		pendingFile = fileInput.files?.[0] ?? null;
		importBtn.disabled = pendingFile === null;
	});

	confirmWithSecondTap(importBtn, {
		confirmLabel: t.confirmImport,
		onConfirm: () => {
			void (async () => {
				const file = pendingFile;
				if (file === null) return;
				if (passwordInput.value === "") {
					status.textContent = t.needPassword;
					return;
				}
				status.textContent = t.importing;
				try {
					const pkg = parseSecurePackage(JSON.parse(await file.text()));
					const bundle = parseExportBundle(
						await decryptJson(passwordInput.value, pkg),
					);
					if (bundle.roster) saveDraft(bundle.roster);
					savePlayerNotes(bundle.playerNotes);
					keepMatchFiles(bundle.matches);
					status.textContent = t.imported;
					refresh();
				} catch (err) {
					status.textContent =
						err instanceof SecurePackageError ||
						err instanceof ExportBundleError
							? t.wrongPassword
							: t.unreadable;
				} finally {
					pendingFile = null;
					fileInput.value = "";
					importBtn.disabled = true;
				}
			})();
		},
	});
}

/** Which of the reason keys TEXT.history.playerNotes.reason declares. */
const REASONS: readonly AbsenceReason[] = ["injury", "illness", "other"];
const AREAS: readonly DevelopmentArea[] = [
	"physical",
	"mental",
	"technical",
	"tactical",
];

function downloadJson(fileName: string, json: string): void {
	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	URL.revokeObjectURL(url);
}

function buildSeasonReportCard(history: SeasonHistory): HTMLElement {
	const t = TEXT.history.seasonReport;
	const section = card(t.title);
	section.classList.add("season-report-card");
	const description = document.createElement("p");
	description.className = "hint";
	description.textContent = t.description;
	section.append(description);

	const report = buildSeasonReport(
		history,
		loadPlayerNotes(),
		new Date().toISOString(),
	);
	const summaryInputs = new Map<
		string,
		Map<DevelopmentArea, HTMLTextAreaElement>
	>();
	for (const player of report.players) {
		const playerSection = document.createElement("section");
		playerSection.className = "season-report-player";
		const heading = document.createElement("h3");
		heading.textContent = player.name;
		playerSection.append(heading);
		const stats = document.createElement("p");
		stats.className = "hint";
		stats.textContent = t.stats(
			player.matches.squad,
			player.matches.played,
			player.matches.started,
			Math.round(player.playtimeSeconds.total / 60),
			player.availability.present,
			player.availability.absent,
		);
		playerSection.append(stats);

		const inputs = new Map<DevelopmentArea, HTMLTextAreaElement>();
		for (const summary of player.developmentSummary) {
			const textarea = document.createElement("textarea");
			textarea.rows = 2;
			textarea.value = summary.summary;
			textarea.maxLength = LIMITS.playerNoteLength;
			playerSection.append(
				field(
					TEXT.history.playerNotes.area[summary.area],
					textarea,
					`season-${player.key}-${summary.area}`,
				),
			);
			inputs.set(summary.area, textarea);
		}
		summaryInputs.set(player.key, inputs);
		section.append(playerSection);
	}

	const passwordInput = document.createElement("input");
	passwordInput.type = "password";
	passwordInput.autocomplete = "off";
	section.append(field(t.passwordLabel, passwordInput, "seasonReportPassword"));

	const status = document.createElement("p");
	status.className = "hint";
	status.setAttribute("role", "status");
	section.append(status);

	const actions = document.createElement("div");
	actions.className = "row-buttons";
	const exportButton = document.createElement("button");
	exportButton.type = "button";
	exportButton.className = "btn btn-secondary";
	exportButton.textContent = t.exportButton;
	exportButton.addEventListener("click", async () => {
		if (passwordInput.value === "") {
			status.textContent = t.needPassword;
			return;
		}
		const reviewed: SeasonReport = {
			...report,
			players: report.players.map((player) => ({
				...player,
				developmentSummary: player.developmentSummary.map((summary) => ({
					...summary,
					summary:
						summaryInputs.get(player.key)?.get(summary.area)?.value.trim() ??
						summary.summary,
				})),
			})),
		};
		const pkg = await encryptJson(passwordInput.value, reviewed);
		downloadJson(
			`sasongsrapport-${report.generatedAt.slice(0, 10)}.json`,
			securePackageToJson(pkg),
		);
		status.textContent = "";
	});
	actions.append(exportButton);

	const printButton = document.createElement("button");
	printButton.type = "button";
	printButton.className = "btn btn-secondary";
	printButton.textContent = t.printButton;
	printButton.addEventListener("click", () => {
		document.body.classList.add("printing-season-report");
		window.print();
		window.setTimeout(
			() => document.body.classList.remove("printing-season-report"),
			0,
		);
	});
	actions.append(printButton);
	section.append(actions);
	return section;
}

/**
 * Availability, per match, for one player: pick a match, save whether they
 * were available or absent (with a reason). Calls `onSaved` after a save so
 * the caller can refresh - this module has no state of its own, per match
 * files and player notes are re-read fresh on every render.
 */
function buildAvailabilityField(
	notes: PlayerNotesFile,
	player: PlayerHistory,
	map: PlayerIdMap,
	onSaved: () => void,
): HTMLElement {
	const t = TEXT.history.playerNotes;
	const section = document.createElement("div");
	section.className = "field-stack";
	const heading = document.createElement("h3");
	heading.textContent = t.availabilityTitle;
	section.append(heading);

	const matches = matchesForPlayer(loadMatchFiles(), map, player.key);
	if (matches.length === 0) {
		const none = document.createElement("p");
		none.className = "hint";
		none.textContent = t.noMatchesYet;
		section.append(none);
		return section;
	}

	const { wrap: matchWrap, select: matchSelect } = selectField(
		t.chooseMatch,
		`notesMatch-${player.key}`,
		matches.map((m) => [m.matchId, t.matchLabel(m.opponent, m.date)]),
	);
	section.append(matchWrap);

	const currentNote = document.createElement("p");
	currentNote.className = "hint";
	section.append(currentNote);

	const { wrap: statusWrap, select: statusSelect } = selectField(
		"Status",
		`notesStatus-${player.key}`,
		[
			["available", t.statusAvailable],
			["absent", t.statusAbsent],
		],
	);
	section.append(statusWrap);

	const { wrap: reasonWrap, select: reasonSelect } = selectField(
		"Anledning",
		`notesReason-${player.key}`,
		[["", "—"], ...REASONS.map((r) => [r, t.reason[r]] as const)],
	);
	section.append(reasonWrap);

	const noteInput = document.createElement("input");
	noteInput.type = "text";
	noteInput.maxLength = LIMITS.playerNoteLength;
	section.append(
		field(t.notePlaceholder, noteInput, `notesNote-${player.key}`),
	);

	const own = notes.players.find((p) => p.key === player.key);
	function loadForm(): void {
		const existing = own?.availability.find(
			(a) => a.matchId === matchSelect.value,
		);
		statusSelect.value = existing?.status ?? "available";
		reasonSelect.value = existing?.reason ?? "";
		reasonWrap.hidden = statusSelect.value !== "absent";
		noteInput.value = existing?.note ?? "";
		currentNote.textContent = existing
			? t.currentAvailability(existing.status, existing.reason)
			: "";
	}
	matchSelect.addEventListener("change", loadForm);
	statusSelect.addEventListener("change", () => {
		reasonWrap.hidden = statusSelect.value !== "absent";
	});
	loadForm();

	const saveBtn = document.createElement("button");
	saveBtn.type = "button";
	saveBtn.className = "btn btn-secondary";
	saveBtn.textContent = t.saveAvailability;
	saveBtn.addEventListener("click", () => {
		const entry: AvailabilityEntry = {
			matchId: matchSelect.value,
			status: statusSelect.value as AvailabilityStatus,
		};
		if (statusSelect.value === "absent" && reasonSelect.value !== "") {
			entry.reason = reasonSelect.value as AbsenceReason;
		}
		if (noteInput.value.trim() !== "") entry.note = noteInput.value;
		savePlayerNotes(withAvailability(loadPlayerNotes(), player.key, entry));
		onSaved();
	});
	section.append(saveBtn);
	return section;
}

/** Development notes for one player: add one, and see the ones already kept. */
function buildDevelopmentField(
	notes: PlayerNotesFile,
	player: PlayerHistory,
	onSaved: () => void,
): HTMLElement {
	const t = TEXT.history.playerNotes;
	const section = document.createElement("div");
	section.className = "field-stack";
	const heading = document.createElement("h3");
	heading.textContent = t.developmentTitle;
	section.append(heading);

	const dateInput = document.createElement("input");
	dateInput.type = "date";
	dateInput.value = new Date().toISOString().slice(0, 10);
	section.append(field("Datum", dateInput, `notesDate-${player.key}`));

	const { wrap: areaWrap, select: areaSelect } = selectField(
		"Område",
		`notesArea-${player.key}`,
		AREAS.map((a) => [a, t.area[a]] as const),
	);
	section.append(areaWrap);

	const noteInput = document.createElement("input");
	noteInput.type = "text";
	noteInput.maxLength = LIMITS.playerNoteLength;
	section.append(
		field(
			t.developmentNotePlaceholder,
			noteInput,
			`notesDevelopmentNote-${player.key}`,
		),
	);

	const addBtn = document.createElement("button");
	addBtn.type = "button";
	addBtn.className = "btn btn-secondary";
	addBtn.textContent = t.addDevelopmentNote;
	addBtn.addEventListener("click", () => {
		if (dateInput.value === "" || noteInput.value.trim() === "") return;
		savePlayerNotes(
			withDevelopment(loadPlayerNotes(), player.key, {
				date: dateInput.value,
				area: areaSelect.value as DevelopmentArea,
				note: noteInput.value,
			}),
		);
		onSaved();
	});
	section.append(addBtn);

	const own = notes.players.find((p) => p.key === player.key);
	const list = document.createElement("ul");
	list.className = "history-messages";
	if (!own || own.development.length === 0) {
		const li = document.createElement("li");
		li.textContent = t.noNotesYet;
		list.append(li);
	} else {
		for (const entry of [...own.development].reverse()) {
			const li = document.createElement("li");
			li.textContent = t.developmentNote(
				entry.date,
				t.area[entry.area],
				entry.note,
			);
			list.append(li);
		}
	}
	section.append(list);
	return section;
}

/**
 * Availability and development notes, per player (#58): who a coach knows
 * but the match timeline can't see. Every number above is derived from
 * match files; this card's data comes from core/playerNotes.ts instead,
 * saved separately (playerNotesStorage.ts) and keyed the same way
 * (history.ts's nameKey), so a player's notes and their season stats
 * always mean the same person.
 */
function buildPlayerNotesCard(
	history: SeasonHistory,
	map: PlayerIdMap,
	selectedKey: string | null,
	onSelect: (key: string) => void,
	onSaved: () => void,
): HTMLElement {
	const t = TEXT.history.playerNotes;
	const section = card(t.title);
	const notes = loadPlayerNotes();

	const feedback = seasonFeedback(history, notes);
	if (feedback.length > 0) {
		const feedbackHeading = document.createElement("h3");
		feedbackHeading.textContent = t.feedbackTitle;
		section.append(feedbackHeading);
		const list = document.createElement("ul");
		list.className = "report-feedback";
		const nameOf = (key: string) =>
			history.players.find((p) => p.key === key)?.name ?? key;
		for (const item of feedback) {
			const li = document.createElement("li");
			li.textContent =
				item.code === "unexplainedAbsences"
					? t.unexplainedAbsences(nameOf(item.playerId), item.count)
					: t.noDevelopmentNotes(nameOf(item.playerId), item.squadMatches);
			list.append(li);
		}
		section.append(list);
	}

	const key =
		selectedKey && history.players.some((p) => p.key === selectedKey)
			? selectedKey
			: (history.players[0]?.key ?? null);

	const { wrap: playerWrap, select: playerSelect } = selectField(
		t.choosePlayer,
		"playerNotesSelect",
		history.players.map((p) => [p.key, p.name] as const),
	);
	if (key) playerSelect.value = key;
	playerSelect.addEventListener("change", () => onSelect(playerSelect.value));
	section.append(playerWrap);

	const player = key ? history.players.find((p) => p.key === key) : undefined;
	if (player) {
		section.append(
			buildAvailabilityField(notes, player, map, onSaved),
			buildDevelopmentField(notes, player, onSaved),
		);
	}
	return section;
}

/**
 * The season history screen: import match files, then per player starts,
 * minutes, minutes per position and month by month. Every number comes from
 * core/history.ts, which computes it from the match files' timelines.
 */
export function createHistoryView(): { refresh: () => void } {
	const messages = byId("historyMessages");
	const input = byId("historyImportInput") as HTMLInputElement;
	let selectedPlayerKey: string | null = null;

	async function refresh(): Promise<void> {
		const files = loadMatchFiles();
		const map = await buildPlayerIdMap(
			files.flatMap((f) => f.squad.players.map((p) => p.name)),
		);
		const history = buildHistory(files, map);
		byId("historyCount").textContent =
			history.matches === 0
				? TEXT.history.empty
				: TEXT.history.matchesCount(history.matches, history.months.length);
		const results = byId("historyResults");
		results.replaceChildren();
		if (history.matches === 0) return;

		const players = card("Startat och speltid");
		players.append(
			table(
				[
					"Spelare",
					"Matcher",
					"Startat",
					"Bänkstart",
					"Minuter",
					"Snitt per match",
					"Startat, senaste matcherna",
				],
				history.players.map((p) => [
					p.name,
					String(p.squadMatches),
					String(p.started),
					String(p.startedOnBench),
					TEXT.history.minutes(p.totalSeconds),
					TEXT.history.minutes(p.averageSeconds),
					TEXT.history.recent(p.recent.started, p.recent.of),
				]),
			),
		);
		const hints = history.players.filter(
			(p: PlayerHistory) =>
				p.recent.of >= 3 && p.recent.started * 2 <= p.recent.of,
		);
		if (hints.length > 0) {
			const list = document.createElement("ul");
			list.className = "report-feedback";
			for (const p of hints) {
				const li = document.createElement("li");
				li.textContent = TEXT.history.startedHint(
					p.name,
					p.recent.started,
					p.recent.of,
				);
				list.append(li);
			}
			players.append(list);
		}
		results.append(players);

		const lines = LINE_ORDER.filter((id) =>
			history.players.some((p) => (p.zoneSeconds[id] ?? 0) > 0),
		);
		const positions = card("Minuter per position");
		positions.append(
			table(
				["Spelare", ...lines.map(lineName)],
				history.players.map((p) => [
					p.name,
					...lines.map((id) => TEXT.history.minutes(p.zoneSeconds[id] ?? 0)),
				]),
			),
		);
		results.append(positions);

		const months = card("Månad för månad");
		months.append(
			table(
				["Spelare", ...history.months.map(TEXT.history.month)],
				history.players.map((p) => [
					p.name,
					...history.months.map((month) =>
						TEXT.history.minutes(
							p.months.find((m) => m.month === month)?.seconds ?? 0,
						),
					),
				]),
			),
		);
		results.append(months);
		results.append(buildSeasonReportCard(history));

		results.append(buildVisualizationCard(history));

		results.append(
			buildPlayerNotesCard(
				history,
				map,
				selectedPlayerKey,
				(key) => {
					selectedPlayerKey = key;
					refresh();
				},
				refresh,
			),
		);
	}

	input.addEventListener("change", async () => {
		const files = [...(input.files ?? [])];
		input.value = "";
		messages.replaceChildren();
		const parsed: MatchFile[] = [];
		for (const file of files) {
			const li = document.createElement("li");
			try {
				parsed.push(parseMatchFile(JSON.parse(await file.text())));
				continue;
			} catch (err) {
				li.textContent = TEXT.history.refused(
					file.name,
					err instanceof MatchFileError
						? TEXT.history.problem(err.problem)
						: TEXT.history.unreadable,
				);
				li.classList.add("error");
			}
			messages.append(li);
		}
		if (parsed.length > 0) {
			const { newMatches, alreadyKnown } = keepMatchFiles(parsed);
			const li = document.createElement("li");
			li.textContent = TEXT.history.importResult(newMatches, alreadyKnown);
			messages.prepend(li);
		}
		refresh();
	});

	setUpDriveBackup(refresh);
	setUpSecureExport(refresh);

	return { refresh };
}
