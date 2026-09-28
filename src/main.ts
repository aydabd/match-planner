import "./ui/style.css";
import { createMatchView } from "./ui/match.js";
import { createPolicyView } from "./ui/policy.js";
import { createRosterView } from "./ui/roster.js";
import { clearSession } from "./ui/sessionStorage.js";

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
const policyView = document.getElementById("policyView");
if (!policyView)
	throw new Error("The policy view is missing from the document");

function showSetup(): void {
	clearSession();
	matchView.classList.add("hidden");
	setupView.classList.remove("hidden");
}

function showMatch(): void {
	setupView.classList.add("hidden");
	matchView.classList.remove("hidden");
}

// The page that explains where the rules come from opens over whichever
// screen is showing and returns to it; a running match keeps its clock.
/** What had focus when a page opened over a screen, to give focus back on close. */
const openers = new WeakMap<HTMLElement, HTMLElement>();

/**
 * Put focus back where the coach was. If the opener is now hidden inside a
 * closed menu, the menu button gets it; failing that, the screen's heading.
 */
function restoreFocus(page: HTMLElement, back: HTMLElement): void {
	const opener = openers.get(page);
	const closedMenu = opener?.closest("details:not([open])");
	const target =
		opener?.isConnected && !closedMenu
			? opener
			: (closedMenu?.querySelector<HTMLElement>("summary") ??
				back.querySelector<HTMLElement>("h1"));
	if (!target) return;
	if (!target.matches("button, summary, a, input, select, textarea")) {
		target.tabIndex = -1;
	}
	target.focus();
}

function showPolicy(): void {
	if (document.activeElement instanceof HTMLElement && policyView) {
		openers.set(policyView, document.activeElement);
	}
	// Remembered on the page itself, so no state lives at module level.
	if (policyView)
		policyView.dataset.returnTo = matchView.classList.contains("hidden")
			? "setupView"
			: "matchView";
	setupView.classList.add("hidden");
	matchView.classList.add("hidden");
	policyView?.classList.remove("hidden");
	window.scrollTo(0, 0);
	document.getElementById("policyTitle")?.focus();
}

function closePolicy(): void {
	policyView?.classList.add("hidden");
	const back =
		policyView?.dataset.returnTo === "matchView" ? matchView : setupView;
	back.classList.remove("hidden");
	if (policyView) restoreFocus(policyView, back);
}

createPolicyView();
document
	.getElementById("policyFromSetupBtn")
	?.addEventListener("click", showPolicy);
document
	.getElementById("policyFromMatchBtn")
	?.addEventListener("click", showPolicy);
document
	.getElementById("policyBackBtn")
	?.addEventListener("click", closePolicy);

const match = createMatchView({ onExitToSetup: showSetup });
createRosterView({
	onStartMatch: (roster) => {
		match.start(roster);
		showMatch();
	},
});

// If a match was already in progress when the page was reloaded, resume it
// straight away instead of dropping the coach back at the setup screen.
if (match.resume()) showMatch();

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker.register("sw.js").catch(() => {
			// offline support is a nice-to-have, not required for the app to work
		});
	});
}
