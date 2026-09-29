import { describe, expect, it } from "vitest";
import {
	LIMITS,
	numberWithin,
	rotationSecondsFrom,
} from "../src/core/limits.js";

describe("rotationSecondsFrom", () => {
	it.each([
		["8", 480],
		["1", 60],
		["30", 1800],
		["0", 60],
		["45", 1800],
		// Half-minute steps: rounds to the nearest 30 seconds.
		["7.5", 450],
		["7.6", 450],
		["7.76", 480],
	])("reads %j minutes as %i seconds", (input, seconds) => {
		expect(rotationSecondsFrom(input, 600)).toBe(seconds);
	});

	it.each(["", "abc", "NaN"])(
		"keeps the current seconds for %j instead of guessing",
		(input) => {
			expect(rotationSecondsFrom(input, 720)).toBe(720);
		},
	);

	it("keeps half-minute precision from the current value too", () => {
		// 450s = 7.5 min; re-reading it as input must not round it to 8 min.
		expect(rotationSecondsFrom("7.5", 450)).toBe(450);
	});

	it("stays within the allowed range", () => {
		expect(LIMITS.rotationMinutes.min).toBeGreaterThanOrEqual(1);
		expect(LIMITS.rotationMinutes.max).toBeGreaterThan(
			LIMITS.rotationMinutes.min,
		);
	});
});

describe("temporary swap lengths", () => {
	it("are whole minutes, shortest first", () => {
		const seconds = [...LIMITS.tempSwapSeconds];
		expect(seconds).toEqual([...seconds].sort((a, b) => a - b));
		for (const s of seconds) expect(s % 60).toBe(0);
	});
});

describe("numberWithin", () => {
	it.each([
		["3", 3],
		["0", 1],
		["9", 4],
		["2.4", 2],
		["", 2],
	])("reads %j as %i periods", (input, periods) => {
		expect(numberWithin(input, LIMITS.periods, 2)).toBe(periods);
	});
});
