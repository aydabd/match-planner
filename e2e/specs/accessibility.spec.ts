import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { matchFileToJson } from "../../src/core/matchFile.js";
import { makeMatchFile } from "../../tests/support/matchFiles.js";
import { expect, test } from "../fixtures.js";

/** WCAG 2.1 A/AA violations on the current screen. */
async function accessibilityViolations(page: Page) {
	// axe schedules its own timers, so the paused fake clock must run while it
	// scans. Call this last in a test: time assertions after it would not be
	// deterministic.
	await page.clock.resume();
	const results = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
		.analyze();
	return results.violations.flatMap((v) =>
		v.nodes.map(
			(node) => `${v.id} at ${node.target.join(" ")}: ${node.failureSummary}`,
		),
	);
}

for (const colorScheme of ["light", "dark"] as const) {
	test.describe(`Accessibility in ${colorScheme} mode`, () => {
		test.use({ colorScheme });

		test("the setup screen has no WCAG A/AA violations", async ({
			setup,
			page,
		}) => {
			await setup.open();
			await setup.addPlayers(["Alva", "Bo"]);
			expect(await accessibilityViolations(page)).toEqual([]);
		});

		test("the match screen has no WCAG A/AA violations", async ({
			startedMatch,
			page,
		}) => {
			await expect(startedMatch.startClockButton).toBeVisible();
			expect(await accessibilityViolations(page)).toEqual([]);
		});

		test("the match report has no WCAG A/AA violations", async ({
			startedMatch,
			report,
			page,
		}) => {
			await startedMatch.startClock();
			await startedMatch.play(11);
			await startedMatch.confirmSwap("Greta");
			await startedMatch.endMatch();
			await expect(report.root).toBeVisible();
			expect(await accessibilityViolations(page)).toEqual([]);
		});

		test("the season history has no WCAG A/AA violations", async ({
			setup,
			history,
			page,
		}) => {
			await setup.open();
			await history.open();
			await history.importFiles([
				{
					name: "match.json",
					contents: matchFileToJson(makeMatchFile({ seed: 3 })),
				},
			]);
			await expect(history.count).toHaveText("1 match över 1 månad.");
			expect(await accessibilityViolations(page)).toEqual([]);
		});

		test("the policy page has no WCAG A/AA violations", async ({
			setup,
			page,
		}) => {
			await setup.open();
			await page
				.getByRole("button", { name: "Varför fungerar det så här?" })
				.click();
			expect(await accessibilityViolations(page)).toEqual([]);
		});

		test("the match screen has no WCAG A/AA violations when a swap is due", async ({
			startedMatch,
			page,
		}) => {
			await startedMatch.startClock();
			await startedMatch.play(10);
			await expect(startedMatch.swapInNewTeamButton).toBeVisible();
			expect(await accessibilityViolations(page)).toEqual([]);
		});
	});
}
