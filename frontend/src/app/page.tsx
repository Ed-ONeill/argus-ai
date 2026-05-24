"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { useFeed } from "@/hooks/useFeed";
import { useSaved } from "@/hooks/useSaved";
import { useFeedFreshness } from "@/hooks/useFeedFreshness";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useMarketState } from "@/hooks/useMarketState";
import type { MarketSignal } from "@/hooks/useMarketState";
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

// ── Cross-asset pressure signals — regime-derived ─────────────────────────────

function deriveCrossAsset(regime: string) {
  const r        = regime.toLowerCase();
  const isOn     = r.includes("risk-on")  || r.includes("expansion") || r.includes("dovish") || r.includes("easing");
  const isOff    = r.includes("risk-off") || r.includes("tighten")   || r.includes("stagflat") || r.includes("shock") || r.includes("hawkish");
  const isTight  = r.includes("tighten")  || r.includes("hawkish")   || r.includes("hike") || r.includes("qt");
  const isEase   = r.includes("easing")   || r.includes("dovish")    || r.includes("cut")  || r.includes("qe");
  const isStagf  = r.includes("stagflat");

  return [
    {
      label: "Yields",
      arrow: isTight ? "↑" : isEase ? "↓" : "→",
      value: isTight ? "Rising"  : isEase   ? "Falling"  : "Stable",
      color: isTight ? "#c8a040" : isEase   ? "#52b0c8"  : "#8898b8",
    },
    {
      label: "Dollar",
      arrow: isOff ? "↑" : isOn ? "↓" : "→",
      value: isOff ? "Bid"    : isOn  ? "Soft"    : "Mixed",
      color: isOff ? "#c8a040" : isOn  ? "#52b0c8" : "#8898b8",
    },
    {
      label: "Gold",
      arrow: (isOff || isStagf) ? "↑" : (isOn && !isStagf) ? "↓" : "→",
      value: (isOff || isStagf) ? "Bid" : (isOn && !isStagf) ? "Soft" : "Flat",
      color: (isOff || isStagf) ? "#c8a040" : "#8898b8",
    },
    {
      label: "Oil",
      arrow: (isOn || isStagf) ? "↑" : (isOff && !isStagf) ? "↓" : "→",
      value: (isOn || isStagf) ? "Bid"  : (isOff && !isStagf) ? "Soft" : "Flat",
      color: (isOn || isStagf) ? "#c8a040" : "#8898b8",
    },
    {
      label: "VIX",
      arrow: isOff ? "↑" : isOn ? "↓" : "→",
      value: isOff ? "Elevated"   : isOn ? "Compressed" : "Moderate",
      color: isOff ? "#b05858"    : isOn ? "#52b0c8"    : "#8898b8",
    },
    {
      label: "Spreads",
      arrow: isOff ? "↑" : isOn ? "↓" : "→",
      value: isOff ? "Widening"   : isOn ? "Tightening" : "Stable",
      color: isOff ? "#b05858"    : isOn ? "#52b0c8"    : "#8898b8",
    },
  ];
}

function CrossAssetBar({
  regime,
  liveSignals,
}: {
  regime:       string;
  liveSignals?: MarketSignal[];
}) {
  const hasLive = !!liveSignals?.length;
  if (!regime && !hasLive) return null;
  const signals = hasLive ? liveSignals! : deriveCrossAsset(regime);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="-mx-4 sm:-mx-6 px-5 sm:px-7 py-2.5 mb-5 flex items-center gap-0"
      style={{
        background:   "rgba(4,8,20,0.92)",
        borderTop:    "1px solid rgba(255,255,255,0.042)",
        borderBottom: "1px solid rgba(255,255,255,0.042)",
      }}
    >
      <span className="text-[6px] font-bold uppercase tracking-[0.20em] shrink-0 pr-4 mr-3"
        style={{ color: "rgba(255,255,255,0.24)", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
        Cross-Asset
      </span>
      <div className="flex items-center gap-5 flex-wrap flex-1">
        {signals.map(s => (
          <div key={s.label} className="flex items-center gap-1">
            <span className="text-[9px] font-bold leading-none" style={{ color: s.color }}>{s.arrow}</span>
            <span className="text-[7px] ml-0.5" style={{ color: "rgba(255,255,255,0.30)" }}>{s.label}</span>
            <span className="text-[8.5px] font-semibold ml-0.5" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>
      <span className="text-[7px] shrink-0 italic" style={{ color: "rgba(255,255,255,0.16)" }}>
        {hasLive ? "live" : "regime-derived"}
      </span>
    </motion.div>
  );
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
  const ms = useMarketState();

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

        {/* Primary radial glow — deep navy bleed from graph anchor, extends far into content */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 130% 75% at 50% 0%, rgba(8,22,66,0.62) 0%, rgba(6,14,44,0.28) 38%, transparent 68%)",
          }} />

        {/* Secondary ambient field — left asymmetric depth */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 60% 38% at 14% 55%, rgba(8,18,46,0.28) 0%, transparent 72%)",
          }} />

        {/* Tertiary ambient — right-side asymmetric field */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 50% 32% at 86% 68%, rgba(6,12,36,0.18) 0%, transparent 72%)",
          }} />

        {/* Quaternary — mid-page atmospheric depth, prevents hard surface transition */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 90% 28% at 50% 48%, rgba(5,12,34,0.20) 0%, transparent 65%)",
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

          {/* ── Data channel bridge: graph → cross-asset → intelligence ── */}
          <div className="flex items-center gap-3 mb-4">
            <div className="shrink-0 w-px h-5"
              style={{ background: "linear-gradient(to bottom, rgba(42,96,188,0.50), rgba(255,255,255,0.02))", marginLeft: "3px" }} />
            <span className="text-[6.5px] font-bold uppercase tracking-[0.24em]"
              style={{ color: "rgba(255,255,255,0.18)" }}>
              Intelligence Output
            </span>
            <div className="flex-1 h-px"
              style={{ background: "linear-gradient(to right, rgba(255,255,255,0.04), transparent)" }} />
          </div>

          {/* ── Cross-asset pressure signals ──────────────────────────── */}
          <CrossAssetBar
            regime={data?.market_brief?.market_regime ?? ""}
            liveSignals={ms.hasData ? ms.signals : undefined}
          />

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
            marketIntensity={ms.atmosphereIntensity}
            trendLabel={ms.trend.riskDirection !== "stable" ? ms.trend.label : undefined}
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

          {/* ── Stream entry — atmospheric bridge ──────────────────────── */}
          <div className="flex items-center gap-3 mb-4 mt-1">
            <div className="w-px h-4 shrink-0"
              style={{ background: "linear-gradient(to bottom, rgba(52,200,120,0.28), rgba(255,255,255,0.02))", marginLeft: "3px" }} />
            <div className="flex-1 h-px"
              style={{ background: "linear-gradient(to right, rgba(52,200,120,0.06), transparent)" }} />
          </div>

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
