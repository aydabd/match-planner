import type { FormatConfig } from "./types.js";

/**
 * 7v7, formation 2-3-1 (2 back, 3 mid, 1 forward + goalkeeper).
 * Adjacency: back <-> mid <-> fwd. Back and fwd are NOT adjacent, so once
 * a player's first zone is decided the scheduler will never later put them
 * in the non-adjacent zone (see scheduler.ts).
 */
export const FORMAT_7V7: FormatConfig = {
	id: "7v7",
	label: "7v7 (2-3-1)",
	zones: [
		{ id: "back", label: "Back", count: 2, adjacent: ["mid"] },
		{ id: "mid", label: "Mittfalt", count: 3, adjacent: ["back", "fwd"] },
		{ id: "fwd", label: "Anfall", count: 1, adjacent: ["mid"] },
	],
	squadSizeHint: [8, 11],
	defaultRotationSeconds: 600,
};

/**
 * Registry of all supported formats. v1 ships only 7v7; 5v5/9v9/11v11 are
 * intentionally left out rather than guessed at, so the first real usage
 * data can inform their zone layout instead of hardcoding a guess now.
 * Adding one is a pure data change - drop a new FormatConfig here and it
 * automatically gets the same scheduler, tests and UI for free.
 */
export const FORMATS: Record<string, FormatConfig> = {
	"7v7": FORMAT_7V7,
};

export function getFormat(id: string): FormatConfig {
	const format = FORMATS[id];
	if (!format) {
		throw new Error(
			`Okant format: "${id}". Tillgangliga: ${Object.keys(FORMATS).join(", ")}`,
		);
	}
	return format;
}

/** Total number of outfield players on the pitch at once for a format. */
export function outfieldCount(format: FormatConfig): number {
	return format.zones.reduce((sum, z) => sum + z.count, 0);
}
