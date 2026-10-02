import { expect, test } from "../fixtures.js";

/** The Data page (#154): its own real URL, linked from Start and Statistik,
 * and not a sixth entry in the main menu. */
test.describe("Data page", () => {
	test("loads directly and after a reload", async ({ data, page }) => {
		await data.goto();
		await expect(data.title).toHaveText("Data");
		await page.reload();
		await expect(data.title).toHaveText("Data");
	});

	test("is not in the main menu, which keeps five entries", async ({
		data,
		page,
	}) => {
		await data.goto();
		const links = page.locator("#pageNav a");
		await expect(links).toHaveText([
			"Start",
			"Match",
			"Matchrapport",
			"Statistik",
			"Om",
		]);
		await expect(page.locator("#pageNav [aria-current]")).toHaveCount(0);
	});

	test("is linked from Start", async ({ setup, data, page }) => {
		await setup.open();
		await page.locator("#dataOpenBtn").click();
		await expect(data.title).toHaveText("Data");
	});

	test("is linked from Statistik", async ({ history, data, page }) => {
		await page.goto("statistics/");
		await expect(history.root).toBeVisible();
		await page.locator("#historyDataLink").click();
		await expect(data.title).toHaveText("Data");
	});
});
