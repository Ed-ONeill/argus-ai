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

import json
import os
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

# ── Authoritative security validation (RC2-A follow-up) ──────────────────────
# The SEC issuer snapshot is a VALIDATION set for EXPLICIT ticker intent only.
# It is never used for bare-uppercase resolution: opening 10k+ symbols to the
# bare path would reinstate exactly the false positives RC2-A removed. It gates
# the two notations that carry unambiguous authorial intent:
#     "Global Indemnity (GBLI)"   — a company name immediately before (TICKER)
#     "$GBLI"                     — explicit ticker notation
# Refresh with scripts/refresh_sec_tickers.py.

_SEC_SNAPSHOT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "data", "reference", "sec_registered_tickers.json",
)
_sec_tickers: frozenset[str] | None = None


def _registered_securities() -> frozenset[str]:
    """The SEC-registered ticker set, loaded once. A missing/broken snapshot
    fails SAFE to empty: long-tail resolution simply stops, and nothing that
    was not already resolvable becomes a company."""
    global _sec_tickers
    if _sec_tickers is None:
        try:
            with open(_SEC_SNAPSHOT_PATH, encoding="utf-8") as fh:
                _sec_tickers = frozenset(json.load(fh)["tickers"])
        except Exception:
            _sec_tickers = frozenset()
    return _sec_tickers


def is_registered_security(token: str) -> bool:
    """True when the token is a ticker in the authoritative SEC issuer set."""
    return token.upper() in _registered_securities()


# A capitalized name-like phrase immediately followed by (TICKER). The preceding
# word must be capitalized so a bare "(CPI)" or "in (GW) terms" cannot match.
_PAREN_TICKER_RE = re.compile(
    r"\b[A-Z][\w&.'’-]*(?:[\s-][A-Z][\w&.'’-]*){0,4}\s*\(([A-Z]{1,5})\)"
)


def _explicit_ticker_candidates(text: str) -> list[str]:
    """Tickers named with unambiguous intent, in discovery order.
    Validation against the registry / SEC set is the caller's job."""
    out: list[str] = []
    for m in _PAREN_TICKER_RE.finditer(text):
        out.append(m.group(1))
    for m in _DOLLAR_RE.finditer(text):
        out.append(m.group(1))
    return out


def _has_ticker_context(ticker: str, text: str) -> bool:
    """Explicit company evidence for an otherwise ambiguous token: $TICKER,
    a Name (TICKER) parenthetical, or a market noun immediately after it."""
    if re.search(rf"(?:\${ticker}\b|\b{ticker}(?=\s+{_CTX_NOUNS}\b))", text):
        return True
    return ticker in _explicit_ticker_candidates(text)


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

    # 2. EXPLICIT ticker intent — "Name (TICKER)" or "$TICKER". This is the only
    # path that reaches beyond the curated registry, and it accepts a long-tail
    # symbol ONLY when the authoritative SEC issuer set confirms it is a real
    # security. "(CPI)", "(PJM)", "(FOMC)" therefore cannot resolve: they carry
    # the notation but are not securities.
    for tok in _explicit_ticker_candidates(text):
        if tok in COMPANY_REGISTRY or is_registered_security(tok):
            _add(tok)

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


# ══════════════════════════════════════════════════════════════════════════════
# Typed non-company entities (RC2-A)
#
# The registry above answers "is this token a company?". It cannot answer "then
# what IS it?", so every non-company uppercase token used to be either silently
# converted into a Company (the RC2-A defect) or thrown away.
#
# This lexicon does NOT gate anything — the registry still decides what a
# company is, and an unrecognized token resolves to nothing. Its jobs are:
#   1. PRESERVE useful non-company entities with a correct kind, so downstream
#      consumers can use "PJM" as a grid operator instead of a fake issuer.
#   2. OVERRIDE registry collisions: tokens that are real tickers AND have a
#      dominant non-company sense (RTO, DC, FC, HBM, LNG, RL, COLA, INSM).
#      The override yields to explicit company context ($TICKER, a company-name
#      mention, or a market noun) via the same _has_ticker_context rule, so a
#      genuine "LNG shares" or "$RL" still resolves to the security.
#
# Adding a row types an entity better; it never turns an unknown into a
# company. Unknown stays unknown, by design.
# ══════════════════════════════════════════════════════════════════════════════

# Entity kinds. "company" is produced by the registry, never by this lexicon.
KIND_COMPANY = "company"
KIND_INDICATOR = "indicator"            # economic statistics / data releases
KIND_INSTITUTION = "institution"        # agencies, central banks, regulators, bodies
KIND_MARKET_OPERATOR = "market_operator"  # grid / exchange / clearing operators
KIND_GEOGRAPHY = "geography"            # places and jurisdictions
KIND_UNIT = "unit"                      # units of measure
KIND_INSTRUMENT = "instrument"          # indices, yields, non-equity instruments
KIND_TECHNOLOGY = "technology"          # product / component / method acronyms
KIND_FINANCE_TERM = "finance_term"      # market vocabulary, not an issuer
KIND_PUBLICATION = "publication"        # media outlets and research desks
KIND_SECTOR = "sector"                  # curated sector label (see feeds.py)

NON_COMPANY_LEXICON: dict[str, str] = {}


def _lex(kind: str, *tokens: str) -> None:
    for t in tokens:
        NON_COMPANY_LEXICON[t] = kind


_lex(KIND_INDICATOR,
     "CPI", "CPIH", "PPI", "PCE", "GDP", "NFP", "ISM", "PMI", "JOLTS", "COLA",
     "HICP", "RPI", "CPE", "GNP", "IIP", "NHS")
_lex(KIND_INSTITUTION,
     "FOMC", "FERC", "NERC", "FDIC", "OCC", "CFTC", "FINRA", "FASB", "FHFA",
     "NCUA", "SIPC", "PBOC", "SNB", "RBI", "RBNZ", "BOC", "CBO", "GAO", "OMB",
     "NIST", "NRC", "FAA", "FDA", "EPA", "DOE", "DOD", "DHS", "USDA", "USTR",
     "OSHA", "NHTSA", "NOAA", "IAEA", "ICE", "LBNL", "NREL", "MIT", "CERN",
     "LAFPP", "CALPERS", "CDPQ", "GIC", "PIF", "NBIM")
_lex(KIND_MARKET_OPERATOR,
     "PJM", "ERCOT", "CAISO", "NYISO", "MISO", "SPP", "ISONE", "IESO", "AESO",
     "NEISO", "RTO", "ISO", "NEM", "EPEX", "NORDPOOL", "DTCC", "OCC2")
_lex(KIND_GEOGRAPHY,
     "LA", "DC", "NYC", "SF", "LDN", "HK", "SG", "UAE", "KSA", "ROK", "PRC")
_lex(KIND_UNIT,
     "GW", "MW", "KW", "TWH", "GWH", "MWH", "KWH", "BBL", "MMBTU", "BCF", "TCF",
     "BPS", "BPD", "MTPA")
_lex(KIND_INSTRUMENT,
     "TNX", "VIX", "DXY", "SPX", "NDX", "RUT", "JGB", "OAT", "BTP", "BUND",
     "SOFR", "ESTR", "SONIA", "TIPS", "OAS", "CDS", "CDX", "ETF", "ETN")
_lex(KIND_TECHNOLOGY,
     "HBM", "NAND", "DRAM", "GPU", "CPU", "TPU", "ASIC", "SSD", "HDD", "LLM",
     "EUV", "DUV", "CPX", "CHPE", "INSM", "SMR", "CCS", "EV", "BESS", "PPA")
_lex(KIND_FINANCE_TERM,
     "PIK", "OTC", "LBO", "MBO", "NAV", "AUM", "IRR", "MOIC", "EBITDA", "CAGR",
     "ARR", "NRR", "FCF", "EPS", "ROE", "ROI", "IPO", "SPAC", "PIPE", "ESG",
     "CLO", "CDO", "ABS", "MBS", "REIT", "SPV", "GP", "LP", "FD", "IBD2")
_lex(KIND_PUBLICATION,
     "IBD", "WSJ", "FT", "NYT", "CNBC", "BBC", "AP", "AFP", "DJ", "MW")


def classify_non_company(token: str) -> str | None:
    """The token's non-company kind, or None if it has no known such sense."""
    return NON_COMPANY_LEXICON.get(token.upper())


@dataclass(frozen=True)
class TypedEntity:
    token: str
    kind: str


@dataclass(frozen=True)
class ResolvedEntities:
    """Companies and correctly-typed non-companies from one piece of text."""
    companies: list[str]
    typed: list[TypedEntity]


def resolve_entities(text: str, limit: int = 4,
                     typed_limit: int = 4) -> ResolvedEntities:
    """The single entity-resolution entry point for ingestion.

    Companies come from the registry (name-first, then $TICKER, then bare
    registry tokens with the ambiguity rule). Non-company tokens are typed
    from the lexicon. An uppercase token that is neither is UNKNOWN and is
    deliberately dropped — never promoted to a company.
    """
    # A lexicon token only loses to the registry when the text gives explicit
    # company context, so "LNG terminal" stays a commodity and "LNG shares"
    # stays the issuer.
    companies = [
        t for t in resolve_companies(text, limit=limit * 2)
        if classify_non_company(t) is None or _has_ticker_context(t, text)
    ][:limit]

    typed: list[TypedEntity] = []
    seen: set[str] = set()
    for tok in _CAPS_RE.findall(text):
        if tok in seen or tok in companies:
            continue
        kind = classify_non_company(tok)
        if kind is None:
            continue          # unknown — stays unknown
        seen.add(tok)
        typed.append(TypedEntity(token=tok, kind=kind))
        if len(typed) >= typed_limit:
            break

    return ResolvedEntities(companies=companies, typed=typed)
