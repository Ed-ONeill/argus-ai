# Argus audit remediation

The November 17 audit identified dependency exposure, unsupported transaction
roles, inherited sector readings, ambiguous event subjects, fragmented personal
research storage, and release/evaluation gaps. The user authorized implementation
of these findings and publication after verification. This release does not
change theme matching, event membership, graph semantics, or benchmark truth.

## Implemented changes

| Finding | Correction | Verification |
| --- | --- | --- |
| Runtime dependency advisories | Compatible Next 15 patch, patched image/CSS/transitive dependencies, updated test DOM | Production dependency audit; full frontend gates |
| Buyer and target inferred from mention order | Omit roles without an explicit acquisition grammar; no acquirer assigned to an equal merger | Chevron/Blackstone negative; Microsoft/Activision positive |
| Sponsor mention totals described as deployed capital | Report-mention labels; suppress overlapping/mixed-currency capital totals; require locally bound named bidder roles | Negative sponsor/target/bidder controls and preserved explicit acquisition |
| Unestablished deal lifecycle | Unknown fallback, headline precedence, withdrawal uncertainty, filing metadata guard; no assumed completed timeline stages | Production-shaped regression controls |
| Sector counts shown as industry counts | Industry-specific matching and measurements; parent-sector context labelled separately | Crypto versus Technology negative and existing positive controls |
| Crypto tape treated BTC/ETH US-listed ETF symbols as token prices | Explicit crypto dollar-pair requests, response identity checks, currency and bar date labels | Wrong-exchange negative and correct-token/stock positives |
| Comparison company selected as event subject | Select a uniquely headline-grounded resolved company; abstain when ambiguous | Disney/Netflix and multi-company controls |
| Device-only theme selections | Account-owned theme subscriptions with row-level isolation; explicit legacy import | Hook lifecycle controls and database isolation transaction |
| No personal review checkpoint | Saved notes, open question, timestamp and current-view snapshot; field changes since that checkpoint | Pure comparison and failed-save rendering tests |
| Home delays access to research | Compact signed-in greeting exposes the existing brief sooner | Production build and rendered validation |
| Listen has an unreadable loading state and unbounded RSS I/O | Explicit loading status, bounded download size/time and batch deadline | Existing registry controls plus transport deadline tests |
| Backend dependency drift and oversized installation | Separate hashed runtime/test locks; optional desktop/RAG dependencies excluded from production | Clean Python 3.12 environment and backend suite |
| Unrelated service deployments | Service-specific Railway watch paths | Final frontend promotion explicitly skipped the unchanged backend |
| Freshness conflated with refresh activity | Age-aware stale flag; authenticated readiness distinct from liveness | Cold, stale, refreshing, failed and healthy controls |
| No repository release automation | Frontend/backend CI, runtime audit, tooling advisory check, weekly dependency updates | Local checks and recorded GitHub release runs |
| No safe holdout scoring runner | Explicit human provenance, exposed-candidate exclusion, missing-prediction accounting | Synthetic runner tests; no truth labels changed |

## Security exception

The production dependency audit has no exemptions. A current unpatched
picomatch advisory, GHSA-fc5q-39xc-vjpf, remains in development/build tooling.
These patterns are repository-controlled, not user input to the deployed app.
CI has read-only repository permissions, no production secrets, and bounded
job duration. The tooling gate allows only this named advisory and fails on
new high/critical advisories. This is containment, not a claim that upstream
picomatch has been patched. Reassess and remove the exception when a fix exists.

## Research storage migration and recovery

Applied `frontend/supabase/migrations/20261117_research_state.sql` before promoting
the frontend on November 17. It is additive, grants authenticated users access only to their
own rows, and removes anonymous access. Run the rollback-only test at
`frontend/supabase/tests/research_state_rls.sql`. It tests an owner read/write,
cross-account read/update/insert denial, and anonymous access denial without
retaining test records. The migration never changes existing intelligence data.
The authenticated production SQL transaction passed all these checks and rolled
back its fixture writes before the application release.

## Verified release gates

Implementation revision: `7179b14709347dda57771242e1cdfcc983b8f539`.
Backend runtime revision: `964ee270474ed4e37800ed60aa4d0d3101137c2f` (unchanged by the final frontend corrections).
Published on `codex/audit-remediation`, then promoted to `main` only after
[GitHub release checks](https://github.com/Ed-ONeill/argus-ai/actions/runs/44166519242)
passed. The jobs use pinned maintained actions and Ubuntu 24.04.

- 1,536 frontend tests across 94 files passed locally and in GitHub.
- 1,395 backend tests passed from an isolated copy of the exact committed tree;
  the cloud backend job also passed hash-verified installation and `pip check`.
- Type-check, lint, production build and both dependency checks passed.
- Four existing frontend lint warnings remain. Two backend warnings concern
  short test-fixture HMAC keys, not production keys.
- Production dependency audit: zero vulnerabilities. Tooling exception is
  separately documented above.
- Pre-existing TM1b1 test edits and unrelated local files were excluded. The
  working-copy suite's extra 18 tests are not counted as committed release tests.

Legacy browser theme lists are preserved. They are not silently assigned to
the next person who signs in on a shared browser. Saved provides an explicit
import action, which skips already imported themes and retains original data
on both success and failure. Notes are user research, never benchmark labels.

The release checks are installed and were followed for this promotion. GitHub
branch-protection rules and an external readiness monitor are not configured by
this release; a successful workflow is not proof that future direct pushes are
technically prevented.

## Release and rollback

1. Run frontend tests, type-check, lint, production build and both audit checks.
2. Install `requirements/test.txt` in a clean Python 3.12 environment with hash
   verification; run `pip check` and the backend suite.
3. Review the exact committed diff. Exclude pre-existing TM1b1 work and local
   unrelated files. Publish the branch; require both CI jobs before promotion.
4. Apply and verify the additive research migration before frontend promotion.
5. Verify authenticated Event, M&A, Industries, Saved and Listen rendering.
   Check persistence after a reload. Remove only explicitly identified validation
   fixtures; retain user research. Check `/api/feed/status` and `/api/readiness`.
6. Roll back application deployments to the prior successful revision if needed.
   Keep the additive research table so new user notes are not lost. Do not reset
   the Railway volume or delete institutional memory during rollback.

Regenerate backend locks with `uv pip compile --python-version 3.12 --universal
--generate-hashes`. Regenerate the test lock with `--constraint
requirements/backend.txt`. Verify clean installation after each lock update.

## Evidence still required

- TM1b1 remains pending its specified fresh-cycle negative/positive controls.
  A healthy deployment or a corporate-spending mention in a related member is
  not a substitute for the required primary-article control.
- The 125 development candidates remain unreviewed benchmark candidates. The
  accepted 23 TM1b judgments remain separate. Independent human holdout labels
  are required before a product-wide precision claim.
- Retention, willingness to pay, research time saved, and investment performance
  cannot be established by an implementation or synthetic test.
- A full production disaster-recovery exercise and capacity test are separate
  operational evidence; local persistence tests do not prove either.

EA1, EA2a, ET1a, TM1a and RC2 remain closed. No publisher normalization, URL
canonicalization, semantic agreement engine, OP1.2 deduplication or historical
remediation is included.

## Pilot decision rule

Use a small consenting cohort with a defined coverage list. Ask them to maintain
research in Saved for two weeks, record actual useful findings and false alarms,
and compare research time with their prior workflow. Review checkpoints support
this workflow; they are not automatically uploaded as analytics or used as truth
labels. Expansion should depend on repeated voluntary use and independently
reviewed accuracy, not feature count. No outreach or recruitment is automated.

## Authenticated production observations

Initial deployment: frontend `22618637-b8e1-48b0-aa49-95f3cb88b94c`, backend
`7db525e6-7224-4d07-8ff4-988112080837`. Both reported successful deployment.
Backend dependency installation used the hashed runtime list and finished in
21 seconds without installing torch/CUDA dependencies. Both effective Railway
configurations displayed their service-specific watch patterns.

- Disney event `33054ca42eab` rendered the DIS chart and retained two evidence
  records, with `2 source labels, 2 qualified`.
- Crypto displayed its own signal score 4 and one story. Media & Telecom showed
  `Not measured`, with six parent-sector stories explicitly labelled context.
- M&A preserved Chevron/Blackstone role omission and `Negotiating`, CVC
  `Withdrawal reported`, and generic 8-K `Not established` states. Further live
  observations prompted the separate `d939f3f` correction: generic target
  descriptions, unbound rival names and unsupported capital-deployed totals.
- Saved displayed a new subscription from Listen in a separate tab. A clearly
  labelled release-validation note, question and timestamp persisted after full
  reload, with `No recorded fields changed since your review.` The temporary
  watch selection was restored to its original empty state. The labelled review
  checkpoint is retained separately; it is not a user investment view or a
  benchmark label. The UI check covers reload/separate-tab persistence, not a
  second physical device; database ownership isolation was tested separately.
- Listen rendered 14 podcasts after the bounded ingestion completed.
- Signed-in Home displayed the compact greeting, brief entry point, dated ETF
  reference cards and current reporting.
- Readiness first reported `awaiting_successful_cycle` with a cached snapshot,
  then reported `ready` after a normal successful cycle. No forced pipeline run.
- Full-feed cycle `20261117T195526671362Z` completed at
  `2026-11-17T19:57:23.562317+00:00`; all stages were `ok`, with memory cache,
  disk cache and institutional-memory persistence successful. This verifies
  successful normal persistence, not disaster recovery.

Source coverage was partial: the cycle recorded four source errors. A read-only
check found Yahoo Finance returning HTTP 429, PE Hub and Buyouts returning HTML
at their configured RSS URLs, and the Federal Reserve returning valid XML
locally despite its production parse error. These are not resolved by readiness
being green. No paywall/rate-limit bypass or invented replacement reporting was
introduced. Provider availability remains an operational limitation to monitor.

The frontend-only promotion at `36fa16d` created frontend deployment
`738ce69a-792d-4cc4-98dc-5183615e6e2c`. Railway explicitly skipped backend
deployment `d07244f4-c1a2-42f6-b76b-9cdbb2438036` with `No changes to watched
files`, retaining the successful backend and its running refresh cycle.

Authenticated validation of `36fa16d` confirmed BTC at 64620.23 USD and ETH at
1829.76 USD, each with the actual November 17 bar date and an explicit stale
marker. These are bounded observations, not live-price guarantees. The page
labels broader AI/Technology material as market/sector context. M&A retained
Johnson & Johnson as buyer while omitting the unnamed biotech target, omitted
an unsupported rival bidder for the Chevron/Blackstone story, and displayed
`Sponsor Mentions` / `reports, not capital deployed` without the prior aggregate
capital totals. A final wording-only correction (`7179b14`) replaces inferred
sector momentum with the actual share classified as rumored, negotiating or
announced; local tests, types, lint and build passed again.

Final frontend deployment `38a18c19-e9e3-420b-af88-38701e532468` reported
successful deployment of `7179b14`. The exact branch revision passed both GitHub
jobs (run `44166519242`) before promotion to main.
After a full authenticated reload, M&A rendered `reports · classified deal
stages` and the numeric classification shares (including Other 33% and
Financials 0%), without the prior `steady`/`maturing` assertions. The live feed
had refreshed to 15 reports; no claim is made that counts stay fixed between
different production snapshots.
