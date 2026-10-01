import { describe, expect, it, vi } from "vitest";
import { newRoster, rosterToJson } from "../src/core/storage.js";
import { STORAGE_KEYS, teamScoped } from "../src/ui/appStorage.js";
import { loadDraft, saveDraft } from "../src/ui/draftStorage.js";
import { activeTeamId } from "../src/ui/teamStorage.js";
import { BrokenStorage, useMemoryStorage } from "./support/memoryStorage.js";

const key = () => teamScoped(STORAGE_KEYS.draft, activeTeamId());
const EMPTY_DRAFT = newRoster({ formatId: "7v7:2-3-1", rotationSeconds: 600 });

describe("squad draft storage", () => {
	const { storage } = useMemoryStorage();

	it("starts with an empty 7v7 (2-3-1) squad and 10-minute rotations", () => {
		expect(loadDraft()).toEqual(EMPTY_DRAFT);
	});

	it("still loads a squad saved with the original 7v7 id, as 7v7 (2-3-1)", () => {
		const players = [{ id: "p1", name: "Alva" }];
		saveDraft(
			newRoster({ formatId: "7v7", rotationSeconds: 600, players: players }),
		);
		expect(loadDraft()).toEqual(
			newRoster({
				formatId: "7v7:2-3-1",
				rotationSeconds: 600,
				players: players,
			}),
		);
	});

	it("keeps the chosen format and minutes before any player is added", () => {
		const draft = newRoster({ formatId: "9v9:2-2-2-2", rotationSeconds: 480 });
		saveDraft(draft);
		expect(loadDraft()).toEqual(draft);
	});

	it("restores the saved squad", () => {
		const draft = newRoster({
			formatId: "9v9:3-3-2",
			rotationSeconds: 480,
			players: [
				{ id: "p1", name: "Alva" },
				{ id: "p2", name: "Bo" },
			],
		});
		saveDraft(draft);
		expect(loadDraft()).toEqual(draft);
	});

	it("saves in the same format as an exported squad file", () => {
		const draft = newRoster({
			formatId: "7v7",
			rotationSeconds: 600,
			players: [{ id: "p1", name: "Alva" }],
		});
		saveDraft(draft);
		expect(storage().getItem(key())).toBe(rosterToJson(draft));
	});

	it.each([
		["corrupted JSON", "{not json"],
		["an invalid squad file", JSON.stringify({ schemaVersion: 99 })],
	])("falls back to an empty squad for %s", (_, raw) => {
		storage().setItem(key(), raw);
		expect(loadDraft()).toEqual(EMPTY_DRAFT);
	});

	it("keeps working when the browser blocks storage", () => {
		vi.stubGlobal("localStorage", new BrokenStorage());
		expect(() => saveDraft(EMPTY_DRAFT)).not.toThrow();
		expect(loadDraft()).toEqual(EMPTY_DRAFT);
	});
});
