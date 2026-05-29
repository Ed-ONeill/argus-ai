"use client";

import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Headphones, TrendingUp, Mic, BarChart2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useListenRails } from "@/hooks/useListen";
import { useThemeWatchlist } from "@/hooks/useThemeWatchlist";
import { useThemeAlerts } from "@/hooks/useThemeAlerts";
import { fetchFeed } from "@/lib/api";
import { EpisodeCard } from "@/components/listen/EpisodeCard";
import { MiniPlayer } from "@/components/listen/MiniPlayer";
import { ThemeDrawer } from "@/components/themes/ThemeDrawer";
import {
  matchEpisodeThemes,
  getThemeEpisodeGroups,
  isEarningsEpisode,
  extractSpeakers,
} from "@/lib/listenIntelligence";
import type { Episode, ThemeIntelligence, FeedResponse } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const SIGNAL_COLOR: Record<string, string> = {
  strong: "#10B981",
  medium: "#F59E0B",
  weak:   "#6B7280",
};

const RAIL_DEFS = [
  { key: "macroMarket" as const, label: "Market Open · Macro",   color: "#2563EB", subtitle: ""             },
  { key: "maPrivate"   as const, label: "M&A + Private Markets", color: "#7C3AED", subtitle: ""             },
  { key: "venture"     as const, label: "Venture + Startups",    color: "#10B981", subtitle: ""             },
  { key: "company"     as const, label: "Company Deep Dives",    color: "#0891B2", subtitle: ""             },
  { key: "quick"       as const, label: "Quick Listens",         color: "#6B7280", subtitle: "Under 15 min" },
  { key: "longForm"    as const, label: "Long Form",             color: "#374151", subtitle: "45 min+"      },
];

// ── Sub-components ────────────────────────────────────────────────────────────

interface RailProps {
  title:         string;
  subtitle?:     string;
  color:         string;
  episodes:      Episode[];
  savedIds:      string[];
  onSave:        (ep: Episode) => void;
  onPlay:        (ep: Episode) => void;
  episodeThemes: Map<string, ThemeIntelligence[]>;
  onThemeClick:  (theme: ThemeIntelligence) => void;
  earningsBadge?: boolean;
}

function Rail({
  title, subtitle, color, episodes, savedIds,
  onSave, onPlay, episodeThemes, onThemeClick, earningsBadge,
}: RailProps) {
  if (episodes.length === 0) return null;
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2.5 mb-3.5">
        <div className="h-3 w-[3px] rounded-full shrink-0" style={{ background: color }} />
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink">{title}</h2>
        {subtitle && (
          <span className="text-2xs text-ink-muted hidden sm:inline">{subtitle}</span>
        )}
        {earningsBadge && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: "rgba(245,158,11,0.10)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.18)" }}>
            Q RESULTS
          </span>
        )}
        <span className="h-px flex-1 bg-edge" />
        <span className="text-2xs font-medium text-ink-muted bg-raised px-2 py-0.5 rounded-full shrink-0">
          {episodes.length}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide snap-x snap-mandatory">
        {episodes.map((ep, i) => (
          <EpisodeCard
            key={ep.id}
            episode={ep}
            isSaved={savedIds.includes(ep.id)}
            onSave={() => onSave(ep)}
            onPlay={onPlay}
            variant="grid"
            index={i}
            matchedThemes={episodeThemes.get(ep.id)}
            onThemeClick={onThemeClick}
          />
        ))}
      </div>
    </section>
  );
}

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
  const { rails, isLoading, totalEpisodes, allEpisodes } = useListenRails();

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

  // ── Intelligence derivations ─────────────────────────────────────────────────
  const themeGroups = useMemo(
    () => getThemeEpisodeGroups(allEpisodes, themes).slice(0, 4),
    [allEpisodes, themes],
  );

  const earningsEpisodes = useMemo(
    () => allEpisodes.filter(isEarningsEpisode).slice(0, 8),
    [allEpisodes],
  );

  const speakers = useMemo(
    () => extractSpeakers(allEpisodes),
    [allEpisodes],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function toggleSave(ep: Episode) {
    setSavedIds(prev =>
      prev.includes(ep.id) ? prev.filter(id => id !== ep.id) : [...prev, ep.id],
    );
  }

  const railProps = {
    savedIds,
    onSave:       toggleSave,
    onPlay:       setPlaying,
    episodeThemes: episodeThemeMap,
    onThemeClick:  setSelectedTheme,
  };

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
            <h1 className="text-xl font-semibold text-ink">Listen Intelligence</h1>
            {totalEpisodes > 0 && (
              <span className="text-xs text-ink-muted ml-1">{totalEpisodes} podcasts</span>
            )}
            {themes.length > 0 && (
              <span className="text-xs text-ink-muted">· {themes.length} themes active</span>
            )}
          </div>
          <p className="text-sm text-ink-secondary">{contextLine}</p>
        </motion.div>

        {/* ── Most Discussed Themes This Week ──────────────────────────────── */}
        {themeGroups.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.06 }}
            className="mb-8 rounded-2xl border border-edge p-4"
            style={{ background: "rgba(0,0,0,0.02)" }}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <TrendingUp size={11} className="text-ink-muted shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                Most Discussed Themes This Week
              </span>
              <span className="h-px flex-1 bg-edge" />
              <span className="text-2xs text-ink-faint">
                {themeGroups.length} theme{themeGroups.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {themeGroups.map(({ theme, matchCount }) => {
                const sc = SIGNAL_COLOR[theme.signal_strength] ?? "#6B7280";
                return (
                  <button
                    key={theme.id}
                    onClick={() => setSelectedTheme(theme)}
                    className="text-left p-3 rounded-xl border border-edge bg-surface hover:border-edge-strong hover:shadow-sm transition-all duration-150 group"
                  >
                    {/* Signal stripe */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sc }} />
                      <span className="text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: sc }}>
                        {theme.signal_strength}
                      </span>
                    </div>
                    <p className="text-[12px] font-semibold text-ink leading-snug mb-1 line-clamp-2 group-hover:text-navy transition-colors">
                      {theme.name}
                    </p>
                    <p className="text-[10px] text-ink-muted mb-1.5">
                      {matchCount} podcast{matchCount !== 1 ? "s" : ""}
                    </p>
                    {theme.related_industries.slice(0, 2).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {theme.related_industries.slice(0, 2).map(ind => (
                          <span
                            key={ind}
                            className="text-[9px] px-1.5 py-0.5 rounded leading-none"
                            style={{
                              background: "rgba(82,176,200,0.08)",
                              color:      "rgba(82,176,200,0.80)",
                            }}
                          >
                            {ind}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* ── Standard topic rails ─────────────────────────────────────────── */}
        {RAIL_DEFS.map((def, i) => (
          <motion.div
            key={def.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.08 + i * 0.04 }}
          >
            <Rail
              title={def.label}
              subtitle={def.subtitle}
              color={def.color}
              episodes={rails[def.key]}
              {...railProps}
            />
          </motion.div>
        ))}

        {/* ── Earnings Intelligence ─────────────────────────────────────────── */}
        {earningsEpisodes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.32 }}
          >
            <Rail
              title="Earnings Intelligence"
              color="#F59E0B"
              episodes={earningsEpisodes}
              earningsBadge
              {...railProps}
            />
          </motion.div>
        )}

        {/* ── Voices This Week ─────────────────────────────────────────────── */}
        {speakers.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.36 }}
            className="mb-8"
          >
            <div className="flex items-center gap-2.5 mb-3.5">
              <div className="h-3 w-[3px] rounded-full shrink-0" style={{ background: "#8B5CF6" }} />
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink">Voices This Week</h2>
              <Mic size={10} className="text-ink-muted" />
              <span className="h-px flex-1 bg-edge" />
            </div>
            <div className="flex flex-wrap gap-2">
              {speakers.map(s => {
                const initials = s.name.split(" ").slice(0, 2).map(w => w[0]).join("");
                return (
                  <div
                    key={s.name}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-edge bg-surface"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold"
                      style={{ background: "rgba(139,92,246,0.08)", color: "#8B5CF6" }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-ink leading-tight">{s.name}</p>
                      <p className="text-[10px] text-ink-muted leading-tight">
                        {s.episodeCount} ep{s.episodeCount !== 1 ? "s" : ""}
                        {s.topics.length > 0 && ` · ${s.topics.slice(0, 2).join(", ")}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.section>
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
              {totalEpisodes} podcasts across {Object.values(rails).flat().length} curated picks
              {themes.length > 0 && ` · ${themeGroups.length} active themes`}
              {earningsEpisodes.length > 0 && ` · ${earningsEpisodes.length} earnings episodes`}
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
        />
      )}
    </>
  );
}
