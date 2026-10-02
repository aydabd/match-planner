import {
	EMPTY_TEAMS_FILE,
	parseTeamsFile,
	type Team,
	type TeamsFile,
	teamsFileToJson,
	withActiveTeam,
	withRenamedTeam,
	withTeam,
	withTeamIdChanged,
} from "../core/teams.js";
import {
	moveTeamScopedData,
	readItem,
	STORAGE_KEYS,
	writeItem,
} from "./appStorage.js";

const DEFAULT_TEAM_NAME = "Mitt lag";

/** A new id for a team; unique across devices so teams never clash. */
function newTeamId(): string {
	return (
		globalThis.crypto?.randomUUID?.() ??
		`t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
	);
}

function loadTeamsFile(): TeamsFile {
	const raw = readItem(STORAGE_KEYS.teams);
	if (!raw) return EMPTY_TEAMS_FILE;
	try {
		return parseTeamsFile(JSON.parse(raw));
	} catch {
		return EMPTY_TEAMS_FILE;
	}
}

function saveTeamsFile(file: TeamsFile): void {
	writeItem(STORAGE_KEYS.teams, teamsFileToJson(file));
}

/**
 * Every team the coach has. Creates one default team, silently, the first
 * time this is called with none saved yet - a coach who has never heard of
 * teams still lands somewhere.
 */
export function listTeams(): Team[] {
	return ensureDefaultTeam().teams;
}

/** The id of the team currently being worked on. Never null once a team exists. */
export function activeTeamId(): string {
	const id = ensureDefaultTeam().activeTeamId;
	if (id === null) {
		throw new Error("No active team after ensureDefaultTeam()");
	}
	return id;
}

function ensureDefaultTeam(): TeamsFile {
	const file = loadTeamsFile();
	if (file.teams.length > 0 && file.activeTeamId !== null) return file;
	const team: Team = { id: newTeamId(), name: DEFAULT_TEAM_NAME };
	const withDefault = withActiveTeam(withTeam(file, team), team.id);
	saveTeamsFile(withDefault);
	return withDefault;
}

/** Create a new team, make it the active one, and return it. */
export function createTeam(name: string): Team {
	const team: Team = { id: newTeamId(), name };
	saveTeamsFile(withActiveTeam(withTeam(loadTeamsFile(), team), team.id));
	return team;
}

/**
 * Create a team with a given id (the id of files being imported, #154) and
 * make it the active one. Throws, changing nothing, if a team already has
 * that id, so two teams can never share one.
 */
export function createTeamWithId(id: string, name: string): Team {
	const file = ensureDefaultTeam();
	if (file.teams.some((t) => t.id === id)) {
		throw new Error("A team with this id already exists");
	}
	const team: Team = { id, name };
	saveTeamsFile(withActiveTeam(withTeam(file, team), id));
	return team;
}

/** Make `teamId` the active team. A no-op if no team has that id. */
export function switchTeam(teamId: string): void {
	const file = ensureDefaultTeam();
	if (!file.teams.some((t) => t.id === teamId)) return;
	saveTeamsFile(withActiveTeam(file, teamId));
}

export function renameTeam(teamId: string, name: string): void {
	saveTeamsFile(withRenamedTeam(ensureDefaultTeam(), teamId, name));
}

/** The name of the active team. */
export function activeTeamName(): string {
	const file = ensureDefaultTeam();
	return file.teams.find((t) => t.id === file.activeTeamId)?.name ?? "";
}

/** The ids of every team except the active one. */
export function otherTeamIds(): string[] {
	const file = ensureDefaultTeam();
	return file.teams.map((t) => t.id).filter((id) => id !== file.activeTeamId);
}

/**
 * Give the active team the id `newId` and move its saved data to it (#135:
 * a device taking on the team id a Drive folder belongs to, so both
 * compute the same file names), and its name when one is given (#142).
 * Returns false, changing nothing, if
 * another team on this device already has that id.
 */
export function adoptTeamId(newId: string, name?: string): boolean {
	const file = ensureDefaultTeam();
	const oldId = activeTeamId();
	if (newId === oldId) return true;
	let changed: TeamsFile;
	try {
		changed = withTeamIdChanged(file, oldId, newId, name);
	} catch {
		return false;
	}
	moveTeamScopedData(oldId, newId);
	saveTeamsFile(changed);
	return true;
}
