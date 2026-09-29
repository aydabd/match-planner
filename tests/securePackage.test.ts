import { describe, expect, it } from "vitest";
import {
	canonicalizePlayerName,
	decryptJson,
	encryptJson,
	PLAYER_ID_NAMESPACE,
	parseSecurePackage,
	SecurePackageError,
	securePackageToJson,
	uuidv5,
} from "../src/core/securePackage.js";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("encryptJson / decryptJson - round trip", () => {
	it("decrypts what it encrypted, with the right password", async () => {
		const data = { matchId: "m1", players: ["Ada", "Grace"] };
		const pkg = await encryptJson("hemligt", data);
		expect(await decryptJson("hemligt", pkg)).toEqual(data);
	});

	it("round-trips primitives and arrays, not just objects", async () => {
		for (const data of [42, "text", [1, 2, 3], null, true]) {
			const pkg = await encryptJson("pw", data);
			expect(await decryptJson("pw", pkg)).toEqual(data);
		}
	});

	it("produces a different salt, nonce and ciphertext each time", async () => {
		const a = await encryptJson("pw", { x: 1 });
		const b = await encryptJson("pw", { x: 1 });
		expect(a.salt).not.toEqual(b.salt);
		expect(a.nonce).not.toEqual(b.nonce);
		expect(a.ciphertext).not.toEqual(b.ciphertext);
	});

	it("refuses the wrong password", async () => {
		const pkg = await encryptJson("right", { secret: true });
		await expect(decryptJson("wrong", pkg)).rejects.toThrow(SecurePackageError);
	});

	it("refuses a tampered ciphertext", async () => {
		const pkg = await encryptJson("pw", { secret: true });
		const tampered = {
			...pkg,
			ciphertext: `${pkg.ciphertext.slice(0, -4)}AAAA`,
		};
		await expect(decryptJson("pw", tampered)).rejects.toThrow(
			SecurePackageError,
		);
	});

	it("round-trips a package through JSON text", async () => {
		const pkg = await encryptJson("pw", { a: 1 });
		const roundTripped = parseSecurePackage(
			JSON.parse(securePackageToJson(pkg)),
		);
		expect(await decryptJson("pw", roundTripped)).toEqual({ a: 1 });
	});
});

describe("parseSecurePackage - strict validation", () => {
	const valid = { version: 1, salt: "AA==", nonce: "AA==", ciphertext: "AA==" };

	it("accepts a well-formed package", () => {
		expect(parseSecurePackage(valid)).toEqual(valid);
	});

	it.each([
		["not an object", "just a string"],
		["null", null],
		["the wrong version", { ...valid, version: 2 }],
		["a missing version", { salt: "AA==", nonce: "AA==", ciphertext: "AA==" }],
		["an empty salt", { ...valid, salt: "" }],
		["a non-string salt", { ...valid, salt: 5 }],
		["an empty nonce", { ...valid, nonce: "" }],
		["an empty ciphertext", { ...valid, ciphertext: "" }],
	])("rejects %s", (_, raw) => {
		expect(() => parseSecurePackage(raw)).toThrow(SecurePackageError);
	});
});

describe("canonicalizePlayerName", () => {
	it("trims, lower-cases and collapses internal whitespace", () => {
		expect(canonicalizePlayerName("  Ada   Lovelace ")).toBe("ada lovelace");
	});

	it("is stable for an already-canonical name", () => {
		expect(canonicalizePlayerName("ada")).toBe("ada");
	});
});

describe("uuidv5", () => {
	it("returns a well-formed version-5 UUID", async () => {
		expect(await uuidv5("Ada")).toMatch(UUID_RE);
	});

	it("is deterministic for the same name", async () => {
		expect(await uuidv5("Ada Lovelace")).toBe(await uuidv5("Ada Lovelace"));
	});

	it("is the same id regardless of case or surrounding whitespace", async () => {
		expect(await uuidv5(" Ada ")).toBe(await uuidv5("ADA"));
	});

	it("differs for different names", async () => {
		expect(await uuidv5("Ada")).not.toBe(await uuidv5("Grace"));
	});

	it("differs for the same name under a different namespace", async () => {
		const other = "00000000-0000-0000-0000-000000000000";
		expect(await uuidv5("Ada")).not.toBe(await uuidv5("Ada", other));
	});

	it("defaults to PLAYER_ID_NAMESPACE", async () => {
		expect(await uuidv5("Ada")).toBe(await uuidv5("Ada", PLAYER_ID_NAMESPACE));
	});
});
