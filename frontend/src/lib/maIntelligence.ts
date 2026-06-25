/**
 * lib/maIntelligence.ts — deterministic deal-intelligence engine.
 *
 * Turns a raw M&A headline into a structured "intelligence object." Two classes
 * of field, treated differently:
 *
 *   FACTS  (deal value, advisor names, buyer/target, financing) — EXTRACTED from
 *          the actual title/summary text. If the text does not contain it, the
 *          field is null/empty. Never invented. ("Leave blank rather than
 *          fabricate.")
 *
 *   ANALYSIS (transaction type, strategic rationale, why-now, what's-next, deal
 *          thesis, market implications, read-through peers) — DERIVED
 *          deterministically from the deal's type/sector/keywords + market
 *          context, the same interpretive pattern Argus uses for theme
 *          intelligence. Institutional register, no generic AI filler.
 *
 * Zero LLM calls. Pure functions over the existing MADeal fields.
 */

import type { MADeal } from "@/hooks/useMAIntelligence";

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
  advisorSides: { buyFinancial: string[]; sellFinancial: string[]; buyLegal: string[]; sellLegal: string[] };
  premium:     string | null;    // "32% premium" if stated
  synergies:   string | null;    // "$2B cost synergies" if stated
  country:     string | null;    // detected geography
  competingBidders: string[];    // other named bidders if the text flags a contest
  financingDetail:  string[];    // "Bridge Loan", "Private Credit", "Bond Offering" if stated
  // ── Importance ─────────────────────────────────────────────────────────────
  sizeClass:   "mega" | "large" | "medium" | "small" | "unknown";
  sizeLabel:   string;           // "Mega Deal" | "Large" | … | "Rumor" | "Breaking"
  featured:    boolean;          // visually elevated (mega/large or breaking)
  // ── Derived analysis (institutional, every bullet tied to this deal) ───────
  status:      string;
  statusColor: string;
  txnType:     string;
  rationale:   string;           // headline rationale label
  rationaleBullets:   string[];  // specific drivers
  whyNowBullets:      string[];  // specific timing factors
  implicationBullets: string[];  // who benefits / pressured
  whatNextBullets:    string[];  // forward path
  readThrough: string[];
  timeline:    { stage: string; done: boolean; current: boolean }[];
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

// ── Small helpers ──────────────────────────────────────────────────────────────

function firstMatch(text: string, table: [string, RegExp][]): string[] {
  const out: string[] = [];
  for (const [name, re] of table) if (re.test(text) && !out.includes(name)) out.push(name);
  return out;
}

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

// Advisor side detection: only assert a side when the text makes it explicit
// ("advising the buyer", "{name}, sell-side adviser"); otherwise leave unsided.
function splitAdvisorSides(text: string, banks: string[], legal: string[]): DealIntel["advisorSides"] {
  const sides: DealIntel["advisorSides"] = { buyFinancial: [], sellFinancial: [], buyLegal: [], sellLegal: [] };
  const sideOf = (name: string): "buy" | "sell" | null => {
    const esc = name.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&");
    const win = new RegExp(`(.{0,40}${esc}.{0,40})`, "i");
    const m = text.match(win);
    const seg = m ? m[1].toLowerCase() : "";
    if (/buy[-\s]?side|advising\s+(?:the\s+)?(?:buyer|acquirer)|buyer'?s\s+advis|advised?\s+(?:the\s+)?(?:buyer|acquirer)/.test(seg)) return "buy";
    if (/sell[-\s]?side|advising\s+(?:the\s+)?(?:seller|target)|seller'?s\s+advis|target'?s\s+advis|advised?\s+(?:the\s+)?(?:seller|target)/.test(seg)) return "sell";
    return null;
  };
  for (const b of banks) { const s = sideOf(b); if (s === "buy") sides.buyFinancial.push(b); else if (s === "sell") sides.sellFinancial.push(b); }
  for (const l of legal) { const s = sideOf(l); if (s === "buy") sides.buyLegal.push(l); else if (s === "sell") sides.sellLegal.push(l); }
  return sides;
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

// ── Bullet generators — every bullet is gated on a real attribute of THIS deal ──

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

function whyNowBullets(text: string, rationale: string, txnType: string, ctx: DealContext): string[] {
  const b: string[] = [];
  if (ctx.creditOpen && (txnType === "Sponsor Buyout" || txnType === "Take Private")) b.push("Leveraged financing markets have reopened");
  if (ctx.riskRegime === "risk-on") b.push("Risk-on regime is supporting deal underwriting");
  if (/data\s+cent|hyperscal|ai\s+infra|gpu/i.test(text)) b.push("AI infrastructure demand is pulling forward capacity");
  if (rationale === "Industry consolidation" || rationale === "Scale & consolidation") b.push("Sector consolidation is accelerating");
  if (rationale === "Distressed acquisition") b.push("Seller balance-sheet stress is forcing action");
  if (rationale === "Activist pressure") b.push("Activist pressure is forcing a strategic response");
  if (/rate\s+cut|easing|lower\s+(?:rates|borrowing)/i.test(text)) b.push("Easing rates are lowering the cost of capital");
  if (b.length === 0) b.push("A narrowing valuation gap has opened a deal window");
  return b.slice(0, 4);
}

function implicationBullets(buyer: string | null, deal: MADeal, peers: string[], txnType: string, crossBorder: boolean): string[] {
  const b: string[] = [];
  const who = buyer ?? "The acquirer";
  if (peers.length > 0) b.push(`Read-through pressure on ${peers.slice(0, 3).join(", ")}`);
  if (txnType === "Merger" || /consolidat/i.test(deal.title)) b.push("Sets a fresh valuation marker for the subsector");
  b.push(`Strengthens ${who}'s position in ${deal.sector}`);
  if (txnType === "Sponsor Buyout") b.push("Signals private-capital appetite returning to the sector");
  if (crossBorder) b.push("May draw cross-border regulatory / national-security scrutiny");
  return b.slice(0, 4);
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

// Stage pipeline → highlight the current stage from the derived status.
function buildTimeline(status: string): DealIntel["timeline"] {
  const stages = ["Announced", "Board Approval", "Regulatory Review", "Shareholder Vote", "Expected Close"];
  const idx =
    status === "Rumored" || status === "Negotiating" ? 0 :
    status === "Signed"            ? 1 :
    status === "Regulatory Review" ? 2 :
    status === "Shareholder Vote"  ? 3 :
    status === "Closing"           ? 4 :
    status === "Completed"         ? 5 : 0;
  return stages.map((stage, i) => ({ stage, done: i < idx, current: i === idx }));
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
  const readThrough = peerPool.filter(p => !exclude.has(p.toUpperCase())).slice(0, 5);

  return {
    dealValue, buyer, target, financing, crossBorder, advisors, advisorSides,
    premium, synergies, country, competingBidders, financingDetail,
    sizeClass, sizeLabel, featured,
    status, statusColor: STATUS_COLORS[status] ?? "#52b0c8", txnType, rationale,
    rationaleBullets:   rationaleBullets(deal, text, country, synergies, txnType),
    whyNowBullets:      whyNowBullets(text, rationale, txnType, ctx),
    implicationBullets: implicationBullets(buyer, deal, readThrough, txnType, crossBorder),
    whatNextBullets:    whatNextBullets(status, deal, readThrough, financing != null || financingDetail.length > 0),
    readThrough,
    timeline: buildTimeline(status),
  };
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
 *  actually detected in deal text — never fabricated). */
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
