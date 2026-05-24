"use client";

import { useRef, useMemo } from "react";
import { useMarketData } from "./useMarketData";
import type { TickerData } from "./useMarketData";

// ── Types ──────────────────────────────────────────────────────────────────────

export type RiskRegime   = "risk-on"  | "neutral"  | "risk-off";
export type VolRegime    = "low"      | "moderate" | "elevated" | "high";
export type RatesRegime  = "falling"  | "stable"   | "rising";
export type DollarRegime = "weak"     | "neutral"  | "strong";
export type TrendDir     = "strengthening" | "weakening" | "stable";
export type MomentumTag  = "accelerating"  | "stable"    | "decelerating";

export interface MarketSignal {
  label: string;
  arrow: "↑" | "↓" | "→";
  value: string;
  color: string;
}

export interface MarketTrend {
  riskDirection:    TrendDir;
  duration:         number;    // consecutive readings confirming direction
  acceleration:     MomentumTag;
  volTrend:         "rising" | "falling" | "stable";
  label:            string;    // human-readable: "Risk-on strengthening"
  persistenceLabel: string;    // "Just Emerging" | "Building" | "Persistent" | "Extended"
  momentumDecay:    boolean;   // decelerating after sustained move
}

export interface MarketState {
  // Raw scores — 0.5 is neutral, 0=max bearish/low, 1=max bullish/high
  riskScore:     number;
  volScore:      number;
  ratesPressure: number;  // 0=falling rates, 1=rising rates
  dollarScore:   number;  // 0=weak dollar, 1=strong dollar

  // Regime labels
  riskRegime:   RiskRegime;
  volRegime:    VolRegime;
  ratesRegime:  RatesRegime;
  dollarRegime: DollarRegime;

  // Visual parameters — pre-computed for direct component use
  atmosphereColor:     string;  // ambient glow color hex
  atmosphereIntensity: number;  // 0-1 — overall pressure intensity
  volFieldScale:       number;  // 0-1 — volatility pressure field size
  riskFieldIntensity:  number;  // 0-1 — risk-on blue field strength
  stressIntensity:     number;  // 0-1 — risk-off/stress red field
  particleIntensity:   number;  // 0-1 — ambient particle brightness
  breathAmplitude:     number;  // 0-1 — animation breathing depth

  // Live cross-asset signals (with real prices when available)
  signals: MarketSignal[];

  // Market memory / trend persistence
  trend: MarketTrend;

  // Status
  hasData: boolean;
  isLive:  boolean;

  // Temporal intelligence (Phase 4: Regime Memory)
  exhaustionRisk:   boolean;  // long trend + decelerating — potential reversal
  regimeTransition: boolean;  // trend just changed direction (duration ≤ 1)
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function norm(val: number, lo: number, hi: number): number {
  if (hi === lo) return 0.5;
  return clamp((val - lo) / (hi - lo), 0, 1);
}

// ── Score derivation ───────────────────────────────────────────────────────────

function deriveScores(d: Record<string, TickerData | null> | undefined): {
  riskScore: number; volScore: number; ratesPressure: number; dollarScore: number;
} {
  if (!d) return { riskScore: 0.5, volScore: 0.5, ratesPressure: 0.5, dollarScore: 0.5 };

  const spy = d["SPY"], qqq = d["QQQ"], iwm = d["IWM"];
  const vix = d["VIX"], tnx = d["TNX"], dxy = d["DXY"];

  // Risk: avg equity % change (SPY + QQQ + IWM), clamp ±3%
  const eqs = [spy, qqq, iwm]
    .filter((t): t is TickerData => t !== null)
    .map(t => t.changePercent);
  const avgEq    = eqs.length ? eqs.reduce((s, v) => s + v, 0) / eqs.length : 0;
  const riskScore = norm(avgEq, -3.0, 3.0);

  // Vol: VIX level (70%) + VIX change spike (30%)
  const vixPrice  = vix?.price ?? 18;
  const vixChgPct = vix?.changePercent ?? 0;
  const volScore  = clamp(norm(vixPrice, 10, 38) * 0.70 + norm(vixChgPct, -8, 22) * 0.30, 0, 1);

  // Rates: TNX absolute change (% points)
  const tnxChg       = tnx?.change ?? 0;
  const ratesPressure = norm(tnxChg, -0.15, 0.15);

  // Dollar: DXY % change
  const dxyChg      = dxy?.changePercent ?? 0;
  const dollarScore  = norm(dxyChg, -1.2, 1.2);

  return { riskScore, volScore, ratesPressure, dollarScore };
}

// ── Cross-asset signals ────────────────────────────────────────────────────────

function deriveSignals(
  d:  Record<string, TickerData | null> | undefined,
  rs: number, vs: number, rp: number, ds: number,
): MarketSignal[] {
  const rOn  = rs > 0.60, rOff = rs < 0.40;
  const vHi  = vs > 0.58, vLo  = vs < 0.30;
  const rUp  = rp > 0.60, rDn  = rp < 0.40;
  const dUp  = ds > 0.60, dDn  = ds < 0.40;

  const tnx  = d?.["TNX"];
  const dxy  = d?.["DXY"];
  const oil  = d?.["BZ=F"];
  const gold = d?.["GC=F"];
  const vix  = d?.["VIX"];
  const oilChg  = oil?.changePercent  ?? 0;
  const goldChg = gold?.changePercent ?? 0;

  return [
    {
      label: "Yields",
      arrow: rUp ? "↑" : rDn ? "↓" : "→",
      value: tnx ? `${tnx.price.toFixed(2)}%` : (rUp ? "Rising" : rDn ? "Falling" : "Stable"),
      color: rUp ? "#c8a040" : rDn ? "#52b0c8" : "#8898b8",
    },
    {
      label: "Dollar",
      arrow: dUp ? "↑" : dDn ? "↓" : "→",
      value: dxy ? dxy.price.toFixed(2) : (dUp ? "Bid" : dDn ? "Soft" : "Mixed"),
      color: dUp ? "#c8a040" : dDn ? "#52b0c8" : "#8898b8",
    },
    {
      label: "Gold",
      arrow: (rOff || goldChg > 0.35) ? "↑" : (rOn && goldChg < -0.35) ? "↓" : "→",
      value: gold ? `$${gold.price.toFixed(0)}` : ((rOff || goldChg > 0.35) ? "Bid" : "Flat"),
      color: (rOff || goldChg > 0.35) ? "#c8a040" : "#8898b8",
    },
    {
      label: "Oil",
      arrow: oilChg > 0.40 ? "↑" : oilChg < -0.40 ? "↓" : "→",
      value: oil ? `$${oil.price.toFixed(1)}` : (oilChg > 0.40 ? "Bid" : oilChg < -0.40 ? "Soft" : "Flat"),
      color: oilChg > 0.40 ? "#c8a040" : "#8898b8",
    },
    {
      label: "VIX",
      arrow: vHi ? "↑" : vLo ? "↓" : "→",
      value: vix ? vix.price.toFixed(1) : (vHi ? "Elevated" : vLo ? "Calm" : "Moderate"),
      color: vHi ? "#b05858" : vLo ? "#52b0c8" : "#8898b8",
    },
    {
      label: "Spreads",
      arrow: rOff ? "↑" : rOn ? "↓" : "→",
      value: rOff ? "Widening" : rOn ? "Tightening" : "Stable",
      color: rOff ? "#b05858" : rOn ? "#52b0c8" : "#8898b8",
    },
  ];
}

// ── Trend / market memory ──────────────────────────────────────────────────────

interface HistPoint { riskScore: number; volScore: number; ts: number; }
const HIST_SIZE = 8;

function computeTrend(hist: HistPoint[]): MarketTrend {
  if (hist.length < 2) {
    return { riskDirection: "stable", duration: 0, acceleration: "stable", volTrend: "stable", label: "Neutral", persistenceLabel: "Just Emerging", momentumDecay: false };
  }

  const recent = hist.slice(-4);
  const older  = hist.slice(-7, -3);

  const avgRecent = recent.reduce((s, h) => s + h.riskScore, 0) / recent.length;
  const avgOlder  = older.length > 0
    ? older.reduce((s, h) => s + h.riskScore, 0) / older.length
    : avgRecent;
  const delta = avgRecent - avgOlder;

  const riskDirection: TrendDir =
    delta > 0.042 ? "strengthening" : delta < -0.042 ? "weakening" : "stable";

  // Duration: how many consecutive history points confirm direction
  let duration = 0;
  if (riskDirection !== "stable") {
    for (let i = hist.length - 1; i >= 1; i--) {
      const d = hist[i].riskScore - hist[i - 1].riskScore;
      const ok = riskDirection === "strengthening" ? d >= -0.008 : d <= 0.008;
      if (ok) duration++;
      else break;
    }
  }

  // Acceleration
  const recentSlope = recent.length >= 2
    ? recent[recent.length - 1].riskScore - recent[0].riskScore : 0;
  const olderSlope  = older.length >= 2
    ? older[older.length - 1].riskScore - older[0].riskScore : recentSlope;
  const acceleration: MomentumTag =
    Math.abs(recentSlope) > Math.abs(olderSlope) + 0.04 ? "accelerating" :
    Math.abs(recentSlope) < Math.abs(olderSlope) - 0.04 ? "decelerating" : "stable";

  // Vol trend
  const recentVol = recent[recent.length - 1]?.volScore ?? 0;
  const firstVol  = recent[0]?.volScore ?? recentVol;
  const volTrend: "rising" | "falling" | "stable" =
    recentVol - firstVol > 0.04 ? "rising" :
    recentVol - firstVol < -0.04 ? "falling" : "stable";

  const label =
    riskDirection === "strengthening"
      ? (acceleration === "accelerating" ? "Risk-on accelerating" : "Risk-on strengthening")
      : riskDirection === "weakening"
      ? (acceleration === "accelerating" ? "Risk-off accelerating" : "Risk-off building")
      : volTrend === "rising"  ? "Volatility rising"
      : volTrend === "falling" ? "Volatility easing"
      : "Neutral";

  const persistenceLabel =
    duration <= 1 ? "Just Emerging" :
    duration <= 3 ? "Building" :
    duration <= 6 ? "Persistent" : "Extended";

  const momentumDecay = acceleration === "decelerating" && duration > 2;

  return { riskDirection, duration, acceleration, volTrend, label, persistenceLabel, momentumDecay };
}

// ── Main hook ──────────────────────────────────────────────────────────────────

export function useMarketState(): MarketState {
  const { data, heartbeatStatus } = useMarketData();

  const { riskScore, volScore, ratesPressure, dollarScore } = useMemo(
    () => deriveScores(data),
    [data],
  );

  // Rolling history (ref-based — no re-render cost, updates when scores shift)
  const histRef = useRef<HistPoint[]>([]);
  const prevRef = useRef({ risk: 0.5, vol: 0.5 });
  const prev    = prevRef.current;
  if (Math.abs(prev.risk - riskScore) > 0.022 || Math.abs(prev.vol - volScore) > 0.022) {
    histRef.current = [
      ...histRef.current.slice(-(HIST_SIZE - 1)),
      { riskScore, volScore, ts: Date.now() },
    ];
    prevRef.current = { risk: riskScore, vol: volScore };
  }

  const trend = computeTrend(histRef.current);

  // Regime classifications
  const riskRegime:   RiskRegime   = riskScore > 0.62 ? "risk-on"  : riskScore < 0.38 ? "risk-off" : "neutral";
  const volRegime:    VolRegime    = volScore  < 0.24 ? "low"       : volScore  < 0.50 ? "moderate" : volScore  < 0.74 ? "elevated" : "high";
  const ratesRegime:  RatesRegime  = ratesPressure > 0.60 ? "rising"  : ratesPressure < 0.40 ? "falling" : "stable";
  const dollarRegime: DollarRegime = dollarScore   > 0.62 ? "strong"  : dollarScore   < 0.38 ? "weak"    : "neutral";

  // ── Visual parameters ────────────────────────────────────────────────────────

  const riskDev  = Math.abs(riskScore - 0.5) * 2;           // 0-1
  const volDevUp = Math.max(0, volScore - 0.38) / 0.62;     // 0-1

  // Atmosphere color — dominant market pressure drives ambient hue
  const atmosphereColor: string =
    riskRegime === "risk-on"  ? "#182e6a" :   // institutional blue
    riskRegime === "risk-off" ? "#3a1414" :   // muted stress crimson
    (volRegime === "elevated" || volRegime === "high") ? "#2e2408" :  // amber caution
    ratesRegime === "rising"  ? "#24200a" :   // rates/inflation amber
    "#0e1a2e";                                // neutral deep navy

  const atmosphereIntensity = clamp(0.38 + riskDev * 0.38 + volDevUp * 0.28, 0.28, 0.96);
  const volFieldScale       = clamp(0.28 + volScore * 0.62, 0.28, 0.88);
  const riskFieldIntensity  = clamp((riskScore - 0.50) * 2.0 * 0.72, 0, 0.72);
  const stressIntensity     = clamp(Math.max((0.50 - riskScore) * 2.0, volScore - 0.46) * 0.68, 0, 0.68);
  const particleIntensity   = clamp(0.52 + riskDev * 0.28 + volDevUp * 0.20, 0.40, 0.94);
  const breathAmplitude     = clamp(0.32 + volScore * 0.46 + riskDev * 0.22, 0.26, 1.0);

  const signals = useMemo(
    () => deriveSignals(data, riskScore, volScore, ratesPressure, dollarScore),
    [data, riskScore, volScore, ratesPressure, dollarScore],
  );

  // Phase 4: Regime memory — derived directly from trend to avoid extra state
  const exhaustionRisk   = trend.duration > 4 && trend.acceleration === "decelerating";
  const regimeTransition = trend.duration <= 1 && trend.riskDirection !== "stable";

  return {
    riskScore, volScore, ratesPressure, dollarScore,
    riskRegime, volRegime, ratesRegime, dollarRegime,
    atmosphereColor, atmosphereIntensity,
    volFieldScale, riskFieldIntensity, stressIntensity,
    particleIntensity, breathAmplitude,
    signals,
    trend,
    hasData: !!data,
    isLive:  heartbeatStatus === "live",
    exhaustionRisk,
    regimeTransition,
  };
}
