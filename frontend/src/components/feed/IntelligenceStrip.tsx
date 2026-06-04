"use client";

import { useMemo } from "react";
import type { ThemeIntelligence } from "@/lib/types";
import { useMarketState } from "@/hooks/useMarketState";
import {
  computeScorecard,
  computeOpportunities,
  computeRisks,
  detectTransitions,
  computeIndustryRotation,
  type BriefingScorecard,
  type BriefingOpportunity,
  type BriefingRisk,
  type IndustryRotationSignal,
} from "@/lib/morningBriefingEngine";

// ── Constants ─────────────────────────────────────────────────────────────────

const REGIME_COLOR: Record<string, string> = {
  "risk-on":  "#52b0c8",
  "risk-off": "#c05858",
  "neutral":  "#8898b8",
};

const CONFIDENCE_ABBR: Record<string, string> = {
  "High Conviction": "HC",
  "Elevated":        "EL",
  "Moderate":        "MO",
  "Developing":      "DE",
  "Speculative":     "SP",
};

const MOMENTUM_COLOR: Record<string, string> = {
  accelerating:  "#10B981",
  strengthening: "#34D399",
  stable:        "rgba(255,255,255,0.32)",
  cooling:       "#F59E0B",
  reversing:     "#EF4444",
  emerging:      "#A78BFA",
};

const MOMENTUM_ABBR: Record<string, string> = {
  accelerating:  "ACCEL",
  strengthening: "STRNG",
  stable:        "STBL",
  cooling:       "COOL",
  reversing:     "REV",
  emerging:      "EMRG",
};

// ── Change sentence generation ────────────────────────────────────────────────

function generateThemeChanges(themes: ThemeIntelligence[]): string[] {
  const updates: string[] = [];

  for (const t of themes) {
    if (updates.length >= 5) break;
    const delta = t.momentum_delta ?? 0;
    const inds  = t.related_industries ?? [];
    const ind0  = inds[0] ?? null;
    const ind1  = inds[1] ?? null;

    if (t.momentum_label === "accelerating" && delta >= 10) {
      updates.push(`${t.name} accelerated${ind0 ? ` — ${ind0} leading` : ""}`);
    } else if (t.cross_category_confirmed && (t.breadth_score ?? 0) >= 65 && ind0 && ind1) {
      updates.push(`${t.name} broadened into ${ind0} and ${ind1}`);
    } else if (t.cross_category_confirmed && ind0) {
      updates.push(`${t.name} confirmed cross-sector into ${ind0}`);
    } else if (t.momentum_label === "reversing" || delta <= -12) {
      updates.push(`${t.name} reversal — delta ${Math.round(delta)}`);
    } else if ((t.persistence_cycles ?? 0) >= 8) {
      updates.push(`${t.name} — ${t.persistence_cycles}-cycle persistence`);
    } else if ((t.evidence_count ?? 0) >= 8 && delta > 0) {
      updates.push(`${t.name} — ${t.evidence_count} confirming sources`);
    } else if ((t.breadth_score ?? 0) < 25 && delta < -5 && ind0) {
      updates.push(`${t.name} narrowing to ${ind0}`);
    } else if (t.momentum_label === "strengthening" && t.signal_strength === "strong") {
      updates.push(`${t.name} strengthening — elevated signal quality`);
    }
  }

  // Backfill
  if (updates.length < 3) {
    for (const t of themes) {
      if (updates.length >= 4) break;
      const stories = t.contributing_story_count ?? 0;
      const ind0    = (t.related_industries ?? [])[0] ?? null;
      if (stories >= 5 && ind0) {
        updates.push(`${t.name} — ${stories} sources, ${ind0}`);
      }
    }
  }

  return updates.slice(0, 5);
}

// ── Main component ────────────────────────────────────────────────────────────

interface IntelligenceStripProps {
  themes: ThemeIntelligence[];
}

export function IntelligenceStrip({ themes }: IntelligenceStripProps) {
  const ms = useMarketState();

  const scorecard  = useMemo(() => computeScorecard(themes),         [themes]);
  const opps       = useMemo(() => computeOpportunities(themes),     [themes]);
  const risks      = useMemo(() => computeRisks(themes),             [themes]);
  const rotation   = useMemo(() => computeIndustryRotation(themes),  [themes]);
  const transitions= useMemo(() => detectTransitions(themes),        [themes]);
  const changes    = useMemo(() => generateThemeChanges(themes),     [themes]);

  if (themes.length === 0) return null;

  const regimeColor  = REGIME_COLOR[ms.riskRegime] ?? "#8898b8";
  const regimeLabel  = ms.riskRegime === "risk-on"  ? "Risk-On"  :
                       ms.riskRegime === "risk-off" ? "Risk-Off" : "Neutral";
  const volLabel     = ms.volRegime === "high" || ms.volRegime === "elevated"
                         ? " · Vol↑"
                         : ms.volRegime === "low" ? " · Vol↓" : "";
  const trendLabel   = ms.trend.riskDirection !== "stable" ? ` · ${ms.trend.label}` : "";

  const upgrades   = transitions.filter(t => t.direction === "upgrade");
  const downgrades = transitions.filter(t => t.direction === "downgrade");
  const hasTransitions = upgrades.length > 0 || downgrades.length > 0;

  return (
    <div
      className="rounded-xl mb-5 overflow-hidden"
      style={{
        background:  "rgba(3,6,15,0.96)",
        border:      "1px solid rgba(255,255,255,0.07)",
        borderLeft:  `2px solid ${regimeColor}40`,
      }}
    >

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.055)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
            style={{ background: regimeColor }} />
          <span className="text-[8.5px] font-bold uppercase tracking-[0.20em]"
            style={{ color: "rgba(255,255,255,0.35)" }}>
            Morning Briefing
          </span>
          <div className="h-3 w-px shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
          <span className="text-[10px] font-semibold" style={{ color: regimeColor }}>
            {regimeLabel}
          </span>
          {(volLabel || trendLabel) && (
            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.28)" }}>
              {volLabel}{trendLabel}
            </span>
          )}
        </div>
        <span className="text-[8px] tabular-nums" style={{ color: "rgba(255,255,255,0.18)" }}>
          {scorecard.total} themes
        </span>
      </div>

      {/* ── Scorecard ────────────────────────────────────────────────────────── */}
      <ScorecardRow scorecard={scorecard} />

      {/* ── Opportunities | Risks ────────────────────────────────────────────── */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr",
        borderTop:           "1px solid rgba(255,255,255,0.05)",
      }}>

        {/* Opportunities */}
        <div className="px-4 py-2.5"
          style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}>
          <p className="text-[7px] font-bold uppercase tracking-[0.20em] mb-1.5"
            style={{ color: "rgba(16,185,129,0.55)" }}>
            ▲ Opportunities
          </p>
          {opps.map((opp, i) => <OppRow key={i} opp={opp} />)}
        </div>

        {/* Risks */}
        <div className="px-4 py-2.5">
          <p className="text-[7px] font-bold uppercase tracking-[0.20em] mb-1.5"
            style={{ color: "rgba(239,68,68,0.55)" }}>
            ▼ Risks
          </p>
          {risks.map((risk, i) => <RiskRow key={i} risk={risk} />)}
        </div>

      </div>

      {/* ── Industry Rotation ─────────────────────────────────────────────────── */}
      {rotation.length > 0 && (
        <div className="px-4 py-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[7px] font-bold uppercase tracking-[0.18em] shrink-0"
              style={{ color: "rgba(255,255,255,0.22)" }}>
              Rotation
            </span>
            {rotation.map((sig, i) => (
              <RotationChip key={i} sig={sig} />
            ))}
          </div>
        </div>
      )}

      {/* ── Transitions (only when present) ─────────────────────────────────── */}
      {hasTransitions && (
        <div className="px-4 py-2 space-y-1"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          {upgrades.length > 0 && (
            <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5">
              <span className="text-[7px] font-bold uppercase tracking-[0.14em] shrink-0"
                style={{ color: "rgba(16,185,129,0.65)" }}>
                ↑ Upgrades
              </span>
              {upgrades.map((u, i) => (
                <span key={i} className="text-[10px]">
                  <span style={{ color: "rgba(255,255,255,0.72)", fontWeight: 500 }}>{u.theme.name}</span>
                  {" "}<span style={{ color: "#10B981", opacity: 0.70 }}>{u.label}</span>
                </span>
              ))}
            </div>
          )}
          {downgrades.length > 0 && (
            <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5">
              <span className="text-[7px] font-bold uppercase tracking-[0.14em] shrink-0"
                style={{ color: "rgba(239,68,68,0.65)" }}>
                ↓ Downgrades
              </span>
              {downgrades.map((d, i) => (
                <span key={i} className="text-[10px]">
                  <span style={{ color: "rgba(255,255,255,0.72)", fontWeight: 500 }}>{d.theme.name}</span>
                  {" "}<span style={{ color: "#EF4444", opacity: 0.70 }}>{d.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Change feed ──────────────────────────────────────────────────────── */}
      {changes.length > 0 && (
        <div className="px-4 py-2.5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <p className="text-[7px] font-bold uppercase tracking-[0.18em] mb-1.5"
            style={{ color: "rgba(255,255,255,0.18)" }}>
            Changes
          </p>
          <div className="space-y-1">
            {changes.map((line, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-[8px] shrink-0 mt-px"
                  style={{ color: "rgba(255,255,255,0.20)" }}>·</span>
                <p className="text-[11px] leading-snug"
                  style={{ color: "rgba(255,255,255,0.58)" }}>
                  {line}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Scorecard row ─────────────────────────────────────────────────────────────

function ScorecardRow({ scorecard }: { scorecard: BriefingScorecard }) {
  const items = [
    { label: "Accel",  count: scorecard.accelerating,   color: "#10B981"              },
    { label: "Strong", count: scorecard.strengthening,  color: "#34D399"              },
    { label: "Emrg",   count: scorecard.emerging,       color: "#A78BFA"              },
    { label: "Cooling",count: scorecard.cooling,        color: "#F59E0B"              },
    { label: "Rev",    count: scorecard.reversing,      color: "#EF4444"              },
    { label: "HC",     count: scorecard.highConviction, color: "rgba(167,139,250,0.80)" },
  ].filter(x => x.count > 0);

  if (items.length === 0) return null;

  return (
    <div className="px-4 py-2 flex items-center flex-wrap gap-x-4 gap-y-1">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="text-[11.5px] font-bold tabular-nums"
            style={{ color: item.color, fontVariantNumeric: "tabular-nums" }}>
            {item.count}
          </span>
          <span className="text-[8px] font-medium"
            style={{ color: "rgba(255,255,255,0.28)" }}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Opportunity row ───────────────────────────────────────────────────────────

function OppRow({ opp }: { opp: BriefingOpportunity }) {
  const { theme } = opp;
  const delta     = theme.momentum_delta ?? 0;
  const abbr      = CONFIDENCE_ABBR[theme.confidence_label ?? ""] ?? "—";
  const momColor  = MOMENTUM_COLOR[theme.momentum_label] ?? "rgba(255,255,255,0.32)";
  const momAbbr   = MOMENTUM_ABBR[theme.momentum_label] ?? "—";

  return (
    <div className="flex items-center gap-1.5 py-[2px]">
      <span className="text-[10.5px] truncate flex-1 min-w-0"
        style={{ color: "rgba(255,255,255,0.72)" }}>
        {theme.name}
      </span>
      <span className="text-[7.5px] font-bold shrink-0 tabular-nums"
        style={{ color: "rgba(255,255,255,0.24)", fontFamily: "monospace" }}>
        {abbr}
      </span>
      <span className="text-[7.5px] font-bold shrink-0 tabular-nums"
        style={{ color: momColor, fontFamily: "monospace", minWidth: 30, textAlign: "right" }}>
        {momAbbr}
      </span>
      <span className="text-[9px] font-bold tabular-nums shrink-0"
        style={{ color: delta >= 0 ? "#10B981" : "#F59E0B", minWidth: 22, textAlign: "right" }}>
        {delta >= 0 ? "+" : ""}{Math.round(delta)}
      </span>
    </div>
  );
}

// ── Risk row ──────────────────────────────────────────────────────────────────

function RiskRow({ risk }: { risk: BriefingRisk }) {
  const { theme } = risk;
  const delta     = theme.momentum_delta ?? 0;
  const momAbbr   = MOMENTUM_ABBR[theme.momentum_label] ?? "—";
  const isActive  = theme.momentum_label === "reversing" || theme.momentum_label === "cooling";

  return (
    <div className="flex items-center gap-1.5 py-[2px]">
      <span className="text-[10.5px] truncate flex-1 min-w-0"
        style={{ color: "rgba(255,255,255,0.72)" }}>
        {theme.name}
      </span>
      <span className="text-[7.5px] font-bold shrink-0"
        style={{
          color:       isActive ? "rgba(239,68,68,0.65)" : "rgba(255,255,255,0.24)",
          fontFamily:  "monospace",
          minWidth:    30,
          textAlign:   "right",
        }}>
        {momAbbr}
      </span>
      <span className="text-[9px] font-bold tabular-nums shrink-0"
        style={{ color: delta < 0 ? "#EF4444" : "rgba(255,255,255,0.32)", minWidth: 22, textAlign: "right" }}>
        {delta >= 0 ? "+" : ""}{Math.round(delta)}
      </span>
    </div>
  );
}

// ── Rotation chip ─────────────────────────────────────────────────────────────

function RotationChip({ sig }: { sig: IndustryRotationSignal }) {
  const arrow = sig.delta > 3 ? "↑" : sig.delta < -3 ? "↓" : "→";
  const color = sig.delta > 3 ? "#10B981" : sig.delta < -3 ? "#EF4444" : "rgba(255,255,255,0.32)";

  return (
    <div className="flex items-center gap-0.5">
      <span className="text-[9.5px] font-medium"
        style={{ color: "rgba(255,255,255,0.52)" }}>
        {sig.industry}
      </span>
      <span className="text-[9px] font-bold" style={{ color }}>
        {arrow}
      </span>
      {Math.abs(sig.delta) >= 3 && (
        <span className="text-[8px] tabular-nums font-bold" style={{ color }}>
          {Math.abs(sig.delta)}
        </span>
      )}
    </div>
  );
}
