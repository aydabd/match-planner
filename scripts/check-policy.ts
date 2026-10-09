/**
 * Checks that every quote in src/core/policy.ts still stands in the document
 * it was taken from, so a changed rule or match length is noticed. Reads web
 * pages and PDFs. Needs network access, so it is not part of `npm test`.
 * Run: npm run check:policy
 */
import { extractText, getDocumentProxy } from "unpdf";
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

const normal = (text: string) => text.replace(/\s+/g, " ").trim();

/** The visible text of a page, in one line, without markup or entities. */
function pageText(html: string): string {
	return normal(
		html
			.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
			.replace(/<[^>]*>/g, " ")
			.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
			.replace(/&([A-Za-z]+);/g, (whole, name) => ENTITIES[name] ?? whole),
	);
}

/** The text of a PDF, all pages in one line. */
async function pdfText(bytes: ArrayBuffer): Promise<string> {
	const pdf = await getDocumentProxy(new Uint8Array(bytes));
	const { text } = await extractText(pdf, { mergePages: true });
	return normal(text);
}

async function documentText(response: Response): Promise<string> {
	const type = response.headers.get("content-type") ?? "";
	return type.includes("application/pdf")
		? pdfText(await response.arrayBuffer())
		: pageText(await response.text());
}

let failures = 0;
const documents = new Map<string, string>();

for (const rule of RULES) {
	if (rule.origin !== "policy") continue;
	for (const citation of rule.citations) {
		const { url } = SOURCES[citation.source];
		let text = documents.get(url);
		if (text === undefined) {
			const response = await fetch(url, { redirect: "follow" });
			if (!response.ok) {
				console.error(`FAIL ${rule.id}: ${url} answered ${response.status}`);
				failures++;
				continue;
			}
			text = await documentText(response);
			documents.set(url, text);
		}
		for (const quote of citation.quotes) {
			const found = text.includes(normal(quote));
			console.log(`${found ? "ok  " : "FAIL"} ${rule.id}: ${quote}`);
			if (!found) failures++;
		}
	}
}

if (failures > 0) {
	console.error(
		`\n${failures} quote(s) no longer match. Read the document, update src/core/policy.ts (quote, checked date, version) and TEXT.policy.`,
	);
	process.exit(1);
}
console.log("\nAll policy quotes still stand.");
