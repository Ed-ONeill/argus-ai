"use client";

import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface TodaysTakeProps {
  // undefined  → data not yet received (API call in flight or no data at all)
  // ""         → data received but market_take is empty (backend still generating)
  // string     → ready to render
  text:      string | undefined;
  isLoading: boolean;
}

export function TodaysTake({ text, isLoading }: TodaysTakeProps) {
  console.log("[TodaysTake] text:", JSON.stringify(text), "| isLoading:", isLoading);

  // Only bail out when we have NO data at all and are not loading.
  // An empty string means the backend responded but the take isn't ready yet —
  // keep the section mounted so it appears as soon as the content arrives.
  if (text === undefined && !isLoading) return null;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative rounded-2xl overflow-hidden mb-8"
      style={{
        // Slightly lifted edge stops — less crushing darkness, more vibrant mid-blue
        background: "linear-gradient(140deg, #14243E 0%, #1E47A8 48%, #13243C 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 4px 24px rgba(15,23,42,0.15)",
      }}
    >
      {/* Dark readability overlay — sits above gradient, below content */}
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />

      {/* Radial glow top-right */}
      <div
        className="absolute -top-10 -right-4 w-48 h-48 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(96,165,250,0.10) 0%, transparent 70%)" }}
      />

      <div className="relative px-6 py-4 sm:px-7 sm:py-5">
        {/* ── Header row ──────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Sparkles size={11} className="text-blue-300" />
            <span className="text-2xs font-bold uppercase tracking-[0.18em] text-blue-200/90">
              Today&apos;s Take
            </span>
          </div>
          <span className="text-2xs font-medium text-white/50 tabular-nums">
            {today}
          </span>
        </div>

        {/* ── Body — constrained to readable width ─────── */}
        <div className="max-w-[640px]">
          {isLoading || text === undefined ? (
            <div className="space-y-2 py-0.5">
              <div className="h-[15px] bg-white/10 rounded animate-pulse w-full" />
              <div className="h-[15px] bg-white/10 rounded animate-pulse w-5/6" />
              <div className="h-[15px] bg-white/10 rounded animate-pulse w-2/3" />
            </div>
          ) : text === "" ? (
            <p
              className="text-[14.5px] text-white/50 italic"
              style={{ lineHeight: "1.58" }}
            >
              Generating today&apos;s brief…
            </p>
          ) : (
            <p
              className="text-[14.5px] text-white"
              style={{
                lineHeight: "1.58",
                textShadow: "0 1px 2px rgba(0,0,0,0.4)",
              }}
            >
              {text}
            </p>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────── */}
        {!isLoading && (
          <p
            className="mt-3 text-2xs text-white/60 tracking-wide"
            style={{ textShadow: "0 1px 1px rgba(0,0,0,0.3)" }}
          >
            AI-generated summary · Not financial advice
          </p>
        )}
      </div>
    </motion.section>
  );
}
