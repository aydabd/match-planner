import { expect, test } from "../fixtures.js";
import { SQUAD } from "../support/squads.js";

test.describe("Rest time on the bench", () => {
	test("shows how long each bench player has rested, as the clock runs", async ({
		startedMatch: match,
	}) => {
		await expect(match.benchPlayer("Greta")).not.toContainText("vilar");

		await match.startClock();
		await match.play(3);

		await expect(match.benchPlayer("Greta")).toContainText("vilar 03:00");
		await expect(match.benchPlayer("Hugo")).toContainText("vilar 03:00");
	});

	test("a player who has sat out longer than two swap intervals is pointed out", async ({
		setup,
		match,
		page,
	}) => {
		await setup.open();
		await setup.addPlayers(SQUAD);
		await setup.setMinutesBetweenSwaps(1);
		await setup.startMatch();
		await match.startClock();

		// The swap is due after 1 min and never made: 2 min limit is passed at 3 min.
		await match.play(2);
		await expect(page.locator("#restNotices li")).toHaveCount(0);
		await match.play(1.5);

		await expect(page.locator("#restNotices")).toContainText(
			"Greta har suttit på bänken längre än 2 minuter.",
		);
		await expect(match.benchPlayer("Greta")).toContainText("vilar 03:30");
		await expect(page.locator("#restLimits")).toHaveText(
			"Vila kortare än 2 minuter eller längre än 2 minuter markeras.",
		);
	});

	test("a player who went back on after a very short rest is pointed out for a minute", async ({
		startedMatch: match,
		page,
	}) => {
		await match.startClock();
		await match.play(3);
		await match.swapTemporarily("Alva", "Greta", "1 min");
		await match.play(1);

		await expect(page.locator("#restNotices")).toContainText(
			"Alva vilade bara 01:00 innan hen kom in igen.",
		);

		// The notice goes away by itself.
		await match.play(1.5);
		await expect(page.locator("#restNotices li")).toHaveCount(0);
	});

	test("the report audits every rest, and how long a player had rested when they came on", async ({
		startedMatch: match,
		report,
	}) => {
		await match.startClock();
		await match.play(11);
		await match.confirmSwap("Greta");
		await match.play(2);
		await match.endMatch();

		const swap = report.swapRows.filter({ hasText: "Greta in för" });
		await expect(swap).toContainText("Greta: 11:00");
		// Greta rested from kickoff until 11:00; Ebba rests from the swap to the end.
		await expect(
			report.playtimeRows.filter({ hasText: "Greta" }),
		).toContainText("1 vila, 11:00");
		await expect(report.playtimeRows.filter({ hasText: "Ebba" })).toContainText(
			"1 vila, 02:00",
		);
		// Exactly the limit (2 min) and still going on: not flagged.
		await expect(
			report.playtimeRows.filter({ hasText: "Ebba" }),
		).not.toContainText("Kort vila");
		await expect(
			report.summary.filter({ hasText: "Ebba vilade bara" }),
		).toHaveCount(0);
	});
});
