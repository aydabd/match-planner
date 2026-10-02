import type { Classified } from "./importPlan.js";
import type { Opened } from "./importUnlock.js";
import type { PlayerNotesFile } from "./playerNotes.js";
import type { TeamData } from "./teamData.js";

/**
 * Everything the chosen files hold for one team (#154). `teamId` is null for
 * plain files and export bundles, which name no team and are merged into the
 * active one; the Drive-format files name theirs.
 */
export interface CollectedTeam {
	teamId: string | null;
	/** "" when the team's marker has no name, or the group has no team. */
	name: string;
	data: TeamData;
}

const emptyData = (): TeamData => ({ matches: [], notes: [], squads: [] });

/** Group plain files and what was opened by team, the team-less group first. */
export function collectTeams(
	plain: readonly Classified[],
	opened: readonly Opened[],
): CollectedTeam[] {
	const loose = emptyData();
	for (const file of plain) {
		if (file.kind === "match") loose.matches.push(file.value);
		else if (file.kind === "squad") loose.squads.push(file.value);
		else if (file.kind === "notes") loose.notes.push(file.value);
	}
	const named = new Map<string, CollectedTeam>();
	const team = (teamId: string): CollectedTeam => {
		let found = named.get(teamId);
		if (found === undefined) {
			found = { teamId, name: "", data: emptyData() };
			named.set(teamId, found);
		}
		return found;
	};
	for (const item of opened) {
		if (item.kind === "bundle") {
			loose.matches.push(...item.bundle.matches);
			loose.notes.push(item.bundle.playerNotes);
			if (item.bundle.roster && item.bundle.roster.players.length > 0) {
				loose.squads.push(item.bundle.roster);
			}
			continue;
		}
		const payload = item.payload;
		const group = team(payload.teamId);
		if (payload.kind === "match") group.data.matches.push(payload.match);
		else if (payload.kind === "notes") {
			group.data.notes.push(payload.playerNotes);
		} else if (payload.kind === "squad") group.data.squads.push(payload.roster);
		else group.name = payload.teamName ?? "";
	}
	const groups = [...named.values()].sort((x, y) =>
		(x.teamId ?? "") < (y.teamId ?? "") ? -1 : 1,
	);
	const hasLoose =
		loose.matches.length + loose.squads.length + countPlayers(loose.notes) > 0;
	return hasLoose
		? [{ teamId: null, name: "", data: loose }, ...groups]
		: groups;
}

function countPlayers(notes: readonly PlayerNotesFile[]): number {
	return new Set(notes.flatMap((file) => file.players.map((p) => p.key))).size;
}

/** What a team's data holds, for the summary shown before anything is applied. */
export function describeData(data: TeamData): {
	matches: number;
	squads: number;
	notePlayers: number;
} {
	return {
		matches: new Set(data.matches.map((m) => m.audit.matchId)).size,
		squads: data.squads.length,
		notePlayers: countPlayers(data.notes),
	};
}
