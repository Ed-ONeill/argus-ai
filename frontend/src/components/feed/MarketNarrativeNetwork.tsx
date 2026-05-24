"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X } from "lucide-react";
import { useNarrativeNetwork } from "@/hooks/useNarrativeNetwork";
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
  0: "REGIME", 1: "MACRO", 2: "THEMES", 3: "SECTORS", 4: "ASSETS",
};

// ── Spatial depth — fill opacity by layer (regime nearest, assets furthest) ───

const LAYER_FILL_OPACITY: Record<string, number> = {
  regime: 1.00, macro: 0.97, theme: 0.93, sector: 0.89, asset: 0.85,
};

// ── Ambient particle definitions (deterministic positions, no JS state) ────────

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
      const jitterY = (node.type === "sector" || node.type === "asset")
        ? (idHash(node.id) % 13) - 6 : 0;
      const drift = ROW_DRIFT_X[rowKey] ?? 0;
      const rawX  = PAD_X + (usableW / (ordered.length + 1)) * (col + 1) + drift;
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

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dy = y2 - y1;
  const dx = x2 - x1;
  if (Math.abs(dy) < 24) {
    // Near-horizontal — pronounced arc so it reads as a traversal, not a flat line
    const h = Math.min(Math.abs(dx) * 0.40, 88);
    return `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${y1 - h} ${x2} ${y2}`;
  }
  // Cross-layer — deeper S-curve control points for systemic travel feel
  const tension = 0.52 + Math.min(Math.abs(dx) / W, 0.12);
  return `M ${x1} ${y1} C ${x1} ${y1 + dy * tension} ${x2} ${y2 - dy * tension} ${x2} ${y2}`;
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

// ── Market pulse ──────────────────────────────────────────────────────────────

interface PulseSignal { label: string; value: string; color: string; dot: string }

function computeMarketPulse(
  dominant: string,
  chains: PropagationChain[],
  nodes: GraphNode[],
): PulseSignal[] {
  const r = dominant.toLowerCase();
  const out: PulseSignal[] = [];

  // 1. Risk appetite from regime label
  const isOn  = r.includes("risk-on") || r.includes("expansion") || r.includes("dovish") || r.includes("easing");
  const isOff = r.includes("risk-off") || r.includes("tighten")  || r.includes("stagflat") || r.includes("shock") || r.includes("hawkish");
  out.push({
    label: "Risk Appetite",
    value: isOn ? "Rising" : isOff ? "Falling" : "Neutral",
    color: isOn ? "#52b0c8" : isOff ? "#c05858" : "#8898b8",
    dot:   isOn ? "#2a7890" : isOff ? "#883838" : "#506880",
  });

  // 2. Liquidity conditions from regime
  const isTight = r.includes("tighten") || r.includes("hawkish") || r.includes("qt") || r.includes("hike");
  const isLoose = r.includes("easing")  || r.includes("dovish")  || r.includes("qe") || r.includes("expand");
  out.push({
    label: "Liquidity",
    value: isTight ? "Tightening" : isLoose ? "Expanding" : "Stable",
    color: isTight ? "#c05858" : isLoose ? "#52b0c8" : "#8898b8",
    dot:   isTight ? "#883838" : isLoose ? "#2a7890" : "#506880",
  });

  // 3. Signal conviction from highest-confidence chain
  const topChain = [...chains].sort((a, b) => b.confidence - a.confidence)[0];
  if (topChain) {
    const c = topChain.confidence;
    out.push({
      label: "Conviction",
      value: c >= 78 ? "High" : c >= 58 ? "Elevated" : "Moderate",
      color: c >= 78 ? "#c8a040" : c >= 58 ? "#a07820" : "#8898b8",
      dot:   c >= 78 ? "#a07820" : c >= 58 ? "#806010" : "#506880",
    });
  }

  // 4. Sector sentiment balance
  const active = nodes.filter(n => n.type === "sector" || n.type === "theme");
  const bull   = active.filter(n => n.sentiment === "bullish").length;
  const bear   = active.filter(n => n.sentiment === "bearish").length;
  const tot    = active.length || 1;
  const isBid  = bull > tot * 0.55;
  const isDef  = bear > tot * 0.50;
  out.push({
    label: "Flow",
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

  const [hoveredId, setHoveredId]         = useState<string | null>(null);
  const [tooltip, setTooltip]             = useState<TooltipState | null>(null);
  const [activeChain, setActiveChain]     = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  const wrapRef         = useRef<HTMLDivElement>(null);
  const initialChainRef = useRef(false);
  const chains          = data?.chains;

  useEffect(() => {
    if (initialChainRef.current || !chains?.length) return;
    initialChainRef.current = true;
    const top = [...chains].sort((a, b) => b.confidence - a.confidence)[0];
    setActiveChain(top.id);
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
    const opacity      = isDim ? 0.02 : isChainEdge ? 1.0 : isHigh ? 0.85 : base;
    const sw           = Math.max(1.0, edge.weight * 3.0);
    const d            = edgePath(sx, sy, ex, ey);
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
          style={{ transition: "stroke-opacity 200ms ease-out, stroke-width 200ms ease-out" }} />
        {/* Propagation particle with glow */}
        {isChainEdge && (
          <circle r={3.8} fill={activeStroke} filter="url(#particleGlow)">
            <animateMotion path={d} dur="2.6s" begin={pDelay} repeatCount="indefinite"
              calcMode="spline" keyPoints="0;1" keyTimes="0;1"
              keySplines="0.25 0 0.75 1" />
            <animate attributeName="fill-opacity"
              values="0;0.92;0.92;0" keyTimes="0;0.08;0.88;1"
              dur="2.6s" begin={pDelay} repeatCount="indefinite"
              calcMode="spline" keySplines="0.3 0 0.7 1;0.1 0 0.5 1;0.3 0 0.7 1" />
          </circle>
        )}
        {/* Ghost wake trail — softer second particle, transmission memory */}
        {isChainEdge && (
          <circle r={2.4} fill={activeStroke} filter="url(#particleGlow)">
            <animateMotion path={d} dur="2.6s"
              begin={`${(chainHighlight.edgeOrder.get(edge.id) ?? 0) * 0.65 + 0.36}s`}
              repeatCount="indefinite"
              calcMode="spline" keyPoints="0;1" keyTimes="0;1"
              keySplines="0.25 0 0.75 1" />
            <animate attributeName="fill-opacity"
              values="0;0.35;0.35;0" keyTimes="0;0.08;0.88;1"
              dur="2.6s"
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
        <g>
          {isRegime && (
            <animateTransform attributeName="transform" attributeType="XML" type="scale"
              values="1;1.022;1" dur="6s" repeatCount="indefinite"
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
              strokeWidth="0.8" strokeOpacity="0.28" filter="url(#activeGlow)" />
          )}
          {isActive && !isRegime && (
            <circle r={r + 5} fill="none" stroke={base.label}
              strokeWidth="2.4" strokeOpacity="0.90" filter="url(#activeGlow)" />
          )}
          {isActive && !isRegime && (
            <circle r={r + 1} fill={base.label} fillOpacity="0.12" filter="url(#activeGlow)" />
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
              {trunc(node.label, labelMax)}
            </text>
          )}
        </g>
      </g>
    );
  }

  return (
    <section style={{ background: "#050b18" }}>
      <div className="max-w-7xl mx-auto overflow-hidden">

        {/* Top info bar */}
        <div className="flex items-center gap-8 px-6 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          {/* Dominant regime — lead element */}
          <div className="shrink-0">
            <p className="text-[7px] font-bold uppercase tracking-[0.18em] mb-1.5"
              style={{ color: "rgba(255,255,255,0.40)" }}>
              Dominant Regime
            </p>
            <p className="text-[16px] font-semibold leading-none tracking-tight"
              style={{ color: regimeColor(data.dominant_regime) }}>
              {data.dominant_regime}
            </p>
          </div>

          {/* Vertical rule */}
          <div className="w-px self-stretch" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* Sub-labels */}
          <p className="text-[8px] leading-relaxed flex-1" style={{ color: "rgba(255,255,255,0.30)" }}>
            Transmission map · {data.nodes.length} nodes · {data.edges.length} edges
          </p>

          {/* Right actions */}
          <div className="flex items-center gap-3 shrink-0">
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

        {/* Market pulse strip */}
        {(() => {
          const pulses = computeMarketPulse(data.dominant_regime, data.chains, data.nodes);
          return (
            <div className="flex items-center gap-5 px-6 py-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span className="text-[7px] font-bold uppercase tracking-[0.16em] shrink-0"
                style={{ color: "rgba(255,255,255,0.42)" }}>
                Market Pulse
              </span>
              <div className="w-px self-stretch" style={{ background: "rgba(255,255,255,0.05)" }} />
              <div className="flex items-center gap-6 flex-wrap">
                {pulses.map(p => (
                  <div key={p.label} className="flex items-center gap-2">
                    <div className="rounded-full shrink-0"
                      style={{ width: 6, height: 6, background: p.dot, boxShadow: `0 0 6px ${p.dot}` }} />
                    <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.46)" }}>{p.label}</span>
                    <span className="text-[10px] font-semibold" style={{ color: p.color }}>
                      {p.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

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

              {/* Atmospheric background — slow breathing */}
              <radialGradient id="bgAtmo" cx="50%" cy="10%" r="72%">
                <stop offset="0%" stopColor="#0e2244">
                  <animate attributeName="stop-opacity" values="0.90;1.0;0.90"
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

              {/* Regime environmental glow — tracks regime node, breathes */}
              <radialGradient id="regEnvGrad" cx={regCx} cy={regCy} r="48%"
                gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="#2868b8">
                  <animate attributeName="stop-opacity" values="0.32;0.56;0.32"
                    dur="8s" repeatCount="indefinite"
                    calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
                </stop>
                <stop offset="55%" stopColor="#104080" stopOpacity="0.10" />
                <stop offset="100%" stopColor="#030608" stopOpacity="0" />
              </radialGradient>

              {/* Thermal cold field — inverted spotlight, darkens inactive zones */}
              <radialGradient id="coldField" cx={spotCx} cy={spotCy} r="70%"
                gradientUnits="objectBoundingBox">
                <stop offset="0%"   stopColor="#020510" stopOpacity="0" />
                <stop offset="100%" stopColor="#020510"
                  stopOpacity={chainCentroid ? 0.20 : 0} />
              </radialGradient>

              {/* Chain spotlight — illuminates active narrative centroid */}
              <radialGradient id="chainSpot" cx={spotCx} cy={spotCy} r="28%"
                gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="#304878"
                  stopOpacity={chainCentroid ? 0.34 : 0} />
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
            <rect width={W} height={H} fill="url(#regEnvGrad)" />
            <rect width={W} height={H} fill="url(#regThermal)" className="pointer-events-none" />
            <rect width={W} height={H} fill="url(#coldField)"  className="pointer-events-none" />
            <rect width={W} height={H} fill="url(#chainSpot)"  className="pointer-events-none" />
            <rect width={W} height={H} fill="url(#focusEnvGrad)" className="pointer-events-none" />

            {/* Ambient drifting particles — slow, atmospheric */}
            <g className="pointer-events-none">
              {AMBIENT_PARTICLES.map((p, i) => (
                <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill="#c8ddf8" fillOpacity={0}>
                  <animateTransform
                    attributeName="transform" attributeType="XML" type="translate"
                    values={`0,0; ${p.tx},${p.ty}; 0,0`}
                    dur={`${p.dur}s`} begin={`${p.begin}s`} repeatCount="indefinite"
                    calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1"
                  />
                  <animate attributeName="fill-opacity"
                    values="0;0.085;0"
                    dur={`${p.dur}s`} begin={`${p.begin}s`} repeatCount="indefinite"
                    calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1"
                  />
                </circle>
              ))}
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

            {data.edges.map(renderEdge)}
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
              Narrative Paths
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
                Transmission Path
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
                          {focusedNode.type}
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
                      Intelligence Summary
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
                          Transmission Position
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
                        Narrative {focusedInChains.length === 1 ? "Path" : `Paths (${focusedInChains.length})`}
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
