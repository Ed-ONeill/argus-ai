/**
 * lib/feedDiagnostics.ts — production-safe Feed funnel diagnostic (OBSERVABILITY
 * ONLY). Counts how many clusters survive each frontend filtering stage so a
 * sparse rendered feed can be attributed to over-filtering vs. thin backend
 * data. Reuses the exact ranking functions the page already runs — it never
 * alters ranking, and exposes only non-sensitive preference COUNTS and an opaque
 * numeric revision — never preference labels or any value derived from them.
 *
 * Enabled only behind an explicit flag (`?diag=1` or localStorage
 * `argus:diag=1`). No tokens, cookies, credentials, or source content.
 */

import {
  scoreCluster,
  MIN_RELEVANCE_SCORE,
  MIN_CONVICTION_SCORE,
  type UserPrefs,
} from "./feedRanker";
import type { PreferenceLoadStatus } from "./preferenceState";
import type { StoryCluster } from "./types";

export interface FeedFunnel {
  generated_at: string | null;
  // Whether user preferences had finished loading when this funnel was computed.
  // A funnel with preferences_ready=false was measured against default prefs and
  // will be superseded once preferences settle (finding 2).
  preferences_ready: boolean;
  raw_clusters: number;
  personalization_active: boolean;
  pass_relevance: number;      // relevance_score >= 70 (only meaningful when personalized)
  pass_conviction: number;     // primary.signal_score >= 72
  pass_both: number;           // = rankClusters output (the quality gate)
  after_event_cap: number;     // capEventDominance
  after_15_cap: number;        // slice(0, MAX_FEED_SIZE)
  after_focus_filter: number;  // cross-page focus filter
  final_visible: number;       // pagination slice
  // Counts only — no preference LABELS are logged (finding 8, privacy).
  followed_theme_count: number;
  followed_sector_count: number;
  followed_asset_class_count: number;
  // Opaque monotonic counter maintained by the preference loader. It advances
  // when the effective preferences materially change (incl. role/region) but
  // encodes NOTHING about their values — no label or hash-of-label is emitted.
  preference_revision: number;
  // Sanitized load-outcome enum (never a Supabase error code/message): lets
  // diagnostics tell "no preferences" (empty) from "retrieval failed" from
  // "still pending" (idle/loading) from "loaded".
  preference_load_status: PreferenceLoadStatus;
  thresholds: { relevance: number; conviction: number };
}

/** The already-computed page stage arrays (lengths only are read). */
export interface FunnelStages {
  ranked: { length: number };
  deduped: { length: number };
  capped: { length: number };
  focused: { length: number };
  visible: { length: number };
}

export interface FunnelMeta {
  /** Feed generation/cycle id — the payload's generated_at. */
  generatedAt?: string | null;
  /** Whether user preferences had finished loading (default true). */
  preferencesReady?: boolean;
  /** Opaque preference-change counter from the loader (default 0). */
  preferenceRevision?: number;
  /** Sanitized load-outcome enum from the loader (default "idle"). */
  preferenceLoadStatus?: PreferenceLoadStatus;
}

export function computeFeedFunnel(
  clusters: StoryCluster[],
  prefs: UserPrefs,
  stages: FunnelStages,
  generatedAt: string | null = null,
  meta: Omit<FunnelMeta, "generatedAt"> = {},
): FeedFunnel {
  const followedThemes = prefs.followed_themes ?? [];
  const followedSectors = prefs.followed_sectors ?? [];
  const followedAssetClasses = prefs.followed_asset_classes ?? [];
  const personalizationActive = Boolean(
    followedThemes.length ||
    followedSectors.length ||
    (prefs.followed_asset_classes?.length ?? 0) ||
    prefs.user_role ||
    prefs.region_focus,
  );

  const raw = clusters.length;
  // When no preferences are set, rankClusters applies NO gate — so relevance /
  // conviction "pass" counts equal raw (nothing is filtered by the gate).
  let passRelevance = raw;
  let passConviction = raw;
  if (personalizationActive) {
    const scored = clusters.map((c) => scoreCluster(c, prefs));
    passRelevance = scored.filter((c) => c.relevance_score >= MIN_RELEVANCE_SCORE).length;
    passConviction = scored.filter(
      (c) => (c.primary.signal_score ?? 0) >= MIN_CONVICTION_SCORE,
    ).length;
  }

  return {
    generated_at: generatedAt,
    preferences_ready: meta.preferencesReady ?? true,
    raw_clusters: raw,
    personalization_active: personalizationActive,
    pass_relevance: passRelevance,
    pass_conviction: passConviction,
    pass_both: stages.ranked.length,
    after_event_cap: stages.deduped.length,
    after_15_cap: stages.capped.length,
    after_focus_filter: stages.focused.length,
    final_visible: stages.visible.length,
    followed_theme_count: followedThemes.length,
    followed_sector_count: followedSectors.length,
    followed_asset_class_count: followedAssetClasses.length,
    preference_revision: meta.preferenceRevision ?? 0,
    preference_load_status: meta.preferenceLoadStatus ?? "idle",
    thresholds: { relevance: MIN_RELEVANCE_SCORE, conviction: MIN_CONVICTION_SCORE },
  };
}

/** Deterministic, key-sorted serialization (stable regardless of key order). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map(
    (k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`,
  ).join(",")}}`;
}

/**
 * Stable dedup signature for a funnel record (finding 2). Emission is keyed on
 * this — NOT on generated_at alone. It is derived from the ENTIRE completed
 * FeedFunnel object (every reported field: generation, preference readiness,
 * personalization, all gate-stage counts, final visibility, followed counts,
 * and the opaque numeric preference_revision) plus the focus identity. Because
 * it serializes the whole funnel, any future reported field is covered
 * automatically. The funnel carries only counts + a value-free revision, so no
 * preference LABELS (nor anything derived from them) ever enter the signature.
 */
export function funnelSignature(f: FeedFunnel, focusId: string | null): string {
  return `${stableStringify(f)}|focus:${focusId ?? "none"}`;
}

/** Explicit opt-in only: `?diag=1` in the URL or localStorage `argus:diag=1`. */
export function feedDiagEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("diag") === "1") return true;
    return window.localStorage.getItem("argus:diag") === "1";
  } catch {
    return false;
  }
}
