import { getFormat } from "../core/formations.js";
import { type LimitedPlan, planMatch } from "../core/limitedPlan.js";
import { buildPlayerIdMap, playerId } from "../core/playerIdentity.js";
import { standing } from "../core/standing.js";
import type { RosterFile } from "../core/storage.js";
import type { SubstitutionRules } from "../core/substitutionRules.js";
import type { MatchSetupChoices } from "./matchSetupStorage.js";
import { deviceTeamRecords, type TeamRecords } from "./teamRecords.js";

/** The rules the next match is played under: its own, or the team's. */
export function rulesForMatch(
	draft: RosterFile,
	setup: MatchSetupChoices,
): SubstitutionRules {
	return setup.rules ?? draft.substitutions;
}

/**
 * Seconds each squad player is ahead of the team average over the team's
 * fairness period, by squad id. A player with no matches in the period
 * stands at 0.
 */
export async function aheadOfSquad(
	teamId: string,
	draft: RosterFile,
	records: TeamRecords = deviceTeamRecords,
): Promise<Record<string, number>> {
	const summaries = await records.matchSummaries(teamId, draft.fairness);
	const byIdentity = new Map(
		standing(summaries, draft.fairness).map(
			(s) => [s.playerId, s.aheadSeconds] as const,
		),
	);
	const map = await buildPlayerIdMap(draft.players.map((p) => p.name));
	return Object.fromEntries(
		draft.players.map((p) => [
			p.id,
			byIdentity.get(playerId(map, p.name)) ?? 0,
		]),
	);
}

/**
 * The proposal for the next match when its swaps are limited: lineup, who
 * sits out, and when each substitute comes on. Null with free swaps, which
 * the rotation engine plans during the match.
 */
export function proposalFor(
	draft: RosterFile,
	setup: MatchSetupChoices,
	ahead: Readonly<Record<string, number>>,
): LimitedPlan | null {
	const rules = rulesForMatch(draft, setup);
	if (rules.kind !== "limited") return null;
	return planMatch(
		{
			format: getFormat(draft.formatId),
			periods: draft.periods,
			periodSeconds: draft.periodSeconds,
			rules,
		},
		{
			players: draft.players.map((p) => p.id),
			keeperId: draft.startingKeeperId,
			ahead,
			choices: setup.choices,
		},
	);
}
