"""
app/companies.py — canonical company registry + deterministic entity resolver.

The rule this module enforces: an uppercase token is NOT a company until it
resolves against the registry. Ambiguous tickers — ones that collide with
common English words or acronyms (CAT, ON, ALL, IT, A, FOR, AI, DE, MS…) —
resolve only with explicit context: a $-prefix, a company-name mention, or a
market-noun immediately after the token ("CAT shares", "ON earnings").

Resolution sources, highest precision first:
  1. company name / alias in the text (normalized, word-boundary)
  2. explicit $TICKER notation (authorial intent — accepted even off-registry)
  3. bare uppercase token that is a registry ticker (ambiguous ones need context)
  4. upstream entity hints (affected_entities), same rule as 3

This is a curated seed registry, not exchange-complete: an unlisted company's
name simply won't resolve — the event carries no company rather than a wrong
one. Extending coverage = adding rows, never loosening the rule.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_PUNCT_RE = re.compile(r"[^\w\s]+")
_DOLLAR_RE = re.compile(r"\$([A-Z]{1,5})\b")
_CAPS_RE = re.compile(r"\b[A-Z]{2,5}\b")
_TICKER_SHAPE_RE = re.compile(r"^[A-Z]{1,5}$")


def _norm(text: str) -> str:
    """Lowercase, punctuation → space, padded for word-boundary matching."""
    return " " + _PUNCT_RE.sub(" ", text.lower()) + " "


@dataclass(frozen=True)
class Company:
    ticker: str
    name: str
    aliases: tuple[str, ...] = ()
    # ticker collides with a common word/acronym; bare-token resolution
    # requires explicit context ($TICKER, name mention, or market noun)
    ambiguous: bool = False


# (ticker, canonical name, extra aliases, ambiguous)
_ROWS: list[tuple] = [
    # Technology
    ("AAPL", "Apple", (), False),
    ("MSFT", "Microsoft", (), False),
    ("GOOGL", "Alphabet", ("google",), False),
    ("META", "Meta Platforms", ("meta", "facebook"), False),
    ("NVDA", "Nvidia", (), False),
    ("AMD", "Advanced Micro Devices", ("amd",), False),
    ("INTC", "Intel", (), False),
    ("AMZN", "Amazon", (), False),
    ("TSM", "Taiwan Semiconductor", ("tsmc",), False),
    ("AVGO", "Broadcom", (), False),
    ("QCOM", "Qualcomm", (), False),
    ("MU", "Micron", ("micron technology",), False),
    ("AMAT", "Applied Materials", (), False),
    ("KLAC", "KLA", (), False),
    ("LRCX", "Lam Research", (), False),
    ("ASML", "ASML", (), False),
    ("TXN", "Texas Instruments", (), False),
    ("ON", "ON Semiconductor", ("onsemi",), True),
    ("CRM", "Salesforce", (), False),
    ("ORCL", "Oracle", (), False),
    ("SAP", "SAP", (), False),
    ("IBM", "IBM", ("international business machines",), False),
    ("DELL", "Dell", (), False),
    ("HPQ", "HP", ("hp inc",), False),
    ("SNOW", "Snowflake", (), True),
    ("NOW", "ServiceNow", ("servicenow",), True),
    ("WDAY", "Workday", (), False),
    ("ADBE", "Adobe", (), False),
    ("INTU", "Intuit", (), False),
    ("PLTR", "Palantir", (), False),
    ("TSLA", "Tesla", (), False),
    ("NFLX", "Netflix", (), False),
    ("UBER", "Uber", (), True),
    ("PYPL", "PayPal", (), False),
    ("AI", "C3.ai", ("c3 ai",), True),
    ("IT", "Gartner", ("gartner",), True),
    # Financials
    ("JPM", "JPMorgan Chase", ("jpmorgan", "jp morgan", "j.p. morgan"), False),
    ("BAC", "Bank of America", (), False),
    ("GS", "Goldman Sachs", ("goldman",), False),
    ("MS", "Morgan Stanley", ("morgan stanley",), True),
    ("C", "Citigroup", ("citi",), True),
    ("WFC", "Wells Fargo", (), False),
    ("BLK", "BlackRock", ("blackrock",), False),
    ("BX", "Blackstone", ("blackstone",), False),
    ("KKR", "KKR", (), False),
    ("APO", "Apollo Global Management", ("apollo global",), False),
    ("AXP", "American Express", ("amex",), False),
    ("V", "Visa", ("visa inc",), True),
    ("MA", "Mastercard", ("mastercard",), True),
    ("SCHW", "Charles Schwab", ("schwab",), False),
    ("CME", "CME Group", (), False),
    ("ICE", "Intercontinental Exchange", ("intercontinental exchange",), True),
    ("ALL", "Allstate", ("allstate",), True),
    ("A", "Agilent", ("agilent", "agilent technologies"), True),
    ("FOR", "Forestar", ("forestar",), True),
    # Energy
    ("XOM", "Exxon Mobil", ("exxon", "exxonmobil"), False),
    ("CVX", "Chevron", (), False),
    ("BP", "BP", (), False),
    ("SHEL", "Shell", ("shell plc",), False),
    ("COP", "ConocoPhillips", ("conocophillips",), True),
    ("SLB", "Schlumberger", ("schlumberger",), False),
    ("HAL", "Halliburton", ("halliburton",), True),
    ("OXY", "Occidental", ("occidental petroleum",), False),
    ("VLO", "Valero", (), False),
    ("PSX", "Phillips 66", ("phillips 66",), False),
    ("MPC", "Marathon Petroleum", ("marathon petroleum",), True),
    ("LNG", "Cheniere", ("cheniere",), True),
    # Industrials
    ("GE", "GE", ("general electric",), False),
    ("RTX", "RTX", ("raytheon",), False),
    ("HON", "Honeywell", (), False),
    ("CAT", "Caterpillar", ("caterpillar",), True),
    ("DE", "Deere", ("deere", "john deere"), True),
    ("LMT", "Lockheed Martin", ("lockheed",), False),
    ("NOC", "Northrop Grumman", ("northrop",), False),
    ("BA", "Boeing", ("boeing",), True),
    ("GD", "General Dynamics", ("general dynamics",), False),
    ("UPS", "UPS", ("united parcel service",), False),
    ("FDX", "FedEx", (), False),
    ("CSX", "CSX", (), False),
    ("UNP", "Union Pacific", ("union pacific",), False),
    ("ETN", "Eaton", ("eaton",), False),
    ("EMR", "Emerson", ("emerson electric",), False),
    ("VRT", "Vertiv", ("vertiv",), False),
    # Healthcare
    ("JNJ", "Johnson & Johnson", ("johnson & johnson",), False),
    ("PFE", "Pfizer", (), False),
    ("MRK", "Merck", (), False),
    ("LLY", "Eli Lilly", ("lilly",), False),
    ("ABBV", "AbbVie", (), False),
    ("UNH", "UnitedHealth", ("unitedhealth group",), False),
    ("TMO", "Thermo Fisher", ("thermo fisher scientific",), False),
    ("ABT", "Abbott", ("abbott laboratories",), False),
    ("AMGN", "Amgen", (), False),
    ("GILD", "Gilead", ("gilead sciences",), False),
    ("NVO", "Novo Nordisk", ("novo nordisk",), False),
    ("MRNA", "Moderna", (), False),
    # Consumer
    ("WMT", "Walmart", (), False),
    ("COST", "Costco", ("costco",), True),
    ("HD", "Home Depot", ("home depot",), False),
    ("MCD", "McDonald's", ("mcdonald's", "mcdonalds"), False),
    ("NKE", "Nike", (), False),
    ("SBUX", "Starbucks", (), False),
    ("TGT", "Target", ("target corp", "target corporation"), False),
    ("LOW", "Lowe's", ("lowe's", "lowes"), True),
    ("KO", "Coca-Cola", ("coca-cola", "coca cola"), False),
    ("PEP", "PepsiCo", ("pepsico", "pepsi"), True),
    ("PG", "Procter & Gamble", ("procter & gamble",), False),
    ("DIS", "Disney", ("walt disney",), False),
    # Communications / Utilities
    ("T", "AT&T", ("at&t",), True),
    ("VZ", "Verizon", (), False),
    ("TMUS", "T-Mobile", ("t-mobile",), False),
    ("CMCSA", "Comcast", (), False),
    ("NEE", "NextEra", ("nextera energy",), False),
    ("DUK", "Duke Energy", ("duke energy",), False),
    ("SO", "Southern Company", ("southern company",), True),
    ("CEG", "Constellation Energy", ("constellation energy",), False),
]

COMPANY_REGISTRY: dict[str, Company] = {
    ticker: Company(ticker=ticker, name=name, aliases=aliases, ambiguous=amb)
    for ticker, name, aliases, amb in _ROWS
}

# Canonical names that are ordinary market vocabulary ("price target", "shell
# company", "travel visa") never enter the lowercase name scan — these resolve
# only via their explicit safer aliases or the caps-token path.
_NAME_ALIAS_SKIP = {"TGT", "SHEL", "V"}

# normalized alias → ticker. The canonical name aliases itself unless it IS
# the ticker string (bare "ups"/"ge" lowercase would be word noise — the
# case-sensitive caps-token path already owns ticker-shaped mentions).
_ALIAS_TO_TICKER: dict[str, str] = {}
for _c in COMPANY_REGISTRY.values():
    names = list(_c.aliases)
    if _c.ticker not in _NAME_ALIAS_SKIP and _norm(_c.name).strip() != _c.ticker.lower():
        names.append(_c.name)
    for _alias in names:
        _ALIAS_TO_TICKER[_norm(_alias).strip()] = _c.ticker


def is_known_ticker(token: str) -> bool:
    return token in COMPANY_REGISTRY


def company_name(ticker: str) -> str | None:
    rec = COMPANY_REGISTRY.get(ticker)
    return rec.name if rec else None


# market nouns that disambiguate a bare ambiguous ticker ("CAT shares",
# "ON earnings") — deliberately narrow; "CAT scan" and "IT spending" must fail
_CTX_NOUNS = r"(?:shares?|stock|earnings|results|guidance|revenue|dividend)"


def _has_ticker_context(ticker: str, text: str) -> bool:
    return bool(re.search(
        rf"(?:\${ticker}\b|\b{ticker}(?=\s+{_CTX_NOUNS}\b))", text))


def resolve_companies(text: str, entities: list[str] | None = None,
                      limit: int = 8) -> list[str]:
    """Resolve canonical company tickers from free text (+ optional upstream
    entity hints). Deterministic; returns tickers in discovery order."""
    out: list[str] = []
    seen: set[str] = set()

    def _add(ticker: str) -> None:
        if ticker not in seen and len(out) < limit:
            seen.add(ticker)
            out.append(ticker)

    # 1. name/alias mentions — highest confidence, resolves ambiguous tickers
    norm = _norm(text)
    for alias, ticker in _ALIAS_TO_TICKER.items():
        if f" {alias} " in norm:
            _add(ticker)

    # 2. explicit $TICKER notation
    for m in _DOLLAR_RE.finditer(text):
        _add(m.group(1))

    # 3. bare uppercase registry tickers (ambiguous ones need context)
    for tok in _CAPS_RE.findall(text):
        rec = COMPANY_REGISTRY.get(tok)
        if rec and (not rec.ambiguous or _has_ticker_context(tok, text)):
            _add(tok)

    # 4. upstream entity hints, held to the same registry rule
    for ent in entities or []:
        rec = COMPANY_REGISTRY.get(ent)
        if rec and (not rec.ambiguous or _has_ticker_context(ent, text)):
            _add(ent)

    return out


def looks_like_ticker(token: str) -> bool:
    """Shape check only — used for curated sources (theme ontology assets)
    that are already canonical and must not be re-litigated here."""
    return bool(_TICKER_SHAPE_RE.match(token))
