import {
	test as base,
	expect as baseExpect,
	type Locator,
} from "@playwright/test";
import { HistoryPage } from "./pages/HistoryPage.js";
import { MatchPage } from "./pages/MatchPage.js";
import { ReportPage } from "./pages/ReportPage.js";
import { SetupPage } from "./pages/SetupPage.js";
import { TeamSwitcher } from "./pages/TeamSwitcher.js";
import { SQUAD } from "./support/squads.js";

/** A fixed moment for every test's fake clock. */
const START = new Date("2026-09-05T09:00:00");

interface Fixtures {
	setup: SetupPage;
	match: MatchPage;
	report: ReportPage;
	history: HistoryPage;
	teamSwitcher: TeamSwitcher;
	/**
	 * Content-Security-Policy violations the browser reported (#147). Any left
	 * at the end of a test fail it; a test that causes one on purpose clears
	 * it after checking.
	 */
	cspViolations: string[];
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
	// biome-ignore lint/correctness/noEmptyPattern: Playwright needs a destructured first argument.
	cspViolations: async ({}, use) => {
		await use([]);
	},
	page: async ({ page, cspViolations }, use) => {
		// Paused, so match time moves only through match.play(); real time
		// passing during assertions can never change what a test sees.
		// Installed a minute early and then paused at START: installing at
		// START itself races, because any real time that passes before the
		// pause puts the clock already past it ("Cannot fast-forward to the
		// past").
		await page.clock.install({ time: new Date(START.getTime() - 60_000) });
		await page.clock.pauseAt(START);
		// The Content-Security-Policy (#147) must never be in the way of the
		// app: any violation the browser reports fails the test that caused it.
		page.on("console", (message) => {
			if (message.text().includes("Content Security Policy")) {
				cspViolations.push(message.text());
			}
		});
		await use(page);
		baseExpect(cspViolations).toEqual([]);
	},
	setup: async ({ page }, use) => {
		await use(new SetupPage(page));
	},
	match: async ({ page }, use) => {
		await use(new MatchPage(page));
	},
	history: async ({ page }, use) => {
		await use(new HistoryPage(page));
	},
	report: async ({ page }, use) => {
		await use(new ReportPage(page));
	},
	teamSwitcher: async ({ page }, use) => {
		await use(new TeamSwitcher(page));
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
