// lib/marketView.ts — the Market surface's canonical View Model (Surface #4). The Rotation
// Map IS the product; every other part supports it and never restates it. The surface answers
// one question — "Where is market leadership moving?" — through four sections, each answering
// a DIFFERENT question, none restating another:
//
//   1. Headline   — a faithful one-line caption of the map (the five-second read).
//   2. Rotation Map — where leadership is moving right now (the product).
//   3. What changed — an editorial log of transitions between the MAP'S OWN states since the
//                     previous observation (began improving / began fading / reversed higher /
//                     reversed lower / continued improving / continued fading). One definition
//                     of leadership; the log can never contradict the map.
//   4. Watch next  — one forward-looking line.
//
// v1 is 100% price-derived: no engine, no theme/conviction/regime vocabulary, no causal
// explanation. To compare against a "previous observation", the page fetches twice the window
// and this module splits it into a prior half and a current half. Pure and deterministic.

import type { PricePoint } from "@/lib/platform/types/prices";
import { measureCrossAsset, measureSector, type Direction, type Leadership } from "@/lib/marketRotation";
import type { Bucket, BlockKind, MarketBlock } from "@/lib/marketBlocks";

export type Zoom = "whole-market" | "inside-stocks";
export type Window = "1W" | "1M" | "3M";
export type PostureTone = "defensive" | "risk-on" | "mixed" | "quiet" | "unavailable";

// Navigation follows the market concept. Asset-class blocks do NOT route to a proxy ETF page:
// until a Market Detail surface exists, selecting one focuses that block within /markets.
export type NavTarget =
  | { kind: "focus-block"; id: string }
  | { kind: "sector"; id: string; slug: string }
  | { kind: "company"; ticker: string }
  | { kind: "event"; id: string };

export interface RotationBlock {
  id: string;
  label: string;
  kind: BlockKind;
  bucket: Bucket;
  relStrength: number;   // leadership position
  direction: Direction;  // change in leadership (rising / falling / flat)
  leadDelta: number;
  absPct: number;        // supporting context only
  absent: boolean;
  proxyOf?: string;
  nav: NavTarget;
}

export type MarketVisualization =
  | { kind: "rotation-map"; zoom: Zoom; window: Window; rising: RotationBlock[]; falling: RotationBlock[]; steady: RotationBlock[]; unavailable: RotationBlock[] }
  | { kind: "none" };

export interface MarketView {
  zoom: Zoom;
  window: Window;
  posture: { sentence: string; tone: PostureTone };
  visualization: MarketVisualization;
  whatChanged: string[];      // transitions since the previous observation
  whatCouldChange: string[];  // one forward-looking line
}

export interface BlockInput { block: MarketBlock; points: PricePoint[] | null }
export interface MarketViewInput { zoom: Zoom; window: Window; blocks: BlockInput[]; benchmark: PricePoint[] | null }

const WINDOW_WORD: Record<Window, string> = { "1W": "week", "1M": "month", "3M": "three months" };
const QUIET_ABS = 1.0;   // % — when nothing moved more than this in absolute terms, leadership is "stable"

const byRel = (a: RotationBlock, b: RotationBlock): number => b.relStrength - a.relStrength;
const list = (arr: RotationBlock[], n: number): string => arr.slice(0, n).map((r) => r.label).join(" and ");
// Split a 2x-window series into [previous observation, current observation] by index midpoint.
const midSplit = <T,>(a: T[]): [T[], T[]] => { const m = Math.floor(a.length / 2); return [a.slice(0, m), a.slice(m)]; };

function toRotationBlock(block: MarketBlock, m: Leadership): RotationBlock {
  const nav: NavTarget = block.kind === "sector"
    ? { kind: "sector", id: block.id, slug: block.navSlug ?? block.id }
    : { kind: "focus-block", id: block.id };
  return {
    id: block.id, label: block.label, kind: block.kind, bucket: block.bucket,
    relStrength: m.relStrength, direction: m.direction, leadDelta: m.leadDelta, absPct: m.absPct,
    absent: m.absent, proxyOf: block.proxyOf, nav,
  };
}

// ── 1. Headline — a faithful caption of the map (never contradicts the columns) ──
export function buildPosture(rbs: RotationBlock[], quiet: boolean): { sentence: string; tone: PostureTone } {
  const usable = rbs.filter((r) => !r.absent);
  const rising = usable.filter((r) => r.direction === "rising").sort(byRel);
  const falling = usable.filter((r) => r.direction === "falling").sort(byRel);
  if (quiet || (rising.length === 0 && falling.length === 0)) {
    return { tone: "quiet", sentence: "Market leadership is broadly stable." };
  }
  const led = rising[0]?.label;
  const away = falling[0]?.label;
  // Dominant bucket among the blocks actually GAINING leadership (from the map, not from levels).
  const defs = rising.filter((r) => r.bucket === "defensive").length;
  const cycs = rising.filter((r) => r.bucket === "cyclical").length;
  if (led && defs > cycs) {
    return { tone: "defensive", sentence: `Leadership shifted toward defensives, led by ${led}${away ? `, away from ${away}` : ""}.` };
  }
  if (led && cycs > defs) {
    return { tone: "risk-on", sentence: `Leadership rotated into cyclicals, led by ${led}${away ? `, away from ${away}` : ""}.` };
  }
  const sentence = led && away ? `Leadership is rotating, led by ${led}, away from ${away}.`
    : led ? `Leadership is moving toward ${list(rising, 2)}.`
    : `Leadership is slipping in ${list(falling, 2)}.`;
  return { tone: "mixed", sentence };
}

// ── 2. Rotation Map — quiet tapes show "little changed", never a manufactured split ──
export function buildRotationMap(rbs: RotationBlock[], quiet: boolean, zoom: Zoom, window: Window): MarketVisualization {
  const usable = rbs.filter((r) => !r.absent);
  if (usable.length < 2) return { kind: "none" };
  const unavailable = rbs.filter((r) => r.absent);
  if (quiet) {
    return { kind: "rotation-map", zoom, window, rising: [], falling: [], steady: [...usable].sort(byRel), unavailable };
  }
  return {
    kind: "rotation-map", zoom, window,
    rising: usable.filter((r) => r.direction === "rising").sort(byRel),
    falling: usable.filter((r) => r.direction === "falling").sort(byRel),
    steady: usable.filter((r) => r.direction === "flat").sort(byRel),
    unavailable,
  };
}

// ── 3. What changed — an EDITORIAL LOG of transitions between the MAP'S OWN states across
// observations. There is ONE definition of leadership on the page: the map's direction
// (improving = gaining / fading = losing / steady). The log describes how a block moved
// between those states from the previous observation to now, so it can never contradict the
// column a block sits in. State CHANGES (began / reversed) are always news; a CONTINUATION
// (still improving / still fading) is reported only when the current move is material.
export function buildTransitions(prev: Leadership[], cur: Leadership[], blocks: BlockInput[], quiet: boolean, window: Window, zoom: Zoom): string[] {
  const w = WINDOW_WORD[window];
  if (quiet) return [`No leadership changes since the prior ${w}.`];
  const MATERIAL = zoom === "whole-market" ? 0.5 : 2.0;    // a continuation worth reporting, in the map's own units
  const changes: { text: string; mag: number }[] = [];    // state changes — always emitted
  const continued: { text: string; mag: number }[] = [];  // same state — only when material
  blocks.forEach((b, i) => {
    const p = prev[i], c = cur[i];
    if (!p || !c || p.absent || c.absent) return;
    const label = b.block.label;
    const mag = Math.abs(c.leadDelta);
    if (p.direction === "falling" && c.direction === "rising") changes.push({ text: `${label} reversed higher.`, mag });
    else if (p.direction === "rising" && c.direction === "falling") changes.push({ text: `${label} reversed lower.`, mag });
    else if (p.direction === "flat" && c.direction === "rising") changes.push({ text: `${label} began improving.`, mag });
    else if (p.direction === "flat" && c.direction === "falling") changes.push({ text: `${label} began fading.`, mag });
    else if (p.direction === "rising" && c.direction === "rising" && c.leadDelta > MATERIAL) continued.push({ text: `${label} continued improving.`, mag });
    else if (p.direction === "falling" && c.direction === "falling" && c.leadDelta < -MATERIAL) continued.push({ text: `${label} continued fading.`, mag });
  });
  changes.sort((a, b) => b.mag - a.mag);
  continued.sort((a, b) => b.mag - a.mag);
  // State changes first (always), then material continuations; capped so it stays a log.
  const out = [...changes, ...continued].slice(0, 4).map((t) => t.text);
  return out.length ? out : [`No leadership changes since the prior ${w}.`];
}

// ── 4. Watch next — one forward-looking line ──
export function buildWhatCouldChange(tone: PostureTone): string[] {
  switch (tone) {
    case "defensive": return ["Watch whether defensives keep the lead, or cyclicals reclaim the top."];
    case "risk-on":   return ["Watch whether cyclicals keep the lead, or defensives take it back."];
    case "quiet":     return ["Watch for the first clear shift in leadership."];
    case "mixed":     return ["Leadership is unsettled; watch which side takes control next."];
    default:          return [];
  }
}

// ── orchestrator: compose the pure builders, nothing more ─────────────────────
export function buildMarketView(input: MarketViewInput): MarketView {
  const { zoom, window, blocks, benchmark } = input;
  const splits = blocks.map((b) => (b.points ? midSplit(b.points) : [null, null] as [PricePoint[] | null, PricePoint[] | null]));
  const prevPts = splits.map((s) => s[0]);
  const curPts = splits.map((s) => s[1]);
  const [benchPrev, benchCur] = benchmark ? midSplit(benchmark) : [null, null];

  const measure = (pts: (PricePoint[] | null)[], bench: PricePoint[] | null): Leadership[] =>
    zoom === "whole-market" ? measureCrossAsset(pts) : pts.map((p) => measureSector(p, bench));
  const curL = measure(curPts, benchCur);
  const prevL = measure(prevPts, benchPrev);

  const rbs = blocks.map((b, i) => toRotationBlock(b.block, curL[i]));
  const usable = rbs.filter((r) => !r.absent);

  if (usable.length < 2) {
    return {
      zoom, window,
      posture: { tone: "unavailable", sentence: "Market data is unavailable right now." },
      visualization: { kind: "none" },
      whatChanged: [], whatCouldChange: [],
    };
  }

  const quiet = Math.max(...usable.map((r) => Math.abs(r.absPct))) < QUIET_ABS;
  const posture = buildPosture(rbs, quiet);
  return {
    zoom, window,
    posture,
    visualization: buildRotationMap(rbs, quiet, zoom, window),
    whatChanged: buildTransitions(prevL, curL, blocks, quiet, window, zoom),
    whatCouldChange: buildWhatCouldChange(posture.tone),
  };
}
