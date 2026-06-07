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

  const tname = (t: ThemeIntelligence): string =>
    t.name.includes(" → ") ? t.name.split(" → ").pop()!.trim() : t.name;

  // First clean prose sentence; rejects raw graph chains
  const prose = (text: string | null | undefined): string | null => {
    if (!text || text.length < 20 || text.includes(" → ")) return null;
    const idx = text.indexOf(".");
    const s = idx > 15 ? text.slice(0, idx).trim() : text.slice(0, 130).trim();
    return s.length >= 20 ? s : null;
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

  const lc  = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
  const dot = (s: string): string => s.endsWith(".") ? s : s + ".";

  // Hard 90-char cap at natural word boundaries — never clips mid-word
  const cap90 = (s: string): string => {
    const t = s.endsWith(".") ? s : s + ".";
    if (t.length <= 90) return t;
    // Prefer breaking at a semicolon (clause boundary used heavily in templates)
    const semi = t.lastIndexOf(";", 87);
    if (semi > 40) return t.slice(0, semi) + ".";
    // Break at em-dash separator when it falls early enough to be meaningful
    const dash = t.indexOf(" — ");
    if (dash > 0 && dash <= 60) return t.slice(0, dash) + ".";
    // Word boundary fallback
    const word = t.lastIndexOf(" ", 87);
    return word > 40 ? t.slice(0, word) + "." : t.slice(0, 87) + "…";
  };

  const addUp   = (text: string, priority: number) =>
    ups.push({ direction: "up",   text: cap90(text), priority });
  const addDown = (text: string, priority: number) =>
    downs.push({ direction: "down", text: cap90(text), priority });

  for (const t of themes) {
    const delta   = t.momentum_delta ?? 0;
    const ind0    = (t.related_industries ?? [])[0];
    const ind1    = (t.related_industries ?? [])[1];
    const name    = tname(t);
    const ptext   = leadProse(t);
    const persist = t.persistence_cycles ?? 0;
    const pdays   = t.persistence_days ?? 0;
    const breadth = Math.round(t.breadth_score ?? 0);
    const vol     = t.volatility_score ?? 50;

    // ── Accelerating ────────────────────────────────────────────────────────
    if (t.momentum_label === "accelerating" && delta >= 8) {
      let text: string;
      if (ptext) {
        text = dot(ind0 ? `${ind0} — ${lc(ptext)}` : ptext);
      } else if (hasMacro(t, "rate", "yield", "federal reserve", "monetary policy")) {
        text = ind0
          ? `${name} — short-rate easing is reducing inventory and project financing costs in ${ind0}, widening margin headroom`
          : `${name} — lower short rates are compressing the hurdle rate for capital deployment across the theme`;
      } else if (hasMacro(t, "regulat", "policy", "legislat")) {
        text = ind0
          ? `${name} — a regulatory change is removing a structural barrier in ${ind0}, opening procurement pipelines`
          : `${name} — a policy shift is expanding the addressable market faster than consensus assumed`;
      } else if (hasEffect(t, "inventory", "destocking", "restocking")) {
        text = ind0
          ? `${name} — the inventory cycle in ${ind0} has turned; order rates are running above consumption rates`
          : `${name} — inventory restocking is driving order flow well above run-rate demand`;
      } else if (pdays >= 10) {
        text = ind0
          ? `${name} — ${ind0} order books have widened for ${pdays} consecutive days without a reversal`
          : `${name} — ${pdays}-day unbroken move; the consistency rules out sector-rotation rebalancing as the driver`;
      } else if (breadth >= 70) {
        text = ind0
          ? `${name} — ${ind0} gains are at ${breadth}% breadth, distributed across the supply chain rather than concentrated in single names`
          : `${name} — ${breadth}% participation breadth; the move is sector-wide, not a single-name distortion`;
      } else {
        text = ind0
          ? `${name} — supply constraints in ${ind0} are tightening pricing power; lead times are extending and spot premiums are widening`
          : `${name} — supply lead times are extending and spot premiums are widening as demand outpaces current capacity`;
      }
      addUp(text, delta);
      seen.add(t.name);

    // ── Cross-category confirmed ─────────────────────────────────────────────
    } else if (t.cross_category_confirmed && (t.breadth_score ?? 0) >= 60 && ind0) {
      let text: string;
      if (ptext) {
        text = dot(`${ind0} — ${lc(ptext)}`);
      } else if (ind1) {
        text = `${name} — confirmed in both ${ind0} and ${ind1}; the same driver applies across the supply chain`;
      } else {
        text = `${name} — confirmed in ${ind0}; the driver is present across the supply chain, not a single catalyst`;
      }
      addUp(text, delta + 5);
      seen.add(t.name);

    // ── Strengthening ────────────────────────────────────────────────────────
    } else if (t.momentum_label === "strengthening" && delta >= 10) {
      let text: string;
      if (ptext) {
        text = dot(ind0 ? `${ind0} — ${lc(ptext)}` : ptext);
      } else if (hasMacro(t, "credit", "financ", "spread", "lending")) {
        text = ind0
          ? `${name} — credit spreads in ${ind0} are tightening, lowering financing costs and supporting the capex cycle`
          : `${name} — tightening credit spreads are lowering the financing hurdle for projects tied to the theme`;
      } else if (hasMacro(t, "commodity", "oil", "metals", "input cost")) {
        text = ind0
          ? `${name} — input costs for ${ind0} are easing; the margin benefit is showing in forward guidance`
          : `${name} — input cost deflation is flowing through to margins faster than the market had priced`;
      } else if (persist >= 4) {
        text = ind0
          ? `${name} — ${ind0} has improved for ${persist} consecutive readings without mean-reverting`
          : `${name} — ${persist} consecutive readings of improvement; the trend has duration, not just velocity`;
      } else {
        text = ind0
          ? `${name} — pricing power in ${ind0} is recovering as the cost base normalises and volumes increase`
          : `${name} — the cost-to-revenue spread is widening as input costs fall and volume recovers`;
      }
      addUp(text, delta);
      seen.add(t.name);

    // ── Emerging ─────────────────────────────────────────────────────────────
    } else if (t.momentum_label === "emerging" && delta >= 5) {
      let text: string;
      if (ptext) {
        text = dot(ind0 ? `${ind0} — ${lc(ptext)}` : ptext);
      } else if (hasMacro(t, "regulat", "policy", "legislat", "government")) {
        text = ind0
          ? `${name} — policy allocation in ${ind0} is creating the first commercial-scale demand signal`
          : `${name} — government policy is generating initial contract flow; procurement is moving from pilot to programme`;
      } else {
        text = ind0
          ? `${name} — ${ind0} procurement data shows first commercial orders; unit volumes are crossing from pilot to production`
          : `${name} — early order-book data confirms the theme is crossing from concept to initial commercial volumes`;
      }
      addUp(text, delta);
      seen.add(t.name);

    // ── Reversing ────────────────────────────────────────────────────────────
    } else if (t.momentum_label === "reversing") {
      let text: string;
      if (ptext) {
        text = dot(ind0 ? `${ind0} — ${lc(ptext)}` : ptext);
      } else if (hasMacro(t, "rate", "yield", "monetary")) {
        text = ind0
          ? `${name} — rising rates are compressing ${ind0} valuations; the discount rate now sits above the assumed underwrite`
          : `${name} — the rate-sensitive valuation thesis is unwinding as the discount rate has moved above the assumed underwrite`;
      } else if (hasEffect(t, "margin", "compress", "cost pressure")) {
        text = ind0
          ? `${name} — input costs in ${ind0} are outpacing pricing power; unit margins are in compression`
          : `${name} — input costs have outrun pricing power; the margin structure that supported the move is now inverted`;
      } else if (vol > 65) {
        text = ind0
          ? `${name} — the ${ind0} reversal is at ${Math.round(vol)}-percentile vol; involuntary unwinds, not orderly rotation`
          : `${name} — elevated volatility during the reversal is consistent with forced unwinds, not voluntary selling`;
      } else {
        text = ind0
          ? `${name} — ${ind0} order cancellations and inventory builds are rising together; the demand thesis has broken`
          : `${name} — rising order cancellations and inventory accumulation are inverting the core supply/demand thesis`;
      }
      addDown(text, Math.abs(delta) + 10);
      seen.add(t.name);

    // ── Cooling ──────────────────────────────────────────────────────────────
    } else if (t.momentum_label === "cooling" && delta <= -7) {
      let text: string;
      if (ptext) {
        text = dot(ind0 ? `${ind0} — ${lc(ptext)}` : ptext);
      } else if (hasMacro(t, "commodity", "oil", "energy", "metals", "input")) {
        text = ind0
          ? `${name} — commodity inputs in ${ind0} are rising faster than pass-through ability; margin guidance is being cut`
          : `${name} — rising input costs are outpacing pricing power; forward margin guidance is moving lower`;
      } else if (persist >= 3) {
        text = ind0
          ? `${name} — ${ind0} has weakened for ${persist} consecutive readings; the correction is structural`
          : `${name} — ${persist} consecutive readings of weakness; the thesis is in structural correction, not noise`;
      } else {
        text = ind0
          ? `${name} — end-market demand in ${ind0} is softening faster than supply; channel inventory is building`
          : `${name} — demand is softening faster than the supply side is adjusting; channel inventory is accumulating`;
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
        `${label} — multiple converging themes are lifting the sector; order books and project financing are moving in the same direction`,
        r.delta * 0.6,
      );
    else if (r.delta <= -15 && !seen.has(label))
      addDown(
        `${label} — cross-theme softness is broadening; inventory builds and order cancellations are both visible in sector data`,
        Math.abs(r.delta) * 0.6,
      );
  }

  const sortedUps   = ups.sort((a, b)   => b.priority - a.priority).slice(0, 3);
  const sortedDowns = downs.sort((a, b) => b.priority - a.priority).slice(0, 3);
  return [...sortedUps, ...sortedDowns];
}
