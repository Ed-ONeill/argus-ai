"use client";

import { useMemo } from "react";
import type { ThemeIntelligence } from "@/lib/types";
import type { MarketState } from "@/hooks/useMarketState";
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
  type MomentumTransition,
  type IndustryRotationSignal,
} from "@/lib/morningBriefingEngine";

// ── Constants ─────────────────────────────────────────────────────────────────

const REGIME_COLOR: Record<string, string> = {
  "risk-on":  "#52b0c8",
  "risk-off": "#c05858",
  "neutral":  "#7888a8",
};

const REGIME_LABEL: Record<string, string> = {
  "risk-on":  "Risk-On",
  "risk-off": "Risk-Off",
  "neutral":  "Neutral",
};

const CONF_ABBR: Record<string, string> = {
  "High Conviction": "HC",
  "Elevated":        "EL",
  "Moderate":        "MO",
  "Developing":      "DE",
  "Speculative":     "SP",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveToneLabel(ms: MarketState): string | null {
  const { riskRegime, ratesRegime, dollarRegime, volRegime } = ms;
  if (riskRegime === "risk-on"  && ratesRegime === "falling") return "Dovish";
  if (riskRegime === "risk-on"  && ratesRegime === "rising")  return "Hawkish";
  if (riskRegime === "risk-off" && ratesRegime === "rising")  return "Hawkish";
  if (riskRegime === "risk-off" && dollarRegime === "strong") return "Dollar Bid";
  if (volRegime === "elevated"  || volRegime === "high")
    return ratesRegime === "rising" ? "Yield Shock" : "Vol Elevated";
  if (ratesRegime === "falling") return "Easing";
  if (dollarRegime === "strong") return "Dollar Bid";
  if (dollarRegime === "weak")   return "Dollar Soft";
  return null;
}

// ── What Changed Today — analyst-observation prose ────────────────────────────

function generateWhatChangedToday(
  themes:     ThemeIntelligence[],
  upgrades:   MomentumTransition[],
  downgrades: MomentumTransition[],
): string[] {
  const updates: string[] = [];
  const seen    = new Set<string>();

  const push = (s: string, key: string) => {
    if (!seen.has(key) && updates.length < 3) { seen.add(key); updates.push(s); }
  };

  // Priority: transition signals read naturally as analyst observations
  for (const tr of [...downgrades, ...upgrades].slice(0, 2)) {
    const ind0 = (tr.theme.related_industries ?? [])[0];
    const name = tr.theme.name;
    const state = tr.label.replace("→ ", "").toLowerCase();
    if (tr.direction === "downgrade" && ind0) {
      push(`${ind0} weakened as ${name} turned ${state}.`, name + "-dn");
    } else if (tr.direction === "upgrade" && ind0) {
      push(`${ind0} gained momentum as ${name} turned ${state}.`, name + "-up");
    } else if (tr.direction === "downgrade") {
      push(`${name} turned ${state} — watch for further deterioration.`, name + "-dn");
    } else {
      push(`${name} turned ${state} — momentum building.`, name + "-up");
    }
  }

  // Theme-level observations
  for (const t of themes) {
    if (updates.length >= 3) break;
    const delta = t.momentum_delta ?? 0;
    const inds  = t.related_industries ?? [];
    const ind0  = inds[0];
    const ind1  = inds[1];
    const name  = t.name;

    if (t.momentum_label === "accelerating" && delta >= 10 && ind0)
      push(`${ind0} gained leadership as ${name} accelerated.`, name);
    else if (t.cross_category_confirmed && (t.breadth_score ?? 0) >= 65 && ind0)
      push(`${ind1 ? `${ind0} and ${ind1}` : ind0} breadth improved on ${name} cross-sector confirmation.`, name);
    else if (t.momentum_label === "reversing" && ind0)
      push(`${ind0} weakened as ${name} entered reversal territory.`, name);
    else if (delta <= -12 && ind0)
      push(`${ind0} signals deteriorated on ${name} decline.`, name);
    else if ((t.persistence_cycles ?? 0) >= 8 && ind0)
      push(`${name} held structural signal for ${t.persistence_cycles} cycles — ${ind0} primary exposure.`, name);
    else if ((t.evidence_count ?? 0) >= 8 && delta > 0 && ind0)
      push(`${ind0} sources broadened on ${name} confirmation.`, name);
    else if (t.momentum_label === "cooling" && delta < -5 && ind0)
      push(`${ind0} momentum softened as ${name} cooled.`, name);
    else if (t.momentum_label === "strengthening" && t.signal_strength === "strong" && ind0)
      push(`${ind0} signal quality improved on ${name} strengthening.`, name);
  }

  // Backfill
  if (updates.length < 2) {
    for (const t of themes) {
      if (updates.length >= 3) break;
      const ind0    = (t.related_industries ?? [])[0];
      const stories = t.contributing_story_count ?? 0;
      if (stories >= 4 && ind0)
        push(`${t.name} drawing ${stories} sources across ${ind0}.`, t.name + "-bf");
    }
  }

  return updates;
}

// ── Main component ────────────────────────────────────────────────────────────

interface IntelligenceStripProps {
  themes: ThemeIntelligence[];
}

export function IntelligenceStrip({ themes }: IntelligenceStripProps) {
  const ms = useMarketState();

  const scorecard   = useMemo(() => computeScorecard(themes),        [themes]);
  const opps        = useMemo(() => computeOpportunities(themes),    [themes]);
  const risks       = useMemo(() => computeRisks(themes),            [themes]);
  const rotation    = useMemo(() => computeIndustryRotation(themes), [themes]);
  const transitions = useMemo(() => detectTransitions(themes),       [themes]);

  const upgrades   = transitions.filter(t => t.direction === "upgrade");
  const downgrades = transitions.filter(t => t.direction === "downgrade");
  const changes    = useMemo(
    () => generateWhatChangedToday(themes, upgrades, downgrades),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themes, transitions],
  );

  if (themes.length === 0) return null;

  const regimeColor = REGIME_COLOR[ms.riskRegime] ?? "#7888a8";
  const regimeLabel = REGIME_LABEL[ms.riskRegime] ?? "Neutral";
  const toneLabel   = deriveToneLabel(ms);

  const scorecardChips = [
    { label: "Accel",  count: scorecard.accelerating,   color: "#10B981" },
    { label: "Strng",  count: scorecard.strengthening,  color: "#34D399" },
    { label: "Emrg",   count: scorecard.emerging,       color: "#A78BFA" },
    { label: "Cool",   count: scorecard.cooling,        color: "#F59E0B" },
    { label: "Rev",    count: scorecard.reversing,      color: "#EF4444" },
    { label: "HC",     count: scorecard.highConviction, color: "rgba(167,139,250,0.90)" },
  ].filter(x => x.count > 0);

  // Top rotation: 2-3 positive, 1-2 negative, max 4 total
  const rotationPos = rotation.filter(r => r.delta > 0).slice(0, 3);
  const rotationNeg = rotation.filter(r => r.delta < 0).slice(0, 2);
  const rotationDisplay = [...rotationPos, ...rotationNeg].slice(0, 4);

  return (
    <div
      className="rounded-xl mb-5 overflow-hidden"
      style={{
        background: "rgba(3,6,15,0.96)",
        border:     "1px solid rgba(255,255,255,0.07)",
        borderLeft: `2px solid ${regimeColor}50`,
      }}
    >

      {/* ── Market Regime header ─────────────────────────────────────────────── */}
      <div
        className="px-4 pt-2.5 pb-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.055)" }}
      >
        {/* Row 1: label + theme count */}
        <div className="flex items-center justify-between mb-1">
          <span
            className="text-[7px] font-bold uppercase tracking-[0.22em]"
            style={{ color: "rgba(255,255,255,0.22)" }}
          >
            Market Regime
          </span>
          <span className="text-[8px] tabular-nums" style={{ color: "rgba(255,255,255,0.18)" }}>
            {scorecard.total} themes
          </span>
        </div>
        {/* Row 2: regime value + scorecard chips */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div
              className="w-2 h-2 rounded-full shrink-0 animate-pulse"
              style={{ background: regimeColor }}
            />
            <span
              className="text-[13px] font-bold leading-none"
              style={{ color: regimeColor }}
            >
              {regimeLabel}
            </span>
            {toneLabel && (
              <>
                <span style={{ color: "rgba(255,255,255,0.20)", fontSize: 11 }}>·</span>
                <span
                  className="text-[11px] font-medium leading-none"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                >
                  {toneLabel}
                </span>
              </>
            )}
          </div>
          {scorecardChips.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap justify-end">
              {scorecardChips.map((c, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span
                    className="text-[11px] font-bold tabular-nums leading-none"
                    style={{ color: c.color }}
                  >
                    {c.count}
                  </span>
                  <span
                    className="text-[7.5px]"
                    style={{ color: "rgba(255,255,255,0.26)" }}
                  >
                    {c.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Industry Rotation ─────────────────────────────────────────────────── */}
      {rotationDisplay.length > 0 && (
        <div
          className="px-4 py-2"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <p
            className="text-[7px] font-bold uppercase tracking-[0.18em] mb-1.5"
            style={{ color: "rgba(255,255,255,0.20)" }}
          >
            Rotation
          </p>
          {rotationDisplay.map((sig, i) => (
            <RotationRow key={i} sig={sig} />
          ))}
        </div>
      )}

      {/* ── Opportunities | Risks ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <div
          className="px-4 py-2.5"
          style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}
        >
          <p
            className="text-[7px] font-bold uppercase tracking-[0.18em] mb-1.5"
            style={{ color: "rgba(16,185,129,0.55)" }}
          >
            ▲ Opportunities
          </p>
          {opps.map((opp, i) => <OppRow key={i} opp={opp} />)}
        </div>
        <div className="px-4 py-2.5">
          <p
            className="text-[7px] font-bold uppercase tracking-[0.18em] mb-1.5"
            style={{ color: "rgba(239,68,68,0.55)" }}
          >
            ▼ Risks
          </p>
          {risks.map((risk, i) => <RiskRow key={i} risk={risk} />)}
        </div>
      </div>

      {/* ── What Changed Today ────────────────────────────────────────────────── */}
      {changes.length > 0 && (
        <div
          className="px-4 py-2.5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          <p
            className="text-[7px] font-bold uppercase tracking-[0.18em] mb-1.5"
            style={{ color: "rgba(255,255,255,0.20)" }}
          >
            What Changed Today
          </p>
          <div className="space-y-1">
            {changes.map((line, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span
                  className="text-[8px] shrink-0 mt-[2px]"
                  style={{ color: "rgba(255,255,255,0.20)" }}
                >
                  ·
                </span>
                <p
                  className="text-[11px] leading-snug"
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

// ── Rotation row (vertical, distinct positive/negative) ───────────────────────

function RotationRow({ sig }: { sig: IndustryRotationSignal }) {
  const isPos = sig.delta > 0;
  const color = isPos ? "#10B981" : "#EF4444";

  return (
    <div className="flex items-center gap-2 py-[1px]">
      <span className="text-[10px] font-bold w-3 shrink-0 leading-none" style={{ color }}>
        {isPos ? "↑" : "↓"}
      </span>
      <span
        className="text-[11px] flex-1 leading-none"
        style={{ color: "rgba(255,255,255,0.72)" }}
      >
        {sig.industry}
      </span>
      <span
        className="text-[10px] font-bold tabular-nums shrink-0 leading-none"
        style={{ color }}
      >
        {isPos ? "+" : ""}{sig.delta}
      </span>
    </div>
  );
}

// ── Opportunity row ───────────────────────────────────────────────────────────

function OppRow({ opp }: { opp: BriefingOpportunity }) {
  const { theme } = opp;
  const delta  = theme.momentum_delta ?? 0;
  const conf   = Math.max(0, Math.min(100, theme.confidence ?? 0));
  const abbr   = CONF_ABBR[theme.confidence_label ?? ""] ?? "—";
  const dColor = delta >= 0 ? "#10B981" : "#F59E0B";

  return (
    <div className="py-[2px]">
      <div className="flex items-center gap-1.5">
        <span
          className="text-[10.5px] truncate flex-1 min-w-0 leading-none"
          style={{ color: "rgba(255,255,255,0.75)" }}
        >
          {theme.name}
        </span>
        <span
          className="text-[7.5px] font-bold shrink-0"
          style={{ color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}
        >
          {abbr}
        </span>
        {/* Conviction bar */}
        <div
          className="shrink-0 rounded-full overflow-hidden"
          style={{ width: 34, height: 3, background: "rgba(255,255,255,0.06)" }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${conf}%`, background: "#10B981", opacity: 0.40 }}
          />
        </div>
        <span
          className="text-[9px] font-bold tabular-nums shrink-0 leading-none"
          style={{ color: dColor, minWidth: 24, textAlign: "right" }}
        >
          {delta >= 0 ? "+" : ""}{Math.round(delta)}
        </span>
      </div>
    </div>
  );
}

// ── Risk row ──────────────────────────────────────────────────────────────────

function RiskRow({ risk }: { risk: BriefingRisk }) {
  const { theme } = risk;
  const delta    = theme.momentum_delta ?? 0;
  const conf     = Math.max(0, Math.min(100, theme.confidence ?? 0));
  const isActive = theme.momentum_label === "reversing" || theme.momentum_label === "cooling";
  const abbr     = theme.momentum_label === "reversing" ? "REV"
                 : theme.momentum_label === "cooling"   ? "COOL"
                 : theme.momentum_label === "stable"    ? "STBL" : "—";

  return (
    <div className="py-[2px]">
      <div className="flex items-center gap-1.5">
        <span
          className="text-[10.5px] truncate flex-1 min-w-0 leading-none"
          style={{ color: "rgba(255,255,255,0.75)" }}
        >
          {theme.name}
        </span>
        <span
          className="text-[7.5px] font-bold shrink-0"
          style={{
            color:      isActive ? "rgba(239,68,68,0.65)" : "rgba(255,255,255,0.25)",
            fontFamily: "monospace",
          }}
        >
          {abbr}
        </span>
        {/* Severity bar (inverted: lower confidence = more fill) */}
        <div
          className="shrink-0 rounded-full overflow-hidden"
          style={{ width: 34, height: 3, background: "rgba(255,255,255,0.06)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width:      `${100 - conf}%`,
              background: "#EF4444",
              opacity:    0.40,
            }}
          />
        </div>
        <span
          className="text-[9px] font-bold tabular-nums shrink-0 leading-none"
          style={{
            color:    delta < 0 ? "#EF4444" : "rgba(255,255,255,0.30)",
            minWidth: 24,
            textAlign: "right",
          }}
        >
          {delta >= 0 ? "+" : ""}{Math.round(delta)}
        </span>
      </div>
    </div>
  );
}
