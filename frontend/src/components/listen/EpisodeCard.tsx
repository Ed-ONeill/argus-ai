"use client";

import { useState, useMemo } from "react";
import { ExternalLink, Play, Bookmark, BookmarkCheck, Clock, Sparkles, FileText, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, timeAgo, sanitizeCopy } from "@/lib/utils";
import { TOPIC_COLOR } from "./TopicFilterBar";
import { TickerChip } from "@/components/common/TickerChip";
import { confColor } from "@/app/markets/marketsShared";
import { looksLikePerson } from "@/lib/listenIntelligence";
import { episodeIntel, buildBriefing, similarEpisodes, counterPositionedEpisodes } from "@/lib/episodeIntel";
import type { Episode, ThemeIntelligence } from "@/lib/types";

const THEME_SIGNAL_COLOR: Record<string, string> = {
  strong: "#10B981",
  medium: "#F59E0B",
  weak:   "#6B7280",
};

// Market relevance → institutional band colour (immediately obvious, restrained).
function relevanceColor(score: number): string {
  return score >= 80 ? "#10B981" : score >= 55 ? "#52b0c8" : score >= 35 ? "#F59E0B" : "#94A3B8";
}
const isTicker = (s: string) => /^[A-Z][A-Z.]{0,5}$/.test(s);

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatPublished(iso: string): string {
  return timeAgo(iso);
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
  // Corpus context (grid variant) → powers similar / contradicting episodes.
  allEpisodes?:     Episode[];
  episodeThemeMap?: Map<string, ThemeIntelligence[]>;
}

export function EpisodeCard({
  episode, isSaved, onSave, onPlay,
  variant = "grid", index = 0,
  matchedThemes, onThemeClick, whyListen,
  allEpisodes, episodeThemeMap,
}: EpisodeCardProps) {
  const primaryTopic = episode.topics[0] ?? "Markets";
  const topicColor   = TOPIC_COLOR[primaryTopic] ?? "#6B7280";

  const canPlay   = hasPlayableAudio(episode);
  const canOpen   = hasVerifiedExternalUrl(episode);
  const hasValidCta = canPlay || canOpen;

  const [expanded, setExpanded] = useState(false);

  // ── Derived intelligence (all from stored fields) ──────────────────────────
  const primaryTheme = matchedThemes?.[0];
  const host         = episode.entities.find(looksLikePerson)
    ?? (episode.publisher && episode.publisher !== episode.show_name ? episode.publisher : null);
  const companies    = episode.entities.filter(e => !looksLikePerson(e)).slice(0, 4);
  const conviction   = primaryTheme ? Math.round(primaryTheme.confidence ?? 0) : null;
  const relevance    = Math.round(episode.relevance_score ?? 0);
  const relColor     = relevanceColor(relevance);
  const aiSummary    = episode.description?.trim() || episode.why_it_matters;
  // Intelligence panel: a projection of shared engines (riskRead, verified
  // catalysts, the theme's backend narrative) - Phase 2.4, no local meaning.
  const intel        = useMemo(() => episodeIntel(episode, primaryTheme), [episode, primaryTheme]);
  // Expanded briefing: shared records only (risks/catalysts from the engines).
  const briefing     = useMemo(() => buildBriefing(episode, primaryTheme), [episode, primaryTheme]);
  const similar      = useMemo(() => allEpisodes && episodeThemeMap ? similarEpisodes(episode, primaryTheme, allEpisodes, episodeThemeMap) : [], [episode, primaryTheme, allEpisodes, episodeThemeMap]);
  const counterPositioned = useMemo(() => allEpisodes && episodeThemeMap ? counterPositionedEpisodes(episode, primaryTheme, allEpisodes, episodeThemeMap) : [], [episode, primaryTheme, allEpisodes, episodeThemeMap]);

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
              {sanitizeCopy(episode.title)}
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
            {sanitizeCopy(whyListen ?? episode.why_it_matters)}
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
                    className="tg-chip text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
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

  // ── Grid variant — institutional research note ───────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.22 }}
      whileHover={{ y: -2 }}
      className={cn(
        "w-full bg-surface rounded-xl border shadow-card",
        "hover:shadow-card-hover hover:border-edge-strong",
        "transition-shadow duration-200 overflow-hidden flex flex-col group/card",
        episode.is_secondary ? "border-dashed border-edge opacity-80" : "border-edge",
      )}
    >
      <div className="p-4 flex flex-col flex-1">
        {/* ── Masthead: source · host | relevance · conviction ── */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              {episode.is_briefing ? (
                <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-sm leading-tight"
                  style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>ARGUS BRIEFING</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wide leading-tight" style={{ color: topicColor }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: topicColor }} />{primaryTopic}
                </span>
              )}
              {episode.is_secondary && episode.secondary_label && (
                <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-raised text-ink-muted border border-edge leading-tight">{episode.secondary_label}</span>
              )}
            </div>
          </div>
          {/* Relevance + conviction — the research signal, immediately obvious */}
          <div className="flex items-start gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[14px] font-black tabular-nums leading-none" style={{ color: relColor }}>{relevance}</p>
              <p className="text-[6.5px] font-bold uppercase tracking-[0.1em] text-ink-faint mt-0.5">Relevance</p>
            </div>
            {conviction !== null && (
              <div className="text-right">
                <p className="text-[14px] font-black tabular-nums leading-none" style={{ color: confColor(conviction) }}>{conviction}</p>
                <p className="text-[6.5px] font-bold uppercase tracking-[0.1em] text-ink-faint mt-0.5">Conviction</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Title — the headline of the note ── */}
        <h3 className="text-[15px] font-bold text-ink leading-[1.25] line-clamp-2 mb-2.5 tracking-[-0.01em] group-hover/card:text-navy transition-colors">
          {sanitizeCopy(episode.title)}
        </h3>

        {/* ── The read — contextual label rotates by the episode's signal ── */}
        <div className="rounded-lg px-2.5 py-2 mb-2.5" style={{ background: "rgba(82,176,200,0.05)", border: "1px solid rgba(82,176,200,0.12)" }}>
          <div className="flex items-center gap-1 mb-1">
            <Sparkles size={9} style={{ color: "#52b0c8" }} />
            <span className="text-[7.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(82,176,200,0.95)" }}>{intel?.label ?? "Why It Matters"}</span>
          </div>
          <p className="text-2xs text-ink-secondary leading-relaxed line-clamp-3">{intel?.read ?? sanitizeCopy(whyListen ?? episode.why_it_matters)}</p>
        </div>

        {/* ── Beneficiaries / at-risk — the trade ── */}
        {intel && (intel.beneficiaries.length > 0 || intel.atRisk.length > 0) && (
          <div className="flex flex-col gap-1.5 mb-2">
            {intel.beneficiaries.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] shrink-0 w-14" style={{ color: "rgba(16,185,129,0.85)" }}>Benefits</span>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 min-w-0">
                  {intel.beneficiaries.map(t => <TickerChip key={t} ticker={t} size="sm" color="#10B981" />)}
                </div>
              </div>
            )}
            {intel.atRisk.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] shrink-0 w-14" style={{ color: "rgba(239,68,68,0.85)" }}>At Risk</span>
                <span className="text-[10px] font-medium truncate" style={{ color: "rgba(239,68,68,0.85)" }}>{intel.atRisk.join(" · ")}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Catalyst (shared, dateless) + shared contradiction record ── */}
        {intel && (
          <div className="flex flex-col gap-1 mb-2.5">
            <div className="flex items-center gap-1.5"
              title={intel.catalystBasis === "verified" ? "Recorded series/release in the shared graph - verified, no date" : "Canonical derived watch line (intelligenceDeltas)"}>
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] shrink-0 w-14 text-ink-faint">
                {intel.catalystBasis === "verified" ? "Catalyst" : "Watch"}
              </span>
              <span className="text-[10px] text-ink-muted truncate">{intel.catalyst}</span>
            </div>
            {intel.contrarian && (
              <div className="flex items-start gap-1.5" title="Evidence-engine contradiction record (same record Explorer shows)">
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] shrink-0 w-14 mt-0.5" style={{ color: "rgba(239,68,68,0.75)" }}>Contradicts</span>
                <span className="text-[10px] leading-snug text-ink-muted">{intel.contrarian}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Themes + companies ── */}
        {(matchedThemes ?? []).length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mb-2">
            {(matchedThemes ?? []).map(t => {
              const sc = THEME_SIGNAL_COLOR[t.signal_strength] ?? "#6B7280";
              return (
                <button key={t.id} onClick={e => { e.stopPropagation(); onThemeClick?.(t); }}
                  className="tg-chip text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: `${sc}12`, color: sc, border: `1px solid ${sc}28` }}>
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
        {companies.length > 0 && (
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-ink-faint shrink-0">Discussed</span>
            <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 min-w-0">
              {companies.map(c => isTicker(c)
                ? <TickerChip key={c} ticker={c} size="sm" color="#475569" />
                : <span key={c} className="text-[9.5px] font-medium text-ink-secondary truncate">{c}</span>)}
            </div>
          </div>
        )}

        {/* ── Expandable institutional briefing — Argus already listened ── */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div key="briefing" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24, ease: "easeInOut" }} className="overflow-hidden">
              <div className="rounded-lg p-3 mb-2.5 space-y-2.5" style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.05)" }}>
                {briefing ? (
                  <>
                    <Brief label="Executive Summary">{briefing.executiveSummary}</Brief>
                    {briefing.thesis && <Brief label="Argus Thesis (pipeline)">{briefing.thesis}</Brief>}
                    <BriefList label={briefing.risksBasis === "shared-engines" ? "Risks · shared engines" : "Risks"} items={briefing.risks} color="rgba(239,68,68,0.85)" />
                    <BriefList label="Catalysts · verified / derived" items={briefing.catalysts} color="rgba(82,176,200,0.9)" />
                    {briefing.relatedNarratives.length > 0 && (
                      <div>
                        <BriefLabel>Related Narratives</BriefLabel>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {briefing.relatedNarratives.map(rt => (
                            <span key={rt} className="text-[9px] px-1.5 py-0.5 rounded leading-none" style={{ background: "rgba(0,0,0,0.04)", color: "rgba(0,0,0,0.42)" }}>{rt}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-2xs text-ink-secondary leading-relaxed">{sanitizeCopy(aiSummary)}</p>
                )}

                {similar.length > 0 && (
                  <BriefEpisodes label="Similar Episodes" episodes={similar} onPlay={onPlay} accent="rgba(82,176,200,0.9)" />
                )}
                {counterPositioned.length > 0 && (
                  <BriefEpisodes label="Counter-Positioned Episodes" episodes={counterPositioned} onPlay={onPlay} accent="rgba(245,158,11,0.9)" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Footer: source · runtime de-emphasized | save · note · transcript · play ── */}
        <div className="flex items-center justify-between gap-2 pt-2.5 mt-auto border-t border-edge/60">
          <p className="text-[9px] text-ink-faint truncate min-w-0 flex-1">
            {episode.show_name}{host ? ` · ${host}` : ""} · {formatDuration(episode.duration_seconds)} · {formatPublished(episode.published_at)}
          </p>

          <div className="flex items-center gap-0.5">
            <button onClick={e => { e.stopPropagation(); onSave(); }}
              className={cn("p-1 rounded transition-colors", isSaved ? "text-accent" : "text-ink-faint hover:text-ink-muted")}
              title={isSaved ? "Remove bookmark" : "Save episode"}>
              {isSaved ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
            </button>
            <button onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
              className={cn("p-1 rounded transition-colors flex items-center", expanded ? "text-accent" : "text-ink-faint hover:text-ink-muted")}
              title={expanded ? "Hide briefing" : "Full Argus briefing"}>
              <Sparkles size={11} />
              <ChevronDown size={9} className={cn("transition-transform", expanded && "rotate-180")} />
            </button>
            <button onClick={e => { e.stopPropagation(); if (canOpen) window.open(episode.external_url!, "_blank", "noopener,noreferrer"); }}
              disabled={!canOpen}
              className={cn("p-1 rounded transition-colors", canOpen ? "text-ink-faint hover:text-ink-muted" : "text-ink-faint/40 cursor-default")}
              title={canOpen ? "Transcript / show notes" : "Transcript unavailable"}>
              <FileText size={11} />
            </button>

            {hasValidCta ? (
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} onClick={handleListen}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold text-white ml-0.5 transition-shadow hover:shadow-md"
                style={{ background: episode.is_briefing ? "#1D4ED8" : topicColor }}>
                {canPlay
                  ? <><Play size={9} fill="currentColor" /> {episode.is_briefing ? "Listen" : "Play"}</>
                  : <><ExternalLink size={9} /> {episode.is_briefing ? "Read" : "Open"}</>}
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

// ── Briefing building blocks ──────────────────────────────────────────────────
function BriefLabel({ children, color }: { children: React.ReactNode; color?: string }) {
  return <p className="text-[8px] font-bold uppercase tracking-[0.13em] mb-1" style={{ color: color ?? "rgba(0,0,0,0.42)" }}>{children}</p>;
}
function Brief({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><BriefLabel>{label}</BriefLabel><p className="text-[10.5px] leading-snug text-ink-secondary">{children}</p></div>;
}
function BriefList({ label, items, color }: { label: string; items: string[]; color?: string }) {
  if (!items.length) return null;
  return (
    <div>
      <BriefLabel color={color}>{label}</BriefLabel>
      <ul className="space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="text-[10px] leading-snug text-ink-secondary flex gap-1.5">
            <span className="shrink-0" style={{ color }}>•</span>{it}
          </li>
        ))}
      </ul>
    </div>
  );
}
function BriefEpisodes({ label, episodes, onPlay, accent }: { label: string; episodes: Episode[]; onPlay: (ep: Episode) => void; accent: string }) {
  return (
    <div>
      <BriefLabel color={accent}>{label}</BriefLabel>
      <div className="space-y-1">
        {episodes.map(ep => (
          <button key={ep.id} onClick={e => { e.stopPropagation(); onPlay(ep); }} className="w-full flex items-center gap-1.5 text-left group/se">
            <Play size={8} className="shrink-0 opacity-50 group-hover/se:opacity-90" style={{ color: accent }} />
            <span className="text-[10px] leading-snug truncate flex-1 text-ink-secondary group-hover/se:text-ink transition-colors">{sanitizeCopy(ep.title)}</span>
            <span className="text-[8.5px] shrink-0 text-ink-faint">{ep.show_name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
