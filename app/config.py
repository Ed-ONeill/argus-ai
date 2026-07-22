"""
app/config.py — Central configuration management
Loads settings from .env (or environment variables) using Pydantic Settings.
"""

from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
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

    # ── Ingestion (OP1.2) ─────────────────────────────────────────────────────
    # Merge-dedup: cross-source duplicates fold into the best-tier survivor as
    # MergedSource provenance instead of being deleted, so corroboration
    # survives ingestion. False restores legacy delete-dedup — an instant
    # rollback hatch, not a long-lived mode.
    merge_dedup: bool = True

    # ── Event identity (OP2.1) ────────────────────────────────────────────────
    # Master switch for the identity authority: uid minting, the identity
    # journal, and the registry hot view. False → no journal writes, no uids,
    # exact Sprint 2 behavior. This is the permanent kill switch, not a
    # transition flag.
    event_identity: bool = True

    # ── Institutional memory (M3.1, default flipped in OP3.3) ─────────────────
    # Backend-only Supabase credentials for the institutional-memory archive.
    # The service-role key must NEVER be exposed to the frontend or logged.
    # OP3.3 (ARGUS_OBSERVATION_PIPELINE_AUDIT_V1 I19/T21): when the flag is not
    # explicitly set, it derives from credential presence — creds configured
    # means the archive accrues; every unpersisted day is unrecoverable
    # history. An explicit env value still wins, and ARGUS_MEMORY_DISABLED
    # force-disables regardless (the escape hatch). Incomplete deployments
    # (no creds) still can never write.
    supabase_url:              str  = ""
    supabase_service_role_key: str  = ""
    institutional_memory_enabled: bool = False
    argus_memory_disabled:     bool = False   # env ARGUS_MEMORY_DISABLED

    @model_validator(mode="after")
    def _derive_institutional_memory_default(self) -> "Settings":
        if self.argus_memory_disabled:
            self.institutional_memory_enabled = False
        elif "institutional_memory_enabled" not in self.model_fields_set:
            self.institutional_memory_enabled = bool(
                self.supabase_url and self.supabase_service_role_key
            )
        return self

    # ── Prediction & outcome ledger (M3.3) ────────────────────────────────────
    # Issuance/resolution run only when BOTH institutional memory and this flag
    # are enabled. prediction_types_enabled is a comma-separated allowlist so
    # types can be rolled out one at a time (runbook: start with
    # relationship_persistence only).
    prediction_ledger_enabled: bool = False
    prediction_types_enabled:  str  = "relationship_persistence"

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
