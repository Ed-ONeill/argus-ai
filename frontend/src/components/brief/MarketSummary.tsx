"use client";

// Summary of observed ETF closes, never underlying spot prices or measured yields.

import { useMemo } from "react";
import { useSeries } from "@/lib/platform/hooks/useSeries";
import { buildMarketBrief, etfObservation, ETF_LOOKBACK_DAYS } from "@/lib/marketBrief";
export function MarketSummary({ sessionLabel, live }: { sessionLabel: string | null; live: boolean }) {
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - ETF_LOOKBACK_DAYS);
    return d.toISOString().slice(0, 10);
  }, []);

  // Shares React Query cache with Market Pulse (same symbols) — no extra network.
  const spy = useSeries("SPY", { from });
  const tlt = useSeries("TLT", { from });
  const uso = useSeries("USO", { from });

  const note = useMemo(() => buildMarketBrief({
    index: etfObservation(spy.series, "SPY", "SPY (S&P 500 proxy)", spy.stale),
    rates: etfObservation(tlt.series, "TLT", "TLT (long-term Treasury ETF)", tlt.stale),
    oil: etfObservation(uso.series, "USO", "USO (oil-futures ETF)", uso.stale),
    topStory: null,
    sessionLabel,
    live,
  }), [spy.series, tlt.series, uso.series, spy.stale, tlt.stale, uso.stale, sessionLabel, live]);

  if (!note) return null;
  return <p aria-label="Market summary" className="text-[12.5px] leading-relaxed text-ink-secondary">{note}</p>;
}
