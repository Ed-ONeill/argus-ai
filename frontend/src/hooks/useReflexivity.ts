"use client";

import { useMemo } from "react";
import { useMarketState } from "./useMarketState";
import { useMarketCausality } from "./useMarketCausality";

// ── Types ──────────────────────────────────────────────────────────────────────

export type EmotionalState =
  | "panic"
  | "euphoria"
  | "complacency"
  | "exhaustion"
  | "defensive"
  | "neutral";

export interface ReflexivityState {
  // Phase 1 — Positioning psychology
  isCrowded:           boolean;  // overcrowding / exhausted momentum
  narrowParticipation: boolean;  // leadership too concentrated
  reflexiveAccel:      boolean;  // accelerating into crowded setup
  unwindVulnerable:    boolean;  // exhaustion + vol spike combo
  fragileLeadership:   boolean;  // dominant chain internally dampened

  // Phase 2 — Anticipatory pressure
  hiddenStress:       boolean;  // low vol masking directional deterioration
  concentrationRisk:  number;   // 0-1, leadership weight concentration
  liquidityStress:    boolean;  // vol elevated + trend weakening
  exhaustionBuilding: boolean;  // sustained trend + decelerating

  // Phase 3 — Uncertainty
  contested:           boolean;  // top 2 chains within 0.14 weight
  partialTransmission: boolean;  // dominant chain has dampened implications
  ambiguousRegime:     boolean;  // riskScore 0.42–0.58, no clear signal

  // Phase 4 — Emotional market realism
  emotionalState:     EmotionalState;
  emotionalIntensity: number;   // 0-1

  // Overall reflexivity score
  reflexivityScore: number;     // 0-1
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useReflexivity(): ReflexivityState {
  const ms = useMarketState();
  const mc = useMarketCausality();

  return useMemo((): ReflexivityState => {
    const momentumAge = Math.min(ms.trend.duration / 6, 1);
    const isDecel     = ms.trend.acceleration === "decelerating";
    const isAccel     = ms.trend.acceleration === "accelerating";

    // ── Phase 1 — Reflexivity ────────────────────────────────────────────────

    const isCrowded = ms.exhaustionRisk || (momentumAge > 0.55 && isDecel);

    // Narrow participation: single dominant chain or very concentrated weight
    const narrowParticipation =
      mc.transmissionDepth <= 1 ||
      (mc.dominant !== null && mc.dominant.weight > 0.74);

    // Reflexive acceleration: trend still accelerating into an already-crowded setup
    const reflexiveAccel = isAccel && isCrowded;

    // Unwind vulnerability: exhaustion signal meeting elevated volatility
    const unwindVulnerable =
      ms.exhaustionRisk &&
      (ms.volRegime === "elevated" || ms.volRegime === "high");

    // Fragile leadership: dominant chain internally dampened by context
    const fragileLeadership =
      mc.dominant !== null &&
      mc.dominant.implications.some(i => i.contextDampened) &&
      mc.dominant.weight > 0.52;

    // ── Phase 2 — Anticipatory pressure ─────────────────────────────────────

    // Hidden stress: surface calm (low vol) masking directional deterioration
    const hiddenStress =
      ms.volRegime === "low" &&
      (ms.riskScore < 0.48 || ms.trend.riskDirection === "weakening");

    // Concentration risk: dominant chain weight, amplified when crowded
    const concentrationRisk = mc.dominant
      ? Math.min(mc.dominant.weight * (isCrowded ? 1.4 : 1.0), 1.0)
      : 0;

    // Liquidity stress: volatility rising into weakening momentum
    const liquidityStress =
      (ms.volRegime === "elevated" || ms.volRegime === "high") &&
      ms.trend.riskDirection === "weakening";

    const exhaustionBuilding = ms.trend.duration > 3 && isDecel;

    // ── Phase 3 — Uncertainty ────────────────────────────────────────────────

    // Contested: two chains closely matched — market has no clear consensus
    const contested =
      mc.active.length >= 2 &&
      Math.abs(mc.active[0].weight - mc.active[1].weight) < 0.14;

    const partialTransmission =
      mc.dominant !== null &&
      mc.dominant.implications.some(i => i.contextDampened);

    // Ambiguous regime: riskScore near neutral — no directional conviction
    const ambiguousRegime = ms.riskScore > 0.42 && ms.riskScore < 0.58;

    // ── Phase 4 — Emotional state (priority-ordered) ─────────────────────────

    let emotionalState: EmotionalState = "neutral";
    let emotionalIntensity = 0;

    if (ms.regimeTransition && ms.riskRegime === "risk-off") {
      // Panic: abrupt reversal into risk-off
      emotionalState     = "panic";
      emotionalIntensity = 0.60 + ms.stressIntensity * 0.40;
    } else if (isAccel && ms.riskRegime === "risk-on" && !isCrowded) {
      // Euphoria: clean acceleration in risk-on environment
      emotionalState     = "euphoria";
      emotionalIntensity = 0.40 + Math.max(ms.riskScore - 0.62, 0) * 1.5;
    } else if (reflexiveAccel) {
      // Reflexive euphoria: late-stage, already-crowded acceleration
      emotionalState     = "euphoria";
      emotionalIntensity = 0.45;
    } else if (ms.volRegime === "low" && ms.riskRegime !== "risk-off" && !ms.trend.momentumDecay) {
      // Complacency: deceptive calm, hidden fragility
      emotionalState     = "complacency";
      emotionalIntensity = Math.max(0, 0.30 + (0.30 - ms.volScore) * 2.0);
    } else if (ms.exhaustionRisk) {
      // Exhaustion: trend collapsing under its own weight
      emotionalState     = "exhaustion";
      emotionalIntensity = Math.min(0.45 + ms.trend.duration * 0.06, 0.92);
    } else if (ms.riskRegime === "risk-off" && ms.trend.riskDirection === "weakening") {
      // Defensive scrambling: risk-off deepening
      emotionalState     = "defensive";
      emotionalIntensity = 0.35 + ms.stressIntensity * 0.55;
    }

    emotionalIntensity = Math.min(emotionalIntensity, 1.0);

    // ── Overall reflexivity score ─────────────────────────────────────────────

    const reflexivityScore = Math.min(
      (isCrowded           ? 0.22 : 0) +
      (narrowParticipation ? 0.14 : 0) +
      (fragileLeadership   ? 0.14 : 0) +
      (hiddenStress        ? 0.14 : 0) +
      (contested           ? 0.10 : 0) +
      (liquidityStress     ? 0.14 : 0) +
      (unwindVulnerable    ? 0.18 : 0),
      1.0,
    );

    return {
      isCrowded, narrowParticipation, reflexiveAccel, unwindVulnerable, fragileLeadership,
      hiddenStress, concentrationRisk, liquidityStress, exhaustionBuilding,
      contested, partialTransmission, ambiguousRegime,
      emotionalState, emotionalIntensity,
      reflexivityScore,
    };
  }, [ms, mc]);
}
