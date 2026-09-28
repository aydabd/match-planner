import { describe, expect, it } from "vitest";
import { getFormat, outfieldCount } from "../src/core/formations.js";
import {
	addPlayer,
	applyElapsed,
	canAssignZone,
	createSchedulerState,
	fairnessSpread,
	generateRotation,
	SchedulingError,
	setUnavailable,
} from "../src/core/scheduler.js";
import type { FormatConfig, SchedulerState } from "../src/core/types.js";

const FORMAT_7V7 = getFormat("7v7");

function ids(n: number): string[] {
	return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

function simulate(state: SchedulerState, rotations: number): void {
	for (let i = 0; i < rotations; i++) {
		const assignment = generateRotation(state);
		applyElapsed(state, assignment, state.rotationSeconds);
	}
}

describe("generateRotation - single rotation shape", () => {
	it("fills every zone to its configured count and puts the rest on the bench", () => {
		const state = createSchedulerState(FORMAT_7V7, 600, ids(9));
		const assignment = generateRotation(state);

		expect(assignment.zones.back).toHaveLength(2);
		expect(assignment.zones.mid).toHaveLength(3);
		expect(assignment.zones.fwd).toHaveLength(1);
		expect(assignment.bench).toHaveLength(9 - outfieldCount(FORMAT_7V7));
	});

	it("assigns every player exactly once (no duplicates, none missing)", () => {
		const state = createSchedulerState(FORMAT_7V7, 600, ids(11));
		const assignment = generateRotation(state);
		const onPitch = Object.values(assignment.zones).flat();
		const everyone = [...onPitch, ...assignment.bench];
		expect(new Set(everyone).size).toBe(11);
		expect(everyone).toHaveLength(11);
	});

	it("throws SchedulingError with too few available players for the format", () => {
		const state = createSchedulerState(FORMAT_7V7, 600, ids(5));
		expect(() => generateRotation(state)).toThrow(SchedulingError);
	});

	it("never selects an unavailable player", () => {
		const state = createSchedulerState(FORMAT_7V7, 600, ids(9));
		setUnavailable(state, "p1", true);
		const assignment = generateRotation(state);
		const onPitch = Object.values(assignment.zones).flat();
		expect(onPitch).not.toContain("p1");
		expect(assignment.bench).not.toContain("p1");
	});
});

describe("canAssignZone - the never-attack-to-defence rule", () => {
	it("allows a brand new player anywhere", () => {
		const state = createSchedulerState(FORMAT_7V7, 600, ids(1));
		const player = state.players.p1;
		expect(player).toBeDefined();
		if (!player) return;
		expect(canAssignZone(player, "back", FORMAT_7V7)).toBe(true);
		expect(canAssignZone(player, "fwd", FORMAT_7V7)).toBe(true);
	});

	it("allows a second zone only if adjacent to the first", () => {
		const state = createSchedulerState(FORMAT_7V7, 600, ids(1));
		const player = state.players.p1;
		expect(player).toBeDefined();
		if (!player) return;
		player.zonesPlayed.push("back");
		expect(canAssignZone(player, "mid", FORMAT_7V7)).toBe(true); // adjacent
		expect(canAssignZone(player, "fwd", FORMAT_7V7)).toBe(false); // NOT adjacent - forbidden
	});

	it("never allows a third distinct zone, even if it would be adjacent", () => {
		const state = createSchedulerState(FORMAT_7V7, 600, ids(1));
		const player = state.players.p1;
		expect(player).toBeDefined();
		if (!player) return;
		player.zonesPlayed.push("back", "mid");
		expect(canAssignZone(player, "fwd", FORMAT_7V7)).toBe(false);
		// re-visiting an already-played zone is always fine though
		expect(canAssignZone(player, "back", FORMAT_7V7)).toBe(true);
	});
});

describe("full-match simulation - property tests", () => {
	const squadSizes = [8, 9, 10, 11];

	it.each(squadSizes)(
		"never lets any of %i players accumulate non-adjacent zones over a full match",
		(n) => {
			const state = createSchedulerState(FORMAT_7V7, 600, ids(n));
			simulate(state, 6); // 6 rotations = a full 60-minute match at 10-min rotations

			for (const player of Object.values(state.players)) {
				expect(player.zonesPlayed.length).toBeLessThanOrEqual(2);
				if (player.zonesPlayed.length === 2) {
					const [a, b] = player.zonesPlayed as [string, string];
					const zoneA = FORMAT_7V7.zones.find((z) => z.id === a);
					expect(zoneA).toBeDefined();
					if (!zoneA) return;
					expect(zoneA.adjacent.includes(b)).toBe(true);
				}
			}
		},
	);

	it.each(squadSizes)(
		"keeps playtime reasonably fair across %i players after a full match",
		(n) => {
			const state = createSchedulerState(FORMAT_7V7, 600, ids(n));
			simulate(state, 6);
			// With uneven squad/zone ratios perfect equality isn't always possible
			// (see the README's fairness note), but nobody should be left behind
			// by more than a couple of rotations' worth of time.
			expect(fairnessSpread(state)).toBeLessThanOrEqual(
				2 * state.rotationSeconds,
			);
		},
	);

	it("keeps working through a late arrival mid-match without breaking any invariant", () => {
		const state = createSchedulerState(FORMAT_7V7, 600, ids(8));
		simulate(state, 2);
		addPlayer(state, "late1");
		simulate(state, 4);

		expect(Object.keys(state.players)).toHaveLength(9);
		const late = state.players.late1;
		expect(late).toBeDefined();
		if (!late) return;
		expect(late.zonesPlayed.length).toBeLessThanOrEqual(2);
	});

	it("keeps working when a player is marked unavailable mid-match", () => {
		const state = createSchedulerState(FORMAT_7V7, 600, ids(9));
		simulate(state, 2);
		setUnavailable(state, "p3", true);
		expect(() => simulate(state, 4)).not.toThrow();

		// p3 should not have accrued any more time after being ruled out
		const secondsAfterInjury = state.players.p3?.totalSeconds;
		simulate(state, 1);
		expect(state.players.p3?.totalSeconds).toBe(secondsAfterInjury);
	});

	it("throws a clear SchedulingError instead of silently breaking the rule when infeasible", () => {
		// Every single active player is already locked into the back/mid pool -
		// nobody at all is eligible for the one forward slot, so a fair
		// rotation genuinely cannot be built. The scheduler must say so loudly
		// rather than quietly putting a "back" player up front.
		const state = createSchedulerState(FORMAT_7V7, 600, ids(7));
		for (const id of ids(7)) {
			state.players[id]?.zonesPlayed.push("back");
		}
		expect(() => generateRotation(state)).toThrow(SchedulingError);
	});
});

/** A back-to-front line-up such as 4-3-3, built inline so this file needs no presets. */
function formation(...lines: number[]): FormatConfig {
	const names = {
		2: ["back", "fwd"],
		3: ["back", "mid", "fwd"],
		4: ["back", "dmid", "amid", "fwd"],
		5: ["back", "dmid", "mid", "amid", "fwd"],
	}[lines.length] as string[];
	return {
		id: lines.join("-"),
		label: lines.join("-"),
		zones: lines.map((count, i) => ({
			id: names[i] ?? `z${i}`,
			label: names[i] ?? `z${i}`,
			count,
			adjacent: [names[i - 1], names[i + 1]].filter(
				(z): z is string => z !== undefined,
			),
		})),
		squadSizeHint: [0, 0],
		defaultRotationSeconds: 600,
	};
}

describe("any formation - full-match simulation", () => {
	const FORMATIONS = [
		[1, 2, 1],
		[2, 1, 1],
		[2, 2],
		[1, 1, 1, 1],
		[2, 3, 1],
		[3, 2, 1],
		[2, 1, 2, 1],
		[1, 1, 2, 1, 1],
		[3, 3, 2],
		[3, 2, 3],
		[3, 4, 1],
		[2, 2, 2, 2],
		[4, 4, 2],
		[4, 3, 3],
		[4, 2, 3, 1],
		[4, 2, 1, 2, 1],
		[3, 4, 2, 1],
	];
	/** From a full team with no bench up to five substitutes. */
	const BENCH_SIZES = [0, 1, 2, 3, 4, 5];
	const cases = FORMATIONS.flatMap((lines) =>
		BENCH_SIZES.map((bench) => [lines.join("-"), bench, lines] as const),
	);

	it.each(cases)(
		"%s with %i on the bench plays a full match fairly without breaking the zone rule",
		(_, bench, lines) => {
			const format = formation(...lines);
			const state = createSchedulerState(
				format,
				600,
				ids(outfieldCount(format) + bench),
			);

			expect(() => simulate(state, 6)).not.toThrow();

			for (const player of Object.values(state.players)) {
				expect(player.zonesPlayed.length).toBeLessThanOrEqual(2);
				if (player.zonesPlayed.length === 2) {
					const [a, b] = player.zonesPlayed as [string, string];
					const zoneA = format.zones.find((z) => z.id === a);
					expect(zoneA?.adjacent, `${player.id}: ${a} -> ${b}`).toContain(b);
				}
			}
			expect(fairnessSpread(state)).toBeLessThanOrEqual(
				2 * state.rotationSeconds,
			);
		},
	);

	it("rests the players who have played the most", () => {
		const state = createSchedulerState(formation(2, 3, 1), 600, ids(8));
		applyElapsed(state, { zones: { mid: ["p1", "p2"] }, bench: [] }, 600);

		expect(generateRotation(state).bench).toEqual(["p1", "p2"]);
	});
});
