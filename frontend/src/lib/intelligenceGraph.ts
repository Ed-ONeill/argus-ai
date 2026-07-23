/**
 * lib/intelligenceGraph.ts - the canonical Market Intelligence Graph.
 *
 * One shared, in-memory graph of every important market entity (themes, companies,
 * sectors, macro drivers, deals, people, podcasts, stories ...) and the typed,
 * evidence-weighted relationships between them. This is the brain layer: pages
 * feed observations in and read intelligence out, instead of each maintaining its
 * own independent picture.
 *
 * Design notes:
 *  - Pure data. No React, no context providers, no UI. Framework-agnostic.
 *  - In-memory with id / alias / type / adjacency indexes, so getNode, getNeighbors
 *    and getRelationships are O(1) / O(degree), not O(N). Built to stay responsive
 *    at 10k+ nodes and 100k+ edges.
 *  - Node and relationship types are open string unions: the listed types are the
 *    known vocabulary, but any new string is accepted without code changes.
 *  - Duplicate resolution is simple alias merging (NVDA / Nvidia / NVIDIA -> one
 *    company; "AI Infrastructure" / "AI Infra" / "AI Compute" -> one theme). No
 *    per-type special-casing, no over-engineering.
 *
 * No em/en dashes in any string this module produces.
 */

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

/** Known node types. The union stays open (`& {}`) so new types need no edit. */
export type NodeType =
  | "Theme"
  | "Company"
  | "Sector"
  | "Industry"
  | "Macro"
  | "Commodity"
  | "Country"
  | "Currency"
  | "InterestRate"
  | "Deal"
  | "Fund"
  | "Person"
  | "Podcast"
  | "Story"
  | "EconomicRelease"
  | "ETF"
  // OP4.1 — canonical Market Event (keyed by durable uid; excluded from
  // getNeighbors by default until OP4.3 migrates the legacy engines)
  | "Event"
  | (string & {});

/** Known relationship types. Also an open union; add freely. */
export type RelationshipType =
  | "drives"
  | "supports"
  | "weakens"
  | "owns"
  | "acquires"
  | "mentions"
  | "correlates"
  | "supplies"
  | "depends_on"
  | "competes_with"
  | "raises_demand_for"
  | "reduces_supply_of"
  | (string & {});

/** Pages that can originate an observation. Open union, extend as pages onboard. */
export type SourcePage =
  | "Feed"
  | "Markets"
  | "Industries"
  | "Listen"
  | "M&A"
  | "Private Markets"
  | "Theme Intelligence"
  | "Cross-page Intelligence"
  | "Historical Snapshots"
  | (string & {});

/** Epoch milliseconds. Cheap to compare and store; formatting is a UI concern. */
export type Timestamp = number;

export interface IntelNode {
  id:           string;             // stable canonical id (normalized)
  label:        string;             // display text
  aliases:      string[];           // alternate names that resolve to this node
  type:         NodeType;
  description:  string;
  confidence:   number;             // 0..100 how sure we are this node is real/right
  conviction:   number;             // 0..100 directional conviction
  momentum:     number;             // signed rate of change (unbounded)
  persistence:  number;             // 0..100 how durable the signal has been
  firstSeen:    Timestamp;
  lastSeen:     Timestamp;
  mentionCount: number;
  importance:   number;             // 0..100 relative weight in the graph
  sources:      SourcePage[];       // pages that have contributed to this node
  metadata:     Record<string, unknown>;
}

export interface IntelEdge {
  id:               string;         // `${source}|${relationshipType}|${target}`
  source:           string;         // node id
  target:           string;         // node id
  relationshipType: RelationshipType;
  strength:         number;         // 0..100 magnitude of the link
  confidence:       number;         // 0..100 how sure we are the link exists
  firstObserved:    Timestamp;
  lastObserved:     Timestamp;
  evidenceCount:    number;         // number of observations supporting it
  originatingPages: SourcePage[];   // pages that have asserted this edge
}

/** Input shapes: everything except id/label is optional and defaulted. */
export type NodeInput =
  Partial<Omit<IntelNode, "id" | "label" | "type">> &
  { id?: string; label: string; type: NodeType;
    /** OP4.1 — namespaced canonical nodes (e.g. `event:<uid>`) merge by id
        ONLY: label/alias fuzzy-merge is skipped so an Event whose headline
        equals its cluster's story can never be absorbed into it. Requires
        `id`. */
    exactIdentity?: boolean };

export type EdgeInput =
  Partial<Omit<IntelEdge, "id" | "source" | "target" | "relationshipType">> &
  { source: string; target: string; relationshipType: RelationshipType };

/* ------------------------------------------------------------------ *
 * Reference vocabulary (documentation only, not enforced)
 * ------------------------------------------------------------------ */

export const KNOWN_NODE_TYPES: readonly NodeType[] = [
  "Theme", "Company", "Sector", "Industry", "Macro", "Commodity", "Country",
  "Currency", "InterestRate", "Deal", "Fund", "Person", "Podcast", "Story",
  "EconomicRelease", "ETF",
];

export const KNOWN_RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  "drives", "supports", "weakens", "owns", "acquires", "mentions", "correlates",
  "supplies", "depends_on", "competes_with", "raises_demand_for", "reduces_supply_of",
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const now = (): Timestamp => Date.now();

/** Normalize a label / alias to a comparison key: lowercase alphanumerics. */
export function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const uniq = <T,>(arr: Iterable<T>): T[] => Array.from(new Set(arr));
const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, n));
const edgeId = (source: string, type: string, target: string): string =>
  `${source}|${type}|${target}`;

/* ------------------------------------------------------------------ *
 * Graph
 * ------------------------------------------------------------------ */

export class IntelligenceGraph {
  private nodes = new Map<string, IntelNode>();
  private edges = new Map<string, IntelEdge>();

  // Indexes (kept in sync on every mutation) for O(1) / O(degree) access.
  private aliasIndex = new Map<string, string>();          // normalizedKey -> nodeId
  private typeIndex  = new Map<NodeType, Set<string>>();    // type -> nodeIds
  private outEdges   = new Map<string, Set<string>>();      // nodeId -> edgeIds (as source)
  private inEdges    = new Map<string, Set<string>>();      // nodeId -> edgeIds (as target)

  /* ----- nodes ----- */

  /**
   * Insert or upsert a node. If any of the node's keys (id, label, aliases) already
   * resolve to an existing node, this merges into that node instead of duplicating.
   * Returns the canonical node.
   */
  addNode(input: NodeInput): IntelNode {
    const keys = input.exactIdentity && input.id
      ? [normalizeKey(input.id)]
      : this.candidateKeys(input.id, input.label, input.aliases);
    const existingId = this.findByKeys(keys);
    if (existingId) return this.updateNode(existingId, input)!;

    const id = input.id ? normalizeKey(input.id) : normalizeKey(input.label);
    const ts = now();
    const node: IntelNode = {
      id,
      label:        input.label,
      aliases:      uniq([input.label, ...(input.aliases ?? [])]),
      type:         input.type,
      description:  input.description ?? "",
      confidence:   clamp(input.confidence ?? 50),
      conviction:   clamp(input.conviction ?? 50),
      momentum:     input.momentum ?? 0,
      persistence:  clamp(input.persistence ?? 0),
      firstSeen:    input.firstSeen ?? ts,
      lastSeen:     input.lastSeen ?? ts,
      mentionCount: input.mentionCount ?? 0,
      importance:   clamp(input.importance ?? 0),
      sources:      uniq(input.sources ?? []),
      metadata:     { ...(input.metadata ?? {}) },
    };
    this.nodes.set(id, node);
    this.indexNode(node);
    return node;
  }

  /** Patch an existing node. Arrays union, numbers overwrite when provided. */
  updateNode(id: string, patch: Partial<NodeInput>): IntelNode | undefined {
    const node = this.nodes.get(normalizeKey(id)) ?? this.nodes.get(id);
    if (!node) return undefined;

    if (patch.label) node.label = patch.label;
    if (patch.type) this.reindexType(node, patch.type);
    if (patch.description !== undefined) node.description = patch.description;
    if (patch.confidence !== undefined) node.confidence = clamp(patch.confidence);
    if (patch.conviction !== undefined) node.conviction = clamp(patch.conviction);
    if (patch.momentum !== undefined) node.momentum = patch.momentum;
    if (patch.persistence !== undefined) node.persistence = clamp(patch.persistence);
    if (patch.importance !== undefined) node.importance = clamp(patch.importance);
    if (patch.mentionCount !== undefined) node.mentionCount = patch.mentionCount;
    if (patch.firstSeen !== undefined) node.firstSeen = Math.min(node.firstSeen, patch.firstSeen);
    node.lastSeen = Math.max(node.lastSeen, patch.lastSeen ?? now());
    if (patch.aliases?.length || patch.label) {
      node.aliases = uniq([node.label, ...node.aliases, ...(patch.aliases ?? [])]);
    }
    if (patch.sources?.length) node.sources = uniq([...node.sources, ...patch.sources]);
    if (patch.metadata) node.metadata = { ...node.metadata, ...patch.metadata };

    this.indexNode(node); // refresh alias index for any new aliases
    return node;
  }

  getNode(idOrAlias: string): IntelNode | undefined {
    const direct = this.nodes.get(idOrAlias) ?? this.nodes.get(normalizeKey(idOrAlias));
    if (direct) return direct;
    const viaAlias = this.aliasIndex.get(normalizeKey(idOrAlias));
    return viaAlias ? this.nodes.get(viaAlias) : undefined;
  }

  removeNode(id: string): boolean {
    const node = this.getNode(id);
    if (!node) return false;
    for (const eid of [...(this.outEdges.get(node.id) ?? []), ...(this.inEdges.get(node.id) ?? [])]) {
      this.removeRelationshipById(eid);
    }
    this.outEdges.delete(node.id);
    this.inEdges.delete(node.id);
    this.typeIndex.get(node.type)?.delete(node.id);
    for (const a of node.aliases) if (this.aliasIndex.get(normalizeKey(a)) === node.id) this.aliasIndex.delete(normalizeKey(a));
    this.aliasIndex.delete(node.id);
    return this.nodes.delete(node.id);
  }

  /* ----- relationships ----- */

  /**
   * Insert or upsert a directed relationship. Re-asserting an existing edge does
   * not duplicate it: evidenceCount increments, originatingPages union, strength /
   * confidence take the stronger reading, lastObserved advances.
   */
  addRelationship(input: EdgeInput): IntelEdge | undefined {
    const src = this.getNode(input.source)?.id;
    const tgt = this.getNode(input.target)?.id;
    if (!src || !tgt) return undefined; // both endpoints must exist

    const id = edgeId(src, input.relationshipType, tgt);
    const ts = now();
    const existing = this.edges.get(id);
    if (existing) {
      existing.evidenceCount += input.evidenceCount ?? 1;
      existing.lastObserved   = Math.max(existing.lastObserved, input.lastObserved ?? ts);
      if (input.strength   !== undefined) existing.strength   = Math.max(existing.strength, clamp(input.strength));
      if (input.confidence !== undefined) existing.confidence = Math.max(existing.confidence, clamp(input.confidence));
      if (input.originatingPages?.length) existing.originatingPages = uniq([...existing.originatingPages, ...input.originatingPages]);
      return existing;
    }

    const edge: IntelEdge = {
      id, source: src, target: tgt,
      relationshipType: input.relationshipType,
      strength:         clamp(input.strength ?? 50),
      confidence:       clamp(input.confidence ?? 50),
      firstObserved:    input.firstObserved ?? ts,
      lastObserved:     input.lastObserved ?? ts,
      evidenceCount:    input.evidenceCount ?? 1,
      originatingPages: uniq(input.originatingPages ?? []),
    };
    this.edges.set(id, edge);
    (this.outEdges.get(src) ?? this.setGet(this.outEdges, src)).add(id);
    (this.inEdges.get(tgt) ?? this.setGet(this.inEdges, tgt)).add(id);
    return edge;
  }

  removeRelationship(source: string, relationshipType: RelationshipType, target: string): boolean {
    const src = this.getNode(source)?.id;
    const tgt = this.getNode(target)?.id;
    if (!src || !tgt) return false;
    return this.removeRelationshipById(edgeId(src, relationshipType, tgt));
  }

  /** All edges touching a node, in either direction (or filtered by direction). */
  getRelationships(id: string, direction: "out" | "in" | "both" = "both"): IntelEdge[] {
    const node = this.getNode(id);
    if (!node) return [];
    const ids = new Set<string>();
    if (direction !== "in") for (const e of this.outEdges.get(node.id) ?? []) ids.add(e);
    if (direction !== "out") for (const e of this.inEdges.get(node.id) ?? []) ids.add(e);
    return [...ids].map(e => this.edges.get(e)!).filter(Boolean);
  }

  /**
   * Neighboring nodes, optionally filtered by relationship type and/or direction.
   * O(degree). Returns each neighbor once with the connecting edge.
   *
   * OP4.1 isolation: canonical Event nodes are EXCLUDED by default so the
   * legacy reasoning engines (evidence/inference/causal — LEGACY-PATH until
   * OP4.3) never see them; consumers of the canonical event layer opt in with
   * includeEventNodes. This is the sanctioned kind filter, not a hidden one —
   * remove the default when OP4.3 retires the legacy engines.
   */
  getNeighbors(
    id: string,
    opts: { relationshipType?: RelationshipType; direction?: "out" | "in" | "both";
            includeEventNodes?: boolean } = {},
  ): Array<{ node: IntelNode; edge: IntelEdge }> {
    const self = this.getNode(id);
    if (!self) return [];
    const out: Array<{ node: IntelNode; edge: IntelEdge }> = [];
    const seen = new Set<string>();
    for (const edge of this.getRelationships(self.id, opts.direction ?? "both")) {
      if (opts.relationshipType && edge.relationshipType !== opts.relationshipType) continue;
      const otherId = edge.source === self.id ? edge.target : edge.source;
      if (seen.has(otherId)) continue;
      const node = this.nodes.get(otherId);
      if (!node) continue;
      if (node.type === "Event" && !opts.includeEventNodes) continue;
      seen.add(otherId);
      out.push({ node, edge });
    }
    return out;
  }

  /* ----- search ----- */

  /**
   * Find nodes by fuzzy label / alias match, optionally scoped to types. Ranked by
   * importance then mentionCount. Linear over the node set but cheap per node;
   * swap in a token index here if scale ever demands it.
   */
  searchNodes(query: string, opts: { types?: NodeType[]; limit?: number } = {}): IntelNode[] {
    const q = normalizeKey(query);
    if (!q) return [];
    const typeSet = opts.types ? new Set(opts.types) : null;

    // Exact alias hit first (O(1)).
    const exactId = this.aliasIndex.get(q);
    const exact = exactId ? this.nodes.get(exactId) : undefined;

    const hits: IntelNode[] = [];
    for (const node of this.nodes.values()) {
      if (typeSet && !typeSet.has(node.type)) continue;
      if (node === exact) continue;
      const match = node.aliases.some(a => { const k = normalizeKey(a); return k === q || k.includes(q) || q.includes(k); });
      if (match) hits.push(node);
    }
    hits.sort((a, b) => (b.importance - a.importance) || (b.mentionCount - a.mentionCount));
    const ranked = exact && (!typeSet || typeSet.has(exact.type)) ? [exact, ...hits] : hits;
    return opts.limit ? ranked.slice(0, opts.limit) : ranked;
  }

  /* ----- duplicate resolution ----- */

  /**
   * Merge two nodes that represent the same entity. `loserId` folds into `winnerId`:
   * aliases / sources union, counts sum, timestamps widen, edges re-point to the
   * winner (deduping). Numeric signals inherit from whichever node is more important.
   */
  mergeNodes(winnerId: string, loserId: string): IntelNode | undefined {
    const winner = this.getNode(winnerId);
    const loser  = this.getNode(loserId);
    if (!winner || !loser || winner.id === loser.id) return winner;

    const dominant = loser.importance > winner.importance ? loser : winner;
    winner.aliases      = uniq([winner.label, ...winner.aliases, loser.label, ...loser.aliases]);
    winner.sources      = uniq([...winner.sources, ...loser.sources]);
    winner.mentionCount = winner.mentionCount + loser.mentionCount;
    winner.firstSeen    = Math.min(winner.firstSeen, loser.firstSeen);
    winner.lastSeen     = Math.max(winner.lastSeen, loser.lastSeen);
    winner.importance   = Math.max(winner.importance, loser.importance);
    winner.confidence   = dominant.confidence;
    winner.conviction   = dominant.conviction;
    winner.momentum     = dominant.momentum;
    winner.persistence  = dominant.persistence;
    winner.metadata     = { ...loser.metadata, ...winner.metadata };
    if (!winner.description && loser.description) winner.description = loser.description;

    // Re-point every edge on the loser onto the winner, then drop the loser.
    for (const edge of this.getRelationships(loser.id, "both")) {
      const source = edge.source === loser.id ? winner.id : edge.source;
      const target = edge.target === loser.id ? winner.id : edge.target;
      if (source !== target) {
        this.addRelationship({
          source, target,
          relationshipType: edge.relationshipType,
          strength: edge.strength, confidence: edge.confidence,
          firstObserved: edge.firstObserved, lastObserved: edge.lastObserved,
          evidenceCount: edge.evidenceCount, originatingPages: edge.originatingPages,
        });
      }
      this.removeRelationshipById(edge.id);
    }
    this.removeNode(loser.id);
    this.indexNode(winner);
    return winner;
  }

  /**
   * Sweep the graph and merge any nodes that share a normalized alias (same type).
   * Simple alias merging, no per-type heuristics. Returns the number of merges.
   */
  mergeDuplicateNodes(): number {
    let merges = 0;
    const byKey = new Map<string, string>(); // `${type}:${aliasKey}` -> canonical nodeId
    // Iterate a snapshot: merges mutate the node set.
    for (const node of [...this.nodes.values()]) {
      if (!this.nodes.has(node.id)) continue; // already merged away
      for (const alias of node.aliases) {
        const key = `${node.type}:${normalizeKey(alias)}`;
        const owner = byKey.get(key);
        if (owner && owner !== node.id && this.nodes.has(owner)) {
          const kept = this.mergeNodes(owner, node.id);
          if (kept) { merges++; break; }
        } else {
          byKey.set(key, node.id);
        }
      }
    }
    return merges;
  }

  /* ----- bulk / introspection ----- */

  allNodes(): IntelNode[] { return [...this.nodes.values()]; }
  allEdges(): IntelEdge[] { return [...this.edges.values()]; }
  nodesOfType(type: NodeType): IntelNode[] {
    return [...(this.typeIndex.get(type) ?? [])].map(id => this.nodes.get(id)!).filter(Boolean);
  }
  stats(): { nodes: number; edges: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    for (const [t, set] of this.typeIndex) byType[t] = set.size;
    return { nodes: this.nodes.size, edges: this.edges.size, byType };
  }
  clear(): void {
    this.nodes.clear(); this.edges.clear();
    this.aliasIndex.clear(); this.typeIndex.clear();
    this.outEdges.clear(); this.inEdges.clear();
  }

  /* ----- private index maintenance ----- */

  private candidateKeys(id: string | undefined, label: string, aliases?: string[]): string[] {
    return uniq([
      ...(id ? [normalizeKey(id)] : []),
      normalizeKey(label),
      ...(aliases ?? []).map(normalizeKey),
    ].filter(Boolean));
  }
  private findByKeys(keys: string[]): string | undefined {
    for (const k of keys) {
      if (this.nodes.has(k)) return k;
      const owner = this.aliasIndex.get(k);
      if (owner) return owner;
    }
    return undefined;
  }
  private indexNode(node: IntelNode): void {
    this.aliasIndex.set(node.id, node.id);
    for (const a of node.aliases) this.aliasIndex.set(normalizeKey(a), node.id);
    (this.typeIndex.get(node.type) ?? this.setGet(this.typeIndex, node.type)).add(node.id);
  }
  private reindexType(node: IntelNode, next: NodeType): void {
    if (node.type === next) return;
    this.typeIndex.get(node.type)?.delete(node.id);
    node.type = next;
    (this.typeIndex.get(next) ?? this.setGet(this.typeIndex, next)).add(node.id);
  }
  private removeRelationshipById(id: string): boolean {
    const edge = this.edges.get(id);
    if (!edge) return false;
    this.outEdges.get(edge.source)?.delete(id);
    this.inEdges.get(edge.target)?.delete(id);
    return this.edges.delete(id);
  }
  private setGet<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
    const set = new Set<V>();
    map.set(key, set);
    return set;
  }
}

/* ------------------------------------------------------------------ *
 * Canonical singleton + bound convenience API
 * ------------------------------------------------------------------ */

/** The one shared graph instance for the whole app. */
export const intelligenceGraph = new IntelligenceGraph();

export const addNode            = (n: NodeInput) => intelligenceGraph.addNode(n);
export const updateNode         = (id: string, p: Partial<NodeInput>) => intelligenceGraph.updateNode(id, p);
export const removeNode         = (id: string) => intelligenceGraph.removeNode(id);
export const getNode            = (id: string) => intelligenceGraph.getNode(id);
export const addRelationship    = (e: EdgeInput) => intelligenceGraph.addRelationship(e);
export const removeRelationship = (s: string, t: RelationshipType, tgt: string) => intelligenceGraph.removeRelationship(s, t, tgt);
export const getRelationships   = (id: string, d?: "out" | "in" | "both") => intelligenceGraph.getRelationships(id, d);
export const getNeighbors       = (id: string, o?: { relationshipType?: RelationshipType; direction?: "out" | "in" | "both" }) => intelligenceGraph.getNeighbors(id, o);
export const searchNodes        = (q: string, o?: { types?: NodeType[]; limit?: number }) => intelligenceGraph.searchNodes(q, o);
export const mergeNodes         = (winner: string, loser: string) => intelligenceGraph.mergeNodes(winner, loser);
export const mergeDuplicateNodes = () => intelligenceGraph.mergeDuplicateNodes();
