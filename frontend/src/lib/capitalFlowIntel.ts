/**
 * lib/capitalFlowIntel.ts — institutional read of the capital-flow stack.
 *
 * Turns the 8-layer transmission chain + live theme intelligence into the answers
 * an allocator wants: where capital is going / leaving, today's biggest flow, the
 * health pressure score, flow-strength metrics, a rotation radar, and concise
 * institutional takeaways. Deterministic — every figure derives from a real field
 * (layer status, theme momentum_delta / confidence / related_assets), nothing is
 * invented. Dependency-free (only types) so it adds no weight to the page.
 */

import type { CapitalFlowLayer, FlowStatus } from "./capitalFlow";
import { directionalLayers, measuredCoverage } from "./capitalFlow";

const STATUS_VALUE: Record<FlowStatus, number> = {
  accelerating: 3, expanding: 2, neutral: 0, tightening: -1, contracting: -2, blocked: -3,
  // RC2-C2b: observational layers never reach the scorer (directionalLayers
  // filters them out first). The 0 is a belt-and-braces value, not the mechanism.
  observational: 0,
  // RC2-C1: an unmeasured layer contributes nothing. Numerically this matches
  // `neutral`, but the meaning differs: neutral is a measured reading of no
  // direction, unmeasured is an absence. It must not push the pressure score in
  // either direction, and it is correctly excluded from the open/closed counts
  // below, which test for a positive/negative value rather than for `!== neutral`.
  unmeasured: 0,
};


export function flowColor(v: number): string {
  if (v >= 10) return "#22c55e";
  if (v > 0)   return "#86efac";
  if (v === 0) return "#fbbf24";
  if (v > -10) return "#f97316";
  return "#ef4444";
}

// ── 1 · Capital pressure ──────────────────────────────────────────────────────
export interface FlowPressure {
  score: number; label: string; color: string;
  trend: "improving" | "deteriorating" | "stable"; trendLabel: string; liquidity: string;
  /**
   * RC2-C2a: false when fewer than a majority of layers are measured. The score is
   * still computed over the measured layers and kept for internal use, but NO
   * directional verdict may be rendered - consumers must show the insufficient
   * state instead. `label`, `trendLabel` and `liquidity` already carry
   * non-directional copy in that case; this flag exists so a consumer cannot
   * accidentally style or reason as though a verdict were present.
   */
  sufficient: boolean;
  measured: number;
  total: number;
}
/**
 * RC2-C2a: obeys the same `measuredCoverage` contract as `buildSummary`, so the
 * pressure meter and the summary can never disagree about whether a statement is
 * warranted. Previously only the summary had the rule, so a 4-of-8 chain rendered
 * "not enough coverage to characterise conditions" directly above a confident
 * "83 · FLOWING · Liquidity Expanding".
 *
 * The score formula is UNCHANGED for sufficiently covered cases.
 */
export function flowPressure(layers: CapitalFlowLayer[]): FlowPressure {
  // RC2-C1: unmeasured layers are EXCLUDED from the score, numerator and
  // denominator alike. Counting one as 0 would have been arithmetically identical
  // to counting it as measured-neutral, which would launder an absence into
  // "MIXED" / "Liquidity Stable" — a market-state assertion built partly on data
  // we do not have. Scoring only the measured layers keeps the meter a statement
  // about what was actually measured.
  // RC2-C2b: score over layers with DIRECTIONAL authority only. Observational
  // layers are measured (they count toward coverage below) but must not sit in
  // this denominator, or a feed-coverage count would drag the score to the middle.
  const scored = directionalLayers(layers);
  const span   = scored.length * 3;                        // ±3 per scored layer
  const sum    = scored.reduce((s, l) => s + STATUS_VALUE[l.status], 0);
  const score  = span > 0 ? Math.round(((sum + span) / (span * 2)) * 100) : 50;
  const open   = scored.filter(l => STATUS_VALUE[l.status] > 0).length;
  const closed = scored.filter(l => STATUS_VALUE[l.status] < 0).length;
  const label  = score >= 60 ? "FLOWING" : score <= 40 ? "CONSTRAINED" : "MIXED";
  const color  = score >= 60 ? "#22c55e" : score <= 40 ? "#ef4444" : "#fbbf24";
  const trend  = open > closed ? "improving" : closed > open ? "deteriorating" : "stable";

  const { measured, total, sufficient } = measuredCoverage(layers);
  if (!sufficient) {
    // Score is preserved (it is a true reading of the measured layers) but every
    // user-facing field states the absence. No FLOWING/CONSTRAINED, no liquidity
    // direction, no improving/deteriorating arrow.
    return {
      score, measured, total, sufficient: false,
      label: "NOT MEASURED",
      color: "#64748b",
      trend: "stable",
      trendLabel: "Coverage insufficient",
      liquidity: `${measured} of ${total} layers measured`,
    };
  }

  return {
    score, measured, total, sufficient: true,
    label, color, trend,
    trendLabel: trend === "improving" ? "Improving" : trend === "deteriorating" ? "Deteriorating" : "Holding",
    liquidity:  score >= 60 ? "Liquidity Expanding" : score <= 40 ? "Liquidity Contracting" : "Liquidity Stable",
  };
}

// ── Retired (Phase 2.6, D10) ──────────────────────────────────────────────────
// capitalDestinations / capitalSources (keyword-scored rotation), biggestFlow
// (+ its keyword invalidation rules), flowStrength composites, flowTimeline,
// radarAxes, and the "smart money" takeaways are DELETED. Where capital is
// moving, why, winners, and invalidations are SHARED reads now
// (lib/maIntel.buildPrivateIntel over The Read / profiles / riskRead / the
// canonical ledger). What remains above is the factual pressure meter over
// the transmission-layer statuses (derived from real regime/yield/deal-count
// inputs and labeled as a current-state read).
