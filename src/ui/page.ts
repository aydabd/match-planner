import { LIMITS } from "../core/limits.js";
import {
	activeTeamId,
	createTeam,
	listTeams,
	switchTeam,
} from "./teamStorage.js";
import { TEXT } from "./text.js";

/**
 * One entry per real URL the app serves. Order in PAGES is nav order.
 */
export type PageId =
	| "start"
	| "match"
	| "report"
	| "statistics"
	| "about"
	| "data";

/** The three pages that share the "Statistik" entry in the main nav (#119). */
export type StatisticsPageId = "overview" | "seasonReport" | "notes";

const STATISTICS_PAGES: readonly PageDef<StatisticsPageId>[] = [
	{ id: "overview", path: "statistics/", label: TEXT.statisticsNav.overview },
	{
		id: "seasonReport",
		path: "statistics/sasongsrapport/",
		label: TEXT.statisticsNav.seasonReport,
	},
	{
		id: "notes",
		path: "statistics/anteckningar/",
		label: TEXT.statisticsNav.notes,
	},
];

interface PageDef<Id extends string = PageId> {
	id: Id;
	/** Relative to the site root (import.meta.env.BASE_URL); "" is the root page. */
	path: string;
	label: string;
}

const PAGES: readonly PageDef[] = [
	{ id: "start", path: "", label: TEXT.nav.start },
	{ id: "match", path: "match/", label: TEXT.nav.match },
	{ id: "report", path: "report/", label: TEXT.nav.report },
	{ id: "statistics", path: "statistics/", label: TEXT.nav.statistics },
	{ id: "data", path: "data/", label: TEXT.nav.data },
	{ id: "about", path: "about/", label: TEXT.nav.about },
];

function stampVersion(): void {
	for (const el of document.querySelectorAll("[data-app-version]")) {
		el.textContent = __APP_VERSION__;
	}
}

function stampCopyright(): void {
	for (const el of document.querySelectorAll("[data-copyright]")) {
		el.textContent = __COPYRIGHT__;
	}
}

/** Renders `pages` as links into the nav element `id`, marking `current`. */
function renderLinks<Id extends string>(
	id: string,
	linkClass: string,
	pages: readonly PageDef<Id>[],
	current: Id,
): void {
	const nav = document.getElementById(id);
	if (!nav) return;
	nav.replaceChildren(
		...pages.map((page) => {
			const a = document.createElement("a");
			a.href = `${import.meta.env.BASE_URL}${page.path}`;
			a.textContent = page.label;
			a.className = linkClass;
			if (page.id === current) a.setAttribute("aria-current", "page");
			return a;
		}),
	);
}

/**
 * The team switcher in the shared header (#118): a <select> of every team
 * plus a "Nytt lag" control, always visible so a coach always knows which
 * team's data they are looking at. Changing the select only enables "Byt" -
 * it does not switch or reload by itself (WCAG 3.2.2 "On Input": a form
 * control must not change context on its own), so a keyboard user stepping
 * through options, or a coach who scrolls the focused select by accident,
 * never loses their place mid-match. Creating a team still reloads right
 * away, since that is a deliberate action on its own button, not a side
 * effect of moving focus through a list.
 */
export function renderTeamSwitcher(): void {
	const container = document.getElementById("teamSwitcher");
	if (!container) return;
	const t = TEXT.teamSwitcher;

	const select = document.createElement("select");
	select.id = "teamSwitcherSelect";
	select.setAttribute("aria-label", t.label);
	const current = activeTeamId();
	for (const team of listTeams()) {
		const option = document.createElement("option");
		option.value = team.id;
		option.textContent = team.name;
		option.selected = team.id === current;
		select.appendChild(option);
	}

	const switchBtn = document.createElement("button");
	switchBtn.type = "button";
	switchBtn.className = "btn btn-ghost";
	switchBtn.id = "teamSwitcherSwitchBtn";
	switchBtn.textContent = t.switchTeam;
	switchBtn.disabled = true;
	select.addEventListener("change", () => {
		switchBtn.disabled = select.value === current;
	});
	switchBtn.addEventListener("click", () => {
		switchTeam(select.value);
		location.reload();
	});

	const newTeamBtn = document.createElement("button");
	newTeamBtn.type = "button";
	newTeamBtn.className = "btn btn-ghost";
	newTeamBtn.id = "teamSwitcherNewBtn";
	newTeamBtn.textContent = t.newTeam;

	const form = document.createElement("form");
	form.className = "team-switcher-new-form";
	form.hidden = true;
	const nameInput = document.createElement("input");
	nameInput.type = "text";
	nameInput.id = "teamSwitcherNameInput";
	nameInput.setAttribute("aria-label", t.newTeamNameLabel);
	nameInput.maxLength = LIMITS.teamNameLength;
	const createBtn = document.createElement("button");
	createBtn.type = "submit";
	createBtn.className = "btn btn-primary";
	createBtn.textContent = t.create;
	const cancelBtn = document.createElement("button");
	cancelBtn.type = "button";
	cancelBtn.className = "btn btn-ghost";
	cancelBtn.textContent = t.cancel;
	form.append(nameInput, createBtn, cancelBtn);

	newTeamBtn.addEventListener("click", () => {
		newTeamBtn.hidden = true;
		form.hidden = false;
		nameInput.focus();
	});
	cancelBtn.addEventListener("click", () => {
		form.hidden = true;
		newTeamBtn.hidden = false;
	});
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		const name = nameInput.value.trim();
		if (name === "") return;
		createTeam(name);
		location.reload();
	});

	container.replaceChildren(select, switchBtn, newTeamBtn, form);
}

function registerServiceWorker(): void {
	if (!("serviceWorker" in navigator)) return;
	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register(`${import.meta.env.BASE_URL}sw.js`)
			.catch(() => {
				// offline support is a nice-to-have, not required for the app to work
			});
	});
}

/**
 * Wires what every page needs regardless of which view it owns: the version
 * and copyright footer, the shared nav, and the service worker. Call once
 * per page entry. No module-level mutable state: everything here runs
 * inside this function, reading the current DOM each time.
 */
export function initPage(
	current: PageId,
	statisticsPage?: StatisticsPageId,
): void {
	stampVersion();
	stampCopyright();
	renderLinks("pageNav", "page-nav-link", PAGES, current);
	// The secondary strip exists only in the three statistics pages' HTML (#119).
	if (statisticsPage) {
		renderLinks(
			"statisticsSubNav",
			"page-subnav-link",
			STATISTICS_PAGES,
			statisticsPage,
		);
	}
	renderTeamSwitcher();
	registerServiceWorker();
}
