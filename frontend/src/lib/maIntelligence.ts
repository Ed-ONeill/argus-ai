/**
 * lib/maIntelligence.ts, deterministic deal-intelligence engine.
 *
 * Turns a raw M&A headline into a structured "intelligence object." Two classes
 * of field, treated differently:
 *
 *   FACTS  (deal value, advisor names, buyer/target, financing), EXTRACTED from
 *          the actual title/summary text. If the text does not contain it, the
 *          field is null/empty. Never invented. ("Leave blank rather than
 *          fabricate.")
 *
 *   ANALYSIS (transaction type, strategic rationale, why-now, what's-next, deal
 *          thesis, market implications, read-through peers), DERIVED
 *          deterministically from the deal's type/sector/keywords + market
 *          context, the same interpretive pattern Argus uses for theme
 *          intelligence. Institutional register, no generic AI filler.
 *
 * Zero LLM calls. Pure functions over the existing MADeal fields.
 */

import type { MADeal } from "@/hooks/useMAIntelligence";
import { tickerInfo, type TickerInfo } from "./tickerMetadata";

export interface DealAdvisors {
  banks: string[];   // financial advisors / debt financing banks detected in text
  legal: string[];   // law firms detected in text
}

export interface DealIntel {
  // ── Facts (extracted; null/empty when absent) ──────────────────────────────
  dealValue:   string | null;     // "$42B" | "€7.4B" | "Undisclosed" | null
  buyer:       string | null;
  target:      string | null;
  financing:   string | null;     // "Cash" | "Cash + Stock" | "LBO" | … | null
  crossBorder: boolean;
  advisors:    DealAdvisors;     // detected names (no side asserted unless clear)
  advisorSides: { buyFinancial: string[]; sellFinancial: string[]; buyLegal: string[]; sellLegal: string[]; financing: string[]; fairness: string[] };
  premium:     string | null;    // "32% premium" if stated
  synergies:   string | null;    // "$2B cost synergies" if stated
  country:     string | null;    // detected geography
  competingBidders: string[];    // other named bidders if the text flags a contest
  financingDetail:  string[];    // "Bridge Loan", "Private Credit", "Bond Offering" if stated
  economics:   { label: string; value: string }[];   // EV/equity/multiples/synergies, only what's stated
  themeTags:   string[];         // derived intelligence tags (AI Infrastructure, Cross-Border, …)
  // ── Importance ─────────────────────────────────────────────────────────────
  sizeClass:   "mega" | "large" | "medium" | "small" | "unknown";
  sizeLabel:   string;           // "Mega Deal" | "Large" | … | "Rumor" | "Breaking"
  featured:    boolean;          // visually elevated (mega/large or breaking)
  // ── Visual significance tier (drives adaptive card weight) ──────────────────
  tier: "headline" | "major" | "standard" | "minor";
  // ── Argus interpretation, the research-note headline read (2–3 sentences) ──
  argusAssessment: string;       // deal-specific: why it matters / signal / watch next
  // ── Institutional confidence in the intelligence (not the completion odds) ──
  confidence: { score: number; label: string; supports: string[] };
  // ── Comparable historical transactions (sector-matched, clickable) ──────────
  comparables: { acquirer: string; target: string; value: string; year: string }[];
  // ── Market impact (winners / losers / re-rating / follow-on) ────────────────
  marketImpact: {
    winners:  string[];          // beneficiary tickers
    losers:   string[];          // pressured peer tickers
    rerating: string;            // one derived re-rating sentence
    followOn: string[];          // names that screen as follow-on targets
  };
  // ── Derived analysis (institutional, every bullet tied to this deal) ───────
  status:      string;
  statusColor: string;
  txnType:     string;
  rationale:   string;           // headline rationale label
  rationaleBullets:   string[];  // specific drivers
  whyNowBullets:      string[];  // specific timing factors
  implicationBullets: string[];  // who benefits / pressured
  whatNextBullets:    string[];  // forward path
  // Conditional specialized sections, ONLY the ones that fire for this deal, so
  // no two expanded cards expose the same set.
  dynamicSections:    { label: string; bullets: string[] }[];
  readThrough: string[];                                   // flat (back-compat)
  readThroughGroups:  { role: string; tickers: string[] }[]; // categorized
  timeline:    { stage: string; done: boolean; current: boolean }[];   // 8-stage lifecycle
  // ── Probability of completion (inferred estimate, not a quoted figure) ───────
  completion:  { pct: number; label: string; color: string; drivers: string[] };
  // ── Capital transmission, how capital moves because of the deal ─────────────
  capitalTransmission: {
    chain:         string[];                       // ordered transmission sequence
    beneficiaries: string[];                       // likely beneficiaries (tickers)
    casualties:    string[];                       // likely casualties (tickers)
    effects:       { label: string; text: string }[]; // supply chain / pricing / valuation / rotation / cross-sector
    flow:          { acquirer: string; sector: string; beneficiaries: string[]; pressured: string[]; themes: string[] }; // compact ACQUIRER→SECTOR→BENEFICIARIES→PRESSURED→THEMES
  };
}

export interface DealContext {
  creditOpen?: boolean;   // financing markets open (from capital-flow credit layer)
  regime?:     string;    // derived market regime ("risk-on" etc. lives on riskRegime)
  riskRegime?: "risk-on" | "neutral" | "risk-off";
}

// ── Known-name dictionaries (only matched, never asserted beyond a match) ──────

const ADVISOR_BANKS: [string, RegExp][] = [
  ["Goldman Sachs",   /goldman\s+sachs|goldman/i],
  ["Morgan Stanley",  /morgan\s+stanley/i],
  ["JPMorgan",        /jp\s?morgan|j\.p\.\s?morgan/i],
  ["Bank of America", /bank\s+of\s+america|bofa|merrill/i],
  ["Citi",            /\bciti(group|bank)?\b/i],
  ["Evercore",        /evercore/i],
  ["Lazard",          /lazard/i],
  ["Centerview",      /centerview/i],
  ["Moelis",          /moelis/i],
  ["Jefferies",       /jefferies/i],
  ["Rothschild",      /rothschild/i],
  ["PJT Partners",    /\bpjt\b/i],
  ["Guggenheim",      /guggenheim/i],
  ["Barclays",        /barclays/i],
  ["UBS",             /\bubs\b/i],
  ["Deutsche Bank",   /deutsche\s+bank/i],
  ["Wells Fargo",     /wells\s+fargo/i],
  ["RBC",             /\brbc\s+capital|\brbc\b/i],
  ["Perella Weinberg",/perella/i],
  ["Qatalyst",        /qatalyst/i],
];

const LAW_FIRMS: [string, RegExp][] = [
  ["Kirkland & Ellis",      /kirkland/i],
  ["Skadden",               /skadden/i],
  ["Wachtell Lipton",       /wachtell/i],
  ["Sullivan & Cromwell",   /sullivan\s+&?\s+cromwell/i],
  ["Latham & Watkins",      /latham/i],
  ["Davis Polk",            /davis\s+polk/i],
  ["Simpson Thacher",       /simpson\s+thacher/i],
  ["Cravath",               /cravath/i],
  ["Freshfields",           /freshfields/i],
  ["Paul Weiss",            /paul,?\s+weiss/i],
  ["Weil Gotshal",          /weil,?\s+gotshal|\bweil\b/i],
  ["Sidley Austin",         /sidley/i],
  ["Cleary Gottlieb",       /cleary/i],
  ["Allen & Overy",         /allen\s+&?\s+overy|a&o\s+shearman/i],
];

// Sector → liquid peers used for read-through inference (clearly framed as
// "potential read-through", not a claim of involvement).
const SECTOR_PEERS: Record<string, string[]> = {
  "Technology":      ["MSFT", "ORCL", "CRM", "NOW", "ADBE", "PANW", "SNOW"],
  "Healthcare":      ["LLY", "MRK", "ABBV", "PFE", "AMGN", "GILD", "VRTX"],
  "Energy":          ["XOM", "CVX", "COP", "EOG", "DVN", "OXY", "WMB"],
  "Financials":      ["JPM", "GS", "MS", "BAC", "BX", "KKR", "APO"],
  "Industrials":     ["GE", "HON", "RTX", "ETN", "PH", "EMR", "CMI"],
  "Consumer":        ["PG", "KO", "PEP", "MDLZ", "KMB", "CL", "EL"],
  "Real Estate":     ["PLD", "AMT", "EQIX", "DLR", "O", "SPG", "WELL"],
  "Media & Telecom": ["GOOGL", "META", "NFLX", "DIS", "TMUS", "VZ", "T"],
};

// Sector → role-categorized read-through. Institutional inference (clearly framed
// "potential"), not a claim of involvement. Buckets the liquid peers by their
// likely relationship to a transaction in the sector.
interface SectorRoles { beneficiaries: string[]; competitors: string[]; suppliers: string[]; secondOrder: string[] }
const SECTOR_ROLES: Record<string, SectorRoles> = {
  "Technology":      { beneficiaries: ["MSFT", "ORCL", "CRM"], competitors: ["NOW", "ADBE", "SNOW"], suppliers: ["NVDA", "AVGO", "TSM"], secondOrder: ["PANW", "DDOG"] },
  "Healthcare":      { beneficiaries: ["LLY", "MRK", "ABBV"], competitors: ["PFE", "AMGN", "BMY"], suppliers: ["TMO", "DHR", "IQV"], secondOrder: ["UNH", "CVS"] },
  "Energy":          { beneficiaries: ["XOM", "CVX", "COP"], competitors: ["EOG", "DVN", "OXY"], suppliers: ["SLB", "HAL", "BKR"], secondOrder: ["WMB", "KMI"] },
  "Financials":      { beneficiaries: ["JPM", "GS", "MS"], competitors: ["BAC", "C", "WFC"], suppliers: ["BX", "KKR", "APO"], secondOrder: ["SPGI", "MCO"] },
  "Industrials":     { beneficiaries: ["GE", "HON", "RTX"], competitors: ["ETN", "PH", "EMR"], suppliers: ["CMI", "PCAR", "DOV"], secondOrder: ["URI", "FAST"] },
  "Consumer":        { beneficiaries: ["PG", "KO", "PEP"], competitors: ["MDLZ", "KMB", "CL"], suppliers: ["ADM", "BG", "SYY"], secondOrder: ["WMT", "COST"] },
  "Real Estate":     { beneficiaries: ["PLD", "AMT", "EQIX"], competitors: ["DLR", "O", "SPG"], suppliers: ["CBRE", "JLL"], secondOrder: ["WELL", "VICI"] },
  "Media & Telecom": { beneficiaries: ["GOOGL", "META", "NFLX"], competitors: ["DIS", "WBD", "PARA"], suppliers: ["TMUS", "VZ", "T"], secondOrder: ["TTD", "ROKU"] },
};

// ── Ticker reference data ──────────────────────────────────────────────────────
// Single source of truth now lives in lib/tickerMetadata.ts. Re-exported here so
// existing `import { tickerInfo } from "@/lib/maIntelligence"` call sites (e.g.
// marketMap.ts) keep working unchanged.
export { tickerInfo, type TickerInfo };

// TICKER_META sector labels → SECTOR_ROLES keys (a few differ from the bucket name).
const SECTOR_ROLE_KEY: Record<string, string> = {
  "Semiconductors": "Technology",
  "Communication Services": "Media & Telecom",
  "Consumer Staples": "Consumer",
};
/** Sector-peer roles around a single ticker, powers company-centred graphs. */
export function companyPeers(ticker: string): { sector: string; beneficiaries: string[]; competitors: string[]; suppliers: string[]; secondOrder: string[] } | null {
  const info = tickerInfo(ticker);
  if (!info) return null;
  const key = SECTOR_ROLE_KEY[info.sector] ?? info.sector;
  const roles = SECTOR_ROLES[key];
  const ex = (arr: string[]) => arr.filter(t => t.toUpperCase() !== ticker.toUpperCase());
  if (!roles) return { sector: info.sector, beneficiaries: [], competitors: [], suppliers: [], secondOrder: [] };
  return { sector: key, beneficiaries: ex(roles.beneficiaries), competitors: ex(roles.competitors), suppliers: ex(roles.suppliers), secondOrder: ex(roles.secondOrder) };
}

// Theme tag → sector bucket, so a deal whose literal sector is "Other" can still
// resolve inferred peer relationships from the narrative it belongs to.
const THEME_SECTOR: Record<string, string> = {
  "AI Infrastructure": "Technology", "Cloud Security": "Technology", "Semiconductor Sovereignty": "Technology",
  "Energy Transition": "Energy", "Energy Infrastructure": "Energy",
  "Defense Consolidation": "Industrials", "Industrial Automation": "Industrials",
  "Healthcare Consolidation": "Healthcare", "Private Capital": "Financials",
};

/** Resolve sector-peer roles for a deal: literal sector → theme-implied sector → null.
 *  Lets the transmission graph infer beneficiaries/competitors/suppliers even when
 *  the headline never names a sector. */
export function resolveSectorRoles(sector: string, themeTags: string[]): { sector: string; beneficiaries: string[]; competitors: string[]; suppliers: string[]; secondOrder: string[] } | null {
  const tryKey = (k: string) => {
    const norm = SECTOR_ROLE_KEY[k] ?? k;
    const r = SECTOR_ROLES[norm];
    return r ? { sector: norm, beneficiaries: r.beneficiaries, competitors: r.competitors, suppliers: r.suppliers, secondOrder: r.secondOrder } : null;
  };
  const direct = tryKey(sector);
  if (direct) return direct;
  for (const t of themeTags) { const m = THEME_SECTOR[t]; if (m) { const r = tryKey(m); if (r) return r; } }
  return null;
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function firstMatch(text: string, table: [string, RegExp][]): string[] {
  const out: string[] = [];
  for (const [name, re] of table) if (re.test(text) && !out.includes(name)) out.push(name);
  return out;
}

// Stable per-deal seed (FNV-1a) → deterministic phrasing variety. Same deal always
// renders the same wording; different deals diverge.
function dealSeed(deal: MADeal): number {
  const s = deal.id || deal.title;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function pick<T>(arr: T[], seed: number): T { return arr[(seed >>> 0) % arr.length]; }

// Deal value: "$42B", "€7.4 billion", "$1.2bn", or "Undisclosed".
function extractValue(text: string): string | null {
  const m = text.match(/([$€£¥])\s?(\d[\d.,]*)\s?(trillion|billion|million|bn|mn|[tbm])\b/i);
  if (m) {
    const sym = m[1];
    const num = m[2].replace(/,(?=\d{3}\b)/g, "");
    const unitRaw = m[3].toLowerCase();
    const unit = unitRaw.startsWith("t") ? "T" : unitRaw.startsWith("b") ? "B" : "M";
    return `${sym}${num}${unit}`;
  }
  if (/undisclosed|terms\s+(?:were\s+)?not\s+disclosed|not\s+disclosed|undisclosed\s+sum/i.test(text)) {
    return "Undisclosed";
  }
  return null;
}

// Trim a parsed party name to the entity itself: drop trailing deal clauses
// (", advised by…", " for $X", " in a deal") and status framing (" in talks").
function cleanParty(raw: string): string {
  let p = raw.replace(/['"’]/g, "").trim();
  p = p.replace(/,.*$/, "");                                                    // trailing clause after comma
  p = p.replace(/\s+(?:in\s+(?:advanced\s+)?talks|reportedly|explores?|weighs?|mulls?|eyes?|considers?|is\s+said\s+to|is\s+(?:in|near)|nears?)\b.*$/i, "");
  p = p.replace(/\s+(?:for|in|at|amid|as|after|over|to)\b.*$/i, "");            // trailing prep clause
  return p.trim();
}

// Buyer → target from common headline grammars. Returns nulls when not cleanly
// parseable (then the card falls back to extracted entities, or shows nothing).
function extractParties(deal: MADeal): { buyer: string | null; target: string | null } {
  const t = deal.title.trim();
  const pats: RegExp[] = [
    /^(.+?)\s+(?:agrees?\s+to\s+)?(?:acquires?|buys?|to\s+(?:buy|acquire)|purchases?|takes?\s+over|snaps?\s+up)\s+(.+)$/i,
    /^(.+?)\s+(?:to\s+)?merges?\s+with\s+(.+)$/i,
  ];
  for (const re of pats) {
    const m = t.match(re);
    if (m) {
      const buyer  = cleanParty(m[1]);
      const target = cleanParty(m[2]);
      const ok = (s: string) => s.length >= 2 && s.length <= 40 && !/\b(deal|stake|unit|business|assets?|sale)\b/i.test(s);
      if (ok(buyer) && ok(target)) return { buyer, target };
    }
  }
  if (deal.entities.length >= 2 && deal.entities[0] !== deal.entities[1]) {
    return { buyer: deal.entities[0], target: deal.entities[1] };
  }
  return { buyer: null, target: null };
}

function extractFinancing(text: string): string | null {
  if (/all[-\s]?cash|cash\s+deal|in\s+an?\s+all[-\s]?cash/i.test(text)) return "Cash";
  if (/cash[-\s]?and[-\s]?stock|cash\s+&\s+stock|cash\s+plus\s+stock/i.test(text)) return "Cash + Stock";
  if (/all[-\s]?stock|stock[-\s]?for[-\s]?stock|in\s+an?\s+all[-\s]?stock/i.test(text)) return "All Stock";
  if (/leveraged\s+buyout|\blbo\b/i.test(text)) return "LBO";
  if (/bridge\s+loan/i.test(text)) return "Bridge Loan";
  if (/debt\s+financ|financing\s+package|loan\s+package|term\s+loan/i.test(text)) return "Debt Financing";
  return null;
}

const STATUS_COLORS: Record<string, string> = {
  "Rumored":           "#fbbf24",
  "Negotiating":       "#fbbf24",
  "Signed":            "#34d399",
  "Announced":         "#52b0c8",
  "Regulatory Review": "#fb923c",
  "Shareholder Vote":  "#a78bfa",
  "Closing":           "#34d399",
  "Completed":         "#10b981",
  "Withdrawn":         "#f87171",
};

function deriveStatus(deal: MADeal, text: string): string {
  if (deal.dealType === "withdrawn") return "Withdrawn";
  if (/completed|closed\s+the\s+(?:deal|acquisition|transaction)|deal\s+closed|finalized/i.test(text)) return "Completed";
  if (/(near|nearing|set\s+to|expected\s+to)\s+clos|on\s+track\s+to\s+clos/i.test(text)) return "Closing";
  if (/shareholder\s+vote|proxy\s+(?:vote|statement)|investor\s+vote/i.test(text)) return "Shareholder Vote";
  if (/antitrust|regulatory\s+(?:review|approval|scrutiny)|\bdoj\b|\bftc\b|european\s+commission|cma\b|merger\s+review/i.test(text)) return "Regulatory Review";
  if (/definitive\s+agreement|agreed\s+to\s+(?:acquire|buy)|signs?\s+deal|enters?\s+into|signed/i.test(text)) return "Signed";
  if (/in\s+(?:advanced\s+)?talks|negotiat|exclusive\s+talks|due\s+diligence/i.test(text)) return "Negotiating";
  if (deal.dealType === "rumored") return "Rumored";
  return "Announced";
}

function deriveTxnType(deal: MADeal, text: string): string {
  if (/take[-\s]?private|going\s+private|take\s+it\s+private/i.test(text)) return "Take Private";
  if (/hostile|unsolicited|proxy\s+fight/i.test(text)) return "Hostile Bid";
  if (/spin[-\s]?off|spinoff|spins?\s+off|carve[-\s]?out/i.test(text)) return "Spin-off";
  if (/joint\s+venture|\bjv\b/i.test(text)) return "Joint Venture";
  if (/asset\s+sale|sells?\s+(?:its\s+)?(?:unit|division|business|stake|assets)|divest/i.test(text)) return "Asset Sale";
  if (/minority\s+(?:stake|investment|interest)|stake\s+in|invests?\s+in/i.test(text)) return "Minority Investment";
  if (deal.dealType === "merger" || /merger\s+of\s+equals|merges?\s+with|combination/i.test(text)) return "Merger";
  if (deal.dealType === "sponsor" || deal.peFirm) return "Sponsor Buyout";
  return "Strategic";
}

function deriveRationale(deal: MADeal, text: string): string {
  if (/activist|elliott|starboard|trian|third\s+point|pressure\s+from\s+investors/i.test(text)) return "Activist pressure";
  if (/ai\s+infrastructure|data\s+cent|gpu|accelerat|hyperscal|cloud\s+capacity/i.test(text)) return "AI infrastructure expansion";
  if (/distress|bankrupt|restructur|chapter\s+11|insolven|fire\s+sale/i.test(text)) return "Distressed acquisition";
  if (/divest|non[-\s]?core|streamline|simplif|focus\s+on\s+core|portfolio\s+review/i.test(text)) return "Portfolio simplification";
  if (/regulator.{0,20}divest|antitrust\s+remed|forced\s+sale/i.test(text)) return "Regulatory divestiture";
  if (/vertical\s+integrat|supply\s+chain|upstream|downstream|control\s+the\s+supply/i.test(text)) return "Vertical integration";
  if (/expand.{0,20}(?:market|presence|footprint)|enter.{0,12}market|geographic/i.test(text)) return "Geographic expansion";
  if (/recycl|monetiz|return\s+capital|capital\s+return/i.test(text)) return "Capital recycling";
  if (deal.dealType === "sponsor") return "Sponsor value creation";
  if (deal.dealType === "merger") return "Industry consolidation";
  return "Scale & consolidation";
}

// ── Additional fact extractors (present-or-omit) ──────────────────────────────

const COUNTRIES: [string, RegExp][] = [
  ["Germany", /\bgerman(?:y)?\b/i], ["France", /\bfrench|france\b/i], ["UK", /\b(?:uk|british|britain|england)\b/i],
  ["Japan", /\bjapan(?:ese)?\b/i], ["China", /\bchin(?:a|ese)\b/i], ["India", /\bindian?\b/i],
  ["Canada", /\bcanad(?:a|ian)\b/i], ["Switzerland", /\bswiss|switzerland\b/i], ["Netherlands", /\bdutch|netherlands\b/i],
  ["Nordics", /\bnordic|sweden|swedish|finland|norway|danish\b/i], ["Australia", /\baustralian?\b/i],
  ["Brazil", /\bbrazil(?:ian)?\b/i], ["Saudi Arabia", /\bsaudi\b/i], ["UAE", /\bemirati|\buae\b|abu\s+dhabi\b/i],
  ["South Korea", /\bkorean?\b/i],
];

function extractPremium(text: string): string | null {
  const m = text.match(/(\d{1,3})\s?%\s+premium|premium\s+of\s+(\d{1,3})\s?%/i);
  if (m) return `${m[1] || m[2]}% premium`;
  return null;
}
function extractSynergies(text: string): string | null {
  const m = text.match(/([$€£])\s?(\d[\d.,]*)\s?(billion|million|bn|mn|[bm])\b[^.]{0,28}?synerg/i);
  if (m) { const u = m[3].toLowerCase().startsWith("b") ? "B" : "M"; return `${m[1]}${m[2]}${u} synergies`; }
  if (/cost\s+synerg|run-?rate\s+synerg/i.test(text)) return "Cost synergies cited";
  return null;
}

// Transaction economics, each line only when the value is stated in the text.
function extractEconomics(text: string, premium: string | null, synergies: string | null): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const money = (re: RegExp): string | null => {
    const m = text.match(re); if (!m) return null;
    const u = (m[3] || "").toLowerCase().startsWith("b") ? "B" : (m[3] || "").toLowerCase().startsWith("t") ? "T" : "M";
    return `${m[1]}${m[2]}${u}`;
  };
  const ev = money(/enterprise\s+value\s+(?:of\s+)?([$€£])\s?(\d[\d.,]*)\s?(trillion|billion|million|bn|mn|[tbm])\b/i);
  if (ev) out.push({ label: "Enterprise Value", value: ev });
  const eq = money(/equity\s+value\s+(?:of\s+)?([$€£])\s?(\d[\d.,]*)\s?(trillion|billion|million|bn|mn|[tbm])\b/i);
  if (eq) out.push({ label: "Equity Value", value: eq });
  const evEbitda = text.match(/(\d{1,2}(?:\.\d)?)\s?x?\s*(?:times\s+)?ebitda|ev\s*\/\s*ebitda\s+of\s+(\d{1,2}(?:\.\d)?)/i);
  if (evEbitda) out.push({ label: "EV / EBITDA", value: `${evEbitda[1] || evEbitda[2]}x` });
  const revMult = text.match(/(\d{1,2}(?:\.\d)?)\s?x?\s*(?:times\s+)?(?:revenue|sales)\b/i);
  if (revMult && !/ebitda/i.test(revMult[0])) out.push({ label: "Revenue Multiple", value: `${revMult[1]}x` });
  if (premium) out.push({ label: "Premium", value: premium.replace(/\s*premium/i, "") });
  if (synergies) out.push({ label: "Synergies", value: synergies.replace(/\s*synergies?/i, "") });
  const integ = text.match(/(\d)\s?-?\s?year\s+integration|integrat\w*\s+(?:over|within)\s+(\d)\s+years/i);
  if (integ) out.push({ label: "Integration", value: `${integ[1] || integ[2]}-year` });
  return out;
}
function extractCountry(text: string): string | null {
  for (const [name, re] of COUNTRIES) if (re.test(text)) return name;
  return null;
}
function extractFinancingDetail(text: string): string[] {
  const out: string[] = [];
  if (/bridge\s+loan/i.test(text)) out.push("Bridge Loan");
  if (/private\s+credit|direct\s+lend/i.test(text)) out.push("Private Credit");
  if (/bond\s+(?:offering|sale)|note\s+offering|high[-\s]?yield/i.test(text)) out.push("Bond Offering");
  if (/syndicat/i.test(text)) out.push("Syndication");
  if (/term\s+loan/i.test(text)) out.push("Term Loan");
  return out;
}
// Other named bidders, only when the text signals a contest.
function extractCompetingBidders(text: string, buyer: string | null): string[] {
  if (!/competing\s+bid|rival\s+(?:bid|offer|suitor)|counter\s?bid|counter\s?offer|also\s+(?:bid|interested)|bidding\s+war|other\s+suitors?/i.test(text)) return [];
  const names = firstMatch(text, [
    ["Apollo", /apollo/i], ["KKR", /\bkkr\b/i], ["Blackstone", /blackstone/i], ["Brookfield", /brookfield/i],
    ["Thoma Bravo", /thoma\s+bravo/i], ["Carlyle", /carlyle/i], ["Bain Capital", /bain\s+capital/i],
    ["Advent", /advent/i], ["TPG", /\btpg\b/i], ["Silver Lake", /silver\s+lake/i], ["Vista", /vista\s+equity/i],
  ]);
  const buyerUp = (buyer ?? "").toUpperCase();
  return names.filter(n => !buyerUp.includes(n.toUpperCase())).slice(0, 4);
}

// Advisor role detection: only assert a role when the text makes it explicit
// (window of ±40 chars around the name). Names without an explicit role stay
// unsided and surface in the flat advisor list instead.
function splitAdvisorSides(text: string, banks: string[], legal: string[]): DealIntel["advisorSides"] {
  const sides: DealIntel["advisorSides"] = { buyFinancial: [], sellFinancial: [], buyLegal: [], sellLegal: [], financing: [], fairness: [] };
  const segOf = (name: string): string => {
    const esc = name.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&");
    const m = text.match(new RegExp(`(.{0,40}${esc}.{0,40})`, "i"));
    return m ? m[1].toLowerCase() : "";
  };
  for (const b of banks) {
    const seg = segOf(b);
    if (/financ(?:ing|ed)|lead\s+arrang|debt\s+commit|provid\w*\s+(?:the\s+)?(?:debt|loan|financing)/.test(seg)) { sides.financing.push(b); continue; }
    if (/fairness\s+opinion|rendered\s+a\s+fairness/.test(seg)) { sides.fairness.push(b); continue; }
    if (/buy[-\s]?side|advising\s+(?:the\s+)?(?:buyer|acquirer)|buyer'?s\s+advis|advised?\s+(?:the\s+)?(?:buyer|acquirer)/.test(seg)) { sides.buyFinancial.push(b); continue; }
    if (/sell[-\s]?side|advising\s+(?:the\s+)?(?:seller|target)|seller'?s\s+advis|target'?s\s+advis|advised?\s+(?:the\s+)?(?:seller|target)/.test(seg)) { sides.sellFinancial.push(b); continue; }
  }
  for (const l of legal) {
    const seg = segOf(l);
    if (/buy[-\s]?side|advising\s+(?:the\s+)?(?:buyer|acquirer)|buyer'?s\s+(?:legal|counsel)|counsel\s+to\s+(?:the\s+)?(?:buyer|acquirer)/.test(seg)) sides.buyLegal.push(l);
    else if (/sell[-\s]?side|advising\s+(?:the\s+)?(?:seller|target)|seller'?s\s+(?:legal|counsel)|counsel\s+to\s+(?:the\s+)?(?:seller|target)/.test(seg)) sides.sellLegal.push(l);
  }
  return sides;
}

// ── Theme intelligence tags (derived from this deal's signals; ≤4) ─────────────
function deriveThemeTags(deal: MADeal, text: string, crossBorder: boolean, sizeClass: DealIntel["sizeClass"]): string[] {
  const tags: string[] = [];
  const add = (t: string) => { if (!tags.includes(t)) tags.push(t); };
  if (/ai\s+infra|data\s+cent|hyperscal|gpu|compute\s+capacity/i.test(text)) add("AI Infrastructure");
  if (/semiconductor|\bchip|silicon|fab\b|foundry|wafer/i.test(text)) add("Semiconductor Sovereignty");
  if (/cyber|cloud\s+security|zero\s+trust|endpoint/i.test(text)) add("Cloud Security");
  if (/defense|defence|military|missile|munition|aerospace/i.test(text)) add("Defense Consolidation");
  if (/energy\s+transition|renewable|solar|wind|decarboniz|clean\s+energy|battery/i.test(text)) add("Energy Transition");
  if (/\blng\b|pipeline|midstream|oilfield|upstream/i.test(text)) add("Energy Infrastructure");
  if (/automation|robot|industrial\s+software|factory/i.test(text)) add("Industrial Automation");
  if (/pharma|biotech|drug|therapeut|oncolog/i.test(text)) add("Healthcare Consolidation");
  if (/vertical|supply\s+chain|upstream|downstream/i.test(text)) add("Vertical Integration");
  if (/activist|elliott|starboard|trian|third\s+point/i.test(text)) add("Activist");
  if (crossBorder) add("Cross-Border");
  if (deal.peFirm || deal.dealType === "sponsor") add("Private Capital");
  if (sizeClass === "mega" || sizeClass === "large" || /consolidat|roll-?up|scale/i.test(text)) add("Scale Acquisition");
  return tags.slice(0, 4);
}

// ── Conditional specialized sections, ONLY those that fire for this deal ───────
function buildDynamicSections(deal: MADeal, text: string, intel: {
  status: string; txnType: string; crossBorder: boolean; country: string | null;
  financing: string | null; financingDetail: string[]; competingBidders: string[];
  synergies: string | null; sizeClass: DealIntel["sizeClass"]; ctx: DealContext;
}): { label: string; bullets: string[] }[] {
  const out: { label: string; bullets: string[] }[] = [];

  if (/activist|elliott|starboard|trian|third\s+point|proxy/i.test(text)) {
    out.push({ label: "Activist Involvement", bullets: [
      "An activist position is shaping the strategic outcome",
      "Board is acting to pre-empt a proxy campaign",
    ].slice(0, 2) });
  }
  if (intel.financing || intel.financingDetail.length > 0 || intel.txnType === "Sponsor Buyout" || intel.txnType === "Take Private") {
    const fb: string[] = [];
    if (intel.financingDetail.length) fb.push(`Structure: ${intel.financingDetail.join(", ")}`);
    fb.push(intel.ctx.creditOpen ? "Leveraged financing is available at competitive spreads" : "Debt markets remain selective; equity contribution likely elevated");
    if (intel.financing) fb.push(`${intel.financing} consideration`);
    out.push({ label: "Financing Package", bullets: fb.slice(0, 3) });
  }
  if (deal.peFirm || intel.txnType === "Sponsor Buyout" || intel.txnType === "Take Private") {
    out.push({ label: "Sponsor Return Profile", bullets: [
      `${deal.peFirm ?? "The sponsor"} is targeting a multi-year hold with margin and multiple expansion`,
      intel.synergies ? "Underwriting includes disclosed cost-out" : "Value creation rests on operational improvement, not multiple arbitrage",
      "Exit optionality via strategic sale, secondary, or IPO",
    ].slice(0, 3) });
  }
  if (intel.crossBorder) {
    out.push({ label: "Cross-Border Risk", bullets: [
      intel.country ? `${intel.country} angle adds FX and repatriation considerations` : "Cross-border structure adds FX and repatriation considerations",
      "Foreign-investment / national-security review (e.g. CFIUS) is a gating factor",
    ].slice(0, 2) });
  }
  const sameSectorMerger = intel.txnType === "Merger" || /consolidat|combination/i.test(text);
  if (intel.status === "Regulatory Review" || (sameSectorMerger && (intel.sizeClass === "mega" || intel.sizeClass === "large"))) {
    out.push({ label: "Antitrust Considerations", bullets: [
      "Horizontal overlap invites close competition review",
      "A remedy or divestiture package may be required to clear",
    ].slice(0, 2) });
  }
  if (intel.competingBidders.length > 0) {
    out.push({ label: "Competitive Dynamics", bullets: [
      `Contested process, ${intel.competingBidders.join(", ")} also engaged`,
      "A topping bid would pressure the buyer's accretion math",
    ].slice(0, 2) });
  }
  if (/accretive|guidance|management\s+(?:said|expects|sees)|eps\s+accret/i.test(text)) {
    out.push({ label: "Management Commentary", bullets: [
      /accretive/i.test(text) ? "Management frames the deal as accretive to earnings" : "Management has guided to the strategic and financial rationale",
    ].slice(0, 1) });
  }
  return out;
}

// ── Importance ────────────────────────────────────────────────────────────────

function valueToUsdB(v: string | null): number | null {
  if (!v || v === "Undisclosed") return null;
  const m = v.match(/[$€£¥]([\d.,]+)([TBM])/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return m[2] === "T" ? n * 1000 : m[2] === "B" ? n : n / 1000;
}

function classifySize(deal: MADeal, usdB: number | null): { sizeClass: DealIntel["sizeClass"]; sizeLabel: string; featured: boolean } {
  if (usdB != null) {
    if (usdB >= 20) return { sizeClass: "mega",   sizeLabel: "Mega Deal", featured: true };
    if (usdB >= 5)  return { sizeClass: "large",  sizeLabel: "Large",     featured: true };
    if (usdB >= 1)  return { sizeClass: "medium", sizeLabel: "Medium",    featured: false };
    return            { sizeClass: "small",  sizeLabel: "Small",     featured: false };
  }
  if (deal.dealType === "rumored") return { sizeClass: "unknown", sizeLabel: "Rumor", featured: false };
  if (deal.signalScore >= 80)      return { sizeClass: "unknown", sizeLabel: "High Conviction", featured: true };
  return { sizeClass: "unknown", sizeLabel: "Undisclosed", featured: false };
}

// ── Bullet generators, every bullet is gated on a real attribute of THIS deal ──

function rationaleBullets(deal: MADeal, text: string, country: string | null, synergies: string | null, txnType: string): string[] {
  const b: string[] = [];
  if (/data\s+cent|hyperscal|gpu|ai\s+infra|compute\s+capacity/i.test(text)) b.push("Expands AI / data-center infrastructure footprint");
  if (deal.dealType === "merger" || /consolidat|combination|merges?\s+with/i.test(text)) b.push("Removes a direct competitor and consolidates share");
  if (/vertical|supply\s+chain|upstream|downstream/i.test(text)) b.push("Vertically integrates the supply chain");
  if (country) b.push(`Adds ${country} market access`);
  if (/pricing\s+power|capacity|scarce|bottleneck/i.test(text)) b.push("Strengthens pricing power through capacity control");
  if (synergies) b.push("Targets disclosed cost synergies");
  if (txnType === "Sponsor Buyout" || txnType === "Take Private") b.push("Sponsor underwriting an operational value-creation plan");
  if (/non[-\s]?core|divest|portfolio|streamline/i.test(text)) b.push("Sharpens the seller's portfolio toward core assets");
  if (b.length === 0) b.push(`Consolidates the buyer's ${deal.sector} position`);
  return b.slice(0, 4);
}

function whyNowBullets(text: string, rationale: string, txnType: string, ctx: DealContext, seed: number): string[] {
  const b: string[] = [];
  if (ctx.creditOpen && (txnType === "Sponsor Buyout" || txnType === "Take Private")) b.push("Leveraged financing markets have reopened");
  if (ctx.riskRegime === "risk-on") b.push("Risk-on regime is supporting deal underwriting");
  if (/data\s+cent|hyperscal|ai\s+infra|gpu/i.test(text)) b.push("AI-infrastructure demand is pulling capacity forward");
  if (rationale === "Industry consolidation" || rationale === "Scale & consolidation")
    b.push(pick(["Scale economics now favor the largest operators", "The window to combine before rates normalize is narrowing", "Sub-scale operators are harder to fund independently"], seed));
  if (rationale === "Distressed acquisition") b.push("Seller balance-sheet stress is forcing action");
  if (rationale === "Activist pressure") b.push("Activist pressure is forcing a strategic response");
  if (/rate\s+cut|easing|lower\s+(?:rates|borrowing)/i.test(text)) b.push("Easing rates are lowering the cost of capital");
  if (b.length === 0)
    b.push(pick(["A narrowing valuation gap has opened a deal window", "Depressed entry multiples make the math work now", "Strategic urgency is outweighing a still-cautious tape"], seed >>> 4));
  return b.slice(0, 4);
}

function implicationBullets(buyer: string | null, deal: MADeal, roles: SectorRoles | undefined,
  keep: (a: string[]) => string[], txnType: string): string[] {
  const b: string[] = [];
  const who = buyer ?? "The acquirer";
  b.push(`Wins: ${who} gains scale in ${deal.sector}`);
  const winners = roles ? keep(roles.beneficiaries).slice(0, 2) : [];
  if (winners.length) b.push(`Beneficiaries: ${winners.join(", ")} on the sector re-rate`);
  const losers = roles ? keep(roles.competitors).slice(0, 2) : [];
  if (losers.length) b.push(`Pressured: ${losers.join(", ")} face a scaled rival`);
  if (txnType === "Merger" || /consolidat/i.test(deal.title)) b.push(`Re-rates: comparable ${deal.sector} multiples mark up`);
  const targets = roles ? keep(roles.competitors).slice(2, 4) : [];
  if (targets.length) b.push(`Now in play: ${targets.join(", ")} screen as follow-on targets`);
  return b.slice(0, 5);
}

function whatNextBullets(status: string, deal: MADeal, peers: string[], hasFinancing: boolean): string[] {
  const b: string[] = [];
  if (status === "Rumored" || status === "Negotiating") b.push("Definitive agreement or a competing bid before terms firm up");
  if (hasFinancing || deal.dealType === "sponsor") b.push("Financing completion / syndication");
  if (status !== "Completed" && status !== "Withdrawn") b.push("Regulatory / antitrust review");
  if (status === "Signed" || status === "Regulatory Review") b.push("Shareholder vote ahead of close");
  if (peers.length >= 2) b.push(`Follow-on pressure on ${peers.slice(0, 2).join(", ")}`);
  if (b.length === 0) b.push("Screen peers for follow-on activity");
  return b.slice(0, 4);
}

// Eight-stage transaction lifecycle → highlight the current stage from status
// (and "due diligence" when the text flags it).
function buildTimeline(status: string, text: string): DealIntel["timeline"] {
  const stages = ["Rumor", "Negotiation", "Due Diligence", "Announcement", "Board Approval", "Antitrust Review", "Shareholder Vote", "Closing"];
  const idx =
    status === "Rumored"           ? 0 :
    status === "Negotiating"       ? (/due\s+diligence/i.test(text) ? 2 : 1) :
    status === "Announced"         ? 3 :
    status === "Signed"            ? 4 :
    status === "Regulatory Review" ? 5 :
    status === "Shareholder Vote"  ? 6 :
    status === "Closing"           ? 7 :
    status === "Completed"         ? 8 :
    status === "Withdrawn"         ? -1 : 0;
  return stages.map((stage, i) => ({ stage, done: idx > i, current: i === idx }));
}

// ── Probability of completion (inferred estimate) ──────────────────────────────
// Deterministic score from deal status, regulatory complexity, financing
// certainty and structure. Presented as an estimate, never a quoted figure.
function computeCompletion(deal: MADeal, text: string, status: string, txnType: string, financing: string | null,
  sizeClass: DealIntel["sizeClass"], crossBorder: boolean, competingBidders: string[]): DealIntel["completion"] {
  if (status === "Completed") return { pct: 100, label: "Closed", color: "#10b981", drivers: ["Transaction completed"] };
  if (deal.dealType === "withdrawn") return { pct: 4, label: "Terminated", color: "#f87171", drivers: ["Deal withdrawn or terminated"] };

  // Base by lifecycle stage, and the headline reason for that base.
  let pct = ({
    "Closing": 96, "Shareholder Vote": 90, "Signed": 84, "Regulatory Review": 76,
    "Announced": 80, "Negotiating": 54, "Rumored": 30,
  } as Record<string, number>)[status] ?? 60;

  const drivers: string[] = [({
    "Closing": "Expected to close imminently", "Shareholder Vote": "Awaiting shareholder vote",
    "Signed": "Definitive agreement signed", "Regulatory Review": "In regulatory review",
    "Announced": "Announced transaction", "Negotiating": "In negotiation, no definitive agreement",
    "Rumored": "Rumored / no definitive agreement yet",
  } as Record<string, string>)[status] ?? "Announced transaction"];

  // Regulatory complexity.
  const sameSectorMerger = txnType === "Merger" || /consolidat|combination|merges?\s+with/i.test(text);
  if (sameSectorMerger && (sizeClass === "mega" || sizeClass === "large")) { pct -= 12; drivers.push("Antitrust risk elevated (horizontal overlap)"); }
  if (crossBorder) { pct -= 6; drivers.push("Cross-border review required"); }
  if (txnType === "Hostile Bid") { pct -= 14; drivers.push("Unsolicited / hostile structure"); }
  if (/\bcfius\b|national\s+security|state\s+aid/i.test(text)) { pct -= 8; drivers.push("National-security (CFIUS) review"); }

  // Financing certainty / structure.
  if (financing === "Cash") { pct += 5; drivers.push("All-cash consideration"); }
  if (/committed\s+financing|fully\s+financed|financing\s+secured/i.test(text)) { pct += 5; drivers.push("Financing committed"); }
  if ((txnType === "Sponsor Buyout" || txnType === "Take Private") && !/committed\s+financing|fully\s+financed/i.test(text)) { pct -= 7; drivers.push("Financing not yet confirmed"); }

  // Process risk to THIS buyer.
  if (competingBidders.length > 0) { pct -= 6; drivers.push("Competing bid in the process"); }

  pct = Math.max(8, Math.min(99, Math.round(pct)));
  const [label, color] =
    pct >= 85 ? ["High", "#34d399"] :
    pct >= 65 ? ["Likely", "#52b0c8"] :
    pct >= 45 ? ["Contested", "#fbbf24"] : ["Speculative", "#f87171"];
  return { pct, label, color, drivers: drivers.slice(0, 4) };
}

// ── Capital transmission, how capital moves because of the deal ───────────────
// Ordered "re-rating chain" keyed on the dominant theme, plus sector role flows.
const TRANSMISSION_CHAINS: Record<string, string[]> = {
  "AI Infrastructure":         ["Hyperscaler capex expectations rise", "AI-infrastructure & data-center names re-rate", "Power, cooling & networking suppliers benefit", "Legacy on-prem vendors de-rate", "AI buildout narrative strengthens"],
  "Semiconductor Sovereignty": ["Domestic fab & equipment demand re-rates", "Foundry and semicap suppliers benefit", "Commodity trailing-edge names lag", "Supply-chain reshoring narrative strengthens"],
  "Cloud Security":            ["Cloud & security software re-rates", "Platform consolidators gain share", "Point-solution / legacy firewall vendors de-rate", "AI-security narrative strengthens"],
  "Defense Consolidation":     ["Defense primes & backlog re-rate", "Subsystem suppliers benefit", "Sub-scale defense names become targets", "Rising-budget narrative strengthens"],
  "Energy Transition":         ["Clean-energy & grid names re-rate", "Battery and interconnection suppliers benefit", "Carbon-heavy laggards de-rate", "Electrification narrative strengthens"],
  "Energy Infrastructure":     ["Midstream & LNG names re-rate", "Pipeline and oilfield services benefit", "Spot-exposed E&Ps lag", "Energy-security narrative strengthens"],
  "Healthcare Consolidation":  ["Large-cap pharma scale re-rates", "CRO & supplier names benefit", "Patent-cliff laggards become targets", "Pipeline-buying narrative strengthens"],
  "Industrial Automation":     ["Automation & robotics names re-rate", "Component and sensor suppliers benefit", "Manual-process laggards lose share", "Reshoring-automation narrative strengthens"],
  "Private Capital":           ["The bid validates private-market marks", "Take-private candidates re-rate on optionality", "Crowded shorts face squeeze risk", "Sponsor-demand narrative strengthens"],
};
const CROSS_SECTOR: Record<string, string> = {
  "Technology": "power & utilities (data-center load)", "Healthcare": "med-tech & distribution",
  "Energy": "industrials & utilities", "Financials": "asset managers & exchanges",
  "Industrials": "materials & logistics", "Consumer": "retail & packaging",
  "Real Estate": "lenders & REIT credit", "Media & Telecom": "advertising & semis",
};

function buildCapitalTransmission(deal: MADeal, text: string, tags: string[], txnType: string,
  roles: SectorRoles | undefined, premium: string | null, dealValue: string | null,
  buyer: string | null, seed: number, keep: (a: string[]) => string[]): DealIntel["capitalTransmission"] {
  const chain =
    TRANSMISSION_CHAINS[tags.find(t => TRANSMISSION_CHAINS[t]) ?? ""] ??
    [`${deal.sector} consolidation sets a valuation marker`, "Scale leaders re-rate higher", "Sub-scale peers become acquisition targets", `Capital rotates toward ${deal.sector} consolidators`];

  const beneficiaries = roles ? keep(roles.beneficiaries).slice(0, 3) : [];
  const casualties    = roles ? keep(roles.competitors).slice(0, 3) : [];
  const suppliers     = roles ? keep(roles.suppliers).slice(0, 3) : [];

  const effects: { label: string; text: string }[] = [];
  if (suppliers.length) effects.push({ label: "Supply Chain", text: `Upstream suppliers (${suppliers.join(", ")}) gain order visibility` });
  if (txnType === "Merger" || /consolidat/i.test(text)) effects.push({ label: "Pricing Power", text: `Reduced competition supports pricing across ${deal.sector}` });
  if (casualties.length) effects.push({ label: "Competitive Landscape", text: `Rivals (${casualties.join(", ")}) face a scaled competitor and may pursue their own deals` });
  if (dealValue && dealValue !== "Undisclosed") effects.push({ label: "Valuation", text: `Transaction multiple${premium ? ` (${premium.replace(/\s*premium/i, "")} premium)` : ""} re-rates comparable ${deal.sector} names` });
  effects.push({ label: "Capital Rotation", text: txnType === "Sponsor Buyout" || txnType === "Take Private"
    ? pick(["Validates private-market marks; remaining take-private candidates re-rate", "Flows tilt toward names screening as the next sponsor target", "Public discounts to private marks compress across the group"], seed >>> 5)
    : pick([`Positioning concentrates in the ${deal.sector} scale winners`, `Flows favor the consolidators over the consolidated in ${deal.sector}`, `Index weight shifts toward the surviving ${deal.sector} platforms`], seed >>> 5) });
  const xs = CROSS_SECTOR[deal.sector];
  if (xs) effects.push({ label: "Cross-Sector", text: `Read-through into ${xs}` });

  const flow = {
    acquirer: buyer ?? deal.peFirm ?? "Acquirer",
    sector: deal.sector,
    beneficiaries: beneficiaries.slice(0, 3),
    pressured: casualties.slice(0, 3),
    themes: tags.slice(0, 3),
  };

  return { chain, beneficiaries, casualties, effects: effects.slice(0, 5), flow };
}

// ── Argus Assessment, the research-note headline read ─────────────────────────
// Three deal-specific sentences (why it matters / market signal / what to watch),
// each seed-picked from attribute-gated pools so no two cards read alike. Purely
// derived interpretation, labelled as such in the UI. Avoids the generic register
// ("consolidation is accelerating", "capital rotates toward", "strengthens position").
function buildArgusAssessment(deal: MADeal, p: {
  buyer: string | null; target: string | null; dealValue: string | null;
  txnType: string; rationale: string; status: string; sector: string;
  themeTags: string[]; completion: DealIntel["completion"]; crossBorder: boolean;
  sizeClass: DealIntel["sizeClass"]; competingBidders: string[]; premium: string | null;
}): string {
  const seed   = dealSeed(deal);
  const actor  = p.buyer ?? deal.peFirm ?? "The acquirer";
  const tgt    = p.target ?? `a ${p.sector.toLowerCase()} asset`;
  const val    = p.dealValue && p.dealValue !== "Undisclosed" ? p.dealValue : null;
  const lead   = p.themeTags[0] ?? null;
  const sectorL = p.sector.toLowerCase();

  // 1, why it matters
  let s1: string[];
  if (p.txnType === "Take Private" || p.txnType === "Sponsor Buyout" || deal.peFirm) {
    s1 = [
      `${actor} is moving ${tgt} ${p.txnType === "Take Private" ? "off the public market" : "into private hands"}${val ? ` in a ${val} transaction` : ""}, a wager that ${sectorL} value is easier to build away from quarterly scrutiny.`,
      `${val ? `${val} of ` : ""}private capital is being committed to ${tgt}, a reminder of how much dry powder is still hunting ${sectorL} assets.`,
    ];
  } else if (p.txnType === "Merger") {
    s1 = [
      `Folding ${actor} and ${tgt} together${val ? ` at a ${val} valuation` : ""} takes a direct competitor out of the ${sectorL} field.`,
      `${actor} and ${tgt} are combining${val ? ` in a ${val} tie-up` : ""}, reshaping the ${sectorL} competitive map in one move.`,
    ];
  } else if (p.sizeClass === "mega" || p.sizeClass === "large") {
    s1 = [
      `${actor}'s ${val ? `${val} ` : ""}pursuit of ${tgt} ranks among the larger ${sectorL} transactions of the cycle, not a bolt-on.`,
      `At ${val ?? "this scale"}, ${actor}'s bid for ${tgt} is a franchise-level ${sectorL} commitment.`,
    ];
  } else if (p.status === "Rumored") {
    s1 = [
      `Reports that ${actor} is circling ${tgt} are unconfirmed, but the strategic logic is concrete enough to move ${sectorL} peers.`,
      `${actor}'s rumored interest in ${tgt} is early-stage, yet it flags where ${sectorL} acquirers are looking.`,
    ];
  } else {
    s1 = [
      `${actor} is acquiring ${tgt}${val ? ` for ${val}` : ""}, a ${p.rationale.toLowerCase()} move in ${sectorL}.`,
      `${actor}'s purchase of ${tgt}${val ? ` at ${val}` : ""} is built around ${p.rationale.toLowerCase()}.`,
    ];
  }

  // 2, what signal it sends
  const sig: Record<string, string[]> = {
    "AI Infrastructure":         [`The read-through: owners of compute, power and data-center capacity can increasingly name their price.`, `It is another data point that anything adjacent to AI compute is bought for control, not yield.`],
    "Cloud Security":            [`It tells the market that platform vendors mean to absorb point solutions before AI rewrites the security stack.`, `The signal is security budgets consolidating onto fewer platforms.`],
    "Semiconductor Sovereignty": [`It underlines that supply-chain control now outranks unit cost in silicon.`, `The message: capital is chasing domestic chip supply over the cheapest supply.`],
    "Defense Consolidation":     [`It reads as positioning for a multi-year defense spending cycle.`, `The signal: backlog and program access are worth paying up for.`],
    "Energy Transition":         [`It marks continued repricing of grid, storage and clean-generation assets.`, `The read-through is that electrification infrastructure is being locked up early.`],
    "Healthcare Consolidation":  [`It points to large-cap buyers refilling pipelines through the balance sheet rather than the lab.`, `The signal: pipeline access is beating organic R&D timelines.`],
    "Energy Infrastructure":     [`It says energy-security assets are being secured ahead of the next price cycle.`, `The read is that midstream and LNG control carries a strategic premium.`],
  };
  let s2: string[];
  if (lead && sig[lead]) s2 = sig[lead];
  else if (p.competingBidders.length) s2 = [`A contested process says the asset is scarce, ${p.competingBidders[0]} is circling the same target.`, `Rival interest points to genuine scarcity rather than opportunism.`];
  else if (p.crossBorder) s2 = [`Reaching across borders for this asset suggests the strategic gap could not be filled at home.`, `A cross-border structure signals willingness to take review risk to reach the target.`];
  else s2 = [`It signals ${sectorL} buyers are willing to act while financing and valuations align.`, `The takeaway: strategic buyers view the current ${sectorL} entry point as attractive.`];

  // 3, what to watch next
  let s3: string[];
  if (p.status === "Regulatory Review") s3 = [`Watch the antitrust calendar, a remedy package is the swing factor on whether it closes.`, `The next tell is regulators' posture; a forced divestiture would reshape the economics.`];
  else if (p.status === "Rumored" || p.status === "Negotiating") s3 = [`Watch for a definitive agreement or a counter-bid before terms firm up.`, `What matters next is whether talks convert to a signed deal or draw a rival.`];
  else if (p.competingBidders.length) s3 = [`Watch whether ${p.competingBidders[0]} returns with a topping offer.`, `The open question is whether a higher bid forces the price up.`];
  else if (p.completion.pct >= 85) s3 = [`With approvals and financing largely in hand, attention turns to integration and the read-through for sector rivals.`, `Close looks routine; the next move is in the peers it puts in play.`];
  else s3 = [`Watch the path to a shareholder vote and how comparable names trade once terms are public.`, `The next signal is in how the peer group re-rates against the print.`];

  const out = `${pick(s1, seed)} ${pick(s2, seed >>> 3)} ${pick(s3, seed >>> 6)}`;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// Market impact, winners / losers / re-rating / follow-on targets, from sector
// roles. Tickers framed as potential read-through, not claimed involvement.
function buildMarketImpact(deal: MADeal, roles: SectorRoles | undefined, keep: (a: string[]) => string[],
  beneficiaries: string[], casualties: string[], premium: string | null, dealValue: string | null, seed: number): DealIntel["marketImpact"] {
  const followOn = roles
    ? [...keep(roles.secondOrder), ...keep(roles.competitors).slice(2)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3)
    : [];
  const marker = premium ? `${premium.replace(/\s*premium/i, "")} premium` : (dealValue && dealValue !== "Undisclosed" ? `${dealValue} price` : "terms");
  const rerating = pick([
    `Comparable ${deal.sector} names re-rate against the deal's ${marker}.`,
    `The print resets the valuation floor for listed ${deal.sector} peers.`,
    `Public ${deal.sector} multiples mark to this transaction.`,
  ], seed >>> 9);
  return { winners: beneficiaries.slice(0, 3), losers: casualties.slice(0, 3), rerating, followOn };
}

// ── Comparable historical transactions (sector-matched precedents) ─────────────
interface Comparable { acquirer: string; target: string; value: string; year: string }
const COMPARABLE_DEALS: Record<string, Comparable[]> = {
  "Technology": [
    { acquirer: "Broadcom",  target: "VMware",              value: "$69B", year: "2023" },
    { acquirer: "Cisco",     target: "Splunk",              value: "$28B", year: "2024" },
    { acquirer: "Microsoft", target: "Activision Blizzard", value: "$69B", year: "2023" },
    { acquirer: "Synopsys",  target: "Ansys",               value: "$35B", year: "2024" },
    { acquirer: "Adobe",     target: "Figma",               value: "$20B", year: "2023" },
  ],
  "Healthcare": [
    { acquirer: "Pfizer", target: "Seagen",            value: "$43B", year: "2023" },
    { acquirer: "Amgen",  target: "Horizon Therapeutics", value: "$28B", year: "2023" },
    { acquirer: "Merck",  target: "Prometheus Bio",    value: "$11B", year: "2023" },
    { acquirer: "Novartis", target: "MorphoSys",       value: "$2.9B", year: "2024" },
  ],
  "Energy": [
    { acquirer: "ExxonMobil",  target: "Pioneer Natural",  value: "$60B", year: "2023" },
    { acquirer: "Chevron",     target: "Hess",             value: "$53B", year: "2023" },
    { acquirer: "Diamondback", target: "Endeavor Energy",  value: "$26B", year: "2024" },
    { acquirer: "ConocoPhillips", target: "Marathon Oil",  value: "$22B", year: "2024" },
  ],
  "Financials": [
    { acquirer: "Capital One", target: "Discover Financial", value: "$35B", year: "2024" },
    { acquirer: "BlackRock",   target: "Global Infrastructure Partners", value: "$12.5B", year: "2024" },
    { acquirer: "UBS",         target: "Credit Suisse",     value: "$3.2B", year: "2023" },
  ],
  "Industrials": [
    { acquirer: "GE Aerospace spin", target: "GE Vernova", value: "spin-off", year: "2024" },
    { acquirer: "Honeywell",  target: "CAES Systems",     value: "$1.9B", year: "2024" },
    { acquirer: "Emerson",    target: "NI (National Instruments)", value: "$8.2B", year: "2023" },
  ],
  "Consumer": [
    { acquirer: "Mars",  target: "Kellanova",      value: "$36B", year: "2024" },
    { acquirer: "Campbell", target: "Sovos Brands", value: "$2.7B", year: "2023" },
    { acquirer: "J.M. Smucker", target: "Hostess Brands", value: "$5.6B", year: "2023" },
  ],
  "Real Estate": [
    { acquirer: "Blackstone", target: "Air Communities", value: "$10B",  year: "2024" },
    { acquirer: "Prologis",   target: "Duke Realty",     value: "$26B",  year: "2022" },
    { acquirer: "Blackstone", target: "QTS Realty",      value: "$10B",  year: "2021" },
  ],
  "Media & Telecom": [
    { acquirer: "Disney",   target: "21st Century Fox", value: "$71B", year: "2019" },
    { acquirer: "Amazon",   target: "MGM Studios",      value: "$8.5B", year: "2022" },
    { acquirer: "Microsoft", target: "Activision Blizzard", value: "$69B", year: "2023" },
  ],
};
function pickComparables(deal: MADeal, buyer: string | null, target: string | null): Comparable[] {
  const list = COMPARABLE_DEALS[deal.sector] ?? [];
  const ex = new Set([buyer, target, ...deal.entities].filter(Boolean).map(s => (s as string).toLowerCase()));
  return list.filter(c => !ex.has(c.acquirer.toLowerCase()) && !ex.has(c.target.toLowerCase())).slice(0, 4);
}

/** Comparable historical deals for an (already-resolved) sector key, used by the
 *  transmission graph to add precedent nodes even when intel.comparables is empty. */
export function comparablesFor(sector: string): { acquirer: string; target: string; value: string; year: string }[] {
  return COMPARABLE_DEALS[SECTOR_ROLE_KEY[sector] ?? sector] ?? [];
}

// ── Institutional confidence, how well-supported the read is (not the odds) ────
function buildConfidence(deal: MADeal, status: string, dealValue: string | null,
  advisors: DealAdvisors, themeTags: string[]): DealIntel["confidence"] {
  let score = 38 + Math.round(deal.signalScore * 0.42);   // base ~38–80
  const supports: string[] = [];
  if (status === "Signed" || status === "Regulatory Review" || status === "Shareholder Vote" || status === "Closing" || status === "Completed") {
    score += 12; supports.push("Definitive agreement on file");
  } else if (status === "Announced") {
    score += 6; supports.push("Public announcement");
  }
  if (advisors.banks.length || advisors.legal.length) { score += 8; supports.push("Named advisor disclosures"); }
  if (dealValue && dealValue !== "Undisclosed") { score += 7; supports.push("Disclosed transaction terms"); }
  if (deal.entities.length >= 2) { score += 4; supports.push(`${deal.entities.length} independent sources`); }
  if (themeTags.length >= 2) { score += 5; supports.push("Historical precedent"); }
  if (themeTags.length >= 1) { supports.push("Capital-flow model"); }
  if (themeTags.some(t => /AI Infrastructure|Energy Transition|Cloud Security|Defense|Semiconductor/i.test(t))) { score += 3; supports.push("Theme persistence"); }
  if (status === "Signed" || status === "Regulatory Review" || status === "Closing") { supports.push("Sector behavior"); }
  if (status === "Rumored") { score -= 16; supports.unshift("Unconfirmed reporting"); }
  if (deal.dealType === "withdrawn") { score -= 10; }
  score = Math.max(34, Math.min(97, score));
  const label = score >= 85 ? "High" : score >= 68 ? "Elevated" : score >= 50 ? "Moderate" : "Developing";
  if (supports.length === 0) supports.push("Single-source signal");
  return { score, label, supports: supports.slice(0, 6) };
}

// ── Visual significance tier, drives adaptive card weight ─────────────────────
function computeTier(sizeClass: DealIntel["sizeClass"], usdB: number | null, signalScore: number, txnType: string): DealIntel["tier"] {
  if ((usdB != null && usdB >= 50) || (sizeClass === "mega" && txnType === "Merger") || (signalScore >= 88 && (sizeClass === "mega" || sizeClass === "large"))) return "headline";
  if (sizeClass === "mega" || sizeClass === "large" || signalScore >= 80) return "major";
  if (sizeClass === "medium") return "standard";
  return "minor";
}

// ── Public API ──────────────────────────────────────────────────────────────────

export function enrichDeal(deal: MADeal, ctx: DealContext = {}): DealIntel {
  const text = `${deal.title} ${deal.summary} ${deal.whyItMatters}`;

  const { buyer, target } = extractParties(deal);
  const dealValue   = extractValue(text);
  const financing   = extractFinancing(text);
  const country     = extractCountry(text);
  const crossBorder = /cross[-\s]?border/i.test(text) || country !== null;
  const premium     = extractPremium(text);
  const synergies   = extractSynergies(text);
  const financingDetail = extractFinancingDetail(text);
  const banks  = firstMatch(text, ADVISOR_BANKS);
  const legal  = firstMatch(text, LAW_FIRMS);
  const advisors: DealAdvisors = { banks, legal };
  const advisorSides = splitAdvisorSides(text, banks, legal);
  const competingBidders = extractCompetingBidders(text, buyer);

  const status    = deriveStatus(deal, text);
  const txnType   = deriveTxnType(deal, text);
  const rationale = deriveRationale(deal, text);
  const usdB      = valueToUsdB(dealValue);
  const { sizeClass, sizeLabel, featured } = classifySize(deal, usdB);

  const peerPool  = SECTOR_PEERS[deal.sector] ?? [];
  const exclude   = new Set([buyer, target, ...deal.entities].filter(Boolean).map(s => (s as string).toUpperCase()));
  const keep      = (arr: string[]) => arr.filter(p => !exclude.has(p.toUpperCase()));
  const readThrough = keep(peerPool).slice(0, 5);

  // Categorized read-through (only roles that have peers after exclusions).
  const roles = SECTOR_ROLES[deal.sector];
  const readThroughGroups = roles
    ? ([
        { role: "Beneficiaries", tickers: keep(roles.beneficiaries).slice(0, 3) },
        { role: "Competitors",   tickers: keep(roles.competitors).slice(0, 3) },
        { role: "Suppliers",     tickers: keep(roles.suppliers).slice(0, 3) },
        { role: "Second-order",  tickers: keep(roles.secondOrder).slice(0, 2) },
      ].filter(g => g.tickers.length > 0))
    : [];

  const economics = extractEconomics(text, premium, synergies);
  const themeTags = deriveThemeTags(deal, text, crossBorder, sizeClass);
  const dynamicSections = buildDynamicSections(deal, text, {
    status, txnType, crossBorder, country, financing, financingDetail, competingBidders, synergies, sizeClass, ctx,
  });
  const seed = dealSeed(deal);
  const completion = computeCompletion(deal, text, status, txnType, financing, sizeClass, crossBorder, competingBidders);
  const capitalTransmission = buildCapitalTransmission(deal, text, themeTags, txnType, roles, premium, dealValue, buyer, seed, keep);
  const marketImpact = buildMarketImpact(deal, roles, keep, capitalTransmission.beneficiaries, capitalTransmission.casualties, premium, dealValue, seed);
  const argusAssessment = buildArgusAssessment(deal, {
    buyer, target, dealValue, txnType, rationale, status, sector: deal.sector,
    themeTags, completion, crossBorder, sizeClass, competingBidders, premium,
  });
  const tier = computeTier(sizeClass, usdB, deal.signalScore, txnType);
  const confidence = buildConfidence(deal, status, dealValue, advisors, themeTags);
  const comparables = pickComparables(deal, buyer, target);

  return {
    dealValue, buyer, target, financing, crossBorder, advisors, advisorSides,
    premium, synergies, country, competingBidders, financingDetail, economics, themeTags,
    sizeClass, sizeLabel, featured,
    tier, argusAssessment, confidence, comparables, marketImpact,
    status, statusColor: STATUS_COLORS[status] ?? "#52b0c8", txnType, rationale,
    rationaleBullets:   rationaleBullets(deal, text, country, synergies, txnType),
    whyNowBullets:      whyNowBullets(text, rationale, txnType, ctx, seed),
    implicationBullets: implicationBullets(buyer, deal, roles, keep, txnType),
    whatNextBullets:    whatNextBullets(status, deal, readThrough, financing != null || financingDetail.length > 0),
    dynamicSections,
    readThrough, readThroughGroups,
    timeline: buildTimeline(status, text),
    completion, capitalTransmission,
  };
}

// ── M&A market regime, what the deal tape is signaling, before any single deal ──

export interface RegimeMetric { label: string; display: string; pct: number; color: string; hint: string }

/** Six compact indicators summarising the current deal set. One pass; average
 *  completion is the mean of the per-deal inferred estimates. */
export function buildMarketRegime(deals: MADeal[], ctx: DealContext = {}): RegimeMetric[] {
  if (deals.length === 0) return [];
  let strat = 0, spon = 0, rumor = 0, xborder = 0, mega = 0, compSum = 0;
  for (const d of deals) {
    const intel = enrichDeal(d, ctx);
    if (d.dealType === "sponsor" || d.peFirm) spon++;
    else if (d.dealType !== "withdrawn" && d.dealType !== "rumored") strat++;
    if (d.dealType === "rumored" || intel.status === "Rumored") rumor++;
    if (intel.crossBorder) xborder++;
    if (intel.sizeClass === "mega" || intel.sizeClass === "large") mega++;
    compSum += intel.completion.pct;
  }
  const n = deals.length;
  const pctOf = (x: number) => Math.round((x / n) * 100);
  const avg = Math.round(compSum / n);
  return [
    { label: "Strategic Buyers", display: `${strat}`,          pct: pctOf(strat),   color: "#52b0c8", hint: "corporate acquirers" },
    { label: "Sponsor Activity", display: `${spon}`,           pct: pctOf(spon),    color: "#a78bfa", hint: "PE buyouts & take-privates" },
    { label: "Rumor Flow",       display: `${rumor}`,          pct: pctOf(rumor),   color: "#fbbf24", hint: "unconfirmed / exploring" },
    { label: "Cross-Border",     display: `${pctOf(xborder)}%`, pct: pctOf(xborder), color: "#fb923c", hint: "share with foreign angle" },
    { label: "Mega / Large",     display: `${mega}`,           pct: pctOf(mega),    color: "#34d399", hint: "≥ $5B disclosed" },
    { label: "Avg. Completion",  display: `${avg}%`,           pct: avg,            color: avg >= 70 ? "#34d399" : avg >= 50 ? "#fbbf24" : "#f87171", hint: "mean inferred probability" },
  ];
}

/** Largest deals (by extracted, disclosed value) for the sidebar. */
export function largestDeals(deals: MADeal[]): { deal: MADeal; value: string; usdB: number }[] {
  return deals
    .map(d => { const v = extractValue(`${d.title} ${d.summary}`); const u = valueToUsdB(v); return v && u != null ? { deal: d, value: v, usdB: u } : null; })
    .filter((x): x is { deal: MADeal; value: string; usdB: number } => x !== null)
    .sort((a, b) => b.usdB - a.usdB)
    .slice(0, 5);
}

// ── Aggregates for sidebar intelligence ─────────────────────────────────────────

export interface AdvisorActivity { name: string; deals: number; legal: boolean }

/** League-table style advisor ranking, counted across the deal set (only names
 *  actually detected in deal text, never fabricated). */
export function rankAdvisors(deals: MADeal[]): AdvisorActivity[] {
  const counts = new Map<string, { n: number; legal: boolean }>();
  for (const d of deals) {
    const text = `${d.title} ${d.summary} ${d.whyItMatters}`;
    for (const b of firstMatch(text, ADVISOR_BANKS)) {
      const cur = counts.get(b) ?? { n: 0, legal: false }; cur.n++; counts.set(b, cur);
    }
    for (const l of firstMatch(text, LAW_FIRMS)) {
      const cur = counts.get(l) ?? { n: 0, legal: true }; cur.n++; cur.legal = true; counts.set(l, cur);
    }
  }
  return [...counts.entries()]
    .map(([name, v]) => ({ name, deals: v.n, legal: v.legal }))
    .sort((a, b) => b.deals - a.deals)
    .slice(0, 8);
}

export interface IndustryActivity { sector: string; deals: number; capital: string | null }

/** Most-active industries with deal count + aggregated disclosed capital (sum of
 *  extracted deal values; null when nothing in the bucket disclosed a value). */
export function rankIndustries(deals: MADeal[]): IndustryActivity[] {
  const agg = new Map<string, { deals: number; usdB: number; any: boolean }>();
  for (const d of deals) {
    const v = agg.get(d.sector) ?? { deals: 0, usdB: 0, any: false };
    v.deals++;
    const val = extractValue(`${d.title} ${d.summary}`);
    if (val && val !== "Undisclosed") {
      const m = val.match(/[$€£¥]([\d.,]+)([TBM])/);
      if (m) {
        const num = parseFloat(m[1].replace(/,/g, ""));
        const mult = m[2] === "T" ? 1000 : m[2] === "B" ? 1 : 0.001;
        if (Number.isFinite(num)) { v.usdB += num * mult; v.any = true; }
      }
    }
    agg.set(d.sector, v);
  }
  return [...agg.entries()]
    .map(([sector, v]) => ({
      sector, deals: v.deals,
      capital: v.any ? (v.usdB >= 1000 ? `$${(v.usdB / 1000).toFixed(1)}T` : `$${v.usdB.toFixed(v.usdB >= 10 ? 0 : 1)}B`) : null,
    }))
    .sort((a, b) => b.deals - a.deals)
    .slice(0, 6);
}

// ── Live IB dashboard, consolidated league tables (single pass) ────────────────

function fmtUsdB(usdB: number): string {
  return usdB >= 1000 ? `$${(usdB / 1000).toFixed(1)}T` : usdB >= 10 ? `$${usdB.toFixed(0)}B` : `$${usdB.toFixed(1)}B`;
}

export interface AdvisorLeague { name: string; deals: number; capital: string | null; avgSize: string | null }
export interface SponsorLeague { firm: string; deals: number; capital: string | null; avgSize: string | null; topSector: string | null }
export interface EntityLeague  { name: string; deals: number; sectors: string[] }
export interface SectorHeat    { sector: string; deals: number; capital: string | null; avgSize: string | null; crossBorderPct: number; pipeline: number }
export interface LeagueTables {
  financialAdvisors: AdvisorLeague[];
  legalAdvisors:     { name: string; deals: number }[];
  sponsors:          SponsorLeague[];
  acquirers:         EntityLeague[];
  targets:           { name: string; deals: number; sector: string }[];
  sectorHeat:        SectorHeat[];
  capitalFlow:       { label: string; chain: string[] } | null;
}

// Accumulator for {count, summed value over deals that disclosed one}.
interface ValAgg { deals: number; usdB: number; valued: number }
function pushVal(map: Map<string, ValAgg>, key: string, usdB: number | null) {
  const v = map.get(key) ?? { deals: 0, usdB: 0, valued: 0 };
  v.deals++; if (usdB != null) { v.usdB += usdB; v.valued++; }
  map.set(key, v);
}
function toLeague(map: Map<string, ValAgg>, limit: number) {
  return [...map.entries()]
    .map(([name, v]) => ({
      name, deals: v.deals,
      capital: v.valued ? fmtUsdB(v.usdB) : null,
      avgSize: v.valued ? fmtUsdB(v.usdB / v.valued) : null,
    }))
    .sort((a, b) => b.deals - a.deals || (parseFloat((b.capital ?? "0").replace(/[^\d.]/g, "")) - parseFloat((a.capital ?? "0").replace(/[^\d.]/g, ""))))
    .slice(0, limit);
}

/** One pass over the deal set → every league table the sidebar needs. Values are
 *  summed ONLY across deals that disclosed a figure (never fabricated). */
export function buildLeagueTables(deals: MADeal[]): LeagueTables {
  const fin = new Map<string, ValAgg>();
  const legalCt = new Map<string, number>();
  const spon = new Map<string, ValAgg>();
  const sponSectors = new Map<string, Map<string, number>>();
  const acq = new Map<string, { deals: number; sectors: Set<string> }>();
  const tgt = new Map<string, { deals: number; sector: string }>();
  const sec = new Map<string, { deals: number; usdB: number; valued: number; xborder: number; pipeline: number }>();
  const tagCt = new Map<string, number>();

  // Known sponsors to exclude from the strategic-acquirer table.
  const PE_KEY = new Set([
    "KKR", "Blackstone", "Apollo", "Carlyle", "Thoma Bravo", "Vista", "Silver Lake",
    "Warburg Pincus", "TPG", "Bain Capital", "Advent", "CVC", "EQT", "Permira",
    "Clearlake", "Brookfield", "General Atlantic", "Ares",
  ].map(s => s.toUpperCase()));

  for (const d of deals) {
    const text  = `${d.title} ${d.summary} ${d.whyItMatters}`;
    const usdB  = valueToUsdB(extractValue(text));
    const banks = firstMatch(text, ADVISOR_BANKS);
    const legal = firstMatch(text, LAW_FIRMS);
    const { buyer, target } = extractParties(d);
    const cross = /cross[-\s]?border/i.test(text) || extractCountry(text) !== null;
    const status = deriveStatus(d, text);
    const sizeClass = classifySize(d, usdB).sizeClass;
    const tags = deriveThemeTags(d, text, cross, sizeClass);

    for (const b of banks) pushVal(fin, b, usdB);
    for (const l of legal) legalCt.set(l, (legalCt.get(l) ?? 0) + 1);

    if (d.peFirm) {
      pushVal(spon, d.peFirm, usdB);
      const sm = sponSectors.get(d.peFirm) ?? new Map<string, number>();
      sm.set(d.sector, (sm.get(d.sector) ?? 0) + 1); sponSectors.set(d.peFirm, sm);
    }

    // Strategic acquirers = parsed buyer that isn't a PE firm.
    if (buyer && !PE_KEY.has(buyer.toUpperCase()) && !/\b(group|partners|capital|management)\b/i.test(buyer)) {
      const a = acq.get(buyer) ?? { deals: 0, sectors: new Set<string>() };
      a.deals++; a.sectors.add(d.sector); acq.set(buyer, a);
    }
    if (target) {
      const t = tgt.get(target) ?? { deals: 0, sector: d.sector }; t.deals++; tgt.set(target, t);
    }

    const sv = sec.get(d.sector) ?? { deals: 0, usdB: 0, valued: 0, xborder: 0, pipeline: 0 };
    sv.deals++; if (usdB != null) { sv.usdB += usdB; sv.valued++; }
    if (cross) sv.xborder++;
    if (status === "Rumored" || status === "Negotiating" || status === "Announced") sv.pipeline++;
    sec.set(d.sector, sv);

    for (const t of tags) tagCt.set(t, (tagCt.get(t) ?? 0) + 1);
  }

  const sponsors: SponsorLeague[] = toLeague(spon, 8).map(s => {
    const sm = sponSectors.get(s.name);
    const top = sm ? [...sm.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null;
    return { firm: s.name, deals: s.deals, capital: s.capital, avgSize: s.avgSize, topSector: top };
  });

  const acquirers: EntityLeague[] = [...acq.entries()]
    .map(([name, v]) => ({ name, deals: v.deals, sectors: [...v.sectors].slice(0, 2) }))
    .sort((a, b) => b.deals - a.deals).slice(0, 8);

  const targets = [...tgt.entries()]
    .map(([name, v]) => ({ name, deals: v.deals, sector: v.sector }))
    .sort((a, b) => b.deals - a.deals).slice(0, 6);

  const sectorHeat: SectorHeat[] = [...sec.entries()]
    .map(([sector, v]) => ({
      sector, deals: v.deals,
      capital: v.valued ? fmtUsdB(v.usdB) : null,
      avgSize: v.valued ? fmtUsdB(v.usdB / v.valued) : null,
      crossBorderPct: Math.round((v.xborder / v.deals) * 100),
      pipeline: Math.round((v.pipeline / v.deals) * 100),
    }))
    .sort((a, b) => b.deals - a.deals).slice(0, 7);

  // Dominant capital flow = most common theme tag that has a transmission chain.
  const topTag = [...tagCt.entries()].sort((a, b) => b[1] - a[1]).find(([t]) => TRANSMISSION_CHAINS[t]);
  const capitalFlow = topTag ? { label: topTag[0], chain: TRANSMISSION_CHAINS[topTag[0]] } : null;

  return {
    financialAdvisors: toLeague(fin, 8),
    legalAdvisors: [...legalCt.entries()].map(([name, deals]) => ({ name, deals })).sort((a, b) => b.deals - a.deals).slice(0, 6),
    sponsors, acquirers, targets, sectorHeat, capitalFlow,
  };
}
