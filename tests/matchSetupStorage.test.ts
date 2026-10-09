import { describe, expect, it } from "vitest";
import { STORAGE_KEYS, teamScoped } from "../src/ui/appStorage.js";
import { loadMatchSetup, saveMatchSetup } from "../src/ui/matchSetupStorage.js";
import { activeTeamId } from "../src/ui/teamStorage.js";
import { useMemoryStorage } from "./support/memoryStorage.js";

describe("match setup choices", () => {
	const { storage } = useMemoryStorage();
	const key = () => teamScoped(STORAGE_KEYS.matchSetup, activeTeamId());

	it("is the team's rules and no changes when nothing is saved", () => {
		expect(loadMatchSetup()).toEqual({ rules: null, choices: {} });
	});

	it("keeps a match's own rules and the coach's changes", () => {
		const setup = {
			rules: {
				kind: "limited",
				substitutesIn: 7,
				occasions: null,
				reEntry: true,
			},
			choices: { p1: "start", p2: "sitOut" },
		} as const;
		saveMatchSetup(setup);
		expect(loadMatchSetup()).toEqual(setup);
	});

	it.each([
		["broken JSON", "{"],
		["unknown rules", JSON.stringify({ rules: { kind: "x" }, choices: {} })],
		[
			"an unknown choice",
			JSON.stringify({ rules: null, choices: { p1: "x" } }),
		],
		["choices as a list", JSON.stringify({ rules: null, choices: [] })],
	])("ignores %s", (_, raw) => {
		storage().setItem(key(), raw);
		expect(loadMatchSetup()).toEqual({ rules: null, choices: {} });
	});
});
