import { FORMATS } from "./formations.js";
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

const MAX_NAME_LENGTH = 40;
const MAX_PLAYERS = 30;

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

export function rosterToJson(roster: RosterFile): string {
	return JSON.stringify(roster, null, 2);
}

/**
 * Parse and STRICTLY validate a roster file coming from an unknown
 * source (a file another coach shares). Never trust shape or types -
 * this is the one place untrusted JSON enters the app, so every field
 * is checked before anything downstream (scheduler, DOM rendering) sees it.
 */
export function parseRosterFile(data: unknown): RosterFile {
	if (typeof data !== "object" || data === null) {
		throw new StorageError("Filen ar inte ett giltigt JSON-objekt.");
	}
	const obj = data as Record<string, unknown>;

	if (obj.schemaVersion !== 1) {
		throw new StorageError(
			`Okant eller saknat schemaVersion (forvantade 1, fick ${JSON.stringify(obj.schemaVersion)}).`,
		);
	}

	if (typeof obj.formatId !== "string" || !FORMATS[obj.formatId]) {
		throw new StorageError(
			`Okant formatId "${String(obj.formatId)}". Tillgangliga: ${Object.keys(FORMATS).join(", ")}.`,
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
	if (obj.players.length === 0) {
		throw new StorageError("Truppen ar tom.");
	}
	if (obj.players.length > MAX_PLAYERS) {
		throw new StorageError(`For manga spelare (max ${MAX_PLAYERS}).`);
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
		const name = p.name.trim().slice(0, MAX_NAME_LENGTH);
		return { id: p.id, name };
	});

	return {
		schemaVersion: 1,
		formatId: obj.formatId,
		rotationSeconds: obj.rotationSeconds,
		players,
	};
}
