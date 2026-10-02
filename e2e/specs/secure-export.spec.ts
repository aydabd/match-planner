import { readFile } from "node:fs/promises";
import { matchFileToJson } from "../../src/core/matchFile.js";
import { makeMatchFile, NAMES } from "../../tests/support/matchFiles.js";
import { expect, test } from "../fixtures.js";
import { DataPage } from "../pages/DataPage.js";
import { SetupPage } from "../pages/SetupPage.js";

const MATCH = matchFileToJson(
	makeMatchFile({ matchId: "export-1", names: NAMES.slice(0, 9) }),
);

test.describe("Secure export and import (#81)", () => {
	test("exports everything to one encrypted file and imports it on another device", async ({
		browser,
		data,
		setup,
		page,
	}) => {
		const password = "hemligt-lösenord";

		await setup.open();
		await data.open();
		await data.importFiles([{ name: "match.json", contents: MATCH }]);
		await expect(data.count).toHaveText("1 match över 1 månad.");

		await data.secureExportPasswordInput.fill(password);
		const download = page.waitForEvent("download");
		await data.secureExportButton.click();
		const file = await download;
		await expect(data.secureExportStatus).toHaveText(
			"Allt exporterades till en krypterad fil.",
		);
		const contents = await readFile(await file.path(), "utf8");

		// A second device, empty.
		const otherContext = await browser.newContext({
			reducedMotion: "reduce",
			serviceWorkers: "block",
		});
		const otherPage = await otherContext.newPage();
		const otherSetup = new SetupPage(otherPage);
		const otherHistory = new DataPage(otherPage);
		await otherSetup.open();
		await otherHistory.open();
		await expect(otherHistory.count).toHaveText(
			"Inga matcher än. Spela en match eller läs in matchfiler.",
		);

		await otherHistory.chooseFiles([{ name: "export.json", contents }]);
		await expect(otherHistory.importSummary).toHaveText([
			"1 krypterad fil behöver lösenord.",
		]);

		// The wrong password is refused rather than importing garbage.
		await otherHistory.unlock("fel lösenord");
		await expect(otherHistory.messages).toHaveText([
			"Lösenordet öppnar ingen av de krypterade filerna. Kontrollera lösenordet och försök igen. Inget har ändrats.",
		]);
		await expect(otherHistory.count).toHaveText(
			"Inga matcher än. Spela en match eller läs in matchfiler.",
		);

		// The right password opens it, and "Läs in" takes it in.
		await otherHistory.unlock(password);
		await expect(otherHistory.importSummary).toHaveText([
			"Filer utan lag: 1 match",
		]);
		await otherHistory.importApplyButton.click();
		await expect(otherHistory.messages).toHaveText(["1 ny match lästes in."]);
		await expect(otherHistory.count).toHaveText("1 match över 1 månad.");

		await otherContext.close();
	});

	test("the season report download is encrypted with the entered password", async ({
		data,
		history,
		setup,
		page,
	}) => {
		await setup.open();
		await data.open();
		await data.importFiles([{ name: "match.json", contents: MATCH }]);
		await expect(data.count).toHaveText("1 match över 1 månad.");

		await history.gotoSeasonReport();
		const reportCard = history.seasonReportCard;
		const exportButton = reportCard.getByRole("button", {
			name: "Spara säsongsrapport (krypterad)",
		});

		// Refuses to download with no password.
		await exportButton.click();
		await expect(
			reportCard.getByText("Ange ett lösenord för filen först."),
		).toBeVisible();

		await reportCard.getByLabel("Lösenord för filen").fill("rapport-lösenord");
		const download = page.waitForEvent("download");
		await exportButton.click();
		const file = await download;
		const contents = JSON.parse(await readFile(await file.path(), "utf8"));
		// A SecurePackage envelope, not a plaintext season report.
		expect(contents).toMatchObject({ version: 1 });
		expect(contents.ciphertext).toEqual(expect.any(String));
		expect(JSON.stringify(contents)).not.toContain("Alva");
	});

	test("a file that decrypts fine but isn't an export is listed as such, not as a wrong password", async ({
		data,
		history,
		setup,
		page,
	}) => {
		const password = "samma-lösenord";
		await setup.open();
		await data.open();
		await data.importFiles([{ name: "match.json", contents: MATCH }]);

		// Export the season report (a different SecurePackage payload shape)
		// with the same password the import will use.
		await history.gotoSeasonReport();
		const reportCard = history.seasonReportCard;
		await reportCard.getByLabel("Lösenord för filen").fill(password);
		const download = page.waitForEvent("download");
		await reportCard
			.getByRole("button", { name: "Spara säsongsrapport (krypterad)" })
			.click();
		const file = await download;
		const contents = await readFile(await file.path(), "utf8");

		// Importing is a data-management action: back on /data/.
		await data.goto();
		await data.chooseFiles([{ name: "sasongsrapport.json", contents }]);
		await data.unlock(password);
		await expect(data.importSummary).toHaveText([
			"sasongsrapport.json: Filen gick att öppna men är ingen exportfil eller lagfil från appen (en säsongsrapport kan till exempel inte läsas in).",
		]);
		await expect(data.importApplyButton).toBeDisabled();
	});
});
