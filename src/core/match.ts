import {
	generateRotation,
	SchedulingError,
	setUnavailable,
} from "./scheduler.js";
import type {
	MutableAssignment,
	RotationAssignment,
	SchedulerState,
	TempSwap,
} from "./types.js";

/**
 * Match-day operations on the coach's live lineup. Everything here is pure
 * data manipulation with no DOM access, so the UI (src/ui/match.ts) only
 * wires buttons to these functions and renders the result.
 */

/** Format seconds as mm:ss, e.g. 75 -> "01:15". */
export function formatTime(totalSeconds: number): string {
	const m = Math.floor(totalSeconds / 60)
		.toString()
		.padStart(2, "0");
	const s = Math.floor(totalSeconds % 60)
		.toString()
		.padStart(2, "0");
	return `${m}:${s}`;
}

/** Deep-copy a rotation into the mutable shape the UI edits in place. */
export function cloneAssignment(a: RotationAssignment): MutableAssignment {
	const zones: Record<string, string[]> = {};
	for (const zoneId of Object.keys(a.zones))
		zones[zoneId] = [...(a.zones[zoneId] ?? [])];
	return { zones, bench: [...a.bench] };
}

/**
 * Like generateRotation, but never throws a SchedulingError: when no fair
 * rotation exists every available player is put on the bench so the coach
 * can still make manual swaps.
 */
export function generateRotationSafe(
	state: SchedulerState,
): RotationAssignment {
	try {
		return generateRotation(state);
	} catch (err) {
		if (err instanceof SchedulingError) {
			return {
				zones: Object.fromEntries(state.format.zones.map((z) => [z.id, []])),
				bench: [...state.order],
			};
		}
		throw err;
	}
}

/** Who enters and who leaves the pitch when going from `current` to `next`. */
export function lineupChanges(
	current: MutableAssignment | RotationAssignment,
	next: MutableAssignment | RotationAssignment,
): { comingIn: string[]; goingOut: string[] } {
	const currentOnPitch = new Set(Object.values(current.zones).flat());
	const nextOnPitch = new Set(Object.values(next.zones).flat());
	return {
		comingIn: [...nextOnPitch].filter((id) => !currentOnPitch.has(id)),
		goingOut: [...currentOnPitch].filter((id) => !nextOnPitch.has(id)),
	};
}

/**
 * Swap a pitch player with a bench player. With a duration the swap is
 * temporary and returned so the clock can undo it later; `null` means it
 * lasts until the next rotation. Returns undefined if either slot is empty.
 */
export function swapWithBench(
	assignment: MutableAssignment,
	zoneId: string,
	idx: number,
	benchIdx: number,
	durationSeconds: number | null,
): TempSwap | null | undefined {
	const zonePlayers = assignment.zones[zoneId];
	const outId = zonePlayers?.[idx];
	const inId = assignment.bench[benchIdx];
	if (!zonePlayers || outId === undefined || inId === undefined)
		return undefined;
	zonePlayers[idx] = inId;
	assignment.bench[benchIdx] = outId;
	if (durationSeconds === null) return null;
	return { zoneId, idx, outId, inId, remainingSeconds: durationSeconds };
}

/**
 * Put the original player back on the pitch and the substitute back on the
 * bench, in the original player's bench seat. Does nothing if the coach has
 * since changed that slot or already brought the original player back on
 * elsewhere, so a manual change is never overwritten and nobody is doubled.
 */
export function revertTempSwap(
	assignment: MutableAssignment,
	swap: Readonly<TempSwap>,
): void {
	const arr = assignment.zones[swap.zoneId];
	if (!arr || arr[swap.idx] !== swap.inId) return;
	const outIsOnPitch = Object.values(assignment.zones).some((zone) =>
		zone.includes(swap.outId),
	);
	if (outIsOnPitch) return;
	arr[swap.idx] = swap.outId;
	const benchIdx = assignment.bench.indexOf(swap.outId);
	if (benchIdx !== -1) assignment.bench[benchIdx] = swap.inId;
	else assignment.bench.push(swap.inId);
}

/**
 * Count temporary swaps down by `seconds`, reverting any that run out.
 * Returns new swap objects for the ones still running; the input is not
 * changed.
 */
export function tickTempSwaps(
	assignment: MutableAssignment,
	swaps: readonly Readonly<TempSwap>[],
	seconds: number,
): TempSwap[] {
	const running: TempSwap[] = [];
	for (const swap of swaps) {
		const remainingSeconds = swap.remainingSeconds - seconds;
		if (remainingSeconds <= 0) revertTempSwap(assignment, swap);
		else running.push({ ...swap, remainingSeconds });
	}
	return running;
}

/** Undo every running temporary swap at once. */
export function undoTempSwaps(
	assignment: MutableAssignment,
	swaps: readonly Readonly<TempSwap>[],
): void {
	for (const swap of swaps) revertTempSwap(assignment, swap);
}

/**
 * Take a pitch player out for the rest of the match. The available bench
 * player with the least playtime covers the slot; with nobody on the bench
 * the team plays one short. Returns the covering player's id, if any.
 */
export function takeOutForMatch(
	state: SchedulerState,
	assignment: MutableAssignment,
	zoneId: string,
	idx: number,
): string | undefined {
	const zonePlayers = assignment.zones[zoneId];
	const outId = zonePlayers?.[idx];
	if (!zonePlayers || outId === undefined) return undefined;
	setUnavailable(state, outId, true);
	const benchCandidates = assignment.bench.filter(
		(id) => !state.players[id]?.unavailable,
	);
	benchCandidates.sort((a, b) => {
		const playerA = state.players[a];
		const playerB = state.players[b];
		if (!playerA || !playerB) return 0;
		return playerA.totalSeconds - playerB.totalSeconds;
	});
	const cover = benchCandidates[0];
	if (cover !== undefined) {
		zonePlayers[idx] = cover;
		assignment.bench = assignment.bench.filter((id) => id !== cover);
	} else {
		zonePlayers.splice(idx, 1);
	}
	return cover;
}

/** Wipe all playtime, zone history and injuries, keeping the squad. */
export function resetPlayers(state: SchedulerState): void {
	for (const id of state.order) {
		const player = state.players[id];
		if (!player) continue;
		player.totalSeconds = 0;
		player.zonesPlayed = [];
		player.unavailable = false;
	}
}
