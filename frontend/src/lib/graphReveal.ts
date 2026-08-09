// lib/graphReveal.ts — the Workstation exhibit's PROGRESSIVE-REVEAL resolver (Surface #7, Stage 2).
//
// The investigation thread controls the exhibit: as the reader reaches each beat, the graph
// responds. This module is the deterministic bridge between the beat the reader is on and WHICH
// parts of the existing MapVM the graph should emphasize. It is a PURE projection over the shared
// MapVM (exactly like causalMap.ts) — arrays of ids and booleans, no React / SVG / CSS. It adds
// no graph modes and fabricates nothing: every id it returns already exists in the map.
//
// The four authorized reveal stages, tied to the frozen beats:
//   primary  (hypothesis / transmission) — show only the primary causal chain
//   evidence (evidence / support)        — expand the branches that carry real evidence
//   breaks   (what breaks it)            — keep the expanded view, highlight the weak/breaking edges
//   history  (historical record)         — overlay prior resolved paths ONLY when real data exists
//
// No em/en dashes.

import type { MapVM } from "./causalMap";

export type RevealStage = "primary" | "evidence" | "breaks" | "history";

/** A prior resolved reasoning path, expressed as edge ids already in the map. Overlaid at the
 *  historical-record beat. Supplied only when a real outcome ledger records resolved paths; the
 *  Workstation omits the overlay honestly when none exist (see buildHistoricalRecord gating). */
export interface PriorPath { id: string; label: string; edgeIds: string[] }

export interface GraphReveal {
  stage: RevealStage;
  /** Node ids the current stage brings forward. Others are de-emphasized, never removed. */
  nodeIds: string[];
  /** When false, the stage places no restriction (every node is at full strength). */
  restrict: boolean;
  /** Edge ids to call out as weak / invalidating at the "what breaks it" beat. */
  breakingEdgeIds: string[];
  /** Edge ids of prior resolved paths to overlay at the historical-record beat (empty unless real). */
  priorPathEdgeIds: string[];
  /** Honest gate: whether any real prior-path data backed this reveal. */
  priorPathAvailable: boolean;
}

export interface RevealInputs {
  primaryChain: string[];   // labels of the strongest transmission path (from the View Model)
  weakLinks: string[];      // labels of the recorded weakening links (from the View Model)
  priorPaths?: PriorPath[]; // real resolved paths, when an outcome ledger provides them
}

// Recorded edge types that read as pressure ON the thesis (kept in sync with the Explorer's edge
// grouping; classification only, no facts invented).
const WEAKENS_RE = /weaken|contradict|revers|disrupt|pressur|risk/i;
const norm = (s: string): string => s.trim().toLowerCase();

/** Node ids on the primary chain: the center plus every node whose label the chain names. */
export function chainNodeIds(map: MapVM, chainLabels: string[]): string[] {
  const wanted = new Set(chainLabels.map(norm));
  return map.nodes.filter((n) => n.degree === 0 || wanted.has(norm(n.label))).map((n) => n.id);
}

/** Node ids reachable through an edge that carries real evidence (evidenceCount >= 1). */
function evidenceBackedIds(map: MapVM, seed: Set<string>): Set<string> {
  const out = new Set(seed);
  for (const e of map.edges) {
    if (e.evidenceCount >= 1) { out.add(e.a); out.add(e.b); }
  }
  return out;
}

/** Edge ids that read as weak or invalidating: a weakening trend, a pressure-type relationship,
 *  or an edge touching a link the View Model flagged as weakening. */
export function breakingEdgeIds(map: MapVM, weakLinks: string[]): string[] {
  const weak = new Set(weakLinks.map(norm));
  return map.edges
    .filter((e) => e.trend === "weakening" || WEAKENS_RE.test(e.type) || weak.has(norm(e.from.label)) || weak.has(norm(e.to.label)))
    .map((e) => e.id);
}

const EMPTY = (stage: RevealStage): GraphReveal => ({
  stage, nodeIds: [], restrict: false, breakingEdgeIds: [], priorPathEdgeIds: [], priorPathAvailable: false,
});

/** Resolve the beat's reveal stage into concrete map ids. Deterministic and non-destructive:
 *  it only ever narrows emphasis, never removes a node, and returns no-restriction fallbacks so
 *  the exhibit is never blank. */
export function computeReveal(map: MapVM, stage: RevealStage, input: RevealInputs): GraphReveal {
  if (!map.available || map.nodes.length === 0) return EMPTY(stage);

  const chain = chainNodeIds(map, input.primaryChain);
  // Honest fallback: if the profile named no resolvable chain, do not restrict to nothing.
  const chainSet = chain.length > 1 ? new Set(chain) : null;
  const evidenceSet = evidenceBackedIds(map, chainSet ?? new Set(map.nodes.map((n) => n.id)));
  const breaking = breakingEdgeIds(map, input.weakLinks);
  // The whole point of the "what breaks it" beat is to SHOW the weak links. Their edges carry no
  // evidence, so the evidence set would dim them out; bring their endpoints forward so the
  // highlighted breaking edges connect to visible nodes.
  const breakingNodeIds = map.edges.filter((e) => breaking.includes(e.id)).flatMap((e) => [e.a, e.b]);
  const withBreaks = new Set([...evidenceSet, ...breakingNodeIds]);

  const priorPaths = input.priorPaths ?? [];
  const priorEdgeIds = priorPaths.flatMap((p) => p.edgeIds).filter((id) => map.edges.some((e) => e.id === id));
  const priorAvailable = priorEdgeIds.length > 0;
  const priorNodeIds = map.edges.filter((e) => priorEdgeIds.includes(e.id)).flatMap((e) => [e.a, e.b]);

  switch (stage) {
    case "primary":
      return chainSet
        ? { stage, nodeIds: [...chainSet], restrict: true, breakingEdgeIds: [], priorPathEdgeIds: [], priorPathAvailable: priorAvailable }
        : { ...EMPTY(stage), stage, priorPathAvailable: priorAvailable };
    case "evidence":
      return { stage, nodeIds: [...evidenceSet], restrict: true, breakingEdgeIds: [], priorPathEdgeIds: [], priorPathAvailable: priorAvailable };
    case "breaks":
      return { stage, nodeIds: [...withBreaks], restrict: true, breakingEdgeIds: breaking, priorPathEdgeIds: [], priorPathAvailable: priorAvailable };
    case "history":
      return {
        stage,
        nodeIds: [...new Set([...withBreaks, ...(priorAvailable ? priorNodeIds : [])])],
        restrict: true,
        breakingEdgeIds: breaking,
        priorPathEdgeIds: priorAvailable ? priorEdgeIds : [],
        priorPathAvailable: priorAvailable,
      };
  }
}
