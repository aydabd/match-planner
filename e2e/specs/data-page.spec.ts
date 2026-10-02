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

	test("holds the import, export and Drive cards that Statistik no longer has", async ({
		data,
		history,
		page,
	}) => {
		await data.goto();
		for (const heading of ["Läs in matchfiler", "Säker export och import"]) {
			await expect(
				data.root.getByRole("heading", { name: heading }),
			).toBeVisible();
		}
		await page.goto("statistics/");
		await expect(history.root).toBeVisible();
		for (const heading of [
			"Läs in matchfiler",
			"Säker export och import",
			"Säkerhetskopiera till Google Drive",
		]) {
			await expect(
				history.root.getByRole("heading", { name: heading }),
			).toHaveCount(0);
		}
		await expect(page.locator("#historyDataLink")).toBeVisible();
	});
});
