"use client";

/**
 * components/network/IntelligenceNetwork.tsx — the Argus Intelligence Network
 * renderer (M4.1A visual system on the M4.1 engineering foundations).
 *
 * Foundations KEPT: deterministic constellation layout (lib/network/layout),
 * render-on-demand (zero idle rAF), canonical ids, recorded-vs-derived edge
 * provenance, prefers-reduced-motion, the Feed focus contract, and no
 * fabricated behavior of any kind.
 *
 * M4.1A visual system:
 *  - constellation composition with a FOCAL intelligence object (dominant
 *    theme until the M4.2 narrative class) center-left, aligned with the
 *    story panel;
 *  - tiered node authority (focal card → theme objects → industry junctions
 *    → ticker chips) — what matters most reads first;
 *  - faceted Argus theme objects (notched silhouette, conviction rail,
 *    intentional numerals) instead of generic dashboard rectangles;
 *  - drivers as anchored external forces (diamond + authority line);
 *  - edges DE-EMPHASIZED: thin, quiet, terminating at node boundaries; they
 *    lead only when a path is focused;
 *  - restrained atmosphere: vignette + faint dot field + localized cluster
 *    illumination — depth without neon;
 *  - meaningful motion only: 240ms layout tweens, one-shot 480ms path trace,
 *    camera easing, node entry fade. Still at rest.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Minus, RotateCcw } from "lucide-react";
import { buildNetworkModel } from "@/lib/network/model";
import type { NetworkModel, NetworkNode, NodeClass } from "@/lib/network/model";
import { tracePath, transitionMs } from "@/lib/network/model";
import { computeLayout, type LayoutBox } from "@/lib/network/layout";
import type { GraphNode } from "@/lib/graph/types";
import { TYPE, INK, SPACE, FONT_MONO, canvasFont, lineHeight } from "@/lib/network/tokens";

export { buildNetworkModel };

// ── palette: state, not decoration ─────────────────────────────────────────────
const C = {
  structure: "#94a3b8",
  bullish: "#2dd4bf",
  bearish: "#f87171",
  accent: "#52b0c8",
  focus: "#dbeafe",
  text: "rgba(255,255,255,0.92)",
  textDim: "rgba(255,255,255,0.55)",
  textFaint: "rgba(255,255,255,0.35)",
};
const dirColor = (d?: string) => d === "bullish" ? C.bullish : d === "bearish" ? C.bearish : C.structure;
const verbColor = (verb: string) => verb === "supports" ? C.bullish : verb === "pressures" ? C.bearish : C.structure;

export interface IntelligenceNetworkProps {
  model: NetworkModel;
  /** Minimum canvas height; the canvas stretches to match the aside column so
      the instrument always reads as ONE housing. */
  height?: number;
  onFocusChange?: (node: GraphNode | null) => void;
  clearNonce?: number;
  onHoverChange?: (node: GraphNode | null) => void;
  beamTokens?: Set<string> | null;
  /** Programmatic navigation (inspector chain hops): selects this node as if
      clicked. The canvas remains the single selection owner. */
  focusId?: string | null;
  /** The Intelligence Inspector column, rendered INSIDE the instrument frame
      (M5.2 single housing): shared rail, shared baseline, hairline divider. */
  aside?: React.ReactNode;
  /** Status content for the right side of the shared rail (regime, conviction). */
  railMeta?: React.ReactNode;
}

interface Cam { x: number; y: number; s: number; tx: number; ty: number; ts: number }

export default function IntelligenceNetwork({ model, height = 440, onFocusChange, clearNonce, onHoverChange, beamTokens, focusId, aside, railMeta }: IntelligenceNetworkProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 960, h: height });
  const [hovered, setHovered] = useState<{ node: NetworkNode; sx: number; sy: number } | null>(null);
  const [selected, setSelected] = useState<NetworkNode | null>(null);
  const [query, setQuery] = useState("");

  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []);

  const nodeById = useMemo(() => new Map(model.nodes.map(n => [n.id, n])), [model]);
  const layout = useMemo(() => computeLayout(model, size.w, size.h), [model, size.w, size.h]);
  // The dominant transmission chain — the default visual reading path. At
  // rest (no hover/selection) its edges carry a quiet standing emphasis so
  // the first thing read is today's thesis and its flow, not raw topology.
  const restingPath = useMemo(
    () => (layout.focalId ? tracePath(model, layout.focalId) : null),
    [model, layout.focalId]);

  // ── position tween + node entry fade ─────────────────────────────────────────
  const posRef = useRef(new Map<string, { x: number; y: number }>());
  const tweenRef = useRef<{ t0: number; dur: number; from: Map<string, { x: number; y: number }>; entering: Set<string> } | null>(null);
  const layoutKeyRef = useRef("");
  useEffect(() => {
    if (layout.key === layoutKeyRef.current) return;
    layoutKeyRef.current = layout.key;
    const from = new Map(posRef.current);
    const entering = new Set([...layout.boxes.keys()].filter(id => !from.has(id)));
    const dur = from.size ? transitionMs(reducedMotion) : 0;
    tweenRef.current = dur > 0 ? { t0: performance.now(), dur, from, entering } : null;
    if (dur === 0) posRef.current = new Map([...layout.boxes.values()].map(b => [b.id, { x: b.x, y: b.y }]));
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.key]);

  const camRef = useRef<Cam>({ x: 0, y: 0, s: 1, tx: 0, ty: 0, ts: 1 });
  const traceRef = useRef<{ id: string | null; t0: number; path: ReturnType<typeof tracePath> | null }>({ id: null, t0: 0, path: null });
  const beamRef = useRef(beamTokens ?? null);
  useEffect(() => { beamRef.current = beamTokens ?? null; schedule(); }, [beamTokens]); // eslint-disable-line react-hooks/exhaustive-deps

  const matchedId = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hit = model.nodes.find(n =>
      (n.ticker && n.ticker.toLowerCase().includes(q)) || n.label.toLowerCase().includes(q));
    return hit?.id ?? null;
  }, [query, model]);
  useEffect(() => {
    if (!matchedId) return;
    const b = layout.boxes.get(matchedId);
    if (b) { const c = camRef.current; c.tx = b.x - size.w / 2; c.ty = b.y - size.h / 2; c.ts = 1.15; schedule(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedId]);

  const onFocusRef = useRef(onFocusChange);
  useEffect(() => { onFocusRef.current = onFocusChange; }, [onFocusChange]);
  useEffect(() => { onFocusRef.current?.(selected); }, [selected]);
  const onHoverRef = useRef(onHoverChange);
  useEffect(() => { onHoverRef.current = onHoverChange; }, [onHoverChange]);
  useEffect(() => { onHoverRef.current?.(hovered?.node ?? null); }, [hovered]);

  const clearSeen = useRef(clearNonce);
  useEffect(() => {
    if (clearNonce === clearSeen.current) return;
    clearSeen.current = clearNonce;
    setSelected(null); resetCamera(); schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearNonce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setSelected(null); schedule(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // programmatic navigation from the inspector (chain hops, exposure chips)
  useEffect(() => {
    if (!focusId) return;
    const node = nodeById.get(focusId);
    if (node) setSelected(prev => (prev?.id === focusId ? prev : node));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  // ── render-on-demand ──────────────────────────────────────────────────────────
  const rafRef = useRef(0);
  const needRef = useRef(false);
  const viewRef = useRef({ hoveredId: null as string | null, selectedId: null as string | null, matchedId: null as string | null });
  useEffect(() => {
    viewRef.current = { hoveredId: hovered?.node.id ?? null, selectedId: selected?.id ?? null, matchedId };
    const focusId = selected?.id ?? hovered?.node.id ?? null;
    if (focusId !== traceRef.current.id) {
      traceRef.current = focusId
        ? { id: focusId, t0: performance.now(), path: tracePath(model, focusId) }
        : { id: null, t0: 0, path: null };
      // selection (not hover) eases the camera modestly toward the cluster
      if (selected && focusId === selected.id) {
        const b = layout.boxes.get(selected.id);
        if (b) {
          const c = camRef.current;
          c.tx = (b.x - size.w / 2) * 0.55; c.ty = (b.y - size.h / 2) * 0.55; c.ts = Math.max(c.ts, 1.05);
        }
      }
    }
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, selected, matchedId, model]);

  const drawRef = useRef<(now: number) => void>(() => {});
  const schedule = useCallback(() => {
    if (needRef.current) return;
    needRef.current = true;
    rafRef.current = requestAnimationFrame(t => drawRef.current(t));
  }, []);

  // atmosphere layer (vignette + dot field) — pre-rendered once per size
  const atmosRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const atmosphere = useCallback((w: number, h: number): HTMLCanvasElement => {
    const key = `${w}x${h}`;
    if (atmosRef.current?.key === key) return atmosRef.current.canvas;
    const off = document.createElement("canvas");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    off.width = w * dpr; off.height = h * dpr;
    const ctx = off.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // faint intelligence-field dot grid
    ctx.fillStyle = "rgba(148,163,184,0.05)";
    for (let gx = 12; gx < w; gx += 26)
      for (let gy = 12; gy < h; gy += 26) ctx.fillRect(gx, gy, 1, 1);
    // soft vignette — deep edges, open center
    const vg = ctx.createRadialGradient(w * 0.45, h * 0.46, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    vg.addColorStop(0, "rgba(5,9,16,0)");
    vg.addColorStop(1, "rgba(3,6,12,0.55)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    atmosRef.current = { key, canvas: off };
    return off;
  }, []);

  const draw = useCallback((now: number) => {
    try { drawInner(now); } catch (e) {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) { ctx.fillStyle = "#f87171"; ctx.font = "12px monospace"; ctx.fillText(String(e).slice(0, 160), 12, 20); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, model, nodeById, size, reducedMotion, atmosphere, restingPath]);

  const drawInner = useCallback((now: number) => {
    needRef.current = false;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { w, h } = size;
    const cam = camRef.current;
    const v = viewRef.current;
    let animating = false;

    const eps = 0.3;
    if (Math.abs(cam.tx - cam.x) > eps || Math.abs(cam.ty - cam.y) > eps || Math.abs(cam.ts - cam.s) > 0.002) {
      if (reducedMotion) { cam.x = cam.tx; cam.y = cam.ty; cam.s = cam.ts; }
      else { cam.x += (cam.tx - cam.x) * 0.22; cam.y += (cam.ty - cam.y) * 0.22; cam.s += (cam.ts - cam.s) * 0.22; animating = true; }
    } else { cam.x = cam.tx; cam.y = cam.ty; cam.s = cam.ts; }

    const tween = tweenRef.current;
    let tw = 1;
    if (tween) {
      tw = Math.min(1, (now - tween.t0) / tween.dur);
      if (tw >= 1) tweenRef.current = null; else animating = true;
    }
    const twEase = 1 - Math.pow(1 - tw, 3);
    const posOf = (b: LayoutBox) => {
      if (!tween) return { x: b.x, y: b.y };
      const f = tween.from.get(b.id);
      if (!f) return { x: b.x, y: b.y };
      return { x: f.x + (b.x - f.x) * twEase, y: f.y + (b.y - f.y) * twEase };
    };
    const enterAlpha = (id: string) => (tween?.entering.has(id) ? twEase : 1);
    if (!tween) posRef.current = new Map([...layout.boxes.values()].map(b => [b.id, { x: b.x, y: b.y }]));

    const trace = traceRef.current;
    const tracing = !!trace.id && !!trace.path;
    const traceP = reducedMotion ? 1 : Math.min(1, tracing ? (now - trace.t0) / 480 : 1);
    if (tracing && traceP < 1) animating = true;
    const tierRank: Record<NodeClass, number> = { driver: 0, narrative: 1, theme: 1, industry: 2, asset: 3 };
    const revealOf = (cls: NodeClass) => {
      if (!tracing || traceP >= 1) return 1;
      const start = (tierRank[cls] / 4) * 0.7;
      return Math.max(0, Math.min(1, (traceP - start) / 0.3));
    };

    let beamSet: Set<string> | null = null;
    if (!tracing && beamRef.current?.size) {
      beamSet = new Set();
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      for (const n of model.nodes) {
        const toks = [n.ticker, n.label, ...(n.themes ?? [])].filter(Boolean).map(x => norm(String(x)));
        if (toks.some(t => beamRef.current!.has(t))) beamSet.add(n.id);
      }
      if (!beamSet.size) beamSet = null;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(atmosphere(w, h), 0, 0, w, h);
    const W2S = (x: number, y: number): [number, number] => [(x - cam.x - w / 2) * cam.s + w / 2, (y - cam.y - h / 2) * cam.s + h / 2];

    // ── localized cluster illumination (depth, not glow) ───────────────────────
    const lum = (bx: number, by: number, r: number, col: string, a: number) => {
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      g.addColorStop(0, hexA(col, a)); g.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    };
    const focal = layout.focalId ? layout.boxes.get(layout.focalId) : null;
    if (focal) {
      const p = posOf(focal); const [bx, by] = W2S(p.x, p.y);
      lum(bx, by, 190 * cam.s, C.accent, 0.05);
    }
    for (const b of layout.boxes.values()) {
      if (b.cls !== "industry") continue;
      const p = posOf(b); const [bx, by] = W2S(p.x + 34 * cam.s, p.y);
      lum(bx, by, 96 * cam.s, "#64748b", 0.035);
    }

    const activeSet = tracing ? trace.path!.nodes : beamSet;
    const activeEdges = tracing ? trace.path!.edges : null;

    // ── edges: quiet by default, decisive when focused ─────────────────────────
    for (const e of model.edges) {
      const a = layout.boxes.get(e.source), b = layout.boxes.get(e.target);
      if (!a || !b) continue;
      const pa = posOf(a), pb = posOf(b);
      // terminate cleanly at node boundaries along the connecting direction
      const [ax, ay] = W2S(...edgeAnchor(pa, a, pb));
      const [bx, by] = W2S(...edgeAnchor(pb, b, pa));
      const lit = activeEdges ? activeEdges.has(e.id) : false;
      const faded = activeSet && !lit && !(beamSet && beamSet.has(e.source) && beamSet.has(e.target));
      const col = lit ? C.focus : verbColor(e.verb);
      const targetCls = nodeById.get(e.target)?.cls ?? "asset";
      const reveal = lit ? revealOf(targetCls) : 1;
      const strong = e.strength >= 0.65 && e.confidence >= 0.65;
      // standing emphasis on the dominant chain when nothing is focused
      const onRestingPath = !activeSet && restingPath?.edges.has(e.id);

      let alpha = e.provenance === "recorded" ? (strong ? 0.3 : 0.18) : 0.1;
      if (faded) alpha = 0.03;
      else if (lit) alpha = 0.85 * (0.15 + 0.85 * reveal);
      else if (onRestingPath) alpha = Math.min(0.5, alpha * 2.1);
      const width = (0.5 + e.strength * (strong ? 1.1 : 0.7)) * cam.s
        * (lit ? 1.6 : onRestingPath ? 1.25 : 1);
      const entry = Math.min(enterAlpha(e.source), enterAlpha(e.target));

      ctx.save();
      ctx.strokeStyle = hexA(col, alpha * entry);
      ctx.lineWidth = width;
      if (e.confidence < 0.4) ctx.setLineDash([2, 4]);
      else if (e.confidence < 0.7) ctx.setLineDash([6, 4]);
      if (lit && !faded) { ctx.shadowColor = hexA(C.accent, 0.35); ctx.shadowBlur = 5; }
      const dx = bx - ax;
      const bow = Math.abs(by - ay) < 8 ? 0 : (by > ay ? 1 : -1) * Math.min(26, Math.abs(by - ay) * 0.25);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.bezierCurveTo(ax + dx * 0.45, ay + bow, bx - dx * 0.3, by - bow * 0.4, bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      // refined arrowhead along the bezier approach; hollow = derived provenance
      const inx = bx - (bx - dx * 0.3), iny = by - (by - bow * 0.4);   // approach vector
      const ilen = Math.hypot(inx, iny) || 1;
      const ux = inx / ilen, uy = iny / ilen;
      const s = (3 + e.strength * 1.8) * cam.s * (lit ? 1.25 : 1);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - s * ux + s * 0.45 * uy, by - s * uy - s * 0.45 * ux);
      ctx.lineTo(bx - s * ux - s * 0.45 * uy, by - s * uy + s * 0.45 * ux);
      ctx.closePath();
      if (e.provenance === "recorded") { ctx.fillStyle = hexA(col, Math.min(1, alpha * 2) * entry); ctx.fill(); }
      else { ctx.strokeStyle = hexA(col, Math.min(1, alpha * 2.2) * entry); ctx.lineWidth = 0.9 * cam.s; ctx.stroke(); }
      ctx.restore();

      if (lit && cam.s > 0.75 && reveal > 0.6) {
        const [lx, ly] = [(ax + bx) / 2, (ay + by) / 2 + bow * 0.4];
        ctx.save();
        ctx.font = canvasFont(TYPE.xs, 600, 0.85);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const lbl = e.verb.replace("_", " ").toUpperCase();
        const twd = ctx.measureText(lbl).width;
        ctx.fillStyle = "rgba(6,10,17,0.92)";
        ctx.fillRect(lx - twd / 2 - 3, ly - 6, twd + 6, 12);
        ctx.fillStyle = hexA(C.focus, 0.8);
        ctx.fillText(lbl, lx, ly);
        ctx.restore();
      }
    }

    // ── nodes: tiered intelligence objects ──────────────────────────────────────
    const drawOrder = [...model.nodes].sort((a, b) =>
      (layout.boxes.get(a.id)?.tier ?? 4) - (layout.boxes.get(b.id)?.tier ?? 4)).reverse();
    for (const n of drawOrder) {
      const b = layout.boxes.get(n.id);
      if (!b) continue;
      const p = posOf(b);
      const [x, y] = W2S(p.x, p.y);
      const isSel = v.selectedId === n.id, isHov = v.hoveredId === n.id, isMatch = v.matchedId === n.id;
      const active = isSel || isHov || isMatch;
      const grow = active ? 1.05 : 1;   // modest, controlled expansion
      const bw = b.w * cam.s * grow, bh = b.h * cam.s * grow;
      const inPath = activeSet ? activeSet.has(n.id) : true;
      const reveal = tracing && inPath ? revealOf(n.cls) : 1;
      let alpha = inPath ? (tracing ? 0.25 + 0.75 * reveal : 1) : 0.12;
      if (beamSet && !inPath) alpha = 0.22;
      alpha *= enterAlpha(n.id);

      ctx.save();
      if (active && !reducedMotion) { ctx.shadowColor = hexA(C.accent, 0.45); ctx.shadowBlur = 12; }
      drawNode(ctx, n, b, x, y, bw, bh, cam.s * grow, alpha, active, n.id === layout.focalId);
      ctx.restore();

      if (isMatch && !isSel) {
        ctx.strokeStyle = hexA(C.accent, 0.55);
        ctx.lineWidth = 1;
        ctx.strokeRect(x - bw / 2 - 3, y - bh / 2 - 3, bw + 6, bh + 6);
      }
    }

    if (animating) { needRef.current = true; rafRef.current = requestAnimationFrame(t => drawRef.current(t)); }
  }, [layout, model, nodeById, size, reducedMotion, atmosphere, restingPath]);

  useEffect(() => { drawRef.current = draw; schedule(); }, [draw, schedule]);
  // Cancelling the pending frame must also release the render-on-demand gate:
  // under StrictMode's dev double-mount the first mount's frame is cancelled
  // after needRef was set, and a stale true would swallow every later
  // schedule() — a permanently blank canvas on pages with no other state churn.
  useEffect(() => () => { cancelAnimationFrame(rafRef.current); needRef.current = false; }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // both dimensions are live: the canvas stretches with the aside column so
    // the two panels always share one bottom edge (single housing)
    const measure = () => setSize({ w: el.clientWidth, h: Math.max(height, el.clientHeight) });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [height]);

  // ── pointer interaction ───────────────────────────────────────────────────────
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pick = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cam = camRef.current;
    const sx = clientX - rect.left, sy = clientY - rect.top;
    const wx = (sx - size.w / 2) / cam.s + cam.x + size.w / 2;
    const wy = (sy - size.h / 2) / cam.s + cam.y + size.h / 2;
    let best: { node: NetworkNode; sx: number; sy: number } | null = null;
    let bestTier = 9;
    for (const b of layout.boxes.values()) {
      const p = posRef.current.get(b.id) ?? b;
      if (Math.abs(wx - p.x) <= b.w / 2 + 3 && Math.abs(wy - p.y) <= b.h / 2 + 3 && b.tier < bestTier) {
        const node = nodeById.get(b.id);
        if (node) { best = { node, sx, sy }; bestTier = b.tier; }
      }
    }
    return best;
  }, [layout, nodeById, size]);

  const onMove = (e: React.MouseEvent) => {
    if (dragRef.current) {
      const cam = camRef.current;
      cam.tx -= (e.clientX - dragRef.current.x) / cam.s;
      cam.ty -= (e.clientY - dragRef.current.y) / cam.s;
      cam.x = cam.tx; cam.y = cam.ty;
      dragRef.current = { x: e.clientX, y: e.clientY, moved: true };
      schedule();
      return;
    }
    const hit = pick(e.clientX, e.clientY);
    setHovered(prev => (prev?.node.id === hit?.node.id ? prev : hit));
    if (canvasRef.current) canvasRef.current.style.cursor = hit ? "pointer" : "grab";
  };
  const onDown = (e: React.MouseEvent) => { dragRef.current = { x: e.clientX, y: e.clientY, moved: false }; };
  const onUp = (e: React.MouseEvent) => {
    const wasDrag = dragRef.current?.moved;
    dragRef.current = null;
    if (wasDrag) return;
    const hit = pick(e.clientX, e.clientY);
    setSelected(hit ? hit.node : null);
    schedule();
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1 : -1);
  };
  const zoom = (dir: number) => { const c = camRef.current; c.ts = Math.max(0.55, Math.min(2.2, c.ts * (dir > 0 ? 1.18 : 0.85))); schedule(); };
  const resetCamera = () => { const c = camRef.current; c.tx = 0; c.ty = 0; c.ts = 1; schedule(); };

  const sparse = model.nodes.length < 3;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(148,163,184,0.16)", background: "radial-gradient(130% 110% at 42% 40%, rgba(17,26,43,0.72), rgba(5,9,16,0.96))" }}>
      {/* the shared rail — ONE name, ONE status line, spanning both panels */}
      <div className="flex items-center border-b" style={{ gap: SPACE.s2, padding: `${SPACE.s2}px ${SPACE.s3}px`, borderColor: "rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)" }}>
        <span className="font-black uppercase" style={{ fontSize: TYPE.xs, letterSpacing: "0.14em", color: "rgba(82,176,200,0.85)" }}>Intelligence Network</span>
        <span className="tabular-nums hidden sm:inline" style={{ fontSize: TYPE.xs, fontFamily: FONT_MONO, color: INK.whisper }}>{model.nodes.length} entities · {model.edges.length} relationships</span>
        {railMeta && <div className="flex items-center" style={{ gap: SPACE.s2, marginLeft: SPACE.s2 }}>{railMeta}</div>}
        <div className="relative ml-auto">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: C.textFaint }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search entity…"
            className="w-32 sm:w-40 rounded-md pl-6 pr-2 py-1 outline-none focus:w-44 transition-all"
            style={{ fontSize: TYPE.sm, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: INK.secondary }} />
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => zoom(-1)} aria-label="Zoom out" className="p-1 rounded hover:bg-white/5" style={{ color: C.textDim }}><Minus size={12} /></button>
          <button onClick={() => zoom(1)} aria-label="Zoom in" className="p-1 rounded hover:bg-white/5" style={{ color: C.textDim }}><Plus size={12} /></button>
          <button onClick={resetCamera} aria-label="Reset view" className="p-1 rounded hover:bg-white/5" style={{ color: C.textDim }}><RotateCcw size={11} /></button>
        </div>
      </div>

      {/* one body: canvas column + inspector column, divided by a hairline */}
      <div className="flex items-stretch">
        <div className="flex-1 min-w-0 flex flex-col">
          <div ref={containerRef} className="relative flex-1" style={{ minHeight: height }}>
            {sparse ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <p className="font-semibold" style={{ fontSize: TYPE.md, color: INK.secondary }}>Limited signal</p>
                <p className="max-w-[280px] mt-1" style={{ fontSize: TYPE.sm, lineHeight: 1.45, color: INK.support }}>
                  The transmission network renders once enough corroborated themes are active this cycle.
                </p>
              </div>
            ) : (
              <canvas ref={canvasRef} onMouseMove={onMove} onMouseDown={onDown} onMouseUp={onUp} onWheel={onWheel}
                onMouseLeave={() => { setHovered(null); dragRef.current = null; schedule(); }}
                className="block absolute inset-0" style={{ cursor: "grab" }} />
            )}

            {!sparse && hovered && (
              <div className="pointer-events-none absolute z-30 w-max max-w-[250px]"
                style={{ left: Math.min(hovered.sx + 14, size.w - 260), top: Math.max(8, hovered.sy - 10) }}>
                <div className="rounded-lg border px-3 py-2" style={{ background: "rgba(8,12,20,0.98)", borderColor: "rgba(255,255,255,0.13)", boxShadow: "0 12px 34px rgba(0,0,0,0.6)" }}>
                  <span className="font-semibold" style={{ fontSize: TYPE.md, color: INK.primary }}>{hovered.node.name ?? hovered.node.label}</span>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="font-bold uppercase" style={{ fontSize: TYPE.xs, letterSpacing: "0.08em", color: INK.support }}>{CLASS_LABEL[hovered.node.cls]}</span>
                    {typeof hovered.node.confidence === "number" && (
                      <span className="tabular-nums" style={{ fontSize: TYPE.xs, color: INK.support }}>Conviction <b style={{ fontFamily: FONT_MONO, color: INK.primary }}>{hovered.node.confidence}</b></span>
                    )}
                    {typeof hovered.node.delta === "number" && hovered.node.delta !== 0 && (
                      <span className="font-semibold tabular-nums" style={{ fontSize: TYPE.xs, fontFamily: FONT_MONO, color: hovered.node.delta > 0 ? C.bullish : C.bearish }}>
                        {hovered.node.delta > 0 ? "▲" : "▼"} {Math.abs(hovered.node.delta)} today
                      </span>
                    )}
                    {typeof hovered.node.supportCount === "number" && hovered.node.supportCount > 0 && (
                      <span style={{ fontSize: TYPE.xs, color: INK.support }}>{hovered.node.supportCount} supporting theme{hovered.node.supportCount > 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {hovered.node.reason && <p className="mt-2" style={{ fontSize: TYPE.sm, lineHeight: 1.45, color: INK.support }}>{hovered.node.reason}</p>}
                </div>
              </div>
            )}
          </div>

          {/* anchored baseline strip — legend left, causal cue right */}
          <div className="flex items-center border-t" style={{ gap: SPACE.s3, padding: `${SPACE.s1}px ${SPACE.s3}px`, borderColor: "rgba(255,255,255,0.05)" }}>
            <span className="flex items-center gap-1">
              <span style={{ width: 13, height: 0, borderTop: "2px solid rgba(148,163,184,0.45)" }} />
              <span style={{ fontSize: TYPE.xs, color: INK.whisper }}>recorded</span>
            </span>
            <span className="flex items-center gap-1">
              <span style={{ width: 13, height: 0, borderTop: "1px dashed rgba(148,163,184,0.35)" }} />
              <span style={{ fontSize: TYPE.xs, color: INK.whisper }}>derived</span>
            </span>
            <span style={{ fontSize: TYPE.xs, color: INK.whisper }}>▲ supportive · ▼ pressured</span>
            <span className="ml-auto font-semibold uppercase" style={{ fontSize: TYPE.xs, letterSpacing: "0.1em", color: INK.whisper }}>Cause → effect</span>
          </div>
        </div>

        {aside && (
          <div className="hidden lg:flex flex-col shrink-0 border-l"
            style={{ width: 336, padding: SPACE.s4, gap: SPACE.s3, borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.012)" }}>
            {aside}
          </div>
        )}
      </div>
    </div>
  );
}

const CLASS_LABEL: Record<NodeClass, string> = {
  driver: "Macro Driver", narrative: "Narrative", theme: "Theme", industry: "Industry", asset: "Asset",
};

// ── edge boundary anchor: intersection of the center→other ray with the box ───
function edgeAnchor(p: { x: number; y: number }, box: LayoutBox, other: { x: number; y: number }): [number, number] {
  const dx = other.x - p.x, dy = other.y - p.y;
  if (dx === 0 && dy === 0) return [p.x, p.y];
  const sx = box.w / 2 / Math.max(1e-6, Math.abs(dx));
  const sy = box.h / 2 / Math.max(1e-6, Math.abs(dy));
  const t = Math.min(sx, sy);
  return [p.x + dx * t, p.y + dy * t];
}

// ── node grammar: tiered intelligence objects ──────────────────────────────────

function drawNode(ctx: CanvasRenderingContext2D, n: NetworkNode, box: LayoutBox,
                  x: number, y: number, w: number, h: number, scale: number,
                  alpha: number, active: boolean, isFocal: boolean) {
  const stateCol = dirColor(n.direction);
  const s = Math.min(scale, 1.3);
  const inkA = (base: string, boost = 1) => {
    const m = base.match(/rgba\((\d+),(\d+),(\d+),([0-9.]+)\)/)!;
    return `rgba(${m[1]},${m[2]},${m[3]},${Math.min(1, parseFloat(m[4]) * boost * alpha)})`;
  };

  if (n.cls === "driver") {
    // external force entering the system: diamond + authority line + label
    const r = 4.5 * scale;
    const lx = x - w / 2;
    ctx.strokeStyle = hexA(C.structure, 0.28 * alpha);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx + r * 2 + 3, y); ctx.lineTo(x + w / 2, y); ctx.stroke();
    ctx.fillStyle = hexA("#cbd5e1", 0.92 * alpha);
    ctx.beginPath();
    ctx.moveTo(lx + r, y - r); ctx.lineTo(lx + 2 * r, y);
    ctx.lineTo(lx + r, y + r); ctx.lineTo(lx, y);
    ctx.closePath(); ctx.fill();
    ctx.font = canvasFont(TYPE.sm, 600, s);
    ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillStyle = inkA(INK.secondary);
    ctx.fillText(box.lines[0], lx + 2 * r + 6 * scale, y - 3 * scale);
    if (active) {
      ctx.strokeStyle = hexA(C.focus, 0.8);
      ctx.lineWidth = 1;
      ctx.strokeRect(x - w / 2 - 4, y - h / 2 - 2, w + 8, h + 4);
    }
    return;
  }

  if (n.cls === "theme" || n.cls === "narrative") {
    // faceted Argus intelligence object: notched top-right corner, measure
    // rail on the left spine, tabular figures — not a dashboard card
    const notch = Math.min(11 * scale, h * 0.32);
    const left = x - w / 2, top = y - h / 2, right = x + w / 2, bottom = y + h / 2;
    ctx.beginPath();
    ctx.moveTo(left + 4, top);
    ctx.lineTo(right - notch, top);
    ctx.lineTo(right, top + notch);
    ctx.lineTo(right, bottom - 4);
    ctx.quadraticCurveTo(right, bottom, right - 4, bottom);
    ctx.lineTo(left + 4, bottom);
    ctx.quadraticCurveTo(left, bottom, left, bottom - 4);
    ctx.lineTo(left, top + 4);
    ctx.quadraticCurveTo(left, top, left + 4, top);
    ctx.closePath();
    const body = ctx.createLinearGradient(0, top, 0, bottom);
    body.addColorStop(0, hexA("#16223a", 0.96 * alpha));
    body.addColorStop(1, hexA("#0b1424", 0.96 * alpha));
    ctx.fillStyle = body; ctx.fill();
    ctx.strokeStyle = active ? hexA(C.focus, 0.95) : hexA(isFocal ? C.accent : "#334155", (isFocal ? 0.8 : 0.9) * alpha);
    ctx.lineWidth = (active ? 1.6 : isFocal ? 1.4 : 1) * Math.min(scale, 1.4);
    ctx.stroke();
    // inner top highlight — restrained depth
    ctx.strokeStyle = hexA("#e2e8f0", 0.06 * alpha);
    ctx.beginPath(); ctx.moveTo(left + 5, top + 1.5); ctx.lineTo(right - notch - 2, top + 1.5); ctx.stroke();
    // measure rail — left spine (coherence for narratives, conviction for themes)
    const railFrac = n.cls === "narrative"
      ? Math.max(0.05, Math.min(1, (n.coherence ?? 0) / 100))
      : Math.max(0.05, Math.min(1, (n.confidence ?? 0) / 100));
    const railCol = n.cls === "narrative" ? C.accent : stateCol;
    ctx.fillStyle = hexA("#1e293b", 0.9 * alpha);
    ctx.fillRect(left + 3, top + 5, 2.5 * scale, h - 10);
    ctx.fillStyle = hexA(railCol, 0.95 * alpha);
    ctx.fillRect(left + 3, top + 5 + (h - 10) * (1 - railFrac), 2.5 * scale, (h - 10) * railFrac);

    const tx = left + 12 * scale;
    if (n.cls === "narrative") {
      // the dominant thesis object: eyebrow, title, coherence figure + members.
      // Coherence is a structural measure — labeled, never shown as conviction.
      ctx.font = canvasFont(TYPE.xs, 800, s * 0.85);
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillStyle = hexA(C.accent, 0.9 * alpha);
      ctx.fillText("DOMINANT NARRATIVE", tx, top + 7 * scale);
      ctx.font = canvasFont(TYPE.lg, 700, s);
      ctx.fillStyle = inkA(INK.primary);
      const nTitleTop = top + 18 * scale;
      box.lines.forEach((line, i) => ctx.fillText(line, tx, nTitleTop + i * lineHeight(TYPE.lg, s)));
      // figure-first bottom row: the numeral dominates, labels whisper
      ctx.textBaseline = "alphabetic";
      if (typeof n.coherence === "number") {
        ctx.font = canvasFont(TYPE.lg, 800, s, true);
        ctx.fillStyle = hexA(C.accent, 0.95 * alpha);
        const fig = `${n.coherence}`;
        ctx.fillText(fig, tx, bottom - 8 * scale);
        const figW = ctx.measureText(fig).width;
        ctx.font = canvasFont(TYPE.xs, 700, s * 0.85);
        ctx.fillStyle = inkA(INK.whisper, 1.5);
        ctx.fillText(`COHERENCE · ${n.members?.length ?? 0} THEMES`, tx + figW + 6 * scale, bottom - 8 * scale);
      } else {
        ctx.font = canvasFont(TYPE.xs, 700, s * 0.85);
        ctx.fillStyle = inkA(INK.whisper, 1.5);
        ctx.fillText(`${n.members?.length ?? 0} THEMES`, tx, bottom - 8 * scale);
      }
      return;
    }
    if (isFocal) {
      ctx.font = canvasFont(TYPE.xs, 800, s * 0.85);
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillStyle = hexA(C.accent, 0.85 * alpha);
      // honest label: a theme standing in as focal when no narrative derives
      ctx.fillText("DOMINANT THEME", tx, top + 7 * scale);
    }
    ctx.font = canvasFont(isFocal ? TYPE.lg : TYPE.sm, isFocal ? 700 : 600, s);
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillStyle = inkA(isFocal ? INK.primary : INK.secondary);
    const titleTop = top + (isFocal ? 18 : 7) * scale;
    box.lines.forEach((line, i) =>
      ctx.fillText(line, tx, titleTop + i * lineHeight(isFocal ? TYPE.lg : TYPE.sm, s)));
    // the Figure: the conviction numeral is the boldest ink on the plate
    ctx.font = canvasFont(isFocal ? TYPE.xl : TYPE.lg, 800, s, true);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexA(stateCol, 0.98 * alpha);
    const conv = `${n.confidence ?? "—"}`;
    ctx.fillText(conv, tx, bottom - 8 * scale);
    const convW = ctx.measureText(conv).width;
    if (typeof n.delta === "number" && n.delta !== 0) {
      ctx.font = canvasFont(TYPE.xs, 700, s, true);
      ctx.fillStyle = hexA(n.delta > 0 ? C.bullish : C.bearish, 0.9 * alpha);
      ctx.fillText(`${n.delta > 0 ? "▲" : "▼"}${Math.abs(n.delta)}`, tx + convW + 5 * scale, bottom - 8 * scale);
    }
    if (n.momentumLabel && (isFocal || scale > 1.15)) {
      ctx.font = canvasFont(TYPE.xs, 600, s * 0.85);
      ctx.textAlign = "right";
      ctx.fillStyle = inkA(INK.whisper, 1.4);
      ctx.fillText(n.momentumLabel.toUpperCase(), right - 8 * scale, bottom - 8 * scale);
    }
    return;
  }

  if (n.cls === "industry") {
    // downstream junction: squared plate with a directional edge tab
    const left = x - w / 2, top = y - h / 2;
    ctx.beginPath();
    ctx.rect(left, top, w, h);
    ctx.fillStyle = hexA("#0e1626", 0.94 * alpha);
    ctx.fill();
    ctx.strokeStyle = active ? hexA(C.focus, 0.95) : hexA("#334155", 0.85 * alpha);
    ctx.lineWidth = (active ? 1.5 : 1) * Math.min(scale, 1.3);
    ctx.stroke();
    ctx.fillStyle = hexA(stateCol, 0.85 * alpha);
    ctx.fillRect(left, top, 2.5 * scale, h);
    ctx.font = canvasFont(TYPE.sm, 600, s);
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = inkA(INK.secondary);
    ctx.fillText(box.lines[0], left + 8 * scale, y);
    ctx.textAlign = "right";
    const glyph = n.direction === "bearish" ? "▼" : n.direction === "bullish" ? "▲" : "•";
    const breadth = (n.supportCount ?? 0) > 1 ? ` ×${n.supportCount}` : "";
    ctx.fillStyle = hexA(stateCol, 0.92 * alpha);
    ctx.font = canvasFont(TYPE.xs, 700, s, true);
    ctx.fillText(glyph + breadth, x + w / 2 - 6 * scale, y);
    return;
  }

  // asset chip: quiet pill, tabular ticker, state-colored direction glyph
  const rr = h / 2;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + rr, y - h / 2);
  ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, rr);
  ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, rr);
  ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, rr);
  ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, rr);
  ctx.closePath();
  ctx.fillStyle = hexA("#0b1322", 0.9 * alpha);
  ctx.fill();
  ctx.strokeStyle = active ? hexA(C.focus, 0.95) : hexA(stateCol, 0.4 * alpha);
  ctx.lineWidth = (active ? 1.4 : 0.8) * Math.min(scale, 1.3);
  ctx.stroke();
  ctx.font = canvasFont(TYPE.xs, 700, s, true);
  ctx.textBaseline = "middle";
  const label = box.lines[0];
  const glyph = n.direction === "bearish" ? " ▼" : n.direction === "bullish" ? " ▲" : "";
  if (glyph) {
    const base = ctx.measureText(label).width, gw = ctx.measureText(glyph).width;
    ctx.textAlign = "left";
    ctx.fillStyle = inkA(INK.primary);
    ctx.fillText(label, x - (base + gw) / 2, y + 0.5);
    ctx.fillStyle = hexA(stateCol, 0.95 * alpha);
    ctx.fillText(glyph, x - (base + gw) / 2 + base, y + 0.5);
  } else {
    ctx.textAlign = "center";
    ctx.fillStyle = inkA(INK.primary);
    ctx.fillText(label, x, y + 0.5);
  }
}

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}
