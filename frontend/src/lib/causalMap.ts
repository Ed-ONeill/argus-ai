/**
 * lib/causalMap.ts - the causal intelligence layer behind the Explorer network
 * (Sprint 3B) and the drawer's relationship map.
 *
 * Read-only projection of the shared intelligence graph into the MapVM the
 * presentation layer renders. Three responsibilities, no UI:
 *
 * 1. buildRelationshipMap - the deterministic selection + radial layout the
 *    drawer has always used. With { causalChains: true } the second-degree
 *    budget is spent completing transmission chains by class priority
 *    (Theme -> its Driver / Sector / peer Companies) instead of generic
 *    strongest-neighbor fanout, so Driver -> Theme -> Sector -> Company ->
 *    Evidence paths surface whenever the graph holds them.
 *
 * 2. Relationship intelligence - every MapEdge carries the edge's full recorded
 *    life: firstObserved, lastObserved, originating pages, and a trend derived
 *    honestly from reinforcement (re-asserted edges strengthen; edges that stop
 *    being asserted while both endpoints stay active weaken; otherwise stable).
 *
 * 3. expandMap / countExpansion - progressive disclosure of EXISTING graph
 *    relationships around the visible map, by analyst intent (upstream causes,
 *    downstream beneficiaries, competitors, suppliers, customers, regulation,
 *    macro drivers, related themes). Nothing is fabricated; expansion only
 *    reveals edges already in the graph.
 *
 * Pure module with relative imports only, so the test suite exercises it
 * directly. No em/en dashes.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import type { IntelNode, IntelEdge } from "./intelligenceGraph";
import { num, round } from "./intelligenceUtils";

/* ------------------------------------------------------------------ *
 * View-model types (additive extension of the long-standing contract)
 * ------------------------------------------------------------------ */

export type EdgeTrend = "strengthening" | "weakening" | "stable";

export interface MapNode { id: string; label: string; type: string; confidence: number; importance: number; relCount: number; x: number; y: number; r: number; degree: 0 | 1 | 2; angle: number }
export interface MapEdge {
  id: string; a: string; b: string; from: MapNode; to: MapNode; type: string;
  strength: number; confidence: number; evidenceCount: number; sources: number;
  // Relationship intelligence (Sprint 3B): the edge's recorded life.
  trend: EdgeTrend; firstObserved: number; lastObserved: number; pages: string[];
}
export interface MapVM { available: boolean; nodes: MapNode[]; edges: MapEdge[]; width: number; height: number; cx: number; cy: number; r1: number; r2: number }

/** Layout knobs. Defaults reproduce the drawer's compact 300x224 map exactly. */
export interface MapLayoutOptions {
  width?:          number;
  height?:         number;
  r1?:             number;
  r2?:             number;
  maxFirst?:       number;
  secondStrength?: number;
  maxSecond?:      number;
  nodeScale?:      number;
  /** Spend the second-degree budget completing causal chains by class priority. */
  causalChains?:   boolean;
}

const MAP_DEFAULTS: Required<Omit<MapLayoutOptions, "causalChains">> & { causalChains: boolean } = {
  width: 300, height: 224, r1: 64, r2: 98, maxFirst: 12, secondStrength: 55, maxSecond: 8, nodeScale: 1, causalChains: false,
};

export const EMPTY_MAP: MapVM = {
  available: false, nodes: [], edges: [],
  width: MAP_DEFAULTS.width, height: MAP_DEFAULTS.height,
  cx: MAP_DEFAULTS.width / 2, cy: MAP_DEFAULTS.height / 2, r1: MAP_DEFAULTS.r1, r2: MAP_DEFAULTS.r2,
};

/* ------------------------------------------------------------------ *
 * Node / edge construction
 * ------------------------------------------------------------------ */

/**
 * Honest trend derivation from the edge's recorded life:
 * - strengthening: the edge has been re-asserted (multiple observations back it)
 * - weakening: the edge stopped being asserted while BOTH endpoints kept
 *   updating well past its last observation (the relationship went quiet)
 * - stable: a single observation with active endpoints
 */
const WEAKEN_LAG_MS = 24 * 60 * 60 * 1000;
export function deriveEdgeTrend(edge: IntelEdge, a: IntelNode | undefined, b: IntelNode | undefined): EdgeTrend {
  if (edge.evidenceCount > 1) return "strengthening";
  if (a && b && Math.min(a.lastSeen, b.lastSeen) - edge.lastObserved > WEAKEN_LAG_MS) return "weakening";
  return "stable";
}

function mkNode(node: IntelNode, degree: 0 | 1 | 2, x: number, y: number, angle: number, nodeScale: number): MapNode {
  const importance = Math.max(0, Math.min(100, round(num(node.importance))));
  const r = (degree === 0 ? 11 : degree === 2 ? 5 : 6 + importance / 100 * 6) * nodeScale;
  return { id: node.id, label: node.label, type: String(node.type), confidence: round(num(node.confidence)), importance, relCount: G.getRelationships(node.id).length, x, y, r, degree, angle };
}
function mkEdge(edge: IntelEdge, from: MapNode, to: MapNode): MapEdge {
  return {
    id: edge.id, a: from.id, b: to.id, from, to, type: edge.relationshipType,
    strength: round(num(edge.strength)), confidence: round(num(edge.confidence)),
    evidenceCount: num(edge.evidenceCount), sources: edge.originatingPages.length,
    trend: deriveEdgeTrend(edge, G.getNode(from.id) ?? undefined, G.getNode(to.id) ?? undefined),
    firstObserved: num(edge.firstObserved), lastObserved: num(edge.lastObserved),
    pages: edge.originatingPages.map(String),
  };
}

/* ------------------------------------------------------------------ *
 * Causal class helpers
 * ------------------------------------------------------------------ */

type CausalClass = "driver" | "theme" | "sector" | "company" | "evidence";
const CAUSAL_CLASS: Record<string, CausalClass> = {
  Macro: "driver", MacroSeries: "driver", InterestRate: "driver", Commodity: "driver", EconomicRelease: "driver",
  Theme: "theme", Narrative: "theme",
  Sector: "sector", Industry: "sector",
  Company: "company", ETF: "company",
};
const causalClass = (t: string): CausalClass => CAUSAL_CLASS[t] ?? "evidence";
const CAUSAL_LAYER: Record<CausalClass, number> = { driver: 0, theme: 1, sector: 2, company: 3, evidence: 4 };
export const causalLayerOfType = (t: string): number => CAUSAL_LAYER[causalClass(t)];

/** Which classes complete a transmission chain through a given first-degree node. */
const CHAIN_WANTS: Record<CausalClass, CausalClass[]> = {
  theme:    ["driver", "sector", "company"],
  sector:   ["theme", "company"],
  company:  ["theme", "sector"],
  driver:   ["theme"],
  evidence: [],
};

/* ------------------------------------------------------------------ *
 * buildRelationshipMap
 * ------------------------------------------------------------------ */

/** Read the existing graph singleton and lay out a stable radial map around one entity. */
export function buildRelationshipMap(key: string, opts: MapLayoutOptions = {}): MapVM {
  const o = { ...MAP_DEFAULTS, ...opts };
  const cx = o.width / 2, cy = o.height / 2;
  const empty: MapVM = { ...EMPTY_MAP, width: o.width, height: o.height, cx, cy, r1: o.r1, r2: o.r2 };

  const center = G.getNode(key);
  if (!center) return empty;
  const neigh = G.getNeighbors(center.id);
  if (neigh.length === 0) return empty;

  const first = [...neigh].sort((a, b) => b.edge.strength - a.edge.strength).slice(0, o.maxFirst);
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const centerNode = mkNode(center, 0, cx, cy, 0, o.nodeScale);
  nodes.push(centerNode);
  const byId = new Map<string, MapNode>([[center.id, centerNode]]);

  const n = first.length;
  first.forEach((x, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const mn = mkNode(x.node, 1, cx + Math.cos(ang) * o.r1, cy + Math.sin(ang) * o.r1, ang, o.nodeScale);
    nodes.push(mn); byId.set(x.node.id, mn);
    edges.push(mkEdge(x.edge, centerNode, mn));
  });

  // Second degree. Default: up to two strongest neighbors of strong links.
  // Causal-chain mode: spend the budget completing transmission chains, class
  // priority first (a theme pulls its driver and sector before a third story).
  let added = 0;
  const addSecond = (parent: MapNode, cand: { node: IntelNode; edge: IntelEdge }, fanIndex: number, fanCount: number) => {
    const ang = parent.angle + (fanCount > 1 ? (fanIndex === 0 ? -0.26 : 0.26) : 0);
    const mn = mkNode(cand.node, 2, cx + Math.cos(ang) * o.r2, cy + Math.sin(ang) * o.r2, ang, o.nodeScale);
    nodes.push(mn); byId.set(cand.node.id, mn);
    edges.push(mkEdge(cand.edge, parent, mn));
    added += 1;
  };

  if (o.causalChains) {
    for (const x of first) {
      if (added >= o.maxSecond) break;
      const parent = byId.get(x.node.id)!;
      const wants = CHAIN_WANTS[causalClass(String(x.node.type))];
      if (wants.length === 0) continue;
      const outers = G.getNeighbors(x.node.id)
        .filter(y => !byId.has(y.node.id) && y.node.id !== center.id)
        .map(y => ({ y, rank: wants.indexOf(causalClass(String(y.node.type))) }))
        .filter(c => c.rank >= 0)
        .sort((a, b) => (a.rank - b.rank) || (b.y.edge.strength - a.y.edge.strength))
        .slice(0, 3);
      outers.forEach((c, j) => { if (added < o.maxSecond) addSecond(parent, c.y, j, outers.length); });
    }
    // Leftover budget falls back to generic strongest neighbors.
    for (const x of first) {
      if (added >= o.maxSecond) break;
      if (x.edge.strength < o.secondStrength) continue;
      const parent = byId.get(x.node.id)!;
      const outers = G.getNeighbors(x.node.id)
        .filter(y => !byId.has(y.node.id) && y.node.id !== center.id)
        .sort((a, b) => b.edge.strength - a.edge.strength)
        .slice(0, 2);
      outers.forEach((c, j) => { if (added < o.maxSecond) addSecond(parent, c, j, outers.length); });
    }
  } else {
    for (const x of first) {
      if (added >= o.maxSecond) break;
      if (x.edge.strength < o.secondStrength) continue;
      const parent = byId.get(x.node.id)!;
      const outers = G.getNeighbors(x.node.id)
        .filter(y => !byId.has(y.node.id) && y.node.id !== center.id)
        .sort((a, b) => b.edge.strength - a.edge.strength)
        .slice(0, 2);
      for (let j = 0; j < outers.length && added < o.maxSecond; j++) addSecond(parent, outers[j], j, outers.length);
    }
  }

  // Deterministic de-overlap: fixed passes nudging ring nodes apart.
  for (let iter = 0; iter < 6; iter++) {
    for (let i = 1; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const min = a.r + b.r + 11 * o.nodeScale;
        if (dist < min) {
          const push = (min - dist) / 2, ux = dx / dist, uy = dy / dist;
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
        }
      }
    }
  }
  const mx = 14 * o.nodeScale, my = 14 * o.nodeScale, myBottom = 16 * o.nodeScale;
  for (const nd of nodes) {
    if (nd.degree === 0) continue;
    nd.x = Math.max(mx, Math.min(o.width - mx, nd.x));
    nd.y = Math.max(my, Math.min(o.height - myBottom, nd.y));
  }

  return { available: true, nodes, edges, width: o.width, height: o.height, cx, cy, r1: o.r1, r2: o.r2 };
}

/* ------------------------------------------------------------------ *
 * Progressive expansion: reveal EXISTING relationships by analyst intent
 * ------------------------------------------------------------------ */

export type ExpansionMode =
  | "upstream" | "downstream" | "competitors" | "suppliers"
  | "customers" | "regulation" | "macro" | "themes";

export const EXPANSION_MODES: Array<{ key: ExpansionMode; label: string }> = [
  { key: "upstream",    label: "Upstream Causes" },
  { key: "downstream",  label: "Downstream Beneficiaries" },
  { key: "competitors", label: "Competitors" },
  { key: "suppliers",   label: "Suppliers" },
  { key: "customers",   label: "Customers" },
  { key: "regulation",  label: "Regulation" },
  { key: "macro",       label: "Macro Drivers" },
  { key: "themes",      label: "Related Themes" },
];

interface Candidate { hostId: string; node: IntelNode; edge: IntelEdge }

/** Does this neighbor satisfy the expansion intent? Direction-aware where it matters. */
function matchesMode(mode: ExpansionMode, hostId: string, cand: { node: IntelNode; edge: IntelEdge }, hostLayer: number): boolean {
  const t = cand.edge.relationshipType;
  const nodeType = String(cand.node.type);
  const candLayer = causalLayerOfType(nodeType);
  const outgoing = cand.edge.source === hostId; // host -> candidate
  switch (mode) {
    case "competitors": return /compet|rival/i.test(t);
    case "suppliers":   return (/suppl/i.test(t) && !outgoing) || (/depends_on/i.test(t) && outgoing);
    case "customers":   return (/suppl/i.test(t) && outgoing) || (/depends_on/i.test(t) && !outgoing);
    case "regulation":  return /regulat|licens|sanction|export|tariff|policy|complian/i.test(t)
      || (causalClass(nodeType) === "driver" && /regulat|export control|sanction|tariff|policy|licens/i.test(cand.node.label));
    case "macro":       return causalClass(nodeType) === "driver";
    case "themes":      return causalClass(nodeType) === "theme";
    case "upstream":    return candLayer < hostLayer || (/driv|raises_demand_for|reduces_supply_of/i.test(t) && !outgoing);
    case "downstream":  return candLayer > hostLayer || (/driv|raises_demand_for|supports/i.test(t) && outgoing);
  }
}

/** Existing graph relationships the mode would reveal, strongest first, deduped. */
export function findExpansionCandidates(map: MapVM, mode: ExpansionMode, limit = 8): Candidate[] {
  if (!map.available) return [];
  const shown = new Set(map.nodes.map(n => n.id));
  const hosts = map.nodes.filter(n => n.degree <= 1); // center + first ring
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const host of hosts) {
    const hostLayer = causalLayerOfType(host.type);
    for (const cand of G.getNeighbors(host.id)) {
      if (shown.has(cand.node.id) || seen.has(cand.node.id)) continue;
      if (!matchesMode(mode, host.id, cand, hostLayer)) continue;
      seen.add(cand.node.id);
      out.push({ hostId: host.id, node: cand.node, edge: cand.edge });
    }
  }
  return out.sort((a, b) => b.edge.strength - a.edge.strength).slice(0, limit);
}

export function countExpansion(map: MapVM, mode: ExpansionMode, limit = 8): number {
  return findExpansionCandidates(map, mode, limit).length;
}

/**
 * Return a NEW MapVM with the mode's candidates appended (host-linked, degree 1
 * when attached to the center, else 2). Purely additive and idempotent; layout
 * coordinates are placeholders because the layered view computes its own.
 */
export function expandMap(map: MapVM, mode: ExpansionMode, limit = 8): MapVM {
  const candidates = findExpansionCandidates(map, mode, limit);
  if (candidates.length === 0) return map;
  const nodes = [...map.nodes];
  const edges = [...map.edges];
  const byId = new Map(nodes.map(n => [n.id, n]));
  const centerId = map.nodes.find(n => n.degree === 0)?.id;
  for (const c of candidates) {
    const host = byId.get(c.hostId);
    if (!host) continue;
    const degree: 1 | 2 = c.hostId === centerId ? 1 : 2;
    const mn = mkNode(c.node, degree, map.cx, map.cy, 0, 1);
    nodes.push(mn); byId.set(mn.id, mn);
    edges.push(mkEdge(c.edge, host, mn));
  }
  return { ...map, nodes, edges };
}
