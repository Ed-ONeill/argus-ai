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
  // ── Classification labels (deal classification is surface-owned) ────────────
  status:      string;
  statusColor: string;
  txnType:     string;
  rationale:   string;           // headline rationale label (keyword classification)
  // ── Factual lifecycle stages derived from the stated status ─────────────────
  timeline:    { stage: string; done: boolean; current: boolean }[];
  // ── Curated HISTORICAL REFERENCE transactions (real past deals; labeled) ────
  comparables: { acquirer: string; target: string; value: string; year: string }[];
  // Phase 2.6 (D3): argusAssessment, confidence, marketImpact, rationale/whyNow/
  // implication/whatNext bullets, dynamicSections, readThrough, completion
  // probability, and capitalTransmission are DELETED - meaning comes from the
  // shared engines via lib/maIntel.
}

export interface DealContext {
  creditOpen?: boolean;   // financing markets open (from capital-flow credit layer)
  regime?:     string;    // derived market regime ("risk-on" etc. lives on riskRegime)
  riskRegime?: "risk-on" | "neutral" | "risk-off";
  /** Phase 2.6: the shared per-deal reads (lib/maIntel), keyed by deal id. */
  shared?:     Map<string, import("./maIntel").DealIntelShared>;
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

// ── Peer/role dictionaries: DELETED (Phase 2.6, D3) ──────────────────────────
// SECTOR_PEERS / SECTOR_ROLES were curated peer groups masquerading as live
// relationships. Read-through, beneficiaries, and casualties now come from
// RECORDED graph edges via shared profiles (lib/maIntel).

// ── Ticker reference data ──────────────────────────────────────────────────────
// Single source of truth now lives in lib/tickerMetadata.ts. Re-exported here so
// existing `import { tickerInfo } from "@/lib/maIntelligence"` call sites (e.g.
// marketMap.ts) keep working unchanged.
export { tickerInfo, type TickerInfo };

// companyPeers / resolveSectorRoles / THEME_SECTOR: DELETED (Phase 2.6, D3) -
// curated buyer/peer/supplier roles may not render as intelligence. Recorded
// graph relationships replace them.

// ── Small helpers ──────────────────────────────────────────────────────────────

function firstMatch(text: string, table: [string, RegExp][]): string[] {
  const out: string[] = [];
  for (const [name, re] of table) if (re.test(text) && !out.includes(name)) out.push(name);
  return out;
}

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

// completion probability / capital transmission / Argus assessment / market
// impact generators: DELETED (Phase 2.6, D3). Inferred completion odds,
// invented transmission chains, templated assessments, and winner/loser calls
// were page-local meaning. Shared reads live in lib/maIntel.

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
  // RC2-TX: keyed on `deal.sector`, which is now the canonical sector name.
  "Communications": [
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
  const alias: Record<string, string> = { "Semiconductors": "Technology", "Communication Services": "Communications", "Consumer Staples": "Consumer" };
  return COMPARABLE_DEALS[alias[sector] ?? sector] ?? [];
}

// ── Visual significance tier, drives adaptive card weight ─────────────────────
function computeTier(sizeClass: DealIntel["sizeClass"], usdB: number | null, signalScore: number, txnType: string): DealIntel["tier"] {
  if ((usdB != null && usdB >= 50) || (sizeClass === "mega" && txnType === "Merger") || (signalScore >= 88 && (sizeClass === "mega" || sizeClass === "large"))) return "headline";
  if (sizeClass === "mega" || sizeClass === "large" || signalScore >= 80) return "major";
  if (sizeClass === "medium") return "standard";
  return "minor";
}

// ── Public API ──────────────────────────────────────────────────────────────────

export function enrichDeal(deal: MADeal, _ctx: DealContext = {}): DealIntel {
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

  const economics = extractEconomics(text, premium, synergies);
  const themeTags = deriveThemeTags(deal, text, crossBorder, sizeClass);
    const tier = computeTier(sizeClass, usdB, deal.signalScore, txnType);
  const comparables = pickComparables(deal, buyer, target);

  return {
    dealValue, buyer, target, financing, crossBorder, advisors, advisorSides,
    premium, synergies, country, competingBidders, financingDetail, economics, themeTags,
    sizeClass, sizeLabel, featured, tier,
    status, statusColor: STATUS_COLORS[status] ?? "#52b0c8", txnType, rationale,
    timeline: buildTimeline(status, text),
    comparables,
  };
}

// ── M&A market regime, what the deal tape is signaling, before any single deal ──

export interface RegimeMetric { label: string; display: string; pct: number; color: string; hint: string }

/** Six compact indicators summarising the current deal set. One pass; average
 *  completion is the mean of the per-deal inferred estimates. */
export function buildMarketRegime(deals: MADeal[], ctx: DealContext = {}): RegimeMetric[] {
  if (deals.length === 0) return [];
  // Phase 2.6: factual counts only - the "average inferred completion"
  // metric is deleted (invented probability is not intelligence).
  let strat = 0, spon = 0, rumor = 0, xborder = 0, mega = 0;
  for (const d of deals) {
    const intel = enrichDeal(d, ctx);
    if (d.dealType === "sponsor" || d.peFirm) spon++;
    else if (d.dealType !== "withdrawn" && d.dealType !== "rumored") strat++;
    if (d.dealType === "rumored" || intel.status === "Rumored") rumor++;
    if (intel.crossBorder) xborder++;
    if (intel.sizeClass === "mega" || intel.sizeClass === "large") mega++;
  }
  const n = deals.length;
  const pctOf = (x: number) => Math.round((x / n) * 100);
  return [
    { label: "Strategic Buyers", display: `${strat}`,          pct: pctOf(strat),   color: "#52b0c8", hint: "corporate acquirers" },
    { label: "Sponsor Activity", display: `${spon}`,           pct: pctOf(spon),    color: "#a78bfa", hint: "PE buyouts & take-privates" },
    { label: "Rumor Flow",       display: `${rumor}`,          pct: pctOf(rumor),   color: "#fbbf24", hint: "unconfirmed / exploring" },
    { label: "Cross-Border",     display: `${pctOf(xborder)}%`, pct: pctOf(xborder), color: "#fb923c", hint: "share with foreign angle" },
    { label: "Mega / Large",     display: `${mega}`,           pct: pctOf(mega),    color: "#34d399", hint: "≥ $5B disclosed" },
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

  // Phase 2.6: the invented "dominant capital flow" chain is deleted.
  const capitalFlow = null;

  return {
    financialAdvisors: toLeague(fin, 8),
    legalAdvisors: [...legalCt.entries()].map(([name, deals]) => ({ name, deals })).sort((a, b) => b.deals - a.deals).slice(0, 6),
    sponsors, acquirers, targets, sectorHeat, capitalFlow,
  };
}
