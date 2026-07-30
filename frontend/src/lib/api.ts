import type { FeedParams, FeedResponse, SourceInfo, DeepAnalysis, FeedFreshness } from "./types";
import { authedJson, UnauthorizedError } from "./authClient";
import { getAccessToken, refreshAccessToken, notifyUnauthorized } from "./authSession";

const BASE = "/api";

// Re-export so callers/react-query can distinguish states by error type.
export { UnauthorizedError, ApiError } from "./authClient";

// The single dependency bundle every protected request uses: fresh token at
// call time + one-shot refresher. No token is ever captured in a closure.
const authDeps = { getToken: getAccessToken, refreshToken: refreshAccessToken };

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
  try {
    return await authedJson<T>(url, undefined, authDeps);
  } catch (err) {
    if (err instanceof UnauthorizedError) notifyUnauthorized();
    throw err;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  try {
    return await authedJson<T>(BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, authDeps);
  } catch (err) {
    if (err instanceof UnauthorizedError) notifyUnauthorized();
    throw err;
  }
}

// ── Feed ─────────────────────────────────────────────────────────────────────

// NOTE: trailing slashes MATCH the FastAPI routes (`/api/feed/`,
// `/api/feed/freshness/`, `/api/feed/sources/`). Hitting the exact path avoids a
// 307 slash-redirect on which the Authorization header must never depend.
export async function fetchFeedFreshness(
  categories = "", sources = "", fresh_only = false,
): Promise<FeedFreshness> {
  return get<FeedFreshness>("/feed/freshness/", { categories, sources, fresh_only });
}

export async function fetchFeed(params: FeedParams = {}): Promise<FeedResponse> {
  return get<FeedResponse>("/feed/", {
    categories:    params.categories    ?? "",
    sources:       params.sources       ?? "",
    fresh_only:    params.fresh_only    ?? false,
    force_refresh: params.force_refresh ?? false,
  });
}

export async function fetchSources(): Promise<SourceInfo[]> {
  return get<SourceInfo[]>("/feed/sources/");
}

/**
 * Generic authenticated GET for other protected backend routes (listen,
 * briefings, markets/industries intelligence, …). `path` is relative to /api
 * and MAY include a query string, e.g. "/listen?topic=Tech". Routes through the
 * one shared authed client, so it attaches a fresh Bearer and handles 401.
 */
export async function apiGet<T>(path: string): Promise<T> {
  return get<T>(path);
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
