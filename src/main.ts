import "./ui/style.css";
import { resumeMatch, startMatch } from "./ui/match.js";
import { initRosterView } from "./ui/roster.js";
import { clearSession, loadSession } from "./ui/sessionStorage.js";

for (const el of document.querySelectorAll("[data-app-version]")) {
	el.textContent = __APP_VERSION__;
}

const setupViewElement = document.getElementById("setupView");
const matchViewElement = document.getElementById("matchView");

if (!setupViewElement || !matchViewElement) {
	throw new Error("Required application views are missing from the document");
}

const setupView = setupViewElement;
const matchView = matchViewElement;

function showSetup(): void {
	clearSession();
	matchView.classList.add("hidden");
	setupView.classList.remove("hidden");
}

function showMatch(): void {
	setupView.classList.add("hidden");
	matchView.classList.remove("hidden");
}

initRosterView({
	onStartMatch: (roster) => {
		startMatch(roster, { onExitToSetup: showSetup });
		showMatch();
	},
});

// If a match was already in progress when the page was reloaded, resume it
// straight away instead of dropping the coach back at the setup screen.
if (loadSession()) {
	const resumed = resumeMatch({ onExitToSetup: showSetup });
	if (resumed) showMatch();
}

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker.register("sw.js").catch(() => {
			// offline support is a nice-to-have, not required for the app to work
		});
	});
}
