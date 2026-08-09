"use client";

// MarketSummary — one line that adapts to the market's STATE (open / pre-open / after the
// close / weekend), not to a time of day. Written only from real signals: the delayed
// closes we have (S&P via SPY, Treasuries via TLT, oil via USO) and the session. It sits
// as quiet context above the live tape — deliberately secondary, so the lead story below
// is the largest thing on the page. Never claims futures or a schedule we do not have.

import { useMemo } from "react";
import { useSeries } from "@/lib/platform/hooks/useSeries";
import { toDisplayPoints } from "@/lib/platform/chart";
import { buildMarketBrief, type AssetMove } from "@/lib/marketBrief";
import type { PriceSeries } from "@/lib/platform/types/prices";

const LOOKBACK_DAYS = 30;

function lastSessionMove(series: PriceSeries | null, label: string): AssetMove {
  const points = toDisplayPoints(series);
  if (points.length < 2) return { label, pct: null };
  const last = points[points.length - 1].v;
  const prev = points[points.length - 2].v;
  return { label, pct: prev === 0 ? null : ((last - prev) / prev) * 100 };
}

export function MarketSummary({ sessionLabel, live }: { sessionLabel: string | null; live: boolean }) {
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - LOOKBACK_DAYS);
    return d.toISOString().slice(0, 10);
  }, []);

  // Shares React Query cache with Market Pulse (same symbols) — no extra network.
  const spy = useSeries("SPY", { from });
  const tlt = useSeries("TLT", { from });
  const uso = useSeries("USO", { from });

  const note = useMemo(() => buildMarketBrief({
    index: lastSessionMove(spy.series, "S&P 500"),
    rates: lastSessionMove(tlt.series, "Treasuries"),
    oil: lastSessionMove(uso.series, "Oil"),
    topStory: null,
    sessionLabel,
    live,
  }), [spy.series, tlt.series, uso.series, sessionLabel, live]);

  if (!note) return null;
  return <p aria-label="Market summary" className="text-[12.5px] leading-relaxed text-ink-secondary">{note}</p>;
}
