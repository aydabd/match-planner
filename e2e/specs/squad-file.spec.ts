import { readFile } from "node:fs/promises";
import { expect, test } from "../fixtures.js";
import { SetupPage } from "../pages/SetupPage.js";
import { SQUAD } from "../support/squads.js";

test.describe("Saving and loading a squad file", () => {
	test("a squad saved on one phone loads on another", async ({
		setup,
		browser,
	}) => {
		await setup.open();
		await setup.addPlayers(SQUAD);
		const download = await setup.saveSquadToFile();
		expect(download.suggestedFilename()).toBe("trupp-7v7.json");
		const contents = await readFile(await download.path(), "utf8");

		// A second, independent browser context stands in for another phone.
		const otherPhone = await browser.newContext();
		const otherSetup = new SetupPage(await otherPhone.newPage());
		await otherSetup.open();
		await expect(otherSetup.emptySquadMessage).toBeVisible();

		await otherSetup.loadSquadFromFile({ name: "trupp-7v7.json", contents });

		await expect(otherSetup.players).toHaveInputValues(SQUAD);
		await expect(otherSetup.squadFileMessage).toBeHidden();
		await otherPhone.close();
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
