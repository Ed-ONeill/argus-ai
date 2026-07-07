"use client";

/**
 * components/explore/ExplorerGraph.tsx - the large Intelligence Network canvas of
 * the Intelligence Explorer (/explore/[entity]).
 *
 * Renders the same deterministic radial relationship map the Intelligence Drawer
 * uses (lib/intelligenceShared.buildRelationshipMap), scaled up for a full-screen
 * workspace. Read-only presentation of the shared graph singleton: edge thickness
 * encodes strength, node color encodes entity type, hover highlights the connected
 * neighborhood, and clicking a navigable node routes to /explore/[node]. No engine
 * logic. No em/en dashes.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { nodeColor, NODE_COLOR, trunc, explorerHrefForNode, type MapNode, type MapVM } from "@/lib/intelligenceShared";

const A = (n: number) => `rgba(255,255,255,${n})`;

export function ExplorerGraph({ map, accent, onNavigate }: {
  map: MapVM;
  accent: string;
  /** Fired with the /explore href of a clicked navigable node. */
  onNavigate: (href: string) => void;
}) {
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);

  const detail = useMemo(() => {
    if (hoverEdge) {
      const e = map.edges.find(x => x.id === hoverEdge);
      if (e) return `${e.from.label} ${e.type.replace(/_/g, " ")} ${e.to.label}  ·  strength ${e.strength}  ·  evidence ${e.evidenceCount}  ·  ${e.sources} source${e.sources === 1 ? "" : "s"}`;
    }
    if (hoverNode) {
      const nd = map.nodes.find(x => x.id === hoverNode);
      if (nd) {
        const base = `${nd.label}  ·  ${nd.type}  ·  confidence ${nd.confidence}  ·  ${nd.relCount} relationship${nd.relCount === 1 ? "" : "s"}`;
        return nd.degree !== 0 && explorerHrefForNode(nd) ? `${base}  ·  click to explore` : base;
      }
    }
    return "Hover to trace connections. Click a company, theme, driver or sector to explore it.";
  }, [hoverEdge, hoverNode, map]);

  const clickNode = (n: MapNode) => {
    if (n.degree === 0) return;
    const href = explorerHrefForNode(n, nodeColor(n.type));
    if (href) onNavigate(href);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <motion.svg initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease: "easeOut" }}
          viewBox={`0 0 ${map.width} ${map.height}`} className="w-full h-full select-none" preserveAspectRatio="xMidYMid meet">
          {/* orbit guides */}
          <circle cx={map.cx} cy={map.cy} r={map.r1} fill="none" stroke="#ffffff" strokeOpacity={0.05} />
          <circle cx={map.cx} cy={map.cy} r={map.r2} fill="none" stroke="#ffffff" strokeOpacity={0.03} />

          {map.edges.map(e => {
            const on = !hoverNode || e.a === hoverNode || e.b === hoverNode;
            const mx = (e.from.x + e.to.x) / 2, my = (e.from.y + e.to.y) / 2;
            return (
              <g key={e.id} onMouseEnter={() => setHoverEdge(e.id)} onMouseLeave={() => setHoverEdge(null)}>
                {/* wide invisible hit area so thin edges stay hoverable */}
                <line x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} stroke="transparent" strokeWidth={12} />
                <line x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y}
                  stroke={hoverEdge === e.id ? accent : "#ffffff"}
                  strokeWidth={(1 + e.strength / 100 * 3.4) * (on && hoverNode ? 1.25 : 1)}
                  strokeOpacity={on ? (hoverNode ? 0.2 : 0.1) + e.confidence / 100 * 0.45 : 0.04}
                  style={{ transition: "stroke-opacity 220ms ease, stroke-width 220ms ease, stroke 220ms ease" }} />
                {e.evidenceCount > 1 && <circle cx={mx} cy={my} r={Math.min(4.8, 1.6 + e.evidenceCount * 0.6)} fill="#ffffff" fillOpacity={on ? 0.35 : 0.06} style={{ transition: "fill-opacity 220ms ease" }} />}
              </g>
            );
          })}

          {map.nodes.map(node => {
            const connected = !hoverNode || node.id === hoverNode || map.edges.some(e => (e.a === hoverNode && e.b === node.id) || (e.b === hoverNode && e.a === node.id));
            const isCenter = node.degree === 0;
            const hot = hoverNode === node.id;
            const col = isCenter ? accent : nodeColor(node.type);
            const navigable = !isCenter && !!explorerHrefForNode(node);
            return (
              <g key={node.id} style={{ cursor: navigable ? "pointer" : "default" }}
                onMouseEnter={() => setHoverNode(node.id)} onMouseLeave={() => setHoverNode(null)}
                onClick={() => clickNode(node)}>
                {hot && <circle cx={node.x} cy={node.y} r={node.r + 9} fill={col} opacity={0.14} style={{ transition: "opacity 200ms ease" }} />}
                <circle cx={node.x} cy={node.y} r={hot ? node.r * 1.1 : node.r} fill={isCenter ? "#101722" : "#0b0f18"} stroke={col}
                  strokeWidth={isCenter ? 3.2 : hot ? 3 : 2}
                  opacity={connected ? 1 : 0.22}
                  style={{ transition: "r 160ms ease, opacity 220ms ease, stroke-width 160ms ease" }} />
                <text x={node.x} y={node.y + node.r + (isCenter ? 18 : 14)} textAnchor="middle"
                  fontSize={isCenter ? 15 : node.degree === 1 ? 11.5 : 9.5} fontWeight={isCenter ? 700 : node.degree === 1 ? 600 : 400}
                  fill={isCenter ? accent : "#ffffff"}
                  fillOpacity={isCenter ? 0.95 : connected ? (node.degree === 2 ? 0.55 : 0.8) : 0.14}
                  style={{ transition: "fill-opacity 220ms ease" }}>{trunc(node.label, isCenter ? 26 : 18)}</text>
              </g>
            );
          })}
        </motion.svg>
      </div>

      {/* status line + legend */}
      <div className="shrink-0 px-4 pb-3">
        <p className="text-[11px] leading-snug tabular-nums mb-1.5" style={{ color: A(0.55), minHeight: 18 }}>{detail}</p>
        <div className="flex items-center gap-4 flex-wrap">
          {[["Company", NODE_COLOR.Company], ["Theme", NODE_COLOR.Theme], ["Driver", NODE_COLOR.Macro], ["Sector", NODE_COLOR.Sector], ["Story", NODE_COLOR.Story]].map(([lbl, c]) => (
            <span key={lbl} className="flex items-center gap-1.5 text-[8.5px] font-bold uppercase tracking-wider" style={{ color: A(0.35) }}>
              <span className="w-2 h-2 rounded-full" style={{ background: c, opacity: 0.75 }} />{lbl}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
