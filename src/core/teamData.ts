import type { MatchFile } from "./matchFile.js";
import type { PlayerNotesFile } from "./playerNotes.js";
import type { RosterFile } from "./storage.js";

/** What one team's files hold, from Drive or from picked files (#154). */
export interface TeamData {
	matches: MatchFile[];
	notes: PlayerNotesFile[];
	squads: RosterFile[];
}
