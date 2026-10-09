import { getFormat, TEAM_SIZES, teamSizeOf } from "./formations.js";
import { LIMITS } from "./limits.js";
import { policyFor, REGIONS, type RegionId } from "./policy.js";
import {
	DEFAULT_FAIRNESS,
	type FairnessPeriod,
	FREE_RULES,
	parseFairnessPeriod,
	parseSubstitutionRules,
	type SubstitutionRules,
} from "./substitutionRules.js";
import type { Player } from "./types.js";

/**
 * The squad file: a team setup a coach saves and shares with another coach,
 * who loads it and can start a match at once. It holds the match plan
 * (periods), match details, goalkeepers, the region whose policy the squad
 * was built under (src/core/policy.ts), the team's substitution rules and
 * the period fairness is measured over (#171), and an audit record. Every
 * field except match details and the audit is required: a file without one
 * is refused, never filled in with a guess.
 */
export const CURRENT_SCHEMA_VERSION = 3;

/** The match this setup is for. Every field is optional (empty string). */
export interface MatchDetails {
	opponent: string;
	venue: string;
	/** "YYYY-MM-DD", or "YYYY-MM-DDTHH:MM" with kickoff time, or "". */
	date: string;
}

/** Who saved a squad file, when, and with which app version. */
export interface FileAudit {
	/** ISO 8601 timestamp. */
	createdAt: string;
	/** The coach's name as typed in the app ("" if not given). */
	createdBy: string;
	appVersion: string;
}

export interface RosterFile {
	schemaVersion: 3;
	formatId: string;
	rotationSeconds: number;
	periods: number;
	periodSeconds: number;
	/** Which federation's recommended policy this squad was built under. */
	region: RegionId;
	/** The team's default substitution rules; each match copies them. */
	substitutions: SubstitutionRules;
	/** The period playtime should even out over when swaps are limited. */
	fairness: FairnessPeriod;
	match: MatchDetails;
	players: Player[];
	/** Who starts in goal: a player marked as goalkeeper, or null. */
	startingKeeperId: string | null;
	/** Set when the setup is saved to a file; kept as read when loaded. */
	audit?: FileAudit;
}

/** Why a squad file was refused; src/ui/text.ts turns it into a sentence. */
export type SquadFileProblem =
	| { code: "notObject" }
	| { code: "schemaVersion" }
	| { code: "unknownFormat" }
	| { code: "rotation" }
	| { code: "periods" }
	| { code: "matchDetails" }
	| { code: "audit" }
	| { code: "region" }
	| { code: "substitutions" }
	| { code: "fairness" }
	| { code: "startingKeeper" }
	| { code: "playersNotList" }
	| { code: "emptySquad" }
	| { code: "tooManyPlayers"; max: number }
	| { code: "invalidPlayer"; position: number }
	| { code: "duplicateId" };

/** A squad file that cannot be used. The message is for developers. */
export class StorageError extends Error {
	constructor(
		message: string,
		readonly problem: SquadFileProblem,
	) {
		super(message);
		this.name = "StorageError";
	}
}

const NO_MATCH_DETAILS: MatchDetails = { opponent: "", venue: "", date: "" };

/**
 * A new team setup. Anything not given comes from the team size's defaults:
 * minutes between swaps, number of periods and their length.
 */
export function newRoster(fields: {
	formatId: string;
	rotationSeconds?: number;
	periods?: number;
	periodSeconds?: number;
	region?: RegionId;
	substitutions?: SubstitutionRules;
	fairness?: FairnessPeriod;
	match?: MatchDetails;
	startingKeeperId?: string | null;
	players?: readonly (Omit<Player, "goalkeeper"> & { goalkeeper?: boolean })[];
}): RosterFile {
	const size = TEAM_SIZES[teamSizeOf(fields.formatId)];
	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		formatId: fields.formatId,
		rotationSeconds: fields.rotationSeconds ?? size.defaultRotationSeconds,
		periods: fields.periods ?? size.periods,
		periodSeconds: fields.periodSeconds ?? size.periodMinutes * 60,
		region: fields.region ?? "national",
		substitutions: structuredClone(fields.substitutions ?? FREE_RULES),
		fairness: structuredClone(fields.fairness ?? DEFAULT_FAIRNESS),
		match: { ...(fields.match ?? NO_MATCH_DETAILS) },
		players: (fields.players ?? []).map((p) => ({
			id: p.id,
			name: p.name,
			goalkeeper: p.goalkeeper ?? false,
		})),
		startingKeeperId: fields.startingKeeperId ?? null,
	};
}

/**
 * Minutes within a range, in steps of `stepMinutes` (default a whole
 * minute - periods and period length stay whole-minutes-only; the rotation
 * interval allows half minutes, see LIMITS.rotationMinutes's callers).
 */
export function isMinutesStepWithin(
	seconds: unknown,
	range: { min: number; max: number },
	stepMinutes = 1,
): seconds is number {
	if (typeof seconds !== "number" || !Number.isFinite(seconds)) return false;
	const minutes = seconds / 60;
	const stepSeconds = stepMinutes * 60;
	return (
		seconds % stepSeconds === 0 && minutes >= range.min && minutes <= range.max
	);
}

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
 * formation, match plan, match details, goalkeepers and names) with another
 * coach. Always written with the normalised format id and an audit record,
 * named e.g. trupp-9v9-3-3-2.json.
 */
export function squadFile(
	roster: RosterFile,
	audit: FileAudit,
): { fileName: string; json: string } {
	const formatId = canonicalFormatId(roster.formatId) ?? roster.formatId;
	return {
		fileName: `trupp-${formatId.replace(":", "-")}.json`,
		json: rosterToJson({ ...roster, formatId, audit }),
	};
}

export interface ParseOptions {
	/**
	 * The setup screen's own draft may have no players yet; a squad file
	 * someone shares must not.
	 */
	allowEmptySquad?: boolean;
}

const DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

function isValidDate(value: string): boolean {
	return value === "" || (DATE.test(value) && !Number.isNaN(Date.parse(value)));
}

export function parseMatchDetails(raw: unknown): MatchDetails {
	if (raw === undefined) return { ...NO_MATCH_DETAILS };
	const fail = () =>
		new StorageError("match must hold opponent, venue and date strings", {
			code: "matchDetails",
		});
	if (typeof raw !== "object" || raw === null) throw fail();
	const m = raw as Record<string, unknown>;
	const text = (value: unknown): string => {
		if (value === undefined) return "";
		if (typeof value !== "string") throw fail();
		// Measured after trimming, like player names.
		const trimmed = value.trim();
		if (trimmed.length > LIMITS.matchDetailLength) throw fail();
		return trimmed;
	};
	const details = {
		opponent: text(m.opponent),
		venue: text(m.venue),
		date: text(m.date),
	};
	if (!isValidDate(details.date)) throw fail();
	return details;
}

export function parseAudit(raw: unknown): FileAudit | undefined {
	if (raw === undefined) return undefined;
	const fail = () =>
		new StorageError("audit must hold createdAt, createdBy and appVersion", {
			code: "audit",
		});
	if (typeof raw !== "object" || raw === null) throw fail();
	const a = raw as Record<string, unknown>;
	if (
		typeof a.createdAt !== "string" ||
		Number.isNaN(Date.parse(a.createdAt)) ||
		typeof a.createdBy !== "string" ||
		a.createdBy.trim().length > LIMITS.coachNameLength ||
		typeof a.appVersion !== "string" ||
		a.appVersion === ""
	) {
		throw fail();
	}
	return {
		createdAt: a.createdAt,
		createdBy: a.createdBy.trim(),
		appVersion: a.appVersion,
	};
}

/**
 * The players of a squad file or match file, strictly checked: ids and names
 * present, ids unique, names trimmed and shortened to the name limit.
 */
export function parsePlayers(list: readonly unknown[]): Player[] {
	const seenIds = new Set<string>();
	return list.map((raw, index) => {
		const invalid = (why: string) =>
			new StorageError(`Player at index ${index} ${why}`, {
				code: "invalidPlayer",
				position: index + 1,
			});
		if (typeof raw !== "object" || raw === null)
			throw invalid("is not an object");
		const p = raw as Record<string, unknown>;
		if (typeof p.id !== "string" || p.id.trim() === "") {
			throw invalid("has no valid id");
		}
		if (typeof p.name !== "string" || p.name.trim() === "") {
			throw invalid("has no valid name");
		}
		if (p.goalkeeper !== undefined && typeof p.goalkeeper !== "boolean") {
			throw invalid("has a goalkeeper flag that is not true or false");
		}
		if (seenIds.has(p.id)) {
			throw new StorageError(`Duplicate player id "${p.id}"`, {
				code: "duplicateId",
			});
		}
		seenIds.add(p.id);
		return {
			id: p.id,
			name: p.name.trim().slice(0, LIMITS.playerNameLength),
			goalkeeper: p.goalkeeper === true,
		};
	});
}

/**
 * Parse and STRICTLY validate a squad file coming from an unknown source (a
 * file another coach shares). Never trust shape or types: this is the one
 * place untrusted JSON enters the app, so every field is checked before
 * anything downstream (scheduler, DOM rendering) sees it.
 */
export function parseRosterFile(
	data: unknown,
	options: ParseOptions = {},
): RosterFile {
	if (typeof data !== "object" || data === null) {
		throw new StorageError("Squad file is not a JSON object", {
			code: "notObject",
		});
	}
	const obj = data as Record<string, unknown>;

	if (obj.schemaVersion !== CURRENT_SCHEMA_VERSION) {
		throw new StorageError(
			`Unknown or missing schemaVersion (expected ${CURRENT_SCHEMA_VERSION}, got ${JSON.stringify(obj.schemaVersion)})`,
			{ code: "schemaVersion" },
		);
	}

	const formatId =
		typeof obj.formatId === "string" ? canonicalFormatId(obj.formatId) : null;
	if (formatId === null) {
		throw new StorageError(`Unknown formatId "${String(obj.formatId)}"`, {
			code: "unknownFormat",
		});
	}

	if (!isMinutesStepWithin(obj.rotationSeconds, LIMITS.rotationMinutes, 0.5)) {
		throw new StorageError(
			"rotationSeconds must be a half-minute step in range",
			{ code: "rotation" },
		);
	}

	const { periods, periodSeconds } = obj;
	if (
		typeof periods !== "number" ||
		!Number.isInteger(periods) ||
		periods < LIMITS.periods.min ||
		periods > LIMITS.periods.max ||
		!isMinutesStepWithin(periodSeconds, LIMITS.periodMinutes)
	) {
		throw new StorageError("periods and periodSeconds must be in range", {
			code: "periods",
		});
	}

	const match = parseMatchDetails(obj.match);
	const audit = parseAudit(obj.audit);

	if (typeof obj.region !== "string" || !(obj.region in REGIONS)) {
		throw new StorageError(`Unknown region "${String(obj.region)}"`, {
			code: "region",
		});
	}
	const region = obj.region as RegionId;

	const substitutions = parseSubstitutionRules(obj.substitutions);
	if (!substitutions) {
		throw new StorageError("substitutions must be valid substitution rules", {
			code: "substitutions",
		});
	}
	const fairness = parseFairnessPeriod(obj.fairness);
	if (!fairness) {
		throw new StorageError("fairness must be a valid period", {
			code: "fairness",
		});
	}

	if (!Array.isArray(obj.players)) {
		throw new StorageError("players must be a list", {
			code: "playersNotList",
		});
	}
	if (obj.players.length === 0 && !options.allowEmptySquad) {
		throw new StorageError("The squad is empty", { code: "emptySquad" });
	}
	if (obj.players.length > LIMITS.squadSize) {
		throw new StorageError(`More than ${LIMITS.squadSize} players`, {
			code: "tooManyPlayers",
			max: LIMITS.squadSize,
		});
	}

	const players = parsePlayers(obj.players);

	// Absent or null means nobody is tracked in goal.
	const rawKeeper = obj.startingKeeperId ?? null;
	const startingKeeperId = typeof rawKeeper === "string" ? rawKeeper : null;
	if (
		rawKeeper !== null &&
		!players.some((p) => p.id === rawKeeper && p.goalkeeper)
	) {
		throw new StorageError(
			`startingKeeperId ${JSON.stringify(rawKeeper)} is not a goalkeeper in the squad`,
			{ code: "startingKeeper" },
		);
	}

	const roster: RosterFile = {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		formatId,
		rotationSeconds: obj.rotationSeconds,
		periods,
		periodSeconds,
		region,
		substitutions,
		fairness,
		match,
		players,
		startingKeeperId,
	};
	if (audit) roster.audit = audit;
	return roster;
}

/**
 * Which of the roster's own match-plan values differ from the region's
 * policy for its team size (src/core/policy.ts) — a coach's deliberate
 * override, shown to keep it visibly distinct from the recommended default.
 * Nothing is stored to compute this: it is always derived, so it can never
 * drift from the truth the way a stored "isOverride" flag could.
 */
export function policyOverrides(
	roster: Pick<RosterFile, "formatId" | "region" | "periods" | "periodSeconds">,
): ("periods" | "periodSeconds")[] {
	const size = teamSizeOf(roster.formatId);
	const plan = policyFor(roster.region).formats[size];
	const overrides: ("periods" | "periodSeconds")[] = [];
	if (roster.periods !== plan.periods) overrides.push("periods");
	if (roster.periodSeconds !== plan.periodMinutes * 60) {
		overrides.push("periodSeconds");
	}
	return overrides;
}
