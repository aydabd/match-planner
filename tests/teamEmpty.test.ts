import { describe, expect, it } from "vitest";
import {
	EMPTY_PLAYER_NOTES_FILE,
	withDevelopment,
} from "../src/core/playerNotes.js";
import { newRoster } from "../src/core/storage.js";
import { saveDraft } from "../src/ui/draftStorage.js";
import { keepMatchFiles } from "../src/ui/matchFileStorage.js";
import { savePlayerNotes } from "../src/ui/playerNotesStorage.js";
import { activeTeamIsEmpty } from "../src/ui/teamEmpty.js";
import { createTeam } from "../src/ui/teamStorage.js";
import { makeMatchFile } from "./support/matchFiles.js";
import { useMemoryStorage } from "./support/memoryStorage.js";

describe("activeTeamIsEmpty", () => {
	useMemoryStorage();

	it("is true for a team nothing has been saved in", () => {
		expect(activeTeamIsEmpty()).toBe(true);
	});

	it("is false once the team has a match", () => {
		keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
		expect(activeTeamIsEmpty()).toBe(false);
	});

	it("is false once the team has player notes", () => {
		savePlayerNotes(
			withDevelopment(EMPTY_PLAYER_NOTES_FILE, "alva", {
				date: "2026-09-01",
				area: "physical",
				note: "x",
			}),
		);
		expect(activeTeamIsEmpty()).toBe(false);
	});

	it("is false once the team has a squad with players", () => {
		saveDraft(
			newRoster({
				formatId: "7v7:2-3-1",
				players: [{ id: "p1", name: "Alva" }],
			}),
		);
		expect(activeTeamIsEmpty()).toBe(false);
	});

	it("looks only at the active team", () => {
		keepMatchFiles([makeMatchFile({ matchId: "m1" })]);
		createTeam("Nytt lag");
		expect(activeTeamIsEmpty()).toBe(true);
	});
});
