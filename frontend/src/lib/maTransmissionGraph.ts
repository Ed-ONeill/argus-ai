/**
 * lib/maTransmissionGraph.ts — M&A adapter for the generic graph engine.
 *
 * Translates a DealIntel (and any company the user re-centres on) into the
 * domain-agnostic GraphModel consumed by components/graph/NetworkGraph. All
 * M&A-specific mapping lives here; the engine itself knows nothing about deals.
 */

import type { MADeal } from "@/hooks/useMAIntelligence";
import { tickerInfo, companyPeers, resolveSectorRoles, comparablesFor, type DealIntel } from "@/lib/maIntelligence";
import type { GraphModel, GraphNode, GraphEdge, RelationType } from "@/lib/graph/types";

// Rough mega-cap set for the "mega-cap" filter (illustrative, not exhaustive).
const MEGA = new Set(["MSFT", "AAPL", "NVDA", "GOOGL", "META", "AMZN", "AVGO", "LLY", "JPM", "XOM", "TSM", "ORCL", "UNH", "V", "MA", "COST", "WMT", "CVX"]);

function tickerFields(t: string): Partial<GraphNode> {
  const info = tickerInfo(t);
  return { ticker: t, name: info?.name, sector: info?.sector, exchange: info?.exchange, isPublic: !!info, megaCap: MEGA.has(t.toUpperCase()), recenterable: !!info };
}

// ── Transmission spines — ordered cause→effect chains. The deal-type spine is the
//    architecture signature: sponsor buyouts, mergers, hostile bids, activist
//    campaigns and cross-border deals each cascade through different mechanisms,
//    so the network SHAPE reveals the transaction type before the headline. ──
interface Concept { id: string; label: string; role: RelationType; reason: string; themes?: string[] }

const DEALTYPE_SPINE: Record<string, Concept[]> = {
  sponsor: [
    { id: "dt-credit", label: "Leverage & Credit", role: "capital-rotation", reason: "Buyout funded through leveraged-credit markets" },
    { id: "dt-funding", label: "Funding Markets", role: "capital-rotation", reason: "Debt syndication sets the financing clearing price" },
    { id: "dt-returns", label: "Sponsor Returns", role: "capital-rotation", reason: "Underwriting targets IRR via margin & multiple expansion" },
    { id: "dt-exit", label: "Exit Optionality", role: "second-order", reason: "Strategic sale / secondary / IPO paths ahead" },
  ],
  merger: [
    { id: "dt-antitrust", label: "Antitrust Review", role: "cross-sector", reason: "Horizontal overlap invites competition scrutiny" },
    { id: "dt-consol", label: "Sector Consolidation", role: "capital-rotation", reason: "Share concentrates among scale leaders" },
    { id: "dt-pricing", label: "Pricing Power", role: "capital-rotation", reason: "Reduced competition supports pricing" },
  ],
  hostile: [
    { id: "dt-defense", label: "Board Defense", role: "cross-sector", reason: "Poison-pill / staggered-board resistance" },
    { id: "dt-share", label: "Shareholder Pressure", role: "competitor", reason: "The bid appeals directly to holders" },
    { id: "dt-rivals", label: "Rival Bidders", role: "competitor", reason: "A contested process can draw counter-bids" },
    { id: "dt-premium", label: "Premium Re-rating", role: "capital-rotation", reason: "The bid resets takeover premia across peers" },
  ],
  activist: [
    { id: "dt-gov", label: "Governance Pressure", role: "competitor", reason: "Activist pushes for board & strategy change" },
    { id: "dt-review", label: "Strategic Review", role: "cross-sector", reason: "Portfolio reviewed for break-up value" },
    { id: "dt-breakup", label: "Break-up / Spin-off", role: "second-order", reason: "Sum-of-the-parts value unlock" },
    { id: "dt-value", label: "Value Realization", role: "capital-rotation", reason: "Re-rating toward intrinsic value" },
  ],
  crossborder: [
    { id: "dt-fx", label: "FX Exposure", role: "cross-sector", reason: "Cross-currency consideration & translation risk" },
    { id: "dt-cfius", label: "Regulators / CFIUS", role: "cross-sector", reason: "Foreign-investment & national-security review" },
    { id: "dt-natsec", label: "National Security", role: "cross-sector", reason: "Strategic-asset scrutiny can gate approval" },
    { id: "dt-access", label: "Market Access", role: "capital-rotation", reason: "Entry into a new geographic market" },
  ],
  strategic: [
    { id: "dt-integ", label: "Integration", role: "capital-rotation", reason: "Operating integration & execution risk" },
    { id: "dt-synergy", label: "Synergy Capture", role: "capital-rotation", reason: "Cost & revenue synergies underwrite the premium" },
  ],
};

const SECTOR_SPINE: Record<string, Concept[]> = {
  Technology: [
    { id: "sx-cloud", label: "Cloud & Compute", role: "capital-rotation", reason: "Compute demand scales with the platform" },
    { id: "sx-ai", label: "AI Infrastructure", role: "theme", reason: "AI buildout pulls infrastructure spend", themes: ["AI Infrastructure"] },
    { id: "sx-power", label: "Power Demand", role: "cross-sector", reason: "Data-center load lifts power & grid demand" },
  ],
  Healthcare: [
    { id: "sx-pipe", label: "Pipeline & Patents", role: "capital-rotation", reason: "Refills pipeline ahead of patent cliffs" },
    { id: "sx-fda", label: "FDA / Regulators", role: "cross-sector", reason: "Approval pathways gate value" },
    { id: "sx-cro", label: "CRO & Suppliers", role: "supplier", reason: "Trial & manufacturing suppliers gain visibility" },
  ],
  Energy: [
    { id: "sx-reserves", label: "Reserves & Output", role: "capital-rotation", reason: "Combined output reshapes supply" },
    { id: "sx-commod", label: "Commodity Prices", role: "cross-sector", reason: "Scale influences marginal pricing" },
    { id: "sx-mid", label: "Midstream", role: "supplier", reason: "Pipeline & logistics exposure" },
  ],
  Financials: [
    { id: "sx-creditc", label: "Credit Cycle", role: "capital-rotation", reason: "Combination shifts credit exposure" },
    { id: "sx-rates", label: "Rates", role: "cross-sector", reason: "Rate sensitivity drives the earnings base" },
  ],
  Industrials: [
    { id: "sx-backlog", label: "Order Backlog", role: "capital-rotation", reason: "Combined backlog & program access" },
    { id: "sx-auto", label: "Automation", role: "theme", reason: "Electrification & automation pull-through", themes: ["Industrial Automation"] },
  ],
  "Media & Telecom": [
    { id: "sx-content", label: "Content & Distribution", role: "capital-rotation", reason: "Bundling reshapes distribution economics" },
    { id: "sx-ads", label: "Advertising", role: "cross-sector", reason: "Ad inventory & targeting scale" },
  ],
  Consumer: [
    { id: "sx-brand", label: "Brand Portfolio", role: "capital-rotation", reason: "Scale across shelf & brand equity" },
    { id: "sx-channel", label: "Retail Channel", role: "supplier", reason: "Distribution & channel leverage" },
  ],
  "Real Estate": [
    { id: "sx-caprate", label: "Rates & Cap-Rates", role: "cross-sector", reason: "Financing cost drives valuations" },
    { id: "sx-occ", label: "Occupancy & Rents", role: "capital-rotation", reason: "Combined portfolio rent dynamics" },
  ],
  default: [
    { id: "sx-peer", label: "Peer Valuation", role: "capital-rotation", reason: "Comparable multiples mark to the deal" },
  ],
};

const TERMINAL: Concept[] = [
  { id: "tm-rotation", label: "Capital Rotation", role: "capital-rotation", reason: "Flows tilt toward the surviving platform" },
  { id: "tm-inst", label: "Institutional Positioning", role: "capital-rotation", reason: "Funds reposition around the new structure" },
  { id: "tm-future", label: "Future M&A", role: "second-order", reason: "The deal raises the strategic cost of standing still" },
];

// Institutional transmission themes for rumors / anonymous deals — never empty.
const INSTITUTIONAL: Concept[] = [
  { id: "in-reg", label: "Regulators", role: "cross-sector", reason: "Approval pathway shapes feasibility" },
  { id: "in-supply", label: "Supply Chain", role: "supplier", reason: "Upstream & downstream exposure" },
  { id: "in-macro", label: "Macro & Rates", role: "cross-sector", reason: "Rate backdrop sets the cost of capital" },
  { id: "in-fx", label: "FX", role: "cross-sector", reason: "Currency exposure on cross-border interest" },
];

function archetypeOf(deal: MADeal, intel: DealIntel): string {
  if (intel.txnType === "Hostile Bid") return "hostile";
  if (intel.themeTags.includes("Activist") || /activist/i.test(intel.rationale)) return "activist";
  if (intel.crossBorder) return "crossborder";
  if (intel.txnType === "Sponsor Buyout" || intel.txnType === "Take Private" || deal.peFirm) return "sponsor";
  if (intel.txnType === "Merger" || deal.dealType === "merger") return "merger";
  return "strategic";
}

/** Build the capital-transmission graph for a single deal.
 *  Treats the network as an INTELLIGENCE PRODUCT: it infers sector relationships,
 *  peers, suppliers, themes, narrative propagation, cross-border effects, capital
 *  rotation and historical precedents so an announced deal renders a meaningful
 *  network even when the headline names only a couple of entities. */
export function buildDealGraph(deal: MADeal, intel: DealIntel): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (n: GraphNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
  const link = (source: string, target: string, type: RelationType, weight: number, stage: number, reason?: string, themes?: string[]) => {
    if (seen.has(source) && seen.has(target)) edges.push({ source, target, type, weight, stage, reason, themes });
  };

  const centerId = "event";
  const eventLabel = intel.buyer && intel.target ? `${intel.buyer} → ${intel.target}` : deal.title.slice(0, 36);
  add({ id: centerId, label: eventLabel, kind: "event", role: "event", stage: 0, themes: intel.themeTags, reason: intel.rationale, confidence: intel.confidence.score, name: deal.title });

  // Chain a sequence of transmission concepts from a parent → a readable cause→effect path.
  const chain = (parent: string, concepts: Concept[], w0: number, stage0: number): string => {
    let prev = parent;
    concepts.forEach((c, i) => {
      add({ id: c.id, label: c.label, kind: "group", role: c.role, stage: stage0 + i, reason: c.reason, themes: c.themes, recenterable: !!c.themes });
      link(prev, c.id, c.role, Math.max(0.32, w0 - i * 0.05), stage0 + i, c.reason, c.themes);
      prev = c.id;
    });
    return prev;
  };

  // ── Direct participants ──
  if (intel.buyer) {
    const id = `acq:${intel.buyer}`;
    add({ id, label: intel.buyer, kind: "company", role: "acquirer", stage: 0, reason: "Acquiring party", confidence: intel.confidence.score, themes: intel.themeTags, crossBorder: intel.crossBorder, name: intel.buyer });
    link(centerId, id, "acquirer", 1, 0, "Acquirer");
  }
  if (intel.target) {
    const id = `tgt:${intel.target}`;
    add({ id, label: intel.target, kind: "company", role: "target", stage: 0, reason: "Acquisition target", confidence: intel.confidence.score, crossBorder: intel.crossBorder, name: intel.target });
    link(centerId, id, "target", 1, 0, "Target");
  }

  // ── 1. Deal-type transmission spine (the architecture signature) ──
  chain(centerId, DEALTYPE_SPINE[archetypeOf(deal, intel)], 0.72, 1);

  // ── 2. Sector hub + sector-specific transmission spine ──
  const resolved = resolveSectorRoles(deal.sector, intel.themeTags);
  const sectorKey = resolved?.sector ?? deal.sector;
  const sectorName = deal.sector === "Other" && resolved ? resolved.sector : deal.sector;
  const secId = `sector:${sectorName}`;
  add({ id: secId, label: sectorName, kind: "sector", role: "sector", stage: 1, reason: "Primary sector exposed to the transaction" });
  link(centerId, secId, "sector", 0.78, 1, "Primary sector");
  chain(secId, SECTOR_SPINE[sectorKey] ?? SECTOR_SPINE.default, 0.62, 2);

  // ── 3. Known companies hang off the cause node they react to ──
  const exclude = new Set([intel.buyer, intel.target, ...deal.entities].filter(Boolean).map(s => (s as string).toUpperCase()));
  const keep = (arr: string[]) => arr.filter(t => !exclude.has(t.toUpperCase()));
  const supGroup = intel.readThroughGroups.find(g => g.role === "Suppliers")?.tickers ?? [];
  const beneficiaries = intel.capitalTransmission.beneficiaries.length ? intel.capitalTransmission.beneficiaries : resolved ? keep(resolved.beneficiaries).slice(0, 3) : [];
  const competitors   = intel.capitalTransmission.casualties.length   ? intel.capitalTransmission.casualties   : resolved ? keep(resolved.competitors).slice(0, 3) : [];
  const suppliers     = supGroup.length ? supGroup : resolved ? keep(resolved.suppliers).slice(0, 3) : [];

  let rerateId = secId;
  if (beneficiaries.length) {
    rerateId = "c-rerate";
    add({ id: rerateId, label: "Sector Re-rating", kind: "group", role: "capital-rotation", stage: 2, reason: "Comparable valuations re-rate toward the transaction" });
    link(secId, rerateId, "capital-rotation", 0.66, 2, "Sector re-rating");
    beneficiaries.forEach((t, i) => {
      const id = `co:${t}`;
      add({ id, label: t, kind: "company", role: "beneficiary", stage: 3, reason: "Likely beneficiary of the sector re-rate", confidence: 70 - i * 3, beneficiaryScore: 80 - i * 7, themes: intel.themeTags, ...tickerFields(t) });
      link(rerateId, id, "beneficiary", 0.86 - i * 0.08, 3, "Beneficiary", intel.themeTags);
    });
  }
  if (competitors.length) {
    const compId = "c-compete";
    add({ id: compId, label: "Competitive Response", kind: "group", role: "competitor", stage: 2, reason: "Rivals face a newly-scaled competitor and may respond" });
    link(secId, compId, "competitor", 0.6, 2, "Competitive response");
    competitors.forEach((t, i) => {
      const id = `co:${t}`;
      add({ id, label: t, kind: "company", role: "competitor", stage: 3, reason: "Faces a newly-scaled competitor", confidence: 62 - i * 3, beneficiaryScore: 38 - i * 6, ...tickerFields(t) });
      link(compId, id, "competitor", 0.7 - i * 0.08, 3, "Competitor");
    });
  }
  if (suppliers.length) {
    const supId = "c-supply";
    add({ id: supId, label: "Supply Chain", kind: "group", role: "supplier", stage: 2, reason: "Upstream suppliers gain order visibility" });
    link(secId, supId, "supplier", 0.54, 2, "Supply chain");
    suppliers.forEach((t, i) => {
      const id = `co:${t}`;
      add({ id, label: t, kind: "company", role: "supplier", stage: 3, reason: "Upstream supplier gaining order visibility", confidence: 56 - i * 3, beneficiaryScore: 60 - i * 6, ...tickerFields(t) });
      link(supId, id, "supplier", 0.56 - i * 0.07, 3, "Supplier");
    });
  }

  // ── 4. Terminal transmission: Capital Rotation → Institutional Positioning → Future M&A ──
  chain(rerateId, TERMINAL, 0.5, 4);

  // ── 5. Historical precedents inform Future M&A ──
  const comps = intel.comparables.length ? intel.comparables : comparablesFor(sectorKey);
  comps.slice(0, 3).forEach((c, i) => {
    const id = `cmp:${c.acquirer}-${c.target}`;
    add({ id, label: `${c.acquirer}→${c.target}`, kind: "group", role: "second-order", stage: 5, name: `${c.acquirer} → ${c.target} · ${c.value} (${c.year})`, reason: `Historical precedent: ${c.acquirer} acquired ${c.target} (${c.value}, ${c.year})` });
    link(seen.has("tm-future") ? "tm-future" : centerId, id, "second-order", 0.4 - i * 0.05, 5, "Historical precedent");
  });

  // ── 6. Rumors / anonymous deals → institutional thematic transmission (never empty) ──
  if (!intel.buyer && !intel.target) {
    chain(centerId, INSTITUTIONAL, 0.5, 1);
  }

  return { id: `deal:${deal.id}`, centerId, title: "Capital Transmission Network", subtitle: eventLabel, nodes, edges };
}

/** Re-centre the network on a single company (sector-peer relationships). */
export function buildCompanyGraph(ticker: string): GraphModel | null {
  const info = tickerInfo(ticker);
  if (!info) return null;
  const peers = companyPeers(ticker);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (n: GraphNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
  const link = (s: string, t: string, type: RelationType, weight: number, stage: number, reason?: string) => {
    if (seen.has(s) && seen.has(t)) edges.push({ source: s, target: t, type, weight, stage, reason });
  };

  const centerId = `co:${ticker}`;
  add({ id: centerId, label: ticker, kind: "event", role: "event", stage: 0, name: info.name, ticker, sector: info.sector, exchange: info.exchange, isPublic: true, megaCap: MEGA.has(ticker.toUpperCase()), reason: "Network centred on this company" });

  const sectorName = peers?.sector ?? info.sector;
  const secId = `sector:${sectorName}`;
  add({ id: secId, label: sectorName, kind: "sector", role: "sector", stage: 1, reason: "Primary sector" });
  link(centerId, secId, "sector", 0.7, 1, "Sector");

  const bucket = (arr: string[] | undefined, role: RelationType, stage: number, reason: string, w0: number) =>
    (arr ?? []).forEach((t, i) => {
      const id = `co:${t}`;
      add({ id, label: t, kind: "company", role, stage, reason, confidence: 60 - i * 3, ...tickerFields(t) });
      link(secId, id, role, w0 - i * 0.07, stage, reason);
    });

  bucket(peers?.beneficiaries, "beneficiary", 1, "Sector peer / beneficiary", 0.82);
  bucket(peers?.competitors, "competitor", 2, "Direct competitor", 0.7);
  bucket(peers?.suppliers, "supplier", 2, "Supply-chain relationship", 0.58);
  bucket(peers?.secondOrder, "second-order", 3, "Second-order exposure", 0.44);

  return { id: `company:${ticker}`, centerId, title: "Capital Transmission Network", subtitle: info.name, nodes, edges };
}
