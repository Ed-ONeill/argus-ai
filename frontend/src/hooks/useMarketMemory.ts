"use client";

import { useRef } from "react";
import { useMarketState } from "./useMarketState";

// ── Types ──────────────────────────────────────────────────────────────────────

export type StructuralPattern =
  | "stagflation"
  | "shock"
  | "complacency_trap"
  | "yield_stress"
  | "liquidity_crunch"
  | "none";

export interface MarketMemoryState {
  // Phase 1 — Structural resemblance
  structuralPattern:   StructuralPattern;
  resemblanceStrength: number;   // 0-1
  structureLabel:      string;

  // Phase 2/3 — Memory accumulation
  stressMemoryScore:      number;  // 0-1, accumulated session stress
  volatilityEpisodes:     number;  // count of vol spikes this session
  liquidityDeterioration: number;  // 0-1, accumulated liquidity stress
  adaptiveFragility:      number;  // 0-1, sensitivity after repeated episodes
  learnedInstability:     number;  // 0-1, positioning sensitivity score
  memoryLabel:            "First Episode" | "Recurring" | "Conditioned";

  // Phase 4 — Structural depth
  fundingPressure:   number;  // 0-1
  leverageStress:    number;  // 0-1
  balanceSheetRisk:  number;  // 0-1
}

// ── Structural pattern labels ─────────────────────────────────────────────────

const PATTERN_LABEL: Record<StructuralPattern, string> = {
  stagflation:      "Stagflation Structure",
  shock:            "Shock Pattern",
  complacency_trap: "Complacency Trap",
  yield_stress:     "Yield Stress",
  liquidity_crunch: "Liquidity Crunch",
  none:             "",
};

// ── Accumulator (per hook instance, persists for component lifetime) ──────────

interface Accumulator {
  stressEpisodes:    number;
  volEpisodes:       number;
  liqEpisodes:       number;
  fragility:         number;   // 0-1, decays with time
  wasStress:         boolean;
  wasHighVol:        boolean;
  wasLiqStress:      boolean;
  lastDecayTs:       number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMarketMemory(): MarketMemoryState {
  const ms  = useMarketState();
  const acc = useRef<Accumulator>({
    stressEpisodes: 0, volEpisodes: 0, liqEpisodes: 0,
    fragility: 0, wasStress: false, wasHighVol: false, wasLiqStress: false,
    lastDecayTs: Date.now(),
  }).current;

  // ── Condition detection ────────────────────────────────────────────────────

  const isStress    = ms.riskRegime === "risk-off" || ms.stressIntensity > 0.25;
  const isHighVol   = ms.volRegime === "elevated"  || ms.volRegime === "high";
  const isLiqStress = isHighVol && ms.trend.riskDirection === "weakening";

  // ── Fragility decay (time-based, ~1.5% per 10 s) ──────────────────────────

  const now = Date.now();
  if (now - acc.lastDecayTs > 8_000) {
    acc.fragility    = Math.max(0, acc.fragility - 0.015);
    acc.lastDecayTs  = now;
  }

  // ── Rising-edge episode counting ──────────────────────────────────────────

  if (isStress    && !acc.wasStress)    { acc.stressEpisodes++; acc.fragility = Math.min(acc.fragility + 0.18, 1); }
  if (isHighVol   && !acc.wasHighVol)   { acc.volEpisodes++;    acc.fragility = Math.min(acc.fragility + 0.10, 1); }
  if (isLiqStress && !acc.wasLiqStress) { acc.liqEpisodes++;    acc.fragility = Math.min(acc.fragility + 0.08, 1); }

  acc.wasStress    = isStress;
  acc.wasHighVol   = isHighVol;
  acc.wasLiqStress = isLiqStress;

  // ── Structural pattern recognition ────────────────────────────────────────

  const { riskRegime, volRegime, ratesRegime, dollarRegime, riskScore, volScore } = ms;

  let structuralPattern: StructuralPattern = "none";
  let resemblanceStrength = 0;

  if (ratesRegime === "rising" && riskRegime === "risk-off") {
    structuralPattern   = "stagflation";
    resemblanceStrength = Math.min(ms.stressIntensity * 1.4 + 0.30, 0.92);
  } else if (ms.regimeTransition && volRegime !== "low") {
    structuralPattern   = "shock";
    resemblanceStrength = Math.min(0.65 + ms.stressIntensity * 0.32, 0.94);
  } else if (volRegime === "low" && riskScore > 0.54 && ms.trend.duration > 3) {
    structuralPattern   = "complacency_trap";
    resemblanceStrength = 0.40 + Math.min(ms.trend.duration / 8, 1) * 0.34;
  } else if (ratesRegime === "rising" && riskScore < 0.52) {
    structuralPattern   = "yield_stress";
    resemblanceStrength = 0.44 + ms.ratesPressure * 0.38;
  } else if (volRegime === "elevated" && riskRegime === "risk-off" && dollarRegime !== "strong") {
    structuralPattern   = "liquidity_crunch";
    resemblanceStrength = 0.48 + volScore * 0.32;
  }

  // ── Derived memory scores ─────────────────────────────────────────────────

  const stressMemoryScore    = Math.min(acc.stressEpisodes * 0.20 + acc.fragility * 0.60, 1.0);
  const liquidityDeterioration = Math.min(acc.liqEpisodes * 0.22 + (isLiqStress ? 0.18 : 0), 1.0);
  const adaptiveFragility    = acc.fragility;
  const learnedInstability   = Math.min(
    adaptiveFragility * 0.55 +
    (acc.stressEpisodes > 2 ? 0.20 : 0) +
    (acc.volEpisodes   > 2 ? 0.15 : 0),
    1.0,
  );

  // ── Structural depth (Phase 4) ────────────────────────────────────────────

  // Funding pressure: dollar bid + rising rates + residual stress
  const fundingPressure = Math.min(
    (dollarRegime === "strong" ? 0.22 : 0) +
    (ratesRegime  === "rising"  ? 0.28 : 0) +
    ms.stressIntensity * 0.50,
    1.0,
  );

  // Leverage stress: exhaustion signal + vol spike + accumulated fragility
  const leverageStress = Math.min(
    (ms.exhaustionRisk ? 0.28 : 0) +
    (isHighVol         ? 0.28 : 0) +
    adaptiveFragility  * 0.44,
    1.0,
  );

  // Balance sheet risk: weighted composite of funding + leverage + liquidity
  const balanceSheetRisk = Math.min(
    fundingPressure      * 0.42 +
    leverageStress       * 0.38 +
    liquidityDeterioration * 0.20,
    1.0,
  );

  const memoryLabel: MarketMemoryState["memoryLabel"] =
    acc.stressEpisodes === 0 ? "First Episode" :
    acc.stressEpisodes <= 2  ? "Recurring"     :
    "Conditioned";

  return {
    structuralPattern, resemblanceStrength,
    structureLabel: PATTERN_LABEL[structuralPattern],
    stressMemoryScore, volatilityEpisodes: acc.volEpisodes, liquidityDeterioration,
    adaptiveFragility, learnedInstability, memoryLabel,
    fundingPressure, leverageStress, balanceSheetRisk,
  };
}
