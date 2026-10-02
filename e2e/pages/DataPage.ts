import { expect, type Locator, type Page } from "@playwright/test";

/** The Data page (#154): bring files in, send everything out, keep Drive in sync. */
export class DataPage {
	readonly root: Locator;
	readonly title: Locator;
	readonly count: Locator;
	readonly messages: Locator;
	readonly driveConnectButton: Locator;
	readonly driveChooseFolderButton: Locator;
	readonly drivePasswordInput: Locator;
	readonly driveBackupButton: Locator;
	readonly driveRestoreButton: Locator;
	readonly driveStatus: Locator;
	readonly driveTeamSelect: Locator;
	readonly driveRestoreTeamButton: Locator;
	readonly secureExportPasswordInput: Locator;
	readonly secureExportButton: Locator;
	readonly secureImportFileInput: Locator;
	readonly secureImportButton: Locator;
	readonly secureExportStatus: Locator;

	constructor(private readonly page: Page) {
		this.root = page.locator("#dataView");
		this.title = this.root.getByRole("heading", { level: 1 });
		this.count = this.root.locator("#historyCount");
		this.messages = this.root.locator("#historyMessages li");
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
		this.driveTeamSelect = this.root.locator("#driveTeamSelect");
		this.driveRestoreTeamButton = this.root.getByRole("button", {
			name: "Läs in laget",
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

	/** A real navigation to /data/, by URL. */
	async goto(): Promise<void> {
		await this.page.goto("data/");
	}

	/** Open it from the setup screen: a real navigation to /data/. */
	async open(): Promise<void> {
		await this.page.locator("#dataOpenBtn").click();
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
		// The import reads and stores the files asynchronously and then says
		// so; leaving the page before that would abandon it half done.
		await expect(this.messages.first()).toBeVisible();
	}
}
