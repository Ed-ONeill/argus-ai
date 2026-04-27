// ── Core data types (mirror the FastAPI response schemas) ────────────────────

export interface FeedItem {
  id:             string;
  title:          string;
  url:            string;
  source:         string;
  category:       "Markets" | "M&A" | "Geopolitical" | string;
  published:      string;
  signal_score:      number;
  signal_strength:   "strong" | "medium" | "weak";
  affected_entities: string[];
  summary:           string;
  why_it_matters:    string;
  impact:            string;
  snippet:           string;
}

export interface TopStories {
  top_deal:          FeedItem | null;
  top_macro:         FeedItem | null;
  top_single_name:   FeedItem | null;
  top_price_move:    FeedItem | null;
  top_policy_risk:   FeedItem | null;
}

export interface FeedResponse {
  items:              FeedItem[];
  top_stories:        TopStories;
  market_take:        string;
  total:              number;
  sources:            string[];
  errors:             Record<string, string>;
  top_stories_debug:  string[];
  // Clustering layer
  clusters:           StoryCluster[];
  what_matters_now:   WhatMattersNowItem[];
  // Cache metadata
  is_stale:           boolean;
  generated_at:       string;   // ISO-8601
  cache_age_seconds:  number;
}

export interface DeepAnalysis {
  what_changed:     string;
  why_markets_care: string;
  who_wins_loses:   string;
  what_to_watch:    string;
}

// ── Clustering types ──────────────────────────────────────────────────────────

export interface RelatedStory {
  id:              string;
  title:           string;
  url:             string;
  source:          string;
  published:       string;
  published_ts:    string;   // ISO-8601 for timeline sort
  signal_strength: "strong" | "medium" | "weak" | string;
}

export interface StoryCluster {
  id:            string;
  primary:       FeedItem;
  related:       RelatedStory[];
  cluster_score: number;
  theme_label:   string;
  story_count:   number;
}

export interface WhatMattersNowItem {
  rank:      number;
  cluster:   StoryCluster;
  reason:    string;
  thesis:    string;
  wmn_label: string;
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

export interface WatchlistItem {
  id:      string;                        // entity name as-stored (e.g. "AAPL", "Energy")
  type:    "ticker" | "sector" | "theme";
  addedAt: string;                        // ISO-8601
}

export interface FeedFreshness {
  generated_at:      string;   // ISO-8601; empty if cache is cold
  is_stale:          boolean;
  cache_age_seconds: number;
  item_count:        number;
}

export interface FeedParams {
  categories?:   string;
  sources?:      string;
  fresh_only?:   boolean;
  force_refresh?: boolean;
  use_ai?:       boolean;
  model_name?:   string;
}

// ── Impact classification ─────────────────────────────────────────────────────

export type ImpactSentiment = "bullish" | "bearish" | "neutral" | "mixed";

export function classifyImpact(impact: string): ImpactSentiment {
  if (!impact) return "neutral";
  const t = impact.toLowerCase();
  if (t.startsWith("bullish")) return "bullish";
  if (t.startsWith("bearish")) return "bearish";
  if (t.startsWith("mixed"))   return "mixed";
  return "neutral";
}

// ── Category colour map ───────────────────────────────────────────────────────

export const CAT_COLOURS: Record<string, string> = {
  "Markets":     "#2563EB",
  "M&A":         "#7C3AED",
  "Geopolitical":"#DC2626",
  "Company":     "#0891B2",
};

export function catColour(category: string): string {
  return CAT_COLOURS[category] ?? "#6B7280";
}

// ── Source info ───────────────────────────────────────────────────────────────

export interface SourceInfo {
  name:     string;
  category: string;
}

// ── Listen / Episode ──────────────────────────────────────────────────────────

export interface Episode {
  id:               string;
  title:            string;
  show_name:        string;
  publisher:        string;
  description:      string;
  why_it_matters:   string;
  image_url:        string | null;
  audio_url:        string | null;
  external_url:     string | null;
  published_at:     string;        // ISO-8601
  duration_seconds: number;
  topics:           string[];
  entities:         string[];
  is_featured:      boolean;
  is_secondary:     boolean;       // cross-topic filler when primary topic results are sparse
  secondary_label:  string | null; // "Market context" | "Related" — only set when is_secondary
  relevance_score:  number;
  is_briefing?:     boolean;       // true for Argus AI-generated briefings
  signal_strength?: string;        // "strong" | "medium" | "weak" — briefings only
}
