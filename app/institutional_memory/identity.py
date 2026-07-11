"""
app/institutional_memory/identity.py — Canonical institutional UIDs (M3.1).

Durable institutional records must never key on a mutable display label.
The canonical UID format is:

    {type}:{namespace}:{key}

For themes (the only entity type in M3.1):

    theme:ontology:<theme_id>   — theme_id is an exact THEME_ONTOLOGY config key
    theme:legacy:<slug>         — anything that is NOT an exact ontology key

Mapping rules (from docs/ARGUS_INSTITUTIONAL_MEMORY_V2.md §3):
  • Pipeline theme ids ARE the ontology config keys, so the ontology mapping
    is exact-match only. There is no fuzzy or fallback matching — a legacy
    name-slug is never silently merged into a canonical identity.
  • Display labels may change freely; they never participate in the UID.
  • Unknown identities land in the `legacy` namespace so their history is
    kept without polluting the ontology namespace.
"""

from __future__ import annotations

import re

ENTITY_TYPE_THEME = "theme"
NAMESPACE_ONTOLOGY = "ontology"
NAMESPACE_LEGACY = "legacy"

_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_UID_RE = re.compile(r"^(theme):(ontology|legacy):([a-z0-9][a-z0-9-]*)$")


def _ontology_ids() -> frozenset[str]:
    """Exact THEME_ONTOLOGY config keys (imported lazily; import-clean module)."""
    from app.data.theme_ontology import THEME_ONTOLOGY
    return frozenset(THEME_ONTOLOGY.keys())


def slugify(value: str) -> str:
    """Deterministic slug for legacy keys: lowercase, non-alphanumerics → '-'."""
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return slug


def theme_uid(theme_id: str) -> str:
    """
    Mint the canonical UID for a pipeline theme id.

    Exact ontology config keys map to the ontology namespace; everything else
    maps to the legacy namespace (never silently merged into a canonical id).
    Raises ValueError when theme_id cannot produce a usable key at all.
    """
    raw = (theme_id or "").strip()
    if not raw:
        raise ValueError("theme_id is empty — cannot mint a canonical UID")
    if raw in _ontology_ids() and _KEY_RE.match(raw):
        return f"{ENTITY_TYPE_THEME}:{NAMESPACE_ONTOLOGY}:{raw}"
    slug = slugify(raw)
    if not slug:
        raise ValueError(f"theme_id {theme_id!r} produced an empty slug")
    return f"{ENTITY_TYPE_THEME}:{NAMESPACE_LEGACY}:{slug}"


def parse_uid(uid: str) -> tuple[str, str, str]:
    """
    Parse and validate a canonical UID → (entity_type, namespace, key).
    Raises ValueError for anything that is not a valid M3.1 theme UID.
    """
    m = _UID_RE.match((uid or "").strip())
    if not m:
        raise ValueError(f"invalid institutional UID: {uid!r}")
    return m.group(1), m.group(2), m.group(3)


def coerce_theme_uid(value: str) -> str:
    """
    Accept either a full canonical UID or a bare pipeline theme id and return
    the canonical UID. Used by the read API so both forms are queryable.
    """
    v = (value or "").strip()
    if ":" in v:
        parse_uid(v)   # raises on invalid
        return v
    return theme_uid(v)
