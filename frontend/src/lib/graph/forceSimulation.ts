/**
 * lib/graph/forceSimulation.ts — clustered force-directed layout.
 *
 * An organic, asymmetric network rather than a rigid radar: Coulomb repulsion,
 * link springs, hard collision, per-cluster cohesion (related nodes gather into
 * visible groups) and gentle centring, integrated with velocity damping and an
 * annealing alpha so it settles without jitter. Seeded deterministically per
 * graph (FNV hashes, never Math.random) so each transaction's intelligence
 * produces its own unique shape that is still stable across renders.
 */

import type { GraphModel, GraphNode, RelationType } from "./types";

export interface SimNode {
  id: string; x: number; y: number; vx: number; vy: number;
  fixed: boolean; radius: number; cluster: string;
}

// Related roles gather into the same cluster.
export function clusterOf(role: RelationType | undefined): string {
  switch (role) {
    case "event": case "acquirer": case "target": return "core";
    case "sector": case "beneficiary": case "competitor": case "supplier": case "customer": return "market";
    case "second-order": return "second";
    default: return "narrative"; // theme, capital-rotation, cross-sector
  }
}

function nodeRadius(node: GraphNode, isCenter: boolean): number {
  if (isCenter || node.kind === "event") return 26;
  if (node.kind === "company") {
    const imp = (node.confidence ?? 50) * 0.5 + (node.beneficiaryScore ?? 50) * 0.5;
    return 10.5 + (imp / 100) * 7.5;
  }
  if (node.kind === "sector") return 18;
  if (node.kind === "theme") return 15.5;
  return 13.5;
}

function jit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

export class ForceSimulation {
  nodes: SimNode[] = [];
  private byId = new Map<string, SimNode>();
  private edges: { source: string; target: string; weight: number }[] = [];
  private clusterKeys: string[] = [];
  private model: GraphModel;
  private w: number;
  private h: number;
  alpha = 1;

  constructor(model: GraphModel, width: number, height: number) {
    this.model = model; this.w = width; this.h = height;
    this.init(model);
  }

  init(model: GraphModel) {
    this.model = model;
    const cx = this.w / 2, cy = this.h / 2;
    const minDim = Math.min(this.w, this.h);
    const prev = this.byId;

    // Seed each cluster at its own deterministic-but-varied angle so different
    // graphs (different cluster mixes) start with different overall shapes.
    const clusterSet = new Set<string>();
    model.nodes.forEach(n => clusterSet.add(clusterOf(n.role)));
    this.clusterKeys = [...clusterSet];
    const clusterAngle = new Map<string, { ax: number; ay: number }>();
    this.clusterKeys.forEach(key => {
      const ang = jit(model.id + ":" + key) * Math.PI * 2;
      const rad = key === "core" ? minDim * 0.06 : minDim * (0.24 + jit(key + model.id) * 0.1);
      clusterAngle.set(key, { ax: cx + Math.cos(ang) * rad, ay: cy + Math.sin(ang) * rad });
    });

    this.nodes = model.nodes.map(node => {
      const isCenter = node.id === model.centerId;
      const cl = clusterOf(node.role);
      const seed = clusterAngle.get(cl)!;
      const radius = nodeRadius(node, isCenter);
      const carried = prev.get(node.id);
      if (carried) { carried.fixed = isCenter; carried.radius = radius; carried.cluster = cl; return carried; }
      const off = (jit(node.id) - 0.5) * 70, off2 = (jit(node.id + "y") - 0.5) * 70;
      return {
        id: node.id, cluster: cl, radius, fixed: isCenter,
        x: isCenter ? cx : seed.ax + off, y: isCenter ? cy : seed.ay + off2,
        vx: 0, vy: 0,
      };
    });
    this.byId = new Map(this.nodes.map(s => [s.id, s]));
    const c = this.byId.get(model.centerId);
    if (c) { c.fixed = true; c.x = cx; c.y = cy; }
    this.edges = model.edges
      .filter(e => this.byId.has(e.source) && this.byId.has(e.target))
      .map(e => ({ source: e.source, target: e.target, weight: e.weight }));
    this.alpha = 1;
  }

  get(id: string): SimNode | undefined { return this.byId.get(id); }
  resize(w: number, h: number) { this.w = w; this.h = h; this.init(this.model); this.reheat(0.6); }
  reheat(a = 0.7) { this.alpha = Math.max(this.alpha, a); }

  step(): boolean {
    if (this.alpha < 0.01) return false;
    const cx = this.w / 2, cy = this.h / 2;
    const REP = 1700, SPRING = 0.045, COHESION = 0.04, CENTER_G = 0.012, DAMP = 0.86;
    const k = this.alpha;

    // Cluster centroids (for cohesion).
    const cen = new Map<string, { x: number; y: number; n: number }>();
    for (const n of this.nodes) {
      const e = cen.get(n.cluster) ?? { x: 0, y: 0, n: 0 };
      e.x += n.x; e.y += n.y; e.n++; cen.set(n.cluster, e);
    }

    // Repulsion (softer within a cluster so groups stay tight) + collision.
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = jit(a.id + b.id) - 0.5; dy = jit(b.id + a.id) - 0.5; d2 = dx * dx + dy * dy + 0.01; }
        const d = Math.sqrt(d2);
        const sameCl = a.cluster === b.cluster ? 0.5 : 1.25;
        const f = (REP / d2) * sameCl;
        let fx = (dx / d) * f, fy = (dy / d) * f;
        // hard collision so glowing nodes never overlap
        const minSep = a.radius + b.radius + 7;
        if (d < minSep) { const push = (minSep - d) * 0.5; fx += (dx / d) * push; fy += (dy / d) * push; }
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
    }

    // Link springs (stronger relationship → shorter rest length).
    for (const e of this.edges) {
      const a = this.byId.get(e.source)!, b = this.byId.get(e.target)!;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const rest = 46 + (1 - e.weight) * 84;
      const f = SPRING * (d - rest);
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }

    const margin = 26;
    for (const node of this.nodes) {
      if (node.fixed) { node.vx = 0; node.vy = 0; node.x = cx; node.y = cy; continue; }
      // cluster cohesion
      const ce = cen.get(node.cluster)!;
      node.vx += (ce.x / ce.n - node.x) * COHESION;
      node.vy += (ce.y / ce.n - node.y) * COHESION;
      // gentle centring
      node.vx += (cx - node.x) * CENTER_G;
      node.vy += (cy - node.y) * CENTER_G;
      node.vx *= DAMP; node.vy *= DAMP;
      const sp = Math.hypot(node.vx, node.vy), max = 18 * k + 1.5;
      if (sp > max) { node.vx = node.vx / sp * max; node.vy = node.vy / sp * max; }
      node.x += node.vx; node.y += node.vy;
      node.x = Math.max(margin, Math.min(this.w - margin, node.x));
      node.y = Math.max(margin, Math.min(this.h - margin, node.y));
    }

    this.alpha *= 0.972;
    return true;
  }
}
