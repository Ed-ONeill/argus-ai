-- ============================================================
-- Argus M3.3 — Prediction and Outcome Ledger
--
-- Additive migration. Apply in the Supabase SQL Editor AFTER 005.
-- M3.1/M3.2 tables and behavior are untouched.
--
-- Core principle enforced by shape: predictions and outcomes are SEPARATE
-- records written by separate processes. The issued prediction payload is
-- immutable — only the status columns may change after issuance; an outcome
-- never modifies its prediction. Calibration is a join, never a stored opinion.
--
-- Security model identical to 004/005: RLS enabled with zero policies +
-- revoke all from anon/authenticated; backend service role only.
-- ============================================================

-- ── prediction_records ────────────────────────────────────────────────────────
-- One row per admitted prediction. prediction_uid is deterministic over the
-- semantic content (subject, type, scope, expected state, horizon,
-- assumptions, issuance boundary) — wording changes alone do NOT mint a new
-- prediction. scope_key discriminates multiple predictions of one type about
-- one subject (the rel_uid for relationship_persistence, the narrative UID
-- for narrative_membership, 'conviction' for conviction_threshold), so the
-- unique constraint enforces the issuance policy at the database level:
-- once per subject per type per scope per UTC day (backstop; the writer
-- also checks before inserting).

create table if not exists public.prediction_records (
  id                      uuid primary key default gen_random_uuid(),
  prediction_uid          text not null unique,
  subject_uid             text not null,
  subject_type            text not null,
  prediction_type         text not null check (prediction_type in (
                            'relationship_persistence',
                            'narrative_membership',
                            'conviction_threshold'
                          )),
  scope_key               text not null,
  issued_at               timestamptz not null,
  issuance_boundary       date not null,
  effective_from          timestamptz,
  resolve_after           timestamptz not null,
  resolve_before          timestamptz,
  horizon_label           text,
  statement               text not null,
  expected_state          jsonb not null,
  probability             numeric,        -- null in M3.3: no decomposable canonical method exists
  confidence_basis        jsonb,
  assumptions             jsonb not null,
  invalidation_conditions jsonb not null,
  evidence_refs           jsonb not null,
  graph_version           text,
  source_snapshot_ids     jsonb not null, -- natural-key references {table, uid, snapshot_date}
  status                  text not null default 'active' check (status in (
                            'active', 'pending_resolution', 'resolved',
                            'expired_unresolved', 'invalidated',
                            'withdrawn_due_to_data_error'
                          )),
  status_updated_at       timestamptz,
  provenance              jsonb not null,
  schema_version          integer not null,
  writer_version          text not null,
  payload                 jsonb not null,
  payload_hash            text not null,
  created_at              timestamptz not null default now(),
  unique (subject_uid, prediction_type, scope_key, issuance_boundary, schema_version)
);

create index if not exists prediction_records_subject_idx
  on public.prediction_records (subject_uid, issued_at desc);
create index if not exists prediction_records_due_idx
  on public.prediction_records (status, resolve_after);
create index if not exists prediction_records_type_idx
  on public.prediction_records (prediction_type, status);

-- ── outcome_records ───────────────────────────────────────────────────────────
-- One final outcome per prediction in M3.3 (outcome_uid is deterministic from
-- the prediction_uid, so retries cannot duplicate). The outcome stores the
-- exact resolution rules applied, so a future reviewer can reconstruct why
-- the verdict was assigned. Invalidated is DISTINCT from contradicted and is
-- never hidden from statistics.

create table if not exists public.outcome_records (
  id                          uuid primary key default gen_random_uuid(),
  outcome_uid                 text not null unique,
  prediction_uid              text not null references public.prediction_records(prediction_uid),
  subject_uid                 text not null,
  prediction_type             text not null,
  observed_at                 timestamptz not null,
  resolution_date             date not null,
  observed_state              jsonb not null,
  verdict                     text not null check (verdict in (
                                'confirmed', 'partially_confirmed', 'contradicted',
                                'invalidated', 'unresolved', 'unresolvable_data_gap',
                                'expired_without_test'
                              )),
  score                       numeric,   -- separate from verdict; null for non-scorable verdicts
  resolution_method           text not null,
  resolution_rules            jsonb not null,
  evidence_refs               jsonb not null,
  market_context_snapshot_ids jsonb not null,   -- [] in M3.3: no market-context records exist
  reviewer_type               text not null check (reviewer_type in ('automated_resolver')),
  provenance                  jsonb not null,
  schema_version              integer not null,
  writer_version              text not null,
  created_at                  timestamptz not null default now()
);

create index if not exists outcome_records_prediction_idx
  on public.outcome_records (prediction_uid);
create index if not exists outcome_records_type_verdict_idx
  on public.outcome_records (prediction_type, verdict);
create index if not exists outcome_records_subject_idx
  on public.outcome_records (subject_uid, resolution_date desc);

-- ── prediction_resolution_runs ────────────────────────────────────────────────
-- Audit + idempotency ledger for the resolver (separate process from issuance).

create table if not exists public.prediction_resolution_runs (
  id               uuid primary key default gen_random_uuid(),
  run_key          text not null unique,
  started_at       timestamptz not null,
  completed_at     timestamptz,
  status           text not null check (status in ('running', 'completed', 'failed')),
  predictions_seen integer not null default 0,
  outcomes_created integer not null default 0,
  unresolved       integer not null default 0,
  errors           jsonb,
  metadata         jsonb
);

create index if not exists prediction_resolution_runs_started_idx
  on public.prediction_resolution_runs (started_at desc);

-- ── prediction_calibration_view ───────────────────────────────────────────────
-- Calibration-ready join for SQL analysis. Deliberately NOT a product accuracy
-- number: consumers must apply the credibility gates documented in
-- ARGUS_PREDICTION_OUTCOME_LEDGER_V1.md before deriving any aggregate claim.

create or replace view public.prediction_calibration_view as
select
  p.prediction_uid,
  p.subject_uid,
  p.subject_type,
  p.prediction_type,
  p.issuance_boundary,
  p.horizon_label,
  p.probability,
  p.status,
  o.verdict,
  o.score,
  o.resolution_date,
  o.schema_version as outcome_schema_version,
  p.schema_version as prediction_schema_version
from public.prediction_records p
left join public.outcome_records o on o.prediction_uid = p.prediction_uid;

-- ── Security ──────────────────────────────────────────────────────────────────

alter table public.prediction_records         enable row level security;
alter table public.outcome_records            enable row level security;
alter table public.prediction_resolution_runs enable row level security;

revoke all on public.prediction_records         from anon, authenticated;
revoke all on public.outcome_records            from anon, authenticated;
revoke all on public.prediction_resolution_runs from anon, authenticated;
revoke all on public.prediction_calibration_view from anon, authenticated;
