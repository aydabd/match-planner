import "../style.css";
import { loadDraft } from "../draftStorage.js";
import { createMatchView } from "../match.js";
import { loadMatchSetup } from "../matchSetupStorage.js";
import { initPage } from "../page.js";
import { clearSession, loadSession } from "../sessionStorage.js";

initPage("match");

const emptyState = document.getElementById("matchEmptyState");
const matchSection = document.getElementById("matchView");
const startsNewMatch =
	new URLSearchParams(location.search).get("start") === "1";
const hasSession = loadSession() !== null;

if (hasSession || startsNewMatch) {
	if (emptyState) emptyState.hidden = true;
	if (matchSection) matchSection.hidden = false;

	const match = createMatchView({
		onExitToSetup: () => {
			clearSession();
			location.href = import.meta.env.BASE_URL;
		},
		onShowReport: (stored) => {
			// Already saved by createMatchView before this callback fires.
			location.href = `${import.meta.env.BASE_URL}report/?matchId=${encodeURIComponent(stored.matchId)}&from=match`;
		},
	});
	// The squad was just saved as the draft on Start (see src/main.ts); a
	// resumed session (if one exists) always wins over starting fresh, so
	// reloading /match/?start=1 never restarts an in-progress match.
	if (!match.resume() && startsNewMatch)
		void match.start(loadDraft(), loadMatchSetup());
} else {
	if (matchSection) matchSection.hidden = true;
	if (emptyState) {
		emptyState.hidden = false;
		emptyState.querySelector("h1")?.focus();
	}
}
