import { TEXT } from "./text.js";

/** One entry per real URL the app serves. Order here is nav order. */
export type PageId = "start" | "match" | "report" | "statistics" | "about";

interface PageDef {
	id: PageId;
	/** Relative to the site root (import.meta.env.BASE_URL); "" is the root page. */
	path: string;
	label: string;
}

const PAGES: readonly PageDef[] = [
	{ id: "start", path: "", label: TEXT.nav.start },
	{ id: "match", path: "match/", label: TEXT.nav.match },
	{ id: "report", path: "report/", label: TEXT.nav.report },
	{ id: "statistics", path: "statistics/", label: TEXT.nav.statistics },
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

/** Renders the shared cross-page nav into #pageNav, marking `current`. */
function renderNav(current: PageId): void {
	const nav = document.getElementById("pageNav");
	if (!nav) return;
	nav.replaceChildren(
		...PAGES.map((page) => {
			const a = document.createElement("a");
			a.href = `${import.meta.env.BASE_URL}${page.path}`;
			a.textContent = page.label;
			a.className = "page-nav-link";
			if (page.id === current) a.setAttribute("aria-current", "page");
			return a;
		}),
	);
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
export function initPage(current: PageId): void {
	stampVersion();
	stampCopyright();
	renderNav(current);
	registerServiceWorker();
}
