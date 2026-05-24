"use client";

import { useMemo } from "react";
import { useMarketState } from "./useMarketState";
import { useMarketCausality } from "./useMarketCausality";

// ── Types ──────────────────────────────────────────────────────────────────────

export type NarrativePhase = "emerging" | "building" | "dominant" | "exhausting" | "fading";
export type ContagionStage = "none" | "seeding" | "spreading" | "systemic";
export type SwarmMode      = "herding" | "scattering" | "clustering" | "neutral";

export interface SecondOrderEffect {
  label:     string;
  direction: "up" | "down";
}

export interface NarrativeEvolutionState {
  // Phase 1 — Narrative lifecycle
  dominantPhase:    NarrativePhase;
  narrativeAge:     number;           // 0-1
  thematicCrowding: boolean;

  // Phase 2 — Contagion dynamics
  contagionActive: boolean;
  contagionStage:  ContagionStage;
  contagionDepth:  number;            // 0-1

  // Phase 3 — Swarm behavior
  swarmMode:      SwarmMode;
  swarmIntensity: number;             // 0-1

  // Phase 4 — Second-order reasoning
  secondOrderEffects:  SecondOrderEffect[];
  systemicSensitivity: number;        // 0-1
}

// ── Second-order inference table ──────────────────────────────────────────────
// Each first-order implication label maps to the most likely downstream effect.
// One second-order effect per implication, de-duplicated.

const SECOND_ORDER: Record<string, SecondOrderEffect> = {
  "Growth Pressure":    { label: "Earnings Risk",       direction: "down" },
  "Cyclical Drag":      { label: "Revenue Risk",        direction: "down" },
  "Defensive Bid":      { label: "Quality Premium",     direction: "up"   },
  "Safe-Haven Bid":     { label: "Yield Compression",   direction: "down" },
  "Spread Widening":    { label: "Credit Stress",       direction: "up"   },
  "Risk Assets ↓":     { label: "Beta Unwind",         direction: "down" },
  "EM Pressure":        { label: "Dollar Funding ↑",   direction: "up"   },
  "Liquidity Tighten":  { label: "Credit Crunch Risk",  direction: "up"   },
  "Equity Bid":         { label: "Risk-On Momentum",    direction: "up"   },
  "Hedging Demand":     { label: "Options Skew ↑",     direction: "up"   },
  "Vol Suppressed":     { label: "Carry Buildup",       direction: "up"   },
  "Financial Bid":      { label: "Steepener Risk",      direction: "up"   },
  "Credit Spread ↓":   { label: "Refinancing Relief",  direction: "down" },
  "Commodity Bid":      { label: "Input Cost ↑",       direction: "up"   },
  "Bonds Stressed":     { label: "Duration Unwind",     direction: "down" },
  "Equity Pressure":    { label: "Earnings Guidance ↓", direction: "down" },
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNarrativeEvolution(): NarrativeEvolutionState {
  const ms = useMarketState();
  const mc = useMarketCausality();

  return useMemo((): NarrativeEvolutionState => {
    const momentumAge = Math.min(ms.trend.duration / 8, 1);
    const isAccel     = ms.trend.acceleration === "accelerating";

    // ── Phase 1 — Narrative lifecycle ────────────────────────────────────────

    let dominantPhase: NarrativePhase;
    if      (momentumAge < 0.18)                            dominantPhase = "emerging";
    else if (momentumAge < 0.50 && !ms.exhaustionRisk)      dominantPhase = "building";
    else if (!ms.exhaustionRisk)                            dominantPhase = "dominant";
    else if (ms.exhaustionRisk && !ms.trend.momentumDecay)  dominantPhase = "exhausting";
    else                                                    dominantPhase = "fading";

    // Thematic crowding: many chains active and converging on similar weight
    const thematicCrowding =
      mc.active.filter(c => c.weight > 0.14).length >= 3 ||
      (mc.active.length >= 2 && mc.pressureScore > 0.72);

    // ── Phase 2 — Contagion dynamics ─────────────────────────────────────────

    // Contagion: stress chains propagating through multiple transmission links
    const stressChains = mc.active.filter(c =>
      c.id === "risk-off" || c.id === "vol-elevated" ||
      c.id === "stagflation-risk" || c.id === "yields-rising",
    );
    const contagionActive = stressChains.length > 0 && mc.transmissionDepth >= 2;

    let contagionStage: ContagionStage = "none";
    if (contagionActive) {
      if      (mc.transmissionDepth >= 4 || mc.pressureScore > 0.75) contagionStage = "systemic";
      else if (mc.transmissionDepth >= 3 || stressChains.length >= 2) contagionStage = "spreading";
      else                                                             contagionStage = "seeding";
    }

    const contagionDepth = Math.min(mc.transmissionDepth / 5, 1);

    // ── Phase 3 — Swarm behavior ──────────────────────────────────────────────

    let swarmMode: SwarmMode = "neutral";
    let swarmIntensity = 0;

    if (ms.regimeTransition && ms.riskRegime === "risk-off") {
      swarmMode      = "scattering";
      swarmIntensity = 0.60 + ms.stressIntensity * 0.40;
    } else if (isAccel && ms.riskRegime === "risk-on") {
      swarmMode      = "herding";
      swarmIntensity = 0.45 + Math.max(ms.riskScore - 0.62, 0) * 1.2;
    } else if (ms.exhaustionRisk && mc.dominant !== null && mc.dominant.weight > 0.65) {
      swarmMode      = "clustering";
      swarmIntensity = 0.35 + momentumAge * 0.40;
    }
    swarmIntensity = Math.min(swarmIntensity, 1.0);

    // ── Phase 4 — Second-order effects ────────────────────────────────────────

    const secondOrderEffects: SecondOrderEffect[] = [];
    if (mc.dominant) {
      const seen = new Set<string>();
      for (const imp of mc.dominant.implications) {
        if (imp.contextDampened || imp.strength === "weak") continue;
        const effect = SECOND_ORDER[imp.label];
        if (effect && !seen.has(effect.label) && secondOrderEffects.length < 3) {
          seen.add(effect.label);
          secondOrderEffects.push(effect);
        }
      }
    }

    // Systemic sensitivity: overlapping pressures amplified by contagion depth
    const systemicSensitivity = Math.min(
      mc.pressureScore * 0.58 +
      contagionDepth   * 0.28 +
      (thematicCrowding ? 0.14 : 0),
      1.0,
    );

    return {
      dominantPhase, narrativeAge: momentumAge, thematicCrowding,
      contagionActive, contagionStage, contagionDepth,
      swarmMode, swarmIntensity,
      secondOrderEffects, systemicSensitivity,
    };
  }, [ms, mc]);
}
