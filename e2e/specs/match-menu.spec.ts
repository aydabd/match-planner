import { expect, test } from "../fixtures.js";
import { SQUAD } from "../support/squads.js";

test.describe("Match menu", () => {
	test("a late arrival joins the bench and the playtime list", async ({
		startedMatch: match,
	}) => {
		await match.addLatePlayer("Ines");

		await expect(match.benchPlayer("Ines")).toBeVisible();
		await expect(match.playtime("Ines")).toHaveText("00:00");
	});

	test("editing the squad goes back to setup with the squad kept", async ({
		startedMatch: match,
		setup,
	}) => {
		await match.editSquad();

		await expect(setup.root).toBeVisible();
		await expect(setup.players).toHaveInputValues(SQUAD);
	});

	test("reset asks for a second tap, then starts the match over", async ({
		startedMatch: match,
	}) => {
		await match.playRotationAndSwap();
		await expect(match.swapNumber).toHaveText("2");

		await match.resetMatch();

		await expect(match.swapNumber).toHaveText("1");
		await expect(match.time).toHaveText("00:00");
		for (const name of SQUAD) {
			await expect(match.playtime(name)).toHaveText("00:00");
		}
	});
});
