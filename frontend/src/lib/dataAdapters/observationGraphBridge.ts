/**
 * lib/dataAdapters/observationGraphBridge.ts - normalized observations into the graph.
 *
 * Converts provider-agnostic ProviderObservation records into nodes and relationships
 * on the existing intelligenceGraph singleton. No second graph, no engine logic
 * duplicated: the bridge only shapes observations, preserves provenance and the
 * quality layer, and links entities where the relationship is clear. When direction
 * is ambiguous it uses mentions or correlates rather than inventing a claim. Malformed
 * observations are skipped, never fatal. No UI, no em/en dashes.
 */

import { intelligenceGraph as G } from "../intelligenceGraph";
import type { NodeType, SourcePage } from "../intelligenceGraph";
import { round } from "../intelligenceUtils";
import type { FetchResult, ObservationQuality, ProviderObservation } from "./types";

export interface IngestProviderStats {
  nodesAdded:           number;
  relationshipsAdded:   number;
  errorsSkipped:        number;
  observationsIngested: number;
  averageQualityScore:  number;
  providersUsed:        string[];
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isValidObs = (o: unknown): o is ProviderObservation => {
  const r = o as ProviderObservation | null;
  return !!r && typeof r.entityId === "string" && r.entityId.length > 0 &&
    typeof r.observationType === "string" && r.observationType.length > 0 &&
    Number.isFinite(r.providerTimestamp) && Number.isFinite(r.qualityScore);
};

const qualityOf = (o: ProviderObservation): ObservationQuality =>
  o.quality ?? { quality: o.qualityScore, freshness: 0, providerReliability: 0, entityConfidence: 0, collectedAt: o.providerTimestamp };

/** Provenance + quality kept on every provider-derived node, for the Evidence Engine. */
function provenance(o: ProviderObservation): Record<string, unknown> {
  const q = qualityOf(o);
  return {
    provider: o.provider, source: o.source, providerTimestamp: o.providerTimestamp,
    qualityScore: o.qualityScore, providerReliability: q.providerReliability, freshness: q.freshness,
    observationType: o.observationType,
  };
}

/** Directed, evidence-weighted edge from the observation's quality. */
function link(source: string, relationshipType: string, target: string, o: ProviderObservation): void {
  if (!source || !target || source === target) return;
  const q = qualityOf(o);
  G.addRelationship({
    source, target, relationshipType,
    strength: o.qualityScore, confidence: q.providerReliability,
    firstObserved: o.providerTimestamp, lastObserved: o.providerTimestamp,
    evidenceCount: 1, originatingPages: [o.source as SourcePage],
  });
}

/**
 * Upsert a node without overwriting the scoring fields of an existing node. New nodes
 * inherit provider reliability / quality as their confidence / importance; existing
 * nodes only widen timestamps, union sources, and merge the provided metadata.
 */
function upsert(id: string, label: string, type: NodeType, o: ProviderObservation, metadata: Record<string, unknown>): string {
  const q = qualityOf(o);
  const existing = G.getNode(id);
  if (existing) {
    G.updateNode(existing.id, { lastSeen: o.providerTimestamp, sources: [o.source as SourcePage], metadata });
    return existing.id;
  }
  return G.addNode({
    id, label: label || id, type, aliases: [label, id],
    confidence: q.providerReliability, importance: o.qualityScore,
    firstSeen: o.providerTimestamp, lastSeen: o.providerTimestamp,
    sources: [o.source as SourcePage], metadata,
  }).id;
}

const ensureCompany = (o: ProviderObservation): string =>
  upsert(o.entityId, o.entityLabel ?? o.entityId, "Company", o, { provider: o.provider, lastQualityScore: o.qualityScore });

const MACRO_CONCEPT: Record<string, string> = {
  interest_rate: "Interest Rates", yield_curve: "Yield Curve", inflation: "Inflation",
  employment: "Employment", gdp: "Growth", credit_spread: "Credit Spreads", macro_series: "Macro",
};

function ensureMacroConcept(label: string, o: ProviderObservation): string {
  const existing = G.getNode(label);
  const q = qualityOf(o);
  if (existing) { G.updateNode(existing.id, { lastSeen: o.providerTimestamp, sources: [o.source as SourcePage] }); return existing.id; }
  return G.addNode({ label, type: "Macro", aliases: [label], confidence: q.providerReliability, importance: o.qualityScore, firstSeen: o.providerTimestamp, lastSeen: o.providerTimestamp, sources: [o.source as SourcePage] }).id;
}

function insiderDirection(payload: Record<string, unknown>): "buy" | "sell" | "unknown" {
  const t = str(payload.direction ?? payload.transactionType ?? payload.acquiredDisposedCode ?? payload.transactionCode).toLowerCase();
  if (/buy|acquire|purchase|^a$/.test(t)) return "buy";
  if (/sell|dispose|sale|^d$/.test(t)) return "sell";
  return "unknown";
}

/* ------------------------------------------------------------------ *
 * Per-observation handlers
 * ------------------------------------------------------------------ */

function handleCompanyProfile(o: ProviderObservation): void {
  upsert(o.entityId, o.entityLabel ?? o.entityId, "Company", o, {
    cik: o.payload.cik, entityName: o.payload.entityName, ...provenance(o),
  });
}

function handleFinancials(o: ProviderObservation): void {
  const cid = ensureCompany(o);
  const label = str(o.payload.label) || str(o.payload.concept) || "metric";
  const q = qualityOf(o);
  const mid = G.addNode({
    id: `fin:${o.entityId}:${label}`, label: `${o.entityLabel ?? o.entityId} ${label}`, type: "FinancialMetric",
    aliases: [`fin:${o.entityId}:${label}`],
    confidence: q.providerReliability, importance: o.qualityScore,
    firstSeen: o.providerTimestamp, lastSeen: o.providerTimestamp,
    sources: [o.source as SourcePage], metadata: { ...o.payload, ...provenance(o) },
  }).id;
  link(cid, "has_financial_metric", mid, o);
}

function handleInsider(o: ProviderObservation): void {
  const cid = ensureCompany(o);
  const name = str(o.payload.insiderName ?? o.payload.person ?? o.payload.ownerName ?? o.payload.owner);
  if (!name) {
    // Filing-level only (no insider identity yet): record it on the company, no false edge.
    G.updateNode(cid, { lastSeen: o.providerTimestamp, metadata: { lastInsiderFiling: { ...o.payload, ...provenance(o) } } });
    return;
  }
  const pid = upsert(`person:${name}`, name, "Person", o, { role: o.payload.role ?? o.payload.insiderTitle, ...provenance(o), lastFiling: o.payload });
  link(pid, "transacted", cid, o);
  const dir = insiderDirection(o.payload);
  if (dir === "buy") { link(pid, "owns", cid, o); link(pid, "supports", cid, o); }
  else if (dir === "sell") { link(pid, "weakens", cid, o); }
  else { link(pid, "mentions", cid, o); }
}

function handleInstitution(o: ProviderObservation): void {
  const iid = upsert(o.entityId, o.entityLabel ?? o.entityId, "Institution", o, { ...o.payload, ...provenance(o) });
  const held = str(o.payload.ticker ?? o.payload.holdingTicker ?? o.payload.company);
  if (held) {
    const cid = G.addNode({ id: held, label: held.toUpperCase(), type: "Company", aliases: [held.toUpperCase()], sources: [o.source as SourcePage] }).id;
    link(iid, "owns", cid, o);
  }
}

function handleMacro(o: ProviderObservation): void {
  const seriesId = String(o.entityId);
  const seriesLabel = str(o.payload.label) || seriesId;
  const q = qualityOf(o);
  const sid = G.addNode({
    id: `series:${seriesId}`, label: seriesLabel, type: "MacroSeries", aliases: [seriesId, seriesLabel],
    confidence: q.providerReliability, importance: o.qualityScore,
    firstSeen: o.providerTimestamp, lastSeen: o.providerTimestamp,
    sources: [o.source as SourcePage], metadata: { ...o.payload, ...provenance(o), category: o.observationType },
  }).id;

  const conceptId = ensureMacroConcept(MACRO_CONCEPT[o.observationType] ?? "Macro", o);
  link(sid, "drives", conceptId, o);

  if (o.observationType === "credit_spread") {
    const stress = ensureMacroConcept("Credit Stress", o);
    const change = Number(o.payload.change);
    if (Number.isFinite(change) && change > 0) link(sid, "supports", stress, o);       // wider spreads, more stress
    else if (Number.isFinite(change) && change < 0) link(sid, "weakens", stress, o);   // tighter spreads, less stress
    else link(sid, "correlates", stress, o);
  }
}

function handleGeneric(o: ProviderObservation): void {
  // Unknown observation type: record the entity node, no invented relationship.
  const type = (o.entityType as NodeType) || "Company";
  upsert(o.entityId, o.entityLabel ?? o.entityId, type, o, { ...o.payload, ...provenance(o) });
}

function dispatch(o: ProviderObservation): void {
  switch (o.observationType) {
    case "company_profile":       return handleCompanyProfile(o);
    case "financials":            return handleFinancials(o);
    case "insider_transaction":   return handleInsider(o);
    case "institutional_holding": return handleInstitution(o);
    case "interest_rate":
    case "yield_curve":
    case "inflation":
    case "employment":
    case "gdp":
    case "credit_spread":
    case "macro_series":          return handleMacro(o);
    default:                      return handleGeneric(o);
  }
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/** Ingest normalized observations into the shared graph. Tolerant of malformed input. */
export function ingestProviderObservations(observations: ProviderObservation[]): IngestProviderStats {
  const before = G.stats();
  let errorsSkipped = 0, observationsIngested = 0, qualitySum = 0;
  const providersUsed = new Set<string>();

  for (const o of observations ?? []) {
    if (!isValidObs(o)) { errorsSkipped += 1; continue; }
    try {
      dispatch(o);
      observationsIngested += 1;
      qualitySum += o.qualityScore;
      providersUsed.add(String(o.provider));
    } catch { errorsSkipped += 1; }
  }

  const after = G.stats();
  return {
    nodesAdded: Math.max(0, after.nodes - before.nodes),
    relationshipsAdded: Math.max(0, after.edges - before.edges),
    errorsSkipped, observationsIngested,
    averageQualityScore: observationsIngested ? round(qualitySum / observationsIngested) : 0,
    providersUsed: [...providersUsed],
  };
}

/** Accepts adapter fetch results (or raw observation arrays) and ingests them. */
export function buildGraphFromProviderData(providerResults: Array<FetchResult | ProviderObservation[]>): IngestProviderStats {
  const observations: ProviderObservation[] = [];
  for (const r of providerResults ?? []) {
    if (Array.isArray(r)) observations.push(...r);
    else if (r && Array.isArray((r as FetchResult).observations)) observations.push(...(r as FetchResult).observations);
  }
  return ingestProviderObservations(observations);
}
