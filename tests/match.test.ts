import { describe, expect, it } from "vitest";
import { getFormat } from "../src/core/formations.js";
import {
	cloneAssignment,
	formatTime,
	generateRotationSafe,
	lineupChanges,
	resetPlayers,
	revertTempSwap,
	swapWithBench,
	takeOutForMatch,
	tickTempSwaps,
	undoTempSwaps,
} from "../src/core/match.js";
import {
	applyElapsed,
	createSchedulerState,
	generateRotation,
	setUnavailable,
} from "../src/core/scheduler.js";
import type { MutableAssignment, SchedulerState } from "../src/core/types.js";

const FORMAT_7V7 = getFormat("7v7");

/** A fixed 7v7 lineup so every test reads the same way. */
function lineup(): MutableAssignment {
	return {
		zones: { back: ["b1", "b2"], mid: ["m1", "m2", "m3"], fwd: ["f1"] },
		bench: ["x1", "x2"],
	};
}

function stateFor(assignment: MutableAssignment): SchedulerState {
	const ids = [...Object.values(assignment.zones).flat(), ...assignment.bench];
	return createSchedulerState(FORMAT_7V7, 600, ids);
}

describe("formatTime", () => {
	it.each([
		[0, "00:00"],
		[5, "00:05"],
		[75, "01:15"],
		[600, "10:00"],
		[3599, "59:59"],
		[59.9, "00:59"],
	])("formats %s seconds as %s", (seconds, expected) => {
		expect(formatTime(seconds)).toBe(expected);
	});
});

describe("cloneAssignment", () => {
	it("copies the lineup so edits never leak back into the rotation", () => {
		const rotation = generateRotation(
			createSchedulerState(FORMAT_7V7, 600, ["a", "b", "c", "d", "e", "f"]),
		);
		const copy = cloneAssignment(rotation);
		copy.zones.mid?.push("extra");
		copy.bench.push("extra");
		expect(rotation.zones.mid).not.toContain("extra");
		expect(rotation.bench).not.toContain("extra");
	});
});

describe("generateRotationSafe", () => {
	it("returns the normal rotation when one is possible", () => {
		const state = createSchedulerState(FORMAT_7V7, 600, [
			"a",
			"b",
			"c",
			"d",
			"e",
			"f",
		]);
		expect(generateRotationSafe(state)).toEqual(generateRotation(state));
	});

	it("puts everyone on the bench instead of throwing when the squad is too small", () => {
		const state = createSchedulerState(FORMAT_7V7, 600, ["a", "b", "c"]);
		expect(generateRotationSafe(state)).toEqual({
			zones: { back: [], mid: [], fwd: [] },
			bench: ["a", "b", "c"],
		});
	});
});

describe("lineupChanges", () => {
	it("lists who comes on and who goes off", () => {
		const next = lineup();
		next.zones.mid = ["m1", "x1", "m3"];
		next.zones.fwd = ["x2"];
		expect(lineupChanges(lineup(), next)).toEqual({
			comingIn: ["x1", "x2"],
			goingOut: ["m2", "f1"],
		});
	});

	it("ignores players who only change zone", () => {
		const next = lineup();
		next.zones.mid = ["m1", "m2", "f1"];
		next.zones.fwd = ["m3"];
		expect(lineupChanges(lineup(), next)).toEqual({
			comingIn: [],
			goingOut: [],
		});
	});
});

describe("swapWithBench", () => {
	it("swaps the pitch and bench players in place", () => {
		const assignment = lineup();
		swapWithBench(assignment, "mid", 1, 0, null);
		expect(assignment.zones.mid).toEqual(["m1", "x1", "m3"]);
		expect(assignment.bench).toEqual(["m2", "x2"]);
	});

	it("returns a temporary swap to undo later when given a duration", () => {
		expect(swapWithBench(lineup(), "mid", 1, 0, 120)).toEqual({
			zoneId: "mid",
			idx: 1,
			outId: "m2",
			inId: "x1",
			remainingSeconds: 120,
		});
	});

	it("returns null for a swap that lasts until the next rotation", () => {
		expect(swapWithBench(lineup(), "mid", 1, 0, null)).toBeNull();
	});

	it("does nothing when a slot is empty", () => {
		const assignment = lineup();
		expect(swapWithBench(assignment, "mid", 9, 0, 60)).toBeUndefined();
		expect(swapWithBench(assignment, "mid", 0, 9, 60)).toBeUndefined();
		expect(swapWithBench(assignment, "nope", 0, 0, 60)).toBeUndefined();
		expect(assignment).toEqual(lineup());
	});
});

describe("temporary swaps", () => {
	it("counts down and puts the original player back when time runs out", () => {
		const assignment = lineup();
		const swap = swapWithBench(assignment, "back", 0, 1, 3);
		if (!swap) throw new Error("expected a temporary swap");

		let running = tickTempSwaps(assignment, [swap], 2);
		expect(running).toHaveLength(1);
		expect(running[0]?.remainingSeconds).toBe(1);
		expect(assignment.zones.back).toEqual(["x2", "b2"]);

		running = tickTempSwaps(assignment, running, 1);
		expect(running).toEqual([]);
		expect(assignment).toEqual(lineup());
	});

	it("does not overwrite a slot the coach has changed since", () => {
		const assignment = lineup();
		const swap = swapWithBench(assignment, "back", 0, 0, 60);
		if (!swap) throw new Error("expected a temporary swap");
		// Coach puts x2 in for x1 before the temporary swap ends.
		swapWithBench(assignment, "back", 0, 1, null);

		revertTempSwap(assignment, swap);
		expect(assignment.zones.back).toEqual(["x2", "b2"]);
	});

	it("leaves the lineup alone if the original player is already back on the pitch elsewhere", () => {
		const assignment = lineup();
		const swap = swapWithBench(assignment, "fwd", 0, 0, 60);
		if (!swap) throw new Error("expected a temporary swap");
		// While f1 rests, the coach brings f1 back on in midfield for m1.
		swapWithBench(assignment, "mid", 0, assignment.bench.indexOf("f1"), null);

		revertTempSwap(assignment, swap);

		expect(assignment.zones.fwd).toEqual(["x1"]);
		expect(assignment.zones.mid).toEqual(["f1", "m2", "m3"]);
		const everyone = [
			...Object.values(assignment.zones).flat(),
			...assignment.bench,
		];
		expect(new Set(everyone).size).toBe(everyone.length);
	});

	it("sends the substitute back to the bench without duplicating anyone", () => {
		// Regression: the revert used to look for the substitute on the bench,
		// so the original player ended up on the bench twice and the
		// substitute vanished from the lineup.
		const assignment = lineup();
		const swap = swapWithBench(assignment, "fwd", 0, 0, 60);
		if (!swap) throw new Error("expected a temporary swap");

		revertTempSwap(assignment, swap);
		expect(assignment.zones.fwd).toEqual(["f1"]);
		expect(assignment.bench).toEqual(["x1", "x2"]);
	});

	it("still returns the substitute to the bench if the original player's seat is gone", () => {
		const assignment = lineup();
		const swap = swapWithBench(assignment, "fwd", 0, 0, 60);
		if (!swap) throw new Error("expected a temporary swap");
		assignment.bench = assignment.bench.filter((id) => id !== "f1");

		revertTempSwap(assignment, swap);
		expect(assignment.zones.fwd).toEqual(["f1"]);
		expect(assignment.bench).toEqual(["x2", "x1"]);
	});

	it("returns updated swaps without changing the ones passed in", () => {
		const assignment = lineup();
		const swap = swapWithBench(assignment, "back", 0, 0, 60);
		if (!swap) throw new Error("expected a temporary swap");
		const original = Object.freeze({ ...swap });

		const [running] = tickTempSwaps(assignment, [original], 10);

		expect(running?.remainingSeconds).toBe(50);
		expect(original.remainingSeconds).toBe(60);
	});

	it("undoes every running swap at once", () => {
		const assignment = lineup();
		const swaps = [
			swapWithBench(assignment, "back", 0, 0, 60),
			swapWithBench(assignment, "fwd", 0, 1, 300),
		].filter((s) => s != null);

		undoTempSwaps(assignment, swaps);
		expect(assignment).toEqual(lineup());
	});
});

describe("takeOutForMatch", () => {
	it("marks the player unavailable and brings on the bench player with least playtime", () => {
		const assignment = lineup();
		const state = stateFor(assignment);
		// x1 has played more than x2, so x2 should cover.
		applyElapsed(state, { zones: { mid: ["x1"] }, bench: [] }, 300);

		const cover = takeOutForMatch(state, assignment, "fwd", 0);

		expect(cover).toBe("x2");
		expect(state.players.f1?.unavailable).toBe(true);
		expect(assignment.zones.fwd).toEqual(["x2"]);
		expect(assignment.bench).toEqual(["x1"]);
	});

	it("skips bench players who are already out of the match", () => {
		const assignment = lineup();
		const state = stateFor(assignment);
		setUnavailable(state, "x1", true);

		expect(takeOutForMatch(state, assignment, "mid", 0)).toBe("x2");
	});

	it("plays one short when nobody is left on the bench", () => {
		const assignment = lineup();
		assignment.bench = [];
		const state = stateFor(assignment);

		expect(takeOutForMatch(state, assignment, "mid", 1)).toBeUndefined();
		expect(assignment.zones.mid).toEqual(["m1", "m3"]);
		expect(state.players.m2?.unavailable).toBe(true);
	});

	it("does nothing for an empty slot", () => {
		const assignment = lineup();
		const state = stateFor(assignment);
		expect(takeOutForMatch(state, assignment, "mid", 9)).toBeUndefined();
		expect(assignment).toEqual(lineup());
	});
});

describe("resetPlayers", () => {
	it("clears playtime, zone history and injuries but keeps the squad", () => {
		const assignment = lineup();
		const state = stateFor(assignment);
		applyElapsed(state, assignment, 600);
		setUnavailable(state, "x1", true);

		resetPlayers(state);

		expect(state.order).toHaveLength(8);
		for (const id of state.order) {
			expect(state.players[id]).toEqual({
				id,
				totalSeconds: 0,
				zonesPlayed: [],
				loadInARow: 0,
				unavailable: false,
			});
		}
	});
});
