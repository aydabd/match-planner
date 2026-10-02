import { expect, test } from "../fixtures.js";

/** The Data page (#154): its own real URL, linked from Start and Statistik
 * and an entry in the main menu. */
test.describe("Data page", () => {
	test("loads directly and after a reload", async ({ data, page }) => {
		await data.goto();
		await expect(data.title).toHaveText("Data");
		await page.reload();
		await expect(data.title).toHaveText("Data");
	});

	test("is in the main menu, marked as the current page", async ({
		data,
		page,
	}) => {
		await data.goto();
		await expect(page.locator("#pageNav a")).toHaveText([
			"Start",
			"Match",
			"Matchrapport",
			"Statistik",
			"Data",
			"Om",
		]);
		await expect(page.locator("#pageNav [aria-current='page']")).toHaveText(
			"Data",
		);
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

	test("holds the import, export and Drive cards that Statistik no longer has", async ({
		data,
		history,
		page,
	}) => {
		await data.goto();
		for (const heading of ["1. Hämta in", "2. Skicka ut"]) {
			await expect(
				data.root.getByRole("heading", { name: heading }),
			).toBeVisible();
		}
		await page.goto("statistics/");
		await expect(history.root).toBeVisible();
		for (const heading of [
			"Läs in matchfiler",
			"Hämta in",
			"Skicka ut",
			"Håll i Drive",
		]) {
			await expect(
				history.root.getByRole("heading", { name: heading }),
			).toHaveCount(0);
		}
		await expect(page.locator("#historyDataLink")).toBeVisible();
	});
});
