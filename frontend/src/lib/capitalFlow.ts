// Capital Flow Transmission, 8-layer chain modeling how monetary policy
// propagates through public markets, credit, M&A, PE, VC, and the IPO window.

import type { CreditSpreadState } from "./creditSpread";
import { CREDIT_SERIES_LABEL, DIRECTION_THRESHOLD_BP } from "./creditSpread";

export type FlowStatus =
  | "accelerating" | "expanding" | "neutral" | "tightening" | "contracting" | "blocked"
  // RC2-C1: a layer with no real measurement. Distinct from "neutral", which is a
  // measured reading of no direction. Unmeasured means we do not know.
  | "unmeasured"
  // RC2-C2b: a layer that measures something real but whose observation cannot
  // support a DIRECTIONAL claim. Three distinct things now exist:
  //   neutral       - measured, directional authority, currently reading no direction
  //   observational - measured, NO directional authority, ever
  //   unmeasured    - no data at all
  // An observational layer counts toward measured COVERAGE (we did observe
  // something) but is excluded from every directional aggregate, including their
  // denominators. Leaving it in the denominator would let a coverage count dampen
  // the verdict - a quieter version of the same defect.
  | "observational";

export interface CapitalFlowLayer {
  id:        string;
  label:     string;
  sublabel:  string;
  status:    FlowStatus;
  indicator: string;
  signal:    string;
  detail:    string;
}

export interface CapitalFlowState {
  layers:    CapitalFlowLayer[];
  regime:    string;
  summary:   string;
  updatedAt: string;
}

export const FLOW_STATUS_COLOR: Record<FlowStatus, string> = {
  accelerating: "#22c55e",
  expanding:    "#86efac",
  neutral:      "#94a3b8",
  tightening:   "#fbbf24",
  contracting:  "#f97316",
  blocked:      "#ef4444",
  unmeasured:   "#64748b",
  observational:"#94a3b8",
};

export const FLOW_STATUS_LABEL: Record<FlowStatus, string> = {
  accelerating: "Accelerating",
  expanding:    "Expanding",
  neutral:      "Neutral",
  tightening:   "Tightening",
  contracting:  "Contracting",
  blocked:      "Blocked",
  unmeasured:   "Not measured",
  observational:"Observed",
};

/**
 * RC2-C2b — new S-1 registrations, deduped by filer, over the period EDGAR
 * actually returned. Deliberately carries its own window rather than implying a
 * generic "current" market period.
 */
export interface IpoFilingObservation {
  /** Distinct CIKs filing a NEW S-1 (form "S-1", amendments excluded). */
  newRegistrations: number;
  /** Total entries EDGAR returned, amendments included. Diagnostics only. */
  rawEntries:       number;
  /** Earliest filing date in the returned set (YYYY-MM-DD), or null. */
  windowStart:      string | null;
  /** Latest filing date in the returned set (YYYY-MM-DD), or null. */
  windowEnd:        string | null;
}

export interface FlowOptions {
  riskRegime:    "risk-on" | "neutral" | "risk-off";
  volRegime:     "low" | "moderate" | "elevated" | "high";
  regime:        string | null;
  tnxRate:       number | null;
  maDealCount:   number;
  // RC2-C2a: `vcDealCount` REMOVED. It existed solely to feed the fabricated
  // Late-Stage VC layer, and it carried PE sponsor headlines from the news feed,
  // not venture rounds. There is no venture-financing source to replace it with,
  // so the input is gone rather than left dangling for a future consumer to
  // mistake for real data.
  /**
   * RC2-C2b: the S-1 observation, narrowed to what EDGAR can actually support.
   * `ipoFilerCount` (a raw entry count including S-1/A amendments) is REPLACED —
   * measured 2026-08-18, 10 of 13 entries were amendments, so the raw count
   * overstated new registrations by 4.3x and drove the old `n >= 8` branch.
   * Absent/null renders the layer as an explicit absence, never as "closed".
   */
  ipoFilings?:   IpoFilingObservation | null;
  /**
   * RC2-C1: the measured US HY OAS (FRED BAMLH0A0HYM2). This is the SOLE input to
   * the Credit & Leverage layer. Omitted or unavailable -> the layer reports
   * `unmeasured`; it never falls back to riskRegime, equities, or tnxRate.
   */
  credit?:       CreditSpreadState | null;
}

function monetaryPolicyLayer(o: FlowOptions): CapitalFlowLayer {
  const hawkish  = o.regime?.toLowerCase().includes("hawkish") ?? false;
  const dovish   = o.regime?.toLowerCase().includes("dovish")  ?? false;
  const rateHigh = o.tnxRate !== null && o.tnxRate > 4.5;
  const ind      = o.tnxRate !== null ? `10Y ${o.tnxRate.toFixed(2)}%` : "N/A";

  if (hawkish || rateHigh) return {
    id: "monetary-policy", label: "Monetary Policy", sublabel: "Fed Funds / QT",
    status: "tightening", indicator: ind, signal: "Restrictive",
    detail: "Elevated rates constrain duration assets and increase cost of capital across leveraged strategies.",
  };
  if (dovish) return {
    id: "monetary-policy", label: "Monetary Policy", sublabel: "Fed Funds / QE",
    status: "accelerating", indicator: ind, signal: "Accommodative",
    detail: "Easing cycle compresses discount rates, expanding multiples and unlocking credit markets.",
  };
  return {
    id: "monetary-policy", label: "Monetary Policy", sublabel: "Fed Funds",
    status: "neutral", indicator: ind, signal: "Neutral",
    detail: "Rates near neutral, no incremental constraint or tailwind from Fed policy.",
  };
}

function publicEquitiesLayer(o: FlowOptions): CapitalFlowLayer {
  if (o.riskRegime === "risk-on" && (o.volRegime === "low" || o.volRegime === "moderate")) return {
    id: "public-equities", label: "Public Equities", sublabel: "Equity / Multiples",
    status: "accelerating", indicator: "Risk-On", signal: "Bull Phase",
    detail: "Multiple expansion underway, growth stocks outperform and risk assets attract incremental allocation.",
  };
  if (o.riskRegime === "risk-off" || o.volRegime === "high") return {
    id: "public-equities", label: "Public Equities", sublabel: "Equity / Multiples",
    status: "contracting", indicator: o.volRegime === "high" ? "High Vol" : "Risk-Off",
    signal: "Defensive Rotation",
    detail: "Multiple compression and defensive rotation reducing risk-taking capacity and deal appetite.",
  };
  if (o.volRegime === "elevated") return {
    id: "public-equities", label: "Public Equities", sublabel: "Equity / Multiples",
    status: "tightening", indicator: "Elevated Vol", signal: "Caution",
    detail: "Elevated volatility compresses risk appetite, sector dispersion increases as macro uncertainty persists.",
  };
  return {
    id: "public-equities", label: "Public Equities", sublabel: "Equity / Multiples",
    status: "neutral", indicator: "Neutral", signal: "Rangebound",
    detail: "Public equity markets offer moderate risk-adjusted opportunity without a clear directional catalyst.",
  };
}

/**
 * RC2-C1 — Credit & Leverage, derived SOLELY from the measured US HY OAS.
 *
 * What this replaced: the layer used to read `o.regime.includes("hawkish")`,
 * `o.tnxRate > 4.5`, and `o.riskRegime` — the last of which is
 * `norm(avgEq, -3, 3)`, the average percent change of SPY/QQQ/IWM. It then
 * asserted "Spreads Widening" / "Tight Spreads" and the prose "Compressed credit
 * spreads enable leveraged financing at competitive rates". A rally in equities
 * produced a claim about high-yield credit. No spread data was involved.
 *
 * There is deliberately no `riskRegime`, `tnxRate`, `regime` or proxy branch left
 * in this function. Absent a real reading, the honest answer is `unmeasured`.
 */
function creditLeverageLayer(o: FlowOptions): CapitalFlowLayer {
  const base = {
    id: "credit-leverage",
    label: "Credit & Leverage",
    sublabel: "US HY OAS",
  };

  const credit = o.credit;

  if (!credit || !credit.measured) {
    const why =
      !credit                       ? "not retrieved"
      : credit.reason === "stale"   ? `last print ${credit.asOf ?? "unknown"}`
      : credit.reason === "unparseable" ? "series unreadable"
      : "series unavailable";
    return {
      ...base,
      status: "unmeasured",
      indicator: "Not measured",
      signal: "Unavailable",
      // States the absence and its cause, and stops. Any characterisation of
      // credit conditions here — even a hedged one — would be the fabrication
      // this layer was rewritten to remove.
      detail: `No ${CREDIT_SERIES_LABEL} reading available (${why}). Credit conditions are not measured right now.`,
    };
  }

  // Measured. The level is the quantity; direction is the +/-3bp rule.
  const lvl  = `${credit.level}bp`;
  const sign = credit.changeBp > 0 ? "+" : "";
  const move = `${sign}${credit.changeBp}bp vs ${credit.priorAsOf}`;
  const asOf = `as of ${credit.asOf}`;

  if (credit.direction === "widening") return {
    ...base,
    status: "tightening",
    indicator: `${lvl} widening · ${credit.asOf}`,
    signal: "Constrained",
    detail: `US high-yield option-adjusted spread ${lvl} (${move}), ${asOf}. Wider spreads raise the cost of leveraged financing, compressing sponsor deal economics.`,
  };

  if (credit.direction === "tightening") return {
    ...base,
    status: "expanding",
    indicator: `${lvl} tightening · ${credit.asOf}`,
    signal: "Accessible",
    detail: `US high-yield option-adjusted spread ${lvl} (${move}), ${asOf}. Tighter spreads lower the cost of leveraged financing, supporting deal flow.`,
  };

  return {
    ...base,
    status: "neutral",
    indicator: `${lvl} stable · ${credit.asOf}`,
    signal: "Neutral",
    detail: `US high-yield option-adjusted spread ${lvl} (${move}), ${asOf}. Change is inside the ${DIRECTION_THRESHOLD_BP}bp day-to-day band, so credit conditions are steady rather than directional.`,
  };
}

/**
 * RC2-C2b — M&A Activity is an OBSERVATION of Argus's own feed coverage.
 *
 * `maDealCount` is `items.filter(i => i.category === "M&A").length`. Three
 * measured facts about that number:
 *
 *   1. It counts ARTICLES admitted by a keyword regex over title OR snippet, not
 *      transactions. On the 2026-08-18 sample of 8, at most 1-2 were announced
 *      transactions; the rest were an interview, a feature, market commentary, a
 *      13F stake purchase, litigation news about an existing deal, and an 8-K
 *      whose "definitive agreement" could be any material contract.
 *   2. It has NO time window. Both warm targets run fresh_only=False, so no age
 *      cutoff applies; that sample spanned 11.3h to 101.4h. The bound is RSS
 *      retention, not a period.
 *   3. It scales with our source list. Adding a feed raises it; a source outage
 *      lowers it. Neither is a market event.
 *
 * The old thresholds (>=8 accelerating "deal flow elevated", >=4 expanding,
 * >=2 neutral) therefore had no empirical authority - today's count of 8 sat
 * exactly on the "elevated" boundary, crossable by one more feature article.
 *
 * The count is still worth showing: it is a true statement about what Argus is
 * tracking. It is shown as exactly that and contributes no direction.
 */
function maActivityLayer(o: FlowOptions): CapitalFlowLayer {
  const n = o.maDealCount;
  return {
    id: "ma-activity", label: "M&A Activity", sublabel: "Feed coverage",
    status: "observational",
    indicator: `${n} M&A-related item${n === 1 ? "" : "s"} tracked`,
    signal: "Observed",
    detail: n === 0
      ? "No M&A-related items in Argus's current feed coverage. This counts items tracked, not market transaction volume."
      : `${n} M&A-related item${n === 1 ? "" : "s"} in Argus's current feed coverage, which can include transaction reporting, rumours and commentary. This is a count of what Argus is tracking, not market transaction volume, and it has no fixed observation period.`,
  };
}

/**
 * RC2-C2a — the three private-market layers have NO data authority and are
 * therefore explicitly unmeasured.
 *
 * What each of them used to assert, and from what:
 *
 *   PE / Buyout      "LBO Math Stressed" / "Pipeline Active" / "LP Capital Pause"
 *                    <- tnxRate > 4.5, regime.includes("hawkish"), maDealCount,
 *                       riskRegime. No private-equity data of any kind. The
 *                       "LP Capital Pause" reading was an assertion about
 *                       limited-partner behaviour derived from equity direction.
 *
 *   Late-Stage VC    "N Recent Rounds" (Series C-E)
 *                    <- deals.filter(d => d.dealType === "sponsor").length, i.e.
 *                       PE BUYOUT HEADLINES from the news feed rendered as venture
 *                       financing rounds. A category error, not a rounding error.
 *                       On /ma the input was hardcoded 0, so the layer read
 *                       "Frozen - late-stage funding effectively closed" from a
 *                       literal that was never a measurement.
 *
 *   Early-Stage VC   "Seed markets frozen, generalist LPs have paused commitments"
 *                    <- riskRegime + volRegime + regime string. Zero venture data,
 *                       zero LP data.
 *
 * Argus has no venture-financing, buyout, or LP/fundraising source. Until it does,
 * the honest reading is that these layers are not measured. They keep their place
 * in the chain so the gap in coverage stays visible rather than being hidden.
 *
 * Uses the same absence model as Credit & Leverage (RC2-C1): status `unmeasured`,
 * indicator "Not measured", and copy that states the absence and stops.
 */
function unmeasuredLayer(
  id: string, label: string, sublabel: string, subject: string,
): CapitalFlowLayer {
  return {
    id, label, sublabel,
    status: "unmeasured",
    indicator: "Not measured",
    signal: "Unavailable",
    // States the absence and nothing else. Any characterisation of conditions
    // here - even hedged - would be the fabrication this demotion removes.
    detail: `No ${subject} data source. This layer is not currently measured.`,
  };
}

function peBuyoutLayer(_o: FlowOptions): CapitalFlowLayer {
  return unmeasuredLayer(
    "pe-buyout", "PE / Buyout", "Sponsor Acquisitions",
    "buyout or limited-partner",
  );
}

function lateVCLayer(_o: FlowOptions): CapitalFlowLayer {
  return unmeasuredLayer(
    "late-vc", "Late-Stage VC", "Series C-E / Growth",
    "venture financing-round",
  );
}

function earlyVCLayer(_o: FlowOptions): CapitalFlowLayer {
  return unmeasuredLayer(
    "early-vc", "Early-Stage VC", "Seed / Series A-B",
    "seed and early-stage financing",
  );
}

/**
 * RC2-C2a — the measurement-sufficiency contract, shared by every Capital Flow
 * aggregate (`buildSummary` here, `flowPressure` in capitalFlowIntel, and the
 * regime chip on /private-markets).
 *
 * An aggregate that says something "across the funding stack" needs most of that
 * stack to be measured. Below a majority, no directional verdict is defensible and
 * the aggregate must report insufficient coverage instead.
 *
 * Defined once and exported so the aggregates cannot drift apart and render
 * contradictory states side by side — which is exactly what happened when only
 * `buildSummary` had the rule.
 *
 * Note it judges the layer set it is GIVEN. Production callers pass the whole
 * chain; passing a pre-filtered set asks a different question and gets a
 * correspondingly different answer.
 */
export function measuredCoverage(layers: CapitalFlowLayer[]): {
  measured: number; total: number; sufficient: boolean;
} {
  // Observational layers ARE measured - we observed something real - so they count
  // toward coverage. They are excluded from direction by `directionalLayers`.
  const measured = layers.filter(l => l.status !== "unmeasured").length;
  const total = layers.length;
  return { measured, total, sufficient: total > 0 && measured * 2 > total };
}

/**
 * RC2-C2b — the layers that may influence a directional verdict.
 *
 * Every directional aggregate (pressure score, summary thresholds, regime chip)
 * must be computed over THIS set, numerator and denominator alike. An
 * observational layer contributing 0 to the numerator while still sitting in the
 * denominator would drag every verdict toward the middle: with 5 measured layers
 * of which 2 are observational, `open >= ceil(5*5/8) = 4` is unreachable because
 * only 3 layers can ever be open. That is a feed-coverage count quietly changing
 * the verdict, which is the defect C2b exists to remove.
 */
export function directionalLayers(layers: CapitalFlowLayer[]): CapitalFlowLayer[] {
  return layers.filter(l => l.status !== "unmeasured" && l.status !== "observational");
}

/**
 * RC2-C2b — IPO FILING ACTIVITY. Renamed from "IPO Window", and observational.
 *
 * What was removed, and why:
 *
 *   - The two leading branches keyed on `riskRegime === "risk-off"` and
 *     `volRegime === "high"/"elevated"` and TOOK PRECEDENCE over the filing
 *     count. Argus could declare the window "shut - companies filing S-1s are
 *     pausing or withdrawing" purely from VIX, while S-1s were actively being
 *     filed. That is the same equity-proxy fabrication removed in C1 and C2a.
 *   - The count itself was raw EDGAR entries INCLUDING S-1/A amendments.
 *     Measured 2026-08-18: 13 entries, 10 amendments, 3 new registrations. The
 *     `n >= 8` "window open and busy" branch was firing on amendment traffic.
 *   - "Open" / "closed" / "busy" / "book coverage" / "transacting" describe an
 *     IPO MARKET. That needs pricing, withdrawals, deal size and issuance
 *     outcomes. EDGAR registration filings are none of those.
 *
 * What survives is the narrow truth: how many distinct issuers filed a new S-1,
 * over the period EDGAR actually returned. No directional threshold is applied,
 * because none can be justified - a daily new-S-1 history would be needed first
 * and no such series exists in the product.
 */
function ipoFilingActivityLayer(o: FlowOptions): CapitalFlowLayer {
  const base = { id: "ipo-window", label: "IPO Filing Activity", sublabel: "New S-1 registrations" };
  const f = o.ipoFilings;

  if (!f) return {
    ...base,
    status: "unmeasured",
    indicator: "Not measured",
    signal: "Unavailable",
    detail: "No S-1 registration data retrieved. Filing activity is not currently measured.",
  };

  const period = f.windowStart && f.windowEnd
    ? (f.windowStart === f.windowEnd ? f.windowStart : `${f.windowStart} to ${f.windowEnd}`)
    : "period unavailable";
  const n = f.newRegistrations;

  return {
    ...base,
    status: "observational",
    indicator: `${n} new S-1${n === 1 ? "" : "s"}`,
    signal: "Observed",
    detail: n === 0
      ? `No new S-1 registrations in the filings EDGAR returned (${period}; ${f.rawEntries} total entries, amendments excluded). This counts registration filings only and says nothing about IPO pricing or completion.`
      : `${n} distinct issuer${n === 1 ? "" : "s"} filed a new S-1 over ${period} (${f.rawEntries} total EDGAR entries; S-1/A amendments excluded). This counts registration filings only and says nothing about IPO pricing, withdrawals or completion.`,
  };
}

function buildSummary(layers: CapitalFlowLayer[], regime: string): string {
  const { measured: m, total, sufficient } = measuredCoverage(layers);

  // A statement "across the funding stack" requires most of the funding stack.
  if (!sufficient) {
    return `Capital flow is measured for ${m} of ${total} layers of the funding stack — not enough coverage to characterise conditions. Unmeasured layers are shown individually below.`;
  }

  // RC2-C2b: direction is judged ONLY over layers with directional authority.
  // Observational layers (M&A Activity, IPO Filing Activity) are real
  // measurements but cannot move a verdict, so they enter neither side of this.
  const directional = directionalLayers(layers);
  if (directional.length === 0) {
    return `Capital flow has ${m} of ${total} layers measured, but none of them carry a directional reading — conditions are observed, not characterised.`;
  }
  const ss     = directional.map(l => l.status);
  const open   = ss.filter(s => s === "accelerating" || s === "expanding").length;
  const closed = ss.filter(s => s === "contracting"  || s === "blocked").length;
  const tight  = ss.filter(s => s === "tightening").length;

  const d        = directional.length;
  const half     = Math.ceil(d / 2);
  const mostOpen = Math.ceil((d * 5) / 8);
  const someOpen = Math.ceil((d * 3) / 8);

  if (closed >= half)     return `Capital transmission severely impaired, ${regime} conditions restricting flow across most measured layers of the funding stack.`;
  if (tight  >= half)     return `Monetary tightening propagating through the capital stack, each downstream measured layer faces incrementally higher cost of capital.`;
  // The old copy for this branch named early-stage VC explicitly ("from M&A
  // through early-stage VC"). That layer is unmeasured, so the claim now stops at
  // what the measured layers support.
  if (open   >= mostOpen) return `Capital flowing freely across the measured layers of the funding stack, ${regime} conditions enabling deal activity.`;
  if (open   >= someOpen) return `Capital flow positive across upper layers with selective activity downstream, quality assets continue to attract capital despite mixed conditions.`;
  return `Capital flow mixed across the measured layers of the funding stack, sector and quality differentiation are the primary return drivers in ${regime} conditions.`;
}

export function computeCapitalFlow(opts: FlowOptions): CapitalFlowState {
  const layers: CapitalFlowLayer[] = [
    monetaryPolicyLayer(opts),
    publicEquitiesLayer(opts),
    creditLeverageLayer(opts),
    maActivityLayer(opts),
    peBuyoutLayer(opts),
    lateVCLayer(opts),
    earlyVCLayer(opts),
    ipoFilingActivityLayer(opts),
  ];
  const regime  = opts.regime ?? (
    opts.riskRegime === "risk-on"  ? "Risk-On"  :
    opts.riskRegime === "risk-off" ? "Risk-Off" : "Neutral"
  );
  return { layers, regime, summary: buildSummary(layers, regime), updatedAt: new Date().toISOString() };
}
