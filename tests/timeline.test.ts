import { describe, expect, it } from "vitest";
import {
	recordLineup,
	secondsPlayed,
	swapDelays,
	type TimelineEvent,
} from "../src/core/timeline.js";

const START = { zones: { back: ["a", "b"], fwd: ["c"] }, bench: ["d"] };

describe("recordLineup", () => {
	it("records the lineup and keeper when they change", () => {
		const timeline: TimelineEvent[] = [];
		recordLineup(timeline, 0, START, "k");

		expect(timeline).toEqual([
			{
				type: "lineup",
				at: 0,
				zones: { back: ["a", "b"], fwd: ["c"] },
				keeperId: "k",
			},
		]);
	});

	it("skips a lineup that is the same as the last one", () => {
		const timeline: TimelineEvent[] = [];
		recordLineup(timeline, 0, START, null);
		recordLineup(timeline, 30, structuredClone(START), null);

		expect(timeline).toHaveLength(1);
	});

	it("keeps its own copy, so later edits don't change the history", () => {
		const timeline: TimelineEvent[] = [];
		const lineup = structuredClone(START);
		recordLineup(timeline, 0, lineup, null);
		lineup.zones.back[0] = "zz";

		expect(timeline[0]).toMatchObject({ zones: { back: ["a", "b"] } });
	});
});

describe("secondsPlayed", () => {
	const timeline: TimelineEvent[] = [
		{ type: "periodStart", at: 0, period: 1 },
		{
			type: "lineup",
			at: 0,
			zones: { back: ["a", "b"], fwd: ["c"] },
			keeperId: "k",
		},
		{
			type: "lineup",
			at: 300,
			zones: { back: ["a", "d"], fwd: ["c"] },
			keeperId: "k",
		},
		{ type: "periodEnd", at: 600, period: 1 },
		{ type: "periodStart", at: 600, period: 2 },
		{
			type: "lineup",
			at: 600,
			zones: { back: ["b", "d"], fwd: ["a"] },
			keeperId: "c",
		},
		{ type: "periodEnd", at: 900, period: 2 },
	];

	it("adds up minutes per player and per line, only while a period is on", () => {
		expect(secondsPlayed(timeline, 900)).toEqual({
			a: { total: 900, byZone: { back: 600, fwd: 300 } },
			b: { total: 600, byZone: { back: 600 } },
			c: { total: 900, byZone: { fwd: 600, goal: 300 } },
			d: { total: 600, byZone: { back: 600 } },
			k: { total: 600, byZone: { goal: 600 } },
		});
	});

	it("counts a period in progress up to now", () => {
		expect(secondsPlayed(timeline.slice(0, 3), 450).a).toEqual({
			total: 450,
			byZone: { back: 450 },
		});
	});

	it("gives the same result however often it is computed", () => {
		expect(secondsPlayed(timeline, 900)).toEqual(secondsPlayed(timeline, 900));
	});

	it("per-line minutes always add up to the total", () => {
		for (const player of Object.values(secondsPlayed(timeline, 900))) {
			const sum = Object.values(player.byZone).reduce((s, n) => s + n, 0);
			expect(sum).toBe(player.total);
		}
	});
});

describe("swapDelays", () => {
	it("lists how early or late each substitution was made", () => {
		const timeline: TimelineEvent[] = [
			{
				type: "substitution",
				at: 630,
				plannedAt: 600,
				period: 1,
				inId: "d",
				outId: "b",
				zoneId: "back",
				moves: [],
			},
			{
				type: "substitution",
				at: 590,
				plannedAt: 600,
				period: 1,
				inId: "e",
				outId: "c",
				zoneId: "fwd",
				moves: [],
			},
		];

		expect(swapDelays(timeline)).toEqual([
			{ inId: "d", outId: "b", plannedAt: 600, at: 630, delaySeconds: 30 },
			{ inId: "e", outId: "c", plannedAt: 600, at: 590, delaySeconds: -10 },
		]);
	});
});
