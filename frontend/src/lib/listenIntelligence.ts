/**
 * listenIntelligence.ts — Client-side intelligence layer for the Listen surface.
 *
 * Pure deterministic functions — zero API calls. All derived from Episode and
 * ThemeIntelligence objects already fetched by their respective query hooks.
 */

import type { Episode, ThemeIntelligence } from "./types";

// ── Theme-to-episode matching ─────────────────────────────────────────────────
//
// Scoring rubric (additive):
//   +3 per episode entity that matches a theme related_asset (strongest signal)
//   +2 per episode topic that matches a theme podcast_topic (direct classification)
//   +1 per episode topic that substring-matches a theme related_industry
//   +1 per meaningful theme name word found in episode title
//   +0.5 per meaningful theme name word found in first 400 chars of description
//
// A score > 0 is required to surface a match; results sorted desc by score.

export function matchEpisodeThemes(
  episode:    Episode,
  themes:     ThemeIntelligence[],
  maxMatches = 2,
): ThemeIntelligence[] {
  if (themes.length === 0) return [];

  const entitySet = new Set(episode.entities.map(e => e.toUpperCase()));
  const topicSet  = new Set(episode.topics);
  const titleLow  = episode.title.toLowerCase();
  const descLow   = (episode.description ?? "").toLowerCase().slice(0, 400);

  const scored = themes.map(theme => {
    let score = 0;

    for (const asset of theme.related_assets) {
      if (entitySet.has(asset.toUpperCase())) score += 3;
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

    return { theme, score };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxMatches)
    .map(({ theme }) => theme);
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
