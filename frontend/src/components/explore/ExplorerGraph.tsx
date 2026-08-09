"use client";

/**
 * components/explore/ExplorerGraph.tsx - Intelligence Flow (Sprint 3A).
 *
 * A causal-reasoning surface, not a generic graph. Consumes the same shared
 * MapVM (buildRelationshipMap) untouched; everything here is presentation and
 * information architecture:
 *
 * - transmission stages read left to right (Drivers -> Themes -> Sectors ->
 *   Companies -> Evidence), each stage a faint banded column with an index
 * - entity classes are visually distinct by SHAPE and size hierarchy, not just
 *   color: drivers diamond, themes hexagon, sectors square, companies circle,
 *   stories triangle, market metrics tiny ticks
 * - deterministic layered layout with barycenter ordering (no physics),
 *   tightened spacing for density
 * - hovering an edge opens an intelligence card: type, strength, confidence,
 *   evidence and source counts, and a plain-language read of what the
 *   relationship type means (semantics of the recorded edge, never invented
 *   facts)
 * - pinning a node answers "why does this entity matter": primary drivers,
 *   supporting themes, benefiting entities, thesis risks, and a confidence
 *   explanation composed from the node's real edge data
 * - filters, search, Reset View, Expand Neighbors carry over from Sprint 2
 *
 * No decorative effects. If it does not inform, it is not drawn. No em/en dashes.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ChevronDown, Search, X } from "lucide-react";
import { trunc, fmtDay, explorerHrefForNode, type MapNode, type MapEdge, type MapVM, type ExpansionMode, type EdgeTrend } from "@/lib/intelligenceShared";
import type { GraphReveal } from "@/lib/graphReveal";

const BREAKING_COLOR = "#f87171";   // weak / invalidating edges, called out at the "what breaks it" beat
const PRIOR_COLOR = "#f0b429";      // prior resolved-path overlay, drawn only when real ledger data exists

const TREND_META: Record<EdgeTrend, { label: string; color: string }> = {
  strengthening: { label: "Strengthening", color: "#34d399" },
  weakening:     { label: "Weakening",     color: "#f87171" },
  stable:        { label: "Stable",        color: "#8ea3b5" },
};
const fmtObs = (t: number): string => (Number.isFinite(t) && t > 0 ? fmtDay(new Date(t).toISOString()) : "n/a");

const A = (n: number) => `rgba(255,255,255,${n})`;
const BG = "#070b13";

/* ---- entity classes -> causal stages ---- */
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
const LAYER_OF: Record<NodeClass, number> = { driver: 0, theme: 1, sector: 2, company: 3, story: 4, metric: 4 };
const STAGE_CAPTION: Record<number, string> = { 0: "Drivers", 1: "Themes", 2: "Sectors", 3: "Companies", 4: "Evidence" };
const TYPE_LABEL: Record<string, string> = {
  Company: "Company", ETF: "ETF", Theme: "Theme", Narrative: "Narrative",
  Macro: "Macro Driver", MacroSeries: "Macro Series", Sector: "Sector",
  Story: "Story", Podcast: "Podcast", Person: "Person", Institution: "Institution",
  MarketMetric: "Market Metric",
};

/* ---- edge semantics: color + plain-language meaning per relationship group ---- */
type EdgeKey = "drives" | "supports" | "weakens" | "exposed" | "mentions" | "stat" | "metric" | "other";
const EDGE_GROUPS: Array<{ key: EdgeKey; re: RegExp; color: string }> = [
  { key: "drives",   re: /driv|impact|caus|lead|transmit|affect/i,       color: "#f0b429" },
  { key: "supports", re: /support|confirm|strengthen|validat/i,          color: "#34d399" },
  { key: "weakens",  re: /weaken|contradict|revers|disrupt|pressur|risk/i, color: "#f87171" },
  { key: "exposed",  re: /expos|benefit|express|track|belong|theme/i,    color: "#52b0c8" },
  { key: "mentions", re: /mention|discuss|report|cover|story|episode/i,  color: "#8ea3b5" },
  { key: "stat",     re: /correlat|similar|analog|cluster/i,             color: "#a78bfa" },
  { key: "metric",   re: /market_metric/i,                               color: "#64748b" },
];
const edgeMeta = (type: string): { key: EdgeKey; color: string } => {
  for (const g of EDGE_GROUPS) if (g.re.test(type)) return g;
  return { key: "other", color: "#7f95a8" };
};
/** What this relationship type MEANS, in analyst language. Explains the recorded
    edge semantics; states no facts beyond what the graph asserts. */
function edgeExplanation(e: MapEdge): string {
  switch (edgeMeta(e.type).key) {
    case "drives":   return `${e.from.label} acts as a causal force here: shifts in it transmit pressure downstream into ${e.to.label}.`;
    case "supports": return `This link adds confirming weight: ${e.from.label} strengthens the case for ${e.to.label}.`;
    case "weakens":  return `This link cuts against the thesis: ${e.from.label} is a recorded risk to ${e.to.label}.`;
    case "exposed":  return `Exposure link: the narrative prices through this connection between ${e.from.label} and ${e.to.label}.`;
    case "mentions": return `Coverage link: reporting names the entity, grounding the narrative in a real story.`;
    case "stat":     return `Statistical association observed between the two; recorded as similarity, not causation.`;
    case "metric":   return `Live market telemetry attached to the entity by the data pipeline.`;
    default:         return `Relationship recorded by the intelligence graph from observed page activity.`;
  }
}

/* ---- deterministic layered layout (tightened for density) ---- */
const LAY_W = 960, PAD_L = 88, PAD_R = 162, PAD_T = 30, PAD_B = 20;
const MIN_H = 330, MAX_H = 620;

interface Placed { n: MapNode; x: number; y: number; r: number; cls: NodeClass; layer: number }
interface Laid { placed: Map<string, Placed>; height: number; stages: Array<{ layer: number; x: number; count: number }> }

/** Base size hierarchy: causal forces read larger than the evidence that trails them. */
function nodeRadius(n: MapNode, cls: NodeClass, isCenter: boolean): number {
  if (isCenter) return 8;
  const importance = (n.importance / 100) * 3;
  switch (cls) {
    case "driver": return 5 + importance;
    case "theme":  return 4.6 + importance;
    case "sector": return 4.2 + importance;
    case "company": return 3.8 + importance + (n.confidence / 100) * 1.2;
    case "story":  return 3;
    case "metric": return 2;
  }
}

function layeredLayout(map: MapVM, hidden: Set<NodeClass>): Laid {
  const center = map.nodes.find(n => n.degree === 0) ?? null;
  const placed = new Map<string, Placed>();
  if (!center) return { placed, height: MIN_H, stages: [] };

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

  const neigh = new Map<string, string[]>();
  for (const e of map.edges) {
    if (!connected.has(e.a) || !connected.has(e.b)) continue;
    (neigh.get(e.a) ?? neigh.set(e.a, []).get(e.a)!).push(e.b);
    (neigh.get(e.b) ?? neigh.set(e.b, []).get(e.b)!).push(e.a);
  }

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
  const centerLayer = LAYER_OF[classOf(center.type)];
  const centerCol = order.get(centerLayer)!;
  const ci = centerCol.findIndex(n => n.id === center.id);
  if (ci >= 0) { centerCol.splice(ci, 1); centerCol.splice(Math.floor(centerCol.length / 2), 0, center); }

  const maxCount = Math.max(...layers.map(l => order.get(l)!.length));
  const gap = Math.max(22, Math.min(36, (MAX_H - PAD_T - PAD_B) / Math.max(1, maxCount - 1 || 1)));
  const height = Math.max(MIN_H, Math.min(MAX_H, PAD_T + PAD_B + gap * Math.max(1, maxCount - 1) + 52));

  for (const l of layers) {
    const col = order.get(l)!;
    const colH = gap * (col.length - 1);
    col.forEach((n, i) => {
      const cls = classOf(n.type);
      placed.set(n.id, { n, cls, layer: l, r: nodeRadius(n, cls, n.id === center.id), x: xOfLayer.get(l)!, y: height / 2 - colH / 2 + i * gap });
    });
  }
  const stages = layers.map(l => ({ layer: l, x: xOfLayer.get(l)!, count: order.get(l)!.length }));
  return { placed, height, stages };
}

function edgePath(pa: Placed, pb: Placed): string {
  if (pa.layer === pb.layer) {
    const bow = pa.layer >= 3 ? 24 : -24;
    const mx = pa.x + bow;
    return `M${pa.x},${pa.y}C${mx},${pa.y} ${mx},${pb.y} ${pb.x},${pb.y}`;
  }
  const [f, t] = pa.x <= pb.x ? [pa, pb] : [pb, pa];
  const dx = (t.x - f.x) * 0.42;
  return `M${f.x},${f.y}C${f.x + dx},${f.y} ${t.x - dx},${t.y} ${t.x},${t.y}`;
}

/** Class-distinct node mark: shape is the identity, color reinforces it. */
function NodeMark({ p, color, hot, isPinned }: { p: Placed; color: string; hot: boolean; isPinned: boolean }) {
  const { x, y, r, cls } = p;
  const sw = isPinned ? 1.8 : hot ? 1.5 : 1.1;
  const fill = "#0a0f19";
  const core = <circle cx={x} cy={y} r={Math.max(0.8, r * 0.3)} fill={color} opacity={0.9} />;
  switch (cls) {
    case "driver": { // diamond: a force applied to the system
      const d = r + 1;
      return <>{hot && <rect x={x - d - 3} y={y - d - 3} width={(d + 3) * 2} height={(d + 3) * 2} transform={`rotate(45 ${x} ${y})`} fill={color} opacity={0.14} rx={2} />}
        <rect x={x - d} y={y - d} width={d * 2} height={d * 2} transform={`rotate(45 ${x} ${y})`} fill={fill} stroke={color} strokeWidth={sw} rx={1.5} />{core}</>;
    }
    case "theme": { // hexagon: a narrative under construction
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        return `${(x + Math.cos(a) * (r + 1)).toFixed(1)},${(y + Math.sin(a) * (r + 1)).toFixed(1)}`;
      }).join(" ");
      return <>{hot && <circle cx={x} cy={y} r={r + 4.5} fill={color} opacity={0.14} />}
        <polygon points={pts} fill={fill} stroke={color} strokeWidth={sw} strokeLinejoin="round" />{core}</>;
    }
    case "sector": { // square: a container of the market
      const d = r;
      return <>{hot && <rect x={x - d - 3} y={y - d - 3} width={(d + 3) * 2} height={(d + 3) * 2} fill={color} opacity={0.14} rx={2} />}
        <rect x={x - d} y={y - d} width={d * 2} height={d * 2} fill={fill} stroke={color} strokeWidth={sw} rx={1.5} />{core}</>;
    }
    case "story": { // triangle: a pointed piece of evidence
      const d = r + 1.2;
      const pts = `${x},${y - d} ${x + d * 0.9},${y + d * 0.7} ${x - d * 0.9},${y + d * 0.7}`;
      return <>{hot && <circle cx={x} cy={y} r={r + 4} fill={color} opacity={0.14} />}
        <polygon points={pts} fill={fill} stroke={color} strokeWidth={sw} strokeLinejoin="round" /></>;
    }
    case "metric": { // tick: raw telemetry
      return <rect x={x - 1.8} y={y - 1.8} width={3.6} height={3.6} transform={`rotate(45 ${x} ${y})`} fill={color} opacity={hot ? 1 : 0.7} />;
    }
    default: { // company: circle, the tradeable expression
      return <>{hot && <circle cx={x} cy={y} r={r + 4.5} fill={color} opacity={0.15} />}
        <circle cx={x} cy={y} r={hot ? r + 0.6 : r} fill={fill} stroke={color} strokeWidth={sw} style={{ transition: "r 140ms ease" }} />{core}</>;
    }
  }
}

/** Legend glyph per class, matching the node shapes. */
function LegendGlyph({ cls }: { cls: NodeClass }) {
  const c = CLASS_META[cls].color;
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" className="shrink-0">
      {cls === "driver" && <rect x={2.2} y={2.2} width={5.6} height={5.6} transform="rotate(45 5 5)" fill="none" stroke={c} strokeWidth={1.2} />}
      {cls === "theme" && <polygon points="5,1.2 8.3,3.1 8.3,6.9 5,8.8 1.7,6.9 1.7,3.1" fill="none" stroke={c} strokeWidth={1.2} />}
      {cls === "sector" && <rect x={2} y={2} width={6} height={6} fill="none" stroke={c} strokeWidth={1.2} />}
      {cls === "company" && <circle cx={5} cy={5} r={3.4} fill="none" stroke={c} strokeWidth={1.2} />}
      {cls === "story" && <polygon points="5,1.6 8.4,8 1.6,8" fill="none" stroke={c} strokeWidth={1.2} />}
      {cls === "metric" && <rect x={3.4} y={3.4} width={3.2} height={3.2} transform="rotate(45 5 5)" fill={c} />}
    </svg>
  );
}

export function ExplorerGraph({ map, accent, onNavigate, onExpand, canExpandCount, expansionOptions, appliedExpansions, onExpandMode, onResetExpansions, reveal }: {
  map: MapVM;
  accent: string;
  onNavigate: (href: string) => void;
  onExpand?: () => void;
  canExpandCount?: number;
  /** Progressive-disclosure modes with how many hidden relationships each would reveal. */
  expansionOptions?: Array<{ key: ExpansionMode; label: string; count: number }>;
  appliedExpansions?: ExpansionMode[];
  onExpandMode?: (mode: ExpansionMode) => void;
  onResetExpansions?: () => void;
  /** Thread-driven progressive reveal (Workstation Stage 2). Non-destructive: it only shifts
   *  emphasis over the SAME layout. Absent for every other consumer, leaving them unchanged.
   *  Any direct user interaction (hover / pin / search) takes over from the resting reveal. */
  reveal?: GraphReveal;
}) {
  const [hidden, setHidden] = useState<Set<NodeClass>>(new Set());
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandOpen, setExpandOpen] = useState(false);

  const { placed, height, stages } = useMemo(() => layeredLayout(map, hidden), [map, hidden]);
  const edges = useMemo(() => map.edges.filter(e => placed.has(e.a) && placed.has(e.b)), [map, placed]);

  useEffect(() => { if (pinned && !placed.has(pinned)) setPinned(null); }, [placed, pinned]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q ? new Set([...placed.keys()].filter(id => placed.get(id)!.n.label.toLowerCase().includes(q))) : null), [q, placed]);

  const activeId = hoverId ?? pinned;
  // Thread-driven reveal: the resting emphasis when the reader is not directly interacting. Any
  // hover / pin / search hands control back to the user (the thread never overrides exploration).
  const userActive = !!activeId || !!matches;
  const revealSet = useMemo(() => (reveal?.restrict ? new Set(reveal.nodeIds) : null), [reveal]);
  const breakingSet = useMemo(() => new Set(reveal?.breakingEdgeIds ?? []), [reveal]);
  const priorSet = useMemo(() => new Set(reveal?.priorPathEdgeIds ?? []), [reveal]);
  const inReveal = (n: MapNode): boolean => !revealSet || n.degree === 0 || revealSet.has(n.id);
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

  // "Why does this entity matter" breakdown: grouped from the node's REAL edges.
  const why = useMemo(() => {
    if (!focus) return null;
    const drivers = focusEdges.filter(x => classOf(x.other.type) === "driver");
    const themes = focusEdges.filter(x => classOf(x.other.type) === "theme");
    const companies = focusEdges.filter(x => classOf(x.other.type) === "company");
    const risks = focusEdges.filter(x => edgeMeta(x.edge.type).key === "weakens");
    const stories = focusEdges.filter(x => classOf(x.other.type) === "story");
    const evidence = focusEdges.reduce((s, x) => s + x.edge.evidenceCount, 0);
    const sources = new Set<number>();
    let sourceCount = 0;
    for (const x of focusEdges) sourceCount = Math.max(sourceCount, x.edge.sources);
    void sources;
    const strongest = focusEdges[0] ?? null;
    const confidenceRead = strongest
      ? `Confidence ${focus.n.confidence} rests on ${focusEdges.length} recorded connection${focusEdges.length === 1 ? "" : "s"} carrying ${evidence} evidence point${evidence === 1 ? "" : "s"}; the strongest is ${strongest.edge.type.replace(/_/g, " ")} ${strongest.other.label} at strength ${strongest.edge.strength}.`
      : `Confidence ${focus.n.confidence}; no connections inside the current view.`;
    return { drivers: drivers.slice(0, 3), themes: themes.slice(0, 3), companies: companies.slice(0, 4), risks: risks.slice(0, 3), stories: stories.slice(0, 3), evidence, confidenceRead };
  }, [focus, focusEdges]);

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

  const dirty = hidden.size > 0 || pinned !== null || q.length > 0 || (appliedExpansions?.length ?? 0) > 0;
  const resetView = () => { setHidden(new Set()); setPinned(null); setQuery(""); setHoverId(null); setHoverEdge(null); setExpandOpen(false); onResetExpansions?.(); };
  const expandable = (expansionOptions ?? []).some(o => o.count > 0) || (canExpandCount ?? 0) > 0;
  const focusHref = focus && focus.n.degree !== 0 ? explorerHrefForNode(focus.n, CLASS_META[focus.cls].color) : null;

  const labelFor = (p: Placed): { x: number; anchor: "start" | "end" } =>
    p.layer === 0 && stages.length > 1 ? { x: p.x - p.r - 6, anchor: "end" } : { x: p.x + p.r + 6, anchor: "start" };

  const arrowFor = (e: MapEdge): { d: string; color: string } | null => {
    const pa = placed.get(e.a)!, pb = placed.get(e.b)!;
    if (pa.layer === pb.layer) return null;
    const [, t] = pa.x <= pb.x ? [pa, pb] : [pb, pa];
    const dx = -(t.r + 4);
    return { d: `M${t.x + dx - 4},${t.y - 3.4}L${t.x + dx},${t.y}L${t.x + dx - 4},${t.y + 3.4}`, color: edgeMeta(e.type).color };
  };

  const PanelSection = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="mb-2">
      <p className="text-[7px] font-black uppercase tracking-[0.16em] mb-1" style={{ color: A(0.34) }}>{label}</p>
      {children}
    </div>
  );
  const PanelRow = ({ edge, other }: { edge: MapEdge; other: MapNode }) => (
    <li className="flex items-center gap-1.5 text-[9.5px]" style={{ color: A(0.72) }}>
      <LegendGlyph cls={classOf(other.type)} />
      <span className="truncate" style={{ color: A(0.86) }}>{other.label}</span>
      <span className="shrink-0 text-[7px] font-semibold uppercase tracking-wide" style={{ color: edgeMeta(edge.type).color }}>{edge.type.replace(/_/g, " ")}</span>
      <span className="ml-auto shrink-0 tabular-nums text-[8.5px] font-bold" style={{ color: A(0.48) }}>{edge.strength}</span>
    </li>
  );

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {/* control rail */}
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
              <LegendGlyph cls={c} />
              {CLASS_META[c].label}
              <span className="tabular-nums" style={{ color: off ? A(0.22) : A(0.45) }}>{classCounts.get(c)}</span>
            </button>
          );
        })}
        {expandable && (
          <div className="relative">
            <button onClick={() => setExpandOpen(o => !o)}
              className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-wide px-2 py-[3px] rounded-sm transition-colors hover:bg-white/10"
              style={{ color: "#7cc7d8", border: "1px solid rgba(82,176,200,0.3)", background: expandOpen ? "rgba(82,176,200,0.12)" : "transparent" }}>
              Expand <ChevronDown size={9} style={{ transform: expandOpen ? "rotate(180deg)" : undefined }} />
            </button>
            {expandOpen && (
              <div className="absolute left-0 top-full mt-1 z-30 w-[196px] rounded-sm border py-1"
                style={{ background: "rgba(7,11,19,0.98)", borderColor: A(0.14), boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }}>
                {(expansionOptions ?? []).map(o => {
                  const applied = appliedExpansions?.includes(o.key);
                  const enabled = o.count > 0 && !applied && !!onExpandMode;
                  return (
                    <button key={o.key} disabled={!enabled}
                      onClick={() => { onExpandMode?.(o.key); setExpandOpen(false); }}
                      className="w-full flex items-center gap-2 px-2.5 py-1 text-left transition-colors hover:bg-white/5"
                      style={{ cursor: enabled ? "pointer" : "default" }}>
                      <span className="text-[9px] font-semibold" style={{ color: applied ? "#7cc7d8" : enabled ? A(0.8) : A(0.26) }}>{o.label}</span>
                      <span className="ml-auto text-[8.5px] font-bold tabular-nums" style={{ color: applied ? "#7cc7d8" : enabled ? A(0.5) : A(0.2) }}>
                        {applied ? "shown" : `+${o.count}`}
                      </span>
                    </button>
                  );
                })}
                {(canExpandCount ?? 0) > 0 && onExpand && (
                  <button onClick={() => { onExpand(); setExpandOpen(false); }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-left border-t transition-colors hover:bg-white/5" style={{ borderColor: A(0.07) }}>
                    <span className="text-[9px] font-semibold" style={{ color: A(0.8) }}>All Neighbors</span>
                    <span className="ml-auto text-[8.5px] font-bold tabular-nums" style={{ color: A(0.5) }}>+{canExpandCount}</span>
                  </button>
                )}
              </div>
            )}
          </div>
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
            className="w-32 text-[9.5px] rounded-sm pr-1.5 py-[3px] outline-none focus:w-40 transition-all"
            style={{ background: A(0.04), border: `1px solid ${A(0.1)}`, color: A(0.85), paddingLeft: 18 }} />
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <motion.svg initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, ease: "easeOut" }}
          viewBox={`0 0 ${LAY_W} ${height}`} className="w-full h-full select-none block" preserveAspectRatio="xMidYMid meet"
          onClick={() => setPinned(null)}>
          <defs>
            <pattern id="ig3-grid" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.7" fill="#ffffff" fillOpacity="0.04" />
            </pattern>
          </defs>
          <rect x={0} y={0} width={LAY_W} height={height} fill="url(#ig3-grid)" />

          {/* transmission stages: banded columns with index + caption + count */}
          {stages.map((s, i) => {
            const bandW = stages.length > 1 ? Math.min(118, ((LAY_W - PAD_L - PAD_R) / (stages.length - 1)) * 0.62) : 150;
            return (
              <g key={s.layer}>
                <rect x={s.x - bandW / 2} y={PAD_T - 14} width={bandW} height={height - PAD_T - 4} rx={5}
                  fill="#ffffff" fillOpacity={0.014} stroke="#ffffff" strokeOpacity={0.025} />
                <text x={s.x} y={PAD_T - 20} textAnchor="middle" fontSize={8.5} fontWeight={800} fill={A(0.34)} style={{ letterSpacing: 2, textTransform: "uppercase" }}>
                  {String(i + 1).padStart(2, "0")} · {STAGE_CAPTION[s.layer]} · {s.count}
                </text>
                {i < stages.length - 1 && (
                  <text x={(s.x + stages[i + 1].x) / 2} y={PAD_T - 20} textAnchor="middle" fontSize={9} fontWeight={700} fill={A(0.18)}>→</text>
                )}
              </g>
            );
          })}

          {/* edges */}
          {edges.map(e => {
            const pa = placed.get(e.a)!, pb = placed.get(e.b)!;
            const lit = isLit(e.a) && isLit(e.b) && (!activeId || e.a === activeId || e.b === activeId || !!matches);
            const hot = hoverEdge === e.id;
            const meta = edgeMeta(e.type);
            const d = edgePath(pa, pb);
            const arrow = arrowFor(e);
            const baseOp = 0.1 + (e.confidence / 100) * 0.3 + Math.min(0.14, e.sources * 0.045);
            // Reveal state (resting only; any user interaction takes over via the branch above).
            const breaking = !userActive && breakingSet.has(e.id);
            const prior = !userActive && priorSet.has(e.id);
            const eRevealed = !revealSet || userActive || (inReveal(pa.n) && inReveal(pb.n));
            let op = activeId || matches ? (lit ? Math.min(0.85, baseOp + 0.24) : 0.025) : baseOp;
            if (revealSet && !userActive) op = eRevealed ? Math.min(0.9, baseOp + (breaking ? 0.34 : 0.12)) : 0.03;
            const stroke = hot ? accent : breaking ? BREAKING_COLOR : meta.color;
            const sw = (0.5 + (e.strength / 100) * 2.2) * (hot || breaking ? 1.5 : 1);
            return (
              <g key={e.id} onMouseEnter={() => setHoverEdge(e.id)} onMouseLeave={() => setHoverEdge(null)}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
                {prior && <path d={d} fill="none" stroke={PRIOR_COLOR} strokeWidth={sw + 1.6} strokeOpacity={0.5} strokeDasharray="5 4" strokeLinecap="round" />}
                <path d={d} fill="none"
                  stroke={stroke}
                  strokeWidth={sw}
                  strokeOpacity={hot ? 0.95 : op}
                  strokeLinecap="round"
                  style={{ transition: "stroke-opacity 180ms ease, stroke 180ms ease" }} />
                {arrow && <path d={arrow.d} fill="none" stroke={hot ? accent : breaking ? BREAKING_COLOR : arrow.color} strokeWidth={1.1} strokeOpacity={hot ? 0.95 : Math.min(0.8, op + 0.15)} strokeLinecap="round" strokeLinejoin="round" />}
                {e.evidenceCount > 1 && (
                  <circle cx={(pa.x + pb.x) / 2} cy={(pa.y + pb.y) / 2} r={1.6} fill={meta.color} fillOpacity={lit ? 0.65 : 0.1} />
                )}
              </g>
            );
          })}

          {/* nodes: shape encodes class, size encodes importance */}
          {[...placed.values()].map(p => {
            const isCenter = p.n.degree === 0;
            const lit = isLit(p.n.id);
            const hot = hoverId === p.n.id || pinned === p.n.id;
            const col = isCenter ? accent : CLASS_META[p.cls].color;
            const lp = labelFor(p);
            const revealed = inReveal(p.n);
            const opacity = userActive ? (lit ? 1 : 0.12) : (revealSet && !revealed ? 0.1 : 1);
            const showLabel = (isCenter || p.cls !== "metric" || hot || !!activeId) && (userActive || !revealSet || revealed);
            return (
              <g key={p.n.id} style={{ cursor: "pointer", transition: "opacity 220ms ease" }} opacity={opacity}
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
                    <NodeMark p={p} color={col} hot={hot} isPinned={pinned === p.n.id} />
                    {pinned === p.n.id && <circle cx={p.x} cy={p.y} r={p.r + 4.2} fill="none" stroke={col} strokeWidth={0.8} strokeDasharray="2 2.5" />}
                  </>
                )}
                {showLabel && (
                  <text x={isCenter ? p.x : lp.x} y={isCenter ? p.y - p.r - 11 : p.y + 3}
                    textAnchor={isCenter ? "middle" : lp.anchor}
                    fontSize={isCenter ? 12.5 : p.cls === "metric" ? 7.5 : p.cls === "story" ? 8.5 : 9}
                    fontWeight={isCenter ? 800 : hot ? 700 : 600}
                    fill={isCenter ? accent : hot ? "#ffffff" : A(p.cls === "metric" ? 0.4 : p.cls === "story" ? 0.6 : 0.78)}
                    stroke={BG} strokeWidth={3} paintOrder="stroke" strokeLinejoin="round"
                    style={{ transition: "fill 140ms ease" }}>
                    {hot ? p.n.label : trunc(p.n.label, 26)}
                  </text>
                )}
              </g>
            );
          })}
        </motion.svg>

        {placed.size <= 1 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-[10px] mt-20 px-3 py-1.5 rounded-sm" style={{ color: A(0.45), background: "rgba(8,12,20,0.85)", border: `1px solid ${A(0.08)}` }}>
              {hidden.size > 0 ? "All connected entities are filtered out. Reset View to see the map." : "No connected intelligence identified yet."}
            </p>
          </div>
        )}

        {/* legend: shape glyphs, matching the marks */}
        <div className="absolute bottom-2 left-3 pointer-events-none">
          <div className="flex items-center gap-3 flex-wrap">
            {CLASS_ORDER.filter(c => (classCounts.get(c) ?? 0) > 0 && !hidden.has(c)).map(c => (
              <span key={c} className="flex items-center gap-1 text-[7.5px] font-bold uppercase tracking-wider" style={{ color: A(0.38) }}>
                <LegendGlyph cls={c} />{CLASS_META[c].label}
              </span>
            ))}
          </div>
        </div>

        {/* edge intelligence card */}
        {hoveredEdgeVM && (
          <div className="absolute bottom-2 right-3 w-[264px] rounded-sm border pointer-events-none" style={{ background: "rgba(7,11,19,0.97)", borderColor: A(0.12), boxShadow: "0 8px 26px rgba(0,0,0,0.55)" }}>
            <div className="flex" >
              <div className="w-[3px] shrink-0 rounded-l-sm" style={{ background: edgeMeta(hoveredEdgeVM.type).color }} />
              <div className="flex-1 min-w-0 px-2.5 py-2">
                <p className="text-[9px] leading-tight" style={{ color: A(0.85) }}>
                  <span className="font-bold">{hoveredEdgeVM.from.label}</span>
                  {" "}<span className="font-black uppercase tracking-wide text-[8px]" style={{ color: edgeMeta(hoveredEdgeVM.type).color }}>{hoveredEdgeVM.type.replace(/_/g, " ")}</span>{" "}
                  <span className="font-bold">{hoveredEdgeVM.to.label}</span>
                </p>
                <div className="flex items-center gap-3 mt-1.5">
                  {[["Strength", hoveredEdgeVM.strength], ["Confidence", hoveredEdgeVM.confidence], ["Evidence", hoveredEdgeVM.evidenceCount], ["Sources", hoveredEdgeVM.sources]].map(([lbl, v]) => (
                    <span key={lbl} className="flex flex-col">
                      <span className="text-[10px] font-black tabular-nums leading-none" style={{ color: A(0.88) }}>{v}</span>
                      <span className="text-[6.5px] font-bold uppercase tracking-wider mt-0.5" style={{ color: A(0.36) }}>{lbl}</span>
                    </span>
                  ))}
                  <span className="ml-auto text-[7px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-sm"
                    style={{ color: TREND_META[hoveredEdgeVM.trend].color, background: `${TREND_META[hoveredEdgeVM.trend].color}16`, border: `1px solid ${TREND_META[hoveredEdgeVM.trend].color}40` }}>
                    {TREND_META[hoveredEdgeVM.trend].label}
                  </span>
                </div>
                <p className="text-[7.5px] tabular-nums mt-1.5" style={{ color: A(0.38) }}>
                  First observed {fmtObs(hoveredEdgeVM.firstObserved)} · last updated {fmtObs(hoveredEdgeVM.lastObserved)}
                  {hoveredEdgeVM.pages.length > 0 ? ` · via ${hoveredEdgeVM.pages.slice(0, 3).join(", ")}` : ""}
                </p>
                <p className="text-[8.5px] leading-snug mt-1" style={{ color: A(0.55) }}>{edgeExplanation(hoveredEdgeVM)}</p>
              </div>
            </div>
          </div>
        )}

        {/* pinned / hovered node panel: why does this entity matter */}
        {focus && why && !hoveredEdgeVM && (
          <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute top-2 right-2 w-[248px] max-h-[calc(100%-16px)] rounded-sm border flex flex-col overflow-hidden"
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
              </div>
            </div>
            <div className="grid grid-cols-4 border-b" style={{ borderColor: A(0.07) }}>
              {[["Conf", focus.n.confidence], ["Import", focus.n.importance], ["Links", focus.n.relCount], ["Evidence", why.evidence]].map(([lbl, v]) => (
                <div key={lbl} className="px-2 py-1.5 border-r last:border-r-0" style={{ borderColor: A(0.05) }}>
                  <p className="text-[11px] font-black tabular-nums leading-none" style={{ color: A(0.9) }}>{v}</p>
                  <p className="text-[6.5px] font-bold uppercase tracking-wider mt-0.5" style={{ color: A(0.36) }}>{lbl}</p>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 flex-1 overflow-y-auto scrollbar-hide">
              {why.drivers.length > 0 && (
                <PanelSection label="Primary Drivers"><ul className="space-y-1">{why.drivers.map(x => <PanelRow key={x.edge.id} edge={x.edge} other={x.other} />)}</ul></PanelSection>
              )}
              {why.themes.length > 0 && (
                <PanelSection label="Supporting Themes"><ul className="space-y-1">{why.themes.map(x => <PanelRow key={x.edge.id} edge={x.edge} other={x.other} />)}</ul></PanelSection>
              )}
              {why.companies.length > 0 && (
                <PanelSection label={focus.cls === "company" ? "Related Companies" : "Benefiting Entities"}>
                  <ul className="space-y-1">{why.companies.map(x => <PanelRow key={x.edge.id} edge={x.edge} other={x.other} />)}</ul>
                </PanelSection>
              )}
              {why.risks.length > 0 && (
                <PanelSection label="Thesis Risks"><ul className="space-y-1">{why.risks.map(x => <PanelRow key={x.edge.id} edge={x.edge} other={x.other} />)}</ul></PanelSection>
              )}
              {why.stories.length > 0 && (
                <PanelSection label="Evidence Stories">
                  <ul className="space-y-1">{why.stories.map(x => (
                    <li key={x.edge.id} className="text-[9px] leading-snug flex gap-1.5" style={{ color: A(0.62) }}>
                      <span className="shrink-0 mt-0.5" style={{ color: CLASS_META.story.color }}>•</span>{x.other.label}
                    </li>
                  ))}</ul>
                </PanelSection>
              )}
              <PanelSection label="Confidence Read">
                <p className="text-[8.5px] leading-snug" style={{ color: A(0.55) }}>{why.confidenceRead}</p>
              </PanelSection>
            </div>
            {focusHref && (
              <div className="px-3 pb-2.5 pt-1">
                <button onClick={() => onNavigate(focusHref)}
                  className="w-full flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wide py-1.5 rounded-sm transition-colors hover:bg-white/10"
                  style={{ color: "#7cc7d8", border: "1px solid rgba(82,176,200,0.3)", background: "rgba(82,176,200,0.07)" }}>
                  Open <ArrowUpRight size={9} />
                </button>
              </div>
            )}
          </motion.div>
        )}

        {!focus && !hoveredEdgeVM && placed.size > 1 && (
          <div className="absolute bottom-2 right-3 pointer-events-none">
            <p className="text-[9px]" style={{ color: A(0.28) }}>transmission reads left to right · hover to trace · click to pin</p>
          </div>
        )}
      </div>
    </div>
  );
}
