"""
app/auth.py — backend authentication (PH2, audit C1/C3).

No backend route may trust the frontend's word that a user is authenticated.
This module independently verifies the Supabase access token (a JWT) that the
Next.js proxy forwards as `Authorization: Bearer <token>`, and exposes ONE
FastAPI dependency — `require_user` — that protected routers hang off of.

THIS PROJECT SIGNS ACCESS TOKENS ASYMMETRICALLY (ES256). Verification fetches
the project's public keys from its JWKS
(`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`), selects the key by the token
header's `kid` (handling key rotation — Supabase publishes current + standby
keys), and verifies the ES256 signature with PyJWT. Confirmed 2026-07-25 via
the live JWKS (single ES256 EC P-256 key, no transition).

Hardening:
  * algorithms are PINNED to ES256 ONLY. HS256 is never accepted on the JWKS
    path — allowing a symmetric alg alongside published public keys reopens the
    RS/HS confusion attack (signing an HS256 token using the public key bytes
    as the HMAC secret). alg:none is likewise rejected.
  * aud must be "authenticated"; iss must equal `{SUPABASE_URL}/auth/v1`
    (derived from the same URL that anchors the JWKS, so correct by
    construction); exp/nbf/iat validated with a small leeway; sub required.
  * any failure → 401, fail closed. Key-resolution/network failures also 401.

Enablement: auth is ON whenever SUPABASE_URL is configured (JWKS is public — no
secret needed). Absent in a non-prod env (local dev, the test suite) → auth
disabled, requests pass as an unauthenticated dev principal. Production startup
(PH5) requires SUPABASE_URL + a reachable JWKS, so the disabled path can never
reach a real deployment. `ARGUS_AUTH_DISABLED=true` is an explicit dev opt-out.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import jwt as pyjwt
from fastapi import Depends, Header, HTTPException, status
from jwt import InvalidTokenError, PyJWKClient

from app.config import settings

log = logging.getLogger(__name__)

_LEEWAY_SECONDS = 30
_EXPECTED_AUD = "authenticated"
# ES256 ONLY on the JWKS path (RS/HS confusion + alg:none guard). Add "RS256"
# only for a project known to use RSA signing keys.
_ALGORITHMS = ["ES256"]


class AuthError(Exception):
    """Raised by the pure verifier; the dependency maps it to HTTP 401."""


@dataclass(frozen=True)
class AuthedUser:
    user_id: str          # Supabase auth.users id (the JWT `sub`)
    email: str | None
    authenticated: bool   # False only on the dev/test open path
    claims: dict


# ── JWKS key resolution (cached, rotation-aware) ──────────────────────────────

_jwk_clients: dict[str, PyJWKClient] = {}


def _jwk_client() -> PyJWKClient:
    url = settings.jwks_url
    if not url:
        raise AuthError("JWKS URL not configured")
    client = _jwk_clients.get(url)
    if client is None:
        # PyJWKClient caches keys and refreshes on an unknown kid, which is
        # exactly the rotation behavior we want.
        client = PyJWKClient(url, cache_keys=True, lifespan=600)
        _jwk_clients[url] = client
    return client


def resolve_signing_key(token: str):
    """Return the public key that signed `token`, selected by its `kid` from
    the project JWKS. Overridden in tests to avoid network."""
    return _jwk_client().get_signing_key_from_jwt(token).key


# ── pure verifier (offline-testable: caller supplies the key) ─────────────────

def verify_supabase_jwt(
    token: str,
    *,
    key,
    expected_aud: str = _EXPECTED_AUD,
    expected_iss: str | None = None,
    algorithms: list[str] | None = None,
) -> dict:
    """Verify a Supabase ES256 JWT against `key` (a public key) and return its
    claims, or raise AuthError. Pure — no settings, no network — so tests pass
    a throwaway EC public key."""
    try:
        claims = pyjwt.decode(
            token,
            key,
            algorithms=algorithms or _ALGORITHMS,
            audience=expected_aud,
            issuer=expected_iss,       # None → issuer check skipped
            leeway=_LEEWAY_SECONDS,
            options={"require": ["exp", "aud", "sub"]},
        )
    except InvalidTokenError as exc:
        raise AuthError(str(exc)) from exc
    if not claims.get("sub"):
        raise AuthError("missing subject")
    return claims


# ── FastAPI dependency ────────────────────────────────────────────────────────

_UNAUTH = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Authentication required.",
    headers={"WWW-Authenticate": "Bearer"},
)


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
        return parts[1].strip()
    return None


def require_user(authorization: str | None = Header(default=None)) -> AuthedUser:
    """Dependency for protected routers. 401 on any missing/invalid token when
    auth is enabled; a dev principal when auth is disabled (non-prod, no URL)."""
    if not settings.auth_enabled:
        # Disabled only ever in dev/test — production enforces SUPABASE_URL +
        # reachable JWKS at startup (PH5), so this branch cannot run in a real
        # deployment.
        return AuthedUser(user_id="dev-open", email=None, authenticated=False, claims={})

    token = _bearer(authorization)
    if not token:
        raise _UNAUTH
    try:
        key = resolve_signing_key(token)
        claims = verify_supabase_jwt(
            token, key=key, expected_iss=settings.expected_issuer or None)
    except AuthError as exc:
        # Never echo the reason to the caller (no oracle); logs get the detail.
        log.info("[auth] token rejected: %s", exc)
        raise _UNAUTH
    except Exception as exc:  # key resolution / JWKS fetch failure → fail closed
        log.warning("[auth] verification error (failing closed): %r", exc)
        raise _UNAUTH
    return AuthedUser(
        user_id=str(claims["sub"]),
        email=claims.get("email"),
        authenticated=True,
        claims=claims,
    )


# Convenience alias for router `dependencies=[...]` lists where the value is
# not consumed (auth is a gate, not an argument).
RequireAuth = Depends(require_user)
