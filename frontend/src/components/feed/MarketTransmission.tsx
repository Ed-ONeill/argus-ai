"use client";

import { useMemo } from "react";
import type { ThemeIntelligence, MarketBrief } from "@/lib/types";
import { cleanThemeName, cleanMacroLabel, confColor, convScore } from "@/app/markets/marketsShared";
import { themeBeneficiaries } from "@/lib/themeIntelligence";

/**
 * MarketTransmission — the Feed hero: a live transmission BOARD.
 *
 * One command module; each strong theme is a full-width transmission band that
 * carries market pressure left → right across four aligned columns:
 *
 *   DRIVER  ─▶  THEME  ─▶  SECTOR  ─▶  EXPRESSIONS
 *
 * Bands are dense (hairline-separated, no gaps), the theme block is the dominant
 * element (largest type + conviction number), connectors are solid gradient
 * bands with a travelling sheen (not dotted lines), and companies are grouped
 * into a single ticker cluster. Hovering a band charges its path; clicking it
 * opens the theme intelligence drawer. Pure read of theme_intelligence.
 */

type Dir = "bullish" | "bearish" | "neutral";

interface MarketTransmissionProps {
  themes:         ThemeIntelligence[];
  brief?:         MarketBrief | null;
  regime?:        string;
  isLoading?:     boolean;
  updatedLabel?:  string;
  onSelectTheme?: (theme: ThemeIntelligence) => void;
}

interface Band {
  theme:         ThemeIntelligence;
  driver:        string;
  sector:        string;
  tickers:       string[];
  conviction:    number;
  momentum:      number;
  confirmations: number;
  dir:           Dir;
}

const DIR = {
  bullish: { color: "#34d399", label: "Risk-On"  },
  bearish: { color: "#f87171", label: "Risk-Off" },
  neutral: { color: "#8ea3c4", label: "Mixed"    },
} as const;

const MAX_BANDS = 4;

// Shared column template so every band + the header align into clean lanes.
const COLS = "150px 30px minmax(190px,1fr) 30px 148px 30px minmax(168px,auto)";

// ── Derivations (real stored fields only, never invented) ──────────────────────

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
function buildBands(themes: ThemeIntelligence[]): Band[] {
  return [...themes]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .map<Band | null>(t => {
      const sector  = deriveSector(t);
      const tickers = themeBeneficiaries(t, 4);
      if (!sector || tickers.length === 0) return null;
      return {
        theme: t, driver: deriveDriver(t), sector, tickers,
        conviction: t.confidence ?? 0, momentum: t.momentum_delta ?? 0,
        confirmations: t.memory?.confirmations_today || t.evidence_count || t.contributing_story_count || 0,
        dir: dirOf(t),
      };
    })
    .filter((b): b is Band => b !== null)
    .slice(0, MAX_BANDS);
}

// ── Connector — a solid gradient transmission band with a travelling sheen ──────

function Connector({ color }: { color: string }) {
  return (
    <div className="relative flex items-center justify-center self-stretch" aria-hidden>
      {/* base band */}
      <div className="h-[3px] w-full rounded-full" style={{ background: `${color}33` }} />
      {/* travelling pressure sheen */}
      <div className="tg-band absolute inset-y-0 my-auto h-[3px] w-full rounded-full"
        style={{ background: `linear-gradient(90deg, transparent 0%, ${color} 45%, transparent 90%)` }} />
      {/* arrowhead */}
      <span className="absolute -right-0.5 text-[11px] leading-none" style={{ color }}>▸</span>
    </div>
  );
}

// ── Band ─────────────────────────────────────────────────────────────────────────

function TransmissionBand({ band, onSelect }: { band: Band; onSelect?: (t: ThemeIntelligence) => void }) {
  const { theme, driver, sector, tickers, conviction, momentum, confirmations, dir } = band;
  const c        = DIR[dir];
  const convC    = confColor(conviction);
  const momColor = momentum > 0 ? "#34d399" : momentum < 0 ? "#f87171" : "rgba(255,255,255,0.5)";
  const momArrow = momentum > 0 ? "▲" : momentum < 0 ? "▼" : "→";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(theme)}
      className="group relative grid items-center w-full text-left transition-colors duration-150 hover:bg-white/[0.018]"
      style={{ gridTemplateColumns: COLS }}
    >
      {/* always-on directional charge from the driver side + stronger on hover */}
      <span aria-hidden className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(90deg, ${c.color}10, transparent 55%)` }} />
      <span aria-hidden className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ background: `linear-gradient(90deg, ${c.color}1f, transparent 60%)` }} />

      {/* DRIVER */}
      <div className="relative min-w-0 px-3 py-3.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] leading-none shrink-0" style={{ color: c.color }}>◆</span>
          <span className="text-[12.5px] font-semibold truncate" style={{ color: "rgba(255,255,255,0.66)" }} title={driver}>{driver}</span>
        </div>
      </div>

      <Connector color={c.color} />

      {/* THEME — dominant block */}
      <div className="relative min-w-0 px-3 py-3 flex items-center justify-between gap-3"
        style={{ borderLeft: `3px solid ${c.color}`, background: `${c.color}0a` }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[17px] sm:text-[19px] font-black tracking-[-0.01em] leading-tight truncate"
              style={{ color: "rgba(255,255,255,0.98)" }} title={cleanThemeName(theme.name)}>
              {cleanThemeName(theme.name)}
            </span>
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded leading-none"
              style={{ color: c.color, background: `${c.color}1e` }}>{c.label}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10.5px] font-bold tabular-nums leading-none px-1.5 py-0.5 rounded"
              style={{ color: momColor, background: `${momColor}1c` }}>{momArrow} {momentum > 0 ? "+" : ""}{Math.round(momentum)}</span>
            <span className="text-[9.5px] font-medium tabular-nums" style={{ color: "rgba(255,255,255,0.42)" }}>
              {confirmations} {confirmations === 1 ? "confirmation" : "confirmations"}
            </span>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-center leading-none">
          <span className="text-[27px] sm:text-[30px] font-black tabular-nums leading-[0.85]" style={{ color: convC }}>{convScore(conviction)}</span>
          <span className="text-[7.5px] font-bold uppercase tracking-[0.16em] mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>Conv</span>
        </div>
      </div>

      <Connector color={c.color} />

      {/* SECTOR */}
      <div className="relative min-w-0 px-3 py-3.5">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.color }} />
          <span className="text-[13px] font-bold truncate" style={{ color: "rgba(255,255,255,0.82)" }} title={sector}>{sector}</span>
        </div>
      </div>

      <Connector color={c.color} />

      {/* EXPRESSIONS — one grouped ticker cluster */}
      <div className="relative px-3 py-3">
        <div className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5"
          style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {tickers.map((tk, i) => (
            <span key={tk} className="flex items-center">
              {i > 0 && <span className="mx-1 text-[10px]" style={{ color: "rgba(255,255,255,0.18)" }}>·</span>}
              <span className="text-[12px] font-bold tabular-nums tracking-tight"
                style={{ color: c.color, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{tk}</span>
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

// ── Board ─────────────────────────────────────────────────────────────────────────

const LANE_HEAD = ["Driver", "", "Theme", "", "Sector", "", "Expressions"] as const;

export function MarketTransmission({
  themes, brief, regime, isLoading, updatedLabel = "just now", onSelectTheme,
}: MarketTransmissionProps) {
  const bands = useMemo(() => buildBands(themes), [themes]);

  if (!isLoading && bands.length === 0) return null;

  const regimeLabel = regime || brief?.market_regime || "";
  const avgConv = bands.length ? Math.round(bands.reduce((s, b) => s + b.conviction, 0) / bands.length) : 0;

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-5">
      {/* Header — live status */}
      <div className="flex items-center gap-3 mb-2.5">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="tg-live-dot absolute inline-flex h-full w-full rounded-full" style={{ background: "#34d399" }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "#34d399" }} />
        </span>
        <span className="text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.94)" }}>
          Market Transmission
        </span>
        <span className="text-[9px] font-medium hidden sm:inline" style={{ color: "rgba(255,255,255,0.4)" }}>
          what is driving markets right now
        </span>
        <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
        {regimeLabel && (
          <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] shrink-0" style={{ color: "rgba(255,255,255,0.6)" }}>{regimeLabel}</span>
        )}
        {!isLoading && avgConv > 0 && (
          <span className="text-[9.5px] font-bold tabular-nums shrink-0" style={{ color: confColor(avgConv) }}>Conv {convScore(avgConv)}</span>
        )}
        <span className="text-[8.5px] font-medium shrink-0 hidden sm:inline" style={{ color: "rgba(255,255,255,0.34)" }}>updated {updatedLabel}</span>
      </div>

      {/* Command module */}
      <div className="relative rounded-xl overflow-hidden"
        style={{ background: "linear-gradient(180deg,#0e1424 0%,#0a0f1c 100%)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {/* faint grid texture */}
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.15))",
        }} />

        {isLoading ? (
          <div className="relative animate-pulse">
            {[0, 1, 2].map(i => <div key={i} className="h-[68px] border-b border-white/[0.05] last:border-b-0" />)}
          </div>
        ) : (
          <div className="relative overflow-x-auto scrollbar-hide">
            <div className="min-w-[760px]">
              {/* lane headers */}
              <div className="grid items-center px-0 py-2 border-b" style={{ gridTemplateColumns: COLS, borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.015)" }}>
                {LANE_HEAD.map((h, i) => (
                  <div key={i} className="px-3">
                    {h && <span className="text-[8px] font-bold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.34)" }}>{h}</span>}
                  </div>
                ))}
              </div>
              {/* bands */}
              <div className="divide-y divide-white/[0.055]">
                {bands.map(b => <TransmissionBand key={b.theme.id} band={b} onSelect={onSelectTheme} />)}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
