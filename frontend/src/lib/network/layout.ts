/**
 * lib/network/layout.ts — deterministic staged transmission layout (M4.1).
 *
 * The layout IS the information architecture: fixed columns left → right in
 * causal order (driver → theme → industry → asset; narrative column arrives
 * with the M4.2 canonical projection), rows ordered deterministically, all
 * collision solved HERE — no physics, no per-frame simulation, no time input.
 *
 * Guarantees (tested in networkTests.ts):
 *  - identical model → identical positions (pure function of model + viewport);
 *  - no timestamps or randomness anywhere;
 *  - stable relative order for surviving nodes when the set changes
 *    (ordering keys use conviction + canonical id, never insertion order);
 *  - node boxes never overlap (per-column lane packing with minimum gaps);
 *  - labels are INSIDE node boxes (no floating labels), truncated with a
 *    deterministic ellipsis and exposed in full via the hover card;
 *  - every box stays inside the viewport when the viewport can fit it.
 *
 * Text measurement uses a character-width heuristic so the module stays pure
 * and Node-testable; the renderer uses the same boxes it computed here.
 */

import type { NetworkModel, NetworkNode, NodeClass } from "./model";

export interface LayoutBox {
  id: string;
  cls: NodeClass;
  x: number;        // center x
  y: number;        // center y
  w: number;
  h: number;
  label: string;    // display label (possibly truncated — full label on node)
  truncated: boolean;
}

export interface NetworkLayout {
  key: string;                       // model key + viewport → cache identity
  width: number;
  height: number;
  boxes: Map<string, LayoutBox>;
  columns: { cls: NodeClass; x: number; label: string }[];
}

export const COLUMN_ORDER: NodeClass[] = ["driver", "narrative", "theme", "industry", "asset"];
const COLUMN_LABEL: Record<NodeClass, string> = {
  driver: "DRIVERS", narrative: "NARRATIVES", theme: "THEMES",
  industry: "INDUSTRIES", asset: "ASSETS",
};

// Node box metrics per class (heights fixed; width fits the label up to a cap).
const METRICS: Record<NodeClass, { h: number; minW: number; maxW: number; font: number; gap: number }> = {
  driver:    { h: 26, minW: 84,  maxW: 148, font: 10,   gap: 14 },
  narrative: { h: 46, minW: 150, maxW: 200, font: 11,   gap: 16 },
  theme:     { h: 44, minW: 140, maxW: 188, font: 11,   gap: 16 },
  industry:  { h: 30, minW: 96,  maxW: 150, font: 10.5, gap: 12 },
  asset:     { h: 22, minW: 56,  maxW: 88,  font: 10,   gap: 8 },
};

/** Pure text-width heuristic (avg glyph ≈ 0.62em for the UI sans stack). */
export function approxTextWidth(text: string, font: number): number {
  let w = 0;
  for (const ch of text) w += /[iIl1.,:;'|!]/.test(ch) ? 0.32 : /[mwMW@]/.test(ch) ? 0.92 : 0.62;
  return w * font;
}

function fitLabel(label: string, cls: NodeClass): { text: string; w: number; truncated: boolean } {
  const m = METRICS[cls];
  const pad = 20;
  const full = approxTextWidth(label, m.font) + pad;
  if (full <= m.maxW) return { text: label, w: Math.max(m.minW, full), truncated: false };
  let s = label;
  while (s.length > 3 && approxTextWidth(s + "…", m.font) + pad > m.maxW) s = s.slice(0, -1);
  return { text: s + "…", w: m.maxW, truncated: true };
}

/** Deterministic within-column ordering: causal legibility, then identity. */
function orderColumn(cls: NodeClass, nodes: NetworkNode[], rowOf: Map<string, number>,
                     upstream: Map<string, string[]>): NetworkNode[] {
  const barycenter = (n: NetworkNode): number => {
    const rows = (upstream.get(n.id) ?? []).map(u => rowOf.get(u)).filter((r): r is number => r !== undefined);
    return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : Number.POSITIVE_INFINITY;
  };
  return [...nodes].sort((a, b) => {
    if (cls === "theme" || cls === "narrative")
      return (b.confidence ?? 0) - (a.confidence ?? 0) || a.id.localeCompare(b.id);
    // downstream columns follow their sources (crossing minimization), then
    // support breadth, then canonical id — all deterministic.
    const d = barycenter(a) - barycenter(b);
    if (Number.isFinite(d) && d !== 0) return d;
    const s = (b.supportCount ?? 0) - (a.supportCount ?? 0);
    if (s !== 0) return s;
    return a.id.localeCompare(b.id);
  });
}

export function computeLayout(model: NetworkModel, width: number, height: number): NetworkLayout {
  const byClass = new Map<NodeClass, NetworkNode[]>();
  for (const n of model.nodes) (byClass.get(n.cls) ?? byClass.set(n.cls, []).get(n.cls)!).push(n);

  const present = COLUMN_ORDER.filter(c => (byClass.get(c) ?? []).length > 0);
  const boxes = new Map<string, LayoutBox>();
  const columns: NetworkLayout["columns"] = [];
  if (present.length === 0) return { key: `${model.key}@${width}x${height}`, width, height, boxes, columns };

  // upstream adjacency (target → sources) for barycenter ordering
  const upstream = new Map<string, string[]>();
  for (const e of model.edges) (upstream.get(e.target) ?? upstream.set(e.target, []).get(e.target)!).push(e.source);
  for (const arr of upstream.values()) arr.sort();

  // column x centers: even distribution with side margins scaled to widest box
  const marginX = 24;
  const usable = Math.max(1, width - marginX * 2);
  const colX = (i: number) => marginX + (present.length === 1 ? usable / 2 : (usable * i) / (present.length - 1));

  const topPad = 30;          // room for column headers
  const bottomPad = 16;
  const availH = Math.max(60, height - topPad - bottomPad);

  const rowOf = new Map<string, number>();
  present.forEach((cls, ci) => {
    const m = METRICS[cls];
    const ordered = orderColumn(cls, byClass.get(cls)!, rowOf, upstream);
    // lane packing: stack from vertical center with fixed heights + gaps;
    // compress the gap when the column would overflow (never overlap: gap >= 3)
    const need = ordered.length * m.h + (ordered.length - 1) * m.gap;
    const gap = need > availH && ordered.length > 1
      ? Math.max(3, (availH - ordered.length * m.h) / (ordered.length - 1))
      : m.gap;
    const total = ordered.length * m.h + (ordered.length - 1) * gap;
    let y = topPad + Math.max(0, (availH - total) / 2) + m.h / 2;
    const cx = colX(ci);
    ordered.forEach((n, ri) => {
      const fitted = fitLabel(n.cls === "asset" ? (n.ticker ?? n.label) : n.label, cls);
      const half = fitted.w / 2;
      const x = Math.max(marginX + half, Math.min(width - marginX - half, cx));
      boxes.set(n.id, { id: n.id, cls, x, y, w: fitted.w, h: m.h, label: fitted.text, truncated: fitted.truncated });
      rowOf.set(n.id, ri);
      y += m.h + gap;
    });
    columns.push({ cls, x: cx, label: COLUMN_LABEL[cls] });
  });

  return { key: `${model.key}@${width}x${height}`, width, height, boxes, columns };
}

/** Axis-aligned overlap test used by the layout tests. */
export function boxesOverlap(a: LayoutBox, b: LayoutBox): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}
