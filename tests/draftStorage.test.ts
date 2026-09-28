import { describe, expect, it, vi } from "vitest";
import { rosterToJson, serializeRoster } from "../src/core/storage.js";
import { loadDraft, saveDraft } from "../src/ui/draftStorage.js";
import { BrokenStorage, useMemoryStorage } from "./support/memoryStorage.js";

const KEY = "matchplanner:draft:v1";
const EMPTY_DRAFT = serializeRoster("7v7:2-3-1", 600, []);

describe("squad draft storage", () => {
	const { storage } = useMemoryStorage();

	it("starts with an empty 7v7 (2-3-1) squad and 10-minute rotations", () => {
		expect(loadDraft()).toEqual(EMPTY_DRAFT);
	});

	it("still loads a squad saved with the original 7v7 id", () => {
		const draft = serializeRoster("7v7", 600, [{ id: "p1", name: "Alva" }]);
		saveDraft(draft);
		expect(loadDraft()).toEqual(draft);
	});

	it("restores the saved squad", () => {
		const draft = serializeRoster("9v9:3-3-2", 480, [
			{ id: "p1", name: "Alva" },
			{ id: "p2", name: "Bo" },
		]);
		saveDraft(draft);
		expect(loadDraft()).toEqual(draft);
	});

	it("saves in the same format as an exported squad file", () => {
		const draft = serializeRoster("7v7", 600, [{ id: "p1", name: "Alva" }]);
		saveDraft(draft);
		expect(storage().getItem(KEY)).toBe(rosterToJson(draft));
	});

	it.each([
		["corrupted JSON", "{not json"],
		["an invalid squad file", JSON.stringify({ schemaVersion: 99 })],
	])("falls back to an empty squad for %s", (_, raw) => {
		storage().setItem(KEY, raw);
		expect(loadDraft()).toEqual(EMPTY_DRAFT);
	});

	it("keeps working when the browser blocks storage", () => {
		vi.stubGlobal("localStorage", new BrokenStorage());
		expect(() => saveDraft(EMPTY_DRAFT)).not.toThrow();
		expect(loadDraft()).toEqual(EMPTY_DRAFT);
	});
});
