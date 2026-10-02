import { describe, expect, it } from "vitest";
import type { CollectedTeam } from "../src/core/importCollect.js";
import {
	EMPTY_PLAYER_NOTES_FILE,
	withDevelopment,
} from "../src/core/playerNotes.js";
import { newRoster } from "../src/core/storage.js";
import { loadDraft } from "../src/ui/draftStorage.js";
import { importTeam } from "../src/ui/importApply.js";
import { loadMatchFiles } from "../src/ui/matchFileStorage.js";
import { loadPlayerNotes } from "../src/ui/playerNotesStorage.js";
import {
	activeTeamId,
	createTeam,
	listTeams,
	switchTeam,
} from "../src/ui/teamStorage.js";
import { makeMatchFile } from "./support/matchFiles.js";
import { useMemoryStorage } from "./support/memoryStorage.js";

const INCOMING = "33333333-3333-4333-8333-333333333333";
const group = (
	teamId: string | null,
	ids: string[],
	name = "",
): CollectedTeam => ({
	teamId,
	name,
	data: {
		matches: ids.map((matchId, i) => makeMatchFile({ matchId, seed: i + 1 })),
		notes: [],
		squads: [],
	},
});
const note = (text: string) =>
	withDevelopment(EMPTY_PLAYER_NOTES_FILE, "alva", {
		date: "2026-09-01",
		area: "physical",
		note: text,
	});

describe("importTeam", () => {
	useMemoryStorage();

	it("merges team-less files into the active team", () => {
		const outcome = importTeam(group(null, ["a", "b"]), null);
		expect(outcome).toMatchObject({
			kind: "applied",
			applied: { added: 2 },
			offered: 2,
		});
		expect(loadMatchFiles()).toHaveLength(2);
	});

	it("changes nothing when the same files are imported again", () => {
		importTeam(group(null, ["a", "b"]), null);
		const before = JSON.stringify(loadMatchFiles());
		const outcome = importTeam(group(null, ["a", "b"]), null);
		expect(outcome).toMatchObject({
			kind: "applied",
			applied: { added: 0, notesChanged: false, squadTaken: false },
		});
		expect(JSON.stringify(loadMatchFiles())).toBe(before);
	});

	it("lets an empty team take on the id and name of a team in the files", () => {
		const outcome = importTeam(null, group(INCOMING, ["a"], "Lag A"));
		expect(outcome).toMatchObject({ kind: "applied", applied: { added: 1 } });
		expect(activeTeamId()).toBe(INCOMING);
		expect(listTeams().find((t) => t.id === INCOMING)?.name).toBe("Lag A");
	});

	it("merges the team-less files into the same team in one go", () => {
		const loose = group(null, ["a"]);
		loose.data.notes.push(note("x"));
		const outcome = importTeam(loose, group(INCOMING, ["b"], "Lag A"));
		expect(outcome).toMatchObject({ kind: "applied", offered: 2 });
		expect(loadMatchFiles()).toHaveLength(2);
		expect(loadPlayerNotes().players).toHaveLength(1);
	});

	it("takes the squad only when the team has none", () => {
		const team = group(null, []);
		team.data.squads.push(
			newRoster({ formatId: "7v7", players: [{ id: "p1", name: "Alva" }] }),
		);
		importTeam(team, null);
		expect(loadDraft().players).toHaveLength(1);
	});

	it("asks, with the numbers, when a team with data gets another team's files, and changes nothing", () => {
		importTeam(group(null, ["mine"]), null);
		const id = activeTeamId();
		const outcome = importTeam(null, group(INCOMING, ["a", "b"], "Lag A"));
		expect(outcome).toEqual({
			kind: "ask",
			teamId: INCOMING,
			name: "Lag A",
			counts: { local: 1, incoming: 2, merged: 3 },
		});
		expect(activeTeamId()).toBe(id);
		expect(loadMatchFiles().map((m) => m.audit.matchId)).toEqual(["mine"]);
	});

	it('"new" makes a new team and leaves the existing one exactly as it was', () => {
		importTeam(group(null, ["mine"]), null);
		const mine = activeTeamId();
		const outcome = importTeam(null, group(INCOMING, ["a"], "Lag A"), "new");
		expect(outcome).toMatchObject({ kind: "applied", applied: { added: 1 } });
		expect(activeTeamId()).toBe(INCOMING);
		expect(listTeams().map((t) => t.id)).toEqual([mine, INCOMING]);
		expect(loadMatchFiles().map((m) => m.audit.matchId)).toEqual(["a"]);
		switchTeam(mine);
		expect(loadMatchFiles().map((m) => m.audit.matchId)).toEqual(["mine"]);
	});

	it('"merge" leaves nothing out and makes the team take on the files\' id', () => {
		importTeam(group(null, ["mine"]), null);
		const name = listTeams()[0]?.name;
		const outcome = importTeam(
			null,
			group(INCOMING, ["a", "b"], "Lag A"),
			"merge",
		);
		expect(outcome).toMatchObject({ kind: "applied", applied: { added: 2 } });
		expect(listTeams()).toEqual([{ id: INCOMING, name }]);
		expect(
			loadMatchFiles()
				.map((m) => m.audit.matchId)
				.sort(),
		).toEqual(["a", "b", "mine"]);
	});

	it("refuses an id another team on this device already has", () => {
		const mine = activeTeamId();
		const other = createTeam("Annat").id;
		switchTeam(mine);
		const outcome = importTeam(null, group(other, ["a"]));
		expect(outcome).toEqual({
			kind: "refused",
			reason: "belongsToOtherLocalTeam",
		});
		expect(loadMatchFiles()).toEqual([]);
	});
});
