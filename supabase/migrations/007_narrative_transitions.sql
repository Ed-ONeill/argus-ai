-- ══════════════════════════════════════════════════════════════════════════════
-- 007_narrative_transitions.sql — dedicated narrative transition ledger
-- ══════════════════════════════════════════════════════════════════════════════
-- Additive. Fixes the production FK failure where narrative transitions were
-- written into transition_events (whose from_snapshot_id/to_snapshot_id
-- reference ONLY entity_snapshots) while carrying narrative_snapshots ids —
-- a cross-table reference-domain mismatch that Postgres rejected on every
-- narrative transition with a non-null snapshot id.
--
-- The invariant, now complete across all three transition ledgers:
--     transition_events         → entity_snapshots(id)
--     narrative_transitions      → narrative_snapshots(id)     (THIS FILE)
--     relationship_transitions   → relationship_snapshots(id)
-- Each transition table references ONLY its own snapshot table.
--
-- Mirrors relationship_transitions (005 §5) exactly, except:
--   • subject column is entity_uid → institutional_entities(uid), because
--     narratives ARE institutional entities (entity_type='narrative'), the
--     same subject column transition_events and narrative_snapshots use;
--   • the transition_type vocabulary is the narrative subset that
--     transition_events was widened to accept in 005 §2.
--
-- transition_events is NOT altered here: its foreign keys are untouched and
-- its widened type check is left as-is (harmless — nothing routes narrative
-- rows there anymore after the writer change).
--
-- Apply in the Supabase SQL editor after 006, before deploying the matching
-- backend. Idempotent (create ... if not exists).

create table if not exists public.narrative_transitions (
  id               uuid primary key default gen_random_uuid(),
  entity_uid       text not null references public.institutional_entities(uid),
  transition_type  text not null check (transition_type in (
                     'narrative_appeared',
                     'narrative_disappeared',
                     'member_added',
                     'member_removed',
                     'dominant_status_changed',
                     'coherence_strengthened',
                     'coherence_weakened',
                     'thesis_changed'
                   )),
  effective_at     timestamptz not null,
  -- nullable by design: appearance has no from-snapshot, disappearance has no
  -- to-snapshot. Both reference ONLY narrative_snapshots.
  from_snapshot_id uuid references public.narrative_snapshots(id),
  to_snapshot_id   uuid references public.narrative_snapshots(id),
  from_value       jsonb,
  to_value         jsonb,
  magnitude        numeric,
  basis            jsonb not null,
  schema_version   integer not null,
  event_key        text not null unique,
  created_at       timestamptz not null default now()
);

create index if not exists narrative_transitions_uid_effective_idx
  on public.narrative_transitions (entity_uid, effective_at desc);

-- Security: identical backend-only posture as every other archive table.
alter table public.narrative_transitions enable row level security;
revoke all on public.narrative_transitions from anon, authenticated;
