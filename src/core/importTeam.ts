import type { TeamData } from "./teamData.js";

/**
 * Where files that belong to a team go (#154), the same rules as a Drive
 * restore (chooseTeamFolder in driveSync.ts) so the two cannot disagree.
 */
export type TeamPlacement =
	/** The files name no team: merge them into the active team. */
	| { action: "active" }
	/** The files are this team's own. */
	| { action: "use" }
	/** The team is empty and takes on the files' id and name. */
	| { action: "adopt"; teamId: string }
	/** The team has data and the files are another team's: show both choices. */
	| { action: "ask"; teamId: string }
	/** Another team on this device already has that id. */
	| { action: "refuse"; reason: "belongsToOtherLocalTeam" };

/** What a team with data does with another team's files: a new team, or a merge. */
export type PlacementChoice = "new" | "merge";

/** Matches on this device, in the files, and after merging them. */
export interface MergeCounts {
	local: number;
	incoming: number;
	merged: number;
}

export function placeTeam(input: {
	localTeamId: string;
	localIsEmpty: boolean;
	otherLocalTeamIds: readonly string[];
	incomingTeamId: string | null;
}): TeamPlacement {
	const incoming = input.incomingTeamId;
	if (incoming === null) return { action: "active" };
	if (incoming === input.localTeamId) return { action: "use" };
	if (input.otherLocalTeamIds.includes(incoming)) {
		return { action: "refuse", reason: "belongsToOtherLocalTeam" };
	}
	if (input.localIsEmpty) return { action: "adopt", teamId: incoming };
	return { action: "ask", teamId: incoming };
}

/**
 * Match counts for "Du har 1 match, Drive har 2, efter hopslagning 3": a
 * match both sides have counts once, because matches de-duplicate by id.
 */
export function previewMerge(local: TeamData, incoming: TeamData): MergeCounts {
	const ids = (data: TeamData) =>
		new Set(data.matches.map((m) => m.audit.matchId));
	const localIds = ids(local);
	const incomingIds = ids(incoming);
	return {
		local: localIds.size,
		incoming: incomingIds.size,
		merged: new Set([...localIds, ...incomingIds]).size,
	};
}
