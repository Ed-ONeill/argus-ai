// lib/marketRotation.ts — pure rotation MEASUREMENT for the Market surface (Surface #4).
//
// Leadership is RELATIVE-FIRST; absolute return is supporting context only. "direction" is
// the change in RELATIVE leadership over the window (is a block gaining or losing leadership),
// NOT whether its own price rose or fell. Two families:
//
//   • Inside Stocks — a sector's leadership is its excess return vs the benchmark (SPY);
//     direction is whether that excess is improving (second half of the window vs first).
//   • Whole Market — a deterministic NORMALIZED cross-asset measure: each asset's
//     risk-adjusted return (return / realized volatility) standardized (z-score) across the
//     asset set, so a structurally high-volatility asset cannot dominate merely by moving a
//     lot. direction is the change in that normalized leadership across the window's halves.
//
// This is what makes it a rotation map, not a heatmap: a block can rise in absolute terms
// while LOSING leadership, and fall in absolute terms while GAINING it. Pure + deterministic
// (no clocks, no network); operates on already-windowed PricePoint[].

import type { PricePoint } from "@/lib/platform/types/prices";

export type Direction = "rising" | "falling" | "flat";

export interface Leadership {
  relStrength: number;   // leadership POSITION (sector: % excess vs SPY; whole-market: cross-asset z-score)
  direction: Direction;  // change in leadership over the window (NOT absolute price direction)
  leadDelta: number;     // signed magnitude of that leadership change (second half - first half)
  absPct: number;        // absolute % return over the window — SUPPORTING context only
  absent: boolean;       // per-block degradation: series missing/insufficient
}

const ABSENT: Leadership = { relStrength: 0, direction: "flat", leadDelta: 0, absPct: 0, absent: true };

// direction thresholds — a move must clear a small band to count as rising/falling.
const EPS_Z = 0.05;        // whole-market: z-score units
const EPS_EXCESS = 0.001;  // inside-stocks: 0.1% excess
const EPS_VOL = 1e-4;      // volatility floor, prevents risk-adjusted blow-ups on tiny windows

const adj = (pts: PricePoint[]): number[] => pts.map((p) => p.adjClose).filter((v) => Number.isFinite(v) && v > 0);
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
function ret(vals: number[]): number | null {
  return vals.length >= 2 && vals[0] > 0 ? vals[vals.length - 1] / vals[0] - 1 : null;
}
function logRets(vals: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < vals.length; i++) r.push(Math.log(vals[i] / vals[i - 1]));
  return r;
}
// Halves share the midpoint so each half's return is contiguous.
const firstHalf = (v: number[]): number[] => v.slice(0, Math.floor((v.length - 1) / 2) + 1);
const secondHalf = (v: number[]): number[] => v.slice(Math.floor((v.length - 1) / 2));

// Risk-adjusted return: return per unit of realized volatility. Dividing by the asset's own
// volatility is what stops a high-vol asset from dominating purely because it moves a lot.
function riskAdj(vals: number[]): number | null {
  const r = ret(vals);
  if (r == null) return null;
  return r / Math.max(stdev(logRets(vals)), EPS_VOL);
}
// Cross-sectional z-score; absent entries stay null and are excluded from the mean/std.
function crossZ(vals: (number | null)[]): (number | null)[] {
  const present = vals.filter((v): v is number => v != null && Number.isFinite(v));
  if (present.length === 0) return vals.map(() => null);
  const m = mean(present);
  const sd = stdev(present);
  return vals.map((v) => (v == null || !Number.isFinite(v) ? null : sd < 1e-12 ? 0 : (v - m) / sd));
}
const dir = (x: number, eps: number): Direction => (x > eps ? "rising" : x < -eps ? "falling" : "flat");

/** Inside Stocks — leadership relative to the benchmark (SPY). */
export function measureSector(sectorPts: PricePoint[] | null, benchPts: PricePoint[] | null): Leadership {
  const s = sectorPts ? adj(sectorPts) : null;
  const b = benchPts ? adj(benchPts) : null;
  if (!s || !b || s.length < 3 || b.length < 3) return ABSENT;
  const relStrength = ((ret(s) ?? 0) - (ret(b) ?? 0)) * 100;                      // full-window excess %, the POSITION
  const excess1 = (ret(firstHalf(s)) ?? 0) - (ret(firstHalf(b)) ?? 0);
  const excess2 = (ret(secondHalf(s)) ?? 0) - (ret(secondHalf(b)) ?? 0);
  const leadDelta = excess2 - excess1;                                            // change in relative leadership
  return { relStrength, direction: dir(leadDelta, EPS_EXCESS), leadDelta, absPct: (ret(s) ?? 0) * 100, absent: false };
}

/** Whole Market — normalized cross-asset leadership; input aligned to the block order. */
export function measureCrossAsset(seriesPts: (PricePoint[] | null)[]): Leadership[] {
  const vals = seriesPts.map((pts) => {
    if (!pts) return null;
    const a = adj(pts);
    return a.length >= 3 ? a : null;
  });
  const zFull = crossZ(vals.map((v) => (v ? riskAdj(v) : null)));
  const z1 = crossZ(vals.map((v) => (v ? riskAdj(firstHalf(v)) : null)));
  const z2 = crossZ(vals.map((v) => (v ? riskAdj(secondHalf(v)) : null)));
  return vals.map((v, i) => {
    if (!v) return ABSENT;
    const leadDelta = (z2[i] ?? 0) - (z1[i] ?? 0);                                // change in NORMALIZED leadership
    return { relStrength: zFull[i] ?? 0, direction: dir(leadDelta, EPS_Z), leadDelta, absPct: (ret(v) ?? 0) * 100, absent: false };
  });
}
