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
| Unestablished deal lifecycle | Unknown fallback, headline precedence, withdrawal uncertainty, filing metadata guard; no assumed completed timeline stages | Production-shaped regression controls |
| Sector counts shown as industry counts | Industry-specific matching and measurements; parent-sector context labelled separately | Crypto versus Technology negative and existing positive controls |
| Comparison company selected as event subject | Select a uniquely headline-grounded resolved company; abstain when ambiguous | Disney/Netflix and multi-company controls |
| Device-only theme selections | Account-owned theme subscriptions with row-level isolation; explicit legacy import | Hook lifecycle controls and database isolation transaction |
| No personal review checkpoint | Saved notes, open question, timestamp and current-view snapshot; field changes since that checkpoint | Pure comparison and failed-save rendering tests |
| Home delays access to research | Compact signed-in greeting exposes the existing brief sooner | Production build and rendered validation |
| Listen has an unreadable loading state and unbounded RSS I/O | Explicit loading status, bounded download size/time and batch deadline | Existing registry controls plus transport deadline tests |
| Backend dependency drift and oversized installation | Separate hashed runtime/test locks; optional desktop/RAG dependencies excluded from production | Clean Python 3.12 environment and backend suite |
| Unrelated service deployments | Service-specific Railway watch paths | Configuration review; deployed behavior must be observed |
| Freshness conflated with refresh activity | Age-aware stale flag; authenticated readiness distinct from liveness | Cold, stale, refreshing, failed and healthy controls |
| No repository release automation | Frontend/backend CI, runtime audit, tooling advisory check, weekly dependency updates | Local equivalents; remote execution pending publication |
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

Apply `frontend/supabase/migrations/20261117_research_state.sql` before promoting
the frontend. It is additive, grants authenticated users access only to their
own rows, and removes anonymous access. Run the rollback-only test at
`frontend/supabase/tests/research_state_rls.sql`. It tests an owner read/write,
cross-account read/update/insert denial, and anonymous access denial without
retaining test records. The migration never changes existing intelligence data.

Legacy browser theme lists are preserved. They are not silently assigned to
the next person who signs in on a shared browser. Saved provides an explicit
import action, which skips already imported themes and retains original data
on both success and failure. Notes are user research, never benchmark labels.

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
