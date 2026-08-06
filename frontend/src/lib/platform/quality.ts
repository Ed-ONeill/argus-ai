// platform/quality.ts — DX3.1 Refinement A: DataQuality.
//
// Confidence in the DATA, never in the market. Every Reference fact carries a
// DataQuality envelope so downstream consumers (brief, feed, drawer, entity page,
// Workstation) can reason about reliability independently of any market confidence
// (which the Intelligence Plane owns). Pure and deterministic.

export type QualityGrade = "REALTIME" | "DELAYED" | "STALE" | "ESTIMATED" | "PARTIAL";
export type Freshness = "fresh" | "delayed" | "stale";

export interface DataQuality {
  source: string;       // provider that produced the fact, e.g. "eodhd"
  updatedAt: string;    // ISO — when the fact was true (never fabricated)
  delayMs: number;      // provider delay at read time (0 = realtime)
  freshness: Freshness;
  grade: QualityGrade;
}

const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;

/** Pure: freshness bucket from a delay. Deterministic given inputs. */
export function freshnessFor(delayMs: number, staleAfterMs: number = DEFAULT_STALE_AFTER_MS): Freshness {
  if (!Number.isFinite(delayMs) || delayMs <= 0) return "fresh";
  return delayMs < staleAfterMs ? "delayed" : "stale";
}

export function makeQuality(
  source: string,
  updatedAt: string,
  opts: { grade: QualityGrade; delayMs?: number; staleAfterMs?: number },
): DataQuality {
  const delayMs = opts.delayMs ?? 0;
  return {
    source,
    updatedAt,
    delayMs,
    freshness: freshnessFor(delayMs, opts.staleAfterMs),
    grade: opts.grade,
  };
}

/** A fact is safe to present as live only if it is realtime and fresh. ESTIMATED /
 *  PARTIAL / STALE can never be shown as live — an honesty guard for the UI layer. */
export function isLive(q: DataQuality | null | undefined): boolean {
  return !!q && q.grade === "REALTIME" && q.freshness === "fresh";
}
