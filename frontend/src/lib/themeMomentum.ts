/**
 * themeMomentum.ts — Deterministic Theme Momentum Engine
 *
 * Pure functions, zero API calls. Derives five sub-scores from existing
 * ThemeIntelligence fields plus optional context (episodes, clusters, deals).
 *
 * Sub-scores (each 0–100):
 *   storyActivity      — contributing_story_count + momentum_delta proxy
 *   podcastMentions    — episode match count against theme assets/topics
 *   industryPenetration — related_industries breadth + cross-category confirmation
 *   maActivity         — deal match count against theme sectors/entities
 *   vcActivity         — venture-tagged episode matches
 *
 * Momentum Score (-100 → +100):
 *   activityScore (0–100) × directionMultiplier (backend momentum_label)
 *   + small nudge from momentum_delta
 *   − competition_penalty dampening
 *
 * Signal Score (0–100):
 *   Composite of persistence, breadth, evidence, and story count.
 *
 * Lifecycle (6 states):
 *   Broken → Emerging → Dominant → Accelerating → Reversing → Mature
 */

import type { ThemeIntelligence, Episode, StoryCluster } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LifecycleState =
  | "Emerging"
  | "Accelerating"
  | "Dominant"
  | "Mature"
  | "Reversing"
  | "Broken";

export type MomentumOutputLabel = "Accelerating" | "Stable" | "Weakening";

export interface MomentumComponents {
  storyActivity:        number;   // 0–100
  podcastMentions:      number;   // 0–100
  industryPenetration:  number;   // 0–100
  maActivity:           number;   // 0–100
  vcActivity:           number;   // 0–100
}

export interface ThemeMomentumResult {
  signalScore:     number;            // 0–100 composite signal quality
  momentumScore:   number;            // -100–100 (positive = accelerating)
  momentumLabel:   MomentumOutputLabel;
  persistenceScore: number;           // 0–100 (from theme.persistence_score)
  breadthScore:    number;            // 0–100 (from theme.breadth_score)
  lifecycleState:  LifecycleState;
  components:      MomentumComponents;
}

// Minimal deal shape the engine accepts (superset of DrawerDeal)
export interface MomentumDeal {
  sector:    string;
  dealType:  string;
  entities?: string[];
}

export interface MomentumContext {
  episodes?: Episode[];
  clusters?: StoryCluster[];
  deals?:    MomentumDeal[];
}

// ── Lifecycle metadata (color, icon label) ────────────────────────────────────

export const LIFECYCLE_META: Record<LifecycleState, { color: string; label: string; bg: string }> = {
  Emerging:     { color: "#52b0c8", bg: "rgba(82,176,200,0.12)",  label: "Emerging"     },
  Accelerating: { color: "#10B981", bg: "rgba(16,185,129,0.12)",  label: "Accelerating" },
  Dominant:     { color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  label: "Dominant"     },
  Mature:       { color: "#94A3B8", bg: "rgba(148,163,184,0.10)", label: "Mature"       },
  Reversing:    { color: "#F97316", bg: "rgba(249,115,22,0.12)",  label: "Reversing"    },
  Broken:       { color: "#EF4444", bg: "rgba(239,68,68,0.12)",   label: "Broken"       },
};

// ── Direction multiplier table ────────────────────────────────────────────────
// Maps backend momentum_label → directional scalar (-1 to +1).
// activityScore × directionMultiplier = raw momentum contribution.

const DIRECTION_MULT: Record<string, number> = {
  accelerating:  1.00,
  strengthening: 0.65,
  emerging:      0.40,
  stable:        0.10,
  cooling:      -0.45,
  reversing:    -0.90,
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** True when an episode is meaningfully related to a theme. */
function episodeMatchesTheme(ep: Episode, theme: ThemeIntelligence): boolean {
  const entitySet = new Set(ep.entities.map(e => e.toUpperCase()));
  const topicSet  = new Set(ep.topics);

  if (theme.related_assets.some(a => entitySet.has(a.toUpperCase()))) return true;
  if (theme.podcast_topics.some(pt => topicSet.has(pt))) return true;

  const indLow = theme.related_industries.map(i => i.toLowerCase());
  return ep.topics.some(t => {
    const tL = t.toLowerCase();
    return indLow.some(ind => tL.includes(ind) || ind.includes(tL));
  });
}

/** True when a deal touches the theme's sectors or entities. */
function dealMatchesTheme(deal: MomentumDeal, theme: ThemeIntelligence): boolean {
  const assetSet = new Set(theme.related_assets.map(a => a.toUpperCase()));
  const indTerms = theme.related_industries.map(i => i.toLowerCase());
  const secLow   = deal.sector.toLowerCase();

  if (indTerms.some(ind => secLow.includes(ind) || ind.includes(secLow))) return true;
  return (deal.entities ?? []).some(e => assetSet.has(e.toUpperCase()));
}

// ── Public scoring functions ──────────────────────────────────────────────────

/** Composite signal quality from theme fields alone (no context needed). */
export function computeSignalScore(theme: ThemeIntelligence): number {
  const persistence  = theme.persistence_score ?? 0;
  const breadth      = theme.breadth_score ?? 0;
  const evidenceRaw  = clamp((theme.evidence_count ?? 0) * 5, 0, 100);
  const storyRaw     = clamp((theme.contributing_story_count ?? 0) * 5, 0, 100);

  return Math.round(clamp(
    persistence  * 0.35 +
    breadth      * 0.25 +
    evidenceRaw  * 0.20 +
    storyRaw     * 0.20,
    0, 100,
  ));
}

/** Five momentum sub-scores from optional context. Falls back gracefully. */
export function computeMomentumComponents(
  theme:   ThemeIntelligence,
  context: MomentumContext = {},
): MomentumComponents {
  const { episodes = [], clusters = [], deals = [] } = context;

  // ── storyActivity: story count + backend delta signal ─────────────────────
  const baseStory   = clamp((theme.contributing_story_count ?? 0) * 8, 0, 100);
  // Cluster evidence (additional cross-check beyond contributing_cluster_ids)
  const clusterHits = clusters.filter(c => theme.contributing_cluster_ids.includes(c.id)).length;
  const clusterBoost = clamp(clusterHits * 6, 0, 30);
  // momentum_delta as a ±boost (backend computed, typically ±20)
  const deltaBoost  = clamp((theme.momentum_delta ?? 0) * 1.5, -25, 25);
  const storyActivity = clamp(Math.round(baseStory + clusterBoost + deltaBoost), 0, 100);

  // ── podcastMentions: matched podcast episodes ─────────────────────────────
  const podcastCount   = episodes.filter(ep => episodeMatchesTheme(ep, theme)).length;
  const podcastMentions = clamp(Math.round(podcastCount * 20), 0, 100);

  // ── industryPenetration: breadth of sector exposure ──────────────────────
  const indBase  = clamp(theme.related_industries.length * 18, 0, 90);
  const ccBonus  = theme.cross_category_confirmed ? 10 : 0;
  const industryPenetration = clamp(Math.round(indBase + ccBonus), 0, 100);

  // ── maActivity: M&A deal coverage ────────────────────────────────────────
  const maCount   = deals.filter(d => dealMatchesTheme(d, theme)).length;
  const maActivity = clamp(Math.round(maCount * 34), 0, 100);

  // ── vcActivity: venture-tagged episodes matching theme ────────────────────
  const vcEpisodes = episodes.filter(
    ep => ep.topics.some(t => t === "Venture" || t === "Tech / AI"),
  );
  const vcCount   = vcEpisodes.filter(ep => episodeMatchesTheme(ep, theme)).length;
  const vcActivity = clamp(Math.round(vcCount * 34), 0, 100);

  return { storyActivity, podcastMentions, industryPenetration, maActivity, vcActivity };
}

/** Weighted momentum score (-100 → +100) from components + theme direction. */
export function computeMomentumScore(
  theme:      ThemeIntelligence,
  components: MomentumComponents,
): number {
  const { storyActivity, podcastMentions, industryPenetration, maActivity, vcActivity } = components;

  const activityScore =
    storyActivity        * 0.30 +
    podcastMentions      * 0.25 +
    industryPenetration  * 0.20 +
    maActivity           * 0.15 +
    vcActivity           * 0.10;

  const direction = DIRECTION_MULT[theme.momentum_label] ?? 0;

  // Apply competition penalty (0–100 → dampens score by up to 50%)
  const penaltyFactor = 1 - clamp((theme.competition_penalty ?? 0) / 200, 0, 0.5);

  const raw = activityScore * direction * penaltyFactor;

  // Small absolute nudge from backend delta (capped at ±15)
  const deltaNudge = clamp((theme.momentum_delta ?? 0) * 0.4, -15, 15);

  return Math.round(clamp(raw + deltaNudge, -100, 100));
}

/** Map numeric momentum score to output label. */
export function momentumOutputLabel(score: number): MomentumOutputLabel {
  if (score >  25) return "Accelerating";
  if (score < -25) return "Weakening";
  return "Stable";
}

/** Deterministic lifecycle state — priority ordered decision tree. */
export function computeLifecycle(
  theme:         ThemeIntelligence,
  momentumScore: number,
): LifecycleState {
  // Broken: signal has collapsed
  if (
    theme.signal_strength === "weak" &&
    (theme.persistence_score ?? 0) < 25 &&
    (theme.momentum_delta ?? 0) < -10
  ) return "Broken";

  // Emerging: brand-new or speculative, few cycles
  if (
    (theme.persistence_cycles ?? 0) <= 2 ||
    ((theme.persistence_score ?? 0) < 30 && theme.signal_quality === "speculative")
  ) return "Emerging";

  // Dominant: peak influence — strong, wide, confirmed across sectors
  if (
    theme.signal_strength === "strong" &&
    (theme.persistence_score ?? 0) >= 70 &&
    (theme.breadth_score ?? 0) >= 65 &&
    theme.cross_category_confirmed
  ) return "Dominant";

  // Accelerating: growing but not yet dominant
  if (
    (theme.momentum_label === "accelerating" || theme.momentum_label === "strengthening") &&
    (theme.persistence_score ?? 0) < 75
  ) return "Accelerating";

  // Reversing: declining signal
  if (
    theme.momentum_label === "reversing" ||
    momentumScore < -30 ||
    ((theme.momentum_delta ?? 0) < -15 && (theme.persistence_score ?? 0) < 50)
  ) return "Reversing";

  // Mature: stable and established
  return "Mature";
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/** Full momentum result. Pass context for richer sub-scores; omit for theme-only estimate. */
export function computeThemeMomentum(
  theme:   ThemeIntelligence,
  context: MomentumContext = {},
): ThemeMomentumResult {
  const signalScore    = computeSignalScore(theme);
  const components     = computeMomentumComponents(theme, context);
  const momentumScore  = computeMomentumScore(theme, components);
  const lifecycle      = computeLifecycle(theme, momentumScore);

  return {
    signalScore,
    momentumScore,
    momentumLabel:   momentumOutputLabel(momentumScore),
    persistenceScore: theme.persistence_score ?? 0,
    breadthScore:    theme.breadth_score ?? 0,
    lifecycleState:  lifecycle,
    components,
  };
}
