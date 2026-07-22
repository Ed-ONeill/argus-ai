/**
 * lib/intelligenceGraphAdapters.ts - the adapter layer for the Market Intelligence Graph.
 *
 * Translates existing Argus data (Feed / Themes / Markets / Industries / M&A /
 * Private Markets / Listen / Theme Snapshots) into nodes and relationships on the
 * single canonical `intelligenceGraph` singleton. No second graph, no graph logic
 * duplicated here: adapters only shape existing data into addNode / addRelationship
 * calls, tag each contribution with its source page, and lean on the graph's alias
 * merging so NVDA / Nvidia / NVIDIA collapse into one company.
 *
 * Pure-ish and tolerant: every item is guarded, missing data never throws, and each
 * ingest returns { nodesAdded, relationshipsAdded, duplicatesMerged, errorsSkipped }.
 * No UI. No em/en dashes in produced strings.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import type { SourcePage, IntelNode } from "./intelligenceGraph";
import { observationEpochs } from "./timestamps";
import { tickerInfo } from "./tickerMetadata";
import type { ThemeIntelligence, StoryCluster, FeedItem, Episode } from "./types";
import { matchEpisodeThemesDetailed } from "./listenIntelligence";
import type { ThemeSnapshot } from "./themeSnapshots";
import type { MADeal } from "@/hooks/useMAIntelligence";

/* ------------------------------------------------------------------ *
 * Stats + shared helpers
 * ------------------------------------------------------------------ */

export interface IngestStats {
  nodesAdded:         number;
  relationshipsAdded: number;
  duplicatesMerged:   number;
  errorsSkipped:      number;
}

const EMPTY_STATS: IngestStats = { nodesAdded: 0, relationshipsAdded: 0, duplicatesMerged: 0, errorsSkipped: 0 };

/** Wrap a unit of ingestion work and measure its effect on the graph. */
function runIngest(work: (fail: () => void) => void, merge = true): IngestStats {
  const before = G.stats();
  let errors = 0;
  try { work(() => { errors++; }); } catch { errors++; }
  const mid = G.stats();
  const duplicatesMerged = merge ? G.mergeDuplicateNodes() : 0;
  const after = G.stats();
  return {
    nodesAdded:         Math.max(0, mid.nodes - before.nodes),
    relationshipsAdded: Math.max(0, after.edges - before.edges),
    duplicatesMerged,
    errorsSkipped:      errors,
  };
}

const sumStats = (parts: IngestStats[]): IngestStats => parts.reduce((a, s) => ({
  nodesAdded:         a.nodesAdded + s.nodesAdded,
  relationshipsAdded: a.relationshipsAdded + s.relationshipsAdded,
  duplicatesMerged:   a.duplicatesMerged + s.duplicatesMerged,
  errorsSkipped:      a.errorsSkipped + s.errorsSkipped,
}), { ...EMPTY_STATS });

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isTicker = (t: string): boolean => /^[A-Z][A-Z.]{0,5}$/.test(t);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

// Strip corporate suffixes so "NVIDIA Corporation" -> "NVIDIA" (a merge-friendly alias).
const CORP_SUFFIX = /\b(corporation|corp|incorporated|inc|holdings|holding|company|co|plc|ltd|limited|group|sa|nv|ag|lp|llc)\b/gi;
function shortName(name: string): string {
  return name.replace(CORP_SUFFIX, "").replace(/[.,]/g, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * Upsert a company from a ticker or a plain name and return its canonical id.
 * Tickers are enriched with full-name + short-name aliases from tickerMetadata so
 * later name mentions (Nvidia / NVIDIA) merge into the same node.
 */
function addCompany(entity: string, source: SourcePage): string | null {
  const raw = s(entity);
  if (!raw) return null;
  const sym = raw.toUpperCase();
  const info = isTicker(sym) ? tickerInfo(sym) : null;
  if (info) {
    const node = G.addNode({
      label: sym, type: "Company",
      aliases: [sym, info.name, shortName(info.name)],
      sources: [source],
      metadata: { ticker: sym, sector: info.sector, exchange: info.exchange },
    });
    return node.id;
  }
  const node = G.addNode({
    label: raw, type: "Company",
    aliases: [raw, shortName(raw)],
    sources: [source],
  });
  return node.id;
}

/** Upsert a simple typed node (Theme / Sector / Macro / Fund / Person ...) by label. */
function addLabeled(label: string, type: IntelNode["type"], source: SourcePage): string | null {
  const l = s(label);
  if (!l) return null;
  const node = G.addNode({ label: l, type, aliases: [l, shortName(l)], sources: [source] });
  return node.id;
}

const link = (
  source: string | null,
  relationshipType: string,
  target: string | null,
  opts: { strength?: number; confidence?: number; page: SourcePage },
): void => {
  if (!source || !target || source === target) return;
  G.addRelationship({
    source, target, relationshipType,
    strength: opts.strength, confidence: opts.confidence,
    originatingPages: [opts.page],
  });
};

/* ------------------------------------------------------------------ *
 * 1 - Themes
 * ------------------------------------------------------------------ */

const PAGE_THEMES: SourcePage = "Theme Intelligence";

/** Stable node id/label for a theme (name before a dash/colon qualifier). */
function themeLabel(t: { name: string }): string {
  return t.name.replace(/\s*[-:].*$/, "").trim() || t.name;
}

function addTheme(t: ThemeIntelligence, source: SourcePage = PAGE_THEMES): string | null {
  const label = themeLabel(t);
  if (!label) return null;
  const node = G.addNode({
    label, type: "Theme",
    aliases: [label, t.name, shortName(label), ...(t.id ? [t.id] : [])],
    description: s(t.description) || s(t.causal_narrative),
    confidence:  num(t.confidence, 50),
    conviction:  num(t.confidence, 50),
    momentum:    num(t.momentum_delta),
    persistence: num(t.persistence_score),
    importance:  num(t.confidence, 0),
    mentionCount: num(t.contributing_story_count),
    sources: [source],
    metadata: { momentumLabel: t.momentum_label, signalStrength: t.signal_strength, breadth: t.breadth_score },
  });
  return node.id;
}

export function ingestThemes(themes: ThemeIntelligence[]): IngestStats {
  if (!themes?.length) return { ...EMPTY_STATS };
  return runIngest(fail => {
    for (const t of themes) {
      try {
        const themeId = addTheme(t);
        if (!themeId) { fail(); continue; }
        const strength = num(t.confidence, 50);

        for (const asset of t.related_assets ?? []) {
          const c = addCompany(asset, PAGE_THEMES);
          link(themeId, "supports", c, { strength, confidence: strength, page: PAGE_THEMES });
        }
        for (const ind of t.related_industries ?? []) {
          const sec = addLabeled(ind, "Sector", PAGE_THEMES);
          link(themeId, "affects",    sec, { strength, page: PAGE_THEMES });
          link(themeId, "correlates", sec, { strength, page: PAGE_THEMES });
        }
        for (const macro of t.related_macro_factors ?? []) {
          const m = addLabeled(macro, "Macro", PAGE_THEMES);
          link(m, "drives", themeId, { strength, confidence: strength, page: PAGE_THEMES });
        }
      } catch { fail(); }
    }
  });
}

/* ------------------------------------------------------------------ *
 * 2 - Stories (feed items or clusters)
 * ------------------------------------------------------------------ */

const PAGE_FEED: SourcePage = "Feed";
type StoryInput = StoryCluster | FeedItem;
const isCluster = (x: StoryInput): x is StoryCluster => "primary" in x && !!(x as StoryCluster).primary;

export function ingestStories(stories: StoryInput[], themes: ThemeIntelligence[] = []): IngestStats {
  if (!stories?.length) return { ...EMPTY_STATS };
  return runIngest(fail => {
    for (const raw of stories) {
      try {
        const item: FeedItem = isCluster(raw) ? raw.primary : raw;
        const themeLbl = isCluster(raw) ? raw.theme_label : "";
        // OP4.0 — real observation times from the payload. When present they
        // replace the Date.now() default that saturated freshness (audit C2);
        // when absent, the default stands and the gap is the backend's to
        // close — never fabricated here from display strings.
        const epochs = observationEpochs(item);
        const storyId = G.addNode({
          label: s(item.title) || raw.id, type: "Story",
          aliases: [raw.id, s(item.title)],
          description: s(item.summary),
          importance: num(item.signal_score),
          sources: [PAGE_FEED],
          ...(epochs ?? {}),
          metadata: {
            url: item.url, source: item.source, category: item.category,
            published: item.published, published_ts: item.published_ts ?? null,
            fetched_at: item.fetched_at ?? null,
          },
        }).id;

        for (const entity of item.affected_entities ?? []) {
          const c = addCompany(entity, PAGE_FEED);
          link(storyId, "mentions", c, { strength: num(item.signal_score, 40), page: PAGE_FEED });
        }

        // Theme link: cluster theme_label, then any theme claiming this cluster/story.
        if (themeLbl) {
          const th = G.addNode({ label: themeLbl, type: "Theme", aliases: [themeLbl], sources: [PAGE_FEED] }).id;
          link(storyId, "mentions", th, { page: PAGE_FEED });
          link(storyId, "supports", th, { strength: num(item.signal_score, 40), page: PAGE_FEED });
        }
        for (const t of themes) {
          if ((t.contributing_cluster_ids ?? []).includes(raw.id)) {
            const th = addTheme(t, PAGE_FEED);
            link(storyId, "mentions", th, { page: PAGE_FEED });
            link(storyId, "supports", th, { strength: num(item.signal_score, 40), page: PAGE_FEED });
          }
        }
      } catch { fail(); }
    }
  });
}

/* ------------------------------------------------------------------ *
 * 3 - Listen (podcast episodes)
 * ------------------------------------------------------------------ */

const PAGE_LISTEN: SourcePage = "Listen";

export function ingestListen(
  episodes: Episode[],
  matchedThemes: Array<ThemeIntelligence | string> = [],
  opts: { speakersByEpisode?: Record<string, string[]> } = {},
): IngestStats {
  if (!episodes?.length) return { ...EMPTY_STATS };

  // D14 fix (P2.7): each Podcast node links only to ITS OWN matched themes
  // (the deterministic per-episode matcher over the canonical theme set),
  // never the global matched-theme set - so Podcast->Theme edges carry real
  // per-episode signal. Edges stay "mentions" (metadata-level matching can
  // never record support).
  const themeObjs = matchedThemes.filter((t): t is ThemeIntelligence => typeof t !== "string");

  return runIngest(fail => {
    for (const ep of episodes) {
      try {
        const podId = G.addNode({
          label: s(ep.title) || ep.id, type: "Podcast",
          aliases: [ep.id, s(ep.title)],
          description: s(ep.why_it_matters) || s(ep.description),
          importance: num(ep.relevance_score),
          sources: [PAGE_LISTEN],
          metadata: { show: ep.show_name, publisher: ep.publisher, published: ep.published_at, url: ep.external_url },
        }).id;

        // Themes: episode topics + THIS episode's matched canonical themes.
        const perEpisode = themeObjs.length > 0
          ? matchEpisodeThemesDetailed(ep, themeObjs, 3).map(m => themeLabel(m.theme))
          : [];
        const epThemes = [...new Set([...(ep.topics ?? []).map(s), ...perEpisode])].filter(Boolean);
        const themeIds: string[] = [];
        for (const label of epThemes) {
          const th = G.addNode({ label, type: "Theme", aliases: [label], sources: [PAGE_LISTEN] }).id;
          themeIds.push(th);
          link(podId, "mentions", th, { strength: num(ep.relevance_score, 40), page: PAGE_LISTEN });
        }

        // Companies from entities.
        for (const entity of ep.entities ?? []) {
          const c = addCompany(entity, PAGE_LISTEN);
          link(podId, "mentions", c, { page: PAGE_LISTEN });
        }

        // People (speakers), when provided: Person mentions Theme.
        for (const person of opts.speakersByEpisode?.[ep.id] ?? []) {
          const pId = addLabeled(person, "Person", PAGE_LISTEN);
          for (const th of themeIds) link(pId, "mentions", th, { page: PAGE_LISTEN });
        }
      } catch { fail(); }
    }
  });
}

/* ------------------------------------------------------------------ *
 * 4 - M&A (deals)
 * ------------------------------------------------------------------ */

const PAGE_MA: SourcePage = "M&A";

export function ingestMA(deals: MADeal[], themes: ThemeIntelligence[] = []): IngestStats {
  if (!deals?.length) return { ...EMPTY_STATS };
  return runIngest(fail => {
    for (const d of deals) {
      try {
        const dealId = G.addNode({
          label: s(d.title) || d.id, type: "Deal",
          aliases: [d.id, s(d.title)],
          description: s(d.whyItMatters) || s(d.summary),
          importance: num(d.signalScore),
          sources: [PAGE_MA],
          metadata: { dealType: d.dealType, sector: d.sector, peFirm: d.peFirm, published: d.published, url: d.url },
        }).id;

        // Acquirer / target inference: PE firm (Fund) or first entity acquires the next.
        const companies = (d.entities ?? []).map(e => addCompany(e, PAGE_MA)).filter(Boolean) as string[];
        for (const c of companies) link(dealId, "mentions", c, { strength: num(d.signalScore, 50), page: PAGE_MA });

        const acquirer = d.peFirm ? addLabeled(d.peFirm, "Fund", PAGE_MA) : companies[0] ?? null;
        const target   = d.peFirm ? companies[0] ?? null : companies[1] ?? null;
        link(acquirer, "acquires", target, { strength: num(d.signalScore, 60), confidence: num(d.signalScore, 60), page: PAGE_MA });

        // Sector affected.
        const sec = addLabeled(d.sector, "Sector", PAGE_MA);
        link(dealId, "affects", sec, { strength: num(d.signalScore, 50), page: PAGE_MA });

        // Theme support: any theme whose sector / assets intersect this deal.
        for (const t of themes) {
          const sectors = (t.related_industries ?? []).map(x => x.toLowerCase());
          const assets  = (t.related_assets ?? []).map(x => x.toUpperCase());
          const hitsSector = d.sector && sectors.includes(d.sector.toLowerCase());
          const hitsAsset  = (d.entities ?? []).some(e => assets.includes(e.toUpperCase()));
          if (hitsSector || hitsAsset) {
            const th = addTheme(t, PAGE_MA);
            link(dealId, "supports", th, { strength: num(d.signalScore, 50), page: PAGE_MA });
          }
        }
      } catch { fail(); }
    }
  });
}

/* ------------------------------------------------------------------ *
 * 5 - Private Markets
 * ------------------------------------------------------------------ */

const PAGE_PRIVATE: SourcePage = "Private Markets";

/** Tolerant private-market signal shape (Private Markets has no single canonical type). */
export interface PrivateSignalInput {
  id?:         string;
  label:       string;                 // signal / flow label
  fund?:       string;
  company?:    string;
  companies?:  string[];
  sector?:     string;
  theme?:      string;
  direction?:  "inflow" | "outflow" | string;
  strength?:   number;                 // 0..100
  confidence?: number;                 // 0..100
}

export function ingestPrivateMarkets(signals: PrivateSignalInput[]): IngestStats {
  if (!signals?.length) return { ...EMPTY_STATS };
  return runIngest(fail => {
    for (const sig of signals) {
      try {
        const strength = num(sig.strength, 50);
        const conf     = num(sig.confidence, 50);
        const fundId   = sig.fund ? addLabeled(sig.fund, "Fund", PAGE_PRIVATE) : null;
        const companies = [sig.company, ...(sig.companies ?? [])]
          .map(c => (c ? addCompany(c, PAGE_PRIVATE) : null))
          .filter(Boolean) as string[];
        const sectorId = sig.sector ? addLabeled(sig.sector, "Sector", PAGE_PRIVATE) : null;
        const themeId  = sig.theme
          ? G.addNode({ label: s(sig.theme), type: "Theme", aliases: [s(sig.theme)], sources: [PAGE_PRIVATE] }).id
          : null;

        // Fund owns Company.
        for (const c of companies) link(fundId, "owns", c, { strength, confidence: conf, page: PAGE_PRIVATE });
        // Private signal supports Theme.
        if (themeId) link(fundId ?? companies[0] ?? sectorId, "supports", themeId, { strength, confidence: conf, page: PAGE_PRIVATE });
        // Capital flow affects Sector.
        if (sectorId) link(fundId ?? themeId ?? companies[0], "raises_demand_for", sectorId, { strength, page: PAGE_PRIVATE });
      } catch { fail(); }
    }
  });
}

/* ------------------------------------------------------------------ *
 * 6 - Theme Snapshots (historical memory)
 * ------------------------------------------------------------------ */

const PAGE_SNAPSHOTS: SourcePage = "Historical Snapshots";
const dateMs = (d: string): number => { const t = Date.parse(d); return Number.isFinite(t) ? t : Date.now(); };

export function ingestThemeSnapshots(snapshots: ThemeSnapshot[]): IngestStats {
  if (!snapshots?.length) return { ...EMPTY_STATS };
  return runIngest(fail => {
    // Group by theme, oldest first.
    const byTheme = new Map<string, ThemeSnapshot[]>();
    for (const snap of snapshots) {
      const key = snap.themeId || snap.themeName;
      if (!key) continue;
      (byTheme.get(key) ?? byTheme.set(key, []).get(key)!).push(snap);
    }

    for (const list of byTheme.values()) {
      try {
        list.sort((a, b) => a.date.localeCompare(b.date));
        const first = list[0], last = list[list.length - 1];
        const node = G.addNode({ label: last.themeName || last.themeId, type: "Theme", aliases: [last.themeName, last.themeId], sources: [PAGE_SNAPSHOTS] });
        G.updateNode(node.id, {
          conviction:  num(last.conviction, node.conviction),
          persistence: num(last.persistence, node.persistence),
          momentum:    num(last.acceleration, node.momentum),
          firstSeen:   dateMs(first.date),
          lastSeen:    dateMs(last.date),
          mentionCount: num(last.storyCount) + num(last.listenMentionCount),
          sources:     [PAGE_SNAPSHOTS],
          metadata: {
            history: list.map(sn => ({
              date: sn.date, conviction: sn.conviction, momentum: sn.momentum,
              persistence: sn.persistence, acceleration: sn.acceleration,
              storyCount: sn.storyCount, mnaDealCount: sn.mnaDealCount,
              listenMentionCount: sn.listenMentionCount,
            })),
            historyDepth: list.length,
          },
        });
      } catch { fail(); }
    }
  }, false); // snapshots only enrich existing themes; no cross-theme merge needed here
}

/* ------------------------------------------------------------------ *
 * 7 - Orchestration
 * ------------------------------------------------------------------ */

export interface CurrentState {
  themes?:         ThemeIntelligence[];
  stories?:        StoryInput[];
  storyThemes?:    ThemeIntelligence[];        // themes used to attribute stories
  episodes?:       Episode[];
  matchedThemes?:  Array<ThemeIntelligence | string>;
  speakersByEpisode?: Record<string, string[]>;
  deals?:          MADeal[];
  privateSignals?: PrivateSignalInput[];
  snapshots?:      ThemeSnapshot[];
}

export interface BuildResult {
  themes:         IngestStats;
  snapshots:      IngestStats;
  stories:        IngestStats;
  listen:         IngestStats;
  ma:             IngestStats;
  privateMarkets: IngestStats;
  total:          IngestStats;
}

/**
 * Ingest whatever current app data is available into the graph, tolerant of any
 * missing source. Themes go first (so companies / sectors / macros exist to link),
 * then snapshots enrich them, then the observational sources attach on top.
 */
export function buildGraphFromCurrentState(state: CurrentState = {}): BuildResult {
  const themes         = state.themes?.length         ? ingestThemes(state.themes)                                                  : { ...EMPTY_STATS };
  const snapshots      = state.snapshots?.length      ? ingestThemeSnapshots(state.snapshots)                                       : { ...EMPTY_STATS };
  const stories        = state.stories?.length        ? ingestStories(state.stories, state.storyThemes ?? state.themes ?? [])       : { ...EMPTY_STATS };
  const listen         = state.episodes?.length       ? ingestListen(state.episodes, state.matchedThemes ?? [], { speakersByEpisode: state.speakersByEpisode }) : { ...EMPTY_STATS };
  const ma             = state.deals?.length          ? ingestMA(state.deals, state.themes ?? [])                                   : { ...EMPTY_STATS };
  const privateMarkets = state.privateSignals?.length ? ingestPrivateMarkets(state.privateSignals)                                  : { ...EMPTY_STATS };

  return {
    themes, snapshots, stories, listen, ma, privateMarkets,
    total: sumStats([themes, snapshots, stories, listen, ma, privateMarkets]),
  };
}

/* ------------------------------------------------------------------ *
 * Dev helper: summarizeGraph()
 * ------------------------------------------------------------------ */

export interface GraphSummary {
  totalNodes:            number;
  totalRelationships:    number;
  nodesByType:           Record<string, number>;
  topConnectedNodes:     Array<{ id: string; label: string; type: string; degree: number }>;
  strongestRelationships: Array<{ source: string; target: string; type: string; strength: number; evidenceCount: number }>;
}

/** Read-only snapshot of the graph for debugging / dev inspection. */
export function summarizeGraph(limit = 10): GraphSummary {
  const stats = G.stats();
  const nodes = G.allNodes();
  const edges = G.allEdges();

  // Degree (out + in) per node in one O(E) pass.
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const topConnectedNodes = nodes
    .map(n => ({ id: n.id, label: n.label, type: n.type, degree: degree.get(n.id) ?? 0 }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, limit);

  const label = (id: string) => G.getNode(id)?.label ?? id;
  const strongestRelationships = [...edges]
    .sort((a, b) => (b.strength * b.confidence) - (a.strength * a.confidence) || b.evidenceCount - a.evidenceCount)
    .slice(0, limit)
    .map(e => ({ source: label(e.source), target: label(e.target), type: e.relationshipType, strength: e.strength, evidenceCount: e.evidenceCount }));

  return {
    totalNodes:         stats.nodes,
    totalRelationships: stats.edges,
    nodesByType:        stats.byType,
    topConnectedNodes,
    strongestRelationships,
  };
}
