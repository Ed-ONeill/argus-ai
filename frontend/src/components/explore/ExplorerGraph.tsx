"use client";

/**
 * components/explore/ExplorerGraph.tsx - Intelligence Network 2.0.
 *
 * Presentation-only redesign of the Explorer's relationship view. The data is
 * still the shared buildRelationshipMap read (no graph-logic changes); this
 * component re-projects it as an institutional relationship map:
 *
 * - type-clustered radial layout: neighbors group into angular sectors by entity
 *   class, stronger relationships sit closer to the focus, so the constellation
 *   reads as structure instead of a decorative ring
 * - small, precise nodes (importance-scaled), a reticle-marked focus node,
 *   radially placed labels with dark halos instead of cartoon pills
 * - edges: curved, thickness = relationship strength, color = relationship type
 * - hover dims everything unrelated; click pins and opens the detail card
 * - filter rail (Companies / Themes / Drivers / Sectors / Stories), mini legend
 *   for node classes and present edge types
 *
 * MarketMetric evidence nodes render under the Stories class so a market-only
 * graph still reads as a map. Dark, dense, precise. No em/en dashes.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";
import { nodeColor, trunc, explorerHrefForNode, type MapNode, type MapVM } from "@/lib/intelligenceShared";

const A = (n: number) => `rgba(255,255,255,${n})`;
const BG = "#070b13";

/* ---- entity classes: filters, clustering order, legend ---- */
type NodeClass = "company" | "theme" | "driver" | "sector" | "story";
const CLASS_OF: Record<string, NodeClass> = {
  Company: "company", ETF: "company",
  Theme: "theme", Narrative: "theme",
  Macro: "driver", MacroSeries: "driver",
  Sector: "sector",
  Story: "story", Podcast: "story", Person: "story", Institution: "story", MarketMetric: "story",
};
const classOf = (t: string): NodeClass => CLASS_OF[t] ?? "story";
const CLASS_ORDER: NodeClass[] = ["company", "theme", "driver", "sector", "story"];
const CLASS_META: Record<NodeClass, { label: string; color: string }> = {
  company: { label: "Companies", color: "#7cc7d8" },
  theme:   { label: "Themes",    color: "#a78bfa" },
  driver:  { label: "Drivers",   color: "#f0b429" },
  sector:  { label: "Sectors",   color: "#34d399" },
  story:   { label: "Stories",   color: "#8ea3b5" },
};
const TYPE_LABEL: Record<string, string> = {
  Company: "Company", ETF: "ETF", Theme: "Theme", Narrative: "Narrative",
  Macro: "Macro Driver", MacroSeries: "Macro Series", Sector: "Sector",
  Story: "Story", Podcast: "Podcast", Person: "Person", Institution: "Institution",
};

/* ---- edge color by relationship type (grouped hues, deterministic) ---- */
const EDGE_COLOR_RULES: Array<[RegExp, string]> = [
  [/driv|impact|caus|lead|transmit/i,          "#f0b429"], // causal
  [/expos|benefit|express|track|belong|has_theme|theme/i, "#52b0c8"], // exposure
  [/compet|disrupt|pressur|risk/i,             "#f87171"], // competitive
  [/correlat|similar|analog|cluster/i,         "#a78bfa"], // statistical
  [/acquir|merg|invest|own|stake|capital/i,    "#c084fc"], // deals / capital
  [/mention|discuss|report|cover|story|episode/i, "#8ea3b5"], // narrative
];
const edgeColor = (type: string): string => {
  for (const [re, c] of EDGE_COLOR_RULES) if (re.test(type)) return c;
  return "#7f95a8";
};

/* ---- deterministic layout: type-clustered radial, strength-weighted radius ---- */
const R_NEAR = 150, R_FAR = 265, R_CHILD = 96, SECTOR_GAP = 0.16;

function hashFrac(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

interface Placed { n: MapNode; x: number; y: number; r: number; angle: number; cls: NodeClass; strength: number }

function layout(map: MapVM, hidden: Set<NodeClass>): { placed: Map<string, Placed>; center: MapNode | null } {
  const center = map.nodes.find(n => n.degree === 0) ?? null;
  const placed = new Map<string, Placed>();
  if (!center) return { placed, center };
  placed.set(center.id, { n: center, x: 0, y: 0, r: 9, angle: 0, cls: classOf(center.type), strength: 100 });

  const strengthTo = (id: string): number => {
    let s = 0;
    for (const e of map.edges) { if (e.a === id || e.b === id) s = Math.max(s, e.strength); }
    return s;
  };

  // First degree, grouped by class, strongest first inside each sector.
  const firsts = map.nodes.filter(n => n.degree === 1 && !hidden.has(classOf(n.type)));
  const groups = CLASS_ORDER
    .map(cls => ({ cls, items: firsts.filter(n => classOf(n.type) === cls).sort((a, b) => strengthTo(b.id) - strengthTo(a.id)) }))
    .filter(g => g.items.length > 0);

  const totalWeight = groups.reduce((s, g) => s + g.items.length, 0);
  const usable = Math.PI * 2 - SECTOR_GAP * groups.length;
  let cursor = -Math.PI / 2;
  for (const g of groups) {
    const span = (g.items.length / totalWeight) * usable;
    g.items.forEach((n, i) => {
      const frac = g.items.length === 1 ? 0.5 : (i + 0.5) / g.items.length;
      const angle = cursor + span * frac + (hashFrac(n.id) - 0.5) * 0.05;
      const s = strengthTo(n.id);
      const radius = R_NEAR + (1 - s / 100) * (R_FAR - R_NEAR) + (hashFrac(n.id + "r") - 0.5) * 22;
      placed.set(n.id, {
        n, angle, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius,
        r: 3.6 + (n.importance / 100) * 4.2, cls: g.cls, strength: s,
      });
    });
    cursor += span + SECTOR_GAP;
  }

  // Second degree: fan out past the parent, along the parent's bearing.
  const seconds = map.nodes.filter(n => n.degree === 2);
  for (const n of seconds) {
    const link = map.edges.find(e => e.a === n.id || e.b === n.id);
    if (!link) continue;
    const parentId = link.a === n.id ? link.b : link.a;
    const parent = placed.get(parentId);
    if (!parent) continue; // parent filtered out -> child hidden too
    const off = (hashFrac(n.id) - 0.5) * 0.5;
    const angle = parent.angle + off;
    const radius = Math.hypot(parent.x, parent.y) + R_CHILD + (hashFrac(n.id + "r") - 0.5) * 26;
    placed.set(n.id, { n, angle, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, r: 2.8, cls: classOf(n.type), strength: link.strength });
  }

  // Deterministic de-overlap: fixed passes nudging non-center nodes apart.
  const list = [...placed.values()].filter(p => p.n.degree !== 0);
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const min = a.r + b.r + 26; // label clearance
        if (dist < min) {
          const push = (min - dist) / 2, ux = dx / dist, uy = dy / dist;
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
        }
      }
    }
  }
  for (const p of list) p.angle = Math.atan2(p.y, p.x);
  return { placed, center };
}

/** Curved edge path with a small perpendicular bow. */
function edgePath(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax, dy = by - ay;
  const dist = Math.hypot(dx, dy) || 1;
  const bow = Math.min(14, dist * 0.06);
  const mx = (ax + bx) / 2 - (dy / dist) * bow;
  const my = (ay + by) / 2 + (dx / dist) * bow;
  return `M${ax.toFixed(1)},${ay.toFixed(1)}Q${mx.toFixed(1)},${my.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
}

export function ExplorerGraph({ map, accent, onNavigate }: {
  map: MapVM;
  accent: string;
  onNavigate: (href: string) => void;
}) {
  const [hidden, setHidden] = useState<Set<NodeClass>>(new Set());
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  const { placed } = useMemo(() => layout(map, hidden), [map, hidden]);

  // Edges whose both endpoints are visible.
  const edges = useMemo(() => map.edges.filter(e => placed.has(e.a) && placed.has(e.b)), [map, placed]);

  // Unpin when the pinned node is filtered away.
  useEffect(() => { if (pinned && !placed.has(pinned)) setPinned(null); }, [placed, pinned]);

  // Auto-fit viewport around the placed constellation, with label headroom and a
  // minimum span so sparse graphs stay dense and precise instead of blowing up.
  const view = useMemo(() => {
    const pts = [...placed.values()];
    if (pts.length === 0) return { x: -320, y: -210, w: 640, h: 420 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p.x - p.r); y0 = Math.min(y0, p.y - p.r);
      x1 = Math.max(x1, p.x + p.r); y1 = Math.max(y1, p.y + p.r);
    }
    const padX = 118, padY = 40;
    let x = x0 - padX, y = y0 - padY, w = x1 - x0 + padX * 2, h = y1 - y0 + padY * 2;
    const MIN_W = 620, MIN_H = 400;
    if (w < MIN_W) { x -= (MIN_W - w) / 2; w = MIN_W; }
    if (h < MIN_H) { y -= (MIN_H - h) / 2; h = MIN_H; }
    return { x, y, w, h };
  }, [placed]);

  const activeId = hoverId ?? pinned;
  const neighborsOf = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      (m.get(e.a) ?? m.set(e.a, new Set()).get(e.a)!).add(e.b);
      (m.get(e.b) ?? m.set(e.b, new Set()).get(e.b)!).add(e.a);
    }
    return m;
  }, [edges]);
  const isLit = (id: string) => !activeId || id === activeId || (neighborsOf.get(activeId)?.has(id) ?? false);

  const focus = activeId ? placed.get(activeId) ?? null : null;
  const focusEdges = useMemo(() => {
    if (!focus) return [];
    return edges
      .filter(e => e.a === focus.n.id || e.b === focus.n.id)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 7);
  }, [focus, edges]);
  const hoveredEdgeVM = hoverEdge ? edges.find(e => e.id === hoverEdge) ?? null : null;

  // Filter chips with counts (counted over the unfiltered map).
  const classCounts = useMemo(() => {
    const m = new Map<NodeClass, number>();
    for (const n of map.nodes) {
      if (n.degree !== 1) continue;
      const c = classOf(n.type);
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [map]);

  const presentEdgeTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of edges) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    return [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0)).slice(0, 5);
  }, [edges]);

  const focusHref = focus && focus.n.degree !== 0 ? explorerHrefForNode(focus.n, nodeColor(focus.n.type)) : null;

  const labelFor = (p: Placed): { x: number; y: number; anchor: "start" | "middle" | "end" } => {
    const c = Math.cos(p.angle), s = Math.sin(p.angle);
    const d = p.r + 7;
    if (Math.abs(c) < 0.25) return { x: p.x, y: p.y + (s > 0 ? d + 8 : -d - 4), anchor: "middle" };
    return { x: p.x + c * d + (c > 0 ? 2 : -2), y: p.y + s * d * 0.4 + 3, anchor: c > 0 ? "start" : "end" };
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {/* filter rail */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b shrink-0 flex-wrap" style={{ borderColor: A(0.07), background: A(0.012) }}>
        <span className="text-[8px] font-black uppercase tracking-[0.18em] mr-1" style={{ color: A(0.3) }}>Filter</span>
        {CLASS_ORDER.filter(c => (classCounts.get(c) ?? 0) > 0).map(c => {
          const off = hidden.has(c);
          return (
            <button key={c}
              onClick={() => setHidden(prev => { const next = new Set(prev); if (next.has(c)) next.delete(c); else next.add(c); return next; })}
              className="flex items-center gap-1.5 text-[8.5px] font-bold uppercase tracking-wide px-2 py-[3px] rounded-sm transition-colors"
              style={off
                ? { color: A(0.3), border: `1px solid ${A(0.07)}`, background: "transparent" }
                : { color: CLASS_META[c].color, border: `1px solid ${CLASS_META[c].color}44`, background: `${CLASS_META[c].color}12` }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: off ? A(0.2) : CLASS_META[c].color }} />
              {CLASS_META[c].label}
              <span className="tabular-nums" style={{ color: off ? A(0.22) : A(0.45) }}>{classCounts.get(c)}</span>
            </button>
          );
        })}
        {hidden.size > 0 && (
          <button onClick={() => setHidden(new Set())} className="text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-[3px] rounded-sm transition-colors hover:bg-white/10" style={{ color: A(0.45) }}>
            Reset
          </button>
        )}
        <span className="ml-auto text-[8px]" style={{ color: A(0.26) }}>hover to trace · click to pin</span>
      </div>

      <div className="relative flex-1 min-h-0">
        <motion.svg initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: "easeOut" }}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="w-full h-full select-none block" preserveAspectRatio="xMidYMid meet"
          onClick={() => setPinned(null)}>
          <defs>
            <radialGradient id="ig2-field" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={accent} stopOpacity={0.05} />
              <stop offset="70%" stopColor={accent} stopOpacity={0.012} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </radialGradient>
            <pattern id="ig2-grid" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.7" fill="#ffffff" fillOpacity="0.05" />
            </pattern>
          </defs>

          {/* field texture + focus glow */}
          <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#ig2-grid)" />
          <circle cx={0} cy={0} r={R_FAR * 1.1} fill="url(#ig2-field)" />
          {/* faint range rings, cropped by the fit */}
          {[R_NEAR, (R_NEAR + R_FAR) / 2, R_FAR].map(r => (
            <circle key={r} cx={0} cy={0} r={r} fill="none" stroke="#ffffff" strokeOpacity={0.028} strokeDasharray="1 5" />
          ))}

          {/* edges: thickness = strength, color = relationship type */}
          {edges.map(e => {
            const pa = placed.get(e.a)!, pb = placed.get(e.b)!;
            const lit = isLit(e.a) && isLit(e.b) && (!activeId || e.a === activeId || e.b === activeId);
            const hot = hoverEdge === e.id;
            const col = edgeColor(e.type);
            const d = edgePath(pa.x, pa.y, pb.x, pb.y);
            return (
              <g key={e.id} onMouseEnter={() => setHoverEdge(e.id)} onMouseLeave={() => setHoverEdge(null)}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
                <path d={d} fill="none"
                  stroke={hot ? accent : col}
                  strokeWidth={(0.5 + (e.strength / 100) * 2.1) * (hot ? 1.5 : 1)}
                  strokeOpacity={activeId ? (lit ? 0.28 + (e.confidence / 100) * 0.5 : 0.03) : 0.1 + (e.confidence / 100) * 0.3}
                  strokeLinecap="round"
                  style={{ transition: "stroke-opacity 180ms ease, stroke 180ms ease" }} />
                {e.evidenceCount > 1 && (
                  <circle cx={(pa.x + pb.x) / 2} cy={(pa.y + pb.y) / 2} r={1.6} fill={col} fillOpacity={lit ? 0.7 : 0.12} style={{ transition: "fill-opacity 180ms ease" }} />
                )}
              </g>
            );
          })}

          {/* nodes */}
          {[...placed.values()].map(p => {
            const isCenter = p.n.degree === 0;
            const lit = isLit(p.n.id);
            const hot = hoverId === p.n.id || pinned === p.n.id;
            const col = isCenter ? accent : nodeColor(p.n.type);
            const lp = labelFor(p);
            const showLabel = isCenter || p.n.degree === 1 || hot || (!!activeId && lit);
            return (
              <g key={p.n.id} style={{ cursor: "pointer" }} opacity={lit ? 1 : 0.14}
                onMouseEnter={() => setHoverId(p.n.id)} onMouseLeave={() => setHoverId(null)}
                onClick={ev => { ev.stopPropagation(); setPinned(prev => (prev === p.n.id ? null : p.n.id)); }}>
                {/* hit target */}
                <circle cx={p.x} cy={p.y} r={Math.max(9, p.r + 5)} fill="transparent" />
                {isCenter ? (
                  <>
                    {/* focus reticle */}
                    <circle cx={p.x} cy={p.y} r={p.r + 7} fill="none" stroke={col} strokeOpacity={0.4} strokeWidth={0.8} strokeDasharray="2.5 4" />
                    {[0, 90, 180, 270].map(deg => (
                      <line key={deg} x1={p.x + Math.cos((deg * Math.PI) / 180) * (p.r + 4)} y1={p.y + Math.sin((deg * Math.PI) / 180) * (p.r + 4)}
                        x2={p.x + Math.cos((deg * Math.PI) / 180) * (p.r + 10)} y2={p.y + Math.sin((deg * Math.PI) / 180) * (p.r + 10)}
                        stroke={col} strokeOpacity={0.75} strokeWidth={1} />
                    ))}
                    <circle cx={p.x} cy={p.y} r={p.r} fill="#0d1420" stroke={col} strokeWidth={1.6} />
                    <circle cx={p.x} cy={p.y} r={2.4} fill={col} />
                  </>
                ) : (
                  <>
                    {hot && <circle cx={p.x} cy={p.y} r={p.r + 5} fill={col} opacity={0.14} />}
                    <circle cx={p.x} cy={p.y} r={hot ? p.r + 0.6 : p.r} fill="#0a0f19" stroke={col}
                      strokeWidth={pinned === p.n.id ? 1.8 : 1.1}
                      style={{ transition: "r 140ms ease" }} />
                    <circle cx={p.x} cy={p.y} r={Math.max(1, p.r * 0.34)} fill={col} opacity={0.85} />
                    {pinned === p.n.id && <circle cx={p.x} cy={p.y} r={p.r + 4} fill="none" stroke={col} strokeWidth={0.8} strokeDasharray="2 2.5" />}
                  </>
                )}
                {showLabel && (
                  <text x={lp.x} y={isCenter ? p.y - p.r - 12 : lp.y} textAnchor={isCenter ? "middle" : lp.anchor}
                    fontSize={isCenter ? 13 : p.n.degree === 1 ? 9 : 7.5}
                    fontWeight={isCenter ? 800 : hot ? 700 : p.n.degree === 1 ? 600 : 500}
                    fill={isCenter ? accent : hot ? "#ffffff" : A(p.n.degree === 2 ? 0.52 : 0.78)}
                    stroke={BG} strokeWidth={3} paintOrder="stroke" strokeLinejoin="round"
                    style={{ transition: "fill 140ms ease" }}>
                    {trunc(p.n.label, isCenter ? 28 : 19)}
                  </text>
                )}
              </g>
            );
          })}
        </motion.svg>

        {/* empty-in-view note (filters removed everything around the focus) */}
        {placed.size <= 1 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-[10px] mt-24 px-3 py-1.5 rounded-sm" style={{ color: A(0.45), background: "rgba(8,12,20,0.85)", border: `1px solid ${A(0.08)}` }}>
              {hidden.size > 0 ? "All connected entities are filtered out. Reset the filter to see the map." : "No connected intelligence identified yet."}
            </p>
          </div>
        )}

        {/* mini legend: node classes + present edge types */}
        <div className="absolute bottom-2 left-3 pointer-events-none space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            {CLASS_ORDER.filter(c => (classCounts.get(c) ?? 0) > 0 && !hidden.has(c)).map(c => (
              <span key={c} className="flex items-center gap-1 text-[7.5px] font-bold uppercase tracking-wider" style={{ color: A(0.38) }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: CLASS_META[c].color, opacity: 0.9 }} />{CLASS_META[c].label}
              </span>
            ))}
          </div>
          {presentEdgeTypes.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              {presentEdgeTypes.map(t => (
                <span key={t} className="flex items-center gap-1 text-[7.5px] font-semibold uppercase tracking-wider" style={{ color: A(0.3) }}>
                  <span className="inline-block w-3 h-[2px] rounded-full" style={{ background: edgeColor(t), opacity: 0.85 }} />{t.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* hovered-edge readout */}
        {hoveredEdgeVM && !focus && (
          <div className="absolute bottom-2 right-3 px-2.5 py-1 rounded-sm pointer-events-none" style={{ background: "rgba(8,12,20,0.92)", border: `1px solid ${A(0.1)}` }}>
            <p className="text-[9px] tabular-nums" style={{ color: A(0.62) }}>
              {hoveredEdgeVM.from.label} <span style={{ color: edgeColor(hoveredEdgeVM.type) }}>{hoveredEdgeVM.type.replace(/_/g, " ")}</span> {hoveredEdgeVM.to.label} · strength {hoveredEdgeVM.strength} · {hoveredEdgeVM.sources} src
            </p>
          </div>
        )}

        {/* detail card: docked right, terminal styling */}
        {focus && (
          <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute top-2 right-2 bottom-2 w-[236px] rounded-sm border flex flex-col overflow-hidden"
            style={{ background: "rgba(7,11,19,0.97)", borderColor: A(0.12), boxShadow: "0 10px 34px rgba(0,0,0,0.6)" }}>
            <div className="flex" style={{ borderBottom: `1px solid ${A(0.07)}` }}>
              <div className="w-[3px] shrink-0" style={{ background: focus.n.degree === 0 ? accent : nodeColor(focus.n.type) }} />
              <div className="flex-1 min-w-0 px-3 pt-2 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[7.5px] font-black uppercase tracking-[0.16em]" style={{ color: focus.n.degree === 0 ? accent : nodeColor(focus.n.type) }}>
                    {TYPE_LABEL[focus.n.type] ?? focus.n.type}
                  </span>
                  {focus.n.degree === 0 && <span className="text-[7px] font-bold uppercase tracking-wide" style={{ color: A(0.32) }}>Focused</span>}
                  {pinned === focus.n.id && <span className="text-[7px] font-bold uppercase tracking-wide" style={{ color: A(0.32) }}>Pinned</span>}
                  {pinned === focus.n.id && (
                    <button onClick={() => setPinned(null)} className="ml-auto p-0.5 rounded-sm transition-colors hover:bg-white/10" style={{ color: A(0.4) }}><X size={10} /></button>
                  )}
                </div>
                <p className="text-[12.5px] font-black leading-tight mt-0.5" style={{ color: A(0.95) }}>{focus.n.label}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 border-b" style={{ borderColor: A(0.07) }}>
              {[["Confidence", focus.n.confidence], ["Importance", focus.n.importance], ["Links", focus.n.relCount]].map(([lbl, v]) => (
                <div key={lbl} className="px-3 py-1.5 border-r last:border-r-0" style={{ borderColor: A(0.05) }}>
                  <p className="text-[11.5px] font-black tabular-nums leading-none" style={{ color: A(0.9) }}>{v}</p>
                  <p className="text-[6.5px] font-bold uppercase tracking-wider mt-0.5" style={{ color: A(0.36) }}>{lbl}</p>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 flex-1 overflow-y-auto scrollbar-hide">
              {focusEdges.length > 0 && (
                <>
                  <p className="text-[7px] font-black uppercase tracking-[0.16em] mb-1.5" style={{ color: A(0.32) }}>Connections</p>
                  <ul className="space-y-1">
                    {focusEdges.map(e => {
                      const other = e.a === focus.n.id ? e.to : e.from;
                      return (
                        <li key={e.id} className="flex items-center gap-1.5 text-[9.5px]" style={{ color: A(0.72) }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: nodeColor(other.type), opacity: 0.9 }} />
                          <span className="truncate" style={{ color: A(0.86) }}>{other.label}</span>
                          <span className="shrink-0 text-[7px] font-semibold uppercase tracking-wide" style={{ color: edgeColor(e.type) }}>{e.type.replace(/_/g, " ")}</span>
                          <span className="ml-auto shrink-0 tabular-nums text-[8.5px] font-bold" style={{ color: A(0.48) }}>{e.strength}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
            {focusHref && (
              <div className="px-3 pb-2.5 pt-1">
                <button onClick={() => onNavigate(focusHref)}
                  className="w-full flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wide py-1.5 rounded-sm transition-colors hover:bg-white/10"
                  style={{ color: "#7cc7d8", border: "1px solid rgba(82,176,200,0.3)", background: "rgba(82,176,200,0.07)" }}>
                  Open in Explorer <ArrowUpRight size={9} />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
