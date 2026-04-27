"""
app/docs.py — Phase 4: Document ingestion, chunking, embedding, and retrieval (RAG)

Pipeline:
    File upload → extract_text() → chunk_text() → embed() → DocumentStore (numpy + JSON)
    User query  → embed() → cosine similarity → top-k chunks → injected into LLM context

Supported file types: PDF, TXT, MD, CSV
Embedding model:      Ollama nomic-embed-text  (fully local, no huggingface dependency)
Vector storage:       numpy .npy arrays + JSON metadata (no external DB required)

Prerequisite:
    ollama pull nomic-embed-text
"""

from __future__ import annotations

import csv
import json
import logging
import re
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from app.config import settings

log = logging.getLogger(__name__)

# ── Ollama embedding (no sentence-transformers / huggingface_hub) ─────────────
_EMBED_BATCH = 16   # chunks per Ollama request


def embed(texts: list[str]) -> np.ndarray:
    """
    Embed texts via Ollama's /api/embed endpoint.
    Returns an L2-normalised float32 array of shape (n, embedding_dim).

    Requires Ollama to be running and the embed model to be pulled:
        ollama pull nomic-embed-text
    """
    import ollama

    client  = ollama.Client(host=settings.ollama_host)
    model   = settings.ollama_embed_model
    all_embs: list[list[float]] = []

    for i in range(0, len(texts), _EMBED_BATCH):
        batch = texts[i : i + _EMBED_BATCH]
        try:
            resp = client.embed(model=model, input=batch)
            # ollama >= 0.2 returns an object; support both attr and dict access
            raw = resp.embeddings if hasattr(resp, "embeddings") else resp["embeddings"]
            all_embs.extend(raw)
        except Exception as exc:
            raise RuntimeError(
                f"Ollama embedding failed for model '{model}'.\n"
                f"Make sure Ollama is running and the model is pulled:\n"
                f"    ollama pull {model}\n"
                f"Original error: {exc}"
            ) from exc

    embs  = np.array(all_embs, dtype=np.float32)
    norms = np.linalg.norm(embs, axis=1, keepdims=True)
    return embs / np.maximum(norms, 1e-9)


# ── Text extraction ───────────────────────────────────────────────────────────

def extract_pdf(path: Path) -> list[tuple[int, str]]:
    """Return list of (page_number, page_text). Requires PyPDF2."""
    import PyPDF2
    pages = []
    with open(path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if text.strip():
                pages.append((i + 1, text))
    return pages


def extract_txt(path: Path) -> list[tuple[int, str]]:
    text = path.read_text(encoding="utf-8", errors="replace")
    return [(1, text)]


def extract_csv(path: Path) -> list[tuple[int, str]]:
    """Convert CSV rows to human-readable text blocks (one block per 50 rows)."""
    with open(path, encoding="utf-8", errors="replace", newline="") as f:
        rows = list(csv.reader(f))
    if not rows:
        return []
    header = rows[0]
    pages, chunk_lines = [], []
    for row_num, row in enumerate(rows[1:], start=1):
        # Format each row as "col: value, col: value, ..."
        pairs = [f"{h}: {v}" for h, v in zip(header, row) if v.strip()]
        chunk_lines.append(" | ".join(pairs))
        if len(chunk_lines) >= 50:
            pages.append((len(pages) + 1, "\n".join(chunk_lines)))
            chunk_lines = []
    if chunk_lines:
        pages.append((len(pages) + 1, "\n".join(chunk_lines)))
    return pages


def extract_text(path: Path) -> list[tuple[int, str]]:
    """Dispatch to the right extractor. Returns [(page_num, text), ...]."""
    ext = path.suffix.lower()
    if ext == ".pdf":
        return extract_pdf(path)
    elif ext == ".csv":
        return extract_csv(path)
    elif ext in (".txt", ".md", ".rst", ".log"):
        return extract_txt(path)
    else:
        # Try as plain text before giving up
        try:
            return extract_txt(path)
        except Exception:
            raise ValueError(f"Unsupported file type: '{ext}'. Use PDF, TXT, CSV, or MD.")


# ── Chunking ──────────────────────────────────────────────────────────────────

@dataclass
class Chunk:
    text:   str
    source: str   # original filename
    page:   int
    index:  int   # sequential chunk number within the store


def chunk_text(
    text:        str,
    source:      str,
    page:        int,
    start_index: int = 0,
    chunk_size:  int = 512,
    overlap:     int = 64,
) -> list[Chunk]:
    """
    Split text into overlapping fixed-size chunks.
    Tries to break on sentence/word boundaries when possible.
    """
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []

    chunks, pos, idx = [], 0, start_index
    while pos < len(text):
        end = min(pos + chunk_size, len(text))

        # Try to find a sentence boundary near the end (. ! ? \n)
        if end < len(text):
            boundary = max(
                text.rfind(". ", pos, end),
                text.rfind("! ", pos, end),
                text.rfind("? ", pos, end),
                text.rfind("\n",  pos, end),
            )
            if boundary > pos + chunk_size // 2:
                end = boundary + 1

        fragment = text[pos:end].strip()
        if len(fragment) > 40:   # skip tiny leftover fragments
            chunks.append(Chunk(text=fragment, source=source, page=page, index=idx))
            idx += 1

        pos += (chunk_size - overlap)

    return chunks


# ── Document Store ────────────────────────────────────────────────────────────

class DocumentStore:
    """
    Per-session vector store.

    Files on disk (under embeddings/{session_id}/):
        metadata.json  — {"embed_model": str, "chunks": [...Chunk dicts...]}
        embeddings.npy — float32 array of shape (n_chunks, embedding_dim)

    The embed_model field lets us detect when the configured embedding model has
    changed (e.g. switching from sentence-transformers to nomic-embed-text), so we
    can automatically discard incompatible vectors rather than returning garbage results.
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.store_dir  = settings.embeddings_dir / session_id
        self.store_dir.mkdir(parents=True, exist_ok=True)
        self._chunks:     list[Chunk]       = []
        self._embeddings: np.ndarray | None = None
        self._load()

    # ── Persistence ───────────────────────────────────────────────────────────

    @property
    def _meta_path(self) -> Path:
        return self.store_dir / "metadata.json"

    @property
    def _emb_path(self) -> Path:
        return self.store_dir / "embeddings.npy"

    def _load(self):
        if not (self._meta_path.exists() and self._emb_path.exists()):
            return
        try:
            with open(self._meta_path, encoding="utf-8") as f:
                data = json.load(f)

            # Support both old format (bare list) and new format (dict with embed_model)
            if isinstance(data, list):
                saved_model = None
                chunks_raw  = data
            else:
                saved_model = data.get("embed_model")
                chunks_raw  = data.get("chunks", [])

            # If the embed model has changed, the stored vectors are incompatible — discard
            if saved_model and saved_model != settings.ollama_embed_model:
                log.warning(
                    f"[{self.session_id}] Stored embeddings used '{saved_model}' but current "
                    f"model is '{settings.ollama_embed_model}'. Clearing stale vectors — "
                    f"please re-index your documents."
                )
                self.clear()
                return

            self._chunks     = [Chunk(**c) for c in chunks_raw]
            self._embeddings = np.load(str(self._emb_path))
            log.debug(f"[{self.session_id}] Loaded {len(self._chunks)} chunks from disk.")
        except Exception as e:
            log.warning(f"[{self.session_id}] Failed to load store: {e}. Starting fresh.")
            self._chunks, self._embeddings = [], None

    def save(self):
        data = {
            "embed_model": settings.ollama_embed_model,
            "chunks":      [asdict(c) for c in self._chunks],
        }
        with open(self._meta_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        if self._embeddings is not None:
            np.save(str(self._emb_path), self._embeddings.astype(np.float32))

    # ── Ingestion ─────────────────────────────────────────────────────────────

    def has_file(self, filename: str) -> bool:
        return filename in {c.source for c in self._chunks}

    def add_file(self, path: Path) -> dict:
        """
        Process one file: extract → chunk → embed → store.
        Returns {"file": name, "pages": n, "chunks": n, "skipped": bool}.
        """
        filename = path.name
        if self.has_file(filename):
            log.info(f"[{self.session_id}] '{filename}' already indexed — skipping.")
            return {"file": filename, "pages": 0, "chunks": 0, "skipped": True}

        pages = extract_text(path)
        new_chunks: list[Chunk] = []
        base = len(self._chunks)
        for page_num, text in pages:
            new_chunks += chunk_text(text, filename, page_num, start_index=base + len(new_chunks))

        if not new_chunks:
            return {"file": filename, "pages": len(pages), "chunks": 0, "skipped": False}

        new_embs = embed([c.text for c in new_chunks])

        self._chunks.extend(new_chunks)
        if self._embeddings is None:
            self._embeddings = new_embs
        else:
            self._embeddings = np.vstack([self._embeddings, new_embs])

        self.save()
        log.info(f"[{self.session_id}] Indexed '{filename}': {len(pages)} pages, {len(new_chunks)} chunks.")
        return {"file": filename, "pages": len(pages), "chunks": len(new_chunks), "skipped": False}

    # ── Retrieval ─────────────────────────────────────────────────────────────

    def search(self, query: str, top_k: int = 5, min_score: float = 0.25) -> list[tuple[Chunk, float]]:
        """
        Return up to top_k (Chunk, cosine_score) pairs relevant to the query.
        Filters out chunks below min_score (0–1 scale).
        """
        if not self._chunks or self._embeddings is None:
            return []

        q_emb = embed([query])                                    # (1, 384)
        scores = (self._embeddings @ q_emb.T).squeeze()           # (n,)
        if scores.ndim == 0:
            scores = scores.reshape(1)

        top_idx = np.argsort(scores)[::-1][:top_k]
        return [
            (self._chunks[i], float(scores[i]))
            for i in top_idx
            if float(scores[i]) >= min_score
        ]

    # ── Info & management ─────────────────────────────────────────────────────

    def list_files(self) -> list[str]:
        seen, result = set(), []
        for c in self._chunks:
            if c.source not in seen:
                seen.add(c.source)
                result.append(c.source)
        return result

    def file_chunk_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for c in self._chunks:
            counts[c.source] = counts.get(c.source, 0) + 1
        return counts

    @property
    def chunk_count(self) -> int:
        return len(self._chunks)

    def remove_file(self, filename: str):
        """Remove all chunks belonging to one file and re-save."""
        keep = [i for i, c in enumerate(self._chunks) if c.source != filename]
        if len(keep) == len(self._chunks):
            return
        self._chunks = [self._chunks[i] for i in keep]
        if self._embeddings is not None:
            self._embeddings = self._embeddings[keep] if keep else None
        self.save()
        log.info(f"[{self.session_id}] Removed '{filename}' from store.")

    def clear(self):
        self._chunks = []
        self._embeddings = None
        for p in (self._meta_path, self._emb_path):
            if p.exists():
                p.unlink()
        log.info(f"[{self.session_id}] Store cleared.")


# ── Module-level session → store cache ───────────────────────────────────────
_store_cache: dict[str, DocumentStore] = {}


def get_store(session_id: str) -> DocumentStore:
    """Return (or create) the DocumentStore for a given session."""
    if session_id not in _store_cache:
        _store_cache[session_id] = DocumentStore(session_id)
    return _store_cache[session_id]


# ── RAG context builder ───────────────────────────────────────────────────────
RAG_HEADER = "=== RELEVANT DOCUMENT CONTEXT ==="
RAG_FOOTER = "=== END OF DOCUMENT CONTEXT ==="
RAG_INSTRUCTION = (
    "Use the document excerpts above to answer the question when they are relevant. "
    "Cite the source filename if you use information from the documents. "
    "If the documents don't contain the answer, say so and answer from general knowledge."
)

def build_rag_context(query: str, session_id: str, top_k: int = 5) -> tuple[str, int]:
    """
    Retrieve the most relevant document chunks for a query.

    Returns:
        (context_block: str, num_chunks_used: int)
        context_block is empty string if no documents or nothing relevant.
    """
    store = get_store(session_id)
    if store.chunk_count == 0:
        return "", 0

    results = store.search(query, top_k=top_k)
    if not results:
        return "", 0

    lines = [RAG_HEADER, ""]
    for chunk, score in results:
        lines.append(f"[Source: {chunk.source} — page {chunk.page}]")
        lines.append(chunk.text)
        lines.append("")

    lines += [RAG_FOOTER, "", RAG_INSTRUCTION]
    return "\n".join(lines), len(results)
