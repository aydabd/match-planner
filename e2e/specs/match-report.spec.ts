import { expect, test } from "../fixtures.js";

test.describe("The match report", () => {
	test("ending the match shows who played how long and how late the swaps were", async ({
		startedMatch: match,
		report,
	}) => {
		await match.startClock();
		await match.play(11);
		await match.confirmSwap("Greta");
		await match.play(2);
		await match.endMatch();

		await expect(report.root).toBeVisible();
		await expect(match.root).toBeHidden();
		await expect(report.summary.first()).toHaveText(
			"Byten var i snitt 1 minut sena.",
		);

		// Playtime: everyone in the squad, with the total and the period.
		await expect(report.playtimeRows).toHaveCount(8);
		await expect(report.playtimeRows.filter({ hasText: "Alva" })).toContainText(
			"13:00",
		);
		await expect(
			report.playtimeRows.filter({ hasText: "Greta" }),
		).toContainText("02:00");

		// The swap: planned 10:00, made 11:00, flagged as late.
		const swap = report.swapRows.filter({ hasText: "Greta in för" });
		await expect(swap).toContainText("10:00");
		await expect(swap).toContainText("11:00");
		await expect(swap).toContainText("1 minut sen");
		await expect(swap).toContainText("Sen");
	});

	test("the report can be opened again from the match and from setup", async ({
		startedMatch: match,
		report,
		setup,
		page,
	}) => {
		await match.startClock();
		await match.play(3);
		await match.endMatch();
		await report.backButton.click();
		await expect(match.root).toBeVisible();
		await expect(match.showReportButton).toBeVisible();
		await expect(match.startClockButton).toBeHidden();

		await match.showReportButton.click();
		await expect(report.root).toBeVisible();
		await report.backButton.click();

		// Kept on the device: still there after a reload and from setup.
		await match.editSquad();
		await expect(setup.root).toBeVisible();
		await page.reload();
		await report.openKeptReports();
		await report.keptReport(/^\d{4}-\d{2}-\d{2} · Match$/).click();
		await expect(report.root).toBeVisible();
		await expect(report.playtimeRows).toHaveCount(8);
		await report.backButton.click();
		await expect(setup.root).toBeVisible();
	});

	test("the match ends by itself after the last period and shows the report", async ({
		startedMatch: match,
		report,
	}) => {
		for (let period = 1; period <= 3; period++) {
			if (period > 1) await match.nextPeriodButton.click();
			await match.playRotationAndSwap();
			await match.play(10);
		}

		await expect(report.root).toBeVisible();
		await expect(report.summary).not.toHaveCount(0);
	});

	test("shows what was typed about the match and can be copied as text", async ({
		setup,
		match,
		report,
		page,
		context,
	}) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await setup.open();
		await setup.addPlayers([
			"Alva",
			"Bo",
			"Cleo",
			"Dino",
			"Ebba",
			"Filip",
			"Greta",
		]);
		await setup.setMatchDetails({
			opponent: "IFK Test",
			venue: "Hemmaplan",
			date: "2026-09-05T10:00",
			coach: "Tränare",
		});
		await setup.startMatch();
		await match.startClock();
		await match.play(2);
		await match.endMatch();

		await expect(report.root).toContainText("IFK Test");
		await report.root.getByRole("button", { name: "Kopiera som text" }).click();
		await expect(report.root.locator("#reportShareStatus")).toHaveText(
			"Rapporten är kopierad.",
		);
		const copied = await page.evaluate(() => navigator.clipboard.readText());
		expect(copied).toContain("IFK Test · Hemmaplan · 2026-09-05 10:00");
		expect(copied).toContain("Alva: ");
	});
});
