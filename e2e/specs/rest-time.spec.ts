import { expect, test } from "../fixtures.js";

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

	test("a long or a very short rest is never warned about, only counted", async ({
		startedMatch: match,
		page,
	}) => {
		await expect(page.locator("#restNotices")).toHaveCount(0);
		await expect(page.locator("#restLimits")).toHaveCount(0);

		await match.startClock();
		await match.play(15);
		await expect(match.benchPlayer("Greta")).toContainText("vilar 15:00");

		await match.swapTemporarily("Alva", "Greta", "1 min");
		await match.play(1);
		await expect(page.locator("body")).not.toContainText("vilade bara");
		await expect(page.locator(".bench-rest.is-long")).toHaveCount(0);
	});

	test("the report shows how long each player rested in all, and how long a player had rested when they came on", async ({
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
		).toContainText("11:00");
		await expect(report.playtimeRows.filter({ hasText: "Ebba" })).toContainText(
			"02:00",
		);
	});
});
