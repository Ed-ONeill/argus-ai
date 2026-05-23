"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { Network, RefreshCw } from "lucide-react";
import { useNarrativeNetwork } from "@/hooks/useNarrativeNetwork";
import type { GraphNode, GraphEdge, PropagationChain } from "@/lib/types";

// ── SVG canvas constants ──────────────────────────────────────────────────────

const W   = 780;
const H   = 310;
const PAD = 44;  // inset from canvas edges

// ── Visual config ─────────────────────────────────────────────────────────────

/** Vertical order for node types: regime at top, sectors at bottom. */
const TYPE_ROW: Record<string, number> = {
  regime: 0,
  macro:  1,
  theme:  2,
  sector: 3,
  asset:  4,
};

/** Base fill/stroke/label colors per node type. */
const NODE_STYLE: Record<string, { fill: string; stroke: string; label: string }> = {
  regime: { fill: "#0a1828", stroke: "#4a7098", label: "#8ab0c8" },
  macro:  { fill: "#130e07", stroke: "#7a5818", label: "#b89040" },
  theme:  { fill: "#090f1e", stroke: "#2a5075", label: "#5090b8" },
  sector: { fill: "#070e12", stroke: "#2a5538", label: "#50a870" },
  asset:  { fill: "#0e0a18", stroke: "#4a3870", label: "#8868b0" },
};

/** Override stroke by sentiment for theme/sector nodes. */
const SENTIMENT_STROKE: Record<string, string> = {
  bullish: "#2a5c38",
  bearish: "#5c2828",
  neutral: "#384458",
  mixed:   "#5a4818",
};

/** Edge stroke color by relationship type. */
const EDGE_STROKE: Record<string, string> = {
  drives:       "#807025",
  pressures:    "#803030",
  supports:     "#306038",
  benefits:     "#285870",
  correlates:   "#384860",
  rotates_into: "#583870",
};

// ── Layout ────────────────────────────────────────────────────────────────────

function computeLayout(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const byRow = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const row = TYPE_ROW[n.type] ?? 2;
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row)!.push(n);
  }

  const presentRows = [...byRow.keys()].sort((a, b) => a - b);
  const numRows     = presentRows.length;
  const usableW     = W - PAD * 2;
  const usableH     = H - PAD * 2;
  const rowGap      = numRows > 1 ? usableH / (numRows - 1) : 0;

  const pos = new Map<string, { x: number; y: number }>();
  presentRows.forEach((rowKey, idx) => {
    const rowNodes = byRow.get(rowKey)!;
    const n        = rowNodes.length;
    const y        = PAD + rowGap * idx;
    rowNodes.forEach((node, col) => {
      pos.set(node.id, { x: PAD + (usableW / (n + 1)) * (col + 1), y });
    });
  });
  return pos;
}

function nodeRadius(n: GraphNode): number {
  if (n.type === "regime") return 22;
  if (n.type === "macro")  return 11;
  const base = n.type === "theme" ? 9 : 7;
  return base + (n.confidence / 100) * 15;
}

/** Cubic bezier S-curve for inter-row edges; quadratic arc for same-row. */
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y2 - y1) < 22) {
    // Same row — arc upward
    return `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${y1 - 36} ${x2} ${y2}`;
  }
  const dy = y2 - y1;
  return `M ${x1} ${y1} C ${x1} ${y1 + dy * 0.48} ${x2} ${y2 - dy * 0.48} ${x2} ${y2}`;
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
  } catch {
    return "—";
  }
}

// ── Regime color helper ───────────────────────────────────────────────────────

function regimeColor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("expansion") || l.includes("risk-on") || l.includes("dovish"))
    return "#5a9870";
  if (l.includes("tighten") || l.includes("shock") || l.includes("pressure") ||
      l.includes("risk-off") || l.includes("stagflat"))
    return "#9a6060";
  return "#7080a0";
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipState { node: GraphNode; x: number; y: number }

function NodeTooltip({ t }: { t: TooltipState }) {
  const style = NODE_STYLE[t.node.type] ?? NODE_STYLE.theme;
  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{ left: t.x + 14, top: Math.max(4, t.y - 70), width: 220 }}
    >
      <div
        className="rounded-lg border px-3 py-2.5"
        style={{ background: "#080f1e", borderColor: "rgba(255,255,255,0.10)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[8.5px] font-bold uppercase tracking-widest"
            style={{ color: style.label }}>
            {t.node.type}
          </span>
          <span className="text-[8.5px] text-white/25">
            {t.node.confidence.toFixed(0)} conf
          </span>
        </div>
        <p className="text-[11px] font-semibold text-white/85 leading-tight mb-1">
          {t.node.label}
        </p>
        <p className="text-[9.5px] text-white/40 leading-snug">
          {trunc(t.node.description, 120)}
        </p>
        {t.node.source_count > 0 && (
          <p className="text-[8.5px] text-white/25 mt-1.5">
            {t.node.source_count} contributing stories
          </p>
        )}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <section className="mb-7">
      <div className="flex items-center gap-3 mb-3">
        <Network size={12} className="text-ink-secondary" />
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink">
          Market Narrative Network
        </span>
        <span className="h-px flex-1 bg-edge" />
      </div>
      <div
        className="rounded-xl border animate-pulse"
        style={{ background: "#070d1a", borderColor: "rgba(255,255,255,0.06)", height: 320 }}
      />
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MarketNarrativeNetwork() {
  const { data, isLoading, isFetching } = useNarrativeNetwork();
  const [hoveredId, setHoveredId]           = useState<string | null>(null);
  const [tooltip, setTooltip]               = useState<TooltipState | null>(null);
  const [activeChain, setActiveChain]       = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Compute node positions
  const positions = useMemo(
    () => (data?.nodes ? computeLayout(data.nodes) : new Map()),
    [data?.nodes],
  );

  // Which node/edge IDs belong to the selected propagation chain
  const chainHighlight = useMemo<{ nodeIds: Set<string>; edgeIds: Set<string> }>(() => {
    if (!activeChain || !data) return { nodeIds: new Set(), edgeIds: new Set() };
    const chain = data.chains.find(c => c.id === activeChain);
    if (!chain) return { nodeIds: new Set(), edgeIds: new Set() };
    const nodeIds = new Set(chain.nodes);
    const edgeIds = new Set<string>();
    for (let i = 0; i < chain.nodes.length - 1; i++) {
      const src = chain.nodes[i], tgt = chain.nodes[i + 1];
      data.edges.forEach(e => {
        if (e.source === src && e.target === tgt) edgeIds.add(e.id);
      });
    }
    return { nodeIds, edgeIds };
  }, [activeChain, data]);

  const anyChainActive = activeChain !== null;

  const handleNodeEnter = useCallback((node: GraphNode, e: React.MouseEvent) => {
    setHoveredId(node.id);
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setTooltip({ node, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleNodeLeave = useCallback(() => {
    setHoveredId(null);
    setTooltip(null);
  }, []);

  if (isLoading) return <Skeleton />;
  // Need at least regime + one other node to show the graph
  if (!data || data.nodes.length < 2) return null;

  // ── Edge rendering helper ──────────────────────────────────────────────────
  function renderEdge(edge: GraphEdge) {
    const from = positions.get(edge.source);
    const to   = positions.get(edge.target);
    if (!from || !to) return null;

    const fromNode = data!.nodes.find(n => n.id === edge.source);
    const toNode   = data!.nodes.find(n => n.id === edge.target);
    const fr = fromNode ? nodeRadius(fromNode) : 10;
    const tr = toNode   ? nodeRadius(toNode)   : 10;

    // Trim path endpoints to node boundary
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const sx = from.x + (dx / dist) * fr;
    const sy = from.y + (dy / dist) * fr;
    const ex = to.x   - (dx / dist) * tr;
    const ey = to.y   - (dy / dist) * tr;

    const isHigh = anyChainActive ? chainHighlight.edgeIds.has(edge.id) : false;
    const isDim  = anyChainActive && !isHigh;
    const base   = 0.22 + edge.confidence * 0.42;
    const stroke = EDGE_STROKE[edge.relationship] ?? "#404050";

    return (
      <path
        key={edge.id}
        d={edgePath(sx, sy, ex, ey)}
        stroke={stroke}
        strokeWidth={Math.max(0.7, edge.weight * 2.2)}
        strokeOpacity={isDim ? 0.05 : isHigh ? 0.88 : base}
        fill="none"
        markerEnd="url(#arr)"
        style={{ transition: "stroke-opacity 200ms" }}
      />
    );
  }

  // ── Node rendering helper ──────────────────────────────────────────────────
  function renderNode(node: GraphNode) {
    const pos = positions.get(node.id);
    if (!pos) return null;

    const r         = nodeRadius(node);
    const base      = NODE_STYLE[node.type] ?? NODE_STYLE.theme;
    const stroke    = (node.type === "sector" || node.type === "theme")
      ? (SENTIMENT_STROKE[node.sentiment] ?? base.stroke)
      : base.stroke;

    const isHov  = hoveredId === node.id;
    const isHigh = anyChainActive ? chainHighlight.nodeIds.has(node.id) : false;
    const isDim  = anyChainActive && !isHigh;
    const fill   = node.type === "regime" ? "url(#regGrad)" : base.fill;

    return (
      <g
        key={node.id}
        transform={`translate(${pos.x},${pos.y})`}
        className="cursor-pointer"
        style={{ opacity: isDim ? 0.15 : 1, transition: "opacity 200ms" }}
        onMouseEnter={e => handleNodeEnter(node, e)}
        onMouseLeave={handleNodeLeave}
      >
        <circle
          r={r}
          fill={fill}
          stroke={stroke}
          strokeWidth={isHov || isHigh ? 1.8 : 0.9}
          strokeOpacity={isHov || isHigh ? 0.80 : 0.50}
          style={{ transition: "stroke-width 150ms, stroke-opacity 150ms" }}
        />
        {/* Center dot for small nodes */}
        {r < 14 && <circle r={2} fill={stroke} fillOpacity={0.65} />}
        {/* Label below */}
        <text
          y={r + 11}
          textAnchor="middle"
          fontSize={node.type === "regime" ? 9.5 : 8}
          fontFamily="Inter, system-ui, sans-serif"
          fill={base.label}
          fillOpacity={isDim ? 0.1 : isHov ? 0.92 : 0.60}
          className="pointer-events-none select-none"
          style={{ transition: "fill-opacity 150ms" }}
        >
          {trunc(node.label, node.type === "regime" ? 22 : 15)}
        </text>
      </g>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const presentRelationships = [...new Set(data.edges.map(e => e.relationship))];

  return (
    <section className="mb-7">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-3">
        <Network size={12} className="text-ink-secondary shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink">
          Market Narrative Network
        </span>
        <span className="h-px flex-1 bg-edge" />
        {isFetching && (
          <RefreshCw size={9} className="text-ink-faint animate-spin" />
        )}
        <span className="text-[9px] text-ink-muted tabular-nums">
          {data.nodes.length} nodes · {data.edges.length} edges
        </span>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: "#070d1a", borderColor: "rgba(255,255,255,0.07)" }}
      >
        <div className="flex flex-col md:flex-row">

          {/* ── Graph ───────────────────────────────────────────────────── */}
          <div
            ref={wrapRef}
            className="relative flex-1 overflow-visible"
            style={{ minHeight: 260 }}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full block"
              style={{ overflow: "visible" }}
            >
              <defs>
                <marker id="arr" markerWidth="5" markerHeight="5"
                  refX="4.5" refY="2.5" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,5 L5,2.5 Z" fill="rgba(255,255,255,0.12)" />
                </marker>
                <radialGradient id="regGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor="#16304a" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#080f1c" stopOpacity="1" />
                </radialGradient>
              </defs>

              {/* Edges (rendered below nodes) */}
              {data.edges.map(renderEdge)}

              {/* Nodes */}
              {data.nodes.map(renderNode)}
            </svg>

            {/* Floating tooltip */}
            {tooltip && <NodeTooltip t={tooltip} />}
          </div>

          {/* ── Side panel ──────────────────────────────────────────────── */}
          <div
            className="w-full md:w-52 shrink-0 p-4 flex flex-col gap-5
                       border-t md:border-t-0 md:border-l"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            {/* Dominant regime */}
            <div>
              <p className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-white/22 mb-1.5">
                Dominant Regime
              </p>
              <p
                className="text-[12px] font-semibold leading-snug"
                style={{ color: regimeColor(data.dominant_regime) }}
              >
                {data.dominant_regime}
              </p>
            </div>

            {/* Propagation chains */}
            {data.chains.length > 0 && (
              <div>
                <p className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-white/22 mb-2">
                  Propagation
                </p>
                <div className="flex flex-col gap-1">
                  {data.chains.slice(0, 4).map((chain: PropagationChain) => {
                    const sel = activeChain === chain.id;
                    return (
                      <button
                        key={chain.id}
                        onClick={() => setActiveChain(sel ? null : chain.id)}
                        className="text-left w-full"
                      >
                        <div
                          className="flex items-start gap-2 rounded-md px-2 py-1.5
                                     transition-colors duration-150"
                          style={{
                            background: sel
                              ? "rgba(255,255,255,0.06)"
                              : "transparent",
                          }}
                        >
                          {/* Confidence bar */}
                          <div className="shrink-0 mt-0.5 w-1 rounded-full"
                            style={{
                              height: Math.max(10, (chain.confidence / 100) * 30),
                              background: `rgba(80,160,110,${sel ? 0.7 : 0.35})`,
                            }}
                          />
                          <div className="min-w-0">
                            <p
                              className="text-[10px] font-medium leading-tight truncate"
                              style={{
                                color: sel
                                  ? "rgba(255,255,255,0.82)"
                                  : "rgba(255,255,255,0.48)",
                              }}
                            >
                              {trunc(chain.title, 24)}
                            </p>
                            <p className="text-[8.5px] mt-0.5"
                              style={{ color: "rgba(255,255,255,0.22)" }}>
                              {chain.confidence.toFixed(0)} confidence
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {activeChain && (
                  <p className="text-[8px] text-white/25 mt-2 px-2">
                    {data.chains.find(c => c.id === activeChain)?.summary ?? ""}
                  </p>
                )}
              </div>
            )}

            {/* Freshness */}
            <div
              className="mt-auto pt-3"
              style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
            >
              <p className="text-[8.5px] text-white/22">
                Updated {formatAge(data.generated_at)}
              </p>
              <p className="text-[8px] text-white/16 mt-0.5">
                {data.raw_theme_count} themes · {data.raw_activation_count} industries
              </p>
            </div>
          </div>
        </div>

        {/* ── Legend ──────────────────────────────────────────────────────── */}
        {presentRelationships.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2"
            style={{ borderTop: "1px solid rgba(255,255,255,0.045)" }}
          >
            {presentRelationships.map(rel => (
              <div key={rel} className="flex items-center gap-1.5">
                <svg width="18" height="4" viewBox="0 0 18 4" aria-hidden>
                  <line x1="0" y1="2" x2="18" y2="2"
                    stroke={EDGE_STROKE[rel] ?? "#404050"}
                    strokeWidth="1.5" strokeOpacity="0.65" />
                </svg>
                <span className="text-[8px] text-white/22 capitalize">
                  {rel.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
