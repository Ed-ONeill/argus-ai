/**
 * lib/argusReasoning.ts — the Argus reasoning engine.
 *
 * Turns a single event (today: an M&A deal) into proprietary intelligence:
 * a narrative-propagation chain, a multi-axis signal profile, probabilistic
 * next-event predictions, and a historical-pattern memory — each with explicit
 * reasoning ("explain why"). Pure, deterministic, zero-LLM, the same
 * interpretive register Argus uses elsewhere. Domain-agnostic where possible;
 * the relationship graph below is the shared backbone meant to later power
 * themes, sectors, commodities, macro and policy — not just M&A.
 */

import type { MADeal } from "@/hooks/useMAIntelligence";
import type { DealIntel } from "@/lib/maIntelligence";

// ── 1 + 10. Relationship / narrative graph ─────────────────────────────────────
// Curated directed relationships between themes, sectors, commodities and macro.
// This is the Argus "world model": how influence propagates through the system.
export type NarrativeRelation = "drives" | "feeds" | "benefits" | "pressures" | "enables" | "constrains" | "competes";

export interface NarrativeLink { to: string; relation: NarrativeRelation; rationale: string; weight: number }

export const NARRATIVE_GRAPH: Record<string, NarrativeLink[]> = {
  "AI Infrastructure": [
    { to: "Data Centers",   relation: "drives",  rationale: "Compute scale-out requires new data-center capacity", weight: 0.93 },
    { to: "Power Demand",   relation: "drives",  rationale: "Training & inference clusters pull electricity load forward", weight: 0.9 },
    { to: "Semiconductors", relation: "feeds",   rationale: "Accelerators and HBM are the binding supply constraint", weight: 0.88 },
    { to: "Networking",     relation: "drives",  rationale: "East-west traffic scales optical and switching demand", weight: 0.74 },
  ],
  "Data Centers": [
    { to: "Power Demand",   relation: "drives",  rationale: "Data-center load is the marginal driver of grid stress", weight: 0.91 },
    { to: "Cloud Spending", relation: "feeds",   rationale: "Capacity underpins hyperscaler cloud growth", weight: 0.7 },
    { to: "Networking",     relation: "drives",  rationale: "Interconnect scales with the data-center footprint", weight: 0.7 },
  ],
  "Power Demand": [
    { to: "Utilities",            relation: "benefits", rationale: "Load growth lifts the regulated utility earnings base", weight: 0.85 },
    { to: "Nuclear",              relation: "enables",  rationale: "Carbon-free baseload becomes strategically valuable", weight: 0.7 },
    { to: "Electrical Equipment", relation: "drives",   rationale: "Grid, transformer and switchgear demand inflects", weight: 0.8 },
  ],
  "Utilities": [
    { to: "Electrical Equipment", relation: "drives", rationale: "Utility capex cycles into grid hardware", weight: 0.72 },
    { to: "Copper",               relation: "drives", rationale: "Grid build-out is copper-intensive", weight: 0.68 },
  ],
  "Nuclear": [
    { to: "Uranium",              relation: "drives", rationale: "Reactor restarts and new builds lift fuel demand", weight: 0.7 },
    { to: "Electrical Equipment", relation: "feeds",  rationale: "Plant build-out needs heavy electricals", weight: 0.5 },
  ],
  "Copper": [
    { to: "Electrical Equipment", relation: "feeds",  rationale: "Copper is the core input to wiring and motors", weight: 0.66 },
    { to: "Industrial Automation",relation: "enables",rationale: "Electrified plants scale automation spend", weight: 0.48 },
  ],
  "Electrical Equipment": [
    { to: "Industrial Automation", relation: "drives", rationale: "Electrification couples with factory automation", weight: 0.6 },
  ],
  "Industrial Automation": [
    { to: "Enterprise Software", relation: "feeds", rationale: "Automation generates industrial-software demand", weight: 0.5 },
    { to: "Semiconductors",      relation: "feeds", rationale: "Edge controllers and sensors pull silicon", weight: 0.45 },
  ],
  "Cloud Spending": [
    { to: "Enterprise Software", relation: "drives", rationale: "Cloud migration lifts SaaS consumption", weight: 0.75 },
    { to: "Cybersecurity",       relation: "drives", rationale: "Cloud attack surface expands security spend", weight: 0.7 },
  ],
  "Enterprise Software": [
    { to: "Cybersecurity", relation: "drives", rationale: "More software means more to secure", weight: 0.64 },
  ],
  "Cybersecurity": [
    { to: "Networking", relation: "feeds", rationale: "Security converges into network infrastructure", weight: 0.55 },
  ],
  "Semiconductors": [
    { to: "Data Centers", relation: "feeds", rationale: "Silicon enables the compute build-out", weight: 0.7 },
    { to: "Networking",   relation: "feeds", rationale: "Optical and switch silicon scale with traffic", weight: 0.55 },
  ],
  "Networking": [
    { to: "Data Centers", relation: "feeds", rationale: "Fabric upgrades inside the data center", weight: 0.5 },
  ],
  "Cloud Security": [
    { to: "Cybersecurity",       relation: "drives", rationale: "Cloud security is the leading edge of cyber spend", weight: 0.82 },
    { to: "Enterprise Software", relation: "competes",rationale: "Platform players absorb security budget", weight: 0.4 },
  ],
  "Energy Transition": [
    { to: "Copper",               relation: "drives",   rationale: "Renewables and EVs are copper-intensive", weight: 0.7 },
    { to: "Electrical Equipment", relation: "drives",   rationale: "Grid build-out for renewable interconnection", weight: 0.7 },
    { to: "Utilities",            relation: "benefits", rationale: "Transition capex grows the rate base", weight: 0.62 },
  ],
  "Energy Infrastructure": [
    { to: "Power Demand", relation: "feeds",    rationale: "Gas and LNG backstop firm power", weight: 0.55 },
    { to: "Utilities",    relation: "benefits", rationale: "Midstream supports utility fuel security", weight: 0.5 },
  ],
  "Semiconductor Sovereignty": [
    { to: "Semiconductors",       relation: "drives", rationale: "Reshoring concentrates demand on domestic fabs", weight: 0.8 },
    { to: "Electrical Equipment", relation: "feeds",  rationale: "Fab build-out needs heavy electricals and power", weight: 0.5 },
  ],
  "Defense Consolidation": [
    { to: "Semiconductors",       relation: "drives", rationale: "Trusted-silicon demand for defense systems", weight: 0.5 },
    { to: "Industrial Automation",relation: "feeds",  rationale: "Defense electronics pull automation", weight: 0.42 },
  ],
  "Healthcare Consolidation": [
    { to: "Enterprise Software", relation: "feeds",   rationale: "Health-IT integration follows scale deals", weight: 0.4 },
    { to: "Cloud Spending",      relation: "benefits",rationale: "Pipelines and trials migrate to the cloud", weight: 0.38 },
  ],
  "Private Capital": [
    { to: "Enterprise Software", relation: "benefits", rationale: "Take-private demand concentrates in software", weight: 0.5 },
    { to: "Interest Rates",      relation: "constrains",rationale: "Leverage cost gates sponsor underwriting", weight: 0.55 },
  ],
  "Interest Rates": [
    { to: "Private Capital", relation: "constrains", rationale: "Cost of leverage gates sponsor activity", weight: 0.6 },
    { to: "Utilities",       relation: "pressures",  rationale: "Rate-sensitive yield proxies de-rate", weight: 0.5 },
  ],
};

// Map a deal's theme tags / sector onto a graph seed node.
const SECTOR_SEED: Record<string, string> = {
  "Technology": "Cloud Spending", "Energy": "Energy Transition", "Industrials": "Industrial Automation",
  "Healthcare": "Healthcare Consolidation", "Financials": "Interest Rates", "Media & Telecom": "Networking",
  "Consumer": "Enterprise Software", "Real Estate": "Interest Rates",
};

/** Pick the narrative-graph seed for a deal (first themed match, else sector). */
export function seedThemeFor(deal: MADeal, intel: DealIntel): string | null {
  for (const t of intel.themeTags) if (NARRATIVE_GRAPH[t]) return t;
  const s = SECTOR_SEED[deal.sector];
  return s && NARRATIVE_GRAPH[s] ? s : null;
}

export interface NarrativeStep { from: string; to: string; relation: NarrativeRelation; rationale: string; weight: number }

/** Greedy highest-weight walk from a seed → an ordered propagation chain. */
export function narrativeChain(seed: string, maxDepth = 8): NarrativeStep[] {
  const out: NarrativeStep[] = [];
  const visited = new Set<string>([seed]);
  let node = seed;
  for (let i = 0; i < maxDepth; i++) {
    const links = (NARRATIVE_GRAPH[node] ?? []).filter(l => !visited.has(l.to)).sort((a, b) => b.weight - a.weight);
    const next = links[0];
    if (!next) break;
    out.push({ from: node, to: next.to, relation: next.relation, rationale: next.rationale, weight: next.weight });
    visited.add(next.to);
    node = next.to;
  }
  return out;
}

/** Direct neighbours of a node (for graph rendering). */
export function narrativeNeighbors(node: string): NarrativeLink[] { return NARRATIVE_GRAPH[node] ?? []; }

// ── 6. Signal scoring ──────────────────────────────────────────────────────────
const clamp = (n: number) => Math.max(2, Math.min(99, Math.round(n)));
const STRUCTURAL_THEMES = new Set(["AI Infrastructure", "Energy Transition", "Semiconductor Sovereignty", "Defense Consolidation", "Cloud Security", "Healthcare Consolidation", "Industrial Automation", "Energy Infrastructure"]);

export interface SignalScore { label: string; value: number; why: string }
export interface SignalProfile { scores: SignalScore[]; composite: number }

/** Seven-axis signal profile for an intelligence item — sortable, explainable. */
export function buildSignalProfile(deal: MADeal, intel: DealIntel): SignalProfile {
  const tierImportance = { headline: 95, major: 78, standard: 58, minor: 42 }[intel.tier];
  const chainLen = (() => { const s = seedThemeFor(deal, intel); return s ? narrativeChain(s).length : 0; })();
  const advisorCount = intel.advisors.banks.length + intel.advisors.legal.length;
  const structural = intel.themeTags.some(t => STRUCTURAL_THEMES.has(t));
  const impactBreadth = intel.marketImpact.winners.length + intel.marketImpact.losers.length + intel.marketImpact.followOn.length;

  const scores: SignalScore[] = [
    { label: "Novelty", value: clamp((intel.status === "Rumored" ? 80 : intel.status === "Negotiating" ? 66 : 48) + (intel.crossBorder ? 9 : 0) + (intel.competingBidders.length ? 8 : 0)),
      why: intel.status === "Rumored" ? "Early, unconfirmed signal — information edge is highest" : "Announced terms — partly priced, lower novelty" },
    { label: "Importance", value: clamp(tierImportance),
      why: `${intel.tier} significance tier by size and conviction` },
    { label: "Confidence", value: intel.confidence.score,
      why: `${intel.confidence.supports.length} supporting factors on file` },
    { label: "Market Impact", value: clamp(40 + impactBreadth * 5 + (intel.tier === "headline" ? 20 : intel.tier === "major" ? 10 : 0)),
      why: `${impactBreadth} read-through names across winners, losers and targets` },
    { label: "Propagation", value: clamp(34 + chainLen * 7 + intel.themeTags.length * 4),
      why: chainLen ? `Transmits ${chainLen} hops through the narrative graph` : "Limited onward propagation" },
    { label: "Duration", value: clamp((structural ? 74 : 48) + (intel.rationale.includes("Distressed") ? -16 : 0) + (intel.txnType === "Sponsor Buyout" ? 8 : 0)),
      why: structural ? "Anchored to a multi-year structural theme" : "Event-driven — shorter half-life" },
    { label: "Institutional Interest", value: clamp(40 + advisorCount * 8 + (intel.tier === "headline" ? 18 : intel.tier === "major" ? 9 : 0) + (deal.peFirm ? 10 : 0)),
      why: advisorCount ? `${advisorCount} named advisors engaged` : "Inferred from size and sponsor profile" },
  ];
  const composite = Math.round(scores.reduce((a, s) => a + s.value, 0) / scores.length);
  return { scores, composite };
}

// ── 8. Prediction layer ────────────────────────────────────────────────────────
export interface Prediction { kind: string; label: string; probability: number; basis: string }

/** Probabilistic next events — always framed as likelihoods, never certainty. */
export function buildPredictions(deal: MADeal, intel: DealIntel): Prediction[] {
  const out: Prediction[] = [];
  const consolidating = intel.txnType === "Merger" || /consolidat|scale/i.test(intel.rationale) || intel.themeTags.includes("Scale Acquisition");
  const big = intel.tier === "headline" || intel.tier === "major";
  const followOn = intel.marketImpact.followOn;
  const suppliers = intel.readThroughGroups.find(g => g.role === "Suppliers")?.tickers ?? [];
  const chain = (() => { const s = seedThemeFor(deal, intel); return s ? narrativeChain(s) : []; })();

  if (consolidating) out.push({ kind: "Consolidation", label: `Further ${deal.sector} consolidation within 2–3 quarters`,
    probability: clamp(52 + (big ? 16 : 0) + (intel.themeTags.length >= 2 ? 6 : 0)), basis: "A scale precedent in the sector raises the strategic cost of standing still" });

  if (big && (intel.txnType === "Merger" || intel.crossBorder)) out.push({ kind: "Regulatory", label: "Extended antitrust / regulatory review likely",
    probability: clamp(48 + (intel.crossBorder ? 14 : 0) + (intel.txnType === "Merger" ? 14 : 0)), basis: intel.crossBorder ? "Cross-border structure invites multi-jurisdiction and national-security review" : "Horizontal overlap at this size draws close competition scrutiny" });

  if (followOn.length) out.push({ kind: "Targets", label: `${followOn.slice(0, 3).join(", ")} screen as next-target candidates`,
    probability: clamp(40 + followOn.length * 6 + (consolidating ? 8 : 0)), basis: "Sub-scale peers in a consolidating field re-rate on takeover optionality" });

  if (consolidating && intel.capitalTransmission.casualties.length) out.push({ kind: "Activist", label: `Sub-scale ${deal.sector} names face rising activist pressure`,
    probability: clamp(38 + (big ? 10 : 0)), basis: "The valuation gap widens as scale leaders pull ahead, attracting activists" });

  if (suppliers.length) out.push({ kind: "Suppliers", label: `${suppliers.slice(0, 2).join(", ")} positioned to benefit from order flow`,
    probability: clamp(44 + suppliers.length * 5), basis: "Upstream exposure to the combined entity's capex and integration spend" });

  if (chain.length) out.push({ kind: "Propagation", label: `Capital likely rotates next into ${chain[0].to}`,
    probability: clamp(40 + Math.round(chain[0].weight * 30)), basis: chain[0].rationale });

  return out.sort((a, b) => b.probability - a.probability).slice(0, 5);
}

// ── 7 + 11. Relationship memory / historical pattern ───────────────────────────
export interface HistoricalPattern { chain: string[]; note: string }

/** "This type of event has historically propagated into …" — built from the
 *  narrative graph, framed as remembered precedent. */
export function historicalPattern(deal: MADeal, intel: DealIntel): HistoricalPattern | null {
  const seed = seedThemeFor(deal, intel);
  if (!seed) return null;
  const steps = narrativeChain(seed, 5);
  if (steps.length === 0) return null;
  const chain = [seed, ...steps.map(s => s.to)];
  return { chain, note: `Past ${seed} catalysts have propagated through ${chain.slice(1, 4).join(" → ")} on comparable horizons` };
}
