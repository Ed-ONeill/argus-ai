"use client";

// Market Memory — the differentiator that makes Argus feel like it REMEMBERS the
// market instead of regenerating a summary each morning (§MEM′/§MEM‴). A real
// progression timeline from the backend theme-memory store: First detected →
// Conviction built → Dominant → Cooling → Resolved, with the reached stages lit.
// Closes with an open question (curiosity, §A⁶). Honest: only real memory renders.

import { EntityChip } from "@/components/common/EntityChip";
import { cn } from "@/lib/utils";
import { ExploreLink } from "./ExploreLink";
import type { MarketMemory as MarketMemoryVM } from "@/lib/livingBrief";

export function MarketMemory({ memory }: { memory: MarketMemoryVM }) {
  const rising = memory.convictionTrend === "rising";
  // A lighter container than the Market Map's panel on purpose: the Map is the one
  // object with material depth, so it stays the singular signature.
  return (
    <section aria-labelledby="memory-heading" className="rounded-2xl border border-edge-subtle bg-surface/25 p-6 sm:p-7">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="memory-heading" className="text-[12px] font-semibold uppercase tracking-[0.22em] text-ink">
          Market Memory
        </h2>
        <span className="text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">What Argus remembers</span>
      </div>

      <div className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <EntityChip kind="theme" label={memory.theme} size="md"
          className="text-[17px] font-semibold text-ink" />
        <span className="text-[12px] text-ink-muted">{memory.statusLine}</span>
      </div>

      {/* Progression timeline — the lit stages are the ones this narrative reached. */}
      <ol className="flex flex-col gap-0 sm:flex-row sm:items-start sm:gap-0">
        {memory.milestones.map((ms, i) => (
          <li key={ms.label} className="flex flex-1 gap-3 sm:flex-col sm:gap-2">
            <div className="flex flex-col items-center sm:w-full sm:flex-row">
              <span className={cn(
                "z-10 h-2.5 w-2.5 shrink-0 rounded-full",
                ms.reached ? "bg-accent shadow-[0_0_8px_rgba(37,99,235,0.7)]" : "bg-edge-strong",
              )} />
              {i < memory.milestones.length - 1 && (
                <span className={cn(
                  "my-1 h-8 w-px sm:my-0 sm:h-px sm:w-full",
                  ms.reached ? "bg-accent/50" : "bg-edge",
                )} />
              )}
            </div>
            <div className="pb-4 sm:pb-0 sm:pr-3">
              <p className={cn("text-[11px] font-semibold", ms.reached ? "text-ink" : "text-ink-faint")}>
                {ms.label}
              </p>
              {ms.detail && <p className="font-mono text-[10px] text-ink-muted">{ms.detail}</p>}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-edge-subtle pt-4">
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Conviction</span>
          <span className="font-mono text-[13px] text-ink-secondary">{memory.convictionFrom}</span>
          <span className="text-ink-faint">→</span>
          <span className={cn("font-mono text-[13px] font-semibold", rising ? "text-emerald-400" : "text-ink")}>
            {memory.convictionNow}
          </span>
          <span className="text-[10px] text-ink-muted">{memory.convictionTrend}</span>
        </div>
        {memory.tickers.length > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Linked to</span>
            <div className="flex flex-wrap gap-1.5">
              {memory.tickers.map((t, i) => (
                <EntityChip key={`${t.label}-${i}`} kind={t.kind} label={t.label} size="md"
                  className="font-semibold text-ink-secondary" />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] italic text-ink-muted">{memory.openQuestion}</p>
        <ExploreLink label="See its history" entity={memory.theme} />
      </div>
    </section>
  );
}
