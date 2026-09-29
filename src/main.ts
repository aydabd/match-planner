import "./ui/style.css";
import { createHistoryView } from "./ui/history.js";
import { createMatchView } from "./ui/match.js";
import { byId, initPage } from "./ui/page.js";
import { createPolicyView } from "./ui/policy.js";
import { createReportView } from "./ui/report.js";
import { createRosterView } from "./ui/roster.js";
import { clearSession } from "./ui/sessionStorage.js";

initPage("start");

const setupView = byId("setupView");
const matchView = byId("matchView");
const policyView = byId("policyView");
const reportView = byId("reportView");
const historyPage = byId("historyView");

function showSetup(): void {
	clearSession();
	matchView.classList.add("hidden");
	setupView.classList.remove("hidden");
	report.refreshList();
}

function showMatch(): void {
	setupView.classList.add("hidden");
	matchView.classList.remove("hidden");
}

// Pages that open over whichever screen is showing and return to it: the
// policy page and the match report. A running match keeps its clock.
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

function openOver(page: HTMLElement): void {
	if (document.activeElement instanceof HTMLElement) {
		openers.set(page, document.activeElement);
	}
	// Remembered on the page itself, so no state lives at module level.
	page.dataset.returnTo = matchView.classList.contains("hidden")
		? "setupView"
		: "matchView";
	setupView.classList.add("hidden");
	matchView.classList.add("hidden");
	page.classList.remove("hidden");
	window.scrollTo(0, 0);
	page.querySelector<HTMLElement>("h1")?.focus();
}

function closePage(page: HTMLElement): void {
	page.classList.add("hidden");
	const back = page.dataset.returnTo === "matchView" ? matchView : setupView;
	back.classList.remove("hidden");
	restoreFocus(page, back);
}

createPolicyView();
for (const [button, page] of [
	["policyFromSetupBtn", policyView],
	["policyFromMatchBtn", policyView],
] as const) {
	byId(button).addEventListener("click", () => openOver(page));
}
byId("policyBackBtn").addEventListener("click", () => closePage(policyView));
byId("reportBackBtn").addEventListener("click", () => closePage(reportView));

const history = createHistoryView();
byId("historyOpenBtn").addEventListener("click", () => {
	history.refresh();
	openOver(historyPage);
});
byId("historyBackBtn").addEventListener("click", () => closePage(historyPage));

const report = createReportView({
	onOpen: (stored) => {
		report.show(stored);
		openOver(reportView);
	},
});

const match = createMatchView({
	onExitToSetup: showSetup,
	onShowReport: (stored) => {
		report.show(stored);
		report.refreshList();
		openOver(reportView);
	},
});
createRosterView({
	onStartMatch: (roster) => {
		match.start(roster);
		showMatch();
	},
});
report.refreshList();

// If a match was already in progress when the page was reloaded, resume it
// straight away instead of dropping the coach back at the setup screen.
if (match.resume()) showMatch();
