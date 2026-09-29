import { type MatchFile, parseMatchFile } from "./matchFile.js";
import {
	EMPTY_PLAYER_NOTES_FILE,
	type PlayerNotesFile,
	parsePlayerNotesFile,
} from "./playerNotes.js";
import { parseRosterFile, type RosterFile } from "./storage.js";

/**
 * Everything a coach keeps locally, as one bundle a single password
 * protects end to end (#81): the roster draft (squad setup), every match
 * file kept on this device, and player notes. The bundle itself is
 * encrypted with securePackage.ts's encryptJson before it ever leaves the
 * device - no separate "id to name" handling is needed inside it, since
 * once decrypted the whole thing is trusted the same way any of its parts
 * already is (a match file already carries both a player's id and name).
 */
export const EXPORT_BUNDLE_VERSION = 1;

export interface ExportBundle {
	schemaVersion: 1;
	/** null if the coach has not set up a squad yet. */
	roster: RosterFile | null;
	matches: MatchFile[];
	playerNotes: PlayerNotesFile;
}

/** Why a bundle was refused; src/ui/text.ts turns it into a Swedish sentence. */
export type ExportBundleProblem =
	| { code: "notObject" }
	| { code: "schemaVersion" }
	| { code: "roster" }
	| { code: "matches" }
	| { code: "playerNotes" };

export class ExportBundleError extends Error {
	constructor(
		message: string,
		readonly problem: ExportBundleProblem,
	) {
		super(message);
		this.name = "ExportBundleError";
	}
}

/**
 * Parse and strictly validate a bundle read back from an import: each
 * piece is checked by its own existing parser
 * (parseRosterFile/parseMatchFile/parsePlayerNotesFile), never trusted on
 * its own, same discipline as every other file format here.
 */
export function parseExportBundle(raw: unknown): ExportBundle {
	if (typeof raw !== "object" || raw === null) {
		throw new ExportBundleError("Bundle is not a JSON object", {
			code: "notObject",
		});
	}
	const obj = raw as Record<string, unknown>;
	if (obj.schemaVersion !== EXPORT_BUNDLE_VERSION) {
		throw new ExportBundleError(
			`Unknown or missing schemaVersion (expected ${EXPORT_BUNDLE_VERSION}, got ${JSON.stringify(obj.schemaVersion)})`,
			{ code: "schemaVersion" },
		);
	}

	let roster: RosterFile | null = null;
	if (obj.roster !== null) {
		try {
			roster = parseRosterFile(obj.roster, { allowEmptySquad: true });
		} catch {
			throw new ExportBundleError("roster is not a valid squad file", {
				code: "roster",
			});
		}
	}

	if (!Array.isArray(obj.matches)) {
		throw new ExportBundleError("matches must be an array", {
			code: "matches",
		});
	}
	const matches: MatchFile[] = [];
	for (const rawMatch of obj.matches) {
		try {
			matches.push(parseMatchFile(rawMatch));
		} catch {
			throw new ExportBundleError("matches contains an invalid match file", {
				code: "matches",
			});
		}
	}

	let playerNotes: PlayerNotesFile = EMPTY_PLAYER_NOTES_FILE;
	try {
		playerNotes = parsePlayerNotesFile(obj.playerNotes);
	} catch {
		throw new ExportBundleError("playerNotes is not a valid notes file", {
			code: "playerNotes",
		});
	}

	return { schemaVersion: EXPORT_BUNDLE_VERSION, roster, matches, playerNotes };
}
