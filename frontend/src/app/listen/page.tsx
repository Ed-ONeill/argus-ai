"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Headphones } from "lucide-react";
import { useListenRails } from "@/hooks/useListen";
import { EpisodeCard } from "@/components/listen/EpisodeCard";
import { MiniPlayer } from "@/components/listen/MiniPlayer";
import type { Episode } from "@/lib/types";

// ── Rail config ────────────────────────────────────────────────────────────────

const RAIL_DEFS = [
  { key: "macroMarket" as const, label: "Market Open · Macro",   color: "#2563EB", subtitle: ""             },
  { key: "maPrivate"   as const, label: "M&A + Private Markets", color: "#7C3AED", subtitle: ""             },
  { key: "venture"     as const, label: "Venture + Startups",    color: "#10B981", subtitle: ""             },
  { key: "company"     as const, label: "Company Deep Dives",    color: "#0891B2", subtitle: ""             },
  { key: "quick"       as const, label: "Quick Listens",         color: "#6B7280", subtitle: "Under 15 min" },
  { key: "longForm"    as const, label: "Long Form",             color: "#374151", subtitle: "45 min+"      },
];

// ── Inline components ──────────────────────────────────────────────────────────

interface RailProps {
  title:    string;
  subtitle: string;
  color:    string;
  episodes: Episode[];
  savedIds: string[];
  onSave:   (ep: Episode) => void;
  onPlay:   (ep: Episode) => void;
}

function Rail({ title, subtitle, color, episodes, savedIds, onSave, onPlay }: RailProps) {
  if (episodes.length === 0) return null;
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2.5 mb-3.5">
        <div className="h-3 w-[3px] rounded-full shrink-0" style={{ background: color }} />
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink">{title}</h2>
        {subtitle && (
          <span className="text-2xs text-ink-muted hidden sm:inline">{subtitle}</span>
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
        <div className="h-6 w-24 bg-raised rounded animate-pulse mb-2" />
        <div className="h-4 w-64 bg-raised rounded animate-pulse" />
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="mb-8">
          <div className="h-4 w-40 bg-raised rounded animate-pulse mb-3.5" />
          <div className="flex gap-3 overflow-hidden">
            {[...Array(4)].map((_, j) => (
              <div key={j} className="w-[240px] h-[220px] bg-raised rounded-xl animate-pulse shrink-0" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ListenPage() {
  const [playing,  setPlaying]  = useState<Episode | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const { rails, isLoading, totalEpisodes } = useListenRails();

  function toggleSave(ep: Episode) {
    setSavedIds(prev =>
      prev.includes(ep.id) ? prev.filter(id => id !== ep.id) : [...prev, ep.id],
    );
  }

  if (isLoading) return <Skeleton />;

  return (
    <>
      <div className={`max-w-5xl mx-auto px-4 sm:px-6 py-7 ${playing ? "pb-24" : ""}`}>

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
              <span className="text-xs text-ink-muted ml-1">{totalEpisodes} episodes</span>
            )}
          </div>
          <p className="text-sm text-ink-secondary">
            Real podcasts, curated for institutional market intelligence
          </p>
        </motion.div>

        {/* ── Rails ────────────────────────────────────────────────────────── */}
        {RAIL_DEFS.map(def => (
          <Rail
            key={def.key}
            title={def.label}
            subtitle={def.subtitle}
            color={def.color}
            episodes={rails[def.key]}
            savedIds={savedIds}
            onSave={toggleSave}
            onPlay={setPlaying}
          />
        ))}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {totalEpisodes === 0 && (
          <div className="py-20 text-center text-ink-muted">
            <Headphones size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No episodes available right now.</p>
            <p className="text-xs mt-1 opacity-70">Feeds refresh every 10 minutes.</p>
          </div>
        )}

      </div>

      {/* ── Mini player ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {playing && (
          <MiniPlayer
            episode={playing}
            onClose={() => setPlaying(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
