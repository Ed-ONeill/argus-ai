"use client";

import { motion } from "framer-motion";
import { ExternalLink, Bookmark, BookmarkCheck } from "lucide-react";
import { cn, catColor } from "@/lib/utils";
import type { TopStories, FeedItem } from "@/lib/types";

interface TopStoriesGridProps {
  stories:   TopStories;
  savedIds:  string[];
  onSave:    (item: FeedItem) => void;
  isLoading: boolean;
}

const SLOT_META: { key: keyof TopStories; label: string; emptyLabel: string }[] = [
  { key: "top_deal",        label: "Deal",        emptyLabel: "No high-signal deal"     },
  { key: "top_macro",       label: "Macro",       emptyLabel: "No macro signal"         },
  { key: "top_single_name", label: "Single name", emptyLabel: "No single-name catalyst" },
  { key: "top_price_move",  label: "Price move",  emptyLabel: "No major price move"     },
  { key: "top_policy_risk", label: "Policy/risk", emptyLabel: "No policy story"         },
];

export function TopStoriesGrid({ stories, savedIds, onSave, isLoading }: TopStoriesGridProps) {
  const slots = SLOT_META.map(({ key, label, emptyLabel }) => ({
    key, label, emptyLabel, item: stories[key] ?? null,
  }));

  const hasAny = slots.some(s => s.item !== null);
  if (!isLoading && !hasAny) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[10px] font-semibold tracking-[0.08em] uppercase shrink-0"
          style={{ color: "rgba(255,255,255,0.42)" }}>
          Signal Monitor
        </span>
        <span className="h-px flex-1"
          style={{ background: "linear-gradient(to right, rgba(255,255,255,0.055), transparent)" }} />
        <span className="text-[8.5px] shrink-0" style={{ color: "rgba(255,255,255,0.22)" }}>
          by signal type
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {isLoading
          ? SLOT_META.map(s => <SkeletonCard key={s.key} />)
          : slots.map(({ key, label, emptyLabel, item }, i) =>
              item
                ? (
                  <TopStoryCard
                    key={key}
                    label={label}
                    item={item}
                    index={i}
                    isSaved={savedIds.includes(item.id)}
                    onSave={() => onSave(item)}
                  />
                )
                : (
                  <EmptySlotCard key={key} label={label} message={emptyLabel} index={i} />
                )
            )
        }
      </div>
    </section>
  );
}

// ── Filled card ───────────────────────────────────────────────────────────────

interface TopStoryCardProps {
  label:   string;
  item:    FeedItem;
  index:   number;
  isSaved: boolean;
  onSave:  () => void;
}

function TopStoryCard({ label, item, index, isSaved, onSave }: TopStoryCardProps) {
  const color = catColor(item.category);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0,
                 transition: { delay: index * 0.05, duration: 0.24, ease: "easeOut" } }}
      whileHover={{ y: -1, transition: { duration: 0.16, ease: "easeOut" } }}
      className="group relative rounded-xl p-3 cursor-default flex flex-col"
      style={{
        background:   "rgba(7,12,26,0.92)",
        borderTop:    "1px solid rgba(255,255,255,0.07)",
        borderRight:  "1px solid rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        borderLeft:   `2px solid ${color}65`,
      }}
    >
      {/* Slot label + bookmark */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className="text-[9.5px] font-medium"
          style={{ color: "rgba(255,255,255,0.44)" }}>
          {label}
        </span>
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={e => { e.preventDefault(); onSave(); }}
          className={cn(
            "opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded shrink-0",
            isSaved && "opacity-100",
          )}
          style={{ color: isSaved ? "#52b0c8" : "rgba(255,255,255,0.38)" }}
        >
          {isSaved ? <BookmarkCheck size={10} /> : <Bookmark size={10} />}
        </motion.button>
      </div>

      {/* Category */}
      <span className="text-[9px] font-medium mb-1.5" style={{ color }}>
        {item.category}
      </span>

      {/* Headline */}
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-[12px] font-semibold leading-snug mb-1.5
                   hover:text-accent transition-colors line-clamp-3"
        style={{ color: "rgba(255,255,255,0.85)" }}
      >
        {item.title}
      </a>

      {/* Why it matters */}
      {item.why_it_matters ? (
        <p className="text-[10.5px] leading-relaxed line-clamp-2 mb-auto pb-2"
          style={{ color: "rgba(255,255,255,0.58)" }}>
          {item.why_it_matters}
        </p>
      ) : (
        <div className="mb-auto pb-2" />
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <span className="text-[9.5px] truncate leading-none"
          style={{ color: "rgba(255,255,255,0.44)" }}>
          {item.source}
          {item.published && (
            <span className="ml-1" style={{ color: "rgba(255,255,255,0.28)" }}>
              · {item.published}
            </span>
          )}
        </span>
        <a href={item.url} target="_blank" rel="noopener noreferrer"
          className="opacity-0 group-hover:opacity-35 hover:!opacity-65 transition-opacity shrink-0"
          style={{ color: "rgba(255,255,255,0.70)" }}>
          <ExternalLink size={9} />
        </a>
      </div>
    </motion.div>
  );
}

// ── Empty-slot placeholder ────────────────────────────────────────────────────

function EmptySlotCard({ label, message, index }: { label: string; message: string; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.28, ease: "easeOut" }}
      className="rounded-xl p-3 flex flex-col gap-2.5"
      style={{
        background:  "rgba(5,9,20,0.45)",
        border:      "1px dashed rgba(255,255,255,0.07)",
        opacity:     0.50,
      }}
    >
      <span className="text-[9.5px] font-medium"
        style={{ color: "rgba(255,255,255,0.30)" }}>
        {label}
      </span>
      <div className="flex flex-col items-center justify-center flex-1 gap-1 py-4 text-center">
        <span className="text-sm leading-none select-none"
          style={{ color: "rgba(255,255,255,0.18)" }} aria-hidden>—</span>
        <p className="text-[9.5px] italic leading-snug"
          style={{ color: "rgba(255,255,255,0.28)" }}>{message}</p>
      </div>
    </motion.div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl p-3 space-y-2.5"
      style={{
        background:  "rgba(5,9,20,0.70)",
        border:      "1px solid rgba(255,255,255,0.04)",
        borderLeft:  "2px solid rgba(255,255,255,0.08)",
      }}>
      <div className="flex justify-between">
        <div className="h-2 w-12 rounded animate-pulse"
          style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="h-2 w-2 rounded animate-pulse"
          style={{ background: "rgba(255,255,255,0.06)" }} />
      </div>
      <div className="h-2.5 w-10 rounded animate-pulse"
        style={{ background: "rgba(255,255,255,0.05)" }} />
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded animate-pulse"
          style={{ background: "rgba(255,255,255,0.05)" }} />
        <div className="h-3 w-4/5 rounded animate-pulse"
          style={{ background: "rgba(255,255,255,0.05)" }} />
        <div className="h-3 w-3/5 rounded animate-pulse"
          style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>
      <div className="pt-2 flex justify-between"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="h-2 w-14 rounded animate-pulse"
          style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>
    </div>
  );
}
