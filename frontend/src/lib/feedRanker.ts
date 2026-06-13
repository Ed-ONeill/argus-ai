import type { StoryCluster } from "./types";

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

// ── Theme keyword maps ────────────────────────────────────────────────────────
// Matches cluster text against the curated theme list. Each theme has tight,
// high-precision patterns to avoid false positives inflating scores.

// Patterns run against normalize()'d text (lowercase, de-hyphenated, US spelling).
// Broadened to match real headline language ("AI boom", "AI-chip", "data centre")
// rather than only rigid compound phrases.
const THEME_KEYWORDS: Record<string, RegExp> = {
  "AI Infrastructure":    /\bai\b|artificial intelligence|\bgpu\b|\bgpus\b|nvidia|\bamd\b|inference|training cluster|\bllm\b|\bllms\b|foundation model|hyperscaler|cloud compute|compute capacity|ai infrastructure|ai data center|ai chip|ai compute|ai buildout|accelerated computing/i,
  "Defense Rearmament":   /rearmament|defense spending|defense budget|defence|military spending|military budget|\bnato\b|arms buildup|defense procurement|defense contract|lockheed|raytheon|\bbae\b|rheinmetall|military buildup|defense investment/i,
  "Power Grid Expansion": /transmission|substation|utility infrastructure|grid capacity|grid upgrade|power demand|electricity demand|transmission line|power grid|grid expansion|electrical grid|grid investment|grid modernization|electricity grid/i,
  "Private Credit":       /private credit|direct lending|private debt|\bbdc\b|unitranche|middle market loan|middle market lending|alternative lending|non bank lending|private lending|credit fund/i,
  "Nuclear Renaissance":  /nuclear renaissance|nuclear power|nuclear energy|small modular reactor|\bsmr\b|uranium|nuclear reactor|fission|nuclear investment|nuclear expansion|nuclear plant/i,
  "Space Economy":        /space economy|commercial space|\bsatellite\b|launch vehicle|low earth orbit|\bleo\b|spacex|rocket lab|space tourism|orbital launch|space investment/i,
  "Cybersecurity":        /cybersecurity|cyber attack|ransomware|data breach|zero day|endpoint security|threat actor|cyber threat|cyberattack|infosec|network security|cyber incident|crowdstrike|palo alto networks/i,
  "Energy Security":      /energy security|energy independence|\blng\b|liquefied natural gas|strategic energy|energy supply|fuel supply|energy resilience|energy self sufficiency/i,
  "GLP-1 Economy":        /glp.?1|ozempic|wegovy|semaglutide|tirzepatide|mounjaro|weight loss drug|obesity drug|eli lilly|novo nordisk|anti obesity|obesity treatment/i,
  "Autonomous Systems":   /autonomous vehicle|autonomous driving|self driving|driverless|\buav\b|unmanned aerial|military drone|autonomous robot|autonomous system|full self driving|robotaxi/i,
  "Reshoring":            /reshoring|nearshoring|onshoring|friendshoring|friend shoring|supply chain relocation|domestic manufacturing|manufacturing repatriation|onshore production|reshore/i,
  "Data Center Buildout": /data center|server farm|colocation|hyperscale|rack capacity|power demand|cloud region|data center buildout|data center expansion|data center capacity|data center construction/i,
};

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

// Priority 1 — strongest signal: +40 per followed theme match (capped at 80)
function followedThemeScore(
  text: string,
  themes: string[],
): { score: number; matched: string[] } {
  if (!themes.length) return { score: 0, matched: [] };
  let score = 0;
  const matched: string[] = [];
  for (const theme of themes) {
    const rx = THEME_KEYWORDS[theme];
    if (rx?.test(text)) { score += 40; matched.push(theme); }
  }
  return { score: Math.min(score, 80), matched };
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
 * Tiered ranking — a followed-theme match always outranks any non-theme story,
 * regardless of signal score:
 *   Tier 1 — clusters matching a followed theme
 *   Tier 2 — clusters matching a followed sector (but no followed theme)
 *   Tier 3 — everything else
 * Within each tier, sort by signal score (relevance score breaks ties).
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
    return { rc: toRanked(c, b, isDev), b };
  });

  const tier1 = scored.filter(x => x.b.themeScore > 0);
  const tier2 = scored.filter(x => x.b.themeScore === 0 && x.b.sectorScore > 0);
  const tier3 = scored.filter(x => x.b.themeScore === 0 && x.b.sectorScore === 0);

  const bySignal = (a: typeof scored[number], b: typeof scored[number]) =>
    b.rc.primary.signal_score - a.rc.primary.signal_score ||
    b.rc.relevance_score      - a.rc.relevance_score;

  tier1.sort(bySignal);
  tier2.sort(bySignal);
  tier3.sort(bySignal);

  const ordered = [...tier1, ...tier2, ...tier3];
  const ranked  = ordered.map(x => x.rc);

  if (isDev) {
    const origPos = new Map(clusters.map((c, i) => [c.id, i + 1]));
    const tierOf  = (x: typeof scored[number]) =>
      x.b.themeScore > 0 ? 1 : x.b.sectorScore > 0 ? 2 : 3;
    console.group(
      `[feedRanker] tier1(theme)=${tier1.length}  tier2(sector)=${tier2.length}  tier3(other)=${tier3.length}  of ${ranked.length}`,
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
        `%cT${tierOf(x)} ${String(finalIdx + 1).padStart(2)}. (was #${String(orig).padStart(2)} ${arrow.padEnd(4)}) sig=${String(Math.round(c.primary.signal_score)).padStart(3)} rel=${String(c.relevance_score).padStart(3)} ${c.primary.title.slice(0, 50)}`,
        x.b.themeScore > 0 ? "color:#6aad6a" : x.b.sectorScore > 0 ? "color:#c8a040" : "color:#888",
        `\n     ${labels}`,
      );
    });
    console.groupEnd();
  }

  return ranked;
}
