import {
	DEVELOPMENT_AREAS as AREAS,
	currentTeamSize,
} from "../core/developmentCheckpoints.js";
import type { TeamSizeId } from "../core/formations.js";
import { buildHistory, type SeasonHistory, whenOf } from "../core/history.js";
import { buildPlayerIdMap, type PlayerIdMap } from "../core/playerIdentity.js";
import type { DevelopmentArea } from "../core/playerNotes.js";
import { loadMatchFiles } from "./matchFileStorage.js";
import { TEXT } from "./text.js";

/** Everything the statistics-family pages derive from the saved match files. */
export interface SeasonData {
	history: SeasonHistory;
	map: PlayerIdMap;
	/** The squad's team size right now, from its latest match - stands in for
	 * an age class (#109), no new setup field needed since SvFF's own match
	 * formats already carry the ages (see policy.ts's POLICY.formats). One
	 * value for the whole squad, not per player. */
	teamSize: TeamSizeId;
	/** Steps in each area's checkpoint ladder at `teamSize`. */
	levelCounts: Record<DevelopmentArea, number>;
}

/** Reads the match files fresh and computes the season once, for one page render. */
export async function loadSeasonData(): Promise<SeasonData> {
	const files = loadMatchFiles();
	const map = await buildPlayerIdMap(
		files.flatMap((f) => f.squad.players.map((p) => p.name)),
	);
	const history = buildHistory(files, map);
	const teamSize = currentTeamSize(
		files.map((f) => ({ formatId: f.setup.formatId, date: whenOf(f) })),
	);
	const levelCounts = Object.fromEntries(
		AREAS.map((area) => [
			area,
			TEXT.history.playerNotes.checkpointLadders[teamSize][area].length,
		]),
	) as Record<DevelopmentArea, number>;
	return { history, map, teamSize, levelCounts };
}
