/**
 * The only module that touches the browser's localStorage. It lists every key
 * the app saves, so "clear all saved data" can never miss one, and it absorbs
 * storage errors (private browsing, quota, disabled storage): the app keeps
 * working for the current tab, it just won't remember across reloads.
 */

/** Every key the app saves. Bump the version suffix if a value's shape changes. */
export const STORAGE_KEYS = {
	/** The squad being set up on the setup screen. */
	draft: "matchplanner:draft:v1",
	/** The match in progress, so a reload resumes it. */
	session: "matchplanner:session:v1",
	/** The coach's name, recorded in files they save. */
	coachName: "matchplanner:coach:v1",
	/** Reports of the last finished matches, newest first. */
	reports: "matchplanner:reports:v1",
	/** Match files of the matches played and imported, for the history. */
	matches: "matchplanner:matches:v1",
	/** Availability and development notes per player, for the history (#58). */
	playerNotes: "matchplanner:playerNotes:v1",
	/** Drive folder id chosen via the Picker for backup/restore (#70). */
	driveFolderId: "matchplanner:driveFolderId:v1",
	/** That folder's display name, so the coach can see where it is (#70). */
	driveFolderName: "matchplanner:driveFolderName:v1",
	/** The teams a coach runs, and which one is active (#118). Not itself
	 * team-scoped - it is the list teamScoped() needs a team id from. */
	teams: "matchplanner:teams:v1",
} as const;

// Deliberately absent from STORAGE_KEYS, and never written to localStorage:
// the Drive backup password (#81). It lives only in memory for the length
// of one backup/restore call - see driveBackup.ts.

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * Every key that holds one team's own data (#118): everything except
 * coachName (the coach's own identity, not a team's) and teams (the list of
 * teams itself, read before a team id is even known).
 */
const TEAM_SCOPED_KEYS: readonly StorageKey[] = [
	STORAGE_KEYS.draft,
	STORAGE_KEYS.session,
	STORAGE_KEYS.reports,
	STORAGE_KEYS.matches,
	STORAGE_KEYS.playerNotes,
	STORAGE_KEYS.driveFolderId,
	STORAGE_KEYS.driveFolderName,
];

/**
 * `key`, scoped to one team: two teams never read or write each other's
 * draft, matches, player notes, session, reports or Drive folder choice.
 */
export function teamScoped(key: StorageKey, teamId: string): string {
	return `${key}:${teamId}`;
}

/** The saved value, or null if there is none or storage is unavailable. */
export function readItem(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function writeItem(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Not fatal: the in-memory state still works for this tab.
	}
}

export function removeItem(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		// Nothing saved, or storage unavailable: either way it is gone.
	}
}

/**
 * Remove everything the app has saved, leaving other sites' data alone.
 * `teamIds` must list every team the coach has (teamStorage.ts's
 * listTeams()), so every team's scoped data is cleared, not just the
 * active one's.
 */
export function clearAppData(teamIds: readonly string[]): void {
	removeItem(STORAGE_KEYS.coachName);
	removeItem(STORAGE_KEYS.teams);
	for (const teamId of teamIds) {
		for (const key of TEAM_SCOPED_KEYS) removeItem(teamScoped(key, teamId));
	}
}

/** Prefix of the offline caches this app's service worker creates. */
export const CACHE_PREFIX = "matchplanner-v";
/** The cache name used before caches were named after the app version. */
export const LEGACY_CACHE_NAMES: readonly string[] = ["fotbollsbyten-v1"];

/** The offline cache for one app version, e.g. "matchplanner-v0.4.0". */
export function cacheName(version: string): string {
	return `${CACHE_PREFIX}${version}`;
}

/**
 * Whether a cache belongs to this app. Every aydabd.github.io site shares one
 * browser origin, so only these may ever be deleted.
 */
export function isOwnCache(name: string): boolean {
	return (
		(name.startsWith(CACHE_PREFIX) && name.length > CACHE_PREFIX.length) ||
		LEGACY_CACHE_NAMES.includes(name)
	);
}
