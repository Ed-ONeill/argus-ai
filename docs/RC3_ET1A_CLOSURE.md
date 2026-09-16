# RC3-ET1a — Event-Anchored Transmission-Chain Gating: Closure Record

**Status: CLOSED — IMPLEMENTED / DEPLOYED / AUTHENTICATED UI VALIDATED**

- **Slice:** RC3-ET1a — conservative display gate: the Event page presents a
  transmission chain only when the chain is directly anchored in the event.
- **Implementation revision:** `a48a06d` (`fix(rc3-et1a)`, 2026-09-15;
  frontend-only, 4 files).
- **Diagnosis basis:** the RC3-ET1 read-only diagnosis (this session's
  chain): the displayed chain was the highest-global-confidence linked
  theme's ontology recital (declared macro driver + first related assets),
  with theme linkage attachable through generic keywords and ticker/word
  collisions, and theme assets circularly injected into `event.companies`.
- **Closure recorded:** documentation only. No implementation, test,
  fixture, configuration, dependency, backend, graph, or production-data
  change accompanies this record.

---

## 1. The implemented gate (recorded from the code)

`chainGroundedInEvent` in `frontend/src/lib/eventView.ts`, applied inside
`buildWhyCare`:

- **Direct-event identity field:** `MarketEvent.companies_direct` —
  resolver-named companies from the event's own member text
  (`app/events.py`), a strict subset of `companies`, which also carries
  theme-injected `related_assets` and therefore never grounds a chain.
- **Comparison:** for each chain hop whose `target_uid` is a `company:`
  node, the canonical ticker segment (`uid.split(":").pop()`,
  uppercase-trimmed — the same convention the renderer's `actorFromUid`
  already uses; no new resolver or normalization system) is tested for
  membership in the uppercase-trimmed `companies_direct` set.
- **Retained:** when the chain has ≥ 2 rendered actors AND at least one
  company exposure-target hop matches a directly resolved entity of the
  same event, the existing selected chain renders byte-identically — same
  order, length, labels, wording, and numbers. Candidate generation,
  ordering, and selection are untouched; no alternative chain is sought,
  and a lower-ranked grounded alternative is never promoted.
- **Suppressed (fail closed):** when no company exposure-target matches —
  including missing, empty, or unusable `companies_direct`, entries that
  are unresolved names rather than canonical tickers (never
  substring-matched), and chains with no company exposure target at all —
  the view falls through to the existing honest no-chain fallback
  ("The market in focus here is X." or omission).
- **Dependent copy follows the same gate:** the connection prose and chain
  chips live only in the gated `whyInvestorsCare` result, and the
  chain-persistence watch line ("Watch whether the link between … persists")
  is built from `why.chain`, so suppression removes the chain, its prose,
  and its watch text together through the existing empty-state path. No
  suppressed chain's assertion survives elsewhere on the Event page.
- **Limit stated in the code and repeated here:** passing the gate
  establishes **minimum direct-event anchoring** — the event names at least
  one exposed company in the chain — **not full-chain causal validity**.

## 2. Implementation scope and gates (from the `a48a06d` records)

- Files: `frontend/src/lib/eventView.ts` (the gate),
  `frontend/src/lib/__tests__/chainGrounding.test.ts` and
  `frontend/src/components/__tests__/chainGroundingRender.test.tsx` (new
  suites: 17 tests, of which **11 fail on the pre-fix baseline**), and
  `frontend/src/lib/__tests__/eventView.test.ts` (two synthetic fixtures
  that used production-impossible driver→driver chains, re-grounded with
  their copy rules re-pinned).
- Test fixtures include retained-record analogues of the persisted
  2026-07-25 ontology recitals (COST/"cost" and SO/"so" ticker-word
  collisions, topical-AI-mention CEG/EQIX/NEE recital, circular
  theme-injected overlap) plus labeled synthetic controls; fail-closed,
  no-reselection, and rendered suppress-together cases; NVDA/AVGO, GLP-1,
  and Defense positive controls preserved exactly; payload byte-invariants.
- Gates recorded at implementation: focused suites 52/52; full frontend
  suite **1,461 passed** (including RC2 regression coverage); type-check
  clean; lint with the same four pre-existing warnings (none in touched
  files); production build passed; whitespace/diff checks clean;
  **backend diff empty**.
- Deployment: pushed to main through the established workflow; **both
  Railway deployment checks succeeded**; live frontend answered with the
  expected auth-gate redirect and backend `/api/health` returned 200.

## 3. Authenticated production validation (user-supplied, bounded)

The following observations are the **user's authenticated rendered-UI
production validation**, recorded here as supplied. They are not a new
inspection performed during this documentation task. No capture timestamp
or event identifier was supplied, and none is invented.

**Negative control** — Event: "Japan's Export Growth Stays Solid as
Shipments of Chips Jump":

- No transmission chain rendered.
- Why investors care: "The market in focus here is Semiconductors."
- No chain-derived persistence watch line.
- Evidence remained "1 source label."

**Positive control** — Event: "Apollo Gives $585 Million of Financing to
The Executive Centre":

- APO appeared as a directly involved company.
- Chain remained APO → ARES → BX.
- Why investors care: "The connection runs from APO to BX."
- Watch text: "Watch whether the link between APO and BX persists."
- Evidence remained "1 source label."

**Bounded conclusion:** the inspected production controls demonstrate
suppression of an ungrounded chain and preservation of a directly anchored
chain, with unchanged inspected evidence/source counts.

## 4. Evidence qualifications

- The two examples are bounded controls, not exhaustive production
  coverage; comprehensive state coverage is test-proven (§2), not
  production-enumerated.
- Rendered observations do not independently prove every underlying
  payload invariant; those are pinned by the test suite's byte-invariant
  assertions.
- APO anchoring the positive control's chain does not validate ARES, BX,
  every relationship in the chain, or any macro-driver hop.
- This closure does **not** claim that theme mapping, affected-company
  attribution, or full-chain relevance is corrected — the gate suppresses
  ungrounded display; it repairs no upstream mapping.

## 5. Explicitly outside this closure (separate work, unauthorized here)

- Broader theme-matcher hygiene; ticker/ordinary-word collisions
  (SO/"so", COST/"cost"); generic keyword matching.
- Ontology-edge provenance labeling (`basis: "recorded_graph"` on
  ontology-derived narrative edges).
- Theme-asset propagation into Companies Involved / Who's affected and
  entity-evidence matching.
- Full-chain causal validation.
- EA1 (`3f02e50`) and EA2a (`c5c3d44`) remain closed; RC2 remains closed;
  OP1.2 SEC 8-K dedup; historical remediation.

No new implementation slice is authorized by this record.
