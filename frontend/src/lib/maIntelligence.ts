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
  advisors:    DealAdvisors;
  // ── Derived analysis (always institutional, never empty filler) ────────────
  status:      string;            // "Rumored" | "Negotiating" | "Signed" | …
  statusColor: string;
  txnType:     string;            // "Strategic" | "Sponsor Buyout" | "Take Private" | …
  rationale:   string;            // strategic rationale label
  whyNow:      string;            // one-sentence timing read
  whatNext:    string;            // one-sentence forward read
  thesis:      string[];          // ≤3 institutional bullets
  implications:string;            // who benefits / who's pressured
  readThrough: string[];          // potential read-through peers
}

export interface DealContext {
  creditOpen?: boolean;   // financing markets open (from capital-flow credit layer)
  regime?:     string;    // derived market regime
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

function deriveWhyNow(deal: MADeal, txnType: string, rationale: string, ctx: DealContext): string {
  if (rationale === "Activist pressure") return "Management is acting under activist pressure to surface value before a proxy contest.";
  if (rationale === "Distressed acquisition") return "Balance-sheet stress is forcing asset sales below replacement cost.";
  if (rationale === "AI infrastructure expansion") return "Compute scarcity is pulling forward consolidation of infrastructure and capacity.";
  if (txnType === "Sponsor Buyout" || txnType === "Take Private" || txnType === "LBO") {
    return ctx.creditOpen
      ? "Compressed financing spreads have reopened the leveraged buyout window."
      : "Sponsors are deploying equity-heavy structures while debt markets stay selective.";
  }
  if (txnType === "Asset Sale" || rationale === "Portfolio simplification") {
    return "Sellers are monetizing non-core assets to fund higher-return priorities.";
  }
  if (rationale === "Industry consolidation" || rationale === "Scale & consolidation") {
    return "Scale economics are outweighing standalone growth as the cycle matures.";
  }
  return "Strategic timing reflects a narrowing valuation gap between buyer and target.";
}

function deriveWhatNext(deal: MADeal, status: string, peers: string[]): string {
  if (status === "Regulatory Review") return "Antitrust review is the gating risk; expect a remedy or divestiture package as a condition.";
  if (status === "Rumored" || status === "Negotiating") return "Watch for a definitive agreement or a competing bid before terms firm up.";
  if (status === "Shareholder Vote") return "Approval looks likely; a sweetened bid is the main wildcard into the vote.";
  if (peers.length >= 2) return `Remaining independents — ${peers.slice(0, 2).join(", ")} — face heightened consolidation pressure.`;
  return "Sector peers should be screened for follow-on activity as the deal sets a valuation marker.";
}

function deriveThesis(deal: MADeal, txnType: string, financing: string | null, rationale: string, ctx: DealContext): string[] {
  const bullets: string[] = [];
  if (txnType === "Sponsor Buyout" || txnType === "Take Private") {
    bullets.push(ctx.creditOpen ? "Buyer is betting financing markets have reopened." : "Buyer is structuring around still-tight credit.");
  } else if (txnType === "Asset Sale" || txnType === "Spin-off") {
    bullets.push("Seller is monetizing non-core assets to sharpen capital allocation.");
  } else {
    bullets.push("Buyer is consolidating share ahead of the next cycle.");
  }
  bullets.push(
    rationale === "Industry consolidation" || rationale === "Scale & consolidation"
      ? "Sector consolidation remains below prior-cycle peaks, leaving runway."
      : `${rationale} is the strategic driver, not opportunistic multiple arbitrage.`,
  );
  if (financing) bullets.push(`${financing} structure signals the buyer's read on cost of capital.`);
  else if (deal.peFirm) bullets.push(`${deal.peFirm} is deploying dry powder into a motivated seller.`);
  return bullets.slice(0, 3);
}

function deriveImplications(buyer: string | null, deal: MADeal, peers: string[]): string {
  const who = buyer ?? "The acquirer";
  const peerStr = peers.slice(0, 2).join(" and ");
  if (!peerStr) return `${who} strengthens its ${deal.sector} position; competitors should be screened for a defensive response.`;
  return `${who} strengthens its ${deal.sector} position, increasing competitive pressure on ${peerStr}.`;
}

// ── Public API ──────────────────────────────────────────────────────────────────

export function enrichDeal(deal: MADeal, ctx: DealContext = {}): DealIntel {
  const text = `${deal.title} ${deal.summary} ${deal.whyItMatters}`;

  const { buyer, target } = extractParties(deal);
  const dealValue   = extractValue(text);
  const financing   = extractFinancing(text);
  const crossBorder = /\b(european|german|french|british|uk|japan(?:ese)?|chin(?:a|ese)|indian|canadian|korean|swiss|dutch|nordic|australian|brazil(?:ian)?|saudi|emirati)\b/i.test(text);
  const advisors: DealAdvisors = { banks: firstMatch(text, ADVISOR_BANKS), legal: firstMatch(text, LAW_FIRMS) };

  const status    = deriveStatus(deal, text);
  const txnType   = deriveTxnType(deal, text);
  const rationale = deriveRationale(deal, text);

  const peerPool  = SECTOR_PEERS[deal.sector] ?? [];
  const exclude   = new Set([buyer, target, ...deal.entities].filter(Boolean).map(s => (s as string).toUpperCase()));
  const readThrough = peerPool.filter(p => !exclude.has(p.toUpperCase())).slice(0, 5);

  return {
    dealValue, buyer, target, financing, crossBorder, advisors,
    status, statusColor: STATUS_COLORS[status] ?? "#52b0c8",
    txnType, rationale,
    whyNow:  deriveWhyNow(deal, txnType, rationale, ctx),
    whatNext: deriveWhatNext(deal, status, readThrough),
    thesis:  deriveThesis(deal, txnType, financing, rationale, ctx),
    implications: deriveImplications(buyer, deal, readThrough),
    readThrough,
  };
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
