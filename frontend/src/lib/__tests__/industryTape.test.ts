// industryTape — the real-quote reducer behind the honest Industries market tape. Verifies it
// only ever reports what real EOD closes support: a day's move from the prior close, a sparkline
// from actual closes, and an HONEST NULL (so the symbol is omitted, not faked) when the series
// can't back a quote. No fabrication, no false precision beyond the raw closes.

import { describe, expect, it } from "vitest";

import type { PriceSeries, PricePoint } from "@/lib/platform/types/prices";
import type { DataQuality } from "@/lib/platform/quality";
import { buildTapeQuote } from "@/lib/industryTape";

const QUALITY: DataQuality = { source: "test", updatedAt: "2026-08-09T00:00:00Z", delayMs: 0, freshness: "fresh", grade: "DELAYED" };
const pt = (t: string, c: number, adj = c): PricePoint => ({ t, o: c, h: c, l: c, c, adjClose: adj, v: 0 });
const series = (closes: number[]): PriceSeries => ({
  symbol: "TEST", exchange: "US",
  points: closes.map((c, i) => pt(`2026-08-${String(i + 1).padStart(2, "0")}`, c)),
  adjusted: true, asOf: "2026-08-09", quality: QUALITY,
});

describe("buildTapeQuote — honest omission", () => {
  it("returns null when the series is missing or has fewer than two closes", () => {
    expect(buildTapeQuote(null)).toBeNull();
    expect(buildTapeQuote(undefined)).toBeNull();
    expect(buildTapeQuote(series([]))).toBeNull();
    expect(buildTapeQuote(series([100]))).toBeNull();
  });

  it("returns null when the prior close is not a positive base (no divide-by-zero fabrication)", () => {
    expect(buildTapeQuote(series([0, 5]))).toBeNull();
  });
});

describe("buildTapeQuote — real move from real closes", () => {
  it("reports the last close and the day's move against the prior close", () => {
    const q = buildTapeQuote(series([100, 110]))!;
    expect(q.price).toBe(110);
    expect(q.pct).toBeCloseTo(10, 6);   // (110-100)/100
    expect(q.up).toBe(true);
  });

  it("marks a down day and computes a negative move", () => {
    const q = buildTapeQuote(series([200, 190]))!;
    expect(q.up).toBe(false);
    expect(q.pct).toBeCloseTo(-5, 6);
  });

  it("draws the sparkline from the actual recent closes, capped to sparkN points", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
    const q = buildTapeQuote(series(closes), { sparkN: 14 })!;
    expect(q.spark.split(" ")).toHaveLength(14);   // only the most recent 14 closes
    expect(q.price).toBe(139);                     // last close, not a hash
  });

  it("prefers the adjusted close when present", () => {
    const s: PriceSeries = {
      symbol: "T", exchange: "US", adjusted: true, asOf: "2026-08-02", quality: QUALITY,
      points: [pt("2026-08-01", 100, 50), pt("2026-08-02", 100, 60)],
    };
    const q = buildTapeQuote(s)!;
    expect(q.price).toBe(60);                 // adjClose, not raw c
    expect(q.pct).toBeCloseTo(20, 6);         // (60-50)/50
  });
});
