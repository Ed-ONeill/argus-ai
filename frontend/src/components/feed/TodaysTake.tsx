"use client";

import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import type { MarketBrief } from "@/lib/types";

// ── Regime configuration ───────────────────────────────────────────────────────

const REGIME_CONFIG: Record<string, {
  label: string;
  color: string;
  Icon: React.FC<{ size?: number; style?: React.CSSProperties; className?: string }>;
}> = {
  "Risk-Off Hawkish":      { label: "Risk-Off · Hawkish", color: "#b05858", Icon: TrendingDown  },
  "Risk-Off Neutral":      { label: "Risk-Off · Neutral",  color: "#b07838", Icon: TrendingDown  },
  "Risk-On Dovish":        { label: "Risk-On · Dovish",    color: "#52b0c8", Icon: TrendingUp    },
  "Risk-On Neutral":       { label: "Risk-On · Neutral",   color: "#6898c8", Icon: TrendingUp    },
  "Stagflationary":        { label: "Stagflationary",      color: "#c8a040", Icon: AlertTriangle },
  "Neutral/Consolidating": { label: "Neutral",             color: "#8898b8", Icon: Minus         },
};

function getRegimeConfig(regime: string) {
  return REGIME_CONFIG[regime] ?? REGIME_CONFIG["Neutral/Consolidating"];
}

// ── Confidence bar ─────────────────────────────────────────────────────────────

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[7px] font-medium uppercase tracking-[0.14em] shrink-0"
        style={{ color: "rgba(255,255,255,0.38)" }}>
        Signal Confidence
      </span>
      <div className="flex-1 overflow-hidden"
        style={{ height: "2px", borderRadius: "1px", background: "rgba(255,255,255,0.06)" }}>
        <motion.div
          style={{ height: "100%", background: color, opacity: 0.60 }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1.0, ease: [0.25, 0.1, 0.25, 1], delay: 0.4 }}
        />
      </div>
      <span className="text-[10px] font-medium tabular-nums shrink-0"
        style={{ color, opacity: 0.60 }}>
        {value}%
      </span>
    </div>
  );
}

// ── Structured brief (Market Intelligence) ─────────────────────────────────────

function StructuredBrief({ brief }: { brief: MarketBrief }) {
  const regime = getRegimeConfig(brief.market_regime);
  const { Icon } = regime;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative rounded-lg overflow-hidden mb-4"
      style={{ background: "rgba(6,10,20,0.95)" }}
    >
      {/* Atmospheric top separator */}
      <div className="h-px"
        style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.065) 20%, rgba(255,255,255,0.065) 80%, transparent)" }} />

      {/* Left regime color accent */}
      <div className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ background: regime.color, opacity: 0.28 }} />

      <div className="px-6 py-4 pl-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-medium tracking-[0.05em]"
            style={{ color: "rgba(255,255,255,0.40)" }}>
            Market Intelligence
          </span>
          <div className="flex items-center gap-1.5">
            <Icon size={9} style={{ color: regime.color }} />
            <span className="text-[10px] font-medium" style={{ color: regime.color }}>
              {regime.label}
            </span>
            <span className="text-[9px] ml-1 tabular-nums" style={{ color: "rgba(255,255,255,0.25)" }}>
              {today}
            </span>
          </div>
        </div>

        {/* Primary Driver */}
        <div className="mb-3.5">
          <p className="text-[7px] font-medium uppercase tracking-[0.16em] mb-1.5"
            style={{ color: "rgba(255,255,255,0.38)" }}>
            Primary Driver
          </p>
          <p className="text-[13px] font-medium leading-snug"
            style={{ color: "rgba(255,255,255,0.85)" }}>
            {brief.primary_driver}
          </p>
        </div>

        {/* Separator */}
        <div className="h-px mb-3.5"
          style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.05) 20%, rgba(255,255,255,0.05) 80%, transparent)" }} />

        {/* Narrative + Assets */}
        <div className="flex gap-6 mb-3.5">
          <div className="flex-1 min-w-0">
            <p className="text-[7px] font-medium uppercase tracking-[0.16em] mb-1.5"
              style={{ color: "rgba(255,255,255,0.38)" }}>
              Narrative
            </p>
            <p className="text-[11.5px] leading-relaxed"
              style={{ color: "rgba(255,255,255,0.65)" }}>
              {brief.narrative_shift}
            </p>
          </div>
          {brief.assets_impacted.length > 0 && (
            <div className="shrink-0" style={{ maxWidth: 180 }}>
              <p className="text-[7px] font-medium uppercase tracking-[0.16em] mb-1.5"
                style={{ color: "rgba(255,255,255,0.38)" }}>
                Key Assets
              </p>
              <p className="text-[10.5px] leading-relaxed"
                style={{ color: "rgba(140,190,220,0.65)" }}>
                {brief.assets_impacted.join("  ·  ")}
              </p>
            </div>
          )}
        </div>

        {/* Trade + Risk — inline operational rows, no boxes */}
        {(brief.trade_implication || brief.risk_scenario) && (
          <>
            <div className="h-px mb-2"
              style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.04) 20%, rgba(255,255,255,0.04) 80%, transparent)" }} />
            {brief.trade_implication && (
              <div className="flex items-start gap-3 py-1.5">
                <span className="text-[7px] font-medium uppercase tracking-[0.14em] shrink-0 mt-px w-8"
                  style={{ color: "rgba(255,255,255,0.35)" }}>
                  Trade
                </span>
                <span className="text-[11px] leading-relaxed"
                  style={{ color: "rgba(255,255,255,0.72)" }}>
                  {brief.trade_implication}
                </span>
              </div>
            )}
            {brief.risk_scenario && (
              <div className="flex items-start gap-3 py-1.5"
                style={brief.trade_implication ? { borderTop: "1px solid rgba(255,255,255,0.04)" } : {}}>
                <span className="text-[7px] font-medium uppercase tracking-[0.14em] shrink-0 mt-px w-8"
                  style={{ color: "rgba(255,255,255,0.35)" }}>
                  Risk
                </span>
                <span className="text-[11px] leading-relaxed"
                  style={{ color: "rgba(255,255,255,0.52)" }}>
                  {brief.risk_scenario}
                </span>
              </div>
            )}
          </>
        )}

        {/* Confidence + disclaimer */}
        <div className="h-px mt-2.5 mb-3"
          style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.04) 20%, rgba(255,255,255,0.04) 80%, transparent)" }} />
        <ConfidenceBar value={brief.confidence} color={regime.color} />
        <p className="text-[8.5px] mt-1.5" style={{ color: "rgba(255,255,255,0.22)" }}>
          AI-generated macro brief · Not financial advice
        </p>
      </div>
    </motion.section>
  );
}

// ── Simple fallback ────────────────────────────────────────────────────────────

function SimpleTake({ text, isLoading }: { text: string | undefined; isLoading: boolean }) {
  console.log("[TodaysTake] text:", JSON.stringify(text), "| isLoading:", isLoading);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative rounded-lg overflow-hidden mb-4"
      style={{ background: "rgba(6,10,20,0.95)" }}
    >
      {/* Atmospheric top separator */}
      <div className="h-px"
        style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.065) 20%, rgba(255,255,255,0.065) 80%, transparent)" }} />
      {/* Left accent — neutral silver-blue */}
      <div className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ background: "#8898b8", opacity: 0.22 }} />

      <div className="relative px-6 py-4 pl-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-medium tracking-[0.05em]"
            style={{ color: "rgba(255,255,255,0.40)" }}>
            Today&apos;s Take
          </span>
          <span className="text-[9px] tabular-nums" style={{ color: "rgba(255,255,255,0.25)" }}>
            {today}
          </span>
        </div>

        <div className="max-w-[640px]">
          {isLoading || text === undefined ? (
            <div className="space-y-1.5 py-0.5">
              <div className="h-[13px] rounded animate-pulse"
                style={{ background: "rgba(255,255,255,0.05)", width: "100%" }} />
              <div className="h-[13px] rounded animate-pulse"
                style={{ background: "rgba(255,255,255,0.05)", width: "83%" }} />
              <div className="h-[13px] rounded animate-pulse"
                style={{ background: "rgba(255,255,255,0.05)", width: "67%" }} />
            </div>
          ) : text === "" ? (
            <p className="text-[13px] italic" style={{ color: "rgba(255,255,255,0.42)", lineHeight: "1.55" }}>
              Generating today&apos;s brief…
            </p>
          ) : (
            <p className="text-[13px] font-medium" style={{ color: "rgba(255,255,255,0.82)", lineHeight: "1.55" }}>
              {text}
            </p>
          )}
        </div>

        {!isLoading && (
          <p className="mt-2 text-[8.5px]" style={{ color: "rgba(255,255,255,0.25)" }}>
            AI-generated summary · Not financial advice
          </p>
        )}
      </div>
    </motion.section>
  );
}

// ── Public component ───────────────────────────────────────────────────────────

interface TodaysTakeProps {
  text:      string | undefined;
  brief?:    MarketBrief | null;
  isLoading: boolean;
}

export function TodaysTake({ text, brief, isLoading }: TodaysTakeProps) {
  if (brief && !isLoading) return <StructuredBrief brief={brief} />;
  if (text === undefined && !isLoading) return null;
  return <SimpleTake text={text} isLoading={isLoading} />;
}
