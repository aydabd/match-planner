import {
	currentLevel,
	DEVELOPMENT_AREAS,
	type DevelopmentArea,
} from "./developmentCheckpoints.js";
import type { SeasonHistory } from "./history.js";
import type { PlayerNotesFile } from "./playerNotes.js";

export interface MonthlyMinutesSeries {
	key: string;
	name: string;
	minutes: number[];
}

export interface MonthlyMinutesModel {
	months: string[];
	series: MonthlyMinutesSeries[];
}

export interface StartFrequency {
	key: string;
	name: string;
	started: number;
	of: number;
	percentage: number;
}

export interface CheckpointProgress {
	area: DevelopmentArea;
	level: number;
	of: number;
}

export interface PlayerNoteEntry {
	date: string;
	area: DevelopmentArea;
	note: string;
}

/** One player's own development, never mixed with any other player's. */
export interface PlayerDevelopmentView {
	checkpoints: CheckpointProgress[];
	notes: PlayerNoteEntry[];
}

/** Build the monthly minute series used by the season chart. */
export function monthlyMinutes(history: SeasonHistory): MonthlyMinutesModel {
	return {
		months: [...history.months],
		series: history.players.map((player) => ({
			key: player.key,
			name: player.name,
			minutes: history.months.map((month) =>
				Math.round(
					(player.months.find((entry) => entry.month === month)?.seconds ?? 0) /
						60,
				),
			),
		})),
	};
}

/** Build recent-start percentages without changing the underlying history. */
export function recentStartFrequency(history: SeasonHistory): StartFrequency[] {
	return history.players.map((player) => ({
		key: player.key,
		name: player.name,
		started: player.recent.started,
		of: player.recent.of,
		percentage:
			player.recent.of === 0
				? 0
				: Math.round((player.recent.started / player.recent.of) * 100),
	}));
}

/**
 * One player's own checkpoint progress and development notes (#109) - never
 * any other player's. `levelCounts` is each area's ladder length for the
 * squad's current team size (the ladders themselves are UI text; see
 * seasonReport.ts's buildSeasonReport for why this module takes counts
 * rather than looking them up).
 */
export function playerDevelopment(
	notes: PlayerNotesFile,
	key: string,
	levelCounts: Record<DevelopmentArea, number>,
): PlayerDevelopmentView {
	const own = notes.players.find((player) => player.key === key);
	return {
		checkpoints: DEVELOPMENT_AREAS.map((area) => ({
			area,
			level: currentLevel(own?.checkpoints ?? [], area),
			of: levelCounts[area],
		})),
		notes: (own?.development ?? [])
			.map((entry) => ({
				date: entry.date,
				area: entry.area,
				note: entry.note,
			}))
			.sort(
				(a, b) => a.date.localeCompare(b.date) || a.area.localeCompare(b.area),
			),
	};
}
