import { matchFileToJson } from "../../src/core/matchFile.js";
import { makeMatchFile, NAMES } from "../../tests/support/matchFiles.js";
import { expect, test } from "../fixtures.js";

const MATCH = matchFileToJson(
	makeMatchFile({ matchId: "team-a-1", names: NAMES.slice(0, 9) }),
);

/**
 * A coach running more than one team from the same device (#118): their
 * squads, match history and player notes must never mix, and the switcher
 * in the header always shows which team is active.
 */
test.describe("Teams", () => {
	test("starts with one team, and the switcher is always visible", async ({
		setup,
		teamSwitcher,
	}) => {
		await setup.open();
		await expect(teamSwitcher.select.locator("option")).toHaveCount(1);
		await expect(teamSwitcher.newTeamButton).toBeVisible();
	});

	test("creates a second team, empty, and keeps the two squads apart", async ({
		setup,
		teamSwitcher,
	}) => {
		await setup.open();
		await setup.addPlayers(["Alva", "Bo"]);
		await expect(setup.players).toHaveInputValues(["Alva", "Bo"]);

		await teamSwitcher.createTeam("P11 7v7");
		await expect(teamSwitcher.select.locator("option")).toHaveCount(2);
		// A new team never sees the previous team's squad.
		await expect(setup.emptySquadMessage).toBeVisible();

		await setup.addPlayers(["Cissi"]);
		await expect(setup.players).toHaveInputValues(["Cissi"]);

		await teamSwitcher.switchTo("Mitt lag");
		await expect(setup.players).toHaveInputValues(["Alva", "Bo"]);

		await teamSwitcher.switchTo("P11 7v7");
		await expect(setup.players).toHaveInputValues(["Cissi"]);
	});

	test("keeps two teams' match history apart", async ({
		setup,
		data,
		history,
		teamSwitcher,
	}) => {
		await setup.open();
		await data.open();
		await data.importFiles([{ name: "match.json", contents: MATCH }]);
		await expect(data.count).toHaveText("1 match över 1 månad.");

		await setup.open();
		await teamSwitcher.createTeam("P11 7v7");
		await history.open();
		await expect(history.count).toHaveText(
			"Inga matcher än. Spela en match eller läs in matchfiler.",
		);

		await setup.open();
		await teamSwitcher.switchTo("Mitt lag");
		await history.open();
		await expect(history.count).toHaveText("1 match över 1 månad.");
	});

	test('"Rensa alla sparade data" clears every team, not just the active one', async ({
		setup,
		teamSwitcher,
	}) => {
		await setup.open();
		await setup.addPlayers(["Alva"]);
		await teamSwitcher.createTeam("P11 7v7");
		await setup.addPlayers(["Cissi"]);

		await setup.clearAllSavedData();

		await expect(setup.emptySquadMessage).toBeVisible();
		await expect(teamSwitcher.select.locator("option")).toHaveCount(1);
	});
});
