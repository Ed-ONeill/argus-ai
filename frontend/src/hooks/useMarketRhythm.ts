"use client";

import { useRef } from "react";
import { useMarketState } from "./useMarketState";
import { useMarketMemory } from "./useMarketMemory";
import { useAnticipatory } from "./useAnticipatory";
import { useNarrativeEvolution } from "./useNarrativeEvolution";
import { useReflexivity } from "./useReflexivity";

// ── Types ──────────────────────────────────────────────────────────────────────

export type MarketCyclePhase =
  | "expansion"
  | "crowding"
  | "fragility"
  | "instability"
  | "de-risking"
  | "reset"
  | "recovery";

export interface MarketRhythmState {
  // Phase 1 — Current cycle
  cyclePhase:     MarketCyclePhase;
  phaseProgress:  number;  // 0-1 estimated progress within phase
  phaseIntensity: number;  // 0-1 strength of current phase

  // Phase 2 — Rhythm metrics
  rhythmCadence:      number;  // 0-1 (0 = irregular, 1 = regular cycling)
  instabilityCadence: number;  // count of instability episodes this session
  cycleVelocity:      number;  // 0-1 (high = fast-moving conditions)

  // Phase 3 — Recovery / expansion dynamics
  recoveryMomentum: number;  // 0-1
  expansionHealth:  number;  // 0-1 quality of current expansion

  // Phase 4 — Cyclical memory
  cycleCount:           number;   // full cycles completed this session
  recurringInstability: boolean;  // ≥ 2 instability episodes
  exhaustionCycle:      boolean;  // crowding phase driven by exhaustion
}

// ── Session accumulator ────────────────────────────────────────────────────────

interface CycleAccumulator {
  phase:            MarketCyclePhase;
  phaseTicks:       number;    // renders elapsed in current phase
  cycleCount:       number;
  instabilityCount: number;
  recoveryMomentum: number;    // 0-1, builds in reset/recovery
  lastPhaseTs:      number;
  phaseHistory:     MarketCyclePhase[];  // last 8 phases
}

const MIN_PHASE_TICKS = 3;  // minimum renders before phase can transition

const EXPECTED_TICKS: Record<MarketCyclePhase, number> = {
  expansion:    20, crowding: 12, fragility:    8,
  instability:   6, "de-risking": 10, reset:   8, recovery: 15,
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMarketRhythm(): MarketRhythmState {
  const ms = useMarketState();
  const mm = useMarketMemory();
  const an = useAnticipatory();
  const ne = useNarrativeEvolution();
  const rf = useReflexivity();

  const acc = useRef<CycleAccumulator>({
    phase: "expansion", phaseTicks: 0,
    cycleCount: 0, instabilityCount: 0,
    recoveryMomentum: 0, lastPhaseTs: Date.now(),
    phaseHistory: [],
  }).current;

  const momentumAge = Math.min(ms.trend.duration / 6, 1);

  // ── Phase transition engine ───────────────────────────────────────────────
  // Organic transitions: driven by underlying conditions with hysteresis.
  // Minimum tick guard prevents oscillating on rapid data changes.

  acc.phaseTicks++;
  const canTransition = acc.phaseTicks >= MIN_PHASE_TICKS;
  let nextPhase = acc.phase;

  if (canTransition) {
    switch (acc.phase) {
      case "expansion":
        if (rf.isCrowded || rf.concentrationRisk > 0.48 || momentumAge > 0.62) {
          nextPhase = "crowding";
        } else if (ms.stressIntensity > 0.38 || mm.structuralPattern === "shock") {
          nextPhase = "instability";  // shock bypass — no crowding phase
        }
        break;

      case "crowding":
        if (ms.stressIntensity > 0.28 || an.latentInstability > 0.38 || mm.adaptiveFragility > 0.42) {
          nextPhase = "fragility";
        } else if (!rf.isCrowded && rf.concentrationRisk < 0.28 && momentumAge < 0.38) {
          nextPhase = "expansion";  // positioning broadens, trend restores
        }
        break;

      case "fragility":
        if (ms.stressIntensity > 0.40 || ne.contagionActive || mm.structuralPattern === "shock") {
          nextPhase = "instability";
        } else if (ms.stressIntensity < 0.15 && ms.riskRegime !== "risk-off") {
          nextPhase = "crowding";  // fragility relieved without break
        }
        break;

      case "instability":
        if (ms.exhaustionRisk || an.feedbackIntensity > 0.38 || ms.riskRegime === "risk-off") {
          nextPhase = "de-risking";
        }
        break;

      case "de-risking":
        if (ms.stressIntensity > 0.52) {
          nextPhase = "instability";  // cascade escalation
        } else if (ms.stressIntensity < 0.22 && ms.volRegime !== "high") {
          nextPhase = "reset";
        }
        break;

      case "reset":
        if (ms.riskRegime === "risk-on" || mm.stressMemoryScore < 0.28) {
          nextPhase = "recovery";
        }
        break;

      case "recovery":
        if (ms.stressIntensity > 0.36) {
          nextPhase = "instability";  // failed recovery
        } else if (ms.volRegime === "low" && ms.riskScore > 0.52 && ms.stressIntensity < 0.18) {
          nextPhase = "expansion";
          acc.cycleCount++;
        }
        break;
    }
  }

  if (nextPhase !== acc.phase) {
    if (nextPhase === "instability") acc.instabilityCount++;
    if (acc.phase === "recovery" && nextPhase === "instability") acc.recoveryMomentum *= 0.4;
    acc.phaseHistory = [...acc.phaseHistory.slice(-7), acc.phase];
    acc.phase        = nextPhase;
    acc.phaseTicks   = 0;
    acc.lastPhaseTs  = Date.now();
  }

  // Recovery momentum: builds while in reset/recovery, decays otherwise
  if (acc.phase === "reset") {
    acc.recoveryMomentum = Math.min(acc.recoveryMomentum + 0.06, 1.0);
  } else if (acc.phase === "recovery") {
    acc.recoveryMomentum = Math.min(acc.recoveryMomentum + 0.04, 1.0);
  } else {
    acc.recoveryMomentum = Math.max(acc.recoveryMomentum - 0.008, 0);
  }

  // ── Derived metrics ────────────────────────────────────────────────────────

  const phaseIntensity = Math.min((() => {
    switch (acc.phase) {
      case "expansion":    return ms.riskScore * 0.6 + (1 - ms.volScore) * 0.4;
      case "crowding":     return rf.concentrationRisk * 0.6 + momentumAge * 0.4;
      case "fragility":    return an.brittleness * 0.5 + an.latentInstability * 0.5;
      case "instability":  return ms.stressIntensity * 0.5 + an.feedbackIntensity * 0.5;
      case "de-risking":   return mm.leverageStress * 0.5 + ms.stressIntensity * 0.5;
      case "reset":        return 0.28 + (1 - ms.stressIntensity) * 0.44;
      case "recovery":     return acc.recoveryMomentum * 0.6 + ms.riskScore * 0.4;
    }
  })(), 1.0);

  const phaseProgress = Math.min(acc.phaseTicks / EXPECTED_TICKS[acc.phase], 1);

  // Cadence: how regularly cycles are progressing
  const rhythmCadence = acc.cycleCount > 0
    ? Math.min(0.40 + acc.cycleCount * 0.18, 1.0)
    : Math.min(acc.phaseTicks / 15, 0.35);

  // Velocity: fast during stress phases, slow during structural phases
  const cycleVelocity =
    (acc.phase === "instability" || acc.phase === "de-risking")
      ? 0.65 + ms.stressIntensity * 0.35
      : (acc.phase === "expansion"  || acc.phase === "recovery")
      ? 0.10 + ms.atmosphereIntensity * 0.20
      : 0.30 + ms.stressIntensity * 0.30;

  // Expansion health: participation breadth + vol suppression + narrative building
  const expansionHealth = Math.min(
    (ms.volRegime === "low"                                                   ? 0.30 : 0) +
    (ms.riskRegime === "risk-on"                                              ? 0.28 : 0) +
    (1 - rf.concentrationRisk)                                                * 0.24       +
    (ne.dominantPhase === "building" || ne.dominantPhase === "emerging"       ? 0.18 : 0),
    1.0,
  );

  return {
    cyclePhase:     acc.phase,
    phaseProgress,
    phaseIntensity,
    rhythmCadence,
    instabilityCadence: acc.instabilityCount,
    cycleVelocity,
    recoveryMomentum:   acc.recoveryMomentum,
    expansionHealth,
    cycleCount:           acc.cycleCount,
    recurringInstability: acc.instabilityCount >= 2,
    exhaustionCycle:      acc.phase === "crowding" && ms.exhaustionRisk,
  };
}
