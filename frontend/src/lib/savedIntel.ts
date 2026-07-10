/**
 * lib/savedIntel.ts - the Saved surface view model (Phase 2.1 Saved
 * unification, docs/ARGUS_INTELLIGENCE_EVERYWHERE_V1.md).
 *
 * Saved is the user's STANDING INTELLIGENCE WATCH: "what am I monitoring,
 * and what changed since I last checked?" This builder is a pure projection
 * of injected SHARED intelligence:
 *
 *   conviction       <- theme pipeline confidence / profile node conviction
 *   status / trend   <- server ThemeMemory / evidence verdict
 *   what changed     <- the canonical change ledger (intelligenceDeltas),
 *                       records passed through VERBATIM - no Saved-specific
 *                       wording or thresholds, ever
 *   risk / watch     <- the shared risk read (lib/riskRead - the same records
 *                       Explorer, the drawers, and the Morning Brief show)
 *   narrative        <- derived-narrative membership (injected resolver)
 *   research overlap <- The Read's research priorities (injected)
 *
 * Saved OWNS ONLY: the user's selection, grouping/ordering, and presentation.
 * It computes no intelligence. Personalization doctrine: saving an item
 * affects inclusion and ordering only - every intelligence value on a saved
 * item is identical to what any other surface shows for the same entity
 * (pinned by tests 86.x).
 *
 * Pure module, relative imports only, injected data, exercised by
 * intelligenceTests.ts (86.x). No em/en dashes.
 */

import type { ThemeIntelligence } from "./types";
import type { IntelligenceProfile, ProfileSection, ProfileStatus } from "./intelligenceProfile";
import type { RiskRead } from "./riskRead";
import type { MorningBriefDelta } from "./intelligenceDeltas";
import type { ResearchPriority } from "./theRead";

/* ------------------------------------------------------------------ *
 * Contract
 * ------------------------------------------------------------------ */

export type SavedItemKind = "company" | "etf" | "theme" | "sector" | "narrative" | "story";

/** One monitored object, as the user-state stores hold it. */
export interface SavedEntityInput {
  /** Storage id (ticker, theme id, sector name). */
  id:      string;
  /** Display label; for themes this may be the cleaned public name. */
  label:   string;
  kind:    SavedItemKind;
  savedAt?: string | null;
}

export interface SavedIntelInputs {
  /** Watched entities (tickers/sectors) from the user's watchlist store. */
  savedEntities?:      SavedEntityInput[];
  /** Followed/watched themes from the user's follow stores. */
  followedThemes?:     SavedEntityInput[];
  /** Canonical theme set (to resolve followed ids to live themes). */
  themes?:             ThemeIntelligence[];
  /** Injected shared profiles, keyed by lower-cased engine label. */
  profiles?:           Map<string, IntelligenceProfile>;
  /** Injected shared risk reads (lib/riskRead), same keying. */
  risks?:              Map<string, RiskRead>;
  /** The canonical change ledger, in its canonical order. */
  deltas?:             MorningBriefDelta[];
  /** intelligenceDeltas' hadMemory flag (honest first-cycle state). */
  hadMemory?:          boolean;
  /** Derived-narrative membership resolver (findNarrativeForTheme). */
  narrativeOf?:        (themeName: string) => { label: string } | null;
  /** The Read's research priorities (personalized ordering upstream is fine;
      the underlying facts are identical for every user). */
  researchPriorities?: ResearchPriority[];
  graphReady?:         boolean;
}

export interface SavedItemVM {
  key:      string;             // stable identity for rendering
  label:    string;             // display label
  /** The engine entity key this item resolves through (raw theme name /
      ticker); what the page routes into Explorer. */
  entityKey: string;
  kind:     SavedItemKind;
  /** Graph node type for Explorer routing (page maps to an href). */
  nodeType: string;
  savedAt:  string | null;
  /** Theme present in today's cycle / entity resolved by the shared engines. */
  live:     boolean;
  /** Backend pipeline conviction (themes) or graph profile conviction. */
  conviction:      number | null;
  convictionBasis: "theme pipeline" | "graph profile" | null;
  /** ThemeMemory status (themes) or evidence verdict (profile entities). */
  status:   string | null;
  trend:    "rising" | "falling" | "stable" | null;
  /** The canonical ledger record touching this entity, VERBATIM. */
  latestChange: MorningBriefDelta | null;
  /** Strongest shared risk: prediction invalidation, else top contradiction. */
  risk:     string | null;
  /** Next watch condition from the shared risk read. */
  watch:    string | null;
  /** Derived-narrative membership label. */
  narrative: string | null;
  lastUpdated: string | null;
  /** Research-priority overlap (The Read's ranking), when this entity ranks. */
  priority: ResearchPriority | null;
}

export interface SavedSummary {
  monitored:     number;
  changed:       number;    // monitored entities with a ledger record this cycle
  contradicted:  string[];  // labels with CONTRADICTED records
  strengthening: string[];  // labels with STRENGTHENED records
  weakening:     string[];  // labels with WEAKENED records
  /** High-priority research items that overlap the monitored set. */
  priorities:    ResearchPriority[];
}

export interface SavedIntelVM {
  items:   ProfileSection<SavedItemVM[]>;
  summary: ProfileSection<SavedSummary>;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const KIND_NODE_TYPE: Record<SavedItemKind, string> = {
  company: "Company", etf: "ETF", theme: "Theme", sector: "Sector", narrative: "Theme", story: "Story",
};

const section = <T>(status: ProfileStatus, data: T | null, note?: string): ProfileSection<T> =>
  ({ status, data, ...(note ? { note } : {}) });

/* ------------------------------------------------------------------ *
 * buildSavedIntel
 * ------------------------------------------------------------------ */

/**
 * Assemble the Saved view model. Pure selection over injected shared
 * intelligence: filters the ledger/priorities to the monitored set, annotates
 * each item with the shared per-entity reads, and ranks - canonical ledger
 * order first (changes lead), then research priority, then label. Nothing is
 * computed; missing data degrades to nulls, never defaults.
 */
export function buildSavedIntel(inputs: SavedIntelInputs = {}): SavedIntelVM {
  const themes = inputs.themes ?? [];
  const deltas = inputs.deltas ?? [];
  const profiles = inputs.profiles ?? new Map<string, IntelligenceProfile>();
  const risks = inputs.risks ?? new Map<string, RiskRead>();
  const priorities = inputs.researchPriorities ?? [];
  const graphReady = inputs.graphReady === true;

  const themeById = new Map(themes.map(t => [t.id, t]));
  const themeByName = new Map(themes.map(t => [t.name.toLowerCase(), t]));
  const ledgerIndexOf = (label: string): number => {
    const i = deltas.findIndex(d => d.entity.toLowerCase() === label.toLowerCase());
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };

  /* -- merge the monitored set (selection only), deduped by engine label -- */
  const merged: SavedEntityInput[] = [...(inputs.followedThemes ?? []), ...(inputs.savedEntities ?? [])];
  const seen = new Set<string>();
  const items: Array<SavedItemVM & { _ledgerIdx: number }> = [];

  for (const e of merged) {
    // Resolve the engine entity: followed themes resolve by id to today's
    // canonical theme (its raw name is the engine key); everything else keys
    // on its stored label.
    const liveTheme = e.kind === "theme" || e.kind === "narrative"
      ? themeById.get(e.id) ?? themeByName.get(e.label.toLowerCase()) ?? null
      : null;
    const entityKey = liveTheme?.name ?? e.label;
    const dedupe = entityKey.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const profile = profiles.get(dedupe) ?? null;
    const risk = risks.get(dedupe) ?? null;
    const profileFound = !!profile && profile.identity.status !== "unavailable";

    const conviction = liveTheme
      ? Math.round(liveTheme.confidence ?? 0)
      : profileFound ? (profile!.confidence.data?.conviction ?? null) : null;
    const convictionBasis: SavedItemVM["convictionBasis"] =
      liveTheme ? "theme pipeline" : conviction !== null ? "graph profile" : null;

    const ledgerIdx = ledgerIndexOf(entityKey);
    const latestChange = Number.isFinite(ledgerIdx) ? deltas[ledgerIdx] : null;

    const priority = priorities.find(p => p.entity.label.toLowerCase() === dedupe) ?? null;

    items.push({
      key: `${e.kind}:${e.id}`,
      label: e.label,
      entityKey,
      kind: e.kind,
      nodeType: KIND_NODE_TYPE[e.kind],
      savedAt: e.savedAt ?? null,
      live: liveTheme !== null || profileFound,
      conviction,
      convictionBasis,
      status: liveTheme?.memory?.status ?? (profileFound ? profile!.evidence.data?.verdict ?? null : null),
      trend: liveTheme?.memory?.conviction_trend ?? null,
      latestChange,
      risk: risk ? (risk.invalidation ?? risk.contradictions[0]?.detail ?? null) : null,
      watch: risk?.watchItems[0] ?? null,
      narrative: inputs.narrativeOf?.(entityKey)?.label ?? null,
      lastUpdated: liveTheme?.last_updated || null,
      priority,
      _ledgerIdx: ledgerIdx,
    });
  }

  /* -- ranking (surface-owned ORDERING only): canonical ledger order first,
        then research-priority score, then label -- */
  items.sort((a, b) =>
    (a._ledgerIdx - b._ledgerIdx) ||
    ((b.priority?.score ?? -1) - (a.priority?.score ?? -1)) ||
    a.label.localeCompare(b.label));
  const ranked: SavedItemVM[] = items.map(({ _ledgerIdx: _drop, ...rest }) => rest);

  const itemsSection: ProfileSection<SavedItemVM[]> = ranked.length === 0
    ? section<SavedItemVM[]>("unavailable", null, "Nothing monitored yet. Follow themes or watch entities to build a standing watch.")
    : graphReady
      ? section("live", ranked)
      : section("partial", ranked, "Intelligence graph not provisioned; showing pipeline and memory reads only.");

  /* -- standing-watch summary: a projection of the ledger + priorities
        restricted to the monitored set - not a scoring engine -- */
  let summary: ProfileSection<SavedSummary>;
  if (ranked.length === 0) {
    summary = section<SavedSummary>("unavailable", null, "Nothing monitored yet.");
  } else {
    const monitoredKeys = new Set(ranked.map(i => i.entityKey.toLowerCase()));
    const byKind = (kind: MorningBriefDelta["kind"]): string[] =>
      deltas.filter(d => d.kind === kind && monitoredKeys.has(d.entity.toLowerCase())).map(d => d.entity);
    const data: SavedSummary = {
      monitored: ranked.length,
      changed: ranked.filter(i => i.latestChange !== null).length,
      contradicted: byKind("CONTRADICTED"),
      strengthening: byKind("STRENGTHENED"),
      weakening: byKind("WEAKENED"),
      priorities: priorities.filter(p => monitoredKeys.has(p.entity.label.toLowerCase())).slice(0, 3),
    };
    summary = inputs.hadMemory === false
      ? section("partial", data, "First cycle: no cross-session memory to compare against yet.")
      : data.changed === 0
        ? section("partial", data, "Memory exists but recorded no material changes to the monitored set this cycle.")
        : section("live", data);
  }

  return { items: itemsSection, summary };
}
