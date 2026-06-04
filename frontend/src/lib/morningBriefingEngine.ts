/**
 * morningBriefingEngine.ts — Morning Briefing Computation Layer
 *
 * Pure functions, zero API calls. All outputs derived from ThemeIntelligence[].
 * All functions are designed to always return meaningful content — tiered
 * thresholds with fallbacks prevent blank sections.
 */

import type { ThemeIntelligence } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BriefingOpportunity {
  theme: ThemeIntelligence;
  score: number;
}

export interface BriefingRisk {
  theme:    ThemeIntelligence;
  severity: number;
}

export interface MomentumTransition {
  theme:     ThemeIntelligence;
  direction: "upgrade" | "downgrade";
  label:     string;
}

export interface BriefingScorecard {
  accelerating:   number;
  strengthening:  number;
  stable:         number;
  cooling:        number;
  reversing:      number;
  emerging:       number;
  highConviction: number;
  total:          number;
}

export interface IndustryRotationSignal {
  industry: string;
  delta:    number;   // aggregated weighted delta (positive = gaining, negative = losing)
  count:    number;   // themes referencing this industry
}

export interface SignalBalance {
  bullish:    number;   // accelerating + strengthening + emerging
  bearish:    number;   // reversing + cooling
  netSignal:  number;   // bullish - bearish
  confidence: number;   // mean theme confidence (0–100)
}

export interface TodayChange {
  direction: "up" | "down";
  text:      string;
  priority:  number;
}

// ── computeScorecard ──────────────────────────────────────────────────────────

export function computeScorecard(themes: ThemeIntelligence[]): BriefingScorecard {
  return {
    accelerating:   themes.filter(t => t.momentum_label === "accelerating").length,
    strengthening:  themes.filter(t => t.momentum_label === "strengthening").length,
    stable:         themes.filter(t => t.momentum_label === "stable").length,
    cooling:        themes.filter(t => t.momentum_label === "cooling").length,
    reversing:      themes.filter(t => t.momentum_label === "reversing").length,
    emerging:       themes.filter(t => t.momentum_label === "emerging").length,
    highConviction: themes.filter(t =>
      t.confidence_label === "High Conviction" || t.confidence_label === "Elevated"
    ).length,
    total: themes.length,
  };
}

// ── computeOpportunities ──────────────────────────────────────────────────────

/**
 * Top themes by composite conviction score. Excludes active reversals.
 * Always returns up to `limit` results — no empty state.
 */
export function computeOpportunities(
  themes: ThemeIntelligence[],
  limit = 3,
): BriefingOpportunity[] {
  const MOMENTUM_BONUS: Record<string, number> = {
    accelerating:  25,
    strengthening: 18,
    emerging:      12,
    stable:         0,
    cooling:       -15,
    reversing:     -40,
  };

  return [...themes]
    .filter(t => t.momentum_label !== "reversing")
    .map(t => ({
      theme: t,
      score: (t.confidence ?? 0) +
             Math.max(t.momentum_delta ?? 0, 0) * 1.5 +
             (MOMENTUM_BONUS[t.momentum_label] ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── computeRisks ──────────────────────────────────────────────────────────────

/**
 * Top deteriorating or low-conviction themes.
 * Prefers negative delta + reversal labels; falls back to lowest confidence
 * to guarantee `limit` results.
 */
export function computeRisks(
  themes: ThemeIntelligence[],
  limit = 3,
): BriefingRisk[] {
  const severity = (t: ThemeIntelligence): number => {
    const delta    = t.momentum_delta ?? 0;
    const revBonus = t.momentum_label === "reversing" ? 35 :
                     t.momentum_label === "cooling"   ? 15 : 0;
    return Math.abs(Math.min(delta, 0)) * 1.5 +
           revBonus +
           Math.max(0, 55 - (t.confidence ?? 55));
  };

  const deteriorating = [...themes]
    .filter(t =>
      (t.momentum_delta ?? 0) < 0 ||
      t.momentum_label === "reversing" ||
      t.momentum_label === "cooling"
    )
    .map(t => ({ theme: t, severity: severity(t) }))
    .sort((a, b) => b.severity - a.severity)
    .slice(0, limit);

  if (deteriorating.length >= limit) return deteriorating;

  // Backfill with lowest-confidence non-accelerating themes
  const seen = new Set(deteriorating.map(d => d.theme.id));
  const backfill = [...themes]
    .filter(t => !seen.has(t.id) && t.momentum_label !== "accelerating")
    .map(t => ({ theme: t, severity: Math.max(0, 55 - (t.confidence ?? 55)) }))
    .sort((a, b) => b.severity - a.severity)
    .slice(0, limit - deteriorating.length);

  return [...deteriorating, ...backfill];
}

// ── detectTransitions ─────────────────────────────────────────────────────────

/** Themes undergoing meaningful momentum-label transitions this cycle. */
export function detectTransitions(themes: ThemeIntelligence[]): MomentumTransition[] {
  const out: MomentumTransition[] = [];

  for (const t of themes) {
    const label = t.momentum_label;
    const delta = t.momentum_delta ?? 0;

    if (label === "accelerating" && delta >= 10) {
      out.push({ theme: t, direction: "upgrade",   label: "→ Accelerating" });
    } else if (label === "strengthening" && delta >= 8) {
      out.push({ theme: t, direction: "upgrade",   label: "→ Strengthening" });
    } else if (label === "emerging" && delta >= 5) {
      out.push({ theme: t, direction: "upgrade",   label: "Emerging" });
    } else if (label === "reversing") {
      out.push({ theme: t, direction: "downgrade", label: "→ Reversing" });
    } else if (label === "cooling" && delta <= -10) {
      out.push({ theme: t, direction: "downgrade", label: "→ Cooling" });
    }
  }

  return out
    .sort((a, b) => {
      if (a.direction !== b.direction) return a.direction === "upgrade" ? -1 : 1;
      return Math.abs(b.theme.momentum_delta ?? 0) - Math.abs(a.theme.momentum_delta ?? 0);
    })
    .slice(0, 6);
}

// ── computeIndustryRotation ───────────────────────────────────────────────────

/**
 * Aggregate which industries are gaining / losing cross-theme attention.
 * Weight: primary industry 1.0x, secondary 0.6x, tertiary 0.35x.
 * Only includes industries cited by ≥2 themes or with |delta| ≥ 5.
 */
export function computeIndustryRotation(
  themes: ThemeIntelligence[],
  limit = 6,
): IndustryRotationSignal[] {
  const WEIGHTS = [1.0, 0.6, 0.35];
  const map = new Map<string, { delta: number; count: number }>();

  for (const t of themes) {
    const delta = t.momentum_delta ?? 0;
    (t.related_industries ?? []).slice(0, 3).forEach((ind, i) => {
      const w = WEIGHTS[i] ?? 0.35;
      const e = map.get(ind) ?? { delta: 0, count: 0 };
      map.set(ind, { delta: e.delta + delta * w, count: e.count + 1 });
    });
  }

  return [...map.entries()]
    .map(([industry, { delta, count }]) => ({
      industry,
      delta: Math.round(delta),
      count,
    }))
    .filter(x => x.count >= 2 || Math.abs(x.delta) >= 5)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

// ── computeSignalBalance ──────────────────────────────────────────────────────

/** Bullish / bearish counts and average conviction across all themes. */
export function computeSignalBalance(
  themes:    ThemeIntelligence[],
  scorecard: BriefingScorecard,
): SignalBalance {
  const bullish   = scorecard.accelerating + scorecard.strengthening + scorecard.emerging;
  const bearish   = scorecard.reversing + scorecard.cooling;
  const netSignal = bullish - bearish;
  const confidence = themes.length > 0
    ? Math.round(themes.reduce((s, t) => s + (t.confidence ?? 50), 0) / themes.length)
    : 50;
  return { bullish, bearish, netSignal, confidence };
}

// ── computeConvictionTier ─────────────────────────────────────────────────────

/**
 * Qualitative conviction label derived from signal breadth, agreement,
 * acceleration strength, cross-category confirmation, and persistence.
 * Replaces raw confidence% with a tier that reflects signal quality.
 */
export function computeConvictionTier(
  themes:    ThemeIntelligence[],
  scorecard: BriefingScorecard,
  balance:   SignalBalance,
): string {
  const total      = Math.max(1, scorecard.total);
  const net        = Math.abs(balance.netSignal);
  const crossConf  = themes.filter(t => t.cross_category_confirmed).length;
  const highDelta  = themes.filter(t => Math.abs(t.momentum_delta ?? 0) >= 12).length;
  const highPersist= themes.filter(t => (t.persistence_cycles ?? 0) >= 5).length;

  let score = 0;

  // Signal agreement (0–3 pts)
  if (net >= 6) score += 3;
  else if (net >= 4) score += 2;
  else if (net >= 2) score += 1;

  // Cross-category breadth (0–2 pts)
  if (crossConf >= 3) score += 2;
  else if (crossConf >= 1) score += 1;

  // Acceleration strength (0–2 pts)
  if (scorecard.accelerating >= 4) score += 2;
  else if (scorecard.accelerating >= 2) score += 1;

  // Persistence quality (0–1 pt)
  if (highPersist >= 3) score += 1;

  // High-delta themes (0–1 pt)
  if (highDelta >= 3) score += 1;

  // Penalty: low net-to-total ratio → mixed / low-conviction market
  if (net / total < 0.15) score = Math.max(0, score - 2);

  if (score >= 7) return "Strong Conviction";
  if (score >= 5) return "High Conviction";
  if (score >= 3) return "Moderate Conviction";
  return "Low Conviction";
}

// ── computeTodaysChanges ──────────────────────────────────────────────────────

/**
 * Derive a ranked list of today's notable momentum changes.
 * Returns up-changes first (sorted by priority), then down-changes.
 */
export function computeTodaysChanges(
  themes:   ThemeIntelligence[],
  rotation: IndustryRotationSignal[],
): TodayChange[] {
  const ups:   TodayChange[] = [];
  const downs: TodayChange[] = [];
  const seen   = new Set<string>();

  // Strips chain paths from theme names — "A → B → C" → "C"
  const tname = (t: ThemeIntelligence): string =>
    t.name.includes(" → ") ? t.name.split(" → ").pop()!.trim() : t.name;

  for (const t of themes) {
    const delta = t.momentum_delta ?? 0;
    const ind0  = (t.related_industries ?? [])[0];
    const name  = tname(t);

    if (t.momentum_label === "accelerating" && delta >= 8) {
      ups.push({
        direction: "up",
        text: ind0
          ? `${name} is accelerating — ${ind0} is the primary beneficiary`
          : `${name} momentum is accelerating with improving signal breadth`,
        priority: delta,
      });
      seen.add(t.name);
    } else if (t.cross_category_confirmed && (t.breadth_score ?? 0) >= 60 && ind0) {
      ups.push({
        direction: "up",
        text: `${name} confirms cross-sector into ${ind0} — structural breadth building`,
        priority: delta + 5,
      });
      seen.add(t.name);
    } else if (t.momentum_label === "strengthening" && delta >= 10) {
      ups.push({
        direction: "up",
        text: ind0
          ? `${name} strengthening — ${ind0} conviction improving`
          : `${name} signal quality is strengthening across tracked cycles`,
        priority: delta,
      });
      seen.add(t.name);
    } else if (t.momentum_label === "emerging" && delta >= 5) {
      ups.push({
        direction: "up",
        text: ind0
          ? `${name} establishing presence in ${ind0} — watch for confirmation`
          : `${name} is building early signal presence across tracked cycles`,
        priority: delta,
      });
      seen.add(t.name);
    } else if (t.momentum_label === "reversing") {
      downs.push({
        direction: "down",
        text: ind0
          ? `${name} enters reversal — ${ind0} positioning faces compression risk`
          : `${name} has entered reversal — signal deterioration is accelerating`,
        priority: Math.abs(delta) + 10,
      });
      seen.add(t.name);
    } else if (t.momentum_label === "cooling" && delta <= -7) {
      downs.push({
        direction: "down",
        text: ind0
          ? `${name} deteriorating — ${ind0} momentum is fading`
          : `${name} signal quality is declining across tracked cycles`,
        priority: Math.abs(delta),
      });
      seen.add(t.name);
    }
  }

  // Top industry rotation moves as additional context
  for (const r of rotation.slice(0, 3)) {
    const label = r.industry;
    if (r.delta >= 25 && !seen.has(label))
      ups.push({
        direction: "up",
        text: `${label} rotating into sector leadership — capital flows strengthening`,
        priority: r.delta * 0.6,
      });
    else if (r.delta <= -15 && !seen.has(label))
      downs.push({
        direction: "down",
        text: `${label} losing sector leadership — capital rotating into alternatives`,
        priority: Math.abs(r.delta) * 0.6,
      });
  }

  const sortedUps   = ups.sort((a, b)   => b.priority - a.priority).slice(0, 3);
  const sortedDowns = downs.sort((a, b) => b.priority - a.priority).slice(0, 3);
  return [...sortedUps, ...sortedDowns];
}
