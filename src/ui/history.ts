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
import { createDriveAuth } from "./driveAuth.js";
import { createDriveBackup } from "./driveBackup.js";
import { DRIVE_CLIENT_ID, DRIVE_SCOPE } from "./driveConfig.js";
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

/** Wires the "backup to Google Drive" card; hidden when no client id is set. */
function setUpDriveBackup(refresh: () => void): void {
	const card = byId("historyBackupCard");
	if (DRIVE_CLIENT_ID === "") return;
	card.hidden = false;

	const connectBtn = byId("driveConnectBtn") as HTMLButtonElement;
	const backupBtn = byId("driveBackupBtn") as HTMLButtonElement;
	const restoreBtn = byId("driveRestoreBtn") as HTMLButtonElement;
	const status = byId("driveStatus");
	const t = TEXT.history.drive;

	const auth = createDriveAuth(DRIVE_CLIENT_ID, DRIVE_SCOPE);
	const backup = createDriveBackup(auth);

	connectBtn.addEventListener("click", async () => {
		status.textContent = t.connecting;
		try {
			await auth.accessToken();
			connectBtn.hidden = true;
			backupBtn.hidden = false;
			restoreBtn.hidden = false;
			status.textContent = t.signedIn;
		} catch {
			status.textContent = t.signInFailed;
		}
	});

	backupBtn.addEventListener("click", async () => {
		status.textContent = t.backingUp;
		backupBtn.disabled = true;
		try {
			const { uploaded } = await backup.backup();
			status.textContent = t.backedUp(uploaded);
		} catch {
			status.textContent = t.failed;
		} finally {
			backupBtn.disabled = false;
		}
	});

	restoreBtn.addEventListener("click", async () => {
		status.textContent = t.restoring;
		restoreBtn.disabled = true;
		try {
			const { downloaded } = await backup.restore();
			status.textContent = t.restored(downloaded);
			refresh();
		} catch {
			status.textContent = t.failed;
		} finally {
			restoreBtn.disabled = false;
		}
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

/**
 * Availability, per match, for one player: pick a match, save whether they
 * were available or absent (with a reason). Calls `onSaved` after a save so
 * the caller can refresh - this module has no state of its own, per match
 * files and player notes are re-read fresh on every render.
 */
function buildAvailabilityField(
	notes: PlayerNotesFile,
	player: PlayerHistory,
	onSaved: () => void,
): HTMLElement {
	const t = TEXT.history.playerNotes;
	const section = document.createElement("div");
	section.className = "field-stack";
	const heading = document.createElement("h3");
	heading.textContent = t.availabilityTitle;
	section.append(heading);

	const matches = matchesForPlayer(loadMatchFiles(), player.key);
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
		savePlayerNotes(withAvailability(loadPlayerNotes(), player.name, entry));
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
			withDevelopment(loadPlayerNotes(), player.name, {
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
			buildAvailabilityField(notes, player, onSaved),
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

	function refresh(): void {
		const history = buildHistory(loadMatchFiles());
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

		results.append(
			buildPlayerNotesCard(
				history,
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

	return { refresh };
}
