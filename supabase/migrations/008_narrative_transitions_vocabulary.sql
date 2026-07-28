-- ══════════════════════════════════════════════════════════════════════════════
-- 008_narrative_transitions_vocabulary.sql — complete the narrative_transitions
-- transition_type CHECK vocabulary
-- ══════════════════════════════════════════════════════════════════════════════
-- Additive. Fixes a production CHECK violation (SQLSTATE 23514) on
-- narrative_transitions: 007's transition_type CHECK omitted
-- 'contradiction_added' / 'contradiction_removed', which
-- derive_narrative_transitions emits from narrative_snapshots.contradiction
-- counts (transitions.py:328). Narratives had inserted into transition_events
-- before, whose (005-widened) CHECK included these values, so the gap was
-- invisible until narratives moved to their own narrower CHECK in 007.
--
-- This migration replaces ONLY the narrative_transitions.transition_type CHECK
-- with the complete canonical vocabulary — the exact set emitted by
-- derive_narrative_transitions (8 value types) plus the two presence types the
-- writer passes to derive_presence_transitions for the narrative domain. It
-- does NOT drop/recreate the table, delete data, or alter any other table or
-- constraint. tests/test_narrative_transitions_fk.py derives the emitted set
-- straight from the code and asserts it equals this list, so app vocabulary
-- and migration vocabulary cannot drift apart again.
--
-- Apply in the Supabase SQL editor after 007, before deploying. Idempotent
-- (drop constraint if exists; the constraint name is 007's auto-generated
-- inline name, deterministic per Postgres single-column CHECK naming).

alter table public.narrative_transitions
  drop constraint if exists narrative_transitions_transition_type_check;

alter table public.narrative_transitions
  add constraint narrative_transitions_transition_type_check
  check (transition_type in (
    -- value transitions (derive_narrative_transitions)
    'member_added',
    'member_removed',
    'dominant_status_changed',
    'coherence_strengthened',
    'coherence_weakened',
    'contradiction_added',
    'contradiction_removed',
    'thesis_changed',
    -- presence transitions (derive_presence_transitions, narrative_* args)
    'narrative_appeared',
    'narrative_disappeared'
  ));
