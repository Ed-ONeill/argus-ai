"use client";

import { useMemo } from "react";
import IntelligenceNetwork from "@/components/network/IntelligenceNetwork";
import { buildNetworkModel } from "@/lib/network/model";
import type { MarketSnapshot } from "@/lib/marketMap";
import { useArgusIntelligence } from "@/hooks/useArgusIntelligence";
import { buildTheRead } from "@/lib/theRead";
import { buildMarketStoryVM } from "@/lib/feedNarrative";
import { buildFocusStory, focusKindLabel, type FeedFocus } from "@/lib/feedFocus";
import { useActiveBeamTokens, setBeacon, releaseBeacon, nodeTokens } from "@/lib/feedHighlight";
import { confColor, convScore } from "@/app/markets/marketsShared";
import type { GraphNode } from "@/lib/graph/types";
import type { ThemeIntelligence } from "@/lib/types";

/**
 * ArgusMarketMap — the Feed hero, now rendered on the M4.1 Intelligence
 * Network (components/network/IntelligenceNetwork): deterministic staged
 * causal layout, institutional node/edge grammar, no ambient motion.
 *
 * M4.1 removals (ARGUS_INTELLIGENCE_NETWORK_V1.md Task 1): the previous
 * intraday playback control was a fabricated reconstruction (stage +
 * confidence + hash — not historical observations) and has been REMOVED, not
 * substituted with another estimate. Real daily reconstruction over the M3
 * history API lands in M4.4 through this same integration point.
 */

interface Props {
  themes: ThemeIntelligence[];
  snapshot: MarketSnapshot;
  isLoading?: boolean;
  /** Page-level focus (the selected node, mapped). null = Global Market mode. */
  focus?: FeedFocus | null;
  /** Fired when the graph selection changes, drives the whole page. */
  onFocusChange?: (node: GraphNode | null) => void;
  /** Increment to release the selection from outside (exit Focus mode). */
  clearNonce?: number;
  /** Accepted for page compatibility; the M4.1 network is deliberately still
      (no ambient-motion temperament), so energy no longer drives rendering. */
  energy?: number;
}

export function ArgusMarketMap({ themes, snapshot, isLoading, focus, onFocusChange, clearNonce }: Props) {
  const beam = useActiveBeamTokens();

  const model = useMemo(() => buildNetworkModel(themes, snapshot), [themes, snapshot]);

  // Today's Market Story = the SAME DerivedNarrative thesis The Read shows on
  // the Morning Brief, phrased in feed voice (P2 Feed unification, D6). Built
  // over the canonically provisioned graph (P2.0) from canonical themes, never
  // the personalized ordering - prioritization is never truth.
  const argus = useArgusIntelligence();
  const read = useMemo(
    () => buildTheRead({ themes: argus.themes, graphReady: argus.ready }),
    [argus.themes, argus.ready],
  );
  const globalStory = useMemo(
    () => buildMarketStoryVM(read, argus.themes, { riskRegime: snapshot.riskRegime }),
    [read, argus.themes, snapshot.riskRegime],
  );
  const focusStory = useMemo(() => (focus ? buildFocusStory(focus, themes) : null), [focus, themes]);
  const story = focus ? focusStory : globalStory;

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
        <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
        <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] shrink-0" style={{ color: regimeColor }}>{regimeLabel}</span>
        {!isLoading && avgConv > 0 && (
          <span className="text-[9.5px] font-bold tabular-nums shrink-0" style={{ color: confColor(avgConv) }}>Conv {convScore(avgConv)}</span>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-3.5">
        {/* The network */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="w-full rounded-xl border animate-pulse" style={{ height: 440, borderColor: "rgba(148,163,184,0.18)", background: "rgba(5,9,16,0.6)" }} />
          ) : (
            <IntelligenceNetwork model={model} height={440}
              onFocusChange={onFocusChange} clearNonce={clearNonce} beamTokens={beam}
              onHoverChange={n => n ? setBeacon(nodeTokens(n)) : releaseBeacon()} />
          )}
        </div>

        {/* Today's Market Story, floats beside the map; depth from a soft wash, no frame */}
        <div className="relative px-1 pt-1 flex flex-col">
          <div aria-hidden className="absolute -inset-x-2 -top-3 bottom-0 -z-10 pointer-events-none rounded-2xl"
            style={{ background: "radial-gradient(120% 80% at 100% 0%, rgba(30,42,64,0.35), transparent 70%)" }} />
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: focus ? "#7cc7d8" : "rgba(255,255,255,0.5)" }}>
              {focus ? "Focus Read" : "Today's Market Story"}
            </span>
            <span className="ml-auto text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={focus
                ? { color: "#7cc7d8", background: "rgba(82,176,200,0.14)" }
                : { color: regimeColor, background: `${regimeColor}1a` }}>
              {focus ? focusKindLabel(focus.kind) : regimeLabel}
            </span>
          </div>

          {/* Focus headline, what the selected node is */}
          {!isLoading && focus && (
            <p className="text-[13px] font-bold leading-tight mb-2" style={{ color: "rgba(255,255,255,0.94)" }}>{focus.label}</p>
          )}

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
                    <span key={m} className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.58)" }}>{m}</span>
                  ))}
                </div>
              )}
              <p className="text-[8.5px] mt-auto pt-3" style={{ color: "rgba(255,255,255,0.28)" }}>
                {focus
                  ? "The feed below is filtered to this node · click the map background or press Esc to return to Global Market"
                  : "Select any node to drive the feed · hover to trace its transmission"}
              </p>
            </>
          ) : (
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Reading the tape, the market story resolves as themes firm up.</p>
          )}
        </div>
      </div>
    </section>
  );
}
