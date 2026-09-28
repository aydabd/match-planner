import type { Locator } from "@playwright/test";
import { expect, test } from "../fixtures.js";

/** Enough players for any team size, 11v11 included. */
const BIG_SQUAD = Array.from({ length: 12 }, (_, i) => `Spelare ${i + 1}`);

/** Every player chip sits fully inside the pitch, side by side. */
async function expectAllInside(players: Locator, pitch: Locator) {
	const area = await pitch.boundingBox();
	if (!area) throw new Error("pitch is not visible");
	for (const player of await players.all()) {
		const box = await player.boundingBox();
		expect(box).not.toBeNull();
		if (!box) continue;
		expect(box.x).toBeGreaterThanOrEqual(area.x);
		expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
	}
}

test.describe("Choosing team size and formation", () => {
	test.beforeEach(async ({ setup }) => {
		await setup.open();
	});

	test("each team size offers its own quick-pick formations", async ({
		setup,
	}) => {
		await setup.chooseTeamSize("9v9");
		await expect(setup.formations).toMatchAriaSnapshot(`
			- radio "3-3-2" [checked]
			- radio "3-2-3"
			- radio "3-4-1"
			- radio "Egen"
		`);

		await setup.chooseTeamSize("5v5");
		await expect(setup.formations).toMatchAriaSnapshot(`
			- radio "1-2-1" [checked]
			- radio "2-1-1"
			- radio "2-2"
			- radio "Egen"
		`);
	});

	test("a quick pick sets the pitch lines and how many players are needed", async ({
		setup,
		match,
	}) => {
		await setup.chooseTeamSize("11v11");
		await setup.chooseFormation("4-3-3");
		await expect(setup.squadCount).toHaveText("0 av minst 10");

		await setup.addPlayers(BIG_SQUAD);
		await setup.startMatch();

		await expect(match.formatLabel).toHaveText(
			"11v11 (4-3-3), byte var 10 min",
		);
		await expect(match.zoneLabels).toHaveText(["Anfall", "Mittfält", "Back"]);
		await expect(match.pitchPlayers).toHaveCount(10);
		await expect(match.benchPlayers).toHaveCount(2);
	});

	test("a custom formation gets its own lines, attack at the top", async ({
		setup,
		match,
	}) => {
		await setup.chooseTeamSize("11v11");
		await setup.enterCustomFormation("4-2-1-2-1");
		await expect(setup.customFormationMessage).toHaveText("4-2-1-2-1: 5 led.");

		await setup.addPlayers(BIG_SQUAD);
		await setup.startMatch();

		await expect(match.formatLabel).toHaveText(
			"11v11 (4-2-1-2-1), byte var 10 min",
		);
		await expect(match.zoneLabels).toHaveText([
			"Anfall",
			"Offensivt mittfält",
			"Mittfält",
			"Defensivt mittfält",
			"Back",
		]);
		await expect(match.pitchPlayers).toHaveCount(10);
	});

	test("an invalid custom formation explains why and blocks the start", async ({
		setup,
	}) => {
		await setup.addPlayers(BIG_SQUAD);

		await setup.enterCustomFormation("2-3-2");

		await expect(setup.customFormationMessage).toHaveText(
			"Formationen har 7 utespelare, men 7v7 behöver 6.",
		);
		await expect(setup.startButton).toBeDisabled();
		await expect(setup.startButton).toHaveText(
			"Välj en giltig formation för att starta",
		);

		await setup.customFormation.fill("2-2-2");
		await expect(setup.startButton).toBeEnabled();
	});

	test("the chosen team size and custom formation are kept after a reload", async ({
		setup,
		page,
	}) => {
		await setup.chooseTeamSize("9v9");
		await setup.enterCustomFormation("2-2-2-2");
		await expect(setup.customFormationMessage).toHaveText("2-2-2-2: 4 led.");

		await page.reload();

		await expect(
			setup.teamSizes.getByRole("radio", { name: "9v9" }),
		).toBeChecked();
		await expect(
			setup.formations.getByRole("radio", { name: "Egen" }),
		).toBeChecked();
		await expect(setup.customFormation).toHaveValue("2-2-2-2");
	});

	test("a line of five players fits across the pitch", async ({
		setup,
		match,
	}) => {
		await setup.chooseTeamSize("11v11");
		await setup.enterCustomFormation("5-3-2");
		await setup.addPlayers(BIG_SQUAD);
		await setup.startMatch();

		await expect(match.pitchPlayers).toHaveCount(10);
		await expectAllInside(match.pitchPlayers, match.pitchArea);
	});
});
