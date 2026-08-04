"""
app/config.py — Central configuration management
Loads settings from .env (or environment variables) using Pydantic Settings.
"""

from __future__ import annotations

from enum import Enum
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app import storage as _storage


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
    # Durable state (conversations, memory db) rides the volume-backed data dir
    # (PH1/C5); build-time assets (models, embeddings) stay in the image.
    documents_dir:   Path = BASE_DIR / "documents"
    embeddings_dir:  Path = BASE_DIR / "embeddings"
    models_dir:      Path = BASE_DIR / "models"
    chroma_dir:      Path = BASE_DIR / "embeddings" / "chroma"
    conversations_dir: Path = _storage.CONVERSATIONS_DIR
    memory_db:         Path = _storage.MEMORY_DB_PATH
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

    # ── Registry-backed continuity (OP2.3 / OP2.4, Sprint 4) ──────────────────
    # registry_decay: event first_seen anchors to the registry's lifetime first
    # observation (decay from the TRUE first telling, not this cycle's members)
    # and events carry cycles_observed. Off → member-derived first_seen only.
    # registry_folding: two current-cycle events resolving to the same uid fold
    # into one before serving (same identity law as matching; rule-3 title-only
    # matches never fold). Off → siblings surface separately (Sprint 3
    # behavior). Both are instant-rollback hatches with the merge_dedup
    # contract.
    registry_decay:   bool = True
    registry_folding: bool = True

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

    # ── Production deployment & auth (PH2 / PH5) ───────────────────────────────
    # argus_env: "production" turns on fail-fast startup verification — missing
    # persistence, JWT secret, or RLS becomes a boot error instead of a silent
    # insecure serve. Anything else (default) is dev/test: verification logs
    # warnings but never blocks.
    argus_env: str = "development"    # env ARGUS_ENV
    # Backend token verification (PH2). This Supabase project signs user access
    # tokens ASYMMETRICALLY (ES256) — verification uses the project's public
    # JWKS, which is derived from SUPABASE_URL (no secret required, JWKS is
    # public). Auth is therefore ENABLED whenever SUPABASE_URL is set; the
    # legacy shared secret below is retained only as an optional HS256 fallback
    # for projects still on symmetric signing (unused here).
    supabase_jwt_secret:       str  = ""      # env SUPABASE_JWT_SECRET (legacy HS256 only)
    supabase_jwks_url:         str  = ""      # env SUPABASE_JWKS_URL (defaults from SUPABASE_URL)
    argus_auth_disabled:       bool = False   # env ARGUS_AUTH_DISABLED — explicit dev opt-out
    # Anon (publishable) key — used only to PROVE at startup that anonymous
    # PostgREST access to backend tables is denied by RLS (PH5). Never used to
    # write. Public by design.
    supabase_anon_key:         str  = ""      # env SUPABASE_ANON_KEY

    @property
    def is_production(self) -> bool:
        return self.argus_env.strip().lower() in ("production", "prod")

    @property
    def auth_enabled(self) -> bool:
        # JWKS verification needs only the project URL; the secret path is a
        # legacy fallback. Either configured (and not explicitly disabled)
        # turns enforcement on.
        return (not self.argus_auth_disabled) and bool(self.supabase_url or self.supabase_jwt_secret)

    @property
    def jwks_url(self) -> str:
        if self.supabase_jwks_url:
            return self.supabase_jwks_url
        if self.supabase_url:
            return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        return ""

    @property
    def expected_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1" if self.supabase_url else ""

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

    # ── Universal-materiality classifier (Wave 0, RD-5) ───────────────────────
    # "off" | "shadow" | "active". Wave 0.1 operates only off/shadow; "active"
    # is reserved for Wave 1 enforcement and is downgraded to a non-authoritative
    # shadow until then (see app.materiality.effective_mode). Invalid values fail
    # safe to "off". Default "off": the classifier is dark until explicitly
    # enabled for shadow calibration.
    materiality_mode: str = "off"

    # Wave 0.3 C1 evaluation capture is independently gated and fail-off. It only
    # observes completed SHADOW assessments; enabling it cannot activate the
    # materiality classifier or alter any production decision surface.
    materiality_evaluation_enabled: bool = False
    materiality_evaluation_namespace: str = "argus"

    # Wave 0.4 A2 activation integration is an independent, fail-off runtime gate.
    # When False (default) the A2 seam is a COMPLETE no-op — it performs no input
    # assembly, resolution, audit, accessor update, or diagnostics, and produces
    # zero production-output difference. It is independent of materiality_mode,
    # evaluation capture, and any activation_flag; enabling it grants no authority
    # (the resolved ActivationState is advisory and read by no production consumer).
    materiality_activation_runtime_enabled: bool = False

    @field_validator("materiality_activation_runtime_enabled", mode="before")
    @classmethod
    def _parse_materiality_activation_runtime_enabled(cls, value: object) -> bool:
        # Malformed values fail safe to False without preventing startup.
        if isinstance(value, bool):
            return value
        if isinstance(value, int) and value in (0, 1):
            return bool(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "t", "yes", "y", "on"}:
                return True
        return False

    @field_validator("materiality_evaluation_enabled", mode="before")
    @classmethod
    def _parse_materiality_evaluation_enabled(cls, value: object) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, int) and value in (0, 1):
            return bool(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "t", "yes", "y", "on"}:
                return True
            if normalized in {"0", "false", "f", "no", "n", "off", ""}:
                return False
        try:
            from app.materiality_evaluation import record_diagnostic

            record_diagnostic(
                component="configuration", operation="parse",
                error_code="invalid_activation_flag",
                detail_code="evaluation_disabled",
            )
        except Exception:
            # Diagnostics are observational; even their unavailability cannot
            # turn malformed optional evaluation config into a startup failure.
            pass
        return False

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
