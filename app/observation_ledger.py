"""
app/observation_ledger.py — OP3.1a: the append-only ledger substrate
(ARGUS_OBSERVATION_PIPELINE_AUDIT_V1 I19/I2; OP1_IMPLEMENTATION_PLAN §OP3.1 as
amended per OP2_SPRINT3_DESIGN_REVIEW C4/C5).

Three daily JSONL streams under data/ledger/ — `observations-` (immutable
facts), `identity-` (the OP2.1 identity journal), and, in later sprints,
`assessments-`. Every row carries {v, kind, ts, cycle_id, seq} and is
addressable as "<date>#<seq>".

Laws:
  - Rows are IMMUTABLE. Nothing in this module (or anywhere) edits a written
    line; corrections APPEND with `supersedes`.
  - The journal is PERMANENT [C5]. Rotation compresses (gzip) and can move
    files to a cold tier; deletion does not exist here.
  - Writes are best-effort: a ledger failure logs a WARNING and never breaks
    the pipeline.
  - Readers tolerate a torn final line (crash mid-append) and skip malformed
    lines with a warning — worst case loses one cycle's records, never
    history.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import logging
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

log = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
LEDGER_DIR = BASE_DIR / "data" / "ledger"

SCHEMA_VERSION = 1
_MAX_ROWS_PER_CYCLE = 2_000     # runaway-loop guard; never a history limit
_COMPRESS_AFTER_DAYS = 7


def _day(ts: datetime) -> str:
    return ts.strftime("%Y-%m-%d")


def content_hash(title: str, snippet: str = "") -> str:
    """Stable hash of the observed text — correction detection, not identity."""
    h = hashlib.sha256(f"{title}\n{snippet}".encode("utf-8", errors="ignore"))
    return h.hexdigest()[:16]


class LedgerStream:
    """One append-only daily-file JSONL stream (e.g. observations, identity)."""

    def __init__(self, name: str, directory: Path = LEDGER_DIR) -> None:
        self.name = name
        self._dir = directory
        self._lock = threading.RLock()
        self._seq: dict[str, int] = {}     # day -> last assigned seq

    # ── paths ────────────────────────────────────────────────────────────────

    def _path(self, day: str) -> Path:
        return self._dir / f"{self.name}-{day}.jsonl"

    def _files(self) -> list[Path]:
        """All files of this stream (hot .jsonl + compressed .jsonl.gz +
        cold-tier copies), sorted by day."""
        if not self._dir.exists():
            return []
        out: list[Path] = []
        for pattern in (f"{self.name}-*.jsonl", f"{self.name}-*.jsonl.gz"):
            out.extend(self._dir.glob(pattern))
            out.extend((self._dir / "cold").glob(pattern) if (self._dir / "cold").exists() else [])
        return sorted(out, key=lambda p: p.name)

    @staticmethod
    def _file_day(path: Path) -> str:
        stem = path.name
        for suffix in (".jsonl.gz", ".jsonl"):
            if stem.endswith(suffix):
                stem = stem[: -len(suffix)]
                break
        return stem.rsplit("-", 3)[-3] + "-" + stem.rsplit("-", 2)[-2] + "-" + stem.rsplit("-", 1)[-1]

    # ── append ───────────────────────────────────────────────────────────────

    def _last_seq(self, day: str) -> int:
        """Recover the last VALID row's seq for a day by scanning its file —
        deterministic across restarts; a torn tail line never claimed a seq."""
        last = 0
        for row in self._read_file(self._path(day)):
            try:
                last = max(last, int(row.get("seq", 0)))
            except Exception:
                continue
        return last

    def append(self, kind: str, record: dict[str, Any], *, ts: datetime,
               cycle_id: str) -> tuple[str, int] | None:
        """Append one row. Returns (day, seq) or None on failure (best-effort:
        never raises)."""
        try:
            with self._lock:
                day = _day(ts)
                if day not in self._seq:
                    self._seq[day] = self._last_seq(day)
                seq = self._seq[day] + 1
                row = {"v": SCHEMA_VERSION, "kind": kind, "ts": ts.isoformat(),
                       "cycle_id": cycle_id, "seq": seq, **record}
                self._dir.mkdir(parents=True, exist_ok=True)
                with open(self._path(day), "a", encoding="utf-8") as fh:
                    fh.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
                self._seq[day] = seq
                return (day, seq)
        except Exception as exc:
            log.warning("[ledger:%s] append failed (%s) — pipeline continues", self.name, exc)
            return None

    # ── read ─────────────────────────────────────────────────────────────────

    def _read_file(self, path: Path) -> Iterator[dict]:
        if not path.exists():
            gz = path.with_suffix(path.suffix + ".gz")
            if gz.exists():
                path = gz
            else:
                return
        opener = gzip.open if path.name.endswith(".gz") else open
        try:
            with opener(path, "rt", encoding="utf-8") as fh:  # type: ignore[operator]
                lines = fh.readlines()
        except Exception as exc:
            log.warning("[ledger:%s] unreadable file %s (%s)", self.name, path.name, exc)
            return
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                if not isinstance(row, dict):
                    raise ValueError("row is not an object")
                yield row
            except Exception:
                if i == len(lines) - 1:
                    log.warning("[ledger:%s] torn tail line skipped in %s "
                                "(crash mid-append; at most one cycle lost)",
                                self.name, path.name)
                else:
                    log.warning("[ledger:%s] corrupt line %d skipped in %s",
                                self.name, i + 1, path.name)

    def read_rows(self, day: str | None = None) -> Iterator[tuple[str, dict]]:
        """Yield (day, row) across all files (or one day), oldest first.
        Unknown/extra fields ride through untouched — readers must tolerate
        additive schema growth."""
        if day is not None:
            for row in self._read_file(self._path(day)):
                yield (day, row)
            return
        for path in self._files():
            d = self._file_day(path)
            for row in self._read_file(path):
                yield (d, row)

    # ── retention [C5]: compress, never delete ───────────────────────────────

    def compress_old(self, *, now: datetime, days: int = _COMPRESS_AFTER_DAYS) -> int:
        """Gzip hot files older than `days`. The original is replaced by its
        compressed twin — content is preserved byte-for-byte; nothing is ever
        deleted from history."""
        n = 0
        cutoff = _day(now - timedelta(days=days))
        try:
            for path in list(self._dir.glob(f"{self.name}-*.jsonl")):
                if self._file_day(path) >= cutoff:
                    continue
                gz = path.with_suffix(path.suffix + ".gz")
                if gz.exists():
                    continue
                with open(path, "rb") as src, gzip.open(gz, "wb") as dst:
                    dst.write(src.read())
                path.unlink()          # the .gz twin now carries the history
                n += 1
        except Exception as exc:
            log.warning("[ledger:%s] compression pass failed (%s)", self.name, exc)
        return n


class ObservationLedger:
    """The substrate: observation + identity streams under one directory."""

    def __init__(self, directory: Path = LEDGER_DIR) -> None:
        self._dir = directory
        self.observations = LedgerStream("observations", directory)
        self.identity = LedgerStream("identity", directory)
        self._seen_urls: set[str] | None = None   # lazy-seeded from today's rows

    # ── observation stream (OP3.1a: admitted + folded dispositions) ──────────

    def _seed_seen(self, day: str) -> set[str]:
        if self._seen_urls is None:
            seen: set[str] = set()
            for _, row in self.observations.read_rows(day):
                u = row.get("url")
                if u:
                    seen.add(u)
            self._seen_urls = seen
        return self._seen_urls

    def record_observations(self, items: list, *, now: datetime, cycle_id: str) -> int:
        """Append immutable observation rows for newly seen items this cycle:
        one `admitted` row per surviving item, one `folded` row per merged
        provenance row. Never raises; returns rows written."""
        try:
            from app.feeds import _source_tier
            seen = self._seed_seen(_day(now))
            written = 0
            for item in items or []:
                if written >= _MAX_ROWS_PER_CYCLE:
                    log.warning("[ledger] per-cycle row cap reached — %d rows dropped this cycle",
                                len(items) - written)
                    break
                rows: list[tuple[str, dict]] = []
                if item.url and item.url not in seen:
                    rows.append(("observation", {
                        "url": item.url,
                        "source": item.source,
                        "tier": _source_tier(item.source),
                        "title": item.title,
                        "snippet": item.snippet,
                        "published_dt": item.published_dt.isoformat() if item.published_dt else None,
                        "fetched_at": item.fetched_at.isoformat() if getattr(item, "fetched_at", None) else None,
                        "first_seen_dt": item.first_seen_dt.isoformat() if getattr(item, "first_seen_dt", None) else None,
                        "content_hash": content_hash(item.title, item.snippet),
                        "provenance": {"merged_from": [m.url for m in getattr(item, "merged_sources", []) or []]},
                        "disposition": "admitted",
                        "supersedes": None,
                    }))
                for m in getattr(item, "merged_sources", None) or []:
                    if m.url and m.url not in seen:
                        rows.append(("observation", {
                            "url": m.url,
                            "source": m.source,
                            "tier": m.tier,
                            "title": m.title,
                            "snippet": m.snippet,
                            "published_dt": m.published_dt.isoformat() if m.published_dt else None,
                            "fetched_at": None,
                            "first_seen_dt": None,
                            "content_hash": content_hash(m.title, m.snippet),
                            "provenance": {"folded_into": item.url},
                            "disposition": "folded",
                            "supersedes": None,
                        }))
                for kind, rec in rows:
                    if self.observations.append(kind, rec, ts=now, cycle_id=cycle_id):
                        seen.add(rec["url"])
                        written += 1
            return written
        except Exception as exc:
            log.warning("[ledger] observation recording failed (%s) — pipeline continues", exc)
            return 0

    def compress_old(self, *, now: datetime | None = None) -> None:
        now = now or datetime.now(timezone.utc)
        self.observations.compress_old(now=now)
        self.identity.compress_old(now=now)


# Module-level singleton — the background pipeline's substrate
observation_ledger = ObservationLedger()
