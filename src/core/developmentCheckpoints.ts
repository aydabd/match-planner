import {
	DEFAULT_TEAM_SIZE,
	type TeamSizeId,
	teamSizeOf,
} from "./formations.js";

/**
 * Fixed, age-banded development checkpoints (#109): a small ladder per
 * team size and area that a coach marks a player through, one level at a
 * time. This is deliberately the only measurement of "development" in the
 * app - a single number per player, per area, never compared to any other
 * player. Team size (already chosen at squad setup, see formations.ts and
 * policy.ts's POLICY.formats) stands in for an age class: no new setup
 * field is added, since SvFF's own match formats already carry the ages.
 *
 * The ladders themselves - their Swedish labels and how many levels each
 * has - are UI text (src/ui/text.ts's TEXT.history.checkpoints.ladders),
 * not core logic: this module only knows the mechanism (an event is a
 * level reached on a date; the highest level reached wins), never the
 * words. Anything that needs "how many levels" (season report totals, the
 * per-player view) is handed that count by its caller rather than looking
 * it up here, so this file never needs Swedish text to compile.
 */

export type DevelopmentArea = "physical" | "mental" | "technical" | "tactical";

export const DEVELOPMENT_AREAS: readonly DevelopmentArea[] = [
	"physical",
	"mental",
	"technical",
	"tactical",
];

/** One level of one area marked reached, dated. */
export interface CheckpointEvent {
	area: DevelopmentArea;
	/** 1-based; what a level means is described in text.ts's ladders. */
	level: number;
	/** "YYYY-MM-DD". */
	date: string;
}

/** The highest level reached in `area`, or 0 if none. Never compares players. */
export function currentLevel(
	events: readonly CheckpointEvent[],
	area: DevelopmentArea,
): number {
	return events
		.filter((event) => event.area === area)
		.reduce((max, event) => Math.max(max, event.level), 0);
}

/**
 * `events` with `level` in `area` marked reached on `date`. Re-marking the
 * same level replaces its date instead of duplicating it. Does not mutate
 * `events`.
 */
export function withCheckpointReached(
	events: readonly CheckpointEvent[],
	area: DevelopmentArea,
	level: number,
	date: string,
): CheckpointEvent[] {
	return [
		...events.filter(
			(event) => !(event.area === area && event.level === level),
		),
		{ area, level, date },
	];
}

/**
 * `events` with the highest level in `area` removed (#120), so
 * `currentLevel` drops back to whatever was reached before it - a
 * coach's way to undo a level marked by mistake. A no-op, returning a
 * copy of `events`, when `area` has no levels to undo. Does not mutate
 * `events`.
 */
export function withCheckpointUndone(
	events: readonly CheckpointEvent[],
	area: DevelopmentArea,
): CheckpointEvent[] {
	const level = currentLevel(events, area);
	if (level === 0) return [...events];
	return events.filter(
		(event) => !(event.area === area && event.level === level),
	);
}

// Same strict date format as playerNotes.ts's development entries.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (value: string): boolean =>
	DATE.test(value) && !Number.isNaN(Date.parse(value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export function isValidCheckpointEvent(raw: unknown): raw is CheckpointEvent {
	if (!isRecord(raw)) return false;
	if (!DEVELOPMENT_AREAS.includes(raw.area as DevelopmentArea)) return false;
	if (
		typeof raw.level !== "number" ||
		!Number.isInteger(raw.level) ||
		raw.level < 1
	) {
		return false;
	}
	return typeof raw.date === "string" && isValidDate(raw.date);
}

/**
 * The team size that applies right now, from the latest-dated match's
 * formatId. A squad's team size in practice doesn't change mid-season, so
 * one value for the whole squad (not one per player) is deliberate, not a
 * shortcut. Falls back to DEFAULT_TEAM_SIZE when there are no matches yet.
 */
export function currentTeamSize(
	matches: readonly { formatId: string; date: string }[],
): TeamSizeId {
	if (matches.length === 0) return DEFAULT_TEAM_SIZE;
	const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
	const latest = sorted[sorted.length - 1] as {
		formatId: string;
		date: string;
	};
	return teamSizeOf(latest.formatId);
}
