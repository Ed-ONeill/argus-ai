/**
 * themeCompany.ts, Company Intelligence Engine
 *
 * Derives company-level exposure scoring, directional classification,
 * thesis rationale, drivers/risks, ranking signals, transmission paths,
 * and per-company watch items from ThemeIntelligence + static ticker metadata.
 *
 * Zero API calls. All outputs are deterministic from a single snapshot.
 */

import type { ThemeIntelligence } from "./types";

// ── Static Ticker Metadata ─────────────────────────────────────────────────────

interface TickerMeta {
  sector:     string;
  descriptor: string;
}

const TICKER_META: Record<string, TickerMeta> = {
  // Power / Grid Infrastructure
  PWR:   { sector: "Industrials",  descriptor: "Grid construction and electrical infrastructure" },
  ETN:   { sector: "Industrials",  descriptor: "Power management systems and grid equipment" },
  VRT:   { sector: "Technology",   descriptor: "Power infrastructure for data centers" },
  CEG:   { sector: "Utilities",    descriptor: "Nuclear and clean energy generation" },
  NRG:   { sector: "Utilities",    descriptor: "Power generation and retail energy supply" },
  AES:   { sector: "Utilities",    descriptor: "Renewable power and energy storage" },
  NEE:   { sector: "Utilities",    descriptor: "Largest US utility and renewable energy leader" },
  SO:    { sector: "Utilities",    descriptor: "Southeast US regulated utility" },
  DUK:   { sector: "Utilities",    descriptor: "Southeast US regulated utility with nuclear" },
  EXC:   { sector: "Utilities",    descriptor: "Nuclear-heavy utility operator" },
  FE:    { sector: "Utilities",    descriptor: "Regulated electric utility in the Midwest" },
  EVRG:  { sector: "Utilities",    descriptor: "Midwest regulated electric utility" },
  // Semiconductors / AI Hardware
  NVDA:  { sector: "Technology",   descriptor: "GPU and AI accelerator market leader" },
  AMD:   { sector: "Technology",   descriptor: "CPU and GPU competitor with AI chip ambitions" },
  TSMC:  { sector: "Technology",   descriptor: "World's leading advanced semiconductor foundry" },
  ASML:  { sector: "Technology",   descriptor: "EUV lithography monopoly enabling sub-3nm chips" },
  AVGO:  { sector: "Technology",   descriptor: "Networking and custom AI chip design" },
  INTC:  { sector: "Technology",   descriptor: "Legacy chipmaker under competitive pressure" },
  QCOM:  { sector: "Technology",   descriptor: "Mobile and edge AI semiconductor" },
  MU:    { sector: "Technology",   descriptor: "Memory and storage chips for AI workloads" },
  AMAT:  { sector: "Technology",   descriptor: "Semiconductor equipment and process technology" },
  KLAC:  { sector: "Technology",   descriptor: "Semiconductor process control equipment" },
  LRCX:  { sector: "Technology",   descriptor: "Etch and deposition semiconductor equipment" },
  ON:    { sector: "Technology",   descriptor: "Power and analog semiconductors for EVs and industry" },
  // Cloud / Hyperscalers
  MSFT:  { sector: "Technology",   descriptor: "Cloud and AI platform via Azure and Copilot" },
  AMZN:  { sector: "Technology",   descriptor: "Cloud market leader via AWS and e-commerce scale" },
  GOOGL: { sector: "Technology",   descriptor: "Search dominance and GCP cloud AI" },
  GOOG:  { sector: "Technology",   descriptor: "Search dominance and GCP cloud AI" },
  META:  { sector: "Technology",   descriptor: "Social media infrastructure and large-scale AI research" },
  AAPL:  { sector: "Technology",   descriptor: "Consumer hardware and services ecosystem" },
  // Alternative Asset Management / Private Credit
  KKR:   { sector: "Financials",   descriptor: "Alternative asset management and private credit" },
  ARES:  { sector: "Financials",   descriptor: "Credit-focused alternative asset manager" },
  BX:    { sector: "Financials",   descriptor: "Private equity, real estate, and credit manager" },
  APO:   { sector: "Financials",   descriptor: "Credit and alternative investment management" },
  BAM:   { sector: "Financials",   descriptor: "Asset management with infrastructure and real estate" },
  CG:    { sector: "Financials",   descriptor: "Global private equity and credit manager" },
  // Banks / Lending
  JPM:   { sector: "Financials",   descriptor: "Largest US bank with investment banking leadership" },
  BAC:   { sector: "Financials",   descriptor: "Consumer and commercial banking at scale" },
  WFC:   { sector: "Financials",   descriptor: "Retail and mortgage banking" },
  GS:    { sector: "Financials",   descriptor: "Investment banking and trading powerhouse" },
  MS:    { sector: "Financials",   descriptor: "Wealth management and investment banking" },
  C:     { sector: "Financials",   descriptor: "Global transaction banking and consumer lending" },
  // REITs
  PLD:   { sector: "Real Estate",  descriptor: "Global industrial logistics REIT" },
  DLR:   { sector: "Real Estate",  descriptor: "Data center and colocation REIT" },
  VNO:   { sector: "Real Estate",  descriptor: "NYC office and mixed-use REIT" },
  SPG:   { sector: "Real Estate",  descriptor: "Premium mall and retail REIT" },
  EQR:   { sector: "Real Estate",  descriptor: "Apartment REIT concentrated in coastal markets" },
  EQIX:  { sector: "Real Estate",  descriptor: "Global data center and interconnection REIT" },
  // Commodities / Mining / Materials
  FCX:   { sector: "Materials",    descriptor: "Copper mining with significant China demand exposure" },
  RIO:   { sector: "Materials",    descriptor: "Diversified mining including iron ore and copper" },
  BHP:   { sector: "Materials",    descriptor: "Diversified mining with energy and steel inputs" },
  VALE:  { sector: "Materials",    descriptor: "Brazilian iron ore and nickel producer" },
  NEM:   { sector: "Materials",    descriptor: "Gold mining with diversified global operations" },
  AA:    { sector: "Materials",    descriptor: "Aluminum producer sensitive to energy costs" },
  CLF:   { sector: "Materials",    descriptor: "Integrated steel producer with auto exposure" },
  MP:    { sector: "Materials",    descriptor: "US rare earth miner and processor" },
  // Energy
  XOM:   { sector: "Energy",       descriptor: "Integrated oil major with Permian scale" },
  CVX:   { sector: "Energy",       descriptor: "Integrated oil major with global downstream" },
  OXY:   { sector: "Energy",       descriptor: "Permian basin oil producer with CCS ambitions" },
  SLB:   { sector: "Energy",       descriptor: "Leading oilfield services and technology" },
  COP:   { sector: "Energy",       descriptor: "Large independent oil and gas E&P" },
  HAL:   { sector: "Energy",       descriptor: "Oilfield services with completion expertise" },
  EOG:   { sector: "Energy",       descriptor: "Premium Permian and Eagle Ford E&P" },
  PSX:   { sector: "Energy",       descriptor: "Downstream refining and midstream" },
  // Healthcare / Pharma / Biotech
  LLY:   { sector: "Healthcare",   descriptor: "GLP-1 drug leader (Mounjaro, Zepbound)" },
  NVO:   { sector: "Healthcare",   descriptor: "GLP-1 originator (Ozempic, Wegovy)" },
  ABBV:  { sector: "Healthcare",   descriptor: "Immunology, aesthetics, and neuroscience drugs" },
  JNJ:   { sector: "Healthcare",   descriptor: "Diversified pharma and medtech" },
  PFE:   { sector: "Healthcare",   descriptor: "Legacy pharma rebuilding its pipeline" },
  MRNA:  { sector: "Healthcare",   descriptor: "mRNA platform with oncology and flu pipeline" },
  REGN:  { sector: "Healthcare",   descriptor: "Biologic drugs with Dupixent franchise" },
  // Industrials / Defense / Infrastructure
  LMT:   { sector: "Industrials",  descriptor: "Defense prime with F-35 and missile systems" },
  RTX:   { sector: "Industrials",  descriptor: "Aerospace, defense, and jet engines" },
  GE:    { sector: "Industrials",  descriptor: "Aerospace power and energy equipment" },
  CAT:   { sector: "Industrials",  descriptor: "Construction and mining equipment leader" },
  DE:    { sector: "Industrials",  descriptor: "Agricultural equipment and precision farming" },
  HON:   { sector: "Industrials",  descriptor: "Industrial automation and aerospace systems" },
  EMR:   { sector: "Industrials",  descriptor: "Industrial automation and HVAC" },
  MMM:   { sector: "Industrials",  descriptor: "Diversified industrial and consumer products" },
  // Consumer
  COST:  { sector: "Consumer",     descriptor: "Warehouse retail with resilient membership model" },
  WMT:   { sector: "Consumer",     descriptor: "Mass market retail with grocery leadership" },
  TGT:   { sector: "Consumer",     descriptor: "Discretionary-heavy retail" },
  HD:    { sector: "Consumer",     descriptor: "Home improvement retail" },
  SBUX:  { sector: "Consumer",     descriptor: "Global coffeehouse chain with loyalty flywheel" },
};

// ── Per-ticker watch items (company-specific, theme-agnostic) ─────────────────

const TICKER_WATCH: Record<string, string[]> = {
  PWR:   ["Utility capex guidance", "Transmission project awards", "Data-center backlog"],
  ETN:   ["Power management order intake", "Grid equipment lead times", "Utility capex cycle"],
  VRT:   ["Data-center buildout pace", "Power density demand trends", "Cooling tech order flow"],
  CEG:   ["Nuclear relicensing progress", "PPA pricing trajectory", "Data-center offtake deals"],
  NRG:   ["Retail power pricing margins", "Capacity market auction results", "Load growth outlook"],
  NVDA:  ["Hyperscaler capex guidance", "GB200 order book", "AI accelerator competition"],
  AMD:   ["MI300X market share vs NVDA", "Server CPU attach rates", "Data-center revenue mix"],
  TSMC:  ["N2 CoWoS capacity ramp", "AI chip order visibility", "US fab cost parity timeline"],
  ASML:  ["EUV tool shipment schedule", "High-NA adoption pace", "China revenue exposure"],
  AVGO:  ["XPU custom chip pipeline", "Networking revenue growth", "VMware integration margin"],
  FCX:   ["China PMI trend", "Copper LME/SHFE inventory", "USD trend vs copper pricing"],
  RIO:   ["Iron ore price trajectory", "Simandou project timeline", "China steel demand"],
  BHP:   ["Copper volume growth", "Potash project progress", "China iron ore demand"],
  NEM:   ["Gold price trajectory", "All-in sustaining cost trend", "Production guidance"],
  KKR:   ["Private credit deployment pace", "Fee-earning AUM growth", "Portfolio NAV trend"],
  ARES:  ["Middle-market credit spreads", "Direct lending pipeline", "CLO issuance activity"],
  BX:    ["Retail investor inflows (BREIT)", "Real estate cap rate trend", "PE exit environment"],
  APO:   ["Retirement services AUM", "Credit origination volume", "Portfolio company health"],
  JPM:   ["NII guidance vs consensus", "Investment banking wallet share", "Credit loss reserves"],
  GS:    ["M&A advisory backlog", "Trading revenue vol", "Asset management AUM growth"],
  PLD:   ["Occupancy and rent spread", "Development yield trajectory", "E-commerce demand signals"],
  DLR:   ["Leasing demand and backlog", "Power availability constraints", "Hyperscaler deal size"],
  XOM:   ["Permian production cadence", "Downstream crack spread", "Guyana ramp timeline"],
  CVX:   ["TCO production timeline", "Permian volumes", "Buyback capacity vs capex"],
  LLY:   ["GLP-1 supply constraint trajectory", "Zepbound market share", "Pipeline readout calendar"],
  NVO:   ["Wegovy supply normalization", "US obesity market penetration", "Pipeline competition"],
  LMT:   ["F-35 delivery cadence", "Missiles backlog growth", "International defense demand"],
};

// ── Sector-based watch defaults ────────────────────────────────────────────────

const SECTOR_WATCH: Record<string, string[]> = {
  "Utilities":    ["Utility capex guidance", "Transmission approval timeline", "Load growth trajectory"],
  "Industrials":  ["Order backlog growth", "Margin expansion trajectory", "Industrial production PMI"],
  "Technology":   ["Capex guidance vs consensus", "Revenue acceleration momentum", "Gross margin trend"],
  "Financials":   ["Net interest margin / fee income", "AUM and credit growth", "Credit quality metrics"],
  "Materials":    ["Commodity price trajectory", "Volume growth guidance", "Input cost trends"],
  "Energy":       ["Production guidance", "Realized price margins", "Reserve replacement ratio"],
  "Healthcare":   ["Key pipeline milestones", "Pricing environment", "Reimbursement decisions"],
  "Real Estate":  ["Net operating income", "Cap rate compression", "Refinancing wall exposure"],
  "Consumer":     ["Same-store sales trend", "Inventory normalization", "Consumer confidence"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMeta(ticker: string): TickerMeta | null {
  return TICKER_META[ticker.toUpperCase()] ?? null;
}

function parseCausalChain(narrative: string): string[] {
  return narrative
    .split(/→|->|;|\.|,/)
    .map(s => s.trim())
    .filter(s => s.length > 4)
    .slice(0, 4);
}

function getTickerDirection(
  meta:  TickerMeta | null,
  theme: ThemeIntelligence,
): "beneficiary" | "headwind" | "neutral" {
  const weights = theme.relationship_weights ?? {};
  const sector  = (meta?.sector ?? "").toLowerCase();

  // Match by sector keyword against relationship_weights keys
  for (const [industry, rel] of Object.entries(weights)) {
    const indLow = industry.toLowerCase();
    const secKey = sector.split(" ")[0];
    if (indLow.includes(secKey) || sector.includes(indLow.split(" ")[0])) {
      if (rel.direction === "positive") return "beneficiary";
      if (rel.direction === "negative") return "headwind";
    }
  }

  const dir = theme.momentum_direction;
  if (dir === "bullish")  return "beneficiary";
  if (dir === "bearish")  return "headwind";
  return "neutral";
}

function computeExposureScore(
  index:     number,
  meta:      TickerMeta | null,
  theme:     ThemeIntelligence,
  direction: "beneficiary" | "headwind" | "neutral",
): number {
  const signalMult =
    theme.signal_strength === "strong" ? 1.00 :
    theme.signal_strength === "medium" ? 0.78 : 0.54;
  const breadthMult = 0.80 + (theme.breadth_score ?? 50) / 500;  // 0.80–1.00
  const positionBase = Math.max(42, 96 - index * 7);

  const indBonus =
    meta && (theme.related_industries ?? []).some(ind => {
      const indL = ind.toLowerCase();
      const secL = (meta.sector ?? "").toLowerCase();
      return indL.includes(secL.split(" ")[0]) || secL.includes(indL.split(" ")[0]);
    }) ? 8 : 0;

  const dirPenalty = direction === "neutral" ? -8 : 0;

  return Math.round(Math.max(22, Math.min(98,
    positionBase * signalMult * breadthMult + indBonus + dirPenalty,
  )));
}

function buildRationale(
  meta:      TickerMeta | null,
  theme:     ThemeIntelligence,
  direction: "beneficiary" | "headwind" | "neutral",
): string {
  const descriptor = meta?.descriptor ?? "Operations";
  const chain      = parseCausalChain(theme.causal_narrative ?? "");
  const ind0       = (theme.related_industries ?? [])[0] ?? "primary sector";
  const macro0     = (theme.related_macro_factors ?? [])[0] ?? "macro conditions";
  const momentum   = theme.momentum_label;
  const delta      = theme.momentum_delta ?? 0;

  const mechanism = chain[1] ?? chain[0] ?? null;

  const verb =
    direction === "beneficiary"
      ? momentum === "accelerating" ? "accelerates exposure to"
      : momentum === "strengthening" ? "deepens alignment with"
      : "benefits from"
    : direction === "headwind"
      ? momentum === "reversing" ? "faces material pressure from"
      : "is pressured by"
    : "maintains exposure to";

  let core: string;
  if (mechanism && mechanism.length < 52) {
    core = `${descriptor} ${verb} ${mechanism.toLowerCase()}`;
  } else {
    core = `${descriptor} ${verb} ${ind0.toLowerCase()} dynamics`;
  }

  if (macro0 && macro0.length < 44) {
    core += `, supported by ${macro0.toLowerCase()}`;
  }

  if (direction === "beneficiary" && delta > 8) {
    core += ", signal accelerating";
  } else if (direction === "headwind" && delta < -5) {
    core += ", signal deteriorating";
  }

  return (core.charAt(0).toUpperCase() + core.slice(1)).replace(/\s{2,}/g, " ") + ".";
}

function buildDrivers(meta: TickerMeta | null, theme: ThemeIntelligence): string[] {
  const chain  = parseCausalChain(theme.causal_narrative ?? "");
  const inds   = theme.related_industries ?? [];
  const macros = theme.related_macro_factors ?? [];
  const drivers: string[] = [];

  if (chain[0] && chain[0].length < 48) drivers.push(chain[0]);
  if (inds[0])   drivers.push(`${inds[0]} exposure`);
  if (macros[0] && macros[0].length < 40) drivers.push(macros[0]);
  if (inds[1] && drivers.length < 3)  drivers.push(`${inds[1]} alignment`);

  return [...new Set(drivers)].slice(0, 3);
}

function buildRisks(meta: TickerMeta | null, theme: ThemeIntelligence): string[] {
  const text = [
    ...(theme.related_macro_factors ?? []),
    theme.causal_narrative ?? "",
    theme.description ?? "",
  ].join(" ").toLowerCase();

  const risks: string[] = [];

  if (/rate|yield|fed|fomc/.test(text))          risks.push("Rate path reversal");
  if (/china|pboc|pmi/.test(text))               risks.push("China PMI rollover");
  if (/dollar|usd|dxy/.test(text))               risks.push("USD strength");
  if (/supply|inventory|glut/.test(text))        risks.push("Supply / inventory overhang");
  if (/competitor|competition|disrupt/.test(text)) risks.push("Competitive disruption");
  if (/credit|spread|default/.test(text))        risks.push("Credit spread widening");
  if (/inflation|cpi|pce/.test(text))            risks.push("Inflation re-acceleration");

  const effects = (theme.second_order_effects ?? []).slice(0, 1);
  if (effects[0] && effects[0].length < 44 && risks.length < 2) {
    risks.push(effects[0]);
  }

  return risks.slice(0, 3);
}

function buildWatchItems(ticker: string, meta: TickerMeta | null, theme: ThemeIntelligence): string[] {
  const specific = TICKER_WATCH[ticker.toUpperCase()];
  if (specific) return specific;

  const sector = meta?.sector ?? "";
  const sectorItems = SECTOR_WATCH[sector] ?? ["Earnings guidance", "Market share trends", "Macro sensitivity"];
  const macros = theme.related_macro_factors ?? [];
  const themeItems: string[] = [];
  if (macros[0] && macros[0].length < 44) themeItems.push(macros[0]);

  return [...new Set([...sectorItems, ...themeItems])].slice(0, 3);
}

function computeRankingChange(
  index:     number,
  meta:      TickerMeta | null,
  theme:     ThemeIntelligence,
  direction: "beneficiary" | "headwind" | "neutral",
): { change: number; reason: string } {
  const delta    = theme.momentum_delta    ?? 0;
  const momentum = theme.momentum_label;
  const breadth  = theme.breadth_score    ?? 50;
  const inds     = theme.related_industries ?? [];
  const ind0     = inds[0] ?? "primary sector";
  const sector   = meta?.sector ?? "";

  // Earlier positions in the asset list are more anchored, less volatile
  const posWeight = Math.max(0, 3 - index);
  const magnitude = Math.min(posWeight, Math.round(Math.abs(delta) / 5));

  let change: number;
  if (direction === "beneficiary") {
    change = delta > 0 ? magnitude : delta < 0 ? -Math.min(magnitude, 2) : 0;
  } else if (direction === "headwind") {
    change = delta < 0 ? magnitude : delta > 0 ? -Math.min(magnitude, 2) : 0;
  } else {
    change = 0;
  }
  change = Math.max(-4, Math.min(4, change));

  let reason: string;
  const momentumAdj = momentum === "accelerating" ? " as signal accelerated" :
                      momentum === "strengthening" ? " as signal strengthened" :
                      momentum === "reversing"     ? " as signal reversed"    : "";
  if (change > 0) {
    const breadthNote = breadth >= 60 ? ` and breadth expanded into ${ind0}` : "";
    reason = `${sector || "Sector"} exposure deepened${momentumAdj}${breadthNote}`;
  } else if (change < 0) {
    reason = `Relative positioning softened${momentumAdj}, signal flow shifted`;
  } else {
    reason = `Position held, aligned with current ${ind0} dynamics`;
  }

  return { change, reason };
}

// ── Exported Types ─────────────────────────────────────────────────────────────

export interface CompanyExposure {
  ticker:      string;
  sector:      string;
  descriptor:  string;
  score:       number;         // 0–100
  direction:   "beneficiary" | "headwind" | "neutral";
  rationale:   string;
  drivers:     string[];
  risks:       string[];
  watchItems:  string[];
  rankChange:  number;         // -4 to +4
  rankReason:  string;
  sensitivity: "High" | "Medium" | "Low";
}

export interface TransmissionPath {
  industry: string;
  ticker:   string;
}

// ── computeCompanyExposures ────────────────────────────────────────────────────

export function computeCompanyExposures(theme: ThemeIntelligence): CompanyExposure[] {
  const assets = (theme.related_assets ?? []).slice(0, 8);

  return assets.map((ticker, index) => {
    const meta      = getMeta(ticker);
    const direction = getTickerDirection(meta, theme);
    const score     = computeExposureScore(index, meta, theme, direction);
    const sensitivity: CompanyExposure["sensitivity"] =
      score >= 72 ? "High" : score >= 50 ? "Medium" : "Low";

    const ranking = computeRankingChange(index, meta, theme, direction);
    return {
      ticker,
      sector:     meta?.sector     ?? "Unknown",
      descriptor: meta?.descriptor ?? ticker,
      score,
      direction,
      rationale:  buildRationale(meta, theme, direction),
      drivers:    buildDrivers(meta, theme),
      risks:      buildRisks(meta, theme),
      watchItems: buildWatchItems(ticker, meta, theme),
      sensitivity,
      rankChange: ranking.change,
      rankReason: ranking.reason,
    };
  }).sort((a, b) => {
    // Beneficiaries first, then neutrals, then headwinds; within each group by score
    const dirRank = { beneficiary: 0, neutral: 1, headwind: 2 };
    const dRank = dirRank[a.direction] - dirRank[b.direction];
    return dRank !== 0 ? dRank : b.score - a.score;
  });
}

// ── computeTransmissionPaths ───────────────────────────────────────────────────

export function computeTransmissionPaths(
  theme:     ThemeIntelligence,
  exposures: CompanyExposure[],
): TransmissionPath[] {
  const inds = (theme.related_industries ?? []).slice(0, 3);

  return inds.map((industry, i) => {
    const indWords = industry.toLowerCase().split(/\s+/);
    const matched  = exposures.find(e => {
      const secWords = e.sector.toLowerCase().split(/\s+/);
      return secWords.some(sw => indWords.some(iw => sw.includes(iw) || iw.includes(sw)));
    });
    const ticker = matched?.ticker ?? exposures[Math.min(i, exposures.length - 1)]?.ticker ?? "-";
    return { industry, ticker };
  });
}
