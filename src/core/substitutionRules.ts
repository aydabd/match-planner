import { LIMITS } from "./limits.js";
import { POLICY, type SubstitutionKind } from "./policy.js";

/**
 * How substitutions work in one match (#171). "free" is barn- och
 * ungdomsfotboll: flying swaps where a replaced player may come back, planned
 * by the rotation engine (scheduler.ts). "limited" is a series with
 * ersättare: a cap on players brought on and on occasions during play, and
 * usually no re-entry, planned by limitedPlan.ts.
 */
export type SubstitutionRules =
	| { kind: Extract<SubstitutionKind, "free"> }
	| {
			kind: Extract<SubstitutionKind, "limited">;
			/** Most players brought on, 1..LIMITS.substitutesIn.max. */
			substitutesIn: number;
			/** Most occasions during play; null means no limit. */
			occasions: number | null;
			/** May a replaced player come back on? */
			reEntry: boolean;
	  };

/** The choices a coach starts from on the setup screen. */
export type RulesPreset = "free" | "ersattare" | "custom";

/** Free swaps with re-entry, as in barn- och ungdomsfotboll. */
export const FREE_RULES: SubstitutionRules = { kind: "free" };

/** Ersättare as in TB 4 kap. 5 § (rule "limitedSubstitutions"). */
export const ERSATTARE_RULES: SubstitutionRules = {
	kind: "limited",
	...POLICY.limitedSubstitutions,
};

/** The rules a preset stands for; "custom" starts from the ersättare values. */
export function rulesForPreset(preset: RulesPreset): SubstitutionRules {
	return preset === "free" ? FREE_RULES : { ...ERSATTARE_RULES };
}

/** Which preset `rules` match, or "custom" when the coach changed a value. */
export function presetOf(rules: SubstitutionRules): RulesPreset {
	if (rules.kind === "free") return "free";
	return sameRules(rules, ERSATTARE_RULES) ? "ersattare" : "custom";
}

export function sameRules(a: SubstitutionRules, b: SubstitutionRules): boolean {
	if (a.kind === "free" || b.kind === "free") return a.kind === b.kind;
	return (
		a.substitutesIn === b.substitutesIn &&
		a.occasions === b.occasions &&
		a.reEntry === b.reEntry
	);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isWholeWithin = (
	value: unknown,
	range: { min: number; max: number },
): value is number =>
	typeof value === "number" &&
	Number.isInteger(value) &&
	value >= range.min &&
	value <= range.max;

/**
 * Strictly read substitution rules from a saved file. Returns null for
 * anything that is not exactly a valid set of rules: a missing field, an
 * extra kind, or a number outside LIMITS. The caller refuses the file.
 */
export function parseSubstitutionRules(raw: unknown): SubstitutionRules | null {
	if (!isRecord(raw)) return null;
	if (raw.kind === "free") return { kind: "free" };
	if (raw.kind !== "limited") return null;
	const { substitutesIn, occasions, reEntry } = raw;
	if (!isWholeWithin(substitutesIn, LIMITS.substitutesIn)) return null;
	if (occasions !== null && !isWholeWithin(occasions, LIMITS.occasions))
		return null;
	if (typeof reEntry !== "boolean") return null;
	return { kind: "limited", substitutesIn, occasions, reEntry };
}

/**
 * The period over which playtime should even out when swaps are limited
 * (rule "fairOverTime"): the team's last `count` matches, one calendar year,
 * or the matches between two dates (inclusive, "YYYY-MM-DD").
 */
export type FairnessPeriod =
	| { kind: "recentMatches"; count: number }
	| { kind: "season"; year: number }
	| { kind: "range"; from: string; to: string };

/** What a new team measures fairness over. */
export const DEFAULT_FAIRNESS: FairnessPeriod = {
	kind: "recentMatches",
	count: LIMITS.recentMatches,
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day "YYYY-MM-DD" (not 2026-02-30). */
export function isDay(value: unknown): value is string {
	if (typeof value !== "string" || !DAY.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return (
		!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
	);
}

/** Strictly read a fairness period from a saved file; null if invalid. */
export function parseFairnessPeriod(raw: unknown): FairnessPeriod | null {
	if (!isRecord(raw)) return null;
	switch (raw.kind) {
		case "recentMatches":
			return isWholeWithin(raw.count, LIMITS.fairnessMatches)
				? { kind: "recentMatches", count: raw.count }
				: null;
		case "season":
			return isWholeWithin(raw.year, LIMITS.seasonYear)
				? { kind: "season", year: raw.year }
				: null;
		case "range":
			return isDay(raw.from) && isDay(raw.to) && raw.from <= raw.to
				? { kind: "range", from: raw.from, to: raw.to }
				: null;
		default:
			return null;
	}
}
