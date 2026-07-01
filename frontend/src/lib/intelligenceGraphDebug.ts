/**
 * lib/intelligenceGraphDebug.ts - dev/validation harness for the Market Intelligence Graph.
 *
 * Proves the graph can ingest real-shaped Argus data and produce useful intelligence
 * BEFORE any UI depends on it. Everything here is for development and validation:
 * sample-data seeding, an integrity checker, and per-entity intelligence reports.
 *
 * Not wired into any page. Safe to import in development (it does not run on import).
 * No UI. No em/en dashes in produced strings.
 *
 * Future integration sketch (do not enable in production UI yet):
 *
 *   import { buildGraphFromCurrentState } from "@/lib/intelligenceGraphAdapters";
 *   import { getThemeIntelligenceReport } from "@/lib/intelligenceGraphDebug";
 *
 *   // In a page/hook, once real data is available:
 *   buildGraphFromCurrentState({
 *     themes: feed.theme_intelligence,
 *     stories: feed.clusters,
 *     episodes: listen.allEpisodes,
 *     matchedThemes: listen.matchedThemeLabels,
 *     deals: ma.deals,
 *     privateSignals: private.signals,
 *     snapshots: getAllThemeSnapshots(),
 *   });
 *   const report = getThemeIntelligenceReport("AI Infrastructure");
 */

import { intelligenceGraph as G, normalizeKey } from "./intelligenceGraph";
import type { IntelNode, IntelEdge, NodeType } from "./intelligenceGraph";
import {
  ingestThemes, ingestStories, ingestListen, ingestMA, ingestPrivateMarkets, ingestThemeSnapshots,
  summarizeGraph, type GraphSummary, type PrivateSignalInput,
} from "./intelligenceGraphAdapters";
import type { ThemeIntelligence, StoryCluster, FeedItem, Episode } from "./types";
import type { ThemeSnapshot } from "./themeSnapshots";
import type { MADeal } from "@/hooks/useMAIntelligence";

/* ------------------------------------------------------------------ *
 * 1 - Sample data + seeding
 * ------------------------------------------------------------------ */

// Minimal factories: the adapters read a subset of each interface, so we cast
// partial literals to the full shape and let the adapters default the rest.
const T  = (o: Partial<ThemeIntelligence>): ThemeIntelligence => o as ThemeIntelligence;
const FI = (o: Partial<FeedItem>): FeedItem => o as FeedItem;
const CL = (o: Partial<StoryCluster> & { id: string; primary: FeedItem }): StoryCluster =>
  ({ related: [], cluster_score: 0, theme_label: "", story_count: 1, ...o } as StoryCluster);
const EP = (o: Partial<Episode> & { id: string; title: string }): Episode => o as Episode;
const SNAP = (o: Partial<ThemeSnapshot> & { themeName: string; date: string }): ThemeSnapshot => ({
  id: `${o.date}:${o.themeName}`,
  themeId: normalizeKey(o.themeName),
  conviction: 0, momentum: "stable", persistence: 0, breadth: 0, acceleration: 0,
  relatedCompanies: [], relatedSectors: [], sourceCount: 0, storyCount: 0, mnaDealCount: 0,
  listenMentionCount: 0, privateSignalScore: 0, topDrivers: [], topRisks: [], summary: "",
  ...o,
} as ThemeSnapshot);

function sampleData() {
  const themes: ThemeIntelligence[] = [
    T({
      id: "ai-infrastructure", name: "AI Infrastructure", description: "Build-out of compute, power and data centers for AI.",
      confidence: 82, momentum_delta: 6, momentum_label: "accelerating", persistence_score: 71, breadth_score: 64,
      contributing_cluster_ids: ["c1"], contributing_story_count: 5, signal_strength: "strong",
      related_assets: ["NVDA", "AVGO"], related_industries: ["Semiconductors", "Data Centers"],
      related_macro_factors: ["AI Capex", "Interest Rates"], causal_narrative: "Hyperscaler capex is compounding demand for accelerators.",
    }),
    T({
      id: "nuclear-energy", name: "Nuclear Energy", description: "Reactor and uranium demand from power-hungry compute.",
      confidence: 68, momentum_delta: 3, momentum_label: "strengthening", persistence_score: 55, breadth_score: 48,
      contributing_cluster_ids: ["c2"], contributing_story_count: 3, signal_strength: "medium",
      related_assets: ["CCJ"], related_industries: ["Utilities", "Energy"],
      related_macro_factors: ["Power Demand"], causal_narrative: "AI power draw revives baseload nuclear.",
    }),
  ];

  const stories: StoryCluster[] = [
    CL({ id: "c1", theme_label: "AI Infrastructure", story_count: 4,
      primary: FI({ id: "s1", title: "Nvidia raises data center outlook", url: "https://x/1", source: "Bloomberg",
        category: "Markets", published: "2026-06-27T12:00:00Z", signal_score: 88, signal_strength: "strong",
        affected_entities: ["Nvidia", "AVGO"], summary: "Nvidia lifts guidance on AI compute demand." }) }),
    CL({ id: "c2", theme_label: "Nuclear Energy", story_count: 2,
      primary: FI({ id: "s2", title: "Utilities sign nuclear power deals for data centers", url: "https://x/2", source: "Reuters",
        category: "Markets", published: "2026-06-26T09:00:00Z", signal_score: 71, signal_strength: "medium",
        affected_entities: ["CCJ", "TSM"], summary: "Grid operators contract nuclear baseload." }) }),
  ];

  const episodes: Episode[] = [
    EP({ id: "ep1", title: "The AI compute supercycle", show_name: "Odd Lots", publisher: "Bloomberg",
      description: "Where the AI capital is flowing.", why_it_matters: "Frames the compute build-out.",
      published_at: "2026-06-25T00:00:00Z", topics: ["AI Infrastructure"], entities: ["NVDA", "Microsoft"], relevance_score: 76 }),
  ];

  const deals: MADeal[] = [
    { id: "d1", title: "Synopsys to acquire Ansys", url: "https://x/d1", source: "WSJ", published: "2026-06-20",
      entities: ["Synopsys", "Ansys"], dealType: "merger", sector: "Semiconductors", peFirm: null,
      signalScore: 79, summary: "EDA consolidation.", whyItMatters: "Tightens the AI design toolchain." },
    { id: "d2", title: "KKR to take software vendor private", url: "https://x/d2", source: "FT", published: "2026-06-18",
      entities: ["ExampleSoft"], dealType: "sponsor", sector: "Software", peFirm: "KKR",
      signalScore: 64, summary: "Sponsor buyout.", whyItMatters: "PE re-engages software." },
  ];

  const privateSignals: PrivateSignalInput[] = [
    { label: "AI infrastructure capital inflow", fund: "Blackstone", company: "NVDA", sector: "Data Centers",
      theme: "AI Infrastructure", direction: "inflow", strength: 72, confidence: 66 },
  ];

  const snapshots: ThemeSnapshot[] = [
    SNAP({ themeName: "AI Infrastructure", date: "2026-06-23", conviction: 74, persistence: 62, acceleration: 3, momentum: "strengthening", storyCount: 3, listenMentionCount: 1, mnaDealCount: 0 }),
    SNAP({ themeName: "AI Infrastructure", date: "2026-06-27", conviction: 82, persistence: 71, acceleration: 6, momentum: "accelerating", storyCount: 5, listenMentionCount: 2, mnaDealCount: 1 }),
  ];

  return { themes, stories, episodes, deals, privateSignals, snapshots };
}

/**
 * Seed the graph from realistic sample data by exercising every adapter, then
 * return summarizeGraph() output. Resets the singleton first so results are
 * deterministic. For development / validation only.
 */
export function createDebugGraphFromSampleData({ reset = true }: { reset?: boolean } = {}): GraphSummary {
  if (reset) G.clear();
  const d = sampleData();
  ingestThemes(d.themes);
  ingestThemeSnapshots(d.snapshots);
  ingestStories(d.stories, d.themes);
  ingestListen(d.episodes, ["AI Infrastructure"], { speakersByEpisode: { ep1: ["Jensen Huang"] } });
  ingestMA(d.deals, d.themes);
  ingestPrivateMarkets(d.privateSignals);
  return summarizeGraph();
}

/* ------------------------------------------------------------------ *
 * 2 - Integrity validation
 * ------------------------------------------------------------------ */

export interface IntegrityReport {
  ok:                  boolean;
  nodeCount:           number;
  edgeCount:           number;
  orphanRelationships: Array<{ edge: string; missing: "source" | "target" | "both" }>;
  duplicateAliases:    Array<{ alias: string; nodeIds: string[] }>;
  emptyLabels:         string[];                 // node ids with blank labels
  missingEndpoints:    string[];                 // edge ids with a falsy source/target
  valueScale:          "0..1" | "0..100" | "empty";
  outOfRangeEdges:     Array<{ edge: string; field: "strength" | "confidence"; value: number }>;
}

/** Validate the graph is internally consistent. Pure read, safe to call anytime. */
export function validateGraphIntegrity(): IntegrityReport {
  const nodes = G.allNodes();
  const edges = G.allEdges();
  const nodeIds = new Set(nodes.map(n => n.id));

  const orphanRelationships: IntegrityReport["orphanRelationships"] = [];
  const missingEndpoints: string[] = [];
  for (const e of edges) {
    if (!e.source || !e.target) { missingEndpoints.push(e.id); continue; }
    const noSrc = !nodeIds.has(e.source);
    const noTgt = !nodeIds.has(e.target);
    if (noSrc || noTgt) orphanRelationships.push({ edge: e.id, missing: noSrc && noTgt ? "both" : noSrc ? "source" : "target" });
  }

  // Duplicate aliases: same normalized alias claimed by more than one node.
  const aliasOwners = new Map<string, Set<string>>();
  for (const n of nodes) for (const a of n.aliases) {
    const k = normalizeKey(a);
    if (!k) continue;
    (aliasOwners.get(k) ?? aliasOwners.set(k, new Set()).get(k)!).add(n.id);
  }
  const duplicateAliases = [...aliasOwners.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([alias, ids]) => ({ alias, nodeIds: [...ids] }));

  const emptyLabels = nodes.filter(n => !n.label || !n.label.trim()).map(n => n.id);

  // Value-scale consistency: our convention is 0..100. Detect scale and flag strays.
  let max = 0, any = false;
  const outOfRangeEdges: IntegrityReport["outOfRangeEdges"] = [];
  for (const e of edges) {
    for (const field of ["strength", "confidence"] as const) {
      const v = e[field];
      any = true;
      if (v > max) max = v;
      if (v < 0 || v > 100) outOfRangeEdges.push({ edge: e.id, field, value: v });
    }
  }
  const valueScale: IntegrityReport["valueScale"] = !any ? "empty" : max <= 1 ? "0..1" : "0..100";

  const ok = orphanRelationships.length === 0 && duplicateAliases.length === 0 &&
    emptyLabels.length === 0 && missingEndpoints.length === 0 && outOfRangeEdges.length === 0;

  return { ok, nodeCount: nodes.length, edgeCount: edges.length, orphanRelationships, duplicateAliases, emptyLabels, missingEndpoints, valueScale, outOfRangeEdges };
}

/* ------------------------------------------------------------------ *
 * 3 + 4 - Intelligence reports
 * ------------------------------------------------------------------ */

const PRIVATE_PAGE = "Private Markets";
const MA_PAGE = "M&A";

const describeEdge = (e: IntelEdge) => ({
  source: G.getNode(e.source)?.label ?? e.source,
  target: G.getNode(e.target)?.label ?? e.target,
  type: e.relationshipType, strength: e.strength, confidence: e.confidence,
  evidenceCount: e.evidenceCount, pages: e.originatingPages,
});

/** Neighboring nodes of a given type, deduped. */
function neighborsOfType(id: string, type: NodeType): IntelNode[] {
  return G.getNeighbors(id).filter(x => x.node.type === type).map(x => x.node);
}
/** Neighboring nodes reached by an edge originating from a given page. */
function neighborsFromPage(id: string, page: string): Array<{ node: IntelNode; edge: IntelEdge }> {
  return G.getNeighbors(id).filter(x => x.edge.originatingPages.includes(page));
}
function strongestFor(id: string, limit = 5) {
  return G.getRelationships(id)
    .sort((a, b) => (b.strength * b.confidence) - (a.strength * a.confidence) || b.evidenceCount - a.evidenceCount)
    .slice(0, limit)
    .map(describeEdge);
}

export interface ThemeIntelligenceReport {
  found:                 boolean;
  theme:                 IntelNode | null;
  relatedCompanies:      IntelNode[];
  relatedSectors:        IntelNode[];
  relatedStories:        IntelNode[];
  relatedPodcasts:       IntelNode[];
  relatedDeals:          IntelNode[];
  privateCapitalSignals: Array<{ node: IntelNode; via: string; strength: number }>;
  macroDrivers:          IntelNode[];
  strongestRelationships: ReturnType<typeof describeEdge>[];
  snapshotMemory:        unknown[] | null;
}

/** Everything the graph knows about a theme, pulled from its neighborhood. */
export function getThemeIntelligenceReport(themeOrId: string): ThemeIntelligenceReport {
  const theme = G.getNode(themeOrId) ?? null;
  if (!theme) return {
    found: false, theme: null, relatedCompanies: [], relatedSectors: [], relatedStories: [],
    relatedPodcasts: [], relatedDeals: [], privateCapitalSignals: [], macroDrivers: [],
    strongestRelationships: [], snapshotMemory: null,
  };
  const history = (theme.metadata?.history as unknown[]) ?? null;
  return {
    found: true,
    theme,
    relatedCompanies: neighborsOfType(theme.id, "Company"),
    relatedSectors:   neighborsOfType(theme.id, "Sector"),
    relatedStories:   neighborsOfType(theme.id, "Story"),
    relatedPodcasts:  neighborsOfType(theme.id, "Podcast"),
    relatedDeals:     neighborsOfType(theme.id, "Deal"),
    privateCapitalSignals: neighborsFromPage(theme.id, PRIVATE_PAGE).map(x => ({ node: x.node, via: x.edge.relationshipType, strength: x.edge.strength })),
    macroDrivers:     neighborsOfType(theme.id, "Macro"),
    strongestRelationships: strongestFor(theme.id),
    snapshotMemory:   history && history.length ? history : null,
  };
}

export interface CompanyIntelligenceReport {
  found:                  boolean;
  company:                IntelNode | null;
  relatedThemes:          IntelNode[];
  relatedSectors:         IntelNode[];
  stories:                IntelNode[];
  listenMentions:         IntelNode[];
  maRelationships:        ReturnType<typeof describeEdge>[];
  privateMarketRelationships: ReturnType<typeof describeEdge>[];
  strongestRelationships: ReturnType<typeof describeEdge>[];
}

/** Everything the graph knows about a company (ticker or name). */
export function getCompanyIntelligenceReport(tickerOrName: string): CompanyIntelligenceReport {
  const company = G.getNode(tickerOrName) ?? null;
  if (!company) return {
    found: false, company: null, relatedThemes: [], relatedSectors: [], stories: [],
    listenMentions: [], maRelationships: [], privateMarketRelationships: [], strongestRelationships: [],
  };
  // Sectors can come from an edge or from ticker metadata captured at ingest.
  const metaSector = typeof company.metadata?.sector === "string" ? String(company.metadata.sector) : null;
  const sectorNodes = neighborsOfType(company.id, "Sector");
  const relatedSectors = metaSector && !sectorNodes.some(n => n.label === metaSector)
    ? [...sectorNodes, G.getNode(metaSector)].filter(Boolean) as IntelNode[]
    : sectorNodes;

  return {
    found: true,
    company,
    relatedThemes:  neighborsOfType(company.id, "Theme"),
    relatedSectors,
    stories:        neighborsOfType(company.id, "Story"),
    listenMentions: neighborsOfType(company.id, "Podcast"),
    maRelationships: G.getRelationships(company.id)
      .filter(e => e.relationshipType === "acquires" || e.originatingPages.includes(MA_PAGE))
      .map(describeEdge),
    privateMarketRelationships: G.getRelationships(company.id)
      .filter(e => e.originatingPages.includes(PRIVATE_PAGE))
      .map(describeEdge),
    strongestRelationships: strongestFor(company.id),
  };
}
