"""
RC2-A — entity-resolution integrity.

The defect: ingestion accepted ANY 2-5 char uppercase title token that was not
on a hand-maintained acronym blocklist and called it a company. FOMC, CPI, PPI,
PJM, ERCOT, CAISO, NYISO, NERC, GW, LA, LBNL and friends became "companies"
everywhere downstream — sector top_entity, industry primary_drivers, story
Company nodes in the canonical graph, feed-card ticker chips.

The contract these tests bind:

  1. A token is a COMPANY only when it resolves against the canonical registry.
  2. A known non-company token is TYPED (indicator / institution /
     market_operator / geography / unit / instrument / technology /
     finance_term / publication) — preserved, not deleted, not a company.
  3. An unrecognized token is UNKNOWN and is dropped. Unknown beats wrong.
  4. A legitimate ticker is NOT sacrificed just because it looks like a word or
     an acronym — explicit context still resolves it to the security.
  5. The curated registry contains only real SEC-registered issuers.
"""

from __future__ import annotations

import json
import os

import pytest

from app.companies import (
    COMPANY_REGISTRY,
    KIND_FINANCE_TERM,
    KIND_GEOGRAPHY,
    KIND_INDICATOR,
    KIND_INSTITUTION,
    KIND_INSTRUMENT,
    KIND_MARKET_OPERATOR,
    KIND_TECHNOLOGY,
    KIND_UNIT,
    classify_non_company,
    resolve_entities,
)
from app.feeds import FeedItem, _extract_entities


def _entities(title: str, snippet: str = "") -> list[str]:
    item = FeedItem(title=title, url="https://x/1", source="Test",
                    category="Markets", snippet=snippet)
    return _extract_entities(item)


def _typed(title: str, snippet: str = "") -> dict[str, str]:
    item = FeedItem(title=title, url="https://x/1", source="Test",
                    category="Markets", snippet=snippet)
    _extract_entities(item)
    return {t["token"]: t["kind"] for t in item.typed_entities}


# ── 1. The audit's known bad cases are never companies ───────────────────────

AUDIT_FALSE_POSITIVES = [
    # (token, headline it came from in the live audit, expected kind)
    ("FOMC",  "Federal Reserve issues FOMC statement",                        KIND_INSTITUTION),
    ("FERC",  "FERC Approves Updated INSM Standard",                          KIND_INSTITUTION),
    ("NERC",  "3 GW Off PJM, Again: What NERC's 2024 Investigation Told Us",  KIND_INSTITUTION),
    ("CPI",   "CPI for all items increases 0.1% in July; shelter rises",      KIND_INDICATOR),
    ("PPI",   "PPI for final demand declines 0.3% in June; goods fall 1.4%",  KIND_INDICATOR),
    ("PJM",   "PJM eyes data center reliability requirements after 3.8 loss", KIND_MARKET_OPERATOR),
    ("ERCOT", "Hourly peak load in ERCOT set a new record on July 28",        KIND_MARKET_OPERATOR),
    ("CAISO", "FERC Approves CAISO Start-up Funding Plan",                    KIND_MARKET_OPERATOR),
    ("NYISO", "NYISO: CHPE yet to Demonstrate Full Capability",               KIND_MARKET_OPERATOR),
    ("RTO",   "FERC Approves CAISO Start-up Funding Plan - RTO Insider",      KIND_MARKET_OPERATOR),
    ("LA",    "Josh Kushner, Bob Iger Buy LA Lakers for Over $12 Billion",    KIND_GEOGRAPHY),
    ("GW",    "Hourly peak load exceeded 91 GW on July 28",                   KIND_UNIT),
    ("NAND",  "SK Hynix expanding Solidigm Dalian NAND plant",                KIND_TECHNOLOGY),
    ("HBM",   "Huawei Ascend Production Ramp: HBM supply constraints",        KIND_TECHNOLOGY),
    ("PIK",   "Private credit lenders tighten PIK terms as concerns mount",   KIND_FINANCE_TERM),
    ("OTC",   "Results of the June survey on credit terms in OTC markets",    KIND_FINANCE_TERM),
    ("TNX",   "TNX yields back above 4.5% after the auction",                 KIND_INSTRUMENT),
]


@pytest.mark.parametrize("token,headline,kind", AUDIT_FALSE_POSITIVES)
def test_audit_false_positive_is_never_a_company(token, headline, kind):
    assert token not in _entities(headline), (
        f"{token} was resolved as a company from: {headline}"
    )


@pytest.mark.parametrize("token,headline,kind", AUDIT_FALSE_POSITIVES)
def test_audit_false_positive_is_typed_not_discarded(token, headline, kind):
    assert _typed(headline).get(token) == kind


def test_registry_colliding_tokens_lose_to_their_dominant_sense():
    """RTO, DC, FC, HBM, LNG, RL, COLA are real tickers AND common acronyms.
    Registry membership alone is not enough — the non-company sense wins
    unless the text gives explicit company context."""
    assert "RTO" not in _entities("FERC approves the plan - RTO Insider")
    assert "DC" not in _entities("DC Circuit upholds FERC rule on grid connections")
    assert "LNG" not in _entities("Mexico's second LNG terminal shipped first cargo")
    assert "HBM" not in _entities("TSMC continues HBM production ramp")


def test_unknown_acronyms_are_dropped_not_promoted():
    """The constraint: never silently convert an unknown acronym into a company."""
    for headline in [
        "Former LBNL supercomputing facility in Oakland targeted for reuse",
        "LAFPP reaffirms conviction in lower mid-market managers",
        "Ari Emanuel buys theatre group ATG for 4.5bn",
        "Why No. 2 IBD 50 Stock, Liquidia, Dropped Despite Its Sales Beat",
        "NYISO: CHPE yet to Demonstrate Full Capability",
    ]:
        ents = _entities(headline)
        assert all(e in COMPANY_REGISTRY or e[0].isupper() and " " in e or e.istitle()
                   for e in ents), f"unresolved token leaked as an entity: {ents}"
        for bad in ("LBNL", "LAFPP", "ATG", "IBD", "CHPE", "ROWE"):
            assert bad not in ents


# ── 2. Legitimate tickers survive, including the ambiguous ones ──────────────

def test_company_names_resolve_to_tickers():
    """Name-first resolution — the coverage half of the fix. Financial copy
    writes 'Nvidia', not 'NVDA'."""
    assert "NVDA" in _entities("Nvidia beats earnings estimates and raises guidance")
    assert set(_entities("Apple and Microsoft extend their cloud partnership")) >= {"AAPL", "MSFT"}
    assert "TSM" in _entities("TSMC continued production ramp in Arizona")


def test_unambiguous_bare_tickers_still_resolve():
    assert "NVDA" in _entities("NVDA guidance lifts the whole semiconductor complex")
    assert "KKR" in _entities("KKR 8-K - Entry into a Material Definitive Agreement")


def test_ambiguous_tickers_resolve_with_explicit_context():
    """Do NOT remove a legitimate ticker just because it resembles a word."""
    assert "CAT" in _entities("CAT shares jump after the industrial cycle turns")
    assert "LNG" in _entities("Cheniere (LNG) shares rise on export demand")
    assert "T" in _entities("AT&T lifts its dividend")


def test_ambiguous_tickers_stay_out_without_context():
    assert "CAT" not in _entities("A CAT scan revealed the fault in the turbine")
    assert "IT" not in _entities("IT spending is forecast to rise next year")
    assert "ON" not in _entities("Traders are ON edge before the print")


def test_dollar_notation_is_honoured_as_authorial_intent():
    assert "AAPL" in _entities("$AAPL rips higher on services strength")


# ── 2b. SEC-validated EXPLICIT ticker intent (long tail) ────────────────────
# Beyond the curated registry, and ONLY for unambiguous notation, validated
# against the authoritative SEC issuer snapshot.

def test_parenthetical_ticker_after_a_company_name_resolves():
    """Global Indemnity (GBLI) — the recall case RC2-A gave up."""
    assert "GBLI" in _entities("Global Indemnity (GBLI) Q2 2026 Earnings Call Transcript")
    assert "EXTR" in _entities("Extreme Networks (EXTR) Q4 2026 Earnings Call Transcript")


def test_dollar_notation_reaches_the_long_tail_when_sec_validated():
    assert "GBLI" in _entities("$GBLI rips after the print")
    assert "TPG" in _entities("$TPG upgraded by analysts on fundraising momentum")


def test_bare_long_tail_token_still_does_not_resolve():
    """The resolver is NOT weakened to recover TPG: a bare uppercase token
    outside the curated registry stays unresolved even though TPG is a real
    SEC-registered security."""
    assert "TPG" not in _entities("TPG agrees $925m deal to acquire South Korea's Lotte Rental")
    assert "GBLI" not in _entities("GBLI reported numbers this morning")


@pytest.mark.parametrize("token", ["CPI", "PJM", "FOMC", "NERC", "ERCOT", "CAISO", "GW", "LBNL"])
def test_explicit_notation_cannot_mint_a_non_security(token):
    """The notation carries intent, but the SEC set is the authority: these
    are not securities, so neither ($TOKEN) nor Name (TOKEN) can resolve."""
    assert token not in _entities(f"Some Body Name ({token}) published an update")
    assert token not in _entities(f"${token} is trending in the commentary")


def test_explicit_intent_overrides_a_lexicon_collision():
    """A token with a dominant non-company sense still resolves to the security
    when the text names it explicitly — Insmed (INSM), Cheniere (LNG)."""
    assert "INSM" in _entities("Insmed (INSM) shares jump on trial data")
    assert "INSM" not in _entities("FERC Approves Updated INSM Standard")


def test_parenthetical_requires_a_preceding_capitalised_name():
    """A bare '(CPI)' with no company name in front of it must not match."""
    assert _entities("the print (CPI) came in soft") == [] or \
        "CPI" not in _entities("the print (CPI) came in soft")


def test_sec_snapshot_is_present_and_sane():
    from app.companies import is_registered_security
    assert is_registered_security("NVDA")
    assert is_registered_security("gbli")          # case-insensitive
    assert not is_registered_security("FOMC")
    assert not is_registered_security("PJM")


# ── 3. Shape and composition are unchanged for existing consumers ───────────

def test_sector_label_still_appended():
    ents = _entities("Chip makers rally as semiconductor demand accelerates")
    assert "Semiconductors" in ents


def test_entity_list_stays_capped_and_ordered_companies_first():
    ents = _entities("Apple, Microsoft, Nvidia and Amazon all rallied as chip demand rose")
    assert len(ents) <= 5
    companies = [e for e in ents if e in COMPANY_REGISTRY]
    assert ents[:len(companies)] == companies


def test_typed_entities_default_empty_and_never_none():
    item = FeedItem(title="A quiet day", url="u", source="s", category="Markets")
    assert item.typed_entities == []
    _extract_entities(item)
    assert isinstance(item.typed_entities, list)


# ── 4. The registry itself is authoritative ─────────────────────────────────

_SEC_SNAPSHOT = os.path.join(os.path.dirname(__file__), "..", "app", "data",
                             "reference", "sec_registered_tickers.json")


def test_every_curated_ticker_is_an_sec_registered_issuer():
    """Authoritative validation instead of a growing blocklist: the curated
    registry may never drift into containing something that is not a real
    registered security. Refresh the snapshot with
    scripts/refresh_sec_tickers.py."""
    with open(_SEC_SNAPSHOT, encoding="utf-8") as fh:
        sec = set(json.load(fh)["tickers"])
    unknown = sorted(t for t in COMPANY_REGISTRY if t not in sec)
    assert unknown == [], f"curated tickers not in the SEC issuer registry: {unknown}"


def test_lexicon_never_types_a_token_as_a_company():
    """The lexicon preserves and types; it can never mint a company."""
    from app.companies import NON_COMPANY_LEXICON
    assert all(kind != "company" for kind in NON_COMPANY_LEXICON.values())


def test_classify_non_company_is_case_insensitive_and_total():
    assert classify_non_company("pjm") == KIND_MARKET_OPERATOR
    assert classify_non_company("ZZZZ") is None


def test_resolve_entities_never_returns_a_token_in_both_channels():
    r = resolve_entities("PJM eyes data center reliability after 3.8 GW loss; Nvidia gains")
    typed_tokens = {t.token for t in r.typed}
    assert not (set(r.companies) & typed_tokens)
