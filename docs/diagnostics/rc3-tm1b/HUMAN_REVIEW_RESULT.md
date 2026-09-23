# RC3-TM1b human-review milestone result

Status: HUMAN ADJUDICATION COMPLETE / MILESTONE ACCEPTED 2026-09-22.

Recorded date: 2026-09-22. All 23 judgments over 16 source packets were explicitly
decided by the user. At the time of the report no implementation was authorized
or performed. The user subsequently accepted this milestone and authorized only
[TM1b1](../../RC3_TM1B1_IMPLEMENTATION.md). The findings below remain historical;
acceptance does not change human decisions or promote benchmark truth. TM1a,
ET1a, EA1, EA2a and RC2 remain closed.

## Provenance and interpretation

The authoritative human decisions, verbatim rationales and user-message references
are in [human-adjudications.json](human-adjudications.json). The
[workbook](ADJUDICATION_WORKBOOK.md) displays those decisions beside retained
source excerpts. [adjudication-results.json](adjudication-results.json) joins them
to the previously measured triggers and candidate-policy simulations.

No model recommendation was inserted into a human decision field. Exact source-span
fields remain unset where the user submitted a rationale rather than a separately
designated exact passage. Dates have day precision; no message IDs or times were
invented. The original candidate ledger and benchmark manifest remain unchanged.
Original unreviewed diagnostic files retain their historical status; the new
adjudication record is separate, not an automatic benchmark promotion.

This is an intentionally selected development challenge set. It is not an unseen
holdout or a representative sample of production traffic. Counts below describe
these judgments, not population precision or recall. Sixteen articles yielded 23
theme judgments, so judgments about the same article are not independent events.

## 1. Human counts

| Decision | Count | IDs |
|---|---:|---|
| A: Directly relevant | 9 | J03, J04, J05, J09, J12, J13, J14, J21, J23 |
| B: Contextually relevant | 5 | J02, J10, J15, J17, J22 |
| C: Irrelevant | 9 | J01, J06, J07, J08, J11, J16, J18, J19, J20 |
| D: Unclear / insufficient evidence | 0 | None |

J22 is B because that is the user's explicit decision. Filing metadata establishes
company context without the theme mechanism; do not silently relabel it D.

## 2. Results grouped by trigger family

These are mutually exclusive CURRENT MATCHER route buckets. They are not semantic
strength categories. A phrase designated specific by the ontology can still be
irrelevant, and a generic-only route can have source context the matcher did not use.

| Trigger family | A | B | C | D | Total |
|---|---:|---:|---:|---:|---:|
| Generic keyword(s) only | 5 | 2 | 5 | 0 | 12 |
| Generic + counted ontology entity, no specific keyword | 0 | 0 | 2 | 0 | 2 |
| Generic + specific keyword + counted entity | 1 | 1 | 0 | 0 | 2 |
| Generic + specific keyword, no counted entity | 2 | 0 | 0 | 0 | 2 |
| Specific keyword(s) only | 0 | 1 | 2 | 0 | 3 |
| Entity only | 1 | 1 | 0 | 0 | 2 |
| Total | 9 | 5 | 9 | 0 | 23 |

Within entity-only: the explicitly resolved AVGO ticker filing is contextual
(J22); the Apollo name match without successful canonical resolution is directly
relevant (J23). The multiple-specific-phrase example is irrelevant (J19).
Counting names/keywords or enforcing resolution alone does not reproduce the
human contract.

## 3-5. Generic-only judgments, legitimate cases and false positives

| ID | Exact generic trigger(s) | Target theme | Human decision |
|---|---|---|---|
| J01 | spending | consumer-stress | C: corporate AI investment is not household pressure |
| J03 | spending | consumer-stress | A: lower-/middle-income spending squeezed by prices |
| J04 | data center | data-center-buildout | A: financing actual construction |
| J05 | oil | energy-security | A: supply stress, inventory depletion and price risk |
| J07 | healthcare | glp1-healthcare-revolution | C: cancer imaging, not metabolic-disease repricing |
| J08 | ai | ai-energy-demand | C: software disruption, not physical power scarcity |
| J09 | buyout | private-capital-takeover | A: sponsor acquisition opportunities |
| J10 | buyout | private-credit-expansion | B: adjacent financing ecosystem, not lending displacement |
| J12 | ai | ai-compute-arms-race | A: AI-chip growth; AVGO resolves separately |
| J17 | ai | ai-compute-arms-race | B: AI investment financing without compute constraints |
| J18 | credit | direct-lending-expansion | C: corporate bonds, not direct lending |
| J20 | chinese, beijing | china-stimulus-rotation | C: geography, not monetary easing/recovery |

Thus generic-only cases comprise **five legitimate full-authority matches, two
contextual matches and five false positives in this reviewed set**. Single-word-only
cases are ten of the twelve: A=4, B=2, C=4. J04 is a single generic phrase (A);
J20 uses two generic words (C). Do not call B irrelevant or conflate it with C.

## 6. Contextual cases should not have full contributor authority

- J02: Google equity raising for AI spending -> AI power/grid bottlenecks.
- J10: Software buyout opportunities -> non-bank lending displacement.
- J15: Recordati take-private -> non-bank lending displacement.
- J17: Big Tech AI-related bond issuance -> compute access constraints.
- J22: AVGO results-filing metadata -> semiconductor equipment/capacity investment.

These decisions establish the desired authority distinction. They do not authorize
a contextual score, new persistence field, UI badge, second evidence channel or
global reweighting. How to represent B operationally remains a separate design
decision; it must not be silently converted to full evidence or to "irrelevant."

The review also defines important positive boundaries: the user accepts AI-chip
growth as direct evidence for both compute and semiconductor-capex themes
(J12/J13), and financing construction as direct buildout evidence (J04). Do not
require every clause of a long ontology thesis to appear literally, or impose a
universal rule that all demand drivers/upstream developments are only contextual.

## 7. Does this support a narrow TM1b1 implementation?

**Yes, a narrowly bounded contributor-eligibility correction is supported. A
universal generic-keyword ban or global weighting change is not.**

The earlier four simulations can now be compared with actual human choices.
Policy letters in this table are the original simulation names, distinct from
the human A/B/C/D labels. These results concern PAIR ELIGIBILITY before aggregate
theme gates, not eventual event admission or displayed membership.

| Simulation | Human A kept / 9 | Human B kept / 5 | Human C kept / 9 | Human A lost |
|---|---:|---:|---:|---|
| Current behavior | 9 | 5 | 9 | None |
| Policy B: reject generic-only | 4 | 3 | 4 | J03, J04, J05, J09, J12 |
| Policy C: additional specific proxy | 5 | 3 | 2 | J03, J04, J05, J09 |
| Policy D: illustrative weighted model | 4 | 3 | 2 | J03, J04, J05, J09, J23 |

All current pairs are eligible by construction of this challenge set, not because
all 23 currently appear as admitted event themes. All stricter simulations also
keep some contextual and irrelevant matches. A simpler-looking rule does not
solve the semantic contract. Do not tune the illustrative weights against this
small exposed set and call the result validated.

## 8. Smallest defensible first implementation rule (recommendation only)

**Recommended scope: RC3-TM1b1 — consumer-stress `spending`-only qualification.**

When a consumer-stress contribution depends solely on the generic word
`spending`, permit that contribution only when the source title/snippet explicitly
connects it to household/consumer spending pressure or real-income compression.
Corporate capital investment alone cannot establish this contribution. Withhold
the contribution when the necessary connection is absent or ambiguous; preserve
the underlying article.

This is the smallest well-isolated boundary demonstrated by an exact shared-word,
same-theme positive/negative pair: **J01 must not contribute; J03 must remain
eligible.** It is a proposed semantic contract, not a finalized regex, dictionary
or threshold. Candidate implementation must demonstrate source-grounded context,
not just co-occurrence anywhere in a long snippet. A mention of households in an
unrelated clause must not rescue corporate spending.

Why this small first slice: it tests event-specific eligibility without redesigning
the ontology, weighting, entity resolution, propagation or contextual-authority
representation. Broader generic families and known phrase/entity failures remain
recorded; this slice must not be described as fixing all TM1b findings.

If later authorized, the change should act before a rejected pair affects theme
confidence, source/category counts, sentiment or ranking. Keep the arithmetic and
aggregate gates unchanged for retained contributions. Input-dependent aggregate
outputs may still change; removing only a displayed top ID would leave the
underlying false contribution active.

The rule does NOT address the five contextual cases, the generic/entity duplicate
route, entity-only company context, specific phrases with the wrong mechanism,
all AI/healthcare/credit/geography matching, or the J23 resolver gap. Those require
separately scoped review and authorization, not expansion of this implementation.

## 9. Regressions and preservation requirements

At the reviewed pair-contract level, the recommended rule rejects J01, preserves
J03 and leaves the other 21 pairs outside scope. No directly relevant reviewed
pair is intended to become ineligible. **This is not an executed implementation
result or a zero-regression claim.** No new rule has been coded or replayed.

Risks that must be controlled before closure of any later implementation:

- J03 is the primary regression risk if a brittle rule requires the exact token
  `household`, a named company, or a second ontology keyword. Its retained source
  says families/consumers and crimping spending; that is human-approved support.
- J04, J05, J09 and J12 would be lost by the blanket generic ban, so retain them
  as explicit outside-scope positives. J23 guards against silently requiring
  successful company canonicalization for every legitimate theme contribution.
- Aggregate effects matter: prior simulations removed an entire theme and thereby
  lost J14's otherwise eligible take-private contribution. Removing a contributor
  can change emission, top-five replacements and competition. This later slice
  must inspect those consequences on the same retained snapshots; pair-level
  preservation alone is insufficient.
- A later rule that labels all upstream drivers B would contradict J13. A rule
  that treats every AI investment as A would contradict J02/J17. Preserve the
  user's theme-specific boundaries rather than extrapolating a universal slogan.

## 10. Additional controls still needed

Before implementing the recommended spending-only rule, obtain or approve a
small focused development supplement, without silently manufacturing benchmark
truth:

1. A second real household-spending-pressure positive using different wording
   (e.g. reduced discretionary purchases/real wages), without a named company.
2. A second real corporate investment/operating-spending negative for this theme.
3. A mixed-source-text case mentioning corporate and household spending, to decide
   which action/context establishes relevance; include negated or easing consumer
   pressure to separate theme relevance from direction.
4. A source-poor `spending` example to decide abstention explicitly. No D case was
   selected in this batch, so abstention calibration is not validated by D=0.
5. A fixed full-cycle replay control near the existing source/story emission
   gates, checking confidence, replacements and preserved evidence under removed
   contributions. Do not refresh production merely to create it.

Tests may use explicitly synthetic engineering fixtures for boundaries, but such
fixtures are not human-labeled real observations or independent benchmark evidence.
The additional source cases must be reviewed before treating their expected labels
as truth. The current 23 labels remain useful approved development judgments.

For later wider slices, more controls are needed for retail (no retained hit),
genuine direct-lending positives, actual PBOC-stimulus positives, AI power-capacity
positives, metadata-only filings versus substantive capex results, and contextual
authority. Do not retrieve an article body and silently overwrite a decision made
on an excerpt: expanded evidence would be a new review version.

## Scope verification and approval boundary

Updated only local review records, the workbook and analytical results. Matcher,
ontology, resolver and existing benchmark hashes match the diagnosis manifest.
No runtime, threshold, score, event propagation, frontend, graph, production,
historical-remediation or deployment changes. No implementation tests were needed
because no implementation changed. The pre-existing tsbuildinfo modification was
left alone. No files were committed or published in this milestone.

**Human adjudication is complete. Milestone acceptance and any subsequent
implementation remain separate user approvals. Stop here.**
