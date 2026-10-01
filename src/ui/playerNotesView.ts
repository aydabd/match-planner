import {
	DEVELOPMENT_AREAS as AREAS,
	currentLevel,
} from "../core/developmentCheckpoints.js";
import type { TeamSizeId } from "../core/formations.js";
import {
	matchesForPlayer,
	type PlayerHistory,
	type SeasonHistory,
} from "../core/history.js";
import { LIMITS } from "../core/limits.js";
import type { PlayerIdMap } from "../core/playerIdentity.js";
import {
	type AbsenceReason,
	type AvailabilityEntry,
	type AvailabilityStatus,
	type DevelopmentArea,
	type PlayerNotesFile,
	seasonFeedback,
	withAvailability,
	withCheckpoint,
	withCheckpointUndone,
	withDevelopment,
} from "../core/playerNotes.js";
import { confirmWithSecondTap } from "./confirmButton.js";
import { byId, card, field, selectField } from "./domHelpers.js";
import { loadSeasonData } from "./historyData.js";
import { loadMatchFiles } from "./matchFileStorage.js";
import { loadPlayerNotes, savePlayerNotes } from "./playerNotesStorage.js";
import { TEXT } from "./text.js";

/** Which of the reason keys TEXT.history.playerNotes.reason declares. */
const REASONS: readonly AbsenceReason[] = ["injury", "illness", "other"];

/** A ladder as steps, the reached ones marked done. */
function checkpointLadderList(
	labels: readonly string[],
	level: number,
): HTMLOListElement {
	const list = document.createElement("ol");
	list.className = "checkpoint-ladder";
	labels.forEach((label, index) => {
		const li = document.createElement("li");
		li.textContent = label;
		if (index < level) li.classList.add("done");
		list.append(li);
	});
	return list;
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
 * The checkpoint ladders (#109): per area, the labels as steps and a single
 * "next level" button - no numbers to type, and nothing here ever shows or
 * reads another player's progress.
 */
function buildCheckpointField(
	notes: PlayerNotesFile,
	player: PlayerHistory,
	teamSize: TeamSizeId,
	onSaved: () => void,
): HTMLElement {
	const t = TEXT.history.playerNotes;
	const section = document.createElement("div");
	section.className = "field-stack";
	const heading = document.createElement("h3");
	heading.textContent = t.checkpointTitle;
	section.append(heading);

	const own = notes.players.find((p) => p.key === player.key);
	for (const area of AREAS) {
		const labels = t.checkpointLadders[teamSize][area];
		const level = currentLevel(own?.checkpoints ?? [], area);
		const areaWrap = document.createElement("div");
		areaWrap.className = "checkpoint-area";
		const areaHeading = document.createElement("h4");
		areaHeading.textContent = t.area[area];
		areaWrap.append(areaHeading, checkpointLadderList(labels, level));

		const buttonRow = document.createElement("div");
		buttonRow.className = "row-buttons";

		const button = document.createElement("button");
		button.type = "button";
		button.className = "btn btn-secondary";
		const maxed = level >= labels.length;
		button.textContent = maxed ? t.maxLevelReached : t.nextLevel;
		button.disabled = maxed;
		button.addEventListener("click", () => {
			savePlayerNotes(
				withCheckpoint(
					loadPlayerNotes(),
					player.key,
					area,
					level + 1,
					new Date().toISOString().slice(0, 10),
				),
			);
			onSaved();
		});
		buttonRow.append(button);

		// A level marked by mistake needs a way back (#120); a second tap
		// guards against undoing by mistake too, same as elsewhere in the app.
		const undoButton = document.createElement("button");
		undoButton.type = "button";
		undoButton.className = "btn btn-secondary";
		undoButton.textContent = t.undoLevel;
		undoButton.disabled = level === 0;
		confirmWithSecondTap(undoButton, {
			confirmLabel: t.confirmUndoLevel,
			onConfirm: () => {
				savePlayerNotes(
					withCheckpointUndone(loadPlayerNotes(), player.key, area),
				);
				onSaved();
			},
		});
		buttonRow.append(undoButton);

		areaWrap.append(buttonRow);
		section.append(areaWrap);
	}
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
	teamSize: TeamSizeId,
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
			buildCheckpointField(notes, player, teamSize, onSaved),
		);
	}
	return section;
}

/**
 * The player notes page (#119): availability, free-text development notes
 * and the checkpoint field, for one chosen player. The only place a
 * player's checkpoints are shown - the read-only copy that used to sit in
 * the Översikt card is gone.
 */
export function createPlayerNotesView(): { refresh: () => void } {
	let selectedPlayerKey: string | null = null;

	async function refresh(): Promise<void> {
		const { history, map, teamSize } = await loadSeasonData();
		byId("historyCount").textContent =
			history.matches === 0 ? TEXT.history.empty : "";
		const results = byId("historyResults");
		results.replaceChildren();
		if (history.matches === 0) return;
		results.append(
			buildPlayerNotesCard(
				history,
				map,
				teamSize,
				selectedPlayerKey,
				(key) => {
					selectedPlayerKey = key;
					refresh();
				},
				refresh,
			),
		);
	}
	return { refresh };
}
