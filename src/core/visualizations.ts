import type { SeasonHistory } from "./history.js";
import type { DevelopmentArea, PlayerNotesFile } from "./playerNotes.js";

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

export interface DevelopmentTimelineEntry {
	date: string;
	key: string;
	name: string;
	area: DevelopmentArea;
	note: string;
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

/** Flatten local development notes into a stable, oldest-first timeline. */
export function developmentTimeline(
	history: SeasonHistory,
	notes: PlayerNotesFile,
): DevelopmentTimelineEntry[] {
	const players = new Map(
		history.players.map((player) => [player.key, player]),
	);
	return notes.players
		.flatMap((playerNotes) => {
			const player = players.get(playerNotes.key);
			return player
				? playerNotes.development.map((entry) => ({
						date: entry.date,
						key: player.key,
						name: player.name,
						area: entry.area,
						note: entry.note,
					}))
				: [];
		})
		.sort(
			(a, b) =>
				a.date.localeCompare(b.date) ||
				a.name.localeCompare(b.name, "sv") ||
				a.area.localeCompare(b.area),
		);
}
