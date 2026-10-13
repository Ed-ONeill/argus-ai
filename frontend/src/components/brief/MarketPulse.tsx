"use client";

import { useMemo } from "react";
import { ArgusChart } from "@/lib/platform/chart";
import { useSeries } from "@/lib/platform/hooks/useSeries";
import { cn } from "@/lib/utils";
import { etfObservation, ETF_LOOKBACK_DAYS } from "@/lib/marketBrief";

const ASSETS = [
  { symbol: "SPY", label: "S&P 500 proxy" },
  { symbol: "QQQ", label: "Nasdaq 100 proxy" },
  { symbol: "IWM", label: "Russell 2000 proxy" },
  { symbol: "TLT", label: "Long-term Treasuries" },
  { symbol: "GLD", label: "Gold proxy" },
  { symbol: "USO", label: "Oil futures" },
  { symbol: "UUP", label: "US dollar proxy" },
  { symbol: "IBIT", label: "Bitcoin proxy" },
];

function PulseCell({ symbol, label, from }: { symbol: string; label: string; from: string }) {
  const { series, stale, isLoading } = useSeries(symbol, { from });
  const quote = useMemo(() => etfObservation(series, symbol, label, stale), [series, symbol, label, stale]);
  return (
    <div className="flex w-[124px] shrink-0 flex-col gap-1.5" aria-label={`${symbol} ETF reference`}>
      <span className="text-[10px] font-semibold text-ink-secondary">{symbol} · ETF</span>
      <span className="text-[9px] text-ink-faint">{label}</span>
      {quote ? <>
        <ArgusChart series={series} variant="sparkline" config={{ height: 36, semanticColor: false }}
          ariaLabel={`${symbol} ETF adjusted close history; latest ${quote.asOf}, USD per share`} />
        <span className="font-mono text-[11px] text-ink-muted">${quote.close.toFixed(2)}</span>
        <span className="text-[8.5px] text-ink-faint">Adjusted close · USD/share</span>
        <span className={cn("font-mono text-[10px]", quote.pct == null || quote.pct === 0 ? "text-ink-muted" : quote.pct > 0 ? "text-emerald-400" : "text-rose-400")}>
          {quote.pct == null ? "Change unavailable" : `${quote.pct > 0 ? "+" : ""}${quote.pct.toFixed(2)}% vs prior available close`}
        </span>
        <time dateTime={quote.asOf} className="text-[9px] text-ink-faint">As of {quote.asOf} UTC</time>
        {quote.stale && <span className="text-[9px] text-amber-400">Marked stale</span>}
      </> : <span className="text-[10px] text-ink-muted">{isLoading ? "Loading price…" : "Price unavailable"}</span>}
    </div>
  );
}

export function MarketPulse() {
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - ETF_LOOKBACK_DAYS);
    return d.toISOString().slice(0, 10);
  }, []);
  return (
    <section aria-label="ETF reference prices">
      <p className="mb-2 text-[10px] text-ink-faint">ETF references · end-of-day data. Prices are ETF shares, not index levels, spot prices or Treasury yields.</p>
      <div className="-mx-1 flex items-stretch gap-5 overflow-x-auto pb-1" tabIndex={0}>
        {ASSETS.map(a => <PulseCell key={a.symbol} {...a} from={from} />)}
      </div>
    </section>
  );
}
