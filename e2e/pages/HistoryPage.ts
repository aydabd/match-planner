import { expect, type Locator, type Page } from "@playwright/test";

/** The statistics pages (#119): import match files and read the tables on
 * /statistics/, the season report on /statistics/sasongsrapport/, and the
 * player notes on /statistics/anteckningar/. All three share `#historyView`. */
export class HistoryPage {
	readonly root: Locator;
	readonly count: Locator;
	readonly messages: Locator;
	readonly backButton: Locator;
	readonly driveConnectButton: Locator;
	readonly driveChooseFolderButton: Locator;
	readonly drivePasswordInput: Locator;
	readonly driveBackupButton: Locator;
	readonly driveRestoreButton: Locator;
	readonly driveStatus: Locator;
	readonly playerNotesCard: Locator;
	readonly playerNotesFeedback: Locator;
	readonly seasonReportCard: Locator;
	readonly secureExportPasswordInput: Locator;
	readonly secureExportButton: Locator;
	readonly secureImportFileInput: Locator;
	readonly secureImportButton: Locator;
	readonly secureExportStatus: Locator;

	constructor(private readonly page: Page) {
		this.root = page.locator("#historyView");
		this.count = this.root.locator("#historyCount");
		this.messages = this.root.locator("#historyMessages li");
		this.backButton = this.root.getByRole("link", { name: "Tillbaka" });
		this.driveConnectButton = this.root.getByRole("button", {
			name: "Koppla Google Drive",
		});
		this.driveChooseFolderButton = this.root.getByRole("button", {
			name: /Välj mapp|Byt mapp/,
		});
		this.drivePasswordInput = this.root.getByLabel(
			"Lösenord för säkerhetskopian",
		);
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
		this.seasonReportCard = this.root.locator("section.card").filter({
			has: page.getByRole("heading", { name: "Säsongsrapport" }),
		});
		this.secureExportPasswordInput = this.root.locator(
			"#secureExportPasswordInput",
		);
		this.secureExportButton = this.root.getByRole("button", {
			name: "Exportera allt (krypterat)",
		});
		this.secureImportFileInput = this.root.locator("#secureImportFileInput");
		this.secureImportButton = this.root.getByRole("button", {
			name: /^(Importera|Ersätt trupp och anteckningar\?)$/,
		});
		this.secureExportStatus = this.root.locator("#secureExportStatus");
	}

	/** Open it from the setup screen: a real navigation to /statistics/. */
	async open(): Promise<void> {
		await this.page.getByRole("link", { name: "Visa spelarhistorik" }).click();
	}

	/** A real navigation to the season report page, by URL. */
	async gotoSeasonReport(): Promise<void> {
		await this.page.goto("statistics/sasongsrapport/");
	}

	/** A real navigation to the player notes page, by URL. */
	async gotoNotes(): Promise<void> {
		await this.page.goto("statistics/anteckningar/");
	}

	async importFiles(
		files: readonly { name: string; contents: string }[],
	): Promise<void> {
		// The first render fills the match count, and it runs after the
		// page's script has attached the input's change handler; setting files
		// earlier would fire a change event nobody is listening to yet.
		await expect(this.count).not.toBeEmpty();
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

	/** The checkpoint field for one area, in the "Anteckningar per spelare" card. */
	checkpointArea(
		area: "Fysiskt" | "Mentalt" | "Tekniskt" | "Taktiskt",
	): Locator {
		return this.playerNotesCard.locator(".checkpoint-area").filter({
			has: this.page.getByRole("heading", { name: area, exact: true }),
		});
	}

	async markNextLevel(
		area: "Fysiskt" | "Mentalt" | "Tekniskt" | "Taktiskt",
	): Promise<void> {
		const button = this.checkpointArea(area).getByRole("button", {
			name: "Nästa nivå uppnådd",
		});
		await button.scrollIntoViewIfNeeded();
		await this.clickBelowADateField(button);
	}

	/**
	 * Two taps, like every other confirm-with-second-tap action in the app.
	 * Located by position, not its accessible name - that name changes to
	 * the confirm label after the first tap.
	 */
	async undoLevel(
		area: "Fysiskt" | "Mentalt" | "Tekniskt" | "Taktiskt",
	): Promise<void> {
		const button = this.checkpointArea(area)
			.locator(".row-buttons button")
			.nth(1);
		await button.scrollIntoViewIfNeeded();
		await this.clickBelowADateField(button);
		await this.clickBelowADateField(button);
	}

	/** The pre-filled, editable development summary for one player and area
	 * in the Säsongsrapport card (on its own page). */
	seasonReportSummary(
		name: string,
		area: "Fysiskt" | "Mentalt" | "Tekniskt" | "Taktiskt",
	): Locator {
		return this.seasonReportCard
			.locator("section.season-report-player")
			.filter({ has: this.page.getByRole("heading", { name, exact: true }) })
			.getByLabel(area, { exact: true });
	}
}
