import type { StoryCluster } from "./types";

export interface UserPrefs {
  followed_sectors:       string[];
  followed_asset_classes: string[];
  user_role:              string;
  region_focus:           string;
}

export interface RankedCluster extends StoryCluster {
  relevance_score: number;
  _debug:          Record<string, number> | undefined;
}

// ── Keyword maps ──────────────────────────────────────────────────────────────

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

function sectorScore(text: string, sectors: string[]): number {
  if (!sectors.length) return 0;
  let score = 0;
  for (const sector of sectors) {
    const rx = SECTOR_KEYWORDS[sector];
    if (rx?.test(text)) score += 30;
  }
  return Math.min(score, 60);
}

function assetScore(text: string, assets: string[]): number {
  if (!assets.length) return 0;
  let score = 0;
  for (const asset of assets) {
    const rx = ASSET_KEYWORDS[asset];
    if (rx?.test(text)) score += 20;
  }
  return Math.min(score, 40);
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
    prefs.followed_sectors.length === 0 &&
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
  const text = textOf(cluster);
  const s    = sectorScore(text, prefs.followed_sectors);
  const a    = assetScore(text, prefs.followed_asset_classes);
  const r    = regionScore(text, prefs.region_focus);
  const ro   = roleScore(cluster, prefs.user_role);
  const t    = themeScore(text, prefs.followed_sectors, prefs.followed_asset_classes);

  return {
    ...cluster,
    relevance_score: s + a + r + ro + t,
    _debug: debug ? { sector: s, asset: a, region: r, role: ro, theme: t } : undefined,
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
    console.group("[feedRanker]");
    ranked.slice(0, 8).forEach((c, i) =>
      console.log(`${i + 1}. [rel=${c.relevance_score}] ${c.primary.title.slice(0, 60)}`, c._debug),
    );
    console.groupEnd();
  }

  return ranked;
}
