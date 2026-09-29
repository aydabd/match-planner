import "./ui/style.css";
import { initPage } from "./ui/page.js";
import { createReportList } from "./ui/report.js";
import { createRosterView } from "./ui/roster.js";
import { loadSession } from "./ui/sessionStorage.js";

initPage("start");

// The list of kept reports; opening one is a real navigation to its own
// page (see src/ui/pages/report.ts), not an in-page overlay.
const reportList = createReportList({
	onOpen: (stored) => {
		location.href = `${import.meta.env.BASE_URL}report/?matchId=${encodeURIComponent(stored.matchId)}`;
	},
});
reportList.refreshList();

createRosterView({
	// The squad is already saved as the draft (src/ui/draftStorage.ts) as
	// the coach edits it; /match/ reads it from there to start the match,
	// since only that page has the match screen's DOM.
	onStartMatch: () => {
		location.href = `${import.meta.env.BASE_URL}match/?start=1`;
	},
});

// If a match is already in progress, go straight there instead of showing
// setup - matches the pre-#93 behavior of resuming automatically.
if (loadSession()) {
	location.href = `${import.meta.env.BASE_URL}match/`;
}
