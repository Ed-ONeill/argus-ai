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

// ── Narrative helpers ─────────────────────────────────────────────────────────

function deriveRegimeNarrative(
  ms:       MarketState,
  rotation: IndustryRotationSignal[],
  opps:     BriefingOpportunity[],
): string {
  const { riskRegime, ratesRegime, volRegime, dollarRegime } = ms;
  const topInd = rotation.filter(r => r.delta > 0)[0];
  const topOpp = opps[0]?.theme;

  // Opening clause — rate / vol environment
  let opening =
    ratesRegime === "rising" && riskRegime !== "risk-on"
      ? "Yield pressure is limiting upside"
    : ratesRegime === "falling"
      ? "Easing conditions are supporting risk appetite"
    : volRegime === "elevated" || volRegime === "high"
      ? "Elevated volatility is creating selective opportunities"
    : dollarRegime === "strong" && riskRegime !== "risk-on"
      ? "Dollar strength is weighing on risk assets"
    : riskRegime === "risk-on"
      ? "Risk appetite is broadening across sectors"
      : "Mixed conditions are creating uneven leadership";

  // Second clause — sector / theme leadership
  if (topInd && topOpp) {
    const verb = topOpp.momentum_label === "accelerating" ? "accelerating" :
                 topOpp.momentum_label === "strengthening" ? "strengthening" : "advancing";
    return `${opening} while ${topInd.industry} assume leadership through ${verb} ${topOpp.name}.`;
  }
  if (topOpp) {
    const verb = topOpp.momentum_label === "accelerating" ? "accelerates" : "advances";
    return `${opening} while ${topOpp.name} ${verb}.`;
  }
  return `${opening}.`;
}

function deriveWhyItMatters(theme: ThemeIntelligence, isOpp: boolean): string {
  // Use causal_narrative if it's substantive (first sentence only)
  if (theme.causal_narrative && theme.causal_narrative.length > 20) {
    const first = theme.causal_narrative.split(".")[0];
    if (first && first.length > 15) return first.trim() + ".";
  }

  const ind0 = (theme.related_industries ?? [])[0] ?? "tracked sectors";
  const eff0 = (theme.second_order_effects ?? [])[0];

  if (isOpp) {
    if (theme.momentum_label === "accelerating")
      return `${ind0} benefiting from expanding ${theme.name} dynamics.`;
    if (theme.cross_category_confirmed)
      return `Cross-sector confirmation signals structural breadth — ${ind0} as primary vector.`;
    if (theme.momentum_label === "strengthening")
      return `${ind0} signal quality improving across ${theme.persistence_cycles} consecutive cycles.`;
    return eff0 ?? `${ind0} positioned for continued momentum as conviction builds.`;
  } else {
    if (theme.momentum_label === "reversing")
      return `${ind0} positioning vulnerable to multiple compression as signal degrades.`;
    if (theme.momentum_label === "cooling")
      return `${ind0} momentum fading — delta at ${Math.round(theme.momentum_delta ?? 0)}, risk of further deterioration.`;
    return eff0 ?? `${ind0} signal weakening — monitor for confirmation of trend break.`;
  }
}

function deriveOneSentence(
  rotation: IndustryRotationSignal[],
  opps:     BriefingOpportunity[],
  risks:    BriefingRisk[],
  ms:       MarketState,
): string {
  const { ratesRegime, volRegime, riskRegime } = ms;
  const topRot  = rotation.filter(r => r.delta > 0)[0];
  const topOpp  = opps[0]?.theme;
  const topRisk = risks[0]?.theme;

  const parts: string[] = [];

  if (topRot && topOpp) {
    const verb = topOpp.momentum_label === "accelerating" ? "accelerates" :
                 topOpp.momentum_label === "strengthening" ? "strengthens" : "advances";
    parts.push(`${topRot.industry} are leading as ${topOpp.name} ${verb}`);
  } else if (topOpp) {
    const verb = topOpp.momentum_label === "accelerating" ? "accelerates" : "advances";
    parts.push(`${topOpp.name} ${verb} as the dominant intelligence signal`);
  } else {
    parts.push("Markets are showing mixed sector leadership");
  }

  if (ratesRegime === "rising" && riskRegime !== "risk-on")
    parts.push("while elevated yields continue to suppress long-duration growth assets");
  else if (ratesRegime === "falling")
    parts.push("while easing conditions provide a tailwind for risk assets");
  else if (volRegime === "elevated" || volRegime === "high")
    parts.push("while elevated volatility limits conviction in growth exposures");
  else if (topRisk)
    parts.push(`while ${topRisk.name} presents the primary downside risk`);
  else if (riskRegime === "risk-on")
    parts.push("amid broadly constructive market conditions");
  else
    parts.push("amid mixed conditions and selective sector participation");

  return parts.join(" ") + ".";
}

// ── Main component ────────────────────────────────────────────────────────────

interface IntelligenceStripProps {
  themes: ThemeIntelligence[];
}

export function IntelligenceStrip({ themes }: IntelligenceStripProps) {
  const ms = useMarketState();

  const scorecard = useMemo(() => computeScorecard(themes),        [themes]);
  const opps      = useMemo(() => computeOpportunities(themes, 2), [themes]);
  const risks     = useMemo(() => computeRisks(themes, 2),         [themes]);
  const rotation  = useMemo(() => computeIndustryRotation(themes), [themes]);
  const balance   = useMemo(() => computeSignalBalance(themes, scorecard), [themes, scorecard]);
  const changes   = useMemo(() => computeTodaysChanges(themes, rotation), [themes, rotation]);

  if (themes.length === 0) return null;

  const regimeColor    = REGIME_COLOR[ms.riskRegime]    ?? "#8898b8";
  const regimeHeadline = REGIME_HEADLINE[ms.riskRegime] ?? "Neutral Market";
  const narrative      = deriveRegimeNarrative(ms, rotation, opps);
  const oneSentence    = deriveOneSentence(rotation, opps, risks, ms);

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
            className="text-[9px] font-semibold tabular-nums"
            style={{ color: "rgba(255,255,255,0.30)" }}
          >
            Confidence {balance.confidence}%
          </span>
        </div>

        {/* Regime headline — the dominant element */}
        <p
          className="font-black leading-none tracking-tight mb-2"
          style={{ fontSize: "22px", color: regimeColor, letterSpacing: "-0.02em" }}
        >
          {regimeHeadline.toUpperCase()}
        </p>

        {/* Narrative */}
        <p
          className="text-[12px] leading-relaxed mb-3"
          style={{ color: "rgba(255,255,255,0.60)", maxWidth: "640px" }}
        >
          {narrative}
        </p>

        {/* Signal balance */}
        <div
          className="flex items-center gap-5"
          style={{
            paddingTop:  "10px",
            borderTop:   "1px solid rgba(255,255,255,0.07)",
          }}
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
              <ThemeEntry
                key={i}
                theme={opp.theme}
                isOpp={true}
              />
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
              <ThemeEntry
                key={i}
                theme={risk.theme}
                isOpp={false}
              />
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
  const accentColor = isOpp ? "#10B981" : "#EF4444";
  const why         = deriveWhyItMatters(theme, isOpp);

  return (
    <div>
      <p
        className="text-[11.5px] font-semibold leading-snug mb-0.5"
        style={{ color: "rgba(255,255,255,0.88)" }}
      >
        {theme.name}
      </p>
      <p
        className="text-[10.5px] leading-snug"
        style={{ color: "rgba(255,255,255,0.44)" }}
      >
        {why}
      </p>
      {/* Momentum accent line */}
      <div
        className="mt-1.5 rounded-full"
        style={{
          height:     "2px",
          width:      `${Math.max(15, Math.min(100, (theme.confidence ?? 50)))}%`,
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
