"use client";

import { useRef } from "react";
import { useMarketState } from "./useMarketState";
import { useMarketMemory } from "./useMarketMemory";
import { useNarrativeEvolution } from "./useNarrativeEvolution";
import { useReflexivity } from "./useReflexivity";

// ── Types ──────────────────────────────────────────────────────────────────────

export type FeedbackMode  =
  | "stress_spiral"
  | "derisking_cascade"
  | "liquidity_spiral"
  | "vol_amplification"
  | "none";

export type ExogenousType =
  | "policy"
  | "intervention"
  | "geopolitical"
  | "injection"
  | "none";

export interface AnticipatoryState {
  // Phase 1 — Anticipatory memory
  latentInstability:    number;  // 0-1 suppressed tension buildup
  instabilityBuildRate: number;  // 0-1 accumulation speed

  // Phase 2 — Feedback loops
  feedbackIntensity: number;     // 0-1 self-reinforcing stress
  feedbackMode:      FeedbackMode;

  // Phase 3 — Structural vulnerability
  structuralVulnerability: number;  // 0-1
  brittleness:             number;  // 0-1 compressed fragility
  exhaustionProbability:   number;  // 0-1

  // Phase 4 — External force
  exogenousPressure: number;     // 0-1
  exogenousType:     ExogenousType;

  // Phase 5 — Emergent synthesis
  systemicRisk: number;          // 0-1 composite
}

// ── Session accumulator ────────────────────────────────────────────────────────

interface Accumulator {
  volSuppressionTicks:   number;   // consecutive low-vol renders
  leadershipNarrowTicks: number;   // consecutive narrow-participation renders
  feedbackMomentum:      number;   // 0-1, self-reinforcing, slow decay
  contagionDepthPeak:    number;   // session max contagion depth
  lastDecayTs:           number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAnticipatory(): AnticipatoryState {
  const ms = useMarketState();
  const mm = useMarketMemory();
  const ne = useNarrativeEvolution();
  const rf = useReflexivity();

  const acc = useRef<Accumulator>({
    volSuppressionTicks: 0, leadershipNarrowTicks: 0,
    feedbackMomentum: 0, contagionDepthPeak: 0,
    lastDecayTs: Date.now(),
  }).current;

  const momentumAge = Math.min(ms.trend.duration / 6, 1);

  // ── Tick accumulators ─────────────────────────────────────────────────────

  const isLowVol = ms.volRegime === "low";
  const isNarrow = rf.narrowParticipation;

  // Vol suppression: accumulate slowly, drain fast on breakout
  if (isLowVol) acc.volSuppressionTicks   = Math.min(acc.volSuppressionTicks   + 1, 30);
  else          acc.volSuppressionTicks   = Math.max(acc.volSuppressionTicks   - 3, 0);

  // Narrow leadership: accumulate, drain moderately on broadening
  if (isNarrow) acc.leadershipNarrowTicks = Math.min(acc.leadershipNarrowTicks + 1, 30);
  else          acc.leadershipNarrowTicks = Math.max(acc.leadershipNarrowTicks - 2, 0);

  // Track session peak contagion depth for amplification
  if (ne.contagionDepth > acc.contagionDepthPeak) acc.contagionDepthPeak = ne.contagionDepth;

  // ── Phase 1 — Latent instability ──────────────────────────────────────────
  // Suppressed volatility + narrow participation + recurring liquidity stress
  // all contribute to hidden tension that precedes visible breaks.

  const latentInstability = Math.min(
    acc.volSuppressionTicks   * 0.032 +
    acc.leadershipNarrowTicks * 0.024 +
    mm.liquidityDeterioration * 0.28 +
    (ne.contagionDepth > 0 ? mm.stressMemoryScore * 0.22 : 0),
    1.0,
  );

  const instabilityBuildRate = Math.min(
    (isLowVol ? 0.18 : 0) +
    (isNarrow ? 0.14 : 0) +
    mm.learnedInstability * 0.42 +
    mm.liquidityDeterioration * 0.26,
    1.0,
  );

  // ── Phase 2 — Feedback loop engine ────────────────────────────────────────
  // Markets destabilize recursively. Contagion is squared (nonlinear amplification).
  // Feedback momentum builds when stress persists and decays slowly over time.

  const contagionRecursion = ne.contagionDepth * ne.contagionDepth;
  const feedbackRaw = Math.min(
    (ms.stressIntensity > 0.24 ? ms.stressIntensity * 0.36 : 0) +
    contagionRecursion          * 0.32 +
    mm.adaptiveFragility * latentInstability * 0.32,
    1.0,
  );

  const now = Date.now();
  if (now - acc.lastDecayTs > 10_000) {
    acc.feedbackMomentum = Math.max(acc.feedbackMomentum - 0.014, 0);
    acc.lastDecayTs      = now;
  }
  if (feedbackRaw > 0.28) {
    acc.feedbackMomentum = Math.min(acc.feedbackMomentum + feedbackRaw * 0.09, 1.0);
  }

  const feedbackIntensity = Math.min(acc.feedbackMomentum * 0.52 + feedbackRaw * 0.48, 1.0);

  let feedbackMode: FeedbackMode = "none";
  if (feedbackIntensity > 0.18) {
    if (ms.stressIntensity > 0.32 && mm.adaptiveFragility > 0.38 && ms.riskRegime === "risk-off") {
      feedbackMode = "stress_spiral";
    } else if (ms.exhaustionRisk && feedbackIntensity > 0.28 && ms.volRegime !== "low") {
      feedbackMode = "derisking_cascade";
    } else if (mm.liquidityDeterioration > 0.32 && ne.contagionActive) {
      feedbackMode = "liquidity_spiral";
    } else if (ms.volRegime !== "low" && ms.stressIntensity > 0.18) {
      feedbackMode = "vol_amplification";
    }
  }

  // ── Phase 3 — Structural vulnerability ────────────────────────────────────

  const brittleness = Math.min(
    mm.adaptiveFragility * 0.34 +
    latentInstability    * 0.42 +
    mm.leverageStress    * 0.24,
    1.0,
  );

  const structuralVulnerability = Math.min(
    brittleness       * 0.62 +
    feedbackIntensity * 0.38,
    1.0,
  );

  const exhaustionProbability = Math.min(
    (ms.exhaustionRisk ? 0.34 : 0) +
    mm.learnedInstability * 0.28 +
    (ne.dominantPhase === "exhausting" || ne.dominantPhase === "fading" ? 0.24 : 0) +
    momentumAge * 0.14,
    1.0,
  );

  // ── Phase 4 — External force intrusion ────────────────────────────────────
  // Policy shocks, macro interventions, geopolitical stress, liquidity injections.

  const isPolicyShock       = ms.regimeTransition && ms.ratesRegime !== "stable";
  const isMacroIntervention = ms.dollarRegime !== "neutral" && ms.ratesRegime !== "stable"
                              && ms.stressIntensity > 0.26;
  const isGeopolitical      = ms.stressIntensity > 0.40 && ms.volRegime === "high"
                              && ne.contagionStage === "systemic";
  const isInjection         = ms.volRegime === "low" && ms.riskRegime === "risk-on"
                              && ms.dollarRegime === "weak";

  let exogenousType: ExogenousType = "none";
  if      (isGeopolitical)      exogenousType = "geopolitical";
  else if (isPolicyShock)       exogenousType = "policy";
  else if (isMacroIntervention) exogenousType = "intervention";
  else if (isInjection)         exogenousType = "injection";

  const exogenousPressure = Math.min(
    (isPolicyShock       ? 0.52 : 0) +
    (isMacroIntervention ? 0.36 : 0) +
    (isGeopolitical      ? 0.60 : 0) +
    (isInjection         ? 0.26 : 0),
    1.0,
  );

  // ── Phase 5 — Emergent systemic risk ──────────────────────────────────────

  const systemicRisk = Math.min(
    structuralVulnerability * 0.35 +
    feedbackIntensity       * 0.28 +
    mm.balanceSheetRisk     * 0.22 +
    ne.systemicSensitivity  * 0.15,
    1.0,
  );

  return {
    latentInstability, instabilityBuildRate,
    feedbackIntensity, feedbackMode,
    structuralVulnerability, brittleness, exhaustionProbability,
    exogenousPressure, exogenousType,
    systemicRisk,
  };
}
