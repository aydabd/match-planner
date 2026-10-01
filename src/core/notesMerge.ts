import type { CheckpointEvent } from "./developmentCheckpoints.js";
import { LIMITS } from "./limits.js";
import type {
	AvailabilityEntry,
	DevelopmentEntry,
	PlayerNotes,
	PlayerNotesFile,
} from "./playerNotes.js";

/**
 * Merges two devices' player notes into one (#135). Each device backs up
 * only its own notes file, so restore reads every device's file and folds
 * them together. The merge is a union: nothing either side added is lost,
 * and the result is the same whichever file is read first and however
 * often a file is merged again, so no ordering of devices can matter.
 *
 * - availability: one entry per match; if two devices recorded the same
 *   match differently, the one that sorts last as JSON wins on every
 *   device (arbitrary but identical everywhere).
 * - development notes: the union by date, area and text, oldest first,
 *   capped to the newest LIMITS.developmentNotesPerPlayer.
 * - checkpoints: the union by area and level; the earliest date wins.
 *
 * Known limit: a union cannot tell "removed" from "never seen", so undoing
 * a checkpoint on one device (#120) is not carried to the others.
 */
export function mergePlayerNotes(
	a: PlayerNotesFile,
	b: PlayerNotesFile,
): PlayerNotesFile {
	const keys = new Set([...a.players, ...b.players].map((p) => p.key));
	const players = [...keys].sort().map((key) =>
		mergeOne(
			key,
			a.players.find((p) => p.key === key),
			b.players.find((p) => p.key === key),
		),
	);
	return { schemaVersion: 1, players };
}

function mergeOne(
	key: string,
	a: PlayerNotes | undefined,
	b: PlayerNotes | undefined,
): PlayerNotes {
	return {
		key,
		availability: mergeAvailability([
			...(a?.availability ?? []),
			...(b?.availability ?? []),
		]),
		development: mergeDevelopment([
			...(a?.development ?? []),
			...(b?.development ?? []),
		]),
		checkpoints: mergeCheckpoints([
			...(a?.checkpoints ?? []),
			...(b?.checkpoints ?? []),
		]),
	};
}

function mergeAvailability(entries: AvailabilityEntry[]): AvailabilityEntry[] {
	const byMatch = new Map<string, AvailabilityEntry>();
	for (const entry of entries) {
		const kept = byMatch.get(entry.matchId);
		if (!kept || JSON.stringify(entry) > JSON.stringify(kept)) {
			byMatch.set(entry.matchId, entry);
		}
	}
	return [...byMatch.values()].sort((x, y) =>
		x.matchId < y.matchId ? -1 : x.matchId > y.matchId ? 1 : 0,
	);
}

function mergeDevelopment(entries: DevelopmentEntry[]): DevelopmentEntry[] {
	const unique = new Map<string, DevelopmentEntry>();
	for (const entry of entries) {
		unique.set(JSON.stringify([entry.date, entry.area, entry.note]), entry);
	}
	return [...unique.entries()]
		.sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
		.map(([, entry]) => entry)
		.slice(-LIMITS.developmentNotesPerPlayer);
}

function mergeCheckpoints(events: CheckpointEvent[]): CheckpointEvent[] {
	const byLevel = new Map<string, CheckpointEvent>();
	for (const event of events) {
		const id = `${event.area}:${event.level}`;
		const kept = byLevel.get(id);
		if (!kept || event.date < kept.date) byLevel.set(id, event);
	}
	return [...byLevel.entries()]
		.sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
		.map(([, event]) => event);
}
