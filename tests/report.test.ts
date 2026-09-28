import { describe, expect, it } from "vitest";
import { POLICY } from "../src/core/policy.js";
import {
	buildReport,
	isStoredReport,
	restFlag,
	type StoredReport,
	withReport,
} from "../src/core/report.js";
import {
	secondsPlayed,
	secondsPlayedByPeriod,
	type TimelineEvent,
} from "../src/core/timeline.js";

const PLAYERS = ["a", "b", "c", "d", "k"].map((id) => ({
	id,
	name: id.toUpperCase(),
}));

/** Two 10-minute periods, a and b out on the pitch at first, c and d swap in. */
function timeline(delays: { first: number; second: number }): TimelineEvent[] {
	return [
		{ type: "periodStart", at: 0, period: 1 },
		{
			type: "lineup",
			at: 0,
			zones: { back: ["a"], fwd: ["b"] },
			keeperId: "k",
		},
		{
			type: "substitution",
			at: 300 + delays.first,
			plannedAt: 300,
			period: 1,
			inId: "c",
			zoneId: "back",
			moves: [],
			outId: "a",
		},
		{
			type: "lineup",
			at: 300 + delays.first,
			zones: { back: ["c"], fwd: ["b"] },
			keeperId: "k",
		},
		{ type: "periodEnd", at: 600, period: 1 },
		{ type: "periodStart", at: 600, period: 2 },
		{
			type: "lineup",
			at: 600,
			zones: { back: ["a"], fwd: ["d"] },
			keeperId: "k",
		},
		{
			type: "substitution",
			at: 900 + delays.second,
			plannedAt: 900,
			period: 2,
			inId: "b",
			zoneId: "fwd",
			moves: [],
			outId: "d",
		},
		{
			type: "lineup",
			at: 900 + delays.second,
			zones: { back: ["a"], fwd: ["b"] },
			keeperId: "k",
		},
		{ type: "periodEnd", at: 1200, period: 2 },
	];
}

const report = (
	delays = { first: 0, second: 0 },
	extra: TimelineEvent[] = [],
) =>
	buildReport({
		timeline: [...timeline(delays), ...extra],
		players: PLAYERS,
		endedAt: 1200,
		rotationSeconds: 300,
	});

describe("playtime in the report", () => {
	it("gives each player's total, per period and per line", () => {
		const a = report().players.find((p) => p.id === "a");
		expect(a).toMatchObject({
			totalSeconds: 300 + 600 - 0, // period 1 to 300, all of period 2
			periodSeconds: [300, 600],
			zoneSeconds: { back: 900 },
		});
		expect(report().players.find((p) => p.id === "k")).toMatchObject({
			totalSeconds: 1200,
			zoneSeconds: { goal: 1200 },
		});
	});

	it("adds the periods up to the total for every player", () => {
		for (const p of report({ first: 40, second: 75 }).players) {
			expect(p.periodSeconds.reduce((s, v) => s + v, 0)).toBe(p.totalSeconds);
			expect(Object.values(p.zoneSeconds).reduce((s, v) => s + v, 0)).toBe(
				p.totalSeconds,
			);
		}
	});

	it("matches secondsPlayed exactly, whatever the swap delays", () => {
		for (let first = 0; first <= 90; first += 15) {
			for (let second = 0; second <= 90; second += 15) {
				const events = timeline({ first, second });
				const total = secondsPlayed(events, 1200);
				const periods = secondsPlayedByPeriod(events, 1200);
				for (const [id, played] of Object.entries(total)) {
					expect(periods.reduce((s, p) => s + (p[id] ?? 0), 0)).toBe(
						played.total,
					);
				}
			}
		}
	});

	it("counts a period that was cut short by ending the match", () => {
		const cut: TimelineEvent[] = timeline({ first: 0, second: 0 }).slice(0, 4);
		const r = buildReport({
			timeline: cut,
			players: PLAYERS,
			endedAt: 420,
			rotationSeconds: 300,
		});
		expect(r.periods).toBe(1);
		expect(r.players.find((p) => p.id === "c")?.totalSeconds).toBe(120);
	});
});

describe("substitution deviation", () => {
	it("gives planned, actual and delay for every swap", () => {
		expect(report({ first: 45, second: -10 }).swaps).toEqual([
			expect.objectContaining({
				inName: "C",
				outName: "A",
				period: 1,
				plannedAt: 300,
				at: 345,
				delaySeconds: 45,
			}),
			expect.objectContaining({ period: 2, at: 890, delaySeconds: -10 }),
		]);
	});

	it("summarises the average and counts swaps over 30 s and 1 min late", () => {
		const { swapSummary } = report({ first: 75, second: 35 });
		expect(swapSummary).toMatchObject({
			count: 2,
			averageDelaySeconds: 55,
			maxDelaySeconds: 75,
			lateCount: 2,
			veryLateCount: 1,
			averageDelayByPeriod: [75, 35],
		});
	});

	it("reports the earliest swap as the worst when every swap was early", () => {
		const { swapSummary } = report({ first: -20, second: -50 });
		expect(swapSummary.maxDelaySeconds).toBe(-50);
		expect(swapSummary.averageDelaySeconds).toBe(-35);
		expect(swapSummary.lateCount).toBe(0);
	});

	it("does not count exactly 30 s as late", () => {
		expect(
			report({ first: POLICY.lateSwapSeconds, second: 0 }).swapSummary
				.lateCount,
		).toBe(0);
	});
});

describe("feedback", () => {
	it("says when swaps were on time and playtime was even", () => {
		const even = buildReport({
			timeline: timeline({ first: 5, second: 5 }),
			players: PLAYERS.filter((p) => p.id !== "c" && p.id !== "d"),
			endedAt: 1200,
			rotationSeconds: 300,
		});
		expect(even.feedback).toContainEqual({
			code: "swapsOnTime",
			averageSeconds: 5,
		});
	});

	it("points out the period where swaps ran late", () => {
		expect(report({ first: 0, second: 100 }).feedback).toContainEqual({
			code: "swapsLate",
			averageSeconds: 100,
			period: 2,
		});
	});

	it("points out a player far below the team average, not one who was hurt", () => {
		const r = report();
		expect(r.feedback).toContainEqual(
			expect.objectContaining({ code: "playerBelowAverage", playerId: "d" }),
		);

		const hurt = report({ first: 0, second: 0 }, [
			{ type: "outForMatch", at: 700, period: 2, playerId: "d" },
		]);
		expect(hurt.feedback).not.toContainEqual(
			expect.objectContaining({ playerId: "d" }),
		);
	});

	it("reports no swaps when there were none", () => {
		const r = buildReport({
			timeline: [
				{ type: "periodStart", at: 0, period: 1 },
				{ type: "lineup", at: 0, zones: { back: ["a"] }, keeperId: null },
				{ type: "periodEnd", at: 600, period: 1 },
			],
			players: PLAYERS.slice(0, 1),
			endedAt: 600,
			rotationSeconds: 300,
		});
		expect(r.feedback[0]).toEqual({ code: "noSwaps" });
	});
});

describe("kept reports", () => {
	const stored = (matchId: string, opponent = "IFK") =>
		({
			schemaVersion: 1,
			matchId,
			savedAt: "2026-09-28T10:00:00.000Z",
			createdBy: "Tränare",
			appVersion: "0.6.0",
			formatLabel: "7v7 2-3-1",
			match: { opponent, venue: "", date: "" },
			report: report(),
		}) as const;

	it("accepts a report it made itself", () => {
		expect(isStoredReport(structuredClone(stored("m1")))).toBe(true);
	});

	it.each([
		["no match id", { ...stored("m1"), matchId: "" }],
		["a broken timestamp", { ...stored("m1"), savedAt: "yesterday" }],
		["another version", { ...stored("m1"), schemaVersion: 2 }],
		["no report", { ...stored("m1"), report: null }],
		[
			"a rest with an unknown flag",
			(() => {
				const bad = structuredClone(stored("m1"));
				const player = bad.report.players[0];
				if (player)
					player.rests = [
						{ startedAt: 0, endedAt: 10, seconds: 10, flag: "odd" as never },
					];
				return bad;
			})(),
		],
		[
			"a player without minutes",
			{
				...stored("m1"),
				report: { ...report(), players: [{ id: "a", name: "A" }] },
			},
		],
	])("refuses a report with %s", (_why, value) => {
		expect(isStoredReport(value)).toBe(false);
	});

	it("keeps one report per match, newest first, and only the newest few", () => {
		let kept: StoredReport[] = [];
		for (const id of ["m1", "m2", "m3"]) kept = withReport(kept, stored(id), 2);
		expect(kept.map((r) => r.matchId)).toEqual(["m3", "m2"]);

		kept = withReport(kept, stored("m2", "Nytt namn"), 2);
		expect(kept.map((r) => r.matchId)).toEqual(["m2", "m3"]);
		expect(kept[0]?.match.opponent).toBe("Nytt namn");
	});
});

describe("rest times in the report", () => {
	/** a rests 60 s (out at 100, back at 160); c rests 400 s (from 0 to 400). */
	const restTimeline: TimelineEvent[] = [
		{ type: "periodStart", at: 0, period: 1 },
		{
			type: "lineup",
			at: 0,
			zones: { back: ["a"], fwd: ["b"] },
			keeperId: "k",
		},
		{
			type: "lineup",
			at: 100,
			zones: { back: ["d"], fwd: ["b"] },
			keeperId: "k",
		},
		{
			type: "substitution",
			at: 160,
			plannedAt: 150,
			period: 1,
			inId: "a",
			zoneId: "back",
			moves: [],
			outId: "d",
		},
		{
			type: "lineup",
			at: 160,
			zones: { back: ["a"], fwd: ["b"] },
			keeperId: "k",
		},
		{
			type: "substitution",
			at: 400,
			plannedAt: 400,
			period: 1,
			inId: "c",
			zoneId: "fwd",
			moves: [],
			outId: "b",
		},
		{
			type: "lineup",
			at: 400,
			zones: { back: ["a"], fwd: ["c"] },
			keeperId: "k",
		},
		{ type: "periodEnd", at: 1500, period: 1 },
	];
	const built = (rotationSeconds: number) =>
		buildReport({
			timeline: restTimeline,
			players: PLAYERS,
			endedAt: 1500,
			rotationSeconds,
		});

	it("lists every rest with its length", () => {
		const a = built(600).players.find((p) => p.id === "a");
		expect(a?.rests).toEqual([
			{ startedAt: 100, endedAt: 160, seconds: 60, flag: "short" },
		]);
	});

	it("says how long the player coming on had rested", () => {
		const swaps = built(600).swaps;
		expect(swaps.map((s) => [s.inName, s.inRestedSeconds])).toEqual([
			["A", 60],
			["C", 400],
		]);
	});

	it("flags a rest shorter than the limit but not one at the limit", () => {
		const short = built(600).feedback.filter((f) => f.code === "shortRest");
		// d sat out from kickoff to 100 s, a from 100 to 160 s; shortest first.
		expect(short).toEqual([
			{ code: "shortRest", playerId: "a", seconds: 60 },
			{ code: "shortRest", playerId: "d", seconds: 100 },
		]);
		expect(restFlag(POLICY.shortRestSeconds, true, 9999)).toBeNull();
		expect(restFlag(POLICY.shortRestSeconds - 1, true, 9999)).toBe("short");
	});

	it("flags a rest longer than two swap intervals, also one that lasts to the end", () => {
		// Interval 5 min: more than 10 min is long. d rests from 160 to the end (1340 s).
		const long = built(300).feedback.filter((f) => f.code === "longRest");
		expect(long).toContainEqual({
			code: "longRest",
			playerId: "d",
			seconds: 1340,
		});
		expect(
			built(600).feedback.filter((f) => f.code === "longRest"),
		).toContainEqual({
			code: "longRest",
			playerId: "d",
			seconds: 1340,
		});
		expect(restFlag(600, false, 600)).toBeNull();
		expect(restFlag(601, false, 600)).toBe("long");
		// Only a finished rest can be too short.
		expect(restFlag(10, false, 600)).toBeNull();
	});
});
