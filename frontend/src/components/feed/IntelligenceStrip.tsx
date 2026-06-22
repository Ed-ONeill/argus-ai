"use client";

import { useMemo } from "react";
import type { ThemeIntelligence } from "@/lib/types";
import type { MarketState, RiskRegime } from "@/hooks/useMarketState";
import { useMarketState } from "@/hooks/useMarketState";
import { themePreferenceScore, type UserPrefs } from "@/lib/feedRanker";
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

/**
 * Extract the first complete sentence from a block of text, including its
 * trailing period. Returns null when no sentence boundary is found at idx > 15,
 * preventing fragment fallback entirely.
 */
function firstSentence(text: string | undefined | null): string | null {
  if (!text || text.length < 15) return null;
  const idx = text.indexOf(".");
  if (idx > 15) return text.slice(0, idx + 1).trim();
  return null;
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

// ── Text sanitizer ────────────────────────────────────────────────────────────

const THEME_LABEL_BLOCKLIST: string[] = [
  "Higher-for-Longer Repricing",
  "Grid Bottleneck Trade",
  "Baseload Scarcity Premium",
  "Credit Transmission Breakdown",
  "Metabolic Disease Repricing",
  "Crypto Market Structure",
  "Non-Bank Lending Ascendancy",
  "PBOC Easing Rotation",
  "NATO Rearmament Cycle",
  "Silicon Sovereignty Capex",
];

// Filler phrase substitutions — each tuple is [pattern, replacement].
// Applied in order after theme-label stripping; the empty-string replacements
// remove the phrase entirely and the trailing clean-up collapses double spaces.
const FILLER_SUBS: [RegExp, string][] = [
  [/\. The move is structural[^.]*\./gi,                                  "."],
  [/, not isolated to a single (?:company|name|catalyst)[^.]*/gi,         ""],
  [/ rather than concentrating in (?:a single|any one) (?:name|sector|company)[^.]*/gi, ""],
  [/ rather than concentrated in (?:a single|any one) (?:name|sector|company)[^.]*/gi, ""],
  [/ from (?:the )?same underlying driver[^.]*/gi,                        ""],
  [/ with broader confirmation (?:still )?developing[^.]*/gi,             ""],
  [/ as multiple demand drivers converge[^.]*/gi,                         ""],
  [/The improvement spans the supply chain[^.]*\./gi,                     ""],
  [/ from several directions[^.]*/gi,                                     ""],
  [/\. The advance is consistent with an earnings-driven rather than multiple-expansion move\./gi, "."],
];

/** Final defensive pass before any public-facing narrative string is rendered. */
function sanitize(text: string): string {
  let s = text;
  // NOTE: two regexes were removed here that used an UNESCAPED "." —
  //   s.replace(/ .  /g, ", ")  and  s.replace(/. /g, "")
  // In a regex "." matches ANY character, so `/. /g` matched every
  // "<char><space>" and deleted both — eating the last letter of each word and
  // the space, turning "Energy compression" into "Energcompression". That was
  // the root cause of narrative paragraphs rendering as merged, mangled words.
  // The legitimate whitespace cleanup is handled by the collapse + trim below.
  for (const label of THEME_LABEL_BLOCKLIST) {
    s = s.replace(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "this driver");
  }
  for (const [re, replacement] of FILLER_SUBS) {
    s = s.replace(re, replacement);
  }
  s = s.replace(/  +/g, " ").trim();
  return s;
}

// ── Direction helpers ─────────────────────────────────────────────────────────

const BULLISH_LABELS = new Set(["accelerating", "strengthening", "emerging"]);
const BEARISH_LABELS = new Set(["reversing", "cooling"]);

function isThemeBullish(t: ThemeIntelligence): boolean {
  return t.momentum_direction === "bullish" || BULLISH_LABELS.has(t.momentum_label);
}

function isThemeBearish(t: ThemeIntelligence): boolean {
  return t.momentum_direction === "bearish" || BEARISH_LABELS.has(t.momentum_label);
}

// Detects stale bullish prose in a causal_narrative that belongs to a now-bearish theme.
// A theme can flip direction while the API narrative lags — this prevents that text
// from surfacing on a Risk card.
const STALE_BULLISH_RE = /\b(strong(?:ly)?|growing|improving|improvement|uplift|tailwind|recovering|recovery|upgrade|expanding|benefiting|accelerating|supporting|supporting|durable|resilient|positive)\b/i;
function hasBullishProse(text: string): boolean {
  return STALE_BULLISH_RE.test(text);
}

/**
 * Sector-name pattern used to detect when an effect string opens with a named
 * sector that is NOT the industry currently being described.
 */
const SECTOR_NAME_RE = /^(Financials?|Banks?|Insurance|Utilities?|Consumer|Healthcare|Technology|Tech|Energy|Industrials?|Materials?|Real Estate|Communication|Aerospace|Defense|Semiconductor|Software|Retail|Transport|Automotive|Pharma)\b/i;

/**
 * Converts theme intelligence into a short economic noun phrase describing the
 * underlying mechanism. Never exposes the internal theme label. Extracts the
 * causal subject by detecting the first main verb in causal_narrative; falls
 * back to macro factor / industry combinations.
 */
function describeThemeImpact(theme: ThemeIntelligence): string {
  const causal = theme.causal_narrative;
  if (causal && !causal.includes(" → ") && causal.length >= 20) {
    const end      = causal.indexOf(".");
    const sentence = (end > 15 ? causal.slice(0, end) : causal.slice(0, 100)).trim();
    const words    = sentence.split(/\s+/);
    const verbAt   = words.findIndex((w, i) =>
      i >= 1 &&
      /^(is|are|has|have|continues?|remains?|drives?|creates?|pushes?|compresses?|expands?|reduces?|increases?|supports?|pressures?|causes?|lifts?|cuts?|raises?|lowers?|enables?|limits?)s?$/i.test(w)
    );
    if (verbAt >= 2 && verbAt <= 7) {
      const p = words.slice(0, verbAt).join(" ");
      return p.charAt(0).toLowerCase() + p.slice(1);
    }
    if (words.length >= 4) {
      const p = words.slice(0, 4).join(" ");
      return p.charAt(0).toLowerCase() + p.slice(1);
    }
  }
  const ind0   = (theme.related_industries   ?? [])[0];
  const macro0 = (theme.related_macro_factors ?? [])[0];
  if (macro0 && ind0) return `${macro0.toLowerCase()} conditions in ${ind0}`;
  if (macro0)          return `${macro0.toLowerCase()} conditions`;
  if (ind0)            return `${ind0} sector dynamics`;
  return "sector-level demand trends";
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
 * Sector-focused explanation for opportunity cards.
 * Prioritises causal_narrative, falls back to template.
 */
function deriveOpportunityExplanation(theme: ThemeIntelligence): string {
  // Only use prose from API fields when the theme is directionally bullish.
  // Prevents bearish causal_narrative text from appearing on an Opportunity card.
  if (isThemeBullish(theme)) {
    const causal = causalSentence(theme.causal_narrative);
    if (causal && causal.length > 20) return causal;
  }

  const ind0    = (theme.related_industries ?? [])[0] ?? "the sector";
  const ind1    = (theme.related_industries ?? [])[1];
  const eff0    = (theme.second_order_effects ?? [])[0];
  const persist = theme.persistence_cycles ?? 0;
  const breadth = theme.breadth_score ?? 0;
  const delta   = theme.momentum_delta ?? 0;

  // Use first complete sentence of effect text only when directionally bullish.
  if (isThemeBullish(theme) && eff0 && !isRawChain(eff0)) {
    const s = firstSentence(eff0);
    if (s && s.length > 20) return s;
  }

  if (theme.momentum_label === "accelerating") {
    if (ind1)
      return `${ind0} and ${ind1} are both seeing earnings upgrades as the driver picks up pace, with order and pricing data aligned across the supply chain.`;
    if (persist >= 5)
      return `${ind0} has seen ${persist} consecutive periods of earnings upgrades without reverting. The trend has duration and is not a single-quarter anomaly.`;
    if (breadth >= 70)
      return `${ind0} is benefiting with unusually broad participation. Earnings improvement is distributed across the sector rather than concentrated in a few names.`;
    return `${ind0} earnings estimates are being revised higher, with both top-line growth and margin assumptions moving in the same direction.`;
  }

  if (theme.cross_category_confirmed) {
    if (ind1)
      return `Cross-sector confirmation is visible in both ${ind0} and ${ind1} order and pricing data, indicating the demand driver is not yet reflected in consensus estimates.`;
    return `${ind0} is the primary beneficiary, with cross-sector data confirming the driver is active beyond a single vertical.`;
  }

  if (theme.momentum_label === "strengthening") {
    if (persist >= 4)
      return `${ind0} has seen ${persist} consecutive periods of improving earnings. Persistence at this length typically reflects a durable demand shift.`;
    if (delta >= 15)
      return `${ind0} earnings revisions are inflecting sharply. The rate of change is picking up and capital spending in related sectors is following.`;
    return `${ind0} is seeing incremental earnings upgrades. The improvement is measured but consistent.`;
  }

  if (theme.momentum_label === "emerging")
    return `${ind0} is showing early evidence of ${describeThemeImpact(theme)} exposure. Supply chains and order books are beginning to reflect it at low penetration.`;

  return `${ind0} earnings have direct exposure to ${describeThemeImpact(theme)}. The primary mechanism is a shift in end-demand rather than multiple expansion.`;
}

/**
 * Sector-focused explanation for risk cards.
 * Prioritises causal_narrative, falls back to template.
 */
function deriveRiskExplanation(theme: ThemeIntelligence): string {
  // Only use prose from API fields when the theme is directionally bearish AND the
  // narrative text itself reads as bearish. Stale bullish causal_narratives can
  // persist after a theme flips to reversing/cooling.
  if (isThemeBearish(theme)) {
    const causal = causalSentence(theme.causal_narrative);
    if (causal && causal.length > 20 && !hasBullishProse(causal)) return causal;
  }

  const ind0    = (theme.related_industries ?? [])[0] ?? "the sector";
  const ind1    = (theme.related_industries ?? [])[1];
  const eff0    = (theme.second_order_effects ?? [])[0];
  const persist = theme.persistence_cycles ?? 0;

  // Use first complete sentence of effect text only when directionally bearish.
  if (isThemeBearish(theme) && eff0 && !isRawChain(eff0)) {
    const s = firstSentence(eff0);
    if (s && s.length > 20) return s;
  }

  if (theme.momentum_label === "reversing") {
    if (ind1)
      return `${ind0} and ${ind1} earnings estimates are both being cut as ${describeThemeImpact(theme)} enters reversal. The original thesis is unwinding faster than consensus expected.`;
    return `${ind0} earnings estimates are being cut as ${describeThemeImpact(theme)} reverses. The initial thesis is unwinding, with margin assumptions most exposed.`;
  }

  if (theme.momentum_label === "cooling") {
    if (persist >= 3)
      return `${ind0} has seen ${persist} consecutive periods of falling earnings estimates. The softness is persistent rather than cyclical noise.`;
    return `${ind0} earnings estimates are being marked down. Demand assumptions that supported the original thesis are no longer holding.`;
  }

  if (!(theme.cross_category_confirmed) && (theme.breadth_score ?? 0) < 40)
    return `${ind0} weakness is concentrated in a small number of names and has not yet spread across the broader sector.`;

  return `${ind0} earnings are exposed to ${describeThemeImpact(theme)} weakness. Margin assumptions are the most vulnerable.`;
}

/**
 * One-sentence footer: synthesises the top opportunity sector and top risk sector.
 * Max 22 words, no em dashes, no theme names.
 */
function deriveOneSentence(
  opps:            BriefingOpportunity[],
  risks:           BriefingRisk[],
  ms:              MarketState,
  balance:          SignalBalance,
  _effectiveRegime: RiskRegime,
): string {
  const { ratesRegime } = ms;
  const topOpp  = opps[0]?.theme;
  const topRisk = risks[0]?.theme;

  const oppInd  = topOpp  ? (topOpp.related_industries  ?? [])[0] : null;
  const riskInd = topRisk ? (topRisk.related_industries ?? [])[0] : null;

  const genuineRisk = !!topRisk && (
    topRisk.momentum_label === "reversing" ||
    topRisk.momentum_label === "cooling" ||
    (topRisk.momentum_delta ?? 0) < 0
  );

  const cap22 = (s: string): string => {
    const t = s.endsWith(".") ? s : s + ".";
    const w = t.split(/\s+/);
    return w.length <= 22 ? w.join(" ") : w.slice(0, 22).join(" ") + ".";
  };

  if (oppInd && riskInd && genuineRisk) {
    const riskVerb = topRisk!.momentum_label === "reversing" ? "compression" : "weakness";
    return cap22(`${oppInd} resilience is offsetting ${riskInd} ${riskVerb}, leaving the market constructive but uneven.`);
  }

  if (oppInd && genuineRisk) {
    return cap22(`${oppInd} is advancing even as other areas of the market soften.`);
  }

  if (oppInd) {
    if (ratesRegime === "rising")
      return cap22(`${oppInd} is outperforming despite rising yields, supported by earnings revisions.`);
    return cap22(`${oppInd} is leading the earnings revision cycle as adjacent sectors have yet to confirm.`);
  }

  if (balance.netSignal >= 3)
    return cap22(`More sectors are seeing upgrades than cuts, with earnings revision momentum tilted positive.`);
  if (balance.netSignal <= -3)
    return cap22(`Earnings cuts outnumber upgrades. The pressure is broad-based rather than sector-specific.`);
  if (ratesRegime === "rising")
    return cap22(`The market is mixed. Rising yields are compressing rate-sensitive valuations.`);
  return cap22(`The market is mixed, with earnings momentum split across sectors.`);
}

// ── Public driver label ───────────────────────────────────────────────────────

const KNOWN_DRIVER_LABELS: Record<string, string> = {
  "Higher-for-Longer Repricing":   "Interest Rates",
  "Grid Bottleneck Trade":          "Power Infrastructure",
  "Baseload Scarcity Premium":      "Utility Capacity",
  "Credit Transmission Breakdown":  "Bank Credit Conditions",
  "Metabolic Disease Repricing":    "Healthcare Demand Shift",
  "Crypto Market Structure":        "Digital Asset Flows",
  "Non-Bank Lending Ascendancy":    "Private Credit",
  "PBOC Easing Rotation":           "China Policy Support",
  "NATO Rearmament Cycle":          "Defense Spending",
  "Silicon Sovereignty Capex":      "Semiconductor Capex",
};

// Maps terminal-style macro factor names to public-facing labels.
// Covers Bloomberg/Refinitiv shorthand that should not appear in the UI.
const MACRO_FACTOR_LABELS: Record<string, string> = {
  "WTI Spot":                          "Oil Prices",
  "WTI Spot Price":                    "Oil Prices",
  "WTI Crude":                         "Oil Prices",
  "Brent Crude":                       "Oil Prices",
  "Brent Crude Price":                 "Oil Prices",
  "10Y Yield":                         "Treasury Yields",
  "10-Year Yield":                     "Treasury Yields",
  "10Y Treasury":                      "Treasury Yields",
  "10Y Treasury Yield":                "Treasury Yields",
  "US 10-Year Treasury Yield":         "Treasury Yields",
  "US10Y":                             "Treasury Yields",
  "2Y Yield":                          "Short-Term Rates",
  "2-Year Yield":                      "Short-Term Rates",
  "SOFR":                              "Short-Term Rates",
  "Fed Funds Rate":                    "Policy Rates",
  "Federal Funds Rate":                "Policy Rates",
  "FOMC":                              "Fed Policy",
  "Credit Spreads":                    "Credit Conditions",
  "HY Spreads":                        "Credit Conditions",
  "High Yield Spreads":                "Credit Conditions",
  "Investment Grade Spreads":          "Credit Conditions",
  "IG Spreads":                        "Credit Conditions",
  "OAS":                               "Credit Conditions",
  "DXY":                               "Dollar Strength",
  "USD Index":                         "Dollar Strength",
  "USD/CNY":                           "China FX Policy",
  "USD/JPY":                           "Yen Positioning",
  "EUR/USD":                           "Euro Conditions",
  "CPI":                               "Inflation",
  "PCE":                               "Inflation",
  "Core PCE":                          "Core Inflation",
  "Core CPI":                          "Core Inflation",
  "NFP":                               "Employment Data",
  "Nonfarm Payrolls":                  "Employment Data",
  "Initial Claims":                    "Employment Trends",
  "VIX":                               "Market Volatility",
  "Natural Gas":                       "Natural Gas Prices",
  "Henry Hub":                         "Natural Gas Prices",
  "M2":                                "Money Supply",
  "Repo Rate":                         "Liquidity Conditions",
};

function cleanMacroLabel(raw: string): string {
  const trimmed = raw.trim();
  const exact   = MACRO_FACTOR_LABELS[trimmed];
  if (exact) return exact;
  // Normalise common suffixes before lookup
  const normalised = trimmed.replace(/\s+(price|yield|rate|index|spot)s?$/i, "").trim();
  const norm        = MACRO_FACTOR_LABELS[normalised];
  if (norm) return norm;
  // Cap at 3 words to avoid very long raw labels
  const words = trimmed.split(/\s+/);
  return words.length <= 3 ? trimmed : words.slice(0, 3).join(" ");
}

/**
 * Returns a clean public-facing driver label. Checks known mappings first,
 * then derives from related_macro_factors / related_industries.
 * Never returns the raw internal theme name.
 */
function getPublicDriverLabel(theme: ThemeIntelligence): string {
  const canonical = chainTerminal(theme.name);
  const known     = KNOWN_DRIVER_LABELS[canonical];
  if (known) return known;

  const macro0 = (theme.related_macro_factors ?? [])[0];
  const ind0   = (theme.related_industries   ?? [])[0];
  if (macro0) return cleanMacroLabel(macro0);
  if (ind0)   return ind0;

  const causal = theme.causal_narrative;
  if (causal && !causal.includes(" → ") && causal.length >= 20) {
    const words = causal.split(/\s+/);
    if (words.length >= 2) return words.slice(0, 3).join(" ");
  }
  return "Macro Driver";
}

// ── Main component ────────────────────────────────────────────────────────────

interface IntelligenceStripProps {
  themes: ThemeIntelligence[];
  prefs?: UserPrefs;
}

export function IntelligenceStrip({ themes, prefs }: IntelligenceStripProps) {
  const ms = useMarketState();

  // Preference boosts — applied to Opportunity / Risk / Leaders selection so the
  // strip is personalized toward followed themes/sectors. No-ops when prefs absent.
  const themeBoost = useMemo<(t: ThemeIntelligence) => number>(() => {
    if (!prefs) return () => 0;
    const m = new Map(themes.map(t => [t.id, themePreferenceScore(t, prefs)]));
    return (t: ThemeIntelligence) => m.get(t.id) ?? 0;
  }, [themes, prefs]);

  const industryBoost = useMemo<(industry: string) => number>(() => {
    if (!prefs) return () => 0;
    const m = new Map<string, number>();
    for (const t of themes) {
      const s = themePreferenceScore(t, prefs);
      if (s <= 0) continue;
      for (const ind of (t.related_industries ?? [])) {
        m.set(ind, Math.max(m.get(ind) ?? 0, s));
      }
    }
    return (industry: string) => m.get(industry) ?? 0;
  }, [themes, prefs]);

  const scorecard  = useMemo(() => computeScorecard(themes),        [themes]);
  const opps       = useMemo(() => computeOpportunities(themes, 2, themeBoost), [themes, themeBoost]);
  const risks      = useMemo(() => computeRisks(themes, 2, themeBoost),         [themes, themeBoost]);
  const rotation   = useMemo(() => computeIndustryRotation(themes, 6, industryBoost), [themes, industryBoost]);
  const balance    = useMemo(() => computeSignalBalance(themes, scorecard), [themes, scorecard]);
  const changes    = useMemo(() => computeTodaysChanges(themes, rotation), [themes, rotation]);
  const conviction = useMemo(() => computeConvictionTier(themes, scorecard, balance), [themes, scorecard, balance]);

  if (themes.length === 0) return null;

  // Deduplicate: if a sector already heads the Opportunity column, exclude it from Risk
  const oppSectors = new Set(
    opps.map(o => (o.theme.related_industries ?? [])[0]).filter(Boolean) as string[]
  );
  const deduplicatedRisks = risks.filter(r => {
    const s = (r.theme.related_industries ?? [])[0];
    return !s || !oppSectors.has(s);
  });

  const effectiveRegime = deriveEffectiveRegime(ms.riskRegime, balance, scorecard);
  const regimeColor     = REGIME_COLOR[effectiveRegime]    ?? "#8898b8";
  const regimeHeadline  = REGIME_HEADLINE[effectiveRegime] ?? "Neutral Market";
  const oneSentence     = sanitize(deriveOneSentence(opps, deduplicatedRisks, ms, balance, effectiveRegime));

  const leaders  = rotation.filter(r => r.delta > 0).slice(0, 3);
  const laggards = rotation.filter(r => r.delta < 0).slice(0, 3);

  // Evidence-first regime read: lead with the data, then one conclusion.
  const bullishSectors  = leaders.map(l => l.industry).slice(0, 4);
  const bearishSectors  = laggards.map(l => l.industry).slice(0, 4);
  const sectorsTouched  = new Set(themes.flatMap(t => t.related_industries ?? []));
  const breadthScore    = Math.round(100 * Math.min(sectorsTouched.size, 12) / 12);
  const convictionScore = themes.length
    ? Math.round(themes.reduce((s, t) => s + (t.confidence ?? 0), 0) / themes.length)
    : 0;

  // Pre-compute rotation explanations with a shared deduplication set so the
  // same effect sentence cannot appear for two different industries.
  const usedRotationExpls = new Set<string>();
  const leaderExpls  = leaders.map(sig  => sanitize(deriveRotationExplanation(sig, themes, true,  usedRotationExpls)));
  const laggardExpls = laggards.map(sig => sanitize(deriveRotationExplanation(sig, themes, false, usedRotationExpls)));

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

      {/* ══ SECTION 1. Market Regime (evidence-first) ════════════════════════ */}
      <div className="px-5 pt-5 pb-4" style={DIV}>

        {/* Label row: regime chip + conviction tier */}
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-[7px] font-bold uppercase tracking-[0.28em] shrink-0"
              style={{ color: "rgba(255,255,255,0.32)" }}
            >
              Market Regime
            </span>
            <span
              className="text-[9px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded truncate"
              style={{ color: regimeColor, background: `${regimeColor}1c` }}
            >
              {regimeHeadline}
            </span>
          </div>
          <span
            className="text-[8px] font-semibold px-2 py-0.5 rounded-full shrink-0"
            style={{ color: regimeColor, background: `${regimeColor}18`, letterSpacing: "0.03em" }}
          >
            {conviction}
          </span>
        </div>

        {/* Evidence grid. Lead with the data, not the narrative */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 mb-3.5">
          <RegimeEvidence
            label="Bullish Sectors" accent="#10B981"
            value={bullishSectors.length ? bullishSectors.join(" · ") : "None"}
          />
          <RegimeEvidence
            label="Bearish Sectors" accent="#EF4444"
            value={bearishSectors.length ? bearishSectors.join(" · ") : "None"}
          />
          <RegimeEvidence
            label="Breadth" accent="#52b0c8"
            value={`${breadthScore}`} suffix="/100"
            sub={`${balance.bullish}↑  ${balance.bearish}↓`}
          />
          <RegimeEvidence
            label="Conviction" accent={regimeColor}
            value={`${convictionScore}`} suffix="/100" sub={conviction}
          />
        </div>

        {/* Single concise conclusion */}
        <p
          className="leading-relaxed"
          style={{
            fontSize: "12.5px", color: "rgba(255,255,255,0.66)",
            paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {oneSentence}
        </p>

      </div>

      {/* ══ SECTION 2. What Changed Today ════════════════════════════════════ */}
      {(changesUp.length > 0 || changesDown.length > 0) && (
        <div className="px-5 py-3" style={DIV}>
          <p
            className="text-[7px] font-bold uppercase tracking-[0.28em] mb-2"
            style={{ color: "rgba(255,255,255,0.26)" }}
          >
            {"Today's Changes"}
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

      {/* ══ SECTION 3. Opportunities vs Risks ════════════════════════════════ */}
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
            {deduplicatedRisks.map((risk, i) => (
              <ThemeEntry key={i} theme={risk.theme} isOpp={false} />
            ))}
          </div>
        </div>

      </div>

      {/* ══ SECTION 4. Rotation Dashboard ═══════════════════════════════════ */}
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
              {leaders.map((sig, i) => <RotationRow key={i} sig={sig} expl={leaderExpls[i]} />)}
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
              {laggards.map((sig, i) => <RotationRow key={i} sig={sig} expl={laggardExpls[i]} />)}
              {laggards.length === 0 && (
                <p className="text-[10.5px]" style={{ color: "rgba(255,255,255,0.20)" }}>
                  No laggards identified
                </p>
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}

// ── Regime evidence cell ──────────────────────────────────────────────────────

function RegimeEvidence({
  label, value, accent, suffix, sub,
}: { label: string; value: string; accent: string; suffix?: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p
        className="text-[7.5px] font-bold uppercase tracking-[0.18em] mb-1 truncate"
        style={{ color: accent, opacity: 0.9 }}
      >
        {label}
      </p>
      <p
        className="text-[12.5px] font-semibold leading-tight truncate"
        style={{ color: "rgba(255,255,255,0.88)" }}
      >
        {value}
        {suffix && (
          <span className="text-[9px] font-normal" style={{ color: "rgba(255,255,255,0.32)" }}>
            {suffix}
          </span>
        )}
      </p>
      {sub && (
        <p className="text-[8.5px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.38)" }}>
          {sub}
        </p>
      )}
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
        {sanitize(change.text)}
      </p>
    </div>
  );
}

// ── Theme entry (opportunity / risk) ─────────────────────────────────────────

function ThemeEntry({ theme, isOpp }: { theme: ThemeIntelligence; isOpp: boolean }) {
  const accentColor  = isOpp ? "#10B981" : "#EF4444";
  // Title: the industry/sector where capital should be positioned (or risk avoided)
  const industryTitle = (theme.related_industries ?? [])[0] ?? getPublicDriverLabel(theme);
  const explanation   = sanitize(isOpp
    ? deriveOpportunityExplanation(theme)
    : deriveRiskExplanation(theme));

  return (
    <div>
      {/* Industry / sector. Dominant, actionable title */}
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
      {/* Public driver label. Never exposes raw internal theme name */}
      <p
        className="text-[9px] font-medium truncate"
        style={{ color: "rgba(255,255,255,0.32)" }}
      >
        {`Driver: ${getPublicDriverLabel(theme)}`}
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
  sig:       IndustryRotationSignal,
  themes:    ThemeIntelligence[],
  isLeader:  boolean,
  usedTexts: Set<string>,
): string {
  const related = themes
    .filter(t => (t.related_industries ?? []).includes(sig.industry))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  const top  = related[0];
  const top2 = related[1];

  if (!top) {
    return isLeader
      ? `${sig.industry} is outperforming as sector-level demand and earnings data reinforce each other.`
      : `${sig.industry} is underperforming as the earnings and demand case weakens.`;
  }

  const ml      = top.momentum_label;
  const persist = top.persistence_cycles ?? 0;
  const pdays   = top.persistence_days   ?? 0;
  const breadth = Math.round(top.breadth_score ?? 0);

  const toShort = (text: string): string => {
    const s   = text.trim();
    const dot = s.indexOf(".");
    // Return only the first complete sentence; never cut mid-sentence.
    if (dot > 15) return s.slice(0, dot + 1);
    return s.endsWith(".") ? s : s + ".";
  };

  // Rotation rows answer "why outperforming/underperforming right now?"
  // Pull from second_order_effects — skip causal_narrative (used by opp/risk cards).
  // Only use an effect string if it has not already been used by another industry
  // in this render pass — prevents duplicate explanations across rotation rows.
  const hasCausal = !!causalSentence(top.causal_narrative);
  const effStart  = hasCausal ? 0 : 1;
  const eff = (top.second_order_effects ?? []).slice(effStart)
    .find(e => e && !isRawChain(e) && e.length >= 15);
  if (eff) {
    const candidate = toShort(eff);
    // Reject effect text that opens with a recognised sector name other than the
    // one being described — prevents "Financials face pressure" appearing under
    // Utilities, or "Consumer" explanations appearing under Aerospace.
    const sectorMatch = SECTOR_NAME_RE.exec(candidate);
    const sigWord     = sig.industry.split(/[\s,/(]+/)[0];
    const isRelevant  = !sectorMatch ||
      sectorMatch[0].toLowerCase() === sigWord.toLowerCase();

    if (isRelevant && !usedTexts.has(candidate)) {
      usedTexts.add(candidate);
      return candidate;
    }
    // Wrong-industry text or already used — fall through to industry-named template.
  }

  // All templates include sig.industry so they are inherently unique per row.
  if (isLeader) {
    if (ml === "accelerating") {
      if (top2) return `${sig.industry} revenue is rising as order rates and pricing both improve at the same time.`;
      if (top.cross_category_confirmed) return `Cross-category confirmation is translating into ${sig.industry} revenue upside.`;
      if (pdays >= 10) return `${sig.industry} has outperformed for ${pdays} days as order data remains positive.`;
      if (breadth >= 70) return `${sig.industry} gains are broad-based, with improvement distributed across the sector.`;
      return `${sig.industry} revenue is rising on pricing power and volume gains.`;
    }
    if (ml === "strengthening") {
      if (top2) return `${sig.industry} revenue outlook is improving on normalising input costs and recovering order rates.`;
      if (persist >= 4) return `${sig.industry} has outperformed for ${persist} consecutive periods as financing costs ease.`;
      return `${sig.industry} margins are widening as the cost structure normalises.`;
    }
    if (ml === "emerging") {
      return `${sig.industry} is seeing first procurement orders as institutional adoption begins.`;
    }
    if (top2) return `${sig.industry} is benefiting from improving demand across multiple fronts.`;
    return `${sig.industry} is outperforming as demand shifts in the sector's favour.`;
  } else {
    if (ml === "reversing") {
      if (top2) return `${sig.industry} margin guidance is being cut as pricing power erodes while input costs stay elevated.`;
      return `${sig.industry} is underperforming as pricing assumptions are being walked back.`;
    }
    if (ml === "cooling") {
      if (top2) return `${sig.industry} is under pressure as order rates slow across the supply chain.`;
      if (persist >= 3) return `${sig.industry} has underperformed for ${persist} consecutive periods as order rates slow.`;
      return `${sig.industry} is under pressure as end-demand weakens faster than supply is adjusting.`;
    }
    if (top2) return `Revenue estimates for ${sig.industry} are being cut as both volume and pricing assumptions are revised lower.`;
    return `${sig.industry} is underperforming as sector pricing power erodes.`;
  }
}

function RotationRow({
  sig, expl,
}: { sig: IndustryRotationSignal; expl: string }) {
  const isPos = sig.delta > 0;
  const color = isPos ? "#10B981" : "#EF4444";

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
