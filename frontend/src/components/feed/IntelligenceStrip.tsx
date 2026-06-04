"use client";

import { useMemo } from "react";
import type { ThemeIntelligence } from "@/lib/types";
import type { MarketState } from "@/hooks/useMarketState";
import { useMarketState } from "@/hooks/useMarketState";
import {
  computeScorecard,
  computeOpportunities,
  computeRisks,
  computeIndustryRotation,
  type BriefingScorecard,
  type BriefingOpportunity,
  type BriefingRisk,
  type IndustryRotationSignal,
} from "@/lib/morningBriefingEngine";

// ── Regime colors ─────────────────────────────────────────────────────────────

const REGIME_COLOR: Record<string, string> = {
  "risk-on":  "#52b0c8",
  "risk-off": "#c05858",
  "neutral":  "#8898b8",
};

const REGIME_LABEL: Record<string, string> = {
  "risk-on":  "Risk-On Market",
  "risk-off": "Risk-Off Market",
  "neutral":  "Neutral Market",
};

// ── Derived text helpers ──────────────────────────────────────────────────────

function deriveRegimeSubtitle(ms: MarketState): string {
  const { riskRegime, volRegime, ratesRegime, dollarRegime, trend } = ms;

  if (riskRegime === "risk-on") {
    if (ratesRegime === "rising" && (volRegime === "elevated" || volRegime === "high"))
      return "Risk appetite with rising yield pressure — rotational leadership";
    if (volRegime === "low")
      return "Broad risk appetite, low volatility, favorable conditions";
    if (ratesRegime === "falling")
      return "Improving risk appetite with easing conditions";
    return "Improving risk appetite with selective sector leadership";
  }

  if (riskRegime === "risk-off") {
    if (ratesRegime === "rising")
      return "Defensive rotation with rising rate and credit pressure";
    if (dollarRegime === "strong")
      return "Flight to safety — dollar bid, defensive rotation underway";
    return "Risk-off conditions with defensive positioning across sectors";
  }

  // neutral
  if (volRegime === "elevated" || volRegime === "high")
    return "Elevated volatility suppressing conviction — range-bound conditions";
  if (ratesRegime === "rising")
    return "Yield pressure limiting upside — selective leadership emerging";
  if (trend.riskDirection === "strengthening")
    return "Improving breadth suggests early risk-on transition underway";
  if (trend.riskDirection === "weakening")
    return "Weakening momentum — defensive themes gaining relative strength";
  return "Mixed leadership with selective risk appetite";
}

// ── Session narrative ─────────────────────────────────────────────────────────

function generateSessionNarrative(
  rotation:  IndustryRotationSignal[],
  opps:      BriefingOpportunity[],
  risks:     BriefingRisk[],
  scorecard: BriefingScorecard,
  ms:        MarketState,
): string {
  const regimeWord = ms.riskRegime === "risk-on"  ? "constructive" :
                     ms.riskRegime === "risk-off" ? "defensive"    : "neutral";

  const rotPos = rotation.filter(r => r.delta > 0);
  const rotNeg = rotation.filter(r => r.delta < 0);
  const opp0   = opps[0]?.theme;
  const opp1   = opps[1]?.theme;
  const risk0  = risks[0]?.theme;

  const sentences: string[] = [];

  // S1: top sector + top opportunity
  if (rotPos[0] && opp0) {
    const verb = opp0.momentum_label === "accelerating" ? "accelerated" :
                 opp0.momentum_label === "strengthening" ? "strengthened" :
                 opp0.momentum_label === "emerging"      ? "emerged"      : "advanced";
    sentences.push(
      `${rotPos[0].industry} emerged as the session leader as ${opp0.name} ${verb}.`
    );
  } else if (rotPos[0]) {
    sentences.push(`${rotPos[0].industry} led sector rotation with the strongest signal momentum.`);
  } else if (opp0) {
    sentences.push(`${opp0.name} led intelligence signals this session.`);
  }

  // S2: secondary rotation + secondary opportunity
  if (rotPos[1] && rotPos[2] && opp1) {
    sentences.push(
      `${rotPos[1].industry} participation broadened while ${rotPos[2].industry} strength continued following ${opp1.name}.`
    );
  } else if (rotPos[1] && opp1) {
    sentences.push(`${rotPos[1].industry} breadth improved as ${opp1.name} continued to build.`);
  } else if (rotPos[1]) {
    sentences.push(`${rotPos[1].industry} added to the positive rotation alongside sector broadening.`);
  }

  // S3: weakness + regime conclusion
  const breadthNote = scorecard.accelerating > scorecard.reversing ? "improving breadth" :
                      scorecard.accelerating === scorecard.reversing ? "mixed signals"    : "narrowing conditions";

  if (rotNeg[0]) {
    sentences.push(
      `${rotNeg[0].industry} themes weakened, leaving overall regime conditions ${regimeWord} despite ${breadthNote}.`
    );
  } else if (risk0) {
    sentences.push(
      `${risk0.name} remains the primary risk vector, leaving conditions ${regimeWord} with ${breadthNote}.`
    );
  } else {
    sentences.push(`Overall regime conditions remain ${regimeWord} with ${breadthNote} across tracked themes.`);
  }

  return sentences.join(" ");
}

// ── Main component ────────────────────────────────────────────────────────────

interface IntelligenceStripProps {
  themes: ThemeIntelligence[];
}

export function IntelligenceStrip({ themes }: IntelligenceStripProps) {
  const ms = useMarketState();

  const scorecard = useMemo(() => computeScorecard(themes),        [themes]);
  const opps      = useMemo(() => computeOpportunities(themes),    [themes]);
  const risks     = useMemo(() => computeRisks(themes),            [themes]);
  const rotation  = useMemo(() => computeIndustryRotation(themes), [themes]);

  if (themes.length === 0) return null;

  const regimeColor    = REGIME_COLOR[ms.riskRegime] ?? "#8898b8";
  const regimeLabel    = REGIME_LABEL[ms.riskRegime] ?? "Neutral Market";
  const regimeSubtitle = deriveRegimeSubtitle(ms);
  const narrative      = generateSessionNarrative(rotation, opps, risks, scorecard, ms);

  const rotPos = rotation.filter(r => r.delta > 0).slice(0, 3);
  const rotNeg = rotation.filter(r => r.delta < 0).slice(0, 2);
  const rotationDisplay = [...rotPos, ...rotNeg].slice(0, 5);

  return (
    <div
      className="rounded-xl mb-5 overflow-hidden"
      style={{
        background: "rgba(3,6,15,0.97)",
        border:     "1px solid rgba(255,255,255,0.07)",
        borderLeft: `2px solid ${regimeColor}55`,
      }}
    >

      {/* ── Market Regime — dominant element ──────────────────────────────────── */}
      <div
        className="px-5 pt-3.5 pb-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p
          className="text-[7px] font-bold uppercase tracking-[0.24em] mb-1.5"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          Market Regime
        </p>
        <p
          className="font-bold leading-none mb-1"
          style={{ fontSize: "18px", color: regimeColor, letterSpacing: "-0.01em" }}
        >
          {regimeLabel}
        </p>
        <p
          className="text-[11px] leading-snug"
          style={{ color: "rgba(255,255,255,0.42)" }}
        >
          {regimeSubtitle}
        </p>
      </div>

      {/* ── Rotation Today ───────────────────────────────────────────────────── */}
      {rotationDisplay.length > 0 && (
        <div
          className="px-5 py-2.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.055)" }}
        >
          <p
            className="text-[7px] font-bold uppercase tracking-[0.22em] mb-2"
            style={{ color: "rgba(255,255,255,0.22)" }}
          >
            Rotation Today
          </p>
          <div className="space-y-[3px]">
            {rotationDisplay.map((sig, i) => (
              <RotationRow key={i} sig={sig} />
            ))}
          </div>
        </div>
      )}

      {/* ── Opportunities | Risks ─────────────────────────────────────────────── */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "1fr 1fr",
          borderBottom:        "1px solid rgba(255,255,255,0.055)",
        }}
      >
        <div
          className="px-5 py-2.5"
          style={{ borderRight: "1px solid rgba(255,255,255,0.055)" }}
        >
          <p
            className="text-[7px] font-bold uppercase tracking-[0.22em] mb-2"
            style={{ color: "rgba(16,185,129,0.60)" }}
          >
            Opportunities
          </p>
          <div className="space-y-[5px]">
            {opps.map((opp, i) => <OppRow key={i} opp={opp} />)}
          </div>
        </div>
        <div className="px-5 py-2.5">
          <p
            className="text-[7px] font-bold uppercase tracking-[0.22em] mb-2"
            style={{ color: "rgba(239,68,68,0.60)" }}
          >
            Risks
          </p>
          <div className="space-y-[5px]">
            {risks.map((risk, i) => <RiskRow key={i} risk={risk} />)}
          </div>
        </div>
      </div>

      {/* ── Session narrative ─────────────────────────────────────────────────── */}
      <div className="px-5 py-3">
        <p
          className="text-[11px] leading-relaxed italic"
          style={{ color: "rgba(255,255,255,0.48)" }}
        >
          {narrative}
        </p>
      </div>

    </div>
  );
}

// ── Rotation row ──────────────────────────────────────────────────────────────

function RotationRow({ sig }: { sig: IndustryRotationSignal }) {
  const isPos  = sig.delta > 0;
  const color  = isPos ? "#10B981" : "#EF4444";

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] font-bold w-3 shrink-0"
        style={{ color }}
      >
        {isPos ? "↑" : "↓"}
      </span>
      <span
        className="text-[11.5px] flex-1"
        style={{ color: "rgba(255,255,255,0.75)" }}
      >
        {sig.industry}
      </span>
      <span
        className="text-[10.5px] font-bold tabular-nums shrink-0"
        style={{ color, fontVariantNumeric: "tabular-nums" }}
      >
        {isPos ? "+" : ""}{sig.delta}
      </span>
    </div>
  );
}

// ── Opportunity row ───────────────────────────────────────────────────────────

function OppRow({ opp }: { opp: BriefingOpportunity }) {
  return (
    <div className="flex items-start gap-1.5">
      <span
        className="mt-[3px] shrink-0 rounded-full"
        style={{ width: 4, height: 4, background: "#10B981", opacity: 0.70, flexShrink: 0 }}
      />
      <span
        className="text-[11.5px] leading-snug"
        style={{ color: "rgba(255,255,255,0.82)" }}
      >
        {opp.theme.name}
      </span>
    </div>
  );
}

// ── Risk row ──────────────────────────────────────────────────────────────────

function RiskRow({ risk }: { risk: BriefingRisk }) {
  return (
    <div className="flex items-start gap-1.5">
      <span
        className="mt-[3px] shrink-0 rounded-full"
        style={{ width: 4, height: 4, background: "#EF4444", opacity: 0.70, flexShrink: 0 }}
      />
      <span
        className="text-[11.5px] leading-snug"
        style={{ color: "rgba(255,255,255,0.82)" }}
      >
        {risk.theme.name}
      </span>
    </div>
  );
}
