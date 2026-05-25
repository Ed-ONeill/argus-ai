"use client";

import { useMarketState } from "./useMarketState";
import { useMarketMemory } from "./useMarketMemory";
import { useAnticipatory } from "./useAnticipatory";
import { useNarrativeEvolution } from "./useNarrativeEvolution";
import { useReflexivity } from "./useReflexivity";

// ── Types ──────────────────────────────────────────────────────────────────────

export type TemporalDirection = "stress" | "neutral" | "strength";

export type TemporalConflict =
  | "calm_surface_fragile_depth"    // surface calm, structural fragile
  | "momentum_breadth_divergence"   // strong trend, narrow participation
  | "vol_liquidity_split"           // vol stable, liquidity stressed
  | "compression_building"          // suppression + structural buildup
  | "aligned_stress"                // all horizons confirming stress
  | "aligned_strength"              // all horizons confirming strength
  | "none";

export interface TemporalLayer {
  horizon:   "intraday" | "swing" | "structural";
  intensity: number;         // 0-1
  direction: TemporalDirection;
  velocity:  number;         // 0-1, rate of change at this timescale
}

export interface TemporalMarketState {
  // Phase 1 — Three temporal layers (fast / medium / slow)
  intraday:   TemporalLayer;
  swing:      TemporalLayer;
  structural: TemporalLayer;

  // Phase 2 — Organic evolution
  organicStress:     number;  // 0-1 bottom-up stress emergence
  organicStrength:   number;  // 0-1 bottom-up strength emergence
  evolutionVelocity: number;  // 0-1 how fast the system is evolving

  // Phase 3 — Capital hierarchy
  leverageHierarchy:    number;  // 0-1
  fundingPressureDepth: number;  // 0-1
  liquidityTierStress:  number;  // 0-1
  capitalHierarchyRisk: number;  // 0-1 composite

  // Phase 4 — Temporal conflict
  temporalConflict:  TemporalConflict;
  conflictIntensity: number;  // 0-1

  // Phase 5 — Emergent synthesis
  temporalCohesion:   number;  // 0-1 (low = conflicted, high = aligned)
  emergentComplexity: number;  // 0-1 (higher = more interacting forces)
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTemporalMarket(): TemporalMarketState {
  const ms = useMarketState();
  const mm = useMarketMemory();
  const an = useAnticipatory();
  const ne = useNarrativeEvolution();
  const rf = useReflexivity();

  const momentumAge = Math.min(ms.trend.duration / 6, 1);

  // ── Phase 1 — Intraday layer (fast, emotional) ────────────────────────────
  // Driven by current acute stress, vol, and sentiment. Always high velocity.

  const intradayIntensity = Math.min(
    ms.stressIntensity   * 0.45 +
    ms.volScore          * 0.30 +
    rf.emotionalIntensity * 0.25,
    1.0,
  );

  const intradayDirection: TemporalDirection =
    rf.emotionalState === "panic" || ms.riskRegime === "risk-off"    ? "stress"   :
    rf.emotionalState === "euphoria" || ms.riskRegime === "risk-on"  ? "strength" :
    "neutral";

  const intradayVelocity = 0.75 + ms.atmosphereIntensity * 0.25;

  // ── Phase 1 — Swing layer (medium, positioning) ───────────────────────────
  // Driven by trend aging, exhaustion, crowding, narrative phase.

  const swingIntensity = Math.min(
    (ms.exhaustionRisk ? 0.34 : 0)   +
    momentumAge                * 0.28 +
    rf.concentrationRisk       * 0.22 +
    an.feedbackIntensity       * 0.16,
    1.0,
  );

  const swingDirection: TemporalDirection =
    (ms.exhaustionRisk && rf.isCrowded)                                               ? "stress"   :
    (ne.dominantPhase === "building" || ne.dominantPhase === "emerging") && !ms.exhaustionRisk ? "strength" :
    "neutral";

  const swingVelocity = Math.min(0.28 + ms.atmosphereIntensity * 0.32, 0.65);

  // ── Phase 1 — Structural layer (slow, accumulated) ────────────────────────
  // Driven by session-accumulated fragility, balance-sheet risk, latent buildup.
  // Velocity is deliberately low — structural forces move glacially.

  const structuralIntensity = Math.min(
    mm.adaptiveFragility  * 0.30 +
    mm.balanceSheetRisk   * 0.28 +
    an.latentInstability  * 0.26 +
    an.brittleness        * 0.16,
    1.0,
  );

  const structuralDirection: TemporalDirection =
    structuralIntensity > 0.44 ? "stress"   :
    structuralIntensity < 0.18 && ms.riskRegime === "risk-on" ? "strength" :
    "neutral";

  const structuralVelocity = 0.04 + mm.adaptiveFragility * 0.20;

  const intraday:   TemporalLayer = { horizon: "intraday",   intensity: intradayIntensity,   direction: intradayDirection,   velocity: intradayVelocity   };
  const swing:      TemporalLayer = { horizon: "swing",      intensity: swingIntensity,      direction: swingDirection,      velocity: swingVelocity      };
  const structural: TemporalLayer = { horizon: "structural", intensity: structuralIntensity, direction: structuralDirection, velocity: structuralVelocity };

  // ── Phase 2 — Organic evolution ───────────────────────────────────────────
  // Stress/strength emerge from layer interactions, not just individual layers.

  const stressCount    = [intradayDirection, swingDirection, structuralDirection].filter(d => d === "stress").length;
  const strengthCount  = [intradayDirection, swingDirection, structuralDirection].filter(d => d === "strength").length;

  const organicStress = Math.min(
    intradayIntensity   * 0.30 +
    swingIntensity      * 0.38 +
    structuralIntensity * 0.32 +
    (stressCount >= 2   ? 0.18 : 0),   // cross-horizon alignment amplifier
    1.0,
  );

  const organicStrength = Math.min(
    (intradayDirection   === "strength" ? intradayIntensity   * 0.35 : 0) +
    (swingDirection      === "strength" ? swingIntensity      * 0.40 : 0) +
    (structuralDirection === "strength" ? structuralIntensity * 0.25 : 0) +
    (strengthCount >= 2  ? 0.14 : 0),
    1.0,
  );

  const evolutionVelocity = Math.min(
    intradayVelocity   * 0.40 +
    swingVelocity      * 0.35 +
    structuralVelocity * 0.25,
    1.0,
  );

  // ── Phase 3 — Capital hierarchy ───────────────────────────────────────────
  // Tiered financial structure: leverage cascades through funding into liquidity.

  const leverageHierarchy = Math.min(
    mm.leverageStress          * 0.48 +
    an.feedbackIntensity       * 0.30 +
    an.structuralVulnerability * 0.22,
    1.0,
  );

  const fundingPressureDepth = Math.min(
    mm.fundingPressure                          * 0.52 +
    (ms.ratesRegime  === "rising"  ? 0.24 : 0) +
    (ms.dollarRegime === "strong"  ? 0.24 : 0),
    1.0,
  );

  const liquidityTierStress = Math.min(
    mm.liquidityDeterioration * 0.52 +
    an.latentInstability      * 0.28 +
    (ne.contagionActive       ? 0.20 : 0),
    1.0,
  );

  const capitalHierarchyRisk = Math.min(
    leverageHierarchy    * 0.40 +
    fundingPressureDepth * 0.35 +
    liquidityTierStress  * 0.25,
    1.0,
  );

  // ── Phase 4 — Temporal conflict detection ────────────────────────────────
  // Different horizons pulling in different directions creates structural tension.

  let temporalConflict: TemporalConflict = "none";
  let conflictIntensity = 0;

  if (stressCount === 3) {
    temporalConflict  = "aligned_stress";
    conflictIntensity = organicStress;
  } else if (strengthCount === 3) {
    temporalConflict  = "aligned_strength";
    conflictIntensity = organicStrength;
  } else if (intradayDirection !== "stress" && structuralDirection === "stress" && structuralIntensity > 0.36) {
    temporalConflict  = "calm_surface_fragile_depth";
    conflictIntensity = structuralIntensity * (1 - intradayIntensity * 0.48);
  } else if (swingDirection === "strength" && rf.narrowParticipation && swingIntensity > 0.32) {
    temporalConflict  = "momentum_breadth_divergence";
    conflictIntensity = swingIntensity * 0.62;
  } else if (ms.volRegime === "low" && mm.liquidityDeterioration > 0.26) {
    temporalConflict  = "vol_liquidity_split";
    conflictIntensity = mm.liquidityDeterioration * 0.68;
  } else if (an.latentInstability > 0.38 && intradayDirection !== "stress") {
    temporalConflict  = "compression_building";
    conflictIntensity = an.latentInstability * 0.68;
  }

  // ── Phase 5 — Emergent synthesis ──────────────────────────────────────────

  const directionMatchScore =
    (intradayDirection === swingDirection      ? 0.33 : 0) +
    (swingDirection    === structuralDirection ? 0.33 : 0) +
    (intradayDirection === structuralDirection ? 0.34 : 0);

  const temporalCohesion = directionMatchScore;

  const emergentComplexity = Math.min(
    [intradayIntensity, swingIntensity, structuralIntensity].filter(i => i > 0.26).length * 0.24 +
    (an.feedbackMode !== "none"  ? 0.18 : 0) +
    (ne.contagionActive          ? 0.16 : 0) +
    (temporalConflict !== "none" &&
     temporalConflict !== "aligned_stress" &&
     temporalConflict !== "aligned_strength" ? 0.16 : 0),
    1.0,
  );

  return {
    intraday, swing, structural,
    organicStress, organicStrength, evolutionVelocity,
    leverageHierarchy, fundingPressureDepth, liquidityTierStress, capitalHierarchyRisk,
    temporalConflict, conflictIntensity,
    temporalCohesion, emergentComplexity,
  };
}
