"use client";

import { useMemo } from "react";
import { useMarketState } from "./useMarketState";

export interface CausalImplication {
  label:     string;
  direction: "up" | "down" | "neutral";
  strength:  "strong" | "moderate" | "weak";
}

export interface ActiveCausalChain {
  id:           string;
  trigger:      string;
  triggerTag:   string;
  implications: CausalImplication[];
  confidence:   number;  // 0-1
}

export interface MarketCausality {
  active:            ActiveCausalChain[];
  dominant:          ActiveCausalChain | null;
  pressureScore:     number;  // 0-1
  transmissionDepth: number;
  persistenceLabel:  string;
  sectorBias:        "cyclical" | "defensive" | "rotating" | "neutral";
}

const DIRECTION_UP   = "up"   as const;
const DIRECTION_DOWN = "down" as const;

export function useMarketCausality(): MarketCausality {
  const ms = useMarketState();

  return useMemo(() => {
    const {
      riskRegime, volRegime, ratesRegime, dollarRegime,
      ratesPressure, volScore, riskScore, dollarScore, trend,
    } = ms;

    const chains: ActiveCausalChain[] = [];

    // ── Yields Rising ──────────────────────────────────────────────────────
    if (ratesRegime === "rising") {
      const i = Math.min((ratesPressure - 0.60) / 0.40, 1);
      chains.push({
        id:         "yields-rising",
        trigger:    "Yields Rising",
        triggerTag: "Yields ↑",
        confidence: 0.55 + i * 0.40,
        implications: [
          { label: "Growth Pressure",   direction: DIRECTION_DOWN, strength: i > 0.55 ? "strong" : "moderate" },
          { label: "Financial Bid",     direction: DIRECTION_UP,   strength: "moderate" },
          { label: "Dollar Support",    direction: DIRECTION_UP,   strength: "weak" },
          { label: "Liquidity Tighten", direction: DIRECTION_DOWN, strength: i > 0.45 ? "strong" : "moderate" },
        ],
      });
    }

    // ── Yields Falling ─────────────────────────────────────────────────────
    if (ratesRegime === "falling") {
      const i = Math.min((0.40 - ratesPressure) / 0.40, 1);
      chains.push({
        id:         "yields-falling",
        trigger:    "Yields Falling",
        triggerTag: "Yields ↓",
        confidence: 0.50 + i * 0.40,
        implications: [
          { label: "Growth Relief",    direction: DIRECTION_UP,   strength: "moderate" },
          { label: "Equity Bid",       direction: DIRECTION_UP,   strength: i > 0.50 ? "strong" : "moderate" },
          { label: "Defensive Lag",    direction: DIRECTION_DOWN, strength: "weak" },
          { label: "Credit Spread ↓", direction: DIRECTION_DOWN, strength: "moderate" },
        ],
      });
    }

    // ── Volatility Elevated ────────────────────────────────────────────────
    if (volRegime === "elevated" || volRegime === "high") {
      const i = volRegime === "high" ? 1.0 : Math.min((volScore - 0.50) / 0.24, 1);
      chains.push({
        id:         "vol-elevated",
        trigger:    "Volatility Elevated",
        triggerTag: "VIX ↑",
        confidence: 0.60 + i * 0.35,
        implications: [
          { label: "Defensive Bid",  direction: DIRECTION_UP,   strength: volRegime === "high" ? "strong" : "moderate" },
          { label: "Risk Assets ↓", direction: DIRECTION_DOWN, strength: "strong" },
          { label: "Hedging Demand", direction: DIRECTION_UP,   strength: "moderate" },
          { label: "Spread Watch",   direction: DIRECTION_UP,   strength: "moderate" },
        ],
      });
    }

    // ── Risk-On ────────────────────────────────────────────────────────────
    if (riskRegime === "risk-on") {
      const i = Math.min((riskScore - 0.62) / 0.38, 1);
      chains.push({
        id:         "risk-on",
        trigger:    "Risk-On Regime",
        triggerTag: "Risk-On",
        confidence: 0.55 + i * 0.40,
        implications: [
          { label: "Cyclical Led",    direction: DIRECTION_UP,   strength: i > 0.50 ? "strong" : "moderate" },
          { label: "Defensive Lag",   direction: DIRECTION_DOWN, strength: "moderate" },
          { label: "Credit Bid",      direction: DIRECTION_UP,   strength: "moderate" },
          { label: "Vol Suppressed",  direction: DIRECTION_DOWN, strength: "weak" },
        ],
      });
    }

    // ── Risk-Off ───────────────────────────────────────────────────────────
    if (riskRegime === "risk-off") {
      const i = Math.min((0.38 - riskScore) / 0.38, 1);
      chains.push({
        id:         "risk-off",
        trigger:    "Risk-Off Regime",
        triggerTag: "Risk-Off",
        confidence: 0.60 + i * 0.35,
        implications: [
          { label: "Defensive Bid",   direction: DIRECTION_UP,   strength: i > 0.50 ? "strong" : "moderate" },
          { label: "Cyclical Drag",   direction: DIRECTION_DOWN, strength: "strong" },
          { label: "Spread Widening", direction: DIRECTION_UP,   strength: "moderate" },
          { label: "Safe-Haven Bid",  direction: DIRECTION_UP,   strength: "moderate" },
        ],
      });
    }

    // ── Dollar Strong ──────────────────────────────────────────────────────
    if (dollarRegime === "strong") {
      const i = Math.min((dollarScore - 0.62) / 0.38, 1);
      chains.push({
        id:         "dollar-strong",
        trigger:    "Dollar Strengthening",
        triggerTag: "DXY ↑",
        confidence: 0.45 + i * 0.40,
        implications: [
          { label: "EM Pressure",       direction: DIRECTION_DOWN, strength: i > 0.50 ? "strong" : "moderate" },
          { label: "Commodity Drag",    direction: DIRECTION_DOWN, strength: "moderate" },
          { label: "Multinational Lag", direction: DIRECTION_DOWN, strength: "weak" },
          { label: "USD Funding ↑",    direction: DIRECTION_UP,   strength: "weak" },
        ],
      });
    }

    // ── Dollar Weak ────────────────────────────────────────────────────────
    if (dollarRegime === "weak") {
      const i = Math.min((0.38 - dollarScore) / 0.38, 1);
      chains.push({
        id:         "dollar-weak",
        trigger:    "Dollar Weakening",
        triggerTag: "DXY ↓",
        confidence: 0.45 + i * 0.35,
        implications: [
          { label: "EM Bid",           direction: DIRECTION_UP,   strength: "moderate" },
          { label: "Commodity Bid",    direction: DIRECTION_UP,   strength: "moderate" },
          { label: "Gold Support",     direction: DIRECTION_UP,   strength: "weak" },
          { label: "Risk-On Tailwind", direction: DIRECTION_UP,   strength: "weak" },
        ],
      });
    }

    // ── Stagflation Risk: rising rates + elevated vol + not risk-on ────────
    if (
      ratesRegime === "rising" &&
      (volRegime === "elevated" || volRegime === "high") &&
      riskRegime !== "risk-on"
    ) {
      chains.push({
        id:         "stagflation-risk",
        trigger:    "Stagflation Risk",
        triggerTag: "Stagflat",
        confidence: 0.52,
        implications: [
          { label: "Bonds Stressed",  direction: DIRECTION_DOWN, strength: "strong" },
          { label: "Equity Pressure", direction: DIRECTION_DOWN, strength: "strong" },
          { label: "Commodity Bid",   direction: DIRECTION_UP,   strength: "moderate" },
          { label: "Real Asset Led",  direction: DIRECTION_UP,   strength: "moderate" },
        ],
      });
    }

    chains.sort((a, b) => b.confidence - a.confidence);
    const dominant = chains[0] ?? null;

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

    return {
      active:            chains,
      dominant,
      pressureScore,
      transmissionDepth: chains.length,
      persistenceLabel:  trend.persistenceLabel,
      sectorBias,
    };
  }, [ms]);
}
