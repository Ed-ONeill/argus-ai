"""Isolated retained-data recovery and cached-API load exercise.

Never contacts production, runs ingestion, modifies source data, or establishes
production capacity/RPO/RTO. The JSON report states these limits explicitly.
"""
import asyncio
from contextlib import closing
import hashlib
import json
import logging
import os
from pathlib import Path
import pickle
import shutil
import sqlite3
import statistics
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    logging.disable(logging.CRITICAL)
    with tempfile.TemporaryDirectory(prefix="argus-recovery-capacity-") as temp:
        sandbox = Path(temp)
        os.environ["ARGUS_DATA_DIR"] = str(sandbox / "runtime")
        from app.event_identity import IdentityAuthority
        from app.observation_ledger import LedgerStream
        from app.auth import require_user
        from api.main import app
        from api.routes import feed as route
        import httpx

        started = time.perf_counter()
        source = ROOT / "data"
        restored = sandbox / "restored"
        (restored / "ledger").mkdir(parents=True)
        originals = [source / "event_registry.json", *sorted((source / "ledger").glob("identity-*.jsonl"))]
        hashes = {str(p.relative_to(source)): digest(p) for p in originals}
        for path in originals:
            shutil.copy2(path, restored / path.relative_to(source))
        # SQLite's backup API produces a transactionally consistent local copy.
        with closing(sqlite3.connect((source / "memory.db").as_uri() + "?mode=ro", uri=True)) as src:
            with closing(sqlite3.connect(restored / "memory.db")) as dst:
                src.backup(dst)
                assert dst.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        authority = IdentityAuthority(LedgerStream("identity", restored / "ledger"), restored / "event_registry.json")
        expected = {e["uid"] for e in json.loads((source / "event_registry.json").read_text(encoding="utf-8"))["entries"]}
        assert set(authority.entries) == expected
        # Lose only the disposable copy's snapshot, then recover solely from its journal.
        (restored / "event_registry.json").rename(restored / "snapshot-unavailable.json")
        replayed = IdentityAuthority(LedgerStream("identity", restored / "ledger"), restored / "event_registry.json")
        assert set(replayed.entries) == expected
        assert {k: v.to_dict() for k, v in replayed.entries.items()} == {k: v.to_dict() for k, v in authority.entries.items()}
        assert hashes == {str(p.relative_to(source)): digest(p) for p in originals}
        recovery = {"seconds": round(time.perf_counter() - started, 3),
                    "identity_entries": len(expected), "source_hashes_unchanged": True,
                    "sqlite_integrity": "ok", "journal_only_identity_recovery": "passed"}

        manifest = json.loads((ROOT / "docs/diagnostics/rc3-tm1b/sources.json").read_text(encoding="utf-8-sig"))
        record = next(s for s in manifest if s.get("corpus") == "retained-0f875b7be67b")
        path = Path(record["path"])
        assert digest(path) == record["sha256"]
        snapshot = pickle.loads(path.read_bytes())  # trusted hash-pinned local fixture
        route.feed_cache.get = lambda key: snapshot
        route.feed_cache.age_seconds = lambda key: 60
        def forbid_pipeline(*args, **kwargs):
            raise AssertionError("Load exercise must never run ingestion")
        route._run_inline = forbid_pipeline
        app.dependency_overrides[require_user] = lambda: {"sub": "local-load-fixture"}

        async def exercise(concurrency):
            sem = asyncio.Semaphore(concurrency)
            durations, sizes = [], []
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://local-test") as client:
                async def request():
                    async with sem:
                        start = time.perf_counter()
                        response = await client.get("/api/feed/")
                        assert response.status_code == 200
                        assert response.json()["generated_at"] == snapshot.generated_at.isoformat()
                        durations.append((time.perf_counter() - start) * 1000)
                        sizes.append(len(response.content))
                begin = time.perf_counter()
                await asyncio.gather(*(request() for _ in range(60)))
                elapsed = time.perf_counter() - begin
            ordered = sorted(durations)
            return {"concurrency": concurrency, "requests": len(ordered), "errors": 0,
                    "p50_ms": round(statistics.median(ordered), 1), "p95_ms": round(ordered[int(len(ordered)*.95)-1], 1),
                    "requests_per_second": round(len(ordered)/elapsed, 1), "response_bytes": max(sizes)}
        capacity = [asyncio.run(exercise(n)) for n in (1, 5, 20)]
        print(json.dumps({"recovery": recovery, "cached_api_capacity": capacity,
              "limits": "Local retained data, in-process ASGI, injected user. Excludes production hardware/network, JWT verification, ingestion, browser rendering, Supabase recovery and cloud backup restore. Not a production capacity or disaster-recovery closure."}, indent=2))


if __name__ == "__main__":
    main()
