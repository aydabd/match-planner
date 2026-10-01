import { matchFileToJson } from "../../src/core/matchFile.js";
import { makeMatchFile } from "../../tests/support/matchFiles.js";
import { expect, test } from "../fixtures.js";

/** /statistics/ as its own real page (issue #93): direct navigation, refresh,
 * and standalone match-file import (the issue calls this out explicitly). */
test.describe("Statistics page", () => {
	test("loads directly and works after a refresh", async ({ page }) => {
		await page.goto("statistics/");
		await expect(
			page.getByRole("heading", { name: "Spelarhistorik" }),
		).toBeVisible();

		await page.reload();
		await expect(
			page.getByRole("heading", { name: "Spelarhistorik" }),
		).toBeVisible();
	});

	test("shows the shared nav with Statistik marked current", async ({
		page,
	}) => {
		await page.goto("statistics/");
		const nav = page.locator("#pageNav");
		await expect(
			nav.getByRole("link", { name: "Statistik", exact: true }),
		).toHaveAttribute("aria-current", "page");
	});

	test("a match file can be imported directly, with no detour through setup", async ({
		history,
		page,
	}) => {
		await page.goto("statistics/");
		await history.importFiles([
			{
				name: "match.json",
				contents: matchFileToJson(makeMatchFile({ seed: 1 })),
			},
		]);
		await expect(history.count).toHaveText("1 match över 1 månad.");
	});
});

/** The season report and the player notes are their own real pages (#119):
 * reachable by URL, still correct after a reload, with Statistik current. */
for (const { path, heading } of [
	{ path: "statistics/sasongsrapport/", heading: "Säsongsrapport" },
	{ path: "statistics/anteckningar/", heading: "Spelaranteckningar" },
]) {
	test.describe(`Statistics sub-page ${path}`, () => {
		test("loads directly and works after a refresh", async ({ page }) => {
			await page.goto(path);
			await expect(
				page.getByRole("heading", { name: heading, level: 1 }),
			).toBeVisible();

			await page.reload();
			await expect(
				page.getByRole("heading", { name: heading, level: 1 }),
			).toBeVisible();
		});

		test("shows the shared nav with Statistik marked current", async ({
			page,
		}) => {
			await page.goto(path);
			await expect(
				page
					.locator("#pageNav")
					.getByRole("link", { name: "Statistik", exact: true }),
			).toHaveAttribute("aria-current", "page");
		});

		test("says so when there are no matches yet", async ({ history, page }) => {
			await page.goto(path);
			await expect(history.count).toHaveText(
				"Inga matcher än. Spela en match eller läs in matchfiler.",
			);
		});
	});
}
