import { describe, expect, it } from "vitest";
import type { SeasonHistory } from "../src/core/history.js";
import type { PlayerNotesFile } from "../src/core/playerNotes.js";
import {
	buildSeasonReport,
	isSeasonReport,
	seasonReportToJson,
} from "../src/core/seasonReport.js";

const history: SeasonHistory = {
	matches: 2,
	months: ["2026-01"],
	players: [
		{
			key: "alva",
			name: "Alva",
			squadMatches: 2,
			playedMatches: 1,
			started: 1,
			startedOnBench: 1,
			totalSeconds: 900,
			averageSeconds: 450,
			zoneSeconds: {},
			months: [{ month: "2026-01", seconds: 900, matches: 2 }],
			recent: { started: 1, of: 2 },
		},
	],
};

const notes: PlayerNotesFile = {
	schemaVersion: 1,
	players: [
		{
			key: "alva",
			availability: [
				{ matchId: "m1", status: "available" },
				{ matchId: "m2", status: "absent", reason: "illness" },
			],
			development: [
				{ date: "2026-01-10", area: "technical", note: "Passningar" },
			],
		},
	],
};

describe("season reports", () => {
	it("builds objective stats and editable summaries from season data", () => {
		expect(
			buildSeasonReport(history, notes, "2026-02-01T12:00:00.000Z"),
		).toEqual({
			schemaVersion: 1,
			generatedAt: "2026-02-01T12:00:00.000Z",
			players: [
				{
					key: "alva",
					name: "Alva",
					matches: { squad: 2, played: 1, started: 1 },
					playtimeSeconds: { total: 900, average: 450 },
					availability: {
						present: 1,
						absent: 1,
						reasons: { illness: 1 },
					},
					developmentSummary: [
						{ area: "physical", summary: "" },
						{ area: "mental", summary: "" },
						{ area: "technical", summary: "Passningar" },
						{ area: "tactical", summary: "" },
					],
				},
			],
		});
	});

	it("serializes a report and recognizes only valid report shapes", () => {
		const report = buildSeasonReport(
			history,
			notes,
			"2026-02-01T12:00:00.000Z",
		);
		expect(isSeasonReport(JSON.parse(seasonReportToJson(report)))).toBe(true);
		expect(isSeasonReport({ ...report, schemaVersion: 2 })).toBe(false);
		expect(isSeasonReport({ ...report, players: [] })).toBe(false);
	});
});
