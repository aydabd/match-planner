import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { driveFileName, teamMarkerName } from "../../src/core/driveNames.js";
import type { DrivePayload } from "../../src/core/drivePayload.js";
import {
	EMPTY_PLAYER_NOTES_FILE,
	withDevelopment,
} from "../../src/core/playerNotes.js";
import {
	encryptJson,
	securePackageToJson,
} from "../../src/core/securePackage.js";
import { newRoster } from "../../src/core/storage.js";
import { makeMatchFile, NAMES } from "../../tests/support/matchFiles.js";

/** One file of a generated folder: a path inside it and what it holds. */
export interface TreeFile {
	path: string;
	contents: string;
}

/** Write `files` below `dir`, so a test can hand the folder to a directory input. */
export async function writeTree(
	dir: string,
	files: readonly TreeFile[],
): Promise<string> {
	for (const file of files) {
		const target = join(dir, file.path);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, file.contents);
	}
	return dir;
}

const SQUAD = NAMES.slice(0, 9);

/** A plain match file, as the app saves one. */
export function plainMatch(matchId: string, seed: number): TreeFile {
	return {
		path: `${matchId}.json`,
		contents: JSON.stringify(
			makeMatchFile({
				matchId,
				seed,
				names: SQUAD,
				date: `2026-09-${String(seed).padStart(2, "0")}`,
			}),
		),
	};
}

/**
 * One team in the app's Drive layout, as the Data page should take it: a
 * `team-<id>/` folder holding the encrypted marker, `matches` matches, a
 * squad and a note, all under `password`. `root` is the folder's own name.
 */
export async function driveTeamFolder(options: {
	root: string;
	teamId: string;
	name: string;
	password: string;
	matches: number;
	firstSeed?: number;
}): Promise<TreeFile[]> {
	const { root, teamId, name, password } = options;
	const first = options.firstSeed ?? 1;
	const dir = `${root}/team-${teamId}`;
	const payloads: DrivePayload[] = [
		{ schemaVersion: 1, kind: "team", teamId, teamName: name },
		{
			schemaVersion: 1,
			kind: "squad",
			teamId,
			deviceId: "device-1",
			roster: newRoster({
				formatId: "7v7",
				players: SQUAD.map((n, i) => ({ id: `p${i + 1}`, name: n })),
			}),
		},
		{
			schemaVersion: 1,
			kind: "notes",
			teamId,
			deviceId: "device-1",
			playerNotes: withDevelopment(EMPTY_PLAYER_NOTES_FILE, "alva", {
				date: "2026-09-01",
				area: "physical",
				note: `Anteckning i ${name}`,
			}),
		},
		...Array.from(
			{ length: options.matches },
			(_, i): DrivePayload => ({
				schemaVersion: 1,
				kind: "match",
				teamId,
				match: makeMatchFile({
					matchId: `${name}-${first + i}`,
					seed: first + i,
					names: SQUAD,
					date: `2026-09-${String(first + i).padStart(2, "0")}`,
				}),
			}),
		),
	];
	return Promise.all(
		payloads.map(async (payload) => {
			const fileName =
				payload.kind === "team"
					? teamMarkerName(teamId)
					: await driveFileName(
							payload.kind,
							teamId,
							payload.kind === "match"
								? payload.match.audit.matchId
								: payload.deviceId,
						);
			return {
				path: `${dir}/${fileName}`,
				contents: securePackageToJson(await encryptJson(password, payload)),
			};
		}),
	);
}
