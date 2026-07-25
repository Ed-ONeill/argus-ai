import type { FeedParams, FeedResponse, SourceInfo, DeepAnalysis, FeedFreshness } from "./types";

const BASE = "/api";

async function get<T>(path: string, params?: Record<string, string | boolean>): Promise<T> {
  let url = BASE + path;
  if (params) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "" && v !== false) qs.set(k, String(v));
    });
    const qstr = qs.toString();
    if (qstr) url += "?" + qstr;
  }

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    console.error("[api.get] error", res.status, url, text.slice(0, 300));
    throw new Error(`API ${res.status}: ${text.slice(0, 100)}`);
  }
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Feed ─────────────────────────────────────────────────────────────────────

export async function fetchFeedFreshness(
  categories = "", sources = "", fresh_only = false,
): Promise<FeedFreshness> {
  return get<FeedFreshness>("/feed/freshness", { categories, sources, fresh_only });
}

export async function fetchFeed(params: FeedParams = {}): Promise<FeedResponse> {
  return get<FeedResponse>("/feed", {
    categories:    params.categories    ?? "",
    sources:       params.sources       ?? "",
    fresh_only:    params.fresh_only    ?? false,
    force_refresh: params.force_refresh ?? false,
  });
}

export async function fetchSources(): Promise<SourceInfo[]> {
  return get<SourceInfo[]>("/feed/sources");
}

// ── Saved ────────────────────────────────────────────────────────────────────
// RETIRED (PH3, audit C4). The backend saved store was a global unscoped dict.
// Saved research now lives ONLY in the RLS-protected Supabase `saved_items`
// table, read/written directly by the client in hooks/useSaved.ts. No backend
// saved API exists — do not reintroduce one here.

// ── Analyze ──────────────────────────────────────────────────────────────────

export interface AnalyzeResult {
  summary:        string;
  why_it_matters: string;
  impact:         string;
}

export async function analyzeItem(
  title: string, snippet: string, modelName = "",
): Promise<AnalyzeResult> {
  return post<AnalyzeResult>("/analyze", { title, snippet, model_name: modelName });
}

/** Lazy deep analysis — called only when the Analyze panel is opened. */
export async function analyzeItemDeep(
  title: string, snippet: string,
): Promise<DeepAnalysis> {
  return post<DeepAnalysis>("/analyze/deep", { title, snippet });
}

// ── Institutional memory & prediction ledger (M3, read-only) ─────────────────
// Honest failure contract: these return null on any transport/service error;
// consumers render an explicit "unreachable" state — never a fabricated value.

export interface MemoryGate { required: number; actual: number; met: boolean }
export interface HistoricalContext {
  status: string;                       // ok | insufficient_history | no_subject_history | ...
  credibility?: { gates: Record<string, MemoryGate>; met: boolean };
  note?: string;
  episodes?: unknown[];
  disclaimers?: string[];
}
export interface CalibrationStatus {
  ledger_enabled: boolean;
  reason?: string;
  open_predictions?: number;
  overall?: {
    sample_size: number;
    tested: number;
    untested: number;
    by_verdict?: Record<string, number>;
    credible: boolean;
    note?: string | null;
  };
}

export async function fetchHistoricalContext(themeId: string): Promise<HistoricalContext | null> {
  try {
    return await get<HistoricalContext>(
      `/memory/v2/themes/${encodeURIComponent(themeId)}/historical-context`);
  } catch { return null; }
}

export async function fetchCalibrationStatus(): Promise<CalibrationStatus | null> {
  try { return await get<CalibrationStatus>("/memory/v2/calibration/status"); }
  catch { return null; }
}

export interface PredictionRow {
  prediction_uid: string;
  prediction_type: string;
  statement: string;
  status: string;
  issuance_boundary?: string;
}

/** Per-entity prediction ledger rows (M3.3). Null on transport/service error. */
export async function fetchEntityPredictions(uid: string, limit = 5): Promise<PredictionRow[] | null> {
  try {
    const res = await get<{ predictions: PredictionRow[] }>(
      `/memory/v2/entities/${encodeURIComponent(uid)}/predictions?limit=${limit}`);
    return res.predictions ?? [];
  } catch { return null; }
}

export interface EntitySnapshotRow {
  snapshot_date?: string;
  snapshot_kind?: string;
  [k: string]: unknown;
}
export interface EntityMemory { entity_uid: string; count: number; snapshots: EntitySnapshotRow[] }

/** Per-entity archived snapshots (M3.2). Null on transport/service error. */
export async function fetchEntityMemory(uid: string, limit = 90): Promise<EntityMemory | null> {
  try {
    return await get<EntityMemory>(
      `/memory/v2/entities/${encodeURIComponent(uid)}/snapshots?limit=${limit}`);
  } catch { return null; }
}
