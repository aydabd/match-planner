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
			.getByRole("button", { name: "Varför fungerar det så här?" })
			.click();

		const policy = page.locator("#policyView");
		await expect(policy).toBeVisible();
		await expect(setup.root).toBeHidden();
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

		const hrefs = await policy
			.getByRole("link")
			.evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
		for (const host of SOURCE_HOSTS) {
			expect(hrefs.some((href) => new URL(href).host === host)).toBe(true);
		}

		await policy.getByRole("button", { name: "Tillbaka" }).click();
		await expect(setup.root).toBeVisible();
		// Focus goes back to the button that opened the page, not to a hidden one.
		await expect(
			page.getByRole("button", { name: "Varför fungerar det så här?" }),
		).toBeFocused();
		await expect(policy).toBeHidden();
	});

	test("is reachable from the match menu and returns to the match", async ({
		startedMatch: match,
		page,
	}) => {
		await match.openPolicyPage();
		await expect(page.locator("#policyView")).toBeVisible();
		await expect(match.root).toBeHidden();

		await page.getByRole("button", { name: "Tillbaka" }).click();
		await expect(match.root).toBeVisible();
		// The menu item is inside a closed menu, so the menu button gets focus.
		await expect(match.root.getByText("Meny", { exact: true })).toBeFocused();
	});
});
