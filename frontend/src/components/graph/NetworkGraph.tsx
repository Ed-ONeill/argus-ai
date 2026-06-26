"use client";

/**
 * components/graph/NetworkGraph.tsx — the Argus Transmission Map.
 *
 * Reusable, canvas-rendered, dependency-free intelligence graph. Deterministic
 * radial-ring layout, glassmorphic intelligence-object nodes, animated
 * transmission-path edges, active-path highlighting, hover cards, click-to-
 * recentre, search-to-camera, theme overlay, filters, timeline playback and a
 * node intelligence panel. Domain-agnostic — the M&A page is the first consumer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Play, Pause, RotateCcw, ChevronLeft, Plus, Minus, X, Layers, Activity } from "lucide-react";
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

  const [stack, setStack] = useState<GraphModel[]>([rootModel]);
  const model = stack[stack.length - 1];
  useEffect(() => { setStack([rootModel]); setSelected(null); }, [rootModel]);

  const recenter = useCallback((node: GraphNode) => {
    if (!node.recenterable || !expand) return false;
    const next = expand(node);
    if (!next) return false;
    setStack(s => [...s, next]);
    setSelected(next.nodes.find(n => n.id === next.centerId) ?? null);
    return true;
  }, [expand]);

  const nodeMap = useMemo(() => new Map(model.nodes.map(n => [n.id, n])), [model]);
  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    model.edges.forEach(e => {
      (m.get(e.source) ?? m.set(e.source, new Set()).get(e.source)!).add(e.target);
      (m.get(e.target) ?? m.set(e.target, new Set()).get(e.target)!).add(e.source);
    });
    return m;
  }, [model]);
  const availableThemes = useMemo(() => {
    const s = new Set<string>();
    model.nodes.forEach(n => n.themes?.forEach(t => s.add(t)));
    model.edges.forEach(e => e.themes?.forEach(t => s.add(t)));
    return [...s];
  }, [model]);

  const variant: "narrative" | "capital" = model.id.startsWith("narrative") ? "narrative" : "capital";
  // A graph with too little relationship density reads as unfinished — show a strip instead.
  const sparse = model.nodes.length <= 4 || model.edges.length <= 2;

  const [hovered, setHovered] = useState<{ node: GraphNode; sx: number; sy: number } | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [overlay, setOverlay] = useState<string | null>(null);
  const [stage, setStage] = useState(TIMELINE_STAGES.length - 1);
  const [playing, setPlaying] = useState(false);

  const camRef = useRef({ fx: 400, fy: height / 2, scale: 1, tfx: 400, tfy: height / 2, tscale: 1 });
  const viewRef = useRef({ filter, overlay, stage, hoveredId: null as string | null, selectedId: null as string | null });
  useEffect(() => {
    viewRef.current = { filter, overlay, stage, hoveredId: hovered?.node.id ?? null, selectedId: selected?.id ?? null };
  }, [filter, overlay, stage, hovered, selected]);

  const matchedId = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hit = model.nodes.find(n =>
      (n.ticker && n.ticker.toLowerCase().includes(q)) ||
      n.label.toLowerCase().includes(q) ||
      (n.name && n.name.toLowerCase().includes(q)));
    return hit?.id ?? null;
  }, [query, model]);

  useEffect(() => {
    const { w, h } = sizeRef.current;
    simRef.current = new ForceSimulation(model, w, h);
    camRef.current.tfx = w / 2; camRef.current.tfy = h / 2; camRef.current.tscale = 1;
  }, [model]);

  useEffect(() => {
    if (!matchedId) return;
    const sim = simRef.current?.get(matchedId);
    if (sim) { camRef.current.tfx = sim.x; camRef.current.tfy = sim.y; camRef.current.tscale = 1.25; simRef.current?.reheat(0.2); }
  }, [matchedId]);

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
      if (n.kind === "company" || n.kind === "theme") return false;
    }
    return true;
  }, [model.centerId]);

  // ── Render loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sparse) return;
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const variantLocal: "narrative" | "capital" = model.id.startsWith("narrative") ? "narrative" : "capital";

    const resize = () => {
      const w = container.clientWidth, h = height;
      sizeRef.current = { w, h };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      simRef.current?.resize(w, h);
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

      for (let i = 0; i < 2; i++) sim.step();
      cam.fx += (cam.tfx - cam.fx) * 0.12;
      cam.fy += (cam.tfy - cam.fy) * 0.12;
      cam.scale += (cam.tscale - cam.scale) * 0.12;

      const W2S = (x: number, y: number): [number, number] => [(x - cam.fx) * cam.scale + w / 2, (y - cam.fy) * cam.scale + h / 2];
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);

      // Faint radial ring zones — make the structure feel intentionally designed.
      const minDim = Math.min(w, h);
      const aspect = Math.min(1.55, Math.max(1, w / Math.max(1, h)));
      const [zcx, zcy] = W2S(w / 2, h / 2);
      ctx.save();
      for (const rf of [0.21, 0.34, 0.47]) {
        ctx.beginPath();
        ctx.ellipse(zcx, zcy, minDim * rf * aspect * cam.scale, minDim * rf * cam.scale, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(130,170,200,0.045)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      // Active path: the hovered/selected node + its direct neighbours.
      const focusId = v.hoveredId ?? v.selectedId;
      const active = focusId ? new Set<string>([focusId, ...(adjacency.get(focusId) ?? [])]) : null;

      // ── Edges as transmission paths ──
      for (const e of model.edges) {
        const a = sim.get(e.source), b = sim.get(e.target);
        const na = nodeMap.get(e.source), nb = nodeMap.get(e.target);
        if (!a || !b || !na || !nb) continue;
        if (!nodeVisible(na, v) || !nodeVisible(nb, v)) continue;
        if ((e.stage ?? 0) > v.stage) continue;
        const incident = active ? (e.source === focusId || e.target === focusId) : false;
        const dimOverlay = v.overlay ? !(e.themes?.includes(v.overlay)) : false;
        const faded = (active && !incident) || dimOverlay;
        const conf = ((na.confidence ?? nb.confidence ?? 60)) / 100;
        const themeEmph = variantLocal === "narrative" && (e.type === "theme" || e.type === "capital-rotation");
        const [ax, ay] = W2S(a.x, a.y), [bx, by] = W2S(b.x, b.y);
        const col = RELATION_META[e.type].color;
        let op = (0.07 + e.weight * 0.30) * (0.4 + conf * 0.6) * (themeEmph ? 1.4 : 1);
        if (faded) op *= 0.16; else if (incident) op = Math.min(0.9, op * 2.2);

        // direction gradient: brighter at the driver (source), fading toward the consequence
        const grad = ctx.createLinearGradient(ax, ay, bx, by);
        grad.addColorStop(0, hexA(col, op));
        grad.addColorStop(1, hexA(col, op * 0.4));
        ctx.save();
        ctx.strokeStyle = grad;
        ctx.lineWidth = (0.6 + e.weight * 2.6) * cam.scale * (incident ? 1.5 : 1);
        ctx.setLineDash([5, 9]);
        ctx.lineDashOffset = -((t * (10 + e.weight * 34)) % 14);
        if (incident) { ctx.shadowColor = hexA(col, 0.6); ctx.shadowBlur = 8; }
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.restore();

        // moving capital particles on strong / active paths
        if (!faded && (e.weight > 0.5 || incident)) {
          const count = e.weight > 0.7 || incident ? 2 : 1;
          const speed = 0.1 + e.weight * 0.12;
          for (let p = 0; p < count; p++) {
            const tt = ((t * speed + p / count + hashFrac(e.source + e.target)) % 1);
            const px = ax + (bx - ax) * tt, py = ay + (by - ay) * tt;
            ctx.beginPath();
            ctx.fillStyle = hexA(col, incident ? 0.95 : 0.62);
            ctx.arc(px, py, (incident ? 2.1 : 1.5) * cam.scale, 0, Math.PI * 2); ctx.fill();
          }
        }

        // relationship label on active paths
        if (incident && cam.scale > 0.75) {
          const mx = (ax + bx) / 2, my = (ay + by) / 2;
          ctx.save();
          ctx.font = "600 8px ui-sans-serif, system-ui";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          const lbl = RELATION_META[e.type].label.toUpperCase();
          const tw = ctx.measureText(lbl).width;
          ctx.fillStyle = "rgba(6,10,18,0.85)";
          ctx.fillRect(mx - tw / 2 - 3, my - 6, tw + 6, 12);
          ctx.fillStyle = hexA(col, 0.9);
          ctx.fillText(lbl, mx, my);
          ctx.restore();
        }
      }

      // ── Nodes as intelligence objects ──
      for (const n of model.nodes) {
        const s = sim.get(n.id); if (!s) continue;
        const visible = nodeVisible(n, v);
        const [sx, sy] = W2S(s.x, s.y);
        const col = nodeColor(n);
        const isHover = v.hoveredId === n.id, isSel = v.selectedId === n.id, isMatch = matchedId === n.id;
        const isActive = isHover || isSel || isMatch;
        const focusDim = active ? !active.has(n.id) : false;
        const variantDim = variantLocal === "narrative" && n.kind !== "theme" && n.kind !== "event";
        let op = visible ? 1 : 0.1;
        if (focusDim) op *= 0.2;
        if (variantDim) op *= 0.7;
        const highConf = (n.confidence ?? 0) >= 75;
        const breath = (isActive || highConf) && visible ? 1 + 0.05 * Math.sin(t * 2 + hashFrac(n.id) * 6.28) : 1;
        const r = s.radius * cam.scale * breath;

        // outer glow halo (inner glow read)
        const haloA = (isActive ? 0.42 : n.kind === "event" ? 0.3 : 0.15) * op;
        if (haloA > 0.02) {
          const halo = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, r * 2.9);
          halo.addColorStop(0, hexA(col, haloA));
          halo.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sx, sy, r * 2.9, 0, Math.PI * 2); ctx.fill();
        }

        // directional pulse ring for active nodes
        if (isActive && visible) {
          const pulse = (t * 0.8 + hashFrac(n.id)) % 1;
          ctx.strokeStyle = hexA(col, (1 - pulse) * 0.5 * op);
          ctx.lineWidth = 1.5 * cam.scale;
          ctx.beginPath(); ctx.arc(sx, sy, r + pulse * 14 * cam.scale, 0, Math.PI * 2); ctx.stroke();
        }

        // glass surface — top-left highlight fading to a dark glass edge
        const body = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.35, r * 0.1, sx, sy, r);
        body.addColorStop(0, hexA(col, 0.46 * op));
        body.addColorStop(0.55, hexA(col, 0.2 * op));
        body.addColorStop(1, hexA("#0a0f18", 0.55 * op));
        ctx.fillStyle = body; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();

        // inner core glow
        ctx.fillStyle = hexA(col, 0.5 * op);
        ctx.beginPath(); ctx.arc(sx, sy, r * 0.3, 0, Math.PI * 2); ctx.fill();

        // thin outer ring
        ctx.save();
        ctx.lineWidth = (isActive ? 2 : 1.2) * cam.scale;
        ctx.strokeStyle = hexA(col, (isActive ? 0.95 : 0.55) * op);
        if (isActive) { ctx.shadowColor = hexA(col, 0.7); ctx.shadowBlur = 10; }
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        if (isMatch) { ctx.lineWidth = 1; ctx.strokeStyle = hexA(col, 0.45); ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, Math.PI * 2); ctx.stroke(); }

        // label with contrast
        const label = n.kind === "company" ? (n.ticker ?? n.label) : n.label;
        const shown = label.length > 18 ? label.slice(0, 17) + "…" : label;
        ctx.save();
        ctx.font = `${n.kind === "event" ? 600 : 500} ${n.kind === "event" ? 12 : 10.5}px ui-sans-serif, system-ui`;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 4;
        ctx.fillStyle = hexA("#ffffff", (n.kind === "event" ? 0.95 : 0.74) * Math.max(op, 0.22));
        ctx.fillText(shown, sx, sy + r + 4);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [model, nodeMap, adjacency, nodeVisible, matchedId, height, sparse]);

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
    if (recenter(hit.node)) return;
    setSelected(hit.node);
  };

  const zoom = (dir: number) => { const c = camRef.current; c.tscale = Math.max(0.5, Math.min(2.4, c.tscale * (dir > 0 ? 1.2 : 0.83))); };
  const resetView = () => { const { w, h } = sizeRef.current; const c = camRef.current; c.tfx = w / 2; c.tfy = h / 2; c.tscale = 1; simRef.current?.reheat(0.5); };

  const neighbours = useMemo(() => {
    if (!selected) return [];
    return [...(adjacency.get(selected.id) ?? [])].map(id => nodeMap.get(id)).filter((n): n is GraphNode => !!n);
  }, [selected, adjacency, nodeMap]);

  const focusNode = hovered?.node ?? selected;

  // Header pieces (branded).
  const center = nodeMap.get(model.centerId);
  const byRole = (role: RelationType) => model.nodes.find(n => n.role === role);

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(82,176,200,0.22)", background: "radial-gradient(120% 120% at 50% 0%, rgba(20,30,46,0.55), rgba(5,9,16,0.85))" }}>
      {/* Top control bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-wrap" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
        {stack.length > 1 && (
          <button onClick={() => { setStack(s => s.slice(0, -1)); setSelected(null); }} className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-1 rounded transition-colors hover:text-white/80" style={{ color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.05)" }}>
            <ChevronLeft size={12} />Back
          </button>
        )}
        <span className="text-[8.5px] font-black uppercase tracking-[0.16em]" style={{ color: "rgba(82,176,200,0.85)" }}>Argus Transmission Map</span>
        <span className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ color: variant === "narrative" ? "#fb923c" : "#7cc7d8", background: variant === "narrative" ? "rgba(251,146,60,0.12)" : "rgba(82,176,200,0.12)" }}>
          {variant === "narrative" ? "Narrative Propagation" : "Capital Flow"}
        </span>
        <span className="hidden sm:inline text-[8px] tabular-nums" style={{ color: "rgba(255,255,255,0.3)" }}>Signal Density {model.nodes.length}·{model.edges.length}</span>
        {!sparse && (
          <div className="relative ml-auto">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search node…"
              className="w-32 sm:w-40 text-[11px] rounded-md pl-6 pr-2 py-1 outline-none focus:w-44 transition-all"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.85)" }} />
          </div>
        )}
        {!sparse && (
          <div className={`flex items-center gap-0.5 ${stack.length > 1 ? "" : "ml-auto sm:ml-0"}`}>
            <button onClick={() => zoom(-1)} className="p-1 rounded transition-colors hover:bg-white/5" style={{ color: "rgba(255,255,255,0.5)" }}><Minus size={12} /></button>
            <button onClick={() => zoom(1)} className="p-1 rounded transition-colors hover:bg-white/5" style={{ color: "rgba(255,255,255,0.5)" }}><Plus size={12} /></button>
            <button onClick={resetView} className="p-1 rounded transition-colors hover:bg-white/5" style={{ color: "rgba(255,255,255,0.5)" }}><RotateCcw size={11} /></button>
          </div>
        )}
      </div>

      {/* Filters + theme overlay */}
      {!sparse && (
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
      )}

      {/* Canvas + overlays, or the limited-signal strip */}
      <div ref={containerRef} className="relative" style={{ height }}>
        {sparse ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <Activity size={18} className="mb-2.5" style={{ color: "rgba(82,176,200,0.5)" }} />
            <div className="flex items-center gap-1.5 flex-wrap justify-center mb-3">
              {[byRole("acquirer"), byRole("target"), center?.role === "sector" ? center : byRole("sector"), ...model.nodes.filter(n => n.role === "theme").slice(0, 2)]
                .filter((n): n is GraphNode => !!n)
                .map((n, i) => (
                  <span key={n.id} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-[11px]" style={{ color: "rgba(82,176,200,0.5)" }}>→</span>}
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ background: hexA(nodeColor(n), 0.14), color: nodeColor(n), border: `1px solid ${hexA(nodeColor(n), 0.3)}` }}>
                      {n.ticker ?? n.label}
                    </span>
                  </span>
                ))}
            </div>
            <p className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>Limited signal</p>
            <p className="text-[9.5px] leading-snug max-w-[260px] mt-1" style={{ color: "rgba(255,255,255,0.36)" }}>
              Insufficient relationship density for a full transmission network. Core parties shown above; deeper read-through unlocks as the deal develops.
            </p>
          </div>
        ) : (
          <canvas ref={canvasRef} onMouseMove={onMove} onMouseDown={onDown} onMouseUp={onUp} onMouseLeave={() => { setHovered(null); dragRef.current = null; }} className="block" style={{ cursor: "grab" }} />
        )}

        {/* Hover intelligence card */}
        {!sparse && hovered && (
          <div className="pointer-events-none absolute z-30 w-max max-w-[230px]"
            style={{ left: Math.min(hovered.sx + 14, sizeRef.current.w - 240), top: Math.max(8, hovered.sy - 12) }}>
            <div className="rounded-lg border px-3 py-2" style={{ background: "rgba(8,12,20,0.98)", borderColor: "rgba(255,255,255,0.13)", boxShadow: "0 12px 34px rgba(0,0,0,0.6)" }}>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: nodeColor(hovered.node), boxShadow: `0 0 8px ${hexA(nodeColor(hovered.node), 0.8)}` }} />
                <span className="text-[11.5px] font-semibold" style={{ color: "rgba(255,255,255,0.94)" }}>{hovered.node.name ?? hovered.node.label}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {hovered.node.ticker && <span className="text-[9px] font-mono font-bold px-1 py-px rounded" style={{ color: nodeColor(hovered.node), background: hexA(nodeColor(hovered.node), 0.14) }}>{hovered.node.ticker}</span>}
                <span className="text-[8.5px] font-semibold" style={{ color: hexA(nodeColor(hovered.node), 0.9) }}>{RELATION_META[hovered.node.role ?? "sector"].label}</span>
                <span className="text-[8.5px]" style={{ color: "rgba(255,255,255,0.42)" }}>{[hovered.node.sector, hovered.node.exchange].filter(Boolean).join(" · ")}</span>
              </div>
              {hovered.node.reason && <p className="text-[9.5px] leading-snug mt-1.5" style={{ color: "rgba(255,255,255,0.58)" }}>{hovered.node.reason}</p>}
              <div className="flex items-center gap-2.5 mt-1.5">
                {typeof hovered.node.confidence === "number" && <span className="text-[8.5px]" style={{ color: "rgba(255,255,255,0.5)" }}>Confidence <b style={{ color: "rgba(255,255,255,0.82)" }}>{hovered.node.confidence}</b></span>}
                {typeof hovered.node.beneficiaryScore === "number" && <span className="text-[8.5px]" style={{ color: "rgba(255,255,255,0.5)" }}>Impact <b style={{ color: "rgba(255,255,255,0.82)" }}>{hovered.node.beneficiaryScore}</b></span>}
                {hovered.node.themes && hovered.node.themes.length > 0 && <span className="text-[8.5px]" style={{ color: "rgba(251,146,60,0.75)" }}>{hovered.node.themes.slice(0, 2).join(" · ")}</span>}
              </div>
            </div>
          </div>
        )}

        {/* Intelligence side panel */}
        {!sparse && selected && (
          <div className="absolute top-2 right-2 bottom-2 z-20 w-[210px] rounded-lg border flex flex-col"
            style={{ background: "rgba(8,12,20,0.97)", borderColor: "rgba(255,255,255,0.12)", boxShadow: "0 14px 40px rgba(0,0,0,0.55)" }}>
            <div className="flex items-start gap-2 p-3 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: nodeColor(selected), boxShadow: `0 0 8px ${hexA(nodeColor(selected), 0.8)}` }} />
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
                  <div className="flex flex-wrap gap-1">{selected.themes.map(th => <span key={th} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(251,146,60,0.12)", color: "#fb923c" }}>{th}</span>)}</div>
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

        {/* Legend + relationship-strength key */}
        {!sparse && (
          <div className="absolute bottom-2 left-2 z-10 flex flex-wrap gap-x-2.5 gap-y-1 max-w-[58%]">
            {(["acquirer", "target", "beneficiary", "competitor", "supplier", "second-order", "theme"] as RelationType[]).map(rt => (
              <span key={rt} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: RELATION_META[rt].color }} />
                <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.42)" }}>{RELATION_META[rt].label}</span>
              </span>
            ))}
          </div>
        )}

        {/* Active-path indicator */}
        {!sparse && focusNode && (
          <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: "rgba(8,12,20,0.8)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: nodeColor(focusNode) }} />
            <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.55)" }}>Active Path · {focusNode.ticker ?? focusNode.label}</span>
          </div>
        )}
      </div>

      {/* Timeline playback */}
      {!sparse && (
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
      )}
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
