// platform/chart/geometry.ts — the deterministic, pure heart of ArgusChart.
//
// No React, no canvas, no time, no randomness: identical inputs → identical outputs, so
// coordinates are testable and Narrative Playback (asOf) is a pure truncation. HONESTY is
// enforced here: we read only real PriceSeries values (adjusted close by default), never
// synthesize or interpolate a missing bar, and drop malformed points deterministically. A
// series with no valid points yields [] so the component renders honest absence.

import type { PriceSeries } from "@/lib/platform/types/prices";
import type {
  AsOf,
  ChartDimensions,
  ChartExtent,
  DisplayPoint,
  DownsampleConfig,
  ProjectedPoint,
} from "./types";

/** True when v is a real, finite, plottable number. */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** A YYYY-MM-DD (or longer ISO) date string is required — no fabricated timestamps. */
function isDateString(t: unknown): t is string {
  return typeof t === "string" && t.length >= 10;
}

/**
 * Extract the plottable points from a canonical series.
 *  - uses adjusted close by default (`useRaw` selects raw close),
 *  - preserves the series' oldest→newest order (no re-sorting, no interpolation),
 *  - drops malformed points deterministically (bad value or bad date),
 *  - truncates to `asOf` (inclusive) so future bars never appear (playback-safe).
 * Real gaps between non-consecutive dates remain gaps: absent bars are simply absent.
 */
export function toDisplayPoints(
  series: PriceSeries | null | undefined,
  opts: { asOf?: AsOf; useRaw?: boolean } = {},
): DisplayPoint[] {
  if (!series || !Array.isArray(series.points)) return [];
  const cutoff = opts.asOf ? opts.asOf.slice(0, 10) : null;   // compare on the date part
  const out: DisplayPoint[] = [];
  for (let i = 0; i < series.points.length; i++) {
    const p = series.points[i];
    if (!p || !isDateString(p.t)) continue;                    // malformed → excluded
    const v = opts.useRaw ? p.c : p.adjClose;
    if (!isFiniteNumber(v)) continue;                          // malformed → excluded
    if (cutoff && p.t.slice(0, 10) > cutoff) continue;         // future → truncated
    out.push({ t: p.t, v, i });
  }
  return out;
}

/** Min/max/first/last of the plotted values. Null when there is nothing to plot. */
export function computeExtent(points: DisplayPoint[]): ChartExtent | null {
  if (points.length === 0) return null;
  let min = points[0].v;
  let max = points[0].v;
  for (const p of points) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  return { min, max, first: points[0].v, last: points[points.length - 1].v };
}

/**
 * Largest-Triangle-Three-Buckets downsampling — deterministic, endpoint-preserving.
 * Activates only when the point count EXCEEDS `cfg.threshold`; otherwise the input is
 * returned unchanged. `nth` is a cheap fallback strategy. Both keep the first and last
 * real bars so the range endpoints are never distorted.
 */
export function downsample(points: DisplayPoint[], cfg: DownsampleConfig): DisplayPoint[] {
  if (cfg.strategy === "none") return points;
  if (points.length <= cfg.threshold) return points;      // activation threshold
  const target = Math.max(2, Math.min(cfg.target, points.length));
  if (target >= points.length) return points;

  if (cfg.strategy === "nth") {
    const step = (points.length - 1) / (target - 1);
    const out: DisplayPoint[] = [];
    for (let k = 0; k < target - 1; k++) out.push(points[Math.round(k * step)]);
    out.push(points[points.length - 1]);
    return out;
  }

  // LTTB.
  const sampled: DisplayPoint[] = [points[0]];
  const bucketSize = (points.length - 2) / (target - 2);
  let a = 0;   // index of the last chosen point
  for (let i = 0; i < target - 2; i++) {
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, points.length);
    // average of the NEXT bucket (the triangle's far vertex)
    let avgX = 0;
    let avgY = 0;
    const avgStart = Math.floor((i + 2) * bucketSize) + 1;
    const avgEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, points.length);
    const avgCount = Math.max(1, avgEnd - avgStart);
    for (let j = avgStart; j < avgEnd; j++) {
      avgX += points[j] ? points[j].i : points[points.length - 1].i;
      avgY += points[j] ? points[j].v : points[points.length - 1].v;
    }
    avgX /= avgCount;
    avgY /= avgCount;
    // pick the point in this bucket forming the largest triangle with (a, next avg)
    let best = rangeStart;
    let bestArea = -1;
    const ax = points[a].i;
    const ay = points[a].v;
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs((ax - avgX) * (points[j].v - ay) - (ax - points[j].i) * (avgY - ay));
      if (area > bestArea) {
        bestArea = area;
        best = j;
      }
    }
    sampled.push(points[best]);
    a = best;
  }
  sampled.push(points[points.length - 1]);
  return sampled;
}

/**
 * Project display points into device-independent pixels. Deterministic given inputs.
 * X is index-based equal spacing (EOD bars); a flat series maps to the vertical middle.
 */
export function project(
  points: DisplayPoint[],
  extent: ChartExtent,
  dims: ChartDimensions,
): ProjectedPoint[] {
  const { width, height, padding } = dims;
  const innerW = Math.max(0, width - padding.left - padding.right);
  const innerH = Math.max(0, height - padding.top - padding.bottom);
  const span = extent.max - extent.min;
  const n = points.length;
  return points.map((p, k) => {
    const x = n <= 1 ? padding.left + innerW / 2 : padding.left + (k / (n - 1)) * innerW;
    const y = span === 0
      ? padding.top + innerH / 2
      : padding.top + (1 - (p.v - extent.min) / span) * innerH;
    return { ...p, x, y };
  });
}

/** An SVG path string for the projected polyline — deterministic; used for tests and a
 *  future SVG overlay. Coordinates are rounded to 2dp for stable comparison. */
export function buildPath(projected: ProjectedPoint[]): string {
  if (projected.length === 0) return "";
  const r = (n: number) => Math.round(n * 100) / 100;
  return projected
    .map((p, k) => `${k === 0 ? "M" : "L"} ${r(p.x)} ${r(p.y)}`)
    .join(" ");
}

export type ChangeDirection = "up" | "down" | "flat";

export interface ChangeInfo {
  first: number;
  last: number;
  absChange: number;
  pctChange: number;   // 0 when the first value is 0 (no fabricated infinity)
  direction: ChangeDirection;
}

/** First→last change of the plotted window. Pure; drives the readout and semantic color. */
export function changeInfo(points: DisplayPoint[]): ChangeInfo | null {
  if (points.length === 0) return null;
  const first = points[0].v;
  const last = points[points.length - 1].v;
  const absChange = last - first;
  const pctChange = first === 0 ? 0 : (absChange / first) * 100;
  const direction: ChangeDirection = absChange > 0 ? "up" : absChange < 0 ? "down" : "flat";
  return { first, last, absChange, pctChange, direction };
}
