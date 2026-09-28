/**
 * The match clock: periods (e.g. halves) and the swap timer, as pure data.
 * The UI ticks it once a second while the match is running; nothing here
 * knows about timers or the DOM.
 *
 * Rules:
 * - The clock only runs inside a period ("playing"). The coach can pause it
 *   (the UI simply stops ticking); a period end stops it by itself.
 * - A due swap does NOT stop the clock. The match goes on, players on the
 *   pitch keep earning minutes, and the swap timer counts how late the swap
 *   is until the new lineup actually goes on (lineupChanged).
 * - Each period starts with a fresh swap timer: the next lineup goes on at
 *   the start of the period, so no rotation is split across a break.
 */

export interface MatchPlan {
	periods: number;
	periodSeconds: number;
	/** Time between whole-team swaps. */
	rotationSeconds: number;
}

export type MatchPhase =
	| "beforeKickoff"
	| "playing"
	| "periodBreak"
	| "finished";

export interface MatchClock {
	phase: MatchPhase;
	/** Current period, from 1; during a break, the period that just ended. */
	period: number;
	/** Seconds played in the current period. */
	periodElapsed: number;
	/** Seconds since the current lineup went on. */
	rotationElapsed: number;
}

export type ClockEvent =
	| { type: "periodEnded"; period: number }
	| { type: "matchEnded"; period: number };

export const NEW_CLOCK: MatchClock = {
	phase: "beforeKickoff",
	period: 1,
	periodElapsed: 0,
	rotationElapsed: 0,
};

/** Start the first period. Does nothing once the match has started. */
export function kickoff(clock: MatchClock): MatchClock {
	return clock.phase === "beforeKickoff"
		? { ...clock, phase: "playing" }
		: clock;
}

/** One second of play. Only counts inside a period. */
export function tick(
	clock: MatchClock,
	plan: MatchPlan,
): { clock: MatchClock; events: ClockEvent[] } {
	if (clock.phase !== "playing") return { clock, events: [] };
	const next: MatchClock = {
		...clock,
		periodElapsed: clock.periodElapsed + 1,
		rotationElapsed: clock.rotationElapsed + 1,
	};
	if (next.periodElapsed < plan.periodSeconds)
		return { clock: next, events: [] };

	const events: ClockEvent[] = [{ type: "periodEnded", period: next.period }];
	if (next.period >= plan.periods) {
		events.push({ type: "matchEnded", period: next.period });
		return { clock: { ...next, phase: "finished" }, events };
	}
	return { clock: { ...next, phase: "periodBreak" }, events };
}

/** After a break: the next period starts at 00:00 with a fresh swap timer. */
export function startNextPeriod(
	clock: MatchClock,
	plan: MatchPlan,
): MatchClock {
	if (clock.phase !== "periodBreak" || clock.period >= plan.periods)
		return clock;
	return {
		phase: "playing",
		period: clock.period + 1,
		periodElapsed: 0,
		rotationElapsed: 0,
	};
}

/** A new lineup went on the pitch: the swap timer starts again. */
export function lineupChanged(clock: MatchClock): MatchClock {
	return { ...clock, rotationElapsed: 0 };
}

export interface RotationStatus {
	/** The swap timer has reached the swap interval. */
	due: boolean;
	/** 0-1 share of the swap interval played. */
	progress: number;
	remainingSeconds: number;
	/** How long the due swap has waited. */
	lateSeconds: number;
}

export function rotationStatus(
	clock: MatchClock,
	plan: MatchPlan,
): RotationStatus {
	const total = plan.rotationSeconds;
	// A zero or negative interval (e.g. a corrupted saved match) is due at once.
	if (total <= 0) {
		return { due: true, progress: 1, remainingSeconds: 0, lateSeconds: 0 };
	}
	const elapsed = clock.rotationElapsed;
	return {
		due: elapsed >= total,
		progress: Math.min(1, Math.max(0, elapsed / total)),
		remainingSeconds: Math.max(0, total - elapsed),
		lateSeconds: Math.max(0, elapsed - total),
	};
}

export interface PeriodStatus {
	period: number;
	periods: number;
	elapsedSeconds: number;
	remainingSeconds: number;
}

export function periodStatus(clock: MatchClock, plan: MatchPlan): PeriodStatus {
	return {
		period: clock.period,
		periods: plan.periods,
		elapsedSeconds: clock.periodElapsed,
		remainingSeconds: Math.max(0, plan.periodSeconds - clock.periodElapsed),
	};
}

/**
 * When the current lineup's swap is due, in seconds since kickoff. Unlike
 * rotationStatus it is not clamped, so a swap that is already late keeps its
 * real due time and its delay is measured correctly.
 */
export function swapDueAt(clock: MatchClock, plan: MatchPlan): number {
	return (
		matchSecond(clock, plan) + plan.rotationSeconds - clock.rotationElapsed
	);
}

/** Seconds of play since kickoff, across periods. Timeline events use this. */
export function matchSecond(clock: MatchClock, plan: MatchPlan): number {
	return (clock.period - 1) * plan.periodSeconds + clock.periodElapsed;
}
