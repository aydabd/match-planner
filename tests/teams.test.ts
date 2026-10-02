import { describe, expect, it } from "vitest";
import {
	EMPTY_TEAMS_FILE,
	parseTeamsFile,
	TeamsError,
	teamsFileToJson,
	withActiveTeam,
	withRenamedTeam,
	withTeam,
	withTeamIdChanged,
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

	it("trims and caps the name at LIMITS.teamNameLength", () => {
		const file = withTeam(EMPTY_TEAMS_FILE, {
			id: "t1",
			name: `  ${"x".repeat(100)}  `,
		});
		expect(file.teams[0]?.name).toBe("x".repeat(40));
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

	it("trims and caps the new name at LIMITS.teamNameLength", () => {
		const withP8 = withTeam(EMPTY_TEAMS_FILE, { id: "t1", name: "P8" });
		const renamed = withRenamedTeam(withP8, "t1", `  ${"y".repeat(100)}  `);
		expect(renamed.teams[0]?.name).toBe("y".repeat(40));
	});

	it("is a no-op when no team has that id", () => {
		const withP8 = withTeam(EMPTY_TEAMS_FILE, { id: "t1", name: "P8" });
		expect(withRenamedTeam(withP8, "missing", "X")).toEqual(withP8);
	});
});

describe("withTeamIdChanged - adopting the id a Drive folder belongs to (#135)", () => {
	const two = withActiveTeam(
		withTeam(withTeam(EMPTY_TEAMS_FILE, { id: "t1", name: "P8" }), {
			id: "t2",
			name: "P11",
		}),
		"t1",
	);

	it("gives the team its new id, keeping its name and place, and follows it as the active team", () => {
		const changed = withTeamIdChanged(two, "t1", "new-id");
		expect(changed.teams.map((t) => [t.id, t.name]).sort()).toEqual([
			["new-id", "P8"],
			["t2", "P11"],
		]);
		expect(changed.activeTeamId).toBe("new-id");
	});

	it("leaves the active team alone when another team changes id", () => {
		expect(withTeamIdChanged(two, "t2", "new-id").activeTeamId).toBe("t1");
	});

	it("refuses an id another team already has, which would merge two teams", () => {
		expect(() => withTeamIdChanged(two, "t1", "t2")).toThrow(TeamsError);
	});

	it("refuses a team that does not exist", () => {
		expect(() => withTeamIdChanged(two, "nope", "new-id")).toThrow(TeamsError);
	});

	it("does not touch the file it was given", () => {
		const before = JSON.stringify(two);
		withTeamIdChanged(two, "t1", "new-id");
		expect(JSON.stringify(two)).toBe(before);
	});
});

describe("withTeamIdChanged with a name (#142)", () => {
	const file = withActiveTeam(
		withTeam(EMPTY_TEAMS_FILE, { id: "t1", name: "Mitt lag" }),
		"t1",
	);

	it("also renames the team when a name is given, trimmed and capped", () => {
		const changed = withTeamIdChanged(file, "t1", "new-id", "  P11 Blå ");
		expect(changed.teams).toEqual([{ id: "new-id", name: "P11 Blå" }]);
		const long = withTeamIdChanged(file, "t1", "new-id", "x".repeat(100));
		expect(long.teams[0]?.name).toHaveLength(40);
	});

	it("keeps the name when none is given, or only blanks", () => {
		expect(withTeamIdChanged(file, "t1", "new-id").teams[0]?.name).toBe(
			"Mitt lag",
		);
		expect(withTeamIdChanged(file, "t1", "new-id", "   ").teams[0]?.name).toBe(
			"Mitt lag",
		);
	});
});
