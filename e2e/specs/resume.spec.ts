import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures.js";
import { SECOND_SWAP } from "../support/squads.js";

/** Pretend the page was closed for a while: the last save is older. */
async function backdateSave(page: Page, minutes: number): Promise<void> {
	await page.evaluate((ms) => {
		const key = "matchplanner:session:v1";
		const session = JSON.parse(localStorage.getItem(key) ?? "{}");
		session.lastTickMs -= ms;
		localStorage.setItem(key, JSON.stringify(session));
	}, minutes * 60_000);
}

test.describe("Resuming after the page reloads", () => {
	test("a running match keeps running where it was", async ({
		startedMatch: match,
		page,
	}) => {
		await match.playRotationAndSwap();
		await match.play(4);

		await page.reload();

		await expect(match.root).toBeVisible();
		await expect(match.periodAndSwap).toHaveText("Period 1 av 3, byte 2");
		await expect(match.time).toHaveText("04:00");
		await expect(match.periodTimeLeft).toHaveText("06:00 kvar av perioden");
		await expect(match.pitchPlayers).toHaveText(SECOND_SWAP.pitch);
		// Still running: no need to press start again.
		await expect(match.pauseButton).toBeVisible();
		await match.play(1);
		await expect(match.time).toHaveText("05:00");
	});

	test("a match the coach paused stays paused, whatever time passes", async ({
		startedMatch: match,
		page,
	}) => {
		await match.startClock();
		await match.play(4);
		await match.pauseButton.click();

		await backdateSave(page, 30);
		await page.reload();

		await expect(match.time).toHaveText("04:00");
		await expect(match.continueButton).toBeVisible();
	});

	test("counts the time the page was away, with the swaps and playtime that follow", async ({
		startedMatch: match,
		page,
	}) => {
		await match.startClock();
		await match.play(4);

		await backdateSave(page, 3);
		await page.reload();

		await expect(match.time).toHaveText("07:00");
		await expect(match.playtime("Alva")).toHaveText("07:00");
		await expect(match.pauseButton).toBeVisible();
		await expect(page.locator("#clockNotice")).toHaveText(
			"Klockan fortsatte medan sidan var borta och har räknat in 03:00.",
		);
	});

	test("a swap that fell due while the page was away shows how late it is", async ({
		startedMatch: match,
		page,
	}) => {
		await match.startClock();
		await match.play(4);

		await backdateSave(page, 7);
		await page.reload();

		await expect(match.swapInNewTeamButton).toBeVisible();
		await expect(match.timeLeft).toHaveText("Dags att byta! 01:00 sen");
	});

	test("a period that ended while the page was away is over, not stuck", async ({
		startedMatch: match,
		page,
	}) => {
		await match.startClock();
		await match.play(4);

		await backdateSave(page, 30);
		await page.reload();

		await expect(match.timeLeft).toHaveText("Period 1 är slut.");
		await expect(match.periodTimeLeft).toHaveText("00:00 kvar av perioden");
		await expect(match.nextPeriodButton).toBeVisible();
	});

	test("says only what it counted when a period ended while the page was away", async ({
		startedMatch: match,
		page,
	}) => {
		await match.startClock();
		await match.play(4);

		await backdateSave(page, 30);
		await page.reload();

		// 4 min were played, the period is 20 min: 16 min more were counted,
		// not the 30 min the page was away.
		await expect(page.locator("#clockNotice")).toHaveText(
			"Klockan fortsatte medan sidan var borta och har räknat in 16:00.",
		);
	});

	test("does not run fast when the device clock jumps back", async ({
		startedMatch: match,
		page,
	}) => {
		await match.startClock();
		await match.play(2);

		await page.clock.setSystemTime(new Date("2026-09-05T08:00:00"));
		await match.play(1);

		await expect(match.time).toHaveText("03:00");
	});

	test("a phone that pauses its timers catches up when they run again", async ({
		startedMatch: match,
		page,
	}) => {
		await match.startClock();
		await match.play(1);

		// One late timer callback after two minutes of locked screen.
		await page.clock.fastForward(2 * 60_000);

		await expect(match.time).toHaveText("03:00");
		await expect(match.playtime("Alva")).toHaveText("03:00");
	});
});
