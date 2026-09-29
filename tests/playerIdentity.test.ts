import { describe, expect, it } from "vitest";
import { buildPlayerIdMap, playerId } from "../src/core/playerIdentity.js";
import { uuidv5 } from "../src/core/securePackage.js";

describe("buildPlayerIdMap / playerId", () => {
	it("resolves a name to its stable uuidv5 id", async () => {
		const map = await buildPlayerIdMap(["Ada Lovelace"]);
		expect(playerId(map, "Ada Lovelace")).toBe(await uuidv5("Ada Lovelace"));
	});

	it("resolves names that only differ by case or whitespace to the same id", async () => {
		const map = await buildPlayerIdMap([" Ada Lovelace "]);
		expect(playerId(map, "ADA LOVELACE")).toBe(playerId(map, "ada lovelace"));
	});

	it("gives different ids to different names", async () => {
		const map = await buildPlayerIdMap(["Ada", "Grace"]);
		expect(playerId(map, "Ada")).not.toBe(playerId(map, "Grace"));
	});

	it("dedupes repeated names when building the map", async () => {
		const map = await buildPlayerIdMap(["Ada", "Ada", "Ada"]);
		expect(map.size).toBe(1);
	});

	it("throws for a name the map was not built from", async () => {
		const map = await buildPlayerIdMap(["Ada"]);
		expect(() => playerId(map, "Grace")).toThrow();
	});
});
