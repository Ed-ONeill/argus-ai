/**
 * lib/transmissionView.ts — OP4.2: the single decision point for how an
 * event's transmission renders (ARGUS_OBSERVATION_PIPELINE_AUDIT_V1 B4,
 * OP1_IMPLEMENTATION_PLAN §OP4.2).
 *
 * PURE PROJECTION of canonical backend reasoning: the typed
 * `transmission_chain` (IRE-1, the strongest linked theme's recorded/curated
 * hops) always wins; the legacy LLM-era `transmission` prose renders ONLY
 * when no typed chain exists, and renderers must tag it "unverified
 * narrative" so the two epistemologies are never visually equivalent.
 * Nothing here computes meaning or invents a number.
 */

import type { TransmissionHop } from "./types";

export type TransmissionView =
  | { kind: "chain"; hops: TransmissionHop[]; weakestHopConfidence: number | null }
  | { kind: "prose"; text: string }   // render with an "unverified narrative" tag
  | { kind: "absent" };

/**
 * The weakest-hop rule (reasoning contract §: "a chain's confidence is capped
 * by its weakest hop"): min over hop confidences — but only when EVERY hop
 * carries one. If any hop's confidence is null, the chain's floor is unknown
 * and we return null rather than invent a bound from partial data.
 */
export function weakestHopConfidence(hops: TransmissionHop[]): number | null {
  if (hops.length === 0) return null;
  let min = Infinity;
  for (const h of hops) {
    if (h.confidence === null || h.confidence === undefined) return null;
    if (h.confidence < min) min = h.confidence;
  }
  return min;
}

export function buildTransmissionView(
  chain: TransmissionHop[] | null | undefined,
  prose: string | null | undefined,
): TransmissionView {
  if (Array.isArray(chain) && chain.length > 0) {
    return { kind: "chain", hops: chain, weakestHopConfidence: weakestHopConfidence(chain) };
  }
  const text = (prose ?? "").trim();
  if (text.length > 0) return { kind: "prose", text };
  return { kind: "absent" };
}
