"use client";

// Market Pulse (PX1.4) — the market breathing. A quiet, live cross-asset band from
// the real delayed-intraday feed (a fixed macro set: equities, rates, vol, gold, oil,
// dollar, crypto). Real moving numbers, honestly labeled delayed/offline. This is what
// makes the brief feel connected to right-now rather than to a morning report. Ambient
// by design — recessive so it never competes with the executive summary above it.

import { useMarketData, type TickerData } from "@/hooks/useMarketData";
import { cn } from "@/lib/utils";

// Curated order for the brief: the cross-asset picture an institution scans first.
const ORDER = ["SPY", "QQQ", "IWM", "TNX", "VIX", "GC=F", "BZ=F", "DXY", "BTC-USD"];

function Cell({ t }: { t: TickerData }) {
  const up = t.changePercent >= 0;
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-ink-faint">{t.label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[12px] tabular-nums text-ink-secondary">
          {t.price >= 100 ? t.price.toFixed(0) : t.price.toFixed(2)}
        </span>
        <span className={cn("font-mono text-[11px] tabular-nums", up ? "text-emerald-400" : "text-rose-400")}>
          {up ? "+" : ""}{t.changePercent.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

export function MarketPulse() {
  const { data, heartbeatStatus, isStale } = useMarketData();
  if (heartbeatStatus === "loading" || heartbeatStatus === "offline" || !data) return null; // honest: absent, not fake

  const cells = ORDER.map((k) => data[k]).filter((t): t is TickerData => !!t);
  if (cells.length === 0) return null;

  const delayed = isStale || heartbeatStatus === "stale" || heartbeatStatus === "degraded";
  return (
    <div className="mb-9 border-b border-edge/50 pb-5">
      <div className="-mx-1 flex items-center gap-5 overflow-x-auto pb-1">
        <span className="shrink-0 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          {delayed ? "Tape · delayed" : "Tape"}
        </span>
        {cells.map((t) => <Cell key={t.key} t={t} />)}
      </div>
    </div>
  );
}
