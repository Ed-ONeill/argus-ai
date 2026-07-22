/**
 * OP4.2 (Sprint 1): the transmission view-model contract.
 *
 * - typed chain present → chain renders, prose NEVER accompanies it;
 * - no chain, prose present → prose (renderers tag it "unverified narrative");
 * - neither → honest absence — nothing is synthesized in either direction;
 * - weakest-hop rule: min over hop confidences, but null (unknown) the moment
 *   any hop lacks one — a bound is never invented from partial data.
 */

import { describe, expect, it } from "vitest";
import { buildTransmissionView, weakestHopConfidence } from "../transmissionView";
import type { TransmissionHop } from "../types";

function hop(overrides: Partial<TransmissionHop> = {}): TransmissionHop {
  return {
    source_uid: "driver:rate-expectations",
    relationship: "drives",
    target_uid: "theme:duration-unwind",
    rel_uid: "rel:driver:rate-expectations|drives|theme:duration-unwind",
    basis: "recorded_graph",
    strength: 60,
    confidence: 0.7,
    source_label: "Rate expectations",
    ...overrides,
  };
}

describe("buildTransmissionView", () => {
  it("prefers the typed chain and carries its hops verbatim", () => {
    const hops = [hop(), hop({ target_uid: "company:NVDA", confidence: 0.5 })];
    const view = buildTransmissionView(hops, "some legacy prose");
    expect(view.kind).toBe("chain");
    if (view.kind === "chain") {
      expect(view.hops).toBe(hops);               // verbatim — no re-ranking, no copies
      expect(view.weakestHopConfidence).toBe(0.5); // weakest-hop rule
    }
  });

  it("never mixes epistemologies: prose is unreachable when a chain exists", () => {
    const view = buildTransmissionView([hop()], "prose that must not render");
    expect(view.kind).toBe("chain");
  });

  it("falls back to prose only when the chain is absent or empty", () => {
    for (const chain of [undefined, null, [] as TransmissionHop[]]) {
      const view = buildTransmissionView(chain, "Fed repricing pressures long duration");
      expect(view).toEqual({ kind: "prose", text: "Fed repricing pressures long duration" });
    }
  });

  it("renders honest absence when neither exists — nothing synthesized", () => {
    expect(buildTransmissionView([], null)).toEqual({ kind: "absent" });
    expect(buildTransmissionView(undefined, undefined)).toEqual({ kind: "absent" });
    expect(buildTransmissionView(null, "   ")).toEqual({ kind: "absent" }); // whitespace is not a narrative
  });
});

describe("weakestHopConfidence", () => {
  it("is the minimum when every hop carries confidence", () => {
    expect(weakestHopConfidence([hop({ confidence: 0.9 }), hop({ confidence: 0.4 }), hop({ confidence: 0.6 })])).toBe(0.4);
  });

  it("is null — unknown, not invented — when any hop lacks confidence", () => {
    expect(weakestHopConfidence([hop({ confidence: 0.9 }), hop({ confidence: null })])).toBeNull();
  });

  it("is null for an empty chain", () => {
    expect(weakestHopConfidence([])).toBeNull();
  });
});
