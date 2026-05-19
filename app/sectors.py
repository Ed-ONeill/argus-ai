"""
app/sectors.py — Sector classification, aggregation, and rotation detection.

Rule-based, zero-LLM.  Scores each FeedItem against GICS sectors and thematic
industries using entity + keyword matching, then aggregates across the cluster
stream to produce SectorData for the /api/feed response.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.clustering import StoryCluster
    from app.summarizer import MarketBrief

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
        "keywords": [
            "software", "semiconductor", "chip", "cloud", "artificial intelligence",
            "data center", "cybersecurity", "technology", "silicon", "computing",
            "saas", "platform", "digital",
        ],
    },
    "Financials": {
        "entities": {
            "JPM", "BAC", "GS", "MS", "C", "WFC", "BLK", "BX", "KKR", "AXP",
            "V", "MA", "PYPL", "SCHW", "ICE", "CME", "ARES", "APO", "OWL",
        },
        "keywords": [
            "bank", "banking", "financial", "credit", "lending", "monetary policy",
            "federal reserve", "bond", "treasury", "yield", "spread", "ipo",
            "private equity", "hedge fund", "asset management", "insurance",
        ],
    },
    "Energy": {
        "entities": {
            "XOM", "CVX", "BP", "SHEL", "COP", "SLB", "HAL", "OXY",
            "PXD", "VLO", "PSX", "MPC", "LNG", "CQP",
        },
        "keywords": [
            "oil", "gas", "crude", "lng", "opec", "energy", "petroleum",
            "refinery", "pipeline", "offshore", "shale", "brent", "wti", "barrel",
        ],
    },
    "Industrials": {
        "entities": {
            "GE", "RTX", "HON", "CAT", "DE", "LMT", "NOC", "BA", "GD",
            "UPS", "FDX", "CSX", "UNP", "ABB",
        },
        "keywords": [
            "industrial", "manufacturing", "aerospace", "defense", "logistics",
            "supply chain", "freight", "railroad", "construction", "infrastructure",
            "automation",
        ],
    },
    "Healthcare": {
        "entities": {
            "JNJ", "PFE", "MRK", "LLY", "ABBV", "BMY", "UNH", "CVS", "CI",
            "AMGN", "GILD", "BIIB", "REGN", "MRNA", "ISRG",
        },
        "keywords": [
            "pharmaceutical", "pharma", "drug", "fda", "clinical trial", "biotech",
            "healthcare", "hospital", "medical", "vaccine", "therapy", "cancer",
            "biosimilar",
        ],
    },
    "Consumer": {
        "entities": {
            "WMT", "TGT", "COST", "HD", "LOW", "MCD", "SBUX", "NKE",
            "PG", "KO", "PEP", "PM", "MO", "TSLA",
        },
        "keywords": [
            "consumer", "retail", "spending", "sales", "cpi",
            "discretionary", "staples", "restaurant", "brand", "e-commerce",
            "luxury", "household",
        ],
    },
    "Utilities": {
        "entities": {"NEE", "DUK", "SO", "D", "AEP", "EXC", "SRE", "PCG", "ED", "CEG", "VST"},
        "keywords": [
            "utility", "utilities", "electricity", "power grid",
            "solar", "wind", "nuclear", "rate case", "ferc", "transmission",
        ],
    },
    "Materials": {
        "entities": {"FCX", "NEM", "APD", "LIN", "DD", "NUE", "X", "CLF", "AA", "ALB", "CCJ"},
        "keywords": [
            "materials", "mining", "metals", "steel", "copper", "gold", "silver",
            "aluminum", "lithium", "chemicals", "fertilizer", "potash", "uranium",
        ],
    },
    "Real Estate": {
        "entities": {"AMT", "PLD", "EQIX", "SPG", "PSA", "AVB", "EQR", "VTR", "ARE", "DLR"},
        "keywords": [
            "real estate", "reit", "property", "commercial real estate", "office",
            "housing", "mortgage", "cap rate", "occupancy",
        ],
    },
    "Communications": {
        "entities": {
            "GOOGL", "META", "NFLX", "DIS", "CMCSA", "CHTR", "T", "VZ", "TMUS",
        },
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
    name:         str
    sector:       str          # parent GICS sector
    signal_score: float
    signal_count: int
    top_entity:   str | None


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


# ── Classification ────────────────────────────────────────────────────────────

def classify_item(item: object) -> tuple[dict[str, float], dict[str, float]]:
    """
    Score item against SECTOR_MAP and INDUSTRY_MAP.
    Returns (sector_scores, industry_scores) — only entries with score > 0.
    """
    title_n   = _norm(getattr(item, "title",   "") or "")
    snippet_n = _norm(getattr(item, "snippet", "") or "")
    entities  = {e.upper() for e in (getattr(item, "affected_entities", None) or [])}

    sector_scores: dict[str, float] = {}
    for sector, cfg in SECTOR_MAP.items():
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
        ind: {"score": 0.0, "count": 0, "entities": {}}
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
            for e in (getattr(item, "affected_entities", None) or []):
                eu = e.upper()
                acc["entities"][eu] = acc["entities"].get(eu, 0) + 1

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

    max_ind    = max((v["score"] for v in ind_acc.values()), default=1.0) or 1.0
    industries: list[IndustrySignal] = []
    for name, acc in ind_acc.items():
        if acc["count"] == 0:
            continue
        norm  = round(min(100.0, acc["score"] / max_ind * 100), 1)
        top_e = max(acc["entities"], key=acc["entities"].get) if acc["entities"] else None
        industries.append(IndustrySignal(
            name         = name,
            sector       = INDUSTRY_MAP[name]["sector"],
            signal_score = norm,
            signal_count = acc["count"],
            top_entity   = top_e,
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
