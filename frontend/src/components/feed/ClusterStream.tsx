"use client";

import { motion } from "framer-motion";
import { ClusterCard } from "./ClusterCard";
import type { StoryCluster, FeedItem } from "@/lib/types";

interface ClusterStreamProps {
  clusters:    StoryCluster[];
  savedIds:    string[];
  newIds?:     Set<string>;
  onSave:      (item: FeedItem) => void;
  isLoading:   boolean;
  watchedEntities?: Set<string>;
}

export function ClusterStream({
  clusters, savedIds, newIds, onSave, isLoading, watchedEntities,
}: ClusterStreamProps) {
  const newCount = newIds?.size ?? 0;

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink">
          Live Market Stream
        </span>
        {!isLoading && clusters.length > 0 && (
          <span className="text-2xs font-medium text-ink-secondary bg-raised px-2 py-0.5 rounded-full">
            {clusters.length}
          </span>
        )}
        {newCount > 0 && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-2xs font-bold px-2 py-0.5 rounded-full
                       bg-emerald-50 text-emerald-700 border border-emerald-100"
          >
            {newCount} new
          </motion.span>
        )}
        <span className="h-px flex-1 bg-edge" />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} delay={i * 0.05} />)}
        </div>
      ) : clusters.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-ink-secondary">No stories match the current filters.</p>
          <p className="text-xs text-ink-muted mt-1">Try selecting a different category above.</p>
        </div>
      ) : (
        <motion.div
          className="space-y-2.5"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
        >
          {clusters.map(cluster => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              isSaved={savedIds.includes(cluster.id)}
              onSave={() => onSave(cluster.primary)}
              isNew={newIds?.has(cluster.id)}
              isWatched={
                watchedEntities
                  ? cluster.primary.affected_entities.some(
                      e => watchedEntities.has(e.toLowerCase()),
                    )
                  : false
              }
              watchedEntities={watchedEntities}
            />
          ))}
        </motion.div>
      )}
    </section>
  );
}


function SkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
      className="bg-surface rounded-xl border border-edge overflow-hidden"
    >
      <div className="h-[2.5px] bg-raised rounded-t-xl animate-pulse" />
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-16 bg-raised rounded-full animate-pulse" />
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="h-1.5 w-1.5 rounded-full bg-raised animate-pulse" />
            <div className="h-3 w-28 bg-raised rounded animate-pulse" />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="h-[13.5px] w-full bg-raised rounded animate-pulse" />
          <div className="h-[13.5px] w-4/5 bg-raised rounded animate-pulse" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-full bg-raised rounded animate-pulse" />
          <div className="h-3 w-3/4 bg-raised rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-edge">
          <div className="h-5 w-24 bg-raised rounded-full animate-pulse" />
          <div className="h-5 w-14 bg-raised rounded animate-pulse ml-auto" />
        </div>
      </div>
    </motion.div>
  );
}
