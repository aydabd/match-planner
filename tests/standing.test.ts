import { describe, expect, it } from "vitest";
import { buildHistory } from "../src/core/history.js";
import {
	inPeriod,
	type PlayerMatchSummary,
	standing,
	summariesOf,
} from "../src/core/standing.js";
import { makeMatchFile, playerIdMapFor } from "./support/matchFiles.js";

/** One summary; a test only says what matters to it. */
const row = (
	matchId: string,
	date: string,
	playerId: string,
	seconds: number,
	started = false,
): PlayerMatchSummary => ({
	teamId: "team",
	matchId,
	playerId,
	date,
	started,
	seconds,
});

describe("summariesOf", () => {
	it("gives one summary per squad player, adding up to the season history", async () => {
		const file = makeMatchFile({ seed: 3, date: "2026-09-05T10:30" });
		const map = await playerIdMapFor([file]);
		const summaries = summariesOf(file, "team-1", map);
		const history = buildHistory([file], map);

		expect(summaries).toHaveLength(file.squad.players.length);
		for (const s of summaries) {
			const person = history.players.find((p) => p.key === s.playerId);
			expect(s).toMatchObject({
				teamId: "team-1",
				matchId: file.audit.matchId,
				date: "2026-09-05",
				seconds: person?.totalSeconds,
				started: person?.started === 1,
			});
		}
	});

	it("counts two squad entries with the same name as one player", async () => {
		const file = makeMatchFile({ seed: 3 });
		const [first] = file.squad.players;
		if (!first) throw new Error("empty squad");
		file.squad.players.push({ ...first, id: "twin" });
		const map = await playerIdMapFor([file]);
		expect(summariesOf(file, "t", map)).toHaveLength(
			file.squad.players.length - 1,
		);
	});
});

describe("inPeriod", () => {
	const rows = [
		row("m1", "2025-10-01", "a", 1),
		row("m2", "2026-04-01", "a", 1),
		row("m3", "2026-05-01", "a", 1),
		row("m3", "2026-05-01", "b", 1),
		row("m4", "2026-06-01", "a", 1),
	];
	const ids = (period: Parameters<typeof inPeriod>[1]) => [
		...new Set(inPeriod(rows, period).map((r) => r.matchId)),
	];

	it("keeps the team's last N matches, not each player's", () => {
		expect(ids({ kind: "recentMatches", count: 2 })).toEqual(["m3", "m4"]);
		expect(ids({ kind: "recentMatches", count: 50 })).toEqual([
			"m1",
			"m2",
			"m3",
			"m4",
		]);
	});

	it("keeps one calendar year", () => {
		expect(ids({ kind: "season", year: 2026 })).toEqual(["m2", "m3", "m4"]);
		expect(ids({ kind: "season", year: 2024 })).toEqual([]);
	});

	it("keeps the days of a range, both ends included", () => {
		expect(
			ids({ kind: "range", from: "2026-04-01", to: "2026-05-01" }),
		).toEqual(["m2", "m3"]);
	});
});

describe("standing", () => {
	const period = { kind: "recentMatches", count: 8 } as const;

	it("puts the player furthest behind first and the one furthest ahead last", () => {
		const rows = [
			row("m1", "2026-09-01", "ahead", 3000, true),
			row("m1", "2026-09-01", "middle", 2000, true),
			row("m1", "2026-09-01", "behind", 1000),
		];
		const result = standing(rows, period);
		expect(result.map((p) => p.playerId)).toEqual([
			"behind",
			"middle",
			"ahead",
		]);
		expect(result.map((p) => p.aheadSeconds)).toEqual([-1000, 0, 1000]);
		expect(result[2]).toMatchObject({ matches: 1, started: 1, seconds: 3000 });
	});

	it("does not hold a missed match against a player", () => {
		const rows = [
			row("m1", "2026-09-01", "a", 1200),
			row("m1", "2026-09-01", "b", 1200),
			row("m2", "2026-09-08", "a", 1200),
		];
		expect(standing(rows, period).map((p) => p.aheadSeconds)).toEqual([0, 0]);
	});

	it("only counts the matches in the period", () => {
		const rows = [
			row("old", "2025-09-01", "a", 4000),
			row("old", "2025-09-01", "b", 0),
			row("new", "2026-09-01", "a", 1000),
			row("new", "2026-09-01", "b", 1000),
		];
		const result = standing(rows, { kind: "season", year: 2026 });
		expect(result.map((p) => [p.playerId, p.aheadSeconds])).toEqual([
			["a", 0],
			["b", 0],
		]);
	});

	it("breaks a tie by fewer starts, then by id, whatever the input order", () => {
		const rows = [
			row("m1", "2026-09-01", "c", 600, true),
			row("m1", "2026-09-01", "b", 600),
			row("m1", "2026-09-01", "a", 600),
		];
		const order = standing(rows, period).map((p) => p.playerId);
		expect(order).toEqual(["a", "b", "c"]);
		expect(
			standing([...rows].reverse(), period).map((p) => p.playerId),
		).toEqual(order);
	});

	it("is empty without matches", () => {
		expect(standing([], period)).toEqual([]);
	});
});
