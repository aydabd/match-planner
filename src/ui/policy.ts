import { RULES, SOURCES, sourcesByPublisher } from "../core/policy.js";
import { TEXT } from "./text.js";

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

function link(title: string, url: string): HTMLAnchorElement {
	const a = el("a", undefined, title);
	a.href = url;
	a.target = "_blank";
	a.rel = "noopener noreferrer";
	return a;
}

function byId(id: string): HTMLElement {
	const node = document.getElementById(id);
	if (!node) throw new Error(`Missing element #${id}`);
	return node;
}

/**
 * "Varför fungerar det så här?": every rule from src/core/policy.ts in plain
 * Swedish, with its source links, and the list of all documents. Static
 * content, so it works offline; only the links need a connection.
 */
export function createPolicyView(): void {
	const rules = byId("policyRules");
	for (const rule of RULES) {
		const text = TEXT.policy.rules[rule.id];
		const card = el("article", "card policy-rule");
		card.dataset.rule = rule.id;
		card.append(el("h2", undefined, text.title));
		card.append(
			el(
				"span",
				rule.origin === "policy" ? "pill" : "pill pill-decision",
				rule.origin === "policy"
					? TEXT.policy.fromPolicy
					: TEXT.policy.ownDecision,
			),
		);
		card.append(el("p", undefined, text.text));
		if (rule.origin === "policy") {
			for (const passage of rule.quotes) {
				const quote = el("blockquote", "policy-quote", passage);
				quote.setAttribute("aria-label", TEXT.policy.quote);
				card.append(quote);
			}
			card.append(
				el(
					"p",
					"hint",
					TEXT.policy.checked(rule.checked, rule.documentVersion),
				),
			);
		}
		const list = el("ul", "policy-links");
		for (const id of rule.sources) {
			const { publisher, title, url } = SOURCES[id];
			const item = el("li");
			item.append(link(title, url), el("span", "hint", ` (${publisher})`));
			list.append(item);
		}
		card.append(el("h3", "visually-hidden", TEXT.policy.sources), list);
		rules.append(card);
	}

	const sources = byId("policySources");
	for (const { publisher, documents } of sourcesByPublisher()) {
		sources.append(el("h3", undefined, publisher));
		const list = el("ul", "policy-links");
		for (const { title, url } of documents) {
			const item = el("li");
			item.append(link(title, url));
			list.append(item);
		}
		sources.append(list);
	}
}
