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
	/** Common formations offered as quick picks, most common first. */
	readonly presets: readonly string[];
}

export const TEAM_SIZES = {
	"5v5": {
		outfield: 4,
		squadSizeHint: [5, 8],
		defaultRotationSeconds: 300,
		presets: ["1-2-1", "2-1-1", "2-2"],
	},
	"7v7": {
		outfield: 6,
		squadSizeHint: [8, 11],
		defaultRotationSeconds: 600,
		presets: ["2-3-1", "3-2-1", "2-1-2-1"],
	},
	"9v9": {
		outfield: 8,
		squadSizeHint: [10, 14],
		defaultRotationSeconds: 600,
		presets: ["3-3-2", "3-2-3", "3-4-1"],
	},
	"11v11": {
		outfield: 10,
		squadSizeHint: [12, 18],
		defaultRotationSeconds: 600,
		presets: ["4-4-2", "4-3-3", "4-2-3-1"],
	},
} as const satisfies Record<string, TeamSize>;

export type TeamSizeId = keyof typeof TEAM_SIZES;

export function isTeamSize(id: string): id is TeamSizeId {
	return Object.keys(TEAM_SIZES).includes(id);
}

const MIN_LINES = 2;
const MAX_LINES = 5;

/** Zone ids and names by number of lines. 3 lines keep the original ids. */
const LINE_ZONES: Record<number, readonly (readonly [string, string])[]> = {
	2: [
		["back", "Back"],
		["fwd", "Anfall"],
	],
	3: [
		["back", "Back"],
		["mid", "Mittfält"],
		["fwd", "Anfall"],
	],
	4: [
		["back", "Back"],
		["dmid", "Defensivt mittfält"],
		["amid", "Offensivt mittfält"],
		["fwd", "Anfall"],
	],
	5: [
		["back", "Back"],
		["dmid", "Defensivt mittfält"],
		["mid", "Mittfält"],
		["amid", "Offensivt mittfält"],
		["fwd", "Anfall"],
	],
};

export type FormationResult =
	| { ok: true; formation: string; lines: number[] }
	| { ok: false; error: string };

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
		return {
			ok: false,
			error:
				"Skriv formationen som siffror med bindestreck, till exempel 2-3-1.",
		};
	}
	const lines = parts.map(Number);
	if (lines.length < MIN_LINES || lines.length > MAX_LINES) {
		return {
			ok: false,
			error: `En formation har ${MIN_LINES} till ${MAX_LINES} led.`,
		};
	}
	if (lines.some((n) => n === 0)) {
		return { ok: false, error: "Varje led behöver minst en spelare." };
	}
	const total = lines.reduce((sum, n) => sum + n, 0);
	const { outfield } = TEAM_SIZES[size];
	if (total !== outfield) {
		return {
			ok: false,
			error: `Formationen har ${total} utespelare, men ${size} behöver ${outfield}.`,
		};
	}
	return { ok: true, formation: lines.join("-"), lines };
}

/** Build the pitch format for a team size and formation. Throws if invalid. */
export function buildFormat(size: TeamSizeId, formation: string): FormatConfig {
	const parsed = parseFormation(formation, size);
	if (!parsed.ok) throw new Error(parsed.error);
	const names = LINE_ZONES[parsed.lines.length] ?? [];
	const zones: ZoneConfig[] = parsed.lines.map((count, i) => {
		const [id, label] = names[i] ?? [`line${i + 1}`, `Led ${i + 1}`];
		const adjacent = [names[i - 1]?.[0], names[i + 1]?.[0]].filter(
			(zoneId): zoneId is string => zoneId !== undefined,
		);
		return { id, label, count, adjacent };
	});
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

/** Format ids saved before formations were configurable. */
const LEGACY_IDS: Record<string, string> = { "7v7": "7v7:2-3-1" };

/**
 * Resolve a format id such as "9v9:3-3-2" (any valid formation, not just
 * the quick picks). The original id "7v7" still means 7v7 (2-3-1), so saved
 * squads, squad files and matches in progress keep loading.
 */
export function getFormat(id: string): FormatConfig {
	const resolved = LEGACY_IDS[id] ?? id;
	const [size = "", formation = ""] = resolved.split(":");
	if (isTeamSize(size) && parseFormation(formation, size).ok) {
		return buildFormat(size, formation);
	}
	throw new Error(
		`Okänt format: "${id}". Använd lagstorlek och formation, till exempel 7v7:2-3-1.`,
	);
}

/** Total number of outfield players on the pitch at once for a format. */
export function outfieldCount(format: FormatConfig): number {
	return format.zones.reduce((sum, z) => sum + z.count, 0);
}
