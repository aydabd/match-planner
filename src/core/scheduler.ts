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
export class SchedulingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SchedulingError";
	}
}

export function createSchedulerState(
	format: FormatConfig,
	rotationSeconds: number,
	playerIds: readonly string[],
): SchedulerState {
	const players: Record<string, PlayerState> = {};
	for (const id of playerIds) {
		players[id] = { id, totalSeconds: 0, zonesPlayed: [], unavailable: false };
	}
	return { format, rotationSeconds, players, order: [...playerIds] };
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
	if (!p) throw new SchedulingError(`Okand spelare: "${id}"`);
	p.unavailable = unavailable;
}

function getZone(format: FormatConfig, zoneId: string): ZoneConfig {
	const zone = format.zones.find((z) => z.id === zoneId);
	if (!zone) throw new SchedulingError(`Okand zon: "${zoneId}"`);
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
 * Generate the next rotation from the current state, WITHOUT mutating it.
 * Safe to call repeatedly for a "what happens next" preview.
 *
 * Algorithm (single greedy pass, scarcest zone first):
 * for each zone, ordered by fewest seats first, pick the eligible
 * (adjacency-respecting) active players who have spent the least time in
 * that zone, then the least total time, then join order as a stable
 * tiebreak. Whoever is left after every zone is filled rests. Because
 * scarce zones are filled first from the players who have played there
 * least, and everyone still eligible for nothing yet gets first refusal
 * on the zones they need, the players left resting are - as an emergent
 * property, not a separate rule - close to those with the most total
 * playtime so far.
 */
export function generateRotation(state: SchedulerState): RotationAssignment {
	const active = state.order.filter((id) => !state.players[id]?.unavailable);
	const need = outfieldCount(state.format);
	if (active.length < need) {
		throw new SchedulingError(
			`For fa tillgangliga spelare (${active.length}) for formatet ${state.format.label} (behover minst ${need}).`,
		);
	}

	const remaining = new Set(active);
	const zones: Record<string, string[]> = {};
	for (const zone of state.format.zones) zones[zone.id] = [];

	const zonesByScarcity = [...state.format.zones].sort(
		(a, b) => a.count - b.count,
	);

	for (const zone of zonesByScarcity) {
		const eligible = [...remaining].filter((id) => {
			const player = state.players[id];
			return (
				player !== undefined && canAssignZone(player, zone.id, state.format)
			);
		});
		if (eligible.length < zone.count) {
			throw new SchedulingError(
				`Kan inte fylla zonen "${zone.label}" rattvist just nu - for fa spelare kan sta dar utan att bryta ` +
					`regeln om att aldrig byta mellan icke-angransande zoner. Justera truppen eller gor ett manuellt byte.`,
			);
		}
		eligible.sort((a, b) => {
			const playerA = state.players[a];
			const playerB = state.players[b];
			if (!playerA || !playerB) return 0;
			const za = zoneSeconds(playerA, zone.id);
			const zb = zoneSeconds(playerB, zone.id);
			if (za !== zb) return za - zb;
			const ta = state.players[a]?.totalSeconds;
			const tb = state.players[b]?.totalSeconds;
			if (ta !== undefined && tb !== undefined && ta !== tb) return ta - tb;
			return state.order.indexOf(a) - state.order.indexOf(b);
		});
		const chosen = eligible.slice(0, zone.count);
		zones[zone.id] = chosen;
		for (const id of chosen) remaining.delete(id);
	}

	return { zones, bench: [...remaining] };
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
