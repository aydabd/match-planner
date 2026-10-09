import { expect, test } from "../fixtures.js";

const SOURCE_HOSTS = [
	"www.rf.se",
	"aktiva.svenskfotboll.se",
	"www.skaneboll.se",
];

test.describe("Why does it work like this?", () => {
	test("is reachable from setup, shows the rules and links the documents", async ({
		page,
		setup,
	}) => {
		await setup.open();
		await page
			.locator("#pageNav")
			.getByRole("link", { name: "Om", exact: true })
			.click();

		const policy = page.locator("#policyView");
		await expect(policy).toBeVisible();
		await expect(
			policy.getByRole("heading", { name: "Högst 2 led per spelare" }),
		).toBeVisible();

		// Policy rules are marked and quoted; own decisions are labelled as such.
		const equal = policy.locator('[data-rule="equalPlaytime"]');
		await expect(equal).toContainText("MatchPlanners eget val");
		const formats = policy.locator('[data-rule="matchFormats"]');
		await expect(formats).toContainText("Från riktlinjer");
		await expect(formats.locator("blockquote").first()).toContainText(
			"5 mot 5",
		);

		// Match lengths come from SvFF; cups can differ, so the page says to
		// change them by hand.
		const lengths = policy.locator('[data-rule="matchLengths"]');
		await expect(lengths).toContainText("Från riktlinjer");
		await expect(lengths).toContainText("3 x 20 minuter vid enskild match");
		await expect(lengths).toContainText("Cuper har ofta egna regler");

		// Each rule says which matches it applies to.
		await expect(lengths).toContainText("Gäller alla matcher");
		await expect(policy.locator('[data-rule="loadInARow"]')).toContainText(
			"Gäller matcher med fria byten",
		);
		const limited = policy.locator('[data-rule="limitedSubstitutions"]');
		await expect(limited).toContainText("Gäller matcher med begränsade byten");
		await expect(limited).toContainText("halvtidsvilan således undantagen");
		await expect(limited).toContainText("Tävlingsbestämmelser 2026 (PDF)");

		const hrefs = await policy
			.getByRole("link")
			.evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
		for (const host of SOURCE_HOSTS) {
			expect(hrefs.some((href) => new URL(href).host === host)).toBe(true);
		}

		await policy.getByRole("link", { name: "Tillbaka" }).click();
		await expect(setup.root).toBeVisible();
	});

	test("shows the shared nav with Om marked current", async ({
		page,
		setup,
	}) => {
		await setup.open();
		await page
			.locator("#pageNav")
			.getByRole("link", { name: "Om", exact: true })
			.click();
		const nav = page.locator("#pageNav");
		await expect(
			nav.getByRole("link", { name: "Om", exact: true }),
		).toHaveAttribute("aria-current", "page");
	});

	test("is reachable from the match menu, and returning resumes the match", async ({
		startedMatch: match,
		page,
	}) => {
		await match.openPolicyPage();
		await expect(page.locator("#policyView")).toBeVisible();

		await page.getByRole("link", { name: "Tillbaka" }).click();
		// The match is still running in storage; landing back on start resumes
		// it straight away instead of dropping the coach at setup (see #93).
		await expect(match.root).toBeVisible();
	});
});
