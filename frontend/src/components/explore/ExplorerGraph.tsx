"use client";

/**
 * components/explore/ExplorerGraph.tsx - Intelligence Network 2.0 (Sprint 2):
 * a layered causal market map.
 *
 * Presentation only: it consumes the same shared MapVM (buildRelationshipMap)
 * and re-projects it as market transmission read left to right:
 *
 *   Drivers -> Themes -> Sectors -> Companies -> Evidence (stories + metrics)
 *
 * - deterministic layered layout (no physics): nodes are assigned a causal
 *   column by entity class, then ordered inside each column with barycenter
 *   sweeps so edges cross as little as possible
 * - edges are horizontal transmission curves: thickness = strength, opacity =
 *   confidence + source count, color = relationship type, with subtle arrows
 *   pointing downstream along the causal order
 * - hover dims everything unrelated and explains the relationship; click pins
 *   the detail panel (type, confidence, importance, strongest connections,
 *   evidence count, related stories)
 * - filter rail (six entity classes), search-in-graph, Reset View, and Expand
 *   Neighbors when the underlying graph holds more connections than shown
 *
 * Nothing here invents relationships; sparse graphs collapse naturally into a
 * compact transmission chain. Dark, dense, institutional. No em/en dashes.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Search, X } from "lucide-react";
import { trunc, explorerHrefForNode, type MapNode, type MapEdge, type MapVM } from "@/lib/intelligenceShared";

const A = (n: number) => `rgba(255,255,255,${n})`;
const BG = "#070b13";

/* ---- entity classes -> causal layers ---- */
type NodeClass = "driver" | "theme" | "sector" | "company" | "story" | "metric";
const CLASS_OF: Record<string, NodeClass> = {
  Macro: "driver", MacroSeries: "driver",
  Theme: "theme", Narrative: "theme",
  Sector: "sector",
  Company: "company", ETF: "company",
  Story: "story", Podcast: "story", Person: "story", Institution: "story",
  MarketMetric: "metric",
};
const classOf = (t: string): NodeClass => CLASS_OF[t] ?? "story";
const CLASS_ORDER: NodeClass[] = ["driver", "theme", "sector", "company", "story", "metric"];
const CLASS_META: Record<NodeClass, { label: string; color: string }> = {
  driver:  { label: "Drivers",        color: "#f0b429" },
  theme:   { label: "Themes",         color: "#a78bfa" },
  sector:  { label: "Sectors",        color: "#34d399" },
  company: { label: "Companies",      color: "#7cc7d8" },
  story:   { label: "Stories",        color: "#8ea3b5" },
  metric:  { label: "Market Metrics", color: "#64748b" },
};
// Causal column per class; stories and metrics share the evidence column.
const LAYER_OF: Record<NodeClass, number> = { driver: 0, theme: 1, sector: 2, company: 3, story: 4, metric: 4 };
const TYPE_LABEL: Record<string, string> = {
  Company: "Company", ETF: "ETF", Theme: "Theme", Narrative: "Narrative",
  Macro: "Macro Driver", MacroSeries: "Macro Series", Sector: "Sector",
  Story: "Story", Podcast: "Podcast", Person: "Person", Institution: "Institution",
  MarketMetric: "Market Metric",
};

/* ---- edge color by relationship type ---- */
const EDGE_COLORS: Array<{ key: string; re: RegExp; color: string }> = [
  { key: "drives",   re: /driv|impact|caus|lead|transmit/i,             color: "#f0b429" },
  { key: "supports", re: /support|confirm|strengthen|validat/i,         color: "#34d399" },
  { key: "weakens",  re: /weaken|contradict|revers|disrupt|pressur/i,   color: "#f87171" },
  { key: "exposed",  re: /expos|benefit|express|track|belong|theme/i,   color: "#52b0c8" },
  { key: "mentions", re: /mention|discuss|report|cover|story|episode/i, color: "#8ea3b5" },
  { key: "stat",     re: /correlat|similar|analog|cluster/i,            color: "#a78bfa" },
  { key: "metric",   re: /market_metric/i,                              color: "#64748b" },
];
const DEFAULT_EDGE = { key: "other", color: "#7f95a8" };
const edgeMeta = (type: string): { key: string; color: string } => {
  for (const e of EDGE_COLORS) if (e.re.test(type)) return e;
  return DEFAULT_EDGE;
};

/* ---- deterministic layered layout ---- */
const LAY_W = 960, PAD_L = 96, PAD_R = 170, PAD_T = 34, PAD_B = 30;
const MIN_H = 380, MAX_H = 660;

interface Placed { n: MapNode; x: number; y: number; r: number; cls: NodeClass; layer: number }
interface Laid { placed: Map<string, Placed>; height: number }

function layeredLayout(map: MapVM, hidden: Set<NodeClass>): Laid {
  const center = map.nodes.find(n => n.degree === 0) ?? null;
  const placed = new Map<string, Placed>();
  if (!center) return { placed, height: MIN_H };

  // Visible nodes: center always; others when their class is not filtered and they
  // still connect to something visible (no floating orphans).
  const candidates = map.nodes.filter(n => n.degree !== 0 && !hidden.has(classOf(n.type)));
  const candidateIds = new Set([center.id, ...candidates.map(n => n.id)]);
  const connected = new Set<string>([center.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of map.edges) {
      if (!candidateIds.has(e.a) || !candidateIds.has(e.b)) continue;
      if (connected.has(e.a) && !connected.has(e.b)) { connected.add(e.b); grew = true; }
      if (connected.has(e.b) && !connected.has(e.a)) { connected.add(e.a); grew = true; }
    }
  }
  const nodes = [center, ...candidates.filter(n => connected.has(n.id))];

  // Group into causal columns (only present columns take horizontal space).
  const byLayer = new Map<number, MapNode[]>();
  for (const n of nodes) {
    const l = LAYER_OF[classOf(n.type)];
    (byLayer.get(l) ?? byLayer.set(l, []).get(l)!).push(n);
  }
  const layers = [...byLayer.keys()].sort((a, b) => a - b);
  const xOfLayer = new Map<number, number>();
  layers.forEach((l, i) => {
    xOfLayer.set(l, layers.length === 1 ? LAY_W / 2 : PAD_L + (i * (LAY_W - PAD_L - PAD_R)) / (layers.length - 1));
  });

  // Neighbor map for barycenter ordering.
  const neigh = new Map<string, string[]>();
  for (const e of map.edges) {
    if (!connected.has(e.a) || !connected.has(e.b)) continue;
    (neigh.get(e.a) ?? neigh.set(e.a, []).get(e.a)!).push(e.b);
    (neigh.get(e.b) ?? neigh.set(e.b, []).get(e.b)!).push(e.a);
  }

  // Initial order: importance desc, stable by id. Then barycenter sweeps: order
  // each column by the mean position of its neighbors so edges cross less.
  const order = new Map<number, MapNode[]>();
  for (const l of layers) {
    order.set(l, [...byLayer.get(l)!].sort((a, b) => (b.importance - a.importance) || a.id.localeCompare(b.id)));
  }
  const posOf = (): Map<string, number> => {
    const m = new Map<string, number>();
    for (const l of layers) order.get(l)!.forEach((n, i) => m.set(n.id, i));
    return m;
  };
  for (let sweep = 0; sweep < 3; sweep++) {
    const dirs = sweep % 2 === 0 ? layers : [...layers].reverse();
    for (const l of dirs) {
      const pos = posOf();
      const col = order.get(l)!;
      const bary = (n: MapNode): number => {
        const ns = (neigh.get(n.id) ?? []).map(id => pos.get(id)).filter((v): v is number => v !== undefined);
        return ns.length ? ns.reduce((s, v) => s + v, 0) / ns.length : pos.get(n.id) ?? 0;
      };
      col.sort((a, b) => (bary(a) - bary(b)) || a.id.localeCompare(b.id));
    }
  }
  // Keep the focused entity vertically centered inside its column.
  const centerLayer = LAYER_OF[classOf(center.type)];
  const centerCol = order.get(centerLayer)!;
  const ci = centerCol.findIndex(n => n.id === center.id);
  if (ci >= 0) { centerCol.splice(ci, 1); centerCol.splice(Math.floor(centerCol.length / 2), 0, center); }

  // Vertical spacing per column; the tallest column sets the canvas height.
  const maxCount = Math.max(...layers.map(l => order.get(l)!.length));
  const gap = Math.max(26, Math.min(46, (MAX_H - PAD_T - PAD_B) / Math.max(1, maxCount - 1 || 1)));
  const height = Math.max(MIN_H, Math.min(MAX_H, PAD_T + PAD_B + gap * Math.max(1, maxCount - 1) + 60));

  for (const l of layers) {
    const col = order.get(l)!;
    const colH = gap * (col.length - 1);
    col.forEach((n, i) => {
      const cls = classOf(n.type);
      const isCenter = n.id === center.id;
      const r = isCenter ? 8
        : cls === "metric" ? 2.6
        : 3 + (n.importance / 100) * 3.6 + (n.confidence / 100) * 1.4;
      placed.set(n.id, { n, cls, layer: l, r, x: xOfLayer.get(l)!, y: height / 2 - colH / 2 + i * gap });
    });
  }
  return { placed, height };
}

/** Transmission curve between columns; vertical arc inside a column. */
function edgePath(pa: Placed, pb: Placed): string {
  if (pa.layer === pb.layer) {
    const bow = pa.layer >= 3 ? 26 : -26; // arc outward, away from the middle
    const mx = pa.x + bow;
    return `M${pa.x},${pa.y}C${mx},${pa.y} ${mx},${pb.y} ${pb.x},${pb.y}`;
  }
  const [f, t] = pa.x <= pb.x ? [pa, pb] : [pb, pa];
  const dx = (t.x - f.x) * 0.42;
  return `M${f.x},${f.y}C${f.x + dx},${f.y} ${t.x - dx},${t.y} ${t.x},${t.y}`;
}

export function ExplorerGraph({ map, accent, onNavigate, onExpand, canExpandCount }: {
  map: MapVM;
  accent: string;
  onNavigate: (href: string) => void;
  /** Re-layout with more neighbors (page widens the map limits). */
  onExpand?: () => void;
  /** How many additional connections the graph holds beyond what is shown. */
  canExpandCount?: number;
}) {
  const [hidden, setHidden] = useState<Set<NodeClass>>(new Set());
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const { placed, height } = useMemo(() => layeredLayout(map, hidden), [map, hidden]);
  const edges = useMemo(() => map.edges.filter(e => placed.has(e.a) && placed.has(e.b)), [map, placed]);

  useEffect(() => { if (pinned && !placed.has(pinned)) setPinned(null); }, [placed, pinned]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q ? new Set([...placed.keys()].filter(id => placed.get(id)!.n.label.toLowerCase().includes(q))) : null), [q, placed]);

  const activeId = hoverId ?? pinned;
  const neighborsOf = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      (m.get(e.a) ?? m.set(e.a, new Set()).get(e.a)!).add(e.b);
      (m.get(e.b) ?? m.set(e.b, new Set()).get(e.b)!).add(e.a);
    }
    return m;
  }, [edges]);
  const isLit = (id: string): boolean => {
    if (matches) return matches.has(id);
    if (!activeId) return true;
    return id === activeId || (neighborsOf.get(activeId)?.has(id) ?? false);
  };

  const focus = activeId ? placed.get(activeId) ?? null : null;
  const focusEdges = useMemo(() => {
    if (!focus) return [] as Array<{ edge: MapEdge; other: MapNode }>;
    return edges
      .filter(e => e.a === focus.n.id || e.b === focus.n.id)
      .sort((a, b) => b.strength - a.strength)
      .map(e => ({ edge: e, other: e.a === focus.n.id ? e.to : e.from }));
  }, [focus, edges]);
  // "Reason": the strongest upstream link explains why this node is on the map.
  const focusReason = useMemo(() => {
    if (!focus || focus.n.degree === 0) return null;
    const upstream = focusEdges.find(x => (placed.get(x.other.id)?.layer ?? 99) < focus.layer) ?? focusEdges[0];
    return upstream ? { other: upstream.other, type: upstream.edge.type, strength: upstream.edge.strength } : null;
  }, [focus, focusEdges, placed]);
  const focusStories = useMemo(() => focusEdges.filter(x => classOf(x.other.type) === "story").slice(0, 3), [focusEdges]);
  const focusEvidence = useMemo(() => focusEdges.reduce((s, x) => s + x.edge.evidenceCount, 0), [focusEdges]);
  const hoveredEdgeVM = hoverEdge ? edges.find(e => e.id === hoverEdge) ?? null : null;

  const classCounts = useMemo(() => {
    const m = new Map<NodeClass, number>();
    for (const n of map.nodes) {
      if (n.degree === 0) continue;
      const c = classOf(n.type);
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [map]);
  const presentEdgeKeys = useMemo(() => {
    const seen = new Map<string, { key: string; color: string; label: string }>();
    for (const e of edges) {
      const meta = edgeMeta(e.type);
      if (!seen.has(meta.key)) seen.set(meta.key, { ...meta, label: e.type.replace(/_/g, " ") });
    }
    return [...seen.values()].slice(0, 6);
  }, [edges]);

  const dirty = hidden.size > 0 || pinned !== null || q.length > 0;
  const resetView = () => { setHidden(new Set()); setPinned(null); setQuery(""); setHoverId(null); setHoverEdge(null); };

  const focusHref = focus && focus.n.degree !== 0 ? explorerHrefForNode(focus.n, CLASS_META[focus.cls].color) : null;

  // Label anchoring: evidence column reads right-to-left, everything else leftward.
  const labelFor = (p: Placed): { x: number; anchor: "start" | "end" } =>
    p.layer >= 4 ? { x: p.x + p.r + 6, anchor: "start" } : p.layer === 0 ? { x: p.x - p.r - 6, anchor: "end" } : { x: p.x + p.r + 6, anchor: "start" };

  const arrowFor = (e: MapEdge): { d: string; color: string } | null => {
    const pa = placed.get(e.a)!, pb = placed.get(e.b)!;
    if (pa.layer === pb.layer) return null;
    const [, t] = pa.x <= pb.x ? [pa, pb] : [pb, pa];
    // small chevron just before the downstream node
    const dx = -(t.r + 4);
    return { d: `M${t.x + dx - 4},${t.y - 3.4}L${t.x + dx},${t.y}L${t.x + dx - 4},${t.y + 3.4}`, color: edgeMeta(e.type).color };
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {/* control rail: filters, search, reset, expand */}
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
        {(canExpandCount ?? 0) > 0 && onExpand && (
          <button onClick={onExpand} className="text-[8.5px] font-bold uppercase tracking-wide px-2 py-[3px] rounded-sm transition-colors hover:bg-white/10"
            style={{ color: "#7cc7d8", border: "1px solid rgba(82,176,200,0.3)" }}>
            Expand Neighbors +{canExpandCount}
          </button>
        )}
        {dirty && (
          <button onClick={resetView} className="text-[8.5px] font-bold uppercase tracking-wide px-2 py-[3px] rounded-sm transition-colors hover:bg-white/10" style={{ color: A(0.5), border: `1px solid ${A(0.1)}` }}>
            Reset View
          </button>
        )}
        <div className="relative ml-auto">
          <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2" style={{ color: A(0.3) }} />
          <input value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && matches && matches.size > 0) setPinned([...matches][0]); if (e.key === "Escape") setQuery(""); }}
            placeholder="Search graph…"
            className="w-32 text-[9.5px] rounded-sm pl-5.5 pr-1.5 py-[3px] outline-none focus:w-40 transition-all"
            style={{ background: A(0.04), border: `1px solid ${A(0.1)}`, color: A(0.85), paddingLeft: 18 }} />
        </div>
      </div>

      {/* causal column headers */}
      <div className="relative flex-1 min-h-0">
        <motion.svg initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: "easeOut" }}
          viewBox={`0 0 ${LAY_W} ${height}`} className="w-full h-full select-none block" preserveAspectRatio="xMidYMid meet"
          onClick={() => setPinned(null)}>
          <defs>
            <pattern id="ig3-grid" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.7" fill="#ffffff" fillOpacity="0.045" />
            </pattern>
          </defs>
          <rect x={0} y={0} width={LAY_W} height={height} fill="url(#ig3-grid)" />

          {/* column guides + captions: the causal order reads left to right */}
          {(() => {
            const present = [...new Set([...placed.values()].map(p => p.layer))].sort((a, b) => a - b);
            const CAPTION: Record<number, string> = { 0: "Drivers", 1: "Themes", 2: "Sectors", 3: "Companies", 4: "Evidence" };
            return present.map(l => {
              const x = [...placed.values()].find(p => p.layer === l)!.x;
              return (
                <g key={l}>
                  <line x1={x} x2={x} y1={PAD_T - 12} y2={height - 12} stroke="#ffffff" strokeOpacity={0.03} />
                  <text x={x} y={PAD_T - 18} textAnchor="middle" fontSize={8.5} fontWeight={800} fill={A(0.3)} style={{ letterSpacing: 2, textTransform: "uppercase" }}>
                    {CAPTION[l]}
                  </text>
                </g>
              );
            });
          })()}

          {/* edges: transmission curves, arrows downstream */}
          {edges.map(e => {
            const pa = placed.get(e.a)!, pb = placed.get(e.b)!;
            const lit = isLit(e.a) && isLit(e.b) && (!activeId || e.a === activeId || e.b === activeId || !!matches);
            const hot = hoverEdge === e.id;
            const meta = edgeMeta(e.type);
            const d = edgePath(pa, pb);
            const arrow = arrowFor(e);
            const baseOp = 0.1 + (e.confidence / 100) * 0.3 + Math.min(0.14, e.sources * 0.045);
            const op = activeId || matches ? (lit ? Math.min(0.85, baseOp + 0.24) : 0.025) : baseOp;
            return (
              <g key={e.id} onMouseEnter={() => setHoverEdge(e.id)} onMouseLeave={() => setHoverEdge(null)}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
                <path d={d} fill="none"
                  stroke={hot ? accent : meta.color}
                  strokeWidth={(0.5 + (e.strength / 100) * 2.2) * (hot ? 1.5 : 1)}
                  strokeOpacity={hot ? 0.95 : op}
                  strokeLinecap="round"
                  style={{ transition: "stroke-opacity 180ms ease, stroke 180ms ease" }} />
                {arrow && <path d={arrow.d} fill="none" stroke={hot ? accent : arrow.color} strokeWidth={1.1} strokeOpacity={hot ? 0.95 : Math.min(0.8, op + 0.15)} strokeLinecap="round" strokeLinejoin="round" />}
                {e.evidenceCount > 1 && (
                  <circle cx={(pa.x + pb.x) / 2} cy={(pa.y + pb.y) / 2} r={1.6} fill={meta.color} fillOpacity={lit ? 0.65 : 0.1} />
                )}
              </g>
            );
          })}

          {/* nodes */}
          {[...placed.values()].map(p => {
            const isCenter = p.n.degree === 0;
            const lit = isLit(p.n.id);
            const hot = hoverId === p.n.id || pinned === p.n.id;
            const col = isCenter ? accent : CLASS_META[p.cls].color;
            const lp = labelFor(p);
            const maxLen = 26;
            const showLabel = isCenter || p.cls !== "metric" || hot || !!activeId;
            return (
              <g key={p.n.id} style={{ cursor: "pointer" }} opacity={lit ? 1 : 0.13}
                onMouseEnter={() => setHoverId(p.n.id)} onMouseLeave={() => setHoverId(null)}
                onClick={ev => { ev.stopPropagation(); setPinned(prev => (prev === p.n.id ? null : p.n.id)); }}>
                <circle cx={p.x} cy={p.y} r={Math.max(9, p.r + 5)} fill="transparent" />
                {isCenter ? (
                  <>
                    <circle cx={p.x} cy={p.y} r={p.r + 6.5} fill="none" stroke={col} strokeOpacity={0.4} strokeWidth={0.8} strokeDasharray="2.5 4" />
                    {[45, 135, 225, 315].map(deg => (
                      <line key={deg} x1={p.x + Math.cos((deg * Math.PI) / 180) * (p.r + 3.5)} y1={p.y + Math.sin((deg * Math.PI) / 180) * (p.r + 3.5)}
                        x2={p.x + Math.cos((deg * Math.PI) / 180) * (p.r + 9)} y2={p.y + Math.sin((deg * Math.PI) / 180) * (p.r + 9)}
                        stroke={col} strokeOpacity={0.7} strokeWidth={1} />
                    ))}
                    <circle cx={p.x} cy={p.y} r={p.r} fill="#0d1420" stroke={col} strokeWidth={1.6} />
                    <circle cx={p.x} cy={p.y} r={2.2} fill={col} />
                  </>
                ) : (
                  <>
                    {hot && <circle cx={p.x} cy={p.y} r={p.r + 4.5} fill={col} opacity={0.15} />}
                    <circle cx={p.x} cy={p.y} r={hot ? p.r + 0.6 : p.r} fill="#0a0f19" stroke={col}
                      strokeWidth={pinned === p.n.id ? 1.8 : 1.1} style={{ transition: "r 140ms ease" }} />
                    <circle cx={p.x} cy={p.y} r={Math.max(0.9, p.r * 0.34)} fill={col} opacity={0.85} />
                    {pinned === p.n.id && <circle cx={p.x} cy={p.y} r={p.r + 3.6} fill="none" stroke={col} strokeWidth={0.8} strokeDasharray="2 2.5" />}
                  </>
                )}
                {showLabel && (
                  <text x={isCenter ? p.x : lp.x} y={isCenter ? p.y - p.r - 11 : p.y + 3}
                    textAnchor={isCenter ? "middle" : lp.anchor}
                    fontSize={isCenter ? 12.5 : p.cls === "metric" ? 7.5 : 9}
                    fontWeight={isCenter ? 800 : hot ? 700 : 600}
                    fill={isCenter ? accent : hot ? "#ffffff" : A(p.cls === "metric" ? 0.42 : 0.76)}
                    stroke={BG} strokeWidth={3} paintOrder="stroke" strokeLinejoin="round"
                    style={{ transition: "fill 140ms ease" }}>
                    {hot ? p.n.label : trunc(p.n.label, isCenter ? 28 : maxLen)}
                  </text>
                )}
              </g>
            );
          })}
        </motion.svg>

        {/* empty state */}
        {placed.size <= 1 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-[10px] mt-20 px-3 py-1.5 rounded-sm" style={{ color: A(0.45), background: "rgba(8,12,20,0.85)", border: `1px solid ${A(0.08)}` }}>
              {hidden.size > 0 ? "All connected entities are filtered out. Reset View to see the map." : "No connected intelligence identified yet."}
            </p>
          </div>
        )}

        {/* legend: entity classes + present relationship types */}
        <div className="absolute bottom-2 left-3 pointer-events-none space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            {CLASS_ORDER.filter(c => (classCounts.get(c) ?? 0) > 0 && !hidden.has(c)).map(c => (
              <span key={c} className="flex items-center gap-1 text-[7.5px] font-bold uppercase tracking-wider" style={{ color: A(0.38) }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: CLASS_META[c].color, opacity: 0.9 }} />{CLASS_META[c].label}
              </span>
            ))}
          </div>
          {presentEdgeKeys.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              {presentEdgeKeys.map(t => (
                <span key={t.key} className="flex items-center gap-1 text-[7.5px] font-semibold uppercase tracking-wider" style={{ color: A(0.3) }}>
                  <span className="inline-block w-3 h-[2px] rounded-full" style={{ background: t.color, opacity: 0.85 }} />{t.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* hovered-edge readout */}
        {hoveredEdgeVM && !pinned && (
          <div className="absolute bottom-2 right-3 px-2.5 py-1 rounded-sm pointer-events-none" style={{ background: "rgba(8,12,20,0.92)", border: `1px solid ${A(0.1)}` }}>
            <p className="text-[9px] tabular-nums" style={{ color: A(0.62) }}>
              {hoveredEdgeVM.from.label} <span style={{ color: edgeMeta(hoveredEdgeVM.type).color }}>{hoveredEdgeVM.type.replace(/_/g, " ")}</span> {hoveredEdgeVM.to.label}
              {" · "}strength {hoveredEdgeVM.strength} · {hoveredEdgeVM.sources} source{hoveredEdgeVM.sources === 1 ? "" : "s"}
              {hoveredEdgeVM.evidenceCount > 0 ? ` · evidence ${hoveredEdgeVM.evidenceCount}` : ""}
            </p>
          </div>
        )}

        {/* pinned / hovered detail panel */}
        {focus && (
          <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute top-2 right-2 w-[238px] max-h-[calc(100%-16px)] rounded-sm border flex flex-col overflow-hidden"
            style={{ background: "rgba(7,11,19,0.97)", borderColor: A(0.12), boxShadow: "0 10px 34px rgba(0,0,0,0.6)" }}>
            <div className="flex" style={{ borderBottom: `1px solid ${A(0.07)}` }}>
              <div className="w-[3px] shrink-0" style={{ background: focus.n.degree === 0 ? accent : CLASS_META[focus.cls].color }} />
              <div className="flex-1 min-w-0 px-3 pt-2 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[7.5px] font-black uppercase tracking-[0.16em]" style={{ color: focus.n.degree === 0 ? accent : CLASS_META[focus.cls].color }}>
                    {TYPE_LABEL[focus.n.type] ?? focus.n.type}
                  </span>
                  {focus.n.degree === 0 && <span className="text-[7px] font-bold uppercase tracking-wide" style={{ color: A(0.32) }}>Focused</span>}
                  {pinned === focus.n.id && (
                    <button onClick={() => setPinned(null)} className="ml-auto p-0.5 rounded-sm transition-colors hover:bg-white/10" style={{ color: A(0.4) }}><X size={10} /></button>
                  )}
                </div>
                <p className="text-[12px] font-black leading-tight mt-0.5" style={{ color: A(0.95) }}>{focus.n.label}</p>
                {focusReason && (
                  <p className="text-[8.5px] leading-snug mt-1" style={{ color: A(0.5) }}>
                    <span style={{ color: CLASS_META[classOf(focusReason.other.type)].color }}>{focusReason.other.label}</span>
                    {" "}<span style={{ color: edgeMeta(focusReason.type).color }}>{focusReason.type.replace(/_/g, " ")}</span> this · strength {focusReason.strength}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 border-b" style={{ borderColor: A(0.07) }}>
              {[["Conf", focus.n.confidence], ["Import", focus.n.importance], ["Links", focus.n.relCount], ["Evidence", focusEvidence]].map(([lbl, v]) => (
                <div key={lbl} className="px-2 py-1.5 border-r last:border-r-0" style={{ borderColor: A(0.05) }}>
                  <p className="text-[11px] font-black tabular-nums leading-none" style={{ color: A(0.9) }}>{v}</p>
                  <p className="text-[6.5px] font-bold uppercase tracking-wider mt-0.5" style={{ color: A(0.36) }}>{lbl}</p>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 flex-1 overflow-y-auto scrollbar-hide">
              {focusEdges.length > 0 && (
                <>
                  <p className="text-[7px] font-black uppercase tracking-[0.16em] mb-1.5" style={{ color: A(0.32) }}>Strongest Connections</p>
                  <ul className="space-y-1">
                    {focusEdges.slice(0, 6).map(({ edge, other }) => (
                      <li key={edge.id} className="flex items-center gap-1.5 text-[9.5px]" style={{ color: A(0.72) }}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CLASS_META[classOf(other.type)].color, opacity: 0.9 }} />
                        <span className="truncate" style={{ color: A(0.86) }}>{other.label}</span>
                        <span className="shrink-0 text-[7px] font-semibold uppercase tracking-wide" style={{ color: edgeMeta(edge.type).color }}>{edge.type.replace(/_/g, " ")}</span>
                        <span className="ml-auto shrink-0 tabular-nums text-[8.5px] font-bold" style={{ color: A(0.48) }}>{edge.strength}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {focusStories.length > 0 && (
                <>
                  <p className="text-[7px] font-black uppercase tracking-[0.16em] mt-2.5 mb-1.5" style={{ color: A(0.32) }}>Related Stories</p>
                  <ul className="space-y-1">
                    {focusStories.map(({ edge, other }) => (
                      <li key={edge.id} className="text-[9px] leading-snug flex gap-1.5" style={{ color: A(0.62) }}>
                        <span className="shrink-0 mt-0.5" style={{ color: CLASS_META.story.color }}>•</span>{other.label}
                      </li>
                    ))}
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

        {/* idle hint */}
        {!focus && !hoveredEdgeVM && placed.size > 1 && (
          <div className="absolute bottom-2 right-3 pointer-events-none">
            <p className="text-[9px]" style={{ color: A(0.28) }}>transmission reads left to right · hover to trace · click to pin</p>
          </div>
        )}
      </div>
    </div>
  );
}
