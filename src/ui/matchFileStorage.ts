import { mergeMatchFiles } from "../core/history.js";
import {
	type MatchFile,
	matchFileToJson,
	parseMatchFile,
} from "../core/matchFile.js";
import { readItem, STORAGE_KEYS, teamScoped, writeItem } from "./appStorage.js";
import { activeTeamId } from "./teamStorage.js";

function writeMatchFiles(teamId: string, files: readonly MatchFile[]): void {
	writeItem(
		teamScoped(STORAGE_KEYS.matches, teamId),
		JSON.stringify(files.map((f) => JSON.parse(matchFileToJson(f)))),
	);
}

/**
 * The kept match files of `teamId` (the active team unless given), oldest
 * first. A damaged entry is left out.
 */
export function loadMatchFiles(teamId: string = activeTeamId()): MatchFile[] {
	const raw = readItem(teamScoped(STORAGE_KEYS.matches, teamId));
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.flatMap((entry) => {
			try {
				return [parseMatchFile(entry)];
			} catch {
				return [];
			}
		});
	} catch {
		return [];
	}
}

/**
 * Keep match files on this device. A match that is already kept is not added
 * again (mergeMatchFiles). Returns how many were new.
 */
export function keepMatchFiles(added: readonly MatchFile[]): {
	newMatches: number;
	alreadyKnown: number;
} {
	const { files, newMatches, alreadyKnown } = mergeMatchFiles(
		loadMatchFiles(),
		added,
	);
	writeMatchFiles(activeTeamId(), files);
	return { newMatches, alreadyKnown };
}

/**
 * Put `file` in place of the kept file for the same match, as it is: unlike
 * keepMatchFiles nothing is merged, so a changed note replaces the old one.
 * Returns false if no file for that match is kept.
 */
export function replaceMatchFile(teamId: string, file: MatchFile): boolean {
	const files = loadMatchFiles(teamId);
	const index = files.findIndex((f) => f.audit.matchId === file.audit.matchId);
	if (index === -1) return false;
	files[index] = file;
	writeMatchFiles(teamId, files);
	return true;
}
