/**
 * themeImpact.ts — Deterministic Theme Impact Engine
 *
 * Pure functions, zero API calls. Derives cross-asset impact, beneficiary/
 * headwind classification, industry theme drivers, and leaderboard rankings
 * from existing ThemeIntelligence fields.
 *
 * Impact Score (-100 → +100):
 *   Uses relationship_weights[industryName] when available (direct relationship
 *   data), otherwise infers from momentum_direction × signal_strength × confidence.
 *
 * Cross-Asset Impact:
 *   Keyword-matches related_macro_factors + name/description against 5 asset
 *   classes, applies directional inference from momentum_direction.
 *
 * Beneficiaries / Headwinds:
 *   related_assets classified by momentum_direction.
 *
 * Leaderboard:
 *   Three ranked lists: Strongest (signal), Accelerating (momentum), Weakening.
 */

import type { ThemeIntelligence } from "./types";
import { computeThemeMomentum } from "./themeMomentum";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ThemeImpactScore {
  themeId:      string;
  themeName:    string;
  impactScore:  number;            // -100 to +100
  direction:    "bullish" | "bearish" | "neutral";
  signalScore:  number;
  momentumScore: number;
}

export interface CrossAssetImpact {
  label:     string;               // "Equities" | "Rates" | "Credit" | "USD" | "Commodities"
  direction: "positive" | "negative" | "neutral";
  magnitude: number;               // 0–100
}

export interface ThemeLeaderboard {
  strongest:    ThemeIntelligence[];  // top by signal score
  accelerating: ThemeIntelligence[];  // momentumScore > 20
  weakening:    ThemeIntelligence[];  // momentumScore < -20
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── computeThemeImpactScore ───────────────────────────────────────────────────

/**
 * Impact score for a theme on a specific industry: -100 to +100.
 * Positive = bullish tailwind; negative = bearish headwind.
 */
export function computeThemeImpactScore(
  theme:        ThemeIntelligence,
  industryName: string,
): number {
  const rel = (theme.relationship_weights ?? {})[industryName];
  let score: number;

  if (rel) {
    // Direct relationship data is the authoritative signal
    const dirSign = rel.direction === "positive" ? 1 : rel.direction === "negative" ? -1 : 0;
    score = rel.weight * dirSign * 100;
  } else {
    // Infer from momentum_direction × signal_strength × confidence
    const dirSign = theme.momentum_direction === "bullish" ? 1 :
                    theme.momentum_direction === "bearish" ? -1 : 0;
    const strengthMult = theme.signal_strength === "strong" ? 1.0 :
                         theme.signal_strength === "medium" ? 0.65 : 0.35;
    score = dirSign * strengthMult * (theme.confidence ?? 50);
  }

  const deltaNudge = clamp((theme.momentum_delta ?? 0) * 0.3, -10, 10);
  return Math.round(clamp(score + deltaNudge, -100, 100));
}

// ── getIndustryThemeDrivers ───────────────────────────────────────────────────

/**
 * Top themes driving a specific industry, ranked by |impactScore|.
 * Matches themes whose related_industries contains the industry name
 * (case-insensitive substring).
 */
export function getIndustryThemeDrivers(
  industryName: string,
  themes:       ThemeIntelligence[],
  limit         = 3,
): ThemeImpactScore[] {
  const indLow = industryName.toLowerCase();

  return themes
    .filter(t =>
      (t.related_industries ?? []).some(i => {
        const iL = i.toLowerCase();
        return iL.includes(indLow) || indLow.includes(iL);
      }),
    )
    .map(t => {
      const impactScore = computeThemeImpactScore(t, industryName);
      let signalScore = 0;
      let momentumScore = 0;
      try {
        const m   = computeThemeMomentum(t);
        signalScore   = m.signalScore;
        momentumScore = m.momentumScore;
      } catch {}
      return {
        themeId:      t.id,
        themeName:    t.name,
        impactScore,
        direction:    t.momentum_direction,
        signalScore,
        momentumScore,
      };
    })
    .sort((a, b) => Math.abs(b.impactScore) - Math.abs(a.impactScore))
    .slice(0, limit);
}

// ── Beneficiaries & Headwinds ─────────────────────────────────────────────────

/** Assets that benefit from this theme (bullish → all assets; neutral → first half). */
export function getThemeBeneficiaries(theme: ThemeIntelligence): string[] {
  const assets = theme.related_assets ?? [];
  if (theme.momentum_direction === "bullish") return assets.slice(0, 6);
  if (theme.momentum_direction === "neutral") return assets.slice(0, Math.ceil(assets.length / 2));
  return [];
}

/** Assets hurt by this theme (bearish → all assets; neutral → second half). */
export function getThemeHeadwinds(theme: ThemeIntelligence): string[] {
  const assets = theme.related_assets ?? [];
  if (theme.momentum_direction === "bearish") return assets.slice(0, 6);
  if (theme.momentum_direction === "neutral") return assets.slice(Math.ceil(assets.length / 2));
  return [];
}

// ── computeCrossAssetImpact ───────────────────────────────────────────────────

/**
 * Derive directional cross-asset pressure from macro factors + theme direction.
 * Returns up to 4 asset-class impact entries.
 */
export function computeCrossAssetImpact(theme: ThemeIntelligence): CrossAssetImpact[] {
  const text = [
    ...(theme.related_macro_factors ?? []),
    theme.name ?? "",
    theme.description ?? "",
  ].join(" ").toLowerCase();

  const dir      = theme.momentum_direction;
  const sign     = dir === "bullish" ? 1 : dir === "bearish" ? -1 : 0;
  const strength = theme.signal_strength === "strong" ? 100 :
                   theme.signal_strength === "medium" ? 65 : 35;

  const impacts: CrossAssetImpact[] = [];

  // Equities
  const hasEquity = /equity|equit|stock|earnings|growth|capex|tech\b|ai\b|invest|spending|valuat/.test(text);
  if (hasEquity || sign !== 0) {
    impacts.push({
      label:     "Equities",
      direction: sign > 0 ? "positive" : sign < 0 ? "negative" : "neutral",
      magnitude: Math.round(strength * (hasEquity ? 1.0 : 0.55)),
    });
  }

  // Rates — direction depends on hawkish/dovish keywords, not theme direction
  const hasRates = /rate|yield|fed\b|treasury|monetary|hawkish|dovish|hike|cut rates|inflation|tighten|loosen/.test(text);
  if (hasRates) {
    const rateSign =
      /hawkish|hike|rate rise|yield rise|tighten|rates higher/.test(text)  ?  1 :
      /dovish|rate cut|yield fall|loosen|rates lower/.test(text)            ? -1 : sign;
    impacts.push({
      label:     "Rates",
      direction: rateSign > 0 ? "positive" : rateSign < 0 ? "negative" : "neutral",
      magnitude: strength,
    });
  }

  // Credit — bearish themes widen spreads; bullish leaves credit relatively neutral
  const hasCredit = /credit|spread|default|debt\b|high.?yield|leverag|bond\b|refinanc|distress/.test(text);
  if (hasCredit) {
    impacts.push({
      label:     "Credit",
      direction: sign < 0 ? "negative" : sign > 0 ? "neutral" : "neutral",
      magnitude: Math.round(strength * (sign < 0 ? 0.9 : 0.45)),
    });
  }

  // USD
  const hasUSD = /dollar\b|usd\b|dxy\b|currency|forex|fx\b|reserve currency|devaluation/.test(text);
  if (hasUSD) {
    impacts.push({
      label:     "USD",
      direction: sign > 0 ? "positive" : sign < 0 ? "negative" : "neutral",
      magnitude: Math.round(strength * 0.70),
    });
  }

  // Commodities
  const hasComm = /\boil\b|gold|copper|energy|commodity|commodities|supply.chain|resource|metal|crude|natural gas/.test(text);
  if (hasComm) {
    impacts.push({
      label:     "Commodities",
      direction: sign > 0 ? "positive" : sign < 0 ? "negative" : "neutral",
      magnitude: strength,
    });
  }

  // Always show at least Equities
  if (impacts.length === 0) {
    impacts.push({
      label:     "Equities",
      direction: sign > 0 ? "positive" : sign < 0 ? "negative" : "neutral",
      magnitude: Math.round(strength * 0.50),
    });
  }

  return impacts.slice(0, 4);
}

// ── getThemeLeaderboard ───────────────────────────────────────────────────────

/** Three ranked theme lists for terminal leaderboard display. */
export function getThemeLeaderboard(themes: ThemeIntelligence[]): ThemeLeaderboard {
  const scored = themes.map(t => {
    let momentumScore = 0;
    let signalScore   = 0;
    try {
      const m   = computeThemeMomentum(t);
      momentumScore = m.momentumScore;
      signalScore   = m.signalScore;
    } catch {}
    return { theme: t, momentumScore, signalScore };
  });

  const strongest = [...scored]
    .sort((a, b) => b.signalScore - a.signalScore)
    .slice(0, 3)
    .map(x => x.theme);

  const accelerating = [...scored]
    .filter(x => x.momentumScore > 20)
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, 3)
    .map(x => x.theme);

  const weakening = [...scored]
    .filter(x => x.momentumScore < -20)
    .sort((a, b) => a.momentumScore - b.momentumScore)
    .slice(0, 3)
    .map(x => x.theme);

  return { strongest, accelerating, weakening };
}
