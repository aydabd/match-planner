import { readFileSync } from "node:fs";
import { expect, test } from "../fixtures.js";
import { SQUAD } from "../support/squads.js";

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as {
	version: string;
};

test.describe("Starting over", () => {
	test.beforeEach(async ({ setup }) => {
		await setup.open();
		await setup.chooseTeamSize("9v9");
		await setup.setMinutesBetweenSwaps(8);
		await setup.addPlayers(SQUAD);
	});

	test("two taps empty the squad and restore the default setup", async ({
		setup,
		page,
	}) => {
		await setup.startOver();

		await expect(setup.emptySquadMessage).toBeVisible();
		await expect(
			setup.teamSizes.getByRole("radio", { name: "7v7" }),
		).toBeChecked();
		await expect(setup.minutesBetweenSwaps).toHaveValue("10");

		await page.reload();
		await expect(setup.emptySquadMessage).toBeVisible();
	});

	test("also clears an earlier squad-file error", async ({ setup }) => {
		await setup.loadSquadFromFile({ name: "notes.json", contents: "not json" });
		await expect(setup.squadFileMessage).toBeVisible();

		await setup.startOver();

		await expect(setup.squadFileMessage).toBeHidden();
		await expect(setup.squadFileMessage).not.toHaveClass(/error/);
	});

	test("one tap only asks for confirmation, and the question expires", async ({
		setup,
		page,
	}) => {
		await setup.startOverButton.click();
		await expect(setup.startOverButton).toHaveText(
			"Tryck igen för att tömma truppen",
		);

		await page.clock.runFor(3_000);

		await expect(setup.startOverButton).toHaveText("Börja om med tom trupp");
		await expect(setup.players).toHaveInputValues(SQUAD);
	});
});

test.describe("Clearing all saved data", () => {
	test("removes only this app's data, then starts fresh", async ({
		setup,
		page,
	}) => {
		await setup.open();
		await setup.addPlayers(SQUAD);
		// Other aydabd.github.io sites share this browser origin.
		await page.evaluate(async () => {
			localStorage.setItem("another-app", "keep me");
			await caches.open("another-app-cache");
			await caches.open("fotbollsbyten-v1");
		});

		await setup.clearAllSavedData();

		await expect(setup.emptySquadMessage).toBeVisible();
		const left = await page.evaluate(async () => ({
			other: localStorage.getItem("another-app"),
			caches: await caches.keys(),
		}));
		expect(left.other).toBe("keep me");
		expect(left.caches).toContain("another-app-cache");
		expect(left.caches).not.toContain("fotbollsbyten-v1");
	});
});

test.describe("Offline copy", () => {
	test("the service worker's cache is named after the app version", async ({
		page,
	}) => {
		const response = await page.request.get("sw.js");

		expect(response.ok()).toBe(true);
		expect(await response.text()).toContain(`"matchplanner-v${version}"`);
	});
});
