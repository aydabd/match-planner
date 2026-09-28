import type { MutableAssignment } from "./types.js";

/**
 * Going from the current lineup to the next one, broken into substitutions
 * the coach can make one at a time. Each chain is one player coming on, any
 * players who change line to make room, and one player coming off. Applying
 * a chain moves everyone in it at once, so nobody is ever in two places and
 * every player ends up in the line the scheduler planned for them.
 */
export interface SubstitutionChain {
	/** The bench player coming on. */
	inId: string;
	/** The line they come on in. */
	zoneId: string;
	/** Players already on the pitch who change line, in order. */
	moves: { playerId: string; from: string; to: string }[];
	/** The player coming off to the bench. */
	outId: string;
}

function zoneIndex(assignment: MutableAssignment): Map<string, string> {
	const zones = new Map<string, string>();
	for (const [zoneId, players] of Object.entries(assignment.zones)) {
		for (const id of players) zones.set(id, zoneId);
	}
	return zones;
}

/** One chain per player coming on, in bench order. */
export function substitutionChains(
	current: MutableAssignment,
	next: MutableAssignment,
): SubstitutionChain[] {
	const nowIn = zoneIndex(current);
	const nextIn = zoneIndex(next);
	// Players leaving each line (to the bench or to another line).
	const leaving = new Map<string, string[]>();
	for (const [zoneId, players] of Object.entries(current.zones)) {
		leaving.set(
			zoneId,
			players.filter((id) => nextIn.get(id) !== zoneId),
		);
	}
	const used = new Set<string>();
	const chains: SubstitutionChain[] = [];

	for (const inId of current.bench) {
		const firstZone = nextIn.get(inId);
		if (firstZone === undefined) continue;
		const moves: SubstitutionChain["moves"] = [];
		let zoneId = firstZone;
		// Every line gives up as many players as it takes in, so this ends
		// with someone going to the bench.
		for (;;) {
			// Prefer someone coming off over someone moving line: shorter
			// chains are easier to call out on the sideline. Players who only
			// swap lines with each other move when the swap completes.
			const candidates = (leaving.get(zoneId) ?? []).filter(
				(id) => !used.has(id),
			);
			const out = candidates.find((id) => !nextIn.has(id)) ?? candidates[0];
			if (out === undefined) break;
			used.add(out);
			const to = nextIn.get(out);
			if (to === undefined) {
				chains.push({ inId, zoneId: firstZone, moves, outId: out });
				break;
			}
			moves.push({ playerId: out, from: zoneId, to });
			zoneId = to;
		}
	}
	// A chain only exists for players who are on the pitch now.
	return chains.filter((chain) => nowIn.has(chain.outId));
}

/**
 * Make one substitution: the incoming player takes the seat of the first
 * player displaced, each mover takes the seat of the next, and the player
 * coming off takes the incoming player's place on the bench. A chain that
 * no longer fits the lineup (e.g. someone was taken out meanwhile) changes
 * nothing.
 */
export function applyChain(
	assignment: MutableAssignment,
	chain: SubstitutionChain,
): void {
	const benchIdx = assignment.bench.indexOf(chain.inId);
	// Who is displaced in which line, in order: the first mover in the
	// incoming player's line, and so on, until the player coming off.
	const displaced = [
		...chain.moves.map((m) => ({ id: m.playerId, zoneId: m.from })),
		{
			id: chain.outId,
			zoneId: chain.moves[chain.moves.length - 1]?.to ?? chain.zoneId,
		},
	];
	const seats = displaced.map(({ id, zoneId }) => ({
		zone: assignment.zones[zoneId],
		index: assignment.zones[zoneId]?.indexOf(id) ?? -1,
	}));
	if (benchIdx === -1 || seats.some((s) => !s.zone || s.index === -1)) return;

	const arriving = [chain.inId, ...chain.moves.map((m) => m.playerId)];
	seats.forEach(({ zone, index }, i) => {
		(zone as string[])[index] = arriving[i] as string;
	});
	assignment.bench[benchIdx] = chain.outId;
}
