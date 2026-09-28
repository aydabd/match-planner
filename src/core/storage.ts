import { getFormat } from "./formations.js";
import { LIMITS } from "./limits.js";
import type { Player } from "./types.js";

/** Bump this and add a migration branch in parseRosterFile if the shape ever changes. */
export const CURRENT_SCHEMA_VERSION = 1;

export interface RosterFile {
	schemaVersion: 1;
	formatId: string;
	rotationSeconds: number;
	players: Player[];
}

export class StorageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StorageError";
	}
}

export function serializeRoster(
	formatId: string,
	rotationSeconds: number,
	players: readonly Player[],
): RosterFile {
	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		formatId,
		rotationSeconds,
		players: players.map((p) => ({ id: p.id, name: p.name })),
	};
}

/** The normalised id for a format id (e.g. "7v7" -> "7v7:2-3-1"), or null if unknown. */
function canonicalFormatId(formatId: string): string | null {
	try {
		return getFormat(formatId).id;
	} catch {
		return null;
	}
}

export function rosterToJson(roster: RosterFile): string {
	return JSON.stringify(roster, null, 2);
}

/**
 * The file a coach saves to share the whole team setup (team size,
 * formation, minutes between swaps and names) with another coach. Always
 * written with the normalised format id, named e.g. trupp-9v9-3-3-2.json.
 */
export function squadFile(roster: RosterFile): {
	fileName: string;
	json: string;
} {
	const formatId = canonicalFormatId(roster.formatId) ?? roster.formatId;
	return {
		fileName: `trupp-${formatId.replace(":", "-")}.json`,
		json: rosterToJson({ ...roster, formatId }),
	};
}

/**
 * Parse and STRICTLY validate a roster file coming from an unknown
 * source (a file another coach shares). Never trust shape or types -
 * this is the one place untrusted JSON enters the app, so every field
 * is checked before anything downstream (scheduler, DOM rendering) sees it.
 */
export interface ParseOptions {
	/**
	 * The setup screen's own draft may have no players yet; a squad file
	 * someone shares must not.
	 */
	allowEmptySquad?: boolean;
}

export function parseRosterFile(
	data: unknown,
	options: ParseOptions = {},
): RosterFile {
	if (typeof data !== "object" || data === null) {
		throw new StorageError("Filen ar inte ett giltigt JSON-objekt.");
	}
	const obj = data as Record<string, unknown>;

	if (obj.schemaVersion !== 1) {
		throw new StorageError(
			`Okant eller saknat schemaVersion (forvantade 1, fick ${JSON.stringify(obj.schemaVersion)}).`,
		);
	}

	const formatId =
		typeof obj.formatId === "string" ? canonicalFormatId(obj.formatId) : null;
	if (formatId === null) {
		throw new StorageError(
			`Okänt formatId "${String(obj.formatId)}". Använd lagstorlek och formation, till exempel 7v7:2-3-1.`,
		);
	}

	if (
		typeof obj.rotationSeconds !== "number" ||
		!Number.isFinite(obj.rotationSeconds) ||
		obj.rotationSeconds <= 0
	) {
		throw new StorageError("rotationSeconds maste vara ett positivt tal.");
	}

	if (!Array.isArray(obj.players)) {
		throw new StorageError("players maste vara en lista.");
	}
	if (obj.players.length === 0 && !options.allowEmptySquad) {
		throw new StorageError("Truppen ar tom.");
	}
	if (obj.players.length > LIMITS.squadSize) {
		throw new StorageError(`For manga spelare (max ${LIMITS.squadSize}).`);
	}

	const seenIds = new Set<string>();
	const players: Player[] = obj.players.map((raw, index) => {
		if (typeof raw !== "object" || raw === null) {
			throw new StorageError(
				`Spelare pa index ${index} ar inte ett giltigt objekt.`,
			);
		}
		const p = raw as Record<string, unknown>;
		if (typeof p.id !== "string" || p.id.trim() === "") {
			throw new StorageError(`Spelare pa index ${index} saknar giltigt id.`);
		}
		if (typeof p.name !== "string" || p.name.trim() === "") {
			throw new StorageError(`Spelare pa index ${index} saknar giltigt namn.`);
		}
		if (seenIds.has(p.id)) {
			throw new StorageError(`Dubblett-id "${p.id}" i truppen.`);
		}
		seenIds.add(p.id);
		const name = p.name.trim().slice(0, LIMITS.playerNameLength);
		return { id: p.id, name };
	});

	return {
		schemaVersion: 1,
		formatId,
		rotationSeconds: obj.rotationSeconds,
		players,
	};
}
