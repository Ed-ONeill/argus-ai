"use client";

import { motion } from "framer-motion";
import { ClusterCard } from "./ClusterCard";
import type { StoryCluster, FeedItem, ThemeIntelligence } from "@/lib/types";
import type { RankedCluster } from "@/lib/feedRanker";

function clusterTier(cluster: StoryCluster): 1 | 2 | 3 {
  // Off-thesis stories (no followed-theme/sector overlap) are visually compressed
  // regardless of raw signal, so a strong but irrelevant headline never renders as
  // a prominent card. Falls back to the signal-based tier when no prefs are set.
  const aff = (cluster as RankedCluster).affinity;
  if (aff && !aff.hasAffinity) return 3;

  const score    = Math.round(cluster.primary.signal_score);
  const strength = cluster.primary.signal_strength;
  if (score >= 75) return 1;
  if (strength === "weak" || score < 40) return 3;
  return 2;
}

interface ClusterStreamProps {
  clusters:         StoryCluster[];
  savedIds:         string[];
  newIds?:          Set<string>;
  onSave:           (item: FeedItem) => void;
  isLoading:        boolean;
  watchedEntities?: Set<string>;
  themes?:          ThemeIntelligence[];
}

export function ClusterStream({
  clusters, savedIds, newIds, onSave, isLoading, watchedEntities, themes,
}: ClusterStreamProps) {
  const newCount = newIds?.size ?? 0;

  return (
    <section>
      {/* New stories badge — floats inline with stream label in page */}
      {newCount > 0 && (
        <div className="mb-3">
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
        </div>
      )}

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
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
        >
          {clusters.map((cluster, i) => {
            const tier         = clusterTier(cluster);
            // Primary: backend-assigned cluster membership
            // Fallback: keyword overlap when contributing_cluster_ids aren't populated
            const matchedTheme: ThemeIntelligence | undefined = (() => {
              const byId = themes?.find(t =>
                (t.contributing_cluster_ids ?? []).includes(cluster.id)
              );
              if (byId) return byId;
              if (!themes?.length) return undefined;
              const hay = [cluster.primary.title, ...cluster.primary.affected_entities]
                .join(" ").toLowerCase();
              let best: ThemeIntelligence | undefined;
              let bestScore = 0;
              for (const t of themes) {
                const words = [
                  ...(t.related_macro_factors ?? []),
                  ...(t.related_industries    ?? []),
                  t.name,
                ].flatMap(s => s.toLowerCase().split(/\W+/).filter(w => w.length >= 6));
                const score = words.filter(w => hay.includes(w)).length;
                if (score > bestScore) { bestScore = score; best = t; }
              }
              return bestScore >= 1 ? best : undefined;
            })();
            return (
              <motion.div
                key={cluster.id}
                custom={i}
                variants={{
                  hidden:  { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } },
                }}
                style={{
                  marginBottom: tier === 1 ? "12px" : tier === 2 ? "8px" : "3px",
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
                  matchedTheme={matchedTheme}
                  affinity={(cluster as RankedCluster).affinity}
                />
              </motion.div>
            );
          })}
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
