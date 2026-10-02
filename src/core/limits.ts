/**
 * Every numeric limit the app enforces, defined once. Core validation, the
 * setup and match screens, and HTML attributes all read from here, so a
 * squad the setup screen accepts can always be saved and loaded again.
 */
export const LIMITS = {
	/** Allowed minutes between whole-team swaps. */
	rotationMinutes: { min: 1, max: 30 },
	/** Allowed number of periods in a match. */
	periods: { min: 1, max: 4 },
	/** Allowed minutes per period. */
	periodMinutes: { min: 5, max: 45 },
	/** Longest player name kept, in characters. */
	playerNameLength: 40,
	/** Longest coach name recorded in saved files, in characters. */
	coachNameLength: 40,
	/** Longest opponent, venue or date text in match details. */
	matchDetailLength: 60,
	/** Most players in one squad, on the setup screen and in squad files. */
	squadSize: 30,
	/** Rest lengths offered for a temporary swap, in seconds. */
	tempSwapSeconds: [60, 120, 300],
	/** How long before a due swap the coach sees who swaps with whom. */
	headsUpSeconds: 30,
	/** A short rest is pointed out for this long after the player came on. */
	restNoticeSeconds: 60,
	/** Match reports kept on this device; the oldest is dropped first. */
	storedReports: 10,
	/** Most events one match file may hold. */
	timelineEvents: 5000,
	/** Most match files kept on this device. */
	storedMatches: 200,
	/** "Has started 2 of the last N matches" looks back this many matches. */
	recentMatches: 8,
	/** How long "tap again to reset" stays armed, in seconds. */
	resetConfirmSeconds: 3,
	/** Longest free-text note a coach writes about a player, in characters. */
	playerNoteLength: 500,
	/** Most development notes kept per player; the oldest is dropped first. */
	developmentNotesPerPlayer: 200,
	/** Longest team/squad name, in characters (#118). */
	teamNameLength: 40,
	/** Largest file read from Google Drive, in bytes (#147); a bigger one is ignored. */
	driveFileBytes: 5 * 1024 * 1024,
	/** Shortest password accepted when one is first set, in characters (#147). */
	minPasswordLength: 10,
} as const;

/**
 * A whole number from what the coach typed, rounded and kept within `range`.
 * Anything that is not a number keeps `current` instead of guessing.
 */
export function numberWithin(
	input: string,
	range: { min: number; max: number },
	current: number,
): number {
	const value = Number.parseFloat(input);
	if (!Number.isFinite(value)) return current;
	return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

/**
 * Seconds between swaps from what the coach typed, in half-minute steps and
 * within LIMITS.rotationMinutes. Works in seconds throughout (not minutes,
 * then multiplied) so a value already on a half minute - like 450s (7.5
 * min) - round-trips exactly instead of being rounded away when re-read.
 */
export function rotationSecondsFrom(input: string, current: number): number {
	const value = Number.parseFloat(input);
	if (!Number.isFinite(value)) return current;
	const halfMinutes = Math.round(value * 2);
	const seconds = (halfMinutes / 2) * 60;
	const min = LIMITS.rotationMinutes.min * 60;
	const max = LIMITS.rotationMinutes.max * 60;
	return Math.min(max, Math.max(min, seconds));
}
