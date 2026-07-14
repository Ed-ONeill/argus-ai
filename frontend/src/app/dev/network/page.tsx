"use client";

/**
 * /dev/network — Intelligence Network visual QA harness (M4.1A Task 16).
 *
 * Dev-only (404 in production). Renders the real IntelligenceNetwork over
 * deterministic fixture intelligence so every visual mode can be inspected
 * and screenshotted without live backend data:
 *   ?s=default | dense | sparse | single
 * Narrow-viewport and reduced-motion modes are exercised via the browser.
 */

import { useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { notFound } from "next/navigation";
import IntelligenceNetwork from "@/components/network/IntelligenceNetwork";
import { buildNetworkModel } from "@/lib/network/model";
import type { ThemeIntelligence } from "@/lib/types";

function fixture(over: Partial<ThemeIntelligence>): ThemeIntelligence {
  return {
    id: "t", name: "Theme", description: "", signal_strength: "strong",
    confidence: 60, momentum_direction: "bullish", momentum_label: "strengthening",
    momentum_delta: 0, related_industries: [], related_assets: [],
    related_macro_factors: [], causal_narrative: "", relationship_weights: {},
    second_order_effects: [], contributing_cluster_ids: [],
    ...over,
  } as unknown as ThemeIntelligence;
}

const THEMES: ThemeIntelligence[] = [
  fixture({
    id: "ai-energy", name: "Grid Bottleneck Trade", confidence: 78, momentum_delta: 6,
    momentum_direction: "bullish", momentum_label: "accelerating",
    related_industries: ["Utilities", "Semiconductors"],
    related_assets: ["NVDA", "CEG", "VST"],
    related_macro_factors: ["AI Capex Supercycle"],
    causal_narrative: "AI Capex Supercycle → data-centre power deficits → merchant generators reprice",
    relationship_weights: { Utilities: { weight: 0.85, type: "indirect", direction: "positive" } },
  }),
  fixture({
    id: "rates", name: "Higher-for-Longer", confidence: 64, momentum_delta: -3,
    momentum_direction: "bearish", momentum_label: "cooling",
    related_industries: ["Financials", "Real Estate"],
    related_assets: ["TLT", "JPM", "BAC"],
    related_macro_factors: ["Terminal Rate"],
    causal_narrative: "Terminal Rate → duration repricing → rate-sensitive equity pressure",
    relationship_weights: { Financials: { weight: 0.7, type: "direct", direction: "negative" } },
  }),
  fixture({
    id: "semis", name: "Semiconductor Capex Cycle", confidence: 58, momentum_delta: 2,
    momentum_direction: "bullish", momentum_label: "strengthening",
    related_industries: ["Semiconductors"],
    related_assets: ["ASML", "AMAT", "KLAC"],
    related_macro_factors: ["AI Capex Supercycle"],
    relationship_weights: { Semiconductors: { weight: 0.9, type: "direct", direction: "positive" } },
  }),
  fixture({
    id: "private-credit", name: "Private Credit Expansion", confidence: 52, momentum_delta: 1,
    momentum_direction: "neutral", momentum_label: "stable",
    related_industries: ["Financials"],
    related_assets: ["ARES", "BX"],
    related_macro_factors: ["Liquidity Conditions"],
    relationship_weights: { Financials: { weight: 0.6, type: "direct", direction: "positive" } },
  }),
  fixture({
    id: "energy-sec", name: "Energy Security Premium", confidence: 47, momentum_delta: -1,
    momentum_direction: "bullish", momentum_label: "stable",
    related_industries: ["Energy"],
    related_assets: ["XOM", "SLB"],
    related_macro_factors: ["Geopolitical Risk"],
    relationship_weights: { Energy: { weight: 0.75, type: "direct", direction: "positive" } },
  }),
  fixture({
    id: "defense", name: "Defense Rearmament", confidence: 44, momentum_delta: 4,
    momentum_direction: "bullish", momentum_label: "strengthening",
    related_industries: ["Industrials"],
    related_assets: ["RTX", "LMT", "GD"],
    related_macro_factors: ["Geopolitical Risk"],
    relationship_weights: { Industrials: { weight: 0.8, type: "direct", direction: "positive" } },
  }),
];

function Harness() {
  const params = useSearchParams();
  const scenario = params.get("s") ?? "default";
  const themes = useMemo(() => {
    switch (scenario) {
      case "dense": return THEMES;
      case "sparse": return THEMES.slice(0, 2);
      case "single": return THEMES.slice(0, 1);
      default: return THEMES.slice(0, 5);
    }
  }, [scenario]);
  const model = useMemo(() => buildNetworkModel(themes, { riskRegime: "risk-on", regimeLabel: "Risk-On" }), [themes]);

  return (
    <div className="min-h-screen p-6" style={{ background: "#070b13" }}>
      <p className="text-[10px] mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
        DEV VISUAL QA · scenario={scenario} · ?s=default|dense|sparse|single
      </p>
      <div className="max-w-5xl mx-auto">
        <IntelligenceNetwork model={model} height={460} />
      </div>
    </div>
  );
}

export default function NetworkQAPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Suspense fallback={null}><Harness /></Suspense>;
}
