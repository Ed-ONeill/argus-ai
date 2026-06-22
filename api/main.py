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

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
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


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
