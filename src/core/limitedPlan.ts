import { outfieldCount } from "./formations.js";
import { substitutionUsage } from "./report.js";
import type { SubstitutionRules } from "./substitutionRules.js";
import type { TimelineEvent } from "./timeline.js";
import type { FormatConfig } from "./types.js";

/**
 * The plan for a match with limited swaps (#171, rules "limitedSubstitutions"
 * and "fairOverTime"). Pure: it takes plain records and returns plain
 * records, and never touches storage or the screen. The rotation engine
 * (scheduler.ts) is only used for free swaps.
 *
 * - Who plays: ranked by standing over the coach's period, the players
 *   furthest behind first. When the squad is larger than the lineup plus
 *   the substitutes allowed, the players furthest ahead sit out today.
 * - Who starts: the players furthest behind.
 * - When and who: each player brought on takes over one seat (one place in
 *   a line) from the player who has played longest, at the moment that
 *   gives the two of them the same time in this match. The times are moved
 *   to whole minutes, onto a break between periods when that is free, and
 *   merged until they fit the occasions allowed.
 * - Where: the incoming player takes the outgoing player's seat. Without
 *   re-entry nobody changes line during the match, so the line rules
 *   ("twoLines", "neighbouringLines") always hold.
 */

export type LimitedRules = Extract<SubstitutionRules, { kind: "limited" }>;

/** The match a plan is for. */
export interface PlanSetup {
	format: FormatConfig;
	periods: number;
	periodSeconds: number;
	rules: LimitedRules;
}

/** One player coming on for another, in that player's line. */
export interface PlannedSwap {
	outId: string;
	inId: string;
	zoneId: string;
}

/** A moment the team makes swaps: during play, or in a break (free). */
export interface Occasion {
	/** Seconds since kickoff. */
	at: number;
	atBreak: boolean;
	swaps: PlannedSwap[];
}

/** Something the coach should know about what is left of the match. */
export type PlanWarning =
	| { code: "noSubstitutesLeft" }
	| { code: "noOccasionsLeft" }
	/** Fewer players than the formation on the pitch, keeper included. */
	| { code: "shortHanded"; onPitch: number };

/** What the coach decided for a player, over the proposal. */
export type PlayerChoice = "start" | "bench" | "sitOut";

export interface SittingOut {
	playerId: string;
	/** Seconds ahead of the team average over the coach's period. */
	aheadSeconds: number;
}

export interface LimitedPlan {
	zones: Record<string, string[]>;
	keeperId: string | null;
	/** The players to bring on, the one coming on first first. */
	bench: string[];
	sittingOut: SittingOut[];
	occasions: Occasion[];
	warnings: PlanWarning[];
}

/** Where a match with limited swaps stands right now. */
export interface LiveState {
	/** Seconds since kickoff. */
	now: number;
	/** The match is in a break between periods (its swaps are free). */
	atBreak: boolean;
	zones: Readonly<Record<string, readonly string[]>>;
	keeperId: string | null;
	/** Players on the bench who can still play (not taken out). */
	bench: readonly string[];
	/** Seconds each player has played in this match. */
	played: Readonly<Record<string, number>>;
	timeline: readonly TimelineEvent[];
	/** Seconds ahead of the team average over the coach's period. */
	ahead: Readonly<Record<string, number>>;
}

const MINUTE = 60;

const aheadOf = (ahead: Readonly<Record<string, number>>, id: string) =>
	ahead[id] ?? 0;

/**
 * The squad ranked from furthest behind to furthest ahead; ties keep the
 * squad order, so the same input always gives the same plan.
 */
function ranked(
	ids: readonly string[],
	ahead: Readonly<Record<string, number>>,
): string[] {
	return ids
		.map((id, index) => ({ id, index }))
		.sort(
			(a, b) =>
				aheadOf(ahead, a.id) - aheadOf(ahead, b.id) || a.index - b.index,
		)
		.map(({ id }) => id);
}

/** Starters in the formation's lines, in order, as far as they go. */
function fillLines(
	format: FormatConfig,
	starters: readonly string[],
): Record<string, string[]> {
	const zones: Record<string, string[]> = {};
	let next = 0;
	for (const zone of format.zones) {
		zones[zone.id] = starters.slice(next, next + zone.count);
		next += zone.count;
	}
	return zones;
}

/**
 * The plan before kickoff: lineup, who sits out today, and the swaps.
 * `players` are the available players in squad order, the keeper included.
 * The coach's `choices` come first; the plan fills in around them, and a
 * choice that does not fit (more starters than seats, more players to
 * bring on than allowed) goes to the next place down.
 */
export function planMatch(
	setup: PlanSetup,
	squad: {
		players: readonly string[];
		keeperId: string | null;
		ahead: Readonly<Record<string, number>>;
		choices?: Readonly<Record<string, PlayerChoice>>;
	},
): LimitedPlan {
	const seats = outfieldCount(setup.format);
	const outfield = ranked(
		squad.players.filter((id) => id !== squad.keeperId),
		squad.ahead,
	);
	const choice = (id: string) => squad.choices?.[id];
	const open = outfield.filter((id) => choice(id) === undefined);
	const startersWanted = [
		...outfield.filter((id) => choice(id) === "start"),
		...open,
		...outfield.filter((id) => choice(id) === "bench"),
	];
	const starters = startersWanted.slice(0, seats);
	const benchWanted = [
		...outfield.filter((id) => choice(id) === "bench"),
		...outfield.filter((id) => choice(id) === "start"),
		...open,
	].filter((id) => !starters.includes(id));
	const bench = benchWanted.slice(0, setup.rules.substitutesIn);
	const sittingOut = ranked(
		outfield.filter((id) => !starters.includes(id) && !bench.includes(id)),
		squad.ahead,
	)
		.map((playerId) => ({
			playerId,
			aheadSeconds: aheadOf(squad.ahead, playerId),
		}))
		.reverse();
	const zones = fillLines(setup.format, starters);
	const { occasions, warnings } = replan(setup, {
		now: 0,
		atBreak: false,
		zones,
		keeperId: squad.keeperId,
		bench,
		played: {},
		timeline: [],
		ahead: squad.ahead,
	});
	return {
		zones,
		keeperId: squad.keeperId,
		bench: comingOnOrder(occasions, bench),
		sittingOut,
		occasions,
		warnings,
	};
}

/** The bench in the order its players come on; those not planned last. */
function comingOnOrder(
	occasions: readonly Occasion[],
	bench: readonly string[],
): string[] {
	const planned = occasions.flatMap((o) => o.swaps.map((s) => s.inId));
	return [...planned, ...bench.filter((id) => !planned.includes(id))];
}

/** The breaks still ahead (seconds since kickoff); free occasions. */
function breaksAhead(setup: PlanSetup, live: LiveState): number[] {
	const breaks: number[] = [];
	for (let period = 1; period < setup.periods; period++) {
		const at = period * setup.periodSeconds;
		if (at > live.now || (live.atBreak && at === live.now)) breaks.push(at);
	}
	return breaks;
}

interface Seat {
	zoneId: string;
	playerId: string;
}

/** Outfield seats, the player who has played longest (then furthest ahead) first. */
function seatsByLoad(live: LiveState): Seat[] {
	return Object.entries(live.zones)
		.flatMap(([zoneId, ids]) => ids.map((playerId) => ({ zoneId, playerId })))
		.sort(
			(a, b) =>
				(live.played[b.playerId] ?? 0) - (live.played[a.playerId] ?? 0) ||
				aheadOf(live.ahead, b.playerId) - aheadOf(live.ahead, a.playerId) ||
				a.playerId.localeCompare(b.playerId),
		);
}

/** A swap wanted at a moment, before it is fitted to the occasions. */
interface Wanted {
	at: number;
	seat: number;
	order: number;
}

/**
 * When each swap should happen for even playtime in this match: a seat
 * whose player has played `x` and is followed by `c` substitutes gives each
 * of them (x + remaining) / (c + 1) in total.
 */
function wantedTimes(
	seats: readonly Seat[],
	count: number,
	live: LiveState,
	end: number,
): Wanted[] {
	const wanted: Wanted[] = [];
	const perSeat = seats.map(
		(_, i) =>
			Math.floor(count / seats.length) + (i < count % seats.length ? 1 : 0),
	);
	perSeat.forEach((c, seat) => {
		if (c === 0) return;
		const played = live.played[seats[seat]?.playerId ?? ""] ?? 0;
		const share = (played + end - live.now) / (c + 1);
		let at = live.now + Math.max(0, share - played);
		for (let i = 0; i < c; i++) {
			wanted.push({ at, seat, order: i });
			at += share;
		}
	});
	return wanted;
}

/** On a whole minute, never before now and never at the final whistle. */
function onMinute(at: number, now: number, end: number): number {
	const rounded = Math.round(at / MINUTE) * MINUTE;
	return Math.min(Math.max(rounded, now), end - 1);
}

interface Group {
	at: number;
	atBreak: boolean;
	wanted: Wanted[];
}

/**
 * Put the wanted swaps into occasions: one per moment, a moment on a break
 * free. While there are more occasions during play than `limit`, the one
 * cheapest to move (fewest swaps times distance) joins its nearest
 * neighbour or break. With no break and no other occasion left, the swaps
 * during play are dropped: they cannot happen.
 */
function fitOccasions(
	wanted: readonly Wanted[],
	breaks: readonly number[],
	limit: number,
	now: number,
	end: number,
): Group[] {
	const groups: Group[] = [];
	const place = (at: number, items: Wanted[]) => {
		const atBreak = breaks.includes(at);
		const same = groups.find((g) => g.at === at);
		if (same) same.wanted.push(...items);
		else groups.push({ at, atBreak, wanted: items });
	};
	for (const w of wanted) place(onMinute(w.at, now, end), [w]);

	for (;;) {
		const inPlay = groups.filter((g) => !g.atBreak);
		if (inPlay.length <= limit) break;
		let best: { from: Group; to: number; cost: number } | null = null;
		for (const g of inPlay) {
			const targets = [
				...breaks,
				...groups.filter((o) => o !== g).map((o) => o.at),
			];
			for (const to of targets) {
				const cost = Math.abs(g.at - to) * g.wanted.length;
				if (!best || cost < best.cost) best = { from: g, to, cost };
			}
		}
		if (!best) {
			// No break left and no other occasion: these swaps cannot happen.
			groups.splice(0, groups.length, ...groups.filter((g) => g.atBreak));
			break;
		}
		groups.splice(groups.indexOf(best.from), 1);
		const target = groups.find((g) => g.at === best.to);
		const at =
			target && !target.atBreak && !breaks.includes(best.to)
				? onMinute(
						(target.at * target.wanted.length +
							best.from.at * best.from.wanted.length) /
							(target.wanted.length + best.from.wanted.length),
						now,
						end,
					)
				: best.to;
		if (target && at !== target.at) {
			groups.splice(groups.indexOf(target), 1);
			place(at, [...target.wanted, ...best.from.wanted]);
		} else {
			place(at, best.from.wanted);
		}
	}
	return groups.sort((a, b) => a.at - b.at);
}

/**
 * The swaps for what is left of the match, within what is left of the
 * limits: after an injury, a player taken out, or a swap made earlier,
 * later or with other players than planned. Only players who have not
 * been on the pitch are planned to come on; with re-entry allowed the
 * coach can still bring a player back by hand.
 */
export function replan(
	setup: PlanSetup,
	live: LiveState,
): { occasions: Occasion[]; warnings: PlanWarning[] } {
	const { rules } = setup;
	const end = setup.periods * setup.periodSeconds;
	const usage = substitutionUsage(live.timeline, rules);
	const everOn = new Set(
		live.timeline.flatMap((e) =>
			e.type === "lineup"
				? [
						...Object.values(e.zones).flat(),
						...(e.keeperId ? [e.keeperId] : []),
					]
				: e.type === "substitution"
					? [e.inId]
					: [],
		),
	);
	const fresh = ranked(
		live.bench.filter((id) => !everOn.has(id)),
		live.ahead,
	);
	const substitutesLeft = Math.max(
		0,
		rules.substitutesIn - usage.substitutesIn,
	);
	const occasionsLeft =
		rules.occasions === null
			? Number.POSITIVE_INFINITY
			: Math.max(0, rules.occasions - usage.occasions);
	const breaks = breaksAhead(setup, live);
	const seats = seatsByLoad(live);

	const warnings: PlanWarning[] = [];
	const onPitch = seats.length + (live.keeperId === null ? 0 : 1);
	const full = outfieldCount(setup.format) + (live.keeperId === null ? 0 : 1);
	if (onPitch < full) warnings.push({ code: "shortHanded", onPitch });
	if (fresh.length > 0 && substitutesLeft === 0)
		warnings.push({ code: "noSubstitutesLeft" });
	else if (fresh.length > 0 && occasionsLeft === 0 && breaks.length === 0)
		warnings.push({ code: "noOccasionsLeft" });

	const count = Math.min(fresh.length, substitutesLeft);
	if (count === 0 || seats.length === 0 || live.now >= end) {
		return { occasions: [], warnings };
	}
	const groups = fitOccasions(
		wantedTimes(seats, count, live, end),
		breaks,
		Math.min(occasionsLeft, count),
		live.now,
		end,
	);
	return { occasions: toOccasions(groups, seats, fresh), warnings };
}

/**
 * Name the players: the earliest swap brings on the player furthest
 * behind. A seat followed by several substitutes passes from one to the
 * next; two of its swaps merged into one moment become one swap.
 */
function toOccasions(
	groups: readonly Group[],
	seats: readonly Seat[],
	fresh: readonly string[],
): Occasion[] {
	const holder = seats.map((s) => s.playerId);
	const queue = [...fresh];
	return groups.map((group) => {
		const swaps: PlannedSwap[] = [];
		const ordered = [...group.wanted].sort(
			(a, b) => a.seat - b.seat || a.order - b.order,
		);
		for (const w of ordered) {
			const seat = seats[w.seat] as Seat;
			const outId = holder[w.seat] as string;
			const inId = queue.shift() as string;
			const earlier = swaps.find((s) => s.inId === outId);
			if (earlier) {
				// The player who would come on and go off at once stays on the bench.
				queue.unshift(inId);
				continue;
			}
			holder[w.seat] = inId;
			swaps.push({ outId, inId, zoneId: seat.zoneId });
		}
		return { at: group.at, atBreak: group.atBreak, swaps };
	});
}
