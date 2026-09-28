import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const isCI = Boolean(process.env.CI);
// Same variable the build uses; GitHub Pages serves the app under /<repo>/.
const BASE_PATH = process.env.BASE_PATH ?? "/";
// Test an existing dist/ instead of building first, e.g. a local production build.
const useExistingBuild = Boolean(process.env.E2E_USE_EXISTING_BUILD);
const appUrl = `http://localhost:${PORT}${BASE_PATH}`;
const preview = `npm run preview -- --port ${PORT} --strictPort`;

/**
 * End-to-end tests run against the production build (vite preview), on the
 * two screens coaches actually use: a phone on the sideline and a tablet.
 * See e2e/README.md for what belongs here versus in the unit tests.
 */
export default defineConfig({
	testDir: "./e2e/specs",
	fullyParallel: true,
	forbidOnly: isCI,
	// A retry only exists to detect flakiness: a test that passes on retry
	// still fails the run, so flaky tests get fixed instead of ignored.
	retries: isCI ? 1 : 0,
	failOnFlakyTests: isCI,
	reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: appUrl,
		locale: "sv-SE",
		// No CSS transitions: assertions and axe always see the final state.
		contextOptions: { reducedMotion: "reduce" },
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "phone",
			use: { ...devices["Pixel 7"] },
		},
		{
			name: "tablet",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1100, height: 900 },
				hasTouch: true,
			},
		},
	],
	webServer: {
		command: useExistingBuild ? preview : `npm run build && ${preview}`,
		url: appUrl,
		reuseExistingServer: !isCI,
		timeout: 120_000,
	},
});
