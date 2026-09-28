import type { Locator, Page } from "@playwright/test";

type SwapDuration = "1 min" | "2 min" | "5 min" | "Till nästa byte";

/** A player name as literal text inside a regular expression. */
function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The live match screen: clock, next swap, pitch, bench, playtime, menu. */
export class MatchPage {
	readonly root: Locator;
	readonly formatLabel: Locator;

	// Clock
	readonly clock: Locator;
	readonly time: Locator;
	readonly timeLeft: Locator;
	readonly swapNumber: Locator;
	readonly startClockButton: Locator;
	readonly continueButton: Locator;
	readonly pauseButton: Locator;
	readonly swapInNewTeamButton: Locator;
	readonly nextPeriodButton: Locator;
	readonly showReportButton: Locator;
	/** The player in goal (shown below the outfield lines). */
	readonly keeper: Locator;
	readonly nextPeriodKeeper: Locator;
	/** "Period 1 av 3, byte 1" (a live region). */
	readonly periodAndSwap: Locator;
	/** "17:30 kvar av perioden". */
	readonly periodTimeLeft: Locator;

	// Lineup
	readonly pitchPlayers: Locator;
	/** Line names on the pitch, attack at the top. */
	readonly zoneLabels: Locator;
	readonly benchPlayers: Locator;
	readonly swapPanel: Locator;
	readonly nextIn: Locator;
	readonly nextOut: Locator;
	/** "Byte om 00:25" / "Dags att byta ..." once the swap warning starts. */
	readonly swapStatus: Locator;
	/** One row per substitution in the swap warning. */
	readonly swapRows: Locator;
	/** Screen-reader announcement of the swap warning (visually hidden). */
	readonly swapAnnouncement: Locator;
	readonly outOfMatch: Locator;

	private readonly pitch: Locator;
	private readonly bench: Locator;
	private readonly menu: Locator;

	constructor(private readonly page: Page) {
		this.root = page.locator("#matchView");
		this.formatLabel = this.root.locator("#formatLabel");

		this.clock = this.root.locator("#clockCard");
		this.time = this.root.locator("#timerDisplay");
		this.timeLeft = this.root.locator("#timerRemaining");
		this.swapNumber = this.root.locator("#rotationLabel");
		this.startClockButton = this.root.getByRole("button", {
			name: "Starta matchen",
		});
		this.continueButton = this.root.getByRole("button", { name: "Fortsätt" });
		this.pauseButton = this.root.getByRole("button", { name: "Pausa" });
		this.swapInNewTeamButton = this.root.getByRole("button", {
			name: "Byt in nya laget",
		});
		this.nextPeriodButton = this.root.getByRole("button", {
			name: /^Starta period \d$/,
		});
		this.periodAndSwap = this.root.locator(".clock-period");
		this.keeper = this.root.locator("#pitch .chip.gk");
		this.nextPeriodKeeper = this.root.getByLabel("Målvakt i nästa period");
		this.periodTimeLeft = this.root.locator("#periodTime");

		this.pitch = this.root.locator("#pitch");
		this.bench = this.root.locator("#benchList");
		// Outfield players only; the keeper has its own locator.
		this.pitchPlayers = this.pitch.locator(".chip:not(.gk)");
		this.zoneLabels = this.pitch.locator(".zone-label");
		this.benchPlayers = this.bench.locator(".bench-name");
		this.swapPanel = this.root.locator("#swapPanel");
		this.nextIn = this.root.locator(".next-in li");
		this.nextOut = this.root.locator(".next-out li");
		this.swapStatus = this.root.locator(".swap-warning-status");
		this.swapRows = this.root.locator(".swap-item");
		this.swapAnnouncement = this.root.locator("#swapAnnouncer");
		this.outOfMatch = this.root.getByRole("alert");

		this.showReportButton = this.root.getByRole("button", {
			name: "Visa matchrapport",
		});
		this.menu = this.root.locator("#matchMenu");
	}

	// ---------- time ----------

	/** Let match time pass. Uses the fake clock installed by the fixtures. */
	async play(minutes: number): Promise<void> {
		await this.page.clock.runFor(minutes * 60_000);
	}

	async startClock(): Promise<void> {
		await this.startClockButton.click();
	}

	/**
	 * Play a whole rotation and put the next team on. Kicks off first if the
	 * match has not started; the match clock keeps running through the swap.
	 */
	async playRotationAndSwap(minutes = 10): Promise<void> {
		if (await this.startClockButton.isVisible()) await this.startClock();
		await this.play(minutes);
		await this.swapInNewTeamButton.click();
	}

	// ---------- lineup ----------

	/** The pitch area, e.g. to check that every player fits inside it. */
	get pitchArea(): Locator {
		return this.pitch;
	}

	pitchPlayer(name: string): Locator {
		return this.pitch.getByRole("button", { name, exact: true });
	}

	/** A bench player's chip, including any rest countdown. */
	benchPlayer(name: string): Locator {
		return this.bench
			.getByRole("button")
			.filter({ has: this.page.locator(".bench-name", { hasText: name }) });
	}

	playtime(name: string): Locator {
		return this.root
			.locator(".pt-row")
			.filter({ has: this.page.locator(".pt-name", { hasText: name }) })
			.locator(".pt-time");
	}

	async swapTemporarily(
		out: string,
		inn: string,
		duration: SwapDuration,
	): Promise<void> {
		await this.pitchPlayer(out).click();
		await this.benchPlayer(inn).click();
		await this.swapPanel.getByRole("button", { name: duration }).click();
	}

	async takeOutForRestOfMatch(name: string): Promise<void> {
		await this.pitchPlayer(name).click();
		await this.swapPanel
			.getByRole("button", { name: "Ute resten av matchen" })
			.click();
	}

	async bringBackIntoSquad(name: string): Promise<void> {
		await this.outOfMatch
			.locator(".alert-row", { hasText: name })
			.getByRole("button", { name: "Tillbaka i truppen" })
			.click();
	}

	/** Make one substitution from the swap warning. */
	async confirmSwap(incoming: string): Promise<void> {
		await this.root
			.getByRole("button", {
				name: new RegExp(`^Klart: ${escapeRegExp(incoming)} in för `),
			})
			.click();
	}

	/** Mid-period keeper change: tap the keeper, pick the new one. */
	async changeKeeperTo(name: string): Promise<void> {
		await this.keeper.click();
		await this.root.getByLabel("Ny målvakt").selectOption({ label: name });
		await this.root.getByRole("button", { name: "Byt målvakt" }).click();
	}

	async undoTemporarySwaps(): Promise<void> {
		await this.root
			.getByRole("button", { name: "Ångra tillfälliga byten" })
			.click();
	}

	// ---------- menu ----------

	async addLatePlayer(name: string): Promise<void> {
		await this.chooseFromMenu("Lägg till spelare som kom sent");
		const input = this.root.getByLabel("Namn på spelaren som kom sent");
		await input.fill(name);
		await input.press("Enter");
	}

	async openPolicyPage(): Promise<void> {
		await this.chooseFromMenu("Varför fungerar det så här?");
	}

	async editSquad(): Promise<void> {
		await this.chooseFromMenu("Ändra trupp eller format");
	}

	/** Reset needs two taps: the first arms it, the second confirms. */
	async resetMatch(): Promise<void> {
		await this.chooseFromMenu("Nollställ matchen");
		await this.menu
			.getByRole("button", { name: "Tryck igen för att nollställa" })
			.click();
	}

	/** Ending the match needs two taps, like reset. */
	async endMatch(): Promise<void> {
		await this.chooseFromMenu("Avsluta matchen");
		await this.menu
			.getByRole("button", { name: "Tryck igen för att avsluta" })
			.click();
	}

	private async chooseFromMenu(item: string): Promise<void> {
		await this.menu.getByText("Meny", { exact: true }).click();
		await this.menu.getByRole("button", { name: item }).click();
	}
}
