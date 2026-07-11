# ARGUS MEMORY OPERATIONS V1 — Institutional Memory Runbook (M3.1)

Operational procedures for the canonical persistence foundation
(`app/institutional_memory/`, design record: ARGUS_INSTITUTIONAL_MEMORY_V2.md §15).

Architecture in one line:

```
5-min pipeline cycle → ThemeMemory (Railway volume, rolling intraday)
                     → institutional memory writer → Supabase Postgres (permanent archive)
                     → GET /api/memory/v2/* (read-only)
```

---

## 1. Production rollout (exact manual steps)

Perform in this order. Steps marked **[YOU]** cannot be done from the repo.

**A. Deploy with institutional memory disabled.**
Merge/deploy this code. `INSTITUTIONAL_MEMORY_ENABLED` is unset, so the writer is off.
Verify in Railway logs: `[institutional-memory] enabled=false reason=disabled_by_flag`
(or `missing_supabase_url`). The feed pipeline must behave exactly as before.

**B. Apply the database migration. [YOU]**
Supabase Dashboard → SQL Editor → paste the full contents of
`supabase/migrations/004_institutional_memory.sql` → Run. It is `create table if not
exists`-safe to re-run. Confirm the four tables exist under Table Editor:
`institutional_entities`, `entity_snapshots`, `transition_events`, `memory_write_runs`.

**C. Confirm security. [YOU]**
In Supabase Dashboard → Authentication → Policies: all four tables must show "RLS enabled"
with **zero policies**. Sanity check from a browser console using the anon key:

```
curl "https://<project>.supabase.co/rest/v1/entity_snapshots?select=id&limit=1" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
```

Expected: `[]` or a permission error — never data. (RLS with no policies denies rows;
`revoke all` in the migration denies the table outright.)

**D. Add backend service variables. [YOU]**
Railway → backend service → Variables:

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase → Settings → API>
```

The service-role key goes ONLY on the Railway backend service. Never into the frontend
service, never into any `NEXT_PUBLIC_*` variable, never committed.

**E. Enable institutional memory. [YOU]**

```
INSTITUTIONAL_MEMORY_ENABLED=true
```

Redeploy/restart. Verify log line: `[institutional-memory] enabled=true`.

**F. Run the baseline bootstrap once. [YOU]**
From a machine that can reach the production ThemeMemory state — in practice via
`railway run` (or a one-off shell on the service) so `THEME_MEMORY_DIR=/data/theme_memory`
resolves to the volume:

```
python scripts/bootstrap_institutional_memory.py --dry-run   # inspect what would be written
python scripts/bootstrap_institutional_memory.py             # write the baseline
```

Expected output: one inserted `bootstrap_baseline` snapshot per known theme, zero on rerun.

**G. Verify the status endpoint.**

```
GET https://<backend>/api/memory/v2/status
```

Check: `enabled: true`, `entity_count` ≈ theme count, `snapshot_count` ≥ theme count,
`latest_successful_run` populated, `recent_write_errors: []`.

**H. Wait for the next daily boundary (00:00 UTC).**
Daily rows for the current UTC day accrue within minutes of enablement (first full-feed
cycle); the previous day seals at the first cycle after midnight UTC.

**I. Confirm one snapshot per theme and no duplicates.**
Supabase SQL Editor:

```sql
select entity_uid, snapshot_date, count(*)
from entity_snapshots
where snapshot_kind = 'daily_utc'
group by 1, 2 having count(*) > 1;   -- must return zero rows
```

**J. Redeploy and confirm idempotency.**
Trigger a redeploy. The query in I must still return zero rows, and
`/api/memory/v2/status` must show runs continuing (identical-state cycles log
`status=skipped` at debug level or `unchanged=N`).

---

## 2. How to verify memory is enabled

- Startup log: `[institutional-memory] enabled=true` (or `enabled=false reason=…`).
- `GET /api/memory/v2/status` → `enabled`, `reason`, `backend_configured`.
- Per-cycle log: `[institutional-memory] run=<key> themes=N snapshots_inserted=… updated=…
  unchanged=… transitions=… status=completed`.

## 3. How to inspect the latest write run

- `GET /api/memory/v2/status` → `latest_successful_run` + `recent_write_errors`.
- SQL: `select * from memory_write_runs order by started_at desc limit 10;`
- A healthy day shows many runs (one per 5-min full-feed cycle) with
  `snapshots_inserted` only on the first cycle of the UTC day / theme appearance, and
  `transitions_inserted` only on the first cycle after 00:00 UTC.

## 4. How to run the bootstrap

See step F. Properties: explicit (never runs automatically), idempotent (themes with an
existing baseline are skipped, even on later dates), audited (`run_key` starts with
`bootstrap:` in `memory_write_runs`), honest (nothing backdated; `completeness_status =
'bootstrap'`). `--dry-run` prints the would-be writes and touches nothing.

## 5. How to confirm snapshots are accruing

```sql
select snapshot_date, count(*) themes
from entity_snapshots where snapshot_kind = 'daily_utc'
group by 1 order by 1 desc limit 14;
```

Expect one row per UTC day with a stable theme count. Or:
`GET /api/memory/v2/themes/<theme-id>/snapshots?limit=14`.

## 6. Diagnosing missing Supabase configuration

Symptoms → causes:

| Log / status | Meaning |
|---|---|
| `disabled reason=disabled_by_flag` | `INSTITUTIONAL_MEMORY_ENABLED` unset/false |
| `disabled reason=missing_supabase_url` | `SUPABASE_URL` empty on the backend service |
| `disabled reason=missing_service_role_key` | `SUPABASE_SERVICE_ROLE_KEY` empty |
| `write_failed … HTTP 401/403` | wrong key (anon key instead of service role?) |
| `write_failed … HTTP 404` | migration not applied (tables missing) |
| `write_failed … transport error` | network/URL problem |

The status endpoint mirrors these without exposing values. No secret is ever printed.

## 7. How to disable writes safely

Set `INSTITUTIONAL_MEMORY_ENABLED=false` (or remove it) on the Railway backend service and
restart. This stops the writer and the read API (503) without touching stored history.
ThemeMemory and the feed pipeline are unaffected. Re-enabling resumes accrual; the gap in
daily snapshots is simply honest absence (no backfill is attempted).

## 8. Recovering from a failed write

Nothing manual is usually needed: every failure is retried on the next 5-minute cycle, and
all writes are idempotent (natural snapshot keys, unique `event_key`, deterministic
`run_key`). To review failures: `GET /api/memory/v2/status → recent_write_errors`, or
`select * from memory_write_runs where status='failed' order by started_at desc;`.
Failed run rows are audit history — do not delete them. If Supabase was down across a UTC
boundary, that day's snapshot may be missing or reflect an earlier intraday state; this is
recorded honestly and never fabricated afterwards.

## 9. Confirming Railway ThemeMemory volume persistence

Startup logs the persistence probe (`api/main.py`):

- `[persistence-probe] THEME_MEMORY_DIR env = '/data/theme_memory'`
- `[persistence-probe] Railway volume = <name> mounted at /data`
- `[persistence-probe] marker SURVIVED redeploy … -> storage IS PERSISTENT` (healthy)
- `marker CREATED` on every deploy → the directory is EPHEMERAL: fix `THEME_MEMORY_DIR`
  to live under the volume mount before trusting ThemeMemory-derived writes.

## 10. Security rules (must hold at all times)

1. Only the backend service role writes institutional memory; the browser never holds a
   write path or the service-role key.
2. All four tables: RLS enabled, zero policies, `revoke all` from `anon`/`authenticated`.
3. Frontend access to history is exclusively via `GET /api/memory/v2/*`.
4. Logs and API responses never contain the service-role key or raw database errors.
5. Institutional records never contain a user id (personal memory is a separate ledger).
