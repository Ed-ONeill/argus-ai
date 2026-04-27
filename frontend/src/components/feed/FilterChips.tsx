"use client";

import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_CHIPS: { label: string; value: string; color?: string }[] = [
  { label: "All",          value: "",             color: undefined   },
  { label: "Markets",      value: "Markets",      color: "#2563EB"   },
  { label: "M&A",          value: "M&A",          color: "#7C3AED"   },
  { label: "Geopolitical", value: "Geopolitical", color: "#DC2626"   },
  { label: "Company",      value: "Company",      color: "#0891B2"   },
];

interface FilterChipsProps {
  activeCategory: string;
  onChange:       (cat: string) => void;
  onOpenDrawer:   () => void;
  totalCount?:    number;
  filteredCount?: number;
}

export function FilterChips({
  activeCategory, onChange, onOpenDrawer, totalCount, filteredCount,
}: FilterChipsProps) {
  const showCount = activeCategory !== "" && filteredCount !== undefined;

  return (
    <div className="sticky top-14 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-5
                    bg-canvas/96 backdrop-blur-sm border-b border-edge/70
                    pb-2.5 pt-2">
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {CATEGORY_CHIPS.map(({ label, value, color }) => {
          const active = activeCategory === value;
          return (
            <motion.button
              key={value}
              // Inactive: lift slightly on hover. Active: subtle press-down (scale stays at 1, no y lift).
              // whileTap gives tactile click feedback on both states.
              whileHover={active
                ? { scale: 1.0 }  // active chip doesn't float — it's already "selected"
                : { scale: 1.025, y: -1, transition: { duration: 0.15, ease: "easeOut" } }
              }
              whileTap={{ scale: 0.93, transition: { duration: 0.1 } }}
              onClick={() => onChange(value)}
              className={cn(
                "relative shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full",
                "text-xs font-semibold outline-none select-none",
                "transition-shadow duration-200",
                active
                  ? "text-white shadow-md"
                  : "bg-surface border border-edge text-ink-secondary hover:border-edge-strong hover:text-ink hover:shadow-sm"
              )}
              style={active && color
                ? { background: color }
                : active
                  ? { background: "#0F1623" }
                  : undefined
              }
            >
              {/* Color dot on inactive chips */}
              {!active && color && (
                <motion.span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: color }}
                />
              )}
              {label}
            </motion.button>
          );
        })}

        {/* Divider */}
        <div className="w-px h-4 bg-edge mx-0.5 shrink-0" />

        {/* Filters button */}
        <motion.button
          whileHover={{ scale: 1.02, y: -0.5, transition: { duration: 0.15, ease: "easeOut" } }}
          whileTap={{ scale: 0.94, transition: { duration: 0.1 } }}
          onClick={onOpenDrawer}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                     font-semibold text-ink-secondary border border-edge
                     hover:border-edge-strong hover:text-ink hover:shadow-sm
                     transition-shadow duration-200 bg-surface select-none"
        >
          <SlidersHorizontal size={11} />
          Filters
        </motion.button>

        {/* Filtered count badge */}
        <AnimatePresence>
          {showCount && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85, x: 4 }}
              animate={{ opacity: 1, scale: 1,    x: 0 }}
              exit={{   opacity: 0, scale: 0.85,  x: 4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex items-center gap-1.5 ml-auto shrink-0"
            >
              <span className="text-2xs text-ink-secondary/70">
                {filteredCount} of {totalCount}
              </span>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onChange("")}
                className="p-0.5 rounded text-ink-muted hover:text-ink hover:bg-raised
                           transition-colors duration-150"
                title="Clear filter"
              >
                <X size={11} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
