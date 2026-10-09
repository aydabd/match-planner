import { describe, expect, it } from "vitest";
import { keepMatchFiles, loadMatchFiles } from "../src/ui/matchFileStorage.js";
import { deviceTeamRecords } from "../src/ui/teamRecords.js";
import { activeTeamId, createTeam, switchTeam } from "../src/ui/teamStorage.js";
import { makeMatchFile, withSwap } from "./support/matchFiles.js";
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

describe("deviceTeamRecords.saveDeviationNote", () => {
	useMemoryStorage();

	it("keeps the note with its match and replaces an earlier one", async () => {
		keepMatchFiles([withSwap(makeMatchFile({ matchId: "m1" }))]);
		const teamId = activeTeamId();
		const note = {
			matchId: "m1",
			eventId: "swap-1",
			note: "Skada",
			writtenAt: "2026-09-05T13:00:00.000Z",
		};
		expect(await deviceTeamRecords.saveDeviationNote(teamId, note)).toBe(true);
		expect(
			await deviceTeamRecords.saveDeviationNote(teamId, {
				...note,
				note: "Skada, domaren godkände",
				writtenAt: "2026-09-05T14:00:00.000Z",
			}),
		).toBe(true);
		expect(loadMatchFiles(teamId)[0]?.deviationNotes).toEqual([
			{
				...note,
				note: "Skada, domaren godkände",
				writtenAt: "2026-09-05T14:00:00.000Z",
			},
		]);
	});

	it("refuses a note on a swap the match does not have", async () => {
		keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
		expect(
			await deviceTeamRecords.saveDeviationNote(activeTeamId(), {
				matchId: "m1",
				eventId: "swap-9",
				note: "x",
				writtenAt: "2026-09-05T13:00:00.000Z",
			}),
		).toBe(false);
		expect(loadMatchFiles()).toHaveLength(1);
	});

	it("says so when the match is not kept", async () => {
		expect(
			await deviceTeamRecords.saveDeviationNote(activeTeamId(), {
				matchId: "nope",
				eventId: "x",
				note: "x",
				writtenAt: "2026-09-05T13:00:00.000Z",
			}),
		).toBe(false);
	});
});
