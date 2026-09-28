import type { FormatConfig, ZoneConfig } from "./types.js";

/**
 * A format is a team size plus a formation. A formation is just its lines
 * from defence to attack ("4-2-1-2-1"): each line becomes a pitch zone and
 * neighbouring lines are adjacent. That one rule lets the scheduler keep
 * "never move a player straight from defence to attack" for any formation a
 * club uses, including ones typed in by the coach.
 */

export interface TeamSize {
	/** Outfield players on the pitch at once; the goalkeeper is extra. */
	readonly outfield: number;
	/** Suggested squad size range (outfield players, excluding GK), inclusive. */
	readonly squadSizeHint: readonly [min: number, max: number];
	/** Suggested rotation length in seconds, used only as a UI default. */
	readonly defaultRotationSeconds: number;
	/** Default number of periods in a match. */
	readonly periods: number;
	/** Default length of each period, in minutes. */
	readonly periodMinutes: number;
	/** Common formations offered as quick picks, most common first. */
	readonly presets: readonly string[];
}

/**
 * Team sizes with their defaults. Match length: 11v11 is 2 x 40 min, as SvFF
 * sets for 15-year-olds. The smaller formats vary by age and district; their
 * periods are starting points the coach can change, to be checked against
 * the SvFF and Skånebollen match rules in #23.
 */
export const TEAM_SIZES = {
	"5v5": {
		outfield: 4,
		squadSizeHint: [5, 8],
		defaultRotationSeconds: 300,
		periods: 3,
		periodMinutes: 15,
		presets: ["1-2-1", "2-1-1", "2-2"],
	},
	"7v7": {
		outfield: 6,
		squadSizeHint: [8, 11],
		defaultRotationSeconds: 600,
		periods: 3,
		periodMinutes: 20,
		presets: ["2-3-1", "3-2-1", "2-1-2-1"],
	},
	"9v9": {
		outfield: 8,
		squadSizeHint: [10, 14],
		defaultRotationSeconds: 600,
		periods: 3,
		periodMinutes: 25,
		presets: ["3-3-2", "3-2-3", "3-4-1"],
	},
	"11v11": {
		outfield: 10,
		squadSizeHint: [12, 18],
		defaultRotationSeconds: 600,
		periods: 2,
		periodMinutes: 40,
		presets: ["4-4-2", "4-3-3", "4-2-3-1"],
	},
} as const satisfies Record<string, TeamSize>;

export type TeamSizeId = keyof typeof TEAM_SIZES;

export function isTeamSize(id: string): id is TeamSizeId {
	return Object.keys(TEAM_SIZES).includes(id);
}

const MIN_LINES = 2;
const MAX_LINES = 5;

/**
 * Zone ids by number of lines, back to front. 3 lines keep the original ids,
 * so saved matches stay valid. src/ui/text.ts names each zone.
 */
const LINE_ZONE_IDS: Record<number, readonly string[]> = {
	2: ["back", "fwd"],
	3: ["back", "mid", "fwd"],
	4: ["back", "dmid", "amid", "fwd"],
	5: ["back", "dmid", "mid", "amid", "fwd"],
};

/** Why a formation is not valid; src/ui/text.ts turns it into a sentence. */
export type FormationProblem =
	| { code: "notNumbers" }
	| { code: "lineCount"; min: number; max: number }
	| { code: "emptyLine" }
	| { code: "playerCount"; size: TeamSizeId; got: number; need: number };

export type FormationResult =
	| { ok: true; formation: string; lines: number[] }
	| { ok: false; problem: FormationProblem };

/** A format id or formation that cannot be used. The message is for developers. */
export class FormatError extends Error {
	constructor(
		message: string,
		readonly problem?: FormationProblem,
	) {
		super(message);
		this.name = "FormatError";
	}
}

/**
 * Validate a formation typed by a coach for a team size. Spaces and any
 * dash character are accepted; the result is normalised to "4-3-3".
 */
export function parseFormation(
	text: string,
	size: TeamSizeId,
): FormationResult {
	const parts = text.trim().split(/\s*[-–—]\s*/);
	if (!parts.every((part) => /^\d+$/.test(part))) {
		return { ok: false, problem: { code: "notNumbers" } };
	}
	const lines = parts.map(Number);
	if (lines.length < MIN_LINES || lines.length > MAX_LINES) {
		return {
			ok: false,
			problem: { code: "lineCount", min: MIN_LINES, max: MAX_LINES },
		};
	}
	if (lines.some((n) => n === 0)) {
		return { ok: false, problem: { code: "emptyLine" } };
	}
	const total = lines.reduce((sum, n) => sum + n, 0);
	const { outfield } = TEAM_SIZES[size];
	if (total !== outfield) {
		return {
			ok: false,
			problem: { code: "playerCount", size, got: total, need: outfield },
		};
	}
	return { ok: true, formation: lines.join("-"), lines };
}

/** Build the pitch format for a team size and formation. Throws if invalid. */
export function buildFormat(size: TeamSizeId, formation: string): FormatConfig {
	const parsed = parseFormation(formation, size);
	if (!parsed.ok) {
		throw new FormatError(
			`Invalid formation "${formation}" for ${size}`,
			parsed.problem,
		);
	}
	// parseFormation guarantees 2-5 lines, so every line has an id.
	const ids = LINE_ZONE_IDS[parsed.lines.length] as readonly string[];
	const zones: ZoneConfig[] = parsed.lines.map((count, i) => ({
		id: ids[i] as string,
		count,
		adjacent: [ids[i - 1], ids[i + 1]].filter(
			(zoneId): zoneId is string => zoneId !== undefined,
		),
	}));
	const teamSize = TEAM_SIZES[size];
	return {
		id: `${size}:${parsed.formation}`,
		label: `${size} (${parsed.formation})`,
		zones,
		squadSizeHint: teamSize.squadSizeHint,
		defaultRotationSeconds: teamSize.defaultRotationSeconds,
	};
}

/** Quick-pick formats for every team size, smallest team first. */
export const FORMATS: Record<string, FormatConfig> = Object.fromEntries(
	Object.entries(TEAM_SIZES).flatMap(([size, config]) =>
		config.presets.map((formation) => {
			const format = buildFormat(size as TeamSizeId, formation);
			return [format.id, format] as const;
		}),
	),
);

/** The team size a new squad starts with. */
export const DEFAULT_TEAM_SIZE: TeamSizeId = "7v7";

/** A new squad's format: the default team size's most common formation. */
export const DEFAULT_FORMAT = buildFormat(
	DEFAULT_TEAM_SIZE,
	TEAM_SIZES[DEFAULT_TEAM_SIZE].presets[0],
);

/** Format ids saved before formations were configurable. */
const LEGACY_IDS: Record<string, string> = { "7v7": "7v7:2-3-1" };

/**
 * Resolve a format id such as "9v9:3-3-2" (any valid formation, not just
 * the quick picks). Ids must be exactly "size:formation" in normalised form
 * (as buildFormat writes them); the only exception is the original "7v7",
 * which still means 7v7 (2-3-1) so saved squads, squad files and matches in
 * progress keep loading.
 */
export function getFormat(id: string): FormatConfig {
	const resolved = LEGACY_IDS[id] ?? id;
	const parts = resolved.split(":");
	const [size = "", formation = ""] = parts;
	if (parts.length === 2 && isTeamSize(size)) {
		const parsed = parseFormation(formation, size);
		if (parsed.ok && parsed.formation === formation) {
			return buildFormat(size, formation);
		}
	}
	throw new FormatError(
		`Unknown format id "${id}"; expected size:formation, e.g. 7v7:2-3-1`,
	);
}

/** The team size of a format id, e.g. "9v9:3-3-2" -> "9v9". */
export function teamSizeOf(formatId: string): TeamSizeId {
	return getFormat(formatId).id.split(":")[0] as TeamSizeId;
}

export interface FormatChoice {
	size: TeamSizeId;
	formation: string;
	/** True when the formation is not one of the size's quick picks. */
	custom: boolean;
}

/** Split a format id into what the coach chose on the setup screen. */
export function formatChoice(id: string): FormatChoice {
	const [size, formation] = getFormat(id).id.split(":") as [TeamSizeId, string];
	const presets: readonly string[] = TEAM_SIZES[size].presets;
	return { size, formation, custom: !presets.includes(formation) };
}

/** Total number of outfield players on the pitch at once for a format. */
export function outfieldCount(format: FormatConfig): number {
	return format.zones.reduce((sum, z) => sum + z.count, 0);
}
