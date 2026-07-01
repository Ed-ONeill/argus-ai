/**
 * lib/narrativeTransmission.ts - the Narrative Transmission Engine.
 *
 * The graph stores facts, the inference engine draws conclusions. This engine
 * explains HOW a narrative moves through markets: where it originates, how it
 * spreads, what confirms it, who it affects, and what likely comes next. It reads
 * only graph structure (nodes + evidence-weighted edges) and never invents a
 * relationship. If the graph does not support a narrative, it says insufficient_signal.
 *
 * No UI. No em/en dashes anywhere: commas, colons, hyphens and arrows only.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import type { IntelNode, IntelEdge, NodeType, SourcePage } from "./intelligenceGraph";
import { inferTheme, scoreInference, type Direction, type ReasoningStep } from "./inferenceEngine";

/* ------------------------------------------------------------------ *
 * Helpers (pure, graph-only)
 * ------------------------------------------------------------------ */

const num = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? n : 0);
const round = (n: number): number => Math.round(n);
const avg = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const uniq = <T,>(a: T[]): T[] => Array.from(new Set(a));

function list(items: string[]): string {
  const f = uniq(items.filter(Boolean));
  if (f.length === 0) return "";
  if (f.length === 1) return f[0];
  if (f.length === 2) return `${f[0]} and ${f[1]}`;
  return `${f.slice(0, -1).join(", ")} and ${f[f.length - 1]}`;
}
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export interface NodeRef { id: string; label: string; type: NodeType }
const ref = (n: IntelNode): NodeRef => ({ id: n.id, label: n.label, type: n.type });

const UPSTREAM: ReadonlySet<NodeType> = new Set<NodeType>(["Macro", "Story", "Deal", "Podcast", "Person", "Commodity", "EconomicRelease"]);
const DOWNSTREAM: ReadonlySet<NodeType> = new Set<NodeType>(["Company", "Sector", "Industry", "Currency", "Commodity", "InterestRate"]);

const pagesOf = (edges: IntelEdge[]): SourcePage[] => uniq(edges.flatMap(e => e.originatingPages));
const evidenceOf = (edges: IntelEdge[]): number => edges.reduce((s, e) => s + num(e.evidenceCount), 0);

/** Recompute a node's market state from momentum + evidence, graph-only. */
function stateOf(node: IntelNode): Direction {
  const edges = G.getRelationships(node.id);
  if (evidenceOf(edges) + edges.length < 2 && num(node.mentionCount) < 1) return "insufficient_signal";
  const m = num(node.momentum);
  if (m >= 3) return "strengthening";
  if (m <= -3) return "weakening";
  return "mixed";
}

/** The theme at the center of a narrative for any starting node. */
function centralTheme(node: IntelNode): { theme: IntelNode; via: IntelEdge | null } | null {
  if (node.type === "Theme") return { theme: node, via: null };
  const themes = G.getNeighbors(node.id).filter(x => x.node.type === "Theme");
  if (!themes.length) return null;
  const best = themes.sort((a, b) => (b.edge.strength * (num(b.node.conviction) || 50)) - (a.edge.strength * (num(a.node.conviction) || 50)))[0];
  return { theme: best.node, via: best.edge };
}

/** The strongest upstream driver of a theme (macro first, then story / deal / podcast). */
function themeOrigin(theme: IntelNode): { node: IntelNode; edge: IntelEdge } | null {
  const incoming = G.getRelationships(theme.id, "in").map(e => ({ e, src: G.getNode(e.source) })).filter(x => x.src) as Array<{ e: IntelEdge; src: IntelNode }>;
  const macro = incoming.filter(x => x.src.type === "Macro").sort((a, b) => b.e.strength - a.e.strength)[0];
  if (macro) return { node: macro.src, edge: macro.e };
  const evt = incoming.filter(x => ["Story", "Deal", "Podcast", "Person", "EconomicRelease"].includes(x.src.type)).sort((a, b) => b.e.strength - a.e.strength)[0];
  if (evt) return { node: evt.src, edge: evt.e };
  return null;
}

/* ------------------------------------------------------------------ *
 * buildNarrativePath
 * ------------------------------------------------------------------ */

export interface PathStep {
  node:              NodeRef;
  relationship:      string | null;   // edge type leading INTO this node from the previous step
  confidence:        number;          // 0..100
  evidence:          string;
  supportingSources: SourcePage[];
}

export interface NarrativePath {
  found:         boolean;
  origin:        NodeRef | null;
  theme:         NodeRef | null;
  direction:     Direction;
  path:          PathStep[];
  terminalNodes: NodeRef[];
  confidence:    number;
  evidenceCount: number;
  explanation:   string;
}

function insufficientPath(label: string): NarrativePath {
  return {
    found: false, origin: null, theme: null, direction: "insufficient_signal",
    path: [], terminalNodes: [], confidence: 0, evidenceCount: 0,
    explanation: `Insufficient signal to trace a narrative path for ${label}.`,
  };
}

export function buildNarrativePath(nodeOrId: string | IntelNode): NarrativePath {
  const start = typeof nodeOrId === "string" ? G.getNode(nodeOrId) : nodeOrId;
  if (!start) return insufficientPath(typeof nodeOrId === "string" ? nodeOrId : "unknown");

  const ct = centralTheme(start);
  if (!ct) {
    // No theme to anchor the narrative: only traceable if the node itself is well connected.
    return insufficientPath(start.label);
  }
  const theme = ct.theme;
  const themeEdges = G.getRelationships(theme.id);
  if (evidenceOf(themeEdges) + themeEdges.length < 2) {
    const out = insufficientPath(theme.label);
    return out;
  }

  const direction = stateOf(theme);

  // Origin: the starting node if it is a genuine upstream driver, else the theme's driver, else the theme itself.
  const startIsUpstream = start.id !== theme.id && UPSTREAM.has(start.type) && !!ct.via;
  const originInfo = startIsUpstream ? { node: start, edge: ct.via! } : themeOrigin(theme);
  const originNode = originInfo?.node ?? theme;
  const originEdge = originInfo?.edge ?? null;

  // Downstream: all affected leaves out of the theme, strongest first.
  const downstream = G.getNeighbors(theme.id, { direction: "out" })
    .filter(x => DOWNSTREAM.has(x.node.type))
    .sort((a, b) => b.edge.strength - a.edge.strength);
  const terminalNodes = uniq(downstream.map(x => x.node.id)).map(id => ref(G.getNode(id)!));
  const companyCount = downstream.filter(x => x.node.type === "Company").length;
  const sectorCount  = downstream.filter(x => x.node.type === "Sector" || x.node.type === "Industry").length;

  // Build the causal spine: origin -> theme -> strongest terminal.
  const path: PathStep[] = [];
  const themePages = pagesOf(themeEdges);

  if (originNode.id !== theme.id) {
    path.push({
      node: ref(originNode), relationship: null,
      confidence: round(originEdge ? originEdge.confidence : num(originNode.confidence)),
      evidence: `Narrative originates at ${originNode.label} (${originNode.type}).`,
      supportingSources: originEdge ? originEdge.originatingPages : originNode.sources,
    });
  }
  path.push({
    node: ref(theme), relationship: originEdge ? originEdge.relationshipType : null,
    confidence: round(Math.max(num(theme.confidence), avg(themeEdges.map(e => num(e.confidence))))),
    evidence: themePages.length >= 2
      ? `${theme.label} is ${direction}, confirmed across ${list(themePages as string[])}.`
      : `${theme.label} is ${direction}.`,
    supportingSources: themePages,
  });
  const lead = downstream[0];
  if (lead) {
    path.push({
      node: ref(lead.node), relationship: lead.edge.relationshipType,
      confidence: round(lead.edge.strength),
      evidence: `Transmits to ${lead.node.label} by ${lead.edge.relationshipType.replace(/_/g, " ")}, strength ${round(lead.edge.strength)}.`,
      supportingSources: lead.edge.originatingPages,
    });
  }

  const confidence = scoreInference({
    strength: avg(themeEdges.map(e => num(e.strength))),
    confidence: Math.max(num(theme.confidence), avg(themeEdges.map(e => num(e.confidence)))),
    evidenceCount: evidenceOf(themeEdges), originatingPages: themePages.length,
    persistence: theme.persistence, momentum: theme.momentum, conviction: theme.conviction,
  }).score;

  const explanation = buildPathExplanation(originNode, theme, originEdge, lead?.node ?? null, themePages, companyCount, sectorCount, direction);

  return {
    found: true, origin: ref(originNode), theme: ref(theme), direction, path, terminalNodes,
    confidence, evidenceCount: evidenceOf(themeEdges), explanation,
  };
}

function buildPathExplanation(origin: IntelNode, theme: IntelNode, originEdge: IntelEdge | null, terminal: IntelNode | null, pages: SourcePage[], companyCount: number, sectorCount: number, direction: Direction): string {
  const parts: string[] = [];
  if (origin.id !== theme.id) {
    parts.push(`Originates at ${origin.label} (${origin.type})`);
    parts.push(`${originEdge ? originEdge.relationshipType.replace(/_/g, " ") : "feeds"} ${theme.label} (${direction})`);
  } else {
    parts.push(`Centered on ${theme.label} (${direction})`);
  }
  if (terminal) parts.push(`transmits to ${terminal.label} (${terminal.type})`);
  let s = parts.join(", ") + ".";
  if (pages.length >= 2) s += ` Confirmed across ${list(pages as string[])}.`;
  const affected: string[] = [];
  if (companyCount) affected.push(plural(companyCount, "company", "companies"));
  if (sectorCount) affected.push(plural(sectorCount, "sector"));
  if (affected.length) s += ` ${list(affected)} affected.`;
  return s;
}

/* ------------------------------------------------------------------ *
 * findTransmissionChains
 * ------------------------------------------------------------------ */

export interface TransmissionChain {
  path:              NarrativePath;
  crossSourceCount:  number;
  relationshipStrength: number;
}

export function findTransmissionChains(limit = 8): TransmissionChain[] {
  const chains: TransmissionChain[] = [];
  for (const theme of G.nodesOfType("Theme")) {
    const path = buildNarrativePath(theme);
    if (!path.found) continue;
    const themeEdges = G.getRelationships(theme.id);
    chains.push({
      path,
      crossSourceCount: pagesOf(themeEdges).length,
      relationshipStrength: round(avg(themeEdges.map(e => num(e.strength)))),
    });
  }
  return chains
    .sort((a, b) =>
      (b.path.confidence - a.path.confidence) ||
      (b.crossSourceCount - a.crossSourceCount) ||
      (b.relationshipStrength - a.relationshipStrength))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * rankNarratives
 * ------------------------------------------------------------------ */

export interface NarrativeRank {
  theme:              NodeRef;
  transmissionVelocity: number;   // signed momentum
  crossMarketReach:   number;     // distinct sources + affected leaves
  persistence:        number;
  conviction:         number;
  score:              number;     // composite 0..100
}

export function rankNarratives(limit = 10): NarrativeRank[] {
  const ranked: NarrativeRank[] = G.nodesOfType("Theme").map(theme => {
    const edges = G.getRelationships(theme.id);
    const downstream = G.getNeighbors(theme.id, { direction: "out" }).filter(x => DOWNSTREAM.has(x.node.type)).length;
    const reach = pagesOf(edges).length + downstream;
    const score = scoreInference({
      strength: avg(edges.map(e => num(e.strength))),
      confidence: Math.max(num(theme.confidence), avg(edges.map(e => num(e.confidence)))),
      evidenceCount: evidenceOf(edges), originatingPages: pagesOf(edges).length,
      persistence: theme.persistence, momentum: theme.momentum, conviction: theme.conviction,
    }).score;
    return {
      theme: ref(theme),
      transmissionVelocity: round(num(theme.momentum)),
      crossMarketReach: reach,
      persistence: round(num(theme.persistence)),
      conviction: round(num(theme.conviction)),
      score,
    };
  });
  return ranked
    .sort((a, b) =>
      (b.score - a.score) ||
      (b.crossMarketReach - a.crossMarketReach) ||
      (b.transmissionVelocity - a.transmissionVelocity))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * detectEmergingNarratives
 * ------------------------------------------------------------------ */

export interface EmergingNarrative {
  theme:            NodeRef;
  mentionCount:     number;
  momentum:         number;
  convictionRise:   number;      // from snapshot history if available, else 0
  crossSourceCount: number;
  reason:           string;
}

/** Conviction change from stored snapshot history (metadata.history), if present. */
function convictionRiseOf(node: IntelNode): number {
  const hist = node.metadata?.history;
  if (!Array.isArray(hist) || hist.length < 2) return 0;
  const first = hist[0] as { conviction?: number };
  const last = hist[hist.length - 1] as { conviction?: number };
  return round(num(last?.conviction) - num(first?.conviction));
}

export function detectEmergingNarratives(limit = 8): EmergingNarrative[] {
  const themes = G.nodesOfType("Theme");
  if (!themes.length) return [];
  const mentions = themes.map(t => num(t.mentionCount)).sort((a, b) => a - b);
  const median = mentions[Math.floor(mentions.length / 2)] ?? 0;
  const lowBar = Math.max(2, median * 0.6);

  const out: EmergingNarrative[] = [];
  for (const t of themes) {
    const mentionCount = num(t.mentionCount);
    const momentum = num(t.momentum);
    const convictionRise = convictionRiseOf(t);
    const crossSourceCount = pagesOf(G.getRelationships(t.id)).length;
    const isLow = mentionCount <= lowBar;
    const rising = momentum >= 4 || convictionRise >= 6;
    const newlyConfirmed = crossSourceCount >= 3;
    if (!isLow || (!rising && !newlyConfirmed)) continue;

    const reasons: string[] = [];
    if (momentum >= 4) reasons.push(`momentum +${round(momentum)}`);
    if (convictionRise >= 6) reasons.push(`conviction up ${convictionRise} across sessions`);
    if (newlyConfirmed) reasons.push(`confirmed across ${plural(crossSourceCount, "source")}`);
    out.push({
      theme: ref(t), mentionCount, momentum: round(momentum), convictionRise, crossSourceCount,
      reason: `Low footprint (${plural(mentionCount, "mention")}) but ${list(reasons)}.`,
    });
  }
  return out
    .sort((a, b) => (b.momentum - a.momentum) || (b.crossSourceCount - a.crossSourceCount) || (b.convictionRise - a.convictionRise))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * explainNarrative
 * ------------------------------------------------------------------ */

export interface NarrativeExplanation {
  found:             boolean;
  theme:             NodeRef | null;
  origin:            NodeRef | null;
  currentState:      string;
  transmissionPath:  PathStep[];
  beneficiaries:     string[];
  headwinds:         string[];
  confirmingEvidence: string[];
  invalidation:      string;
  nextWatch:         string;
  explanation:       string;
  reasoningSteps:    ReasoningStep[];
}

export function explainNarrative(themeOrId: string): NarrativeExplanation {
  const start = G.getNode(themeOrId);
  const theme = start ? (start.type === "Theme" ? start : centralTheme(start)?.theme ?? null) : null;
  if (!theme) return {
    found: false, theme: null, origin: null, currentState: "insufficient_signal",
    transmissionPath: [], beneficiaries: [], headwinds: [], confirmingEvidence: [],
    invalidation: "No connected narrative in the graph.", nextWatch: "the entity appearing across sources",
    explanation: `Insufficient signal to explain a narrative for ${themeOrId}.`,
    reasoningSteps: [{ claim: `No theme resolved for ${themeOrId}`, evidence: "The entity anchors no theme in the current graph.", confidence: 0, sourceType: "graph" }],
  };

  const path = buildNarrativePath(theme);
  const ti = inferTheme(theme.id);
  if (ti.direction === "insufficient_signal" || !path.found) {
    return {
      found: false, theme: ref(theme), origin: path.origin, currentState: "insufficient_signal",
      transmissionPath: path.path, beneficiaries: [], headwinds: [],
      confirmingEvidence: ti.supportingEvidence, invalidation: ti.invalidation, nextWatch: ti.nextWatch,
      explanation: path.explanation, reasoningSteps: ti.reasoningSteps,
    };
  }

  const confirmingEvidence = uniq([
    ...ti.supportingEvidence,
    ...(ti.confirmingSources.length >= 2 ? [`confirmed across ${list(ti.confirmingSources as string[])}`] : []),
  ]);

  return {
    found: true, theme: ref(theme), origin: path.origin,
    currentState: `${theme.label} is ${ti.direction}, confidence ${ti.confidence}.`,
    transmissionPath: path.path,
    beneficiaries: ti.beneficiaryCompanies,
    headwinds: ti.atRiskCompanies,
    confirmingEvidence,
    invalidation: ti.invalidation,
    nextWatch: ti.nextWatch,
    explanation: path.explanation,
    reasoningSteps: ti.reasoningSteps,
  };
}
