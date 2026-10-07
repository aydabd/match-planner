import { describe, expect, it } from "vitest";
import { getFormat } from "../src/core/formations.js";
import { resetPlayers } from "../src/core/match.js";
import { POLICY } from "../src/core/policy.js";
import {
	applyElapsed,
	createSchedulerState,
	fairnessSpread,
	generateRotation,
	resetLoadInARow,
} from "../src/core/scheduler.js";
import type { SchedulerState } from "../src/core/types.js";

const FORMAT = getFormat("7v7");

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

/** Play `rotations` swaps of `interval` seconds; returns each player's longest time on in a row. */
function longestStretches(
	state: SchedulerState,
	rotations: number,
	interval: number,
): Record<string, number> {
	const run: Record<string, number> = {};
	const longest: Record<string, number> = {};
	for (let i = 0; i < rotations; i++) {
		const assignment = generateRotation(state);
		const onPitch = new Set(Object.values(assignment.zones).flat());
		for (const id of state.order) {
			run[id] = onPitch.has(id) ? (run[id] ?? 0) + interval : 0;
			longest[id] = Math.max(longest[id] ?? 0, run[id] ?? 0);
		}
		applyElapsed(state, assignment, interval);
	}
	return longest;
}

describe("load in a row", () => {
	it("grows with each second on the pitch, weighted by the line", () => {
		const state = createSchedulerState(FORMAT, 600, ids(10));
		const assignment = generateRotation(state);
		applyElapsed(state, assignment, 100);
		for (const [zoneId, players] of Object.entries(assignment.zones)) {
			for (const id of players) {
				const weight = POLICY.zoneLoad[zoneId as keyof typeof POLICY.zoneLoad];
				expect(state.players[id]?.loadInARow).toBeCloseTo(100 * weight);
			}
		}
	});

	it("starts again from zero on the bench", () => {
		const state = createSchedulerState(FORMAT, 600, ids(10));
		const first = generateRotation(state);
		applyElapsed(state, first, 100);
		const rested = first.zones.back?.[0] as string;
		const without = Object.fromEntries(
			Object.entries(first.zones).map(([zone, players]) => [
				zone,
				players.filter((id) => id !== rested),
			]),
		);
		applyElapsed(state, { zones: without, bench: [rested] }, 50);
		expect(state.players[rested]?.loadInARow).toBe(0);
	});

	it("is cleared for everyone by a break between periods", () => {
		const state = createSchedulerState(FORMAT, 600, ids(10));
		applyElapsed(state, generateRotation(state), 300);
		resetLoadInARow(state);
		for (const player of Object.values(state.players)) {
			expect(player.loadInARow).toBe(0);
		}
	});

	it("is cleared when the players are reset", () => {
		const state = createSchedulerState(FORMAT, 600, ids(10));
		applyElapsed(state, generateRotation(state), 300);
		resetPlayers(state);
		for (const player of Object.values(state.players)) {
			expect(player.loadInARow).toBe(0);
		}
	});
});

describe("who comes off at the first swap", () => {
	it("keeps the defenders on before the midfielders and the forward", () => {
		const state = createSchedulerState(FORMAT, 600, ids(10));
		const first = generateRotation(state);
		applyElapsed(state, first, 600);
		const next = generateRotation(state);
		const stayed = Object.values(first.zones)
			.flat()
			.filter((id) => Object.values(next.zones).flat().includes(id));
		// Four substitutes come on, so two of the six starters stay.
		expect(stayed).toHaveLength(2);
		expect(stayed.sort()).toEqual([...(first.zones.back ?? [])].sort());
	});

	it("treats a few seconds of difference in playtime as the same playtime", () => {
		const state = createSchedulerState(FORMAT, 600, ids(10));
		const first = generateRotation(state);
		applyElapsed(state, first, 600);
		// A late swap left one forward a few seconds ahead of the others.
		const forward = first.zones.fwd?.[0] as string;
		const player = state.players[forward];
		if (player) player.totalSeconds += POLICY.samePlaytimeSeconds - 1;
		const next = new Set(Object.values(generateRotation(state).zones).flat());
		const stayed = Object.values(first.zones)
			.flat()
			.filter((id) => next.has(id));
		expect(stayed.sort()).toEqual([...(first.zones.back ?? [])].sort());
	});

	it("does not depend on the order the players were added", () => {
		const forwards = ids(10);
		const backwards = [...forwards].reverse();
		const stays = (order: string[]) => {
			const state = createSchedulerState(FORMAT, 600, order);
			const first = generateRotation(state);
			applyElapsed(state, first, 600);
			const next = new Set(Object.values(generateRotation(state).zones).flat());
			return Object.values(first.zones)
				.flat()
				.filter((id) => next.has(id)).length;
		};
		expect(stays(forwards)).toBe(stays(backwards));
	});
});

describe("full-match simulation", () => {
	it.each([
		[240, 5],
		[300, 4],
		[400, 3],
	])(
		"7v7, 10 players, swaps every %i s over %i swaps: nobody stays on longer than two swaps",
		(interval, rotations) => {
			const state = createSchedulerState(FORMAT, interval, ids(10));
			const longest = longestStretches(state, rotations, interval);
			for (const seconds of Object.values(longest)) {
				expect(seconds).toBeLessThanOrEqual(2 * interval);
			}
		},
	);

	it.each([8, 9, 10, 11])(
		"keeps the match fair over a full match with %i players",
		(n) => {
			const state = createSchedulerState(FORMAT, 600, ids(n));
			for (let i = 0; i < 6; i++) {
				applyElapsed(state, generateRotation(state), 600);
			}
			expect(fairnessSpread(state)).toBeLessThanOrEqual(600);
		},
	);
});
