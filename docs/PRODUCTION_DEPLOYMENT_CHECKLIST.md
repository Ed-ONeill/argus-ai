# Argus Production Deployment Checklist — Private Beta (P2 Sprint 1)

Covers the five Critical launch blockers from `ARGUS_PRODUCTION_READINESS_AUDIT_V1.md`
(PH1 storage, PH2 auth, PH3 saved store, PH4 framework, PH5 startup verification).
Work top to bottom; the backend **refuses to start** in production until PH1/PH2/PH5
are satisfied, so a misconfiguration fails loudly instead of serving insecurely.

---

## 1. Backend service (Railway) — durable storage (PH1 / C5)

Without a volume, Railway's filesystem is ephemeral and every deploy wipes the
identity journal, event registry, and theme memory.

- [ ] **Attach a Volume** to the backend service (Railway dashboard → service →
      Volumes). Mount path e.g. `/data`. Size: start at 1 GB (ledger is < 5 MB/day).
- [ ] Set backend env var **`ARGUS_DATA_DIR=/data`** (must equal the mount path).
      Railway also injects `RAILWAY_VOLUME_MOUNT_PATH`; `ARGUS_DATA_DIR` takes
      precedence and is explicit — set both-agree.
- [ ] Confirm nothing else pins a durable path off-volume: `THEME_MEMORY_DIR`
      should be **unset** (it now defaults onto `ARGUS_DATA_DIR`).

## 2. Backend service — authentication (PH2 / C1, C3)

This project signs access tokens **ES256** (confirmed via the live JWKS). The
backend verifies tokens against the project's **public JWKS** — no secret
required.

- [ ] Set **`SUPABASE_URL`** (Settings → API). This alone enables auth: the
      JWKS URL is derived as `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` and
      the expected issuer as `{SUPABASE_URL}/auth/v1`. In production the service
      **will not boot** unless `SUPABASE_URL` is set and its JWKS is reachable
      with ≥1 signing key.
- [ ] **Do NOT set `SUPABASE_JWT_SECRET`** for this project — it is the legacy
      HS256 path and cannot verify ES256 tokens. (Setting it would enable an
      unused fallback and is unnecessary.)
- [ ] Set **`SUPABASE_ANON_KEY`** = the publishable key (`sb_publishable_…`,
      Settings → API). Used only to *prove* RLS at startup (PH5), never to write.
- [ ] Set **`ARGUS_ENV=production`** — turns on fail-fast startup verification.
- [ ] (Optional) `SUPABASE_JWKS_URL` to override the derived JWKS endpoint;
      `ARGUS_AUTH_DISABLED=true` is an explicit dev-only opt-out.

## 3. Backend service — remaining env

- [ ] `SUPABASE_SERVICE_ROLE_KEY` (already required for the archive; keep
      backend-only, never `NEXT_PUBLIC`).
- [ ] `ALLOWED_ORIGINS` = the deployed frontend origin (e.g.
      `https://argus-frontend.up.railway.app`).
- [ ] LLM backend keys as already configured.

## 4. Frontend service (Railway)

- [ ] **`BACKEND_URL`** = the backend service URL (e.g.
      `https://argus-backend.up.railway.app`). The proxy attaches the user's
      Supabase token to every backend call (PH2).
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by
      design).
- [ ] Redeploy so the **Next.js 15.5.21** upgrade (PH4, closes CVE-2025-29927)
      is live. Middleware auth enforcement is only trustworthy on ≥ 15.2.3.

## 5. Supabase (PH3 / PH5 / C7)

Argus stores **no** user data on the backend anymore — saved research lives in
the RLS-protected `saved_items` table, read/written directly by the client.

- [ ] **Confirm all 6 migrations are actually applied** to the live project
      (schema.sql + 002–006). The backend now probes this at startup: with
      `ARGUS_ENV=production` it issues an anonymous read against a backend table
      and **refuses to boot** if the table is missing (migrations not run) or
      readable by anon (RLS not applied).
- [ ] Verify manually once: an anonymous
      `GET {SUPABASE_URL}/rest/v1/entity_snapshots?select=*&limit=1` (apikey =
      anon key) must return **401/permission-denied**, not `200`.

## 6. First-boot verification (read the logs)

On backend start, confirm these log lines:

- [ ] `[persistence-probe] data dir = /data (source=env, persistent=True, writable=True)`
- [ ] `[readiness] storage            OK — /data ...`
- [ ] `[readiness] auth_config        OK — auth ENFORCED; JWKS reachable with signing keys ...`
- [ ] `[readiness] supabase_security  OK — anon denied on entity_snapshots (RLS in force)`

If any required line reads `FAIL`, the process exits with an actionable message —
fix the corresponding item above and redeploy.

## 7. Prove persistence across a redeploy

- [ ] After first boot, note the `[persistence-probe] marker CREATED by deployment <id>`.
- [ ] Trigger a redeploy. The next boot should log
      `marker SURVIVED redeploy ... storage IS PERSISTENT`. If it logs
      `marker CREATED` again, the volume is not mounted at `ARGUS_DATA_DIR` —
      stop and fix before onboarding users.

---

## Out of scope (later hardening — do NOT block beta on these here)

Rate limiting, health-check wiring/monitoring, Sentry, CSP/security headers,
privacy policy / ToS / cookie banner, the `saved_items` UPDATE policy (M4),
CORS `allow_credentials` hardening (M1). These are High/Medium findings for the
next phase.
