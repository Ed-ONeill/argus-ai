"""
api/main.py — FastAPI backend for Argus AI

Wraps the existing Python feed + summarizer engine and exposes REST endpoints
consumed by the Next.js frontend.  All heavy logic stays in app/.

Run:
    uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Make the project root importable regardless of how uvicorn is invoked
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import feed, saved, analyze, listen, briefings
from app.background import refresher


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000",
                   "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(feed.router,    prefix="/api/feed",    tags=["feed"])
app.include_router(saved.router,   prefix="/api/saved",   tags=["saved"])
app.include_router(analyze.router, prefix="/api/analyze", tags=["analyze"])
app.include_router(listen.router,     prefix="/api/listen",     tags=["listen"])
app.include_router(briefings.router,  prefix="/api/briefings",  tags=["briefings"])


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
