import { DEFAULT_FORMAT } from "../core/formations.js";
import {
	newRoster,
	parseRosterFile,
	type RosterFile,
	rosterToJson,
} from "../core/storage.js";
import { readItem, STORAGE_KEYS, teamScoped, writeItem } from "./appStorage.js";
import { activeTeamId } from "./teamStorage.js";

/** A new squad: no players, the default format and its default minutes. */
export function emptyDraft(): RosterFile {
	return newRoster({ formatId: DEFAULT_FORMAT.id });
}

/** Load the saved draft, or an empty squad if there is none or it is unreadable. */
export function loadDraft(): RosterFile {
	const raw = readItem(teamScoped(STORAGE_KEYS.draft, activeTeamId()));
	if (raw) {
		try {
			return parseRosterFile(JSON.parse(raw), { allowEmptySquad: true });
		} catch {
			// unreadable draft: fall through to a fresh default below
		}
	}
	return emptyDraft();
}

export function saveDraft(roster: RosterFile): void {
	writeItem(
		teamScoped(STORAGE_KEYS.draft, activeTeamId()),
		rosterToJson(roster),
	);
}
