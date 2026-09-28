import { DEFAULT_FORMAT } from "../core/formations.js";
import {
	newRoster,
	parseRosterFile,
	type RosterFile,
	rosterToJson,
} from "../core/storage.js";
import { readItem, STORAGE_KEYS, writeItem } from "./appStorage.js";

/** A new squad: no players, the default format and its default minutes. */
export function emptyDraft(): RosterFile {
	return newRoster({ formatId: DEFAULT_FORMAT.id });
}

/** Load the saved draft, or an empty squad if there is none or it is unreadable. */
export function loadDraft(): RosterFile {
	const raw = readItem(STORAGE_KEYS.draft);
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
	writeItem(STORAGE_KEYS.draft, rosterToJson(roster));
}
