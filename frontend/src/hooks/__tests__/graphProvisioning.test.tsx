// @vitest-environment happy-dom
/**
 * RC2 / Root Cause E — the graph PROVISIONING WIRING.
 *
 * lib/intelligenceGraphAdapters is already covered by lib/__tests__/ingestEvents.test.ts.
 * What was never covered is the hop between the canonical provisioning contract and the
 * adapter: useIntelligenceGraph destructured a fixed key list, so `events` and
 * `explanations` — supplied by useArgusIntelligence and mapped by canonicalGraphState —
 * were dropped before provisionGraphState ever saw them, and ingestEvents never ran in
 * production.
 *
 * These tests bind the wiring, not the adapter:
 *   1. events + explanations reach ingestEvents through the hook
 *   2. privateSignals reach ingestPrivateMarkets through the hook
 *   3. the pre-existing theme/story graph is unchanged by the restoration
 *   4. one render = one ingestion (no duplicate nodes/edges)
 *   5. honest absence survives when those layers are genuinely empty
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

import { intelligenceGraph as G } from "@/lib/intelligenceGraph";
import { useIntelligenceGraph } from "@/hooks/useIntelligenceGraph";
import { canonicalGraphState } from "@/lib/intelligenceProvisioning";
import type { PrivateSignalInput } from "@/lib/intelligenceGraphAdapters";
import type { MarketEvent, StoryCluster, ThemeIntelligence } from "@/lib/types";

const UID = "ev_01ABCDEFGHJKMNPQRSTVWXYZ0";

function theme(): ThemeIntelligence {
  return {
    id: "ai-energy-demand", name: "Grid Bottleneck Trade", description: "d",
    signal_strength: "strong", confidence: 70, momentum_direction: "bullish",
    related_industries: ["Utilities"], related_assets: ["NVDA"],
    related_macro_factors: [], contributing_cluster_ids: ["c1"],
    contributing_story_count: 3, second_order_effects: [], podcast_topics: [],
    last_updated: "2026-07-23T12:00:00+00:00",
  } as unknown as ThemeIntelligence;
}

const primary = {
  id: "c1", title: "Nvidia beats earnings", url: "https://t/n1",
  source: "Bloomberg Markets", category: "Markets", published: "2h ago",
  signal_score: 80, signal_strength: "strong", affected_entities: ["NVDA"],
  summary: "", why_it_matters: "", impact: "", snippet: "",
  published_ts: "2026-07-23T09:00:00+00:00",
};

function cluster(): StoryCluster {
  return { id: "c1", primary, related: [], cluster_score: 0.9,
           theme_label: "Grid Bottleneck Trade", story_count: 1 } as unknown as StoryCluster;
}

function event(): MarketEvent {
  return {
    id: "c1", title: "Nvidia beats earnings estimates and raises guidance",
    event_type: "earnings",
    first_seen: "2026-07-23T09:00:00+00:00", last_updated: "2026-07-23T11:30:00+00:00",
    corroboration_count: 3, source_count: 3, evidence: [],
    companies: ["NVDA", "TSM"], companies_direct: ["NVDA"],
    industries: ["Semiconductors"], theme_ids: ["ai-energy-demand"],
    confidence: 70, editorial_score: 62.5, why_it_matters: "",
    transmission: null, transmission_chain: [], dominant: false, developing: false,
    reporting_period: "Q2", merged_event_ids: [], uid: UID, cycles_observed: 3,
  } as MarketEvent;
}

const EXPLANATIONS = { [UID]: { event_uid: `event:${UID}`, engine_version: "ire-1.0" } };

const PRIVATE_SIGNALS: PrivateSignalInput[] = [
  { id: "pf1", label: "Take-private of Acme Grid", fund: "Blackstone",
    companies: ["ACME"], sector: "Utilities", theme: "Grid Bottleneck Trade",
    direction: "inflow", strength: 70, confidence: 65 },
];

/** Render the hook exactly as a production surface does: through the canonical mapping. */
function provisionViaHook(inputs: Parameters<typeof canonicalGraphState>[0]) {
  const state = canonicalGraphState(inputs);
  return renderHook(() => useIntelligenceGraph({ enabled: true, ...state }));
}

const nodesOfType = (t: string) => G.allNodes().filter((n) => n.type === t);
const graphShape = () => ({ nodes: G.allNodes().length, edges: G.allEdges().length });

beforeEach(() => G.clear());
afterEach(() => cleanup());

// ── 1. events + explanations survive the hook ────────────────────────────────
describe("useIntelligenceGraph — the canonical event layer reaches ingestEvents", () => {
  it("mints the Event node keyed by durable uid", () => {
    provisionViaHook({ themes: [theme()], clusters: [cluster()],
                       events: [event()], explanations: EXPLANATIONS });

    const node = G.getNode(`event:${UID}`);
    expect(node).toBeTruthy();
    expect(node!.type).toBe("Event");
    expect(node!.metadata.cluster_id).toBe("c1");
    expect(node!.confidence).toBe(80);   // corroboration-derived, not default-50
  });

  it("carries the canonical Explanation aboard the node", () => {
    provisionViaHook({ themes: [theme()], clusters: [cluster()],
                       events: [event()], explanations: EXPLANATIONS });
    expect(G.getNode(`event:${UID}`)!.metadata.explanation).toEqual(EXPLANATIONS[UID]);
  });

  it("reports the ingestion in BuildResult.events (not a silent zero)", () => {
    const { result } = provisionViaHook({ themes: [theme()], clusters: [cluster()],
                                          events: [event()], explanations: EXPLANATIONS });
    expect(result.current.build?.events.nodesAdded).toBeGreaterThan(0);
  });

  it("preserves attribution through the hook: names vs mentions", () => {
    provisionViaHook({ themes: [theme()], clusters: [cluster()], events: [event()] });
    const neigh = G.getNeighbors(`event:${UID}`, { includeEventNodes: true });
    const nvda = neigh.find((x) => x.node.aliases.includes("nvda") || x.node.aliases.includes("NVDA"));
    const tsm  = neigh.find((x) => x.node.aliases.includes("tsm")  || x.node.aliases.includes("TSM"));
    expect(nvda?.edge.relationshipType).toBe("names");
    expect(tsm?.edge.relationshipType).toBe("mentions");
  });
});

// ── 2. privateSignals survive the hook ───────────────────────────────────────
describe("useIntelligenceGraph — private signals reach ingestPrivateMarkets", () => {
  it("mints the Fund node and its ownership edge", () => {
    provisionViaHook({ themes: [theme()], privateSignals: PRIVATE_SIGNALS });

    const fund = nodesOfType("Fund").find((n) => /blackstone/i.test(n.label));
    expect(fund).toBeTruthy();
    const rels = G.getRelationships(fund!.id).map((r) => r.relationshipType);
    expect(rels).toContain("owns");
  });

  it("reports the ingestion in BuildResult.privateMarkets", () => {
    const { result } = provisionViaHook({ themes: [theme()], privateSignals: PRIVATE_SIGNALS });
    expect(result.current.build?.privateMarkets.nodesAdded).toBeGreaterThan(0);
  });
});

// ── 3. the legacy graph is unchanged by the restoration ──────────────────────
describe("existing theme/story graph behavior is unchanged", () => {
  function legacyShape() {
    G.clear();
    provisionViaHook({ themes: [theme()], clusters: [cluster()] });
    const shape = {
      themes:  nodesOfType("Theme").map((n) => n.label).sort(),
      stories: nodesOfType("Story").map((n) => n.label).sort(),
      // every non-Event node and every edge not touching an Event
      nodes:   G.allNodes().filter((n) => n.type !== "Event").map((n) => n.id).sort(),
    };
    cleanup();
    return shape;
  }

  it("theme and story nodes are identical with and without the event layer", () => {
    const before = legacyShape();

    G.clear();
    provisionViaHook({ themes: [theme()], clusters: [cluster()],
                       events: [event()], explanations: EXPLANATIONS });
    const after = {
      themes:  nodesOfType("Theme").map((n) => n.label).sort(),
      stories: nodesOfType("Story").map((n) => n.label).sort(),
      nodes:   G.allNodes().filter((n) => n.type !== "Event").map((n) => n.id).sort(),
    };

    expect(after.themes).toEqual(before.themes);
    expect(after.stories).toEqual(before.stories);
    // Event ingestion may ADD companies named by an event, but must never remove
    // or rename anything the legacy world already established.
    for (const id of before.nodes) expect(after.nodes).toContain(id);
  });

  it("Event nodes stay invisible to legacy neighbor reads", () => {
    provisionViaHook({ themes: [theme()], clusters: [cluster()],
                       events: [event()], explanations: EXPLANATIONS });
    const nvda = G.searchNodes("NVDA", { types: ["Company"], limit: 1 })[0];
    expect(nvda).toBeTruthy();
    expect(G.getNeighbors(nvda.id).some((x) => x.node.type === "Event")).toBe(false);
    expect(G.getNeighbors(nvda.id, { includeEventNodes: true })
            .some((x) => x.node.type === "Event")).toBe(true);
  });
});

// ── 4. no duplicate ingestion ────────────────────────────────────────────────
describe("duplicate ingestion does not occur", () => {
  it("a re-render with identical inputs leaves the graph shape unchanged", () => {
    const state = canonicalGraphState({ themes: [theme()], clusters: [cluster()],
                                        events: [event()], explanations: EXPLANATIONS,
                                        privateSignals: PRIVATE_SIGNALS });
    const { rerender } = renderHook(() => useIntelligenceGraph({ enabled: true, ...state }));
    const first = graphShape();
    rerender();
    rerender();
    expect(graphShape()).toEqual(first);
    expect(nodesOfType("Event")).toHaveLength(1);
  });

  it("the same event supplied twice in one pass yields one Event node", () => {
    provisionViaHook({ themes: [theme()], clusters: [cluster()],
                       events: [event(), event()], explanations: EXPLANATIONS });
    expect(nodesOfType("Event")).toHaveLength(1);
  });

  it("provisioning clears before rebuilding, so counts never accumulate", () => {
    provisionViaHook({ themes: [theme()], clusters: [cluster()], events: [event()] });
    const first = graphShape();
    cleanup();
    provisionViaHook({ themes: [theme()], clusters: [cluster()], events: [event()] });
    expect(graphShape()).toEqual(first);
  });
});

// ── 5. honest absence ────────────────────────────────────────────────────────
describe("honest absence when the layers are genuinely empty", () => {
  it("no events → no Event nodes, and BuildResult.events reports zero", () => {
    const { result } = provisionViaHook({ themes: [theme()], clusters: [cluster()],
                                          events: [], explanations: {} });
    expect(nodesOfType("Event")).toHaveLength(0);
    expect(result.current.build?.events)
      .toEqual({ nodesAdded: 0, relationshipsAdded: 0, duplicatesMerged: 0, errorsSkipped: 0 });
  });

  it("no private signals → no Fund nodes from the private page", () => {
    const { result } = provisionViaHook({ themes: [theme()], privateSignals: [] });
    expect(result.current.build?.privateMarkets)
      .toEqual({ nodesAdded: 0, relationshipsAdded: 0, duplicatesMerged: 0, errorsSkipped: 0 });
  });

  it("undefined layers are as safe as empty ones (partial payload)", () => {
    const { result } = provisionViaHook({ themes: [theme()], clusters: [cluster()] });
    expect(result.current.build?.events.nodesAdded).toBe(0);
    expect(result.current.build?.privateMarkets.nodesAdded).toBe(0);
    expect(result.current.ready).toBe(true);   // the rest of the graph still stands
  });

  it("an entirely empty input set still returns a usable, empty result", () => {
    const { result } = provisionViaHook({});
    expect(result.current.ready).toBe(false);
    expect(result.current.summary.totalNodes).toBe(0);
    expect(result.current.integrity.ok).toBe(true);
  });
});
