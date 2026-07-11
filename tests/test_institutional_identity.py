"""Identity: stable UIDs, label independence, legacy namespace, parsing."""

from __future__ import annotations

import pytest

from app.institutional_memory.identity import (
    coerce_theme_uid,
    parse_uid,
    slugify,
    theme_uid,
)


def test_ontology_id_maps_to_stable_uid():
    assert theme_uid("ai-energy-demand") == "theme:ontology:ai-energy-demand"
    assert theme_uid("treasury-yield-pressure") == "theme:ontology:treasury-yield-pressure"


def test_uid_is_deterministic_and_label_independent():
    # The UID derives only from the pipeline theme id; display labels play no part.
    assert theme_uid("ai-energy-demand") == theme_uid("ai-energy-demand")


def test_unknown_key_lands_in_legacy_namespace_not_ontology():
    uid = theme_uid("Some Renamed Display Theme")
    assert uid == "theme:legacy:some-renamed-display-theme"
    # near-miss of a real ontology id must NOT silently merge
    assert theme_uid("ai-energy-demand-v2") == "theme:legacy:ai-energy-demand-v2"


def test_empty_theme_id_rejected():
    with pytest.raises(ValueError):
        theme_uid("")
    with pytest.raises(ValueError):
        theme_uid("///")


def test_parse_uid_roundtrip_and_validation():
    assert parse_uid("theme:ontology:ai-energy-demand") == (
        "theme", "ontology", "ai-energy-demand")
    assert parse_uid("theme:legacy:old-slug") == ("theme", "legacy", "old-slug")
    for bad in ("company:ticker:NVDA", "theme:ontology:", "theme:bogus:x",
                "not-a-uid", "", "theme:ontology:UPPER"):
        with pytest.raises(ValueError):
            parse_uid(bad)


def test_coerce_accepts_bare_id_and_full_uid():
    assert coerce_theme_uid("ai-energy-demand") == "theme:ontology:ai-energy-demand"
    assert coerce_theme_uid("theme:ontology:ai-energy-demand") == (
        "theme:ontology:ai-energy-demand")
    with pytest.raises(ValueError):
        coerce_theme_uid("theme:nope:x")


def test_slugify_deterministic():
    assert slugify("  Grid Bottleneck / Trade!  ") == "grid-bottleneck-trade"
