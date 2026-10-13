import { describe, expect, it } from "vitest";
import { buildMarketBrief, etfObservation } from "@/lib/marketBrief";
import type { PriceSeries } from "@/lib/platform/types/prices";

const series = (symbol = "TLT", values = [100, 101]): PriceSeries => ({
  symbol, exchange: "US", adjusted: true, asOf: "2026-10-13T12:00:00Z",
  points: values.map((v, i) => ({ t: i === 0 ? "2026-10-08" : "2026-10-09", o: v, h: v, l: v, c: v + 20, adjClose: v, v: 1 })),
  quality: { source: "fixture", updatedAt: "2026-10-13T12:00:00Z", delayMs: 0, freshness: "delayed", grade: "DELAYED" },
});
const input = { index: null, rates: null, oil: null, topStory: null, sessionLabel: null, live: false };

describe("ETF market brief", () => {
  it("reports ETF price moves without claiming an index, spot or yield measurement", () => {
    const note = buildMarketBrief({ ...input,
      index: { label: "SPY (S&P 500 proxy)", pct: .6, asOf: "2026-10-09" },
      rates: etfObservation(series(), "TLT", "TLT (long-term Treasury ETF)"),
      oil: { label: "USO (oil-futures ETF)", pct: -2, asOf: "2026-10-08" },
      live: true, sessionLabel: "Market open", topStory: "Cooler inflation data",
    });
    expect(note).toContain("SPY (S&P 500 proxy) +0.6% (2026-10-09)");
    expect(note).toContain("TLT (long-term Treasury ETF) +1.0% (2026-10-09)");
    expect(note).toContain("USO (oil-futures ETF) -2.0% (2026-10-08)");
    expect(note).not.toMatch(/yields eased|yields pushed|S&P 500 last closed|With markets open/);
    expect(note).toContain("In focus: Cooler inflation data.");
  });
  it("uses the actual plotted bar date and adjusted close, even across a weekend or newer retrieval", () => {
    const q = etfObservation(series("IBIT"), "IBIT", "Bitcoin proxy");
    expect(q).toMatchObject({ close: 101, pct: 1, asOf: "2026-10-09", stale: false });
    expect(etfObservation(series(), "TLT", "Treasuries", true)?.stale).toBe(true);
    const stale = series(); stale.quality.grade = "STALE";
    expect(buildMarketBrief({ ...input, rates: etfObservation(stale, "TLT", "TLT") })).toContain("marked stale");
  });
  it("does not fabricate a price or change when data is absent, mismatched or insufficient", () => {
    expect(etfObservation(null, "SPY", "Index proxy")).toBeNull();
    expect(etfObservation(series(), "SPY", "Index proxy")).toBeNull();
    expect(etfObservation(series("TLT", []), "TLT", "TLT")).toBeNull();
    expect(etfObservation(series("TLT", [101]), "TLT", "TLT")?.pct).toBeNull();
    expect(etfObservation(series("TLT", [0, 101]), "TLT", "TLT")?.pct).toBeNull();
    const undated = series(); undated.points.forEach(p => p.t = "not-a-date");
    expect(etfObservation(undated, "TLT", "TLT")).toBeNull();
    expect(buildMarketBrief({ ...input, live: true })).toBeNull();
  });
  it("preserves honest missing dates and a story-only note", () => {
    expect(buildMarketBrief({ ...input, rates: { label: "TLT ETF", pct: -1 } })).toContain("date unavailable");
    expect(buildMarketBrief({ ...input, topStory: "NVIDIA reports after the close" })).toBe("In focus: NVIDIA reports after the close.");
    expect(buildMarketBrief(input)).toBeNull();
  });
});
