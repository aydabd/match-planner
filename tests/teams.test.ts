import { describe, expect, it } from "vitest";
import {
	EMPTY_TEAMS_FILE,
	parseTeamsFile,
	TeamsError,
	teamsFileToJson,
	withActiveTeam,
	withRenamedTeam,
	withTeam,
} from "../src/core/teams.js";

describe("TeamsFile - parsing and round trip", () => {
	it("round-trips an empty file through JSON", () => {
		expect(
			parseTeamsFile(JSON.parse(teamsFileToJson(EMPTY_TEAMS_FILE))),
		).toEqual(EMPTY_TEAMS_FILE);
	});

	it("round-trips a file with teams and an active team", () => {
		const withP8 = withTeam(EMPTY_TEAMS_FILE, { id: "t1", name: "P8" });
		const withBoth = withActiveTeam(
			withTeam(withP8, { id: "t2", name: "P11" }),
			"t1",
		);
		expect(parseTeamsFile(JSON.parse(teamsFileToJson(withBoth)))).toEqual(
			withBoth,
		);
	});

	it.each([
		["not an object", "null"],
		["an array", "[]"],
		["missing schemaVersion", "{}"],
		["wrong schemaVersion", JSON.stringify({ schemaVersion: 2, teams: [] })],
		["teams not a list", JSON.stringify({ schemaVersion: 1, teams: "nope" })],
		[
			"a team missing a name",
			JSON.stringify({ schemaVersion: 1, teams: [{ id: "t1" }] }),
		],
		[
			"a team with an empty id",
			JSON.stringify({
				schemaVersion: 1,
				teams: [{ id: "", name: "P8" }],
			}),
		],
		[
			"activeTeamId not a string or null",
			JSON.stringify({ schemaVersion: 1, teams: [], activeTeamId: 1 }),
		],
	])("rejects %s", (_, raw) => {
		expect(() => parseTeamsFile(JSON.parse(raw))).toThrow(TeamsError);
	});
});

describe("withTeam", () => {
	it("adds a new team", () => {
		const file = withTeam(EMPTY_TEAMS_FILE, { id: "t1", name: "P8" });
		expect(file.teams).toEqual([{ id: "t1", name: "P8" }]);
	});

	it("replaces a team with the same id instead of duplicating it", () => {
		const file = withTeam(
			withTeam(EMPTY_TEAMS_FILE, { id: "t1", name: "P8" }),
			{ id: "t1", name: "P8 5v5" },
		);
		expect(file.teams).toEqual([{ id: "t1", name: "P8 5v5" }]);
	});

	it("leaves activeTeamId untouched", () => {
		const file = withTeam(withActiveTeam(EMPTY_TEAMS_FILE, "t1"), {
			id: "t2",
			name: "P11",
		});
		expect(file.activeTeamId).toBe("t1");
	});
});

describe("withActiveTeam", () => {
	it("sets the active team id", () => {
		expect(withActiveTeam(EMPTY_TEAMS_FILE, "t1").activeTeamId).toBe("t1");
	});

	it("leaves the team list untouched", () => {
		const withP8 = withTeam(EMPTY_TEAMS_FILE, { id: "t1", name: "P8" });
		expect(withActiveTeam(withP8, "t1").teams).toEqual(withP8.teams);
	});
});

describe("withRenamedTeam", () => {
	it("renames the team with the given id", () => {
		const withP8 = withTeam(EMPTY_TEAMS_FILE, { id: "t1", name: "P8" });
		expect(withRenamedTeam(withP8, "t1", "P8 5v5").teams).toEqual([
			{ id: "t1", name: "P8 5v5" },
		]);
	});

	it("is a no-op when no team has that id", () => {
		const withP8 = withTeam(EMPTY_TEAMS_FILE, { id: "t1", name: "P8" });
		expect(withRenamedTeam(withP8, "missing", "X")).toEqual(withP8);
	});
});
