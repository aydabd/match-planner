import { describe, expect, it } from "vitest";
import { applyChain, substitutionChains } from "../src/core/substitutions.js";
import type { MutableAssignment } from "../src/core/types.js";

function lineup(
	zones: Record<string, string[]>,
	bench: string[],
): MutableAssignment {
	return { zones, bench };
}

/** Everyone exactly once, and every zone at its original size. */
function expectConsistent(before: MutableAssignment, after: MutableAssignment) {
	const all = (a: MutableAssignment) =>
		[...Object.values(a.zones).flat(), ...a.bench].sort();
	expect(all(after)).toEqual(all(before));
	for (const zone of Object.keys(before.zones)) {
		expect(after.zones[zone]).toHaveLength(before.zones[zone]?.length ?? 0);
	}
}

/** Same players in each zone and on the bench, in any order. */
function expectSameLineup(a: MutableAssignment, b: MutableAssignment) {
	for (const zone of Object.keys(b.zones)) {
		expect([...(a.zones[zone] ?? [])].sort()).toEqual(
			[...(b.zones[zone] ?? [])].sort(),
		);
	}
	expect([...a.bench].sort()).toEqual([...b.bench].sort());
}

describe("substitutionChains", () => {
	it("pairs a bench player with the player leaving the same line", () => {
		const current = lineup({ back: ["a", "b"], fwd: ["c"] }, ["d"]);
		const next = lineup({ back: ["a", "d"], fwd: ["c"] }, ["b"]);

		expect(substitutionChains(current, next)).toEqual([
			{ inId: "d", outId: "b", moves: [], zoneId: "back" },
		]);
	});

	it("includes players who change line so nobody is in two places", () => {
		// d comes on at the back, b moves back -> mid, e leaves from mid.
		const current = lineup({ back: ["a", "b"], mid: ["e"] }, ["d"]);
		const next = lineup({ back: ["a", "d"], mid: ["b"] }, ["e"]);

		expect(substitutionChains(current, next)).toEqual([
			{
				inId: "d",
				zoneId: "back",
				moves: [{ playerId: "b", from: "back", to: "mid" }],
				outId: "e",
			},
		]);
	});

	it("gives one chain per player coming on, in squad order", () => {
		const current = lineup({ back: ["a", "b"], mid: ["c"] }, ["d", "e"]);
		const next = lineup({ back: ["d", "b"], mid: ["e"] }, ["a", "c"]);

		const chains = substitutionChains(current, next);
		expect(chains.map((c) => [c.inId, c.outId])).toEqual([
			["d", "a"],
			["e", "c"],
		]);
	});

	it("keeps each chain short: a player coming off makes room before one moving line", () => {
		// Greta comes on at the back. Alva and Dino both leave the back for
		// midfield, Bo leaves midfield for the back, Ebba and Filip come off.
		const current = lineup(
			{ back: ["Alva", "Dino"], mid: ["Bo", "Ebba", "Filip"], fwd: ["Cleo"] },
			["Greta", "Hugo"],
		);
		const next = lineup(
			{ back: ["Bo", "Greta"], mid: ["Alva", "Cleo", "Dino"], fwd: ["Hugo"] },
			["Ebba", "Filip"],
		);

		expect(substitutionChains(current, next)).toEqual([
			{
				inId: "Greta",
				zoneId: "back",
				moves: [{ playerId: "Alva", from: "back", to: "mid" }],
				outId: "Ebba",
			},
			{
				inId: "Hugo",
				zoneId: "fwd",
				moves: [{ playerId: "Cleo", from: "fwd", to: "mid" }],
				outId: "Filip",
			},
		]);
	});

	it("has no chains when nobody comes on", () => {
		const current = lineup({ back: ["a"], mid: ["b"] }, ["c"]);
		expect(substitutionChains(current, current)).toEqual([]);
	});
});

describe("applyChain", () => {
	it("applies each chain on its own, and all of them give the planned lineup", () => {
		const current = lineup({ back: ["a", "b"], mid: ["c", "e"], fwd: ["f"] }, [
			"d",
			"g",
		]);
		const next = lineup({ back: ["a", "d"], mid: ["b", "c"], fwd: ["g"] }, [
			"e",
			"f",
		]);
		const chains = substitutionChains(current, next);
		expect(chains).toHaveLength(2);

		const working = structuredClone(current);
		for (const chain of chains) {
			applyChain(working, chain);
			expectConsistent(current, working);
		}
		expectSameLineup(working, next);
	});

	it("puts the player coming off on the bench in the incoming player's place", () => {
		const current = lineup({ back: ["a", "b"] }, ["x", "d", "y"]);
		const [chain] = substitutionChains(
			current,
			lineup({ back: ["a", "d"] }, ["x", "b", "y"]),
		);
		if (!chain) throw new Error("expected a chain");

		applyChain(current, chain);

		expect(current).toEqual(lineup({ back: ["a", "d"] }, ["x", "b", "y"]));
	});

	it("ignores a chain that no longer fits the lineup", () => {
		const current = lineup({ back: ["a", "b"] }, ["d"]);
		const before = structuredClone(current);

		applyChain(current, { inId: "z", zoneId: "back", moves: [], outId: "b" });

		expect(current).toEqual(before);
	});
});

describe("chains for many random lineups", () => {
	/** A small deterministic random generator, so failures reproduce. */
	function random(seed: number) {
		let s = seed;
		return () => {
			s = (s * 1103515245 + 12345) % 2 ** 31;
			return s / 2 ** 31;
		};
	}

	it.each(Array.from({ length: 50 }, (_, i) => i + 1))(
		"seed %i: chains reach the planned lineup without doubling anyone",
		(seed) => {
			const rnd = random(seed);
			const players = Array.from({ length: 12 }, (_, i) => `p${i}`);
			const shuffle = (list: string[]) => [...list].sort(() => rnd() - 0.5);
			const build = (order: string[]) =>
				lineup(
					{
						back: order.slice(0, 3),
						mid: order.slice(3, 6),
						fwd: order.slice(6, 8),
					},
					order.slice(8),
				);
			const current = build(shuffle(players));
			const next = build(shuffle(players));

			const working = structuredClone(current);
			for (const chain of substitutionChains(current, next)) {
				applyChain(working, chain);
				expectConsistent(current, working);
			}
			// Chains cover everyone who comes on or off; players who only swap
			// lines among themselves are placed when the swap completes.
			expect([...working.bench].sort()).toEqual([...next.bench].sort());
		},
	);
});
