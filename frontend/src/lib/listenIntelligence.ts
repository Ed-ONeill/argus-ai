/**
 * listenIntelligence.ts — Listen's content-matching and factual-extraction layer.
 *
 * Pure deterministic functions — zero API calls. All derived from Episode and
 * ThemeIntelligence objects already fetched by their respective query hooks.
 *
 * Phase 2.4 (Listen unification) classification:
 *  - Entity/people extraction, earnings detection, speaker aggregation:
 *    FACTUAL INGESTION (NLP-ish parsing of episode text, not intelligence).
 *  - matchEpisodeThemes: the DETERMINISTIC METADATA FALLBACK MATCHER. The
 *    graph's Podcast->Theme edges are not per-episode-specific today (the
 *    canonical adapter links episodes to the global matched-theme set, D14),
 *    so this matcher remains the per-episode attribution home. It resolves to
 *    CANONICAL theme objects (the same entity keys Explorer and profiles use),
 *    is labeled partial/inferred by consumers (lib/listenIntel classifies its
 *    matches MENTIONS/CONTEXT, never SUPPORTS), and is PROHIBITED from
 *    creating conviction or narrative membership.
 *  - generateWhyListen: RELEVANCE PHRASING only (who/what/why this episode is
 *    relevant) - market meaning ("why it matters") comes from shared objects
 *    via lib/listenIntel and never from this template.
 */

import type { Episode, ThemeIntelligence } from "./types";
import { extractCompanies } from "./tickerMetadata";

// ── Theme-to-episode matching ─────────────────────────────────────────────────
//
// Scoring rubric (additive):
//   +3 per episode entity that matches a theme related_asset  ← directEntityMatch
//   +2 per episode topic that matches a theme podcast_topic
//   +1 per episode topic that substring-matches a theme related_industry
//   +1 per meaningful theme name word in episode title
//   +0.5 per meaningful theme name word in first 400 chars of description
//
// Minimum threshold: score >= 2. Pure keyword-only matches (score = 1-1.5) are
// filtered out to reduce noise from loosely related themes.
//
// Sort order: directEntityMatch wins, then score, then persistence_score tiebreak.
// This ensures the most specific (entity-matched) themes always surface first,
// naturally creating more diversity across cards that reference different assets.

export interface EpisodeThemeMatch {
  theme:             ThemeIntelligence;
  score:             number;
  /** True when the match is anchored on a recorded entity (ticker) overlap -
      stronger than topic/keyword matching, but still metadata-level. */
  directEntityMatch: boolean;
}

/** Detailed variant: exposes score + match basis so consumers can classify
    honestly (entity-anchored = MENTIONS, keyword/topic-only = CONTEXT). */
export function matchEpisodeThemesDetailed(
  episode:    Episode,
  themes:     ThemeIntelligence[],
  maxMatches = 2,
): EpisodeThemeMatch[] {
  if (themes.length === 0) return [];

  const entitySet = new Set(episode.entities.map(e => e.toUpperCase()));
  const topicSet  = new Set(episode.topics);
  const titleLow  = episode.title.toLowerCase();
  const descLow   = (episode.description ?? "").toLowerCase().slice(0, 400);

  const scored = themes.map(theme => {
    let score           = 0;
    let directEntityMatch = false;

    for (const asset of theme.related_assets) {
      if (entitySet.has(asset.toUpperCase())) {
        score += 3;
        directEntityMatch = true;
      }
    }

    for (const pt of theme.podcast_topics) {
      if (topicSet.has(pt)) score += 2;
    }

    for (const ind of theme.related_industries) {
      const indL = ind.toLowerCase();
      if (episode.topics.some(t => {
        const tL = t.toLowerCase();
        return tL.includes(indL) || indL.includes(tL);
      })) score += 1;
    }

    const themeWords = theme.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    for (const word of themeWords) {
      if (titleLow.includes(word)) score += 1;
      if (descLow.includes(word))  score += 0.5;
    }

    return { theme, score, directEntityMatch };
  });

  return scored
    .filter(({ score }) => score >= 2)
    .sort((a, b) => {
      // Direct entity match always surfaces first
      if (a.directEntityMatch !== b.directEntityMatch) {
        return a.directEntityMatch ? -1 : 1;
      }
      // Then score
      if (Math.abs(a.score - b.score) > 0.5) return b.score - a.score;
      // Tiebreak: highest persistence_score (more persistent themes are more relevant)
      return (b.theme.persistence_score ?? 0) - (a.theme.persistence_score ?? 0);
    })
    .slice(0, maxMatches);
}

export function matchEpisodeThemes(
  episode:    Episode,
  themes:     ThemeIntelligence[],
  maxMatches = 2,
): ThemeIntelligence[] {
  return matchEpisodeThemesDetailed(episode, themes, maxMatches).map(({ theme }) => theme);
}

// ── Theme episode groups (for "Most Discussed Themes" section) ────────────────

export interface ThemeEpisodeGroup {
  theme:      ThemeIntelligence;
  episodes:   Episode[];
  matchCount: number;
}

export function getThemeEpisodeGroups(
  episodes: Episode[],
  themes:   ThemeIntelligence[],
): ThemeEpisodeGroup[] {
  return themes
    .map(theme => {
      const matched = episodes.filter(
        ep => matchEpisodeThemes(ep, [theme], 1).length > 0,
      );
      return { theme, episodes: matched, matchCount: matched.length };
    })
    .filter(g => g.matchCount >= 1)
    .sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      return (b.theme.persistence_score ?? 0) - (a.theme.persistence_score ?? 0);
    });
}

// ── Earnings episode detection ────────────────────────────────────────────────

const EARNINGS_TITLE_KW = [
  "earnings", "quarterly results", "q1 earnings", "q2 earnings",
  "q3 earnings", "q4 earnings", "revenue beat", "revenue miss",
  "eps beat", "eps miss", "guidance cut", "guidance raise",
  "guidance update", "fiscal quarter", "investor day",
  "full year results", "annual results",
];

export function isEarningsEpisode(ep: Episode): boolean {
  const titleLow = ep.title.toLowerCase();
  return EARNINGS_TITLE_KW.some(kw => titleLow.includes(kw));
}

// ── Speaker intelligence ──────────────────────────────────────────────────────
//
// Heuristic: a person's name has 2-4 words, each starting with an uppercase
// letter followed by lowercase, is not a ticker (all-caps ≤6 chars), and is not
// in the known non-person blocklist.

const NON_PERSON_BLOCKLIST = new Set([
  "united states", "federal reserve", "european union", "central bank",
  "private equity", "venture capital", "wall street", "main street",
  "new york", "san francisco", "los angeles", "silicon valley",
  "artificial intelligence", "machine learning", "private market",
  "hedge fund", "mutual fund", "sovereign wealth", "asset management",
]);

export function looksLikePerson(entity: string): boolean {
  if (entity.length < 4 || entity.length > 45) return false;
  if (/^[A-Z]{1,6}$/.test(entity)) return false;
  if (NON_PERSON_BLOCKLIST.has(entity.toLowerCase())) return false;
  const words = entity.trim().split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  return words.every(w => /^[A-Z][a-z]/.test(w));
}

// ── Entity extraction from episode text ───────────────────────────────────────
//
// The ingestion layer ships episodes with entities = [] (no NER upstream), so we
// extract companies + people from the title + description here. This is the source
// for the Listen page's most-mentioned company / voice intelligence and improves
// theme matching (direct entity matches). Real text-derived signal — not invented.

const PERSON_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z']+){1,2}\b/g;

export function extractPeople(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(PERSON_RE)) if (looksLikePerson(m[0])) out.add(m[0]);
  return [...out];
}

/** Companies (tickers) + people mentioned in an episode's title + description. */
export function extractEntitiesFromText(title: string, description?: string | null): string[] {
  const text = `${title}. ${description ?? ""}`.slice(0, 1500);
  return [...new Set([...extractCompanies(text), ...extractPeople(text)])];
}

export interface SpeakerIntelligence {
  name:         string;
  episodeCount: number;
  shows:        string[];
  topics:       string[];
}

export function extractSpeakers(episodes: Episode[]): SpeakerIntelligence[] {
  const map = new Map<string, {
    episodeCount: number;
    shows:  Set<string>;
    topics: Set<string>;
  }>();

  for (const ep of episodes) {
    for (const entity of ep.entities) {
      if (!looksLikePerson(entity)) continue;
      if (!map.has(entity)) {
        map.set(entity, { episodeCount: 0, shows: new Set(), topics: new Set() });
      }
      const rec = map.get(entity)!;
      rec.episodeCount++;
      rec.shows.add(ep.show_name);
      ep.topics.forEach(t => rec.topics.add(t));
    }
  }

  return Array.from(map.entries())
    .map(([name, { episodeCount, shows, topics }]) => ({
      name,
      episodeCount,
      shows:  Array.from(shows),
      topics: Array.from(topics).slice(0, 3),
    }))
    .sort((a, b) => b.episodeCount - a.episodeCount)
    .slice(0, 8);
}

// ── Episode-specific "Why Listen" copy ───────────────────────────────────────
//
// Deterministic client-side copy generation. Uses backend why_it_matters when
// it is specific enough; otherwise synthesises from episode metadata + theme.
//
// Templates (richest available wins):
//   speaker + theme + industry  →  "{Speaker} on {Theme} and {Industry} implications."
//   speaker + theme             →  "{Speaker} on {Theme} and market positioning."
//   speaker + entities          →  "{Speaker} examines {E1} and {E2} market dynamics."
//   speaker + topic             →  "{Speaker} on the {Topic} landscape and what's changing."
//   2 entities + theme          →  "Connects {E1} and {E2} through the lens of {Theme}."
//   1 entity + theme            →  "Examines {E1} in the context of {Theme}."
//   2 entities + topic          →  "{E1} and {E2} in a {Topic} context."
//   1 entity + topic            →  "{Show} covers {E1} across {Topic} markets."
//   theme + industry            →  "{Show} examines {Theme} across {Industry} markets."
//   theme only                  →  "{Show} on {Theme} and second-order effects."
//   topic only                  →  "{Show} covers {Topic} market developments."

const GENERIC_OPENERS = [
  "in this episode", "this week on", "join us", "we discuss", "we cover",
  "tune in", "listen now", "an in-depth look", "deep dive into",
  "covers topics including", "a conversation about", "today we",
];

function isSpecificEnough(text: string, episodeTitle: string): boolean {
  if (!text || text.length < 55) return false;
  // Reject if text is essentially just the episode title re-stated
  if (text.toLowerCase().trim() === episodeTitle.toLowerCase().trim()) return false;
  const tl = text.toLowerCase().trim();
  return !GENERIC_OPENERS.some(g => tl.startsWith(g));
}

export function generateWhyListen(
  ep:           Episode,
  primaryTheme: ThemeIntelligence | null,
): string {
  const existing = ep.why_it_matters ?? "";
  if (isSpecificEnough(existing, ep.title)) return existing;

  const speakers  = ep.entities.filter(looksLikePerson).slice(0, 1);
  const companies = ep.entities.filter(e => !looksLikePerson(e)).slice(0, 2);
  const topic     = ep.topics[0] ?? "";
  const industry  = primaryTheme?.related_industries?.[0] ?? "";
  const show      = ep.show_name;

  // Speaker-led templates (most specific)
  if (speakers.length > 0 && primaryTheme && industry) {
    return `${speakers[0]} on ${primaryTheme.name} and ${industry} implications.`;
  }
  if (speakers.length > 0 && primaryTheme) {
    return `${speakers[0]} on ${primaryTheme.name} and market positioning.`;
  }
  if (speakers.length > 0 && companies.length >= 2) {
    return `${speakers[0]} examines ${companies[0]} and ${companies[1]} market dynamics.`;
  }
  if (speakers.length > 0 && companies.length === 1) {
    return `${speakers[0]} on ${companies[0]} in a ${topic || "market"} context.`;
  }
  if (speakers.length > 0 && topic) {
    return `${speakers[0]} on the ${topic} landscape and what's changing.`;
  }

  // Company/entity-led templates
  if (companies.length >= 2 && primaryTheme) {
    return `Connects ${companies[0]} and ${companies[1]} through the lens of ${primaryTheme.name}.`;
  }
  if (companies.length === 1 && primaryTheme) {
    return `Examines ${companies[0]} in the context of ${primaryTheme.name}.`;
  }
  if (companies.length >= 2 && topic) {
    return `${companies[0]} and ${companies[1]} in a ${topic} context.`;
  }
  if (companies.length === 1 && topic) {
    return `${show} covers ${companies[0]} across ${topic} markets.`;
  }

  // Theme-led templates
  if (primaryTheme && industry) {
    return `${show} examines ${primaryTheme.name} across ${industry} markets.`;
  }
  if (primaryTheme) {
    return `${show} on ${primaryTheme.name} and second-order effects.`;
  }

  // Topic fallback
  if (topic) return `${show} covers ${topic} market developments.`;

  return existing;
}
