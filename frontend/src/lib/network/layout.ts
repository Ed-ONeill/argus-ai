/**
 * lib/network/layout.ts — deterministic constellation layout (M4.1A).
 *
 * The M4.1 columnar layout fixed the engineering (determinism, stability,
 * collision) but read as a flowchart. M4.1A keeps every guarantee and moves
 * to a CONSTELLATION: causal depth still flows left → right, but entities sit
 * in spatially grouped clusters instead of four spreadsheet columns.
 *
 * Composition (fractions of the canvas; deterministic, no physics):
 *   • drivers anchor the LEFT EDGE (external forces entering the system),
 *     split into upper-left / lower-left groups;
 *   • the FOCAL intelligence object — the dominant (highest-conviction)
 *     theme; honestly a theme until the M4.2 narrative class — sits
 *     center-left of the analytical area (aligned with the story panel);
 *   • remaining themes form a structured constellation around the focal on
 *     deterministic elliptical slots (alternating above/below);
 *   • industries are downstream junctions in the right-center band, ordered
 *     by the barycenter of their source themes;
 *   • assets orbit their PRIMARY industry in small fans (multi-exposure
 *     assets keep edges to every cluster but sit with their strongest one).
 *
 * Kept guarantees (tested):
 *   identical model → identical positions; no time input; surviving nodes
 *   keep their relative order when the set changes; boxes never overlap
 *   (deterministic separation passes); everything stays in-bounds; zone
 *   anchors (`columns`) still ascend in causal order; a final fit pass makes
 *   content use ~75-90% of the canvas and centers sparse graphs.
 */

import type { NetworkModel, NetworkNode, NodeClass } from "./model";

export interface LayoutBox {
  id: string;
  cls: NodeClass;
  tier: 1 | 2 | 3 | 4;
  x: number;        // center x
  y: number;        // center y
  w: number;
  h: number;
  /** Wrapped display lines (1-2). Full label lives on the node/hover card. */
  lines: string[];
  label: string;    // single-line fallback (lines joined)
  truncated: boolean;
}

export interface NetworkLayout {
  key: string;
  width: number;
  height: number;
  boxes: Map<string, LayoutBox>;
  /** Zone anchors per present class — mean x ascends in causal order. */
  columns: { cls: NodeClass; x: number; label: string }[];
  focalId: string | null;
}

export const COLUMN_ORDER: NodeClass[] = ["driver", "narrative", "theme", "industry", "asset"];
const ZONE_LABEL: Record<NodeClass, string> = {
  driver: "DRIVERS", narrative: "NARRATIVES", theme: "THEMES",
  industry: "INDUSTRIES", asset: "ASSETS",
};

// Tiered node metrics — prominence comes from canonical standing, not physics.
const TIER_METRICS = {
  1: { h: 64, minW: 190, maxW: 236, font: 12 },   // focal theme/narrative
  2: { h: 48, minW: 148, maxW: 186, font: 11 },   // themes, major drivers
  3: { h: 32, minW: 100, maxW: 148, font: 10.5 }, // industries
  4: { h: 20, minW: 50,  maxW: 84,  font: 9.5 },  // assets
} as const;
const DRIVER_BOX = { h: 24, minW: 88, maxW: 150, font: 10 };

/** Pure text-width heuristic (avg glyph ≈ 0.62em for the UI sans stack). */
export function approxTextWidth(text: string, font: number): number {
  let w = 0;
  for (const ch of text) w += /[iIl1.,:;'|!]/.test(ch) ? 0.32 : /[mwMW@]/.test(ch) ? 0.92 : 0.62;
  return w * font;
}

/** Wrap a label into at most `maxLines` lines fitting `maxW` (deterministic). */
export function wrapLabel(label: string, font: number, maxW: number, maxLines: number):
  { lines: string[]; truncated: boolean } {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const attempt = cur ? `${cur} ${word}` : word;
    if (approxTextWidth(attempt, font) <= maxW || !cur) cur = attempt;
    else { lines.push(cur); cur = word; if (lines.length === maxLines - 1) break; }
  }
  const used = lines.reduce((s, l) => s + l.split(/\s+/).length, 0);
  const rest = words.slice(used).join(" ") || cur;
  let truncated = false;
  let last = rest;
  while (last.length > 3 && approxTextWidth(last + (truncated ? "…" : ""), font) > maxW) {
    last = last.slice(0, -1); truncated = true;
  }
  lines.push(truncated ? last + "…" : last);
  return { lines, truncated };
}

/** Node authority tier from canonical fields (conviction / class / focality). */
export function tierOf(n: NetworkNode, isFocal: boolean): 1 | 2 | 3 | 4 {
  if (isFocal) return 1;
  if (n.cls === "theme" || n.cls === "narrative") return 2;
  if (n.cls === "driver") return 2;
  if (n.cls === "industry") return 3;
  return 4;
}

/** The focal intelligence object: dominant narrative when present (M4.2),
    else the highest-conviction theme — never a synthetic hub. */
export function focalNodeId(model: NetworkModel): string | null {
  const narratives = model.nodes.filter(n => n.cls === "narrative");
  const pool = narratives.length ? narratives : model.nodes.filter(n => n.cls === "theme");
  if (!pool.length) return null;
  return [...pool].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || a.id.localeCompare(b.id))[0].id;
}

function fit(cls: NodeClass, tier: 1 | 2 | 3 | 4, raw: string) {
  const m = cls === "driver" ? DRIVER_BOX : TIER_METRICS[tier];
  const maxLines = tier <= 2 && cls !== "driver" ? 2 : 1;
  const pad = cls === "asset" ? 14 : 22;
  const { lines, truncated } = wrapLabel(raw, m.font, m.maxW - pad, maxLines);
  const w = Math.max(m.minW, Math.min(m.maxW,
    Math.max(...lines.map(l => approxTextWidth(l, m.font))) + pad));
  const h = m.h + (lines.length > 1 ? 10 : 0);
  return { lines, truncated, w, h };
}

export function computeLayout(model: NetworkModel, width: number, height: number): NetworkLayout {
  const boxes = new Map<string, LayoutBox>();
  const key = `${model.key}@${width}x${height}`;
  if (!model.nodes.length) return { key, width, height, boxes, columns: [], focalId: null };

  const focalId = focalNodeId(model);
  const byClass = (cls: NodeClass) => model.nodes.filter(n => n.cls === cls);
  const bySrc = new Map<string, string[]>();   // source → targets
  const byTgt = new Map<string, { source: string; strength: number }[]>();
  for (const e of model.edges) {
    (bySrc.get(e.source) ?? bySrc.set(e.source, []).get(e.source)!).push(e.target);
    (byTgt.get(e.target) ?? byTgt.set(e.target, []).get(e.target)!).push({ source: e.source, strength: e.strength });
  }

  const place = (n: NetworkNode, x: number, y: number) => {
    const tier = tierOf(n, n.id === focalId);
    const f = fit(n.cls, tier, n.cls === "asset" ? (n.ticker ?? n.label) : n.label);
    boxes.set(n.id, { id: n.id, cls: n.cls, tier, x, y, w: f.w, h: f.h,
                      lines: f.lines, label: f.lines.join(" "), truncated: f.truncated });
  };

  // ── themes: focal + elliptical constellation slots ──────────────────────────
  const themes = [...byClass("theme"), ...byClass("narrative")]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || a.id.localeCompare(b.id));
  const fx = width * 0.40, fy = height * 0.46;
  // deterministic slots around the focal: alternating above/below, drifting
  // right so causal depth still reads left→right, never a column
  const SLOTS: [number, number][] = [
    [-0.07, -0.33], [-0.03, 0.34], [0.13, -0.26], [0.10, 0.24],
    [-0.16, 0.06], [0.18, -0.02], [-0.11, -0.16], [0.04, 0.14],
  ];
  themes.forEach(t => {
    if (t.id === focalId) { place(t, fx, fy); return; }
    const slotIdx = themes.filter(x => x.id !== focalId).indexOf(t);
    const [dx, dy] = SLOTS[slotIdx % SLOTS.length];
    const spill = Math.floor(slotIdx / SLOTS.length) * 0.06;
    place(t, fx + (dx + spill) * width, fy + dy * height);
  });

  // ── drivers: left-edge anchors, upper-left / lower-left groups ──────────────
  const themeY = (id: string) => boxes.get(id)?.y ?? fy;
  const drivers = byClass("driver").sort((a, b) => {
    const strongest = (d: NetworkNode) => Math.max(0,
      ...(bySrc.get(d.id) ?? []).map(t => model.nodes.find(n => n.id === t)?.confidence ?? 0));
    return strongest(b) - strongest(a) || a.id.localeCompare(b.id);
  });
  drivers.forEach((d, i) => {
    // anchor toward the mean y of the themes this driver feeds
    const fed = (bySrc.get(d.id) ?? []).map(themeY);
    const anchorY = fed.length ? fed.reduce((a, b) => a + b, 0) / fed.length : fy;
    const band = i % 2 === 0 ? -1 : 1;                     // alternate above/below its anchor
    place(d, width * 0.085, Math.max(height * 0.12,
      Math.min(height * 0.88, anchorY + band * (10 + Math.floor(i / 2) * 26))));
  });

  // ── industries: downstream junctions ordered by source-theme barycenter ─────
  const industries = byClass("industry").sort((a, b) => {
    const bary = (n: NetworkNode) => {
      const ys = (byTgt.get(n.id) ?? []).map(e => themeY(e.source));
      return ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : fy;
    };
    return bary(a) - bary(b) || (b.supportCount ?? 0) - (a.supportCount ?? 0) || a.id.localeCompare(b.id);
  });
  const iBandTop = height * 0.14, iBandBot = height * 0.86;
  industries.forEach((n, i) => {
    const t = industries.length === 1 ? 0.5 : i / (industries.length - 1);
    // staggered x so downstream clusters read as constellations, not a rail
    place(n, width * (i % 2 === 0 ? 0.635 : 0.70), iBandTop + t * (iBandBot - iBandTop));
  });

  // ── assets: small deterministic fans around their PRIMARY industry ──────────
  const assets = byClass("asset").sort((a, b) => a.id.localeCompare(b.id));
  const fanCount = new Map<string, number>();
  const primaryIndustry = (a: NetworkNode): string | null => {
    const ins = (byTgt.get(a.id) ?? []).filter(e => boxes.get(e.source)?.cls === "industry");
    if (!ins.length) return null;
    return [...ins].sort((x, y) => y.strength - x.strength || x.source.localeCompare(y.source))[0].source;
  };
  // fan slots spread wider than the collision padding so local constellations
  // survive separation instead of collapsing into a vertical ticker rail
  const FAN: [number, number][] = [[1.0, -1.0], [1.0, 1.0], [1.6, 0], [1.55, -1.2], [1.55, 1.2], [2.1, -0.5], [2.1, 0.5]];
  for (const a of assets) {
    const home = primaryIndustry(a);
    const hub = home ? boxes.get(home) : null;
    if (!hub) { place(a, width * 0.85, fy); continue; }
    const k = fanCount.get(home!) ?? 0;
    fanCount.set(home!, k + 1);
    const [rx, ry] = FAN[k % FAN.length];
    const ring = Math.floor(k / FAN.length);
    place(a, hub.x + hub.w / 2 + (52 + ring * 44) * rx, hub.y + (19 + ring * 8) * ry);
  }

  // ── deterministic collision separation (bounded passes, sorted order) ───────
  const all = [...boxes.values()].sort((a, b) => a.id.localeCompare(b.id));
  const padX = 14, padY = 10;
  const separate = () => {
    for (let pass = 0; pass < 32; pass++) {
      let moved = false;
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i], b = all[j];
          const ox = (a.w + b.w) / 2 + padX - Math.abs(a.x - b.x);
          const oy = (a.h + b.h) / 2 + padY - Math.abs(a.y - b.y);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          // separate along the cheaper axis; ties break by id (deterministic)
          if (oy <= ox) {
            const dir = a.y === b.y ? (a.id < b.id ? -1 : 1) : a.y < b.y ? -1 : 1;
            a.y += (dir * oy) / 2; b.y -= (dir * oy) / 2;
          } else {
            const dir = a.x === b.x ? (a.id < b.id ? -1 : 1) : a.x < b.x ? -1 : 1;
            a.x += (dir * ox) / 2; b.x -= (dir * ox) / 2;
          }
        }
      }
      if (!moved) break;
    }
  };
  const clamp = (margin: number) => {
    for (const b of all) {
      b.x = Math.max(margin + b.w / 2, Math.min(width - margin - b.w / 2, b.x));
      b.y = Math.max(margin + b.h / 2, Math.min(height - margin - b.h / 2, b.y));
    }
  };
  separate();

  // ── fit-to-content: fill ~75-90% of the canvas, center sparse graphs ─────────
  const margin = 18;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of all) {
    minX = Math.min(minX, b.x - b.w / 2); maxX = Math.max(maxX, b.x + b.w / 2);
    minY = Math.min(minY, b.y - b.h / 2); maxY = Math.max(maxY, b.y + b.h / 2);
  }
  const cw = Math.max(1, maxX - minX), ch = Math.max(1, maxY - minY);
  const target = 0.86;
  const scale = Math.min((width - margin * 2) * target / cw,
                         (height - margin * 2) * target / ch);
  const s = Math.max(0.6, Math.min(1.35, scale));          // never comic, never cramped
  const ox = width / 2 - (minX + cw / 2) * s;
  const oy = height / 2 - (minY + ch / 2) * s;
  for (const b of all) { b.x = b.x * s + ox; b.y = b.y * s + oy; }
  // scaling positions (never box sizes) can reintroduce contact when s < 1:
  // re-run separation on the FINAL coordinates, then clamp (all deterministic)
  clamp(margin);
  if (s < 1) separate();
  clamp(margin);

  // zone anchors per present class — mean x, causally ascending by construction
  const columns: NetworkLayout["columns"] = [];
  for (const cls of COLUMN_ORDER) {
    const zone = all.filter(b => b.cls === cls);
    if (!zone.length) continue;
    columns.push({ cls, x: zone.reduce((sum, b) => sum + b.x, 0) / zone.length, label: ZONE_LABEL[cls] });
  }

  return { key, width, height, boxes, columns, focalId };
}

/** Axis-aligned overlap test used by the layout tests. */
export function boxesOverlap(a: LayoutBox, b: LayoutBox): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}

/** Content bounding box (test + fit diagnostics). */
export function contentBounds(layout: NetworkLayout): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of layout.boxes.values()) {
    minX = Math.min(minX, b.x - b.w / 2); maxX = Math.max(maxX, b.x + b.w / 2);
    minY = Math.min(minY, b.y - b.h / 2); maxY = Math.max(maxY, b.y + b.h / 2);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
