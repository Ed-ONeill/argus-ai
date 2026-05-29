"use client";

import { ExternalLink, Play, Bookmark, BookmarkCheck, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TOPIC_COLOR } from "./TopicFilterBar";
import type { Episode, ThemeIntelligence } from "@/lib/types";

const THEME_SIGNAL_COLOR: Record<string, string> = {
  strong: "#10B981",
  medium: "#F59E0B",
  weak:   "#6B7280",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatPublished(iso: string): string {
  const d    = new Date(iso);
  const now  = new Date();
  const diffH = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
  if (diffH < 1)  return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7)  return `${diffD}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Artwork fallback ──────────────────────────────────────────────────────────

function EpisodeArtwork({
  show_name, topics, size,
}: { show_name: string; topics: string[]; size: number }) {
  const color    = TOPIC_COLOR[topics[0]] ?? "#6B7280";
  const initials = show_name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className="rounded-lg flex items-center justify-center shrink-0"
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, ${color}14 0%, ${color}28 100%)`,
        border:     `1px solid ${color}20`,
      }}
    >
      <span
        className="font-extrabold leading-none"
        style={{ color, fontSize: Math.round(size * 0.3) }}
      >
        {initials}
      </span>
    </div>
  );
}

// ── Link helpers ──────────────────────────────────────────────────────────────
// Never constructs or infers URLs — only checks whether a stored value is present.

export function hasPlayableAudio(ep: Episode): ep is Episode & { audio_url: string } {
  return !!ep.audio_url;
}

export function hasVerifiedExternalUrl(ep: Episode): ep is Episode & { external_url: string } {
  return !!ep.external_url;
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface EpisodeCardProps {
  episode:        Episode;
  isSaved:        boolean;
  onSave:         () => void;
  onPlay:         (ep: Episode) => void;
  variant?:       "grid" | "list";
  index?:         number;
  matchedThemes?: ThemeIntelligence[];
  onThemeClick?:  (theme: ThemeIntelligence) => void;
  whyListen?:     string;
}

export function EpisodeCard({
  episode, isSaved, onSave, onPlay,
  variant = "grid", index = 0,
  matchedThemes, onThemeClick, whyListen,
}: EpisodeCardProps) {
  const primaryTopic = episode.topics[0] ?? "Markets";
  const topicColor   = TOPIC_COLOR[primaryTopic] ?? "#6B7280";

  const canPlay   = hasPlayableAudio(episode);
  const canOpen   = hasVerifiedExternalUrl(episode);
  const hasValidCta = canPlay || canOpen;

  function handleListen(e: React.MouseEvent) {
    e.stopPropagation();
    if (canPlay) {
      onPlay(episode);
    } else if (canOpen) {
      window.open(episode.external_url, "_blank", "noopener,noreferrer");
    }
  }

  // ── List variant ─────────────────────────────────────────────────────────────
  if (variant === "list") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.035, duration: 0.2 }}
        className={cn(
          "flex items-start gap-3.5 py-3.5 border-b border-edge last:border-0",
          episode.is_secondary && "opacity-70",
        )}
      >
        <EpisodeArtwork show_name={episode.show_name} topics={episode.topics} size={48} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1">
            <h3 className="flex-1 text-[12.5px] font-semibold text-ink leading-snug line-clamp-2">
              {episode.title}
            </h3>
            <button
              onClick={e => { e.stopPropagation(); onSave(); }}
              className={cn(
                "shrink-0 p-1 rounded transition-colors",
                isSaved ? "text-accent" : "text-ink-faint hover:text-ink-muted",
              )}
              title={isSaved ? "Remove bookmark" : "Save episode"}
            >
              {isSaved ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
            </button>
          </div>

          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {episode.is_briefing ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm leading-none"
                style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>
                ARGUS BRIEFING
              </span>
            ) : (
              <span className="text-2xs font-semibold" style={{ color: topicColor }}>
                {episode.show_name}
              </span>
            )}
            <span className="text-2xs text-ink-muted">·</span>
            <span className="flex items-center gap-0.5 text-2xs text-ink-muted">
              <Clock size={9} />
              {formatDuration(episode.duration_seconds)}
            </span>
            <span className="text-2xs text-ink-muted">·</span>
            <span className="text-2xs text-ink-muted">{formatPublished(episode.published_at)}</span>
            {episode.is_secondary && episode.secondary_label && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-raised text-ink-muted border border-edge leading-none">
                {episode.secondary_label}
              </span>
            )}
          </div>

          <p className="text-2xs text-ink-secondary leading-relaxed line-clamp-1 mb-1.5">
            {whyListen ?? episode.why_it_matters}
          </p>

          {/* Theme connections + industry pill */}
          {((matchedThemes ?? []).length > 0) && onThemeClick && (
            <div className="flex flex-wrap items-center gap-1 mb-2">
              {(matchedThemes ?? []).map(t => {
                const sc = THEME_SIGNAL_COLOR[t.signal_strength] ?? "#6B7280";
                return (
                  <button
                    key={t.id}
                    onClick={e => { e.stopPropagation(); onThemeClick(t); }}
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full transition-opacity hover:opacity-75"
                    style={{ background: `${sc}12`, color: sc, border: `1px solid ${sc}28` }}
                  >
                    {t.name}
                  </button>
                );
              })}
              {matchedThemes?.[0]?.related_industries?.[0] && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full leading-none"
                  style={{ background: "rgba(82,176,200,0.07)", color: "rgba(82,176,200,0.72)", border: "1px solid rgba(82,176,200,0.14)" }}
                >
                  {matchedThemes[0].related_industries[0]}
                </span>
              )}
            </div>
          )}

          {hasValidCta ? (
            <button
              onClick={handleListen}
              className="inline-flex items-center gap-1.5 text-2xs font-semibold transition-colors hover:opacity-80"
              style={{ color: topicColor }}
            >
              {canPlay
                ? <><Play size={10} fill="currentColor" /> {episode.is_briefing ? "Listen Briefing" : "Play"}</>
                : <><ExternalLink size={9} className="opacity-70" /> {episode.is_briefing ? "Read Briefing" : "Open Episode"}</>
              }
            </button>
          ) : (
            <span className="text-2xs text-ink-faint italic">Source unavailable</span>
          )}
        </div>
      </motion.div>
    );
  }

  // ── Grid variant ─────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.22 }}
      className={cn(
        "w-[240px] shrink-0 md:w-auto",
        "bg-surface rounded-xl border shadow-card",
        "hover:shadow-card-hover hover:border-edge-strong",
        "transition-all duration-200 overflow-hidden flex flex-col",
        "snap-start",
        episode.is_secondary
          ? "border-dashed border-edge opacity-75"
          : "border-edge",
      )}
    >
      {/* Topic colour stripe — dimmed for secondary */}
      <div
        className="h-[2.5px]"
        style={{ background: episode.is_secondary ? `${topicColor}55` : topicColor }}
      />

      <div className="p-3.5 flex flex-col flex-1">
        {/* Artwork + topic meta */}
        <div className="flex items-start gap-2.5 mb-3">
          <EpisodeArtwork show_name={episode.show_name} topics={episode.topics} size={44} />
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              {episode.is_briefing ? (
                <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-sm leading-tight"
                  style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>
                  ARGUS BRIEFING
                </span>
              ) : (
                <span
                  className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-sm leading-tight"
                  style={{ background: `${topicColor}14`, color: topicColor }}
                >
                  {primaryTopic}
                </span>
              )}
              {episode.is_secondary && episode.secondary_label && (
                <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-raised text-ink-muted border border-edge leading-tight">
                  {episode.secondary_label}
                </span>
              )}
            </div>
            <p className="text-2xs text-ink-muted font-medium leading-tight truncate">
              {episode.show_name}
            </p>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-[12.5px] font-semibold text-ink leading-snug line-clamp-3 mb-2 flex-1">
          {episode.title}
        </h3>

        {/* Why listen — specific copy preferred over generic why_it_matters */}
        <p className="text-2xs text-ink-secondary leading-relaxed line-clamp-2 mb-2">
          {whyListen ?? episode.why_it_matters}
        </p>

        {/* Theme connections + industry pill — one consolidated intelligence row */}
        {(matchedThemes ?? []).length > 0 && onThemeClick && (
          <div className="flex flex-wrap items-center gap-1 mb-2">
            {(matchedThemes ?? []).map(t => {
              const sc = THEME_SIGNAL_COLOR[t.signal_strength] ?? "#6B7280";
              return (
                <button
                  key={t.id}
                  onClick={e => { e.stopPropagation(); onThemeClick(t); }}
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full transition-opacity hover:opacity-75"
                  style={{ background: `${sc}12`, color: sc, border: `1px solid ${sc}28` }}
                >
                  {t.name}
                </button>
              );
            })}
            {matchedThemes?.[0]?.related_industries?.[0] && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full leading-none"
                style={{ background: "rgba(82,176,200,0.07)", color: "rgba(82,176,200,0.72)", border: "1px solid rgba(82,176,200,0.14)" }}
              >
                {matchedThemes[0].related_industries[0]}
              </span>
            )}
          </div>
        )}

        {/* Key entities — mono pills for fast context scanning */}
        {episode.entities.slice(0, 2).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {episode.entities.slice(0, 2).map(entity => (
              <span
                key={entity}
                className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  background: "rgba(0,0,0,0.04)",
                  color:      "rgba(0,0,0,0.36)",
                  border:     "1px solid rgba(0,0,0,0.07)",
                }}
              >
                {entity}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2.5 border-t border-edge/60">
          <div className="flex items-center gap-1.5 text-2xs text-ink-muted">
            <Clock size={9} />
            <span>{formatDuration(episode.duration_seconds)}</span>
            <span className="text-edge-strong">·</span>
            <span>{formatPublished(episode.published_at)}</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={e => { e.stopPropagation(); onSave(); }}
              className={cn(
                "p-1 rounded transition-colors",
                isSaved ? "text-accent" : "text-ink-faint hover:text-ink-muted",
              )}
              title={isSaved ? "Remove bookmark" : "Save episode"}
            >
              {isSaved ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
            </button>

            {hasValidCta ? (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={handleListen}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold text-white"
                style={{ background: episode.is_briefing ? "#1D4ED8" : topicColor }}
              >
                {canPlay
                  ? <><Play size={9} fill="currentColor" /> {episode.is_briefing ? "Listen" : "Play"}</>
                  : <><ExternalLink size={9} /> {episode.is_briefing ? "Read" : "Open"}</>
                }
              </motion.button>
            ) : (
              <span className="text-[10px] text-ink-faint italic px-1">Unavailable</span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
