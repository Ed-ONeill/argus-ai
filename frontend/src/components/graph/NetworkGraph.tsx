"use client";

/**
 * components/graph/NetworkGraph.tsx — reusable interactive intelligence graph.
 *
 * Canvas-rendered, force-directed, dependency-free. Domain-agnostic: it takes a
 * GraphModel and renders it with animated capital-flow particles, hover cards,
 * click-to-recentre, search-to-camera, relationship-weighted edges, a theme
 * overlay, filters, timeline playback and a node intelligence panel. The M&A
 * page is the first consumer; the same component is meant to back theme/sector/
 * supply-chain/macro graphs later.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Play, Pause, RotateCcw, ChevronLeft, Plus, Minus, X, Layers } from "lucide-react";
import { ForceSimulation } from "@/lib/graph/forceSimulation";
import { RELATION_META, TIMELINE_STAGES, type GraphModel, type GraphNode, type RelationType } from "@/lib/graph/types";

type FilterKey = "all" | "public" | "beneficiaries" | "competitors" | "suppliers" | "crossBorder" | "megaCap";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "public", label: "Public" },
  { key: "beneficiaries", label: "Beneficiaries" },
  { key: "competitors", label: "Competitors" },
  { key: "suppliers", label: "Suppliers" },
  { key: "crossBorder", label: "Cross-border" },
  { key: "megaCap", label: "Mega-cap" },
];

function nodeColor(n: GraphNode): string { return RELATION_META[n.role ?? "sector"].color; }

function passesFilter(n: GraphNode, f: FilterKey): boolean {
  switch (f) {
    case "all": return true;
    case "public": return !!n.isPublic;
    case "beneficiaries": return n.role === "beneficiary";
    case "competitors": return n.role === "competitor";
    case "suppliers": return n.role === "supplier";
    case "crossBorder": return !!n.crossBorder;
    case "megaCap": return !!n.megaCap;
  }
}

export interface NetworkGraphProps {
  model: GraphModel;
  /** Resolve a richer/recentred graph when a node is activated (domain adapter). */
  expand?: (node: GraphNode) => GraphModel | null;
  height?: number;
}

export default function NetworkGraph({ model: rootModel, expand, height = 460 }: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<ForceSimulation | null>(null);
  const rafRef = useRef<number>(0);
  const sizeRef = useRef({ w: 800, h: height });

  // Navigation stack (recentre / back).
  const [stack, setStack] = useState<GraphModel[]>([rootModel]);
  const model = stack[stack.length - 1];
  useEffect(() => { setStack([rootModel]); setSelected(null); }, [rootModel]);

  // Recenter the graph on a node and surface the new centre in the panel.
  const recenter = useCallback((node: GraphNode) => {
    if (!node.recenterable || !expand) return false;
    const next = expand(node);
    if (!next) return false;
    setStack(s => [...s, next]);
    setSelected(next.nodes.find(n => n.id === next.centerId) ?? null);
    return true;
  }, [expand]);

  const nodeMap = useMemo(() => new Map(model.nodes.map(n => [n.id, n])), [model]);
  const availableThemes = useMemo(() => {
    const s = new Set<string>();
    model.nodes.forEach(n => n.themes?.forEach(t => s.add(t)));
    model.edges.forEach(e => e.themes?.forEach(t => s.add(t)));
    return [...s];
  }, [model]);

  // UI state
  const [hovered, setHovered] = useState<{ node: GraphNode; sx: number; sy: number } | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [overlay, setOverlay] = useState<string | null>(null);
  const [stage, setStage] = useState(TIMELINE_STAGES.length - 1);
  const [playing, setPlaying] = useState(false);

  // Camera (focus point in world space + scale), eased toward targets.
  const camRef = useRef({ fx: 400, fy: height / 2, scale: 1, tfx: 400, tfy: height / 2, tscale: 1 });
  // Mutable view mirror read by the rAF loop (avoids re-binding the loop).
  const viewRef = useRef({ filter, overlay, stage, query: "", hoveredId: null as string | null, selectedId: null as string | null });
  useEffect(() => {
    viewRef.current = { filter, overlay, stage, query: query.trim().toLowerCase(), hoveredId: hovered?.node.id ?? null, selectedId: selected?.id ?? null };
  }, [filter, overlay, stage, query, hovered, selected]);

  const matchedId = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hit = model.nodes.find(n =>
      (n.ticker && n.ticker.toLowerCase().includes(q)) ||
      n.label.toLowerCase().includes(q) ||
      (n.name && n.name.toLowerCase().includes(q)));
    return hit?.id ?? null;
  }, [query, model]);

  // Rebuild simulation when the model changes.
  useEffect(() => {
    const { w, h } = sizeRef.current;
    simRef.current = new ForceSimulation(model, w, h);
    camRef.current.tfx = w / 2; camRef.current.tfy = h / 2; camRef.current.tscale = 1;
  }, [model]);

  // Camera move to a searched node.
  useEffect(() => {
    if (!matchedId) return;
    const sim = simRef.current?.get(matchedId);
    if (sim) { camRef.current.tfx = sim.x; camRef.current.tfy = sim.y; camRef.current.tscale = 1.25; simRef.current?.reheat(0.2); }
  }, [matchedId]);

  // Timeline playback.
  useEffect(() => {
    if (!playing) return;
    if (stage >= TIMELINE_STAGES.length - 1) { setPlaying(false); return; }
    const id = setTimeout(() => setStage(s => Math.min(TIMELINE_STAGES.length - 1, s + 1)), 1100);
    return () => clearTimeout(id);
  }, [playing, stage]);

  const nodeVisible = useCallback((n: GraphNode, v: typeof viewRef.current): boolean => {
    if (n.id === model.centerId) return true;
    if ((n.stage ?? 0) > v.stage) return false;
    if (!passesFilter(n, v.filter)) return false;
    if (v.overlay && !(n.themes?.includes(v.overlay))) {
      // keep structural hubs (sector/event) visible under an overlay
      if (n.kind === "company" || n.kind === "theme") return false;
    }
    return true;
  }, [model.centerId]);

  // ── Render loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const w = container.clientWidth, h = height;
      sizeRef.current = { w, h };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      simRef.current?.resize(w, h);
      simRef.current?.reheat(0.4);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const draw = (now: number) => {
      const sim = simRef.current;
      const { w, h } = sizeRef.current;
      const cam = camRef.current;
      const v = viewRef.current;
      if (!sim) { rafRef.current = requestAnimationFrame(draw); return; }

      // settle physics
      for (let i = 0; i < 2; i++) sim.step();
      // ease camera
      cam.fx += (cam.tfx - cam.fx) * 0.12;
      cam.fy += (cam.tfy - cam.fy) * 0.12;
      cam.scale += (cam.tscale - cam.scale) * 0.12;

      const W2S = (x: number, y: number): [number, number] => [(x - cam.fx) * cam.scale + w / 2, (y - cam.fy) * cam.scale + h / 2];

      ctx.clearRect(0, 0, w, h);

      // edges + particles
      for (const e of model.edges) {
        const a = sim.get(e.source), b = sim.get(e.target);
        const na = nodeMap.get(e.source), nb = nodeMap.get(e.target);
        if (!a || !b || !na || !nb) continue;
        if (!nodeVisible(na, v) || !nodeVisible(nb, v)) continue;
        if ((e.stage ?? 0) > v.stage) continue;
        const dim = v.overlay ? !(e.themes?.includes(v.overlay)) : false;
        const incident = v.hoveredId === e.source || v.hoveredId === e.target || v.selectedId === e.source || v.selectedId === e.target;
        const [ax, ay] = W2S(a.x, a.y), [bx, by] = W2S(b.x, b.y);
        const col = RELATION_META[e.type].color;
        const baseOp = (0.1 + e.weight * 0.32) * (dim ? 0.18 : 1) * (incident ? 1.6 : 1);
        ctx.strokeStyle = hexA(col, Math.min(0.6, baseOp));
        ctx.lineWidth = (0.6 + e.weight * 2.4) * cam.scale * (incident ? 1.4 : 1);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();

        // flowing capital particles (subtle)
        if (!dim) {
          const count = e.weight > 0.6 ? 2 : 1;
          const speed = 0.10 + e.weight * 0.12;
          for (let p = 0; p < count; p++) {
            const t = ((now / 1000) * speed + p / count + hashFrac(e.source + e.target)) % 1;
            const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
            ctx.beginPath();
            ctx.fillStyle = hexA(col, (incident ? 0.95 : 0.7));
            ctx.arc(px, py, (incident ? 2.1 : 1.6) * cam.scale, 0, Math.PI * 2); ctx.fill();
          }
        }
      }

      // nodes
      for (const n of model.nodes) {
        const s = sim.get(n.id); if (!s) continue;
        const visible = nodeVisible(n, v);
        const [sx, sy] = W2S(s.x, s.y);
        const r = s.radius * cam.scale;
        const col = nodeColor(n);
        const isHover = v.hoveredId === n.id, isSel = v.selectedId === n.id, isMatch = matchedId === n.id;
        const op = visible ? 1 : 0.12;

        if ((isHover || isSel || isMatch || n.kind === "event")) {
          const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.6);
          halo.addColorStop(0, hexA(col, 0.32 * op));
          halo.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sx, sy, r * 2.6, 0, Math.PI * 2); ctx.fill();
        }
        // body
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = hexA(col, (n.kind === "event" ? 0.32 : 0.2) * op);
        ctx.fill();
        ctx.lineWidth = (isSel || isMatch ? 2.2 : 1.3) * cam.scale;
        ctx.strokeStyle = hexA(col, (isHover || isSel || isMatch ? 0.95 : 0.6) * op);
        ctx.stroke();
        if (isMatch) { ctx.lineWidth = 1; ctx.strokeStyle = hexA(col, 0.5); ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, Math.PI * 2); ctx.stroke(); }

        // label
        const label = n.kind === "company" ? (n.ticker ?? n.label) : n.label;
        ctx.font = `${n.kind === "event" ? 600 : 500} ${Math.round((n.kind === "event" ? 12 : 10.5))}px ui-sans-serif, system-ui`;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillStyle = hexA("#ffffff", (n.kind === "event" ? 0.92 : 0.66) * Math.max(op, 0.25));
        ctx.fillText(label.length > 18 ? label.slice(0, 17) + "…" : label, sx, sy + r + 3);
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [model, nodeMap, nodeVisible, matchedId, height]);

  // ── Pointer interaction ──────────────────────────────────────────────────────
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const pick = useCallback((clientX: number, clientY: number): { node: GraphNode; sx: number; sy: number } | null => {
    const canvas = canvasRef.current, sim = simRef.current; if (!canvas || !sim) return null;
    const rect = canvas.getBoundingClientRect();
    const { w, h } = sizeRef.current, cam = camRef.current;
    const sx = clientX - rect.left, sy = clientY - rect.top;
    const wx = (sx - w / 2) / cam.scale + cam.fx, wy = (sy - h / 2) / cam.scale + cam.fy;
    const v = viewRef.current;
    let best: { node: GraphNode; sx: number; sy: number } | null = null, bestD = Infinity;
    for (const n of model.nodes) {
      if (!nodeVisible(n, v)) continue;
      const s = sim.get(n.id); if (!s) continue;
      const d = Math.hypot(s.x - wx, s.y - wy);
      if (d < s.radius + 6 && d < bestD) { bestD = d; best = { node: n, sx, sy }; }
    }
    return best;
  }, [model, nodeVisible]);

  const onMove = (e: React.MouseEvent) => {
    if (dragRef.current) {
      const cam = camRef.current;
      const dx = (e.clientX - dragRef.current.x) / cam.scale, dy = (e.clientY - dragRef.current.y) / cam.scale;
      cam.tfx -= dx; cam.tfy -= dy; cam.fx -= dx; cam.fy -= dy;
      dragRef.current = { x: e.clientX, y: e.clientY, moved: true };
      return;
    }
    const hit = pick(e.clientX, e.clientY);
    setHovered(hit);
    if (canvasRef.current) canvasRef.current.style.cursor = hit ? "pointer" : "grab";
  };
  const onDown = (e: React.MouseEvent) => { dragRef.current = { x: e.clientX, y: e.clientY, moved: false }; };
  const onUp = (e: React.MouseEvent) => {
    const wasDrag = dragRef.current?.moved; dragRef.current = null;
    if (wasDrag) return;
    const hit = pick(e.clientX, e.clientY);
    if (!hit) { setSelected(null); return; }
    if (recenter(hit.node)) return;   // company node → recentre + select new centre
    setSelected(hit.node);            // structural node → just open the panel
  };

  const zoom = (dir: number) => { const c = camRef.current; c.tscale = Math.max(0.5, Math.min(2.4, c.tscale * (dir > 0 ? 1.2 : 0.83))); };
  const resetView = () => { const { w, h } = sizeRef.current; const c = camRef.current; c.tfx = w / 2; c.tfy = h / 2; c.tscale = 1; simRef.current?.reheat(0.5); };

  const neighbours = useMemo(() => {
    if (!selected) return [];
    const ids = new Set<string>();
    model.edges.forEach(e => { if (e.source === selected.id) ids.add(e.target); if (e.target === selected.id) ids.add(e.source); });
    return [...ids].map(id => nodeMap.get(id)).filter((n): n is GraphNode => !!n);
  }, [selected, model, nodeMap]);

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(82,176,200,0.2)", background: "rgba(5,9,16,0.6)" }}>
      {/* Top control bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-wrap" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
        {stack.length > 1 && (
          <button onClick={() => { setStack(s => s.slice(0, -1)); setSelected(null); }} className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-1 rounded transition-colors hover:text-white/80" style={{ color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.05)" }}>
            <ChevronLeft size={12} />Back
          </button>
        )}
        <span className="text-[8.5px] font-black uppercase tracking-[0.16em]" style={{ color: "rgba(82,176,200,0.8)" }}>Capital Transmission Network</span>
        <div className="relative ml-auto">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search node…"
            className="w-32 sm:w-40 text-[11px] rounded-md pl-6 pr-2 py-1 outline-none focus:w-44 transition-all"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.85)" }} />
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => zoom(-1)} className="p-1 rounded transition-colors hover:bg-white/5" style={{ color: "rgba(255,255,255,0.5)" }}><Minus size={12} /></button>
          <button onClick={() => zoom(1)} className="p-1 rounded transition-colors hover:bg-white/5" style={{ color: "rgba(255,255,255,0.5)" }}><Plus size={12} /></button>
          <button onClick={resetView} className="p-1 rounded transition-colors hover:bg-white/5" style={{ color: "rgba(255,255,255,0.5)" }}><RotateCcw size={11} /></button>
        </div>
      </div>

      {/* Filters + theme overlay */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b flex-wrap" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded transition-colors"
            style={filter === f.key
              ? { background: "rgba(82,176,200,0.18)", color: "#7cc7d8", border: "1px solid rgba(82,176,200,0.3)" }
              : { background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.46)", border: "1px solid rgba(255,255,255,0.07)" }}>{f.label}</button>
        ))}
        {availableThemes.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            <Layers size={10} style={{ color: "rgba(251,146,60,0.6)" }} />
            {availableThemes.map(t => (
              <button key={t} onClick={() => setOverlay(o => o === t ? null : t)}
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full transition-colors"
                style={overlay === t
                  ? { background: "rgba(251,146,60,0.18)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.35)" }
                  : { background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.44)", border: "1px solid rgba(255,255,255,0.07)" }}>{t}</button>
            ))}
          </div>
        )}
      </div>

      {/* Canvas + overlays */}
      <div ref={containerRef} className="relative" style={{ height }}>
        <canvas ref={canvasRef} onMouseMove={onMove} onMouseDown={onDown} onMouseUp={onUp} onMouseLeave={() => { setHovered(null); dragRef.current = null; }} className="block" style={{ cursor: "grab" }} />

        {/* Hover intelligence card */}
        {hovered && (
          <div className="pointer-events-none absolute z-30 w-max max-w-[220px]"
            style={{ left: Math.min(hovered.sx + 14, (sizeRef.current.w) - 230), top: Math.max(8, hovered.sy - 12) }}>
            <div className="rounded-lg border px-3 py-2" style={{ background: "rgba(8,12,20,0.98)", borderColor: "rgba(255,255,255,0.13)", boxShadow: "0 12px 34px rgba(0,0,0,0.6)" }}>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: nodeColor(hovered.node) }} />
                <span className="text-[11.5px] font-semibold" style={{ color: "rgba(255,255,255,0.94)" }}>{hovered.node.name ?? hovered.node.label}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {hovered.node.ticker && <span className="text-[9px] font-mono font-bold px-1 py-px rounded" style={{ color: nodeColor(hovered.node), background: hexA(nodeColor(hovered.node), 0.14) }}>{hovered.node.ticker}</span>}
                <span className="text-[8.5px]" style={{ color: "rgba(255,255,255,0.44)" }}>
                  {[RELATION_META[hovered.node.role ?? "sector"].label, hovered.node.sector, hovered.node.exchange].filter(Boolean).join(" · ")}
                </span>
              </div>
              {hovered.node.reason && <p className="text-[9.5px] leading-snug mt-1.5" style={{ color: "rgba(255,255,255,0.56)" }}>{hovered.node.reason}</p>}
              <div className="flex items-center gap-2 mt-1.5">
                {typeof hovered.node.confidence === "number" && <span className="text-[8.5px]" style={{ color: "rgba(255,255,255,0.5)" }}>Confidence <b style={{ color: "rgba(255,255,255,0.8)" }}>{hovered.node.confidence}</b></span>}
                {hovered.node.themes && hovered.node.themes.length > 0 && <span className="text-[8.5px]" style={{ color: "rgba(251,146,60,0.7)" }}>{hovered.node.themes.slice(0, 2).join(" · ")}</span>}
              </div>
            </div>
          </div>
        )}

        {/* Intelligence side panel */}
        {selected && (
          <div className="absolute top-2 right-2 bottom-2 z-20 w-[210px] rounded-lg border flex flex-col"
            style={{ background: "rgba(8,12,20,0.97)", borderColor: "rgba(255,255,255,0.12)", boxShadow: "0 14px 40px rgba(0,0,0,0.55)" }}>
            <div className="flex items-start gap-2 p-3 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: nodeColor(selected) }} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold leading-tight" style={{ color: "rgba(255,255,255,0.94)" }}>{selected.name ?? selected.label}</p>
                {selected.ticker && <p className="text-[9px] font-mono mt-0.5" style={{ color: nodeColor(selected) }}>{selected.ticker} · {selected.exchange}</p>}
              </div>
              <button onClick={() => setSelected(null)} className="shrink-0 transition-colors hover:text-white/80" style={{ color: "rgba(255,255,255,0.4)" }}><X size={13} /></button>
            </div>
            <div className="p-3 space-y-2.5 overflow-y-auto scrollbar-hide">
              <PanelRow label="Role" value={RELATION_META[selected.role ?? "sector"].label} color={nodeColor(selected)} />
              {selected.sector && <PanelRow label="Sector" value={selected.sector} />}
              {selected.marketCap && <PanelRow label="Market Cap" value={selected.marketCap} />}
              {typeof selected.beneficiaryScore === "number" && <PanelBar label="Beneficiary Score" value={selected.beneficiaryScore} color={nodeColor(selected)} />}
              {typeof selected.confidence === "number" && <PanelBar label="Confidence" value={selected.confidence} color="#52b0c8" />}
              {selected.reason && (
                <div>
                  <p className="text-[7.5px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(255,255,255,0.34)" }}>Recent Argus Intelligence</p>
                  <p className="text-[10px] leading-snug" style={{ color: "rgba(255,255,255,0.6)" }}>{selected.reason}</p>
                </div>
              )}
              {selected.themes && selected.themes.length > 0 && (
                <div>
                  <p className="text-[7.5px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(255,255,255,0.34)" }}>Current Themes</p>
                  <div className="flex flex-wrap gap-1">{selected.themes.map(t => <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(251,146,60,0.12)", color: "#fb923c" }}>{t}</span>)}</div>
                </div>
              )}
              {neighbours.length > 0 && (
                <div>
                  <p className="text-[7.5px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(255,255,255,0.34)" }}>Related Companies</p>
                  <div className="flex flex-wrap gap-1">
                    {neighbours.slice(0, 8).map(n => <span key={n.id} className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: hexA(nodeColor(n), 0.14), color: nodeColor(n) }}>{n.ticker ?? n.label}</span>)}
                  </div>
                </div>
              )}
              {selected.recenterable && expand && (
                <button onClick={() => recenter(selected)}
                  className="w-full text-[10px] font-semibold py-1.5 rounded transition-colors hover:bg-white/10"
                  style={{ background: "rgba(82,176,200,0.12)", color: "#7cc7d8", border: "1px solid rgba(82,176,200,0.25)" }}>
                  Re-centre network here →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-2 left-2 z-10 flex flex-wrap gap-x-2.5 gap-y-1 max-w-[60%]">
          {(["acquirer", "target", "beneficiary", "competitor", "supplier", "second-order", "theme"] as RelationType[]).map(rt => (
            <span key={rt} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: RELATION_META[rt].color }} />
              <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.4)" }}>{RELATION_META[rt].label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Timeline playback */}
      <div className="flex items-center gap-3 px-3 py-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
        <button onClick={() => { if (stage >= TIMELINE_STAGES.length - 1) setStage(0); setPlaying(p => !p); }}
          className="flex items-center justify-center w-6 h-6 rounded-full transition-colors hover:bg-white/10" style={{ background: "rgba(82,176,200,0.14)", color: "#7cc7d8" }}>
          {playing ? <Pause size={11} /> : <Play size={11} className="translate-x-px" />}
        </button>
        <div className="flex-1 flex items-center gap-1">
          {TIMELINE_STAGES.map((s, i) => (
            <button key={s} onClick={() => { setPlaying(false); setStage(i); }} className="flex-1 flex flex-col items-center gap-1 group/ts">
              <div className="w-full h-1 rounded-full transition-colors" style={{ background: i <= stage ? "#52b0c8" : "rgba(255,255,255,0.08)" }} />
              <span className="text-[8px] font-medium whitespace-nowrap transition-colors" style={{ color: i === stage ? "#7cc7d8" : "rgba(255,255,255,0.36)" }}>{s}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[8.5px] font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.34)" }}>{label}</span>
      <span className="text-[10.5px] font-semibold truncate" style={{ color: color ?? "rgba(255,255,255,0.78)" }}>{value}</span>
    </div>
  );
}
function PanelBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8.5px] font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.34)" }}>{label}</span>
        <span className="text-[10px] font-black tabular-nums" style={{ color }}>{value}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div className="h-1 rounded-full" style={{ width: `${Math.max(3, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}

// ── tiny helpers ────────────────────────────────────────────────────────────────
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}
function hashFrac(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
