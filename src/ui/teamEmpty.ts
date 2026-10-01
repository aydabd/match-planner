import { loadDraft } from "./draftStorage.js";
import { loadMatchFiles } from "./matchFileStorage.js";
import { loadPlayerNotes } from "./playerNotesStorage.js";

/**
 * Whether the active team has nothing saved: no match, no player notes and
 * no squad (#135). Only such a team may take on the team id a Drive folder
 * belongs to; one with data would be mixed into another team's.
 */
export function activeTeamIsEmpty(): boolean {
	return (
		loadMatchFiles().length === 0 &&
		loadPlayerNotes().players.length === 0 &&
		loadDraft().players.length === 0
	);
}
