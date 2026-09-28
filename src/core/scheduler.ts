import { outfieldCount } from "./formations.js";
import type {
	FormatConfig,
	PlayerState,
	RotationAssignment,
	SchedulerState,
	ZoneConfig,
} from "./types.js";

/**
 * Thrown when a rotation genuinely cannot be built fairly with the current
 * roster (e.g. too few available players, or every eligible player for a
 * scarce zone happens to be unavailable). The UI should show this to the
 * coach rather than silently breaking a rule.
 */
export type SchedulingProblem =
	| { code: "unknownPlayer" }
	| { code: "unknownZone" }
	| { code: "tooFewPlayers"; available: number; need: number }
	| { code: "cannotFillLineup" };

/** src/ui/text.ts turns the problem into a sentence; the message is for developers. */
export class SchedulingError extends Error {
	constructor(
		message: string,
		readonly problem: SchedulingProblem,
	) {
		super(message);
		this.name = "SchedulingError";
	}
}

export function createSchedulerState(
	format: FormatConfig,
	rotationSeconds: number,
	playerIds: readonly string[],
	keeperId: string | null = null,
): SchedulerState {
	const players: Record<string, PlayerState> = {};
	for (const id of playerIds) {
		players[id] = { id, totalSeconds: 0, zonesPlayed: [], unavailable: false };
	}
	return {
		format,
		rotationSeconds,
		players,
		order: [...playerIds],
		keeperId: keeperId !== null && players[keeperId] ? keeperId : null,
	};
}

/** Add a player mid-match (e.g. a late arrival). Safe at any point. */
export function addPlayer(state: SchedulerState, id: string): void {
	if (state.players[id]) return; // already present, no-op
	state.players[id] = {
		id,
		totalSeconds: 0,
		zonesPlayed: [],
		unavailable: false,
	};
	state.order.push(id);
}

/** Mark a player unavailable for the rest of the match (injury, went home, ...). */
export function setUnavailable(
	state: SchedulerState,
	id: string,
	unavailable: boolean,
): void {
	const p = state.players[id];
	if (!p) {
		throw new SchedulingError(`Unknown player "${id}"`, {
			code: "unknownPlayer",
		});
	}
	p.unavailable = unavailable;
}

function getZone(format: FormatConfig, zoneId: string): ZoneConfig {
	const zone = format.zones.find((z) => z.id === zoneId);
	if (!zone) {
		throw new SchedulingError(`Unknown zone "${zoneId}"`, {
			code: "unknownZone",
		});
	}
	return zone;
}

function zoneSeconds(player: PlayerState, zoneId: string): number {
	return player.zonesPlayed.includes(zoneId) ? player.totalSeconds : 0;
	// Note: v1 tracks total seconds per player, not a full per-zone seconds
	// breakdown, to keep the state shape small. Since a player is locked to
	// at most two zones for the whole match (see canAssignZone), "have I
	// played this zone before" plus total seconds is enough signal to
	// alternate zones fairly - a true per-zone-seconds ledger is a
	// reasonable future improvement if finer-grained variety is ever needed.
}

/**
 * Whether `player` may be assigned to `zoneId` without ever accumulating a
 * non-adjacent pair of zones, and without ever accumulating more than two
 * distinct zones in total. This is the one rule that encodes "never move
 * a child directly from attack to defence (or vice versa)" - generalized
 * to any zone graph, not hardcoded to 7v7.
 */
export function canAssignZone(
	player: PlayerState,
	zoneId: string,
	format: FormatConfig,
): boolean {
	if (player.zonesPlayed.includes(zoneId)) return true;
	const prospective = [...player.zonesPlayed, zoneId];
	if (prospective.length > 2) return false;
	if (prospective.length === 2) {
		const [a, b] = prospective as [string, string];
		return (
			getZone(format, a).adjacent.includes(b) ||
			getZone(format, b).adjacent.includes(a)
		);
	}
	return true;
}

/**
 * Whether an active player may stand in a zone without breaking the zone
 * rule. Only called for ids from activePlayers, which all have a record.
 */
function canPlay(state: SchedulerState, id: string, zoneId: string): boolean {
	const player = state.players[id] as PlayerState;
	return canAssignZone(player, zoneId, state.format);
}

/**
 * Players who can be picked: they have a record and are not ruled out. An
 * id without a record (e.g. from a corrupted saved match) is ignored rather
 * than crashing the rotation.
 */
function activePlayers(state: SchedulerState): string[] {
	return state.order.filter((id) => {
		const player = state.players[id];
		return player !== undefined && !player.unavailable && id !== state.keeperId;
	});
}

/** A seat on the pitch: one place in one zone. */
type Seats = readonly string[];

/**
 * Seats interleaved across the lines (back, midfield, attack, back, ...), so
 * players next to each other in join order end up in different lines. When
 * playtime is tied and the last players in join order rest, the rest is then
 * spread over the pitch instead of emptying one line, and fresh substitutes
 * are spread over every line too. Without this a line can end up with no
 * one left who may relieve it.
 */
function seatsOf(format: FormatConfig): Seats {
	const left = new Map(format.zones.map((zone) => [zone.id, zone.count]));
	const seats: string[] = [];
	while (seats.length < outfieldCount(format)) {
		for (const zone of format.zones) {
			const count = left.get(zone.id) ?? 0;
			if (count > 0) {
				seats.push(zone.id);
				left.set(zone.id, count - 1);
			}
		}
	}
	return seats;
}

/**
 * Largest number of `playerIds` that can be seated at once, each in a zone
 * they are allowed to play (bipartite matching with augmenting paths).
 */
function maxSeated(
	state: SchedulerState,
	playerIds: readonly string[],
	seats: Seats,
): number {
	const seatOwner: (number | undefined)[] = seats.map(() => undefined);
	const eligible = playerIds.map((id) =>
		seats.map((zoneId) => canPlay(state, id, zoneId)),
	);
	const tryPlace = (p: number, visited: boolean[]): boolean => {
		for (let s = 0; s < seats.length; s++) {
			if (!at(at(eligible, p), s) || at(visited, s)) continue;
			visited[s] = true;
			const owner = seatOwner[s];
			if (owner === undefined || tryPlace(owner, visited)) {
				seatOwner[s] = p;
				return true;
			}
		}
		return false;
	};
	let seated = 0;
	for (let p = 0; p < playerIds.length; p++) {
		if (
			tryPlace(
				p,
				seats.map(() => false),
			)
		)
			seated++;
	}
	return seated;
}

/** Read an index that is always in range (the arrays below are pre-sized). */
function at<T>(values: readonly T[], index: number): T {
	return values[index] as T;
}

/**
 * Minimum-cost perfect assignment of n players to n seats (Hungarian
 * algorithm, O(n^3)). `cost[p][s]` is Infinity where player p may not take
 * seat s; the caller guarantees a finite assignment exists. Returns the seat
 * index for each player.
 */
function assignSeats(cost: readonly (readonly number[])[]): number[] {
	const n = cost.length;
	// 1-indexed potentials and matching, as in the classic formulation;
	// index 0 is a virtual start player/seat.
	const u = new Array<number>(n + 1).fill(0);
	const v = new Array<number>(n + 1).fill(0);
	const playerOfSeat = new Array<number>(n + 1).fill(0);
	const way = new Array<number>(n + 1).fill(0);
	const costAt = (p: number, s: number) => at(at(cost, p - 1), s - 1);

	for (let p = 1; p <= n; p++) {
		playerOfSeat[0] = p;
		let s0 = 0;
		const minv = new Array<number>(n + 1).fill(Infinity);
		const used = new Array<boolean>(n + 1).fill(false);
		do {
			used[s0] = true;
			const p0 = at(playerOfSeat, s0);
			let delta = Infinity;
			let s1 = 0;
			for (let s = 1; s <= n; s++) {
				if (at(used, s)) continue;
				const reduced = costAt(p0, s) - at(u, p0) - at(v, s);
				if (reduced < at(minv, s)) {
					minv[s] = reduced;
					way[s] = s0;
				}
				if (at(minv, s) < delta) {
					delta = at(minv, s);
					s1 = s;
				}
			}
			for (let s = 0; s <= n; s++) {
				if (at(used, s)) {
					const ps = at(playerOfSeat, s);
					u[ps] = at(u, ps) + delta;
					v[s] = at(v, s) - delta;
				} else {
					minv[s] = at(minv, s) - delta;
				}
			}
			s0 = s1;
		} while (at(playerOfSeat, s0) !== 0);
		do {
			const s1 = at(way, s0);
			playerOfSeat[s0] = at(playerOfSeat, s1);
			s0 = s1;
		} while (s0 !== 0);
	}

	const seatOfPlayer = new Array<number>(n).fill(0);
	for (let s = 1; s <= n; s++) seatOfPlayer[at(playerOfSeat, s) - 1] = s - 1;
	return seatOfPlayer;
}

/**
 * Generate the next rotation from the current state, WITHOUT mutating it.
 * Safe to call repeatedly for a "what happens next" preview.
 *
 * Two steps, both exact rather than greedy, so no formation can paint the
 * team into a corner:
 * 1. Who plays: go through active players from least to most playtime (join
 *    order breaks ties) and take each one whose addition still leaves a
 *    valid lineup, i.e. everyone chosen can be seated in a zone they are
 *    allowed to play (bipartite matching). The rest rest.
 * 2. Where they play: an optimal assignment of the chosen players to seats
 *    that respects the zone rule and puts each player where they have spent
 *    the least time, so players alternate between their allowed zones.
 */
export function generateRotation(state: SchedulerState): RotationAssignment {
	const active = activePlayers(state);
	const need = outfieldCount(state.format);
	if (active.length < need) {
		throw new SchedulingError(
			`${active.length} available players, ${state.format.label} needs ${need}`,
			{ code: "tooFewPlayers", available: active.length, need },
		);
	}

	const seats = seatsOf(state.format);
	const playtime = (id: string) =>
		(state.players[id] as PlayerState).totalSeconds;
	const joinOrder = (a: string, b: string) =>
		state.order.indexOf(a) - state.order.indexOf(b);
	const byPlaytime = [...active].sort(
		(a, b) => playtime(a) - playtime(b) || joinOrder(a, b),
	);
	const chosen: string[] = [];
	for (const id of byPlaytime) {
		if (chosen.length === need) break;
		if (maxSeated(state, [...chosen, id], seats) === chosen.length + 1) {
			chosen.push(id);
		}
	}
	if (chosen.length < need) {
		throw new SchedulingError(
			"No lineup fills every seat without breaking the zone rule",
			{ code: "cannotFillLineup" },
		);
	}

	// Keep lineups in join order so the pitch reads the same way each time.
	chosen.sort(joinOrder);
	// Ties (e.g. at kickoff, when nobody has played) go to the seat matching
	// the player's place in join order; the tie-break is far below one second.
	const tieBreak = 1 / (seats.length * seats.length + 1);
	const cost = chosen.map((id, p) =>
		seats.map((zoneId, s) =>
			canPlay(state, id, zoneId)
				? zoneSeconds(state.players[id] as PlayerState, zoneId) +
					Math.abs(p - s) * tieBreak
				: Infinity,
		),
	);
	const seatOfPlayer = assignSeats(cost);

	const zones: Record<string, string[]> = {};
	for (const zone of state.format.zones) zones[zone.id] = [];
	chosen.forEach((id, p) => {
		const zoneId = at(seats, at(seatOfPlayer, p));
		(zones[zoneId] as string[]).push(id);
	});
	const playing = new Set(chosen);
	return { zones, bench: active.filter((id) => !playing.has(id)) };
}

/**
 * Commit a rotation that has actually been played for `elapsedSeconds`
 * (normally the full rotation length, but can be less if the coach ends a
 * rotation early). Mutates the scheduler state; bench players are
 * untouched.
 */
export function applyElapsed(
	state: SchedulerState,
	assignment: RotationAssignment,
	elapsedSeconds: number,
): void {
	for (const zoneId of Object.keys(assignment.zones)) {
		for (const id of assignment.zones[zoneId] ?? []) {
			const p = state.players[id];
			if (!p) continue;
			p.totalSeconds += elapsedSeconds;
			if (!p.zonesPlayed.includes(zoneId)) p.zonesPlayed.push(zoneId);
		}
	}
	// The keeper plays too; goal is not an outfield zone for the zone rule.
	const keeper = state.keeperId ? state.players[state.keeperId] : undefined;
	if (keeper && !keeper.unavailable) keeper.totalSeconds += elapsedSeconds;
}

/** Spread between the most- and least-played active player, in seconds. */
export function fairnessSpread(state: SchedulerState): number {
	const active = state.order
		.map((id) => state.players[id])
		.filter(
			(player): player is NonNullable<typeof player> => player !== undefined,
		)
		.filter((p) => !p.unavailable);
	if (active.length === 0) return 0;
	const seconds = active.map((p) => p.totalSeconds);
	return Math.max(...seconds) - Math.min(...seconds);
}
