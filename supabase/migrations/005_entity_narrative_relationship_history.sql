-- ============================================================
-- Argus M3.2 — Entity, Narrative, and Relationship History
--
-- Additive migration. Apply by pasting into the Supabase SQL Editor AFTER
-- 004_institutional_memory.sql. Does not modify M3.1 rows or behavior; the
-- widened check constraints are strict supersets of the M3.1 constraints.
--
-- Adds:
--   • widened entity_type / namespace vocabulary on institutional_entities
--   • widened transition_type vocabulary on transition_events (narratives)
--   • institutional_relationships   relationship identity registry
--   • relationship_snapshots        daily sealed relationship state
--   • relationship_transitions     relationship change ledger
--   • narrative_snapshots           daily sealed narrative state
--
-- Security model unchanged: RLS enabled with zero policies + revoke all from
-- anon/authenticated; the backend service role is the only reader/writer.
-- ============================================================

-- ── 1. Widen identity vocabulary (superset of M3.1) ──────────────────────────
-- Supported production identities only:
--   theme:ontology|legacy       (M3.1, unchanged)
--   company:ticker              tradeable ticker (companies, ETFs, index proxies)
--   sector:taxonomy             GICS-style curated sector taxonomy (reserved;
--                               no M3.2 writer emits it yet)
--   industry:taxonomy           curated industry taxonomy (theme ontology keys)
--   driver:ontology             macro drivers curated in the theme ontology
--   regime:taxonomy             curated market-regime catalogue
--   narrative:driverset         deterministic driver-set hash
--   <type>:unresolved           anything that fails strict validation — never
--                               guessed into a canonical namespace

alter table public.institutional_entities
  drop constraint institutional_entities_entity_type_check;
alter table public.institutional_entities
  add constraint institutional_entities_entity_type_check
  check (entity_type in ('theme', 'company', 'sector', 'industry',
                         'driver', 'regime', 'narrative'));

alter table public.institutional_entities
  drop constraint institutional_entities_namespace_check;
alter table public.institutional_entities
  add constraint institutional_entities_namespace_check
  check (namespace in ('ontology', 'legacy', 'ticker', 'taxonomy',
                       'driverset', 'unresolved'));

-- ── 2. Widen transition vocabulary for narratives (superset of M3.1) ─────────

alter table public.transition_events
  drop constraint transition_events_transition_type_check;
alter table public.transition_events
  add constraint transition_events_transition_type_check
  check (transition_type in (
    -- M3.1 theme transitions (unchanged)
    'conviction_strengthened', 'conviction_weakened', 'lifecycle_changed',
    'evidence_strengthened', 'evidence_weakened',
    'contradiction_added', 'contradiction_removed',
    'breadth_changed', 'active_status_changed', 'causal_path_changed',
    -- M3.2 narrative transitions (narratives are institutional entities)
    'narrative_appeared', 'narrative_disappeared',
    'member_added', 'member_removed',
    'dominant_status_changed',
    'coherence_strengthened', 'coherence_weakened',
    'thesis_changed'
  ));

-- ── 3. Relationship identity registry ────────────────────────────────────────
-- rel_uid is deterministic: rel:{source_uid}|{type}|{target_uid}, where
-- symmetric types (correlates) order endpoints lexically and directed types
-- preserve direction. Recorded types are persisted VERBATIM from the backend
-- graph (drives, pressures, supports, correlates, rotates_into, exposed_to) —
-- synonyms are never merged silently (ARGUS_INTELLIGENCE_MODEL_V1 discipline).

create table if not exists public.institutional_relationships (
  rel_uid           text primary key,
  source_uid        text not null references public.institutional_entities(uid),
  target_uid        text not null references public.institutional_entities(uid),
  relationship_type text not null,
  direction         text not null default 'directed'
                    check (direction in ('directed', 'symmetric')),
  status            text not null default 'active'
                    check (status in ('active', 'aged_out')),
  first_seen_at     timestamptz,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists institutional_relationships_source_idx
  on public.institutional_relationships (source_uid);
create index if not exists institutional_relationships_target_idx
  on public.institutional_relationships (target_uid);

-- ── 4. Relationship snapshots (daily, mutable-until-sealed like M3.1) ────────

create table if not exists public.relationship_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  rel_uid             text not null references public.institutional_relationships(rel_uid),
  snapshot_date       date not null,
  observed_at         timestamptz not null,
  snapshot_kind       text not null check (snapshot_kind in ('daily_utc')),
  schema_version      integer not null,
  source_uid          text not null,
  target_uid          text not null,
  relationship_type   text not null,
  direction           text not null,
  strength            numeric,          -- backend graph edge weight, 0-1 scale, verbatim
  confidence          numeric,          -- backend graph edge confidence, 0-1 scale
  evidence_count      integer,
  source_count        integer,
  evidence_refs       jsonb,            -- stable story-cluster ids; identifiers only
  active              boolean not null default true,
  graph_version       text,
  completeness_status text not null
                      check (completeness_status in ('live', 'partial', 'bootstrap')),
  provenance          jsonb not null,
  payload             jsonb not null,
  payload_hash        text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (rel_uid, snapshot_date, snapshot_kind, schema_version)
);

create index if not exists relationship_snapshots_uid_date_idx
  on public.relationship_snapshots (rel_uid, snapshot_date desc);
create index if not exists relationship_snapshots_date_idx
  on public.relationship_snapshots (snapshot_date, snapshot_kind);

-- ── 5. Relationship transitions ───────────────────────────────────────────────
-- Separate table (not transition_events) because rel_uids are not
-- institutional_entities rows and must not weaken that foreign key.
-- relationship_type_changed is deliberately absent: a type change is modeled
-- honestly as relationship_disappeared + relationship_appeared (new rel_uid).

create table if not exists public.relationship_transitions (
  id               uuid primary key default gen_random_uuid(),
  rel_uid          text not null references public.institutional_relationships(rel_uid),
  transition_type  text not null check (transition_type in (
                     'relationship_appeared',
                     'relationship_disappeared',
                     'relationship_strengthened',
                     'relationship_weakened',
                     'confidence_changed',
                     'evidence_added',
                     'evidence_removed'
                   )),
  effective_at     timestamptz not null,
  from_snapshot_id uuid references public.relationship_snapshots(id),
  to_snapshot_id   uuid references public.relationship_snapshots(id),
  from_value       jsonb,
  to_value         jsonb,
  magnitude        numeric,
  basis            jsonb not null,
  schema_version   integer not null,
  event_key        text not null unique,
  created_at       timestamptz not null default now()
);

create index if not exists relationship_transitions_uid_idx
  on public.relationship_transitions (rel_uid, effective_at desc);

-- ── 6. Narrative snapshots ─────────────────────────────────────────────────────
-- Narratives ARE institutional entities (entity_type='narrative',
-- namespace='driverset'); this table holds their daily state. Member
-- convictions are listed individually — never blended into a narrative-level
-- conviction (canonical model rule). thesis is nullable and null in M3.2:
-- the backend has no deterministic narrative thesis output yet.

create table if not exists public.narrative_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  entity_uid           text not null references public.institutional_entities(uid),
  snapshot_date        date not null,
  observed_at          timestamptz not null,
  snapshot_kind        text not null check (snapshot_kind in ('daily_utc')),
  schema_version       integer not null,
  driver_set_key       text not null,   -- sorted canonical driver uids joined '+'
  title                text,            -- display title AT THAT TIME (labels drift; key does not)
  thesis               text,
  member_uids          jsonb not null,
  member_convictions   jsonb,           -- [{uid, conviction}] individually, never blended
  coherence            numeric,         -- structural similarity 0-100, NOT a confidence
  coherence_components jsonb,
  evidence_refs        jsonb,
  contradictions       jsonb,
  dominance_status     text check (dominance_status in ('dominant', 'secondary')),
  rank                 integer,
  graph_version        text,
  completeness_status  text not null
                       check (completeness_status in ('live', 'partial', 'bootstrap')),
  provenance           jsonb not null,
  payload              jsonb not null,
  payload_hash         text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (entity_uid, snapshot_date, snapshot_kind, schema_version)
);

create index if not exists narrative_snapshots_uid_date_idx
  on public.narrative_snapshots (entity_uid, snapshot_date desc);
create index if not exists narrative_snapshots_date_idx
  on public.narrative_snapshots (snapshot_date, snapshot_kind);

-- ── 7. Security: identical model to M3.1 ─────────────────────────────────────

alter table public.institutional_relationships enable row level security;
alter table public.relationship_snapshots      enable row level security;
alter table public.relationship_transitions    enable row level security;
alter table public.narrative_snapshots         enable row level security;

revoke all on public.institutional_relationships from anon, authenticated;
revoke all on public.relationship_snapshots      from anon, authenticated;
revoke all on public.relationship_transitions    from anon, authenticated;
revoke all on public.narrative_snapshots         from anon, authenticated;
