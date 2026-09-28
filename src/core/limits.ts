/**
 * Every numeric limit the app enforces, defined once. Core validation, the
 * setup and match screens, and HTML attributes all read from here, so a
 * squad the setup screen accepts can always be saved and loaded again.
 */
export const LIMITS = {
	/** Allowed minutes between whole-team swaps. */
	rotationMinutes: { min: 1, max: 30 },
	/** Longest player name kept, in characters. */
	playerNameLength: 40,
	/** Most players in one squad, on the setup screen and in squad files. */
	squadSize: 30,
	/** Rest lengths offered for a temporary swap, in seconds. */
	tempSwapSeconds: [60, 120, 300],
} as const;

/**
 * Minutes between swaps from what the coach typed, rounded and kept within
 * LIMITS. Anything that is not a number keeps `current` instead of guessing.
 */
export function rotationMinutesFrom(input: string, current: number): number {
	const value = Number.parseFloat(input);
	if (!Number.isFinite(value)) return current;
	const { min, max } = LIMITS.rotationMinutes;
	return Math.min(max, Math.max(min, Math.round(value)));
}
