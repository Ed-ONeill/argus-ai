"""
app/institutional_memory — Canonical backend persistence for Argus
institutional memory (M3.1).

Layered beneath ThemeMemory (the rolling intraday working memory on the
Railway volume): every cycle's canonical theme state is snapshotted into
Supabase/Postgres, the permanent market-global archive. The browser never
writes institutional memory; the FastAPI service role is the only writer.

Public interface:
  record_cycle(themes)           — called by the background pipeline
  memory_config_status()         — (enabled, reason), never leaks secrets
  log_startup_status()           — one startup log line
  bootstrap_from_theme_memory()  — explicit one-time baseline import

Design: docs/ARGUS_INSTITUTIONAL_MEMORY_V2.md
Operations: docs/ARGUS_MEMORY_OPERATIONS_V1.md
"""

from __future__ import annotations

import logging

from app.institutional_memory.bootstrap import bootstrap_from_theme_memory
from app.institutional_memory.writer import (
    build_repository,
    institutional_memory_writer,
    memory_config_status,
    record_cycle,
)

log = logging.getLogger(__name__)

__all__ = [
    "record_cycle",
    "memory_config_status",
    "log_startup_status",
    "bootstrap_from_theme_memory",
    "build_repository",
    "institutional_memory_writer",
]


def log_startup_status() -> None:
    """Log enabled/disabled and why. No secret values are ever printed."""
    enabled, reason = memory_config_status()
    if enabled:
        log.info("[institutional-memory] enabled=true writer=%s",
                 institutional_memory_writer.__class__.__name__)
    else:
        log.info("[institutional-memory] enabled=false reason=%s", reason)
