/**
 * lib/graph/forceSimulation.ts — tiny dependency-free force-directed layout.
 *
 * Coulomb repulsion + Hooke springs + centre gravity, integrated with velocity
 * damping and an annealing `alpha` so the graph settles smoothly (no jitter, no
 * runaway bouncing). O(n²) repulsion — fine for the small intelligence graphs we
 * render (≤ ~40 nodes). Reusable by any GraphModel.
 */

import type { GraphModel } from "./types";

export interface SimNode { id: string; x: number; y: number; vx: number; vy: number; fixed: boolean; radius: number }
interface SimEdge { source: string; target: string; weight: number }

export class ForceSimulation {
  nodes: SimNode[] = [];
  edges: SimEdge[] = [];
  private byId = new Map<string, SimNode>();
  private w: number;
  private h: number;
  alpha = 1;

  constructor(model: GraphModel, width: number, height: number) {
    this.w = width; this.h = height;
    this.init(model);
  }

  init(model: GraphModel) {
    const cx = this.w / 2, cy = this.h / 2;
    const prev = this.byId;
    const n = Math.max(1, model.nodes.length);
    this.nodes = model.nodes.map((node, i) => {
      const carried = prev.get(node.id);
      if (carried) { carried.fixed = node.id === model.centerId; return carried; }
      const angle = (i / n) * Math.PI * 2;
      const r = node.id === model.centerId ? 0 : 110 + (i % 3) * 40;
      return {
        id: node.id,
        x: cx + Math.cos(angle) * r + (Math.random() - 0.5) * 10,
        y: cy + Math.sin(angle) * r + (Math.random() - 0.5) * 10,
        vx: 0, vy: 0,
        fixed: node.id === model.centerId,
        radius: node.kind === "event" ? 26 : node.kind === "company" ? 13 : 16,
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
  resize(w: number, h: number) { this.w = w; this.h = h; }
  reheat(a = 0.7) { this.alpha = Math.max(this.alpha, a); }

  /** One integration step. Returns false once settled (caller can skip stepping). */
  step(): boolean {
    if (this.alpha < 0.012) return false;
    const cx = this.w / 2, cy = this.h / 2;
    const REP = 5400, SPRING = 0.05, GRAV = 0.028, DAMP = 0.85;

    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = dx * dx + dy * dy + 0.01; }
        const d = Math.sqrt(d2);
        const f = REP / d2;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
    }

    for (const e of this.edges) {
      const a = this.byId.get(e.source)!, b = this.byId.get(e.target)!;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const rest = 72 + (1 - e.weight) * 120;        // stronger relationship → shorter
      const f = SPRING * (d - rest);
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }

    const k = this.alpha, margin = 26;
    for (const node of this.nodes) {
      if (node.fixed) { node.vx = 0; node.vy = 0; node.x = cx; node.y = cy; continue; }
      node.vx += (cx - node.x) * GRAV;
      node.vy += (cy - node.y) * GRAV;
      node.vx *= DAMP; node.vy *= DAMP;
      const sp = Math.hypot(node.vx, node.vy), max = 16 * k + 1.5;
      if (sp > max) { node.vx = node.vx / sp * max; node.vy = node.vy / sp * max; }
      node.x += node.vx * k; node.y += node.vy * k;
      node.x = Math.max(margin, Math.min(this.w - margin, node.x));
      node.y = Math.max(margin, Math.min(this.h - margin, node.y));
    }

    this.alpha *= 0.972;
    return true;
  }
}
