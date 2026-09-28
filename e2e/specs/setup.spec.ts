import { expect, test } from "../fixtures.js";
import { MINIMUM_SQUAD, SQUAD } from "../support/squads.js";

test.describe("Setting up a match", () => {
	test.beforeEach(async ({ setup }) => {
		await setup.open();
	});

	test("a new coach sees the two setup steps and cannot start yet", async ({
		setup,
	}) => {
		await expect(setup.root).toMatchAriaSnapshot(`
			- heading "Ny match" [level=1]
			- list:
			  - listitem:
			    - heading "Matchinställningar" [level=2]
			    - combobox "Format"
			    - spinbutton "Minuter mellan byten"
			  - listitem:
			    - heading "Dagens trupp" [level=2]
			    - textbox "Spelarens namn"
			    - button "Lägg till"
			    - paragraph: Inga spelare än. Lägg till dem som är med idag.
			- group: Spara eller hämta en trupp
			- button "Lägg till 6 spelare till för att starta" [disabled]
		`);
	});

	test("the start button counts down until the squad is big enough", async ({
		setup,
	}) => {
		await setup.addPlayers(MINIMUM_SQUAD.slice(0, 5));
		await expect(setup.squadCount).toHaveText("5 av minst 6");
		await expect(setup.startButton).toHaveText(
			"Lägg till 1 spelare till för att starta",
		);

		await setup.addPlayers(MINIMUM_SQUAD.slice(5));
		await expect(setup.startButton).toBeEnabled();
		await expect(setup.startButton).toHaveText("Starta match med 6 spelare");
	});

	test("players can be renamed and removed", async ({ setup }) => {
		await setup.addPlayers(["Alva", "Bo", "Cleo"]);

		await setup.renamePlayer(2, "Bosse");
		await setup.removePlayer("Alva");

		await expect(setup.players).toHaveInputValues(["Bosse", "Cleo"]);
	});

	test("the squad and settings are kept after a reload", async ({
		setup,
		page,
	}) => {
		await setup.setMinutesBetweenSwaps(8);
		await setup.addPlayers(SQUAD);

		await page.reload();

		await expect(setup.minutesBetweenSwaps).toHaveValue("8");
		await expect(setup.players).toHaveInputValues(SQUAD);
	});

	test("starting the match shows the format and swap interval", async ({
		setup,
		match,
	}) => {
		await setup.setMinutesBetweenSwaps(8);
		await setup.addPlayers(SQUAD);

		await setup.startMatch();

		await expect(setup.root).toBeHidden();
		await expect(match.formatLabel).toHaveText("7v7 (2-3-1), byte var 8 min");
		await expect(match.timeLeft).toHaveText("08:00 kvar till nästa byte");
	});
});
