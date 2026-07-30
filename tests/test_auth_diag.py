"""
tests/test_auth_diag.py — verifies the TEMPORARY sanitized auth diagnostics
classify boundaries correctly (production 401 investigation). No secrets are
logged; these assert the reason codes / token-shape decode are right.
"""

from __future__ import annotations

import base64
import json
import time

import jwt as pyjwt
from jwt.exceptions import (
    DecodeError, ExpiredSignatureError, InvalidAlgorithmError,
    InvalidAudienceError, InvalidIssuerError, InvalidSignatureError,
    PyJWKClientError,
)

from app.auth import _auth_scheme, _reason_code, _token_diag


def _hs256(**over) -> str:
    claims = {"sub": "user-1", "aud": "authenticated", "exp": int(time.time()) + 3600,
              "iss": "https://jkitkfaddtgytshglznz.supabase.co/auth/v1", **over}
    return pyjwt.encode(claims, "shared-secret", algorithm="HS256")


def _b64(obj: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()


def _es256_headerish() -> str:
    # Raw JWT whose header advertises ES256 + a kid. The diagnostic decode is
    # signature-free, so an unsigned token is sufficient to exercise it.
    header = {"alg": "ES256", "kid": "abc123", "typ": "JWT"}
    claims = {"sub": "u", "aud": "authenticated", "exp": int(time.time()) + 60,
              "iss": "https://jkitkfaddtgytshglznz.supabase.co/auth/v1"}
    return f"{_b64(header)}.{_b64(claims)}.sig"


class TestTokenDiag:
    def test_hs256_token_reports_alg_hs256_no_kid(self):
        d = _token_diag(_hs256())
        assert d["alg"] == "HS256"
        assert d["kid_present"] is False
        assert d["aud"] == "authenticated"
        assert d["sub_present"] is True
        assert d["iss_host"] == "jkitkfaddtgytshglznz.supabase.co"
        assert d["exp_status"] == "valid"

    def test_es256_header_reports_alg_and_kid(self):
        d = _token_diag(_es256_headerish())
        assert d["alg"] == "ES256"
        assert d["kid_present"] is True

    def test_expired_token_exp_status(self):
        d = _token_diag(_hs256(exp=int(time.time()) - 10))
        assert d["exp_status"] == "expired"

    def test_none_and_garbage_never_raise(self):
        assert _token_diag(None)["alg"] == "none"
        assert _token_diag("not-a-jwt")["alg"] == "none"


class TestReasonCode:
    def test_expired(self):
        assert _reason_code(ExpiredSignatureError("Signature has expired")) == "expired"

    def test_audience(self):
        assert _reason_code(InvalidAudienceError("Invalid audience")) == "audience_invalid"

    def test_issuer(self):
        assert _reason_code(InvalidIssuerError("Invalid issuer")) == "issuer_invalid"

    def test_signature(self):
        assert _reason_code(InvalidSignatureError("Signature verification failed")) == "signature_invalid"

    def test_invalid_algorithm_type(self):
        assert _reason_code(InvalidAlgorithmError("The specified alg value is not allowed")) == "invalid_algorithm"

    def test_invalid_algorithm_message(self):
        # generic InvalidTokenError-style message about alg not allowed
        assert _reason_code(pyjwt.InvalidTokenError("The specified alg value is not allowed")) == "invalid_algorithm"

    def test_jwks_key_not_found(self):
        assert _reason_code(PyJWKClientError("Unable to find a signing key that matches: 'kid'")) == "jwks_key_not_found"

    def test_malformed(self):
        assert _reason_code(DecodeError("Not enough segments")) == "malformed_token"

    def test_missing_subject(self):
        from app.auth import AuthError
        assert _reason_code(AuthError("missing subject")) == "missing_subject"


class TestAuthScheme:
    def test_bearer(self):
        assert _auth_scheme("Bearer abc.def.ghi") == "Bearer"

    def test_other(self):
        assert _auth_scheme("Basic dXNlcjpwYXNz") == "other"

    def test_none(self):
        assert _auth_scheme(None) == "none"
        assert _auth_scheme("") == "none"
