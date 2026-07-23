/**
 * OP4.1 (Sprint 4): canonical Market Events enter the intelligence graph as
 * Event nodes keyed by durable uid — corroboration, lane, cycles_observed,
 * and the canonical Explanation ride the node; attribution (names vs
 * mentions) is preserved; evidence links attach to existing story nodes only;
 * and the legacy engines cannot see any of it until OP4.3 (getNeighbors
 * excludes Event nodes by default — enforced here by output equality).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestEvents, ingestStories, ingestThemes } from "../intelligenceGraphAdapters";
import { evaluateEvidenceForNode } from "../evidenceEngine";
import type { MarketEvent, ThemeIntelligence } from "../types";

const UID = "ev_01ABCDEFGHJKMNPQRSTVWXYZ0";

function theme(overrides: Partial<ThemeIntelligence> = {}): ThemeIntelligence {
  return {
    id: "ai-energy-demand", name: "Grid Bottleneck Trade", description: "d",
    signal_strength: "strong", confidence: 70, momentum_direction: "bullish",
    related_industries: ["Utilities"], related_assets: ["NVDA"],
    related_macro_factors: [], contributing_cluster_ids: ["c1"],
    contributing_story_count: 3, second_order_effects: [], podcast_topics: [],
    last_updated: "2026-07-23T12:00:00+00:00",
    ...overrides,
  } as ThemeIntelligence;
}

function event(overrides: Partial<MarketEvent> = {}): MarketEvent {
  return {
    id: "c1", title: "Nvidia beats earnings estimates and raises guidance",
    event_type: "earnings",
    first_seen: "2026-07-23T09:00:00+00:00",
    last_updated: "2026-07-23T11:30:00+00:00",
    corroboration_count: 3, source_count: 3,
    evidence: [], companies: ["NVDA", "TSM"], companies_direct: ["NVDA"],
    industries: ["Semiconductors"], theme_ids: ["ai-energy-demand"],
    confidence: 70, editorial_score: 62.5, why_it_matters: "",
    transmission: null, transmission_chain: [], dominant: false,
    developing: false, reporting_period: "Q2", merged_event_ids: [],
    uid: UID, cycles_observed: 3,
    ...overrides,
  } as MarketEvent;
}

const EXPLANATIONS = { [UID]: { event_uid: `event:cluster:c1`, engine_version: "ire-1.0" } };

beforeEach(() => G.clear());

describe("ingestEvents", () => {
  it("creates an Event node keyed by uid with the canonical state aboard", () => {
    ingestEvents([event()], EXPLANATIONS);
    const node = G.getNode(`event:${UID}`);
    expect(node).toBeTruthy();
    expect(node!.type).toBe("Event");
    expect(node!.metadata.uid).toBe(UID);
    expect(node!.metadata.cluster_id).toBe("c1");
    expect(node!.metadata.lane).toBe("corroborated");
    expect(node!.metadata.corroboration_count).toBe(3);
    expect(node!.metadata.cycles_observed).toBe(3);
    expect(node!.metadata.explanation).toEqual(EXPLANATIONS[UID]);
    // real observation clock, not Date.now()
    expect(node!.firstSeen).toBe(Date.parse("2026-07-23T09:00:00+00:00"));
    expect(node!.lastSeen).toBe(Date.parse("2026-07-23T11:30:00+00:00"));
    // corroboration-derived confidence, never the default 50
    expect(node!.confidence).toBe(80);
  });

  it("preserves attribution: named companies via names, exposure via mentions", () => {
    ingestEvents([event()], {});
    const neigh = G.getNeighbors(`event:${UID}`, { includeEventNodes: true });
    const nvda = neigh.find(x => x.node.label.toUpperCase().includes("NVIDIA") || x.node.aliases.includes("NVDA"));
    const tsm = neigh.find(x => x.node.aliases.includes("TSM"));
    expect(nvda?.edge.relationshipType).toBe("names");
    expect(tsm?.edge.relationshipType).toBe("mentions");
  });

  it("links supported themes and evidences existing story nodes only", () => {
    ingestThemes([theme()]);
    ingestStories([{ id: "c1", title: "Nvidia beats earnings", url: "https://t/n1",
                     source: "Bloomberg Markets", category: "Markets", published: "2h ago",
                     signal_score: 80, signal_strength: "strong", affected_entities: [],
                     summary: "", why_it_matters: "", impact: "", snippet: "" } as never]);
    ingestEvents([event()], {}, [theme()]);
    const rels = G.getRelationships(`event:${UID}`);
    const types = rels.map(r => r.relationshipType);
    expect(types).toContain("supports");        // event → theme
    expect(types).toContain("evidenced_by");    // event → existing story node

    // absent story → no fabricated node
    G.clear();
    ingestEvents([event({ id: "c-unknown", uid: "ev_" + "9".repeat(26) })], {});
    const all = G.allNodes().filter(n => n.type === "Story");
    expect(all).toHaveLength(0);
  });

  it("falls back to cluster id when identity is off (uid empty)", () => {
    ingestEvents([event({ uid: "" })], {});
    expect(G.getNode("event:c1")).toBeTruthy();
    expect(G.getNode("event:c1")!.metadata.uid).toBeNull();
  });

  it("is never absorbed into its story even with an identical headline", () => {
    // production reality: event.title === cluster.primary.title, exactly
    const HEADLINE = "Nvidia beats earnings estimates and raises guidance";
    ingestStories([{ id: "c1", title: HEADLINE, url: "https://t/n1",
                     source: "Bloomberg Markets", category: "Markets", published: "2h ago",
                     signal_score: 80, signal_strength: "strong", affected_entities: [],
                     summary: "", why_it_matters: "", impact: "", snippet: "" } as never]);
    ingestEvents([event({ title: HEADLINE })], {});

    const eventNode = G.getNode(`event:${UID}`);
    const stories = G.allNodes().filter(n => n.type === "Story");
    expect(eventNode?.type).toBe("Event");
    expect(stories).toHaveLength(1);                       // story survives, distinct
    expect(stories[0].id).not.toBe(eventNode!.id);
    // and the evidence edge binds them instead of a merge erasing one
    const rels = G.getRelationships(eventNode!.id).map(r => r.relationshipType);
    expect(rels).toContain("evidenced_by");
  });
});

describe("legacy-engine isolation (until OP4.3)", () => {
  function legacyWorld() {
    ingestThemes([theme()]);
    ingestStories([{ id: "c1", title: "Nvidia beats earnings", url: "https://t/n1",
                     source: "Bloomberg Markets", category: "Markets", published: "2h ago",
                     signal_score: 80, signal_strength: "strong", affected_entities: ["NVDA"],
                     summary: "", why_it_matters: "", impact: "", snippet: "",
                     published_ts: "2026-07-23T09:00:00+00:00" } as never]);
  }

  it("getNeighbors hides Event nodes unless explicitly included", () => {
    legacyWorld();
    ingestEvents([event()], {});
    const nvdaId = G.searchNodes("NVDA", { limit: 1 })[0]?.id;
    expect(nvdaId).toBeTruthy();
    const defaultNeigh = G.getNeighbors(nvdaId!);
    expect(defaultNeigh.some(x => x.node.type === "Event")).toBe(false);
    const optedIn = G.getNeighbors(nvdaId!, { includeEventNodes: true });
    expect(optedIn.some(x => x.node.type === "Event")).toBe(true);
  });

  it("legacy evidence output is byte-identical with and without event ingestion", () => {
    legacyWorld();
    const before = JSON.stringify(evaluateEvidenceForNode("NVDA"));
    ingestEvents([event()], EXPLANATIONS);
    const after = JSON.stringify(evaluateEvidenceForNode("NVDA"));
    expect(after).toBe(before);
  });
});
