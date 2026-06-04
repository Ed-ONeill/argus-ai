/**
 * morningBriefingEngine.ts — Morning Briefing Computation Layer
 *
 * Pure functions, zero API calls. All outputs derived from ThemeIntelligence[].
 * Powers the Morning Briefing panel: scorecard, opportunities, risks,
 * and momentum transition detection.
 */

import type { ThemeIntelligence } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BriefingOpportunity {
  theme: ThemeIntelligence;
  score: number;           // composite ranking score
}

export interface BriefingRisk {
  theme:    ThemeIntelligence;
  severity: number;        // composite severity score
}

export interface MomentumTransition {
  theme:     ThemeIntelligence;
  direction: "upgrade" | "downgrade";
  label:     string;       // e.g. "→ Accelerating" | "→ Reversing"
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

/** Top themes by conviction + positive momentum. */
export function computeOpportunities(
  themes: ThemeIntelligence[],
  limit = 3,
): BriefingOpportunity[] {
  return [...themes]
    .filter(t =>
      (t.momentum_delta ?? 0) > 2 &&
      (t.momentum_label === "accelerating" ||
       t.momentum_label === "strengthening" ||
       t.momentum_label === "emerging") &&
      (t.confidence ?? 0) >= 50
    )
    .map(t => ({
      theme: t,
      score: (t.confidence ?? 0) + (t.momentum_delta ?? 0) * 1.5,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── computeRisks ──────────────────────────────────────────────────────────────

/** Top deteriorating or reversing themes. */
export function computeRisks(
  themes: ThemeIntelligence[],
  limit = 3,
): BriefingRisk[] {
  return [...themes]
    .filter(t =>
      t.momentum_label === "reversing" ||
      (t.momentum_label === "cooling" && (t.momentum_delta ?? 0) <= -5)
    )
    .map(t => ({
      theme: t,
      severity: Math.abs(t.momentum_delta ?? 0) + Math.max(0, 60 - (t.confidence ?? 60)),
    }))
    .sort((a, b) => b.severity - a.severity)
    .slice(0, limit);
}

// ── detectTransitions ─────────────────────────────────────────────────────────

/**
 * Identify themes undergoing meaningful momentum transitions this cycle.
 * Threshold: delta >= 10 for upgrade signal, delta <= -10 for downgrade,
 * or momentum_label === "reversing" regardless of delta magnitude.
 */
export function detectTransitions(themes: ThemeIntelligence[]): MomentumTransition[] {
  const out: MomentumTransition[] = [];

  for (const t of themes) {
    const label = t.momentum_label;
    const delta = t.momentum_delta ?? 0;

    if (label === "accelerating" && delta >= 10) {
      out.push({ theme: t, direction: "upgrade", label: "→ Accelerating" });
    } else if (label === "strengthening" && delta >= 8) {
      out.push({ theme: t, direction: "upgrade", label: "→ Strengthening" });
    } else if (label === "emerging" && delta >= 5) {
      out.push({ theme: t, direction: "upgrade", label: "Emerging" });
    } else if (label === "reversing") {
      out.push({ theme: t, direction: "downgrade", label: "→ Reversing" });
    } else if (label === "cooling" && delta <= -10) {
      out.push({ theme: t, direction: "downgrade", label: "→ Cooling" });
    }
  }

  // Upgrades first, then downgrades; within each group sort by |delta| desc
  return out
    .sort((a, b) => {
      if (a.direction !== b.direction) return a.direction === "upgrade" ? -1 : 1;
      return Math.abs(b.theme.momentum_delta ?? 0) - Math.abs(a.theme.momentum_delta ?? 0);
    })
    .slice(0, 6);
}
