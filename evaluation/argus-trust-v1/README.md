# Argus trust evaluation, version 1

Status: DEVELOPMENT CANDIDATES SEEDED, ANNOTATION INCOMPLETE. This is not yet the
150-200 event benchmark and does not support a precision/accuracy claim.

## What exists

`candidates.jsonl` contains 125 retained observation revisions from the local
2026-07-25 observation ledger. IDs derive from URL and content hash; line numbers
and the source file hash make each entry traceable. Every entry is explicitly
unreviewed and development-only. These examples have already been inspected by
engineering and must not later be represented as unseen holdout data.

`manifest.json` records the source digest, dimensions, candidate count, and current
review/holdout status. Original source records are referenced rather than copied
in full. Do not scrape full articles or substitute generated summaries as truth.

The four reviewed collision mechanisms in `tests/fixtures/theme_entity_collisions.json`
are targeted regressions. Their presence does not establish complete annotations
for these articles, events, themes, or exposure chains.

## Complete the benchmark

1. Add fresh multi-source examples across several complete cycles until there are
   150-200 distinct annotated events, not 150-200 copies of articles. Retain source
   URLs, observation timestamps, original primary/member text, and cycle identity.
2. Assign event groups independently of the production cluster assignment. Preserve
   same-subject/different-event negatives and legitimate multi-source positives.
3. Label the dimensions below separately. A null label means not reviewed, never
   false or empty. An empty reviewed company list means no supported direct company.
4. Keep 20-25% of newly collected events as an unseen holdout. Group all versions,
   publishers, and close paraphrases of an event into one split to prevent leakage.
5. Have a second reviewer resolve ambiguous labels and sample agreed labels. Log
   reviewer, date, rationale, and evidence reference. Do not silently overwrite
   disagreements or let the current engine supply expected answers.
6. Freeze a version before tuning. Compare old/new code on identical input and
   report per-dimension results, reviewed denominator, coverage, abstention, and
   individual regressions. Keep the holdout out of tuning decisions.

## Labeling contract

| Dimension | Required decision |
|---|---|
| Event grouping | Which reports describe this specific occurrence? Country/company/topic overlap alone is insufficient. |
| Direct companies | Which canonical companies are explicitly involved in source text? Contextual theme assets go in a separate field. |
| Themes | Relevant, contextual only, unrelated, or insufficient evidence, with the specific text supporting the judgment. A company mention alone does not establish every associated theme. |
| Sector | What sector assignment is supported, including uncertainty or absence? Do not inherit it blindly from a theme. |
| Transaction status | Establish whether there is a transaction, then its type and lifecycle separately; rumor and announcement differ. |
| Claim support | Identify the actual claim and source passage; label support, contradiction, or insufficient evidence. Publisher counts are not agreement. |
| Chain grounding | Check direct-event anchoring and each additional hop separately. ET1a's minimum anchor is not full-chain validity. |
| Abstention | Identify which conclusion should be withheld and why. Abstention does not receive automatic credit. |

Track false positives and missed positives separately. Report precision and recall
only over dimensions with complete reviewed labels; do not count unreviewed cases
as correct or infer performance from a few positive demonstrations.

## Release discipline

Keep the targeted regression suite fast and deterministic. Use the broader corpus
for reviewed release comparisons. A passing benchmark does not replace a successful
fresh pipeline cycle and authenticated production UI validation. Preserve EA1,
EA2a, ET1a, and RC2 invariants unless new evidence establishes a separate defect.
