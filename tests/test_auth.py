"""
tests/test_auth.py — PH2 backend authentication, ES256/JWKS (audit C1/C3).

This project signs access tokens ES256 (verified via the live JWKS). Tests use
a throwaway EC P-256 keypair so verification runs fully offline: mint with the
private key, verify with the public key. Covers valid acceptance, every
tampering/expiry/alg-confusion rejection, and the require_user dependency with
an injected signing key.
"""

from __future__ import annotations

import time

import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

from app import auth
from app.auth import AuthError, require_user, verify_supabase_jwt
from app.config import settings

# One keypair for the module; a SECOND, wrong keypair to prove rejection.
_PRIV = ec.generate_private_key(ec.SECP256R1())
_PUB = _PRIV.public_key()
_WRONG_PRIV = ec.generate_private_key(ec.SECP256R1())

ISS = "https://proj.supabase.co/auth/v1"


def _pub_pem() -> bytes:
    return _PUB.public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def _claims(**over) -> dict:
    now = int(time.time())
    base = {"sub": "user-aaa", "aud": "authenticated", "email": "a@test.dev",
            "iss": ISS, "iat": now - 10, "exp": now + 3600}
    base.update(over)
    return base


def mint(claims: dict, *, priv=_PRIV, alg: str = "ES256") -> str:
    return pyjwt.encode(claims, priv, algorithm=alg)


# ── pure verifier ──────────────────────────────────────────────────────────────

def test_valid_es256_token_verifies():
    c = verify_supabase_jwt(mint(_claims()), key=_PUB, expected_iss=ISS)
    assert c["sub"] == "user-aaa" and c["email"] == "a@test.dev"


def test_wrong_key_rejected():
    with pytest.raises(AuthError):
        verify_supabase_jwt(mint(_claims(), priv=_WRONG_PRIV), key=_PUB, expected_iss=ISS)


def test_tampered_token_rejected():
    tok = mint(_claims())
    h, p, s = tok.split(".")
    import base64, json
    forged = base64.urlsafe_b64encode(json.dumps(_claims(sub="EVIL")).encode()).rstrip(b"=").decode()
    with pytest.raises(AuthError):
        verify_supabase_jwt(f"{h}.{forged}.{s}", key=_PUB, expected_iss=ISS)


def test_hs256_token_rejected_on_jwks_path():
    """The RS/HS confusion guard: any HS256 token must be rejected because the
    verifier pins algorithms=["ES256"]. (PyJWT additionally refuses to even
    ENCODE HS256 from a PEM key — defense in depth — so we forge with a plain
    secret and prove the VERIFIER rejects it regardless of the secret.)"""
    forged = pyjwt.encode(_claims(), "attacker-chosen-secret-0123456789abcdef", algorithm="HS256")
    with pytest.raises(AuthError):
        verify_supabase_jwt(forged, key=_PUB, expected_iss=ISS)
    # and explicitly: even if an attacker knew a symmetric key, ES256-only wins
    with pytest.raises(AuthError):
        verify_supabase_jwt(forged, key="attacker-chosen-secret-0123456789abcdef", expected_iss=ISS)


def test_alg_none_rejected():
    import base64, json
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(json.dumps(_claims()).encode()).rstrip(b"=").decode()
    with pytest.raises(AuthError):
        verify_supabase_jwt(f"{header}.{payload}.", key=_PUB, expected_iss=ISS)


def test_expired_token_rejected():
    with pytest.raises(AuthError):
        verify_supabase_jwt(mint(_claims(exp=int(time.time()) - 3600)), key=_PUB, expected_iss=ISS)


def test_wrong_audience_rejected():
    with pytest.raises(AuthError):
        verify_supabase_jwt(mint(_claims(aud="anon")), key=_PUB, expected_iss=ISS)


def test_wrong_issuer_rejected():
    with pytest.raises(AuthError):
        verify_supabase_jwt(mint(_claims(iss="https://evil.example/auth/v1")), key=_PUB, expected_iss=ISS)


def test_missing_exp_rejected():
    c = _claims()
    del c["exp"]
    with pytest.raises(AuthError):
        verify_supabase_jwt(mint(c), key=_PUB, expected_iss=ISS)


def test_list_audience_accepted():
    c = verify_supabase_jwt(mint(_claims(aud=["authenticated", "x"])), key=_PUB, expected_iss=ISS)
    assert c["sub"] == "user-aaa"


# ── require_user dependency (inject the signing key, no network) ────────────────

@pytest.fixture
def auth_on(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://proj.supabase.co")
    monkeypatch.setattr(settings, "argus_auth_disabled", False)
    monkeypatch.setattr(auth, "resolve_signing_key", lambda token: _PUB)


def test_dependency_open_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    u = require_user(authorization=None)
    assert u.authenticated is False and u.user_id == "dev-open"


def test_explicit_disable_forces_open(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://proj.supabase.co")
    monkeypatch.setattr(settings, "argus_auth_disabled", True)
    assert settings.auth_enabled is False
    assert require_user(authorization=None).authenticated is False


def test_dependency_rejects_anonymous_when_enabled(auth_on):
    with pytest.raises(Exception) as ei:
        require_user(authorization=None)
    assert getattr(ei.value, "status_code", None) == 401


def test_dependency_accepts_valid_bearer(auth_on):
    u = require_user(authorization=f"Bearer {mint(_claims())}")
    assert u.authenticated and u.user_id == "user-aaa"


def test_dependency_rejects_bad_scheme_and_bad_token(auth_on):
    for header in ("Basic xyz", "Bearer", "Bearer notatoken", f"token {mint(_claims())}"):
        with pytest.raises(Exception) as ei:
            require_user(authorization=header)
        assert getattr(ei.value, "status_code", None) == 401


def test_key_resolution_failure_fails_closed(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://proj.supabase.co")
    monkeypatch.setattr(settings, "argus_auth_disabled", False)
    def boom(token): raise RuntimeError("JWKS unreachable")
    monkeypatch.setattr(auth, "resolve_signing_key", boom)
    with pytest.raises(Exception) as ei:
        require_user(authorization=f"Bearer {mint(_claims())}")
    assert getattr(ei.value, "status_code", None) == 401


def test_identity_is_per_token(auth_on):
    a = require_user(authorization=f"Bearer {mint(_claims(sub='user-A'))}")
    b = require_user(authorization=f"Bearer {mint(_claims(sub='user-B'))}")
    assert a.user_id == "user-A" and b.user_id == "user-B"
