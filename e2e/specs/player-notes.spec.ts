import { matchFileToJson } from "../../src/core/matchFile.js";
import { makeMatchFile, NAMES } from "../../tests/support/matchFiles.js";
import { expect, test } from "../fixtures.js";

/** Eight matches, the same 9 players every time (LIMITS.recentMatches is 8,
 * so everyone crosses the "no development notes" blind-spot threshold). */
const SQUAD = NAMES.slice(0, 9);
const FILES = Array.from({ length: 8 }, (_, i) => {
	const file = makeMatchFile({
		matchId: `pn-${i}`,
		seed: 20 + i,
		date: `2026-${String(2 + i).padStart(2, "0")}-14`,
		opponent: `Lag ${i + 1}`,
		names: SQUAD,
	});
	return { name: `match-${i}.json`, contents: matchFileToJson(file) };
});

test.describe("Player notes: availability and development", () => {
	test.beforeEach(async ({ setup, history }) => {
		await setup.open();
		await history.open();
		await history.importFiles(FILES);
	});

	test("flags everyone for having no development notes until one is added", async ({
		history,
	}) => {
		await expect(history.playerNotesFeedback).toHaveCount(SQUAD.length);
		await expect(history.playerNotesFeedback.first()).toContainText(
			"ingen utvecklingsanteckning trots 8 matcher i truppen",
		);

		await history.choosePlayerForNotes("Alva");
		await history.addDevelopmentNote({
			area: "Fysiskt",
			note: "Snabbare i vändningar",
		});

		await expect(history.playerNotesFeedback).toHaveCount(SQUAD.length - 1);
		await expect(
			history.playerNotesCard.getByText("Alva: ingen utvecklingsanteckning"),
		).toHaveCount(0);
		await expect(history.developmentNotes()).toHaveText([
			"2026-09-05 · Fysiskt: Snabbare i vändningar",
		]);
	});

	test("flags an absence with no reason, and stops once one is given", async ({
		history,
	}) => {
		await history.choosePlayerForNotes("Bo");
		await history.logAvailability({
			match: "Lag 1 (2026-02-14)",
			status: "Frånvarande",
		});

		await expect(
			history.playerNotesCard.getByText(
				"Bo: 1 frånvaro utan angiven anledning",
			),
		).toBeVisible();

		await history.logAvailability({
			match: "Lag 1 (2026-02-14)",
			status: "Frånvarande",
			reason: "Skada",
			note: "Vrickad fotled",
		});

		await expect(
			history.playerNotesCard.getByText("Bo: 1 frånvaro"),
		).toHaveCount(0);
	});

	test("marking a checkpoint shows up in Översikt and pre-fills Säsongsrapport", async ({
		history,
	}) => {
		await history.choosePlayerForNotes("Dino");
		await expect(
			history.checkpointArea("Tekniskt").getByRole("listitem").first(),
		).not.toHaveClass(/done/);

		await history.markNextLevel("Tekniskt");

		await expect(
			history.checkpointArea("Tekniskt").getByRole("listitem").first(),
		).toHaveClass(/done/);
		await expect(history.seasonReportSummary("Dino", "Tekniskt")).toHaveValue(
			/^Nivå 1 av 4 uppnådd\. /,
		);

		await history.choosePlayerForVisualization("Dino");
		await expect(
			history
				.visualizationCheckpointArea("Tekniskt")
				.getByRole("listitem")
				.first(),
		).toHaveClass(/done/);
	});

	test("keeps notes after a reload", async ({ history, page }) => {
		await history.choosePlayerForNotes("Cleo");
		await history.addDevelopmentNote({ area: "Mentalt", note: "Peppar laget" });
		await history.logAvailability({
			match: "Lag 2 (2026-03-14)",
			status: "Frånvarande",
			reason: "Sjukdom",
		});

		// /statistics/ is a real page (#93): a reload stays there, no need to
		// reopen it from setup.
		await page.reload();
		await history.choosePlayerForNotes("Cleo");

		await expect(history.developmentNotes()).toHaveText([
			"2026-09-05 · Mentalt: Peppar laget",
		]);
		await expect(
			history.playerNotesCard.getByText("Cleo: 1 frånvaro"),
		).toHaveCount(0);
	});
});
