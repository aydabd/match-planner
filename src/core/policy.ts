/**
 * Every rule MatchPlanner applies, in one place. The scheduler, the team
 * sizes and the screens read their values from POLICY; nothing else defines a
 * rule. Each rule says where it comes from:
 *
 * - "policy": a published rule or guideline. It carries one or more
 *   citations: the source, verbatim quotes and the date they were checked
 *   against the document.
 * - "decision": MatchPlanner's own choice. It is never attributed to RF, SvFF
 *   or Skånebollen; a source is listed only as background.
 *
 * Every rule also says which matches it applies to (`appliesTo`): those with
 * free swaps and re-entry, as in barn- och ungdomsfotboll, those with a
 * limited number of substitutes, or both. The code reads it instead of
 * assuming.
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
	svffYouthCompetitionRules: {
		publisher: "Svenska Fotbollförbundet (SvFF)",
		title: "Tävlingsbestämmelser för barn- och ungdomsfotboll (PDF)",
		url: "https://www.svenskfotboll.se/4aefde/globalassets/svff/dokumentdokumentblock/tavling/tavlingsforeskrifter/tb-barn--och-ungdomsfotboll.pdf",
	},
	svffCompetitionRules: {
		publisher: "Svenska Fotbollförbundet (SvFF)",
		title: "Tävlingsbestämmelser 2026 (PDF)",
		url: "https://www.svenskfotboll.se/49e87f/globalassets/svff/dokumentdokumentblock/tavling/tavlingsforeskrifter/2026/tb-2026-v2-202603242.pdf",
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
	/**
	 * Substitutes ("ersättare") in a förbundsserie (TB 2026, 4 kap. 5 §; rule
	 * "limitedSubstitutions"): at most this many players brought on, at most
	 * this many occasions during play, and a replaced player may not return.
	 * A district series with ersättare has the same cap on players and no
	 * re-entry, but TB sets no limit on its occasions.
	 */
	limitedSubstitutions: { substitutesIn: 5, occasions: 3, reEntry: false },
	/**
	 * A break between periods is never a substitution occasion, but the
	 * players brought on in it count toward the substitutes limit
	 * ("halvtidsvilan således undantagen", TB 2026, 4 kap. 5 §).
	 */
	breakIsOccasion: false,
	/**
	 * How tiring a second in each line is, compared with midfield and attack
	 * (1). Defenders usually run less, so they may stay on a bit longer.
	 * Only the back line counts lighter: a defensive midfielder runs like a
	 * midfielder. A decision, not a rule from any document. It assumes free
	 * swaps with re-entry, which is how barn- och ungdomsfotboll is played
	 * (rule "loadInARow" applies to free swaps only).
	 */
	zoneLoad: { back: 0.7, dmid: 1, mid: 1, amid: 1, fwd: 1 },
	/**
	 * Players whose playtime is within this many seconds count as having
	 * played the same, so a late swap or a short temporary swap does not hide
	 * who has run the most in a row. A decision.
	 */
	samePlaytimeSeconds: 60,
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

/**
 * How substitutions work in a match: "free" swaps where a replaced player may
 * come back (barn- och ungdomsfotboll), or "limited" substitutes with a cap
 * and usually no re-entry (förbundsserier, district series with ersättare,
 * some cups).
 */
export const SUBSTITUTION_KINDS = ["free", "limited"] as const;
export type SubstitutionKind = (typeof SUBSTITUTION_KINDS)[number];

/** Verbatim passages from one document, and when they were checked. */
interface Citation {
	/** The source whose page or PDF holds the quotes. */
	readonly source: SourceId;
	/**
	 * Verbatim passages. Each must appear in the document as written;
	 * `npm run check:policy` re-checks them.
	 */
	readonly quotes: readonly string[];
	/** When the passages were checked against the document, "YYYY-MM-DD". */
	readonly checked: string;
	/** Version or date of the document as checked. */
	readonly documentVersion: string;
}

interface PolicyRule {
	/** What the rule is about. */
	readonly id: string;
	readonly origin: "policy" | "decision";
	/** The kinds of substitution the rule applies to. */
	readonly appliesTo: readonly SubstitutionKind[];
	/** The rule's own source; for a decision, background reading only. */
	readonly sources: readonly SourceId[];
	/** The quoted passages (origin "policy" only). */
	readonly citations?: readonly Citation[];
}

export const RULES = [
	{
		id: "participation",
		origin: "policy",
		appliesTo: ["free", "limited"],
		sources: ["rfGuidelines", "rfGuidelinesPdf", "rfGuidelinesShortPdf"],
		citations: [
			{
				source: "rfGuidelines",
				quotes: [
					"Alla barn och ungdomar inom idrottsrörelsen ska ha rätt till ett allsidigt och lekfullt idrottande.",
				],
				checked: "2026-09-28",
				documentVersion: "RF-sidan, uppdaterad 2026-01-07",
			},
		],
	},
	{
		id: "versatility",
		origin: "policy",
		appliesTo: ["free", "limited"],
		sources: ["rfGuidelines", "rfGuidelinesPdf", "rfSelection"],
		citations: [
			{
				source: "rfGuidelines",
				quotes: [
					"Oavsett träningsmängd och typ av idrott så ska verksamheten karaktäriseras av allsidighet och variation",
				],
				checked: "2026-09-28",
				documentVersion: "RF-sidan, uppdaterad 2026-01-07",
			},
		],
	},
	{
		id: "matchFormats",
		origin: "policy",
		appliesTo: ["free", "limited"],
		sources: ["svffYouth", "svffPlayFormats", "skaneRulesPdf"],
		citations: [
			{
				source: "svffYouth",
				quotes: [
					"Fotboll för 8-9 åringar spelas 5 mot 5.",
					"Fotboll för 10-12 åringar spelas 7 mot 7.",
				],
				checked: "2026-09-28",
				documentVersion:
					"SvFF-sidan (utan datum); Skånebollen 2025-04-07: nationella spelformer gäller i Skåne från säsongen 2026",
			},
		],
	},
	{
		id: "matchLengths",
		origin: "policy",
		appliesTo: ["free", "limited"],
		sources: ["svffPlayFormats", "svffYouth", "skaneRulesPdf"],
		citations: [
			{
				source: "svffPlayFormats",
				quotes: [
					"Speltid: 3 x 10 minuter, sammandrag. 3 x 15 minuter, enskild match.",
					"Speltid: 3 x 20 minuter vid enskild match. 3 x 15 minuter vid sammandrag (2-3 matcher)",
					"Speltid: 3 x 25 minuter.",
					"Speltid: 15 år: 2 x 40 minuter. 16 år och uppåt: 2 x 45 minuter.",
				],
				checked: "2026-09-28",
				documentVersion: "SvFF-sidan Spelformer (utan datum)",
			},
		],
	},
	{
		id: "freeSubstitutions",
		origin: "policy",
		appliesTo: ["free"],
		sources: ["svffYouthCompetitionRules", "svffPlayFormats", "skaneRulesPdf"],
		citations: [
			{
				source: "svffPlayFormats",
				quotes: ["Byten: Fria byten"],
				checked: "2026-09-28",
				documentVersion: "SvFF-sidan Spelformer (utan datum)",
			},
			{
				source: "svffYouthCompetitionRules",
				quotes: [
					"I barn- och ungdomsfotboll används avbytare. Samtliga avbytare ska, såvida inte annat framgår av SvFF:s tävlingsföreskrifter, bytas in under match och utbytt spelare får återinträda i spelet. Byte av avbytare sker genom flygande byten.",
				],
				checked: "2026-10-09",
				documentVersion:
					"Beslutad 2018-11-20, gäller från 2019-01-01 (SDF:s egna serier från 2020-01-01), 5 § Avbytare",
			},
		],
	},
	{
		id: "limitedSubstitutions",
		origin: "policy",
		appliesTo: ["limited"],
		sources: ["svffCompetitionRules"],
		citations: [
			{
				source: "svffCompetitionRules",
				quotes: [
					"I förbundsserierna (undantaget P16, F17, P17, F19 och P19) samt vid kval till dessa serier, får högst fem ersättare bytas in under match. Under pågående spel (halvtidsvilan således undantagen) får laget vid högst tre tillfällen genomföra spelarbyten. Spelare som byts ut får inte återinträda i spelet.",
					"I distriktsserierna fastställer SDF dels om ersättare eller avbytare används vad avser spelformen 11 mot 11 dels vilket antal ersättare eller avbytare, dock högst sju, som får antecknas på spelarförteckningen.",
					"Används ersättare i distriktsserierna får som mest fem bytas in under match, om inte SDF tillåter fler byten. Spelare som byts ut får inte återinträda i spelet.",
				],
				checked: "2026-10-09",
				documentVersion:
					"Tävlingsbestämmelser 2026, version 2 (2026-03-24), 4 kap. 5 §",
			},
		],
	},
	{
		id: "fairOverTime",
		origin: "decision",
		appliesTo: ["limited"],
		sources: ["rfGuidelines", "svffCompetitionRules"],
	},
	{
		id: "equalPlaytime",
		origin: "decision",
		appliesTo: ["free"],
		sources: ["rfGuidelines", "rfGuidelinesPdf"],
	},
	{
		id: "twoLines",
		origin: "decision",
		appliesTo: ["free", "limited"],
		sources: ["rfGuidelines", "svffPlayerDevelopment"],
	},
	{
		id: "neighbouringLines",
		origin: "decision",
		appliesTo: ["free", "limited"],
		sources: ["svffPlayerDevelopment"],
	},
	{
		id: "loadInARow",
		origin: "decision",
		appliesTo: ["free"],
		sources: ["rfGuidelines", "svffPlayerDevelopment"],
	},
	{
		id: "restTime",
		origin: "decision",
		appliesTo: ["free"],
		sources: ["rfGuidelines", "svffPlayFormats"],
	},
	{
		id: "swapTiming",
		origin: "decision",
		appliesTo: ["free"],
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
