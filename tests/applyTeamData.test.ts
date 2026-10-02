import { describe, expect, it } from "vitest";
import {
	EMPTY_PLAYER_NOTES_FILE,
	withDevelopment,
} from "../src/core/playerNotes.js";
import { newRoster } from "../src/core/storage.js";
import type { TeamData } from "../src/core/teamData.js";
import { applyTeamData } from "../src/ui/applyTeamData.js";
import { loadDraft, saveDraft } from "../src/ui/draftStorage.js";
import { loadMatchFiles } from "../src/ui/matchFileStorage.js";
import {
	loadPlayerNotes,
	savePlayerNotes,
} from "../src/ui/playerNotesStorage.js";
import { makeMatchFile } from "./support/matchFiles.js";
import { useMemoryStorage } from "./support/memoryStorage.js";

const note = (text: string) =>
	withDevelopment(EMPTY_PLAYER_NOTES_FILE, "alva", {
		date: "2026-09-01",
		area: "physical",
		note: text,
	});
const squad = (name: string, createdAt: string) => ({
	...newRoster({ formatId: "7v7", players: [{ id: "p1", name }] }),
	audit: { createdAt, createdBy: "t", appVersion: "0.1.0" },
});
const data = (partial: Partial<TeamData>): TeamData => ({
	matches: [],
	notes: [],
	squads: [],
	...partial,
});

describe("applyTeamData", () => {
	useMemoryStorage();

	it("counts only the matches that are new", () => {
		const m1 = makeMatchFile({ matchId: "m1" });
		const m2 = makeMatchFile({ matchId: "m2", seed: 2 });
		expect(applyTeamData(data({ matches: [m1] })).added).toBe(1);
		expect(applyTeamData(data({ matches: [m1, m2] })).added).toBe(1);
		expect(
			loadMatchFiles()
				.map((m) => m.audit.matchId)
				.sort(),
		).toEqual(["m1", "m2"]);
	});

	it("combines notes from two devices whatever the order", () => {
		const a = note("a");
		const b = note("b");
		applyTeamData(data({ notes: [a, b] }));
		const forward = loadPlayerNotes();
		savePlayerNotes(EMPTY_PLAYER_NOTES_FILE);
		applyTeamData(data({ notes: [b, a] }));
		expect(loadPlayerNotes()).toEqual(forward);
		expect(forward.players[0]?.development).toHaveLength(2);
	});

	it("keeps the notes already on the device", () => {
		savePlayerNotes(note("kept"));
		const result = applyTeamData(data({ notes: [note("new")] }));
		expect(result.notesChanged).toBe(true);
		expect(loadPlayerNotes().players[0]?.development).toHaveLength(2);
	});

	it("takes the newest squad only when the team has none", () => {
		const result = applyTeamData(
			data({
				squads: [
					squad("Gammal", "2026-01-01T00:00:00.000Z"),
					squad("Ny", "2026-06-01T00:00:00.000Z"),
				],
			}),
		);
		expect(result.squadTaken).toBe(true);
		expect(loadDraft().players[0]?.name).toBe("Ny");
	});

	it("leaves an existing squad alone", () => {
		saveDraft(squad("Egen", "2026-01-01T00:00:00.000Z"));
		const result = applyTeamData(
			data({ squads: [squad("Annan", "2026-06-01T00:00:00.000Z")] }),
		);
		expect(result.squadTaken).toBe(false);
		expect(loadDraft().players[0]?.name).toBe("Egen");
	});

	it("changes nothing the second time", () => {
		const input = data({
			matches: [makeMatchFile({ matchId: "m1" })],
			notes: [note("a")],
			squads: [squad("Ny", "2026-06-01T00:00:00.000Z")],
		});
		expect(applyTeamData(input)).toEqual({
			added: 1,
			notesChanged: true,
			squadTaken: true,
		});
		expect(applyTeamData(input)).toEqual({
			added: 0,
			notesChanged: false,
			squadTaken: false,
		});
	});

	it("removes nothing", () => {
		const local = makeMatchFile({ matchId: "local" });
		applyTeamData(data({ matches: [local] }));
		applyTeamData(data({ matches: [makeMatchFile({ matchId: "other" })] }));
		expect(loadMatchFiles().map((m) => m.audit.matchId)).toContain("local");
	});
});
