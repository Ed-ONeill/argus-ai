# ARGUS PREDICTION & OUTCOME LEDGER V1 (M3.3)

A durable, auditable record of what Argus expected, what happened, and how the
verdict was determined. **An institutional accountability system, not a
trading-signal product.** Argus does not claim to predict markets reliably,
and no product-level accuracy number exists until the credibility gates pass.

Implementation: `app/institutional_memory/{predictions,outcomes,resolution}.py`,
migration `supabase/migrations/006_prediction_outcome_ledger.sql`.

## 1. Core principle

Predictions and outcomes are **separate records written by separate
processes**. A prediction is immutable after issuance (only status columns
change). An outcome never modifies its prediction. Calibration is a derived
join, never a stored opinion.

## 2. Admission rules

A record is a Prediction only with ALL of: canonical subject UID · UTC
issued_at · supported type · scope key · explicit statement · resolution
window (`resolve_after`, constructed so the tested boundary is sealed before
resolution) · non-empty testable expected state · named assumptions · named
invalidation conditions · provenance · writer/schema versions · probability
ONLY when produced by a decomposable canonical method (**none exists today, so
every M3.3 prediction has probability = null**).

Never admitted: generic risks, watch items, scenarios, opportunities,
narrative descriptions, commentary, or could/may/might prose with no testable
expected state. `second_order_effects`, WMN cards, and Today's Take remain
what they are — not predictions.

## 3. Supported prediction types (M3.3 — deliberately narrow)

| Type | Rule (pre-registered, deterministic) | Scope key |
|---|---|---|
| `relationship_persistence` | a relationship recorded today remains active in the sealed record of the next UTC day | rel_uid |
| `narrative_membership` | a member theme remains a member of the same driver-set narrative at the next sealed boundary | narrative UID |
| `conviction_threshold` | sealed conviction at the next boundary stays ≥ (issued conviction − 3); 3 = the canonical ThemeMemory trend deadband | `conviction` |

NOT supported (and why): `lifecycle_transition` (no canonical engine emits
lifecycle expectations), `event_occurrence` (no verified event source),
`relative_market_response` / any price prediction (no reliable adjusted-price
source, no benchmark definition — see §9). The frontend predictionEngine is
NOT ported; its outputs remain frontend projections.

## 4. Identity and issuance policy

`prediction_uid = "prediction:v1:" + sha256(canonical_json(semantic))[:32]`
over subject, type, scope, expected state, resolution window, sorted
assumptions, probability, schema version, and the issuance boundary (UTC
date). Statement wording is excluded — rewording never mints a new
prediction; material changes always do.

Issuance: **once per subject per type per scope per UTC day**, on the first
eligible cycle. Enforced by an in-process day guard, a pre-insert existence
check, and `unique(subject_uid, prediction_type, scope_key,
issuance_boundary, schema_version)`. Retries and restarts cannot duplicate;
intraday state drift does not reissue. Predictions are never deleted.

## 5. Resolution methodology

The resolver (`resolution.py`) runs separately from issuance, once per UTC day
(deterministic `run_key = resolve:v1:<date>`), after daily snapshots and M3.2
records are written. It resolves only predictions whose `resolve_after` has
passed, refuses to resolve an unsealed boundary (defense in depth against
future leaks), and reads **persisted sealed records only** — never in-memory
state. Verdict rules are stored verbatim on every outcome
(`resolution_rules`), with the exact records consulted in `evidence_refs`, so
a reviewer can reconstruct every verdict.

Data-gap discriminator (inherited from M3.2): theme writes on the boundary
day prove the writer ran. Absence with a live writer is a genuine negative
(contradicted); absence without one is `unresolvable_data_gap` — never a
verdict.

## 6. Invalidation ≠ incorrectness

Before any correctness rule runs, the subject's identity registry status is
checked: a retired/absorbed/superseded subject yields verdict `invalidated`
(stated assumption broke). Invalidated records are reported separately, never
counted as failures, and **never hidden to improve statistics**.

## 7. Scoring and calibration

Scoring is separate from verdicts: confirmed = 1.0, partially_confirmed =
0.5, contradicted = 0.0; invalidated/unresolved/data-gap/expired score
**null**, never zero. Calibration (`outcomes.compute_calibration`) reports
verdict counts, tested/untested split, confirmation rate over tested outcomes
only, probability buckets and Brier score **only where issued probabilities
exist** (none in M3.3), and the credibility gates:

- ≥ 30 tested outcomes per prediction type
- ≤ 20% untested (unresolved/data-gap/expired) rate
- ≥ 10 outcomes per probability bucket (when probabilities exist)
- resolution rules stable (single schema version) across the sample

Until all gates pass, every calibration response carries: *"Credibility gates
NOT met — these figures are diagnostics, not an accuracy claim."* Issued
probabilities, when they ever exist, are stored exactly as issued and never
retroactively modified.

## 8. APIs (read-only; service role is the only writer)

```
GET /api/memory/v2/predictions?subject_uid&prediction_type&status&date_from&date_to
GET /api/memory/v2/predictions/{prediction_uid}
GET /api/memory/v2/predictions/{prediction_uid}/outcome
GET /api/memory/v2/entities/{uid}/predictions
GET /api/memory/v2/outcomes?prediction_type&verdict&subject_uid
GET /api/memory/v2/calibration/status
GET /api/memory/v2/calibration/by-type?type=...
```

Frontend clients cannot write predictions or outcomes (RLS + revoke, as
004/005). Any future manual review requires a separate authenticated admin
workflow with an audit trail — never direct table writes.

## 9. Non-goals and known limitations

- **No price forecasting.** Market-response outcomes require a canonical
  asset, a reliable adjusted-price source, an explicit measurement window,
  and benchmark-relative definitions — none of which exist yet. Missing data
  must produce `unresolved`, not a wrong verdict, and that machinery is
  future work.
- **No probabilities issued** (no decomposable canonical confidence method).
- **No analog engine, no personalization, no user-facing scores.**
- One final outcome per prediction (interim outcomes deferred).
- `partially_confirmed` and `expired_without_test` are defined but no M3.3
  rule emits them (no documented intermediate conditions yet).
- Prediction volume is bounded by the curated backend graph (~30-60/day
  across the three types with all flags on).

## 10. Environment flags (safe defaults)

| Flag | Default | Meaning |
|---|---|---|
| `PREDICTION_LEDGER_ENABLED` | `false` | master switch; also requires institutional memory enabled |
| `PREDICTION_TYPES_ENABLED` | `relationship_persistence` | comma-separated type allowlist |

## 11. Production rollout

A. Apply migration 006 (SQL editor, after 005).
B. Deploy — issuance stays disabled (`PREDICTION_LEDGER_ENABLED` unset).
C. Verify `/api/memory/v2/calibration/status` reports `ledger_enabled: false`
   and the tables exist.
D. Set `PREDICTION_LEDGER_ENABLED=true` with the default single type
   (`relationship_persistence`).
E. Observe 24h of issuance: `[prediction-ledger] issued=… skipped_duplicate=…`.
F. Verify no duplicates:
   `select subject_uid, prediction_type, scope_key, issuance_boundary,
    count(*) from prediction_records group by 1,2,3,4 having count(*) > 1;`
G. The resolver activates automatically at the first eligible horizon
   (two UTC days after first issuance); watch `[outcome-ledger] due=… resolved=…`.
H. Manually audit the first 10 outcomes: each `resolution_rules.rule` must
   match the sealed snapshots it references.
I. Only then widen `PREDICTION_TYPES_ENABLED` to add
   `narrative_membership,conviction_threshold`.
J. Do not expose any accuracy metric publicly; the gates enforce this at the
   API level regardless.
