import type { Locator, Page } from "@playwright/test";

/**
 * The team switcher in the shared header (src/ui/page.ts, #118): a coach
 * always knows which team's data they are looking at, and can create or
 * switch to another one.
 */
export class TeamSwitcher {
	readonly select: Locator;
	readonly switchButton: Locator;
	readonly newTeamButton: Locator;
	readonly newTeamNameInput: Locator;
	readonly createButton: Locator;

	constructor(private readonly page: Page) {
		this.select = page.getByLabel("Lag", { exact: true });
		this.switchButton = page.getByRole("button", { name: "Byt" });
		this.newTeamButton = page.getByRole("button", { name: "Nytt lag" });
		this.newTeamNameInput = page.getByLabel("Namn på det nya laget");
		this.createButton = page.getByRole("button", { name: "Skapa" });
	}

	/** Create a team, named, and wait for the reload that makes it active. */
	async createTeam(name: string): Promise<void> {
		await this.newTeamButton.click();
		await this.newTeamNameInput.fill(name);
		const reloaded = this.page.waitForEvent("load");
		await this.createButton.click();
		await reloaded;
	}

	/**
	 * Select the team with this visible name and tap "Byt" to switch to it,
	 * waiting for the reload. Two steps, not one, since the select's own
	 * change event only enables "Byt" (#118: WCAG 3.2.2, no context change
	 * on input).
	 */
	async switchTo(name: string): Promise<void> {
		await this.select.selectOption({ label: name });
		const reloaded = this.page.waitForEvent("load");
		await this.switchButton.click();
		await reloaded;
	}
}
