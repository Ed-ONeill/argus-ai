/**
 * lib/intelligenceOwnership.ts - the concept ownership registry
 * (Phase 2.4 Intelligence Consistency, docs/ARGUS_INTELLIGENCE_EVERYWHERE_V1.md).
 *
 * ONE CONCEPT HAS ONE OWNER. Surfaces may select, rank, group, phrase, and
 * render intelligence; they may not independently determine meaning. This
 * module is documentation-oriented TypeScript: it exists so that "who owns
 * contradictions?" has a greppable, reviewable answer, and so new code that
 * introduces a second owner for a concept fails review against this table.
 *
 * Rules of use:
 *  - Before deriving ANY of the concepts below in a surface or component,
 *    consume the owner listed here instead. If the owner cannot answer the
 *    question, the capability is added to the owner (with tests) - never
 *    inlined in the surface (roadmap doc section 8).
 *  - Fallbacks: a stored-field derivation may stand in ONLY when the owning
 *    engine is unavailable (e.g. graph not provisioned), must be explicitly
 *    labeled as a fallback where rendered, and must never blend with the
 *    owner's output in the same render.
 *
 * Pure constants; no runtime logic. No em/en dashes.
 */

export type IntelligenceConcept =
  | "identity"
  | "thesis"
  | "narrative"
  | "conviction"
  | "evidence_verdict"
  | "contradictions"
  | "risks"
  | "invalidations"
  | "forward_view"
  | "deltas"
  | "evolution"
  | "transmission"
  | "beneficiaries"
  | "watch_items"
  | "catalysts"
  | "research_priority";

export interface ConceptOwnership {
  /** The single module (and export) that determines this concept's meaning. */
  owner: string;
  /** Sanctioned thin projections surfaces may read instead of the owner. */
  projections: string[];
  /** Explicitly labeled fallbacks permitted ONLY when the owner is unavailable. */
  fallbacks: string[];
  /** What surfaces may still do locally (selection/presentation only). */
  surfaceMay: string;
  notes?: string;
}

export const INTELLIGENCE_OWNERSHIP: Record<IntelligenceConcept, ConceptOwnership> = {
  identity: {
    owner: "intelligenceGraph (node identity/aliases) via intelligenceProfile.identity",
    projections: ["lib/entity.ts registry (display resolution)"],
    fallbacks: ["stored theme fields for entities not yet in the graph"],
    surfaceMay: "choose display names (cleanThemeName is cosmetic only)",
  },
  thesis: {
    owner: "theRead.buildTheRead().thesis (narrative mode) / narrativeDerivation.deriveNarratives",
    projections: [
      "marketsIntel.buildMarketsIntel (pass-through by reference)",
      "feedNarrative.buildMarketStoryVM (re-voicing, sentence 1 verbatim)",
      "intelligenceProfile.thesis (per-entity: injected headline + forward view)",
    ],
    fallbacks: ["strongest single theme labeled a THEME, never dressed as a narrative (theRead handles this itself)"],
    surfaceMay: "rephrase in surface voice; never derive a competing thesis",
  },
  narrative: {
    owner: "narrativeDerivation.deriveNarratives / findNarrativeForTheme",
    projections: ["theRead (Z2)", "feedNarrative"],
    fallbacks: [],
    surfaceMay: "select which derived narrative to feature",
  },
  conviction: {
    owner: "backend theme pipeline (ThemeIntelligence.confidence) + graph node.conviction",
    projections: ["marketsIntel.conviction (leading member, decomposed)", "profile.confidence (three numbers, never blended)"],
    fallbacks: [],
    surfaceMay: "round for display (convScore); NEVER render summarizer/brief confidence as canonical intelligence",
  },
  evidence_verdict: {
    owner: "evidenceEngine.evaluateEvidenceForNode",
    projections: ["profile.evidence", "theRead.evidence (Z3)"],
    fallbacks: ["story-citation-only rows when the graph is unavailable (labeled partial)"],
    surfaceMay: "select and order evidence rows",
  },
  contradictions: {
    owner: "evidenceEngine.detectContradictions / evaluateEvidenceForNode().contradictions",
    projections: ["profile.risks.contradictions", "theRead.falsifiers (Z7)", "riskRead.buildRiskRead"],
    fallbacks: [
      "themeIntelligence.detectContradictions (stored-field theme-vs-theme overlap) ONLY when the graph is unavailable, labeled STORED-FIELD READ",
    ],
    surfaceMay: "rank/group contradiction records; never invent conflict logic",
  },
  risks: {
    owner: "intelligenceProfile.risks (prediction invalidation + weakens edges + evidence contradictions)",
    projections: ["riskRead.buildRiskRead (drawer-friendly projection of profile.risks)"],
    fallbacks: ["stored second_order_effects / deriveKeyRisk line, labeled, when the graph is unavailable"],
    surfaceMay: "select which risks to show; phrase in surface voice",
  },
  invalidations: {
    owner: "predictionEngine.predictThemeTrajectory().invalidationConditions / predictCompanyTrajectory().invalidation",
    projections: ["profile.risks.invalidation", "theRead.falsifiers.invalidations", "riskRead"],
    fallbacks: ["themeIntelligence.generateInvalidationSignals (keyword templates) ONLY when the graph is unavailable, labeled"],
    surfaceMay: "select one invalidation to feature",
  },
  forward_view: {
    owner: "predictionEngine (theme/company/sector trajectory)",
    projections: ["profile.thesis.forward", "intelligenceShared.buildForecast (normalization; retires at P2.7/A4)"],
    fallbacks: [],
    surfaceMay: "format direction/probability; never compute a forward view from stored fields",
  },
  deltas: {
    owner: "intelligenceDeltas.deriveMorningBriefDeltas (+ deltasToSection, the ONE status policy)",
    projections: ["morningBrief.changes", "marketsIntel.changed (re-grouped, same records)"],
    fallbacks: [],
    surfaceMay: "re-group and re-voice ledger records; never re-derive change",
  },
  evolution: {
    owner: "server ThemeMemory (ThemeIntelligence.memory) + memoryEngine (device history)",
    projections: ["profile.evolution", "intelligenceShared.buildTimeline", "themeIntelligence.memorySentences (real recorded copy)"],
    fallbacks: [
      "themeEvolution.computeThemeEvolutionState is a CURRENT-STATE badge (single snapshot), never historical narrative",
    ],
    surfaceMay: "render evolution lines/badges; single-snapshot states must not claim temporality",
    notes: "themeSignalDelta's weekly-change narrative retired (Phase 2.4): one snapshot cannot narrate a week.",
  },
  transmission: {
    owner: "intelligenceGraph recorded edges, via causalMap/profile.transmission and theRead.chain (Z5)",
    projections: ["profile.transmission.strongestPath", "graph components"],
    fallbacks: [
      "themeTransmission.transmissionPath (stored-field driver/sector/tickers) ONLY when the graph is unavailable, labeled STORED-FIELD READ; never blended with graph chains in one render",
    ],
    surfaceMay: "select which recorded path to display",
  },
  beneficiaries: {
    owner: "intelligenceGraph downstream edges via profile.beneficiaries / DerivedNarrative.exposure",
    projections: ["theRead.exposure (Z4)"],
    fallbacks: [
      "themeBeneficiaries (memory ticker_sessions + stored related_assets: recorded facts; its securities-library tail is editorial debt, retires with D2/P2.5)",
    ],
    surfaceMay: "rank/slice exposure lists",
  },
  watch_items: {
    owner: "intelligenceDeltas.watchLineOf (derived, dateless) + profile.watch (falsifiers first)",
    projections: ["theRead.watch (Z6)", "themeTransmission.themeWatch (delegating wrapper)"],
    fallbacks: ["themeIntelligence.generateWatchSignals (keyword templates) ONLY when the graph is unavailable, labeled"],
    surfaceMay: "bind watch items to the zone they confirm; phrase in surface voice",
  },
  catalysts: {
    owner: "theRead verified catalysts (recorded MacroSeries/EconomicRelease nodes; verifiedCatalystsFor)",
    projections: ["theRead.catalysts (thesis-level)", "riskRead (per-entity)"],
    fallbacks: [],
    surfaceMay: "render VERIFIED / NO DATE chips",
    notes:
      "Vocabulary: watch item = derived, dateless condition; catalyst = verified event/series relationship; " +
      "DATED catalyst = unavailable until a real Event provider exists. The placeholder economic calendar " +
      "and generateNextCatalysts were deleted in Phase 2.4: indicative dates are fabrication, not intelligence.",
  },
  research_priority: {
    owner: "theRead.priorities (deterministic, decomposed, personalization = ordering only)",
    projections: [],
    fallbacks: [],
    surfaceMay: "render the ranking; never compute a competing attention score",
  },
};

/** Quick lookup helper for reviews/tests. */
export const ownerOf = (concept: IntelligenceConcept): string => INTELLIGENCE_OWNERSHIP[concept].owner;
