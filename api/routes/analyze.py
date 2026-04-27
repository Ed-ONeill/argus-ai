"""
api/routes/analyze.py — On-demand AI analysis endpoint

Two use-cases:
  POST /api/analyze/        — quick 3-field analysis (summary / why / impact)
  POST /api/analyze/deep    — lazy deep analysis (who benefits/loses + trade angle)
                              called only when the user opens the Analyze panel

Both endpoints are cached in-memory so repeated opens of the same card are instant.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.summarizer import _summarize_batch, analyze_item_deep
from app.feeds  import FeedItem
from app.model  import get_client
from app.config import settings

router = APIRouter()


# ── Request / response models ─────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    title:      str
    snippet:    str = ""
    model_name: str = ""


class AnalyzeResponse(BaseModel):
    summary:        str
    why_it_matters: str
    impact:         str


class DeepAnalyzeRequest(BaseModel):
    title:      str
    snippet:    str = ""
    model_name: str = ""


class DeepAnalyzeResponse(BaseModel):
    what_changed:     str
    why_markets_care: str
    who_wins_loses:   str
    what_to_watch:    str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/", response_model=AnalyzeResponse)
def analyze_item(req: AnalyzeRequest) -> AnalyzeResponse:
    """Quick 3-field AI enrichment for a single item."""
    model = req.model_name or settings.ollama_model
    settings.ollama_model = model

    item = FeedItem(
        title=req.title, url="", source="", category="", snippet=req.snippet,
    )
    client = get_client()
    _summarize_batch([item], client, temperature=0.2)
    return AnalyzeResponse(
        summary=item.summary,
        why_it_matters=item.why_it_matters,
        impact=item.impact,
    )


@router.post("/deep/", response_model=DeepAnalyzeResponse)
def analyze_item_deep_endpoint(req: DeepAnalyzeRequest) -> DeepAnalyzeResponse:
    """
    Lazy deep analysis: WHO BENEFITS/LOSES and TRADE ANGLE.

    Called only when the user opens the Analyze panel on a StoryCard.
    Results are cached in-memory — repeated opens of the same card are instant.
    """
    result = analyze_item_deep(
        title=req.title,
        snippet=req.snippet,
        model_name=req.model_name or None,
    )
    return DeepAnalyzeResponse(
        what_changed=result.what_changed,
        why_markets_care=result.why_markets_care,
        who_wins_loses=result.who_wins_loses,
        what_to_watch=result.what_to_watch,
    )
