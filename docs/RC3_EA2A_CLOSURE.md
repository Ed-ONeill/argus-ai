# RC3-EA2a — Corroboration Wording Honesty Correction: Closure Record

**Status: CLOSED — IMPLEMENTED / DEPLOYED / AUTHENTICATED UI VALIDATED**

- **Slice:** RC3-EA2a — wording-only honesty correction: user-visible copy
  describes coverage counts without asserting agreement or independence.
- **Implementation revision:** `c5c3d44` (`fix(rc3-ea2a)`, 2026-09-15).
- **Diagnosis basis:** the RC3-EA2 read-only diagnosis (this session's chain);
  EA1 (`3f02e50` / `docs/RC3_EA1_CLOSURE.md`) remains closed and untouched.
- **Closure recorded:** documentation only. No implementation, test, fixture,
  configuration, dependency, generated-file, or production-data change
  accompanies this record.

---

## 1. Causal diagnosis (what the counts actually are)

- `source_count` counts **distinct feed-label strings** among an event's
  evidence, regardless of qualification.
- `corroboration_count` counts **distinct qualified feed-label strings**
  (tier ≤ 2, or tier-3 with specificity).
- **Neither count establishes claim-level agreement or verified publisher
  independence.** No claim-comparison machinery contributes to either count.
- The metric remains **useful under its existing definition**; the defect was
  in the words wrapped around it ("N agree", "independent sources"), not in
  the numbers. This slice corrected user-visible wording only.
- Three further displayed quantities are **distinct from each other and from
  the event counts**, and remain so: the Drawer's displayed-label counts
  (distinct outlet labels among the ≤6 docs it shows), the Drawer cluster
  fallback's **article** counts (`story_count`), and the Workstation's
  **product-surface** counts (distinct originating pages of graph edges).
  The corrected copy names each quantity as what it is.

## 2. Implemented wording (exact shipped strings, singular forms included)

| Surface | Old | New |
|---|---|---|
| Event evidence line (`EventPage.tsx`) | "N sources, M agree" | **"N source labels, M qualified"** ("1 source label" singular) |
| Event developing watch (`eventView.ts`) | "Watch for a second independent source; a single report is not yet confirmed." | **"Watch for reporting from a second qualified source label."** |
| Drawer multi-label evidence (`drawerView.ts`) | "Supported by N independent sources" | **"Reported by N source labels"** |
| Drawer developing (`drawerView.ts`) | "Still developing, awaiting confirmation" | **"Still developing, awaiting another qualified source label"** |
| Drawer single-label evidence (`drawerView.ts`) | "Single source" | **"Single source label"** |
| Drawer cluster article fallback (`drawerView.ts`) | "Supported by N independent sources" / "Single source" | **"N reports"** / **"Single report"** |
| Workstation per-link + support (`CaseThread.tsx`, `workstationView.ts`) | "N sources" / "N independent sources" | **"N product surfaces"** ("1 product surface" singular) |
| Workstation chain (`CaseThread.tsx`) | "N independent sources across the chain." | **"N product surfaces across the chain."** |
| Workstation support explanation (`workstationView.ts`) | "corroborated across N links in the chain" | **"support recorded across N links in the chain"** |
| Workstation limitation (`workstationView.ts`) | "one link rests on a single source" | **"one link appears on at most one product surface"** |

## 3. What was preserved

- **All numeric values, thresholds, state behavior, qualification rules, and
  metrics are unchanged**: counts, tiers, `is_specific`, URL identity, lanes,
  admission, EventScore, TrustState keys, and every downstream consumer.
- The Event page's existing conditional display of the qualified count
  (shown only when ≥ 2) remains unchanged.
- The frozen Event page (Surface #3) and Evidence Drawer (Surface #5) edits
  were **explicitly authorized as narrow honesty corrections** to their copy;
  their frozen identities and layouts are otherwise untouched.
- **Excluded from this slice:** Markets/theme wording that rides on a
  different metric (theme `evidence_count` copy such as the Markets
  "independent sources" line and theme-intelligence phrases). This closure
  does **not** claim that every corroboration-related phrase throughout the
  product was corrected.

## 4. Completed gates (as recorded at implementation)

- 60 focused tests passed (including the new
  `corroborationWording.test.tsx` regression suite pinning rendered copy and
  unchanged numbers).
- 1,444 frontend tests passed.
- Type-check passed.
- Lint passed with four pre-existing warnings.
- Production build and diff checks passed.
- Backend diff empty (frontend-only change: 9 files).
- Both Railway deployment checks succeeded.

## 5. Authenticated rendered-UI validation (bounded)

The following observations come from the **completed authenticated
production validation reported for this closure**. They are bounded
spot-checks of rendered surfaces, not exhaustive coverage; comprehensive
coverage of states and singular/plural forms is test-proven (§4), not
production-enumerated. No timestamps or screenshots were supplied and none
are invented here.

- **Event page:** the Iran-munitions Event retained the same two evidence
  records and rendered **"2 source labels, 2 qualified."**
- **Evidence Drawer:** rendered **"Reported by 2 source labels"**; the
  developing and single-report states showed the corrected wording.
- **Workstation:** the Supply-Side Energy Shock case retained the same five
  links, a count of one product surface per link and across the chain, and
  an unchanged Thin rating.
- **Blocked required surfaces: none.**

## 6. Exclusions preserved (explicitly outside this closure)

No change was made, and none is implied, to:

- backend code, metrics, qualification rules, tier tables, clustering,
  scores, lanes, or admission;
- publisher/source-label normalization or URL canonicalization;
- true claim-agreement machinery (none exists; none was added);
- RC2 relationship/evidence semantics;
- OP1.2 SEC 8-K dedup;
- historical remediation.

EA1 remains closed (`3f02e50`, `docs/RC3_EA1_CLOSURE.md`). The label ≠
publisher and shared-primary-document independence gaps recorded in the
RC3-EA2 diagnosis remain open, unclaimed by the corrected wording, and
unauthorized for implementation. **No new implementation slice is authorized
by this record.**
