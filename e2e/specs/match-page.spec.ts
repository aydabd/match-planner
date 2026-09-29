import { expect, test } from "../fixtures.js";

/** /match/ as its own real page (issue #93): the missing-active-match empty
 * state, direct navigation, and refresh. */
test.describe("Match page", () => {
	test("with no active match, shows a Swedish empty state and a way back", async ({
		page,
	}) => {
		await page.goto("match/");
		await expect(
			page.getByRole("heading", { name: "Ingen match pågår" }),
		).toBeVisible();
		// The (empty) match screen must not also render behind the empty
		// state - toggled via the `hidden` property, not just aria/text.
		await expect(page.locator("#matchView")).toBeHidden();

		await page.getByRole("link", { name: "Till start" }).click();
		await expect(page.getByRole("heading", { name: "Ny match" })).toBeVisible();
	});

	test("shows the shared nav with Match marked current", async ({
		startedMatch: match,
		page,
	}) => {
		await expect(match.root).toBeVisible();
		// The no-active-match empty state must not also render behind it.
		await expect(page.locator("#matchEmptyState")).toBeHidden();
		const nav = page.locator("#pageNav");
		await expect(
			nav.getByRole("link", { name: "Match", exact: true }),
		).toHaveAttribute("aria-current", "page");
	});

	test("refreshing an active match keeps it running on the same URL", async ({
		startedMatch: match,
		page,
	}) => {
		await match.startClock();
		await match.play(3);
		await page.reload();
		await expect(match.root).toBeVisible();
		await expect(match.time).toHaveText("03:00");
	});
});
