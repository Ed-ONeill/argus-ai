/**
 * RC2-F1 — static configuration must never read as measured intelligence.
 *
 * Measured on the live pipeline, Healthcare, Crypto & Digital Assets and
 * Media & Telecom score 0 with 0 stories — no source in the registry covers them.
 * Their cards nonetheless rendered:
 *
 *   narrative slot   industry.macroDrivers[0]   -> "FDA Calendar" / "BTC ETF
 *                                                  Flows" / "Ad Spend"
 *   driver chips     industry.keyAssets[0..4]   -> JNJ · LLY · MRK · ABBV · UNH
 *   footer           "-> Regime Neutral"         <- from `alignment ?? "neutral"`
 *   sentiment badge  "Neutral"                   <- from `sentiment ?? "neutral"`
 *
 * The first two are configuration in the slots a reader takes as measurement. The
 * last two are worse: a synthesised CURRENT READING for an industry Argus has
 * measured nothing about, sitting beside a score of "-" and a caption of
 * "No data" — the card contradicted itself.
 *
 * These tests pin the invariant: derived intelligence and static reference are
 * never indistinguishable. No source, scoring rule or inference is added here.
 */

import { describe, expect, it } from "vitest";
import {
  NOT_MEASURED_BADGE, NOT_MEASURED_FOOTER, NO_SIGNAL_TEXT, REFERENCE_LABEL,
  buildIndustryCardView, type IndustryCardInput,
} from "../industryCardView";
import { INDUSTRIES } from "../industryConfig";

/** The three industries measured at zero coverage on the live pipeline. */
const ZERO_COVERAGE = ["Healthcare", "Crypto & Digital Assets", "Media & Telecom"];

const cfg = (name: string) => {
  const c = INDUSTRIES.find(i => i.name === name);
  if (!c) throw new Error(`industry config not found: ${name}`);
  return c;
};

const input = (name: string, over: Partial<IndustryCardInput> = {}): IndustryCardInput => ({
  industry: cfg(name), sectorData: null, industrySignal: null,
  topTheme: null, themeSignal: null, ...over,
});

const sector = (score: number, count: number, over: Record<string, unknown> = {}) =>
  ({ signal_score: score, signal_count: count, regime_alignment: "tailwind",
     impact_sentiment: "bullish", ...over }) as never;

// ── The zero-coverage path ──────────────────────────────────────────────────

describe.each(ZERO_COVERAGE)("%s — zero derived coverage", (name) => {
  const v = () => buildIndustryCardView(input(name));

  it("never presents a static config value as current intelligence", () => {
    const staticDriver = cfg(name).macroDrivers[0];
    expect(v().intelligenceText).toBe(NO_SIGNAL_TEXT);
    expect(v().intelligenceText).not.toBe(staticDriver);
    expect(v().intelligenceText).not.toContain(staticDriver);
  });

  it("renders no derived drivers at all", () => {
    expect(v().drivers).toEqual([]);
  });

  it("the static ticker set is preserved but labelled as reference", () => {
    const ref = v().reference!;
    expect(ref).not.toBeNull();
    expect(ref.label).toBe(REFERENCE_LABEL);
    expect(ref.tickers).toEqual(cfg(name).keyAssets.slice(0, 5));
    expect(ref.driver).toBe(cfg(name).macroDrivers[0]);
  });

  it("score is unavailable, not zero", () => {
    expect(v().score).toBeNull();
  });

  it("synthesises no sentiment", () => {
    expect(v().sentiment).toBeNull();
  });

  it("the state badge SAYS 'Not measured' rather than disappearing", () => {
    // A missing badge reads as an oversight; the explicit label is the finding.
    expect(v().stateBadge).toEqual({ label: NOT_MEASURED_BADGE, measured: false });
  });

  it("the badge never claims a neutral reading", () => {
    expect(v().stateBadge.label).not.toMatch(/bullish|bearish|mixed|neutral/i);
  });

  it("synthesises no regime reading", () => {
    expect(v().footer).toBe(NOT_MEASURED_FOOTER);
    expect(v().footer).not.toMatch(/regime/i);
    expect(v().footer).not.toMatch(/tailwind|headwind|neutral/i);
  });

  it("the story caption stays honest", () => {
    expect(v().storyLabel).toBe("No data");
  });

  it("carries no theme provenance it does not have", () => {
    expect(v().themeName).toBeNull();
  });

  it("source is explicitly none", () => {
    expect(v().source).toBe("none");
    expect(v().hasIntelligence).toBe(false);
  });
});

describe("the reference block is unmistakably not measurement", () => {
  it("every zero-coverage industry carries the reference label", () => {
    for (const name of ZERO_COVERAGE) {
      expect(buildIndustryCardView(input(name)).reference?.label).toBe(REFERENCE_LABEL);
    }
  });

  it("reference content never leaks into the intelligence slot", () => {
    for (const name of ZERO_COVERAGE) {
      const v = buildIndustryCardView(input(name));
      for (const t of v.reference!.tickers) {
        expect(v.intelligenceText).not.toContain(t);
      }
    }
  });

  it("no reference block is emitted when intelligence exists", () => {
    const v = buildIndustryCardView(input("Healthcare", { sectorData: sector(64, 12) }));
    expect(v.reference).toBeNull();
  });
});

// ── The positive control: derived intelligence still wins ───────────────────

describe("Aerospace & Defense — a recovered industry renders normally", () => {
  const recovered = () => buildIndustryCardView(input("Aerospace & Defense", {
    sectorData: sector(14, 3),
    industrySignal: { narrative: "Defense budgets are repricing primes.",
                      primary_drivers: ["LMT", "RTX", "NOC"],
                      regime_alignment: "tailwind",
                      momentum_direction: "bullish" } as never,
  }));

  it("uses the derived narrative, not the static driver", () => {
    expect(recovered().intelligenceText).toBe("Defense budgets are repricing primes.");
    expect(recovered().intelligenceText).not.toBe(cfg("Aerospace & Defense").macroDrivers[0]);
  });

  it("uses the derived drivers, not the static ticker set", () => {
    expect(recovered().drivers).toEqual(["LMT", "RTX", "NOC"]);
    expect(recovered().drivers).not.toEqual(cfg("Aerospace & Defense").keyAssets.slice(0, 5));
  });

  it("keeps its score, sentiment and regime footer", () => {
    expect(recovered().score).toBe(14);
    expect(recovered().sentiment).toBe("bullish");
    expect(recovered().stateBadge).toEqual({ label: "Bullish", measured: true });
    expect(recovered().footer).toBe("↑ Regime Tailwind");
    expect(recovered().storyLabel).toBe("3 stories");
  });

  it("adds no reference block or fallback noise", () => {
    expect(recovered().reference).toBeNull();
    expect(recovered().source).toBe("sector");
    expect(recovered().hasIntelligence).toBe(true);
  });

  it("shows NONE of the unmeasured fallback treatment", () => {
    const r = recovered();
    expect(r.stateBadge.measured).toBe(true);
    expect(r.stateBadge.label).not.toBe(NOT_MEASURED_BADGE);
    expect(r.footer).not.toBe(NOT_MEASURED_FOOTER);
    expect(r.intelligenceText).not.toBe(NO_SIGNAL_TEXT);
    expect(r.storyLabel).not.toBe("No data");
    expect(r.score).not.toBeNull();
  });
});

// ── Derived content wins from either authority ──────────────────────────────

describe("real derived content always wins when available", () => {
  it("sector intelligence takes precedence", () => {
    const v = buildIndustryCardView(input("Healthcare", {
      sectorData: sector(70, 9),
      industrySignal: { narrative: "Real narrative.", primary_drivers: ["LLY"],
                        regime_alignment: "headwind", momentum_direction: "bearish" } as never,
    }));
    expect(v.source).toBe("sector");
    expect(v.intelligenceText).toBe("Real narrative.");
    expect(v.footer).toBe("↓ Regime Headwind");
    expect(v.reference).toBeNull();
  });

  it("a theme fallback is derived intelligence, not static config", () => {
    const v = buildIndustryCardView(input("Crypto & Digital Assets", {
      themeSignal: { score: 42, sentiment: "bullish", storyCount: 4,
                     narrative: "Theme-derived read.", chips: ["COIN", "MSTR"],
                     themeName: "Digital Asset Rails", momentumLabel: "accelerating" },
    }));
    expect(v.source).toBe("theme");
    expect(v.hasIntelligence).toBe(true);
    expect(v.intelligenceText).toBe("Theme-derived read.");
    expect(v.drivers).toEqual(["COIN", "MSTR"]);
    expect(v.score).toBe(42);
    expect(v.storyLabel).toBe("4 via theme");
    expect(v.footer).toBe("✦ accelerating");
    expect(v.themeName).toBe("Digital Asset Rails");
    expect(v.reference).toBeNull();
  });

  it("topTheme is used when no narrative exists", () => {
    const v = buildIndustryCardView(input("Media & Telecom", {
      sectorData: sector(55, 6), topTheme: "Streaming consolidation",
    }));
    expect(v.intelligenceText).toBe("Streaming consolidation");
  });

  it("a zero-score sector is NOT treated as coverage", () => {
    // signal_score 0 with a non-null record must still read as unmeasured.
    const v = buildIndustryCardView(input("Healthcare", { sectorData: sector(0, 0) }));
    expect(v.source).toBe("none");
    expect(v.score).toBeNull();
    expect(v.reference).not.toBeNull();
  });

  it("a zero-score theme signal is NOT treated as coverage", () => {
    const v = buildIndustryCardView(input("Healthcare", {
      themeSignal: { score: 0, sentiment: "neutral", storyCount: 0, narrative: "x",
                     chips: ["JNJ"], themeName: "t", momentumLabel: "flat" },
    }));
    expect(v.source).toBe("none");
    expect(v.intelligenceText).toBe(NO_SIGNAL_TEXT);
  });
});

// ── Nothing is synthesised ──────────────────────────────────────────────────

describe("no fabricated state on the zero-coverage path", () => {
  it("across every configured industry, absence is uniform and honest", () => {
    for (const c of INDUSTRIES) {
      const v = buildIndustryCardView(input(c.name));
      expect(v.score).toBeNull();
      expect(v.sentiment).toBeNull();
      expect(v.drivers).toEqual([]);
      expect(v.footer).toBe(NOT_MEASURED_FOOTER);
      expect(v.stateBadge).toEqual({ label: NOT_MEASURED_BADGE, measured: false });
      expect(v.intelligenceText).toBe(NO_SIGNAL_TEXT);
      expect(v.themeName).toBeNull();
    }
  });

  it("no momentum vocabulary appears without a measurement", () => {
    for (const name of ZERO_COVERAGE) {
      const v = buildIndustryCardView(input(name));
      const all = `${v.intelligenceText} ${v.footer} ${v.storyLabel} ${v.stateBadge.label}`;
      expect(all).not.toMatch(/accelerating|strengthening|cooling|reversing|bullish|bearish/i);
    }
  });

  it("the structural shape of the view is unchanged between states", () => {
    const absent  = buildIndustryCardView(input("Healthcare"));
    const present = buildIndustryCardView(input("Healthcare", { sectorData: sector(70, 9) }));
    expect(Object.keys(absent).sort()).toEqual(Object.keys(present).sort());
  });
});

// ── The complete zero-coverage card, as one assertion ───────────────────────

describe("the zero-coverage card, end to end", () => {
  it.each(ZERO_COVERAGE)("%s presents absence in every slot at once", (name) => {
    const v = buildIndustryCardView(input(name));
    const c = cfg(name);
    expect({
      score:            v.score,
      badge:            v.stateBadge.label,
      badgeMeasured:    v.stateBadge.measured,
      intelligenceText: v.intelligenceText,
      drivers:          v.drivers,
      footer:           v.footer,
      storyLabel:       v.storyLabel,
      referenceLabel:   v.reference?.label,
    }).toEqual({
      score:            null,
      badge:            NOT_MEASURED_BADGE,
      badgeMeasured:    false,
      intelligenceText: NO_SIGNAL_TEXT,
      drivers:          [],
      footer:           NOT_MEASURED_FOOTER,
      storyLabel:       "No data",
      referenceLabel:   REFERENCE_LABEL,
    });
    // and the static config is present ONLY inside the reference block
    expect(v.reference!.driver).toBe(c.macroDrivers[0]);
    expect(v.reference!.tickers).toEqual(c.keyAssets.slice(0, 5));
  });
});
