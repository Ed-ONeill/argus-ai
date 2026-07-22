# Sprint 3 Design Review — Stable Event Identity & Observation Ledger

**Date:** 2026-07-21
**Scope:** Pre-implementation architectural review of the identity-and-ledger phase of `docs/OP1_IMPLEMENTATION_PLAN.md`: OP2.1 (EventRegistry), OP2.2 (uid threading), OP2.3 (registry-anchored decay), OP2.4 (multi-cycle continuity), OP3.1 (observation ledger), plus supporting schema (OP1.4 overflow rows, OP4.0 serialization).
**Assumption enforced throughout:** Argus eventually holds millions of observations, millions of events, years of institutional memory, multiple ingestion workers, and a distributed deployment.
**Status:** Review only. No code. The plan is not rewritten; required changes are listed as deltas to apply during implementation.

---

## The one structural finding (read this if nothing else)

As planned, the **registry is the authority and the ledger is a log on the side**. At scale, and over years, that is backwards. The correct long-term shape is:

> **The identity journal is the source of truth. The registry is a bounded, materialized hot view over it — rebuildable by replay at any time.**

Every identity action (mint, match, fold, evict, retract) becomes an appended journal record; the registry file is a cache of the last 14 days of that journal. This one inversion converts the design's three hardest problems — corruption recovery, store migration, and permanence — into the same cheap problem: replay. It costs almost nothing before code exists and is expensive to retrofit after. Most required changes below follow from it.

---

## A. Strengths

**A1. `uid` alongside `id`, never replacing it.** Keeping `MarketEvent.id == cluster.id` as the intra-cycle join while adding a durable `uid` respects the one load-bearing identity equality in the codebase (`events.py:9-15`, theme linkage at `events.py:461-465`). No rewiring of clustering or theme joins, additive schema, dual-keyed explanations during transition. This is the right decomposition and the reason incremental migration works at all.

**A2. Identity anchored on evidence, not headlines alone.** The match ladder (shared member URL first, then anchor-entity + title similarity, then title-only at a higher bar) puts the strongest, cheapest signal first. Sprint 2 strengthens rule 1 materially: merged provenance means each event carries *every* attesting URL, so URL-overlap matching across cycles is far more likely to fire than it would have been pre-merge-dedup.

**A3. Folding at the event-registry layer, not the clustering layer.** Widening clustering windows to catch multi-day stories would perturb the entire cluster/theme layer; folding same-identity events post-clustering gets continuity with a small blast radius, and restricting folds to the strong rules (URL or entity+similarity+type) is the right conservatism.

**A4. Forward-only migration with honest amnesia.** No fabricated backfill: uids exist only from launch day. This is consistent with the system's core doctrine (never invent history) and makes rollback trivial in the early window.

**A5. The ledger is append-only, per-cycle, and best-effort.** Journal-not-database, writes that can never fail the pipeline, torn-tail tolerance on read, deltas rather than snapshots. Correct instincts throughout.

**A6. Registry-anchored decay closes the E1 loop end-to-end.** Sprint 2 fixed first-seen *within* a cycle's members; registry first_seen fixes it *across* cycles. `cycles_observed` becomes the first honest "developing for N hours" signal Argus has had. The dependency ordering (rescore after registry match) is correctly identified in the plan.

---

## B. Weaknesses

**B1. The uid scheme is order-dependent and too small.** `sha1(first member url + first_seen date)[:12]` has two flaws. (1) *Discovery-order dependence:* "first member URL" is an accident of polling timing — two deployments observing the same world mint different uids, and a replay after a matcher fix mints different uids than production did. A derived id that isn't reproducible has the costs of derivation with none of its benefits. (2) *48 bits:* birthday collision becomes plausible around ~16M identities — inside the stated design horizon.

**B2. Registry expiry deletes identity, not just residency.** The 14-day expiry + 5,000-entry cap are correct for the *hot set* but as planned they are the only place the uid→history mapping lives. A prediction issued against an event resolves weeks later; an analog engine reaches back years. If eviction erases the mapping, every long-horizon consumer inherits dangling uids. Eviction must mean "left the working set," never "ceased to exist."

**B3. No merge, split, correction, or retraction semantics.** The lenses this review was asked to apply expose real gaps:
- *Duplicate discoveries:* two entries later found to be the same event — the plan cannot merge registry entries, so both uids persist and downstream refs fragment (the exact disease uids were meant to cure).
- *False reports / corrections:* no lifecycle status exists; a retracted story is indistinguishable from an active one, and a correction is indistinguishable from a new observation.
- *Same-cycle duplicate mints:* the fold pass checks new-vs-registry but not new-vs-new — two novel clusters of the same story both fail to match any entry and both mint.
- *Evolving stories / chain drift:* if the entry's match fingerprint updates to the latest telling, identity can walk (A→B→C where C no longer resembles A), silently merging distinct events over days; if it is frozen at origin, day-3 headline drift under-merges. The plan doesn't say which — and neither pure option is right.

**B4. The ledger conflates observation with interpretation.** A planned row carries `url, published_dt, fetched_at` (immutable facts) *and* `signal_score, corroboration_count, editorial lane` (engine outputs that change whenever the engine does). Years later, a row's score is unintelligible without knowing which engine produced it — and the Institutional Timeline ("what did we know when") silently lies. Facts and assessments are different record types with different lifecycles.

**B5. 90-day ledger deletion contradicts the mission.** "Years of institutional memory" and "delete the journal after 90 days" cannot both be true. At the honest volume estimate (< 5 MB/day uncompressed), deletion saves nothing that matters.

**B6. Single-writer is assumed but nowhere enforced.** The whole design silently presumes the one background thread is the only identity author. Two real hazards exist *today*: the Markets-only warm run builds events from a partial feed (the plan's own memory writer already guards against this with `if not categories and not sources` — the registry has no such guard planned), and any future multi-worker ingestion would race the JSON read-modify-write into lost updates and duplicate mints. Fuzzy matching cannot be protected by a uniqueness constraint — identity assignment is inherently a single-authority operation and the design should say so structurally, not accidentally.

**B7. Event-lifetime semantics are undefined.** Is a three-month Fed arc one event? The registry's 14-day horizon implicitly answers "no," but nothing states the charter. Without it, the registry will be pushed to be a narrative store (it will do this badly) and the theme layer's role blurs. An *event* is a discrete occurrence with a bounded lifecycle; *arcs* belong to themes and narratives; relationships between successor events (follow-up, correction, escalation) are **edges between uids, not shared identity**.

**B8. The archive keeps accruing unstable refs during the transition.** OP2.2 threads uid through events/explanations/API but not through the institutional-memory writer's `evidence_refs`. Every day of the transition, sealed Supabase rows accumulate references to ephemeral cluster md5s — precisely the debt uids exist to end, now with a durability guarantee.

---

## C. Required Changes (material; apply during implementation, none alters the sprint's shape)

**C1. Invert authority: journal as source of truth, registry as materialized view.** Append every identity action (mint / match / fold / evict / retract) to the identity journal; define the registry as replayable from the journal tail. Corruption recovery becomes replay (not amnesia); the future move from JSON file to SQLite/Postgres becomes "new view, same journal"; permanence falls out for free.

**C2. Opaque uids: ULID (or ≥128-bit random), plus optional natural keys.** Identity is *assignment*, not derivation — record the mint in the journal and stop pretending the hash means something. Add `natural_keys: []` to the entry schema now (SEC accession numbers, and later transcript/filing identifiers) as unique aliases that bypass fuzzy matching entirely: when an observation carries a natural key, identity is exact. This is the single cheapest future-compat win for the SEC and Earnings engines.

**C3. Alias and tombstone semantics from day one.**
- *Merge:* folding two entries keeps the elder uid; the younger becomes an **alias** resolving to it, forever. All uid resolution goes through alias resolution.
- *Split:* never retroactive. Mint new child uids, mark the parent `superseded_by: [a, b]`, and leave the parent's history intact — the record that Argus once grouped them is itself institutional memory. Identity history is annotated, never rewritten.
- *Retraction:* `status: retracted` with a reason, never deletion — "existed and was retracted" is signal (the future Contradiction Engine's raw material), and must be distinguishable from "never existed."

**C4. Split the ledger into observation rows and assessment rows.** Observation rows are immutable facts (url, source, title-as-observed, snippet-as-observed, published_dt, fetched_at, content_hash) — never mutated, corrections **append** a new row with `supersedes: <row-ref>`. Assessment rows (scores, lane, corroboration-at-time-of-writing) carry `engine_version` and are understood as versioned interpretation. Add `disposition` (admitted / folded / suppressed) and `schema_version` to row headers now, even though Sprint 3 only writes admitted rows — the field costs nothing and OP8's suppression observability will need it.

**C5. Never delete the journal.** Replace delete-after-90-days with gzip-after-7 and cold-tier retention indefinitely. Identity records (mints, aliases, tombstones) are permanent by C1; observation rows are permanent by mission.

**C6. Enforce the single-writer identity boundary.** All registry mutation behind one interface; invoked only by the full-feed cycle (mirror the memory writer's existing partial-run guard); candidate-vs-candidate matching within each cycle (new events match against entries *and* against events minted earlier in the same cycle) to kill same-cycle duplicate mints. Document the invariant: ingestion may fan out, **minting never does** — a future distributed deployment scales workers around a single identity authority, not by sharding it.

**C7. Drift-guarded continuity matching.** Store both the *origin* fingerprint (frozen at mint: first title word-set + anchor entities) and the *latest* fingerprint. A new member may match on either fingerprint, but must still share an anchor entity (or URL) with the **origin** — chained drift dies at the root while day-3 headline evolution still matches. Same `event_type` required for rules 2–3, as planned. Put the decay override (OP2.3) and registry folding (OP2.4) behind flags with the same instant-rollback contract as `merge_dedup`.

**C8. uid into archive evidence refs immediately.** The institutional-memory writer appends uid alongside the existing cluster-id refs from the first Sprint 3 deploy. Additive, invisible to consumers, and it stops the sealed archive from accruing another year of ephemeral references.

---

## D. Optional Improvements (defer without pain)

- **Entity-indexed match candidate lookup** (anchor entity → entries): O(C×R) Jaccard over the hot set is fine at current scale; add the index when the hot set grows.
- **SQLite index derived from the journal** when point-lookup needs appear ("when did we first see uid X" from an API); the journal design (C1/C4) already guarantees it can be built later without migration.
- **Match-basis provenance:** record *which rule* (url / entity+similarity / title-only / natural-key) matched each member, with the score — useful for tuning the matcher and for the Contradiction Engine's confidence in identity itself.
- **Richer lifecycle enum** (`active / dormant / superseded / retracted`) beyond the minimum required by C3.
- **Journal integrity checksums** (per-day hash chain) — cheap tamper/corruption evidence for a system that will one day cite its own records.
- **Registry snapshot cadence decoupled from cycle cadence** (e.g., snapshot every N cycles + replay the gap on boot) if the per-cycle rewrite ever shows in profiles.

---

## E. Answers to the explicit lens questions (summary)

- **Can a uid be permanent?** Yes, if and only if permanence lives in the journal (C1/C5), aliases absorb merges (C3), and the uid itself is opaque (C2). As drafted — no: expiry deleted identity and merges were unrepresentable.
- **Should events merge?** Yes, via aliasing — never by rewriting either history.
- **Should events split?** Rarely, via supersession — new children, annotated parent, no retroactive edits.
- **Should observations be mutable?** Never. Corrections append with `supersedes`; versioning is append + sequence; provenance is source + fetch context + content hash; interpretation is a separate, engine-versioned record.
- **What is permanent?** The identity journal, observation rows, explanation history, prediction outcomes — anything that was an input to something shown to a user. **What expires?** Hot-set residency only. **What is recomputable?** Scores, clusters, themes, graphs — from fixtures. **What must never be recomputed?** Identity assignments, as-observed facts, as-shown reasoning, as-issued predictions.
- **Should IDs carry meaning?** No. Opaque, namespaced (`ev_`), with natural keys as aliases where the world provides real identifiers.
- **Tombstones?** Yes — eviction ≠ deletion, retraction ≠ deletion, and "never existed" must be distinguishable from "existed, then invalidated."
- **Scaling bottlenecks found:** none fatal; the design survives millions of events *because* the hot set is bounded and the journal is append-only — provided C1 and C6 land. The JSON rewrite and O(C×R) matching are both bounded by hot-set size, not history size.
- **Migration:** incremental and rollback-safe as planned (A4), strengthened by flags (C7) and dual-keying; C8 closes the one silent-debt leak.
- **Failure modes:** each identified race/duplicate/collision/orphan/corruption/partial-write mode maps to a prevention above — single-writer boundary + same-cycle candidate matching (races, duplicates), ULID (collisions), journal permanence + aliases (orphans), replay recovery (corruption), atomic rename + torn-tail tolerance (partial writes), journaled mints with injected clocks (replay determinism).
- **Future engines:** Earnings/SEC/Management get natural-key identity and immutable attributed observations; the Prediction Ledger gets resolvable long-horizon uids; the Institutional Timeline gets fact/assessment separation; Historical Analogs get typed, permanent event records; the Contradiction Engine gets supersedes edges and retraction states. Every one of these consumes Sprint 3 as revised; none is blocked by it.

---

## F. Final Recommendation

**Implement after minor revisions.**

The sprint's architecture — uid alongside id, bounded hot registry, event-layer folding, append-only journal, forward-only migration — is sound and survives this review intact. But C1–C8 must be folded in *before* code: they are schema fields, authority boundaries, and retention policy — near-zero cost while the files don't exist, and each becomes a migration project the moment real uids and journal rows exist in production. None of them changes the sprint's task list, sequencing, or estimates materially; the deepest one (journal-as-truth, C1) is a reordering of what the code already intended to write.
