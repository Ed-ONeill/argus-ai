# Argus Security Hardening Backlog — v1

A concise, phased implementation plan derived from the v3 security audit. Each phase
is a small, independently reviewable change (a few files). The process per phase is:

1. Claude implements the phase.
2. Codex reviews **only** that change.
3. Claude fixes anything Codex flags.
4. Codex returns **PASS**.
5. Commit.
6. Move to the next phase.

Severity legend: **High** = blocks external launch · **Med** = fix before scale ·
**Low** = hardening. Change type: `code` · `supabase` · `railway` · `dns` · `ops` · `legal`.

Every finding below was verified against repository source and the installed
`@supabase/ssr@0.10.0` package. Line numbers are current as of this writing; re-confirm
before editing.

---

## Phase 1 — activation-debug must not mutate global state · High · `code`

**Confirmed issue.** `GET /api/feed/activation-debug?refresh=true` re-runs theme/industry
extraction, **swallows any failure to empty lists**, then persists those (possibly empty)
results onto the **shared, global** cache entry. Any authenticated user — or a cross-site
CSRF navigation via the cookie→Bearer proxy fallback — can therefore blank out themes and
industries for **all** users. It is a state-changing GET on a debug endpoint.

**Why it matters.** Global data-integrity destruction with trivial reach. A partial
upstream failure during a single debug call silently overwrites good global intelligence
with `[]`. This is the highest-integrity, lowest-effort defect in the audit.

**Evidence.** `api/routes/feed.py:829` (route), `:864–887` (mutation + `feed_cache.set`),
`:872–882` (except → `[]`). Router is already auth-gated (`api/main.py:196`), so this is an
*integrity/CSRF* defect, not an authn gap. Frontend never calls it (grep: no references).

**Exact implementation.** Make the endpoint **read-only**: remove the `refresh` query
parameter and the entire cache-mutating block; return current cached
`theme_intelligence`/`industry_activation` only. One file: `api/routes/feed.py`.

**Phase 1 invariant (scoped to this endpoint).** `GET /api/feed/activation-debug`,
including requests containing `?refresh=true`, is read-only and cannot invoke extraction
or mutate the feed cache. Full feed refresh remains available through the main feed
endpoint; its failure and cache-replacement behavior is outside `activation_debug`'s
read-only contract and is tracked separately in this backlog. In particular, the separate
`force_refresh` path can still persist empty results when extraction fails
(`run_pipeline()` catches theme/activation failures, substitutes empty arrays, and returns
successfully; `_run_inline()` may then persist that result) — that remains a later
hardening item and is **not** addressed in Phase 1.

**Regression risks.** Callers passing `?refresh=true` still succeed (FastAPI ignores
unknown query params) but no longer trigger a recompute — acceptable, as no caller relies
on it. `data_source` is now always `"cached"`.

**Tests.** `tests/test_feed_activation_debug.py` — isolated via an in-memory fake cache
(no disk, no production singleton), with an autouse guard asserting nothing under
`data/feed_cache/` is created or modified. Coverage: (a) the endpoint returns cached data
without calling `feed_cache.set`; (b) **deep value equality** — a `deepcopy` baseline is
taken, `activation_debug` is called twice, and the complete entry plus every nested
structure (themes/activations/clusters/sector) remains equal by value, protecting against
in-place mutation (not a byte-serialization check); (c) `?refresh=true` is inert (no write,
no 422, extraction never invoked); (d) the full response-shape contract (exact top-level
keys + types + nested keys) and the cold-cache contract; (e) an HTTP-level authenticated
request via the FastAPI dependency-override pattern (`require_user` not weakened).

**Rollback plan.** **Rollback must never restore extraction or `feed_cache.set` behavior to
the GET endpoint.** If this change must be backed out, keep the endpoint read-only and
instead disable it — return a temporary 404/503 or remove the route — or revert only
non-security compatibility details (e.g., response wording) while preserving the read-only
contract. Do not `git revert` to the prior mutating implementation.

**Codex verification checklist.**
- [ ] No code path in `activation_debug` writes to `feed_cache`.
- [ ] No path in `activation_debug` (including `?refresh=true`) persists empty/partial results or mutates the cache.
- [ ] `extract_themes`/`compute_industry_activation` are not invoked from this endpoint.
- [ ] Read-only debug output is unchanged in shape.
- [ ] `get_feed?force_refresh` still provides the re-extraction capability (its own hardening is a separate backlog item).

---

## Phase 2 — transport validation for bearer forwarding · High · `code` (+ `railway`/`dns` verification)

**Status: implemented locally (not committed/deployed).** Railway had a platform-wide
deployment incident during this phase, so Phase 2 remains local until Phase 1 is confirmed
healthy in production.

**Confirmed issue.** The proxy decided redirect safety on **host only**; a same-host
`Location: http://…` re-sent `Authorization: Bearer` over cleartext. The **initial** hop also
inherited `BACKEND_URL`'s scheme — a public-HTTP upstream leaks the token before any redirect,
and HTTP→HTTPS redirecting does **not** retroactively make that first plaintext hop safe.

**Why it matters.** Plaintext bearer exposure = full session takeover on any network hop.

**Evidence.** `frontend/src/app/api/[...path]/route.ts` — old `fetchFollowingSameHost` compared
`next.host !== new URL(url).host` (scheme ignored) and followed same-host downgrades "WITH the
Authorization header intact"; the initial scheme came straight from `BACKEND_URL`.

**Exact implementation.** New pure, network-free helper
`frontend/src/lib/backendTransport.ts` answers three questions:
`isSafeInitialDestination(url, policy)`, `evaluateRedirect(from, to, policy)`,
`isApprovedPrivateHttpHost(url, policy)`, and drives `secureBackendFetch(...)` (redirect
follower with an injected `fetchImpl`). The proxy (`route.ts`) now:
1. builds a policy via `transportPolicyFromEnv()`;
2. **refuses an unsafe initial destination before any session read or fetch** (early guard) —
   returns a normalized 502;
3. delegates redirect-following to `secureBackendFetch`, which revalidates every hop and
   refuses unsafe hops *before* issuing the next request (the bearer never reaches an unsafe
   URL), returning a normalized 502.

Transport rules: **HTTPS always allowed**; **HTTP allowed only** for an allowlisted private
host, `*.railway.internal`, or loopback in dev/test; **HTTPS→HTTP downgrade rejected** even
same-host; **cross-host never receives Authorization**; **HTTP→HTTPS** is an upgrade of an
already-safe request (never a fix for an unsafe initial); **malformed URLs fail closed**; the
**hop limit (5) is preserved** and **exhausting it while still redirecting fails closed**
(`too-many-redirects` → normalized 502; the final unchecked `Location` is **never** forwarded
to the browser, and no further fetch occurs). **IPv6 loopback** hostnames (WHATWG returns
`[::1]`) are bracket-normalized before comparison, so `http://[::1]:…` follows the same
dev-only / allowlist rules as `127.0.0.1`.

**Configuration mechanism for approved internal HTTP.**
- `BACKEND_INTERNAL_HTTP_HOSTS` — comma-separated exact `hostname` or `hostname:port` entries
  permitted over HTTP (case-insensitive, exact match — never a substring test).
- `*.railway.internal` — recognized structurally (exact dotted-suffix at a label boundary) as
  Railway private networking; documented platform domain, not a hardcoded personal hostname.
- Loopback (`localhost`/`127.0.0.1`/`::1`) over HTTP is a **development/test-only** exception;
  in production it is refused unless explicitly listed in `BACKEND_INTERNAL_HTTP_HOSTS`.

**Regression risks.** Preserved and covered by tests: client-Bearer precedence, cookie→Bearer
fallback, backend response/Set-Cookie forwarding, methods/bodies, 307/308 same-host replay,
canonical trailing-slash redirects, and `http://localhost` dev. No change to cookie `Secure`,
anti-cache propagation, cache policy, body-size, or rate limiting (later phases).

**Tests.**
`frontend/src/lib/__tests__/backendTransport.test.ts` — initial-destination matrix (incl. IPv6
loopback: `http://[::1]:…` dev-allowed, prod-rejected, prod-allowlisted-allowed), redirect
matrix, private-host recognition, and `secureBackendFetch` behavior: zero fetch on unsafe
initial; no second fetch on downgrade / cross-host / malformed; auth preserved on a safe
same-host redirect; and **redirect exhaustion fails closed** (`too-many-redirects`, exactly
`maxHops+1` fetches, no success).
`frontend/src/app/api/[...path]/__tests__/route.test.ts` — through the real route:
(A) an unsafe public-HTTP initial destination returns 502 and makes **no `fetch`, no
`createClient`, no `getSession`** (guard precedes session access); (B) a safe same-host 307
preserves **method, body bytes, and Authorization** on the followed hop (POST); (C) upstream
**Set-Cookie, Content-Type, and a custom header are forwarded**; (D) downgrade and cross-host
redirects return 502 with a single fetch and **no forwarded `Location`**; (E) redirect
exhaustion returns 502, bounded at 6 fetches, **no forwarded `Location`**; plus client-Bearer
precedence and cookie-session fallback on a safe destination.

**Rollback plan.** **Rollback must fail closed — it must never restore unconditional same-host
bearer forwarding or scheme-downgrade forwarding.** If backed out, keep the initial-destination
guard and cross-host/downgrade refusal; at most relax the private-host *configuration* (e.g.
widen the allowlist) — never the scheme/downgrade rules. Do not `git revert` to the
host-only `fetchFollowingSameHost`.

**Production verification still required (`railway`/`dns`).** Source validation does **not**
prove the deployed backend endpoint is actually private. Verify the real Railway `BACKEND_URL`
scheme, that every redirect hop stays same-host and non-downgrading, and that any HTTP upstream
is a genuinely private (`*.railway.internal` / allowlisted) address — see §Q of the audit.

**Codex verification checklist.**
- [ ] Bearer never sent to a public HTTP destination (initial or any redirect hop).
- [ ] HTTPS→HTTP downgrade and cross-host redirects refused before the next fetch.
- [ ] Redirect-limit exhaustion fails closed (502) and never forwards the final `Location`.
- [ ] IPv6 loopback (`[::1]`) normalized; dev-only unless allowlisted, like `127.0.0.1`.
- [ ] Loopback allowed in dev only; `*.railway.internal`/allowlist allowed; public HTTP fails closed.
- [ ] Initial transport guard runs before `createClient`/`getSession`.
- [ ] Client-Bearer precedence and cookie fallback preserved; method/body preserved on safe 307/308.
- [ ] Set-Cookie and response headers forwarded; malformed initial/redirect URLs fail closed.

---

## Phase 3 — Supabase cookie `Secure` + anti-cache header propagation · High · `code`

**Status: implemented locally (not committed/deployed).**

**Confirmed issue.** (a) The session cookie carries **no `Secure`** attribute (package default
sets none; Argus adds no override). (b) `@supabase/ssr` passes anti-cache headers via the
`setAll(cookies, headers)` **second argument**; Argus's callbacks ignore it, so session-refresh
/ session-establishment responses ship without `no-store`. (c) The middleware's unauthenticated
`/auth` redirect discarded the pending `setAll` cookie mutations entirely (including Supabase
**clearing** an invalid session), so a stale invalid cookie could persist.

**Why it matters.** Without `Secure`, the cookie can transit HTTP (deployment-conditional).
Without the anti-cache headers, a cached session-bearing response can leak one user's session to
another (needs a shared cache). Dropping the clearing cookie on the redirect leaves an
invalidated session live in the browser.

**Evidence.** Defaults `@supabase/ssr/dist/main/utils/constants.js:4-11` (no `secure`, `maxAge`
400d, `sameSite:lax`, `httpOnly:false`); headers source `.../cookies.js:334-348`; dropped at
`frontend/src/middleware.ts:15` and `frontend/src/lib/supabase/server.ts:22`; the redirect
branch dropping cookies at `frontend/src/middleware.ts` (old `return NextResponse.redirect`).
Verified merge: `cookies.js:320-333` computes `{...DEFAULT_COOKIE_OPTIONS, ...cookieOptions,
maxAge}`, so passing only `{secure}` preserves the other attributes.

**Exact implementation.**
- **Production-build-gated `Secure`, all three factories** (`client.ts`, `server.ts`,
  `middleware.ts`): `cookieOptions: { secure: process.env.NODE_ENV === "production" }` — **never**
  `location.protocol`; pass **only** `secure` (no `name`, no storage-key change). Fail-closed:
  in production a page reached over HTTP simply cannot persist the cookie.
- **Middleware response preservation** (`middleware.ts`): accumulate the pending `setAll` cookie
  mutations **and** all three anti-cache headers (`Cache-Control`, `Expires`, `Pragma`) across
  **multiple** `setAll` calls (Supabase may call it more than once) — **last-write-wins per cookie
  identity** (`name` + `path` + `domain`, via a `Map`), latest value per header name — and apply
  them **exactly once** via one `applyPending()` helper to **whichever** response is returned —
  the authed pass-through **and** the unauthenticated `/auth` redirect. No-op when `setAll` never
  ran (page caching preserved). Matcher, gate logic, and redirect target unchanged.
- **Auth callback** (`auth/callback/route.ts`): on success set the full anti-cache set
  (`Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0`,
  `Pragma: no-cache`) on the redirect that carries the session `Set-Cookie`. Failure/no-code
  path unchanged (`/auth?error=auth_failed`, no cookie).
- **`server.ts` is NOT re-architected** to return response headers (avoids Server-Component /
  read-only-cookie breakage). Its two consumers are the callback (handled above) and the proxy
  (**Phase 4**). Preserves HttpOnly=false, SameSite=Lax, Path=/, chunking, Max-Age, deletion.

**Regression risks.** Local HTTP dev must not set `Secure` (gated on `NODE_ENV`); browser
singleton preserved and no storage-key change; delete cookies follow the same env rule;
middleware adds headers **only** when `setAll` ran; no double-set cookies; redirect target and
gate logic unchanged.

**Tests (implemented).**
- `frontend/src/lib/supabase/__tests__/effectiveCookies.test.ts` — **effective serialized cookies
  driven through the REAL installed `@supabase/ssr` pipeline** (no manual `DEFAULT_COOKIE_OPTIONS`
  merge): real `setSession` produces SET (normal) and **chunked** SET cookies; real `signOut`
  produces **chunked** DELETE cookies. Asserts each serialized cookie: `Secure` present in prod /
  absent in dev, `SameSite=Lax`, `Path=/`, `Max-Age` (default on set, 0 on delete), no `HttpOnly`.
- `frontend/src/lib/supabase/__tests__/cookieOptions.test.ts` — **supplemental** factory-option
  capture (each factory passes `{ secure: NODE_ENV==="production" }`, only `secure`, no `name`) +
  browser singleton + env isolation.
- `frontend/src/__tests__/middleware.test.ts` — (A) authed refresh keeps every cookie + all three
  headers; (B) `setAll` then unauth redirect retains the clearing cookie + all three headers,
  target unchanged; (C) no `setAll` → nothing added; (D) multiple cookies in one call, no
  duplicates; (E) **accumulation across two separate `setAll` calls** (last-write-wins: updated
  cookie once, untouched cookie preserved, new cookie added, no stale duplicate, latest headers) —
  on **both** the authed and the unauth-redirect branch; (F) middleware passes
  `cookieOptions:{secure:true}` in prod / `{secure:false}` in dev (removing `cookieOptions` fails).
- `frontend/src/app/auth/callback/__tests__/route.test.ts` — success: the **actual returned
  response** (via a cookies()→response glue harness) carries `Location`, the session `Set-Cookie`,
  and all three anti-cache headers, and `createClient` is called once; failure → error redirect,
  no `Set-Cookie`; **no-code → error redirect, no `Set-Cookie`, `createClient` never called**.

**Rollback plan.** Revert per file; the four changes are independent. Reverting must not
reintroduce the redirect-branch cookie loss if only the `Secure`/header changes are backed out.

**Deployment facts (verification required, not source-provable).** Actual prod `Set-Cookie`
attributes; whether the frontend is ever HTTP-reachable; **HSTS** — the repo does not configure
it and whether an edge/CDN/proxy enforces it is a deployment fact to inspect; whether any
CDN/edge caches a `Set-Cookie`-bearing response. Proxy Set-Cookie/cache policy remains **Phase
4**; general security-header/HSTS work remains **Phase 11**.

**Codex verification checklist.**
- [ ] `Secure` set in prod (set/delete/chunked), absent in dev; `HttpOnly=false`, `SameSite=Lax`, `Path=/`, `Max-Age` intact — proven through the **real `@supabase/ssr` pipeline**.
- [ ] Secure decision is `NODE_ENV`-gated, never `location.protocol`; production-over-HTTP persists no cookie; middleware Secure config directly tested (prod/dev).
- [ ] Middleware accumulates across **multiple** `setAll` calls (last-write-wins per name+path+domain, no duplicates) and preserves cookies + `Cache-Control`/`Expires`/`Pragma` on **both** the authed response and the `/auth` redirect; no headers when `setAll` didn't run.
- [ ] Auth-callback success carries the session `Set-Cookie` + all three headers on the **actual returned response**; `createClient` called once; no-code path never calls `createClient`; failure unchanged.
- [ ] `server.ts` not re-architected; browser singleton and storage key unchanged; proxy cache is Phase 4.

---

## Phase 4 — proxy caching rules for cookie-refresh-capable responses · High · `code`

**Status: implemented locally (not committed/deployed).**

**Confirmed issue.** The catch-all proxy adds **no** cache policy and forwards backend
`Cache-Control`/`Expires`/`Pragma` verbatim. Every request it serves is either authenticated
(client Bearer) or runs the cookie→bearer fallback, whose `getSession()` can **refresh** an
expired session or **clear** an invalid one and emit `Set-Cookie` (appended by the Next route
runtime after the handler returns). `Set-Cookie` does **not** by itself prevent caching — an
otherwise-storable response carrying a session cookie can be stored and replayed — so the
absence of explicit `private, no-store` is a **source-level** risk (deployment decides whether a
given Railway/CDN/edge actually caches it).

**Why it matters.** Shared caching of a session-touching response bleeds sessions across users.

**Evidence.** Cookie→Bearer fallback `frontend/src/app/api/[...path]/route.ts:81–91`
(`getSession` at :85); backend refresh/clear via auth-js `GoTrueClient.js:2361`; headers
forwarded at `route.ts:166–169`. Backend currently sets **no** `Cache-Control` and **no**
`Set-Cookie` (verified) — backend cookie/cache cases are **latent** but handled safely.

**Exact implementation.** One helper `applyAntiCache(response)` sets exactly
`Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0`,
`Pragma: no-cache` (via `headers.set`, overwriting any backend values), applied to **every**
response the route returns — **unconditionally**. Rationale: request classification is
exhaustive (Bearer or fallback), and framework-added cookies are appended after the handler and
cannot be reliably detected inside it, so a uniform policy is the safest and simplest correct
choice. **No** `Vary`; **no** public/session-free exception in this route; **no** final-response
`Set-Cookie` classification. The helper touches only the three cache headers — `Set-Cookie`
(backend-forwarded or framework-added), `Location`, `Content-Type`, CORS, and all other headers
are untouched, and the body is streamed through (`new NextResponse(res.body, …)`, never
buffered). Multiple backend `Set-Cookie` values remain separate (regression boundary).

**Regression risks.** Do not fold/dedup/lose multiple `Set-Cookie` (touch only cache headers via
`.set`, never rebuild from `.get("set-cookie")`); do not read the body; do not touch `Location`
or non-cache headers; apply on every return path. The separate public Next routes are **not**
in this file and are unaffected.

**Tests (implemented).** `frontend/src/app/api/[...path]/__tests__/route.test.ts` — Phase 4
matrix A–Q asserting the **exact** three-header policy on every return: client-Bearer success;
no-Bearer/no-session (unconditional); cookie fallback with refresh and with clearing (framework
Set-Cookie coexists via a glue harness); backend unsafe cache directives overwritten; multiple
backend Set-Cookie preserved; backend Set-Cookie + body/status/headers; fetch failure;
unsafe-initial; downgrade; cross-host; malformed redirect; redirect exhaustion; missing
BACKEND_URL (503); forwarded 304; forwarded 3xx-without-Location; streaming preserved (route
never calls `text()`/`json()`/`arrayBuffer()`). Phase 2 transport and Phase 3 cookie tests
remain green.

**Rollback plan.** Header-only change in the proxy; revert commit. Rollback must not reintroduce
caching of session-touching responses.

**Deployment verification required (not source-provable).** Whether Railway / any CDN / edge
stores or reuses these responses; the edge cache key; whether `Cache-Control` is rewritten
upstream; actual production headers. Phase 2 transport and Phase 3 cookie behavior are unchanged.

**Codex verification checklist.**
- [ ] Every catch-all proxy response carries the exact `private, no-store` policy (all three headers), overwriting backend cache headers.
- [ ] Policy is unconditional (no public/session-free exception, no final-Set-Cookie classification, no `Vary`).
- [ ] Multiple Set-Cookie preserved (no fold/dup/loss); body streamed (never buffered); Location/non-cache headers intact.
- [ ] Applied on every return path (config-missing, transport failures, forwarded success/304/3xx, errors).

---

## Phase 5 — endpoint-specific rate limiting · High · `code` + `railway`

**Confirmed issue.** No application-level rate limiting anywhere; expensive endpoints
(`force_refresh` pipeline, `/api/analyze` LLM, graph compute, vendor routes) are unbounded.

**Why it matters.** Trivial DoS and vendor-cost amplification.

**Evidence.** No limiter in `app/`, `api/`, or proxy; expensive ops `feed.py:723`,
`analyze.py`, public vendor routes (audit §K).

**Exact implementation.** Shared limiter keyed by verified JWT `sub` with an edge-IP ceiling
(Redis/other shared store for multi-replica correctness); per-endpoint budgets for refresh,
analyze, and vendor routes. Backend dependency + config.

**Regression risks.** Per-replica in-memory counters are wrong under Railway replicas — must be
shared. Don't throttle normal interactive use.

**Tests.** Limiter unit tests (allow under budget, 429 over budget, key isolation per `sub`).

**Rollback plan.** Feature-flag the limiter; disable via env to revert behavior without deploy.

**Codex verification checklist.**
- [ ] Limits keyed by verified `sub` + IP ceiling; shared store under replicas.
- [ ] Expensive/vendor endpoints covered; interactive paths unaffected.

---

## Phase 6 — bounded module caches · High · `code`

**Confirmed issue.** `_SUMMARY_CACHE`, `_DEEP_CACHE`, `_TAKE_CACHE`, `_BRIEF_CACHE` are plain
dicts with unbounded key cardinality (only `.clear()` helpers). Per-symbol `Map` caches in
`explorer-market` similarly unbounded.

**Why it matters.** Memory exhaustion under attacker-chosen keys/symbols.

**Evidence.** `app/summarizer.py:47,52,57,510`; `frontend/src/app/api/explorer-market/route.ts:37,39`.

**Exact implementation.** Replace with size-bounded LRU (fixed max entries + eviction); keep the
existing `.clear()` semantics. Backend caches + the two frontend Maps.

**Regression risks.** Eviction must not change correctness (caches are advisory). Choose bounds
that preserve hit rates for normal load.

**Tests.** Cache never exceeds max size; LRU eviction order; hit/miss behavior unchanged for
hot keys.

**Rollback plan.** Revert per file; caches are self-contained.

**Codex verification checklist.**
- [ ] Each cache has a hard max and eviction; `.clear()` preserved.
- [ ] No correctness change for hot keys.

---

## Phase 7 — remove caller-controlled global model mutation · High · `code`

**Confirmed issue.** `/api/analyze` writes request-supplied `model_name` into process-global
`settings.ollama_model`, changing the model for all subsequent users.

**Why it matters.** Cross-user state contamination + abuse lever.

**Evidence.** `api/routes/analyze.py:62–65`.

**Exact implementation.** Use a per-request local model variable; never assign to
`settings.ollama_model` from request input. One file.

**Regression risks.** Ensure downstream summarizer calls receive the per-request model
explicitly rather than reading the global.

**Tests.** Concurrent requests with different `model_name` do not affect each other; global
setting is never mutated by a request.

**Rollback plan.** Revert commit.

**Codex verification checklist.**
- [ ] No request path writes `settings.ollama_model`.
- [ ] Per-request model threaded to the LLM call.

---

## Phase 8 — input-size and request-body limits · Med · `code`

**Confirmed issue.** `AnalyzeRequest` fields are unbounded; the proxy reads the full request
body via `arrayBuffer()` with no cap.

**Why it matters.** Memory/compute DoS.

**Evidence.** `api/routes/analyze.py:35`; `frontend/src/app/api/[...path]/route.ts:117`.

**Exact implementation.** Add `max_length` to `AnalyzeRequest` fields (Pydantic). In the proxy,
enforce a `Content-Length` cap and **reject** (413) oversized requests **before** buffering;
prefer canonical upstream URLs to avoid 307/308 replay; only stream with a deliberate replay
strategy (audit §N) — do **not** consume the stream bare.

**Regression risks.** Body-size limit must exceed legitimate payloads. 307/308 replay must keep
working (buffer-then-replay, not consumed stream).

**Tests.** Oversized body → 413 before buffering; legitimate payload passes; redirect replay
preserves body.

**Rollback plan.** Revert per file.

**Codex verification checklist.**
- [ ] Oversized requests rejected before full buffering.
- [ ] Analyze fields length-capped; redirect body replay intact.

---

## Phase 9 — error normalization + logging hygiene · Med · `code`

**Confirmed issue.** Raw exception text is returned to clients (`feed.py:774`, proxy
`String(err)`); Yahoo crumb prefix and per-request/timing diagnostics are logged.

**Why it matters.** Internal detail disclosure + credential-adjacent logging.

**Evidence.** `api/routes/feed.py:774`; proxy catch; `market-data/route.ts:144`;
`frontend/src/lib/authTiming.ts:31`; `[auth]`/`[proxy-auth]` logs.

**Exact implementation.** Return normalized error codes to clients; log detail server-side only.
Remove the crumb from logs and the per-request/timing diagnostics. **Retain** sanitized
aggregate JWT-rejection reason codes and auth-failure counters.

**Regression risks.** Do not remove the useful sanitized aggregate telemetry.

**Tests.** Error responses contain no raw exception/stack; logs contain no crumb/token/email.

**Rollback plan.** Revert per file.

**Codex verification checklist.**
- [ ] No raw exception text reaches clients.
- [ ] No credential-adjacent or per-request logs; aggregate telemetry retained.

---

## Phase 10 — public Next.js API routes · Med (explorer-market) / Low · `code`

**Confirmed issue.** `explorer-market` (paid `FMP_API_KEY`), `market-data` (free Yahoo),
`ipo-pipeline` (free SEC) sit outside the middleware auth matcher.

**Why it matters.** `explorer-market` = vendor-cost exposure (High if metered plan);
`market-data`/`ipo-pipeline` = availability only, no paid secret.

**Evidence.** `frontend/src/middleware.ts:71` (excludes `/api/*`);
`explorer-market/route.ts:28` (`FMP_API_KEY`); `ipo-pipeline/route.ts:18` (1h cache).

**Exact implementation.** Protect `explorer-market` (auth and/or distributed rate limit + cache
bound). Rate-limit + request-coalesce `market-data`/`ipo-pipeline`. Auth on the latter two is a
**product-policy** choice (consuming pages are authed), *not* a required security control —
decide explicitly.

**Regression risks.** Public pages that legitimately need these must keep working if auth is
added; coordinate with page auth state.

**Tests.** Rate-limit enforced; explorer-market rejects unauth (if auth chosen) or throttles.

**Rollback plan.** Revert per file / disable via flag.

**Codex verification checklist.**
- [ ] explorer-market no longer allows unbounded FMP spend.
- [ ] Policy for market-data/ipo-pipeline documented as product vs security.

---

## Phase 11 — security headers + CSP-Report-Only + CORS tightening · Low · `code` + `railway`

**Confirmed issue.** No security headers (`next.config.ts` empty); CORS methods/headers are
wildcard with `allow_credentials=True` (origins already allowlisted).

**Why it matters.** Defense-in-depth (HSTS, framing, sniffing, referrer, CSP).

**Evidence.** `frontend/next.config.ts` (empty); `api/main.py:175–188`.

**Exact implementation.** Add baseline headers (HSTS, `X-Frame-Options`/`frame-ancestors`,
`nosniff`, `Referrer-Policy`, `Permissions-Policy`) and **CSP in Report-Only** first. Tighten
CORS methods/headers; drop `allow_credentials` unless needed. HSTS `preload` only after HSTS is
proven in production.

**Regression risks.** A strict CSP before Report-Only observation will break the app — Report-Only
first. Framing headers must not block legitimate embeds.

**Tests.** Headers present on responses; CSP is Report-Only; no functional CSP blocks during
observation.

**Rollback plan.** Header config is additive; revert `next.config.ts` / CORS block.

**Codex verification checklist.**
- [ ] Baseline headers present; CSP Report-Only (not enforcing).
- [ ] CORS methods/headers tightened; credentials reconsidered.

---

## Phase 12 — deployment verification (no code) · `supabase` · `railway` · `dns` · `ops`

**Confirmed issue.** Repository is fail-closed in source, but production application of
migrations, grants, Auth settings, secret scope, redirects, origins, and caching layers is
unverified. Readiness probes only `entity_snapshots`.

**Why it matters.** Source correctness ≠ deployed correctness.

**Evidence.** Archive RLS + revoke: `supabase/migrations/004:164–172`, `005:205–213`,
`006:159–166`, `007:61–62`; readiness `app/readiness.py:35,146`.

**Exact implementation (ops).** Execute audit §Q checklist: verify `pg_policies`/grants for
every user + archive table; Set-Cookie attributes in prod; CDN/edge caching of Set-Cookie;
`BACKEND_URL` scheme + redirect hops; `ALLOWED_ORIGINS`; Supabase Auth (expiry, refresh
rotation/reuse detection, leaked-password protection, redirect URLs); service-role key scope;
replica count + shared rate-limit backend; source-map exposure; provider secret-scanning over
env + Git history. Optionally broaden the readiness probe (a small `code` change).

**Regression risks.** None (inspection). Any config change must be staged.

**Rollback plan.** N/A (verification); config changes reverted individually.

**Codex verification checklist.**
- [ ] Every archive + user table verified RLS-on and anon/authenticated denied in the deployed DB.
- [ ] Prod Set-Cookie has `Secure`; no cache layer stores Set-Cookie responses.
- [ ] Auth settings, secret scope, origins, redirect hops confirmed.

---

## Separate product/operational track (not a code phase)

Account deletion as an **Auth Admin + dependent-data** server workflow (never a profiles-row
DELETE policy); privacy documentation (`legal`); dependency-hygiene CI (`ops` — `npm audit` /
`pip-audit`); HSTS preload submission after HSTS is proven (`ops`/`dns`).

---

### Safeguards that must not be broken (apply to every phase)

Keep Supabase cookies browser-readable (never force HttpOnly); preserve chunking, all cookie
options, request-cookie sync, response Set-Cookie, deletion behavior, and the second-argument
anti-cache headers. Preserve client-Bearer precedence in the proxy. Never treat `getSession()`
as authorization — the backend keeps verifying independently. Never forward `Authorization`
across a host change or HTTPS→HTTP downgrade. Keep startup fail-closed on JWKS failure. Keep the
service-role key backend-only. Apply CSRF enforcement selectively (cookie-fallback + mutating/
expensive). Do not blanket-cache session-touching responses, and do not blanket-`no-store`
genuinely global data. CSP Report-Only before enforcing.
