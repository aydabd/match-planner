import { describe, expect, it } from "vitest";
import { LIMITS } from "../src/core/limits.js";
import { POLICY } from "../src/core/policy.js";
import {
	DEFAULT_FAIRNESS,
	ERSATTARE_RULES,
	FREE_RULES,
	isDay,
	parseFairnessPeriod,
	parseSubstitutionRules,
	presetOf,
	rulesForPreset,
	sameRules,
} from "../src/core/substitutionRules.js";

const limited = (fields: Record<string, unknown> = {}) => ({
	kind: "limited",
	substitutesIn: 5,
	occasions: 3,
	reEntry: false,
	...fields,
});

describe("substitution rule presets", () => {
	it("are free swaps, ersättare from POLICY, and custom starting from ersättare", () => {
		expect(rulesForPreset("free")).toEqual({ kind: "free" });
		expect(rulesForPreset("ersattare")).toEqual({
			kind: "limited",
			...POLICY.limitedSubstitutions,
		});
		expect(rulesForPreset("custom")).toEqual(ERSATTARE_RULES);
	});

	it("names the preset a set of rules matches", () => {
		expect(presetOf(FREE_RULES)).toBe("free");
		expect(presetOf(ERSATTARE_RULES)).toBe("ersattare");
		expect(presetOf({ ...ERSATTARE_RULES, substitutesIn: 7 } as never)).toBe(
			"custom",
		);
	});

	it("compares rules by value", () => {
		expect(sameRules(FREE_RULES, { kind: "free" })).toBe(true);
		expect(sameRules(FREE_RULES, ERSATTARE_RULES)).toBe(false);
		expect(
			sameRules(ERSATTARE_RULES, {
				kind: "limited",
				substitutesIn: 5,
				occasions: null,
				reEntry: false,
			}),
		).toBe(false);
	});
});

describe("parseSubstitutionRules", () => {
	it("reads free swaps and limited rules", () => {
		expect(parseSubstitutionRules({ kind: "free" })).toEqual({ kind: "free" });
		expect(parseSubstitutionRules(limited())).toEqual(limited());
		expect(parseSubstitutionRules(limited({ occasions: null }))).toEqual(
			limited({ occasions: null }),
		);
	});

	it("drops anything a free rule does not have", () => {
		expect(parseSubstitutionRules({ kind: "free", substitutesIn: 3 })).toEqual({
			kind: "free",
		});
	});

	it.each([
		["substitutesIn", LIMITS.substitutesIn],
		["occasions", LIMITS.occasions],
	])(
		"accepts %s exactly at its limits and refuses one past",
		(field, range) => {
			expect(parseSubstitutionRules(limited({ [field]: range.min }))).not.toBe(
				null,
			);
			expect(parseSubstitutionRules(limited({ [field]: range.max }))).not.toBe(
				null,
			);
			expect(parseSubstitutionRules(limited({ [field]: range.min - 1 }))).toBe(
				null,
			);
			expect(parseSubstitutionRules(limited({ [field]: range.max + 1 }))).toBe(
				null,
			);
			expect(parseSubstitutionRules(limited({ [field]: 2.5 }))).toBe(null);
		},
	);

	it.each([
		["nothing", undefined],
		["a list", []],
		["an unknown kind", { kind: "flying" }],
		["no substitutes", limited({ substitutesIn: undefined })],
		["occasions as text", limited({ occasions: "3" })],
		["no re-entry flag", limited({ reEntry: undefined })],
		["re-entry as text", limited({ reEntry: "no" })],
	])("refuses %s", (_, raw) => {
		expect(parseSubstitutionRules(raw)).toBe(null);
	});
});

describe("parseFairnessPeriod", () => {
	it("reads the last N matches, a season and a date range", () => {
		expect(parseFairnessPeriod(DEFAULT_FAIRNESS)).toEqual({
			kind: "recentMatches",
			count: LIMITS.recentMatches,
		});
		expect(parseFairnessPeriod({ kind: "season", year: 2026 })).toEqual({
			kind: "season",
			year: 2026,
		});
		expect(
			parseFairnessPeriod({
				kind: "range",
				from: "2026-04-01",
				to: "2026-04-01",
			}),
		).toEqual({ kind: "range", from: "2026-04-01", to: "2026-04-01" });
	});

	it("accepts a match count exactly at its limits and refuses one past", () => {
		const { min, max } = LIMITS.fairnessMatches;
		const period = (count: number) =>
			parseFairnessPeriod({ kind: "recentMatches", count });
		expect(period(min)).not.toBe(null);
		expect(period(max)).not.toBe(null);
		expect(period(min - 1)).toBe(null);
		expect(period(max + 1)).toBe(null);
	});

	it.each([
		["nothing", null],
		["an unknown kind", { kind: "forever" }],
		["a season far away", { kind: "season", year: 1890 }],
		[
			"a range that ends first",
			{ kind: "range", from: "2026-05-02", to: "2026-05-01" },
		],
		[
			"a day that does not exist",
			{ kind: "range", from: "2026-02-30", to: "2026-03-01" },
		],
		[
			"a range with a time",
			{ kind: "range", from: "2026-05-01T10:00", to: "2026-05-02" },
		],
	])("refuses %s", (_, raw) => {
		expect(parseFairnessPeriod(raw)).toBe(null);
	});

	it("knows a real day from a made-up one", () => {
		expect(isDay("2028-02-29")).toBe(true);
		expect(isDay("2026-02-29")).toBe(false);
		expect(isDay(20260101)).toBe(false);
	});
});
