"""
tests/test_observation_ledger.py — OP3.1a (Sprint 3): the ledger substrate.

Laws under test: deterministic sequencing, row immutability, schema-v1 round
trip, additive-field tolerance, corrupt/torn-line handling, injected-clock
daily streams, and retention that compresses but never deletes.
"""

from __future__ import annotations

import gzip
import json
from datetime import datetime, timedelta, timezone

from app.feeds import FeedItem, MergedSource
from app.observation_ledger import LedgerStream, ObservationLedger, content_hash

T0 = datetime(2026, 7, 21, 12, 0, tzinfo=timezone.utc)


def _read_lines(path):
    return [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln]


# ── sequencing ─────────────────────────────────────────────────────────────────

def test_deterministic_per_cycle_sequence_numbering(tmp_path):
    s = LedgerStream("observations", tmp_path)
    assert s.append("observation", {"url": "u1"}, ts=T0, cycle_id="c1") == ("2026-07-21", 1)
    assert s.append("observation", {"url": "u2"}, ts=T0, cycle_id="c1") == ("2026-07-21", 2)

    # a fresh writer (new process) recovers the counter by scanning
    s2 = LedgerStream("observations", tmp_path)
    assert s2.append("observation", {"url": "u3"}, ts=T0, cycle_id="c2") == ("2026-07-21", 3)


def test_daily_stream_selection_uses_injected_clock(tmp_path):
    s = LedgerStream("observations", tmp_path)
    s.append("observation", {"url": "a"}, ts=T0, cycle_id="c1")
    s.append("observation", {"url": "b"}, ts=T0 + timedelta(days=1), cycle_id="c2")
    assert (tmp_path / "observations-2026-07-21.jsonl").exists()
    assert (tmp_path / "observations-2026-07-22.jsonl").exists()
    # per-day sequences are independent
    assert [r["seq"] for _, r in s.read_rows("2026-07-22")] == [1]


# ── immutability & round trip ──────────────────────────────────────────────────

def test_existing_rows_unchanged_after_later_cycles(tmp_path):
    s = LedgerStream("observations", tmp_path)
    s.append("observation", {"url": "u1", "title": "first"}, ts=T0, cycle_id="c1")
    before = _read_lines(tmp_path / "observations-2026-07-21.jsonl")

    s.append("observation", {"url": "u2", "title": "second"}, ts=T0 + timedelta(minutes=5), cycle_id="c2")
    after = _read_lines(tmp_path / "observations-2026-07-21.jsonl")

    assert after[: len(before)] == before          # earlier lines byte-identical
    assert len(after) == len(before) + 1


def test_schema_v1_round_trip(tmp_path):
    s = LedgerStream("observations", tmp_path)
    rec = {"url": "https://t/x", "source": "Bloomberg Markets", "tier": 1,
           "title": "T", "snippet": "S", "published_dt": T0.isoformat(),
           "fetched_at": T0.isoformat(), "first_seen_dt": None,
           "content_hash": content_hash("T", "S"),
           "provenance": {"merged_from": []},
           "disposition": "admitted", "supersedes": None}
    s.append("observation", rec, ts=T0, cycle_id="cycle-1")

    rows = [r for _, r in s.read_rows()]
    assert len(rows) == 1
    row = rows[0]
    assert row["v"] == 1 and row["kind"] == "observation"
    assert row["cycle_id"] == "cycle-1" and row["seq"] == 1
    for k, v in rec.items():
        assert row[k] == v


def test_unknown_additive_fields_tolerated(tmp_path):
    s = LedgerStream("observations", tmp_path)
    path = tmp_path / "observations-2026-07-21.jsonl"
    path.write_text(json.dumps({"v": 9, "kind": "observation", "seq": 1,
                                "url": "u", "future_field": {"x": 1}}) + "\n",
                    encoding="utf-8")
    rows = [r for _, r in s.read_rows()]
    assert rows[0]["future_field"] == {"x": 1}      # rides through untouched


# ── corruption handling ────────────────────────────────────────────────────────

def test_torn_final_line_skipped_with_warning(tmp_path, caplog):
    s = LedgerStream("observations", tmp_path)
    s.append("observation", {"url": "u1"}, ts=T0, cycle_id="c1")
    path = tmp_path / "observations-2026-07-21.jsonl"
    with open(path, "a", encoding="utf-8") as fh:
        fh.write('{"v": 1, "kind": "obser')            # crash mid-append

    with caplog.at_level("WARNING"):
        rows = [r for _, r in s.read_rows()]
    assert [r["url"] for r in rows] == ["u1"]
    assert any("torn tail" in m for m in caplog.messages)

    # the torn line never claimed a seq — the next append is deterministic
    s2 = LedgerStream("observations", tmp_path)
    assert s2.append("observation", {"url": "u2"}, ts=T0, cycle_id="c2") == ("2026-07-21", 2)


def test_corrupt_non_tail_line_skipped_with_warning(tmp_path, caplog):
    path = tmp_path / "observations-2026-07-21.jsonl"
    good1 = json.dumps({"v": 1, "kind": "observation", "seq": 1, "url": "u1"})
    good2 = json.dumps({"v": 1, "kind": "observation", "seq": 2, "url": "u2"})
    path.write_text(good1 + "\n" + "NOT JSON AT ALL\n" + good2 + "\n", encoding="utf-8")

    s = LedgerStream("observations", tmp_path)
    with caplog.at_level("WARNING"):
        rows = [r for _, r in s.read_rows()]
    assert [r["url"] for r in rows] == ["u1", "u2"]
    assert any("corrupt line" in m for m in caplog.messages)


# ── retention [C5] ─────────────────────────────────────────────────────────────

def test_retention_compresses_and_never_deletes(tmp_path):
    s = LedgerStream("observations", tmp_path)
    old_day = T0 - timedelta(days=10)
    s.append("observation", {"url": "old"}, ts=old_day, cycle_id="c0")
    s.append("observation", {"url": "new"}, ts=T0, cycle_id="c1")

    n = s.compress_old(now=T0, days=7)
    assert n == 1
    old_name = f"observations-{old_day.strftime('%Y-%m-%d')}"
    assert not (tmp_path / f"{old_name}.jsonl").exists()
    assert (tmp_path / f"{old_name}.jsonl.gz").exists()     # history preserved, compressed

    # compressed history remains fully readable through the same reader
    urls = [r["url"] for _, r in s.read_rows()]
    assert urls == ["old", "new"]

    # a second pass is a no-op — nothing is ever deleted
    assert s.compress_old(now=T0, days=7) == 0
    with gzip.open(tmp_path / f"{old_name}.jsonl.gz", "rt", encoding="utf-8") as fh:
        assert json.loads(fh.read().strip())["url"] == "old"


# ── observation recording (admitted + folded) ──────────────────────────────────

def _item(url: str, source: str = "Bloomberg Markets", merged: list | None = None) -> FeedItem:
    return FeedItem(
        title=f"Story at {url}", url=url, source=source, category="Markets",
        published_dt=T0 - timedelta(hours=1), snippet="snippet",
        fetched_at=T0, merged_sources=merged or [],
    )


def test_record_observations_writes_admitted_and_folded_once(tmp_path):
    led = ObservationLedger(tmp_path)
    merged = [MergedSource(source="Financial Times", title="FT telling",
                           url="https://t/ft", published_dt=T0 - timedelta(hours=2),
                           snippet="ft snip", tier=1)]
    items = [_item("https://t/bb", merged=merged), _item("https://t/solo")]

    n = led.record_observations(items, now=T0, cycle_id="c1")
    assert n == 3                                   # 2 admitted + 1 folded

    rows = [r for _, r in led.observations.read_rows()]
    by_url = {r["url"]: r for r in rows}
    assert by_url["https://t/bb"]["disposition"] == "admitted"
    assert by_url["https://t/bb"]["provenance"]["merged_from"] == ["https://t/ft"]
    assert by_url["https://t/ft"]["disposition"] == "folded"
    assert by_url["https://t/ft"]["provenance"]["folded_into"] == "https://t/bb"
    assert all(r["supersedes"] is None for r in rows)

    # same cycle content re-observed → no duplicate rows
    assert led.record_observations(items, now=T0 + timedelta(minutes=5), cycle_id="c2") == 0

    # a fresh process seeds its seen-set from disk — still no duplicates
    led2 = ObservationLedger(tmp_path)
    assert led2.record_observations(items, now=T0 + timedelta(minutes=10), cycle_id="c3") == 0


# ── Sprint 3.1 Finding 1: replay-safe compression ─────────────────────────────

def _gzip_twin(path):
    """Simulate a crash between atomic gz-rename and jsonl unlink."""
    gz = path.with_suffix(path.suffix + ".gz")
    with open(path, "rb") as src, gzip.open(gz, "wb") as dst:
        dst.write(src.read())
    return gz


def test_crash_twin_files_never_duplicate_rows(tmp_path):
    s = LedgerStream("observations", tmp_path)
    old = T0 - timedelta(days=10)
    day = old.strftime("%Y-%m-%d")
    s.append("observation", {"url": "u1"}, ts=old, cycle_id="c1")
    s.append("observation", {"url": "u2"}, ts=old, cycle_id="c1")
    _gzip_twin(tmp_path / f"observations-{day}.jsonl")   # both twins now exist

    rows = [r for _, r in s.read_rows()]
    assert [r["url"] for r in rows] == ["u1", "u2"]      # seq-deduped, not doubled
    assert [r["seq"] for r in rows] == [1, 2]

    # the next compression pass completes the interrupted unlink
    assert s.compress_old(now=T0, days=7) == 1
    assert not (tmp_path / f"observations-{day}.jsonl").exists()
    assert (tmp_path / f"observations-{day}.jsonl.gz").exists()
    assert [r["url"] for _, r in s.read_rows()] == ["u1", "u2"]


def test_append_after_compression_is_merged_and_never_destroyed(tmp_path):
    s = LedgerStream("observations", tmp_path)
    old = T0 - timedelta(days=10)
    day = old.strftime("%Y-%m-%d")
    s.append("observation", {"url": "u1"}, ts=old, cycle_id="c1")
    assert s.compress_old(now=T0, days=7) == 1           # day is now .gz only

    # a late append to the compressed day continues the sequence in a new .jsonl
    s2 = LedgerStream("observations", tmp_path)          # fresh process
    assert s2.append("observation", {"url": "u2"}, ts=old, cycle_id="c2") == (day, 2)

    rows = [r for _, r in s2.read_rows()]
    assert [(r["seq"], r["url"]) for r in rows] == [(1, "u1"), (2, "u2")]

    # recovery must NOT unlink a .jsonl holding rows the .gz lacks
    assert s2.compress_old(now=T0, days=7) == 0
    assert (tmp_path / f"observations-{day}.jsonl").exists()
    assert [(r["seq"], r["url"]) for _, r in s2.read_rows()] == [(1, "u1"), (2, "u2")]


def test_compression_is_atomic_no_tmp_left_behind(tmp_path):
    s = LedgerStream("observations", tmp_path)
    old = T0 - timedelta(days=10)
    s.append("observation", {"url": "u1"}, ts=old, cycle_id="c1")
    s.compress_old(now=T0, days=7)
    assert not list(tmp_path.glob("*.tmp"))


# ── Sprint 3.1 Finding 2: one stream, one writer ──────────────────────────────

def test_shared_stream_returns_one_instance_per_directory_and_name(tmp_path):
    from app.observation_ledger import shared_stream
    a = shared_stream("identity", tmp_path)
    b = shared_stream("identity", tmp_path)
    c = shared_stream("observations", tmp_path)
    d = shared_stream("identity", tmp_path / "other")
    assert a is b
    assert a is not c and a is not d


def test_observation_ledger_uses_the_shared_streams(tmp_path):
    from app.observation_ledger import shared_stream
    led = ObservationLedger(tmp_path)
    assert led.identity is shared_stream("identity", tmp_path)
    assert led.observations is shared_stream("observations", tmp_path)
    # two ledgers over one directory share one seq cache — no duplicate seqs
    led2 = ObservationLedger(tmp_path)
    assert led2.identity is led.identity
