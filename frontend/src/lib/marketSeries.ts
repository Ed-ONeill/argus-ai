/**
 * lib/marketSeries.ts - pure price-series reads and range selection for the
 * Explorer Market View.
 *
 * Reads the OHLCV MarketMetric nodes the market pipeline attaches to the graph
 * (daily at mkt:{ticker}:ohlcv, intraday at mkt:{ticker}:ohlcv:intraday) and
 * decides which real series a chart range may render:
 *
 * - 1D renders intraday bars only; without enough intraday bars it returns the
 *   snapshot fallback, NEVER daily bars disguised as intraday
 * - 1W prefers intraday and falls back to daily bars automatically
 * - 1M and wider render daily bars
 *
 * Pure module with relative imports only so the test suite can exercise it
 * directly. Nothing here fabricates data. No em/en dashes.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";

export interface PricePoint { t: number; c: number; o: number | null; h: number | null; l: number | null; v: number | null; vwap: number | null }
export interface PriceSeriesVM {
  available:  boolean;
  interval:   string | null;   // "daily" | "intraday"
  resolution: string | null;   // e.g. "5min" for intraday
  points:     PricePoint[];
  provider:   string | null;
}
export const EMPTY_SERIES: PriceSeriesVM = { available: false, interval: null, resolution: null, points: [], provider: null };

const mnum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Read the OHLCV bars recorded on the graph for one interval. Returns EMPTY_SERIES
 * when no bars exist; callers must show an honest empty state.
 */
export function buildPriceSeries(graphKey: string, interval: "daily" | "intraday" = "daily"): PriceSeriesVM {
  const id = interval === "daily" ? `mkt:${graphKey}:ohlcv` : `mkt:${graphKey}:ohlcv:intraday`;
  const node = G.getNode(id);
  if (!node) return EMPTY_SERIES;
  const md = node.metadata as Record<string, unknown>;
  const bars = Array.isArray(md.bars) ? md.bars : [];
  const points: PricePoint[] = [];
  for (const b of bars) {
    if (!b || typeof b !== "object") continue;
    const r = b as Record<string, unknown>;
    const tRaw = mnum(r.t), c = mnum(r.c);
    if (tRaw == null || c == null) continue;
    const t = tRaw < 1e12 ? tRaw * 1000 : tRaw; // tolerate second-epoch bars
    points.push({ t, c, o: mnum(r.o), h: mnum(r.h), l: mnum(r.l), v: mnum(r.v), vwap: mnum(r.vwap) });
  }
  points.sort((a, b) => a.t - b.t);
  if (points.length < 2) return EMPTY_SERIES;
  return {
    available: true,
    interval: typeof md.interval === "string" ? md.interval : interval,
    resolution: typeof md.resolution === "string" ? md.resolution : null,
    points,
    provider: typeof md.provider === "string" ? md.provider : null,
  };
}

/* ---- chart range selection ---- */

export type ChartRangeKey = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y";
export const CHART_RANGES: ChartRangeKey[] = ["1D", "1W", "1M", "3M", "6M", "1Y", "5Y"];
const DAY = 86_400_000;
export const RANGE_MS: Record<ChartRangeKey, number> = {
  "1D": DAY, "1W": 7 * DAY, "1M": 31 * DAY, "3M": 92 * DAY, "6M": 183 * DAY, "1Y": 366 * DAY, "5Y": 1830 * DAY,
};

// Minimum real bars a range needs before it draws a chart at all.
export const MIN_INTRADAY_BARS = 4;
export const MIN_WEEK_INTRADAY_BARS = 10;

export interface RangeSelection {
  points:   PricePoint[];
  /** Which real series is drawn; null means nothing may be drawn for this range. */
  interval: "intraday" | "daily" | null;
  /** "daily" = 1W fell back to daily bars; "snapshot" = show the snapshot state. */
  fallback: "none" | "daily" | "snapshot";
}

/**
 * Pick the honest series for a range. Intraday windows anchor to the LAST recorded
 * intraday bar (not the wall clock) so the latest session still renders on weekends.
 */
export function selectSeriesForRange(range: ChartRangeKey, intraday: PriceSeriesVM, daily: PriceSeriesVM, now: number): RangeSelection {
  const lastIntra = intraday.available ? intraday.points[intraday.points.length - 1].t : 0;

  if (range === "1D") {
    const pts = intraday.available ? intraday.points.filter(p => p.t >= lastIntra - 26 * 3_600_000) : [];
    return pts.length >= MIN_INTRADAY_BARS
      ? { points: pts, interval: "intraday", fallback: "none" }
      : { points: [], interval: null, fallback: "snapshot" };
  }

  if (range === "1W") {
    const pts = intraday.available ? intraday.points.filter(p => p.t >= lastIntra - 7 * DAY) : [];
    if (pts.length >= MIN_WEEK_INTRADAY_BARS) return { points: pts, interval: "intraday", fallback: "none" };
    const d = daily.available ? daily.points.filter(p => p.t >= now - 8 * DAY) : [];
    return d.length >= 2
      ? { points: d, interval: "daily", fallback: "daily" }
      : { points: [], interval: null, fallback: "snapshot" };
  }

  const d = daily.available ? daily.points.filter(p => p.t >= now - RANGE_MS[range]) : [];
  return d.length >= 2
    ? { points: d, interval: "daily", fallback: "none" }
    : { points: [], interval: null, fallback: "snapshot" };
}
