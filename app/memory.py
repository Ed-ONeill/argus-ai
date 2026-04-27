"""
app/memory.py — Phase 3: Conversation memory and session persistence

Features:
  - Named sessions stored as JSON
  - Token-aware history truncation (keeps context under model limit)
  - Session listing, loading, deleting, renaming, exporting
  - Auto-titling from the first user message
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.config import settings
from app.model import Message


# ── Approximate token counter (4 chars ≈ 1 token) ────────────────────────────
def _approx_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def _messages_tokens(messages: list[Message]) -> int:
    return sum(_approx_tokens(m.get("content", "")) for m in messages)


# ── Session ───────────────────────────────────────────────────────────────────
class Session:
    def __init__(
        self,
        session_id:    str | None = None,
        name:          str        = "New Chat",
        system_prompt: str | None = None,
        messages:      list[Message] | None = None,
        model:         str | None = None,
    ):
        self.id            = session_id or str(uuid.uuid4())[:8]
        self.name          = name
        self.system_prompt = system_prompt or settings.system_prompt
        self.model         = model or settings.active_model
        self.created_at    = datetime.now().isoformat()
        self.updated_at    = self.created_at
        self.messages: list[Message] = messages or []

    # ── History management ────────────────────────────────────────────────────
    def add(self, role: str, content: str):
        self.messages.append(Message(role=role, content=content))
        self.updated_at = datetime.now().isoformat()
        if len(self.messages) == 1 and role == "user" and self.name == "New Chat":
            self._auto_title(content)

    def _auto_title(self, first_message: str):
        """Use the first 6 words of the first user message as the session name."""
        words = re.sub(r"[^a-zA-Z0-9 ]", "", first_message).split()
        self.name = " ".join(words[:6]) or "New Chat"

    def get_context(self, max_tokens: int | None = None) -> list[Message]:
        """
        Return [system_prompt] + messages, truncated to fit within max_tokens.
        Keeps the most recent messages; never drops the system prompt.
        """
        limit = max_tokens or settings.llm_context_window
        # Reserve 25% for the model's reply
        budget = int(limit * 0.75)

        system_msg = [Message.system(self.system_prompt)]
        sys_tokens = _approx_tokens(self.system_prompt)

        # Walk backwards through history, accumulate until over budget
        kept = []
        used = sys_tokens
        for msg in reversed(self.messages):
            t = _approx_tokens(msg.get("content", ""))
            if used + t > budget:
                break
            kept.insert(0, msg)
            used += t

        return system_msg + kept

    def clear(self):
        self.messages = []
        self.name = "New Chat"
        self.updated_at = datetime.now().isoformat()

    # ── Serialization ─────────────────────────────────────────────────────────
    def to_dict(self) -> dict:
        return {
            "id":            self.id,
            "name":          self.name,
            "system_prompt": self.system_prompt,
            "model":         self.model,
            "created_at":    self.created_at,
            "updated_at":    self.updated_at,
            "messages":      self.messages,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Session":
        s = cls(
            session_id=d["id"],
            name=d["name"],
            system_prompt=d.get("system_prompt", settings.system_prompt),
            messages=[Message(**m) for m in d.get("messages", [])],
            model=d.get("model", settings.active_model),
        )
        s.created_at = d.get("created_at", s.created_at)
        s.updated_at = d.get("updated_at", s.updated_at)
        return s

    def __repr__(self):
        return f"Session(id={self.id!r}, name={self.name!r}, messages={len(self.messages)})"


# ── SessionManager ────────────────────────────────────────────────────────────
class SessionManager:
    def __init__(self, directory: Path | None = None):
        self.dir = directory or settings.conversations_dir
        self.dir.mkdir(parents=True, exist_ok=True)

    def _path(self, session_id: str) -> Path:
        return self.dir / f"{session_id}.json"

    # ── CRUD ──────────────────────────────────────────────────────────────────
    def create(self, name: str = "New Chat", system_prompt: str | None = None) -> Session:
        s = Session(name=name, system_prompt=system_prompt)
        self.save(s)
        return s

    def save(self, session: Session):
        session.updated_at = datetime.now().isoformat()
        with open(self._path(session.id), "w", encoding="utf-8") as f:
            json.dump(session.to_dict(), f, indent=2, ensure_ascii=False)

    def load(self, session_id: str) -> Session | None:
        p = self._path(session_id)
        if not p.exists():
            return None
        with open(p, encoding="utf-8") as f:
            return Session.from_dict(json.load(f))

    def delete(self, session_id: str) -> bool:
        p = self._path(session_id)
        if p.exists():
            p.unlink()
            return True
        return False

    def rename(self, session_id: str, new_name: str) -> bool:
        s = self.load(session_id)
        if not s:
            return False
        s.name = new_name
        self.save(s)
        return True

    # ── Listing ───────────────────────────────────────────────────────────────
    def list_sessions(self) -> list[dict]:
        """Return session metadata sorted by most recently updated."""
        sessions = []
        for p in self.dir.glob("*.json"):
            try:
                with open(p, encoding="utf-8") as f:
                    d = json.load(f)
                sessions.append({
                    "id":         d["id"],
                    "name":       d["name"],
                    "messages":   len(d.get("messages", [])),
                    "updated_at": d.get("updated_at", ""),
                    "model":      d.get("model", ""),
                })
            except Exception:
                continue
        return sorted(sessions, key=lambda x: x["updated_at"], reverse=True)

    def list_names(self) -> list[str]:
        """Return 'name  (id)' strings for display in dropdowns."""
        return [f"{s['name']}  [{s['id']}]" for s in self.list_sessions()]

    @staticmethod
    def parse_id(label: str) -> str:
        """Extract session id from 'Name  [id]' label."""
        m = re.search(r"\[([^\]]+)\]", label)
        return m.group(1) if m else label

    # ── Export ────────────────────────────────────────────────────────────────
    def export_markdown(self, session_id: str) -> str | None:
        s = self.load(session_id)
        if not s:
            return None
        lines = [f"# {s.name}", f"*{s.created_at[:10]}  |  model: {s.model}*", ""]
        for m in s.messages:
            role = "**You**" if m["role"] == "user" else f"**{settings.assistant_name}**"
            lines += [f"{role}", m["content"], ""]
        return "\n".join(lines)


# Module-level singleton
session_manager = SessionManager()
