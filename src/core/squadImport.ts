import { classifyFiles, type InputFile } from "./importPlan.js";
import { openPackages, type PackageFile } from "./importUnlock.js";
import {
	parseRosterFile,
	type RosterFile,
	type SquadFileProblem,
	StorageError,
} from "./storage.js";

/**
 * "Hämta trupp" on the start page (#154): the same content-based importer as
 * the Data page, asked only for a squad. A squad file gives it directly, an
 * encrypted export or Drive squad file gives it once opened with a password;
 * everything else says why it has none.
 */
export type SquadFromFile =
	| { kind: "squad"; roster: RosterFile }
	| { kind: "needsPassword" }
	/** A match file, notes file or similar: valid, but no squad in it. */
	| { kind: "noSquad" }
	| { kind: "refused"; problem: SquadFileProblem | "unreadable" | "tooLarge" };

const GENERIC: ReadonlySet<string> = new Set([
	"notObject",
	"schemaVersion",
	"playersNotList",
]);

export function readSquadFile(file: InputFile): SquadFromFile {
	const { files, skipped } = classifyFiles([file]);
	const found = files[0];
	if (found !== undefined) {
		if (found.kind === "squad") return { kind: "squad", roster: found.value };
		if (found.kind === "package") return { kind: "needsPassword" };
		return { kind: "noSquad" };
	}
	if (skipped[0]?.reason === "tooLarge") {
		return { kind: "refused", problem: "tooLarge" };
	}
	if (skipped[0]?.reason === "unrecognised") {
		// A file that is meant to be a squad says what is wrong with it.
		try {
			parseRosterFile(JSON.parse(file.text));
		} catch (err) {
			// "Not an object", a wrong version and the like are just "not a squad
			// file"; the other problems say what is wrong with a squad file.
			if (err instanceof StorageError && !GENERIC.has(err.problem.code)) {
				return { kind: "refused", problem: err.problem };
			}
		}
	}
	return { kind: "refused", problem: "unreadable" };
}

/** The squad in an encrypted file, opened with `password`. */
export async function squadFromPackage(
	file: PackageFile,
	password: string,
): Promise<
	| { kind: "squad"; roster: RosterFile }
	| { kind: "noSquad" }
	| { kind: "locked" }
	| { kind: "damaged" }
> {
	const result = await openPackages([file], password);
	const opened = result.opened[0];
	if (opened === undefined) {
		return result.damaged.length > 0 ? { kind: "damaged" } : { kind: "locked" };
	}
	const roster =
		opened.kind === "bundle"
			? opened.bundle.roster
			: opened.payload.kind === "squad"
				? opened.payload.roster
				: null;
	return roster !== null && roster.players.length > 0
		? { kind: "squad", roster }
		: { kind: "noSquad" };
}
