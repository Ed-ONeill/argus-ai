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

// Precomputed grid SVG — subtle institutional depth cue behind the entire feed
const GRID_BG = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">'
  + '<path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.018)" stroke-width="0.5"/>'
  + '</svg>'
)}")`;

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

  const watchedEntities = useMemo(
    () => new Set(watchlist.map(w => w.id.toLowerCase())),
    [watchlist],
  );

  useEffect(() => {
    if (!data?.clusters) return;
    const current = new Set(data.clusters.map(c => c.id));
    if (prevIdsRef.current.size > 0) {
      setNewIds(new Set([...current].filter(id => !prevIdsRef.current.has(id))));
    }
    prevIdsRef.current = current;
  }, [data?.clusters]);

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

      {/* ── Atmospheric dark environment — unified intelligence system ─────── */}
      <div className="relative" style={{ background: "#030710", minHeight: "calc(100vh - 3.5rem)" }}>

        {/* Depth grid — institutional reference grid behind all layers */}
        <div aria-hidden className="absolute inset-0 pointer-events-none select-none"
          style={{ backgroundImage: GRID_BG, backgroundRepeat: "repeat" }} />

        {/* Primary radial glow — emanates downward from MNN regime anchor */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 110% 55% at 50% 0%, rgba(10,28,74,0.52) 0%, transparent 58%)",
          }} />

        {/* Secondary ambient field — left asymmetric depth */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 55% 35% at 18% 60%, rgba(8,16,42,0.22) 0%, transparent 75%)",
          }} />

        {/* Tertiary ambient — right-lower warmth */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 45% 28% at 82% 75%, rgba(6,14,34,0.15) 0%, transparent 75%)",
          }} />

        {/* New stories banner — sticky inside the dark environment */}
        <NewStoriesBanner
          visible={hasNew && !isFetching}
          onLoad={() => refresh(false)}
        />

        {/* ── Market Narrative Network — full-bleed hero ───────────────────── */}
        <MarketNarrativeNetwork />

        {/* ── Intelligence feed ────────────────────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-14 relative">

          {/* ── Market Intelligence panel ─────────────────────────────── */}
          <TodaysTake
            text={data?.market_take}
            brief={data?.market_brief}
            isLoading={isLoading}
          />

          {/* ── Narrative pressure themes ──────────────────────────────── */}
          <WhatMattersNow
            items={data?.what_matters_now ?? []}
            isLoading={isLoading}
            themes={data?.theme_intelligence ?? []}
          />

          {/* ── Top stories by signal type ─────────────────────────────── */}
          <TopStoriesGrid
            stories={data?.top_stories ?? {
              top_deal: null, top_macro: null,
              top_single_name: null, top_price_move: null, top_policy_risk: null,
            }}
            savedIds={savedIds}
            onSave={handleSave}
            isLoading={isLoading}
          />

          {/* ── Category filter strip ──────────────────────────────────── */}
          <FilterChips
            activeCategory={activeCategory}
            onChange={setActiveCategory}
            onOpenDrawer={() => setDrawerOpen(true)}
            totalCount={data?.total}
            filteredCount={visibleClusters.length}
          />

          {/* ── Live Market Stream ────────────────────────────────────── */}
          <ClusterStream
            clusters={visibleClusters}
            savedIds={savedIds}
            newIds={newIds}
            onSave={handleSave}
            isLoading={isLoading}
            watchedEntities={watchedEntities.size > 0 ? watchedEntities : undefined}
          />

          {/* ── Show more ────────────────────────────────────────────── */}
          {!isLoading && hasMore && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => setVisibleCount(n => n + PAGE_SIZE)}
                className="text-xs font-medium px-5 py-2 rounded-lg transition-colors duration-150"
                style={{
                  color: "rgba(255,255,255,0.50)",
                  border: "1px solid rgba(255,255,255,0.09)",
                }}
              >
                Show {Math.min(PAGE_SIZE, allClusters.length - visibleCount)} more
                <span className="ml-1.5" style={{ color: "rgba(255,255,255,0.28)" }}>
                  ({allClusters.length - visibleCount} remaining)
                </span>
              </button>
            </div>
          )}

          {/* ── Feed meta footer ──────────────────────────────────────── */}
          {data && !isLoading && (
            <p className="text-center text-2xs mt-8"
              style={{ color: "rgba(255,255,255,0.22)" }}>
              {data.total} stories · {data.sources.length} sources
              {Object.keys(data.errors).length > 0 && (
                <span style={{ color: "rgba(255,255,255,0.16)" }}>
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
      </div>
    </>
  );
}
