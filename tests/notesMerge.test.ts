import { describe, expect, it } from "vitest";
import { mergePlayerNotes } from "../src/core/notesMerge.js";
import {
	EMPTY_PLAYER_NOTES_FILE,
	type PlayerNotesFile,
	withAvailability,
	withCheckpoint,
	withDevelopment,
} from "../src/core/playerNotes.js";

const deviceA = (): PlayerNotesFile => {
	let f = EMPTY_PLAYER_NOTES_FILE;
	f = withAvailability(f, "alva", {
		matchId: "m1",
		status: "absent",
		reason: "injury",
	});
	f = withDevelopment(f, "alva", {
		date: "2026-09-01",
		area: "physical",
		note: "Snabbare",
	});
	f = withCheckpoint(f, "alva", "technical", 1, "2026-09-02");
	f = withDevelopment(f, "bo", {
		date: "2026-09-03",
		area: "mental",
		note: "Peppar",
	});
	return f;
};
const deviceB = (): PlayerNotesFile => {
	let f = EMPTY_PLAYER_NOTES_FILE;
	f = withAvailability(f, "alva", { matchId: "m2", status: "available" });
	f = withDevelopment(f, "alva", {
		date: "2026-09-10",
		area: "tactical",
		note: "Luckor",
	});
	f = withCheckpoint(f, "alva", "technical", 1, "2026-09-05");
	f = withCheckpoint(f, "alva", "technical", 2, "2026-09-12");
	f = withDevelopment(f, "cleo", {
		date: "2026-09-04",
		area: "technical",
		note: "Vänsterfot",
	});
	return f;
};

describe("mergePlayerNotes", () => {
	it("keeps what each device added, for the same and for different players", () => {
		const merged = mergePlayerNotes(deviceA(), deviceB());
		const alva = merged.players.find((p) => p.key === "alva");
		expect(alva?.availability.map((a) => a.matchId).sort()).toEqual([
			"m1",
			"m2",
		]);
		expect(alva?.development.map((d) => d.note)).toEqual([
			"Snabbare",
			"Luckor",
		]);
		expect(alva?.checkpoints.map((c) => c.level).sort()).toEqual([1, 2]);
		expect(merged.players.map((p) => p.key)).toEqual(["alva", "bo", "cleo"]);
	});

	it("gives the same result whichever file is read first", () => {
		expect(mergePlayerNotes(deviceA(), deviceB())).toEqual(
			mergePlayerNotes(deviceB(), deviceA()),
		);
	});

	it("is unchanged by merging the same file again", () => {
		const once = mergePlayerNotes(deviceA(), deviceB());
		expect(mergePlayerNotes(once, deviceB())).toEqual(once);
		expect(mergePlayerNotes(once, once)).toEqual(once);
	});

	it("does not duplicate a development note both devices have", () => {
		const merged = mergePlayerNotes(deviceA(), deviceA());
		expect(
			merged.players.find((p) => p.key === "alva")?.development,
		).toHaveLength(1);
	});

	it("keeps the earliest date when both marked the same level", () => {
		const merged = mergePlayerNotes(deviceA(), deviceB());
		const level1 = merged.players
			.find((p) => p.key === "alva")
			?.checkpoints.find((c) => c.level === 1);
		expect(level1?.date).toBe("2026-09-02");
	});

	it("picks the same availability on every device when two disagree about one match", () => {
		const present = withAvailability(EMPTY_PLAYER_NOTES_FILE, "alva", {
			matchId: "m1",
			status: "available",
		});
		const absent = withAvailability(EMPTY_PLAYER_NOTES_FILE, "alva", {
			matchId: "m1",
			status: "absent",
			reason: "illness",
		});
		const one = mergePlayerNotes(present, absent);
		expect(one).toEqual(mergePlayerNotes(absent, present));
		expect(one.players[0]?.availability).toHaveLength(1);
	});

	it("merging with an empty file just returns the notes", () => {
		expect(mergePlayerNotes(deviceA(), EMPTY_PLAYER_NOTES_FILE)).toEqual(
			mergePlayerNotes(deviceA(), deviceA()),
		);
	});

	it("never grows a player past the development note cap, dropping the oldest", () => {
		let a = EMPTY_PLAYER_NOTES_FILE;
		let b = EMPTY_PLAYER_NOTES_FILE;
		for (let i = 0; i < 150; i++) {
			const day = String((i % 28) + 1).padStart(2, "0");
			a = withDevelopment(a, "alva", {
				date: `2026-01-${day}`,
				area: "physical",
				note: `a${i}`,
			});
			b = withDevelopment(b, "alva", {
				date: `2026-02-${day}`,
				area: "mental",
				note: `b${i}`,
			});
		}
		const dev = mergePlayerNotes(a, b).players[0]?.development ?? [];
		expect(dev).toHaveLength(200);
		expect(dev[dev.length - 1]?.date.startsWith("2026-02")).toBe(true);
	});
});
