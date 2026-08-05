// ── livingBrief.ts — Living Intelligence Brief view-model (PX1.1 / PX1.2) ───────
//
// Pure, deterministic assembly of the brief from the real FeedResponse. Nothing is
// approximated or LLM-invented: the executive summary and institutional question
// are TEMPLATED from structured theme fields; What Matters Most is ranked strictly
// by Importance; the Market Map is a real transmission chain. Honest by omission —
// any element without real data is null/empty, never a placeholder.

import type { EntityKind } from "./entity";
import type { FeedResponse, ThemeIntelligence } from "./types";
import { sanitizeCopy } from "./utils";
import {
  computeImportance, confidenceView, evidenceStrength, lifecycleStage, rankByImportance,
  type ConfidenceView, type EvidenceStrength, type Importance, type Lifecycle,
} from "./intelligenceScore";

export interface EntitySpec { label: string; kind: EntityKind; }

export interface WhatMattersItem {
  id: string;
  headline: string;                 // what
  why: string;                      // why it matters (never absent — §CARE″)
  winners: EntitySpec[];            // who benefits
  losers: EntitySpec[];             // who is hurt
  exposure: EntitySpec[];           // neutral exposure (when direction is unsigned)
  importance: Importance;
  confidence: ConfidenceView;
  evidence: EvidenceStrength;
  lifecycle: Lifecycle;
  nextCatalyst: string | null;      // honest null — no fabricated dates
}

export type MapRole = "source" | "mechanism" | "sector" | "winner" | "loser";
export interface MapNode { label: string; kind: EntityKind; role: MapRole; }
export interface MarketMap {
  title: string;
  /** The aha in one sentence — "Why X is moving: cause → mechanism". Read in 3s. */
  read: string;
  spine: MapNode[];                 // source → mechanism → sector (the transmission path)
  winners: MapNode[];
  losers: MapNode[];
}

// ── PX1.3 pillars: Emerging Signals + Market Memory ────────────────────────────
export interface EmergingSignal {
  id: string;
  headline: string;                 // the theme beginning to matter
  pattern: string;                  // what is beginning (short, real)
  watchFor: string;                 // the curiosity hook — what would confirm it
  assets: EntitySpec[];
  importance: Importance;
  confidence: ConfidenceView;
  lifecycle: Lifecycle;
}

export interface MemoryMilestone { label: string; detail: string; reached: boolean; }
export interface MarketMemory {
  theme: string;
  firstSeenDaysAgo: number;
  convictionFrom: number;
  convictionNow: number;
  convictionTrend: string;
  statusLine: string;               // e.g. "Strengthening for 8 sessions"
  milestones: MemoryMilestone[];    // First detected → … → current stage
  tickers: EntitySpec[];            // "linked to NVDA, CEG, VST"
  openQuestion: string;             // curiosity hook
}

export interface LivingBriefVM {
  hasIntelligence: boolean;
  regime: string | null;
  executiveSummary: string | null;
  institutionalQuestion: string | null;
  whatMattersMost: WhatMattersItem[];
  marketMap: MarketMap | null;
  emergingSignals: EmergingSignal[];
  marketMemory: MarketMemory | null;
}

const symbolKind = (label: string): EntityKind =>
  /^[A-Z]{1,5}$/.test(label.trim()) ? "ticker" : "theme";

function exposures(t: ThemeIntelligence): Pick<WhatMattersItem, "winners" | "losers" | "exposure"> {
  const assets: EntitySpec[] = (t.related_assets ?? []).slice(0, 4)
    .map((a) => ({ label: a, kind: symbolKind(a) }));
  if (t.momentum_direction === "bullish") return { winners: assets, losers: [], exposure: [] };
  if (t.momentum_direction === "bearish") return { winners: [], losers: assets, exposure: [] };
  return { winners: [], losers: [], exposure: assets };
}

/** Cap free text to N sentences / M words without cutting mid-sentence. */
function cap(text: string, maxSentences: number, maxWords: number): string {
  const clean = sanitizeCopy(text) ?? "";
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let out = "";
  let words = 0;
  for (const s of sentences.slice(0, maxSentences)) {
    const w = s.trim().split(/\s+/).length;
    if (words + w > maxWords) break;
    out += (out ? " " : "") + s.trim();
    words += w;
  }
  return out;
}

function buildWhatMattersMost(themes: ThemeIntelligence[]): WhatMattersItem[] {
  return rankByImportance(themes).slice(0, 5).map(({ theme, importance }) => {
    const why = cap(theme.causal_narrative || theme.description || "", 1, 26)
      || `Affects ${theme.related_industries?.slice(0, 2).join(" and ") || "multiple sectors"}.`;
    return {
      id: theme.id,
      headline: theme.name,
      why,
      ...exposures(theme),
      importance,
      confidence: confidenceView(theme),
      evidence: evidenceStrength(theme),
      lifecycle: lifecycleStage(theme),
      nextCatalyst: null,   // themes carry no dated catalyst — honest omission
    };
  });
}

function buildMarketMap(themes: ThemeIntelligence[], regime: string | null): MarketMap | null {
  const ranked = rankByImportance(themes);
  const top = ranked[0]?.theme;
  if (!top) return null;

  const spine: MapNode[] = [];
  const source = top.related_macro_factors?.[0] || regime;
  if (source) spine.push({ label: source, kind: "macro", role: "source" });
  spine.push({ label: top.name, kind: "theme", role: "mechanism" });
  for (const ind of (top.related_industries ?? []).slice(0, 2)) {
    spine.push({ label: ind, kind: "sector", role: "sector" });
  }
  if (spine.length < 2) return null;   // no real transmission path → absent

  const { winners, losers, exposure } = exposures(top);
  const toNode = (e: EntitySpec, role: MapRole): MapNode => ({ label: e.label, kind: e.kind, role });
  const winNodes = [...winners, ...exposure].slice(0, 4).map((e) => toNode(e, "winner"));
  const loseNodes = losers.slice(0, 4).map((e) => toNode(e, "loser"));

  // The aha line: what is moving, and why — a single plain sentence. Deterministic
  // from the real chain + the theme's direction. This is what a user reads in 3s.
  const subject = top.related_industries?.[0]
    || (winners[0]?.label ?? losers[0]?.label ?? top.name);
  const verb = top.momentum_direction === "bearish" ? "is under pressure"
    : top.momentum_direction === "bullish" ? "is moving higher" : "is in play";
  const read = sanitizeCopy(source
    ? `Why ${subject} ${verb}: ${source} is transmitting through ${top.name}.`
    : `Why ${subject} ${verb}: ${top.name} is the driver.`) ?? top.name;

  // ≤12 nodes total (§MAP″): trim spine + leaves together.
  const budget = 12 - spine.length;
  return {
    title: top.name,
    read,
    spine,
    winners: winNodes.slice(0, Math.max(0, Math.ceil(budget / 2))),
    losers: loseNodes.slice(0, Math.max(0, Math.floor(budget / 2))),
  };
}

function buildExecutiveSummary(themes: ThemeIntelligence[], regime: string | null): string | null {
  const ranked = rankByImportance(themes);
  const top = ranked[0]?.theme;
  if (!top) return null;
  const second = ranked[1]?.theme;
  const lead = ranked[0].importance.lead;

  const s1 = regime
    ? `Markets are trading a ${regime.toLowerCase()} tape, led by ${top.name}.`
    : `${top.name} is the dominant force in markets right now.`;
  const s2 = `It matters most on ${lead.label.toLowerCase()}: ${lead.detail}.`;
  const s3 = second ? `${second.name} is ${lifecycleStage(second).label.toLowerCase()} beneath it.` : "";
  return cap([s1, s2, s3].filter(Boolean).join(" "), 3, 80);
}

function buildInstitutionalQuestion(themes: ThemeIntelligence[]): string | null {
  const ranked = rankByImportance(themes);
  const top = ranked[0]?.theme;
  if (!top) return null;
  // Tension = a real cooling/reversing counter-narrative, else the top theme's own
  // second-order risk. No tension → no manufactured question (honest absence).
  const counter = ranked.slice(1).find(({ theme }) =>
    theme.momentum_label === "cooling" || theme.momentum_label === "reversing");
  const tension = counter?.theme.name || top.second_order_effects?.[0];
  if (!tension) return null;
  return sanitizeCopy(`Can ${top.name} hold if ${tension.toLowerCase()} takes over?`) ?? null;
}

// Emerging Signals: what is becoming institutionally RELEVANT before it becomes
// institutional CONSENSUS (§EMERGE‴). Early lifecycle + rising conviction, excluding
// anything already surfaced in What Matters Most (insight-per-scroll).
const _EARLY_MOMENTUM = new Set(["emerging", "accelerating", "strengthening"]);

function buildEmergingSignals(themes: ThemeIntelligence[], excludeIds: Set<string>): EmergingSignal[] {
  const candidates = themes.filter((t) => {
    if (excludeIds.has(t.id)) return false;
    const stage = lifecycleStage(t).stage;
    const rising = (t.memory?.conviction_change ?? t.momentum_delta ?? 0) > 0
      || t.momentum_label === "emerging";
    const early = stage === "emerging"
      || (_EARLY_MOMENTUM.has(t.momentum_label) && (t.persistence_days ?? 99) <= 12);
    return early && rising;
  });
  const ranked = candidates.sort((a, b) => {
    const ca = a.memory?.conviction_change ?? a.momentum_delta ?? 0;
    const cb = b.memory?.conviction_change ?? b.momentum_delta ?? 0;
    return cb - ca
      || (a.memory?.first_seen_days_ago ?? 999) - (b.memory?.first_seen_days_ago ?? 999)
      || a.id.localeCompare(b.id);
  }).slice(0, 3);

  return ranked.map((t) => {
    const pattern = cap(t.causal_narrative || t.description || "", 1, 22)
      || `${t.name} is ${t.momentum_label}.`;
    const so = t.second_order_effects?.[0];
    const watchFor = sanitizeCopy(so ? `Confirms if ${so.toLowerCase()} follows.`
      : "Confirms if corroboration broadens across sectors.") ?? "";
    return {
      id: t.id, headline: t.name, pattern, watchFor,
      assets: (t.related_assets ?? []).slice(0, 3).map((a) => ({ label: a, kind: symbolKind(a) })),
      importance: computeImportance(t),
      confidence: confidenceView(t),
      lifecycle: lifecycleStage(t),
    };
  });
}

const _STATUS_WORD: Record<string, string> = {
  new: "New", strengthening: "Strengthening", weakening: "Weakening",
  recurring: "Recurring", active: "Active", stale: "Fading",
};
const _MEMORY_STAGES = ["First detected", "Conviction built", "Became dominant", "Cooling", "Resolved"];

function buildMarketMemory(themes: ThemeIntelligence[]): MarketMemory | null {
  const lead = rankByImportance(themes).map((r) => r.theme).find((t) => t.memory);
  const m = lead?.memory;
  if (!lead || !m) return null;

  const idx = lifecycleStage(lead).index;
  const from = Math.round(m.conviction_first);
  const now = Math.round(m.conviction_current);
  const milestones: MemoryMilestone[] = _MEMORY_STAGES.map((label, i) => ({
    label,
    detail: i === 0 ? `${m.first_seen_days_ago}d ago`
      : i === 1 ? `${from} → ${now}` : "",
    reached: i <= idx,
  }));

  return {
    theme: lead.name,
    firstSeenDaysAgo: m.first_seen_days_ago,
    convictionFrom: from,
    convictionNow: now,
    convictionTrend: m.conviction_trend,
    statusLine: `${_STATUS_WORD[m.status] ?? "Tracked"} for ${m.sessions_in_status} ${m.sessions_in_status === 1 ? "session" : "sessions"}`,
    milestones,
    tickers: (m.historical_tickers ?? []).slice(0, 4).map((t) => ({ label: t, kind: symbolKind(t) })),
    openQuestion: sanitizeCopy(m.conviction_trend === "falling"
      ? `Is ${lead.name} resolving, or just pausing?`
      : `Has ${lead.name} peaked, or is conviction still building?`) ?? "",
  };
}

export function buildLivingBrief(feed: FeedResponse | undefined, regimeOverride?: string | null): LivingBriefVM {
  const themes = (feed?.theme_intelligence ?? []).filter((t) => t && t.name);
  const regime = regimeOverride
    ?? feed?.sector_data?.derived_regime
    ?? feed?.market_brief?.market_regime
    ?? null;

  if (themes.length === 0) {
    return {
      hasIntelligence: false, regime, executiveSummary: null,
      institutionalQuestion: null, whatMattersMost: [], marketMap: null,
      emergingSignals: [], marketMemory: null,
    };
  }
  const whatMattersMost = buildWhatMattersMost(themes);
  const excludeIds = new Set(whatMattersMost.map((w) => w.id));
  return {
    hasIntelligence: true,
    regime,
    executiveSummary: buildExecutiveSummary(themes, regime),
    institutionalQuestion: buildInstitutionalQuestion(themes),
    whatMattersMost,
    marketMap: buildMarketMap(themes, regime),
    emergingSignals: buildEmergingSignals(themes, excludeIds),
    marketMemory: buildMarketMemory(themes),
  };
}
