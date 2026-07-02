/**
 * lib/memoryEngine.ts - the Intelligence Memory Engine.
 *
 * Persists daily snapshots of every graph entity (themes, companies, sectors, macro
 * drivers, narratives, deals, podcasts, ...), tracks how their relationships evolve,
 * and stores the outputs of the Inference and Prediction engines over time. It then
 * reads that recorded history back as timelines, comparisons, patterns, analogs, and
 * evolution summaries.
 *
 * Everything is deterministic and derived only from recorded history. When there is
 * not enough history to answer, it returns a structured insufficient_history response
 * instead of inventing a conclusion. Pure library: no React, no UI, no em/en dashes.
 *
 * Persistence is transparent: an in-module store, auto-saved to localStorage when a
 * browser is present, in-memory otherwise. Callers can also serialize / load / reset.
 */

import { intelligenceGraph as G, normalizeKey } from "./intelligenceGraph";
import type { IntelNode } from "./intelligenceGraph";
import { num, round, avg, clamp01 } from "./intelligenceUtils";
import { inferTheme, inferCompany, inferSector } from "./inferenceEngine";
import { predictThemeTrajectory, predictCompanyTrajectory, predictSectorRotation } from "./predictionEngine";

/* ------------------------------------------------------------------ *
 * Data model
 * ------------------------------------------------------------------ */

export interface EdgeSignature {
  id: string; source: string; target: string; type: string;
  strength: number; confidence: number; evidenceCount: number;
}

export interface EntitySnapshot {
  date:              string;   // YYYY-MM-DD
  ts:                number;   // epoch ms
  confidence:        number;
  conviction:        number;
  momentum:          number;
  persistence:       number;
  evidenceCount:     number;   // sum of incident edge evidence
  relationshipCount: number;
  sourceCount:       number;
  mentionCount:      number;
  importance:        number;
  edges:             EdgeSignature[];
}

export interface InferenceRecord {
  date: string; ts: number; kind: "theme" | "company" | "sector";
  found: boolean; direction: string; confidence: number; thesis: string;
}

export interface PredictionRecord {
  date: string; ts: number; kind: "theme" | "company" | "sector";
  found: boolean; predictedDirection: string; probability: number | null; confidence: number;
}

export interface EntityTimeline {
  entityId:   string;
  entityType: string;
  label:      string;
  snapshots:  EntitySnapshot[];
  inferences: InferenceRecord[];
  predictions: PredictionRecord[];
}

interface MemoryDB { entities: Record<string, EntityTimeline> }

export interface InsufficientHistory {
  status: "insufficient_history";
  entityId: string;
  reason: string;
  have: number;
  need: number;
}
const insufficient = (entityId: string, have: number, need: number, reason: string): InsufficientHistory =>
  ({ status: "insufficient_history", entityId, reason, have, need });

/* ------------------------------------------------------------------ *
 * Persistence (transparent, deterministic)
 * ------------------------------------------------------------------ */

const KEY = "argus.memoryEngine.v1";
let _db: MemoryDB | null = null;

function loadDB(): MemoryDB {
  if (typeof window !== "undefined") {
    try { const raw = window.localStorage.getItem(KEY); if (raw) return JSON.parse(raw) as MemoryDB; } catch { /* ignore */ }
  }
  return { entities: {} };
}
function db(): MemoryDB { if (!_db) _db = loadDB(); return _db; }
function persist(): void {
  if (typeof window !== "undefined" && _db) {
    try { window.localStorage.setItem(KEY, JSON.stringify(_db)); } catch { /* quota / disabled */ }
  }
}

/** Clear all recorded memory. */
export function resetMemory(): void { _db = { entities: {} }; persist(); }
/** Serialize the full memory for external persistence (file, DB, etc.). */
export function serializeMemory(): string { return JSON.stringify(db()); }
/** Load memory from a serialized string. */
export function loadMemory(json: string): void { try { _db = JSON.parse(json) as MemoryDB; } catch { _db = { entities: {} }; } }

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const dateOf = (ts: number): string => new Date(ts).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string): number => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));

function resolveKey(idOrLabel: string): string {
  const node = G.getNode(idOrLabel);
  if (node) return node.id;
  const d = db();
  if (d.entities[idOrLabel]) return idOrLabel;
  return normalizeKey(idOrLabel);
}

function captureNode(node: IntelNode, date: string, ts: number): EntitySnapshot {
  const rels = G.getRelationships(node.id);
  return {
    date, ts,
    confidence: round(num(node.confidence)), conviction: round(num(node.conviction)),
    momentum: round(num(node.momentum)), persistence: round(num(node.persistence)),
    evidenceCount: rels.reduce((s, e) => s + num(e.evidenceCount), 0),
    relationshipCount: rels.length,
    sourceCount: node.sources.length,
    mentionCount: round(num(node.mentionCount)), importance: round(num(node.importance)),
    edges: rels.map(e => ({ id: e.id, source: e.source, target: e.target, type: e.relationshipType, strength: round(num(e.strength)), confidence: round(num(e.confidence)), evidenceCount: num(e.evidenceCount) })),
  };
}

/** Upsert a dated record (one per day) into a chronological list. */
function upsertByDate<T extends { date: string }>(list: T[], record: T): void {
  const i = list.findIndex(x => x.date === record.date);
  if (i >= 0) list[i] = record; else list.push(record);
  list.sort((a, b) => a.date.localeCompare(b.date));
}

function ensureTimeline(node: IntelNode): EntityTimeline {
  const d = db();
  let tl = d.entities[node.id];
  if (!tl) { tl = { entityId: node.id, entityType: node.type, label: node.label, snapshots: [], inferences: [], predictions: [] }; d.entities[node.id] = tl; }
  tl.entityType = node.type; tl.label = node.label;
  return tl;
}

/* ------------------------------------------------------------------ *
 * recordSnapshot
 * ------------------------------------------------------------------ */

export interface RecordOptions { now?: () => number }
export interface RecordStats {
  date: string; entitiesRecorded: number; snapshotsAdded: number; inferencesAdded: number; predictionsAdded: number;
}

/** Capture today's snapshot of every graph node, plus inference / prediction for supported types. */
export function recordSnapshot(options: RecordOptions = {}): RecordStats {
  const ts = (options.now ?? (() => Date.now()))();
  const date = dateOf(ts);
  let entitiesRecorded = 0, snapshotsAdded = 0, inferencesAdded = 0, predictionsAdded = 0;

  for (const node of G.allNodes()) {
    const tl = ensureTimeline(node);
    upsertByDate(tl.snapshots, captureNode(node, date, ts));
    entitiesRecorded += 1; snapshotsAdded += 1;

    if (node.type === "Theme") {
      const inf = inferTheme(node.id);
      upsertByDate(tl.inferences, { date, ts, kind: "theme", found: inf.found, direction: inf.direction, confidence: inf.confidence, thesis: inf.thesis });
      const pr = predictThemeTrajectory(node.id);
      upsertByDate(tl.predictions, { date, ts, kind: "theme", found: pr.found, predictedDirection: pr.predictedDirection, probability: pr.probability, confidence: pr.confidence });
      inferencesAdded += 1; predictionsAdded += 1;
    } else if (node.type === "Company") {
      const inf = inferCompany(node.id);
      upsertByDate(tl.inferences, { date, ts, kind: "company", found: inf.found, direction: "n/a", confidence: inf.confidence, thesis: inf.thesis });
      const pr = predictCompanyTrajectory(node.id);
      upsertByDate(tl.predictions, { date, ts, kind: "company", found: pr.found, predictedDirection: pr.expectedDirection, probability: pr.probability, confidence: pr.confidence });
      inferencesAdded += 1; predictionsAdded += 1;
    } else if (node.type === "Sector") {
      const inf = inferSector(node.id);
      upsertByDate(tl.inferences, { date, ts, kind: "sector", found: inf.found, direction: "n/a", confidence: inf.confidence, thesis: inf.thesis });
      const pr = predictSectorRotation(node.id);
      const dir = pr.companiesBenefiting.length >= pr.companiesAtRisk.length ? "rotating in" : "rotating out";
      upsertByDate(tl.predictions, { date, ts, kind: "sector", found: pr.found, predictedDirection: pr.found ? dir : "insufficient_signal", probability: null, confidence: pr.confidence });
      inferencesAdded += 1; predictionsAdded += 1;
    }
  }

  persist();
  return { date, entitiesRecorded, snapshotsAdded, inferencesAdded, predictionsAdded };
}

/* ------------------------------------------------------------------ *
 * getEntityHistory
 * ------------------------------------------------------------------ */

export interface EntityHistory {
  found: true; entityId: string; entityType: string; label: string;
  snapshots: EntitySnapshot[]; inferences: InferenceRecord[]; predictions: PredictionRecord[];
}

export function getEntityHistory(idOrLabel: string): EntityHistory | InsufficientHistory {
  const key = resolveKey(idOrLabel);
  const tl = db().entities[key];
  if (!tl || tl.snapshots.length === 0) return insufficient(key, 0, 1, "no recorded history for this entity");
  return { found: true, entityId: tl.entityId, entityType: tl.entityType, label: tl.label, snapshots: tl.snapshots, inferences: tl.inferences, predictions: tl.predictions };
}

/* ------------------------------------------------------------------ *
 * getRelationshipHistory
 * ------------------------------------------------------------------ */

export interface EdgeChange { id: string; type: string; strengthFrom: number; strengthTo: number; confidenceFrom: number; confidenceTo: number }
export interface RelationshipTransition {
  fromDate: string; toDate: string;
  added: EdgeSignature[]; removed: EdgeSignature[]; changed: EdgeChange[];
}
export interface RelationshipHistory { found: true; entityId: string; transitions: RelationshipTransition[] }

function edgeMap(snap: EntitySnapshot): Map<string, EdgeSignature> {
  return new Map(snap.edges.map(e => [e.id, e]));
}

export function getRelationshipHistory(idOrLabel: string): RelationshipHistory | InsufficientHistory {
  const key = resolveKey(idOrLabel);
  const tl = db().entities[key];
  const snaps = tl?.snapshots ?? [];
  if (snaps.length < 2) return insufficient(key, snaps.length, 2, "need at least two snapshots to track relationship evolution");

  const transitions: RelationshipTransition[] = [];
  for (let i = 1; i < snaps.length; i++) {
    const prev = edgeMap(snaps[i - 1]), curr = edgeMap(snaps[i]);
    const added: EdgeSignature[] = [], removed: EdgeSignature[] = [], changed: EdgeChange[] = [];
    for (const [id, e] of curr) {
      const before = prev.get(id);
      if (!before) added.push(e);
      else if (before.strength !== e.strength || before.confidence !== e.confidence)
        changed.push({ id, type: e.type, strengthFrom: before.strength, strengthTo: e.strength, confidenceFrom: before.confidence, confidenceTo: e.confidence });
    }
    for (const [id, e] of prev) if (!curr.has(id)) removed.push(e);
    transitions.push({ fromDate: snaps[i - 1].date, toDate: snaps[i].date, added, removed, changed });
  }
  return { found: true, entityId: key, transitions };
}

/* ------------------------------------------------------------------ *
 * compareSnapshots
 * ------------------------------------------------------------------ */

export interface SnapshotComparison {
  found: true; entityId: string; fromDate: string; toDate: string; days: number;
  deltas: { confidence: number; conviction: number; momentum: number; persistence: number; evidenceCount: number; relationshipCount: number; sourceCount: number };
  relationships: { added: number; removed: number; changed: number };
}

export function compareSnapshots(idOrLabel: string, fromDate?: string, toDate?: string): SnapshotComparison | InsufficientHistory {
  const key = resolveKey(idOrLabel);
  const snaps = db().entities[key]?.snapshots ?? [];
  if (snaps.length < 2) return insufficient(key, snaps.length, 2, "need at least two snapshots to compare");

  const from = (fromDate && snaps.find(s => s.date === fromDate)) || snaps[0];
  const to = (toDate && snaps.find(s => s.date === toDate)) || snaps[snaps.length - 1];
  if (from.date === to.date) return insufficient(key, 1, 2, "the two snapshots resolved to the same date");

  const prev = edgeMap(from), curr = edgeMap(to);
  let added = 0, removed = 0, changed = 0;
  for (const [id, e] of curr) { const b = prev.get(id); if (!b) added += 1; else if (b.strength !== e.strength || b.confidence !== e.confidence) changed += 1; }
  for (const id of prev.keys()) if (!curr.has(id)) removed += 1;

  return {
    found: true, entityId: key, fromDate: from.date, toDate: to.date, days: daysBetween(from.date, to.date),
    deltas: {
      confidence: to.confidence - from.confidence, conviction: to.conviction - from.conviction,
      momentum: to.momentum - from.momentum, persistence: to.persistence - from.persistence,
      evidenceCount: to.evidenceCount - from.evidenceCount, relationshipCount: to.relationshipCount - from.relationshipCount,
      sourceCount: to.sourceCount - from.sourceCount,
    },
    relationships: { added, removed, changed },
  };
}

/* ------------------------------------------------------------------ *
 * detectHistoricalPatterns
 * ------------------------------------------------------------------ */

export interface HistoricalPattern { pattern: string; detail: string }
export interface PatternResult { found: true; entityId: string; sessions: number; patterns: HistoricalPattern[] }

const monotonic = (xs: number[], dir: 1 | -1): boolean => {
  let moved = false;
  for (let i = 1; i < xs.length; i++) { const d = (xs[i] - xs[i - 1]) * dir; if (d < 0) return false; if (d > 0) moved = true; }
  return moved;
};

export function detectHistoricalPatterns(idOrLabel: string): PatternResult | InsufficientHistory {
  const key = resolveKey(idOrLabel);
  const snaps = db().entities[key]?.snapshots ?? [];
  if (snaps.length < 3) return insufficient(key, snaps.length, 3, "need at least three snapshots to detect patterns");

  const conf = snaps.map(s => s.confidence);
  const mom = snaps.map(s => s.momentum);
  const pers = snaps.map(s => s.persistence);
  const first = snaps[0], last = snaps[snaps.length - 1];
  const patterns: HistoricalPattern[] = [];

  if (monotonic(conf, 1)) patterns.push({ pattern: "steady_rise", detail: `Confidence rose from ${first.confidence} to ${last.confidence} across ${snaps.length} snapshots.` });
  else if (monotonic(conf, -1)) patterns.push({ pattern: "steady_decline", detail: `Confidence fell from ${first.confidence} to ${last.confidence} across ${snaps.length} snapshots.` });

  const firstDelta = conf[1] - conf[0], lastDelta = conf[conf.length - 1] - conf[conf.length - 2];
  if (firstDelta !== 0 && lastDelta !== 0 && Math.sign(firstDelta) !== Math.sign(lastDelta))
    patterns.push({ pattern: "reversal", detail: `Confidence trend reversed direction between the first and latest moves.` });

  if (monotonic(mom, 1)) patterns.push({ pattern: "accelerating_momentum", detail: `Momentum increased from ${first.momentum} to ${last.momentum}.` });

  if (pers.every(p => p >= 60)) patterns.push({ pattern: "durable", detail: `Persistence held at or above 60 across every snapshot.` });

  let signChanges = 0;
  for (let i = 2; i < conf.length; i++) { const a = conf[i - 1] - conf[i - 2], b = conf[i] - conf[i - 1]; if (a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b)) signChanges += 1; }
  if (signChanges >= Math.ceil((conf.length - 2) / 2) && conf.length >= 4) patterns.push({ pattern: "volatile", detail: `Confidence changed direction ${signChanges} times.` });

  return { found: true, entityId: key, sessions: snaps.length, patterns };
}

/* ------------------------------------------------------------------ *
 * findHistoricalAnalogs
 * ------------------------------------------------------------------ */

interface Features { confDelta: number; convDelta: number; momAvg: number; persAvg: number }
function featuresOf(tl: EntityTimeline): Features | null {
  const s = tl.snapshots;
  if (s.length < 2) return null;
  const first = s[0], last = s[s.length - 1];
  return { confDelta: last.confidence - first.confidence, convDelta: last.conviction - first.conviction, momAvg: avg(s.map(x => x.momentum)), persAvg: avg(s.map(x => x.persistence)) };
}
function distance(a: Features, b: Features): number {
  const dc = (a.confDelta - b.confDelta) / 100, dv = (a.convDelta - b.convDelta) / 100;
  const dm = (a.momAvg - b.momAvg) / 20, dp = (a.persAvg - b.persAvg) / 100;
  return Math.sqrt(dc * dc + dv * dv + dm * dm + dp * dp);
}

export interface HistoricalAnalog { entityId: string; label: string; entityType: string; similarity: number; reason: string }
export interface AnalogResult { found: true; entityId: string; analogs: HistoricalAnalog[] }

export function findHistoricalAnalogs(idOrLabel: string, limit = 5): AnalogResult | InsufficientHistory {
  const key = resolveKey(idOrLabel);
  const d = db();
  const self = d.entities[key];
  const selfFeatures = self ? featuresOf(self) : null;
  if (!selfFeatures) return insufficient(key, self?.snapshots.length ?? 0, 2, "need at least two snapshots to compare trajectories");

  const analogs: HistoricalAnalog[] = [];
  for (const tl of Object.values(d.entities)) {
    if (tl.entityId === key) continue;
    const f = featuresOf(tl);
    if (!f) continue;
    const dist = distance(selfFeatures, f);
    const similarity = round(clamp01(1 - dist / 2) * 100);
    analogs.push({ entityId: tl.entityId, label: tl.label, entityType: tl.entityType, similarity, reason: `Confidence delta ${round(f.confDelta)} vs ${round(selfFeatures.confDelta)}, momentum avg ${round(f.momAvg)} vs ${round(selfFeatures.momAvg)}.` });
  }
  if (analogs.length === 0) return insufficient(key, 1, 2, "no other entities have enough history to compare");
  analogs.sort((a, b) => b.similarity - a.similarity);
  return { found: true, entityId: key, analogs: analogs.slice(0, limit) };
}

/* ------------------------------------------------------------------ *
 * summarizeEvolution
 * ------------------------------------------------------------------ */

export interface EvolutionSummary { found: true; entityId: string; label: string; sessions: number; days: number; lines: string[] }

export function summarizeEvolution(idOrLabel: string): EvolutionSummary | InsufficientHistory {
  const key = resolveKey(idOrLabel);
  const tl = db().entities[key];
  const snaps = tl?.snapshots ?? [];
  if (snaps.length < 2) return insufficient(key, snaps.length, 2, "need at least two snapshots to summarize evolution");

  const first = snaps[0], last = snaps[snaps.length - 1];
  const days = daysBetween(first.date, last.date);
  const lines: string[] = [];

  const confDir = last.confidence > first.confidence ? "rose" : last.confidence < first.confidence ? "eased" : "held";
  lines.push(`Confidence ${confDir} from ${first.confidence} to ${last.confidence} over ${snaps.length} snapshots spanning ${days} day${days === 1 ? "" : "s"}.`);

  const momDir = last.momentum > first.momentum ? "picked up" : last.momentum < first.momentum ? "cooled" : "was flat";
  lines.push(`Momentum ${momDir} (from ${first.momentum} to ${last.momentum}).`);

  const firstEdges = new Set(first.edges.map(e => e.id)), lastEdges = new Set(last.edges.map(e => e.id));
  let added = 0, removed = 0;
  for (const id of lastEdges) if (!firstEdges.has(id)) added += 1;
  for (const id of firstEdges) if (!lastEdges.has(id)) removed += 1;
  if (added || removed) lines.push(`${added} relationship${added === 1 ? "" : "s"} added and ${removed} removed since the first snapshot.`);

  const lastInf = tl!.inferences[tl!.inferences.length - 1];
  if (lastInf && lastInf.found) lines.push(`Latest inference: ${lastInf.direction === "n/a" ? "tracked" : lastInf.direction} at confidence ${lastInf.confidence}.`);
  const lastPred = tl!.predictions[tl!.predictions.length - 1];
  if (lastPred && lastPred.found) lines.push(`Latest forecast: ${lastPred.predictedDirection}${lastPred.probability != null ? ` (probability ${lastPred.probability})` : ""}.`);

  return { found: true, entityId: key, label: tl!.label, sessions: snaps.length, days, lines };
}

/* ------------------------------------------------------------------ *
 * Introspection
 * ------------------------------------------------------------------ */

export interface MemoryStats { entities: number; totalSnapshots: number; totalInferences: number; totalPredictions: number }
export function getMemoryStats(): MemoryStats {
  const ents = Object.values(db().entities);
  return {
    entities: ents.length,
    totalSnapshots: ents.reduce((s, t) => s + t.snapshots.length, 0),
    totalInferences: ents.reduce((s, t) => s + t.inferences.length, 0),
    totalPredictions: ents.reduce((s, t) => s + t.predictions.length, 0),
  };
}
