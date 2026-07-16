"use client";

import { useEffect, useMemo, useState } from "react";
import IntelligenceNetwork from "@/components/network/IntelligenceNetwork";
import NetworkInspector from "@/components/network/NetworkInspector";
import { buildNetworkModel } from "@/lib/network/model";
import { buildDominantInspector, buildEntityDossier, entityUid } from "@/lib/network/inspector";
import type { MarketSnapshot } from "@/lib/marketMap";
import { useArgusIntelligence } from "@/hooks/useArgusIntelligence";
import { buildTheRead } from "@/lib/theRead";
import { deriveNarratives } from "@/lib/narrativeDerivation";
import { buildMarketStoryVM } from "@/lib/feedNarrative";
import { focusKindLabel, type FeedFocus } from "@/lib/feedFocus";
import { useActiveBeamTokens, setBeacon, releaseBeacon, nodeTokens } from "@/lib/feedHighlight";
import { confColor, convScore } from "@/app/markets/marketsShared";
import {
  fetchHistoricalContext, fetchCalibrationStatus, fetchEntityPredictions,
  type HistoricalContext, type CalibrationStatus, type PredictionRow,
} from "@/lib/api";
import type { GraphNode } from "@/lib/graph/types";
import { TYPE, INK, FONT_MONO } from "@/lib/network/tokens";
import type { ThemeIntelligence } from "@/lib/types";

// session caches: memory context per theme, predictions per uid, calibration
// once — the inspector must never hammer the M3 APIs on re-render
const ctxCache = new Map<string, HistoricalContext | null>();
const predCache = new Map<string, PredictionRow[] | null>();
let calCache: CalibrationStatus | null | undefined;

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

  // The dominant DerivedNarrative — the SAME canonical derivation The Read
  // projects (narrativeDerivation over the provisioned graph). It becomes the
  // network's focal object; the projection never re-derives it.
  const argus = useArgusIntelligence();
  const narrative = useMemo(
    () => (argus.ready ? deriveNarratives()[0] ?? null : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [argus.ready, argus.themes],
  );

  const model = useMemo(
    () => buildNetworkModel(themes, snapshot, { narrative }),
    [themes, snapshot, narrative]);

  // Today's Market Story = the SAME DerivedNarrative thesis The Read shows on
  // the Morning Brief, phrased in feed voice (P2 Feed unification, D6). Built
  // over the canonically provisioned graph (P2.0) from canonical themes, never
  // the personalized ordering - prioritization is never truth.
  const read = useMemo(
    () => buildTheRead({ themes: argus.themes, graphReady: argus.ready }),
    [argus.themes, argus.ready],
  );
  const globalStory = useMemo(
    () => buildMarketStoryVM(read, argus.themes, { riskRegime: snapshot.riskRegime }),
    [read, argus.themes, snapshot.riskRegime],
  );
  // ── M3 memory + prediction accountability (session-cached, honest on failure)
  // The active subject: the selected entity when the graph has navigated,
  // else the dominant thesis's anchor theme.
  const selectedNode = useMemo(
    () => (focus ? model.nodes.find(n => n.id === focus.nodeId) ?? null : null),
    [focus, model]);
  const anchorThemeId = useMemo(() => {
    const name = read.thesis.data?.members[0]?.name?.toLowerCase();
    return name ? themes.find(t => t.name.toLowerCase() === name)?.id ?? null : null;
  }, [read, themes]);
  const activeThemeId = useMemo(() => {
    if (!selectedNode) return anchorThemeId;
    if (selectedNode.cls !== "theme") return null;
    return themes.find(t => t.name.toLowerCase() === selectedNode.label.toLowerCase())?.id ?? null;
  }, [selectedNode, anchorThemeId, themes]);
  const activeUid = useMemo(() => {
    if (selectedNode) return entityUid(selectedNode, themes);
    return anchorThemeId ? `theme:ontology:${anchorThemeId}` : null;
  }, [selectedNode, anchorThemeId, themes]);

  const [memoryCtx, setMemoryCtx] = useState<HistoricalContext | null | undefined>(undefined);
  const [predictions, setPredictions] = useState<PredictionRow[] | null | undefined>(undefined);
  const [calibration, setCalibration] = useState<CalibrationStatus | null | undefined>(calCache);
  useEffect(() => {
    let alive = true;
    if (activeThemeId) {
      if (ctxCache.has(activeThemeId)) setMemoryCtx(ctxCache.get(activeThemeId));
      else fetchHistoricalContext(activeThemeId).then(ctx => {
        ctxCache.set(activeThemeId, ctx);
        if (alive) setMemoryCtx(ctx);
      });
    } else setMemoryCtx(null);
    if (activeUid) {
      if (predCache.has(activeUid)) setPredictions(predCache.get(activeUid));
      else fetchEntityPredictions(activeUid).then(rows => {
        predCache.set(activeUid, rows);
        if (alive) setPredictions(rows);
      });
    } else setPredictions(null);
    if (calCache === undefined) {
      fetchCalibrationStatus().then(cal => { calCache = cal; if (alive) setCalibration(cal); });
    }
    return () => { alive = false; };
  }, [activeThemeId, activeUid]);

  const dominantVM = useMemo(
    () => buildDominantInspector({
      read, story: globalStory, themes, model, regimeLabel:
        snapshot.regimeLabel || (snapshot.riskRegime === "risk-on" ? "Risk-On" : snapshot.riskRegime === "risk-off" ? "Risk-Off" : "Mixed"),
      historicalContext: focus ? undefined : memoryCtx,
      calibration, predictions: focus ? undefined : predictions,
    }),
    [read, globalStory, themes, model, snapshot, memoryCtx, calibration, predictions, focus]);
  const entityVM = useMemo(
    () => (focus ? buildEntityDossier({
      nodeId: focus.nodeId, model, themes,
      historicalContext: memoryCtx, calibration, predictions,
    }) : null),
    [focus, model, themes, memoryCtx, calibration, predictions]);
  const inspectorVM = entityVM ?? dominantVM;

  // inspector → canvas navigation (chain hops, exposure chips)
  const [navId, setNavId] = useState<string | null>(null);
  useEffect(() => { if (!focus) setNavId(null); }, [focus]);

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
      {isLoading ? (
        <div className="w-full rounded-xl border animate-pulse" style={{ height: 500, borderColor: "rgba(148,163,184,0.16)", background: "rgba(5,9,16,0.6)" }} />
      ) : (
        <IntelligenceNetwork model={model} height={480}
          onFocusChange={onFocusChange} clearNonce={clearNonce} beamTokens={beam}
          focusId={navId}
          onHoverChange={n => n ? setBeacon(nodeTokens(n)) : releaseBeacon()}
          railMeta={
            <>
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="tg-live-dot absolute inline-flex h-full w-full rounded-full" style={{ background: "#34d399" }} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "#34d399" }} />
              </span>
              <span className="font-bold uppercase shrink-0" style={{ fontSize: TYPE.xs, letterSpacing: "0.08em", color: regimeColor }}>{regimeLabel}</span>
              {avgConv > 0 && (
                <span className="font-bold tabular-nums shrink-0" style={{ fontSize: TYPE.xs, fontFamily: FONT_MONO, color: confColor(avgConv) }}>Conv {convScore(avgConv)}</span>
              )}
            </>
          }
          aside={
            <>
              <div className="flex items-center">
                <span className="ml-auto font-bold uppercase rounded"
                  style={{ fontSize: TYPE.xs, letterSpacing: "0.06em", padding: "2px 8px",
                           ...(focus
                             ? { color: "#7cc7d8", background: "rgba(82,176,200,0.14)" }
                             : { color: regimeColor, background: `${regimeColor}1a` }) }}>
                  {focus ? focusKindLabel(focus.kind) : "Dominant Thesis"}
                </span>
              </div>
              {inspectorVM ? (
                <>
                  <NetworkInspector vm={inspectorVM} onNavigate={setNavId} />
                  <p className="mt-auto" style={{ fontSize: TYPE.xs, color: INK.whisper, paddingTop: 8 }}>
                    {focus
                      ? "The feed below is filtered to this node · Esc returns to the dominant thesis"
                      : "Select any node for its dossier · hover to trace its transmission"}
                  </p>
                </>
              ) : (
                <p style={{ fontSize: TYPE.sm, color: INK.support }}>Reading the tape — the market story resolves as themes firm up.</p>
              )}
            </>
          }
        />
      )}
    </section>
  );
}
