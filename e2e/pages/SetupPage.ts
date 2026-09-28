import type { Download, Locator, Page } from "@playwright/test";

/** The "Ny match" screen: match settings, today's squad and squad files. */
export class SetupPage {
	readonly root: Locator;
	readonly teamSizes: Locator;
	readonly formations: Locator;
	readonly customFormation: Locator;
	readonly customFormationMessage: Locator;
	readonly minutesBetweenSwaps: Locator;
	readonly squadCount: Locator;
	readonly players: Locator;
	readonly emptySquadMessage: Locator;
	readonly startButton: Locator;
	readonly squadFileMessage: Locator;

	private readonly nameInput: Locator;
	private readonly squadFileSection: Locator;

	constructor(private readonly page: Page) {
		this.root = page.locator("#setupView");
		this.teamSizes = this.root.getByRole("group", { name: "Lagstorlek" });
		this.formations = this.root.getByRole("group", { name: "Formation" });
		this.customFormation = this.root.getByLabel(
			"Egen formation, från back till anfall",
		);
		this.customFormationMessage = this.root.locator("#customFormationMessage");
		this.minutesBetweenSwaps = this.root.getByLabel("Minuter mellan byten");
		this.squadCount = this.root.locator("#squadCount");
		this.players = this.root.getByRole("textbox", { name: /^Namn, spelare/ });
		this.emptySquadMessage = this.root.getByText("Inga spelare än");
		this.startButton = this.root.locator("#startMatchBtn");
		this.squadFileMessage = this.root.locator("#importError");
		this.nameInput = this.root.getByLabel("Spelarens namn");
		this.squadFileSection = this.root.getByRole("group").filter({
			hasText: "Spara eller hämta en trupp",
		});
	}

	async open(): Promise<void> {
		// Relative, so it also works when the app is served under a base path.
		await this.page.goto("./");
	}

	async addPlayers(names: readonly string[]): Promise<void> {
		for (const name of names) {
			await this.nameInput.fill(name);
			await this.nameInput.press("Enter");
		}
	}

	/** The name field of the player at a 1-based position in the list. */
	player(position: number): Locator {
		return this.root.getByRole("textbox", {
			name: `Namn, spelare ${position}`,
		});
	}

	async renamePlayer(position: number, newName: string): Promise<void> {
		await this.player(position).fill(newName);
		await this.player(position).blur();
	}

	async removePlayer(name: string): Promise<void> {
		await this.root.getByRole("button", { name: `Ta bort ${name}` }).click();
	}

	async chooseTeamSize(size: "5v5" | "7v7" | "9v9" | "11v11"): Promise<void> {
		await this.teamSizes.getByRole("radio", { name: size }).check();
	}

	/** Pick one of the quick-pick formations shown for the team size. */
	async chooseFormation(formation: string): Promise<void> {
		await this.formations.getByRole("radio", { name: formation }).check();
	}

	/** Opt in to a custom formation and type it. */
	async enterCustomFormation(formation: string): Promise<void> {
		await this.formations.getByRole("radio", { name: "Egen" }).check();
		await this.customFormation.fill(formation);
	}

	async setMinutesBetweenSwaps(minutes: number): Promise<void> {
		await this.minutesBetweenSwaps.fill(String(minutes));
		await this.minutesBetweenSwaps.blur();
	}

	async startMatch(): Promise<void> {
		await this.startButton.click();
	}

	async saveSquadToFile(): Promise<Download> {
		await this.openSquadFileSection();
		const download = this.page.waitForEvent("download");
		await this.root
			.getByRole("button", { name: "Spara trupp som fil" })
			.click();
		return download;
	}

	async loadSquadFromFile(file: {
		name: string;
		contents: string;
	}): Promise<void> {
		await this.openSquadFileSection();
		await this.root.locator("#importInput").setInputFiles({
			name: file.name,
			mimeType: "application/json",
			buffer: Buffer.from(file.contents),
		});
	}

	private async openSquadFileSection(): Promise<void> {
		const summary = this.squadFileSection.locator("summary");
		if ((await this.squadFileSection.getAttribute("open")) === null) {
			await summary.click();
		}
	}
}
