import type { PlayerChoice } from "../core/limitedPlan.js";
import {
	parseSubstitutionRules,
	type SubstitutionRules,
} from "../core/substitutionRules.js";
import { readItem, STORAGE_KEYS, teamScoped, writeItem } from "./appStorage.js";
import { activeTeamId } from "./teamStorage.js";

/**
 * What the setup screen decided about the next match beyond the squad
 * (#171): its own substitution rules when they differ from the team's (a
 * cup), and the coach's changes to the proposal. The match page reads it
 * when the match starts.
 */
export interface MatchSetupChoices {
	/** null: the match uses the team's rules. */
	rules: SubstitutionRules | null;
	/** By squad player id. */
	choices: Record<string, PlayerChoice>;
}

const NONE: MatchSetupChoices = { rules: null, choices: {} };
const CHOICES: readonly string[] = ["start", "bench", "sitOut"];

/** The saved choices, or none when nothing valid is saved. */
export function loadMatchSetup(): MatchSetupChoices {
	const raw = readItem(teamScoped(STORAGE_KEYS.matchSetup, activeTeamId()));
	if (!raw) return { ...NONE, choices: {} };
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const rules =
			parsed.rules === null ? null : parseSubstitutionRules(parsed.rules);
		const choices = parsed.choices;
		if (
			(rules === null && parsed.rules !== null) ||
			typeof choices !== "object" ||
			choices === null ||
			Array.isArray(choices) ||
			!Object.values(choices).every((c) => CHOICES.includes(String(c)))
		) {
			return { ...NONE, choices: {} };
		}
		return { rules, choices: choices as Record<string, PlayerChoice> };
	} catch {
		return { ...NONE, choices: {} };
	}
}

export function saveMatchSetup(setup: MatchSetupChoices): void {
	writeItem(
		teamScoped(STORAGE_KEYS.matchSetup, activeTeamId()),
		JSON.stringify(setup),
	);
}
