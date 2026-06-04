"use client";

import { useMemo } from "react";
import type { ThemeIntelligence } from "@/lib/types";
import {
  computeScorecard,
  computeOpportunities,
  computeRisks,
  detectTransitions,
  type BriefingScorecard,
  type BriefingOpportunity,
  type BriefingRisk,
  type MomentumTransition,
} from "@/lib/morningBriefingEngine";

// ── Change sentence generation (deterministic, no API) ────────────────────────

function generateThemeChanges(themes: ThemeIntelligence[]): string[] {
  const updates: string[] = [];

  for (const t of themes) {
    if (updates.length >= 6) break;

    const name  = t.name;
    const delta = t.momentum_delta   ?? 0;
    const inds  = t.related_industries ?? [];
    const ind0  = inds[0] ?? null;
    const ind1  = inds[1] ?? null;

    if (t.momentum_label === "accelerating" && delta >= 10) {
      const note = ind0 ? ` — ${ind0} leading` : "";
      updates.push(`${name} accelerated${note}`);
    } else if (t.cross_category_confirmed && (t.breadth_score ?? 0) >= 65 && ind0 && ind1) {
      updates.push(`${name} broadened into ${ind0} and ${ind1}`);
    } else if (t.cross_category_confirmed && ind0) {
      updates.push(`${name} confirmed cross-sector into ${ind0}`);
    } else if (t.momentum_label === "reversing" || delta <= -12) {
      updates.push(`${name} reversal — signal delta ${Math.round(delta)}`);
    } else if ((t.persistence_cycles ?? 0) >= 8) {
      updates.push(`${name} reached ${t.persistence_cycles}-cycle persistence`);
    } else if ((t.evidence_count ?? 0) >= 8 && delta > 0) {
      updates.push(`${name} added ${t.evidence_count} confirming sources`);
    } else if ((t.breadth_score ?? 0) < 25 && delta < -5 && ind0) {
      updates.push(`${name} narrowing — concentration to ${ind0}`);
    } else if (t.momentum_label === "strengthening" && t.signal_strength === "strong" && delta > 5) {
      updates.push(`${name} strengthening — elevated signal quality`);
    }
  }

  // Backfill if few high-signal events
  if (updates.length < 3) {
    for (const t of themes) {
      if (updates.length >= 5) break;
      const stories = t.contributing_story_count ?? 0;
      const ind0    = (t.related_industries ?? [])[0] ?? null;
      if (stories >= 5 && ind0) {
        updates.push(`${t.name} — ${stories} active sources across ${ind0}`);
      }
    }
  }

  return updates.slice(0, 6);
}

// ── Label helpers ─────────────────────────────────────────────────────────────

const CONFIDENCE_ABBR: Record<string, string> = {
  "High Conviction": "HC",
  "Elevated":        "EL",
  "Moderate":        "MO",
  "Developing":      "DE",
  "Speculative":     "SP",
};

const MOMENTUM_COLORS: Record<string, string> = {
  accelerating:  "#10B981",
  strengthening: "#34D399",
  stable:        "rgba(255,255,255,0.30)",
  cooling:       "#F59E0B",
  reversing:     "#EF4444",
  emerging:      "#A78BFA",
};

function confAbbr(label: string | undefined): string {
  if (!label) return "—";
  return CONFIDENCE_ABBR[label] ?? label.slice(0, 2).toUpperCase();
}

function momentumColor(label: string): string {
  return MOMENTUM_COLORS[label] ?? "rgba(255,255,255,0.30)";
}

// ── Main component ────────────────────────────────────────────────────────────

interface IntelligenceStripProps {
  themes: ThemeIntelligence[];
}

export function IntelligenceStrip({ themes }: IntelligenceStripProps) {
  if (themes.length === 0) return null;

  const scorecard     = useMemo(() => computeScorecard(themes),     [themes]);
  const opportunities = useMemo(() => computeOpportunities(themes), [themes]);
  const risks         = useMemo(() => computeRisks(themes),         [themes]);
  const transitions   = useMemo(() => detectTransitions(themes),    [themes]);
  const changes       = useMemo(() => generateThemeChanges(themes), [themes]);

  const upgrades   = transitions.filter(t => t.direction === "upgrade");
  const downgrades = transitions.filter(t => t.direction === "downgrade");

  const hasOppsOrRisks = opportunities.length > 0 || risks.length > 0;
  if (!hasOppsOrRisks && changes.length === 0) return null;

  return (
    <div
      className="rounded-xl mb-5 overflow-hidden"
      style={{
        background: "rgba(4,8,18,0.90)",
        border:     "1px solid rgba(255,255,255,0.07)",
      }}
    >

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
            style={{ background: "#52b0c8" }}
          />
          <span
            className="text-[8.5px] font-bold uppercase tracking-[0.20em]"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Morning Briefing
          </span>
        </div>
        <span
          className="text-[8px] tabular-nums"
          style={{ color: "rgba(255,255,255,0.18)" }}
        >
          {scorecard.total} themes
        </span>
      </div>

      {/* ── Scorecard ──────────────────────────────────────────────────────── */}
      <ScorecardRow scorecard={scorecard} />

      {/* ── Opportunities + Risks ───────────────────────────────────────────── */}
      {hasOppsOrRisks && (
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1fr",
            borderTop:           "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div
            className="px-4 py-3"
            style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}
          >
            <p
              className="text-[7.5px] font-bold uppercase tracking-[0.18em] mb-2"
              style={{ color: "rgba(16,185,129,0.55)" }}
            >
              ▲ Opportunities
            </p>
            {opportunities.length > 0
              ? opportunities.map((opp, i) => <OpportunityRow key={i} opp={opp} />)
              : <p className="text-[10.5px]" style={{ color: "rgba(255,255,255,0.18)" }}>None identified</p>
            }
          </div>
          <div className="px-4 py-3">
            <p
              className="text-[7.5px] font-bold uppercase tracking-[0.18em] mb-2"
              style={{ color: "rgba(239,68,68,0.55)" }}
            >
              ▼ Risks
            </p>
            {risks.length > 0
              ? risks.map((risk, i) => <RiskRow key={i} risk={risk} />)
              : <p className="text-[10.5px]" style={{ color: "rgba(255,255,255,0.18)" }}>No active risks</p>
            }
          </div>
        </div>
      )}

      {/* ── Transition engine ──────────────────────────────────────────────── */}
      {(upgrades.length > 0 || downgrades.length > 0) && (
        <div
          className="px-4 py-2.5 space-y-1.5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          {upgrades.length > 0 && (
            <TransitionLine
              label="↑ Upgrades"
              labelColor="rgba(16,185,129,0.70)"
              items={upgrades}
              signalColor="#10B981"
            />
          )}
          {downgrades.length > 0 && (
            <TransitionLine
              label="↓ Downgrades"
              labelColor="rgba(239,68,68,0.70)"
              items={downgrades}
              signalColor="#EF4444"
            />
          )}
        </div>
      )}

      {/* ── Change feed ────────────────────────────────────────────────────── */}
      {changes.length > 0 && (
        <div
          className="px-4 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          <p
            className="text-[7.5px] font-bold uppercase tracking-[0.18em] mb-2"
            style={{ color: "rgba(255,255,255,0.20)" }}
          >
            Changes
          </p>
          <div className="space-y-1.5">
            {changes.map((line, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  className="text-[8px] shrink-0 mt-px"
                  style={{ color: "rgba(255,255,255,0.22)" }}
                >
                  ·
                </span>
                <p
                  className="text-[11.5px] leading-snug"
                  style={{ color: "rgba(255,255,255,0.60)" }}
                >
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
    { label: "Accelerating",  count: scorecard.accelerating,   color: "#10B981"              },
    { label: "Strengthening", count: scorecard.strengthening,  color: "#34D399"              },
    { label: "Cooling",       count: scorecard.cooling,        color: "#F59E0B"              },
    { label: "Reversing",     count: scorecard.reversing,      color: "#EF4444"              },
    { label: "Emerging",      count: scorecard.emerging,       color: "#A78BFA"              },
    { label: "High Conv",     count: scorecard.highConviction, color: "rgba(167,139,250,0.85)" },
  ].filter(x => x.count > 0);

  if (items.length === 0) return null;

  return (
    <div className="px-4 py-2.5 flex items-center flex-wrap gap-x-5 gap-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span
            className="text-[12px] font-bold tabular-nums"
            style={{ color: item.color }}
          >
            {item.count}
          </span>
          <span
            className="text-[8.5px]"
            style={{ color: "rgba(255,255,255,0.30)" }}
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Opportunity row ───────────────────────────────────────────────────────────

function OpportunityRow({ opp }: { opp: BriefingOpportunity }) {
  const { theme } = opp;
  const delta     = theme.momentum_delta ?? 0;

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="text-[10.5px] truncate flex-1 min-w-0"
        style={{ color: "rgba(255,255,255,0.72)" }}
      >
        {theme.name}
      </span>
      <span
        className="text-[8px] font-bold shrink-0"
        style={{ color: "rgba(255,255,255,0.26)", fontFamily: "monospace" }}
      >
        {confAbbr(theme.confidence_label)}
      </span>
      <span
        className="text-[9px] font-bold tabular-nums shrink-0"
        style={{ color: momentumColor(theme.momentum_label), minWidth: 26, textAlign: "right" }}
      >
        +{Math.round(delta)}
      </span>
    </div>
  );
}

// ── Risk row ──────────────────────────────────────────────────────────────────

function RiskRow({ risk }: { risk: BriefingRisk }) {
  const { theme } = risk;
  const delta     = theme.momentum_delta ?? 0;

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="text-[10.5px] truncate flex-1 min-w-0"
        style={{ color: "rgba(255,255,255,0.72)" }}
      >
        {theme.name}
      </span>
      <span
        className="text-[8px] font-bold shrink-0 uppercase tracking-wide"
        style={{ color: "rgba(239,68,68,0.55)", fontFamily: "monospace" }}
      >
        {theme.momentum_label === "reversing" ? "REV" : "COOL"}
      </span>
      <span
        className="text-[9px] font-bold tabular-nums shrink-0"
        style={{ color: "#EF4444", minWidth: 26, textAlign: "right" }}
      >
        {Math.round(delta)}
      </span>
    </div>
  );
}

// ── Transition line ───────────────────────────────────────────────────────────

function TransitionLine({
  label, labelColor, items, signalColor,
}: {
  label:       string;
  labelColor:  string;
  items:       MomentumTransition[];
  signalColor: string;
}) {
  return (
    <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
      <span
        className="text-[7.5px] font-bold uppercase tracking-[0.14em] shrink-0"
        style={{ color: labelColor }}
      >
        {label}
      </span>
      {items.map((item, i) => (
        <span key={i} className="text-[10.5px]">
          <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>
            {item.theme.name}
          </span>
          {" "}
          <span style={{ color: signalColor, opacity: 0.75 }}>
            {item.label}
          </span>
        </span>
      ))}
    </div>
  );
}
