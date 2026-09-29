import { expect, test } from "../fixtures.js";

/** The shared cross-page nav (src/ui/page.ts), present on every real page
 * (issue #93). */
test.describe("Shared nav", () => {
	test("start shows it, with itself marked current", async ({
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
