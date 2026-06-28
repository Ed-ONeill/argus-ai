"use client";

import { useMemo, useState, useEffect } from "react";
import { Play, Pause } from "lucide-react";
import NetworkGraph from "@/components/graph/NetworkGraph";
import { buildMarketMap, buildMarketStory, type MarketSnapshot } from "@/lib/marketMap";
import { buildFocusStory, focusKindLabel, type FeedFocus } from "@/lib/feedFocus";
import { useActiveBeamTokens, setBeacon, releaseBeacon, nodeTokens } from "@/lib/feedHighlight";
import { confColor, convScore } from "@/app/markets/marketsShared";
import type { GraphNode } from "@/lib/graph/types";
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
  /** Page-level focus (the selected node, mapped). null = Global Market mode. */
  focus?: FeedFocus | null;
  /** Fired when the graph selection changes — drives the whole page. */
  onFocusChange?: (node: GraphNode | null) => void;
  /** Increment to release the selection from outside (exit Focus mode). */
  clearNonce?: number;
  /** Global market energy 0..1 — modulates the graph's motion temperament. */
  energy?: number;
}

// Replay clock: 0 → "9:30 AM", 1 → "Now" (illustrative reconstruction of the day).
function replayClock(p: number): string {
  if (p >= 0.999) return "Now";
  const mins = 570 + p * 390;            // 9:30 (570') → 16:00 (960')
  const h = Math.floor(mins / 60), m = Math.floor(mins % 60);
  return `${((h + 11) % 12) + 1}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function ArgusMarketMap({ themes, snapshot, isLoading, focus, onFocusChange, clearNonce, energy }: Props) {
  const beam = useActiveBeamTokens();

  // ── Market Replay ──────────────────────────────────────────────────────────
  const [replaying, setReplaying] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      setProgress(p => (p + dt / 14 >= 1 ? 1 : p + dt / 14));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  useEffect(() => { if (progress >= 1) setPlaying(false); }, [progress]);
  const startReplay = () => { setReplaying(true); setProgress(0); setPlaying(true); };
  const togglePlay = () => { if (progress >= 1) setProgress(0); setPlaying(p => !p); };
  const exitReplay = () => { setReplaying(false); setPlaying(false); };

  const model = useMemo(() => buildMarketMap(themes, snapshot), [themes, snapshot]);
  const globalStory = useMemo(() => buildMarketStory(themes, snapshot), [themes, snapshot]);
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
        {/* The map */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="w-full rounded-xl border animate-pulse" style={{ height: 440, borderColor: "rgba(82,176,200,0.2)", background: "rgba(5,9,16,0.6)" }} />
          ) : (
            <>
              <NetworkGraph model={model} height={440} title="Argus Market Map" subtitle="Capital Flow" showTimeline={false} showFilters={false}
                onFocusChange={onFocusChange} clearNonce={clearNonce} beamTokens={beam} energy={energy}
                replayProgress={replaying ? progress : null}
                onHoverChange={n => n ? setBeacon(nodeTokens(n)) : releaseBeacon()} />

              {/* Market Replay — scrub how today's narrative built from the open */}
              {hasMap && (
                <div className="mt-2 flex items-center gap-2.5 min-h-[26px]">
                  {!replaying ? (
                    <button onClick={startReplay}
                      className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors hover:bg-white/[0.05]"
                      style={{ color: "rgba(124,199,216,0.9)", border: "1px solid rgba(82,176,200,0.22)" }}>
                      <Play size={9} className="translate-x-px" /> Replay the day
                    </button>
                  ) : (
                    <>
                      <span className="text-[8px] font-black uppercase tracking-[0.16em] shrink-0" style={{ color: "#7cc7d8" }}>Replay</span>
                      <button onClick={togglePlay} className="flex items-center justify-center rounded-full shrink-0 transition-colors hover:bg-white/10" style={{ background: "rgba(82,176,200,0.16)", color: "#7cc7d8", width: 22, height: 22 }}>
                        {playing ? <Pause size={10} /> : <Play size={10} className="translate-x-px" />}
                      </button>
                      <span className="text-[8.5px] font-bold tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>9:30</span>
                      <input type="range" min={0} max={1} step={0.001} value={progress}
                        onChange={e => { setProgress(parseFloat(e.target.value)); setPlaying(false); }}
                        className="flex-1 h-1 cursor-pointer" style={{ accentColor: "#52b0c8" }} />
                      <span className="text-[10px] font-black tabular-nums shrink-0 text-right" style={{ color: "#7cc7d8", minWidth: 50 }}>{replayClock(progress)}</span>
                      <button onClick={exitReplay} className="text-[9px] font-semibold shrink-0 transition-colors hover:text-white" style={{ color: "rgba(255,255,255,0.5)" }}>Live →</button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Today's Market Story — floats beside the map; depth from a soft wash, no frame */}
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

          {/* Focus headline — what the selected node is */}
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
                  ? "The feed below is filtered to this node · click the map background to return to Global Market"
                  : "Select any node to drive the feed · hover to trace its transmission"}
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
