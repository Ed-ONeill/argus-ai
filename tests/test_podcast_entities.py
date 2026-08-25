"""
RC2-D2 — episode entities from the TITLE only.

`Episode.entities` was hardcoded `[]`, so six Listen sections rendered empty:
"which companies entered the conversation?", most-discussed companies, the
company/theme heatmap, the referenced-people and referenced-funds leaderboards,
and the influential-episode ranking term.

TITLE ONLY, and the reason is measured. Description text carries two artefact
classes that the publisher guard alone cannot fix:

  * publisher boilerplate  - 10 of 12 MS mentions came from Morgan Stanley's own
                             show, "Thoughts on the Market"
  * guest-employer blocks  - Bloomberg Surveillance lists guests and their firms
                             ("Featuring: ... Head of ... Citi"), producing
                             JPM/SCHW/GS/C/BAC mentions for the bank that employed
                             the guest, not a company being discussed

Together those made 48% of description-derived mentions artefacts of who produced
or appeared on the show. Measured title-only on the 175-episode corpus: 14
episodes with an entity, 12 distinct companies, zero publisher artefacts, zero
guest-employer blocks, and a manual audit of all 14 found every resolution to name
a company genuinely discussed in the title.

The resolver is RC2-A's `resolve_entities` and nothing else - no second ticker
regex, no new identity mapping. The publisher guard derives its ticker by asking
that same resolver what the registry's publisher string resolves to.

These entities are COVERAGE. RC2-E3 is the frozen boundary downstream: the graph
edge is `Episode --mentions--> Company`, which can never become thesis evidence or
forecast authority.
"""

from __future__ import annotations

import time

import feedparser
import pytest

from api.podcast_feeds import _episode_entities, _normalize, _publisher_ticker


# ── Titles resolve to canonical tickers ─────────────────────────────────────

class TestTitleResolution:
    def test_a_company_named_in_the_title_is_emitted(self):
        assert _episode_entities("Nvidia Takes Aim at Frontier AI Developers", "WSJ") == ["NVDA"]

    def test_multiple_companies_yield_a_deterministic_list(self):
        # The measured live case: "Weak Housing Market Weighs on Home Depot and Lowe's"
        out = _episode_entities(
            "What's News in Earnings: Weak Housing Market Weighs on Home Depot and Lowe's", "WSJ")
        assert set(out) == {"HD", "LOW"}
        # deterministic: identical input, identical order
        assert out == _episode_entities(
            "What's News in Earnings: Weak Housing Market Weighs on Home Depot and Lowe's", "WSJ")

    def test_the_list_is_deduplicated(self):
        out = _episode_entities("Nvidia beats, and Nvidia raises guidance for Nvidia's datacenter", "WSJ")
        assert out.count("NVDA") == 1

    def test_an_empty_title_yields_no_entities(self):
        assert _episode_entities("", "WSJ") == []
        assert _episode_entities("   ", "WSJ") == []

    def test_a_title_with_no_company_yields_no_entities(self):
        assert _episode_entities("The Fed holds rates steady amid CPI concerns", "WSJ") == []
        assert _episode_entities("A conversation about market structure", "Bloomberg") == []


# ── End to end through the normalizer: description is never consulted ───────

def _entry(title: str, description: str) -> feedparser.FeedParserDict:
    e = feedparser.FeedParserDict()
    e["title"] = title
    e["summary"] = description
    e["link"] = "https://example.test/ep"
    e["published_parsed"] = time.gmtime()          # fresh, so the age cutoff passes
    e["enclosures"] = []
    return e


def _cfg(publisher: str = "Bloomberg") -> dict:
    return {"show_name": "Test Show", "publisher": publisher,
            "default_topics": ["Markets"], "source_tier": 1}


def _normalized(title: str, description: str, publisher: str = "Bloomberg") -> dict:
    feed = feedparser.FeedParserDict()
    feed["feed"] = feedparser.FeedParserDict()
    ep = _normalize(_entry(title, description), feed, _cfg(publisher))
    assert ep is not None, "episode was rejected before entity resolution"
    return ep


class TestNormalizerWiring:
    """The real pipeline path. These are the tests that fail against pre-fix code,
    where `"entities": []` was hardcoded."""

    def test_a_company_in_the_title_reaches_the_episode(self):
        ep = _normalized("Nvidia Takes Aim at Frontier AI Developers",
                         "A discussion of the chip market.")
        assert ep["entities"] == ["NVDA"]

    def test_a_company_only_in_the_description_does_not(self):
        # The artefact class title-only exists to exclude.
        ep = _normalized("Weekly markets round-up",
                         "Featuring Jane Doe, Head of Equity Strategy at Citi, "
                         "and a discussion of Nvidia's quarter.")
        assert ep["entities"] == []

    def test_publisher_boilerplate_in_the_description_does_not(self):
        # "Thoughts on the Market" closes every episode naming Morgan Stanley.
        ep = _normalized("Why the rates market is repricing",
                         "Morgan Stanley Research analysts discuss. Morgan Stanley "
                         "does and seeks to do business with companies covered.",
                         publisher="Morgan Stanley")
        assert ep["entities"] == []

    def test_a_guest_employer_block_in_the_description_does_not(self):
        ep = _normalized("Central Bank Policy Pivots & Macro Sensitivity Risks",
                         "Featuring: Bob Smith, Chief Economist at JPMorgan; "
                         "Ann Lee, Strategist at Charles Schwab.")
        assert ep["entities"] == []

    def test_the_publisher_guard_applies_on_the_pipeline_path(self):
        ep = _normalized("Morgan Stanley's view on rates", "d", publisher="Morgan Stanley")
        assert ep["entities"] == []
        ep = _normalized("Morgan Stanley's view on rates", "d", publisher="Bloomberg")
        assert ep["entities"] == ["MS"]

    def test_entities_is_always_a_list_of_strings(self):
        ep = _normalized("A conversation about market structure", "d")
        assert ep["entities"] == []
        assert isinstance(ep["entities"], list)


# ── Publisher self-mention suppression ──────────────────────────────────────

class TestPublisherGuard:
    def test_the_guard_derives_tickers_from_the_RC2A_resolver(self):
        # No hardcoded table: the registry's publisher string is resolved.
        assert _publisher_ticker("Morgan Stanley") == "MS"
        assert _publisher_ticker("Goldman Sachs") == "GS"

    def test_publishers_that_are_not_issuers_resolve_to_nothing(self):
        for publisher in ["Bloomberg", "The Compound", "Colossus", "Axios", "WSJ"]:
            assert _publisher_ticker(publisher) is None

    def test_the_publisher_ticker_is_suppressed_in_its_own_show(self):
        assert _episode_entities("Morgan Stanley's view on rates", "Morgan Stanley") == []
        assert _episode_entities("Goldman Sachs on credit spreads", "Goldman Sachs") == []

    def test_the_same_company_survives_on_someone_elses_show(self):
        # Self-coverage is suppressed; genuine third-party coverage is not.
        assert _episode_entities("Morgan Stanley's view on rates", "Bloomberg") == ["MS"]

    def test_suppression_removes_only_the_publisher_ticker(self):
        out = _episode_entities("Morgan Stanley and Nvidia on the AI trade", "Morgan Stanley")
        assert "MS" not in out
        assert "NVDA" in out

    def test_an_ambiguous_publisher_suppresses_nothing(self):
        # Only an unambiguous single match is used as the guard.
        assert _publisher_ticker("Some Unlisted Media Group") is None


# ── Only canonical companies, via RC2-A ─────────────────────────────────────

class TestEntityContract:
    @pytest.mark.parametrize("title", [
        "CPI comes in hot and the FOMC responds",      # indicators
        "PJM and ERCOT grid constraints deepen",       # non-company acronyms
        "A look at the US and China trade balance",    # geographies
        "Gold, oil and the dollar all move",           # instruments
    ])
    def test_non_company_tokens_are_excluded_by_the_resolver(self, title):
        assert _episode_entities(title, "Bloomberg") == []

    def test_every_emitted_value_is_an_uppercase_canonical_ticker(self):
        out = _episode_entities("Nvidia, Microsoft and Meta on the AI buildout", "WSJ")
        assert out, "expected at least one resolution"
        for ticker in out:
            assert ticker == ticker.upper()
            assert 1 <= len(ticker) <= 5

    def test_no_confidence_or_ranking_is_attached(self):
        out = _episode_entities("Nvidia and Microsoft", "WSJ")
        assert isinstance(out, list)
        assert all(isinstance(x, str) for x in out)

    def test_resolution_never_raises_on_odd_input(self):
        for title in ["", "   ", "!!!", "a" * 5000, "1234567890"]:
            assert isinstance(_episode_entities(title, "WSJ"), list)


# ── The measured live corpus, pinned ────────────────────────────────────────

class TestMeasuredCases:
    """Every resolution from the 175-episode precision audit that a unit test can
    reproduce deterministically from its title alone."""

    @pytest.mark.parametrize("title,expected", [
        ("Meta Is Back on Trial in California", {"META"}),
        ("Disney: The Renaissance and the Empire", {"DIS"}),
        ("Microsoft's Deputy CISO on Securing AI Agents", {"MSFT"}),
        ("US Bond Yields, Kevin Warsh, and Nvidia Preview", {"NVDA"}),
        ("He's Been a Costco Cashier for 40 Years. Now He's a Millionaire.", {"COST"}),
    ])
    def test_audited_titles_resolve_as_measured(self, title, expected):
        assert set(_episode_entities(title, "WSJ")) == expected

    def test_a_multi_company_headline_resolves_both(self):
        out = set(_episode_entities(
            "Tradeable Lows, Nvidia's Data Center Finance Deal, Surprise Comebacks for Schwab", "WSJ"))
        assert {"NVDA", "SCHW"} <= out
