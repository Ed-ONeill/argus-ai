"use client";

import { X, SlidersHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { FeedParams } from "@/lib/types";

const CATEGORIES: { label: string; color: string }[] = [
  { label: "Markets",      color: "#2563EB" },
  { label: "M&A",          color: "#7C3AED" },
  { label: "Geopolitical", color: "#DC2626" },
  { label: "Company",      color: "#0891B2" },
];

const SOURCES = [
  "WSJ Markets", "CNBC Economy", "MarketWatch",
  "Yahoo Finance", "Reuters M&A", "PR Newswire M&A",
  "Reuters World", "Politico",
];

interface FilterDrawerProps {
  open:     boolean;
  onClose:  () => void;
  params:   FeedParams;
  onChange: (next: Partial<FeedParams>) => void;
}

export function FilterDrawer({ open, onClose, params, onChange }: FilterDrawerProps) {
  const activeCats = new Set((params.categories ?? "").split(",").filter(Boolean));
  const activeSrcs = new Set((params.sources    ?? "").split(",").filter(Boolean));

  function toggleCat(cat: string) {
    const next = new Set(activeCats);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    onChange({ categories: [...next].join(",") });
  }
  function toggleSrc(src: string) {
    const next = new Set(activeSrcs);
    if (next.has(src)) next.delete(src); else next.add(src);
    onChange({ sources: [...next].join(",") });
  }

  const activeFilterCount =
    activeCats.size + activeSrcs.size +
    (params.fresh_only ? 1 : 0) +
    (params.use_ai === false ? 1 : 0);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-72 bg-surface border-l border-edge
                       flex flex-col shadow-drawer"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-edge">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={14} className="text-ink-muted" />
                <span className="text-sm font-semibold text-ink">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="text-2xs font-bold px-1.5 py-0.5 rounded-full
                                   bg-accent text-white leading-none">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-raised text-ink-muted hover:text-ink transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">

              <Section label="Time range">
                <Toggle
                  label="Fresh only (≤ 48h)"
                  checked={!!params.fresh_only}
                  onChange={v => onChange({ fresh_only: v })}
                />
              </Section>

              <Section label="AI summaries">
                <Toggle
                  label="Enable AI enrichment"
                  checked={params.use_ai !== false}
                  onChange={v => onChange({ use_ai: v })}
                />
              </Section>

              <Section label="Categories">
                <div className="space-y-1">
                  {CATEGORIES.map(({ label, color }) => (
                    <CategoryChip
                      key={label}
                      label={label}
                      color={color}
                      active={activeCats.size === 0 || activeCats.has(label)}
                      onClick={() => toggleCat(label)}
                    />
                  ))}
                </div>
              </Section>

              <Section label="Sources">
                <div className="space-y-1">
                  {SOURCES.map(src => (
                    <Chip
                      key={src}
                      label={src}
                      active={activeSrcs.size === 0 || activeSrcs.has(src)}
                      onClick={() => toggleSrc(src)}
                    />
                  ))}
                </div>
              </Section>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-edge">
              <button
                onClick={() => onChange({ categories: "", sources: "", fresh_only: false, use_ai: true })}
                className={cn(
                  "w-full py-2 rounded-lg text-sm font-medium transition-colors",
                  activeFilterCount > 0
                    ? "bg-raised text-ink hover:bg-edge"
                    : "text-ink-muted cursor-default"
                )}
                disabled={activeFilterCount === 0}
              >
                Reset all filters
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-2xs font-bold uppercase tracking-widest text-ink-muted">{label}</p>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer gap-3 py-0.5">
      <span className="text-sm text-ink-secondary">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex w-9 h-5 rounded-full transition-colors duration-200 shrink-0",
          checked ? "bg-accent" : "bg-edge-strong"
        )}
      >
        <motion.span
          animate={{ x: checked ? 16 : 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
        />
      </button>
    </label>
  );
}

function CategoryChip({ label, color, active, onClick }: {
  label: string; color: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 text-left text-sm px-3 py-1.5 rounded-md transition-colors",
        active ? "bg-raised text-ink font-medium" : "text-ink-muted hover:bg-raised/60"
      )}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: active ? color : "#C2CBD8" }}
      />
      {label}
    </button>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors",
        active
          ? "bg-raised text-ink font-medium"
          : "text-ink-muted hover:bg-raised/60"
      )}
    >
      {label}
    </button>
  );
}
