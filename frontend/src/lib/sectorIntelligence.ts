/**
 * sectorIntelligence.ts - Industries' TAXONOMY and content-matching layer
 * (rewritten in Phase 2.5 Industries unification; was 1,153 lines of editorial
 * sector intelligence).
 *
 * DELETED (D2, 2026-07-10): generateThesis, getCrossAssetEffects,
 * getRiskFactors, getKeyDrivers + THEMATIC_DRIVERS, getPositioningNarrative,
 * getLeadershipDynamics, and the INDUSTRY_DEVELOPMENTS / LEADERSHIP /
 * POSITIONING editorial dictionaries (~900 lines of hardcoded sector prose
 * wearing intelligence authority). Sector meaning now comes from the shared
 * engines via lib/industriesIntel (profiles, riskRead, ledger, narratives).
 *
 * WHAT REMAINS is classification 1/2 only:
 *  - SECTOR_ENTITIES / SECTOR_KEYWORDS: ticker-to-sector membership and
 *    keyword TAXONOMY, used exclusively for content FILTERING and matching
 *    (filterSectorClusters, industryConfig cluster filters). They are alias
 *    data - they never render as winners, losers, risk, or thesis.
 *  - filterSectorClusters: deterministic content selection.
 *  - getMomentumState: a CURRENT-STATE badge classification over real signal
 *    fields (single snapshot; never historical evolution).
 *  - getLiveDevelopments: cluster-derived lines ONLY (real feed content with
 *    its own provenance; the editorial structural/regime fill is gone).
 */

import type { SectorIntelligence, IndustrySignal, StoryCluster } from "./types";

// ── Entity and keyword maps ───────────────────────────────────────────────────

export const SECTOR_ENTITIES: Record<string, string[]> = {
  "Technology":     [
    "AAPL","MSFT","GOOGL","GOOG","META","NVDA","AMD","INTC","TSM","AMZN",
    "CRM","SNOW","NOW","WDAY","ASML","AVGO","QCOM","MU","ARM","AMAT",
    "LRCX","KLAC","MRVL","TXN","NXPI","ON","MCHP","SMCI","ADBE","PANW",
    "ORCL","DDOG","ZS","CRWD","FTNT","PLTR","MDB","OKTA","VEEV","HUBS",
    "ENTG","TER","GTLB","SPLK","SNPS","CDNS","ANSS","KEYS","KLAC","IPGP",
  ],
  "Financials":     [
    "JPM","BAC","GS","MS","C","WFC","BLK","BX","KKR","AXP",
    "V","MA","PYPL","SCHW","ARES","APO","OWL","PNC","COF","TROW",
    "CG","CB","AIG","MET","PRU","AFL","ALL","TRV","BRK","USB",
    "FITB","HBAN","KEY","RF","CFG","MTB","SIVB","ZION","CMA","SNV",
  ],
  "Energy":         [
    "XOM","CVX","BP","SHEL","COP","SLB","HAL","OXY","VLO","MPC",
    "LNG","CQP","PSX","DVN","EOG","FANG","WMB","KMI","ET","EPD",
    "HES","MRO","APA","PXD","AR","EQT","RRC","CNX","CHK","BKR",
  ],
  "Industrials":    [
    "GE","RTX","HON","CAT","DE","LMT","NOC","BA","GD","UPS",
    "FDX","CSX","UNP","ABB","HII","KTOS","ITW","EMR","ETN","PH",
    "ROK","XYL","GNRC","FAST","GWW","CARR","OTIS","EXPD","TDG","HEICO",
    "BWXT","LDOS","SAIC","AXON","CW","CACI","L3H","DRS","SPR","HXL",
  ],
  "Healthcare":     [
    "JNJ","PFE","MRK","LLY","ABBV","BMY","UNH","CVS","CI","AMGN",
    "GILD","REGN","MRNA","ISRG","BIIB","VRTX","ELV","HUM","BSX","MDT",
    "GEHC","ZTS","DGX","IQV","MCK","ABC","CAH","HSIC","PODD","DXCM",
    "INCY","ALNY","SRPT","BLUE","EDIT","NTLA","RXRX","CRSP","BEAM","SGMO",
  ],
  "Consumer":       [
    "WMT","TGT","COST","HD","LOW","MCD","SBUX","NKE","PG","KO",
    "PEP","PM","MO","TSLA","AMZN","LULU","GM","F","YUM","CMG",
    "DG","BURL","FIVE","TJX","RH","CHWY","ETSY","W","PTON","DPZ",
    "QSR","EAT","DENN","JACK","RRGB","PLAY","SFM","WW","BYND","REAL",
  ],
  "Utilities":      [
    "NEE","DUK","SO","D","AEP","EXC","SRE","PCG","ED","CEG",
    "VST","AWK","ES","FE","WEC","XEL","NRG","AES","FSLR","ENPH",
    "PPL","CNP","EIX","NI","PNW","EVRG","ATO","ONE","OGE","LNT",
  ],
  "Materials":      [
    "FCX","NEM","APD","LIN","NUE","X","CLF","AA","ALB","CCJ",
    "DD","CF","MOS","ECL","PPG","SHW","RPM","EMN","HUN","OLN",
    "MP","LAC","LTHM","SQM","LIT","COPX","PICK","REMX","URA","DNN",
  ],
  "Real Estate":    [
    "AMT","PLD","EQIX","SPG","PSA","AVB","EQR","VTR","ARE","DLR",
    "CCI","SBAC","ESS","NNN","O","VICI","KIM","CBRE","STAG","WPC",
    "HST","INVH","UDR","CPT","IRM","COLD","NSA","EXR","CUBE","LSI",
  ],
  "Communications": [
    "GOOGL","META","NFLX","DIS","CMCSA","CHTR","T","VZ","TMUS","SNAP",
    "PINS","WBD","PARA","TTD","ROKU","SPOT","ZM","MGNI","PUBM","IAC",
    "LYV","WYNN","DKNG","PENN","MGM","CZR","MTCH","BMBL","SIRI","LSXMA",
  ],
  "Crypto":         [
    "COIN","MSTR","MARA","RIOT","SQ","PYPL","HUT","CLSK","CORZ","BTBT",
    "IREN","WULF","GBTC","BITO","ETHE","ARKB","FBTC","BITB","HODL","EZBC",
  ],
};

const SECTOR_KEYWORDS: Record<string, string[]> = {
  "Technology":     ["tech","ai","chip","semiconductor","software","cloud","nvidia","microsoft","google","apple"],
  "Financials":     ["bank","fed","rate","yield","credit","treasury","financial","jpmorgan","goldman","blackstone"],
  "Energy":         ["oil","opec","crude","brent","wti","energy","lng","petroleum","natural gas"],
  "Industrials":    ["defense","aerospace","freight","railroad","manufacturing","lockheed","boeing","caterpillar"],
  "Healthcare":     ["pharma","drug","fda","biotech","healthcare","pfizer","lilly","abbvie","clinical trial"],
  "Consumer":       ["consumer","retail","spending","walmart","amazon","mcdonald","inflation","cpi"],
  "Utilities":      ["utility","nuclear","power","grid","electricity","solar","wind","ferc"],
  "Materials":      ["gold","copper","mining","metal","steel","lithium","commodity","uranium","freeport"],
  "Real Estate":    ["reit","property","real estate","housing","mortgage","office vacancy","data center reit"],
  "Communications": ["media","streaming","telecom","social","advertising","netflix","disney","comcast"],
};

// ── Cluster filtering (taxonomy-driven content selection) ─────────────────────
// ── Cluster filtering ─────────────────────────────────────────────────────────

export function filterSectorClusters(
  clusters:   StoryCluster[],
  sectorName: string,
  limit       = 4,
): StoryCluster[] {
  const entitySet = new Set((SECTOR_ENTITIES[sectorName] ?? []).map(e => e.toUpperCase()));
  const keywords  = SECTOR_KEYWORDS[sectorName] ?? [];

  return clusters
    .map(cluster => {
      let score = 0;
      const item  = cluster.primary;
      const label = (cluster.theme_label ?? "").toLowerCase();

      for (const entity of item.affected_entities) {
        if (entitySet.has(entity.toUpperCase())) { score += 3; break; }
      }
      for (const kw of keywords) {
        if (label.includes(kw)) { score += 1; break; }
      }

      return { cluster, score: score * (1 + cluster.cluster_score * 0.1) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ cluster }) => cluster);
}

// ── Types (rendered by the Industries page components) ───────────────────────

export interface LiveDevelopment {
  text: string;
  type: "live" | "macro" | "structural" | "risk";
}

/** Leaders/laggards now come from SHARED graph exposure (profile
    beneficiaries / weakening edges) - the page constructs this shape from
    lib/industriesIntel reads; nothing editorial fills it. */
export interface LeadershipDynamics {
  leaders:     string[];
  laggards:    string[];
  improving:   string[];
  state:       "accelerating" | "broadening" | "stabilizing" | "rotating" | "narrowing" | "consolidating";
  explanation: string;
}

export type MomentumState =
  | "accelerating" | "broadening" | "stabilizing"
  | "fading"       | "reversing"  | "consolidating";

// ── Momentum state ────────────────────────────────────────────────────────────
// CURRENT-STATE classification over real signal fields (single snapshot).
// Rendered as a labeled badge only - never as historical evolution
// (ownership registry: "evolution").

export function getMomentumState(
  sectorIntel: SectorIntelligence | null,
  indSignals:  IndustrySignal[],
): MomentumState {
  if (!sectorIntel) return "consolidating";
  const score   = sectorIntel.signal_score;
  const align   = sectorIntel.regime_alignment;
  const active  = indSignals.filter(s => s.signal_score > 20).length;
  const bearish = sectorIntel.impact_sentiment === "bearish";
  if (align === "headwind" && score < 25) return "reversing";
  if (align === "headwind")               return "fading";
  if (bearish && align !== "tailwind")    return "fading";
  if (align === "tailwind" && score >= 70 && active >= 3) return "accelerating";
  if (align === "tailwind" && active >= 2)                return "broadening";
  if (align === "tailwind" && score >= 40)                return "stabilizing";
  return "consolidating";
}

// ── Live developments: cluster-derived ONLY ──────────────────────────────────
// Each line is real feed content (why_it_matters or theme label + entities +
// source count). The editorial structural/regime dictionaries are deleted;
// when the feed is quiet, the section is short - honestly.

function clusterToDevelopment(cluster: StoryCluster): LiveDevelopment | null {
  const why = cluster.primary.why_it_matters;
  if (why && why.length > 25) return { text: why, type: "live" };

  const label = cluster.theme_label;
  if (!label) return null;

  const entities = cluster.primary.affected_entities.slice(0, 2);
  const entityPart = entities.length > 0 ? `, ${entities.join(", ")}` : "";
  const countPart  = cluster.story_count > 1 ? ` (${cluster.story_count} sources)` : "";
  return { text: `${label}${entityPart}${countPart}`, type: "live" };
}

export function getLiveDevelopments(clusters: StoryCluster[], max = 6): LiveDevelopment[] {
  const results: LiveDevelopment[] = [];
  for (const cl of clusters) {
    if (results.length >= max) break;
    const dev = clusterToDevelopment(cl);
    if (dev) results.push(dev);
  }
  return results;
}
