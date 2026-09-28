import type { SubstitutionChain } from "./substitutions.js";
import type { MutableAssignment } from "./types.js";

/**
 * The match timeline: an append-only record of what happened and when, in
 * seconds since kickoff (matchSecond). Lineup snapshots are the source of
 * truth for minutes per player and per line; the other events explain the
 * match to the coach (post-match report #13, season history #38).
 */
export type TimelineEvent =
	| { type: "periodStart"; at: number; period: number }
	| { type: "periodEnd"; at: number; period: number }
	| {
			type: "lineup";
			at: number;
			zones: Record<string, string[]>;
			keeperId: string | null;
	  }
	| ({
			type: "substitution";
			at: number;
			/** When the swap was due by the swap interval. */
			plannedAt: number;
			period: number;
	  } & SubstitutionChain)
	| {
			type: "keeperChange";
			at: number;
			period: number;
			fromId: string | null;
			toId: string;
	  }
	| { type: "outForMatch"; at: number; period: number; playerId: string }
	| { type: "lateArrival"; at: number; period: number; playerId: string };

/** The line name used for the goalkeeper in minutes per line. */
export const GOAL = "goal";

type LineupEvent = Extract<TimelineEvent, { type: "lineup" }>;

function sameLineup(
	a: LineupEvent,
	b: Omit<LineupEvent, "type" | "at">,
): boolean {
	return (
		JSON.stringify([a.zones, a.keeperId]) ===
		JSON.stringify([b.zones, b.keeperId])
	);
}

/**
 * Record who plays where from `at` on. Call it after every change to the
 * lineup or keeper; an unchanged lineup is not recorded twice. The snapshot
 * is a copy, so later edits to the live lineup never rewrite history.
 */
export function recordLineup(
	timeline: TimelineEvent[],
	at: number,
	assignment: MutableAssignment,
	keeperId: string | null,
): void {
	const snapshot = {
		zones: structuredClone(assignment.zones),
		keeperId,
	};
	let last: LineupEvent | undefined;
	// Look from the end without copying: this runs on every lineup change.
	for (let i = timeline.length - 1; i >= 0 && !last; i--) {
		const event = timeline[i];
		if (event?.type === "lineup") last = event;
	}
	if (last && sameLineup(last, snapshot)) return;
	timeline.push({ type: "lineup", at, ...snapshot });
}

export interface PlayedSeconds {
	total: number;
	/** Seconds per line id ("back", "mid", ...), and GOAL for the keeper. */
	byZone: Record<string, number>;
}

/**
 * Seconds each player has played, in total and per line, computed only from
 * the timeline: the time between consecutive lineup snapshots, counted while
 * a period is on (from periodStart to periodEnd). `now` closes a period still
 * in progress. The same timeline always gives the same result.
 */
export function secondsPlayed(
	timeline: readonly TimelineEvent[],
	now: number,
): Record<string, PlayedSeconds> {
	const played: Record<string, PlayedSeconds> = {};
	let lineup: LineupEvent | null = null;
	let from: number | null = null; // start of the current counted stretch

	const credit = (until: number) => {
		if (!lineup || from === null || until <= from) return;
		const seconds = until - from;
		const add = (id: string, zone: string) => {
			const player = played[id] ?? { total: 0, byZone: {} };
			player.total += seconds;
			player.byZone[zone] = (player.byZone[zone] ?? 0) + seconds;
			played[id] = player;
		};
		for (const [zone, ids] of Object.entries(lineup.zones)) {
			for (const id of ids) add(id, zone);
		}
		if (lineup.keeperId !== null) add(lineup.keeperId, GOAL);
	};

	for (const event of timeline) {
		if (event.type === "periodStart") {
			from = event.at;
		} else if (event.type === "periodEnd") {
			credit(event.at);
			from = null;
		} else if (event.type === "lineup") {
			credit(event.at);
			lineup = event;
			if (from !== null) from = event.at;
		}
	}
	credit(now);
	return played;
}

/** How early (negative) or late each substitution was made, in seconds. */
export function swapDelays(timeline: readonly TimelineEvent[]) {
	return timeline
		.filter(
			(e): e is Extract<TimelineEvent, { type: "substitution" }> =>
				e.type === "substitution",
		)
		.map((e) => ({
			inId: e.inId,
			outId: e.outId,
			plannedAt: e.plannedAt,
			at: e.at,
			delaySeconds: e.at - e.plannedAt,
		}));
}

/**
 * Seconds each player played in each period, from the timeline. Index 0 is
 * period 1. Cutting the timeline after a period's end and subtracting the
 * earlier cut keeps one source of truth: the periods always add up to
 * secondsPlayed.
 */
export function secondsPlayedByPeriod(
	timeline: readonly TimelineEvent[],
	now: number,
): Record<string, number>[] {
	const periods = Math.max(
		0,
		...timeline.map((e) => (e.type === "periodStart" ? e.period : 0)),
	);
	const result: Record<string, number>[] = [];
	let before: Record<string, PlayedSeconds> = {};
	for (let period = 1; period <= periods; period++) {
		const end = timeline.findIndex(
			(e) => e.type === "periodEnd" && e.period === period,
		);
		const upTo = end === -1 ? timeline : timeline.slice(0, end + 1);
		const cumulative = secondsPlayed(upTo, now);
		const seconds: Record<string, number> = {};
		for (const [id, played] of Object.entries(cumulative)) {
			const gained = played.total - (before[id]?.total ?? 0);
			if (gained > 0) seconds[id] = gained;
		}
		result.push(seconds);
		before = cumulative;
	}
	return result;
}
