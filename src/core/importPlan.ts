import { parseTeamFolderName } from "./driveNames.js";
import { LIMITS } from "./limits.js";
import { parseMatchFile } from "./matchFile.js";
import { parsePlayerNotesFile } from "./playerNotes.js";
import { parseSecurePackage } from "./securePackage.js";
import { parseRosterFile } from "./storage.js";

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

export interface Classified {
	path: string;
	kind: Exclude<FileKind, "unknown">;
	/** From a `team-<uuid>` folder in the path; a hint only, contents decide. */
	teamIdHint: string | null;
}

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

function kindOf(data: unknown): Classified["kind"] | null {
	const attempts: [Classified["kind"], (data: unknown) => unknown][] = [
		["match", parseMatchFile],
		["squad", (d) => parseRosterFile(d)],
		["notes", parsePlayerNotesFile],
		["package", parseSecurePackage],
	];
	for (const [kind, parse] of attempts) {
		try {
			parse(data);
			return kind;
		} catch {
			// not this kind; try the next
		}
	}
	return null;
}

/** Sort `files` into what the importer can use and what it skips, with a reason. */
export function classifyFiles(files: readonly InputFile[]): {
	files: Classified[];
	skipped: Skipped[];
} {
	const classified: Classified[] = [];
	const skipped: Skipped[] = [];
	let totalBytes = 0;
	for (const [index, file] of files.entries()) {
		const bytes = encoder.encode(file.text).length;
		let reason: SkipReason | null = null;
		if (index >= LIMITS.importFiles) reason = "tooMany";
		else if (bytes > LIMITS.importFileBytes) reason = "tooLarge";
		else if (totalBytes + bytes > LIMITS.importTotalBytes)
			reason = "tooMany";
		if (reason === null) {
			totalBytes += bytes;
			reason = classify(file, classified);
		}
		if (reason !== null) skipped.push({ path: file.path, reason });
	}
	return { files: classified, skipped };
}

/** Add `file` to `into` if its contents are a known kind; otherwise say why not. */
function classify(file: InputFile, into: Classified[]): SkipReason | null {
	let data: unknown;
	try {
		data = JSON.parse(file.text);
	} catch {
		return "notJson";
	}
	const kind = kindOf(data);
	if (kind === null) return "unrecognised";
	into.push({ path: file.path, kind, teamIdHint: teamIdHint(file.path) });
	return null;
}
