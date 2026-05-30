/**
 * themeSignalDelta.ts — Theme Change Detection & Intelligence Generation
 *
 * Pure functions, zero API calls. All outputs derived from a single
 * ThemeIntelligence snapshot using momentum_delta as the rate-of-change proxy.
 *
 * Signal Deltas:
 *   Discrete change events derived from momentum_delta, breadth_score,
 *   persistence_score, and momentum_label.
 *
 * Weekly Change Narrative:
 *   Institutional-quality prose generated from data fields — template-based,
 *   not hallucinated. Describes change, not theme definition.
 *
 * Industry Exposure Ranking:
 *   Ranks related_industries by computed impact score.
 *
 * Asset Exposure:
 *   Tickers with directional score and source reason.
 *
 * Change Leaderboard:
 *   Four ranked lists based on delta and breadth change:
 *   Risers · Decliners · Broadening · Narrowing
 */

import type { ThemeIntelligence } from "./types";
import { computeThemeImpactScore } from "./themeImpact";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SignalDelta {
  category:  string;                        // "Signal" | "Momentum" | "Breadth" | "Persistence"
  direction: "up" | "down";
  label:     string;                        // e.g. "+8" | "Accelerating" | "+3 industries"
  magnitude: "strong" | "moderate" | "minor";
}

export interface IndustryExposure {
  industry: string;
  score:    number;                         // -100 to +100
}

export interface AssetExposure {
  ticker: string;
  score:  number;                           // -100 to +100 (sign = direction)
  reason: string;                           // source theme name or driver
}

export interface ThemeChangeLeaderboard {
  risers:     ThemeIntelligence[];          // highest positive momentum_delta
  decliners:  ThemeIntelligence[];          // lowest negative momentum_delta
  broadening: ThemeIntelligence[];          // highest breadth + cross_category bonus
  narrowing:  ThemeIntelligence[];          // lowest breadth + negative delta
}

// ── computeSignalDeltas ───────────────────────────────────────────────────────

/**
 * Derive meaningful change signals from a single snapshot.
 * Only emits events above meaningful thresholds — hides noise.
 */
export function computeSignalDeltas(theme: ThemeIntelligence): SignalDelta[] {
  const delta      = theme.momentum_delta    ?? 0;
  const breadth    = theme.breadth_score     ?? 0;
  const persist    = theme.persistence_score ?? 0;
  const cycles     = theme.persistence_cycles ?? 0;
  const momentum   = theme.momentum_label;
  const confirmed  = theme.cross_category_confirmed;
  const out: SignalDelta[] = [];

  // ── Signal delta ────────────────────────────────────────────────────────────
  const absDelta = Math.abs(delta);
  if (absDelta >= 14) {
    out.push({
      category:  "Signal",
      direction: delta > 0 ? "up" : "down",
      magnitude: "strong",
      label:     `${delta > 0 ? "+" : ""}${delta.toFixed(0)}`,
    });
  } else if (absDelta >= 6) {
    out.push({
      category:  "Signal",
      direction: delta > 0 ? "up" : "down",
      magnitude: "moderate",
      label:     `${delta > 0 ? "+" : ""}${delta.toFixed(0)}`,
    });
  }

  // ── Momentum state ──────────────────────────────────────────────────────────
  if (momentum === "accelerating") {
    out.push({ category: "Momentum", direction: "up", magnitude: "strong", label: "Accelerating" });
  } else if (momentum === "strengthening") {
    out.push({ category: "Momentum", direction: "up", magnitude: "moderate", label: "Strengthening" });
  } else if (momentum === "reversing") {
    out.push({ category: "Momentum", direction: "down", magnitude: "strong", label: "Reversing" });
  } else if (momentum === "cooling" && delta < -4) {
    out.push({ category: "Momentum", direction: "down", magnitude: "moderate", label: "Cooling" });
  }

  // ── Breadth change ──────────────────────────────────────────────────────────
  if (confirmed && delta > 5) {
    out.push({ category: "Breadth", direction: "up", magnitude: "strong", label: "Cross-Sector" });
  } else if (breadth >= 72 && delta > 0) {
    const indCount = Math.max(1, Math.round(breadth / 20));
    out.push({
      category:  "Breadth",
      direction: "up",
      magnitude: breadth >= 85 ? "strong" : "moderate",
      label:     `+${indCount} industries`,
    });
  } else if (breadth < 22 && delta < -4) {
    out.push({ category: "Breadth", direction: "down", magnitude: "moderate", label: "Narrowing" });
  }

  // ── Persistence ─────────────────────────────────────────────────────────────
  if (cycles >= 5 && persist >= 75 && delta >= 0) {
    out.push({ category: "Persistence", direction: "up", magnitude: "moderate", label: `${cycles} cycles` });
  } else if (persist < 20 && delta < -10) {
    out.push({ category: "Persistence", direction: "down", magnitude: "strong", label: "Degrading" });
  }

  return out.slice(0, 4);
}

// ── generateWeeklyChange ──────────────────────────────────────────────────────

/**
 * Institutional-quality change narrative derived entirely from data fields.
 * Describes what changed this period — not a re-statement of the theme definition.
 */
export function generateWeeklyChange(theme: ThemeIntelligence): string {
  const delta      = theme.momentum_delta     ?? 0;
  const momentum   = theme.momentum_label;
  const breadth    = theme.breadth_score      ?? 0;
  const persist    = theme.persistence_score  ?? 0;
  const cycles     = theme.persistence_cycles ?? 0;
  const confirmed  = theme.cross_category_confirmed;
  const direction  = theme.momentum_direction;
  const industries = (theme.related_industries ?? []).slice(0, 3);
  const effects    = (theme.second_order_effects ?? []);
  const name       = theme.name;

  const ind2 = industries.length >= 2
    ? `${industries[0]} and ${industries[1]}`
    : industries[0] ?? "tracked sectors";

  const cycleNote = cycles > 1
    ? `${cycles} consecutive cycles`
    : cycles === 1 ? "one cycle" : "initial formation";

  // ── Strong acceleration ────────────────────────────────────────────────────
  if (delta >= 15) {
    return `${name} saw a material signal acceleration this period${industries.length > 0 ? `, broadening into ${ind2}` : ""}. ${confirmed ? "Cross-category confirmation strengthened the case for continued expansion." : `Delta of +${delta.toFixed(0)} vs prior cycle, with breadth at ${breadth}.`}${effects[0] ? ` Second-order: ${effects[0]}.` : ""}`;
  }

  // ── Moderate strengthening ─────────────────────────────────────────────────
  if (delta >= 7) {
    return `Signal in ${name} continued to build${industries.length > 0 ? `, with particular depth in ${industries[0]}` : ""}. The theme has sustained ${cycleNote} of track record and carries a delta of +${delta.toFixed(0)} vs the prior period.${effects[0] ? ` ${effects[0]}.` : ""}`;
  }

  // ── Sharp deterioration ────────────────────────────────────────────────────
  if (delta <= -15) {
    return `${name} experienced a material signal reversal this period. ${breadth < 40 ? "Breadth narrowed, with fewer sectors showing active exposure." : "Breadth has held up despite the momentum shift."} Persistence at ${persist}${persist > 60 ? " provides structural anchoring" : " is insufficient to prevent further deterioration"}.${effects[0] ? ` ${effects[0]}.` : ""}`;
  }

  // ── Moderate cooling ───────────────────────────────────────────────────────
  if (delta <= -7) {
    return `Momentum in ${name} softened relative to prior periods. ${ind2} remains the primary exposure vector, though signal velocity has slowed. ${cycles > 3 ? `${cycles} cycles of persistence suggests structural rather than tactical cooling.` : "Confirmation is needed to prevent further degradation."}`;
  }

  // ── Active acceleration (label-based, delta small) ─────────────────────────
  if (momentum === "accelerating") {
    return `${name} is in active acceleration${industries.length > 0 ? `, with ${ind2} as primary drivers` : ""}. ${confirmed ? "Cross-category confirmation signals a broadening rather than concentrated trade." : `Breadth at ${breadth} and persistence at ${persist} support continued development.`}${effects[0] ? ` ${effects[0]}.` : ""}`;
  }

  // ── Reversal ──────────────────────────────────────────────────────────────
  if (momentum === "reversing") {
    return `${name} is in active reversal. Signal degradation running at ${Math.abs(delta).toFixed(0)} delta per cycle. ${persist < 40 ? "Low persistence reduces the probability of mean reversion." : `Persistence at ${persist} may limit the downside.`}`;
  }

  // ── Cooling phase ──────────────────────────────────────────────────────────
  if (momentum === "cooling") {
    return `${name} has entered a cooling phase${cycles > 3 ? ` after ${cycles} cycles of sustained presence` : ""}. The signal remains intact but conviction is softening. ${breadth > 50 ? "Breadth remains supportive." : "Breadth narrowing is consistent with a late-cycle pattern."}`;
  }

  // ── Stable / emerging (default) ────────────────────────────────────────────
  const dirWord = direction === "bullish" ? "constructive" : direction === "bearish" ? "cautious" : "neutral";
  return `${name} maintained ${dirWord} signal characteristics this period${industries.length > 0 ? `, with ${ind2} as primary exposure anchors` : ""}. Persistence at ${persist} across ${cycleNote}, delta ${delta >= 0 ? "+" : ""}${delta.toFixed(0)} vs prior.${effects[0] ? ` ${effects[0]}.` : ""}`;
}

// ── computeIndustryExposureRanking ────────────────────────────────────────────

/**
 * Related industries ranked by absolute impact score.
 * Uses computeThemeImpactScore for each industry.
 */
export function computeIndustryExposureRanking(
  theme: ThemeIntelligence,
  limit = 5,
): IndustryExposure[] {
  return (theme.related_industries ?? [])
    .map(industry => ({
      industry,
      score: computeThemeImpactScore(theme, industry),
    }))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, limit);
}

// ── computeAssetExposure ──────────────────────────────────────────────────────

/**
 * Related assets with directional exposure score and source reason.
 * Score sign matches direction (positive = beneficiary, negative = headwind).
 */
export function computeAssetExposure(theme: ThemeIntelligence): AssetExposure[] {
  const assets    = theme.related_assets ?? [];
  const direction = theme.momentum_direction;
  const strength  = theme.signal_strength === "strong" ? 100 :
                    theme.signal_strength === "medium" ? 70 : 40;
  const baseScore = Math.round(strength * (theme.confidence ?? 50) / 100);
  const reason    = theme.name;

  return assets.slice(0, 6).map((ticker, i) => {
    const decay = 1 - i * 0.06;
    let score: number;
    if (direction === "bullish")  score =  Math.round(baseScore * decay);
    else if (direction === "bearish") score = -Math.round(baseScore * decay);
    else score = i < Math.ceil(assets.length / 2) ? Math.round(baseScore * decay * 0.5) : -Math.round(baseScore * decay * 0.5);
    return { ticker, score, reason };
  }).sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
}

// ── getThemeChangeLeaderboard ─────────────────────────────────────────────────

/**
 * Four ranked theme lists based on rate of change, not current state.
 * Suitable for Terminal leaderboard display.
 */
export function getThemeChangeLeaderboard(themes: ThemeIntelligence[]): ThemeChangeLeaderboard {
  const risers = [...themes]
    .filter(t => (t.momentum_delta ?? 0) > 5)
    .sort((a, b) => (b.momentum_delta ?? 0) - (a.momentum_delta ?? 0))
    .slice(0, 3);

  const decliners = [...themes]
    .filter(t => (t.momentum_delta ?? 0) < -5)
    .sort((a, b) => (a.momentum_delta ?? 0) - (b.momentum_delta ?? 0))
    .slice(0, 3);

  const broadening = [...themes]
    .filter(t => (t.breadth_score ?? 0) > 55 || t.cross_category_confirmed)
    .sort((a, b) => {
      const aS = (a.breadth_score ?? 0) + (a.cross_category_confirmed ? 15 : 0);
      const bS = (b.breadth_score ?? 0) + (b.cross_category_confirmed ? 15 : 0);
      return bS - aS;
    })
    .slice(0, 3);

  const narrowing = [...themes]
    .filter(t => (t.breadth_score ?? 0) < 30 && (t.momentum_delta ?? 0) < 0)
    .sort((a, b) => (a.breadth_score ?? 0) - (b.breadth_score ?? 0))
    .slice(0, 3);

  return { risers, decliners, broadening, narrowing };
}
