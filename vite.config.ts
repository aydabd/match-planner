import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import {
	CACHE_PREFIX,
	cacheName,
	LEGACY_CACHE_NAMES,
} from "./src/ui/appStorage.js";

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as {
	version: string;
};

// GitHub Pages project sites are served from https://<user>.github.io/<repo>/,
// so the base path must match the repo name. Set BASE_PATH as a build-time
// env var in CI (see .github/workflows/release.yml). Defaults to "/" for local
// dev and for user/organization pages (https://<user>.github.io/).
/** Emit sw.js with its cache named after this version (see src/sw/serviceWorker.js). */
function serviceWorker(appVersion: string): Plugin {
	return {
		name: "matchplanner-service-worker",
		generateBundle() {
			const template = readFileSync("src/sw/serviceWorker.js", "utf8");
			this.emitFile({
				type: "asset",
				fileName: "sw.js",
				source: template
					.replace("__CACHE_NAME__", cacheName(appVersion))
					.replace("__CACHE_PREFIX__", CACHE_PREFIX)
					.replace("__LEGACY_CACHES__", JSON.stringify(LEGACY_CACHE_NAMES)),
			});
		},
	};
}

export default defineConfig(({ mode }) => ({
	plugins: [serviceWorker(version)],
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
