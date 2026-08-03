"""
app/storage.py — the ONE resolver for where Argus's durable state lives
(PH1, docs/ARGUS_PRODUCTION_READINESS_AUDIT_V1.md C5).

Every durable artifact — the identity journal, the event-registry snapshot,
theme memory, the feed-cache pickles, the conversations/memory db — must sit
under a single directory that can be backed by a Railway persistent volume.
Before this module, each subsystem independently computed
`Path(__file__).parent.parent / "data"`, which on Railway's ephemeral
container filesystem is wiped on every deploy/restart/rollback — silently
destroying the "permanent" record Sprints 3-4 were built to keep.

Resolution order for the data root:
  1. ARGUS_DATA_DIR              — explicit, recommended (point at the volume)
  2. RAILWAY_VOLUME_MOUNT_PATH   — Railway sets this when a volume is attached
  3. <repo>/data                 — local dev / EPHEMERAL fallback

`is_persistent()` is True only for cases 1-2. Production startup asserts it
(PH5) and refuses to serve on ephemeral storage, so we never silently pretend
the journal is durable when it isn't.

Dependency-free by design (stdlib only) so config.py and every durable module
can import it without a cycle.
"""

from __future__ import annotations

import os
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
_REPO_DATA = _REPO_ROOT / "data"


def _resolve() -> tuple[Path, str]:
    """Return (data_dir, source) where source ∈ {env, volume, repo}."""
    explicit = os.getenv("ARGUS_DATA_DIR")
    if explicit:
        return Path(explicit).expanduser().resolve(), "env"
    volume = os.getenv("RAILWAY_VOLUME_MOUNT_PATH")
    if volume:
        return Path(volume).expanduser().resolve(), "volume"
    return _REPO_DATA, "repo"


DATA_DIR, DATA_DIR_SOURCE = _resolve()

# Canonical durable sub-paths — the single source of truth every subsystem
# imports instead of recomputing its own.
LEDGER_DIR       = DATA_DIR / "ledger"
FEED_CACHE_DIR   = DATA_DIR / "feed_cache"
THEME_MEMORY_DIR = DATA_DIR / "theme_memory"
EVALUATION_DIR    = DATA_DIR / "materiality_evaluation"
REGISTRY_PATH    = DATA_DIR / "event_registry.json"
CONVERSATIONS_DIR = DATA_DIR / "conversations"
MEMORY_DB_PATH   = DATA_DIR / "memory.db"


def is_persistent() -> bool:
    """True when the data dir is a volume/explicit mount, not the ephemeral
    repo fallback. This is a configuration fact, not a write test."""
    return DATA_DIR_SOURCE in ("env", "volume")


def is_writable() -> bool:
    """Actually prove the data dir accepts a write (creates it if needed)."""
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        probe = DATA_DIR / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        return True
    except Exception:
        return False


def persistence_status() -> dict:
    """Structured status for startup logging and the readiness check (PH5)."""
    return {
        "data_dir": str(DATA_DIR),
        "source": DATA_DIR_SOURCE,          # env | volume | repo
        "persistent": is_persistent(),
        "writable": is_writable(),
        "railway_volume": os.getenv("RAILWAY_VOLUME_MOUNT_PATH") or None,
    }
