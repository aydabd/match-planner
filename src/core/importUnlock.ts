import { teamMarkerName } from "./driveNames.js";
import {
	type DrivePayload,
	DrivePayloadError,
	parseDrivePayload,
	payloadFileName,
} from "./drivePayload.js";
import {
	type ExportBundle,
	ExportBundleError,
	parseExportBundle,
} from "./exportBundle.js";
import {
	decryptJson,
	parseSecurePackage,
	type SecurePackage,
	SecurePackageError,
} from "./securePackage.js";

/** A package file handed to the unlock step: its text is an encrypted JSON file. */
export interface PackageFile {
	path: string;
	text: string;
	teamIdHint: string | null;
}

export type Opened =
	| { path: string; kind: "bundle"; bundle: ExportBundle }
	| { path: string; kind: "payload"; payload: DrivePayload };

export interface UnlockResult {
	/** Opened with this password. */
	opened: Opened[];
	/** This password does not open them (shown by id only: the name is encrypted). */
	locked: { path: string; teamIdHint: string | null }[];
	/** Opened but not valid: never hidden as "locked". */
	damaged: { path: string; reason: "invalidPayload" | "wrongName" }[];
}

type Attempt =
	| { outcome: "opened"; opened: Opened }
	| { outcome: "locked" }
	| { outcome: "damaged"; reason: "invalidPayload" | "wrongName" };

const baseName = (path: string): string =>
	path.slice(path.lastIndexOf("/") + 1);

/** Only a wrong password or an unreadable package counts as locked. */
function isLocked(err: unknown): boolean {
	return err instanceof SecurePackageError || err instanceof SyntaxError;
}

/** What was inside a package that opened: a Drive-format payload or an export bundle. */
async function parseOpened(file: PackageFile, data: unknown): Promise<Attempt> {
	const invalid: Attempt = { outcome: "damaged", reason: "invalidPayload" };
	const isPayload = typeof data === "object" && data !== null && "kind" in data;
	try {
		if (!isPayload) {
			const bundle = parseExportBundle(data);
			return {
				outcome: "opened",
				opened: { path: file.path, kind: "bundle", bundle },
			};
		}
		const payload = parseDrivePayload(data);
		if (file.teamIdHint !== null && payload.teamId !== file.teamIdHint) {
			return invalid;
		}
		if ((await payloadFileName(payload)) !== baseName(file.path)) {
			return { outcome: "damaged", reason: "wrongName" };
		}
		return {
			outcome: "opened",
			opened: { path: file.path, kind: "payload", payload },
		};
	} catch (err) {
		if (err instanceof DrivePayloadError || err instanceof ExportBundleError) {
			return invalid;
		}
		throw err;
	}
}

async function attempt(
	file: PackageFile,
	password: string,
	decrypt: typeof decryptJson,
): Promise<Attempt> {
	let data: unknown;
	try {
		const pkg: SecurePackage = parseSecurePackage(JSON.parse(file.text));
		data = await decrypt(password, pkg);
	} catch (err) {
		if (isLocked(err)) return { outcome: "locked" };
		throw err;
	}
	return parseOpened(file, data);
}

/**
 * Open encrypted files with one password (#154). A password opens only the
 * teams it matches: in a `team-<id>` folder the team marker is tried first,
 * and when it does not open, the folder's other files are listed as locked
 * without a key derivation each. Nothing here ever throws for a wrong
 * password; a file that opens but is not valid is `damaged`, never `locked`.
 */
export async function openPackages(
	files: readonly PackageFile[],
	password: string,
	onProgress?: (done: number, total: number) => void,
	decrypt: typeof decryptJson = decryptJson,
): Promise<UnlockResult> {
	const result: UnlockResult = { opened: [], locked: [], damaged: [] };
	const outcomes = new Map<string, Attempt>();
	const total = files.length;
	let done = 0;
	const step = () => onProgress?.(++done, total);

	// Markers first, so a locked team's other files never cost a derivation.
	const isMarker = (f: PackageFile) =>
		f.teamIdHint !== null && baseName(f.path) === teamMarkerName(f.teamIdHint);
	const ordered = [
		...files.filter(isMarker),
		...files.filter((f) => !isMarker(f)),
	];
	const lockedFolders = new Set<string>();
	for (const file of ordered) {
		const hint = file.teamIdHint;
		const inLockedFolder = hint !== null && lockedFolders.has(hint);
		let outcome: Attempt;
		if (inLockedFolder) {
			outcome = { outcome: "locked" };
		} else {
			outcome = await attempt(file, password, decrypt);
		}
		outcomes.set(file.path, outcome);
		if (hint !== null && isMarker(file) && outcome.outcome === "locked") {
			lockedFolders.add(hint);
		}
		step();
	}
	for (const file of files) {
		const outcome = outcomes.get(file.path) as Attempt;
		if (outcome.outcome === "opened") result.opened.push(outcome.opened);
		else if (outcome.outcome === "locked")
			result.locked.push({ path: file.path, teamIdHint: file.teamIdHint });
		else result.damaged.push({ path: file.path, reason: outcome.reason });
	}
	return result;
}
