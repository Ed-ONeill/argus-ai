/**
 * lib/narrativeDerivation.ts - the Narrative Derivation Engine (System 2, v1).
 *
 * Derives EPHEMERAL narrative groupings over existing themes, drivers, and
 * exposures, per docs/ARGUS_NARRATIVE_ENGINE_V1.md and the model doc's section
 * 4 recommendation ("derived, not stored"). Vocabulary, to avoid the existing
 * collision:
 *
 *   Theme            = backend-emitted, evidence-bearing intelligence unit
 *   narrativeTransmission.ts = ONE theme's transmission path (unchanged)
 *   DerivedNarrative = a computed grouping of MULTIPLE themes sharing a driver
 *                      set (this module); never stored, never persisted
 *   Narrative (stored entity) = future only; not created here
 *
 * Hard rules encoded in this module:
 *  - Read-only: never creates nodes, edges, or storage of any kind. Every call
 *    re-derives from the current graph; output is a projection (invariant I5).
 *  - Keys are driver-set derived (sorted canonical driver node ids), so a
 *    narrative's identity survives theme renames - the continuity weakness of
 *    name-keyed theme memory the model doc calls out.
 *  - No narrative-level confidence, lifecycle, velocity, acceleration,
 *    forecast, or analogs: those need data that does not exist yet and would
 *    be fabrication (I1). Member-level reads are listed side by side instead.
 *  - No double counting: shared exposures are deduped by node id with a member
 *    count, and evidence pages are a distinct union - member evidence is never
 *    summed into a narrative total.
 *  - Sections reuse the IntelligenceProfile status wrapper so consumers must
 *    branch on status and can never mistake absence for a value.
 *
 * NOT wired into any surface (additive, contract + v0 assembler only). Pure
 * module, relative imports only, exercised by intelligenceTests.ts (77.x).
 * No em/en dashes.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import type { IntelNode, IntelEdge } from "./intelligenceGraph";
import { causalLayerOfType, deriveEdgeTrend, type EdgeTrend } from "./causalMap";
import { evaluateEvidenceForNode, type EvidenceVerdict } from "./evidenceEngine";
import { predictThemeTrajectory } from "./predictionEngine";
import type { ProfileSection, ProfileStatus } from "./intelligenceProfile";
import { num, round, avg, uniq } from "./intelligenceUtils";

/* ------------------------------------------------------------------ *
 * Contract
 * ------------------------------------------------------------------ */

export const DERIVED_NARRATIVE_VERSION = 1 as const;

export interface NarrativeDriver {
  id:       string;
  label:    string;
  nodeType: string;
}

export interface MemberDriverLink {
  driverId:     string;
  relationship: string;
  strength:     number;
  confidence:   number;
  trend:        EdgeTrend;
}

export interface NarrativeMember {
  id:          string;
  label:       string;
  nodeType:    string;
  /** The member's recorded links into this narrative's driver set (real edges). */
  driverLinks: MemberDriverLink[];
}

export interface SharedExposureItem {
  id:          string;
  label:       string;
  nodeType:    string;
  /** How many member themes expose this entity. Dedupe replaces double counting:
      an asset exposed by three members appears once, with memberCount 3. */
  memberCount: number;
  maxStrength: number;
}

export interface NarrativeExposure {
  sectors: SharedExposureItem[];
  assets:  SharedExposureItem[];
}

export interface MemberEvidenceRead {
  themeId:            string;
  themeLabel:         string;
  verdict:            EvidenceVerdict;
  trust:              number;
  contradictionCount: number;
  evidenceCount:      number;   // this member's own count; never summed across members
}

export interface NarrativeEvidence {
  /** Per-member evidence engine reads, listed side by side. There is NO
      aggregate trust or total evidence count by design: blending would launder
      confidence, and summing would double-count shared stories. */
  perMember:     MemberEvidenceRead[];
  /** Distinct originating pages across all member theme edges (a union, so a
      page shared by every member is counted once). */
  distinctPages: string[];
}

export interface MemberForwardRead {
  themeId:      string;
  themeLabel:   string;
  direction:    string;
  probability:  number;
  confidence:   number;
  timeframe:    string | null;
  invalidation: string | null;
}

export interface NarrativeCoherence {
  /** Deterministic structural-similarity score, 0..100. A geometry measure of
      how tightly the members hang together - explicitly NOT a confidence. */
  score:                number;
  sharedDriverStrength: number;         // avg member->driver edge strength
  assetOverlap:         number | null;  // avg pairwise Jaccard of member asset sets, 0..100
  sectorOverlap:        number | null;  // same for sectors
  explanation:          string;         // the decomposition, in plain language (I4)
}

export interface DerivedNarrative {
  version:     typeof DERIVED_NARRATIVE_VERSION;
  /** Deterministic driver-set key: sorted canonical driver node ids joined by
      "+". Stable across theme renames while the driver set is unchanged. */
  key:         string;
  /** Template label from real driver labels (data, not prose). Consumers voice it. */
  label:       string;
  /** Constant marker so no consumer can present this with sourced-entity authority. */
  derived:     true;
  generatedAt: number;
  driverSet:   ProfileSection<NarrativeDriver[]>;
  members:     ProfileSection<NarrativeMember[]>;
  exposure:    ProfileSection<NarrativeExposure>;
  evidence:    ProfileSection<NarrativeEvidence>;
  forward:     ProfileSection<MemberForwardRead[]>;
  coherence:   ProfileSection<NarrativeCoherence>;
  // Deliberately absent (future work; fabrication today): confidence, lifecycle,
  // velocity, acceleration, narrative-level forecast, history, analogs.
}

export interface DeriveNarrativeOptions {
  /** Minimum themes sharing a driver set to constitute a narrative. Default 2:
      a single theme is a theme, not a narrative. */
  minMembers?:    number;
  maxNarratives?: number;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const section = <T>(status: ProfileStatus, data: T | null, note?: string): ProfileSection<T> =>
  ({ status, data, ...(note ? { note } : {}) });
const unavailable = <T>(note: string): ProfileSection<T> => section<T>("unavailable", null, note);

/** Deterministic narrative key for a set of canonical driver node ids. */
export const narrativeKeyOfDrivers = (driverIds: string[]): string => [...driverIds].sort().join("+");

const isDriver = (n: IntelNode): boolean => causalLayerOfType(String(n.type)) === 0;
const layerOf  = (n: IntelNode): number  => causalLayerOfType(String(n.type));

/* ------------------------------------------------------------------ *
 * deriveNarratives - the v0 assembler
 * ------------------------------------------------------------------ */

/**
 * Derive the current narrative groupings from the graph: themes are grouped by
 * the layer-0 drivers they share; driver groups with identical member sets are
 * merged into one narrative keyed by the combined driver set (so "AI Capex +
 * Power Prices" is one narrative, not two duplicates). Read-only, deterministic
 * for a fixed graph, never throws; an empty or driverless graph returns [].
 */
export function deriveNarratives(opts: DeriveNarrativeOptions = {}): DerivedNarrative[] {
  const minMembers = Math.max(2, opts.minMembers ?? 2);
  const maxNarratives = opts.maxNarratives ?? 12;

  // Theme-shaped nodes. Narrative-typed nodes are deliberately treated as
  // themes everywhere today (model doc section 4); the same holds here.
  const themes = [...G.nodesOfType("Theme"), ...G.nodesOfType("Narrative")]
    .sort((a, b) => a.id.localeCompare(b.id));
  if (themes.length === 0) return [];

  // Each theme's recorded links to layer-0 drivers (real edges, either direction).
  const driverLinks = new Map<string, Array<{ driver: IntelNode; edge: IntelEdge; theme: IntelNode }>>();
  const driverMembers = new Map<string, Set<string>>();
  const themeById = new Map(themes.map(t => [t.id, t]));
  for (const t of themes) {
    for (const { node, edge } of G.getNeighbors(t.id)) {
      if (!isDriver(node)) continue;
      (driverLinks.get(node.id) ?? driverLinks.set(node.id, []).get(node.id)!).push({ driver: node, edge, theme: t });
      (driverMembers.get(node.id) ?? driverMembers.set(node.id, new Set()).get(node.id)!).add(t.id);
    }
  }

  // Group: driver -> member set; merge drivers whose member sets are identical.
  const groups = new Map<string, string[]>(); // memberSignature -> driverIds
  for (const driverId of [...driverMembers.keys()].sort()) {
    const members = driverMembers.get(driverId)!;
    if (members.size < minMembers) continue;
    const sig = [...members].sort().join("|");
    (groups.get(sig) ?? groups.set(sig, []).get(sig)!).push(driverId);
  }

  const narratives: DerivedNarrative[] = [];
  for (const [sig, driverIds] of groups) {
    const memberIds = sig.split("|");
    narratives.push(assembleNarrative(driverIds.sort(), memberIds, themeById, driverLinks));
  }

  // Deterministic ranking: breadth first, then structural tightness, then key.
  narratives.sort((a, b) =>
    ((b.members.data?.length ?? 0) - (a.members.data?.length ?? 0)) ||
    ((b.coherence.data?.score ?? 0) - (a.coherence.data?.score ?? 0)) ||
    a.key.localeCompare(b.key));
  return narratives.slice(0, maxNarratives);
}

/** The derived narrative containing a given theme (or theme-resolving key), if any. */
export function findNarrativeForTheme(themeKey: string, opts: DeriveNarrativeOptions = {}): DerivedNarrative | null {
  const node = G.getNode(themeKey);
  if (!node) return null;
  return deriveNarratives(opts).find(n => (n.members.data ?? []).some(m => m.id === node.id)) ?? null;
}

/* ------------------------------------------------------------------ *
 * Assembly (pure reads; every field traces to graph data or an engine)
 * ------------------------------------------------------------------ */

function assembleNarrative(
  driverIds: string[],
  memberIds: string[],
  themeById: Map<string, IntelNode>,
  driverLinks: Map<string, Array<{ driver: IntelNode; edge: IntelEdge; theme: IntelNode }>>,
): DerivedNarrative {
  const key = narrativeKeyOfDrivers(driverIds);
  const driverNodes = driverIds.map(id => G.getNode(id)!).filter(Boolean);
  const label = driverNodes.map(d => d.label).join(" + ");

  const driverSet = section<NarrativeDriver[]>("live",
    driverNodes.map(d => ({ id: d.id, label: d.label, nodeType: String(d.type) })));

  /* -- members with their real driver edges -- */
  const members: NarrativeMember[] = memberIds.map(id => {
    const t = themeById.get(id)!;
    const links: MemberDriverLink[] = [];
    for (const driverId of driverIds) {
      const hit = (driverLinks.get(driverId) ?? []).find(x => x.theme.id === id);
      if (!hit) continue;
      links.push({
        driverId,
        relationship: hit.edge.relationshipType,
        strength: round(num(hit.edge.strength)),
        confidence: round(num(hit.edge.confidence)),
        trend: deriveEdgeTrend(hit.edge, hit.driver, t),
      });
    }
    return { id: t.id, label: t.label, nodeType: String(t.type), driverLinks: links };
  });
  const membersSection = section<NarrativeMember[]>("live", members);

  /* -- shared exposure: downstream sectors and tradeables, deduped by node id.
        The dedupe IS the double-counting fix: a company exposed through three
        member themes appears once with memberCount 3, not three times. -- */
  const sectorMap = new Map<string, SharedExposureItem>();
  const assetMap = new Map<string, SharedExposureItem>();
  const assetSets = new Map<string, Set<string>>();   // memberId -> asset ids (for coherence)
  const sectorSets = new Map<string, Set<string>>();
  for (const m of members) {
    const aSet = new Set<string>(), sSet = new Set<string>();
    for (const { node, edge } of G.getNeighbors(m.id)) {
      const layer = layerOf(node);
      const target = layer === 2 ? sectorMap : layer === 3 ? assetMap : null;
      if (!target) continue;
      (layer === 2 ? sSet : aSet).add(node.id);
      const prev = target.get(node.id);
      if (prev) {
        prev.memberCount += 1;
        prev.maxStrength = Math.max(prev.maxStrength, round(num(edge.strength)));
      } else {
        target.set(node.id, { id: node.id, label: node.label, nodeType: String(node.type), memberCount: 1, maxStrength: round(num(edge.strength)) });
      }
    }
    assetSets.set(m.id, aSet);
    sectorSets.set(m.id, sSet);
  }
  const bySignificance = (a: SharedExposureItem, b: SharedExposureItem) =>
    (b.memberCount - a.memberCount) || (b.maxStrength - a.maxStrength) || a.id.localeCompare(b.id);
  const sectors = [...sectorMap.values()].sort(bySignificance);
  const assets = [...assetMap.values()].sort(bySignificance);
  const exposure = sectors.length + assets.length > 0
    ? section<NarrativeExposure>("live", { sectors, assets })
    : section<NarrativeExposure>("partial", { sectors: [], assets: [] }, "Member themes have no recorded downstream sectors or tradeables yet.");

  /* -- evidence: per-member engine reads, never blended or summed -- */
  const perMember: MemberEvidenceRead[] = [];
  for (const m of members) {
    const ev = evaluateEvidenceForNode(m.id);
    if (!ev.found || ev.verdict === "insufficient_signal") continue;
    perMember.push({
      themeId: m.id, themeLabel: m.label, verdict: ev.verdict, trust: ev.overallTrust,
      contradictionCount: ev.contradictions.length,
      evidenceCount: G.getRelationships(m.id).reduce((s, e) => s + num(e.evidenceCount), 0),
    });
  }
  const distinctPages = uniq(members.flatMap(m => G.getRelationships(m.id).flatMap(e => e.originatingPages.map(String))));
  const evidence = perMember.length > 0
    ? section<NarrativeEvidence>(perMember.length === members.length ? "live" : "partial",
        { perMember, distinctPages },
        perMember.length === members.length ? undefined : "Evidence resolved for a subset of member themes; the rest returned insufficient signal.")
    : unavailable<NarrativeEvidence>("Evidence engine returned insufficient signal for every member theme.");

  /* -- forward: per-member theme trajectories, listed. No narrative-level
        forecast exists or is synthesized (the prediction engine has no
        narrative inputs; relabeling member forecasts would fake authority). -- */
  const forwardReads: MemberForwardRead[] = [];
  for (const m of members) {
    const p = predictThemeTrajectory(m.id);
    if (!p.found || p.predictedDirection === "insufficient_signal") continue;
    forwardReads.push({
      themeId: m.id, themeLabel: m.label, direction: p.predictedDirection,
      probability: p.probability, confidence: p.confidence,
      timeframe: p.expectedTimeframe || null, invalidation: p.invalidationConditions[0] ?? null,
    });
  }
  const forward = forwardReads.length > 0
    ? section<MemberForwardRead[]>(forwardReads.length === members.length ? "live" : "partial",
        forwardReads,
        forwardReads.length === members.length ? undefined : "Forward views resolved for a subset of member themes.")
    : unavailable<MemberForwardRead[]>("No member theme has a resolvable forward view.");

  /* -- coherence: structural similarity with a full decomposition (I4).
        Always "partial": it is a heuristic geometry measure, not a confidence. -- */
  const linkStrengths = members.flatMap(m => m.driverLinks.map(l => l.strength));
  const sharedDriverStrength = round(avg(linkStrengths));
  const assetOverlap = pairwiseJaccard(memberIds.map(id => assetSets.get(id)!));
  const sectorOverlap = pairwiseJaccard(memberIds.map(id => sectorSets.get(id)!));
  const parts: Array<[number, number]> = [[0.5, sharedDriverStrength]];
  if (assetOverlap !== null) parts.push([0.25, assetOverlap]);
  if (sectorOverlap !== null) parts.push([0.25, sectorOverlap]);
  const weightSum = parts.reduce((s, [w]) => s + w, 0);
  const score = round(parts.reduce((s, [w, v]) => s + w * v, 0) / weightSum);
  const explanation = [
    `Structural similarity ${score} from shared-driver link strength ${sharedDriverStrength}`,
    assetOverlap !== null ? `asset overlap ${assetOverlap}%` : null,
    sectorOverlap !== null ? `sector overlap ${sectorOverlap}%` : null,
  ].filter(Boolean).join(", ") + ". Heuristic overlap measure of how tightly members hang together; not a confidence.";
  const coherence = section<NarrativeCoherence>("partial",
    { score, sharedDriverStrength, assetOverlap, sectorOverlap, explanation },
    "Heuristic structural measure, not a confidence; see explanation.");

  return {
    version: DERIVED_NARRATIVE_VERSION, key, label, derived: true, generatedAt: Date.now(),
    driverSet, members: membersSection, exposure, evidence, forward, coherence,
  };
}

/** Average pairwise Jaccard similarity (0..100) across member entity-id sets.
    Null when no pair of members both have at least one entity (honest absence). */
function pairwiseJaccard(sets: Array<Set<string>>): number | null {
  const vals: number[] = [];
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const a = sets[i], b = sets[j];
      if (a.size === 0 || b.size === 0) continue;
      let inter = 0;
      for (const x of a) if (b.has(x)) inter++;
      vals.push(inter / (a.size + b.size - inter));
    }
  }
  return vals.length ? round(avg(vals) * 100) : null;
}
