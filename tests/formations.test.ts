import { describe, expect, it } from "vitest";
import { FORMATS, getFormat, outfieldCount } from "../src/core/formations.js";

describe("formations", () => {
	it("every registered format has a non-empty zone list", () => {
		for (const format of Object.values(FORMATS)) {
			expect(format.zones.length).toBeGreaterThan(0);
		}
	});

	it("zone adjacency references only zones that exist in the same format", () => {
		for (const format of Object.values(FORMATS)) {
			const ids = new Set(format.zones.map((z) => z.id));
			for (const zone of format.zones) {
				for (const adj of zone.adjacent) {
					expect(
						ids.has(adj),
						`${format.id}: zone "${zone.id}" references unknown adjacent zone "${adj}"`,
					).toBe(true);
				}
			}
		}
	});

	it("adjacency is symmetric (if A lists B, B lists A)", () => {
		for (const format of Object.values(FORMATS)) {
			const byId = new Map(format.zones.map((z) => [z.id, z]));
			for (const zone of format.zones) {
				for (const adj of zone.adjacent) {
					const other = byId.get(adj);
					expect(other).toBeDefined();
					if (!other) continue;
					expect(
						other.adjacent.includes(zone.id),
						`${format.id}: "${zone.id}"->"${adj}" is not symmetric`,
					).toBe(true);
				}
			}
		}
	});

	it("7v7 has 6 outfield slots (2 back + 3 mid + 1 fwd)", () => {
		expect(outfieldCount(getFormat("7v7"))).toBe(6);
	});

	it("getFormat throws a helpful error for an unknown id", () => {
		expect(() => getFormat("13v13")).toThrow(/Okant format/);
	});
});
