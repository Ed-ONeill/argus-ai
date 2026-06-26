/**
 * lib/graph/types.ts — generic intelligence-graph model.
 *
 * Deliberately domain-agnostic. The same model powers the M&A capital
 * transmission network today and is intended to back theme propagation, sector
 * rotation, supply chains, ownership structures and macro transmission later.
 * Nothing here is hard-coded to M&A — adapters (e.g. maTransmissionGraph.ts)
 * translate a domain into this shape.
 */

export type RelationType =
  | "event"
  | "acquirer"
  | "target"
  | "sector"
  | "beneficiary"
  | "competitor"
  | "supplier"
  | "customer"
  | "second-order"
  | "capital-rotation"
  | "theme"
  | "cross-sector";

export interface GraphNode {
  id: string;
  label: string;                 // short on-canvas label (ticker or name)
  kind: "event" | "company" | "sector" | "theme" | "group";
  role?: RelationType;           // relationship to the network centre
  ticker?: string;
  name?: string;                 // full company / entity name
  sector?: string;
  exchange?: string;
  marketCap?: string;
  themes?: string[];
  reason?: string;               // why this node is connected
  confidence?: number;           // 0–100 institutional confidence
  beneficiaryScore?: number;     // 0–100 directional benefit
  stage?: number;                // timeline reveal index (0 = announcement)
  isPublic?: boolean;
  crossBorder?: boolean;
  megaCap?: boolean;
  recenterable?: boolean;        // can the graph re-centre on this node
}

export interface GraphEdge {
  source: string;
  target: string;
  type: RelationType;
  weight: number;                // 0–1 relationship strength
  themes?: string[];
  stage?: number;
  reason?: string;
}

export interface GraphModel {
  id: string;
  centerId: string;
  title: string;
  subtitle?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface RelationMeta { label: string; color: string }

// Distinct colour per relationship type — institutional palette, no neon.
export const RELATION_META: Record<RelationType, RelationMeta> = {
  event:             { label: "Event",            color: "#a78bfa" },
  acquirer:          { label: "Acquirer",         color: "#a78bfa" },
  target:            { label: "Target",           color: "#52b0c8" },
  sector:            { label: "Sector",           color: "#94a3b8" },
  beneficiary:       { label: "Beneficiary",      color: "#34d399" },
  competitor:        { label: "Competitor",       color: "#f87171" },
  supplier:          { label: "Supplier",         color: "#38bdf8" },
  customer:          { label: "Customer",         color: "#2dd4bf" },
  "second-order":    { label: "Second-order",     color: "#c4b5fd" },
  "capital-rotation":{ label: "Capital Rotation", color: "#fbbf24" },
  theme:             { label: "Theme",            color: "#fb923c" },
  "cross-sector":    { label: "Cross-sector",     color: "#64748b" },
};

// Relationship strength bands → human label.
export function weightLabel(w: number): "Very Strong" | "Medium" | "Weak" {
  return w >= 0.66 ? "Very Strong" : w >= 0.33 ? "Medium" : "Weak";
}

// Timeline stages used by playback (index = stage on nodes/edges).
export const TIMELINE_STAGES = ["Announcement", "Day 1", "Week 1", "Month 1", "Quarter"] as const;
