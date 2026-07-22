# OP1–OP4 IMPLEMENTATION PLAN — Observation Integrity Program

**Date:** 2026-07-21
**Source:** `docs/ARGUS_OBSERVATION_PIPELINE_AUDIT_V1.md` (finding IDs `I#`/`T#`/`B#`/`C#` referenced throughout).
**Scope:** Tier 1 of the audit's improvement program — OP1 (corroboration-preserving ingestion), OP2 (stable event identity), OP3 (durable observation ledger + rehydration), OP4 (consume the canonical reasoning). Tiers 2–3 (OP5–OP12) are out of scope except where a one-line boundary change is a hard prerequisite (called out explicitly as OP4.0).
**Status:** Sprints 1–2 implemented (2026-07-21). Sprints 3+ remain plan only.
**Amendment (2026-07-21):** the Sprint 3–4 identity-and-ledger phase (OP2.x, OP3.1, OP3.4, sequencing, metrics) is revised per `docs/OP2_SPRINT3_DESIGN_REVIEW.md` required changes **C1–C8**. Amended passages are marked `[C#]`. Governing decisions: the identity journal is the permanent source of truth and the registry is a rebuildable hot view [C1]; uids are opaque ULIDs with natural-key aliases [C2]; merge/split/correction/retraction semantics exist from schema v1 [C3]; observation facts and engine assessments are separate row types [C4]; the permanent journal is never deleted [C5]; identity mutation is single-writer [C6]; continuity matching is drift-guarded and flagged [C7]; stable uids enter archive evidence refs at first deployment [C8].

Complexity scale: **S** ≤ 1 day, **M** 1–3 days, **L** 3–7 days. Estimates assume one engineer familiar with the codebase.

---

## 0. Regression-safety principles (apply to every task)

These four rules are why the ordering below is safe; every task's migration notes assume them.

1. **Additive-only schema changes.** `FeedItem`, `MarketEvent`, and `ProcessedFeed` are dataclasses pickled to `data/feed_cache/`. The codebase already has the pattern for safe evolution — every field appended to `ProcessedFeed` after v1 uses `default_factory`/defaults so old pickles deserialize (`processed_cache.py:48-64`). All new fields in this plan follow it. No field is renamed or removed until the final cleanup sprint.
2. **Behavior swaps go behind flags; representation changes don't need them.** Adding `merged_sources` to an item is representation (safe, always on). Changing which duplicate survives dedup, or which engine a surface renders from, is behavior — each gets a flag (`settings.merge_dedup`, `NEXT_PUBLIC_IRE_SURFACES`) defaulting to legacy until the parity gate passes.
3. **Golden-fixture pipeline tests before behavior changes.** A recorded set of raw RSS payloads (canned `feedparser` results) driven through `fetch_all → cluster → build_market_events → build_explanations` with a frozen `now`. The pipeline is already designed to be "pure and deterministic for fixed inputs" (`events.py:458`); the fixture harness turns that claim into a regression net. Built in Sprint 1 (OP1.5) before any dedup behavior changes.
4. **Dual-run parity logging before any legacy path is deleted.** When a canonical path replaces a legacy one (merge-dedup vs delete-dedup, Explanations vs client engines), both run for at least one sprint with divergence logged and reviewed. Deletion is its own task with its own gate.

---

## 1. OP1 — Corroboration-preserving ingestion

The keystone. Today `_dedup_items` (`feeds.py:1460-1473`) deletes any item whose title-Jaccard ≥ 0.50 with a kept item — before scoring, clustering, and event building — and keeps the *freshest* duplicate because items arrive sorted newest-first (`feeds.py:1462`). Downstream, `build_market_events` computes `corroboration_count` from surviving members only (`events.py:504-505,541`) and `first_seen` from surviving members' publish times (`events.py:500-501`). Fixes audit I4, I5, I6; unblocks E1/E2.

### OP1.1 — Provenance data model (`MergedSource` + new `FeedItem` fields)

- **Why it matters:** Nothing can be preserved until there is a place to put it. This is the schema groundwork every other OP1 task writes into and OP2/OP3 read from.
- **What:** New frozen dataclass `MergedSource {source, title, url, published_dt, snippet, tier}`. New `FeedItem` fields (all defaulted, appended after `graph_alignment_score` at `feeds.py:598`): `merged_sources: list[MergedSource] = field(default_factory=list)`, `first_seen_dt: datetime | None = None`, `fetched_at: datetime | None = None`. Semantics: `published_dt` keeps its current meaning (the surviving item's publish time — recency scoring is untouched); `first_seen_dt` = earliest publish time across the item and everything merged into it; `fetched_at` = when Argus first fetched this URL (audit I2).
- **Dependencies:** none.
- **Complexity:** S.
- **Affected:** `app/feeds.py` (dataclass region ~572-598, `_fetch_one` ~1702 to stamp `fetched_at`).
- **Migration:** Old `ProcessedFeed` pickles deserialize because all fields default (rule 1). `fetched_at` for a URL seen in a previous process is unknowable — accept first-fetch-this-process; OP3.2's ledger makes it durable going forward.
- **Risks:** Pickle size growth (each item can carry N merged snippets). Mitigate: cap `merged_sources` at 12 and truncate merged snippets to the existing `_MAX_SNIPPET`.
- **Testing:** Unit: round-trip pickle of old-schema `ProcessedFeed` fixture; dataclass defaults; `fetched_at` stamped in `_fetch_one`.
- **Success criteria:** Old cache files load without error; every freshly fetched item has `fetched_at`; zero behavior change in served feed (byte-identical item ordering on the golden fixture).

### OP1.2 — Merge-dedup replaces delete-dedup

- **Why it matters:** This is the single highest-gain change in the audit. Reuters + FT + Bloomberg on the same story currently collapses to one item with no trace; after this task the survivor carries all three as provenance and the earliest publish time.
- **What:** Rewrite `_dedup_items` (`feeds.py:1460-1473`): on a Jaccard hit, instead of `continue`, fold the loser into the winner — append a `MergedSource` for the loser (and transfer the loser's own `merged_sources`), set `winner.first_seen_dt = min(...)`. Survivor selection changes from "first encountered (freshest)" to **best source tier, tie-broken by freshest** — the tier-1 telling should be the canonical text. Union `affected_entities`. Behavior flag `settings.merge_dedup` (default on after one dual-run cycle; the flag exists to allow instant rollback, not a long dual life).
- **Dependencies:** OP1.1; OP1.5 fixtures in place first.
- **Complexity:** M. The algorithm is simple; the care is in survivor semantics (scoring runs on the survivor's title/snippet — changing the survivor changes scores; the golden fixture diff must be reviewed line by line once, deliberately).
- **Affected:** `app/feeds.py` (`_dedup_items`, `fetch_all` call site ~1541-1549), `app/config.py` (flag).
- **Migration:** None (in-memory transform). Display is unchanged — `merged_sources` is not yet rendered anywhere.
- **Risks:** (1) Survivor-swap changes item scores and therefore feed ranking — *intended* but must be eyeballed on the fixture (a tier-1 headline replacing a tier-3 SEO headline is the point). (2) Chained merges (A~B, B~C, A≁C) — keep current greedy first-match semantics to avoid altering cluster inputs. (3) `_ITEMS_PER_FEED`/per-source caps run before cross-source dedup, so some duplicates never meet — accept; this plan does not change caps (I3 is OP10 territory).
- **Testing:** Unit: three same-story fixtures from different tiers → one survivor, two `merged_sources`, `first_seen_dt` = earliest, tier-1 text canonical. Property test: `len(dedup(items)) + sum(len(i.merged_sources) for i in out) == len(items)` (nothing destroyed). Golden fixture: reviewed diff committed as the new baseline.
- **Success criteria:** On the golden fixture, zero items destroyed by dedup (all folded); on live data over 3 days, `merged_sources` non-empty on ≥ 15% of kept items (measured via OP1.5 logging); no category-mix regression beyond the reviewed baseline.

### OP1.3 — Spend merged provenance in event evidence and corroboration

- **Why it matters:** OP1.2 preserves the signal; this task makes the editorial engine spend it. `corroboration_count` drives the confirmed/developing lanes, the 1.5× multiplier (`events.py:310`), and admission (`events.py:441-448`) — all currently undercounting.
- **What:** In `build_market_events` (`events.py:476-505`): when iterating members, also expand each member's `merged_sources` into `EventEvidence` entries (same URL-dedup guard, same tier/qualification logic at `events.py:497` — a merged tier-1 source qualifies exactly as a live member would; `kind=evidence_kind(...)` from the merged title). `first_seen` (`events.py:500-501`) computed over `first_seen_dt or published_dt`. `sources`/`qualified` sets (`events.py:504-505`) now naturally include merged sources.
- **Dependencies:** OP1.2.
- **Complexity:** M.
- **Affected:** `app/events.py` (evidence loop, first_seen calc), no schema change — `EventEvidence` already has the right shape.
- **Migration:** `corroboration_count` will step up across the board; the `developing` flag (`== 1 qualified`, `events.py:552`) will flip to confirmed for genuinely multi-wire events. This is the intended epistemology change. Editorial-score distribution shifts (corroboration multiplier fires more) — re-baseline the golden fixture and sanity-check `ADMISSION_FLOOR` still bites on the fixture's junk events.
- **Risks:** Double-counting if a merged source's URL also survives as a separate item that landed in the same cluster — the existing `seen_urls` guard (`events.py:477-482`) already prevents this. Same-publisher re-reports inflating counts — counts are distinct-*source* sets (`events.py:504-505`), already safe.
- **Testing:** Unit: cluster whose primary carries 2 merged tier-1 sources → `corroboration_count == 3`, `developing == False`, `first_seen` == earliest merged time. Regression: decay anchored to the merged first_seen produces a *lower* editorial score for a stale-but-rereported event than pre-change (the E1 fix finally behaving).
- **Success criteria:** On live data, median `corroboration_count` of admitted macro events rises (expect roughly 1 → 2–3); the confirmed lane is no longer starved (share of admitted events with `corroboration_count ≥ 2` at least doubles vs. the pre-change week); no event admitted on the fixture that was previously floor-rejected for score reasons unrelated to corroboration.

### OP1.4 — Count beyond the cluster caps

- **Why it matters:** Audit I6/T5: clusters retain primary + 6 related (`clustering.py:32`), and evidence/corroboration are computed from retained members only, while `story_count` remembers the true total and is never spent.
- **What:** Two changes. (a) `StoryCluster` gains `overflow_sources: list[MergedSource]` (defaulted) — when `_MAX_RELATED` truncates, the dropped members' identity rows are kept even though full items are not. (b) `build_market_events` folds `overflow_sources` into the evidence loop like OP1.3's merged sources. Do **not** raise `_MAX_RELATED` itself (memory/pickle cost, UI lists stay bounded).
- **Dependencies:** OP1.3 (shares the evidence-expansion code path).
- **Complexity:** S–M.
- **Affected:** `app/clustering.py` (truncation site, dataclass), `app/events.py` (evidence loop).
- **Migration:** Additive field; old pickles fine.
- **Risks:** Minimal — identity rows only, no scoring text from overflow members.
- **Testing:** Unit: cluster with 10 members → 7 full members + 3 overflow rows; event evidence lists all 10 sources; `source_count == 10`.
- **Success criteria:** `story_count == len(event.evidence)` invariant on the fixture (audit I6 closed); no cluster ever again shows `story_count > 7` with 7 evidence rows.

### OP1.5 — Corroboration instrumentation + golden-fixture harness

- **Why it matters:** OP1.2/1.3 change the pipeline's most load-bearing numbers; this task builds the net first (rule 3) and the measurement that proves the program worked. It also finally populates the dead `PerSourceStats` funnel counters the audit flagged (I12/B3) *for the dedup stage only* (full funnel exposure is OP8, out of scope).
- **What:** (a) Fixture harness under `tests/`: canned feedparser payloads (≥ 4 sources, deliberate cross-source duplicates, one multi-day story), frozen clock, snapshot assertions on items/clusters/events/explanations. (b) Per-cycle INFO log line: items in, folded, survivors, corroboration histogram of admitted events. (c) Populate `PerSourceStats.raw_fetched/post_dedup` (`feeds.py:604-622`) and store the list on `ProcessedFeed.debug_log`-adjacent field or `FeedManager.last_source_stats` as its own docstring already promises.
- **Dependencies:** none (lands first in Sprint 1).
- **Complexity:** M.
- **Affected:** `tests/` (new), `app/feeds.py` (`fetch_all` counters), `app/background.py` (cycle log).
- **Migration / Risks:** none — observational.
- **Testing:** The task *is* testing infrastructure; CI runs the fixture suite.
- **Success criteria:** Fixture suite green pre-change and used as the review artifact for OP1.2/1.3 baselines; the weekly corroboration histogram exists in logs (the OP1 success metrics above are computable from it).

---

## 2. OP2 — Stable event identity

Today `MarketEvent.id == cluster.id == md5(primary.title + primary.url)` (`clustering.py:306-308`, `events.py:9-15`) and the primary changes as scores drift, so the same real-world event changes identity across cycles (audit I7), fragmenting theme linkage, archive refs, explanation keys, and any future outcome ledger. Clustering windows (3–8h vs the 48h feed) additionally split multi-day stories into sibling events (I8).

**Design constraint discovered in the audit and honored here:** `event.id`'s equality with `cluster.id` is load-bearing for theme linkage (`events.py:461-465` joins themes via `contributing_cluster_ids`). Therefore: **`id` stays cluster-scoped and ephemeral; a new `uid` becomes the durable identity.** Nothing that currently joins on `id` changes in OP2.

### 2.0 Event lifecycle charter and authority model *(amended — governs every OP2 task)*

**Charter.** An **event** is a discrete real-world occurrence with a bounded lifecycle (typically hours to ~two weeks of active reporting). Long-running arcs — a hiking cycle, a months-long deal saga — belong to **themes and narratives**, not to event identity. Follow-ups, escalations, corrections, and successor occurrences are related to prior events through **edges between uids** (`follows`, `corrects`, `supersedes`), never by silently sharing identity. The registry is an identity system, not a narrative store; anything that needs an arc reads the theme layer or walks successor edges.

**Authority model [C1, C6].** The append-only **identity journal** is the permanent source of truth for identity. The **registry is a bounded hot materialized view** over the journal's active window — disposable and rebuildable by replay at any time, and replaceable later by SQLite or another indexed store without touching the journal. Identity **mutation is single-writer**: minting, aliasing, folding, eviction, and retraction serialize through one authority interface, invoked only by the full-feed background cycle (the same `if not categories and not sources` guard the institutional-memory writer uses — partial/Markets-only warm runs resolve uids **read-only** and never mint). Ingestion and extraction may fan out; **minting never does**. In-process, a lock serializes mutations; in any future multi-worker or distributed deployment, workers scale around this single identity authority (the interface is the future service boundary), never by sharding it.

**Identity is annotated, never rewritten [C3].** Merges alias, splits supersede, retractions mark — no journal record is ever mutated or deleted, and no uid is ever reassigned.

### OP2.1 — Identity authority: journal + registry hot view *(amended [C1, C2, C6, C7])*

- **Why it matters:** The identity layer is the missing cross-cycle memory of "which events exist." Every downstream persistence task (OP3.4 explanations history, prediction outcomes, archive evidence refs) keys on it — some of them years later, which is why permanence lives in the journal, not the hot view.
- **What:** New `app/event_identity.py` exposing one mutation interface (the **identity authority**) and two artifacts:

  **(a) Identity journal** — an append-only JSONL stream (`data/ledger/identity-YYYY-MM-DD.jsonl`, on the OP3.1 ledger substrate). Record types, all carrying `{v: 1, ts (injected cycle clock, never wall-clock inside logic), cycle_id}`:
  - `mint` — `{uid, event_type, origin_fingerprint: {title_words, anchor_entities}, natural_keys: [], member_urls, first_seen}`
  - `attach` — `{uid, member_urls_added, latest_fingerprint, match_rule, match_score, last_seen}` (continuity observation)
  - `alias` — `{uid (younger), canonical_uid (elder), reason: "fold", match_rule}` — permanent; see OP2.4
  - `supersede` — `{uid (parent), superseded_by: [child_uids], reason}` (split — children are fresh mints; parent history untouched)
  - `retract` — `{uid, reason, source_ref}` (uid preserved; disposition changes, identity never deleted)
  - `evict` — `{uid, reason: "ttl" | "cap"}` (leaves the hot view **only**; identity remains permanently resolvable through the journal)

  **(b) Registry hot view** — in-memory dict + atomic snapshot (`data/event_registry.json` via temp-rename) carrying a `journal_watermark`. Entry schema: `{uid, status: "active" | "dormant" | "superseded" | "retracted", event_type, origin_fingerprint (frozen at mint), latest_fingerprint (updates on attach), natural_keys, member_urls (capped), first_seen, last_seen, cycles_observed, last_cluster_id, aliases_in: []}`. **Startup:** load snapshot if parseable, then replay journal records past the watermark; if the snapshot is corrupt or absent, rebuild the entire hot view by replaying the journal's active window (14 days) — **corruption recovery is replay, never amnesia**. **Torn tail:** a malformed final journal line (crash mid-append) is skipped with a WARNING; worst case loses one cycle's identity actions, never history. Snapshot per cycle initially (cadence decoupled later if profiling demands).

  **uid scheme [C2]:** `ev_` + ULID (128-bit, Crockford base32). Opaque — no embedded semantics, never parsed. Permanent once minted. Replay **reads** mint records; it never re-mints, so rebuilt views always carry the originally assigned uids.

  **Natural keys [C2]:** `namespace:value` entries (e.g. `sec:0000320193-26-000042`, future `transcript:<id>`), unique across the hot view. Matching **rule 0**: an observation carrying a known natural key resolves to that uid exactly, bypassing all fuzzy matching.

  **Matching ladder** (per candidate, in order): (0) natural key; (1) any shared member URL; (2) shared anchor entity AND title-Jaccard ≥ 0.4 against **origin or latest** fingerprint AND within 72h of `last_seen` AND same `event_type`; (3) title-Jaccard ≥ 0.6 against either fingerprint within 72h, same `event_type` (entity-less macro stories). **Drift guard [C7]:** for rules 2–3 the candidate must additionally share ≥ 1 anchor entity or member URL with the **origin** fingerprint — day-3 headline evolution still matches via `latest`, but chained drift (A→B→C where C no longer resembles A) dies at the root. **Same-cycle dedup [C6]:** candidates are processed in deterministic order (sorted cluster id) and match against the hot view *including entries minted earlier in the same cycle* — two novel same-story clusters can never both mint.

  **Write authority [C6]:** mutation methods live behind the one interface; only the full-feed cycle calls them; partial runs get read-only resolution. In-process mutations are lock-serialized; the interface is documented as the future single-writer service boundary for any multi-worker deployment.

  **Flag:** `event_identity` (master). Off → no journal writes, no uids, exact Sprint 2 behavior — the instant-rollback hatch.
- **Dependencies:** OP3.1a (ledger substrate — journal infra lands first); OP1.3 (merged URLs make rule 1 far stronger).
- **Complexity:** L. Thresholds still need the tuning pass against a recorded multi-cycle trace.
- **Affected:** new `app/event_identity.py`; `app/background.py` (authority call after `build_market_events`, full-feed guard); `app/config.py` (flags); `data/ledger/`, `data/event_registry.json`.
- **Migration:** Journal and view start empty — uids are only meaningful going forward, no backfill. The hot view is disposable at any time (delete → replay rebuilds it).
- **Risks:** (1) **Over-merge** — drift guard + type match + adversarial fixtures (two Fed-speaker headlines; two same-sector earnings). (2) **Under-merge** — acceptable; degrades to Sprint 2 behavior, never worse. (3) **Alias chains** — an `alias` record must always point to a canonical uid that is not itself an alias *at write time* (resolve-before-write), making resolution a single hop; a visited-set + depth-cap in the resolver is belt-and-braces against journal corruption. (4) Journal growth — bounded by C5 policy (compress, cold-tier, never delete).
- **Testing:** Replay determinism (journal → byte-identical hot view, identical uids); snapshot + watermark recovery; corrupt-snapshot full replay; torn-tail skip; same-cycle duplicate-mint prevention; drift-guard adversarial cases; natural-key exact resolution; retracted-vs-never-existed distinguishability; post-eviction uid resolution via journal; partial-run read-only enforcement.
- **Success criteria:** ≥ 90% single-uid continuity on a sampled 24h trace (N=30) with zero over-merges — unchanged; **plus [C1/C2]:** cold-start rebuild from journal reproduces the pre-crash hot view exactly; a uid evicted from the hot view remains resolvable; no natural key ever maps to two uids; `event_identity=false` restores Sprint 2 behavior byte-for-byte on the golden fixture.

### OP2.2 — Thread `uid` through MarketEvent, Explanations, the API — and the archive *(amended [C8])*

- **Why it matters:** A registry nobody reads is dead compute. This makes `uid` addressable everywhere `id` is today, without breaking `id`'s cluster join — and it stops the sealed archive from accruing another year of references to ephemeral cluster md5s, which was the audit's original complaint.
- **What:** `MarketEvent.uid: str = ""` (defaulted, set by the identity authority in the background cycle; alias-resolved so a folded event carries its canonical uid). `ProcessedFeed.explanations` becomes keyed by `uid` **additively**: keep the current `id` key and add a parallel `uid → same dict` entry during a two-sprint transition (shared references; cost is keys only). Serialize `uid` on the event schema (`api/routes/feed.py:296,534` region) and add it to `frontend/src/lib/types.ts`. Frontend consumers keep using `id` until OP4 tasks switch them. **[C8] Institutional-memory dual-referencing:** from the first uid deployment, the archive writer records `uid` alongside the legacy cluster-id in every evidence reference it seals (`graph_adapter.py` / `snapshot_builder.py` evidence_refs — additive field, invisible to existing readers). Legacy cluster ids are preserved where existing consumers require them; the stable uid is the permanent reference going forward; **no new sealed record may reference only an ephemeral cluster id.**
- **Dependencies:** OP2.1.
- **Complexity:** M.
- **Affected:** `app/events.py` (dataclass), `app/background.py` (assignment), `app/processed_cache.py` (no schema change — dict), `api/routes/feed.py`, `frontend/src/lib/types.ts`, `app/institutional_memory/graph_adapter.py` + `snapshot_builder.py` (evidence_refs dual-write).
- **Migration:** Dual-keyed explanations dict guarantees no consumer breaks; old pickles fine (defaulted field); archive rows gain an additive field — rollback leaves harmless extra refs, never dangling ones.
- **Risks:** Key-count doubling in `explanations` — trivial. Confusion risk between `id`/`uid` for future contributors — one comment block at the `MarketEvent` dataclass stating the contract ("`id` joins clusters/themes within a cycle; `uid` is durable identity across cycles") is the mitigation.
- **Testing:** API contract test: every serialized event has non-empty `uid`; explanations reachable by both keys; fixture asserts `uid` stability across two simulated cycles while `id` changes; **[C8]** archive-writer test: every sealed evidence ref carries both ids, and a fold mid-transition seals the canonical (alias-resolved) uid.
- **Success criteria:** 100% of admitted events carry a uid; a frontend `fetch` two cycles apart can join the same story by uid (demonstrated in a test, not a UI change); zero post-deploy sealed records referencing only cluster ids.

### OP2.3 — Registry-anchored `first_seen` and continuity fields

- **Why it matters:** Even with OP1.3, `first_seen` is min-over-*current-members* (`events.py:500-501`). The registry knows the true lifetime first observation — this is the final piece of the E1 decay fix, and `cycles_observed` is the first honest "developing for N hours" signal Argus has ever had.
- **What:** After identity resolution, override `event.first_seen = min(member-derived, registry.first_seen)`; recompute `editorial_score` after the override (decay uses it — `events.py:555` currently scores before any registry pass, so the score call moves or repeats post-match). Add `cycles_observed` to the event schema. **[C7] Behind flag `registry_decay`** (default on once OP2.1 soaks; off → member-derived first_seen only) with the same instant-rollback contract as `merge_dedup`.
- **Dependencies:** OP2.1, OP2.2.
- **Complexity:** S–M.
- **Affected:** `app/background.py` (ordering), `app/events.py` (rescore), `api/routes/feed.py`, `app/config.py` (flag).
- **Migration:** Decay now correctly punishes old-but-rereported events — expect some long-running stories to drop in rank. That is the E1 fix working; review on live data for a week before considering threshold retunes.
- **Risks:** Double-scoring cost (negligible — pure function); a mis-merged registry entry drags a fresh event's first_seen backward (bounded by OP2.1's over-merge criteria; monitor via the sample audit).
- **Testing:** Fixture: day-2 re-report of a day-1 event scores lower than a genuinely new event of equal corroboration.
- **Success criteria:** Zero events in the weekly sample whose displayed age contradicts registry first_seen; decay curve on multi-day stories monotonic across cycles.

### OP2.4 — Multi-day story continuity (registry-level folding with alias semantics) *(amended [C3, C7])*

- **Why it matters:** Audit I8: clustering windows (3–8h) split developing stories into sibling events, splitting corroboration and double-surfacing. Widening clustering windows would perturb the whole cluster layer; folding at the identity layer gets the continuity with a fraction of the blast radius.
- **What:** When two *current-cycle* events match the same registry entry (rules in OP2.1), fold the younger into the older before admission: merge evidence (URL-deduped), recompute corroboration/first_seen/score, keep the elder's `uid`. This generalizes the existing `_fold_near_duplicates` (`events.py:403,559`) from title-similarity-now to identity-over-time. **[C3] Alias semantics:** if the younger event had already minted a uid (duplicate discovery across cycles), the fold appends an `alias` journal record — the younger uid becomes a **permanent alias** of the elder canonical uid. Alias resolution is deterministic and cycle-safe: canonical uids are resolved *before* the alias record is written (so every stored alias is a single hop), and the resolver carries a visited-set + depth-cap as corruption armor. Every consumer path that accepts a uid (explanations keys, archive refs, future predictions) resolves aliases first. **Splits** (one grouping later revealed to be two occurrences) are never retroactive: mint fresh child uids, append `supersede` on the parent, leave the parent's history intact. **[C7] Behind flag `registry_folding`** (off → Sprint 2 behavior: siblings surface separately).
- **Dependencies:** OP2.1–2.3.
- **Complexity:** M.
- **Affected:** `app/events.py` (fold pass), `app/event_identity.py` (alias/supersede records + resolver), `app/config.py` (flag).
- **Migration:** Fewer, stronger events on multi-day stories; feeds may look "shorter" on slow days — that is E8-honest, not a regression. Aliases are forward-only; rollback (flag off) stops new folds but already-written aliases remain valid resolutions forever.
- **Risks:** Same over-merge risk as OP2.1, now user-visible as a wrongly-fused event. Keep rule 0 (natural key), rule 1 (shared URL) and rule 2 (entity + Jaccard + same event_type) only for folding; do **not** fold on rule 3 (title-only).
- **Testing:** Fixture: day-1 "Company X explores sale" + day-2 "Company X hires advisers for sale" (shared entity, type ma) → one event, merged evidence, day-1 first_seen. Negative: two different companies' earnings, no fold. **[C3]** Alias tests: cross-cycle duplicate discovery → alias record, both uids resolve to one canonical; alias-of-alias impossible at write time; resolver survives a hand-corrupted cyclic alias pair; supersede leaves parent queryable with `superseded_by` populated.
- **Success criteria:** In a week of live data, sampled multi-day stories (N=15) surface as one event ≥ 80% of the time, with zero wrong fusions in the sample; every historical uid ever exposed to a consumer still resolves after arbitrary fold sequences.

### OP2.5 — Hot-view hygiene: eviction, restart survival, observability *(amended [C1, C5])*

- **Why:** A hot view that grows forever or dies on restart re-creates the problems it solves — but hygiene applies to **residency, never to identity**.
- **What:** 14-day **eviction** sweep per cycle and a 5,000-entry cap, both emitting `evict` journal records — an evicted uid leaves the hot view but remains permanently resolvable through the journal (eviction ≠ deletion, per the C1 authority model). Startup replay metric log ("hot view: N entries rebuilt, watermark X, replayed Y records"), a `/api/feed/status`-style count in the existing status payload (no new endpoint). Corrupt snapshot → full window replay (specified in OP2.1); this task adds the drill.
- **Dependencies:** OP2.1. **Complexity:** S. **Affected:** `app/event_identity.py`, `api/routes/feed.py` (status field).
- **Risks/Migration:** none material — the view is disposable by design.
- **Testing:** Eviction unit test (evicted uid still resolves via journal); restart drill asserting replay metrics; snapshot-deletion drill (view rebuilt identically from journal).
- **Success criteria:** Hot view survives deploys and snapshot loss (staging drills); size stable over 30 days; zero uids rendered unresolvable by hygiene.

---

## 3. OP3 — Durable observation ledger + memory rehydration

Today the observation store is three `ProcessedFeed` pickles overwritten every cycle (`processed_cache.py:185`, audit I19); Supabase institutional memory is off by default (`config.py:80`); `ThemeMomentumTracker` state dies with the process and pollutes the sealed archive with reset values (T6); Explanations are never persisted (T2); saved items live in a module dict (B13).

### OP3.1 — Observation ledger substrate *(amended [C4, C5] — delivered as 3.1a substrate + 3.1b assessments)*

- **Why it matters:** This is the system's permanent record of what it observed and what it concluded — two different things with different lifecycles, kept as different row types. It converts the discarded `new_this_cycle` diff (`background.py:609-617`) into history, carries the identity journal (OP2.1 rides on this substrate), and feeds every "what changed since yesterday" feature, OP1's success metrics, and the future Institutional Timeline.
- **What:** New `app/observation_ledger.py`: a shared append-only JSONL substrate under `data/ledger/` with **three streams** — `observations-`, `assessments-`, `identity-` (daily files). Every row carries `{v: <schema_version>, kind, ts, cycle_id, seq}`; a row is addressable as `<date>#<seq>`.

  **Observation rows [C4] — immutable facts, never mutated:**
  `{v, kind: "observation", seq, url, source, tier, title, snippet, published_dt, fetched_at, first_seen_dt, content_hash, provenance: {feed_url, merged_from: [urls]}, disposition: "admitted" | "folded" | "suppressed", supersedes: "<date>#<seq>" | null}`
  Corrections **append** a new observation row with `supersedes` pointing at the corrected row — the original is never edited or deleted. A false report stays in the record with its correcting row appended (and, where the event itself is withdrawn, the identity stream's `retract`); history shows both the error and the correction, which is precisely the institutional memory. Sprint 3 writes `admitted` (and `folded`, cheap via merge provenance) rows; the `suppressed` disposition is reserved schema for OP8 — the field exists from v1 so suppression capture needs no migration.

  **Assessment rows [C4] — append-only, engine-versioned interpretation:**
  `{v, kind: "assessment", seq, event_uid (alias-resolved), engine_version, ts, editorial_score, score_components, lane: "developing" | "corroborated", corroboration_count, source_count, confidence, theme_ids, disposition: "admitted" | "floor_rejected"}`
  Written when an event's assessment materially changes (hash-gated like OP3.4), not every cycle. An assessment is a statement by a specific engine version at a specific time — later engines append newer assessments; nothing overwrites.

  **Retention [C5]:** gzip files older than 7 days; move to a cold tier (`data/ledger/cold/`, or object storage when deployed) after 90; **never delete**. Retention limits apply to hot *views and indexes only* (which are rebuildable), never to the journal. Disk honesty: < 5 MB/day uncompressed at current volumes — permanence costs megabytes.
  Writes are best-effort — a ledger failure never fails the pipeline (WARNING + continue); readers skip torn tail lines.
- **Dependencies:** 3.1a (substrate + observation stream + identity stream infra): OP1.1 fields only — **lands before OP2.1, which writes into it**. 3.1b (assessment stream): OP2.2 (uids).
- **Complexity:** M (3.1a) + S (3.1b).
- **Affected:** new module; `app/background.py` (call site next to the existing `new_this_cycle` computation); `app/event_identity.py` (journal stream client); `data/ledger/`.
- **Migration:** None — new artifact. Rollback: stop writing; existing rows remain valid forever (append-only means rollback never corrupts).
- **Risks:** Disk growth on runaway loops (per-cycle row cap of 2,000 + compression guards it; deletion is not the answer); PII/none (public headlines only); schema drift (every row self-describes via `v` — readers must tolerate unknown newer fields).
- **Testing:** Unit: two simulated cycles → second cycle logs only deltas; correction rows append with `supersedes` and originals remain readable; observation immutability (no code path rewrites a row); assessment append-on-change gating; corrupt-line tolerance; rotation/compression with frozen clock; cold-tier move preserves addressability.
- **Success criteria:** After 7 live days: the ledger answers "when did Argus first see event uid X, and how did its corroboration evolve?" for any sampled event **from observation + assessment rows alone**; OP1's corroboration histogram computed from the ledger instead of log-grepping; a simulated correction is reconstructable as original → superseding row with both visible.

### OP3.2 — `ThemeMomentumTracker` persistence + rehydration

- **Why it matters:** Audit T6 — every restart resets mature themes to "emerging"/delta-0/persistence-0, and those resets are *written into the sealed archive* as spurious state changes. This is active corruption of the system's only durable memory, and it recurs on every deploy.
- **What:** Serialize tracker state (per theme: momentum label, delta, prior confidence, persistence_cycles, persistence_days, last_observed) into the existing `data/theme_memory/theme_memory.json` alongside ThemeMemory's own data (same file, new top-level key — one persistence path, not a fourth store). Load on construction (`theme_graph.py:118-211`). Downtime handling: if `now - last_observed > 2h`, decay persistence counters proportionally rather than resuming as if uninterrupted; if > 24h, cold-start as today (explicit, logged).
- **Dependencies:** none (independent of OP1/OP2 — can land any sprint; scheduled early because it stops ongoing archive pollution).
- **Complexity:** M.
- **Affected:** `app/theme_graph.py`, `app/theme_memory.py` (file owner), `data/theme_memory/`.
- **Migration:** First run after deploy finds no tracker key → behaves exactly as today (one last cold start), then never again.
- **Risks:** Stale rehydration asserting momentum that died during downtime — the 2h/24h decay policy above is the mitigation; log every rehydration with age. Concurrent write to theme_memory.json — reuse ThemeMemory's existing write lock/path rather than adding a second writer.
- **Testing:** Restart drill: simulate 3 cycles → restart → next cycle asserts momentum label/delta continuity; downtime drill (mock 26h gap) asserts explicit cold start; archive snapshot test asserts no state-transition record is emitted for a pure restart.
- **Success criteria:** A staging restart produces **zero** momentum-reset transitions in the archive (vs. one per theme today); `persistence_days` survives deploys.

### OP3.3 — Enable institutional memory persistence by default

- **Why it matters:** Audit I19: `institutional_memory_enabled: bool = False` (`config.py:80`) means the sealed archive, snapshots, and transitions — the entire M3 investment — accrue nothing in the default configuration. Every day it stays off is a day of history that can never be backfilled, and OP4.4/OP4.5 read this history.
- **What:** Flip the default to on **when credentials are present**: `enabled = bool(supabase_url and supabase_key)` with an explicit `ARGUS_MEMORY_DISABLED` escape hatch. Startup logs one unmistakable line either way (extending the existing persistence probe from commit 160a780). Verify the writer's failure mode is non-fatal (it must degrade to logging, never block the cycle).
- **Dependencies:** OP3.2 first — otherwise the archive seals restart-corrupted momentum values at higher volume.
- **Complexity:** S (config + verification), plus a staging soak.
- **Affected:** `app/config.py`, `app/institutional_memory/writer.py` (failure-mode review), deployment env docs.
- **Migration:** Archive history simply begins; the credibility gate (`reasoning.py:39-44`, ≥ 60 sealed days) starts counting — flipping this default is literally starting the clock on the analog engine (audit T21).
- **Risks:** Supabase outage in the write path — must be try/except-bounded per write with circuit-breaker logging; quota/cost — snapshot volume is per-theme-per-day, small.
- **Testing:** Staging soak with real credentials for 3 days: seals appear daily; kill Supabase mid-cycle → pipeline unaffected, WARNING logged.
- **Success criteria:** Sealed days counter increments daily in production; zero pipeline failures attributable to the writer over the soak.

### OP3.4 — Persist Explanations history

- **Why it matters:** Audit T2: verdict bands, counterevidence, and chains vanish every cycle and restart. Persisting them creates the record of *how conviction evolved* — the raw material for calibration, and for any future "Argus said X on Monday" accountability surface.
- **What:** A fourth stream on the OP3.1 substrate (`explanations-YYYY-MM-DD.jsonl`, same row headers, same retention [C5]): when an event's explanation `content_hash` changes (the hash already exists per audit T2), append the full explanation dict keyed by **alias-resolved** `uid` [C3] with `engine_version` [C4]. Not Supabase (volume and shape don't fit the snapshot schema); revisit after OP4.3 settles the consumer story.
- **Dependencies:** OP2.2 (uid keys), OP3.1 (ledger infra).
- **Complexity:** S–M.
- **Affected:** `app/observation_ledger.py`, `app/background.py` (hash-change detection beside `build_explanations` at `background.py:483-498`).
- **Migration:** none — new artifact.
- **Risks:** Volume if hashes churn every cycle (e.g. an unstable field inside the hashed payload) — measure churn in the first week; if > 3 versions/event/day median, find and exclude the unstable field from the hash rather than throttling writes.
- **Testing:** Unit: unchanged explanation → no write; band change → one write; restart → no spurious rewrite (hash recomputed identically).
- **Success criteria:** For any sampled event, the full band trajectory (e.g. developing→confirmed, confidence 40→65) is reconstructable from the ledger.

### OP3.5 — Saved items durability + full schema

- **Why it matters:** Audit B13: saved research is erased on every deploy (`saved.py:16` module dict), and the schema drops `affected_entities`/`signal_strength`, so even surviving saves lose entity linkage. Losing user-curated signal is losing the highest-intent observations Argus has.
- **What:** Back `api/routes/saved.py` with a JSON file in `data/saved/` (atomic write, same pattern as the registry; per-user keying when auth arrives — today's single-user model keeps one file). Add the two dropped fields plus `event_uid` (OP2.2) to the saved schema so saves join the event world permanently.
- **Dependencies:** OP2.2 for `event_uid` (fields can land without it).
- **Complexity:** S.
- **Affected:** `api/routes/saved.py`, `data/`.
- **Migration:** In-memory saves are already lost on every deploy; nothing to migrate.
- **Risks:** none material.
- **Testing:** Save → restart → list returns the item with entities intact.
- **Success criteria:** Saved items survive a staging restart; every new save carries entities and (post-OP2) an event uid.

---

## 4. OP4 — Consume the canonical reasoning

The cheapest large win: the backend already computes and ships typed transmission chains (zero consumers — audit B4), canonical Explanations (one consumer — B5), and theme-memory history (unreachable — B7/B8), while the frontend graph ingests none of it (C1) and legacy engines fill the vacuum (C22, R4). Per the audit's UI rule, the UI changes here exclusively expose already-computed, currently-unreachable intelligence.

### OP4.0 — Boundary prerequisites: serialize the fields consumption needs

- **Why it matters:** Three OP4 tasks dead-end without ~30 lines of serialization: `published_dt` is not on `FeedItemSchema` (B2 — so the graph fabricates `Date.now()` timestamps, C2, killing staleness detection), and `uid` needs to ride the schema (OP2.2 covers it; listed here as the join point).
- **What:** Add `published_ts: str | None` (ISO) and `fetched_at: str | None` to `FeedItemSchema` (`api/routes/feed.py:49-84` — `RelatedStorySchema` already has `published_ts` at `feed.py:135,147`; this closes the per-schema inconsistency). Mirror in `frontend/src/lib/types.ts`. In `ingestStories` (`intelligenceGraphAdapters.ts:191-198`), set `firstSeen`/`lastSeen` from the payload instead of letting them default to `Date.now()` (`intelligenceGraph.ts:189-190`).
- **Dependencies:** OP1.1 (`fetched_at` exists).
- **Complexity:** S.
- **Affected:** `api/routes/feed.py`, `frontend/src/lib/types.ts`, `frontend/src/lib/intelligenceGraphAdapters.ts`.
- **Migration:** Additive schema; old clients ignore new fields.
- **Risks:** The moment real timestamps flow, the evidence engine's freshness component (evidenceEngine.ts:80) stops being saturated at ~100 — evidence scores will *drop* for old stories, changing profile/drawer outputs. Intended (staleness detection resurrects, audit C2), but land it with the parity logging of OP4.3a so the shift is observed, not discovered.
- **Testing:** Contract test: every serialized item with a known publish time carries `published_ts`; frontend unit: `ingestStories` on a 3-day-old item yields recencyDays ≈ 3, and the `stale_evidence` contradiction (evidenceEngine.ts:153-154) can now fire in a test — it never could before.
- **Success criteria:** Zero `Date.now()` fallbacks for items that have publish times (assert via a dev-mode counter); the stale-evidence path has its first passing test in the repo's history.

### OP4.1 — Ingest events + Explanations into the intelligence graph

- **Why it matters:** Audit C1/H1: the graph — and everything reasoning over it (evidence engine, inference engine, profiles, drawer) — sees article-level Story nodes only, with none of the corroboration, tiered evidence, typed chains, or attribution the backend ships on every response. This task is where the frontend stops re-deriving a weaker world.
- **What:** New `ingestEvents(state, events, explanations)` in `intelligenceGraphAdapters.ts`: one `event` node per uid (metadata: corroboration_count, source_count, lane, event_type, first_seen, cycles_observed), edges event→company (`companies_direct` = attributed, others = contextual — preserve the 3adc1fb attribution distinction), event→theme (theme_ids), and evidence edges event→story where cluster stories exist in-graph. Attach the Explanation dict to the event node's metadata for downstream consumers. Wire into `useArgusIntelligence` beside `ingestStories`. Edge confidence from corroboration tier, not the default-50 (partial C16 relief in the new code path only).
- **Dependencies:** OP4.0; OP2.2 (uid — can ship keyed on `id` and re-key, but sequencing puts uid first so don't).
- **Complexity:** L (adapter + graph node kind + consumer contract; no visual work).
- **Affected:** `frontend/src/lib/intelligenceGraphAdapters.ts`, `intelligenceGraph.ts` (node kind), `hooks/useArgusIntelligence.ts`, `lib/types.ts`.
- **Migration:** Purely additive to the graph — existing surfaces don't read event nodes until OP4.3 switches them. Graph size grows ~50 nodes/cycle; the rebuild-on-input-change lifecycle (C15) handles it.
- **Risks:** Duplicate reasoning surface (event nodes + story nodes both feeding legacy engines could double-count in evidence scoring) — until OP4.3, legacy engines must *ignore* event nodes (kind filter), enforced by a test.
- **Testing:** Unit: fixture FeedResponse → expected node/edge counts, attribution split preserved, Explanation reachable from node; legacy-engine isolation test (evidence scores identical with and without event nodes present).
- **Success criteria:** For any admitted event, the graph can answer "which companies, which theme, how corroborated, what does the canonical Explanation say" without touching legacy engines — demonstrated by the dossier reading it from the graph instead of its private path (`lib/intel/dossier.ts:584`) with identical rendered output.

### OP4.2 — Render the typed transmission chain (kill the prose fallback's monopoly)

- **Why it matters:** Audit B4: the IRE-1 typed chain — rel UIDs, per-hop confidence, recorded/curated basis — is serialized on every event and read by nobody; the UI renders LLM-era prose (`ev.transmission`) instead (R3's fix stalled one hop from the screen). This is the single most visible "expose shipped intelligence" win.
- **What:** In `EventDossier.tsx:351-354` and `CompanyDossier.tsx:236-238`: when `ev.transmission_chain` is non-empty, render the typed hops (existing chip/badge components — no new design language) with per-hop confidence and basis; fall back to prose only when the chain is absent; tag the prose fallback "unverified narrative" so the two epistemologies are never visually equivalent.
- **Dependencies:** none — the data is already in `lib/types.ts:81,94-103`. Independent of every other task; scheduled in Sprint 1 as the program's first visible proof.
- **Complexity:** S–M.
- **Affected:** `frontend/src/components/intel/EventDossier.tsx`, `CompanyDossier.tsx`.
- **Migration/Risks:** Chains may be sparse or ugly on real data since they've never had a consumer — expect a backend fix-forward loop the first week (that feedback loop is precisely the point of consuming what you compute).
- **Testing:** Component test: chain present → hops rendered, no prose; chain absent → prose + unverified tag.
- **Success criteria:** `transmission_chain` consumer count goes 0 → 2; a week of dogfooding files at least one backend chain-quality issue (evidence the loop is closed).

### OP4.3 — Migrate surfaces from legacy engines to canonical Explanations (staged)

- **Why it matters:** Audit B5/C22/R4: Feed, Morning Brief, Markets, profiles, and the drawer render client-derived confidence that can disagree with the canonical Explanation for the same event — an active dual-source-of-truth. This is the program's largest consumption task, done in three gated stages.
- **What & stages:**
  - **4.3a — Feed event cards** read lane/verdict/confidence from the event's Explanation (via OP4.1 graph nodes) behind `NEXT_PUBLIC_IRE_SURFACES`. Dual-run: while flagged off, log divergence between legacy verdict and Explanation band per event (dev-mode console table + a counter).
  - **4.3b — Drawer/profiles**: `IntelligenceDrawer`/entity profiles consume Explanation sections (evidence list, confidence band, counterevidence) for event-backed entries; legacy engines remain for non-event-backed content (theme-only views) — scope line drawn explicitly: legacy engines are *removed from event reasoning*, not deleted wholesale in this task.
  - **4.3c — Morning Brief**: brief lines that reference events carry the Explanation band instead of client-derived conviction (R7-adjacent honesty; no layout change).
- **Dependencies:** OP4.1; OP4.0. Parity gate to flip the flag: 7 days of divergence logging with disagreements either < 5% or individually explained (each explained case is by definition a legacy-engine defect or a backend gap — both are wins to find now).
- **Complexity:** L (largest task in the plan; the stages are independently shippable).
- **Affected:** `frontend/src/components/feed/ClusterCard.tsx` (verdict source), drawer + profile components, `lib/morningBrief*`/`morningBriefingEngine.ts`, flag plumbing.
- **Migration:** Users see confidence numbers change when the flag flips — announce via changelog line; the parity log is the evidence the new numbers are the defensible ones.
- **Risks:** (1) Explanation coverage gaps (events without explanations, non-event content) — every consumer keeps an explicit fallback and renders the *source* of its number (band vs legacy) in dev mode. (2) Perceived regression when canonical confidence is lower than legacy optimism — that is the honesty working; hold the line.
- **Testing:** Parity harness (the dual-run log) is the primary instrument; component tests per stage for fallback correctness; fixture test that a surface never mixes legacy and canonical numbers for the same event.
- **Success criteria:** Flag on in production for all three stages; Explanation consumer count ≥ 4 surfaces (vs 1 today); legacy engines no longer imported by any event-rendering path (grep-enforced in CI); divergence log retired.

### OP4.4 — Un-gate Explanation `memory`, `stakes`, `falsifiers` sections

- **Why it matters:** Audit T9: the analog engine runs and is served (`memory_v2.py:343-360`), the prediction ledger exists, themes carry `second_order_effects`, and the graph has `pressures` edges — yet `explanations.py:528-533` hard-gates the sections that would carry them. The reasoning contract has empty chapters whose authors are alive.
- **What:** Backend-only. `memory`: call the analog engine per event's strongest theme; render its `insufficient_history` state honestly ("archive: N of 60 days sealed") rather than omitting the section — this turns the credibility gate's dark period (T21) into visible progress. `stakes`: surface the event's open structural predictions from the ledger. `falsifiers`: attach the theme's `second_order_effects` as watch-for conditions *labeled as curated priors* (per T4's observed-vs-prior distinction — do not present ontology as observation).
- **Dependencies:** OP3.3 (the archive must be accruing for `memory` to ever mature); OP4.3b (a consumer exists — else this is more shipped-and-unread compute).
- **Complexity:** M.
- **Affected:** `app/explanations.py:528-533` region, `app/institutional_memory/reasoning.py` (call path), schema already carries the sections.
- **Migration:** Sections appear on surfaces that render Explanations — additive content.
- **Risks:** Analog-engine latency in the per-cycle explanation build — must be budgeted (cache per theme per cycle, not per event); honest-empty states must not read as errors.
- **Testing:** Unit: pre-gate archive → "N of 60 days" line; ledger with open prediction → stakes populated; falsifier lines carry the curated-prior label.
- **Success criteria:** Zero "Reserved (IRE-4)" placeholders in served Explanations; the archive-progress line is visible from day one instead of two silent months.

### OP4.5 — Real momentum history replaces the synthetic trend

- **Why it matters:** Audit B10: `themeMomentum.ts:300-333` fabricates a "3M/1M/1W/Now" trajectory from a single delta while the real observation series (`/api/memory/theme/{id}`, v1 — zero callers, B7) and daily snapshots (v2) sit unread. This is the flagship "fabrication next to unread truth" case.
- **What:** Add thin client wrappers for the theme-memory endpoints in `lib/api.ts` (extending the four existing v2 wrappers at `lib/api.ts:122-164`); rewrite the trend builder to render the *actual* series at whatever depth exists — a 2-day-old archive renders 2 honest days, labeled, never back-extrapolated (Morning Brief rule R4: partial-with-a-note beats fabricated-complete). Delete the back-extrapolation branch.
- **Dependencies:** OP3.2 (momentum survives restarts — otherwise real history shows restart scars), OP3.3 (history is accruing). Sequenced late for that reason, not for difficulty.
- **Complexity:** M.
- **Affected:** `frontend/src/lib/themeMomentum.ts`, `lib/api.ts`, consuming components' loading states (no layout change).
- **Migration:** Trend lines get shorter and more honest immediately, longer over time. One-line changelog.
- **Risks:** v1 endpoints have never had a caller (B7) — expect contract fixes on first real use (again: the point); N+1 fetches if done per-theme-per-card — batch or fetch on expand only.
- **Testing:** Unit: 3 observations → 3 points + honesty label, no extrapolation; contract test against the v1 endpoint fixture.
- **Success criteria:** `themeMomentum.ts` contains no synthesized history path (grep-enforced); theme-memory v1 endpoints' consumer count goes 0 → ≥ 1; a restart no longer visibly kinks trend lines (verifies OP3.2 end-to-end).

---

## 5. Sprint sequencing

Ordered to front-load intelligence gain and instrumentation, keep behavior changes individually reviewable, and never let two load-bearing behavior swaps land in the same sprint.

| Sprint | Tasks | Theme | Why this order |
|---|---|---|---|
| **1** | OP1.5, OP1.1, OP4.2, OP3.2 | Nets, schema, first visible win, stop the bleeding | Fixture harness before any behavior change; OP1.1 is pure schema; OP4.2 is zero-risk and proves the program visibly; OP3.2 halts *ongoing* archive corruption — every deploy without it writes more spurious transitions. |
| **2** | OP1.2, OP1.3, OP3.3 | The corroboration fix | The audit's two highest-gain changes, reviewed against Sprint 1's fixtures; OP3.3 starts the 60-day archive clock as early as possible (it gates OP4.4/OP4.5 value later — calendar time, not eng time, is the scarce resource). |
| **3** | OP1.4, OP3.1a (ledger substrate: observation + identity streams, schemas v1), OP2.1 (identity authority + hot view), OP4.0 | Identity foundations *(amended)* | **Journal before registry [C1]:** the substrate, schemas, and single-writer authority land before any production uid is minted; OP2.1 writes its journal into 3.1a's streams from day one. Timestamps cross the boundary (OP4.0) while Sprint 2's corroboration changes soak. |
| **4** | OP2.2 (+ archive dual-refs [C8]), OP2.3 (flagged), OP2.4 (flagged, alias semantics), OP3.1b (assessment stream), OP4.1 | Continuity + consumption *(amended)* | uid crosses every boundary — API, explanations, sealed archive — in the same sprint it starts flowing, so no transition window accrues cluster-id-only records; decay override and folding soak behind their flags; the graph learns about events (additive, isolated from legacy engines). |
| **5** | OP2.5 (eviction drills), OP3.4, OP3.5, OP4.3a (dual-run) | Durability + parity soak | Explanations history and saved items ride the substrate and alias-resolved uids from prior sprints; hygiene drills prove replay recovery; 4.3a runs flagged-off, accumulating divergence data. |
| **6** | OP4.3b, OP4.3c, OP4.4 | The consumption flip | Parity gate from Sprint 5 decides the flag; un-gated Explanation sections land with consumers already rendering them. |
| **7** | OP4.5, cleanup | Real history + retire scaffolding | Archive has ~5 weeks of accrual by now — real trend lines are worth rendering; remove dual-keyed explanations dict, retire the `merge_dedup` / `registry_decay` / `registry_folding` flags after their soaks (the `event_identity` master flag stays — it is the permanent kill switch for the identity authority), delete legacy engine imports from event paths (grep-enforced), re-baseline fixtures. |

Parallelization note: backend (OP1/OP2/OP3) and frontend (OP4) tracks are independent within each sprint except at the OP4.0/OP2.2 join in Sprint 3 — two engineers can run the tracks concurrently with that single sync point.

---

## 6. Program-level success metrics

Measured before Sprint 1 (baseline week) and after Sprint 7:

1. **Corroboration honesty:** share of admitted events with `corroboration_count ≥ 2` — expect ≥ 2× baseline; `story_count == len(evidence)` invariant holds.
2. **Identity stability *(amended [C1–C3])*:** ≥ 90% of sampled multi-cycle stories hold one uid for their lifetime; multi-day stories surface as one event ≥ 80%; a cold-start journal replay reproduces the hot view and every uid assignment exactly; every uid ever exposed to a consumer remains resolvable (aliases and evictions included); no natural key ever maps to two uids.
3. **Memory integrity:** zero momentum-reset transitions in the archive after a restart drill; sealed-day counter incrementing daily; any event's confidence-band trajectory reconstructable from the ledger.
4. **Consumption:** Explanation consumers 1 → ≥ 4 surfaces; `transmission_chain` consumers 0 → 2; theme-memory v1 consumers 0 → ≥ 1; zero fabricated timestamps (`Date.now()` fallback counter = 0) and zero synthesized momentum history in the frontend.
5. **No-regression gates:** golden-fixture suite green at every sprint boundary; feed p95 latency within 10% of baseline; parity divergence log < 5% or fully adjudicated before each flag flip.

---

## 7. Explicit non-goals (deferred to OP5–OP12)

Full scoring-decomposition serialization and the suppression-funnel endpoint (OP8 — only the dedup counters land here, in OP1.5); measured breadth, the counterevidence query fix, and "sessions" vocabulary (OP6); the fake industries tape and tier-table unification (OP7); market data into the spine (OP9); full-text fetch, SEC expansion, wire restoration (OP10); orphan pipelines (OP11). None of these are blocked by this plan; several become easier after it (OP9 keys outcomes on OP2's uids; OP6's materiality windows read OP3.1's ledger).
