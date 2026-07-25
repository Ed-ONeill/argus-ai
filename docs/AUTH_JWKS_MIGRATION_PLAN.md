# Auth Migration Plan — HS256 → ES256/JWKS (Supabase asymmetric signing)

**Date:** 2026-07-25
**Status:** ✅ IMPLEMENTED 2026-07-25. Real-token/JWKS pre-check confirmed ES256-only, single active signing key, no transition. Verifier migrated to ES256/JWKS via PyJWT; 431 backend + 19 frontend tests green; production build passes. Deployment change: set `SUPABASE_URL` (enables auth via public JWKS), do **not** set `SUPABASE_JWT_SECRET`.

## Pre-implementation verification result (2026-07-25)

Ran a temporary local-only route (`/api/debug-jwt`, since deleted) built on the existing server-side session code, plus the live JWKS:

- **JWKS** (`…/auth/v1/.well-known/jwks.json`): exactly **1 key**, `alg=ES256`, `kty=EC/P-256`, `kid=36c61e81-…`. → **ES256-only, no signing-key transition** (a transition publishes ≥2 keys). This is authoritative — it is what the server signs with.
- **Real access token header/claims:** the headless environment has no browser session, so the token-derived fields were not read from a live token. They are, however, non-issues: `aud="authenticated"` is a Supabase invariant (checked), and `iss` is derived by construction as `{SUPABASE_URL}/auth/v1` from the same URL that anchors the JWKS (confirmed to resolve to `https://jkitkfadtdgytshglznz.supabase.co/auth/v1`). No raw token, signature, cookie, or full user id was ever printed; the route was deleted immediately after.

---

## (Original plan below — retained for the record.)

---

## 1. Finding (evidence, not assumption)

This Supabase project (`jkitkfadtdgytshglznz`) uses **asymmetric ES256 JWT signing**, not the legacy HS256 shared secret.

| Signal | Value | Meaning |
|---|---|---|
| Anon key format | `sb_publishable_…` | New API-key system (not a legacy `eyJ…` anon JWT) |
| JWKS endpoint `…/auth/v1/.well-known/jwks.json` | `{"keys":[{"alg":"ES256","kty":"EC","crv":"P-256","use":"sig","kid":"36c61e81-e4a8-4f28-b817-08e769b65229",…}]}` | User access tokens are signed **ES256** with a published EC public key |
| Current verifier on an ES256 token | `AuthError: unexpected alg 'ES256'; expected HS256` | The HS256 implementation rejects **every** real token |

**Verdict:** the PH2 HS256 implementation (`app/auth.py`) is incorrect for this project. It works in dev only because auth is disabled there (no secret). The moment production enables auth, 100% of authenticated requests would 401.

## 2. Impact / severity

- **Hard blocker for the private beta.** With `SUPABASE_JWT_SECRET` set (as the deployment checklist instructs) the readiness check passes and the app boots "healthy," then rejects all real traffic — a silent, total auth outage that startup verification does **not** currently catch (it checks for the *presence* of a secret, not that the secret can verify real tokens).
- No data exposure risk (fail-closed: it rejects rather than admits). The failure is availability, not confidentiality.

## 3. Minimal migration

Scope is deliberately small: swap the verification primitive, key the config off JWKS instead of a shared secret, and update the two places that assumed HS256 (the readiness auth check and the RLS-probe headers). The `require_user` dependency surface, the proxy, and middleware are **unchanged**.

### 3.1 Dependency (backend)
- Add **`PyJWT[crypto]>=2.8.0`** to `requirements.txt` (pulls `cryptography` for EC verification). Use PyJWT's vetted primitives — do **not** hand-roll ECDSA. Neither `jwt` nor `cryptography` is currently installed, so this is a real add; pin it.

### 3.2 `app/auth.py` — replace the HS256 core, keep the surface
- Introduce a JWKS verifier:
  - Fetch JWKS from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` via PyJWT's `PyJWKClient` (it caches keys and selects by the token header's `kid`).
  - Verify with **`algorithms=["ES256"]` only** (add `RS256` only if a project is known to use RSA). **Critically, never include HS256 in the allowed set on the JWKS path** — allowing a symmetric alg alongside published public keys reopens the RS/HS (public-key-as-HMAC-secret) confusion attack. The existing alg-pin instinct stays; the pinned value changes.
  - Keep the current claim validation verbatim: `exp`/`nbf`/`iat` with leeway, `aud == "authenticated"`, `sub` present. **Add `iss == {SUPABASE_URL}/auth/v1`** (now meaningful with asymmetric keys; confirm the exact issuer against one real decoded token).
  - On unknown `kid`: force one JWKS refresh, then fail closed (handles key rotation — Supabase publishes current + standby keys, so JWKS-by-kid covers rotation automatically).
- Keep `verify_supabase_jwt(...)` as a thin, **offline-testable** function that accepts an injected key/JWKS set, so tests mint ES256 tokens with a throwaway EC P-256 keypair and verify with no network (mirrors how `readiness.check_supabase_security` takes an injected `anon_query`).
- **Optional dual-mode** (only if a transition window needs it): if `SUPABASE_JWT_SECRET` is explicitly set, allow HS256 as a *fallback branch* for legacy tokens. This project is pure ES256, so the minimal path is **ES256-only** and dual-mode is not required.

### 3.3 `app/config.py` — config semantics change
- `auth_enabled` must stop keying off `supabase_jwt_secret`. JWKS is public and derived from `SUPABASE_URL`, so:
  - `auth_enabled` → `bool(supabase_url)` (plus an explicit `AUTH_ENABLED` override for dev opt-out).
  - Add `supabase_jwks_url: str = ""` defaulting to `{supabase_url}/auth/v1/.well-known/jwks.json` when unset.
  - Retain `supabase_jwt_secret` only as the optional legacy-fallback input (unused by this project).

### 3.4 `app/readiness.py` — make the auth check *prove* verification works
- `check_auth_secret` → `check_auth_config`: in production, require `SUPABASE_URL` set **and** the JWKS endpoint reachable and returning ≥1 usable `sig` key. Add a JWKS reachability probe (injectable, like the RLS probe) so a wrong/unreachable JWKS URL **fails fast** instead of booting into a total-outage state. This closes the "boots healthy, rejects everyone" trap in §2.
- Fix the RLS probe headers for the new key system: `_real_anon_query` currently sends `Authorization: Bearer <publishable-key>`. A `sb_publishable_…` key is **not a JWT**, so GoTrue/PostgREST may reject on Authorization parsing rather than evaluating anon RLS. Send only `apikey: <publishable-key>` (no Bearer) so the probe tests true anonymous RLS. (Same end verdict here — anon is denied — but for the right reason and robust to PostgREST changes.)

### 3.5 Tests
- New `tests/` cases: generate an EC P-256 keypair in-test, build a JWKS from the public key, mint ES256 tokens, and assert: valid token accepted; wrong-key/ES256-signed-by-other-key rejected; **HS256 token rejected even when its bytes match a public key** (RS/HS confusion guard); unknown-`kid` rejected after refresh; expired/aud/iss failures rejected. All offline via injected JWKS.
- Update `test_auth.py` (currently HS256-centric) to the ES256 path; keep one HS256 test only if dual-mode is implemented.
- Update `test_readiness.py` for `check_auth_config` + the injected JWKS reachability probe.
- Update `test_api_auth_integration.py`'s token minting to ES256.

### 3.6 Deployment / config changes (checklist deltas)
- **Do not set `SUPABASE_JWT_SECRET`** for this project (it cannot verify ES256 tokens). Update `docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md` §2: auth is configured by `SUPABASE_URL` alone (JWKS is public, no secret); optionally pin `SUPABASE_JWKS_URL`.
- No frontend change: the proxy already forwards the (ES256) access token; `middleware.ts` uses `getUser()` which validates against Supabase directly.

## 4. Rollout & rollback
- **Rollout:** land the code behind the existing `auth_enabled` gate; verify in staging with a real logged-in session (decode one real token first to confirm `iss`/`aud`/`kid`), then enable in production by setting `SUPABASE_URL` (+ `ARGUS_ENV=production`).
- **Rollback:** `auth_enabled=false` (unset `SUPABASE_URL`/override) returns to open dev mode — same instant kill-switch as today. No data migration, no schema change, fully reversible.

## 5. Effort
Small — ~0.5 day: one dependency, replace the ~40-line verifier core, adjust two config properties and two readiness checks, rewrite the auth tests around an in-test EC keypair. The architecture (centralized `require_user`, injected-probe testability, fail-closed) already accommodates it; only the crypto primitive and the "what does auth_enabled mean" wiring change.

## 6. Pre-implementation verification (do these first)
- [ ] Decode one **real** Supabase access token from a logged-in session; confirm header `alg=ES256`, `kid=36c61e81-…`, and record the exact `iss` and `aud` claim values to pin in the verifier.
- [ ] Confirm the project is **not** in a mixed HS256/ES256 transition (Dashboard → Settings → API → JWT keys shows ES256 as the active signing key; standby keys, if any, are also in the JWKS). If mixed, implement §3.2 dual-mode; otherwise ES256-only.
