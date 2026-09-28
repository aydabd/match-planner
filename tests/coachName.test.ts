import { describe, expect, it } from "vitest";
import { loadCoachName, saveCoachName } from "../src/ui/coachName.js";
import { useMemoryStorage } from "./support/memoryStorage.js";

describe("coach name", () => {
	useMemoryStorage();

	it("is empty until the coach types it", () => {
		expect(loadCoachName()).toBe("");
	});

	it("is remembered, trimmed and kept within the length limit", () => {
		saveCoachName("  Aydin  ");
		expect(loadCoachName()).toBe("Aydin");

		saveCoachName("x".repeat(80));
		expect(loadCoachName()).toHaveLength(40);
	});
});
