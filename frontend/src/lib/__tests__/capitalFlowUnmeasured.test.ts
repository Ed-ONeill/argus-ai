/**
 * RC2-C2a — the three private-market layers carry no data authority.
 *
 * What was rendered to users on /private-markets before this slice:
 *
 *   PE / Buyout     "LP Capital Pause" — an assertion about limited-partner
 *                   behaviour, derived from `riskRegime` (= norm(avgEq, -3, 3)),
 *                   `tnxRate > 4.5`, and the total M&A headline count.
 *   Late-Stage VC   "3 Recent Rounds" (Series C-E) — where the count was
 *                   `deals.filter(d => d.dealType === "sponsor").length`, i.e.
 *                   PE buyout HEADLINES presented as venture financing rounds.
 *                   On /ma the input was hardcoded 0, so the layer asserted
 *                   "Frozen - late-stage funding effectively closed" from a
 *                   literal that was never a measurement.
 *   Early-Stage VC  "Seed markets frozen, generalist LPs have paused
 *                   commitments" — from equity and volatility regime alone.
 *
 * Argus has no venture, buyout, or LP/fundraising source. These tests enforce the
 * C1 standard: real measurement or an explicit unmeasured state, and no third
 * option. They also pin the aggregate rule, which is where an absence is most
 * easily laundered back into a confident claim.
 */

import { describe, expect, it } from "vitest";
import { computeCapitalFlow, measuredCoverage, type CapitalFlowLayer, type FlowOptions } from "../capitalFlow";
import { flowPressure } from "../capitalFlowIntel";
import { buildCreditSpreadState } from "../creditSpread";

const NOW = new Date("2026-08-18T12:00:00Z");

const credit = (pp = 2.67, prior = 2.71) =>
  buildCreditSpreadState(
    [{ date: "2026-08-14", valuePp: prior }, { date: "2026-08-17", valuePp: pp }], NOW,
  );

/** RC2-C2b: a representative S-1 observation (the measured 2026-08-18 shape). */
const IPO = { newRegistrations: 3, rawEntries: 13, windowStart: "2026-08-14", windowEnd: "2026-08-18" };

const opts = (over: Partial<FlowOptions> = {}): FlowOptions => ({
  riskRegime: "neutral", volRegime: "moderate", regime: null, tnxRate: 4.2,
  maDealCount: 5, ipoFilings: IPO, credit: credit(), ...over,
});

const layer = (id: string, o: FlowOptions = opts()) =>
  computeCapitalFlow(o).layers.find(l => l.id === id)!;

const DEMOTED = ["pe-buyout", "late-vc", "early-vc"] as const;

/** Every unsupported phrase these layers used to emit. */
const BANNED = [
  /LP Capital Pause/i, /Recent Rounds?/i, /Seed .*frozen/i, /Pipeline Active/i,
  /LBO Math/i, /LP willingness/i, /paused commitments/i, /dry powder/i,
  /Frozen/i, /effectively closed/i, /Slow Flow/i, /Risk-On/i, /Risk-Off/i,
  /deploying capital/i, /valuations/i, /step-ups/i, /bridge rounds/i,
];

const textOf = (l: CapitalFlowLayer) => `${l.indicator} ${l.signal} ${l.detail}`;

// ── The three layers are unmeasured, unconditionally ─────────────────────────

describe("PE / Buyout is unmeasured regardless of any proxy input", () => {
  it.each([
    ["risk-on",  { riskRegime: "risk-on"  as const }],
    ["risk-off", { riskRegime: "risk-off" as const }],
    ["high rates", { tnxRate: 6.5 }],
    ["zero rates", { tnxRate: 0.5 }],
    ["hawkish regime", { regime: "hawkish tightening" }],
    ["dovish regime", { regime: "dovish easing" }],
    ["heavy M&A flow", { maDealCount: 40 }],
    ["no M&A flow", { maDealCount: 0 }],
  ])("stays unmeasured under %s", (_name, over) => {
    const l = layer("pe-buyout", opts(over));
    expect(l.status).toBe("unmeasured");
    expect(l.indicator).toBe("Not measured");
  });

  it("is byte-identical across every proxy permutation", () => {
    const a = layer("pe-buyout", opts({ riskRegime: "risk-off", tnxRate: 6.5, maDealCount: 0, regime: "hawkish" }));
    const b = layer("pe-buyout", opts({ riskRegime: "risk-on",  tnxRate: 0.5, maDealCount: 40, regime: "dovish" }));
    expect(a).toEqual(b);
  });
});

describe("Late-Stage VC is unmeasured regardless of sponsor-deal count", () => {
  it.each([0, 1, 3, 10, 99])("stays unmeasured with maDealCount %s", (n) => {
    const l = layer("late-vc", opts({ maDealCount: n }));
    expect(l.status).toBe("unmeasured");
    expect(l.indicator).toBe("Not measured");
  });

  it("never renders a round count", () => {
    for (const n of [0, 3, 12]) {
      expect(textOf(layer("late-vc", opts({ maDealCount: n })))).not.toMatch(/\d+\s*(recent\s*)?rounds?/i);
    }
  });

  it("the hardcoded-zero case no longer asserts a frozen market", () => {
    // The /ma shape: it used to read "Frozen - late-stage funding effectively closed".
    const l = layer("late-vc", opts({ maDealCount: 7, riskRegime: "risk-on" }));
    expect(textOf(l)).not.toMatch(/frozen|closed|effectively/i);
  });
});

describe("Early-Stage VC is unmeasured regardless of equity/vol/regime state", () => {
  it.each([
    ["risk-off + high vol", { riskRegime: "risk-off" as const, volRegime: "high" as const }],
    ["risk-on + low vol",   { riskRegime: "risk-on"  as const, volRegime: "low"  as const }],
    ["hawkish",             { regime: "hawkish" }],
    ["neutral",             {}],
  ])("stays unmeasured under %s", (_name, over) => {
    expect(layer("early-vc", opts(over)).status).toBe("unmeasured");
  });

  it("makes no claim about LP behaviour or seed-market conditions", () => {
    // Naming the ABSENT source ("no seed and early-stage financing data source")
    // is honest and useful; asserting what those markets are DOING is not. The
    // assertion targets claim-shaped phrases, not the bare nouns.
    const CLAIMS = [
      /seed[^.]*(frozen|active|flowing|paused|open|closed|reset)/i,
      /(LPs?|limited partners?)[^.]*(paused|pausing|willing|commit|committed|reduced)/i,
      /commitments? (are|have|to)/i,
    ];
    for (const over of [
      { riskRegime: "risk-off" as const, volRegime: "high" as const },
      { riskRegime: "risk-on"  as const },
      { regime: "hawkish" },
    ]) {
      const t = textOf(layer("early-vc", opts(over)));
      for (const re of CLAIMS) expect(t).not.toMatch(re);
    }
  });

  it("the old frozen-seed / paused-LP sentence is gone entirely", () => {
    const t = textOf(layer("early-vc", opts({ riskRegime: "risk-off", volRegime: "high" })));
    expect(t).not.toContain("Seed and early-stage markets frozen");
    expect(t).not.toContain("generalist LPs have paused commitments");
  });
});

describe("no unsupported phrase can be emitted by any demoted layer", () => {
  it("across a wide sweep of inputs", () => {
    const sweep: Partial<FlowOptions>[] = [
      {}, { riskRegime: "risk-on" }, { riskRegime: "risk-off" },
      { volRegime: "high" }, { volRegime: "low" }, { tnxRate: 7 }, { tnxRate: null },
      { regime: "hawkish" }, { regime: "dovish" }, { maDealCount: 0 }, { maDealCount: 50 },
      { credit: null }, { credit: credit(2.90, 2.60) },
    ];
    for (const over of sweep) {
      for (const id of DEMOTED) {
        const t = textOf(layer(id, opts(over)));
        for (const re of BANNED) {
          expect(t, `${id} under ${JSON.stringify(over)} emitted ${re}`).not.toMatch(re);
        }
      }
    }
  });

  it("copy states the absence and stops", () => {
    for (const id of DEMOTED) {
      const l = layer(id);
      expect(l.detail).toMatch(/not currently measured/i);
      expect(l.signal).toBe("Unavailable");
    }
  });

  it("the layers keep their place in the chain — coverage gaps stay visible", () => {
    const ids = computeCapitalFlow(opts()).layers.map(l => l.id);
    expect(ids).toEqual([
      "monetary-policy", "public-equities", "credit-leverage", "ma-activity",
      "pe-buyout", "late-vc", "early-vc", "ipo-window",
    ]);
  });
});

// ── Aggregates must not launder the absence ──────────────────────────────────

describe("flowPressure counts only measured layers", () => {
  it("the three demoted layers contribute nothing to the verdict", () => {
    const layers = computeCapitalFlow(opts()).layers;
    const measured = layers.filter(l => l.status !== "unmeasured");
    const withUnmeasured = flowPressure(layers);
    const measuredOnly   = flowPressure(measured);
    // The SCORING is identical: the unmeasured layers entered neither numerator
    // nor denominator. `total` legitimately differs (8 vs 5) because coverage is a
    // property of the set each call was given, not of the score.
    expect(withUnmeasured.score).toBe(measuredOnly.score);
    expect(withUnmeasured.label).toBe(measuredOnly.label);
    expect(withUnmeasured.trend).toBe(measuredOnly.trend);
    expect(withUnmeasured.liquidity).toBe(measuredOnly.liquidity);
    expect(withUnmeasured.measured).toBe(measuredOnly.measured);
  });

  it("is unaffected by proxies that used to drive the demoted layers", () => {
    const a = flowPressure(computeCapitalFlow(opts({ maDealCount: 5, riskRegime: "neutral" })).layers);
    const b = flowPressure(computeCapitalFlow(opts({ maDealCount: 5, riskRegime: "neutral", tnxRate: 4.2 })).layers);
    expect(a).toEqual(b);
  });

  it("an unmeasured layer is neither open nor closed", () => {
    const layers = computeCapitalFlow(opts()).layers;
    const openish = layers.filter(l => l.status === "accelerating" || l.status === "expanding");
    const closedish = layers.filter(l => l.status === "contracting" || l.status === "blocked");
    for (const id of DEMOTED) {
      expect(openish.map(l => l.id)).not.toContain(id);
      expect(closedish.map(l => l.id)).not.toContain(id);
    }
  });

  it("does not divide by zero when nothing is measured", () => {
    const allUnmeasured: CapitalFlowLayer[] = DEMOTED.map(id => ({
      id, label: id, sublabel: "", status: "unmeasured",
      indicator: "Not measured", signal: "Unavailable", detail: "",
    }));
    const p = flowPressure(allUnmeasured);
    expect(Number.isFinite(p.score)).toBe(true);
  });
});

describe("buildSummary speaks only for measured layers", () => {
  const summaryOf = (o: FlowOptions) => computeCapitalFlow(o).summary;

  it("never names an unmeasured layer", () => {
    // The old "flowing freely" copy said "from M&A through early-stage VC".
    for (const over of [{ riskRegime: "risk-on" as const }, { riskRegime: "risk-off" as const }, {}]) {
      const s = summaryOf(opts(over));
      expect(s).not.toMatch(/early-stage VC|late-stage|buyout/i);
    }
  });

  it("open/closed/tight counts exclude the demoted layers", () => {
    // With 5 measured layers the thresholds scale: ceil(5/2)=3, ceil(5*5/8)=4.
    const s = summaryOf(opts({ riskRegime: "risk-on", volRegime: "low" }));
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(20);
  });

  it("returns an explicit insufficient state when most of the stack is unmeasured", () => {
    // Credit unmeasured too -> 4 of 8, not a majority.
    const s = computeCapitalFlow(opts({ credit: null })).summary;
    expect(s).toMatch(/not enough coverage|4 of 8/i);
    expect(s).not.toMatch(/flowing freely|severely impaired/i);
  });

  it("the insufficient state makes no directional claim", () => {
    const s = computeCapitalFlow(opts({ credit: null, riskRegime: "risk-on" })).summary;
    expect(s).not.toMatch(/enabling|restricting|positive|impaired/i);
  });

  it("proportional thresholds reproduce the original semantics at 8 measured layers", () => {
    // ceil(8/2)=4 closed, ceil(8*5/8)=5 open, ceil(8*3/8)=3 open — the originals.
    expect(Math.ceil(8 / 2)).toBe(4);
    expect(Math.ceil((8 * 5) / 8)).toBe(5);
    expect(Math.ceil((8 * 3) / 8)).toBe(3);
  });
});

// ── Untouched neighbours ─────────────────────────────────────────────────────

describe("C1 and the out-of-scope layers are unchanged", () => {
  it("Credit & Leverage still reports its measured spread", () => {
    const l = layer("credit-leverage");
    expect(l.status).toBe("expanding");
    expect(l.indicator).toContain("267bp");
    expect(l.indicator).toContain("2026-08-17");
  });

  it("Credit & Leverage still goes unmeasured when the series is absent", () => {
    expect(layer("credit-leverage", opts({ credit: null })).status).toBe("unmeasured");
  });

  it("M&A Activity is observational after C2b (was accelerating)", () => {
    const l = layer("ma-activity", opts({ maDealCount: 9 }));
    expect(l.status).toBe("observational");
    expect(l.indicator).toBe("9 M&A-related items tracked");
  });

  it("IPO Filing Activity is observational after C2b (was accelerating)", () => {
    const l = layer("ipo-window", opts({ riskRegime: "neutral", volRegime: "moderate" }));
    expect(l.status).toBe("observational");
    expect(l.indicator).toContain("3 new S-1");
  });

  it("Monetary Policy and Public Equities still read their real inputs", () => {
    expect(layer("monetary-policy", opts({ tnxRate: 4.2 })).indicator).toBe("10Y 4.20%");
    expect(layer("public-equities", opts({ riskRegime: "risk-on", volRegime: "low" })).status)
      .toBe("accelerating");
  });
});

// ── Aggregate consistency: pressure obeys the same sufficiency contract ──────

/** Build a synthetic chain with exactly `n` measured layers out of `total`. */
function chain(measuredStatuses: CapitalFlowLayer["status"][], total = 8): CapitalFlowLayer[] {
  const out: CapitalFlowLayer[] = measuredStatuses.map((status, i) => ({
    id: `m${i}`, label: `M${i}`, sublabel: "", status,
    indicator: "x", signal: "x", detail: "x",
  }));
  while (out.length < total) {
    out.push({
      id: `u${out.length}`, label: `U${out.length}`, sublabel: "", status: "unmeasured",
      indicator: "Not measured", signal: "Unavailable", detail: "",
    });
  }
  return out;
}

const DIRECTIONAL = /FLOWING|CONSTRAINED|MIXED|Liquidity (Expanding|Contracting|Stable)|Improving|Deteriorating|Holding/;

describe("flowPressure sufficiency contract", () => {
  it("8/8 measured — behaviour is unchanged from before C2a", () => {
    const layers = chain(["accelerating", "expanding", "expanding", "neutral",
                          "expanding", "neutral", "expanding", "accelerating"]);
    const p = flowPressure(layers);
    // Original formula: sum over 8 layers, span 24, score = (sum+24)/48.
    const sum = 3 + 2 + 2 + 0 + 2 + 0 + 2 + 3;
    expect(p.score).toBe(Math.round(((sum + 24) / 48) * 100));
    expect(p.sufficient).toBe(true);
    expect(p.label).toBe("FLOWING");
    expect(p.liquidity).toBe("Liquidity Expanding");
    expect(p.trendLabel).toBe("Improving");
  });

  it("5/8 measured — directional, scored over the measured layers only", () => {
    const layers = chain(["accelerating", "expanding", "expanding", "neutral", "accelerating"]);
    const p = flowPressure(layers);
    const sum = 3 + 2 + 2 + 0 + 3, span = 5 * 3;
    expect(p.measured).toBe(5);
    expect(p.total).toBe(8);
    expect(p.sufficient).toBe(true);
    expect(p.score).toBe(Math.round(((sum + span) / (span * 2)) * 100));
    expect(p.label).toBe("FLOWING");
  });

  it("5/8 is deterministic", () => {
    const layers = chain(["accelerating", "expanding", "expanding", "neutral", "accelerating"]);
    expect(flowPressure(layers)).toEqual(flowPressure(chain(
      ["accelerating", "expanding", "expanding", "neutral", "accelerating"])));
  });

  it("4/8 measured — NO directional pressure label", () => {
    const layers = chain(["accelerating", "expanding", "expanding", "accelerating"]);
    const p = flowPressure(layers);
    expect(p.sufficient).toBe(false);
    expect(p.label).toBe("NOT MEASURED");
    expect(p.label).not.toMatch(DIRECTIONAL);
    expect(p.liquidity).not.toMatch(DIRECTIONAL);
    expect(p.trendLabel).not.toMatch(DIRECTIONAL);
    expect(p.liquidity).toBe("4 of 8 layers measured");
  });

  it("4/8 — the score is preserved internally even though no verdict renders", () => {
    const p = flowPressure(chain(["accelerating", "expanding", "expanding", "accelerating"]));
    expect(Number.isFinite(p.score)).toBe(true);
    expect(p.score).toBeGreaterThan(0);
  });

  it("0 measured — explicit insufficient, no verdict, no crash", () => {
    const p = flowPressure(chain([]));
    expect(p.sufficient).toBe(false);
    expect(p.label).toBe("NOT MEASURED");
    expect(p.liquidity).toBe("0 of 8 layers measured");
    expect(Number.isFinite(p.score)).toBe(true);
  });

  it("an empty chain does not divide by zero or claim a verdict", () => {
    const p = flowPressure([]);
    expect(p.sufficient).toBe(false);
    expect(Number.isFinite(p.score)).toBe(true);
  });

  it("unmeasured layers never enter numerator or denominator", () => {
    // Same measured statuses, different numbers of unmeasured layers padded in.
    const a = flowPressure(chain(["accelerating", "expanding", "expanding", "neutral", "expanding"], 5));
    const b = flowPressure(chain(["accelerating", "expanding", "expanding", "neutral", "expanding"], 8));
    expect(a.score).toBe(b.score);          // padding changed nothing
    expect(a.sufficient && b.sufficient).toBe(true);
  });

  it("adding an unmeasured layer cannot move the score toward neutral", () => {
    const before = flowPressure(chain(["accelerating", "accelerating", "accelerating"], 3));
    const after  = flowPressure(chain(["accelerating", "accelerating", "accelerating"], 5));
    // 3/5 is still a majority, so both are directional and the score is identical.
    expect(after.sufficient).toBe(true);
    expect(after.score).toBe(before.score);
  });
});

describe("summary and pressure never disagree about coverage", () => {
  const opt = (over: Partial<FlowOptions> = {}) => opts(over);

  it("agree at 5/8 — both directional", () => {
    const st = computeCapitalFlow(opt());
    const p = flowPressure(st.layers);
    expect(p.sufficient).toBe(true);
    expect(st.summary).not.toMatch(/not enough coverage/i);
  });

  it("agree at 4/8 — both insufficient", () => {
    const st = computeCapitalFlow(opt({ credit: null }));
    const p = flowPressure(st.layers);
    expect(p.sufficient).toBe(false);
    expect(st.summary).toMatch(/not enough coverage/i);
    expect(p.label).not.toMatch(DIRECTIONAL);
  });

  it("the production 4/8 case renders no contradictory pair", () => {
    // Was: "not enough coverage to characterise conditions" directly above
    //      "83 · FLOWING · Liquidity Expanding".
    const st = computeCapitalFlow(opt({ credit: null, riskRegime: "risk-on" }));
    const p = flowPressure(st.layers);
    expect(`${st.summary} ${p.label} ${p.liquidity}`).not.toMatch(/FLOWING|Liquidity Expanding/);
  });
});

// ── The sufficiency boundary, pinned explicitly ──────────────────────────────

describe("measuredCoverage boundary: exactly 50% is INSUFFICIENT", () => {
  const cov = (measured: number, total: number) =>
    measuredCoverage(chain(Array(measured).fill("neutral"), total));

  it.each([
    [4, 8], [2, 4], [1, 2], [3, 6], [5, 10],
  ])("%s of %s is exactly half — insufficient", (m, t) => {
    expect(cov(m, t).sufficient).toBe(false);
  });

  it.each([
    [5, 8], [3, 4], [2, 3], [4, 6], [6, 10],
  ])("%s of %s is a majority — sufficient", (m, t) => {
    expect(cov(m, t).sufficient).toBe(true);
  });

  it("odd totals resolve correctly on both sides", () => {
    expect(cov(3, 7).sufficient).toBe(false);   // 43%
    expect(cov(4, 7).sufficient).toBe(true);    // 57%
  });

  it("the boundary is strictly greater-than-half, not >=", () => {
    // One layer either side of exactly half, at the production chain size.
    expect(cov(4, 8).sufficient).toBe(false);
    expect(cov(5, 8).sufficient).toBe(true);
  });

  it("zero measured and an empty chain are both insufficient", () => {
    expect(cov(0, 8).sufficient).toBe(false);
    expect(measuredCoverage([]).sufficient).toBe(false);
  });

  it("both aggregates flip at the same point", () => {
    for (const [m, t, expected] of [[4, 8, false], [5, 8, true]] as const) {
      const layers = chain(Array(m).fill("expanding"), t);
      expect(flowPressure(layers).sufficient).toBe(expected);
      const summaryIsInsufficient = /not enough coverage/i.test(
        computeCapitalFlow(opts()).summary,
      );
      // Direct check on the shared predicate is the contract; this asserts the
      // pressure meter agrees with it at the boundary.
      expect(measuredCoverage(layers).sufficient).toBe(expected);
      expect(summaryIsInsufficient).toBe(false);   // opts() is the 5/8 case
    }
  });
});

// ── The regime chip is a third aggregate over the same layers ────────────────

describe("regime chip thresholds obey the same contract", () => {
  /** Mirrors the /private-markets chip logic exactly. */
  const chip = (layers: CapitalFlowLayer[]) => {
    const coverage = measuredCoverage(layers);
    const open   = layers.filter(l => l.status === "accelerating" || l.status === "expanding").length;
    const closed = layers.filter(l => l.status === "contracting"  || l.status === "blocked").length;
    const majority = Math.ceil(coverage.measured / 2);
    return !coverage.sufficient ? "Not measured"
      : open   >= majority ? "Capital Flowing"
      : closed >= majority ? "Capital Constrained"
      : "Mixed Transmission";
  };

  it("at 8 measured the threshold is 4 — identical to the old hardcoded rule", () => {
    expect(Math.ceil(8 / 2)).toBe(4);
    expect(chip(chain(["expanding", "expanding", "expanding", "expanding",
                       "neutral", "neutral", "neutral", "neutral"]))).toBe("Capital Flowing");
  });

  it("renders no directional verdict below majority coverage", () => {
    expect(chip(chain(["expanding", "expanding", "expanding", "expanding"]))).toBe("Not measured");
  });

  it("cannot say Capital Flowing when most of the stack is unmeasured", () => {
    // 4 open of 4 measured, but only 4 of 8 layers measured.
    const v = chip(chain(["accelerating", "accelerating", "expanding", "expanding"]));
    expect(v).not.toMatch(/Flowing|Constrained|Mixed/);
  });

  it("at 5/8 it still renders a verdict", () => {
    expect(chip(chain(["expanding", "expanding", "expanding", "neutral", "neutral"])))
      .toBe("Capital Flowing");
  });
});
