import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as {
	version: string;
};

// GitHub Pages project sites are served from https://<user>.github.io/<repo>/,
// so the base path must match the repo name. Set BASE_PATH as a build-time
// env var in CI (see .github/workflows/release.yml). Defaults to "/" for local
// dev and for user/organization pages (https://<user>.github.io/).
export default defineConfig(({ mode }) => ({
	base: process.env.BASE_PATH ?? "/",
	// Shown in the UI footer; comes from package.json, which release-please bumps.
	define: { __APP_VERSION__: JSON.stringify(version) },
	build: {
		target: "es2020",
		sourcemap: mode !== "production",
		outDir: "dist",
	},
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
		coverage: {
			provider: "v8",
			// Unit tests own the logic and storage modules. The DOM wiring in
			// src/ui/{match,roster}.ts and main.ts is covered by the e2e suite.
			include: [
				"src/core/**/*.ts",
				"src/ui/draftStorage.ts",
				"src/ui/sessionStorage.ts",
			],
			reporter: ["text", "html"],
			thresholds: {
				statements: 90,
				branches: 85,
				functions: 100,
				lines: 95,
			},
		},
	},
}));
