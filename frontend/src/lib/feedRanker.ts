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

// Patterns use simple phrase alternations only — no order-dependent .* compounds.
// Each alternative is a short phrase that unambiguously maps to the theme.
const THEME_KEYWORDS: Record<string, RegExp> = {
  "AI Infrastructure":    /ai infrastructure|ai data center|gpu cluster|foundation model|ai chip|ai compute|training compute|inference hardware|inference infrastructure|llm infrastructure|model training|ai buildout|compute buildout|nvidia.*cluster|ai.*capacity/i,
  "Defense Rearmament":   /rearmament|defense spending|defense budget|military spending|military budget|nato.*expansion|arms buildup|defense procurement|defense contract|lockheed|raytheon|\bbae\b|rheinmetall|military buildup|defense investment/i,
  "Power Grid Expansion": /power grid|grid expansion|grid infrastructure|transmission line|electricity grid|grid upgrade|grid investment|grid capacity|electrical grid|grid modernization|high.voltage transmission/i,
  "Private Credit":       /private credit|direct lending|private debt|\bbdc\b|unitranche|middle.market loan|middle market lending|alternative lending|non.bank lending|private lending/i,
  "Nuclear Renaissance":  /nuclear renaissance|nuclear power|nuclear energy|small modular reactor|\bsmr\b|uranium|nuclear reactor|fission|nuclear investment|nuclear expansion|nuclear.*build/i,
  "Space Economy":        /space economy|commercial space|satellite launch|launch vehicle|low earth orbit|\bleo\b|spacex|rocket lab|space tourism|orbital launch|space investment|launch.*satellite/i,
  "Cybersecurity":        /cybersecurity|cyber attack|ransomware|data breach|zero.day|endpoint security|threat actor|cyber threat|cyberattack|infosec|network security|cyber incident/i,
  "Energy Security":      /energy security|energy independence|\blng\b|liquefied natural gas|strategic energy|energy supply|fuel supply|energy resilience|energy self.sufficiency|energy transition.*security/i,
  "GLP-1 Economy":        /glp.1|ozempic|wegovy|semaglutide|tirzepatide|mounjaro|weight.loss drug|obesity drug|eli lilly|novo nordisk|glp1|anti.obesity medication|obesity treatment/i,
  "Autonomous Systems":   /autonomous vehicle|autonomous driving|self.driving|driverless|\buav\b|unmanned aerial|military drone|autonomous robot|autonomous system|robotics.*autonomous|full self.driving/i,
  "Reshoring":            /reshoring|nearshoring|onshoring|friendshoring|friend.shoring|supply chain relocation|domestic manufacturing|manufacturing repatriation|onshore production|bring.*manufacturing.*home|factory.*domestic/i,
  "Data Center Buildout": /data center construction|data center expansion|data center investment|data center buildout|data center development|hyperscaler expansion|colocation expansion|server farm|new data center|data center capacity/i,
};

// ── Sector / asset class keyword maps ─────────────────────────────────────────

const SECTOR_KEYWORDS: Record<string, RegExp> = {
  "Technology":             /tech|software|\bai\b|artificial intelligence|semiconductor|cloud|digital|cyber|saas|data center/i,
  "Healthcare":             /health|pharma|biotech|medical|drug|\bfda\b|clinical|hospital|therapeutics|vaccine/i,
  "Financial Services":     /\bbank|finance|financial|credit|insurance|monetary|hedge fund|asset manager|broker/i,
  "Energy":                 /\boil\b|natural gas|energy|crude|opec|pipeline|renewable|solar|wind|\blng\b|refin/i,
  "Industrials":            /manufactur|aerospace|defense|industrial|logistics|transport|freight/i,
  "Consumer Discretionary": /retail|consumer discret|automaker|\bauto\b|luxury|restaurant|hotel|travel|apparel|e-commerce/i,
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

function textOf(cluster: StoryCluster): string {
  const p = cluster.primary;
  return [
    p.title,
    p.summary,
    p.why_it_matters,
    p.impact,
    cluster.theme_label,
    ...(p.affected_entities ?? []),
    ...(cluster.related?.map(r => r.title) ?? []),
  ].join(" ");
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

// ── Override detection ────────────────────────────────────────────────────────

function isBreaking(cluster: StoryCluster): boolean {
  return cluster.primary.signal_strength === "strong" && cluster.primary.signal_score >= 80;
}

function isTrending(cluster: StoryCluster): boolean {
  return (
    cluster.cluster_score >= 0.75 ||
    (cluster.story_count >= 3 && cluster.primary.signal_score >= 65)
  );
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

export function scoreCluster(
  cluster: StoryCluster,
  prefs: UserPrefs,
  debug = false,
): RankedCluster {
  const text  = textOf(cluster);
  const th    = followedThemeScore(text, prefs.followed_themes);
  const s     = sectorScore(text, prefs.followed_sectors);
  const a     = assetScore(text, prefs.followed_asset_classes);
  const r     = regionScore(text, prefs.region_focus);
  const ro    = roleScore(cluster, prefs.user_role);
  const tm    = themeScore(text, prefs.followed_sectors, prefs.followed_asset_classes);

  return {
    ...cluster,
    relevance_score: th.score + s.score + a.score + r + ro + tm,
    _debug: debug ? {
      followedTheme: th.score,
      sector:        s.score,
      asset:         a.score,
      region:        r,
      role:          ro,
      themeDepth:    tm,
      matchedThemes:  th.matched,
      matchedSectors: s.matched,
      matchedAssets:  a.matched,
    } : undefined,
  };
}

export function rankClusters(
  clusters: StoryCluster[],
  prefs: UserPrefs,
): RankedCluster[] {
  if (prefsAreEmpty(prefs)) {
    return clusters.map(c => ({ ...c, relevance_score: 0, _debug: undefined }));
  }

  const isDev  = process.env.NODE_ENV === "development";
  const scored = clusters.map(c => scoreCluster(c, prefs, isDev));

  const breaking: RankedCluster[] = [];
  const trending: RankedCluster[] = [];
  const rest:     RankedCluster[] = [];

  for (const c of scored) {
    if (isBreaking(c))  breaking.push(c);
    else if (isTrending(c)) trending.push(c);
    else rest.push(c);
  }

  const byRelevance = (a: RankedCluster, b: RankedCluster) =>
    b.relevance_score - a.relevance_score ||
    b.primary.signal_score - a.primary.signal_score;

  trending.sort(byRelevance);
  rest.sort(byRelevance);

  const ranked = [...breaking, ...trending, ...rest];

  if (isDev) {
    const origPos = new Map(clusters.map((c, i) => [c.id, i + 1]));
    const moved   = ranked.filter((c, i) => origPos.get(c.id) !== i + 1).length;
    console.group(`[feedRanker] ${moved} of ${ranked.length} clusters reordered by personalization`);
    ranked.slice(0, 20).forEach((c, finalIdx) => {
      const orig   = origPos.get(c.id) ?? "?";
      const delta  = typeof orig === "number" ? orig - (finalIdx + 1) : 0;
      const arrow  = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : "=";
      const themes  = (c._debug?.matchedThemes  as string[] | undefined) ?? [];
      const sectors = (c._debug?.matchedSectors as string[] | undefined) ?? [];
      const assets  = (c._debug?.matchedAssets  as string[] | undefined) ?? [];
      const labels  = [
        ...themes.map(t  => `theme:${t}`),
        ...sectors.map(s => `sector:${s}`),
        ...assets.map(a  => `asset:${a}`),
        ...(c._debug?.region ? [`region(+${c._debug.region})`] : []),
        ...(c._debug?.role   ? [`role(+${c._debug.role})`]     : []),
      ].join(", ") || "no match";
      console.log(
        `%c${String(finalIdx + 1).padStart(2)}. (was #${String(orig).padStart(2)} ${arrow.padEnd(4)}) [rel=${String(c.relevance_score).padStart(3)}] ${c.primary.title.slice(0, 55)}`,
        c.relevance_score > 0 ? "color:#6aad6a" : "color:#888",
        `\n     ${labels}`,
      );
    });
    console.groupEnd();
  }

  return ranked;
}
