# RC3-TM1a: Resolver-grounded ticker contributions

Status: IMPLEMENTED / DEPLOYED / PENDING FRESH-CYCLE PRODUCTION VALIDATION.

Implementation: `01301d2`. Railway deployment statuses succeeded for the frontend
at 2026-09-16 02:21:00 UTC and backend at 02:24:36 UTC. The browser client blocked
direct authenticated `/api/feed/` navigation; fresh source-to-membership controls
are therefore not claimed as verified. This slice is not closed.

After both services succeeded, the authenticated Iran-munitions Event loaded and
retained its BBC/FT evidence with `2 source labels, 2 qualified`. This is a bounded
post-deployment UI smoke check, not a collision-control or fresh-cycle closure.

## Boundary

One runtime file changes: `app/theme_graph.py`. A registry ticker must be
accepted by the existing `resolve_companies` function before contributing via
the theme matcher's hint or literal-text entity route. Resolution is cached once
per primary item for the duration of extraction. Non-ticker ontology entities,
keywords, hit weights/caps, duplicate-hit arithmetic, theme competition, emission
gates, and persistence code are unchanged. This consumes the existing RC2 resolver;
it neither changes nor reopens its rules.

This is an eligibility correction, not a promise that naming a company proves
every linked theme. Generic keywords, non-company ontology terms, and downstream
contextual asset propagation remain separate concerns.

## Before and after

The final regression setup has 17 tests. Before the runtime change, eight failed
and nine passed. After it, all 17 pass. The failures cover four retained SO/COST
headline/snippet examples and four case/hint collision controls. Synthetic
qualifying contributors make the actual ontology themes emit, so the assertions
check real contributor membership rather than only a regex.

Six explicit ticker/name/context cases remain admitted. Complete positive theme
payloads captured before implementation remain equal after it, including scores
and order, for consumer, utilities, Nvidia/Broadcom, GLP-1, and defense controls.
One compatibility case deliberately preserves generic-only matching for the
separate TM1b policy work.

Input clusters are unchanged. In the bounded event construction control, evidence
records, direct entities, and source/qualified-label counts are unchanged. There
is no change to evidence counting, clustering, event admission, or folding code.
Do not extrapolate the fixture invariant to all aggregate feed counts: changed
theme associations can alter existing downstream scores, contextual companies,
ordering, and admission/folding outcomes. Those effects need fresh-cycle review.

## Gates

- Focused matcher + RC2 entities + pipeline golden: 86 passed.
- Full backend: 1,343 passed; two warnings.
- Full frontend, including existing RC2/EA/ET regression coverage: 1,471 passed.
- Type-check passed; lint passed with four pre-existing warnings.
- Production build passed. No frontend runtime edits.
- Existing `frontend/tsconfig.tsbuildinfo` preserved, not included in the commit.

## Production validation required

After the backend deployment and a successful full refresh, inspect a current
ordinary-word collision control and a legitimate direct-company/theme control.
Trace primary title/snippet and resulting memberships, not just a missing chip.
Check evidence preservation and unexpected downstream event-count changes. An
authenticated rendered UI smoke check alone does not prove the matcher correction.

Keep this slice pending until those controls can be observed. Do not rewrite old
persisted events to manufacture a pass. Do not bundle generic keyword policy,
direct/contextual exposure, instrument identity, M&A, Home, OP1.2, or historical
remediation into this release.

Rollback, if a material new regression is proven: revert the isolated TM1a
implementation commit through the normal release workflow. Preserve the prior
operational fixes and diagnostics; no data migration requires reversal.
