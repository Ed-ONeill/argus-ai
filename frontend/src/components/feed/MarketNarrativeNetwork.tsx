"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X } from "lucide-react";
import { useNarrativeNetwork } from "@/hooks/useNarrativeNetwork";
import { useMarketState } from "@/hooks/useMarketState";
import type { GraphNode, GraphEdge, PropagationChain } from "@/lib/types";

// ── Canvas constants ───────────────────────────────────────────────────────────
// W/H define the SVG coordinate space. PAD_X is generous atmospheric dead-space
// on each side — edge fog fills it so nodes feel like part of a larger unseen system.

const W       = 1120;
const H       = 350;
const PAD_X   = 68;
const PAD_Y   = 44;
const LABEL_X = 54;

// ── Row config ────────────────────────────────────────────────────────────────

const TYPE_ROW: Record<string, number> = {
  regime: 0, macro: 1, theme: 2, sector: 3, asset: 4,
};

const ROW_LABELS: Record<number, string> = {
  0: "PRESSURE", 1: "DRIVERS", 2: "THEMES", 3: "ROTATION", 4: "ASSETS",
};

const NODE_TYPE_LABEL: Record<string, string> = {
  regime: "Market State",  macro:  "Macro Driver",
  theme:  "Cross-Asset Theme", sector: "Sector", asset: "Asset Class",
};

// ── Spatial depth — fill opacity by layer (regime nearest, assets furthest) ───

const LAYER_FILL_OPACITY: Record<string, number> = {
  regime: 1.00, macro: 0.97, theme: 0.93, sector: 0.89, asset: 0.85,
};

// ── Ambient particle definitions (deterministic positions, no JS state) ────────

// ── Capital flow trails — faint horizontal liquidity indicators ───────────────

const LIQUIDITY_TRAILS = [
  { y:  72, dur: 28, begin: 0.0, opacity: 0.018, w: 240 },
  { y: 168, dur: 34, begin: 9.2, opacity: 0.013, w: 185 },
  { y: 258, dur: 22, begin: 4.1, opacity: 0.015, w: 270 },
];

// ── Directional flow field — base positions for regime-dependent flow ─────────

const FLOW_ORIGINS = [
  { cx: 178, cy:  90 }, { cx: 420, cy: 132 }, { cx: 618, cy:  78 },
  { cx: 840, cy: 118 }, { cx: 300, cy: 228 }, { cx: 758, cy: 262 },
  { cx: 520, cy: 295 }, { cx: 148, cy: 292 }, { cx: 958, cy: 182 },
  { cx: 650, cy: 170 }, { cx: 268, cy: 155 }, { cx: 990, cy: 285 },
];

// ── Label compression — institutional terminal style (Phase 4) ────────────────

const LABEL_COMPRESS: [RegExp, string][] = [
  [/\bArtificial Intelligence\b/g, "AI"],
  [/\bFederal Reserve\b/g,        "Fed"],
  [/\bHigher[\s-]for[\s-]Longer\b/g, "HTL"],
  [/\bNon-Bank Lending\b/g,       "Private Credit"],
  [/\s+(Environment|Conditions|Dynamics|Landscape)\s*$/g, ""],
  [/\bTechnology Sector\b/g,      "Tech"],
  [/\bEnergy Sector\b/g,          "Energy"],
  [/\bSector Leadership\b/g,      "Sector Led"],
];

function compressLabel(s: string): string {
  let out = s;
  for (const [re, rep] of LABEL_COMPRESS) out = out.replace(re, rep);
  return out.replace(/\s{2,}/g, " ").trim();
}

const AMBIENT_PARTICLES = [
  { cx:  52, cy: 178, r: 0.8, dur: 29, tx:  18, ty:  22, begin: 9.2 },
  { cx: 112, cy:  80, r: 0.9, dur: 24, tx:  28, ty:  18, begin: 0.0 },
  { cx: 298, cy: 135, r: 1.0, dur: 21, tx: -22, ty:  28, begin: 3.2 },
  { cx: 490, cy:  58, r: 0.8, dur: 27, tx:  35, ty: -16, begin: 6.5 },
  { cx: 668, cy: 183, r: 1.1, dur: 19, tx: -28, ty:  22, begin: 1.8 },
  { cx: 865, cy: 100, r: 0.9, dur: 25, tx:  30, ty:  26, begin: 4.9 },
  { cx: 1042, cy: 232, r: 1.0, dur: 22, tx: -18, ty: -24, begin: 0.7 },
  { cx: 175, cy: 272, r: 0.8, dur: 28, tx:  22, ty:  20, begin: 7.8 },
  { cx: 415, cy: 258, r: 1.1, dur: 18, tx: -30, ty:  14, begin: 3.6 },
  { cx: 598, cy: 248, r: 0.9, dur: 23, tx:  24, ty: -20, begin: 5.3 },
  { cx: 790, cy: 268, r: 1.0, dur: 20, tx: -22, ty:  16, begin: 2.1 },
  { cx: 1082, cy: 292, r: 0.9, dur: 26, tx:  20, ty: -20, begin: 5.8 },
];

// ── Grain texture (precomputed SVG noise, rendered once as raster by browser) ──

const _noiseSvg = "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>"
  + "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.68' numOctaves='3' stitchTiles='stitch'/>"
  + "</filter><rect width='200' height='200' filter='url(#n)'/></svg>";
const NOISE_BG = `url("data:image/svg+xml,${encodeURIComponent(_noiseSvg)}")`;

// ── Visual constants — institutional palette ──────────────────────────────────
// Deep blues / teal / amber / silver-gray / muted red. No bright greens or neon.

const NODE_STYLE: Record<string, { fill: string; stroke: string; label: string }> = {
  regime: { fill: "#0a1c38", stroke: "#4a8abc", label: "#b8d8f4" },
  macro:  { fill: "#1a1508", stroke: "#8a6418", label: "#c8a050" },
  theme:  { fill: "#0c1830", stroke: "#2e5e9a", label: "#68a8e0" },
  sector: { fill: "#081418", stroke: "#2a6070", label: "#5ab0c4" },
  asset:  { fill: "#0e0c1e", stroke: "#4a4080", label: "#9080c8" },
};

const SENTIMENT_STROKE: Record<string, string> = {
  bullish: "#2a6870", bearish: "#8a3838", neutral: "#3d5568", mixed: "#7a6022",
};

const EDGE_STROKE: Record<string, string> = {
  drives:       "#806828", pressures: "#883838",
  supports:     "#2a6858", benefits:  "#2870a0",
  correlates:   "#3c5878", rotates_into: "#584880",
};

const EDGE_STROKE_ACTIVE: Record<string, string> = {
  drives:       "#c8a040", pressures: "#c05858",
  supports:     "#3aa080", benefits:  "#4a9ac8",
  correlates:   "#6088b0", rotates_into: "#8068b0",
};

// ── Layout ────────────────────────────────────────────────────────────────────

// Per-row horizontal drift — creates organic left/right bias per system layer.
// Macro leans left (upstream pressure), sectors lean right (market effect land),
// assets lean left (defensive/portfolio gravity). Regime stays centered.
const ROW_DRIFT_X: Record<number, number> = {
  0:  0,    // regime: gravitational anchor
  1: -26,   // macro: upstream lean left
  2: +18,   // themes: transmission lean right
  3: +32,   // sectors: market effect pull right
  4: -22,   // assets: safe-haven / portfolio lean left
};

// ── Animation variants ────────────────────────────────────────────────────────

const SECTION_REVEAL = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.25, 0, 0.25, 1] as const } },
};

function idHash(id: string): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h ^ id.charCodeAt(i), 0x85ebca6b)) >>> 0;
  return h;
}

function computeLayout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
  const byRow = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const row = TYPE_ROW[n.type] ?? 2;
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row)!.push(n);
  }
  const presentRows = [...byRow.keys()].sort((a, b) => a - b);
  const numRows = presentRows.length;
  const usableW = W - PAD_X * 2;
  const usableH = H - PAD_Y * 2;
  const rowGap  = numRows > 1 ? usableH / (numRows - 1) : 0;

  const neighbors = new Map<string, string[]>();
  for (const e of edges) {
    if (!neighbors.has(e.source)) neighbors.set(e.source, []);
    if (!neighbors.has(e.target)) neighbors.set(e.target, []);
    neighbors.get(e.source)!.push(e.target);
    neighbors.get(e.target)!.push(e.source);
  }

  const pos = new Map<string, { x: number; y: number }>();
  presentRows.forEach((rowKey, idx) => {
    const rowNodes = byRow.get(rowKey)!;
    const y = PAD_Y + rowGap * idx;
    let ordered = rowNodes;
    if (idx > 0 && pos.size > 0) {
      ordered = [...rowNodes].sort((a, b) => {
        const avgX = (id: string) => {
          const xs = (neighbors.get(id) ?? []).flatMap(nid => {
            const p = pos.get(nid); return p ? [p.x] : [];
          });
          return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : W / 2;
        };
        return avgX(a.id) - avgX(b.id);
      });
    }
    const isThemeRow = rowKey === TYPE_ROW["theme"];
    const staggerAmt = isThemeRow && ordered.length > 3 ? 18 : 0;
    ordered.forEach((node, col) => {
      const stagger = staggerAmt ? (col % 2 === 0 ? -staggerAmt : staggerAmt) : 0;
      const jitterY = (node.type === "sector" || node.type === "asset" || node.type === "theme")
        ? (idHash(node.id) % 19) - 9 : 0;
      const jitterX = node.type === "asset" ? ((idHash(node.id + "x") % 17) - 8) : 0;
      const drift = ROW_DRIFT_X[rowKey] ?? 0;
      const rawX  = PAD_X + (usableW / (ordered.length + 1)) * (col + 1) + drift + jitterX;
      pos.set(node.id, {
        x: Math.max(PAD_X, Math.min(W - PAD_X, rawX)),
        y: y + stagger + jitterY,
      });
    });
  });
  return pos;
}

function nodeRadius(n: GraphNode): number {
  if (n.type === "regime") return 38;
  if (n.type === "macro")  return 16;
  if (n.type === "theme")  return Math.min(9 + (n.confidence / 100) * 11, 19);
  return Math.min(9 + (n.confidence / 100) * 13, 21);
}

function edgePath(x1: number, y1: number, x2: number, y2: number, edgeId?: string): string {
  const h  = edgeId ? idHash(edgeId) : 0;
  const pX = edgeId ? ((h & 0x7f) / 127 - 0.5) * 22 : 0;
  const pY = edgeId ? (((h >> 7) & 0x3f) / 63 - 0.5) * 14 : 0;
  const dy = y2 - y1;
  const dx = x2 - x1;
  if (Math.abs(dy) < 24) {
    const arc = Math.min(Math.abs(dx) * 0.40, 88);
    return `M ${x1} ${y1} Q ${(x1 + x2) / 2 + pX} ${y1 - arc + pY} ${x2} ${y2}`;
  }
  const tension = 0.52 + Math.min(Math.abs(dx) / W, 0.12);
  return `M ${x1} ${y1} C ${x1 + pX * 0.5} ${y1 + dy * tension + pY} ${x2 - pX * 0.5} ${y2 - dy * tension - pY} ${x2} ${y2}`;
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function formatAge(iso: string): string {
  try {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  } catch { return "—"; }
}

function regimeColor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("expansion") || l.includes("risk-on") || l.includes("dovish") || l.includes("easing"))
    return "#52b0c8";  // institutional teal — not green
  if (l.includes("tighten") || l.includes("shock") || l.includes("pressure") ||
      l.includes("risk-off") || l.includes("stagflat") || l.includes("hawkish"))
    return "#b05858";  // muted stress red
  return "#8898b8";   // neutral silver-blue
}

// ── Market pressure signals ────────────────────────────────────────────────────

interface PulseSignal {
  label: string; value: string; color: string; dot: string;
  arrow: "↑" | "↓" | "→";
}

function computeMarketPulse(
  dominant: string,
  chains: PropagationChain[],
  nodes: GraphNode[],
): PulseSignal[] {
  const r = dominant.toLowerCase();
  const out: PulseSignal[] = [];

  // 1. Risk — appetite direction
  const isOn  = r.includes("risk-on") || r.includes("expansion") || r.includes("dovish") || r.includes("easing");
  const isOff = r.includes("risk-off") || r.includes("tighten") || r.includes("stagflat") || r.includes("shock") || r.includes("hawkish");
  out.push({
    label: "Risk",
    arrow: isOn ? "↑" : isOff ? "↓" : "→",
    value: isOn ? "On" : isOff ? "Off" : "Neutral",
    color: isOn ? "#52b0c8" : isOff ? "#c05858" : "#8898b8",
    dot:   isOn ? "#2a7890" : isOff ? "#883838" : "#506880",
  });

  // 2. Rates — rising or falling pressure
  const ratesUp   = r.includes("tighten") || r.includes("hawkish") || r.includes("hike") || r.includes("qt");
  const ratesDown = r.includes("easing")  || r.includes("dovish")  || r.includes("cut")  || r.includes("qe");
  out.push({
    label: "Rates",
    arrow: ratesUp ? "↑" : ratesDown ? "↓" : "→",
    value: ratesUp ? "Rising" : ratesDown ? "Falling" : "Stable",
    color: ratesUp ? "#c8a040" : ratesDown ? "#52b0c8" : "#8898b8",
    dot:   ratesUp ? "#a07820" : ratesDown ? "#2a7890" : "#506880",
  });

  // 3. Volatility — stress/calm signals
  const volHigh = r.includes("shock") || r.includes("stagflat") || r.includes("crisis") || r.includes("stress");
  const volLow  = r.includes("expansion") || r.includes("risk-on") || r.includes("calm") || r.includes("stable");
  out.push({
    label: "Vol",
    arrow: volHigh ? "↑" : volLow ? "↓" : "→",
    value: volHigh ? "Elevated" : volLow ? "Suppressed" : "Moderate",
    color: volHigh ? "#b05858" : volLow ? "#52b0c8" : "#8898b8",
    dot:   volHigh ? "#883838" : volLow ? "#2a7890" : "#506880",
  });

  // 4. Liquidity — expanding vs tightening
  const liqTight = r.includes("tighten") || r.includes("hawkish") || r.includes("qt") || r.includes("hike");
  const liqLoose = r.includes("easing")  || r.includes("dovish")  || r.includes("qe") || r.includes("expand");
  out.push({
    label: "Liquidity",
    arrow: liqLoose ? "↑" : liqTight ? "↓" : "→",
    value: liqLoose ? "Expanding" : liqTight ? "Tightening" : "Stable",
    color: liqLoose ? "#52b0c8" : liqTight ? "#c05858" : "#8898b8",
    dot:   liqLoose ? "#2a7890" : liqTight ? "#883838" : "#506880",
  });

  // 5. Flow — sector/theme sentiment balance
  const active = nodes.filter(n => n.type === "sector" || n.type === "theme");
  const bull   = active.filter(n => n.sentiment === "bullish").length;
  const bear   = active.filter(n => n.sentiment === "bearish").length;
  const tot    = active.length || 1;
  const isBid  = bull > tot * 0.55;
  const isDef  = bear > tot * 0.50;
  out.push({
    label: "Flow",
    arrow: isBid ? "↑" : isDef ? "↓" : "→",
    value: isBid ? "Risk Bid" : isDef ? "Defensive" : "Rotating",
    color: isBid ? "#52b0c8" : isDef ? "#c05858" : "#c8a040",
    dot:   isBid ? "#2a7890" : isDef ? "#883838" : "#a07820",
  });

  return out;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipState { node: GraphNode; x: number; y: number }

function NodeTooltip({ t }: { t: TooltipState }) {
  const style = NODE_STYLE[t.node.type] ?? NODE_STYLE.theme;
  return (
    <div className="absolute z-20 pointer-events-none"
      style={{ left: t.x + 16, top: Math.max(4, t.y - 72), width: 248 }}>
      <div className="rounded-lg border px-3 py-2.5"
        style={{ background: "#050c1c", borderColor: "rgba(255,255,255,0.16)" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[7.5px] font-bold uppercase tracking-widest"
            style={{ color: style.label }}>{t.node.type}</span>
          <span className="text-[7.5px] text-white/38">
            {t.node.confidence.toFixed(0)}% conf
            {t.node.source_count > 0 && ` · ${t.node.source_count} stories`}
          </span>
        </div>
        <p className="text-[12px] font-semibold leading-tight mb-1" style={{ color: style.label }}>
          {t.node.label}
        </p>
        <p className="text-[9.5px] leading-snug" style={{ color: "rgba(255,255,255,0.72)" }}>
          {trunc(t.node.description, 130)}
        </p>
        <p className="text-[7.5px] text-white/40 mt-1.5">click to open intelligence panel</p>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <section style={{ background: "#050b18" }}>
      <div className="max-w-7xl mx-auto overflow-hidden">
        <div className="animate-pulse" style={{ background: "#070d1a", height: 410 }} />
      </div>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MarketNarrativeNetwork() {
  const { data, isLoading, isFetching } = useNarrativeNetwork();
  const ms = useMarketState();

  const [hoveredId, setHoveredId]         = useState<string | null>(null);
  const [tooltip, setTooltip]             = useState<TooltipState | null>(null);
  const [activeChain, setActiveChain]     = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  const wrapRef         = useRef<HTMLDivElement>(null);
  const initialChainRef = useRef(false);
  const msRegimeRef     = useRef(ms);
  msRegimeRef.current   = ms;  // always current, no stale closure in effects
  const chains          = data?.chains;

  useEffect(() => {
    if (initialChainRef.current || !chains?.length) return;
    initialChainRef.current = true;
    const { ratesRegime, volRegime, riskRegime } = msRegimeRef.current;

    // Prefer a chain whose title matches the dominant market driver
    const keyword =
      ratesRegime === "rising"                              ? "yield"   :
      (volRegime === "elevated" || volRegime === "high")   ? "vol"     :
      riskRegime === "risk-off"                             ? "risk"    :
      riskRegime === "risk-on"                              ? "growth"  : null;

    const sorted = [...chains].sort((a, b) => b.confidence - a.confidence);
    const matched = keyword
      ? sorted.find(c =>
          c.title.toLowerCase().includes(keyword) ||
          (c.summary ?? "").toLowerCase().includes(keyword),
        )
      : undefined;

    setActiveChain((matched ?? sorted[0]).id);
  }, [chains]);

  const positions = useMemo(
    () => data ? computeLayout(data.nodes, data.edges) : new Map(),
    [data],
  );

  const chainHighlight = useMemo<{
    nodeIds: Set<string>; edgeIds: Set<string>;
    edgeOrder: Map<string, number>; sequence: GraphNode[];
  }>(() => {
    if (!activeChain || !data) return { nodeIds: new Set(), edgeIds: new Set(), edgeOrder: new Map(), sequence: [] };
    const chain = data.chains.find(c => c.id === activeChain);
    if (!chain) return { nodeIds: new Set(), edgeIds: new Set(), edgeOrder: new Map(), sequence: [] };
    const nodeIds = new Set(chain.nodes);
    const edgeIds = new Set<string>();
    const edgeOrder = new Map<string, number>();
    for (let i = 0; i < chain.nodes.length - 1; i++) {
      const src = chain.nodes[i], tgt = chain.nodes[i + 1];
      data.edges.forEach(e => {
        if ((e.source === src && e.target === tgt) || (e.source === tgt && e.target === src)) {
          edgeIds.add(e.id); edgeOrder.set(e.id, i);
        }
      });
    }
    const sequence = chain.nodes
      .map(id => data.nodes.find(n => n.id === id))
      .filter((n): n is GraphNode => n != null);
    return { nodeIds, edgeIds, edgeOrder, sequence };
  }, [activeChain, data]);

  const hoveredHighlight = useMemo<{ nodeIds: Set<string>; edgeIds: Set<string> } | null>(() => {
    if (!hoveredId || !data) return null;
    const connected = data.edges.filter(e => e.source === hoveredId || e.target === hoveredId);
    return {
      edgeIds: new Set(connected.map(e => e.id)),
      nodeIds: new Set([hoveredId, ...connected.flatMap(e => [e.source, e.target])]),
    };
  }, [hoveredId, data]);

  const chainCentroid = useMemo(() => {
    if (!activeChain || !data) return null;
    const chain = data.chains.find(c => c.id === activeChain);
    if (!chain) return null;
    const pts = chain.nodes.flatMap(id => { const p = positions.get(id); return p ? [p] : []; });
    if (!pts.length) return null;
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  }, [activeChain, data, positions]);

  const activeHighlight    = activeChain !== null ? chainHighlight : hoveredHighlight;
  const anyHighlightActive = activeChain !== null || hoveredId !== null;

  const focusedNode = focusedNodeId && data
    ? (data.nodes.find(n => n.id === focusedNodeId) ?? null) : null;

  // ── Market-state reactive visual params ───────────────────────────────────
  const particleMax   = (0.085 * ms.particleIntensity).toFixed(3);
  const regBreath     = (1 + 0.022 * ms.breathAmplitude).toFixed(4);
  const atmoBase      = (0.68 + ms.atmosphereIntensity * 0.22).toFixed(2);
  const atmoTop       = (parseFloat(atmoBase) + 0.12).toFixed(2);
  const envBase       = (0.18 + ms.atmosphereIntensity * 0.18).toFixed(2);
  const envTop        = (0.30 + ms.atmosphereIntensity * 0.28).toFixed(2);
  const stressOp      = (ms.stressIntensity * 0.22).toFixed(3);
  const riskOp        = (ms.riskFieldIntensity * 0.28).toFixed(3);
  const volR          = `${(ms.volFieldScale * 68).toFixed(0)}%`;

  // Phase 5: Field evolution — intensity-driven dynamics
  // Particles move faster when market pressure is elevated
  const particleSpeedMul = 0.62 + ms.atmosphereIntensity * 0.72;  // 0.62–1.34×
  // Leadership concentration field — intensifies when chain active + market hot
  const leaderFieldOp    = chainCentroid
    ? (0.12 + ms.atmosphereIntensity * 0.22).toFixed(3) : "0";
  // Conflict field: subtle amber-left/teal-right split when cross-asset divergence active
  const hasConflict = ms.ratesRegime === "rising" && ms.riskRegime === "risk-on";
  const conflictOp  = hasConflict
    ? (0.04 + ms.atmosphereIntensity * 0.05).toFixed(3) : "0";
  // Exhaustion: ghost chains have lower opacity when trend is exhausting
  const exhaustionFade = ms.exhaustionRisk ? 0.72 : 1.0;

  // ── Temporal flow — trend aging drives particle decay and rotation zone ──────
  const momentumAge      = Math.min(ms.trend.duration / 6, 1);       // 0→1 as trend ages
  const decayMul         = ms.trend.momentumDecay ? 0.72 : 1.0;      // dims on decay
  const isAccel          = ms.trend.acceleration === "accelerating";
  const isDecel          = ms.trend.acceleration === "decelerating";
  const riskDir          = ms.trend.riskDirection;
  const temporalSpeedAdj = isAccel ? 1.20 : isDecel ? 0.80 : 1.0;
  // Aging momentum slows propagation: extended trend = particles fatigue
  const chainDur = (2.6 / (particleSpeedMul * temporalSpeedAdj * Math.max(1 - momentumAge * 0.22, 0.62))).toFixed(2);

  // Rotation flow — directional vertical gradient showing capital rotation zone
  const rotFlowRaw   = Math.max(0, (0.038 + momentumAge * 0.042) * decayMul) * ms.atmosphereIntensity;
  const rotFlowColor = riskDir === "strengthening" ? "#1030a8" : riskDir === "weakening" ? "#6a1818" : "#0a1c38";
  const rotFlowTopOp = (riskDir === "weakening"     ? rotFlowRaw : 0).toFixed(3);
  const rotFlowBotOp = (riskDir === "strengthening" ? rotFlowRaw : 0).toFixed(3);

  // Live signals: use ms.signals when data is available, fall back to pulses
  const displaySignals = ms.hasData ? ms.signals : null;

  const focusedConnections = useMemo(() => {
    if (!focusedNodeId || !data) return [];
    return data.edges
      .filter(e => e.source === focusedNodeId || e.target === focusedNodeId)
      .map(e => {
        const isSource = e.source === focusedNodeId;
        const connId   = isSource ? e.target : e.source;
        const connNode = data.nodes.find(n => n.id === connId);
        return connNode ? { node: connNode, rel: e.relationship, isSource, desc: e.description } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [focusedNodeId, data]);

  const focusedInChains = useMemo(() => {
    if (!focusedNodeId || !data) return [];
    return data.chains.filter(c => c.nodes.includes(focusedNodeId));
  }, [focusedNodeId, data]);

  const handleNodeEnter = useCallback((node: GraphNode, e: React.MouseEvent) => {
    setHoveredId(node.id);
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setTooltip({ node, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleNodeLeave  = useCallback(() => { setHoveredId(null); setTooltip(null); }, []);
  const handleNodeClick  = useCallback((node: GraphNode) => {
    setFocusedNodeId(prev => prev === node.id ? null : node.id);
    setHasInteracted(true);
  }, []);
  const handleReset      = useCallback(() => { setActiveChain(null); setFocusedNodeId(null); }, []);
  const handleChainClick = useCallback((chainId: string, currentActive: string | null) => {
    setActiveChain(currentActive === chainId ? null : chainId);
    setHasInteracted(true);
  }, []);

  if (isLoading) return <Skeleton />;
  if (!data || data.nodes.length < 2) return null;

  const sortedChains         = [...data.chains].sort((a, b) => b.confidence - a.confidence);
  const presentRelationships = [...new Set(data.edges.map(e => e.relationship))];
  const anyFocusOrChain      = focusedNodeId !== null || activeChain !== null;
  const focusedNodeStyle     = focusedNode ? (NODE_STYLE[focusedNode.type] ?? NODE_STYLE.theme) : null;

  // Regime node position — used for environmental lighting
  const regimeNode = data.nodes.find(n => n.type === "regime");
  const regimePos  = regimeNode ? positions.get(regimeNode.id) : null;
  const regCx = `${((regimePos?.x ?? W * 0.5) / W * 100).toFixed(1)}%`;
  const regCy = `${((regimePos?.y ?? H * 0.12) / H * 100).toFixed(1)}%`;

  // Chain spotlight — centered on active chain's node centroid
  const spotCx = `${((chainCentroid?.x ?? W * 0.5) / W * 100).toFixed(1)}%`;
  const spotCy = `${((chainCentroid?.y ?? H * 0.5) / H * 100).toFixed(1)}%`;

  const rowYMap = new Map<number, number>();
  for (const node of data.nodes) {
    const row = TYPE_ROW[node.type] ?? -1;
    if (row >= 0 && !rowYMap.has(row)) {
      const p = positions.get(node.id);
      if (p) rowYMap.set(row, p.y);
    }
  }
  const rowEntries = [...rowYMap.entries()].sort((a, b) => a[0] - b[0]);

  // Focused node environment — for ambient spotlight in graph and drawer
  const focusNodeInGraph = focusedNodeId ? data.nodes.find(n => n.id === focusedNodeId) : null;
  const focusEnvPos      = focusedNodeId ? positions.get(focusedNodeId) : null;
  const focusEnvCx       = `${((focusEnvPos?.x ?? W * 0.5) / W * 100).toFixed(1)}%`;
  const focusEnvCy       = `${((focusEnvPos?.y ?? H * 0.5) / H * 100).toFixed(1)}%`;
  const focusEnvStyle    = focusNodeInGraph
    ? (NODE_STYLE[focusNodeInGraph.type] ?? NODE_STYLE.theme) : null;
  const focusEnvColor    = focusEnvStyle?.stroke ?? "transparent";
  const pulses           = computeMarketPulse(data.dominant_regime, data.chains, data.nodes);

  const isStressEnv   = ms.riskRegime === "risk-off" || ms.stressIntensity > 0.18;
  const flowDir       = ms.riskRegime === "risk-on" ? 1 : ms.riskRegime === "risk-off" ? -1 : 0;
  const flowSpeed     = 0.52 + ms.atmosphereIntensity * 0.48;
  const flowOpBase    = ms.riskRegime !== "neutral"
    ? 0.030 + ms.atmosphereIntensity * 0.030
    : 0.014 + ms.atmosphereIntensity * 0.012;

  // ── Edge renderer ──────────────────────────────────────────────────────────
  function renderEdge(edge: GraphEdge) {
    const from = positions.get(edge.source);
    const to   = positions.get(edge.target);
    if (!from || !to) return null;

    const fromNode = data!.nodes.find(n => n.id === edge.source);
    const toNode   = data!.nodes.find(n => n.id === edge.target);
    const fr = fromNode ? nodeRadius(fromNode) : 14;
    const tr = toNode   ? nodeRadius(toNode)   : 14;

    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const sx = from.x + (dx / dist) * fr, sy = from.y + (dy / dist) * fr;
    const ex = to.x   - (dx / dist) * tr, ey = to.y   - (dy / dist) * tr;

    const isChainEdge  = chainHighlight.edgeIds.has(edge.id);
    const isHigh       = anyHighlightActive && (activeHighlight?.edgeIds.has(edge.id) ?? false);
    const isDim        = anyHighlightActive && !isHigh;
    const baseStroke   = EDGE_STROKE[edge.relationship]       ?? "#485a72";
    const activeStroke = EDGE_STROKE_ACTIVE[edge.relationship] ?? "#7898be";
    const stroke       = isChainEdge ? activeStroke : baseStroke;
    const base         = Math.min(0.36 + edge.confidence * 0.36, 0.72);
    const opacity      = isDim ? 0.02 : isChainEdge ? exhaustionFade : isHigh ? 0.85 : base;
    const sw           = Math.max(1.0, edge.weight * 3.0);
    const d            = edgePath(sx, sy, ex, ey, edge.id);
    const pDelay       = `${(chainHighlight.edgeOrder.get(edge.id) ?? 0) * 0.65}s`;

    return (
      <g key={edge.id}>
        {/* Residual pressure field — atmospheric density around active path */}
        {isChainEdge && (
          <path d={d} stroke={activeStroke} strokeWidth={(sw + 2.0) * 20}
            strokeOpacity={0.014} fill="none" filter="url(#edgeAura)" />
        )}
        {isChainEdge && (
          <path d={d} stroke={activeStroke} strokeWidth={(sw + 2.0) * 8}
            strokeOpacity={0.08} fill="none" filter="url(#edgeAura)" />
        )}
        {isChainEdge && (
          <path d={d} stroke={activeStroke} strokeWidth={(sw + 2.0) * 3.2}
            strokeOpacity={0.30} fill="none" filter="url(#edgeGlow)" />
        )}
        <path d={d} stroke={stroke} strokeWidth={isChainEdge ? sw + 2.0 : sw}
          strokeOpacity={opacity} fill="none"
          markerEnd={isChainEdge ? "url(#arrActive)" : undefined}
          style={{ transition: "stroke-opacity 200ms ease-out, stroke-width 200ms ease-out" }}>
          {isStressEnv && !isDim && !isChainEdge && (() => {
            const fh = idHash(edge.id + "f");
            const dur = (2.2 + (fh % 8) * 0.35).toFixed(1);
            const beg = ((fh >> 4) % 30 * 0.3).toFixed(1);
            return (
              <animate attributeName="stroke-opacity"
                values={`${opacity};${(opacity * 0.52).toFixed(3)};${opacity};${(opacity * 0.74).toFixed(3)};${opacity}`}
                keyTimes="0;0.22;0.45;0.72;1"
                dur={`${dur}s`} begin={`${beg}s`} repeatCount="indefinite" />
            );
          })()}
        </path>
        {/* Propagation particle with glow — speed driven by market intensity */}
        {isChainEdge && (
          <circle r={3.8} fill={activeStroke} filter="url(#particleGlow)">
            <animateMotion path={d} dur={`${chainDur}s`} begin={pDelay} repeatCount="indefinite"
              calcMode="spline" keyPoints="0;1" keyTimes="0;1"
              keySplines="0.25 0 0.75 1" />
            <animate attributeName="fill-opacity"
              values="0;0.92;0.92;0" keyTimes="0;0.08;0.88;1"
              dur={`${chainDur}s`} begin={pDelay} repeatCount="indefinite"
              calcMode="spline" keySplines="0.3 0 0.7 1;0.1 0 0.5 1;0.3 0 0.7 1" />
          </circle>
        )}
        {/* Ghost wake trail */}
        {isChainEdge && (
          <circle r={2.4} fill={activeStroke} filter="url(#particleGlow)">
            <animateMotion path={d} dur={`${chainDur}s`}
              begin={`${(chainHighlight.edgeOrder.get(edge.id) ?? 0) * 0.65 + 0.36}s`}
              repeatCount="indefinite"
              calcMode="spline" keyPoints="0;1" keyTimes="0;1"
              keySplines="0.25 0 0.75 1" />
            <animate attributeName="fill-opacity"
              values="0;0.35;0.35;0" keyTimes="0;0.08;0.88;1"
              dur={`${chainDur}s`}
              begin={`${(chainHighlight.edgeOrder.get(edge.id) ?? 0) * 0.65 + 0.36}s`}
              repeatCount="indefinite"
              calcMode="spline" keySplines="0.3 0 0.7 1;0.1 0 0.5 1;0.3 0 0.7 1" />
          </circle>
        )}
      </g>
    );
  }

  // ── Node renderer ──────────────────────────────────────────────────────────
  function renderNode(node: GraphNode) {
    const pos = positions.get(node.id);
    if (!pos) return null;

    const r        = nodeRadius(node);
    const base     = NODE_STYLE[node.type] ?? NODE_STYLE.theme;
    const stroke   = (node.type === "sector" || node.type === "theme")
      ? (SENTIMENT_STROKE[node.sentiment] ?? base.stroke) : base.stroke;

    const isHov    = hoveredId === node.id;
    const isFocus  = focusedNodeId === node.id;
    const isHigh   = anyHighlightActive && (activeHighlight?.nodeIds.has(node.id) ?? false);
    const isDim    = anyHighlightActive && !isHigh;
    const isRegime = node.type === "regime";
    const isTheme  = node.type === "theme";
    const isActive = chainHighlight.nodeIds.has(node.id);
    const fill     = isRegime ? "url(#regGrad)" : base.fill;
    const rc       = regimeColor(node.label);
    const depthFO  = isActive ? 1.0 : (LAYER_FILL_OPACITY[node.type] ?? 0.88);

    const showLabel = anyHighlightActive
      ? (isHigh || isHov || isFocus)
      : r >= (isTheme ? 14 : 10);
    const labelMax = isRegime ? 30 : (isTheme && !isFocus) ? 15 : isFocus ? 28 : 20;

    return (
      <g key={node.id}
        transform={`translate(${pos.x},${pos.y})`}
        className="cursor-pointer"
        style={{ opacity: isDim ? 0.010 : 1, transition: "opacity 200ms ease-out" }}
        onMouseEnter={e => handleNodeEnter(node, e)}
        onMouseLeave={handleNodeLeave}
        onClick={() => handleNodeClick(node)}>
        {!isRegime && (node.type === "sector" || node.type === "asset" || node.type === "theme") && (() => {
          const dh = idHash(node.id + "d");
          const dx = ((dh & 0x1f) / 31 - 0.5) * 5;
          const dy = (((dh >> 5) & 0x1f) / 31 - 0.5) * 3.5;
          const dur = 18 + (dh % 14);
          const beg = ((dh >> 10) % 80) / 10;
          return (
            <animateTransform attributeName="transform" attributeType="XML" type="translate"
              additive="sum"
              values={`0,0; ${dx.toFixed(1)},${dy.toFixed(1)}; 0,0`}
              dur={`${dur}s`} begin={`${beg.toFixed(1)}s`} repeatCount="indefinite"
              calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
          );
        })()}
        <g>
          {/* Sentiment pressure aura — high-confidence signal nodes */}
          {!isRegime && (node.type === "sector" || node.type === "theme") &&
            node.confidence > 62 && (node.sentiment === "bullish" || node.sentiment === "bearish") && (
            <circle
              r={r + 14}
              fill={node.sentiment === "bullish" ? "rgba(28,110,88,0.20)" : "rgba(130,40,40,0.16)"}
              filter="url(#hoverGlow)"
            />
          )}
          {isRegime && (
            <animateTransform attributeName="transform" attributeType="XML" type="scale"
              values={`1;${regBreath};1`} dur="6s" repeatCount="indefinite"
              calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
          )}
          {isActive && !isRegime && (
            <animateTransform attributeName="transform" attributeType="XML" type="scale"
              values="1;1.032;1" dur="4.2s" begin="0.9s" repeatCount="indefinite"
              calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
          )}

          {/* Regime: slow wide diffuse ring */}
          {isRegime && (
            <circle r={r + 5} fill="none" stroke={rc} strokeWidth="0.8" strokeOpacity="0">
              <animate attributeName="r" values={`${r + 2};${r + 58};${r + 2}`}
                dur="7.8s" repeatCount="indefinite"
                calcMode="spline" keySplines="0.2 0 0.8 1;0.2 0 0.8 1" keyTimes="0;0.5;1" />
              <animate attributeName="stroke-opacity" values="0.30;0;0.30"
                dur="7.8s" repeatCount="indefinite" />
            </circle>
          )}
          {/* Regime: mid pulse ring */}
          {isRegime && (
            <circle r={r + 5} fill="none" stroke={rc} strokeWidth="1.4" strokeOpacity="0">
              <animate attributeName="r" values={`${r + 4};${r + 36};${r + 4}`}
                dur="4.8s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.48;0;0.48"
                dur="4.8s" repeatCount="indefinite" />
            </circle>
          )}
          {/* Regime: tight inner ring */}
          {isRegime && (
            <circle r={r + 5} fill="none" stroke={rc} strokeWidth="1.8" strokeOpacity="0">
              <animate attributeName="r" values={`${r + 4};${r + 18};${r + 4}`}
                dur="3.2s" begin="1.6s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.70;0;0.70"
                dur="3.2s" begin="1.6s" repeatCount="indefinite" />
            </circle>
          )}
          {/* Regime: blur glow halo — fills + strokes for volume */}
          {isRegime && (
            <circle r={r + 4} fill={rc} fillOpacity="0.055"
              stroke={rc} strokeWidth="10" strokeOpacity="0.28" filter="url(#regGlow)" />
          )}

          {/* Active chain node rings — outer pulse + inner glow */}
          {isActive && !isRegime && (
            <circle r={r + 5} fill="none" stroke={base.label} strokeWidth="0.9" strokeOpacity="0">
              <animate attributeName="r" values={`${r + 4};${r + 24};${r + 4}`}
                dur="3.8s" repeatCount="indefinite"
                calcMode="spline" keySplines="0.2 0 0.8 1;0.2 0 0.8 1" keyTimes="0;0.5;1" />
              <animate attributeName="stroke-opacity" values="0.40;0;0.40"
                dur="3.8s" repeatCount="indefinite" />
            </circle>
          )}
          {isActive && !isRegime && (
            <circle r={r + 9} fill="none" stroke={base.label}
              strokeWidth="0.8" strokeOpacity={(0.28 * exhaustionFade * decayMul).toFixed(3)} filter="url(#activeGlow)" />
          )}
          {isActive && !isRegime && (
            <circle r={r + 5} fill="none" stroke={base.label}
              strokeWidth="2.4" strokeOpacity="0.90" filter="url(#activeGlow)" />
          )}
          {isActive && !isRegime && (
            <circle r={r + 1} fill={base.label} fillOpacity={(0.12 * exhaustionFade * decayMul).toFixed(3)} filter="url(#activeGlow)" />
          )}

          {/* Latent participation — faint slow pulse for high-confidence dormant nodes */}
          {!isActive && !isRegime && !isDim && node.confidence > 55 && (
            <circle r={r + 11} fill="none" stroke={base.label} strokeWidth="0.4" strokeOpacity="0">
              <animate attributeName="stroke-opacity"
                values={`0;${((node.confidence / 100) * 0.052 * decayMul).toFixed(3)};0`}
                dur={`${8 + (idHash(node.id + "lat") % 7)}s`}
                begin={`${((idHash(node.id + "lb") % 50) / 5).toFixed(1)}s`}
                repeatCount="indefinite"
                calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
            </circle>
          )}

          {isFocus && (
            <circle r={r + 7} fill="none" stroke={base.label}
              strokeWidth="1.5" strokeOpacity="0.65" strokeDasharray="4 3" />
          )}

          <circle r={r} fill={fill} fillOpacity={depthFO}
            stroke={stroke}
            strokeWidth={isActive || isFocus ? 2.8 : isHov ? 2.2 : 1.2}
            strokeOpacity={isActive || isFocus ? 1.0 : isHov ? 0.88 : isRegime ? 0.72 : 0.48}
            filter={isActive && !isRegime ? "url(#nodeActiveGlow)"
              : isHov && !isRegime ? "url(#hoverGlow)" : undefined}
            style={{ transition: "stroke-width 160ms ease-out, stroke-opacity 160ms ease-out" }} />

          {r < 18 && <circle r={2.5} fill={stroke} fillOpacity={0.72} />}

          {showLabel && (
            <text y={r + (isRegime ? 20 : 15)} textAnchor="middle"
              fontSize={isRegime ? 13.5 : isFocus ? 12 : 11}
              fontWeight={isRegime ? 700 : isFocus || isActive ? 600 : 500}
              fontFamily="Inter, system-ui, sans-serif"
              fill={base.label}
              stroke="#010306"
              strokeWidth={isRegime ? 9 : 7}
              strokeOpacity={0.94}
              strokeLinejoin="round"
              paintOrder="stroke"
              fillOpacity={isHov || isFocus ? 1.0 : isActive ? 1.0 : isRegime ? 0.98 : 0.92}
              filter={isActive || isHov || isFocus ? "url(#textGlow)" : undefined}
              className="pointer-events-none select-none"
              style={{ transition: "fill-opacity 160ms ease-out" }}>
              {trunc(compressLabel(node.label), labelMax)}
            </text>
          )}
          {/* Directional pressure indicator */}
          {showLabel && !isRegime && r >= 12 &&
            (node.sentiment === "bullish" || node.sentiment === "bearish") && (
            <text
              y={r + 15 + 11}
              textAnchor="middle"
              fontSize={7}
              fontFamily="Inter, system-ui, sans-serif"
              fill={node.sentiment === "bullish" ? "#2a9070" : "#c05050"}
              fillOpacity={0.78}
              stroke="#010306"
              strokeWidth={3}
              strokeOpacity={0.85}
              strokeLinejoin="round"
              paintOrder="stroke"
              className="pointer-events-none select-none">
              {node.sentiment === "bullish" ? "▲" : "▼"}
            </text>
          )}
        </g>
      </g>
    );
  }

  return (
    <section style={{ background: "#050b18" }}>
      <div className="max-w-7xl mx-auto overflow-hidden">

        {/* Bloomberg-style market state + flow signals bar */}
        <div className="flex items-center gap-0 px-6 py-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>

          {/* Market State — compact left anchor */}
          <div className="shrink-0 pr-5" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[6.5px] font-bold uppercase tracking-[0.18em] mb-0.5"
              style={{ color: "rgba(255,255,255,0.30)" }}>
              Market State
            </p>
            <p className="text-[13px] font-semibold leading-none tracking-tight"
              style={{ color: regimeColor(data.dominant_regime) }}>
              {data.dominant_regime}
            </p>
          </div>

          {/* Flow signals — live market data when available, regime-derived fallback */}
          <div className="flex items-center gap-5 flex-1 pl-5 flex-wrap">
            {(displaySignals ?? pulses).map(s => (
              <div key={s.label} className="flex items-center gap-1">
                <span className="text-[10px] font-bold leading-none" style={{ color: s.color }}>
                  {s.arrow}
                </span>
                <span className="text-[7.5px] ml-0.5" style={{ color: "rgba(255,255,255,0.36)" }}>
                  {s.label}
                </span>
                <span className="text-[9.5px] font-semibold ml-0.5" style={{ color: s.color }}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>

          {/* Right: metadata + actions */}
          <div className="flex items-center gap-3 shrink-0 pl-4">
            <span className="text-[7.5px] tabular-nums" style={{ color: "rgba(255,255,255,0.26)" }}>
              {data.nodes.length} nodes · {data.edges.length} signals
            </span>
            {isFetching && <RefreshCw size={9} className="animate-spin" style={{ color: "rgba(255,255,255,0.28)" }} />}
            {anyFocusOrChain && (
              <button onClick={handleReset}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
                           text-[8.5px] text-white/50 hover:text-white/80 transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
                <X size={9} strokeWidth={2.5} /><span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Graph canvas */}
        <div ref={wrapRef} className="relative" style={{ minHeight: 292 }}>

          {/* Atmospheric grain texture — precomputed, GPU-cached */}
          <div aria-hidden className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: NOISE_BG,
              backgroundRepeat: "repeat",
              opacity: 0.022,
              mixBlendMode: "soft-light",
            }} />

          <svg viewBox={`0 0 ${W} ${H}`} className="w-full block relative"
            style={{ overflow: "visible" }}>
            <defs>
              {/* Arrow markers */}
              <marker id="arr" markerWidth="5" markerHeight="5"
                refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,5 L5,2.5 Z" fill="rgba(255,255,255,0.07)" />
              </marker>
              <marker id="arrActive" markerWidth="7" markerHeight="7"
                refX="5.5" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,7 L7,3.5 Z" fill="rgba(255,255,255,0.82)" />
              </marker>

              {/* Regime node gradient — deeper with a luminous inner core */}
              <radialGradient id="regGrad" cx="50%" cy="38%" r="50%">
                <stop offset="0%"   stopColor="#2a5898" stopOpacity="0.98" />
                <stop offset="35%"  stopColor="#1a3d6c" stopOpacity="0.99" />
                <stop offset="72%"  stopColor="#0c2040" stopOpacity="1.0"  />
                <stop offset="100%" stopColor="#05101e" stopOpacity="1"    />
              </radialGradient>

              {/* Atmospheric background — amplitude driven by market intensity */}
              <radialGradient id="bgAtmo" cx="50%" cy="10%" r="72%">
                <stop offset="0%" stopColor="#0e2244">
                  <animate attributeName="stop-opacity" values={`${atmoBase};${atmoTop};${atmoBase}`}
                    dur="9s" repeatCount="indefinite"
                    calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
                </stop>
                <stop offset="50%" stopColor="#06102a" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#030608" stopOpacity="0" />
              </radialGradient>

              {/* Secondary ambient light — drifts slowly from bottom-left, desync'd from bgAtmo */}
              <radialGradient id="ambLight2" cx="22%" cy="82%" r="52%">
                <stop offset="0%" stopColor="#182840">
                  <animate attributeName="stop-opacity" values="0.0;0.20;0.0"
                    dur="13s" begin="4.5s" repeatCount="indefinite"
                    calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
                </stop>
                <stop offset="100%" stopColor="#030608" stopOpacity="0" />
              </radialGradient>

              {/* Regime environmental glow — tracks regime node, reacts to live market state */}
              <radialGradient id="regEnvGrad" cx={regCx} cy={regCy} r="48%"
                gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor={ms.atmosphereColor}>
                  <animate attributeName="stop-opacity" values={`${envBase};${envTop};${envBase}`}
                    dur="8s" repeatCount="indefinite"
                    calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
                </stop>
                <stop offset="55%" stopColor={ms.atmosphereColor} stopOpacity="0.06" />
                <stop offset="100%" stopColor="#030608" stopOpacity="0" />
              </radialGradient>

              {/* Market stress field — expands with volatility, dims with risk-on */}
              <radialGradient id="mkStress" cx="50%" cy="55%" r={volR}
                gradientUnits="objectBoundingBox">
                <stop offset="0%"   stopColor="#6a1818" stopOpacity={stressOp} />
                <stop offset="55%"  stopColor="#2a0808" stopOpacity={parseFloat(stressOp) * 0.35 > 0 ? (parseFloat(stressOp) * 0.35).toFixed(3) : "0"} />
                <stop offset="100%" stopColor="transparent" stopOpacity="0" />
              </radialGradient>

              {/* Market risk-on field — expands with equity strength */}
              <radialGradient id="mkRisk" cx="50%" cy="25%" r="60%"
                gradientUnits="objectBoundingBox">
                <stop offset="0%"   stopColor="#0e2860" stopOpacity={riskOp} />
                <stop offset="100%" stopColor="transparent" stopOpacity="0" />
              </radialGradient>

              {/* Leadership concentration field — hot-zone under active chain centroid */}
              <radialGradient id="leaderField" cx={spotCx} cy={spotCy} r="18%"
                gradientUnits="objectBoundingBox">
                <stop offset="0%"   stopColor="#4878c0" stopOpacity={leaderFieldOp} />
                <stop offset="60%"  stopColor="#2848a0" stopOpacity={parseFloat(leaderFieldOp) * 0.35 > 0 ? (parseFloat(leaderFieldOp) * 0.35).toFixed(3) : "0"} />
                <stop offset="100%" stopColor="transparent" stopOpacity="0" />
              </radialGradient>

              {/* Conflict field — amber/teal horizontal split when cross-asset divergence */}
              <linearGradient id="conflictField" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="#c8a040" stopOpacity={conflictOp} />
                <stop offset="42%"  stopColor="transparent" stopOpacity="0" />
                <stop offset="58%"  stopColor="transparent" stopOpacity="0" />
                <stop offset="100%" stopColor="#52b0c8" stopOpacity={conflictOp} />
              </linearGradient>

              {/* Thermal cold field — inverted spotlight, darkens inactive zones */}
              <radialGradient id="coldField" cx={spotCx} cy={spotCy} r="70%"
                gradientUnits="objectBoundingBox">
                <stop offset="0%"   stopColor="#020510" stopOpacity="0" />
                <stop offset="100%" stopColor="#020510"
                  stopOpacity={chainCentroid ? 0.20 : 0} />
              </radialGradient>

              {/* Chain spotlight — illuminates active chain centroid, breathes when live */}
              <radialGradient id="chainSpot" cx={spotCx} cy={spotCy} r="28%"
                gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="#304878"
                  stopOpacity={chainCentroid ? 0.34 : 0}>
                  {chainCentroid && (
                    <animate attributeName="stop-opacity" values="0.34;0.55;0.34"
                      dur="4.2s" repeatCount="indefinite"
                      calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
                  )}
                </stop>
                <stop offset="60%" stopColor="#1a2c4a"
                  stopOpacity={chainCentroid ? 0.10 : 0} />
                <stop offset="100%" stopColor="#030608" stopOpacity="0" />
              </radialGradient>

              {/* Regime thermal concentration — tight hot-spot, always lit */}
              <radialGradient id="regThermal" cx={regCx} cy={regCy} r="14%"
                gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="#2858b0" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#030608" stopOpacity="0" />
              </radialGradient>

              {/* Edge fog — atmospheric boundary fade, left and right sides */}
              <linearGradient id="edgeFog" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"  stopColor="#030608" stopOpacity="0.70" />
                <stop offset="7%"  stopColor="#030608" stopOpacity="0.12" />
                <stop offset="11%" stopColor="#030608" stopOpacity="0" />
                <stop offset="89%" stopColor="#030608" stopOpacity="0" />
                <stop offset="93%" stopColor="#030608" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#030608" stopOpacity="0.70" />
              </linearGradient>

              {/* Subtle grid pattern — institutional depth cue */}
              <pattern id="gridPat" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none"
                  stroke="rgba(255,255,255,0.020)" strokeWidth="0.5" />
              </pattern>

              {/* Corner + edge vignette — pulls eye inward and softens boundary */}
              <radialGradient id="vignette" cx="50%" cy="50%" r="72%">
                <stop offset="0%"   stopColor="#000000" stopOpacity="0" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.52" />
              </radialGradient>

              {/* Filters */}
              <filter id="regGlow" x="-110%" y="-110%" width="320%" height="320%">
                <feGaussianBlur stdDeviation="18" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="activeGlow" x="-120%" y="-120%" width="340%" height="340%">
                <feGaussianBlur stdDeviation="9" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="nodeActiveGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="5.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="hoverGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="edgeGlow" x="-20%" y="-100%" width="140%" height="300%">
                <feGaussianBlur stdDeviation="5.5" />
              </filter>
              <filter id="edgeAura" x="-60%" y="-200%" width="220%" height="500%">
                <feGaussianBlur stdDeviation="16" />
              </filter>
              {/* Active/hovered label glow */}
              <filter id="textGlow" x="-35%" y="-35%" width="170%" height="170%">
                <feGaussianBlur stdDeviation="2.2" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              {/* Propagation particle glow */}
              <filter id="particleGlow" x="-200%" y="-200%" width="500%" height="500%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>

              {/* Rotation flow gradient — directional capital zone indicator */}
              <linearGradient id="rotationFlow" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor={rotFlowColor} stopOpacity={rotFlowTopOp} />
                <stop offset="40%"  stopColor="transparent" stopOpacity="0" />
                <stop offset="60%"  stopColor="transparent" stopOpacity="0" />
                <stop offset="100%" stopColor={rotFlowColor} stopOpacity={rotFlowBotOp} />
              </linearGradient>

              {/* Leadership concentration gradients — local density at active chain nodes */}
              {activeChain && chainHighlight.sequence.slice(0, 3).map(n => {
                const p  = positions.get(n.id);
                if (!p) return null;
                const ns = NODE_STYLE[n.type] ?? NODE_STYLE.theme;
                const op = Math.min((n.confidence / 100) * ms.atmosphereIntensity * 0.15, 0.18).toFixed(3);
                return (
                  <radialGradient key={n.id} id={`concF_${n.id}`}
                    cx={`${(p.x / W * 100).toFixed(1)}%`} cy={`${(p.y / H * 100).toFixed(1)}%`}
                    r="14%" gradientUnits="objectBoundingBox">
                    <stop offset="0%"   stopColor={ns.stroke} stopOpacity={op} />
                    <stop offset="68%"  stopColor={ns.stroke} stopOpacity={(parseFloat(op) * 0.20).toFixed(3)} />
                    <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                  </radialGradient>
                );
              })}

              {/* Focused node environment — ambient spotlight at clicked node */}
              <radialGradient id="focusEnvGrad" cx={focusEnvCx} cy={focusEnvCy} r="34%"
                gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor={focusEnvColor}
                  stopOpacity={focusedNodeId ? 0.26 : 0} />
                <stop offset="55%" stopColor={focusEnvColor}
                  stopOpacity={focusedNodeId ? 0.06 : 0} />
                <stop offset="100%" stopColor="#030608" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Atmospheric layers — back to front */}
            <rect width={W} height={H} fill="url(#bgAtmo)" />
            <rect width={W} height={H} fill="url(#gridPat)" className="pointer-events-none" />
            <rect width={W} height={H} fill="url(#ambLight2)" className="pointer-events-none" />
            {/* Market-state reactive pressure fields */}
            {parseFloat(riskOp)    > 0 && <rect width={W} height={H} fill="url(#mkRisk)"       className="pointer-events-none" />}
            {parseFloat(stressOp)  > 0 && <rect width={W} height={H} fill="url(#mkStress)"     className="pointer-events-none" />}
            {parseFloat(conflictOp) > 0 && <rect width={W} height={H} fill="url(#conflictField)" className="pointer-events-none" />}
            <rect width={W} height={H} fill="url(#regEnvGrad)" />
            <rect width={W} height={H} fill="url(#regThermal)" className="pointer-events-none" />
            <rect width={W} height={H} fill="url(#coldField)"  className="pointer-events-none" />
            <rect width={W} height={H} fill="url(#chainSpot)"  className="pointer-events-none" />
            {chainCentroid && <rect width={W} height={H} fill="url(#leaderField)" className="pointer-events-none" />}
            {/* Rotation flow — directional capital zone indicator */}
            {(parseFloat(rotFlowTopOp) + parseFloat(rotFlowBotOp)) > 0 && (
              <rect width={W} height={H} fill="url(#rotationFlow)" className="pointer-events-none" />
            )}
            {/* Leadership concentration — local density fields at active chain nodes */}
            {activeChain && chainHighlight.sequence.slice(0, 3).map(n =>
              positions.get(n.id)
                ? <rect key={`cf-${n.id}`} width={W} height={H}
                    fill={`url(#concF_${n.id})`} className="pointer-events-none" />
                : null
            )}
            {/* Vol instability flicker — rapid field disturbance during elevated vol */}
            {(ms.volRegime === "elevated" || ms.volRegime === "high") && (() => {
              const vOp  = (ms.volScore * 0.022).toFixed(3);
              const vDur = (1.6 + (1 - ms.volScore) * 1.4).toFixed(1);
              return (
                <rect width={W} height={H} fill="#7a1818" className="pointer-events-none">
                  <animate attributeName="fill-opacity"
                    values={`0;${vOp};0;${(parseFloat(vOp) * 0.58).toFixed(3)};0`}
                    keyTimes="0;0.14;0.45;0.70;1"
                    dur={`${vDur}s`} repeatCount="indefinite" />
                </rect>
              );
            })()}
            {/* Compression waves — radiate outward from regime node during stress */}
            {ms.stressIntensity > 0.12 && regimePos && (
              <g className="pointer-events-none">
                {[0, 1, 2].map(i => {
                  const wDur = (7.5 - ms.stressIntensity * 2.5).toFixed(1);
                  const maxR = (175 - ms.stressIntensity * 55).toFixed(0);
                  const wOp  = (ms.stressIntensity * 0.28).toFixed(2);
                  return (
                    <circle key={i} cx={regimePos.x} cy={regimePos.y} r="18"
                      fill="none" stroke="#8a2020" strokeWidth="0.5" strokeOpacity="0">
                      <animate attributeName="r" values={`18;${maxR};18`}
                        dur={`${wDur}s`} begin={`${i * 2.2}s`} repeatCount="indefinite"
                        calcMode="spline" keySplines="0.2 0 0.8 1;0.2 0 0.8 1" keyTimes="0;0.5;1" />
                      <animate attributeName="stroke-opacity" values={`${wOp};0;${wOp}`}
                        dur={`${wDur}s`} begin={`${i * 2.2}s`} repeatCount="indefinite" />
                    </circle>
                  );
                })}
              </g>
            )}
            {/* Expansion waves — radiate outward during risk-on momentum */}
            {ms.riskFieldIntensity > 0.08 && regimePos && (
              <g className="pointer-events-none">
                {[0, 1].map(i => {
                  const maxR = (215 + ms.riskFieldIntensity * 65).toFixed(0);
                  const eOp  = (ms.riskFieldIntensity * 0.18).toFixed(2);
                  return (
                    <circle key={i} cx={regimePos.x} cy={regimePos.y} r="28"
                      fill="none" stroke="#2858a0" strokeWidth="0.4" strokeOpacity="0">
                      <animate attributeName="r" values={`28;${maxR};28`}
                        dur="9s" begin={`${i * 3.8}s`} repeatCount="indefinite"
                        calcMode="spline" keySplines="0.25 0 0.75 1;0.25 0 0.75 1" keyTimes="0;0.5;1" />
                      <animate attributeName="stroke-opacity" values={`${eOp};0;${eOp}`}
                        dur="9s" begin={`${i * 3.8}s`} repeatCount="indefinite" />
                    </circle>
                  );
                })}
              </g>
            )}
            <rect width={W} height={H} fill="url(#focusEnvGrad)" className="pointer-events-none" />

            {/* Ambient drifting particles — speed and brightness driven by market activity */}
            <g className="pointer-events-none">
              {AMBIENT_PARTICLES.map((p, i) => {
                const scaledDur = (p.dur / particleSpeedMul).toFixed(1);
                // Leadership bias — particles subtly drift toward active chain centroid
                const biasTx = chainCentroid ? ((chainCentroid.x - p.cx) / W) * 14 : 0;
                const biasTy = chainCentroid ? ((chainCentroid.y - p.cy) / H) * 9  : 0;
                const atx = (p.tx + biasTx).toFixed(1);
                const aty = (p.ty + biasTy).toFixed(1);
                return (
                  <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill="#c8ddf8" fillOpacity={0}>
                    <animateTransform
                      attributeName="transform" attributeType="XML" type="translate"
                      values={`0,0; ${atx},${aty}; 0,0`}
                      dur={`${scaledDur}s`} begin={`${p.begin}s`} repeatCount="indefinite"
                      calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1"
                    />
                    <animate attributeName="fill-opacity"
                      values={`0;${particleMax};0`}
                      dur={`${scaledDur}s`} begin={`${p.begin}s`} repeatCount="indefinite"
                      calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1"
                    />
                  </circle>
                );
              })}
            </g>

            {/* Capital flow trails — migrate toward leadership zone when chain active */}
            <g className="pointer-events-none">
              {LIQUIDITY_TRAILS.map((t, i) => {
                const ctrX    = chainCentroid?.x ?? W / 2;
                const span    = chainCentroid ? Math.min(t.w + 90, 260) : (W - PAD_X * 2 - 80);
                const x1s     = Math.max(PAD_X + 20, Math.min(ctrX - span - t.w / 2, W - PAD_X - t.w - 40));
                const x1e     = Math.max(PAD_X + 20, Math.min(ctrX + span / 2, W - PAD_X - t.w - 20));
                const targetY = chainCentroid ? t.y + (chainCentroid.y - t.y) * 0.28 : t.y;
                const tOp     = chainCentroid
                  ? Math.min(t.opacity * (1 + ms.atmosphereIntensity * 0.9), 0.055).toFixed(3)
                  : t.opacity.toFixed(3);
                return (
                  <line key={i} x1={x1s} x2={x1s + t.w} y1={targetY} y2={targetY}
                    stroke="#c8ddf8" strokeWidth="0.7" strokeOpacity="0" fill="none">
                    <animate attributeName="x1" values={`${x1s};${x1e};${x1s}`}
                      dur={`${t.dur}s`} begin={`${t.begin}s`} repeatCount="indefinite"
                      calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
                    <animate attributeName="x2" values={`${x1s + t.w};${x1e + t.w};${x1s + t.w}`}
                      dur={`${t.dur}s`} begin={`${t.begin}s`} repeatCount="indefinite"
                      calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
                    <animate attributeName="stroke-opacity" values={`0;${tOp};0`}
                      dur={`${t.dur}s`} begin={`${t.begin}s`} repeatCount="indefinite"
                      calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
                  </line>
                );
              })}
            </g>

            {/* Directional flow field — regime-dependent capital movement vectors */}
            <g className="pointer-events-none">
              {FLOW_ORIGINS.map((p, i) => {
                const baseX = p.cx - W / 2;
                const baseY = p.cy - H / 2;
                const mag   = Math.sqrt(baseX * baseX + baseY * baseY) || 1;
                const tx    = ((baseX / mag) * flowDir * 46).toFixed(1);
                const ty    = ((baseY / mag) * flowDir * 33).toFixed(1);
                const fh    = idHash(String(i) + "flow");
                const dur   = ((22 + (fh % 10)) / flowSpeed).toFixed(1);
                const beg   = ((fh % 80) / 10).toFixed(1);
                const fOp   = flowOpBase.toFixed(3);
                if (flowDir === 0 && ms.atmosphereIntensity < 0.35) return null;
                return (
                  <circle key={i} cx={p.cx} cy={p.cy} r={1.4} fill="#c8ddf8" fillOpacity="0">
                    <animateTransform attributeName="transform" attributeType="XML" type="translate"
                      values={`0,0; ${tx},${ty}; 0,0`}
                      dur={`${dur}s`} begin={`${beg}s`} repeatCount="indefinite"
                      calcMode="spline" keySplines="0.35 0 0.65 1;0.35 0 0.65 1" keyTimes="0;0.5;1" />
                    <animate attributeName="fill-opacity"
                      values={`0;${fOp};0`}
                      dur={`${dur}s`} begin={`${beg}s`} repeatCount="indefinite"
                      calcMode="spline" keySplines="0.35 0 0.65 1;0.35 0 0.65 1" keyTimes="0;0.5;1" />
                  </circle>
                );
              })}
            </g>

            {/* Lane separators — extend into fog zone so they fade naturally */}
            {rowEntries.map(([row, y]) => {
              const laneOp = row === 0 ? 0.09 : row === 1 ? 0.062 : row === 2 ? 0.050 : row === 3 ? 0.040 : 0.032;
              return (
                <line key={row} x1={0} y1={y} x2={W} y2={y}
                  stroke={`rgba(255,255,255,${laneOp})`} strokeWidth="1" />
              );
            })}

            {/* Row lane labels */}
            {rowEntries.map(([row, y]) => {
              const labelOp = row === 0 ? 0.88 : row === 1 ? 0.78 : row === 2 ? 0.70 : 0.64;
              return (
                <text key={row} x={LABEL_X} y={y + 4} textAnchor="end"
                  fontSize={7.5} fontWeight={700} letterSpacing={2.0}
                  fontFamily="Inter, system-ui, sans-serif"
                  fill={`rgba(255,255,255,${labelOp})`}
                  stroke="#010306" strokeWidth={4} strokeOpacity={0.88}
                  strokeLinejoin="round" paintOrder="stroke"
                  className="pointer-events-none select-none">
                  {ROW_LABELS[row] ?? ""}
                </text>
              );
            })}

            {/* Pressure flow direction — downward indicators between lane labels */}
            {rowEntries.slice(0, -1).map(([row, y1], i) => {
              const nextEntry = rowEntries[i + 1];
              if (!nextEntry) return null;
              const midY = (y1 + nextEntry[1]) / 2;
              const op   = row === 0 ? 0.28 : row === 1 ? 0.20 : row === 2 ? 0.14 : 0.10;
              return (
                <text key={`pf-${row}`} x={LABEL_X} y={midY + 4}
                  textAnchor="end" fontSize={9}
                  fontFamily="Inter, system-ui, sans-serif"
                  fill={`rgba(255,255,255,${op})`}
                  className="pointer-events-none select-none">
                  ↓
                </text>
              );
            })}

            {data.edges.map(renderEdge)}
            {/* Ghost pressure paths — dormant transmission channels */}
            <g className="pointer-events-none">
              {data.edges
                .filter(e => !chainHighlight.edgeIds.has(e.id) && e.confidence > 45)
                .slice(0, 8)
                .map(e => {
                  const fp = positions.get(e.source);
                  const tp = positions.get(e.target);
                  if (!fp || !tp) return null;
                  const gd = edgePath(fp.x, fp.y, tp.x, tp.y, e.id + "g");
                  const gh = idHash(e.id + "g");
                  const dur = 14 + (gh % 10);
                  const beg = (gh % 60) / 10;
                  return (
                    <path key={`ghost-${e.id}`} d={gd}
                      stroke="#c8ddf8" strokeWidth="0.6"
                      strokeDasharray="2 9" fill="none" strokeOpacity="0">
                      <animate attributeName="stroke-opacity"
                        values={`0;${(0.042 * decayMul).toFixed(3)};0`} keyTimes="0;0.5;1"
                        dur={`${dur}s`} begin={`${beg}s`} repeatCount="indefinite"
                        calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
                    </path>
                  );
                })
              }
            </g>
            {data.nodes.map(renderNode)}

            {/* Edge fog — applied over nodes so boundaries dissolve into atmospheric space */}
            <rect width={W} height={H} fill="url(#edgeFog)" className="pointer-events-none" />
            {/* Corner vignette — on top of everything */}
            <rect width={W} height={H} fill="url(#vignette)" className="pointer-events-none" />
          </svg>

          {tooltip && <NodeTooltip t={tooltip} />}

          {/* Bottom atmospheric bleed — softens graph-to-panel hard cut */}
          <div aria-hidden className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent, rgba(5,11,24,0.75))" }} />
        </div>

        {/* Active path / chain tabs */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[7px] font-bold uppercase tracking-[0.16em] shrink-0 mr-2 self-center"
              style={{ color: "rgba(255,255,255,0.42)" }}>
              Signal Chains
            </span>
            {sortedChains.slice(0, 5).map((chain: PropagationChain, idx: number) => {
              const sel   = activeChain === chain.id;
              const isTop = idx === 0;
              return (
                <button key={chain.id}
                  onClick={() => handleChainClick(chain.id, activeChain)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200"
                  style={{
                    background: sel ? "rgba(18,40,88,0.55)"
                      : isTop && !activeChain ? "rgba(255,255,255,0.060)" : "rgba(255,255,255,0.022)",
                    border: `1px solid ${
                      sel ? "rgba(68,120,210,0.65)"
                      : (activeChain && !sel) ? "rgba(255,255,255,0.040)"
                      : "rgba(255,255,255,0.10)"
                    }`,
                    boxShadow: sel ? "0 0 12px rgba(40,80,180,0.22)" : "none",
                    opacity: activeChain && !sel ? 0.55 : 1,
                    transition: "opacity 220ms, border-color 220ms, box-shadow 220ms",
                  }}>
                  <div className="rounded-full shrink-0"
                    style={{
                      width: 6, height: 6,
                      background: sel
                        ? "rgba(100,178,245,0.98)"
                        : (activeChain && !sel) ? "rgba(60,100,160,0.30)"
                        : isTop ? "rgba(80,148,210,0.88)" : "rgba(60,100,160,0.55)",
                      boxShadow: sel ? "0 0 8px rgba(100,178,245,0.60)" : "none",
                    }} />
                  <span style={{
                    fontSize: 10.5, fontWeight: sel ? 500 : (activeChain ? 400 : (isTop ? 500 : 400)),
                    color: sel ? "rgba(255,255,255,0.98)"
                      : (activeChain && !sel) ? "rgba(255,255,255,0.68)"
                      : isTop ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.72)",
                  }}>{trunc(chain.title, 32)}</span>
                  <span className="text-[8.5px] tabular-nums shrink-0 font-medium"
                    style={{ color: sel ? "rgba(160,208,255,0.90)" : "rgba(255,255,255,0.46)" }}>
                    {chain.confidence.toFixed(0)}%
                  </span>
                </button>
              );
            })}
            <span className="ml-auto text-[7.5px] tabular-nums shrink-0 self-center"
              style={{ color: "rgba(255,255,255,0.40)" }}>
              {formatAge(data.generated_at)}
            </span>
          </div>

          {/* Causal transmission sequence */}
          {activeChain && chainHighlight.sequence.length >= 2 && (
            <div className="mt-3 pl-2">
              <p className="text-[7px] font-bold uppercase tracking-[0.16em] mb-2.5"
                style={{ color: "rgba(255,255,255,0.40)" }}>
                Pressure Flow
              </p>
              <div className="flex items-center flex-wrap gap-0">
                {chainHighlight.sequence.map((n, i) => (
                  <span key={n.id} className="flex items-center">
                    <span className="text-[9.5px] font-medium"
                      style={{ color: (NODE_STYLE[n.type] ?? NODE_STYLE.theme).label }}>
                      {trunc(n.label, 20)}
                    </span>
                    {i < chainHighlight.sequence.length - 1 && (
                      <span className="px-1.5" style={{ color: "rgba(255,255,255,0.28)", fontSize: 11 }}>→</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {activeChain && (
            <p className="text-[10px] mt-3 leading-relaxed pl-2"
              style={{ color: "rgba(255,255,255,0.65)" }}>
              {data.chains.find(c => c.id === activeChain)?.summary ?? ""}
            </p>
          )}

          {!hasInteracted && (
            <p className="text-[8px] mt-2.5 pl-2 italic" style={{ color: "rgba(255,255,255,0.32)" }}>
              Click any node to open the intelligence panel · hover to preview connections
            </p>
          )}
        </div>

        {/* Intelligence drawer — cinematic narrative reveal */}
        <AnimatePresence>
          {focusedNode && focusedNodeStyle && (
            <motion.div
              key={focusedNodeId}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 7 }}
              transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              className="relative overflow-hidden"
              style={{ background: "rgba(4,8,18,0.97)" }}
            >
              {/* Atmospheric integration — type-color top separator */}
              <div className="h-px"
                style={{ background: `linear-gradient(to right, transparent, ${focusedNodeStyle.label}50 25%, ${focusedNodeStyle.label}50 75%, transparent)` }} />

              {/* Left type-color accent — stronger presence */}
              <div className="absolute left-0 top-0 bottom-0 w-[2px]"
                style={{ background: focusedNodeStyle.label, opacity: 0.58 }} />

              {/* Ambient field — type-color glow emanates from left */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse 50% 92% at 4% 48%, ${focusedNodeStyle.label}0e 0%, transparent 62%)` }} />

              <div className="px-6 pt-5 pb-5 pl-9">

                {/* ── Identity header — staged entry ─────────────────── */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05, duration: 0.28, ease: "easeOut" }}
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0 flex-1">
                      {/* Type · sentiment · confidence */}
                      <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
                        <span className="text-[7px] font-bold uppercase tracking-[0.18em]"
                          style={{ color: focusedNodeStyle.label }}>
                          {NODE_TYPE_LABEL[focusedNode.type] ?? focusedNode.type}
                        </span>
                        <span className="w-1 h-1 rounded-full shrink-0 self-center"
                          style={{ background: "rgba(255,255,255,0.15)" }} />
                        <span className="text-[7px] capitalize"
                          style={{ color: SENTIMENT_STROKE[focusedNode.sentiment] ?? "#507888" }}>
                          {focusedNode.sentiment}
                        </span>
                        <span className="ml-auto text-[7px] tabular-nums shrink-0"
                          style={{ color: "rgba(255,255,255,0.34)" }}>
                          {focusedNode.confidence.toFixed(0)}% conf
                          {focusedNode.source_count > 0 && ` · ${focusedNode.source_count} signals`}
                        </span>
                      </div>
                      {/* Large luminous node label */}
                      <p className="text-[20px] font-semibold leading-tight tracking-tight"
                        style={{ color: focusedNodeStyle.label }}>
                        {focusedNode.label}
                      </p>
                    </div>
                    <button
                      onClick={() => setFocusedNodeId(null)}
                      className="shrink-0 p-1.5 rounded-md hover:bg-white/[0.06] transition-colors mt-0.5"
                      style={{ color: "rgba(255,255,255,0.36)" }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </motion.div>

                {/* ── Narrative body — staggered cascade reveal ─────── */}
                <motion.div
                  className="space-y-5"
                  initial="hidden"
                  animate="visible"
                  variants={{ visible: { transition: { staggerChildren: 0.07, delayChildren: 0.14 } } }}
                >

                  {/* Intelligence summary */}
                  <motion.div variants={SECTION_REVEAL}>
                    <div className="h-px mb-4"
                      style={{ background: `linear-gradient(to right, ${focusedNodeStyle.label}30 0%, rgba(255,255,255,0.04) 45%, transparent)` }} />
                    <p className="text-[7px] font-bold uppercase tracking-[0.22em] mb-2"
                      style={{ color: focusedNodeStyle.label, opacity: 0.65 }}>
                      Market Context
                    </p>
                    <p className="text-[12.5px] leading-relaxed"
                      style={{ color: "rgba(255,255,255,0.76)" }}>
                      {focusedNode.description}
                    </p>
                  </motion.div>

                  {/* Transmission position — visual causal flow */}
                  {activeChain && chainHighlight.nodeIds.has(focusedNode.id) && (() => {
                    const chain    = data.chains.find(c => c.id === activeChain);
                    if (!chain) return null;
                    const chainPos = chain.nodes.indexOf(focusedNode.id);
                    const total    = chain.nodes.length;
                    const sequence = chainHighlight.sequence;
                    return (
                      <motion.div key="tx-pos" variants={SECTION_REVEAL}>
                        <p className="text-[7px] font-bold uppercase tracking-[0.22em] mb-2.5"
                          style={{ color: "rgba(255,255,255,0.38)" }}>
                          Pressure Position
                          <span className="ml-1.5 font-normal normal-case tracking-normal"
                            style={{ color: "rgba(255,255,255,0.26)" }}>
                            step {chainPos + 1} of {total}
                          </span>
                        </p>
                        {/* Visual causal flow — highlighted current node, faded past/future */}
                        <div className="flex items-center flex-wrap gap-0 overflow-x-auto scrollbar-hide pb-0.5">
                          {sequence.map((seqNode, i) => {
                            const isThis = seqNode.id === focusedNode.id;
                            const ns     = NODE_STYLE[seqNode.type] ?? NODE_STYLE.theme;
                            const isPast = i < chainPos;
                            return (
                              <span key={seqNode.id} className="flex items-center shrink-0">
                                <span
                                  className="px-1.5 py-0.5 rounded transition-all"
                                  style={{
                                    fontSize:   isThis ? "9.5px" : "8.5px",
                                    fontWeight: isThis ? 700 : isPast ? 500 : 400,
                                    color:      isThis ? focusedNodeStyle.label
                                      : isPast ? `${ns.label}95` : `${ns.label}58`,
                                    background: isThis ? `${focusedNodeStyle.label}18` : "transparent",
                                    border:     isThis ? `1px solid ${focusedNodeStyle.label}38` : "1px solid transparent",
                                  }}>
                                  {trunc(seqNode.label, isThis ? 22 : 14)}
                                </span>
                                {i < sequence.length - 1 && (
                                  <span className="px-0.5 shrink-0"
                                    style={{
                                      color:   isPast ? `${focusedNodeStyle.label}88` : "rgba(255,255,255,0.20)",
                                      fontSize: "10px",
                                    }}>
                                    →
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </motion.div>
                    );
                  })()}

                  {/* Connected signals */}
                  {focusedConnections.length > 0 && (
                    <motion.div variants={SECTION_REVEAL}>
                      <p className="text-[7px] font-bold uppercase tracking-[0.22em] mb-2.5"
                        style={{ color: "rgba(255,255,255,0.38)" }}>
                        Connected Signals
                        <span className="ml-1.5 font-normal normal-case tracking-normal text-[7px]"
                          style={{ color: "rgba(255,255,255,0.26)" }}>
                          {focusedConnections.length}
                        </span>
                      </p>
                      <div>
                        {focusedConnections.slice(0, 7).map((c, idx) => {
                          const cs     = NODE_STYLE[c.node.type] ?? NODE_STYLE.theme;
                          const isLast = idx === Math.min(focusedConnections.length, 7) - 1;
                          return (
                            <div key={c.node.id}
                              className="flex items-center gap-2.5 py-1.5"
                              style={!isLast ? { borderBottom: "1px solid rgba(255,255,255,0.045)" } : {}}
                              title={c.desc}>
                              <span className="text-[8.5px] shrink-0 w-3 text-center font-bold"
                                style={{ color: c.isSource ? focusedNodeStyle.label : "rgba(255,255,255,0.28)" }}>
                                {c.isSource ? "→" : "←"}
                              </span>
                              <span className="text-[7.5px] shrink-0 capitalize"
                                style={{ color: "rgba(255,255,255,0.32)", minWidth: "52px" }}>
                                {c.rel.replace(/_/g, " ")}
                              </span>
                              <span className="text-[10px] font-medium truncate"
                                style={{ color: cs.label }}>
                                {c.node.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {/* Narrative paths */}
                  {focusedInChains.length > 0 && (
                    <motion.div variants={SECTION_REVEAL}>
                      <p className="text-[7px] font-bold uppercase tracking-[0.22em] mb-2.5"
                        style={{ color: "rgba(255,255,255,0.38)" }}>
                        Signal {focusedInChains.length === 1 ? "Chain" : `Chains (${focusedInChains.length})`}
                      </p>
                      <div className="space-y-1.5">
                        {focusedInChains.map((c) => (
                          <button key={c.id}
                            onClick={() => handleChainClick(c.id, activeChain)}
                            className="w-full flex items-center gap-2.5 py-2 px-2.5 rounded-lg
                                       text-left transition-all duration-200"
                            style={{
                              background: activeChain === c.id
                                ? `${focusedNodeStyle.label}10` : "rgba(255,255,255,0.022)",
                              border: `1px solid ${activeChain === c.id
                                ? `${focusedNodeStyle.label}32` : "rgba(255,255,255,0.055)"}`,
                            }}>
                            <div className="rounded-full shrink-0"
                              style={{
                                width: 5, height: 5,
                                background: activeChain === c.id
                                  ? focusedNodeStyle.label : "rgba(255,255,255,0.20)",
                                boxShadow: activeChain === c.id
                                  ? `0 0 7px ${focusedNodeStyle.label}55` : "none",
                              }} />
                            <span className="text-[9.5px] font-medium flex-1 truncate"
                              style={{
                                color: activeChain === c.id
                                  ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.52)",
                              }}>
                              {trunc(c.title, 42)}
                            </span>
                            <span className="text-[7.5px] tabular-nums shrink-0"
                              style={{ color: "rgba(255,255,255,0.28)" }}>
                              {c.confidence.toFixed(0)}%
                            </span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Legend */}
        {presentRelationships.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-6 py-2.5"
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            {presentRelationships.map((rel) => (
              <div key={rel} className="flex items-center gap-2">
                <svg width="20" height="4" viewBox="0 0 20 4" aria-hidden>
                  <line x1="0" y1="2" x2="20" y2="2"
                    stroke={EDGE_STROKE_ACTIVE[rel] ?? "#4a6888"} strokeWidth="2.5" strokeOpacity="0.72" />
                </svg>
                <span className="text-[8px] capitalize" style={{ color: "rgba(255,255,255,0.58)" }}>
                  {rel.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
