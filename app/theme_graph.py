"""
app/theme_graph.py — Cross-market theme intelligence graph.

Phase 5 upgrade: weighted relationship graph, enhanced confidence scoring,
ThemeMomentumTracker for temporal persistence, and signal quality classification.
Zero LLM calls.

Each ThemeIntelligence object maps:
  story → theme → industry → asset → macro factor → second-order effect

Phase 5 additions:
  - relationship_graph per theme (direct/indirect/macro_overlap/narrative + weight + direction)
  - ThemeMomentumTracker: rolling cycle snapshots, momentum label, persistence
  - Confidence formula extended with source diversity, cross-category, and recency bonuses
  - Signal quality classification: "confirmed" | "developing" | "speculative"
  - confidence_label, evidence_count, persistence_score, volatility_score
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING

log = logging.getLogger(__name__)

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
    # Phase 5: weighted relationship graph
    # Maps industry/sector name → {weight: float, type: str, direction: str}
    relationship_weights:     dict[str, dict] = field(default_factory=dict)
    # Phase 5: enhanced confidence signals
    confidence_label:         str            = ""           # "High Conviction" | "Elevated" | "Moderate" | "Developing" | "Speculative"
    signal_quality:           str            = "speculative" # "confirmed" | "developing" | "speculative"
    evidence_count:           int            = 0            # unique contributing sources
    persistence_score:        int            = 0            # 0-100 based on cycle history
    volatility_score:         int            = 0            # 0-100 based on confidence variance
    cross_category_confirmed: bool           = False        # true if 2+ news categories contributing
    # Phase 5: momentum tracking
    momentum_label:           str            = "emerging"   # "accelerating"|"strengthening"|"stable"|"cooling"|"reversing"|"emerging"
    momentum_delta:           int            = 0            # confidence change vs previous cycle
    persistence_cycles:       int            = 0            # consecutive cycles theme was active


# ── Momentum tracker ──────────────────────────────────────────────────────────

@dataclass
class _ThemeSnapshot:
    confidence:      int
    signal_strength: str
    timestamp:       datetime


class ThemeMomentumTracker:
    """
    In-memory rolling tracker for theme confidence across pipeline cycles.

    Holds at most max_history snapshots per theme (default 12 = ~1 hour at
    5-minute refresh intervals).  Lives as a module-level singleton so state
    persists across background pipeline runs within the same process lifetime.

    Momentum labels:
      "emerging"      — fewer than 2 snapshots (brand-new theme)
      "accelerating"  — confidence up ≥12 pts over window
      "strengthening" — confidence up 4–11 pts over window
      "stable"        — confidence flat (±3 pts)
      "cooling"       — confidence down 4–11 pts
      "reversing"     — confidence down ≥12 pts (may be fading)
    """

    def __init__(self, max_history: int = 12) -> None:
        self._history: dict[str, list[_ThemeSnapshot]] = {}
        self._max = max_history

    def record(self, theme_id: str, confidence: int, strength: str, now: datetime) -> None:
        snaps = self._history.setdefault(theme_id, [])
        snaps.append(_ThemeSnapshot(confidence=confidence, signal_strength=strength, timestamp=now))
        if len(snaps) > self._max:
            snaps.pop(0)

    def momentum_label(self, theme_id: str) -> str:
        snaps = self._history.get(theme_id, [])
        if len(snaps) < 2:
            return "emerging"
        window = snaps[-min(4, len(snaps)):]
        delta  = snaps[-1].confidence - window[0].confidence
        if delta >= 12:  return "accelerating"
        if delta >= 4:   return "strengthening"
        if delta <= -12: return "reversing"
        if delta <= -4:  return "cooling"
        return "stable"

    def prev_delta(self, theme_id: str) -> int:
        """Confidence delta between the last two recorded snapshots."""
        snaps = self._history.get(theme_id, [])
        if len(snaps) < 2:
            return 0
        return snaps[-1].confidence - snaps[-2].confidence

    def persistence_cycles(self, theme_id: str) -> int:
        return len(self._history.get(theme_id, []))

    def volatility_score(self, theme_id: str) -> int:
        """Standard-deviation-based volatility of recent confidence, scaled 0-100."""
        snaps = self._history.get(theme_id, [])
        if len(snaps) < 3:
            return 0
        vals = [s.confidence for s in snaps[-6:]]
        mean = sum(vals) / len(vals)
        var  = sum((v - mean) ** 2 for v in vals) / len(vals)
        return min(100, int(var ** 0.5 * 3))

    def persistence_score(self, theme_id: str) -> int:
        """0-100 persistence score based on how many consecutive cycles the theme has been active."""
        n = self.persistence_cycles(theme_id)
        if n <= 0:   return 0
        if n <= 2:   return 20
        if n <= 5:   return 45
        if n <= 10:  return 70
        if n <= 20:  return 85
        return 95


# Module-level singleton — accumulates history across background refresh cycles
_momentum_tracker = ThemeMomentumTracker()


# ── Theme catalog ─────────────────────────────────────────────────────────────
# Each entry defines: keywords, entities, static relationship graph (industries,
# assets, macro factors), second-order effects, podcast topics, and Phase 5
# weighted relationship_graph mapping impacted industries/sectors to
# {weight, type, direction}.
#
# relationship_graph types:
#   "direct"       — primary causal mechanism
#   "indirect"     — flows through an intermediate channel
#   "macro_overlap"— shares a common macro driver
#   "narrative"    — thematic/sentiment correlation
#
# relationship_graph directions:
#   "positive" — theme is bullish for this industry/sector
#   "negative" — theme is bearish for this industry/sector

THEME_CATALOG: dict[str, dict] = {
    "ai-energy-demand": {
        "name":        "AI Energy Demand",
        "description": "AI data center buildout driving a structural step-change in power demand",
        "keywords": [
            # Original
            "power demand", "data center", "ai infrastructure", "electricity demand",
            "grid load", "nuclear ppa", "power grid", "hyperscaler power",
            "ai power", "data center power", "gpu cluster", "compute power",
            # Broadened: company names & common phrasings
            "hyperscaler", "ai capex", "data centre", "ai compute", "power consumption",
            "energy demand", "electricity costs", "power contract", "capacity expansion",
            "nvidia ai", "microsoft ai", "google ai", "amazon ai", "meta ai",
            "ai model training", "inference demand", "ai spending", "ai investment",
            "renewable ppa", "grid capacity", "power grid upgrade", "electricity grid",
            # Single-word triggers
            "ai", "openai", "anthropic",
        ],
        "entities": frozenset({
            "NVDA", "MSFT", "GOOGL", "AMZN", "META", "CEG", "VST",
            "NEE", "EQIX", "DLR", "AEP", "EXC",
            # Full names for text-scan entity matching
            "Nvidia", "Microsoft", "Google", "Alphabet", "Amazon", "Meta",
            "Constellation", "Vistra", "NextEra", "OpenAI", "Anthropic",
        }),
        "related_industries":    ["Semiconductors", "Software", "Utilities", "Energy", "Real Estate"],
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
        "relationship_graph": {
            "Semiconductors": {"weight": 0.95, "type": "direct",        "direction": "positive"},
            "Software":       {"weight": 0.88, "type": "direct",        "direction": "positive"},
            "Utilities":      {"weight": 0.85, "type": "indirect",      "direction": "positive"},
            "Energy":         {"weight": 0.58, "type": "macro_overlap", "direction": "positive"},
            "Real Estate":    {"weight": 0.48, "type": "indirect",      "direction": "positive"},
        },
    },
    "treasury-yield-pressure": {
        "name":        "Treasury Yield Pressure",
        "description": "Elevated or rising yields compressing duration assets and driving cross-asset rotation",
        "keywords": [
            # Original
            "treasury yield", "10-year yield", "yield curve", "rate hike", "fed rate",
            "bond selloff", "yield spike", "inflation data", "cpi print",
            "fomc", "higher for longer", "term premium", "duration risk",
            # Broadened
            "interest rates", "yields rise", "yields climb", "yields surge",
            "rate cut", "rate cuts", "rate decision", "fed decision",
            "federal reserve", "inflation report", "cpi data", "cpi reading",
            "bond market", "treasury market", "yield inversion", "10 year treasury",
            "rate expectations", "monetary policy", "fed pivot", "fed pause",
            "rate outlook", "bond yields", "yield pressure", "rate hikes",
            "treasury yields",
            # Single-word triggers for common macro headlines
            "inflation", "yields", "rates", "cpi", "treasury",
        ],
        "entities": frozenset({
            "Treasury", "Treasuries", "10Y", "2Y", "30Y", "Fed", "FOMC",
            "Bonds", "Yields",
            # Extended
            "Federal Reserve", "Powell", "TLT", "TNX", "Inflation",
            "JPM", "BAC", "GS", "MS",
        }),
        "related_industries":    ["Software", "Real Estate", "Financials", "Utilities", "Consumer"],
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
        "relationship_graph": {
            "Software":    {"weight": 0.84, "type": "direct",        "direction": "negative"},
            "Real Estate": {"weight": 0.79, "type": "direct",        "direction": "negative"},
            "Financials":  {"weight": 0.73, "type": "direct",        "direction": "positive"},
            "Utilities":   {"weight": 0.42, "type": "macro_overlap", "direction": "negative"},
            "Consumer":    {"weight": 0.35, "type": "narrative",     "direction": "negative"},
        },
    },
    "defense-reindustrialization": {
        "name":        "Defense Reindustrialization",
        "description": "Geopolitical escalation and NATO commitments driving multi-year defense procurement expansion",
        "keywords": [
            # Original
            "defense spending", "military budget", "nato", "pentagon", "defense procurement",
            "weapons system", "fighter jet", "defense contract", "ndaa",
            "defense backlog", "rearmament", "military aid", "drone warfare",
            # Broadened
            "lockheed", "raytheon", "northrop", "general dynamics", "boeing defense",
            "military spending", "defense budget", "ukraine war", "taiwan strait",
            "geopolitical tension", "nato spending", "defense stocks", "defense order",
            "missile system", "stealth fighter", "naval vessel", "troop deployment",
            "arms deal", "weapons contract", "military contract",
            # Single-word triggers
            "defense", "military", "ukraine", "taiwan",
        ],
        "entities": frozenset({
            "LMT", "RTX", "NOC", "GD", "BA", "GE", "HII", "KTOS",
            # Full names
            "Lockheed", "Raytheon", "Northrop", "Boeing", "General Dynamics",
        }),
        "related_industries":    ["Aerospace & Defense", "Industrials", "Semiconductors", "Energy"],
        "related_assets":        ["LMT", "RTX", "NOC", "GD"],
        "related_macro_factors": ["NATO Budgets", "Defense Backlog", "NDAA", "Geopolitical Risk"],
        "second_order_effects": [
            "Multi-year order books create durable earnings visibility decoupled from economic cycles",
            "European defense consolidation creates M&A activity among second-tier contractors",
            "Rare earth supply chains for defense hardware face strategic stockpiling pressure",
            "Dual-use technology in semiconductors and drones benefits civil and defense sectors",
        ],
        "podcast_topics": ["Geopolitical", "Markets"],
        "relationship_graph": {
            "Aerospace & Defense": {"weight": 0.97, "type": "direct",        "direction": "positive"},
            "Industrials":         {"weight": 0.82, "type": "direct",        "direction": "positive"},
            "Semiconductors":      {"weight": 0.54, "type": "indirect",      "direction": "positive"},
            "Energy":              {"weight": 0.38, "type": "macro_overlap", "direction": "positive"},
        },
    },
    "private-credit-expansion": {
        "name":        "Private Credit Expansion",
        "description": "Alternative lenders capturing market share as banks retreat under capital constraints",
        "keywords": [
            # Original
            "private credit", "direct lending", "leveraged loan", "bdc",
            "clo", "middle market", "nav loan", "private debt", "alternative lending",
            "shadow banking", "non-bank lender", "credit facility", "capital solutions",
            # Broadened
            "blackstone", "apollo", "ares", "kkr", "credit manager",
            "private equity", "credit market", "loan market", "debt deal",
            "alternative credit", "leveraged finance", "high yield", "credit spread",
            # Single-word triggers
            "blackstone", "apollo", "ares", "buyout",
        ],
        "entities": frozenset({
            "BX", "KKR", "ARES", "APO", "OWL",
            # Full names
            "Blackstone", "Apollo", "KKR", "Carlyle",
        }),
        "related_industries":    ["Financials", "Real Estate"],
        "related_assets":        ["ARES", "APO", "BX", "KKR", "OWL"],
        "related_macro_factors": ["Credit Spreads", "Yield Curve", "NIM", "M&A Flow"],
        "second_order_effects": [
            "Alternative credit managers capture fee revenue banks cannot generate under Basel III",
            "Direct lending spread widening raises the hurdle rate for leveraged buyouts",
            "CLO formation activity signals risk appetite and flows into high-yield credit markets",
            "BDC NAV pressure can signal systemic middle-market credit quality deterioration",
        ],
        "podcast_topics": ["Private Markets", "Markets"],
        "relationship_graph": {
            "Financials":  {"weight": 0.90, "type": "direct",        "direction": "positive"},
            "Real Estate": {"weight": 0.45, "type": "macro_overlap", "direction": "negative"},
        },
    },
    "glp1-healthcare-revolution": {
        "name":        "GLP-1 Healthcare Revolution",
        "description": "Obesity drug pipeline reshaping pharmaceutical, food, medical device, and healthcare sectors",
        "keywords": [
            # Original
            "glp-1", "ozempic", "wegovy", "mounjaro", "obesity drug", "weight loss drug",
            "semaglutide", "tirzepatide", "metabolic disease", "diabetes drug",
            "anti-obesity", "eli lilly", "novo nordisk", "glp1",
            # Broadened
            "weight loss", "obesity treatment", "diabetes treatment", "lilly",
            "pharmaceutical earnings", "drug approval", "fda approval", "clinical trial",
            "drug pipeline", "biotech drug", "healthcare earnings", "pharma earnings",
            # Single-word triggers (glp-1 normalizes to "glp 1" via _PUNCT_RE — both covered now)
            "fda", "lilly", "obesity", "biotech", "healthcare",
        ],
        "entities": frozenset({
            "LLY", "NVO", "PFE", "ABBV", "BMY", "JNJ", "ISRG", "UNH",
            # Full names
            "Lilly", "Novo Nordisk", "Pfizer", "AbbVie", "Johnson", "UnitedHealth",
        }),
        "related_industries":    ["Healthcare", "Consumer"],
        "related_assets":        ["LLY", "NVO", "UNH", "ABBV"],
        "related_macro_factors": ["FDA Calendar", "GLP-1 Pipeline", "Drug Pricing Policy", "IRA Impact"],
        "second_order_effects": [
            "Medical device makers face volume headwinds as obesity drugs reduce surgical intervention rates",
            "Food and beverage companies face potential secular demand shift from reduced caloric intake",
            "Health insurers benefit from reduced obesity-related comorbidity costs long-term",
            "AI drug discovery investment accelerates as GLP-1 success validates large-molecule platforms",
        ],
        "podcast_topics": ["Company", "Markets"],
        "relationship_graph": {
            "Healthcare":  {"weight": 0.95, "type": "direct",        "direction": "positive"},
            "Consumer":    {"weight": 0.41, "type": "indirect",      "direction": "negative"},
            "Financials":  {"weight": 0.28, "type": "narrative",     "direction": "positive"},
        },
    },
    "china-stimulus-rotation": {
        "name":        "China Stimulus Rotation",
        "description": "China policy support and demand recovery driving EM, commodities, and industrial rotation",
        "keywords": [
            # Original
            "china stimulus", "pboc", "beijing stimulus", "chinese economy", "china pmi",
            "china demand", "property sector", "china growth", "yuan stimulus",
            "renminbi", "china policy easing", "china infrastructure",
            # Broadened
            "china economy", "china market", "chinese stocks", "china trade",
            "beijing policy", "pboc rate", "china recovery", "china slowdown",
            "china gdp", "china exports", "china imports", "copper demand",
            "iron ore", "commodity demand", "emerging market",
            # Single-word triggers
            "china", "chinese", "beijing",
        ],
        "entities": frozenset({
            "BABA", "JD", "PDD", "NIO", "BYD", "FCX", "VALE", "BHP", "AA", "ALB",
            # Extended
            "Alibaba", "China", "PBOC",
        }),
        "related_industries":    ["Energy", "Semiconductors", "Industrials", "Consumer"],
        "related_assets":        ["FCX", "VALE", "BHP", "AA"],
        "related_macro_factors": ["China PMI", "USD/CNY", "Copper Price", "Iron Ore"],
        "second_order_effects": [
            "Chinese commodity demand recovery lifts base metals pricing and EM producer margins",
            "Luxury and consumer goods companies with China exposure see earnings revision upside",
            "China supply chain normalization reduces goods inflation pressure in developed markets",
            "CNY appreciation creates EM currency tailwind and reduces dollar-debt servicing costs",
        ],
        "podcast_topics": ["Macro", "Markets", "Geopolitical"],
        "relationship_graph": {
            "Energy":         {"weight": 0.72, "type": "direct",        "direction": "positive"},
            "Industrials":    {"weight": 0.65, "type": "macro_overlap", "direction": "positive"},
            "Semiconductors": {"weight": 0.55, "type": "indirect",      "direction": "positive"},
            "Consumer":       {"weight": 0.35, "type": "narrative",     "direction": "positive"},
        },
    },
    "energy-security": {
        "name":        "Energy Security",
        "description": "Geopolitical supply disruptions and strategic reserves driving energy price volatility",
        "keywords": [
            # Original
            "opec", "oil supply", "lng export", "energy security", "pipeline disruption",
            "oil embargo", "natural gas shortage", "energy crisis", "oil price spike",
            "opec cut", "opec production", "oil sanction", "gas supply",
            # Broadened
            "oil prices", "crude prices", "oil price", "crude oil", "brent crude",
            "wti crude", "opec meeting", "energy supply", "natural gas prices",
            "gasoline prices", "oil output", "oil demand", "energy market",
            "exxon", "chevron", "shell", "energy earnings", "oil company",
            # Single-word triggers
            "oil", "crude", "opec", "brent", "wti",
        ],
        "entities": frozenset({
            "XOM", "CVX", "COP", "SLB", "HAL", "OXY", "VLO", "LNG", "CQP",
            # Full names
            "Exxon", "Chevron", "ConocoPhillips", "Shell", "BP", "OPEC",
        }),
        "related_industries":    ["Energy", "Utilities", "Consumer", "Aerospace & Defense"],
        "related_assets":        ["XOM", "CVX", "COP", "LNG"],
        "related_macro_factors": ["WTI Price", "OPEC+ Quota", "NG Inventory", "LNG Demand"],
        "second_order_effects": [
            "Energy price inflation sustains breakeven expectations and reduces probability of rate cuts",
            "Commodity FX (CAD, NOK, AUD) appreciates with crude creating parallel positioning opportunities",
            "Airlines and freight carriers face margin compression from jet fuel cost escalation",
            "Consumer discretionary spending faces headwinds from higher energy bills and fuel costs",
        ],
        "podcast_topics": ["Markets", "Geopolitical", "Macro"],
        "relationship_graph": {
            "Energy":              {"weight": 0.95, "type": "direct",        "direction": "positive"},
            "Utilities":           {"weight": 0.58, "type": "indirect",      "direction": "positive"},
            "Consumer":            {"weight": 0.42, "type": "macro_overlap", "direction": "negative"},
            "Aerospace & Defense": {"weight": 0.36, "type": "narrative",     "direction": "positive"},
            "Industrials":         {"weight": 0.32, "type": "narrative",     "direction": "positive"},
        },
    },
    "liquidity-tightening": {
        "name":        "Liquidity Tightening",
        "description": "Credit availability reduction and balance sheet stress transmitting through leveraged sectors",
        "keywords": [
            # Original
            "credit tightening", "bank lending standards", "commercial real estate loan",
            "bank stress", "regional bank", "credit crunch", "liquidity risk",
            "cre default", "office vacancy", "cmbs spread", "loan refinancing",
            "credit conditions", "capital requirements", "bank capital",
            # Broadened
            "bank earnings", "loan loss", "credit quality", "default rate",
            "mortgage delinquency", "office market", "real estate stress",
            "financial stress", "credit access", "lending tightens",
            "jpmorgan", "bank of america", "wells fargo", "citigroup",
            # Single-word triggers
            "delinquency", "defaults", "foreclosure",
        ],
        "entities": frozenset({
            "BAC", "C", "WFC", "JPM", "SPG", "VNO", "SLG", "PLD", "DLR",
            # Full names
            "Bank of America", "JPMorgan", "Wells Fargo", "Citigroup",
        }),
        "related_industries":    ["Financials", "Real Estate", "Consumer", "Industrials"],
        "related_assets":        ["BAC", "C", "SPG", "VNO"],
        "related_macro_factors": ["Credit Spreads", "CRE Vacancy", "10Y Yield", "CMBS Spreads"],
        "second_order_effects": [
            "Commercial real estate valuation marks trigger bank loan book impairments",
            "Small business credit availability reduction feeds through to capex and hiring",
            "Consumer delinquency rates rising as revolving credit tightens spending capacity",
            "Private credit spreads widen as risk-free rises raising the overall leverage hurdle",
        ],
        "podcast_topics": ["Markets", "Macro"],
        "relationship_graph": {
            "Financials":  {"weight": 0.81, "type": "direct",        "direction": "negative"},
            "Real Estate": {"weight": 0.88, "type": "direct",        "direction": "negative"},
            "Consumer":    {"weight": 0.55, "type": "macro_overlap", "direction": "negative"},
            "Industrials": {"weight": 0.32, "type": "narrative",     "direction": "negative"},
        },
    },
    "semiconductor-capex-cycle": {
        "name":        "Semiconductor Capex Cycle",
        "description": "AI-driven chip demand sustaining elevated equipment, memory, and foundry investment cycles",
        "keywords": [
            # Original
            "semiconductor capex", "chip demand", "fab investment", "gpu supply",
            "wafer production", "memory demand", "hbm memory", "advanced packaging",
            "export control chip", "chips act", "tsmc capacity", "samsung fab",
            "intel foundry", "chip shortage", "chip oversupply",
            # Broadened
            "nvidia earnings", "amd earnings", "chip stocks", "semiconductor stocks",
            "gpu demand", "ai chip", "chip exports", "chip ban", "chip tariff",
            "nvidia revenue", "semiconductor revenue", "chip sales", "chip revenue",
            "tsmc earnings", "amd results", "nvidia results", "gpu shortage",
            "chips", "semiconductor", "chipmaker",
            # Single-word triggers
            "nvidia", "amd", "tsmc", "broadcom", "qualcomm",
        ],
        "entities": frozenset({
            "NVDA", "AMD", "INTC", "TSMC", "ASML", "AMAT", "LRCX", "KLAC", "MU", "AVGO", "QCOM",
            # Full names
            "Nvidia", "AMD", "Intel", "TSMC", "Broadcom", "Qualcomm", "Micron",
        }),
        "related_industries":    ["Semiconductors", "Software", "Energy", "Real Estate"],
        "related_assets":        ["NVDA", "AMD", "ASML", "MU", "AMAT"],
        "related_macro_factors": ["AI Capex", "Export Controls", "GPU Supply", "TSMC Yield"],
        "second_order_effects": [
            "Semiconductor equipment makers benefit from both domestic and TSMC capacity expansion",
            "Export controls concentrate leading-edge foundry share at TSMC creating domestic alternatives",
            "Memory cycle recovery creates earnings uplift for DRAM and NAND producers",
            "Advanced packaging demand creates incremental revenue for substrate and materials suppliers",
        ],
        "podcast_topics": ["Tech / AI", "Company"],
        "relationship_graph": {
            "Semiconductors": {"weight": 0.97, "type": "direct",        "direction": "positive"},
            "Software":       {"weight": 0.75, "type": "direct",        "direction": "positive"},
            "Real Estate":    {"weight": 0.50, "type": "indirect",      "direction": "positive"},
            "Energy":         {"weight": 0.38, "type": "macro_overlap", "direction": "positive"},
        },
    },
    "digital-asset-institutionalization": {
        "name":        "Digital Asset Institutionalization",
        "description": "Institutional adoption and regulatory clarity driving structural demand for digital assets",
        "keywords": [
            # Original
            "bitcoin", "btc", "crypto", "digital asset", "spot bitcoin etf",
            "ethereum", "blockchain", "stablecoin", "crypto regulation",
            "sec crypto", "microstrategy", "institutional crypto", "crypto adoption",
            "bitcoin etf", "crypto market",
            # Broadened
            "bitcoin price", "crypto price", "btc price", "eth price", "ethereum price",
            "crypto rally", "crypto selloff", "bitcoin rally", "bitcoin drop",
            "coinbase earnings", "coinbase revenue", "crypto exchange",
            "digital assets", "crypto assets", "bitcoin halving",
            # Single-word triggers
            "bitcoin", "crypto", "ethereum", "btc", "coinbase",
        ],
        "entities": frozenset({
            "COIN", "MSTR", "MARA", "RIOT", "SQ", "PYPL",
            # Full names and tokens
            "Bitcoin", "Ethereum", "BTC", "ETH", "Coinbase", "MicroStrategy",
        }),
        "related_industries":    ["Crypto & Digital Assets", "Financials", "Software"],
        "related_assets":        ["COIN", "MSTR", "MARA", "BTC"],
        "related_macro_factors": ["BTC ETF Flows", "Fed Policy", "Stablecoin Regulation", "Halving Cycle"],
        "second_order_effects": [
            "Bitcoin ETF approval separated institutional demand from retail speculation cycles",
            "Stablecoin regulatory clarity enables bank-grade digital payments infrastructure",
            "Mining hardware demand follows crypto price cycle with a 3-6 month lag",
            "Exchange consolidation accelerates as regulatory costs favor scaled operators",
        ],
        "podcast_topics": ["Markets", "Tech / AI"],
        "relationship_graph": {
            "Crypto & Digital Assets": {"weight": 0.97, "type": "direct",    "direction": "positive"},
            "Financials":              {"weight": 0.52, "type": "indirect",  "direction": "positive"},
            "Software":                {"weight": 0.28, "type": "narrative", "direction": "positive"},
        },
    },
    "nuclear-power-renaissance": {
        "name":        "Nuclear Power Renaissance",
        "description": "Data center power demand and energy security driving nuclear capacity revival",
        "keywords": [
            # Original
            "nuclear power", "uranium", "smr", "small modular reactor", "nuclear plant",
            "nuclear reactor", "enrichment", "nuclear energy", "nuclear ppa",
            "nuclear capacity", "nuclear license", "nuclear revival",
            # Broadened
            "nuclear deal", "nuclear agreement", "constellation energy", "vistra",
            "cameco", "uranium prices", "uranium demand", "nuclear electricity",
            "nuclear plant restart", "nuclear capacity factor", "clean energy nuclear",
            # Single-word triggers
            "nuclear", "uranium", "constellation", "vistra",
        ],
        "entities": frozenset({
            "CEG", "VST", "CCJ", "UEC",
            # Full names
            "Constellation", "Vistra", "Cameco",
        }),
        "related_industries":    ["Utilities", "Energy", "Semiconductors", "Real Estate"],
        "related_assets":        ["CEG", "VST", "CCJ", "UEC"],
        "related_macro_factors": ["Nuclear PPA", "Power Load Growth", "Uranium Price", "AI Power Demand"],
        "second_order_effects": [
            "Nuclear PPAs create pricing premium decoupling merchant generators from regulated utility peers",
            "Uranium supply concentration in Kazakhstan creates strategic supply chain vulnerability",
            "SMR technology approvals could accelerate deployment timelines and reduce capital intensity",
            "Nuclear baseload competes with LNG peaker capacity for data center anchor power contracts",
        ],
        "podcast_topics": ["Markets", "Tech / AI"],
        "relationship_graph": {
            "Utilities":      {"weight": 0.97, "type": "direct",    "direction": "positive"},
            "Energy":         {"weight": 0.55, "type": "narrative", "direction": "positive"},
            "Semiconductors": {"weight": 0.45, "type": "narrative", "direction": "positive"},
            "Real Estate":    {"weight": 0.40, "type": "indirect",  "direction": "positive"},
        },
    },
    "consumer-stress": {
        "name":        "Consumer Stress",
        "description": "Credit tightening, real wage pressure, and delinquency acceleration weighing on household spending",
        "keywords": [
            # Original
            "consumer spending", "retail sales", "credit card delinquency", "consumer credit",
            "real wages", "consumer confidence", "spending slowdown",
            "delinquency rate", "household debt", "consumer sentiment",
            "retail slowdown", "discretionary spending",
            # Broadened
            "walmart earnings", "target earnings", "amazon consumer", "retail earnings",
            "consumer data", "spending data", "household spending", "consumer demand",
            "credit card spending", "consumer delinquency", "retail traffic",
            "consumer weakness", "spending cuts", "consumer stress",
            # Single-word triggers
            "spending", "retail", "walmart", "delinquency",
        ],
        "entities": frozenset({
            "WMT", "TGT", "COST", "MCD", "SBUX", "HD", "NKE", "AMZN",
            # Full names
            "Walmart", "Target", "Costco", "McDonald", "Starbucks", "Amazon",
        }),
        "related_industries":    ["Consumer", "Financials", "Real Estate", "Industrials"],
        "related_assets":        ["WMT", "TGT", "HD", "AMZN"],
        "related_macro_factors": ["Real Wages", "CPI Delta", "Credit Utilization", "Savings Rate"],
        "second_order_effects": [
            "Value channel retailers gain share as discretionary spending bifurcates by income cohort",
            "Revolving credit utilization rise signals spending velocity compression 3-6 months ahead",
            "Restaurant and leisure names face traffic decline as consumers cut non-essential spending",
            "Auto delinquency acceleration historically leads broader consumer credit quality deterioration",
        ],
        "podcast_topics": ["Macro", "Markets", "Company"],
        "relationship_graph": {
            "Consumer":    {"weight": 0.92, "type": "direct",        "direction": "negative"},
            "Financials":  {"weight": 0.71, "type": "direct",        "direction": "negative"},
            "Real Estate": {"weight": 0.44, "type": "narrative",     "direction": "negative"},
            "Industrials": {"weight": 0.35, "type": "macro_overlap", "direction": "negative"},
        },
    },
}


# ── Extraction engine ─────────────────────────────────────────────────────────

def extract_themes(
    clusters: list,    # list[StoryCluster]
    now:      datetime | None = None,
) -> list[ThemeIntelligence]:
    """
    Phase 5: Score all clusters against each theme in THEME_CATALOG.
    Returns active themes sorted by confidence descending.

    Confidence formula:
      base     = total_score × 2.0 + n_clusters × 4
      bonus_1  = source diversity  (up to +10)
      bonus_2  = cross-category    (+8 if 2+ news categories)
      bonus_3  = recency           (up to +9 for stories < 6h old)
      final    = min(95, base + bonuses)

    Momentum tracking uses ThemeMomentumTracker singleton; record() is called
    before deriving labels so all metrics reflect the just-completed cycle.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    log.info("[theme] extract_themes START  clusters=%d  themes_catalog=%d", len(clusters), len(THEME_CATALOG))
    # Log first 5 cluster titles + entities so Railway logs show what content we're scoring
    for _i, _c in enumerate(clusters[:5]):
        _p = _c.primary
        log.info(
            "[theme]   cluster[%d] title=%r  entities=%s",
            _i,
            (getattr(_p, "title", "") or "")[:80],
            getattr(_p, "affected_entities", []),
        )

    results: list[ThemeIntelligence] = []

    for theme_id, cfg in THEME_CATALOG.items():
        theme_keywords = cfg["keywords"]
        theme_entities = cfg["entities"]   # frozenset[str]
        contributing: list[tuple[object, float]] = []
        sentiments:  list[str] = []
        sources:     set[str]  = set()
        categories:  set[str]  = set()
        total_score  = 0.0
        recent_count = 0

        for cluster in clusters:
            item      = cluster.primary
            title_n   = _norm(getattr(item, "title",   "") or "")
            snippet_n = _norm(getattr(item, "snippet", "") or "")
            entities  = {e.upper() for e in (getattr(item, "affected_entities", None) or [])}

            raw = 0.0

            # Entity overlap — compare uppercased so "Nvidia" matches "NVIDIA"
            entity_hits = sum(1 for e in theme_entities if e.upper() in entities)
            # Secondary: scan title/snippet text for entity name mentions
            # Always run so multi-name stories accumulate correctly
            for tkr in theme_entities:
                tkr_n = f" {tkr.lower()} "
                if tkr_n in title_n or tkr_n in snippet_n:
                    entity_hits += 1
                    break  # one text-scan hit per cluster is enough
            raw += min(entity_hits * 3.0, 9.0)

            # Keyword match — accumulate up to 3 matches (6 pts title / 3 pts snippet)
            # Normalize keywords the same way titles are (strip punctuation like
            # hyphens) so "glp-1" matches normalized title " glp 1 ".
            kw_score = 0.0
            kw_hits  = 0
            for kw in theme_keywords:
                if kw_hits >= 3:
                    break
                kw_p = f" {_PUNCT_RE.sub(' ', kw.lower())} "
                if kw_p in title_n:
                    kw_score += 2.0
                    kw_hits  += 1
                elif kw_p in snippet_n:
                    kw_score += 1.0
                    kw_hits  += 1
            raw += kw_score

            if raw <= 0:
                continue

            # Weight by cluster importance (cluster_score typical range 0-2)
            weight   = 1.0 + min(getattr(cluster, "cluster_score", 0.0), 2.0) * 0.4
            weighted = raw * weight
            total_score += weighted
            contributing.append((cluster, weighted))
            sentiments.append(_item_sentiment(item))
            sources.add(getattr(item, "source", "") or "")
            categories.add(getattr(item, "category", "") or "")

            # Count stories published within the last 6 hours
            # Guard against naive datetimes crashing the subtraction
            pub = getattr(item, "published_dt", None)
            if pub:
                pub_cmp = pub if pub.tzinfo is not None else pub.replace(tzinfo=timezone.utc)
                if (now - pub_cmp).total_seconds() < 21600:
                    recent_count += 1

        log.info(
            "[theme] %-36s  raw_total=%.1f  clusters=%d",
            theme_id, total_score, len(contributing),
        )
        if total_score < 1.0 or not contributing:
            continue

        n_clusters = len(contributing)

        # ── Signal strength ───────────────────────────────────────────────────
        if total_score >= 18 or n_clusters >= 5:
            sig = "strong"
        elif total_score >= 7 or n_clusters >= 2:
            sig = "medium"
        else:
            sig = "weak"

        # ── Confidence: base + diversity bonuses ──────────────────────────────
        source_bonus  = min(len(sources) * 2, 10)
        cross_cat     = len(categories) >= 2
        cross_bonus   = 8 if cross_cat else 0
        recency_bonus = min(recent_count * 3, 9)

        confidence = min(95, int(
            total_score * 2.0
            + n_clusters * 4
            + source_bonus
            + cross_bonus
            + recency_bonus
        ))

        # ── Confidence label ──────────────────────────────────────────────────
        if confidence >= 80:   conf_label = "High Conviction"
        elif confidence >= 60: conf_label = "Elevated"
        elif confidence >= 40: conf_label = "Moderate"
        elif confidence >= 20: conf_label = "Developing"
        else:                  conf_label = "Speculative"

        # ── Signal quality ────────────────────────────────────────────────────
        if cross_cat and len(sources) >= 3 and n_clusters >= 3:
            quality = "confirmed"
        elif len(sources) >= 2 or cross_cat:
            quality = "developing"
        else:
            quality = "speculative"

        # ── Momentum ──────────────────────────────────────────────────────────
        momentum = _majority_sentiment(sentiments)

        # ── Tracker: record first, then derive all momentum metrics ───────────
        _momentum_tracker.record(theme_id, confidence, sig, now)
        mom_label  = _momentum_tracker.momentum_label(theme_id)
        mom_delta  = _momentum_tracker.prev_delta(theme_id)
        n_cycles   = _momentum_tracker.persistence_cycles(theme_id)
        persist_sc = _momentum_tracker.persistence_score(theme_id)
        volat_sc   = _momentum_tracker.volatility_score(theme_id)

        # ── Top contributing clusters (by weighted score, capped at 5) ────────
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
            # Phase 5 fields
            relationship_weights     = dict(cfg.get("relationship_graph", {})),
            confidence_label         = conf_label,
            signal_quality           = quality,
            evidence_count           = len(sources),
            persistence_score        = persist_sc,
            volatility_score         = volat_sc,
            cross_category_confirmed = cross_cat,
            momentum_label           = mom_label,
            momentum_delta           = mom_delta,
            persistence_cycles       = n_cycles,
        ))

    results.sort(key=lambda t: t.confidence, reverse=True)
    log.info(
        "[theme] extract_themes DONE: %d active / %d themes  clusters_in=%d",
        len(results), len(THEME_CATALOG), len(clusters),
    )
    for t in results:
        log.info(
            "[theme]  ✓ %-36s  conf=%d  strength=%-6s  clusters=%d  stories=%d  industries=%s",
            t.id, t.confidence, t.signal_strength,
            len(t.contributing_cluster_ids), t.contributing_story_count,
            t.related_industries,
        )
    return results


# ── Industry Activation ───────────────────────────────────────────────────────

FRONTEND_INDUSTRY_NAMES: list[str] = [
    "Semiconductors",
    "Software",
    "Aerospace & Defense",
    "Energy",
    "Financials",
    "Industrials",
    "Consumer",
    "Healthcare",
    "Real Estate",
    "Crypto & Digital Assets",
    "Utilities",
    "Media & Telecom",
]


@dataclass
class IndustryActivation:
    """Server-side aggregated activation signal for one frontend industry."""
    industry:           str
    score:              int            # 0–100
    sentiment:          str            # "bullish" | "bearish" | "neutral"
    active_story_count: int
    related_theme_ids:  list[str]      = field(default_factory=list)
    related_theme_names: list[str]     = field(default_factory=list)
    related_assets:     list[str]      = field(default_factory=list)
    momentum_label:     str            = "emerging"
    confidence_label:   str            = "Developing"


def compute_industry_activation(
    themes: list[ThemeIntelligence],
) -> list[IndustryActivation]:
    """
    For each frontend industry, aggregate signal from matching themes.
    Returns a list of IndustryActivation objects (all industries, even score=0).
    """
    results: list[IndustryActivation] = []

    for industry in FRONTEND_INDUSTRY_NAMES:
        matched = [t for t in themes if industry in t.related_industries]
        if not matched:
            results.append(IndustryActivation(
                industry=industry, score=0, sentiment="neutral",
                active_story_count=0,
            ))
            continue

        # Weighted score: confidence × relationship weight, take best
        best_score = 0
        best_sentiment = "neutral"
        best_momentum = "emerging"
        best_conf_label = "Developing"
        total_stories = 0
        theme_ids: list[str] = []
        theme_names: list[str] = []
        assets: list[str] = []

        for t in matched:
            rel = (t.relationship_weights or {}).get(industry, {})
            weight = rel.get("weight", 0.5)
            score = int(t.confidence * weight)
            if score > best_score:
                best_score = score
                direction = rel.get("direction", "")
                best_sentiment = (
                    "bullish" if direction == "positive" else
                    "bearish" if direction == "negative" else
                    "neutral"
                )
                best_momentum = t.momentum_label
                best_conf_label = t.confidence_label
            total_stories += t.contributing_story_count
            theme_ids.append(t.id)
            theme_names.append(t.name)
            for a in t.related_assets:
                if a not in assets:
                    assets.append(a)

        log.info(
            "[activ] %-24s  score=%3d  sentiment=%-8s  themes=%d  stories=%d  assets=%s",
            industry, min(best_score, 100), best_sentiment,
            len(matched), total_stories, assets[:4],
        )

        results.append(IndustryActivation(
            industry           = industry,
            score              = min(best_score, 100),
            sentiment          = best_sentiment,
            active_story_count = total_stories,
            related_theme_ids  = theme_ids,
            related_theme_names= theme_names,
            related_assets     = assets[:8],
            momentum_label     = best_momentum,
            confidence_label   = best_conf_label,
        ))

    return results
