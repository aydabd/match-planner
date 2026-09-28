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

/** Minutes between swaps from what the coach typed, within LIMITS. */
export function rotationMinutesFrom(input: string, current: number): number {
	return numberWithin(input, LIMITS.rotationMinutes, current);
}
