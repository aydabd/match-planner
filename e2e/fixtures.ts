import {
	test as base,
	expect as baseExpect,
	type Locator,
} from "@playwright/test";
import { MatchPage } from "./pages/MatchPage.js";
import { SetupPage } from "./pages/SetupPage.js";
import { SQUAD } from "./support/squads.js";

interface Fixtures {
	setup: SetupPage;
	match: MatchPage;
	/** A match started with the test squad; the clock is not running yet. */
	startedMatch: MatchPage;
}

/**
 * Each test gets its own browser context (so its own empty localStorage)
 * and a fake clock: match time only moves when a test calls
 * `match.play(minutes)`. Nothing is shared between tests, so they run fully
 * in parallel, and Playwright closes the context after each test.
 */
export const test = base.extend<Fixtures>({
	page: async ({ page }, use) => {
		await page.clock.install();
		await use(page);
	},
	setup: async ({ page }, use) => {
		await use(new SetupPage(page));
	},
	match: async ({ page }, use) => {
		await use(new MatchPage(page));
	},
	startedMatch: async ({ setup, match }, use) => {
		await setup.open();
		await setup.addPlayers(SQUAD);
		await setup.startMatch();
		await baseExpect(match.root).toBeVisible();
		await use(match);
	},
});

export const expect = baseExpect.extend({
	/** Retrying check of the values typed into a list of text inputs. */
	async toHaveInputValues(
		inputs: Locator,
		expected: readonly string[],
		options?: { timeout?: number },
	) {
		const name = "toHaveInputValues";
		let actual: string[] = [];
		try {
			await baseExpect
				.poll(async () => {
					actual = await inputs.evaluateAll((els) =>
						els.map((el) => (el as HTMLInputElement).value),
					);
					return actual;
				}, options)
				.toEqual([...expected]);
			return { pass: true, name, message: () => "" };
		} catch {
			return {
				pass: false,
				name,
				expected,
				actual,
				message: () =>
					`${this.utils.matcherHint(name, undefined, undefined, { isNot: this.isNot })}\n\n` +
					`Expected: ${this.utils.printExpected(expected)}\n` +
					`Received: ${this.utils.printReceived(actual)}`,
			};
		}
	},
});
