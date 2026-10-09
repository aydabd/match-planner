import { whenOf } from "./history.js";
import type { MatchFile } from "./matchFile.js";
import { type PlayerIdMap, playerId } from "./playerIdentity.js";
import type { FairnessPeriod } from "./substitutionRules.js";
import { secondsPlayed } from "./timeline.js";

/**
 * Where each player stands over a period the coach chooses (#171, rule
 * "fairOverTime"): with limited swaps playtime cannot be even in every
 * match, so it should even out over time.
 *
 * Standing is computed from one plain record per player and match, never
 * from timelines directly. In a database that record is a table (or a view
 * over the timelines), and `standing` is a WHERE and a GROUP BY.
 */
export interface PlayerMatchSummary {
	teamId: string;
	matchId: string;
	/** The stable identity from playerIdentity.ts, the same in every match. */
	playerId: string;
	/** The day of the match, "YYYY-MM-DD". */
	date: string;
	/** On the pitch or in goal at kickoff. */
	started: boolean;
	/** Seconds on the pitch or in goal. */
	seconds: number;
}

/**
 * One summary per player in the match's squad. `map` must know every name
 * in the squad (buildPlayerIdMap). Two squad entries with the same name are
 * one player, as in the season history.
 */
export function summariesOf(
	file: MatchFile,
	teamId: string,
	map: PlayerIdMap,
): PlayerMatchSummary[] {
	const played = secondsPlayed(file.timeline, file.endedAt);
	const starters = new Set(file.squad.startingIds);
	const byPlayer = new Map<string, PlayerMatchSummary>();
	for (const player of file.squad.players) {
		const id = playerId(map, player.name);
		const summary = byPlayer.get(id) ?? {
			teamId,
			matchId: file.audit.matchId,
			playerId: id,
			date: whenOf(file).slice(0, 10),
			started: false,
			seconds: 0,
		};
		summary.started ||= starters.has(player.id);
		summary.seconds += played[player.id]?.total ?? 0;
		byPlayer.set(id, summary);
	}
	return [...byPlayer.values()];
}

/** The matches in `period`, oldest first, from the summaries' own dates. */
function matchesIn(
	summaries: readonly PlayerMatchSummary[],
	period: FairnessPeriod,
): Set<string> {
	const dates = new Map<string, string>();
	for (const s of summaries) dates.set(s.matchId, s.date);
	const ordered = [...dates].sort(
		([idA, a], [idB, b]) => a.localeCompare(b) || idA.localeCompare(idB),
	);
	switch (period.kind) {
		case "recentMatches":
			return new Set(ordered.slice(-period.count).map(([id]) => id));
		case "season":
			return new Set(
				ordered
					.filter(([, date]) => date.startsWith(`${period.year}-`))
					.map(([id]) => id),
			);
		case "range":
			return new Set(
				ordered
					.filter(([, date]) => date >= period.from && date <= period.to)
					.map(([id]) => id),
			);
	}
}

/** The summaries of the matches that fall in `period`. */
export function inPeriod(
	summaries: readonly PlayerMatchSummary[],
	period: FairnessPeriod,
): PlayerMatchSummary[] {
	const matches = matchesIn(summaries, period);
	return summaries.filter((s) => matches.has(s.matchId));
}

export interface PlayerStanding {
	playerId: string;
	/** Matches in the period the player was in the squad for. */
	matches: number;
	started: number;
	seconds: number;
	/**
	 * Seconds ahead of (positive) or behind (negative) the team: the
	 * player's average per match against the average of all players, over
	 * the matches the player was in the squad for. Missing a match is not
	 * held against anyone.
	 */
	aheadSeconds: number;
}

/**
 * Each player's standing over `period`, the player furthest behind first
 * (ties by fewer starts, then by id, so the order never depends on input
 * order). Only players with at least one match in the period are listed.
 */
export function standing(
	summaries: readonly PlayerMatchSummary[],
	period: FairnessPeriod,
): PlayerStanding[] {
	const totals = new Map<string, Omit<PlayerStanding, "aheadSeconds">>();
	for (const s of inPeriod(summaries, period)) {
		const t = totals.get(s.playerId) ?? {
			playerId: s.playerId,
			matches: 0,
			started: 0,
			seconds: 0,
		};
		t.matches++;
		if (s.started) t.started++;
		t.seconds += s.seconds;
		totals.set(s.playerId, t);
	}
	const players = [...totals.values()];
	const average =
		players.reduce((sum, p) => sum + p.seconds / p.matches, 0) /
		Math.max(1, players.length);
	return players
		.map((p) => ({
			...p,
			aheadSeconds: Math.round((p.seconds / p.matches - average) * p.matches),
		}))
		.sort(
			(a, b) =>
				a.aheadSeconds - b.aheadSeconds ||
				a.started - b.started ||
				a.playerId.localeCompare(b.playerId),
		);
}
