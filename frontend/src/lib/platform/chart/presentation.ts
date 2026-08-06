// platform/chart/presentation.ts — the honesty layer between DataQuality and pixels. Pure.
//
// The chart draws only real values; this module decides how their RELIABILITY is shown.
// The one rule that matters: non-live data is NEVER styled as live. A live affordance
// (the glow dot) appears only when the fact is genuinely realtime-and-fresh (isLive);
// every other grade (DELAYED / STALE / PARTIAL / ESTIMATED) gets a plain label and no
// live styling. Copy avoids em/en dashes to match Argus house style.

import { isLive, type DataQuality } from "@/lib/platform/quality";

export interface QualityBadge {
  label: string;   // short, human copy for the surface
  live: boolean;   // drives live styling ONLY; false for every non-realtime grade
}

const GRADE_LABEL: Record<DataQuality["grade"], string> = {
  REALTIME: "Live",
  DELAYED: "Delayed",
  STALE: "Stale",
  ESTIMATED: "Estimated",
  PARTIAL: "Partial",
};

/**
 * Describe a series' DataQuality for display, or null when there is no quality to show.
 * `live` is true only when isLive() holds; a REALTIME grade that has gone stale reports
 * live=false and the "Delayed" label, so nothing stale is ever painted as live.
 */
export function qualityBadge(quality: DataQuality | null | undefined): QualityBadge | null {
  if (!quality) return null;
  const live = isLive(quality);
  if (live) return { label: GRADE_LABEL.REALTIME, live: true };
  // Non-live: a realtime grade that is no longer fresh must not read as "Live".
  const label = quality.grade === "REALTIME" ? GRADE_LABEL.DELAYED : GRADE_LABEL[quality.grade];
  return { label, live: false };
}

/** Whether a quality label should be surfaced. Live data needs no caveat; anything else
 *  is labeled so delayed/stale/estimated/partial data is never presented as current. */
export function shouldLabelQuality(quality: DataQuality | null | undefined): boolean {
  const badge = qualityBadge(quality);
  return !!badge && !badge.live;
}
