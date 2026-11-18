# Persistent event-identity integrity — local implementation

Status: **IMPLEMENTED / LOCALLY VALIDATED / NOT DEPLOYED**.

Scope: persistent identity matching and regression coverage only. Path 1,
TM1b1, frontend behavior, event scoring formulas, and historical cleanup are
unchanged. No production reads, writes, refreshes, or deployment were performed
for this implementation.

## Observed failure and reproduction

The Microsoft/ByteDance sale, JPMorgan software-debt sale, and bank chip-smuggling
loan-protection stories had separate current clusters but shared a previously
contaminated persistent identity originating with a technology-outage story.
Accumulated evidence URLs bypassed compatibility checks. The latest headline
and a shared company also let the debt story pass the fuzzy fallback.

The new regression fixture uses the retained titles, URLs, and resolved
companies with reduced synthetic journal rows. It is not an exported production
journal. Before the correction, the first test batch produced nine failures
and two passes, including three separate current events folding into one.
After the correction, the same three stories retain their evidence, company
lists, individual source counts, timestamps, and separate identities.

## Correction

- Separate continuity anchors (`anchor_urls`) from accumulated historical
  membership (`member_urls`). Mint-time URLs retain original article continuity.
  Legacy attachments do not automatically acquire that authority.
- New attachments may add an anchor only when that article's own headline
  meets the existing 0.4 origin-title similarity threshold. A shared anchor
  cannot authorize all other articles in the same current event. Missing
  secondary article titles do not inherit the event headline.
- Fuzzy matches must retain origin-title support. Shared company names or
  accumulated URLs no longer bypass the origin drift guard. Existing numeric
  matching thresholds and the fuzzy-match time window remain unchanged.
- Examine all eligible URL owners instead of a last-writer-wins URL index.
  Conflicting anchors require origin-title support, with deterministic
  selection. Unmatched current events receive new identities through the
  existing append-before-apply mint path, rather than sharing a contaminated UID.
- Snapshot version 2 reconstructs anchor provenance from the original journal
  when loading a version 1 snapshot. Journal rows and previously minted UIDs
  are not rewritten. New anchor additions are journaled and replayable.

Natural-key identity remains unchanged. Established article continuity can
survive headline and event-type reclassification. Existing explicit alias
contracts, partial-run read-only behavior, and master rollback flags remain.

## Validation

- 23 new regression cases, plus 39 existing identity/continuity cases, pass.
- Full backend suite: **1,478 passed**, with two existing JWT test warnings
  and the existing pytest-asyncio configuration warning.
- Ruff on both changed Python files: passed.
- Backend dependency integrity check: passed.
- Diff whitespace check: passed.
- Existing continuity tests were not weakened or edited.
- No frontend source change; frontend gates were not rerun.

Coverage includes contaminated URL membership, contaminated latest fingerprints
with both original and new URLs, entity-supported headline drift, current-event
folding and explanation-key isolation, subsequent-cycle UID stability, snapshot
and full-journal replay, version 1 upgrade, original/reported article headline
rewrites, shared same-event evidence, inactive entries, conflicting URL owners,
failed journal writes, and preservation of historical rows.

## Limits and deployment boundary

This corrects the demonstrated carry-over through historical attachments. It
still trusts membership at identity creation and explicit natural-key/alias
decisions. It is not a semantic validator of an incorrectly clustered initial
event, and does not repair previously published Event records or old deep links.

A legacy attached article with a radically changed headline and no surviving
origin support can receive a new UID rather than inherit an uncertain identity.
That conservative boundary is intentional; it does not assert that every
possible same-event paraphrase is recognized.

The first startup with a version 1 snapshot requires journal replay. No manual
cache clearing or production journal editing is required. After a separately
approved deployment, validate a successful fresh full-feed cycle: distinct
Microsoft/debt/loan events (if still present), no contaminated UID reuse or
evidence union, a legitimate same-event continuity control, and unchanged
source-count rules. Production validation remains pending; no next slice has
started.
