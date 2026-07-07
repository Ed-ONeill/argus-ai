"use client";

/**
 * components/explore/ExplorerGraph.tsx - the Intelligence Network tab of the
 * Intelligence Explorer (/explore/[entity]).
 *
 * Renders the same deterministic radial relationship map the Intelligence Drawer
 * builds (lib/intelligenceShared.buildRelationshipMap), presented as a terminal-
 * grade network: the viewport auto-fits the constellation (no dead space), edges
 * are curved transmission paths colored by the counterpart entity and weighted by
 * strength, nodes carry type-colored rings with legible label pills, and a detail
 * panel docks right on hover or click. Read-only presentation of the shared graph
 * singleton; no engine logic. No em/en dashes.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { nodeColor, NODE_COLOR, trunc, explorerHrefForNode, type MapEdge, type MapVM } from "@/lib/intelligenceShared";

const A = (n: number) => `rgba(255,255,255,${n})`;

/** Friendly type names for the legend and detail panel. */
const TYPE_LABEL: Record<string, string> = {
  Company: "Company", ETF: "ETF", Theme: "Theme", Narrative: "Narrative",
  Macro: "Macro Driver", MacroSeries: "Macro Series", Sector: "Sector",
  Story: "Story", Podcast: "Podcast", Person: "Person", Institution: "Institution",
  MarketMetric: "Market Metric",
};
const typeLabel = (t: string) => TYPE_LABEL[t] ?? t;

/** Curved edge path: a quadratic bow perpendicular to the segment midpoint. */
function edgePath(e: MapEdge): string {
  const dx = e.to.x - e.from.x, dy = e.to.y - e.from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const bow = Math.min(22, dist * 0.09);
  const mx = (e.from.x + e.to.x) / 2 - (dy / dist) * bow;
  const my = (e.from.y + e.to.y) / 2 + (dx / dist) * bow;
  return `M${e.from.x.toFixed(1)},${e.from.y.toFixed(1)}Q${mx.toFixed(1)},${my.toFixed(1)} ${e.to.x.toFixed(1)},${e.to.y.toFixed(1)}`;
}

export function ExplorerGraph({ map, accent, onNavigate }: {
  map: MapVM;
  accent: string;
  /** Fired with the /explore href of a navigable node from the detail panel. */
  onNavigate: (href: string) => void;
}) {
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  // Auto-fit viewport: crop to the constellation's bounds so the network fills
  // the canvas instead of floating in empty space.
  const view = useMemo(() => {
    if (map.nodes.length === 0) return { x: 0, y: 0, w: map.width, h: map.height };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of map.nodes) {
      x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r);
      x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r);
    }
    const padX = 70, padY = 46; // room for label pills
    return { x: x0 - padX, y: y0 - padY, w: x1 - x0 + padX * 2, h: y1 - y0 + padY * 2 };
  }, [map]);

  const activeId = hoverNode ?? pinned;
  const focus = useMemo(() => (activeId ? map.nodes.find(n => n.id === activeId) ?? null : null), [activeId, map]);
  const focusEdges = useMemo(() => {
    if (!focus) return [];
    return map.edges
      .filter(e => e.a === focus.id || e.b === focus.id)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 6)
      .map(e => ({ edge: e, other: e.a === focus.id ? e.to : e.from }));
  }, [focus, map]);
  const hoveredEdgeVM = hoverEdge ? map.edges.find(e => e.id === hoverEdge) ?? null : null;

  const connectedTo = (id: string, other: string) =>
    id === other || map.edges.some(e => (e.a === id && e.b === other) || (e.b === id && e.a === other));

  const presentTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const n of map.nodes) seen.add(n.type === "ETF" ? "Company" : n.type === "Narrative" ? "Theme" : n.type === "MacroSeries" ? "Macro" : n.type);
    return ["Company", "Theme", "Macro", "Sector", "Story"].filter(t => seen.has(t));
  }, [map]);

  const focusHref = focus && focus.degree !== 0 ? explorerHrefForNode(focus, nodeColor(focus.type)) : null;

  return (
    <div className="relative flex-1 min-h-0">
      <motion.svg initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease: "easeOut" }}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="w-full h-full select-none block" preserveAspectRatio="xMidYMid meet"
        onClick={() => setPinned(null)}>
        <defs>
          <radialGradient id="xg-center" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accent} stopOpacity={0.14} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* soft field glow behind the focused entity anchors the constellation */}
        <circle cx={map.cx} cy={map.cy} r={map.r2 * 0.9} fill="url(#xg-center)" />
        <circle cx={map.cx} cy={map.cy} r={map.r1} fill="none" stroke="#ffffff" strokeOpacity={0.04} />
        <circle cx={map.cx} cy={map.cy} r={map.r2} fill="none" stroke="#ffffff" strokeOpacity={0.025} />

        {/* edges: curved transmission paths, colored by the counterpart entity */}
        {map.edges.map(e => {
          const counterpart = e.from.degree === 0 ? e.to : e.to.degree > e.from.degree ? e.to : e.from;
          const col = nodeColor(counterpart.type);
          const on = !activeId || e.a === activeId || e.b === activeId;
          const hot = hoverEdge === e.id;
          const d = edgePath(e);
          const mx = (e.from.x + e.to.x) / 2, my = (e.from.y + e.to.y) / 2;
          return (
            <g key={e.id} onMouseEnter={() => setHoverEdge(e.id)} onMouseLeave={() => setHoverEdge(null)}>
              <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
              <path d={d} fill="none"
                stroke={hot ? accent : col}
                strokeWidth={(1.2 + (e.strength / 100) * 3.2) * (hot ? 1.3 : 1)}
                strokeOpacity={on ? (activeId ? 0.3 : 0.16) + (e.confidence / 100) * 0.4 : 0.04}
                strokeLinecap="round"
                style={{ transition: "stroke-opacity 200ms ease, stroke 200ms ease" }} />
              {e.evidenceCount > 1 && (
                <circle cx={mx} cy={my} r={Math.min(4.4, 1.6 + e.evidenceCount * 0.5)} fill={col} fillOpacity={on ? 0.5 : 0.06} style={{ transition: "fill-opacity 200ms ease" }} />
              )}
              {hot && (
                <g transform={`translate(${mx},${my - 14})`} pointerEvents="none">
                  <rect x={-(e.type.length * 3.4 + 10)} y={-9} width={e.type.length * 6.8 + 20} height={17} rx={8} fill="rgba(8,12,20,0.94)" stroke={A(0.16)} />
                  <text textAnchor="middle" y={3.5} fontSize={9} fontWeight={700} fill={accent} style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                    {e.type.replace(/_/g, " ")} · {e.strength}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* nodes: type-colored rings around dark glass bodies, labels in pills */}
        {map.nodes.map(node => {
          const isCenter = node.degree === 0;
          const connected = !activeId || connectedTo(activeId, node.id);
          const hot = hoverNode === node.id || pinned === node.id;
          const col = isCenter ? accent : nodeColor(node.type);
          const showLabel = node.degree < 2 || hot || (!!activeId && connected);
          const label = trunc(node.label, isCenter ? 26 : 17);
          const fs = isCenter ? 13.5 : node.degree === 1 ? 10.5 : 9;
          const pillW = label.length * fs * 0.62 + 16;
          const pillY = node.y + node.r + 8;
          return (
            <g key={node.id} style={{ cursor: "pointer" }}
              onMouseEnter={() => setHoverNode(node.id)} onMouseLeave={() => setHoverNode(null)}
              onClick={ev => { ev.stopPropagation(); setPinned(p => (p === node.id ? null : node.id)); }}>
              {/* halo */}
              <circle cx={node.x} cy={node.y} r={node.r + (hot ? 10 : 6)} fill={col} opacity={hot ? 0.16 : isCenter ? 0.1 : 0.05} style={{ transition: "opacity 200ms ease, r 200ms ease" }} />
              {/* body + ring */}
              <circle cx={node.x} cy={node.y} r={node.r} fill={isCenter ? "#0e1520" : "#0a0e17"} stroke={col}
                strokeWidth={isCenter ? 3 : hot ? 2.8 : 2}
                opacity={connected ? 1 : 0.18}
                style={{ transition: "opacity 220ms ease, stroke-width 160ms ease" }} />
              {/* inner core dot encodes importance */}
              <circle cx={node.x} cy={node.y} r={Math.max(2, node.r * (0.18 + node.importance / 100 * 0.2))} fill={col} opacity={connected ? 0.75 : 0.12} style={{ transition: "opacity 220ms ease" }} />
              {/* pinned marker ring */}
              {pinned === node.id && <circle cx={node.x} cy={node.y} r={node.r + 4} fill="none" stroke={col} strokeWidth={1.2} strokeDasharray="3 3" />}
              {/* label pill */}
              {showLabel && (
                <g opacity={connected ? 1 : 0.25} style={{ transition: "opacity 220ms ease" }} pointerEvents="none">
                  <rect x={node.x - pillW / 2} y={pillY} width={pillW} height={fs + 9} rx={(fs + 9) / 2}
                    fill="rgba(7,11,19,0.88)" stroke={hot ? col : A(0.1)} strokeWidth={hot ? 1 : 0.75} />
                  <text x={node.x} y={pillY + fs + 2} textAnchor="middle" fontSize={fs}
                    fontWeight={isCenter ? 800 : node.degree === 1 ? 600 : 500}
                    fill={isCenter ? accent : A(node.degree === 2 ? 0.62 : 0.86)}>{label}</text>
                </g>
              )}
            </g>
          );
        })}
      </motion.svg>

      {/* legend, bottom-left */}
      <div className="absolute bottom-3 left-4 flex items-center gap-3.5 flex-wrap pointer-events-none">
        {presentTypes.map(t => (
          <span key={t} className="flex items-center gap-1.5 text-[8.5px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>
            <span className="w-2 h-2 rounded-full" style={{ background: NODE_COLOR[t], opacity: 0.85 }} />{t === "Macro" ? "Driver" : t}
          </span>
        ))}
      </div>

      {/* hovered-edge readout, bottom-right (when no node panel is showing) */}
      {hoveredEdgeVM && !focus && (
        <div className="absolute bottom-3 right-4 px-3 py-1.5 rounded-md pointer-events-none" style={{ background: "rgba(8,12,20,0.9)", border: `1px solid ${A(0.1)}` }}>
          <p className="text-[9.5px] tabular-nums" style={{ color: A(0.6) }}>
            {hoveredEdgeVM.from.label} <span style={{ color: accent }}>{hoveredEdgeVM.type.replace(/_/g, " ")}</span> {hoveredEdgeVM.to.label} · strength {hoveredEdgeVM.strength} · {hoveredEdgeVM.sources} source{hoveredEdgeVM.sources === 1 ? "" : "s"}
          </p>
        </div>
      )}

      {/* right-docked detail panel on hover / pin */}
      {focus && (
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}
          className="absolute top-3 right-3 bottom-3 w-[240px] rounded-lg border flex flex-col overflow-hidden"
          style={{ background: "rgba(8,12,20,0.96)", borderColor: A(0.12), boxShadow: "0 14px 40px rgba(0,0,0,0.55)" }}>
          <div className="px-3.5 pt-3 pb-2.5 border-b" style={{ borderColor: A(0.07) }}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: focus.degree === 0 ? accent : nodeColor(focus.type), boxShadow: `0 0 8px ${focus.degree === 0 ? accent : nodeColor(focus.type)}88` }} />
              <span className="text-[8.5px] font-bold uppercase tracking-[0.14em]" style={{ color: focus.degree === 0 ? accent : nodeColor(focus.type) }}>{typeLabel(focus.type)}</span>
              {focus.degree === 0 && <span className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: A(0.35) }}>Focused</span>}
              {pinned === focus.id && <span className="ml-auto text-[8px] font-semibold uppercase tracking-wide" style={{ color: A(0.35) }}>Pinned</span>}
            </div>
            <p className="text-[13px] font-black leading-tight" style={{ color: A(0.95) }}>{focus.label}</p>
          </div>
          <div className="px-3.5 py-2.5 grid grid-cols-3 gap-2 border-b" style={{ borderColor: A(0.07) }}>
            <div><p className="text-[12px] font-black tabular-nums leading-none" style={{ color: A(0.9) }}>{focus.confidence}</p><p className="text-[7px] font-bold uppercase tracking-wider mt-0.5" style={{ color: A(0.38) }}>Confidence</p></div>
            <div><p className="text-[12px] font-black tabular-nums leading-none" style={{ color: A(0.9) }}>{focus.importance}</p><p className="text-[7px] font-bold uppercase tracking-wider mt-0.5" style={{ color: A(0.38) }}>Importance</p></div>
            <div><p className="text-[12px] font-black tabular-nums leading-none" style={{ color: A(0.9) }}>{focus.relCount}</p><p className="text-[7px] font-bold uppercase tracking-wider mt-0.5" style={{ color: A(0.38) }}>Links</p></div>
          </div>
          <div className="px-3.5 py-2.5 flex-1 overflow-y-auto scrollbar-hide">
            {focusEdges.length > 0 && (
              <>
                <p className="text-[7.5px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: A(0.34) }}>Strongest Connections</p>
                <ul className="space-y-1.5">
                  {focusEdges.map(({ edge, other }) => (
                    <li key={edge.id} className="flex items-center gap-1.5 text-[10px]" style={{ color: A(0.75) }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: nodeColor(other.type), opacity: 0.85 }} />
                      <span className="truncate" style={{ color: A(0.88) }}>{other.label}</span>
                      <span className="shrink-0 text-[7.5px] font-semibold uppercase tracking-wide" style={{ color: A(0.4) }}>{edge.type.replace(/_/g, " ")}</span>
                      <span className="ml-auto shrink-0 tabular-nums text-[9px] font-bold" style={{ color: A(0.5) }}>{edge.strength}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {focusHref && (
            <div className="px-3.5 pb-3 pt-1">
              <button onClick={() => onNavigate(focusHref)}
                className="w-full flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide py-1.5 rounded transition-colors hover:bg-white/10"
                style={{ color: "#7cc7d8", border: "1px solid rgba(82,176,200,0.3)", background: "rgba(82,176,200,0.08)" }}>
                Open in Explorer <ArrowUpRight size={10} />
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* idle hint */}
      {!focus && !hoveredEdgeVM && (
        <div className="absolute bottom-3 right-4 pointer-events-none">
          <p className="text-[9px]" style={{ color: A(0.3) }}>Hover a node for details · click to pin</p>
        </div>
      )}
    </div>
  );
}
