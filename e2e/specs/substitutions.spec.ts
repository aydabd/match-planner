import { expect, test } from "../fixtures.js";
import { KICKOFF } from "../support/squads.js";

test.describe("Making substitutions during play", () => {
	test("a temporary swap shows a rest countdown and reverses itself", async ({
		startedMatch: match,
	}) => {
		await match.startClock();

		await match.swapTemporarily("Alva", "Greta", "1 min");

		await expect(match.pitchPlayer("Greta")).toBeVisible();
		await expect(match.benchPlayer("Alva")).toContainText("tillbaka om 01:00");

		await match.play(0.5);
		await expect(match.benchPlayer("Alva")).toContainText("tillbaka om 00:30");

		await match.play(0.5);
		await expect(match.pitchPlayers).toHaveText(KICKOFF.pitch);
		await expect(match.benchPlayers).toHaveText(KICKOFF.bench);
	});

	test("a swap until the next rotation has no countdown", async ({
		startedMatch: match,
	}) => {
		await match.swapTemporarily("Alva", "Greta", "Till nästa byte");

		await expect(match.pitchPlayer("Greta")).toBeVisible();
		await expect(match.benchPlayer("Alva")).toHaveText("Alva");
	});

	test("temporary swaps can all be undone at once", async ({
		startedMatch: match,
	}) => {
		await match.swapTemporarily("Alva", "Greta", "5 min");
		await match.swapTemporarily("Bo", "Hugo", "2 min");

		await match.undoTemporarySwaps();

		await expect(match.pitchPlayers).toHaveText(KICKOFF.pitch);
		await expect(match.benchPlayers).toHaveText(KICKOFF.bench);
	});

	test("a swap can be cancelled before choosing a duration", async ({
		startedMatch: match,
	}) => {
		await match.pitchPlayer("Alva").click();
		await expect(match.swapPanel).toContainText("Alva är vald");

		await match.swapPanel.getByRole("button", { name: "Avbryt" }).click();

		await expect(match.swapPanel).toBeHidden();
		await expect(match.pitchPlayers).toHaveText(KICKOFF.pitch);
	});

	test("an injured player is replaced and can come back later", async ({
		startedMatch: match,
	}) => {
		await match.takeOutForRestOfMatch("Alva");

		await expect(match.outOfMatch).toContainText("Alva spelar inte mer idag");
		await expect(match.pitchPlayer("Alva")).toBeHidden();
		await expect(match.pitchPlayers).toHaveCount(6);

		await match.bringBackIntoSquad("Alva");

		await expect(match.outOfMatch).toBeHidden();
	});
});
