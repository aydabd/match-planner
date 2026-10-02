import { describe, expect, it } from "vitest";
import {
	readItem,
	STORAGE_KEYS,
	teamScoped,
	writeItem,
} from "../src/ui/appStorage.js";
import {
	activeTeamId,
	activeTeamName,
	adoptTeamId,
	createTeam,
	createTeamWithId,
	listTeams,
	otherTeamIds,
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

	describe("adoptTeamId (#135)", () => {
		it("gives the active team the new id and moves its saved data along", () => {
			const old = activeTeamId();
			writeItem(teamScoped(STORAGE_KEYS.matches, old), "[matches]");
			writeItem(teamScoped(STORAGE_KEYS.driveFolderId, old), "folder-1");

			expect(adoptTeamId("adopted-id")).toBe(true);

			expect(activeTeamId()).toBe("adopted-id");
			expect(listTeams().map((t) => t.id)).toEqual(["adopted-id"]);
			expect(readItem(teamScoped(STORAGE_KEYS.matches, "adopted-id"))).toBe(
				"[matches]",
			);
			expect(
				readItem(teamScoped(STORAGE_KEYS.driveFolderId, "adopted-id")),
			).toBe("folder-1");
			expect(readItem(teamScoped(STORAGE_KEYS.matches, old))).toBeNull();
			expect(readItem(teamScoped(STORAGE_KEYS.driveFolderId, old))).toBeNull();
		});

		it("refuses an id another team on this device already has, changing nothing", () => {
			const first = listTeams()[0]?.id ?? "";
			const second = createTeam("P11 7v7");
			writeItem(teamScoped(STORAGE_KEYS.matches, second.id), "[second]");

			expect(adoptTeamId(first)).toBe(false);

			expect(activeTeamId()).toBe(second.id);
			expect(readItem(teamScoped(STORAGE_KEYS.matches, second.id))).toBe(
				"[second]",
			);
		});

		it("takes the folder's team name too when given one (#142)", () => {
			expect(adoptTeamId("adopted-id", "P11 Blå")).toBe(true);
			expect(listTeams()).toEqual([{ id: "adopted-id", name: "P11 Blå" }]);
		});

		it("does nothing when asked to adopt the id the team already has", () => {
			const id = activeTeamId();
			expect(adoptTeamId(id)).toBe(true);
			expect(activeTeamId()).toBe(id);
		});
	});

	it("lists the ids of the teams other than the active one", () => {
		const first = listTeams()[0]?.id ?? "";
		expect(otherTeamIds()).toEqual([]);
		const second = createTeam("P11 7v7");
		expect(otherTeamIds()).toEqual([first]);
		switchTeam(first);
		expect(otherTeamIds()).toEqual([second.id]);
	});

	it("reports the active team's name", () => {
		createTeam("P11 7v7");
		expect(activeTeamName()).toBe("P11 7v7");
	});

	it("creates a team with a given id, named, and makes it active", () => {
		const id = "33333333-3333-4333-8333-333333333333";
		const created = createTeamWithId(id, "Från Drive");
		expect(created).toEqual({ id, name: "Från Drive" });
		expect(listTeams().map((t) => t.id)).toContain(id);
		expect(activeTeamId()).toBe(id);
	});

	it("refuses a team id that already exists and changes nothing", () => {
		const existing = listTeams()[0]?.id as string;
		const before = listTeams();
		expect(() => createTeamWithId(existing, "Dubblett")).toThrow();
		expect(listTeams()).toEqual(before);
	});
});
