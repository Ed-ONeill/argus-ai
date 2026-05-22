"""
app/language_quality.py — Language quality scoring for market intelligence text.

Detects generic news-copy phrasing and scores text on an institutional register
scale. Used for debug logging only — does not modify summaries in production.
"""

from __future__ import annotations

import re

# Generic phrases that signal news-copy register (phrase → institutional alternative)
BANNED_PHRASES: dict[str, str] = {
    # Vague causality
    "driving":               "repricing",
    "impacting":             "transmitting into",
    "affecting":             "compressing",
    "influencing":           "shifting",
    "shaping":               "repositioning",
    "highlighting":          "flagging",
    "signaling":             "pricing in",
    "reflecting":            "discounting",
    # Vague sentiment
    "investor sentiment":    "positioning",
    "market sentiment":      "market positioning",
    "market participants":   "buy-side",
    "investors are":         "the buy-side is",
    "traders are":           "positioning suggests",
    # Uncertainty hedge
    "amid uncertainty":      "amid spread widening",
    "amid concerns":         "amid repricing",
    "concerns around":       "pressure on",
    "worries about":         "downside risk to",
    "fears of":              "tail risk of",
    # Filler adjectives
    "significant":           "material",
    "notable":               "meaningful",
    "important":             "load-bearing",
    "key":                   "critical",
    "major":                 "structural",
    "various":               "discrete",
    "several":               "multiple",
    "a number of":           "a cluster of",
    # Over-broad verbs
    "sees":                  "prices in",
    "faces":                 "is exposed to",
    "continues to":          "remains in",
    "remains":               "persists at",
    "could":                 "may",
    "may impact":            "may reprice",
    "may affect":            "may compress",
    # News-copy constructions
    "amid the backdrop":     "against the backdrop",
    "in the wake of":        "following",
    "as a result of":        "on the back of",
    "due to":                "driven by",
    "in response to":        "on",
    "going forward":         "prospectively",
    "moving forward":        "from here",
    "at this point in time": "currently",
    "it is worth noting":    "",
    "it should be noted":    "",
    "it is important to note": "",
    # Passive non-committal
    "is expected to":        "should",
    "is likely to":          "will likely",
    "appears to be":         "is",
    "seems to be":           "is",
    # Generic market vocabulary
    "the market":            "equities",
    "the economy":           "macro",
    "economic conditions":   "macro conditions",
    "financial markets":     "markets",
    "stock market":          "equities",
    # Inflation/rates clichés
    "inflationary pressures": "inflation pass-through",
    "tighter monetary policy": "higher-for-longer",
    "loose monetary policy":   "dovish accommodation",
}

# Preferred institutional terms (presence adds to quality score)
PREFERRED_TERMS: list[str] = [
    "repricing", "rotation", "spread widening", "compression", "liquidity tightening",
    "positioning unwind", "multiple expansion", "multiple compression", "derating",
    "re-rating", "carry", "convexity", "duration", "vol regime", "vol compression",
    "tail risk", "risk-off", "risk-on", "factor rotation", "sector rotation",
    "basis widening", "basis compression", "breakeven", "real yield", "term premium",
    "credit transmission", "capex cycle", "earnings revision", "consensus revision",
    "flows", "rebalancing", "deleveraging", "margin compression", "margin expansion",
    "unit economics", "structural", "cyclical", "secular", "regime",
    "buy-side", "sell-side", "long-only", "institutional",
]

_WORD_RE = re.compile(r"\b\w+\b")


def score_text_quality(text: str) -> dict:
    """
    Score text on institutional quality (0-100).

    Returns:
      quality_score  — 0-100
      banned_hits    — list of (phrase, replacement) tuples found
      preferred_hits — list of preferred terms found
      penalty        — deduction applied
      is_institutional — True if quality_score >= 60
    """
    if not text:
        return {
            "quality_score": 100,
            "banned_hits": [],
            "preferred_hits": [],
            "penalty": 0,
            "is_institutional": True,
        }

    text_lower = text.lower()
    banned_hits: list[tuple[str, str]] = []
    for phrase, replacement in BANNED_PHRASES.items():
        if phrase in text_lower:
            banned_hits.append((phrase, replacement))

    preferred_hits: list[str] = []
    for term in PREFERRED_TERMS:
        if term in text_lower:
            preferred_hits.append(term)

    # Penalty: 4 pts per banned hit, capped at 60
    penalty = min(len(banned_hits) * 4, 60)

    # Bonus: 3 pts per preferred term, capped at 30
    bonus = min(len(preferred_hits) * 3, 30)

    quality_score = max(0, min(100, 70 - penalty + bonus))

    return {
        "quality_score": quality_score,
        "banned_hits": banned_hits,
        "preferred_hits": preferred_hits,
        "penalty": penalty,
        "is_institutional": quality_score >= 60,
    }
