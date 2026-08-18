// Capital Flow Transmission, 8-layer chain modeling how monetary policy
// propagates through public markets, credit, M&A, PE, VC, and the IPO window.

import type { CreditSpreadState } from "./creditSpread";
import { CREDIT_SERIES_LABEL, DIRECTION_THRESHOLD_BP } from "./creditSpread";

export type FlowStatus =
  | "accelerating" | "expanding" | "neutral" | "tightening" | "contracting" | "blocked"
  // RC2-C1: a layer with no real measurement. Distinct from "neutral", which is a
  // measured reading of no direction. Unmeasured means we do not know.
  | "unmeasured";

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
};

export const FLOW_STATUS_LABEL: Record<FlowStatus, string> = {
  accelerating: "Accelerating",
  expanding:    "Expanding",
  neutral:      "Neutral",
  tightening:   "Tightening",
  contracting:  "Contracting",
  blocked:      "Blocked",
  unmeasured:   "Not measured",
};

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
  ipoFilerCount: number;
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

function maActivityLayer(o: FlowOptions): CapitalFlowLayer {
  const n = o.maDealCount;
  if (n >= 8) return {
    id: "ma-activity", label: "M&A Activity", sublabel: "Strategic / Sponsor",
    status: "accelerating", indicator: `${n} Recent Deals`, signal: "Active",
    detail: "Deal flow elevated, strategic and sponsor acquirers transacting at pace with narrow bid-ask spread.",
  };
  if (n >= 4) return {
    id: "ma-activity", label: "M&A Activity", sublabel: "Strategic / Sponsor",
    status: "expanding", indicator: `${n} Recent Deals`, signal: "Building",
    detail: "M&A pipeline building as financing conditions stabilize and strategic rationale becomes compelling.",
  };
  if (n >= 2) return {
    id: "ma-activity", label: "M&A Activity", sublabel: "Strategic / Sponsor",
    status: "neutral", indicator: `${n} Recent Deals`, signal: "Selective",
    detail: "Selective deal activity with buyers focused on valuation discipline and clear strategic fit.",
  };
  return {
    id: "ma-activity", label: "M&A Activity", sublabel: "Strategic / Sponsor",
    status: "tightening", indicator: n === 0 ? "No Recent Deals" : `${n} Deal`,
    signal: "Subdued",
    detail: "M&A activity constrained, buyers cautious amid valuation uncertainty and financing friction.",
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

function ipoWindowLayer(o: FlowOptions): CapitalFlowLayer {
  const n      = o.ipoFilerCount;
  const highVol = o.volRegime === "high" || o.volRegime === "elevated";

  if (o.riskRegime === "risk-off" || o.volRegime === "high") return {
    id: "ipo-window", label: "IPO Window", sublabel: "S-1 / Public Listings",
    status: "blocked", indicator: "Window Closed", signal: "Shut",
    detail: "IPO window shut, companies filing S-1s are pausing or withdrawing amid market turbulence.",
  };
  if (highVol) return {
    id: "ipo-window", label: "IPO Window", sublabel: "S-1 / Public Listings",
    status: "tightening", indicator: n > 0 ? `${n} S-1s Filed` : "Vol Elevated",
    signal: "Constrained",
    detail: "Elevated volatility constrains IPO timing, only high-quality, must-own names completing transactions.",
  };
  if (n >= 8) return {
    id: "ipo-window", label: "IPO Window", sublabel: "S-1 / Public Listings",
    status: "accelerating", indicator: `${n} Recent S-1s`, signal: "Open",
    detail: "IPO window open and busy, backlog of high-quality filers transacting with institutional book coverage.",
  };
  if (n >= 4) return {
    id: "ipo-window", label: "IPO Window", sublabel: "S-1 / Public Listings",
    status: "expanding", indicator: `${n} Recent S-1s`, signal: "Opening",
    detail: "IPO activity picking up, select companies with strong fundamentals successfully accessing the window.",
  };
  if (n >= 1) return {
    id: "ipo-window", label: "IPO Window", sublabel: "S-1 / Public Listings",
    status: "neutral", indicator: `${n} S-1 Filing${n > 1 ? "s" : ""}`, signal: "Cautious",
    detail: "Limited IPO activity, companies watching for a sustained market window before pricing.",
  };
  return {
    id: "ipo-window", label: "IPO Window", sublabel: "S-1 / Public Listings",
    status: "tightening", indicator: "No Recent S-1s", signal: "Frozen",
    detail: "No new S-1 filings in pipeline, companies staying private longer or pursuing alternative exit strategies.",
  };
}

/**
 * RC2-C2a — the measurement-sufficiency contract, shared by every Capital Flow
 * aggregate (`buildSummary` here, `flowPressure` in capitalFlowIntel).
 *
 * An aggregate that says something "across the funding stack" needs most of that
 * stack to be measured. Below a majority, no directional verdict is defensible and
 * the aggregate must report insufficient coverage instead.
 *
 * Defined once and exported so the two aggregates cannot drift apart and render
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
  const measured = layers.filter(l => l.status !== "unmeasured").length;
  const total = layers.length;
  return { measured, total, sufficient: total > 0 && measured * 2 > total };
}

/**
 * RC2-C2a — the aggregate speaks only for the layers that were actually measured.
 *
 * Previously this counted statuses across all eight layers, four of which were
 * fabricated, and turned them into one confident sentence. An unmeasured layer now
 * enters neither the numerator nor the denominator: it is not "neutral", it is not
 * zero, it simply is not counted.
 *
 * The thresholds are the ORIGINAL ones expressed as proportions of the measured
 * set, so behaviour at eight measured layers is byte-identical to before
 * (ceil(8/2)=4, ceil(8*5/8)=5, ceil(8*3/8)=3). No new scoring model.
 *
 * Below a majority of the chain the function refuses to characterise the stack at
 * all. A sentence beginning "Capital flowing freely across the funding stack" is
 * not defensible when most of that stack is unmeasured.
 */
function buildSummary(layers: CapitalFlowLayer[], regime: string): string {
  const measured = layers.filter(l => l.status !== "unmeasured");
  const { measured: m, total, sufficient } = measuredCoverage(layers);

  // A statement "across the funding stack" requires most of the funding stack.
  if (!sufficient) {
    return `Capital flow is measured for ${m} of ${total} layers of the funding stack — not enough coverage to characterise conditions. Unmeasured layers are shown individually below.`;
  }

  const ss     = measured.map(l => l.status);
  const open   = ss.filter(s => s === "accelerating" || s === "expanding").length;
  const closed = ss.filter(s => s === "contracting"  || s === "blocked").length;
  const tight  = ss.filter(s => s === "tightening").length;

  const half     = Math.ceil(m / 2);
  const mostOpen = Math.ceil((m * 5) / 8);
  const someOpen = Math.ceil((m * 3) / 8);

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
    ipoWindowLayer(opts),
  ];
  const regime  = opts.regime ?? (
    opts.riskRegime === "risk-on"  ? "Risk-On"  :
    opts.riskRegime === "risk-off" ? "Risk-Off" : "Neutral"
  );
  return { layers, regime, summary: buildSummary(layers, regime), updatedAt: new Date().toISOString() };
}
