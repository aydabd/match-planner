import type { Locator, Page } from "@playwright/test";

/** The season history screen: import match files, read the statistics. */
export class HistoryPage {
	readonly root: Locator;
	readonly count: Locator;
	readonly messages: Locator;
	readonly backButton: Locator;
	readonly driveConnectButton: Locator;
	readonly driveBackupButton: Locator;
	readonly driveRestoreButton: Locator;
	readonly driveStatus: Locator;
	readonly playerNotesCard: Locator;
	readonly playerNotesFeedback: Locator;

	constructor(private readonly page: Page) {
		this.root = page.locator("#historyView");
		this.count = this.root.locator("#historyCount");
		this.messages = this.root.locator("#historyMessages li");
		this.backButton = this.root.getByRole("button", { name: "Tillbaka" });
		this.driveConnectButton = this.root.getByRole("button", {
			name: "Koppla Google Drive",
		});
		this.driveBackupButton = this.root.getByRole("button", {
			name: "Säkerhetskopiera",
		});
		this.driveRestoreButton = this.root.getByRole("button", {
			name: "Återställ",
		});
		this.driveStatus = this.root.locator("#driveStatus");
		this.playerNotesCard = this.root.locator("section.card").filter({
			has: page.getByRole("heading", { name: "Anteckningar per spelare" }),
		});
		this.playerNotesFeedback = this.playerNotesCard.locator(
			".report-feedback li",
		);
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

	async choosePlayerForNotes(name: string): Promise<void> {
		await this.playerNotesCard
			.getByLabel("Välj spelare")
			.selectOption({ label: name });
	}

	async logAvailability(fields: {
		match: string;
		status: "Var med" | "Frånvarande";
		reason?: "Skada" | "Sjukdom" | "Annat";
		note?: string;
	}): Promise<void> {
		const card = this.playerNotesCard;
		await card.getByLabel("Välj match").selectOption({ label: fields.match });
		await card.getByLabel("Status", { exact: true }).selectOption({
			label: fields.status,
		});
		if (fields.reason) {
			await card
				.getByLabel("Anledning", { exact: true })
				.selectOption({ label: fields.reason });
		}
		if (fields.note) {
			await card.getByLabel("Anteckning (valfritt)").fill(fields.note);
		}
		const saveBtn = card.getByRole("button", { name: "Spara närvaro" });
		await saveBtn.scrollIntoViewIfNeeded();
		await this.clickBelowADateField(saveBtn);
	}

	async addDevelopmentNote(fields: {
		area: "Fysiskt" | "Mentalt" | "Tekniskt" | "Taktiskt";
		note: string;
	}): Promise<void> {
		const card = this.playerNotesCard;
		await card
			.getByLabel("Område", { exact: true })
			.selectOption({ label: fields.area });
		await card.getByLabel("Vad har du sett?").fill(fields.note);
		const addBtn = card.getByRole("button", { name: "Lägg till anteckning" });
		await addBtn.scrollIntoViewIfNeeded();
		await this.clickBelowADateField(addBtn);
	}

	/**
	 * On the "phone" project only, Playwright's own actionability re-check
	 * inside .click() reports this button as covered by the <input
	 * type="date"> earlier in the same form, on every retry, for the full
	 * 30s timeout - even though scrollIntoViewIfNeeded() plus a direct
	 * elementFromPoint() check (both verified by hand while debugging this)
	 * agree the button is correctly on top with nothing overlapping it. That
	 * makes this a Playwright/mobile-Chromium false positive, not a real UI
	 * defect worth chasing further - force the click past it.
	 */
	private async clickBelowADateField(button: Locator): Promise<void> {
		await button.click({ force: true });
	}

	developmentNotes(): Locator {
		return this.playerNotesCard.locator(".history-messages li");
	}
}
