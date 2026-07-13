"""M3.2 identity: company/industry/driver/regime/narrative/relationship UIDs,
alias-safe determinism, unresolved namespace, direction rules."""

from __future__ import annotations

import pytest

from app.institutional_memory.identity import (
    company_uid,
    driver_uid,
    industry_uid,
    narrative_uid,
    parse_relationship_uid,
    parse_uid,
    regime_uid,
    relationship_uid,
    sector_uid,
)


def test_company_uid_stable_and_normalized():
    assert company_uid("NVDA") == "company:ticker:NVDA"
    assert company_uid(" nvda ") == "company:ticker:NVDA"
    assert company_uid("BRK.B") == "company:ticker:BRK.B"
    assert company_uid("TLT") == "company:ticker:TLT"      # ETFs are tradeable tickers


def test_invalid_ticker_lands_in_unresolved_not_guessed():
    assert company_uid("Not A Ticker Co").startswith("company:unresolved:")
    assert company_uid("123456789012345") == "company:unresolved:123456789012345"
    with pytest.raises(ValueError):
        company_uid("///")


def test_taxonomy_uids_deterministic():
    assert industry_uid("Semiconductors") == "industry:taxonomy:semiconductors"
    assert industry_uid("Real Estate") == "industry:taxonomy:real-estate"
    assert sector_uid("Information Technology") == "sector:taxonomy:information-technology"
    assert driver_uid("AI Capex Supercycle") == "driver:ontology:ai-capex-supercycle"
    assert regime_uid("Risk-On Dovish") == "regime:taxonomy:risk-on-dovish"


def test_narrative_uid_from_driver_set_is_order_and_label_independent():
    a, key_a = narrative_uid(["driver:ontology:power-load-growth",
                              "driver:ontology:ai-capex-supercycle"])
    b, key_b = narrative_uid(["driver:ontology:ai-capex-supercycle",
                              "driver:ontology:power-load-growth"])
    assert a == b and key_a == key_b
    assert a.startswith("narrative:driverset:")
    assert key_a == ("driver:ontology:ai-capex-supercycle"
                     "+driver:ontology:power-load-growth")
    # a different driver set is a different narrative
    c, _ = narrative_uid(["driver:ontology:ai-capex-supercycle"])
    assert c != a
    with pytest.raises(ValueError):
        narrative_uid([])


def test_relationship_uid_direction_matters_for_directed_types():
    ab, *_ = relationship_uid("theme:ontology:ai-energy-demand", "drives",
                              "industry:taxonomy:utilities")
    ba, *_ = relationship_uid("industry:taxonomy:utilities", "drives",
                              "theme:ontology:ai-energy-demand")
    assert ab != ba
    assert ab == "rel:theme:ontology:ai-energy-demand|drives|industry:taxonomy:utilities"


def test_symmetric_types_normalize_endpoint_order():
    ab, src, tgt, direction = relationship_uid(
        "theme:ontology:treasury-yield-pressure", "correlates",
        "theme:ontology:ai-energy-demand")
    ba, *_ = relationship_uid(
        "theme:ontology:ai-energy-demand", "correlates",
        "theme:ontology:treasury-yield-pressure")
    assert ab == ba
    assert direction == "symmetric"
    assert src == "theme:ontology:ai-energy-demand"        # lexical order


def test_relationship_types_are_verbatim_never_merged():
    pressures, *_ = relationship_uid("theme:ontology:treasury-yield-pressure",
                                     "pressures", "industry:taxonomy:real-estate")
    weakens, *_ = relationship_uid("theme:ontology:treasury-yield-pressure",
                                   "weakens", "industry:taxonomy:real-estate")
    assert pressures != weakens                             # no synonym merging


def test_parse_relationship_uid_roundtrip():
    uid, *_ = relationship_uid("theme:ontology:ai-energy-demand", "exposed_to",
                               "company:ticker:NVDA")
    src, rtype, tgt = parse_relationship_uid(uid)
    assert (src, rtype, tgt) == ("theme:ontology:ai-energy-demand", "exposed_to",
                                 "company:ticker:NVDA")
    for bad in ("rel:x|drives", "notrel:a|b|c", "rel:bad-uid|drives|company:ticker:A"):
        with pytest.raises(ValueError):
            parse_relationship_uid(bad)


def test_parse_uid_accepts_new_types():
    assert parse_uid("company:ticker:NVDA") == ("company", "ticker", "NVDA")
    assert parse_uid("industry:taxonomy:utilities") == ("industry", "taxonomy", "utilities")
    assert parse_uid("driver:ontology:terminal-rate") == ("driver", "ontology", "terminal-rate")
    assert parse_uid("regime:taxonomy:yield-shock") == ("regime", "taxonomy", "yield-shock")
    etype, ns, key = parse_uid("narrative:driverset:0123456789abcdef")
    assert (etype, ns) == ("narrative", "driverset")
    for bad in ("company:taxonomy:NVDA", "narrative:driverset:tooshort",
                "industry:ontology:utilities"):
        with pytest.raises(ValueError):
            parse_uid(bad)
