# Argus audit follow through

The November 18 instruction authorizes completing the outstanding audit work,
with separate causal changes and honest validation status. Engineering delivery
does not establish human-reviewed accuracy, publisher access or pilot results.

## Released corrections

| Finding | Revision and release | Evidence and limits |
|---|---|---|
| Build-tool advisory exception | `5590bb4`, PR 6, merge `9e9e587` | Advisory withdrawn; complete npm audit zero vulnerabilities; no allowlist remains. No package patch is claimed. |
| Release checks could be bypassed | GitHub main protection configured November 18 | Both frontend and backend checks required, branch must be current, administrators included, force pushes/deletions prohibited, conversations resolved. PRs 6–8 merged through those checks. |
| No external readiness monitor | `a8748d1`, PR 6 | Public redacted health checks cover frontend proxy and backend, pipeline age/liveness and persistence. Detailed feed/status/auth remain protected. GitHub run `44420754091` passed. Partial publisher coverage is a warning, not complete coverage. Scheduled checks are every 15 minutes and may be delayed by GitHub. |
| Treasury auctions merged through shared URLs/headlines | `7644b91`, PR 7, merge `56bf0de` | CUSIP plus auction date separates official occurrences through ingestion deduplication, clustering, event folding and persistent identity. Missing metadata stays separate. Nine focused controls pass; no historical rewrite. |
| Broad words/names granted theme authority | `923714e`, PR 8, merge `ecedcd0` | Minimum mechanism evidence in eight reviewed families, before aggregate contribution counting. All 23 human development decisions preserved: 9 A eligible, 5 B and 9 C denied full authority. B is not relabelled irrelevant. Ten additional contract/integration controls. |
| Unbounded request-triggered work and inference caches | `b2d76f1`, PR 9, merge `9e393ea` | Feed recomputation: three starts/minute, one concurrent; analysis: twenty/minute, two concurrent. Input sizes bounded, 429 responses include retry timing, cache reads remain unrestricted. Recomputable caches bounded to 2,048 summaries, 512 deep analyses and 128 each for takes/briefs. Five focused controls plus full gates pass. Limits are process-local for the current single replica; shared limits are required before scaling. |

Required frontend CI includes tests, type-check, lint, build and dependency gates.
Backend CI installs the hashed lock, checks dependencies and runs the suite on
the exact committed tree. The final working-copy backend run passed 1,531 tests;
that count includes pre-existing local tests and is not the committed CI count.
Pre-existing local TM1b1 tests and unrelated working
files are excluded from these releases. No EA1, EA2a, ET1a, TM1a or RC2 reopening.

## Fresh production observations

Authenticated full-feed snapshot `2026-11-18T23:35:14.728247+00:00` matches cycle
`20261118T233448984010Z`, completed `23:35:54.794101+00:00` and published
`23:35:54.798990+00:00`. It replaced the loaded disk cache, all stages passed,
and memory/disk/institutional persistence succeeded. It contains 87 clusters,
55 admitted events and six emitted themes. These are bounded observations.

Four official auctions remained separate, with one evidence record and one
source label each: 20-year bond, 17-week bill, 4-week bill and 9-day bill. The
20-year bond retained `ev_01M7RFTQDTKE7VKQFWE52WCEXM` across two cycles. Its
authenticated Event page rendered only its own report and an honest unsupported-
implication fallback. This validates distinct live auctions and continuity;
the earlier TIPS report was outside this published selection and is not claimed
as a live control. Its retained-shape separation is regression tested.

TM1b1 gained a valid primary-article negative: “Meta Pauses New Stock Plan Amid
Legal Challenge”, cluster `0467eee451a3`. It resolves META, matches only `spending`
for consumer-stress, and fails the household-pressure predicate. The exact
source text and matching successful-cycle snapshot are retained locally.
The required household-pressure positive remains absent. TM1b1 stays open.

The observed multi-story GTA cluster has only a broad Autos entity. It is not
claimed as a Path 1 positive. The specific live positive remains pending; the
existing focused Path 1 regressions continue to pass.

## Relevance tradeoff

The four hash-pinned historical snapshots lose 26–38 contributions each under
the mechanism gate, emitting 3–6 themes instead of 9–11. Event admission falls
by one in three snapshots through existing theme relevance scoring; membership,
articles and source evidence are not deleted. This consequence is explicit,
not a claim that every downstream number is unchanged.

Named-company filings, broad AI financing, weather-driven electricity use,
non-metabolic healthcare, corporate bonds and geographic China mentions cannot
substitute for the reviewed theme mechanisms. Other theme families retain their
existing policy. The gate remains lexical and may miss paraphrases or accept
coincidental wording. This is a bounded correction, not full causal validation or
a measured population precision/recall claim. R24–R26 are additional human-review
requests; their answers remain separate from model predictions and benchmark truth.

## Operational exercises and external dependencies

The isolated recovery exercise copied retained local data, checked SQLite
integrity, restored 29 event identities and rebuilt the same identities from the
journal without a registry snapshot. Source hashes stayed unchanged. It is not
a restore of a current cloud backup or of Supabase research data.

Cached API exercise: 60 requests each at concurrency 1, 5 and 20, zero errors,
approximately 483 KB responses. Observed p95 values were 7.5, 37.4 and 120.9 ms
on this computer. This excludes real network/authentication, production hardware,
ingestion and browser rendering; it is not a production user-capacity claim.

Railway's authenticated backup screen showed **No Backups** and required Pro to
create/schedule backups. No plan purchase, volume reset or destructive restore
was performed. Owner preference requested: upgrade the existing service or use
an approved external backup destination. A production restore exercise remains
blocked until a real backup and isolated restore destination are available.

The fresh cycle reports four publisher failures: Yahoo Finance HTTP 404,
PE Hub and Buyouts redirected to PEI registration, and Power Magazine HTTP 403.
An earlier FT Deals timeout recovered in the subsequent cycle. Public access
checks did not establish a publisher-approved replacement endpoint. No paywall
bypass, invented replacement coverage or suppression of error reporting occurred.
Restoring those four sources needs approved feed access or a separately chosen
coverage replacement. Existing other providers remain active.

## Work that cannot be declared complete by code

- TM1b1 household-pressure live positive and Path 1 live positive: await naturally
  occurring matching controls; do not force production examples or substitute tests.
- Production backup/restore and deployment-sized capacity evidence: local
  exercises are available, cloud proof remains outstanding.
- Human accuracy: 125 retained candidates are development observations; no labels
  have been automatically promoted. Future event-group holdout predictions must
  be frozen before human judgments and excluded from further tuning.
- Owner pilot: participation accepted. The two-week protocol is in
  [ARGUS_OWNER_PILOT.md](ARGUS_OWNER_PILOT.md); results require actual use.
- Publisher availability: four external access gaps remain explicit.

The engineering audit is substantially remediated, but these conditions prevent
an “everything closed” claim. No retention, willingness-to-pay, investment-return
or product-essentialness result is invented.
