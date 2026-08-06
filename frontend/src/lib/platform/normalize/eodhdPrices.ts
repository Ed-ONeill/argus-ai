// platform/normalize/eodhdPrices.ts — pure normalizer: EODHD /eod → canonical
// PriceSeries. Deterministic and side-effect-free (takes `now` explicitly), so it is
// independently testable and never depends on the wall clock or network.

import { makeQuality } from "../quality";
import type { PricePoint, PriceSeries } from "../types/prices";

// EODHD /eod JSON row (fmt=json): ascending by date.
export interface EodhdEodBar {
  date: string;
  open: number; high: number; low: number; close: number;
  adjusted_close?: number; volume?: number;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalize a raw EODHD /eod payload. Returns null on empty/malformed input so the
 *  caller resolves to honest absence — never a fabricated series. */
export function normalizeEodhdEod(
  raw: unknown, symbol: string, exchange: string, now: string,
): PriceSeries | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const points: PricePoint[] = [];
  for (const row of raw as EodhdEodBar[]) {
    if (!row || typeof row.date !== "string") continue;
    const c = num(row.close);
    if (c == null) continue;                 // no close → not a usable bar
    const o = num(row.open) ?? c;
    const h = num(row.high) ?? c;
    const l = num(row.low) ?? c;
    const adj = num(row.adjusted_close) ?? c;
    const v = num(row.volume) ?? 0;
    points.push({ t: row.date, o, h, l, c, adjClose: adj, v });
  }
  if (points.length === 0) return null;

  points.sort((a, b) => a.t.localeCompare(b.t));  // oldest → newest, deterministic
  const lastDate = points[points.length - 1].t;
  const asOf = `${lastDate}T00:00:00.000Z`;
  const delayMs = Math.max(0, Date.parse(now) - Date.parse(asOf));

  return {
    symbol,
    exchange,
    points,
    adjusted: true,
    asOf,
    quality: makeQuality("eodhd", asOf, { grade: "DELAYED", delayMs }),
  };
}
