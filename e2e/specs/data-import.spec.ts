import { LIMITS } from "../../src/core/limits.js";
import { matchFileToJson } from "../../src/core/matchFile.js";
import { newRoster, rosterToJson } from "../../src/core/storage.js";
import { makeMatchFile, NAMES } from "../../tests/support/matchFiles.js";
import { expect, test } from "../fixtures.js";
import { DataPage } from "../pages/DataPage.js";
import { driveTeamFolder, writeTree } from "../support/dataFolder.js";
import {
	createFakeDrive,
	mockGoogle,
	subfolderNames,
} from "../support/fakeGoogle.js";

// The service worker proxies every GET, including the mocked Google ones;
// blocking it keeps these tests about the importer.
test.use({ serviceWorkers: "block" });

const TEAM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEAM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PASSWORD = "exempel123";
const SQUAD = NAMES.slice(0, 9);
const match = (matchId: string, seed: number) => ({
	name: `${matchId}.json`,
	contents: matchFileToJson(makeMatchFile({ matchId, seed, names: SQUAD })),
});
const squad = {
	name: "trupp.json",
	contents: rosterToJson(
		newRoster({
			formatId: "7v7",
			players: SQUAD.map((name, i) => ({ id: `p${i + 1}`, name })),
		}),
	),
};

test.describe("Data page: import by contents (#154)", () => {
	test("a folder in the app's Drive layout is recognised, unlocked with its password and imported", async ({
		data,
		history,
		page,
	}, testInfo) => {
		const dir = await writeTree(
			testInfo.outputPath("exempeldata"),
			await driveTeamFolder({
				root: "matchplanner-exempeldata",
				teamId: TEAM_A,
				name: "Röda",
				password: PASSWORD,
				matches: 8,
			}),
		);
		await data.goto();
		await expect(data.importPasswordField).toBeHidden();
		await data.chooseFolder(dir);

		// Nothing changes until "Läs in", and the password field is there
		// only because the folder holds encrypted files.
		await expect(data.importSummary).toHaveText([
			"11 krypterade filer behöver lösenord.",
		]);
		await expect(data.importPasswordField).toBeVisible();
		await expect(data.importApplyButton).toBeDisabled();
		await expect(data.count).toHaveText(
			"Inga matcher än. Spela en match eller läs in matchfiler.",
		);

		await data.unlock(PASSWORD);
		await expect(data.importSummary).toHaveText([
			'Lag "Röda" (aaaaaaaa): 8 matcher, 1 truppfil, anteckningar för 1 spelare',
		]);
		await data.importApplyButton.click();
		await expect(data.messages).toHaveText([
			"8 nya matcher lästes in. Anteckningarna uppdaterades. Truppen lästes in.",
		]);
		await expect(data.count).toHaveText("8 matcher över 1 månad.");
		await expect(data.importPasswordField).toBeHidden();

		// Nothing needs the password to be viewed afterwards.
		await history.goto();
		await expect(history.count).toHaveText("8 matcher över 1 månad.");
		await page.locator("#teamSwitcherSelect").selectOption({ label: "Röda" });
	});

	test("the same folder twice changes nothing the second time", async ({
		data,
	}, testInfo) => {
		const dir = await writeTree(
			testInfo.outputPath("exempeldata"),
			await driveTeamFolder({
				root: "exempel",
				teamId: TEAM_A,
				name: "Röda",
				password: PASSWORD,
				matches: 2,
			}),
		);
		await data.goto();
		await data.chooseFolder(dir);
		await data.unlock(PASSWORD);
		await data.importApplyButton.click();
		await expect(data.messages).toHaveText([
			"2 nya matcher lästes in. Anteckningarna uppdaterades. Truppen lästes in.",
		]);

		await data.chooseFolder(dir);
		await data.unlock(PASSWORD);
		await data.importApplyButton.click();
		await expect(data.messages).toHaveText(["Inget nytt att läsa in."]);
		await expect(data.count).toHaveText("2 matcher över 1 månad.");
	});

	test("plain match and squad files import without any password field", async ({
		data,
	}) => {
		await data.goto();
		await data.chooseFiles([match("a", 1), match("b", 2), squad]);
		await expect(data.importSummary).toHaveText([
			"Filer utan lag: 2 matcher, 1 truppfil",
		]);
		await expect(data.importPasswordField).toBeHidden();
		await data.importApplyButton.click();
		await expect(data.messages).toHaveText([
			"2 nya matcher lästes in. Truppen lästes in.",
		]);
		await expect(data.count).toHaveText("2 matcher över 1 månad.");
	});

	test("a file is what it contains, not what it is called", async ({
		data,
	}) => {
		await data.goto();
		await data.chooseFiles([
			{ name: "match-1.json", contents: squad.contents },
			{ name: "anteckningar.txt", contents: match("a", 1).contents },
		]);
		await expect(data.importSummary).toHaveText([
			"Filer utan lag: 1 match, 1 truppfil",
		]);
	});

	test("two teams with two passwords: each password opens only its team, and a wrong one changes nothing", async ({
		data,
	}, testInfo) => {
		const dir = await writeTree(testInfo.outputPath("tva-lag"), [
			...(await driveTeamFolder({
				root: "rot",
				teamId: TEAM_A,
				name: "Röda",
				password: "losenord-roda",
				matches: 2,
			})),
			...(await driveTeamFolder({
				root: "rot",
				teamId: TEAM_B,
				name: "Blå",
				password: "losenord-bla",
				matches: 3,
				firstSeed: 4,
			})),
		]);
		await data.goto();
		await data.chooseFolder(dir);
		await expect(data.importSummary).toHaveText([
			"11 krypterade filer behöver lösenord.",
		]);

		// A password that opens neither team changes nothing.
		await data.unlock("helt-fel-losen");
		await expect(data.importMessages).toHaveText([
			"Lösenordet öppnar ingen av de krypterade filerna. Kontrollera lösenordet och försök igen. Inget har ändrats.",
		]);
		await expect(data.importApplyButton).toBeDisabled();

		// The first password gives the first team; the other stays locked.
		await data.unlock("losenord-roda");
		await expect(data.importSummary).toHaveText([
			'Lag "Röda" (aaaaaaaa): 2 matcher, 1 truppfil, anteckningar för 1 spelare',
			"Låst lag bbbbbbbb (6 filer): öppnas med ett annat lösenord.",
		]);
		await data.importApplyButton.click();
		await expect(data.messages).toHaveText([
			"2 nya matcher lästes in. Anteckningarna uppdaterades. Truppen lästes in.",
		]);
		await expect(data.count).toHaveText("2 matcher över 1 månad.");
	});

	test("an oversize file and a file with a hostile name are skipped, shown as text and stop nothing", async ({
		data,
		page,
	}) => {
		await data.goto();
		page.on("dialog", () => {
			throw new Error("a hostile file name ran script");
		});
		const hostile = "<img src=x onerror=alert(1)>.json";
		await data.chooseFiles([
			match("a", 1),
			{ name: "stor.json", contents: "x".repeat(LIMITS.importFileBytes + 1) },
			{ name: hostile, contents: "det här är text" },
		]);
		await expect(data.importSummary).toHaveText(["Filer utan lag: 1 match"]);
		await expect(data.importSkipped).toHaveText([
			"stor.json: för stor (högst 5 MB).",
			`${hostile}: ingen JSON-fil.`,
		]);
		await expect(page.locator("#importSkipped img")).toHaveCount(0);
		await data.importApplyButton.click();
		await expect(data.messages).toHaveText(["1 ny match lästes in."]);
	});

	test("a hostile team name is only ever text", async ({
		data,
		page,
	}, testInfo) => {
		page.on("dialog", () => {
			throw new Error("a hostile team name ran script");
		});
		const hostile = "<img src=x onerror=alert(1)>";
		const dir = await writeTree(
			testInfo.outputPath("fientlig"),
			await driveTeamFolder({
				root: "fientlig",
				teamId: TEAM_A,
				name: hostile,
				password: PASSWORD,
				matches: 1,
			}),
		);
		await data.goto();
		await data.chooseFolder(dir);
		await data.unlock(PASSWORD);
		await expect(data.importSummary).toHaveText([
			`Lag "${hostile}" (aaaaaaaa): 1 match, 1 truppfil, anteckningar för 1 spelare`,
		]);
		await expect(page.locator("#importSummary img")).toHaveCount(0);
		await data.importApplyButton.click();
		await expect(data.messages.first()).toBeVisible();
		await expect(page.locator("#teamSwitcherSelect img")).toHaveCount(0);
		await expect(page.locator("#teamSwitcherSelect option")).toHaveText([
			hostile,
		]);
	});

	test("a season report or a file that is none of ours is listed with a reason", async ({
		data,
	}) => {
		await data.goto();
		await data.chooseFiles([
			match("a", 1),
			{ name: "annat.json", contents: JSON.stringify({ hej: 1 }) },
		]);
		await expect(data.importSkipped).toHaveText([
			"annat.json: känns inte igen som en fil från MatchPlanner.",
		]);
		await expect(data.importApplyButton).toBeEnabled();
	});

	test("more files than the cap are refused with a short list, not a wall of lines", async ({
		data,
	}) => {
		await data.goto();
		const files = Array.from({ length: LIMITS.importFiles + 2 }, (_, i) => ({
			name: `f${i}.json`,
			contents: "{}",
		}));
		await data.chooseFiles(files);
		await expect(data.importSkipped).toHaveCount(
			LIMITS.importListedProblems + 1,
		);
		await expect(data.importSkipped.last()).toHaveText(
			`… och ${LIMITS.importFiles + 2 - LIMITS.importListedProblems} till hoppades över.`,
		);
		await expect(data.importApplyButton).toBeDisabled();
	});

	test("the password is never sent, stored or left in the field", async ({
		data,
		page,
	}, testInfo) => {
		const requests: string[] = [];
		page.on("request", (request) => {
			requests.push(`${request.url()} ${request.postData() ?? ""}`);
		});
		const dir = await writeTree(
			testInfo.outputPath("hemligt"),
			await driveTeamFolder({
				root: "hemligt",
				teamId: TEAM_A,
				name: "Röda",
				password: "mitt-hemliga-losen",
				matches: 1,
			}),
		);
		await data.goto();
		await data.chooseFolder(dir);
		await data.importPasswordInput.fill("mitt-hemliga-losen");
		await data.importUnlockButton.click();
		await expect(data.importPasswordInput).toHaveValue("");
		await data.importApplyButton.click();
		await expect(data.messages.first()).toBeVisible();

		expect(requests.filter((r) => r.includes("mitt-hemliga-losen"))).toEqual(
			[],
		);
		const stored = await page.evaluate(() =>
			JSON.stringify({ ...localStorage, ...sessionStorage }),
		);
		expect(stored).not.toContain("mitt-hemliga-losen");
		expect(page.url()).not.toContain("mitt-hemliga-losen");
	});

	test("import then back up on the same page, and a second empty phone restores the same data", async ({
		data,
		browser,
	}, testInfo) => {
		const drive = createFakeDrive();
		await mockGoogle(data.page.context(), drive);
		const dir = await writeTree(
			testInfo.outputPath("drive"),
			await driveTeamFolder({
				root: "exempel",
				teamId: TEAM_A,
				name: "Röda",
				password: PASSWORD,
				matches: 3,
			}),
		);
		await data.goto();
		await data.chooseFolder(dir);
		await data.unlock(PASSWORD);
		await data.importApplyButton.click();
		await expect(data.importDriveHint).toHaveText(
			"Det här finns nu på enheten. Koppla Google Drive nedan och tryck Säkerhetskopiera för att spara det i Drive.",
		);
		await data.driveConnectButton.click();
		await expect(data.driveStatus).toHaveText("Kopplad till Google Drive.");
		await data.driveChooseFolderButton.click();
		await expect(data.driveStatus).toHaveText("Mapp: MatchPlanner-mapp");
		await data.drivePasswordInput.fill("drive-losenord-1");
		await data.driveBackupButton.click();
		await expect(data.driveStatus).toHaveText(
			"3 matcher säkerhetskopierades. Trupp och anteckningar sparades.",
		);

		const context = await browser.newContext({
			reducedMotion: "reduce",
			serviceWorkers: "block",
		});
		await mockGoogle(context, drive);
		const phone = await context.newPage();
		const other = new DataPage(phone);
		await other.goto();
		await other.driveConnectButton.click();
		await expect(other.driveStatus).toHaveText("Kopplad till Google Drive.");
		await other.driveChooseFolderButton.click();
		await other.drivePasswordInput.fill("drive-losenord-1");
		await other.driveRestoreButton.click();
		await expect(other.driveStatus).toHaveText(
			"3 matcher lästes in. Anteckningarna uppdaterades. Truppen lästes in.",
		);
		await context.close();
	});
});

test.describe("Data page: files for a different team than the one with data (#154)", () => {
	const OPTIONS = "#teamSwitcherSelect option";

	/** A device that already has one match, facing team A's folder. */
	async function laptopWithData(
		data: import("../pages/DataPage.js").DataPage,
		outputPath: (name: string) => string,
		matches = 3,
	): Promise<string> {
		const dir = await writeTree(
			outputPath("lag-a"),
			await driveTeamFolder({
				root: "lag-a",
				teamId: TEAM_A,
				name: "Röda",
				password: PASSWORD,
				matches,
			}),
		);
		await data.goto();
		await data.importFiles([match("laptop", 7)]);
		await data.chooseFolder(dir);
		await data.unlock(PASSWORD);
		await data.importApplyButton.click();
		return dir;
	}

	test("shows both choices with the numbers and changes nothing until one is picked", async ({
		data,
		page,
	}, testInfo) => {
		await laptopWithData(data, (n) => testInfo.outputPath(n));
		await expect(data.importPlacement).toBeVisible();
		await expect(data.importPlacement).toContainText(
			'Filerna hör till ett annat lag ("Röda"), och det här laget har redan data. Inget har ändrats än.',
		);
		await expect(data.importPlacement).toContainText(
			"Du har 1 match, filerna har 3, efter hopslagning 4.",
		);
		await expect(data.count).toHaveText("1 match över 1 månad.");
		await expect(page.locator(OPTIONS)).toHaveText(["Mitt lag"]);
	});

	test('"Läs in som nytt lag" leaves the existing team exactly as it was', async ({
		data,
		page,
		teamSwitcher,
	}, testInfo) => {
		await laptopWithData(data, (n) => testInfo.outputPath(n));
		await data
			.placementButton(data.importPlacement, "Läs in som nytt lag")
			.click();
		await expect(data.messages).toHaveText([
			"3 nya matcher lästes in. Anteckningarna uppdaterades. Truppen lästes in.",
		]);
		await expect(data.importPlacement).toBeHidden();
		await expect(data.count).toHaveText("3 matcher över 1 månad.");
		await expect(page.locator(OPTIONS)).toHaveText(["Mitt lag", "Röda"]);

		await teamSwitcher.switchTo("Mitt lag");
		await data.goto();
		await expect(data.count).toHaveText("1 match över 1 månad.");
	});

	test('"Slå ihop" asks once more with the numbers, leaves nothing out and keeps the current team\'s name', async ({
		data,
		page,
	}, testInfo) => {
		await laptopWithData(data, (n) => testInfo.outputPath(n));
		await data
			.placementButton(data.importPlacement, "Slå ihop med det här laget")
			.click();
		await expect(data.importPlacement).toContainText(
			"Du har 1 match, filerna har 3, efter hopslagning 4. Den gamla lagmappen i Drive, om det fanns en, lämnas där den är.",
		);
		// Nothing is mixed until it is confirmed, and it can be called off.
		await expect(data.count).toHaveText("1 match över 1 månad.");
		await data.placementButton(data.importPlacement, "Avbryt").click();
		await expect(data.count).toHaveText("1 match över 1 månad.");

		await data
			.placementButton(data.importPlacement, "Slå ihop med det här laget")
			.click();
		await data.placementButton(data.importPlacement, "Slå ihop").click();
		await expect(data.messages).toHaveText([
			"3 nya matcher lästes in. Anteckningarna uppdaterades. Truppen lästes in.",
		]);
		await expect(data.count).toHaveText("4 matcher över 1 månad.");
		await expect(page.locator(OPTIONS)).toHaveText(["Mitt lag"]);
	});

	test("a team id another team on this device has is refused, and nothing changes", async ({
		data,
		page,
		teamSwitcher,
		setup,
	}, testInfo) => {
		const dir = await laptopWithData(data, (n) => testInfo.outputPath(n));
		await data
			.placementButton(data.importPlacement, "Slå ihop med det här laget")
			.click();
		await data.placementButton(data.importPlacement, "Slå ihop").click();
		await expect(data.count).toHaveText("4 matcher över 1 månad.");

		// A second team on the device; the files now belong to the first.
		await setup.open();
		await teamSwitcher.createTeam("Annat");
		await data.open();
		await data.chooseFolder(dir);
		await data.unlock(PASSWORD);
		await data.importApplyButton.click();
		await expect(data.messages).toHaveText([
			"Filerna tillhör ett annat lag på den här enheten. Byt till det laget först.",
		]);
		await expect(data.importPlacement).toBeHidden();
		await expect(page.locator(OPTIONS)).toHaveText(["Mitt lag", "Annat"]);
		await expect(data.count).toHaveText(
			"Inga matcher än. Spela en match eller läs in matchfiler.",
		);
	});

	test("two teams in one folder: the second password then reads the second team into a new team", async ({
		data,
		page,
	}, testInfo) => {
		const dir = await writeTree(testInfo.outputPath("tva-lag"), [
			...(await driveTeamFolder({
				root: "rot",
				teamId: TEAM_A,
				name: "Röda",
				password: "losenord-roda",
				matches: 2,
			})),
			...(await driveTeamFolder({
				root: "rot",
				teamId: TEAM_B,
				name: "Blå",
				password: "losenord-bla",
				matches: 3,
				firstSeed: 4,
			})),
		]);
		await data.goto();
		await data.chooseFolder(dir);
		await data.unlock("losenord-roda");
		await data.importApplyButton.click();
		await expect(data.count).toHaveText("2 matcher över 1 månad.");

		await data.chooseFolder(dir);
		await data.unlock("losenord-bla");
		await expect(data.importSummary).toContainText([
			'Lag "Blå" (bbbbbbbb): 3 matcher, 1 truppfil, anteckningar för 1 spelare',
		]);
		await data.importApplyButton.click();
		await expect(data.importPlacement).toContainText(
			"Du har 2 matcher, filerna har 3, efter hopslagning 5.",
		);
		await data
			.placementButton(data.importPlacement, "Läs in som nytt lag")
			.click();
		await expect(data.count).toHaveText("3 matcher över 1 månad.");
		await expect(page.locator(OPTIONS)).toHaveText(["Röda", "Blå"]);
	});
});

test.describe("Data page: a Drive folder for a different team than the one with data (#154)", () => {
	async function phoneBackedUp(
		browser: import("@playwright/test").Browser,
		drive: ReturnType<typeof createFakeDrive>,
		dir: string,
	) {
		const context = await browser.newContext({
			reducedMotion: "reduce",
			serviceWorkers: "block",
		});
		await mockGoogle(context, drive);
		const page = await context.newPage();
		const phone = new DataPage(page);
		await phone.goto();
		await phone.chooseFolder(dir);
		await phone.unlock(PASSWORD);
		await phone.importApplyButton.click();
		await phone.driveConnectButton.click();
		await expect(phone.driveStatus).toHaveText("Kopplad till Google Drive.");
		await phone.driveChooseFolderButton.click();
		await expect(phone.driveStatus).toHaveText("Mapp: MatchPlanner-mapp");
		await phone.drivePasswordInput.fill("drive-losenord-1");
		await phone.driveBackupButton.click();
		await expect(phone.driveStatus).toHaveText(
			"2 matcher säkerhetskopierades. Trupp och anteckningar sparades.",
		);
		await context.close();
	}

	test("shows both choices, and a merge makes the next backup land in the other device's folder", async ({
		data,
		browser,
	}, testInfo) => {
		const drive = createFakeDrive();
		await mockGoogle(data.page.context(), drive);
		const dir = await writeTree(
			testInfo.outputPath("telefon"),
			await driveTeamFolder({
				root: "telefon",
				teamId: TEAM_A,
				name: "Röda",
				password: PASSWORD,
				matches: 2,
			}),
		);
		await phoneBackedUp(browser, drive, dir);

		// A laptop with data of its own, never connected to that team.
		await data.goto();
		await data.importFiles([match("laptop", 7)]);
		await data.driveConnectButton.click();
		await expect(data.driveStatus).toHaveText("Kopplad till Google Drive.");
		await data.driveChooseFolderButton.click();
		await expect(data.driveStatus).toHaveText("Mapp: MatchPlanner-mapp");
		await data.drivePasswordInput.fill("drive-losenord-1");
		await data.driveRestoreButton.click();
		await expect(data.drivePlacement).toContainText(
			"Du har 1 match, Drive har 2, efter hopslagning 3.",
		);
		await expect(data.count).toHaveText("1 match över 1 månad.");

		await data
			.placementButton(data.drivePlacement, "Slå ihop med det här laget")
			.click();
		await data.placementButton(data.drivePlacement, "Slå ihop").click();
		await expect(data.driveStatus).toHaveText(
			"2 matcher lästes in. Anteckningarna uppdaterades. Truppen lästes in.",
		);
		await expect(data.count).toHaveText("3 matcher över 1 månad.");
		await expect(data.drivePasswordInput).toHaveValue("");

		await data.drivePasswordInput.fill("drive-losenord-1");
		await data.driveBackupButton.click();
		await expect(data.driveStatus).toHaveText(
			"1 match säkerhetskopierades. Trupp och anteckningar sparades.",
		);
		expect(subfolderNames(drive, "folder-1")).toHaveLength(1);
	});

	test('"Läs in som nytt lag" keeps the existing team, which has no Drive folder of its own', async ({
		data,
		browser,
		page,
	}, testInfo) => {
		const drive = createFakeDrive();
		await mockGoogle(data.page.context(), drive);
		const dir = await writeTree(
			testInfo.outputPath("telefon"),
			await driveTeamFolder({
				root: "telefon",
				teamId: TEAM_A,
				name: "Röda",
				password: PASSWORD,
				matches: 2,
			}),
		);
		await phoneBackedUp(browser, drive, dir);

		await data.goto();
		await data.importFiles([match("laptop", 7)]);
		await data.driveConnectButton.click();
		await expect(data.driveStatus).toHaveText("Kopplad till Google Drive.");
		await data.driveChooseFolderButton.click();
		await data.drivePasswordInput.fill("drive-losenord-1");
		await data.driveRestoreButton.click();
		await data
			.placementButton(data.drivePlacement, "Läs in som nytt lag")
			.click();
		await expect(data.driveStatus).toHaveText(
			"2 matcher lästes in. Anteckningarna uppdaterades. Truppen lästes in.",
		);
		await expect(data.count).toHaveText("2 matcher över 1 månad.");
		await expect(page.locator("#teamSwitcherSelect option")).toHaveText([
			"Mitt lag",
			"Röda",
		]);
	});

	test("a wrong password gets the wrong-password message and no choice", async ({
		data,
		browser,
	}, testInfo) => {
		const drive = createFakeDrive();
		await mockGoogle(data.page.context(), drive);
		const dir = await writeTree(
			testInfo.outputPath("telefon"),
			await driveTeamFolder({
				root: "telefon",
				teamId: TEAM_A,
				name: "Röda",
				password: PASSWORD,
				matches: 2,
			}),
		);
		await phoneBackedUp(browser, drive, dir);
		await data.goto();
		await data.importFiles([match("laptop", 7)]);
		await data.driveConnectButton.click();
		await expect(data.driveStatus).toHaveText("Kopplad till Google Drive.");
		await data.driveChooseFolderButton.click();
		await data.drivePasswordInput.fill("fel-losenord-12");
		await data.driveRestoreButton.click();
		await expect(data.driveStatus).toHaveText(
			"Fel lösenord, eller filen har ändrats. Kontrollera lösenordet och försök igen.",
		);
		await expect(data.drivePlacement).toBeHidden();
		await expect(data.count).toHaveText("1 match över 1 månad.");
	});
});
