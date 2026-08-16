"""
RC2-B1 — AI enrichment allocation and failure correctness.

The defects these tests pin, all measured on a production-shaped pool
(178 raw items -> 66 after capping, categories {Markets 26, Geopolitical 20,
Company 10, M&A 10}):

  1. BUDGET SEMANTICS. `items[:15]` spent the budget on the first 15 POSITIONS,
     including positions already enriched and served from cache. A pool whose head
     was fully cached did zero new work while 50 uncached items waited.
  2. LOST ENRICHMENT. Cache restoration ran only over those same first 15
     positions, so an item that had been enriched in an earlier cycle LOST its
     enrichment as soon as it slid past position 15.
  3. STARVATION. The feed orders by publication-hour bucket, and M&A sources
     publish far less often than the wires. Measured result: M&A received 0 of 15
     slots (0% coverage) despite 9 of its 11 items outscoring the weakest item the
     positional cap actually selected.
  4. FAILURE-CACHE POISONING. Every selected item was written to the cache
     unconditionally, including on transport failure, timeout, malformed payload
     and missing ITEM block - freezing an empty enrichment permanently, because
     the cache has no TTL.

Nothing here asserts that a fallback narrative should be invented. An item that
cannot be enriched keeps honest empty fields and stays retryable.
"""

from __future__ import annotations

import pytest

from app import summarizer as S
from app.feeds import FeedItem


# ── Fixtures ─────────────────────────────────────────────────────────────────

def item(title: str, category: str, *, inst: float = 50.0, sig: float = 50.0,
         url: str | None = None) -> FeedItem:
    return FeedItem(
        title=title, url=url or f"https://x/{title.replace(' ', '-')}",
        source="src", category=category, snippet=f"snippet for {title}",
        institutional_score=inst, signal_score=sig,
    )


@pytest.fixture(autouse=True)
def _clear_cache():
    S._SUMMARY_CACHE.clear()
    yield
    S._SUMMARY_CACHE.clear()


class FakeClient:
    """Returns a well-formed response for every ITEM in the prompt."""

    def __init__(self):
        self.calls: list[list[str]] = []

    def chat(self, messages, stream=True, temperature=0.2):
        body = messages[-1].content if hasattr(messages[-1], "content") else messages[-1]["content"]
        titles = [ln.split("Headline: ", 1)[1] for ln in body.splitlines() if ln.startswith("Headline: ")]
        self.calls.append(titles)
        out = []
        for i, t in enumerate(titles, 1):
            out.append(f"ITEM {i}\nSUMMARY: s-{t}\nWHY IT MATTERS: w-{t}\nIMPACT: Bullish\n")
        return iter(["".join(out)])


def install(monkeypatch, client) -> None:
    monkeypatch.setattr(S, "get_client", lambda: client)


def production_pool() -> list[FeedItem]:
    """The measured RC2-B shape: 66 items, M&A last and sparse."""
    pool: list[FeedItem] = []
    # Markets and Geopolitical dominate the recent hour buckets.
    for i in range(26):
        pool.append(item(f"mk{i:02d}", "Markets", inst=40 + i % 10, sig=45 + i % 12))
    for i in range(20):
        pool.append(item(f"gp{i:02d}", "Geopolitical", inst=38 + i % 9, sig=42 + i % 11))
    for i in range(10):
        pool.append(item(f"co{i:02d}", "Company", inst=55 + i, sig=58 + i))
    # M&A: strong scores, but oldest, so last in feed order.
    for i in range(10):
        pool.append(item(f"ma{i:02d}", "M&A", inst=80 + i, sig=82 + i))
    return pool


# ── 1. Budget semantics: 15 means 15 NEW CALLS ───────────────────────────────

class TestBudgetSemantics:
    def test_budget_counts_uncached_items_not_positions(self, monkeypatch):
        c = FakeClient()
        install(monkeypatch, c)
        pool = production_pool()
        # Pre-enrich the first 40 positions: under the old rule the budget was
        # entirely consumed by cache hits and zero new work happened.
        for it in pool[:40]:
            S._SUMMARY_CACHE[S._item_cache_key(it)] = ("s", "w", "Bullish")

        r = S.summarize_items(pool)
        assert r.cached == 40
        assert r.new == S.MAX_AI_ITEMS      # full budget still spent on new work
        assert sum(len(b) for b in c.calls) == S.MAX_AI_ITEMS

    def test_cached_items_consume_zero_capacity(self, monkeypatch):
        c = FakeClient()
        install(monkeypatch, c)
        pool = production_pool()
        S.summarize_items(pool)             # cycle 1 fills 15
        first = sum(len(b) for b in c.calls)
        cycle1 = set(sum(c.calls, []))
        c.calls.clear()
        r = S.summarize_items(pool)         # cycle 2 must ADVANCE, not repeat
        cycle2 = set(sum(c.calls, []))
        assert first == S.MAX_AI_ITEMS
        assert r.cached == S.MAX_AI_ITEMS
        assert r.new == S.MAX_AI_ITEMS
        assert cycle1 & cycle2 == set(), "cycle 2 re-enriched already-cached items"
        assert r.new + r.cached + r.skipped == len(pool)

    def test_selector_continues_through_the_pool_until_15_uncached(self, monkeypatch):
        c = FakeClient()
        install(monkeypatch, c)
        pool = production_pool()
        for it in pool[:60]:
            S._SUMMARY_CACHE[S._item_cache_key(it)] = ("s", "w", "Bullish")
        r = S.summarize_items(pool)
        # Only 6 uncached remain: it takes all of them and does not pad.
        assert r.new == 6
        assert r.skipped == 0

    def test_never_exceeds_the_budget(self, monkeypatch):
        c = FakeClient()
        install(monkeypatch, c)
        r = S.summarize_items(production_pool())
        assert r.new == S.MAX_AI_ITEMS
        assert sum(len(b) for b in c.calls) == S.MAX_AI_ITEMS

    def test_max_ai_items_is_unchanged_in_this_slice(self):
        assert S.MAX_AI_ITEMS == 15

    def test_cache_is_restored_for_the_WHOLE_pool_not_just_the_budget(self, monkeypatch):
        install(monkeypatch, FakeClient())
        pool = production_pool()
        deep = pool[60]                     # far past any positional window
        S._SUMMARY_CACHE[S._item_cache_key(deep)] = ("deep-s", "deep-w", "Bullish")
        S.summarize_items(pool)
        assert deep.summary == "deep-s"     # enrichment survives sliding down the feed
        assert deep.why_it_matters == "deep-w"

    def test_no_llm_call_when_everything_is_cached(self, monkeypatch):
        c = FakeClient()
        install(monkeypatch, c)
        pool = production_pool()
        for it in pool:
            S._SUMMARY_CACHE[S._item_cache_key(it)] = ("s", "w", "Bullish")
        r = S.summarize_items(pool)
        assert c.calls == []
        assert (r.new, r.cached, r.skipped) == (0, len(pool), 0)

    def test_empty_input(self, monkeypatch):
        install(monkeypatch, FakeClient())
        assert S.summarize_items([]) == S.SummarizeResult(0, 0, 0, 0, 0, {})


# ── 2. Category floors ───────────────────────────────────────────────────────

class TestCategoryFloors:
    def test_floors_are_centralized_and_configured_as_specified(self):
        assert S.CATEGORY_FLOORS == {"M&A": 4, "Company": 3, "Markets": 4, "Geopolitical": 2}

    def test_the_measured_starvation_case_is_fixed(self, monkeypatch):
        install(monkeypatch, FakeClient())
        r = S.summarize_items(production_pool())
        # Was M&A 0 of 15 (0% coverage) with 9/11 M&A items outscoring the weakest pick.
        assert r.by_category.get("M&A", 0) >= 4
        for cat, floor in S.CATEGORY_FLOORS.items():
            assert r.by_category.get(cat, 0) >= floor, f"{cat} below floor"

    def test_a_floor_is_an_opportunity_not_a_quota(self, monkeypatch):
        install(monkeypatch, FakeClient())
        # Only 1 M&A item exists: the floor must not manufacture 3 more.
        pool = [item(f"mk{i:02d}", "Markets") for i in range(30)] + [item("ma0", "M&A")]
        r = S.summarize_items(pool)
        assert r.by_category.get("M&A", 0) == 1
        assert r.new == S.MAX_AI_ITEMS

    def test_unfilled_floor_capacity_returns_to_overflow_immediately(self, monkeypatch):
        install(monkeypatch, FakeClient())
        pool = [item(f"mk{i:02d}", "Markets") for i in range(30)]   # one category only
        r = S.summarize_items(pool)
        assert r.by_category == {"Markets": S.MAX_AI_ITEMS}          # all 15, none idle

    def test_no_slot_is_left_idle_while_work_exists(self, monkeypatch):
        install(monkeypatch, FakeClient())
        pool = production_pool()
        r = S.summarize_items(pool)
        assert r.new == min(S.MAX_AI_ITEMS, len(pool))

    def test_floors_are_configurable_without_touching_selection_logic(self, monkeypatch):
        install(monkeypatch, FakeClient())
        r = S.summarize_items(production_pool(), floors={"M&A": 10})
        assert r.by_category["M&A"] == 10

    def test_uncategorized_items_still_compete_in_overflow(self, monkeypatch):
        install(monkeypatch, FakeClient())
        pool = [item(f"x{i}", "Other", inst=99, sig=99) for i in range(20)]
        r = S.summarize_items(pool)
        assert r.by_category == {"Other": S.MAX_AI_ITEMS}


# ── 3. Ranking authority: signal, not feed position ──────────────────────────

class TestRankingAuthority:
    def test_floor_selection_uses_score_not_feed_position(self, monkeypatch):
        install(monkeypatch, FakeClient())
        # Weak M&A items come FIRST in feed order; the strong ones come last.
        weak = [item(f"weak{i}", "M&A", inst=5, sig=5) for i in range(6)]
        strong = [item(f"strong{i}", "M&A", inst=95, sig=95) for i in range(4)]
        chosen = {i.title for i in S.select_for_enrichment(weak + strong, 4, {"M&A": 4})}
        assert chosen == {f"strong{i}" for i in range(4)}

    def test_the_documented_composite_is_the_authority(self):
        # institutional_score * 0.45 + signal_score * 0.55 - the feed's own quality term.
        hi = item("hi", "Markets", inst=0, sig=100)     # 55.0
        lo = item("lo", "Markets", inst=100, sig=0)     # 45.0
        assert S.enrichment_rank_key(hi) < S.enrichment_rank_key(lo)

    def test_selection_is_deterministic_for_identical_inputs(self, monkeypatch):
        install(monkeypatch, FakeClient())
        pool = production_pool()
        a = [i.title for i in S.select_for_enrichment(pool)]
        b = [i.title for i in S.select_for_enrichment(list(reversed(pool)))]
        assert a == b

    def test_ties_are_broken_stably(self):
        tied = [item(f"t{i}", "Markets", inst=50, sig=50) for i in range(10)]
        assert ([i.title for i in S.select_for_enrichment(tied, 3)]
                == [i.title for i in S.select_for_enrichment(list(reversed(tied)), 3)])

    def test_selection_reads_only_category_and_the_two_existing_scores(self):
        """Inspect the ACTUAL attribute reads, not prose, so comments cannot pass it."""
        import ast, inspect, textwrap
        reads: set[str] = set()
        for fn in (S.select_for_enrichment, S.enrichment_rank_key):
            tree = ast.parse(textwrap.dedent(inspect.getsource(fn)))
            for n in ast.walk(tree):
                if isinstance(n, ast.Attribute):
                    reads.add(n.attr)
        # No recency field may influence enrichment selection: the publication-hour
        # bucket is the feed's DISPLAY term and the direct cause of the starvation.
        reads -= {"get", "add", "append"}          # container methods, not item fields
        assert reads <= {"category", "institutional_score", "signal_score", "url", "title"}, (
            f"selector reads unexpected fields: {reads}")
        assert {"institutional_score", "signal_score"} <= reads

    def test_reordering_the_pool_by_recency_changes_nothing(self, monkeypatch):
        install(monkeypatch, FakeClient())
        pool = production_pool()
        newest_first = pool[:46] + pool[46:]          # wires first (the live shape)
        oldest_first = pool[46:] + pool[:46]          # M&A first
        assert ([i.title for i in S.select_for_enrichment(newest_first)]
                == [i.title for i in S.select_for_enrichment(oldest_first)])

    def test_no_new_editorial_classifier_exists(self):
        import inspect
        sel = inspect.getsource(S.select_for_enrichment) + inspect.getsource(S.enrichment_rank_key)
        for banned in ("importance", "editorial", "value_score", "quality_class", "is_interesting"):
            assert banned not in sel


# ── 4. Failure-cache poisoning ───────────────────────────────────────────────

class TestFailureIsRetryable:
    def test_transport_failure_is_not_cached_as_empty_enrichment(self, monkeypatch):
        class Boom:
            def chat(self, *a, **k):
                raise RuntimeError("connection reset")
        install(monkeypatch, Boom())
        pool = [item("a", "Markets")]
        r = S.summarize_items(pool)
        assert S._SUMMARY_CACHE == {}
        assert r.enriched == 0

    def test_a_failed_item_is_retried_on_the_next_refresh(self, monkeypatch):
        class Flaky:
            def __init__(self): self.n = 0
            def chat(self, messages, stream=True, temperature=0.2):
                self.n += 1
                if self.n == 1:
                    raise TimeoutError("timeout")
                return iter(["ITEM 1\nSUMMARY: s\nWHY IT MATTERS: w\nIMPACT: Bullish\n"])
        f = Flaky()
        install(monkeypatch, f)
        pool = [item("a", "Markets")]
        S.summarize_items(pool)
        assert pool[0].why_it_matters == ""          # honest empty, not fabricated
        S.summarize_items(pool)                      # retried
        assert pool[0].why_it_matters == "w"
        assert f.n == 2

    def test_malformed_payload_is_not_cached(self, monkeypatch):
        class Garbage:
            def chat(self, *a, **k):
                return iter(["<html>502 Bad Gateway</html>"])
        install(monkeypatch, Garbage())
        pool = [item("a", "Markets")]
        r = S.summarize_items(pool)
        assert S._SUMMARY_CACHE == {}
        assert r.enriched == 0

    def test_missing_ITEM_block_is_not_cached(self, monkeypatch):
        class Partial:
            """Answers only the first item of the batch."""
            def chat(self, *a, **k):
                return iter(["ITEM 1\nSUMMARY: s1\nWHY IT MATTERS: w1\nIMPACT: Bullish\n"])
        install(monkeypatch, Partial())
        pool = [item("a", "Markets"), item("b", "Markets"), item("c", "Markets")]
        r = S.summarize_items(pool)
        keys = set(S._SUMMARY_CACHE)
        assert S._item_cache_key(pool[0]) in keys        # the valid sibling IS cached
        assert S._item_cache_key(pool[1]) not in keys    # the missing ones stay retryable
        assert S._item_cache_key(pool[2]) not in keys
        assert r.enriched == 1

    def test_one_malformed_item_does_not_erase_valid_siblings(self, monkeypatch):
        class Mixed:
            def chat(self, *a, **k):
                return iter([
                    "ITEM 1\nSUMMARY: s1\nWHY IT MATTERS: w1\nIMPACT: Bullish\n"
                    "ITEM 2\ntotal garbage with no fields\n"
                    "ITEM 3\nSUMMARY: s3\nWHY IT MATTERS: w3\nIMPACT: Bearish\n"
                ])
        install(monkeypatch, Mixed())
        pool = [item("a", "Markets"), item("b", "Markets"), item("c", "Markets")]
        r = S.summarize_items(pool)
        assert (pool[0].summary, pool[0].why_it_matters) == ("s1", "w1")
        assert (pool[2].summary, pool[2].why_it_matters) == ("s3", "w3")
        assert r.enriched == 2
        assert S._item_cache_key(pool[1]) not in S._SUMMARY_CACHE

    def test_summary_without_why_it_matters_is_not_a_valid_result(self, monkeypatch):
        class Half:
            def chat(self, *a, **k):
                return iter(["ITEM 1\nSUMMARY: s1\n"])
        install(monkeypatch, Half())
        pool = [item("a", "Markets")]
        r = S.summarize_items(pool)
        assert r.enriched == 0
        assert S._SUMMARY_CACHE == {}

    def test_no_fabricated_why_it_matters_anywhere(self, monkeypatch):
        class Boom:
            def chat(self, *a, **k):
                raise RuntimeError("down")
        install(monkeypatch, Boom())
        pool = [item("a", "M&A"), item("b", "Markets")]
        S.summarize_items(pool)
        assert all(i.why_it_matters == "" and i.impact == "" for i in pool)

    def test_display_fallback_is_never_treated_as_enrichment(self, monkeypatch):
        class Boom:
            def chat(self, *a, **k):
                raise RuntimeError("down")
        install(monkeypatch, Boom())
        pool = [item("a", "Markets")]
        S.summarize_items(pool)
        assert pool[0].summary == pool[0].snippet     # readable
        assert S._SUMMARY_CACHE == {}                 # but not cached as enrichment

    def test_a_valid_result_IS_cached(self, monkeypatch):
        c = FakeClient()
        install(monkeypatch, c)
        pool = [item("a", "Markets")]
        r = S.summarize_items(pool)
        assert r.enriched == 1
        assert S._SUMMARY_CACHE[S._item_cache_key(pool[0])] == ("s-a", "w-a", "Bullish")


# ── 5. Batch size: held at 3 pending live evidence ───────────────────────────

class TestBatchSize:
    def test_batch_size_is_held_at_3(self):
        assert S._BATCH_SIZE == 3, "RC2-B1 holds the batch size; see the report"

    def test_batching_respects_the_configured_size(self, monkeypatch):
        c = FakeClient()
        install(monkeypatch, c)
        S.summarize_items(production_pool())
        assert all(len(b) <= S._BATCH_SIZE for b in c.calls)

    @pytest.mark.parametrize("size", [1, 3, 8])
    def test_parser_is_correct_at_every_candidate_batch_size(self, monkeypatch, size):
        c = FakeClient()
        install(monkeypatch, c)
        pool = [item(f"n{i:02d}", "Markets") for i in range(16)]
        r = S.summarize_items(pool, batch_size=size)
        assert r.enriched == S.MAX_AI_ITEMS
        enriched = [i for i in pool if i.why_it_matters]
        assert len(enriched) == S.MAX_AI_ITEMS
        for it in enriched:                       # every block maps to its own item
            assert it.summary == f"s-{it.title}"
            assert it.why_it_matters == f"w-{it.title}"

    def test_parser_maps_each_item_to_its_own_block_at_size_8(self, monkeypatch):
        c = FakeClient()
        install(monkeypatch, c)
        pool = [item(f"n{i:02d}", "Markets") for i in range(8)]
        S.summarize_items(pool, batch_size=8)
        for it in pool:
            assert it.summary == f"s-{it.title}"
            assert it.why_it_matters == f"w-{it.title}"

    def test_out_of_order_blocks_map_by_number_not_arrival(self, monkeypatch):
        """The ITEM number is authoritative, so ordering alone is not a size-8 risk."""
        class Shuffled:
            def chat(self, *a, **k):
                return iter([
                    "ITEM 3\nSUMMARY: s3\nWHY IT MATTERS: w3\nIMPACT: Bearish\n"
                    "ITEM 1\nSUMMARY: s1\nWHY IT MATTERS: w1\nIMPACT: Bullish\n"
                    "ITEM 2\nSUMMARY: s2\nWHY IT MATTERS: w2\nIMPACT: Neutral\n"
                ])
        install(monkeypatch, Shuffled())
        pool = [item("a", "Markets"), item("b", "Markets"), item("c", "Markets")]
        S.summarize_items(pool, batch_size=3)
        assert [i.summary for i in pool] == ["s1", "s2", "s3"]

    def test_truncated_batch_of_8_leaves_the_tail_retryable_not_poisoned(self, monkeypatch):
        """The size-8 failure mode is now WASTEFUL, never CORRUPTING."""
        class Truncated:
            def chat(self, *a, **k):
                # The model runs out of output budget after 5 of 8 blocks.
                return iter(["".join(
                    f"ITEM {i}\nSUMMARY: s{i}\nWHY IT MATTERS: w{i}\nIMPACT: Bullish\n"
                    for i in range(1, 6)
                ) + "ITEM 6\nSUMMARY: par"])
        install(monkeypatch, Truncated())
        pool = [item(f"n{i}", "Markets") for i in range(8)]
        r = S.summarize_items(pool, batch_size=8)
        assert r.enriched == 5
        for it in pool[5:]:
            assert S._item_cache_key(it) not in S._SUMMARY_CACHE   # retried next cycle
            assert it.why_it_matters == ""                         # nothing fabricated


# ── 6. Duplicate work units ──────────────────────────────────────────────────

class TestDuplicateItems:
    """Two sources republishing byte-identical title+url share ONE cache key, so
    enriching each separately spent two slots to compute the same answer twice."""

    def test_duplicates_consume_a_single_slot(self, monkeypatch):
        c = FakeClient()
        install(monkeypatch, c)
        pool = [item("same", "Markets", url="https://x/same") for _ in range(5)]
        r = S.summarize_items(pool)
        assert sum(len(b) for b in c.calls) == 1     # one call, not five
        assert r.new == 1

    def test_every_duplicate_still_receives_the_enrichment(self, monkeypatch):
        install(monkeypatch, FakeClient())
        pool = [item("same", "Markets", url="https://x/same") for _ in range(3)]
        S.summarize_items(pool)
        for it in pool:
            assert it.summary == "s-same" and it.why_it_matters == "w-same"

    def test_freed_capacity_goes_to_real_work(self, monkeypatch):
        c = FakeClient()
        install(monkeypatch, c)
        dupes = [item("same", "Markets", url="https://x/same") for _ in range(5)]
        rest = [item(f"n{i:02d}", "Markets") for i in range(20)]
        r = S.summarize_items(dupes + rest)
        assert r.new == S.MAX_AI_ITEMS
        # 15 distinct work units, so 15 distinct headlines were actually sent.
        assert len(set(sum(c.calls, []))) == S.MAX_AI_ITEMS

    def test_a_failed_duplicate_group_stays_retryable_as_a_group(self, monkeypatch):
        class Boom:
            def chat(self, *a, **k):
                raise RuntimeError("down")
        install(monkeypatch, Boom())
        pool = [item("same", "Markets", url="https://x/same") for _ in range(3)]
        S.summarize_items(pool)
        assert S._SUMMARY_CACHE == {}
        assert all(i.why_it_matters == "" for i in pool)
