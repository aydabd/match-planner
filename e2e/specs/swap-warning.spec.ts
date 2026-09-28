import type { Page } from "@playwright/test";
import { formatTime } from "../../src/core/match.js";
import { matchSecond } from "../../src/core/matchClock.js";
import { secondsPlayed, swapDelays } from "../../src/core/timeline.js";
import type { MatchSession } from "../../src/ui/sessionStorage.js";
import { expect, test } from "../fixtures.js";
import { SECOND_SWAP, SQUAD } from "../support/squads.js";

// 7v7 with the test squad: a swap every 10 minutes, 3 periods of 20 minutes.

/** The match as the app saved it, read straight from browser storage. */
async function savedMatch(page: Page): Promise<MatchSession> {
	const raw = await page.evaluate(() =>
		localStorage.getItem("matchplanner:session:v1"),
	);
	if (!raw) throw new Error("no saved match");
	return JSON.parse(raw) as MatchSession;
}

test.describe("The swap warning", () => {
	test("30 seconds before a swap the coach sees who swaps with whom", async ({
		startedMatch: match,
	}) => {
		await match.startClock();
		await match.play(9);
		await expect(match.swapStatus).toBeHidden();

		await match.play(0.5);

		await expect(match.swapStatus).toHaveText("Byte om 00:30");
		await expect(match.swapRows.locator(".swap-title")).toHaveText(
			SECOND_SWAP.substitutions,
		);
		await expect(match.swapRows.locator(".swap-move")).toHaveText(
			SECOND_SWAP.moves,
		);

		await match.play(0.25);
		await expect(match.swapStatus).toHaveText("Byte om 00:15");
	});
});

test.describe("The swap warning with a screen reader or keyboard", () => {
	test("is announced once, keeps focus on Klart, and announces when due", async ({
		startedMatch: match,
	}) => {
		await match.startClock();
		await match.play(9.5);
		await expect(match.swapAnnouncement).toHaveText(
			"Byte snart: Greta in för Ebba, Hugo in för Filip.",
		);
		const klart = match.swapRows.first().getByRole("button");
		await klart.focus();

		await match.play(5 / 60);

		await expect(klart).toBeFocused();
		await expect(match.swapStatus).toHaveText("Byte om 00:25");
		await expect(match.swapAnnouncement).toHaveText(
			"Byte snart: Greta in för Ebba, Hugo in för Filip.",
		);

		await match.play(25 / 60);
		await expect(match.swapAnnouncement).toHaveText(
			"Dags att byta, en i taget eller alla på en gång",
		);
	});
});

test.describe("Substituting one player at a time", () => {
	test("each player's minutes change hands when their swap is made", async ({
		startedMatch: match,
	}) => {
		await match.startClock();
		await match.play(10);
		await match.play(20 / 60);

		await match.confirmSwap("Greta");

		await expect(match.pitchPlayer("Greta")).toBeVisible();
		await expect(match.benchPlayer("Ebba")).toBeVisible();
		await expect(match.swapRows.locator(".swap-title")).toHaveText([
			"Hugo in för Filip",
		]);
		await expect(match.periodAndSwap).toHaveText("Period 1 av 3, byte 1");

		await match.play(40 / 60);
		await match.confirmSwap("Hugo");

		await expect(match.periodAndSwap).toHaveText("Period 1 av 3, byte 2");
		await expect(match.time).toHaveText("00:00");
		await expect(match.swapRows).toHaveCount(0);
		await expect(match.pitchPlayers).toHaveText(SECOND_SWAP.pitch);
		await expect(match.playtime("Greta")).toHaveText("00:40");
		await expect(match.playtime("Ebba")).toHaveText("10:20");
		await expect(match.playtime("Hugo")).toHaveText("00:00");
		await expect(match.playtime("Filip")).toHaveText("11:00");
	});

	test("a swap can be made early, while the warning is showing", async ({
		startedMatch: match,
	}) => {
		await match.startClock();
		await match.play(9.75);

		await match.confirmSwap("Greta");
		await match.confirmSwap("Hugo");

		await expect(match.periodAndSwap).toHaveText("Period 1 av 3, byte 2");
		await expect(match.playtime("Ebba")).toHaveText("09:45");
	});

	test('"Byt in nya laget" makes the remaining swaps at once', async ({
		startedMatch: match,
	}) => {
		await match.startClock();
		await match.play(10);
		await match.confirmSwap("Greta");

		await match.swapInNewTeamButton.click();

		await expect(match.periodAndSwap).toHaveText("Period 1 av 3, byte 2");
		await expect(match.pitchPlayers).toHaveText(SECOND_SWAP.pitch);
		await expect(match.benchPlayers).toHaveText(SECOND_SWAP.bench);
	});
});

test.describe("The match timeline", () => {
	test("gives exactly the minutes shown on screen, and records how late each swap was", async ({
		startedMatch: match,
		page,
	}) => {
		// Two late swaps, a temporary swap, a period break and a new period.
		await match.startClock();
		await match.play(10.5);
		await match.confirmSwap("Greta");
		await match.play(0.5);
		await match.confirmSwap("Hugo");
		await match.play(2);
		await match.swapTemporarily("Alva", "Ebba", "1 min");
		await match.play(7);
		await expect(match.nextPeriodButton).toBeVisible();
		await match.nextPeriodButton.click();
		await match.play(3);
		await match.pauseButton.click();

		const saved = await savedMatch(page);
		const now = matchSecond(saved.clock, saved.plan);
		const played = secondsPlayed(saved.timeline, now);
		const idOf = Object.fromEntries(
			Object.entries(saved.playerNames).map(([id, name]) => [name, id]),
		);

		for (const name of SQUAD) {
			const fromTimeline = played[idOf[name] ?? ""]?.total ?? 0;
			await expect(match.playtime(name)).toHaveText(formatTime(fromTimeline));
			const byLine = Object.values(played[idOf[name] ?? ""]?.byZone ?? {});
			expect(byLine.reduce((sum, s) => sum + s, 0)).toBe(fromTimeline);
		}
		expect(
			swapDelays(saved.timeline).map((d) => [
				saved.playerNames[d.inId],
				d.delaySeconds,
			]),
		).toEqual([
			["Greta", 30],
			["Hugo", 60],
		]);
	});
});
