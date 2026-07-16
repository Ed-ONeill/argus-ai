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

import { useMemo, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { notFound } from "next/navigation";
import IntelligenceNetwork from "@/components/network/IntelligenceNetwork";
import NetworkInspector from "@/components/network/NetworkInspector";
import { buildNetworkModel } from "@/lib/network/model";
import type { DossierVM } from "@/lib/network/inspector";
import type { DerivedNarrative } from "@/lib/narrativeDerivation";
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

// deterministic dominant-narrative fixture (shape-only cast; data contract)
const sec = <T,>(data: T) => ({ status: "live", data });
const NARRATIVE = {
  version: 1, key: "ai-capex+power-load", label: "AI Capex + Power Demand",
  derived: true, generatedAt: 0,
  driverSet: sec([
    { id: "d1", label: "AI Capex Supercycle", nodeType: "MacroFactor" },
    { id: "d2", label: "Power Load Growth", nodeType: "MacroFactor" },
  ]),
  members: sec([
    { id: "m1", label: "Grid Bottleneck Trade", nodeType: "Theme", driverLinks: [] },
    { id: "m2", label: "Semiconductor Capex Cycle", nodeType: "Theme", driverLinks: [] },
  ]),
  exposure: sec(null), evidence: sec(null), forward: sec(null),
  coherence: sec({ score: 71, sharedDriverStrength: 64, assetOverlap: 38,
                   sectorOverlap: 52, explanation: "shared drivers + sector overlap" }),
} as unknown as DerivedNarrative;

const INSPECTOR_VM: DossierVM = {
  scope: "dominant",
  identity: {
    eyebrow: "DOMINANT NARRATIVE",
    title: "AI Capex + Power Demand",
    figure: { label: "COHERENCE", value: 71 },
    delta: null,
    stateLine: "2 themes · Risk-On",
    archiveLine: "Tracked 41 sessions · first observed Jun 30",
  },
  lead: "AI infrastructure spending is repricing the power complex: data-centre "
      + "capex is transmitting through utilities and semis while duration pressure "
      + "caps the multiple expansion.",
  reasoning: [
    { kind: "structure", text: "Broadest recorded driver set this cycle: 2 themes share AI Capex Supercycle and Power Load Growth." },
    { kind: "memory", text: "Grid Bottleneck Trade — conviction 78, accelerating." },
    { kind: "memory", text: "Semiconductor Capex Cycle — conviction 58, strengthening." },
    { kind: "evidence", text: "story: Data-centre power contracts signed at premium rates." },
    { kind: "evidence", text: "story: Hyperscaler capex guidance raised across the complex." },
  ],
  chain: [
    { id: "drv:ai-capex-supercycle", label: "AI Capex Supercycle", cls: "driver", relationship: null },
    { id: "nar:ai-capex-power-load", label: "AI Capex + Power Demand", cls: "narrative", relationship: "drives" },
    { id: "th:grid-bottleneck", label: "Grid Bottleneck Trade", cls: "theme", relationship: "member_of" },
    { id: "sec:utilities", label: "Utilities", cls: "industry", relationship: "supports" },
    { id: "co:CEG", label: "CEG", cls: "asset", relationship: "exposed_to" },
  ],
  exposure: {
    industries: [{ id: "sec:utilities", label: "Utilities", direction: "bullish" },
                 { id: "sec:semiconductors", label: "Semiconductors", direction: "bullish" }],
    companies: [{ id: "co:NVDA", label: "NVDA", direction: "bullish" },
                { id: "co:CEG", label: "CEG", direction: "bullish" },
                { id: "co:VST", label: "VST", direction: "bullish" },
                { id: "co:ASML", label: "ASML", direction: "bullish" }],
  },
  memory: {
    state: "accruing", firstSeen: "2026-06-30T09:00:00Z", sessions: 41, peak: 84, trough: 55,
    maturityLine: "Institutional history accruing: 12 of 60 required archive days.",
  },
  ledger: {
    state: "active", line: "14 open · 11 resolved · 9 confirmed · 2 contradicted",
    gateNote: "Diagnostics only — credibility gates not yet met; no accuracy claim.",
    items: [
      { statement: "Utilities→CEG exposure expected to remain recorded through Friday's boundary.", status: "resolved" },
      { statement: "Grid Bottleneck conviction expected to hold ≥ 75.", status: "active" },
    ],
  },
  watch: ["Power capex slows or grid approvals accelerate supply.",
          "10Y above 4.6 or a hyperscaler capex cut breaks the transmission."],
};

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
  const withNarrative = scenario === "default" || scenario === "dense";
  const model = useMemo(
    () => buildNetworkModel(themes, { riskRegime: "risk-on", regimeLabel: "Risk-On" },
                            { narrative: withNarrative ? NARRATIVE : null }),
    [themes, withNarrative]);

  return (
    <div className="min-h-screen p-6" style={{ background: "#070b13" }}>
      <p className="text-[10px] mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
        DEV VISUAL QA · scenario={scenario} · ?s=default|dense|sparse|single
      </p>
      <ErrorTrap />
      <div className="max-w-6xl mx-auto">
        <IntelligenceNetwork model={model} height={480}
          railMeta={
            <span className="font-bold uppercase" style={{ fontSize: 9, letterSpacing: "0.08em", color: "#34d399" }}>Risk-On</span>
          }
          aside={
            <>
              <div className="flex items-center">
                <span className="ml-auto font-bold uppercase rounded"
                  style={{ fontSize: 9, letterSpacing: "0.06em", padding: "2px 8px", color: "#34d399", background: "rgba(52,211,153,0.10)" }}>
                  Dominant Thesis
                </span>
              </div>
              <NetworkInspector vm={INSPECTOR_VM} />
            </>
          } />
      </div>
    </div>
  );
}

function ErrorTrap() {
  const [errs, setErrs] = useState<string[]>([]);
  useEffect(() => {
    const onErr = (e: ErrorEvent) => setErrs(p => [...p, `${e.message} @ ${e.filename?.split("/").pop()}:${e.lineno}`].slice(0, 4));
    const onRej = (e: PromiseRejectionEvent) => setErrs(p => [...p, `unhandled: ${String(e.reason).slice(0, 140)}`].slice(0, 4));
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  if (!errs.length) return null;
  return <div className="mb-2 text-[11px] font-mono" style={{ color: "#f87171" }}>{errs.map((e, i) => <p key={i}>{e}</p>)}</div>;
}

export default function NetworkQAPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Suspense fallback={null}><Harness /></Suspense>;
}
