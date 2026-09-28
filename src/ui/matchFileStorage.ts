import { mergeMatchFiles } from "../core/history.js";
import {
	type MatchFile,
	matchFileToJson,
	parseMatchFile,
} from "../core/matchFile.js";
import { readItem, STORAGE_KEYS, writeItem } from "./appStorage.js";

/** The kept match files, oldest first. A damaged entry is left out. */
export function loadMatchFiles(): MatchFile[] {
	const raw = readItem(STORAGE_KEYS.matches);
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
	writeItem(
		STORAGE_KEYS.matches,
		JSON.stringify(files.map((f) => JSON.parse(matchFileToJson(f)))),
	);
	return { newMatches, alreadyKnown };
}
