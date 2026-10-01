/**
 * A team/squad is a data boundary (#118): a coach running more than one team
 * from the same device or Drive account must never have their matches,
 * player notes or Drive backups mixed together. This module only holds the
 * list of teams and which one is active - appStorage.ts's teamScoped() is
 * what actually keeps every team's data apart, by suffixing each storage key
 * with the active team's id.
 */

import { LIMITS } from "./limits.js";

export interface Team {
	id: string;
	name: string;
}

export interface TeamsFile {
	schemaVersion: 1;
	teams: Team[];
	activeTeamId: string | null;
}

export const EMPTY_TEAMS_FILE: TeamsFile = {
	schemaVersion: 1,
	teams: [],
	activeTeamId: null,
};

export type TeamsProblem =
	| { code: "notObject" }
	| { code: "schemaVersion" }
	| { code: "teams" }
	| { code: "activeTeamId" };

export class TeamsError extends Error {
	constructor(
		message: string,
		readonly problem: TeamsProblem,
	) {
		super(message);
		this.name = "TeamsError";
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Trimmed and capped at LIMITS.teamNameLength, same discipline as a player note. */
function sanitizedName(name: string): string {
	return name.trim().slice(0, LIMITS.teamNameLength);
}

function parseTeam(raw: unknown): Team {
	const fail = () => new TeamsError("Invalid team entry", { code: "teams" });
	if (!isRecord(raw)) throw fail();
	if (typeof raw.id !== "string" || raw.id === "") throw fail();
	if (typeof raw.name !== "string" || raw.name === "") throw fail();
	return { id: raw.id, name: raw.name };
}

/** Parse and strictly validate a teams file: never trust its shape. */
export function parseTeamsFile(data: unknown): TeamsFile {
	if (!isRecord(data)) {
		throw new TeamsError("Teams file is not a JSON object", {
			code: "notObject",
		});
	}
	if (data.schemaVersion !== 1) {
		throw new TeamsError(
			`Unknown or missing schemaVersion (expected 1, got ${JSON.stringify(data.schemaVersion)})`,
			{ code: "schemaVersion" },
		);
	}
	if (!Array.isArray(data.teams)) {
		throw new TeamsError("teams must be a list", { code: "teams" });
	}
	const teams = data.teams.map(parseTeam);
	if (data.activeTeamId !== null && typeof data.activeTeamId !== "string") {
		throw new TeamsError("activeTeamId must be a string or null", {
			code: "activeTeamId",
		});
	}
	return { schemaVersion: 1, teams, activeTeamId: data.activeTeamId };
}

export function teamsFileToJson(file: TeamsFile): string {
	return JSON.stringify(file, null, 2);
}

/** Add `team`, or replace it if a team with the same id already exists. */
export function withTeam(file: TeamsFile, team: Team): TeamsFile {
	const sanitized: Team = { id: team.id, name: sanitizedName(team.name) };
	return {
		schemaVersion: 1,
		teams: [...file.teams.filter((t) => t.id !== team.id), sanitized],
		activeTeamId: file.activeTeamId,
	};
}

/**
 * Make `teamId` the active team. A no-op on the team list itself: switching
 * teams never touches any team's data, only which one future reads/writes
 * through appStorage.ts's teamScoped() land on.
 */
export function withActiveTeam(file: TeamsFile, teamId: string): TeamsFile {
	return { schemaVersion: 1, teams: file.teams, activeTeamId: teamId };
}

/** Rename the team with id `teamId`. A no-op if no team has that id. */
export function withRenamedTeam(
	file: TeamsFile,
	teamId: string,
	name: string,
): TeamsFile {
	return {
		schemaVersion: 1,
		teams: file.teams.map((t) =>
			t.id === teamId ? { ...t, name: sanitizedName(name) } : t,
		),
		activeTeamId: file.activeTeamId,
	};
}
