"""
api/main.py — FastAPI backend for Argus AI

Wraps the existing Python feed + summarizer engine and exposes REST endpoints
consumed by the Next.js frontend.  All heavy logic stays in app/.

Run:
    uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Make the project root importable regardless of how uvicorn is invoked
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import feed, saved, analyze, listen, briefings
from app.background import refresher

# Configure logging at the entrypoint so startup logs (persistence probe, router
# registration) are visible on Railway. Without this, nothing configures the root
# logger until app.inference is first imported, and INFO records emitted before
# that are silently dropped. basicConfig is a no-op if a handler already exists.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

log = logging.getLogger(__name__)


def _theme_memory_persistence_probe() -> None:
    """Log whether the theme-memory store sits on persistent storage.

    Persistence cannot be proven from repo code: Railway volumes are attached in
    the dashboard, not in railway.toml, and THEME_MEMORY_DIR is a service
    variable. So we log the resolved path, existence, writability, and a marker
    file stamped with the deployment id. If a later deployment finds a marker
    written by a DIFFERENT deployment id, the directory survived a redeploy and
    is therefore persistent; a marker that is always fresh means ephemeral
    container filesystem.
    """
    import json
    from datetime import datetime, timezone

    try:
        from app.theme_memory import _STORE_DIR as store_dir
    except Exception as exc:  # pragma: no cover - import failure is itself the finding
        log.error("[persistence-probe] cannot import theme_memory store dir: %r", exc)
        return

    env_dir = os.getenv("THEME_MEMORY_DIR")
    volume_path = os.getenv("RAILWAY_VOLUME_MOUNT_PATH")
    volume_name = os.getenv("RAILWAY_VOLUME_NAME")
    deploy_id = os.getenv("RAILWAY_DEPLOYMENT_ID") or "local"

    log.info("[persistence-probe] THEME_MEMORY_DIR env = %r", env_dir)
    log.info("[persistence-probe] resolved store dir   = %s", store_dir)
    log.info(
        "[persistence-probe] Railway volume        = %s",
        f"{volume_name or '?'} mounted at {volume_path}" if volume_path else "NONE DETECTED",
    )
    if volume_path and env_dir and not str(Path(env_dir)).startswith(str(Path(volume_path))):
        log.warning(
            "[persistence-probe] THEME_MEMORY_DIR is OUTSIDE the mounted volume - store is ephemeral"
        )

    exists = store_dir.is_dir()
    log.info("[persistence-probe] directory exists      = %s", exists)

    writable = False
    try:
        store_dir.mkdir(parents=True, exist_ok=True)
        probe = store_dir / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        writable = True
    except Exception as exc:
        log.error("[persistence-probe] directory NOT writable: %r", exc)
    log.info("[persistence-probe] directory writable    = %s", writable)

    marker = store_dir / ".persistence_marker.json"
    if marker.is_file():
        try:
            prev = json.loads(marker.read_text(encoding="utf-8"))
        except Exception:
            prev = {}
        prev_deploy = prev.get("deployment_id", "?")
        if prev_deploy not in (deploy_id, "?"):
            log.info(
                "[persistence-probe] marker SURVIVED redeploy: written %s by deployment %s "
                "(current %s) -> storage IS PERSISTENT",
                prev.get("written_at", "?"), prev_deploy, deploy_id,
            )
        else:
            log.info(
                "[persistence-probe] marker present, written %s by this same deployment (%s) - "
                "redeploy once more and check this line to confirm survival",
                prev.get("written_at", "?"), deploy_id,
            )
    elif writable:
        marker.write_text(
            json.dumps({
                "written_at": datetime.now(timezone.utc).isoformat(),
                "deployment_id": deploy_id,
                "store_dir": str(store_dir),
            }),
            encoding="utf-8",
        )
        log.info(
            "[persistence-probe] marker CREATED by deployment %s. If the next deployment logs "
            "'marker present/SURVIVED', storage is persistent; if it logs 'marker CREATED' "
            "again, the directory is EPHEMERAL container filesystem",
            deploy_id,
        )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    _theme_memory_persistence_probe()
    # Institutional memory (M3.1): log enabled/disabled and why (no secrets).
    try:
        from app.institutional_memory import log_startup_status
        log_startup_status()
    except Exception:
        log.exception("[main] institutional memory status check failed at startup")
    # Start the background feed-refresh daemon.  It immediately warms the
    # processed-feed cache so the first page load is served from cache, not
    # from a blocking pipeline call.
    refresher.start()
    yield
    # ── Shutdown ──────────────────────────────────────────────────────────────
    refresher.stop()


app = FastAPI(
    title="Argus AI API",
    description="Market intelligence feed powered by local LLM",
    version="1.0.0",
    lifespan=lifespan,
)

# ALLOWED_ORIGINS — comma-separated list of allowed frontend origins.
# Set this on the Railway backend service to include the deployed frontend URL,
# e.g. https://argus-frontend.up.railway.app
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
)
_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(feed.router,      prefix="/api/feed",      tags=["feed"])
app.include_router(saved.router,     prefix="/api/saved",     tags=["saved"])
app.include_router(analyze.router,   prefix="/api/analyze",   tags=["analyze"])
app.include_router(listen.router,    prefix="/api/listen",    tags=["listen"])
app.include_router(briefings.router, prefix="/api/briefings", tags=["briefings"])

# Intelligence graph router — wrapped so a startup import error is logged
# clearly rather than silently killing the entire deploy.
try:
    from api.routes import intelligence as _intelligence_mod
    app.include_router(
        _intelligence_mod.router,
        prefix="/api/intelligence",
        tags=["intelligence"],
    )
    log.info("[main] intelligence router registered at /api/intelligence")
except Exception as _exc:
    log.exception(
        "[main] FAILED to register intelligence router — /api/intelligence/* will be unavailable: %r",
        _exc,
    )

# Thematic Intelligence Memory router — wrapped so a startup import error is
# logged clearly rather than silently killing the deploy.
try:
    from api.routes import memory as _memory_mod
    app.include_router(
        _memory_mod.router,
        prefix="/api/memory",
        tags=["memory"],
    )
    log.info("[main] memory router registered at /api/memory")
except Exception as _exc:
    log.exception(
        "[main] FAILED to register memory router — /api/memory/* will be unavailable: %r",
        _exc,
    )

# Institutional memory v2 router (M3.1) — read-only queries over the permanent
# Supabase archive. Wrapped so a startup import error is logged clearly rather
# than silently killing the deploy.
try:
    from api.routes import memory_v2 as _memory_v2_mod
    app.include_router(
        _memory_v2_mod.router,
        prefix="/api/memory/v2",
        tags=["memory-v2"],
    )
    log.info("[main] memory v2 router registered at /api/memory/v2")
except Exception as _exc:
    log.exception(
        "[main] FAILED to register memory v2 router — /api/memory/v2/* will be unavailable: %r",
        _exc,
    )


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
