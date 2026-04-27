"use client";

import { ExternalLink, Play, Bookmark, BookmarkCheck, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TOPIC_COLOR } from "./TopicFilterBar";
import { formatDuration, formatPublished, hasPlayableAudio, hasVerifiedExternalUrl } from "./EpisodeCard";
import type { Episode } from "@/lib/types";

interface ListenHeroProps {
  episode: Episode;
  isSaved: boolean;
  onSave:  () => void;
  onPlay:  (ep: Episode) => void;
}

export function ListenHero({ episode, isSaved, onSave, onPlay }: ListenHeroProps) {
  const primaryTopic = episode.topics[0] ?? "Markets";
  const topicColor   = TOPIC_COLOR[primaryTopic] ?? "#2563EB";
  const initials     = episode.show_name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();

  const canPlay   = hasPlayableAudio(episode);
  const canOpen   = hasVerifiedExternalUrl(episode);
  const hasValidCta = canPlay || canOpen;

  function handleCta() {
    if (canPlay) {
      onPlay(episode);
    } else if (canOpen) {
      window.open(episode.external_url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="relative bg-surface rounded-xl border border-edge shadow-card-hover overflow-hidden mb-6"
    >
      {/* Gradient top stripe */}
      <div
        className="h-[3px]"
        style={{ background: `linear-gradient(90deg, ${topicColor} 0%, ${topicColor}60 100%)` }}
      />

      <div className="p-5 sm:p-6 flex flex-col sm:flex-row gap-5 sm:gap-6">

        {/* Left: content */}
        <div className="flex-1 min-w-0">

          {/* Badges */}
          <div className="flex items-center flex-wrap gap-2 mb-3">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold text-white tracking-wide uppercase"
              style={{ background: topicColor }}
            >
              Featured
            </span>
            {episode.topics.slice(0, 3).map(t => (
              <span
                key={t}
                className="text-2xs font-medium text-ink-muted bg-raised px-2 py-0.5 rounded-full"
              >
                {t}
              </span>
            ))}
          </div>

          {/* Title */}
          <h2 className="text-[15px] sm:text-[16px] font-bold text-ink leading-snug mb-2">
            {episode.title}
          </h2>

          {/* Meta */}
          <div className="flex items-center gap-2.5 mb-3 flex-wrap">
            <span className="text-2xs font-semibold" style={{ color: topicColor }}>
              {episode.show_name}
            </span>
            <span className="text-2xs text-ink-muted">·</span>
            <span className="flex items-center gap-1 text-2xs text-ink-muted">
              <Clock size={10} />
              {formatDuration(episode.duration_seconds)}
            </span>
            <span className="text-2xs text-ink-muted">·</span>
            <span className="text-2xs text-ink-muted">{formatPublished(episode.published_at)}</span>
            <span className="text-2xs text-ink-muted">·</span>
            <span className="text-2xs text-ink-muted">{episode.publisher}</span>
          </div>

          {/* Description */}
          <p className="text-xs text-ink-secondary leading-relaxed line-clamp-2 mb-3">
            {episode.description}
          </p>

          {/* Why it matters */}
          <div className="flex gap-2.5 mb-5">
            <div
              className="w-[2.5px] rounded-full shrink-0 self-stretch"
              style={{ background: topicColor, minHeight: "2rem" }}
            />
            <p className="text-xs text-ink-secondary leading-relaxed">
              <span className="font-semibold text-ink">Why it matters — </span>
              {episode.why_it_matters}
            </p>
          </div>

          {/* CTAs */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {hasValidCta ? (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleCta}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: topicColor }}
              >
                {canPlay
                  ? <><Play size={12} fill="currentColor" /> Play Episode</>
                  : <><ExternalLink size={12} /> Open Episode</>
                }
              </motion.button>
            ) : (
              <span className="text-xs text-ink-faint italic">Source link unavailable</span>
            )}

            <button
              onClick={onSave}
              className={cn(
                "p-2 rounded-lg border transition-all duration-150",
                isSaved
                  ? "text-accent border-accent/30 bg-accent/5 hover:bg-accent/10"
                  : "text-ink-muted border-edge hover:text-ink hover:border-edge-strong hover:bg-raised",
              )}
              title={isSaved ? "Remove bookmark" : "Save episode"}
            >
              {isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            </button>

            {episode.relevance_score >= 90 && (
              <span className="text-2xs font-semibold text-ink-muted bg-raised px-2.5 py-1 rounded-full">
                Relevance {episode.relevance_score}
              </span>
            )}
          </div>
        </div>

        {/* Right: artwork */}
        <div className="shrink-0 self-start sm:self-center">
          <div
            className="w-[110px] h-[110px] sm:w-[130px] sm:h-[130px] rounded-xl flex flex-col items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${topicColor}14 0%, ${topicColor}30 100%)`,
              border:     `1px solid ${topicColor}22`,
            }}
          >
            {episode.image_url ? (
              <img
                src={episode.image_url}
                alt={episode.show_name}
                className="w-full h-full object-cover rounded-xl"
              />
            ) : (
              <>
                <span
                  className="text-3xl font-extrabold leading-none"
                  style={{ color: topicColor }}
                >
                  {initials}
                </span>
                <span
                  className="text-[9px] font-medium mt-1 text-center px-2 leading-tight"
                  style={{ color: `${topicColor}99` }}
                >
                  {episode.publisher}
                </span>
              </>
            )}
          </div>
        </div>

      </div>
    </motion.div>
  );
}
