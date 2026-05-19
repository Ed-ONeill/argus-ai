/**
 * sectorIntelligence.ts — Pure functions for per-sector intelligence generation.
 *
 * Zero LLM calls. All output derived from existing FeedResponse fields via
 * deterministic templates and lookup tables. Functions are regime-aware.
 */

import type { SectorIntelligence, IndustrySignal, StoryCluster } from "./types";

// ── Entity and keyword maps ───────────────────────────────────────────────────

export const SECTOR_ENTITIES: Record<string, string[]> = {
  "Technology":     ["AAPL","MSFT","GOOGL","GOOG","META","NVDA","AMD","INTC","TSMC","AMZN","CRM","SNOW","NOW","WDAY","ASML","AVGO","QCOM","MU"],
  "Financials":     ["JPM","BAC","GS","MS","C","WFC","BLK","BX","KKR","AXP","V","MA","PYPL","SCHW","ARES","APO","OWL"],
  "Energy":         ["XOM","CVX","BP","SHEL","COP","SLB","HAL","OXY","VLO","MPC","LNG","CQP"],
  "Industrials":    ["GE","RTX","HON","CAT","DE","LMT","NOC","BA","GD","UPS","FDX","CSX","UNP","ABB"],
  "Healthcare":     ["JNJ","PFE","MRK","LLY","ABBV","BMY","UNH","CVS","CI","AMGN","GILD","REGN","MRNA","ISRG"],
  "Consumer":       ["WMT","TGT","COST","HD","LOW","MCD","SBUX","NKE","PG","KO","PEP","PM","MO","TSLA"],
  "Utilities":      ["NEE","DUK","SO","D","AEP","EXC","SRE","PCG","ED","CEG","VST"],
  "Materials":      ["FCX","NEM","APD","LIN","NUE","X","CLF","AA","ALB","CCJ","DD"],
  "Real Estate":    ["AMT","PLD","EQIX","SPG","PSA","AVB","EQR","VTR","ARE","DLR"],
  "Communications": ["GOOGL","META","NFLX","DIS","CMCSA","CHTR","T","VZ","TMUS"],
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
