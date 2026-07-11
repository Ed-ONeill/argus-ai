"use client";

import dynamic from "next/dynamic";
import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Headphones, BarChart2 } from "lucide-react";
import { useListenRails } from "@/hooks/useListen";
import { useThemeWatchlist } from "@/hooks/useThemeWatchlist";
import { useFollowedThemes } from "@/hooks/useFollowedThemes";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useArgusIntelligence } from "@/hooks/useArgusIntelligence";
import { ConversationHero } from "@/components/listen/ConversationHero";
import { IntelligenceLayer } from "@/components/listen/IntelligenceLayer";
import { IntelLedSections } from "@/components/listen/IntelLedSections";
import {
  ProprietarySignals, NarrativeRotation, HighestConviction, CrowdedAndMissing,
  CompaniesAndSectors, PeopleAndFunds, CompanyHeatmap, FirmsDriving, InfluentialEpisodes,
} from "@/components/listen/ListenSections";
import { MiniPlayer } from "@/components/listen/MiniPlayer";
// P2.7 perf: the drawer only mounts on open - load it on demand.
const ThemeDrawer = dynamic(() => import("@/components/themes/ThemeDrawer").then(m => m.ThemeDrawer), { ssr: false });
import {
  matchEpisodeThemes,
  getThemeEpisodeGroups,
  generateWhyListen,
} from "@/lib/listenIntelligence";
import { buildListenIntel } from "@/lib/listenIntel";
import { buildTheRead } from "@/lib/theRead";
import { deriveMorningBriefDeltas, type MorningBriefDelta } from "@/lib/intelligenceDeltas";
import { getTrackedThemes } from "@/lib/themeSnapshots";
import { buildRiskRead, type RiskRead } from "@/lib/riskRead";
import { findNarrativeForTheme } from "@/lib/narrativeDerivation";
import type { Episode, ThemeIntelligence } from "@/lib/types";

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

  // ── Canonical intelligence provisioning (A1): the one hook every surface
  //    mounts - themes and clusters ride along, and the shared graph is
  //    provisioned identically to the Morning Brief / Explorer / Markets. ────
  const argus = useArgusIntelligence();
  const themes = argus.themes;
  const clusters = argus.clusters;

  // ── User state (selection only - personalization never touches truth) ──────
  const { watchedIds, toggle: toggleThemeWatch, isWatched: isThemeWatched } = useThemeWatchlist();
  const { followed } = useFollowedThemes();
  const { watchlist } = useWatchlist();

  // ── Shared intelligence reads (Phase 2.4): the canonical ledger replaces
  //    the useThemeAlerts device transition store on this surface (D13). ──────
  const deltaResult = useMemo(
    () => deriveMorningBriefDeltas({ themes, previouslyTracked: getTrackedThemes(), graphReady: argus.ready }),
    [themes, argus.ready],
  );
  const read = useMemo(
    () => buildTheRead({ themes, deltas: deltaResult.deltas, graphReady: argus.ready }),
    [themes, deltaResult.deltas, argus.ready],
  );
  const deltaForTheme = useMemo(() => {
    const m = new Map<string, MorningBriefDelta>();
    for (const d of deltaResult.deltas) {
      const k = d.entity.toLowerCase();
      if (!m.has(k)) m.set(k, d);
    }
    return (t: ThemeIntelligence | null) => (t ? m.get(t.name.toLowerCase()) ?? null : null);
  }, [deltaResult.deltas]);
  const isUpKind = (k: MorningBriefDelta["kind"]) => k === "STRENGTHENED" || k === "NEW" || k === "EXPANDED";

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

  // ── The Listen view model (Phase 2.4): episodes attached to shared objects ──
  const risks = useMemo(() => {
    const m = new Map<string, RiskRead>();
    // One shared risk read per theme that appears as a primary episode match.
    for (const eps of episodeThemeMap.values()) {
      const t = eps[0];
      if (!t) continue;
      const k = t.name.toLowerCase();
      if (!m.has(k)) m.set(k, buildRiskRead(t.name, t));
    }
    return m;
  }, [episodeThemeMap]);

  const followedThemeNames = useMemo(() => {
    const byId = new Map(themes.map(t => [t.id, t.name]));
    const names = new Set<string>(followed.map(f => f.name));
    for (const id of watchedIds) { const n = byId.get(id); if (n) names.add(n); }
    return [...names];
  }, [followed, watchedIds, themes]);

  const listenVM = useMemo(
    () => buildListenIntel({
      episodes: allEpisodes, themes, read,
      risks, deltas: deltaResult.deltas,
      narrativeOf: argus.ready ? (name: string) => findNarrativeForTheme(name) : undefined,
      researchPriorities: read.priorities.data ?? [],
      followedThemeNames,
      savedEntityIds: watchlist.map(w => w.id),
      graphReady: argus.ready,
    }),
    [allEpisodes, themes, read, risks, deltaResult.deltas, argus.ready, followedThemeNames, watchlist],
  );

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

        {/* ── Intelligence-led sections (Phase 2.4): episodes as evidence
            attached to the shared Read, ledger, contradiction records, and
            the user's watch. Browse/synthesis sections remain below. ──────── */}
        <IntelLedSections vm={listenVM} themes={themes} onThemeClick={setSelectedTheme} />

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

      {/* ── Theme Drawer — alert badge comes from the CANONICAL change ledger
             (Phase 2.4: the useThemeAlerts device transition store retired on
             this surface, D13) ───────────────────────────────────────────── */}
      {selectedTheme && (() => {
        const delta = deltaForTheme(selectedTheme);
        return (
          <ThemeDrawer
            theme={selectedTheme}
            clusters={clusters}
            deals={[]}
            episodes={allEpisodes}
            isWatched={isThemeWatched(selectedTheme.id)}
            hasAlert={delta !== null}
            alertDirection={delta ? (isUpKind(delta.kind) ? "up" : "down") : undefined}
            onToggleWatch={() => toggleThemeWatch(selectedTheme.id)}
            onClose={() => setSelectedTheme(null)}
            sourceContext="listen"
          />
        );
      })()}
    </>
  );
}
