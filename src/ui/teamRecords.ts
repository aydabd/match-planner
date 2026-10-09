import { buildPlayerIdMap } from "../core/playerIdentity.js";
import {
	inPeriod,
	type PlayerMatchSummary,
	summariesOf,
} from "../core/standing.js";
import type { FairnessPeriod } from "../core/substitutionRules.js";
import { loadMatchFiles } from "./matchFileStorage.js";

/**
 * The records the substitution-rules screens read and write (#171), behind
 * one narrow interface so they do not assume the data lives in files. Today
 * the only implementation reads the match files kept on this device, which
 * Drive backup and restore keep in step with the team's Drive folder. A
 * backend (#173) would answer the same calls with a query.
 */
export interface TeamRecords {
	/** One summary per player and match of `teamId` in `period`. */
	matchSummaries(
		teamId: string,
		period: FairnessPeriod,
	): Promise<PlayerMatchSummary[]>;
}

export const deviceTeamRecords: TeamRecords = {
	async matchSummaries(teamId, period) {
		const files = loadMatchFiles(teamId);
		const map = await buildPlayerIdMap(
			files.flatMap((f) => f.squad.players.map((p) => p.name)),
		);
		return inPeriod(
			files.flatMap((f) => summariesOf(f, teamId, map)),
			period,
		);
	},
};
