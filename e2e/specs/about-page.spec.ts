import { expect, test } from "../fixtures.js";

/** /about/ as its own real page (issue #93): direct navigation and refresh. */
test.describe("About page", () => {
	test("loads directly, shows the rules, and works after a refresh", async ({
		page,
	}) => {
		await page.goto("about/");
		await expect(
			page.getByRole("heading", { name: "Högst 2 led per spelare" }),
		).toBeVisible();

		await page.reload();
		await expect(
			page.getByRole("heading", { name: "Högst 2 led per spelare" }),
		).toBeVisible();
	});
});
