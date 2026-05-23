"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { Network, RefreshCw } from "lucide-react";
import { useNarrativeNetwork } from "@/hooks/useNarrativeNetwork";
import type { GraphNode, GraphEdge, PropagationChain } from "@/lib/types";

// ── SVG canvas constants ──────────────────────────────────────────────────────

const W   = 880;
const H   = 370;
const PAD = 48;

// ── Visual config ─────────────────────────────────────────────────────────────

const TYPE_ROW: Record<string, number> = {
  regime: 0,
  macro:  1,
  theme:  2,
  sector: 3,
  asset:  4,
};

const NODE_STYLE: Record<string, { fill: string; stroke: string; label: string }> = {
  regime: { fill: "#0a1828", stroke: "#5a85b0", label: "#9ac0d8" },
  macro:  { fill: "#130e07", stroke: "#926820", label: "#c8a050" },
  theme:  { fill: "#090f1e", stroke: "#3a6090", label: "#60a0c8" },
  sector: { fill: "#070e12", stroke: "#386848", label: "#60b878" },
  asset:  { fill: "#0e0a18", stroke: "#604898", label: "#9878c0" },
};

const SENTIMENT_STROKE: Record<string, string> = {
  bullish: "#357848",
  bearish: "#783838",
  neutral: "#486070",
  mixed:   "#726020",
};

const EDGE_STROKE: Record<string, string> = {
  drives:       "#a08030",
  pressures:    "#a03838",
  supports:     "#387848",
  benefits:     "#307090",
  correlates:   "#486080",
  rotates_into: "#704890",
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
  if (n.type === "regime") return 30;
  if (n.type === "macro")  return 15;
  const base = n.type === "theme" ? 11 : 9;
  return Math.min(base + (n.confidence / 100) * 18, 28);
}

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y2 - y1) < 22) {
    return `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${y1 - 48} ${x2} ${y2}`;
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
    return "#68b080";
  if (l.includes("tighten") || l.includes("shock") || l.includes("pressure") ||
      l.includes("risk-off") || l.includes("stagflat"))
    return "#b06868";
  return "#8090b0";
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipState { node: GraphNode; x: number; y: number }

function NodeTooltip({ t }: { t: TooltipState }) {
  const style = NODE_STYLE[t.node.type] ?? NODE_STYLE.theme;
  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{ left: t.x + 14, top: Math.max(4, t.y - 70), width: 230 }}
    >
      <div
        className="rounded-lg border px-3 py-2.5"
        style={{ background: "#080f1e", borderColor: "rgba(255,255,255,0.12)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[8.5px] font-bold uppercase tracking-widest"
            style={{ color: style.label }}>
            {t.node.type}
          </span>
          <span className="text-[8.5px] text-white/30">
            {t.node.confidence.toFixed(0)} conf
          </span>
        </div>
        <p className="text-[11.5px] font-semibold text-white/90 leading-tight mb-1">
          {t.node.label}
        </p>
        <p className="text-[9.5px] text-white/45 leading-snug">
          {trunc(t.node.description, 130)}
        </p>
        {t.node.source_count > 0 && (
          <p className="text-[8.5px] text-white/28 mt-1.5">
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
    <section className="mb-5">
      <div className="flex items-center gap-3 mb-3">
        <Network size={12} className="text-ink-secondary" />
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink">
          Market Narrative Network
        </span>
        <span className="h-px flex-1 bg-edge" />
      </div>
      <div
        className="rounded-xl border animate-pulse"
        style={{ background: "#070d1a", borderColor: "rgba(255,255,255,0.06)", height: 370 }}
      />
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MarketNarrativeNetwork() {
  const { data, isLoading, isFetching } = useNarrativeNetwork();
  const [hoveredId, setHoveredId]     = useState<string | null>(null);
  const [tooltip, setTooltip]         = useState<TooltipState | null>(null);
  const [activeChain, setActiveChain] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const positions = useMemo(
    () => (data?.nodes ? computeLayout(data.nodes) : new Map()),
    [data?.nodes],
  );

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
  if (!data || data.nodes.length < 2) return null;

  // ── Edge rendering ──────────────────────────────────────────────────────────
  function renderEdge(edge: GraphEdge) {
    const from = positions.get(edge.source);
    const to   = positions.get(edge.target);
    if (!from || !to) return null;

    const fromNode = data!.nodes.find(n => n.id === edge.source);
    const toNode   = data!.nodes.find(n => n.id === edge.target);
    const fr = fromNode ? nodeRadius(fromNode) : 12;
    const tr = toNode   ? nodeRadius(toNode)   : 12;

    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const sx = from.x + (dx / dist) * fr;
    const sy = from.y + (dy / dist) * fr;
    const ex = to.x   - (dx / dist) * tr;
    const ey = to.y   - (dy / dist) * tr;

    const isHigh = anyChainActive ? chainHighlight.edgeIds.has(edge.id) : false;
    const isDim  = anyChainActive && !isHigh;
    const base   = Math.min(0.38 + edge.confidence * 0.48, 0.82);
    const stroke = EDGE_STROKE[edge.relationship] ?? "#486070";

    return (
      <path
        key={edge.id}
        d={edgePath(sx, sy, ex, ey)}
        stroke={stroke}
        strokeWidth={Math.max(1.2, edge.weight * 3.2)}
        strokeOpacity={isDim ? 0.05 : isHigh ? 0.92 : base}
        fill="none"
        markerEnd="url(#arr)"
        style={{ transition: "stroke-opacity 200ms" }}
      />
    );
  }

  // ── Node rendering ──────────────────────────────────────────────────────────
  function renderNode(node: GraphNode) {
    const pos = positions.get(node.id);
    if (!pos) return null;

    const r        = nodeRadius(node);
    const base     = NODE_STYLE[node.type] ?? NODE_STYLE.theme;
    const stroke   = (node.type === "sector" || node.type === "theme")
      ? (SENTIMENT_STROKE[node.sentiment] ?? base.stroke)
      : base.stroke;

    const isHov    = hoveredId === node.id;
    const isHigh   = anyChainActive ? chainHighlight.nodeIds.has(node.id) : false;
    const isDim    = anyChainActive && !isHigh;
    const fill     = node.type === "regime" ? "url(#regGrad)" : base.fill;
    const isRegime = node.type === "regime";
    const rc       = regimeColor(node.label);

    return (
      <g
        key={node.id}
        transform={`translate(${pos.x},${pos.y})`}
        className="cursor-pointer"
        style={{ opacity: isDim ? 0.12 : 1, transition: "opacity 200ms" }}
        onMouseEnter={e => handleNodeEnter(node, e)}
        onMouseLeave={handleNodeLeave}
      >
        {/* Regime: animated pulse ring */}
        {isRegime && (
          <circle r={r + 5} fill="none" stroke={rc} strokeWidth="1.2" strokeOpacity="0">
            <animate attributeName="r"
              values={`${r + 4};${r + 14};${r + 4}`}
              dur="3.2s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity"
              values="0.55;0;0.55"
              dur="3.2s" repeatCount="indefinite" />
          </circle>
        )}
        {/* Regime: soft glow halo */}
        {isRegime && (
          <circle r={r + 2} fill="none" stroke={rc}
            strokeWidth="4" strokeOpacity="0.14"
            filter="url(#regGlow)" />
        )}
        {/* Main circle */}
        <circle
          r={r}
          fill={fill}
          stroke={stroke}
          strokeWidth={isHov || isHigh ? 2.2 : 1.2}
          strokeOpacity={isHov || isHigh ? 0.90 : 0.65}
          filter={isHov && !isRegime ? "url(#hoverGlow)" : undefined}
          style={{ transition: "stroke-width 150ms, stroke-opacity 150ms" }}
        />
        {/* Center dot for small nodes */}
        {r < 16 && <circle r={2.5} fill={stroke} fillOpacity={0.70} />}
        {/* Label */}
        <text
          y={r + (isRegime ? 14 : 12)}
          textAnchor="middle"
          fontSize={isRegime ? 11.5 : 10}
          fontWeight={isRegime ? 600 : 400}
          fontFamily="Inter, system-ui, sans-serif"
          fill={base.label}
          fillOpacity={isDim ? 0.08 : isHov ? 0.96 : 0.78}
          className="pointer-events-none select-none"
          style={{ transition: "fill-opacity 150ms" }}
        >
          {trunc(node.label, isRegime ? 28 : 20)}
        </text>
      </g>
    );
  }

  const presentRelationships = [...new Set(data.edges.map(e => e.relationship))];
  const sortedChains = [...data.chains].sort((a, b) => b.confidence - a.confidence);

  return (
    <section className="mb-5">
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
        style={{ background: "#070d1a", borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex flex-col md:flex-row">

          {/* ── Graph ───────────────────────────────────────────────────── */}
          <div
            ref={wrapRef}
            className="relative flex-1 overflow-visible"
            style={{ minHeight: 310 }}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full block"
              style={{ overflow: "visible" }}
            >
              <defs>
                <marker id="arr" markerWidth="5" markerHeight="5"
                  refX="4.5" refY="2.5" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,5 L5,2.5 Z" fill="rgba(255,255,255,0.18)" />
                </marker>
                <radialGradient id="regGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor="#1a3854" stopOpacity="0.95" />
                  <stop offset="70%"  stopColor="#0e2038" stopOpacity="0.98" />
                  <stop offset="100%" stopColor="#06101e" stopOpacity="1" />
                </radialGradient>
                {/* Soft blur glow for regime node halo */}
                <filter id="regGlow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                {/* Subtle hover glow for non-regime nodes */}
                <filter id="hoverGlow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Edges (below nodes) */}
              {data.edges.map(renderEdge)}

              {/* Nodes */}
              {data.nodes.map(renderNode)}
            </svg>

            {tooltip && <NodeTooltip t={tooltip} />}
          </div>

          {/* ── Side panel ──────────────────────────────────────────────── */}
          <div
            className="w-full md:w-44 shrink-0 p-4 flex flex-col gap-4
                       border-t md:border-t-0 md:border-l"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            {/* Dominant regime */}
            <div>
              <p className="text-[8px] font-bold uppercase tracking-[0.20em] text-white/22 mb-1.5">
                Dominant Regime
              </p>
              <p
                className="text-[12.5px] font-semibold leading-snug"
                style={{ color: regimeColor(data.dominant_regime) }}
              >
                {data.dominant_regime}
              </p>
            </div>

            {/* Propagation chains — sorted highest confidence first */}
            {sortedChains.length > 0 && (
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[0.20em] text-white/22 mb-2">
                  Propagation
                </p>
                <div className="flex flex-col gap-0.5">
                  {sortedChains.slice(0, 4).map((chain: PropagationChain, idx: number) => {
                    const sel   = activeChain === chain.id;
                    const isTop = idx === 0;
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
                              ? "rgba(255,255,255,0.07)"
                              : isTop && !activeChain
                              ? "rgba(255,255,255,0.025)"
                              : "transparent",
                          }}
                        >
                          {/* Confidence bar — wider and brighter for top chain */}
                          <div
                            className="shrink-0 mt-0.5 rounded-full"
                            style={{
                              width:    isTop ? 3 : 2,
                              height:   Math.max(12, (chain.confidence / 100) * 34),
                              background: isTop
                                ? `rgba(80,170,120,${sel ? 0.88 : 0.55})`
                                : `rgba(80,150,110,${sel ? 0.72 : 0.30})`,
                            }}
                          />
                          <div className="min-w-0">
                            <p
                              className="leading-tight truncate"
                              style={{
                                fontSize:   isTop ? 10.5 : 9.5,
                                fontWeight: isTop ? 500 : 400,
                                color: sel
                                  ? "rgba(255,255,255,0.88)"
                                  : isTop
                                  ? "rgba(255,255,255,0.62)"
                                  : "rgba(255,255,255,0.40)",
                              }}
                            >
                              {trunc(chain.title, 24)}
                            </p>
                            <p className="text-[8px] mt-0.5"
                              style={{ color: "rgba(255,255,255,0.24)" }}>
                              {chain.confidence.toFixed(0)}% conf
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {activeChain && (
                  <p className="text-[8px] text-white/28 mt-2 px-2 leading-snug">
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
              <p className="text-[8.5px] text-white/24">
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
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
          >
            {presentRelationships.map(rel => (
              <div key={rel} className="flex items-center gap-1.5">
                <svg width="18" height="4" viewBox="0 0 18 4" aria-hidden>
                  <line x1="0" y1="2" x2="18" y2="2"
                    stroke={EDGE_STROKE[rel] ?? "#486070"}
                    strokeWidth="1.8" strokeOpacity="0.70" />
                </svg>
                <span className="text-[8px] text-white/28 capitalize">
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
