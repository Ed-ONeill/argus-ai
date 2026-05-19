"use client";

import { Sparkles, TrendingUp, TrendingDown, Minus, AlertTriangle, ArrowRight, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { MarketBrief } from "@/lib/types";

// ── Regime configuration ───────────────────────────────────────────────────────

type RegimeKey =
  | "Risk-Off Hawkish" | "Risk-Off Neutral"
  | "Risk-On Dovish"   | "Risk-On Neutral"
  | "Stagflationary"   | "Neutral/Consolidating";

const REGIME_CONFIG: Record<string, {
  label:   string;
  pill:    string;   // Tailwind classes for the badge
  bar:     string;   // gradient for confidence bar
  Icon:    React.FC<{ size?: number; className?: string }>;
}> = {
  "Risk-Off Hawkish":    { label: "Risk-Off · Hawkish",    pill: "bg-red-500/20 text-red-300 border border-red-500/25",        bar: "from-red-400/50 to-red-300/70",     Icon: TrendingDown  },
  "Risk-Off Neutral":    { label: "Risk-Off · Neutral",    pill: "bg-orange-500/20 text-orange-300 border border-orange-500/25", bar: "from-orange-400/50 to-orange-300/70", Icon: TrendingDown },
  "Risk-On Dovish":      { label: "Risk-On · Dovish",      pill: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/25", bar: "from-emerald-400/50 to-emerald-300/70", Icon: TrendingUp },
  "Risk-On Neutral":     { label: "Risk-On · Neutral",     pill: "bg-blue-500/20 text-blue-300 border border-blue-500/25",      bar: "from-blue-400/60 to-blue-300/80",   Icon: TrendingUp    },
  "Stagflationary":      { label: "Stagflationary",        pill: "bg-amber-500/20 text-amber-300 border border-amber-500/25",   bar: "from-amber-400/50 to-amber-300/70", Icon: AlertTriangle  },
  "Neutral/Consolidating": { label: "Neutral",             pill: "bg-slate-500/20 text-slate-300 border border-slate-500/25",   bar: "from-slate-400/50 to-slate-300/70", Icon: Minus          },
};

function getRegimeConfig(regime: string) {
  return REGIME_CONFIG[regime] ?? REGIME_CONFIG["Neutral/Consolidating"];
}

// ── Confidence bar ─────────────────────────────────────────────────────────────

function ConfidenceBar({ value, barClass }: { value: number; barClass: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 shrink-0">
        Signal Confidence
      </span>
      <div className="flex-1 h-[3px] bg-white/8 rounded-full overflow-hidden">
        <motion.div
          className={`h-full bg-gradient-to-r ${barClass} rounded-full`}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1.0, ease: [0.25, 0.1, 0.25, 1], delay: 0.5 }}
        />
      </div>
      <span className="text-[11px] font-medium text-white/50 tabular-nums shrink-0 w-7 text-right">
        {value}%
      </span>
    </div>
  );
}

// ── Structured brief layout (Today's Take 2.0) ────────────────────────────────

function StructuredBrief({ brief }: { brief: MarketBrief }) {
  const regime = getRegimeConfig(brief.market_regime);
  const { Icon } = regime;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative rounded-2xl overflow-hidden mb-8"
      style={{
        background: "linear-gradient(140deg, #0F1E3A 0%, #162D6B 50%, #0F1E3A 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 4px 32px rgba(10,15,30,0.35)",
      }}
    >
      {/* Ambient top-right glow */}
      <div
        className="absolute -top-12 -right-8 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(96,165,250,0.07) 0%, transparent 65%)" }}
      />
      {/* Readability overlay */}
      <div className="absolute inset-0 bg-black/15 pointer-events-none" />

      <div className="relative px-6 py-4 sm:px-7 sm:py-5 space-y-4">

        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={11} className="text-blue-300/80" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-200/70">
              Market Intelligence
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Regime badge */}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${regime.pill}`}>
              <Icon size={9} />
              {regime.label}
            </span>
            <span className="text-[10px] text-white/35 tabular-nums hidden sm:block">{today}</span>
          </div>
        </div>

        {/* ── Primary Driver ───────────────────────────────── */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 mb-1.5">
            Primary Driver
          </p>
          <p
            className="text-[15px] font-medium text-white leading-[1.55]"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.35)" }}
          >
            {brief.primary_driver}
          </p>
        </div>

        {/* ── Divider ──────────────────────────────────────── */}
        <div className="border-t border-white/8" />

        {/* ── Narrative + Assets row ───────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 sm:gap-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 mb-1.5">
              Narrative Shift
            </p>
            <p className="text-[13px] text-white/75 leading-[1.55]">
              {brief.narrative_shift}
            </p>
          </div>
          {brief.assets_impacted.length > 0 && (
            <div className="sm:max-w-[200px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 mb-1.5">
                Key Assets
              </p>
              <div className="flex flex-wrap gap-1.5">
                {brief.assets_impacted.map((asset) => (
                  <span
                    key={asset}
                    className="px-2 py-0.5 rounded-md text-[11px] font-medium text-blue-200/80
                               bg-blue-500/15 border border-blue-400/20"
                  >
                    {asset}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Trade Implication ────────────────────────────── */}
        {brief.trade_implication && (
          <div className="flex items-start gap-2 rounded-lg bg-white/5 border border-white/8 px-3.5 py-2.5">
            <ArrowRight size={13} className="text-blue-300/70 mt-0.5 shrink-0" />
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 mr-2">
                Trade
              </span>
              <span className="text-[12.5px] text-white/80">{brief.trade_implication}</span>
            </div>
          </div>
        )}

        {/* ── Risk Scenario ────────────────────────────────── */}
        {brief.risk_scenario && (
          <div className="flex items-start gap-2">
            <Shield size={11} className="text-amber-400/50 mt-0.5 shrink-0" />
            <p className="text-[11.5px] text-white/45 leading-[1.5]">
              <span className="text-white/30 font-semibold uppercase tracking-[0.12em] text-[10px] mr-1.5">Risk</span>
              {brief.risk_scenario}
            </p>
          </div>
        )}

        {/* ── Confidence bar + footer ─────────────────────── */}
        <div className="space-y-2 pt-1">
          <ConfidenceBar value={brief.confidence} barClass={regime.bar} />
          <p className="text-[10px] text-white/30 tracking-wide">
            AI-generated macro brief · Not financial advice
          </p>
        </div>

      </div>
    </motion.section>
  );
}

// ── Simple fallback (plain text take) ─────────────────────────────────────────

function SimpleTake({ text, isLoading }: { text: string | undefined; isLoading: boolean }) {
  console.log("[TodaysTake] text:", JSON.stringify(text), "| isLoading:", isLoading);

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
        background: "linear-gradient(140deg, #14243E 0%, #1E47A8 48%, #13243C 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 4px 24px rgba(15,23,42,0.15)",
      }}
    >
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />
      <div
        className="absolute -top-10 -right-4 w-48 h-48 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(96,165,250,0.10) 0%, transparent 70%)" }}
      />
      <div className="relative px-6 py-4 sm:px-7 sm:py-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Sparkles size={11} className="text-blue-300" />
            <span className="text-2xs font-bold uppercase tracking-[0.18em] text-blue-200/90">
              Today&apos;s Take
            </span>
          </div>
          <span className="text-2xs font-medium text-white/50 tabular-nums">{today}</span>
        </div>
        <div className="max-w-[640px]">
          {isLoading || text === undefined ? (
            <div className="space-y-2 py-0.5">
              <div className="h-[15px] bg-white/10 rounded animate-pulse w-full" />
              <div className="h-[15px] bg-white/10 rounded animate-pulse w-5/6" />
              <div className="h-[15px] bg-white/10 rounded animate-pulse w-2/3" />
            </div>
          ) : text === "" ? (
            <p className="text-[14.5px] text-white/50 italic" style={{ lineHeight: "1.58" }}>
              Generating today&apos;s brief…
            </p>
          ) : (
            <p className="text-[14.5px] text-white" style={{ lineHeight: "1.58", textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>
              {text}
            </p>
          )}
        </div>
        {!isLoading && (
          <p className="mt-3 text-2xs text-white/60 tracking-wide" style={{ textShadow: "0 1px 1px rgba(0,0,0,0.3)" }}>
            AI-generated summary · Not financial advice
          </p>
        )}
      </div>
    </motion.section>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

interface TodaysTakeProps {
  text:      string | undefined;
  brief?:    MarketBrief | null;
  isLoading: boolean;
}

export function TodaysTake({ text, brief, isLoading }: TodaysTakeProps) {
  // Structured brief available → premium layout
  if (brief && !isLoading) {
    return <StructuredBrief brief={brief} />;
  }

  // Structured not yet generated / still loading → plain text fallback
  if (text === undefined && !isLoading) return null;

  return <SimpleTake text={text} isLoading={isLoading} />;
}
