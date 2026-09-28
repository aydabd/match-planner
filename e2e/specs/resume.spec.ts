import { expect, test } from "../fixtures.js";
import { SECOND_SWAP } from "../support/squads.js";

test.describe("Resuming after the page reloads", () => {
	test("the match comes back paused where it was", async ({
		startedMatch: match,
		page,
	}) => {
		await match.playRotationAndSwap();
		await match.startClock();
		await match.play(4);

		await page.reload();

		await expect(match.root).toBeVisible();
		await expect(match.swapNumber).toHaveText("2");
		await expect(match.time).toHaveText("04:00");
		await expect(match.pitchPlayers).toHaveText(SECOND_SWAP.pitch);
		// Paused after a reload, so no time is counted while the coach is away.
		await expect(match.continueButton).toBeVisible();
	});
});
