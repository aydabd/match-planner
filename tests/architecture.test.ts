import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return path.endsWith(".ts") ? [path] : [];
	});
}

describe("architecture", () => {
	it("has no mutable state at module level in src/", () => {
		// Module-level `let`/`var` means state shared by everything that imports
		// the module. Views keep their state inside their factory instead.
		const offenders = sourceFiles("src").flatMap((file) =>
			readFileSync(file, "utf8")
				.split("\n")
				.map((line, i) => [line, i + 1] as const)
				.filter(([line]) => /^(export\s+)?(let|var)\s/.test(line))
				.map(([line, n]) => `${file}:${n}: ${line.trim()}`),
		);
		expect(offenders).toEqual([]);
	});
});
