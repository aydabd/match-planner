import {
	parseRosterFile,
	type RosterFile,
	rosterToJson,
	serializeRoster,
} from "../core/storage.js";

/** The squad being set up on the setup screen, kept across reloads. */
const DRAFT_KEY = "matchplanner:draft:v1";

/** Load the saved draft, or an empty 7v7 squad if there is none or it is unreadable. */
export function loadDraft(): RosterFile {
	try {
		const raw = localStorage.getItem(DRAFT_KEY);
		if (raw) return parseRosterFile(JSON.parse(raw));
	} catch {
		// fall through to a fresh default below
	}
	return serializeRoster("7v7", 600, []);
}

export function saveDraft(roster: RosterFile): void {
	try {
		localStorage.setItem(DRAFT_KEY, rosterToJson(roster));
	} catch {
		// non-fatal - the in-memory draft still works for this session
	}
}
