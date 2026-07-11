-- ============================================================
-- Argus M3.1 — Institutional Memory: Canonical Persistence Foundation
--
-- Apply by pasting into the Supabase SQL Editor and running once.
-- Numbering continues the lineage started in frontend/supabase/migrations
-- (001 schema.sql, 002 profile upgrade, 003 followed themes). This file
-- lives at the repo root because these tables are BACKEND-owned: they are
-- market-global institutional memory, written only by the FastAPI service
-- role. The frontend never reads or writes them directly.
--
-- Tables:
--   institutional_entities  canonical identity registry
--   entity_snapshots        append-only historical state (sealed daily rows)
--   transition_events       meaningful changes between sealed snapshots
--   memory_write_runs       audit + idempotency ledger
--
-- Security model (see docs/ARGUS_MEMORY_OPERATIONS_V1.md):
--   RLS enabled on all four tables with NO policies -> anon/authenticated
--   are denied everything; privileges are additionally revoked outright.
--   The backend writes with the service role, which bypasses RLS.
-- ============================================================

-- ── institutional_entities ────────────────────────────────────────────────────
-- One row per canonical subject. uid format: {type}:{namespace}:{key}
-- M3.1 scope is themes only; widening entity_type requires a new migration
-- (deliberate: no speculative types).

create table if not exists public.institutional_entities (
  uid            text primary key,
  entity_type    text not null check (entity_type in ('theme')),
  namespace      text not null check (namespace in ('ontology', 'legacy')),
  canonical_key  text not null,
  display_label  text,
  aliases        jsonb not null default '[]'::jsonb,
  status         text not null default 'active'
                 check (status in ('active', 'superseded', 'absorbed', 'retired')),
  first_seen_at  timestamptz,
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (entity_type, namespace, canonical_key)
);

-- ── entity_snapshots ──────────────────────────────────────────────────────────
-- Append-only historical state for one entity at one observation boundary.
-- Natural key: (entity_uid, snapshot_date, snapshot_kind, schema_version).
-- Policy: a daily_utc row is MUTABLE while snapshot_date = current UTC date
-- (updated in place as the day evolves), and SEALED once the UTC date
-- advances — sealed rows are never modified. payload_hash is computed over
-- the deterministic `state` object inside payload only (observation time and
-- provenance excluded), so identical state re-writes are detectable.

create table if not exists public.entity_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  entity_uid            text not null references public.institutional_entities(uid),
  snapshot_date         date not null,
  observed_at           timestamptz not null,
  snapshot_kind         text not null
                        check (snapshot_kind in ('daily_utc', 'bootstrap_baseline')),
  schema_version        integer not null,
  graph_version         text,
  conviction            integer,
  evidence_verdict      text,
  evidence_quality      text,
  evidence_count        integer,
  source_count          integer,
  breadth               integer,
  momentum              numeric,
  lifecycle             text,
  strength              text,
  causal_narrative      text,
  forward_view          jsonb,
  drivers               jsonb,
  beneficiaries         jsonb,
  risks                 jsonb,
  contradictions        jsonb,
  related_assets        jsonb,
  narrative_memberships jsonb,
  transmission          jsonb,
  completeness_status   text not null
                        check (completeness_status in ('live', 'partial', 'bootstrap')),
  provenance            jsonb not null,
  payload               jsonb not null,
  payload_hash          text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (entity_uid, snapshot_date, snapshot_kind, schema_version)
);

create index if not exists entity_snapshots_uid_date_idx
  on public.entity_snapshots (entity_uid, snapshot_date desc);
create index if not exists entity_snapshots_date_kind_idx
  on public.entity_snapshots (snapshot_date, snapshot_kind);

-- ── transition_events ─────────────────────────────────────────────────────────
-- Meaningful changes between two SEALED snapshots of the same entity.
-- event_key is deterministic: {uid}|{type}|{effective_date}|v{schema_version}
-- so a re-run can never double-write a transition (insert ignore-duplicates).

create table if not exists public.transition_events (
  id               uuid primary key default gen_random_uuid(),
  entity_uid       text not null references public.institutional_entities(uid),
  transition_type  text not null check (transition_type in (
                     'conviction_strengthened',
                     'conviction_weakened',
                     'lifecycle_changed',
                     'evidence_strengthened',
                     'evidence_weakened',
                     'contradiction_added',
                     'contradiction_removed',
                     'breadth_changed',
                     'active_status_changed',
                     'causal_path_changed'
                   )),
  effective_at     timestamptz not null,
  from_snapshot_id uuid references public.entity_snapshots(id),
  to_snapshot_id   uuid references public.entity_snapshots(id),
  from_value       jsonb,
  to_value         jsonb,
  magnitude        numeric,
  basis            jsonb not null,
  schema_version   integer not null,
  event_key        text not null unique,
  created_at       timestamptz not null default now()
);

create index if not exists transition_events_uid_effective_idx
  on public.transition_events (entity_uid, effective_at desc);

-- ── memory_write_runs ─────────────────────────────────────────────────────────
-- Audit + idempotency ledger. run_key is deterministic over the writer
-- version, schema version, snapshot date, and the sorted (uid, payload_hash)
-- pairs of the cycle — an identical re-run maps to the same run_key and is
-- skipped when that run already completed.

create table if not exists public.memory_write_runs (
  id                  uuid primary key default gen_random_uuid(),
  run_key             text not null unique,
  cycle_id            text,
  writer_version      text not null,
  started_at          timestamptz not null,
  completed_at        timestamptz,
  status              text not null
                      check (status in ('running', 'completed', 'failed')),
  themes_seen         integer not null default 0,
  entities_upserted   integer not null default 0,
  snapshots_inserted  integer not null default 0,
  snapshots_updated   integer not null default 0,
  snapshots_unchanged integer not null default 0,
  transitions_inserted integer not null default 0,
  error_count         integer not null default 0,
  errors              jsonb,
  metadata            jsonb
);

create index if not exists memory_write_runs_started_idx
  on public.memory_write_runs (started_at desc);

-- ── Security: backend service role is the ONLY writer and reader ─────────────
-- RLS enabled with no policies = default deny for anon/authenticated.
-- Privileges are also revoked outright (belt and braces). The service role
-- bypasses RLS; the frontend reaches this data only through FastAPI.

alter table public.institutional_entities enable row level security;
alter table public.entity_snapshots       enable row level security;
alter table public.transition_events      enable row level security;
alter table public.memory_write_runs      enable row level security;

revoke all on public.institutional_entities from anon, authenticated;
revoke all on public.entity_snapshots       from anon, authenticated;
revoke all on public.transition_events      from anon, authenticated;
revoke all on public.memory_write_runs      from anon, authenticated;
