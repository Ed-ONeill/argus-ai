import type {
  SectorIntelligence, IndustrySignal, StoryCluster, WhatMattersNowItem,
} from "./types";
import { SECTOR_ENTITIES } from "./sectorIntelligence";

// ── Industry definition ───────────────────────────────────────────────────────

export interface IndustryConfig {
  slug:                    string;
  name:                    string;
  shortName:               string;
  sector:                  string;          // GICS sector for live data lookup
  industrySignalKeywords:  string[];        // Sub-names in IndustrySignal.name
  color:                   string;
  description:             string;
  keyAssets:               string[];        // Primary tickers
  macroDrivers:            string[];
  geopoliticalExposure:    string;
  maTheme:                 string;
}

// ── 12-industry roster ────────────────────────────────────────────────────────

export const INDUSTRIES: IndustryConfig[] = [
  {
    slug:                   "semiconductors",
    name:                   "Semiconductors",
    shortName:              "Semis",
    sector:                 "Technology",
    industrySignalKeywords: ["Semiconductors", "AI Infrastructure", "Chip"],
    color:                  "#2563EB",
    description:            "Chip design, wafer fab, EDA equipment, and advanced packaging",
    keyAssets:              ["NVDA", "AMD", "AVGO", "QCOM", "MU", "ASML", "INTC", "TSM", "ARM", "AMAT", "LRCX", "KLAC", "MRVL", "TXN", "NXPI", "ON", "MCHP", "TER", "ENTG", "SMCI"],
    macroDrivers:           ["AI Capex", "Export Controls", "GPU Supply", "TSMC Yield", "HBM Cycle"],
    geopoliticalExposure:   "Critical — Taiwan fab concentration and China export controls create multi-year supply chain bifurcation risk that is structurally repricing the sector.",
    maTheme:                "Hyperscaler custom silicon programs and ARM licensing expansion are reshaping the competitive landscape as QUALCOMM and Intel navigate potential consolidation.",
  },
  {
    slug:                   "software",
    name:                   "Software",
    shortName:              "SW",
    sector:                 "Technology",
    industrySignalKeywords: ["Cloud Software", "Cybersecurity", "SaaS", "Enterprise Software"],
    color:                  "#7C3AED",
    description:            "Enterprise SaaS, cloud platforms, and cybersecurity",
    keyAssets:              ["MSFT", "CRM", "SNOW", "NOW", "WDAY", "ADBE", "PANW", "ORCL", "DDOG", "ZS", "CRWD", "FTNT", "PLTR", "MDB", "OKTA", "VEEV", "HUBS", "S", "GTLB", "SPLK"],
    macroDrivers:           ["10Y Yield", "Cloud ARR", "AI Integration", "NRR", "Security Spend"],
    geopoliticalExposure:   "Moderate — data sovereignty regulations and government customer exposure create revenue risk in sensitive international deployments.",
    maTheme:                "Consolidation around AI-native platforms is accelerating as legacy vendors acquire generative AI capabilities to defend ARR against displacement.",
  },
  {
    slug:                   "aerospace-defense",
    name:                   "Aerospace & Defense",
    shortName:              "A&D",
    sector:                 "Industrials",
    industrySignalKeywords: ["Defense", "Aerospace", "Aerospace & Defense"],
    color:                  "#059669",
    description:            "Defense prime contractors, aerospace systems, and satellite",
    keyAssets:              ["LMT", "RTX", "NOC", "GD", "BA", "GE", "HII", "KTOS", "TDG", "HEICO", "BWXT", "LDOS", "SAIC", "AXON", "CW", "SPR", "CACI", "DRS", "HXL", "L3H"],
    macroDrivers:           ["NATO Budgets", "Defense Backlog", "NDAA", "Geopolitical Risk", "F-35 Production"],
    geopoliticalExposure:   "Very High — ongoing conflicts and NATO 2% commitment expansion are direct budget drivers; reshoring defense production is a structural multi-year theme.",
    maTheme:                "European defense consolidation and U.S. prime contractor backlog expansion are creating multi-year order book visibility that decouples A&D from the broader industrial cycle.",
  },
  {
    slug:                   "energy",
    name:                   "Energy",
    shortName:              "Enrg",
    sector:                 "Energy",
    industrySignalKeywords: ["Oil & Gas", "LNG", "Upstream", "Refining", "Energy"],
    color:                  "#D97706",
    description:            "Upstream E&P, midstream infrastructure, and LNG exports",
    keyAssets:              ["XOM", "CVX", "COP", "OXY", "SLB", "HAL", "VLO", "LNG", "MPC", "PSX", "DVN", "EOG", "FANG", "WMB", "KMI", "ET", "EPD", "HES", "MRO", "APA"],
    macroDrivers:           ["WTI Price", "OPEC+ Quota", "NG Inventory", "Refinery Cap", "LNG Demand"],
    geopoliticalExposure:   "Very High — OPEC+ supply decisions, pipeline geopolitics, and shipping disruptions create continuous price volatility that impacts the entire sector.",
    maTheme:                "Permian Basin consolidation created megacap dominance; remaining independents face capital return pressure rather than growth expectations from the buy-side.",
  },
  {
    slug:                   "financials",
    name:                   "Financials",
    shortName:              "Fins",
    sector:                 "Financials",
    industrySignalKeywords: ["Banks", "Private Credit", "Investment Banking", "Insurance", "Asset Management"],
    color:                  "#0891B2",
    description:            "Banks, capital markets, insurance, and alternative asset managers",
    keyAssets:              ["JPM", "BAC", "GS", "MS", "BLK", "BX", "KKR", "AXP", "C", "WFC", "SCHW", "V", "MA", "PNC", "COF", "ARES", "APO", "OWL", "CG", "TROW"],
    macroDrivers:           ["Yield Curve", "NIM", "Credit Spreads", "CRE Exposure", "M&A Flow"],
    geopoliticalExposure:   "Moderate — sanctions regimes, sovereign credit exposure, and cross-border capital flow restrictions respond to geopolitical escalation and affect fee income visibility.",
    maTheme:                "Private credit managers are capturing market share from banks retreating under Basel III endgame; direct lending AUM expansion is the dominant structural theme.",
  },
  {
    slug:                   "industrials",
    name:                   "Industrials",
    shortName:              "Indus",
    sector:                 "Industrials",
    industrySignalKeywords: ["Manufacturing", "Freight", "Rail", "Machinery", "Robotics"],
    color:                  "#64748B",
    description:            "Industrial machinery, freight, logistics, and automation",
    keyAssets:              ["HON", "CAT", "DE", "UPS", "FDX", "CSX", "UNP", "ABB", "ITW", "EMR", "ETN", "PH", "ROK", "XYL", "GNRC", "FAST", "GWW", "CARR", "OTIS", "EXPD"],
    macroDrivers:           ["Freight PMI", "Infra Spending", "Capex Cycle", "Backlog Cover", "PMI"],
    geopoliticalExposure:   "Moderate — reshoring and friend-shoring policies are creating domestic demand at the expense of cross-border supply chain efficiency.",
    maTheme:                "Industrial automation and robotics M&A is accelerating as labor cost pressure crosses the deployment ROI threshold across manufacturing verticals.",
  },
  {
    slug:                   "consumer",
    name:                   "Consumer",
    shortName:              "Cons",
    sector:                 "Consumer",
    industrySignalKeywords: ["Retail", "Consumer Discretionary", "Consumer Staples", "E-commerce"],
    color:                  "#DB2777",
    description:            "Retail, consumer brands, e-commerce, and leisure",
    keyAssets:              ["WMT", "AMZN", "COST", "TGT", "MCD", "SBUX", "NKE", "TSLA", "HD", "LOW", "TJX", "LULU", "F", "GM", "RH", "BURL", "FIVE", "DG", "YUM", "CMG"],
    macroDrivers:           ["Real Wages", "CPI Delta", "Credit Utilization", "Savings Rate", "Confidence"],
    geopoliticalExposure:   "Low-moderate — tariff exposure on manufactured goods and currency pass-through from import pricing create margin risk for consumer-facing brands.",
    maTheme:                "Spending bifurcation between value channels and luxury is the dominant theme; discount retail consolidation and premiumization strategies are running in parallel.",
  },
  {
    slug:                   "healthcare",
    name:                   "Healthcare",
    shortName:              "HC",
    sector:                 "Healthcare",
    industrySignalKeywords: ["Pharma", "Biotech", "Medical Devices", "Healthcare Services"],
    color:                  "#059669",
    description:            "Pharmaceuticals, biotech pipelines, and healthcare services",
    keyAssets:              ["JNJ", "LLY", "MRK", "ABBV", "UNH", "PFE", "AMGN", "ISRG", "BMY", "GILD", "REGN", "MRNA", "BIIB", "VRTX", "ELV", "HUM", "CVS", "BSX", "MDT", "GEHC"],
    macroDrivers:           ["FDA Calendar", "GLP-1 Pipeline", "Drug Pricing Policy", "IRA Impact", "Biotech Funding"],
    geopoliticalExposure:   "Moderate — drug pricing negotiations, generics competition from India and China, and WHO policy create regulatory margin risk across global franchises.",
    maTheme:                "GLP-1 platform acquisitions and AI drug discovery investments are reshaping R&D capital allocation as big pharma repositions around obesity and metabolic disease.",
  },
  {
    slug:                   "real-estate",
    name:                   "Real Estate",
    shortName:              "REIT",
    sector:                 "Real Estate",
    industrySignalKeywords: ["REITs", "Data Centers", "Residential", "Commercial Real Estate", "Office"],
    color:                  "#B91C1C",
    description:            "REITs, data center operators, and commercial property",
    keyAssets:              ["AMT", "EQIX", "PLD", "DLR", "SPG", "PSA", "AVB", "VTR", "CCI", "SBAC", "ARE", "EQR", "ESS", "NNN", "O", "VICI", "WPC", "KIM", "STAG", "CBRE"],
    macroDrivers:           ["10Y Yield", "Cap Rates", "CRE Vacancy", "CMBS Spreads", "Data Ctr Demand"],
    geopoliticalExposure:   "Low — primarily domestic exposure with cross-border data center deployment creating limited country-risk in EU regulatory and data residency environments.",
    maTheme:                "Data center REITs are structurally diverging from the broader REIT complex as AI-driven colocation demand creates pricing power absent from office and retail assets.",
  },
  {
    slug:                   "crypto",
    name:                   "Crypto & Digital Assets",
    shortName:              "Crypto",
    sector:                 "Technology",
    industrySignalKeywords: ["Crypto", "Blockchain", "Digital Assets", "DeFi", "Bitcoin"],
    color:                  "#F59E0B",
    description:            "Bitcoin, Ethereum, exchanges, and blockchain infrastructure",
    keyAssets:              ["BTC", "ETH", "COIN", "MSTR", "MARA", "RIOT", "SQ", "PYPL", "HUT", "CLSK", "CORZ", "BTBT", "IREN", "WULF", "BITO", "GBTC", "BNB", "SOL", "AVAX", "DOGE"],
    macroDrivers:           ["BTC ETF Flows", "Fed Policy", "Stablecoin Regulation", "Halving Cycle", "Institutional Adoption"],
    geopoliticalExposure:   "High — fragmented regulatory frameworks across EU (MiCA), U.S. (SEC/CFTC), and emerging market bans create uneven operating environments for exchanges and protocols.",
    maTheme:                "Bitcoin ETF approval drove institutional adoption creating structural demand separated from the retail speculation cycle; exchange consolidation is accelerating.",
  },
  {
    slug:                   "utilities",
    name:                   "Utilities",
    shortName:              "Utils",
    sector:                 "Utilities",
    industrySignalKeywords: ["Nuclear", "Power Generation", "Grid Infrastructure", "Renewables", "Electricity"],
    color:                  "#0D9488",
    description:            "Power generators, grid operators, and nuclear energy",
    keyAssets:              ["NEE", "CEG", "VST", "AEP", "DUK", "SO", "PCG", "EXC", "D", "SRE", "ED", "AWK", "ES", "FE", "WEC", "XEL", "NRG", "AES", "FSLR", "ENPH"],
    macroDrivers:           ["10Y Yield", "Power Load Growth", "Nuclear PPA", "Grid Capex", "AI Power Demand"],
    geopoliticalExposure:   "Low-moderate — uranium supply from Kazakhstan and rare earth dependencies for renewable buildout create limited but structural geopolitical exposure.",
    maTheme:                "Nuclear PPA deals with data centers are creating a new pricing mechanism that decouples merchant generators from regulated utility multiples.",
  },
  {
    slug:                   "media-telecom",
    name:                   "Media & Telecom",
    shortName:              "M&T",
    sector:                 "Communications",
    industrySignalKeywords: ["Media", "Streaming", "Telecom", "Advertising", "Social Media"],
    color:                  "#6D28D9",
    description:            "Digital media, streaming platforms, telecom, and advertising",
    keyAssets:              ["GOOGL", "META", "NFLX", "DIS", "CMCSA", "T", "VZ", "TMUS", "SNAP", "PINS", "WBD", "PARA", "IAC", "TTD", "ROKU", "SPOT", "CHTR", "PUBM", "MGNI", "ZM"],
    macroDrivers:           ["Ad Spend", "ARPU Trend", "Streaming Churn", "5G Capex", "AI Targeting"],
    geopoliticalExposure:   "Moderate — content restrictions, social media regulation (DSA/DMA), and telecom spectrum policy create revenue risk in key European and Asian markets.",
    maTheme:                "Sports rights monetization and streaming consolidation are the primary themes as linear TV cash flow funds digital content investment at declining rates.",
  },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getIndustryBySlug(slug: string): IndustryConfig | undefined {
  return INDUSTRIES.find(i => i.slug === slug);
}

export function getSectorIntelligence(
  industry: IndustryConfig,
  sectors:  SectorIntelligence[],
): SectorIntelligence | null {
  return sectors.find(s => s.name === industry.sector) ?? null;
}

export function getIndustrySignals(
  industry:      IndustryConfig,
  allIndustries: IndustrySignal[],
): IndustrySignal[] {
  const kws = industry.industrySignalKeywords.map(k => k.toLowerCase());
  return allIndustries
    .filter(sig => {
      const name = sig.name.toLowerCase();
      return sig.sector === industry.sector ||
             kws.some(kw => name.includes(kw));
    })
    .sort((a, b) => b.signal_score - a.signal_score);
}

export function getTopTheme(
  industry:      IndustryConfig,
  clusters:      StoryCluster[],
  whatMattersNow: WhatMattersNowItem[],
): string | null {
  // Use the industry's own key assets for precise matching
  const assetSet = new Set(industry.keyAssets.map(a => a.toUpperCase()));

  // First: cluster entity match against industry key assets
  const c = clusters.find(cl =>
    cl.primary.affected_entities.some(e => assetSet.has(e.toUpperCase()))
  );
  if (c) return c.theme_label;

  // Second: WhatMattersNow for the broader GICS sector
  const sectorSet = new Set((SECTOR_ENTITIES[industry.sector] ?? []).map(e => e.toUpperCase()));
  const wmn = whatMattersNow.find(w =>
    w.cluster.primary.affected_entities.some(e => sectorSet.has(e.toUpperCase()))
  );
  if (wmn) return wmn.wmn_label || wmn.cluster.theme_label;

  return null;
}

export function filterIndustryClusters(
  industry: IndustryConfig,
  clusters: StoryCluster[],
  limit     = 12,
): StoryCluster[] {
  const assetSet   = new Set(industry.keyAssets.map(a => a.toUpperCase()));
  const sectorSet  = new Set((SECTOR_ENTITIES[industry.sector] ?? []).map(e => e.toUpperCase()));
  const indLower   = industry.name.toLowerCase();
  const secLower   = industry.sector.toLowerCase();

  return clusters
    .map(cl => {
      let score = 0;
      for (const e of cl.primary.affected_entities) {
        if (assetSet.has(e.toUpperCase()))  { score += 5; break; }
      }
      for (const e of cl.primary.affected_entities) {
        if (sectorSet.has(e.toUpperCase())) { score += 2; break; }
      }
      const titleLower = cl.primary.title.toLowerCase();
      if (titleLower.includes(indLower))       score += 2;
      else if (titleLower.includes(secLower))  score += 1;
      return { cluster: cl, score: score * (1 + cl.cluster_score * 0.1) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ cluster }) => cluster);
}
