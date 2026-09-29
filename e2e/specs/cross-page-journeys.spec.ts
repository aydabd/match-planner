import { expect, test } from "../fixtures.js";
import { SQUAD } from "../support/squads.js";

/**
 * Full journeys across the five real pages (issue #93), clicked through as
 * a coach would rather than reached by direct navigation - each of those
 * is covered by the page's own spec (report-page, match-page, ...). This
 * file is about the transitions between them: real URLs change, browser
 * back/forward don't strand the coach, and a detour off the live match
 * doesn't lose it.
 */
test.describe("Cross-page journeys", () => {
	test("start -> match -> report -> start, with the URL changing at each step", async ({
		setup,
		match,
		report,
		page,
	}) => {
		await setup.open();
		await expect(page).toHaveURL(/\/$|\/index\.html$/);

		await setup.addPlayers(SQUAD);
		await setup.startMatch();
		await expect(match.root).toBeVisible();
		expect(page.url()).toContain("/match/");

		await match.startClock();
		await match.play(3);
		await match.endMatch();
		await expect(report.root).toBeVisible();
		expect(page.url()).toContain("/report/");

		await report.backButton.click();
		await expect(match.root).toBeVisible();
		expect(page.url()).toContain("/match/");

		await match.editSquad();
		await expect(setup.root).toBeVisible();
		expect(page.url()).not.toContain("/match/");
	});

	test("browser back from the match report returns to the match, not a blank screen", async ({
		startedMatch: match,
		report,
		page,
	}) => {
		await match.startClock();
		await match.play(3);
		await match.endMatch();
		await expect(report.root).toBeVisible();

		await page.goBack();
		await expect(match.root).toBeVisible();

		await page.goForward();
		await expect(report.root).toBeVisible();
	});

	test("a detour to About and back does not lose the running match", async ({
		startedMatch: match,
		page,
	}) => {
		await match.startClock();
		await match.play(3);

		await match.openPolicyPage();
		await expect(page.locator("#policyView")).toBeVisible();
		await page.getByRole("link", { name: "Tillbaka" }).click();

		await expect(match.root).toBeVisible();
		await expect(match.time).toHaveText("03:00");
		// Still running: no need to press start again.
		await expect(match.pauseButton).toBeVisible();
	});

	test("a detour to Statistics and back does not lose the running match", async ({
		startedMatch: match,
		page,
	}) => {
		await match.startClock();
		await match.play(2);

		// page.goto resolves relative to baseURL, not the current page - use
		// site-relative paths, not "../", to reach a sibling page from here.
		await page.goto("statistics/");
		await expect(
			page.getByRole("heading", { name: "Spelarhistorik" }),
		).toBeVisible();

		await page.goto("match/");
		await expect(match.root).toBeVisible();
		await expect(match.time).toHaveText("02:00");
	});
});
