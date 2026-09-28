import { expect, test } from "../fixtures.js";
import { SQUAD } from "../support/squads.js";

// 7v7: 6 outfield players plus a keeper. The test squad has 8 players.

test.describe("Goalkeepers", () => {
	test.beforeEach(async ({ setup }) => {
		await setup.open();
		await setup.addPlayers(SQUAD);
	});

	test("marking a goalkeeper picks the starting keeper and needs one more player", async ({
		setup,
	}) => {
		await expect(setup.startingKeeper).toBeHidden();
		await expect(setup.squadCount).toHaveText("8 av minst 6");

		await setup.markGoalkeeper("Hugo");

		await expect(setup.startingKeeper).toBeVisible();
		await expect(setup.startingKeeper).toHaveValue(/p\d+/);
		await expect(setup.startingKeeper.locator("option:checked")).toHaveText(
			"Hugo",
		);
		await expect(setup.squadCount).toHaveText("8 av minst 7");
	});

	test("the keeper stays in goal while the outfield rotates, and earns minutes", async ({
		setup,
		match,
	}) => {
		await setup.markGoalkeeper("Hugo");
		await setup.startMatch();

		await expect(match.keeper).toHaveText("Hugo");
		await expect(match.pitchPlayers).not.toContainText(["Hugo"]);
		await expect(match.benchPlayer("Hugo")).toHaveCount(0);

		await match.playRotationAndSwap();

		await expect(match.keeper).toHaveText("Hugo");
		await expect(match.pitchPlayers).toHaveCount(6);
		await expect(match.playtime("Hugo")).toHaveText("10:00");
		await expect(
			match.root.locator(".pt-name", { hasText: "Hugo" }),
		).toContainText("i mål");
	});

	test("at a period break another keeper can take over for the next period", async ({
		setup,
		match,
	}) => {
		await setup.markGoalkeeper("Hugo");
		await setup.markGoalkeeper("Greta");
		await setup.startMatch();
		await match.playRotationAndSwap();
		await match.play(10);
		await expect(match.nextPeriodKeeper).toBeVisible();

		await match.nextPeriodKeeper.selectOption({ label: "Greta (målvakt)" });
		await match.nextPeriodButton.click();

		await expect(match.keeper).toHaveText("Greta");
		await expect(match.nextPeriodKeeper).toBeHidden();
		// Hugo now plays outfield or rests like everyone else.
		const hugoPlays = match.root
			.locator("#pitch .chip:not(.gk), #benchList .bench-name")
			.filter({ hasText: "Hugo" });
		await expect(hugoPlays).toHaveCount(1);
	});

	test("the keeper can be changed mid-period, e.g. after an injury", async ({
		setup,
		match,
	}) => {
		await setup.markGoalkeeper("Hugo");
		await setup.startMatch();
		await match.startClock();
		await match.play(3);

		await match.changeKeeperTo("Greta");

		await expect(match.keeper).toHaveText("Greta");
		await expect(match.pitchPlayers.or(match.benchPlayers)).toContainText([
			"Hugo",
		]);
	});
});
