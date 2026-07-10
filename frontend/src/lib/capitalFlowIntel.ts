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

const STATUS_VALUE: Record<FlowStatus, number> = {
  accelerating: 3, expanding: 2, neutral: 0, tightening: -1, contracting: -2, blocked: -3,
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
}
export function flowPressure(layers: CapitalFlowLayer[]): FlowPressure {
  const sum    = layers.reduce((s, l) => s + STATUS_VALUE[l.status], 0); // −24..+24
  const score  = Math.round(((sum + 24) / 48) * 100);
  const open   = layers.filter(l => STATUS_VALUE[l.status] > 0).length;
  const closed = layers.filter(l => STATUS_VALUE[l.status] < 0).length;
  const label  = score >= 60 ? "FLOWING" : score <= 40 ? "CONSTRAINED" : "MIXED";
  const color  = score >= 60 ? "#22c55e" : score <= 40 ? "#ef4444" : "#fbbf24";
  const trend  = open > closed ? "improving" : closed > open ? "deteriorating" : "stable";
  return {
    score, label, color, trend,
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
