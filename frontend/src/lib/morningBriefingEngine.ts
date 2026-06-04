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
