"use client";

import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Headphones, BarChart2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useListenRails } from "@/hooks/useListen";
import { useThemeWatchlist } from "@/hooks/useThemeWatchlist";
import { useThemeAlerts } from "@/hooks/useThemeAlerts";
import { fetchFeed } from "@/lib/api";
import { ConversationHero } from "@/components/listen/ConversationHero";
import { IntelligenceLayer } from "@/components/listen/IntelligenceLayer";
import {
  ProprietarySignals, NarrativeRotation, HighestConviction, CrowdedAndMissing,
  CompaniesAndSectors, PeopleAndFunds, CompanyHeatmap, FirmsDriving, InfluentialEpisodes,
} from "@/components/listen/ListenSections";
import { MiniPlayer } from "@/components/listen/MiniPlayer";
import { ThemeDrawer } from "@/components/themes/ThemeDrawer";
import {
  matchEpisodeThemes,
  getThemeEpisodeGroups,
  generateWhyListen,
} from "@/lib/listenIntelligence";
import type { Episode, ThemeIntelligence, FeedResponse } from "@/lib/types";

function Skeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-7">
      <div className="mb-7">
        <div className="h-6 w-36 bg-raised rounded animate-pulse mb-2" />
        <div className="h-4 w-72 bg-raised rounded animate-pulse" />
      </div>
      {/* Theme cards skeleton */}
      <div className="mb-8 rounded-2xl border border-edge p-4">
        <div className="h-3 w-48 bg-raised rounded animate-pulse mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-raised rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="mb-8">
          <div className="h-4 w-40 bg-raised rounded animate-pulse mb-3.5" />
          <div className="flex gap-3 overflow-hidden">
            {[...Array(4)].map((_, j) => (
              <div key={j} className="w-[240px] h-[260px] bg-raised rounded-xl animate-pulse shrink-0" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ListenPage() {
  const [playing,       setPlaying]       = useState<Episode | null>(null);
  const [savedIds,      setSavedIds]      = useState<string[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<ThemeIntelligence | null>(null);

  // ── Episodes ────────────────────────────────────────────────────────────────
  const { isLoading, totalEpisodes, allEpisodes } = useListenRails();

  // ── Themes (from feed cache — free if feed page was visited) ────────────────
  const { data: feedData } = useQuery<FeedResponse>({
    queryKey:            ["feed", {}],
    queryFn:             () => fetchFeed({}),
    staleTime:           5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const themes = useMemo(() => feedData?.theme_intelligence ?? [], [feedData?.theme_intelligence]);
  const clusters = feedData?.clusters ?? [];

  // ── Theme watchlist + alerts ────────────────────────────────────────────────
  const { toggle: toggleThemeWatch, isWatched: isThemeWatched } = useThemeWatchlist();
  const { hasAlert, alertFor, dismiss: dismissAlert } = useThemeAlerts(themes);

  // ── Episode → theme map (one pass over all episodes) ────────────────────────
  const episodeThemeMap = useMemo(() => {
    const map = new Map<string, ThemeIntelligence[]>();
    if (themes.length === 0) return map;
    for (const ep of allEpisodes) {
      map.set(ep.id, matchEpisodeThemes(ep, themes, 2));
    }
    return map;
  }, [allEpisodes, themes]);

  // ── Episode → "Why Listen" copy (generated when backend text is generic) ────
  const whyListenMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ep of allEpisodes) {
      const primaryTheme = episodeThemeMap.get(ep.id)?.[0] ?? null;
      const copy = generateWhyListen(ep, primaryTheme);
      map.set(ep.id, copy);
    }
    return map;
  }, [allEpisodes, episodeThemeMap]);

  // ── Intelligence derivations ─────────────────────────────────────────────────
  // Full discussed-theme set — the aggregation must run over ALL matched themes,
  // not the top-5 display slice (otherwise bullish/bearish/mentions compute over
  // a tiny window and read blank). The hero takes the top-5 for its momentum viz.
  const allThemeGroups = useMemo(
    () => getThemeEpisodeGroups(allEpisodes, themes),
    [allEpisodes, themes],
  );
  const themeGroups = useMemo(() => allThemeGroups.slice(0, 5), [allThemeGroups]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function toggleSave(ep: Episode) {
    setSavedIds(prev =>
      prev.includes(ep.id) ? prev.filter(id => id !== ep.id) : [...prev, ep.id],
    );
  }

  if (isLoading) return <Skeleton />;

  // Derive a contextual subtitle from top theme
  const topTheme = themeGroups[0]?.theme;
  const contextLine = topTheme
    ? `${topTheme.name} narrative leads market coverage this week`
    : "Real podcasts, curated for institutional market intelligence";

  return (
    <>
      <div className={`max-w-5xl mx-auto px-4 sm:px-6 py-7 ${playing ? "pb-28" : ""}`}>

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
          className="mb-7"
        >
          <div className="flex items-center gap-2 mb-1">
            <Headphones size={18} className="text-navy" />
            <h1 className="text-xl font-semibold text-ink">Listen</h1>
            {totalEpisodes > 0 && (
              <span className="text-xs text-ink-muted ml-1">{totalEpisodes} podcasts</span>
            )}
            {themes.length > 0 && (
              <span className="text-xs text-ink-muted">· {themes.length} themes active</span>
            )}
          </div>
          <p className="text-sm text-ink-secondary">{contextLine}</p>
        </motion.div>

        {/* ── Conversation Hero — the most-discussed theme + momentum ───────── */}
        <ConversationHero groups={themeGroups} onThemeClick={setSelectedTheme} />

        {/* ── Intelligence Layer — what Wall Street is talking about today ──── */}
        <IntelligenceLayer episodes={allEpisodes} themes={themes} groups={allThemeGroups} />

        {/* ── Proprietary intelligence — synthesis, not browsing ───────────── */}
        {totalEpisodes > 0 && (
          <>
            <ProprietarySignals groups={allThemeGroups} episodes={allEpisodes} episodeThemeMap={episodeThemeMap} />
            <NarrativeRotation groups={allThemeGroups} onThemeClick={setSelectedTheme} />
            <HighestConviction groups={allThemeGroups} onThemeClick={setSelectedTheme} />
            <CrowdedAndMissing groups={allThemeGroups} onThemeClick={setSelectedTheme} />
            <CompaniesAndSectors groups={allThemeGroups} episodes={allEpisodes} />
            <PeopleAndFunds episodes={allEpisodes} />
            <CompanyHeatmap groups={allThemeGroups} episodes={allEpisodes} />
            <FirmsDriving episodes={allEpisodes} episodeThemeMap={episodeThemeMap} />
            <InfluentialEpisodes
              episodes={allEpisodes}
              episodeThemeMap={episodeThemeMap}
              whyListenMap={whyListenMap}
              savedIds={savedIds}
              onSave={toggleSave}
              onPlay={setPlaying}
              onThemeClick={setSelectedTheme}
            />
          </>
        )}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {totalEpisodes === 0 && (
          <div className="py-20 text-center text-ink-muted">
            <Headphones size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No episodes available right now.</p>
            <p className="text-xs mt-1 opacity-70">Feeds refresh every 10 minutes.</p>
          </div>
        )}

        {/* ── Intelligence footer ──────────────────────────────────────────── */}
        {totalEpisodes > 0 && (
          <div className="flex items-center gap-3 pt-4 mt-2 border-t border-edge">
            <BarChart2 size={10} className="text-ink-faint shrink-0" />
            <p className="text-2xs text-ink-faint">
              {totalEpisodes} podcasts synthesized
              {themes.length > 0 && ` · ${allThemeGroups.length} themes in conversation`}
            </p>
          </div>
        )}

      </div>

      {/* ── Mini player ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {playing && (
          <MiniPlayer
            episode={playing}
            onClose={() => setPlaying(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Theme Drawer ─────────────────────────────────────────────────────── */}
      {selectedTheme && (
        <ThemeDrawer
          theme={selectedTheme}
          clusters={clusters}
          deals={[]}
          episodes={allEpisodes}
          isWatched={isThemeWatched(selectedTheme.id)}
          hasAlert={hasAlert(selectedTheme.id)}
          alertDirection={alertFor(selectedTheme.id)?.direction}
          onToggleWatch={() => {
            toggleThemeWatch(selectedTheme.id);
            dismissAlert(selectedTheme.id);
          }}
          onClose={() => setSelectedTheme(null)}
          sourceContext="listen"
        />
      )}
    </>
  );
}
