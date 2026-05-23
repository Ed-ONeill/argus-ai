"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Network, RefreshCw, X } from "lucide-react";
import { useNarrativeNetwork } from "@/hooks/useNarrativeNetwork";
import type { GraphNode, GraphEdge, PropagationChain } from "@/lib/types";

// ── Canvas constants ───────────────────────────────────────────────────────────
// W/H define the SVG coordinate space. PAD_X is generous atmospheric dead-space
// on each side — edge fog fills it so nodes feel like part of a larger unseen system.

const W       = 1120;
const H       = 492;
const PAD_X   = 68;
const PAD_Y   = 64;
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
  { cx:  52, cy: 204, r: 0.8, dur: 29, tx:  18, ty:  24, begin: 9.2 },
  { cx: 112, cy:  92, r: 0.9, dur: 24, tx:  28, ty:  18, begin: 0.0 },
  { cx: 298, cy: 155, r: 1.0, dur: 21, tx: -22, ty:  32, begin: 3.2 },
  { cx: 490, cy:  68, r: 0.8, dur: 27, tx:  35, ty: -18, begin: 6.5 },
  { cx: 668, cy: 210, r: 1.1, dur: 19, tx: -28, ty:  24, begin: 1.8 },
  { cx: 865, cy: 115, r: 0.9, dur: 25, tx:  30, ty:  28, begin: 4.9 },
  { cx: 1042, cy: 265, r: 1.0, dur: 22, tx: -18, ty: -26, begin: 0.7 },
  { cx: 175, cy: 320, r: 0.8, dur: 28, tx:  22, ty:  35, begin: 7.8 },
  { cx: 415, cy: 390, r: 1.1, dur: 18, tx: -32, ty:  18, begin: 3.6 },
  { cx: 598, cy: 302, r: 0.9, dur: 23, tx:  26, ty: -22, begin: 5.3 },
  { cx: 790, cy: 408, r: 1.0, dur: 20, tx: -24, ty:  28, begin: 2.1 },
  { cx: 1082, cy: 348, r: 0.9, dur: 26, tx:  20, ty: -30, begin: 5.8 },
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
  if (n.type === "regime") return 44;
  if (n.type === "macro")  return 18;
  if (n.type === "theme")  return Math.min(10 + (n.confidence / 100) * 14, 22);
  return Math.min(10 + (n.confidence / 100) * 18, 26);
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
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-3">
        <Network size={11} className="shrink-0" style={{ color: "rgba(255,255,255,0.32)" }} />
        <span className="text-[10px] font-medium tracking-[0.05em]"
          style={{ color: "rgba(255,255,255,0.40)" }}>
          Market Narrative Network
        </span>
        <span className="h-px flex-1"
          style={{ background: "linear-gradient(to right, rgba(255,255,255,0.06), transparent)" }} />
      </div>
      <div className="rounded-xl animate-pulse"
        style={{ background: "#070d1a", border: "1px solid rgba(255,255,255,0.06)", height: 520 }} />
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
    const pDelay       = `${(chainHighlight.edgeOrder.get(edge.id) ?? 0) * 0.55}s`;

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
          style={{ transition: "stroke-opacity 180ms" }} />
        {/* Propagation particle with glow */}
        {isChainEdge && (
          <circle r={3.4} fill={activeStroke} filter="url(#particleGlow)">
            <animateMotion path={d} dur="2.2s" begin={pDelay} repeatCount="indefinite" />
            <animate attributeName="fill-opacity"
              values="0;0.95;0.95;0" keyTimes="0;0.08;0.88;1"
              dur="2.2s" begin={pDelay} repeatCount="indefinite" />
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
        style={{ opacity: isDim ? 0.010 : 1, transition: "opacity 180ms" }}
        onMouseEnter={e => handleNodeEnter(node, e)}
        onMouseLeave={handleNodeLeave}
        onClick={() => handleNodeClick(node)}>
        <g>
          {isRegime && (
            <animateTransform attributeName="transform" attributeType="XML" type="scale"
              values="1;1.022;1" dur="6s" repeatCount="indefinite"
              calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
          )}

          {/* Regime: dual pulse rings at different timings */}
          {isRegime && (
            <circle r={r + 5} fill="none" stroke={rc} strokeWidth="1.2" strokeOpacity="0">
              <animate attributeName="r" values={`${r + 4};${r + 36};${r + 4}`}
                dur="4.8s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.35;0;0.35"
                dur="4.8s" repeatCount="indefinite" />
            </circle>
          )}
          {isRegime && (
            <circle r={r + 5} fill="none" stroke={rc} strokeWidth="1.5" strokeOpacity="0">
              <animate attributeName="r" values={`${r + 4};${r + 18};${r + 4}`}
                dur="3.2s" begin="1.6s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.55;0;0.55"
                dur="3.2s" begin="1.6s" repeatCount="indefinite" />
            </circle>
          )}
          {/* Regime: blur glow halo */}
          {isRegime && (
            <circle r={r + 2} fill="none" stroke={rc}
              strokeWidth="8" strokeOpacity="0.16" filter="url(#regGlow)" />
          )}

          {/* Active chain node rings */}
          {isActive && !isRegime && (
            <circle r={r + 9} fill="none" stroke={base.label}
              strokeWidth="1" strokeOpacity="0.22" filter="url(#activeGlow)" />
          )}
          {isActive && !isRegime && (
            <circle r={r + 5} fill="none" stroke={base.label}
              strokeWidth="2.0" strokeOpacity="0.82" filter="url(#activeGlow)" />
          )}
          {isActive && !isRegime && (
            <circle r={r + 1} fill={base.label} fillOpacity="0.07" filter="url(#activeGlow)" />
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
            style={{ transition: "stroke-width 140ms, stroke-opacity 140ms" }} />

          {r < 18 && <circle r={2.5} fill={stroke} fillOpacity={0.72} />}

          {showLabel && (
            <text y={r + (isRegime ? 18 : 14)} textAnchor="middle"
              fontSize={isRegime ? 12 : isFocus ? 11 : isTheme ? 9.5 : 10}
              fontWeight={isRegime ? 700 : isFocus || isActive ? 600 : 400}
              fontFamily="Inter, system-ui, sans-serif"
              fill={base.label}
              stroke="#020508"
              strokeWidth={isRegime ? 7 : 5}
              strokeOpacity={0.85}
              strokeLinejoin="round"
              paintOrder="stroke"
              fillOpacity={isHov || isFocus ? 1.0 : isActive ? 0.98 : isRegime ? 0.95 : 0.86}
              filter={isActive || isHov || isFocus ? "url(#textGlow)" : undefined}
              className="pointer-events-none select-none"
              style={{ transition: "fill-opacity 140ms" }}>
              {trunc(node.label, labelMax)}
            </text>
          )}
        </g>
      </g>
    );
  }

  return (
    <section className="mb-10">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-3">
        <Network size={11} className="shrink-0" style={{ color: "rgba(255,255,255,0.32)" }} />
        <span className="text-[10px] font-medium tracking-[0.05em]"
          style={{ color: "rgba(255,255,255,0.40)" }}>
          Market Narrative Network
        </span>
        <span className="h-px flex-1"
          style={{ background: "linear-gradient(to right, rgba(255,255,255,0.06), transparent)" }} />
        {isFetching && <RefreshCw size={9} className="animate-spin" style={{ color: "rgba(255,255,255,0.28)" }} />}
        <span className="text-[9px] tabular-nums" style={{ color: "rgba(255,255,255,0.22)" }}>
          {data.nodes.length}n · {data.edges.length}e
        </span>
      </div>

      <div className="rounded-xl border overflow-hidden"
        style={{ background: "#050b18", borderColor: "rgba(255,255,255,0.065)" }}>

        {/* Top info bar */}
        <div className="flex items-center justify-between px-6 py-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <p className="text-[8.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.50)" }}>
            Live map of how today&apos;s dominant market regime is transmitting through macro drivers, themes, and sectors.
          </p>
          <div className="flex items-center gap-5 shrink-0 ml-8">
            <div className="text-right">
              <p className="text-[7px] font-medium uppercase tracking-[0.12em] mb-0.5"
                style={{ color: "rgba(255,255,255,0.45)" }}>
                Dominant Regime
              </p>
              <p className="text-[12px] font-medium leading-tight"
                style={{ color: regimeColor(data.dominant_regime) }}>
                {data.dominant_regime}
              </p>
            </div>
            {anyFocusOrChain && (
              <button onClick={handleReset}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
                           text-[8.5px] text-white/55 hover:text-white/80 transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.14)" }}>
                <X size={9} strokeWidth={2.5} /><span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Market pulse strip */}
        {(() => {
          const pulses = computeMarketPulse(data.dominant_regime, data.chains, data.nodes);
          return (
            <div className="flex items-center gap-4 px-6 py-2.5"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.035)" }}>
              <span className="text-[7px] font-medium uppercase tracking-[0.14em] shrink-0"
              style={{ color: "rgba(255,255,255,0.38)" }}>
                Market Pulse
              </span>
              <div className="flex items-center gap-4 flex-wrap">
                {pulses.map(p => (
                  <div key={p.label} className="flex items-center gap-1.5">
                    <div className="rounded-full shrink-0"
                      style={{ width: 4, height: 4, background: p.dot, opacity: 0.70 }} />
                    <span className="text-[7px]" style={{ color: "rgba(255,255,255,0.38)" }}>{p.label}</span>
                    <span className="text-[7.5px] font-medium" style={{ color: p.color }}>
                      {p.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Graph canvas */}
        <div ref={wrapRef} className="relative" style={{ minHeight: 455 }}>

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

              {/* Regime node gradient — richer, deeper */}
              <radialGradient id="regGrad" cx="50%" cy="42%" r="50%">
                <stop offset="0%"   stopColor="#1e4478" stopOpacity="0.98" />
                <stop offset="58%"  stopColor="#0e2448" stopOpacity="0.99" />
                <stop offset="100%" stopColor="#060e20" stopOpacity="1"    />
              </radialGradient>

              {/* Atmospheric background — slow breathing */}
              <radialGradient id="bgAtmo" cx="50%" cy="10%" r="72%">
                <stop offset="0%" stopColor="#0d2040">
                  <animate attributeName="stop-opacity" values="0.82;0.98;0.82"
                    dur="9s" repeatCount="indefinite"
                    calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
                </stop>
                <stop offset="55%" stopColor="#060f22" stopOpacity="0.40" />
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

              {/* Regime environmental glow — tracks regime node */}
              <radialGradient id="regEnvGrad" cx={regCx} cy={regCy} r="44%"
                gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="#2060a0">
                  <animate attributeName="stop-opacity" values="0.25;0.46;0.25"
                    dur="8s" repeatCount="indefinite"
                    calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
                </stop>
                <stop offset="70%" stopColor="#104078" stopOpacity="0.06" />
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
              <filter id="regGlow" x="-70%" y="-70%" width="240%" height="240%">
                <feGaussianBlur stdDeviation="11" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="activeGlow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="7" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="nodeActiveGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="hoverGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="edgeGlow" x="-20%" y="-100%" width="140%" height="300%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
              <filter id="edgeAura" x="-40%" y="-200%" width="180%" height="500%">
                <feGaussianBlur stdDeviation="12" />
              </filter>
              {/* Active/hovered label glow — subtle luminance bloom */}
              <filter id="textGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="1.6" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              {/* Propagation particle glow */}
              <filter id="particleGlow" x="-150%" y="-150%" width="400%" height="400%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Atmospheric layers — back to front */}
            <rect width={W} height={H} fill="url(#bgAtmo)" />
            <rect width={W} height={H} fill="url(#gridPat)" className="pointer-events-none" />
            <rect width={W} height={H} fill="url(#ambLight2)" className="pointer-events-none" />
            <rect width={W} height={H} fill="url(#regEnvGrad)" />
            <rect width={W} height={H} fill="url(#regThermal)" className="pointer-events-none" />
            <rect width={W} height={H} fill="url(#coldField)"  className="pointer-events-none" />
            <rect width={W} height={H} fill="url(#chainSpot)"  className="pointer-events-none" />

            {/* Ambient drifting particles — very slow, barely visible */}
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
                    values="0;0.045;0"
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

            {/* Row lane labels — readable but subordinate */}
            {rowEntries.map(([row, y]) => {
              const labelOp = row === 0 ? 0.60 : row === 1 ? 0.50 : row === 2 ? 0.44 : 0.40;
              return (
                <text key={row} x={LABEL_X} y={y + 4} textAnchor="end"
                  fontSize={6.5} fontWeight={700} letterSpacing={1.8}
                  fontFamily="Inter, system-ui, sans-serif"
                  fill={`rgba(255,255,255,${labelOp})`}
                  stroke="#020508" strokeWidth={3} strokeOpacity={0.72}
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
        <div className="px-6 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[7px] font-medium uppercase tracking-[0.14em] shrink-0 mr-1 self-center"
              style={{ color: "rgba(255,255,255,0.38)" }}>
              Active Path
            </span>
            {sortedChains.slice(0, 5).map((chain: PropagationChain, idx: number) => {
              const sel   = activeChain === chain.id;
              const isTop = idx === 0;
              return (
                <button key={chain.id}
                  onClick={() => handleChainClick(chain.id, activeChain)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all duration-150"
                  style={{
                    background: sel ? "rgba(18,36,78,0.30)"
                      : isTop && !activeChain ? "rgba(255,255,255,0.040)" : "rgba(255,255,255,0.014)",
                    border: `1px solid ${
                      sel ? "rgba(60,110,200,0.40)"
                      : (activeChain && !sel) ? "rgba(255,255,255,0.040)"
                      : "rgba(255,255,255,0.07)"
                    }`,
                    opacity: activeChain && !sel ? 0.56 : 1,
                    transition: "opacity 200ms, border-color 200ms",
                  }}>
                  <div className="rounded-full shrink-0"
                    style={{
                      width: 6, height: 6,
                      background: sel
                        ? "rgba(90,168,235,0.96)"
                        : (activeChain && !sel) ? "rgba(60,100,160,0.28)"
                        : isTop ? "rgba(74,138,200,0.68)" : "rgba(60,100,160,0.42)",
                    }} />
                  <span style={{
                    fontSize: 10, fontWeight: sel ? 500 : (activeChain ? 400 : (isTop ? 500 : 400)),
                    color: sel ? "rgba(255,255,255,0.97)"
                      : (activeChain && !sel) ? "rgba(255,255,255,0.68)"
                      : isTop ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.64)",
                  }}>{trunc(chain.title, 32)}</span>
                  <span className="text-[8px] tabular-nums shrink-0"
                    style={{ color: sel ? "rgba(160,200,255,0.82)" : "rgba(255,255,255,0.46)" }}>
                    {chain.confidence.toFixed(0)}%
                  </span>
                </button>
              );
            })}
            <span className="ml-auto text-[7.5px] tabular-nums shrink-0 self-center"
              style={{ color: "rgba(255,255,255,0.54)" }}>
              {formatAge(data.generated_at)}
            </span>
          </div>

          {/* Causal transmission sequence */}
          {activeChain && chainHighlight.sequence.length >= 2 && (
            <div className="mt-2 pl-14">
              <p className="text-[6.5px] font-medium uppercase tracking-[0.14em] mb-1.5"
                style={{ color: "rgba(255,255,255,0.40)" }}>
                Transmission Path
              </p>
              <div className="flex items-center flex-wrap gap-0">
                {chainHighlight.sequence.map((n, i) => (
                  <span key={n.id} className="flex items-center">
                    <span className="text-[8.5px] font-medium"
                      style={{ color: (NODE_STYLE[n.type] ?? NODE_STYLE.theme).label }}>
                      {trunc(n.label, 20)}
                    </span>
                    {i < chainHighlight.sequence.length - 1 && (
                      <span className="text-[10px] px-1" style={{ color: "rgba(255,255,255,0.44)" }}>→</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {activeChain && (
            <p className="text-[8.5px] mt-2 leading-relaxed pl-14"
              style={{ color: "rgba(255,255,255,0.66)" }}>
              {data.chains.find(c => c.id === activeChain)?.summary ?? ""}
            </p>
          )}

          {!hasInteracted && (
            <p className="text-[7.5px] mt-2 pl-14 italic" style={{ color: "rgba(255,255,255,0.48)" }}>
              Click any node to open the intelligence panel · hover to preview connections
            </p>
          )}
        </div>

        {/* Intelligence drawer — animated reveal via framer-motion */}
        <AnimatePresence>
          {focusedNode && focusedNodeStyle && (
            <motion.div
              key={focusedNodeId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.30, ease: [0.25, 0, 0.25, 1] }}
              className="relative"
              style={{ background: "rgba(7,11,20,0.90)" }}>
              {/* Gradient top separator — atmospheric instead of hard ruled line */}
              <div className="h-px"
                style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.075) 20%, rgba(255,255,255,0.075) 80%, transparent)" }} />
              {/* Type-color left accent bar */}
              <div className="absolute left-0 top-0 bottom-0 w-[2px]"
                style={{ background: focusedNodeStyle.label, opacity: 0.32 }} />

              <div className="px-6 py-4 pl-8">
                <div className="flex items-start justify-between gap-5">
                  <div className="min-w-0 flex-1 space-y-3">

                    {/* Identity header */}
                    <div>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-[7px] font-medium uppercase tracking-[0.12em]"
                          style={{ color: focusedNodeStyle.label }}>
                          {focusedNode.type}
                        </span>
                        <span className="text-[7px] capitalize"
                          style={{ color: SENTIMENT_STROKE[focusedNode.sentiment] ?? "#507888", opacity: 0.80 }}>
                          {focusedNode.sentiment}
                        </span>
                        <span className="ml-auto text-[7px] tabular-nums shrink-0"
                          style={{ color: "rgba(255,255,255,0.55)" }}>
                          {focusedNode.confidence.toFixed(0)}%
                          {focusedNode.source_count > 0 && ` · ${focusedNode.source_count} signals`}
                        </span>
                      </div>
                      <p className="text-[15px] font-medium leading-snug"
                        style={{ color: focusedNodeStyle.label }}>
                        {focusedNode.label}
                      </p>
                    </div>

                    {/* Role in active narrative */}
                    {activeChain && chainHighlight.nodeIds.has(focusedNode.id) && (() => {
                      const chain    = data.chains.find(c => c.id === activeChain);
                      if (!chain) return null;
                      const chainPos = chain.nodes.indexOf(focusedNode.id);
                      const total    = chain.nodes.length;
                      const prevNode = chainPos > 0
                        ? data.nodes.find(n => n.id === chain.nodes[chainPos - 1]) : null;
                      const nextNode = chainPos < total - 1
                        ? data.nodes.find(n => n.id === chain.nodes[chainPos + 1]) : null;
                      return (
                        <div className="pb-0">
                          <p className="text-[7px] font-medium uppercase tracking-[0.14em] mb-1.5"
                            style={{ color: "rgba(255,255,255,0.42)" }}>
                            Role in narrative · step {chainPos + 1} of {total}
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {prevNode && (
                              <>
                                <span className="text-[8px] font-medium"
                                  style={{
                                    color: (NODE_STYLE[prevNode.type] ?? NODE_STYLE.theme).label,
                                    opacity: 0.52,
                                  }}>
                                  {trunc(prevNode.label, 16)}
                                </span>
                                <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.35)" }}>→</span>
                              </>
                            )}
                            <span className="text-[8.5px] font-semibold"
                              style={{ color: focusedNodeStyle.label }}>
                              {trunc(focusedNode.label, 18)}
                            </span>
                            {nextNode && (
                              <>
                                <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.35)" }}>→</span>
                                <span className="text-[8px] font-medium"
                                  style={{
                                    color: (NODE_STYLE[nextNode.type] ?? NODE_STYLE.theme).label,
                                    opacity: 0.52,
                                  }}>
                                  {trunc(nextNode.label, 16)}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="mt-2.5 h-px"
                            style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.055) 20%, rgba(255,255,255,0.055) 80%, transparent)" }} />
                        </div>
                      );
                    })()}

                    {/* Why it matters */}
                    <div className="pb-0">
                      <p className="text-[7px] font-bold uppercase tracking-[0.2em] mb-2"
                        style={{ color: "rgba(255,255,255,0.52)" }}>
                        Why it matters
                      </p>
                      <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.74)" }}>
                        {focusedNode.description}
                      </p>
                      <div className="mt-3.5 h-px"
                        style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.050) 20%, rgba(255,255,255,0.050) 80%, transparent)" }} />
                    </div>

                    {/* Connections */}
                    {focusedConnections.length > 0 && (
                      <div className="pb-0">
                        <p className="text-[7px] font-medium uppercase tracking-[0.14em] mb-2"
                          style={{ color: "rgba(255,255,255,0.42)" }}>
                          Connections
                          <span className="ml-1.5 font-normal normal-case tracking-normal"
                            style={{ color: "rgba(255,255,255,0.42)" }}>
                            {focusedConnections.length}
                          </span>
                        </p>
                        <div>
                          {focusedConnections.slice(0, 7).map((c, idx) => {
                            const cs = NODE_STYLE[c.node.type] ?? NODE_STYLE.theme;
                            const isLast = idx === Math.min(focusedConnections.length, 7) - 1;
                            return (
                              <div key={c.node.id}
                                className="flex items-center gap-2 py-1"
                                style={!isLast ? { borderBottom: "1px solid rgba(255,255,255,0.04)" } : {}}
                                title={c.desc}>
                                <span className="text-[7px] shrink-0 w-3 text-right"
                                  style={{ color: "rgba(255,255,255,0.42)" }}>
                                  {c.isSource ? "→" : "←"}
                                </span>
                                <span className="text-[7px] shrink-0 capitalize min-w-[52px]"
                                  style={{ color: "rgba(255,255,255,0.40)" }}>
                                  {c.rel.replace(/_/g, " ")}
                                </span>
                                <span className="text-[9px] font-medium truncate" style={{ color: cs.label }}>
                                  {c.node.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {focusedInChains.length > 0 && (
                          <div className="mt-3 h-px"
                            style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.050) 20%, rgba(255,255,255,0.050) 80%, transparent)" }} />
                        )}
                      </div>
                    )}

                    {/* Narrative paths */}
                    {focusedInChains.length > 0 && (
                      <div>
                        <p className="text-[7px] font-bold uppercase tracking-[0.2em] mb-2"
                          style={{ color: "rgba(255,255,255,0.52)" }}>
                          Narrative {focusedInChains.length === 1 ? "path" : `paths (${focusedInChains.length})`}
                        </p>
                        <div>
                          {focusedInChains.map((c, idx) => (
                            <button key={c.id}
                              onClick={() => handleChainClick(c.id, activeChain)}
                              className="w-full flex items-center gap-2.5 py-1 text-left transition-colors"
                              style={{
                                borderBottom: idx < focusedInChains.length - 1
                                  ? "1px solid rgba(255,255,255,0.04)" : "none",
                              }}>
                              <div className="rounded-full shrink-0"
                                style={{
                                  width: 5, height: 5,
                                  background: activeChain === c.id
                                    ? "rgba(82,148,220,0.80)" : "rgba(74,118,180,0.28)",
                                }} />
                              <span className="text-[9px] font-medium flex-1 truncate"
                                style={{
                                  color: activeChain === c.id
                                    ? "rgba(140,190,255,0.90)" : "rgba(255,255,255,0.58)",
                                }}>
                                {trunc(c.title, 36)}
                              </span>
                              <span className="text-[7.5px] tabular-nums shrink-0"
                                style={{ color: "rgba(255,255,255,0.32)" }}>
                                {c.confidence.toFixed(0)}%
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button onClick={() => setFocusedNodeId(null)}
                    className="shrink-0 p-1.5 rounded hover:bg-white/5 transition-colors mt-0.5"
                    style={{ color: "rgba(255,255,255,0.52)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.52)")}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Legend */}
        {presentRelationships.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-6 py-2"
            style={{ borderTop: "1px solid rgba(255,255,255,0.03)" }}>
            {presentRelationships.map((rel) => (
              <div key={rel} className="flex items-center gap-1.5">
                <svg width="18" height="4" viewBox="0 0 18 4" aria-hidden>
                  <line x1="0" y1="2" x2="18" y2="2"
                    stroke={EDGE_STROKE_ACTIVE[rel] ?? "#4a6888"} strokeWidth="2" strokeOpacity="0.55" />
                </svg>
                <span className="text-[7.5px] capitalize" style={{ color: "rgba(255,255,255,0.50)" }}>
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
