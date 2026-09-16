# Argus engineering execution record

## Product standard

Make the recurring research workflow trustworthy: identify what changed in a
user's coverage, show the supporting evidence and limits, retain their prior view,
and make the next review easier. Measure usefulness through tasks replaced and
repeat use. Executive credibility should come from demonstrable reliability and
traceable conclusions, not a claim that a particular executive will be impressed.

Do not add major features before semantic and operational trust improves. Keep
independent causes in independent commits and preserve closed RC3/RC2 boundaries.

## Operational release

Released `5049643` through the established GitHub main -> Railway workflow:

- `d6ee1f8`: failed local-to-cloud migrations preserve saved research/watchlists;
  successful migration refreshes the owning account query.
- `2a57561`: portable backend architecture-boundary test.
- `0b5ba5a`: Next.js 15.5.24 security patch and matching lint configuration.
- Included only the previously isolated closure/audit documentation alongside them.

GitHub's Railway statuses report success for both services: frontend at
2026-09-16 02:07:22 UTC; backend at 02:11:00 UTC. Authenticated production smoke
checks rendered Saved, Feed, and the Iran-munitions Event. That Event retained two
evidence records and displayed `2 source labels, 2 qualified`. Feed displayed its
source count and update age. No user saves were created/deleted, no login failure
was induced, and these observations do not constitute production fault injection
of the migration fix. Failure/retry behavior is covered by the local regression tests.

Remaining dependency advisories recorded in the audit are still open. Successful
deployment does not mean every dependency is clean or every research pipeline is
healthy.

## Theme integrity

- `89e0dc3`: RC3-TM1 causal diagnosis and offline mechanism audit.
- `01301d2`: isolated RC3-TM1a resolver-grounded ticker contributions.
- TM1a was pushed separately after the operational release passed its checks.
- See `RC3_TM1A_IMPLEMENTATION.md` for gates and production closure requirements.

An additional controlled reconstruction used all 125 retained observations,
current entity/category extraction and clustering, uniform `signal_score=50`, and
a fixed clock. It compared baseline `5049643` with TM1a, with momentum persistence
disabled. This is not an exact historical production replay.

| Quantity | Before | After |
|---|---:|---:|
| Input observations | 125 | 125 |
| Input clusters | 122 | 122 |
| Emitted themes | 12 | 11 |
| Admitted events | 29 | 29 |
| Admitted event evidence records | 29 | 29 |

The utility theme stopped emitting when its ordinary-word SO contributor was
removed: the remaining related NEE filings came from one source label and no
longer cleared the existing distinct-source gate. A commodity-LNG power-market
article also left the energy theme's top-five contributors. This is an expected
downstream consequence of removing unsupported entity contributions, not SEC
dedup work. No assertion is made that the unchanged event/evidence totals prove
all individual semantics correct.

The tool-controlled browser could render authenticated product pages, but direct
navigation to `/api/feed/` was blocked by the browser client. No cookies/tokens
were extracted and no auth bypass was attempted. Fresh-cycle source-to-membership
validation must therefore remain pending unless it can be observed through an
authorized working surface. UI smoke checks are not a substitute for that trace.

## Evaluation foundation

`evaluation/argus-trust-v1` seeds 125 traceable development observations and a
labeling codebook. All candidate annotations are null/unreviewed. There are zero
claimed annotated events and zero held-out events. The next data work is to
collect additional full-cycle examples, independently group and label 150-200
events, resolve review disagreements, and reserve genuinely unseen event groups.

Do not report precision improvements from candidate counts, generated labels, or
passing targeted regression tests.

## Next sequence

1. Verify TM1a's fresh-cycle negative/positive memberships and close it only on
   that evidence. Reopen implementation only for a demonstrated regression.
2. TM1b: diagnose generic-keyword and non-company ontology-term relevance against
   the reviewed examples, then implement a separately tested policy.
3. RC3-DI1: separate direct company involvement from contextual theme exposure.
4. RC3-MI1: make instrument identity, proxy role, units, and as-of dates explicit.
5. RC3-MA1: distinguish transaction existence, type, and lifecycle status.
6. RC3-HG1: ground Home explanations in recorded relationships and conditions.

Operational work has a separate lane: automated release gates; liveness/readiness/
freshness contracts using existing diagnostics; remaining dependency triage. Do
not merge those changes into semantic commits. After relevance is measurably
better, finish the Saved research loop using the existing archive/change ledger,
then validate it with real users before expanding features or notifications.
