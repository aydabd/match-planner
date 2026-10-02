import { expect, type Locator, type Page } from "@playwright/test";

/** The Data page (#154): bring files in, send everything out, keep Drive in sync. */
export class DataPage {
	readonly root: Locator;
	readonly title: Locator;
	readonly count: Locator;
	readonly messages: Locator;
	readonly importFilesInput: Locator;
	readonly importFolderInput: Locator;
	readonly importSummary: Locator;
	readonly importSkipped: Locator;
	readonly importMessages: Locator;
	readonly importPasswordField: Locator;
	readonly importPasswordInput: Locator;
	readonly importUnlockButton: Locator;
	readonly importTeamSelect: Locator;
	readonly importApplyButton: Locator;
	readonly importDriveHint: Locator;
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
	readonly secureExportStatus: Locator;

	constructor(readonly page: Page) {
		this.root = page.locator("#dataView");
		this.title = this.root.getByRole("heading", { level: 1 });
		this.count = this.root.locator("#historyCount");
		this.messages = this.root.locator("#importMessages li");
		this.importFilesInput = this.root.locator("#importFilesInput");
		this.importFolderInput = this.root.locator("#importFolderInput");
		this.importSummary = this.root.locator("#importSummary li");
		this.importSkipped = this.root.locator("#importSkipped li");
		this.importMessages = this.messages;
		this.importPasswordField = this.root.locator("#importPasswordField");
		this.importPasswordInput = this.root.locator("#importPasswordInput");
		this.importUnlockButton = this.root.getByRole("button", {
			name: "Lås upp",
		});
		this.importTeamSelect = this.root.locator("#importTeamSelect");
		this.importApplyButton = this.root.getByRole("button", {
			name: "Läs in",
			exact: true,
		});
		this.importDriveHint = this.root.locator("#importDriveHint");
		const drive = this.root.locator("#historyBackupCard");
		this.driveConnectButton = drive.getByRole("button", {
			name: "Koppla Google Drive",
		});
		this.driveChooseFolderButton = drive.getByRole("button", {
			name: /Välj mapp|Byt mapp/,
		});
		this.drivePasswordInput = drive.getByLabel("Lösenord för säkerhetskopian");
		this.driveBackupButton = drive.getByRole("button", {
			name: "Säkerhetskopiera",
		});
		this.driveRestoreButton = drive.getByRole("button", {
			name: "Återställ",
		});
		this.driveStatus = this.root.locator("#driveStatus");
		this.driveTeamSelect = this.root.locator("#driveTeamSelect");
		this.driveRestoreTeamButton = drive.getByRole("button", {
			name: "Läs in laget",
		});
		this.secureExportPasswordInput = this.root.locator(
			"#secureExportPasswordInput",
		);
		this.secureExportButton = this.root.getByRole("button", {
			name: "Exportera allt (krypterat)",
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

	/** Pick files in the "Välj filer" input. Nothing is applied yet. */
	async chooseFiles(
		files: readonly { name: string; contents: string }[],
	): Promise<void> {
		// The first render fills the match count, and it runs after the
		// page's script has attached the input's change handler; setting files
		// earlier would fire a change event nobody is listening to yet.
		await expect(this.count).not.toBeEmpty();
		await this.importFilesInput.setInputFiles(
			files.map((file) => ({
				name: file.name,
				mimeType: "application/json",
				buffer: Buffer.from(file.contents),
			})),
		);
	}

	/** Pick a whole folder in the "Välj mapp" input. Nothing is applied yet. */
	async chooseFolder(directory: string): Promise<void> {
		await expect(this.count).not.toBeEmpty();
		await this.importFolderInput.setInputFiles(directory);
	}

	/** Unlock with `password` and wait until the unlock has finished. */
	async unlock(password: string): Promise<void> {
		await this.importPasswordInput.fill(password);
		await this.importUnlockButton.click();
		await expect(this.importPasswordInput).toHaveValue("");
	}

	/** Pick plain files and apply them: the whole "Hämta in" step. */
	async importFiles(
		files: readonly { name: string; contents: string }[],
	): Promise<void> {
		await this.chooseFiles(files);
		await expect(this.importApplyButton).toBeEnabled();
		await this.importApplyButton.click();
		// The import reads and stores the files asynchronously and then says
		// so; leaving the page before that would abandon it half done.
		await expect(this.messages.first()).toBeVisible();
	}
}
