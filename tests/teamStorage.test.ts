import { describe, expect, it } from "vitest";
import {
	activeTeamId,
	createTeam,
	listTeams,
	renameTeam,
	switchTeam,
} from "../src/ui/teamStorage.js";
import { useMemoryStorage } from "./support/memoryStorage.js";

describe("teamStorage", () => {
	useMemoryStorage();

	it("creates a default team on first use, and it is the active one", () => {
		const teams = listTeams();
		expect(teams).toHaveLength(1);
		expect(activeTeamId()).toBe(teams[0]?.id);
	});

	it("keeps returning the same default team across calls", () => {
		const first = listTeams();
		const second = listTeams();
		expect(second).toEqual(first);
	});

	it("creates a new team, named, and makes it the active one", () => {
		const defaultTeam = listTeams()[0];
		const created = createTeam("P11 7v7");
		expect(created.name).toBe("P11 7v7");
		expect(listTeams().map((t) => t.id)).toEqual([defaultTeam?.id, created.id]);
		expect(activeTeamId()).toBe(created.id);
	});

	it("switches the active team", () => {
		const defaultTeam = listTeams()[0];
		const created = createTeam("P11 7v7");
		expect(activeTeamId()).toBe(created.id);

		switchTeam(defaultTeam?.id ?? "");

		expect(activeTeamId()).toBe(defaultTeam?.id);
	});

	it("does nothing when switching to an id no team has", () => {
		const defaultTeam = listTeams()[0];
		switchTeam("no-such-team");
		expect(activeTeamId()).toBe(defaultTeam?.id);
	});

	it("renames a team", () => {
		const defaultTeam = listTeams()[0];
		renameTeam(defaultTeam?.id ?? "", "P8 5v5");
		expect(listTeams()).toEqual([{ id: defaultTeam?.id, name: "P8 5v5" }]);
	});
});
