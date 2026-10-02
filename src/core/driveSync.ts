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
 * there is nothing to race. Each team has a subfolder of its own in the
 * coach's root folder, with a team marker file in it, and a team is never
 * mixed with another's (#135, #142).
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

/** A team's subfolder in the root folder, by team id and Drive id. */
export interface TeamFolder {
	teamId: string;
	folderId: string;
}

export type TeamFolderChoice =
	| { action: "none" }
	| { action: "use"; folderId: string }
	| { action: "adopt"; teamId: string; folderId: string }
	| { action: "choose"; teams: TeamFolder[] }
	| { action: "refuse"; reason: "otherTeam" | "belongsToOtherLocalTeam" };

/**
 * Which team subfolder of the root to restore from (#142). This team's own
 * folder wins whatever else is in the root. Without one, a team that has
 * data is refused (restoring another team's files would mix two teams);
 * an empty team may take on a team from the root - straight away when
 * there is one, by the coach's choice when there are several. A team that
 * another team on this device already has is never offered, since adopting
 * it would merge two teams. Two folders for the same team (made at the same
 * moment) count as one, the same one every time.
 */
export function chooseTeamFolder(input: {
	localTeamId: string;
	localIsEmpty: boolean;
	otherLocalTeamIds: readonly string[];
	folders: readonly TeamFolder[];
}): TeamFolderChoice {
	const byTeam = new Map<string, TeamFolder>();
	for (const folder of [...input.folders].sort((x, y) =>
		x.folderId < y.folderId ? -1 : x.folderId > y.folderId ? 1 : 0,
	)) {
		if (!byTeam.has(folder.teamId)) byTeam.set(folder.teamId, folder);
	}
	const own = byTeam.get(input.localTeamId);
	if (own) return { action: "use", folderId: own.folderId };
	if (byTeam.size === 0) return { action: "none" };
	if (!input.localIsEmpty) return { action: "refuse", reason: "otherTeam" };
	const candidates = [...byTeam.values()]
		.filter((folder) => !input.otherLocalTeamIds.includes(folder.teamId))
		.sort((x, y) => (x.teamId < y.teamId ? -1 : x.teamId > y.teamId ? 1 : 0));
	const [only] = candidates;
	if (only === undefined) {
		return { action: "refuse", reason: "belongsToOtherLocalTeam" };
	}
	if (candidates.length === 1) {
		return { action: "adopt", teamId: only.teamId, folderId: only.folderId };
	}
	return { action: "choose", teams: candidates };
}
