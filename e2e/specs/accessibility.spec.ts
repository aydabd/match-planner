import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures.js";

/** WCAG 2.1 A/AA violations on the current screen. */
async function accessibilityViolations(page: Page) {
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

		test("the match screen has no WCAG A/AA violations, also when a swap is due", async ({
			startedMatch,
			page,
		}) => {
			expect(await accessibilityViolations(page)).toEqual([]);

			await startedMatch.startClock();
			await startedMatch.play(10);
			await expect(startedMatch.swapInNewTeamButton).toBeVisible();
			expect(await accessibilityViolations(page)).toEqual([]);
		});
	});
}
