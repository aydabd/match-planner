import {
	EXPORT_BUNDLE_VERSION,
	type ExportBundle,
	parseExportBundle,
} from "../core/exportBundle.js";
import type { PlayerHistory, SeasonHistory } from "../core/history.js";
import { LIMITS } from "../core/limits.js";
import {
	type MatchFile,
	MatchFileError,
	parseMatchFile,
} from "../core/matchFile.js";
import {
	decryptJson,
	encryptJson,
	parseSecurePackage,
	SecurePackageError,
	securePackageToJson,
} from "../core/securePackage.js";
import {
	monthlyMinutes,
	recentStartFrequency,
} from "../core/visualizations.js";
import { readItem, STORAGE_KEYS, teamScoped, writeItem } from "./appStorage.js";
import { confirmWithSecondTap } from "./confirmButton.js";
import { byId, card, downloadJson, table } from "./domHelpers.js";
import { loadDraft, saveDraft } from "./draftStorage.js";
import { createDriveAuth } from "./driveAuth.js";
import { createDriveBackup, DriveFolderError } from "./driveBackup.js";
import { createDriveClient } from "./driveClient.js";
import {
	DRIVE_APP_ID,
	DRIVE_CLIENT_ID,
	DRIVE_PICKER_API_KEY,
	DRIVE_SCOPE,
} from "./driveConfig.js";
import { pickFolder } from "./drivePicker.js";
import { loadSeasonData } from "./historyData.js";
import { keepMatchFiles, loadMatchFiles } from "./matchFileStorage.js";
import { loadPlayerNotes, savePlayerNotes } from "./playerNotesStorage.js";
import { lineName } from "./reportText.js";
import { activeTeamId } from "./teamStorage.js";
import { TEXT } from "./text.js";

/** The lines in the order a coach reads them: goal, then back to attack. */
const LINE_ORDER = ["goal", "back", "dmid", "mid", "amid", "fwd"];

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
	svg.append(svgText(TEXT.history.visualizations.axisMinutes, left, 12));

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
	const top = 20;
	const rowHeight = 28;
	const barWidth = width - left - 34;
	const height = top + model.length * rowHeight;
	const svg = svgNode("svg") as SVGSVGElement;
	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	svg.setAttribute("role", "img");
	svg.setAttribute(
		"aria-label",
		TEXT.history.visualizations.startFrequency(LIMITS.recentMatches),
	);
	svg.append(svgText(TEXT.history.visualizations.axisPercent, left, 12));

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
	startsHeading.textContent = t.startFrequency(LIMITS.recentMatches);
	starts.append(startsHeading, startFrequencyChart(history));
	section.append(starts);
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

	/** The sentence for why a backup or restore did not go through. */
	function driveFailure(err: unknown): string {
		if (err instanceof SecurePackageError) return t.wrongPassword;
		if (err instanceof DriveFolderError) return t.folderRefused[err.reason];
		return t.failed;
	}

	const auth = createDriveAuth(DRIVE_CLIENT_ID, DRIVE_SCOPE);
	const backup = createDriveBackup(createDriveClient(() => auth.accessToken()));

	function showFolder(id: string, name: string): void {
		writeItem(teamScoped(STORAGE_KEYS.driveFolderId, activeTeamId()), id);
		writeItem(teamScoped(STORAGE_KEYS.driveFolderName, activeTeamId()), name);
		folderLink.textContent = name;
		folderLink.href = `https://drive.google.com/drive/folders/${id}`;
		folderStatus.hidden = false;
		chooseFolderBtn.textContent = t.changeFolder;
		passwordField.hidden = false;
		backupBtn.hidden = false;
		restoreBtn.hidden = false;
	}

	const storedFolderId = readItem(
		teamScoped(STORAGE_KEYS.driveFolderId, activeTeamId()),
	);
	const storedFolderName = readItem(
		teamScoped(STORAGE_KEYS.driveFolderName, activeTeamId()),
	);
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
				const currentName = readItem(
					teamScoped(STORAGE_KEYS.driveFolderName, activeTeamId()),
				);
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
		return readItem(teamScoped(STORAGE_KEYS.driveFolderId, activeTeamId()));
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
			const { uploaded, stateSaved } = await backup.backup(
				folderId,
				passwordInput.value,
			);
			status.textContent = t.backedUp(uploaded, stateSaved);
		} catch (err) {
			status.textContent = driveFailure(err);
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
			const result = await backup.restore(folderId, passwordInput.value);
			status.textContent = t.restored(result);
			refresh();
		} catch (err) {
			status.textContent = driveFailure(err);
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
					// ExportBundleError only happens after decryptJson already
					// succeeded - the password was right and the file was not
					// tampered with, it just isn't a valid export bundle (the
					// coach picked a different encrypted file by mistake).
					// "wrong password" would send them chasing a problem that
					// isn't there.
					status.textContent =
						err instanceof SecurePackageError ? t.wrongPassword : t.unreadable;
				} finally {
					pendingFile = null;
					fileInput.value = "";
					importBtn.disabled = true;
				}
			})();
		},
	});
}
/**
 * The statistics page: import match files, then per player starts, minutes,
 * minutes per position and month by month, the two comparative charts, and
 * the backup and export cards. Every number comes from core/history.ts,
 * which computes it from the match files' timelines. (The season report and
 * per-player notes have their own pages, #119.)
 */
export function createStatisticsView(): { refresh: () => void } {
	const messages = byId("historyMessages");
	const input = byId("historyImportInput") as HTMLInputElement;

	// refresh() is async and called again by every import, restore and the
	// first render; only the newest call may draw, or a slow earlier one
	// (started before an import) would overwrite the fresh result.
	let latestRender = 0;

	async function refresh(): Promise<void> {
		const thisRender = ++latestRender;
		const { history } = await loadSeasonData();
		if (thisRender !== latestRender) return;
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

		results.append(buildVisualizationCard(history));
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
