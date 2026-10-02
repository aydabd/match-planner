import { parseTeamFolderName } from "./driveNames.js";
import { LIMITS } from "./limits.js";
import { type MatchFile, parseMatchFile } from "./matchFile.js";
import { type PlayerNotesFile, parsePlayerNotesFile } from "./playerNotes.js";
import { parseSecurePackage, type SecurePackage } from "./securePackage.js";
import { parseRosterFile, type RosterFile } from "./storage.js";

/**
 * What a chosen file is, decided from its contents and never from its name
 * (#154). Every kind goes through the parser that owns it, so a file is only
 * ever called a match, squad or notes file if the app would also accept it.
 */
export type FileKind = "match" | "squad" | "notes" | "package" | "unknown";
export type SkipReason = "tooLarge" | "tooMany" | "notJson" | "unrecognised";

/** `path` is the folder-relative path (or the bare name); it is only ever shown as text. */
export interface InputFile {
	path: string;
	text: string;
}

interface ClassifiedBase {
	path: string;
	/** From a `team-<uuid>` folder in the path; a hint only, contents decide. */
	teamIdHint: string | null;
}

/** A file the importer can use, with what it parsed to. */
export type Classified = ClassifiedBase &
	(
		| { kind: "match"; value: MatchFile }
		| { kind: "squad"; value: RosterFile }
		| { kind: "notes"; value: PlayerNotesFile }
		| { kind: "package"; value: SecurePackage }
	);

export interface Skipped {
	path: string;
	reason: SkipReason;
}

const encoder = new TextEncoder();

function teamIdHint(path: string): string | null {
	const folders = path.split("/").slice(0, -1);
	for (const folder of folders) {
		const id = parseTeamFolderName(folder);
		if (id !== null) return id;
	}
	return null;
}

function parsedAs(data: unknown): Pick<Classified, "kind" | "value"> | null {
	const attempts: [
		Classified["kind"],
		(data: unknown) => Classified["value"],
	][] = [
		["match", parseMatchFile],
		["squad", (d) => parseRosterFile(d)],
		["notes", parsePlayerNotesFile],
		["package", parseSecurePackage],
	];
	for (const [kind, parse] of attempts) {
		try {
			return { kind, value: parse(data) } as Pick<Classified, "kind" | "value">;
		} catch {
			// not this kind; try the next
		}
	}
	return null;
}

/**
 * Apply the caps to files known only by name and size, so a huge file or a
 * folder of hundreds is refused before any of it is read into memory.
 */
export function screenBySize<T extends { path: string; size: number }>(
	entries: readonly T[],
): { accepted: T[]; skipped: Skipped[] } {
	const accepted: T[] = [];
	const skipped: Skipped[] = [];
	let totalBytes = 0;
	for (const [index, entry] of entries.entries()) {
		let reason: SkipReason | null = null;
		if (index >= LIMITS.importFiles) reason = "tooMany";
		else if (entry.size > LIMITS.importFileBytes) reason = "tooLarge";
		else if (totalBytes + entry.size > LIMITS.importTotalBytes)
			reason = "tooMany";
		if (reason === null) {
			totalBytes += entry.size;
			accepted.push(entry);
		} else skipped.push({ path: entry.path, reason });
	}
	return { accepted, skipped };
}

/** Sort `files` into what the importer can use and what it skips, with a reason. */
export function classifyFiles(files: readonly InputFile[]): {
	files: Classified[];
	skipped: Skipped[];
} {
	const sized = files.map((file) => ({
		file,
		path: file.path,
		size: encoder.encode(file.text).length,
	}));
	const { accepted, skipped } = screenBySize(sized);
	const classified: Classified[] = [];
	for (const { file } of accepted) {
		let data: unknown;
		try {
			data = JSON.parse(file.text);
		} catch {
			skipped.push({ path: file.path, reason: "notJson" });
			continue;
		}
		const found = parsedAs(data);
		if (found === null) {
			skipped.push({ path: file.path, reason: "unrecognised" });
			continue;
		}
		classified.push({
			path: file.path,
			teamIdHint: teamIdHint(file.path),
			...found,
		} as Classified);
	}
	// In the order the files were given, whatever step skipped them.
	const position = new Map<string, number>();
	for (const [index, file] of files.entries()) {
		if (!position.has(file.path)) position.set(file.path, index);
	}
	skipped.sort(
		(x, y) => (position.get(x.path) ?? 0) - (position.get(y.path) ?? 0),
	);
	return { files: classified, skipped };
}
