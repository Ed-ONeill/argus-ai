"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Episode } from "@/lib/types";

// ── Recency boost thresholds (hours) ─────────────────────────────────────────
// Applied during merge sort to surface very fresh content above older high-scorers.
const FRESH_BOOST_6H  = 20;
const FRESH_BOOST_24H = 10;
const FRESH_BOOST_72H =  5;

// ── Briefing composition constants ───────────────────────────────────────────
// MAX_BRIEFINGS_ALL_TAB — hard ceiling on briefings admitted to the combined pool,
//   regardless of podcast count.  Prevents the merged list from being flooded when
//   the news cluster pipeline is very active.
// MIN_PODCAST_SHARE — when podcasts are available, they must represent at least
//   this fraction of the combined pool.  Briefings are trimmed to enforce the
//   share: maxBriefings = ceil(podcasts.length × (1 − share) / share).
//   0.60 ⇒ podcasts ≥ 60 % ⇒ briefings ≤ ~67 % of podcast count.
//   When there are no podcasts at all, briefings are used uncapped (up to
//   MAX_BRIEFINGS_ALL_TAB) so the page is never completely blank.
const MAX_BRIEFINGS_ALL_TAB = 10;    // hard cap on briefings in combined pool
const MIN_PODCAST_SHARE     = 0.60;  // min podcast fraction when podcasts exist

// ── Source-aware scoring constants ───────────────────────────────────────────
// Applied as multipliers to the effective ranking score during the merged sort.
// These do NOT change the relevance_score stored on each episode — they only
// affect the sort order inside mergeAndSort.
//
// PODCAST_SCORE_MULT  — lifts real podcast episodes so they win ties against
//   equally-scored briefings and surface first in mixed rails.
//   1.15 = a podcast with relevance_score=60 sorts as if it scored ~69.
//
// BRIEFING_SCORE_MULT — dampens briefings so they fill gaps rather than lead.
//   0.65 = a briefing with relevance_score=80 sorts as if it scored ~52, placing
//   it behind a podcast scoring 50+ raw.  Briefings still surface when they are
//   genuinely the freshest or highest-signal items in a thin category.
//
// TOPIC_MATCH_BOOST — additive bonus (applied before source mult) for items whose
//   primary topic matches the active filter tab.  Ensures direct topic-matches rank
//   above same-scored items that only matched via secondary fill.
//   Only applied when a topic tab is active (not on the All tab).
const PODCAST_SCORE_MULT  = 1.15;   // lift real podcasts in merged ranking
const BRIEFING_SCORE_MULT = 0.65;   // dampen briefings so they fill gaps, not dominate
const TOPIC_MATCH_BOOST   = 8;      // additive points for direct topic match on topic tabs

function ageHoursFromIso(iso: string): number {
  try {
    return (Date.now() - new Date(iso).getTime()) / 3_600_000;
  } catch {
    return 9999;
  }
}

function freshnessBoost(iso: string): number {
  const h = ageHoursFromIso(iso);
  if (h <= 6)  return FRESH_BOOST_6H;
  if (h <= 24) return FRESH_BOOST_24H;
  if (h <= 72) return FRESH_BOOST_72H;
  return 0;
}

/**
 * Compute the effective ranking score for an episode.
 *
 * Formula: (relevance_score + freshnessBoost + topicMatchBoost) × sourceMult
 *
 * sourceMult lifts real podcasts and dampens briefings so podcasts remain the
 * backbone of every rail even when briefings score higher on raw relevance.
 * topicMatchBoost is only applied when a topic tab is active.
 */
function effectiveScore(ep: Episode, activeTopic: string): number {
  const sourceMult   = ep.is_briefing ? BRIEFING_SCORE_MULT : PODCAST_SCORE_MULT;
  const topicBoost   = activeTopic && ep.topics?.includes(activeTopic) ? TOPIC_MATCH_BOOST : 0;
  return (ep.relevance_score + freshnessBoost(ep.published_at) + topicBoost) * sourceMult;
}

/**
 * Merge podcasts + briefings into a single source-balanced, recency-weighted list.
 *
 * Step 1 — Briefing cap: trim briefings so podcasts remain ≥ MIN_PODCAST_SHARE of
 *   the combined pool (also bounded by MAX_BRIEFINGS_ALL_TAB).  The cap is applied
 *   to raw recency-weighted score so only the best briefings are kept.
 *
 * Step 2 — Deduplication: remove any id collisions (defensive).
 *
 * Step 3 — Source-aware sort: sort by effectiveScore(ep, activeTopic).
 *   Podcasts receive a ×PODCAST_SCORE_MULT lift; briefings receive a
 *   ×BRIEFING_SCORE_MULT dampen.  A fresh briefing still beats a stale podcast,
 *   but an equally-fresh podcast always beats an equally-fresh briefing.
 */
function mergeAndSort(podcasts: Episode[], briefings: Episode[], activeTopic: string): Episode[] {
  // Sort briefings by raw recency-weighted score so the cap keeps the best ones.
  const sortedBriefings = [...briefings].sort((a, b) => {
    const sa = a.relevance_score + freshnessBoost(a.published_at);
    const sb = b.relevance_score + freshnessBoost(b.published_at);
    return sb - sa;
  });

  let cappedBriefings: Episode[];
  if (podcasts.length > 0) {
    const byShare = Math.ceil(podcasts.length * (1 - MIN_PODCAST_SHARE) / MIN_PODCAST_SHARE);
    const limit   = Math.min(byShare, MAX_BRIEFINGS_ALL_TAB);
    cappedBriefings = sortedBriefings.slice(0, limit);
  } else {
    // No podcasts: briefings are the only content — allow up to the hard cap.
    cappedBriefings = sortedBriefings.slice(0, MAX_BRIEFINGS_ALL_TAB);
  }

  const combined = [...podcasts, ...cappedBriefings];

  // Deduplicate by id (defensive — IDs should not overlap across sources).
  const seen    = new Set<string>();
  const deduped: Episode[] = [];
  for (const ep of combined) {
    if (!seen.has(ep.id)) {
      seen.add(ep.id);
      deduped.push(ep);
    }
  }

  // Source-aware sort: secondaries always after primaries; within each group
  // rank by effectiveScore (source mult + freshness + topic-match boost).
  return deduped.sort((a, b) => {
    if (a.is_secondary !== b.is_secondary) return a.is_secondary ? 1 : -1;
    return effectiveScore(b, activeTopic) - effectiveScore(a, activeTopic);
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────
//
// topic — pass the active topic chip value ("" = All, "M&A", "Tech / AI", …)
// Fetches /api/listen/ and /api/briefings/ in parallel; merges results with
// recency-weighted relevance sort.  isFallback is true only when both sources
// return nothing (briefings fully replace the old MOCK_EPISODES fallback).

export function useListen(topic: string) {
  // Keep queryKey stable: "" and "All" both map to the same cache entry.
  const queryKey = topic && topic !== "All" ? topic : "all";

  const { data, isLoading } = useQuery<{ episodes: Episode[]; isFallback: boolean }>({
    queryKey: ["listen", queryKey],
    queryFn: async () => {
      const normalizedTopic = queryKey === "all" ? "" : queryKey;
      const topicParam = normalizedTopic
        ? `?topic=${encodeURIComponent(normalizedTopic)}`
        : "";

      const listenUrl    = `/api/listen/${topicParam}`;
      const briefingsUrl = `/api/briefings/${topicParam}`;

      // Fetch both sources in parallel; treat each failure as an empty array.
      const [listenResult, briefingsResult] = await Promise.allSettled([
        fetch(listenUrl).then(r => (r.ok ? r.json() : [])),
        fetch(briefingsUrl).then(r => (r.ok ? r.json() : [])),
      ]);

      // Combine raw results from both endpoints, then split by is_briefing flag.
      // This ensures correct categorization regardless of which endpoint returned them,
      // fixing the bug where items from /api/listen/ were treated as podcasts even
      // when they carried is_briefing = true.
      const rawListen: Episode[]    = listenResult.status    === "fulfilled" && Array.isArray(listenResult.value)    ? listenResult.value    : [];
      const rawBriefings: Episode[] = briefingsResult.status === "fulfilled" && Array.isArray(briefingsResult.value) ? briefingsResult.value : [];
      const allRaw = [...rawListen, ...rawBriefings];
      const podcasts  = allRaw.filter(e => !e.is_briefing);
      const briefings = allRaw.filter(e => e.is_briefing);

      const combined = mergeAndSort(podcasts, briefings, normalizedTopic);

      // ── Debug: source counts + top-10 effective scores ─────────────────────
      if (process.env.NODE_ENV !== "production") {
        console.debug(
          `[useListen] topic=${JSON.stringify(normalizedTopic || "all")} ` +
          `podcasts=${podcasts.length} briefings=${briefings.length} ` +
          `briefings_after_cap=${combined.filter(e => e.is_briefing).length} ` +
          `combined=${combined.length}`,
        );
        const top10 = combined.slice(0, 10);
        console.debug("[useListen] top-10 merged ranking:");
        top10.forEach((ep, i) => {
          const raw  = ep.relevance_score + freshnessBoost(ep.published_at);
          const eff  = effectiveScore(ep, normalizedTopic);
          const src  = ep.is_briefing ? "BRIEFING" : "PODCAST";
          console.debug(
            `  ${i + 1}. [${src}] ${ep.title.slice(0, 55)} ` +
            `| raw=${raw.toFixed(1)} eff=${eff.toFixed(1)}`,
          );
        });
      }

      return {
        episodes:   combined,
        isFallback: combined.length === 0,
      };
    },
    staleTime: 2 * 60_000,   // 2 minutes
  });

  const episodes: Episode[] = data?.episodes  ?? [];
  const isFallback: boolean  = data?.isFallback ?? false;

  return { episodes, isLoading, isFallback };
}

// ── Rail-based hook (new Listen page) ─────────────────────────────────────────
//
// Fetches only /api/listen/ — no briefings endpoint.  Briefings that leak through
// (is_briefing=true) are filtered client-side.  Episodes are deduplicated and
// partitioned into six themed rails in priority order so the same episode never
// appears in two rails.

export function useListenRails() {
  const { data, isLoading } = useQuery<Episode[]>({
    queryKey: ["listen-rails"],
    queryFn: async () => {
      const res = await fetch("/api/listen/?limit=100");
      if (!res.ok) return [];
      const raw: unknown = await res.json();
      return (Array.isArray(raw) ? (raw as Episode[]) : []).filter(e => !e.is_briefing);
    },
    staleTime: 2 * 60_000,
    placeholderData: (prev) => prev,
  });

  const rails = useMemo(() => {
    const episodes = data ?? [];
    const used = new Set<string>();

    // Primary picks: strict global dedup so each episode appears in at most one rail.
    function pick(filter: (ep: Episode) => boolean, limit = 6): Episode[] {
      const result: Episode[] = [];
      for (const ep of episodes) {
        if (result.length >= limit) break;
        if (!used.has(ep.id) && filter(ep)) {
          used.add(ep.id);
          result.push(ep);
        }
      }
      return result;
    }

    // Backfill: for major rails that fall below the target, pull additional
    // episodes from the full pool matching a broader topic filter.
    // Allows an episode to appear in two rails — density over strict dedup.
    function backfill(
      primary:     Episode[],
      broadFilter: (ep: Episode) => boolean,
      target = 4,
    ): Episode[] {
      if (primary.length >= target) return primary;
      const existingIds = new Set(primary.map(ep => ep.id));
      const extras: Episode[] = [];
      for (const ep of episodes) {
        if (primary.length + extras.length >= target) break;
        if (!existingIds.has(ep.id) && broadFilter(ep)) extras.push(ep);
      }
      return [...primary, ...extras];
    }

    // Primary strict picks
    const macroMarket = pick(ep => ep.topics.some(t => t === "Markets" || t === "Macro"));
    const maPrivate   = pick(ep => ep.topics.some(t => t === "M&A"     || t === "Private Markets"));
    const venture     = pick(ep => ep.topics.some(t => t === "Venture"  || t === "Tech / AI"));
    const company     = pick(ep => ep.topics.some(t => t === "Company"));
    const quick       = pick(ep => ep.duration_seconds > 0 && ep.duration_seconds < 900, 8);
    const longForm    = pick(ep => ep.duration_seconds >= 2700, 8);

    return {
      macroMarket: backfill(macroMarket, ep => ep.topics.some(t => ["Markets", "Macro", "Geopolitical", "Company"].includes(t))),
      maPrivate:   backfill(maPrivate,   ep => ep.topics.some(t => ["M&A", "Private Markets", "Company", "Venture"].includes(t))),
      venture:     backfill(venture,     ep => ep.topics.some(t => ["Venture", "Tech / AI", "Company", "Markets"].includes(t))),
      company:     backfill(company,     ep => ep.topics.some(t => ["Company", "Tech / AI", "Markets", "M&A"].includes(t))),
      quick,
      longForm,
    };
  }, [data]);

  return { rails, isLoading, totalEpisodes: data?.length ?? 0, allEpisodes: data ?? [] };
}
