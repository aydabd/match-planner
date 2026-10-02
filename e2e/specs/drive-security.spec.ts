import type { BrowserContext, Page } from "@playwright/test";
import {
	driveFileName,
	teamFolderName,
	teamMarkerName,
} from "../../src/core/driveNames.js";
import { matchFileToJson } from "../../src/core/matchFile.js";
import {
	encryptJson,
	securePackageToJson,
} from "../../src/core/securePackage.js";
import { makeMatchFile, NAMES } from "../../tests/support/matchFiles.js";
import { expect, test } from "../fixtures.js";
import { DataPage } from "../pages/DataPage.js";
import { HistoryPage } from "../pages/HistoryPage.js";
import { SetupPage } from "../pages/SetupPage.js";
import { TeamSwitcher } from "../pages/TeamSwitcher.js";
import {
	createFakeDrive,
	FOLDER_MIME,
	mockGoogle,
} from "../support/fakeGoogle.js";

// The service worker proxies every GET, including the mocked Google ones;
// blocking it keeps these tests about the Drive wiring.
test.use({ serviceWorkers: "block" });

const SQUAD = NAMES.slice(0, 9);
const matchJson = (matchId: string, seed: number) =>
	matchFileToJson(makeMatchFile({ matchId, seed, names: SQUAD }));

/** A fresh phone: its own storage, talking to the shared fake Drive. */
async function newPhone(
	browser: import("@playwright/test").Browser,
	drive: ReturnType<typeof createFakeDrive>,
) {
	const context = await browser.newContext({
		reducedMotion: "reduce",
		serviceWorkers: "block",
	});
	await mockGoogle(context, drive);
	const page = await context.newPage();
	// Any Content-Security-Policy violation fails the test (#147).
	const violations: string[] = [];
	page.on("console", (message) => {
		if (message.text().includes("Content Security Policy")) {
			violations.push(message.text());
		}
	});
	return {
		context,
		page,
		data: new DataPage(page),
		close: async () => {
			expect(violations).toEqual([]);
			await context.close();
		},
	};
}

async function connectAndPickFolder(data: DataPage): Promise<void> {
	await data.driveConnectButton.click();
	await expect(data.driveStatus).toHaveText("Kopplad till Google Drive.");
	await data.driveChooseFolderButton.click();
	await expect(data.driveStatus).toHaveText("Mapp: MatchPlanner-mapp");
}

/** A phone with a named team and one match, backed up with `password`. */
async function backedUpTeam(
	browser: import("@playwright/test").Browser,
	drive: ReturnType<typeof createFakeDrive>,
	teamName: string,
	matchId: string,
	seed: number,
	password: string,
): Promise<BrowserContext> {
	const { context, page, data } = await newPhone(browser, drive);
	await new SetupPage(page).open();
	await new TeamSwitcher(page).createTeam(teamName);
	await data.open();
	await data.importFiles([
		{ name: "m.json", contents: matchJson(matchId, seed) },
	]);
	await connectAndPickFolder(data);
	await data.drivePasswordInput.fill(password);
	await data.driveBackupButton.click();
	await expect(data.driveStatus).toHaveText("1 match säkerhetskopierades.");
	return context;
}

test.describe("Drive: teams with different passwords share one root (#147)", () => {
	test("each coach restores their own team with their own password, and a wrong one gets nothing", async ({
		browser,
	}) => {
		const drive = createFakeDrive();
		const blueContext = await backedUpTeam(
			browser,
			drive,
			"P11 Blå",
			"blue-1",
			1,
			"blå-lösenord-1",
		);
		const p13Context = await backedUpTeam(
			browser,
			drive,
			"P13",
			"p13-1",
			5,
			"p13-lösenord-2",
		);
		await blueContext.close();
		await p13Context.close();

		// A coach with P11's password: P11 is restored, no question asked.
		const blue = await newPhone(browser, drive);
		await new SetupPage(blue.page).open();
		await blue.data.open();
		await connectAndPickFolder(blue.data);
		await blue.data.drivePasswordInput.fill("blå-lösenord-1");
		await blue.data.driveRestoreButton.click();
		await expect(blue.data.driveStatus).toHaveText("1 match lästes in.");
		await expect(blue.data.count).toHaveText("1 match över 1 månad.");
		await expect(blue.data.driveTeamSelect).toBeHidden();
		await blue.close();

		// A coach with P13's password gets P13, a different match.
		const p13 = await newPhone(browser, drive);
		await new SetupPage(p13.page).open();
		await p13.data.open();
		await connectAndPickFolder(p13.data);
		await p13.data.drivePasswordInput.fill("p13-lösenord-2");
		await p13.data.driveRestoreButton.click();
		await expect(p13.data.driveStatus).toHaveText("1 match lästes in.");
		await p13.page.goto("statistics/");
		await expect(
			new HistoryPage(p13.page).row("Startat och speltid", SQUAD[0] ?? ""),
		).toBeVisible();
		await p13.close();

		// Someone guessing gets the wrong-password message and no data.
		const guess = await newPhone(browser, drive);
		await new SetupPage(guess.page).open();
		await guess.data.open();
		await connectAndPickFolder(guess.data);
		await guess.data.drivePasswordInput.fill("gissning-12345");
		await guess.data.driveRestoreButton.click();
		await expect(guess.data.driveStatus).toHaveText(
			"Fel lösenord, eller filen har ändrats. Kontrollera lösenordet och försök igen.",
		);
		await expect(guess.data.count).toHaveText(
			"Inga matcher än. Spela en match eller läs in matchfiler.",
		);
		await expect(guess.data.driveTeamSelect).toBeHidden();
		await guess.close();
	});
});

test.describe("Drive: what the app sends and keeps (#147)", () => {
	test("the password never appears in a request, a URL, localStorage or sessionStorage", async ({
		browser,
	}) => {
		const drive = createFakeDrive();
		const password = "unik-hemlig-nyckel-7Qx9";
		const seen: string[] = [];
		const watch = (context: BrowserContext) =>
			context.on("request", (request) => {
				seen.push(
					[
						request.method(),
						request.url(),
						request.postData() ?? "",
						JSON.stringify(request.headers()),
					].join("\n"),
				);
			});

		const writer = await newPhone(browser, drive);
		watch(writer.context);
		await new SetupPage(writer.page).open();
		await writer.data.open();
		await writer.data.importFiles([
			{ name: "m.json", contents: matchJson("leak-1", 3) },
		]);
		await connectAndPickFolder(writer.data);
		await writer.data.drivePasswordInput.fill(password);
		await writer.data.driveBackupButton.click();
		await expect(writer.data.driveStatus).toHaveText(
			"1 match säkerhetskopierades.",
		);

		const reader = await newPhone(browser, drive);
		watch(reader.context);
		await new SetupPage(reader.page).open();
		await reader.data.open();
		await connectAndPickFolder(reader.data);
		await reader.data.drivePasswordInput.fill(password);
		await reader.data.driveRestoreButton.click();
		await expect(reader.data.driveStatus).toHaveText("1 match lästes in.");

		// The calls were really made (so this is not an empty check)...
		expect(seen.some((r) => r.includes("/upload/drive/v3/files"))).toBe(true);
		expect(seen.some((r) => r.includes("alt=media"))).toBe(true);
		// ...and the password is in none of them, in any common encoding.
		const needles = [
			password,
			encodeURIComponent(password),
			Buffer.from(password).toString("base64"),
		];
		for (const request of seen) {
			for (const needle of needles) expect(request).not.toContain(needle);
		}
		// Nor does it sit in the page's storage or the password field afterwards.
		for (const { page } of [writer, reader]) {
			const stored = await page.evaluate(() =>
				JSON.stringify([
					Object.entries(localStorage),
					Object.entries(sessionStorage),
					document.cookie,
				]),
			);
			for (const needle of needles) expect(stored).not.toContain(needle);
		}
		await writer.close();
		await reader.close();
	});

	test("the password field is emptied after a backup and a restore, but kept while a team choice is waiting", async ({
		browser,
	}) => {
		const drive = createFakeDrive();
		const password = "gemensamt-lösen-1";
		const first = await backedUpTeam(
			browser,
			drive,
			"P11 Blå",
			"a-1",
			1,
			password,
		);
		const second = await backedUpTeam(
			browser,
			drive,
			"F12 Röd",
			"b-1",
			5,
			password,
		);

		const phone = await newPhone(browser, drive);
		await new SetupPage(phone.page).open();
		await phone.data.open();
		await connectAndPickFolder(phone.data);
		await phone.data.drivePasswordInput.fill(password);
		await phone.data.driveRestoreButton.click();
		await expect(phone.data.driveStatus).toHaveText(
			"Mappen innehåller flera lag. Välj vilket som ska läsas in.",
		);
		await expect(phone.data.drivePasswordInput).toHaveValue(password);

		await phone.data.driveTeamSelect.selectOption({ label: "P11 Blå" });
		await phone.data.driveRestoreTeamButton.click();
		await expect(phone.data.driveStatus).toHaveText("1 match lästes in.");
		await expect(phone.data.drivePasswordInput).toHaveValue("");

		await phone.data.drivePasswordInput.fill(password);
		await phone.data.driveBackupButton.click();
		await expect(phone.data.driveStatus).toHaveText(
			"Allt var redan säkerhetskopierat.",
		);
		await expect(phone.data.drivePasswordInput).toHaveValue("");
		for (const context of [first, second]) await context.close();
		await phone.close();
	});

	test("a short password is refused for a new backup and a new export, and nothing is written", async ({
		browser,
		data,
		setup,
		page,
	}) => {
		const drive = createFakeDrive();
		await mockGoogle(page.context(), drive);
		await setup.open();
		await data.open();
		await data.importFiles([
			{ name: "m.json", contents: matchJson("short-1", 2) },
		]);
		await connectAndPickFolder(data);

		await data.drivePasswordInput.fill("kort");
		await data.driveBackupButton.click();
		await expect(data.driveStatus).toHaveText(
			"Lösenordet för en ny säkerhetskopia måste vara minst 10 tecken.",
		);
		expect(drive.files.size).toBe(0);

		await data.secureExportPasswordInput.fill("kort");
		await data.secureExportButton.click();
		await expect(data.secureExportStatus).toHaveText(
			"Lösenordet måste vara minst 10 tecken.",
		);
		void browser;
	});
});

test.describe("Drive: data from Drive and storage is never run or trusted (#147)", () => {
	test("a hostile team name from Drive is shown as text and runs nothing", async ({
		browser,
	}) => {
		const hostile = "<img src=x onerror=window.__pwned=1>";
		const password = "ond-test-lösen-1";
		const drive = createFakeDrive();
		const seal = async (payload: unknown) =>
			securePackageToJson(await encryptJson(password, payload));
		drive.files.set("root-ok", {
			name: "ok",
			mimeType: FOLDER_MIME,
			parents: ["folder-1"],
			content: "",
		});
		const teams = [
			{ id: "6f1c2f6e-3b1a-4c55-9a52-0d1f3f7a9b10", name: hostile },
			{ id: "0e5b7c1d-72a4-4d0e-8f3b-5c9d1a2e4f60", name: "Vanligt lag" },
		];
		for (const team of teams) {
			drive.files.set(`folder-${team.id}`, {
				name: teamFolderName(team.id),
				mimeType: FOLDER_MIME,
				parents: ["folder-1"],
				content: "",
			});
			drive.files.set(`marker-${team.id}`, {
				name: teamMarkerName(team.id),
				parents: [`folder-${team.id}`],
				content: await seal({
					schemaVersion: 1,
					kind: "team",
					teamId: team.id,
					teamName: team.name,
				}),
			});
			drive.files.set(`match-${team.id}`, {
				name: await driveFileName("match", team.id, "x1"),
				parents: [`folder-${team.id}`],
				content: await seal({
					schemaVersion: 1,
					kind: "match",
					teamId: team.id,
					match: makeMatchFile({ matchId: "x1", names: SQUAD }),
				}),
			});
		}
		const phone = await newPhone(browser, drive);
		await new SetupPage(phone.page).open();
		await phone.data.open();
		await connectAndPickFolder(phone.data);
		await phone.data.drivePasswordInput.fill(password);
		await phone.data.driveRestoreButton.click();

		const options = phone.data.driveTeamSelect.locator("option");
		await expect(options).toHaveText(["Vanligt lag", hostile].sort());
		await expect(phone.page.locator("#driveTeamSelect img")).toHaveCount(0);

		// Take the hostile-named team on: its name now shows in the header too.
		await phone.data.driveTeamSelect.selectOption({ label: hostile });
		await phone.data.driveRestoreTeamButton.click();
		await expect(phone.data.driveStatus).toHaveText("1 match lästes in.");
		await phone.page.reload();
		await expect(phone.page.locator("#teamSwitcherSelect option")).toHaveText([
			hostile,
		]);
		await expect(phone.page.locator("header img, .topbar img")).toHaveCount(0);
		expect(
			await phone.page.evaluate(
				() => (window as unknown as { __pwned?: number }).__pwned,
			),
		).toBeUndefined();
		await phone.close();
	});

	test("a folder id in storage that could change a request never reaches Google", async ({
		browser,
	}) => {
		const drive = createFakeDrive();
		const phone = await newPhone(browser, drive);
		const drivePaths: string[] = [];
		phone.context.on("request", (request) => {
			const url = new URL(request.url());
			if (url.hostname === "www.googleapis.com") drivePaths.push(request.url());
		});
		await new SetupPage(phone.page).open();
		await phone.data.open();
		await phone.data.importFiles([
			{ name: "m.json", contents: matchJson("id-1", 4) },
		]);

		// Something (an extension, a script, a damaged profile) wrote a hostile id.
		await writeFolderToStorage(phone.page, "x' or 'a'='a", "Elak mapp");
		await phone.page.reload();
		await phone.data.drivePasswordInput.fill("någotlångtlösen1");
		await phone.data.driveBackupButton.click();
		await expect(phone.data.driveStatus).toHaveText(
			"Det gick inte att nå Google Drive just nu. Försök igen senare.",
		);
		expect(drivePaths).toEqual([]);
		expect(drive.files.size).toBe(0);
		await phone.close();
	});
});

/** Write a Drive folder choice straight into the active team's storage. */
async function writeFolderToStorage(page: Page, id: string, name: string) {
	await page.evaluate(
		([folderId, folderName]) => {
			const teams = JSON.parse(
				localStorage.getItem("matchplanner:teams:v1") ?? "{}",
			) as {
				activeTeamId: string;
			};
			localStorage.setItem(
				`matchplanner:driveFolderId:v1:${teams.activeTeamId}`,
				folderId as string,
			);
			localStorage.setItem(
				`matchplanner:driveFolderName:v1:${teams.activeTeamId}`,
				folderName as string,
			);
		},
		[id, name],
	);
}
