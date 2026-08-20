/**
 * RC2-C3 — one canonical Capital Flow verdict.
 *
 * Three systems answered "what is the Capital Flow condition?" independently, in
 * the same vocabulary, inside the same block of /private-markets:
 *
 *   flowPressure   mean of STATUS_VALUE magnitudes, thresholded at 60/40
 *   buildSummary   five prioritised count branches (>=d/2, >=5d/8, >=3d/8)
 *   regime chip    one count majority that IGNORED `tightening` entirely
 *
 * Measured across the 36 reachable states they disagreed on direction in
 * **18 of 36 (50%)**. The live state rendered "61 FLOWING" directly above
 * "Mixed Transmission", and a uniformly tightening stack read "Mixed
 * Transmission" because tightening cast no vote on the chip.
 *
 * The acceptance criterion for this slice is ZERO disagreements across the full
 * reachable state space.
 */

import { describe, expect, it } from "vitest";
import {
  VERDICT_LABEL, capitalFlowVerdict, computeCapitalFlow, directionalLayers,
  measuredCoverage, type CapitalFlowLayer, type FlowStatus,
} from "../capitalFlow";
import { flowPressure } from "../capitalFlowIntel";

const mk = (id: string, status: FlowStatus): CapitalFlowLayer =>
  ({ id, label: id, sublabel: "", status, indicator: "", signal: "", detail: "" });

/** The five non-directional layers present in production after C2a + C2b. */
const PAD: CapitalFlowLayer[] = [
  mk("ma-activity", "observational"), mk("ipo-window", "observational"),
  mk("pe-buyout", "unmeasured"), mk("late-vc", "unmeasured"), mk("early-vc", "unmeasured"),
];

/** A real S-1 observation, so coverage reaches 5/8 (3 directional + 2 observational). */
const IPO = { newRegistrations: 3, rawEntries: 13, windowStart: "2026-08-14", windowEnd: "2026-08-18" };

const chain = (m: FlowStatus, e: FlowStatus, c: FlowStatus): CapitalFlowLayer[] =>
  [mk("monetary-policy", m), mk("public-equities", e), mk("credit-leverage", c), ...PAD];

/**
 * The chip rule as /private-markets renders it — a pure projection. If this
 * mirror ever needs its own branching, the page has re-acquired a verdict.
 */
const chipOf = (layers: CapitalFlowLayer[]) => {
  const v = capitalFlowVerdict(layers);
  return v.direction ? VERDICT_LABEL[v.direction] : "Not measured";
};

/** Coarse direction extracted from each surface's own words. */
const dirOfText = (t: string): string =>
  /leans open/.test(t)                      ? "flowing"
  : /predominantly tightening/.test(t)      ? "tightening"
  : /predominantly closed/.test(t)          ? "constrained"
  : /readings disagree/.test(t)             ? "mixed"
  : "none";
const dirOfLabel = (l: string): string =>
  l === "Capital Flowing"     ? "flowing"
  : l === "Tightening"        ? "tightening"
  : l === "Capital Constrained" ? "constrained"
  : l === "Mixed Transmission"  ? "mixed"
  : "none";

// ── The exhaustive reachable state space ────────────────────────────────────

// Read from each layer's branch structure (see the C3 diagnosis).
const MONETARY: FlowStatus[] = ["tightening", "accelerating", "neutral"];
const EQUITIES: FlowStatus[] = ["accelerating", "contracting", "tightening", "neutral"];
const CREDIT:   FlowStatus[] = ["tightening", "expanding", "neutral"];

const ALL_STATES = MONETARY.flatMap(m => EQUITIES.flatMap(e => CREDIT.map(c => ({ m, e, c }))));

describe("all 36 reachable states agree on direction", () => {
  it("the reachable space is exactly 36 combinations", () => {
    expect(ALL_STATES).toHaveLength(36);
  });

  it.each(ALL_STATES)("$m / $e / $c — verdict, summary, chip and pressure agree", ({ m, e, c }) => {
    const layers = chain(m, e, c);
    const v = capitalFlowVerdict(layers);
    const p = flowPressure(layers);
    expect(v.direction).not.toBeNull();
    expect(dirOfLabel(p.label)).toBe(v.direction);
    expect(dirOfLabel(chipOf(layers))).toBe(v.direction);
  });

  it("ZERO disagreements across the whole space (the acceptance criterion)", () => {
    const disagreements = ALL_STATES.filter(({ m, e, c }) => {
      const layers = chain(m, e, c);
      const v = capitalFlowVerdict(layers);
      return dirOfLabel(flowPressure(layers).label) !== v.direction
          || dirOfLabel(chipOf(layers)) !== v.direction;
    });
    expect(disagreements).toEqual([]);
  });

  it("coverage is 5/8 in every reachable state", () => {
    for (const { m, e, c } of ALL_STATES) {
      expect(measuredCoverage(chain(m, e, c)).measured).toBe(5);
    }
  });

  it("the numeric score may vary while the direction does not", () => {
    // Two states with the same verdict but different magnitudes - the score is
    // retained as a magnitude readout, which is the point of keeping it.
    const a = flowPressure(chain("accelerating", "accelerating", "expanding"));
    const b = flowPressure(chain("neutral", "accelerating", "expanding"));
    expect(a.label).toBe(b.label);
    expect(a.score).not.toBe(b.score);
  });
});

// ── The specific regressions this slice exists to fix ───────────────────────

describe("the live 61 FLOWING / Mixed Transmission contradiction", () => {
  const live = () => chain("neutral", "accelerating", "tightening");

  it("no longer disagrees", () => {
    const layers = live();
    const v = capitalFlowVerdict(layers);
    expect(v.direction).toBe("mixed");
    expect(flowPressure(layers).label).toBe("Mixed Transmission");
    expect(chipOf(layers)).toBe("Mixed Transmission");
  });

  it("keeps the magnitude score visible and unchanged by the formula", () => {
    const p = flowPressure(live());
    // sum = 0 + 3 - 1 = 2 over span 9 -> (2+9)/18
    expect(p.score).toBe(Math.round((11 / 18) * 100));   // 61
    expect(p.score).toBe(61);
  });

  it("a score above 60 can no longer declare itself flowing", () => {
    const p = flowPressure(live());
    expect(p.score).toBeGreaterThan(60);
    expect(p.label).not.toBe("Capital Flowing");
  });
});

describe("a uniformly tightening stack reads as tightening", () => {
  it("the chip no longer calls it Mixed Transmission", () => {
    const layers = chain("tightening", "tightening", "tightening");
    expect(capitalFlowVerdict(layers).direction).toBe("tightening");
    expect(chipOf(layers)).toBe("Tightening");
    expect(flowPressure(layers).label).toBe("Tightening");
  });

  it("its prose says predominantly tightening", () => {
    // End-to-end through computeCapitalFlow: hawkish + elevated vol + widening
    // credit puts all three directional layers into `tightening`.
    const st = computeCapitalFlow({
      riskRegime: "neutral", volRegime: "elevated", regime: "hawkish",
      tnxRate: 5.0, maDealCount: 3, ipoFilings: IPO,
      credit: { measured: true, level: 300, asOf: "2026-08-18", priorLevel: 280,
                priorAsOf: "2026-08-17", changeBp: 20, direction: "widening",
                businessDaysStale: 1 },
    } as never);
    const statuses = directionalLayers(st.layers).map(l => l.status);
    expect(new Set(statuses)).toEqual(new Set(["tightening"]));
    expect(capitalFlowVerdict(st.layers).direction).toBe("tightening");
    expect(dirOfText(st.summary)).toBe("tightening");
  });
});

// ── buildSummary is a projection, end to end ────────────────────────────────

describe("buildSummary prose always matches the canonical verdict", () => {
  const CASES = [
    { name: "all tightening", o: { riskRegime: "neutral", volRegime: "elevated", regime: "hawkish", tnxRate: 5.0,
        credit: { measured: true, level: 300, asOf: "2026-08-18", priorLevel: 280, priorAsOf: "2026-08-17",
                  changeBp: 20, direction: "widening", businessDaysStale: 1 } } },
    { name: "risk-on, tightening credit", o: { riskRegime: "risk-on", volRegime: "low", regime: "neutral", tnxRate: 4.0,
        credit: { measured: true, level: 260, asOf: "2026-08-18", priorLevel: 280, priorAsOf: "2026-08-17",
                  changeBp: -20, direction: "tightening", businessDaysStale: 1 } } },
    { name: "risk-off", o: { riskRegime: "risk-off", volRegime: "high", regime: "neutral", tnxRate: 4.0,
        credit: { measured: true, level: 280, asOf: "2026-08-18", priorLevel: 280, priorAsOf: "2026-08-17",
                  changeBp: 0, direction: "stable", businessDaysStale: 1 } } },
    { name: "credit absent", o: { riskRegime: "risk-on", volRegime: "low", regime: "neutral", tnxRate: 4.0, credit: null } },
  ];

  it.each(CASES)("$name — prose direction == verdict direction", ({ o }) => {
    const st = computeCapitalFlow({ maDealCount: 5, ipoFilings: IPO, ...o } as never);
    const v = capitalFlowVerdict(st.layers);
    if (v.direction) {
      expect(dirOfText(st.summary)).toBe(v.direction);
    } else {
      expect(st.summary).toMatch(/not enough (coverage|breadth)|none of them carry a directional reading/i);
      expect(dirOfText(st.summary)).toBe("none");
    }
  });

  it("prose states the measured facts it is projecting from", () => {
    const st = computeCapitalFlow({
      riskRegime: "risk-on", volRegime: "low", regime: "neutral", tnxRate: 4.0,
      maDealCount: 5, ipoFilings: IPO,
      credit: { measured: true, level: 260, asOf: "2026-08-18", priorLevel: 280,
                priorAsOf: "2026-08-17", changeBp: -20, direction: "tightening", businessDaysStale: 1 },
    } as never);
    expect(st.summary).toMatch(/\d+ directional layers?/);
    expect(st.summary).toMatch(/\d+ open, \d+ tightening, \d+ closed/);
  });
});

// ── Voting rules ─────────────────────────────────────────────────────────────

describe("who votes and how", () => {
  it("majority open -> flowing", () => {
    expect(capitalFlowVerdict(chain("accelerating", "accelerating", "tightening")).direction)
      .toBe("flowing");
  });

  it("majority tightening -> tightening", () => {
    expect(capitalFlowVerdict(chain("tightening", "tightening", "neutral")).direction)
      .toBe("tightening");
  });

  it("majority closed -> constrained", () => {
    // Not reachable from production layers today (only Public Equities emits
    // `contracting`, nothing emits `blocked`) but the rule must be correct.
    const layers = [mk("a", "contracting"), mk("b", "blocked"), mk("c", "neutral"), ...PAD];
    expect(capitalFlowVerdict(layers).direction).toBe("constrained");
  });

  it("no majority -> mixed", () => {
    expect(capitalFlowVerdict(chain("accelerating", "contracting", "neutral")).direction)
      .toBe("mixed");
  });

  it("neutral is directional-capable but casts no vote", () => {
    const v = capitalFlowVerdict(chain("neutral", "neutral", "expanding"));
    expect(v.directional).toBe(3);       // neutral counts as directional-capable
    expect(v.neutral).toBe(2);
    expect(v.open).toBe(1);
    expect(v.direction).toBe("mixed");   // 1 open of 3 is not a majority
  });

  it("observational layers do not vote", () => {
    const withObs = [mk("a", "expanding"), mk("b", "expanding"), mk("c", "neutral"),
                     mk("o1", "observational"), mk("o2", "observational"), ...PAD.slice(2)];
    const v = capitalFlowVerdict(withObs);
    expect(v.directional).toBe(3);
    expect(v.open).toBe(2);
    expect(v.direction).toBe("flowing");
  });

  it("unmeasured layers do not vote", () => {
    const v = capitalFlowVerdict(chain("expanding" as FlowStatus, "expanding" as FlowStatus, "neutral"));
    expect(v.directional).toBe(3);
    expect(directionalLayers(chain("expanding" as FlowStatus, "expanding" as FlowStatus, "neutral")))
      .toHaveLength(3);
  });

  it("majority is strict (n*2 > d), the same form measuredCoverage uses", () => {
    // 1 of 2 is not a majority; 2 of 2 is.
    const half = [mk("a", "expanding"), mk("b", "tightening"), ...PAD];
    expect(capitalFlowVerdict(half).direction).toBe("mixed");
    const both = [mk("a", "expanding"), mk("b", "accelerating"), ...PAD];
    expect(capitalFlowVerdict(both).direction).toBe("flowing");
  });
});

// ── Sufficiency and breadth ─────────────────────────────────────────────────

describe("sufficiency precedes breadth, and breadth precedes direction", () => {
  it("insufficient measured coverage -> no verdict (C2a rule, unchanged)", () => {
    const layers = [mk("a", "expanding"), mk("b", "accelerating"), mk("c", "unmeasured"),
                    mk("d", "unmeasured"), mk("e", "unmeasured"), mk("f", "unmeasured"),
                    mk("g", "unmeasured"), mk("h", "unmeasured")];
    const v = capitalFlowVerdict(layers);
    expect(v.direction).toBeNull();
    expect(v.insufficient).toBe("coverage");
  });

  it("zero directional layers -> insufficient", () => {
    const layers = [mk("a", "observational"), mk("b", "observational"),
                    mk("c", "observational"), mk("d", "unmeasured")];
    const v = capitalFlowVerdict(layers);
    expect(v.direction).toBeNull();
    expect(v.insufficient).toBe("breadth");
    expect(v.directional).toBe(0);
  });

  it("ONE directional layer cannot characterise the stack", () => {
    // Breadth needs something to be broad across. A lone layer restating itself
    // as the condition of the whole funding stack is not consensus.
    const layers = [mk("a", "accelerating"), mk("b", "observational"),
                    mk("c", "observational"), mk("d", "unmeasured")];
    const v = capitalFlowVerdict(layers);
    expect(v.directional).toBe(1);
    expect(v.direction).toBeNull();
    expect(v.insufficient).toBe("breadth");
  });

  it("two directional layers is enough for a verdict", () => {
    const layers = [mk("a", "accelerating"), mk("b", "expanding"),
                    mk("c", "observational"), mk("d", "unmeasured")];
    expect(capitalFlowVerdict(layers).direction).toBe("flowing");
  });

  it("coverage insufficiency wins over breadth insufficiency", () => {
    const layers = [mk("a", "accelerating"), ...Array.from({ length: 7 }, (_, i) => mk(`u${i}`, "unmeasured"))];
    expect(capitalFlowVerdict(layers).insufficient).toBe("coverage");
  });

  it("every surface reports the absence, none invents a direction", () => {
    const layers = [mk("a", "accelerating"), mk("b", "observational"),
                    mk("c", "observational"), mk("d", "unmeasured")];
    expect(flowPressure(layers).label).toBe("NOT MEASURED");
    expect(chipOf(layers)).toBe("Not measured");
  });
});

// ── No second verdict anywhere ──────────────────────────────────────────────

describe("the verdict is the single authority", () => {
  it("flowPressure's label is always VERDICT_LABEL or the absence state", () => {
    const allowed = new Set([...Object.values(VERDICT_LABEL), "NOT MEASURED"]);
    for (const { m, e, c } of ALL_STATES) {
      expect(allowed.has(flowPressure(chain(m, e, c)).label)).toBe(true);
    }
  });

  it("liquidity wording tracks the verdict, not the score", () => {
    const live = chain("neutral", "accelerating", "tightening");
    expect(flowPressure(live).score).toBeGreaterThan(60);
    expect(flowPressure(live).liquidity).toBe("Liquidity Mixed");
  });

  it("trend derives from the same counts as the verdict", () => {
    const t = flowPressure(chain("tightening", "tightening", "tightening"));
    expect(t.trend).toBe("deteriorating");
  });

  it("STATUS_VALUE and the score formula are untouched by C3", () => {
    // Same arithmetic as before: sum over directional layers, span = n*3.
    const p = flowPressure(chain("accelerating", "accelerating", "expanding"));
    const sum = 3 + 3 + 2, span = 9;
    expect(p.score).toBe(Math.round(((sum + span) / (span * 2)) * 100));
  });
});
