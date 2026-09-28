/**
 * Checks that every quote in src/core/policy.ts still stands on the page it
 * was taken from, so a changed rule or match length is noticed. Needs network
 * access, so it is not part of `npm test`. Run: npm run check:policy
 */
import { RULES, SOURCES } from "../src/core/policy.ts";

const ENTITIES: Record<string, string> = {
	aring: "å",
	auml: "ä",
	ouml: "ö",
	Aring: "Å",
	Auml: "Ä",
	Ouml: "Ö",
	nbsp: " ",
	amp: "&",
	quot: '"',
	apos: "'",
	ndash: "–",
};

/** The visible text of a page, in one line, without markup or entities. */
function pageText(html: string): string {
	return html
		.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
		.replace(/<[^>]*>/g, " ")
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&([A-Za-z]+);/g, (whole, name) => ENTITIES[name] ?? whole)
		.replace(/\s+/g, " ")
		.trim();
}

const normal = (text: string) => text.replace(/\s+/g, " ").trim();

let failures = 0;
const pages = new Map<string, string>();

for (const rule of RULES) {
	if (rule.origin !== "policy") continue;
	const { url } = SOURCES[rule.quoteSource];
	let text = pages.get(url);
	if (text === undefined) {
		const response = await fetch(url, { redirect: "follow" });
		if (!response.ok) {
			console.error(`FAIL ${rule.id}: ${url} answered ${response.status}`);
			failures++;
			continue;
		}
		text = pageText(await response.text());
		pages.set(url, text);
	}
	for (const quote of rule.quotes) {
		const found = text.includes(normal(quote));
		console.log(`${found ? "ok  " : "FAIL"} ${rule.id}: ${quote}`);
		if (!found) failures++;
	}
}

if (failures > 0) {
	console.error(
		`\n${failures} quote(s) no longer match. Read the page, update src/core/policy.ts (quote, checked date, version) and TEXT.policy.`,
	);
	process.exit(1);
}
console.log("\nAll policy quotes still stand.");
