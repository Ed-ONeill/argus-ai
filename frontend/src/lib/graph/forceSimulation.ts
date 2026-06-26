/**
 * lib/graph/forceSimulation.ts — the Market Transmission layout engine.
 *
 * Not a generic network graph: the layout itself communicates influence. The
 * primary node is the gravitational centre; everything else is organised by how
 * it transmits from the event. RADIUS encodes influence distance (direct
 * participants closest, then capital-flow themes, then beneficiaries/competitors,
 * then suppliers / regulators / countries, then second-order effects). ANGLE
 * encodes the semantic group (beneficiaries in one arc, competitors in another…)
 * so clusters separate cleanly. Edge springs pull strong relationships shorter,
 * collision forbids overlap, and a very slow orbital drift keeps the system alive.
 * Seeded deterministically per graph (FNV hashes) — never random, always stable.
 */

import type { GraphModel, GraphNode, RelationType } from "./types";

export interface SimNode {
  id: string; x: number; y: number; vx: number; vy: number;
  fixed: boolean; radius: number; cluster: string; tier: number;
  baseAngle: number; targetR: number; phase: number;
}

// Four colour clusters for the soft background haze.
export function clusterOf(role: RelationType | undefined): string {
  switch (role) {
    case "event": case "acquirer": case "target": return "core";
    case "sector": case "beneficiary": case "competitor": case "supplier": case "customer": return "market";
    case "second-order": return "second";
    default: return "narrative";
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
  private model: GraphModel;
  private w: number;
  private h: number;
  private aspectX = 1;
  private time = 0;
  private rootOverride: string | null = null;
  alpha = 1;

  constructor(model: GraphModel, width: number, height: number) {
    this.model = model; this.w = width; this.h = height;
    this.init(model);
  }

  init(model: GraphModel) {
    this.model = model;
    const cx = this.w / 2, cy = this.h / 2;
    const span = Math.min(this.w, this.h) / 2 - 30;
    this.aspectX = Math.min(1.6, Math.max(1, (this.w / 2 - 30) / Math.max(1, span)));

    // Layout root — the gravitational centre. Clicking a node re-roots here, and the
    // whole transmission tree smoothly reorganises around it (no model swap, no jumps).
    const centerId = (this.rootOverride && model.nodes.some(n => n.id === this.rootOverride)) ? this.rootOverride : model.centerId;

    // ── Radial TRANSMISSION TREE: radius = transmission depth (hops from the root),
    //    angle = subtree. Cause→effect chains cascade outward as readable paths. ──
    const adj = new Map<string, string[]>();
    model.nodes.forEach(n => adj.set(n.id, []));
    model.edges.forEach(e => { adj.get(e.source)?.push(e.target); adj.get(e.target)?.push(e.source); });

    const depth = new Map<string, number>([[centerId, 0]]);
    const children = new Map<string, string[]>();
    model.nodes.forEach(n => children.set(n.id, []));
    const visited = new Set<string>([centerId]);
    const queue = [centerId];
    while (queue.length) {
      const u = queue.shift()!;
      const nbrs = (adj.get(u) ?? []).slice().sort((a, b) => (a < b ? -1 : 1)); // deterministic
      for (const v of nbrs) {
        if (visited.has(v)) continue;
        visited.add(v); depth.set(v, (depth.get(u) ?? 0) + 1);
        children.get(u)!.push(v); queue.push(v);
      }
    }
    model.nodes.forEach(n => { if (!visited.has(n.id) && n.id !== centerId) { visited.add(n.id); depth.set(n.id, 1); children.get(centerId)!.push(n.id); } });

    // Leaves get equal angular slices; internal nodes centre on their children.
    let leafCount = 0;
    const countLeaves = (u: string) => { const ch = children.get(u)!; if (ch.length === 0) { leafCount++; return; } ch.forEach(countLeaves); };
    children.get(centerId)!.forEach(countLeaves);
    if (leafCount === 0) leafCount = 1;
    let cursor = 0;
    const angle = new Map<string, number>();
    const assign = (u: string): number => {
      const ch = children.get(u)!;
      if (ch.length === 0) { const a = (cursor + 0.5) / leafCount * Math.PI * 2; cursor++; angle.set(u, a); return a; }
      let s = 0; for (const c of ch) s += assign(c);
      const a = s / ch.length; angle.set(u, a); return a;
    };
    children.get(centerId)!.forEach(assign);

    const maxDepth = Math.max(1, ...[...depth.values()]);
    const ringStep = span / maxDepth;
    const rot = jit(model.id) * Math.PI * 2;

    const prev = this.byId;
    this.nodes = model.nodes.map(node => {
      const isCenter = node.id === centerId;
      const d = depth.get(node.id) ?? 1;
      const cl = clusterOf(node.role);
      const radius = nodeRadius(node, isCenter);
      const baseAngle = isCenter ? 0 : (angle.get(node.id) ?? jit(node.id) * 6.28) + rot;
      const targetR = isCenter ? 0 : Math.min(span, d * ringStep) * (0.95 + jit(node.id + "r") * 0.1);
      const tx = cx + Math.cos(baseAngle) * targetR * this.aspectX;
      const ty = cy + Math.sin(baseAngle) * targetR;
      const carried = prev.get(node.id);
      if (carried) { carried.fixed = isCenter; carried.radius = radius; carried.cluster = cl; carried.tier = d; carried.baseAngle = baseAngle; carried.targetR = targetR; return carried; }
      return { id: node.id, cluster: cl, tier: d, radius, fixed: isCenter, baseAngle, targetR, phase: jit(node.id) * 6.28, x: isCenter ? cx : tx, y: isCenter ? cy : ty, vx: 0, vy: 0 };
    });
    this.byId = new Map(this.nodes.map(s => [s.id, s]));
    const c = this.byId.get(centerId);
    if (c) c.fixed = true; // soft root — eased to centre in step(), never hard-snapped
    this.edges = model.edges
      .filter(e => this.byId.has(e.source) && this.byId.has(e.target))
      .map(e => ({ source: e.source, target: e.target, weight: e.weight }));
    this.alpha = 1;
  }

  get(id: string): SimNode | undefined { return this.byId.get(id); }
  resize(w: number, h: number) { this.w = w; this.h = h; this.init(this.model); }
  reheat(_a?: number) { /* layout is target-driven; nothing to reheat */ }

  /** Re-root the transmission tree on a node; positions carry over → smooth reflow. */
  setRoot(id: string | null) {
    const next = id ?? null;
    if (next === this.rootOverride) return;
    this.rootOverride = next;
    this.init(this.model); // carries current positions; springs ease to new targets
  }
  get rootId(): string { return this.rootOverride ?? this.model.centerId; }

  step(dt = 0.016): boolean {
    this.time += Math.min(0.05, dt);
    const cx = this.w / 2, cy = this.h / 2;
    const TARGET_K = 0.05, ESPRING = 0.02, REP = 850, DAMP = 0.84;

    // Transmission target (radius = depth, angle = subtree) + very slow orbital drift.
    for (const node of this.nodes) {
      if (node.fixed) {
        // soft root: strongly eased toward centre so re-rooting never snaps
        node.vx += (cx - node.x) * 0.16; node.vy += (cy - node.y) * 0.16;
        node.vx *= DAMP; node.vy *= DAMP;
        node.x += node.vx; node.y += node.vy;
        continue;
      }
      const drift = this.time * (0.013 / (1 + node.tier * 0.45));
      const sway = Math.sin(this.time * 0.32 + node.phase) * 0.024;
      const ang = node.baseAngle + drift + sway;
      const tx = cx + Math.cos(ang) * node.targetR * this.aspectX;
      const ty = cy + Math.sin(ang) * node.targetR;
      node.vx += (tx - node.x) * TARGET_K;
      node.vy += (ty - node.y) * TARGET_K;
    }

    // Edge springs — stronger relationships pull shorter (edge length ≈ strength).
    for (const e of this.edges) {
      const a = this.byId.get(e.source)!, b = this.byId.get(e.target)!;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const rest = 34 + (1 - e.weight) * 78;
      const f = ESPRING * (d - rest);
      const fx = (dx / d) * f, fy = (dy / d) * f;
      if (!a.fixed) { a.vx += fx; a.vy += fy; }
      if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
    }

    // Light repulsion so same-ring nodes breathe apart.
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = jit(a.id + b.id) - 0.5; dy = 0.5 - jit(b.id + a.id); d2 = dx * dx + dy * dy + 0.01; }
        if (d2 > 26000) continue;
        const d = Math.sqrt(d2), f = REP / d2;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        if (!a.fixed) { a.vx += fx; a.vy += fy; }
        if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
      }
    }

    // Integrate with damping.
    const margin = 24;
    for (const node of this.nodes) {
      if (node.fixed) continue;
      node.vx *= DAMP; node.vy *= DAMP;
      const sp = Math.hypot(node.vx, node.vy);
      if (sp > 22) { node.vx = node.vx / sp * 22; node.vy = node.vy / sp * 22; }
      node.x += node.vx; node.y += node.vy;
      node.x = Math.max(margin, Math.min(this.w - margin, node.x));
      node.y = Math.max(margin, Math.min(this.h - margin, node.y));
    }

    // Hard collision resolution — nodes must never overlap (2 position passes).
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.nodes.length; i++) {
        const a = this.nodes[i];
        for (let j = i + 1; j < this.nodes.length; j++) {
          const b = this.nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const minSep = a.radius + b.radius + 8;
          if (d < minSep) {
            const push = (minSep - d) / 2;
            const ux = dx / d, uy = dy / d;
            if (!a.fixed) { a.x -= ux * push; a.y -= uy * push; }
            if (!b.fixed) { b.x += ux * push; b.y += uy * push; }
          }
        }
      }
    }
    return true;
  }
}
