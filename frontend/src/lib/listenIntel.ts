/**
 * lib/listenIntel.ts - the Listen surface view model (Phase 2.4 Listen
 * unification, docs/ARGUS_INTELLIGENCE_EVERYWHERE_V1.md).
 *
 * Listen is the LONG-FORM EVIDENCE SURFACE: episodes are not intelligence,
 * they are evidence and interpretation ATTACHED to the shared objects Argus
 * already tracks. This builder is a pure projection over injected shared
 * intelligence:
 *
 *   narrative / members    <- The Read (the SAME DerivedNarrative thesis)
 *   what changed           <- the canonical change ledger, records VERBATIM
 *   contradictions / risks <- the shared risk read (lib/riskRead - the same
 *                             records Explorer and The Read show)
 *   why it matters         <- shared thesis line / ledger matters line /
 *                             backend causal narrative, source always named
 *   research overlap       <- The Read's research priorities (injected)
 *
 * Listen OWNS ONLY: matching, filtering, ranking, grouping, and phrasing WHY
 * AN EPISODE IS RELEVANT. It derives no market meaning.
 *
 * Evidence classification model (honest, never conflated):
 *   SUPPORTS    - a recorded graph edge of a supporting type (none are
 *                 emitted for podcasts today, so this only appears when the
 *                 adapters record one; a metadata match can NEVER produce it)
 *   CONTRADICTS - a recorded graph edge of a weakening/contradicting type
 *   MENTIONS    - a recorded "mentions" edge, or an entity-anchored metadata
 *                 match (inferred, labeled)
 *   CONTEXT     - a topic/keyword-only metadata match (inferred, labeled)
 *   UNCLEAR     - conflicting recorded signals
 * The "contrarian" section does NOT infer episode stance: it surfaces
 * episodes attached to themes that carry ACTIVE shared contradiction /
 * invalidation records, and shows those records verbatim.
 *
 * Pure module, relative imports only, exercised by intelligenceTests.ts
 * (87.x). No em/en dashes.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import type { Episode, ThemeIntelligence } from "./types";
import type { ProfileSection, ProfileStatus } from "./intelligenceProfile";
import type { RiskRead } from "./riskRead";
import type { MorningBriefDelta } from "./intelligenceDeltas";
import type { ReadVM, ResearchPriority } from "./theRead";
import { matchEpisodeThemesDetailed, type EpisodeThemeMatch } from "./listenIntelligence";

/* ------------------------------------------------------------------ *
 * Contract
 * ------------------------------------------------------------------ */

export type EpisodeRelation = "SUPPORTS" | "CONTRADICTS" | "MENTIONS" | "CONTEXT" | "UNCLEAR";
export type MatchBasis = "graph" | "metadata-entity" | "metadata-topic";

export interface EpisodeAttachment {
  /** Canonical engine entity key (raw theme name / ticker) - the same key
      Explorer and Intelligence Profiles resolve. */
  entityKey:    string;
  nodeType:     string;              // Theme | Company | ETF
  relation:     EpisodeRelation;
  basis:        MatchBasis;
  /** The recorded relationship type when basis is "graph". */
  relationship: string | null;
}

export interface ListenEpisodeVM {
  episode:      Episode;
  attachments:  EpisodeAttachment[];
  /** Canonical name of the strongest matched theme (engine key). */
  primaryTheme: string | null;
  /** Derived-narrative membership of the primary theme (shared derivation). */
  narrative:    string | null;
  /** Why it matters - ALWAYS a shared object, source named. Null when no
      shared object answers it (the card falls back to relevance phrasing,
      which is presentation, not meaning). */
  whyMatters:   string | null;
  whySource:    "narrative-thesis" | "ledger" | "theme-narrative-field" | null;
  /** Strong recorded relationship vs metadata-level match. */
  evidenceTier: "recorded" | "metadata" | null;
  /** The canonical ledger record touching the primary theme, VERBATIM. */
  changed:      MorningBriefDelta | null;
  /** Shared contradiction/invalidation records on the primary theme (riskRead,
      verbatim) - what makes an episode belong in the contrarian section. */
  contradictions: Array<{ detail: string; severity: number }>;
  invalidation:  string | null;
  /** Personalization annotation: ordering only, never classification. */
  forYou:       boolean;
  priority:     ResearchPriority | null;
}

export interface ListenIntelInputs {
  episodes?:           Episode[];
  themes?:             ThemeIntelligence[];
  /** The shared Read (dominant narrative + members). */
  read?:               ReadVM | null;
  /** Shared per-theme risk reads, keyed by lower-cased canonical theme name. */
  risks?:              Map<string, RiskRead>;
  /** The canonical change ledger, canonical order. */
  deltas?:             MorningBriefDelta[];
  /** Derived-narrative membership resolver (findNarrativeForTheme). */
  narrativeOf?:        (themeName: string) => { label: string } | null;
  researchPriorities?: ResearchPriority[];
  /** Personalization inputs - affect section D inclusion and ordering ONLY. */
  followedThemeNames?: string[];
  savedEntityIds?:     string[];
  graphReady?:         boolean;
}

export interface ListenIntelVM {
  /** A - episodes connected to the dominant narrative and its members. */
  relevantToRead: ProfileSection<ListenEpisodeVM[]>;
  /** B - episodes on themes with a canonical ledger record this cycle. */
  newEvidence:    ProfileSection<ListenEpisodeVM[]>;
  /** C - episodes on themes carrying active shared contradictions/invalidations. */
  contrarian:     ProfileSection<ListenEpisodeVM[]>;
  /** D - episodes overlapping the user's followed/saved/priority set. */
  forYourWatch:   ProfileSection<ListenEpisodeVM[]>;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const section = <T>(status: ProfileStatus, data: T | null, note?: string): ProfileSection<T> =>
  ({ status, data, ...(note ? { note } : {}) });

const NEG_REL_RE = /weaken|contradict|revers|disrupt|pressur|risk/i;
const SUP_REL_RE = /support|confirm|drive|strengthen|benefit/i;

function relationOfEdge(relationshipType: string): EpisodeRelation {
  if (NEG_REL_RE.test(relationshipType)) return "CONTRADICTS";
  if (SUP_REL_RE.test(relationshipType)) return "SUPPORTS";
  return "MENTIONS";
}

/** Recorded graph attachments for one episode: the Podcast node's edges to
    Companies/ETFs AND Themes (D14 fixed in P2.7: the adapter records only
    THIS episode's matched themes, so Podcast->Theme edges carry real
    per-episode signal). */
function graphAttachments(ep: Episode): EpisodeAttachment[] {
  const node = G.getNode(ep.id) ?? G.getNode(ep.title);
  if (!node) return [];
  const out: EpisodeAttachment[] = [];
  const seen = new Set<string>();
  for (const { node: n, edge } of G.getNeighbors(node.id)) {
    const ty = String(n.type);
    if (ty !== "Company" && ty !== "ETF" && ty !== "Theme" && ty !== "Narrative") continue;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push({
      entityKey: n.label, nodeType: ty,
      relation: relationOfEdge(edge.relationshipType),
      basis: "graph", relationship: edge.relationshipType,
    });
  }
  return out;
}

function metadataAttachments(matches: EpisodeThemeMatch[]): EpisodeAttachment[] {
  return matches.map(m => ({
    entityKey: m.theme.name, nodeType: "Theme",
    // A metadata match can NEVER be SUPPORTS: entity-anchored = MENTIONS,
    // keyword/topic-only = CONTEXT (tests pin this).
    relation: m.directEntityMatch ? "MENTIONS" as const : "CONTEXT" as const,
    basis: m.directEntityMatch ? "metadata-entity" as const : "metadata-topic" as const,
    relationship: null,
  }));
}

const publishedMs = (ep: Episode): number => {
  const t = Date.parse(ep.published_at ?? "");
  return Number.isFinite(t) ? t : 0;
};

/* ------------------------------------------------------------------ *
 * buildListenIntel
 * ------------------------------------------------------------------ */

export function buildListenIntel(inputs: ListenIntelInputs = {}): ListenIntelVM {
  const episodes = inputs.episodes ?? [];
  const themes = inputs.themes ?? [];
  const read = inputs.read ?? null;
  const risks = inputs.risks ?? new Map<string, RiskRead>();
  const deltas = inputs.deltas ?? [];
  const priorities = inputs.researchPriorities ?? [];
  const graphReady = inputs.graphReady === true;
  const followed = new Set((inputs.followedThemeNames ?? []).map(s => s.toLowerCase()));
  const savedIds = new Set((inputs.savedEntityIds ?? []).map(s => s.toLowerCase()));

  if (episodes.length === 0) {
    const missing = "No episodes available yet.";
    return {
      relevantToRead: section<ListenEpisodeVM[]>("unavailable", null, missing),
      newEvidence: section<ListenEpisodeVM[]>("unavailable", null, missing),
      contrarian: section<ListenEpisodeVM[]>("unavailable", null, missing),
      forYourWatch: section<ListenEpisodeVM[]>("unavailable", null, missing),
    };
  }

  const memberNames = new Set((read?.thesis.data?.members ?? []).map(m => m.name.toLowerCase()));
  const thesisLine = read?.thesis.data?.thesisLine ?? null;
  const deltaByEntity = new Map<string, MorningBriefDelta>();
  for (const d of deltas) {
    const k = d.entity.toLowerCase();
    if (!deltaByEntity.has(k)) deltaByEntity.set(k, d);
  }

  /* -- attach every episode to shared objects (one pass) -- */
  const vms: ListenEpisodeVM[] = episodes.map(ep => {
    const matches = matchEpisodeThemesDetailed(ep, themes, 2);
    const meta = metadataAttachments(matches);
    const graph = graphReady ? graphAttachments(ep) : [];
    const attachments = [...graph, ...meta];

    const primary = matches[0]?.theme ?? null;
    const primaryKey = primary?.name ?? null;
    const risk = primaryKey ? risks.get(primaryKey.toLowerCase()) ?? null : null;
    const changed = primaryKey ? deltaByEntity.get(primaryKey.toLowerCase()) ?? null : null;

    /* -- why it matters: shared objects only, source named -- */
    let whyMatters: string | null = null;
    let whySource: ListenEpisodeVM["whySource"] = null;
    if (primaryKey && memberNames.has(primaryKey.toLowerCase()) && thesisLine) {
      whyMatters = thesisLine;                       // the SAME thesis The Read shows
      whySource = "narrative-thesis";
    } else if (changed) {
      whyMatters = changed.matters;                  // the ledger's own answer, verbatim
      whySource = "ledger";
    } else if (primary?.causal_narrative) {
      const c = primary.causal_narrative.replace(/→/g, ", ").replace(/ {2,}/g, " ").trim();
      const dot = c.indexOf(". ");
      const s1 = dot > 12 ? c.slice(0, dot + 1) : c.length <= 180 ? c : null;
      if (s1) { whyMatters = s1; whySource = "theme-narrative-field"; }
    }

    const forYou =
      (primaryKey !== null && followed.has(primaryKey.toLowerCase())) ||
      attachments.some(a => savedIds.has(a.entityKey.toLowerCase())) ||
      (primaryKey !== null && priorities.some(p => p.entity.label.toLowerCase() === primaryKey!.toLowerCase()));

    return {
      episode: ep,
      attachments,
      primaryTheme: primaryKey,
      narrative: primaryKey ? inputs.narrativeOf?.(primaryKey)?.label ?? null : null,
      whyMatters, whySource,
      evidenceTier: graph.length > 0 ? "recorded" as const : attachments.length > 0 ? "metadata" as const : null,
      changed,
      contradictions: risk ? risk.contradictions : [],
      invalidation: risk?.invalidation ?? null,
      forYou,
      priority: primaryKey ? priorities.find(p => p.entity.label.toLowerCase() === primaryKey!.toLowerCase()) ?? null : null,
    };
  });

  /* -- surface-owned ranking: recorded evidence first, then relevance +
        recency. Personalization (forYou) boosts ORDERING only - it never
        touches attachments, relations, or any intelligence value. -- */
  const rank = (a: ListenEpisodeVM, b: ListenEpisodeVM, personalized: boolean): number =>
    ((b.evidenceTier === "recorded" ? 1 : 0) - (a.evidenceTier === "recorded" ? 1 : 0)) ||
    (personalized ? (b.forYou ? 1 : 0) - (a.forYou ? 1 : 0) : 0) ||
    ((b.episode.relevance_score ?? 0) - (a.episode.relevance_score ?? 0)) ||
    (publishedMs(b.episode) - publishedMs(a.episode));

  const pick = (xs: ListenEpisodeVM[], personalized = false, max = 6): ListenEpisodeVM[] =>
    [...xs].sort((a, b) => rank(a, b, personalized)).slice(0, max);

  /* -- A: connected to the dominant narrative and its member themes -- */
  const aPool = vms.filter(v => v.primaryTheme !== null && memberNames.has(v.primaryTheme.toLowerCase()));
  const relevantToRead = !read || !read.thesis.data
    ? section<ListenEpisodeVM[]>("unavailable", null, "No shared Read available yet.")
    : aPool.length > 0
      ? section("live", pick(aPool))
      : section<ListenEpisodeVM[]>("partial", [], "No episodes match the dominant narrative's member themes this cycle.");

  /* -- B: episodes on themes the canonical ledger recorded this cycle -- */
  const bPool = vms.filter(v => v.changed !== null);
  const newEvidence = deltas.length === 0
    ? section<ListenEpisodeVM[]>("unavailable", null, "No canonical ledger records this cycle (or no cross-session memory yet).")
    : bPool.length > 0
      ? section("live", pick(bPool))
      : section<ListenEpisodeVM[]>("partial", [], "The ledger recorded changes, but no episodes match the changed themes.");

  /* -- C: episodes on themes carrying ACTIVE shared contradiction /
        invalidation records (the records render verbatim; episode stance is
        never inferred) -- */
  const cPool = vms.filter(v => v.contradictions.length > 0 || v.invalidation !== null);
  const contrarian = !graphReady
    ? section<ListenEpisodeVM[]>("unavailable", null, "Contradiction reads need the intelligence graph.")
    : cPool.length > 0
      ? section("live", pick(cPool))
      : section<ListenEpisodeVM[]>("partial", [], "No monitored theme carries an active contradiction or invalidation record.");

  /* -- D: the user's watch (followed themes, saved entities, priorities).
        Inclusion here is personalization; the underlying facts on each
        episode are identical to the other sections. -- */
  const dPool = vms.filter(v => v.forYou);
  const forYourWatch = (inputs.followedThemeNames ?? []).length + (inputs.savedEntityIds ?? []).length === 0
    ? section<ListenEpisodeVM[]>("unavailable", null, "Follow themes or save entities to build a listening watch.")
    : dPool.length > 0
      ? section("live", pick(dPool, true))
      : section<ListenEpisodeVM[]>("partial", [], "No episodes overlap your followed themes or saved entities this cycle.");

  return { relevantToRead, newEvidence, contrarian, forYourWatch };
}
