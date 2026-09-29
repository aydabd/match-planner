import type { MatchFile } from "./matchFile.js";

/**
 * Backup to the coach's own (or a team's shared - #70) Google Drive: match
 * files are immutable once played (one file per matchId, never edited
 * afterwards), so syncing them needs no conflict resolution - only "is this
 * match already backed up" and "is this backed-up match already kept
 * locally".
 *
 * This used to be answered by a manifest.json file every device would
 * read-modify-write - which races under concurrent writers: two coaches
 * syncing close together could each save a manifest missing the other's
 * newest entry, silently orphaning an uploaded file. Answering it instead
 * from a listing of the Drive folder's own files removes the shared
 * mutable state entirely: every upload is one independent, immutable file
 * nobody else ever writes to, so there is nothing to race.
 *
 * This module is pure planning: it decides what to upload or download from
 * a listing already fetched. The actual Drive `files.list` call and
 * Google sign-in live in src/ui, same split as everywhere else in
 * src/core (no DOM, no network).
 */

/** One match file already present in the Drive folder. */
export interface DriveFileEntry {
	matchId: string;
	fileId: string;
}

/** Local match files with no file in the Drive folder yet: these need uploading. */
export function matchesToBackUp(
	local: readonly MatchFile[],
	remote: readonly DriveFileEntry[],
): MatchFile[] {
	const remoteIds = new Set(remote.map((entry) => entry.matchId));
	return local.filter((file) => !remoteIds.has(file.audit.matchId));
}

/** Drive files for matches not kept locally, with their Drive file id. */
export function matchesToRestore(
	remote: readonly DriveFileEntry[],
	localMatchIds: ReadonlySet<string>,
): DriveFileEntry[] {
	return remote.filter((entry) => !localMatchIds.has(entry.matchId));
}
