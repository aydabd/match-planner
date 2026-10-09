import { readFile } from "node:fs/promises";
import { expect, test } from "../fixtures.js";

/** Twelve outfield players and a keeper (Maja): 7v7 starts six, five may come on, one sits out. */
const SQUAD = [
	"Alva",
	"Bo",
	"Cleo",
	"Dino",
	"Ebba",
	"Filip",
	"Greta",
	"Hugo",
	"Ines",
	"Jonas",
	"Kim",
	"Lo",
	"Maja",
];

test.describe("Substitution rules on the setup screen", () => {
	test("free swaps need no proposal; ersättare show one the coach can change", async ({
		setup,
	}) => {
		await setup.open();
		await setup.addPlayers(SQUAD);
		await setup.markGoalkeeper("Maja");

		// Free swaps by default: no fairness period and no proposal.
		await expect(setup.teamRules).toContainText("Fria byten.");
		await expect(setup.fairness).toBeHidden();
		await expect(setup.proposal).toBeHidden();

		await setup.chooseTeamRules("Ersättare");
		await expect(setup.teamRules).toContainText(
			"Högst 5 inbytta, högst 3 tillfällen under spel.",
		);
		await expect(setup.fairness).toBeVisible();
		await expect(setup.proposal).toContainText("Förslag för matchen");
		// Twelve outfield players: six start, five come on, one sits out.
		await expect(setup.proposal.getByRole("combobox")).toHaveCount(12);
		await expect(
			setup.proposal.getByRole("heading", { name: "Sitter över idag" }),
		).toBeVisible();
		await expect(setup.proposal).toContainText("lika mycket som snittet");
		await expect(setup.proposal).toContainText("in för");

		// The coach lets Lo and then Alva sit out; the plan is worked out again.
		await setup.playerRole("Lo").selectOption({ label: "Sitter över" });
		await expect(setup.playerRole("Lo")).toHaveValue("sitOut");
		await setup.playerRole("Alva").selectOption({ label: "Sitter över" });
		await expect(setup.playerRole("Alva")).toHaveValue("sitOut");
		await expect(setup.playerRole("Lo")).toHaveValue("sitOut");

		// The changes are kept over a reload, and can be undone.
		await setup.open();
		await expect(setup.playerRole("Alva")).toHaveValue("sitOut");
		await setup.proposal
			.getByRole("button", { name: "Återställ förslaget" })
			.click();
		await expect(setup.playerRole("Alva")).toHaveValue("start");
	});

	test("the team's rules are saved in the squad file", async ({ setup }) => {
		await setup.open();
		await setup.addPlayers(SQUAD.slice(0, 7));
		await setup.chooseTeamRules("Egna regler");
		await setup.teamRules.getByLabel("Högst antal inbytta spelare").fill("7");
		await setup.teamRules.getByLabel("Högst antal inbytta spelare").blur();
		await setup.teamRules
			.getByLabel("Högst antal bytestillfällen under spel")
			.fill("");
		await setup.teamRules
			.getByLabel("Högst antal bytestillfällen under spel")
			.blur();
		await expect(setup.teamRules).toContainText(
			"Högst 7 inbytta, obegränsat antal tillfällen.",
		);
		await setup.fairness
			.getByLabel("Period")
			.selectOption({ label: "En säsong" });
		await setup.fairness.getByLabel("År").fill("2026");
		await setup.fairness.getByLabel("År").blur();

		const download = await setup.saveSquadToFile();
		const saved = JSON.parse(await readFile(await download.path(), "utf8"));
		expect(saved.substitutions).toEqual({
			kind: "limited",
			substitutesIn: 7,
			occasions: null,
			reEntry: false,
		});
		expect(saved.fairness).toEqual({ kind: "season", year: 2026 });
	});

	test("a cup can have its own rules without changing the team's", async ({
		setup,
	}) => {
		await setup.open();
		await setup.addPlayers(SQUAD.slice(0, 8));
		await setup.matchRulesToggle.check();
		await expect(setup.matchRules).toBeVisible();
		await setup.matchRules.getByLabel("Regler").selectOption({ index: 1 });
		await expect(setup.proposal).toContainText("Förslag för matchen");
		await expect(setup.teamRules).toContainText("Fria byten.");
	});
});

/** Six seats in 7v7 and two to bring on: nobody sits out. */
const EIGHT = SQUAD.slice(0, 8);

test.describe("A match with ersättare", () => {
	test("is played to the plan, a swap off the rules goes through, and the coach explains it in the report", async ({
		setup,
		match,
		report,
		history,
		page,
	}) => {
		await setup.open();
		await setup.addPlayers(EIGHT);
		await setup.chooseTeamRules("Ersättare");
		// 3 x 20 minutes: the even moment for two substitutes is 30:00.
		await expect(setup.proposal).toContainText("30:00 (period 2, 10:00)");
		await expect(setup.proposal).toContainText("Greta in för Alva");
		await setup.startMatch();

		await expect(match.formatLabel).toContainText("begränsade byten");
		await expect(match.limitedStatus).toHaveText(
			"Byten kvar 5/5 · Tillfällen kvar 3/3",
		);
		await expect(match.plannedSwaps).toHaveCount(1);
		await expect(match.pitchPlayers).toHaveCount(6);
		await expect(match.pitchPlayer("Alva")).toBeVisible();
		await expect(match.benchPlayers).toHaveText(["Greta", "Hugo"]);

		await match.startClock();
		await match.play(20);
		await match.nextPeriodButton.click();
		// The heads-up comes before the occasion at 30:00.
		await match.play(9.5);
		await expect(match.swapRows).toHaveCount(2);
		await match.confirmSwap("Greta");
		await match.confirmSwap("Hugo");
		await expect(match.limitedStatus).toHaveText(
			"Byten kvar 3/5 · Tillfällen kvar 2/3",
		);
		await expect(match.benchPlayers).toHaveText(["Alva", "Bo"]);

		// No temporary swaps without re-entry: only a swap for good.
		await match.pitchPlayer("Greta").click();
		await match.benchPlayer("Alva").click();
		await expect(
			match.swapPanel.getByRole("button", { name: "1 min" }),
		).toHaveCount(0);
		await match.swapPanel
			.getByRole("button", { name: "Byt", exact: true })
			.click();
		// Alva was replaced, so coming back breaks the rule; it is done anyway.
		await expect(match.limitedStatus).toContainText(
			"Bytet är gjort, men det bryter mot reglerna: en utbytt spelare kom in igen.",
		);
		await expect(match.pitchPlayer("Alva")).toBeVisible();

		await match.play(2);
		await match.endMatch();
		await expect(report.root).toBeVisible();
		await expect(report.deviations).toHaveCount(1);
		await expect(report.deviations.first()).toContainText(
			"Alva in för Greta – en utbytt spelare kom in igen.",
		);
		const explanation = report.deviations
			.first()
			.getByLabel("Förklaring till bytet Alva in för Greta");
		await explanation.fill("Greta skadade sig och ingen annan fanns kvar.");
		await report.deviations
			.first()
			.getByRole("button", { name: "Spara förklaring" })
			.click();
		await expect(report.deviations.first()).toContainText(
			"Förklaringen är sparad med matchen.",
		);

		// The explanation is kept with the match file.
		await page.reload();
		await expect(
			report.deviations
				.first()
				.getByLabel("Förklaring till bytet Alva in för Greta"),
		).toHaveValue("Greta skadade sig och ingen annan fanns kvar.");
		// The report does not judge playtime per match with limited swaps.
		await expect(report.summary).toHaveCount(0);

		// Statistics show where each player stands over the team's period.
		await history.goto();
		const standing = page
			.locator("section.card")
			.filter({ hasText: "Speltid de senaste 8 matcherna" });
		await expect(standing.getByRole("row")).toHaveCount(EIGHT.length + 1);
		await expect(standing).toContainText("Mot snittet");
	});

	test("covers an injury while the rules allow it, then warns the team plays short", async ({
		setup,
		match,
	}) => {
		await setup.open();
		await setup.addPlayers(EIGHT);
		await setup.chooseTeamRules("Egna regler");
		await setup.teamRules.getByLabel("Högst antal inbytta spelare").fill("1");
		await setup.teamRules.getByLabel("Högst antal inbytta spelare").blur();
		await expect(setup.teamRules).toContainText("Högst 1 inbytta");
		await setup.startMatch();

		await match.startClock();
		await match.play(5);
		await match.takeOutForRestOfMatch("Cleo");
		await expect(match.pitchPlayer("Greta")).toBeVisible();
		await expect(match.limitedStatus).toContainText("Byten kvar 0/1");

		await match.takeOutForRestOfMatch("Dino");
		await expect(match.pitchPlayers).toHaveCount(5);
		await expect(match.limitedStatus).toContainText(
			"Inga byten kvar – laget spelar med 5.",
		);
		await expect(match.plannedSwaps).toHaveCount(0);
	});
});
