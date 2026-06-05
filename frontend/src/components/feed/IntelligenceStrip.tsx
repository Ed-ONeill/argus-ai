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
 * S1: highest-conviction bullish theme — uses causal narrative when available.
 * S2: highest-conviction bearish theme (preferred over generic macro signals).
 * S3: breadth / conviction — names real themes, not signal counts.
 */
function deriveRegimeNarrative(
  ms:        MarketState,
  rotation:  IndustryRotationSignal[],
  opps:      BriefingOpportunity[],
  risks:     BriefingRisk[],
  scorecard: BriefingScorecard,
): string {
  const { riskRegime, ratesRegime, volRegime, dollarRegime } = ms;
  const topOpp  = opps[0]?.theme;
  const topRisk = risks[0]?.theme;
  const opp2    = opps[1]?.theme;
  const topInd  = rotation.filter(r => r.delta > 0)[0];
  const sentences: string[] = [];

  const oppName  = topOpp  ? chainTerminal(topOpp.name)  : null;
  const riskName = topRisk ? chainTerminal(topRisk.name) : null;
  const riskInd  = (topRisk?.related_industries ?? [])[0];
  const oppInd   = (topOpp?.related_industries  ?? [])[0] ?? topInd?.industry;

  // ── S1: Lead with the highest-conviction bullish theme ────────────────────
  if (topOpp && oppName) {
    const causal = causalSentence(topOpp.causal_narrative);
    const eff    = (topOpp.second_order_effects ?? []).find(e => e && !isRawChain(e) && e.length > 15);
    const verb   =
      topOpp.momentum_label === "accelerating"  ? "continue to strengthen" :
      topOpp.momentum_label === "strengthening" ? "are gaining momentum"   : "maintain positive momentum";

    if (causal && oppInd) {
      const lc = causal.charAt(0).toLowerCase() + causal.slice(1).replace(/\.$/, "");
      sentences.push(`${oppInd} ${verb} as ${lc}.`);
    } else if (causal) {
      sentences.push(causal.endsWith(".") ? causal : causal + ".");
    } else if (eff && oppInd) {
      const lc = eff.charAt(0).toLowerCase() + eff.slice(1).replace(/\.$/, "");
      sentences.push(`${oppInd} ${verb} as ${lc}.`);
    } else if (oppInd) {
      const ind2 = (topOpp.related_industries ?? [])[1];
      if (ind2 && topOpp.cross_category_confirmed) {
        sentences.push(`${oppInd} and ${ind2} ${verb} as ${oppName} expands across sectors.`);
      } else {
        const opp2Name = opp2 ? chainTerminal(opp2.name) : null;
        sentences.push(opp2Name
          ? `${oppInd} ${verb} as ${oppName} builds — ${opp2Name} provides secondary support.`
          : `${oppInd} ${verb} as ${oppName} continues to build.`);
      }
    } else {
      const vb = topOpp.momentum_label === "accelerating" ? "accelerating" : "strengthening";
      sentences.push(`${oppName} is ${vb} as the dominant market signal.`);
    }
  } else if (topInd) {
    sentences.push(`${topInd.industry} is leading rotation as cross-theme momentum builds.`);
  } else if (riskRegime === "risk-on") {
    sentences.push("Broad risk appetite is supporting participation across multiple sectors.");
  } else {
    sentences.push("Mixed conditions are producing selective leadership across the market.");
  }

  // ── S2: Risk theme first — only fall back to macro signals when none exist ─
  if (topRisk && riskName) {
    // Only use narrative prose when the theme is genuinely deteriorating.
    // Backfill risks (stable/strengthening themes) have positive effects — using
    // them as headwind copy produces semantically incorrect sentences.
    const genuineRisk = topRisk.momentum_label === "reversing"
      || topRisk.momentum_label === "cooling"
      || (topRisk.momentum_delta ?? 0) < 0;
    const riskCausal  = genuineRisk ? causalSentence(topRisk.causal_narrative) : null;
    const riskEff     = genuineRisk
      ? (topRisk.second_order_effects ?? []).find(e => e && !isRawChain(e) && e.length > 15)
      : null;
    const deterioVerb = topRisk.momentum_label === "reversing" ? "enters reversal" : "shows signs of deterioration";

    if (riskCausal && riskInd) {
      const lc = riskCausal.charAt(0).toLowerCase() + riskCausal.slice(1).replace(/\.$/, "");
      sentences.push(`However, ${riskInd} faces headwinds as ${lc}.`);
    } else if (riskCausal) {
      const lc = riskCausal.charAt(0).toLowerCase() + riskCausal.slice(1).replace(/\.$/, "");
      sentences.push(`However, ${lc}, creating headwinds for current positioning.`);
    } else if (riskEff && riskInd) {
      const lc = riskEff.charAt(0).toLowerCase() + riskEff.slice(1).replace(/\.$/, "");
      sentences.push(`However, ${riskInd} faces pressure as ${lc}.`);
    } else if (riskInd) {
      sentences.push(`However, ${riskInd} faces increasing risk as ${riskName} ${deterioVerb}.`);
    } else {
      sentences.push(`However, ${riskName} ${deterioVerb}, creating headwinds for current positioning.`);
    }
  } else if (ratesRegime === "rising" && riskRegime !== "risk-on") {
    sentences.push(
      "However, elevated yields remain a headwind for long-duration growth assets, keeping overall conditions neutral."
    );
  } else if (volRegime === "elevated" || volRegime === "high") {
    sentences.push(
      "However, elevated volatility is suppressing conviction and limiting the breadth of participation."
    );
  } else if (dollarRegime === "strong" && riskRegime !== "risk-on") {
    sentences.push(
      "Dollar strength is creating headwinds for international exposure and commodity-linked assets."
    );
  }

  // ── S3: Reads like commentary, not diagnostics ────────────────────────────
  const net      = scorecard.accelerating - scorecard.reversing;
  const opp2Name = opp2 ? chainTerminal(opp2.name) : null;

  if (net >= 4 && scorecard.highConviction >= 3) {
    sentences.push(oppName && opp2Name
      ? `${oppName} and ${opp2Name} are both accelerating — the advance has breadth and substance.`
      : oppName
      ? `${oppName} leads a broadening rally — conviction is improving across multiple sectors.`
      : "Leadership is broadening with improving conviction across multiple sectors.");
  } else if (net >= 2) {
    sentences.push(oppName
      ? `${oppName} leads, but follow-through is needed — breadth is not yet broad enough to add aggressively.`
      : "Leadership is building, but not yet broad enough to add aggressively.");
  } else if (net <= -2) {
    sentences.push(riskName
      ? `${riskName} deterioration is outpacing new leadership — stay selective, favor quality over breadth.`
      : "Deterioration is outpacing new leadership — favor quality, stay selective.");
  } else {
    sentences.push(oppName && riskName
      ? `${oppName} and ${riskName} are sending conflicting signals — own the leaders, fade the laggards.`
      : oppName
      ? `${oppName} is the clearest signal — lean in while the broader tape consolidates.`
      : "No dominant theme is leading — let the tape develop before adding risk.");
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
  const ind1     = (theme.related_industries ?? [])[1];
  const eff0     = (theme.second_order_effects ?? [])[0];
  const safeName = chainTerminal(theme.name).toLowerCase();
  const persist  = theme.persistence_cycles ?? 0;
  const breadth  = theme.breadth_score ?? 0;
  const delta    = theme.momentum_delta ?? 0;

  // Second-order effects are analyst-written — prefer over templates when substantive
  if (eff0 && !isRawChain(eff0) && eff0.length > 25) return eff0;

  if (theme.momentum_label === "accelerating") {
    if (ind1)
      return `${ind0} and ${ind1} are both gaining as ${safeName} accelerates, improving earnings visibility across both sectors.`;
    if (persist >= 5)
      return `${ind0} is in a sustained ${safeName} upswing — ${persist} consecutive periods of improving conditions support a high-conviction long.`;
    if (breadth >= 70)
      return `${ind0} benefits from broad ${safeName} tailwinds — above-average participation confirms this is a structural rather than isolated move.`;
    return `${ind0} is gaining ground as ${safeName} accelerates — improving conditions are expanding across the sector.`;
  }

  if (theme.cross_category_confirmed) {
    if (ind1)
      return `Cross-sector confirmation across ${ind0} and ${ind1} signals structural momentum — this is a multi-sector, not single-category, move.`;
    return `${ind0} is the primary beneficiary as ${safeName} spreads across sectors — momentum is extending beyond single-category leadership.`;
  }

  if (theme.momentum_label === "strengthening") {
    if (persist >= 4)
      return `${ind0} has strengthened for ${persist} consecutive periods — persistence at this level supports continued positioning.`;
    if (delta >= 15)
      return `${ind0} is building meaningful momentum — improving conditions signal accelerating capital interest in the sector.`;
    return `${ind0} conditions are improving as ${safeName} gains conviction across the market.`;
  }

  if (theme.momentum_label === "emerging")
    return `${ind0} is establishing an early position in ${safeName} — monitor for broader sector participation before sizing up.`;

  return `${ind0} is benefiting from ${safeName} tailwinds — improving conditions support continued positioning.`;
}

/**
 * Sector-focused explanation for risk cards.
 * Prioritises causal_narrative, falls back to template.
 */
function deriveRiskExplanation(theme: ThemeIntelligence): string {
  const causal = causalSentence(theme.causal_narrative);
  if (causal && causal.length > 20) return causal;

  const ind0     = (theme.related_industries ?? [])[0] ?? "the sector";
  const ind1     = (theme.related_industries ?? [])[1];
  const eff0     = (theme.second_order_effects ?? [])[0];
  const safeName = chainTerminal(theme.name);
  const delta    = Math.round(theme.momentum_delta ?? 0);
  const persist  = theme.persistence_cycles ?? 0;

  if (eff0 && !isRawChain(eff0) && eff0.length > 25) return eff0;

  if (theme.momentum_label === "reversing") {
    if (ind1)
      return `${ind0} and ${ind1} face compression risk as ${safeName} enters reversal — reduce exposure across both sectors.`;
    return `${ind0} positioning faces compression risk as ${safeName} enters reversal — deterioration is accelerating.`;
  }

  if (theme.momentum_label === "cooling") {
    if (persist >= 3)
      return `${ind0} has been cooling for ${persist} consecutive periods — exit timing is becoming critical.`;
    return `${ind0} momentum is fading — conviction is weakening and positioning is deteriorating.`;
  }

  if (!(theme.cross_category_confirmed) && (theme.breadth_score ?? 0) < 40)
    return `${ind0} lacks broader sector support — the absence of cross-sector participation increases concentration risk.`;

  return `${ind0} faces headwinds as ${safeName} weakens — monitor for further deterioration before adding to existing exposure.`;
}

/**
 * Single sell-side strategist sentence.
 * Leads with the causal mechanism — reads as a strategist note, not a label mapping.
 */
function deriveOneSentence(
  rotation:  IndustryRotationSignal[],
  opps:      BriefingOpportunity[],
  risks:     BriefingRisk[],
  ms:        MarketState,
  scorecard: BriefingScorecard,
): string {
  const { ratesRegime, volRegime, riskRegime } = ms;
  const topOpp  = opps[0]?.theme;
  const topRisk = risks[0]?.theme;

  let sentence: string;

  // Lead clause — prefer the actual mechanism (causal prose) as the subject
  if (topOpp) {
    const oppName  = chainTerminal(topOpp.name);
    const oppInd   = (topOpp.related_industries ?? [])[0];
    const causal   = causalSentence(topOpp.causal_narrative);
    const eff      = (topOpp.second_order_effects ?? []).find(e => e && !isRawChain(e) && e.length > 15);

    if (causal) {
      sentence = causal.replace(/\.$/, "");
    } else if (eff) {
      sentence = eff.replace(/\.$/, "");
    } else if (oppInd) {
      const verb =
        topOpp.momentum_label === "accelerating"  ? "is accelerating across" :
        topOpp.momentum_label === "strengthening" ? "is deepening its hold on" : "is extending gains across";
      sentence = `${oppName} ${verb} ${oppInd}`;
    } else {
      const verb = topOpp.momentum_label === "accelerating" ? "is accelerating" : "is advancing";
      sentence = `${oppName} ${verb} as the dominant signal`;
    }
  } else {
    sentence = "Markets are showing selective leadership across the tape";
  }

  // Counterforce — risk theme narrative before macro templates
  if (topRisk) {
    const riskName    = chainTerminal(topRisk.name);
    const riskInd     = (topRisk.related_industries ?? [])[0];
    const genuineRisk = topRisk.momentum_label === "reversing"
      || topRisk.momentum_label === "cooling"
      || (topRisk.momentum_delta ?? 0) < 0;
    const riskCausal  = genuineRisk ? causalSentence(topRisk.causal_narrative) : null;
    const riskEff     = genuineRisk
      ? (topRisk.second_order_effects ?? []).find(e => e && !isRawChain(e) && e.length > 15)
      : null;

    if (riskCausal) {
      const lc = riskCausal.charAt(0).toLowerCase() + riskCausal.slice(1).replace(/\.$/, "");
      sentence += `, while ${lc}`;
    } else if (riskEff) {
      const lc = riskEff.charAt(0).toLowerCase() + riskEff.slice(1).replace(/\.$/, "");
      sentence += `, while ${lc}`;
    } else if (riskInd) {
      const riskVerb = topRisk.momentum_label === "reversing" ? "enters reversal" : "deteriorates";
      sentence += `, while ${riskInd} faces compression as ${riskName} ${riskVerb}`;
    } else {
      const riskVerb = topRisk.momentum_label === "reversing" ? "enters reversal" : "creates downside risk";
      sentence += `, while ${riskName} ${riskVerb}`;
    }
  } else if (ratesRegime === "rising" && riskRegime !== "risk-on") {
    sentence += ", while elevated yields continue to suppress long-duration growth assets";
  } else if (volRegime === "elevated" || volRegime === "high") {
    sentence += ", while elevated volatility limits breadth";
  } else if (riskRegime === "risk-on") {
    sentence += " amid constructive cross-asset conditions";
  } else {
    sentence += " amid mixed conditions";
  }

  // Cap the footer to 26 words — prose from second_order_effects can run long
  const words = (sentence + ".").split(/\s+/);
  return words.length <= 26 ? words.join(" ") : words.slice(0, 26).join(" ") + ".";
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
      <div className="px-5 pt-5 pb-4" style={DIV}>

        {/* Label row */}
        <div className="flex items-center justify-between mb-3">
          <span
            className="text-[7px] font-bold uppercase tracking-[0.28em]"
            style={{ color: "rgba(255,255,255,0.32)" }}
          >
            Market Regime
          </span>
          {/* Conviction pill */}
          <span
            className="text-[8px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              color:      regimeColor,
              background: `${regimeColor}18`,
              letterSpacing: "0.03em",
            }}
          >
            {conviction}
          </span>
        </div>

        {/* Regime headline — the dominant element */}
        <p
          className="font-black leading-none tracking-tight mb-3"
          style={{ fontSize: "22px", color: regimeColor, letterSpacing: "-0.02em" }}
        >
          {regimeHeadline.toUpperCase()}
        </p>

        {/* 2-3 sentence strategist narrative */}
        <p
          className="leading-relaxed mb-4"
          style={{ fontSize: "12.5px", color: "rgba(255,255,255,0.64)", maxWidth: "640px" }}
        >
          {narrative}
        </p>

        {/* Signal balance — numbers only, no sub-label noise */}
        <div
          className="flex items-center gap-4"
          style={{ paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
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
        <div className="px-5 py-3.5" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <p
            className="text-[7.5px] font-bold uppercase tracking-[0.22em] mb-3"
            style={{ color: "rgba(16,185,129,0.70)" }}
          >
            Opportunity
          </p>
          <div className="space-y-4">
            {opps.map((opp, i) => (
              <ThemeEntry key={i} theme={opp.theme} isOpp={true} />
            ))}
          </div>
        </div>

        {/* Risks */}
        <div className="px-5 py-3.5">
          <p
            className="text-[7.5px] font-bold uppercase tracking-[0.22em] mb-3"
            style={{ color: "rgba(239,68,68,0.70)" }}
          >
            Risk
          </p>
          <div className="space-y-4">
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
              {leaders.map((sig, i) => <RotationRow key={i} sig={sig} themes={themes} isLeader={true} />)}
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
              {laggards.map((sig, i) => <RotationRow key={i} sig={sig} themes={themes} isLeader={false} />)}
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
      <div className="px-5 py-3.5" style={{ ...DIV, borderLeft: `2px solid ${regimeColor}28` }}>
        <p
          className="leading-relaxed"
          style={{ fontSize: "12px", color: "rgba(255,255,255,0.58)", fontStyle: "italic", paddingLeft: "10px" }}
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
      {/* Industry / sector — dominant, actionable title */}
      <p
        className="font-semibold leading-snug mb-1"
        style={{ fontSize: "13px", color: "rgba(255,255,255,0.94)", letterSpacing: "-0.01em" }}
      >
        {industryTitle}
      </p>
      {/* Why it matters */}
      <p
        className="leading-snug mb-1.5"
        style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.50)", lineHeight: "1.5" }}
      >
        {explanation}
      </p>
      {/* Theme name — no "Theme:" prefix noise, just the name */}
      <p
        className="text-[9px] font-medium truncate"
        style={{ color: "rgba(255,255,255,0.32)" }}
      >
        {chainTerminal(theme.name)}
      </p>
      {/* Confidence accent line */}
      <div
        className="mt-1.5 rounded-full"
        style={{
          height:     "2px",
          width:      `${Math.max(15, Math.min(100, theme.confidence ?? 50))}%`,
          background: accentColor,
          opacity:    0.35,
        }}
      />
    </div>
  );
}

// ── Rotation row ──────────────────────────────────────────────────────────────

function deriveRotationExplanation(
  sig:      IndustryRotationSignal,
  themes:   ThemeIntelligence[],
  isLeader: boolean,
): string {
  // Sort by confidence so the most-substantiated theme leads
  const related = themes
    .filter(t => (t.related_industries ?? []).includes(sig.industry))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  const top  = related[0];
  const top2 = related[1];

  // No theme context available
  if (!top) {
    return isLeader
      ? `${sig.industry} is gaining traction as the fundamental backdrop improves.`
      : `${sig.industry} is weakening as fundamental support deteriorates.`;
  }

  const name  = chainTerminal(top.name);
  const name2 = top2 ? chainTerminal(top2.name) : null;
  const ml    = top.momentum_label;

  // Trim prose to ≤ 22 words and ensure terminal punctuation
  const toShort = (text: string): string => {
    const words = text.trim().split(/\s+/);
    const t = words.length > 22 ? words.slice(0, 22).join(" ") + "…" : text.trim();
    return t.endsWith(".") || t.endsWith("…") ? t : t + ".";
  };

  // Prefer real narrative prose over any template
  const causal = causalSentence(top.causal_narrative);
  if (causal) return toShort(causal);

  const eff = (top.second_order_effects ?? [])
    .find(e => e && !isRawChain(e) && e.length >= 15);
  if (eff) return toShort(eff);

  // Template — uses actual theme names and momentum direction, not signal counts
  if (isLeader) {
    if (ml === "accelerating") {
      if (name2) return `${name} is accelerating alongside ${name2}, both boosting ${sig.industry}.`;
      if (top.cross_category_confirmed) return `${name} is accelerating with improving participation across ${sig.industry}.`;
      return `${name} is accelerating, strengthening the fundamental backdrop for ${sig.industry}.`;
    }
    if (ml === "strengthening") {
      if (name2) return `${name} and ${name2} are both strengthening, supporting ${sig.industry} positioning.`;
      return `${name} is strengthening, improving the investment case for ${sig.industry}.`;
    }
    if (ml === "emerging") {
      return `${name} is emerging as a driver of early positioning in ${sig.industry}.`;
    }
    if (name2) return `${name} and ${name2} are supporting the ${sig.industry} thesis.`;
    return `${name} is the dominant driver of the current ${sig.industry} rotation.`;
  } else {
    if (ml === "reversing") {
      if (name2) return `${name} is reversing while ${name2} adds further pressure on ${sig.industry}.`;
      return `${name} entering reversal is the primary headwind for ${sig.industry}.`;
    }
    if (ml === "cooling") {
      if (name2) return `${name} and ${name2} are both cooling, reducing ${sig.industry} conviction.`;
      return `${name} is cooling, removing a key support for ${sig.industry} positioning.`;
    }
    if (name2) return `${name} and ${name2} deterioration are weighing on ${sig.industry}.`;
    return `${name} deterioration is the primary driver of ${sig.industry} weakness.`;
  }
}

function RotationRow({
  sig, themes, isLeader,
}: { sig: IndustryRotationSignal; themes: ThemeIntelligence[]; isLeader: boolean }) {
  const isPos = sig.delta > 0;
  const color = isPos ? "#10B981" : "#EF4444";
  const expl  = deriveRotationExplanation(sig, themes, isLeader);

  return (
    <div>
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
      <p className="text-[10px] leading-snug mt-0.5" style={{ color: "rgba(255,255,255,0.34)" }}>
        {expl}
      </p>
    </div>
  );
}
