import type { Locator, Page } from "@playwright/test";

/** The season history screen: import match files, read the statistics. */
export class HistoryPage {
	readonly root: Locator;
	readonly count: Locator;
	readonly messages: Locator;
	readonly backButton: Locator;

	constructor(private readonly page: Page) {
		this.root = page.locator("#historyView");
		this.count = this.root.locator("#historyCount");
		this.messages = this.root.locator("#historyMessages li");
		this.backButton = this.root.getByRole("button", { name: "Tillbaka" });
	}

	/** Open it from the setup screen. */
	async open(): Promise<void> {
		await this.page
			.getByRole("button", { name: "Visa spelarhistorik" })
			.click();
	}

	async importFiles(
		files: readonly { name: string; contents: string }[],
	): Promise<void> {
		await this.root.locator("#historyImportInput").setInputFiles(
			files.map((file) => ({
				name: file.name,
				mimeType: "application/json",
				buffer: Buffer.from(file.contents),
			})),
		);
	}

	/** The row of a player in one of the tables ("Startat och speltid", ...). */
	row(table: string, player: string): Locator {
		return this.root
			.locator("section.card")
			.filter({ has: this.page.getByRole("heading", { name: table }) })
			.getByRole("row")
			.filter({
				has: this.page.getByRole("rowheader", { name: player, exact: true }),
			});
	}
}
