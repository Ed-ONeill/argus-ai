"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useFeed } from "@/hooks/useFeed";
import { useSaved } from "@/hooks/useSaved";
import { useFeedFreshness } from "@/hooks/useFeedFreshness";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useMarketState } from "@/hooks/useMarketState";
import { MorningBriefing } from "@/components/feed/MorningBriefing";
import { TopStoriesGrid } from "@/components/feed/TopStoriesGrid";
import { FilterChips } from "@/components/feed/FilterChips";
import { ClusterStream } from "@/components/feed/ClusterStream";
import { WhatMattersNow } from "@/components/feed/WhatMattersNow";
import { IntelligenceStrip } from "@/components/feed/IntelligenceStrip";
import { MarketNarrativeNetwork } from "@/components/feed/MarketNarrativeNetwork";
import { NewStoriesBanner } from "@/components/feed/NewStoriesBanner";
import { FilterDrawer } from "@/components/layout/FilterDrawer";
import { SettingsModal } from "@/components/layout/SettingsModal";
import { TopNav } from "@/components/layout/TopNav";
import { ThemeTerminal } from "@/components/themes/ThemeTerminal";
import { ThemeDrawer } from "@/components/themes/ThemeDrawer";
import { useThemeWatchlist } from "@/hooks/useThemeWatchlist";
import { useThemeAlerts } from "@/hooks/useThemeAlerts";
import type { FeedItem, ThemeIntelligence, StoryCluster } from "@/lib/types";

function itemsToFallbackClusters(items: FeedItem[]): StoryCluster[] {
  return items.map(item => ({
    id:            item.id,
    primary:       item,
    related:       [],
    cluster_score: item.signal_score / 100,
    theme_label:   item.category,
    story_count:   1,
  }));
}

function formatAge(seconds: number): string {
  if (seconds < 60)   return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

const PAGE_SIZE = 20;

const GRID_BG = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">'
  + '<path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.018)" stroke-width="0.5"/>'
  + '</svg>'
)}")`;

export default function FeedPage() {
  const [drawerOpen,       setDrawerOpen]       = useState(false);
  const [settingsOpen,     setSettingsOpen]     = useState(false);
  const [terminalOpen,     setTerminalOpen]     = useState(false);
  const [selectedTheme,    setSelectedTheme]    = useState<ThemeIntelligence | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const { data, isLoading, isPending, isFetching, error, params, refresh, updateParams } = useFeed();
  const { savedIds, toggleSave } = useSaved();
  const { hasNew, cacheAgeSeconds } = useFeedFreshness({
    currentGeneratedAt: data?.generated_at,
  });
  const { watchlist } = useWatchlist();
  const { watchedIds, toggle: toggleThemeWatch, isWatched: isThemeWatched } = useThemeWatchlist();
  const themes = useMemo(() => data?.theme_intelligence ?? [], [data?.theme_intelligence]);
  const { hasAlert, alertFor, dismiss: dismissAlert } = useThemeAlerts(themes);
  const ms = useMarketState();
  const isPanic      = ms.regimeTransition && ms.riskRegime === "risk-off";
  const isEuphoric   = ms.trend.acceleration === "accelerating" && ms.riskRegime === "risk-on";
  const isComplacent = ms.volRegime === "low" && ms.riskRegime !== "risk-off";

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

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [params.categories, data?.generated_at]);

  const allClusters    = data?.clusters?.length
    ? data.clusters
    : itemsToFallbackClusters(data?.items ?? []);
  const visibleClusters = allClusters.slice(0, visibleCount);
  const hasMore         = visibleCount < allClusters.length;

  useEffect(() => {
    console.log("[feed]", {
      isPending,
      isLoading,
      isFetching,
      hasError: !!error,
      errorMsg:  error instanceof Error ? error.message : String(error ?? ""),
      dataKeys:  data ? Object.keys(data).join(", ") : "undefined",
      clusters:  data?.clusters?.length ?? "n/a",
      allClusters: allClusters.length,
      visible:   visibleClusters.length,
      params:    JSON.stringify(params),
    });
    if (error) console.error("[feed] ✗ query error:", error);
  }, [data, error, isPending, isLoading, isFetching, allClusters.length, visibleClusters.length, params]);

  const handleSave = useCallback((item: FeedItem) => toggleSave(item), [toggleSave]);

  return (
    <>
      <TopNav
        onRefresh={() => refresh(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenThemeTerminal={() => setTerminalOpen(true)}
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
      />

      {/* ── Theme Terminal ─────────────────────────────────────────────────── */}
      {terminalOpen && (
        <ThemeTerminal
          themes={themes}
          watchedIds={watchedIds}
          hasAlert={hasAlert}
          onToggleWatch={toggleThemeWatch}
          onSelectTheme={t => { setTerminalOpen(false); setSelectedTheme(t); }}
          onClose={() => setTerminalOpen(false)}
        />
      )}

      {/* ── Theme Drawer ───────────────────────────────────────────────────── */}
      {selectedTheme && (
        <ThemeDrawer
          theme={selectedTheme}
          clusters={data?.clusters ?? []}
          deals={[]}
          isWatched={isThemeWatched(selectedTheme.id)}
          hasAlert={hasAlert(selectedTheme.id)}
          alertDirection={alertFor(selectedTheme.id)?.direction}
          onToggleWatch={() => { toggleThemeWatch(selectedTheme.id); dismissAlert(selectedTheme.id); }}
          onClose={() => setSelectedTheme(null)}
        />
      )}

      {/* ── Atmospheric dark environment — unified intelligence system ─────── */}
      <div className="relative" style={{ background: "#030710", minHeight: "calc(100vh - 3.5rem)" }}>

        {/* Depth grid — institutional reference grid behind all layers */}
        <div aria-hidden className="absolute inset-0 pointer-events-none select-none"
          style={{ backgroundImage: GRID_BG, backgroundRepeat: "repeat" }} />

        {/* Primary radial glow — field pressure color bleeds from graph through feed */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            background: ms.riskRegime === "risk-off"
              ? "radial-gradient(ellipse 130% 75% at 50% 0%, rgba(40,8,8,0.55) 0%, rgba(28,6,6,0.22) 38%, transparent 68%)"
              : (ms.volRegime === "elevated" || ms.volRegime === "high")
              ? "radial-gradient(ellipse 130% 75% at 50% 0%, rgba(30,18,4,0.50) 0%, rgba(20,12,4,0.20) 38%, transparent 68%)"
              : "radial-gradient(ellipse 130% 75% at 50% 0%, rgba(8,22,66,0.62) 0%, rgba(6,14,44,0.28) 38%, transparent 68%)",
          }} />

        {/* Secondary ambient field — left asymmetric depth, regime-tinted */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            background: ms.riskRegime === "risk-off"
              ? "radial-gradient(ellipse 60% 38% at 14% 55%, rgba(40,10,10,0.24) 0%, transparent 72%)"
              : (ms.volRegime === "elevated" || ms.volRegime === "high")
              ? "radial-gradient(ellipse 60% 38% at 14% 55%, rgba(30,18,4,0.22) 0%, transparent 72%)"
              : "radial-gradient(ellipse 60% 38% at 14% 55%, rgba(8,18,46,0.28) 0%, transparent 72%)",
          }} />

        {/* Tertiary ambient — right-side asymmetric field, regime-tinted */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            background: ms.riskRegime === "risk-off"
              ? "radial-gradient(ellipse 50% 32% at 86% 68%, rgba(36,8,8,0.16) 0%, transparent 72%)"
              : "radial-gradient(ellipse 50% 32% at 86% 68%, rgba(6,12,36,0.18) 0%, transparent 72%)",
          }} />

        {/* Quaternary — mid-page atmospheric depth, emotionally reactive */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            background: isPanic
              ? "radial-gradient(ellipse 90% 28% at 50% 48%, rgba(40,8,8,0.22) 0%, transparent 65%)"
              : isEuphoric
              ? "radial-gradient(ellipse 90% 28% at 50% 48%, rgba(8,20,68,0.26) 0%, transparent 65%)"
              : isComplacent
              ? "radial-gradient(ellipse 90% 28% at 50% 48%, rgba(22,16,4,0.14) 0%, transparent 65%)"
              : "radial-gradient(ellipse 90% 28% at 50% 48%, rgba(5,12,34,0.20) 0%, transparent 65%)",
          }} />

        {/* New stories banner — sticky inside the dark environment */}
        <NewStoriesBanner
          visible={hasNew && !isFetching}
          onLoad={() => refresh(false)}
        />

        {/* ── Market Narrative Network — full-bleed hero ───────────────────── */}
        <MarketNarrativeNetwork />

        {/* Atmospheric continuity — field pressure color bleeds into intelligence feed */}
        <div aria-hidden className="w-full h-7 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, ${
              ms.riskRegime === "risk-on"  ? "rgba(18,40,90,0.52)"
              : ms.riskRegime === "risk-off"  ? "rgba(50,15,15,0.46)"
              : (ms.volRegime === "elevated" || ms.volRegime === "high") ? "rgba(38,28,8,0.40)"
              : "rgba(5,11,24,0.52)"
            } 0%, transparent 100%)`,
          }} />

        {/* ── Intelligence feed ────────────────────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-14 relative">

          {/* ── Morning Briefing — intelligence anchor ────────────────── */}
          <MorningBriefing
            brief={data?.market_brief}
            isLoading={isLoading}
          />

          {/* ── Narrative pressure themes ──────────────────────────────── */}
          <WhatMattersNow
            items={data?.what_matters_now ?? []}
            isLoading={isLoading}
            themes={data?.theme_intelligence ?? []}
            marketIntensity={ms.atmosphereIntensity}
            trendLabel={ms.trend.riskDirection !== "stable" ? ms.trend.label : undefined}
          />

          {/* ── Intelligence strip — leaderboard + change feed ─────────── */}
          {!isLoading && themes.length > 0 && (
            <IntelligenceStrip themes={themes} />
          )}

          {/* ── Category filter strip ──────────────────────────────────── */}
          <FilterChips
            activeCategory={params.categories ?? ""}
            onChange={(cat) => updateParams({ categories: cat })}
            onOpenDrawer={() => setDrawerOpen(true)}
            totalCount={data?.total}
            filteredCount={visibleClusters.length}
          />

          {/* ── Stream entry bridge ───────────────────────────────────── */}
          <div className="flex items-center gap-3 mb-4 mt-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] shrink-0"
              style={{ color: "rgba(255,255,255,0.32)" }}>
              Live Market Stream
            </span>
            <div className="flex-1 h-px"
              style={{ background: "linear-gradient(to right, rgba(255,255,255,0.05), transparent)" }} />
          </div>

          {/* ── Live Market Stream ────────────────────────────────────── */}
          <ClusterStream
            clusters={visibleClusters}
            savedIds={savedIds}
            newIds={newIds}
            onSave={handleSave}
            isLoading={isPending}
            watchedEntities={watchedEntities.size > 0 ? watchedEntities : undefined}
            themes={themes}
          />

          {/* ── Signal Picks — after stream, by type ─────────────────── */}
          {!isLoading && !hasMore && (
            <TopStoriesGrid
              stories={data?.top_stories ?? {
                top_deal: null, top_macro: null,
                top_single_name: null, top_price_move: null, top_policy_risk: null,
              }}
              savedIds={savedIds}
              onSave={handleSave}
              isLoading={false}
            />
          )}

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
