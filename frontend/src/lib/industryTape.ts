// lib/industryTape.ts — reduce a real EOD price series to the honest facts an industry market
// tape can show: the last close, the day's move (last close vs the prior close), and a sparkline
// drawn from the ACTUAL recent closes. Pure and deterministic. Returns null when the series
// cannot honestly support a quote, so the tape omits that symbol rather than inventing one.
// This replaces the former ticker-hash placeholders; the data is end-of-day, so the tape must be
// labeled delayed / at close, never live.

import type { PriceSeries } from "./platform/types/prices";

export interface TapeQuote { price: number; pct: number; up: boolean; spark: string }

/** Build a real tape quote from a price series. Uses split/dividend-adjusted closes when present.
 *  Null unless there are at least two usable closes (needed for a day's move) and a positive base. */
export function buildTapeQuote(
  series: PriceSeries | null | undefined,
  opts: { sparkN?: number; w?: number; h?: number } = {},
): TapeQuote | null {
  const { sparkN = 14, w = 30, h = 11 } = opts;
  const closes = (series?.points ?? [])
    .map((p) => (Number.isFinite(p.adjClose) ? p.adjClose : p.c))
    .filter((c): c is number => Number.isFinite(c));
  if (closes.length < 2) return null;
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  if (!(prev > 0)) return null;

  const pct = ((last - prev) / prev) * 100;
  const recent = closes.slice(-sparkN);
  const max = Math.max(...recent), min = Math.min(...recent), span = Math.max(1e-6, max - min);
  const spark = recent
    .map((c, i) => `${((i / (recent.length - 1)) * w).toFixed(1)},${(h - 1 - ((c - min) / span) * (h - 2)).toFixed(1)}`)
    .join(" ");

  return { price: last, pct, up: pct >= 0, spark };
}
