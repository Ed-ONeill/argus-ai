/**
 * sectorIntelligence.ts — Pure functions for per-sector intelligence generation.
 *
 * Zero LLM calls. All output derived from existing FeedResponse fields via
 * deterministic templates and lookup tables. Functions are regime-aware.
 */

import type { SectorIntelligence, IndustrySignal, StoryCluster } from "./types";

// ── Entity and keyword maps ───────────────────────────────────────────────────

export const SECTOR_ENTITIES: Record<string, string[]> = {
  "Technology":     [
    "AAPL","MSFT","GOOGL","GOOG","META","NVDA","AMD","INTC","TSM","AMZN",
    "CRM","SNOW","NOW","WDAY","ASML","AVGO","QCOM","MU","ARM","AMAT",
    "LRCX","KLAC","MRVL","TXN","NXPI","ON","MCHP","SMCI","ADBE","PANW",
    "ORCL","DDOG","ZS","CRWD","FTNT","PLTR","MDB","OKTA","VEEV","HUBS",
    "ENTG","TER","GTLB","SPLK","SNPS","CDNS","ANSS","KEYS","KLAC","IPGP",
  ],
  "Financials":     [
    "JPM","BAC","GS","MS","C","WFC","BLK","BX","KKR","AXP",
    "V","MA","PYPL","SCHW","ARES","APO","OWL","PNC","COF","TROW",
    "CG","CB","AIG","MET","PRU","AFL","ALL","TRV","BRK","USB",
    "FITB","HBAN","KEY","RF","CFG","MTB","SIVB","ZION","CMA","SNV",
  ],
  "Energy":         [
    "XOM","CVX","BP","SHEL","COP","SLB","HAL","OXY","VLO","MPC",
    "LNG","CQP","PSX","DVN","EOG","FANG","WMB","KMI","ET","EPD",
    "HES","MRO","APA","PXD","AR","EQT","RRC","CNX","CHK","BKR",
  ],
  "Industrials":    [
    "GE","RTX","HON","CAT","DE","LMT","NOC","BA","GD","UPS",
    "FDX","CSX","UNP","ABB","HII","KTOS","ITW","EMR","ETN","PH",
    "ROK","XYL","GNRC","FAST","GWW","CARR","OTIS","EXPD","TDG","HEICO",
    "BWXT","LDOS","SAIC","AXON","CW","CACI","L3H","DRS","SPR","HXL",
  ],
  "Healthcare":     [
    "JNJ","PFE","MRK","LLY","ABBV","BMY","UNH","CVS","CI","AMGN",
    "GILD","REGN","MRNA","ISRG","BIIB","VRTX","ELV","HUM","BSX","MDT",
    "GEHC","ZTS","DGX","IQV","MCK","ABC","CAH","HSIC","PODD","DXCM",
    "INCY","ALNY","SRPT","BLUE","EDIT","NTLA","RXRX","CRSP","BEAM","SGMO",
  ],
  "Consumer":       [
    "WMT","TGT","COST","HD","LOW","MCD","SBUX","NKE","PG","KO",
    "PEP","PM","MO","TSLA","AMZN","LULU","GM","F","YUM","CMG",
    "DG","BURL","FIVE","TJX","RH","CHWY","ETSY","W","PTON","DPZ",
    "QSR","EAT","DENN","JACK","RRGB","PLAY","SFM","WW","BYND","REAL",
  ],
  "Utilities":      [
    "NEE","DUK","SO","D","AEP","EXC","SRE","PCG","ED","CEG",
    "VST","AWK","ES","FE","WEC","XEL","NRG","AES","FSLR","ENPH",
    "PPL","CNP","EIX","NI","PNW","EVRG","ATO","ONE","OGE","LNT",
  ],
  "Materials":      [
    "FCX","NEM","APD","LIN","NUE","X","CLF","AA","ALB","CCJ",
    "DD","CF","MOS","ECL","PPG","SHW","RPM","EMN","HUN","OLN",
    "MP","LAC","LTHM","SQM","LIT","COPX","PICK","REMX","URA","DNN",
  ],
  "Real Estate":    [
    "AMT","PLD","EQIX","SPG","PSA","AVB","EQR","VTR","ARE","DLR",
    "CCI","SBAC","ESS","NNN","O","VICI","KIM","CBRE","STAG","WPC",
    "HST","INVH","UDR","CPT","IRM","COLD","NSA","EXR","CUBE","LSI",
  ],
  "Communications": [
    "GOOGL","META","NFLX","DIS","CMCSA","CHTR","T","VZ","TMUS","SNAP",
    "PINS","WBD","PARA","TTD","ROKU","SPOT","ZM","MGNI","PUBM","IAC",
    "LYV","WYNN","DKNG","PENN","MGM","CZR","MTCH","BMBL","SIRI","LSXMA",
  ],
  "Crypto":         [
    "COIN","MSTR","MARA","RIOT","SQ","PYPL","HUT","CLSK","CORZ","BTBT",
    "IREN","WULF","GBTC","BITO","ETHE","ARKB","FBTC","BITB","HODL","EZBC",
  ],
};

const SECTOR_KEYWORDS: Record<string, string[]> = {
  "Technology":     ["tech","ai","chip","semiconductor","software","cloud","nvidia","microsoft","google","apple"],
  "Financials":     ["bank","fed","rate","yield","credit","treasury","financial","jpmorgan","goldman","blackstone"],
  "Energy":         ["oil","opec","crude","brent","wti","energy","lng","petroleum","natural gas"],
  "Industrials":    ["defense","aerospace","freight","railroad","manufacturing","lockheed","boeing","caterpillar"],
  "Healthcare":     ["pharma","drug","fda","biotech","healthcare","pfizer","lilly","abbvie","clinical trial"],
  "Consumer":       ["consumer","retail","spending","walmart","amazon","mcdonald","inflation","cpi"],
  "Utilities":      ["utility","nuclear","power","grid","electricity","solar","wind","ferc"],
  "Materials":      ["gold","copper","mining","metal","steel","lithium","commodity","uranium","freeport"],
  "Real Estate":    ["reit","property","real estate","housing","mortgage","office vacancy","data center reit"],
  "Communications": ["media","streaming","telecom","social","advertising","netflix","disney","comcast"],
};

const THEMATIC_DRIVERS: Record<string, string[]> = {
  "Technology":     ["AI Capex","10Y Yield","USD","GPU Supply","Export Controls","Cloud ARR"],
  "Financials":     ["Yield Curve","NIM","Credit Spreads","CRE Exposure","Private Credit","M&A Flow"],
  "Energy":         ["WTI","OPEC+","Nat Gas","Breakevens","Refinery Cap","LNG Exports"],
  "Industrials":    ["Defense Backlog","Freight PMI","Infra Bill","Capex Cycle","Backlog Cover"],
  "Healthcare":     ["FDA Calendar","GLP-1","Drug Pricing","Biotech Funding","IRA Policy"],
  "Consumer":       ["Real Wages","CPI Delta","Credit Util","Savings Rate","Confidence"],
  "Utilities":      ["10Y Yield","Power Load","Nuclear PPA","Rate Case","Grid Capex"],
  "Materials":      ["China PMI","Copper","USD","Iron Ore","Mine Supply","Lithium"],
  "Real Estate":    ["10Y Yield","CRE Vacancy","Cap Rates","CMBS Spreads","Data Ctr Rent"],
  "Communications": ["Ad Spend","ARPU","AI Targeting","Content Costs","Streaming Churn"],
};

const INDUSTRY_ABBREV: Record<string, string> = {
  "AI Infrastructure":      "AI Infra",
  "Energy Transition":      "E-Transition",
  "Private Credit":         "Priv. Credit",
  "Crypto Infrastructure":  "Crypto",
  "Cloud Software":         "Cloud SW",
  "Data Centers":           "Data Ctrs",
};

// ── Thesis generation ─────────────────────────────────────────────────────────

export function generateThesis(
  sector:     SectorIntelligence,
  industries: IndustrySignal[],
  regime:     string | null,
): string {
  const lead    = industries[0]?.name ?? null;
  const entity  = sector.top_entity;
  const align   = sector.regime_alignment;
  const hawkish = regime?.includes("Hawkish")     ?? false;
  const dovish  = regime?.includes("Dovish")       ?? false;
  const riskOff = regime?.includes("Risk-Off")     ?? false;
  const stagfl  = regime?.includes("Stagflation")  ?? false;

  switch (sector.name) {
    case "Technology":
      if (lead === "AI Infrastructure")
        return `GPU supply scarcity is sustaining ${entity ?? "NVDA"} pricing power through the hyperscaler capex cycle — multi-quarter datacenter commitments are de-risking revenue visibility even as long-duration software multiples face rate pressure.`;
      if (lead === "Semiconductors")
        return `Export controls are bifurcating the semiconductor order book — advanced foundry share is concentrating at TSMC and domestic alternatives, creating earnings dispersion between compliant names and those with China-exposure overhang.`;
      if (lead === "Cybersecurity")
        return `Enterprise security budgets are proving non-discretionary — identity and cloud-native spend is accelerating even as broader SaaS multiples compress, creating a valuation premium for sticky recurring revenue with negative churn.`;
      if (hawkish)
        return `Rate pressure is creating a valuation drag on long-duration software while AI hardware remains insulated by capex-driven revenue clarity — the sector is bifurcating between duration-exposed software and earnings-visibility-driven infrastructure.`;
      return `Technology leadership is broadening across sub-sectors — multiple concurrent catalysts are reducing single-name event risk and widening the momentum positioning opportunity beyond the AI hardware core${entity ? ` with ${entity} leading` : ""}.`;

    case "Financials":
      if (hawkish)
        return `NIM expansion under higher-for-longer is driving earnings revision upgrades that compress forward P/E — ${entity ?? "deposit-funded banks"} are repricing assets faster than liabilities reset, widening the spread income advantage into next year.`;
      if (lead === "Private Credit")
        return `Banks retreating from leveraged lending under capital constraints are ceding market share to private credit managers — direct lending spreads are above historic norms as AUM grows without the legacy balance sheet drag that constrains bank returns.`;
      if (riskOff)
        return `Risk-off positioning is rotating into Financials defensives — capital markets revenue is compressing but deposit franchise value and NIM resilience are providing relative downside protection that justifies the sector's defensive premium.`;
      return `Credit spread stability is sustaining bank book values while capital markets normalization adds fee income — the earnings revision cycle in Financials hinges on NIM direction and whether loan growth can offset any credit quality deterioration.`;

    case "Energy":
      if (stagfl || hawkish)
        return `OPEC+ production restraint is sustaining crude above the marginal cost of U.S. shale — ${entity ? `${entity} ` : ""}free cash flow conversion is above the 5-year average as commodity premiums hold in an environment where inflation breakevens remain structurally supported.`;
      if (lead === "LNG")
        return `LNG export terminal capacity is the binding constraint on European and Asian re-gasification demand — the structural supply deficit into 2026 is keeping spot premiums elevated and supporting contract repricing above current forward curves.`;
      if (riskOff)
        return `Energy is holding as a commodity hedge within the risk-off rotation — production discipline is sustaining the free cash flow yield argument even as macro demand expectations soften${entity ? `, with ${entity} anchoring the defensive positioning` : ""}.`;
      return `Production discipline is outpacing demand growth — OPEC+ quota adherence is sustaining crude undersupply needed to keep free cash flow above capital return thresholds${entity ? ` with ${entity} setting the pace` : ""}.`;

    case "Industrials":
      if (lead === "Defense")
        return `Multi-year NATO procurement commitments are converting geopolitical risk into durable order-book expansion — backlog coverage beyond 12 months is compressing earnings risk for ${entity ?? "LMT and RTX"} and justifying a valuation premium to cyclical peers.`;
      if (lead === "Robotics")
        return `AI-adjacent capex is extending into physical systems — industrial automation adoption is accelerating as structural labor cost pressures cross the ROI threshold for deployment, driving order books beyond prior-cycle highs.`;
      if (riskOff)
        return `Defense procurement is providing a countercyclical demand floor as private capex contracts — ${entity ?? "government-exposed names"} are outperforming on earnings visibility while freight and logistics absorb the volume deceleration.`;
      return `Government infrastructure spending is extending order book visibility beyond 12 months — fiscal-driven capex has longer duration than private investment cycles and is providing earnings floor protection${entity ? ` anchored by ${entity}` : ""} against cyclical deceleration.`;

    case "Healthcare":
      if (align === "headwind")
        return `Drug pricing policy risk is the primary multiple headwind — IRA negotiation expansion and Medicare rate-setting uncertainty are keeping institutional positioning cautious even as pipeline catalysts are accelerating.`;
      if (entity)
        return `${entity}'s pipeline catalyst is driving sector positioning — FDA approval cadence is providing binary upside in a defensive sector where pricing inelasticity compresses downside risk relative to rate-sensitive cyclicals.`;
      return `Healthcare earnings durability is attracting defensive positioning — drug pricing inelasticity and multi-year patent runway compress downside risk while FDA pipeline catalysts maintain asymmetric upside for active sector exposure.`;

    case "Consumer":
      if (align === "headwind")
        return `Real wage erosion and delinquency rate acceleration are rotating positioning out of discretionary and into staples — the bifurcation between value-channel winners and mall-exposed retailers is widening with each successive CPI print.`;
      if (hawkish)
        return `Consumer credit tightening is creating a spending constraint that shows up in delinquency rates 3-6 months before retail revenue deteriorates — the sector is vulnerable to synchronized credit and income headwinds as higher-for-longer transmits through household balance sheets.`;
      return `Real wage growth is sustaining spending velocity above historical trend — consumer credit availability and confidence are tracking together, supporting discretionary over staples in a soft-landing scenario where income growth exceeds inflation.`;

    case "Utilities":
      if (lead === "Nuclear")
        return `Data center power procurement is creating a multi-year nuclear PPA cycle — ${entity ?? "CEG and VST"} are capturing pricing power that decouples their forward earnings from the rate-driven multiple compression affecting regulated utility peers.`;
      if (hawkish)
        return `Rate headwinds are compressing Utilities multiples at the same time AI infrastructure buildout is driving a step-change in power load growth — the tension between valuation pressure and structural demand revision is creating dispersion between regulated and merchant generators.`;
      if (dovish)
        return `Rate normalization is mechanically expanding utility multiples while AI-driven load growth reinforces the fundamental case — rate tailwind and structural demand revision together create a setup that outperforms on both relative and absolute valuation.`;
      return `AI-driven load growth is creating a structural demand step-up not captured in consensus grid forecasts — the mismatch between utility capex plans and data center build schedules is driving power price appreciation that benefits merchant generators disproportionately.`;

    case "Materials":
      if (stagfl)
        return `Stagflationary dynamics are supporting hard asset outperformance — commodity supply constraints are reinforcing pricing power for ${entity ?? "producers"} as demand uncertainty compresses equity breadth and drives capital toward inflation hedges.`;
      if (riskOff)
        return `Risk-off positioning is reducing the growth-demand premium in commodities — base metals are holding on supply-constraint fundamentals rather than demand expansion, with ${entity ?? "FCX"} absorbing the derisking better than industrial peers.`;
      return `Copper and base metals are responding to supply scarcity rather than demand growth — mine supply constraints are providing the primary pricing floor as the China PMI rebound provides a secondary demand catalyst that is still forming.`;

    case "Real Estate":
      if (hawkish)
        return `Leveraged commercial real estate is facing a refinancing cliff — loan maturities resetting into current yields are forcing asset sales and impairing bank book values, with the feedback loop between CRE values and credit availability accelerating.`;
      if (lead === "Data Centers")
        return `Data center REITs are compounding structural divergence within commercial real estate — ${entity ?? "EQIX and DLR"} are capturing AI-driven capacity demand while office REITs face secular vacancy headwinds that rate cuts alone cannot reverse.`;
      if (dovish)
        return `Rate normalization is mechanically compressing cap rates across the REIT complex — the most rate-sensitive segments are repricing fastest while office and mall REITs remain structurally impaired independent of the rate cycle.`;
      return `The REIT complex is bifurcating between AI-adjacent data centers with structural pricing power and rate-exposed commercial properties with secular vacancy — data center cap rate compression is masking broader portfolio-level deterioration.`;

    case "Communications":
      if (entity)
        return `${entity}'s AI-driven targeting improvements are compressing the valuation discount to big tech peers — ARPU re-acceleration and margin expansion are outpacing consensus and justifying multiple expansion in a sector that was previously de-rated.`;
      if (riskOff)
        return `Advertising budget caution in risk-off environments is compressing platform revenue outlook — the sector's high operating leverage means even modest ad spend reductions create outsized earnings pressure and rapid multiple compression.`;
      return `Digital advertising recovery is lifting platform revenue faster than consensus — AI-driven targeting efficiency is improving ARPU while streaming subscriber trajectory determines the free cash flow profile that underpins sector valuation.`;

    default:
      return `${sector.name}${align === "tailwind" ? " is in regime tailwind" : align === "headwind" ? " is navigating regime headwinds" : " is active"} — ${sector.signal_count} contributing ${sector.signal_count === 1 ? "story" : "stories"} with ${sector.top_entity ? `${sector.top_entity} leading sector positioning` : "cross-sector capital allocation in transition"}.`;
  }
}

// ── Cross-asset effects ───────────────────────────────────────────────────────

export function getCrossAssetEffects(
  sectorName: string,
  regime:     string | null,
): [string, string] {
  const hawkish = regime?.includes("Hawkish") ?? false;
  const dovish  = regime?.includes("Dovish")  ?? false;
  const riskOff = regime?.includes("Risk-Off") ?? false;
  const stagfl  = regime?.includes("Stagflation") ?? false;

  const map: Record<string, [string, string]> = {
    "Technology": [
      hawkish
        ? "Higher yields compress long-duration software multiples directly — each 50bps rate move reprices the sector's 6-7 year average duration before AI revenue growth can offset the valuation drag."
        : "Rate stability removes the primary multiple headwind — AI revenue momentum can translate into earnings-driven re-rating rather than fighting duration compression from yield repricing.",
      riskOff
        ? "Credit spread widening triggers growth-to-value rotation that compresses Technology relative to defensives — the premium multiple is the first casualty in risk-off derisking."
        : "USD strength reduces overseas revenue conversion, creating a systematic earnings headwind for globally-exposed mega-cap franchises that compounds rate sensitivity.",
    ],
    "Financials": [
      hawkish
        ? "Steeper curves mechanically expand NIM — each 10bps of curve steepening translates into measurable deposit franchise value and EPS revision upside for rate-sensitive bank earnings."
        : "Curve inversion is the primary NIM constraint — bank earnings growth is capped until short-end rates fall faster than long yields, limiting the carry that underpins deposit profitability.",
      riskOff
        ? "Credit spread widening simultaneously increases loan loss provisions and freezes capital markets activity — both earnings streams compress in parallel with limited offset from loan book growth."
        : "IG spread compression increases deal flow for M&A advisory and DCM — capital markets fee income adds diversification to NIM-driven earnings and is the upside lever for investment banks.",
    ],
    "Energy": [
      stagfl || hawkish
        ? "Oil strength reinforces CPI breakeven expectations, reducing the probability of near-term rate cuts and sustaining the stagflationary commodity premium that keeps Energy in rotation over duration assets."
        : "Oil price direction is the primary transmission to inflation expectations — Energy leadership amplifies breakeven widening and reduces the probability of rate relief, tightening financial conditions broadly.",
      "Commodity FX (CAD, NOK, AUD) appreciates with crude — Energy outperformance creates parallel FX carry opportunities and signals a macro environment supportive for commodity over financial assets.",
    ],
    "Industrials": [
      "Freight pricing and utilization are leading indicators of industrial demand — Industrials strength typically precedes broader cyclical earnings revision by one to two quarters.",
      riskOff
        ? "Government procurement provides a demand floor decoupled from private capex cycles — Industrials' beta to risk-off is structurally lower than market, providing partial portfolio hedge."
        : "Infrastructure fiscal stimulus converts directly into order book revenue — fiscal-driven capex has longer duration than private investment cycles, providing earnings visibility that reduces equity risk premium.",
    ],
    "Healthcare": [
      "FDA binary events create asymmetric positioning opportunities — approval catalysts compress implied vol and create sector-specific moves uncorrelated with macro risk factors.",
      dovish
        ? "Rate normalization reduces biotech discount rates, making pipeline cash flows more valuable and reopening capital markets for pre-revenue drug assets that are currently funding-constrained."
        : "High discount rates are compressing early-stage biotech valuations and closing capital markets for unproven pipelines — returns are concentrating in commercial-stage assets with near-term cash flow.",
    ],
    "Consumer": [
      "Real wage growth relative to CPI is the primary determinant of discretionary versus staples rotation — this spread is the single variable most predictive of Consumer sub-sector relative performance.",
      hawkish
        ? "Rising credit costs reduce revolving balance availability — delinquency rate acceleration shows up 3-6 months before retail revenue deteriorates, making credit metrics the leading warning signal."
        : "Credit availability and consumer confidence are tracking together above levels that historically precede retail downturns — the spending velocity supports discretionary over staples positioning.",
    ],
    "Utilities": [
      dovish
        ? "Rate normalization expands utility multiples through cap rate compression — each 25bps rate cut mechanically re-rates the regulated utility complex, making it a high-beta play on the Fed pivot."
        : "Long-end yield elevation directly compresses regulated utility multiples — the rate sensitivity is mechanical, with each 50bps of 10Y yield increase translating into an 8-12% sector de-rating.",
      "AI data center PPAs are creating power demand that outpaces grid planning assumptions — the build schedule mismatch is driving power price volatility that disproportionately benefits merchant generators.",
    ],
    "Materials": [
      stagfl
        ? "Stagflationary commodity strength transmits into materials margins — hard asset outperformance reinforces inflation expectations in a feedback loop that compresses near-term rate-cut probability."
        : "Global manufacturing PMI is the primary demand driver for base metals — Materials strength signals industrial re-acceleration and is typically followed by broader cyclical earnings revision.",
      "USD direction creates a direct commodity price headwind — a 1% dollar appreciation mechanically compresses commodity prices, narrowing producer margins even without underlying demand deterioration.",
    ],
    "Real Estate": [
      hawkish
        ? "Cap rate expansion compresses REIT NAV and transmits to bank balance sheets through loan book markdowns — the CRE repricing credit channel creates tightening impulses beyond the direct equity impact."
        : "Rate cycle normalization expands REIT valuation through mechanical cap rate compression — the sector has asymmetric positive beta to each Fed rate cut relative to other equity duration alternatives.",
      "Office vacancy transmission to bank CRE loan quality is accelerating as maturities reset — the commercial vacancy-to-bank credit quality feedback loop is the key systemic risk channel.",
    ],
    "Communications": [
      "Digital advertising is a high-beta proxy for corporate confidence — ad budget contractions in earnings downturns typically lead broad market risk-off positioning by one to two quarters.",
      riskOff
        ? "Platform ad revenue declines rapidly in risk-off because marketing is the first discretionary spend cut — the sector's earnings sensitivity to macro is higher than its reported beta implies."
        : "Streaming ARPU and subscriber growth determine content reinvestment cycles — FCF allocation between buybacks and content spend is the primary valuation driver in platform maturation.",
    ],
  };

  return map[sectorName] ?? [
    `${sectorName} leadership has cross-asset implications for credit and equity positioning in correlated sectors.`,
    "Monitor macro regime shifts that could alter the sector's relative performance against duration and commodity alternatives.",
  ];
}

// ── Risk factors ──────────────────────────────────────────────────────────────

export function getRiskFactors(
  sectorName: string,
  regime:     string | null,
): [string, string] {
  const hawkish = regime?.includes("Hawkish") ?? false;
  const dovish  = regime?.includes("Dovish")  ?? false;
  const riskOff = regime?.includes("Risk-Off") ?? false;

  const map: Record<string, [string, string]> = {
    "Technology": [
      hawkish
        ? "Rate re-acceleration beyond consensus terminal would create non-linear multiple compression in long-duration software — the sector's duration makes it the most vulnerable segment to any CPI upside surprise."
        : "If rates reprice materially higher, long-duration software multiples face non-linear compression that growth-to-value rotation amplifies — AI revenue forecasts would need to accelerate to offset even a modest yield move.",
      "Advanced AI chip export control escalation would fracture the hyperscaler supply chain — reducing GPU capex visibility and triggering earnings cuts that cascade from hardware into cloud infrastructure and software.",
    ],
    "Financials": [
      "CRE loan defaults triggering bank balance sheet impairment would accelerate credit tightening beyond what policy can engineer — regional banks with concentrated CRE exposure face the most acute risk.",
      hawkish
        ? "Curve re-inversion from a front-end rate hike would reverse NIM expansion and undermine the primary earnings driver — the bull case is directly predicated on curve steepening persisting."
        : "Rate cuts accelerating beyond consensus would compress NIM faster than loan growth can offset — the NIM tailwind supporting earnings revision would reverse into a structural headwind within two quarters.",
    ],
    "Energy": [
      "OPEC+ compliance breakdown from a high-cost producer needing cash flow would unwind supply discipline — the market could shift from undersupply to surplus within a single quarter, collapsing the free cash flow premium.",
      riskOff
        ? "Monetary-tightening-driven demand destruction would weaken crude faster than supply discipline can compensate — Energy's correlation to recession probability is the primary near-term risk."
        : "China demand disappointment from property sector deflation would remove the primary commodity demand growth driver — the Energy thesis requires Chinese industrial activity to stabilize for the premium to hold.",
    ],
    "Industrials": [
      "Corporate capex cycle reversal from earnings pressure would thin order books with a 6-9 month lag — backlogs would begin compressing before revenue deterioration becomes visible in reported results.",
      riskOff
        ? "Risk-off derisking compresses credit for private infrastructure projects — synchronized public and private capex contraction would create a sharper revenue downside than historical cycles suggest."
        : "Supply chain disruptions in critical components could shift the sector from pricing power to cost headwind — the margin impact would arrive faster than price increases can be passed through the order book.",
    ],
    "Healthcare": [
      "Drug pricing legislation expansion or accelerated Medicare direct negotiation would structurally impair sector earnings power — the political risk is underpriced relative to the earnings exposure.",
      "A high-profile Phase III pipeline failure would reset the thematic and reprice adjacent pipeline assets — binary FDA events create correlated sector drawdowns disproportionate to the individual company event.",
    ],
    "Consumer": [
      hawkish
        ? "Delinquency rate acceleration signals credit availability is contracting faster than income growth — spending would decelerate sharply once revolving credit utilization peaks and banks tighten underwriting."
        : "Real wage growth reversal from inflation re-acceleration would erode the income support sustaining current spending levels — the consumer cycle is more fragile to inflation resurgence than to labor market softening.",
      "Inventory overhang and markdown cycles at major retailers would signal over-ordering and compress margins broadly — the channel inventory-to-revenue recognition lag creates a 6-9 month earnings headwind.",
    ],
    "Utilities": [
      hawkish || !dovish
        ? "A 10Y yield repricing above 5% would compress utility multiples by 15-20% mechanically — rate sensitivity is immediate and non-linear, with limited earnings growth to offset the valuation re-rating."
        : "Regulatory disallowances on rate case recovery would compress returns on equity below cost of capital — adverse regulatory decisions are underappreciated risk given the sector's current capex expansion cycle.",
      "Hyperscaler AI capex slowdown or data center build delays would reduce the power demand growth story sustaining utility multiples above historical norms — the structural demand premium is fully priced and any downward revision removes the valuation support.",
    ],
    "Materials": [
      "China property sector deterioration beyond current consensus would reduce steel, copper, and aluminum demand — Materials is the highest-beta GICS sector to Chinese infrastructure spending.",
      "USD appreciation from rate divergence between the Fed and ECB would mechanically compress dollar-denominated commodity prices — currency headwind erodes producer margins in dollar terms even without underlying demand deterioration.",
    ],
    "Real Estate": [
      hawkish
        ? "Office loan maturities resetting into current rate levels are forcing distressed asset sales — price discovery from forced dispositions would impair bank loan book values and trigger CRE credit tightening."
        : "Rate volatility is a larger risk than rate level — cap rate uncertainty prevents buyers from pricing assets, freezing transaction volume and creating NAV discount uncertainty even as average rates moderate.",
      "Structural work-from-home permanence is impairing office demand independent of the rate cycle — the equity cushion in CMBS senior tranches is thinner than rated, and CRE value corrections accelerate bank write-down timelines.",
    ],
    "Communications": [
      "Digital advertising budget contractions in a corporate earnings downturn would create rapid and correlated revenue compression across platforms — high operating leverage amplifies the earnings sensitivity non-linearly.",
      riskOff
        ? "Platform ad revenue declines in risk-off environments are faster than consensus anticipates — corporate marketing is the first discretionary spend cut, and the revenue impact hits within one to two quarters."
        : "Content cost inflation and streaming churn acceleration could compress free cash flow margins simultaneously — the return-on-content-investment cycle is compressing as competing platforms bid up talent and IP rights.",
    ],
  };

  return map[sectorName] ?? [
    `${sectorName} faces regime-driven risks from macro shifts that could reduce sector leadership and capital allocation.`,
    "Monitor cross-sector rotation signals for evidence of positioning reversal away from current leadership.",
  ];
}

// ── Key drivers ───────────────────────────────────────────────────────────────

export function getKeyDrivers(
  sector:           SectorIntelligence,
  sectorIndustries: IndustrySignal[],
  sectorClusters:   StoryCluster[],
): string[] {
  const seen    = new Set<string>();
  const drivers: string[] = [];

  function add(item: string) {
    const key = item.trim().toUpperCase();
    if (!seen.has(key) && item.trim().length > 0) {
      seen.add(key);
      drivers.push(item.trim());
    }
  }

  // 1. Sector's headline entity
  if (sector.top_entity) add(sector.top_entity);

  // 2. Known sector entities from cluster affected_entities (filtered for quality)
  const sectorEntitySet = new Set((SECTOR_ENTITIES[sector.name] ?? []).map(e => e.toUpperCase()));
  const freq: Record<string, number> = {};
  for (const cluster of sectorClusters) {
    for (const entity of cluster.primary.affected_entities.slice(0, 4)) {
      const k = entity.toUpperCase();
      if (sectorEntitySet.has(k)) freq[k] = (freq[k] ?? 0) + 1;
    }
  }
  Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .forEach(([key]) => {
      const orig = sectorClusters
        .flatMap(c => c.primary.affected_entities)
        .find(e => e.toUpperCase() === key);
      if (orig) add(orig);
    });

  // 3. Top 2 industry names (abbreviated)
  sectorIndustries.slice(0, 2).forEach(ind => {
    const label = INDUSTRY_ABBREV[ind.name] ?? ind.name.split(" ")[0];
    add(label);
  });

  // 4. Thematic macro drivers (up to 3)
  (THEMATIC_DRIVERS[sector.name] ?? []).slice(0, 3).forEach(add);

  return drivers.slice(0, 8);
}

// ── Cluster filtering ─────────────────────────────────────────────────────────

export function filterSectorClusters(
  clusters:   StoryCluster[],
  sectorName: string,
  limit       = 4,
): StoryCluster[] {
  const entitySet = new Set((SECTOR_ENTITIES[sectorName] ?? []).map(e => e.toUpperCase()));
  const keywords  = SECTOR_KEYWORDS[sectorName] ?? [];

  return clusters
    .map(cluster => {
      let score = 0;
      const item  = cluster.primary;
      const label = (cluster.theme_label ?? "").toLowerCase();

      for (const entity of item.affected_entities) {
        if (entitySet.has(entity.toUpperCase())) { score += 3; break; }
      }
      for (const kw of keywords) {
        if (label.includes(kw)) { score += 1; break; }
      }

      return { cluster, score: score * (1 + cluster.cluster_score * 0.1) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ cluster }) => cluster);
}

// ═══════════════════════════════════════════════════════════════════════════════
// INDUSTRY INTELLIGENCE DEPTH — Live Developments · Leadership · Positioning
// ═══════════════════════════════════════════════════════════════════════════════

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LiveDevelopment {
  text: string;
  type: "live" | "macro" | "structural" | "risk";
}

export interface LeadershipDynamics {
  leaders:     string[];
  laggards:    string[];
  improving:   string[];
  state:       "accelerating" | "broadening" | "stabilizing" | "rotating" | "narrowing" | "consolidating";
  explanation: string;
}

export interface PositioningNarrative {
  bull:      string;
  bear:      string;
  watchFor:  string;
}

export type MomentumState =
  | "accelerating" | "broadening" | "stabilizing"
  | "fading"       | "reversing"  | "consolidating";

// ── Momentum state ────────────────────────────────────────────────────────────

export function getMomentumState(
  sectorIntel: SectorIntelligence | null,
  indSignals:  IndustrySignal[],
): MomentumState {
  if (!sectorIntel) return "consolidating";
  const score   = sectorIntel.signal_score;
  const align   = sectorIntel.regime_alignment;
  const active  = indSignals.filter(s => s.signal_score > 20).length;
  const bearish = sectorIntel.impact_sentiment === "bearish";
  if (align === "headwind" && score < 25) return "reversing";
  if (align === "headwind")               return "fading";
  if (bearish && align !== "tailwind")    return "fading";
  if (align === "tailwind" && score >= 70 && active >= 3) return "accelerating";
  if (align === "tailwind" && active >= 2)                return "broadening";
  if (align === "tailwind" && score >= 40)                return "stabilizing";
  return "consolidating";
}

// ── Live developments data ────────────────────────────────────────────────────

interface IndustryDevelopmentSet {
  structural: string[];
  hawkish:    string[];
  risk_off:   string[];
  tailwind:   string[];
  headwind:   string[];
}

const INDUSTRY_DEVELOPMENTS: Record<string, IndustryDevelopmentSet> = {
  semiconductors: {
    structural: [
      "AI server demand driving supplier capex acceleration — leading-edge node commitments extending into 2026",
      "Export controls widening earnings divergence between domestic and China-exposed chipmakers",
      "DRAM pricing stabilization improving memory sector outlook after prolonged inventory correction",
      "Foundry pricing power strengthening at advanced nodes as trailing-edge overcapacity normalizes",
      "Hyperscaler custom silicon programs expanding — ASIC displacement adding incremental competitive pressure on merchant GPU",
      "Advanced packaging bottleneck emerging as next supply constraint — CoWoS and HBM allocation extending lead times",
      "Power efficiency becoming a competitive differentiator as data center energy costs accelerate",
      "Equipment makers benefiting from leading-edge capacity expansion — ASML EUV and advanced deposition backlog building",
    ],
    hawkish: [
      "Yield headwinds compressing EDA software and IP licensing multiples despite hardware earnings resilience",
      "Rate environment widening quality spread between AI-exposed earners and legacy analog/DRAM names",
    ],
    risk_off: [
      "Flight to earnings certainty narrowing leadership to AI hardware anchors with multi-quarter revenue visibility",
      "Risk-off derisking reducing speculative exposure in high-beta advanced-node plays with China-exposure overhang",
    ],
    tailwind: [
      "Regime tailwind amplifying AI capex narrative — earnings revision cycle broadening from GPU to CoWoS packaging suppliers",
      "Multiple expansion extending into mid-cap semi names as AI demand breadth widens beyond mega-cap beneficiaries",
    ],
    headwind: [
      "Regime headwind compressing sector multiples — capital rotating from growth semis toward value alternatives",
      "China revenue risk resurfacing — export restrictions creating earnings visibility discount for exposed names",
    ],
  },
  software: {
    structural: [
      "Enterprise cybersecurity budgets proving non-discretionary — identity and cloud-native security accelerating as broader SaaS faces vendor consolidation",
      "AI co-pilot integration accelerating NRR in platforms with embedded workflows — displacing standalone productivity tools",
      "SaaS vendor consolidation compressing valuations for single-product specialists as CIOs reduce vendor count",
      "Cloud ARR growth decelerating across mid-tier SaaS — seat-based to consumption-based transitions creating revenue lumpiness",
      "Agentic AI reshaping enterprise workflow pricing — consumption models replacing per-seat licensing at the margin",
      "Security platform vendors consolidating wallet share as CISO budgets prioritize platform over point solutions",
    ],
    hawkish: [
      "Rate pressure creating valuation drag on long-duration ARR multiples — FCF compression most acute in Rule of 40 underperformers",
      "High discount rates pulling capital away from pre-profitability growth software toward FCF compounders",
    ],
    risk_off: [
      "IT budget freeze risk rising — procurement timelines lengthening as enterprise CFOs delay discretionary software approvals",
      "Risk-off compressing growth software multiples ahead of actual fundamental deterioration — positioning reduction precedes revenue",
    ],
    tailwind: [
      "Rate stability removing the primary multiple headwind — AI integration revenue translating into earnings-driven re-rating",
      "Cloud consumption recovery above seasonal trend sustaining infrastructure software demand above consensus",
    ],
    headwind: [
      "Multiple compression accelerating for growth software — valuation normalization ongoing as rate headwinds dominate AI narrative",
      "Enterprise IT spend scrutiny intensifying — contract renewal rates and expansion ARR the key indicators to watch",
    ],
  },
  "aerospace-defense": {
    structural: [
      "NATO 2% GDP commitment expansion creating multi-year procurement acceleration across European allied nations",
      "Defense backlog-to-revenue coverage above 12 months compressing near-term earnings risk for prime contractors",
      "Drone and counter-drone capabilities entering standard military procurement at accelerating pace",
      "Hypersonic defense and directed energy programs entering full-rate production — LMT and RTX primary beneficiaries",
      "European rearmament creating contract flow for U.S. primes as EU domestic defense industrial capacity proves insufficient",
      "Space defense modernization accelerating — NRO and MDA satellite programs expanding outside traditional DoD baseline",
      "Munitions production capacity constraints becoming strategic priority — multi-year production rate increase contracts being awarded",
    ],
    hawkish: [
      "Rising debt servicing costs creating NDAA budget trade-off tension — readiness vs modernization priorities under fiscal pressure",
      "Strong dollar compressing overseas defense export revenue translation for U.S. primes with international sales",
    ],
    risk_off: [
      "Risk-off rotation amplifying countercyclical defense positioning — government backlog providing earnings certainty cyclicals cannot match",
      "Geopolitical escalation risk reinforcing demand for U.S. air defense, munitions, and C4ISR systems",
    ],
    tailwind: [
      "Regime tailwind amplifying defense order book expansion — capital rotating toward government-contract-backed earnings",
      "Bipartisan NDAA support reducing political execution risk for multi-year procurement modernization programs",
    ],
    headwind: [
      "Continuing resolution environment delaying new program starts and slowing award timelines for prime contractors",
      "Cost-plus contract margin pressure from inflation pass-through disputes — fixed-price development programs most exposed",
    ],
  },
  energy: {
    structural: [
      "OPEC+ production discipline sustaining crude above U.S. shale marginal cost — free cash flow conversion above 5-year average",
      "LNG export capacity additions creating multi-year supply advantage — European re-gasification demand sustaining contract premium",
      "Permian Basin operators moderating activity in favor of capital return over volume growth — discipline supporting price floor",
      "Natural gas price recovery from oversold levels improving upstream economics across dry-gas basins",
      "Refinery utilization running above 90% — crack spread resilience supporting integrated producer free cash flow",
      "Energy transition capex competing with shareholder return programs for allocation — discipline vs growth tension building",
    ],
    hawkish: [
      "Oil price elevation sustaining CPI breakeven expectations — Energy outperformance reinforcing the higher-for-longer narrative",
      "Commodity currencies (CAD, NOK) strengthening alongside crude — FX carry trade amplifying Energy positioning",
    ],
    risk_off: [
      "Risk-off compressing demand premium in crude — Energy correlating with risk assets despite supply discipline holding",
      "Demand destruction risk from monetary tightening weakening crude faster than OPEC+ discipline can compensate",
    ],
    tailwind: [
      "Demand recovery narrative supporting crude positioning — global air travel and industrial activity trending above consensus",
      "Free cash flow yield at current prices sustaining capital return program sustainability and buyback acceleration",
    ],
    headwind: [
      "Demand softness risk materializing in refinery throughput data — crack spread compression the leading indicator",
      "China industrial PMI weakness removing the primary commodity demand growth driver from the supply-demand balance",
    ],
  },
  financials: {
    structural: [
      "Private credit managers capturing market share from banks retreating under Basel III endgame capital constraints",
      "Direct lending spreads above historic norms sustaining above-benchmark returns for BX, KKR, ARES AUM growth",
      "CRE office loan maturity wall accelerating — mark-to-market forcing regional bank balance sheet transparency",
      "Capital markets revenue normalizing — M&A advisory and DCM pipeline recovery building after multi-year trough",
      "Consumer credit delinquency rates rising — revolving balance growth slowing as high-rate environment constrains borrowers",
      "Deposit franchise competition intensifying — yield competition between banks and money market funds compressing margin",
    ],
    hawkish: [
      "NIM expansion under higher-for-longer driving earnings revision upgrades — asset repricing faster than liability cost reset",
      "Steeper yield curve mechanically widening bank spread income — EPS revision cycle in large-cap rate-sensitive banks",
    ],
    risk_off: [
      "Credit spread widening simultaneously increasing loan loss provisions and freezing capital markets activity",
      "Regional bank CRE exposure the acute stress point — mark-to-market losses accelerating potential loan book impairment",
    ],
    tailwind: [
      "IG credit spread compression increasing M&A advisory and leveraged finance deal flow — capital markets recovery accelerating",
      "Capital markets normalization adding fee income diversification to NIM-driven earnings",
    ],
    headwind: [
      "Rate cuts compressing NIM faster than loan growth can offset — primary earnings driver reversing into headwind",
      "Loan growth deceleration as tighter credit standards offset rate-driven demand improvement",
    ],
  },
  industrials: {
    structural: [
      "Infrastructure bill spending accelerating into active projects — order flow translating into multi-year backlog additions",
      "Nearshoring and friend-shoring manufacturing demand creating structural freight and industrial demand above prior cycle",
      "AI-adjacent physical automation adoption accelerating as labor cost pressure crosses ROI deployment threshold",
      "Defense procurement providing countercyclical demand floor as private capex cycle shows early deceleration indicators",
      "Freight volumes stabilizing above inventory destocking lows — trucking pricing showing early recovery signals",
      "Equipment lead times normalizing from supply chain disruption highs — capex cycle entering efficiency optimization phase",
    ],
    hawkish: [
      "Financing costs compressing private infrastructure project economics — government-funded projects becoming primary demand driver",
      "Higher-for-longer compressing NPV of long-duration private infrastructure projects competing for institutional capital",
    ],
    risk_off: [
      "Private capex deceleration risk materializing in industrial order data — defense backlog cushioning cyclical downside",
      "Freight PMI contraction signaling early-cycle demand softness — logistics and transportation names most exposed",
    ],
    tailwind: [
      "Infrastructure fiscal stimulus converting directly into order book revenue — backlog building above 12-month coverage",
      "Reshoring capital spending cycle creating sustained industrial equipment demand beyond typical cyclical duration",
    ],
    headwind: [
      "PMI contraction compressing order flow — freight and machinery names absorbing volume deceleration ahead of capital goods",
      "Supply chain normalization removing the pricing power tailwind for components and raw materials pass-through",
    ],
  },
  consumer: {
    structural: [
      "Spending bifurcation between value channels and luxury deepening — mid-market retail most exposed to the squeeze",
      "E-commerce market share consolidation continuing — AMZN and COST capturing disproportionate wallet gains",
      "Travel and experiential spending maintaining above-trend allocation as goods spending normalizes post-cycle",
      "Consumer credit utilization at cycle-high levels — revolving balances and delinquency rates rising in tandem",
      "Private label penetration accelerating across all categories as consumers trade down in search of value",
      "Restaurant and foodservice spending softening — discretionary dining the first category to show income constraint",
    ],
    hawkish: [
      "Credit card rates above 20% compressing revolving balance growth — debt service burden at historical highs",
      "Real wage growth decelerating as service sector inflation proves sticky — spending velocity increasingly at risk",
    ],
    risk_off: [
      "Consumer confidence surveys deteriorating ahead of actual spending data — confidence typically leads spending by 2-3 months",
      "Big-ticket discretionary purchases softening — appliances, auto, and home improvement cycle most exposed",
    ],
    tailwind: [
      "Real wage growth sustaining spending velocity above historical trend — labor market resilience the primary consumer support",
      "Savings cushion providing consumption runway above current income — buffer consuming but not yet exhausted",
    ],
    headwind: [
      "Credit tightening reducing revolving availability — spending decelerates sharply once utilization peaks and banks restrict underwriting",
      "Income pressure concentrating at lower-income segment — bifurcation widening between value and premium channel performance",
    ],
  },
  healthcare: {
    structural: [
      "GLP-1 platform broadening beyond obesity — cardiovascular, sleep apnea, and NASH indications expanding addressable market",
      "IRA Medicare price negotiation expanding — drug pricing ceiling uncertainty maintaining valuation discount on branded pharma",
      "FDA accelerated approval calendar dense — binary event risk elevated for mid-cap biotech names through multiple quarters",
      "AI drug discovery partnerships accelerating — big pharma R&D cost efficiency improving for early-stage development",
      "Biosimilar competition intensifying for blockbuster biologics — ABBV and AMGN managing revenue cliff transitions with next-gen launches",
      "Medical device procedure volumes recovering — surgical robotics and minimally invasive procedures driving ISRG demand above trend",
    ],
    hawkish: [
      "High discount rates suppressing biotech capital market access — pre-revenue development-stage companies funding constrained",
      "Pipeline valuation compression making strategic M&A more attractive for cash-rich large pharma acquirers",
    ],
    risk_off: [
      "Healthcare rotating to defensive allocation — dividend sustainability and pricing inelasticity attracting capital from cyclicals",
      "Drug pricing policy risk rising in risk-off political environment — IRA expansion concerns resurface",
    ],
    tailwind: [
      "Rate normalization reopening biotech capital markets — development-stage drug assets repricing toward fair value",
      "Defensive healthcare allocation sustaining multiple support as sector benefits from flight to earnings durability",
    ],
    headwind: [
      "Drug pricing legislation risk compressing pharma multiples — policy uncertainty maintaining institutional positioning caution",
      "Pipeline failure risk elevated during high-activity FDA calendar — binary events creating correlated sector volatility",
    ],
  },
  "real-estate": {
    structural: [
      "Data center REIT structural divergence from broader complex — AI-driven colocation demand creating pricing power absent from traditional assets",
      "Office REITs facing secular vacancy headwinds that rate cuts alone cannot reverse — bifurcation within real estate accelerating",
      "CMBS senior tranche credit quality deteriorating — forced asset dispositions creating price discovery below stated NAV",
      "Industrial logistics REIT demand normalizing after e-commerce overshoot — rent growth moderating from peak cycle levels",
      "Multifamily supply wave peaking in Sun Belt markets — occupancy and rent growth headwinds extending through 2025",
      "Data center capacity constraints creating structural pricing power for EQIX and DLR independent of rate environment",
    ],
    hawkish: [
      "Cap rate expansion compressing REIT NAV — refinancing cliff accelerating as office and retail maturities reset at current yields",
      "Office loan impairment transmitting through regional bank balance sheets — CRE-bank feedback loop tightening credit",
    ],
    risk_off: [
      "REIT defensive allocations concentrating in data centers — traditional commercial real estate exposed to cyclical demand risk",
      "Transaction market frozen as buyers and sellers cannot bridge cap rate expectations — price discovery delayed",
    ],
    tailwind: [
      "Rate normalization mechanically expanding REIT valuations — each 25bps rate cut creates measurable NAV expansion across the complex",
      "Industrial and logistics REIT demand recovering — reshoring supply chain investment creating structural occupancy support",
    ],
    headwind: [
      "Office vacancy acceleration compressing cash flows below debt service on leveraged properties — distressed disposition risk rising",
      "Rising cap rates compressing sector multiples — higher-for-longer the primary risk for leveraged real estate models",
    ],
  },
  crypto: {
    structural: [
      "Bitcoin ETF institutional flows creating structural demand separated from retail speculation cycle — AUM growing steadily",
      "Stablecoin regulatory framework advancing — U.S. federal legislation creating clearer operating parameters for issuers",
      "Ethereum layer-2 ecosystem activity growing — DeFi and institutional settlement use cases expanding transaction volume",
      "Mining economics improved post-halving — hash rate stability and energy cost optimization improving miner margins",
      "Crypto exchange institutional onboarding accelerating — COIN prime brokerage and custody volumes growing",
      "Corporate BTC treasury strategies expanding — MSTR model creating incremental institutional demand floor",
    ],
    hawkish: [
      "Rate environment compressing risk asset multiples including crypto — speculative positioning most vulnerable",
      "Dollar strength creating short-term headwind for dollar-denominated crypto appreciation and ETF inflow momentum",
    ],
    risk_off: [
      "BTC correlation to risk assets rising in acute risk-off events — digital gold narrative tested in synchronized selloffs",
      "Crypto mining stocks most vulnerable to risk-off derisking due to high operating leverage and energy cost sensitivity",
    ],
    tailwind: [
      "Liquidity expansion narrative supporting crypto alongside risk assets — BTC ETF demand amplifying cycle upside",
      "Halving cycle dynamics providing structural tailwind — post-halving supply reduction historically bullish over 12 months",
    ],
    headwind: [
      "Regulatory enforcement actions compressing exchange valuations and creating operational risk for U.S.-listed crypto companies",
      "Risk-off correlation risk — crypto inability to decouple from equities in stress limits institutional defensive allocation",
    ],
  },
  utilities: {
    structural: [
      "Data center power procurement creating multi-year nuclear PPA demand — CEG and VST capturing pricing power decoupled from regulation",
      "AI-driven load growth exceeding grid planning assumptions — power price volatility beneficial for merchant generators",
      "Grid modernization capex accelerating — distribution infrastructure investment cycle extending multi-year earnings visibility",
      "Nuclear relicensing and new build permitting progressing — small modular reactor regulatory framework developing",
      "Solar and wind capacity additions creating intermittency management challenges — peaker plant and storage economics improving",
      "Regulated utilities facing rate case scrutiny as capex plans expand — political resistance to consumer rate increases building",
    ],
    hawkish: [
      "10Y yield elevation mechanically compressing regulated utility multiples — each 50bps repricing creates 8-12% sector de-rating",
      "Dividend yield competition from Treasuries reducing income allocation to regulated utilities",
    ],
    risk_off: [
      "Defensive rotation increasing utility allocation — regulated utility dividend sustainability attracting risk-off institutional capital",
      "Power demand recession risk limited — utility earnings floor supported by non-cyclical residential and commercial consumption",
    ],
    tailwind: [
      "Rate normalization mechanically expanding utility multiples — each 25bps rate cut creates measurable multiple expansion",
      "AI data center power demand narrative providing structural re-rating above historical rate-sensitive multiple for merchant generators",
    ],
    headwind: [
      "Yield re-acceleration compressing regulated utility multiples in excess of AI narrative multiple support",
      "Data center build delay or hyperscaler capex reduction removing power demand premium from merchant generator valuations",
    ],
  },
  "media-telecom": {
    structural: [
      "Digital advertising ARPU re-acceleration as AI targeting efficiency improves conversion rates for META and GOOGL platforms",
      "Streaming consolidation reducing content cost competition — fewer bidders improving ROI on premium content investment",
      "Linear TV subscriber loss rate accelerating — cord-cutting creating margin pressure at CMCSA and DIS legacy businesses",
      "5G infrastructure capex cycle maturing — T and VZ reducing network investment, improving free cash flow generation",
      "Sports rights inflation compressing media company FCF as live sports bidding competition intensifies",
      "AI-generated content production costs compressing — long-term margin tailwind for platform content economics",
    ],
    hawkish: [
      "Corporate ad budget sensitivity to macro creating downside risk — marketing spend is the first discretionary enterprise cut",
      "Streaming price increases testing consumer elasticity — churn acceleration risk if real income continues to erode",
    ],
    risk_off: [
      "Platform ad revenue most exposed to corporate earnings downturn — revenue compression rapid and correlated across platforms",
      "Risk-off compressing content valuation multiples for DIS and streaming acquisition target assets",
    ],
    tailwind: [
      "Ad spend recovery lifting platform revenue faster than consensus — AI targeting creating ARPU uplift across META and GOOGL",
      "Streaming subscriber growth recovering as content quality investment delivers returns — Netflix trajectory the sector indicator",
    ],
    headwind: [
      "Advertising demand weakness compressing platform revenue — CPM pricing and impression volume both softening",
      "Content spending required to maintain engagement creating FCF tension with buyback programs",
    ],
  },
};

// ── Leadership data ───────────────────────────────────────────────────────────

interface LeadershipBase {
  leaders:     string[];
  laggards:    string[];
  improving:   string[];
  explanation: string;
}

interface LeadershipEntry extends LeadershipBase {
  risk_off?: Partial<LeadershipBase>;
  hawkish?:  Partial<LeadershipBase>;
  tailwind?: Partial<LeadershipBase>;
}

const LEADERSHIP_BY_INDUSTRY: Record<string, LeadershipEntry> = {
  semiconductors: {
    leaders:     ["NVDA", "AVGO", "TSM"],
    laggards:    ["INTC"],
    improving:   ["AMD", "MU"],
    explanation: "AI capex cycle concentrating gains at GPU infrastructure and advanced foundry while legacy x86 and trailing-node players digest inventory.",
    risk_off:    { leaders: ["NVDA", "TSM"], laggards: ["AMD", "MU", "INTC"], explanation: "Flight to earnings certainty narrowing leadership to AI hardware anchors — China-exposed and cyclical memory names underperforming." },
    hawkish:     { explanation: "Rate pressure widening quality spread — AI-exposed earners sustaining premium while legacy chip names face duration compression." },
    tailwind:    { improving: ["AMD", "MU", "QCOM"], explanation: "Favorable regime broadening semi participation beyond AI hardware core — memory and wireless semis recovering alongside GPU leaders." },
  },
  software: {
    leaders:     ["NOW", "PANW", "ORCL"],
    laggards:    ["SNOW", "ADBE"],
    improving:   ["CRM", "MSFT"],
    explanation: "Security and workflow automation consolidating wallet share as AI integration accelerates platform stickiness and NRR.",
    hawkish:     { leaders: ["PANW", "NOW", "ORCL"], laggards: ["SNOW", "WDAY"], explanation: "Rate headwinds widening valuation gap between FCF-positive platform vendors and growth-stage ARR names." },
    risk_off:    { leaders: ["PANW", "MSFT"], laggards: ["SNOW", "CRM"], explanation: "Risk-off compressing growth software multiples — non-discretionary security and productivity holding better than expansion ARR." },
    tailwind:    { improving: ["SNOW", "WDAY", "ADBE"], explanation: "Rate stability broadening software participation — growth-stage names recovering alongside proven FCF platform leaders." },
  },
  "aerospace-defense": {
    leaders:     ["LMT", "RTX", "NOC"],
    laggards:    ["BA"],
    improving:   ["GD", "HII", "KTOS"],
    explanation: "NATO procurement acceleration and geopolitical risk premium sustaining prime contractor order books — smaller defense tech gaining from drone and C4ISR programs.",
    risk_off:    { leaders: ["LMT", "NOC", "RTX"], explanation: "Risk-off amplifying countercyclical defense positioning — government backlog providing earnings certainty cyclicals cannot match." },
    tailwind:    { improving: ["GD", "HII", "KTOS", "GE"], explanation: "Favorable regime broadening participation beyond prime contractors — aerospace and defense tech sub-sectors gaining allocation." },
  },
  energy: {
    leaders:     ["XOM", "COP", "LNG"],
    laggards:    ["SLB", "HAL"],
    improving:   ["OXY", "CVX"],
    explanation: "Capital return discipline differentiating integrated majors from oilfield services — FCF yield sustainability is the primary positioning driver.",
    risk_off:    { leaders: ["XOM", "CVX"], laggards: ["SLB", "HAL", "COP"], explanation: "Risk-off concentrating Energy positioning in balance-sheet-strong integrated majors — services names absorbing cyclical demand risk." },
    tailwind:    { leaders: ["XOM", "COP", "OXY", "LNG"], improving: ["SLB", "HAL"], explanation: "Demand recovery expanding Energy leadership beyond defensive majors — E&P and services participation broadening." },
  },
  financials: {
    leaders:     ["BX", "KKR", "GS"],
    laggards:    ["BAC", "WFC"],
    improving:   ["AXP", "JPM", "MS"],
    explanation: "Alternative asset managers outperforming rate-sensitive banks as private credit AUM growth and capital-light fee income compound at superior returns.",
    hawkish:     { leaders: ["BX", "KKR", "JPM", "GS"], improving: ["AXP", "MS"], explanation: "Higher-for-longer sustaining NIM expansion at deposit-funded banks while alternatives benefit from elevated direct lending spreads." },
    risk_off:    { leaders: ["JPM"], laggards: ["BAC", "WFC", "GS", "MS"], explanation: "Risk-off compressing capital markets revenue — JPM's diversification and capital position providing relative defensive quality." },
  },
  industrials: {
    leaders:     ["LMT", "RTX", "HON"],
    laggards:    ["DE", "FDX"],
    improving:   ["CAT", "CSX", "UNP"],
    explanation: "Defense and process automation outperforming freight and agriculture — government-contract backlog and reshoring capex offsetting cyclical softness.",
    risk_off:    { leaders: ["LMT", "NOC", "RTX"], laggards: ["DE", "FDX", "UPS"], explanation: "Government-contract visibility providing countercyclical support — freight and machinery absorbing private capex deceleration." },
    tailwind:    { leaders: ["CAT", "HON", "CSX"], improving: ["ABB", "UPS"], explanation: "Infrastructure spending broadening industrial leadership beyond defense — reshoring and automation demand expanding sector participation." },
  },
  consumer: {
    leaders:     ["WMT", "COST", "AMZN"],
    laggards:    ["TGT", "NKE"],
    improving:   ["MCD", "SBUX"],
    explanation: "Value-channel retail and e-commerce capturing spending share as mid-market brands face bifurcation between value-seeking and luxury demand.",
    hawkish:     { leaders: ["WMT", "COST"], laggards: ["TGT", "TSLA", "NKE"], explanation: "Rate headwinds concentrating positioning in non-discretionary value channels — high-ticket discretionary most vulnerable." },
    tailwind:    { leaders: ["AMZN", "MCD", "TSLA"], improving: ["TGT", "SBUX", "NKE"], explanation: "Income resilience allowing spending recovery to broaden from value to discretionary — participation widening across consumer sub-sectors." },
  },
  healthcare: {
    leaders:     ["LLY", "ISRG", "AMGN"],
    laggards:    ["PFE", "BMY"],
    improving:   ["ABBV", "MRK", "UNH"],
    explanation: "GLP-1 platform and surgical robotics momentum separating structural growth stories from post-COVID pipeline and reimbursement headwind names.",
    risk_off:    { leaders: ["LLY", "AMGN", "UNH"], improving: ["JNJ", "ABBV"], explanation: "Defensive rotation concentrating in dividend-sustainable, pricing-inelastic pharma and managed care — pipeline speculation reduced." },
    tailwind:    { leaders: ["LLY", "ISRG", "AMGN"], improving: ["REGN", "MRNA", "ABBV"], explanation: "Rate normalization reopening biotech capital markets — pipeline assets repricing and broader healthcare participation improving." },
  },
  "real-estate": {
    leaders:     ["EQIX", "DLR", "AMT"],
    laggards:    ["VTR", "SPG"],
    improving:   ["PLD", "PSA"],
    explanation: "Data center REITs capturing AI-driven structural demand — digital infrastructure decoupling from the office/retail REIT derating cycle.",
    hawkish:     { leaders: ["EQIX", "DLR"], laggards: ["VTR", "SPG", "AVB"], explanation: "Rate headwinds narrowing REIT leadership to structural AI-demand stories — rate-sensitive residential and retail exposed." },
    tailwind:    { leaders: ["EQIX", "PLD", "AMT"], improving: ["PSA", "AVB"], explanation: "Rate normalization broadening REIT participation — industrial logistics and cell tower REITs recovering alongside data center leaders." },
  },
  crypto: {
    leaders:     ["BTC", "COIN"],
    laggards:    ["MARA", "RIOT"],
    improving:   ["MSTR", "SQ"],
    explanation: "Bitcoin spot ETF approval driving institutional demand while mining equities face margin compression from halving and energy costs.",
    risk_off:    { leaders: ["BTC"], laggards: ["MARA", "RIOT", "COIN"], explanation: "Risk-off concentrating crypto exposure in BTC itself — mining equities and exchanges most vulnerable to high-beta derisking." },
    tailwind:    { leaders: ["BTC", "COIN", "MSTR"], improving: ["MARA", "RIOT", "SQ"], explanation: "Liquidity expansion and BTC momentum broadening crypto participation — mining equities recovering alongside exchange volumes." },
  },
  utilities: {
    leaders:     ["CEG", "VST", "NEE"],
    laggards:    ["DUK", "SO"],
    improving:   ["AEP", "EXC", "PCG"],
    explanation: "Merchant generators capturing AI data center power premium — regulated utilities facing rate-sensitive multiple pressure versus nuclear PPA beneficiaries.",
    hawkish:     { leaders: ["CEG", "VST"], laggards: ["DUK", "SO", "D"], explanation: "Rate headwinds narrowing leadership to merchant generators with data center PPA revenue decoupled from regulated utility multiples." },
    tailwind:    { leaders: ["CEG", "VST", "NEE"], improving: ["AEP", "EXC"], explanation: "Rate normalization broadening utility participation — regulated names recovering alongside merchant generators as multiple compression reverses." },
  },
  "media-telecom": {
    leaders:     ["META", "GOOGL", "NFLX"],
    laggards:    ["DIS", "VZ"],
    improving:   ["TMUS", "CMCSA"],
    explanation: "Digital advertising platforms compounding ARPU gains from AI targeting — legacy media and telecom managing secular decline against content cost pressure.",
    risk_off:    { leaders: ["GOOGL", "META"], laggards: ["DIS", "NFLX", "VZ"], explanation: "Risk-off compressing content and streaming multiples — search and social ad platforms sustaining positioning on FCF resilience." },
    tailwind:    { leaders: ["META", "GOOGL", "NFLX"], improving: ["TMUS", "DIS"], explanation: "Ad market recovery broadening media sector participation — streaming and telecom recovering alongside platform ad revenue acceleration." },
  },
};

// ── Positioning data ──────────────────────────────────────────────────────────

interface PositioningEntry {
  bull:      string;
  bear:      string;
  watchFor:  string;
  hawkish?:  { bull: string; bear: string };
  risk_off?: { bull: string; bear: string };
}

const POSITIONING_BY_INDUSTRY: Record<string, PositioningEntry> = {
  semiconductors: {
    bull:     "Hyperscaler capex commitments provide multi-quarter revenue visibility that makes the AI hardware cycle structurally more durable than prior semiconductor cycles. Advanced packaging constraints and HBM allocation are extending supply scarcity into 2026, sustaining NVDA and AVGO pricing power.",
    bear:     "Export control escalation targeting advanced packaging or HBM memory would rapidly compress earnings visibility — the market has not fully priced restrictions extending to equipment and EDA tooling. Any hyperscaler capex guidance reduction would cascade through the full supply chain within two quarters.",
    watchFor: "TSMC quarterly capacity utilization, hyperscaler capex guidance (MSFT, GOOGL, AMZN), and any new BIS export control rules targeting packaging, memory, or EDA software.",
    hawkish:  { bull: "AI hardware earnings clarity insulates leading names from rate-driven multiple compression — NVDA and AVGO have near-term revenue visibility that reduces duration sensitivity relative to software peers.", bear: "Legacy semis with China-exposure overhang and without AI revenue clarity face both rate compression and geopolitical earnings risk — the quality spread between AI infrastructure and legacy names is widening non-linearly." },
  },
  software: {
    bull:     "Non-discretionary cybersecurity and AI productivity software provide spending inelasticity protecting top-line ARR from enterprise IT consolidation. Platform vendors with embedded workflows are capturing NRR expansion even as point solution vendors face displacement.",
    bear:     "Enterprise IT budget scrutiny is intensifying ahead of CIO survey data that would confirm deceleration — the sector has multiple-expanded on AI narrative that has not fully translated into consumption revenue or seat growth acceleration.",
    watchFor: "Cloud hyperscaler consumption revenue trends (MSFT Azure, AWS, GCP), CIO IT spending surveys, and Rule of 40 spread between revenue growth and FCF margin in earnings reports.",
    hawkish:  { bull: "FCF-positive platform vendors with proven ARR compounding sustaining institutional positioning despite rate headwinds — quality premium for proven software economics is widening.", bear: "Long-duration ARR multiples on pre-profitability growth software remain structurally exposed — any CPI upside surprise would trigger renewed valuation compression." },
  },
  "aerospace-defense": {
    bull:     "Multi-year NATO procurement commitments are converting geopolitical risk into visible order book expansion beyond 12 months — backlog coverage removes the earnings risk that typically drives cyclical sector de-rating.",
    bear:     "Continuing resolution environments delay new program starts and compound cost-plus margin disputes. Fixed-price development programs like NGAD and B-21 have cost overrun risk that would trigger congressional scrutiny and potential program restructuring.",
    watchFor: "NDAA markup and appropriations committee progress, NATO quarterly defense spending commitment data, and prime contractor quarterly backlog coverage ratios.",
  },
  energy: {
    bull:     "OPEC+ production discipline sustaining crude above U.S. shale marginal cost converts directly into free cash flow yield at current prices. Capital return programs at XOM, CVX, and COP are structured for multi-year sustainability even if WTI softens modestly.",
    bear:     "OPEC+ compliance breakdown from a high-cost producer needing cash flow would shift the market from undersupply to surplus within a quarter — the free cash flow premium would collapse rapidly. China demand disappointment from property sector deflation removes the primary growth driver.",
    watchFor: "Monthly OPEC+ production data vs quota, U.S. shale rig count trends, China industrial production and PMI for demand signal.",
  },
  financials: {
    bull:     "NIM expansion under higher-for-longer is compressing forward P/E and sustaining earnings revision cycles in rate-sensitive banks. Private credit managers are capitalizing on retreating bank capital markets capacity with above-benchmark returns structurally uncorrelated to liquid credit volatility.",
    bear:     "CRE office loan impairment is accelerating as maturities force mark-to-market — the feedback loop between CRE values and bank credit availability creates tightening dynamics beyond what Fed policy targets. M&A advisory recovery is priced before pipelines confirm execution.",
    watchFor: "Regional bank CRE reserve builds in quarterly results, investment grade credit spreads for capital markets recovery signal, and private credit manager fundraising pace.",
    hawkish:  { bull: "Curve steepening mechanically expands NIM at deposit-funded banks — earnings revision cycles in large-cap financials are directly driven by yield curve shape, and the bull case is arithmetically sound.", bear: "Curve re-inversion from a front-end rate hike would immediately reverse NIM expansion and undermine the primary earnings driver — the bull case is entirely contingent on curve slope persistence." },
  },
  industrials: {
    bull:     "Government infrastructure spending is extending order book visibility beyond 12 months with longer duration than private investment cycles — fiscal-driven capex provides earnings floor protection against cyclical deceleration. Reshoring manufacturing demand is a multi-year structural tailwind above prior cycle trend.",
    bear:     "Corporate capex cycle reversal from earnings pressure would thin order books with a 6-9 month lag — backlogs compress before revenue deterioration becomes visible in reported results. Freight PMI contraction is the earliest leading indicator.",
    watchFor: "Monthly ISM manufacturing PMI and new orders sub-index, quarterly freight volume data (trucking, rail), and infrastructure project award flow from USDOT.",
  },
  consumer: {
    bull:     "Real wage growth sustaining spending velocity above historical trend — labor market resilience and savings cushion extend the consumption runway beyond typical rate-tightening transmission timelines. Value-channel retailers and e-commerce are compounding share gains.",
    bear:     "Delinquency rate acceleration signals credit availability is contracting faster than income growth — spending would decelerate sharply once revolving credit utilization peaks and banks tighten underwriting standards.",
    watchFor: "Monthly revolving credit and delinquency rate data, real wage growth vs CPI delta, and consumer confidence surveys which typically lead spending by 2-3 months.",
  },
  healthcare: {
    bull:     "GLP-1 platform broadening into cardiovascular and NASH creates a multi-year revenue growth runway for LLY and NVO not fully captured in consensus. Healthcare earnings durability and pricing inelasticity compress downside risk relative to rate-sensitive cyclicals in a defensive rotation environment.",
    bear:     "Drug pricing legislation expansion or accelerated Medicare direct negotiation would structurally impair earnings power for the entire branded pharma sector. A high-profile Phase III pipeline failure in GLP-1 or an adjacent indication would reset thematic positioning and reprice correlated pipeline assets.",
    watchFor: "FDA PDUFA dates for GLP-1 indications (cardiovascular, NASH, sleep apnea), IRA drug pricing negotiation list expansion, and NVO/LLY quarterly volume guidance.",
  },
  "real-estate": {
    bull:     "Data center REITs are compounding structural divergence within commercial real estate — EQIX and DLR are capturing AI-driven capacity demand at improving rates while interest rate normalization mechanically expands NAV across the broader REIT complex.",
    bear:     "Office REIT loan maturities resetting at current rate levels are forcing distressed asset sales that will impair regional bank book values and trigger CRE credit tightening — the impairment cycle is still in early innings. CMBS equity cushions are thinner than rated.",
    watchFor: "Office REIT vacancy and same-store NOI trends, CMBS delinquency rates across property types, and regional bank CRE reserve commentary in quarterly earnings.",
    hawkish:  { bull: "Data center REITs have structural AI demand that partially insulates them from rate headwinds — colocation revenue growing faster than cap rate expansion is compressing NAV.", bear: "Cap rate expansion is compressing REIT NAV faster than AI narrative provides valuation support — leveraged commercial real estate is the most exposed sector to higher-for-longer." },
  },
  crypto: {
    bull:     "Bitcoin ETF approval has created a structural demand channel separated from the retail speculation cycle — institutional AUM growth and corporate treasury strategies provide a demand floor that prior cycles lacked. Post-halving supply reduction historically supports BTC appreciation over a 12-month window.",
    bear:     "BTC's correlation to risk assets in acute selloffs limits its utility as a portfolio hedge and reduces institutional defensive allocation. Regulatory enforcement actions targeting exchanges create operational risk for COIN and U.S.-listed crypto companies not priced at current multiples.",
    watchFor: "Monthly Bitcoin ETF AUM and flow data, U.S. stablecoin legislation progress, and SEC enforcement action signals for crypto exchanges.",
  },
  utilities: {
    bull:     "Nuclear PPA deals with data centers are creating a pricing mechanism that decouples merchant generator earnings from regulated utility multiples — CEG and VST have forward power price visibility that justifies premium valuations. AI-driven load growth is a structural demand step-up not in consensus grid forecasts.",
    bear:     "Hyperscaler AI capex slowdown or data center build delays would remove the power demand growth story sustaining merchant generator multiples. 10Y yield re-acceleration above 5% would compress regulated utility multiples by 15-20% mechanically.",
    watchFor: "Quarterly hyperscaler data center build announcements, nuclear relicensing and PPA deal flow, 10Y Treasury yield direction, and FERC power pricing data.",
    hawkish:  { bull: "Merchant generators with data center PPAs are structurally insulated from rate headwinds — power price revenue growing faster than rate-driven multiple compression.", bear: "Regulated utility multiples face mechanical compression from yield re-acceleration — the AI demand narrative cannot fully offset the de-rating for rate-sensitive regulated names." },
  },
  "media-telecom": {
    bull:     "AI-driven targeting efficiency is improving digital advertising ARPU and compressing the valuation discount that platforms carried relative to big tech — META and GOOGL are compounding revenue and margin simultaneously. Streaming consolidation is reducing content cost competition.",
    bear:     "Digital advertising budget contractions in a corporate earnings downturn would create rapid and correlated revenue compression across platforms — high operating leverage amplifies earnings sensitivity non-linearly. Linear TV cash flow deterioration is accelerating faster than streaming profitability can offset.",
    watchFor: "Monthly digital advertising CPM pricing trends, streaming subscriber and ARPU data from Netflix earnings (sector indicator), and corporate marketing budget surveys.",
  },
};

// ── getLiveDevelopments ───────────────────────────────────────────────────────

function clusterToDevelopment(cluster: StoryCluster): LiveDevelopment | null {
  // Prefer why_it_matters — LLM-generated, context-rich
  const why = cluster.primary.why_it_matters;
  if (why && why.length > 25) return { text: why, type: "live" };

  const label = cluster.theme_label;
  if (!label) return null;

  const entities = cluster.primary.affected_entities.slice(0, 2);
  const entityPart = entities.length > 0 ? ` — ${entities.join(", ")}` : "";
  const countPart  = cluster.story_count > 1 ? ` (${cluster.story_count} sources)` : "";
  return { text: `${label}${entityPart}${countPart}`, type: "live" };
}

export function getLiveDevelopments(
  slug:        string,
  sectorIntel: SectorIntelligence | null,
  indSignals:  IndustrySignal[],
  clusters:    StoryCluster[],
  regime:      string | null,
): LiveDevelopment[] {
  const entry   = INDUSTRY_DEVELOPMENTS[slug];
  const results: LiveDevelopment[] = [];

  // 1. Live cluster-derived developments (up to 3, most relevant)
  for (const cl of clusters.slice(0, 6)) {
    if (results.length >= 3) break;
    const dev = clusterToDevelopment(cl);
    if (dev) results.push(dev);
  }

  // 2. Regime-reactive macro items (2)
  if (entry) {
    const align   = sectorIntel?.regime_alignment ?? "neutral";
    const hawkish = regime?.includes("Hawkish")   ?? false;
    const riskOff = regime?.includes("Risk-Off")  ?? false;
    const regimeDev: string[] =
      riskOff              ? entry.risk_off  :
      hawkish              ? entry.hawkish   :
      align === "tailwind" ? entry.tailwind  :
      align === "headwind" ? entry.headwind  :
      [];
    for (const text of regimeDev.slice(0, 2)) {
      results.push({ text, type: "macro" });
    }
  }

  // 3. Structural items (fill to 10)
  if (entry) {
    const remaining = 10 - results.length;
    for (const text of entry.structural.slice(0, remaining)) {
      results.push({ text, type: "structural" });
    }
  }

  return results;
}

// ── getLeadershipDynamics ─────────────────────────────────────────────────────

export function getLeadershipDynamics(
  slug:        string,
  sectorIntel: SectorIntelligence | null,
  indSignals:  IndustrySignal[],
  regime:      string | null,
): LeadershipDynamics {
  const base    = LEADERSHIP_BY_INDUSTRY[slug];
  const score   = sectorIntel?.signal_score      ?? 0;
  const align   = sectorIntel?.regime_alignment  ?? "neutral";
  const active  = indSignals.filter(s => s.signal_score > 20).length;
  const hawkish = regime?.includes("Hawkish")    ?? false;
  const riskOff = regime?.includes("Risk-Off")   ?? false;

  const state: LeadershipDynamics["state"] =
    align === "headwind" && score < 30 ? "narrowing"    :
    align === "headwind"               ? "rotating"     :
    score >= 70 && active >= 3         ? "accelerating" :
    score >= 50 && active >= 2         ? "broadening"   :
    score >= 30                        ? "stabilizing"  :
    "consolidating";

  if (!base) return { leaders: [], laggards: [], improving: [], state, explanation: "Leadership data unavailable." };

  const override =
    riskOff ? base.risk_off :
    hawkish ? base.hawkish  :
    align === "tailwind" ? base.tailwind : null;

  return {
    leaders:     override?.leaders     ?? base.leaders,
    laggards:    override?.laggards    ?? base.laggards,
    improving:   override?.improving   ?? base.improving,
    state,
    explanation: override?.explanation ?? base.explanation,
  };
}

// ── getPositioningNarrative ───────────────────────────────────────────────────

export function getPositioningNarrative(
  slug:        string,
  sectorIntel: SectorIntelligence | null,
  regime:      string | null,
): PositioningNarrative {
  const entry   = POSITIONING_BY_INDUSTRY[slug];
  const hawkish = regime?.includes("Hawkish")  ?? false;
  const riskOff = regime?.includes("Risk-Off") ?? false;

  if (!entry) {
    const align = sectorIntel?.regime_alignment ?? "neutral";
    return {
      bull:     `Regime ${align === "tailwind" ? "tailwind is supporting" : "conditions are neutral for"} sector positioning.`,
      bear:     "Monitor for regime shifts that could accelerate rotation pressure.",
      watchFor: "Sector signal score and regime alignment direction.",
    };
  }

  const override = hawkish ? entry.hawkish : riskOff ? entry.risk_off : null;
  return {
    bull:     override?.bull  ?? entry.bull,
    bear:     override?.bear  ?? entry.bear,
    watchFor: entry.watchFor,
  };
}
