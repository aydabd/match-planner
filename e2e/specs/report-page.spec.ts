import { expect, test } from "../fixtures.js";

/** /report/ as its own real page (issue #93): direct nav, empty state, and
 * picking the report to show from ?matchId= or falling back to the latest. */
test.describe("Report page", () => {
	test("with nothing saved yet, shows a Swedish empty state and a way back", async ({
		page,
	}) => {
		await page.goto("report/");
		await expect(
			page.getByRole("heading", { name: "Ingen matchrapport att visa" }),
		).toBeVisible();
		await page.getByRole("link", { name: "Till start" }).click();
		await expect(page.getByRole("heading", { name: "Ny match" })).toBeVisible();
	});

	test("an unknown ?matchId falls back to the most recent report", async ({
		startedMatch: match,
		report,
		page,
	}) => {
		await match.startClock();
		await match.play(3);
		await match.endMatch();
		await expect(report.root).toBeVisible();

		await page.goto("report/?matchId=does-not-exist");
		await expect(report.root).toBeVisible();
		await expect(report.playtimeRows).toHaveCount(8);
	});

	test("shows the shared nav with Matchrapport marked current", async ({
		startedMatch: match,
		page,
	}) => {
		await match.startClock();
		await match.play(3);
		await match.endMatch();
		await page.goto("report/");

		const nav = page.locator("#pageNav");
		await expect(
			nav.getByRole("link", { name: "Matchrapport", exact: true }),
		).toHaveAttribute("aria-current", "page");
	});
});
