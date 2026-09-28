import type { MatchFile } from "./matchFile.js";

/**
 * Backup to the coach's own Google Drive (#56): match files are immutable
 * once played (one file per matchId, never edited afterwards), so syncing
 * them needs no conflict resolution - only "is this match already backed
 * up" and "is this backed-up match already kept locally". The manifest is
 * the small index that answers both without listing every file in the
 * Drive folder on every sync.
 *
 * This module is pure planning and parsing: it decides what to upload or
 * download and reads/writes the manifest's shape. The actual Drive REST
 * calls and Google sign-in live in src/ui, same split as everywhere else in
 * src/core (no DOM, no network).
 */

/** The manifest kept as one JSON file in the coach's Drive backup folder. */
export interface DriveManifest {
	schemaVersion: 1;
	/** Drive file id of each backed-up match's JSON, by matchId. */
	files: Record<string, string>;
}

export const EMPTY_MANIFEST: DriveManifest = { schemaVersion: 1, files: {} };

export type DriveManifestProblem =
	| { code: "notObject" }
	| { code: "schemaVersion" }
	| { code: "files" };

export class DriveSyncError extends Error {
	constructor(
		message: string,
		readonly problem: DriveManifestProblem,
	) {
		super(message);
		this.name = "DriveSyncError";
	}
}

export function manifestToJson(manifest: DriveManifest): string {
	return JSON.stringify(manifest, null, 2);
}

/**
 * Parse and strictly validate a manifest read back from Drive: never trust
 * its shape, same discipline as parseRosterFile/parseMatchFile.
 */
export function parseManifest(data: unknown): DriveManifest {
	if (typeof data !== "object" || data === null) {
		throw new DriveSyncError("Manifest is not a JSON object", {
			code: "notObject",
		});
	}
	const obj = data as Record<string, unknown>;
	if (obj.schemaVersion !== 1) {
		throw new DriveSyncError(
			`Unknown or missing schemaVersion (expected 1, got ${JSON.stringify(obj.schemaVersion)})`,
			{ code: "schemaVersion" },
		);
	}
	if (
		typeof obj.files !== "object" ||
		obj.files === null ||
		Array.isArray(obj.files) ||
		Object.values(obj.files as Record<string, unknown>).some(
			(id) => typeof id !== "string",
		)
	) {
		throw new DriveSyncError("files must be an object of string Drive ids", {
			code: "files",
		});
	}
	return {
		schemaVersion: 1,
		files: { ...(obj.files as Record<string, string>) },
	};
}

/** A manifest with one more entry; the manifest given is left unchanged. */
export function withManifestEntry(
	manifest: DriveManifest,
	matchId: string,
	fileId: string,
): DriveManifest {
	return {
		schemaVersion: 1,
		files: { ...manifest.files, [matchId]: fileId },
	};
}

/** Local match files with no entry in the manifest yet: these need uploading. */
export function matchesToBackUp(
	local: readonly MatchFile[],
	manifest: DriveManifest,
): MatchFile[] {
	return local.filter((file) => !(file.audit.matchId in manifest.files));
}

/** Manifest entries for matches not kept locally, with their Drive file id. */
export function matchesToRestore(
	manifest: DriveManifest,
	localMatchIds: ReadonlySet<string>,
): { matchId: string; fileId: string }[] {
	return Object.entries(manifest.files)
		.filter(([matchId]) => !localMatchIds.has(matchId))
		.map(([matchId, fileId]) => ({ matchId, fileId }));
}
