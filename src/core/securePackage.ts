/**
 * Client-side confidentiality for player-identifying data (#81): a small,
 * dependency-free layer over WebCrypto so any file leaving the device - a
 * manual export, or an upload to a (possibly shared) Google Drive folder
 * (#70) - is opaque without the coach's password. Available in both the
 * browser and Node (this module has no DOM dependency, so it is unit
 * tested like the rest of src/core), via the global `crypto` WebCrypto API
 * and the global `atob`/`btoa` base64 helpers.
 *
 * This is not a secret-sharing scheme: whoever holds the password can
 * decrypt. It protects files at rest (in a shared Drive folder, or on
 * disk); it says nothing about who a coach chooses to give the password
 * to - see #81's own acceptance note.
 */

/** OWASP's 2023 minimum iteration count for PBKDF2-HMAC-SHA256. */
const PBKDF2_ITERATIONS = 600_000;
const KEY_LENGTH_BITS = 256;
const SALT_LENGTH_BYTES = 16;
/** Standard AES-GCM nonce size; unique per encryption under a given key. */
const NONCE_LENGTH_BYTES = 12;

export const SECURE_PACKAGE_VERSION = 1;

/**
 * Data encrypted for storage or transfer: AES-GCM under a key derived from
 * a coach's password (PBKDF2-HMAC-SHA256), with a fresh salt and nonce
 * every time. The GCM authentication tag (part of `ciphertext`) is what
 * makes a wrong password or a tampered file fail loudly instead of
 * decrypting to garbage.
 */
export interface SecurePackage {
	version: 1;
	/** Base64-encoded PBKDF2 salt, unique per package. */
	salt: string;
	/** Base64-encoded AES-GCM nonce, unique per encryption under this salt's key. */
	nonce: string;
	/** Base64-encoded ciphertext, including the GCM authentication tag. */
	ciphertext: string;
}

/** Why a package was refused; src/ui/text.ts turns it into a Swedish sentence. */
export type SecurePackageProblem =
	| { code: "notObject" }
	| { code: "version" }
	| { code: "salt" }
	| { code: "nonce" }
	| { code: "ciphertext" }
	| { code: "wrongPasswordOrTampered" };

export class SecurePackageError extends Error {
	constructor(
		message: string,
		readonly problem: SecurePackageProblem,
	) {
		super(message);
		this.name = "SecurePackageError";
	}
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function deriveKey(
	password: string,
	salt: Uint8Array,
): Promise<CryptoKey> {
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveKey"],
	);
	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: salt as BufferSource,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		keyMaterial,
		{ name: "AES-GCM", length: KEY_LENGTH_BITS },
		false,
		["encrypt", "decrypt"],
	);
}

/** Encrypt any JSON-serializable value under a coach's password. */
export async function encryptJson(
	password: string,
	data: unknown,
): Promise<SecurePackage> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
	const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH_BYTES));
	const key = await deriveKey(password, salt);
	const plaintext = new TextEncoder().encode(JSON.stringify(data));
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext),
	);
	return {
		version: SECURE_PACKAGE_VERSION,
		salt: toBase64(salt),
		nonce: toBase64(nonce),
		ciphertext: toBase64(ciphertext),
	};
}

/**
 * Decrypt a package with a coach's password. Throws `SecurePackageError`
 * with code "wrongPasswordOrTampered" for a wrong password, a corrupted
 * file, or a payload that isn't valid JSON once decrypted - AES-GCM's
 * authentication tag makes these indistinguishable from each other, which
 * is fine: the app only needs to refuse clearly, not diagnose why.
 */
export async function decryptJson(
	password: string,
	pkg: SecurePackage,
): Promise<unknown> {
	let plaintext: ArrayBuffer;
	try {
		// The salt decode lives in this try too: parseSecurePackage only
		// guarantees `salt` is a non-empty string, not valid base64, so a
		// corrupted or tampered file must fail the same way a wrong password
		// does, not escape as a raw atob() exception.
		const key = await deriveKey(password, fromBase64(pkg.salt));
		plaintext = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: fromBase64(pkg.nonce) as BufferSource },
			key,
			fromBase64(pkg.ciphertext) as BufferSource,
		);
	} catch {
		throw new SecurePackageError(
			"Decryption failed: wrong password or tampered data",
			{
				code: "wrongPasswordOrTampered",
			},
		);
	}
	try {
		return JSON.parse(new TextDecoder().decode(plaintext));
	} catch {
		throw new SecurePackageError("Decrypted payload is not valid JSON", {
			code: "wrongPasswordOrTampered",
		});
	}
}

export function securePackageToJson(pkg: SecurePackage): string {
	return JSON.stringify(pkg, null, 2);
}

/**
 * Parse and strictly validate a package read back from a file or Drive:
 * never trust its shape, same discipline as parseRosterFile/parseMatchFile.
 */
export function parseSecurePackage(raw: unknown): SecurePackage {
	if (typeof raw !== "object" || raw === null) {
		throw new SecurePackageError("Package is not a JSON object", {
			code: "notObject",
		});
	}
	const obj = raw as Record<string, unknown>;
	if (obj.version !== SECURE_PACKAGE_VERSION) {
		throw new SecurePackageError(
			`Unknown or missing version (expected ${SECURE_PACKAGE_VERSION}, got ${JSON.stringify(obj.version)})`,
			{ code: "version" },
		);
	}
	if (typeof obj.salt !== "string" || obj.salt.length === 0) {
		throw new SecurePackageError("salt must be a non-empty base64 string", {
			code: "salt",
		});
	}
	if (typeof obj.nonce !== "string" || obj.nonce.length === 0) {
		throw new SecurePackageError("nonce must be a non-empty base64 string", {
			code: "nonce",
		});
	}
	if (typeof obj.ciphertext !== "string" || obj.ciphertext.length === 0) {
		throw new SecurePackageError(
			"ciphertext must be a non-empty base64 string",
			{ code: "ciphertext" },
		);
	}
	return {
		version: SECURE_PACKAGE_VERSION,
		salt: obj.salt,
		nonce: obj.nonce,
		ciphertext: obj.ciphertext,
	};
}

/**
 * MatchPlanner's own namespace UUID for player identities (RFC 4122 §4.3):
 * generated once, fixed forever. Never reuse this constant for anything
 * else, and never change it - doing so would silently mint new ids for
 * every existing player.
 */
export const PLAYER_ID_NAMESPACE = "b3c1a7f0-9e4d-5f6a-8b2c-1d0e3f4a5b6c";

/**
 * The canonicalization a player's name goes through before hashing, so
 * "Ada", " ada ", and "ADA" all resolve to the same stable id. Unicode
 * NFC-normalized, trimmed, lower-cased, internal whitespace collapsed.
 */
export function canonicalizePlayerName(name: string): string {
	return name.trim().normalize("NFC").toLowerCase().replace(/\s+/g, " ");
}

function parseUuid(uuid: string): Uint8Array {
	const hex = uuid.replace(/-/g, "");
	const bytes = new Uint8Array(16);
	for (let i = 0; i < 16; i++) {
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

function formatUuid(bytes: Uint8Array): string {
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
		"",
	);
	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		hex.slice(12, 16),
		hex.slice(16, 20),
		hex.slice(20),
	].join("-");
}

/**
 * A UUIDv5 (RFC 4122 §4.3) of `name` exactly as given, under `namespace`:
 * no case folding or trimming. For ids built from other ids (Drive file
 * names, #135), where "A" and "a" must stay different. Player names go
 * through `uuidv5` below, which canonicalizes first.
 */
export async function uuidv5Raw(
	name: string,
	namespace: string,
): Promise<string> {
	const namespaceBytes = parseUuid(namespace);
	const nameBytes = new TextEncoder().encode(name);
	const combined = new Uint8Array(namespaceBytes.length + nameBytes.length);
	combined.set(namespaceBytes, 0);
	combined.set(nameBytes, namespaceBytes.length);
	const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", combined));
	const bytes = hash.slice(0, 16);
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50; // version 5
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant RFC 4122
	return formatUuid(bytes);
}

/**
 * A stable, deterministic UUIDv5 (RFC 4122 §4.3) for a player's canonical
 * name under `namespace` (defaults to `PLAYER_ID_NAMESPACE`). The same
 * name always yields the same id, so it can be used as a join key across
 * match files without ever storing the name itself outside an encrypted
 * payload.
 */
export function uuidv5(
	name: string,
	namespace: string = PLAYER_ID_NAMESPACE,
): Promise<string> {
	return uuidv5Raw(canonicalizePlayerName(name), namespace);
}
