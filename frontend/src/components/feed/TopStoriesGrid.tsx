"use client";

import { motion } from "framer-motion";
import { ExternalLink, Bookmark, BookmarkCheck } from "lucide-react";
import { cn, catColor } from "@/lib/utils";
import { classifyImpact } from "@/lib/types";
import type { TopStories, FeedItem } from "@/lib/types";

interface TopStoriesGridProps {
  stories:   TopStories;
  savedIds:  string[];
  onSave:    (item: FeedItem) => void;
  isLoading: boolean;
}

const SLOT_META: { key: keyof TopStories; label: string; emptyLabel: string }[] = [
  { key: "top_deal",        label: "Top Deal",      emptyLabel: "No high-signal deal right now"     },
  { key: "top_macro",       label: "Top Macro",     emptyLabel: "No macro signal right now"         },
  { key: "top_single_name", label: "Single Name",   emptyLabel: "No single-name catalyst right now" },
  { key: "top_price_move",  label: "Price Move",    emptyLabel: "No major price move right now"     },
  { key: "top_policy_risk", label: "Policy / Risk", emptyLabel: "No policy or risk story right now" },
];

// Dark-context impact badge styling
interface DarkImpact { bg: string; color: string }
function darkImpactStyle(impact: string): DarkImpact {
  const s = classifyImpact(impact);
  return {
    bullish: { bg: "rgba(22,68,40,0.40)",  color: "rgba(88,188,120,0.92)"  },
    bearish: { bg: "rgba(80,20,20,0.40)",  color: "rgba(196,96,96,0.92)"   },
    neutral: { bg: "rgba(24,38,70,0.40)",  color: "rgba(134,166,210,0.88)" },
    mixed:   { bg: "rgba(70,50,16,0.40)",  color: "rgba(196,158,72,0.92)"  },
  }[s];
}

export function TopStoriesGrid({ stories, savedIds, onSave, isLoading }: TopStoriesGridProps) {
  const slots = SLOT_META.map(({ key, label, emptyLabel }) => ({
    key, label, emptyLabel, item: stories[key] ?? null,
  }));

  const hasAny = slots.some(s => s.item !== null);
  if (!isLoading && !hasAny) return null;

  return (
    <section className="mb-7">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-bold uppercase tracking-[0.14em]"
          style={{ color: "rgba(255,255,255,0.72)" }}>Top Stories</span>
        <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.08)" }} />
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

function slotAccentWidth(index: number): "3px" | "4px" {
  return (index === 0 || index === 4) ? "4px" : "3px";
}
function slotShadow(index: number, color: string): string {
  if (index === 0) return `0 3px 18px ${color}28, 0 1px 8px rgba(0,0,0,0.40)`;
  if (index === 4) return `0 3px 16px ${color}22, 0 1px 6px rgba(0,0,0,0.35)`;
  return "0 2px 8px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.22)";
}

function TopStoryCard({ label, item, index, isSaved, onSave }: TopStoryCardProps) {
  const color      = catColor(item.category);
  const impact     = item.impact ? darkImpactStyle(item.impact) : null;
  const labelColor = index === 0 || index === 4 ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.55)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0,
                 transition: { delay: index * 0.07, duration: 0.28, ease: "easeOut" } }}
      whileHover={{ y: -2, transition: { duration: 0.14, ease: "easeOut" } }}
      className="group relative rounded-xl p-3.5 cursor-default flex flex-col"
      style={{
        background:     "rgba(6,10,20,0.92)",
        border:         "1px solid rgba(255,255,255,0.07)",
        borderTopWidth: slotAccentWidth(index),
        borderTopColor: color,
        boxShadow:      slotShadow(index, color),
      }}
    >
      {/* Slot label + category chip + bookmark */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-2xs uppercase tracking-wider font-bold shrink-0"
          style={{ color: labelColor }}>
          {label}
        </span>
        <span className="text-2xs font-semibold px-1.5 py-px rounded-full leading-tight"
          style={{ background: `${color}22`, color }}>
          {item.category}
        </span>
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={e => { e.preventDefault(); onSave(); }}
          className={cn(
            "ml-auto opacity-0 group-hover:opacity-100 transition-all p-0.5 rounded shrink-0",
            isSaved && "opacity-100",
          )}
          style={{ color: isSaved ? "#52b0c8" : "rgba(255,255,255,0.45)" }}
        >
          {isSaved ? <BookmarkCheck size={11} /> : <Bookmark size={11} />}
        </motion.button>
      </div>

      {/* Headline */}
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-[12.5px] font-semibold leading-snug mb-1.5
                   hover:text-accent transition-colors line-clamp-2"
        style={{ color: "rgba(255,255,255,0.88)" }}
      >
        {item.title}
      </a>

      {/* Why it matters */}
      {item.why_it_matters ? (
        <p className="text-2xs leading-relaxed line-clamp-2 mb-auto pb-2"
          style={{ color: "rgba(255,255,255,0.58)" }}>
          {item.why_it_matters}
        </p>
      ) : (
        <div className="mb-auto pb-2.5" />
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <span className="text-2xs truncate leading-none"
          style={{ color: "rgba(255,255,255,0.52)" }}>
          {item.source}
          {item.published && (
            <span className="ml-1" style={{ color: "rgba(255,255,255,0.35)" }}>
              · {item.published}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {impact && (
            <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
              style={{ background: impact.bg, color: impact.color }}>
              {item.impact.split(" ").slice(0, 2).join(" ")}
            </span>
          )}
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            className="opacity-0 group-hover:opacity-40 hover:!opacity-80 transition-opacity"
            style={{ color: "rgba(255,255,255,0.70)" }}>
            <ExternalLink size={10} />
          </a>
        </div>
      </div>
    </motion.div>
  );
}

// ── Empty-slot placeholder ────────────────────────────────────────────────────

function EmptySlotCard({ label, message, index }: { label: string; message: string; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.3, ease: "easeOut" }}
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background:     "rgba(6,10,20,0.55)",
        border:         "1px dashed rgba(255,255,255,0.10)",
        borderTopWidth: "3px",
        borderTopColor: "rgba(255,255,255,0.10)",
        opacity:        0.55,
      }}
    >
      <span className="text-2xs font-bold uppercase tracking-widest"
        style={{ color: "rgba(255,255,255,0.42)" }}>
        {label}
      </span>
      <div className="flex flex-col items-center justify-center flex-1 gap-1.5 py-3 text-center">
        <span className="text-base leading-none select-none"
          style={{ color: "rgba(255,255,255,0.25)" }} aria-hidden>—</span>
        <p className="text-2xs italic leading-snug"
          style={{ color: "rgba(255,255,255,0.38)" }}>{message}</p>
      </div>
    </motion.div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{
        background:     "rgba(6,10,20,0.88)",
        border:         "1px solid rgba(255,255,255,0.06)",
        borderTopWidth: "3px",
        borderTopColor: "rgba(255,255,255,0.10)",
      }}>
      <div className="flex justify-between">
        <div className="h-2.5 w-14 rounded animate-pulse"
          style={{ background: "rgba(255,255,255,0.07)" }} />
        <div className="h-2.5 w-2.5 rounded animate-pulse"
          style={{ background: "rgba(255,255,255,0.07)" }} />
      </div>
      <div className="h-4 w-14 rounded-full animate-pulse"
        style={{ background: "rgba(255,255,255,0.06)" }} />
      <div className="space-y-1.5">
        <div className="h-3.5 w-full rounded animate-pulse"
          style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="h-3.5 w-5/6 rounded animate-pulse"
          style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="h-3.5 w-3/5 rounded animate-pulse"
          style={{ background: "rgba(255,255,255,0.05)" }} />
      </div>
      <div className="pt-1 flex justify-between"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="h-2.5 w-16 rounded animate-pulse"
          style={{ background: "rgba(255,255,255,0.05)" }} />
        <div className="h-4 w-12 rounded-full animate-pulse"
          style={{ background: "rgba(255,255,255,0.06)" }} />
      </div>
    </div>
  );
}
