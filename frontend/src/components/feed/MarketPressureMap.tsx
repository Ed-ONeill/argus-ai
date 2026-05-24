"use client";

import { motion } from "framer-motion";
import { useMarketState } from "@/hooks/useMarketState";
import { useMarketCausality } from "@/hooks/useMarketCausality";
import type { MarketSignal } from "@/hooks/useMarketState";

// ── Regime-derived fallback (when live data unavailable) ──────────────────────

function deriveCrossAsset(regime: string): MarketSignal[] {
  const r       = regime.toLowerCase();
  const isOn    = r.includes("risk-on")  || r.includes("expansion") || r.includes("dovish") || r.includes("easing");
  const isOff   = r.includes("risk-off") || r.includes("tighten")   || r.includes("stagflat") || r.includes("shock") || r.includes("hawkish");
  const isTight = r.includes("tighten")  || r.includes("hawkish")   || r.includes("hike") || r.includes("qt");
  const isEase  = r.includes("easing")   || r.includes("dovish")    || r.includes("cut")  || r.includes("qe");
  const isStagf = r.includes("stagflat");

  return [
    {
      label: "Yields",
      arrow: isTight ? "↑" : isEase ? "↓" : "→",
      value: isTight ? "Rising"  : isEase   ? "Falling"  : "Stable",
      color: isTight ? "#c8a040" : isEase   ? "#52b0c8"  : "#8898b8",
    },
    {
      label: "Dollar",
      arrow: isOff ? "↑" : isOn ? "↓" : "→",
      value: isOff ? "Bid"    : isOn  ? "Soft"    : "Mixed",
      color: isOff ? "#c8a040" : isOn  ? "#52b0c8" : "#8898b8",
    },
    {
      label: "Gold",
      arrow: (isOff || isStagf) ? "↑" : (isOn && !isStagf) ? "↓" : "→",
      value: (isOff || isStagf) ? "Bid" : (isOn && !isStagf) ? "Soft" : "Flat",
      color: (isOff || isStagf) ? "#c8a040" : "#8898b8",
    },
    {
      label: "Oil",
      arrow: (isOn || isStagf) ? "↑" : (isOff && !isStagf) ? "↓" : "→",
      value: (isOn || isStagf) ? "Bid"  : (isOff && !isStagf) ? "Soft" : "Flat",
      color: (isOn || isStagf) ? "#c8a040" : "#8898b8",
    },
    {
      label: "VIX",
      arrow: isOff ? "↑" : isOn ? "↓" : "→",
      value: isOff ? "Elevated"   : isOn ? "Compressed" : "Moderate",
      color: isOff ? "#b05858"    : isOn ? "#52b0c8"    : "#8898b8",
    },
    {
      label: "Spreads",
      arrow: isOff ? "↑" : isOn ? "↓" : "→",
      value: isOff ? "Widening"   : isOn ? "Tightening" : "Stable",
      color: isOff ? "#b05858"    : isOn ? "#52b0c8"    : "#8898b8",
    },
  ];
}

// ── Display constants ─────────────────────────────────────────────────────────

const DIRECTION_COLOR = {
  up:      "#52b0c8",
  down:    "#b05858",
  neutral: "#8898b8",
} as const;

const STRENGTH_OPACITY = {
  strong:   1.00,
  moderate: 0.74,
  weak:     0.46,
} as const;

const TENSION_COLOR = {
  high:     "#b05858",
  moderate: "#c8a040",
  low:      "#8898b8",
} as const;

const CATEGORY_LABEL: Record<string, string> = {
  dominant:  "dominant",
  emerging:  "emerging",
  secondary: "secondary",
  fading:    "fading",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface MarketPressureMapProps {
  regime: string;
}

export function MarketPressureMap({ regime }: MarketPressureMapProps) {
  const ms = useMarketState();
  const mc = useMarketCausality();

  const signals = ms.hasData ? ms.signals : deriveCrossAsset(regime);
  const isLive  = ms.hasData;

  if (!regime && !isLive) return null;

  const borderOp  = (0.042 + ms.stressIntensity * 0.055).toFixed(3);
  const borderClr = ms.stressIntensity > 0.20
    ? `rgba(180,60,60,${borderOp})`
    : `rgba(255,255,255,${borderOp})`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="-mx-4 sm:-mx-6 mb-5"
      style={{
        background:   "rgba(4,8,20,0.92)",
        borderTop:    `1px solid ${borderClr}`,
        borderBottom: `1px solid ${borderClr}`,
      }}
    >
      {/* ── Row 1: Cross-asset signals ─────────────────────────────────────── */}
      <div className="px-5 sm:px-7 py-2.5 flex items-center gap-0">
        <span
          className="text-[6px] font-bold uppercase tracking-[0.20em] shrink-0 pr-4 mr-3"
          style={{ color: "rgba(255,255,255,0.24)", borderRight: "1px solid rgba(255,255,255,0.05)" }}
        >
          Cross-Asset
        </span>
        <div className="flex items-center gap-5 flex-wrap flex-1">
          {signals.map(s => (
            <div key={s.label} className="flex items-center gap-1">
              <span className="text-[9px] font-bold leading-none" style={{ color: s.color }}>{s.arrow}</span>
              <span className="text-[7px] ml-0.5" style={{ color: "rgba(255,255,255,0.30)" }}>{s.label}</span>
              <span className="text-[8.5px] font-semibold ml-0.5" style={{ color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
        <span className="text-[7px] shrink-0 italic" style={{ color: "rgba(255,255,255,0.16)" }}>
          {isLive ? "live" : "state-derived"}
        </span>
      </div>

      {/* ── Row 2: Dominant causal chain ──────────────────────────────────── */}
      {mc.dominant && (
        <div
          className="px-5 sm:px-7 py-2 flex items-center gap-3 flex-wrap"
          style={{ borderTop: "1px solid rgba(255,255,255,0.028)" }}
        >
          {/* Trigger tag + category badge */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="text-[8px] font-bold px-1.5 py-0.5 rounded"
              style={{
                color:         "rgba(255,255,255,0.84)",
                background:    mc.dominant.category === "dominant" ? "rgba(255,255,255,0.07)"
                               : mc.dominant.category === "emerging" ? "rgba(82,176,200,0.10)"
                               : "rgba(255,255,255,0.04)",
                border:        `1px solid ${
                  mc.dominant.category === "dominant" ? "rgba(255,255,255,0.12)"
                  : mc.dominant.category === "emerging" ? "rgba(82,176,200,0.22)"
                  : "rgba(255,255,255,0.07)"
                }`,
                letterSpacing: "0.04em",
              }}
            >
              {mc.dominant.reframe ?? mc.dominant.triggerTag}
            </span>
            <span
              className="text-[6.5px] italic shrink-0"
              style={{ color: "rgba(255,255,255,0.26)" }}
            >
              {CATEGORY_LABEL[mc.dominant.category]}
            </span>
          </div>

          <span className="text-[8px] shrink-0" style={{ color: "rgba(255,255,255,0.18)" }}>→</span>

          {/* Causal implications */}
          <div className="flex items-center gap-3.5 flex-wrap flex-1 min-w-0">
            {mc.dominant.implications.map(imp => (
              <span
                key={imp.label}
                className="text-[8px] font-medium"
                style={{
                  color:   imp.contextDampened ? "rgba(255,255,255,0.30)" : DIRECTION_COLOR[imp.direction],
                  opacity: STRENGTH_OPACITY[imp.strength],
                  textDecoration: imp.contextDampened ? "line-through" : "none",
                  textDecorationColor: "rgba(255,255,255,0.20)",
                }}
              >
                {imp.direction === "up" ? "↑" : imp.direction === "down" ? "↓" : "→"}&thinsp;{imp.label}
              </span>
            ))}
          </div>

          {/* Right: context note or persistence label */}
          <div className="flex items-center gap-2 shrink-0">
            {mc.dominant.contextNote && (
              <span
                className="text-[6.5px] italic"
                style={{ color: "rgba(255,255,255,0.28)" }}
              >
                {mc.dominant.contextNote}
              </span>
            )}
            {mc.exhaustionRisk && (
              <span
                className="text-[6.5px] font-bold uppercase tracking-wide px-1 rounded"
                style={{ color: "#c8a040", background: "rgba(200,160,64,0.08)", border: "1px solid rgba(200,160,64,0.18)" }}
              >
                exhausting
              </span>
            )}
            {!mc.dominant.contextNote && !mc.exhaustionRisk && (
              <span className="text-[7px] italic" style={{ color: "rgba(255,255,255,0.20)" }}>
                {mc.persistenceLabel}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Row 3: Conflict signals (when detected) ────────────────────────── */}
      {mc.hasConflict && mc.conflicts.length > 0 && (
        <div
          className="px-5 sm:px-7 py-1.5 flex items-center gap-3 flex-wrap"
          style={{ borderTop: "1px solid rgba(255,255,255,0.020)" }}
        >
          <span
            className="text-[6px] font-bold uppercase tracking-[0.18em] shrink-0 pr-3 mr-1"
            style={{ color: "rgba(255,255,255,0.18)", borderRight: "1px solid rgba(255,255,255,0.04)" }}
          >
            Divergence
          </span>
          <div className="flex items-center gap-4 flex-wrap flex-1 min-w-0">
            {mc.conflicts.slice(0, 3).map(c => (
              <div key={c.id} className="flex items-center gap-1.5">
                <span
                  className="text-[7.5px] font-semibold"
                  style={{ color: TENSION_COLOR[c.tension] }}
                >
                  {c.label}
                </span>
                <span
                  className="text-[7px]"
                  style={{ color: "rgba(255,255,255,0.26)" }}
                >
                  {c.note}
                </span>
                {c.dominant !== "neutral" && (
                  <span
                    className="text-[6.5px] font-bold uppercase"
                    style={{ color: "rgba(255,255,255,0.22)" }}
                  >
                    [{c.dominant} led]
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
