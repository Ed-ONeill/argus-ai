"use client";

// MarketLandscape — "Today's Market Landscape", the Feed's visual centerpiece (Law 10).
//
// A calm, deliberately composed board of market concepts: a fixed cross-asset spine along
// the bottom (context, with real delayed moves) and today's event protagonists above
// (companies, macro actors, countries — the emphasis), connected by thin lines that exist
// only because a real event links them. Deterministic placement (no force-directed cloud),
// SVG lines behind token-styled DOM chips. Clicking a node focuses the editorial stream to
// that concept and keeps the user in the Feed. No graph metrics, no engine vocabulary.

import { useMemo, type CSSProperties } from "react";
import { useSeries } from "@/lib/platform/hooks/useSeries";
import { etfObservation } from "@/lib/marketBrief";
import { cn } from "@/lib/utils";
import { buildMarketLandscape, type LandscapeNode } from "@/lib/marketLandscape";
import type { FeedResponse } from "@/lib/types";

const HEIGHT = 300;
const LOOKBACK_DAYS = 30;

function nodeStyle(node: LandscapeNode): CSSProperties {
  return { position: "absolute", left: `${node.x}%`, top: `${node.y}%`, transform: "translate(-50%, -50%)" };
}

function SpineNode({ node, active, from, onFocus }: {
  node: LandscapeNode; active: boolean; from: string; onFocus: (n: LandscapeNode) => void;
}) {
  const { series, stale } = useSeries(node.symbol ?? null, { from });
  const quote = useMemo(() => etfObservation(series, node.symbol ?? "", node.label, stale), [series, node.symbol, node.label, stale]);
  const move = quote?.pct ?? null;
  const up = move != null && move > 0;
  const down = move != null && move < 0;
  const asOf = quote?.asOf
    ? new Date(quote.asOf).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : "Unknown date";
  return (
    <button type="button" onClick={() => onFocus(node)} aria-pressed={active} style={nodeStyle(node)}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-md px-2 py-1 transition-colors motion-reduce:transition-none",
        active ? "bg-raised" : "hover:bg-raised/40",
      )}>
      <span title={`${node.symbol} representative ETF; latest available daily close${quote?.asOf ? ` as of ${quote.asOf}` : ""}`} className="whitespace-nowrap text-[10px] font-semibold text-ink-secondary">{node.label}</span>
      {move != null ? (
        <span className={cn("font-mono text-[9.5px] tabular-nums", up ? "text-emerald-400" : down ? "text-rose-400" : "text-ink-muted")}>
          {up ? "+" : ""}{move.toFixed(1)}%<span title={quote?.asOf ?? "date unavailable"} className="block text-[9px] text-ink-secondary">{node.symbol}<span className="block whitespace-nowrap">{asOf}{quote?.stale ? " · stale" : ""}</span></span>
        </span>
      ) : (
        <span className="font-mono text-[9px] text-ink-faint">Price unavailable</span>
      )}
    </button>
  );
}

function ProtagonistNode({ node, active, onFocus }: {
  node: LandscapeNode; active: boolean; onFocus: (n: LandscapeNode) => void;
}) {
  return (
    <button type="button" onClick={() => onFocus(node)} aria-pressed={active} style={nodeStyle(node)}
      className={cn(
        "flex w-32 flex-col items-center gap-0.5 rounded-lg border px-2.5 py-1 transition-colors motion-reduce:transition-none",
        active ? "border-cyan-200/70 bg-cyan-200/15 shadow-[0_0_24px_rgb(103_232_249_/_0.12)]" : "border-edge bg-slate-900/90 hover:border-cyan-200/60",
      )}>
      <span className="whitespace-nowrap text-[12.5px] font-semibold text-ink">{node.label}</span>
      <span className="text-[9px] text-ink-secondary">{node.eventIds.length} {node.eventIds.length === 1 ? "story" : "stories"}</span>
    </button>
  );
}

export function MarketLandscape({ feed, activeId, onFocus }: {
  feed: FeedResponse | undefined;
  activeId?: string | null;
  onFocus: (node: LandscapeNode) => void;
}) {
  const model = useMemo(() => buildMarketLandscape(feed), [feed]);
  const nodeById = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model]);
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - LOOKBACK_DAYS);
    return d.toISOString().slice(0, 10);
  }, []);

  return (
    <div className="discovery-panel overflow-hidden p-4 sm:p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="discovery-eyebrow">The landscape</p><h2 className="mt-2 font-serif text-2xl">Who&rsquo;s in the reporting?</h2></div><span className="text-xs text-cyan-200">Select a name to explore ↓</span></div>
    <p className="mb-4 max-w-[80ch] text-xs leading-relaxed text-ink-secondary">Connections show shared reporting topics, not causal effects. Select a label to inspect the matching developments.</p>
    <div className="overflow-x-auto" role="region" aria-label="Scrollable market landscape" tabIndex={0}><section aria-label="Today's market landscape"
      className="discovery-landscape relative min-w-[640px] w-full overflow-hidden rounded-2xl border border-edge/60 bg-surface/30" style={{ height: HEIGHT }}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {model.edges.map((e, i) => {
          const a = nodeById.get(e.from);
          const b = nodeById.get(e.to);
          if (!a || !b) return null;
          return (
            <line key={i} className="discovery-connection" x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={activeId === e.from || activeId === e.to ? "rgb(165 243 252)" : "rgb(var(--ink-faint))"} strokeOpacity={!activeId ? 0.35 : activeId === e.from || activeId === e.to ? 0.85 : 0.1} strokeWidth={1} vectorEffect="non-scaling-stroke">
              {/* Every connection is explainable in one plain sentence (the event headline). */}
              <title>{e.reason}</title>
            </line>
          );
        })}
      </svg>

      {model.nodes.map((n) =>
        n.spine
          ? <SpineNode key={n.id} node={n} from={from} active={activeId === n.id} onFocus={onFocus} />
          : <ProtagonistNode key={n.id} node={n} active={activeId === n.id} onFocus={onFocus} />,
      )}
    </section></div>
    <p className="mt-4 text-[11px] leading-relaxed text-ink-secondary">Named in reporting above · ETF references below. Percentages compare the latest two available adjusted closes; dates are UTC. Scroll sideways on smaller screens.</p>
    {activeId && <p role="status" className="mt-3 rounded-lg border border-cyan-200/20 bg-cyan-200/5 px-4 py-3 text-xs text-cyan-100">Showing reporting for {nodeById.get(activeId)?.label}. The matching stories are below the landscape.</p>}
    </div>
  );
}
