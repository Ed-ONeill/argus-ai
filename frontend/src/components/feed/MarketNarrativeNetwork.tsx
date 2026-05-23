"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Network, RefreshCw, X } from "lucide-react";
import { useNarrativeNetwork } from "@/hooks/useNarrativeNetwork";
import type { GraphNode, GraphEdge, PropagationChain } from "@/lib/types";

// ── Canvas constants ───────────────────────────────────────────────────────────

const W       = 1060;
const H       = 480;
const PAD_X   = 90;   // horizontal inset — left side holds row labels
const PAD_Y   = 58;   // vertical inset
const LABEL_X = 78;   // right-edge x for row labels (textAnchor="end")

// ── Row config ────────────────────────────────────────────────────────────────

const TYPE_ROW: Record<string, number> = {
  regime: 0, macro: 1, theme: 2, sector: 3, asset: 4,
};

const ROW_LABELS: Record<number, string> = {
  0: "REGIME", 1: "MACRO", 2: "THEMES", 3: "SECTORS", 4: "ASSETS",
};

// ── Visual constants ──────────────────────────────────────────────────────────

const NODE_STYLE: Record<string, { fill: string; stroke: string; label: string }> = {
  regime: { fill: "#0b1a2e", stroke: "#4e82b0", label: "#8abcd8" },
  macro:  { fill: "#140e06", stroke: "#8a6018", label: "#c09848" },
  theme:  { fill: "#090f1e", stroke: "#305888", label: "#5898c8" },
  sector: { fill: "#060e0f", stroke: "#2e6040", label: "#58b070" },
  asset:  { fill: "#0d0a18", stroke: "#584090", label: "#9070c0" },
};

const SENTIMENT_STROKE: Record<string, string> = {
  bullish: "#306840",
  bearish: "#703030",
  neutral: "#405868",
  mixed:   "#685818",
};

// Restrained, consistent palette — all types at similar brightness
const EDGE_STROKE: Record<string, string> = {
  drives:       "#8a7030",
  pressures:    "#8a4040",
  supports:     "#3a7050",
  benefits:     "#306880",
  correlates:   "#485a72",
  rotates_into: "#60487a",
};

// ── Layout with crossing reduction ────────────────────────────────────────────

/**
 * One-pass barycenter heuristic: sorts each row's nodes by the average x of
 * their already-placed neighbors, reducing inter-row edge crossings.
 */
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

    ordered.forEach((node, col) => {
      const n = ordered.length;
      pos.set(node.id, { x: PAD_X + (usableW / (n + 1)) * (col + 1), y });
    });
  });

  return pos;
}

function nodeRadius(n: GraphNode): number {
  if (n.type === "regime") return 34;
  if (n.type === "macro")  return 18;
  const base = n.type === "theme" ? 12 : 10;
  return Math.min(base + (n.confidence / 100) * 20, 30);
}

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dy = y2 - y1;
  if (Math.abs(dy) < 24) {
    // Same row — arc upward, height scales with horizontal distance
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
      style={{ left: t.x + 16, top: Math.max(4, t.y - 72), width: 240 }}>
      <div className="rounded-lg border px-3 py-2.5"
        style={{ background: "#080f1e", borderColor: "rgba(255,255,255,0.13)" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[8px] font-bold uppercase tracking-widest"
            style={{ color: style.label }}>{t.node.type}</span>
          <span className="text-[8px] text-white/28">{t.node.confidence.toFixed(0)}% conf</span>
        </div>
        <p className="text-[12px] font-semibold text-white/90 leading-tight mb-1">
          {t.node.label}
        </p>
        <p className="text-[9.5px] text-white/46 leading-snug">
          {trunc(t.node.description, 130)}
        </p>
        {t.node.source_count > 0 && (
          <p className="text-[8px] text-white/28 mt-1.5">
            {t.node.source_count} stories · click to focus
          </p>
        )}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <section className="mb-5">
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

  const wrapRef         = useRef<HTMLDivElement>(null);
  const initialChainRef = useRef(false);

  const chains = data?.chains;

  // Auto-select highest-confidence chain on first data load
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

  // Chain-path highlight
  const chainHighlight = useMemo<{ nodeIds: Set<string>; edgeIds: Set<string> }>(() => {
    if (!activeChain || !data) return { nodeIds: new Set(), edgeIds: new Set() };
    const chain = data.chains.find(c => c.id === activeChain);
    if (!chain) return { nodeIds: new Set(), edgeIds: new Set() };
    const nodeIds = new Set(chain.nodes);
    const edgeIds = new Set<string>();
    for (let i = 0; i < chain.nodes.length - 1; i++) {
      const src = chain.nodes[i], tgt = chain.nodes[i + 1];
      data.edges.forEach(e => {
        if ((e.source === src && e.target === tgt) ||
            (e.source === tgt && e.target === src)) edgeIds.add(e.id);
      });
    }
    return { nodeIds, edgeIds };
  }, [activeChain, data]);

  // Hover-connected highlight (edges + neighbors)
  const hoveredHighlight = useMemo<{ nodeIds: Set<string>; edgeIds: Set<string> } | null>(() => {
    if (!hoveredId || !data) return null;
    const connected = data.edges.filter(e => e.source === hoveredId || e.target === hoveredId);
    return {
      edgeIds: new Set(connected.map(e => e.id)),
      nodeIds: new Set([hoveredId, ...connected.flatMap(e => [e.source, e.target])]),
    };
  }, [hoveredId, data]);

  // Chain takes priority over hover
  const activeHighlight = activeChain !== null ? chainHighlight : hoveredHighlight;
  const anyHighlightActive = activeChain !== null || hoveredId !== null;

  const focusedNode = focusedNodeId && data
    ? (data.nodes.find(n => n.id === focusedNodeId) ?? null)
    : null;

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
  }, []);

  const handleReset = useCallback(() => {
    setActiveChain(null);
    setFocusedNodeId(null);
  }, []);

  if (isLoading) return <Skeleton />;
  if (!data || data.nodes.length < 2) return null;

  const sortedChains = [...data.chains].sort((a, b) => b.confidence - a.confidence);
  const presentRelationships = [...new Set(data.edges.map(e => e.relationship))];

  // Row y-positions for lane labels
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

    const isChainEdge = chainHighlight.edgeIds.has(edge.id);
    const isHigh  = anyHighlightActive && (activeHighlight?.edgeIds.has(edge.id) ?? false);
    const isDim   = anyHighlightActive && !isHigh;
    const stroke  = EDGE_STROKE[edge.relationship] ?? "#485a72";
    const base    = Math.min(0.42 + edge.confidence * 0.50, 0.80);
    const opacity = isDim ? 0.04 : isHigh ? 0.92 : base;
    const sw      = Math.max(1.2, edge.weight * 3.5);

    return (
      <path
        key={edge.id}
        d={edgePath(sx, sy, ex, ey)}
        stroke={stroke}
        strokeWidth={isChainEdge ? sw + 0.8 : sw}
        strokeOpacity={opacity}
        strokeDasharray={isChainEdge ? "10 5" : undefined}
        fill="none"
        markerEnd="url(#arr)"
        style={{ transition: "stroke-opacity 180ms" }}
      >
        {/* Animated flow only on the active chain path */}
        {isChainEdge && (
          <animate
            attributeName="stroke-dashoffset"
            from="45" to="0"
            dur="1.8s"
            repeatCount="indefinite"
          />
        )}
      </path>
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
    const fill     = node.type === "regime" ? "url(#regGrad)" : base.fill;
    const isRegime = node.type === "regime";
    const rc       = regimeColor(node.label);

    return (
      <g
        key={node.id}
        transform={`translate(${pos.x},${pos.y})`}
        className="cursor-pointer"
        style={{ opacity: isDim ? 0.10 : 1, transition: "opacity 200ms" }}
        onMouseEnter={e => handleNodeEnter(node, e)}
        onMouseLeave={handleNodeLeave}
        onClick={() => handleNodeClick(node)}
      >
        {/* Regime: animated pulse ring */}
        {isRegime && (
          <circle r={r + 5} fill="none" stroke={rc} strokeWidth="1.5" strokeOpacity="0">
            <animate attributeName="r"
              values={`${r + 4};${r + 18};${r + 4}`}
              dur="3.5s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity"
              values="0.48;0;0.48"
              dur="3.5s" repeatCount="indefinite" />
          </circle>
        )}
        {/* Regime: blur glow halo */}
        {isRegime && (
          <circle r={r + 2} fill="none" stroke={rc}
            strokeWidth="6" strokeOpacity="0.11"
            filter="url(#regGlow)" />
        )}
        {/* Focus indicator ring */}
        {isFocus && (
          <circle r={r + 5} fill="none" stroke={base.label}
            strokeWidth="1.5" strokeOpacity="0.55" strokeDasharray="4 3" />
        )}
        {/* Main circle */}
        <circle
          r={r}
          fill={fill}
          stroke={stroke}
          strokeWidth={isHov || isHigh || isFocus ? 2.4 : 1.3}
          strokeOpacity={isHov || isHigh || isFocus ? 0.90 : 0.65}
          filter={isHov && !isRegime ? "url(#hoverGlow)" : undefined}
          style={{ transition: "stroke-width 140ms, stroke-opacity 140ms" }}
        />
        {r < 18 && <circle r={2.5} fill={stroke} fillOpacity={0.70} />}
        <text
          y={r + (isRegime ? 16 : 13)}
          textAnchor="middle"
          fontSize={isRegime ? 11.5 : 10}
          fontWeight={isRegime || isFocus ? 600 : 400}
          fontFamily="Inter, system-ui, sans-serif"
          fill={base.label}
          fillOpacity={isDim ? 0.06 : isHov || isFocus ? 0.96 : 0.78}
          className="pointer-events-none select-none"
          style={{ transition: "fill-opacity 140ms" }}
        >
          {trunc(node.label, isRegime ? 30 : 22)}
        </text>
      </g>
    );
  }

  const anyFocusOrChain = focusedNodeId !== null || activeChain !== null;

  return (
    <section className="mb-5">
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
        style={{ background: "#070d1a", borderColor: "rgba(255,255,255,0.08)" }}>

        {/* ── Top info bar ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[9px] text-white/36 leading-relaxed">
            Live map of how today's dominant market regime is transmitting through macro
            drivers, themes, and sectors.
          </p>
          <div className="flex items-center gap-5 shrink-0 ml-6">
            <div className="text-right">
              <p className="text-[7.5px] font-bold uppercase tracking-[0.18em] text-white/22 mb-0.5">
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
                           text-[8.5px] text-white/40 hover:text-white/70 transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.10)" }}
              >
                <X size={9} strokeWidth={2.5} />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Graph canvas ──────────────────────────────────────────────────── */}
        <div ref={wrapRef} className="relative" style={{ minHeight: 440 }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full block"
            style={{ overflow: "visible" }}>
            <defs>
              <marker id="arr" markerWidth="6" markerHeight="6"
                refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L6,3 Z" fill="rgba(255,255,255,0.20)" />
              </marker>
              <radialGradient id="regGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#1c3f60" stopOpacity="0.96" />
                <stop offset="65%"  stopColor="#0f2240" stopOpacity="0.98" />
                <stop offset="100%" stopColor="#060e1e" stopOpacity="1"    />
              </radialGradient>
              <filter id="regGlow" x="-70%" y="-70%" width="240%" height="240%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="hoverGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Subtle horizontal lane separators */}
            {rowEntries.map(([row, y]) => (
              <line key={row}
                x1={PAD_X - 18} y1={y} x2={W - PAD_X + 18} y2={y}
                stroke="rgba(255,255,255,0.036)" strokeWidth="1" />
            ))}

            {/* Row lane labels */}
            {rowEntries.map(([row, y]) => (
              <text key={row}
                x={LABEL_X} y={y + 4}
                textAnchor="end"
                fontSize={7} fontWeight={700}
                letterSpacing={1.8}
                fontFamily="Inter, system-ui, sans-serif"
                fill="rgba(255,255,255,0.18)"
                className="pointer-events-none select-none">
                {ROW_LABELS[row] ?? ""}
              </text>
            ))}

            {/* Edges rendered below nodes */}
            {data.edges.map(renderEdge)}

            {/* Nodes */}
            {data.nodes.map(renderNode)}
          </svg>

          {tooltip && <NodeTooltip t={tooltip} />}
        </div>

        {/* ── Bottom: active path chain tabs ────────────────────────────────── */}
        <div className="px-5 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[7.5px] font-bold uppercase tracking-[0.20em] text-white/22
                             shrink-0 mr-1 self-center">
              Active Path
            </span>
            {sortedChains.slice(0, 5).map((chain: PropagationChain, idx: number) => {
              const sel   = activeChain === chain.id;
              const isTop = idx === 0;
              return (
                <button
                  key={chain.id}
                  onClick={() => setActiveChain(sel ? null : chain.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
                             transition-colors duration-150"
                  style={{
                    background: sel
                      ? "rgba(255,255,255,0.09)"
                      : isTop && !activeChain
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(255,255,255,0.02)",
                    border: `1px solid ${
                      sel ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)"
                    }`,
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background: isTop
                        ? `rgba(80,170,120,${sel ? 0.90 : 0.62})`
                        : `rgba(80,140,110,${sel ? 0.76 : 0.34})`,
                    }} />
                  <span style={{
                    fontSize: 10,
                    fontWeight: isTop ? 500 : 400,
                    color: sel
                      ? "rgba(255,255,255,0.88)"
                      : isTop
                      ? "rgba(255,255,255,0.62)"
                      : "rgba(255,255,255,0.38)",
                  }}>
                    {trunc(chain.title, 32)}
                  </span>
                  <span className="text-[8px] tabular-nums shrink-0"
                    style={{ color: "rgba(255,255,255,0.28)" }}>
                    {chain.confidence.toFixed(0)}%
                  </span>
                </button>
              );
            })}
            <span className="ml-auto text-[8px] text-white/22 tabular-nums shrink-0 self-center">
              {formatAge(data.generated_at)} · {data.raw_theme_count}T · {data.raw_activation_count}I
            </span>
          </div>
          {activeChain && (
            <p className="text-[9px] text-white/34 mt-2 leading-relaxed pl-16">
              {data.chains.find(c => c.id === activeChain)?.summary ?? ""}
            </p>
          )}
        </div>

        {/* ── Focused node detail panel ─────────────────────────────────────── */}
        {focusedNode && (
          <div className="px-5 py-3 flex items-start justify-between gap-5"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.07)",
              background: "rgba(255,255,255,0.018)",
            }}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[7.5px] font-bold uppercase tracking-widest"
                  style={{ color: (NODE_STYLE[focusedNode.type] ?? NODE_STYLE.theme).label }}>
                  {focusedNode.type}
                </span>
                <span className="text-[7.5px] text-white/28">
                  {focusedNode.confidence.toFixed(0)}% confidence
                  {focusedNode.source_count > 0 && ` · ${focusedNode.source_count} stories`}
                </span>
              </div>
              <p className="text-[13px] font-semibold text-white/88 leading-snug mb-1">
                {focusedNode.label}
              </p>
              <p className="text-[10px] text-white/46 leading-relaxed">
                {focusedNode.description}
              </p>
            </div>
            <button onClick={() => setFocusedNodeId(null)}
              className="shrink-0 p-1 text-white/28 hover:text-white/62 transition-colors mt-0.5">
              <X size={13} />
            </button>
          </div>
        )}

        {/* ── Legend ────────────────────────────────────────────────────────── */}
        {presentRelationships.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-2.5"
            style={{ borderTop: "1px solid rgba(255,255,255,0.045)" }}>
            {presentRelationships.map(rel => (
              <div key={rel} className="flex items-center gap-1.5">
                <svg width="18" height="4" viewBox="0 0 18 4" aria-hidden>
                  <line x1="0" y1="2" x2="18" y2="2"
                    stroke={EDGE_STROKE[rel] ?? "#485a72"}
                    strokeWidth="2" strokeOpacity="0.72" />
                </svg>
                <span className="text-[8px] text-white/28 capitalize">
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
