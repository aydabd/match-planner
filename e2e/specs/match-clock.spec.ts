import { expect, test } from "../fixtures.js";
import { KICKOFF, SECOND_SWAP } from "../support/squads.js";

test.describe("Running the swap clock", () => {
	test("the kickoff lineup and the next swap are shown before the clock starts", async ({
		startedMatch: match,
	}) => {
		await expect(match.pitchPlayers).toHaveText(KICKOFF.pitch);
		await expect(match.benchPlayers).toHaveText(KICKOFF.bench);
		await expect(match.time).toHaveText("00:00");
		await expect(match.timeLeft).toHaveText("10:00 kvar till nästa byte");
	});

	test("the clock starts, pauses and continues", async ({
		startedMatch: match,
	}) => {
		await match.startClock();
		await match.play(2);
		await expect(match.time).toHaveText("02:00");
		await expect(match.timeLeft).toHaveText("08:00 kvar till nästa byte");

		await match.pauseButton.click();
		await match.play(1);
		await expect(match.time).toHaveText("02:00");

		await match.continueButton.click();
		await match.play(1);
		await expect(match.time).toHaveText("03:00");
	});

	test("only one clock action is offered at a time", async ({
		startedMatch: match,
	}) => {
		await expect(match.startClockButton).toBeVisible();
		await expect(match.pauseButton).toBeHidden();

		await match.startClock();

		await expect(match.startClockButton).toBeHidden();
		await expect(match.pauseButton).toBeVisible();
	});

	test("once play starts the next swap shows who comes in and goes out", async ({
		startedMatch: match,
	}) => {
		await match.startClock();
		await match.play(1);

		await expect(match.nextIn).toHaveText(SECOND_SWAP.comingIn);
		await expect(match.nextOut).toHaveText(SECOND_SWAP.goingOut);
	});

	test("when time is up the coach is told to swap and the next team goes on", async ({
		startedMatch: match,
	}) => {
		await match.startClock();
		await match.play(10);

		await expect(match.clock).toHaveClass(/is-due/);
		await expect(match.timeLeft).toHaveText("Dags att byta!");
		await expect(match.pauseButton).toBeHidden();

		await match.swapInNewTeamButton.click();

		await expect(match.swapNumber).toHaveText("2");
		await expect(match.time).toHaveText("00:00");
		await expect(match.clock).not.toHaveClass(/is-due/);
		await expect(match.pitchPlayers).toHaveText(SECOND_SWAP.pitch);
		await expect(match.benchPlayers).toHaveText(SECOND_SWAP.bench);
	});

	test("playtime counts only for players on the pitch", async ({
		startedMatch: match,
	}) => {
		await match.startClock();
		await match.play(3);

		await expect(match.playtime("Alva")).toHaveText("03:00");
		await expect(match.playtime("Greta")).toHaveText("00:00");
	});
});
