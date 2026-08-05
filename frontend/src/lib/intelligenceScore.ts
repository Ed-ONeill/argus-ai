// ── intelligenceScore.ts — three orthogonal axes for the Living Brief (PX1.1) ──
//
// Three DISTINCT concepts, never conflated (§SCORE′):
//   • Importance  — "how much does this matter?"  (0–100, decomposable, band-first)
//   • Confidence  — "how certain are we?"          (from backend conviction, not LLM)
//   • Evidence    — "how well supported?"          (Strong / Mixed / Thin)
// Plus the narrative Lifecycle stage (§LIFE″).
//
// Everything here is PURE and DETERMINISTIC over real ThemeIntelligence/ThemeMemory
// fields — no LLM number ever feeds Importance or Confidence. Importance decomposes
// into six named, inspectable factors so users can see WHY something ranked #1.

import type { ThemeIntelligence } from "./types";

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

// ── Importance (six real factors, equal-weighted to start — R-9 default) ───────
export type ImportanceBand = "Critical" | "High" | "Moderate" | "Watch";

export interface ImportanceFactor {
  key: "breadth" | "transmission" | "persistence" | "corroboration" | "momentum" | "novelty";
  label: string;
  value: number;   // 0–1 normalized
  weight: number;  // 0–1
  detail: string;  // one honest inspectable sentence
}

export interface Importance {
  score: number;         // 0–100
  band: ImportanceBand;
  factors: ImportanceFactor[];
  /** The single strongest driver — the headline reason this ranked where it did. */
  lead: ImportanceFactor;
}

const MOMENTUM_WEIGHT: Record<string, number> = {
  accelerating: 1, strengthening: 0.82, emerging: 0.7, stable: 0.5, cooling: 0.28, reversing: 0.14,
};

export function computeImportance(t: ThemeIntelligence): Importance {
  const relCount = Object.keys(t.relationship_weights ?? {}).length;
  const reach = relCount || (t.related_industries?.length ?? 0) + (t.second_order_effects?.length ?? 0);

  const breadth = clamp01((t.breadth_score ?? 0) / 100 || (t.related_assets?.length ?? 0) / 8);
  const transmission = clamp01(reach / 8);
  const persistence = clamp01((t.persistence_score ?? 0) / 100 || (t.persistence_days ?? 0) / 45);
  const corroboration = clamp01((t.evidence_count ?? 0) / 12);
  const momentum = clamp01(MOMENTUM_WEIGHT[t.momentum_label] ?? 0.5);
  // Novelty rewards genuinely new-but-real narratives; falls to mid when unknown.
  const firstSeen = t.memory?.first_seen_days_ago;
  const novelty = firstSeen == null ? 0.5 : clamp01(1 - firstSeen / 90);

  const w = 1 / 6;
  const factors: ImportanceFactor[] = [
    { key: "breadth", label: "Breadth of impact", value: breadth, weight: w,
      detail: `${t.related_industries?.length ?? 0} industries, ${t.related_assets?.length ?? 0} assets exposed` },
    { key: "transmission", label: "Transmission reach", value: transmission, weight: w,
      detail: `${reach} downstream relationships` },
    { key: "persistence", label: "Persistence", value: persistence, weight: w,
      detail: t.persistence_days ? `${t.persistence_days} days running` : `${t.persistence_cycles} cycles` },
    { key: "corroboration", label: "Corroboration", value: corroboration, weight: w,
      detail: `${t.evidence_count ?? 0} pieces of evidence` },
    { key: "momentum", label: "Momentum", value: momentum, weight: w,
      detail: t.momentum_label },
    { key: "novelty", label: "Novelty", value: novelty, weight: w,
      detail: firstSeen == null ? "first-seen unknown" : `first detected ${firstSeen}d ago` },
  ];

  const score = Math.round(100 * factors.reduce((s, f) => s + f.value * f.weight, 0));
  const band: ImportanceBand = score >= 75 ? "Critical" : score >= 55 ? "High" : score >= 35 ? "Moderate" : "Watch";
  const lead = [...factors].sort((a, b) => b.value - a.value)[0];
  return { score, band, factors, lead };
}

// ── Confidence (backend conviction, never the LLM MarketBrief.confidence) ──────
export interface ConfidenceView { value: number; label: string; band: "High" | "Elevated" | "Moderate" | "Developing"; }

export function confidenceView(t: ThemeIntelligence): ConfidenceView {
  const value = Math.round(t.confidence ?? 0);
  const band: ConfidenceView["band"] =
    value >= 75 ? "High" : value >= 60 ? "Elevated" : value >= 45 ? "Moderate" : "Developing";
  return { value, label: t.confidence_label || band, band };
}

// ── Evidence strength ──────────────────────────────────────────────────────────
export type EvidenceStrength = "Strong" | "Mixed" | "Thin";

export function evidenceStrength(t: ThemeIntelligence): EvidenceStrength {
  if (t.signal_quality === "confirmed" || (t.evidence_count >= 8 && t.cross_category_confirmed)) return "Strong";
  if (t.signal_quality === "speculative" || (t.evidence_count ?? 0) < 3) return "Thin";
  return "Mixed";
}

// ── Lifecycle stage (§LIFE″) — deterministic from momentum + memory ────────────
export type LifecycleStage = "emerging" | "developing" | "dominant" | "cooling" | "resolved";

const STAGE_ORDER: LifecycleStage[] = ["emerging", "developing", "dominant", "cooling", "resolved"];

export interface Lifecycle { stage: LifecycleStage; index: number; label: string; }

export function lifecycleStage(t: ThemeIntelligence): Lifecycle {
  const m = t.memory ?? null;
  const cooling = t.momentum_label === "cooling" || t.momentum_label === "reversing"
    || m?.conviction_trend === "falling";
  let stage: LifecycleStage;

  if (m?.is_stale || m?.status === "stale") stage = "resolved";
  else if (cooling) stage = "cooling";
  else if ((t.confidence ?? 0) >= 68 && (t.persistence_days ?? t.persistence_cycles ?? 0) >= 6) stage = "dominant";
  else if (t.momentum_label === "emerging" || m?.is_new || (m != null && m.first_seen_days_ago <= 4)) stage = "emerging";
  else stage = "developing";

  const index = STAGE_ORDER.indexOf(stage);
  const label = stage[0].toUpperCase() + stage.slice(1);
  return { stage, index, label };
}

/** Rank themes by Importance — the honest, deterministic ordering for What Matters Most. */
export function rankByImportance(themes: ThemeIntelligence[]): { theme: ThemeIntelligence; importance: Importance }[] {
  return themes
    .map((theme) => ({ theme, importance: computeImportance(theme) }))
    .sort((a, b) => b.importance.score - a.importance.score
      || (b.theme.confidence ?? 0) - (a.theme.confidence ?? 0)
      || a.theme.id.localeCompare(b.theme.id));   // stable, deterministic tie-break
}
