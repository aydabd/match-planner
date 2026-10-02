import { LIMITS } from "./limits.js";

/**
 * Whether `password` is long enough to protect a new backup or export
 * (#147). The files end up in Google Drive where anyone can guess at them
 * offline for ever, so the password is the only protection; a short one is
 * refused when it is first set. Characters are counted, not bytes or UTF-16
 * units, and nothing is trimmed - the password is exactly what was typed.
 */
export function isAcceptableNewPassword(password: string): boolean {
	return [...password].length >= LIMITS.minPasswordLength;
}
