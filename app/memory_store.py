"""
app/memory_store.py — Phase 5: Persistent cross-session memory

Storage:    SQLite  (data/memory.db)  — built-in Python, zero extra dependencies
Categories: profile | preference | project | fact | goal
Retrieval:  keyword-overlap scoring; profile entries always included

Typical context block injected into each prompt:
    === PERSONAL MEMORY ===
    [profile] Name is Edward, works in finance / private equity.
    [preference] Prefers direct, concise answers with concrete examples.
    [project] Building Argus AI — a local LLM personal assistant (Python/Gradio/Ollama).
    === END MEMORY ===
"""

from __future__ import annotations

import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.config import settings

# ── Constants ─────────────────────────────────────────────────────────────────

CATEGORIES = ("profile", "preference", "project", "fact", "goal")

MEMORY_HEADER = "=== PERSONAL MEMORY ==="
MEMORY_FOOTER = "=== END MEMORY ==="
MEMORY_INSTRUCTION = (
    "The facts above describe the user. "
    "Use them to personalise your responses — reference them naturally when relevant, "
    "but do not recite them unless asked."
)

# Tokens roughly reserved for memory in the context window (≈200 tokens)
MEMORY_CHAR_BUDGET = 800

# Words ignored during keyword matching
_STOP_WORDS = frozenset({
    "a","an","the","is","are","was","were","be","been","being",
    "have","has","had","do","does","did","will","would","could","should",
    "may","might","shall","can","need","dare","ought","used",
    "i","me","my","myself","we","our","you","your","he","she","it",
    "they","them","their","this","that","these","those","what","which",
    "who","how","when","where","why","and","or","but","if","in","on",
    "at","to","for","of","with","by","from","up","as","into","through",
    "about","also","just","not","no","so","than","then","too","very",
    "want","like","know","think","get","make","go","see","use","work",
})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_keywords(text: str) -> set[str]:
    """Return significant lowercase words (len≥3) after stripping stop-words."""
    words = re.findall(r"[a-zA-Z]{3,}", text.lower())
    return {w for w in words if w not in _STOP_WORDS}


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


# ── MemoryStore ───────────────────────────────────────────────────────────────

class MemoryStore:
    """
    Persistent cross-session memory backed by SQLite.

    Usage:
        ms = MemoryStore()                       # uses settings.memory_db
        mid = ms.add("My name is Edward", "profile")
        ms.add("Prefer concise answers",  "preference")
        block = ms.build_context_block("tell me about yourself")
    """

    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or settings.memory_db
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    # ── DB setup ──────────────────────────────────────────────────────────────

    @contextmanager
    def _conn(self):
        con = sqlite3.connect(str(self.db_path))
        con.row_factory = sqlite3.Row
        try:
            yield con
            con.commit()
        finally:
            con.close()

    def _init_db(self):
        with self._conn() as con:
            con.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    category   TEXT    NOT NULL DEFAULT 'fact',
                    content    TEXT    NOT NULL,
                    keywords   TEXT    NOT NULL DEFAULT '',
                    source     TEXT    NOT NULL DEFAULT 'user',
                    created_at TEXT    NOT NULL,
                    updated_at TEXT    NOT NULL
                )
            """)
            con.execute("CREATE INDEX IF NOT EXISTS idx_cat ON memories(category)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_upd ON memories(updated_at)")

    # ── CRUD ──────────────────────────────────────────────────────────────────

    def add(
        self,
        content:  str,
        category: str = "fact",
        source:   str = "user",
    ) -> int:
        """Insert a new memory. Returns the new row id."""
        content  = content.strip()
        category = category.lower().strip()
        if category not in CATEGORIES:
            category = "fact"
        kw = ",".join(_extract_keywords(content))
        now = _now()
        with self._conn() as con:
            cur = con.execute(
                "INSERT INTO memories(category,content,keywords,source,created_at,updated_at) "
                "VALUES (?,?,?,?,?,?)",
                (category, content, kw, source, now, now),
            )
            return cur.lastrowid

    def get(self, memory_id: int) -> dict | None:
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM memories WHERE id=?", (memory_id,)
            ).fetchone()
        return dict(row) if row else None

    def update(
        self,
        memory_id: int,
        content:   str | None = None,
        category:  str | None = None,
    ) -> bool:
        """Update content and/or category. Returns True if a row was changed."""
        current = self.get(memory_id)
        if not current:
            return False
        new_content  = content.strip()  if content  else current["content"]
        new_category = category.lower() if category else current["category"]
        if new_category not in CATEGORIES:
            new_category = current["category"]
        new_kw = ",".join(_extract_keywords(new_content))
        with self._conn() as con:
            con.execute(
                "UPDATE memories SET content=?,category=?,keywords=?,updated_at=? WHERE id=?",
                (new_content, new_category, new_kw, _now(), memory_id),
            )
        return True

    def delete(self, memory_id: int) -> bool:
        """Delete by id. Returns True if deleted."""
        with self._conn() as con:
            cur = con.execute("DELETE FROM memories WHERE id=?", (memory_id,))
        return cur.rowcount > 0

    def clear_category(self, category: str) -> int:
        """Delete all memories in a category. Returns count deleted."""
        with self._conn() as con:
            cur = con.execute("DELETE FROM memories WHERE category=?", (category,))
        return cur.rowcount

    def clear_all(self) -> int:
        with self._conn() as con:
            cur = con.execute("DELETE FROM memories")
        return cur.rowcount

    # ── Query ─────────────────────────────────────────────────────────────────

    def get_all(self, category: str | None = None) -> list[dict]:
        """Return all memories, optionally filtered by category, newest first."""
        with self._conn() as con:
            if category:
                rows = con.execute(
                    "SELECT * FROM memories WHERE category=? ORDER BY updated_at DESC",
                    (category,),
                ).fetchall()
            else:
                rows = con.execute(
                    "SELECT * FROM memories ORDER BY category, updated_at DESC"
                ).fetchall()
        return [dict(r) for r in rows]

    def count(self, category: str | None = None) -> int:
        with self._conn() as con:
            if category:
                return con.execute(
                    "SELECT COUNT(*) FROM memories WHERE category=?", (category,)
                ).fetchone()[0]
            return con.execute("SELECT COUNT(*) FROM memories").fetchone()[0]

    def find_by_text(self, text: str) -> list[dict]:
        """Fuzzy-ish full-text search using LIKE."""
        needle = f"%{text.strip()}%"
        with self._conn() as con:
            rows = con.execute(
                "SELECT * FROM memories WHERE content LIKE ? ORDER BY updated_at DESC",
                (needle,),
            ).fetchall()
        return [dict(r) for r in rows]

    # ── Retrieval for context injection ───────────────────────────────────────

    def retrieve_for_context(
        self,
        query:     str,
        max_items: int = 10,
    ) -> list[dict]:
        """
        Return the most relevant memories for a given user query.

        Strategy:
          1. Always include ALL profile memories (usually 1-3 short facts, high-value).
          2. Score every other memory by keyword overlap with the query.
          3. Return profile + top-scored others, capped at max_items.
        """
        all_mems = self.get_all()
        if not all_mems:
            return []

        q_kw = _extract_keywords(query)

        profile  = [m for m in all_mems if m["category"] == "profile"]
        others   = [m for m in all_mems if m["category"] != "profile"]

        def _score(mem: dict) -> float:
            if not q_kw:
                return 0.0
            mem_kw = set(mem["keywords"].split(",")) | _extract_keywords(mem["content"])
            overlap = q_kw & mem_kw
            return len(overlap) / len(q_kw)

        scored_others = sorted(others, key=_score, reverse=True)

        # Budget: profile first, then scored others up to max_items
        selected = profile[:]
        remaining = max_items - len(selected)
        for m in scored_others:
            if remaining <= 0:
                break
            # Only include if there's at least 1 keyword match,
            # OR if we have very few total memories (always show them)
            if _score(m) > 0 or len(all_mems) <= 5:
                selected.append(m)
                remaining -= 1

        # Trim to char budget
        result, used = [], 0
        for m in selected:
            entry_len = len(m["content"]) + 20   # 20 for the [category] prefix
            if used + entry_len > MEMORY_CHAR_BUDGET:
                break
            result.append(m)
            used += entry_len

        return result

    # ── Context block builder ─────────────────────────────────────────────────

    def build_context_block(self, query: str) -> str:
        """
        Return a formatted memory block for injection into the LLM context.
        Returns empty string if no memories are stored.
        """
        mems = self.retrieve_for_context(query)
        if not mems:
            return ""

        lines = [MEMORY_HEADER, ""]
        for m in mems:
            lines.append(f"[{m['category']}] {m['content']}")
        lines += ["", MEMORY_FOOTER, "", MEMORY_INSTRUCTION]
        return "\n".join(lines)

    # ── Display formatting ─────────────────────────────────────────────────────

    def format_for_display(self, category: str | None = None) -> str:
        """Human-readable summary for the Gradio UI textbox."""
        mems = self.get_all(category)
        if not mems:
            return "No memories stored yet.\n\nUse /remember <fact> in chat, or add via the form below."

        groups: dict[str, list[dict]] = {}
        for m in mems:
            groups.setdefault(m["category"], []).append(m)

        lines = []
        for cat in CATEGORIES:
            items = groups.get(cat, [])
            if not items:
                continue
            lines.append(f"── {cat.upper()} ──")
            for m in items:
                lines.append(f"  [{m['id']}] {m['content']}")
            lines.append("")

        total = sum(len(v) for v in groups.values())
        lines.append(f"Total: {total} memories")
        return "\n".join(lines)

    def format_choices(self) -> list[str]:
        """
        Return dropdown-friendly strings: '[id] [category] content preview'
        """
        mems = self.get_all()
        return [
            f"[{m['id']}] [{m['category']}] {m['content'][:60]}{'…' if len(m['content'])>60 else ''}"
            for m in mems
        ]


# ── Module-level singleton ────────────────────────────────────────────────────

memory_store = MemoryStore()


# ── Command parser (used by chat_ui.py) ───────────────────────────────────────

def handle_command(raw: str) -> tuple[str, bool]:
    """
    Parse and execute a /command typed in the chat box.

    Returns (response_text, was_handled).
    If was_handled is False, the caller should pass the message to the LLM as normal.

    Supported commands:
        /remember [category:] <content>   — save a memory
        /forget <id>                      — delete by numeric id
        /forget <text>                    — delete first fuzzy match
        /memory [category]                — display all (or filtered) memories
        /memory clear <category|all>      — delete category or everything
    """
    ms  = memory_store
    cmd = raw.strip()

    # ── /remember ─────────────────────────────────────────────────────────────
    if cmd.lower().startswith("/remember"):
        body = cmd[len("/remember"):].strip()
        if not body:
            return (
                "**Usage:** `/remember [category:] <content>`\n\n"
                "**Categories:** profile · preference · project · fact · goal\n\n"
                "**Examples:**\n"
                "- `/remember My name is Edward`\n"
                "- `/remember profile: I work in private equity`\n"
                "- `/remember preference: Keep responses under 3 paragraphs`",
                True,
            )
        # Parse optional category prefix  e.g. "profile: My name is…"
        category = "fact"
        m = re.match(r"^(profile|preference|project|fact|goal)\s*:\s*(.+)$", body, re.I)
        if m:
            category = m.group(1).lower()
            body     = m.group(2).strip()

        mid = ms.add(body, category=category, source="command")
        return (
            f"✓ Saved to **{category}** memory (id `{mid}`):\n> {body}",
            True,
        )

    # ── /forget ───────────────────────────────────────────────────────────────
    if cmd.lower().startswith("/forget"):
        body = cmd[len("/forget"):].strip()
        if not body:
            return (
                "**Usage:**\n"
                "- `/forget <id>` — delete by id (see `/memory` for ids)\n"
                "- `/forget <text>` — delete first memory containing that text",
                True,
            )
        # Try numeric id first
        if body.isdigit():
            mid  = int(body)
            mem  = ms.get(mid)
            if not mem:
                return f"No memory found with id `{mid}`.", True
            ms.delete(mid)
            return f"✓ Deleted [{mem['category']}] {mem['content']}", True
        # Strip optional "category: " prefix the user may have typed
        cat_pfx = re.match(r"^(?:profile|preference|project|fact|goal)\s*:\s*(.+)$", body, re.I)
        search_text = cat_pfx.group(1).strip() if cat_pfx else body
        # Fuzzy text search
        matches = ms.find_by_text(search_text)
        if not matches:
            return f"No memory found containing **{search_text}**.", True
        m = matches[0]
        ms.delete(m["id"])
        return f"✓ Deleted [{m['category']}] {m['content']}", True

    # ── /memory ───────────────────────────────────────────────────────────────
    if cmd.lower().startswith("/memory"):
        rest = cmd[len("/memory"):].strip().lower()

        # /memory clear <category|all>
        if rest.startswith("clear"):
            target = rest[len("clear"):].strip()
            if target == "all":
                n = ms.clear_all()
                return f"✓ Cleared all memories ({n} entries deleted).", True
            if target in CATEGORIES:
                n = ms.clear_category(target)
                return f"✓ Cleared **{target}** memories ({n} entries deleted).", True
            return (
                f"Unknown target '{target}'. "
                f"Use `/memory clear all` or `/memory clear <category>`.", True
            )

        # /memory [category]
        cat = rest if rest in CATEGORIES else None
        display = ms.format_for_display(cat)
        header  = f"**Memory — {cat.upper()}**" if cat else "**All Memories**"
        return f"{header}\n\n```\n{display}\n```", True

    # Not a recognised command — let the LLM handle it
    return "", False
