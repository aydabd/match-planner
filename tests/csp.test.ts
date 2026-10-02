import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY } from "../src/core/csp.js";

function directives(policy: string): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const part of policy.split(";")) {
		const [name, ...sources] = part.trim().split(/\s+/);
		if (name) map.set(name, sources);
	}
	return map;
}
const csp = directives(CONTENT_SECURITY_POLICY);
const sources = (name: string) => csp.get(name) ?? [];

describe("Content-Security-Policy", () => {
	it("denies by default and allows only the app's own origin for everything not listed", () => {
		expect(sources("default-src")).toEqual(["'self'"]);
	});

	it("allows no inline script, no eval and no wildcard for scripts", () => {
		const scripts = sources("script-src");
		expect(scripts).toContain("'self'");
		for (const source of scripts) {
			expect(source).not.toBe("'unsafe-inline'");
			expect(source).not.toBe("'unsafe-eval'");
			expect(source).not.toBe("*");
			expect(source).not.toMatch(/^(data:|blob:|http:)/);
			expect(source.includes("*")).toBe(false);
		}
	});

	it("loads scripts, connects and frames only from the app and Google, over https", () => {
		const google =
			/^https:\/\/([a-z0-9-]+\.)?(google\.com|googleapis\.com|gstatic\.com)$/;
		for (const name of ["script-src", "connect-src", "frame-src"]) {
			for (const source of sources(name)) {
				if (source === "'self'") continue;
				expect(source, `${name}: ${source}`).toMatch(google);
			}
		}
	});

	it("keeps the password from being sent anywhere else: connect-src is the app and Google only", () => {
		expect(sources("connect-src")).toContain("'self'");
		expect(sources("connect-src")).toContain("https://www.googleapis.com");
		expect(sources("connect-src")).not.toContain("*");
	});

	it("blocks plugins, base-tag tricks and forms posting elsewhere", () => {
		expect(sources("object-src")).toEqual(["'none'"]);
		expect(sources("base-uri")).toEqual(["'self'"]);
		expect(sources("form-action")).toEqual(["'self'"]);
	});

	it("allows what the app itself needs: its worker, manifest and data: icons", () => {
		expect(sources("worker-src")).toEqual(["'self'"]);
		expect(sources("manifest-src")).toEqual(["'self'"]);
		expect(sources("img-src")).toContain("data:");
	});

	it("is one line with no newlines, so it fits a meta attribute", () => {
		expect(CONTENT_SECURITY_POLICY).not.toMatch(/[\r\n"]/);
	});
});
