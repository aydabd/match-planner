/**
 * Core domain types. This module has zero dependency on the DOM or on any
 * UI framework so it can be unit tested in plain Node and reused by any
 * future frontend (or a CLI) without change.
 */

/** A single zone on the pitch (e.g. "back", "mid", "fwd"). */
export interface ZoneConfig {
	/**
	 * Stable identifier ("back", "dmid", "mid", "amid", "fwd"), used as a map
	 * key and saved in matches. The UI names the zone from it
	 * (TEXT.match.zoneName in src/ui/text.ts); there is no separate label.
	 */
	readonly id: string;
	/** How many players stand in this zone at once. */
	readonly count: number;
	/**
	 * IDs of zones a player is allowed to move to from this one.
	 * The adjacency graph encodes rules like "never move directly from
	 * attack to defence" - two zones with no path between them (ignoring
	 * the goalkeeper) can never both appear in one player's history.
	 */
	readonly adjacent: readonly string[];
}

/** A full pitch format, e.g. 7v7. */
export interface FormatConfig {
	readonly id: string;
	readonly label: string;
	/** Outfield zones. Goalkeeper is tracked separately and never rotates. */
	readonly zones: readonly ZoneConfig[];
	/** Suggested squad size range (outfield players, excluding GK), inclusive. */
	readonly squadSizeHint: readonly [min: number, max: number];
	/** Suggested rotation length in seconds, used only as a UI default. */
	readonly defaultRotationSeconds: number;
}

export interface Player {
	readonly id: string;
	name: string;
}

/** Mutable per-player bookkeeping the scheduler needs to stay fair. */
export interface PlayerState {
	readonly id: string;
	/** Total seconds this player has actually been on the pitch. */
	totalSeconds: number;
	/**
	 * Which individual zones this player has stood in so far. A player may
	 * never accumulate more than two, and if two, they must be adjacent -
	 * see scheduler.ts::canAssignZone. This is what replaces a fixed,
	 * precomputed "pool": the constraint is enforced live, per player, so
	 * it works for any roster size or last-second change.
	 */
	zonesPlayed: string[];
	/** True once a coach has marked the player unavailable for the rest of the match. */
	unavailable: boolean;
}

/** The result of generating one rotation. */
export interface RotationAssignment {
	/** zoneId -> ordered list of player IDs standing in that zone. */
	readonly zones: Readonly<Record<string, string[]>>;
	/** Player IDs resting this rotation. */
	readonly bench: readonly string[];
}

export interface SchedulerState {
	readonly format: FormatConfig;
	readonly rotationSeconds: number;
	players: Record<string, PlayerState>;
	/** Order players were added in, used for stable tie-breaking. */
	order: string[];
}

/**
 * The coach's live lineup. RotationAssignment is readonly because it is a
 * pure calculation result; this mutable copy lets manual swaps (an injury
 * sub, a late arrival) edit it in place.
 */
export interface MutableAssignment {
	zones: Record<string, string[]>;
	bench: string[];
}

/** A temporary swap that the clock undoes when its time runs out. */
export interface TempSwap {
	zoneId: string;
	idx: number;
	outId: string;
	inId: string;
	remainingSeconds: number;
}
