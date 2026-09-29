import { LIMITS } from "./limits.js";
import { type MatchFile, matchFileToJson } from "./matchFile.js";
import type { PlayerIdMap } from "./playerIdentity.js";
import { playerId } from "./playerIdentity.js";
import { secondsPlayed } from "./timeline.js";

/**
 * The season history (#38): per player, over many matches, how often they
 * started, how many minutes they played and where. Everything is computed
 * from the match files' timelines and nothing is stored separately, so:
 *
 * - the same match file imported twice counts once (keyed by match id),
 * - files can come in any order and give the same totals,
 * - minutes per position always add up to the total minutes.
 *
 * A player is recognised by name (trimmed, ignoring capitals): squad ids
 * like "p1" are only unique within one squad. Two players with the same
 * name in one squad count as one. The recognition itself is
 * playerIdentity.ts's stable uuidv5 (#81), not the name - buildHistory and
 * matchesForPlayer take an already-built PlayerIdMap (see that module for
 * why the id lookup is a separate, one-time async step) rather than
 * hashing internally, so this module stays synchronous.
 */

export interface MonthTotal {
	/** "YYYY-MM". */
	month: string;
	seconds: number;
	matches: number;
}

export interface PlayerHistory {
	/** How the player is recognised: the name in lower case. */
	key: string;
	/** The name as written in the most recent match. */
	name: string;
	/** Matches the player was in the squad for. */
	squadMatches: number;
	/** Matches where they played at least a second. */
	playedMatches: number;
	/** Matches they were on the pitch or in goal at kickoff. */
	started: number;
	/** Matches they were in the squad but not in the first lineup (not late arrivals). */
	startedOnBench: number;
	totalSeconds: number;
	/** Average per match in the squad. */
	averageSeconds: number;
	/** Seconds per line: "goal", "back", "dmid", "mid", "amid", "fwd". */
	zoneSeconds: Record<string, number>;
	/** Oldest month first. */
	months: MonthTotal[];
	/** Kickoffs among the player's latest matches (at most LIMITS.recentMatches). */
	recent: { started: number; of: number };
}

export interface SeasonHistory {
	matches: number;
	/** Every month that has a match, oldest first. */
	months: string[];
	players: PlayerHistory[];
}

/** When the match was played: its date, or when the file was made. */
export function whenOf(file: MatchFile): string {
	return file.match.date || file.audit.createdAt;
}

/**
 * Which of two files for the same match to keep: the later one, and if they
 * are made at the same time, the one whose text sorts last. The choice never
 * depends on the order the files came in.
 */
function newer(a: MatchFile, b: MatchFile): MatchFile {
	if (a.audit.createdAt !== b.audit.createdAt) {
		return Date.parse(a.audit.createdAt) > Date.parse(b.audit.createdAt)
			? a
			: b;
	}
	return matchFileToJson(a) >= matchFileToJson(b) ? a : b;
}

/** Match files ordered oldest first (ties by match id): a stable order. */
function chronological(files: readonly MatchFile[]): MatchFile[] {
	return [...files].sort(
		(a, b) =>
			whenOf(a).localeCompare(whenOf(b)) ||
			a.audit.matchId.localeCompare(b.audit.matchId),
	);
}

/**
 * Add match files to the ones already kept. A file for a match that is
 * already there is not counted again. The result is in a stable order, so
 * adding files in any order gives the same list.
 */
export function mergeMatchFiles(
	kept: readonly MatchFile[],
	added: readonly MatchFile[],
): { files: MatchFile[]; newMatches: number; alreadyKnown: number } {
	const byId = new Map(kept.map((f) => [f.audit.matchId, f] as const));
	let newMatches = 0;
	let alreadyKnown = 0;
	for (const file of added) {
		const existing = byId.get(file.audit.matchId);
		if (existing) {
			alreadyKnown++;
			byId.set(file.audit.matchId, newer(existing, file));
		} else {
			newMatches++;
			byId.set(file.audit.matchId, file);
		}
	}
	return {
		files: chronological([...byId.values()]).slice(-LIMITS.storedMatches),
		newMatches,
		alreadyKnown,
	};
}

/**
 * The matches (id, opponent, date) a player was in the squad for, oldest
 * first, a match counted once however often its file is given - so a
 * player-notes screen can offer "which match" without its own dedup or
 * ordering rules. `key` and `map` come from the same PlayerHistory this
 * player was found in (playerNotes.ts's key is this module's id).
 */
export function matchesForPlayer(
	files: readonly MatchFile[],
	map: PlayerIdMap,
	key: string,
): { matchId: string; opponent: string; date: string; formatId: string }[] {
	return mergeMatchFiles([], files)
		.files.filter((f) =>
			f.squad.players.some((p) => playerId(map, p.name) === key),
		)
		.map((f) => ({
			matchId: f.audit.matchId,
			opponent: f.match.opponent,
			date: whenOf(f),
			formatId: f.setup.formatId,
		}));
}

interface Appearance {
	name: string;
	started: boolean;
	lateArrival: boolean;
	seconds: number;
	zoneSeconds: Record<string, number>;
}

/** Each recognised player's part in one match. */
function appearances(
	file: MatchFile,
	map: PlayerIdMap,
): Map<string, Appearance> {
	const played = secondsPlayed(file.timeline, file.endedAt);
	const late = new Set(
		file.timeline.flatMap((e) =>
			e.type === "lateArrival" ? [e.playerId] : [],
		),
	);
	const starters = new Set(file.squad.startingIds);
	const result = new Map<string, Appearance>();
	for (const player of file.squad.players) {
		const key = playerId(map, player.name);
		const entry = result.get(key) ?? {
			name: player.name,
			started: false,
			lateArrival: false,
			seconds: 0,
			zoneSeconds: {},
		};
		entry.started ||= starters.has(player.id);
		entry.lateArrival ||= late.has(player.id);
		const own = played[player.id];
		if (own) {
			entry.seconds += own.total;
			for (const [zone, seconds] of Object.entries(own.byZone)) {
				entry.zoneSeconds[zone] = (entry.zoneSeconds[zone] ?? 0) + seconds;
			}
		}
		result.set(key, entry);
	}
	return result;
}

export function buildHistory(
	files: readonly MatchFile[],
	map: PlayerIdMap,
): SeasonHistory {
	const unique = mergeMatchFiles([], files).files;
	const ordered = chronological(unique);
	const months = [...new Set(ordered.map((f) => whenOf(f).slice(0, 7)))];
	const people = new Map<string, PlayerHistory>();
	// Per player, whether they started in each squad match, oldest first.
	const startsByPlayer = new Map<string, boolean[]>();

	for (const file of ordered) {
		const month = whenOf(file).slice(0, 7);
		for (const [key, part] of appearances(file, map)) {
			const person = people.get(key) ?? {
				key,
				name: part.name,
				squadMatches: 0,
				playedMatches: 0,
				started: 0,
				startedOnBench: 0,
				totalSeconds: 0,
				averageSeconds: 0,
				zoneSeconds: {},
				months: [],
				recent: { started: 0, of: 0 },
			};
			// Oldest first, so the last file's spelling is the one shown.
			person.name = part.name;
			person.squadMatches++;
			if (part.seconds > 0) person.playedMatches++;
			if (part.started) person.started++;
			else if (!part.lateArrival) person.startedOnBench++;
			person.totalSeconds += part.seconds;
			for (const [zone, seconds] of Object.entries(part.zoneSeconds)) {
				person.zoneSeconds[zone] = (person.zoneSeconds[zone] ?? 0) + seconds;
			}
			const monthTotal = person.months.find((m) => m.month === month);
			if (monthTotal) {
				monthTotal.seconds += part.seconds;
				monthTotal.matches++;
			} else {
				person.months.push({ month, seconds: part.seconds, matches: 1 });
			}
			people.set(key, person);
			startsByPlayer.set(key, [
				...(startsByPlayer.get(key) ?? []),
				part.started,
			]);
		}
	}

	const players = [...people.values()].map((person) => {
		const recent = (startsByPlayer.get(person.key) ?? []).slice(
			-LIMITS.recentMatches,
		);
		return {
			...person,
			averageSeconds: person.totalSeconds / person.squadMatches,
			recent: { started: recent.filter(Boolean).length, of: recent.length },
		};
	});
	players.sort(
		(a, b) => a.name.localeCompare(b.name, "sv") || a.key.localeCompare(b.key),
	);
	return { matches: ordered.length, months, players };
}
