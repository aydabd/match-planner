import { readFile } from "node:fs/promises";
import { matchFileToJson } from "../../src/core/matchFile.js";
import { makeMatchFile, NAMES } from "../../tests/support/matchFiles.js";
import { expect, test } from "../fixtures.js";
import { HistoryPage } from "../pages/HistoryPage.js";
import { SetupPage } from "../pages/SetupPage.js";

const MATCH = matchFileToJson(
	makeMatchFile({ matchId: "export-1", names: NAMES.slice(0, 9) }),
);

test.describe("Secure export and import (#81)", () => {
	test("exports everything to one encrypted file and imports it on another device", async ({
		browser,
		history,
		setup,
		page,
	}) => {
		const password = "hemligt-lösenord";

		await setup.open();
		await history.open();
		await history.importFiles([{ name: "match.json", contents: MATCH }]);
		await expect(history.count).toHaveText("1 match över 1 månad.");

		await history.secureExportPasswordInput.fill(password);
		const download = page.waitForEvent("download");
		await history.secureExportButton.click();
		const file = await download;
		await expect(history.secureExportStatus).toHaveText(
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
		const otherHistory = new HistoryPage(otherPage);
		await otherSetup.open();
		await otherHistory.open();
		await expect(otherHistory.count).toHaveText(
			"Inga matcher än. Spela en match eller läs in matchfiler.",
		);

		await otherHistory.secureImportFileInput.setInputFiles({
			name: "export.json",
			mimeType: "application/json",
			buffer: Buffer.from(contents),
		});

		// The wrong password is refused rather than importing garbage.
		await otherHistory.secureExportPasswordInput.fill("fel lösenord");
		await otherHistory.secureImportButton.click();
		await otherHistory.secureImportButton.click();
		await expect(otherHistory.secureExportStatus).toHaveText(
			"Fel lösenord, eller filen har ändrats. Kontrollera lösenordet och försök igen.",
		);

		// Choosing the file again after a failed attempt (it's cleared after
		// every attempt, same as a real re-pick) then using the right password.
		await otherHistory.secureImportFileInput.setInputFiles({
			name: "export.json",
			mimeType: "application/json",
			buffer: Buffer.from(contents),
		});
		await otherHistory.secureExportPasswordInput.fill(password);
		await otherHistory.secureImportButton.click();
		await otherHistory.secureImportButton.click();
		await expect(otherHistory.secureExportStatus).toHaveText(
			"Allt importerades.",
		);
		await expect(otherHistory.count).toHaveText("1 match över 1 månad.");

		await otherContext.close();
	});

	test("the season report download is encrypted with the entered password", async ({
		history,
		setup,
		page,
	}) => {
		await setup.open();
		await history.open();
		await history.importFiles([{ name: "match.json", contents: MATCH }]);
		await expect(history.count).toHaveText("1 match över 1 månad.");

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

	test("a file that decrypts fine but isn't an export bundle is refused as unreadable, not a wrong password", async ({
		history,
		setup,
		page,
	}) => {
		const password = "samma-lösenord";
		await setup.open();
		await history.open();
		await history.importFiles([{ name: "match.json", contents: MATCH }]);

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

		// Importing a bundle is a data-management action: back on /statistics/.
		await page.goto("statistics/");
		await history.secureImportFileInput.setInputFiles({
			name: "sasongsrapport.json",
			mimeType: "application/json",
			buffer: Buffer.from(contents),
		});
		await history.secureExportPasswordInput.fill(password);
		await history.secureImportButton.click();
		await history.secureImportButton.click();
		await expect(history.secureExportStatus).toHaveText(
			"Filen kunde inte läsas som en exporterad fil.",
		);
	});
});
