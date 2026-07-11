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
import { num, round } from "./intelligenceUtils";
import { formatRelativeAge, secondsSince } from "./utils";
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

// buildForecast: DELETED (Phase 2.7, D8). The Intelligence Profile forward
// view (prediction engine, assembled centrally, A2-cached) is the one source;
// ForecastVM survives as a render shape only.

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
  /** Which provider endpoint produced the quote: null (batch), "quote_profile", "profile_fallback". */
  source: string | null;
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
    source: typeof lmd.sourceEndpoint === "string" && lmd.sourceEndpoint ? lmd.sourceEndpoint : null,
  };
}

/* ---- Price series: lives in lib/marketSeries (pure, testable); re-exported here ---- */

export { buildPriceSeries, selectSeriesForRange, EMPTY_SERIES, CHART_RANGES, RANGE_MS, MIN_INTRADAY_BARS, MIN_WEEK_INTRADAY_BARS } from "./marketSeries";
export type { PricePoint, PriceSeriesVM, ChartRangeKey, RangeSelection } from "./marketSeries";

/* ---- Relationship / causal map: lives in lib/causalMap (pure, testable) ---- */

export { buildRelationshipMap, expandMap, countExpansion, findExpansionCandidates, deriveEdgeTrend, causalLayerOfType, EMPTY_MAP, EXPANSION_MODES } from "./causalMap";
export type { MapNode, MapEdge, MapVM, MapLayoutOptions, ExpansionMode, EdgeTrend } from "./causalMap";

/* ---- Conviction history (Memory Engine, read-only) ---- */

export interface ConvictionPoint { t: number; conviction: number; confidence: number }

/** Per-day conviction/confidence series from the Memory Engine. Empty when untracked. */
export function buildConvictionHistory(key: string): ConvictionPoint[] {
  const h = getEntityHistory(key);
  if (!("found" in h)) return [];
  return h.snapshots
    .map(s => ({ t: Date.parse(s.date), conviction: s.conviction, confidence: s.confidence }))
    .filter(p => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
}

/* ---- Theme exposure (graph edge strengths from the focused entity to themes) ---- */

export interface ThemeExposureItem { label: string; strength: number }

/** Relative theme exposure: edge strength from the entity to each connected theme. */
export function buildThemeExposure(graphKey: string, limit = 6): ThemeExposureItem[] {
  const center = G.getNode(graphKey);
  if (!center) return [];
  const best = new Map<string, ThemeExposureItem>();
  for (const x of G.getNeighbors(center.id)) {
    const t = String(x.node.type);
    if (t !== "Theme" && t !== "Narrative") continue;
    const label = cleanThemeName(x.node.label);
    const k = label.toLowerCase();
    const strength = Math.max(0, Math.min(100, round(num(x.edge.strength))));
    const prev = best.get(k);
    if (!prev || strength > prev.strength) best.set(k, { label, strength });
  }
  return [...best.values()].sort((a, b) => b.strength - a.strength).slice(0, limit);
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

/** Parse the /explore/[entity] segment (kind:id, or a bare ticker) into an IntelContext. */
export function parseExplorerEntity(segment: string, search?: { get(name: string): string | null } | null): IntelContext | null {
  let raw = segment;
  try { raw = decodeURIComponent(segment); } catch { /* keep as-is */ }
  const sep = raw.indexOf(":");
  if (sep <= 0) {
    // Bare ticker segment (/explore/NVDA) resolves as a company context.
    if (/^[A-Za-z][A-Za-z0-9.\-]{0,7}$/.test(raw)) {
      const id = raw.toUpperCase();
      return { kind: "company", id, label: search?.get("label") ?? id, sourceTheme: search?.get("theme") ?? undefined, color: search?.get("color") ?? undefined };
    }
    return null;
  }
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
