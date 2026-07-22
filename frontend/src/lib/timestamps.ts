/**
 * lib/timestamps.ts — OP4.0: the one place API timestamps become epoch
 * milliseconds. Canonical rules:
 *   - published_ts and fetched_at are ISO-8601 UTC strings from the backend;
 *   - a missing/invalid value returns null — callers must treat "unknown" as
 *     unknown, never substitute Date.now() (the fabricated-freshness defect
 *     this task exists to kill, audit C2/B9);
 *   - display-string parsing ("2h ago") is never a timestamp source.
 */

export function toEpochMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Observation timestamps for a feed item: firstSeen = publication time when
 * known, else Argus's first fetch; lastSeen mirrors firstSeen (a feed item is
 * one observation — recurrence is the graph's business, not the item's).
 * Returns null when neither timestamp exists — the caller renders honest
 * absence instead of inventing "now".
 */
export function observationEpochs(item: {
  published_ts?: string | null;
  fetched_at?: string | null;
}): { firstSeen: number; lastSeen: number } | null {
  const t = toEpochMs(item.published_ts) ?? toEpochMs(item.fetched_at);
  if (t === null) return null;
  return { firstSeen: t, lastSeen: t };
}
