import { describe, expect, it } from "vitest";
import type { SeasonHistory } from "../src/core/history.js";
import type { PlayerNotesFile } from "../src/core/playerNotes.js";
import {
	developmentTimeline,
	monthlyMinutes,
	recentStartFrequency,
} from "../src/core/visualizations.js";

const history: SeasonHistory = {
	matches: 3,
	months: ["2026-01", "2026-02"],
	players: [
		{
			key: "alva",
			name: "Alva",
			squadMatches: 3,
			playedMatches: 3,
			started: 2,
			startedOnBench: 1,
			totalSeconds: 2_400,
			averageSeconds: 800,
			zoneSeconds: {},
			months: [
				{ month: "2026-01", seconds: 1_200, matches: 1 },
				{ month: "2026-02", seconds: 1_200, matches: 2 },
			],
			recent: { started: 2, of: 3 },
		},
		{
			key: "bo",
			name: "Bo",
			squadMatches: 3,
			playedMatches: 2,
			started: 1,
			startedOnBench: 2,
			totalSeconds: 1_200,
			averageSeconds: 400,
			zoneSeconds: {},
			months: [{ month: "2026-01", seconds: 600, matches: 1 }],
			recent: { started: 1, of: 3 },
		},
	],
};

describe("season visualization models", () => {
	it("fills monthly minutes with zeroes and converts seconds to minutes", () => {
		expect(monthlyMinutes(history)).toEqual({
			months: ["2026-01", "2026-02"],
			series: [
				{ key: "alva", name: "Alva", minutes: [20, 20] },
				{ key: "bo", name: "Bo", minutes: [10, 0] },
			],
		});
	});

	it("returns recent start frequency as a percentage", () => {
		expect(recentStartFrequency(history)).toEqual([
			{ key: "alva", name: "Alva", started: 2, of: 3, percentage: 67 },
			{ key: "bo", name: "Bo", started: 1, of: 3, percentage: 33 },
		]);
	});

	it("returns zero when a player has no recent matches", () => {
		const firstPlayer = history.players[0];
		if (!firstPlayer) throw new Error("fixture missing first player");
		const noRecentMatches: SeasonHistory = {
			...history,
			players: [
				...history.players,
				{
					...firstPlayer,
					key: "cedric",
					name: "Cedric",
					recent: { started: 0, of: 0 },
				},
			],
		};

		expect(recentStartFrequency(noRecentMatches)[2]).toEqual({
			key: "cedric",
			name: "Cedric",
			started: 0,
			of: 0,
			percentage: 0,
		});
	});

	it("orders development notes by date and keeps their player and area", () => {
		const notes: PlayerNotesFile = {
			schemaVersion: 1,
			players: [
				{
					key: "bo",
					availability: [],
					development: [{ date: "2026-02-03", area: "mental", note: "Fokus" }],
					checkpoints: [],
				},
				{
					key: "unknown",
					availability: [],
					development: [
						{ date: "2026-01-01", area: "physical", note: "Ignored" },
					],
					checkpoints: [],
				},
				{
					key: "alva",
					availability: [],
					development: [
						{ date: "2026-01-20", area: "technical", note: "Pass" },
					],
					checkpoints: [],
				},
			],
		};

		expect(developmentTimeline(history, notes)).toEqual([
			{
				date: "2026-01-20",
				key: "alva",
				name: "Alva",
				area: "technical",
				note: "Pass",
			},
			{
				date: "2026-02-03",
				key: "bo",
				name: "Bo",
				area: "mental",
				note: "Fokus",
			},
		]);
	});
});
