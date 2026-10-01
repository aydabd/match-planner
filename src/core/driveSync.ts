import { parseDriveFileName } from "./driveNames.js";
import type { MatchFile } from "./matchFile.js";
import type { RosterFile } from "./storage.js";

/**
 * Backup to the coach's own (or a team's shared - #70) Google Drive.
 *
 * Match files are immutable once played (one file per match, never edited
 * afterwards), so syncing them needs no conflict resolution - only "is this
 * match already backed up" and "is this backed-up match already kept
 * locally". Player notes and the squad are not immutable, so every device
 * writes only its own notes and squad files (names built from the device
 * id, see driveNames.ts) and restore folds all of them together
 * (notesMerge.ts): nobody ever overwrites a file another device writes, so
 * there is nothing to race. A folder belongs to exactly one team, shown by
 * a team marker file, and is never mixed with another team's (#135).
 *
 * This module is pure planning: it decides what to upload or download from
 * a listing already fetched. The actual Drive `files.list` call and
 * Google sign-in live in src/ui, same split as everywhere else in
 * src/core (no DOM, no network).
 */

/** One file in the Drive folder, by name and Drive id. */
export interface DriveFileEntry {
	name: string;
	fileId: string;
}

/** A team marker file: which team a folder holds, and its Drive id. */
export interface FolderMarker {
	teamId: string;
	fileId: string;
}

export interface FolderListing {
	matches: DriveFileEntry[];
	notes: DriveFileEntry[];
	squads: DriveFileEntry[];
	markers: FolderMarker[];
}

/** The folder's files by kind. Files this app did not write are ignored. */
export function classifyFolder(
	entries: readonly DriveFileEntry[],
): FolderListing {
	const listing: FolderListing = {
		matches: [],
		notes: [],
		squads: [],
		markers: [],
	};
	for (const entry of entries) {
		const parsed = parseDriveFileName(entry.name);
		if (parsed === null) continue;
		if (parsed.kind === "team") {
			listing.markers.push({ teamId: parsed.id, fileId: entry.fileId });
		} else if (parsed.kind === "match") {
			listing.matches.push(entry);
		} else if (parsed.kind === "notes") {
			listing.notes.push(entry);
		} else {
			listing.squads.push(entry);
		}
	}
	return listing;
}

/** Local matches (by their Drive file name) with no file in the folder yet. */
export function matchesToBackUp(
	localByName: ReadonlyMap<string, MatchFile>,
	remoteNames: ReadonlySet<string>,
): MatchFile[] {
	return [...localByName]
		.filter(([name]) => !remoteNames.has(name))
		.map(([, file]) => file);
}

/** Drive files whose name no local match has: these need downloading. */
export function filesToRestore(
	remote: readonly DriveFileEntry[],
	localNames: ReadonlySet<string>,
): DriveFileEntry[] {
	return remote.filter((entry) => !localNames.has(entry.name));
}

export type FolderDecision =
	| { action: "claim" }
	| { action: "use" }
	| { action: "adopt"; teamId: string }
	| {
			action: "refuse";
			reason: "severalTeams" | "otherTeam" | "belongsToOtherLocalTeam";
	  };

/**
 * Whose folder this is, from its team marker files. A folder with no marker
 * can be claimed by this team; one marked with this team's id is used; one
 * marked with another team's id is adopted (the device takes that team's
 * id) only when this device's team is still empty and no other team on the
 * device already has that id. Everything else is refused, so two teams
 * never share a folder.
 */
export function decideFolder(input: {
	localTeamId: string;
	localIsEmpty: boolean;
	otherLocalTeamIds: readonly string[];
	markers: readonly FolderMarker[];
}): FolderDecision {
	const ids = [...new Set(input.markers.map((m) => m.teamId))];
	if (ids.length === 0) return { action: "claim" };
	if (ids.length > 1) return { action: "refuse", reason: "severalTeams" };
	const [folderTeam] = ids as [string];
	if (folderTeam === input.localTeamId) return { action: "use" };
	if (input.otherLocalTeamIds.includes(folderTeam)) {
		return { action: "refuse", reason: "belongsToOtherLocalTeam" };
	}
	if (!input.localIsEmpty) return { action: "refuse", reason: "otherTeam" };
	return { action: "adopt", teamId: folderTeam };
}

/**
 * The squad to restore from several devices' squads: the one saved most
 * recently, and where that ties (or no time was saved) the one that sorts
 * last as JSON, so every device picks the same squad whatever order the
 * files arrive in.
 */
export function pickSquad(rosters: readonly RosterFile[]): RosterFile | null {
	let best: RosterFile | null = null;
	let bestKey = "";
	for (const roster of rosters) {
		const key = `${roster.audit?.createdAt ?? ""}\u0000${JSON.stringify(roster)}`;
		if (best === null || key > bestKey) {
			best = roster;
			bestKey = key;
		}
	}
	return best;
}
