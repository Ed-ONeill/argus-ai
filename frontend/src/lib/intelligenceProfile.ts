/**
 * lib/intelligenceProfile.ts - the canonical Argus Intelligence Profile (v1).
 *
 * One shared read model per entity, answering the standard intelligence
 * questions defined in docs/ARGUS_INTELLIGENCE_MODEL_V1.md section 9 and
 * specified in docs/ARGUS_INTELLIGENCE_PROFILE_V1.md:
 *
 *   Identity / Thesis / Drivers / Transmission / Beneficiaries / Risks /
 *   Evidence / Confidence / Evolution / Watch Next
 *
 * This module is a CONTRACT plus a v0 assembler that composes the engines that
 * already exist (graph, causal map, evidence, prediction, memory). It creates
 * no new intelligence: every field is a read of an existing system, and every
 * section carries an explicit status ("live" | "partial" | "unavailable") so
 * consumers can render honestly. Sections that cannot be derived return
 * status "unavailable" with data null - never a fabricated value (invariant I1).
 *
 * First production consumer: the Intelligence Explorer (System 1 integration
 * sprint), via hooks/useIntelligenceProfile; the page keeps its pre-profile
 * derivations as fallbacks for unavailable sections. Pure module, relative
 * imports only, exercised by intelligenceTests.ts (75.x contract, 76.x
 * Explorer integration). No em/en dashes.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import type { IntelNode } from "./intelligenceGraph";
import { buildRelationshipMap, causalLayerOfType, type MapVM, type MapEdge, type MapNode, type EdgeTrend } from "./causalMap";
import { evaluateEvidenceForNode, type EvidenceVerdict, type SourceBreakdownEntry } from "./evidenceEngine";
import { predictCompanyTrajectory, predictThemeTrajectory, predictSectorRotation } from "./predictionEngine";
import {
  getEntityHistory, compareSnapshots, summarizeEvolution, findHistoricalAnalogs, detectHistoricalPatterns,
} from "./memoryEngine";

/* ------------------------------------------------------------------ *
 * Contract
 * ------------------------------------------------------------------ */

export const PROFILE_VERSION = 1 as const;

/** Honesty marker on every section. "partial" = derived but thin or heuristic. */
export type ProfileStatus = "live" | "partial" | "unavailable";

export interface ProfileSection<T> {
  status: ProfileStatus;
  data:   T | null;      // null exactly when status is "unavailable"
  note?:  string;        // one line explaining a partial/unavailable status
}

export type ProfileKind = "company" | "etf" | "theme" | "sector" | "driver" | "evidence" | "unknown";

export interface ProfileIdentity {
  id:          string;
  label:       string;
  kind:        ProfileKind;
  nodeType:    string;
  aliases:     string[];
  description: string;
  causalLayer: number;          // 0 driver .. 4 evidence
  firstSeen:   number;
  lastSeen:    number;
  sources:     string[];        // pages that contributed to this entity
}

export interface ProfileForward {
  direction:    string;         // strengthening | weakening | stable | reversing | rotating in/out
  probability:  number | null;
  confidence:   number;
  timeframe:    string | null;
  reasons:      string[];
}

export interface ProfileThesis {
  /** One-line narrative, when a caller injects page-level context (crossIntel). */
  headline: string | null;
  /** Forward view from the prediction engine. Null when insufficient_signal. */
  forward:  ProfileForward | null;
}

export interface ProfileLink {
  id:           string;
  label:        string;
  nodeType:     string;
  relationship: string;
  strength:     number;
  confidence:   number;
  trend:        EdgeTrend;
  /** For two-hop links: the visible entity this connects through. */
  via:          string | null;
}

export interface ProfileTransmission {
  /** Entities per causal stage actually present around this entity. */
  stages: Array<{ layer: number; caption: string; entities: string[] }>;
  /** One representative strongest path through the stages, center included. */
  strongestPath: string[];
  upstreamCount: number;
  downstreamCount: number;
}

export interface ProfileRisks {
  /** Explicit falsifier from the prediction engine. */
  invalidation: string | null;
  /** Recorded weakens-group relationships (real edges, never padded). */
  weakening: ProfileLink[];
  /** Evidence-engine contradictions against this entity. */
  contradictions: Array<{ detail: string; severity: number }>;
}

export interface ProfileEvidenceItem {
  from:         string;
  relationship: string;
  strength:     number;
  confidence:   number;
  pages:        string[];
}

export interface ProfileEvidence {
  verdict:        EvidenceVerdict;
  overallTrust:   number;
  supporting:     ProfileEvidenceItem[];
  sourceBreakdown: SourceBreakdownEntry[];
  totalEvidence:  number;      // sum of edge evidenceCount around the entity
}

export interface ProfileConfidence {
  /** Existence confidence: is this entity real and correctly identified (node.confidence). */
  existence:  number;
  /** Directional conviction (node.conviction). Distinct by design; never blend. */
  conviction: number;
  /** Evidence trust (evidence engine overallTrust), when the engine resolved. */
  trust:      number | null;
  verdict:    EvidenceVerdict | null;
  /** Deterministic plain-language decomposition (invariant I4). */
  explanation: string;
}

export interface ProfileEvolution {
  firstSeen:  string;
  sessions:   number;
  deltas:     { conviction: number; momentum: number; confidence: number; evidenceCount: number } | null;
  lines:      string[];
  patterns:   string[];
  analogs:    Array<{ label: string; similarity: number; reason: string }>;
}

export interface ProfileWatch {
  items: string[];   // ranked; falsifiers first, then injected analyst watch items
}

export interface IntelligenceProfile {
  version:      typeof PROFILE_VERSION;
  entityKey:    string;
  generatedAt:  number;
  identity:      ProfileSection<ProfileIdentity>;
  thesis:        ProfileSection<ProfileThesis>;
  drivers:       ProfileSection<ProfileLink[]>;
  transmission:  ProfileSection<ProfileTransmission>;
  beneficiaries: ProfileSection<ProfileLink[]>;
  risks:         ProfileSection<ProfileRisks>;
  evidence:      ProfileSection<ProfileEvidence>;
  confidence:    ProfileSection<ProfileConfidence>;
  evolution:     ProfileSection<ProfileEvolution>;
  watch:         ProfileSection<ProfileWatch>;
}

/** Page-level context a caller MAY inject (e.g. crossIntel output). The
    assembler never fetches it itself: profiles stay pure graph/engine reads. */
export interface ProfileInputs {
  kindHint?:  ProfileKind;
  narrative?: { headline?: string | null; nextWatch?: string | null };
}

/* ------------------------------------------------------------------ *
 * Assembler v0
 * ------------------------------------------------------------------ */

const KIND_OF_TYPE: Record<string, ProfileKind> = {
  Company: "company", ETF: "etf",
  Theme: "theme", Narrative: "theme",
  Sector: "sector", Industry: "sector",
  Macro: "driver", MacroSeries: "driver", InterestRate: "driver", EconomicRelease: "driver", Commodity: "driver",
  Story: "evidence", Podcast: "evidence", MarketMetric: "evidence",
};
export const profileKindOfType = (t: string): ProfileKind => KIND_OF_TYPE[t] ?? "unknown";

const STAGE_CAPTION: Record<number, string> = { 0: "Drivers", 1: "Themes", 2: "Sectors", 3: "Companies", 4: "Evidence" };
const WEAKENS_RE = /weaken|contradict|revers|disrupt|pressur|risk/i;

const section = <T>(status: ProfileStatus, data: T | null, note?: string): ProfileSection<T> => ({ status, data, ...(note ? { note } : {}) });
const unavailable = <T>(note: string): ProfileSection<T> => section<T>("unavailable", null, note);

function toLink(e: MapEdge, self: string, via: string | null): ProfileLink {
  const other: MapNode = e.a === self ? e.to : e.from;
  return {
    id: other.id, label: other.label, nodeType: other.type,
    relationship: e.type, strength: e.strength, confidence: e.confidence, trend: e.trend, via,
  };
}

/**
 * Assemble the profile for one entity key (ticker, theme name, sector, driver).
 * Read-only composition of existing engines; tolerant of sparse graphs; never
 * throws on unknown entities (all sections come back "unavailable").
 */
export function buildIntelligenceProfile(entityKey: string, inputs: ProfileInputs = {}): IntelligenceProfile {
  const generatedAt = Date.now();
  const node: IntelNode | undefined = G.getNode(entityKey) ?? undefined;

  if (!node) {
    const missing = "Entity is not present in the current intelligence graph.";
    return {
      version: PROFILE_VERSION, entityKey, generatedAt,
      identity: unavailable(missing), thesis: unavailable(missing), drivers: unavailable(missing),
      transmission: unavailable(missing), beneficiaries: unavailable(missing), risks: unavailable(missing),
      evidence: unavailable(missing), confidence: unavailable(missing), evolution: unavailable(missing),
      watch: unavailable(missing),
    };
  }

  const kind = inputs.kindHint ?? profileKindOfType(String(node.type));
  const selfLayer = causalLayerOfType(String(node.type));

  /* -- identity (live: straight node read) -- */
  const identity = section<ProfileIdentity>("live", {
    id: node.id, label: node.label, kind, nodeType: String(node.type),
    aliases: node.aliases, description: node.description, causalLayer: selfLayer,
    firstSeen: node.firstSeen, lastSeen: node.lastSeen, sources: node.sources.map(String),
  });

  /* -- causal neighborhood (shared with the Explorer's map) -- */
  const map: MapVM = buildRelationshipMap(node.id, { causalChains: true, maxFirst: 16, maxSecond: 14 });
  const centerId = map.nodes.find(n => n.degree === 0)?.id ?? node.id;
  const layerOf = new Map(map.nodes.map(n => [n.id, causalLayerOfType(n.type)]));
  const touching = (id: string) => map.edges.filter(e => e.a === id || e.b === id);
  const centerEdges = touching(centerId).sort((a, b) => b.strength - a.strength);

  // Two-hop links resolve "via" through their first-degree host.
  const viaOf = (e: MapEdge): string | null => {
    if (e.a === centerId || e.b === centerId) return null;
    const host = [e.from, e.to].find(n => n.degree === 1);
    return host ? host.label : null;
  };

  /* -- drivers: upstream links, direct first, then chain-completed two-hop.
        Both endpoints of an edge are considered: a Theme -> Driver edge carries
        the driver even though the theme end also qualifies as upstream. -- */
  const upstreamLinks: ProfileLink[] = [];
  for (const e of map.edges.sort((a, b) => b.strength - a.strength)) {
    for (const other of [e.from, e.to]) {
      if (other.id === centerId) continue;
      if ((layerOf.get(other.id) ?? 9) >= selfLayer) continue;
      if (upstreamLinks.some(l => l.id === other.id)) continue;
      const direct = e.a === centerId || e.b === centerId;
      upstreamLinks.push({
        id: other.id, label: other.label, nodeType: other.type,
        relationship: e.type, strength: e.strength, confidence: e.confidence, trend: e.trend,
        via: direct ? null : viaOf(e),
      });
    }
  }
  const drivers = upstreamLinks.length > 0
    ? section("live", upstreamLinks.slice(0, 8))
    : section<ProfileLink[]>("partial", [], "No upstream drivers or themes recorded in the current graph.");

  /* -- beneficiaries: downstream tradeables (and evidence-bearing companies) -- */
  const downstreamLinks: ProfileLink[] = [];
  for (const e of map.edges.sort((a, b) => b.strength - a.strength)) {
    for (const other of [e.from, e.to]) {
      if (other.id === centerId) continue;
      if ((layerOf.get(other.id) ?? -1) <= selfLayer || profileKindOfType(other.type) === "evidence") continue;
      if (downstreamLinks.some(l => l.id === other.id)) continue;
      downstreamLinks.push({
        id: other.id, label: other.label, nodeType: other.type,
        relationship: e.type, strength: e.strength, confidence: e.confidence, trend: e.trend, via: viaOf(e),
      });
    }
  }
  const beneficiaries = downstreamLinks.length > 0
    ? section("live", downstreamLinks.slice(0, 8))
    : kind === "company" || kind === "etf"
      ? section<ProfileLink[]>("partial", [], "Companies sit at the bottom of the tradeable chain; peers arrive with peer-exposure derivation (future).")
      : section<ProfileLink[]>("partial", [], "No downstream beneficiaries recorded in the current graph.");

  /* -- transmission: stage summary + one strongest representative path -- */
  let transmission: ProfileSection<ProfileTransmission>;
  if (map.available && map.nodes.length > 1) {
    const byLayer = new Map<number, string[]>();
    for (const n of map.nodes) {
      const l = layerOf.get(n.id)!;
      (byLayer.get(l) ?? byLayer.set(l, []).get(l)!).push(n.label);
    }
    const stages = [...byLayer.entries()].sort((a, b) => a[0] - b[0])
      .map(([layer, entities]) => ({ layer, caption: STAGE_CAPTION[layer] ?? String(layer), entities: entities.slice(0, 8) }));
    // RC2-G6: THE TRANSMISSION INVARIANT. A transmission path is a causal
    // mechanism - Driver -> Theme -> Industry/Sector -> Company. Evidence
    // (Story / Deal / Podcast / MarketMetric) is what SUPPORTS a mechanism; it is
    // never a hop in one. The path used to append a layer-4 evidence node, so a
    // sector with no recorded upstream rendered as
    // "Healthcare -> How investors killed AstraZeneca's $400bn megadeal" under
    // "How it transmits". Evidence keeps its own section; it is not moved, only
    // kept out of the chain.
    //
    // Enforced by KIND, not by slot index, so an evidence node can never enter
    // through any slot.
    const bestAt = (pred: (l: number) => boolean): string | null => {
      const link = [...upstreamLinks, ...downstreamLinks]
        .find(l => profileKindOfType(l.nodeType) !== "evidence" && pred(causalLayerOfType(l.nodeType)));
      return link ? link.label : null;
    };
    // The subject sits at ITS OWN causal layer, not at a fixed index, so the
    // chain always reads in causal order: Driver -> Theme -> Industry/Sector ->
    // Company. (It used to be pinned to index 3, which put a Theme subject after
    // the sector it drives.) An evidence-kind subject has no causal slot at all.
    const selfLayer2 = causalLayerOfType(String(node.type));
    const selfIsEvidence = profileKindOfType(String(node.type)) === "evidence";
    const causalPath = [0, 1, 2, 3]
      .map(l => (!selfIsEvidence && l === selfLayer2 ? node.label : bestAt(x => x === l)))
      .filter((s): s is string => !!s);
    // A single node is not a mechanism. Stripping evidence can legitimately leave
    // nothing; that is an honest empty path, never a fabricated hop.
    const path = causalPath.length >= 2 ? causalPath : [];
    transmission = section("live", {
      stages, strongestPath: path,
      upstreamCount: upstreamLinks.length, downstreamCount: downstreamLinks.length,
    });
  } else {
    transmission = unavailable("No connected intelligence around this entity yet.");
  }

  /* -- forward view / thesis -- */
  const forward: ProfileForward | null = (() => {
    if (kind === "company" || kind === "etf") {
      const p = predictCompanyTrajectory(node.id);
      if (!p.found || p.expectedDirection === "insufficient_signal") return null;
      return { direction: p.expectedDirection, probability: p.probability, confidence: p.confidence, timeframe: null, reasons: p.reasoningSteps.map(s => s.claim).slice(0, 3) };
    }
    if (kind === "sector") {
      const p = predictSectorRotation(node.label);
      if (!p.found || p.currentRotation === "insufficient_signal") return null;
      const inflow = p.companiesBenefiting.length >= p.companiesAtRisk.length;
      return { direction: inflow ? "rotating in" : "rotating out", probability: null, confidence: p.confidence, timeframe: null, reasons: p.reasoningSteps.map(s => s.claim).slice(0, 3) };
    }
    if (kind === "theme" || kind === "driver") {
      const p = predictThemeTrajectory(node.id);
      if (!p.found || p.predictedDirection === "insufficient_signal") return null;
      return { direction: p.predictedDirection, probability: p.probability, confidence: p.confidence, timeframe: p.expectedTimeframe, reasons: p.why.slice(0, 3) };
    }
    return null;
  })();
  const headline = inputs.narrative?.headline ?? null;
  const thesis = headline || forward
    ? section<ProfileThesis>(headline && forward ? "live" : "partial", { headline, forward },
        headline ? undefined : "No page-level narrative injected; forward view only.")
    : unavailable<ProfileThesis>("Neither a narrative nor a resolvable forward view is available.");

  /* -- evidence -- */
  const ev = evaluateEvidenceForNode(node.id);
  const totalEvidence = centerEdges.reduce((s, e) => s + e.evidenceCount, 0);
  const evidence = ev.found && ev.verdict !== "insufficient_signal"
    ? section<ProfileEvidence>("live", {
        verdict: ev.verdict, overallTrust: ev.overallTrust,
        supporting: [...ev.supportingEvidence]
          .sort((a, b) => (b.strength - a.strength) || (b.confidence - a.confidence))
          .slice(0, 8)
          .map(x => ({ from: x.from, relationship: x.relationship, strength: x.strength, confidence: x.confidence, pages: x.pages.map(String) })),
        sourceBreakdown: ev.sourceBreakdown, totalEvidence,
      })
    : unavailable<ProfileEvidence>("Evidence engine returned insufficient signal for this entity.");

  /* -- risks -- */
  const invalidation = (() => {
    if (kind === "company" || kind === "etf") { const p = predictCompanyTrajectory(node.id); return p.found ? p.invalidation || null : null; }
    if (kind === "theme" || kind === "driver") { const p = predictThemeTrajectory(node.id); return p.found ? p.invalidationConditions[0] ?? null : null; }
    return null;
  })();
  const weakening = centerEdges.filter(e => WEAKENS_RE.test(e.type)).map(e => toLink(e, centerId, null));
  const contradictions = ev.found ? ev.contradictions.map(c => ({ detail: c.detail, severity: c.severity })) : [];
  const risks = invalidation || weakening.length > 0 || contradictions.length > 0
    ? section<ProfileRisks>("live", { invalidation, weakening, contradictions })
    : section<ProfileRisks>("partial", { invalidation: null, weakening: [], contradictions: [] }, "No recorded falsifiers, weakening edges, or contradictions in the current graph.");

  /* -- confidence: three numbers, never blended, with a decomposition -- */
  const trust = ev.found && ev.verdict !== "insufficient_signal" ? ev.overallTrust : null;
  const explanation = [
    `Existence confidence ${Math.round(node.confidence)} from ${node.mentionCount} observation${node.mentionCount === 1 ? "" : "s"} across ${node.sources.length} page${node.sources.length === 1 ? "" : "s"}.`,
    trust !== null ? `Evidence trust ${trust} (${ev.found ? ev.verdict : "n/a"}) over ${totalEvidence} evidence point${totalEvidence === 1 ? "" : "s"}.` : "Evidence trust unresolved (insufficient signal).",
    contradictions.length > 0 ? `${contradictions.length} active contradiction${contradictions.length === 1 ? "" : "s"} caps the read.` : "No active contradictions.",
  ].join(" ");
  const confidence = section<ProfileConfidence>("live", {
    existence: Math.round(node.confidence), conviction: Math.round(node.conviction),
    trust, verdict: ev.found ? ev.verdict : null, explanation,
  });

  /* -- evolution (memory engine; session/local persistence for now) -- */
  const hist = getEntityHistory(node.id);
  let evolution: ProfileSection<ProfileEvolution>;
  if ("found" in hist) {
    const cmp = compareSnapshots(node.id);
    const evo = summarizeEvolution(node.id);
    const pat = detectHistoricalPatterns(node.id);
    const an = findHistoricalAnalogs(node.id);
    evolution = section("partial", {
      firstSeen: hist.snapshots[0].date,
      sessions: hist.snapshots.length,
      deltas: "found" in cmp ? { conviction: cmp.deltas.conviction, momentum: cmp.deltas.momentum, confidence: cmp.deltas.confidence, evidenceCount: cmp.deltas.evidenceCount } : null,
      lines: "found" in evo ? evo.lines : [],
      patterns: "found" in pat ? pat.patterns.map(p => p.pattern) : [],
      analogs: "found" in an ? an.analogs.map(a => ({ label: a.label, similarity: a.similarity, reason: a.reason })) : [],
    }, "Memory is device-local today; server-side market memory is future work (model doc section 8).");
  } else {
    evolution = unavailable("No historical snapshots for this entity yet.");
  }

  /* -- watch next: falsifiers first, then injected analyst watch -- */
  const watchItems: string[] = [];
  if (invalidation) watchItems.push(`Invalidation: ${invalidation}`);
  if (inputs.narrative?.nextWatch) watchItems.push(inputs.narrative.nextWatch);
  for (const w of weakening.slice(0, 2)) watchItems.push(`Weakening link: ${w.label} (${w.relationship.replace(/_/g, " ")})`);
  const watch = watchItems.length > 0
    ? section<ProfileWatch>(inputs.narrative?.nextWatch ? "live" : "partial", { items: watchItems.slice(0, 5) })
    : unavailable<ProfileWatch>("No falsifiers or watch items derivable yet.");

  return {
    version: PROFILE_VERSION, entityKey, generatedAt,
    identity, thesis, drivers, transmission, beneficiaries, risks, evidence, confidence, evolution, watch,
  };
}
