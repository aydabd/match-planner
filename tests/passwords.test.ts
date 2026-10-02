import { describe, expect, it } from "vitest";
import { LIMITS } from "../src/core/limits.js";
import { isAcceptableNewPassword } from "../src/core/passwords.js";

describe("isAcceptableNewPassword", () => {
	it("needs at least the minimum number of characters", () => {
		expect(
			isAcceptableNewPassword("x".repeat(LIMITS.minPasswordLength - 1)),
		).toBe(false);
		expect(isAcceptableNewPassword("x".repeat(LIMITS.minPasswordLength))).toBe(
			true,
		);
		expect(isAcceptableNewPassword("")).toBe(false);
	});

	it("counts characters, not UTF-16 units or bytes", () => {
		expect(isAcceptableNewPassword("å".repeat(LIMITS.minPasswordLength))).toBe(
			true,
		);
		expect(
			isAcceptableNewPassword("😀".repeat(LIMITS.minPasswordLength - 1)),
		).toBe(false);
		expect(isAcceptableNewPassword("😀".repeat(LIMITS.minPasswordLength))).toBe(
			true,
		);
	});

	it("does not trim: spaces are characters a coach chose", () => {
		expect(isAcceptableNewPassword(" ".repeat(LIMITS.minPasswordLength))).toBe(
			true,
		);
	});
});
