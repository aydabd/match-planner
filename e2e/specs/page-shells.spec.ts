import { expect, test } from "../fixtures.js";

/**
 * The four new page shells (issue #93): direct navigation works, each shows
 * its "not ready yet" placeholder, and the shared nav lists all five pages
 * with the current one marked. The pages get their real content in later
 * PRs, which replace this spec's placeholder assertions with real ones.
 */
test.describe("Page shells", () => {
	for (const [path, current] of [
		["match/", "Match"],
		["report/", "Matchrapport"],
		["statistics/", "Statistik"],
		["about/", "Om"],
	] as const) {
		test(`${path} loads directly and shows the not-ready placeholder`, async ({
			page,
		}) => {
			await page.goto(path);
			await expect(
				page.getByRole("heading", { name: "Sidan är inte klar än" }),
			).toBeVisible();
			await expect(
				page.getByRole("link", { name: "Till start" }),
			).toBeVisible();

			const nav = page.locator("#pageNav");
			for (const label of ["Start", "Match", "Matchrapport", "Statistik", "Om"])
				await expect(
					nav.getByRole("link", { name: label, exact: true }),
				).toBeVisible();
			await expect(
				nav.getByRole("link", { name: current, exact: true }),
			).toHaveAttribute("aria-current", "page");
		});

		test(`${path} not-ready page returns to start`, async ({ page }) => {
			await page.goto(path);
			await page.getByRole("link", { name: "Till start" }).click();
			await expect(
				page.getByRole("heading", { name: "Ny match" }),
			).toBeVisible();
		});
	}

	test("refreshing a page shell keeps it on the same URL", async ({ page }) => {
		await page.goto("match/");
		await page.reload();
		await expect(
			page.getByRole("heading", { name: "Sidan är inte klar än" }),
		).toBeVisible();
	});

	test("start also shows the shared nav, with itself marked current", async ({
		setup,
		page,
	}) => {
		await setup.open();
		const nav = page.locator("#pageNav");
		for (const label of ["Start", "Match", "Matchrapport", "Statistik", "Om"])
			await expect(
				nav.getByRole("link", { name: label, exact: true }),
			).toBeVisible();
		await expect(
			nav.getByRole("link", { name: "Start", exact: true }),
		).toHaveAttribute("aria-current", "page");
	});
});
