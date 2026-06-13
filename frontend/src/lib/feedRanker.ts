import type { StoryCluster, ThemeIntelligence, WhatMattersNowItem } from "./types";

export interface UserPrefs {
  followed_themes:        string[];
  followed_sectors:       string[];
  followed_asset_classes: string[];
  user_role:              string;
  region_focus:           string;
}

export interface RankedCluster extends StoryCluster {
  relevance_score:  number;
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
  // Remaining themes use a single strong tier (preserves prior single-regex behavior).
  "Defense Rearmament":   { t1: /rearmament|defense spending|defense budget|defence|military spending|military budget|\bnato\b|arms buildup|defense procurement|defense contract|lockheed|raytheon|\bbae\b|rheinmetall|military buildup|defense investment/i },
  "Private Credit":       { t1: /private credit|direct lending|private debt|\bbdc\b|unitranche|middle market loan|middle market lending|alternative lending|non bank lending|private lending|credit fund/i },
  "Nuclear Renaissance":  { t1: /nuclear renaissance|nuclear power|nuclear energy|small modular reactor|\bsmr\b|uranium|nuclear reactor|fission|nuclear investment|nuclear expansion|nuclear plant/i },
  "Space Economy":        { t1: /space economy|commercial space|\bsatellite\b|launch vehicle|low earth orbit|\bleo\b|spacex|rocket lab|space tourism|orbital launch|space investment/i },
  "Cybersecurity":        { t1: /cybersecurity|cyber attack|ransomware|data breach|zero day|endpoint security|threat actor|cyber threat|cyberattack|infosec|network security|cyber incident|crowdstrike|palo alto networks/i },
  "Energy Security":      { t1: /energy security|energy independence|\blng\b|liquefied natural gas|strategic energy|energy supply|fuel supply|energy resilience|energy self sufficiency/i },
  "GLP-1 Economy":        { t1: /glp.?1|ozempic|wegovy|semaglutide|tirzepatide|mounjaro|weight loss drug|obesity drug|eli lilly|novo nordisk|anti obesity|obesity treatment/i },
  "Autonomous Systems":   { t1: /autonomous vehicle|autonomous driving|self driving|driverless|\buav\b|unmanned aerial|military drone|autonomous robot|autonomous system|full self driving|robotaxi/i },
  "Reshoring":            { t1: /reshoring|nearshoring|onshoring|friendshoring|friend shoring|supply chain relocation|domestic manufacturing|manufacturing repatriation|onshore production|reshore/i },
};

// Aggressive tier separation: a tier-1 infrastructure hit must dominate sector /
// region / role signals combined, while a tier-3 generic mention is near-inert.
const TIER_WEIGHT = { t1: 100, t2: 30, t3: 3 } as const;

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
    if (rx?.test(text)) { score += 30; matched.push(sector); }
  }
  return { score: Math.min(score, 60), matched };
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
    if (rx?.test(text)) { score += 20; matched.push(asset); }
  }
  return { score: Math.min(score, 40), matched };
}

function regionScore(text: string, region: string): number {
  if (!region) return 0;
  const rx = REGION_KEYWORDS[region];
  if (rx === null) return 15; // "Global" always matches
  return rx?.test(text) ? 15 : 0;
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

// Priority 1 — strongest signal. Each followed theme contributes the weight of
// its highest matched tier (t1 +40 / t2 +18 / t3 +6). `bestTier` is the strongest
// tier hit across all followed themes (1 = strongest); 0 = no theme match.
function followedThemeScore(
  text: string,
  themes: string[],
): { score: number; matched: string[]; bestTier: number } {
  if (!themes.length) return { score: 0, matched: [], bestTier: 0 };
  let score = 0;
  let bestTier = 0;
  const matched: string[] = [];
  for (const theme of themes) {
    const tiers = THEME_TIERS[theme];
    if (!tiers) continue;
    let w = 0, tier = 0;
    if      (tiers.t1.test(text))  { w = TIER_WEIGHT.t1; tier = 1; }
    else if (tiers.t2?.test(text)) { w = TIER_WEIGHT.t2; tier = 2; }
    else if (tiers.t3?.test(text)) { w = TIER_WEIGHT.t3; tier = 3; }
    if (w > 0) {
      score += w;
      matched.push(theme);
      bestTier = bestTier === 0 ? tier : Math.min(bestTier, tier);
    }
  }
  return { score: Math.min(score, 200), matched, bestTier };
}

function themeScore(text: string, sectors: string[], assets: string[]): number {
  // Bonus for topics that appear repeatedly — indicates a dominant theme, not a passing mention.
  let hits = 0;
  for (const s of sectors) {
    const rx = SECTOR_KEYWORDS[s];
    if (rx && matchCount(text, rx) >= 2) hits++;
  }
  for (const a of assets) {
    const rx = ASSET_KEYWORDS[a];
    if (rx && matchCount(text, rx) >= 2) hits++;
  }
  return Math.min(hits * 5, 15);
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

// Full score breakdown — always computed (tiering depends on theme/sector hits,
// which must work in production, not only in dev/debug mode).
interface ScoreBreakdown {
  relevance:      number;
  themeScore:     number;
  themeTier:      number;   // 0 none · 1 strong · 2 adjacent · 3 generic
  sectorScore:    number;
  assetScore:     number;
  region:         number;
  role:           number;
  themeDepth:     number;
  matchedThemes:  string[];
  matchedSectors: string[];
  matchedAssets:  string[];
}

function computeBreakdown(cluster: StoryCluster, prefs: UserPrefs): ScoreBreakdown {
  const text = textOf(cluster);
  const th   = followedThemeScore(text, prefs.followed_themes);
  const s    = sectorScore(text, prefs.followed_sectors);
  const a    = assetScore(text, prefs.followed_asset_classes);
  const r    = regionScore(text, prefs.region_focus);
  const ro   = roleScore(cluster, prefs.user_role);
  const td   = themeScore(text, prefs.followed_sectors, prefs.followed_asset_classes);
  return {
    relevance:      th.score + s.score + a.score + r + ro + td,
    themeScore:     th.score,
    themeTier:      th.bestTier,
    sectorScore:    s.score,
    assetScore:     a.score,
    region:         r,
    role:           ro,
    themeDepth:     td,
    matchedThemes:  th.matched,
    matchedSectors: s.matched,
    matchedAssets:  a.matched,
  };
}

// Ranking tier for a cluster, matching the user-facing relevance model:
//   Tier 1 — tier-1 theme hit (infra / semis / data centers / utilities / power /
//            private credit / transmission / hyperscalers). Heavily dominates.
//   Tier 2 — tier-2 theme hit (AI software / adoption / regulation), OR a genuine
//            followed-sector match with no generic-theme noise. Moderate boost.
//   Tier 3 — generic (tier-3) theme mentions + everything else. Near the bottom.
// A bare generic mention ("AI is changing markets") is forced to Tier 3 even when
// it incidentally trips the broad sector regex, so it rarely appears near the top.
function clusterTier(b: ScoreBreakdown): 1 | 2 | 3 {
  if (b.themeTier === 1) return 1;
  if (b.themeTier === 2) return 2;
  if (b.themeTier === 0 && b.sectorScore > 0) return 2;
  return 3;
}

function toRanked(cluster: StoryCluster, b: ScoreBreakdown, debug: boolean): RankedCluster {
  return {
    ...cluster,
    relevance_score: b.relevance,
    _debug: debug ? {
      followedTheme:  b.themeScore,
      sector:         b.sectorScore,
      asset:          b.assetScore,
      region:         b.region,
      role:           b.role,
      themeDepth:     b.themeDepth,
      matchedThemes:  b.matchedThemes,
      matchedSectors: b.matchedSectors,
      matchedAssets:  b.matchedAssets,
    } : undefined,
  };
}

export function scoreCluster(
  cluster: StoryCluster,
  prefs: UserPrefs,
  debug = false,
): RankedCluster {
  return toRanked(cluster, computeBreakdown(cluster, prefs), debug);
}

/**
 * Tiered ranking — a tier-1 theme match always outranks everything below it,
 * regardless of signal score:
 *   Tier 1 — tier-1 theme hit (real infrastructure / semis / data centers / etc.)
 *   Tier 2 — tier-2 theme hit, OR a genuine followed-sector match
 *   Tier 3 — generic (tier-3) theme mentions + everything else
 * Within each tier, sort by relevance score, then signal score.
 */
export function rankClusters(
  clusters: StoryCluster[],
  prefs: UserPrefs,
): RankedCluster[] {
  if (prefsAreEmpty(prefs)) {
    return clusters.map(c => ({ ...c, relevance_score: 0, _debug: undefined }));
  }

  const isDev = process.env.NODE_ENV === "development";

  const scored = clusters.map(c => {
    const b = computeBreakdown(c, prefs);
    return { rc: toRanked(c, b, isDev), b, tier: clusterTier(b) };
  });

  const tier1 = scored.filter(x => x.tier === 1);
  const tier2 = scored.filter(x => x.tier === 2);
  const tier3 = scored.filter(x => x.tier === 3);

  const byScore = (a: typeof scored[number], b: typeof scored[number]) =>
    b.rc.relevance_score      - a.rc.relevance_score ||
    b.rc.primary.signal_score - a.rc.primary.signal_score;

  tier1.sort(byScore);
  tier2.sort(byScore);
  tier3.sort(byScore);

  const ordered = [...tier1, ...tier2, ...tier3];
  const ranked  = ordered.map(x => x.rc);

  if (isDev) {
    const origPos = new Map(clusters.map((c, i) => [c.id, i + 1]));
    console.group(
      `[feedRanker] tier1(infra)=${tier1.length}  tier2(sector/adjacent)=${tier2.length}  tier3(generic/other)=${tier3.length}  of ${ranked.length}`,
    );
    ordered.slice(0, 20).forEach((x, finalIdx) => {
      const c     = x.rc;
      const orig  = origPos.get(c.id) ?? "?";
      const delta = typeof orig === "number" ? orig - (finalIdx + 1) : 0;
      const arrow = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : "=";
      const labels = [
        ...x.b.matchedThemes.map(t  => `theme:${t}`),
        ...x.b.matchedSectors.map(s => `sector:${s}`),
        ...x.b.matchedAssets.map(a  => `asset:${a}`),
        ...(x.b.region ? [`region(+${x.b.region})`] : []),
        ...(x.b.role   ? [`role(+${x.b.role})`]     : []),
      ].join(", ") || "no match";
      console.log(
        `%cT${x.tier} ${String(finalIdx + 1).padStart(2)}. (was #${String(orig).padStart(2)} ${arrow.padEnd(4)}) sig=${String(Math.round(c.primary.signal_score)).padStart(3)} rel=${String(c.relevance_score).padStart(3)} ${c.primary.title.slice(0, 50)}`,
        x.tier === 1 ? "color:#6aad6a" : x.tier === 2 ? "color:#c8a040" : "color:#888",
        `\n     ${labels}`,
      );
    });
    console.groupEnd();
  }

  return ranked;
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
