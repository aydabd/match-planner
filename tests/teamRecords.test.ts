import { describe, expect, it } from "vitest";
import { keepMatchFiles } from "../src/ui/matchFileStorage.js";
import { deviceTeamRecords } from "../src/ui/teamRecords.js";
import { activeTeamId, createTeam, switchTeam } from "../src/ui/teamStorage.js";
import { makeMatchFile } from "./support/matchFiles.js";
import { useMemoryStorage } from "./support/memoryStorage.js";

describe("deviceTeamRecords.matchSummaries", () => {
	useMemoryStorage();

	it("summarises the team's kept matches in the period", async () => {
		keepMatchFiles([
			makeMatchFile({ matchId: "m1", seed: 1, date: "2025-09-01" }),
			makeMatchFile({ matchId: "m2", seed: 2, date: "2026-09-01" }),
		]);
		const teamId = activeTeamId();

		const season = await deviceTeamRecords.matchSummaries(teamId, {
			kind: "season",
			year: 2026,
		});
		expect(new Set(season.map((s) => s.matchId))).toEqual(new Set(["m2"]));
		expect(season.every((s) => s.teamId === teamId)).toBe(true);

		const all = await deviceTeamRecords.matchSummaries(teamId, {
			kind: "recentMatches",
			count: 8,
		});
		expect(new Set(all.map((s) => s.matchId))).toEqual(new Set(["m1", "m2"]));
	});

	it("reads the team it is asked about, not the active one", async () => {
		keepMatchFiles([makeMatchFile({ matchId: "first" })]);
		const first = activeTeamId();
		switchTeam(createTeam("Andra laget").id);

		const summaries = await deviceTeamRecords.matchSummaries(first, {
			kind: "recentMatches",
			count: 8,
		});
		expect(summaries.map((s) => s.matchId)).toContain("first");
		expect(
			await deviceTeamRecords.matchSummaries(activeTeamId(), {
				kind: "recentMatches",
				count: 8,
			}),
		).toEqual([]);
	});
});
