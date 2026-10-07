/**
 * Every rule MatchPlanner applies, in one place. The scheduler, the team
 * sizes and the screens read their values from POLICY; nothing else defines a
 * rule. Each rule says where it comes from:
 *
 * - "policy": a published rule or guideline. It carries the source, a verbatim
 *   quote and the date it was checked against the document.
 * - "decision": MatchPlanner's own choice. It is never attributed to RF, SvFF
 *   or Skånebollen; a source is listed only as background.
 *
 * Before a rule is labelled "policy", quote the passage from the current
 * version of the document and set `checked`. src/ui/text.ts explains each
 * rule in plain Swedish (TEXT.policy.rules), keyed by the rule id.
 */

export const SOURCES = {
	rfGuidelines: {
		publisher: "Riksidrottsförbundet (RF)",
		title: "Riktlinjer för barn- och ungdomsidrott",
		url: "https://www.rf.se/rf-arbetar-med/barn--och-ungdomsidrott/riktlinjer-for-barn--och-ungdomsidrott",
	},
	rfGuidelinesPdf: {
		publisher: "Riksidrottsförbundet (RF)",
		title: "Riktlinjerna i sin helhet (PDF)",
		url: "https://www.rf.se/download/18.407871d3183abb2a6133d5/1665042792026/Riktlinjer%20barn-%20och%20ungdomsidrott.pdf",
	},
	rfGuidelinesShortPdf: {
		publisher: "Riksidrottsförbundet (RF)",
		title: "Riktlinjerna, kortversion (PDF)",
		url: "https://www.rf.se/download/18.bb2bb9e1900fe9007258a4/1718272991496/Riktlinjer_barn_ung_utskrift.pdf",
	},
	rfSelection: {
		publisher: "Riksidrottsförbundet (RF)",
		title: "Selektering och nivåindelning",
		url: "https://www.rf.se/rf-arbetar-med/barn--och-ungdomsidrott/selektering-och-nivaindelning",
	},
	svffYouth: {
		publisher: "Svenska Fotbollförbundet (SvFF)",
		title: "Barn- och ungdomsfotboll",
		url: "https://aktiva.svenskfotboll.se/spelare/spela/barn-och-ungdom/",
	},
	svffPlayFormats: {
		publisher: "Svenska Fotbollförbundet (SvFF)",
		title: "Spelformer: speltid och byten",
		url: "https://aktiva.svenskfotboll.se/tranare/spelformer/",
	},
	svffPlayerDevelopment: {
		publisher: "Svenska Fotbollförbundet (SvFF)",
		title: "Svensk fotbolls spelarutbildningsplan",
		url: "https://aktiva.svenskfotboll.se/tranare/spelarutbildning/spelarutbildningsplan/",
	},
	svffMaterial: {
		publisher: "Svenska Fotbollförbundet (SvFF)",
		title: "Riktlinjer och utbildningsmaterial",
		url: "https://aktiva.svenskfotboll.se/spelare/utbildningsmaterial/utbildningsmaterial/",
	},
	skaneNews: {
		publisher: "Skånes Fotbollförbund (Skånebollen)",
		title: "Uppdaterade spelregler barn- och ungdomsfotboll 2025",
		url: "https://www.skaneboll.se/nyheter/2025/april/uppdaterade-spelregler-barn--unga/",
	},
	skaneRulesPdf: {
		publisher: "Skånes Fotbollförbund (Skånebollen)",
		title: "Information kring spelregler 2025–2026 (PDF)",
		url: "https://www.skaneboll.se/49666a/globalassets/distrikt/skane/dokument/tavling/tavlingsbestammelser/info-kring-spelregler-for-barn--och-ungdomsfotboll-2025-2026.pdf",
	},
	skaneRegulations: {
		publisher: "Skånes Fotbollförbund (Skånebollen)",
		title: "Bestämmelser och föreskrifter",
		url: "https://www.skaneboll.se/tavling/bestammelser/",
	},
} as const;

export type SourceId = keyof typeof SOURCES;

/**
 * Distrikt/landsting whose own federation may publish recommended values that
 * differ from the national baseline below. A squad file records which region
 * it was built under (src/core/storage.ts); the algorithm and screens still
 * read the national POLICY directly until a region's overlay actually
 * changes a value (see POLICY_OVERLAYS).
 */
export const REGIONS = {
	national: { label: "Sverige (RF/SvFF)" },
	skane: { label: "Skåne (Skånebollen)" },
} as const;

export type RegionId = keyof typeof REGIONS;

/** The values the code applies. Rules below describe where each one comes from. */
export const POLICY = {
	/** Most different lines one player may stand in during a match. */
	maxZonesPerPlayer: 2,
	/** A player's lines must be neighbours (never defence straight to attack). */
	zonesMustBeAdjacent: true,
	/**
	 * Ages and the match length of a single series match per team size (SvFF,
	 * see rule "matchLengths"). Cups set their own; the coach changes them
	 * on the setup screen.
	 */
	formats: {
		"5v5": { ages: [8, 9], periods: 3, periodMinutes: 15 },
		"7v7": { ages: [10, 12], periods: 3, periodMinutes: 20 },
		"9v9": { ages: [13, 14], periods: 3, periodMinutes: 25 },
		"11v11": { ages: [15, 19], periods: 2, periodMinutes: 40 },
	},
	/** A swap this late (seconds) is flagged in the match report. */
	lateSwapSeconds: 30,
	/** A swap this late (seconds) is flagged as seriously late. */
	veryLateSwapSeconds: 60,
	/** A player this far below the team average (seconds) is pointed out. */
	playtimeGapSeconds: 120,
} as const;

/**
 * Only the values a region's own document currently states differently than
 * the national POLICY above — never repeat a value that doesn't actually
 * differ (a rule stays a single source of truth, per AGENTS.md). An overlay
 * that touches "formats" must give the whole formats object: only whole
 * top-level POLICY keys are merged, there is no deep merge.
 *
 * Skånebollen's own page (see the "matchFormats" rule below) confirms the
 * national match formats apply in Skåne from season 2026, so there is
 * nothing to override today. Add a region here only once its federation
 * publishes a genuinely different, quotable number.
 */
export const POLICY_OVERLAYS: Partial<
	Record<RegionId, Partial<typeof POLICY>>
> = {};

/** POLICY as it applies in `region`: the national baseline with that
 * region's overlay, if any, merged on top. */
export function policyFor(region: RegionId): typeof POLICY {
	const overlay = POLICY_OVERLAYS[region];
	return overlay ? { ...POLICY, ...overlay } : POLICY;
}

interface PolicyRule {
	/** What the rule is about. */
	readonly id: string;
	readonly origin: "policy" | "decision";
	/** The rule's own source; for a decision, background reading only. */
	readonly sources: readonly SourceId[];
	/** The source whose page holds the quotes (origin "policy" only). */
	readonly quoteSource?: SourceId;
	/**
	 * Verbatim passages from that page (origin "policy" only). Each must
	 * appear on the page as written; `npm run check:policy` re-checks them.
	 */
	readonly quotes?: readonly string[];
	/** When the passage was checked against the document, "YYYY-MM-DD". */
	readonly checked?: string;
	/** Version or date of the document as checked. */
	readonly documentVersion?: string;
}

export const RULES = [
	{
		id: "participation",
		origin: "policy",
		sources: ["rfGuidelines", "rfGuidelinesPdf", "rfGuidelinesShortPdf"],
		quoteSource: "rfGuidelines",
		quotes: [
			"Alla barn och ungdomar inom idrottsrörelsen ska ha rätt till ett allsidigt och lekfullt idrottande.",
		],
		checked: "2026-09-28",
		documentVersion: "RF-sidan, uppdaterad 2026-01-07",
	},
	{
		id: "versatility",
		origin: "policy",
		sources: ["rfGuidelines", "rfGuidelinesPdf", "rfSelection"],
		quoteSource: "rfGuidelines",
		quotes: [
			"Oavsett träningsmängd och typ av idrott så ska verksamheten karaktäriseras av allsidighet och variation",
		],
		checked: "2026-09-28",
		documentVersion: "RF-sidan, uppdaterad 2026-01-07",
	},
	{
		id: "matchFormats",
		origin: "policy",
		sources: ["svffYouth", "svffPlayFormats", "skaneRulesPdf"],
		quoteSource: "svffYouth",
		quotes: [
			"Fotboll för 8-9 åringar spelas 5 mot 5.",
			"Fotboll för 10-12 åringar spelas 7 mot 7.",
		],
		checked: "2026-09-28",
		documentVersion:
			"SvFF-sidan (utan datum); Skånebollen 2025-04-07: nationella spelformer gäller i Skåne från säsongen 2026",
	},
	{
		id: "matchLengths",
		origin: "policy",
		sources: ["svffPlayFormats", "svffYouth", "skaneRulesPdf"],
		quoteSource: "svffPlayFormats",
		quotes: [
			"Speltid: 3 x 10 minuter, sammandrag. 3 x 15 minuter, enskild match.",
			"Speltid: 3 x 20 minuter vid enskild match. 3 x 15 minuter vid sammandrag (2-3 matcher)",
			"Speltid: 3 x 25 minuter.",
			"Speltid: 15 år: 2 x 40 minuter. 16 år och uppåt: 2 x 45 minuter.",
		],
		checked: "2026-09-28",
		documentVersion: "SvFF-sidan Spelformer (utan datum)",
	},
	{
		id: "freeSubstitutions",
		origin: "policy",
		sources: ["svffPlayFormats", "skaneRulesPdf"],
		quoteSource: "svffPlayFormats",
		quotes: ["Byten: Fria byten"],
		checked: "2026-09-28",
		documentVersion: "SvFF-sidan Spelformer (utan datum)",
	},
	{
		id: "equalPlaytime",
		origin: "decision",
		sources: ["rfGuidelines", "rfGuidelinesPdf"],
	},
	{
		id: "twoLines",
		origin: "decision",
		sources: ["rfGuidelines", "svffPlayerDevelopment"],
	},
	{
		id: "neighbouringLines",
		origin: "decision",
		sources: ["svffPlayerDevelopment"],
	},
	{
		id: "restTime",
		origin: "decision",
		sources: ["rfGuidelines", "svffPlayFormats"],
	},
	{
		id: "swapTiming",
		origin: "decision",
		sources: ["svffPlayFormats"],
	},
] as const satisfies readonly PolicyRule[];

export type RuleId = (typeof RULES)[number]["id"];

/** The policy documents grouped by publisher, for the page and the README. */
export function sourcesByPublisher(): {
	publisher: string;
	documents: { title: string; url: string }[];
}[] {
	const groups = new Map<string, { title: string; url: string }[]>();
	for (const { publisher, title, url } of Object.values(SOURCES)) {
		const documents = groups.get(publisher) ?? [];
		documents.push({ title, url });
		groups.set(publisher, documents);
	}
	return [...groups].map(([publisher, documents]) => ({
		publisher,
		documents,
	}));
}
