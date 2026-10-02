import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Browser } from "@playwright/test";
import { matchFileToJson } from "../../src/core/matchFile.js";
import { EMPTY_PLAYER_NOTES_FILE } from "../../src/core/playerNotes.js";
import {
	encryptJson,
	securePackageToJson,
} from "../../src/core/securePackage.js";
import { newRoster, rosterToJson } from "../../src/core/storage.js";
import { makeMatchFile } from "../../tests/support/matchFiles.js";
import { expect, test } from "../fixtures.js";
import { MatchPage } from "../pages/MatchPage.js";
import { SetupPage } from "../pages/SetupPage.js";
import { SQUAD } from "../support/squads.js";

const { version: APP_VERSION } = JSON.parse(
	readFileSync("package.json", "utf8"),
) as { version: string };

const TEAM_11 = Array.from({ length: 13 }, (_, i) => `Spelare ${i + 1}`);

/**
 * Another coach's phone: its own browser context, so its own storage.
 * Callers close it when done.
 */
async function openOtherPhone(browser: Browser) {
	const context = await browser.newContext({ reducedMotion: "reduce" });
	const page = await context.newPage();
	const setup = new SetupPage(page);
	await setup.open();
	return { context, setup, match: new MatchPage(page) };
}

test.describe("Saving and loading a squad file", () => {
	test("a squad saved on one phone loads on another", async ({
		setup,
		browser,
	}) => {
		await setup.open();
		await setup.addPlayers(SQUAD);
		const download = await setup.saveSquadToFile();
		expect(download.suggestedFilename()).toBe("trupp-7v7-2-3-1.json");
		const contents = await readFile(await download.path(), "utf8");

		const other = await openOtherPhone(browser);
		await expect(other.setup.emptySquadMessage).toBeVisible();

		await other.setup.loadSquadFromFile({
			name: "trupp-7v7-2-3-1.json",
			contents,
		});

		await expect(other.setup.players).toHaveInputValues(SQUAD);
		await expect(other.setup.squadFileMessage).toBeHidden();
		await other.context.close();
	});

	test("a whole team setup moves to another coach, who can start at once", async ({
		setup,
		browser,
	}) => {
		await setup.open();
		await setup.chooseTeamSize("11v11");
		await setup.enterCustomFormation("4-2-1-2-1");
		await setup.setMinutesBetweenSwaps(8);
		await setup.setMatchLength(2, 35);
		await setup.setMatchDetails({
			opponent: "IFK Lund",
			venue: "Klostergården",
			date: "2026-10-04T10:30",
			coach: "Aydin",
		});
		await setup.addPlayers(TEAM_11);
		await setup.markGoalkeeper("Spelare 1");
		await setup.markGoalkeeper("Spelare 2");
		await setup.startingKeeper.selectOption({ label: "Spelare 2" });
		const download = await setup.saveSquadToFile();
		expect(download.suggestedFilename()).toBe("trupp-11v11-4-2-1-2-1.json");
		const contents = await readFile(await download.path(), "utf8");
		const saved = JSON.parse(contents);
		expect(saved.schemaVersion).toBe(3);
		expect(saved.audit.appVersion).toBe(APP_VERSION);
		expect(Date.parse(saved.audit.createdAt)).not.toBeNaN();
		expect(saved.audit.createdBy).toBe("Aydin");
		expect(saved.match).toEqual({
			opponent: "IFK Lund",
			venue: "Klostergården",
			date: "2026-10-04T10:30",
		});

		const other = await openOtherPhone(browser);
		await other.setup.loadSquadFromFile({ name: "team.json", contents });

		await expect(
			other.setup.teamSizes.getByRole("radio", { name: "11v11" }),
		).toBeChecked();
		await expect(
			other.setup.formations.getByRole("radio", { name: "Egen" }),
		).toBeChecked();
		await expect(other.setup.customFormation).toHaveValue("4-2-1-2-1");
		await expect(other.setup.minutesBetweenSwaps).toHaveValue("8");
		await expect(other.setup.periods).toHaveValue("2");
		await expect(other.setup.periodMinutes).toHaveValue("35");
		await expect(other.setup.opponent).toHaveValue("IFK Lund");
		await expect(other.setup.venue).toHaveValue("Klostergården");
		await expect(other.setup.matchDate).toHaveValue("2026-10-04T10:30");
		await expect(other.setup.players).toHaveInputValues(TEAM_11);
		for (const keeper of ["Spelare 1", "Spelare 2"]) {
			await expect(
				other.setup.root.getByRole("checkbox", {
					name: `Målvakt: ${keeper}`,
					exact: true,
				}),
			).toBeChecked();
		}
		await expect(
			other.setup.startingKeeper.locator("option:checked"),
		).toHaveText("Spelare 2");

		await other.setup.startMatch();

		await expect(other.match.formatLabel).toHaveText(
			"11v11 (4-2-1-2-1), byte var 8 min",
		);
		await expect(other.match.periodAndSwap).toHaveText("Period 1 av 2, byte 1");
		await expect(other.match.pitchPlayers).toHaveCount(10);
		await expect(other.match.keeper).toHaveText("Spelare 2");
		await other.context.close();
	});

	test("loading a file replaces a half-typed custom formation", async ({
		setup,
		browser,
	}) => {
		await setup.open();
		await setup.chooseTeamSize("9v9");
		await setup.addPlayers(TEAM_11);
		const download = await setup.saveSquadToFile();
		const contents = await readFile(await download.path(), "utf8");

		const other = await openOtherPhone(browser);
		await other.setup.enterCustomFormation("9-9");
		await expect(other.setup.startButton).toBeDisabled();

		await other.setup.loadSquadFromFile({ name: "team.json", contents });

		await expect(
			other.setup.formations.getByRole("radio", { name: "3-3-2" }),
		).toBeChecked();
		await expect(other.setup.customFormation).toBeHidden();
		await expect(other.setup.startButton).toBeEnabled();
		await other.context.close();
	});

	test("a file that is not a squad shows a clear message", async ({
		setup,
	}) => {
		await setup.open();

		await setup.loadSquadFromFile({
			name: "notes.json",
			contents: "this is not json",
		});

		await expect(setup.squadFileMessage).toHaveText(
			"Filen kunde inte läsas. Välj en fil som sparats från MatchPlanner.",
		);
		await expect(setup.emptySquadMessage).toBeVisible();
	});

	test("the start page says Trupp, with no leftover of the old wording", async ({
		setup,
		page,
	}) => {
		await setup.open();
		await expect(
			setup.root.getByRole("heading", { name: "Trupp", level: 2, exact: true }),
		).toBeVisible();
		await expect(setup.saveSquadButton).toBeVisible();
		await expect(
			setup.root.getByRole("button", { name: "Hämta trupp" }),
		).toBeVisible();
		await expect(page.getByText("Spara eller hämta en trupp")).toHaveCount(0);
		await expect(page.getByText("Hämta trupp från fil")).toHaveCount(0);
	});

	test("the squad can be fetched from an encrypted export, after its password", async ({
		setup,
	}) => {
		const password = "hemligt-lösenord";
		const bundle = {
			schemaVersion: 1,
			roster: newRoster({
				formatId: "7v7:2-3-1",
				players: SQUAD.map((name, i) => ({ id: `p${i + 1}`, name })),
			}),
			matches: [],
			playerNotes: EMPTY_PLAYER_NOTES_FILE,
		};
		const contents = securePackageToJson(await encryptJson(password, bundle));
		await setup.open();
		await expect(setup.squadPasswordField).toBeHidden();

		await setup.loadSquadFromFile({ name: "export.json", contents });
		await expect(setup.squadPasswordField).toBeVisible();
		await expect(setup.squadFileMessage).toHaveText(
			"Filen är krypterad. Ange lösenordet för att hämta truppen.",
		);
		await expect(setup.emptySquadMessage).toBeVisible();

		await setup.unlockSquadFile("fel-lösenord");
		await expect(setup.squadFileMessage).toHaveText(
			"Fel lösenord, eller filen har ändrats. Kontrollera lösenordet och försök igen.",
		);
		await expect(setup.emptySquadMessage).toBeVisible();

		await setup.unlockSquadFile(password);
		await expect(setup.players).toHaveInputValues(SQUAD);
		await expect(setup.squadPasswordField).toBeHidden();
		await expect(setup.squadPasswordInput).toHaveValue("");
	});

	test("an export with no squad says so, and changes nothing", async ({
		setup,
	}) => {
		const password = "hemligt-lösenord";
		const bundle = {
			schemaVersion: 1,
			roster: null,
			matches: [makeMatchFile({ matchId: "m1" })],
			playerNotes: EMPTY_PLAYER_NOTES_FILE,
		};
		await setup.open();
		await setup.loadSquadFromFile({
			name: "export.json",
			contents: securePackageToJson(await encryptJson(password, bundle)),
		});
		await setup.unlockSquadFile(password);
		await expect(setup.squadFileMessage).toHaveText(
			"Filen innehåller ingen trupp. Välj en truppfil eller en krypterad exportfil.",
		);
		await expect(setup.emptySquadMessage).toBeVisible();
	});

	test("a match file is understood but has no squad", async ({ setup }) => {
		await setup.open();
		await setup.loadSquadFromFile({
			name: "match.json",
			contents: matchFileToJson(makeMatchFile({ matchId: "m1" })),
		});
		await expect(setup.squadFileMessage).toHaveText(
			"Filen innehåller ingen trupp. Välj en truppfil eller en krypterad exportfil.",
		);
	});

	test("a squad file that is wrong says what is wrong with it", async ({
		setup,
	}) => {
		await setup.open();
		await setup.loadSquadFromFile({
			name: "tom.json",
			contents: rosterToJson(newRoster({ formatId: "7v7:2-3-1" })),
		});
		await expect(setup.squadFileMessage).toHaveText(
			"Filen innehåller inga spelare.",
		);
	});
});
