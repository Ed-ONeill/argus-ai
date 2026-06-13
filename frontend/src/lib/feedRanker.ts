import type { StoryCluster, ThemeIntelligence, WhatMattersNowItem } from "./types";

export interface UserPrefs {
  followed_themes:        string[];
  followed_sectors:       string[];
  followed_asset_classes: string[];
  user_role:              string;
  region_focus:           string;
}

export interface RankedCluster extends StoryCluster {
  relevance_score:  number;          // = affinity.finalRank
  affinity?:        ClusterAffinity; // explicit preference-affinity breakdown
  _debug:           Record<string, number | string[]> | undefined;
}

// ── Tiered theme keyword maps ─────────────────────────────────────────────────
// Patterns run against normalize()'d text (lowercase, de-hyphenated, US spelling).
//
// Each theme defines up to three relevance tiers so the engine can tell a genuine
// infrastructure story from a passing mention:
//   t1 — core infrastructure / supply-chain / named players  → +40 (heavily favored)
//   t2 — adjacent adoption / software / regulation            → +18
//   t3 — generic mentions, sentiment, commentary              → +6  (small nudge)
// A story is only treated as a strong theme match when it hits t1 or t2; a bare
// "AI" mention (t3) earns a token boost but never out-ranks genuine substance.
interface ThemeTiers { t1: RegExp; t2?: RegExp; t3?: RegExp }

const THEME_TIERS: Record<string, ThemeTiers> = {
  "AI Infrastructure": {
    t1: /data center|compute infrastructure|\bgpu\b|\bgpus\b|nvidia|\bamd\b|broadcom|tsmc|anthropic|openai|semiconductor|chip supply|chipmaker|foundation model|hyperscaler|cloud infrastructure|cloud region|ai capex|ai capital spending|ai capital expenditure|ai spending|ai investment|ai buildout|inference|training cluster|accelerated computing|power demand|substation|electricity demand/i,
    t2: /enterprise ai|ai adoption|ai software|ai platform|ai productivity|ai tool|ai agent|ai regulation|ai model|machine learning|generative ai|copilot|ai startup/i,
    t3: /\bai\b|artificial intelligence/i,
  },
  "Data Center Buildout": {
    t1: /data center|server farm|colocation|hyperscale|rack capacity|cloud region|data center capacity|data center construction|data center expansion|data center buildout|power demand|substation|grid capacity/i,
    t2: /cloud capacity|cloud spending|cloud infrastructure|compute capacity|cloud capex/i,
    t3: /\bcloud\b|hosting|hyperscaler/i,
  },
  "Power Grid Expansion": {
    t1: /transmission line|transmission|substation|grid capacity|grid expansion|grid upgrade|electrical grid|electricity grid|power grid|grid investment|grid modernization|utility infrastructure|power demand|electricity demand|interconnection queue/i,
    t2: /utility capex|electricity capacity|power capacity|renewable buildout|baseload|grid operator/i,
    t3: /\butility\b|utilities|electricity|\bpower\b/i,
  },
  "AI Compute Arms Race": {
    t1: /compute arms race|frontier model|training cluster|ai supercluster|gpu cluster|gpu allocation|ai accelerator|foundation model|blackwell|gb200|\bh100\b|\bh200\b|ai compute|compute capacity|compute scarcity|stargate|exaflop|gigawatt cluster/i,
    t2: /ai training|inference|model training|ai capex|ai infrastructure|ai investment/i,
    t3: /\bai\b|\bgpu\b|\bcompute\b/i,
  },
  "Hyperscaler Capex": {
    t1: /hyperscaler capex|cloud capex|capex guidance|capital expenditure guidance|azure capex|aws capex|capex commitment|capex ramp|capex surge|hyperscaler spending|capital intensity/i,
    t2: /cloud capital spending|cloud spending|capex cycle|capex outlook|capex raise/i,
    t3: /\bcapex\b|\bcloud\b/i,
  },
  "Grid Modernization": {
    t1: /grid modernization|transmission line|transmission capacity|transmission buildout|transmission investment|grid upgrade|grid investment|grid infrastructure|transformer shortage|switchgear|high voltage|interconnection queue|grid resilience|grid equipment/i,
    t2: /grid expansion|electricity infrastructure|grid operator|t&d capex/i,
    t3: /\bgrid\b|transmission/i,
  },
  "Utility Capex Supercycle": {
    t1: /utility capex|rate base growth|ratebase|rate base|load growth|regulated utility|utility ratebase|utility investment|rate case|integrated resource plan|electrification/i,
    t2: /utility earnings growth|power demand growth|electricity demand growth|utility capital|capital plan/i,
    t3: /\butility\b|utilities|electricity/i,
  },
  "Private Capital Takeover": {
    t1: /take private|going private|public to private|leveraged buyout|\blbo\b|private equity buyout|sponsor backed|club deal|management buyout|mega buyout|sponsor takeover|continuation fund/i,
    t2: /buyout fund|dry powder|pe acquisition|sponsor bid|private equity bid|carve out/i,
    t3: /buyout|private equity/i,
  },
  // Remaining themes use a single strong tier (preserves prior single-regex behavior).
  "Defense Rearmament":   { t1: /rearmament|defense spending|defense budget|defence|military spending|military budget|\bnato\b|arms buildup|defense procurement|defense contract|lockheed|raytheon|\bbae\b|rheinmetall|military buildup|defense investment/i },
  "Private Credit":       { t1: /private credit|direct lending|private debt|\bbdc\b|unitranche|middle market loan|middle market lending|alternative lending|non bank lending|private lending|credit fund/i },
  "Direct Lending Expansion": { t1: /direct lending|private debt fund|private credit fund|\bbdc\b|business development company|unitranche|senior secured loan|asset based lending|nav financing|perpetual capital|insurance capital|fund formation|fee related earnings/i },
  "Nuclear Renaissance":  { t1: /nuclear renaissance|nuclear power|nuclear energy|small modular reactor|\bsmr\b|uranium|nuclear reactor|fission|nuclear investment|nuclear expansion|nuclear plant/i },
  "Space Economy":        { t1: /space economy|commercial space|\bsatellite\b|launch vehicle|low earth orbit|\bleo\b|spacex|rocket lab|space tourism|orbital launch|space investment/i },
  "Cybersecurity":        { t1: /cybersecurity|cyber attack|ransomware|data breach|zero day|endpoint security|threat actor|cyber threat|cyberattack|infosec|network security|cyber incident|crowdstrike|palo alto networks/i },
  "Energy Security":      { t1: /energy security|energy independence|\blng\b|liquefied natural gas|strategic energy|energy supply|fuel supply|energy resilience|energy self sufficiency/i },
  "GLP-1 Economy":        { t1: /glp.?1|ozempic|wegovy|semaglutide|tirzepatide|mounjaro|weight loss drug|obesity drug|eli lilly|novo nordisk|anti obesity|obesity treatment/i },
  "Autonomous Systems":   { t1: /autonomous vehicle|autonomous driving|self driving|driverless|\buav\b|unmanned aerial|military drone|autonomous robot|autonomous system|full self driving|robotaxi/i },
  "Reshoring":            { t1: /reshoring|nearshoring|onshoring|friendshoring|friend shoring|supply chain relocation|domestic manufacturing|manufacturing repatriation|onshore production|reshore/i },
};

// ── Affinity model weights ────────────────────────────────────────────────────
// finalRank = convictionScore
//           + themeMatchScore + sectorMatchScore + assetClassMatchScore + marketFocusScore
//           + noOverlapPenalty
//
// The model is deliberately preference-first: a real theme hit (t1/t2) dwarfs the
// conviction (signal) base, and a story that connects to NONE of the user's
// followed themes or sectors takes a severe negative penalty so it sinks below
// every relevant story regardless of how strong its raw news signal is. This is
// what turns the feed from "most interesting finance headlines" into "what a
// technology / infrastructure / private-capital investor wants to see first".
const THEME_WEIGHT = { t1: 120, t2: 50, t3: 10 } as const; // t3 = generic mention, does NOT count as affinity
const THEME_CAP    = 240;                                   // up to two strong theme hits

const SECTOR_WEIGHT_EACH = 30, SECTOR_DEPTH_BONUS = 10, SECTOR_CAP = 80;
const ASSET_WEIGHT_EACH  = 12, ASSET_DEPTH_BONUS  = 4,  ASSET_CAP  = 44;
const MARKET_MATCH = 20, MARKET_GLOBAL = 10;

const CONVICTION_SCALE = 0.6;   // signal_score (0–100) → 0–60
const CONVICTION_CAP   = 80;

// Two-band downrank for stories that miss the user's followed THEMES and SECTORS:
//   • NO_OVERLAP   — zero preference overlap at all (no theme, sector, asset, or
//     specific-region match): coffee, screwworm, gaming, foreign infra. Buried.
//   • WEAK_OVERLAP — overlaps only on a broad asset class or the user's region
//     (e.g. a US Treasury macro story for a Fixed-Income + United States user):
//     ranked below every on-thesis story but above the zero-overlap floor.
// The severe magnitude exceeds the max positive from conviction + asset + market,
// so secondary signals can never lift an off-thesis story into the on-thesis band.
const NO_OVERLAP_PENALTY   = -200;
const WEAK_OVERLAP_PENALTY = -60;

// ── Sector / asset class keyword maps ─────────────────────────────────────────

const SECTOR_KEYWORDS: Record<string, RegExp> = {
  "Technology":             /technolog|\btech\b|\bsoftware\b|\bai\b|artificial intelligence|semiconductor|\bchips?\b|\bcloud\b|\bsaas\b|data center|\bgpu\b|\bdigital\b|\bcyber/i,
  "Healthcare":             /health|pharma|biotech|medical|\bdrug\b|\bfda\b|clinical|hospital|therapeutics|vaccine/i,
  "Financial Services":     /\bbank|finance|financial|\bcredit\b|insurance|monetary|hedge fund|asset manager|broker/i,
  "Energy":                 /\boil\b|natural gas|energy|crude|opec|pipeline|renewable|solar|\bwind\b|\blng\b|refin/i,
  "Industrials":            /manufactur|aerospace|defense|industrial|logistics|transport|freight/i,
  "Consumer Discretionary": /retail|consumer discret|automaker|\bauto\b|luxury|restaurant|hotel|travel|apparel|e commerce/i,
  "Materials":              /mining|steel|alumin|copper|chemical|commodity|metal|lithium|cement/i,
  "Real Estate":            /real estate|\breit\b|property market|housing|mortgage|commercial property/i,
  "Communication Services": /\bmedia\b|telecom|streaming|social media|advertising|content|broadcast|wireless/i,
  "Consumer Staples":       /\bfood\b|beverage|grocery|household staple|consumer packaged/i,
  "Utilities":              /\butility|utilities|power grid|electricity|water supply|nuclear power/i,
};

const ASSET_KEYWORDS: Record<string, RegExp> = {
  "Equities":        /\bstock|equity|equities|share price|\bipo\b|earnings|dividend|\bs&p\b|nasdaq|\bnyse\b|\bdow\b/i,
  "Fixed Income":    /\bbond|yield|treasury|sovereign|credit spread|\bdebt\b|fixed income|duration|coupon/i,
  "FX / Currencies": /\bdollar\b|euro|yen|yuan|pound|sterling|currency|\bforex\b|\bfx\b|exchange rate/i,
  "Commodities":     /\boil\b|\bgold\b|silver|copper|commodity|commodities|crude|grain|wheat|corn/i,
  "Crypto":          /bitcoin|crypto|ethereum|blockchain|defi|\bnft\b|digital asset|stablecoin/i,
  "Private Equity":  /private equity|buyout|leveraged buyout|\blbo\b|venture capital|\bvc\b fund|pe firm/i,
  "Real Estate":     /real estate|\breit\b|property market|commercial real estate|\bcre\b|cap rate/i,
  "Derivatives":     /\boption|futures|derivative|volatility|\bvix\b|\bhedge\b|\bswap\b|\bput\b|\bcall\b/i,
};

const REGION_KEYWORDS: Record<string, RegExp | null> = {
  "United States":   /\bus\b|united states|american|federal reserve|\bfed\b|wall street|washington|treasury|congress/i,
  "Europe":          /europe|european|\beu\b|\becb\b|eurozone|euro area|germany|france|\buk\b|britain|london/i,
  "China":           /china|chinese|beijing|\bpboc\b|shanghai|hong kong|\bccp\b|xi jinping/i,
  "Japan":           /japan|japanese|\bboj\b|nikkei|tokyo/i,
  "India":           /india|indian|\brbi\b|mumbai|sensex|nifty|modi/i,
  "Emerging Markets":/emerging market|\bem markets\b|latam|brazil|mexico|south korea|taiwan|indonesia/i,
  "Global":          null, // null = always match
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Normalize text before matching so headline variants converge:
//   - lowercase everything
//   - British → American spelling ("data centre" → "data center")
//   - hyphens / en-dashes / em-dashes → spaces ("AI-chip" → "ai chip")
//   - collapse whitespace
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/centre/g, "center")
    .replace(/[-‐‑‒–—―]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textOf(cluster: StoryCluster): string {
  const p = cluster.primary;
  return normalize([
    p.title,
    p.summary,
    p.why_it_matters,
    p.impact,
    cluster.theme_label,
    ...(p.affected_entities ?? []),
    ...(cluster.related?.map(r => r.title) ?? []),
  ].join(" "));
}

function matchCount(text: string, rx: RegExp): number {
  const global = new RegExp(rx.source, "gi");
  return (text.match(global) ?? []).length;
}

// ── Scoring functions ─────────────────────────────────────────────────────────

function sectorScore(
  text: string,
  sectors: string[],
): { score: number; matched: string[] } {
  if (!sectors.length) return { score: 0, matched: [] };
  let score = 0;
  const matched: string[] = [];
  for (const sector of sectors) {
    const rx = SECTOR_KEYWORDS[sector];
    if (rx?.test(text)) {
      score += SECTOR_WEIGHT_EACH;
      // Repeated mentions → dominant subject, not a passing reference.
      if (matchCount(text, rx) >= 2) score += SECTOR_DEPTH_BONUS;
      matched.push(sector);
    }
  }
  return { score: Math.min(score, SECTOR_CAP), matched };
}

function assetScore(
  text: string,
  assets: string[],
): { score: number; matched: string[] } {
  if (!assets.length) return { score: 0, matched: [] };
  let score = 0;
  const matched: string[] = [];
  for (const asset of assets) {
    const rx = ASSET_KEYWORDS[asset];
    if (rx?.test(text)) {
      score += ASSET_WEIGHT_EACH;
      if (matchCount(text, rx) >= 2) score += ASSET_DEPTH_BONUS;
      matched.push(asset);
    }
  }
  return { score: Math.min(score, ASSET_CAP), matched };
}

function regionScore(text: string, region: string): { score: number; matched: string | null } {
  if (!region) return { score: 0, matched: null };
  const rx = REGION_KEYWORDS[region];
  if (rx === null) return { score: MARKET_GLOBAL, matched: region }; // "Global" always matches
  return rx?.test(text) ? { score: MARKET_MATCH, matched: region } : { score: 0, matched: null };
}

function roleScore(cluster: StoryCluster, role: string): number {
  if (!role) return 0;
  const { category, signal_score } = cluster.primary;
  switch (role) {
    case "professional": return signal_score >= 70 ? 10 : 0;
    case "pm":           return (category === "Markets" || signal_score >= 70) ? 10 : 0;
    case "operator":     return (category === "M&A"    || category === "Company") ? 10 : 0;
    case "researcher":   return 5;
    case "student":      return 5;
    default:             return 0;
  }
}

// Strongest preference signal. Each followed theme contributes the weight of its
// highest matched tier (t1 / t2 / t3). `matchedStrong` lists only themes hit at
// t1 or t2 — a bare t3 generic mention ("AI is changing markets") adds a token
// score but is NOT treated as a genuine theme connection. `bestTier` is the
// strongest tier hit across all followed themes (1 = strongest); 0 = no match.
function followedThemeScore(
  text: string,
  themes: string[],
): { score: number; matchedStrong: string[]; bestTier: number } {
  if (!themes.length) return { score: 0, matchedStrong: [], bestTier: 0 };
  let score = 0;
  let bestTier = 0;
  const matchedStrong: string[] = [];
  for (const theme of themes) {
    const tiers = THEME_TIERS[theme];
    if (!tiers) continue;
    let w = 0, tier = 0;
    if      (tiers.t1.test(text))  { w = THEME_WEIGHT.t1; tier = 1; }
    else if (tiers.t2?.test(text)) { w = THEME_WEIGHT.t2; tier = 2; }
    else if (tiers.t3?.test(text)) { w = THEME_WEIGHT.t3; tier = 3; }
    if (w > 0) {
      score += w;
      if (tier <= 2) matchedStrong.push(theme);
      bestTier = bestTier === 0 ? tier : Math.min(bestTier, tier);
    }
  }
  return { score: Math.min(score, THEME_CAP), matchedStrong, bestTier };
}

// Conviction base — the raw news signal, scaled so it stays subordinate to a real
// theme/sector match but still differentiates within the relevant pool.
function convictionScore(cluster: StoryCluster, role: string): number {
  const sig      = cluster.primary.signal_score ?? 0;
  const strength = cluster.primary.signal_strength;
  let c = Math.max(0, sig) * CONVICTION_SCALE;
  if (strength === "strong")    c += 6;
  else if (strength === "weak") c -= 4;
  c += roleScore(cluster, role);
  return Math.max(0, Math.min(c, CONVICTION_CAP));
}

// ── Public API ────────────────────────────────────────────────────────────────

function prefsAreEmpty(prefs: UserPrefs): boolean {
  return (
    prefs.followed_themes.length        === 0 &&
    prefs.followed_sectors.length       === 0 &&
    prefs.followed_asset_classes.length === 0 &&
    !prefs.user_role &&
    !prefs.region_focus
  );
}

// ── Preference affinity ─────────────────────────────────────────────────────
// The explicit, debuggable breakdown attached to every ranked cluster:
//   finalRank = convictionScore
//             + themeMatchScore + sectorMatchScore + assetClassMatchScore
//             + marketFocusScore + penalty
// `reasons` lists the human-readable preference matches that lifted the story —
// the source of the dev-mode "Ranked because:" annotation.
export interface ClusterAffinity {
  finalRank:            number;
  convictionScore:      number;
  themeMatchScore:      number;
  sectorMatchScore:     number;
  assetClassMatchScore: number;
  marketFocusScore:     number;
  penalty:              number;   // 0, or NO_OVERLAP_PENALTY when off-thesis
  themeTier:            number;   // 0 none · 1 strong · 2 adjacent · 3 generic
  hasAffinity:          boolean;  // true when a real theme (t1/t2) or sector hit exists
  reasons:              string[]; // positive contributors, in priority order
}

export function computeAffinity(cluster: StoryCluster, prefs: UserPrefs): ClusterAffinity {
  const text = textOf(cluster);
  const th = followedThemeScore(text, prefs.followed_themes);
  const se = sectorScore(text, prefs.followed_sectors);
  const as = assetScore(text, prefs.followed_asset_classes);
  const mk = regionScore(text, prefs.region_focus);
  const conviction = convictionScore(cluster, prefs.user_role);

  // A story is on-thesis (full prominence) only when it connects to a followed
  // THEME (t1/t2) or a followed SECTOR. A broad asset-class or specific-region
  // match alone is "secondary" — relevant, but not what a thematic investor wants
  // first. Anything with no overlap whatsoever takes the severe penalty.
  const hasThesis    = th.bestTier === 1 || th.bestTier === 2 || se.score > 0;
  const hasSecondary = as.score > 0 || mk.score >= MARKET_MATCH; // MARKET_GLOBAL alone doesn't count
  const penalty = hasThesis
    ? 0
    : hasSecondary ? WEAK_OVERLAP_PENALTY : NO_OVERLAP_PENALTY;
  const hasAffinity = hasThesis;

  const finalRank =
    conviction + th.score + se.score + as.score + mk.score + penalty;

  const reasons: string[] = [
    ...th.matchedStrong,
    ...se.matched,
    ...as.matched,
    ...(mk.matched ? [mk.matched] : []),
  ];

  return {
    finalRank,
    convictionScore:      Math.round(conviction),
    themeMatchScore:      th.score,
    sectorMatchScore:     se.score,
    assetClassMatchScore: as.score,
    marketFocusScore:     mk.score,
    penalty,
    themeTier:            th.bestTier,
    hasAffinity,
    reasons,
  };
}

function toRanked(cluster: StoryCluster, a: ClusterAffinity, debug: boolean): RankedCluster {
  return {
    ...cluster,
    relevance_score: a.finalRank,
    affinity:        a,
    _debug: debug ? {
      finalRank:    a.finalRank,
      conviction:   a.convictionScore,
      theme:        a.themeMatchScore,
      sector:       a.sectorMatchScore,
      asset:        a.assetClassMatchScore,
      market:       a.marketFocusScore,
      penalty:      a.penalty,
      reasons:      a.reasons,
    } : undefined,
  };
}

export function scoreCluster(
  cluster: StoryCluster,
  prefs: UserPrefs,
  debug = false,
): RankedCluster {
  return toRanked(cluster, computeAffinity(cluster, prefs), debug);
}

// ── Strict quality gate ──────────────────────────────────────────────────────
// A personalized feed prioritizes signal density over volume: it shows ONLY
// stories that clear both bars and never backfills with weak content. If just 15
// stories qualify, the feed is 15 stories long.
//   • relevance_score (= affinity.finalRank) must be ≥ 70 — a genuine connection
//     to a followed theme/sector; secondary and off-thesis stories score below it.
//   • signal_score (institutional conviction, 0–100) must be ≥ 60.
export const MIN_RELEVANCE_SCORE  = 70;
export const MIN_CONVICTION_SCORE = 60;

/** True when a ranked story clears both quality bars (relevance AND conviction). */
export function passesQualityGate(c: RankedCluster): boolean {
  return c.relevance_score >= MIN_RELEVANCE_SCORE
      && (c.primary.signal_score ?? 0) >= MIN_CONVICTION_SCORE;
}

/**
 * Preference-first ranking + strict quality gate. Every story gets an additive
 * affinity score (severe penalty for zero theme/sector overlap), the list is
 * sorted by finalRank (signal_score breaks ties), then everything below the
 * relevance/conviction bars is DROPPED — not backfilled. On-thesis infrastructure
 * / private-capital stories rise to the top; weak or off-thesis stories don't
 * appear at all. When no prefs are set the gate is skipped (the unpersonalized
 * feed has no relevance signal to threshold on).
 */
export function rankClusters(
  clusters: StoryCluster[],
  prefs: UserPrefs,
): RankedCluster[] {
  if (prefsAreEmpty(prefs)) {
    return clusters.map(c => ({ ...c, relevance_score: 0, affinity: undefined, _debug: undefined }));
  }

  const isDev = process.env.NODE_ENV === "development";

  const ranked = clusters
    .map(c => toRanked(c, computeAffinity(c, prefs), isDev))
    .sort((a, b) =>
      b.relevance_score      - a.relevance_score ||
      b.primary.signal_score - a.primary.signal_score,
    );

  const gated = ranked.filter(passesQualityGate);

  if (isDev) {
    const origPos = new Map(clusters.map((c, i) => [c.id, i + 1]));
    console.group(
      `[feedRanker] quality gate: kept ${gated.length} / ${ranked.length}  `
      + `(relevance≥${MIN_RELEVANCE_SCORE} AND conviction≥${MIN_CONVICTION_SCORE})`,
    );
    ranked.slice(0, 25).forEach((c, idx) => {
      const a     = c.affinity!;
      const orig  = origPos.get(c.id) ?? "?";
      const kept  = passesQualityGate(c);
      const sig   = Math.round(c.primary.signal_score ?? 0);
      const fail  = kept ? "" :
        c.relevance_score < MIN_RELEVANCE_SCORE && sig < MIN_CONVICTION_SCORE ? "  ✗ relevance+conviction"
        : c.relevance_score < MIN_RELEVANCE_SCORE ? "  ✗ relevance"
        : "  ✗ conviction";
      const why   = a.reasons.length ? `+ ${a.reasons.join("  + ")}` : "no preference overlap";
      console.log(
        `%c${kept ? "✓" : "·"} ${String(idx + 1).padStart(2)}. (was #${String(orig).padStart(2)}) `
        + `rank=${String(Math.round(c.relevance_score)).padStart(4)} conv=${String(sig).padStart(3)} `
        + `[thm ${a.themeMatchScore} · sec ${a.sectorMatchScore} · ast ${a.assetClassMatchScore} · mkt ${a.marketFocusScore}${a.penalty ? ` · pen ${a.penalty}` : ""}]${fail} `
        + `${c.primary.title.slice(0, 44)}`,
        kept ? "color:#6aad6a" : "color:#777",
        `\n     ${why}`,
      );
    });
    console.groupEnd();
  }

  return gated;
}

// ── Cross-section personalization ─────────────────────────────────────────────
// The cluster stream is not the only personalized surface. The homepage's
// derived modules (What Matters Now, the Intelligence Strip's Opportunity / Risk
// / Leaders selections, the Narrative Network's transmission paths) are computed
// from theme-intelligence and WMN pools. These helpers score arbitrary text and
// theme objects with the same tiered model so every high-visibility section can
// be reordered/weighted toward the user's followed themes and sectors.

/**
 * Generic preference score for any free text (a theme description, a narrative
 * chain, a story title). Theme matches dominate; sectors and assets add weight.
 * Returns 0 when prefs are empty (callers should leave ordering untouched).
 */
export function textPreferenceScore(text: string, prefs: UserPrefs): number {
  if (prefsAreEmpty(prefs)) return 0;
  const t  = normalize(text);
  const th = followedThemeScore(t, prefs.followed_themes);
  const s  = sectorScore(t, prefs.followed_sectors);
  const a  = assetScore(t, prefs.followed_asset_classes);
  // Weight themes heavily so a tier-1 theme hit (100) dominates the engine's own
  // confidence-based scores (which run ~0–150) when used as an additive boost.
  // A tier-3 generic mention (3) stays near-inert here too.
  return th.score * 2 + s.score * 1 + a.score * 0.75;
}

/** All descriptive text fields of a theme-intelligence object, joined. */
function themeText(theme: ThemeIntelligence): string {
  return [
    theme.name,
    theme.description,
    theme.causal_narrative,
    ...(theme.related_industries    ?? []),
    ...(theme.related_assets        ?? []),
    ...(theme.related_macro_factors ?? []),
    ...(theme.second_order_effects  ?? []),
  ].join(" ");
}

/**
 * Preference score for a theme-intelligence object. Used as an additive boost in
 * the Intelligence Strip so Opportunity / Risk / Leaders selections surface the
 * user's followed themes and sectors first.
 */
export function themePreferenceScore(theme: ThemeIntelligence, prefs: UserPrefs): number {
  return textPreferenceScore(themeText(theme), prefs);
}

/** True when a theme has any preference relevance — used for hard prioritization. */
export function themeMatchesPrefs(theme: ThemeIntelligence, prefs: UserPrefs): boolean {
  return themePreferenceScore(theme, prefs) > 0;
}

/**
 * Reorder What Matters Now items toward followed themes/sectors. Items are scored
 * on their cluster's primary story text + theme label; stable-sorted so the
 * backend's signal ordering is preserved within equal-relevance groups. Returns
 * the input unchanged when prefs are empty.
 */
export function rankWhatMattersNow(
  items: WhatMattersNowItem[],
  prefs: UserPrefs,
): WhatMattersNowItem[] {
  if (prefsAreEmpty(prefs) || items.length === 0) return items;
  const scoreOf = (it: WhatMattersNowItem) => {
    const p = it.cluster.primary;
    const text = [
      p.title, p.summary, p.why_it_matters, p.impact,
      it.cluster.theme_label, it.wmn_label, it.thesis,
      ...(p.affected_entities ?? []),
    ].join(" ");
    return textPreferenceScore(text, prefs);
  };
  return items
    .map((it, i) => ({ it, i, s: scoreOf(it) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(x => x.it);
}

/**
 * Reorder a theme list toward followed themes/sectors (stable). Drives the
 * theme-tag matching in What Matters Now and any leaderboard that renders themes
 * in array order. Returns the input unchanged when prefs are empty.
 */
export function rankThemes(
  themes: ThemeIntelligence[],
  prefs: UserPrefs,
): ThemeIntelligence[] {
  if (prefsAreEmpty(prefs) || themes.length === 0) return themes;
  return themes
    .map((t, i) => ({ t, i, s: themePreferenceScore(t, prefs) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(x => x.t);
}
