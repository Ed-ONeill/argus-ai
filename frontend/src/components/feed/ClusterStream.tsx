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
        <div className="flex items-center gap-2 shrink-0">
          <motion.span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: "rgba(52,200,120,0.65)" }}
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="text-[10px] font-medium tracking-[0.05em]"
            style={{ color: "rgba(255,255,255,0.40)" }}>
            Live Market Stream
          </span>
        </div>
        {!isLoading && clusters.length > 0 && (
          <span className="text-[9px] tabular-nums"
            style={{ color: "rgba(255,255,255,0.28)" }}>
            {clusters.length}
          </span>
        )}
        {newCount > 0 && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-[9px] font-medium px-1.5 py-0.5 rounded"
            style={{
              color:      "rgba(52,200,120,0.80)",
              background: "rgba(52,200,120,0.08)",
              border:     "1px solid rgba(52,200,120,0.15)",
            }}
          >
            {newCount} new
          </motion.span>
        )}
        <span className="h-px flex-1"
          style={{ background: "linear-gradient(to right, rgba(255,255,255,0.06), transparent)" }} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} delay={i * 0.05} />)}
        </div>
      ) : clusters.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.38)" }}>
            No stories match the current filters.
          </p>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.24)" }}>
            Try selecting a different category above.
          </p>
        </div>
      ) : (
        <motion.div
          className="space-y-2"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.045 } } }}
        >
          {clusters.map((cluster, i) => (
            <motion.div
              key={cluster.id}
              custom={i}
              variants={{
                hidden:  { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
              }}
            >
              <ClusterCard
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
            </motion.div>
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
      className="rounded-lg overflow-hidden"
      style={{
        background: "rgba(5,9,20,0.55)",
        borderLeft: "2px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="px-3.5 pt-2.5 pb-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="h-3 w-12 rounded animate-pulse"
            style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="h-3 w-20 rounded animate-pulse ml-auto"
            style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-full rounded animate-pulse"
            style={{ background: "rgba(255,255,255,0.05)" }} />
          <div className="h-3 w-4/5 rounded animate-pulse"
            style={{ background: "rgba(255,255,255,0.05)" }} />
        </div>
        <div className="space-y-1.5">
          <div className="h-2.5 w-full rounded animate-pulse"
            style={{ background: "rgba(255,255,255,0.04)" }} />
          <div className="h-2.5 w-3/4 rounded animate-pulse"
            style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
        <div className="flex items-center gap-2 pt-1.5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="h-2 w-16 rounded animate-pulse"
            style={{ background: "rgba(255,255,255,0.04)" }} />
          <div className="h-2 w-10 rounded animate-pulse ml-auto"
            style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
      </div>
    </motion.div>
  );
}
