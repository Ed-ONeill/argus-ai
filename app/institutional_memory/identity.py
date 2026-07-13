"""
app/institutional_memory/identity.py — Canonical institutional UIDs (M3.1 + M3.2).

Durable institutional records must never key on a mutable display label.
The canonical UID format is:

    {type}:{namespace}:{key}

Supported identity types (only where stable identity exists in production):

    theme:ontology:<theme_id>       exact THEME_ONTOLOGY config key (M3.1)
    theme:legacy:<slug>             non-ontology theme id (M3.1)
    company:ticker:<SYMBOL>         tradeable ticker — companies, ETFs, index
                                    proxies (related_assets are curated tickers)
    sector:taxonomy:<slug>          GICS-style curated sector (reserved; no
                                    M3.2 writer emits it yet)
    industry:taxonomy:<slug>        curated industry taxonomy label
    driver:ontology:<slug>          macro driver curated in the theme ontology
                                    (related_macro_factors strings)
    regime:taxonomy:<slug>          curated market-regime catalogue label
    narrative:driverset:<hash16>    sha256[:16] of the sorted driver-set key
    <type>:unresolved:<slug>        anything failing strict validation — kept,
                                    never guessed into a canonical namespace

Mapping rules (docs/ARGUS_INSTITUTIONAL_MEMORY_V2.md §3):
  • Exact-match / strict-validation only. No fuzzy matching, no silent merges.
  • Display labels may change freely; they never participate in the UID.
  • Ticker changes and mergers are handled by alias/lifecycle fields on
    institutional_entities (manual procedure — no automatic detection source
    exists today; see runbook).
"""

from __future__ import annotations

import hashlib
import re

ENTITY_TYPE_THEME = "theme"
NAMESPACE_ONTOLOGY = "ontology"
NAMESPACE_LEGACY = "legacy"
NAMESPACE_UNRESOLVED = "unresolved"

_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_UID_RE = re.compile(r"^(theme):(ontology|legacy):([a-z0-9][a-z0-9-]*)$")
_TICKER_RE = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")

# Per-type namespace + key grammar. company tickers keep their exchange casing;
# every other canonical key is a lowercase slug.
_UID_GRAMMAR: dict[str, tuple[frozenset[str], re.Pattern]] = {
    "theme":     (frozenset({"ontology", "legacy", "unresolved"}), _KEY_RE),
    "company":   (frozenset({"ticker", "unresolved"}),
                  re.compile(r"^([A-Z][A-Z0-9.\-]{0,9}|[a-z0-9][a-z0-9-]*)$")),
    "sector":    (frozenset({"taxonomy", "unresolved"}), _KEY_RE),
    "industry":  (frozenset({"taxonomy", "unresolved"}), _KEY_RE),
    "driver":    (frozenset({"ontology", "unresolved"}), _KEY_RE),
    "regime":    (frozenset({"taxonomy", "unresolved"}), _KEY_RE),
    "narrative": (frozenset({"driverset"}), re.compile(r"^[0-9a-f]{16}$")),
}

# Relationship types that are symmetric: endpoints are ordered lexically so
# A~B and B~A resolve to ONE identity. Everything else is directed and
# direction is part of the identity (drives ≠ is-driven-by).
SYMMETRIC_RELATIONSHIP_TYPES = frozenset({"correlates"})


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
    Raises ValueError for anything outside the supported identity grammar.
    """
    parts = (uid or "").strip().split(":", 2)
    if len(parts) != 3:
        raise ValueError(f"invalid institutional UID: {uid!r}")
    etype, namespace, key = parts
    grammar = _UID_GRAMMAR.get(etype)
    if grammar is None:
        raise ValueError(f"unsupported entity type in UID: {uid!r}")
    namespaces, key_re = grammar
    if namespace not in namespaces or not key_re.match(key):
        raise ValueError(f"invalid institutional UID: {uid!r}")
    return etype, namespace, key


# ── M3.2 identity minting ───────────────────────────────────────────────────────

def company_uid(ticker: str) -> str:
    """Tradeable-ticker identity. Strict validation; failures land in the
    unresolved namespace rather than being guessed."""
    raw = (ticker or "").strip().upper()
    if _TICKER_RE.match(raw):
        return f"company:ticker:{raw}"
    slug = slugify(ticker)
    if not slug:
        raise ValueError(f"ticker {ticker!r} produced no usable identity")
    return f"company:{NAMESPACE_UNRESOLVED}:{slug}"


def _taxonomy_uid(entity_type: str, namespace: str, label: str) -> str:
    slug = slugify(label)
    if not slug:
        raise ValueError(f"{entity_type} label {label!r} produced an empty slug")
    return f"{entity_type}:{namespace}:{slug}"


def industry_uid(label: str) -> str:
    """Curated industry taxonomy label (theme ontology related_industries)."""
    return _taxonomy_uid("industry", "taxonomy", label)


def sector_uid(label: str) -> str:
    """GICS-style curated sector label. Reserved: identity form defined,
    no M3.2 writer emits it yet."""
    return _taxonomy_uid("sector", "taxonomy", label)


def driver_uid(label: str) -> str:
    """Macro driver curated in the theme ontology (related_macro_factors)."""
    return _taxonomy_uid("driver", "ontology", label)


def regime_uid(label: str) -> str:
    """Curated market-regime catalogue label."""
    return _taxonomy_uid("regime", "taxonomy", label)


def narrative_uid(driver_uids: list[str]) -> tuple[str, str]:
    """
    Deterministic narrative identity from its driver set.

    Returns (uid, driver_set_key). The key is the sorted canonical driver UIDs
    joined by '+' (the same construction as the frontend narrativeDerivation
    key); the UID embeds sha256(key)[:16] so it stays short and label-free.
    Member ordering never matters; display titles never participate.
    """
    if not driver_uids:
        raise ValueError("narrative requires a non-empty driver set")
    key = "+".join(sorted(set(driver_uids)))
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]
    return f"narrative:driverset:{digest}", key


def relationship_uid(source_uid: str, relationship_type: str,
                     target_uid: str) -> tuple[str, str, str, str]:
    """
    Deterministic relationship identity.

    Returns (rel_uid, source_uid, target_uid, direction). Directed types keep
    source→target as part of the identity; symmetric types (correlates) order
    endpoints lexically so both assertions resolve to one identity. Recorded
    relationship types are used verbatim — synonyms are never merged.
    """
    parse_uid(source_uid)
    parse_uid(target_uid)
    rtype = (relationship_type or "").strip().lower()
    if not _KEY_RE.match(rtype.replace("_", "-")):
        raise ValueError(f"invalid relationship type: {relationship_type!r}")
    if rtype in SYMMETRIC_RELATIONSHIP_TYPES:
        a, b = sorted((source_uid, target_uid))
        direction = "symmetric"
    else:
        a, b = source_uid, target_uid
        direction = "directed"
    return f"rel:{a}|{rtype}|{b}", a, b, direction


def parse_relationship_uid(rel_uid: str) -> tuple[str, str, str]:
    """rel:{source}|{type}|{target} → (source_uid, type, target_uid)."""
    raw = (rel_uid or "").strip()
    if not raw.startswith("rel:"):
        raise ValueError(f"invalid relationship UID: {rel_uid!r}")
    parts = raw[4:].split("|")
    if len(parts) != 3:
        raise ValueError(f"invalid relationship UID: {rel_uid!r}")
    source, rtype, target = parts
    parse_uid(source)
    parse_uid(target)
    if not rtype:
        raise ValueError(f"invalid relationship UID: {rel_uid!r}")
    return source, rtype, target


def coerce_theme_uid(value: str) -> str:
    """
    Accept either a full canonical theme UID or a bare pipeline theme id and
    return the canonical UID. Used by the read API so both forms are queryable.
    """
    v = (value or "").strip()
    if ":" in v:
        etype, _ns, _key = parse_uid(v)   # raises on invalid
        if etype != ENTITY_TYPE_THEME:
            raise ValueError(f"not a theme UID: {value!r}")
        return v
    return theme_uid(v)
