"use client";

/**
 * useIntelligenceProfile - memoized assembly of the canonical Intelligence
 * Profile (lib/intelligenceProfile.ts) for a surface component.
 *
 * Profile Engine step 1 (docs/ARGUS_INTELLIGENCE_PROFILE_V1.md section 6): the
 * assembler itself is a pure, stateless graph/engine read, so the hook's only
 * jobs are (a) memoizing the assembly and (b) re-running it when the caller's
 * invalidation signals change (graph.ready, market.version, memVersion - the
 * graph singleton mutates outside React, so React cannot see those changes
 * itself). Page-level narrative (crossIntel) is injected by the caller, never
 * fetched here. No UI. No em/en dashes.
 */

import { useMemo } from "react";
import {
  buildIntelligenceProfile,
  type IntelligenceProfile, type ProfileInputs, type ProfileKind,
} from "@/lib/intelligenceProfile";
import type { IntelKind } from "@/lib/intelligenceContext";

/** Map a page-level IntelKind onto the profile's kind vocabulary (undefined =
    let the assembler derive the kind from the node type). */
const PROFILE_KIND_OF_INTEL: Partial<Record<IntelKind, ProfileKind>> = {
  company: "company", etf: "etf", theme: "theme", narrative: "theme", sector: "sector", driver: "driver",
};
export const profileKindOfIntelKind = (k: IntelKind): ProfileKind | undefined => PROFILE_KIND_OF_INTEL[k];

/**
 * Assemble the Intelligence Profile for one entity key, re-assembling when the
 * key, the injected narrative, or any caller-supplied invalidation signal
 * changes. Never throws: unknown entities come back fully "unavailable".
 */
export function useIntelligenceProfile(
  entityKey: string,
  inputs: ProfileInputs = {},
  signals: ReadonlyArray<unknown> = [],
): IntelligenceProfile {
  const kindHint = inputs.kindHint;
  const headline = inputs.narrative?.headline ?? null;
  const nextWatch = inputs.narrative?.nextWatch ?? null;
  return useMemo(
    () => buildIntelligenceProfile(entityKey, {
      ...(kindHint ? { kindHint } : {}),
      narrative: { headline, nextWatch },
    }),
    // The signals array carries the caller's graph invalidation ticks; its
    // members are the real dependencies even though the lint rule cannot see them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityKey, kindHint, headline, nextWatch, ...signals],
  );
}
