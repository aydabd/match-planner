import { expect, test } from "../fixtures.js";

const MENU = ["Start", "Match", "Matchrapport", "Statistik", "Data", "Om"];

/** The shared cross-page nav (src/ui/page.ts), present on every real page
 * (issue #93). */
test.describe("Shared nav", () => {
	test("start shows it, with itself marked current", async ({
		setup,
		page,
	}) => {
		await setup.open();
		const nav = page.locator("#pageNav");
		for (const label of MENU)
			await expect(
				nav.getByRole("link", { name: label, exact: true }),
			).toBeVisible();
		await expect(
			nav.getByRole("link", { name: "Start", exact: true }),
		).toHaveAttribute("aria-current", "page");
	});

	test("the Data page shows the same six entries, with Data current", async ({
		data,
		page,
	}) => {
		await data.goto();
		const nav = page.locator("#pageNav");
		await expect(nav.locator("a")).toHaveText(MENU);
		await expect(
			nav.getByRole("link", { name: "Data", exact: true }),
		).toHaveAttribute("aria-current", "page");
	});

	test("the start header has no policy link; Om reaches that page", async ({
		setup,
		page,
	}) => {
		await setup.open();
		await expect(
			setup.root
				.locator("header")
				.getByRole("link", { name: "Varför fungerar det så här?" }),
		).toHaveCount(0);
		await page
			.locator("#pageNav")
			.getByRole("link", { name: "Om", exact: true })
			.click();
		await expect(
			page.getByRole("heading", { name: "Varför fungerar det så här?" }),
		).toBeVisible();
	});

	test("the brand is a drawn mark beside the name, not an emoji", async ({
		setup,
	}) => {
		await setup.open();
		const brand = setup.root.locator(".topbar .brand").first();
		await expect(brand).toHaveText("MatchPlanner");
		await expect(brand.locator("svg.brand-mark")).toBeVisible();
		await expect(brand).not.toContainText("⚽");
	});

	for (const url of [
		"",
		"match/",
		"report/",
		"statistics/",
		"statistics/sasongsrapport/",
		"statistics/anteckningar/",
		"about/",
		"data/",
	])
		test(`/${url} shows the drawn brand mark`, async ({ page }) => {
			await page.goto(url);
			await expect(page.locator(".topbar .brand svg.brand-mark")).toHaveCount(
				1,
			);
		});

	for (const icon of ["icon-192.svg", "icon-512.svg"])
		test(`${icon} is a drawn mark, not an emoji`, async ({ page }) => {
			const response = await page.request.get(icon);
			expect(response.status()).toBe(200);
			const body = await response.text();
			expect(body).not.toContain("⚽");
			expect(body).toContain("<rect");
		});

	test("the favicon is not the emoji", async ({ setup, page }) => {
		await setup.open();
		const href = await page.locator("link[rel=icon]").getAttribute("href");
		expect(href).not.toContain("%E2%9A%BD");
	});
});
