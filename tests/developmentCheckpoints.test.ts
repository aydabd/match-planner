import { describe, expect, it } from "vitest";
import {
	type CheckpointEvent,
	currentLevel,
	currentTeamSize,
	isValidCheckpointEvent,
	withCheckpointReached,
} from "../src/core/developmentCheckpoints.js";

describe("currentLevel - the highest level reached in one area", () => {
	it("is 0 when there are no events", () => {
		expect(currentLevel([], "technical")).toBe(0);
	});

	it("is the highest level reached, ignoring other areas", () => {
		const events: CheckpointEvent[] = [
			{ area: "technical", level: 1, date: "2026-01-01" },
			{ area: "technical", level: 3, date: "2026-03-01" },
			{ area: "technical", level: 2, date: "2026-02-01" },
			{ area: "mental", level: 4, date: "2026-04-01" },
		];
		expect(currentLevel(events, "technical")).toBe(3);
		expect(currentLevel(events, "mental")).toBe(4);
		expect(currentLevel(events, "physical")).toBe(0);
	});
});

describe("withCheckpointReached - recording a level reached", () => {
	it("adds a level for an area with no events yet", () => {
		expect(withCheckpointReached([], "physical", 1, "2026-05-01")).toEqual([
			{ area: "physical", level: 1, date: "2026-05-01" },
		]);
	});

	it("replaces the date instead of duplicating the same level", () => {
		const first = withCheckpointReached([], "mental", 2, "2026-01-01");
		const second = withCheckpointReached(first, "mental", 2, "2026-06-01");
		expect(second).toEqual([{ area: "mental", level: 2, date: "2026-06-01" }]);
	});

	it("keeps other areas and levels untouched", () => {
		const events: CheckpointEvent[] = [
			{ area: "tactical", level: 1, date: "2026-01-01" },
		];
		const result = withCheckpointReached(events, "tactical", 2, "2026-02-01");
		expect(result).toEqual([
			{ area: "tactical", level: 1, date: "2026-01-01" },
			{ area: "tactical", level: 2, date: "2026-02-01" },
		]);
	});

	it("does not mutate the events it was given", () => {
		const events: CheckpointEvent[] = [];
		withCheckpointReached(events, "physical", 1, "2026-01-01");
		expect(events).toEqual([]);
	});
});

describe("isValidCheckpointEvent", () => {
	it("accepts a well-formed event", () => {
		expect(
			isValidCheckpointEvent({
				area: "technical",
				level: 1,
				date: "2026-01-01",
			}),
		).toBe(true);
	});

	it.each([
		["not an object", "just a string"],
		["null", null],
		[
			"an unrecognised area",
			{ area: "spiritual", level: 1, date: "2026-01-01" },
		],
		[
			"a non-integer level",
			{ area: "physical", level: 1.5, date: "2026-01-01" },
		],
		["level 0", { area: "physical", level: 0, date: "2026-01-01" }],
		["a missing date", { area: "physical", level: 1 }],
		[
			"a date Date.parse accepts but isn't YYYY-MM-DD",
			{ area: "physical", level: 1, date: "September 5, 2026" },
		],
	])("rejects %s", (_, raw) => {
		expect(isValidCheckpointEvent(raw)).toBe(false);
	});
});

describe("currentTeamSize - the squad's team size right now", () => {
	it("falls back to the default when there are no matches yet", () => {
		expect(currentTeamSize([])).toBe("7v7");
	});

	it("is the latest-dated match's team size, regardless of input order", () => {
		const matches = [
			{ formatId: "9v9:3-3-2", date: "2026-05-01" },
			{ formatId: "7v7:2-3-1", date: "2026-01-01" },
		];
		expect(currentTeamSize(matches)).toBe("9v9");
	});
});
