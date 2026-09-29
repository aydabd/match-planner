import { describe, expect, it } from "vitest";
import {
	buildHistory,
	matchesForPlayer,
	mergeMatchFiles,
} from "../src/core/history.js";
import type { MatchFile } from "../src/core/matchFile.js";
import { playerId } from "../src/core/playerIdentity.js";
import { secondsPlayed } from "../src/core/timeline.js";
import {
	makeMatchFile,
	NAMES,
	playerIdMapFor,
	seeded,
} from "./support/matchFiles.js";

/** A season of matches: different squads, dates and months. */
function season(count: number, seed = 100): MatchFile[] {
	const random = seeded(seed);
	return Array.from({ length: count }, (_, i) => {
		const month = String(3 + (i % 8)).padStart(2, "0");
		const day = String(1 + (i % 27)).padStart(2, "0");
		// 8 or 9 of the 10 names, in a different order each time.
		const names = [...NAMES]
			.sort(() => random() - 0.5)
			.slice(0, 8 + Math.floor(random() * 2));
		return makeMatchFile({
			matchId: `m${i}`,
			seed: seed + i,
			date: `2026-${month}-${day}`,
			names,
		});
	});
}

function shuffle<T>(items: readonly T[], seed: number): T[] {
	const random = seeded(seed);
	return [...items].sort(() => random() - 0.5);
}

describe("season history: what is counted", () => {
	const files = [
		makeMatchFile({
			matchId: "a",
			date: "2026-03-07",
			names: ["Ines", "Alva", "Bo", "Cleo", "Dino", "Ebba", "Filip", "Greta"],
			seed: 1,
		}),
		makeMatchFile({
			matchId: "b",
			date: "2026-04-11",
			names: ["Ines", "Alva", "Bo", "Cleo", "Dino", "Ebba", "Filip", "Greta"],
			seed: 2,
		}),
	];

	it("counts matches, starts and minutes per player, recognised by name", async () => {
		const history = buildHistory(files, await playerIdMapFor(files));
		expect(history.matches).toBe(2);
		expect(history.months).toEqual(["2026-03", "2026-04"]);
		const alva = history.players.find((p) => p.name === "Alva");
		expect(alva).toMatchObject({ squadMatches: 2 });
		expect(alva?.started).toBeGreaterThan(0);
		expect(alva?.started).toBeLessThanOrEqual(2);
		const keeper = history.players.find((p) => p.name === "Ines");
		// The first name is the keeper in these files: in goal all match.
		expect(keeper).toMatchObject({
			started: 2,
			startedOnBench: 0,
			totalSeconds: 2 * 1200,
			averageSeconds: 1200,
			zoneSeconds: { goal: 2 * 1200 },
		});
	});

	it("gives minutes per month", async () => {
		const history = buildHistory(files, await playerIdMapFor(files));
		const keeper = history.players.find((p) => p.name === "Ines");
		expect(keeper?.months).toEqual([
			{ month: "2026-03", seconds: 1200, matches: 1 },
			{ month: "2026-04", seconds: 1200, matches: 1 },
		]);
	});

	it("says how many of the latest matches a player started", async () => {
		const history = buildHistory(files, await playerIdMapFor(files));
		const keeper = history.players.find((p) => p.name === "Ines");
		expect(keeper?.recent).toEqual({ started: 2, of: 2 });
	});

	it("counts a player who was only on the bench as a bench start", async () => {
		const bench = makeMatchFile({ names: [...NAMES], matchId: "big", seed: 5 });
		const history = buildHistory([bench], await playerIdMapFor([bench]));
		// 10 in the squad, 7 start (6 on the pitch and the keeper): 3 wait.
		expect(history.players.reduce((n, p) => n + p.startedOnBench, 0)).toBe(3);
		expect(
			history.players.reduce((n, p) => n + p.started + p.startedOnBench, 0),
		).toBe(10);
	});

	it("does not count a late arrival as starting on the bench", async () => {
		const file = makeMatchFile({
			matchId: "late",
			seed: 9,
			names: NAMES.slice(0, 9),
		});
		const late = file.squad.players[8];
		if (!late) throw new Error("no player");
		file.timeline.push({
			type: "lateArrival",
			at: file.endedAt,
			period: 2,
			playerId: late.id,
		});
		file.squad.startingIds = file.squad.startingIds.filter(
			(id) => id !== late.id,
		);
		const player = buildHistory(
			[file],
			await playerIdMapFor([file]),
		).players.find((p) => p.name === late.name);
		expect(player?.startedOnBench).toBe(0);
	});

	it("shows the most recent spelling of a name", async () => {
		const older = makeMatchFile({
			matchId: "x",
			date: "2026-03-01",
			names: ["ines", ...NAMES.slice(1, 9)],
		});
		const newer = makeMatchFile({
			matchId: "y",
			date: "2026-05-01",
			names: ["Ines", ...NAMES.slice(1, 9)],
		});
		const map = await playerIdMapFor([newer, older]);
		const inesKey = playerId(map, "Ines");
		const history = buildHistory([newer, older], map);
		expect(history.players.filter((p) => p.key === inesKey)).toHaveLength(1);
		expect(history.players.find((p) => p.key === inesKey)?.name).toBe("Ines");
	});
});

describe("season history: it can be trusted", () => {
	const files = season(24);

	it("totals equal the sum of the timeline segments, computed independently", async () => {
		const map = await playerIdMapFor(files);
		const history = buildHistory(files, map);
		for (const player of history.players) {
			let expected = 0;
			for (const file of files) {
				for (const p of file.squad.players) {
					if (playerId(map, p.name) !== player.key) continue;
					// The independent count: walk the lineups and add up each stretch.
					let lineup: Record<string, string[]> = {};
					let keeper: string | null = null;
					let from: number | null = null;
					const credit = (until: number) => {
						if (from === null) return;
						const on =
							Object.values(lineup).flat().includes(p.id) || keeper === p.id;
						if (on) expected += until - from;
					};
					for (const e of file.timeline) {
						if (e.type === "periodStart") from = e.at;
						else if (e.type === "periodEnd") {
							credit(e.at);
							from = null;
						} else if (e.type === "lineup") {
							credit(e.at);
							lineup = e.zones;
							keeper = e.keeperId;
							if (from !== null) from = e.at;
						}
					}
				}
			}
			expect(player.totalSeconds).toBe(expected);
		}
	});

	it("gives the same total as secondsPlayed for every file", async () => {
		const history = buildHistory(files, await playerIdMapFor(files));
		const fromFiles = files.reduce(
			(sum, f) =>
				sum +
				Object.values(secondsPlayed(f.timeline, f.endedAt)).reduce(
					(s, p) => s + p.total,
					0,
				),
			0,
		);
		expect(history.players.reduce((s, p) => s + p.totalSeconds, 0)).toBe(
			fromFiles,
		);
	});

	it("adds minutes per position up to the total, and months up to the total", async () => {
		const history = buildHistory(files, await playerIdMapFor(files));
		for (const player of history.players) {
			const byZone = Object.values(player.zoneSeconds).reduce(
				(s, v) => s + v,
				0,
			);
			const byMonth = player.months.reduce((s, m) => s + m.seconds, 0);
			expect(byZone).toBe(player.totalSeconds);
			expect(byMonth).toBe(player.totalSeconds);
			expect(player.months.reduce((s, m) => s + m.matches, 0)).toBe(
				player.squadMatches,
			);
		}
	});

	it("gives the same result whatever order the files come in", async () => {
		const map = await playerIdMapFor(files);
		const expected = buildHistory(files, map);
		for (let seed = 1; seed <= 20; seed++) {
			expect(buildHistory(shuffle(files, seed), map)).toEqual(expected);
		}
	});

	it("does not count a file twice, however often it is imported", async () => {
		const map = await playerIdMapFor(files);
		const expected = buildHistory(files, map);
		const repeated = [...files, ...shuffle(files, 3), ...files.slice(0, 5)];
		expect(buildHistory(repeated, map)).toEqual(expected);
	});

	it("keeps one file per match when imported in pieces, in any order", () => {
		let kept: MatchFile[] = [];
		let counted = 0;
		for (const piece of [
			files.slice(0, 10),
			shuffle(files.slice(5), 4),
			files,
		]) {
			const result = mergeMatchFiles(kept, piece);
			kept = result.files;
			counted += result.newMatches;
		}
		expect(counted).toBe(files.length);
		expect(kept.map((f) => f.audit.matchId).sort()).toEqual(
			files.map((f) => f.audit.matchId).sort(),
		);
	});

	it("keeps the later file when two files claim the same match", () => {
		const first = makeMatchFile({
			matchId: "same",
			createdAt: "2026-03-01T10:00:00.000Z",
			opponent: "Först",
		});
		const second = makeMatchFile({
			matchId: "same",
			createdAt: "2026-03-02T10:00:00.000Z",
			opponent: "Sist",
		});
		for (const order of [
			[first, second],
			[second, first],
		]) {
			const { files: kept, alreadyKnown } = mergeMatchFiles([], order);
			expect(kept).toHaveLength(1);
			expect(kept[0]?.match.opponent).toBe("Sist");
			expect(alreadyKnown).toBe(1);
		}
	});

	it("covers six months or more", async () => {
		const history = buildHistory(files, await playerIdMapFor(files));
		expect(history.months.length).toBeGreaterThanOrEqual(6);
	});
});

describe("matchesForPlayer - which matches a player was in the squad for", () => {
	it("lists only the matches that player's squad included, oldest first", async () => {
		const a = makeMatchFile({
			matchId: "a",
			date: "2026-03-01",
			opponent: "Först",
			names: ["Alva", "Bo", "Cleo", "Dino", "Ebba", "Filip", "Greta", "Hugo"],
		});
		const b = makeMatchFile({
			matchId: "b",
			date: "2026-04-01",
			opponent: "Sen",
			names: ["Bo", "Cleo", "Dino", "Ebba", "Filip", "Greta", "Hugo", "Ines"],
		});
		const map = await playerIdMapFor([a, b]);
		expect(matchesForPlayer([b, a], map, playerId(map, "Alva"))).toEqual([
			{
				matchId: "a",
				opponent: "Först",
				date: "2026-03-01",
				formatId: "7v7:2-3-1",
			},
		]);
		expect(matchesForPlayer([b, a], map, playerId(map, "Bo"))).toEqual([
			{
				matchId: "a",
				opponent: "Först",
				date: "2026-03-01",
				formatId: "7v7:2-3-1",
			},
			{
				matchId: "b",
				opponent: "Sen",
				date: "2026-04-01",
				formatId: "7v7:2-3-1",
			},
		]);
	});

	it("returns nothing for a player never in any squad", async () => {
		const a = makeMatchFile({ matchId: "a", names: ["Alva", "Bo"] });
		const map = await playerIdMapFor([a]);
		expect(matchesForPlayer([a], map, "nobody")).toEqual([]);
	});

	it("counts a match once however often its file is given", async () => {
		const a = makeMatchFile({ matchId: "a", names: ["Alva", "Bo"] });
		const map = await playerIdMapFor([a]);
		expect(matchesForPlayer([a, a], map, playerId(map, "Alva"))).toHaveLength(
			1,
		);
	});
});
