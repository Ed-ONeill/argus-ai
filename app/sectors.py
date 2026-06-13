"""
app/sectors.py — Sector classification, aggregation, and rotation detection.

Rule-based, zero-LLM.  Scores each FeedItem against GICS sectors and thematic
industries using entity + keyword matching, then aggregates across the cluster
stream to produce SectorData for the /api/feed response.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.clustering import StoryCluster
    from app.summarizer import MarketBrief

log = logging.getLogger(__name__)

_PUNCT_RE = re.compile(r"[^\w\s]+")


def _norm(text: str) -> str:
    """Lowercase + strip punctuation + pad with spaces for word-boundary matching."""
    return " " + _PUNCT_RE.sub(" ", text.lower()) + " "


# ── Classification dictionaries ───────────────────────────────────────────────

SECTOR_MAP: dict[str, dict] = {
    "Technology": {
        "entities": {
            "AAPL", "MSFT", "GOOGL", "GOOG", "META", "NVDA", "AMD", "INTC", "TSMC", "AMZN",
            "CRM", "ORCL", "SAP", "IBM", "DELL", "HPQ", "QCOM", "AVGO", "MU", "AMAT",
            "KLAC", "LRCX", "ASML", "SNOW", "NOW", "WDAY", "ADBE", "INTU",
        },
        # Full company names for text-scan matching
        "names": [
            "nvidia", "apple", "microsoft", "google", "alphabet", "meta", "amazon",
            "amd", "intel", "tsmc", "broadcom", "qualcomm", "micron", "asml",
            "openai", "anthropic", "salesforce", "oracle",
        ],
        "keywords": [
            "software", "semiconductor", "chip", "chips", "cloud", "ai ", "artificial intelligence",
            "data center", "data centre", "cybersecurity", "technology", "silicon", "computing",
            "saas", "platform", "digital", "gpu", "chipmaker", "foundry",
        ],
    },
    "Financials": {
        "entities": {
            "JPM", "BAC", "GS", "MS", "C", "WFC", "BLK", "BX", "KKR", "AXP",
            "V", "MA", "PYPL", "SCHW", "ICE", "CME", "ARES", "APO", "OWL",
        },
        "names": [
            "jpmorgan", "bank of america", "goldman sachs", "morgan stanley",
            "wells fargo", "blackrock", "blackstone", "apollo", "ares",
            "federal reserve", "powell", "fed ", "fomc",
        ],
        "keywords": [
            "bank", "banking", "financial", "credit", "lending", "monetary policy",
            "federal reserve", "bond", "treasury", "yield", "spread", "ipo",
            "private equity", "hedge fund", "asset management", "insurance",
            "interest rate", "rate cut", "rate hike", "rate decision",
        ],
    },
    "Energy": {
        "entities": {
            "XOM", "CVX", "BP", "SHEL", "COP", "SLB", "HAL", "OXY",
            "PXD", "VLO", "PSX", "MPC", "LNG", "CQP",
        },
        "names": [
            "exxon", "chevron", "shell", "conocophillips", "opec", "bp ",
        ],
        "keywords": [
            "oil", "gas", "crude", "lng", "opec", "energy", "petroleum",
            "refinery", "pipeline", "offshore", "shale", "brent", "wti", "barrel",
            "oil price", "crude price", "oil supply", "energy supply",
        ],
    },
    "Industrials": {
        "entities": {
            "GE", "RTX", "HON", "CAT", "DE", "LMT", "NOC", "BA", "GD",
            "UPS", "FDX", "CSX", "UNP", "ABB",
        },
        "names": [
            "lockheed", "raytheon", "northrop", "boeing", "general dynamics",
            "honeywell", "caterpillar", "general electric",
        ],
        "keywords": [
            "industrial", "manufacturing", "aerospace", "defense", "logistics",
            "supply chain", "freight", "railroad", "construction", "infrastructure",
            "automation", "military", "nato", "pentagon", "weapons",
        ],
    },
    "Healthcare": {
        "entities": {
            "JNJ", "PFE", "MRK", "LLY", "ABBV", "BMY", "UNH", "CVS", "CI",
            "AMGN", "GILD", "BIIB", "REGN", "MRNA", "ISRG",
        },
        "names": [
            "lilly", "eli lilly", "pfizer", "merck", "abbvie", "johnson",
            "novo nordisk", "unitedhealth", "moderna",
        ],
        "keywords": [
            "pharmaceutical", "pharma", "drug", "fda", "clinical trial", "biotech",
            "healthcare", "hospital", "medical", "vaccine", "therapy", "cancer",
            "biosimilar", "glp-1", "obesity", "drug approval",
        ],
    },
    "Consumer": {
        "entities": {
            "WMT", "TGT", "COST", "HD", "LOW", "MCD", "SBUX", "NKE",
            "PG", "KO", "PEP", "PM", "MO", "TSLA",
        },
        "names": [
            "walmart", "target", "costco", "amazon", "mcdonald", "starbucks",
            "nike", "tesla",
        ],
        "keywords": [
            "consumer", "retail", "spending", "sales", "cpi",
            "discretionary", "staples", "restaurant", "brand", "e-commerce",
            "luxury", "household", "tariff", "tariffs", "trade war",
        ],
    },
    "Utilities": {
        "entities": {"NEE", "DUK", "SO", "D", "AEP", "EXC", "SRE", "PCG", "ED", "CEG", "VST"},
        "names": [
            "constellation", "vistra", "nextera", "duke energy", "southern company",
        ],
        "keywords": [
            "utility", "utilities", "electricity", "power grid",
            "solar", "wind", "nuclear", "rate case", "ferc", "transmission",
            "power demand", "power plant", "energy demand",
        ],
    },
    "Materials": {
        "entities": {"FCX", "NEM", "APD", "LIN", "DD", "NUE", "X", "CLF", "AA", "ALB", "CCJ"},
        "names": ["freeport", "newmont", "cameco", "alcoa"],
        "keywords": [
            "materials", "mining", "metals", "steel", "copper", "gold", "silver",
            "aluminum", "lithium", "chemicals", "fertilizer", "potash", "uranium",
            "iron ore", "commodity",
        ],
    },
    "Real Estate": {
        "entities": {"AMT", "PLD", "EQIX", "SPG", "PSA", "AVB", "EQR", "VTR", "ARE", "DLR"},
        "names": ["prologis", "equinix", "simon property"],
        "keywords": [
            "real estate", "reit", "property", "commercial real estate", "office",
            "housing", "mortgage", "cap rate", "occupancy", "data center",
        ],
    },
    "Communications": {
        "entities": {
            "GOOGL", "META", "NFLX", "DIS", "CMCSA", "CHTR", "T", "VZ", "TMUS",
        },
        "names": ["netflix", "disney", "comcast", "at&t", "verizon", "t-mobile"],
        "keywords": [
            "media", "streaming", "telecom", "communications", "social media",
            "advertising", "content", "broadband", "wireless", "cable",
        ],
    },
}

INDUSTRY_MAP: dict[str, dict] = {
    "AI Infrastructure": {
        "sector": "Technology",
        "entities": {"NVDA", "AMD", "INTC", "TSMC", "MSFT", "GOOGL", "AMZN", "META"},
        "keywords": [
            "large language model", "llm", "inference", "training run", "gpu cluster",
            "generative ai", "foundation model", "openai", "anthropic", "chatgpt",
            "ai infrastructure", "ai capex",
        ],
    },
    "Semiconductors": {
        "sector": "Technology",
        "entities": {"NVDA", "AMD", "INTC", "TSMC", "QCOM", "AVGO", "MU", "AMAT", "KLAC", "LRCX", "ASML"},
        "keywords": [
            "semiconductor", "chip", "wafer", "fab", "foundry", "silicon",
            "euv", "memory", "dram", "nand", "chipmaker",
        ],
    },
    "Defense": {
        "sector": "Industrials",
        "entities": {"LMT", "NOC", "RTX", "GD", "BA"},
        "keywords": [
            "defense", "military", "pentagon", "dod", "nato", "weapons",
            "missiles", "fighter jet", "drone", "hypersonic", "defense procurement",
        ],
    },
    "Cybersecurity": {
        "sector": "Technology",
        "entities": {"CRWD", "PANW", "ZS", "FTNT", "S", "OKTA"},
        "keywords": [
            "cybersecurity", "cyber attack", "hack", "data breach", "ransomware",
            "zero-day", "endpoint security", "threat intelligence",
        ],
    },
    "Data Centers": {
        "sector": "Real Estate",
        "entities": {"EQIX", "DLR", "AMT", "MSFT", "GOOGL", "AMZN"},
        "keywords": [
            "data center", "colocation", "hyperscaler", "cloud infrastructure",
            "server farm", "cooling infrastructure",
        ],
    },
    "Nuclear": {
        "sector": "Utilities",
        "entities": {"CEG", "VST", "CCJ", "UEC"},
        "keywords": [
            "nuclear power", "uranium", "smr", "small modular reactor",
            "nuclear energy", "enrichment", "nuclear plant",
        ],
    },
    "Private Credit": {
        "sector": "Financials",
        "entities": {"BX", "KKR", "ARES", "APO", "OWL"},
        "keywords": [
            "private credit", "direct lending", "clo", "leveraged loan",
            "middle market", "nav loan", "bdc", "private debt",
        ],
    },
    "Cloud Software": {
        "sector": "Technology",
        "entities": {"MSFT", "AMZN", "GOOGL", "CRM", "ORCL", "SAP", "WDAY", "NOW", "SNOW"},
        "keywords": [
            "saas", "cloud software", "annual recurring revenue", "arr",
            "enterprise software", "cloud migration",
        ],
    },
    "Energy Transition": {
        "sector": "Energy",
        "entities": {"TSLA", "NEE", "ENPH", "SEDG", "FSLR", "BE"},
        "keywords": [
            "clean energy", "solar panel", "wind farm", "electric vehicle",
            "battery storage", "inflation reduction act", "carbon capture",
            "energy transition", "decarbonization",
        ],
    },
    "Robotics": {
        "sector": "Industrials",
        "entities": {"ISRG", "ABB"},
        "keywords": [
            "robotics", "industrial robot", "autonomous system",
            "humanoid robot", "cobot", "robotic surgery",
        ],
    },
    "Crypto Infrastructure": {
        "sector": "Financials",
        "entities": {"COIN", "MSTR", "MARA", "RIOT", "CLSK"},
        "keywords": [
            "bitcoin", "ethereum", "crypto", "blockchain", "defi", "stablecoin",
            "spot bitcoin etf", "digital asset", "btc", "crypto mining",
        ],
    },
    "LNG": {
        "sector": "Energy",
        "entities": {"LNG", "CQP"},
        "keywords": [
            "liquefied natural gas", "export terminal",
            "regasification", "liquefaction", "henry hub",
        ],
    },
}

# ── Regime → sector alignment ─────────────────────────────────────────────────

REGIME_SECTOR_MAP: dict[str, dict[str, list[str]]] = {
    "Risk-Off Hawkish": {
        "tailwind": ["Financials", "Energy", "Materials"],
        "headwind": ["Technology", "Real Estate", "Utilities", "Communications"],
    },
    "Risk-Off Neutral": {
        "tailwind": ["Financials", "Healthcare", "Consumer"],
        "headwind": ["Technology", "Real Estate"],
    },
    "Risk-On Dovish": {
        "tailwind": ["Technology", "Real Estate", "Communications", "Consumer"],
        "headwind": ["Financials", "Energy"],
    },
    "Risk-On Neutral": {
        "tailwind": ["Technology", "Industrials", "Consumer"],
        "headwind": ["Utilities", "Materials"],
    },
    "Stagflationary": {
        "tailwind": ["Energy", "Materials", "Healthcare"],
        "headwind": ["Consumer", "Technology", "Real Estate"],
    },
    "Neutral/Consolidating": {
        "tailwind": [],
        "headwind": [],
    },
}


# ── Output dataclasses ────────────────────────────────────────────────────────

@dataclass
class SectorIntelligence:
    name:             str
    signal_score:     float    # 0-100, normalised across sectors
    signal_count:     int      # stories attributed to this sector
    impact_sentiment: str      # "bullish" | "bearish" | "neutral" | "mixed"
    top_entity:       str | None
    top_story_title:  str | None
    top_story_url:    str | None
    regime_alignment: str      # "tailwind" | "headwind" | "neutral"


@dataclass
class IndustrySignal:
    name:               str
    sector:             str          # parent GICS sector
    signal_score:       float
    signal_count:       int
    top_entity:         str | None
    momentum_direction: str          = "neutral"           # "bullish" | "bearish" | "neutral"
    primary_drivers:    list[str]    = field(default_factory=list)
    narrative:          str          = ""
    regime_alignment:   str          = "neutral"           # "tailwind" | "headwind" | "neutral"
    top_story_title:    str | None   = None
    top_story_url:      str | None   = None


@dataclass
class RotationSignal:
    from_sector: str
    to_sector:   str
    confidence:  float         # 0.0–1.0
    reason:      str
    pattern:     str           # "risk-off" | "growth-to-value" | "defensive" | "commodity" | "ai-cycle"


@dataclass
class SectorData:
    sectors:          list[SectorIntelligence]
    industries:       list[IndustrySignal]
    rotation_signals: list[RotationSignal]
    dominant_sector:  str | None
    generated_at:     datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    derived_regime:   str      = ""  # Phase 5: deterministic extended regime label


# ── Classification ────────────────────────────────────────────────────────────

def classify_item(item: object) -> tuple[dict[str, float], dict[str, float]]:
    """
    Score item against SECTOR_MAP and INDUSTRY_MAP.
    Returns (sector_scores, industry_scores) — only entries with score > 0.

    Scoring layers (all additive, per sector/industry):
      - Ticker entity match in affected_entities : +3.0 per hit
      - Company name text-scan in title/snippet  : +3.0 (one hit max)
      - Keyword in title                         : +2.0 per match (cap 3)
      - Keyword in snippet                       : +1.0 per match (cap 3)
    """
    title_n   = _norm(getattr(item, "title",   "") or "")
    snippet_n = _norm(getattr(item, "snippet", "") or "")
    entities  = {e.upper() for e in (getattr(item, "affected_entities", None) or [])}

    sector_scores: dict[str, float] = {}
    for sector, cfg in SECTOR_MAP.items():
        score = 0.0
        # Layer 1: ticker entities
        for e in cfg["entities"]:
            if e in entities:
                score += 3.0
        # Layer 2: company name text-scan
        for name in cfg.get("names", []):
            name_p = f" {name} "
            if name_p in title_n or name_p in snippet_n:
                score += 3.0
                break
        # Layer 3: keyword matching (up to 3 hits)
        kw_hits = 0
        for kw in cfg["keywords"]:
            if kw_hits >= 3:
                break
            kw_padded = f" {kw} "
            if kw_padded in title_n:
                score  += 2.0
                kw_hits += 1
            elif kw_padded in snippet_n:
                score  += 1.0
                kw_hits += 1
        if score > 0:
            sector_scores[sector] = score

    industry_scores: dict[str, float] = {}
    for industry, cfg in INDUSTRY_MAP.items():
        score = 0.0
        for e in cfg["entities"]:
            if e in entities:
                score += 3.0
        for kw in cfg["keywords"]:
            kw_padded = f" {kw} "
            if kw_padded in title_n:
                score += 2.0
            elif kw_padded in snippet_n:
                score += 1.0
        if score > 0:
            industry_scores[industry] = score

    return sector_scores, industry_scores


# ── Industry narrative generation (pure, zero-LLM) ───────────────────────────

_INDUSTRY_DESCRIPTOR: dict[str, str] = {
    "AI Infrastructure":     "AI infrastructure and compute spending",
    "Semiconductors":        "Semiconductor demand and chip pricing",
    "Defense":               "Defense procurement and geopolitical risk premium",
    "Cybersecurity":         "Cybersecurity spending and the threat landscape",
    "Data Centers":          "Data center capacity and hyperscaler capex",
    "Nuclear":               "Nuclear power and uranium supply dynamics",
    "Private Credit":        "Private credit flows and direct lending",
    "Cloud Software":        "Cloud software adoption and SaaS revenue growth",
    "Energy Transition":     "Clean energy deployment and policy support",
    "Robotics":              "Industrial automation and robotics adoption",
    "Crypto Infrastructure": "Crypto market structure and digital asset flows",
    "LNG":                   "LNG export volumes and global natural gas demand",
}

# Phase 5: 3 variants per (momentum, alignment) combination.
# Variant selected deterministically by hashing the industry name so the same
# industry always gets the same template, but different industries read differently.
_NARRATIVE_VARIANTS: dict[tuple[str, str], list[str]] = {
    ("bullish", "tailwind"): [
        "{d} is accelerating — macro tailwinds and fundamental signals are converging to lift institutional positioning.",
        "Capital continues rotating into {d} as regime conditions align with strengthening underlying catalysts.",
        "Positioning in {d} is gaining momentum with cross-asset confirmation reinforcing the primary thesis.",
    ],
    ("bullish", "headwind"): [
        "{d} is pressing higher on fundamental strength despite macro headwinds weighing on broader sector sentiment.",
        "Forward expectations for {d} remain constructive — structural demand is overriding current cycle friction.",
        "Markets are increasingly pricing in a {d} re-rating, with underlying drivers outpacing regime concerns.",
    ],
    ("bullish", "neutral"): [
        "{d} is advancing on company-specific catalysts and improving fundamental signals.",
        "Incremental data flow in {d} continues to support an upside thesis without requiring macro confirmation.",
        "Positioning suggests {d} is attracting institutional attention on bottom-up fundamental strength.",
    ],
    ("bearish", "tailwind"): [
        "{d} is retreating despite supportive macro conditions — a mean-reversion setup is developing.",
        "Cross-asset behavior implies {d} weakness is idiosyncratic — regime tailwinds make a reversal more likely.",
        "Despite a constructive macro backdrop, {d} is facing profit-taking and near-term sentiment deterioration.",
    ],
    ("bearish", "headwind"): [
        "{d} faces compounding pressure as macro headwinds reinforce deteriorating fundamental signals.",
        "The narrative is reinforcing against {d} — regime and sector signals are aligned to the downside.",
        "Forward expectations remain sensitive to further {d} weakness as both macro and fundamental pressures build.",
    ],
    ("bearish", "neutral"): [
        "{d} is pulling back on profit-taking and a softening near-term outlook.",
        "Positioning in {d} is consolidating lower — the near-term thesis is under review without macro conviction.",
        "{d} is encountering distribution pressure as sentiment softens ahead of catalyst clarity.",
    ],
    ("neutral", "tailwind"): [
        "{d} is consolidating within a constructive macro backdrop — awaiting a specific catalyst to catalyse flow.",
        "Macro tailwinds are present but {d} lacks the directional conviction to attract incremental capital.",
        "Forward flows into {d} are pausing — the structural thesis is intact but near-term triggers are absent.",
    ],
    ("neutral", "headwind"): [
        "{d} is navigating macro headwinds with limited directional conviction from institutional positioning.",
        "Cross-asset pressure is weighing on {d} sentiment, but no decisive breakdown has emerged.",
        "Markets are pricing in {d} uncertainty — positioning is defensive and the risk/reward is unclear.",
    ],
    ("neutral", "neutral"): [
        "{d} shows mixed signals with no clear institutional positioning bias at current levels.",
        "The {d} narrative is fragmented — no dominant macro or fundamental theme is driving capital allocation.",
        "Forward expectations for {d} are balanced — investors are awaiting clearer signal confirmation.",
    ],
}

_FALLBACK_VARIANT = "{d} shows mixed signals with no clear institutional positioning bias at current levels."


def _select_narrative_variant(industry_name: str, variants: list[str]) -> str:
    """Deterministic variant selection: same industry always gets the same template."""
    return variants[hash(industry_name) % len(variants)]


def _generate_industry_narrative(
    industry_name: str,
    momentum:      str,         # "bullish" | "bearish" | "neutral"
    alignment:     str,         # "tailwind" | "headwind" | "neutral"
    top_entity:    str | None,
) -> str:
    descriptor = _INDUSTRY_DESCRIPTOR.get(industry_name, industry_name.lower())
    variants   = _NARRATIVE_VARIANTS.get((momentum, alignment))
    template   = (
        _select_narrative_variant(industry_name, variants) if variants
        else _FALLBACK_VARIANT
    )
    base = template.format(d=descriptor)
    if top_entity:
        base = base.rstrip(".") + f", with {top_entity} as a key focal point."
    return base


# ── Aggregation ───────────────────────────────────────────────────────────────

def aggregate_sector_intelligence(
    clusters: list,
    market_brief: object | None = None,
    now: datetime | None = None,
) -> SectorData:
    """
    Aggregate sector + industry signals across all clusters.
    Uses cluster_score as a weight multiplier on the item's signal_score.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    regime = getattr(market_brief, "market_regime", None) or "Neutral/Consolidating"

    sec_acc: dict[str, dict] = {
        s: {
            "score": 0.0, "count": 0, "sentiments": [],
            "entities": {}, "top_story": None, "top_score": 0.0,
        }
        for s in SECTOR_MAP
    }
    ind_acc: dict[str, dict] = {
        ind: {
            "score": 0.0, "count": 0, "entities": {},
            "sentiments": [], "top_story": None, "top_score": 0.0,
        }
        for ind in INDUSTRY_MAP
    }

    for cluster in clusters:
        item     = cluster.primary
        w        = min(getattr(cluster, "cluster_score", 1.0), 3.0)
        raw      = getattr(item, "signal_score", 50.0)
        combined = min(100.0, raw * (1.0 + 0.3 * w / 3.0))

        sec_scores, ind_scores = classify_item(item)

        for sector, match_sc in sec_scores.items():
            acc    = sec_acc[sector]
            weight = min(match_sc / 6.0, 1.0)
            acc["score"] += combined * weight
            acc["count"] += 1
            acc["sentiments"].append(_item_sentiment(item))
            for e in (getattr(item, "affected_entities", None) or []):
                eu = e.upper()
                acc["entities"][eu] = acc["entities"].get(eu, 0) + 1
            if combined > acc["top_score"]:
                acc["top_score"] = combined
                acc["top_story"] = item

        for industry, match_sc in ind_scores.items():
            acc    = ind_acc[industry]
            weight = min(match_sc / 6.0, 1.0)
            acc["score"] += combined * weight
            acc["count"] += 1
            acc["sentiments"].append(_item_sentiment(item))
            for e in (getattr(item, "affected_entities", None) or []):
                eu = e.upper()
                acc["entities"][eu] = acc["entities"].get(eu, 0) + 1
            if combined > acc["top_score"]:
                acc["top_score"] = combined
                acc["top_story"] = item

    max_sec       = max((v["score"] for v in sec_acc.values()), default=1.0) or 1.0
    alignment_cfg = REGIME_SECTOR_MAP.get(regime, REGIME_SECTOR_MAP["Neutral/Consolidating"])

    sectors: list[SectorIntelligence] = []
    for name, acc in sec_acc.items():
        if acc["count"] == 0:
            continue
        norm_score = round(min(100.0, acc["score"] / max_sec * 100), 1)
        top_e  = max(acc["entities"], key=acc["entities"].get) if acc["entities"] else None
        ts     = acc["top_story"]
        align  = (
            "tailwind" if name in alignment_cfg["tailwind"]
            else "headwind" if name in alignment_cfg["headwind"]
            else "neutral"
        )
        sectors.append(SectorIntelligence(
            name             = name,
            signal_score     = norm_score,
            signal_count     = acc["count"],
            impact_sentiment = _majority_sentiment(acc["sentiments"]),
            top_entity       = top_e,
            top_story_title  = getattr(ts, "title", None) if ts else None,
            top_story_url    = getattr(ts, "url",   None) if ts else None,
            regime_alignment = align,
        ))

    sectors.sort(key=lambda s: s.signal_score, reverse=True)
    dominant = sectors[0].name if sectors else None

    log.info(
        "[sector] aggregate done  clusters=%d  sectors_active=%d  dominant=%s",
        len(clusters), len(sectors), dominant,
    )
    for s in sectors:
        log.info(
            "[sector]  %-14s  score=%5.1f  count=%d  sentiment=%-8s  align=%s",
            s.name, s.signal_score, s.signal_count, s.impact_sentiment, s.regime_alignment,
        )

    max_ind    = max((v["score"] for v in ind_acc.values()), default=1.0) or 1.0
    industries: list[IndustrySignal] = []
    for name, acc in ind_acc.items():
        if acc["count"] == 0:
            continue
        norm         = round(min(100.0, acc["score"] / max_ind * 100), 1)
        sorted_ents  = sorted(acc["entities"].items(), key=lambda kv: kv[1], reverse=True)
        top_e        = sorted_ents[0][0] if sorted_ents else None
        drivers      = [e for e, _ in sorted_ents[:3]]
        momentum     = _majority_sentiment(acc["sentiments"])
        if momentum == "mixed":
            momentum = "neutral"
        parent_sector = INDUSTRY_MAP[name]["sector"]
        align = (
            "tailwind" if parent_sector in alignment_cfg["tailwind"]
            else "headwind" if parent_sector in alignment_cfg["headwind"]
            else "neutral"
        )
        ts = acc["top_story"]
        industries.append(IndustrySignal(
            name               = name,
            sector             = parent_sector,
            signal_score       = norm,
            signal_count       = acc["count"],
            top_entity         = top_e,
            momentum_direction = momentum,
            primary_drivers    = drivers,
            narrative          = _generate_industry_narrative(name, momentum, align, top_e),
            regime_alignment   = align,
            top_story_title    = getattr(ts, "title", None) if ts else None,
            top_story_url      = getattr(ts, "url",   None) if ts else None,
        ))
    industries.sort(key=lambda i: i.signal_score, reverse=True)

    rotation_signals = _detect_rotation(sectors, market_brief)

    return SectorData(
        sectors          = sectors,
        industries       = industries,
        rotation_signals = rotation_signals,
        dominant_sector  = dominant,
        generated_at     = now,
    )


# ── Rotation detection ────────────────────────────────────────────────────────

def _detect_rotation(
    sectors: list[SectorIntelligence],
    market_brief: object | None,
) -> list[RotationSignal]:
    if not sectors:
        return []

    sc = {s.name: s.signal_score for s in sectors}

    def _s(name: str) -> float:
        return sc.get(name, 0.0)

    tech = _s("Technology");  fin  = _s("Financials")
    ene  = _s("Energy");      cons = _s("Consumer")
    ind  = _s("Industrials"); mat  = _s("Materials")
    hc   = _s("Healthcare");  util = _s("Utilities")

    signals: list[RotationSignal] = []

    # Risk-off: Financials + Energy dominating over Tech + Consumer
    if (fin + ene) > (tech + cons) * 1.3 and fin > 20:
        conf = min(0.9, (fin + ene - tech - cons) / max(tech + cons, 1) * 0.7)
        signals.append(RotationSignal(
            from_sector = "Technology",
            to_sector   = "Financials",
            confidence  = round(conf, 2),
            reason      = f"Financials ({fin:.0f}) and Energy ({ene:.0f}) dominating over Tech ({tech:.0f})",
            pattern     = "risk-off",
        ))

    # Growth-to-value: Industrials + Materials outpacing Technology
    if (ind + mat) > tech * 1.4 and ind > 15:
        conf = min(0.85, (ind + mat - tech) / max(tech, 1) * 0.5)
        signals.append(RotationSignal(
            from_sector = "Technology",
            to_sector   = "Industrials",
            confidence  = round(conf, 2),
            reason      = f"Value sectors (Industrials {ind:.0f}, Materials {mat:.0f}) outpacing Tech ({tech:.0f})",
            pattern     = "growth-to-value",
        ))

    # Defensive: Healthcare + Utilities rising vs Consumer + Technology
    if (hc + util) > (tech + cons) and hc > 20:
        conf = min(0.8, (hc + util - tech - cons) / max(tech + cons, 1) * 0.6)
        signals.append(RotationSignal(
            from_sector = "Consumer",
            to_sector   = "Healthcare",
            confidence  = round(conf, 2),
            reason      = f"Defensive sectors (Healthcare {hc:.0f}, Utilities {util:.0f}) taking leadership",
            pattern     = "defensive",
        ))

    # Commodity supercycle: Energy + Materials both elevated
    if ene > 40 and mat > 35:
        conf = min(0.85, (ene + mat) / 200)
        signals.append(RotationSignal(
            from_sector = "Consumer",
            to_sector   = "Energy",
            confidence  = round(conf, 2),
            reason      = f"Commodity cycle: Energy ({ene:.0f}) and Materials ({mat:.0f}) both elevated",
            pattern     = "commodity",
        ))

    # AI cycle: Technology heavily dominant
    if tech > 55 and tech > fin * 1.5:
        conf = min(0.9, tech / 100)
        signals.append(RotationSignal(
            from_sector = "Industrials",
            to_sector   = "Technology",
            confidence  = round(conf, 2),
            reason      = f"Technology ({tech:.0f}) dominates — AI/semiconductor cycle in progress",
            pattern     = "ai-cycle",
        ))

    return signals


# ── Extended regime derivation (Phase 5) ─────────────────────────────────────

# Mapping from base LLM regime to extended label (used as fallback)
_BASE_TO_EXTENDED: dict[str, str] = {
    "Risk-Off Hawkish":      "Yield Shock",
    "Risk-Off Neutral":      "Defensive Rotation",
    "Risk-On Dovish":        "Risk-On Expansion",
    "Risk-On Neutral":       "Risk-On Expansion",
    "Stagflationary":        "Inflation Pressure",
    "Neutral/Consolidating": "Macro Stabilization",
}


def derive_extended_regime(
    sectors:       list[SectorIntelligence],
    active_themes: list[str],       # theme IDs from extract_themes()
    base_regime:   str = "Neutral/Consolidating",
) -> str:
    """
    Derive a granular market regime label from sector scores + active theme IDs.
    Called in background.py after both sectors and themes are computed.

    Returns one of:
      AI Capex Expansion | Power Infrastructure Cycle | Energy Supply Risk
      Yield Shock | Liquidity Tightening | Private Capital Cycle
      Defensive Rotation | Commodity Expansion | Risk-On Expansion
      Geopolitical Premium | Energy Infrastructure Cycle | Inflation Pressure
      Macro Stabilization
    """
    sc = {s.name: s.signal_score for s in sectors}
    tech = sc.get("Technology",  0.0)
    fin  = sc.get("Financials",  0.0)
    ene  = sc.get("Energy",      0.0)
    hc   = sc.get("Healthcare",  0.0)
    util = sc.get("Utilities",   0.0)
    mat  = sc.get("Materials",   0.0)
    cons = sc.get("Consumer",    0.0)
    ind  = sc.get("Industrials", 0.0)

    # AI demand cluster — the broad theme plus the granular supercycle decompositions
    has_ai      = any(t in active_themes for t in (
        "ai-energy-demand", "semiconductor-capex-cycle",
        "ai-compute-arms-race", "hyperscaler-capex", "data-center-buildout",
    ))
    has_yield   = "treasury-yield-pressure"           in active_themes or "liquidity-tightening"       in active_themes
    has_energy  = "energy-security"                   in active_themes
    has_defense = "defense-reindustrialization"       in active_themes
    has_nuclear = "nuclear-power-renaissance"         in active_themes
    has_consumer = "consumer-stress"                  in active_themes
    has_credit  = "liquidity-tightening"              in active_themes
    # Power/grid buildout cluster — data centres pulling through grid + utility capex
    has_power   = any(t in active_themes for t in (
        "grid-modernization", "utility-capex-supercycle",
        "data-center-buildout", "nuclear-power-renaissance",
    ))
    # Private-capital cluster — the lending + buyout flywheel
    has_private_capital = any(t in active_themes for t in (
        "private-credit-expansion", "direct-lending-expansion", "private-capital-takeover",
    ))

    # Ranked checks — most specific conditions evaluated first
    if tech > 50 and has_ai:
        return "AI Capex Expansion"
    if (util > 30 or ind > 30) and has_power and has_ai:
        return "Power Infrastructure Cycle"
    if ene > 45 and has_energy:
        return "Energy Supply Risk"
    if has_yield and has_credit:
        return "Liquidity Tightening"
    if has_yield and fin > 35:
        return "Yield Shock"
    if has_private_capital and fin > 35:
        return "Private Capital Cycle"
    if (hc + util) > (tech + cons) * 0.9 and hc > 20:
        return "Defensive Rotation"
    if ene > 38 and mat > 32:
        return "Commodity Expansion"
    if has_defense and ene > 28:
        return "Geopolitical Premium"
    if (has_nuclear or has_power) and tech > 30:
        return "Energy Infrastructure Cycle"
    if has_consumer and cons > 25:
        return "Inflation Pressure"
    if tech > 40 and has_ai and not has_yield:
        return "Risk-On Expansion"
    if ind > 35 and not has_yield:
        return "Risk-On Expansion"

    return _BASE_TO_EXTENDED.get(base_regime, "Macro Stabilization")


# ── Helpers ───────────────────────────────────────────────────────────────────

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
    return max(counts, key=counts.get)
