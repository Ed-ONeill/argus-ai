/**
 * lib/maTransmissionGraph.ts — M&A adapter for the generic graph engine.
 *
 * Translates a DealIntel (and any company the user re-centres on) into the
 * domain-agnostic GraphModel consumed by components/graph/NetworkGraph. All
 * M&A-specific mapping lives here; the engine itself knows nothing about deals.
 */

import type { MADeal } from "@/hooks/useMAIntelligence";
import { tickerInfo, companyPeers, resolveSectorRoles, comparablesFor, type DealIntel } from "@/lib/maIntelligence";
import { seedThemeFor, narrativeChain } from "@/lib/argusReasoning";
import type { GraphModel, GraphNode, GraphEdge, RelationType } from "@/lib/graph/types";

// Rough mega-cap set for the "mega-cap" filter (illustrative, not exhaustive).
const MEGA = new Set(["MSFT", "AAPL", "NVDA", "GOOGL", "META", "AMZN", "AVGO", "LLY", "JPM", "XOM", "TSM", "ORCL", "UNH", "V", "MA", "COST", "WMT", "CVX"]);

function tickerFields(t: string): Partial<GraphNode> {
  const info = tickerInfo(t);
  return { ticker: t, name: info?.name, sector: info?.sector, exchange: info?.exchange, isPublic: !!info, megaCap: MEGA.has(t.toUpperCase()), recenterable: !!info };
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

  if (intel.buyer) {
    const id = `acq:${intel.buyer}`;
    add({ id, label: intel.buyer, kind: "company", role: "acquirer", stage: 0, reason: "Acquiring party", confidence: intel.confidence.score, themes: intel.themeTags, crossBorder: intel.crossBorder, recenterable: false, name: intel.buyer });
    link(centerId, id, "acquirer", 1, 0, "Acquirer");
  }
  if (intel.target) {
    const id = `tgt:${intel.target}`;
    add({ id, label: intel.target, kind: "company", role: "target", stage: 0, reason: "Acquisition target", confidence: intel.confidence.score, crossBorder: intel.crossBorder, recenterable: false, name: intel.target });
    link(centerId, id, "target", 1, 0, "Target");
  }

  // Resolve sector relationships by inference: literal sector → theme-implied sector.
  const resolved = resolveSectorRoles(deal.sector, intel.themeTags);
  const sectorName = deal.sector === "Other" && resolved ? resolved.sector : deal.sector;
  const secId = `sector:${sectorName}`;
  add({ id: secId, label: sectorName, kind: "sector", role: "sector", stage: 1, reason: "Primary sector exposed to the transaction" });
  link(centerId, secId, "sector", 0.7, 1, "Primary sector");

  const exclude = new Set([intel.buyer, intel.target, ...deal.entities].filter(Boolean).map(s => (s as string).toUpperCase()));
  const keep = (arr: string[]) => arr.filter(t => !exclude.has(t.toUpperCase()));
  // Prefer the deal's own extracted read-through; fall back to inferred sector peers.
  const supGroup = intel.readThroughGroups.find(g => g.role === "Suppliers")?.tickers ?? [];
  const secondGroup = intel.readThroughGroups.find(g => g.role === "Second-order")?.tickers ?? [];
  const beneficiaries = intel.capitalTransmission.beneficiaries.length ? intel.capitalTransmission.beneficiaries : resolved ? keep(resolved.beneficiaries).slice(0, 3) : [];
  const competitors   = intel.capitalTransmission.casualties.length   ? intel.capitalTransmission.casualties   : resolved ? keep(resolved.competitors).slice(0, 3) : [];
  const suppliers     = supGroup.length   ? supGroup   : resolved ? keep(resolved.suppliers).slice(0, 3) : [];
  const secondOrder   = secondGroup.length ? secondGroup : resolved ? keep(resolved.secondOrder).slice(0, 2) : [];

  beneficiaries.forEach((t, i) => {
    const id = `co:${t}`;
    add({ id, label: t, kind: "company", role: "beneficiary", stage: 1, reason: "Likely beneficiary of the sector re-rate", confidence: 70 - i * 3, beneficiaryScore: 80 - i * 7, themes: intel.themeTags, ...tickerFields(t) });
    link(secId, id, "beneficiary", 0.88 - i * 0.08, 1, "Beneficiary", intel.themeTags);
  });
  competitors.forEach((t, i) => {
    const id = `co:${t}`;
    add({ id, label: t, kind: "company", role: "competitor", stage: 2, reason: "Faces a newly-scaled competitor", confidence: 62 - i * 3, beneficiaryScore: 38 - i * 6, ...tickerFields(t) });
    link(secId, id, "competitor", 0.72 - i * 0.08, 2, "Competitor");
  });
  suppliers.forEach((t, i) => {
    const id = `co:${t}`;
    add({ id, label: t, kind: "company", role: "supplier", stage: 2, reason: "Upstream supplier gaining order visibility", confidence: 56 - i * 3, beneficiaryScore: 60 - i * 6, ...tickerFields(t) });
    link(secId, id, "supplier", 0.6 - i * 0.07, 2, "Supplier");
  });
  secondOrder.forEach((t, i) => {
    const id = `co:${t}`;
    add({ id, label: t, kind: "company", role: "second-order", stage: 3, reason: "Second-order read-through", confidence: 48 - i * 3, beneficiaryScore: 52 - i * 6, ...tickerFields(t) });
    link(secId, id, "second-order", 0.45 - i * 0.06, 3, "Second-order");
  });

  // When no named peers can be inferred (e.g. an unclassified sector), still render
  // the capital-rotation path so any named deal produces a meaningful network.
  if (beneficiaries.length === 0 && competitors.length === 0) {
    const lane: [string, string, string][] = [
      ["rot1", "Valuation reset", "The transaction sets a fresh valuation marker for the space"],
      ["rot2", "Scale leaders re-rate", "Larger operators re-rate on consolidation optionality"],
      ["rot3", "Sub-scale peers in play", "Smaller peers screen as the next acquisition targets"],
    ];
    let prev = secId;
    lane.forEach(([id, label, reason], i) => {
      add({ id, label, kind: "group", role: "capital-rotation", stage: i + 1, reason });
      link(prev, id, "capital-rotation", 0.55 - i * 0.08, i + 1, "Capital rotation");
      prev = id;
    });
  }

  // Themes + narrative propagation chain (capital-rotation paths between narratives).
  intel.themeTags.forEach(th => {
    const id = `theme:${th}`;
    add({ id, label: th, kind: "theme", role: "theme", stage: 4, reason: "Active narrative connected to the deal — open to trace its propagation", themes: [th], recenterable: true });
    link(centerId, id, "theme", 0.5, 4, "Theme", [th]);
  });
  const seed = seedThemeFor(deal, intel);
  if (seed) {
    const seedId = `theme:${seed}`;
    if (!seen.has(seedId)) { add({ id: seedId, label: seed, kind: "theme", role: "theme", stage: 4, reason: "Narrative seed", themes: [seed], recenterable: true }); link(centerId, seedId, "theme", 0.5, 4, "Theme", [seed]); }
    let prevId = seedId;
    for (const step of narrativeChain(seed, 4)) {
      const id = `theme:${step.to}`;
      add({ id, label: step.to, kind: "theme", role: "theme", stage: 4, reason: `${step.relation} · ${step.rationale}`, themes: [step.to], recenterable: true });
      link(prevId, id, "capital-rotation", Math.max(0.3, step.weight * 0.6), 4, `Capital rotation: ${step.rationale}`, [step.to]);
      prevId = id;
    }
  }

  // Cross-border geography effect.
  if (intel.crossBorder) {
    add({ id: "xborder", label: intel.country ? `${intel.country} · X-border` : "Cross-border", kind: "group", role: "cross-sector", stage: 2, crossBorder: true,
      reason: intel.country ? `${intel.country} cross-border exposure — FX, foreign-investment review and repatriation` : "Cross-border structure adds review and FX considerations" });
    link(centerId, "xborder", "cross-sector", 0.45, 2, "Cross-border effect");
  }
  // Cross-sector read-through effect.
  const xeff = intel.capitalTransmission.effects.find(e => e.label === "Cross-Sector");
  if (xeff) {
    add({ id: "xsector", label: "Cross-sector", kind: "group", role: "cross-sector", stage: 4, reason: xeff.text });
    link(secId, "xsector", "cross-sector", 0.4, 4, xeff.text);
  }

  // Historical precedents (comparable transactions) as second-order context.
  const comps = intel.comparables.length ? intel.comparables : comparablesFor(resolved?.sector ?? deal.sector);
  comps.slice(0, 3).forEach((c, i) => {
    const id = `cmp:${c.acquirer}-${c.target}`;
    add({ id, label: `${c.acquirer}→${c.target}`, kind: "group", role: "second-order", stage: 3, name: `${c.acquirer} → ${c.target} · ${c.value} (${c.year})`, reason: `Historical precedent: ${c.acquirer} acquired ${c.target} (${c.value}, ${c.year})` });
    link(centerId, id, "second-order", 0.38 - i * 0.05, 3, "Historical precedent");
  });

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
