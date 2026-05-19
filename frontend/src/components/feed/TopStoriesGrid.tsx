"use client";

import { motion } from "framer-motion";
import { ExternalLink, Bookmark, BookmarkCheck } from "lucide-react";
import { cn, catBorderStyle, impactStyle, catColor } from "@/lib/utils";
import type { TopStories, FeedItem } from "@/lib/types";

interface TopStoriesGridProps {
  stories:   TopStories;
  savedIds:  string[];
  onSave:    (item: FeedItem) => void;
  isLoading: boolean;
}

const SLOT_META: { key: keyof TopStories; label: string; emptyLabel: string }[] = [
  { key: "top_deal",        label: "Top Deal",          emptyLabel: "No high-signal deal right now"        },
  { key: "top_macro",       label: "Top Macro",         emptyLabel: "No macro signal right now"            },
  { key: "top_single_name", label: "Single Name",       emptyLabel: "No single-name catalyst right now"    },
  { key: "top_price_move",  label: "Price Move",        emptyLabel: "No major price move right now"        },
  { key: "top_policy_risk", label: "Policy / Risk",     emptyLabel: "No policy or risk story right now"    },
];

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
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink">Top Stories</span>
        <span className="h-px flex-1 bg-edge" />
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

// Hierarchy tier: Deal (0) and Policy/Risk (4) are the sharpest anchors of the briefing.
// They get a 4 px accent bar and a faint category-tinted shadow.
// The three middle slots are standard weight — this creates a visual cadence without noise.
function slotAccentWidth(index: number): "3px" | "4px" {
  return (index === 0 || index === 4) ? "4px" : "3px";
}
function slotShadow(index: number, color: string): string {
  if (index === 0) return `0 3px 16px ${color}1E, 0 1px 4px rgba(0,0,0,0.05)`;
  if (index === 4) return `0 3px 14px ${color}18, 0 1px 4px rgba(0,0,0,0.05)`;
  return "0 2px 8px rgba(26,43,95,0.07), 0 1px 3px rgba(0,0,0,0.04)";
}

function TopStoryCard({ label, item, index, isSaved, onSave }: TopStoryCardProps) {
  const impact = item.impact ? impactStyle(item.impact) : null;
  const color  = catColor(item.category);

  return (
    <motion.div
           initial={{ opacity: 0, y: 12, boxShadow: slotShadow(index, color) }}
      animate={{ opacity: 1,  y: 0,  boxShadow: slotShadow(index, color),
                 transition: { delay: index * 0.07, duration: 0.28, ease: "easeOut" } }}
      whileHover={{ y: -2, boxShadow: `0 6px 20px ${color}22, 0 2px 6px rgba(0,0,0,0.07)`,
                    transition: { duration: 0.14, ease: "easeOut" } }}
      className={cn(
        "group relative bg-surface rounded-xl border border-edge p-3.5",
        "cursor-default flex flex-col",
        catBorderStyle(item.category)
      )}
      style={{ borderTopWidth: slotAccentWidth(index) }}
    >
      {/* Slot label + category chip + bookmark — all on one row */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className={cn(
          "text-2xs uppercase tracking-wider shrink-0",
          index === 0 || index === 4
            ? "font-bold text-ink-secondary/85"
            : "font-bold text-ink-secondary/65"
        )}>
          {label}
        </span>
        <span
          className="text-2xs font-semibold px-1.5 py-px rounded-full leading-tight"
          style={{ background: `${color}14`, color }}
        >
          {item.category}
        </span>
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={e => { e.preventDefault(); onSave(); }}
          className={cn(
            "ml-auto opacity-0 group-hover:opacity-100 transition-all p-0.5 rounded shrink-0",
            isSaved ? "text-accent opacity-100" : "text-ink-muted hover:text-accent"
          )}
        >
          {isSaved
            ? <BookmarkCheck size={11} />
            : <Bookmark size={11} />
          }
        </motion.button>
      </div>

      {/* Headline */}
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-[12.5px] font-semibold text-ink leading-snug mb-1.5
                   hover:text-accent transition-colors line-clamp-2"
      >
        {item.title}
      </a>

      {/* Why it matters — investment thesis visible without clicking */}
      {item.why_it_matters ? (
        <p className="text-2xs text-ink-secondary/70 leading-relaxed line-clamp-2 mb-auto pb-2">
          {item.why_it_matters}
        </p>
      ) : (
        <div className="mb-auto pb-2.5" />
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-edge/50">
        <span className="text-2xs text-ink-secondary/70 truncate leading-none">
          {item.source}
          {item.published && (
            <span className="text-ink-muted/60 ml-1">· {item.published}</span>
          )}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {impact && (
            <span className={cn(
              "text-2xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap",
              impact.bg, impact.text
            )}>
              {item.impact.split(" ").slice(0, 2).join(" ")}
            </span>
          )}
          <a href={item.url} target="_blank" rel="noopener noreferrer"
             className="opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity text-ink-muted">
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
      className="bg-canvas rounded-xl border border-dashed border-edge-strong border-t-[3px]
                 border-t-edge p-4 flex flex-col gap-3 opacity-55"
    >
      <span className="text-2xs font-bold uppercase tracking-widest text-ink-muted">
        {label}
      </span>
      <div className="flex flex-col items-center justify-center flex-1 gap-1.5 py-3 text-center">
        <span className="text-base leading-none text-ink-muted/50 select-none" aria-hidden>—</span>
        <p className="text-2xs text-ink-muted italic leading-snug">{message}</p>
      </div>
    </motion.div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-surface rounded-xl border border-edge border-t-[3px] border-t-edge-strong p-4 space-y-3">
      <div className="flex justify-between">
        <div className="h-2.5 w-14 bg-raised rounded animate-pulse" />
        <div className="h-2.5 w-2.5 bg-raised rounded animate-pulse" />
      </div>
      <div className="h-4 w-14 bg-raised rounded-full animate-pulse" />
      <div className="space-y-1.5">
        <div className="h-3.5 w-full bg-raised rounded animate-pulse" />
        <div className="h-3.5 w-5/6 bg-raised rounded animate-pulse" />
        <div className="h-3.5 w-3/5 bg-raised rounded animate-pulse" />
      </div>
      <div className="pt-1 border-t border-edge flex justify-between">
        <div className="h-2.5 w-16 bg-raised rounded animate-pulse" />
        <div className="h-4 w-12 bg-raised rounded-full animate-pulse" />
      </div>
    </div>
  );
}
