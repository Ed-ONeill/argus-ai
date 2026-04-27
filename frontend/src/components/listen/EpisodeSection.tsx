"use client";

import { cn } from "@/lib/utils";
import { EpisodeCard } from "./EpisodeCard";
import type { Episode } from "@/lib/types";

interface EpisodeSectionProps {
  title:    string;
  subtitle?: string;
  icon?:    React.ReactNode;
  episodes: Episode[];
  savedIds: string[];
  onSave:   (ep: Episode) => void;
  onPlay:   (ep: Episode) => void;
  variant?: "grid" | "list";
  columns?: 2 | 3 | 4;
}

export function EpisodeSection({
  title, subtitle, icon, episodes, savedIds, onSave, onPlay,
  variant = "grid", columns = 4,
}: EpisodeSectionProps) {
  if (episodes.length === 0) return null;

  const colClass: Record<number, string> = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <section className="mb-8">
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-3.5">
        {icon && <span className="text-ink-muted shrink-0">{icon}</span>}
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink">{title}</h2>
        {subtitle && (
          <span className="text-2xs text-ink-muted hidden sm:inline">{subtitle}</span>
        )}
        <span className="h-px flex-1 bg-edge" />
        <span className="text-2xs font-medium text-ink-muted bg-raised px-2 py-0.5 rounded-full shrink-0">
          {episodes.length}
        </span>
      </div>

      {variant === "list" ? (
        <div className="bg-surface rounded-xl border border-edge shadow-card px-4">
          {episodes.map((ep, i) => (
            <EpisodeCard
              key={ep.id}
              episode={ep}
              isSaved={savedIds.includes(ep.id)}
              onSave={() => onSave(ep)}
              onPlay={onPlay}
              variant="list"
              index={i}
            />
          ))}
        </div>
      ) : (
        <div
          className={cn(
            "flex gap-3 overflow-x-auto pb-2 scrollbar-hide",
            "md:grid md:overflow-visible md:pb-0",
            "snap-x snap-mandatory md:snap-none",
            colClass[columns] ?? colClass[4],
          )}
        >
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
      )}
    </section>
  );
}
