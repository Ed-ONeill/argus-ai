"use client";

import { useMemo } from "react";
import { useMarketState } from "./useMarketState";
import type { MarketState } from "./useMarketState";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CausalImplication {
  label:            string;
  direction:        "up" | "down" | "neutral";
  strength:         "strong" | "moderate" | "weak";
  contextDampened?: boolean;   // true when context reduced this signal's reliability
}

export interface ActiveCausalChain {
  id:           string;
  trigger:      string;
  triggerTag:   string;
  implications: CausalImplication[];
  confidence:   number;        // 0-1, post-context-adjustment
  weight:       number;        // 0-1, normalized share of total pressure
  category:     "dominant" | "secondary" | "emerging" | "fading";
  contextNote?: string;        // why context modifies this interpretation
  reframe?:     string;        // alternative label when context inverts normal reading
}

export interface ConflictSignal {
  id:       string;
  label:    string;            // compact: "Yields ↑ / Risk-On"
  tension:  "high" | "moderate" | "low";
  note:     string;            // one-line interpretation
  dominant: "yields" | "equities" | "vol" | "dollar" | "neutral";
}

export interface MarketCausality {
  active:            ActiveCausalChain[];
  dominant:          ActiveCausalChain | null;
  pressureScore:     number;
  transmissionDepth: number;
  persistenceLabel:  string;
  sectorBias:        "cyclical" | "defensive" | "rotating" | "neutral";
  conflicts:         ConflictSignal[];
  hasConflict:       boolean;
  exhaustionRisk:    boolean;
}

// ── Internal type ─────────────────────────────────────────────────────────────

type RawChain = Omit<ActiveCausalChain, "weight" | "category">;

// ── Context modifier (Phase 1: Probabilistic Causality) ───────────────────────
// Each rule represents a nonlinear override: the same signal means something
// different depending on concurrent conditions. Mutates confidence and
// implication strength without removing the chain entirely.

function applyContext(chain: RawChain, ms: MarketState): RawChain {
  const { riskRegime, volRegime, riskScore, trend } = ms;

  switch (chain.id) {

    // Yields ↑ + strong breadth: growth pressure is absorbed, not transmitted
    case "yields-rising":
      if (riskRegime === "risk-on" && riskScore > 0.68) {
        return {
          ...chain,
          confidence: chain.confidence * 0.68,
          contextNote: "Risk-on breadth absorbing rate pressure",
          implications: chain.implications.map(imp =>
            imp.label === "Growth Pressure"
              ? { ...imp, strength: "weak" as const, contextDampened: true }
              : imp,
          ),
        };
      }
      break;

    // VIX ↑ into a rally = expansion vol, not stress vol, reframe entirely
    case "vol-elevated":
      if (riskRegime === "risk-on") {
        return {
          ...chain,
          confidence: chain.confidence * 0.58,
          contextNote: "Vol elevated into rally, participation breadth",
          reframe:     "Expansion Vol",
          implications: chain.implications.map(imp => {
            if (imp.label === "Risk Assets ↓")
              return { ...imp, direction: "neutral" as const, strength: "weak" as const, contextDampened: true };
            if (imp.label === "Defensive Bid")
              return { ...imp, strength: "weak" as const, contextDampened: true };
            return imp;
          }),
        };
      }
      // VIX ↑ + yields falling = flight-to-safety regime, amplify
      if (ms.ratesRegime === "falling") {
        return {
          ...chain,
          confidence: Math.min(chain.confidence * 1.18, 0.98),
          contextNote: "Flight-to-safety regime, bonds and hedging aligned",
        };
      }
      break;

    // Dollar ↑ alongside risk-on = growth premium, not EM panic
    case "dollar-strong":
      if (riskRegime === "risk-on") {
        return {
          ...chain,
          confidence: chain.confidence * 0.70,
          contextNote: "Dollar bid with growth, not EM stress signal",
          implications: chain.implications.map(imp =>
            imp.label === "EM Pressure"
              ? { ...imp, strength: "weak" as const, contextDampened: true }
              : imp,
          ),
        };
      }
      break;

    // Risk-off with decelerating selling = exhaustion, reduce conviction
    case "risk-off":
      if (trend.momentumDecay) {
        return {
          ...chain,
          confidence: chain.confidence * 0.80,
          contextNote: "Selling pressure decelerating",
        };
      }
      break;

    // Risk-on + low vol = confirmed environment, amplify
    case "risk-on":
      if (volRegime === "low") {
        return {
          ...chain,
          confidence: Math.min(chain.confidence * 1.14, 0.98),
          contextNote: "Low vol confirming risk-on environment",
        };
      }
      if (trend.acceleration === "accelerating") {
        return {
          ...chain,
          confidence: Math.min(chain.confidence * 1.08, 0.96),
          contextNote: "Risk appetite accelerating",
        };
      }
      break;

    // Yields ↓ + vol elevated = textbook flight-to-safety, amplify
    case "yields-falling":
      if (volRegime === "elevated" || volRegime === "high") {
        return {
          ...chain,
          confidence: Math.min(chain.confidence * 1.18, 0.98),
          contextNote: "Flight-to-safety bid, bond and hedging signals aligned",
        };
      }
      break;
  }

  return chain;
}

// ── Conflict detection (Phase 2: Conflicting Pressure Detection) ──────────────
// Markets often contain offsetting forces. These rules identify which cross-asset
// relationships are contradicting each other and which signal dominates.

function detectConflicts(ms: MarketState): ConflictSignal[] {
  const { riskRegime, volRegime, ratesRegime, dollarRegime, riskScore, volScore } = ms;
  const out: ConflictSignal[] = [];

  // Yields rising into equity strength
  if (ratesRegime === "rising" && riskRegime === "risk-on") {
    out.push({
      id:       "yields-vs-risk",
      label:    "Yields ↑ / Risk-On",
      tension:  riskScore > 0.74 ? "moderate" : "low",
      note:     "Rate pressure offset by equity breadth",
      dominant: riskScore > 0.72 ? "equities" : "yields",
    });
  }

  // Vol spiking into a bid market, breadth vs. hedging divergence
  if ((volRegime === "elevated" || volRegime === "high") && riskRegime === "risk-on") {
    out.push({
      id:       "vol-vs-risk",
      label:    "VIX ↑ / Equities Bid",
      tension:  "high",
      note:     "Breadth vs. hedging divergence",
      dominant: volScore > 0.68 ? "vol" : "equities",
    });
  }

  // Dollar bid alongside equities (usually inversely correlated)
  if (dollarRegime === "strong" && riskRegime === "risk-on") {
    out.push({
      id:       "dollar-vs-risk",
      label:    "DXY ↑ / Risk-On",
      tension:  "moderate",
      note:     "Growth premium or safe-haven split",
      dominant: "neutral",
    });
  }

  // Risk-off without USD safe-haven bid (non-standard stress)
  if (riskRegime === "risk-off" && dollarRegime === "weak") {
    out.push({
      id:       "riskoff-dollar-weak",
      label:    "Risk-Off / Dollar Soft",
      tension:  "moderate",
      note:     "Equity selling without USD flight-to-safety",
      dominant: "neutral",
    });
  }

  // Yields falling + vol spiking = shock/recession signal
  if (ratesRegime === "falling" && (volRegime === "elevated" || volRegime === "high")) {
    out.push({
      id:       "rates-fall-vol-spike",
      label:    "Yields ↓ / VIX ↑",
      tension:  "high",
      note:     "Flight-to-safety + fear spike, recession/shock pattern",
      dominant: "vol",
    });
  }

  return out;
}

// ── Weight normalization + categorization (Phase 3: Pressure Weighting) ───────
// Chains are not equal. The dominant driver gets full weight. Others are
// secondary, emerging (rising), or fading (decelerating after sustained move).

function weightAndCategorize(chains: RawChain[], trend: MarketState["trend"]): ActiveCausalChain[] {
  if (!chains.length) return [];

  const total = chains.reduce((s, c) => s + c.confidence, 0) || 1;
  const max   = chains[0].confidence;  // pre-sorted descending

  return chains.map((chain, idx): ActiveCausalChain => {
    const weight = chain.confidence / total;

    let category: ActiveCausalChain["category"];
    if (idx === 0) {
      // Top chain: emerging if accelerating, dominant otherwise
      category = trend.acceleration === "accelerating" ? "emerging" : "dominant";
    } else if (trend.momentumDecay && chain.confidence < max * 0.55) {
      category = "fading";
    } else if (trend.acceleration === "accelerating" && weight > 0.22) {
      category = "emerging";
    } else {
      category = "secondary";
    }

    return { ...chain, weight, category };
  });
}

// ── Main hook ──────────────────────────────────────────────────────────────────

export function useMarketCausality(): MarketCausality {
  const ms = useMarketState();

  return useMemo((): MarketCausality => {
    const {
      riskRegime, volRegime, ratesRegime, dollarRegime,
      ratesPressure, volScore, riskScore, dollarScore, trend,
    } = ms;

    const raw: RawChain[] = [];

    // ── Build base chains ──────────────────────────────────────────────────

    if (ratesRegime === "rising") {
      const i = Math.min((ratesPressure - 0.60) / 0.40, 1);
      raw.push({
        id: "yields-rising", trigger: "Yields Rising", triggerTag: "Yields ↑",
        confidence: 0.55 + i * 0.40,
        implications: [
          { label: "Growth Pressure",   direction: "down", strength: i > 0.55 ? "strong" : "moderate" },
          { label: "Financial Bid",     direction: "up",   strength: "moderate" },
          { label: "Dollar Support",    direction: "up",   strength: "weak"     },
          { label: "Liquidity Tighten", direction: "down", strength: i > 0.45 ? "strong" : "moderate" },
        ],
      });
    }

    if (ratesRegime === "falling") {
      const i = Math.min((0.40 - ratesPressure) / 0.40, 1);
      raw.push({
        id: "yields-falling", trigger: "Yields Falling", triggerTag: "Yields ↓",
        confidence: 0.50 + i * 0.40,
        implications: [
          { label: "Growth Relief",    direction: "up",   strength: "moderate" },
          { label: "Equity Bid",       direction: "up",   strength: i > 0.50 ? "strong" : "moderate" },
          { label: "Defensive Lag",    direction: "down", strength: "weak"     },
          { label: "Credit Spread ↓", direction: "down", strength: "moderate" },
        ],
      });
    }

    if (volRegime === "elevated" || volRegime === "high") {
      const i = volRegime === "high" ? 1.0 : Math.min((volScore - 0.50) / 0.24, 1);
      raw.push({
        id: "vol-elevated", trigger: "Volatility Elevated", triggerTag: "VIX ↑",
        confidence: 0.60 + i * 0.35,
        implications: [
          { label: "Defensive Bid",  direction: "up",   strength: volRegime === "high" ? "strong" : "moderate" },
          { label: "Risk Assets ↓", direction: "down", strength: "strong"   },
          { label: "Hedging Demand", direction: "up",   strength: "moderate" },
          { label: "Spread Watch",   direction: "up",   strength: "moderate" },
        ],
      });
    }

    if (riskRegime === "risk-on") {
      const i = Math.min((riskScore - 0.62) / 0.38, 1);
      raw.push({
        id: "risk-on", trigger: "Risk-On Regime", triggerTag: "Risk-On",
        confidence: 0.55 + i * 0.40,
        implications: [
          { label: "Cyclical Led",   direction: "up",   strength: i > 0.50 ? "strong" : "moderate" },
          { label: "Defensive Lag",  direction: "down", strength: "moderate" },
          { label: "Credit Bid",     direction: "up",   strength: "moderate" },
          { label: "Vol Suppressed", direction: "down", strength: "weak"     },
        ],
      });
    }

    if (riskRegime === "risk-off") {
      const i = Math.min((0.38 - riskScore) / 0.38, 1);
      raw.push({
        id: "risk-off", trigger: "Risk-Off Regime", triggerTag: "Risk-Off",
        confidence: 0.60 + i * 0.35,
        implications: [
          { label: "Defensive Bid",   direction: "up",   strength: i > 0.50 ? "strong" : "moderate" },
          { label: "Cyclical Drag",   direction: "down", strength: "strong"   },
          { label: "Spread Widening", direction: "up",   strength: "moderate" },
          { label: "Safe-Haven Bid",  direction: "up",   strength: "moderate" },
        ],
      });
    }

    if (dollarRegime === "strong") {
      const i = Math.min((dollarScore - 0.62) / 0.38, 1);
      raw.push({
        id: "dollar-strong", trigger: "Dollar Strengthening", triggerTag: "DXY ↑",
        confidence: 0.45 + i * 0.40,
        implications: [
          { label: "EM Pressure",       direction: "down", strength: i > 0.50 ? "strong" : "moderate" },
          { label: "Commodity Drag",    direction: "down", strength: "moderate" },
          { label: "Multinational Lag", direction: "down", strength: "weak"     },
          { label: "USD Funding ↑",    direction: "up",   strength: "weak"     },
        ],
      });
    }

    if (dollarRegime === "weak") {
      const i = Math.min((0.38 - dollarScore) / 0.38, 1);
      raw.push({
        id: "dollar-weak", trigger: "Dollar Weakening", triggerTag: "DXY ↓",
        confidence: 0.45 + i * 0.35,
        implications: [
          { label: "EM Bid",           direction: "up", strength: "moderate" },
          { label: "Commodity Bid",    direction: "up", strength: "moderate" },
          { label: "Gold Support",     direction: "up", strength: "weak"     },
          { label: "Risk-On Tailwind", direction: "up", strength: "weak"     },
        ],
      });
    }

    if (ratesRegime === "rising" && (volRegime === "elevated" || volRegime === "high") && riskRegime !== "risk-on") {
      raw.push({
        id: "stagflation-risk", trigger: "Stagflation Risk", triggerTag: "Stagflat",
        confidence: 0.52,
        implications: [
          { label: "Bonds Stressed",  direction: "down", strength: "strong"   },
          { label: "Equity Pressure", direction: "down", strength: "strong"   },
          { label: "Commodity Bid",   direction: "up",   strength: "moderate" },
          { label: "Real Asset Led",  direction: "up",   strength: "moderate" },
        ],
      });
    }

    // ── Apply context modifiers (probabilistic adjustments) ────────────────
    const modified = raw.map(chain => applyContext(chain, ms));
    modified.sort((a, b) => b.confidence - a.confidence);

    // ── Assign weights and categories ──────────────────────────────────────
    const chains   = weightAndCategorize(modified, trend);
    const dominant = chains[0] ?? null;

    // ── Aggregate pressure score ───────────────────────────────────────────
    const pressureScore = chains.length === 0 ? 0.20
      : Math.min(
          chains.reduce((s, c) => s + c.confidence, 0) / chains.length
            + (chains.length - 1) * 0.06,
          1.0,
        );

    const sectorBias: MarketCausality["sectorBias"] =
      riskRegime === "risk-on"  ? "cyclical" :
      riskRegime === "risk-off" ? "defensive" :
      (volRegime === "elevated" || volRegime === "high") ? "defensive" :
      chains.length > 1 ? "rotating" : "neutral";

    const conflicts = detectConflicts(ms);

    return {
      active:            chains,
      dominant,
      pressureScore,
      transmissionDepth: chains.length,
      persistenceLabel:  trend.persistenceLabel,
      sectorBias,
      conflicts,
      hasConflict:       conflicts.length > 0,
      exhaustionRisk:    ms.exhaustionRisk,
    };
  }, [ms]);
}
