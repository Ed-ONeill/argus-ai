# ARGUS PRODUCTION READINESS & SECURITY AUDIT — V1

**Date:** 2026-07-23
**Scope:** Full platform — frontend (Next.js), backend (FastAPI), Railway deployment, Supabase (auth + archive), authentication, API routes, middleware, environment variables, database, storage, dependencies, privacy/legal, infrastructure, performance.
**Method:** Four parallel deep-read audits (backend/API security; frontend/auth; Supabase/data; privacy/infra/performance), cross-verified against the code. Every finding carries a file reference and an exploit/consequence.
**Nature:** Audit only. Nothing is implemented. Finding IDs are local to this document.

---

## 0. Verdict

**Argus is NOT ready to serve real users. Do not expose it publicly in its current state.**

The platform has one pervasive structural gap and one silent data-loss defect that dominate everything else:

1. **There is no authentication or authorization anywhere on the backend, and none enforced server-side on the frontend.** Every API route — read and write — is anonymous. The "protected" pages only redirect in client JavaScript; their data is already served by an open backend. The saved-research store is a single global dict shared across all users.
2. **Railway's filesystem is ephemeral and no volume is attached, so every deploy destroys the entire durable record** — the identity journal, event registry, and theme memory that Sprints 3–4 were built to make permanent. The durability architecture passes every local test and silently evaporates in production.

Neither is hard to fix. Both are absolute launch blockers. Beyond them sits a coherent second tier: a known-critical Next.js CVE, no rate limiting on pipeline- and LLM-triggering endpoints, no health checks, no error reporting, no legal pages, and fully unpinned dependencies on both sides.

**One genuinely good result:** the Supabase data layer is sound — RLS is enabled on all 15 tables with correct `auth.uid()` ownership policies and backend tables revoked from anon. Cross-user reads and anonymous data access are closed *provided the manually-applied migrations were actually run* (which the repo cannot prove — C6).

---

## 1. CRITICAL findings (launch blockers)

### C1 — No authentication or authorization on the backend API
Every router in `api/main.py:145-227` is registered with no auth dependency, no middleware, no API-key check. Feed, saved, analyze (LLM), memory v1/v2, listen, briefings, intelligence — all fully anonymous. Anyone with the Railway URL has complete read/write access. **Exploit:** direct request to any endpoint. **Fix:** a shared bearer token in front of every route is the minimum viable gate; proper fix is Supabase JWT verification forwarded from the proxy.

### C2 — No server-side auth enforcement on the frontend; all gating is client-side
`src/middleware.ts:28` calls `getUser()` only to refresh cookies, then returns unconditionally and excludes `/api/*` from its matcher entirely. Route protection lives only in client components (`settings/page.tsx:181`, `saved/page.tsx:226`) that redirect *after* JS runs — the underlying data was already fetched from the open backend. **Exploit:** direct request to any "protected" page or its data. **Fix:** enforce `getUser()` in middleware for gated paths; redirect/401 when absent.

### C3 — Backend proxy forwards no authentication; the Python backend is effectively public
`src/app/api/[...path]/route.ts:37-57` forwards to `BACKEND_URL` without attaching or validating a Supabase session; `lib/api.ts:26,71` issues POST/DELETE with no auth header. Combined with C1, anyone reaching the proxy — or the Railway backend directly — can read/write/delete everything. **Fix:** require a validated session in the proxy, forward a verified identity, enforce ownership in the backend.

### C4 — Saved items are a global, shared, unauthenticated store (backend)
`api/routes/saved.py:16,33-55`: a module-level dict, no user scoping, no ownership check. Any caller can list, delete, or overwrite every other user's saved research (`GET/POST/DELETE /api/saved/…`). Structural IDOR — there are no user IDs to check because there is no auth. Also unbounded memory growth. **Note:** the frontend *also* has a correct Supabase-backed `saved_items` table (RLS-scoped) — this in-memory backend store is a **second, conflicting, insecure** path that must be removed or unified. **Fix:** per-user scoping to an authenticated identity; delete the in-memory store in favor of the RLS-protected table.

### C5 — No Railway volume: every deploy destroys the permanent institutional record
`railway.toml` and `frontend/railway.toml` contain zero volume/mount config (verified). Everything under `data/` — the identity journal (`data/ledger/*.jsonl`, "permanent by design"), the event-registry snapshot, `theme_memory.json` (momentum rehydration), feed-cache pickles, `memory.db` — sits on Railway's ephemeral filesystem. **Consequence:** the entire OP2/OP3 durability architecture silently evaporates on every deploy; uid permanence is broken in production while all local tests pass. **Fix:** attach a Railway volume mounted at `data/` to the backend service and verify `BASE_DIR/data` resolves onto it.

### C6 — Next.js 15.1.11 is vulnerable to CVE-2025-29927 (middleware auth bypass)
Resolved `next@15.1.11` (verified in `package-lock.json`; < 15.2.3). The `x-middleware-subrequest` header skips middleware execution entirely. **Impact is latent today** only because middleware enforces nothing (C2) — but it becomes a full auth bypass the instant middleware gating is added (i.e., the moment C2 is fixed the naive way). `npm audit --omit=dev` additionally reports postcss ≤8.5.11 (high), sharp <0.35.0 (libvips CVEs, high), ws 8.0.0–8.20.1 (DoS, high). **Fix:** `next@^15.2.3` + `npm audit fix`, rebuild, retest. Must land in the same change as any middleware auth.

### C7 — Applied Supabase schema state is unverifiable (manual SQL-editor migrations)
All 6 migrations instruct "paste into the SQL Editor" (`004:4`, `002:3`); there is no CLI config, no migrations table, no CI check. The RLS-enable and `revoke all from anon, authenticated` statements on the 11 backend tables (004:164-172, 005:205-213, 006:159-166) **cannot be proven to have run** in the live project. If any were skipped, those tables are exposed to the shipped publishable anon key via PostgREST. **Exploit (only if drift exists):** anon `GET {SUPABASE_URL}/rest/v1/entity_snapshots`. **Fix:** adopt `supabase db push`/CLI migrations + a startup probe asserting anon receives permission-denied on one backend table. *(This is Critical because it is unverifiable, not because it is known-broken — the migrations as written are correct.)*

---

## 2. HIGH findings

### H1 — Zero rate limiting, and two endpoints trigger the full pipeline synchronously
`feed.py:665-666,683-689` (`GET /api/feed/?refresh=true`) and `feed.py:718-721` (any novel `categories`/`sources` combo) run `_run_inline` — full RSS fan-out + clustering + LLM summarization, multi-second to multi-minute — on demand, on a single-process uvicorn (`railway.toml`, no workers). **Exploit:** one attacker looping `?refresh=true` or random `sources=` values pins the worker, exhausts LLM quota, and freezes the feed for everyone. **Fix:** remove/authenticate `force_refresh`, whitelist filter combos, add per-IP rate limiting (e.g. slowapi).

### H2 — Unauthenticated LLM invocation with unbounded input, and a request that mutates global model config
`analyze.py:62-98` (`POST /api/analyze/`, `/deep/`) calls the LLM per request with unbounded `title`/`snippet` (no `max_length`), caching into unbounded dicts (`summarizer.py:47,52`). Worse, `analyze.py:65-66` does `settings.ollama_model = model` — an **anonymous request permanently mutates the process-wide model** every other user and the background summarizer use. **Exploit:** cost abuse through your LLM key, memory exhaustion via random titles, prompt injection, and platform-wide model/billing hijack. **Fix:** auth + field length caps + bounded LRU caches + rate limit; never mutate `settings` — pass model per-call.

### H3 — The background refresh thread can die permanently and silently
`background.py:619-648`: `_loop` has no try/except around the refresh; `mark_refreshing`/`make_cache_key` (`:651-652`) run *outside* the per-key guard, so any exception there kills the daemon thread with no supervisor and no restart. **Consequence:** the feed silently freezes at its last snapshot forever, and (H4/H5) nobody is notified. **Fix:** wrap the loop body in try/except with re-entry; surface last-cycle age via health.

### H4 — Health check is unwired and vacuous
`/api/health` (`api/main.py:225-227`) returns static `{"status":"ok"}`; `railway.toml` declares no `healthcheckPath`, so Railway never probes it, and even if it did, a dead refresh thread (H3) or a 10-hour-stale cache still reports ok. **Consequence:** deploys go live before readiness; dead workers are never cycled. **Fix:** `healthcheckPath = "/api/health"` + have health report background-thread liveness and last-cycle timestamp.

### H5 — No error reporting, uptime monitoring, or alerting anywhere
No Sentry or equivalent in either codebase (verified — the only grep hits were `scrollbar` false positives). 20+ swallowed-exception paths in `run_pipeline` log to stdout and notify no one. **Consequence:** silent failures (H3 especially) run indefinitely. **Fix:** Sentry on both sides + an external uptime ping on `/api/health`.

### H6 — No security headers anywhere (frontend or backend)
`next.config.ts` is empty — no `headers()` block; middleware sets none; FastAPI sets none. Missing across the board: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors` (clickjackable), `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`. **Fix:** add a `headers()` set in `next.config.ts` (or middleware) and a small header middleware in FastAPI (HSTS + nosniff at minimum).

### H7 — Unauthenticated, unthrottled market-data proxies (resource/cost abuse)
`market-data/route.ts`, `explorer-market/route.ts`, `ipo-pipeline/route.ts` have no auth and no rate limiting. Anyone can drive your server to hammer Yahoo/FMP/SEC on **your** `FMP_API_KEY` quota and IP reputation. **Mitigated:** symbol input is regex-validated and capped (`explorer-market/route.ts:19`), hosts are hardcoded — **no SSRF**. **Fix:** gate behind auth + per-IP/user rate limiting.

### H8 — Debug/ops endpoints exposed to anonymous users
`feed.py:624` `/api/feed/status` (cache keys, error counts), `feed.py:765` `/api/feed/activation-debug` (raw internals; `?refresh=true` triggers synchronous re-extraction + anonymous cache mutation), `memory_v2.py:113` `/status` (raw writer error strings, `:144-152`), `intelligence.py:92` `/network?debug=true`. **Fix:** gate behind auth or strip from production builds.

### H9 — No privacy policy, terms of service, or account-deletion path
No `/privacy` or `/terms` route exists; no deletion/export path anywhere; `profiles` has no delete policy (`schema.sql:117-120`). Supabase collects emails, the backend stores saved research, localStorage holds behavioral data. **Legally required before public launch** (GDPR/CCPA): (1) Privacy Policy (data collected, lawful basis, retention, processors: Supabase/Railway/LLM provider); (2) Terms of Service with a **site-level not-investment-advice disclaimer** — only three scattered micro-disclaimers exist today (`explore/[entity]/page.tsx:332`, `IntelligenceDrawer.tsx:342`, `TodaysTake.tsx:171-239`); (3) account-deletion mechanism (Art. 17 — the FKs cascade correctly from `auth.users`, so a service-role delete suffices; even a documented mailto works at launch); (4) data-export on request (Art. 20); (5) AI-content disclosure on LLM-written strings (`why_it_matters` across feed/dossiers is currently unlabeled). **NOT required:** cookie-consent banner — only strictly-necessary Supabase auth cookies exist and there is no analytics SDK (verified — a genuine plus).

### H10 — Dependencies are 100% unpinned on both sides, no lockfile (backend)
Both `requirements.txt` files use `>=` exclusively with no lock and no pinned Python; every deploy resolves fresh latest versions of fastapi/pydantic/chromadb/etc. **Consequence:** non-reproducible builds, and a breaking or compromised upstream release bricks production at deploy time (supply-chain exposure). The root file also drags in gradio/chromadb/sentence-transformers the API never uses. **Fix:** pip-compile a lockfile, pin Python, split API deps from ML/RAG deps.

---

## 3. MEDIUM findings

- **M1 — CORS `allow_credentials=True` with `allow_methods/headers=["*"]`** (`api/main.py:161-167`). Moot until cookie auth exists, but a footgun: an operator setting `ALLOWED_ORIGINS=*` would silently pair wildcard with credentials. **Fix:** `allow_credentials=False` until cookie auth lands; validate origins at startup.
- **M2 — Cold non-warm filter combos run the pipeline inline** behind a 30s proxy timeout (`feed.py`; frontend proxy) → tens-of-seconds blocking and 502s while the result lands in cache unseen. **Fix:** serve 202/partial + background-fill.
- **M3 — Pickle load of on-disk cache at startup** (`processed_cache.py:114-127`). Arbitrary-code-exec *if* a cache file is attacker-controlled; only the backend writes them, so it's a trust-boundary/defense-in-depth issue, not remote today. **Fix:** document the boundary; later sign or change format.
- **M4 — Missing Supabase UPDATE policies break the upsert path.** `useSaved.ts:64,128` / `useWatchlist.ts:31,117` call `.upsert(onConflict:…)`, whose DO UPDATE arm needs an UPDATE policy the tables lack (`schema.sql:123-136`) → re-saving and local→cloud merge fail silently with RLS denial. Not an exposure — silent data loss. **Fix:** add `for update using/with check (auth.uid() = user_id)` or `ignoreDuplicates`.
- **M5 — PostgREST filter-expression injection surface in `repository.py`** (f-string filters, e.g. `:87,136,265`). Fully mitigated **today** by input grammar (`parse_uid` regex, clamped limits, order regex) but relies on every future caller remembering the guard; blast radius is the market-global tables (no user data). **Fix:** centralize a `_filter_value()` sanitizer.
- **M6 — Exception text leaks to clients** at `feed.py:708-711` (503 detail embeds `{exc}` — may leak internal paths/config). Elsewhere clean. **Fix:** generic message.
- **M7 — No account-deletion / PII-deletion path** (also H9): profiles + `auth.users` emails persist indefinitely; deletion requests unfulfillable without dashboard surgery. **Fix:** service-role deletion endpoint (cascades are already in place).
- **M8 — Single process, no workers; restart cap = 3** (`railway.toml`). One CPU-bound inline pipeline call blocks all requests (compounds H1); after 3 crashes the service stays down with no alert (compounds H5). **Fix:** add workers/replicas; raise retry cap once health checks exist.
- **M9 — Unbounded backend caches:** `_SUMMARY_CACHE`/`_DEEP_CACHE` (`summarizer.py:47,52`) grow forever and are anonymous-writable via `/api/analyze/`; disk accumulates an immortal pickle per novel filter combo (`processed_cache.py:185-193`). **Fix:** LRU-cap; prune disk snapshots.
- **M10 — Supabase backup/PITR posture unverifiable from repo.** The sealed archive is the only durable store surviving C5 and depends entirely on Supabase's backup tier. **Action:** confirm PITR/daily backups; document restore.
- **M11 — Full graph rebuild per poll per mounted surface** (`provisionGraphState` clears+rebuilds + invalidates profile cache every ~10 min), atop ~300 kB First-Load routes (feed 297 / markets 301 / listen 303 kB; shared 106 kB). Acceptable now; scales linearly with feed size. **Fix later:** incremental ingest or graph-version-keyed memoized profiles.
- **M12 — Prompt injection is structural:** RSS headlines and `/api/analyze/` input flow verbatim into LLM prompts whose `IMPACT:` outputs feed deterministic layers (audit R2/T15). **Fix:** treat as known-accepted short-term; keep output-schema validation.

---

## 4. LOW findings

- **L1 — Feed URLs rendered into `href` without scheme validation** (`ClusterCard.tsx:316,448,682`, `IntelligenceStream.tsx` et al.). React 19.2.4 sanitizes `javascript:` hrefs, so this is defense-in-depth; all `target="_blank"` correctly carry `rel="noopener noreferrer"`. **Fix:** validate `startsWith("http")`.
- **L2 — CSRF surface is latent:** state-changing calls go through the cookie-bearing proxy with no CSRF token, but there's no cookie *authorization* to forge yet. Becomes exploitable the moment auth lands unless the session cookie stays `SameSite=Lax/Strict` (Supabase SSR default Lax — acceptable). **Fix:** add CSRF protection when auth lands.
- **L3 — `feedparser.parse(url)` has no HTTP timeout** (`feeds.py:1696`) — a hung feed host stalls a fetch worker (availability). **Fix:** timeout.
- **L4 — localStorage slow growth:** `memoryEngine.ts:167` entity timelines grow one snapshot/day/entity with no entity-count cap; `themeSnapshots.ts:35` is capped (120/theme). **Fix:** cap entity count.
- **L5 — Migration hygiene:** `005` uses `drop constraint` without `if exists` (non-idempotent re-runs); no explicit `001_` file (schema.sql is implicit). **Fix:** idempotent guards; number the base schema.
- **L6 — LLM re-spend on restart:** `_SUMMARY_CACHE` is memory-only, so each restart re-spends up to 15 LLM calls/refresh until warm (couples with C5/H3). **Fix:** persist summaries (rides the C5 volume).
- **L7 — `log_level` INFO with heavy per-cycle volume** — fine now; watch Railway log retention/cost at scale.
- **L8 — No global exception handler / error hook on FastAPI** (default 500 is clean but unmonitored — folds into H5).

**Verified-good (recorded so they aren't re-litigated):** no secrets in the client bundle (only `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`; FMP/FRED/BACKEND_URL server-only); no `.env` git-tracked; no SSRF (hosts hardcoded, symbols validated); no raw SQL, no `subprocess`/`eval`/`exec`; service-role key stays backend-only and is never logged; no storage buckets or edge functions; RLS enabled on all 15 tables with correct ownership policies; natural-key unique constraints and query-path indexes present; no analytics SDK; session tokens in SSR cookies, not localStorage; no PII in backend archive tables.

---

## 5. RLS answer block (explicit)

- **Is RLS enabled everywhere?** **Yes**, in the migrations — all 4 user tables and all 11 backend tables, the latter with `revoke all from anon, authenticated` as belt-and-braces. **Caveat:** applied state is unverifiable (C7).
- **Can one user read another user's data?** **No** — every user-table policy is `auth.uid() = id/user_id`; no cross-user path exists.
- **Can anonymous users access anything unexpected?** **No** — anon has no policies on user tables and is revoked on backend tables — *conditional on the migrations having actually run* (C7).

---

## 6. Fix priority matrix

Ranked by launch-blocking risk first, then by leverage (impact ÷ effort). "Effort" is rough engineering time for one engineer.

| Rank | ID | Finding | Risk | Effort | Impact | Blocks launch |
|---|---|---|---|---|---|---|
| 1 | C5 | Attach Railway volume at `data/` | Critical | ~1 h | Stops ongoing per-deploy data loss | **Yes** |
| 2 | C6 | Bump `next`→≥15.2.3 + `npm audit fix` | Critical | ~2 h | Closes CVE before auth work builds on middleware | **Yes** |
| 3 | C1–C4 | Authentication across backend + proxy + middleware; per-user saved items | Critical | ~3–5 d | Closes the entire anonymous-access class | **Yes** |
| 4 | C7 | CLI migrations + startup RLS probe | Critical | ~0.5 d | Proves the data layer is actually locked | **Yes** |
| 5 | H1/H2 | Rate limiting + kill `?refresh=true`/inline novel combos + `/analyze` caps + stop `settings` mutation | High | ~1–2 d | Removes DoS + cost-abuse + model-hijack | **Yes** |
| 6 | H4/H3 | `healthcheckPath` + supervise/restart the refresh thread + liveness in health | High | ~0.5 d | Deploy safety + no silent feed freeze | **Yes** |
| 7 | H9 | Privacy Policy, ToS + site-level disclaimer, deletion path, AI disclosure | High | ~1–2 d | Legal prerequisite | **Yes** |
| 8 | H10 | Pin/lock deps both sides; split API from ML deps; pin Python | High | ~0.5–1 d | Reproducible, smaller, safer builds | Strongly advised |
| 9 | H5 | Sentry both sides + external uptime ping | High | ~0.5 d | Turns silent failures visible | Strongly advised |
| 10 | H6 | Security headers (CSP/HSTS/XFO/Referrer/Permissions/nosniff) | High | ~0.5 d | Clickjacking + defense-in-depth | Strongly advised |
| 11 | H7/H8 | Auth + rate-limit market-data proxies; gate/strip debug endpoints | High | folds into #3/#5 | Cost abuse + info leak | Strongly advised |
| 12 | M1,M4,M6,M8,M10 | CORS hardening; UPDATE policies; stop `{exc}` leak; workers + retry; confirm Supabase PITR | Medium | ~1–2 d total | Correctness + resilience | Before scale |
| 13 | M2,M9,M11,M3,M5 | Inline-pipeline UX; LRU caps + disk prune; graph-rebuild cost; pickle boundary; filter sanitizer | Medium | ~2–3 d total | Performance + hardening | Post-launch |
| 14 | L1–L8 | Defense-in-depth + hygiene | Low | ~1–2 d total | Incremental | Backlog |

---

## 7. Production-readiness scorecard (0–10)

| Dimension | Score | One-line justification |
|---|---|---|
| **Security** | 2 | No auth anywhere; global shared store; a live CVE — offset only by a clean secret/injection/SSRF posture. |
| **Privacy** | 3 | Correct RLS + no analytics/no localStorage tokens, but no policy, ToS, deletion, or AI/financial disclaimer. |
| **Infrastructure** | 2 | Ephemeral filesystem destroying the durable record every deploy; no volume, no workers, retry cap 3. |
| **Operations** | 2 | No error reporting, no uptime monitoring, no alerting; a silently-fatal background thread. |
| **Deployment** | 3 | Deploys work but with no health gate, no reproducible builds, no backups strategy documented. |
| **Scalability** | 4 | Single process; inline pipeline blocks; full graph rebuild per poll — fine at zero load, linear cost thereafter. |
| **Observability** | 2 | stdout logs only; vacuous health endpoint; no metrics, traces, or dashboards. |
| **Developer Experience** | 7 | Strong: deep architecture docs, deterministic pipeline, 382 backend + 19 frontend tests, feature flags, clean module boundaries. |
| **Launch readiness** | **2** | Two absolute blockers (no auth; ephemeral durability) plus a required legal layer. Not launchable today. |

**Overall: NOT READY.** The path to launchable is short and unambiguous — matrix ranks 1–7 (roughly two focused engineering weeks) clear every launch blocker; ranks 8–11 should accompany them. The foundation underneath (data model, RLS, architecture, test coverage) is genuinely strong, which is why the remediation is addition-of-guards rather than redesign.

---

## 8. Notes on scope and confidence

- Supabase **applied** state (RLS actually enabled, PITR configured) cannot be verified from the repo — C7 and M10 are flagged as operational verifications, not code fixes.
- No known-CVE claim is made for specific backend dependency versions (unpinned ranges make "current resolved version" undefined — itself the H10 finding); the Next.js CVE is asserted against the **resolved** `15.1.11` in the lockfile.
- Performance findings are static-analysis-based (build sizes, cadence, cache structures); no load test was run — numbers indicate direction, not measured limits.
