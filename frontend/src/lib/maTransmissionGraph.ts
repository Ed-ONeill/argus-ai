/**
 * lib/maTransmissionGraph.ts - M&A adapter for the generic graph engine,
 * REWRITTEN in Phase 2.6 (D3): the network now renders RECORDED edges from
 * the shared intelligence graph. The previous version fabricated networks
 * from curated dictionaries (SECTOR_ROLES peers, deal-type "spines",
 * comparable chains); all of that is deleted. If the shared graph has not
 * recorded a relationship, it does not appear - the network can be sparse,
 * honestly.
 *
 * Pure translation: shared-graph nodes/edges -> the domain-agnostic
 * GraphModel consumed by components/graph/NetworkGraph. No meaning is
 * created here.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import { tickerInfo } from "./tickerMetadata";
import type { MADeal } from "@/hooks/useMAIntelligence";
import type { DealIntel } from "./maIntelligence";
import type { GraphModel, GraphNode, GraphEdge, RelationType } from "./graph/types";

const KIND_OF: Record<string, GraphNode["kind"]> = {
  Deal: "event", Company: "company", ETF: "company", Fund: "company",
  Sector: "sector", Industry: "sector",
  Theme: "theme", Narrative: "theme", Macro: "theme", MacroSeries: "theme",
};

function relTypeOf(relationshipType: string, nodeType: string): RelationType {
  if (/acquir/i.test(relationshipType)) return "acquirer";
  if (/weaken|contradict|pressur|disrupt|revers/i.test(relationshipType)) return "competitor";
  if (/supply|supplier/i.test(relationshipType)) return "supplier";
  if (/support|benefit|drive|strengthen/i.test(relationshipType)) return "beneficiary";
  if (nodeType === "Sector" || nodeType === "Industry") return "sector";
  if (nodeType === "Theme" || nodeType === "Narrative" || nodeType === "Macro") return "theme";
  return "cross-sector";
}

function toNode(id: string, label: string, nodeType: string, stage: number, reason: string, role?: RelationType): GraphNode {
  const isCompany = nodeType === "Company" || nodeType === "ETF";
  const info = isCompany ? tickerInfo(label) : null;
  return {
    id, label, kind: KIND_OF[nodeType] ?? "group", role, stage,
    ...(isCompany ? { ticker: label, name: info?.name, sector: info?.sector, isPublic: !!info } : {}),
    reason, recenterable: true,
  };
}

/**
 * Two-hop model around one RECORDED shared-graph entity. Every node and edge
 * corresponds to a real recorded relationship; reasons carry the recorded
 * relationship type. Returns null when the entity is not in the graph.
 */
export function buildEntityGraphModel(entityKey: string, title: string, subtitle?: string, maxFirst = 10, maxSecond = 5): GraphModel | null {
  const center = G.getNode(entityKey);
  if (!center) return null;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (n: GraphNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };

  add(toNode(center.id, center.label, String(center.type), 0, "Network centre (recorded entity)"));

  const first = G.getNeighbors(center.id).slice(0, maxFirst);
  for (const { node, edge } of first) {
    const ty = String(node.type);
    const rel = relTypeOf(edge.relationshipType, ty);
    add(toNode(node.id, node.label, ty, 1, `Recorded: ${edge.relationshipType.replace(/_/g, " ")} (strength ${Math.round(edge.strength)})`, rel));
    edges.push({ source: center.id, target: node.id, type: rel, weight: Math.max(0.15, Math.min(1, edge.strength / 100)), stage: 1, reason: edge.relationshipType.replace(/_/g, " ") });

    for (const second of G.getNeighbors(node.id).slice(0, maxSecond)) {
      if (second.node.id === center.id || seen.has(second.node.id)) continue;
      const sTy = String(second.node.type);
      if (sTy === "Story" || sTy === "Podcast") continue;   // keep the canvas readable
      const sRel = relTypeOf(second.edge.relationshipType, sTy);
      add(toNode(second.node.id, second.node.label, sTy, 2, `Recorded: ${second.edge.relationshipType.replace(/_/g, " ")}`, sRel));
      edges.push({ source: node.id, target: second.node.id, type: sRel, weight: Math.max(0.1, Math.min(1, second.edge.strength / 100)), stage: 2, reason: second.edge.relationshipType.replace(/_/g, " ") });
    }
  }

  if (nodes.length <= 1) return null;
  return { id: `recorded:${center.id}`, centerId: center.id, title, subtitle, nodes, edges };
}

/** Recorded network around a deal (the Deal adapter records Deal nodes with
    mentions/acquires/sector edges). Null when the deal is not in the graph. */
export function buildDealGraph(deal: MADeal, _intel: DealIntel): GraphModel | null {
  return (
    buildEntityGraphModel(deal.id, "Recorded Deal Network", deal.sector) ??
    buildEntityGraphModel(deal.title, "Recorded Deal Network", deal.sector)
  );
}

/** Recorded network around a company. Null when unresolved. */
export function buildCompanyGraph(ticker: string): GraphModel | null {
  return buildEntityGraphModel(ticker, "Recorded Company Network", ticker);
}

/** Recorded network around a theme/narrative. Null when unresolved. */
export function buildThemeGraph(label: string): GraphModel | null {
  return buildEntityGraphModel(label, "Recorded Narrative Network", label);
}
