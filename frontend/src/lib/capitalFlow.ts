// Capital Flow Transmission, 8-layer chain modeling how monetary policy
// propagates through public markets, credit, M&A, PE, VC, and the IPO window.

export type FlowStatus = "accelerating" | "expanding" | "neutral" | "tightening" | "contracting" | "blocked";

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
};

export const FLOW_STATUS_LABEL: Record<FlowStatus, string> = {
  accelerating: "Accelerating",
  expanding:    "Expanding",
  neutral:      "Neutral",
  tightening:   "Tightening",
  contracting:  "Contracting",
  blocked:      "Blocked",
};

export interface FlowOptions {
  riskRegime:    "risk-on" | "neutral" | "risk-off";
  volRegime:     "low" | "moderate" | "elevated" | "high";
  regime:        string | null;
  tnxRate:       number | null;
  maDealCount:   number;
  vcDealCount:   number;
  ipoFilerCount: number;
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

function creditLeverageLayer(o: FlowOptions): CapitalFlowLayer {
  const hawkish  = o.regime?.toLowerCase().includes("hawkish") ?? false;
  const rateHigh = o.tnxRate !== null && o.tnxRate > 4.5;

  if (hawkish && rateHigh) return {
    id: "credit-leverage", label: "Credit & Leverage", sublabel: "HY / Leveraged Loans",
    status: "tightening", indicator: "Spreads Widening", signal: "Constrained",
    detail: "Rising rates expand spread requirements for leveraged buyouts, compressing deal economics across sponsor activity.",
  };
  if (o.riskRegime === "risk-off") return {
    id: "credit-leverage", label: "Credit & Leverage", sublabel: "HY / Leveraged Loans",
    status: "contracting", indicator: "Risk Premium Elevated", signal: "Tightening",
    detail: "Credit markets pricing risk premium, leveraged loan demand falls, constraining PE deal financing.",
  };
  if (o.riskRegime === "risk-on") return {
    id: "credit-leverage", label: "Credit & Leverage", sublabel: "HY / Leveraged Loans",
    status: "expanding", indicator: "Tight Spreads", signal: "Accessible",
    detail: "Compressed credit spreads enable leveraged financing at competitive rates, supporting deal flow.",
  };
  return {
    id: "credit-leverage", label: "Credit & Leverage", sublabel: "HY / Leveraged Loans",
    status: "neutral", indicator: "Stable", signal: "Neutral",
    detail: "Credit conditions allow selective deal financing, quality differentiation determines access.",
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

function peBuyoutLayer(o: FlowOptions): CapitalFlowLayer {
  const hawkish  = o.regime?.toLowerCase().includes("hawkish") ?? false;
  const rateHigh = o.tnxRate !== null && o.tnxRate > 4.5;

  if (rateHigh || hawkish) return {
    id: "pe-buyout", label: "PE / Buyout", sublabel: "Sponsor Acquisitions",
    status: "tightening", indicator: "LBO Math Stressed", signal: "Selective",
    detail: "Higher debt service compresses buyout IRRs, sponsors prioritize high-conviction, lower-leverage structures.",
  };
  if (o.maDealCount >= 6) return {
    id: "pe-buyout", label: "PE / Buyout", sublabel: "Sponsor Acquisitions",
    status: "expanding", indicator: "Pipeline Active", signal: "Deploying",
    detail: "PE sponsors deploying capital opportunistically as vintage diversification pressures increase.",
  };
  if (o.riskRegime === "risk-off") return {
    id: "pe-buyout", label: "PE / Buyout", sublabel: "Sponsor Acquisitions",
    status: "contracting", indicator: "LP Capital Pause", signal: "Paused",
    detail: "Risk-off environment reduces LP willingness to fund new commitments, sponsor pipeline stalls.",
  };
  return {
    id: "pe-buyout", label: "PE / Buyout", sublabel: "Sponsor Acquisitions",
    status: "neutral", indicator: "Neutral", signal: "Cautious",
    detail: "Buyout activity measured, deal selectivity high and hold periods extending as exit markets remain challenged.",
  };
}

function lateVCLayer(o: FlowOptions): CapitalFlowLayer {
  const n = o.vcDealCount;
  if (o.riskRegime === "risk-on" && n >= 4) return {
    id: "late-vc", label: "Late-Stage VC", sublabel: "Series C-E / Growth",
    status: "expanding", indicator: `${n} Recent Rounds`, signal: "Open",
    detail: "Growth capital accessible for proven companies, large rounds clearing at competitive valuations.",
  };
  if (o.riskRegime === "risk-off" || n === 0) return {
    id: "late-vc", label: "Late-Stage VC", sublabel: "Series C-E / Growth",
    status: "contracting", indicator: n === 0 ? "Frozen" : `${n} Deal`,
    signal: "Closed",
    detail: "Late-stage funding effectively closed, extensions and bridge rounds dominate over new capital.",
  };
  if (n >= 2) return {
    id: "late-vc", label: "Late-Stage VC", sublabel: "Series C-E / Growth",
    status: "neutral", indicator: `${n} Recent Rounds`, signal: "Selective",
    detail: "Growth equity investors active but highly selective, AI-native and defensible moats attract disproportionate capital.",
  };
  return {
    id: "late-vc", label: "Late-Stage VC", sublabel: "Series C-E / Growth",
    status: "tightening", indicator: "Slow Flow", signal: "Subdued",
    detail: "Late-stage capital available but terms shifted, flat rounds replacing 2021-era step-ups.",
  };
}

function earlyVCLayer(o: FlowOptions): CapitalFlowLayer {
  const hawkish = o.regime?.toLowerCase().includes("hawkish") ?? false;

  if (o.riskRegime === "risk-off" && o.volRegime === "high") return {
    id: "early-vc", label: "Early-Stage VC", sublabel: "Seed / Series A-B",
    status: "contracting", indicator: "Risk-Off / High Vol", signal: "Frozen",
    detail: "Seed and early-stage markets frozen, generalist LPs have paused commitments to new venture managers.",
  };
  if (hawkish) return {
    id: "early-vc", label: "Early-Stage VC", sublabel: "Seed / Series A-B",
    status: "tightening", indicator: "Rate Pressure", signal: "Constrained",
    detail: "Higher discount rates hurt early-stage valuations, AI-native deals remain funded but non-consensus bets face pressure.",
  };
  if (o.riskRegime === "risk-on") return {
    id: "early-vc", label: "Early-Stage VC", sublabel: "Seed / Series A-B",
    status: "expanding", indicator: "Risk-On", signal: "Active",
    detail: "Early-stage capital flowing, seed and Series A valuations have reset from 2021 highs to sustainable levels.",
  };
  return {
    id: "early-vc", label: "Early-Stage VC", sublabel: "Seed / Series A-B",
    status: "neutral", indicator: "Neutral", signal: "Selective",
    detail: "Early-stage active for AI, defense tech, and infrastructure, consumer and enterprise software face higher bars.",
  };
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

function buildSummary(layers: CapitalFlowLayer[], regime: string): string {
  const ss     = layers.map(l => l.status);
  const open   = ss.filter(s => s === "accelerating" || s === "expanding").length;
  const closed = ss.filter(s => s === "contracting"  || s === "blocked").length;
  const tight  = ss.filter(s => s === "tightening").length;

  if (closed >= 4) return `Capital transmission severely impaired, ${regime} conditions restricting flow across most layers of the funding stack.`;
  if (tight  >= 4) return `Monetary tightening propagating through the capital stack, each downstream layer faces incrementally higher cost of capital.`;
  if (open   >= 5) return `Capital flowing freely across the funding stack, ${regime} conditions enabling deal activity from M&A through early-stage VC.`;
  if (open   >= 3) return `Capital flow positive across upper layers with selective activity downstream, quality assets continue to attract capital despite mixed conditions.`;
  return `Capital flow mixed across the funding stack, sector and quality differentiation are the primary return drivers in ${regime} conditions.`;
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
