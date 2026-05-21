"""
app/theme_graph.py — Cross-market theme intelligence graph.

Extracts active macro/thematic themes from the current cluster stream using
deterministic entity + keyword matching.  Zero LLM calls.

Each ThemeIntelligence object maps:
  story → theme → industry → asset → macro factor → second-order effect
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.clustering import StoryCluster

_PUNCT_RE = re.compile(r"[^\w\s]+")


def _norm(text: str) -> str:
    return " " + _PUNCT_RE.sub(" ", text.lower()) + " "


def _item_sentiment(item: object) -> str:
    impact = (getattr(item, "impact", "") or "").lower()
    if impact.startswith("bullish"): return "bullish"
    if impact.startswith("bearish"): return "bearish"
    if impact.startswith("mixed"):   return "mixed"
    return "neutral"


def _majority_sentiment(sentiments: list[str]) -> str:
    if not sentiments:
        return "neutral"
    counts: dict[str, int] = {}
    for s in sentiments:
        counts[s] = counts.get(s, 0) + 1
    best = max(counts, key=counts.get)
    return "neutral" if best == "mixed" else best


# ── Theme Intelligence dataclass ──────────────────────────────────────────────

@dataclass
class ThemeIntelligence:
    """A cross-market theme derived from the live cluster stream."""
    id:                       str
    name:                     str
    description:              str
    signal_strength:          str            # "strong" | "medium" | "weak"
    confidence:               int            # 0–100
    momentum_direction:       str            # "bullish" | "bearish" | "neutral"
    related_industries:       list[str]      = field(default_factory=list)
    related_assets:           list[str]      = field(default_factory=list)
    related_macro_factors:    list[str]      = field(default_factory=list)
    contributing_cluster_ids: list[str]      = field(default_factory=list)
    contributing_story_count: int            = 0
    second_order_effects:     list[str]      = field(default_factory=list)
    podcast_topics:           list[str]      = field(default_factory=list)
    last_updated:             str            = ""


# ── Theme catalog ─────────────────────────────────────────────────────────────
# Each entry defines the matching signals and static relationship graph for one
# macro/thematic theme.  Keywords are matched against normalised title + snippet.
# Entities are matched against item.affected_entities (uppercase comparison).

THEME_CATALOG: dict[str, dict] = {
    "ai-energy-demand": {
        "name":        "AI Energy Demand",
        "description": "AI data center buildout driving a structural step-change in power demand",
        "keywords": [
            "power demand", "data center", "ai infrastructure", "electricity demand",
            "grid load", "nuclear ppa", "power grid", "hyperscaler power",
            "ai power", "data center power", "gpu cluster", "compute power",
        ],
        "entities": frozenset({
            "NVDA", "MSFT", "GOOGL", "AMZN", "META", "CEG", "VST",
            "NEE", "EQIX", "DLR", "AEP", "EXC",
        }),
        "related_industries":    ["AI Infrastructure", "Data Centers", "Nuclear", "Utilities"],
        "related_assets":        ["NVDA", "CEG", "VST", "NEE", "EQIX"],
        "related_macro_factors": ["Power Load Growth", "AI Capex", "Grid Capex", "Nuclear PPA"],
        "second_order_effects": [
            "Power demand supports utilities and merchant generators with structural pricing power",
            "Natural gas demand may rise as data centers require reliable peaker capacity",
            "Nuclear PPAs create multi-year earnings visibility for independent power producers",
            "Higher electricity costs create margin risk for compute-intensive AI workloads",
            "Grid infrastructure equipment makers benefit from accelerated capex cycle",
        ],
        "podcast_topics": ["Tech / AI", "Markets"],
    },
    "treasury-yield-pressure": {
        "name":        "Treasury Yield Pressure",
        "description": "Elevated or rising yields compressing duration assets and driving cross-asset rotation",
        "keywords": [
            "treasury yield", "10-year yield", "yield curve", "rate hike", "fed rate",
            "bond selloff", "yield spike", "inflation data", "cpi print",
            "fomc", "higher for longer", "term premium", "duration risk",
        ],
        "entities": frozenset({
            "Treasury", "Treasuries", "10Y", "2Y", "30Y", "Fed", "FOMC",
            "Bonds", "Yields",
        }),
        "related_industries":    ["Cloud Software", "Real Estate", "Private Credit", "Financials"],
        "related_assets":        ["TNX", "TLT", "JPM", "BAC", "EQIX"],
        "related_macro_factors": ["10Y Yield", "Yield Curve", "Fed Funds Rate", "Inflation"],
        "second_order_effects": [
            "Long-duration software multiples face mechanical compression at elevated yields",
            "Commercial real estate refinancing risk intensifies as cap rates widen",
            "Bank NIM improves on steeper yield curve creating earnings revision tailwind",
            "Private credit spreads widen as risk-free rate rises raising the hurdle rate",
            "EM currencies face depreciation pressure from USD strength at higher yields",
        ],
        "podcast_topics": ["Markets", "Macro"],
    },
    "defense-reindustrialization": {
        "name":        "Defense Reindustrialization",
        "description": "Geopolitical escalation and NATO commitments driving multi-year defense procurement expansion",
        "keywords": [
            "defense spending", "military budget", "nato", "pentagon", "defense procurement",
            "weapons system", "fighter jet", "defense contract", "ndaa",
            "defense backlog", "rearmament", "military aid", "drone warfare",
        ],
        "entities": frozenset({
            "LMT", "RTX", "NOC", "GD", "BA", "GE", "HII", "KTOS",
        }),
        "related_industries":    ["Defense", "Aerospace & Defense", "Industrials"],
        "related_assets":        ["LMT", "RTX", "NOC", "GD"],
        "related_macro_factors": ["NATO Budgets", "Defense Backlog", "NDAA", "Geopolitical Risk"],
        "second_order_effects": [
            "Multi-year order books create durable earnings visibility decoupled from economic cycles",
            "European defense consolidation creates M&A activity among second-tier contractors",
            "Rare earth supply chains for defense hardware face strategic stockpiling pressure",
            "Dual-use technology in semiconductors and drones benefits civil and defense sectors",
        ],
        "podcast_topics": ["Geopolitical", "Markets"],
    },
    "private-credit-expansion": {
        "name":        "Private Credit Expansion",
        "description": "Alternative lenders capturing market share as banks retreat under capital constraints",
        "keywords": [
            "private credit", "direct lending", "leveraged loan", "bdc",
            "clo", "middle market", "nav loan", "private debt", "alternative lending",
            "shadow banking", "non-bank lender", "credit facility", "capital solutions",
        ],
        "entities": frozenset({
            "BX", "KKR", "ARES", "APO", "OWL",
        }),
        "related_industries":    ["Private Credit", "Financials"],
        "related_assets":        ["ARES", "APO", "BX", "KKR", "OWL"],
        "related_macro_factors": ["Credit Spreads", "Yield Curve", "NIM", "M&A Flow"],
        "second_order_effects": [
            "Alternative credit managers capture fee revenue banks cannot generate under Basel III",
            "Direct lending spread widening raises the hurdle rate for leveraged buyouts",
            "CLO formation activity signals risk appetite and flows into high-yield credit markets",
            "BDC NAV pressure can signal systemic middle-market credit quality deterioration",
        ],
        "podcast_topics": ["Private Markets", "Markets"],
    },
    "glp1-healthcare-revolution": {
        "name":        "GLP-1 Healthcare Revolution",
        "description": "Obesity drug pipeline reshaping pharmaceutical, food, medical device, and healthcare sectors",
        "keywords": [
            "glp-1", "ozempic", "wegovy", "mounjaro", "obesity drug", "weight loss drug",
            "semaglutide", "tirzepatide", "metabolic disease", "diabetes drug",
            "anti-obesity", "eli lilly", "novo nordisk", "glp1",
        ],
        "entities": frozenset({
            "LLY", "NVO", "PFE", "ABBV", "BMY", "JNJ", "ISRG", "UNH",
        }),
        "related_industries":    ["Healthcare"],
        "related_assets":        ["LLY", "NVO", "UNH", "ABBV"],
        "related_macro_factors": ["FDA Calendar", "GLP-1 Pipeline", "Drug Pricing Policy", "IRA Impact"],
        "second_order_effects": [
            "Medical device makers face volume headwinds as obesity drugs reduce surgical intervention rates",
            "Food and beverage companies face potential secular demand shift from reduced caloric intake",
            "Health insurers benefit from reduced obesity-related comorbidity costs long-term",
            "AI drug discovery investment accelerates as GLP-1 success validates large-molecule platforms",
        ],
        "podcast_topics": ["Company", "Markets"],
    },
    "china-stimulus-rotation": {
        "name":        "China Stimulus Rotation",
        "description": "China policy support and demand recovery driving EM, commodities, and industrial rotation",
        "keywords": [
            "china stimulus", "pboc", "beijing stimulus", "chinese economy", "china pmi",
            "china demand", "property sector", "china growth", "yuan stimulus",
            "renminbi", "china policy easing", "china infrastructure",
        ],
        "entities": frozenset({
            "BABA", "JD", "PDD", "NIO", "BYD", "FCX", "VALE", "BHP", "AA", "ALB",
        }),
        "related_industries":    ["Energy", "Semiconductors", "Industrials"],
        "related_assets":        ["FCX", "VALE", "BHP", "AA"],
        "related_macro_factors": ["China PMI", "USD/CNY", "Copper Price", "Iron Ore"],
        "second_order_effects": [
            "Chinese commodity demand recovery lifts base metals pricing and EM producer margins",
            "Luxury and consumer goods companies with China exposure see earnings revision upside",
            "China supply chain normalization reduces goods inflation pressure in developed markets",
            "CNY appreciation creates EM currency tailwind and reduces dollar-debt servicing costs",
        ],
        "podcast_topics": ["Macro", "Markets", "Geopolitical"],
    },
    "energy-security": {
        "name":        "Energy Security",
        "description": "Geopolitical supply disruptions and strategic reserves driving energy price volatility",
        "keywords": [
            "opec", "oil supply", "lng export", "energy security", "pipeline disruption",
            "oil embargo", "natural gas shortage", "energy crisis", "oil price spike",
            "opec cut", "opec production", "oil sanction", "gas supply",
        ],
        "entities": frozenset({
            "XOM", "CVX", "COP", "SLB", "HAL", "OXY", "VLO", "LNG", "CQP",
        }),
        "related_industries":    ["Energy", "LNG", "Energy Transition"],
        "related_assets":        ["XOM", "CVX", "COP", "LNG"],
        "related_macro_factors": ["WTI Price", "OPEC+ Quota", "NG Inventory", "LNG Demand"],
        "second_order_effects": [
            "Energy price inflation sustains breakeven expectations and reduces probability of rate cuts",
            "Commodity FX (CAD, NOK, AUD) appreciates with crude creating parallel positioning opportunities",
            "Airlines and freight carriers face margin compression from jet fuel cost escalation",
            "Consumer discretionary spending faces headwinds from higher energy bills and fuel costs",
        ],
        "podcast_topics": ["Markets", "Geopolitical", "Macro"],
    },
    "liquidity-tightening": {
        "name":        "Liquidity Tightening",
        "description": "Credit availability reduction and balance sheet stress transmitting through leveraged sectors",
        "keywords": [
            "credit tightening", "bank lending standards", "commercial real estate loan",
            "bank stress", "regional bank", "credit crunch", "liquidity risk",
            "cre default", "office vacancy", "cmbs spread", "loan refinancing",
            "credit conditions", "capital requirements", "bank capital",
        ],
        "entities": frozenset({
            "BAC", "C", "WFC", "JPM", "SPG", "VNO", "SLG", "PLD", "DLR",
        }),
        "related_industries":    ["Financials", "Real Estate", "Private Credit"],
        "related_assets":        ["BAC", "C", "SPG", "VNO"],
        "related_macro_factors": ["Credit Spreads", "CRE Vacancy", "10Y Yield", "CMBS Spreads"],
        "second_order_effects": [
            "Commercial real estate valuation marks trigger bank loan book impairments",
            "Small business credit availability reduction feeds through to capex and hiring",
            "Consumer delinquency rates rising as revolving credit tightens spending capacity",
            "Private credit spreads widen as risk-free rises raising the overall leverage hurdle",
        ],
        "podcast_topics": ["Markets", "Macro"],
    },
    "semiconductor-capex-cycle": {
        "name":        "Semiconductor Capex Cycle",
        "description": "AI-driven chip demand sustaining elevated equipment, memory, and foundry investment cycles",
        "keywords": [
            "semiconductor capex", "chip demand", "fab investment", "gpu supply",
            "wafer production", "memory demand", "hbm memory", "advanced packaging",
            "export control chip", "chips act", "tsmc capacity", "samsung fab",
            "intel foundry", "chip shortage", "chip oversupply",
        ],
        "entities": frozenset({
            "NVDA", "AMD", "INTC", "TSMC", "ASML", "AMAT", "LRCX", "KLAC", "MU", "AVGO", "QCOM",
        }),
        "related_industries":    ["Semiconductors", "AI Infrastructure"],
        "related_assets":        ["NVDA", "AMD", "ASML", "MU", "AMAT"],
        "related_macro_factors": ["AI Capex", "Export Controls", "GPU Supply", "TSMC Yield"],
        "second_order_effects": [
            "Semiconductor equipment makers benefit from both domestic and TSMC capacity expansion",
            "Export controls concentrate leading-edge foundry share at TSMC creating domestic alternatives",
            "Memory cycle recovery creates earnings uplift for DRAM and NAND producers",
            "Advanced packaging demand creates incremental revenue for substrate and materials suppliers",
        ],
        "podcast_topics": ["Tech / AI", "Company"],
    },
    "digital-asset-institutionalization": {
        "name":        "Digital Asset Institutionalization",
        "description": "Institutional adoption and regulatory clarity driving structural demand for digital assets",
        "keywords": [
            "bitcoin", "btc", "crypto", "digital asset", "spot bitcoin etf",
            "ethereum", "blockchain", "stablecoin", "crypto regulation",
            "sec crypto", "microstrategy", "institutional crypto", "crypto adoption",
            "bitcoin etf", "crypto market",
        ],
        "entities": frozenset({
            "COIN", "MSTR", "MARA", "RIOT", "SQ", "PYPL",
        }),
        "related_industries":    ["Crypto Infrastructure", "Financials"],
        "related_assets":        ["COIN", "MSTR", "MARA", "BTC"],
        "related_macro_factors": ["BTC ETF Flows", "Fed Policy", "Stablecoin Regulation", "Halving Cycle"],
        "second_order_effects": [
            "Bitcoin ETF approval separated institutional demand from retail speculation cycles",
            "Stablecoin regulatory clarity enables bank-grade digital payments infrastructure",
            "Mining hardware demand follows crypto price cycle with a 3-6 month lag",
            "Exchange consolidation accelerates as regulatory costs favor scaled operators",
        ],
        "podcast_topics": ["Markets", "Tech / AI"],
    },
    "nuclear-power-renaissance": {
        "name":        "Nuclear Power Renaissance",
        "description": "Data center power demand and energy security driving nuclear capacity revival",
        "keywords": [
            "nuclear power", "uranium", "smr", "small modular reactor", "nuclear plant",
            "nuclear reactor", "enrichment", "nuclear energy", "nuclear ppa",
            "nuclear capacity", "nuclear license", "nuclear revival",
        ],
        "entities": frozenset({
            "CEG", "VST", "CCJ", "UEC",
        }),
        "related_industries":    ["Nuclear", "Utilities", "Energy Security"],
        "related_assets":        ["CEG", "VST", "CCJ", "UEC"],
        "related_macro_factors": ["Nuclear PPA", "Power Load Growth", "Uranium Price", "AI Power Demand"],
        "second_order_effects": [
            "Nuclear PPAs create pricing premium decoupling merchant generators from regulated utility peers",
            "Uranium supply concentration in Kazakhstan creates strategic supply chain vulnerability",
            "SMR technology approvals could accelerate deployment timelines and reduce capital intensity",
            "Nuclear baseload competes with LNG peaker capacity for data center anchor power contracts",
        ],
        "podcast_topics": ["Markets", "Tech / AI"],
    },
    "consumer-stress": {
        "name":        "Consumer Stress",
        "description": "Credit tightening, real wage pressure, and delinquency acceleration weighing on household spending",
        "keywords": [
            "consumer spending", "retail sales", "credit card delinquency", "consumer credit",
            "real wages", "consumer confidence", "spending slowdown",
            "delinquency rate", "household debt", "consumer sentiment",
            "retail slowdown", "discretionary spending",
        ],
        "entities": frozenset({
            "WMT", "TGT", "COST", "MCD", "SBUX", "HD", "NKE", "AMZN",
        }),
        "related_industries":    ["Consumer", "Financials"],
        "related_assets":        ["WMT", "TGT", "HD", "AMZN"],
        "related_macro_factors": ["Real Wages", "CPI Delta", "Credit Utilization", "Savings Rate"],
        "second_order_effects": [
            "Value channel retailers gain share as discretionary spending bifurcates by income cohort",
            "Revolving credit utilization rise signals spending velocity compression 3-6 months ahead",
            "Restaurant and leisure names face traffic decline as consumers cut non-essential spending",
            "Auto delinquency acceleration historically leads broader consumer credit quality deterioration",
        ],
        "podcast_topics": ["Macro", "Markets", "Company"],
    },
}


# ── Extraction engine ─────────────────────────────────────────────────────────

def extract_themes(
    clusters: list,    # list[StoryCluster]
    now:      datetime | None = None,
) -> list[ThemeIntelligence]:
    """
    Score all clusters against each theme in THEME_CATALOG.
    Returns active themes sorted by confidence descending.

    Matching uses entity overlap (+3 per matching entity, capped at 9) and
    keyword presence in normalised title (+2) or snippet (+1).
    Theme score is weighted by cluster.cluster_score to prioritise WMN-ranked stories.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    results: list[ThemeIntelligence] = []

    for theme_id, cfg in THEME_CATALOG.items():
        theme_keywords  = cfg["keywords"]
        theme_entities  = cfg["entities"]   # frozenset[str]
        contributing    = []                 # (cluster, raw_score)
        sentiments: list[str] = []
        total_score     = 0.0

        for cluster in clusters:
            item       = cluster.primary
            title_n    = _norm(getattr(item, "title",   "") or "")
            snippet_n  = _norm(getattr(item, "snippet", "") or "")
            entities   = {e.upper() for e in (getattr(item, "affected_entities", None) or [])}

            raw = 0.0

            # Entity overlap (capped so one super-story can't inflate alone)
            entity_hits = sum(1 for e in theme_entities if e in entities)
            raw += min(entity_hits * 3.0, 9.0)

            # Keyword match (title is worth more than snippet)
            for kw in theme_keywords:
                kw_p = f" {kw} "
                if kw_p in title_n:
                    raw += 2.0
                    break
                elif kw_p in snippet_n:
                    raw += 1.0
                    break

            if raw <= 0:
                continue

            # Weight by cluster importance (cluster_score is 0-∞; typical range 0-2)
            weight  = 1.0 + min(getattr(cluster, "cluster_score", 0.0), 2.0) * 0.4
            weighted = raw * weight
            total_score += weighted
            contributing.append((cluster, weighted))
            sentiments.append(_item_sentiment(item))

        # Require meaningful signal before creating a theme entry
        if total_score < 4.0 or not contributing:
            continue

        # Signal strength
        n_clusters = len(contributing)
        if total_score >= 18 or n_clusters >= 5:
            sig = "strong"
        elif total_score >= 7 or n_clusters >= 2:
            sig = "medium"
        else:
            sig = "weak"

        # Confidence 0-100
        confidence = min(95, int(total_score * 2.5 + n_clusters * 5))

        # Momentum from majority sentiment across contributing stories
        momentum = _majority_sentiment(sentiments)

        # Top contributing cluster IDs (by weighted score, capped at 5)
        contributing.sort(key=lambda x: x[1], reverse=True)
        top_clusters  = [c for c, _ in contributing[:5]]
        cluster_ids   = [c.id for c in top_clusters]
        story_count   = sum(getattr(c, "story_count", 1) for c in top_clusters)

        results.append(ThemeIntelligence(
            id                       = theme_id,
            name                     = cfg["name"],
            description              = cfg["description"],
            signal_strength          = sig,
            confidence               = confidence,
            momentum_direction       = momentum,
            related_industries       = list(cfg["related_industries"]),
            related_assets           = list(cfg["related_assets"]),
            related_macro_factors    = list(cfg["related_macro_factors"]),
            contributing_cluster_ids = cluster_ids,
            contributing_story_count = story_count,
            second_order_effects     = list(cfg["second_order_effects"]),
            podcast_topics           = list(cfg["podcast_topics"]),
            last_updated             = now_iso,
        ))

    results.sort(key=lambda t: t.confidence, reverse=True)
    return results
