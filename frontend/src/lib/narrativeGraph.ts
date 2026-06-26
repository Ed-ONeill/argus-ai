/**
 * lib/narrativeGraph.ts — narrative-propagation adapter for the graph engine.
 *
 * Builds a GraphModel from the Argus relationship graph so the SAME interactive
 * NetworkGraph that renders capital transmission can also render how a narrative
 * propagates across themes/sectors/commodities. Proof that the Phase-4 engine is
 * domain-agnostic and reusable.
 */

import { NARRATIVE_GRAPH, type NarrativeRelation } from "@/lib/argusReasoning";
import type { GraphModel, GraphNode, GraphEdge, RelationType } from "@/lib/graph/types";

// Narrative relation → graph relation type (drives colour + meaning).
const REL: Record<NarrativeRelation, RelationType> = {
  drives:     "capital-rotation",
  feeds:      "supplier",
  benefits:   "beneficiary",
  pressures:  "competitor",
  enables:    "second-order",
  constrains: "competitor",
  competes:   "competitor",
};

/** Two-hop narrative graph centred on a seed theme. */
export function buildNarrativeGraph(seed: string): GraphModel | null {
  if (!NARRATIVE_GRAPH[seed]) return null;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (n: GraphNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };

  add({ id: seed, label: seed, kind: "event", role: "theme", stage: 0, themes: [seed], reason: "Seed narrative", recenterable: true });

  const frontier: { name: string; depth: number }[] = [{ name: seed, depth: 0 }];
  const enqueued = new Set([seed]);
  while (frontier.length) {
    const { name, depth } = frontier.shift()!;
    if (depth >= 2) continue;
    for (const link of NARRATIVE_GRAPH[name] ?? []) {
      add({ id: link.to, label: link.to, kind: "theme", role: "theme", stage: depth + 1, themes: [link.to], reason: link.rationale, recenterable: true });
      edges.push({ source: name, target: link.to, type: REL[link.relation], weight: link.weight, stage: depth + 1, reason: link.rationale, themes: [name, link.to] });
      if (!enqueued.has(link.to)) { enqueued.add(link.to); frontier.push({ name: link.to, depth: depth + 1 }); }
    }
  }
  return { id: `narrative:${seed}`, centerId: seed, title: "Narrative Propagation", subtitle: seed, nodes, edges };
}
