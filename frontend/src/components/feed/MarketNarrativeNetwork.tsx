"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Network, RefreshCw, X } from "lucide-react";
import { useNarrativeNetwork } from "@/hooks/useNarrativeNetwork";
import type { GraphNode, GraphEdge, PropagationChain } from "@/lib/types";

// ── Canvas constants ───────────────────────────────────────────────────────────

const W       = 1060;
const H       = 480;
const PAD_X   = 90;
const PAD_Y   = 58;
const LABEL_X = 78;

// ── Row config ────────────────────────────────────────────────────────────────

const TYPE_ROW: Record<string, number> = {
  regime: 0, macro: 1, theme: 2, sector: 3, asset: 4,
};

const ROW_LABELS: Record<number, string> = {
  0: "REGIME", 1: "MACRO", 2: "THEMES", 3: "SECTORS", 4: "ASSETS",
};

// ── Visual constants ──────────────────────────────────────────────────────────

const NODE_STYLE: Record<string, { fill: string; stroke: string; label: string }> = {
  regime: { fill: "#0c1e38", stroke: "#5c95c8", label: "#a0d0e8" },
  macro:  { fill: "#1a1208", stroke: "#a87820", label: "#d4b060" },
  theme:  { fill: "#0d1428", stroke: "#3a70aa", label: "#70aede" },
  sector: { fill: "#091416", stroke: "#387850", label: "#70c888" },
  asset:  { fill: "#0e0c1e", stroke: "#6050a0", label: "#9880d0" },
};

const SENTIMENT_STROKE: Record<string, string> = {
  bullish: "#408855",
  bearish: "#904040",
  neutral: "#507888",
  mixed:   "#887025",
};

const EDGE_STROKE: Record<string, string> = {
  drives:       "#a09040",
  pressures:    "#a05050",
  supports:     "#409060",
  benefits:     "#3880a0",
  correlates:   "#506888",
  rotates_into: "#706090",
};

const EDGE_STROKE_ACTIVE: Record<string, string> = {
  drives:       "#d4b060",
  pressures:    "#d06868",
  supports:     "#60c080",
  benefits:     "#50aace",
  correlates:   "#7898be",
  rotates_into: "#9870c0",
};

// ── Layout ────────────────────────────────────────────────────────────────────

function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, { x: number; y: number }> {
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
      pos.set(node.id, { x: PAD_X + (usableW / (ordered.length + 1)) * (col + 1), y: y + stagger });
    });
  });

  return pos;
}

function nodeRadius(n: GraphNode): number {
  if (n.type === "regime") return 34;
  if (n.type === "macro")  return 18;
  if (n.type === "theme")  return Math.min(10 + (n.confidence / 100) * 14, 22);
  return Math.min(10 + (n.confidence / 100) * 18, 26);
}

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dy = y2 - y1;
  if (Math.abs(dy) < 24) {
    const h = Math.min(Math.abs(x2 - x1) * 0.28, 64);
    return `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${y1 - h} ${x2} ${y2}`;
  }
  return `M ${x1} ${y1} C ${x1} ${y1 + dy * 0.44} ${x2} ${y2 - dy * 0.44} ${x2} ${y2}`;
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function formatAge(iso: string): string {
  try {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60)   return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  } catch { return "—"; }
}

function regimeColor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("expansion") || l.includes("risk-on") || l.includes("dovish"))
    return "#60b078";
  if (l.includes("tighten") || l.includes("shock") || l.includes("pressure") ||
      l.includes("risk-off") || l.includes("stagflat"))
    return "#b06060";
  return "#7888a8";
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipState { node: GraphNode; x: number; y: number }

function NodeTooltip({ t }: { t: TooltipState }) {
  const style = NODE_STYLE[t.node.type] ?? NODE_STYLE.theme;
  return (
    <div className="absolute z-20 pointer-events-none"
      style={{ left: t.x + 16, top: Math.max(4, t.y - 68), width: 248 }}>
      <div className="rounded-lg border px-3 py-2.5"
        style={{ background: "#050c1c", borderColor: "rgba(255,255,255,0.16)" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[7.5px] font-bold uppercase tracking-widest"
            style={{ color: style.label }}>{t.node.type}</span>
          <span className="text-[7.5px] text-white/38">{t.node.confidence.toFixed(0)}% conf
            {t.node.source_count > 0 && ` · ${t.node.source_count} stories`}
          </span>
        </div>
        <p className="text-[12px] font-semibold leading-tight mb-1"
          style={{ color: style.label }}>
          {t.node.label}
        </p>
        <p className="text-[9.5px] text-white/60 leading-snug">
          {trunc(t.node.description, 130)}
        </p>
        <p className="text-[7.5px] text-white/30 mt-1.5">click to open intelligence panel</p>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <section className="mb-3">
      <div className="flex items-center gap-3 mb-3">
        <Network size={12} className="text-ink-secondary" />
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink">
          Market Narrative Network
        </span>
        <span className="h-px flex-1 bg-edge" />
      </div>
      <div className="rounded-xl border animate-pulse"
        style={{ background: "#070d1a", borderColor: "rgba(255,255,255,0.06)", height: 520 }} />
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

  // Chain highlight — includes edge order for staggered particle animation
  const chainHighlight = useMemo<{
    nodeIds:   Set<string>;
    edgeIds:   Set<string>;
    edgeOrder: Map<string, number>;
    sequence:  GraphNode[];
  }>(() => {
    if (!activeChain || !data) return { nodeIds: new Set(), edgeIds: new Set(), edgeOrder: new Map(), sequence: [] };
    const chain = data.chains.find(c => c.id === activeChain);
    if (!chain) return { nodeIds: new Set(), edgeIds: new Set(), edgeOrder: new Map(), sequence: [] };
    const nodeIds   = new Set(chain.nodes);
    const edgeIds   = new Set<string>();
    const edgeOrder = new Map<string, number>();
    for (let i = 0; i < chain.nodes.length - 1; i++) {
      const src = chain.nodes[i], tgt = chain.nodes[i + 1];
      data.edges.forEach(e => {
        if ((e.source === src && e.target === tgt) ||
            (e.source === tgt && e.target === src)) {
          edgeIds.add(e.id);
          edgeOrder.set(e.id, i);
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

  const activeHighlight    = activeChain !== null ? chainHighlight : hoveredHighlight;
  const anyHighlightActive = activeChain !== null || hoveredId !== null;

  const focusedNode = focusedNodeId && data
    ? (data.nodes.find(n => n.id === focusedNodeId) ?? null)
    : null;

  const focusedConnections = useMemo(() => {
    if (!focusedNodeId || !data) return [];
    return data.edges
      .filter(e => e.source === focusedNodeId || e.target === focusedNodeId)
      .map(e => {
        const isSource = e.source === focusedNodeId;
        const connId   = isSource ? e.target : e.source;
        const connNode = data.nodes.find(n => n.id === connId);
        return connNode
          ? { node: connNode, rel: e.relationship, isSource, desc: e.description }
          : null;
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

  const handleNodeLeave = useCallback(() => {
    setHoveredId(null);
    setTooltip(null);
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setFocusedNodeId(prev => prev === node.id ? null : node.id);
    setHasInteracted(true);
  }, []);

  const handleReset = useCallback(() => {
    setActiveChain(null);
    setFocusedNodeId(null);
  }, []);

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
    const sx = from.x + (dx / dist) * fr;
    const sy = from.y + (dy / dist) * fr;
    const ex = to.x   - (dx / dist) * tr;
    const ey = to.y   - (dy / dist) * tr;

    const isChainEdge  = chainHighlight.edgeIds.has(edge.id);
    const isHigh       = anyHighlightActive && (activeHighlight?.edgeIds.has(edge.id) ?? false);
    const isDim        = anyHighlightActive && !isHigh;
    const baseStroke   = EDGE_STROKE[edge.relationship] ?? "#485a72";
    const activeStroke = EDGE_STROKE_ACTIVE[edge.relationship] ?? "#7898be";
    const stroke       = isChainEdge ? activeStroke : baseStroke;
    const base         = Math.min(0.36 + edge.confidence * 0.36, 0.72);
    const opacity      = isDim ? 0.02 : isChainEdge ? 1.0 : isHigh ? 0.85 : base;
    const sw           = Math.max(1.0, edge.weight * 3.0);
    const d            = edgePath(sx, sy, ex, ey);
    const particleDelay = `${(chainHighlight.edgeOrder.get(edge.id) ?? 0) * 0.55}s`;

    return (
      <g key={edge.id}>
        {/* Wide soft aura */}
        {isChainEdge && (
          <path d={d} stroke={activeStroke}
            strokeWidth={(sw + 2.0) * 6} strokeOpacity={0.06}
            fill="none" filter="url(#edgeAura)" />
        )}
        {/* Tight glow halo */}
        {isChainEdge && (
          <path d={d} stroke={activeStroke}
            strokeWidth={(sw + 2.0) * 2.6} strokeOpacity={0.24}
            fill="none" filter="url(#edgeGlow)" />
        )}
        {/* Main edge — solid, no dasharray */}
        <path
          d={d}
          stroke={stroke}
          strokeWidth={isChainEdge ? sw + 1.8 : sw}
          strokeOpacity={opacity}
          fill="none"
          markerEnd={isChainEdge ? "url(#arrActive)" : undefined}
          style={{ transition: "stroke-opacity 200ms" }}
        />
        {/* Signal propagation particle — animateMotion along active chain edges only */}
        {isChainEdge && (
          <circle r={2.8} fill={activeStroke}>
            <animateMotion
              path={d}
              dur="2.2s"
              begin={particleDelay}
              repeatCount="indefinite"
            />
            <animate attributeName="fill-opacity"
              values="0;0.88;0.88;0"
              keyTimes="0;0.08;0.88;1"
              dur="2.2s"
              begin={particleDelay}
              repeatCount="indefinite" />
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
      ? (SENTIMENT_STROKE[node.sentiment] ?? base.stroke)
      : base.stroke;

    const isHov    = hoveredId === node.id;
    const isFocus  = focusedNodeId === node.id;
    const isHigh   = anyHighlightActive && (activeHighlight?.nodeIds.has(node.id) ?? false);
    const isDim    = anyHighlightActive && !isHigh;
    const isRegime = node.type === "regime";
    const isTheme  = node.type === "theme";
    const isActive = chainHighlight.nodeIds.has(node.id);
    const fill     = isRegime ? "url(#regGrad)" : base.fill;
    const rc       = regimeColor(node.label);

    const labelThreshold = isTheme ? 14 : 10;
    const showLabel = anyHighlightActive
      ? (isHigh || isHov || isFocus)
      : r >= labelThreshold;
    const labelMax = isRegime ? 30 : (isTheme && !isFocus) ? 15 : isFocus ? 28 : 20;

    return (
      <g
        key={node.id}
        transform={`translate(${pos.x},${pos.y})`}
        className="cursor-pointer"
        style={{ opacity: isDim ? 0.025 : 1, transition: "opacity 200ms" }}
        onMouseEnter={e => handleNodeEnter(node, e)}
        onMouseLeave={handleNodeLeave}
        onClick={() => handleNodeClick(node)}
      >
        <g>
          {isRegime && (
            <animateTransform
              attributeName="transform" attributeType="XML" type="scale"
              values="1;1.022;1" dur="6s" repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
              keyTimes="0;0.5;1"
            />
          )}

          {isRegime && (
            <circle r={r + 5} fill="none" stroke={rc} strokeWidth="1.5" strokeOpacity="0">
              <animate attributeName="r" values={`${r + 4};${r + 20};${r + 4}`}
                dur="3.8s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.45;0;0.45"
                dur="3.8s" repeatCount="indefinite" />
            </circle>
          )}
          {isRegime && (
            <circle r={r + 2} fill="none" stroke={rc}
              strokeWidth="6" strokeOpacity="0.14" filter="url(#regGlow)" />
          )}

          {/* Active chain: layered glow rings */}
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

          <circle
            r={r}
            fill={fill}
            stroke={stroke}
            strokeWidth={isActive || isFocus ? 2.8 : isHov ? 2.2 : 1.3}
            strokeOpacity={isActive || isFocus ? 1.0 : isHov ? 0.90 : 0.65}
            filter={isActive && !isRegime
              ? "url(#nodeActiveGlow)"
              : isHov && !isRegime ? "url(#hoverGlow)" : undefined}
            style={{ transition: "stroke-width 140ms, stroke-opacity 140ms" }}
          />

          {r < 18 && <circle r={2.5} fill={stroke} fillOpacity={0.72} />}

          {showLabel && (
            <text
              y={r + (isRegime ? 16 : 13)}
              textAnchor="middle"
              fontSize={isRegime ? 11.5 : isFocus ? 11 : isTheme ? 9.5 : 10}
              fontWeight={isRegime || isFocus || isActive ? 600 : 400}
              fontFamily="Inter, system-ui, sans-serif"
              fill={base.label}
              fillOpacity={isHov || isFocus ? 0.96 : isActive ? 0.92 : 0.78}
              className="pointer-events-none select-none"
              style={{ transition: "fill-opacity 140ms" }}
            >
              {trunc(node.label, labelMax)}
            </text>
          )}
        </g>
      </g>
    );
  }

  return (
    <section className="mb-3">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-3">
        <Network size={12} className="text-ink-secondary shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink">
          Market Narrative Network
        </span>
        <span className="h-px flex-1 bg-edge" />
        {isFetching && <RefreshCw size={9} className="text-ink-faint animate-spin" />}
        <span className="text-[9px] text-ink-muted tabular-nums">
          {data.nodes.length} nodes · {data.edges.length} edges
        </span>
      </div>

      <div className="rounded-xl border overflow-hidden"
        style={{ background: "#060c18", borderColor: "rgba(255,255,255,0.12)" }}>

        {/* ── Top info bar ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-2.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[8.5px] text-white/55 leading-relaxed">
            Live map of how today&apos;s dominant market regime is transmitting through macro drivers, themes, and sectors.
          </p>
          <div className="flex items-center gap-5 shrink-0 ml-6">
            <div className="text-right">
              <p className="text-[7px] font-bold uppercase tracking-[0.18em] text-white/42 mb-0.5">
                Dominant Regime
              </p>
              <p className="text-[12px] font-semibold leading-tight"
                style={{ color: regimeColor(data.dominant_regime) }}>
                {data.dominant_regime}
              </p>
            </div>
            {anyFocusOrChain && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
                           text-[8.5px] text-white/55 hover:text-white/80 transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.14)" }}
              >
                <X size={9} strokeWidth={2.5} /><span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Graph canvas ──────────────────────────────────────────────────── */}
        <div ref={wrapRef} className="relative" style={{ minHeight: 420 }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full block"
            style={{ overflow: "visible" }}>
            <defs>
              {/* Passive arrow — very subtle, just barely implies direction */}
              <marker id="arr" markerWidth="5" markerHeight="5"
                refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,5 L5,2.5 Z" fill="rgba(255,255,255,0.07)" />
              </marker>
              {/* Active arrow — clear directional indicator */}
              <marker id="arrActive" markerWidth="7" markerHeight="7"
                refX="5.5" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,7 L7,3.5 Z" fill="rgba(255,255,255,0.80)" />
              </marker>

              {/* Regime gradient */}
              <radialGradient id="regGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#1c3f60" stopOpacity="0.96" />
                <stop offset="65%"  stopColor="#0f2240" stopOpacity="0.98" />
                <stop offset="100%" stopColor="#060e1e" stopOpacity="1"    />
              </radialGradient>

              {/* Atmospheric depth gradient */}
              <radialGradient id="bgAtmo" cx="50%" cy="10%" r="72%">
                <stop offset="0%"   stopColor="#0d2040" stopOpacity="0.85" />
                <stop offset="55%"  stopColor="#060f22" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#030608" stopOpacity="0"    />
              </radialGradient>

              <filter id="regGlow" x="-70%" y="-70%" width="240%" height="240%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="activeGlow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="7" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="nodeActiveGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="hoverGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="edgeGlow" x="-20%" y="-100%" width="140%" height="300%">
                <feGaussianBlur stdDeviation="3.5" />
              </filter>
              <filter id="edgeAura" x="-40%" y="-200%" width="180%" height="500%">
                <feGaussianBlur stdDeviation="10" />
              </filter>
            </defs>

            <rect width={W} height={H} fill="url(#bgAtmo)" />

            {rowEntries.map(([row, y]) => (
              <line key={row}
                x1={PAD_X - 20} y1={y} x2={W - PAD_X + 20} y2={y}
                stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            ))}

            {rowEntries.map(([row, y]) => (
              <text key={row}
                x={LABEL_X} y={y + 4}
                textAnchor="end"
                fontSize={7} fontWeight={700} letterSpacing={1.8}
                fontFamily="Inter, system-ui, sans-serif"
                fill="rgba(255,255,255,0.20)"
                className="pointer-events-none select-none">
                {ROW_LABELS[row] ?? ""}
              </text>
            ))}

            {data.edges.map(renderEdge)}
            {data.nodes.map(renderNode)}
          </svg>

          {tooltip && <NodeTooltip t={tooltip} />}
        </div>

        {/* ── Active path / chain tabs ───────────────────────────────────────── */}
        <div className="px-5 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[7px] font-bold uppercase tracking-[0.22em] text-white/45
                             shrink-0 mr-1 self-center">
              Active Path
            </span>
            {sortedChains.slice(0, 5).map((chain: PropagationChain, idx: number) => {
              const sel   = activeChain === chain.id;
              const isTop = idx === 0;
              return (
                <button
                  key={chain.id}
                  onClick={() => handleChainClick(chain.id, activeChain)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all duration-150"
                  style={{
                    background: sel
                      ? "rgba(50,100,180,0.20)"
                      : isTop && !activeChain ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${sel ? "rgba(100,160,240,0.38)" : "rgba(255,255,255,0.10)"}`,
                  }}
                >
                  <div className="rounded-full shrink-0"
                    style={{
                      width: 6, height: 6,
                      background: isTop
                        ? `rgba(80,170,120,${sel ? 0.95 : 0.65})`
                        : `rgba(80,140,110,${sel ? 0.82 : 0.40})`,
                    }} />
                  <span style={{
                    fontSize: 10, fontWeight: sel || isTop ? 500 : 400,
                    color: sel ? "rgba(255,255,255,0.92)" : isTop
                      ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.55)",
                  }}>
                    {trunc(chain.title, 32)}
                  </span>
                  <span className="text-[8px] tabular-nums shrink-0"
                    style={{ color: sel ? "rgba(180,210,255,0.65)" : "rgba(255,255,255,0.38)" }}>
                    {chain.confidence.toFixed(0)}%
                  </span>
                </button>
              );
            })}
            <span className="ml-auto text-[7.5px] text-white/42 tabular-nums shrink-0 self-center">
              {formatAge(data.generated_at)}
            </span>
          </div>

          {/* Causal transmission sequence */}
          {activeChain && chainHighlight.sequence.length >= 2 && (
            <div className="mt-2.5 pl-14">
              <p className="text-[6.5px] font-bold uppercase tracking-[0.22em] text-white/28 mb-1.5">
                Transmission Path
              </p>
              <div className="flex items-center gap-0 flex-wrap">
                {chainHighlight.sequence.map((n, i) => (
                  <span key={n.id} className="flex items-center">
                    <span
                      className="text-[8.5px] font-medium px-1.5 py-0.5 rounded"
                      style={{
                        color: (NODE_STYLE[n.type] ?? NODE_STYLE.theme).label,
                        background: `${(NODE_STYLE[n.type] ?? NODE_STYLE.theme).stroke}18`,
                      }}
                    >
                      {trunc(n.label, 20)}
                    </span>
                    {i < chainHighlight.sequence.length - 1 && (
                      <span className="text-white/22 text-[10px] px-1">→</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Chain summary */}
          {activeChain && (
            <p className="text-[8.5px] text-white/55 mt-2 leading-relaxed pl-14">
              {data.chains.find(c => c.id === activeChain)?.summary ?? ""}
            </p>
          )}

          {!hasInteracted && (
            <p className="text-[7.5px] text-white/35 mt-1.5 pl-14 italic">
              Click any node to open the intelligence panel · hover to preview connections
            </p>
          )}
        </div>

        {/* ── Intelligence drawer ────────────────────────────────────────────── */}
        {focusedNode && focusedNodeStyle && (
          <div className="relative"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(5,10,24,0.99)",
            }}>
            {/* Type-color left accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-[3px]"
              style={{ background: focusedNodeStyle.label, opacity: 0.60 }} />

            <div className="px-5 py-4 pl-7">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0 flex-1 space-y-4">

                  {/* Identity header */}
                  <div>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[7px] font-bold uppercase tracking-[0.22em] px-1.5 py-0.5 rounded"
                        style={{
                          color: focusedNodeStyle.label,
                          background: "rgba(255,255,255,0.07)",
                          border: `1px solid ${focusedNodeStyle.stroke}50`,
                        }}>
                        {focusedNode.type}
                      </span>
                      <span className="text-[7px] font-medium px-1.5 py-0.5 rounded capitalize"
                        style={{
                          color: SENTIMENT_STROKE[focusedNode.sentiment] ?? "#507888",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.09)",
                        }}>
                        {focusedNode.sentiment}
                      </span>
                      <span className="ml-auto text-[7.5px] text-white/40 tabular-nums shrink-0">
                        {focusedNode.confidence.toFixed(0)}% conf
                        {focusedNode.source_count > 0 && ` · ${focusedNode.source_count} signals`}
                      </span>
                    </div>
                    <p className="text-[16px] font-semibold leading-tight"
                      style={{ color: focusedNodeStyle.label }}>
                      {focusedNode.label}
                    </p>
                  </div>

                  {/* Role in active narrative — only shown when node is in selected chain */}
                  {activeChain && chainHighlight.nodeIds.has(focusedNode.id) && (() => {
                    const chain = data.chains.find(c => c.id === activeChain);
                    if (!chain) return null;
                    const chainPos  = chain.nodes.indexOf(focusedNode.id);
                    const total     = chain.nodes.length;
                    const prevNode  = chainPos > 0
                      ? data.nodes.find(n => n.id === chain.nodes[chainPos - 1])
                      : null;
                    const nextNode  = chainPos < total - 1
                      ? data.nodes.find(n => n.id === chain.nodes[chainPos + 1])
                      : null;
                    return (
                      <div className="pb-3.5"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-white/35 mb-2">
                          Role in active narrative · step {chainPos + 1} of {total}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {prevNode && (
                            <>
                              <span className="text-[8px] font-medium px-1.5 py-0.5 rounded"
                                style={{
                                  color: (NODE_STYLE[prevNode.type] ?? NODE_STYLE.theme).label,
                                  opacity: 0.65,
                                  background: "rgba(255,255,255,0.04)",
                                }}>
                                {trunc(prevNode.label, 16)}
                              </span>
                              <span className="text-white/28 text-[10px]">→</span>
                            </>
                          )}
                          <span className="text-[8.5px] font-semibold px-2 py-0.5 rounded"
                            style={{
                              color: focusedNodeStyle.label,
                              background: `${focusedNodeStyle.stroke}28`,
                              border: `1px solid ${focusedNodeStyle.stroke}55`,
                            }}>
                            {trunc(focusedNode.label, 18)}
                          </span>
                          {nextNode && (
                            <>
                              <span className="text-white/28 text-[10px]">→</span>
                              <span className="text-[8px] font-medium px-1.5 py-0.5 rounded"
                                style={{
                                  color: (NODE_STYLE[nextNode.type] ?? NODE_STYLE.theme).label,
                                  opacity: 0.65,
                                  background: "rgba(255,255,255,0.04)",
                                }}>
                                {trunc(nextNode.label, 16)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Why it matters */}
                  <div className="pb-3.5"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-white/35 mb-1.5">
                      Why it matters
                    </p>
                    <p className="text-[11px] text-white/80 leading-relaxed">
                      {focusedNode.description}
                    </p>
                  </div>

                  {/* Connections */}
                  {focusedConnections.length > 0 && (
                    <div className="pb-3.5"
                      style={{ borderBottom: focusedInChains.length > 0 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                      <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-white/35 mb-2">
                        Connections
                        <span className="ml-1.5 text-white/20 font-normal normal-case tracking-normal">
                          ({focusedConnections.length})
                        </span>
                      </p>
                      <div className="space-y-1.5">
                        {focusedConnections.slice(0, 7).map(c => {
                          const cs = NODE_STYLE[c.node.type] ?? NODE_STYLE.theme;
                          return (
                            <div key={c.node.id}
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md"
                              style={{
                                background: "rgba(255,255,255,0.04)",
                                border: `1px solid ${cs.stroke}30`,
                              }}
                              title={c.desc}>
                              <span className="text-[7.5px] text-white/38 shrink-0 w-3 text-right">
                                {c.isSource ? "→" : "←"}
                              </span>
                              <span className="text-[7.5px] text-white/40 shrink-0 capitalize min-w-[52px]">
                                {c.rel.replace(/_/g, " ")}
                              </span>
                              <span className="text-[9.5px] font-medium truncate"
                                style={{ color: cs.label }}>
                                {c.node.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Narrative paths */}
                  {focusedInChains.length > 0 && (
                    <div>
                      <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-white/35 mb-2">
                        Narrative {focusedInChains.length === 1 ? "path" : `paths (${focusedInChains.length})`}
                      </p>
                      <div className="space-y-1.5">
                        {focusedInChains.map(c => (
                          <button key={c.id}
                            onClick={() => handleChainClick(c.id, activeChain)}
                            className="w-full flex items-center gap-3 px-2.5 py-1.5 rounded-md
                                       text-left transition-colors"
                            style={{
                              background: activeChain === c.id
                                ? "rgba(60,130,100,0.18)"
                                : "rgba(255,255,255,0.04)",
                              border: `1px solid ${activeChain === c.id
                                ? "rgba(80,180,120,0.35)"
                                : "rgba(255,255,255,0.10)"}`,
                            }}>
                            <div className="rounded-full shrink-0"
                              style={{
                                width: 6, height: 6,
                                background: activeChain === c.id
                                  ? "rgba(80,200,140,0.90)"
                                  : "rgba(80,140,110,0.50)",
                              }} />
                            <span className="text-[9px] font-medium flex-1 truncate"
                              style={{
                                color: activeChain === c.id
                                  ? "rgba(100,210,150,0.92)"
                                  : "rgba(255,255,255,0.72)",
                              }}>
                              {trunc(c.title, 36)}
                            </span>
                            <span className="text-[8px] tabular-nums shrink-0"
                              style={{ color: activeChain === c.id
                                ? "rgba(100,200,150,0.60)"
                                : "rgba(255,255,255,0.35)" }}>
                              {c.confidence.toFixed(0)}%
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

                <button onClick={() => setFocusedNodeId(null)}
                  className="shrink-0 p-1.5 rounded text-white/30 hover:text-white/65
                             hover:bg-white/5 transition-colors mt-0.5">
                  <X size={12} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Legend ────────────────────────────────────────────────────────── */}
        {presentRelationships.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-2"
            style={{ borderTop: "1px solid rgba(255,255,255,0.045)" }}>
            {presentRelationships.map(rel => (
              <div key={rel} className="flex items-center gap-1.5">
                <svg width="18" height="4" viewBox="0 0 18 4" aria-hidden>
                  <line x1="0" y1="2" x2="18" y2="2"
                    stroke={EDGE_STROKE[rel] ?? "#485a72"}
                    strokeWidth="2" strokeOpacity="0.68" />
                </svg>
                <span className="text-[7.5px] text-white/45 capitalize">
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
