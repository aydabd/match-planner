import { canonicalizePlayerName, uuidv5 } from "./securePackage.js";

/**
 * A stable, name-derived player identity (#81), replacing history.ts's old
 * nameKey (a lowercased name - trivially the name itself) with a uuidv5:
 * a player-notes file's key no longer reveals who it is about on its own.
 *
 * uuidv5 hashes via WebCrypto, so it is async; the rest of the season-stats
 * code (history.ts, playerNotes.ts, seasonReport.ts, visualizations.ts)
 * stays synchronous and pure. buildPlayerIdMap is the one place that does
 * the async work, once, for every name in play; everything else does a
 * plain, sync map lookup through playerId.
 */
export type PlayerIdMap = ReadonlyMap<string, string>;

/** Every distinct name in `names`, resolved to its stable id, once each. */
export async function buildPlayerIdMap(
	names: readonly string[],
): Promise<PlayerIdMap> {
	const map = new Map<string, string>();
	for (const name of names) {
		const canonical = canonicalizePlayerName(name);
		if (!map.has(canonical)) map.set(canonical, await uuidv5(name));
	}
	return map;
}

/**
 * A name's stable id, from a map built by buildPlayerIdMap. Throws if
 * `name` was not part of the names the map was built from - every caller
 * must resolve the full universe of names first, so this is a programmer
 * error, not something a coach's input can trigger.
 */
export function playerId(map: PlayerIdMap, name: string): string {
	const id = map.get(canonicalizePlayerName(name));
	if (id === undefined) {
		throw new Error(`No id resolved for player name ${JSON.stringify(name)}`);
	}
	return id;
}
