"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useFeed } from "@/hooks/useFeed";
import { useSaved } from "@/hooks/useSaved";
import { useFeedFreshness } from "@/hooks/useFeedFreshness";
import { useWatchlist } from "@/hooks/useWatchlist";
import { TodaysTake } from "@/components/feed/TodaysTake";
import { TopStoriesGrid } from "@/components/feed/TopStoriesGrid";
import { FilterChips } from "@/components/feed/FilterChips";
import { ClusterStream } from "@/components/feed/ClusterStream";
import { WhatMattersNow } from "@/components/feed/WhatMattersNow";
import { MarketNarrativeNetwork } from "@/components/feed/MarketNarrativeNetwork";
import { NewStoriesBanner } from "@/components/feed/NewStoriesBanner";
import { FilterDrawer } from "@/components/layout/FilterDrawer";
import { SettingsModal } from "@/components/layout/SettingsModal";
import { TopNav } from "@/components/layout/TopNav";
import type { FeedItem } from "@/lib/types";

function formatAge(seconds: number): string {
  if (seconds < 60)   return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

const PAGE_SIZE = 20;

export default function HomePage() {
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const { data, isLoading, isFetching, error, params, refresh, updateParams } = useFeed();
  const { savedIds, toggleSave } = useSaved();
  const { hasNew, cacheAgeSeconds } = useFeedFreshness({
    currentGeneratedAt: data?.generated_at,
  });
  const { watchlist } = useWatchlist();

  // Build a Set of lowercase watched entity names for O(1) lookups in cards
  const watchedEntities = useMemo(
    () => new Set(watchlist.map(w => w.id.toLowerCase())),
    [watchlist],
  );

  // Track new cluster IDs across refreshes for the "New" badge
  useEffect(() => {
    if (!data?.clusters) return;
    const current = new Set(data.clusters.map(c => c.id));
    if (prevIdsRef.current.size > 0) {
      setNewIds(new Set([...current].filter(id => !prevIdsRef.current.has(id))));
    }
    prevIdsRef.current = current;
  }, [data?.clusters]);

  // Reset pagination when category filter or data snapshot changes
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [activeCategory, data?.generated_at]);

  const allClusters = useMemo(() => {
    const clusters = data?.clusters ?? [];
    return activeCategory
      ? clusters.filter(c => c.primary.category === activeCategory)
      : clusters;
  }, [data?.clusters, activeCategory]);
useEffect(() => {
  if (error) {
    console.error("[feed page] ✗ query error:", error);
  } else if (!isLoading && data === undefined) {
    console.error("[feed page] ✗ data is undefined after load — query failed silently");
  } else {
    console.log(
      "[feed page] raw clusters:", data?.clusters?.length ?? 0,
      "| category filter:", activeCategory || "(none)",
      "| visible:", allClusters.length,
    );
  }
  // Today's Take diagnostic — log the exact value so we can confirm it arrives
  console.log(
    "[feed page] market_take:",
    data === undefined ? "(no data yet)" : JSON.stringify(data.market_take),
    "| isLoading:", isLoading,
  );
}, [data, error, isLoading, activeCategory, allClusters.length]);

  const visibleClusters = allClusters.slice(0, visibleCount);
  const hasMore         = visibleCount < allClusters.length;

  const handleSave = useCallback((item: FeedItem) => toggleSave(item), [toggleSave]);

  return (
    <>
      <TopNav
        onRefresh={() => refresh(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        isRefreshing={isFetching}
      />

      <NewStoriesBanner
        visible={hasNew && !isFetching}
        onLoad={() => refresh(false)}
      />

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        params={params}
        onChange={updateParams}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        modelName=""
        onChange={() => {}}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 relative">
        {/* Atmospheric depth layer — tonal continuity from MNN graph downward */}
        <div className="absolute inset-x-0 top-0 pointer-events-none -z-10"
          style={{
            height: "65vh",
            background: "radial-gradient(ellipse 90% 55% at 50% 0%, rgba(8,20,46,0.28) 0%, transparent 100%)",
          }} />

        {/* ── Market Narrative Network graph ──────────────────────── */}
        <MarketNarrativeNetwork />

        {/* ── Today's Take hero ──────────────────────────────────── */}
        <TodaysTake
          text={data?.market_take}
          brief={data?.market_brief}
          isLoading={isLoading}
        />

        {/* ── What Matters Now theme cards ─────────────────────────── */}
        <WhatMattersNow
          items={data?.what_matters_now ?? []}
          isLoading={isLoading}
          themes={data?.theme_intelligence ?? []}
        />

        {/* ── Top Stories 5-card grid ─────────────────────────────── */}
        <TopStoriesGrid
          stories={data?.top_stories ?? {
            top_deal: null, top_macro: null,
            top_single_name: null, top_price_move: null, top_policy_risk: null,
          }}
          savedIds={savedIds}
          onSave={handleSave}
          isLoading={isLoading}
        />

        {/* ── Sticky filter chip bar ──────────────────────────────── */}
        <FilterChips
          activeCategory={activeCategory}
          onChange={setActiveCategory}
          onOpenDrawer={() => setDrawerOpen(true)}
          totalCount={data?.total}
          filteredCount={visibleClusters.length}
        />

        {/* ── Clustered Market Stream ──────────────────────────────── */}
        <ClusterStream
          clusters={visibleClusters}
          savedIds={savedIds}
          newIds={newIds}
          onSave={handleSave}
          isLoading={isLoading}
          watchedEntities={watchedEntities.size > 0 ? watchedEntities : undefined}
        />

        {/* ── Show more ───────────────────────────────────────────── */}
        {!isLoading && hasMore && (
          <div className="flex justify-center mt-4">
            <button
              onClick={() => setVisibleCount(n => n + PAGE_SIZE)}
              className="text-xs font-medium text-accent/80 hover:text-accent px-4 py-2
                         rounded-lg transition-colors duration-150"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            >
              Show {Math.min(PAGE_SIZE, allClusters.length - visibleCount)} more
              <span className="ml-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                ({allClusters.length - visibleCount} remaining)
              </span>
            </button>
          </div>
        )}

        {/* ── Feed meta footer ────────────────────────────────────── */}
        {data && !isLoading && (
          <p className="text-center text-2xs mt-6 pb-8"
            style={{ color: "rgba(255,255,255,0.28)" }}>
            {data.total} stories · {data.sources.length} sources
            {Object.keys(data.errors).length > 0 && (
              <span style={{ color: "rgba(255,255,255,0.20)" }}>
                {" "}· {Object.keys(data.errors).length} source{Object.keys(data.errors).length > 1 ? "s" : ""} unavailable
              </span>
            )}
            {" "}· updated {formatAge(cacheAgeSeconds)}
            {data.is_stale && (
              <span className="text-amber-500/60"> · refreshing…</span>
            )}
          </p>
        )}
      </div>
    </>
  );
}
