import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getFormat, TEAM_SIZES } from "../src/core/formations.js";
import {
	POLICY,
	POLICY_OVERLAYS,
	policyFor,
	REGIONS,
	RULES,
	SOURCES,
	SUBSTITUTION_KINDS,
	sourcesByPublisher,
} from "../src/core/policy.js";
import { canAssignZone } from "../src/core/scheduler.js";
import type { PlayerState } from "../src/core/types.js";
import { TEXT } from "../src/ui/text.js";

const player = (zonesPlayed: string[]): PlayerState => ({
	id: "p",
	totalSeconds: 0,
	zonesPlayed,
	loadInARow: 0,
	unavailable: false,
});

describe("policy: every rule says where it comes from", () => {
	it("gives each rule text and at least one source", () => {
		for (const rule of RULES) {
			expect(TEXT.policy.rules[rule.id].title).not.toBe("");
			expect(rule.sources.length).toBeGreaterThan(0);
			for (const id of rule.sources)
				expect(SOURCES[id].url).toMatch(/^https:\/\//);
		}
	});

	it("has a quote, a check date and a version for every rule labelled as policy", () => {
		for (const rule of RULES.filter((r) => r.origin === "policy")) {
			expect(rule.citations.length).toBeGreaterThan(0);
			for (const citation of rule.citations) {
				expect(rule.sources).toContain(citation.source);
				expect(citation).toMatchObject({
					quotes: expect.arrayContaining([expect.stringMatching(/\S/)]),
					checked: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
					documentVersion: expect.stringMatching(/\S/),
				});
			}
		}
	});

	it("does not attribute a quote to a rule that is MatchPlanner's own decision", () => {
		for (const rule of RULES.filter((r) => r.origin === "decision")) {
			expect("citations" in rule).toBe(false);
		}
	});

	it("says which kinds of substitution every rule applies to", () => {
		for (const rule of RULES) {
			expect(rule.appliesTo.length).toBeGreaterThan(0);
			expect(new Set(rule.appliesTo).size).toBe(rule.appliesTo.length);
			for (const kind of rule.appliesTo)
				expect(SUBSTITUTION_KINDS).toContain(kind);
		}
	});

	it("keeps the rules that assume free swaps away from limited ones", () => {
		const freeOnly = ["equalPlaytime", "loadInARow", "restTime", "swapTiming"];
		for (const rule of RULES) {
			if (freeOnly.includes(rule.id) || rule.id === "freeSubstitutions")
				expect(rule.appliesTo).toEqual(["free"]);
			if (rule.id === "limitedSubstitutions" || rule.id === "fairOverTime")
				expect(rule.appliesTo).toEqual(["limited"]);
		}
	});

	it("explains where a rule applies in Swedish", () => {
		expect(TEXT.policy.appliesTo(["free", "limited"])).toBe(
			"Gäller alla matcher",
		);
		expect(TEXT.policy.appliesTo(["free"])).toBe(
			"Gäller matcher med fria byten",
		);
		expect(TEXT.policy.appliesTo(["limited"])).toBe(
			"Gäller matcher med begränsade byten",
		);
	});

	it("quotes the limited-substitution values the code applies", () => {
		const rule = RULES.find((r) => r.id === "limitedSubstitutions");
		const passage = rule?.citations[0]?.quotes[0] ?? "";
		const { substitutesIn, occasions, reEntry } = POLICY.limitedSubstitutions;
		expect([substitutesIn, occasions, reEntry]).toEqual([5, 3, false]);
		expect(passage).toContain("högst fem ersättare");
		expect(passage).toContain("vid högst tre tillfällen");
		expect(passage).toContain("halvtidsvilan således undantagen");
		expect(passage).toContain("får inte återinträda");
		expect(POLICY.breakIsOccasion).toBe(false);
	});

	it("links the three organisations", () => {
		const publishers = sourcesByPublisher().map((g) => g.publisher);
		expect(publishers).toEqual([
			expect.stringContaining("RF"),
			expect.stringContaining("SvFF"),
			expect.stringContaining("Skånebollen"),
		]);
	});
});

describe("policy: the code uses the policy values", () => {
	it("gives the team sizes the match plan from POLICY", () => {
		for (const [id, size] of Object.entries(TEAM_SIZES)) {
			const plan = POLICY.formats[id as keyof typeof POLICY.formats];
			expect(size.periods).toBe(plan.periods);
			expect(size.periodMinutes).toBe(plan.periodMinutes);
		}
	});

	it("allows no more lines per player than POLICY.maxZonesPerPlayer", () => {
		const format = getFormat("9v9:3-3-2");
		const lines = format.zones.map((z) => z.id);
		expect(POLICY.maxZonesPerPlayer).toBe(2);
		// back, mid, fwd: back+mid is allowed, a third line never is.
		expect(
			canAssignZone(player([lines[0] as string]), lines[1] as string, format),
		).toBe(true);
		expect(
			canAssignZone(player(lines.slice(0, 2)), lines[2] as string, format),
		).toBe(false);
	});

	it("keeps neighbouring lines only", () => {
		const format = getFormat("9v9:3-3-2");
		const [back, , fwd] = format.zones.map((z) => z.id) as [
			string,
			string,
			string,
		];
		expect(POLICY.zonesMustBeAdjacent).toBe(true);
		expect(canAssignZone(player([back]), fwd, format)).toBe(false);
	});
});

describe("policy: regions", () => {
	it("resolves the national region to POLICY unchanged", () => {
		expect(policyFor("national")).toEqual(POLICY);
	});

	it("has a label for every region", () => {
		for (const region of Object.keys(REGIONS)) {
			expect(REGIONS[region as keyof typeof REGIONS].label).not.toBe("");
		}
	});

	it("merges a region's overlay onto the national baseline without mutating POLICY", () => {
		// Skåne has no overlay today: its own page confirms the national match
		// formats apply from season 2026 (see the "matchFormats" rule). This
		// guards that policyFor keeps returning the national values until a
		// region genuinely publishes a different, quoted number.
		expect(POLICY_OVERLAYS.skane ?? {}).toEqual({});
		expect(policyFor("skane")).toEqual(POLICY);
	});
});

describe("policy: the README lists the same sources", () => {
	it("links every document", () => {
		const readme = readFileSync("README.md", "utf8");
		for (const { url } of Object.values(SOURCES)) expect(readme).toContain(url);
	});
});
