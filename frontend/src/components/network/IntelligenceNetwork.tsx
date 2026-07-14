"use client";

/**
 * components/network/IntelligenceNetwork.tsx — the Argus Intelligence Network
 * renderer (M4.1). New component family per ARGUS_INTELLIGENCE_NETWORK_V1.md;
 * the M&A NetworkGraph is deliberately untouched.
 *
 * Discipline this renderer enforces:
 *  - deterministic staged layout (lib/network/layout.ts) — no physics, no drift;
 *  - render-on-demand: rAF runs ONLY during short transitions, the one-shot
 *    selection trace, or camera easing. Idle = zero scheduled frames;
 *  - node grammar by ontology class (shape + typography, not color alone);
 *  - edge grammar: arrowheads (direction), width (strength), dash (confidence),
 *    opacity + hollow arrowhead (derived provenance);
 *  - glow appears ONLY on the selected/hovered path — never as base treatment;
 *  - prefers-reduced-motion: transitions and traces become instant;
 *  - no internal side panel (the page's contextual panel is the single
 *    inspector; M4.2 replaces it with the Network Inspector).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Minus, RotateCcw } from "lucide-react";
import { buildNetworkModel } from "@/lib/network/model";
import type { NetworkModel, NetworkNode, NetworkEdge, NodeClass } from "@/lib/network/model";
import { tracePath, transitionMs } from "@/lib/network/model";
import { computeLayout, type LayoutBox } from "@/lib/network/layout";
import type { GraphNode } from "@/lib/graph/types";

export { buildNetworkModel };

// ── palette: state, not decoration ─────────────────────────────────────────────
const C = {
  structure: "#94a3b8",           // slate — neutral structure
  structureDim: "rgba(148,163,184,0.55)",
  canvasLine: "rgba(148,163,184,0.08)",
  cardBg: "rgba(15,23,42,0.92)",
  cardBorder: "rgba(148,163,184,0.28)",
  bullish: "#2dd4bf",             // restrained teal
  bearish: "#f87171",             // restrained red
  caution: "#fbbf24",             // amber (unresolved)
  accent: "#52b0c8",              // Argus blue — sparing
  focus: "#dbeafe",               // selected path
  text: "rgba(255,255,255,0.92)",
  textDim: "rgba(255,255,255,0.55)",
  textFaint: "rgba(255,255,255,0.38)",
};

const dirColor = (d?: string) => d === "bullish" ? C.bullish : d === "bearish" ? C.bearish : C.structure;
const verbColor = (verb: NetworkEdge["verb"]) =>
  verb === "supports" ? C.bullish : verb === "pressures" ? C.bearish : C.structure;

export interface IntelligenceNetworkProps {
  model: NetworkModel;
  height?: number;
  onFocusChange?: (node: GraphNode | null) => void;
  clearNonce?: number;
  onHoverChange?: (node: GraphNode | null) => void;
  /** Page-wide hover beam tokens — matching nodes stay lit (static, no motion). */
  beamTokens?: Set<string> | null;
}

interface Cam { x: number; y: number; s: number; tx: number; ty: number; ts: number }

export default function IntelligenceNetwork({ model, height = 440, onFocusChange, clearNonce, onHoverChange, beamTokens }: IntelligenceNetworkProps) {
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

  // ── animated position state (layout → tween → static) ────────────────────────
  const posRef = useRef(new Map<string, { x: number; y: number }>());
  const tweenRef = useRef<{ t0: number; dur: number; from: Map<string, { x: number; y: number }> } | null>(null);
  const layoutKeyRef = useRef("");
  useEffect(() => {
    if (layout.key === layoutKeyRef.current) return;
    layoutKeyRef.current = layout.key;
    const from = new Map(posRef.current);
    const dur = from.size ? transitionMs(reducedMotion) : 0; // first paint: no tween
    tweenRef.current = dur > 0 ? { t0: performance.now(), dur, from } : null;
    if (dur === 0) {
      posRef.current = new Map([...layout.boxes.values()].map(b => [b.id, { x: b.x, y: b.y }]));
    }
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.key]);

  // ── camera ────────────────────────────────────────────────────────────────────
  const camRef = useRef<Cam>({ x: 0, y: 0, s: 1, tx: 0, ty: 0, ts: 1 });

  // ── one-shot selection trace ─────────────────────────────────────────────────
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
    if (b) { const c = camRef.current; c.tx = b.x - size.w / 2; c.ty = b.y - size.h / 2; c.ts = 1.2; schedule(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedId]);

  // publish focus/hover upward through refs (stable across renders)
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

  // Escape releases the selection (task 11 of the spec's interaction model)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setSelected(null); schedule(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── render-on-demand loop ─────────────────────────────────────────────────────
  const rafRef = useRef(0);
  const needRef = useRef(false);
  const viewRef = useRef({ hoveredId: null as string | null, selectedId: null as string | null, matchedId: null as string | null });
  useEffect(() => {
    viewRef.current = { hoveredId: hovered?.node.id ?? null, selectedId: selected?.id ?? null, matchedId };
    // (re)start the one-shot trace when the focused node changes
    const focusId = selected?.id ?? hovered?.node.id ?? null;
    if (focusId !== traceRef.current.id) {
      traceRef.current = focusId
        ? { id: focusId, t0: performance.now(), path: tracePath(model, focusId) }
        : { id: null, t0: 0, path: null };
    }
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, selected, matchedId, model]);

  // draw is recreated when layout/model/size change; schedule must always call
  // the CURRENT draw (ref indirection avoids a stale first-render closure).
  const drawRef = useRef<(now: number) => void>(() => {});
  const schedule = useCallback(() => {
    if (needRef.current) return;
    needRef.current = true;
    rafRef.current = requestAnimationFrame(t => drawRef.current(t));
  }, []);

  const draw = useCallback((now: number) => {
    needRef.current = false;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { w, h } = size;
    const cam = camRef.current;
    const v = viewRef.current;

    // advance short animations; request another frame ONLY while one is live
    let animating = false;

    // camera easing
    const eps = 0.3;
    if (Math.abs(cam.tx - cam.x) > eps || Math.abs(cam.ty - cam.y) > eps || Math.abs(cam.ts - cam.s) > 0.002) {
      if (reducedMotion) { cam.x = cam.tx; cam.y = cam.ty; cam.s = cam.ts; }
      else { cam.x += (cam.tx - cam.x) * 0.22; cam.y += (cam.ty - cam.y) * 0.22; cam.s += (cam.ts - cam.s) * 0.22; animating = true; }
    } else { cam.x = cam.tx; cam.y = cam.ty; cam.s = cam.ts; }

    // layout tween
    const tween = tweenRef.current;
    let tw = 1;
    if (tween) {
      tw = Math.min(1, (now - tween.t0) / tween.dur);
      if (tw >= 1) tweenRef.current = null; else animating = true;
    }
    const posOf = (b: LayoutBox): { x: number; y: number } => {
      if (!tween) return { x: b.x, y: b.y };
      const f = tween.from.get(b.id);
      if (!f) return { x: b.x, y: b.y };
      const e = 1 - Math.pow(1 - tw, 3);
      return { x: f.x + (b.x - f.x) * e, y: f.y + (b.y - f.y) * e };
    };
    if (!tween) posRef.current = new Map([...layout.boxes.values()].map(b => [b.id, { x: b.x, y: b.y }]));

    // one-shot trace reveal (480ms, staged by column depth)
    const trace = traceRef.current;
    const tracing = !!trace.id && !!trace.path;
    const traceAge = tracing ? (now - trace.t0) / 480 : 1;
    const traceP = reducedMotion ? 1 : Math.min(1, traceAge);
    if (tracing && traceP < 1) animating = true;

    const colIndex = new Map(layout.columns.map((c, i) => [c.cls, i]));
    const revealOf = (cls: NodeClass) => {
      if (!tracing || traceP >= 1) return 1;
      const ci = colIndex.get(cls) ?? 0;
      const start = (ci / Math.max(1, layout.columns.length)) * 0.7;
      return Math.max(0, Math.min(1, (traceP - start) / 0.3));
    };

    // beam highlight (page-wide hover from another section) — static
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
    const W2S = (x: number, y: number): [number, number] => [(x - cam.x - w / 2) * cam.s + w / 2, (y - cam.y - h / 2) * cam.s + h / 2];

    // ── column rails + headers ──────────────────────────────────────────────────
    for (const col of layout.columns) {
      const [cx] = W2S(col.x, 0);
      ctx.strokeStyle = C.canvasLine;
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 5]);
      ctx.beginPath(); ctx.moveTo(cx, 26); ctx.lineTo(cx, h - 10); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "700 8px ui-sans-serif, system-ui";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillStyle = C.textFaint;
      ctx.fillText(col.label, cx, 8);
    }
    // causal direction cue
    if (layout.columns.length > 1) {
      ctx.font = "600 8px ui-sans-serif, system-ui";
      ctx.textAlign = "right"; ctx.textBaseline = "top";
      ctx.fillStyle = C.textFaint;
      ctx.fillText("CAUSE → EFFECT", w - 12, 8);
    }

    const activeSet = tracing ? trace.path!.nodes : beamSet;
    const activeEdges = tracing ? trace.path!.edges : null;

    // ── edges ──────────────────────────────────────────────────────────────────
    for (const e of model.edges) {
      const a = layout.boxes.get(e.source), b = layout.boxes.get(e.target);
      if (!a || !b) continue;
      const pa = posOf(a), pb = posOf(b);
      const [ax, ay] = W2S(pa.x + a.w / 2, pa.y);
      const [bx, by] = W2S(pb.x - b.w / 2, pb.y);
      const lit = activeEdges ? activeEdges.has(e.id) : false;
      const faded = (activeSet && !lit && !(beamSet && beamSet.has(e.source) && beamSet.has(e.target)));
      const col = lit ? C.focus : verbColor(e.verb);
      const targetCls = nodeById.get(e.target)?.cls ?? "asset";
      const reveal = lit ? revealOf(targetCls) : 1;

      let alpha = e.provenance === "recorded" ? 0.42 : 0.2;
      if (faded) alpha = 0.05;
      else if (lit) alpha = 0.9 * (0.15 + 0.85 * reveal);
      const width = (0.8 + e.strength * 1.5) * cam.s * (lit ? 1.35 : 1);

      ctx.save();
      ctx.strokeStyle = hexA(col, alpha);
      ctx.lineWidth = width;
      if (e.confidence < 0.4) ctx.setLineDash([2, 4]);
      else if (e.confidence < 0.7) ctx.setLineDash([6, 4]);
      if (lit && !faded) { ctx.shadowColor = hexA(C.accent, 0.4); ctx.shadowBlur = 6; }
      const mx = (ax + bx) / 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.bezierCurveTo(mx, ay, mx, by, bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      // arrowhead — direction is always visible; hollow when derived.
      // Bezier approach at the target is horizontal (columnar layout).
      const s = (4 + e.strength * 2.4) * cam.s;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - s, by - s * 0.45);
      ctx.lineTo(bx - s, by + s * 0.45);
      ctx.closePath();
      if (e.provenance === "recorded") { ctx.fillStyle = hexA(col, Math.min(1, alpha * 1.6)); ctx.fill(); }
      else { ctx.strokeStyle = hexA(col, Math.min(1, alpha * 1.8)); ctx.lineWidth = 1 * cam.s; ctx.stroke(); }
      ctx.restore();

      // verb label on the lit path
      if (lit && cam.s > 0.75 && reveal > 0.6) {
        const [lx, ly] = [(ax + bx) / 2, (ay + by) / 2];
        ctx.save();
        ctx.font = "600 7.5px ui-sans-serif, system-ui";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const lbl = e.verb.replace("_", " ").toUpperCase();
        const twd = ctx.measureText(lbl).width;
        ctx.fillStyle = "rgba(8,12,20,0.92)";
        ctx.fillRect(lx - twd / 2 - 3, ly - 6, twd + 6, 12);
        ctx.fillStyle = hexA(C.focus, 0.85);
        ctx.fillText(lbl, lx, ly);
        ctx.restore();
      }
    }

    // ── nodes (grammar per ontology class) ─────────────────────────────────────
    for (const n of model.nodes) {
      const b = layout.boxes.get(n.id);
      if (!b) continue;
      const p = posOf(b);
      const [x, y] = W2S(p.x, p.y);
      const bw = b.w * cam.s, bh = b.h * cam.s;
      const isSel = v.selectedId === n.id, isHov = v.hoveredId === n.id, isMatch = v.matchedId === n.id;
      const active = isSel || isHov || isMatch;
      const inPath = activeSet ? activeSet.has(n.id) : true;
      const reveal = tracing && inPath ? revealOf(n.cls) : 1;
      let alpha = inPath ? (tracing ? 0.25 + 0.75 * reveal : 1) : 0.15;
      if (beamSet && !inPath) alpha = 0.25;

      // selection/focus emphasis — the ONLY permitted glow
      if (active && !reducedMotion) { ctx.save(); ctx.shadowColor = hexA(C.accent, 0.5); ctx.shadowBlur = 10; }
      else ctx.save();

      drawNode(ctx, n, x, y, bw, bh, b.label, cam.s, alpha, active);
      ctx.restore();

      if (isMatch && !isSel) {
        ctx.strokeStyle = hexA(C.accent, 0.6);
        ctx.lineWidth = 1;
        ctx.strokeRect(x - bw / 2 - 3, y - bh / 2 - 3, bw + 6, bh + 6);
      }
    }

    if (animating) { needRef.current = true; rafRef.current = requestAnimationFrame(t => drawRef.current(t)); }
  }, [layout, model, nodeById, size, reducedMotion]);

  useEffect(() => { drawRef.current = draw; schedule(); }, [draw, schedule]);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: height }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: height });
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
    for (const b of layout.boxes.values()) {
      const p = posRef.current.get(b.id) ?? b;
      if (Math.abs(wx - p.x) <= b.w / 2 + 3 && Math.abs(wy - p.y) <= b.h / 2 + 3) {
        const node = nodeById.get(b.id);
        if (node) return { node, sx, sy };
      }
    }
    return null;
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
    if (hit && hovered && hit.node.id === hovered.node.id && (Math.abs(hit.sx - hovered.sx) > 24 || Math.abs(hit.sy - hovered.sy) > 24)) setHovered(hit);
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
    if (!e.ctrlKey && !e.metaKey) return;   // never hijack page scroll
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1 : -1);
  };
  const zoom = (dir: number) => { const c = camRef.current; c.ts = Math.max(0.55, Math.min(2.2, c.ts * (dir > 0 ? 1.18 : 0.85))); schedule(); };
  const resetCamera = () => { const c = camRef.current; c.tx = 0; c.ty = 0; c.ts = 1; schedule(); };

  const sparse = model.nodes.length < 3;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(148,163,184,0.18)", background: "linear-gradient(180deg, rgba(15,23,42,0.55), rgba(6,10,17,0.92))" }}>
      {/* compact control rail — analytical controls only */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
        <span className="text-[8.5px] font-black uppercase tracking-[0.16em]" style={{ color: "rgba(82,176,200,0.85)" }}>Intelligence Network</span>
        <span className="text-[8px] tabular-nums" style={{ color: C.textFaint }}>{model.nodes.length} entities · {model.edges.length} relationships</span>
        <div className="relative ml-auto">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: C.textFaint }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search entity…"
            className="w-32 sm:w-40 text-[11px] rounded-md pl-6 pr-2 py-1 outline-none focus:w-44 transition-all"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: C.text }} />
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => zoom(-1)} aria-label="Zoom out" className="p-1 rounded hover:bg-white/5" style={{ color: C.textDim }}><Minus size={12} /></button>
          <button onClick={() => zoom(1)} aria-label="Zoom in" className="p-1 rounded hover:bg-white/5" style={{ color: C.textDim }}><Plus size={12} /></button>
          <button onClick={resetCamera} aria-label="Reset view" className="p-1 rounded hover:bg-white/5" style={{ color: C.textDim }}><RotateCcw size={11} /></button>
        </div>
      </div>

      <div ref={containerRef} className="relative" style={{ height }}>
        {sparse ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <p className="text-[11px] font-semibold" style={{ color: C.textDim }}>Limited signal</p>
            <p className="text-[9.5px] leading-snug max-w-[280px] mt-1" style={{ color: C.textFaint }}>
              The transmission network renders once enough corroborated themes are active this cycle.
            </p>
          </div>
        ) : (
          <canvas ref={canvasRef} onMouseMove={onMove} onMouseDown={onDown} onMouseUp={onUp} onWheel={onWheel}
            onMouseLeave={() => { setHovered(null); dragRef.current = null; schedule(); }}
            className="block" style={{ cursor: "grab" }} />
        )}

        {/* hover card — full names + state (labels never float on the canvas) */}
        {!sparse && hovered && (
          <div className="pointer-events-none absolute z-30 w-max max-w-[240px]"
            style={{ left: Math.min(hovered.sx + 14, size.w - 250), top: Math.max(8, hovered.sy - 10) }}>
            <div className="rounded-lg border px-3 py-2" style={{ background: "rgba(8,12,20,0.98)", borderColor: "rgba(255,255,255,0.13)", boxShadow: "0 12px 34px rgba(0,0,0,0.6)" }}>
              <div className="flex items-center gap-1.5">
                <ClassGlyph cls={hovered.node.cls} />
                <span className="text-[11.5px] font-semibold" style={{ color: C.text }}>{hovered.node.name ?? hovered.node.label}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[8.5px] font-bold uppercase tracking-wide" style={{ color: C.textDim }}>{CLASS_LABEL[hovered.node.cls]}</span>
                {typeof hovered.node.confidence === "number" && (
                  <span className="text-[8.5px]" style={{ color: C.textDim }}>Conviction <b style={{ color: C.text }}>{hovered.node.confidence}</b></span>
                )}
                {typeof hovered.node.delta === "number" && hovered.node.delta !== 0 && (
                  <span className="text-[8.5px] font-semibold" style={{ color: hovered.node.delta > 0 ? C.bullish : C.bearish }}>
                    {hovered.node.delta > 0 ? "▲" : "▼"} {Math.abs(hovered.node.delta)} today
                  </span>
                )}
                {typeof hovered.node.supportCount === "number" && hovered.node.supportCount > 0 && (
                  <span className="text-[8.5px]" style={{ color: C.textDim }}>{hovered.node.supportCount} supporting theme{hovered.node.supportCount > 1 ? "s" : ""}</span>
                )}
              </div>
              {hovered.node.reason && <p className="text-[9.5px] leading-snug mt-1.5" style={{ color: C.textDim }}>{hovered.node.reason}</p>}
            </div>
          </div>
        )}

        {/* restrained legend: class glyphs + edge provenance */}
        {!sparse && (
          <div className="absolute bottom-2 left-2 z-10 flex items-center flex-wrap gap-x-3 gap-y-1 px-2 py-1 rounded-md"
            style={{ background: "rgba(8,12,20,0.75)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {(["driver", "theme", "industry", "asset"] as NodeClass[]).map(cls => (
              <span key={cls} className="flex items-center gap-1">
                <ClassGlyph cls={cls} />
                <span className="text-[8px]" style={{ color: C.textFaint }}>{CLASS_LABEL[cls]}</span>
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span style={{ width: 14, height: 0, borderTop: `2px solid ${C.structureDim}` }} />
              <span className="text-[8px]" style={{ color: C.textFaint }}>recorded</span>
            </span>
            <span className="flex items-center gap-1">
              <span style={{ width: 14, height: 0, borderTop: `1.5px dashed rgba(148,163,184,0.35)` }} />
              <span className="text-[8px]" style={{ color: C.textFaint }}>derived</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const CLASS_LABEL: Record<NodeClass, string> = {
  driver: "Macro Driver", narrative: "Narrative", theme: "Theme", industry: "Industry", asset: "Asset",
};

function ClassGlyph({ cls }: { cls: NodeClass }) {
  const common = { display: "inline-block" } as const;
  switch (cls) {
    case "driver": return <span style={{ ...common, width: 7, height: 7, background: C.structure, transform: "rotate(45deg)" }} />;
    case "narrative":
    case "theme": return <span style={{ ...common, width: 10, height: 7, borderRadius: 2, border: `1.5px solid ${C.accent}` }} />;
    case "industry": return <span style={{ ...common, width: 9, height: 7, border: `1.5px solid ${C.structure}` }} />;
    case "asset": return <span style={{ ...common, width: 8, height: 6, borderRadius: 3, background: "rgba(148,163,184,0.5)" }} />;
  }
}

// ── canvas node grammar ─────────────────────────────────────────────────────────

function drawNode(ctx: CanvasRenderingContext2D, n: NetworkNode, x: number, y: number,
                  w: number, h: number, label: string, scale: number, alpha: number, active: boolean) {
  const stateCol = dirColor(n.direction);
  const border = active ? C.focus : n.cls === "theme" ? hexA(C.accent, 0.55 * alpha) : hexA(C.structure, 0.35 * alpha);
  const zoomDetail = scale > 1.35;

  if (n.cls === "driver") {
    // anchored diamond + label tag — smallest, highest causal authority by position
    const r = 5 * scale;
    ctx.fillStyle = hexA(C.structure, 0.9 * alpha);
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + r, y - r); ctx.lineTo(x - w / 2 + 2 * r, y);
    ctx.lineTo(x - w / 2 + r, y + r); ctx.lineTo(x - w / 2, y);
    ctx.closePath(); ctx.fill();
    ctx.font = `700 ${10 * Math.min(scale, 1.3)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = hexA("#e2e8f0", 0.9 * alpha);
    ctx.fillText(label, x - w / 2 + 2 * r + 5 * scale, y);
    if (active) { ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2 - 4, y - h / 2, w + 8, h); }
    return;
  }

  // card/rect/chip body
  const radius = n.cls === "asset" ? h / 2 : n.cls === "theme" ? 6 * scale : 3 * scale;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, radius);
  ctx.fillStyle = hexA("#0f172a", 0.92 * alpha);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = (active ? 1.6 : 1) * Math.min(scale, 1.4);
  ctx.stroke();

  if (n.cls === "theme") {
    // structured card: title, conviction + delta row, conviction bar
    ctx.font = `600 ${10.5 * Math.min(scale, 1.25)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexA("#f1f5f9", 0.95 * alpha);
    ctx.fillText(label, x - w / 2 + 8 * scale, y - h / 2 + 16 * scale);
    ctx.font = `700 ${9.5 * Math.min(scale, 1.25)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = hexA(stateCol, 0.95 * alpha);
    const conv = `${n.confidence ?? "—"}`;
    ctx.fillText(conv, x - w / 2 + 8 * scale, y + h / 2 - 9 * scale);
    const convW = ctx.measureText(conv).width;
    if (typeof n.delta === "number" && n.delta !== 0) {
      ctx.font = `600 ${8.5 * Math.min(scale, 1.25)}px ui-sans-serif, system-ui`;
      ctx.fillStyle = hexA(n.delta > 0 ? C.bullish : C.bearish, 0.9 * alpha);
      ctx.fillText(`${n.delta > 0 ? "▲" : "▼"}${Math.abs(n.delta)}`, x - w / 2 + 8 * scale + convW + 5 * scale, y + h / 2 - 9 * scale);
    }
    if (zoomDetail && n.momentumLabel) {
      ctx.font = `600 ${7.5 * Math.min(scale, 1.25)}px ui-sans-serif, system-ui`;
      ctx.textAlign = "right";
      ctx.fillStyle = hexA("#94a3b8", 0.8 * alpha);
      ctx.fillText(n.momentumLabel.toUpperCase(), x + w / 2 - 7 * scale, y + h / 2 - 9 * scale);
    }
    // conviction bar along the bottom edge
    const frac = Math.max(0.04, Math.min(1, (n.confidence ?? 0) / 100));
    ctx.fillStyle = hexA(stateCol, 0.85 * alpha);
    ctx.fillRect(x - w / 2 + 4 * scale, y + h / 2 - 3 * scale, (w - 8 * scale) * frac, 2 * scale);
    return;
  }

  if (n.cls === "industry") {
    ctx.font = `600 ${10 * Math.min(scale, 1.25)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = hexA("#e2e8f0", 0.92 * alpha);
    ctx.fillText(label, x - w / 2 + 8 * scale, y);
    // exposure direction + breadth, right-aligned
    ctx.textAlign = "right";
    const glyph = n.direction === "bearish" ? "▼" : n.direction === "bullish" ? "▲" : "•";
    const breadth = (n.supportCount ?? 0) > 1 ? ` ×${n.supportCount}` : "";
    ctx.fillStyle = hexA(stateCol, 0.9 * alpha);
    ctx.font = `700 ${8.5 * Math.min(scale, 1.25)}px ui-sans-serif, system-ui`;
    ctx.fillText(glyph + breadth, x + w / 2 - 7 * scale, y);
    return;
  }

  // asset chip: ticker-first, monospace, direction glyph in state color
  ctx.font = `700 ${9.5 * Math.min(scale, 1.3)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textBaseline = "middle";
  const glyph = n.direction === "bearish" ? " ▼" : n.direction === "bullish" ? " ▲" : "";
  if (glyph) {
    const base = ctx.measureText(label).width, gw = ctx.measureText(glyph).width;
    ctx.textAlign = "left";
    ctx.fillStyle = hexA("#f1f5f9", 0.95 * alpha);
    ctx.fillText(label, x - (base + gw) / 2, y + 0.5);
    ctx.fillStyle = hexA(stateCol, 0.95 * alpha);
    ctx.fillText(glyph, x - (base + gw) / 2 + base, y + 0.5);
  } else {
    ctx.textAlign = "center";
    ctx.fillStyle = hexA("#f1f5f9", 0.95 * alpha);
    ctx.fillText(label, x, y + 0.5);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}
