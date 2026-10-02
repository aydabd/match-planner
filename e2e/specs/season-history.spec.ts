import { matchFileToJson } from "../../src/core/matchFile.js";
import { makeMatchFile, NAMES } from "../../tests/support/matchFiles.js";
import { expect, test } from "../fixtures.js";
import { SQUAD } from "../support/squads.js";

/** Six matches, one a month from March to August. Alva is in goal in all. */
const FILES = Array.from({ length: 6 }, (_, i) => {
	const file = makeMatchFile({
		matchId: `match-${i}`,
		seed: 10 + i,
		date: `2026-${String(3 + i).padStart(2, "0")}-14`,
		opponent: `Lag ${i + 1}`,
		names: NAMES.slice(0, 9),
	});
	return { name: `match-${i}.json`, contents: matchFileToJson(file) };
});

test.describe("Season history", () => {
	test.beforeEach(async ({ setup }) => {
		await setup.open();
	});

	test("starts empty and says so", async ({ history }) => {
		await history.open();
		await expect(history.root).toBeVisible();
		await expect(history.count).toHaveText(
			"Inga matcher än. Spela en match eller läs in matchfiler.",
		);
	});

	test("reads several matches: starts, minutes, positions and months", async ({
		data,
		history,
	}) => {
		await data.open();
		await data.importFiles(FILES);

		await expect(data.messages.first()).toHaveText("6 nya matcher lästes in.");
		await expect(data.count).toHaveText("6 matcher över 6 månader.");
		await history.goto();
		await expect(history.count).toHaveText("6 matcher över 6 månader.");

		// Alva keeps goal for two 10-minute periods, six matches: 120 minutes.
		const alva = history.row("Startat och speltid", "Alva");
		await expect(alva.getByRole("cell").nth(0)).toHaveText("6"); // matches
		await expect(alva.getByRole("cell").nth(1)).toHaveText("6"); // started
		await expect(alva.getByRole("cell").nth(3)).toHaveText("120 min");
		await expect(alva.getByRole("cell").nth(4)).toHaveText("20 min"); // per match
		await expect(history.row("Minuter per position", "Alva")).toContainText(
			"120 min",
		);
		await expect(
			history.root.getByRole("columnheader", { name: "mars 2026" }),
		).toBeVisible();
		await expect(
			history.root.getByRole("columnheader", { name: "augusti 2026" }),
		).toBeVisible();
		await expect(history.row("Månad för månad", "Alva")).toContainText(
			"20 min",
		);
	});

	test("counts a match once however often its file is read", async ({
		data,
		history,
	}) => {
		await data.open();
		await data.importFiles(FILES.slice(0, 3));
		await data.importFiles(FILES);

		await expect(data.messages.first()).toHaveText(
			"3 nya matcher lästes in, 3 fanns redan.",
		);
		await expect(data.count).toHaveText("6 matcher över 6 månader.");
		await history.goto();
		await expect(
			history.row("Startat och speltid", "Alva").getByRole("cell").nth(0),
		).toHaveText("6");
	});

	test("refuses a broken file and says why, without changing the statistics", async ({
		data,
		history,
	}) => {
		const broken = JSON.parse(FILES[0]?.contents ?? "{}");
		broken.timeline[1].zones.back[0] = "nobody";
		await data.open();
		await data.importFiles([
			FILES[1] ?? { name: "", contents: "" },
			{ name: "trasig.json", contents: JSON.stringify(broken) },
			{ name: "inte-json.json", contents: "det här är text" },
		]);

		await expect(data.messages).toHaveText([
			"1 ny match lästes in.",
			"trasig.json: Händelse 2 i tidslinjen är ogiltig: spelaren finns inte i truppen.",
			"inte-json.json: Filen kunde inte läsas. Välj en matchfil från MatchPlanner.",
		]);
		await expect(data.count).toHaveText("1 match över 1 månad.");
		await history.goto();
		await expect(history.count).toHaveText("1 match över 1 månad.");
	});

	test("keeps the matches after a reload", async ({ data, history, page }) => {
		await data.open();
		await data.importFiles(FILES);
		// Reading files is asynchronous: reload only once they are kept.
		await expect(data.count).toHaveText("6 matcher över 6 månader.");
		await history.goto();
		// /statistics/ is a real page (#93): a reload stays there, no need to
		// reopen it from setup.
		await page.reload();
		await expect(history.count).toHaveText("6 matcher över 6 månader.");
	});
});

test.describe("A match played in the app", () => {
	test("goes into the history by itself and can be saved as a match file", async ({
		startedMatch: match,
		report,
		history,
		page,
	}) => {
		await match.startClock();
		await match.play(12);
		await match.endMatch();
		await expect(report.root).toBeVisible();

		const download = page.waitForEvent("download");
		await report.root.getByRole("button", { name: "Spara matchfil" }).click();
		const file = await download;
		expect(file.suggestedFilename()).toMatch(/^match-\d{4}-\d{2}-\d{2}\.json$/);

		await report.backButton.click();
		await match.editSquad();
		await history.open();

		await expect(history.count).toHaveText("1 match över 1 månad.");
		for (const name of SQUAD) {
			await expect(history.row("Startat och speltid", name)).toBeVisible();
		}
		// Alva played all 12 minutes.
		await expect(
			history.row("Startat och speltid", "Alva").getByRole("cell").nth(3),
		).toHaveText("12 min");
	});
});

test.describe("A busy match", () => {
	test("with late swaps, a temporary swap and a break still makes a valid match file", async ({
		startedMatch: match,
		report,
		history,
	}) => {
		await match.startClock();
		await match.play(10.5);
		await match.confirmSwap("Greta");
		await match.play(0.5);
		await match.confirmSwap("Hugo");
		await match.play(2);
		await match.swapTemporarily("Alva", "Ebba", "1 min");
		await match.play(7);
		await match.nextPeriodButton.click();
		await match.play(3);
		await match.addLatePlayer("Ines");
		await match.play(1);
		await match.endMatch();
		await expect(report.root).toBeVisible();
		await report.backButton.click();
		await match.editSquad();
		await history.open();

		// The file passed the same checks as an imported one.
		await expect(history.count).toHaveText("1 match över 1 månad.");
		await expect(history.row("Startat och speltid", "Ines")).toBeVisible();
	});

	test("a period-break keeper change to a player still on the pitch still makes a valid match file", async ({
		setup,
		match,
		report,
		history,
		page,
	}) => {
		await setup.open();
		await setup.chooseTeamSize("7v7");
		await setup.setMatchLength(2, 5);
		await setup.addPlayers([...SQUAD]);
		await setup.markGoalkeeper("Alva");
		await setup.startingKeeper.selectOption({ label: "Alva" });
		await setup.startMatch();
		await match.startClock();
		await match.play(5);

		// Bo is on the pitch (not the bench) when chosen as the next keeper.
		await match.root
			.locator("#breakKeeperSelect")
			.selectOption({ label: "Bo" });
		await match.nextPeriodButton.click();
		await match.play(5);
		await expect(report.root).toBeVisible();

		const saveBtn = report.root.getByRole("button", { name: "Spara matchfil" });
		await expect(saveBtn).toBeEnabled();
		const download = page.waitForEvent("download");
		await saveBtn.click();
		await download;

		await report.backButton.click();
		await match.editSquad();
		await history.open();
		await expect(history.count).toHaveText("1 match över 1 månad.");
	});
});
