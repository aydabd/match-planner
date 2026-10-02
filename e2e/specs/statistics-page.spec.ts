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

	test("a match file can be imported directly on the Data page, with no detour through setup", async ({
		data,
		history,
	}) => {
		await data.goto();
		await data.importFiles([
			{
				name: "match.json",
				contents: matchFileToJson(makeMatchFile({ seed: 1 })),
			},
		]);
		await history.goto();
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

test.describe("Statistics secondary nav (#119)", () => {
	test("marks the current page and links the three pages together", async ({
		page,
	}) => {
		const subNav = page.locator("#statisticsSubNav");
		await page.goto("statistics/");
		await expect(subNav.getByRole("link")).toHaveText([
			"Spelstatistik",
			"Säsongsrapport",
			"Anteckningar",
		]);
		await expect(
			subNav.getByRole("link", { name: "Spelstatistik" }),
		).toHaveAttribute("aria-current", "page");

		await subNav.getByRole("link", { name: "Säsongsrapport" }).click();
		await expect(page).toHaveURL(/statistics\/sasongsrapport\/$/);
		await expect(
			subNav.getByRole("link", { name: "Säsongsrapport" }),
		).toHaveAttribute("aria-current", "page");
		await expect(
			page
				.locator("#pageNav")
				.getByRole("link", { name: "Statistik", exact: true }),
		).toHaveAttribute("aria-current", "page");

		await subNav.getByRole("link", { name: "Anteckningar" }).click();
		await expect(page).toHaveURL(/statistics\/anteckningar\/$/);
		await expect(
			subNav.getByRole("link", { name: "Anteckningar" }),
		).toHaveAttribute("aria-current", "page");
	});

	test("is absent from the other pages", async ({ page }) => {
		await page.goto("about/");
		await expect(page.locator("#statisticsSubNav")).toHaveCount(0);
	});
});
