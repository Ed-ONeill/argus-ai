# ARGUS KNOWLEDGE MODEL V1 (M6.0)

**Status: CANONICAL KNOWLEDGE MODEL — the highest-level document governing the
intelligence model.** This document defines every first-class object Argus
understands, the law of each object's life, and the canonical relationships between
them. Every surface is a projection of this single model. Future features **extend
this model by amendment; they never invent parallel structures.** A proposal that
introduces a new object, a new relationship verb, or a new identity scheme without an
amendment here is an architecture violation regardless of how useful it is.

**Position in the canon.** ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1 owns
*information flow and surface responsibility* (the six-stage spine, the routing
matrix). ARGUS_INTELLIGENCE_MODEL_V1 owns the *frontend graph ontology* (node/edge
vocabulary, confidence factors, evidence classes). ARGUS_INSTITUTIONAL_MEMORY_V2 owns
the *durable record contracts*. ARGUS_ENTITY_INTELLIGENCE_V1 owns the *research
surface grammar*. This document sits above them and owns **the object universe
itself**: what exists, who may create it, who may change it, who may show it, and
what may never happen to it. Where a lower document is more specific, it governs its
specialty; where any document conflicts with the object law here, the conflict is
resolved by explicit amendment — nothing drifts silently.

This is a design document. It canonicalizes what the system already does; the three
places where it *decides* something new are marked **[V1 decision]** and logged in
the amendment table.

---

## PART 1 — THE SHAPE OF THE MODEL

### 1.1 One sentence

Argus maintains **one model of market structure** (drivers, themes, industries,
companies, regimes, and the relationships among them), fed by **observed events
carrying evidence**, remembered as **sealed records**, tested by **predictions and
outcomes**, and shown through **surfaces that project and never compute**.

### 1.2 The four strata

Every first-class object lives in exactly one stratum. The stratum determines its
epistemic authority and who may write it.

```
STRATUM W — THE WORLD (observed)
    Market Event · Evidence
    "What happened, and how do we know?"
    Created at spine stages 1–2. External facts; Argus records, never invents.

STRATUM S — STRUCTURE (interpreted)
    Driver · Theme · Narrative · Industry · Sector · Company · Regime · Relationship
    "What is the market made of right now?"
    Created at spine stage 3 by canonical engines against curated ontologies.
    Current-state truth; changes every cycle; identity is permanent even as state moves.

STRATUM M — MEMORY (remembered)
    Memory Record (EntitySnapshot · RelationshipSnapshot · NarrativeSnapshot ·
    TransitionEvent) · Identity Registry
    "What did we know, and when did it change?"
    Created at spine stage 4. Append-only, sealed, backend-owned. The system of record.

STRATUM A — ACCOUNTABILITY (staked)
    Prediction · Outcome
    "What did we expect, and were we right?"
    Created at spine stage 5. Immutable after issuance; resolved only against sealed
    Stratum-M records; calibration is a derived join, never a stored opinion.
```

Authority flows downward-only in one specific sense: Stratum S is rebuilt from
Stratum W every cycle; Stratum M seals Stratum S; Stratum A is tested against
Stratum M. **No object in a lower-numbered stage may be modified by a later one** —
an outcome never edits a prediction, a snapshot never edits a theme, a surface never
edits anything.

### 1.3 The standing invariants (inherited, binding on every object)

- **K1 — One understanding.** Every object exists exactly once. Two surfaces
  disagreeing about an object is a severity-one defect.
- **K2 — Identity by UID, never by label.** Every first-class object has a canonical
  UID (`{type}:{namespace}:{key}` for subjects; typed natural keys for records).
  Display labels are stored for audit but never join, never key, never resolve.
  Whatever cannot be resolved mints `<type>:unresolved:<slug>` — never guessed.
- **K3 — No fabrication.** A missing fact renders as a designed absence. No object
  may be minted, padded, or estimated into existence to fill a screen.
- **K4 — Append-only memory.** Strata M and A are never edited in place after
  sealing/issuance. Corrections append; deletions do not exist.
- **K5 — Meaning is computed once.** Only stage-3–5 engines create or modify
  objects. Surfaces and frontend engines project. (The frontend intelligence graph,
  evidence engine, and prediction engine are *projections* — session-scoped reads
  that mint no canonical objects.)
- **K6 — Derived is marked.** Every derived object or field (narratives, regimes,
  attribution classes, coherence) carries its derived nature to every renderer;
  derived content never wears recorded authority.
- **K7 — Personalization ranks; it never rewrites.** No user signal may create,
  modify, or re-score any object in any stratum. Saved/follow state is per-user
  shelf data, firewalled outside this model.

---

## PART 2 — THE OBJECT CATALOG

Each object is defined by the same nine clauses. "Created by" and "Modified by" name
canonical engines only (K5). "Referenced by" lists the objects allowed to hold this
object's UID; a reference not listed here is a model violation.

---

### O1 · MARKET EVENT — *stratum W*

- **Purpose.** The unit of market news: one real-world occurrence, corroborated
  across sources, scored once. Argus ranks events, never articles; an event is an
  input to understanding, never understanding itself.
- **Lifecycle.** `observed` (first qualifying cluster) → `developing` (single
  qualified source, labeled, excluded from lead/slots) → `corroborated` (second
  qualified source; auto-promoted) → decays on its class half-life from
  **first-seen time** → below admission floor → persists as an evidence reference in
  Stratum M forever. Near-duplicate events fold (`merged_event_ids` preserves
  linkage); one company + one reporting period folds to one earnings event.
- **Identity.** Cluster id — the stable content hash `md5(title+url)[:12]` from
  `app/clustering.py`; `MarketEvent.id ≡ StoryCluster.id`. **[V1 decision]**
  Canonical UID form for addressing: `event:cluster:<cluster_id>` (the namespace
  wraps the existing key losslessly; `/event/<cluster_id>` remains the alias route).
- **Source of truth.** `app/events.py` (canonical `MarketEvent`), built each
  pipeline cycle, cached in `ProcessedFeed.events`, served via `FeedResponse.events`.
- **Created by.** The Wire desk (stages 1–2: `feeds.py` classification/suppression →
  `clustering.py` corroboration → `events.py` EventScore = Base × Corroboration ×
  Relevance × Decay).
- **Modified by.** Only the Wire desk, and only monotonically: corroboration counts
  grow, lane promotes, decay accrues. Company attribution (`companies_direct`) is
  set by the deterministic resolver (`app/companies.py`) at creation.
- **Rendered by.** Feed (stream, lead, slots, developing lane); Event Intelligence
  (the event *record* at `/event/<id>`); Entity Intelligence (Event Record section
  of every file it names); Markets (through the themes it feeds, never directly);
  M&A (deals-as-events); Network (as evidence density, never as nodes).
- **May reference.** Companies (`companies_direct`, resolver-named only), Themes (via
  interpretation), Evidence items (its own source list), merged sibling events.
- **Never.** Never re-scored by a surface; never resurfaces on re-reports (decay
  runs from event first-seen); never created from an opinion/SEO/PR item (suppressed
  upstream — commentary is never admitted); never a graph node; never deleted;
  attribution is never inferred from theme membership (EI1.1: direct is recorded,
  indirect is labeled with its reason or excluded).

---

### O2 · EVIDENCE — *stratum W*

- **Purpose.** The citable basis of every claim. Anything Argus believes must be
  able to answer "how do you know?" with a list of evidence items, quality-tiered.
- **Lifecycle.** Attached at creation to the event or theme it supports; carries
  `kind` (`sec_filing / transcript / ir_release / news`) and source tier; referenced
  by Stratum M records at sealing; never expires (recency affects weight downstream,
  never the record).
- **Identity.** Reference-based today: cluster ids and source URLs persisted as
  evidence *references* on themes, events, and memory records. Atomic evidence
  records with their own UIDs are **future work** (the evidence-log migration in
  INTELLIGENCE_MODEL §5.4) — this document reserves `evidence:` as their namespace
  and forbids any interim fake granularity. **[V1 decision]** Evidence is
  reference-only until that log exists; no surface may imply per-assertion evidence
  identity before then.
- **Source of truth.** The referencing objects: `MarketEvent.evidence` (with `kind`),
  theme evidence refs, memory-record `evidence_refs`.
- **Created by.** The Wire desk (article evidence), the interpretation engines
  (theme evidence accrual), the Listen pipeline (conversational evidence, low
  weight), the M&A extractor (deal facts).
- **Modified by.** No one. Evidence is written once. Weakening evidence is *added*,
  never netted against a counter invisibly.
- **Rendered by.** Every surface, through one shared evidence renderer (the
  EI convergence rule: the stream and the file may never disagree about a source
  list). Feed popovers, dossier evidence sections, Network provenance, Memory
  `evidence_refs`.
- **May reference.** Its source (URL, tier, kind) and the objects it supports
  (event id, theme uid, rel uid).
- **Never.** An opinion piece never becomes evidence (only a corroborated fact it
  reports does); price action alone never creates a causal claim (confirmatory
  only); discussion volume never becomes conviction; evidence counts are never
  blended across narrative members (per-member, listed).

---

### O3 · COMPANY — *stratum S*

- **Purpose.** A tradeable operating entity; the terminal expression of
  transmission — where theses become positions.
- **Lifecycle.** Minted into the identity registry when the deterministic resolver
  admits it (an uppercase token is *not* a company until it resolves; ambiguous
  ticker-words need explicit context) → accrues events, exposures, relationships,
  memory, predictions → ticker change adds an alias (UID keeps mint-time ticker) →
  merger sets `absorbed` + `superseded_by`; history remains queryable forever,
  forward accrual stops.
- **Identity.** `company:ticker:<SYMBOL>` — curated tradeable tickers (companies,
  ETFs, index proxies), registry `institutional_entities`.
- **Source of truth.** The canonical company registry (`app/companies.py`) for
  identity; the theme ontology's `related_assets` for exposure; the graph for
  relationships; the M3 archive for history.
- **Created by.** The interpretation stage (resolver + curated registry). Never by
  a surface, never by fuzzy matching.
- **Modified by.** Interpretation (exposure state each cycle); identity lifecycle
  changes only via the manual runbook (no automatic detection source exists).
- **Rendered by.** Entity Intelligence (the company *file* at `/intel/company:…`,
  richest facets: Earnings / SEC / Management), Feed (chips), Markets (leaderboard),
  Network (nodes), M&A (parties), Private Markets (counterparties).
- **May reference.** Industry (membership), Sector, Themes (exposures via
  Relationship), Relationships, Market Events naming it, Memory Records,
  Predictions/Outcomes about it.
- **Never.** Never carries unsourced fundamentals, consensus, or price-derived
  claims beyond the honesty boundary; a private counterparty never gets a fake
  company file (unresolved identity with extracted facts instead); duplicate names
  resolve by ticker, never merged by label.

---

### O4 · INDUSTRY — *stratum S*

- **Purpose.** The taxonomic container between company and sector; the unit of
  activation ("where is this theme concentrating?").
- **Lifecycle.** Curated taxonomy entry (exists by admission, not by observation) →
  activation state (score, breadth, momentum) recomputed each cycle → daily
  snapshots seal its history. Taxonomy changes are identity-lifecycle events.
- **Identity.** `industry:taxonomy:<slug>` — curated industry taxonomy.
- **Source of truth.** The curated taxonomy; `industry_activation` for state.
- **Created by.** Curation (taxonomy), activation computed by the interpretation
  stage.
- **Modified by.** Interpretation only (state); curation only (membership).
- **Rendered by.** Entity Intelligence (industry file: Activation + Membership
  facets), Industries surface, Markets (rotation), Network (layer-2 nodes).
- **May reference.** Parent Sector, member Companies, Themes crossing it,
  Relationships, Memory Records.
- **Never.** Never conflated with Sector in identity (they conflate at the causal
  *layer*, not in the registry); never activated without recorded theme linkage.

---

### O5 · SECTOR — *stratum S (reserved writer)*

- **Purpose.** GICS-style top container for rotation and regime reads.
- **Lifecycle.** Curated; `sector:taxonomy:<slug>` is a **reserved namespace with no
  writer yet** — sectors exist in projections (frontend graph, Markets) but mint no
  memory records until a writer is admitted by amendment.
- **Identity.** `sector:taxonomy:<slug>` (reserved).
- **Source of truth.** Curated sector taxonomy (SECTOR_ENTITIES).
- **Created by / modified by.** Curation; interpretation projects rotation state.
- **Rendered by.** Markets (leadership, rotation), Network, Industries.
- **May reference.** Member Industries; Themes; Relationships.
- **Never.** Never written to memory before its writer ships (reserved means
  absent, not stubbed).

---

### O6 · THEME — *stratum S*

- **Purpose.** The primary unit of intelligence: a named market thesis connecting
  drivers to exposed assets, carrying conviction, breadth, momentum, lifecycle, and
  an evidence trail. Everything else in Stratum S is upstream, downstream, or
  grouping of themes.
- **Lifecycle.** Admitted to the curated ontology (`app/data/theme_ontology.py`) →
  active accrual per cycle (ThemeMemory intraday; conviction/breadth/lifecycle
  labels) → daily sealed snapshots → `theme_absent` / `theme_returned` transitions
  on presence flips → retirement only via identity lifecycle. Lifecycle states
  (emerging → building → established → fading → broken | dormant) are conceptual
  law; `broken` is terminal *with memory* — a broken thesis is among the most
  valuable records Argus holds.
- **Identity.** `theme:ontology:<id>` — exact ontology config key; anything else
  mints `theme:legacy:<slug>`. Renames move the old label to aliases; history is
  continuous by construction.
- **Source of truth.** The theme pipeline (`app/themes.py` + ontology) for current
  state; ThemeMemory for intraday accrual; the M3 archive for history.
- **Created by.** Interpretation (stage 3) against the curated ontology only.
- **Modified by.** Interpretation (state per cycle); ThemeMemory (accrual); nothing
  else. Frontend theme intelligence is a projection.
- **Rendered by.** Entity Intelligence (theme file — the richest kind: Lifecycle &
  Trajectory, Contradiction Ledger, Historical Context facets), Feed (gating,
  chips), Markets (leaderboards, evidence-by-theme), Network (layer-1 nodes),
  Listen (evidence density), Memory and Prediction surfaces (as subject).
- **May reference.** Drivers (upstream), Industries/Sectors/Companies (downstream,
  via Relationships), Narratives (membership), Market Events and Evidence
  (its trail), Memory Records, Predictions.
- **Never.** Its label is never its key (the continuity failure this model
  exists to prevent); its conviction is never blended into a narrative-level
  number; it is never created from clustering output without ontology admission;
  its history is never rewritten on rename.

---

### O7 · DRIVER — *stratum S*

- **Purpose.** A macro force outside any single market that originates transmission
  chains — the top of the causal order (layer 0) and the anchor of narrative
  identity.
- **Lifecycle.** Curated in the ontology (`related_macro_factors`) → participates in
  transmission each cycle → its set-membership defines Narrative identity → decays
  slowly (drivers outlive stories).
- **Identity.** `driver:ontology:<slug>`.
- **Source of truth.** The theme ontology's curated macro factors;
  `narrative_graph.py` for its edges.
- **Created by.** Curation + interpretation. Macro releases (events) re-weight its
  transmission; they do not mint drivers.
- **Modified by.** Interpretation (weights); curation (existence).
- **Rendered by.** Entity Intelligence (driver file — thin kind, core grammar only),
  Network (layer 0), Markets (regime inputs), Feed (macro events).
- **May reference.** Themes it drives (Relationships), Narratives keyed on it,
  Memory Records.
- **Never.** Never minted from a headline; never carries a blended downstream
  confidence; never disappears silently (absence is a transition).

---

### O8 · NARRATIVE — *stratum S, derived*

- **Purpose.** The desk's "big story": a grouping of multiple themes sharing a
  driver set. Exists so cross-theme structure is visible and so memory has a
  rename-proof key — **not** so a new authority can be invented above themes.
- **Lifecycle.** Re-derived every cycle from the driver-set algorithm (frontend
  `narrativeDerivation.ts` and its backend re-implementation share one contract:
  the driver-set key) → daily NarrativeSnapshots seal membership, coherence, rank →
  `narrative_emerged` / `narrative_faded` and membership transitions mark change →
  a materially different driver set **is a different narrative UID**, linked via
  identity lifecycle when overlap is high.
- **Identity.** `narrative:driverset:<sha256[:16] of key>` where
  key = sorted canonical driver UIDs joined `+`. Label drift changes nothing.
- **Source of truth.** The derivation (ephemeral, marked `derived: true`) for now;
  NarrativeSnapshots for history. There are no stored Narrative graph nodes.
- **Created by.** Interpretation (derivation) each cycle; Memory (stage 4) persists
  snapshots.
- **Modified by.** No one — it is re-derived, and its snapshots seal.
- **Rendered by.** Entity Intelligence (narrative file: Composition facet), Network
  (dominant-narrative dossier), Feed hero / Markets story (as the derived grouping,
  always marked derived), Memory surface.
- **May reference.** Member Themes (individually, with roles), its Driver set,
  Memory Records, Predictions (`narrative_membership` type).
- **Never.** Never stored as a graph node until the backend emits sourced
  narratives (then by alias-merge, additive); **never carries a blended
  confidence** (member convictions are listed individually — confidence laundering
  is banned); never fed back into the graph; never rendered with sourced-theme
  visual authority; member evidence is never summed (shared stories double-count).

---

### O9 · REGIME — *stratum S, derived*

- **Purpose.** The answer to "what kind of market is this?" — the field conditions
  (rates direction, risk appetite, breadth) against which everything else is read
  and future analogs compare like with like.
- **Lifecycle.** Derived each cycle from the curated regime catalogue
  (`narrative_graph._REGIME_SENTIMENT` / `derived_regime`) → transitions recorded →
  stamped into `graph_version` (a regime change is a topology change) → daily
  MarketContext records support outcome attribution and analogs.
- **Identity.** `regime:taxonomy:<slug>` — curated catalogue.
- **Source of truth.** The derivation + curated taxonomy; transition history in the
  archive.
- **Created by.** Interpretation. **Modified by.** Interpretation only.
- **Rendered by.** Markets (the regime surface — its one question), Entity
  Intelligence (regime file — thin kind, gives Markets its citable long-form read),
  Network (context).
- **May reference.** Nothing downward (a regime conditions; it does not own).
  Referenced by Memory Records, Snapshots (`graph_version`), analogs (future).
- **Never.** Never asserted without its derivation being decomposable; never used
  to modify object state (it contextualizes reads; it does not rewrite records).

---

### O10 · RELATIONSHIP — *stratum S*

- **Purpose.** A typed, directional, evidence-bearing link between two subjects —
  the model's answer to "why". Transmission is the product's core read, and
  transmission is a path of Relationships.
- **Lifecycle.** Asserted by the deterministic backend graph each cycle (edge types
  recorded **verbatim**: `drives, pressures, supports, correlates, rotates_into`,
  plus theme→company `exposed_to` from curated `related_assets`) → registry rows
  carry first/last seen → status `active | weakening | aged_out` → daily
  RelationshipSnapshots seal state → `relationship_added / expanded / aged_out`
  transitions mark change. Aging out is a status, never a deletion.
- **Identity.** `rel:{source_uid}|{type}|{target_uid}`, direction-normalized;
  symmetric types (`correlates`) order endpoints lexically; all others are
  directional. One fact, one edge — synonym verbs that would split evidence are
  folded, not added.
- **Source of truth.** `app/narrative_graph.py::build_narrative_graph` (backend,
  deterministic) + curated exposures. The frontend `IntelEdge` vocabulary is a
  projection superset; its evidence counters and trends have no backend equivalent
  and are honest nulls in memory.
- **Created by.** Interpretation. **Modified by.** Interpretation (state);
  Memory seals history.
- **Rendered by.** Network (the edges *are* the surface), Entity Intelligence
  (Exposure & Transmission section, Relationship Map), Markets (transmission map),
  M&A (deal-derived edges, migrating to this grammar), causal chains everywhere.
- **May reference.** Its two endpoint subjects (by UID), Evidence, Memory Records,
  Predictions (`relationship_persistence` scope key = rel_uid).
- **Never.** Never undirected "related to" (direction is causal, not grammatical);
  never asserted without a citable basis; never duplicated under a synonym verb;
  frontend-only edge state never masquerades as recorded state.

---

### O11 · MEMORY RECORD — *stratum M*

The four durable record types are one object family with one law. "Memory" as a
first-class object means these records — never a vibe, never a cache.

- **Purpose.** The system of record for **how understanding evolved**: entity state
  at a boundary (EntitySnapshot), edge state over time (RelationshipSnapshot),
  narrative composition over time (NarrativeSnapshot), and meaningful change
  between sealed states (TransitionEvent). Transitions are more valuable than
  states — they are Argus's own reporting (§3.9 of the architecture) and the only
  source of alerts.
- **Lifecycle.** Written by the backend writer on the pipeline cycle; the current
  UTC day's row is **mutable-until-sealed**; sealed the moment the UTC date
  advances; a sealed row is never modified; transitions are generated once when a
  boundary seals, comparing sealed against sealed. Retention: raw dailies ~2 years,
  rollups forever; broken-thesis records never deleted.
- **Identity.** Natural keys: snapshots `{subject_uid}:{date}:{kind}:{schema}`;
  transitions `event_key = {uid}|{type}|{sealed_date}|v{schema}`; every record
  carries `schema_version`, `writer`, `payload_hash`, `provenance`, and
  `graph_version` where applicable.
- **Source of truth.** Supabase Postgres (`entity_snapshots`,
  `relationship_snapshots`, `narrative_snapshots`, `transition_events`,
  `memory_write_runs`), RLS-locked: the backend service role is the **only**
  writer; the frontend can neither read nor write tables directly.
- **Created by.** The memory writer (`app/institutional_memory`, stage 4), full-feed
  warm cycles only (a partial market state is never written).
- **Modified by.** No one after sealing. Unchanged state is never rewritten
  (payload-hash guard); corrections append.
- **Rendered by.** The Memory surface (read APIs `/api/memory/v2/*`), Entity
  Intelligence (Institutional Memory section of every file), Network (memory
  maturity states), Feed (transitions as `UNDERSTANDING CHANGED` items, F4),
  Themes/Markets (history and context, gated).
- **May reference.** Its subject UID, evidence refs (cluster ids), adjacent
  snapshots (transition anchors), `graph_version`.
- **Never.** Never edited after sealing; never written by a browser; never
  backdated or expanded into fake history (bootstrap wrote baselines, not
  invented dailies); never blends member values; absence is recorded as data
  (`theme_absent`), never papered over; device-local stores (localStorage
  histories) are never the canonical record — at most a labeled cache.

---

### O12 · IDENTITY REGISTRY — *stratum M, meta*

- **Purpose.** The spine of K2: the registry that makes every other object
  addressable, rename-proof, and merge-safe. Coverage grows by identity, not by
  guess — a kind is admitted only with (a) a uid scheme, (b) a deterministic
  resolver, (c) a producing engine.
- **Lifecycle.** UIDs are immutable once minted. Aliases accrue (renames, ticker
  changes, legacy keys). Lifecycle status moves `active → superseded | absorbed |
  retired`; forward accrual stops, history stays queryable forever.
- **Identity.** `{type}:{namespace}:{key}`, lowercase. Live namespaces:
  `theme:ontology:` · `company:ticker:` · `industry:taxonomy:` ·
  `driver:ontology:` · `regime:taxonomy:` · `narrative:driverset:` — plus reserved
  `sector:taxonomy:`, the honesty lane `<type>:unresolved:`, legacy lanes
  (`theme:legacy:`), and (this document) `event:cluster:` and reserved `evidence:`.
- **Source of truth.** `institutional_entities` + alias/lifecycle tables;
  `app/institutional_memory/identity.py`.
- **Created by.** The memory writer and curated admission. **Modified by.** Alias
  and lifecycle appends only (manual runbook for tickers/mergers).
- **Rendered by.** Indirectly by everything: `/intel/<uid>` — the uid *is* the
  address; kind aliases redirect to canonical.
- **May reference.** Superseding UIDs.
- **Never.** A UID is never reused, never re-keyed on rename, never resolved by
  label, never fuzzily matched; a reserved kind never gets a stub page.

---

### O13 · PREDICTION — *stratum A*

- **Purpose.** A falsifiable, pre-registered stake: what Argus expects, in testable
  form, with named assumptions and invalidation conditions. An institutional
  accountability system, not a trading-signal product.
- **Lifecycle.** Issued once per subject per type per scope per UTC day when
  admission rules pass (canonical subject UID, resolution window sealed before
  resolution, testable expected state, provenance, probability only from a
  decomposable method — none exists, so probability = null) → waits out
  `resolve_after` → resolved by exactly one Outcome → or `invalidated` when its
  subject's identity lifecycle broke its stated assumption. Immutable after
  issuance; only status columns move.
- **Identity.** `prediction:v1:sha256(canonical_json(semantic))[:32]` — wording
  excluded (rewording never mints; material change always does).
- **Source of truth.** The prediction ledger (`prediction_records`, migration 006);
  supported types deliberately narrow: `relationship_persistence`,
  `narrative_membership`, `conviction_threshold`.
- **Created by.** The issuance engine (`institutional_memory/predictions.py`,
  stage 5). The frontend predictionEngine is a projection and mints nothing.
- **Modified by.** Status transitions only, by the resolver.
- **Rendered by.** The Prediction/accountability surface, Entity Intelligence
  (Accountability section, verdicts unabridged), Network (Seal beat on
  resolution), Feed (resolutions are never rankable below the fold on the day they
  resolve).
- **May reference.** Subject UID, scope key (rel_uid / narrative UID /
  `conviction`), provenance records.
- **Never.** Never deleted; never edited; never duplicated (day guard + unique
  constraint); never a price forecast, generic risk, watch item, or could/may/might
  prose; probabilities never invented and never retroactively modified; no
  accuracy claim before the credibility gates pass.

---

### O14 · OUTCOME — *stratum A*

- **Purpose.** What actually happened, judged by pre-registered deterministic
  rules against sealed records — the accountability moment.
- **Lifecycle.** Written once by the resolver (separate process, once per UTC day,
  deterministic run key), only after the tested boundary is sealed, reading
  persisted records only. One final outcome per prediction. Verdicts:
  `confirmed | partially_confirmed | contradicted | invalidated |
  unresolvable_data_gap | expired` — a data gap is never a verdict of wrongness.
- **Identity.** Own record id, joined to its prediction; `resolution_rules` stored
  verbatim with `evidence_refs` so any reviewer can reconstruct the verdict.
- **Source of truth.** The outcome ledger (`resolution.py`, migration 006).
- **Created by.** The resolver only. **Modified by.** No one.
- **Rendered by.** Same surfaces as Prediction; calibration views only through the
  gated query (never a stored score; scoring nulls are never zeros).
- **May reference.** Its Prediction, subject UID, the sealed records consulted.
- **Never.** Never modifies its prediction; never resolved from in-memory state or
  an unsealed boundary; contradicted outcomes are never hidden to improve
  statistics; invalidated is never counted as failure.

---

### 2.1 Deliberately NOT first-class (and why)

| Not an object | Why | It lives as |
|---|---|---|
| **Article / opinion piece** | Events-not-articles doctrine; opinion may never move conviction | suppressed input; at most the carrier of a corroborated fact |
| **Price tick / market move** | No canonical price source; honesty boundary §3.4 | live display state; excluded from Memory/Prediction until canonicalized by amendment |
| **DerivedNarrative as graph node** | Confidence laundering; no source of truth | O8: derived grouping + sealed snapshots |
| **User saves / follows / preferences** | Personal, not market truth (K7 firewall) | per-user tables; the Saved shelf |
| **Prose (reads, standing views, briefs)** | Voice, not knowledge; regenerated from objects | stage-6 rendering of this model |
| **Frontend graph nodes/edges, profile caches, localStorage histories** | Session projections (K5) | hot read models over this model |
| **Person / Institution / Government / Private company** | No uid scheme + resolver + engine yet | reserved kinds; admission by amendment only (EI Part 1.3) |

---

## PART 3 — THE CANONICAL RELATIONSHIP MAP

### 3.1 The structural chain (Stratum S)

The transmission backbone, with the verbs recorded verbatim by the backend graph:

```
                        REGIME  (conditions every read; owns nothing)
                          │ context
   DRIVER ──drives──▶ THEME ──exposed_to──▶ COMPANY ──member_of──▶ INDUSTRY ──member_of──▶ SECTOR
     │                 │  ▲                                            ▲
     │                 │  │ supports / pressures / correlates          │
     │                 ▼  │ (theme↔theme, theme↔sector)     rotates_into (sector↔sector)
     │              NARRATIVE
     └──anchor_of──▶ (derived: member themes share this driver set;
                      groups themes, asserts nothing new)
```

- `drives` — driver → theme (also theme → sector where recorded). Causal, cited.
- `pressures` — negative-valence causal counterpart, recorded verbatim.
- `exposed_to` — theme → company, from curated `related_assets`. How a thesis
  becomes a position.
- `member_of` — company → industry → sector; narrative membership is
  theme → narrative (derived, snapshot-sealed).
- `supports` / `correlates` / `rotates_into` — recorded verbatim; `correlates` is
  the one symmetric verb (endpoints ordered lexically in rel UIDs).

Every structural link **is an O10 Relationship object** with its own UID, registry
row, snapshots, and transitions — the arrows above are objects, not decoration.

### 3.2 The epistemic chain (W → S)

```
SOURCE ──publishes──▶ EVIDENCE ──corroborates──▶ MARKET EVENT ──evidences──▶ THEME
                                                     │                        (conviction, breadth,
                                                     ├──names──▶ COMPANY       contradiction — the
                                                     │   (companies_direct,    only path news has
                                                     │    recorded, never      into structure)
                                                     │    inferred)
                                                     └──reweights──▶ DRIVER→THEME transmission
                                                         (macro/policy events)
```

A story never adds a node. It adds evidence that may move conviction, breadth, or
relationships — through stage 3, never directly.

### 3.3 The memory and accountability chains (S → M → A)

```
any S-object ──sealed_into──▶ SNAPSHOT ──compared_across_boundaries──▶ TRANSITION EVENT
     │                            ▲                                         │
     │                            │ anchors (before/after)                  │ is Argus's own
     │                            │                                         ▼ reporting (F4, alerts)
     └──subject_of──▶ PREDICTION ──resolved_against sealed records──▶ OUTCOME
                          │                                              │
                          └────────── calibration = derived join ────────┘
IDENTITY REGISTRY underlies every arrow: all references are by UID (K2).
```

### 3.4 The reference law (who may hold whose UID)

Rows may reference columns marked ●; a reference outside this matrix requires an
amendment here.

| holds ↓ refs → | Event | Evidence | Company | Industry | Sector | Theme | Driver | Narrative | Regime | Relationship | Memory | Prediction | Outcome |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Market Event** | ● (merged) | ● | ● (direct) | — | — | ● (interp.) | — | — | — | — | — | — | — |
| **Evidence** | ● | — | — | — | — | ● | — | — | — | ● | — | — | — |
| **Company** | — | — | — | ● | ● | — | — | — | — | ● | — | — | — |
| **Industry** | — | — | ● | — | ● | ● | — | — | — | ● | — | — | — |
| **Theme** | ● | ● | ● | ● | ● | — | ● | ● | — | ● | — | — | — |
| **Driver** | — | — | — | — | — | ● | — | ● | — | ● | — | — | — |
| **Narrative** | — | — | — | — | — | ● (members) | ● (key) | — | — | — | — | — | — |
| **Regime** | — | — | — | — | — | — | — | — | — | — | — | — | — |
| **Relationship** | — | ● | ● | ● | ● | ● | ● | — | — | — | — | — | — |
| **Memory Record** | ● (ev. refs) | ● | ● | ● | ● | ● | ● | ● | ● (gv) | ● | ● (anchors) | — | — |
| **Prediction** | — | — | ● | ● | — | ● | — | ● | — | ● (scope) | ● (provenance) | — | — |
| **Outcome** | — | — | — | — | — | — | — | — | — | — | ● (consulted) | ● | — |

Reading the matrix: memory references everything (it is the record of everything);
nothing references memory except transitions' own anchors, predictions' provenance,
and outcomes' consulted records; **nothing in Stratum W or S ever references
Stratum A** — the model must never see its own predictions as evidence (no
self-confirmation loop).

---

## PART 4 — EVERY SURFACE IS A PROJECTION

### 4.1 The projection law

A surface is a *query shape plus a voice*. It selects objects, orders them for a
person, and renders them in the 4B voice — and that is all. The full statement of
each surface's single responsibility lives in the architecture doc §4; this section
states each surface **as a projection of the objects above**, which is the test any
new surface must pass before it exists.

| Surface | Projection definition (objects in → view out) |
|---|---|
| **Feed** | `MarketEvents (admitted, EventScore-ordered) + TransitionEvents (marked Argus-derived) + Outcome resolutions` → the stream of now. Lead = argmax EventScore, personalization-immune. Renders O1, O11(T), O14; chips link into O3/O6 files. |
| **Event Intelligence** | one `MarketEvent` + its Evidence + its attribution + recorded model impact (the TransitionEvents its cycle produced) → the event *record* (a moment, not a file: no watch, no accruing ledger). |
| **Entity Intelligence** | everything holding one UID: Relationships + MarketEvents naming it + Memory Records + Predictions/Outcomes + kind facets → the file at `/intel/<uid>`. One grammar, kind facets; the terminal projection of the spine onto one subject. |
| **Network** | Stratum S entire: subjects + Relationships + conviction + provenance + memory maturity + the Seal beat (Outcomes) → the model *as structure*. The purest projection; computes nothing. |
| **Markets** | Regime + sector/industry rotation state + theme leaderboards + MarketContext → "what kind of market is this?" Deep reads link to regime/theme/company files. |
| **Memory** | Memory Records + Identity Registry via `/api/memory/v2/*` → "what did we know, and when did it change?" Snapshots, transitions, diffs; gated history everywhere else draws from here. |
| **Prediction** | Predictions ⋈ Outcomes (+ gated calibration query) → "what did we stake, and were we right?" Verdicts unabridged; contradicted outcomes at full prominence. |
| **M&A** | MarketEvents (deal class) + extracted deal Evidence + deal-derived Relationships → the transaction lens. Parties resolve to company files or honest unresolved identities. |
| **Private Markets** | private-markets MarketEvents + capital-flow Relationships → the flow lens over the same ontology. |
| **Listen** | conversation Evidence density per Theme → the confirmation lens. Talk corroborates at low weight; it never becomes structure. |
| **Saved** | per-user refs to UIDs → the personal shelf. Outside the model (K7); reads it, never writes it. |

### 4.2 The projection tests

1. **Definability.** A surface that cannot be written as one row of the table above
   is not a surface; it is either two surfaces or a widget without a question.
2. **Consistency.** The same UID rendered by any two surfaces in the same cycle
   shows the same truth (the EI convergence test, promoted to model law).
3. **Purity.** Delete every surface and the model loses nothing; delete the model
   and every surface is blank. Any content that would survive only in a surface's
   local state is either fabricated (K3) or an unrecorded object that belongs in
   Part 2.
4. **Round-trip.** Every figure a surface prints traces to an object UID and, for
   derived figures, a decomposition. Ink that cannot answer for itself is not
   printed.

---

## PART 5 — THE EXTENSION LAW

Future features extend this model; they never invent parallel structures. The
concrete procedure:

1. **A new kind of thing** (person, institution, government, private company,
   product, …) is admitted only by amendment here declaring: purpose · stratum ·
   lifecycle · uid scheme · deterministic resolver · producing engine · reference
   rights (a row and column in §3.4) · never-rules. No uid scheme + resolver +
   engine, no object — reserved means absent, not stubbed.
2. **A new relationship verb** requires: the fact it asserts, its direction, its
   evidence requirement, and proof it is not a synonym of an existing verb (one
   fact, one edge). It is added to the backend graph's verbatim vocabulary and the
   projection groups in the same change.
3. **A new record type** (Stratum M/A) requires: natural key, writer, sealing rule,
   idempotency rule, and RLS posture — specified in MEMORY_V2 and registered here.
4. **A new surface** requires: its one question, its projection row (§4.1), and the
   architecture doc's three answers (spine stage, single surface, routing rows).
5. **A new data source** (price, consensus, transcripts, options flow) does not
   change this model; it changes what Evidence and honesty boundaries admit — by
   amendment to the boundary it moves (e.g. §3.4 of the architecture for price).

The standing prohibitions, restated once: no object without identity; no identity
by label; no meaning outside stages 3–5; no mutation of sealed or issued records;
no blended confidences across aggregation hops; no derived object wearing recorded
authority; no self-confirmation (Stratum A is never evidence); no personalization
of truth.

## GOVERNANCE

Amendments V1.x for object/verb/kind admissions and reference-matrix changes, each
logged below. Changing the strata, the reference law's direction rules, the
projection law, or the extension law requires V2.0. This document and the canon it
governs change together: an amendment here that touches a lower document's
specialty lands in the same change as that document's own amendment.

| Version | Date | Change |
|---|---|---|
| V1.0 | 2026-07-16 | First canonical knowledge model: four strata, fourteen first-class objects with full object law, the relationship map and reference matrix, surfaces as projections, the extension law. Three V1 decisions canonicalized: (1) `event:cluster:<id>` as the Market Event's canonical UID namespace (wrapping the existing cluster id losslessly); (2) Evidence is reference-only until the atomic evidence log ships, with `evidence:` reserved; (3) "Memory" as a first-class object means the four sealed record types plus the identity registry — never caches or prose. |

---

*Related canon: ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1.md (information flow,
routing, surface responsibility) · ARGUS_INTELLIGENCE_MODEL_V1.md (frontend graph
ontology, confidence factors, evidence classes) · ARGUS_INSTITUTIONAL_MEMORY_V2.md
(record contracts, identity implementation) · ARGUS_PREDICTION_OUTCOME_LEDGER_V1.md
(accountability contracts) · ARGUS_ENTITY_INTELLIGENCE_V1.md (the research surface
grammar) · ARGUS_FEED_EDITORIAL_STANDARD_V1.md (event ranking law) ·
ARGUS_INTELLIGENCE_NETWORK_V2.md (identity, design, interaction).*
