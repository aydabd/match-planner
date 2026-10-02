import { uuidv5Raw } from "./securePackage.js";

/**
 * Names of the files this app keeps in a Google Drive folder (#135). Every
 * name is a fixed prefix for the kind of file, then a UUIDv5, then ".json":
 *
 *   match-<uuid5(team id, "match:<matchId>")>.json   one per match, written once
 *   notes-<uuid5(team id, "notes:<deviceId>")>.json  one per device, its own notes
 *   squad-<uuid5(team id, "squad:<deviceId>")>.json  one per device, its own squad
 *   team-<team id>.json                              which team the folder holds
 *
 * UUIDv5 is a pure function of its inputs, so the namespace has to be
 * something unique to the team. It is the team's own random id - never
 * anything two coaches could share, like the team's name - so the same
 * match id in two teams gives two different names, and a team can never
 * pick up another team's files by name. Names carry only ids: no player,
 * opponent or team name appears outside an encrypted payload.
 */
export type DriveFileKind = "match" | "notes" | "squad";

const KINDS: readonly DriveFileKind[] = ["match", "notes", "squad"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID_V5 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SUFFIX = ".json";

/** The Drive file name for `key` (a match id or a device id) in `teamId`. */
export async function driveFileName(
	kind: DriveFileKind,
	teamId: string,
	key: string,
): Promise<string> {
	if (!UUID.test(teamId)) {
		throw new Error("Team id is not a UUID, so it cannot be a namespace");
	}
	return `${kind}-${await uuidv5Raw(`${kind}:${key}`, teamId)}${SUFFIX}`;
}

/** The name of the marker file that says which team a folder holds. */
export function teamMarkerName(teamId: string): string {
	return `team-${teamId}${SUFFIX}`;
}

/**
 * The name of the subfolder that holds one team's files inside the coach's
 * root Drive folder (#142): ids only, and no ".json", so it can never be
 * mistaken for the marker file of the same team.
 */
export function teamFolderName(teamId: string): string {
	return `team-${teamId}`;
}

/** The team id a subfolder name stands for, or null for any other folder. */
export function parseTeamFolderName(name: string): string | null {
	if (!name.startsWith("team-")) return null;
	const id = name.slice("team-".length);
	return UUID.test(id) ? id : null;
}

export type ParsedDriveFileName =
	| { kind: DriveFileKind; id: string }
	| { kind: "team"; id: string };

/** What a file name is, or null if this app did not write it. */
export function parseDriveFileName(name: string): ParsedDriveFileName | null {
	if (!name.endsWith(SUFFIX)) return null;
	const stem = name.slice(0, -SUFFIX.length);
	if (stem.startsWith("team-")) {
		const id = stem.slice("team-".length);
		return UUID.test(id) ? { kind: "team", id } : null;
	}
	for (const kind of KINDS) {
		if (!stem.startsWith(`${kind}-`)) continue;
		const id = stem.slice(kind.length + 1);
		return UUID_V5.test(id) ? { kind, id } : null;
	}
	return null;
}
