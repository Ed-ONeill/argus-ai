"use client";

import { useMemo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { X, ArrowUpRight, Maximize2, FileText } from "lucide-react";
import { TickerChip } from "@/components/common/TickerChip";
import { useArgusIntelligence } from "@/hooks/useArgusIntelligence";
import { buildCrossIntel } from "@/lib/crossIntel";
import { cachedProfile } from "@/lib/profileCache";
import { getThemeMemory, themeKey } from "@/lib/themeSnapshots";
import { evaluateEvidenceForNode } from "@/lib/evidenceEngine";
import { resolveDrawerEntity, type DrawerEntity } from "@/lib/drawerEntity";
import {
  dirColor as sharedDirColor, nodeColor, NODE_COLOR, evColor, fmtDate, fmtDay, fmtCompact, trunc,
  buildTimeline, buildMarketStructure, buildRelationshipMap, collectCurrentThemes,
  recordDailyMemorySnapshot, explorerHref,
  EMPTY_TIMELINE, EMPTY_MAP,
  type ForecastVM, type TimelineVM, type MarketStructureVM, type MapNode, type MapVM,
} from "@/lib/intelligenceShared";
import { confColor, cleanThemeName } from "@/app/markets/marketsShared";
import { setActiveTheme, setActiveDriver, setActiveSector, setActiveCompany } from "@/lib/intelligenceContext";
import type { IntelContext } from "@/lib/intelligenceContext";

/**
 * IntelligenceDrawer - the reusable cross-page intelligence panel (Phase 5).
 * Opens from any active context and shows the connected picture across Feed,
 * Markets, Industries, M&A, Private and Listen, plus historical memory. Dark and
 * institutional, self-contained so it overlays cleanly on any page. The shared
 * view-model builders live in lib/intelligenceShared and are reused by the
 * Intelligence Explorer (/explore). No em/en dashes.
 */

const A = (n: number) => `rgba(255,255,255,${n})`;

/** Ease a number up from 0 on mount / value change. Subtle, ~600ms, cubic ease-out. */
function useCountUp(target: number, duration = 600): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="px-4 py-2.5 border-t" style={{ borderColor: A(0.06) }}>
      <p className="text-[8px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: A(0.34) }}>{label}</p>
      {children}
    </motion.div>
  );
}

interface GraphRel { source: string; target: string; type: string; strength: number }

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[12px] font-black tabular-nums leading-none" style={{ color: accent ? "#7cc7d8" : A(0.9) }}>{value}</p>
      <p className="text-[7px] font-bold uppercase tracking-wider mt-0.5" style={{ color: A(0.4) }}>{label}</p>
    </div>
  );
}

function RelList({ rels, accent }: { rels: GraphRel[]; accent: string }) {
  return (
    <ul className="space-y-1">
      {rels.map((r, i) => (
        <li key={i} className="text-[10.5px] leading-snug flex items-center gap-1.5" style={{ color: A(0.7) }}>
          <span className="truncate" style={{ color: A(0.9) }}>{r.source}</span>
          <span className="shrink-0 px-1 py-px rounded text-[8px] font-semibold uppercase tracking-wide" style={{ color: accent, background: `${accent}1f` }}>{r.type.replace(/_/g, " ")}</span>
          <span className="truncate" style={{ color: A(0.9) }}>{r.target}</span>
          <span className="ml-auto shrink-0 tabular-nums text-[9px]" style={{ color: A(0.4) }}>{r.strength}</span>
        </li>
      ))}
    </ul>
  );
}

function DrawerBody({ ctx, onClose }: { ctx: IntelContext; onClose: () => void }) {
  // Canonical intelligence provisioning (P2.0): one shared input set and one
  // graph build path for every surface (hooks/useArgusIntelligence). The hook
  // gathers feed/deals/episodes/snapshots and accrues daily theme memory.
  const graph = useArgusIntelligence();
  const { themes, clusters, deals, episodes } = graph;

  const intel = useMemo(
    () => buildCrossIntel(ctx, { themes, clusters, deals, episodes }),
    [ctx, themes, clusters, deals, episodes],
  );

  const memory = useMemo(
    () => (intel.theme ? getThemeMemory(themeKey(intel.theme)) : { hasHistory: false, lines: [] as string[] }),
    [intel.theme],
  );

  // Entity-aware routing (Phase 16): resolve which entity the drawer renders and
  // which graph key every graph-backed section reads. Companies and ETFs resolve
  // by ticker, never through the parent theme.
  const isSymbol = ctx.kind === "company" || ctx.kind === "etf";
  const entity = useMemo<DrawerEntity>(
    () => resolveDrawerEntity(ctx, { themeName: intel.theme?.name ?? null, relatedCompanies: intel.companies }),
    // graph.ready re-resolves once the graph singleton is built
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph.ready, ctx, intel.theme, intel.companies],
  );
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && graph.ready) {
      console.debug(`[IntelligenceDrawer] routed ${ctx.kind} "${ctx.label}" -> graphKey "${entity.graphKey}" (node: ${entity.node?.id ?? "none"}, marketStructure: ${entity.showMarketStructure})`);
    }
  }, [graph.ready, ctx.kind, ctx.label, entity]);

  const companyReport = useMemo(
    () => (graph.ready && isSymbol ? graph.getCompanyReport(entity.graphKey) : null),
    [graph, isSymbol, entity.graphKey],
  );
  const themeReport = useMemo(
    () => (graph.ready && !isSymbol ? graph.getThemeReport(entity.graphKey) : null),
    [graph, isSymbol, entity.graphKey],
  );
  const strongest = (isSymbol ? companyReport?.strongestRelationships : themeReport?.strongestRelationships) ?? [];

  // Current theme exposure for symbol drawers: the resolved parent theme plus the
  // graph's connected themes, deduped. Display-only read of already-computed data.
  const currentThemes = useMemo<string[]>(
    () => (isSymbol ? collectCurrentThemes(intel.theme?.name, (companyReport?.relatedThemes ?? []).map(t => t.label)) : []),
    [isSymbol, intel.theme, companyReport],
  );

  // Evidence read for the company view (existing engine, read-only). Powers the
  // Signal Confidence header number and the Evidence panel; hidden on thin signal.
  const evidence = useMemo(() => {
    if (!graph.ready || !isSymbol) return null;
    const ev = evaluateEvidenceForNode(entity.graphKey);
    return ev.found && ev.verdict !== "insufficient_signal" ? ev : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.ready, isSymbol, entity.graphKey]);

  // The hero Signal number eases up on open; real value, animated presentation only.
  const signalValue = useCountUp(evidence?.overallTrust ?? 0);

  const accentColor = ctx.color ?? "#52b0c8";

  // Forward-looking forecast, normalized across theme / company / sector predictions.
  // Renders only when the prediction resolved and is not insufficient_signal.
  // D8 (P2.7): buildForecast is deleted - the drawer reads the SAME cached
  // profile forward view Explorer holds (one entity, one forward view).
  const forecast = useMemo<ForecastVM | null>(
    () => {
      if (!graph.ready) return null;
      const p = cachedProfile(entity.graphKey);
      const f = p.thesis.data?.forward;
      return f ? { direction: f.direction, probability: f.probability, confidence: f.confidence, timeframe: f.timeframe, reasons: f.reasons, invalidation: p.risks.data?.invalidation ?? null } : null;
    },
    [graph, ctx.kind, ctx.label, entity.graphKey],
  );

  const dirColor = (d: string) => sharedDirColor(d, accentColor);

  // Intelligence Timeline (Memory Engine, read-only). Record one snapshot per day per
  // session so history accrues. The timeline itself now renders only on theme-shaped
  // drawers; the deep company timeline lives in the Explorer.
  const [memVersion, setMemVersion] = useState(0);
  useEffect(() => {
    if (!graph.ready) return;
    if (recordDailyMemorySnapshot()) setMemVersion(v => v + 1);
  }, [graph.ready]);

  const timeline = useMemo<TimelineVM>(() => {
    if (!graph.ready || isSymbol) return EMPTY_TIMELINE;
    return buildTimeline(entity.graphKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.ready, isSymbol, memVersion, entity.graphKey]);

  // Market Structure (symbols only; reads latestMarketData from the routed node).
  // The candidate walk (exact ticker first, then aliases and related tickers) lives
  // in resolveDrawerEntity; themes never show market structure.
  const marketStructure = useMemo<MarketStructureVM | null>(() => {
    if (!graph.ready || !entity.showMarketStructure) return null;
    const lmd = entity.node?.metadata?.latestMarketData;
    return lmd && typeof lmd === "object" ? buildMarketStructure(lmd as Record<string, unknown>) : null;
  }, [graph.ready, entity]);

  // Relationship Map (Intelligence Graph, read-only). Reuses the graph the hook built.
  const [mapHoverNode, setMapHoverNode] = useState<string | null>(null);
  const [mapHoverEdge, setMapHoverEdge] = useState<string | null>(null);
  const [mapSelected, setMapSelected] = useState<string | null>(null);
  const relMap = useMemo<MapVM>(() => {
    if (!graph.ready || isSymbol) return EMPTY_MAP; // company map lives in the Explorer now
    return buildRelationshipMap(entity.graphKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.ready, isSymbol, entity.graphKey]);
  const mapActive = mapSelected ?? mapHoverNode;

  // The network is navigation: clicking a pinned node refocuses the whole drawer
  // onto that entity through the existing context setters. No new routing logic.
  const refocusFromNode = (n: MapNode) => {
    if (n.type === "Company" || n.type === "ETF") setActiveCompany(n.label, accentColor);
    else if (n.type === "Theme" || n.type === "Narrative") setActiveTheme(n.label, accentColor);
    else if (n.type === "Macro" || n.type === "MacroSeries") setActiveDriver(n.label, accentColor);
    else if (n.type === "Sector") setActiveSector(n.label, accentColor);
  };
  const refocusable = (t: string) => ["Company", "ETF", "Theme", "Narrative", "Macro", "MacroSeries", "Sector"].includes(t);

  const mapDetail = useMemo(() => {
    if (mapHoverEdge) { const e = relMap.edges.find(x => x.id === mapHoverEdge); if (e) return `${e.from.label} ${e.type.replace(/_/g, " ")} ${e.to.label}  ·  strength ${e.strength}  ·  evidence ${e.evidenceCount}  ·  ${e.sources} source${e.sources === 1 ? "" : "s"}`; }
    const id = mapHoverNode ?? mapSelected;
    if (id) {
      const nd = relMap.nodes.find(x => x.id === id);
      if (nd) {
        const base = `${nd.label}  ·  ${nd.type}  ·  confidence ${nd.confidence}  ·  ${nd.relCount} relationship${nd.relCount === 1 ? "" : "s"}`;
        return mapSelected === nd.id && nd.degree !== 0 && refocusable(nd.type) ? `${base}  ·  click again to focus` : base;
      }
    }
    return "Hover to explore. Click to pin, click a pinned node to focus the drawer on it.";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapHoverEdge, mapHoverNode, mapSelected, relMap]);

  // Opportunity / Risk as an analyst note; symbols also carry the invalidation
  // condition from the forward view so the falsifier sits next to the trade read.
  const oppRiskGrid = (
    <div>
      <div className="grid grid-cols-2 gap-px" style={{ background: A(0.06) }}>
        <div className="px-4 py-2.5" style={{ background: "#0b0f18" }}>
          <p className="text-[8px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(52,211,153,0.7)" }}>Forward View · prediction engine</p>
          <p className="text-[10.5px] leading-snug" style={{ color: A(0.66) }}>
            {forecast ? `${forecast.direction}${forecast.reasons[0] ? ` - ${forecast.reasons[0]}` : ""}` : "No resolvable forward view yet."}
          </p>
        </div>
        <div className="px-4 py-2.5" style={{ background: "#0b0f18" }}>
          <p className="text-[8px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(248,113,113,0.75)" }}>Risk · shared engines</p>
          <p className="text-[10.5px] leading-snug" style={{ color: A(0.66) }}>
            {(graph.ready && (cachedProfile(entity.graphKey).risks.data?.contradictions[0]?.detail ?? cachedProfile(entity.graphKey).risks.data?.invalidation)) || "No recorded risk records yet."}
          </p>
        </div>
      </div>
      {isSymbol && forecast?.invalidation && (
        <div className="px-4 py-2 border-t" style={{ borderColor: A(0.06), background: "#0b0f18" }}>
          <p className="text-[8px] font-bold uppercase tracking-[0.14em] mb-0.5" style={{ color: "rgba(245,158,11,0.7)" }}>Invalidation</p>
          <p className="text-[10.5px] leading-snug" style={{ color: A(0.66) }}>{forecast.invalidation}</p>
        </div>
      )}
    </div>
  );

  // Shared sections, ordered differently by the company and theme layouts below.
  const relatedPagesSec = (
    <Section label="Related pages">
      <div className="flex flex-wrap gap-1.5">
        {intel.relatedPages.map(p => (
          <Link key={p.label} href={p.href} onClick={onClose}
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md transition-colors hover:bg-white/10"
            style={{ color: A(0.8), border: `1px solid ${A(0.12)}`, background: A(0.03) }}>
            {p.label} <span style={{ color: A(0.4) }}>{p.note}</span> <ArrowUpRight size={9} style={{ color: A(0.4) }} />
          </Link>
        ))}
      </div>
    </Section>
  );
  const sectorsSec = intel.sectors.length > 0 && (
    <Section label="Related sectors">
      <div className="flex flex-wrap gap-1.5">{intel.sectors.map(s => <span key={s} className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "rgba(82,176,200,0.12)", color: "rgba(124,199,216,0.9)" }}>{s}</span>)}</div>
    </Section>
  );
  const storiesSec = intel.stories.length > 0 && (
    <Section label={isSymbol ? "Supporting stories" : "Related stories"}>
      <ul className="space-y-1.5">{intel.stories.map(c => (
        <li key={c.id} className="text-[10.5px] leading-snug flex gap-1.5" style={{ color: A(0.66) }}>
          <span className="shrink-0 mt-0.5" style={{ color: accentColor }}>•</span>{c.primary.title}
        </li>
      ))}</ul>
    </Section>
  );
  const dealsSec = intel.deals.length > 0 && (
    <Section label="Related M&A deals">
      <ul className="space-y-1.5">{intel.deals.map(d => (
        <li key={d.id} className="text-[10.5px] leading-snug flex gap-1.5" style={{ color: A(0.66) }}>
          <span className="shrink-0 mt-0.5" style={{ color: "#a78bfa" }}>•</span>{d.title}
        </li>
      ))}</ul>
    </Section>
  );
  const listenSec = intel.listen.length > 0 && (
    <Section label="Related Listen conversations">
      <ul className="space-y-1.5">{intel.listen.map(ep => (
        <li key={ep.id} className="text-[10.5px] leading-snug flex gap-1.5" style={{ color: A(0.66) }}>
          <span className="shrink-0 mt-0.5" style={{ color: "#2563eb" }}>•</span>{ep.title}
        </li>
      ))}</ul>
    </Section>
  );
  // P2.7 (D8): the templated "private capital read" is deleted; the section
  // now shows the shared forward view when one resolves.
  const privateReadSec = forecast ? (
    <Section label="Forward view · prediction engine"><p className="text-[11px] leading-snug" style={{ color: A(0.7) }}>{forecast.direction}{forecast.reasons[0] ? ` - ${forecast.reasons[0]}` : ""}</p></Section>
  ) : null;
  const recentChangeSec = (
    <Section label="Recent change">
      {memory.hasHistory
        ? <ul className="space-y-1">{memory.lines.map((l, i) => <li key={i} className="text-[11px] leading-snug flex gap-1.5" style={{ color: A(0.72) }}><span className="shrink-0" style={{ color: "#34d399" }}>+</span>{l}</li>)}</ul>
        : <p className="text-[10.5px] italic" style={{ color: A(0.42) }}>Historical memory begins tracking from today.</p>}
    </Section>
  );
  const nextWatchSec = (
    <Section label={isSymbol ? "Next Watch" : "Next thing to watch"}><p className="text-[11px] leading-snug" style={{ color: A(0.72) }}>Watch {intel.nextWatch}.</p></Section>
  );
  const forecastSec = forecast && (
    <Section label={isSymbol ? "Forward View" : "Forecast"}>
      <div className="flex items-center gap-4 mb-1.5">
        <span className="text-[15px] font-black capitalize leading-none tracking-tight" style={{ color: dirColor(forecast.direction) }}>{forecast.direction}</span>
        {forecast.probability !== null && (
          <span className="flex items-baseline gap-1"><span className="text-[13px] font-black tabular-nums leading-none" style={{ color: A(0.9) }}>{forecast.probability}%</span><span className="text-[7px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>probability</span></span>
        )}
        <span className="flex items-baseline gap-1"><span className="text-[13px] font-black tabular-nums leading-none" style={{ color: A(0.9) }}>{forecast.confidence}</span><span className="text-[7px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>confidence</span></span>
      </div>
      {isSymbol && forecast.probability !== null && (
        <div className="h-[3px] rounded-full mb-1.5 overflow-hidden" style={{ background: A(0.08) }}>
          <motion.div className="h-full rounded-full" initial={{ width: 0 }} whileInView={{ width: `${forecast.probability}%` }} viewport={{ once: true }}
            transition={{ duration: 0.7, ease: "easeOut" }} style={{ background: dirColor(forecast.direction) }} />
        </div>
      )}
      {forecast.timeframe && <p className="text-[10px] mb-1.5" style={{ color: A(0.55) }}>Expected timeframe: {forecast.timeframe}.</p>}
      <ul className="space-y-1 mb-1.5">
        {forecast.reasons.map((r, i) => (
          <li key={i} className="text-[10.5px] leading-snug flex gap-1.5" style={{ color: A(0.7) }}>
            <span className="shrink-0 mt-0.5" style={{ color: accentColor }}>›</span>{r}
          </li>
        ))}
      </ul>
      {!isSymbol && forecast.invalidation && <p className="text-[10px] leading-snug mb-1.5" style={{ color: A(0.55) }}>Invalidated if: {forecast.invalidation}</p>}
      <p className="text-[9px] italic leading-snug" style={{ color: A(0.38) }}>Probabilistic estimate derived from current signals, not a certainty and not investment advice.</p>
    </Section>
  );

  // Zone 3: Memory. Timeline, evolution and analogs (Memory Engine, read-only).
  const timelineSec = (
    <Section label="Intelligence Timeline">
      {!timeline.available ? (
        <p className="text-[10.5px] italic leading-snug" style={{ color: A(0.4) }}>Argus is still building historical intelligence for this entity.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-y-2.5 gap-x-3 mb-3">
            <Stat label="First Seen" value={fmtDate(timeline.firstSeen!)} />
            <Stat label="Snapshots" value={String(timeline.snapshots)} />
            <Stat label="Current Streak" value={`${timeline.streak} session${timeline.streak === 1 ? "" : "s"}`} />
            <Stat label="Conviction" value={String(timeline.conviction)} accent />
            <Stat label="Analogs" value={String(timeline.analogsCount)} />
            {timeline.confidenceGained !== undefined && <Stat label="Conf. Gained" value={`${timeline.confidenceGained > 0 ? "+" : ""}${timeline.confidenceGained}`} />}
          </div>

          {timeline.patterns.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {timeline.patterns.map(p => (
                <span key={p} className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color: accentColor, background: `${accentColor}1a` }}>{p.replace(/_/g, " ")}</span>
              ))}
            </div>
          )}

          <ul className="space-y-2">
            {timeline.events.map((e, i) => (
              <li key={i} className="flex gap-2">
                <div className="flex flex-col items-center pt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: evColor(e.type) }} />
                  {i < timeline.events.length - 1 && <span className="w-px flex-1 mt-1" style={{ background: A(0.08) }} />}
                </div>
                <div className="min-w-0 flex-1 pb-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-bold" style={{ color: A(0.9) }}>{e.title}</span>
                    {e.confidence !== undefined && <span className="text-[8px] tabular-nums" style={{ color: A(0.4) }}>{e.confidence}</span>}
                    <span className="ml-auto text-[8px] tabular-nums shrink-0" style={{ color: A(0.35) }}>{fmtDay(e.date)}</span>
                  </div>
                  <p className="text-[10px] leading-snug mt-0.5" style={{ color: A(0.6) }}>{e.detail}</p>
                </div>
              </li>
            ))}
          </ul>

          {timeline.evolution.length > 0 && (
            <div className="mt-3 pt-2.5 border-t" style={{ borderColor: A(0.06) }}>
              <p className="text-[8px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: A(0.34) }}>Evolution</p>
              <ul className="space-y-1">{timeline.evolution.map((l, i) => <li key={i} className="text-[10px] leading-snug flex gap-1.5" style={{ color: A(0.66) }}><span className="shrink-0 mt-0.5" style={{ color: accentColor }}>›</span>{l}</li>)}</ul>
            </div>
          )}

          {timeline.analogs.length > 0 && (
            <div className="mt-3 pt-2.5 border-t" style={{ borderColor: A(0.06) }}>
              <p className="text-[8px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: A(0.34) }}>Similar Historical Patterns</p>
              <ul className="space-y-1.5">{timeline.analogs.map((a, i) => (
                <li key={i} className="flex items-center gap-2 text-[10.5px]" style={{ color: A(0.8) }}>
                  <span className="w-1 h-1 rounded-full shrink-0" style={{ background: accentColor }} />
                  <span className="truncate">{a.label}</span>
                  <span className="ml-auto tabular-nums text-[9px] shrink-0" style={{ color: A(0.45) }}>Similarity {a.similarity}%</span>
                </li>
              ))}</ul>
            </div>
          )}
        </>
      )}
    </Section>
  );

  // Zone 3: Network. Same deterministic radial layout and graph reads; presentation
  // upgraded: orbit guides, confidence-driven edge opacity, accent-anchored center.
  // Sparse graphs fall back to a compact relationship spine instead of an empty map.
  const showSpine = !relMap.available || relMap.nodes.length < 4;
  const networkSec = (
    <Section label={isSymbol ? "Intelligence Network" : "Relationship Map"}>
      {showSpine ? (
        strongest.length > 0 ? (
          <div className="space-y-1.5">
            {strongest.slice(0, 3).map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-[10.5px]">
                <span className="shrink-0 font-semibold" style={{ color: A(0.88) }}>{r.source}</span>
                <span className="h-px flex-1" style={{ background: A(0.14) }} />
                <span className="shrink-0 text-[7.5px] font-bold uppercase tracking-wider" style={{ color: accentColor }}>{r.type.replace(/_/g, " ")}</span>
                <span className="h-px flex-1" style={{ background: A(0.14) }} />
                <span className="shrink-0 font-semibold" style={{ color: A(0.88) }}>{r.target}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10.5px] italic leading-snug" style={{ color: A(0.4) }}>No connected intelligence has been identified yet.</p>
        )
      ) : (
        <>
          <motion.svg initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: "easeOut" }}
            viewBox={`0 0 ${relMap.width} ${relMap.height}`} className="w-full select-none" style={{ height: 212 }}>
            <circle cx={relMap.cx} cy={relMap.cy} r={relMap.r1} fill="none" stroke="#ffffff" strokeOpacity={0.05} />
            <circle cx={relMap.cx} cy={relMap.cy} r={relMap.r2} fill="none" stroke="#ffffff" strokeOpacity={0.03} />
            {relMap.edges.map(e => {
              const on = !mapActive || e.a === mapActive || e.b === mapActive;
              const mx = (e.from.x + e.to.x) / 2, my = (e.from.y + e.to.y) / 2;
              return (
                <g key={e.id} onMouseEnter={() => setMapHoverEdge(e.id)} onMouseLeave={() => setMapHoverEdge(null)}>
                  <line x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y}
                    stroke={mapHoverEdge === e.id ? accentColor : "#ffffff"}
                    strokeWidth={(0.5 + e.strength / 100 * 1.5) * (on && mapActive ? 1.25 : 1)}
                    strokeOpacity={on ? (mapActive ? 0.2 : 0.1) + e.confidence / 100 * 0.45 : 0.04}
                    style={{ transition: "stroke-opacity 220ms ease, stroke-width 220ms ease, stroke 220ms ease" }} />
                  {e.evidenceCount > 1 && <circle cx={mx} cy={my} r={Math.min(2.4, 0.8 + e.evidenceCount * 0.3)} fill="#ffffff" fillOpacity={on ? 0.35 : 0.06} style={{ transition: "fill-opacity 220ms ease" }} />}
                </g>
              );
            })}
            {relMap.nodes.map(node => {
              const connected = !mapActive || node.id === mapActive || relMap.edges.some(e => (e.a === mapActive && e.b === node.id) || (e.b === mapActive && e.a === node.id));
              const isCenter = node.degree === 0;
              const hot = mapHoverNode === node.id || mapSelected === node.id;
              const col = isCenter || node.id === mapSelected ? accentColor : nodeColor(node.type);
              return (
                <g key={node.id} style={{ cursor: "pointer" }}
                  onMouseEnter={() => setMapHoverNode(node.id)} onMouseLeave={() => setMapHoverNode(null)}
                  onClick={() => {
                    if (mapSelected === node.id && !isCenter && refocusable(node.type)) { refocusFromNode(node); return; }
                    setMapSelected(s => (s === node.id ? null : node.id));
                  }}>
                  {hot && <circle cx={node.x} cy={node.y} r={node.r + 4.5} fill={col} opacity={0.14} style={{ transition: "opacity 200ms ease" }} />}
                  <circle cx={node.x} cy={node.y} r={hot ? node.r * 1.12 : node.r} fill={isCenter ? "#101722" : "#0b0f18"} stroke={col}
                    strokeWidth={node.id === mapSelected ? 2.4 : isCenter ? 2 : hot ? 1.9 : 1.25}
                    opacity={connected ? 1 : 0.22}
                    style={{ transition: "r 160ms ease, opacity 220ms ease, stroke-width 160ms ease, stroke 220ms ease" }} />
                  {node.degree !== 2 && (
                    <text x={node.x} y={node.y + node.r + 7} textAnchor="middle" fontSize={isCenter ? 8.5 : 6.5} fontWeight={isCenter ? 700 : 400}
                      fill={isCenter ? accentColor : "#ffffff"} fillOpacity={isCenter ? 0.95 : connected ? 0.78 : 0.18}
                      style={{ transition: "fill-opacity 220ms ease" }}>{trunc(node.label)}</text>
                  )}
                </g>
              );
            })}
          </motion.svg>
          <p className="mt-1 text-[9.5px] leading-snug tabular-nums" style={{ color: A(0.55), minHeight: 24 }}>{mapDetail}</p>
          <div className="flex items-center gap-3 mt-0.5">
            {[["Company", NODE_COLOR.Company], ["Theme", NODE_COLOR.Theme], ["Driver", NODE_COLOR.Macro], ["Sector", NODE_COLOR.Sector]].map(([lbl, c]) => (
              <span key={lbl} className="flex items-center gap-1 text-[7.5px] font-bold uppercase tracking-wider" style={{ color: A(0.35) }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: c, opacity: 0.75 }} />{lbl}
              </span>
            ))}
          </div>
        </>
      )}
    </Section>
  );
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b shrink-0" style={{ borderColor: A(0.08) }}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor }} />
              <span className="text-[8px] font-bold uppercase tracking-[0.16em]" style={{ color: accentColor }}>{intel.kindLabel}</span>
              <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: A(0.35) }}>Intelligence</span>
            </div>
            <h2 className={`${isSymbol ? "text-[23px] tracking-tight" : "text-[17px]"} font-black leading-none`} style={{ color: A(0.97) }}>{isSymbol ? entity.title : intel.title}</h2>
            {isSymbol && entity.subtitle && (
              <p className="text-[9.5px] font-semibold mt-1" style={{ color: A(0.48) }}>Exposed to <span style={{ color: A(0.66) }}>{cleanThemeName(entity.subtitle)}</span></p>
            )}
          </div>
          {!isSymbol && intel.conviction !== null && (
            <div className="text-right shrink-0">
              <p className="text-[20px] font-black tabular-nums leading-none" style={{ color: confColor(intel.conviction) }}>{intel.conviction}</p>
              <p className="text-[7px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>Conviction</p>
            </div>
          )}
          {isSymbol && evidence && (
            <div className="text-right shrink-0 pr-1">
              <p className="text-[34px] font-black tabular-nums leading-none tracking-tight" style={{ color: confColor(evidence.overallTrust) }}>{signalValue}</p>
              <p className="text-[7px] font-bold uppercase tracking-[0.2em] mt-1" style={{ color: A(0.42) }}>Signal</p>
            </div>
          )}
          {/* EI1: the drawer is the travel-size dossier — this hands off to the
              full company file (Entity Intelligence, company kind). */}
          {isSymbol && (
            <Link href={`/company/${encodeURIComponent(ctx.id)}`} onClick={onClose} title="Open the company file"
              className="shrink-0 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded transition-colors hover:opacity-90"
              style={{ color: "#0A0F1C", background: "#7cc7d8", border: "1px solid rgba(82,176,200,0.3)" }}>
              <FileText size={9} /> Dossier
            </Link>
          )}
          <Link href={explorerHref(ctx)} onClick={onClose} title="Open Explorer"
            className="shrink-0 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded transition-colors hover:bg-white/10"
            style={{ color: "#7cc7d8", border: "1px solid rgba(82,176,200,0.3)" }}>
            <Maximize2 size={9} /> Explorer
          </Link>
          <button onClick={onClose} className="shrink-0 p-1 rounded transition-colors hover:bg-white/10" style={{ color: A(0.5) }}><X size={15} /></button>
        </div>
        {/* Compact market block: price, daily move, volume, market cap, freshness.
            Real data only; rows without data simply drop out. */}
        {isSymbol && marketStructure && (
          <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
            className="flex items-baseline gap-2.5 mt-2.5 pt-2 border-t flex-wrap" style={{ borderColor: A(0.07) }}>
            <span className="text-[19px] font-black tabular-nums leading-none tracking-tight" style={{ color: A(0.96) }}>{marketStructure.price.toFixed(2)}</span>
            {marketStructure.changePercent !== null && (
              <span className="text-[11.5px] font-bold tabular-nums" style={{ color: marketStructure.changePercent >= 0 ? "#34d399" : "#f87171" }}>{marketStructure.changePercent > 0 ? "+" : ""}{marketStructure.changePercent.toFixed(2)}%</span>
            )}
            {marketStructure.volume !== null && (
              <span className="text-[9px] font-semibold tabular-nums uppercase tracking-wide" style={{ color: A(0.5) }}>Vol {fmtCompact(marketStructure.volume)}</span>
            )}
            {marketStructure.marketCap !== null && (
              <span className="text-[9px] font-semibold tabular-nums uppercase tracking-wide" style={{ color: A(0.5) }}>Cap {fmtCompact(marketStructure.marketCap)}</span>
            )}
            <span className="ml-auto text-[8px] uppercase tracking-wider tabular-nums" style={{ color: marketStructure.stale ? "#f59e0b" : A(0.4) }}>{marketStructure.freshness}{marketStructure.stale ? " · stale" : ""}</span>
          </motion.div>
        )}
        {/* metrics row: theme metrics belong to theme-shaped contexts, not to a ticker header */}
        {!isSymbol && intel.theme && (
          <div className="flex items-center gap-4 mt-3">
            {intel.momentum && <Metric label="Momentum" value={intel.momentum} />}
            {intel.persistence !== null && <Metric label="Persistence" value={String(intel.persistence)} />}
            {intel.acceleration !== null && <Metric label="Acceleration" value={`${intel.acceleration > 0 ? "+" : ""}${intel.acceleration}`} color={intel.acceleration >= 0 ? "#34d399" : "#f87171"} />}
          </div>
        )}
      </div>

      <div className="overflow-y-auto flex-1 scrollbar-hide">
        {isSymbol ? (
          /* Simplified company / ETF drawer: a quick overview only. The deep
             timeline, network, memory and discovery sections live in the Explorer. */
          <>
            <Section label="Current Read">
              <p className="text-[12.5px] font-medium leading-relaxed" style={{ color: A(0.9) }}>{intel.what}</p>
            </Section>

            {(currentThemes.length > 0 || intel.drivers.length > 0) && (
              <Section label="Active Themes & Drivers">
                <div className="flex flex-wrap gap-1.5">
                  {[...currentThemes, ...intel.drivers].slice(0, 3).map((t, i) => {
                    const isTheme = i < currentThemes.length;
                    return (
                      <button key={t} onClick={() => (isTheme ? setActiveTheme(t, accentColor) : setActiveDriver(t, accentColor))}
                        className="text-[9px] font-bold uppercase tracking-wide px-2 py-[3px] rounded-sm transition-colors hover:bg-white/10"
                        style={isTheme
                          ? { color: "rgba(124,199,216,0.92)", background: "rgba(82,176,200,0.10)", border: "1px solid rgba(82,176,200,0.3)" }
                          : { color: A(0.72), background: A(0.04), border: `1px solid ${A(0.16)}` }}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}

            {forecast && (
              <Section label="Forward View">
                <p className="text-[11.5px] leading-snug" style={{ color: A(0.8) }}>
                  <span className="font-black capitalize" style={{ color: dirColor(forecast.direction) }}>{forecast.direction}</span>
                  {forecast.probability !== null && <span className="tabular-nums"> · {forecast.probability}% probability</span>}
                  <span className="tabular-nums"> · confidence {forecast.confidence}</span>
                </p>
              </Section>
            )}

            <Section label="Forward / Risk · shared engines">
              <p className="text-[10.5px] leading-snug flex gap-1.5" style={{ color: A(0.7) }}>
                <span className="shrink-0 font-bold" style={{ color: "#34d399" }}>+</span>
                {forecast ? `${forecast.direction}${forecast.reasons[0] ? ` - ${forecast.reasons[0]}` : ""}` : "No resolvable forward view yet."}
              </p>
              <p className="text-[10.5px] leading-snug flex gap-1.5 mt-1" style={{ color: A(0.7) }}>
                <span className="shrink-0 font-bold" style={{ color: "#f87171" }}>-</span>
                {(graph.ready && (cachedProfile(entity.graphKey).risks.data?.contradictions[0]?.detail ?? cachedProfile(entity.graphKey).risks.data?.invalidation)) || "No recorded risk records yet."}
              </p>
            </Section>

            {evidence && evidence.supportingEvidence.length > 0 && (
              <Section label="Evidence Preview">
                <ul className="space-y-1">
                  {[...evidence.supportingEvidence]
                    .sort((a, b) => (b.strength - a.strength) || (b.confidence - a.confidence))
                    .slice(0, 2)
                    .map((ev, i) => (
                      <li key={i} className="text-[10.5px] leading-snug flex items-center gap-1.5" style={{ color: A(0.7) }}>
                        <span className="truncate" style={{ color: A(0.9) }}>{ev.from}</span>
                        <span className="shrink-0 px-1 py-px rounded-sm text-[8px] font-semibold uppercase tracking-wide" style={{ color: accentColor, background: `${accentColor}1f` }}>{ev.relationship.replace(/_/g, " ")}</span>
                        <span className="ml-auto shrink-0 tabular-nums text-[9px] font-bold" style={{ color: A(0.55) }}>{ev.strength}</span>
                      </li>
                    ))}
                </ul>
                {evidence.supportingEvidence.length > 2 && (
                  <p className="text-[9px] mt-1.5" style={{ color: A(0.4) }}>{evidence.supportingEvidence.length - 2} more in the Explorer.</p>
                )}
              </Section>
            )}

            {/* The Explorer is the deep surface: full network, timeline, memory, evidence. */}
            <div className="px-4 py-3 border-t" style={{ borderColor: A(0.06) }}>
              <Link href={explorerHref(ctx)} onClick={onClose}
                className="flex items-center justify-center gap-1.5 w-full text-[10.5px] font-bold uppercase tracking-wide py-2 rounded-md transition-colors hover:bg-white/10"
                style={{ color: "#7cc7d8", border: "1px solid rgba(82,176,200,0.35)", background: "rgba(82,176,200,0.08)" }}>
                <Maximize2 size={11} /> Open Intelligence Explorer
              </Link>
              <p className="text-[9px] text-center mt-1.5" style={{ color: A(0.38) }}>Price chart, network, timeline and full evidence live in the Explorer.</p>
            </div>
          </>
        ) : (
          /* Theme-shaped view: the established theme drawer flow. */
          <>
            <Section label="What it is"><p className="text-[11.5px] leading-relaxed" style={{ color: A(0.82) }}>{intel.what}</p></Section>
            <Section label="Why it matters now"><p className="text-[11.5px] leading-relaxed" style={{ color: A(0.72) }}>{intel.why}</p></Section>
            {relatedPagesSec}
            {intel.companies.length > 0 && (
              <Section label="Related companies">
                <div className="flex flex-wrap gap-x-2.5 gap-y-1">{intel.companies.map(c => <TickerChip key={c} ticker={c} size="md" color="#7cc7d8" />)}</div>
              </Section>
            )}
            {sectorsSec}
            {storiesSec}
            {dealsSec}
            {listenSec}
            {privateReadSec}
            {recentChangeSec}
            {oppRiskGrid}
            {nextWatchSec}
            {forecastSec}
            {timelineSec}
            {networkSec}
          </>
        )}

        {/* Graph-backed enrichment for theme drawers. Renders only when the graph
            resolved the entity and has something to add, so nothing shows blank. */}
        {!isSymbol && strongest.length > 0 && (
          <Section label="Strongest connections (graph)"><RelList rels={strongest} accent={accentColor} /></Section>
        )}

        {process.env.NODE_ENV !== "production" && graph.ready && (
          <div className="px-4 py-2 border-t" style={{ borderColor: A(0.06) }}>
            <p className="text-[8px] font-bold uppercase tracking-[0.14em]" style={{ color: A(0.3) }}>
              Graph: {graph.integrity.ok ? "healthy" : "issues"} · {graph.summary.totalNodes} nodes · {graph.summary.totalRelationships} relationships
            </p>
          </div>
        )}
        <div className="h-6" />
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[13px] font-black tabular-nums capitalize leading-none" style={{ color: color ?? A(0.85) }}>{value}</p>
      <p className="text-[7px] font-bold uppercase tracking-wider mt-0.5" style={{ color: A(0.36) }}>{label}</p>
    </div>
  );
}

export function IntelligenceDrawer({ ctx, open, onClose }: { ctx: IntelContext | null; open: boolean; onClose: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && ctx && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={onClose} className="fixed inset-0 z-[998]" style={{ background: "rgba(0,0,0,0.5)" }} />
          <motion.aside initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }} transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="fixed top-0 right-0 bottom-0 z-[999] w-[380px] max-w-[92vw]"
            style={{ background: "#080c14", borderLeft: "1px solid rgba(255,255,255,0.1)", boxShadow: "-20px 0 60px rgba(0,0,0,0.5)" }}>
            <DrawerBody ctx={ctx} onClose={onClose} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
