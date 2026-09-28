import type { SeasonHistory } from "./history.js";
import { nameKey } from "./history.js";
import { LIMITS } from "./limits.js";

/**
 * What the match timeline cannot see (#58): availability, injury and
 * development, coach-entered rather than computed. Kept as its own file,
 * one player per key (see history.ts's nameKey - the same recognition rule,
 * so a player's notes and their season history always mean the same
 * person), same strict-parsing discipline as squad and match files.
 *
 * This module only holds data and blind-spot flags derived from it and from
 * SeasonHistory - no scoring, no ranking between players. A flag here is a
 * prompt for the coach to look, never a judgement about the player.
 */

export type AvailabilityStatus = "available" | "absent";
export type AbsenceReason = "injury" | "illness" | "other";
export type DevelopmentArea = "physical" | "mental" | "technical" | "tactical";

/** One match's (or session's) availability for one player. */
export interface AvailabilityEntry {
	matchId: string;
	status: AvailabilityStatus;
	/** Only meaningful when status is "absent". */
	reason?: AbsenceReason;
	note?: string;
}

export interface DevelopmentEntry {
	/** "YYYY-MM-DD". */
	date: string;
	area: DevelopmentArea;
	note: string;
}

export interface PlayerNotes {
	/** Same recognition rule as PlayerHistory.key (history.ts's nameKey). */
	key: string;
	/** At most one entry per matchId; recording again replaces it. */
	availability: AvailabilityEntry[];
	/** Newest last; capped at LIMITS.developmentNotesPerPlayer. */
	development: DevelopmentEntry[];
}

export interface PlayerNotesFile {
	schemaVersion: 1;
	players: PlayerNotes[];
}

export const EMPTY_PLAYER_NOTES_FILE: PlayerNotesFile = {
	schemaVersion: 1,
	players: [],
};

export type PlayerNotesProblem =
	| { code: "notObject" }
	| { code: "schemaVersion" }
	| { code: "players" }
	| { code: "availability" }
	| { code: "development" };

export class PlayerNotesError extends Error {
	constructor(
		message: string,
		readonly problem: PlayerNotesProblem,
	) {
		super(message);
		this.name = "PlayerNotesError";
	}
}

export function playerNotesFileToJson(file: PlayerNotesFile): string {
	return JSON.stringify(file, null, 2);
}

const AVAILABILITY_STATUSES: readonly AvailabilityStatus[] = [
	"available",
	"absent",
];
const ABSENCE_REASONS: readonly AbsenceReason[] = [
	"injury",
	"illness",
	"other",
];
const DEVELOPMENT_AREAS: readonly DevelopmentArea[] = [
	"physical",
	"mental",
	"technical",
	"tactical",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

// Same strict format as storage.ts's isValidDate/DATE, minus the optional
// time and the empty-string case (a development note's date is required).
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (value: string): boolean =>
	DATE.test(value) && !Number.isNaN(Date.parse(value));

const note = (value: unknown): string | undefined => {
	if (value === undefined) return undefined;
	if (typeof value !== "string") throw new Error("not a string");
	return value.trim().slice(0, LIMITS.playerNoteLength);
};

function parseAvailability(raw: unknown): AvailabilityEntry {
	const fail = () =>
		new PlayerNotesError("Invalid availability entry", {
			code: "availability",
		});
	if (!isRecord(raw)) throw fail();
	if (typeof raw.matchId !== "string" || raw.matchId === "") throw fail();
	if (!AVAILABILITY_STATUSES.includes(raw.status as AvailabilityStatus))
		throw fail();
	if (
		raw.reason !== undefined &&
		!ABSENCE_REASONS.includes(raw.reason as AbsenceReason)
	) {
		throw fail();
	}
	let noteText: string | undefined;
	try {
		noteText = note(raw.note);
	} catch {
		throw fail();
	}
	const entry: AvailabilityEntry = {
		matchId: raw.matchId,
		status: raw.status as AvailabilityStatus,
	};
	if (raw.reason !== undefined) entry.reason = raw.reason as AbsenceReason;
	if (noteText !== undefined) entry.note = noteText;
	return entry;
}

function parseDevelopment(raw: unknown): DevelopmentEntry {
	const fail = () =>
		new PlayerNotesError("Invalid development entry", {
			code: "development",
		});
	if (!isRecord(raw)) throw fail();
	if (typeof raw.date !== "string" || !isValidDate(raw.date)) {
		throw fail();
	}
	if (!DEVELOPMENT_AREAS.includes(raw.area as DevelopmentArea)) throw fail();
	if (typeof raw.note !== "string") throw fail();
	return {
		date: raw.date,
		area: raw.area as DevelopmentArea,
		note: raw.note.trim().slice(0, LIMITS.playerNoteLength),
	};
}

function parsePlayerNotes(raw: unknown): PlayerNotes {
	const fail = () =>
		new PlayerNotesError("Invalid player notes entry", { code: "players" });
	if (!isRecord(raw)) throw fail();
	if (typeof raw.key !== "string" || raw.key === "") throw fail();
	if (!Array.isArray(raw.availability) || !Array.isArray(raw.development)) {
		throw fail();
	}
	return {
		key: raw.key,
		availability: raw.availability.map(parseAvailability),
		development: raw.development.map(parseDevelopment),
	};
}

/**
 * Parse and strictly validate a player-notes file: never trust its shape,
 * same discipline as parseRosterFile/parseMatchFile.
 */
export function parsePlayerNotesFile(data: unknown): PlayerNotesFile {
	if (!isRecord(data)) {
		throw new PlayerNotesError("Player notes file is not a JSON object", {
			code: "notObject",
		});
	}
	if (data.schemaVersion !== 1) {
		throw new PlayerNotesError(
			`Unknown or missing schemaVersion (expected 1, got ${JSON.stringify(data.schemaVersion)})`,
			{ code: "schemaVersion" },
		);
	}
	if (!Array.isArray(data.players)) {
		throw new PlayerNotesError("players must be a list", {
			code: "players",
		});
	}
	return { schemaVersion: 1, players: data.players.map(parsePlayerNotes) };
}

function notesOf(file: PlayerNotesFile, key: string): PlayerNotes {
	return (
		file.players.find((p) => p.key === key) ?? {
			key,
			availability: [],
			development: [],
		}
	);
}

function withPlayerNotes(
	file: PlayerNotesFile,
	key: string,
	notes: PlayerNotes,
): PlayerNotesFile {
	return {
		schemaVersion: 1,
		players: [...file.players.filter((p) => p.key !== key), notes],
	};
}

/**
 * Record one match's availability for a player, given by name (normalised
 * with history.ts's nameKey, so it always matches that player's
 * PlayerHistory.key). Recording again for the same matchId replaces that
 * entry. The file given is left unchanged.
 */
export function withAvailability(
	file: PlayerNotesFile,
	name: string,
	entry: AvailabilityEntry,
): PlayerNotesFile {
	const key = nameKey(name);
	const current = notesOf(file, key);
	const trimmed: AvailabilityEntry = { ...entry };
	if (trimmed.note !== undefined) {
		trimmed.note = trimmed.note.trim().slice(0, LIMITS.playerNoteLength);
	}
	const availability = [
		...current.availability.filter((a) => a.matchId !== entry.matchId),
		trimmed,
	];
	return withPlayerNotes(file, key, { ...current, availability });
}

/**
 * Add a development note for a player, given by name (normalised with
 * history.ts's nameKey). Only the newest LIMITS.developmentNotesPerPlayer
 * are kept; the file given is left unchanged.
 */
export function withDevelopment(
	file: PlayerNotesFile,
	name: string,
	entry: DevelopmentEntry,
): PlayerNotesFile {
	const key = nameKey(name);
	const current = notesOf(file, key);
	const trimmed: DevelopmentEntry = {
		...entry,
		note: entry.note.trim().slice(0, LIMITS.playerNoteLength),
	};
	const development = [...current.development, trimmed].slice(
		-LIMITS.developmentNotesPerPlayer,
	);
	return withPlayerNotes(file, key, { ...current, development });
}

/** A finding for the coach; src/ui/text.ts turns it into a sentence. */
export type SeasonFeedback =
	| { code: "unexplainedAbsences"; playerId: string; count: number }
	| { code: "noDevelopmentNotes"; playerId: string; squadMatches: number };

/**
 * Blind-spot flags (#58): prompts to look, never judgements about the
 * player. An unexplained absence is one logged as absent with no reason
 * given; a development gap is a player who has been in the squad for at
 * least LIMITS.recentMatches matches with no development note at all.
 */
export function seasonFeedback(
	history: SeasonHistory,
	file: PlayerNotesFile,
): SeasonFeedback[] {
	const feedback: SeasonFeedback[] = [];
	for (const player of history.players) {
		const notes = file.players.find((p) => p.key === player.key);
		const unexplained =
			notes?.availability.filter(
				(a) => a.status === "absent" && a.reason === undefined,
			).length ?? 0;
		if (unexplained > 0) {
			feedback.push({
				code: "unexplainedAbsences",
				playerId: player.key,
				count: unexplained,
			});
		}
		if (
			player.squadMatches >= LIMITS.recentMatches &&
			(notes?.development.length ?? 0) === 0
		) {
			feedback.push({
				code: "noDevelopmentNotes",
				playerId: player.key,
				squadMatches: player.squadMatches,
			});
		}
	}
	return feedback;
}
