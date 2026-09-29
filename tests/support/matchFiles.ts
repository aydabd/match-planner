import { getFormat } from "../../src/core/formations.js";
import { type MatchFile, startersOf } from "../../src/core/matchFile.js";
import {
	buildPlayerIdMap,
	type PlayerIdMap,
} from "../../src/core/playerIdentity.js";
import type { TimelineEvent } from "../../src/core/timeline.js";

/** A small deterministic random number generator, so failures can be replayed. */
export function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const NAMES = [
	"Alva",
	"Bo",
	"Cleo",
	"Dino",
	"Ebba",
	"Filip",
	"Greta",
	"Hugo",
	"Ines",
	"Jonas",
];

function shuffled<T>(items: readonly T[], random: () => number): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
	}
	return copy;
}

interface Options {
	matchId?: string;
	/** "YYYY-MM-DD" or with time. */
	date?: string;
	createdAt?: string;
	opponent?: string;
	/** Player names in the squad (default: 9 of NAMES). */
	names?: readonly string[];
	seed?: number;
	periods?: number;
	periodMinutes?: number;
}

/**
 * A valid 7v7 (2-3-1) match file with random lineups. Player ids differ from
 * file to file, as they do between real squads, and lineups change several
 * times per period, so the statistics have something to add up.
 */
export function makeMatchFile(options: Options = {}): MatchFile {
	const random = seeded(options.seed ?? 1);
	const format = getFormat("7v7");
	const periods = options.periods ?? 2;
	const periodSeconds = (options.periodMinutes ?? 10) * 60;
	const names = options.names ?? NAMES.slice(0, 9);
	const ids = shuffled(
		names.map((_, i) => `p${i + 1}`),
		random,
	);
	const players = names.map((name, i) => ({
		id: ids[i] as string,
		name,
		goalkeeper: i === 0,
	}));
	const keeperId = players[0]?.id ?? null;
	const outfield = players.slice(1).map((p) => p.id);

	const lineup = (at: number): TimelineEvent => {
		const pool = shuffled(outfield, random);
		const zones: Record<string, string[]> = {};
		for (const zone of format.zones)
			zones[zone.id] = pool.splice(0, zone.count);
		return { type: "lineup", at, zones, keeperId };
	};

	const timeline: TimelineEvent[] = [];
	for (let period = 1; period <= periods; period++) {
		const start = (period - 1) * periodSeconds;
		timeline.push({ type: "periodStart", at: start, period });
		timeline.push(lineup(start));
		const changes = 1 + Math.floor(random() * 3);
		for (let i = 1; i <= changes; i++) {
			timeline.push(
				lineup(start + Math.floor((periodSeconds * i) / (changes + 1))),
			);
		}
		timeline.push({ type: "periodEnd", at: start + periodSeconds, period });
	}
	const matchId = options.matchId ?? `match-${options.seed ?? 1}`;
	return {
		schemaVersion: 1,
		audit: {
			matchId,
			createdAt: options.createdAt ?? "2026-09-05T12:00:00.000Z",
			createdBy: "Tränare",
			appVersion: "0.7.0",
		},
		match: {
			opponent: options.opponent ?? "IFK Test",
			venue: "Hemmaplan",
			date: options.date ?? "2026-09-05",
		},
		setup: {
			formatId: format.id,
			periods,
			periodSeconds,
			rotationSeconds: 300,
		},
		squad: { players, startingIds: startersOf(timeline) },
		timeline,
		endedAt: periods * periodSeconds,
	};
}

/** A PlayerIdMap covering every player named across `files`, for tests. */
export function playerIdMapFor(
	files: readonly MatchFile[],
): Promise<PlayerIdMap> {
	return buildPlayerIdMap(
		files.flatMap((f) => f.squad.players.map((p) => p.name)),
	);
}
