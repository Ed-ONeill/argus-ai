"""
app/config.py — Central configuration management
Loads settings from .env (or environment variables) using Pydantic Settings.
"""

from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent


class Backend(str, Enum):
    ollama   = "ollama"
    openai   = "openai"
    lmstudio = "lmstudio"
    llamacpp = "llamacpp"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── Backend ───────────────────────────────────────────────────────────────
    llm_backend: Backend = Backend.ollama

    # ── Ollama ────────────────────────────────────────────────────────────────
    ollama_host:        str = "http://localhost:11434"
    ollama_model:       str = "gemma3:12b"
    ollama_embed_model: str = "nomic-embed-text"

    # ── OpenAI ────────────────────────────────────────────────────────────────
    openai_api_key: str  = ""
    openai_model:   str  = "gpt-4o-mini"

    # ── LM Studio ─────────────────────────────────────────────────────────────
    lmstudio_host:  str  = "http://localhost:1234/v1"
    lmstudio_model: str  = "local-model"

    # ── Inference parameters ──────────────────────────────────────────────────
    llm_temperature:    float = 0.7
    llm_max_tokens:     int   = 2048
    llm_context_window: int   = 8192
    llm_stream:         bool  = True

    # ── Paths ─────────────────────────────────────────────────────────────────
    documents_dir:   Path = BASE_DIR / "documents"
    embeddings_dir:  Path = BASE_DIR / "embeddings"
    models_dir:      Path = BASE_DIR / "models"
    chroma_dir:      Path = BASE_DIR / "embeddings" / "chroma"
    conversations_dir: Path = BASE_DIR / "data" / "conversations"
    memory_db:         Path = BASE_DIR / "data" / "memory.db"
    log_file:          Path = BASE_DIR / "logs" / "assistant.log"

    # ── Persona ───────────────────────────────────────────────────────────────
    system_prompt:  str = "You are a knowledgeable personal assistant. Be concise, accurate, and helpful."
    assistant_name: str = "Argus AI"

    # ── Logging ───────────────────────────────────────────────────────────────
    log_level:          str  = "INFO"
    save_conversations: bool = True

    @field_validator("documents_dir", "embeddings_dir", "models_dir",
                     "chroma_dir", "conversations_dir", "log_file", mode="after")
    @classmethod
    def ensure_dir(cls, v: Path) -> Path:
        # Resolve relative paths against the project root, not cwd
        if not v.is_absolute():
            v = BASE_DIR / v
        # For log_file, only create the parent directory
        target = v.parent if v.suffix else v
        target.mkdir(parents=True, exist_ok=True)
        return v

    # ── Convenience properties ─────────────────────────────────────────────────
    @property
    def active_model(self) -> str:
        return {
            Backend.ollama:   self.ollama_model,
            Backend.openai:   self.openai_model,
            Backend.lmstudio: self.lmstudio_model,
            Backend.llamacpp: "local",
        }[self.llm_backend]

    @property
    def active_base_url(self) -> str | None:
        return {
            Backend.ollama:   self.ollama_host,
            Backend.openai:   None,
            Backend.lmstudio: self.lmstudio_host,
            Backend.llamacpp: None,
        }[self.llm_backend]


# Module-level singleton — import this everywhere
settings = Settings()
