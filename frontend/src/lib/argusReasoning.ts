/**
 * lib/argusReasoning.ts, the Argus reasoning engine.
 *
 * Turns a single event (today: an M&A deal) into proprietary intelligence:
 * a narrative-propagation chain, a multi-axis signal profile, probabilistic
 * next-event predictions, and a historical-pattern memory, each with explicit
 * reasoning ("explain why"). Pure, deterministic, zero-LLM, the same
 * interpretive register Argus uses elsewhere. Domain-agnostic where possible;
 * the relationship graph below is the shared backbone meant to later power
 * themes, sectors, commodities, macro and policy, not just M&A.
 */

import type { MADeal } from "@/hooks/useMAIntelligence";
import type { DealIntel } from "@/lib/maIntelligence";

// ── 1 + 10. Relationship / narrative graph ─────────────────────────────────────
// Curated directed relationships between themes, sectors, commodities and macro.
// This is the Argus "world model": how influence propagates through the system.
export type NarrativeRelation = "drives" | "feeds" | "benefits" | "pressures" | "enables" | "constrains" | "competes";

export interface NarrativeLink { to: string; relation: NarrativeRelation; rationale: string; weight: number }

// NARRATIVE_GRAPH / seedThemeFor / narrativeChain / narrativeNeighbors:
// DELETED (Phase 2.6, D3). Curated narrative propagation may not render as
// intelligence; recorded graph edges power the narrative network now.

// ── 6. Signal scoring ──────────────────────────────────────────────────────────
const clamp = (n: number) => Math.max(2, Math.min(99, Math.round(n)));
const STRUCTURAL_THEMES = new Set(["AI Infrastructure", "Energy Transition", "Semiconductor Sovereignty", "Defense Consolidation", "Cloud Security", "Healthcare Consolidation", "Industrial Automation", "Energy Infrastructure"]);

export interface SignalScore { label: string; value: number; why: string }
export interface SignalProfile { scores: SignalScore[]; composite: number }

/** Seven-axis signal profile for an intelligence item, sortable, explainable. */
export function buildSignalProfile(deal: MADeal, intel: DealIntel): SignalProfile {
  // Phase 2.6: coverage/reporting quality over extracted FACTS only - the
  // deleted marketImpact/confidence/narrative-chain inputs are gone.
  const tierImportance = { headline: 95, major: 78, standard: 58, minor: 42 }[intel.tier];
  const advisorCount = intel.advisors.banks.length + intel.advisors.legal.length;
  const structural = intel.themeTags.some(t => STRUCTURAL_THEMES.has(t));
  const factCount = [intel.dealValue, intel.buyer, intel.target, intel.financing, intel.premium, intel.synergies, intel.country].filter(Boolean).length + intel.economics.length;

  const scores: SignalScore[] = [
    { label: "Novelty", value: clamp((intel.status === "Rumored" ? 80 : intel.status === "Negotiating" ? 66 : 48) + (intel.crossBorder ? 9 : 0) + (intel.competingBidders.length ? 8 : 0)),
      why: intel.status === "Rumored" ? "Early, unconfirmed signal, information edge is highest" : "Announced terms, partly priced, lower novelty" },
    { label: "Importance", value: clamp(tierImportance),
      why: `${intel.tier} significance tier by size and conviction` },
    { label: "Fact Density", value: clamp(30 + factCount * 8),
      why: `${factCount} extracted transaction facts on file` },
    { label: "Theme Links", value: clamp(34 + intel.themeTags.length * 12),
      why: `${intel.themeTags.length} derived theme tag${intel.themeTags.length === 1 ? "" : "s"}` },
    { label: "Duration", value: clamp((structural ? 74 : 48) + (intel.rationale.includes("Distressed") ? -16 : 0) + (intel.txnType === "Sponsor Buyout" ? 8 : 0)),
      why: structural ? "Anchored to a multi-year structural theme" : "Event-driven, shorter half-life" },
    { label: "Institutional Interest", value: clamp(40 + advisorCount * 8 + (intel.tier === "headline" ? 18 : intel.tier === "major" ? 9 : 0) + (deal.peFirm ? 10 : 0)),
      why: advisorCount ? `${advisorCount} named advisors engaged` : "Inferred from size and sponsor profile" },
  ];
  const composite = Math.round(scores.reduce((a, s) => a + s.value, 0) / scores.length);
  return { scores, composite };
}

// buildPredictions: DELETED (Phase 2.6, D3) - page-local probability
// estimates are not intelligence; forward views come from the prediction
// engine via shared profiles.

// historicalPattern: DELETED (Phase 2.6, D3) - curated "memory" chains are
// not recorded history; real memory lives in ThemeMemory / the memory engine.
