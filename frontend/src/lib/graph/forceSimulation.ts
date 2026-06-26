/**
 * lib/graph/forceSimulation.ts — deterministic radial-ring layout with gentle relaxation.
 *
 * Nodes are anchored to concentric rings by their relationship distance from the
 * centre (deal → first ring → impact ring → narrative ring). Each node is pulled
 * toward its deterministic ring slot; light repulsion separates same-ring
 * neighbours so labels don't collide. No random placement, no chaotic physics —
 * the structure is intentional and stable across renders, then settles smoothly.
 */

import type { GraphModel, GraphNode, RelationType } from "./types";

export interface SimNode {
  id: string; x: number; y: number; vx: number; vy: number;
  fixed: boolean; radius: number; ax: number; ay: number; ring: number;
}

// Relationship distance → ring index.
function ringOf(role: RelationType | undefined): number {
  switch (role) {
    case "acquirer": case "target": case "sector": return 1;
    case "beneficiary": case "competitor": case "supplier": case "customer": return 2;
    default: return 3; // theme, second-order, cross-sector, capital-rotation
  }
}

// Node radius scales with importance (confidence / benefit), keeping the centre largest.
function nodeRadius(node: GraphNode, isCenter: boolean): number {
  if (isCenter || node.kind === "event") return 25;
  if (node.kind === "company") {
    const imp = (node.confidence ?? 50) * 0.5 + (node.beneficiaryScore ?? 50) * 0.5;
    return 10.5 + (imp / 100) * 7;
  }
  if (node.kind === "sector") return 17.5;
  if (node.kind === "theme") return 15.5;
  return 14;
}

// Deterministic per-id jitter in [0,1) (FNV-1a) — stable, never Math.random.
function jit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

export class ForceSimulation {
  nodes: SimNode[] = [];
  private byId = new Map<string, SimNode>();
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
    const prev = this.byId;

    // Group non-centre nodes by ring (preserve model order for stable angles).
    const rings: Record<number, GraphNode[]> = { 1: [], 2: [], 3: [] };
    for (const node of model.nodes) {
      if (node.id === model.centerId) continue;
      rings[ringOf(node.role)].push(node);
    }

    const minDim = Math.min(this.w, this.h);
    const aspect = Math.min(1.55, Math.max(1, this.w / Math.max(1, this.h))); // spread wider to fill the card
    const ringR: Record<number, number> = { 1: minDim * 0.21, 2: minDim * 0.34, 3: minDim * 0.47 };
    const ringRot: Record<number, number> = { 1: -Math.PI / 2, 2: -Math.PI / 2 + 0.42, 3: -Math.PI / 2 + 0.21 };

    const anchor = new Map<string, { x: number; y: number; ring: number }>();
    anchor.set(model.centerId, { x: cx, y: cy, ring: 0 });
    for (const ring of [1, 2, 3] as const) {
      const arr = rings[ring];
      const count = Math.max(1, arr.length);
      arr.forEach((node, i) => {
        const ang = ringRot[ring] + ((i + 0.5) / count) * Math.PI * 2;
        const rr = ringR[ring] * (0.9 + jit(node.id) * 0.2);
        anchor.set(node.id, { x: cx + Math.cos(ang) * rr * aspect, y: cy + Math.sin(ang) * rr, ring });
      });
    }

    this.nodes = model.nodes.map(node => {
      const a = anchor.get(node.id)!;
      const isCenter = node.id === model.centerId;
      const radius = nodeRadius(node, isCenter);
      const carried = prev.get(node.id);
      if (carried) { carried.ax = a.x; carried.ay = a.y; carried.ring = a.ring; carried.fixed = isCenter; carried.radius = radius; return carried; }
      return { id: node.id, x: a.x, y: a.y, vx: 0, vy: 0, fixed: isCenter, radius, ax: a.x, ay: a.y, ring: a.ring };
    });
    this.byId = new Map(this.nodes.map(s => [s.id, s]));
    const c = this.byId.get(model.centerId);
    if (c) { c.fixed = true; c.x = cx; c.y = cy; }
    this.alpha = 1;
  }

  get(id: string): SimNode | undefined { return this.byId.get(id); }
  resize(w: number, h: number) { this.w = w; this.h = h; this.init(this.model); this.reheat(0.6); }
  reheat(a = 0.7) { this.alpha = Math.max(this.alpha, a); }

  /** One relaxation step. Returns false once settled. */
  step(): boolean {
    if (this.alpha < 0.012) return false;
    const cx = this.w / 2, cy = this.h / 2;
    const ANCHOR = 0.085, REP = 2400, DAMP = 0.82;
    const k = this.alpha;

    // Light repulsion to declump same-ring neighbours.
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = jit(a.id + b.id) - 0.5; dy = jit(b.id + a.id) - 0.5; d2 = dx * dx + dy * dy + 0.01; }
        const minSep = (a.radius + b.radius + 14);
        if (d2 > minSep * minSep * 2.4) continue;       // only nearby pairs
        const d = Math.sqrt(d2);
        const f = REP / d2;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
    }

    const margin = 24;
    for (const node of this.nodes) {
      if (node.fixed) { node.vx = 0; node.vy = 0; node.x = cx; node.y = cy; continue; }
      node.vx += (node.ax - node.x) * ANCHOR;          // pull toward deterministic ring slot
      node.vy += (node.ay - node.y) * ANCHOR;
      node.vx *= DAMP; node.vy *= DAMP;
      const sp = Math.hypot(node.vx, node.vy), max = 14 * k + 1.2;
      if (sp > max) { node.vx = node.vx / sp * max; node.vy = node.vy / sp * max; }
      node.x += node.vx; node.y += node.vy;
      node.x = Math.max(margin, Math.min(this.w - margin, node.x));
      node.y = Math.max(margin, Math.min(this.h - margin, node.y));
    }

    this.alpha *= 0.975;
    return true;
  }
}
