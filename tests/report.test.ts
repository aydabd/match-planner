import { describe, expect, it } from "vitest";
import { POLICY } from "../src/core/policy.js";
import {
	buildReport,
	isStoredReport,
	type StoredReport,
	substitutionUsage,
	totalRestSeconds,
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
			id: "swap-1",
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
			id: "swap-2",
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
		rules: { kind: "free" },
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
			rules: { kind: "free" },
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
			rules: { kind: "free" },
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

	it("does not count a keeper's guaranteed time against outfield fairness", () => {
		// a and b split the two periods evenly outfield (600s each); k keeps
		// goal the whole match (1200s) - a and b are perfectly even with each
		// other and should not be flagged just because k, doing the job a
		// keeper is meant to do, played more.
		const r = buildReport({
			timeline: [
				{ type: "periodStart", at: 0, period: 1 },
				{ type: "lineup", at: 0, zones: { back: ["a"] }, keeperId: "k" },
				{ type: "periodEnd", at: 600, period: 1 },
				{ type: "periodStart", at: 600, period: 2 },
				{ type: "lineup", at: 600, zones: { back: ["b"] }, keeperId: "k" },
				{ type: "periodEnd", at: 1200, period: 2 },
			],
			players: [
				{ id: "a", name: "A" },
				{ id: "b", name: "B" },
				{ id: "k", name: "K" },
			],
			endedAt: 1200,
			rules: { kind: "free" },
		});
		expect(r.feedback).toContainEqual({
			code: "evenPlaytime",
			spreadSeconds: 0,
		});
		expect(r.feedback).not.toContainEqual(
			expect.objectContaining({ code: "playerBelowAverage" }),
		);
	});

	it("falls back to everyone who played when the whole squad rotates through goal", () => {
		// a, b and c all take a turn in goal at some point, so none of them is
		// "outfield only" - the fairness comparison must still reflect their
		// real, uneven playtime (900/1200/900) instead of an empty pool
		// reading as a meaningless "Snitt 0:00, perfectly even".
		const r = buildReport({
			timeline: [
				{ type: "periodStart", at: 0, period: 1 },
				{ type: "lineup", at: 0, zones: { back: ["b"] }, keeperId: "a" },
				{ type: "periodEnd", at: 600, period: 1 },
				{ type: "periodStart", at: 600, period: 2 },
				{ type: "lineup", at: 600, zones: { back: ["c"] }, keeperId: "b" },
				{ type: "periodEnd", at: 1200, period: 2 },
				{ type: "periodStart", at: 1200, period: 3 },
				{ type: "lineup", at: 1200, zones: { back: ["a"] }, keeperId: "c" },
				{ type: "periodEnd", at: 1500, period: 3 },
			],
			players: [
				{ id: "a", name: "A" },
				{ id: "b", name: "B" },
				{ id: "c", name: "C" },
			],
			endedAt: 1500,
			rules: { kind: "free" },
		});
		expect(r.playtime).toEqual({ averageSeconds: 1000, spreadSeconds: 300 });
		expect(r.feedback).toContainEqual({
			code: "evenPlaytime",
			spreadSeconds: 300,
		});
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
			rules: { kind: "free" },
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
			"no substitution rules",
			{
				...stored("m1"),
				report: { ...report(), substitutions: undefined },
			},
		],
		[
			"a deviation breaking an unknown rule",
			{
				...stored("m1"),
				report: {
					...report(),
					substitutions: {
						...report().substitutions,
						deviations: [
							{
								eventId: "s",
								at: 1,
								period: 1,
								inId: "a",
								outId: "b",
								rules: ["tooFast"],
							},
						],
					},
				},
			},
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

	it("still loads a report saved with the old rest flags", () => {
		const old = structuredClone(stored("m1"));
		const player = old.report.players[0];
		if (player)
			player.rests = [
				{ startedAt: 0, endedAt: 10, seconds: 10, flag: "short" } as never,
			];
		expect(isStoredReport(old)).toBe(true);
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
			id: "swap-3",
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
			id: "swap-4",
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
	const built = () =>
		buildReport({
			timeline: restTimeline,
			players: PLAYERS,
			endedAt: 1500,
			rules: { kind: "free" },
		});

	it("lists every rest with its length", () => {
		const a = built().players.find((p) => p.id === "a");
		expect(a?.rests).toEqual([{ startedAt: 100, endedAt: 160, seconds: 60 }]);
	});

	it("says how long the player coming on had rested", () => {
		const swaps = built().swaps;
		expect(swaps.map((s) => [s.inName, s.inRestedSeconds])).toEqual([
			["A", 60],
			["C", 400],
		]);
	});

	it("lists a rest without any warning flag", () => {
		const a = built().players.find((p) => p.id === "a");
		expect(a?.rests[0]).not.toHaveProperty("flag");
	});

	it("gives no feedback about how short or long a rest was", () => {
		const codes = built().feedback.map((f) => f.code as string);
		expect(codes).not.toContain("shortRest");
		expect(codes).not.toContain("longRest");
	});

	it("adds a player's rests up to the time rested", () => {
		const report = built();
		const rested = (id: string) =>
			totalRestSeconds(report.players.find((p) => p.id === id)?.rests ?? []);
		// a rested 60 s, c rested 400 s and the keeper never rested.
		expect(rested("a")).toBe(60);
		expect(rested("c")).toBe(400);
		expect(rested("k")).toBe(0);
	});

	it("makes played and rested time add up to the match length", () => {
		const report = built();
		for (const p of report.players) {
			if (p.status !== "played") continue;
			expect(p.totalSeconds + totalRestSeconds(p.rests)).toBe(1500);
		}
	});
});

describe("substitutionUsage: limited swaps counted from the timeline", () => {
	const RULES = {
		kind: "limited",
		substitutesIn: 2,
		occasions: 2,
		reEntry: false,
	} as const;
	const kickoff: TimelineEvent[] = [
		{ type: "periodStart", at: 0, period: 1 },
		{
			type: "lineup",
			at: 0,
			zones: { back: ["a"], fwd: ["b"] },
			keeperId: "k",
		},
	];
	const swap = (
		id: string,
		at: number,
		inId: string,
		outId: string,
		plannedAt = at,
	): TimelineEvent => ({
		type: "substitution",
		id,
		at,
		plannedAt,
		period: 1,
		inId,
		zoneId: "back",
		moves: [],
		outId,
	});

	it("is within the rules exactly at the limits", () => {
		const usage = substitutionUsage(
			[...kickoff, swap("s1", 100, "c", "a"), swap("s2", 200, "d", "b")],
			RULES,
		);
		expect(usage).toEqual({ substitutesIn: 2, occasions: 2, deviations: [] });
	});

	it("lists a substitute and an occasion one past the limits", () => {
		const usage = substitutionUsage(
			[
				...kickoff,
				swap("s1", 100, "c", "a"),
				swap("s2", 200, "d", "b"),
				swap("s3", 300, "e", "c"),
			],
			RULES,
		);
		expect(usage.substitutesIn).toBe(3);
		expect(usage.occasions).toBe(3);
		expect(usage.deviations).toEqual([
			{
				eventId: "s3",
				at: 300,
				period: 1,
				inId: "e",
				outId: "c",
				rules: ["substitutesIn", "occasions"],
			},
		]);
	});

	it("counts swaps due at the same moment as one occasion, however far apart they are made", () => {
		const usage = substitutionUsage(
			[
				...kickoff,
				swap("s1", 600, "c", "a", 600),
				swap("s2", 615, "d", "b", 600),
			],
			{ ...RULES, occasions: 1 },
		);
		expect(usage).toMatchObject({ occasions: 1, deviations: [] });
	});

	it("does not count a swap in a break as an occasion, but counts its player", () => {
		const usage = substitutionUsage(
			[
				...kickoff,
				{ type: "periodEnd", at: 1200, period: 1 },
				swap("s1", 1200, "c", "a"),
				{ type: "periodStart", at: 1200, period: 2 },
			],
			{ ...RULES, occasions: 1, substitutesIn: 1 },
		);
		expect(usage).toEqual({ substitutesIn: 1, occasions: 0, deviations: [] });
	});

	it("lists a replaced player coming back when re-entry is not allowed", () => {
		const timeline = [
			...kickoff,
			swap("s1", 100, "c", "a"),
			{
				type: "lineup",
				at: 100,
				zones: { back: ["c"], fwd: ["b"] },
				keeperId: "k",
			},
			swap("s2", 100, "a", "c"),
		] as TimelineEvent[];
		const usage = substitutionUsage(timeline, RULES);
		expect(usage.substitutesIn).toBe(1);
		expect(usage.deviations).toEqual([
			expect.objectContaining({ eventId: "s2", rules: ["reEntry"] }),
		]);
		expect(
			substitutionUsage(timeline, { ...RULES, reEntry: true }).deviations,
		).toEqual([]);
	});

	it("has no limits with free swaps, and no limit on occasions when there is none", () => {
		const many = [
			...kickoff,
			...["c", "d", "e"].map((id, i) => swap(`s${i}`, 100 * (i + 1), id, "a")),
		];
		expect(substitutionUsage(many, { kind: "free" }).deviations).toEqual([]);
		expect(
			substitutionUsage(many, { ...RULES, substitutesIn: 3, occasions: null })
				.deviations,
		).toEqual([]);
	});

	it("is part of the match report", () => {
		const r = buildReport({
			timeline: [...kickoff, swap("s1", 100, "c", "a")],
			players: PLAYERS,
			endedAt: 600,
			rules: RULES,
		});
		expect(r.substitutions).toEqual({
			rules: RULES,
			substitutesIn: 1,
			occasions: 1,
			deviations: [],
		});
	});
});
