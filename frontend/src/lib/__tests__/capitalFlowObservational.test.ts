/**
 * RC2-C2b — observational layers: measured, but with no directional authority.
 *
 * Two layers counted something real and then asserted something they could not
 * observe:
 *
 *   M&A Activity     "8 Recent Deals · Deal flow elevated, strategic and sponsor
 *                    acquirers transacting at pace with narrow bid-ask spread"
 *                    <- items.filter(i => i.category === "M&A").length, a count of
 *                    ARTICLES admitted by a keyword regex over title OR snippet,
 *                    with no time window (fresh_only=false). Measured 2026-08-18:
 *                    of 8 items, at most 1-2 were announced transactions; the rest
 *                    were an interview, a feature, commentary, a 13F stake
 *                    purchase, litigation news and an ambiguous 8-K.
 *
 *   IPO Window       "13 Recent S-1s · IPO window open and busy ... institutional
 *                    book coverage" <- raw EDGAR entries INCLUDING S-1/A
 *                    amendments (measured 2026-08-18: 10 of 13 were amendments,
 *                    3 were new registrations), and two leading branches that let
 *                    riskRegime/volRegime declare the window shut with no IPO
 *                    evidence at all.
 *
 * The rule: both stay MEASURED (they observe something real, and count toward
 * coverage) but contribute ZERO directional authority. The critical property is
 * that a cosmetic relabel is not enough — the aggregates must be provably
 * invariant to these counts.
 */

import { describe, expect, it } from "vitest";
import {
  computeCapitalFlow, directionalLayers, measuredCoverage,
  type CapitalFlowLayer, type FlowOptions,
} from "../capitalFlow";
import { flowPressure } from "../capitalFlowIntel";
import { buildCreditSpreadState } from "../creditSpread";
import { explainMAActivity } from "../themeIntelligence";

const NOW = new Date("2026-08-18T12:00:00Z");
const credit = buildCreditSpreadState(
  [{ date: "2026-08-17", valuePp: 2.67 }, { date: "2026-08-18", valuePp: 2.70 }], NOW);

/** The measured 2026-08-18 EDGAR shape. */
const IPO = { newRegistrations: 3, rawEntries: 13, windowStart: "2026-08-14", windowEnd: "2026-08-18" };

const opts = (over: Partial<FlowOptions> = {}): FlowOptions => ({
  riskRegime: "risk-on", volRegime: "moderate", regime: "neutral", tnxRate: 4.2,
  maDealCount: 8, ipoFilings: IPO, credit, ...over,
});

const layer = (id: string, o: FlowOptions = opts()) =>
  computeCapitalFlow(o).layers.find(l => l.id === id)!;

const textOf = (l: CapitalFlowLayer) => `${l.label} ${l.sublabel} ${l.indicator} ${l.signal} ${l.detail}`;

// ── M&A Activity ─────────────────────────────────────────────────────────────

describe("M&A Activity is observational, never directional", () => {
  it.each([0, 1, 2, 4, 8, 9, 40, 500])("stays observational at count %s", (n) => {
    const l = layer("ma-activity", opts({ maDealCount: n }));
    expect(l.status).toBe("observational");
  });

  it("the >=8 / >=4 / >=2 market-state thresholds are gone", () => {
    // 8 used to be "accelerating / deal flow elevated"; 4 "expanding"; 2 "neutral".
    const statuses = [0, 2, 4, 8, 40].map(n => layer("ma-activity", opts({ maDealCount: n })).status);
    expect(new Set(statuses)).toEqual(new Set(["observational"]));
  });

  it("states the count as tracked items, not deals", () => {
    expect(layer("ma-activity", opts({ maDealCount: 8 })).indicator)
      .toBe("8 M&A-related items tracked");
    expect(layer("ma-activity", opts({ maDealCount: 1 })).indicator)
      .toBe("1 M&A-related item tracked");
  });

  it("discloses that this is feed coverage and can include rumours/commentary", () => {
    const d = layer("ma-activity", opts({ maDealCount: 8 })).detail;
    expect(d).toMatch(/feed coverage/i);
    expect(d).toMatch(/rumour|commentary/i);
    expect(d).toMatch(/not market transaction volume/i);
  });

  it("does not claim a fixed window, because there is none", () => {
    const d = layer("ma-activity", opts()).detail;
    expect(d).toMatch(/no fixed observation period/i);
  });

  it("emits no banned market claim at any count", () => {
    const BANNED = [
      /deal flow (is |are )?elevated/i, /transacting at pace/i, /bid-ask/i,
      /dry powder/i, /appetite/i, /announcement flow/i, /balance sheets/i,
      /Recent Deals/i, /acquirers are/i, /consolidat/i,
    ];
    for (const n of [0, 1, 4, 8, 12, 40]) {
      const t = textOf(layer("ma-activity", opts({ maDealCount: n })));
      for (const re of BANNED) expect(t, `count=${n} emitted ${re}`).not.toMatch(re);
    }
  });
});

// ── IPO Filing Activity ──────────────────────────────────────────────────────

describe("IPO Filing Activity is observational and equity-independent", () => {
  it("is renamed from IPO Window", () => {
    const l = layer("ipo-window");
    expect(l.label).toBe("IPO Filing Activity");
    expect(textOf(l)).not.toMatch(/IPO Window/);
  });

  it.each([
    ["risk-off",        { riskRegime: "risk-off" as const }],
    ["risk-on",         { riskRegime: "risk-on"  as const }],
    ["high vol",        { volRegime: "high"      as const }],
    ["elevated vol",    { volRegime: "elevated"  as const }],
    ["low vol",         { volRegime: "low"       as const }],
    ["hawkish regime",  { regime: "hawkish tightening" }],
    ["dovish regime",   { regime: "dovish easing" }],
  ])("output is identical under %s — the equity overrides are gone", (_n, over) => {
    expect(layer("ipo-window", opts(over))).toEqual(layer("ipo-window", opts()));
  });

  it("can never say the window is closed, shut, frozen or busy", () => {
    // The assertive fields must contain no market-state vocabulary at all.
    const BANNED = [
      /closed|shut|open|frozen|busy/i, /book coverage/i, /withdraw/i,
      /pricing/i, /pausing/i, /must-own/i, /transacting/i,
    ];
    for (const over of [
      { riskRegime: "risk-off" as const, volRegime: "high" as const },
      { riskRegime: "risk-on"  as const, volRegime: "low"  as const },
      { ipoFilings: { ...IPO, newRegistrations: 0 } },
      { ipoFilings: { ...IPO, newRegistrations: 40 } },
    ]) {
      const l = layer("ipo-window", opts(over));
      const assertive = `${l.label} ${l.sublabel} ${l.indicator} ${l.signal}`;
      for (const re of BANNED) expect(assertive, `emitted ${re}`).not.toMatch(re);
    }
  });

  it("the detail may DISCLAIM pricing/withdrawals but never assert them", () => {
    // "says nothing about IPO pricing, withdrawals or completion" is disclosure,
    // not a claim — so the assertion targets claim-shaped phrasing only.
    const CLAIMS = [
      /window is (open|closed|shut)/i, /issuers? (are |is )?(withdrawing|pricing)/i,
      /institutional book coverage/i, /transacting with/i, /high-quality filers/i,
    ];
    for (const over of [
      { riskRegime: "risk-off" as const, volRegime: "high" as const },
      { ipoFilings: { ...IPO, newRegistrations: 40 } },
    ]) {
      const d = layer("ipo-window", opts(over)).detail;
      for (const re of CLAIMS) expect(d, `emitted ${re}`).not.toMatch(re);
      expect(d).toMatch(/says nothing about IPO pricing/i);
    }
  });

  it("counts NEW registrations, not the raw amendment-inclusive total", () => {
    // The live shape: 13 raw entries, 10 of them S-1/A.
    const l = layer("ipo-window");
    expect(l.indicator).toBe("3 new S-1s");
    expect(l.indicator).not.toContain("13");
  });

  it("still discloses the raw entry count for diagnostics", () => {
    expect(layer("ipo-window").detail).toContain("13 total EDGAR entries");
    expect(layer("ipo-window").detail).toMatch(/amendments excluded/i);
  });

  it("states the period the data actually covers", () => {
    expect(layer("ipo-window").detail).toContain("2026-08-14 to 2026-08-18");
  });

  it("collapses the period when the data covers a single day", () => {
    const l = layer("ipo-window", opts({
      ipoFilings: { ...IPO, windowStart: "2026-08-18", windowEnd: "2026-08-18" },
    }));
    expect(l.detail).toContain("2026-08-18");
    expect(l.detail).not.toContain("2026-08-18 to 2026-08-18");
  });

  it("absent data is unmeasured, never a claim (the old /ma hardcoded-zero case)", () => {
    const l = layer("ipo-window", opts({ ipoFilings: null }));
    expect(l.status).toBe("unmeasured");
    expect(textOf(l)).not.toMatch(/frozen|closed|no recent/i);
  });

  it("zero new registrations is observational, not 'frozen'", () => {
    const l = layer("ipo-window", opts({ ipoFilings: { ...IPO, newRegistrations: 0 } }));
    expect(l.status).toBe("observational");
    expect(l.detail).toMatch(/no new S-1 registrations/i);
  });
});

// ── Aggregate neutrality — the hard invariant ────────────────────────────────

const aggregateOf = (o: FlowOptions) => {
  const st = computeCapitalFlow(o);
  const p = flowPressure(st.layers);
  const dir = directionalLayers(st.layers);
  const cov = measuredCoverage(st.layers);
  const open = dir.filter(l => l.status === "accelerating" || l.status === "expanding").length;
  const closed = dir.filter(l => l.status === "contracting" || l.status === "blocked").length;
  const maj = Math.ceil(dir.length / 2);
  const chip = !cov.sufficient ? "Not measured"
    : open >= maj ? "Capital Flowing" : closed >= maj ? "Capital Constrained" : "Mixed Transmission";
  return { summary: st.summary, score: p.score, label: p.label, liquidity: p.liquidity,
           trend: p.trend, chip, measured: cov.measured, directional: dir.length };
};

describe("directional aggregates are invariant to both observational counts", () => {
  it("M&A count 0 <-> 40 leaves every aggregate byte-identical", () => {
    expect(aggregateOf(opts({ maDealCount: 0 })))
      .toEqual(aggregateOf(opts({ maDealCount: 40 })));
  });

  it("IPO new-registration count 0 <-> 40 leaves every aggregate byte-identical", () => {
    expect(aggregateOf(opts({ ipoFilings: { ...IPO, newRegistrations: 0 } })))
      .toEqual(aggregateOf(opts({ ipoFilings: { ...IPO, newRegistrations: 40 } })));
  });

  it("both counts swept together change nothing", () => {
    const a = aggregateOf(opts({ maDealCount: 0,  ipoFilings: { ...IPO, newRegistrations: 0 } }));
    for (const n of [1, 2, 4, 8, 13, 40, 500]) {
      expect(aggregateOf(opts({ maDealCount: n, ipoFilings: { ...IPO, newRegistrations: n } })))
        .toEqual(a);
    }
  });

  it("the pre-C2b regression: 8 deals + 13 filings no longer forces FLOWING", () => {
    // Before C2b this exact input produced 77 FLOWING / "Capital Flowing" with
    // both contributions coming from a coverage count and amendment traffic.
    const withCounts = aggregateOf(opts({ maDealCount: 8, ipoFilings: IPO }));
    const withoutCounts = aggregateOf(opts({ maDealCount: 0, ipoFilings: { ...IPO, newRegistrations: 0 } }));
    expect(withCounts).toEqual(withoutCounts);
  });
});

// ── Observational is NOT unmeasured ──────────────────────────────────────────

describe("observational and unmeasured are semantically different", () => {
  it("an observational layer counts toward coverage; an unmeasured one does not", () => {
    const observed  = computeCapitalFlow(opts()).layers;                       // MA + IPO observational
    const ipoAbsent = computeCapitalFlow(opts({ ipoFilings: null })).layers;   // IPO unmeasured
    expect(measuredCoverage(observed).measured).toBe(5);
    expect(measuredCoverage(ipoAbsent).measured).toBe(4);
  });

  it("but an observational layer carries ZERO directional authority", () => {
    const layers = computeCapitalFlow(opts()).layers;
    const dir = directionalLayers(layers);
    expect(dir.map(l => l.id)).not.toContain("ma-activity");
    expect(dir.map(l => l.id)).not.toContain("ipo-window");
    expect(dir.length).toBe(3);   // monetary, equities, credit
  });

  it("observational layers do not sit in the directional DENOMINATOR either", () => {
    // The subtle failure mode: contributing 0 to the numerator while inflating the
    // denominator drags every verdict toward the middle. Dropping the two
    // observational layers entirely must not change the score.
    const layers = computeCapitalFlow(opts()).layers;
    const withoutObservational = layers.filter(
      l => l.id !== "ma-activity" && l.id !== "ipo-window",
    );
    // Only the SCORE is compared. Removing layers also changes coverage (5/8 ->
    // 3/6, which is no longer a majority), and coverage is a separate property
    // from direction — that is precisely the distinction this slice draws.
    expect(flowPressure(layers).score).toBe(flowPressure(withoutObservational).score);
  });

  it("coverage stays sufficient at 5/8 with both observational layers present", () => {
    const cov = measuredCoverage(computeCapitalFlow(opts()).layers);
    expect(cov).toEqual({ measured: 5, total: 8, sufficient: true });
  });

  it("a chain with only observational layers is measured but cannot be characterised", () => {
    const only: CapitalFlowLayer[] = [0, 1, 2, 3, 4].map(i => ({
      id: `o${i}`, label: `O${i}`, sublabel: "", status: "observational",
      indicator: "x", signal: "Observed", detail: "",
    }));
    expect(measuredCoverage(only).sufficient).toBe(true);
    expect(directionalLayers(only)).toHaveLength(0);
  });
});

// ── Downstream reasoning ─────────────────────────────────────────────────────

const deals = (n: number, type = "strategic") =>
  Array.from({ length: n }, (_, i) => ({ dealType: type, sector: "Tech", peFirm: null, id: i }));

describe("M&A reasoning cannot convert coverage into market claims", () => {
  const creditM = { status: "expanding", signal: "Accessible", detail: "267bp" };

  it("emits none of the banned inferences", () => {
    const BANNED = [
      /deal appetite/i, /dry powder/i, /motivated sellers/i, /balance sheets/i,
      /leverage dependency/i, /announcement flow/i, /bid-ask/i,
      /consolidate before/i, /deals active/i, /buyer conviction/i,
    ];
    for (const n of [1, 3, 8, 20]) {
      for (const t of ["strategic", "sponsor", "rumored", "merger"]) {
        const text = explainMAActivity(deals(n, t) as never, [], "risk-on", creditM as never);
        for (const re of BANNED) expect(text, `${n} ${t} emitted ${re}`).not.toMatch(re);
      }
    }
  });

  it("still states the composition of what is tracked — a fact", () => {
    const text = explainMAActivity(
      [...deals(3, "strategic"), ...deals(2, "sponsor")] as never, [], null,
      creditM as never,
    );
    expect(text).toMatch(/3 strategic/);
    expect(text).toMatch(/2 sponsor-related/);
    expect(text).toMatch(/M&A-related item/);
  });

  it("empty coverage says so plainly, with no market inference", () => {
    const text = explainMAActivity([] as never, [], "risk-off", creditM as never);
    expect(text).toBe("No M&A-related items in Argus's current feed coverage.");
    expect(text).not.toMatch(/financing friction|macro uncertainty|conviction/i);
  });

  it("C1 credit gating still holds — no spread claim without measured credit", () => {
    const text = explainMAActivity(
      deals(4) as never, [], "risk-on",
      { status: "unmeasured", signal: "Unavailable", detail: "" } as never,
    );
    expect(text).not.toMatch(/spread/i);
  });

  it("a measured spread still produces its C1 sentence", () => {
    const text = explainMAActivity(deals(4) as never, [], "risk-on", creditM as never);
    expect(text).toMatch(/spreads/i);
  });

  it("theme causal narrative — a separate authority — survives", () => {
    const theme = { causal_narrative: "Power demand is repricing grid infrastructure assets.", persistence_score: 9 };
    const text = explainMAActivity(deals(3) as never, [theme] as never, "risk-on", creditM as never);
    expect(text).toContain("Power demand is repricing grid infrastructure assets.");
  });
});
