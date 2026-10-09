import type { Locator, Page } from "@playwright/test";

/** The match report screen, and the list of kept reports on setup. */
export class ReportPage {
	readonly root: Locator;
	readonly summary: Locator;
	readonly playtimeRows: Locator;
	readonly swapRows: Locator;
	readonly backButton: Locator;
	/** Swaps that went past the match's substitution rules (#171). */
	readonly deviations: Locator;

	constructor(private readonly page: Page) {
		this.root = page.locator("#reportView");
		this.summary = this.root.locator("#reportFeedback li");
		this.playtimeRows = this.root.locator("#reportPlaytime tbody tr");
		this.swapRows = this.root.locator("#reportSwaps tbody tr");
		this.deviations = this.root.locator("#reportDeviations > li");
		// A button on the in-match overlay (still opened from the match menu);
		// a link on the standalone /report/ page (a real navigation, see #93).
		this.backButton = this.root
			.getByRole("button", { name: "Tillbaka" })
			.or(this.root.getByRole("link", { name: "Tillbaka" }));
	}

	/** A kept report in the "Tidigare matchrapporter" list on setup. */
	keptReport(name: string | RegExp): Locator {
		return this.page.locator("#reportsSection").getByRole("button", { name });
	}

	async openKeptReports(): Promise<void> {
		const section = this.page.locator("#reportsSection");
		if ((await section.getAttribute("open")) === null) {
			await section.locator("summary").click();
		}
	}
}
