import { DEFAULT_FORMAT } from "../core/formations.js";
import {
	parseRosterFile,
	type RosterFile,
	rosterToJson,
	serializeRoster,
} from "../core/storage.js";
import { readItem, STORAGE_KEYS, writeItem } from "./appStorage.js";

/** A new squad: no players, the default format and its default minutes. */
export function emptyDraft(): RosterFile {
	return serializeRoster(
		DEFAULT_FORMAT.id,
		DEFAULT_FORMAT.defaultRotationSeconds,
		[],
	);
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
