import { describe, expect, it } from "vitest";
import {
	LIMITS,
	numberWithin,
	rotationMinutesFrom,
} from "../src/core/limits.js";

describe("rotationMinutesFrom", () => {
	it.each([
		["8", 8],
		["1", 1],
		["30", 30],
		["0", 1],
		["45", 30],
		["7.6", 8],
	])("reads %j as %i minutes", (input, minutes) => {
		expect(rotationMinutesFrom(input, 10)).toBe(minutes);
	});

	it.each(["", "abc", "NaN"])(
		"keeps the current minutes for %j instead of guessing",
		(input) => {
			expect(rotationMinutesFrom(input, 12)).toBe(12);
		},
	);

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
