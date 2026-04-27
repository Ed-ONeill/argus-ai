"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Headphones, Zap, Clock, TrendingUp } from "lucide-react";
import { useListen } from "@/hooks/useListen";
import { ListenHero } from "@/components/listen/ListenHero";
import { TopicFilterBar } from "@/components/listen/TopicFilterBar";
import { EpisodeSection } from "@/components/listen/EpisodeSection";
import { MiniPlayer } from "@/components/listen/MiniPlayer";
import type { Episode } from "@/lib/types";

// Episodes shorter than this are "Quick Listens"
const QUICK_THRESHOLD  = 20 * 60;   // 20 min
// Episodes longer than this are "Deep Dives"
const DEEP_THRESHOLD   = 45 * 60;   // 45 min

// ── Section freshness caps (mirror api/podcast_feeds.py SECTION_FRESHNESS_CAPS) ──
// Hard age limits applied when slicing the episode pool into page rails.
// Raise a value to allow older episodes into that section; lower to tighten it.
const RAIL_CAPS = {
  trending:  96,    // Trending Now:  4 days  (loosened from 3d)
  quick:     96,    // Quick Listens: 4 days  (loosened from 3d)
  deep:     168,    // Deep Dives:    7 days  (unchanged)
  latest:   168,    // Latest:        7 days  (loosened from 4d)
};

// ── All-tab editorial diversity constants ──────────────────────────────────────
// Applied only on the All tab (activeTopic === "").  Topic tabs are unaffected.
//
// ALL_TAB_MAX_PER_TOPIC_PER_RAIL — hard cap: how many episodes from one primary
//   topic can appear in a single rail before the rest are pushed to overflow.
//   2 = at most 2 Geopolitical episodes in Trending Now.
//
// ALL_TAB_MIN_DISTINCT_TOPICS — documentation target: with maxPerTopic=2 and
//   limit=4, Trending naturally reaches 2–4 distinct topics.  Raise this only if
//   you need to add enforcement logic later.
//
// ALL_TAB_UNDERREP_BOOST — fractional score multiplier applied to episodes from
//   topics that appear below the pool median frequency.  Nudges underrepresented
//   topics (e.g. Private Markets, M&A) higher before the cap pass runs, without
//   overriding the underlying relevance ordering for well-covered topics.
const ALL_TAB_MAX_PER_TOPIC_PER_RAIL = 2;     // max slots per primary topic per rail
const ALL_TAB_MIN_DISTINCT_TOPICS    = 3;     // target distinct topics in Trending (informational)
const ALL_TAB_UNDERREP_BOOST         = 0.15;  // +15 % effective score for underrepresented topics

// ── Hybrid composition constants ───────────────────────────────────────────────
// Controls how briefings are rationed across rails after the pool-level cap in
// useListen.ts (MIN_PODCAST_SHARE) has already trimmed the combined feed.
//
// Per-rail briefing caps (All tab, 4-slot rails):
//   MAX_BRIEFINGS_TRENDING  — ≤ 2 briefings in Trending Now
//   MAX_BRIEFINGS_QUICK     — ≤ 2 briefings in Quick Listens
//   MAX_BRIEFINGS_DEEP      — ≤ 1 briefing in Deep Dives (briefings are 2–6 min
//                             so duration filter usually removes them; cap is a
//                             safety net)
//   MAX_BRIEFINGS_LATEST_RAIL — 4 briefings in 12-slot Latest rail (≈ 33 %)
//
// Per-rail podcast minimums (All tab only, applied before briefing fill):
//   MIN_PODCASTS_TRENDING / MIN_PODCASTS_QUICK — guarantee at least this many
//     podcast slots in 4-slot rails when the pool contains enough podcasts.
//     Set to 2 so at most half the rail is briefings even when briefings outscore
//     podcasts on raw relevance.
//
// CROSS_RAIL_DEDUP_ENABLED — prevent the same card appearing in multiple rails.
//   Rail priority: Featured → Trending → Quick → Deep → Latest.
// BRIEFING_TOP_UP_ONLY — documents intent: briefings supplement, never lead.
const MAX_BRIEFINGS_TRENDING  = 2;    // ≤ 2 briefings in Trending Now (4-slot rail)
const MAX_BRIEFINGS_QUICK     = 2;    // ≤ 2 briefings in Quick Listens (4-slot rail)
const MAX_BRIEFINGS_DEEP      = 1;    // ≤ 1 briefing  in Deep Dives   (4-slot rail)
const MAX_BRIEFINGS_LATEST_RAIL = 4;  // ≤ 4 briefings in Latest Episodes (12-slot rail)
const MIN_PODCASTS_TRENDING   = 2;    // guarantee ≥ 2 podcast slots in Trending Now
const MIN_PODCASTS_QUICK      = 2;    // guarantee ≥ 2 podcast slots in Quick Listens
const CROSS_RAIL_DEDUP_ENABLED  = true; // prevent cross-rail card repetition
const BRIEFING_TOP_UP_ONLY      = true; // briefings supplement, don't lead (informational)

function ageHours(ep: Episode): number {
  try {
    return (Date.now() - new Date(ep.published_at).getTime()) / 3_600_000;
  } catch {
    return 168;
  }
}

/**
 * Cap briefing cards in a pre-sorted rail slice.
 *
 * Walks the array in order (highest-ranked first).  Admits up to `maxBriefings`
 * briefing items into `selected`; additional briefings are pushed to `overflow`
 * so the rail can still fill its limit from podcasts.
 * Returns [...selected, ...overflow] — callers must `.slice(0, limit)` after.
 */
function capBriefingsInRail(eps: Episode[], maxBriefings: number): Episode[] {
  let briefingCount = 0;
  const selected: Episode[] = [];
  const overflow: Episode[] = [];
  for (const ep of eps) {
    if (ep.is_briefing) {
      if (briefingCount < maxBriefings) {
        briefingCount++;
        selected.push(ep);
      } else {
        overflow.push(ep);
      }
    } else {
      selected.push(ep);
    }
  }
  return [...selected, ...overflow];
}

/**
 * Source-balanced rail selector (All tab, 4-slot rails).
 *
 * Root cause this fixes: allTabScoreSelect(pool, 4) can return all-briefings when
 * briefings outscore podcasts on raw relevance.  capBriefingsInRail then has no
 * podcasts in its 4-item input to swap in, so excess briefings stay in overflow
 * and .slice(0,4) still yields all-briefings.
 *
 * This function works on a FULLY sorted pool (pass allTabScoreSelect with
 * limit = pool.length so every candidate is ranked but not truncated):
 *
 *   Phase 1 — podcast guarantee: admit the top minPodcasts podcast items from
 *     the sorted pool.  Stops early if the pool has fewer podcasts than minPodcasts.
 *   Phase 2 — briefing fill: admit up to maxBriefings briefing items.
 *   Phase 3 — backfill: fill any remaining slots from the full sorted pool
 *     (uses whatever content type is next, honours limit strictly).
 *
 * Returns exactly limit items (or fewer if pool is smaller).
 */
function sourceBalancedSelect(
  eps:          Episode[],
  limit:        number,
  minPodcasts:  number,
  maxBriefings: number,
): Episode[] {
  const podcastPool  = eps.filter(e => !e.is_briefing);
  const briefingPool = eps.filter(e => e.is_briefing);

  const usedIds = new Set<string>();
  const result: Episode[] = [];

  function admit(ep: Episode): boolean {
    if (usedIds.has(ep.id) || result.length >= limit) return false;
    usedIds.add(ep.id);
    result.push(ep);
    return true;
  }

  // Phase 1: guarantee podcast slots
  const podcastTarget = Math.min(minPodcasts, podcastPool.length);
  for (const ep of podcastPool) {
    if (result.filter(e => !e.is_briefing).length >= podcastTarget) break;
    admit(ep);
  }

  // Phase 2: fill briefing slots
  let briefingAdmitted = 0;
  for (const ep of briefingPool) {
    if (briefingAdmitted >= maxBriefings) break;
    if (admit(ep)) briefingAdmitted++;
  }

  // Phase 3: backfill remaining slots from the full sorted pool
  for (const ep of eps) {
    if (result.length >= limit) break;
    admit(ep);
  }

  return result;
}

// ── All-tab diversity helpers ──────────────────────────────────────────────────

function _topicOf(ep: Episode): string {
  return ep.topics[0] ?? "Other";
}

/**
 * Diversity-aware selector for All-tab score-sorted rails (Trending, Quick, Deep).
 *
 * Algorithm:
 *   1. Compute topic frequency in the pool.  Topics appearing below the median
 *      frequency receive a +underrepBoost fractional score boost so they sort
 *      higher before capping — this surfaces thin categories like M&A or Private
 *      Markets without overriding strong high-frequency content.
 *   2. Sort by (primary-before-secondary, boosted relevance_score desc).
 *   3. Walk the sorted list: admit up to maxPerTopic per primary topic into
 *      `selected`; everything else goes to `overflow`.
 *   4. Return [...selected, ...overflow].slice(0, limit) so the rail always
 *      fills even when one topic dominates the available pool.
 */
function allTabScoreSelect(
  eps:           Episode[],
  limit:         number,
  maxPerTopic:   number,
  underrepBoost: number,
): Episode[] {
  if (eps.length === 0) return [];

  const freq: Record<string, number> = {};
  for (const ep of eps) freq[_topicOf(ep)] = (freq[_topicOf(ep)] ?? 0) + 1;
  const vals   = Object.values(freq).sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)] ?? 1;

  const effScore = (ep: Episode) =>
    ep.relevance_score * ((freq[_topicOf(ep)] ?? 0) < median ? 1 + underrepBoost : 1);

  const sorted = [...eps].sort((a, b) => {
    if (a.is_secondary !== b.is_secondary) return a.is_secondary ? 1 : -1;
    return effScore(b) - effScore(a);
  });

  const counts:   Record<string, number> = {};
  const selected: Episode[] = [];
  const overflow: Episode[] = [];
  for (const ep of sorted) {
    const t = _topicOf(ep);
    if ((counts[t] ?? 0) < maxPerTopic) {
      counts[t] = (counts[t] ?? 0) + 1;
      selected.push(ep);
    } else {
      overflow.push(ep);
    }
  }
  return [...selected, ...overflow].slice(0, limit);
}

/**
 * Diversity-aware selector for All-tab Latest Episodes (date-sorted).
 * Same per-topic cap logic as allTabScoreSelect but sorted by published_at desc.
 * No underrep boost — recency order is preserved; diversity comes from capping.
 */
function allTabDateSelect(
  eps:         Episode[],
  limit:       number,
  maxPerTopic: number,
): Episode[] {
  if (eps.length === 0) return [];

  const sorted = [...eps].sort((a, b) => {
    if (a.is_secondary !== b.is_secondary) return a.is_secondary ? 1 : -1;
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
  });

  const counts:   Record<string, number> = {};
  const selected: Episode[] = [];
  const overflow: Episode[] = [];
  for (const ep of sorted) {
    const t = _topicOf(ep);
    if ((counts[t] ?? 0) < maxPerTopic) {
      counts[t] = (counts[t] ?? 0) + 1;
      selected.push(ep);
    } else {
      overflow.push(ep);
    }
  }
  return [...selected, ...overflow].slice(0, limit);
}

export default function ListenPage() {
  const [activeTopic, setActiveTopic] = useState("");
  const [playing,     setPlaying]     = useState<Episode | null>(null);
  const [savedIds,    setSavedIds]    = useState<string[]>([]);

  // useListen fetches /api/listen/?topic=<topic> when a topic is active,
  // so the backend applies its hard age caps before the data arrives here.
  const { episodes, isLoading, isFallback } = useListen(activeTopic);

  function toggleSave(ep: Episode) {
    setSavedIds(prev =>
      prev.includes(ep.id) ? prev.filter(id => id !== ep.id) : [...prev, ep.id],
    );
  }

  // ── Derived episode lists ──────────────────────────────────────────────────

  // "All" view: backend marks the globally best episode is_featured=true.
  // Topic view: no episode has is_featured=true (flag is global); fall back to
  // the top-scored episode in the topic-filtered set (already sorted by server).
  const featured = useMemo(() => {
    const flagged = episodes.find(e => e.is_featured);
    if (flagged) return flagged;
    return activeTopic ? (episodes[0] ?? null) : null;
  }, [episodes, activeTopic]);

  // Split the combined pool for debug accounting (mirrors useListen internal split).
  const podcasts  = useMemo(() => episodes.filter(e => !e.is_briefing), [episodes]);
  const briefings = useMemo(() => episodes.filter(e => e.is_briefing),  [episodes]);

  // Server already filtered by topic — just exclude whichever episode is featured.
  const filtered = useMemo(() => {
    const featuredId = featured?.id;
    // combined is the full merged pool; every rail is built from this
    const combined = episodes.filter(e => e.id !== featuredId);
    console.log("[Listen Debug]", {
      total:    episodes.length,
      podcasts: podcasts.length,
      briefings: briefings.length,
      combined: combined.length,
    });
    return combined;
  }, [episodes, featured, podcasts.length, briefings.length]);

  // Secondary-aware sort helpers — primary items always rank above secondary ones.
  // Within each group the original ordering criterion (score or date) is preserved.
  function secondaryLast(
    a: { is_secondary: boolean },
    b: { is_secondary: boolean },
  ): -1 | 0 | 1 {
    if (a.is_secondary === b.is_secondary) return 0;
    return a.is_secondary ? 1 : -1;
  }

  // Age-gate helper: secondary episodes bypass the cap — the backend already
  // applied its own freshness filter; client caps must not silently drop fallback fill.
  function withinCap(ep: Episode, capH: number): boolean {
    return ep.is_secondary || ageHours(ep) <= capH;
  }

  // ── Rails (single memo for cross-rail deduplication) ──────────────────────
  //
  // All four rails are computed together so they share a `usedIds` set.
  // Rail priority order: Featured (pre-seeded) → Trending → Quick → Deep → Latest.
  // An item placed in an earlier rail is excluded from all later rails, preventing
  // the same card from appearing multiple times on the page.
  //
  // Per-rail briefing caps (capBriefingsInRail) ensure podcasts remain the
  // dominant content type even when the briefings pipeline is very active.
  const { trending, quickListens, deepDives, latest } = useMemo(() => {
    // Seed dedup set with the featured episode so it never reappears in a rail.
    const usedIds = new Set<string>(featured?.id ? [featured.id] : []);

    function dedup(eps: Episode[]): Episode[] {
      return CROSS_RAIL_DEDUP_ENABLED ? eps.filter(e => !usedIds.has(e.id)) : eps;
    }
    function markUsed(eps: Episode[]): void {
      eps.forEach(e => usedIds.add(e.id));
    }

    // ── Trending Now ──────────────────────────────────────────────────────────
    // All tab: sort the FULL pool with topic diversity (limit = pool.length so no
    // truncation), then sourceBalancedSelect guarantees ≥ MIN_PODCASTS_TRENDING
    // podcast slots before filling briefings.  Topic tab: score-sort + briefing cap.
    const trendPool = dedup([...filtered].filter(e => withinCap(e, RAIL_CAPS.trending)));
    const trending = !activeTopic
      ? sourceBalancedSelect(
          allTabScoreSelect(trendPool, trendPool.length, ALL_TAB_MAX_PER_TOPIC_PER_RAIL, ALL_TAB_UNDERREP_BOOST),
          4, MIN_PODCASTS_TRENDING, MAX_BRIEFINGS_TRENDING,
        )
      : capBriefingsInRail(
          [...trendPool].sort((a, b) => secondaryLast(a, b) || b.relevance_score - a.relevance_score).slice(0, 8),
          MAX_BRIEFINGS_TRENDING,
        ).slice(0, 4);
    console.debug("[Rail Debug] trending:", {
      podcasts:  trending.filter(e => !e.is_briefing).length,
      briefings: trending.filter(e =>  e.is_briefing).length,
    });
    markUsed(trending);

    // ── Quick Listens ─────────────────────────────────────────────────────────
    // Same pattern as Trending: expand candidate pool to pool.length before
    // sourceBalancedSelect so briefing overflow actually surfaces podcasts.
    const quickPool = dedup(
      filtered.filter(e => e.duration_seconds < QUICK_THRESHOLD && withinCap(e, RAIL_CAPS.quick)),
    );
    const quickListens = !activeTopic
      ? sourceBalancedSelect(
          allTabScoreSelect(quickPool, quickPool.length, ALL_TAB_MAX_PER_TOPIC_PER_RAIL, ALL_TAB_UNDERREP_BOOST),
          4, MIN_PODCASTS_QUICK, MAX_BRIEFINGS_QUICK,
        )
      : capBriefingsInRail(quickPool.slice(0, 8), MAX_BRIEFINGS_QUICK).slice(0, 4);
    console.debug("[Rail Debug] quickListens:", {
      podcasts:  quickListens.filter(e => !e.is_briefing).length,
      briefings: quickListens.filter(e =>  e.is_briefing).length,
    });
    markUsed(quickListens);

    // ── Deep Dives ────────────────────────────────────────────────────────────
    // Briefings are always 2–6 min so the duration filter (>= 45 min) removes them
    // naturally.  Cap set to 1 as a safety net; no podcast-min needed since the pool
    // is almost exclusively podcasts by construction.
    const deepPool = dedup(
      filtered.filter(e => e.duration_seconds >= DEEP_THRESHOLD && withinCap(e, RAIL_CAPS.deep)),
    );
    const deepRaw = !activeTopic
      ? allTabScoreSelect(deepPool, deepPool.length, ALL_TAB_MAX_PER_TOPIC_PER_RAIL, ALL_TAB_UNDERREP_BOOST)
      : [...deepPool].sort((a, b) => secondaryLast(a, b) || b.relevance_score - a.relevance_score);
    const deepDives = capBriefingsInRail(deepRaw, MAX_BRIEFINGS_DEEP).slice(0, 4);
    console.debug("[Rail Debug] deepDives:", {
      podcasts:  deepDives.filter(e => !e.is_briefing).length,
      briefings: deepDives.filter(e =>  e.is_briefing).length,
    });
    markUsed(deepDives);

    // ── Latest Episodes ───────────────────────────────────────────────────────
    // Higher briefing cap (4/12 ≈ 33 %) since the rail is larger.
    // Items already shown above are excluded via usedIds.
    const latestPool = dedup([...filtered].filter(e => withinCap(e, RAIL_CAPS.latest)));
    const latestRaw  = !activeTopic
      ? allTabDateSelect(latestPool, 12, ALL_TAB_MAX_PER_TOPIC_PER_RAIL)
      : latestPool
          .sort((a, b) =>
            secondaryLast(a, b) ||
            new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
          )
          .slice(0, 12);
    const latest = capBriefingsInRail(latestRaw, MAX_BRIEFINGS_LATEST_RAIL).slice(0, 12);
    console.debug("[Rail Debug] latest:", {
      podcasts:  latest.filter(e => !e.is_briefing).length,
      briefings: latest.filter(e =>  e.is_briefing).length,
    });

    return { trending, quickListens, deepDives, latest };
  }, [filtered, activeTopic, featured]);

  // ── Skeleton ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-7">
        <div className="mb-6">
          <div className="h-6 w-24 bg-raised rounded animate-pulse mb-2" />
          <div className="h-4 w-64 bg-raised rounded animate-pulse" />
        </div>
        <div className="h-[200px] bg-raised rounded-xl animate-pulse mb-6" />
        <div className="flex gap-2 mb-6 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 w-20 bg-raised rounded-full animate-pulse shrink-0" />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[220px] bg-raised rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`max-w-5xl mx-auto px-4 sm:px-6 py-7 ${playing ? "pb-24" : ""}`}>

        {/* ── Page header ────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2 mb-1">
            <Headphones size={18} className="text-navy" />
            <h1 className="text-xl font-semibold text-ink">Listen</h1>
          </div>
          <p className="text-sm text-ink-secondary">
            Curated business, markets, and finance audio
          </p>
        </motion.div>

        {/* ── Fallback notice ────────────────────────────────────────────────── */}
        {isFallback && (
          <p className="text-xs text-ink-muted mb-4 italic">
            Live sources are refreshing — check back shortly
          </p>
        )}

        {/* ── Featured hero ──────────────────────────────────────────────────── */}
        {featured && (
          <ListenHero
            episode={featured}
            isSaved={savedIds.includes(featured.id)}
            onSave={() => toggleSave(featured)}
            onPlay={setPlaying}
          />
        )}

        {/* ── Topic filter bar ───────────────────────────────────────────────── */}
        <div className="mb-7">
          <TopicFilterBar active={activeTopic} onChange={setActiveTopic} />
        </div>

        {/* ── Trending Now ───────────────────────────────────────────────────── */}
        <EpisodeSection
          title="Trending Now"
          icon={<TrendingUp size={13} />}
          episodes={trending}
          savedIds={savedIds}
          onSave={toggleSave}
          onPlay={setPlaying}
          columns={4}
        />

        {/* ── Quick Listens ──────────────────────────────────────────────────── */}
        <EpisodeSection
          title="Quick Listens"
          subtitle="Under 20 min"
          icon={<Zap size={13} />}
          episodes={quickListens}
          savedIds={savedIds}
          onSave={toggleSave}
          onPlay={setPlaying}
          columns={4}
        />

        {/* ── Deep Dives ─────────────────────────────────────────────────────── */}
        <EpisodeSection
          title="Deep Dives"
          subtitle="45 min+"
          icon={<Clock size={13} />}
          episodes={deepDives}
          savedIds={savedIds}
          onSave={toggleSave}
          onPlay={setPlaying}
          columns={2}
        />

        {/* ── Latest Episodes ────────────────────────────────────────────────── */}
        <EpisodeSection
          title="Latest Episodes"
          episodes={latest}
          savedIds={savedIds}
          onSave={toggleSave}
          onPlay={setPlaying}
          variant="list"
        />

        {/* ── Empty state ────────────────────────────────────────────────────── */}
        {episodes.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-20 text-center text-ink-muted"
          >
            <Headphones size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No episodes match this topic.</p>
            <p className="text-xs mt-1 opacity-70">Try selecting a different filter above.</p>
          </motion.div>
        )}

      </div>

      {/* ── Mini player ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {playing && (
          <MiniPlayer
            episode={playing}
            onClose={() => setPlaying(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
