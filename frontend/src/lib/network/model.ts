/**
 * lib/network/model.ts — the Intelligence Network view model (M4.1).
 *
 * A PROJECTION, never an engine (ARGUS_INTELLIGENCE_NETWORK_V1.md §2): this
 * module re-shapes already-derived theme intelligence into the network's node
 * and edge grammar. It computes no market meaning of its own — every field
 * traces to a stored theme field, ThemeMemory, or an existing shared
 * derivation (deriveDriver / deriveSector / themeBeneficiaries).
 *
 * M4.1 deltas vs the old lib/marketMap.ts builder:
 *  - NO synthetic "Market Center" root — drivers are the left-most causes;
 *  - model identity is a CONTENT hash (never Date.now), so identical intelligence
 *    yields an identical model key and therefore identical layout;
 *  - edges carry canonical verbs (drives / supports / pressures / exposed_to)
 *    and an honest provenance flag:
 *      recorded — curated ontology fields (relationship_weights,
 *                 related_industries) or ThemeMemory ticker sessions
 *      derived  — frontend heuristics (driver extraction from the causal
 *                 narrative head / first macro factor)
 *  - node class is explicit (driver | theme | industry | asset). The narrative
 *    class ships in M4.2 with the canonical-graph projection; until then the
 *    hierarchy is honestly four columns (documented partial coverage).
 *
 * NetworkNode extends the legacy GraphNode shape so the Feed's focus contract
 * (lib/feedFocus.nodeToFocus, keyed on `kind`) keeps working unchanged.
 */

import type { ThemeIntelligence } from "@/lib/types";
import type { GraphNode } from "@/lib/graph/types";
import type { DerivedNarrative } from "@/lib/narrativeDerivation";
import { themeBeneficiaries } from "@/lib/themeIntelligence";
import { cleanThemeName, cleanMacroLabel } from "@/app/markets/marketsShared";
import { dirOf, deriveDriver, deriveSector } from "@/lib/themeTransmission";
import type { MarketSnapshot } from "@/lib/marketMap";

export type NodeClass = "driver" | "narrative" | "theme" | "industry" | "asset";
export type EdgeVerb = "drives" | "supports" | "pressures" | "exposed_to" | "member_of";
export type EdgeProvenance = "recorded" | "derived";
export type Direction = "bullish" | "bearish" | "neutral";

export interface NetworkNode extends GraphNode {
  cls: NodeClass;
  direction?: Direction;
  /** Conviction delta vs the previous cycle (stored momentum_delta). */
  delta?: number;
  /** Industries: number of themes transmitting into this node. */
  supportCount?: number;
  momentumLabel?: string;
  /** Narrative only: structural coherence 0-100 (NOT a confidence — the
      canonical model forbids blending member convictions into one number). */
  coherence?: number;
  /** Narrative only: member theme node ids. */
  members?: string[];
}

export interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  verb: EdgeVerb;
  strength: number;            // 0..1 — recorded weight where available
  confidence: number;          // 0..1 — from theme conviction
  provenance: EdgeProvenance;
}

export interface NetworkModel {
  /** Deterministic content key — layout identity. NEVER time-derived. */
  key: string;
  regimeLabel: string;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** FNV-1a over a canonical string — the deterministic model key. */
function contentKey(parts: string[]): string {
  let h = 2166136261;
  const s = parts.slice().sort().join("|");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `net-${(h >>> 0).toString(16)}`;
}

/**
 * Build the Intelligence Network model from live theme intelligence.
 *
 * M4.2: when the canonical dominant DerivedNarrative is supplied (from
 * narrativeDerivation over the provisioned graph — the SAME derivation The
 * Read projects), it is projected as the single focal narrative object with
 * member_of edges to its member themes and drives edges from its driver set.
 * Exactly one dominant thesis is ever projected. With no derivable narrative
 * the highest-conviction theme honestly stands in as the focal object
 * (temporary until a canonical narrative entity class exists platform-wide).
 */
export function buildNetworkModel(themes: ThemeIntelligence[], snap: MarketSnapshot,
                                  opts?: { narrative?: DerivedNarrative | null }): NetworkModel {
  const nodes = new Map<string, NetworkNode>();
  const edges = new Map<string, NetworkEdge>();

  const addNode = (n: NetworkNode) => { if (!nodes.has(n.id)) nodes.set(n.id, n); return nodes.get(n.id)!; };
  const addEdge = (e: Omit<NetworkEdge, "id">) => {
    const id = `${e.source}»${e.verb}»${e.target}`;
    if (!edges.has(id) && nodes.has(e.source) && nodes.has(e.target)) edges.set(id, { id, ...e });
  };

  const ranked = [...themes]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || cleanThemeName(a.name).localeCompare(cleanThemeName(b.name)))
    .slice(0, 6);

  for (const t of ranked) {
    const sector = deriveSector(t);
    const tickers = themeBeneficiaries(t, 3);
    if (!sector || tickers.length === 0) continue;

    const name = cleanThemeName(t.name);
    const conf = Math.round(t.confidence ?? 60);
    const dir = dirOf(t);
    const driver = deriveDriver(t);

    // macro driver (deduped across themes; derivation is heuristic → edges are `derived`)
    const drvId = `drv:${slug(driver)}`;
    addNode({ id: drvId, label: driver, kind: "group", role: "cross-sector", cls: "driver",
              reason: "Macro driver feeding the narrative" });

    // theme
    const thId = `th:${slug(name)}`;
    addNode({ id: thId, label: name, kind: "theme", role: "theme", cls: "theme",
              confidence: conf, direction: dir, delta: t.momentum_delta ?? 0,
              momentumLabel: t.momentum_label, themes: [name],
              reason: t.causal_narrative || "Active market narrative" });
    addEdge({ source: drvId, target: thId, verb: "drives",
              strength: Math.max(0.45, conf / 100), confidence: conf / 100, provenance: "derived" });

    // industry (deduped; exposure recorded in the curated ontology)
    const secId = `sec:${slug(sector)}`;
    const rel = t.relationship_weights?.[sector];
    const relDir = rel?.direction;
    const existing = nodes.get(secId);
    const secNode = addNode({ id: secId, label: sector, kind: "sector", role: "sector", cls: "industry",
                              direction: relDir === "negative" ? "bearish" : relDir === "positive" ? "bullish" : dir,
                              supportCount: 0, themes: [], reason: "Sector carrying the transmission" });
    secNode.supportCount = (existing?.supportCount ?? 0) + 1;
    if (!secNode.themes!.includes(name)) secNode.themes!.push(name);
    addEdge({ source: thId, target: secId,
              verb: relDir === "negative" ? "pressures" : relDir === "positive" ? "supports" : "drives",
              strength: typeof rel?.weight === "number" ? Math.max(0.2, Math.min(1, rel.weight)) : 0.6,
              confidence: conf / 100,
              provenance: rel ? "recorded" : "derived" });

    // assets (recorded: ThemeMemory ticker sessions + curated related_assets)
    tickers.forEach((tk, i) => {
      const id = `co:${tk}`;
      addNode({ id, label: tk, kind: "company", role: dir === "bearish" ? "competitor" : "beneficiary",
                cls: "asset", ticker: tk, direction: dir,
                confidence: Math.max(40, conf - 6 - i * 4), themes: [name], isPublic: true,
                reason: dir === "bearish" ? "Pressured by the narrative" : "Expression of the narrative" });
      const co = nodes.get(id)!;
      if (!co.themes!.includes(name)) co.themes!.push(name);
      addEdge({ source: secId, target: id, verb: "exposed_to",
                strength: Math.max(0.25, 0.6 - i * 0.07), confidence: conf / 100, provenance: "recorded" });
    });
  }

  // ── M4.2: project the dominant narrative (one focal thesis, never more) ────
  const narrative = opts?.narrative ?? null;
  if (narrative) {
    // map derivation member labels → this projection's theme node ids
    const themeIdByName = new Map<string, string>();
    for (const n of nodes.values()) {
      if (n.cls === "theme") themeIdByName.set(n.label.toLowerCase(), n.id);
    }
    const memberIds = (narrative.members.data ?? [])
      .map(m => themeIdByName.get(cleanThemeName(m.label).toLowerCase())
             ?? themeIdByName.get(m.label.toLowerCase()))
      .filter((id): id is string => !!id);

    // a one-theme narrative is a theme (canonical rule) — only project with >= 2
    if (memberIds.length >= 2) {
      const narId = `nar:${slug(narrative.key).slice(0, 40) || "dominant"}`;
      const memberNames = memberIds
        .map(id => nodes.get(id)!.label)
        .sort();
      addNode({
        id: narId, label: narrative.label, kind: "theme", role: "theme",
        cls: "narrative",
        coherence: narrative.coherence.data ? Math.round(narrative.coherence.data.score) : undefined,
        members: [...memberIds].sort(),
        themes: memberNames,   // selecting the narrative focuses its member themes
        reason: "Derived dominant narrative — themes grouped by their shared recorded drivers",
      });
      for (const mid of [...memberIds].sort()) {
        addEdge({ source: narId, target: mid, verb: "member_of",
                  strength: 0.7, confidence: narrative.coherence.data
                    ? Math.max(0.2, Math.min(1, narrative.coherence.data.score / 100)) : 0.5,
                  provenance: "derived" });
      }
      // driver set → narrative (reuse existing driver nodes where labels match)
      for (const d of narrative.driverSet.data ?? []) {
        const dLabel = cleanMacroLabel(d.label);
        const dId = `drv:${slug(dLabel)}`;
        addNode({ id: dId, label: dLabel, kind: "group", role: "cross-sector",
                  cls: "driver", reason: "Macro driver feeding the narrative" });
        addEdge({ source: dId, target: narId, verb: "drives",
                  strength: 0.7, confidence: 0.6, provenance: "derived" });
      }
    }
  }

  const regimeLabel = snap.regimeLabel || (snap.riskRegime === "risk-on" ? "Risk-On" : snap.riskRegime === "risk-off" ? "Risk-Off" : "Mixed");
  const nodeList = [...nodes.values()];
  const edgeList = [...edges.values()];
  return {
    key: contentKey([...nodeList.map(n => `${n.id}:${n.cls}:${n.confidence ?? ""}:${n.coherence ?? ""}`),
                     ...edgeList.map(e => `${e.id}:${e.strength.toFixed(2)}:${e.provenance}`)]),
    regimeLabel,
    nodes: nodeList,
    edges: edgeList,
  };
}

// ── Path tracing (pure; used for hover/selection highlighting) ────────────────

export interface TracedPath { nodes: Set<string>; edges: Set<string> }

/** Full causal chain through a node: every upstream ancestor and downstream
    consequence along directed edges. Deterministic, no rendering concerns. */
export function tracePath(model: NetworkModel, nodeId: string): TracedPath {
  const up = new Map<string, NetworkEdge[]>();   // target → incoming edges
  const down = new Map<string, NetworkEdge[]>(); // source → outgoing edges
  for (const e of model.edges) {
    (up.get(e.target) ?? up.set(e.target, []).get(e.target)!).push(e);
    (down.get(e.source) ?? down.set(e.source, []).get(e.source)!).push(e);
  }
  const nodes = new Set<string>([nodeId]);
  const edges = new Set<string>();
  const walk = (start: string, adj: Map<string, NetworkEdge[]>, next: (e: NetworkEdge) => string) => {
    const q = [start];
    while (q.length) {
      const u = q.shift()!;
      for (const e of adj.get(u) ?? []) {
        edges.add(e.id);
        const v = next(e);
        if (!nodes.has(v)) { nodes.add(v); q.push(v); }
      }
    }
  };
  walk(nodeId, up, e => e.source);
  walk(nodeId, down, e => e.target);
  return { nodes, edges };
}

/** Transition duration honoring prefers-reduced-motion (0 when reduced). */
export function transitionMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : 240;
}

/** The projection's node id for a theme — shared with the inspector so the
    dossier and the canvas always agree on identity. */
export function themeNodeId(themeName: string): string {
  return `th:${slug(cleanThemeName(themeName))}`;
}

export interface ChainHop { id: string; label: string; cls: NodeClass;
                            relationship: string | null }

/** One ordered representative causal path through a node: strongest upstream
    edge per hop back to the originating force, then strongest downstream edge
    per hop to a terminal asset. Deterministic (strength, then edge id). Each
    hop's relationship is the recorded verb of the edge leading INTO it. */
export function representativeChain(model: NetworkModel, nodeId: string): ChainHop[] {
  const byId = new Map(model.nodes.map(n => [n.id, n]));
  if (!byId.has(nodeId)) return [];
  const strongest = (edges: NetworkEdge[]) =>
    [...edges].sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))[0];

  const ids: string[] = [nodeId];
  let cursor = nodeId;
  for (let i = 0; i < 8; i++) {                       // upstream to the force
    const incoming = model.edges.filter(e => e.target === cursor);
    if (!incoming.length) break;
    const src = strongest(incoming).source;
    if (ids.includes(src)) break;
    ids.unshift(src);
    cursor = src;
  }
  cursor = nodeId;
  for (let i = 0; i < 8; i++) {                       // downstream to a terminal
    const outgoing = model.edges.filter(e => e.source === cursor);
    if (!outgoing.length) break;
    const tgt = strongest(outgoing).target;
    if (ids.includes(tgt)) break;
    ids.push(tgt);
    cursor = tgt;
  }
  return ids.map((id, i) => {
    const n = byId.get(id)!;
    const prev = i > 0 ? ids[i - 1] : null;
    return {
      id, label: n.label, cls: n.cls,
      relationship: prev
        ? model.edges.find(e => e.source === prev && e.target === id)?.verb ?? null
        : null,
    };
  });
}
