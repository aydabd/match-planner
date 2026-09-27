import { defineConfig } from "vite";

// GitHub Pages project sites are served from https://<user>.github.io/<repo>/,
// so the base path must match the repo name. Set BASE_PATH as a build-time
// env var in CI (see .github/workflows/deploy.yml). Defaults to "/" for local
// dev and for user/organization pages (https://<user>.github.io/).
export default defineConfig(({ mode }) => ({
	base: process.env.BASE_PATH ?? "/",
	build: {
		target: "es2020",
		sourcemap: mode !== "production",
		outDir: "dist",
	},
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
	},
}));
