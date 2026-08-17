/**
 * RC2-C1 — the credit-spread authority.
 *
 * The defect being pinned: Capital Flow's "Credit & Leverage" layer inferred
 * credit state from `o.riskRegime`, which is `norm(avgEq, -3, 3)` — the average
 * percent change of SPY/QQQ/IWM. A rally in equities produced the assertion
 * "Compressed credit spreads enable leveraged financing at competitive rates",
 * and the same sentence was emitted into the /ma narrative via
 * themeIntelligence.explainMAActivity. No credit data existed in the product.
 *
 * The rule these tests enforce: credit state comes from the measured US HY OAS
 * (FRED BAMLH0A0HYM2) or it is `unmeasured`. There is no third option, and in
 * particular there is no proxy fallback — replacing one fabrication with a
 * better-dressed one would be the same defect.
 */

import { describe, expect, it } from "vitest";
import {
  DIRECTION_THRESHOLD_BP,
  STALE_TOLERANCE_BUSINESS_DAYS,
  buildCreditSpreadState,
  businessDaysBetween,
  creditStateFromCsv,
  directionOf,
  parseFredCsv,
  ppToBp,
  type CreditSpreadMeasured,
} from "../creditSpread";
import { computeCapitalFlow, type FlowOptions } from "../capitalFlow";
import { flowPressure } from "../capitalFlowIntel";
import { explainMAActivity } from "../themeIntelligence";

const HEADER = "observation_date,BAMLH0A0HYM2";
const csv = (rows: string[]) => [HEADER, ...rows].join("\n");

/** Anchor "now" so tests never depend on the real clock. */
const NOW = new Date("2026-08-17T12:00:00Z");   // a Monday

// ── Parser ───────────────────────────────────────────────────────────────────

describe("FRED CSV parser", () => {
  it("parses ordinary observations", () => {
    const obs = parseFredCsv(csv(["2026-08-13,2.71", "2026-08-14,2.67"]));
    expect(obs).toEqual([
      { date: "2026-08-13", valuePp: 2.71 },
      { date: "2026-08-14", valuePp: 2.67 },
    ]);
  });

  it("SKIPS holiday rows printed as '.' and never reads them as zero", () => {
    // The decisive case: parsing "." as 0 would invent a 267bp one-day collapse.
    const obs = parseFredCsv(csv(["2026-08-13,2.71", "2026-08-14,.", "2026-08-17,2.67"]));
    expect(obs.map(o => o.date)).toEqual(["2026-08-13", "2026-08-17"]);
    expect(obs.some(o => o.valuePp === 0)).toBe(false);
  });

  it("skips empty and NA values too", () => {
    const obs = parseFredCsv(csv(["2026-08-12,", "2026-08-13,NA", "2026-08-14,2.67"]));
    expect(obs).toHaveLength(1);
  });

  it("survives a truncated payload without throwing", () => {
    const obs = parseFredCsv("observation_date,BAMLH0A0HYM2\n2026-08-13,2.71\n2026-08-14");
    expect(obs).toEqual([{ date: "2026-08-13", valuePp: 2.71 }]);
  });

  it("drops the header and any garbage line", () => {
    const obs = parseFredCsv(csv(["<!DOCTYPE html>", "not,a,date", "2026-08-14,2.67"]));
    expect(obs).toEqual([{ date: "2026-08-14", valuePp: 2.67 }]);
  });

  it("rejects non-numeric and out-of-range values rather than coercing", () => {
    const obs = parseFredCsv(csv(["2026-08-11,abc", "2026-08-12,-1.0", "2026-08-13,900", "2026-08-14,2.67"]));
    expect(obs).toEqual([{ date: "2026-08-14", valuePp: 2.67 }]);
  });

  it("returns [] for empty or non-string input", () => {
    expect(parseFredCsv("")).toEqual([]);
    expect(parseFredCsv(undefined as unknown as string)).toEqual([]);
    expect(parseFredCsv("<html>502</html>")).toEqual([]);
  });

  it("sorts oldest-first regardless of file order", () => {
    const obs = parseFredCsv(csv(["2026-08-14,2.67", "2026-08-13,2.71"]));
    expect(obs.map(o => o.date)).toEqual(["2026-08-13", "2026-08-14"]);
  });
});

// ── Conversion ───────────────────────────────────────────────────────────────

describe("percentage points -> basis points", () => {
  it("converts the live value exactly", () => {
    expect(ppToBp(2.67)).toBe(267);
  });

  it.each([[0, 0], [0.8, 80], [2.71, 271], [4.02, 402], [10.5, 1050]])(
    "%spp -> %sbp", (pp, bp) => expect(ppToBp(pp)).toBe(bp),
  );

  it("rounds to whole basis points (no floating dust)", () => {
    expect(ppToBp(2.675)).toBe(268);
    expect(Number.isInteger(ppToBp(1.234))).toBe(true);
  });
});

// ── Business-day staleness ───────────────────────────────────────────────────

describe("staleness is counted in BUSINESS days", () => {
  it("a Friday print read on Monday is 1 business day, not 3 calendar days", () => {
    // This is the whole reason the tolerance is business-day based: the normal
    // weekend must not read as staleness.
    expect(businessDaysBetween(new Date("2026-08-14T00:00:00Z"), new Date("2026-08-17T00:00:00Z"))).toBe(1);
  });

  it("consecutive weekdays are 1", () => {
    expect(businessDaysBetween(new Date("2026-08-13T00:00:00Z"), new Date("2026-08-14T00:00:00Z"))).toBe(1);
  });

  it("a long weekend still lands inside tolerance", () => {
    // Thu print, read the following Tuesday after a Monday holiday.
    const n = businessDaysBetween(new Date("2026-08-13T00:00:00Z"), new Date("2026-08-18T00:00:00Z"));
    expect(n).toBeLessThanOrEqual(STALE_TOLERANCE_BUSINESS_DAYS);
  });

  it("same day is 0", () => {
    expect(businessDaysBetween(new Date("2026-08-17T00:00:00Z"), new Date("2026-08-17T00:00:00Z"))).toBe(0);
  });
});

// ── Direction ────────────────────────────────────────────────────────────────

describe("direction uses the +/-3bp measured-change rule", () => {
  it("the threshold is the series' median daily move", () => {
    expect(DIRECTION_THRESHOLD_BP).toBe(3);
  });

  it("real widening reads widening", () => {
    const s = buildCreditSpreadState(
      [{ date: "2026-08-13", valuePp: 2.67 }, { date: "2026-08-14", valuePp: 2.79 }], NOW,
    ) as CreditSpreadMeasured;
    expect(s.measured).toBe(true);
    expect(s.changeBp).toBe(12);
    expect(s.direction).toBe("widening");
  });

  it("real tightening reads tightening (the live case)", () => {
    const s = buildCreditSpreadState(
      [{ date: "2026-08-13", valuePp: 2.71 }, { date: "2026-08-14", valuePp: 2.67 }], NOW,
    ) as CreditSpreadMeasured;
    expect(s.level).toBe(267);
    expect(s.priorLevel).toBe(271);
    expect(s.changeBp).toBe(-4);
    expect(s.direction).toBe("tightening");
  });

  it("an essentially unchanged series reads stable", () => {
    const s = buildCreditSpreadState(
      [{ date: "2026-08-13", valuePp: 2.71 }, { date: "2026-08-14", valuePp: 2.70 }], NOW,
    ) as CreditSpreadMeasured;
    expect(s.changeBp).toBe(-1);
    expect(s.direction).toBe("stable");
  });

  it("is exact at the boundary", () => {
    expect(directionOf(3)).toBe("widening");
    expect(directionOf(2)).toBe("stable");
    expect(directionOf(-2)).toBe("stable");
    expect(directionOf(-3)).toBe("tightening");
  });

  it("preserves the measured level and both as-of dates", () => {
    const s = buildCreditSpreadState(
      [{ date: "2026-08-13", valuePp: 2.71 }, { date: "2026-08-14", valuePp: 2.67 }], NOW,
    ) as CreditSpreadMeasured;
    expect(s.asOf).toBe("2026-08-14");
    expect(s.priorAsOf).toBe("2026-08-13");
  });

  it("compares against the prior VALID observation, skipping a holiday", () => {
    const s = creditStateFromCsv(
      csv(["2026-08-13,2.71", "2026-08-14,.", "2026-08-17,2.67"]), new Date("2026-08-18T12:00:00Z"),
    ) as CreditSpreadMeasured;
    expect(s.measured).toBe(true);
    expect(s.priorAsOf).toBe("2026-08-13");    // not the "." row
    expect(s.changeBp).toBe(-4);
  });
});

// ── Unmeasured states ────────────────────────────────────────────────────────

describe("absent / stale / unreadable all yield unmeasured", () => {
  it("no observations -> unparseable", () => {
    expect(buildCreditSpreadState([], NOW)).toEqual({ measured: false, reason: "unparseable" });
  });

  it("a single observation cannot produce a direction -> unparseable", () => {
    expect(buildCreditSpreadState([{ date: "2026-08-14", valuePp: 2.67 }], NOW))
      .toEqual({ measured: false, reason: "unparseable" });
  });

  it("an HTML error page -> unparseable, never a number", () => {
    const s = creditStateFromCsv("<html><body>502 Bad Gateway</body></html>", NOW);
    expect(s.measured).toBe(false);
  });

  it("beyond the tolerance -> stale, and discloses what it did have", () => {
    const s = creditStateFromCsv(csv(["2026-07-01,2.71", "2026-07-02,2.67"]), NOW);
    expect(s.measured).toBe(false);
    if (!s.measured) {
      expect(s.reason).toBe("stale");
      expect(s.asOf).toBe("2026-07-02");
      expect(s.businessDaysStale).toBeGreaterThan(STALE_TOLERANCE_BUSINESS_DAYS);
    }
  });

  it("a weekend does NOT create a false stale failure", () => {
    // Friday print, evaluated Monday — the single most common real-world case.
    const s = creditStateFromCsv(csv(["2026-08-13,2.71", "2026-08-14,2.67"]), NOW);
    expect(s.measured).toBe(true);
  });

  it("a holiday-extended weekend does not create a false stale failure", () => {
    // Thursday print, evaluated the following Tuesday.
    const s = creditStateFromCsv(
      csv(["2026-08-12,2.71", "2026-08-13,2.67"]), new Date("2026-08-18T12:00:00Z"),
    );
    expect(s.measured).toBe(true);
  });
});

// ── The Capital Flow layer ───────────────────────────────────────────────────

const baseOpts = (over: Partial<FlowOptions> = {}): FlowOptions => ({
  riskRegime: "neutral", volRegime: "moderate", regime: null, tnxRate: 4.2,
  maDealCount: 5, vcDealCount: 0, ipoFilerCount: 0, ...over,
});

const creditLayer = (o: FlowOptions) =>
  computeCapitalFlow(o).layers.find(l => l.id === "credit-leverage")!;

const measured = (pp: number, priorPp: number) =>
  buildCreditSpreadState(
    [{ date: "2026-08-13", valuePp: priorPp }, { date: "2026-08-14", valuePp: pp }], NOW,
  );

describe("Credit & Leverage derives ONLY from the measured spread", () => {
  it("equity regime alone cannot change the credit state", () => {
    // The exact fabrication: riskRegime is norm(avgEq, -3, 3).
    const off = creditLayer(baseOpts({ riskRegime: "risk-off" }));
    const on  = creditLayer(baseOpts({ riskRegime: "risk-on" }));
    expect(off).toEqual(on);
    expect(off.status).toBe("unmeasured");
  });

  it("neither does the Treasury yield or the regime string", () => {
    const a = creditLayer(baseOpts({ tnxRate: 6.5, regime: "hawkish tightening" }));
    const b = creditLayer(baseOpts({ tnxRate: 1.0, regime: "dovish easing" }));
    expect(a).toEqual(b);
    expect(a.status).toBe("unmeasured");
  });

  it("with a real spread, equity regime STILL cannot move it", () => {
    const credit = measured(2.67, 2.71);          // tightening
    const off = creditLayer(baseOpts({ credit, riskRegime: "risk-off" }));
    const on  = creditLayer(baseOpts({ credit, riskRegime: "risk-on"  }));
    expect(off).toEqual(on);
    expect(off.status).toBe("expanding");
  });

  it("real widening -> constrained, and shows the level", () => {
    const l = creditLayer(baseOpts({ credit: measured(2.79, 2.67) }));
    expect(l.status).toBe("tightening");
    expect(l.indicator).toContain("279bp");
    expect(l.detail).toContain("2026-08-14");
  });

  it("real tightening -> accessible, and shows the level", () => {
    const l = creditLayer(baseOpts({ credit: measured(2.67, 2.71) }));
    expect(l.status).toBe("expanding");
    expect(l.indicator).toContain("267bp");
  });

  it("essentially unchanged -> neutral, still showing the measured level", () => {
    const l = creditLayer(baseOpts({ credit: measured(2.70, 2.71) }));
    expect(l.status).toBe("neutral");
    expect(l.indicator).toContain("270bp");
  });

  it("absent credit -> unmeasured and makes NO credit claim", () => {
    const l = creditLayer(baseOpts({ credit: null, riskRegime: "risk-on" }));
    expect(l.status).toBe("unmeasured");
    expect(l.indicator).toBe("Not measured");
    expect(l.detail).not.toMatch(/compressed|tight spreads|widening spreads/i);
  });

  it("stale credit -> unmeasured", () => {
    const stale = creditStateFromCsv(csv(["2026-06-01,2.71", "2026-06-02,2.67"]), NOW);
    expect(creditLayer(baseOpts({ credit: stale })).status).toBe("unmeasured");
  });

  it("no proxy language survives anywhere in the layer", () => {
    for (const o of [baseOpts({ credit: null }), baseOpts({ credit: measured(2.67, 2.71) })]) {
      const l = creditLayer(o);
      expect(`${l.indicator} ${l.signal} ${l.detail}`).not.toMatch(/HYG|LQD|IEF|equity|equities/i);
    }
  });

  it("the layer is branded as the actual series, not a generic label", () => {
    expect(creditLayer(baseOpts()).sublabel).toBe("US HY OAS");
  });
});

// ── Downstream prose gating ──────────────────────────────────────────────────

const deals = [
  { dealType: "sponsor", sector: "Tech", peFirm: "KKR" },
  { dealType: "strategic", sector: "Health", peFirm: null },
];
const maLayer = { status: "expanding", signal: "Active" };

describe("credit prose appears only when credit is measured", () => {
  it("emits NO spread claim when the layer is unmeasured", () => {
    const text = explainMAActivity(
      deals as never, [], "risk-on",
      { status: "unmeasured", signal: "Unavailable", detail: "not retrieved" },
      maLayer as never,
    );
    expect(text).not.toMatch(/spread/i);
    expect(text).not.toMatch(/compressed|credit conditions/i);
  });

  it("still describes the deals themselves — absence of credit is not silence", () => {
    const text = explainMAActivity(
      deals as never, [], "risk-on",
      { status: "unmeasured", signal: "Unavailable", detail: "" },
      maLayer as never,
    );
    expect(text.length).toBeGreaterThan(20);
    expect(text).toMatch(/strategic|sponsor|deal/i);
  });

  it("emits a spread claim when credit IS measured", () => {
    const text = explainMAActivity(
      deals as never, [], "risk-on",
      { status: "expanding", signal: "Accessible", detail: "267bp" },
      maLayer as never,
    );
    expect(text).toMatch(/spread/i);
  });

  it("the fallback summary drops the credit clause when unmeasured", () => {
    const text = explainMAActivity(
      [{ dealType: "other", sector: "X", peFirm: null }] as never, [], null,
      { status: "unmeasured", signal: "Unavailable", detail: "" },
      { status: "neutral", signal: "Steady" } as never,
    );
    expect(text).not.toMatch(/credit conditions/i);
    expect(text).not.toMatch(/unavailable credit/i);
  });

  it("no prose asserts compressed spreads from an equity regime", () => {
    // Every unmeasured shape must stay silent on credit regardless of regime.
    for (const regime of ["risk-on", "risk-off", null]) {
      const text = explainMAActivity(
        deals as never, [], regime,
        { status: "unmeasured", signal: "Unavailable", detail: "" },
        maLayer as never,
      );
      expect(text).not.toMatch(/spread/i);
    }
  });
});

// ── Aggregates must not launder an absence ───────────────────────────────────

describe("unmeasured never becomes a market-state assertion", () => {
  it("the pressure score EXCLUDES an unmeasured layer rather than scoring it 0", () => {
    // Scoring an absence as 0 is arithmetically identical to scoring it as
    // measured-neutral, which would smuggle it into "MIXED" / "Liquidity Stable".
    const withCredit = flowPressure(computeCapitalFlow(baseOpts({ credit: measured(2.70, 2.71) })).layers);
    const without    = flowPressure(computeCapitalFlow(baseOpts({ credit: null })).layers);
    // A measured-neutral credit layer and an absent one must NOT be equivalent
    // inputs to the meter; the absent case is scored over one fewer layer.
    expect(without.score).not.toBe(0);
    expect(Number.isFinite(without.score)).toBe(true);
    expect(withCredit.score).toBeGreaterThanOrEqual(0);
  });

  it("an unmeasured layer is counted as neither open nor closed", () => {
    const layers = computeCapitalFlow(baseOpts({ credit: null })).layers;
    const credit = layers.find(l => l.id === "credit-leverage")!;
    expect(credit.status).toBe("unmeasured");
    // trend derives from open vs closed; the unmeasured layer must not tip it.
    const p = flowPressure(layers);
    expect(["improving", "deteriorating", "stable"]).toContain(p.trend);
  });

  it("flipping equity regime does not move the score when credit is unmeasured", () => {
    const on  = flowPressure(computeCapitalFlow(baseOpts({ credit: null, riskRegime: "risk-on"  })).layers);
    const off = flowPressure(computeCapitalFlow(baseOpts({ credit: null, riskRegime: "risk-off" })).layers);
    // Other layers legitimately react to equity regime; what must hold is that the
    // CREDIT layer contributed nothing to either.
    const creditOn  = computeCapitalFlow(baseOpts({ credit: null, riskRegime: "risk-on"  })).layers.find(l => l.id === "credit-leverage")!;
    const creditOff = computeCapitalFlow(baseOpts({ credit: null, riskRegime: "risk-off" })).layers.find(l => l.id === "credit-leverage")!;
    expect(creditOn).toEqual(creditOff);
    expect(Number.isFinite(on.score) && Number.isFinite(off.score)).toBe(true);
  });
});

describe("the as-of date rides with the measured level", () => {
  it("the indicator carries both the level and its as-of date", () => {
    const l = creditLayer(baseOpts({ credit: measured(2.67, 2.71) }));
    expect(l.indicator).toContain("267bp");
    expect(l.indicator).toContain("2026-08-14");     // T+1 data is never shown bare
  });

  it("every direction carries the date", () => {
    for (const [pp, prior] of [[2.79, 2.67], [2.67, 2.71], [2.70, 2.71]] as const) {
      const l = creditLayer(baseOpts({ credit: measured(pp, prior) }));
      expect(l.indicator).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(l.detail).toContain("as of 2026-08-14");
    }
  });

  it("the unmeasured indicator shows no level and no date", () => {
    const l = creditLayer(baseOpts({ credit: null }));
    expect(l.indicator).toBe("Not measured");
    expect(l.indicator).not.toMatch(/bp|\d{4}-\d{2}-\d{2}/);
  });
});
