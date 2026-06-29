"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { buildConversationNetwork, episodesForNode } from "@/lib/conversationNetwork";
import { EpisodeCard } from "./EpisodeCard";
import type { GraphNode } from "@/lib/graph/types";
import type { Episode, ThemeIntelligence } from "@/lib/types";
import type { ThemeEpisodeGroup } from "@/lib/listenIntelligence";

/**
 * ConversationNetwork — Listen's signature feature. The shared NetworkGraph engine
 * (same as the Argus Market Map) renders how ideas propagate across podcasts:
 * mentioned orgs → themes → sectors → companies. Hovering a node highlights its
 * connected conversations (engine-native); selecting a node filters the episodes
 * below to the conversations that connect to it.
 */

// Heavy canvas + force-sim engine — lazy-loaded so it never weighs down First Load.
const NetworkGraph = dynamic(() => import("@/components/graph/NetworkGraph"), {
  ssr: false,
  loading: () => <div className="w-full rounded-xl animate-pulse" style={{ height: 420, background: "rgba(5,9,16,0.6)", border: "1px solid rgba(82,176,200,0.18)" }} />,
});

interface Props {
  episodes:        Episode[];
  groups:          ThemeEpisodeGroup[];
  episodeThemeMap: Map<string, ThemeIntelligence[]>;
  whyListenMap:    Map<string, string>;
  savedIds:        string[];
  onSave:          (ep: Episode) => void;
  onPlay:          (ep: Episode) => void;
  onThemeClick:    (theme: ThemeIntelligence) => void;
}

export function ConversationNetwork({
  episodes, groups, episodeThemeMap, whyListenMap, savedIds, onSave, onPlay, onThemeClick,
}: Props) {
  const model = useMemo(() => buildConversationNetwork(groups), [groups]);
  const [selected, setSelected]   = useState<GraphNode | null>(null);
  const [clearNonce, setClearNonce] = useState(0);

  const filtered = useMemo(
    () => (selected ? episodesForNode(selected, episodes, episodeThemeMap) : []),
    [selected, episodes, episodeThemeMap],
  );

  const clear = useCallback(() => { setSelected(null); setClearNonce(n => n + 1); }, []);

  if (model.nodes.length <= 2) return null;
  const active = selected && selected.kind !== "event";

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
      className="mb-8"
    >
      {/* Eyebrow */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="tg-live-dot absolute inline-flex h-full w-full rounded-full" style={{ background: "#52b0c8" }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "#52b0c8" }} />
        </span>
        <span className="text-[11px] font-black uppercase tracking-[0.14em] text-ink">Conversation Network</span>
        <span className="text-[9px] font-medium text-ink-muted hidden sm:inline">how ideas spread between podcasts</span>
        <span className="h-px flex-1 bg-edge" />
        <span className="text-[9.5px] font-semibold text-ink-muted shrink-0">
          {active ? "Click background to reset" : "Select a node to filter"}
        </span>
      </div>

      {/* The graph — same engine + design language as the Argus Market Map */}
      <NetworkGraph
        model={model}
        height={420}
        title="Conversation Network"
        subtitle="Idea Propagation"
        showTimeline={false}
        showFilters={false}
        clearNonce={clearNonce}
        onFocusChange={setSelected}
      />

      {/* Selection → filtered conversations */}
      <AnimatePresence initial={false}>
        {active && (
          <motion.div
            key="filtered"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.26, ease: "easeInOut" }} className="overflow-hidden"
          >
            <div className="mt-4 rounded-2xl border border-edge bg-surface p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">Conversations about</span>
                <span className="text-[12px] font-bold text-ink">{selected!.ticker ?? selected!.label}</span>
                <span className="text-[9.5px] text-ink-faint">{filtered.length} episode{filtered.length !== 1 ? "s" : ""}</span>
                <button onClick={clear} className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-ink-muted hover:text-ink transition-colors">
                  <X size={11} /> Clear
                </button>
              </div>
              {filtered.length > 0 ? (
                <div>
                  {filtered.slice(0, 6).map((ep, i) => (
                    <EpisodeCard
                      key={ep.id} episode={ep} variant="list" index={i}
                      isSaved={savedIds.includes(ep.id)} onSave={() => onSave(ep)} onPlay={onPlay}
                      matchedThemes={episodeThemeMap.get(ep.id)} whyListen={whyListenMap.get(ep.id)}
                      onThemeClick={onThemeClick}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-muted py-4 text-center">No episodes connect directly to this node yet.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
