"use client";

// Market Pulse (Stage 1B(b)) — the FIRST production consumer of the canonical chart
// platform. The cross-asset band is now drawn by <ArgusChart variant="sparkline"> fed by
// the Stage 1A price platform (useSeries → /api/reference/prices → EODHD /eod). The old
// bespoke numeric-only tape is retired; there is no chart code here, only configuration
// of the one canonical renderer (the one-chart principle).
//
// Honesty is preserved end to end: each cell renders only when a real series exists
// (absent, never fabricated); the band is gated on the SPY bellwether, so if the market
// tape is unavailable nothing shows; the data is EOD and therefore honestly labeled
// delayed. The readout numbers are computed from the SAME points the sparkline draws
// (shared platform geometry), so text and line can never disagree.

import { useMemo } from "react";

import { ArgusChart, toDisplayPoints } from "@/lib/platform/chart";
import { useSeries } from "@/lib/platform/hooks/useSeries";
import { cn } from "@/lib/utils";

// A curated cross-asset macro picture, all liquid US-listed ETFs the /eod plan serves:
// equities, rates, gold, oil, the dollar, and crypto — the read an institution scans first.
const ASSETS: { symbol: string; label: string }[] = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq 100" },
  { symbol: "IWM", label: "Russell 2000" },
  { symbol: "TLT", label: "Treasuries" },
  { symbol: "GLD", label: "Gold" },
  { symbol: "USO", label: "Oil" },
  { symbol: "UUP", label: "Dollar" },
  { symbol: "IBIT", label: "Bitcoin" },
];

const BELLWETHER = "SPY";     // if the tape's bellwether is unavailable, show no band
const LOOKBACK_DAYS = 120;    // ~80 trading sessions — a clean recent-trend sparkline

function priceText(v: number): string {
  return v >= 1000 ? v.toFixed(0) : v.toFixed(2);
}

function PulseCell({ symbol, label, from }: { symbol: string; label: string; from: string }) {
  const { series } = useSeries(symbol, { from });
  const points = useMemo(() => toDisplayPoints(series), [series]);

  // Honest absence: no real series (or too few points to trend) → render nothing.
  if (!series || points.length < 2) return null;

  // The sparkline shows the ~120-day shape; the readout shows the LATEST SESSION move
  // (latest real close vs the prior real close) — what users expect from a tape, still
  // fully honest with delayed EOD data.
  const last = points[points.length - 1].v;
  const prev = points[points.length - 2].v;
  const dayAbs = last - prev;
  const dayPct = prev === 0 ? 0 : (dayAbs / prev) * 100;
  const up = dayAbs > 0;
  const flat = dayAbs === 0;

  return (
    <div className="flex w-[92px] shrink-0 flex-col gap-1.5">
      <span className="truncate text-[8.5px] font-medium uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </span>
      {/* The sparkline is the primary element: it gets the height and the visual mass.
          Neutral line (no gain/loss tint) so the single colored signal is the session
          move in the readout below — one honest gain/loss cue, no conflicting colors. */}
      <ArgusChart
        series={series}
        variant="sparkline"
        config={{ height: 36, semanticColor: false }}
        ariaLabel={`${label} ${up ? "up" : flat ? "flat" : "down"} ${Math.abs(dayPct).toFixed(2)} percent on the latest session, delayed`}
      />
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-[10px] tabular-nums text-ink-muted">{priceText(last)}</span>
        <span
          className={cn(
            "font-mono text-[10px] tabular-nums",
            flat ? "text-ink-muted" : up ? "text-emerald-400" : "text-rose-400",
          )}
        >
          {up ? "+" : ""}{dayPct.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

export function MarketPulse() {
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - LOOKBACK_DAYS);
    return d.toISOString().slice(0, 10);
  }, []);

  // Gate the whole band on the bellwether: no market tape → no band (honest, not fake).
  // React Query dedupes this with the SPY cell below, so it costs one request.
  const { series: bellwether } = useSeries(BELLWETHER, { from });
  if (!bellwether) return null;

  // No outer margin/border — the workspace band frames the tape (see LivingBrief).
  return (
    <div className="-mx-1 flex items-stretch gap-5 overflow-x-auto pb-1">
      <span className="shrink-0 self-start pt-0.5 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
        Tape · delayed
      </span>
      {ASSETS.map((a) => (
        <PulseCell key={a.symbol} symbol={a.symbol} label={a.label} from={from} />
      ))}
    </div>
  );
}
