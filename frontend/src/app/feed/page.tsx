"use client";

import dynamic from "next/dynamic";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useFeed } from "@/hooks/useFeed";
import { useSaved } from "@/hooks/useSaved";
import { useFeedFreshness } from "@/hooks/useFeedFreshness";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useMarketState } from "@/hooks/useMarketState";
import { TopStoriesGrid } from "@/components/feed/TopStoriesGrid";
import { FilterChips } from "@/components/feed/FilterChips";
import { NewStoriesBanner } from "@/components/feed/NewStoriesBanner";
import { FilterDrawer } from "@/components/layout/FilterDrawer";
import { SettingsModal } from "@/components/layout/SettingsModal";
import { TopNav } from "@/components/layout/TopNav";
import { useThemeWatchlist } from "@/hooks/useThemeWatchlist";
import { useThemeAlerts } from "@/hooks/useThemeAlerts";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { rankClusters, rankWhatMattersNow, rankThemes, capEventDominance } from "@/lib/feedRanker";
import { nodeToFocus, buildFocusMatcher, clusterMatchesFocus, wmnMatchesFocus, itemMatchesFocus, focusKindLabel } from "@/lib/feedFocus";
import { formatRelativeAge } from "@/lib/utils";
import type { GraphNode } from "@/lib/graph/types";
import type { FeedItem, ThemeIntelligence, StoryCluster, TopStories } from "@/lib/types";

// Heavy / non-critical pieces kept out of the feed's First Load JS. The Argus
// Market Map (the hero) carries the interactive graph engine, so it is lazily
// chunked and only mounts client-side; the feed is fully client-rendered.
const ArgusMarketMap = dynamic(
  () => import("@/components/feed/ArgusMarketMap").then(m => m.ArgusMarketMap),
  {
    ssr: false,
    loading: () => (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5" aria-hidden>
        <div className="w-full h-[480px] rounded-xl animate-pulse"
          style={{ background: "#0e1424", border: "1px solid rgba(255,255,255,0.06)" }} />
      </div>
    ),
  },
);
// The adaptive intelligence workspace pulls in the theme-intelligence engine
// (which transitively imports the M&A engine), so it is lazily chunked to keep
// the feed's First Load lean — same discipline as the Market Map hero.
const IntelligenceWorkspace = dynamic(
  () => import("@/components/feed/IntelligenceWorkspace").then(m => m.IntelligenceWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="h-[340px] rounded-2xl animate-pulse" style={{ background: "rgba(12,18,32,0.6)", border: "1px solid rgba(255,255,255,0.08)" }} />
    ),
  },
);
// The block-based stream also pulls the theme-intelligence engine (catalysts,
// thesis, memory trend), so it is lazily chunked like the workspace.
const IntelligenceStream = dynamic(
  () => import("@/components/feed/IntelligenceStream").then(m => m.IntelligenceStream),
  {
    ssr: false,
    loading: () => <div className="space-y-2.5">{[0, 1, 2].map(i => <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: "rgba(8,12,20,0.55)", borderLeft: "3px solid rgba(255,255,255,0.06)" }} />)}</div>,
  },
);
const ThemeTerminal = dynamic(
  () => import("@/components/themes/ThemeTerminal").then(m => m.ThemeTerminal),
  { ssr: false },
);
const ThemeDrawer = dynamic(
  () => import("@/components/themes/ThemeDrawer").then(m => m.ThemeDrawer),
  { ssr: false },
);

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

// Hard ceiling on the curated feed — signal density over volume. The gate decides
// what qualifies; this caps how many of the qualifiers we show. Target 10–15
// exceptional stories: if 11 pass, show 11; if 50 pass, show the top 15.
const MAX_FEED_SIZE = 15;
const PAGE_SIZE = MAX_FEED_SIZE;

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

  // ── Market Map controller ──────────────────────────────────────────────────
  // The graph is the operating system for the feed: the selected node puts the
  // page into Focus mode and every section below reflects it. null = Global.
  const [focusNode, setFocusNode] = useState<GraphNode | null>(null);
  const [clearNonce, setClearNonce] = useState(0);
  const exitFocus = useCallback(() => { setFocusNode(null); setClearNonce(n => n + 1); }, []);

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
  const { prefs } = useUserPreferences();
  const isPanic      = ms.regimeTransition && ms.riskRegime === "risk-off";
  const isEuphoric   = ms.trend.acceleration === "accelerating" && ms.riskRegime === "risk-on";
  const isComplacent = ms.volRegime === "low" && ms.riskRegime !== "risk-off";

  const watchedEntities = useMemo(
    () => new Set(watchlist.map(w => w.id.toLowerCase())),
    [watchlist],
  );

  // Map the selected graph node → page focus, then pre-compute the matcher once
  // and reuse it across every section so the page filters in a single pass.
  const focus   = useMemo(() => nodeToFocus(focusNode), [focusNode]);
  const matcher = useMemo(() => (focus ? buildFocusMatcher(focus, themes) : null), [focus, themes]);

  // Stable snapshot reference: selecting a node re-renders the page, and an inline
  // object literal would rebuild the graph model every render — resetting the very
  // selection the user just made. Memoize on the primitive values.
  const mapSnapshot = useMemo(() => ({
    riskRegime:  ms.riskRegime,
    volRegime:   ms.volRegime,
    regimeLabel: ms.trend.riskDirection !== "stable" ? ms.trend.label : undefined,
  }), [ms.riskRegime, ms.volRegime, ms.trend.riskDirection, ms.trend.label]);

  useEffect(() => {
    if (!data?.clusters) return;
    const current = new Set(data.clusters.map(c => c.id));
    if (prevIdsRef.current.size > 0) {
      setNewIds(new Set([...current].filter(id => !prevIdsRef.current.has(id))));
    }
    prevIdsRef.current = current;
  }, [data?.clusters]);

  // Reset pagination on category/data change — and whenever the graph focus moves.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [params.categories, data?.generated_at, focus?.nodeId]);

  const allClusters     = data?.clusters?.length
    ? data.clusters
    : itemsToFallbackClusters(data?.items ?? []);
  // Pipeline: rank + strict quality gate → event-dominance cap (≤2 cards per event)
  // → hard ceiling of MAX_FEED_SIZE. The feed is the shorter of {qualifiers, 25}.
  const rankedClusters  = useMemo(() => rankClusters(allClusters, prefs), [allClusters, prefs]);
  const dedupedClusters = useMemo(() => capEventDominance(rankedClusters), [rankedClusters]);
  const cappedClusters  = useMemo(() => dedupedClusters.slice(0, MAX_FEED_SIZE), [dedupedClusters]);
  // Focus mode: the Live Market Stream reflects whatever is selected in the map.
  const focusedClusters = useMemo(
    () => (matcher ? cappedClusters.filter(c => clusterMatchesFocus(c, matcher)) : cappedClusters),
    [cappedClusters, matcher],
  );
  const visibleClusters = focusedClusters.slice(0, visibleCount);
  const hasMore         = visibleCount < focusedClusters.length;

  // Personalization active → the gate ran, so the ranked list can be much shorter
  // than the raw cluster set. Surface counts so an intentionally short, high-signal
  // feed (and the 25-cap) doesn't read as a loading failure.
  const personalized = (
    prefs.followed_themes.length        > 0 ||
    prefs.followed_sectors.length       > 0 ||
    prefs.followed_asset_classes.length > 0 ||
    !!prefs.user_role || !!prefs.region_focus
  );
  const qualified      = rankedClusters.length;                 // cleared the gate
  const available      = dedupedClusters.length;                // after event-dominance cap
  const belowThreshold = personalized ? Math.max(0, allClusters.length - qualified) : 0;
  const cappedAway     = Math.max(0, available - cappedClusters.length); // available but over the 25-cap

  // Personalize the high-visibility derived sections (not just the stream) so the
  // homepage prioritizes followed themes/sectors within the first screen.
  const personalizedThemes = useMemo(() => rankThemes(themes, prefs), [themes, prefs]);
  const personalizedWmn    = useMemo(
    () => rankWhatMattersNow(data?.what_matters_now ?? [], prefs),
    [data?.what_matters_now, prefs],
  );

  // Focus mode filters the derived intelligence sections too (What Matters Now +
  // the Signal Picks), so the entire page is a reflection of the selected node.
  const focusedWmn = useMemo(
    () => (matcher ? personalizedWmn.filter(w => wmnMatchesFocus(w, matcher)) : personalizedWmn),
    [personalizedWmn, matcher],
  );
  const focusedTopStories = useMemo<TopStories>(() => {
    const base = data?.top_stories ?? { top_deal: null, top_macro: null, top_single_name: null, top_price_move: null, top_policy_risk: null };
    if (!matcher) return base;
    const keep = (it: FeedItem | null) => (it && itemMatchesFocus(it, matcher) ? it : null);
    return {
      top_deal:        keep(base.top_deal),
      top_macro:       keep(base.top_macro),
      top_single_name: keep(base.top_single_name),
      top_price_move:  keep(base.top_price_move),
      top_policy_risk: keep(base.top_policy_risk),
    };
  }, [data?.top_stories, matcher]);

  useEffect(() => {
    if (error) console.error("[feed] query error:", error);
  }, [error]);

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
      {/* Body aligned to the Markets workstation surface (#0A0F1C) for product consistency. */}
      <div className="relative" style={{ background: "#0A0F1C", minHeight: "calc(100vh - 3.5rem)" }}>

        {/* Depth grid — institutional reference grid behind all layers; slow drift
            keeps the surface alive (the system is never frozen). */}
        <div aria-hidden className="tg-drift absolute inset-0 pointer-events-none select-none"
          style={{ backgroundImage: GRID_BG, backgroundRepeat: "repeat" }} />

        {/* Reading scanline — a faint sweep down the page = Argus reading the tape. */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-[42%] pointer-events-none overflow-hidden">
          <div className="tg-scan absolute inset-x-0 h-px"
            style={{ background: "linear-gradient(to right, transparent, rgba(82,176,200,0.22) 35%, rgba(82,176,200,0.30) 50%, rgba(82,176,200,0.22) 65%, transparent)" }} />
        </div>

        {/* Primary radial glow — field pressure color bleeds from graph through feed */}
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            background: ms.riskRegime === "risk-off"
              ? "radial-gradient(ellipse 130% 75% at 50% 0%, rgba(40,8,8,0.55) 0%, rgba(28,6,6,0.22) 38%, transparent 68%)"
              : (ms.volRegime === "elevated" || ms.volRegime === "high")
              ? "radial-gradient(ellipse 130% 75% at 50% 0%, rgba(30,18,4,0.50) 0%, rgba(20,12,4,0.20) 38%, transparent 68%)"
              : "radial-gradient(ellipse 130% 75% at 50% 0%, rgba(8,22,66,0.62) 0%, rgba(6,14,44,0.28) 38%, transparent 68%)",
          }} />

        {/* Secondary ambient field — left asymmetric depth, regime-tinted; breathes (adaptive lighting) */}
        <div aria-hidden className="tg-ambient absolute inset-0 pointer-events-none"
          style={{
            background: ms.riskRegime === "risk-off"
              ? "radial-gradient(ellipse 60% 38% at 14% 55%, rgba(40,10,10,0.24) 0%, transparent 72%)"
              : (ms.volRegime === "elevated" || ms.volRegime === "high")
              ? "radial-gradient(ellipse 60% 38% at 14% 55%, rgba(30,18,4,0.22) 0%, transparent 72%)"
              : "radial-gradient(ellipse 60% 38% at 14% 55%, rgba(8,18,46,0.28) 0%, transparent 72%)",
          }} />

        {/* Tertiary ambient — right-side asymmetric field, regime-tinted; breathes out of phase */}
        <div aria-hidden className="tg-ambient absolute inset-0 pointer-events-none"
          style={{
            animationDelay: "-4.5s",
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

        {/* Transmission wave — a one-shot sweep each time fresh intelligence
            propagates in (re-keyed on the data timestamp). */}
        {data?.generated_at && (
          <div aria-hidden key={data.generated_at} className="absolute inset-x-0 top-0 h-16 pointer-events-none overflow-hidden">
            <div className="tg-wave absolute inset-y-0 w-1/3"
              style={{ background: `linear-gradient(to right, transparent, ${ms.riskRegime === "risk-off" ? "rgba(248,113,113,0.16)" : "rgba(82,176,200,0.16)"}, transparent)` }} />
          </div>
        )}

        {/* New stories banner — sticky inside the dark environment */}
        <NewStoriesBanner
          visible={hasNew && !isFetching}
          onLoad={() => refresh(false)}
        />

        {/* ── Argus Market Map — the operating system for the feed ──────────
            Interactive capital-transmission map (Macro Driver → Theme → Sector →
            Assets) on the reusable graph engine. Selecting a node puts the whole
            page into Focus mode; every section below reflects the selection. */}
        <ArgusMarketMap
          themes={personalizedThemes}
          snapshot={mapSnapshot}
          isLoading={isLoading}
          focus={focus}
          onFocusChange={setFocusNode}
          clearNonce={clearNonce}
        />

        {/* ── Focus mode banner — the page is now reflecting one node ──────── */}
        {focus && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3">
            <div className="flex items-center gap-3 rounded-lg border px-3.5 py-2"
              style={{ borderColor: "rgba(82,176,200,0.28)", background: "linear-gradient(90deg, rgba(82,176,200,0.10), rgba(82,176,200,0.02))" }}>
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="tg-live-dot absolute inline-flex h-full w-full rounded-full" style={{ background: "#7cc7d8" }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "#7cc7d8" }} />
              </span>
              <span className="text-[9px] font-black uppercase tracking-[0.16em]" style={{ color: "#7cc7d8" }}>Focus</span>
              <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                style={{ color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.05)" }}>{focusKindLabel(focus.kind)}</span>
              <span className="text-[13px] font-bold truncate" style={{ color: "rgba(255,255,255,0.94)" }}>{focus.label}</span>
              <span className="text-[10px] tabular-nums hidden sm:inline" style={{ color: "rgba(255,255,255,0.42)" }}>
                {focusedClusters.length} {focusedClusters.length === 1 ? "story" : "stories"} · {focusedWmn.length} signals
              </span>
              <button onClick={exitFocus}
                className="ml-auto shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors hover:bg-white/10"
                style={{ color: "#7cc7d8", border: "1px solid rgba(82,176,200,0.3)", background: "rgba(82,176,200,0.08)" }}>
                Exit to Global Market
              </button>
            </div>
          </div>
        )}

        {/* ── Intelligence Workspace — the selected node, fully decoded ──────
            Replaces the What-Matters-Now card grid with one adaptive Bloomberg-
            style dashboard. The theme behind the selected graph node becomes the
            centerpiece; the whole workspace re-renders as the focus changes. */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
          <IntelligenceWorkspace
            focus={focus}
            themes={personalizedThemes}
            clusters={data?.clusters ?? []}
            isLoading={isLoading}
          />
        </div>

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

        {/* ── Live Market Stream ───────────────────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-1 pb-14 relative">

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

          {/* ── Live Market Stream — heterogeneous intelligence blocks ──── */}
          <IntelligenceStream
            clusters={visibleClusters}
            themes={themes}
            savedIds={savedIds}
            newIds={newIds}
            onSave={handleSave}
            watchedEntities={watchedEntities.size > 0 ? watchedEntities : undefined}
            isLoading={isPending}
          />

          {/* ── Signal Picks — after stream, by type ─────────────────── */}
          {!isLoading && !hasMore && (
            <TopStoriesGrid
              stories={focusedTopStories}
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
                Show {Math.min(PAGE_SIZE, focusedClusters.length - visibleCount)} more
                <span className="ml-1.5" style={{ color: "rgba(255,255,255,0.28)" }}>
                  ({focusedClusters.length - visibleCount} remaining)
                </span>
              </button>
            </div>
          )}

          {/* ── Feed meta footer ──────────────────────────────────────── */}
          {data && !isLoading && (
            <p className="text-center text-2xs mt-8"
              style={{ color: "rgba(255,255,255,0.22)" }}>
              {personalized
                ? `${cappedClusters.length} high-signal ${cappedClusters.length === 1 ? "story" : "stories"}`
                  + (cappedAway > 0 ? ` (top ${MAX_FEED_SIZE} of ${available})` : "")
                  + ` · ${belowThreshold} below quality threshold · ${data.sources.length} sources`
                : `${data.total} stories · ${data.sources.length} sources`}
              {Object.keys(data.errors).length > 0 && (
                <span style={{ color: "rgba(255,255,255,0.16)" }}>
                  {" "}· {Object.keys(data.errors).length} source{Object.keys(data.errors).length > 1 ? "s" : ""} unavailable
                </span>
              )}
              {" "}· updated {formatRelativeAge(cacheAgeSeconds)}
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
