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
  computeSignalBalance,
  computeTodaysChanges,
  computeConvictionTier,
  type BriefingScorecard,
  type BriefingOpportunity,
  type BriefingRisk,
  type IndustryRotationSignal,
  type SignalBalance,
  type TodayChange,
} from "@/lib/morningBriefingEngine";

// ── Regime colours ────────────────────────────────────────────────────────────

const REGIME_COLOR: Record<string, string> = {
  "risk-on":  "#52b0c8",
  "risk-off": "#c05858",
  "neutral":  "#8898b8",
};

const REGIME_HEADLINE: Record<string, string> = {
  "risk-on":  "Risk-On Market",
  "risk-off": "Risk-Off Market",
  "neutral":  "Neutral Market",
};

// ── Text utilities ────────────────────────────────────────────────────────────

/** Extract the first complete sentence from a block of text. */
function firstSentence(text: string | undefined | null): string | null {
  if (!text || text.length < 15) return null;
  const idx = text.indexOf(".");
  if (idx > 15) return text.slice(0, idx).trim();
  return text.slice(0, 110).trim();
}

/** True when a string is an internal graph-path chain (e.g. "A → B → C"). */
function isRawChain(text: string): boolean {
  return text.includes(" → ");
}

/**
 * Return the final segment of a chain, or the string unchanged if not a chain.
 * Used to clean theme names that may arrive as "Source → Target".
 */
function chainTerminal(name: string): string {
  if (!isRawChain(name)) return name;
  return name.split(" → ").pop()!.trim();
}

/**
 * Extract the first natural-language sentence from causal_narrative.
 * Returns null if the narrative is a raw graph chain rather than prose.
 */
function causalSentence(text: string | undefined | null): string | null {
  const s = firstSentence(text);
  if (!s || isRawChain(s)) return null;
  return s;
}

// ── Narrative generators ──────────────────────────────────────────────────────

/**
 * 2-3 sentence strategist summary.
 * S1: what is leading and why (positive dynamic).
 * S2: the primary headwind or counterforce.
 * S3: breadth / conviction meta-assessment.
 */
function deriveRegimeNarrative(
  ms:        MarketState,
  rotation:  IndustryRotationSignal[],
  opps:      BriefingOpportunity[],
  risks:     BriefingRisk[],
  scorecard: BriefingScorecard,
): string {
  const { riskRegime, ratesRegime, volRegime, dollarRegime } = ms;
  const topOpp    = opps[0]?.theme;
  const topRisk   = risks[0]?.theme;
  const topInd    = rotation.filter(r => r.delta > 0)[0];
  const riskInd   = (topRisk?.related_industries ?? [])[0];
  const sentences: string[] = [];

  // ── S1: Positive dynamic ──────────────────────────────────────────────────
  if (topOpp && topInd) {
    const ind  = topInd.industry;
    const verb =
      topOpp.momentum_label === "accelerating"  ? "continue to strengthen" :
      topOpp.momentum_label === "strengthening" ? "are gaining momentum"   : "maintain positive momentum";

    // Prefer causal_narrative first sentence as the mechanism (skip raw chains)
    const mechanism = causalSentence(topOpp.causal_narrative);
    if (mechanism && mechanism.length > 20) {
      sentences.push(`${ind} ${verb} as ${mechanism.charAt(0).toLowerCase()}${mechanism.slice(1)}.`);
    } else {
      const ind0 = (topOpp.related_industries ?? [])[0] ?? ind;
      const ctx  =
        topOpp.momentum_label === "accelerating"
          ? "expanding activity and improving earnings visibility"
          : topOpp.cross_category_confirmed
          ? "cross-sector confirmation that signals structural breadth"
          : "strengthening signal quality across tracked cycles";
      sentences.push(`${ind0} ${verb} through ${ctx}.`);
    }
  } else if (riskRegime === "risk-on") {
    sentences.push("Broad risk appetite is supporting participation across multiple sectors.");
  } else {
    sentences.push("Mixed conditions are producing selective leadership across tracked themes.");
  }

  // ── S2: Headwind / counterforce ───────────────────────────────────────────
  if (ratesRegime === "rising" && riskRegime !== "risk-on") {
    sentences.push(
      "However, elevated yields remain a headwind for long-duration growth assets, keeping overall conditions neutral."
    );
  } else if (volRegime === "elevated" || volRegime === "high") {
    sentences.push(
      "However, elevated volatility is suppressing conviction and limiting the breadth of participation."
    );
  } else if (topRisk && riskInd) {
    const deterioVerb =
      topRisk.momentum_label === "reversing" ? "enters reversal" : "shows signs of deterioration";
    sentences.push(
      `However, ${riskInd} faces increasing risk as ${chainTerminal(topRisk.name)} ${deterioVerb}, creating headwinds for that positioning.`
    );
  } else if (dollarRegime === "strong" && riskRegime !== "risk-on") {
    sentences.push(
      "Dollar strength is creating headwinds for international exposure and commodity-linked assets."
    );
  }

  // ── S3: Breadth / conviction meta-assessment ──────────────────────────────
  const net = scorecard.accelerating - scorecard.reversing;
  if (net >= 4 && scorecard.highConviction >= 3) {
    sentences.push(
      "Leadership is broadening with elevated conviction — signal quality favors continued participation."
    );
  } else if (net >= 2) {
    sentences.push(
      "Leadership is broadening, but conviction remains concentrated in a handful of themes."
    );
  } else if (net <= -2) {
    sentences.push(
      "Deteriorating signals are outpacing new leadership — selective positioning is warranted."
    );
  } else {
    sentences.push(
      "Signal dispersion remains high, favoring active monitoring over broad positioning."
    );
  }

  return sentences.join(" ");
}

/**
 * Sector-focused explanation for opportunity cards.
 * Prioritises causal_narrative, falls back to template.
 */
function deriveOpportunityExplanation(theme: ThemeIntelligence): string {
  const causal = causalSentence(theme.causal_narrative);
  if (causal && causal.length > 20) return causal;

  const ind0     = (theme.related_industries ?? [])[0] ?? "the sector";
  const eff0     = (theme.second_order_effects ?? [])[0];
  const safeName = chainTerminal(theme.name).toLowerCase();

  if (theme.momentum_label === "accelerating")
    return `Accelerating ${safeName} dynamics are improving earnings visibility and positioning in ${ind0}.`;
  if (theme.cross_category_confirmed)
    return `Cross-sector confirmation signals structural breadth — ${ind0} is the primary beneficiary.`;
  if (theme.momentum_label === "strengthening")
    return `Strengthening signal quality across ${theme.persistence_cycles} cycles supports continued positioning in ${ind0}.`;
  return eff0 ?? `${ind0} is benefiting from improving ${safeName} momentum.`;
}

/**
 * Sector-focused explanation for risk cards.
 * Prioritises causal_narrative, falls back to template.
 */
function deriveRiskExplanation(theme: ThemeIntelligence): string {
  const causal = causalSentence(theme.causal_narrative);
  if (causal && causal.length > 20) return causal;

  const ind0     = (theme.related_industries ?? [])[0] ?? "the sector";
  const eff0     = (theme.second_order_effects ?? [])[0];
  const safeName = chainTerminal(theme.name);

  if (theme.momentum_label === "reversing")
    return `${ind0} positioning faces multiple compression risk as signal quality degrades rapidly.`;
  if (theme.momentum_label === "cooling")
    return `${ind0} momentum is fading — delta at ${Math.round(theme.momentum_delta ?? 0)}, with risk of further deterioration.`;
  return eff0 ?? `${ind0} is facing headwinds as ${safeName} weakens.`;
}

/**
 * Single sell-side strategist sentence.
 * Uses industry as the subject — not the theme name.
 */
function deriveOneSentence(
  rotation:  IndustryRotationSignal[],
  opps:      BriefingOpportunity[],
  risks:     BriefingRisk[],
  ms:        MarketState,
  scorecard: BriefingScorecard,
): string {
  const { ratesRegime, volRegime, riskRegime } = ms;
  const topRot  = rotation.filter(r => r.delta > 0)[0];
  const topOpp  = opps[0]?.theme;
  const topRisk = risks[0]?.theme;
  const ind0    = topRot?.industry ?? (topOpp?.related_industries ?? [])[0];

  let sentence: string;

  if (ind0 && topOpp) {
    const leaderVerb = scorecard.accelerating >= 3 ? "are assuming leadership" : "are gaining momentum";
    // Use first clause of causal_narrative as the mechanism (skip raw chains), fallback to theme name
    const causal      = causalSentence(topOpp.causal_narrative);
    const oppSafeName = chainTerminal(topOpp.name);
    const mechStr     = causal
      ? causal.charAt(0).toLowerCase() + causal.slice(1)
      : `${oppSafeName} ${topOpp.momentum_label === "accelerating" ? "accelerates" : "advances"}`;
    sentence = `${ind0} ${leaderVerb} as ${mechStr}`;
  } else if (topOpp) {
    const verb        = topOpp.momentum_label === "accelerating" ? "accelerates" : "advances";
    const oppSafeName = chainTerminal(topOpp.name);
    sentence   = `${oppSafeName} ${verb} as the dominant intelligence signal`;
  } else {
    sentence = "Markets are showing selective leadership across tracked themes";
  }

  // Counterforce clause
  if (ratesRegime === "rising" && riskRegime !== "risk-on") {
    sentence += ", while elevated yields continue to suppress long-duration growth assets";
  } else if (volRegime === "elevated" || volRegime === "high") {
    sentence += ", while elevated volatility limits the breadth of participation";
  } else if (topRisk) {
    const riskInd      = (topRisk.related_industries ?? [])[0];
    const riskSafeName = chainTerminal(topRisk.name);
    sentence += riskInd
      ? `, while ${riskInd} faces headwinds as ${riskSafeName} weakens`
      : `, while ${riskSafeName} presents the primary downside risk`;
  } else if (riskRegime === "risk-on") {
    sentence += " amid broadly constructive market conditions";
  } else {
    sentence += " amid mixed conditions and selective sector participation";
  }

  return sentence + ".";
}

// ── Main component ────────────────────────────────────────────────────────────

interface IntelligenceStripProps {
  themes: ThemeIntelligence[];
}

export function IntelligenceStrip({ themes }: IntelligenceStripProps) {
  const ms = useMarketState();

  const scorecard  = useMemo(() => computeScorecard(themes),        [themes]);
  const opps       = useMemo(() => computeOpportunities(themes, 2), [themes]);
  const risks      = useMemo(() => computeRisks(themes, 2),         [themes]);
  const rotation   = useMemo(() => computeIndustryRotation(themes), [themes]);
  const balance    = useMemo(() => computeSignalBalance(themes, scorecard), [themes, scorecard]);
  const changes    = useMemo(() => computeTodaysChanges(themes, rotation), [themes, rotation]);
  const conviction = useMemo(() => computeConvictionTier(themes, scorecard, balance), [themes, scorecard, balance]);

  if (themes.length === 0) return null;

  const regimeColor    = REGIME_COLOR[ms.riskRegime]    ?? "#8898b8";
  const regimeHeadline = REGIME_HEADLINE[ms.riskRegime] ?? "Neutral Market";
  const narrative      = deriveRegimeNarrative(ms, rotation, opps, risks, scorecard);
  const oneSentence    = deriveOneSentence(rotation, opps, risks, ms, scorecard);

  const leaders  = rotation.filter(r => r.delta > 0).slice(0, 3);
  const laggards = rotation.filter(r => r.delta < 0).slice(0, 3);

  const changesUp   = changes.filter(c => c.direction === "up");
  const changesDown = changes.filter(c => c.direction === "down");

  const DIV = { borderTop: "1px solid rgba(255,255,255,0.06)" };

  return (
    <div
      className="rounded-xl mb-5 overflow-hidden"
      style={{
        background: "rgba(2,5,14,0.98)",
        border:     "1px solid rgba(255,255,255,0.08)",
        borderLeft: `2px solid ${regimeColor}66`,
      }}
    >

      {/* ══ SECTION 1 — Market Regime (hero) ══════════════════════════════════ */}
      <div className="px-5 pt-4 pb-3.5" style={DIV}>

        {/* Label row */}
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-[7px] font-bold uppercase tracking-[0.28em]"
            style={{ color: "rgba(255,255,255,0.28)" }}
          >
            Market Regime
          </span>
          <span
            className="text-[9px] font-semibold"
            style={{ color: "rgba(255,255,255,0.30)" }}
          >
            {conviction}
          </span>
        </div>

        {/* Regime headline — the dominant element */}
        <p
          className="font-black leading-none tracking-tight mb-2"
          style={{ fontSize: "22px", color: regimeColor, letterSpacing: "-0.02em" }}
        >
          {regimeHeadline.toUpperCase()}
        </p>

        {/* 2-3 sentence strategist narrative */}
        <p
          className="text-[12px] leading-relaxed mb-3"
          style={{ color: "rgba(255,255,255,0.60)", maxWidth: "640px" }}
        >
          {narrative}
        </p>

        {/* Signal balance */}
        <div
          className="flex items-center gap-5"
          style={{ paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div>
            <span
              className="text-[7px] font-bold uppercase tracking-[0.18em] block mb-0.5"
              style={{ color: "rgba(255,255,255,0.22)" }}
            >
              Signal Balance
            </span>
            <div className="flex items-center gap-4">
              <SignalStat label="Bullish" count={balance.bullish} color="#10B981" />
              <SignalStat label="Bearish" count={balance.bearish} color="#EF4444" />
              <div className="h-3 w-px shrink-0" style={{ background: "rgba(255,255,255,0.10)" }} />
              <div className="flex items-center gap-1">
                <span
                  className="text-[11px] font-bold tabular-nums"
                  style={{ color: balance.netSignal > 0 ? "#10B981" : balance.netSignal < 0 ? "#EF4444" : "rgba(255,255,255,0.40)" }}
                >
                  {balance.netSignal > 0 ? "+" : ""}{balance.netSignal}
                </span>
                <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.28)" }}>Net</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ══ SECTION 2 — What Changed Today ════════════════════════════════════ */}
      {(changesUp.length > 0 || changesDown.length > 0) && (
        <div className="px-5 py-3" style={DIV}>
          <p
            className="text-[7px] font-bold uppercase tracking-[0.28em] mb-2"
            style={{ color: "rgba(255,255,255,0.26)" }}
          >
            Today's Changes
          </p>
          <div className="space-y-[3px]">
            {changesUp.map((c, i) => <ChangeRow key={i} change={c} />)}
          </div>
          {changesUp.length > 0 && changesDown.length > 0 && (
            <div className="my-2" />
          )}
          <div className="space-y-[3px]">
            {changesDown.map((c, i) => <ChangeRow key={i} change={c} />)}
          </div>
        </div>
      )}

      {/* ══ SECTION 3 — Opportunities vs Risks ════════════════════════════════ */}
      <div style={{ ...DIV, display: "grid", gridTemplateColumns: "1fr 1fr" }}>

        {/* Opportunities */}
        <div className="px-5 py-3" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <p
            className="text-[7px] font-bold uppercase tracking-[0.28em] mb-2.5"
            style={{ color: "rgba(16,185,129,0.65)" }}
          >
            Opportunity
          </p>
          <div className="space-y-3">
            {opps.map((opp, i) => (
              <ThemeEntry key={i} theme={opp.theme} isOpp={true} />
            ))}
          </div>
        </div>

        {/* Risks */}
        <div className="px-5 py-3">
          <p
            className="text-[7px] font-bold uppercase tracking-[0.28em] mb-2.5"
            style={{ color: "rgba(239,68,68,0.65)" }}
          >
            Risk
          </p>
          <div className="space-y-3">
            {risks.map((risk, i) => (
              <ThemeEntry key={i} theme={risk.theme} isOpp={false} />
            ))}
          </div>
        </div>

      </div>

      {/* ══ SECTION 4 — Rotation Dashboard ═══════════════════════════════════ */}
      {(leaders.length > 0 || laggards.length > 0) && (
        <div style={{ ...DIV, display: "grid", gridTemplateColumns: "1fr 1fr" }}>

          {/* Leaders */}
          <div className="px-5 py-3" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            <p
              className="text-[7px] font-bold uppercase tracking-[0.28em] mb-2"
              style={{ color: "rgba(16,185,129,0.50)" }}
            >
              Leaders
            </p>
            <div className="space-y-[4px]">
              {leaders.map((sig, i) => <RotationRow key={i} sig={sig} />)}
            </div>
          </div>

          {/* Laggards */}
          <div className="px-5 py-3">
            <p
              className="text-[7px] font-bold uppercase tracking-[0.28em] mb-2"
              style={{ color: "rgba(239,68,68,0.50)" }}
            >
              Laggards
            </p>
            <div className="space-y-[4px]">
              {laggards.map((sig, i) => <RotationRow key={i} sig={sig} />)}
              {laggards.length === 0 && (
                <p className="text-[10.5px]" style={{ color: "rgba(255,255,255,0.20)" }}>
                  No laggards identified
                </p>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ══ SECTION 5 — Market In One Sentence ════════════════════════════════ */}
      <div className="px-5 py-3" style={DIV}>
        <p
          className="text-[12px] leading-relaxed italic font-medium"
          style={{ color: "rgba(255,255,255,0.52)" }}
        >
          {oneSentence}
        </p>
      </div>

    </div>
  );
}

// ── Signal stat pill ──────────────────────────────────────────────────────────

function SignalStat({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
        {count}
      </span>
      <span className="text-[8.5px]" style={{ color: "rgba(255,255,255,0.30)" }}>
        {label}
      </span>
    </div>
  );
}

// ── Change row ────────────────────────────────────────────────────────────────

function ChangeRow({ change }: { change: TodayChange }) {
  const isUp  = change.direction === "up";
  const color = isUp ? "#10B981" : "#EF4444";

  return (
    <div className="flex items-start gap-2">
      <span className="text-[11px] font-bold shrink-0 leading-snug" style={{ color }}>
        {isUp ? "↑" : "↓"}
      </span>
      <p className="text-[11.5px] leading-snug" style={{ color: "rgba(255,255,255,0.72)" }}>
        {change.text}
      </p>
    </div>
  );
}

// ── Theme entry (opportunity / risk) ─────────────────────────────────────────

function ThemeEntry({ theme, isOpp }: { theme: ThemeIntelligence; isOpp: boolean }) {
  const accentColor  = isOpp ? "#10B981" : "#EF4444";
  // Title: the industry/sector where capital should be positioned (or risk avoided)
  const industryTitle = (theme.related_industries ?? [])[0] ?? chainTerminal(theme.name);
  const explanation   = isOpp
    ? deriveOpportunityExplanation(theme)
    : deriveRiskExplanation(theme);

  return (
    <div>
      {/* Industry / sector — the actionable title */}
      <p
        className="text-[11.5px] font-semibold leading-snug mb-0.5"
        style={{ color: "rgba(255,255,255,0.88)" }}
      >
        {industryTitle}
      </p>
      {/* Why it matters */}
      <p
        className="text-[10.5px] leading-snug mb-1"
        style={{ color: "rgba(255,255,255,0.44)" }}
      >
        {explanation}
      </p>
      {/* Theme metadata */}
      <p
        className="text-[9px]"
        style={{ color: "rgba(255,255,255,0.24)", fontStyle: "normal" }}
      >
        Theme: {chainTerminal(theme.name)}
      </p>
      {/* Confidence accent line */}
      <div
        className="mt-1.5 rounded-full"
        style={{
          height:     "2px",
          width:      `${Math.max(15, Math.min(100, theme.confidence ?? 50))}%`,
          background: accentColor,
          opacity:    0.30,
        }}
      />
    </div>
  );
}

// ── Rotation row ──────────────────────────────────────────────────────────────

function RotationRow({ sig }: { sig: IndustryRotationSignal }) {
  const isPos = sig.delta > 0;
  const color = isPos ? "#10B981" : "#EF4444";

  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className="text-[11.5px] truncate"
        style={{ color: "rgba(255,255,255,0.78)" }}
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
