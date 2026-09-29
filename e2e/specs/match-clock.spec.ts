import { expect, test } from "../fixtures.js";
import { KICKOFF, SECOND_SWAP } from "../support/squads.js";

// The test squad plays 7v7: 3 periods of 20 minutes, a swap every 10 minutes.

test.describe("Running the match clock", () => {
	test("before kickoff the lineup, period and next swap are shown", async ({
		startedMatch: match,
	}) => {
		await expect(match.pitchPlayers).toHaveText(KICKOFF.pitch);
		await expect(match.benchPlayers).toHaveText(KICKOFF.bench);
		await expect(match.periodAndSwap).toHaveText("Period 1 av 3, byte 1");
		await expect(match.periodTimeLeft).toHaveText("20:00 kvar av perioden");
		await expect(match.time).toHaveText("00:00");
		await expect(match.timeLeft).toHaveText("10:00 kvar till nästa byte");
		await expect(match.startClockButton).toBeVisible();
	});

	test("the clock starts, pauses and continues", async ({
		startedMatch: match,
	}) => {
		await match.startClock();
		await match.play(2);
		await expect(match.time).toHaveText("02:00");
		await expect(match.periodTimeLeft).toHaveText("18:00 kvar av perioden");

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

	test("a due swap does not stop the match; it shows how late the swap is", async ({
		startedMatch: match,
	}) => {
		await match.startClock();
		await match.play(10);
		await expect(match.clock).toHaveClass(/is-due/);
		await expect(match.timeLeft).toHaveText("Dags att byta!");

		await match.play(0.5);

		await expect(match.timeLeft).toHaveText("Dags att byta! 00:30 sen");
		await expect(match.time).toHaveText("10:30");
		await expect(match.pauseButton).toBeVisible();
		// Players on the pitch keep earning minutes until the swap happens.
		await expect(match.playtime("Alva")).toHaveText("10:30");
	});

	test("swapping puts the next team on and restarts the swap timer", async ({
		startedMatch: match,
	}) => {
		await match.playRotationAndSwap();

		await expect(match.periodAndSwap).toHaveText("Period 1 av 3, byte 2");
		await expect(match.time).toHaveText("00:00");
		await expect(match.clock).not.toHaveClass(/is-due/);
		await expect(match.pitchPlayers).toHaveText(SECOND_SWAP.pitch);
		await expect(match.benchPlayers).toHaveText(SECOND_SWAP.bench);

		await match.play(1);
		await expect(match.time).toHaveText("01:00");
		await expect(match.periodTimeLeft).toHaveText("09:00 kvar av perioden");
	});

	test("the clock stops at the end of a period; one tap starts the next", async ({
		startedMatch: match,
	}) => {
		await match.playRotationAndSwap();
		await match.play(10);

		await expect(match.timeLeft).toHaveText("Period 1 är slut.");
		await expect(match.pauseButton).toBeHidden();
		await expect(match.startClockButton).toBeHidden();
		await match.play(5);
		await expect(match.periodTimeLeft).toHaveText("00:00 kvar av perioden");

		await match.nextPeriodButton.click();

		await expect(match.periodAndSwap).toHaveText("Period 2 av 3, byte 3");
		await expect(match.periodTimeLeft).toHaveText("20:00 kvar av perioden");
		await expect(match.time).toHaveText("00:00");
		await match.play(1);
		await expect(match.time).toHaveText("01:00");
	});

	test("after the last period the match is over and the report opens by itself", async ({
		startedMatch: match,
		report,
	}) => {
		for (let period = 1; period <= 3; period++) {
			if (period > 1) await match.nextPeriodButton.click();
			await match.playRotationAndSwap();
			await match.play(10);
		}

		// The clock reaching the end of the last period is a real navigation
		// to /report/ now (#93), not an in-page state to inspect on /match/.
		await expect(report.root).toBeVisible();
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
