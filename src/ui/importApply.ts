import type { CollectedTeam } from "../core/importCollect.js";
import {
	type MergeCounts,
	type PlacementChoice,
	placeTeam,
	previewMerge,
} from "../core/importTeam.js";
import type { TeamData } from "../core/teamData.js";
import { type Applied, applyTeamData } from "./applyTeamData.js";
import { loadMatchFiles } from "./matchFileStorage.js";
import { activeTeamIsEmpty } from "./teamEmpty.js";
import {
	activeTeamId,
	adoptTeamId,
	createTeamWithId,
	otherTeamIds,
} from "./teamStorage.js";

export type ImportOutcome =
	| {
			kind: "applied";
			applied: Applied;
			/** Distinct matches the files offered, new or known. */
			offered: number;
	  }
	/** The files are another team's and this team has data: nothing changed, the coach picks a placement. */
	| {
			kind: "ask";
			teamId: string;
			name: string;
			counts: MergeCounts;
	  }
	| { kind: "refused"; reason: "belongsToOtherLocalTeam" };

function combined(...parts: (CollectedTeam | null)[]): TeamData {
	const data: TeamData = { matches: [], notes: [], squads: [] };
	for (const part of parts) {
		if (part === null) continue;
		data.matches.push(...part.data.matches);
		data.notes.push(...part.data.notes);
		data.squads.push(...part.data.squads);
	}
	return data;
}

/**
 * Apply what the files hold (#154): `loose` is the team-less group, merged
 * into the active team; `team` is one team's Drive-format files, placed with
 * the same rules as a Drive restore. Only merges: nothing on the device is
 * removed, and an import of the same files again changes nothing. When a
 * team with data is given another team's files the outcome is "ask"; call
 * again with `placement` to read them in as a new team or merge them.
 */
export function importTeam(
	loose: CollectedTeam | null,
	team: CollectedTeam | null,
	choice?: PlacementChoice,
): ImportOutcome {
	if (team?.teamId) {
		const placement = placeTeam({
			localTeamId: activeTeamId(),
			localIsEmpty: activeTeamIsEmpty(),
			otherLocalTeamIds: otherTeamIds(),
			incomingTeamId: team.teamId,
		});
		if (placement.action === "refuse") {
			return { kind: "refused", reason: placement.reason };
		}
		if (placement.action === "ask") {
			if (choice === undefined) {
				const local: TeamData = {
					matches: loadMatchFiles(),
					notes: [],
					squads: [],
				};
				return {
					kind: "ask",
					teamId: placement.teamId,
					name: team.name,
					counts: previewMerge(local, combined(loose, team)),
				};
			}
			if (choice === "new") createTeamWithId(placement.teamId, team.name);
			else if (!adoptTeamId(placement.teamId)) {
				return { kind: "refused", reason: "belongsToOtherLocalTeam" };
			}
		}
		if (
			placement.action === "adopt" &&
			!adoptTeamId(placement.teamId, team.name)
		) {
			return { kind: "refused", reason: "belongsToOtherLocalTeam" };
		}
	}
	const data = combined(loose, team);
	const offered = new Set(data.matches.map((m) => m.audit.matchId)).size;
	return { kind: "applied", applied: applyTeamData(data), offered };
}
