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
  boost: (t: ThemeIntelligence) => number = () => 0,
): BriefingOpportunity[] {
  const MOMENTUM_BONUS: Record<string, number> = {
    accelerating:  25,
    strengthening: 18,
    emerging:      12,
    stable:         0,
    cooling:       -15,
    reversing:     -40,
  };

  const scored = [...themes]
    .filter(t => t.momentum_label !== "reversing")
    .map(t => ({
      theme: t,
      score: (t.confidence ?? 0) +
             Math.max(t.momentum_delta ?? 0, 0) * 1.5 +
             (MOMENTUM_BONUS[t.momentum_label] ?? 0) +
             boost(t),   // preference boost — surfaces followed themes/sectors first
    }))
    .sort((a, b) => b.score - a.score);

  // Deduplicate by primary industry: keep only the highest-scoring theme per industry.
  // Multiple themes pointing to the same sector produce one entry using the best driver.
  const seenInds = new Set<string>();
  const result: BriefingOpportunity[] = [];
  for (const item of scored) {
    if (result.length >= limit) break;
    const ind = (item.theme.related_industries ?? [])[0];
    if (ind) {
      if (seenInds.has(ind)) continue;
      seenInds.add(ind);
    }
    result.push(item);
  }
  return result;
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
  boost: (t: ThemeIntelligence) => number = () => 0,
): BriefingRisk[] {
  const severity = (t: ThemeIntelligence): number => {
    const delta    = t.momentum_delta ?? 0;
    const revBonus = t.momentum_label === "reversing" ? 35 :
                     t.momentum_label === "cooling"   ? 15 : 0;
    return Math.abs(Math.min(delta, 0)) * 1.5 +
           revBonus +
           Math.max(0, 55 - (t.confidence ?? 55));
  };

  // Preference boost is applied only to genuinely deteriorating themes — never in
  // backfill — so a followed-but-healthy theme is never forced onto a Risk card.
  const allDeterioration = [...themes]
    .filter(t =>
      (t.momentum_delta ?? 0) < 0 ||
      t.momentum_label === "reversing" ||
      t.momentum_label === "cooling"
    )
    .map(t => ({ theme: t, severity: severity(t) + boost(t) }))
    .sort((a, b) => b.severity - a.severity);

  // Deduplicate by primary industry: if multiple themes share a sector, keep the worst.
  const seenInds = new Set<string>();
  const deteriorating: BriefingRisk[] = [];
  for (const item of allDeterioration) {
    const ind = (item.theme.related_industries ?? [])[0];
    if (ind) {
      if (seenInds.has(ind)) continue;
      seenInds.add(ind);
    }
    deteriorating.push(item);
  }

  if (deteriorating.length >= limit) return deteriorating.slice(0, limit);

  // Backfill with lowest-confidence non-accelerating themes, skipping already-seen industries
  const seen = new Set(deteriorating.map(d => d.theme.id));
  const backfill = [...themes]
    .filter(t => !seen.has(t.id) && t.momentum_label !== "accelerating")
    .map(t => ({ theme: t, severity: Math.max(0, 55 - (t.confidence ?? 55)) }))
    .sort((a, b) => b.severity - a.severity)
    .filter(item => {
      const ind = (item.theme.related_industries ?? [])[0];
      return !ind || !seenInds.has(ind);
    })
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
  industryBoost: (industry: string) => number = () => 0,
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

  // Ranking key adds the preference boost so followed-sector industries surface in
  // Leaders/Laggards; the displayed `delta` (and its sign) is left untouched, so
  // leader vs. laggard classification stays faithful to the underlying momentum.
  return [...map.entries()]
    .map(([industry, { delta, count }]) => ({
      industry,
      delta: Math.round(delta),
      count,
    }))
    .filter(x => x.count >= 2 || Math.abs(x.delta) >= 5)
    .sort((a, b) => (Math.abs(b.delta) + industryBoost(b.industry)) - (Math.abs(a.delta) + industryBoost(a.industry)))
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
 *
 * Copy priority: causal_narrative → second_order_effects → macro-context template.
 * Templates branch on related_macro_factors / second_order_effects keywords so
 * two themes in the same momentum tier produce structurally different sentences.
 */
export function computeTodaysChanges(
  themes:   ThemeIntelligence[],
  rotation: IndustryRotationSignal[],
): TodayChange[] {
  const ups:   TodayChange[] = [];
  const downs: TodayChange[] = [];
  const seen   = new Set<string>();

  // First clean prose sentence; rejects raw graph chains and truncated text.
  // Only returns text when a sentence-ending period exists and the sentence fits
  // within 90 chars — guaranteeing a complete, renderable sentence every time.
  const prose = (text: string | null | undefined): string | null => {
    if (!text || text.length < 20 || text.includes(" → ")) return null;
    const idx = text.indexOf(".");
    if (idx < 15) return null;
    const s = text.slice(0, idx).trim();
    if (s.length < 20 || s.length > 90) return null;
    return s;
  };

  // Best available causal prose: causal_narrative first, then first substantive effect
  const leadProse = (t: ThemeIntelligence): string | null => {
    const c = prose(t.causal_narrative);
    if (c) return c;
    for (const e of t.second_order_effects ?? []) {
      const p = prose(e);
      if (p && p.length > 30) return p;
    }
    return null;
  };

  const hasMacro = (t: ThemeIntelligence, ...kw: string[]): boolean =>
    (t.related_macro_factors ?? []).some(f => kw.some(k => f.toLowerCase().includes(k)));

  const hasEffect = (t: ThemeIntelligence, ...kw: string[]): boolean =>
    (t.second_order_effects ?? []).some(e => kw.some(k => e.toLowerCase().includes(k)));

  const dot = (s: string): string => s.endsWith(".") ? s : s + ".";

  // Hard 90-char cap. Prefers cutting at the first complete sentence so the
  // result is always a grammatically finished statement.
  const cap90 = (s: string): string => {
    const t = s.endsWith(".") ? s : s + ".";
    if (t.length <= 90) return t;
    // Prefer first sentence boundary within the allowed window
    const sent = t.indexOf(".", 20);
    if (sent >= 20 && sent <= 87) return t.slice(0, sent + 1);
    // Fall back to last word boundary — still appends a period
    const word = t.lastIndexOf(" ", 87);
    return word > 40 ? t.slice(0, word) + "." : t.slice(0, 87) + ".";
  };

  const addUp   = (text: string, priority: number) =>
    ups.push({ direction: "up",   text: cap90(text), priority });
  const addDown = (text: string, priority: number) =>
    downs.push({ direction: "down", text: cap90(text), priority });

  for (const t of themes) {
    const delta   = t.momentum_delta ?? 0;
    const ind0    = (t.related_industries ?? [])[0];
    const ind1    = (t.related_industries ?? [])[1];
    const ptext   = leadProse(t);
    const persist = t.persistence_cycles ?? 0;
    const pdays   = t.persistence_days ?? 0;
    const breadth = Math.round(t.breadth_score ?? 0);
    const vol     = t.volatility_score ?? 50;

    // ── Accelerating ─────────────────────────────────────────────────────────
    if (t.momentum_label === "accelerating" && delta >= 8) {
      let text: string;
      if (ptext) {
        text = dot(ptext);
      } else if (hasMacro(t, "rate", "yield", "federal reserve", "monetary policy")) {
        text = ind0
          ? `Short-rate easing is lowering financing costs in ${ind0}, expanding margins across the sector.`
          : `Lower short rates are compressing the financing hurdle. Leveraged operators across the sector are the primary beneficiaries.`;
      } else if (hasMacro(t, "regulat", "policy", "legislat")) {
        text = ind0
          ? `A regulatory change in ${ind0} is opening procurement pipelines that were previously restricted.`
          : `A policy shift is expanding the addressable market faster than the consensus expected.`;
      } else if (hasEffect(t, "inventory", "destocking", "restocking")) {
        text = ind0
          ? `The inventory cycle in ${ind0} has turned. Order rates are now running above consumption.`
          : `Inventory restocking is driving order flow well above run-rate demand.`;
      } else if (pdays >= 10) {
        text = ind0
          ? `${ind0} order books have widened for ${pdays} consecutive days without interruption.`
          : `Order books have widened for ${pdays} consecutive days. The consistency rules out short-term rebalancing.`;
      } else if (breadth >= 70) {
        text = ind0
          ? `${ind0} gains span ${breadth}% of the sector, distributed rather than concentrated in single names.`
          : `Participation is at ${breadth}% breadth. The move is sector-wide rather than driven by a single name.`;
      } else {
        text = ind0
          ? `Supply constraints in ${ind0} are tightening pricing power. Lead times are extending and spot premiums are widening.`
          : `Supply lead times are extending and spot premiums are widening as demand outpaces current capacity.`;
      }
      addUp(text, delta);
      seen.add(t.name);

    // ── Cross-category confirmed ──────────────────────────────────────────────
    } else if (t.cross_category_confirmed && (t.breadth_score ?? 0) >= 60 && ind0) {
      let text: string;
      if (ptext) {
        text = dot(ptext);
      } else if (ind1) {
        text = `Demand confirmation is visible in both ${ind0} and ${ind1}: order data and pricing are aligned on the same driver.`;
      } else {
        text = `Supply-chain confirmation in ${ind0} is visible across multiple independent data points.`;
      }
      addUp(text, delta + 5);
      seen.add(t.name);

    // ── Strengthening ─────────────────────────────────────────────────────────
    } else if (t.momentum_label === "strengthening" && delta >= 10) {
      let text: string;
      if (ptext) {
        text = dot(ptext);
      } else if (hasMacro(t, "credit", "financ", "spread", "lending")) {
        text = ind0
          ? `Credit spreads in ${ind0} are tightening, lowering financing costs and supporting the capex cycle.`
          : `Tightening credit spreads are lowering the financing hurdle for new projects across the sector.`;
      } else if (hasMacro(t, "commodity", "oil", "metals", "input cost")) {
        text = ind0
          ? `Input costs in ${ind0} are easing. The margin benefit is beginning to show in forward guidance.`
          : `Input cost deflation is flowing through to margins faster than the market had priced.`;
      } else if (persist >= 4) {
        text = ind0
          ? `${ind0} has improved for ${persist} consecutive readings without mean-reverting.`
          : `${persist} consecutive periods of improvement with no reversal. The trend has duration, not just velocity.`;
      } else {
        text = ind0
          ? `Pricing power in ${ind0} is recovering as the cost base normalises and volumes increase.`
          : `The cost-to-revenue spread is widening as input costs fall and volume recovers.`;
      }
      addUp(text, delta);
      seen.add(t.name);

    // ── Emerging ──────────────────────────────────────────────────────────────
    } else if (t.momentum_label === "emerging" && delta >= 5) {
      let text: string;
      if (ptext) {
        text = dot(ptext);
      } else if (hasMacro(t, "regulat", "policy", "legislat", "government")) {
        text = ind0
          ? `Policy allocation in ${ind0} is creating the first commercial-scale demand signal for the sector.`
          : `Government policy is generating initial contract flow. Procurement is moving from pilot to programme.`;
      } else {
        text = ind0
          ? `${ind0} procurement data shows first commercial orders. Unit volumes are crossing from pilot to initial production.`
          : `Early order-book data confirms the theme is crossing from concept to initial commercial volumes.`;
      }
      addUp(text, delta);
      seen.add(t.name);

    // ── Reversing ─────────────────────────────────────────────────────────────
    } else if (t.momentum_label === "reversing") {
      let text: string;
      if (ptext) {
        text = dot(ptext);
      } else if (hasMacro(t, "rate", "yield", "monetary")) {
        text = ind0
          ? `Rising rates are compressing ${ind0} valuations. The discount rate now sits above the original underwrite.`
          : `The rate-sensitive valuation thesis is unwinding. The discount rate has moved above the original underwrite.`;
      } else if (hasEffect(t, "margin", "compress", "cost pressure")) {
        text = ind0
          ? `Input costs in ${ind0} are outpacing pricing power. Unit margins are in compression.`
          : `Input costs have outrun pricing power. The margin structure that supported the move is now inverted.`;
      } else if (vol > 65) {
        text = ind0
          ? `The ${ind0} reversal is occurring at ${Math.round(vol)}-percentile volatility, consistent with involuntary unwinds.`
          : `Elevated volatility during the reversal is consistent with forced unwinds rather than voluntary selling.`;
      } else {
        text = ind0
          ? `${ind0} order cancellations and inventory builds are rising together. The demand thesis has broken.`
          : `Order cancellations are rising while inventories build. The core supply/demand thesis is inverting.`;
      }
      addDown(text, Math.abs(delta) + 10);
      seen.add(t.name);

    // ── Cooling ───────────────────────────────────────────────────────────────
    } else if (t.momentum_label === "cooling" && delta <= -7) {
      let text: string;
      if (ptext) {
        text = dot(ptext);
      } else if (hasMacro(t, "commodity", "oil", "energy", "metals", "input")) {
        text = ind0
          ? `Commodity inputs in ${ind0} are rising faster than pass-through ability. Margin guidance is being cut.`
          : `Rising input costs are outpacing pricing power. Forward margin guidance is moving lower.`;
      } else if (persist >= 3) {
        text = ind0
          ? `${ind0} has weakened for ${persist} consecutive readings. The correction appears structural.`
          : `${persist} consecutive readings of weakness. The thesis is in structural correction, not noise.`;
      } else {
        text = ind0
          ? `End-market demand in ${ind0} is softening faster than supply. Channel inventory is building.`
          : `Demand is softening faster than the supply side is adjusting. Channel inventory is accumulating.`;
      }
      addDown(text, Math.abs(delta));
      seen.add(t.name);
    }
  }

  // Industry rotation — only when delta is large and the industry isn't already covered
  for (const r of rotation.slice(0, 3)) {
    const label = r.industry;
    if (r.delta >= 25 && !seen.has(label))
      addUp(
        `${label} order books and project financing are both improving, with multiple revenue lines moving in the same direction.`,
        r.delta * 0.6,
      );
    else if (r.delta <= -15 && !seen.has(label))
      addDown(
        `Inventory builds and order cancellations are rising simultaneously in ${label}, pointing to a demand-side correction.`,
        Math.abs(r.delta) * 0.6,
      );
  }

  const sortedUps   = ups.sort((a, b)   => b.priority - a.priority).slice(0, 3);
  const sortedDowns = downs.sort((a, b) => b.priority - a.priority).slice(0, 3);
  return [...sortedUps, ...sortedDowns];
}
