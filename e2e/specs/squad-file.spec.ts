import { readFile } from "node:fs/promises";
import type { Browser } from "@playwright/test";
import { expect, test } from "../fixtures.js";
import { MatchPage } from "../pages/MatchPage.js";
import { SetupPage } from "../pages/SetupPage.js";
import { SQUAD } from "../support/squads.js";

const TEAM_11 = Array.from({ length: 13 }, (_, i) => `Spelare ${i + 1}`);

/**
 * Another coach's phone: its own browser context, so its own storage.
 * Callers close it when done.
 */
async function openOtherPhone(browser: Browser) {
	const context = await browser.newContext({ reducedMotion: "reduce" });
	const page = await context.newPage();
	const setup = new SetupPage(page);
	await setup.open();
	return { context, setup, match: new MatchPage(page) };
}

test.describe("Saving and loading a squad file", () => {
	test("a squad saved on one phone loads on another", async ({
		setup,
		browser,
	}) => {
		await setup.open();
		await setup.addPlayers(SQUAD);
		const download = await setup.saveSquadToFile();
		expect(download.suggestedFilename()).toBe("trupp-7v7-2-3-1.json");
		const contents = await readFile(await download.path(), "utf8");

		const other = await openOtherPhone(browser);
		await expect(other.setup.emptySquadMessage).toBeVisible();

		await other.setup.loadSquadFromFile({
			name: "trupp-7v7-2-3-1.json",
			contents,
		});

		await expect(other.setup.players).toHaveInputValues(SQUAD);
		await expect(other.setup.squadFileMessage).toBeHidden();
		await other.context.close();
	});

	test("a whole team setup moves to another coach, who can start at once", async ({
		setup,
		browser,
	}) => {
		await setup.open();
		await setup.chooseTeamSize("11v11");
		await setup.enterCustomFormation("4-2-1-2-1");
		await setup.setMinutesBetweenSwaps(8);
		await setup.addPlayers(TEAM_11);
		const download = await setup.saveSquadToFile();
		expect(download.suggestedFilename()).toBe("trupp-11v11-4-2-1-2-1.json");
		const contents = await readFile(await download.path(), "utf8");

		const other = await openOtherPhone(browser);
		await other.setup.loadSquadFromFile({ name: "team.json", contents });

		await expect(
			other.setup.teamSizes.getByRole("radio", { name: "11v11" }),
		).toBeChecked();
		await expect(
			other.setup.formations.getByRole("radio", { name: "Egen" }),
		).toBeChecked();
		await expect(other.setup.customFormation).toHaveValue("4-2-1-2-1");
		await expect(other.setup.minutesBetweenSwaps).toHaveValue("8");
		await expect(other.setup.players).toHaveInputValues(TEAM_11);

		await other.setup.startMatch();

		await expect(other.match.formatLabel).toHaveText(
			"11v11 (4-2-1-2-1), byte var 8 min",
		);
		await expect(other.match.pitchPlayers).toHaveCount(10);
		await other.context.close();
	});

	test("loading a file replaces a half-typed custom formation", async ({
		setup,
		browser,
	}) => {
		await setup.open();
		await setup.chooseTeamSize("9v9");
		await setup.addPlayers(TEAM_11);
		const download = await setup.saveSquadToFile();
		const contents = await readFile(await download.path(), "utf8");

		const other = await openOtherPhone(browser);
		await other.setup.enterCustomFormation("9-9");
		await expect(other.setup.startButton).toBeDisabled();

		await other.setup.loadSquadFromFile({ name: "team.json", contents });

		await expect(
			other.setup.formations.getByRole("radio", { name: "3-3-2" }),
		).toBeChecked();
		await expect(other.setup.customFormation).toBeHidden();
		await expect(other.setup.startButton).toBeEnabled();
		await other.context.close();
	});

	test("a file that is not a squad shows a clear message", async ({
		setup,
	}) => {
		await setup.open();

		await setup.loadSquadFromFile({
			name: "notes.json",
			contents: "this is not json",
		});

		await expect(setup.squadFileMessage).toHaveText(
			"Filen kunde inte läsas. Välj en fil som sparats från MatchPlanner.",
		);
		await expect(setup.emptySquadMessage).toBeVisible();
	});
});
