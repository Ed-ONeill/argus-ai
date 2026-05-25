"use client";

import { useMarketState } from "./useMarketState";
import { useMarketMemory } from "./useMarketMemory";
import { useReflexivity } from "./useReflexivity";
import { useMarketRhythm } from "./useMarketRhythm";

// ── Types ──────────────────────────────────────────────────────────────────────

export type DominantParticipant =
  | "retail"
  | "systematic"
  | "macro"
  | "vol-targeting"
  | "passive"
  | "dealer"
  | "none";

export interface ParticipantDynamicsState {
  // Phase 2 — Individual participant classes (all 0-1)
  retailMomentum:       number;  // retail crowd exposure / late-trend chasing
  systematicExposure:   number;  // CTA trend-following allocation
  macroPositioning:     number;  // macro risk-on exposure
  volTargetingPressure: number;  // vol-target deleverage pressure
  passiveFlowMomentum:  number;  // ETF / index inflow strength
  dealerGammaStress:    number;  // short-gamma destabilisation risk

  // Phase 3 — Emergent cross-participant interactions
  participantCrowding:   number;  // composite positioning density
  reinforcementStrength: number;  // classes moving in same direction
  destabilizationRisk:   number;  // forced-unwind cascade potential
  dominantParticipant:   DominantParticipant;

  // Phase 4 — Structural market implications
  systematicAmplification: number;  // trend-following amplifying moves
  volCascadePotential:      number;  // vol-unwind cascade risk
  liquidityWithdrawalRisk:  number;  // dealer + systematic withdrawal risk
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useParticipantDynamics(): ParticipantDynamicsState {
  const ms = useMarketState();
  const mm = useMarketMemory();
  const rf = useReflexivity();
  const mr = useMarketRhythm();

  const momentumAge = Math.min(ms.trend.duration / 6, 1);

  // ── Retail momentum ───────────────────────────────────────────────────────
  // Retail chases trend; becomes crowded at extremes; peak retail = contrarian signal.

  const retailMomentum = Math.min(
    momentumAge                                                  * 0.38 +
    rf.concentrationRisk                                         * 0.32 +
    (ms.riskRegime === "risk-on" ? ms.riskScore * 0.20 : 0)           +
    (mr.cyclePhase  === "crowding"               ? 0.10 : 0),
    1.0,
  );

  // ── Systematic (CTA) exposure ─────────────────────────────────────────────
  // Trend-following funds: build slowly on trend + low vol; unwind fast on vol spike.

  const systematicExposure = Math.min(
    momentumAge                                                        * 0.42 +
    (ms.volRegime === "low" || ms.volRegime === "moderate" ? 0.30 : 0)      +
    (ms.riskRegime === "risk-on"                         ? 0.18 : 0)       +
    (mr.cyclePhase === "expansion"                       ? 0.10 : 0),
    1.0,
  );

  // Forced unwind signal: systematic deleverages mechanically on vol breakout
  const systematicUnwindPressure =
    ms.volRegime === "high"     ? systematicExposure * 0.75 :
    ms.volRegime === "elevated" ? systematicExposure * 0.40 : 0;

  // ── Macro positioning ─────────────────────────────────────────────────────
  // Macro funds: sensitive to rates + dollar regimes; slowest to turn.

  const macroPositioning = Math.min(
    (ms.ratesRegime  === "falling" ? 0.32 : ms.ratesRegime  === "rising" ? 0.04 : 0.16) +
    (ms.dollarRegime === "weak"    ? 0.28 : ms.dollarRegime === "strong"  ? 0.04 : 0.14) +
    (ms.riskRegime   === "risk-on" ? 0.24 : 0.02)                                        +
    mr.expansionHealth             * 0.16,
    1.0,
  );

  // ── Volatility targeting pressure ─────────────────────────────────────────
  // Risk-parity / vol-target funds deleverage mechanically when realised vol rises above target.

  const volTargetingPressure = Math.min(
    ms.volScore                              * 0.50 +
    (ms.volRegime === "elevated" ? 0.24 : 0)        +
    (ms.volRegime === "high"     ? 0.36 : 0)        +
    mm.adaptiveFragility                     * 0.14,
    1.0,
  );

  // ── Passive flow momentum ─────────────────────────────────────────────────
  // ETF / index flows follow recent returns; slow to reverse; net stabilising in expansion.

  const passiveFlowMomentum = Math.min(
    (ms.riskRegime === "risk-on"                           ? 0.38 : 0.04) +
    (ms.trend.riskDirection === "strengthening"            ? 0.28 : 0)    +
    (mr.cyclePhase          === "expansion"                ? 0.22 : 0)    +
    (mm.stressMemoryScore   < 0.25                         ? 0.12 : 0),
    1.0,
  );

  // ── Dealer gamma stress ───────────────────────────────────────────────────
  // Dealers short gamma (sold options) during low-vol regimes.
  // Short gamma forces them to sell into weakness / buy into strength — reflexive amplifier.

  const dealerGammaStress = Math.min(
    (ms.volRegime === "low"    ? 0.55 : 0) +  // peak short-gamma accumulation
    (ms.volRegime === "moderate" ? 0.28 : 0) +
    ms.stressIntensity         * 0.28      +  // hedging increases as stress rises
    mm.liquidityDeterioration  * 0.17,
    1.0,
  );

  // ── Emergent cross-participant interactions ────────────────────────────────
  // Crowding: all classes positioned in same direction simultaneously

  const participantCrowding = Math.min(
    retailMomentum      * 0.25 +
    systematicExposure  * 0.30 +
    passiveFlowMomentum * 0.20 +
    macroPositioning    * 0.15 +
    (1 - dealerGammaStress) * 0.10,  // hedged dealers = structural support
    1.0,
  );

  // Reinforcement: participants moving in same direction amplify the move
  const allLong = retailMomentum > 0.50 && systematicExposure > 0.50 && passiveFlowMomentum > 0.40;
  const reinforcementStrength = Math.min(
    participantCrowding            * 0.50 +
    (allLong                       ? 0.30 : 0) +
    rf.concentrationRisk           * 0.20,
    1.0,
  );

  // Destabilization: simultaneous forced unwinds from multiple classes
  const destabilizationRisk = Math.min(
    volTargetingPressure     * 0.38 +
    systematicUnwindPressure * 0.32 +
    dealerGammaStress        * 0.20 +
    mm.leverageStress        * 0.10,
    1.0,
  );

  // ── Dominant participant class ─────────────────────────────────────────────

  const scores: [DominantParticipant, number][] = [
    ["retail",        retailMomentum],
    ["systematic",    systematicExposure],
    ["macro",         macroPositioning],
    ["vol-targeting", volTargetingPressure],
    ["passive",       passiveFlowMomentum],
    ["dealer",        dealerGammaStress],
  ];
  const [dominantParticipant] = scores.reduce(
    ([bestP, bestS], [p, s]) => s > bestS ? [p, s] : [bestP, bestS],
    ["none" as DominantParticipant, 0.18],  // threshold: must exceed 0.18 to be "dominant"
  );

  // ── Structural market implications ─────────────────────────────────────────

  const systematicAmplification = Math.min(
    systematicExposure      * 0.55 +
    reinforcementStrength   * 0.45,
    1.0,
  );

  const volCascadePotential = Math.min(
    volTargetingPressure     * 0.45 +
    systematicUnwindPressure * 0.35 +
    (mr.cyclePhase === "fragility" || mr.cyclePhase === "instability" ? 0.20 : 0),
    1.0,
  );

  const liquidityWithdrawalRisk = Math.min(
    dealerGammaStress         * 0.40 +
    systematicUnwindPressure  * 0.32 +
    mm.liquidityDeterioration * 0.28,
    1.0,
  );

  return {
    retailMomentum, systematicExposure, macroPositioning,
    volTargetingPressure, passiveFlowMomentum, dealerGammaStress,
    participantCrowding, reinforcementStrength, destabilizationRisk, dominantParticipant,
    systematicAmplification, volCascadePotential, liquidityWithdrawalRisk,
  };
}
