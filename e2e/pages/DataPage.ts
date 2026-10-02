import type { Locator, Page } from "@playwright/test";

/** The Data page (#154): bring files in, send everything out, keep Drive in sync. */
export class DataPage {
	readonly root: Locator;
	readonly title: Locator;

	constructor(private readonly page: Page) {
		this.root = page.locator("#dataView");
		this.title = this.root.getByRole("heading", { level: 1 });
	}

	/** A real navigation to /data/, by URL. */
	async goto(): Promise<void> {
		await this.page.goto("data/");
	}
}
