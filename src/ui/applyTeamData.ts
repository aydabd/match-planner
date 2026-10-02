import { pickSquad } from "../core/driveSync.js";
import { mergePlayerNotes } from "../core/notesMerge.js";
import type { TeamData } from "../core/teamData.js";
import { loadDraft, saveDraft } from "./draftStorage.js";
import { keepMatchFiles } from "./matchFileStorage.js";
import { loadPlayerNotes, savePlayerNotes } from "./playerNotesStorage.js";

export interface Applied {
	/** New matches kept on this device. */
	added: number;
	/** Whether the notes on this device changed. */
	notesChanged: boolean;
	/** Whether a squad was taken because the team had none. */
	squadTaken: boolean;
}

/**
 * Add a team's data to the active team (#154), shared by Drive restore and
 * file import so the two cannot drift apart. It only merges: matches are
 * de-duplicated by match id, notes are combined player by player, and a
 * squad is taken only when the team has none (the newest, see pickSquad).
 * Nothing already on the device is removed, so applying the same data twice
 * changes nothing the second time.
 */
export function applyTeamData(data: TeamData): Applied {
	let notes = loadPlayerNotes();
	const before = JSON.stringify(notes);
	for (const incoming of data.notes) notes = mergePlayerNotes(notes, incoming);
	const notesChanged = JSON.stringify(notes) !== before;
	if (notesChanged) savePlayerNotes(notes);

	const squad = pickSquad(data.squads);
	const squadTaken = squad !== null && loadDraft().players.length === 0;
	if (squadTaken && squad) saveDraft(squad);

	const { newMatches } = keepMatchFiles(data.matches);
	return { added: newMatches, notesChanged, squadTaken };
}
