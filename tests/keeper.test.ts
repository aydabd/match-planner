import { describe, expect, it } from "vitest";
import { FORMATS, getFormat, outfieldCount } from "../src/core/formations.js";
import { changeKeeper } from "../src/core/match.js";
import {
	applyElapsed,
	createSchedulerState,
	fairnessSpread,
	generateRotation,
} from "../src/core/scheduler.js";
import type { MutableAssignment } from "../src/core/types.js";

const FORMAT_7V7 = getFormat("7v7:2-3-1");

function ids(n: number): string[] {
	return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

function onPitch(assignment: { zones: Record<string, readonly string[]> }) {
	return Object.values(assignment.zones).flat();
}

describe("the goalkeeper and the rotation", () => {
	it("keeps the keeper out of the outfield and off the bench", () => {
		const state = createSchedulerState(FORMAT_7V7, 600, ids(9), "p1");
		const assignment = generateRotation(state);

		expect(onPitch(assignment)).not.toContain("p1");
		expect(assignment.bench).not.toContain("p1");
		expect(onPitch(assignment)).toHaveLength(6);
		expect(assignment.bench).toHaveLength(2);
	});

	it("counts the keeper's minutes as playtime, without an outfield zone", () => {
		const state = createSchedulerState(FORMAT_7V7, 600, ids(8), "p1");
		applyElapsed(state, generateRotation(state), 600);

		expect(state.players.p1?.totalSeconds).toBe(600);
		expect(state.players.p1?.zonesPlayed).toEqual([]);
	});

	it("needs enough outfield players besides the keeper", () => {
		const state = createSchedulerState(FORMAT_7V7, 600, ids(6), "p1");
		expect(() => generateRotation(state)).toThrow();
	});

	it.each(Object.keys(FORMATS))(
		"%s: the keeper stays in goal all match and fairness still holds",
		(formatId) => {
			const format = getFormat(formatId);
			const state = createSchedulerState(
				format,
				600,
				ids(outfieldCount(format) + 3),
				"p1",
			);
			for (let r = 0; r < 6; r++) {
				const assignment = generateRotation(state);
				expect(onPitch(assignment)).not.toContain("p1");
				applyElapsed(state, assignment, 600);
			}
			expect(state.players.p1?.totalSeconds).toBe(3600);
			// The keeper plays every minute; outfield players share the rest.
			const outfield = { ...state, order: state.order.slice(1) };
			expect(fairnessSpread(outfield)).toBeLessThanOrEqual(1200);
		},
	);
});

describe("changeKeeper", () => {
	/** p1 in goal; p2-p7 on the pitch; p8, p9 on the bench. */
	function match() {
		const state = createSchedulerState(FORMAT_7V7, 600, ids(9), "p1");
		const assignment: MutableAssignment = {
			zones: { back: ["p2", "p3"], mid: ["p4", "p5", "p6"], fwd: ["p7"] },
			bench: ["p8", "p9"],
		};
		return { state, assignment };
	}

	it("brings a bench player into goal and sends the old keeper to the bench", () => {
		const { state, assignment } = match();

		changeKeeper(state, assignment, "p8");

		expect(state.keeperId).toBe("p8");
		expect(assignment.bench).toEqual(["p9", "p1"]);
		expect(onPitch(assignment)).toEqual(["p2", "p3", "p4", "p5", "p6", "p7"]);
	});

	it("lets the old keeper take the seat of an outfield player who goes in goal", () => {
		const { state, assignment } = match();

		changeKeeper(state, assignment, "p4");

		expect(state.keeperId).toBe("p4");
		expect(assignment.zones.mid).toEqual(["p1", "p5", "p6"]);
		expect(assignment.bench).toEqual(["p8", "p9"]);
	});

	it("fills the seat from the bench if the old keeper may not play there", () => {
		const { state, assignment } = match();
		// The old keeper has played back and mid; attack is not adjacent to back.
		state.players.p1?.zonesPlayed.push("back", "mid");

		changeKeeper(state, assignment, "p7");

		expect(state.keeperId).toBe("p7");
		expect(assignment.zones.fwd).toEqual(["p8"]);
		expect(assignment.bench).toEqual(["p9", "p1"]);
	});

	it("does nothing when the chosen player is already in goal", () => {
		const { state, assignment } = match();
		const before = structuredClone(assignment);

		changeKeeper(state, assignment, "p1");

		expect(state.keeperId).toBe("p1");
		expect(assignment).toEqual(before);
	});

	it("never leaves anyone in two places", () => {
		for (const next of ["p4", "p7", "p8"]) {
			const { state, assignment } = match();
			changeKeeper(state, assignment, next);
			const everyone = [
				...onPitch(assignment),
				...assignment.bench,
				state.keeperId,
			];
			expect(new Set(everyone).size).toBe(everyone.length);
			expect(everyone).toHaveLength(9);
		}
	});
});
