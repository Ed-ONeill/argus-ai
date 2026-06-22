"use client";

import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, X } from "lucide-react";

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
    <div
      className="sticky top-14 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-5 pb-2.5 pt-2.5 backdrop-blur-md border-b"
      style={{
        background: "rgba(10,15,28,0.92)",   // Markets body family
        borderBottomColor: "rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {CATEGORY_CHIPS.map(({ label, value, color }) => {
          const active = activeCategory === value;
          return (
            <motion.button
              key={value}
              whileHover={
                !active
                  ? { scale: 1.025, y: -1, transition: { duration: 0.15, ease: "easeOut" } }
                  : undefined
              }
              whileTap={{ scale: 0.93, transition: { duration: 0.1 } }}
              onClick={() => onChange(value)}
              className="relative shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full
                         text-xs font-semibold outline-none select-none transition-all duration-200"
              style={
                active && color
                  ? {
                      background: `${color}1e`,
                      border: `1px solid ${color}52`,
                      color,
                    }
                  : active
                    ? {
                        background: "rgba(255,255,255,0.09)",
                        border: "1px solid rgba(255,255,255,0.18)",
                        color: "rgba(255,255,255,0.88)",
                      }
                    : {
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.64)",   // readable, not washed
                      }
              }
            >
              {!active && color && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: color }}
                />
              )}
              {label}
            </motion.button>
          );
        })}

        {/* Divider */}
        <div
          className="w-px h-4 mx-0.5 shrink-0"
          style={{ background: "rgba(255,255,255,0.07)" }}
        />

        {/* Filters button */}
        <motion.button
          whileHover={{ scale: 1.02, y: -0.5, transition: { duration: 0.15, ease: "easeOut" } }}
          whileTap={{ scale: 0.94, transition: { duration: 0.1 } }}
          onClick={onOpenDrawer}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                     font-semibold select-none transition-all duration-200"
          style={{
            background: "rgba(255,255,255,0.035)",
            border: "1px solid rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.50)",
          }}
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
              <span className="text-2xs" style={{ color: "rgba(255,255,255,0.44)" }}>
                {filteredCount} of {totalCount}
              </span>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onChange("")}
                className="p-0.5 rounded transition-colors duration-150"
                style={{ color: "rgba(255,255,255,0.42)" }}
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
