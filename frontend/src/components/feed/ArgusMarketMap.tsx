"use client";

import { useMemo } from "react";
import NetworkGraph from "@/components/graph/NetworkGraph";
import { buildMarketMap, buildMarketStory, type MarketSnapshot } from "@/lib/marketMap";
import { confColor, convScore } from "@/app/markets/marketsShared";
import type { ThemeIntelligence } from "@/lib/types";

/**
 * ArgusMarketMap — the Feed hero. A live capital-transmission map (macro driver →
 * theme → sector → assets) rendered on the reusable graph engine, plus a compact
 * "Today's Market Story" desk note. The signature first-screen experience.
 */

interface Props {
  themes: ThemeIntelligence[];
  snapshot: MarketSnapshot;
  isLoading?: boolean;
}

export function ArgusMarketMap({ themes, snapshot, isLoading }: Props) {
  const model = useMemo(() => buildMarketMap(themes, snapshot), [themes, snapshot]);
  const story = useMemo(() => buildMarketStory(themes, snapshot), [themes, snapshot]);

  const mapped = useMemo(() =>
    [...themes].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 6).filter(t => (t.related_industries ?? []).length),
    [themes]);
  const avgConv = mapped.length ? Math.round(mapped.reduce((s, t) => s + (t.confidence ?? 0), 0) / mapped.length) : 0;
  const hasMap = model.nodes.length > 2;

  if (!isLoading && !hasMap) return null;

  const regimeLabel = snapshot.regimeLabel || (snapshot.riskRegime === "risk-on" ? "Risk-On" : snapshot.riskRegime === "risk-off" ? "Risk-Off" : "Mixed");
  const regimeColor = snapshot.riskRegime === "risk-on" ? "#34d399" : snapshot.riskRegime === "risk-off" ? "#f87171" : "#8ea3c4";

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-5">
      {/* Signature header */}
      <div className="flex items-center gap-3 mb-2.5">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="tg-live-dot absolute inline-flex h-full w-full rounded-full" style={{ background: "#34d399" }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "#34d399" }} />
        </span>
        <span className="text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.96)" }}>Argus Market Map</span>
        <span className="text-[9px] font-medium hidden sm:inline" style={{ color: "rgba(255,255,255,0.4)" }}>how markets are moving right now</span>
        <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
        <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] shrink-0" style={{ color: regimeColor }}>{regimeLabel}</span>
        {!isLoading && avgConv > 0 && (
          <span className="text-[9.5px] font-bold tabular-nums shrink-0" style={{ color: confColor(avgConv) }}>Conv {convScore(avgConv)}</span>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-3.5">
        {/* The map */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="w-full rounded-xl border animate-pulse" style={{ height: 440, borderColor: "rgba(82,176,200,0.2)", background: "rgba(5,9,16,0.6)" }} />
          ) : (
            <NetworkGraph model={model} height={440} title="Argus Market Map" subtitle="Capital Flow" showTimeline={false} showFilters={false} />
          )}
        </div>

        {/* Today's Market Story */}
        <div className="rounded-xl border p-4 flex flex-col" style={{ borderColor: "rgba(255,255,255,0.08)", background: "linear-gradient(180deg, rgba(20,30,46,0.55), rgba(5,9,16,0.8))" }}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[8.5px] font-black uppercase tracking-[0.16em]" style={{ color: "rgba(255,255,255,0.55)" }}>Today&apos;s Market Story</span>
            <span className="ml-auto text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color: regimeColor, background: `${regimeColor}1a` }}>{regimeLabel}</span>
          </div>

          {isLoading ? (
            <div className="space-y-2 animate-pulse">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-3 rounded" style={{ background: "rgba(255,255,255,0.05)", width: `${90 - i * 8}%` }} />)}
            </div>
          ) : story ? (
            <>
              <p className="text-[12.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.82)" }}>{story.paragraph}</p>
              <div className="mt-3 pt-3 border-t flex items-start gap-2" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                <span className="text-[8px] font-bold uppercase tracking-wide shrink-0 mt-0.5" style={{ color: regimeColor }}>Watch</span>
                <p className="text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.6)" }}>{story.watch}</p>
              </div>
              {story.movers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {story.movers.map(m => (
                    <span key={m} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>{m}</span>
                  ))}
                </div>
              )}
              <p className="text-[8.5px] mt-auto pt-3" style={{ color: "rgba(255,255,255,0.28)" }}>
                Hover a node to trace its transmission · click to pin and re-centre
              </p>
            </>
          ) : (
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Reading the tape — the market story resolves as themes firm up.</p>
          )}
        </div>
      </div>
    </section>
  );
}
