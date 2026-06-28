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

// Representative colour per cluster (drives the soft cluster-haze regions).
const CLUSTER_COLOR: Record<string, string> = {
  core: "#a78bfa", market: "#52b0c8", narrative: "#fb923c", second: "#c4b5fd",
};

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
  /** Header label (default "Argus Transmission Map"). */
  title?: string;
  /** Tag shown after the title (overrides the Capital Flow / Narrative tag). */
  subtitle?: string;
  /** Show the M&A timeline playback footer (default true). */
  showTimeline?: boolean;
  /** Show the role filter chips (default true). */
  showFilters?: boolean;
  /**
   * Page controller hook: fired whenever the selected node changes. The Feed uses
   * this to drive every section below the graph (Focus mode). null = Global mode.
   */
  onFocusChange?: (node: GraphNode | null) => void;
  /** Increment from outside to release the current selection (exit Focus mode). */
  clearNonce?: number;
  /** Fired as the hovered node changes — feeds the page-wide hover-highlight beam. */
  onHoverChange?: (node: GraphNode | null) => void;
  /** Normalized tokens of the active page beam — matching nodes stay lit, rest dim. */
  beamTokens?: Set<string> | null;
}

export default function NetworkGraph({ model: rootModel, expand, height = 460, title = "Argus Transmission Map", subtitle, showTimeline = true, showFilters = true, onFocusChange, clearNonce, onHoverChange, beamTokens }: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<ForceSimulation | null>(null);
  const rafRef = useRef<number>(0);
  const sizeRef = useRef({ w: 800, h: height });

  const [stack, setStack] = useState<GraphModel[]>([rootModel]);
  const model = stack[stack.length - 1];
  const [rootId, setRootId] = useState<string | null>(null); // re-rooted focus (null = event)
  useEffect(() => { setStack([rootModel]); setSelected(null); setRootId(null); }, [rootModel]);
  useEffect(() => { setRootId(null); }, [model]);
  useEffect(() => { simRef.current?.setRoot(rootId); }, [rootId]);

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
  // Parent map (BFS from the current root) → lets hover highlight the full
  // transmission path (root → node), not just immediate neighbours.
  const parentMap = useMemo(() => {
    const root = rootId ?? model.centerId;
    const parent = new Map<string, string>();
    const visited = new Set([root]);
    const q = [root];
    while (q.length) {
      const u = q.shift()!;
      for (const v of (adjacency.get(u) ?? [])) if (!visited.has(v)) { visited.add(v); parent.set(v, u); q.push(v); }
    }
    return parent;
  }, [adjacency, rootId, model.centerId]);
  const availableThemes = useMemo(() => {
    const s = new Set<string>();
    model.nodes.forEach(n => n.themes?.forEach(t => s.add(t)));
    model.edges.forEach(e => e.themes?.forEach(t => s.add(t)));
    return [...s];
  }, [model]);
  const presentRoles = useMemo(() => new Set(model.nodes.map(n => n.role).filter(Boolean) as RelationType[]), [model]);

  const variant: "narrative" | "capital" = model.id.startsWith("narrative") ? "narrative" : "capital";
  // The adapter now infers institutional transmission for every deal (even rumors),
  // so a graph is essentially never empty — only fall back if there is truly nothing.
  const sparse = model.nodes.length <= 2;

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

  // ── Page controller wiring ───────────────────────────────────────────────────
  // Selection is the single source of truth for Focus mode. Publish it upward
  // through a ref so a changing callback identity never re-fires on its own.
  const onFocusRef = useRef(onFocusChange);
  useEffect(() => { onFocusRef.current = onFocusChange; }, [onFocusChange]);
  useEffect(() => { onFocusRef.current?.(selected); }, [selected]);

  // Page-wide hover beam: broadcast the hovered node up, and receive the active
  // beam (tokens) to softly light matching nodes when the hover came from elsewhere.
  const onHoverRef = useRef(onHoverChange);
  useEffect(() => { onHoverRef.current = onHoverChange; }, [onHoverChange]);
  useEffect(() => { onHoverRef.current?.(hovered?.node ?? null); }, [hovered]);
  const beamRef = useRef<Set<string> | null>(beamTokens ?? null);
  useEffect(() => { beamRef.current = beamTokens ?? null; }, [beamTokens]);
  const nodeTok = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const map = new Map<string, Set<string>>();
    for (const n of model.nodes) {
      const s = new Set<string>();
      for (const v of [n.ticker, n.label, n.name, n.sector, ...(n.themes ?? [])]) { if (!v) continue; const t = norm(v); if (t) s.add(t); }
      map.set(n.id, s);
    }
    return map;
  }, [model]);

  // External "Exit to Global Market" — release selection and recentre.
  const clearSeen = useRef(clearNonce);
  useEffect(() => {
    if (clearNonce === clearSeen.current) return;
    clearSeen.current = clearNonce;
    setSelected(null);
    setRootId(null);
    const { w, h } = sizeRef.current, c = camRef.current;
    c.tfx = w / 2; c.tfy = h / 2; c.tscale = 1;
  }, [clearNonce]);

  const matchedId = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hit = model.nodes.find(n =>
      (n.ticker && n.ticker.toLowerCase().includes(q)) ||
      n.label.toLowerCase().includes(q) ||
      (n.name && n.name.toLowerCase().includes(q)));
    return hit?.id ?? null;
  }, [query, model]);

  // Per-node reveal progress (0→1) eased in the draw loop so timeline nodes fade in.
  const revealRef = useRef(new Map<string, number>());

  useEffect(() => {
    const { w, h } = sizeRef.current;
    simRef.current = new ForceSimulation(model, w, h);
    revealRef.current = new Map();
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

    let last = performance.now();
    const draw = (now: number) => {
      const sim = simRef.current;
      const { w, h } = sizeRef.current;
      const cam = camRef.current;
      const v = viewRef.current;
      if (!sim) { rafRef.current = requestAnimationFrame(draw); return; }

      const dt = (now - last) / 1000; last = now;
      sim.step(dt);
      cam.fx += (cam.tfx - cam.fx) * 0.12;
      cam.fy += (cam.tfy - cam.fy) * 0.12;
      cam.scale += (cam.tscale - cam.scale) * 0.12;

      const W2S = (x: number, y: number): [number, number] => [(x - cam.fx) * cam.scale + w / 2, (y - cam.fy) * cam.scale + h / 2];
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);

      // Soft cluster haze — glowing regions behind related-node groups give the
      // network layered depth (Palantir/Bloomberg-Labs feel) and make clusters legible.
      const haze = new Map<string, { x: number; y: number; n: number }>();
      for (const n of model.nodes) {
        const s = sim.get(n.id); if (!s) continue;
        const e = haze.get(s.cluster) ?? { x: 0, y: 0, n: 0 };
        e.x += s.x; e.y += s.y; e.n++; haze.set(s.cluster, e);
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const [key, e] of haze) {
        if (e.n < 2) continue;
        const [hx, hy] = W2S(e.x / e.n, e.y / e.n);
        const col = CLUSTER_COLOR[key] ?? "#52b0c8";
        const R = (78 + e.n * 11) * cam.scale;
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, R);
        g.addColorStop(0, hexA(col, 0.06));
        g.addColorStop(0.5, hexA(col, 0.022));
        g.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, R, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // Active TRANSMISSION PATH: the hovered/selected node, its neighbours, and the
      // full cause→effect path back to the root. Everything else fades.
      const focusId = v.hoveredId ?? v.selectedId;
      let active: Set<string> | null = null;
      if (focusId) {
        active = new Set<string>([focusId, ...(adjacency.get(focusId) ?? [])]);
        let p = parentMap.get(focusId), guard = 0;
        while (p && guard++ < 48) { active.add(p); p = parentMap.get(p); }
      } else if (beamRef.current && beamRef.current.size) {
        // Hover came from elsewhere on the page — light nodes whose tokens match.
        const beam = beamRef.current;
        const matched = new Set<string>();
        for (const n of model.nodes) { const ts = nodeTok.get(n.id); if (ts && setsIntersect(ts, beam)) matched.add(n.id); }
        if (matched.size) active = matched;
      }

      // ── Edges as transmission paths ──
      for (const e of model.edges) {
        const a = sim.get(e.source), b = sim.get(e.target);
        const na = nodeMap.get(e.source), nb = nodeMap.get(e.target);
        if (!a || !b || !na || !nb) continue;
        if (!nodeVisible(na, v) || !nodeVisible(nb, v)) continue;
        if ((e.stage ?? 0) > v.stage) continue;
        const lit = active ? (active.has(e.source) && active.has(e.target)) : false;
        const dimOverlay = v.overlay ? !(e.themes?.includes(v.overlay)) : false;
        const faded = (active && !lit) || dimOverlay;
        const conf = ((na.confidence ?? nb.confidence ?? 60)) / 100;
        const themeEmph = variantLocal === "narrative" && (e.type === "theme" || e.type === "capital-rotation");
        // edges strengthen as the market digests over the timeline
        const matured = 1 + Math.min(0.35, Math.max(0, v.stage - (e.stage ?? 0)) * 0.09);
        const ew = Math.min(1, e.weight * matured);
        const [ax, ay] = W2S(a.x, a.y), [bx, by] = W2S(b.x, b.y);
        const col = RELATION_META[e.type].color;
        let op = (0.07 + ew * 0.28) * (0.4 + conf * 0.6) * (themeEmph ? 1.4 : 1);
        if (faded) op *= 0.08; else if (lit) op = Math.min(0.95, op * 2.6);

        // direction gradient: brighter at the driver (source), fading toward the consequence
        const grad = ctx.createLinearGradient(ax, ay, bx, by);
        grad.addColorStop(0, hexA(col, op));
        grad.addColorStop(0.65, hexA(col, op * 0.6));
        grad.addColorStop(1, hexA(col, op * 0.28));
        ctx.save();
        ctx.strokeStyle = grad;
        ctx.lineWidth = (0.6 + ew * 2.4) * cam.scale * (lit ? 1.7 : 1);
        ctx.setLineDash([4, 7]);
        ctx.lineDashOffset = -((t * (8 + ew * 24)) % 11);
        if (lit) { ctx.shadowColor = hexA(col, 0.55); ctx.shadowBlur = 8; }
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.restore();

        // glowing capital particles — flow ONLY on connected paths when focused,
        // ambient on strong edges otherwise; density encodes transmission strength
        const animate = active ? lit : ew > 0.45;
        if (!faded && animate) {
          const count = lit ? 3 : ew > 0.75 ? 3 : ew > 0.5 ? 2 : 1;
          const speed = 0.09 + ew * 0.13;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          for (let p = 0; p < count; p++) {
            const tt = ((t * speed + p / count + hashFrac(e.source + e.target)) % 1);
            const px = ax + (bx - ax) * tt, py = ay + (by - ay) * tt;
            const pr = (lit ? 2.3 : 1.6) * cam.scale;
            const pg = ctx.createRadialGradient(px, py, 0, px, py, pr * 2.4);
            pg.addColorStop(0, hexA(col, lit ? 0.98 : 0.7));
            pg.addColorStop(1, hexA(col, 0));
            ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, pr * 2.4, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        }

        // relationship label on the highlighted transmission path
        if (lit && cam.scale > 0.75) {
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
        // timeline reveal — nodes fade in smoothly as the market digests over time
        const rv = revealRef.current;
        const revealT = visible ? 1 : 0.08;
        const reveal = (rv.get(n.id) ?? revealT) + (revealT - (rv.get(n.id) ?? revealT)) * 0.07;
        rv.set(n.id, reveal);
        let op = reveal;
        if (focusDim) op *= 0.22;
        if (variantDim) op *= 0.7;
        // layered depth: nodes farther from centre recede slightly
        if (!isActive) op *= 1 - Math.min(0.22, (Math.hypot(s.x - w / 2, s.y - h / 2) / Math.max(w, h)) * 0.5);
        const highConf = (n.confidence ?? 0) >= 75;
        // importance grows as later stages mature (the market reprices it)
        const grow = 1 + Math.min(0.2, Math.max(0, v.stage - (n.stage ?? 0)) * 0.06);
        const major = n.kind === "event" || s.radius > 16 || highConf;
        const breath = (isActive || major) ? 1 + 0.025 * Math.sin(t * 1.6 + hashFrac(n.id) * 6.28) : 1;
        const r = s.radius * cam.scale * breath * grow;

        // soft additive bloom — glow INTENSITY encodes confidence
        const confGlow = 0.05 + ((n.confidence ?? 50) / 100) * 0.15; // 0.05–0.20
        const bloomA = (isActive ? 0.34 : n.kind === "event" ? 0.26 : confGlow) * op;
        if (bloomA > 0.02) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const bloom = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 3.1);
          bloom.addColorStop(0, hexA(col, bloomA));
          bloom.addColorStop(0.45, hexA(col, bloomA * 0.34));
          bloom.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(sx, sy, r * 3.1, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }

        // gentle perpetual pulse on the primary node — alive, never gimmicky
        if (n.kind === "event" && visible && !isActive) {
          const gp = (t * 0.4) % 1;
          ctx.strokeStyle = hexA(col, (1 - gp) * 0.16 * op);
          ctx.lineWidth = 1.1 * cam.scale;
          ctx.beginPath(); ctx.arc(sx, sy, r + gp * 16 * cam.scale, 0, Math.PI * 2); ctx.stroke();
        }
        // directional pulse for active nodes
        if (isActive && visible) {
          const pulse = (t * 0.7 + hashFrac(n.id)) % 1;
          ctx.strokeStyle = hexA(col, (1 - pulse) * 0.4 * op);
          ctx.lineWidth = 1.4 * cam.scale;
          ctx.beginPath(); ctx.arc(sx, sy, r + pulse * 12 * cam.scale, 0, Math.PI * 2); ctx.stroke();
        }

        // glass surface — soft top-left highlight into a dark glass edge (subtler)
        const body = ctx.createRadialGradient(sx - r * 0.32, sy - r * 0.32, r * 0.1, sx, sy, r);
        body.addColorStop(0, hexA(col, 0.33 * op));
        body.addColorStop(0.6, hexA(col, 0.13 * op));
        body.addColorStop(1, hexA("#0a0f18", 0.5 * op));
        ctx.fillStyle = body; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();

        // clean inner core
        ctx.fillStyle = hexA(col, 0.4 * op);
        ctx.beginPath(); ctx.arc(sx, sy, r * 0.26, 0, Math.PI * 2); ctx.fill();

        // outer ring — stronger on hover/selected
        ctx.save();
        ctx.lineWidth = (isActive ? 2.4 : 1.2) * cam.scale;
        ctx.strokeStyle = hexA(col, (isActive ? 1 : 0.5) * op);
        if (isActive) { ctx.shadowColor = hexA(col, 0.55); ctx.shadowBlur = 8; }
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        if (isMatch) { ctx.lineWidth = 1; ctx.strokeStyle = hexA(col, 0.45); ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, Math.PI * 2); ctx.stroke(); }

        // label — offset below (flips above near the edge), ellipsis only when needed,
        // hidden for nodes dimmed out of the active path
        const dimmedOut = active != null && !active.has(n.id) && n.id !== model.centerId;
        if (!dimmedOut) {
          const label = n.kind === "company" ? (n.ticker ?? n.label) : n.label;
          ctx.save();
          ctx.font = `${n.kind === "event" ? 700 : 600} ${n.kind === "event" ? 12 : 10}px ui-sans-serif, system-ui`;
          ctx.textAlign = "center"; ctx.textBaseline = "top";
          const maxW = n.kind === "event" ? 132 : 96;
          let shown = label;
          if (ctx.measureText(shown).width > maxW) {
            while (shown.length > 4 && ctx.measureText(shown + "…").width > maxW) shown = shown.slice(0, -1);
            shown += "…";
          }
          const half = ctx.measureText(shown).width / 2;
          const lx = Math.max(half + 4, Math.min(w - half - 4, sx));
          const below = sy + r + 5;
          const ly = below + 12 > h - 3 ? sy - r - 14 : below;
          ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 4;
          ctx.fillStyle = hexA("#ffffff", (n.kind === "event" ? 0.96 : 0.78) * Math.max(op, 0.22));
          ctx.fillText(shown, lx, ly);
          ctx.restore();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [model, nodeMap, adjacency, parentMap, nodeVisible, matchedId, height, sparse, nodeTok]);

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
    if (!hit) { setSelected(null); setRootId(null); return; } // background → release focus
    // Clicking a node re-roots the transmission tree on it (smooth, in-place).
    setSelected(hit.node);
    setRootId(hit.node.id === model.centerId ? null : hit.node.id);
    camRef.current.tfx = sizeRef.current.w / 2; camRef.current.tfy = sizeRef.current.h / 2; camRef.current.tscale = 1;
  };

  const zoom = (dir: number) => { const c = camRef.current; c.tscale = Math.max(0.5, Math.min(2.4, c.tscale * (dir > 0 ? 1.2 : 0.83))); };
  const resetView = () => { const { w, h } = sizeRef.current; const c = camRef.current; c.tfx = w / 2; c.tfy = h / 2; c.tscale = 1; setRootId(null); };

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
        <span className="text-[8.5px] font-black uppercase tracking-[0.16em]" style={{ color: "rgba(82,176,200,0.85)" }}>{title}</span>
        <span className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ color: variant === "narrative" ? "#fb923c" : "#7cc7d8", background: variant === "narrative" ? "rgba(251,146,60,0.12)" : "rgba(82,176,200,0.12)" }}>
          {subtitle ?? (variant === "narrative" ? "Narrative Propagation" : "Capital Flow")}
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
      {!sparse && (showFilters || availableThemes.length > 0) && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-b flex-wrap" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          {showFilters && FILTERS.map(f => (
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
            <p className="text-[9.5px] leading-snug max-w-[270px] mt-1" style={{ color: "rgba(255,255,255,0.36)" }}>
              No identified counterparties yet — typical of an early rumor. The full transmission network renders once the parties are named.
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

        {/* Legend — only the relationship types actually present */}
        {!sparse && (
          <div className="absolute bottom-2 left-2 z-10 flex flex-wrap gap-x-2.5 gap-y-1 max-w-[58%]">
            {(["acquirer", "target", "beneficiary", "competitor", "supplier", "second-order", "theme", "sector", "cross-sector", "capital-rotation"] as RelationType[])
              .filter(rt => presentRoles.has(rt))
              .map(rt => (
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
      {!sparse && showTimeline && (
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
function setsIntersect(a: Set<string>, b: Set<string>): boolean {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) return true;
  return false;
}
function hashFrac(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
