"""
app/data/theme_ontology.py — Institutional-grade market theme ontology.

Phase 8: replaces the inline THEME_CATALOG with a curated ontology that
reflects how buy-side analysts frame market narratives — not AI news copy.

Each entry retains every key the extraction engine requires (keywords, entities,
related_industries, relationship_graph, etc.) and adds Phase 8 metadata:

  label               — institutional short name (how a PM would say it)
  description         — one-sentence thesis in sell-side register
  regime_affinity     — market regimes where this theme is most active
  competing_themes    — theme IDs that overlap; weaker theme is penalised
  generic_keywords    — subset of keywords that are broad single-word triggers
                        (used to compute generic-match ratio → confidence penalty)
  causal_inputs       — upstream themes / macro forces that drive this theme
  causal_outputs      — downstream themes / market consequences this drives
  confidence_floor    — minimum confidence below which theme is suppressed
  decay_rate          — persistence relevance weight (0.5 fast decay → 1.0 none)

No imports from app/ — this file must remain import-clean.
"""

from __future__ import annotations

THEME_ONTOLOGY: dict[str, dict] = {

    # ── 1 ────────────────────────────────────────────────────────────────────────
    "ai-energy-demand": {
        "label":       "Grid Bottleneck Trade",
        "name":        "Grid Bottleneck Trade",
        "description": (
            "AI data-centre buildout has created a structural capacity deficit in "
            "dispatchable power that cannot be resolved within the typical 3-5 year "
            "grid-upgrade cycle, generating sustained pricing power for merchant generators."
        ),
        "keywords": [
            "power demand", "data center", "ai infrastructure", "electricity demand",
            "grid load", "nuclear ppa", "power grid", "hyperscaler power",
            "ai power", "data center power", "gpu cluster", "compute power",
            "hyperscaler", "ai capex", "data centre", "ai compute", "power consumption",
            "energy demand", "electricity costs", "power contract", "capacity expansion",
            "nvidia ai", "microsoft ai", "google ai", "amazon ai", "meta ai",
            "ai model training", "inference demand", "ai spending", "ai investment",
            "renewable ppa", "grid capacity", "power grid upgrade", "electricity grid",
            "ai", "openai", "anthropic",
        ],
        "entities": frozenset({
            "NVDA", "MSFT", "GOOGL", "AMZN", "META", "CEG", "VST",
            "NEE", "EQIX", "DLR", "AEP", "EXC",
            "Nvidia", "Microsoft", "Google", "Alphabet", "Amazon", "Meta",
            "Constellation", "Vistra", "NextEra", "OpenAI", "Anthropic",
        }),
        "related_industries":    ["Semiconductors", "Software", "Utilities", "Energy", "Real Estate"],
        "related_assets":        ["NVDA", "CEG", "VST", "NEE", "EQIX"],
        "related_macro_factors": ["Power Load Growth", "AI Capex Supercycle", "Grid Capex", "Nuclear PPA"],
        "second_order_effects": [
            "PPA pricing power creates multi-year earnings visibility for independent power producers with structural premium over regulated peers",
            "Natural gas demand may rise as data centres require firm peaker capacity to backstop intermittent renewable supply",
            "Grid infrastructure equipment makers benefit from an accelerated capex cycle as utilities compete for hyperscaler anchor contracts",
            "Higher electricity costs create unit-economics pressure for compute-intensive AI inference workloads at scale",
            "The power constraint is structurally bullish for nuclear — the only zero-carbon dispatchable baseload option at scale",
        ],
        "podcast_topics": ["Tech / AI", "Markets"],
        "relationship_graph": {
            "Semiconductors": {"weight": 0.95, "type": "direct",        "direction": "positive"},
            "Software":       {"weight": 0.88, "type": "direct",        "direction": "positive"},
            "Utilities":      {"weight": 0.85, "type": "indirect",      "direction": "positive"},
            "Energy":         {"weight": 0.58, "type": "macro_overlap", "direction": "positive"},
            "Real Estate":    {"weight": 0.48, "type": "indirect",      "direction": "positive"},
        },
        # Phase 8
        "regime_affinity":   ["Risk-On Neutral", "Risk-On Dovish"],
        "competing_themes":  ["nuclear-power-renaissance", "semiconductor-capex-cycle",
                              "ai-compute-arms-race", "data-center-buildout", "hyperscaler-capex"],
        "generic_keywords":  ["ai", "openai", "anthropic"],
        "causal_inputs":     ["semiconductor-capex-cycle", "hyperscaler-capex", "ai-compute-arms-race"],
        "causal_outputs":    ["nuclear-power-renaissance", "data-center-buildout", "grid-modernization"],
        "confidence_floor":  15,
        "decay_rate":        0.85,
    },

    # ── 2 ────────────────────────────────────────────────────────────────────────
    "treasury-yield-pressure": {
        "label":       "Higher-for-Longer Repricing",
        "name":        "Higher-for-Longer Repricing",
        "description": (
            "The market has systematically under-priced the degree to which neutral rates "
            "have structurally re-anchored, generating ongoing multiple compression risk "
            "for duration-sensitive assets across the capital structure."
        ),
        "keywords": [
            "treasury yield", "10-year yield", "yield curve", "rate hike", "fed rate",
            "bond selloff", "yield spike", "inflation data", "cpi print",
            "fomc", "higher for longer", "term premium", "duration risk",
            "interest rates", "yields rise", "yields climb", "yields surge",
            "rate cut", "rate cuts", "rate decision", "fed decision",
            "federal reserve", "inflation report", "cpi data", "cpi reading",
            "bond market", "treasury market", "yield inversion", "10 year treasury",
            "rate expectations", "monetary policy", "fed pivot", "fed pause",
            "rate outlook", "bond yields", "yield pressure", "rate hikes",
            "treasury yields",
            "inflation", "yields", "rates", "cpi", "treasury",
        ],
        "entities": frozenset({
            "Treasury", "Treasuries", "10Y", "2Y", "30Y", "Fed", "FOMC",
            "Bonds", "Yields",
            "Federal Reserve", "Powell", "TLT", "TNX", "Inflation",
            "JPM", "BAC", "GS", "MS",
        }),
        "related_industries":    ["Software", "Real Estate", "Financials", "Utilities", "Consumer"],
        "related_assets":        ["TNX", "TLT", "JPM", "BAC", "EQIX"],
        "related_macro_factors": ["10Y Yield Re-anchoring", "Yield Curve", "Terminal Rate", "Break-Even Inflation"],
        "second_order_effects": [
            "Long-duration software multiples face mechanical compression as the discount rate re-anchors — the denominator effect is non-linear above 5%",
            "Commercial real estate cap-rate widening forces loan book impairments at regional banks as refinancing cycles roll",
            "Bank NIM expansion on a steeper yield curve creates an earnings revision tailwind that partially offsets credit quality pressure",
            "Private credit spread widening raises the hurdle rate for leveraged buyouts, compressing PE deal flow",
            "EM sovereign spreads widen with USD strength as the risk-free rate rises, tightening local-currency refinancing conditions",
        ],
        "podcast_topics": ["Markets", "Macro"],
        "relationship_graph": {
            "Software":    {"weight": 0.84, "type": "direct",        "direction": "negative"},
            "Real Estate": {"weight": 0.79, "type": "direct",        "direction": "negative"},
            "Financials":  {"weight": 0.73, "type": "direct",        "direction": "positive"},
            "Utilities":   {"weight": 0.42, "type": "macro_overlap", "direction": "negative"},
            "Consumer":    {"weight": 0.35, "type": "narrative",     "direction": "negative"},
        },
        # Phase 8
        "regime_affinity":   ["Risk-Off Hawkish", "Stagflationary"],
        "competing_themes":  ["liquidity-tightening", "private-credit-expansion"],
        "generic_keywords":  ["inflation", "yields", "rates", "cpi", "treasury"],
        "causal_inputs":     ["energy-security"],
        "causal_outputs":    ["liquidity-tightening", "consumer-stress"],
        "confidence_floor":  15,
        "decay_rate":        0.90,
    },

    # ── 3 ────────────────────────────────────────────────────────────────────────
    "defense-reindustrialization": {
        "label":       "NATO Rearmament Cycle",
        "name":        "NATO Rearmament Cycle",
        "description": (
            "Sustained NATO spending commitments above 2% of GDP and persistent "
            "geopolitical escalation are driving a multi-year defence procurement "
            "expansion that is structurally decoupled from the economic cycle."
        ),
        "keywords": [
            "defense spending", "military budget", "nato", "pentagon", "defense procurement",
            "weapons system", "fighter jet", "defense contract", "ndaa",
            "defense backlog", "rearmament", "military aid", "drone warfare",
            "lockheed", "raytheon", "northrop", "general dynamics", "boeing defense",
            "military spending", "defense budget", "ukraine war", "taiwan strait",
            "geopolitical tension", "nato spending", "defense stocks", "defense order",
            "missile system", "stealth fighter", "naval vessel", "troop deployment",
            "arms deal", "weapons contract", "military contract",
            "defense", "military", "ukraine", "taiwan",
        ],
        "entities": frozenset({
            "LMT", "RTX", "NOC", "GD", "BA", "GE", "HII", "KTOS",
            "Lockheed", "Raytheon", "Northrop", "Boeing", "General Dynamics",
        }),
        "related_industries":    ["Aerospace & Defense", "Industrials", "Semiconductors", "Energy"],
        "related_assets":        ["LMT", "RTX", "NOC", "GD"],
        "related_macro_factors": ["NATO Budget Mandates", "Defence Backlog", "NDAA Authorisation", "Geopolitical Risk Premium"],
        "second_order_effects": [
            "Multi-year order books create durable earnings visibility structurally decoupled from the economic cycle",
            "European defence consolidation creates M&A activity among second-tier contractors seeking scale for large-programme bids",
            "Rare-earth and critical-mineral supply chains for defence hardware face strategic stockpiling pressure and supply-chain friend-shoring",
            "Dual-use semiconductor and drone technology creates cross-sector earnings leverage between civil and defence procurement",
        ],
        "podcast_topics": ["Geopolitical", "Markets"],
        "relationship_graph": {
            "Aerospace & Defense": {"weight": 0.97, "type": "direct",        "direction": "positive"},
            "Industrials":         {"weight": 0.82, "type": "direct",        "direction": "positive"},
            "Semiconductors":      {"weight": 0.54, "type": "indirect",      "direction": "positive"},
            "Energy":              {"weight": 0.38, "type": "macro_overlap", "direction": "positive"},
        },
        # Phase 8
        "regime_affinity":   ["Risk-Off Hawkish", "Risk-Off Neutral", "Stagflationary"],
        "competing_themes":  ["energy-security", "china-stimulus-rotation"],
        "generic_keywords":  ["defense", "military", "ukraine", "taiwan"],
        "causal_inputs":     [],
        "causal_outputs":    ["energy-security", "semiconductor-capex-cycle"],
        "confidence_floor":  12,
        "decay_rate":        0.88,
    },

    # ── 4 ────────────────────────────────────────────────────────────────────────
    "private-credit-expansion": {
        "label":       "Non-Bank Lending Ascendancy",
        "name":        "Non-Bank Lending Ascendancy",
        "description": (
            "Structural capital-requirement increases under Basel III are accelerating "
            "the transfer of lending market share from regulated banks to alternative "
            "credit managers — a secular shift that is creating fee-income winners "
            "irrespective of the credit cycle."
        ),
        "keywords": [
            "private credit", "direct lending", "leveraged loan", "bdc",
            "clo", "middle market", "nav loan", "private debt", "alternative lending",
            "shadow banking", "non-bank lender", "credit facility", "capital solutions",
            "blackstone", "apollo", "ares", "kkr", "credit manager",
            "private equity", "credit market", "loan market", "debt deal",
            "alternative credit", "leveraged finance", "high yield", "credit spread",
            "blackstone", "apollo", "ares", "buyout",
        ],
        "entities": frozenset({
            "BX", "KKR", "ARES", "APO", "OWL",
            "Blackstone", "Apollo", "KKR", "Carlyle",
        }),
        "related_industries":    ["Financials", "Real Estate"],
        "related_assets":        ["ARES", "APO", "BX", "KKR", "OWL"],
        "related_macro_factors": ["Credit Spread Regime", "Yield Curve Steepness", "NIM Differential", "M&A Flow"],
        "second_order_effects": [
            "Alternative credit managers capture fee revenue that regulated banks cannot generate under Basel III end-state capital rules",
            "Direct lending spread widening raises the all-in cost of leverage, compressing LBO return assumptions and deal flow",
            "CLO formation activity serves as a leading indicator of institutional risk appetite across leveraged credit markets",
            "BDC NAV pressure during stress periods can signal broader middle-market credit quality deterioration before it appears in bank charge-offs",
        ],
        "podcast_topics": ["Private Markets", "Markets"],
        "relationship_graph": {
            "Financials":  {"weight": 0.90, "type": "direct",        "direction": "positive"},
            "Real Estate": {"weight": 0.45, "type": "macro_overlap", "direction": "negative"},
        },
        # Phase 8
        "regime_affinity":   ["Risk-Off Hawkish", "Risk-On Neutral"],
        "competing_themes":  ["treasury-yield-pressure", "liquidity-tightening",
                              "direct-lending-expansion", "private-capital-takeover"],
        "generic_keywords":  ["blackstone", "apollo", "ares", "buyout"],
        "causal_inputs":     ["treasury-yield-pressure"],
        "causal_outputs":    ["private-capital-takeover"],
        "confidence_floor":  12,
        "decay_rate":        0.82,
    },

    # ── 5 ────────────────────────────────────────────────────────────────────────
    "glp1-healthcare-revolution": {
        "label":       "Metabolic Disease Repricing",
        "name":        "Metabolic Disease Repricing",
        "description": (
            "The GLP-1 drug class is forcing a structural re-rating of healthcare "
            "subsectors as the market reprices the long-run prevalence of obesity-related "
            "comorbidities, with second-order volume headwinds hitting medical devices "
            "and surgical-volume chains."
        ),
        "keywords": [
            "glp-1", "ozempic", "wegovy", "mounjaro", "obesity drug", "weight loss drug",
            "semaglutide", "tirzepatide", "metabolic disease", "diabetes drug",
            "anti-obesity", "eli lilly", "novo nordisk", "glp1",
            "weight loss", "obesity treatment", "diabetes treatment", "lilly",
            "pharmaceutical earnings", "drug approval", "fda approval", "clinical trial",
            "drug pipeline", "biotech drug", "healthcare earnings", "pharma earnings",
            "fda", "lilly", "obesity", "biotech", "healthcare",
        ],
        "entities": frozenset({
            "LLY", "NVO", "PFE", "ABBV", "BMY", "JNJ", "ISRG", "UNH",
            "Lilly", "Novo Nordisk", "Pfizer", "AbbVie", "Johnson", "UnitedHealth",
        }),
        "related_industries":    ["Healthcare", "Consumer"],
        "related_assets":        ["LLY", "NVO", "UNH", "ABBV"],
        "related_macro_factors": ["FDA Pipeline Calendar", "GLP-1 Market Penetration", "Drug Pricing Policy", "IRA Impact"],
        "second_order_effects": [
            "Medical device makers face structural volume headwinds as obesity drugs reduce the incidence of surgical intervention at scale",
            "Food and beverage companies face a secular demand-mix shift as GLP-1-treated patients reduce caloric consumption",
            "Health insurers benefit from reduced obesity-related comorbidity costs, but near-term drug cost inflation creates a transitory headwind",
            "AI drug discovery investment accelerates as GLP-1 commercial success validates large-molecule platform economics",
        ],
        "podcast_topics": ["Company", "Markets"],
        "relationship_graph": {
            "Healthcare":  {"weight": 0.95, "type": "direct",        "direction": "positive"},
            "Consumer":    {"weight": 0.41, "type": "indirect",      "direction": "negative"},
            "Financials":  {"weight": 0.28, "type": "narrative",     "direction": "positive"},
        },
        # Phase 8
        "regime_affinity":   ["Risk-On Neutral", "Risk-On Dovish", "Neutral/Consolidating"],
        "competing_themes":  [],
        "generic_keywords":  ["fda", "lilly", "obesity", "biotech", "healthcare"],
        "causal_inputs":     [],
        "causal_outputs":    [],
        "confidence_floor":  15,
        "decay_rate":        0.88,
    },

    # ── 6 ────────────────────────────────────────────────────────────────────────
    "china-stimulus-rotation": {
        "label":       "PBOC Easing Rotation",
        "name":        "PBOC Easing Rotation",
        "description": (
            "PBOC policy support and Chinese domestic demand recovery are creating a "
            "rotation opportunity into EM equities, base metals, and commodity-linked "
            "sectors as positioning unwinds from China-underweight consensus."
        ),
        "keywords": [
            "china stimulus", "pboc", "beijing stimulus", "chinese economy", "china pmi",
            "china demand", "property sector", "china growth", "yuan stimulus",
            "renminbi", "china policy easing", "china infrastructure",
            "china economy", "china market", "chinese stocks", "china trade",
            "beijing policy", "pboc rate", "china recovery", "china slowdown",
            "china gdp", "china exports", "china imports", "copper demand",
            "iron ore", "commodity demand", "emerging market",
            "china", "chinese", "beijing",
        ],
        "entities": frozenset({
            "BABA", "JD", "PDD", "NIO", "BYD", "FCX", "VALE", "BHP", "AA", "ALB",
            "Alibaba", "China", "PBOC",
        }),
        "related_industries":    ["Energy", "Semiconductors", "Industrials", "Consumer"],
        "related_assets":        ["FCX", "VALE", "BHP", "AA"],
        "related_macro_factors": ["China PMI", "USD/CNY", "Copper Price", "Iron Ore"],
        "second_order_effects": [
            "Chinese commodity demand recovery lifts base-metals pricing and widens EM producer margins, creating a positioning rotation opportunity",
            "Luxury and consumer-discretionary names with China exposure face earnings revision risk in both directions from policy swing-factor",
            "China supply-chain normalisation reduces goods-price inflation pressure in developed markets, easing the Fed's core-goods calculation",
            "CNY appreciation creates an EM currency tailwind and reduces USD-denominated debt servicing costs for EM sovereigns",
        ],
        "podcast_topics": ["Macro", "Markets", "Geopolitical"],
        "relationship_graph": {
            "Energy":         {"weight": 0.72, "type": "direct",        "direction": "positive"},
            "Industrials":    {"weight": 0.65, "type": "macro_overlap", "direction": "positive"},
            "Semiconductors": {"weight": 0.55, "type": "indirect",      "direction": "positive"},
            "Consumer":       {"weight": 0.35, "type": "narrative",     "direction": "positive"},
        },
        # Phase 8
        "regime_affinity":   ["Risk-On Dovish", "Risk-On Neutral"],
        "competing_themes":  ["defense-reindustrialization"],
        "generic_keywords":  ["china", "chinese", "beijing"],
        "causal_inputs":     [],
        "causal_outputs":    ["energy-security"],
        "confidence_floor":  12,
        "decay_rate":        0.80,
    },

    # ── 7 ────────────────────────────────────────────────────────────────────────
    "energy-security": {
        "label":       "Supply-Side Energy Shock",
        "name":        "Supply-Side Energy Shock",
        "description": (
            "Geopolitical supply-chain fragmentation and OPEC+ quota discipline are "
            "sustaining energy price volatility above mean-reversion levels, creating "
            "a persistent inflation-expectation anchor and sector-rotation catalyst."
        ),
        "keywords": [
            "opec", "oil supply", "lng export", "energy security", "pipeline disruption",
            "oil embargo", "natural gas shortage", "energy crisis", "oil price spike",
            "opec cut", "opec production", "oil sanction", "gas supply",
            "oil prices", "crude prices", "oil price", "crude oil", "brent crude",
            "wti crude", "opec meeting", "energy supply", "natural gas prices",
            "gasoline prices", "oil output", "oil demand", "energy market",
            "exxon", "chevron", "shell", "energy earnings", "oil company",
            "oil", "crude", "opec", "brent", "wti",
        ],
        "entities": frozenset({
            "XOM", "CVX", "COP", "SLB", "HAL", "OXY", "VLO", "LNG", "CQP",
            "Exxon", "Chevron", "ConocoPhillips", "Shell", "BP", "OPEC",
        }),
        "related_industries":    ["Energy", "Utilities", "Consumer", "Aerospace & Defense"],
        "related_assets":        ["XOM", "CVX", "COP", "LNG"],
        "related_macro_factors": ["WTI Spot", "OPEC+ Quota", "NG Inventory", "LNG Export Spread"],
        "second_order_effects": [
            "Energy-price persistence sustains above-target inflation, extending the Fed's higher-for-longer rate posture",
            "Commodity FX pairs (CAD, NOK, AUD) appreciate with crude, creating cross-asset positioning opportunities",
            "Airlines and freight carriers face margin compression from jet fuel cost escalation — unit revenue recovery lags fuel moves",
            "Consumer discretionary spending faces a demand compression headwind from higher energy bills and fuel costs",
        ],
        "podcast_topics": ["Markets", "Geopolitical", "Macro"],
        "relationship_graph": {
            "Energy":              {"weight": 0.95, "type": "direct",        "direction": "positive"},
            "Utilities":           {"weight": 0.58, "type": "indirect",      "direction": "positive"},
            "Consumer":            {"weight": 0.42, "type": "macro_overlap", "direction": "negative"},
            "Aerospace & Defense": {"weight": 0.36, "type": "narrative",     "direction": "positive"},
            "Industrials":         {"weight": 0.32, "type": "narrative",     "direction": "positive"},
        },
        # Phase 8
        "regime_affinity":   ["Stagflationary", "Risk-Off Hawkish"],
        "competing_themes":  ["nuclear-power-renaissance", "china-stimulus-rotation"],
        "generic_keywords":  ["oil", "crude", "opec", "brent", "wti"],
        "causal_inputs":     ["defense-reindustrialization", "china-stimulus-rotation"],
        "causal_outputs":    ["treasury-yield-pressure", "consumer-stress"],
        "confidence_floor":  12,
        "decay_rate":        0.85,
    },

    # ── 8 ────────────────────────────────────────────────────────────────────────
    "liquidity-tightening": {
        "label":       "Credit Transmission Breakdown",
        "name":        "Credit Transmission Breakdown",
        "description": (
            "Elevated risk-free rates and bank capital constraints are impairing the "
            "credit channel, with the transmission mechanism from tighter policy to "
            "real-economy lending standards showing up in CRE delinquency, regional-bank "
            "stress, and consumer credit availability compression."
        ),
        "keywords": [
            "credit tightening", "bank lending standards", "commercial real estate loan",
            "bank stress", "regional bank", "credit crunch", "liquidity risk",
            "cre default", "office vacancy", "cmbs spread", "loan refinancing",
            "credit conditions", "capital requirements", "bank capital",
            "bank earnings", "loan loss", "credit quality", "default rate",
            "mortgage delinquency", "office market", "real estate stress",
            "financial stress", "credit access", "lending tightens",
            "jpmorgan", "bank of america", "wells fargo", "citigroup",
            "delinquency", "defaults", "foreclosure",
        ],
        "entities": frozenset({
            "BAC", "C", "WFC", "JPM", "SPG", "VNO", "SLG", "PLD", "DLR",
            "Bank of America", "JPMorgan", "Wells Fargo", "Citigroup",
        }),
        "related_industries":    ["Financials", "Real Estate", "Consumer", "Industrials"],
        "related_assets":        ["BAC", "C", "SPG", "VNO"],
        "related_macro_factors": ["Credit Spreads", "CRE Vacancy Rate", "10Y Yield", "CMBS Spreads"],
        "second_order_effects": [
            "CRE valuation marks force loan-book impairments at regional banks as cap rates reset against fixed-rate debt",
            "Small-business credit availability compression feeds through to capex and hiring with a 2-3 quarter lag",
            "Consumer delinquency acceleration signals a spending-velocity contraction beginning to play out in revolving credit",
            "Private credit spread widening raises the leverage hurdle rate, compressing both deal flow and PE fund NAV marks",
        ],
        "podcast_topics": ["Markets", "Macro"],
        "relationship_graph": {
            "Financials":  {"weight": 0.81, "type": "direct",        "direction": "negative"},
            "Real Estate": {"weight": 0.88, "type": "direct",        "direction": "negative"},
            "Consumer":    {"weight": 0.55, "type": "macro_overlap", "direction": "negative"},
            "Industrials": {"weight": 0.32, "type": "narrative",     "direction": "negative"},
        },
        # Phase 8
        "regime_affinity":   ["Risk-Off Hawkish", "Stagflationary"],
        "competing_themes":  ["treasury-yield-pressure", "consumer-stress"],
        "generic_keywords":  ["delinquency", "defaults", "foreclosure"],
        "causal_inputs":     ["treasury-yield-pressure"],
        "causal_outputs":    ["consumer-stress"],
        "confidence_floor":  12,
        "decay_rate":        0.88,
    },

    # ── 9 ────────────────────────────────────────────────────────────────────────
    "semiconductor-capex-cycle": {
        "label":       "Silicon Sovereignty Capex",
        "name":        "Silicon Sovereignty Capex",
        "description": (
            "AI-driven chip demand and export-control-induced supply concentration "
            "are sustaining an elevated semiconductor equipment investment cycle, "
            "with TSMC capacity expansion and domestic-fab subsidies creating "
            "multi-year earnings visibility for the equipment-and-materials stack."
        ),
        "keywords": [
            "semiconductor capex", "chip demand", "fab investment", "gpu supply",
            "wafer production", "memory demand", "hbm memory", "advanced packaging",
            "export control chip", "chips act", "tsmc capacity", "samsung fab",
            "intel foundry", "chip shortage", "chip oversupply",
            "nvidia earnings", "amd earnings", "chip stocks", "semiconductor stocks",
            "gpu demand", "ai chip", "chip exports", "chip ban", "chip tariff",
            "nvidia revenue", "semiconductor revenue", "chip sales", "chip revenue",
            "tsmc earnings", "amd results", "nvidia results", "gpu shortage",
            "chips", "semiconductor", "chipmaker",
            "nvidia", "amd", "tsmc", "broadcom", "qualcomm",
        ],
        "entities": frozenset({
            "NVDA", "AMD", "INTC", "TSMC", "ASML", "AMAT", "LRCX", "KLAC", "MU", "AVGO", "QCOM",
            "Nvidia", "AMD", "Intel", "TSMC", "Broadcom", "Qualcomm", "Micron",
        }),
        "related_industries":    ["Semiconductors", "Software", "Energy", "Real Estate"],
        "related_assets":        ["NVDA", "AMD", "ASML", "MU", "AMAT"],
        "related_macro_factors": ["AI Capex Supercycle", "Export Control Regime", "GPU Supply Stack", "TSMC Yield Ramp"],
        "second_order_effects": [
            "Semiconductor equipment makers benefit from both domestic-fab subsidies and TSMC capacity expansion in their key markets",
            "Export controls concentrate leading-edge foundry share at TSMC, creating strategic concentration risk and domestic-fab urgency",
            "Memory upcycle creates an earnings inflection for DRAM and NAND producers with inventory normalisation well-progressed",
            "Advanced packaging demand creates incremental revenue for substrate and materials suppliers not captured in chip-level metrics",
        ],
        "podcast_topics": ["Tech / AI", "Company"],
        "relationship_graph": {
            "Semiconductors": {"weight": 0.97, "type": "direct",        "direction": "positive"},
            "Software":       {"weight": 0.75, "type": "direct",        "direction": "positive"},
            "Real Estate":    {"weight": 0.50, "type": "indirect",      "direction": "positive"},
            "Energy":         {"weight": 0.38, "type": "macro_overlap", "direction": "positive"},
        },
        # Phase 8
        "regime_affinity":   ["Risk-On Neutral", "Risk-On Dovish"],
        "competing_themes":  ["ai-energy-demand", "ai-compute-arms-race"],
        "generic_keywords":  ["nvidia", "amd", "tsmc", "broadcom", "qualcomm"],
        "causal_inputs":     ["defense-reindustrialization"],
        "causal_outputs":    ["ai-energy-demand", "ai-compute-arms-race"],
        "confidence_floor":  15,
        "decay_rate":        0.88,
    },

    # ── 10 ───────────────────────────────────────────────────────────────────────
    "digital-asset-institutionalization": {
        "label":       "Crypto Market Structure",
        "name":        "Crypto Market Structure",
        "description": (
            "Regulatory clarity and spot-ETF approval are reshaping crypto market "
            "structure by separating institutional demand from retail speculation, "
            "creating durable on-chain volume dynamics and exchange-consolidation "
            "pressure independent of the price cycle."
        ),
        "keywords": [
            "bitcoin", "btc", "crypto", "digital asset", "spot bitcoin etf",
            "ethereum", "blockchain", "stablecoin", "crypto regulation",
            "sec crypto", "microstrategy", "institutional crypto", "crypto adoption",
            "bitcoin etf", "crypto market",
            "bitcoin price", "crypto price", "btc price", "eth price", "ethereum price",
            "crypto rally", "crypto selloff", "bitcoin rally", "bitcoin drop",
            "coinbase earnings", "coinbase revenue", "crypto exchange",
            "digital assets", "crypto assets", "bitcoin halving",
            "bitcoin", "crypto", "ethereum", "btc", "coinbase",
        ],
        "entities": frozenset({
            "COIN", "MSTR", "MARA", "RIOT", "SQ", "PYPL",
            "Bitcoin", "Ethereum", "BTC", "ETH", "Coinbase", "MicroStrategy",
        }),
        "related_industries":    ["Crypto & Digital Assets", "Financials", "Software"],
        "related_assets":        ["COIN", "MSTR", "MARA", "BTC"],
        "related_macro_factors": ["BTC ETF Flows", "Fed Policy", "Stablecoin Regulation", "Halving Cycle"],
        "second_order_effects": [
            "Bitcoin spot-ETF approval separated the institutional demand signal from retail-cycle noise — flow data now provides genuine positioning intelligence",
            "Stablecoin regulatory clarity is the pre-condition for bank-grade digital payments infrastructure at institutional scale",
            "Mining hardware demand follows the crypto price cycle with a 3-6 month lag — MARA and RIOT serve as leveraged cyclical proxies",
            "Exchange consolidation accelerates as compliance costs scale non-linearly with regulation, favouring Coinbase's regulatory moat",
        ],
        "podcast_topics": ["Markets", "Tech / AI"],
        "relationship_graph": {
            "Crypto & Digital Assets": {"weight": 0.97, "type": "direct",    "direction": "positive"},
            "Financials":              {"weight": 0.52, "type": "indirect",  "direction": "positive"},
            "Software":                {"weight": 0.28, "type": "narrative", "direction": "positive"},
        },
        # Phase 8
        "regime_affinity":   ["Risk-On Dovish", "Risk-On Neutral"],
        "competing_themes":  [],
        "generic_keywords":  ["bitcoin", "crypto", "ethereum", "btc", "coinbase"],
        "causal_inputs":     ["treasury-yield-pressure"],
        "causal_outputs":    [],
        "confidence_floor":  12,
        "decay_rate":        0.75,
    },

    # ── 11 ───────────────────────────────────────────────────────────────────────
    "nuclear-power-renaissance": {
        "label":       "Baseload Scarcity Premium",
        "name":        "Baseload Scarcity Premium",
        "description": (
            "Data-centre anchor demand and energy-security mandates are creating a "
            "structural premium for dispatchable, zero-carbon baseload generation — "
            "repricing nuclear merchant generators well above their regulated-utility "
            "peers on multi-year PPA contract economics."
        ),
        "keywords": [
            "nuclear power", "uranium", "smr", "small modular reactor", "nuclear plant",
            "nuclear reactor", "enrichment", "nuclear energy", "nuclear ppa",
            "nuclear capacity", "nuclear license", "nuclear revival",
            "nuclear deal", "nuclear agreement", "constellation energy", "vistra",
            "cameco", "uranium prices", "uranium demand", "nuclear electricity",
            "nuclear plant restart", "nuclear capacity factor", "clean energy nuclear",
            "nuclear", "uranium", "constellation", "vistra",
        ],
        "entities": frozenset({
            "CEG", "VST", "CCJ", "UEC",
            "Constellation", "Vistra", "Cameco",
        }),
        "related_industries":    ["Utilities", "Energy", "Semiconductors", "Real Estate"],
        "related_assets":        ["CEG", "VST", "CCJ", "UEC"],
        "related_macro_factors": ["Nuclear PPA Pricing", "Power Load Growth", "Uranium Spot", "AI Power Demand"],
        "second_order_effects": [
            "Nuclear PPAs price at a structural premium to regulated utility rates, re-rating merchant generators against regulated-utility comps",
            "Uranium supply concentration in Kazakhstan creates strategic supply-chain vulnerability and potential for a Kazakh premium",
            "SMR technology licensing approvals could compress the capex intensity and construction timeline, widening the addressable market",
            "Nuclear baseload competes with LNG peaker capacity for data-centre anchor contracts, creating a bifurcation in power market pricing",
        ],
        "podcast_topics": ["Markets", "Tech / AI"],
        "relationship_graph": {
            "Utilities":      {"weight": 0.97, "type": "direct",    "direction": "positive"},
            "Energy":         {"weight": 0.55, "type": "narrative", "direction": "positive"},
            "Semiconductors": {"weight": 0.45, "type": "narrative", "direction": "positive"},
            "Real Estate":    {"weight": 0.40, "type": "indirect",  "direction": "positive"},
        },
        # Phase 8
        "regime_affinity":   ["Risk-On Neutral", "Stagflationary"],
        "competing_themes":  ["ai-energy-demand", "energy-security", "utility-capex-supercycle"],
        "generic_keywords":  ["nuclear", "uranium", "constellation", "vistra"],
        "causal_inputs":     ["ai-energy-demand", "data-center-buildout"],
        "causal_outputs":    [],
        "confidence_floor":  12,
        "decay_rate":        0.85,
    },

    # ── 12 ───────────────────────────────────────────────────────────────────────
    "consumer-stress": {
        "label":       "Real Income Compression",
        "name":        "Real Income Compression",
        "description": (
            "Persistent real-wage compression, revolving credit utilisation approaching "
            "cycle highs, and accelerating delinquency rates signal that the consumer "
            "spending-velocity normalisation is transmitting into earnings pressure "
            "across discretionary and lower-income spending channels."
        ),
        "keywords": [
            "consumer spending", "retail sales", "credit card delinquency", "consumer credit",
            "real wages", "consumer confidence", "spending slowdown",
            "delinquency rate", "household debt", "consumer sentiment",
            "retail slowdown", "discretionary spending",
            "walmart earnings", "target earnings", "amazon consumer", "retail earnings",
            "consumer data", "spending data", "household spending", "consumer demand",
            "credit card spending", "consumer delinquency", "retail traffic",
            "consumer weakness", "spending cuts", "consumer stress",
            "spending", "retail", "walmart", "delinquency",
        ],
        "entities": frozenset({
            "WMT", "TGT", "COST", "MCD", "SBUX", "HD", "NKE", "AMZN",
            "Walmart", "Target", "Costco", "McDonald", "Starbucks", "Amazon",
        }),
        "related_industries":    ["Consumer", "Financials", "Real Estate", "Industrials"],
        "related_assets":        ["WMT", "TGT", "HD", "AMZN"],
        "related_macro_factors": ["Real Wage Growth", "CPI Delta", "Credit Utilisation Rate", "Household Savings Rate"],
        "second_order_effects": [
            "Value-channel retailers gain share as discretionary spending bifurcates by income cohort — a positioning rotation, not a sector decline",
            "Revolving credit utilisation approaching cycle highs signals spending-velocity compression 3-6 months ahead of reported retail sales",
            "Restaurant and leisure traffic declines as non-essential spending is cut first — the consumer stress signal usually leads the headline number",
            "Auto delinquency acceleration historically leads broader consumer credit quality deterioration by 2-4 quarters",
        ],
        "podcast_topics": ["Macro", "Markets", "Company"],
        "relationship_graph": {
            "Consumer":    {"weight": 0.92, "type": "direct",        "direction": "negative"},
            "Financials":  {"weight": 0.71, "type": "direct",        "direction": "negative"},
            "Real Estate": {"weight": 0.44, "type": "narrative",     "direction": "negative"},
            "Industrials": {"weight": 0.35, "type": "macro_overlap", "direction": "negative"},
        },
        # Phase 8
        "regime_affinity":   ["Risk-Off Hawkish", "Stagflationary", "Risk-Off Neutral"],
        "competing_themes":  ["liquidity-tightening"],
        "generic_keywords":  ["spending", "retail", "walmart", "delinquency"],
        "causal_inputs":     ["treasury-yield-pressure", "energy-security", "liquidity-tightening"],
        "causal_outputs":    [],
        "confidence_floor":  12,
        "decay_rate":        0.85,
    },

    # ── 13 ───────────────────────────────────────────────────────────────────────
    "ai-compute-arms-race": {
        "label":       "AI Compute Arms Race",
        "name":        "AI Compute Arms Race",
        "description": (
            "Frontier-model labs and hyperscalers are committing to multi-gigawatt "
            "training clusters faster than accelerator supply can scale, turning raw "
            "compute access into the binding competitive constraint and a durable "
            "demand floor under the entire AI hardware stack."
        ),
        "keywords": [
            "ai compute", "compute arms race", "frontier model", "training cluster",
            "ai training", "inference demand", "compute capacity", "model training",
            "gpu allocation", "gpu cluster", "ai accelerator", "foundation model",
            "frontier lab", "compute budget", "ai capex commitment", "training run",
            "ai supercluster", "supercomputer", "exaflop", "gigawatt cluster",
            "blackwell", "gb200", "h100", "h200", "openai compute", "anthropic compute",
            "xai", "stargate", "ai compute demand", "compute scarcity",
            "ai", "compute", "gpu",
        ],
        "entities": frozenset({
            "NVDA", "AMD", "AVGO", "MSFT", "GOOGL", "META", "AMZN", "ORCL",
            "Nvidia", "Microsoft", "Meta", "Google", "OpenAI", "Anthropic", "xAI", "Oracle",
        }),
        "related_industries":    ["Semiconductors", "Software", "Utilities", "Energy"],
        "related_assets":        ["NVDA", "AVGO", "AMD", "MSFT", "ORCL"],
        "related_macro_factors": ["AI Capex Supercycle", "GPU Supply Stack", "Accelerator Lead Times", "Frontier Model Scaling"],
        "second_order_effects": [
            "Compute access becomes the binding moat — frontier capability now tracks GPU allocation more tightly than algorithmic edge",
            "Multi-year accelerator purchase commitments create a demand floor that decouples chip revenue from the broader tech cycle",
            "Custom-silicon (TPU, Trainium, MTIA) investment accelerates as hyperscalers seek to escape single-vendor pricing power",
            "Training-cluster scale pulls forward power-procurement and data-centre siting decisions years ahead of grid capacity",
        ],
        "podcast_topics": ["Tech / AI", "Markets"],
        "relationship_graph": {
            "Semiconductors": {"weight": 0.96, "type": "direct",        "direction": "positive"},
            "Software":       {"weight": 0.82, "type": "direct",        "direction": "positive"},
            "Utilities":      {"weight": 0.60, "type": "indirect",      "direction": "positive"},
            "Energy":         {"weight": 0.45, "type": "macro_overlap", "direction": "positive"},
        },
        "regime_affinity":   ["Risk-On Neutral", "Risk-On Dovish"],
        "competing_themes":  ["ai-energy-demand", "semiconductor-capex-cycle", "hyperscaler-capex"],
        "generic_keywords":  ["ai", "compute", "gpu"],
        "causal_inputs":     ["semiconductor-capex-cycle"],
        "causal_outputs":    ["data-center-buildout", "ai-energy-demand"],
        "confidence_floor":  15,
        "decay_rate":        0.85,
    },

    # ── 14 ───────────────────────────────────────────────────────────────────────
    "data-center-buildout": {
        "label":       "Data Center Buildout",
        "name":        "Data Center Buildout",
        "description": (
            "Hyperscaler and AI demand has turned physical data-centre capacity — land, "
            "power interconnection, and cooling — into the scarce input, re-rating "
            "colocation REITs and the electrical/thermal equipment supply chain on "
            "multi-year pre-leased backlogs."
        ),
        "keywords": [
            "data center buildout", "data center construction", "data center capacity",
            "hyperscale data center", "colocation", "server farm", "rack density",
            "data center reit", "data center campus", "data center pipeline",
            "megawatt capacity", "data center vacancy", "interconnection queue",
            "data center power", "cooling infrastructure", "liquid cooling",
            "data center lease", "data center demand", "data centre", "power demand",
            "substation", "grid capacity",
            "data center", "colocation",
        ],
        "entities": frozenset({
            "EQIX", "DLR", "IRM", "VRT", "SMCI", "ETN", "GEV",
            "Equinix", "Digital Realty", "Vertiv", "Eaton",
        }),
        "related_industries":    ["Real Estate", "Utilities", "Industrials", "Semiconductors"],
        "related_assets":        ["EQIX", "DLR", "VRT", "ETN", "GEV"],
        "related_macro_factors": ["Power Interconnection Queue", "Data Center Vacancy", "Pre-Lease Backlog", "Cooling Capex"],
        "second_order_effects": [
            "Power-interconnection timelines, not capital, are now the gating constraint on capacity — siting shifts toward stranded generation",
            "Pre-leased backlogs give colocation REITs utility-like cash-flow visibility, compressing their risk premium versus traditional property",
            "Liquid-cooling adoption inflects with rack-power density, opening a new equipment TAM for thermal-management suppliers",
            "Electrical-equipment lead times (transformers, switchgear) lengthen, handing pricing power to the T&D supply chain",
        ],
        "podcast_topics": ["Tech / AI", "Markets"],
        "relationship_graph": {
            "Real Estate":    {"weight": 0.90, "type": "direct",        "direction": "positive"},
            "Utilities":      {"weight": 0.78, "type": "direct",        "direction": "positive"},
            "Industrials":    {"weight": 0.70, "type": "indirect",      "direction": "positive"},
            "Semiconductors": {"weight": 0.48, "type": "macro_overlap", "direction": "positive"},
        },
        "regime_affinity":   ["Risk-On Neutral", "Risk-On Dovish"],
        "competing_themes":  ["ai-energy-demand", "hyperscaler-capex"],
        "generic_keywords":  ["data center", "colocation"],
        "causal_inputs":     ["hyperscaler-capex", "ai-compute-arms-race"],
        "causal_outputs":    ["grid-modernization", "ai-energy-demand"],
        "confidence_floor":  15,
        "decay_rate":        0.85,
    },

    # ── 15 ───────────────────────────────────────────────────────────────────────
    "hyperscaler-capex": {
        "label":       "Hyperscaler Capex",
        "name":        "Hyperscaler Capex",
        "description": (
            "The mega-cap cloud platforms are guiding to step-function increases in "
            "capital expenditure to fund AI infrastructure, converting their balance "
            "sheets into the primary funding engine for the compute, data-centre, and "
            "power buildout downstream."
        ),
        "keywords": [
            "hyperscaler capex", "cloud capex", "capex guidance", "capital expenditure guidance",
            "microsoft capex", "google capex", "amazon capex", "meta capex",
            "capex cycle", "cloud capital spending", "capex raise", "capex outlook",
            "azure capex", "aws capex", "capital spending guidance", "capex commitment",
            "capex surge", "hyperscaler spending", "capex ramp", "ai infrastructure spending",
            "free cash flow", "capital intensity",
            "capex", "cloud",
        ],
        "entities": frozenset({
            "MSFT", "GOOGL", "AMZN", "META", "ORCL",
            "Microsoft", "Alphabet", "Amazon", "Meta", "Oracle",
        }),
        "related_industries":    ["Software", "Semiconductors", "Real Estate", "Utilities"],
        "related_assets":        ["MSFT", "GOOGL", "AMZN", "META", "ORCL"],
        "related_macro_factors": ["Cloud Capex Cycle", "Capital Intensity", "Free Cash Flow Margin", "AI Capex Supercycle"],
        "second_order_effects": [
            "Rising capital intensity compresses hyperscaler free-cash-flow margins, shifting the equity narrative from buybacks to reinvestment",
            "Hyperscaler capex guidance is the single best leading indicator for semiconductor and data-centre equipment order books",
            "Depreciation schedules lengthen as GPU useful-life assumptions are tested, creating a forward earnings-quality debate",
            "Capex commitments anchor multi-year power-purchase demand, transmitting cloud balance-sheet strength into utility planning",
        ],
        "podcast_topics": ["Tech / AI", "Company"],
        "relationship_graph": {
            "Software":       {"weight": 0.92, "type": "direct",        "direction": "positive"},
            "Semiconductors": {"weight": 0.85, "type": "direct",        "direction": "positive"},
            "Real Estate":    {"weight": 0.62, "type": "indirect",      "direction": "positive"},
            "Utilities":      {"weight": 0.55, "type": "indirect",      "direction": "positive"},
        },
        "regime_affinity":   ["Risk-On Neutral", "Risk-On Dovish"],
        "competing_themes":  ["ai-energy-demand", "ai-compute-arms-race", "data-center-buildout"],
        "generic_keywords":  ["capex", "cloud"],
        "causal_inputs":     ["ai-compute-arms-race"],
        "causal_outputs":    ["data-center-buildout", "semiconductor-capex-cycle"],
        "confidence_floor":  15,
        "decay_rate":        0.85,
    },

    # ── 16 ───────────────────────────────────────────────────────────────────────
    "grid-modernization": {
        "label":       "Grid Modernization",
        "name":        "Grid Modernization",
        "description": (
            "Two decades of underinvestment colliding with electrification and "
            "data-centre load is forcing an accelerated transmission-and-distribution "
            "capex cycle, with transformer and switchgear scarcity handing durable "
            "pricing power to grid-equipment makers."
        ),
        "keywords": [
            "grid modernization", "transmission line", "transmission capacity",
            "grid upgrade", "grid investment", "grid infrastructure", "electrical grid",
            "transmission and distribution", "interconnection queue", "grid equipment",
            "transformer shortage", "switchgear", "high voltage", "grid resilience",
            "transmission buildout", "grid expansion", "power grid upgrade",
            "electricity infrastructure", "grid operator", "transmission investment",
            "grid", "transmission",
        ],
        "entities": frozenset({
            "GEV", "ETN", "PWR", "PRIM", "MYRG", "HUBB",
            "GE Vernova", "Eaton", "Quanta", "Hubbell",
        }),
        "related_industries":    ["Utilities", "Industrials", "Energy"],
        "related_assets":        ["GEV", "ETN", "PWR", "HUBB"],
        "related_macro_factors": ["T&D Capex Cycle", "Transformer Lead Times", "Interconnection Backlog", "Electrification Demand"],
        "second_order_effects": [
            "Transformer and switchgear lead times stretching past 2 years convert equipment makers into price-setters with multi-year backlogs",
            "Interconnection-queue congestion becomes the rate-limiter on both renewable and data-centre load additions",
            "Grid-hardening mandates create a non-cyclical capex floor insulated from the rate environment",
            "Skilled-labour scarcity for high-voltage work emerges as a second bottleneck behind equipment supply",
        ],
        "podcast_topics": ["Markets", "Macro"],
        "relationship_graph": {
            "Utilities":   {"weight": 0.93, "type": "direct",        "direction": "positive"},
            "Industrials": {"weight": 0.86, "type": "direct",        "direction": "positive"},
            "Energy":      {"weight": 0.50, "type": "macro_overlap", "direction": "positive"},
        },
        "regime_affinity":   ["Risk-On Neutral", "Stagflationary"],
        "competing_themes":  ["ai-energy-demand", "utility-capex-supercycle"],
        "generic_keywords":  ["grid", "transmission"],
        "causal_inputs":     ["data-center-buildout", "ai-energy-demand"],
        "causal_outputs":    ["utility-capex-supercycle"],
        "confidence_floor":  15,
        "decay_rate":        0.85,
    },

    # ── 17 ───────────────────────────────────────────────────────────────────────
    "utility-capex-supercycle": {
        "label":       "Utility Capex Supercycle",
        "name":        "Utility Capex Supercycle",
        "description": (
            "Structural load growth from electrification and data centres is ending two "
            "decades of flat power demand, driving regulated rate-base expansion that "
            "compounds utility earnings growth well above the historical GDP-linked "
            "trend."
        ),
        "keywords": [
            "utility capex", "rate base growth", "ratebase", "regulated utility",
            "load growth", "utility investment", "rate case", "utility earnings growth",
            "capital plan", "electricity demand growth", "utility ratebase",
            "power demand growth", "utility spending", "electrification",
            "demand forecast", "integrated resource plan", "utility capital",
            "rate base", "power load growth",
            "utility", "electricity",
        ],
        "entities": frozenset({
            "NEE", "SO", "DUK", "AEP", "EXC", "D", "XEL", "PEG",
            "NextEra", "Southern Company", "Duke", "Exelon",
        }),
        "related_industries":    ["Utilities", "Energy", "Industrials"],
        "related_assets":        ["NEE", "SO", "DUK", "AEP", "XEL"],
        "related_macro_factors": ["Rate-Base Growth", "Load Growth Forecast", "Allowed ROE", "Electrification Demand"],
        "second_order_effects": [
            "Load growth ends the decoupling era — utilities re-rate from bond-proxy defensives toward structural earnings compounders",
            "Rising capital plans pressure balance sheets, lifting equity-issuance and putting the allowed-ROE regulatory debate in focus",
            "Demand visibility from data-centre anchor load reduces the regulatory risk premium embedded in utility multiples",
            "Capex intensity favours utilities with constructive regulatory jurisdictions and large interconnection pipelines",
        ],
        "podcast_topics": ["Markets", "Macro"],
        "relationship_graph": {
            "Utilities":   {"weight": 0.95, "type": "direct",        "direction": "positive"},
            "Energy":      {"weight": 0.55, "type": "macro_overlap", "direction": "positive"},
            "Industrials": {"weight": 0.48, "type": "indirect",      "direction": "positive"},
        },
        "regime_affinity":   ["Risk-On Neutral", "Defensive Rotation", "Stagflationary"],
        "competing_themes":  ["grid-modernization", "ai-energy-demand", "nuclear-power-renaissance"],
        "generic_keywords":  ["utility", "electricity"],
        "causal_inputs":     ["grid-modernization", "ai-energy-demand"],
        "causal_outputs":    [],
        "confidence_floor":  15,
        "decay_rate":        0.87,
    },

    # ── 18 ───────────────────────────────────────────────────────────────────────
    "direct-lending-expansion": {
        "label":       "Direct Lending Expansion",
        "name":        "Direct Lending Expansion",
        "description": (
            "Permanent and insurance-linked capital is flooding into direct lending, "
            "extending non-bank credit beyond the middle market into investment-grade "
            "and asset-based finance — a fund-formation supercycle that compounds "
            "fee-related earnings for the largest credit platforms."
        ),
        "keywords": [
            "direct lending", "private credit fund", "bdc", "business development company",
            "unitranche", "middle market lending", "senior secured loan", "direct lender",
            "private debt fund", "asset based lending", "fund formation", "credit fund raise",
            "perpetual capital", "insurance capital", "private credit deployment",
            "nav financing", "investment grade private credit", "fee related earnings",
            "dry powder", "private debt",
            "lending", "credit",
        ],
        "entities": frozenset({
            "ARES", "OWL", "BXSL", "ARCC", "OBDC", "FSK", "GBDC", "APO",
            "Ares", "Blue Owl", "Blackstone", "Apollo",
        }),
        "related_industries":    ["Financials", "Real Estate"],
        "related_assets":        ["ARES", "OWL", "ARCC", "OBDC"],
        "related_macro_factors": ["Fund Formation Pace", "Fee-Related Earnings", "Insurance Capital Inflows", "Credit Spread Regime"],
        "second_order_effects": [
            "Insurance-balance-sheet capital makes direct-lending AUM stickier and less cyclical, re-rating manager fee streams",
            "Migration up-market into investment-grade private credit puts non-bank lenders in direct competition with bank syndication desks",
            "Fee-related earnings growth de-risks alt-manager equity stories versus carry-dependent, mark-to-market PE models",
            "Asset-based finance expansion extends private credit into consumer, equipment, and infrastructure cash-flow streams",
        ],
        "podcast_topics": ["Private Markets", "Markets"],
        "relationship_graph": {
            "Financials":  {"weight": 0.92, "type": "direct",        "direction": "positive"},
            "Real Estate": {"weight": 0.42, "type": "macro_overlap", "direction": "negative"},
        },
        "regime_affinity":   ["Risk-On Neutral", "Risk-Off Hawkish"],
        "competing_themes":  ["private-credit-expansion", "private-capital-takeover"],
        "generic_keywords":  ["lending", "credit"],
        "causal_inputs":     ["treasury-yield-pressure"],
        "causal_outputs":    ["private-capital-takeover"],
        "confidence_floor":  12,
        "decay_rate":        0.82,
    },

    # ── 19 ───────────────────────────────────────────────────────────────────────
    "private-capital-takeover": {
        "label":       "Private Capital Takeover",
        "name":        "Private Capital Takeover",
        "description": (
            "Record private-equity dry powder, paired with deep private-credit financing, "
            "is accelerating take-privates and sponsor-led buyouts — migrating value "
            "creation off public exchanges and shrinking the listed-equity universe in "
            "targeted sectors."
        ),
        "keywords": [
            "take private", "going private", "leveraged buyout", "lbo",
            "private equity buyout", "public to private", "carve out", "sponsor backed",
            "pe acquisition", "club deal", "buyout fund", "dry powder", "take private deal",
            "sponsor bid", "private equity bid", "delisting", "management buyout",
            "continuation fund", "mega buyout", "sponsor takeover",
            "buyout", "private equity",
        ],
        "entities": frozenset({
            "BX", "KKR", "APO", "CG", "ARES", "TPG", "EQT", "OWL",
            "Blackstone", "KKR", "Apollo", "Carlyle", "TPG",
        }),
        "related_industries":    ["Financials", "Real Estate", "Industrials"],
        "related_assets":        ["BX", "KKR", "APO", "CG", "TPG"],
        "related_macro_factors": ["PE Dry Powder", "Take-Private Volume", "Financing Spread", "Sponsor Exit Backlog"],
        "second_order_effects": [
            "Take-private flow shrinks the listed-equity universe in targeted sectors, raising scarcity value for remaining public comps",
            "Deal velocity is gated by private-credit financing availability — the two themes move as a single capital-formation engine",
            "Continuation funds extend hold periods, deferring DPI and pressuring LPs even as headline fundraising stays strong",
            "Sponsor competition for scarce assets compresses return assumptions, pushing funds toward operational rather than financial leverage",
        ],
        "podcast_topics": ["Private Markets", "M&A"],
        "relationship_graph": {
            "Financials":  {"weight": 0.90, "type": "direct",        "direction": "positive"},
            "Industrials": {"weight": 0.45, "type": "indirect",      "direction": "positive"},
            "Real Estate": {"weight": 0.40, "type": "macro_overlap", "direction": "positive"},
        },
        "regime_affinity":   ["Risk-On Neutral", "Risk-On Dovish"],
        "competing_themes":  ["private-credit-expansion", "direct-lending-expansion"],
        "generic_keywords":  ["buyout", "private equity"],
        "causal_inputs":     ["direct-lending-expansion"],
        "causal_outputs":    [],
        "confidence_floor":  12,
        "decay_rate":        0.80,
    },
}


# Backward-compat alias — theme_graph.py imports THEME_CATALOG
THEME_CATALOG = THEME_ONTOLOGY
