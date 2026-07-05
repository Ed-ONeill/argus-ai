"use client";

import { useMemo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { X, ArrowUpRight } from "lucide-react";
import { TickerChip } from "@/components/common/TickerChip";
import { useFeed } from "@/hooks/useFeed";
import { useMAIntelligence } from "@/hooks/useMAIntelligence";
import { useListenRails } from "@/hooks/useListen";
import { buildCrossIntel } from "@/lib/crossIntel";
import { createDailyThemeSnapshots, getThemeMemory, getThemeHistory, themeKey } from "@/lib/themeSnapshots";
import { useIntelligenceGraph } from "@/hooks/useIntelligenceGraph";
import { predictThemeTrajectory, predictCompanyTrajectory, predictSectorRotation } from "@/lib/predictionEngine";
import { evaluateEvidenceForNode } from "@/lib/evidenceEngine";
import { recordSnapshot, getEntityHistory, compareSnapshots, detectHistoricalPatterns, summarizeEvolution, findHistoricalAnalogs } from "@/lib/memoryEngine";
import { intelligenceGraph as G } from "@/lib/intelligenceGraph";
import type { IntelNode, IntelEdge } from "@/lib/intelligenceGraph";
import { resolveDrawerEntity, type DrawerEntity } from "@/lib/drawerEntity";
import { num, round } from "@/lib/intelligenceUtils";
import { formatRelativeAge, secondsSince } from "@/lib/utils";
import { confColor, cleanThemeName } from "@/app/markets/marketsShared";
import { setActiveTheme, setActiveDriver } from "@/lib/intelligenceContext";
import type { IntelContext } from "@/lib/intelligenceContext";

/**
 * IntelligenceDrawer - the reusable cross-page intelligence panel (Phase 5).
 * Opens from any active context and shows the connected picture across Feed,
 * Markets, Industries, M&A, Private and Listen, plus historical memory. Dark and
 * institutional, self-contained so it overlays cleanly on any page. No em/en dashes.
 */

const A = (n: number) => `rgba(255,255,255,${n})`;
const verdictColor = (v: string) => v === "strong" ? "#34d399" : v === "moderate" ? "#7cc7d8" : v === "weak" ? "#f59e0b" : A(0.4);

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5 border-t" style={{ borderColor: A(0.06) }}>
      <p className="text-[8px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: A(0.34) }}>{label}</p>
      {children}
    </div>
  );
}

interface GraphRel { source: string; target: string; type: string; strength: number }

interface ForecastVM {
  direction:    string;
  probability:  number | null;
  confidence:   number;
  timeframe:    string | null;
  reasons:      string[];
  invalidation: string | null;
}

/* ---- Intelligence Timeline (Memory Engine, read-only) ---- */

interface TimelineEvent { date: string; type: string; title: string; detail: string; confidence?: number }
interface TimelineVM {
  available:        boolean;
  firstSeen?:       string;
  snapshots?:       number;
  streak?:          number;
  conviction?:      number;
  confidenceGained?: number;
  analogsCount?:    number;
  patterns:         string[];
  events:           TimelineEvent[];
  evolution:        string[];
  analogs:          Array<{ label: string; similarity: number }>;
}

const EMPTY_TIMELINE: TimelineVM = { available: false, patterns: [], events: [], evolution: [], analogs: [] };

const EVENT_COLOR: Record<string, string> = {
  first_detected: "#7cc7d8", conviction_up: "#34d399", momentum_up: "#22d3ee", evidence_up: "#2dd4bf",
  relationships: "#a78bfa", prediction: "#fbbf24", analog: "#c084fc",
};
const evColor = (t: string) => EVENT_COLOR[t] ?? "#7cc7d8";

const fmtDate = (iso: string): string => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : iso; };
const fmtDay  = (iso: string): string => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : iso; };

/** Assemble a read-only intelligence timeline from the Memory Engine. Deterministic. */
function buildTimeline(key: string): TimelineVM {
  const h = getEntityHistory(key);
  if (!("found" in h)) return EMPTY_TIMELINE;

  const snaps = h.snapshots, preds = h.predictions;
  const first = snaps[0], last = snaps[snaps.length - 1];

  let streak = 1;
  for (let i = snaps.length - 1; i > 0; i--) {
    if (Math.round((Date.parse(snaps[i].date) - Date.parse(snaps[i - 1].date)) / 86_400_000) === 1) streak += 1; else break;
  }

  const events: TimelineEvent[] = [{ date: first.date, type: "first_detected", title: "First detected", detail: "Argus began tracking this entity.", confidence: first.confidence }];
  for (let i = 1; i < snaps.length; i++) {
    const a = snaps[i - 1], b = snaps[i];
    if (b.conviction - a.conviction >= 3) events.push({ date: b.date, type: "conviction_up", title: "Conviction increased", detail: `Conviction rose from ${a.conviction} to ${b.conviction}.`, confidence: b.conviction });
    if (b.momentum - a.momentum >= 3) events.push({ date: b.date, type: "momentum_up", title: "Momentum accelerated", detail: `Momentum moved from ${a.momentum} to ${b.momentum}.` });
    if (b.evidenceCount - a.evidenceCount >= 1) events.push({ date: b.date, type: "evidence_up", title: "Evidence strengthened", detail: `Evidence rose from ${a.evidenceCount} to ${b.evidenceCount}.` });
    if (b.relationshipCount - a.relationshipCount >= 1) events.push({ date: b.date, type: "relationships", title: "New relationships discovered", detail: `Connections grew from ${a.relationshipCount} to ${b.relationshipCount}.` });
  }
  for (let i = 1; i < preds.length; i++) {
    if (preds[i].found && preds[i].predictedDirection !== preds[i - 1].predictedDirection)
      events.push({ date: preds[i].date, type: "prediction", title: "Prediction changed", detail: `Forecast shifted to ${preds[i].predictedDirection}.`, confidence: preds[i].confidence });
  }

  const an = findHistoricalAnalogs(key);
  const analogs = "found" in an ? an.analogs.map(a => ({ label: a.label, similarity: a.similarity })) : [];
  if (analogs.length) events.push({ date: last.date, type: "analog", title: "Historical analog found", detail: `Resembles ${analogs[0].label} (similarity ${analogs[0].similarity}%).`, confidence: analogs[0].similarity });

  const ev = summarizeEvolution(key);
  const evolution = "found" in ev ? ev.lines : [];
  const pat = detectHistoricalPatterns(key);
  const patterns = "found" in pat ? pat.patterns.map(p => p.pattern) : [];
  const cmp = compareSnapshots(key);
  const confidenceGained = "found" in cmp ? cmp.deltas.confidence : undefined;

  events.sort((a, b) => b.date.localeCompare(a.date));
  return {
    available: true, firstSeen: first.date, snapshots: snaps.length, streak, conviction: last.conviction,
    confidenceGained, analogsCount: analogs.length, patterns, events: events.slice(0, 10), evolution, analogs,
  };
}

// Record at most one Memory Engine snapshot per day per session (idempotent per day in the engine too).
let memoryRecordedOn: string | null = null;

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[12px] font-black tabular-nums leading-none" style={{ color: accent ? "#7cc7d8" : A(0.9) }}>{value}</p>
      <p className="text-[7px] font-bold uppercase tracking-wider mt-0.5" style={{ color: A(0.4) }}>{label}</p>
    </div>
  );
}

/* ---- Market Structure (reads node.metadata.latestMarketData only, descriptive) ---- */

interface MarketStructureVM {
  price: number; changePercent: number | null; volume: number | null; avgVolume: number | null;
  relativeVolume: number | null; dollarVolume: number | null; marketCap: number | null;
  yearLow: number | null; yearHigh: number | null; yearPosition: number | null; // % of 52w range
  freshness: string; provider: string; stale: boolean; notes: string[];
}
const mnum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
function fmtCompact(n: number | null): string {
  if (n == null) return "n/a";
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (a >= 1e9)  return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6)  return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3)  return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}

/** Build a descriptive market-structure view from a node's latestMarketData. */
function buildMarketStructure(lmd: Record<string, unknown>): MarketStructureVM | null {
  const price = mnum(lmd.price);
  if (price == null) return null;
  const volume = mnum(lmd.volume);
  const avgVolume = mnum(lmd.avgVolume);
  const relativeVolume = volume != null && avgVolume && avgVolume > 0 ? Math.round((volume / avgVolume) * 100) / 100 : mnum(lmd.relativeVolume);
  const dollarVolume = volume != null ? Math.round(price * volume) : mnum(lmd.dollarVolume);
  const ts = mnum(lmd.timestamp);
  const notes: string[] = [];
  if (relativeVolume != null) {
    if (relativeVolume > 1.5) notes.push("Participation above normal");
    else if (relativeVolume < 0.8) notes.push("Participation below normal");
  }
  if (dollarVolume != null && dollarVolume >= 5_000_000_000) notes.push("Strong institutional liquidity");
  // 52-week range: numeric fields when a provider supplies them, else the profile
  // "low-high" range string. Display-only derivation from data already on the node.
  let yearLow = mnum(lmd.yearLow), yearHigh = mnum(lmd.yearHigh);
  if ((yearLow == null || yearHigh == null) && typeof lmd.range === "string") {
    const m = lmd.range.match(/^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$/);
    if (m) { yearLow = Number(m[1]); yearHigh = Number(m[2]); }
  }
  const yearPosition = yearLow != null && yearHigh != null && yearHigh > yearLow
    ? Math.round(Math.min(100, Math.max(0, ((price - yearLow) / (yearHigh - yearLow)) * 100)))
    : null;
  return {
    price, changePercent: mnum(lmd.changePercent), volume, avgVolume, relativeVolume, dollarVolume,
    marketCap: mnum(lmd.marketCap), yearLow, yearHigh, yearPosition,
    freshness: ts != null ? (formatRelativeAge(secondsSince(ts)) || "just now") : "unknown",
    provider: typeof lmd.provider === "string" ? lmd.provider : "market data",
    stale: lmd.stale === true, notes,
  };
}

function MktRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>{label}</span>
      <span className="text-[11px] font-semibold tabular-nums" style={{ color: A(0.92) }}>{value}</span>
    </div>
  );
}

/* ---- Relationship Map (Intelligence Graph, read-only, deterministic radial layout) ---- */

const MAP_W = 300, MAP_H = 210, MAP_CX = MAP_W / 2, MAP_CY = MAP_H / 2, MAP_R1 = 66, MAP_R2 = 100;
const MAP_MAX_FIRST = 10, MAP_SECOND_STRENGTH = 70, MAP_MAX_SECOND = 4;

interface MapNode { id: string; label: string; type: string; confidence: number; importance: number; relCount: number; x: number; y: number; r: number; degree: 0 | 1 | 2; angle: number }
interface MapEdge { id: string; a: string; b: string; from: MapNode; to: MapNode; type: string; strength: number; confidence: number; evidenceCount: number; sources: number }
interface MapVM { available: boolean; nodes: MapNode[]; edges: MapEdge[]; width: number; height: number }
const EMPTY_MAP: MapVM = { available: false, nodes: [], edges: [], width: MAP_W, height: MAP_H };

function mapNode(node: IntelNode, degree: 0 | 1 | 2, x: number, y: number, angle: number): MapNode {
  const importance = Math.max(0, Math.min(100, round(num(node.importance))));
  const r = degree === 0 ? 11 : degree === 2 ? 5 : 6 + importance / 100 * 6;
  return { id: node.id, label: node.label, type: String(node.type), confidence: round(num(node.confidence)), importance, relCount: G.getRelationships(node.id).length, x, y, r, degree, angle };
}
function mapEdge(edge: IntelEdge, from: MapNode, to: MapNode): MapEdge {
  return { id: edge.id, a: from.id, b: to.id, from, to, type: edge.relationshipType, strength: round(num(edge.strength)), confidence: round(num(edge.confidence)), evidenceCount: num(edge.evidenceCount), sources: edge.originatingPages.length };
}

/** Read the existing graph singleton and lay out a stable radial map around one entity. */
function buildRelationshipMap(key: string): MapVM {
  const center = G.getNode(key);
  if (!center) return EMPTY_MAP;
  const neigh = G.getNeighbors(center.id);
  if (neigh.length === 0) return EMPTY_MAP;

  const first = [...neigh].sort((a, b) => b.edge.strength - a.edge.strength).slice(0, MAP_MAX_FIRST);
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const centerNode = mapNode(center, 0, MAP_CX, MAP_CY, 0);
  nodes.push(centerNode);
  const byId = new Map<string, MapNode>([[center.id, centerNode]]);

  const n = first.length;
  first.forEach((x, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const mn = mapNode(x.node, 1, MAP_CX + Math.cos(ang) * MAP_R1, MAP_CY + Math.sin(ang) * MAP_R1, ang);
    nodes.push(mn); byId.set(x.node.id, mn);
    edges.push(mapEdge(x.edge, centerNode, mn));
  });

  // Second-degree: only for strong first-degree links, one strong neighbor each.
  let added = 0;
  for (const x of first) {
    if (added >= MAP_MAX_SECOND) break;
    if (x.edge.strength < MAP_SECOND_STRENGTH) continue;
    const parent = byId.get(x.node.id)!;
    const outer = G.getNeighbors(x.node.id).filter(y => !byId.has(y.node.id) && y.node.id !== center.id).sort((a, b) => b.edge.strength - a.edge.strength)[0];
    if (!outer) continue;
    const mn = mapNode(outer.node, 2, MAP_CX + Math.cos(parent.angle) * MAP_R2, MAP_CY + Math.sin(parent.angle) * MAP_R2, parent.angle);
    nodes.push(mn); byId.set(outer.node.id, mn);
    edges.push(mapEdge(outer.edge, parent, mn));
    added += 1;
  }

  return { available: true, nodes, edges, width: MAP_W, height: MAP_H };
}

const trunc = (s: string, n = 14) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

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
  const { data } = useFeed();
  const { deals } = useMAIntelligence();
  const { allEpisodes } = useListenRails();

  const themes   = useMemo(() => data?.theme_intelligence ?? [], [data?.theme_intelligence]);
  const clusters = useMemo(() => data?.clusters ?? [], [data?.clusters]);
  const episodes = allEpisodes ?? [];

  const intel = useMemo(
    () => buildCrossIntel(ctx, { themes, clusters, deals, episodes }),
    [ctx, themes, clusters, deals, episodes],
  );

  // Accrue daily memory whenever themes are available (idempotent per day).
  useEffect(() => {
    if (themes.length === 0) return;
    const dealCountBySector: Record<string, number> = {};
    for (const d of deals) dealCountBySector[d.sector] = (dealCountBySector[d.sector] ?? 0) + 1;
    createDailyThemeSnapshots(themes, { dealCountBySector });
  }, [themes, deals]);

  const memory = useMemo(
    () => (intel.theme ? getThemeMemory(themeKey(intel.theme)) : { hasHistory: false, lines: [] as string[] }),
    [intel.theme],
  );

  // Graph-backed enrichment. The graph is rebuilt from the same loaded data the
  // drawer already reads, then queried for the active entity's connective picture.
  const snapshots = useMemo(() => themes.flatMap(t => getThemeHistory(themeKey(t))), [themes]);
  const graph = useIntelligenceGraph({
    enabled: true, themes, stories: clusters, storyThemes: themes,
    episodes, matchedThemes: themes, deals, snapshots,
  });

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
  const currentThemes = useMemo<string[]>(() => {
    if (!isSymbol) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (name?: string | null) => {
      if (!name) return;
      const c = cleanThemeName(name);
      const k = c.toLowerCase();
      if (c && !seen.has(k)) { seen.add(k); out.push(c); }
    };
    push(intel.theme?.name);
    for (const t of companyReport?.relatedThemes ?? []) push(t.label);
    return out.slice(0, 6);
  }, [isSymbol, intel.theme, companyReport]);

  // Evidence read for the company view (existing engine, read-only). Powers the
  // Signal Confidence header number and the Evidence panel; hidden on thin signal.
  const evidence = useMemo(() => {
    if (!graph.ready || !isSymbol) return null;
    const ev = evaluateEvidenceForNode(entity.graphKey);
    return ev.found && ev.verdict !== "insufficient_signal" ? ev : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.ready, isSymbol, entity.graphKey]);

  // Peer tickers: the theme's related assets minus the focused symbol itself.
  const focusTicker = (ctx.id || ctx.label).toUpperCase();
  const peers = intel.companies.filter(c => c.toUpperCase() !== focusTicker);

  const accentColor = ctx.color ?? "#52b0c8";

  // Forward-looking forecast, normalized across theme / company / sector predictions.
  // Renders only when the prediction resolved and is not insufficient_signal.
  const forecast = useMemo<ForecastVM | null>(() => {
    if (!graph.ready) return null;
    if (ctx.kind === "company" || ctx.kind === "etf") {
      const p = predictCompanyTrajectory(entity.graphKey);
      if (!p.found || p.expectedDirection === "insufficient_signal") return null;
      return { direction: p.expectedDirection, probability: p.probability, confidence: p.confidence, timeframe: null, reasons: p.reasoningSteps.map(s => s.claim).slice(0, 3), invalidation: p.invalidation || null };
    }
    if (ctx.kind === "sector") {
      const p = predictSectorRotation(ctx.label);
      if (!p.found || p.currentRotation === "insufficient_signal") return null;
      const inflow = p.companiesBenefiting.length >= p.companiesAtRisk.length;
      return { direction: inflow ? "rotating in" : "rotating out", probability: null, confidence: p.confidence, timeframe: null, reasons: p.reasoningSteps.map(s => s.claim).slice(0, 3), invalidation: null };
    }
    if (ctx.kind === "theme" || ctx.kind === "driver" || ctx.kind === "narrative") {
      const p = predictThemeTrajectory(entity.graphKey);
      if (!p.found || p.predictedDirection === "insufficient_signal") return null;
      return { direction: p.predictedDirection, probability: p.probability, confidence: p.confidence, timeframe: p.expectedTimeframe, reasons: p.why.slice(0, 3), invalidation: p.invalidationConditions[0] || null };
    }
    return null;
  }, [graph, ctx.kind, ctx.label, entity.graphKey]);

  const dirColor = (d: string) => /strength|rotating in|accelerat/i.test(d) ? "#34d399" : /weak|revers|rotating out/i.test(d) ? "#f87171" : accentColor;

  // Intelligence Timeline (Memory Engine, read-only). Record one snapshot per day per
  // session so history accrues, then read it back for the focused entity.
  const [memVersion, setMemVersion] = useState(0);
  useEffect(() => {
    if (!graph.ready) return;
    const today = new Date().toISOString().slice(0, 10);
    if (memoryRecordedOn === today) return;
    try { recordSnapshot(); memoryRecordedOn = today; setMemVersion(v => v + 1); } catch { /* memory is best-effort */ }
  }, [graph.ready]);

  const timeline = useMemo<TimelineVM>(() => {
    if (!graph.ready) return EMPTY_TIMELINE;
    return buildTimeline(entity.graphKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.ready, memVersion, entity.graphKey]);

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
    if (!graph.ready) return EMPTY_MAP;
    return buildRelationshipMap(entity.graphKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.ready, entity.graphKey]);
  const mapActive = mapSelected ?? mapHoverNode;

  // Opportunity / Risk grid, placed above Forward View for symbols and in the
  // original position for theme-shaped contexts.
  const oppRiskGrid = (
    <div className="grid grid-cols-2 gap-px" style={{ background: A(0.06) }}>
      <div className="px-4 py-2.5" style={{ background: "#0b0f18" }}>
        <p className="text-[8px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(52,211,153,0.7)" }}>Opportunity</p>
        <p className="text-[10.5px] leading-snug" style={{ color: A(0.66) }}>{intel.opportunity}</p>
      </div>
      <div className="px-4 py-2.5" style={{ background: "#0b0f18" }}>
        <p className="text-[8px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(248,113,113,0.75)" }}>Risk</p>
        <p className="text-[10.5px] leading-snug" style={{ color: A(0.66) }}>{intel.risk}</p>
      </div>
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
    <Section label="Related stories">
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
  const privateReadSec = (
    <Section label="Private capital read"><p className="text-[11px] leading-snug" style={{ color: A(0.7) }}>{intel.privateRead}</p></Section>
  );
  const recentChangeSec = (
    <Section label="Recent change">
      {memory.hasHistory
        ? <ul className="space-y-1">{memory.lines.map((l, i) => <li key={i} className="text-[11px] leading-snug flex gap-1.5" style={{ color: A(0.72) }}><span className="shrink-0" style={{ color: "#34d399" }}>+</span>{l}</li>)}</ul>
        : <p className="text-[10.5px] italic" style={{ color: A(0.42) }}>Historical memory begins tracking from today.</p>}
    </Section>
  );
  const nextWatchSec = (
    <Section label="Next thing to watch"><p className="text-[11px] leading-snug" style={{ color: A(0.72) }}>Watch {intel.nextWatch}.</p></Section>
  );
  const forecastSec = forecast && (
    <Section label={isSymbol ? "Forward View" : "Forecast"}>
      <div className="flex items-center gap-4 mb-2">
        <span className="text-[12.5px] font-black capitalize leading-none" style={{ color: dirColor(forecast.direction) }}>{forecast.direction}</span>
        {forecast.probability !== null && (
          <span className="flex items-baseline gap-1"><span className="text-[13px] font-black tabular-nums leading-none" style={{ color: A(0.9) }}>{forecast.probability}%</span><span className="text-[7px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>probability</span></span>
        )}
        <span className="flex items-baseline gap-1"><span className="text-[13px] font-black tabular-nums leading-none" style={{ color: A(0.9) }}>{forecast.confidence}</span><span className="text-[7px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>confidence</span></span>
      </div>
      {forecast.timeframe && <p className="text-[10px] mb-1.5" style={{ color: A(0.55) }}>Expected timeframe: {forecast.timeframe}.</p>}
      <ul className="space-y-1 mb-1.5">
        {forecast.reasons.map((r, i) => (
          <li key={i} className="text-[10.5px] leading-snug flex gap-1.5" style={{ color: A(0.7) }}>
            <span className="shrink-0 mt-0.5" style={{ color: accentColor }}>›</span>{r}
          </li>
        ))}
      </ul>
      {forecast.invalidation && <p className="text-[10px] leading-snug mb-1.5" style={{ color: A(0.55) }}>Invalidated if: {forecast.invalidation}</p>}
      <p className="text-[9px] italic leading-snug" style={{ color: A(0.38) }}>Probabilistic estimate derived from current signals, not a certainty and not investment advice.</p>
    </Section>
  );
  const mapDetail = useMemo(() => {
    if (mapHoverEdge) { const e = relMap.edges.find(x => x.id === mapHoverEdge); if (e) return `${e.from.label} ${e.type.replace(/_/g, " ")} ${e.to.label}  ·  strength ${e.strength}  ·  evidence ${e.evidenceCount}  ·  ${e.sources} source${e.sources === 1 ? "" : "s"}`; }
    const id = mapHoverNode ?? mapSelected;
    if (id) { const nd = relMap.nodes.find(x => x.id === id); if (nd) return `${nd.label}  ·  ${nd.type}  ·  confidence ${nd.confidence}  ·  ${nd.relCount} relationship${nd.relCount === 1 ? "" : "s"}`; }
    return "Hover a node or edge for details. Click a node to pin it.";
  }, [mapHoverEdge, mapHoverNode, mapSelected, relMap]);

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
            <h2 className="text-[17px] font-black leading-tight" style={{ color: A(0.96) }}>{isSymbol ? entity.title : intel.title}</h2>
            {isSymbol && entity.subtitle && (
              <p className="text-[9.5px] font-semibold mt-0.5" style={{ color: A(0.48) }}>Exposed to {cleanThemeName(entity.subtitle)}</p>
            )}
          </div>
          {!isSymbol && intel.conviction !== null && (
            <div className="text-right shrink-0">
              <p className="text-[20px] font-black tabular-nums leading-none" style={{ color: confColor(intel.conviction) }}>{intel.conviction}</p>
              <p className="text-[7px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>Conviction</p>
            </div>
          )}
          {isSymbol && evidence && (
            <div className="text-right shrink-0">
              <p className="text-[20px] font-black tabular-nums leading-none" style={{ color: confColor(evidence.overallTrust) }}>{evidence.overallTrust}</p>
              <p className="text-[7px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>Signal</p>
            </div>
          )}
          <button onClick={onClose} className="shrink-0 p-1 rounded transition-colors hover:bg-white/10" style={{ color: A(0.5) }}><X size={15} /></button>
        </div>
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
        {/* Market Structure. First section below the header. Descriptive only, reads
            latestMarketData; rows without data are hidden, never shown as n/a. */}
        {marketStructure && (
          <Section label="Market Structure">
            <div className="flex items-baseline gap-2.5 mb-1.5">
              <span className="text-[21px] font-black tabular-nums leading-none" style={{ color: A(0.96) }}>{marketStructure.price.toFixed(2)}</span>
              {marketStructure.changePercent !== null && (
                <span className="text-[12px] font-bold tabular-nums" style={{ color: marketStructure.changePercent >= 0 ? "#34d399" : "#f87171" }}>{marketStructure.changePercent > 0 ? "+" : ""}{marketStructure.changePercent.toFixed(2)}%</span>
              )}
              <span className="ml-auto text-[8px] uppercase tracking-wider tabular-nums" style={{ color: marketStructure.stale ? "#f59e0b" : A(0.4) }}>{marketStructure.freshness}{marketStructure.stale ? " · stale" : ""}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {marketStructure.volume !== null && <MktRow label="Volume" value={fmtCompact(marketStructure.volume)} />}
              {marketStructure.avgVolume !== null && <MktRow label="Avg Volume" value={fmtCompact(marketStructure.avgVolume)} />}
              {marketStructure.relativeVolume !== null && <MktRow label="Rel Volume" value={`${marketStructure.relativeVolume.toFixed(2)}x`} />}
              {marketStructure.dollarVolume !== null && <MktRow label="Dollar Vol" value={fmtCompact(marketStructure.dollarVolume)} />}
              {marketStructure.marketCap !== null && <MktRow label="Market Cap" value={fmtCompact(marketStructure.marketCap)} />}
              {marketStructure.yearPosition !== null && <MktRow label="52W Position" value={`${marketStructure.yearPosition}%`} />}
              <MktRow label="Provider" value={marketStructure.provider.toUpperCase()} />
              <MktRow label="Updated" value={marketStructure.freshness} />
            </div>
            {marketStructure.yearPosition !== null && marketStructure.yearLow !== null && marketStructure.yearHigh !== null && (
              <div className="mt-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>52W Range</span>
                  <span className="text-[10px] font-semibold tabular-nums" style={{ color: A(0.72) }}>{marketStructure.yearLow.toFixed(2)} - {marketStructure.yearHigh.toFixed(2)}</span>
                </div>
                <div className="h-[3px] rounded-full mt-1" style={{ background: A(0.08) }}>
                  <div className="h-full rounded-full" style={{ width: `${marketStructure.yearPosition}%`, background: accentColor }} />
                </div>
              </div>
            )}
            {marketStructure.notes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {marketStructure.notes.map(n => (
                  <span key={n} className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color: accentColor, background: `${accentColor}1a` }}>{n}</span>
                ))}
              </div>
            )}
          </Section>
        )}
        {isSymbol ? (
          /* Company view: thesis, confidence, prediction, drivers and evidence in the
             first screenful. Discovery content is demoted below the graph sections. */
          <>
            <Section label="Thesis">
              <p className="text-[11.5px] leading-relaxed" style={{ color: A(0.85) }}>{intel.what}</p>
              <p className="text-[10.5px] leading-relaxed mt-1" style={{ color: A(0.6) }}>{intel.why}</p>
            </Section>

            {evidence && (
              <Section label="Signal Confidence">
                <div className="flex items-center gap-4">
                  <Stat label="Evidence" value={String(evidence.evidenceScore)} accent />
                  <Stat label="Trust" value={String(evidence.overallTrust)} />
                  <Stat label="Freshness" value={String(evidence.freshnessScore)} />
                  <Stat label="Sources" value={String(evidence.sourceBreakdown.length)} />
                  <span className="ml-auto text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                    style={{ color: verdictColor(evidence.verdict), background: `${verdictColor(evidence.verdict)}1a` }}>
                    {evidence.verdict.replace(/_/g, " ")}
                  </span>
                </div>
              </Section>
            )}

            {forecastSec}

            {(currentThemes.length > 0 || intel.drivers.length > 0) && (
              <Section label="Drivers & Themes">
                {currentThemes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {currentThemes.map(t => (
                      <button key={t} onClick={() => setActiveTheme(t, accentColor)}
                        className="text-[9.5px] font-semibold px-2 py-0.5 rounded transition-colors hover:bg-white/10"
                        style={{ color: "rgba(124,199,216,0.92)", background: "rgba(82,176,200,0.10)", border: "1px solid rgba(82,176,200,0.25)" }}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {intel.drivers.length > 0 && (
                  <div className={`flex flex-wrap gap-1.5 ${currentThemes.length > 0 ? "mt-1.5" : ""}`}>
                    {intel.drivers.map(d => (
                      <button key={d} onClick={() => setActiveDriver(d, accentColor)}
                        className="text-[9.5px] font-semibold px-2 py-0.5 rounded transition-colors hover:bg-white/10"
                        style={{ color: A(0.72), background: A(0.04), border: `1px solid ${A(0.14)}` }}>
                        {d}
                      </button>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {evidence && evidence.supportingEvidence.length > 0 && (
              <Section label="Evidence">
                <ul className="space-y-1">
                  {evidence.supportingEvidence.slice(0, 4).map((ev, i) => (
                    <li key={i} className="text-[10.5px] leading-snug flex items-center gap-1.5" style={{ color: A(0.7) }}>
                      <span className="truncate" style={{ color: A(0.9) }}>{ev.from}</span>
                      <span className="shrink-0 px-1 py-px rounded text-[8px] font-semibold uppercase tracking-wide" style={{ color: accentColor, background: `${accentColor}1f` }}>{ev.relationship.replace(/_/g, " ")}</span>
                      <span className="ml-auto shrink-0 tabular-nums text-[9px]" style={{ color: A(0.4) }}>{ev.strength}</span>
                    </li>
                  ))}
                </ul>
                {evidence.contradictions.length > 0 && (
                  <p className="text-[9.5px] leading-snug mt-1.5" style={{ color: "#f59e0b" }}>
                    {evidence.contradictions.length} contradiction{evidence.contradictions.length === 1 ? "" : "s"}: {evidence.contradictions[0].detail}
                  </p>
                )}
              </Section>
            )}

            {oppRiskGrid}
            {nextWatchSec}

            {peers.length > 0 && (
              <Section label="Peer Exposure">
                <div className="flex flex-wrap gap-x-2.5 gap-y-1">{peers.map(c => <TickerChip key={c} ticker={c} size="md" color="#7cc7d8" />)}</div>
              </Section>
            )}
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
          </>
        )}

        {/* Intelligence Timeline. Memory Engine only, read-only. Graceful fallback when
            history is thin, never a blank card. */}
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

        {/* Relationship Map. Reads the existing graph singleton, deterministic radial
            layout, read-only. Graceful fallback when nothing is connected. */}
        <Section label="Relationship Map">
          {!relMap.available ? (
            <p className="text-[10.5px] italic leading-snug" style={{ color: A(0.4) }}>No connected intelligence has been identified yet.</p>
          ) : (
            <>
              <motion.svg initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
                viewBox={`0 0 ${relMap.width} ${relMap.height}`} className="w-full select-none" style={{ height: 200 }}>
                {relMap.edges.map(e => {
                  const on = !mapActive || e.a === mapActive || e.b === mapActive;
                  const mx = (e.from.x + e.to.x) / 2, my = (e.from.y + e.to.y) / 2;
                  return (
                    <g key={e.id} onMouseEnter={() => setMapHoverEdge(e.id)} onMouseLeave={() => setMapHoverEdge(null)}>
                      <line x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y}
                        stroke={mapHoverEdge === e.id ? accentColor : "#ffffff"}
                        strokeWidth={0.5 + e.strength / 100 * 1.5}
                        strokeOpacity={on ? 0.18 + e.strength / 100 * 0.5 : 0.06} />
                      {e.evidenceCount > 1 && <circle cx={mx} cy={my} r={Math.min(2.4, 0.8 + e.evidenceCount * 0.3)} fill="#ffffff" fillOpacity={on ? 0.35 : 0.08} />}
                    </g>
                  );
                })}
                {relMap.nodes.map(node => {
                  const connected = !mapActive || node.id === mapActive || relMap.edges.some(e => (e.a === mapActive && e.b === node.id) || (e.b === mapActive && e.a === node.id));
                  const col = confColor(node.confidence);
                  return (
                    <g key={node.id} style={{ cursor: "pointer" }}
                      onMouseEnter={() => setMapHoverNode(node.id)} onMouseLeave={() => setMapHoverNode(null)}
                      onClick={() => setMapSelected(s => (s === node.id ? null : node.id))}>
                      <circle cx={node.x} cy={node.y} r={node.r} fill="#0b0f18" stroke={col}
                        strokeWidth={node.id === mapSelected ? 2.4 : node.degree === 0 ? 2 : 1.25}
                        opacity={connected ? 1 : 0.28} />
                      {node.degree !== 2 && (
                        <text x={node.x} y={node.y + node.r + 7} textAnchor="middle" fontSize={node.degree === 0 ? 8 : 6.5}
                          fill="#ffffff" fillOpacity={connected ? 0.78 : 0.22}>{trunc(node.label)}</text>
                      )}
                    </g>
                  );
                })}
              </motion.svg>
              <p className="mt-1 text-[9.5px] leading-snug tabular-nums" style={{ color: A(0.55), minHeight: 24 }}>{mapDetail}</p>
            </>
          )}
        </Section>

        {/* Graph-backed enrichment. Renders only when the graph resolved the entity
            and has something to add, so nothing shows blank. */}
        {isSymbol && companyReport?.found && companyReport.maRelationships.length > 0 && (
          <Section label="M&A links (graph)"><RelList rels={companyReport.maRelationships} accent="#a78bfa" /></Section>
        )}
        {isSymbol && companyReport?.found && companyReport.privateMarketRelationships.length > 0 && (
          <Section label="Private market links (graph)"><RelList rels={companyReport.privateMarketRelationships} accent="#34d399" /></Section>
        )}
        {strongest.length > 0 && (
          <Section label="Strongest connections (graph)"><RelList rels={strongest} accent={accentColor} /></Section>
        )}

        {/* Demoted discovery content for the company view: context that is useful
            but never competes with the live intelligence above. */}
        {isSymbol && (
          <>
            {privateReadSec}
            {recentChangeSec}
            {storiesSec}
            {dealsSec}
            {listenSec}
            {sectorsSec}
            {relatedPagesSec}
          </>
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
