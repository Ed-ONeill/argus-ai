"""
scripts/bootstrap_institutional_memory.py — Explicit one-time baseline import.

Reads the current ThemeMemory state and writes one honest baseline snapshot
per known theme into Supabase (provenance.source = "theme_memory_bootstrap").
Idempotent and safe to rerun: themes that already have a bootstrap baseline
are skipped. See docs/ARGUS_MEMORY_OPERATIONS_V1.md.

Usage:
    python scripts/bootstrap_institutional_memory.py --dry-run   # inspect first
    python scripts/bootstrap_institutional_memory.py             # write baseline

Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
INSTITUTIONAL_MEMORY_ENABLED=true in the environment (or .env). When run
against production data, THEME_MEMORY_DIR must point at the real store.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="show what would be written without touching Supabase")
    args = parser.parse_args()

    from app.institutional_memory import bootstrap_from_theme_memory, memory_config_status
    from app.institutional_memory.repository import RepositoryError

    enabled, reason = memory_config_status()
    print(f"institutional memory: {'enabled' if enabled else f'DISABLED ({reason})'}")

    try:
        result = bootstrap_from_theme_memory(dry_run=args.dry_run)
    except RepositoryError as exc:
        print(f"BOOTSTRAP FAILED: {exc}")
        return 1

    print(f"run_key   : {result.run_key}")
    print(f"status    : {result.status}")
    print(f"themes    : {result.themes_seen}")
    print(f"inserted  : {result.snapshots_inserted}")
    print(f"skipped   : {result.snapshots_unchanged} (baseline already present)")
    if result.errors:
        print(f"errors    : {result.errors}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
