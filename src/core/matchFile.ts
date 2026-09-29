import { getFormat } from "./formations.js";
import { LIMITS } from "./limits.js";
import {
	isWholeMinutesWithin,
	type MatchDetails,
	parseAudit,
	parseMatchDetails,
	parsePlayers,
	StorageError,
} from "./storage.js";
import type { TimelineEvent } from "./timeline.js";
import type { Player } from "./types.js";

/**
 * The match file (#38): one file per played match, with who made it and when,
 * how the match was set up, the squad and the full timeline. The season
 * history is computed from these files alone. Every statistic comes from the
 * timelines, so nothing is stored twice and totals cannot drift.
 */
export const MATCH_FILE_VERSION = 1;

/** Who saved a match file, when and with which app version. */
export interface MatchAudit {
	/** Identifies the match: importing the same id twice counts once. */
	matchId: string;
	/** ISO 8601 timestamp. */
	createdAt: string;
	/** The coach's name as typed in the app ("" if not given). */
	createdBy: string;
	appVersion: string;
}

export interface MatchSetup {
	formatId: string;
	periods: number;
	periodSeconds: number;
	rotationSeconds: number;
}

export interface MatchFile {
	schemaVersion: 1;
	audit: MatchAudit;
	match: MatchDetails;
	setup: MatchSetup;
	squad: {
		/** Everyone in the squad at the end, late arrivals included. */
		players: Player[];
		/** Who was on the pitch or in goal at kickoff. */
		startingIds: string[];
	};
	timeline: TimelineEvent[];
	/** The match clock when the file was made, in seconds since kickoff. */
	endedAt: number;
}

/** Why a match file was refused; src/ui/text.ts turns it into a sentence. */
export type MatchFileProblem =
	| { code: "notObject" }
	| { code: "schemaVersion" }
	| { code: "audit" }
	| { code: "matchDetails" }
	| { code: "setup" }
	| { code: "squad" }
	| { code: "startingIds" }
	| { code: "noKickoff" }
	| { code: "endedAt" }
	| { code: "timelineNotList" }
	| { code: "tooManyEvents"; max: number }
	| {
			code: "event";
			/** 1-based position in the timeline. */
			position: number;
			reason: "unknown" | "time" | "order" | "period" | "player" | "lineup";
	  };

export class MatchFileError extends Error {
	constructor(
		message: string,
		readonly problem: MatchFileProblem,
	) {
		super(message);
		this.name = "MatchFileError";
	}
}

/** Assemble the file for a played match; who started comes from the timeline. */
export function newMatchFile(fields: {
	audit: MatchAudit;
	match: MatchDetails;
	setup: MatchSetup;
	players: readonly Player[];
	timeline: readonly TimelineEvent[];
	endedAt: number;
}): MatchFile {
	return {
		schemaVersion: MATCH_FILE_VERSION,
		audit: fields.audit,
		match: fields.match,
		setup: fields.setup,
		squad: {
			players: fields.players.map((p) => ({ ...p })),
			startingIds: startersOf(fields.timeline),
		},
		timeline: structuredClone(fields.timeline) as TimelineEvent[],
		endedAt: fields.endedAt,
	};
}

export function matchFileToJson(file: MatchFile): string {
	return JSON.stringify(file, null, 2);
}

/** e.g. match-2026-09-05-ifk.json; the date is the match date or save date. */
export function matchFileName(file: MatchFile): string {
	const date = (file.match.date || file.audit.createdAt).slice(0, 10);
	const opponent = file.match.opponent
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
	return `match-${date}${opponent ? `-${opponent}` : ""}.json`;
}

/** Who was in the first lineup, keeper included. */
export function startersOf(timeline: readonly TimelineEvent[]): string[] {
	const first = timeline.find((e) => e.type === "lineup");
	if (first?.type !== "lineup") return [];
	const ids = new Set(Object.values(first.zones).flat());
	if (first.keeperId !== null) ids.add(first.keeperId);
	return [...ids];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isSeconds = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value) && value >= 0;

function fail(problem: MatchFileProblem, message: string): never {
	throw new MatchFileError(message, problem);
}

/** The audit record of a match file: the squad file audit plus the match id. */
function parseMatchAudit(raw: unknown): MatchAudit {
	const problem = { code: "audit" } as const;
	if (!isRecord(raw) || typeof raw.matchId !== "string" || raw.matchId === "") {
		return fail(problem, "audit must hold a matchId");
	}
	if (raw.matchId.length > 100) return fail(problem, "matchId is too long");
	let base: ReturnType<typeof parseAudit>;
	try {
		base = parseAudit(raw);
	} catch (err) {
		if (err instanceof StorageError)
			return fail(problem, "audit must hold createdAt, createdBy, appVersion");
		throw err;
	}
	if (!base) return fail(problem, "audit is missing");
	return { matchId: raw.matchId, ...base };
}

function parseSetup(raw: unknown): MatchSetup {
	const problem = { code: "setup" } as const;
	if (!isRecord(raw) || typeof raw.formatId !== "string") {
		return fail(problem, "setup must hold formatId, periods and times");
	}
	let formatId: string;
	try {
		formatId = getFormat(raw.formatId).id;
	} catch {
		return fail(problem, `Unknown formatId "${raw.formatId}"`);
	}
	if (
		typeof raw.periods !== "number" ||
		!Number.isInteger(raw.periods) ||
		raw.periods < LIMITS.periods.min ||
		raw.periods > LIMITS.periods.max ||
		!isWholeMinutesWithin(raw.periodSeconds, LIMITS.periodMinutes) ||
		!isWholeMinutesWithin(raw.rotationSeconds, LIMITS.rotationMinutes, 0.5)
	) {
		return fail(problem, "periods and times must be in range");
	}
	return {
		formatId,
		periods: raw.periods,
		periodSeconds: raw.periodSeconds as number,
		rotationSeconds: raw.rotationSeconds as number,
	};
}

/**
 * Check the timeline like a referee would: times never go backwards, periods
 * start and end in order and inside their length, and every lineup only holds
 * squad players, each in one place at most, in lines the formation has.
 */
function parseTimeline(
	raw: unknown,
	setup: MatchSetup,
	playerIds: ReadonlySet<string>,
): TimelineEvent[] {
	if (!Array.isArray(raw)) {
		return fail({ code: "timelineNotList" }, "timeline must be a list");
	}
	if (raw.length > LIMITS.timelineEvents) {
		return fail(
			{ code: "tooManyEvents", max: LIMITS.timelineEvents },
			"timeline is too long",
		);
	}
	const zones = new Map(
		getFormat(setup.formatId).zones.map((z) => [z.id, z.count] as const),
	);
	let previousAt = 0;
	let openPeriod: { period: number; start: number } | null = null;
	let lastPeriod = 0;
	let lastEnd = 0;
	let seenLineup = false;

	const events = raw.map((event, index) => {
		const bad = (
			reason: "unknown" | "time" | "order" | "period" | "player" | "lineup",
		) =>
			new MatchFileError(`Event ${index + 1}: ${reason}`, {
				code: "event",
				position: index + 1,
				reason,
			});
		if (!isRecord(event) || typeof event.type !== "string")
			throw bad("unknown");
		if (!isSeconds(event.at)) throw bad("time");
		if (event.at < previousAt) throw bad("order");
		previousAt = event.at;
		const at = event.at;
		const isPlayer = (id: unknown): id is string =>
			typeof id === "string" && playerIds.has(id);
		const isPeriod = (p: unknown): p is number =>
			typeof p === "number" &&
			Number.isInteger(p) &&
			p >= 1 &&
			p <= setup.periods;

		switch (event.type) {
			case "periodStart": {
				if (
					!isPeriod(event.period) ||
					event.period !== lastPeriod + 1 ||
					openPeriod
				)
					throw bad("period");
				if (at < lastEnd) throw bad("order");
				openPeriod = { period: event.period, start: at };
				lastPeriod = event.period;
				return { type: "periodStart", at, period: event.period } as const;
			}
			case "periodEnd": {
				if (
					!isPeriod(event.period) ||
					openPeriod?.period !== event.period ||
					at - openPeriod.start > setup.periodSeconds
				)
					throw bad("period");
				openPeriod = null;
				lastEnd = at;
				return { type: "periodEnd", at, period: event.period } as const;
			}
			case "lineup": {
				// The first lineup is the kickoff lineup: a period must be on.
				if (!seenLineup && lastPeriod === 0) throw bad("period");
				seenLineup = true;
				if (!isRecord(event.zones)) throw bad("lineup");
				const seen = new Set<string>();
				const lineup: Record<string, string[]> = {};
				for (const [zoneId, ids] of Object.entries(event.zones)) {
					const capacity = zones.get(zoneId);
					if (
						capacity === undefined ||
						!Array.isArray(ids) ||
						ids.length > capacity
					)
						throw bad("lineup");
					for (const id of ids) {
						if (!isPlayer(id)) throw bad("player");
						if (seen.has(id)) throw bad("lineup");
						seen.add(id);
					}
					lineup[zoneId] = [...ids];
				}
				const keeperId = event.keeperId ?? null;
				if (keeperId !== null) {
					if (!isPlayer(keeperId)) throw bad("player");
					if (seen.has(keeperId)) throw bad("lineup");
				}
				return { type: "lineup", at, zones: lineup, keeperId } as const;
			}
			case "substitution": {
				const moves = event.moves;
				if (
					!isPeriod(event.period) ||
					!isSeconds(event.plannedAt) ||
					typeof event.zoneId !== "string" ||
					!zones.has(event.zoneId) ||
					!isPlayer(event.inId) ||
					!isPlayer(event.outId) ||
					!Array.isArray(moves)
				)
					throw bad(isSeconds(event.plannedAt) ? "player" : "time");
				const checked = moves.map((m) => {
					if (
						!isRecord(m) ||
						!isPlayer(m.playerId) ||
						typeof m.from !== "string" ||
						!zones.has(m.from) ||
						typeof m.to !== "string" ||
						!zones.has(m.to)
					)
						throw bad("player");
					return { playerId: m.playerId, from: m.from, to: m.to };
				});
				return {
					type: "substitution",
					at,
					plannedAt: event.plannedAt,
					period: event.period,
					inId: event.inId,
					zoneId: event.zoneId,
					moves: checked,
					outId: event.outId,
				} as const;
			}
			case "keeperChange": {
				const fromId = event.fromId ?? null;
				if (
					!isPeriod(event.period) ||
					!isPlayer(event.toId) ||
					(fromId !== null && !isPlayer(fromId))
				)
					throw bad("player");
				return {
					type: "keeperChange",
					at,
					period: event.period,
					fromId,
					toId: event.toId,
				} as const;
			}
			case "outForMatch":
			case "lateArrival": {
				if (!isPeriod(event.period) || !isPlayer(event.playerId))
					throw bad("player");
				return {
					type: event.type,
					at,
					period: event.period,
					playerId: event.playerId,
				} as const;
			}
			default:
				throw bad("unknown");
		}
	});
	return events;
}

/**
 * Parse and STRICTLY validate a match file from an unknown source. A broken
 * file is refused with a reason instead of skewing the season statistics.
 */
export function parseMatchFile(data: unknown): MatchFile {
	if (!isRecord(data)) {
		return fail({ code: "notObject" }, "Match file is not a JSON object");
	}
	if (data.schemaVersion !== MATCH_FILE_VERSION) {
		return fail({ code: "schemaVersion" }, "Unknown or missing schemaVersion");
	}
	const audit = parseMatchAudit(data.audit);

	let match: MatchDetails;
	try {
		match = parseMatchDetails(data.match);
	} catch (err) {
		if (err instanceof StorageError)
			return fail({ code: "matchDetails" }, err.message);
		throw err;
	}
	const setup = parseSetup(data.setup);

	const squad = data.squad;
	if (!isRecord(squad) || !Array.isArray(squad.players)) {
		return fail({ code: "squad" }, "squad must hold players");
	}
	if (squad.players.length === 0 || squad.players.length > LIMITS.squadSize) {
		return fail({ code: "squad" }, "squad has too few or too many players");
	}
	let players: Player[];
	try {
		players = parsePlayers(squad.players);
	} catch (err) {
		if (err instanceof StorageError)
			return fail({ code: "squad" }, err.message);
		throw err;
	}
	const playerIds = new Set(players.map((p) => p.id));

	const timeline = parseTimeline(data.timeline, setup, playerIds);
	const starters = startersOf(timeline);
	if (starters.length === 0) {
		return fail({ code: "noKickoff" }, "The match has no starting lineup");
	}
	const startingIds = squad.startingIds;
	if (
		!Array.isArray(startingIds) ||
		startingIds.length !== starters.length ||
		new Set(startingIds).size !== starters.length ||
		!startingIds.every((id) => typeof id === "string" && starters.includes(id))
	) {
		return fail(
			{ code: "startingIds" },
			"startingIds must be the players in the first lineup",
		);
	}

	const last = timeline[timeline.length - 1];
	if (
		!isSeconds(data.endedAt) ||
		(last !== undefined && data.endedAt < last.at) ||
		data.endedAt > setup.periods * setup.periodSeconds
	) {
		return fail({ code: "endedAt" }, "endedAt is outside the match");
	}

	return {
		schemaVersion: MATCH_FILE_VERSION,
		audit,
		match,
		setup,
		squad: { players, startingIds: [...starters] },
		timeline,
		endedAt: data.endedAt,
	};
}
