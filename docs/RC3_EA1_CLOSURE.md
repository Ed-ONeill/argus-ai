# RC3-EA1 — Path 3 Clustering Integrity: Closure Record

**Status: CLOSED — IMPLEMENTED / DEPLOYED / FRESH-CYCLE VALIDATED**

- **Slice:** RC3-EA1 — Path 3 (salient-anchor) clustering: a lone shared anchor
  no longer merges events.
- **Implementation revision:** `3f02e50` (`fix(rc3-ea1)`, 2026-09-14).
- **Closure recorded:** 2026-09-15, documentation only. No code, test, fixture,
  configuration, dependency, or data change accompanies this record.

---

## 1. Diagnosis (history preserved; see the implementation records)

Path 3 of `_should_cluster` (`app/clustering.py`) merged two same-category
stories on ONE shared capitalized "salient anchor" token. Country and generic
topical words qualify as anchors ("China", "Iran", "Canada", even "Here's"),
so provably unrelated events were grouped into one cluster, whose articles the
event layer then displayed verbatim as corroborating evidence — producing
"N sources, N agree" over off-topic cards.

Evidence grounding the diagnosis (recorded in the `3f02e50` commit message and
the `tests/test_clustering_path3.py` docstring):

- **Authenticated production capture (2026-09):** the event "China criticises
  idea it is in 'malicious competition' over AI" displayed "4 sources, 4 agree"
  with three unrelated China-subject stories as evidence.
- **Persisted record** (`data/feed_cache/feed_0f875b7be67b.pkl`, cycle
  generated 2026-07-25T17:26Z): four multi-story clusters, ALL cross-event,
  joined on the anchors `heres`, `canada`, `iran`, `trumps`. Across both
  persisted 2026-07-25/07-25b production records the defect reproduces
  7 times.

## 2. Implementation (revision `3f02e50`)

The defect was corrected narrowly, in Path 3 only:

- A Path-3 merge now requires **affirmative event-specific support**: a second
  shared anchor, or ≥ `_ANCHOR_MIN_SUPPORT` (2) additional shared non-generic
  content tokens between the headlines. The anchor and its singular/plural
  variants never support themselves.
- **Generalized subject-divergence guard:** two headlines that each carry
  salient anchors the other lacks are treated as different events regardless,
  mirroring the pre-existing ticker guard.
- **Unchanged:** Paths 1 and 2, anchor extraction, time windows, evidence and
  corroboration-counting semantics.

Files changed: `app/clustering.py` (+51/−6) and the new
`tests/test_clustering_path3.py` (623 lines).

## 3. Pre-deployment validation (as recorded at implementation)

Per the `3f02e50` records:

- **Before/after regressions:** `tests/test_clustering_path3.py` runs
  production-captured, persisted-record, and synthetic fixtures through the
  real pipeline surface (`fetch_all → cluster_items → build_market_events →`
  API response builder); 11 of its 16 tests fail on the pre-fix baseline.
- **Persisted-record repair:** on both persisted production records the
  correction separates all 7 cross-event merges and loses no legitimate merge.
- **Legitimate-clustering controls:** positive controls show Path 3 still
  merging paraphrased same-event coverage (two-anchor and anchor+support
  forms) that no other path can recover.
- **Gates:** backend/frontend test, type-check, lint, and build gates passed
  before the change shipped.

The correction was deployed via the standing push-to-main workflow.

## 4. Fresh-cycle production validation (user-supplied)

The following observations come from the **user's authenticated production
inspection** of a fresh `/api/feed/` cycle after deployment. This section
records that inspection; it is not a new inspection performed as part of this
closure. **A capture timestamp / cycle identifier for the snapshot was not
supplied.**

Snapshot shape:

- 78 feed items, 77 clusters, exactly one multi-story cluster observed.
- 78 items → 77 clusters is exactly explained by the one legitimate two-item
  merge; rejected unrelated articles remain represented separately.

Positive control (legitimate merge preserved):

- FT: "Iran war has left US with munitions 'shortfall', Pentagon watchdog
  says" and BBC: "Iran war has led to US munitions shortfalls, Pentagon
  inspector confirms" — independent reports of the same event — remain
  clustered together; the rendered Feed reports "2 sources".

Negative controls (cross-event merges no longer occur):

- "US prosecutors say Chinese groups used Binance to launder $61mn from
  Iranian oil deals" remains separate from the Iran-munitions event.
- "Treasury announces 19-Year 11-Month Bond" and "Treasury announces 6-Week
  Bill" remain separate events.
- No obvious cross-topic multi-source cluster was observed.

Fragmentation:

- No obvious excessive fragmentation was observed in the inspected cycle; the
  strongest identified same-event pair still merges correctly.

RC2:

- No visible RC2 evidence/taxonomy regression was observed during this
  bounded production inspection.

## 5. Evidence qualifications and limits

- The exact historical China/Canada/Here's collisions were not all exercised
  live in the fresh cycle; their regression coverage comes from the existing
  before/after tests in `tests/test_clustering_path3.py`.
- The production observations establish **outcomes** (correct memberships in
  the inspected cycle), not proof that a particular Path 3 branch executed
  for each example.
- The visible "2 sources" result does not verify unreported internal count
  fields, and no claim-level agreement is inferred from it.
- The fragmentation conclusion applies only to the inspected cycle.
- Historical events formed before `3f02e50` may retain old memberships.
  Historical remediation was neither performed nor required for this closure.

## 6. Explicitly outside this closure

These remain open and are **not** touched, resolved, or implied by RC3-EA1:

- **Agreement-label semantics** ("agree" wording and count semantics on the
  event/evidence surfaces) — unchanged by this slice.
- **OP1.2 SEC 8-K dedup** — separate observation-pipeline work.
- **RC2 relationship/evidence semantics** — not reopened; the bounded
  no-regression observation above is not an RC2 validation.
- **Historical remediation** of pre-`3f02e50` event memberships.

No further RC3-EA1 work is authorized by this record.

---

*Note on naming: the "EA-1" amendment in
`ARGUS_V2_INSTITUTIONAL_EXPERIENCE_ARCHITECTURE.md` (durable `ev_…` event UID,
Chapter 5) is a different, unrelated work item and is unaffected by this
closure.*
