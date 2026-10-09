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
