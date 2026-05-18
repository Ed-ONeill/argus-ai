import type { FeedParams, FeedResponse, FeedItem, SourceInfo, DeepAnalysis, FeedFreshness } from "./types";

const BASE = "/api";

async function get<T>(path: string, params?: Record<string, string | boolean>): Promise<T> {
  let url = BASE + path;
  if (params) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    });
    const qstr = qs.toString();
    if (qstr) url += "?" + qstr;
  }

  console.log("[api.get] →", url);

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

// ── Saved ────────────────────────────────────────────────────────────────────

export async function fetchSaved(): Promise<FeedItem[]> {
  return get<FeedItem[]>("/saved/");
}

export async function fetchSavedIds(): Promise<string[]> {
  return get<string[]>("/saved/ids/");
}

export async function saveItem(item: FeedItem): Promise<void> {
  await post("/saved/", item);
}

export async function deleteItem(id: string): Promise<void> {
  const res = await fetch(`${BASE}/saved/${id}/`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

// ── Analyze ──────────────────────────────────────────────────────────────────

export interface AnalyzeResult {
  summary:        string;
  why_it_matters: string;
  impact:         string;
}

export async function analyzeItem(
  title: string, snippet: string, modelName = "",
): Promise<AnalyzeResult> {
  return post<AnalyzeResult>("/analyze/", { title, snippet, model_name: modelName });
}

/** Lazy deep analysis — called only when the Analyze panel is opened. */
export async function analyzeItemDeep(
  title: string, snippet: string,
): Promise<DeepAnalysis> {
  return post<DeepAnalysis>("/analyze/deep/", { title, snippet });
}
