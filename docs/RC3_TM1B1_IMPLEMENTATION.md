# RC3-TM1b1: consumer-stress spending qualification

Status: IMPLEMENTED / LOCAL GATES PASSED / DEPLOYMENT AND FRESH VALIDATION PENDING.

Recorded 2026-09-23 UTC (2026-09-22 America/New_York). The user accepted the
23-judgment human-review milestone and explicitly authorized TM1b1 implementation,
testing, commit, normal deployment and bounded production validation in the
attachment supplied with “this is the most recent, continue here”. Stop after
TM1b1; no next trigger family or milestone is authorized.

## Exact boundary and rule

Only `app/theme_graph.py` changes runtime behavior. Existing TM1a resolver
grounding runs unchanged, followed by the unchanged first-three-keyword scoring.
Before a pair enters contributor/score/source/category/recency accounting:

1. The theme must be `consumer-stress`.
2. There must be no counted entity support.
3. All counted keyword support must belong to the spending family. Repeated
   entries and `spend`, `spends`, `spent`, `spending` do not establish independence.
   No new morphological matches are added to the ontology or matcher.
4. The primary title or snippet must contain an affirmative, bounded clause
   connecting household/consumer/family/shopper spending to pressure. Supported
   forms include households cutting/reducing/pulling back on spending, pressure
   crimping spending among consumers, spending by households falling, household
   budget/purchasing-power constraints, and spending falling as family budgets
   tighten. Relation patterns restrict the intervening words and their length.
5. Question, negation, hypothetical and easing/recovery clauses abstain. Title
   and snippet are checked separately; sentence and contrast boundaries are not
   crossed. Corporate/government spending plus disconnected household context
   does not qualify. A separate affirmative household clause can qualify a mixed
   article.

If the spending-only pair fails this test, it contributes nothing, including no
generic-keyword ratio bookkeeping. Accepted matches retain their original points
and weights. Other keywords/entities bypass this gate, including existing
consumer-specific phrases and other generic families. Their semantics remain
outside this slice. No ontology, entity resolver, graph, event propagation,
frontend, admission, score formula, TM1a or historical data changes were made.

## Controls and provenance

`tests/fixtures/theme_spending_controls.json` contains 24 controls:

- Three retained primary records: J01 (Google AI investment), J03 (household
  pressure), and a UK fighter-jet government-spending negative. Text and entity
  hints are exact retained inputs. Only J01/J03 carry existing human judgments.
- Two newly sourced development excerpts, **not production captures**: a
  [Federal Reserve national-summary excerpt](https://www.federalreserve.gov/monetarypolicy/beigebook202602-summary.htm)
  describing lower-income consumers pulling back, and an
  [IDC infrastructure-investment headline](https://www.idc.com/resource-center/blog/ai-infrastructure-spending-caps-historic-year-at-90-billion-in-q4-2025-2029-spending-to-eclipse-1-trillion/).
  The Fed excerpt is contiguous; the IDC title is exact. No invented feed
  provenance or human benchmark approval is attached to either.
- Nineteen explicitly synthetic controls: positive household/budget/purchasing
  power relations, mixed positive/neutral articles, corporate/acquisition/
  financing cases, negation, easing, ambiguity, hypothetical and neutral/growth
  states. Fixture expectations are development contracts, not benchmark truth.

Additional parameterized tests cover disconnected fields/clauses, repeated words,
duplicate/morphological catalog entries, different subjects in the same clause,
questions, and independently supported bypasses. Synthetic seeds make the actual
ontology emit so membership assertions are meaningful. The unrelated-output
check also seeds AI and defense themes and compares their full nonempty payloads
with immutable baseline output.

The boundary fixture contains the four unedited June consumer-stress primaries,
their original timestamps, hints and weights. It is a retained subset, not a new
production cycle. Full-snapshot replay separately includes all 67 clusters.

## Before/after and retained-cycle impact

Baseline is Git `fe93a34` (runtime matching from `01301d2`), loaded independently
in memory. Final focused contract: **28 failed / 13 passed before; 41 passed after**.
J01 incorrectly contributes before and is excluded after. J03 contributes in
both. All added controls follow their recorded expectations after the fix.

`scripts/replay_tm1b1.py` verifies all retained source SHA256 values, isolates
momentum in memory, disables persistence, and calls the actual baseline and
current extractors plus `build_market_events`. It uses read-only trace capture
for pre-emission rank/confidence; it does not substitute a new scoring model.
See [machine-readable replay](diagnostics/rc3-tm1b1/replay.json).

| June retained snapshot | Before | After |
|---|---|---|
| J01 contributor rank | 3 | Excluded |
| Government-spending rank | 2 | Excluded |
| J03 contributor rank | 4 | 2 |
| Top-five membership | 4 contributors | Remaining 2, including J03 |
| Confidence | 38 | 21 |
| Stories / primary source labels / breadth | 4 / 3 / 4 | 2 / 2 / 2 |
| Consumer-stress emitted | Yes | Yes (floor 20) |
| Replayed admitted event count | 41 | 41 |

Only J01 and the government-spending event lose `consumer-stress` in the event
replay. Their existing AI/treasury/defense theme IDs remain. The other retained
contributor (`188014636b8b`) is supported by an existing entity route and is
deliberately unchanged; this release does not endorse that route's relevance.

All other theme ranks, confidence, top-five and emissions are unchanged across
all four snapshots. The two July snapshots and closed September cycle-139
snapshot have no changes at all. These are current-code historical replays,
not historical-runtime claims or new production validation. In particular, the
cycle-139 event reconstruction produces 35 events with both versions whereas
the stored production record has 33; unchanged reconstruction is not a claim
to reproduce every historical pipeline boundary.

## Gates and review

- Final spending contract: 41 passed.
- Relevant theme/entity/pipeline/event/explanation/momentum/diagnostic checks:
  passed; also covered by the full suite.
- Full backend: **1,384 passed**, two existing short-HMAC-fixture warnings.
- Frontend suites/build/type-check: not required; no shared contracts or frontend
  files changed. Existing dirty `frontend/tsconfig.tsbuildinfo` is excluded.
- Diff/whitespace check passed. Runtime diff explicitly reviewed: one gate for
  the authorized theme/trigger pair and delayed equivalent keyword bookkeeping.
- No benchmark ledger/manifest or human labels changed. Acceptance status is
  recorded separately from the 23 existing judgments.

The local venv launcher points at an inaccessible Python installation. Checks
used bundled Python 3.12.14 with this workspace's existing `.venv/Lib/site-packages`
on `PYTHONPATH`. A fresh unique `--basetemp` avoided an inaccessible pre-existing
pytest temp directory; no test behavior was bypassed.

## Files in implementation slice

- `app/theme_graph.py`
- `tests/test_theme_spending_qualification.py`
- `tests/fixtures/theme_spending_controls.json`
- `tests/fixtures/theme_spending_retained_boundary.json`
- `tests/fixtures/theme_spending_unrelated_baseline.json`
- `scripts/replay_tm1b1.py`
- `docs/diagnostics/rc3-tm1b1/replay.json`
- This implementation record and the phase/milestone status document.

The accepted TM1b diagnosis/adjudication artifacts are preserved in a separate
documentation commit, keeping the runtime correction independently reversible.

## Release and production validation

Implementation SHA and deployment result will be recorded after release. Railway
is the existing deployment provider; deploy from the configured repository branch
without changing production configuration. The dashboard currently reports an
outstanding balance while both services are online; no billing action is part
of this task.

Production validation must inspect a successful post-deployment full cycle and
an exact corporate-spending negative plus household-pressure positive. Require
primary text/hints, contribution/membership evidence and resulting theme IDs,
and check unrelated memberships in those records. Absence from top five alone
does not establish exclusion. If suitable controls/access are unavailable,
leave production validation pending. Never manufacture production articles or
rewrite historical records to obtain a pass.

## Limits and rollback

This is a conservative English relation matcher over primary title/snippet,
not a semantic classifier or article-body reader. It can abstain on valid
paraphrases, cross-sentence explanations, ambiguous pronouns, uncommon word order,
or clauses containing negation/relief alongside a distinct pressure claim. Existing
specific keyword/entity routes can still accept contextual or irrelevant records;
those are intentionally outside TM1b1. No production-wide precision/recall claim
is supported by this development set.

Rollback: revert only the isolated TM1b1 implementation commit through the normal
release path. No migration or persisted-history rewrite needs reversal. Keep
TM1a, EA1, EA2a, ET1a and RC2 closed. DI1 and later milestones remain unstarted.
