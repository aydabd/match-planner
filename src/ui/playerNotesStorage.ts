import {
	EMPTY_PLAYER_NOTES_FILE,
	type PlayerNotesFile,
	parsePlayerNotesFile,
	playerNotesFileToJson,
} from "../core/playerNotes.js";
import { readItem, STORAGE_KEYS, teamScoped, writeItem } from "./appStorage.js";
import { activeTeamId } from "./teamStorage.js";

/** The saved player notes, or an empty file if there are none or it's damaged. */
export function loadPlayerNotes(): PlayerNotesFile {
	const raw = readItem(teamScoped(STORAGE_KEYS.playerNotes, activeTeamId()));
	if (!raw) return EMPTY_PLAYER_NOTES_FILE;
	try {
		return parsePlayerNotesFile(JSON.parse(raw));
	} catch {
		return EMPTY_PLAYER_NOTES_FILE;
	}
}

export function savePlayerNotes(file: PlayerNotesFile): void {
	writeItem(
		teamScoped(STORAGE_KEYS.playerNotes, activeTeamId()),
		playerNotesFileToJson(file),
	);
}
