"""
app/analyst.py — Structured deal analysis engine (Phase 6)

Turns indexed documents into a formatted financial memo by:
  1. Running a targeted retrieval query for each of the 5 analysis sections
  2. Deduplicating and ranking retrieved chunks across all sections
  3. Sending a single structured prompt to the LLM with all relevant context
  4. Streaming the response back to the UI

Usage:
    from app.analyst import run_deal_analysis

    for chunk in run_deal_analysis(session_id="abc123", model_name="gemma3:12b"):
        print(chunk, end="", flush=True)
"""

from __future__ import annotations

import logging
from typing import Iterator

from app.config import settings
from app.docs   import DocumentStore, get_store
from app.model  import Message, get_client

log = logging.getLogger(__name__)

# ── Per-section retrieval queries ─────────────────────────────────────────────
# Each tuple: (section_name, semantic_query_for_embedding_search)
# Queries use finance vocabulary so nomic-embed-text pulls the most relevant chunks.

SECTION_QUERIES: list[tuple[str, str]] = [
    (
        "Business Overview",
        "company overview description what company does products services industry sector "
        "market position business model competitive landscape"
    ),
    (
        "Revenue Model",
        "revenue streams how company makes money pricing contracts customers recurring revenue "
        "monetisation sales model annual revenue gross margin"
    ),
    (
        "Financial Highlights",
        "revenue EBITDA net income profit margin growth rate cash flow financial performance "
        "earnings metrics operating income capital expenditure leverage"
    ),
    (
        "Key Risks",
        "risks challenges competition regulatory compliance customer concentration supplier "
        "dependency market risk operational risk litigation macro headwinds"
    ),
    (
        "Investment Thesis",
        "growth opportunity market expansion acquisition rationale strategic value upside "
        "downside competitive moat synergies return on investment IRR multiple"
    ),
]

# Retrieval parameters
_TOP_K_PER_SECTION = 5       # chunks retrieved per section query
_MIN_SCORE         = 0.15    # minimum cosine similarity to be included
_MAX_CONTEXT_CHARS = 14_000  # hard cap on total context (fits inside gemma3:12b)

# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a senior analyst at a private equity firm preparing a deal review memo.
Your task is to analyse the provided document excerpts and produce a structured \
company analysis.

Rules:
- Base every claim strictly on the provided document context.
- Quote or cite specific numbers, dates, and names when they appear in the documents.
- If a section has no supporting evidence in the documents, write exactly:
  *Insufficient data in provided documents.*
- Do not invent facts, infer unstated figures, or pad sections with generalities.
- Use clear, professional language. Bullet points are preferred over prose paragraphs.\
"""

# ── Analysis prompt template ──────────────────────────────────────────────────

_ANALYSIS_PROMPT = """\
{context}

---

Using ONLY the document context above, write the following structured analysis. \
Follow the exact section headings and format shown below.

---

# Company Analysis

## 1. Business Overview
- **What the company does:**
- **Industry and market positioning:**

## 2. Revenue Model
- **How the company generates revenue:**
- **Key revenue drivers and customer segments:**

## 3. Financial Highlights
- **Key metrics (revenue, EBITDA, margins, growth rates):**
- **Notable trends:**

## 4. Key Risks
- **Operational risks:**
- **Market / competitive risks:**

## 5. Investment Thesis
- **Bull case:**
- **Bear case:**

---
"""

# ── Context gathering ─────────────────────────────────────────────────────────

def _gather_context(store: DocumentStore) -> tuple[str, int]:
    """
    Run retrieval for every analysis section, deduplicate across sections,
    rank by relevance score, and return a formatted context block.

    Returns:
        (context_block: str, unique_chunks_used: int)
    """
    seen_indices: set[int] = set()
    scored_chunks: list[tuple[object, float]] = []   # (Chunk, score)

    for _section_name, query in SECTION_QUERIES:
        results = store.search(query, top_k=_TOP_K_PER_SECTION, min_score=_MIN_SCORE)
        for chunk, score in results:
            if chunk.index not in seen_indices:
                seen_indices.add(chunk.index)
                scored_chunks.append((chunk, score))

    if not scored_chunks:
        return "", 0

    # Sort highest-scoring first so the most relevant material leads the context
    scored_chunks.sort(key=lambda x: x[1], reverse=True)

    lines = ["=== DOCUMENT CONTEXT ===", ""]
    total_chars = 0
    included = 0

    for chunk, _score in scored_chunks:
        entry = (
            f"[Source: {chunk.source} — page {chunk.page}]\n"
            f"{chunk.text}\n"
        )
        if total_chars + len(entry) > _MAX_CONTEXT_CHARS:
            break
        lines.append(entry)
        total_chars += len(entry)
        included += 1

    lines.append("=== END CONTEXT ===")
    return "\n".join(lines), included


# ── Public interface ──────────────────────────────────────────────────────────

def run_deal_analysis(
    session_id: str,
    model_name: str,
    temperature: float = 0.25,
) -> Iterator[str]:
    """
    Generator that streams a structured deal analysis memo.

    Args:
        session_id:  The current Gradio session id (keys into the document store).
        model_name:  Ollama model to use (e.g. "gemma3:12b").
        temperature: Lower = more deterministic. Default 0.25 for factual analysis.

    Yields:
        String chunks suitable for streaming into a Gradio Chatbot.

    Raises:
        ValueError: If no documents are indexed for this session.
        RuntimeError: If the LLM call fails.
    """
    store = get_store(session_id)

    if store.chunk_count == 0:
        raise ValueError(
            "No documents indexed for this session.\n\n"
            "Upload and index a file first using the **Documents (RAG)** panel."
        )

    context_block, n_chunks = _gather_context(store)

    if not context_block:
        raise ValueError(
            "Could not retrieve relevant content from the indexed documents. "
            "Try re-indexing your files."
        )

    log.info(
        f"Deal analysis: {n_chunks} unique chunks from "
        f"{len(store.list_files())} file(s) for session '{session_id}'"
    )

    user_content = _ANALYSIS_PROMPT.format(context=context_block)

    messages = [
        Message.system(_SYSTEM_PROMPT),
        Message.user(user_content),
    ]

    settings.ollama_model = model_name
    client = get_client()

    yield from client.chat(messages, stream=True, temperature=temperature)
