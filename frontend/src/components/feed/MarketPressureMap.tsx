"use client";

import { motion } from "framer-motion";
import { useMarketState } from "@/hooks/useMarketState";
import { useMarketCausality } from "@/hooks/useMarketCausality";
import { useReflexivity } from "@/hooks/useReflexivity";
import { useNarrativeEvolution } from "@/hooks/useNarrativeEvolution";
import { useMarketMemory } from "@/hooks/useMarketMemory";
import { useAnticipatory } from "@/hooks/useAnticipatory";
import { useTemporalMarket } from "@/hooks/useTemporalMarket";
import { useMarketRhythm } from "@/hooks/useMarketRhythm";
import { useParticipantDynamics } from "@/hooks/useParticipantDynamics";
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
  const rf = useReflexivity();
  const ne = useNarrativeEvolution();
  const mm  = useMarketMemory();
  const ant = useAnticipatory();
  const tm  = useTemporalMarket();
  const mr  = useMarketRhythm();
  const pd  = useParticipantDynamics();

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
          className="text-[7.5px] font-bold uppercase tracking-[0.16em] shrink-0 pr-4 mr-3"
          style={{ color: "rgba(255,255,255,0.34)", borderRight: "1px solid rgba(255,255,255,0.06)" }}
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
              className="text-[7px] shrink-0"
              style={{ color: "rgba(255,255,255,0.32)" }}
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
                className="text-[7px] italic"
                style={{ color: "rgba(255,255,255,0.28)" }}
              >
                {mc.dominant.contextNote}
              </span>
            )}
            {mc.exhaustionRisk && (
              <span
                className="text-[7px] font-bold uppercase tracking-wide px-1 rounded"
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

      {/* ── Row 2b: Second-order effects + contagion stage ───────────────────── */}
      {(ne.secondOrderEffects.length > 0 || ne.contagionStage !== "none") && (
        <div
          className="px-5 sm:px-7 py-1 flex items-center gap-3 flex-wrap"
          style={{ borderTop: "1px solid rgba(255,255,255,0.012)" }}
        >
          <span
            className="text-[7px] shrink-0"
            style={{ color: "rgba(255,255,255,0.14)" }}
          >
            →→
          </span>
          <div className="flex items-center gap-3.5 flex-wrap flex-1 min-w-0">
            {ne.secondOrderEffects.map(e => (
              <span
                key={e.label}
                className="text-[7px]"
                style={{ color: e.direction === "up" ? "rgba(82,176,200,0.52)" : "rgba(176,80,80,0.52)" }}
              >
                {e.direction === "up" ? "↑" : "↓"}&thinsp;{e.label}
              </span>
            ))}
          </div>
          {ne.contagionStage !== "none" && (
            <span
              className="text-[7px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
              style={{
                color:      ne.contagionStage === "systemic" ? "#c05858" : "#c8a040",
                background: ne.contagionStage === "systemic" ? "rgba(192,80,80,0.08)" : "rgba(200,160,64,0.07)",
                border:     `1px solid ${ne.contagionStage === "systemic" ? "rgba(192,80,80,0.20)" : "rgba(200,160,64,0.16)"}`,
              }}
            >
              {ne.contagionStage}
            </span>
          )}
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
                    className="text-[7px] font-bold uppercase"
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
      {/* ── Row 4: Anticipatory pressure trajectory ───────────────────────────── */}
      {(rf.hiddenStress || rf.unwindVulnerable || rf.liquidityStress || rf.concentrationRisk > 0.68) && (
        <div
          className="px-5 sm:px-7 py-1.5 flex items-center gap-3 flex-wrap"
          style={{ borderTop: "1px solid rgba(255,255,255,0.014)" }}
        >
          <span
            className="text-[6px] font-bold uppercase tracking-[0.18em] shrink-0 pr-3 mr-1"
            style={{ color: "rgba(255,255,255,0.14)", borderRight: "1px solid rgba(255,255,255,0.04)" }}
          >
            Trajectory
          </span>
          <div className="flex items-center gap-4 flex-wrap flex-1">
            {rf.hiddenStress && (
              <span className="text-[7.5px]" style={{ color: "#c8a040" }}>
                Vol compressed / hidden stress
              </span>
            )}
            {rf.unwindVulnerable && (
              <span className="text-[7.5px]" style={{ color: "#c05858" }}>
                Unwind vulnerability ↑
              </span>
            )}
            {rf.liquidityStress && (
              <span className="text-[7.5px]" style={{ color: "#b05858" }}>
                Liquidity deteriorating
              </span>
            )}
            {rf.concentrationRisk > 0.68 && !rf.unwindVulnerable && (
              <span className="text-[7.5px]" style={{ color: "#c8a040" }}>
                Concentration risk elevated
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Row 5: Structural depth — funding, leverage, balance-sheet ─────────── */}
      {(mm.fundingPressure > 0.28 || mm.leverageStress > 0.28 || mm.balanceSheetRisk > 0.22) && (
        <div
          className="px-5 sm:px-7 py-1.5 flex items-center gap-3 flex-wrap"
          style={{ borderTop: "1px solid rgba(255,255,255,0.010)" }}
        >
          <span
            className="text-[6px] font-bold uppercase tracking-[0.18em] shrink-0 pr-3 mr-1"
            style={{ color: "rgba(255,255,255,0.12)", borderRight: "1px solid rgba(255,255,255,0.04)" }}
          >
            Structure
          </span>
          <div className="flex items-center gap-4 flex-wrap flex-1">
            {mm.fundingPressure > 0.28 && (
              <div className="flex items-center gap-1">
                <span className="text-[7px]" style={{ color: "rgba(255,255,255,0.22)" }}>Funding</span>
                <span className="text-[7.5px] font-semibold tabular-nums"
                  style={{ color: mm.fundingPressure > 0.62 ? "#c05858" : "#c8a040" }}>
                  {(mm.fundingPressure * 100).toFixed(0)}
                </span>
              </div>
            )}
            {mm.leverageStress > 0.28 && (
              <div className="flex items-center gap-1">
                <span className="text-[7px]" style={{ color: "rgba(255,255,255,0.22)" }}>Leverage</span>
                <span className="text-[7.5px] font-semibold tabular-nums"
                  style={{ color: mm.leverageStress > 0.62 ? "#c05858" : "#c8a040" }}>
                  {(mm.leverageStress * 100).toFixed(0)}
                </span>
              </div>
            )}
            {mm.balanceSheetRisk > 0.22 && (
              <div className="flex items-center gap-1">
                <span className="text-[7px]" style={{ color: "rgba(255,255,255,0.22)" }}>B/S Risk</span>
                <span className="text-[7.5px] font-semibold tabular-nums"
                  style={{ color: mm.balanceSheetRisk > 0.55 ? "#c05858" : "#c8a040" }}>
                  {(mm.balanceSheetRisk * 100).toFixed(0)}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {mm.structuralPattern !== "none" && (
              <span
                className="text-[6px] italic"
                style={{ color: "rgba(255,255,255,0.20)" }}
              >
                {mm.structureLabel}
              </span>
            )}
            <span
              className="text-[6px] font-bold uppercase tracking-wide px-1 rounded"
              style={{
                color:      mm.memoryLabel === "Conditioned" ? "#c05858" : mm.memoryLabel === "Recurring" ? "#c8a040" : "rgba(255,255,255,0.28)",
                background: mm.memoryLabel === "Conditioned" ? "rgba(192,80,80,0.07)" : mm.memoryLabel === "Recurring" ? "rgba(200,160,64,0.07)" : "transparent",
                border:     mm.memoryLabel !== "First Episode" ? `1px solid ${mm.memoryLabel === "Conditioned" ? "rgba(192,80,80,0.16)" : "rgba(200,160,64,0.14)"}` : "none",
              }}
            >
              {mm.memoryLabel}
            </span>
          </div>
        </div>
      )}

      {/* ── Row 6: Anticipatory / feedback loop signals ───────────────────────── */}
      {(ant.feedbackMode !== "none" || ant.systemicRisk > 0.50 || ant.latentInstability > 0.48 || ant.exogenousType !== "none") && (
        <div
          className="px-5 sm:px-7 py-1.5 flex items-center gap-3 flex-wrap"
          style={{ borderTop: "1px solid rgba(255,255,255,0.008)" }}
        >
          <span
            className="text-[6px] font-bold uppercase tracking-[0.18em] shrink-0 pr-3 mr-1"
            style={{ color: "rgba(255,255,255,0.10)", borderRight: "1px solid rgba(255,255,255,0.04)" }}
          >
            Feedback
          </span>
          <div className="flex items-center gap-4 flex-wrap flex-1">
            {ant.latentInstability > 0.48 && (
              <span className="text-[7.5px]" style={{ color: "rgba(200,160,64,0.60)" }}>
                Latent instability ↑
              </span>
            )}
            {ant.exhaustionProbability > 0.55 && (
              <span className="text-[7.5px]" style={{ color: "rgba(176,80,80,0.60)" }}>
                Exhaustion probable
              </span>
            )}
            {ant.exogenousType !== "none" && (
              <span className="text-[7.5px]" style={{ color: "rgba(82,176,200,0.60)" }}>
                {ant.exogenousType === "geopolitical" ? "Geopolitical stress"
                  : ant.exogenousType === "policy"       ? "Policy shock"
                  : ant.exogenousType === "intervention" ? "Macro intervention"
                  : "Liquidity injection"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {ant.feedbackMode !== "none" && (
              <span
                className="text-[6px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{
                  color:      ant.feedbackMode === "stress_spiral" ? "#c05858" : "#c8a040",
                  background: ant.feedbackMode === "stress_spiral" ? "rgba(192,80,80,0.07)" : "rgba(200,160,64,0.07)",
                  border:     `1px solid ${ant.feedbackMode === "stress_spiral" ? "rgba(192,80,80,0.15)" : "rgba(200,160,64,0.13)"}`,
                }}
              >
                {ant.feedbackMode === "stress_spiral"    ? "stress loop"
                  : ant.feedbackMode === "derisking_cascade" ? "de-risking"
                  : ant.feedbackMode === "liquidity_spiral"  ? "liq spiral"
                  : "vol loop"}
              </span>
            )}
            {ant.systemicRisk > 0.50 && (
              <div className="flex items-center gap-1">
                <span className="text-[6px]" style={{ color: "rgba(255,255,255,0.16)" }}>systemic</span>
                <span className="text-[7px] font-bold tabular-nums"
                  style={{ color: ant.systemicRisk > 0.72 ? "#c05858" : "#c8a040" }}>
                  {(ant.systemicRisk * 100).toFixed(0)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Row 7: Temporal layers / capital hierarchy ────────────────────────── */}
      {((tm.temporalConflict !== "none" && tm.conflictIntensity > 0.38) || tm.capitalHierarchyRisk > 0.52) && (
        <div
          className="px-5 sm:px-7 py-1.5 flex items-center gap-3 flex-wrap"
          style={{ borderTop: "1px solid rgba(255,255,255,0.006)" }}
        >
          <span
            className="text-[6px] font-bold uppercase tracking-[0.18em] shrink-0 pr-3 mr-1"
            style={{ color: "rgba(255,255,255,0.09)", borderRight: "1px solid rgba(255,255,255,0.04)" }}
          >
            Layers
          </span>
          <div className="flex items-center gap-4 flex-wrap flex-1">
            {tm.temporalConflict === "calm_surface_fragile_depth" && (
              <span className="text-[7.5px]" style={{ color: "rgba(200,160,64,0.52)" }}>
                Surface calm · deep fragile
              </span>
            )}
            {tm.temporalConflict === "momentum_breadth_divergence" && (
              <span className="text-[7.5px]" style={{ color: "rgba(200,160,64,0.52)" }}>
                Momentum / breadth split
              </span>
            )}
            {tm.temporalConflict === "vol_liquidity_split" && (
              <span className="text-[7.5px]" style={{ color: "rgba(200,160,64,0.52)" }}>
                Vol stable · liquidity stressed
              </span>
            )}
            {tm.temporalConflict === "compression_building" && (
              <span className="text-[7.5px]" style={{ color: "rgba(200,160,64,0.52)" }}>
                Compression building
              </span>
            )}
            {tm.temporalConflict === "aligned_stress" && (
              <span className="text-[7.5px]" style={{ color: "rgba(176,80,80,0.62)" }}>
                All horizons: stress
              </span>
            )}
            {tm.temporalConflict === "aligned_strength" && (
              <span className="text-[7.5px]" style={{ color: "rgba(82,176,200,0.58)" }}>
                All horizons: strength
              </span>
            )}
          </div>
          {tm.capitalHierarchyRisk > 0.52 && (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[6px]" style={{ color: "rgba(255,255,255,0.14)" }}>capital</span>
              <span className="text-[7px] font-bold tabular-nums"
                style={{ color: tm.capitalHierarchyRisk > 0.70 ? "#c05858" : "#c8a040" }}>
                {(tm.capitalHierarchyRisk * 100).toFixed(0)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Row 8: Market rhythm / participant dynamics ────────────────────────── */}
      {(mr.cyclePhase !== "expansion" || pd.destabilizationRisk > 0.45 || pd.participantCrowding > 0.55) && (
        <div
          className="px-5 sm:px-7 py-1.5 flex items-center gap-3 flex-wrap"
          style={{ borderTop: "1px solid rgba(255,255,255,0.006)" }}
        >
          <span
            className="text-[6px] font-bold uppercase tracking-[0.18em] shrink-0 pr-3 mr-1"
            style={{ color: "rgba(255,255,255,0.09)", borderRight: "1px solid rgba(255,255,255,0.04)" }}
          >
            Rhythm
          </span>
          <div className="flex items-center gap-4 flex-wrap flex-1">
            <span className="text-[7.5px]" style={{
              color: mr.cyclePhase === "instability"  ? "rgba(176,80,80,0.65)"
                   : mr.cyclePhase === "de-risking"   ? "rgba(176,80,80,0.58)"
                   : mr.cyclePhase === "fragility"    ? "rgba(200,130,64,0.60)"
                   : mr.cyclePhase === "crowding"     ? "rgba(200,160,64,0.58)"
                   : mr.cyclePhase === "recovery"     ? "rgba(82,176,200,0.55)"
                   : "rgba(255,255,255,0.36)",
            }}>
              {mr.cyclePhase.charAt(0).toUpperCase() + mr.cyclePhase.slice(1)}
              {mr.recurringInstability ? " · recurrent" : ""}
            </span>
            {pd.dominantParticipant !== "none" && (
              <span className="text-[7.5px]" style={{ color: "rgba(136,152,184,0.50)" }}>
                {pd.dominantParticipant === "vol-targeting" ? "Vol targeting"
                  : pd.dominantParticipant.charAt(0).toUpperCase() + pd.dominantParticipant.slice(1)}{" "}led
              </span>
            )}
            {pd.participantCrowding > 0.55 && (
              <span className="text-[7.5px]" style={{ color: "rgba(200,160,64,0.54)" }}>
                Crowd pressure ↑
              </span>
            )}
          </div>
          {pd.destabilizationRisk > 0.45 && (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[6px]" style={{ color: "rgba(255,255,255,0.14)" }}>cascade</span>
              <span className="text-[7px] font-bold tabular-nums"
                style={{ color: pd.destabilizationRisk > 0.65 ? "#c05858" : "#c88040" }}>
                {(pd.destabilizationRisk * 100).toFixed(0)}
              </span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
