"""
app/model.py — Unified LLM client
Supports Ollama, OpenAI, and any OpenAI-compatible local server (LM Studio, etc.)
All backends expose the same interface:
    client = get_client()
    response = client.chat(messages, stream=True)
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Generator, Iterator

from app.config import Backend, settings

log = logging.getLogger(__name__)


# ── Message type ──────────────────────────────────────────────────────────────
class Message(dict):
    """A single chat message: {"role": "user"|"assistant"|"system", "content": "..."}"""
    @classmethod
    def system(cls, content: str) -> "Message":
        return cls(role="system", content=content)

    @classmethod
    def user(cls, content: str) -> "Message":
        return cls(role="user", content=content)

    @classmethod
    def assistant(cls, content: str) -> "Message":
        return cls(role="assistant", content=content)


# ── Abstract base ─────────────────────────────────────────────────────────────
class LLMClient(ABC):
    @abstractmethod
    def chat(
        self,
        messages: list[Message],
        stream: bool = True,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str | Iterator[str]:
        """
        Send messages and return a response.
        If stream=True, returns an iterator of string chunks.
        If stream=False, returns the full response string.
        """

    @abstractmethod
    def list_models(self) -> list[str]:
        """Return available model names."""

    @abstractmethod
    def is_available(self) -> bool:
        """Check if the backend is reachable."""


# ── Ollama client ─────────────────────────────────────────────────────────────
class OllamaClient(LLMClient):
    def __init__(self):
        try:
            import ollama
            self._client = ollama.Client(host=settings.ollama_host)
            self._ollama = ollama
        except ImportError:
            raise ImportError("Install ollama: pip install ollama")

    def is_available(self) -> bool:
        try:
            self._client.list()
            return True
        except Exception:
            return False

    def list_models(self) -> list[str]:
        try:
            return [m["name"] for m in self._client.list()["models"]]
        except Exception:
            return []

    def chat(
        self,
        messages: list[Message],
        stream: bool = True,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str | Iterator[str]:
        options = {
            "temperature": temperature or settings.llm_temperature,
            "num_predict": max_tokens or settings.llm_max_tokens,
        }
        if stream:
            def _stream():
                for chunk in self._client.chat(
                    model=settings.ollama_model,
                    messages=messages,
                    stream=True,
                    options=options,
                ):
                    yield chunk["message"]["content"]
            return _stream()
        else:
            resp = self._client.chat(
                model=settings.ollama_model,
                messages=messages,
                stream=False,
                options=options,
            )
            return resp["message"]["content"]


# ── OpenAI / OpenAI-compatible client ─────────────────────────────────────────
class OpenAIClient(LLMClient):
    def __init__(self, base_url: str | None = None, api_key: str | None = None):
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("Install openai: pip install openai")

        self._model = settings.active_model
        resolved_key = api_key or settings.openai_api_key
        if not resolved_key:
            if settings.llm_backend == Backend.openai:
                raise ValueError(
                    "OPENAI_API_KEY is required when LLM_BACKEND=openai. "
                    "Set the OPENAI_API_KEY environment variable."
                )
            resolved_key = "not-needed"  # local servers (lmstudio, llamacpp) don't need a real key
        self._client = OpenAI(
            api_key=resolved_key,
            base_url=base_url or settings.active_base_url,
        )

    def is_available(self) -> bool:
        try:
            self._client.models.list()
            return True
        except Exception:
            return False

    def list_models(self) -> list[str]:
        try:
            return [m.id for m in self._client.models.list().data]
        except Exception:
            return []

    def chat(
        self,
        messages: list[Message],
        stream: bool = True,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str | Iterator[str]:
        params = dict(
            model=self._model,
            messages=messages,
            temperature=temperature or settings.llm_temperature,
            max_tokens=max_tokens or settings.llm_max_tokens,
            stream=stream,
        )
        if stream:
            def _stream():
                for chunk in self._client.chat.completions.create(**params):
                    delta = chunk.choices[0].delta.content
                    if delta:
                        yield delta
            return _stream()
        else:
            resp = self._client.chat.completions.create(**params)
            return resp.choices[0].message.content


# ── Factory ───────────────────────────────────────────────────────────────────
def get_client() -> LLMClient:
    """Return the appropriate LLM client based on settings.llm_backend."""
    backend = settings.llm_backend
    if backend == Backend.ollama:
        return OllamaClient()
    elif backend in (Backend.openai, Backend.lmstudio):
        return OpenAIClient()
    else:
        raise ValueError(f"Unsupported backend: {backend}")
