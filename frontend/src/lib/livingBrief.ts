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
  confidenceView, evidenceStrength, lifecycleStage, rankByImportance,
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

export interface LivingBriefVM {
  hasIntelligence: boolean;
  regime: string | null;
  executiveSummary: string | null;
  institutionalQuestion: string | null;
  whatMattersMost: WhatMattersItem[];
  marketMap: MarketMap | null;
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
    };
  }
  return {
    hasIntelligence: true,
    regime,
    executiveSummary: buildExecutiveSummary(themes, regime),
    institutionalQuestion: buildInstitutionalQuestion(themes),
    whatMattersMost: buildWhatMattersMost(themes),
    marketMap: buildMarketMap(themes, regime),
  };
}
