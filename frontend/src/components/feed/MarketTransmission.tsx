"use client";

import { useMemo, useState } from "react";
import type { ThemeIntelligence, MarketBrief } from "@/lib/types";
import { cleanThemeName, cleanMacroLabel, confColor, convScore } from "@/app/markets/marketsShared";
import { themeBeneficiaries } from "@/lib/themeIntelligence";

/**
 * MarketTransmission — the Feed hero: a live, structured market-transmission map.
 *
 * Four lanes — Macro Drivers → Themes → Sectors → Companies — with weighted,
 * direction-colored flow links showing market pressure moving downstream through
 * the system. Strongest themes are largest; higher conviction draws heavier
 * lines; flows breathe and stream so the board feels awake. Hover lights the
 * connected path and dims the rest; clicking any node opens the theme drawer.
 *
 * Pure read of existing theme_intelligence (drivers, sectors, tickers,
 * conviction, momentum, confirmations, direction) — no new data, no physics
 * simulation, no random placement. Layout is deterministic: lanes are columns,
 * nodes are even-spaced and ordered to minimise crossings.
 */

type Dir = "bullish" | "bearish" | "neutral";

interface MarketTransmissionProps {
  themes:         ThemeIntelligence[];
  brief?:         MarketBrief | null;
  regime?:        string;
  isLoading?:     boolean;
  updatedLabel?:  string;                       // e.g. "just now"
  onSelectTheme?: (theme: ThemeIntelligence) => void;
}

const DIR_COLOR: Record<Dir, string> = {
  bullish: "#34d399",   // emerald
  bearish: "#f87171",   // red
  neutral: "#8ea3c4",   // slate-blue
};

// ── Derivations (every value is a real stored field, never invented) ───────────

function dirOf(t: ThemeIntelligence): Dir {
  return t.momentum_direction === "bullish" ? "bullish"
       : t.momentum_direction === "bearish" ? "bearish" : "neutral";
}

function deriveDriver(t: ThemeIntelligence): string {
  const cn = t.causal_narrative ?? "";
  if (cn.includes("→")) {
    const head = cn.split("→").map(s => s.trim()).filter(Boolean)[0];
    if (head && head.length > 2) return cleanMacroLabel(head);
  }
  const macro = (t.related_macro_factors ?? [])[0];
  return macro ? cleanMacroLabel(macro) : "Macro backdrop";
}

function deriveSector(t: ThemeIntelligence): string | null {
  const inds = t.related_industries ?? [];
  return inds.find(s => t.relationship_weights?.[s]?.direction === "positive") ?? inds[0] ?? null;
}

// ── Graph geometry ─────────────────────────────────────────────────────────────

const VB_W      = 1060;
const LANE_X    = [120, 402, 690, 950] as const;   // node centres per lane
const TOP       = 74;
const ROW       = 52;
const BOTPAD    = 26;
const MAX_THEMES   = 3;    // keep the board readable in ~3 seconds, not crowded
const MAX_COMPANIES = 8;   // cap the densest lane so lanes stay balanced

interface GNode {
  id:         string;
  lane:       0 | 1 | 2 | 3;
  kind:       "driver" | "theme" | "sector" | "company";
  label:      string;
  full:       string;
  sub?:       string;
  themeIds:   string[];
  dir:        Dir;
  conviction: number;
  theme:      ThemeIntelligence;   // node's dominant theme (opens the drawer)
  x: number; y: number; w: number; h: number; fs: number;
}

interface GLink {
  id: string; from: string; to: string;
  themeId: string; dir: Dir; conviction: number;
  x1: number; y1: number; x2: number; y2: number;
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function pillW(label: string, fs: number, padX: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(label.length * fs * 0.6) + padX * 2));
}

interface Graph { nodes: GNode[]; links: GLink[]; vbH: number; themeCount: number }

function buildGraph(themes: ThemeIntelligence[]): Graph {
  // Complete chains only (theme must land on a sector and name tickers), top 4 by conviction.
  const chains = [...themes]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .map(t => {
      const sector  = deriveSector(t);
      const tickers = themeBeneficiaries(t, 3);
      if (!sector || tickers.length === 0) return null;
      return { t, driver: deriveDriver(t), sector, tickers };
    })
    .filter((c): c is { t: ThemeIntelligence; driver: string; sector: string; tickers: string[] } => c !== null)
    .slice(0, MAX_THEMES);

  if (chains.length === 0) return { nodes: [], links: [], vbH: 240, themeCount: 0 };

  // Dominant-theme tracking for shared driver/sector/company nodes.
  const dom = new Map<string, ThemeIntelligence>();
  const keep = (key: string, t: ThemeIntelligence) => {
    const cur = dom.get(key);
    if (!cur || (t.confidence ?? 0) > (cur.confidence ?? 0)) dom.set(key, t);
  };

  const driverIds = new Map<string, string[]>();   // name → themeIds
  const sectorIds = new Map<string, string[]>();
  const tickerIds = new Map<string, string[]>();
  const themeMeta = chains.map(c => ({ ...c, id: c.t.id, dir: dirOf(c.t), conv: c.t.confidence ?? 0 }));

  for (const c of themeMeta) {
    const dKey = `d:${c.driver}`, sKey = `s:${c.sector}`;
    driverIds.set(dKey, [...(driverIds.get(dKey) ?? []), c.id]); keep(dKey, c.t);
    sectorIds.set(sKey, [...(sectorIds.get(sKey) ?? []), c.id]); keep(sKey, c.t);
    for (const tk of c.tickers) {
      const cKey = `c:${tk}`;
      tickerIds.set(cKey, [...(tickerIds.get(cKey) ?? []), c.id]); keep(cKey, c.t);
    }
  }

  // Theme lane: conviction desc, strongest at top. Other lanes order by mean theme row.
  const themeOrder = new Map(themeMeta.map((c, i) => [c.id, i]));
  const meanRow = (ids: string[]) => ids.reduce((s, id) => s + (themeOrder.get(id) ?? 0), 0) / ids.length;

  const maxConv = Math.max(...themeMeta.map(c => c.conv), 1);

  const nodes: GNode[] = [];

  // Themes
  themeMeta.forEach(c => {
    const fs = 12 + (c.conv / maxConv) * 4.5;          // strongest theme largest
    const label = trunc(cleanThemeName(c.t.name), 20);
    nodes.push({
      id: `t:${c.id}`, lane: 1, kind: "theme", label, full: cleanThemeName(c.t.name),
      sub: `${convScore(c.conv)}`, themeIds: [c.id], dir: c.dir, conviction: c.conv, theme: c.t,
      x: 0, y: 0, w: pillW(label, fs, 13, 96, 196), h: fs + 16, fs,
    });
  });
  // Drivers
  [...driverIds.entries()].sort((a, b) => meanRow(a[1]) - meanRow(b[1])).forEach(([key, ids]) => {
    const name = key.slice(2), fs = 11.5, label = trunc(name, 18);
    nodes.push({
      id: key, lane: 0, kind: "driver", label, full: name, themeIds: ids,
      dir: dirOf(dom.get(key)!), conviction: dom.get(key)!.confidence ?? 0, theme: dom.get(key)!,
      x: 0, y: 0, w: pillW(label, fs, 11, 80, 168), h: fs + 13, fs,
    });
  });
  // Sectors
  [...sectorIds.entries()].sort((a, b) => meanRow(a[1]) - meanRow(b[1])).forEach(([key, ids]) => {
    const name = key.slice(2), fs = 11.5, label = trunc(name, 16);
    nodes.push({
      id: key, lane: 2, kind: "sector", label, full: name, themeIds: ids,
      dir: dirOf(dom.get(key)!), conviction: dom.get(key)!.confidence ?? 0, theme: dom.get(key)!,
      x: 0, y: 0, w: pillW(label, fs, 11, 78, 150), h: fs + 13, fs,
    });
  });
  // Companies — keep the densest lane balanced: top MAX_COMPANIES by the
  // conviction of their dominant theme, then ordered to minimise crossings.
  const keptTickers = [...tickerIds.entries()]
    .sort((a, b) => (dom.get(b[0])!.confidence ?? 0) - (dom.get(a[0])!.confidence ?? 0))
    .slice(0, MAX_COMPANIES);
  keptTickers.sort((a, b) => meanRow(a[1]) - meanRow(b[1])).forEach(([key, ids]) => {
    const name = key.slice(2), fs = 11;
    nodes.push({
      id: key, lane: 3, kind: "company", label: name, full: name, themeIds: ids,
      dir: dirOf(dom.get(key)!), conviction: dom.get(key)!.confidence ?? 0, theme: dom.get(key)!,
      x: 0, y: 0, w: pillW(name, fs, 9, 46, 86), h: fs + 12, fs,
    });
  });

  // Vertical layout — even-space each lane across the canvas.
  const lanes: GNode[][] = [[], [], [], []];
  for (const n of nodes) lanes[n.lane].push(n);
  const maxCount = Math.max(...lanes.map(l => l.length), 1);
  const vbH = Math.max(232, TOP + (maxCount - 1) * ROW + 36 + BOTPAD);
  const bot = vbH - BOTPAD;
  lanes.forEach((laneNodes, li) => {
    const n = laneNodes.length;
    laneNodes.forEach((nd, k) => {
      nd.x = LANE_X[li];
      nd.y = n === 1 ? (TOP + bot) / 2 : TOP + (bot - TOP) * (k / (n - 1));
    });
  });

  // Links — edge to edge so lines enter the pill faces, not their centres.
  const byId = new Map(nodes.map(n => [n.id, n]));
  const links: GLink[] = [];
  const link = (fromId: string, toId: string, t: ThemeIntelligence) => {
    const a = byId.get(fromId), b = byId.get(toId);
    if (!a || !b) return;
    links.push({
      id: `${fromId}>${toId}>${t.id}`, from: fromId, to: toId, themeId: t.id,
      dir: dirOf(t), conviction: t.confidence ?? 0,
      x1: a.x + a.w / 2, y1: a.y, x2: b.x - b.w / 2, y2: b.y,
    });
  };
  for (const c of themeMeta) {
    link(`d:${c.driver}`, `t:${c.id}`, c.t);
    link(`t:${c.id}`, `s:${c.sector}`, c.t);
    for (const tk of c.tickers) link(`s:${c.sector}`, `c:${tk}`, c.t);
  }

  return { nodes, links, vbH, themeCount: themeMeta.length };
}

function curve(l: GLink): string {
  const cx = (l.x1 + l.x2) / 2;
  return `M ${l.x1} ${l.y1} C ${cx} ${l.y1}, ${cx} ${l.y2}, ${l.x2} ${l.y2}`;
}

// ── Component ────────────────────────────────────────────────────────────────────

const LANE_LABELS = ["Drivers", "Themes", "Sectors", "Companies"] as const;

export function MarketTransmission({
  themes, brief, regime, isLoading, updatedLabel = "just now", onSelectTheme,
}: MarketTransmissionProps) {
  const { nodes, links, vbH, themeCount } = useMemo(() => buildGraph(themes), [themes]);
  const [hover, setHover] = useState<string | null>(null);

  if (!isLoading && nodes.length === 0) return null;

  // Active set: the themeIds reachable from the hovered node (whole chains).
  const hoverThemes: Set<string> | null = hover
    ? new Set(nodes.find(n => n.id === hover)?.themeIds ?? [])
    : null;
  const nodeActive = (n: GNode) => !hoverThemes || n.themeIds.some(id => hoverThemes.has(id));
  const linkActive = (l: GLink) => !hoverThemes || hoverThemes.has(l.themeId);

  const regimeLabel = regime || brief?.market_regime || "";
  const avgConv = themeCount
    ? Math.round(nodes.filter(n => n.kind === "theme").reduce((s, n) => s + n.conviction, 0) / themeCount)
    : 0;

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-5">
      {/* Header — live status + regime */}
      <div className="flex items-center gap-3 mb-2.5">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="tg-live-dot absolute inline-flex h-full w-full rounded-full" style={{ background: "#34d399" }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "#34d399" }} />
        </span>
        <span className="text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.94)" }}>
          Market Transmission
        </span>
        <span className="text-[9px] font-medium hidden sm:inline" style={{ color: "rgba(255,255,255,0.4)" }}>
          drivers → themes → sectors → companies
        </span>
        <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
        {regimeLabel && (
          <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] shrink-0" style={{ color: "rgba(255,255,255,0.6)" }}>
            {regimeLabel}
          </span>
        )}
        {!isLoading && avgConv > 0 && (
          <span className="text-[9.5px] font-bold tabular-nums shrink-0" style={{ color: confColor(avgConv) }}>
            Conv {convScore(avgConv)}
          </span>
        )}
        <span className="text-[8.5px] font-medium shrink-0 hidden sm:inline" style={{ color: "rgba(255,255,255,0.34)" }}>
          updated {updatedLabel}
        </span>
      </div>

      {isLoading ? (
        <div className="w-full rounded-xl animate-pulse" style={{ height: 232, background: "#0d1322", border: "1px solid rgba(255,255,255,0.05)" }} aria-hidden />
      ) : (
        <div
          className="relative w-full rounded-xl overflow-hidden"
          style={{ background: "linear-gradient(180deg,#0d1322 0%,#0a0f1c 100%)", border: "1px solid rgba(255,255,255,0.07)" }}
          onMouseLeave={() => setHover(null)}
        >
          <svg
            viewBox={`0 0 ${VB_W} ${vbH}`}
            width="100%"
            style={{ display: "block", aspectRatio: `${VB_W} / ${vbH}` }}
            role="group"
            aria-label="Market transmission map: drivers to themes to sectors to companies"
          >
            {/* faint lane separators + headers (structure, not decoration) */}
            {[0, 1, 2].map(i => {
              const x = (LANE_X[i] + LANE_X[i + 1]) / 2;
              return <line key={`sep${i}`} x1={x} y1={40} x2={x} y2={vbH - 14} stroke="rgba(255,255,255,0.045)" strokeWidth={1} />;
            })}
            {LANE_X.map((x, i) => (
              <text key={`lh${i}`} x={x} y={26} textAnchor="middle"
                fontSize={9} fontWeight={700} letterSpacing="2"
                fill="rgba(255,255,255,0.32)" style={{ textTransform: "uppercase" }}>
                {LANE_LABELS[i].toUpperCase()}
              </text>
            ))}

            {/* Links — base weight by conviction; an animated dashed overlay = flow */}
            {links.map(l => {
              const active = linkActive(l);
              const d = curve(l);
              const color = DIR_COLOR[l.dir];
              const w = 1.1 + (l.conviction / 100) * 2.4;       // heavier line = higher conviction
              const flowDur = 1.7 - (l.conviction / 100) * 0.8; // stronger flows stream faster
              return (
                <g key={l.id} opacity={active ? 1 : 0.12} style={{ transition: "opacity .2s" }}>
                  <path d={d} fill="none" stroke={color} strokeWidth={w} strokeOpacity={active ? 0.5 : 0.4} strokeLinecap="round" />
                  {active && (
                    <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round"
                      strokeDasharray="2 12" strokeOpacity={0.95}
                      className="tg-flow-line" style={{ animationDuration: `${flowDur}s` }} />
                  )}
                  {/* wide invisible hit area → clicking a path opens its theme */}
                  <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHover(l.to)} onClick={() => onSelectTheme?.(nodes.find(n => n.id === l.to)?.theme ?? nodes.find(n => n.id === l.from)!.theme)} />
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map(n => {
              const active = nodeActive(n);
              const color  = DIR_COLOR[n.dir];
              const isTheme = n.kind === "theme";
              const isHovered = hover === n.id;
              const fill = isTheme ? "#161f33" : "#121a2b";
              return (
                <g key={n.id}
                   transform={`translate(${n.x} ${n.y})`}
                   opacity={active ? 1 : 0.2}
                   style={{ transition: "opacity .2s", cursor: "pointer" }}
                   tabIndex={0} role="button" aria-label={`${n.full} — conviction ${convScore(n.conviction)}`}
                   onMouseEnter={() => setHover(n.id)}
                   onClick={() => onSelectTheme?.(n.theme)}
                   onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectTheme?.(n.theme); } }}
                >
                  {/* active theme nodes breathe */}
                  <rect x={-n.w / 2} y={-n.h / 2} width={n.w} height={n.h} rx={n.h / 2}
                    fill={fill}
                    stroke={color}
                    strokeOpacity={isHovered ? 0.95 : isTheme ? 0.6 : 0.4}
                    strokeWidth={isHovered ? 1.6 : isTheme ? 1.3 : 1}
                    className={isTheme && active ? "tg-breathe" : undefined} />
                  {/* left accent tick on theme nodes for direction read */}
                  {isTheme && (
                    <rect x={-n.w / 2} y={-n.h / 2} width={3} height={n.h} rx={1.5} fill={color} />
                  )}
                  <text x={isTheme ? 6 : 0} y={isTheme && n.sub ? -1 : 0.5}
                    textAnchor={isTheme ? "start" : "middle"}
                    dominantBaseline="middle"
                    fontSize={n.fs}
                    fontWeight={isTheme ? 800 : n.kind === "company" ? 700 : 600}
                    fontFamily={n.kind === "company" ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined}
                    fill={isTheme ? "rgba(255,255,255,0.97)" : n.kind === "company" ? color : "rgba(255,255,255,0.74)"}
                    style={{ letterSpacing: isTheme ? "-0.01em" : 0 }}>
                    {n.label}
                  </text>
                  {/* theme conviction inline */}
                  {isTheme && n.sub && (
                    <text x={6} y={n.fs * 0.62 + 1} textAnchor="start" dominantBaseline="middle"
                      fontSize={8} fontWeight={700} letterSpacing="0.5"
                      fill={confColor(n.conviction)}>
                      CONV {n.sub}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* legend — quiet, bottom-right */}
          <div className="absolute bottom-2 right-3 flex items-center gap-3 pointer-events-none">
            {([["Risk-On", DIR_COLOR.bullish], ["Risk-Off", DIR_COLOR.bearish], ["Mixed", DIR_COLOR.neutral]] as const).map(([lbl, c]) => (
              <span key={lbl} className="flex items-center gap-1">
                <span className="w-2.5 h-[2px] rounded-full" style={{ background: c }} />
                <span className="text-[7.5px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>{lbl}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
