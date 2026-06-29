/**
 * lib/capitalFlowIntel.ts — institutional read of the capital-flow stack.
 *
 * Turns the 8-layer transmission chain + live theme intelligence into the answers
 * an allocator wants: where capital is going / leaving, today's biggest flow, the
 * health pressure score, flow-strength metrics, a rotation radar, and concise
 * institutional takeaways. Deterministic — every figure derives from a real field
 * (layer status, theme momentum_delta / confidence / related_assets), nothing is
 * invented. Dependency-free (only types) so it adds no weight to the page.
 */

import type { CapitalFlowLayer, FlowStatus } from "./capitalFlow";
import type { ThemeIntelligence } from "./types";

const STATUS_VALUE: Record<FlowStatus, number> = {
  accelerating: 3, expanding: 2, neutral: 0, tightening: -1, contracting: -2, blocked: -3,
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const dirOf = (t: ThemeIntelligence) => t.momentum_direction === "bullish" ? 1 : t.momentum_direction === "bearish" ? -1 : 0;

export function flowColor(v: number): string {
  if (v >= 10) return "#22c55e";
  if (v > 0)   return "#86efac";
  if (v === 0) return "#fbbf24";
  if (v > -10) return "#f97316";
  return "#ef4444";
}

// ── 1 · Capital pressure ──────────────────────────────────────────────────────
export interface FlowPressure {
  score: number; label: string; color: string;
  trend: "improving" | "deteriorating" | "stable"; trendLabel: string; liquidity: string;
}
export function flowPressure(layers: CapitalFlowLayer[]): FlowPressure {
  const sum    = layers.reduce((s, l) => s + STATUS_VALUE[l.status], 0); // −24..+24
  const score  = Math.round(((sum + 24) / 48) * 100);
  const open   = layers.filter(l => STATUS_VALUE[l.status] > 0).length;
  const closed = layers.filter(l => STATUS_VALUE[l.status] < 0).length;
  const label  = score >= 60 ? "FLOWING" : score <= 40 ? "CONSTRAINED" : "MIXED";
  const color  = score >= 60 ? "#22c55e" : score <= 40 ? "#ef4444" : "#fbbf24";
  const trend  = open > closed ? "improving" : closed > open ? "deteriorating" : "stable";
  return {
    score, label, color, trend,
    trendLabel: trend === "improving" ? "Improving" : trend === "deteriorating" ? "Deteriorating" : "Holding",
    liquidity:  score >= 60 ? "Liquidity Expanding" : score <= 40 ? "Liquidity Contracting" : "Liquidity Stable",
  };
}

// ── 2 + 3 · Capital destinations / sources ────────────────────────────────────
export interface FlowItem { label: string; value: number; color: string }

const CATEGORIES: { key: string; re: RegExp; layer?: string }[] = [
  { key: "Infrastructure",   re: /infrastructur|grid|power|electric|baseload/, },
  { key: "Private Credit",   re: /private credit|direct lend|non.?bank|leverag|\bcredit\b/, layer: "credit-leverage" },
  { key: "Defense",          re: /defense|defence|rearmament|military|nato/ },
  { key: "AI Infrastructure", re: /\bai\b|data.?center|semiconduct|compute|\bgpu\b|silicon/ },
  { key: "Energy / Nuclear", re: /nuclear|uranium|\bsmr\b|energy|\boil\b|crude/ },
  { key: "Buyout / PE",      re: /buyout|private equity|sponsor/, layer: "pe-buyout" },
  { key: "Late-Stage VC",    re: /late.?stage|growth equity|series [c-e]/, layer: "late-vc" },
  { key: "Early-Stage VC",   re: /early.?stage|seed|venture/, layer: "early-vc" },
  { key: "IPO",              re: /\bipo\b|public listing|s-?1/, layer: "ipo-window" },
];

function categoryScores(themes: ThemeIntelligence[], layers: CapitalFlowLayer[]): FlowItem[] {
  const layerVal = new Map(layers.map(l => [l.id, STATUS_VALUE[l.status]]));
  return CATEGORIES.map(c => {
    let v = 0;
    for (const t of themes) {
      const hay = [t.name, ...(t.related_industries ?? []), ...(t.related_macro_factors ?? [])].join(" ").toLowerCase();
      if (c.re.test(hay)) v += (t.momentum_delta ?? 0) * 0.8 + dirOf(t) * 4;
    }
    if (c.layer) v += (layerVal.get(c.layer) ?? 0) * 4.5;
    return { label: c.key, value: Math.round(v), color: flowColor(Math.round(v)) };
  }).filter(i => i.value !== 0);
}

export function capitalDestinations(themes: ThemeIntelligence[], layers: CapitalFlowLayer[]): FlowItem[] {
  return categoryScores(themes, layers).filter(i => i.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);
}

export function capitalSources(themes: ThemeIntelligence[], layers: CapitalFlowLayer[], rateHigh: boolean, riskOff: boolean): FlowItem[] {
  const out: FlowItem[] = categoryScores(themes, layers).filter(i => i.value < 0);
  // Structural drains that lose capital under tight money / risk-off — macro reads.
  const structural: { key: string; on: boolean; v: number }[] = [
    { key: "Commercial Real Estate", on: rateHigh, v: -16 },
    { key: "Regional Banks",         on: rateHigh || riskOff, v: -12 },
    { key: "Consumer Lending",       on: riskOff || rateHigh, v: -9 },
    { key: "Long-Duration Growth",   on: rateHigh, v: -7 },
  ];
  for (const s of structural) if (s.on && !out.some(o => o.label === s.key)) out.push({ label: s.key, value: s.v, color: flowColor(s.v) });
  return out.sort((a, b) => a.value - b.value).slice(0, 6);
}

// ── 4 · Today's biggest flow ──────────────────────────────────────────────────
export interface BiggestFlow {
  label: string; direction: 1 | -1 | 0; confidence: number;
  reason: string; beneficiaries: string[]; invalidation: string;
}
function firstSentence(s?: string): string | null {
  if (!s) return null;
  const c = s.replace(/→|->/g, "—").trim();
  const dot = c.indexOf(". ");
  return dot > 12 ? c.slice(0, dot + 1) : c.length <= 150 ? c : null;
}
function invalidationFor(t: ThemeIntelligence): string {
  const hay = [t.name, ...(t.related_macro_factors ?? [])].join(" ").toLowerCase();
  if (/credit|lend|spread|default/.test(hay)) return "Credit spreads normalize and bank lending reopens.";
  if (/rate|yield|fed|policy/.test(hay))      return "Rates fall decisively and the cost-of-capital constraint lifts.";
  if (/\bai\b|semiconduct|compute|data.?center/.test(hay)) return "Hyperscaler capex guidance is cut.";
  if (/energy|power|grid|nuclear|electric/.test(hay)) return "Power-demand growth disappoints versus buildout.";
  if (/defense|rearmament|military/.test(hay)) return "A durable de-escalation reverses the rearmament cycle.";
  return "The macro driver behind the flow reverses.";
}
export function biggestFlow(themes: ThemeIntelligence[]): BiggestFlow | null {
  const ranked = [...themes].filter(t => (t.confidence ?? 0) > 0)
    .sort((a, b) => (b.confidence ?? 0) * (1 + Math.abs(b.momentum_delta ?? 0) / 40) - (a.confidence ?? 0) * (1 + Math.abs(a.momentum_delta ?? 0) / 40));
  const t = ranked[0];
  if (!t) return null;
  return {
    label: t.name,
    direction: dirOf(t) as 1 | -1 | 0,
    confidence: Math.round(t.confidence ?? 0),
    reason: firstSentence(t.causal_narrative) ?? (t.second_order_effects ?? [])[0] ?? "Capital is concentrating into the highest-conviction structural narrative.",
    beneficiaries: (t.related_assets ?? []).filter(a => /^[A-Z][A-Z.]{0,5}$/.test(a)).slice(0, 4),
    invalidation: invalidationFor(t),
  };
}

// ── 5 · Flow-strength metrics ─────────────────────────────────────────────────
export interface FlowMetric { label: string; value: number }
export function flowStrength(layers: CapitalFlowLayer[], themes: ThemeIntelligence[]): FlowMetric[] {
  const open  = layers.filter(l => STATUS_VALUE[l.status] > 0).length;
  const accel = layers.filter(l => l.status === "accelerating").length;
  const avg   = (sel: (t: ThemeIntelligence) => number) => themes.length ? themes.reduce((s, t) => s + sel(t), 0) / themes.length : 0;
  const credit = layers.find(l => l.id === "credit-leverage");
  const liqQuality = credit ? clamp(50 + STATUS_VALUE[credit.status] * 16) : 50;
  return [
    { label: "Flow Strength",     value: flowPressure(layers).score },
    { label: "Flow Velocity",     value: clamp(Math.round(accel * 18 + avg(t => Math.abs(t.momentum_delta ?? 0)) * 2)) },
    { label: "Flow Persistence",  value: clamp(Math.round(avg(t => t.persistence_score ?? 0))) },
    { label: "Cross-Confirmation", value: clamp(Math.round(themes.length ? (themes.filter(t => t.cross_category_confirmed).length / themes.length) * 100 : 0)) },
    { label: "Capital Breadth",   value: clamp(Math.round((open / 8) * 60 + avg(t => t.breadth_score ?? 0) * 0.4)) },
    { label: "Liquidity Quality", value: liqQuality },
  ];
}

// ── 6 · Transmission timeline ─────────────────────────────────────────────────
export interface TimelineNode { label: string; signal: string; status: FlowStatus; evidence: string }
export function flowTimeline(layers: CapitalFlowLayer[], destinations: FlowItem[]): TimelineNode[] {
  const pick = (id: string) => layers.find(l => l.id === id);
  const seq = ["monetary-policy", "credit-leverage", "pe-buyout"].map(pick).filter(Boolean) as CapitalFlowLayer[];
  const nodes: TimelineNode[] = seq.map(l => ({ label: l.label, signal: l.signal, status: l.status, evidence: l.detail }));
  for (const d of destinations.slice(0, 2)) {
    nodes.push({ label: d.label, signal: d.value > 0 ? `Receiving +${d.value}` : `${d.value}`, status: d.value >= 8 ? "accelerating" : "expanding", evidence: `Net capital inflow of ${d.value} this cycle from upstream rotation.` });
  }
  return nodes;
}

// ── 7 · Capital rotation radar ────────────────────────────────────────────────
export interface RadarAxis { label: string; value: number } // 0..1
export function radarAxes(themes: ThemeIntelligence[], layers: CapitalFlowLayer[], riskOff: boolean): RadarAxis[] {
  const cats = new Map(categoryScores(themes, layers).map(c => [c.label, c.value]));
  const layerVal = (id: string) => STATUS_VALUE[layers.find(l => l.id === id)?.status ?? "neutral"];
  const n = (v: number) => clamp(Math.round(((v + 20) / 40) * 100), 5, 100) / 100;
  return [
    { label: "Private Credit", value: n(cats.get("Private Credit") ?? layerVal("credit-leverage") * 4) },
    { label: "Infrastructure", value: n(cats.get("Infrastructure") ?? 0) },
    { label: "Venture",        value: n((layerVal("late-vc") + layerVal("early-vc")) * 4) },
    { label: "Secondaries",    value: n(layerVal("ipo-window") <= 0 ? 10 : -6) },           // IPO shut → secondaries bid
    { label: "Buyout",         value: n((cats.get("Buyout / PE") ?? 0) + layerVal("pe-buyout") * 3) },
    { label: "Distressed",     value: n(riskOff ? 12 : -8) },                               // distressed bid in risk-off
    { label: "Growth",         value: n(cats.get("AI Infrastructure") ?? layerVal("public-equities") * 4) },
  ];
}

// ── 8 · Institutional takeaways ───────────────────────────────────────────────
export interface Takeaway { label: string; value: string }
export function takeaways(layers: CapitalFlowLayer[], themes: ThemeIntelligence[], rateHigh: boolean, riskOff: boolean): Takeaway[] {
  const dest = capitalDestinations(themes, layers);
  const big  = biggestFlow(themes);
  const persist = themes.length ? themes.reduce((s, t) => s + (t.persistence_cycles ?? 0), 0) / themes.length : 0;
  return [
    { label: "Institutional Positioning", value: rateHigh ? "Up-in-quality, short duration" : riskOff ? "Defensive, cash-heavy" : "Risk-on, deploying selectively" },
    { label: "What Smart Money Is Doing", value: dest.length ? `Rotating into ${dest.slice(0, 2).map(d => d.label).join(" & ")}` : "Holding, awaiting catalyst" },
    { label: "Most Leveraged",            value: big?.beneficiaries.length ? big.beneficiaries.join(" · ") : "—" },
    { label: "Most At Risk",              value: rateHigh ? "Commercial Real Estate · Regional Banks" : riskOff ? "Late-Stage VC · IPO pipeline" : "Crowded long-duration growth" },
    { label: "Catalysts",                 value: "Next FOMC · CPI print · earnings-season guidance" },
    { label: "Invalidation",              value: big?.invalidation ?? "Macro driver reverses." },
    { label: "Expected Duration",         value: persist >= 6 ? "Multi-quarter (structural)" : persist >= 3 ? "1–2 quarters" : "Tactical (weeks)" },
  ];
}
