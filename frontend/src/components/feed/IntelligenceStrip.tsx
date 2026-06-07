"use client";

import { useMemo } from "react";
import type { ThemeIntelligence } from "@/lib/types";
import type { MarketState, RiskRegime } from "@/hooks/useMarketState";
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

// ── Regime reconciliation ─────────────────────────────────────────────────────

/**
 * Reconcile the cross-asset price regime with theme signal balance.
 * Cross-asset regime is derived from same-day equity % changes which can
 * diverge from the underlying fundamental narrative in the theme set.
 * Prevents contradictions like "Risk-Off Market" headlining a narrative
 * where bullish themes materially outnumber deteriorating ones.
 */
function deriveEffectiveRegime(
  msRegime:  RiskRegime,
  balance:   SignalBalance,
  scorecard: BriefingScorecard,
): RiskRegime {
  const { netSignal, bullish, bearish } = balance;
  // Price says risk-off but theme fundamentals are broadly constructive
  if (msRegime === "risk-off" && bullish > bearish * 2 && netSignal >= 3)
    return "neutral";
  // Price says risk-on but theme fundamentals are broadly deteriorating
  if (msRegime === "risk-on" && bearish > bullish * 2 && netSignal <= -3)
    return "neutral";
  // Strong directional theme momentum can upgrade a flat neutral reading
  if (msRegime === "neutral" && scorecard.accelerating >= 4 && netSignal >= 5)
    return "risk-on";
  if (msRegime === "neutral" && scorecard.reversing >= 3 && netSignal <= -5)
    return "risk-off";
  return msRegime;
}

// ── Narrative generators ──────────────────────────────────────────────────────

/**
 * 2-3 sentence strategist summary.
 * S1: highest-conviction bullish theme — uses causal narrative when available.
 * S2: highest-conviction bearish theme (preferred over generic macro signals).
 * S3: breadth / conviction — names real themes, not signal counts.
 */
function deriveRegimeNarrative(
  ms:              MarketState,
  rotation:        IndustryRotationSignal[],
  opps:            BriefingOpportunity[],
  risks:           BriefingRisk[],
  scorecard:       BriefingScorecard,
  effectiveRegime: RiskRegime,
): string {
  const { ratesRegime, volRegime, dollarRegime } = ms;
  const riskRegime = effectiveRegime;
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

    if (causal && oppInd) {
      const lc = causal.charAt(0).toLowerCase() + causal.slice(1).replace(/\.$/, "");
      sentences.push(`${oppInd} is benefiting — ${lc}.`);
    } else if (causal) {
      sentences.push(causal.endsWith(".") ? causal : causal + ".");
    } else if (eff && oppInd) {
      const lc = eff.charAt(0).toLowerCase() + eff.slice(1).replace(/\.$/, "");
      sentences.push(`${oppInd} is benefiting — ${lc}.`);
    } else if (oppInd) {
      const ind2 = (topOpp.related_industries ?? [])[1];
      if (ind2 && topOpp.cross_category_confirmed) {
        sentences.push(`${oppInd} and ${ind2} are both seeing earnings upgrades as ${oppName} expands across categories.`);
      } else {
        const opp2Name = opp2 ? chainTerminal(opp2.name) : null;
        sentences.push(opp2Name
          ? `${oppInd} earnings are improving as ${oppName} builds — ${opp2Name} is adding to the demand picture.`
          : `${oppName} is building in ${oppInd} — earnings and order trends are moving in the same direction.`);
      }
    } else {
      sentences.push(`${oppName} order flow and pricing data are turning constructive — evidence of the theme is not concentrated in a single sector.`);
    }
  } else if (topInd) {
    sentences.push(`${topInd.industry} is seeing the largest earnings revision uplift — capital spending and demand trends are both turning in its favour.`);
  } else if (riskRegime === "risk-on") {
    sentences.push("Cyclicals and credit-sensitive sectors are both participating — the advance is consistent with an earnings-driven rather than multiple-expansion move.");
  } else {
    sentences.push("No single economic driver is dominating — earnings and policy signals are pulling in different directions.");
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
    if (riskCausal && riskInd) {
      const lc = riskCausal.charAt(0).toLowerCase() + riskCausal.slice(1).replace(/\.$/, "");
      sentences.push(`However, ${riskInd} faces headwinds as ${lc}.`);
    } else if (riskCausal) {
      const lc = riskCausal.charAt(0).toLowerCase() + riskCausal.slice(1).replace(/\.$/, "");
      sentences.push(`However, ${lc}, pressuring margins and earnings estimates in exposed sectors.`);
    } else if (riskEff && riskInd) {
      const lc = riskEff.charAt(0).toLowerCase() + riskEff.slice(1).replace(/\.$/, "");
      sentences.push(`However, ${riskInd} faces pressure as ${lc}.`);
    } else if (riskInd) {
      if (topRisk.momentum_label === "reversing") {
        sentences.push(`However, ${riskInd} is facing margin compression as ${riskName} enters reversal.`);
      } else {
        sentences.push(`However, ${riskInd} is seeing earnings estimates cut as ${riskName} deteriorates.`);
      }
    } else {
      if (topRisk.momentum_label === "reversing") {
        sentences.push(`However, ${riskName} order cancellations are rising and margin guidance is being cut across exposed sectors.`);
      } else {
        sentences.push(`However, ${riskName} end-demand is softening — revenue assumptions across exposed sectors are being revised lower.`);
      }
    }
  } else if (ratesRegime === "rising" && riskRegime !== "risk-on") {
    sentences.push(
      "However, rising yields are compressing equity risk premiums in long-duration growth and technology — valuations are adjusting to a higher discount rate."
    );
  } else if (volRegime === "elevated" || volRegime === "high") {
    sentences.push(
      "However, elevated volatility is compressing multiples and limiting sector participation."
    );
  } else if (dollarRegime === "strong" && riskRegime !== "risk-on") {
    sentences.push(
      "Dollar strength is eroding foreign earnings translations and weighing on commodity prices — internationally exposed sectors face FX headwinds at the margin."
    );
  }

  // ── S3: Reads like commentary, not diagnostics ────────────────────────────
  const net      = scorecard.accelerating - scorecard.reversing;
  const opp2Name = opp2 ? chainTerminal(opp2.name) : null;

  if (net >= 4 && scorecard.highConviction >= 3) {
    sentences.push(oppName && opp2Name
      ? `${oppName} and ${opp2Name} are both seeing revenue upside — earnings upgrades are broadening across the industrial base.`
      : oppName
      ? `${oppName} is leading a broad advance — earnings revisions are positive and the sector expansion is confirmed by order data.`
      : "More themes are seeing revenue upgrades than cuts, and the revision cycle is tilted positive.");
  } else if (net >= 2) {
    sentences.push(oppName
      ? `${oppName} leads, but earnings improvement has yet to spread beyond the primary sector — the advance is narrow.`
      : "Leadership is narrow — the earnings improvement story has not yet spread across the broader industrial base.");
  } else if (net <= -2) {
    sentences.push(riskName
      ? `${riskName} earnings cuts are outpacing new leadership — the number of downward revisions is widening across the sector.`
      : "Earnings cuts are outpacing upgrades — the downward revision cycle is broadening across more sectors.");
  } else {
    sentences.push(oppName && riskName
      ? `${oppName} is seeing earnings upgrades while ${riskName} faces cuts — the market is pricing a structural rotation, not a broad cycle.`
      : oppName
      ? `${oppName} has the clearest earnings upgrade story in a mixed tape — the drivers are idiosyncratic rather than macro.`
      : "No theme has sufficient earnings or demand evidence to anchor a durable move — the macro catalysts are stale.");
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
      return `${ind0} and ${ind1} are both seeing earnings upgrades as ${safeName} accelerates — the improvement is spread across the supply chain, not concentrated in a single name.`;
    if (persist >= 5)
      return `${ind0} has seen ${persist} consecutive periods of earnings upgrades as ${safeName} builds — the trend has duration and is not a single-quarter event.`;
    if (breadth >= 70)
      return `${ind0} benefits from ${safeName} with unusually broad participation — earnings improvement is spread across the sector rather than concentrated in a few names.`;
    return `${ind0} earnings estimates are being revised higher as ${safeName} accelerates — both top-line growth and margin assumptions are moving in the same direction.`;
  }

  if (theme.cross_category_confirmed) {
    if (ind1)
      return `${ind0} and ${ind1} are both seeing earnings upgrades from ${safeName} — the driver is structural, not a single-sector or single-company catalyst.`;
    return `${ind0} is the primary beneficiary as ${safeName} spreads — earnings exposure is extending across supply chains and adjacent sectors.`;
  }

  if (theme.momentum_label === "strengthening") {
    if (persist >= 4)
      return `${ind0} has seen ${persist} consecutive periods of improving earnings — persistence of this length typically reflects a durable demand shift rather than a one-off catalyst.`;
    if (delta >= 15)
      return `${ind0} earnings revisions are inflecting sharply — the rate of change is accelerating and capital spending in related sectors is following.`;
    return `${ind0} is seeing incremental earnings upgrades as ${safeName} builds — the improvement is measured but consistent.`;
  }

  if (theme.momentum_label === "emerging")
    return `${ind0} is showing early evidence of ${safeName} exposure — supply chains and order books are beginning to reflect the theme, though at low penetration.`;

  return `${ind0} earnings are exposed to ${safeName} — the primary driver is a shift in end-demand rather than multiple expansion.`;
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
      return `${ind0} and ${ind1} earnings estimates are both being cut as ${safeName} enters reversal — the original thesis is unwinding faster than consensus expected.`;
    return `${ind0} earnings estimates are being cut as ${safeName} reverses — the initial thesis is unwinding and margin assumptions are the most exposed.`;
  }

  if (theme.momentum_label === "cooling") {
    if (persist >= 3)
      return `${ind0} has seen ${persist} consecutive periods of falling earnings estimates — the deterioration is persistent, not cyclical noise.`;
    return `${ind0} earnings estimates are being marked down — demand assumptions that supported the original thesis are no longer holding.`;
  }

  if (!(theme.cross_category_confirmed) && (theme.breadth_score ?? 0) < 40)
    return `${ind0} earnings exposure is narrow — the improvement is concentrated in too few names to support a sector-level view without broader confirmation.`;

  return `${ind0} earnings are exposed to ${safeName} weakness — margin assumptions are the most vulnerable if the theme continues to deteriorate.`;
}

/**
 * Synthesises the opportunity and risk themes into a single strategist sentence.
 * Does not restate the top opportunity card — frames the tape as a tension
 * between the strongest advancing theme and the most material headwind.
 * Maximum 25 words.
 */
function deriveOneSentence(
  rotation:        IndustryRotationSignal[],
  opps:            BriefingOpportunity[],
  risks:           BriefingRisk[],
  ms:              MarketState,
  scorecard:       BriefingScorecard,
  balance:         SignalBalance,
  effectiveRegime: RiskRegime,
): string {
  const { ratesRegime, dollarRegime } = ms;
  const riskRegime = effectiveRegime;
  const topOpp  = opps[0]?.theme;
  const topRisk = risks[0]?.theme;

  const oppInd   = topOpp  ? (topOpp.related_industries  ?? [])[0] : null;
  const riskInd  = topRisk ? (topRisk.related_industries ?? [])[0] : null;
  const oppName  = topOpp  ? chainTerminal(topOpp.name)  : null;
  const riskName = topRisk ? chainTerminal(topRisk.name) : null;

  const genuineRisk = !!topRisk && (
    topRisk.momentum_label === "reversing" ||
    topRisk.momentum_label === "cooling" ||
    (topRisk.momentum_delta ?? 0) < 0
  );

  const oppCausal  = topOpp  ? causalSentence(topOpp.causal_narrative)  : null;
  const riskCausal = genuineRisk ? causalSentence(topRisk!.causal_narrative) : null;

  const cap = (s: string): string => {
    const w = (s.endsWith(".") ? s : s + ".").split(/\s+/);
    return w.length <= 25 ? w.join(" ") : w.slice(0, 25).join(" ") + ".";
  };

  // Both sides have causal prose — synthesise as a tension sentence
  if (oppCausal && riskCausal) {
    const lc1 = oppCausal.charAt(0).toLowerCase() + oppCausal.slice(1).replace(/\.$/, "");
    const lc2 = riskCausal.charAt(0).toLowerCase() + riskCausal.slice(1).replace(/\.$/, "");
    return cap(`${lc1}, even as ${lc2}.`);
  }

  // Opp narrative + risk without prose
  if (oppCausal && genuineRisk && riskInd && riskName) {
    const lc      = oppCausal.charAt(0).toLowerCase() + oppCausal.slice(1).replace(/\.$/, "");
    const riskAct = topRisk!.momentum_label === "reversing" ? "compresses margins" : "softens revenue assumptions";
    return cap(`${lc}, while ${riskInd} faces pressure as ${riskName} ${riskAct}.`);
  }

  // Risk narrative + opp without prose
  if (riskCausal && oppInd && oppName) {
    const lc   = riskCausal.charAt(0).toLowerCase() + riskCausal.slice(1).replace(/\.$/, "");
    const verb = topOpp!.momentum_label === "accelerating" ? "outperforms" : "maintains its earnings case";
    return cap(`${oppInd} ${verb} even as ${lc}.`);
  }

  // Both themes, no narratives — synthesise the divergence directly
  if (oppInd && riskInd && oppName && riskName && genuineRisk) {
    const oppAct  = topOpp!.momentum_label === "accelerating" ? "drives pricing power in" : "is widening margins in";
    const riskAct = topRisk!.momentum_label === "reversing"   ? "compresses margins in"   : "softens revenue assumptions in";
    return cap(`${oppName} ${oppAct} ${oppInd} as ${riskName} ${riskAct} ${riskInd}.`);
  }

  // Opp only — frame against the macro backdrop rather than restate the card
  if (oppName && oppInd) {
    if (ratesRegime === "rising")
      return cap(`${oppName} is outperforming despite rising yields — earnings revisions are offsetting duration pressure.`);
    if (dollarRegime === "strong")
      return cap(`${oppName} is advancing in ${oppInd} despite dollar strength — domestic demand is driving the move.`);
    const macroEnd = riskRegime === "risk-on"
      ? "as credit conditions ease and earnings revisions broaden"
      : "on idiosyncratic earnings drivers rather than a macro catalyst";
    return cap(`${oppName} is leading on earnings revision breadth ${macroEnd}.`);
  }

  // No clear theme — describe the balance of the tape
  if (balance.netSignal >= 3)
    return cap(`More themes are seeing earnings upgrades than cuts — the cycle is in an expansionary phase, with demand and supply conditions broadly aligned.`);
  if (balance.netSignal <= -3)
    return cap(`Earnings cuts outnumber upgrades across the tracked set — the deterioration is broad-based rather than sector-specific.`);
  if (ratesRegime === "rising")
    return cap(`The tape is mixed — rising yields are compressing multiples across rate-sensitive sectors.`);
  return cap(`The tape is mixed — earnings revision momentum is split between cyclical recovery names and defensive assets.`);
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

  const effectiveRegime = deriveEffectiveRegime(ms.riskRegime, balance, scorecard);
  const regimeColor     = REGIME_COLOR[effectiveRegime]    ?? "#8898b8";
  const regimeHeadline  = REGIME_HEADLINE[effectiveRegime] ?? "Neutral Market";
  const narrative       = deriveRegimeNarrative(ms, rotation, opps, risks, scorecard, effectiveRegime);
  const oneSentence     = deriveOneSentence(rotation, opps, risks, ms, scorecard, balance, effectiveRegime);

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
  const related = themes
    .filter(t => (t.related_industries ?? []).includes(sig.industry))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  const top  = related[0];
  const top2 = related[1];

  if (!top) {
    return isLeader
      ? `${sig.industry} is outperforming as multiple themes converge on the same demand catalyst.`
      : `${sig.industry} is underperforming as the earnings and demand case weakens.`;
  }

  const name    = chainTerminal(top.name);
  const name2   = top2 ? chainTerminal(top2.name) : null;
  const ml      = top.momentum_label;
  const persist = top.persistence_cycles ?? 0;
  const pdays   = top.persistence_days   ?? 0;
  const breadth = Math.round(top.breadth_score ?? 0);

  // Trim to ≤ 18 words
  const toShort = (text: string): string => {
    const words = text.trim().split(/\s+/);
    const t = words.length > 18 ? words.slice(0, 18).join(" ") + "…" : text.trim();
    return t.endsWith(".") || t.endsWith("…") ? t : t + ".";
  };

  // Rotation rows answer a different question from opportunity cards.
  // Opportunity: why is this sector attractive/vulnerable?
  // Rotation: why is this sector outperforming/underperforming right now?
  //
  // Source priority: second_order_effects (NOT causal_narrative — that is the
  // opportunity card's territory). Skip effects[0] if opportunity card would
  // have used it (i.e. when causal_narrative is absent, opportunity falls back
  // to effects[0] — skip it here to prevent exact duplication).
  const hasCausal = !!causalSentence(top.causal_narrative);
  const effStart  = hasCausal ? 0 : 1;
  const eff = (top.second_order_effects ?? []).slice(effStart)
    .find(e => e && !isRawChain(e) && e.length >= 15);
  if (eff) return toShort(eff);

  // Templates answer "why outperforming?" or "why underperforming?" with observable drivers.
  if (isLeader) {
    if (ml === "accelerating") {
      if (name2) return `${name} and ${name2} are both lifting ${sig.industry} revenue — the demand shift is visible across the supply chain.`;
      if (top.cross_category_confirmed) return `${name} confirmation across multiple categories is translating into ${sig.industry} revenue upside.`;
      if (pdays >= 10) return `${sig.industry} has outperformed for ${pdays} days as ${name} order data remains positive.`;
      if (breadth >= 70) return `${sig.industry} gains are broad-based — no single name is distorting the sector outperformance.`;
      return `${name} is driving ${sig.industry} revenue upside through pricing power and volume.`;
    }
    if (ml === "strengthening") {
      if (name2) return `${name} and ${name2} are both improving the revenue outlook for ${sig.industry}.`;
      if (persist >= 4) return `${sig.industry} has outperformed for ${persist} consecutive periods as ${name} financing costs ease.`;
      return `${name} is widening ${sig.industry} margins as the cost structure normalises.`;
    }
    if (ml === "emerging") {
      return `${sig.industry} is seeing first procurement orders tied to ${name} — institutional adoption is beginning.`;
    }
    if (name2) return `${name} and ${name2} are both generating revenue tailwinds for ${sig.industry}.`;
    return `${sig.industry} is outperforming as ${name} demand shifts in the sector's favour.`;
  } else {
    if (ml === "reversing") {
      if (name2) return `${name} is in reversal and ${name2} is adding pressure — ${sig.industry} margin guidance is being cut.`;
      return `${sig.industry} is underperforming as ${name} pricing assumptions are being walked back.`;
    }
    if (ml === "cooling") {
      if (name2) return `${name} and ${name2} are both softening — ${sig.industry} revenue expectations are being revised lower.`;
      if (persist >= 3) return `${sig.industry} has underperformed for ${persist} consecutive periods as ${name} order rates slow.`;
      return `${sig.industry} is under pressure as ${name} end-demand weakens faster than supply is adjusting.`;
    }
    if (name2) return `${name} and ${name2} softness is cutting ${sig.industry} revenue estimates.`;
    return `${sig.industry} is underperforming as ${name} pricing power erodes.`;
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
