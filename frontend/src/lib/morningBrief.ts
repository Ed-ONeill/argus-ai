/**
 * lib/morningBrief.ts - the canonical Morning Brief view model (Sprint B1 of
 * docs/ARGUS_MORNING_BRIEF_V2.md).
 *
 * One pure builder the homepage consumes instead of assembling brief sections
 * inline. This sprint is infrastructure, not the v2 information architecture:
 * the sections mirror what the page renders today, but every value is either
 * engine/data-backed or explicitly marked as summarizer voice - and the two
 * fabrications the v2 audit found are gone:
 *
 *  - C3: the hardcoded catalyst list ("CPI - Tomorrow", forever) is replaced by
 *    `watch`: dateless watch lines derived from stored theme fields. No dates,
 *    no countdowns, no importance theater - there is no calendar provider yet
 *    (v2 doc section 4.6), so nothing pretends to be one.
 *  - C2: the summarizer's self-assessed confidence (50-95) is never surfaced.
 *    `conviction` is the leading theme's backend-computed conviction, with a
 *    decomposition (evidence counts, cross-session memory trend, and the
 *    evidence-engine verdict when the graph is built).
 *
 * Design rules: inputs are INJECTED (the builder never fetches; profile doc
 * injection rule); sections use the ProfileSection status wrapper so absence is
 * typed; summarizer prose only ever appears with status "partial" and a voice
 * note (v2 doc section 6, R5). Pure module, relative imports only, exercised
 * by intelligenceTests.ts (78.x). No em/en dashes.
 */

import type { MarketBrief, ThemeIntelligence } from "./types";
import type { ProfileSection, ProfileStatus } from "./intelligenceProfile";
import { evaluateEvidenceForNode } from "./evidenceEngine";
import { predictThemeTrajectory } from "./predictionEngine";
import { deriveMorningBriefDeltas, watchLineOf, type MorningBriefDelta, type TrackedTheme } from "./intelligenceDeltas";

/* ------------------------------------------------------------------ *
 * Contract
 * ------------------------------------------------------------------ */

export type RegimeChange = "unchanged" | "stronger" | "weaker" | "changed";

export interface RegimeVM {
  label:          string;
  status:         RegimeChange | null;   // localStorage-tracked day-over-day read (page-supplied)
  assetsImpacted: string[];
}

export interface ConvictionVM {
  /** Leading theme conviction, backend-computed from evidence. Never the summarizer's number. */
  value:       number;
  themeName:   string;
  trend:       "rising" | "falling" | "stable" | null;   // cross-session, from backend theme memory
  explanation: string;                                    // full decomposition (I4)
}

/** Summarizer-authored prose. Voice, never facts (v2 doc section 6). */
export interface VoiceVM { text: string }

export interface OpportunityVM { name: string; conviction: number; momentum: string }

export interface RiskItemVM {
  kind:   "scenario" | "theme" | "invalidation";
  text:   string;
  source: string | null;   // "summarizer" | theme name | engine basis
}

export interface WatchItemVM {
  text:    string;
  theme:   string;
  derived: true;   // constant: these are graph/field derivations, not calendar entries
}

export interface MorningBriefVM {
  generatedAt:      number;
  regime:           ProfileSection<RegimeVM>;
  /** The change ledger (Sprint B2): what changed since the previous cycle,
      from recorded memory only (lib/intelligenceDeltas.ts). */
  changes:          ProfileSection<MorningBriefDelta[]>;
  conviction:       ProfileSection<ConvictionVM>;
  whyToday:         ProfileSection<VoiceVM>;
  primaryNarrative: ProfileSection<VoiceVM>;
  opportunities:    ProfileSection<OpportunityVM[]>;
  risks:            ProfileSection<RiskItemVM[]>;
  tradeImplication: ProfileSection<VoiceVM>;
  activeThemes:     ProfileSection<string[]>;
  watch:            ProfileSection<WatchItemVM[]>;
  counts:           { activeThemes: number; storyClusters: number };
}

export interface MorningBriefInputs {
  marketBrief?:        MarketBrief | null;
  themes?:             ThemeIntelligence[];
  storyClusterCount?:  number;
  regimeStatus?:       RegimeChange | null;
  /** Data-derived regime label (useMarketState) used when the brief is absent. */
  fallbackRegimeLabel?: string | null;
  /** Device-local snapshot index (themeSnapshots.getTrackedThemes), for the
      change ledger's absence detection only. */
  previouslyTracked?:  TrackedTheme[];
  /** True when the caller has built the intelligence graph singleton this
      session; gates the evidence/prediction engine reads. */
  graphReady?:         boolean;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const section = <T>(status: ProfileStatus, data: T | null, note?: string): ProfileSection<T> =>
  ({ status, data, ...(note ? { note } : {}) });
const unavailable = <T>(note: string): ProfileSection<T> => section<T>("unavailable", null, note);

const VOICE_NOTE = "Summarizer voice: grounded phrasing only, never a source of numbers (Morning Brief v2 doc section 6).";

const voice = (text: string | null | undefined, missing: string): ProfileSection<VoiceVM> =>
  text && text.trim() ? section<VoiceVM>("partial", { text: text.trim() }, VOICE_NOTE) : unavailable<VoiceVM>(missing);

/* watch/driver derivations live in lib/intelligenceDeltas.ts (one logic home,
   shared with the change ledger); imported above. */

/* ------------------------------------------------------------------ *
 * buildMorningBrief
 * ------------------------------------------------------------------ */

/** Assemble the Morning Brief view model from injected data. Pure and
    deterministic for fixed inputs; degrades to "unavailable" sections, never
    to fabricated values. */
export function buildMorningBrief(inputs: MorningBriefInputs = {}): MorningBriefVM {
  const themes = inputs.themes ?? [];
  const brief = inputs.marketBrief ?? null;
  const graphReady = inputs.graphReady === true;

  /* -- regime -- */
  const regimeLabel = brief?.market_regime?.trim() || inputs.fallbackRegimeLabel?.trim() || null;
  const regime = regimeLabel
    ? section<RegimeVM>("live", {
        label: regimeLabel,
        status: inputs.regimeStatus ?? null,
        assetsImpacted: (brief?.assets_impacted ?? []).slice(0, 4),
      }, brief?.market_regime ? "Regime label phrased by the summarizer; day-over-day status tracked locally." : undefined)
    : unavailable<RegimeVM>("No regime read available yet.");

  /* -- the change ledger (Sprint B2): recorded memory only, never inferred
        from a single cycle. Server memory (attached ThemeMemory) is
        authoritative; device snapshots cover absence detection only. -- */
  const deltaResult = deriveMorningBriefDeltas({
    themes, previouslyTracked: inputs.previouslyTracked, graphReady,
  });
  const changes = !deltaResult.hadMemory
    ? unavailable<MorningBriefDelta[]>("First cycle: no cross-session memory to compare against yet.")
    : deltaResult.deltas.length === 0
      ? section<MorningBriefDelta[]>("partial", [], "Memory exists but recorded no material changes this cycle.")
      : section<MorningBriefDelta[]>(
          deltaResult.deltas.some(d => d.basis === "server") ? "live" : "partial",
          deltaResult.deltas,
          deltaResult.deltas.some(d => d.basis === "server") ? undefined : "Only device-local history was available for this read.");

  /* -- conviction: leading theme, decomposed. The summarizer's confidence
        number (MarketBrief.confidence) is deliberately never read here. -- */
  const leading = [...themes].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0] ?? null;
  let conviction: ProfileSection<ConvictionVM>;
  if (leading) {
    const value = Math.round(leading.confidence ?? 0);
    const mem = leading.memory ?? null;
    const parts = [
      `${leading.name} conviction ${value}${leading.confidence_label ? ` (${leading.confidence_label})` : ""}, computed by the theme pipeline from ${leading.evidence_count ?? 0} evidence item${(leading.evidence_count ?? 0) === 1 ? "" : "s"} across ${leading.contributing_story_count ?? 0} stor${(leading.contributing_story_count ?? 0) === 1 ? "y" : "ies"}.`,
    ];
    if (mem) parts.push(`Cross-session memory: ${mem.conviction_trend} (${mem.conviction_window_start} to ${mem.conviction_current} over recent sessions), ${mem.confirmations_today} confirmation${mem.confirmations_today === 1 ? "" : "s"} and ${mem.contradictions_today} contradiction${mem.contradictions_today === 1 ? "" : "s"} this cycle.`);
    if (graphReady) {
      const ev = evaluateEvidenceForNode(leading.name);
      if (ev.found && ev.verdict !== "insufficient_signal") parts.push(`Evidence engine verdict: ${ev.verdict} (trust ${ev.overallTrust}).`);
    }
    conviction = section("live", { value, themeName: leading.name, trend: mem?.conviction_trend ?? null, explanation: parts.join(" ") });
  } else {
    conviction = unavailable("No themes available to read conviction from.");
  }

  /* -- summarizer voice (rendered as today; demotion to v2 layout is B2/B3) -- */
  const whyToday = voice(brief?.narrative_shift, "No summarizer brief this cycle.");
  const primaryNarrative = voice(brief?.primary_driver, "No summarizer brief this cycle.");
  const tradeImplication = voice(brief?.trade_implication, "No summarizer brief this cycle.");

  /* -- opportunities: same selection the page used, now owned and testable -- */
  const opps = themes
    .filter(t => t.momentum_direction !== "bearish")
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 3)
    .map(t => ({ name: t.name, conviction: Math.round(t.confidence ?? 0), momentum: t.momentum_label ?? "stable" }));
  const opportunities = opps.length > 0
    ? section<OpportunityVM[]>("live", opps)
    : themes.length > 0
      ? section<OpportunityVM[]>("partial", [], "No directional opportunities identified.")
      : unavailable<OpportunityVM[]>("No themes available.");

  /* -- risks: summarizer scenario (voice) + data-derived theme risks + the
        prediction engine's explicit falsifier for the leading theme -- */
  const riskItems: RiskItemVM[] = [];
  if (brief?.risk_scenario?.trim()) riskItems.push({ kind: "scenario", text: brief.risk_scenario.trim(), source: "summarizer" });
  // Same selection predicate the page used inline, preserved exactly (B1 is
  // consolidation, not recalibration).
  for (const t of themes
    .filter(t => t.momentum_direction === "bearish" || (t.volatility_score ?? 0) > 0.55)
    .sort((a, b) => (b.volatility_score ?? 0) - (a.volatility_score ?? 0))
    .slice(0, 3)) {
    riskItems.push({ kind: "theme", text: t.name, source: t.momentum_direction === "bearish" ? "bearish momentum" : "elevated volatility" });
  }
  if (graphReady && leading) {
    const p = predictThemeTrajectory(leading.name);
    const inv = p.found ? p.invalidationConditions[0] : undefined;
    if (inv) riskItems.push({ kind: "invalidation", text: inv, source: leading.name });
  }
  const engineBacked = riskItems.some(r => r.kind !== "scenario");
  const risks = riskItems.length > 0
    ? section<RiskItemVM[]>(engineBacked ? "live" : "partial", riskItems,
        engineBacked ? undefined : "Only the summarizer scenario is available; no data-derived risks this cycle.")
    : themes.length > 0
      ? section<RiskItemVM[]>("partial", [], "No elevated risk signals.")
      : unavailable<RiskItemVM[]>("No themes available.");

  /* -- active themes -- */
  const activeThemes = themes.length > 0
    ? section<string[]>("live", themes.slice(0, 6).map(t => t.name))
    : unavailable<string[]>("No themes available.");

  /* -- watch: the honest replacement for the deleted hardcoded catalysts.
        Derived, dateless, per-theme. A real catalyst calendar is future work
        (v2 doc section 4.6) and is not simulated here. -- */
  const watchItems: WatchItemVM[] = [...themes]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 4)
    .map(t => ({ text: watchLineOf(t), theme: t.name, derived: true as const }));
  const watch = watchItems.length > 0
    ? section<WatchItemVM[]>("partial", watchItems, "Derived from stored theme drivers and direction; not a calendar. A real catalyst calendar requires the Event provider (v2 doc 4.6).")
    : unavailable<WatchItemVM[]>("No themes available to derive watch items from.");

  return {
    generatedAt: Date.now(),
    regime, changes, conviction, whyToday, primaryNarrative, opportunities, risks,
    tradeImplication, activeThemes, watch,
    counts: { activeThemes: themes.length, storyClusters: inputs.storyClusterCount ?? 0 },
  };
}
