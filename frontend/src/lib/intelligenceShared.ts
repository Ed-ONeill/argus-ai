/**
 * lib/intelligenceShared.ts - shared presentational view-model builders for the
 * Intelligence Drawer (quick read) and the Intelligence Explorer (deep research).
 *
 * Pure helpers extracted from IntelligenceDrawer so both surfaces read the same
 * engines the same way: the Memory Engine timeline, the market-structure read,
 * the deterministic radial relationship map, and the normalized forecast. Read
 * only: no engine logic lives here and nothing here mutates the graph or memory
 * (recordDailyMemorySnapshot is the drawer's existing once-per-day accrual guard,
 * relocated). No React, no providers. No em/en dashes.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import type { IntelNode, IntelEdge } from "./intelligenceGraph";
import { num, round } from "./intelligenceUtils";
import { formatRelativeAge, secondsSince } from "./utils";
import { predictThemeTrajectory, predictCompanyTrajectory, predictSectorRotation } from "./predictionEngine";
import {
  recordSnapshot, getEntityHistory, compareSnapshots, detectHistoricalPatterns,
  summarizeEvolution, findHistoricalAnalogs,
} from "./memoryEngine";
import { cleanThemeName } from "@/app/markets/marketsShared";
import type { IntelContext, IntelKind } from "./intelligenceContext";

/* ---- Small shared formatters / colors ---- */

export const verdictColor = (v: string) =>
  v === "strong" ? "#34d399" : v === "moderate" ? "#7cc7d8" : v === "weak" ? "#f59e0b" : "rgba(255,255,255,0.4)";

/** Direction color for forecast reads: green strengthening, red weakening, accent otherwise. */
export const dirColor = (d: string, accent: string) =>
  /strength|rotating in|accelerat/i.test(d) ? "#34d399" : /weak|revers|rotating out/i.test(d) ? "#f87171" : accent;

// Node identity colors: muted, institutional, one hue per entity class.
export const NODE_COLOR: Record<string, string> = {
  Company: "#7cc7d8", ETF: "#7cc7d8", Theme: "#a78bfa", Narrative: "#a78bfa",
  Macro: "#f0b429", MacroSeries: "#f0b429", Sector: "#34d399",
  Story: "#94a3b8", Podcast: "#94a3b8", Person: "#d8a7e8", Institution: "#8fb8e8",
};
export const nodeColor = (t: string) => NODE_COLOR[t] ?? "#8ea3b5";

export const EVENT_COLOR: Record<string, string> = {
  first_detected: "#7cc7d8", conviction_up: "#34d399", momentum_up: "#22d3ee", evidence_up: "#2dd4bf",
  relationships: "#a78bfa", prediction: "#fbbf24", analog: "#c084fc",
};
export const evColor = (t: string) => EVENT_COLOR[t] ?? "#7cc7d8";

export const fmtDate = (iso: string): string => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : iso; };
export const fmtDay  = (iso: string): string => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : iso; };

export function fmtCompact(n: number | null): string {
  if (n == null) return "n/a";
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (a >= 1e9)  return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6)  return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3)  return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}

export const trunc = (s: string, n = 14) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/* ---- Forecast (Prediction Engine, read-only, normalized across kinds) ---- */

export interface ForecastVM {
  direction:    string;
  probability:  number | null;
  confidence:   number;
  timeframe:    string | null;
  reasons:      string[];
  invalidation: string | null;
}

/**
 * Forward-looking forecast, normalized across theme / company / sector predictions.
 * Returns null when the prediction did not resolve or is insufficient_signal.
 */
export function buildForecast(kind: IntelKind, label: string, graphKey: string): ForecastVM | null {
  if (kind === "company" || kind === "etf") {
    const p = predictCompanyTrajectory(graphKey);
    if (!p.found || p.expectedDirection === "insufficient_signal") return null;
    return { direction: p.expectedDirection, probability: p.probability, confidence: p.confidence, timeframe: null, reasons: p.reasoningSteps.map(s => s.claim).slice(0, 3), invalidation: p.invalidation || null };
  }
  if (kind === "sector") {
    const p = predictSectorRotation(label);
    if (!p.found || p.currentRotation === "insufficient_signal") return null;
    const inflow = p.companiesBenefiting.length >= p.companiesAtRisk.length;
    return { direction: inflow ? "rotating in" : "rotating out", probability: null, confidence: p.confidence, timeframe: null, reasons: p.reasoningSteps.map(s => s.claim).slice(0, 3), invalidation: null };
  }
  if (kind === "theme" || kind === "driver" || kind === "narrative") {
    const p = predictThemeTrajectory(graphKey);
    if (!p.found || p.predictedDirection === "insufficient_signal") return null;
    return { direction: p.predictedDirection, probability: p.probability, confidence: p.confidence, timeframe: p.expectedTimeframe, reasons: p.why.slice(0, 3), invalidation: p.invalidationConditions[0] || null };
  }
  return null;
}

/* ---- Intelligence Timeline (Memory Engine, read-only) ---- */

export interface TimelineEvent { date: string; type: string; title: string; detail: string; confidence?: number }
export interface TimelineVM {
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

export const EMPTY_TIMELINE: TimelineVM = { available: false, patterns: [], events: [], evolution: [], analogs: [] };

/** Assemble a read-only intelligence timeline from the Memory Engine. Deterministic. */
export function buildTimeline(key: string): TimelineVM {
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

// Record at most one Memory Engine snapshot per day per session (idempotent per day
// in the engine too). Shared so the drawer and the explorer accrue the same memory.
let memoryRecordedOn: string | null = null;

/** Accrue today's memory snapshot once per session day. Returns true when recorded. */
export function recordDailyMemorySnapshot(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (memoryRecordedOn === today) return false;
  try { recordSnapshot(); memoryRecordedOn = today; return true; } catch { return false; }
}

/* ---- Market Structure (reads node.metadata.latestMarketData only, descriptive) ---- */

export interface MarketStructureVM {
  price: number; changePercent: number | null; volume: number | null; avgVolume: number | null;
  relativeVolume: number | null; dollarVolume: number | null; marketCap: number | null;
  yearLow: number | null; yearHigh: number | null; yearPosition: number | null; // % of 52w range
  freshness: string; provider: string; stale: boolean; notes: string[];
  // Extended descriptive fields (all straight reads of latestMarketData; null when absent).
  open: number | null; high: number | null; low: number | null; previousClose: number | null;
  vwap: number | null; beta: number | null; bid: number | null; ask: number | null; spread: number | null;
  exchange: string | null;
}

const mnum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Build a descriptive market-structure view from a node's latestMarketData. */
export function buildMarketStructure(lmd: Record<string, unknown>): MarketStructureVM | null {
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
  const bid = mnum(lmd.bid), ask = mnum(lmd.ask);
  return {
    price, changePercent: mnum(lmd.changePercent), volume, avgVolume, relativeVolume, dollarVolume,
    marketCap: mnum(lmd.marketCap), yearLow, yearHigh, yearPosition,
    freshness: ts != null ? (formatRelativeAge(secondsSince(ts)) || "just now") : "unknown",
    provider: typeof lmd.provider === "string" ? lmd.provider : "market data",
    stale: lmd.stale === true, notes,
    open: mnum(lmd.open), high: mnum(lmd.high), low: mnum(lmd.low), previousClose: mnum(lmd.previousClose),
    vwap: mnum(lmd.vwap), beta: mnum(lmd.beta), bid, ask,
    spread: mnum(lmd.spread) ?? (bid != null && ask != null ? Math.round((ask - bid) * 100) / 100 : null),
    exchange: typeof lmd.exchange === "string" && lmd.exchange ? lmd.exchange : null,
  };
}

/* ---- Price series (reads the mkt:{ticker}:ohlcv MarketMetric node, read-only) ---- */

export interface PricePoint { t: number; c: number; o: number | null; h: number | null; l: number | null; v: number | null }
export interface PriceSeriesVM { available: boolean; interval: string | null; points: PricePoint[]; provider: string | null }
export const EMPTY_SERIES: PriceSeriesVM = { available: false, interval: null, points: [], provider: null };

/**
 * Read the historical OHLCV bars the market ingestion may have attached to the
 * graph as a `mkt:{ticker}:ohlcv` MarketMetric node. Returns EMPTY_SERIES when no
 * bars exist; callers must show an honest empty state, never a fabricated series.
 */
export function buildPriceSeries(graphKey: string): PriceSeriesVM {
  const node = G.getNode(`mkt:${graphKey}:ohlcv`);
  if (!node) return EMPTY_SERIES;
  const md = node.metadata as Record<string, unknown>;
  const bars = Array.isArray(md.bars) ? md.bars : [];
  const points: PricePoint[] = [];
  for (const b of bars) {
    if (!b || typeof b !== "object") continue;
    const r = b as Record<string, unknown>;
    const tRaw = mnum(r.t), c = mnum(r.c);
    if (tRaw == null || c == null) continue;
    const t = tRaw < 1e12 ? tRaw * 1000 : tRaw; // tolerate second-epoch bars
    points.push({ t, c, o: mnum(r.o), h: mnum(r.h), l: mnum(r.l), v: mnum(r.v) });
  }
  points.sort((a, b) => a.t - b.t);
  if (points.length < 2) return EMPTY_SERIES;
  return {
    available: true,
    interval: typeof md.interval === "string" ? md.interval : null,
    points,
    provider: typeof md.provider === "string" ? md.provider : null,
  };
}

/* ---- Relationship Map (Intelligence Graph, read-only, deterministic radial layout) ---- */

export interface MapNode { id: string; label: string; type: string; confidence: number; importance: number; relCount: number; x: number; y: number; r: number; degree: 0 | 1 | 2; angle: number }
export interface MapEdge { id: string; a: string; b: string; from: MapNode; to: MapNode; type: string; strength: number; confidence: number; evidenceCount: number; sources: number }
export interface MapVM { available: boolean; nodes: MapNode[]; edges: MapEdge[]; width: number; height: number; cx: number; cy: number; r1: number; r2: number }

/** Layout knobs. Defaults reproduce the drawer's compact 300x224 map exactly. */
export interface MapLayoutOptions {
  width?:          number;
  height?:         number;
  r1?:             number; // first-degree ring radius
  r2?:             number; // second-degree ring radius
  maxFirst?:       number; // max first-degree neighbors
  secondStrength?: number; // min edge strength to fan out second-degree nodes
  maxSecond?:      number; // max second-degree nodes overall
  nodeScale?:      number; // multiplies node radii (and spacing) for larger canvases
}

const MAP_DEFAULTS: Required<MapLayoutOptions> = {
  width: 300, height: 224, r1: 64, r2: 98, maxFirst: 12, secondStrength: 55, maxSecond: 8, nodeScale: 1,
};

export const EMPTY_MAP: MapVM = {
  available: false, nodes: [], edges: [],
  width: MAP_DEFAULTS.width, height: MAP_DEFAULTS.height,
  cx: MAP_DEFAULTS.width / 2, cy: MAP_DEFAULTS.height / 2, r1: MAP_DEFAULTS.r1, r2: MAP_DEFAULTS.r2,
};

/** Read the existing graph singleton and lay out a stable radial map around one entity. */
export function buildRelationshipMap(key: string, opts: MapLayoutOptions = {}): MapVM {
  const o = { ...MAP_DEFAULTS, ...opts };
  const cx = o.width / 2, cy = o.height / 2;
  const empty: MapVM = { ...EMPTY_MAP, width: o.width, height: o.height, cx, cy, r1: o.r1, r2: o.r2 };

  const mkNode = (node: IntelNode, degree: 0 | 1 | 2, x: number, y: number, angle: number): MapNode => {
    const importance = Math.max(0, Math.min(100, round(num(node.importance))));
    const r = (degree === 0 ? 11 : degree === 2 ? 5 : 6 + importance / 100 * 6) * o.nodeScale;
    return { id: node.id, label: node.label, type: String(node.type), confidence: round(num(node.confidence)), importance, relCount: G.getRelationships(node.id).length, x, y, r, degree, angle };
  };
  const mkEdge = (edge: IntelEdge, from: MapNode, to: MapNode): MapEdge => ({
    id: edge.id, a: from.id, b: to.id, from, to, type: edge.relationshipType,
    strength: round(num(edge.strength)), confidence: round(num(edge.confidence)),
    evidenceCount: num(edge.evidenceCount), sources: edge.originatingPages.length,
  });

  const center = G.getNode(key);
  if (!center) return empty;
  const neigh = G.getNeighbors(center.id);
  if (neigh.length === 0) return empty;

  const first = [...neigh].sort((a, b) => b.edge.strength - a.edge.strength).slice(0, o.maxFirst);
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const centerNode = mkNode(center, 0, cx, cy, 0);
  nodes.push(centerNode);
  const byId = new Map<string, MapNode>([[center.id, centerNode]]);

  const n = first.length;
  first.forEach((x, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const mn = mkNode(x.node, 1, cx + Math.cos(ang) * o.r1, cy + Math.sin(ang) * o.r1, ang);
    nodes.push(mn); byId.set(x.node.id, mn);
    edges.push(mkEdge(x.edge, centerNode, mn));
  });

  // Second-degree: for strong first-degree links, up to two strong neighbors each,
  // fanned slightly off the parent angle so clusters read as constellations.
  let added = 0;
  for (const x of first) {
    if (added >= o.maxSecond) break;
    if (x.edge.strength < o.secondStrength) continue;
    const parent = byId.get(x.node.id)!;
    const outers = G.getNeighbors(x.node.id)
      .filter(y => !byId.has(y.node.id) && y.node.id !== center.id)
      .sort((a, b) => b.edge.strength - a.edge.strength)
      .slice(0, 2);
    for (let j = 0; j < outers.length && added < o.maxSecond; j++) {
      const outer = outers[j];
      const ang = parent.angle + (outers.length > 1 ? (j === 0 ? -0.26 : 0.26) : 0);
      const mn = mkNode(outer.node, 2, cx + Math.cos(ang) * o.r2, cy + Math.sin(ang) * o.r2, ang);
      nodes.push(mn); byId.set(outer.node.id, mn);
      edges.push(mkEdge(outer.edge, parent, mn));
      added += 1;
    }
  }

  // Deterministic de-overlap: a few fixed passes nudging ring nodes apart. Not a
  // physics simulation; same input always yields the same layout.
  for (let iter = 0; iter < 6; iter++) {
    for (let i = 1; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const min = a.r + b.r + 11 * o.nodeScale;
        if (dist < min) {
          const push = (min - dist) / 2, ux = dx / dist, uy = dy / dist;
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
        }
      }
    }
  }
  const mx = 14 * o.nodeScale, my = 14 * o.nodeScale, myBottom = 16 * o.nodeScale;
  for (const nd of nodes) {
    if (nd.degree === 0) continue;
    nd.x = Math.max(mx, Math.min(o.width - mx, nd.x));
    nd.y = Math.max(my, Math.min(o.height - myBottom, nd.y));
  }

  return { available: true, nodes, edges, width: o.width, height: o.height, cx, cy, r1: o.r1, r2: o.r2 };
}

/* ---- Current theme exposure (display-only dedupe of already-computed data) ---- */

/**
 * The resolved parent theme plus the graph's connected themes, deduped and cleaned.
 * Used by symbol views to show current theme exposure.
 */
export function collectCurrentThemes(parentTheme: string | null | undefined, relatedThemeLabels: string[], limit = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (name?: string | null) => {
    if (!name) return;
    const c = cleanThemeName(name);
    const k = c.toLowerCase();
    if (c && !seen.has(k)) { seen.add(k); out.push(c); }
  };
  push(parentTheme);
  for (const t of relatedThemeLabels) push(t);
  return out.slice(0, limit);
}

/* ---- Explorer routing (URL <-> IntelContext, presentational only) ---- */

export const EXPLORER_KINDS: readonly IntelKind[] = ["theme", "company", "etf", "sector", "driver", "deal", "narrative"];

const normSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** /explore URL for the active intelligence context. */
export function explorerHref(ctx: IntelContext): string {
  const q = new URLSearchParams();
  if (ctx.label && ctx.label !== ctx.id) q.set("label", ctx.label);
  if (ctx.sourceTheme) q.set("theme", ctx.sourceTheme);
  if (ctx.color) q.set("color", ctx.color);
  const qs = q.toString();
  return `/explore/${encodeURIComponent(`${ctx.kind}:${ctx.id}`)}${qs ? `?${qs}` : ""}`;
}

/** Map a graph node type onto the intelligence kind it explores as (null = not navigable). */
export function nodeTypeToIntelKind(t: string): IntelKind | null {
  if (t === "Company") return "company";
  if (t === "ETF") return "etf";
  if (t === "Theme" || t === "Narrative") return "theme";
  if (t === "Macro" || t === "MacroSeries") return "driver";
  if (t === "Sector") return "sector";
  return null;
}

/** /explore URL for a relationship-map node, or null when the type is not navigable. */
export function explorerHrefForNode(node: { type: string; label: string }, color?: string): string | null {
  const kind = nodeTypeToIntelKind(node.type);
  if (!kind) return null;
  const id = kind === "company" || kind === "etf" ? node.label.toUpperCase() : normSlug(node.label);
  return explorerHref({ kind, id, label: node.label, color });
}

/** Parse the /explore/[entity] segment (kind:id) back into an IntelContext. */
export function parseExplorerEntity(segment: string, search?: { get(name: string): string | null } | null): IntelContext | null {
  let raw = segment;
  try { raw = decodeURIComponent(segment); } catch { /* keep as-is */ }
  const sep = raw.indexOf(":");
  if (sep <= 0) return null;
  const kind = raw.slice(0, sep) as IntelKind;
  const id = raw.slice(sep + 1);
  if (!EXPLORER_KINDS.includes(kind) || !id) return null;
  const label = search?.get("label")
    ?? (kind === "company" || kind === "etf"
      ? id.toUpperCase()
      : id.replace(/-/g, " ").replace(/\b[a-z]/g, c => c.toUpperCase()));
  return {
    kind,
    id: kind === "company" || kind === "etf" ? id.toUpperCase() : id,
    label,
    sourceTheme: search?.get("theme") ?? undefined,
    color: search?.get("color") ?? undefined,
  };
}
