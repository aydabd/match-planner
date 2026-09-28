import { readFileSync } from "node:fs";
import { expect, test } from "../fixtures.js";

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as {
	version: string;
};
/** "2026 Holder": the year and owner from the LICENSE line. */
const yearAndHolder = /^Copyright \(c\) (.+)$/m.exec(
	readFileSync("LICENSE", "utf8"),
)?.[1];
if (!yearAndHolder) throw new Error("LICENSE has no 'Copyright (c) …' line");

test.describe("Footer", () => {
	test("shows the version and the copyright on setup and during the match", async ({
		setup,
		startedMatch: match,
		page,
	}) => {
		const footer = page.locator("#appFooter");
		await expect(match.root).toBeVisible();
		await expect(footer).toContainText(`MatchPlanner v${version}`);
		await expect(footer).toContainText(`© ${yearAndHolder}`);
		await expect(footer).toContainText("MIT-licens");

		await match.editSquad();
		await expect(setup.root).toBeVisible();
		await expect(footer).toContainText(`MatchPlanner v${version}`);
		await expect(footer).toContainText(`© ${yearAndHolder}`);
	});

	test("is shown once, also on the report, history and policy pages", async ({
		setup,
		page,
	}) => {
		await setup.open();
		await page.getByRole("button", { name: "Visa spelarhistorik" }).click();
		await expect(page.locator("#historyView")).toBeVisible();
		await expect(page.locator("footer")).toHaveCount(1);
		await expect(page.locator("#appFooter")).toBeVisible();
	});
});
