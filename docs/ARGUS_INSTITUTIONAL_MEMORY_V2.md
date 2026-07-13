# ARGUS INSTITUTIONAL MEMORY V2

**Status: DESIGN DOCUMENT (Phase 3.0). Nothing in sections 3-13 is built unless explicitly
marked LIVE. Section 15 is the M3.1 implementation record — M3.1 is CODE COMPLETE with tests;
production enablement is pending the manual rollout steps in
docs/ARGUS_MEMORY_OPERATIONS_V1.md (M3.1 is only "complete" once theme snapshots accrue in
production).**

This document is the canonical design for the Argus institutional-memory layer. It follows
the Phase 2 closure of Intelligence Everywhere (ARGUS_INTELLIGENCE_EVERYWHERE_V1.md): every
production surface projects one canonical intelligence platform. Phase 3 gives that platform
a durable past.

The problem Phase 3 solves is not absence of memory. Argus already remembers things in at
least a dozen places. The problem is that memory is fragmented across stores with different
lifetimes, different keys, and different owners - and the most valuable parts of it live in
individual browsers, where they are neither institutional nor durable.

Status vocabulary used throughout:

- **LIVE** - exists in production code today and behaves as described
- **PARTIAL** - exists but is incomplete, lossy, or not wired end to end
- **BROWSER-LOCAL** - exists but only in one browser's localStorage (not institutional)
- **BROWSER-SESSION** - exists only for the lifetime of one page session
- **BACKEND-PERSISTED** - written server-side, survives browser and device changes
- **PROPOSED** - designed here, not built
- **DEPRECATED** - should be retired by the migration plan

---

## 1. Current-state audit

Every memory-bearing mechanism found in production code, with the ten audit attributes.
"Replayable" means: could the record deterministically reproduce what Argus showed at that time?

### 1.1 ThemeMemory (backend) - LIVE, BACKEND-PERSISTED (volume-dependent)

| Attribute | Finding |
|---|---|
| Stores | Per-theme rolling summary (`first_seen`, `last_seen`, `conviction_first/prev/current/peak/trough`, strengthening/weakening/stable streaks, `status`, `lifecycle_current`, `confirming_total`/`contradicting_total`, `sector_counts`, `ticker_counts`, `cycles_absent`) + observation ring buffer (120 entries at ~5-min cycles, ~10h: conviction, momentum label/direction/delta, signal strength, lifecycle, breadth, persistence_cycles, evidence_count, confirming/contradicting) + evidence ring buffer (60 entries: story_ids, sources, sectors, tickers, root_causes, transmission_path, catalysts, risks) |
| Where | `app/theme_memory.py` -> JSON file `data/theme_memory/theme_memory.json`, or `THEME_MEMORY_DIR` (Railway volume) |
| Lifetime | Indefinite summary; ~10h observation window; ~60-cycle evidence window |
| Key | Pipeline theme id = theme ontology config key (`app/data/theme_ontology.py`) - curated, stable |
| Survives browser change | Yes (server-side) |
| Survives deployment | Only if `THEME_MEMORY_DIR` points at a persistent volume; otherwise reset on redeploy |
| Scope | Market-global |
| Nature | Factual (observed pipeline outputs) + derived (streaks, lifecycle, confirming/contradicting) |
| Replayable | Partially: summary is cumulative and lossy; ring buffers age out; no daily granularity beyond ~10h |
| Verdict | **MIGRATE** - this is the closest thing Argus has to institutional memory; promote its content into canonical Entity Snapshots + Transition Events, keep the module as the intraday accrual engine |

Exposed via FastAPI: `GET /api/memory/{ping,themes,changes,strengthening,weakening,stale,theme/{id},theme/{id}/summary,theme/{id}/evidence}` (`api/routes/memory.py`), and attached to every feed theme as `theme.memory` (`api/routes/feed.py::_theme_mem_summary`). The summarizer also injects `brief_memory_context()` into Today's Take prompts.

### 1.2 ThemeTracker in-process history (backend) - LIVE, NOT PERSISTED

`app/theme_graph.py` keeps `_history` (last 12 conviction/strength snapshots per theme) and
`_breadth_history` in process memory to compute `momentum_delta`, momentum labels, and
persistence. Lost on every restart, which means momentum labels are amnesiac immediately
after a deploy. Market-global, derived, not replayable. **Verdict: KEEP as compute buffer,
but the canonical layer must not depend on it; its inputs get durably captured by observation
records instead.**

### 1.3 ProcessedFeedCache (backend) - LIVE, BACKEND-PERSISTED

`data/feed_cache` persists processed feed cycles so restarts do not reprocess. Operational
cache, not memory: no history semantics, overwritten forward. **Verdict: KEEP as-is (out of
memory scope); it is however the natural hook point for the raw-payload archive in 5.4.**

### 1.4 Saved-items API route (backend) - PARTIAL, NOT PERSISTED

`api/routes/saved.py` stores saved items in a module-level dict ("swap for a DB-backed store
when multi-user support is needed"). Lost on restart. The production frontend does not rely
on it (it uses Supabase + localStorage, 1.10). **Verdict: DEPRECATED - delete or rewrite onto
Supabase in M3.5; keeping two save paths invites divergence.**

### 1.5 themeSnapshots (frontend) - LIVE, BROWSER-LOCAL

| Attribute | Finding |
|---|---|
| Stores | One `ThemeSnapshot` per theme per day: conviction, momentum, persistence, breadth, acceleration, related companies/sectors, source/story counts, M&A deal count, Listen mention count, a composite `privateSignalScore`, top drivers/risks, one-line summary |
| Where | `frontend/src/lib/themeSnapshots.ts` -> localStorage `argus.themeSnapshots.v1`, cap 120/theme |
| Lifetime | Until localStorage is cleared |
| Key | `themeKey()` = display-name prefix slugified - **NOT the ontology id** |
| Survives browser/device change | No |
| Survives deployment | Yes (client-side), but not shared across users |
| Scope | Written from market-global data, but each device has a private divergent copy |
| Nature | Factual capture + one derived composite score |
| Replayable | Per-device only |
| Verdict | **MIGRATE** - schema is a good draft of the Entity Snapshot for themes; the canonical writer moves server-side; localStorage copy is then a read cache at most |

Written by `useArgusIntelligence` on every data arrival (idempotent per day). Read by
`getThemeHistory`/`getThemeDelta`/`getThemeMemory` and by `intelligenceDeltas` (absence
detection via `getTrackedThemes`).

### 1.6 memoryEngine (frontend) - LIVE, BROWSER-LOCAL

| Attribute | Finding |
|---|---|
| Stores | Per graph node per day: `EntitySnapshot` (confidence, conviction, momentum, persistence, evidence/relationship/source/mention counts, importance, full edge signatures with strength/confidence/evidenceCount), `InferenceRecord`, `PredictionRecord` (direction, probability, confidence) |
| Where | `frontend/src/lib/memoryEngine.ts` -> localStorage `argus.memoryEngine.v1` |
| Lifetime | Until localStorage cleared; upsert-by-date (one per day) |
| Key | Graph node id (`normalizeKey(label)`) - **a third key scheme** |
| Survives browser/device change | No |
| Survives deployment | Client-side yes; institutionally no |
| Scope | Market-global content, per-device copy |
| Nature | Factual capture of derived engine outputs; predictions are inferred |
| Replayable | Per-device: edge signatures make relationship replay possible in principle |
| Verdict | **MIGRATE** - this is the correct *shape* (entity + relationship + prediction history, insufficient_history honesty, analogs/patterns readers). The writer must move server-side; the reader API can survive nearly unchanged |

Written by `recordDailyMemorySnapshot()` (once-per-day guard in `intelligenceShared.ts`) from
the Explorer page and the IntelligenceDrawer - i.e. **history only accrues on days someone
opens those surfaces in that browser**. Read by `profile.evolution`, `buildTimeline`,
`buildConvictionHistory`, `detectHistoricalPatterns`, `findHistoricalAnalogs`,
`summarizeEvolution`.

### 1.7 intelligenceDeltas (frontend) - LIVE, DERIVED-AT-READ

Not a store. Derives the change ledger (What Changed) from server `theme.memory` + device
themeSnapshots (absence detection). Canonical owner of the *deltas* concept per
`intelligenceOwnership.ts`. **Verdict: KEEP as projection; once Transition Events exist it
reads them instead of recomputing change from two mismatched stores.**

### 1.8 profile.evolution / buildTimeline - LIVE, DERIVED-AT-READ

Reads ThemeMemory summaries (server) + memoryEngine (device). **KEEP as projection.**

### 1.9 Session/market state accumulators (frontend) - LIVE, BROWSER-SESSION

`useMarketMemory` (session stress accumulation, volatility episode counts, "First
Episode/Recurring/Conditioned" labels, in `useRef`) and the summarizer-style in-memory caches.
Gone on refresh. `argus_regime_track_v1` (homepage regime tracker) is BROWSER-LOCAL kin.
**Verdict: KEEP as UI behavior, but these must never be presented as institutional history;
the regime-observation need is met canonically by Market Context records (8.1).**

### 1.10 User state - LIVE, MIXED

Backend-persisted (Supabase Postgres, per-user): `profiles`, `saved_items`, `watchlist`,
`user_preferences`. Browser-local only: `argus:theme-watchlist` (theme follows),
`argus:followed-themes` (id+name+timestamp follows; D13-remainder from Phase 2),
`argus_saved_ids`/`argus_saved_items` (guest-mode saves), `argus_watchlist` (guest mode),
`argus_onboarding_v1`, `argus_terminal_settings`. User-specific, factual. **Verdict: KEEP -
this is personal memory, explicitly out of institutional scope (section 11); the two theme
follow stores merge in M3.5 per the deferred D13 plan.**

### 1.11 Intelligence graph + profile cache - LIVE, IN-MEMORY PER SESSION

The graph singleton is rebuilt from the current payload each session; `profileCache` is keyed
by graph version. **There are no durable graph snapshots today** - the only recorded edge
history anywhere is memoryEngine's per-device edge signatures. Not replayable across time.
**Verdict: KEEP as the live working set; durable Relationship Snapshots (3.B) are the fix.**

### 1.12 Narrative derivation - LIVE, DERIVED-AT-READ, NO HISTORY

`narrativeDerivation.deriveNarratives` already computes a **deterministic driver-set key**
(sorted canonical driver node ids joined) - the right stable ID - but nothing persists
narratives, so "how long has this narrative persisted" is unanswerable beyond ThemeMemory's
per-member first_seen. **Verdict: narrative history is net-new persistence (3.C).**

### 1.13 Prediction engine - LIVE (derived), history PARTIAL, outcomes MISSING

`predictionEngine` recomputes trajectories at read time. History exists only as memoryEngine
`PredictionRecord`s in localStorage. **There are no Outcome records anywhere in the platform,
no market-movement joins, and therefore no calibration.** Assumptions and invalidation
conditions are computed but not persisted alongside the prediction. **Verdict: prediction/
outcome ledger is net-new persistence (3.E/3.F); the engine stays the sole author of
prediction content.**

### 1.14 Assistant personal memory (backend) - LIVE, OUT OF SCOPE

`app/memory.py` (chat sessions), `app/memory_store.py` (SQLite `data/memory.db`, personal
profile/preference facts), `data/conversations`. This is the LLM-assistant product's memory,
not market memory. **Verdict: KEEP, firewalled. Institutional memory must never read from or
write to these stores, and nothing market-global may key off them.**

### 1.15 Grep sweep confirmation

The audit swept `memory|snapshot|history|evolution|delta|previous|first_seen|streak|
persistence|analog|prediction|outcome|calibration` across `app/`, `api/`, `frontend/src`.
Systems 1.1-1.14 account for every hit; remaining matches are pure compute
(`themeEvolution` current-state badge, `predictionEngine` internals, `theme_graph`
persistence scoring) or Phase 2 tombstone comments. `outcome` and `calibration` have **zero
production implementations** - confirming the largest gap.

### 1.16 Summary of weaknesses

1. **Institutional history lives in browsers.** The two richest histories (1.5, 1.6) are
   per-device, divergent, wiped by a cache clear, and accrue only when particular pages are
   opened. Browser storage is currently the *de facto* canonical record - the exact inversion
   of what an institutional platform needs.
2. **Three key schemes for one theme.** Ontology id (backend), name-slug (themeSnapshots),
   `normalizeKey(label)` (graph/memoryEngine). A rename fragments history silently.
3. **Backend memory is lossy by design.** Ring buffers cap at ~10h of observations; the
   summary is cumulative aggregates, so trajectory shape older than the buffer is gone.
   Deploy without a volume = total amnesia.
4. **No outcomes, no calibration.** Argus records what it expected (per-device) and never
   what happened. Every calibration question is unanswerable today.
5. **No narrative or relationship history** beyond per-device edge signatures.
6. **No replay.** The graph is rebuilt from the current payload only; yesterday's profile
   cannot be reconstructed anywhere, by anyone.
7. **Duplicate/abandoned stores.** In-memory saved route (1.4); two theme-follow stores (1.10).

---

## 2. Canonical record model (PROPOSED)

Six durable record types plus one context record. All are **append-only** (corrections append
a superseding record; nothing is edited in place). All carry `schema_version`, `written_at`,
`writer` (module@version), and `provenance` (which pipeline cycle / graph version produced
them). Field names are indicative; exact SQL DDL belongs to M3.1.

### A. EntitySnapshot - an entity at a point in time

```
entity_snapshot {
  snapshot_id        // = {subject_uid}:{as_of}:{cadence}  (natural key, idempotent)
  subject_uid        // canonical entity UID (section 3)
  entity_type        // theme | company | sector | macro | narrative-member ...
  as_of              // date (daily cadence) or timestamp (event cadence)
  cadence            // "daily" | "event"
  conviction         // pipeline confidence, 0-100 (themes) / node conviction
  evidence_verdict   // verdict + counts from evidenceEngine (LIVE source)
  forward_view       // direction, probability, confidence (predictionEngine; nullable)
  drivers[]          // canonical UIDs
  beneficiaries[]    // canonical UIDs + role
  risks[]            // contradiction/invalidation/weakening records (verbatim shape)
  contradiction_count, confirming_count
  narrative_uids[]   // memberships at snapshot time
  transmission_path  // strongest recorded path (edge id list)
  momentum, persistence, breadth, mention_count, source_count, story_count
  completeness       // live | partial | unavailable - honesty is stored, not assumed
  graph_version      // provisioning version that produced this view
  provenance         // pipeline cycle id, ingest sources
}
```

Live sources today: everything above is computable at write time from the pipeline payload +
graph + engines (that is what `buildIntelligenceProfile` already assembles). The snapshot
persists the *projection inputs*, not prose.

### B. RelationshipSnapshot - one edge over time

```
relationship_snapshot {
  rel_uid            // = {source_uid}|{type}|{target_uid}  (direction-normalized)
  as_of, cadence
  strength, confidence, evidence_count
  status             // active | weakening | aged_out
  first_seen, last_seen   // maintained by the writer, never by readers
  provenance
}
```

Live source: graph edges (memoryEngine already captures exactly this shape per-device).

### C. NarrativeSnapshot - a DerivedNarrative over time

```
narrative_snapshot {
  narrative_uid      // stable driver-set key from narrativeDerivation (LIVE) - NOT the label
  as_of
  label              // display label AT THAT TIME (labels may drift; uid may not)
  member_uids[]      // themes + roles
  coherence, evidence_count, contradiction_count
  thesis             // pipeline/derivation thesis sentence(s), verbatim
  lifecycle          // emerging | dominant | secondary | fading (derivation's own state)
  rank               // dominant=1, ... at snapshot time
  provenance
}
```

`first_seen`/`persistence` are **queries over snapshots**, not stored fields (avoid
cumulative-field drift). Membership change is a Transition Event.

### D. TransitionEvent - a meaningful change between states

```
transition_event {
  event_id           // ULID
  subject_uid        // entity, relationship (rel_uid), or narrative uid
  kind               // conviction_crossed | conviction_strengthened | conviction_weakened |
                     // contradiction_added | contradiction_resolved |
                     // relationship_added | relationship_expanded | relationship_aged_out |
                     // narrative_member_added | narrative_member_removed |
                     // narrative_emerged | narrative_faded |
                     // prediction_created | prediction_changed | prediction_invalidated |
                     // evidence_aged_out | theme_absent | theme_returned
  observed_at
  from_value, to_value    // typed by kind (JSON)
  threshold          // the rule that fired (e.g. "conviction crossed 70")
  snapshot_before, snapshot_after   // snapshot_ids, for replay anchoring
  provenance
}
```

Transition Events are what `intelligenceDeltas` becomes a *reader* of. The status policy
(`deltasToSection`) stays frontend; the facts move backend.

### E. PredictionRecord - what Argus expected

```
prediction {
  prediction_id      // ULID
  subject_uid
  kind               // theme_trajectory | company_trajectory | sector_rotation
  predicted_direction, probability, confidence
  horizon            // explicit, e.g. "10 sessions" - REQUIRED (unresolvable without it)
  assumptions[]      // verbatim from predictionEngine
  invalidation[]     // conditions, verbatim
  created_at, graph_version, provenance
  status             // active | superseded | resolved | invalidated | expired
  superseded_by      // prediction_id (when the engine's view changed materially)
  content_hash       // dedup: same subject+direction+bucketed probability = no new record
}
```

### F. OutcomeRecord - what actually happened

```
outcome {
  outcome_id         // ULID
  prediction_id      // the prediction being resolved (1:N allowed: interim + final)
  subject_uid
  observed_at, horizon_elapsed
  observed_direction // from market data / subsequent snapshots
  market_move        // price/return measure when a quoted proxy exists (nullable + labeled)
  narrative_outcome  // persisted | faded | reversed (from narrative snapshots)
  verdict            // correct | incorrect | partial | unresolvable
  method             // exactly how the verdict was computed (auditable)
  source             // market-data provider / snapshot query
}
```

**Predictions and outcomes are separate record types with separate writers.** A prediction is
written when the engine speaks; an outcome is written by a resolution job when the horizon
elapses. Calibration is a **query** over the join, never a stored opinion.

### G. MarketContextRecord (supporting, PROPOSED)

Daily market regime context (rates direction, vol level, breadth, risk appetite) captured
from data already flowing through `useMarketState`'s backend sources. Needed by analogs
(section 9) and outcome attribution; cheap (one row/day).

---

## 3. Stable identity (PROPOSED)

### 3.1 Canonical UID scheme

`{type}:{namespace}:{key}`, lowercase, immutable once minted:

| Subject | UID form | Source of key |
|---|---|---|
| Theme | `theme:ontology:<ontology-id>` | `app/data/theme_ontology.py` config key (LIVE, curated) |
| Company | `company:ticker:<TICKER>@<listing>` | primary listing ticker at mint time |
| Sector | `sector:argus:<slug>` | curated sector taxonomy (SECTOR_ENTITIES keys) |
| Macro series | `macro:series:<slug>` | MacroSeries/EconomicRelease node key |
| Narrative | `narrative:driverset:<sorted-driver-uids-hash>` | narrativeDerivation key (LIVE) |
| Deal | `deal:ma:<acquirer-uid>+<target-uid>+<announce-date>` | M&A facts |
| Relationship | `rel:<source_uid>|<type>|<target_uid>` | graph edge, direction-normalized |
| Snapshot | `{subject_uid}:{as_of}:{cadence}` | natural key |
| Prediction / Outcome / Transition | ULID | writer-generated |

**Display labels are never keys.** Every record stores the label it displayed at write time
for auditability, but joins happen on UIDs only.

### 3.2 Alias and lifecycle ledger

One small table resolves the messy cases:

```
identity_alias { alias, alias_kind (label|ticker|slug|legacy-key), subject_uid,
                 valid_from, valid_to, reason (rename|ticker_change|merger|dedup) }
identity_lifecycle { subject_uid, status (active|superseded|absorbed|retired),
                     superseded_by, effective_at }
```

- **Theme renames**: ontology id persists; the old display name becomes an alias row.
  History is continuous by construction.
- **Ticker changes** (e.g. FB->META): UID keeps the mint-time ticker; new ticker becomes an
  alias; resolvers accept both. No history rewrite.
- **Mergers**: target UID gets `absorbed`, `superseded_by = acquirer_uid`; history remains
  queryable under the retired UID; forward accrual stops.
- **Duplicate company names**: resolution is by ticker, not name; two entities with one name
  are two UIDs; the graph resolver (`lib/entity.ts` registry) is the single mapper.
- **Narrative membership drift**: the driver-set key means a *materially different* driver
  set is a *different narrative UID*, with a `narrative_emerged` transition linking
  predecessor via `identity_lifecycle` when overlap is high. Label drift alone changes
  nothing.
- **Deleted/superseded entities**: never hard-deleted; `identity_lifecycle.status` gates
  forward writes, history stays.

### 3.3 Migration of existing keys

- ThemeMemory keys are already ontology ids -> prefix to `theme:ontology:*`, lossless.
- themeSnapshots name-slugs -> resolve through the alias table at import; unresolvable slugs
  import under `theme:legacy:<slug>` rather than being dropped or guessed.
- memoryEngine `normalizeKey(label)` node ids -> resolve via the entity registry; same
  legacy-namespace fallback.

---

## 4. Storage ownership (PROPOSED)

**Rule: market-global institutional memory is backend-persisted in Postgres. Browser storage
is never the canonical historical record - at most a convenience cache of backend reads.**

| Record type | Owner | Rationale |
|---|---|---|
| EntitySnapshot, RelationshipSnapshot, NarrativeSnapshot, TransitionEvent, Prediction, Outcome, MarketContext, identity tables | **Supabase Postgres, written ONLY by the FastAPI backend via service role** | One durable SQL store already in the stack (auth + user tables live there); Railway volumes are single-instance JSON files with no query surface. Backend-only writes keep the pipeline the sole author of market truth; the browser gets read-only APIs |
| ThemeMemory JSON | FastAPI + volume (unchanged) | Stays the intraday accrual engine; its end-of-day state feeds the snapshot writer. Not the system of record once M3.2 lands |
| Raw pipeline payload archive (optional, for deep replay) | Object storage (one JSON per cycle or per day) | Cheap insurance; enables re-derivation if schemas evolve. Not required for first-class replay (section 6) |
| Graph, profileCache, summarizer caches | In-memory (unchanged) | Working set, rebuilt per session/process |
| localStorage (themeSnapshots, memoryEngine) | Demoted to device cache | After M3.2, readers prefer backend history APIs; local stores remain as offline fallback, clearly labeled DEVICE-LOCAL when they are the only source |
| User state (saves, follows, preferences, personal research memory) | Supabase per-user tables (RLS) | Personal memory, section 11 |
| Assistant memory (`data/memory.db`, conversations) | Unchanged, firewalled | Different product |

Why not "Supabase direct from browser" for institutional records: the browser must never
hold write credentials for market truth, and snapshot writing must happen even when no
browser is open. Why not "SQLite on the Railway volume": no concurrent query surface for
future services, no managed backups, and it re-creates the single-file fragility ThemeMemory
already has.

---

## 5. Ingestion and accrual (PROPOSED)

### 5.1 Write triggers

| Trigger | Writes | Cadence guard |
|---|---|---|
| Intelligence cycle completes (`app/background.py`, ~5 min) | ThemeMemory update (LIVE, unchanged); Transition Events when thresholds fire; Prediction records when content hash changes | debounce below |
| **Daily close (primary snapshot writer)** | One EntitySnapshot per active entity, one RelationshipSnapshot per active edge, one NarrativeSnapshot per derived narrative, one MarketContext row | idempotent upsert on natural key `{uid}:{date}:daily` |
| Material change intraday | `cadence="event"` EntitySnapshot for the affected subject only + the Transition Event | thresholds: conviction move >= 10 pts or crossing {40,55,70,85}; contradiction count change; relationship added/aged; narrative membership change |
| Graph reprovisioning | nothing by itself (provisioning is a rebuild, not news) - but stamps `graph_version` used by all same-cycle writes | - |
| Prediction creation/change | Prediction record | `content_hash` dedup: direction + probability bucket (5 pts) + invalidation set; unchanged view = no row |
| Prediction horizon elapses / invalidation observed | Outcome record via resolution job (daily) | one final outcome per prediction; interim outcomes allowed at horizon midpoints |

### 5.2 Idempotency rules

1. Snapshot natural keys make daily writes upserts: re-running the writer for the same date
   is a no-op (byte-identical) or a correction (append `revision` with the same natural key
   only if provenance differs - never silent overwrite of differing content).
2. Transition Events carry `(subject_uid, kind, observed_at-bucket, from, to)` uniqueness;
   the same threshold cannot fire twice for one crossing (re-arm only after the value leaves
   a hysteresis band, mirroring `_TREND_DELTA` practice).
3. Predictions dedup by `content_hash`; a changed view supersedes (`superseded_by`), never
   updates in place.
4. Writers are single-flight per cycle (the background thread already serializes updates).

This prevents the two failure modes seen in the current stores: duplicate daily snapshots
(themeSnapshots guards per-day; memoryEngine upserts by date - both patterns are kept) and
unbounded event spam (ThemeMemory's `_TREND_DELTA` deadband generalizes to all thresholds).

### 5.3 Absence is data

The daily writer records `theme_absent` transitions when a previously active UID produces no
observation (generalizing `cycles_absent`), and `theme_returned` on reappearance. Absence
handling moves off device-local `getTrackedThemes`.

---

## 6. Replay and determinism (PROPOSED)

Replay target: **reconstruct what Argus displayed and believed at date D** - profile,
evidence verdict, active prediction, narrative state - without re-running the pipeline.

Minimum sufficient set (all from section 2):

1. EntitySnapshot(uid, D) - conviction, verdict, forward view, risks, completeness, and the
   `graph_version` it was rendered from
2. RelationshipSnapshots(as_of = D) incident to uid - the recorded edge set
3. NarrativeSnapshots(D) - memberships and dominance
4. Active Prediction records at D (created <= D, not superseded/resolved before D)
5. Transition Events in (D, now] - "what changed afterward"
6. MarketContext(D) - the regime it happened in

Design consequence: snapshots persist **projection inputs** (typed values and record lists),
so replay = feed a stored snapshot to the *current* renderer. This is lossy-proof against UI
copy changes but tolerant of them. Deep replay (re-deriving with improved engines over old
data) additionally requires the raw payload archive (4, optional) - recommended but not
required for M3.2-M3.4.

Determinism rules: every writer output is a pure function of (pipeline payload, graph
version, prior records); wall-clock reads are injected (`now()` parameters already exist in
memoryEngine/orchestrator - keep that discipline); LLM-generated prose is stored verbatim
with provenance, never regenerated during replay.

---

## 7. Retention (PROPOSED)

| Data | Retention | Rationale |
|---|---|---|
| Raw observations (intraday, per cycle) | 90 days rolling, then daily downsample kept forever | Intraday shape matters for recent analysis; daily is enough for analogs |
| Evidence records (story ids, sources per observation) | 1 year full, then per-day aggregates forever | Traceability window; aggregates preserve calibration features |
| EntitySnapshots (daily) | **Forever** | The institutional record; ~hundreds of entities x 1 row/day is small |
| RelationshipSnapshots (daily) | Forever, `status=aged_out` rows compressed to first/last + monthly samples after 2 years | Topology history powers analogs |
| NarrativeSnapshots | Forever | Small; narrative persistence is a headline query |
| TransitionEvents | Forever | They ARE the change ledger |
| Predictions + Outcomes | **Forever, never pruned** | Calibration and analog credibility die without full history; explicitly protected |
| MarketContext | Forever | One row/day |
| Raw payload archive | 1 year hot, then cold storage | Deep-replay insurance |
| User interaction history (M3.5, opt-in) | 180 days raw, aggregates only afterward; user-deletable at any time | Section 12 |

Nothing needed for calibration or analog analysis is ever deleted; retention only downsamples
*intraday* granularity.

---

## 8. Historical queries -> record types

| Question | Records required | Possible today? |
|---|---|---|
| What changed since yesterday? | TransitionEvents (+ EntitySnapshots for context) | PARTIAL - derived-at-read from ThemeMemory + device snapshots |
| When did Argus first detect this? | first EntitySnapshot / `theme_returned`-free history; ThemeMemory `first_seen` | PARTIAL (LIVE for themes, backend, volume-dependent) |
| How long has this narrative persisted? | NarrativeSnapshots for narrative_uid | NO (no narrative history) |
| What happened after conviction crossed 70? | TransitionEvent(conviction_crossed) x EntitySnapshots after x Outcomes/MarketContext | NO |
| Which relationships strengthened before the move? | RelationshipSnapshots + MarketContext/market_move | NO (per-device edge signatures only) |
| Closest historical analogs? | EntitySnapshots + NarrativeSnapshots + RelationshipSnapshots + MarketContext (section 9) | Device-local, cold-start-limited toy (memoryEngine) |
| Which predictions were right? | Predictions x Outcomes | NO (no outcomes) |
| How calibrated is Argus by horizon and narrative type? | Predictions x Outcomes x NarrativeSnapshots, grouped | NO |
| Which contradictions correctly warned of reversals? | TransitionEvent(contradiction_added) x subsequent Outcomes/TransitionEvents | NO |
| How often does this transmission path persist? | RelationshipSnapshots over the path's rel_uids | NO |

---

## 9. Analog engine prerequisites (PROPOSED - do not build yet)

An analog is credible only when similarity is computed over **recorded trajectories in
comparable regimes with known outcomes**. Dimension inventory:

| Dimension | Live today? | Needs |
|---|---|---|
| Narrative membership | Derivable now, no history | NarrativeSnapshots (M3.2) |
| Conviction trajectory | ThemeMemory (~10h) + device snapshots | Daily EntitySnapshots (M3.2) |
| Relationship topology | Graph now; per-device history only | RelationshipSnapshots (M3.2) |
| Evidence composition (confirming/contradicting mix, source diversity) | ThemeMemory counters | Persisted per-snapshot (M3.2) |
| Macro regime | useMarketState reads live data; nothing persisted | MarketContext records (M3.2/M3.4) |
| Price response | NOT persisted anywhere | Outcome records + market_move (M3.3) |
| Volatility | Live reads only | MarketContext (M3.2/M3.4) |
| Sector breadth | breadth_score live; history in ring buffer | Daily snapshots (M3.2) |
| Contradiction pattern | Counters live | TransitionEvents (M3.2) |
| Catalyst sequence | Verified dateless catalysts only (Phase 2 rule) | Real Event provider (out of scope); sequence analogs deferred |

Credibility gate before ANY analog ships: >= 60 daily snapshots across >= 2 distinct macro
regimes, plus resolved outcomes for the candidate analog set. Until then, analog surfaces
must say "insufficient history" (the memoryEngine honesty pattern, kept). The current
device-local `findHistoricalAnalogs` must not be marketed as historical analogs; it compares
whatever this browser happened to record.

---

## 10. Institutional memory vs personalization

Two ledgers, never blended:

| | Institutional | Personal |
|---|---|---|
| Content | Snapshots, transitions, predictions, outcomes, narratives, market context | Follows, saves, opens, dismissals, portfolio context, sector preferences |
| Truth status | Market-global, objective, append-only | Private, mutable, deletable |
| Writer | FastAPI pipeline only | User actions only |
| Store | Postgres (service role) | Supabase per-user tables (RLS) + localStorage cache |
| Reader contract | Same records for every user | Only that user |

Personalization may **rank, filter, and prioritize** institutional memory (ordering only -
the Phase 2 doctrine extends unchanged to history). It may never rewrite, re-weight the
stored values of, or write into institutional records. No institutional record may contain a
user id. The reverse read (personal memory consulting institutional history to rank) is fine.

## 11. Privacy and user-memory boundaries (for M3.5, PROPOSED)

- **Opt-in**: behavioral memory (opens, dwell, research trails) is off by default; explicit
  settings toggle. Follows/saves are already explicit actions and need no extra consent.
- **Inspectable**: a settings surface lists everything stored about the user, verbatim.
- **Deletable**: single control wipes behavioral memory (Supabase delete + localStorage
  clear); follows/saves individually removable as today.
- **Retention**: raw behavioral events 180 days, then aggregates only (7); aggregates carry
  no timestamps finer than a week.
- **Aggregation**: personalization features read aggregates (theme-open counts, sector
  affinity), not raw click streams.
- **Raw click history is not necessary** and should not be kept beyond the aggregation
  window; never collect: page content of external links, free-text search terms tied to
  identity beyond the session, anything from the assistant's personal memory store (1.14),
  portfolio holdings unless explicitly entered by the user for that purpose.

---

## 12. Migration map

| Current system | Canonical target | Disposition | Risk | Phase |
|---|---|---|---|---|
| ThemeMemory summary + ring buffers (1.1) | EntitySnapshot (theme) + TransitionEvent; module stays as intraday accrual engine | MIGRATE (content), KEEP (engine) | Low - additive; key already canonical | M3.1-M3.2 |
| ThemeTracker in-process history (1.2) | none (compute buffer) | KEEP | None | - |
| ProcessedFeedCache (1.3) | payload archive hook (optional) | KEEP | None | M3.4 opt |
| Saved-items API dict (1.4) | Supabase saved_items | DELETE (route rewired or removed) | Low - frontend doesn't depend on it | M3.5 |
| themeSnapshots localStorage (1.5) | EntitySnapshot (theme, daily); local store demoted to cache | MIGRATE writer server-side; optional one-time device import under legacy namespace | Medium - key translation (name-slug -> ontology id); divergent device copies must not merge silently | M3.2 |
| memoryEngine localStorage (1.6) | EntitySnapshot + RelationshipSnapshot + Prediction; reader API preserved over backend data | MIGRATE (writer moves; readers repointed) | Medium - key translation; readers must label device-only history until backend depth exceeds it | M3.2-M3.3 |
| intelligenceDeltas (1.7) | reader of TransitionEvents | KEEP (repoint source) | Low | M3.2 |
| profile.evolution / buildTimeline (1.8) | reader of EntitySnapshots | KEEP (repoint) | Low | M3.2 |
| useMarketMemory session accumulators + regime tracker (1.9) | UI behavior; regime need met by MarketContext | KEEP (UI); MarketContext new | Low | M3.2/M3.4 |
| Supabase user tables + guest localStorage (1.10) | personal memory (unchanged); two theme-follow stores merge | KEEP; MERGE follows (deferred D13) | Medium - user data loss if merge is careless; union-read until designed | M3.5 |
| Graph + profileCache (1.11) | working set; RelationshipSnapshots add durability | KEEP | None | M3.2 |
| Narrative derivation (1.12) | NarrativeSnapshots (new persistence; key already exists) | KEEP engine, ADD history | Low | M3.2 |
| predictionEngine outputs (1.13) | Prediction + Outcome ledger | KEEP engine, ADD persistence + resolution job | Medium - horizon semantics must be made explicit before recording | M3.3 |
| Assistant memory (1.14) | none | KEEP, FIREWALLED | None - enforce no-import rule in review | - |

**No production behavior changes in this sprint; the table is the plan, not the change.**

## 13. Implementation phases

- **M3.1 - Canonical persistence foundation.** Postgres schemas for the seven record types +
  identity tables; UID mint/resolve service in the backend; the daily snapshot writer
  (themes first, from ThemeMemory end-of-cycle state); idempotency tests (re-run = no-op);
  volume-loss runbook ends here. *Exit: theme EntitySnapshots accrue server-side daily.*
- **M3.2 - Entity and narrative history.** Extend the writer to companies/sectors/macro,
  RelationshipSnapshots, NarrativeSnapshots, TransitionEvents with thresholds + hysteresis,
  MarketContext rows; repoint `intelligenceDeltas`/`profile.evolution`/timeline readers to
  backend history APIs with labeled device-local fallback. *Exit: What Changed reads
  TransitionEvents; history survives a redeploy and a new device.*
- **M3.3 - Prediction and outcome ledger.** Explicit horizons in predictionEngine outputs;
  Prediction persistence with content-hash dedup; daily resolution job writing Outcomes;
  calibration as SQL views (by horizon, by narrative type). *Exit: "which predictions were
  right" is a query.*
- **M3.4 - Replay and analog prerequisites.** as-of query APIs (profile at D), timeline
  reconstruction endpoint, similarity feature extraction over recorded history, payload
  archive (optional), credibility gate instrumentation. *Exit: replay of any date since M3.2;
  analog engine unblocked but NOT built.*
- **M3.5 - Personal research memory.** Opt-in behavioral signals, aggregation, inspect/delete
  controls; theme-follow store merge (D13-remainder); delete the in-memory saved route.
  *Exit: personalization reads aggregates; user can see and wipe everything.*

## 14. Risks and non-goals

**Risks**
1. *Key translation is the riskiest step.* Name-slug and normalizeKey histories that fail to
   resolve must land in `*:legacy:*` namespaces, never be guessed into canonical UIDs.
2. *Silent divergence during dual-write (M3.2).* While local stores still write, readers must
   have one preference order (backend first) and label the source; never merge the two.
3. *Outcome semantics.* A sloppy "correct/incorrect" verdict poisons calibration; verdict
   `method` must be stored and reviewed before any calibration surface ships.
4. *Cumulative-field drift.* Stored aggregates (streaks, totals) can disagree with their own
   history after bugs; canonical rule: aggregates are queries, snapshots are truth.
5. *Volume amnesia before M3.1 lands.* ThemeMemory remains the only institutional store;
   verify `THEME_MEMORY_DIR` is on a persistent volume today.
6. *Supabase coupling.* Institutional tables must be service-role-only from day one; adding
   browser write paths "temporarily" would recreate the localStorage problem with worse blast
   radius.

**Non-goals for Phase 3.0-3.4:** building the analog engine; alerts; Memory V2 UI surfaces;
dated-catalyst/event providers; multi-user backend saved-items; changing any current scoring
semantics; new frontend memory stores (there are enough).

---

---

## 15. M3.1 implementation record (BUILT — enablement pending rollout)

What was actually built for M3.1, where it diverges from or narrows sections 2-5, and the
exact operational contracts. Operational procedures live in ARGUS_MEMORY_OPERATIONS_V1.md.

### 15.1 Scope shipped

Themes only. No relationship/narrative/prediction/outcome writers, no analog engine, no
frontend integration, no alerts. ThemeMemory (1.1) is unchanged and remains the rolling
intraday layer; the writer reads its summaries, never replaces it.

### 15.2 Storage

Supabase Postgres, four tables (migration `supabase/migrations/004_institutional_memory.sql`
— numbering continues the lineage in `frontend/supabase/migrations/`; this file lives at the
repo root because the tables are backend-owned):

| Table | Purpose |
|---|---|
| `institutional_entities` | canonical identity registry; `unique(entity_type, namespace, canonical_key)` |
| `entity_snapshots` | historical state; natural key `unique(entity_uid, snapshot_date, snapshot_kind, schema_version)` |
| `transition_events` | changes between sealed snapshots; `event_key` unique |
| `memory_write_runs` | audit + idempotency ledger; `run_key` unique |

`schema_version = 1`, `writer_version = "m3.1.0"` (`app/institutional_memory/models.py`).

### 15.3 Identity

UID format `theme:ontology:<theme_id>` where `<theme_id>` is an **exact**
`app/data/theme_ontology.py` config key (pipeline theme ids are these keys, so the mapping is
lossless). Anything that is not an exact ontology key mints `theme:legacy:<slug>` — no fuzzy
matching, no silent merges. Display labels never participate in the UID; a label change is
recorded by moving the old label into `institutional_entities.aliases`. Implementation:
`app/institutional_memory/identity.py`.

### 15.4 Daily boundary (honest definition)

`snapshot_kind = "daily_utc"`: one row per theme per **UTC calendar day** — this is NOT U.S.
market close. The writer runs on the 5-minute background cycle; the current UTC day's row is
**mutable-until-sealed** (updated in place when state actually changed, counted unchanged
otherwise) and is sealed by definition the moment the UTC date advances. A sealed row is
never modified. The sealed value is therefore the last observed state of that UTC day
(~23:55Z when the pipeline is healthy).

### 15.5 Idempotency policy

1. `run_key = sha256(writer_version, schema_version, snapshot_date, sorted (uid, payload_hash))`
   — an identical re-run (retry, restart, duplicate deploy) resolves to an already-completed
   run and is skipped outright.
2. Snapshot natural key + `payload_hash` (sha256 over the canonical-JSON `payload.state`
   object only — observation time and provenance excluded): unchanged state is never
   rewritten; changed state on an open day updates in place (documented policy 7a).
3. `event_key = {uid}|{type}|{sealed_date}|v{schema_version}` with ignore-duplicates insert:
   at most one event of a type per theme per sealed day.
4. Bootstrap: a theme with any existing `bootstrap_baseline` snapshot is skipped forever.

### 15.6 Transitions

Generated once per day when day D-1 seals, comparing D-1's sealed snapshot against the
theme's most recent prior sealed snapshot (14-day lookback; presence flips compare only the
immediately preceding sealed day so absence fires once). Types and thresholds
(`app/institutional_memory/transitions.py`): conviction ±3 pts (mirrors ThemeMemory
`_TREND_DELTA`), lifecycle label change, evidence verdict-rank move or story-count ±2,
contradiction count move (count-based — itemized contradiction records do not exist yet),
breadth ±2 (mirrors `breadth_trend`), causal-narrative exact-string change,
`active_status_changed` on presence flips. All comparisons read typed values from
`payload.state`, so JSON ordering can never fire an event.

### 15.7 Writer integration and failure policy

`app/background.py::run_pipeline` calls `app.institutional_memory.record_cycle(themes)` after
the ThemeMemory update, **full-feed warm target only** (the Markets-only run is a subset and
must never write a partial market state). `record_cycle` never raises: Supabase failure logs
`[institutional-memory] write_failed …`, records a failed run when reachable, leaves
ThemeMemory untouched, and retries on the next cycle. Success is never reported when a write
failed.

### 15.8 Security

RLS enabled on all four tables with **no policies** + explicit `revoke all` from
`anon`/`authenticated`: the frontend (anon or authenticated) can neither read nor write.
The backend service role (bypasses RLS) is the only writer; frontend reads happen only
through the FastAPI endpoints below. The service-role key exists only as backend env config
and is never logged (verified by test).

### 15.9 Read API (M3.1 surface)

```
GET /api/memory/v2/status
GET /api/memory/v2/themes/{theme_uid}/snapshots?date_from&date_to&limit&order
GET /api/memory/v2/themes/{theme_uid}/transitions?date_from&date_to&limit&order
GET /api/memory/v2/themes/{theme_uid}/latest
```

`{theme_uid}` accepts the full canonical UID or a bare pipeline theme id. Errors are
sanitized (502/503 with generic detail; specifics go to server logs only). The v1 routes
(`/api/memory/*` over ThemeMemory) are unchanged.

### 15.10 Environment variables (backend only)

| Variable | Purpose | Default |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | empty |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key (writer credential) | empty |
| `INSTITUTIONAL_MEMORY_ENABLED` | master switch | `false` (safe default) |

Startup logs `[institutional-memory] enabled=… / disabled reason=…` without secret values.

### 15.11 Bootstrap

`python scripts/bootstrap_institutional_memory.py [--dry-run]` — one baseline snapshot per
theme known to ThemeMemory, `snapshot_kind="bootstrap_baseline"`,
`provenance.source="theme_memory_bootstrap"`, `completeness_status="bootstrap"`,
`snapshot_date` = run date, `observed_at` = the theme's real `last_seen`. No ring-buffer
observations are expanded into fake daily history; nothing is backdated. Idempotent and
audited in `memory_write_runs`. Browser localStorage histories are NOT imported in M3.1.

### 15.12 Known limitations

1. The daily boundary is a UTC day, not market close (revisit in M3.2 with the
   material-change/event cadence).
2. Contradiction transitions are count-based; itemized contradiction identity does not exist
   in the pipeline yet.
3. `graph_version`, `forward_view`, `beneficiaries`, `narrative_memberships` are honest
   nulls — the backend has no graph-version, prediction, or narrative persistence yet.
4. Intraday material-change snapshots are deferred to M3.2; intraday deltas remain served by
   ThemeMemory.
5. `transitions_inserted` counts attempted inserts; duplicates suppressed by `event_key` are
   not netted out of the counter.
6. The mutable-until-sealed daily row means intraday provenance reflects the **last** write
   of the day (update_count-style revision history is not kept).

---

## 16. M3.2 implementation record (BUILT — enablement pending migration 005)

Entity, narrative, and relationship history on top of the M3.1 foundation. M3.1 behavior,
tables, identity, idempotency, security, and failure policy are UNCHANGED.

### 16.1 Sourcing rule (audit outcome)

All persisted values are backend-computed. The relationship source is the deterministic
backend graph (`app/narrative_graph.py::build_narrative_graph`, ≤18 nodes / ≤25 edges, edge
types recorded VERBATIM: `drives, pressures, supports, correlates, rotates_into`) plus
theme→company `exposed_to` links from curated `related_assets`. Frontend-only engine outputs
(IntelEdge evidence counters, edge trends, member driver-link strengths, prediction reads)
have no backend equivalent and are NOT copied; where the schema has a slot for them the value
is an honest null. Narrative derivation is a backend re-implementation of the frontend
driver-set algorithm (`app/institutional_memory/graph_adapter.py::_derive_narrative_snapshots`)
over `related_macro_factors` — the shared contract is the driver-set key construction.

### 16.2 Identity (migration 005 widens the M3.1 vocabulary)

| Type | UID form | Key source |
|---|---|---|
| company | `company:ticker:<SYMBOL>` | curated tradeable tickers (companies, ETFs, index proxies) |
| industry | `industry:taxonomy:<slug>` | curated industry taxonomy (theme ontology labels) |
| sector | `sector:taxonomy:<slug>` | GICS-style curated sectors — **reserved, no writer yet** |
| driver | `driver:ontology:<slug>` | `related_macro_factors` strings curated in the ontology |
| regime | `regime:taxonomy:<slug>` | curated regime catalogue (`narrative_graph._REGIME_SENTIMENT`) |
| narrative | `narrative:driverset:<sha256[:16] of key>` | key = sorted canonical driver UIDs joined `+` |
| relationship | `rel:{source_uid}\|{type}\|{target_uid}` | symmetric types (`correlates`) order endpoints lexically; all others are directional |
| unresolved | `<type>:unresolved:<slug>` | strict-validation failures — never guessed |

Ticker changes/mergers use `institutional_entities.aliases` + `status`/lifecycle fields via a
manual runbook procedure (no automatic detection source exists). Story/evidence entities are
NOT minted: cluster ids (stable `md5(title+url)[:12]` content hashes) are persisted as
evidence *references* only.

### 16.3 New tables (migration `005_entity_narrative_relationship_history.sql`)

`institutional_relationships` (identity registry: first/last seen, active/aged_out),
`relationship_snapshots` (daily_utc, mutable-until-sealed, natural key
`(rel_uid, snapshot_date, kind, schema_version)`), `relationship_transitions` (separate
ledger — rel UIDs are not entity rows, keeping the M3.1 FK strict),
`narrative_snapshots` (daily_utc; driver_set_key, title-at-time, thesis (null in M3.2 — no
deterministic backend thesis), member_uids, member convictions listed INDIVIDUALLY (never
blended), coherence + components (structural measure, not a confidence), evidence refs,
count-based contradictions, dominant/secondary + rank). Same RLS/revoke security model.
Widened check constraints are strict supersets — M3.1 rows remain valid.

### 16.4 Graph version

`graph_version = "gv1-" + sha256(canonical_json(topology))[:16]` where topology = regime +
sorted (node id, type) + sorted (source, type, target). Same input → same version; topology
or regime change → new version; strength/confidence drift does NOT churn it (that is state,
captured by snapshots). Distinct from the frontend profile-cache version (a process-lifetime
invalidation counter) — the two must never be conflated. Stamped on industry, narrative, and
relationship snapshots; M3.1 theme snapshots keep `graph_version=null` (pre-stamping era).

### 16.5 Writers and cycle order

`run_pipeline`: themes → ThemeMemory → feed assembly → `record_cycle(themes, feed=feed)` →
cache publish. Inside the writer: M3.1 theme stage (unchanged) → M3.2 stage (entities,
relationship registry, industry/narrative/relationship daily snapshots) → sealed-boundary
transitions for all families. The deterministic `run_key` now covers ALL families' (uid,
payload_hash) pairs. M3.2 counters are reported via `memory_write_runs.metadata`
(`stage: "m3.2"`) so M3.1 columns keep their meaning. M3.2 derivation or write failure is
recorded and logged but never blocks M3.1 writes or the pipeline.

### 16.6 Transition semantics (all compare SEALED daily snapshots; typed values only —
JSON ordering can never fire an event)

| Family | Types | Thresholds |
|---|---|---|
| narrative | appeared/disappeared, member_added/removed (set diff, stable UIDs in basis), dominant_status_changed, coherence_strengthened/weakened, contradiction_added/removed, thesis_changed | coherence ±5 pts; contradictions count-based; thesis fires only when both sides exist and differ (never in M3.2) |
| relationship | appeared/disappeared, relationship_strengthened/weakened, confidence_changed, evidence_added/removed | strength ±0.10 and confidence ±0.10 (0-1 scale); evidence ±2 identifiers; `relationship_type_changed` deliberately unmodeled — a type change is a new rel_uid (disappear + appear) |
| industry | **none in M3.2** | activation churns daily; snapshots accrue, threshold model is future work |

Genuine-absence rule: presence events for narratives/relationships fire on an empty D-1 only
when theme writes prove the writer ran that day (data gap ≠ dissolution).

### 16.7 Read API additions

```
GET /api/memory/v2/entities/{uid}/snapshots
GET /api/memory/v2/entities/{uid}/relationships
GET /api/memory/v2/narratives/{uid}/snapshots
GET /api/memory/v2/narratives/{uid}/transitions
GET /api/memory/v2/relationships/{rel_uid}/snapshots    (URL-encode '|')
GET /api/memory/v2/relationships/{rel_uid}/transitions
GET /api/memory/v2/graph/at?date=YYYY-MM-DD
```

`/status` gains an `m3_2` count block that reports null (not an error) until migration 005 is
applied. Replay contract: `HistoricalIntelligenceState`
(`app/institutional_memory/replay.py`) — latest sealed records at or before the date,
31-day lookback, labeled `daily_historical_reconstruction`, future never leaks, unsealed
"today" is clamped and noted, completeness ∈ {daily, partial, empty}. See
ARGUS_HISTORICAL_REPLAY_V1.md.

### 16.8 Known limitations

1. Relationship coverage = the curated backend graph (top ~6 themes, ≤25 edges) + exposure
   links — not the full frontend Explorer graph.
2. Edge-level evidence is theme-scoped (`evidence_scope: "theme_level"`); per-edge evidence
   records do not exist in the backend.
3. Narrative coherence components: driver-link strength is null (frontend-only input);
   coherence = mean of asset/sector Jaccard overlaps.
4. No narrative thesis, no company/driver/regime daily snapshots (no real per-entity backend
   state yet — identity + relationships only), no industry transitions.
5. Replay is daily reconstruction, never intraday; subjects idle beyond the 31-day lookback
   are treated as inactive at that date.

---

## 17. M3.3 implementation record (BUILT — issuance disabled pending rollout)

The Prediction & Outcome Ledger (section 2.E/2.F realized for structural,
intelligence-state predictions). Full contract: ARGUS_PREDICTION_OUTCOME_LEDGER_V1.md.

**Audit outcome:** the backend produces zero predictions today — all prediction logic is
frontend TypeScript (`predictionEngine.ts`) and was NOT ported. The ledger therefore ships
with an admission contract (`PredictionCandidate`) separating generation from persistence,
plus three deterministic structural rule generators over recorded canonical state:
`relationship_persistence`, `narrative_membership`, `conviction_threshold` (threshold = the
canonical ThemeMemory 3-pt deadband). No price forecasting: no reliable adjusted-price
source exists; outcomes resolve exclusively against Argus's own sealed daily records.

Key contracts: migration `006_prediction_outcome_ledger.sql` (`prediction_records` immutable
after issuance with status-only updates, `outcome_records` with verdict + stored resolution
rules, `prediction_resolution_runs`, `prediction_calibration_view`; same RLS/revoke model);
identity `prediction:v1:<sha256[:32]>` over semantic content excluding wording; issuance
once per subject/type/**scope**/UTC day (scope_key = rel_uid / narrative UID / 'conviction'
— required because one subject legitimately carries many relationship predictions); resolver
runs once per UTC day after M3.1/M3.2 writes, resolves only sealed boundaries, and uses the
M3.2 theme-liveness discriminator so a writer gap is `unresolvable_data_gap`, never a
verdict. Invalidation (identity retired/absorbed) is distinct from contradiction and never
hidden. Scoring (1.0/0.5/0.0) applies only to tested verdicts; everything else scores null.
Calibration is gated (≥30 tested per type, ≤20% untested, per-bucket minimums, stable rules)
and labeled "diagnostics, not an accuracy claim" until gates pass. Probability is null in
all M3.3 predictions (no decomposable canonical confidence method exists).

Flags: `PREDICTION_LEDGER_ENABLED` (default false) + `PREDICTION_TYPES_ENABLED` (default
`relationship_persistence`). M3.3 counters ride in `memory_write_runs.metadata`
(`m3_3_issuance` / `m3_3_resolution`); M3.1/M3.2 reporting is unchanged.

---

*Related: ARGUS_INTELLIGENCE_MODEL_V1.md (ontology + confidence vocabulary),
ARGUS_INTELLIGENCE_PROFILE_V1.md (the projection snapshots persist),
ARGUS_INTELLIGENCE_SURFACES_V1.md (surface ownership), ARGUS_INTELLIGENCE_EVERYWHERE_V1.md
(Phase 2 closure this design builds on), ARGUS_MEMORY_OPERATIONS_V1.md (runbook),
ARGUS_HISTORICAL_REPLAY_V1.md (replay contract),
ARGUS_PREDICTION_OUTCOME_LEDGER_V1.md (M3.3 ledger contract).*
