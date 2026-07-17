# ARGUS INSTITUTIONAL REASONING ENGINE V1 (M7.0)

**Status: CANONICAL REASONING CONTRACT + ENGINE AUDIT.** This document audits the
reasoning pipeline as it exists and defines the one engine that transforms a Market
Event into a complete institutional explanation. Every Event Intelligence page,
Entity Intelligence file, Feed story, Morning Brief, Alert, and Network explanation
consumes this engine's output contract; none may implement its own reasoning. Design
and audit only — no production code in this sprint, no page redesigns, no new UI.

**Position in the canon.** Governed by ARGUS_KNOWLEDGE_MODEL_V1 (the objects this
engine reads; it mints none) and ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1 (the
spine; reasoning is the *content* of stages 3–5, and this document is its law).
ARGUS_INSTITUTIONAL_REASONING_V1.md (M3.4) is **not superseded**: the historical-
analog engine it specifies becomes one stage of this engine (R4), consumed verbatim,
gates and all. The Design Bible Part 4B owns the voice explanations are rendered in;
this document owns what an explanation *is*.

**Naming.** "The engine" below means the Institutional Reasoning Engine (IRE) — a
logical contract, not one file. Its stages already exist in scattered form; the
audit names where, and the migration section says what moves where. Nothing here
requires a big-bang rewrite.

---

## PART 1 — AUDIT: HOW ARGUS REASONS TODAY

### 1.1 The inventory (verified against code)

**Backend (canonical, runs whether or not a browser is open):**

| Module | What it reasons | Character |
|---|---|---|
| `app/feeds.py` → `clustering.py` → `events.py` | classification, corroboration, EventScore; `MarketEvent.why_it_matters`, `MarketEvent.transmission` | deterministic scoring; but the two explanation fields are pass-throughs (see R1, R3) |
| `app/summarizer.py` | per-article SUMMARY / WHY IT MATTERS / IMPACT + "Today's Take" | **LLM calls** (temp 0.2, batch of 3, content-hash cached) — the only LLM in the market pipeline |
| `app/causal_chain.py` | theme→theme causal chains from ontology `causal_inputs`/`causal_outputs`, depth ≤ 4 | deterministic, zero LLM — but output is a **prose string** (`"a → b → c"`), not a chain object |
| `app/themes.py` | WMN prominence (multi-story, multi-source, cross-sector gates) | deterministic, honest gates |
| `app/narrative_graph.py` | the recorded relationship graph (verbatim verbs) | deterministic |
| `app/institutional_memory/reasoning.py` (M3.4) | historical analogs: decomposed similarity, outcomes as counts, credibility-gated | the reference implementation of institutional reasoning discipline |
| `app/language_quality.py` | banned-phrase register scoring | **debug-only**; does not gate anything |
| `app/analyst.py`, `app/inference.py` | document-assistant memo generation / CLI chat | different product; firewalled; out of scope |

**Frontend (projections, session-scoped, rebuilt per load):**

| Module | What it reasons |
|---|---|
| `inferenceEngine.ts` | direction verdicts with `reasoningSteps` (claim, evidence, confidence, sourceType) |
| `evidenceEngine.ts` | evidence quality/freshness/independence/cross-confirmation; contradictions; `SOURCE_RELIABILITY` table; verdict + breakdown |
| `causalMap.ts`, `narrativeTransmission.ts` | edge trends, relationship maps, transmission paths |
| `theRead.ts` | the narrative centerpiece (thesis, evidence, chain, watch, falsifiers Z2–Z7) |
| `riskRead.ts` | the ONE shared contradiction/risk/watch/catalyst projection |
| `feedNarrative.ts` | the Feed's voice over the shared ReadVM (injection, not derivation) |
| `morningBriefingEngine.ts` | opportunities, risks, transitions, scorecards from ThemeIntelligence |
| `network/inspector.ts`, `intel/dossier.ts` | DossierVM / EI dossier — pure projections of records |
| `crossIntel.ts` | what/why aggregation (including `firstSentence` string surgery over prose) |
| `predictionEngine.ts` (frontend) | trajectory projections — explicitly NOT the ledger |

### 1.2 The defects (R1–R8)

**R1 — The front door speaks a different epistemology than the house.** The most-read
explanation in the product — a Feed story's "why it matters" — is LLM prose from
`summarizer.py`, copied onto the event (`events.py`: `why_it_matters =
cluster.primary.why_it_matters`). It cites no evidence, decomposes into nothing, is
non-deterministic across cache misses, and renders with the same authority as
recorded facts. Meanwhile every engine behind it (evidence, inference, analogs,
ledger) is deterministic and decomposable. The product's first sentence is its least
institutional.

**R2 — IMPACT labels mint direction at stage 1.** `summarizer.py` emits directional
interpretation ("Bullish for logistics REITs") at ingestion, from an LLM, with no
evidence requirement — violating the descriptive-ingestion invariant (I2) and the
pipeline rule (meaning at stages 3–5 only). No recorded exposure edge is consulted.

**R3 — Transmission is prose, not structure.** `MarketEvent.transmission` is the
strongest linked theme's `causal_narrative` *string*. Consumers cannot walk it, cite
a hop, or confirm every hop is a recorded edge; `crossIntel.firstSentence` doing
string surgery on reasoning output is the smell made visible. The frontend has real
chain objects (`theRead` Z5: "every hop is a real edge") — the backend event
carries a sentence.

**R4 — Split-brain reasoning.** The deterministic reasoning that DOES meet the bar
(evidenceEngine verdicts, inference reasoningSteps, edge trends, falsifiers) lives
only in the browser, session-scoped, computed over the frontend graph — while the
archive records honest nulls for exactly those fields (M3.2 §16.1). An Event
Intelligence record and a Feed card can reason differently about the same event
because there is no single reasoning pass either can cite.

**R5 — Four confidence languages, no shared decomposition.** EventScore
(Base × Corroboration × Relevance × Decay), backend theme confidence, evidenceEngine
verdicts (strong/moderate/weak/insufficient_signal), inferenceEngine blended 0–100.
Each is individually defensible; no contract relates them, and no consumer can
decompose one into another. The knowledge model's K-invariants require one
decomposable confidence *grammar* even where scales differ.

**R6 — Contradiction is an afterthought of ingestion.** The event pipeline has no
contradiction stage: a story that cuts against a standing thesis simply scores and
ranks; nothing asks "what does this weaken?" at the spine. Contradiction machinery
exists only frontend-side (weakens edges, riskRead, evidence-engine contradictions)
and count-based in memory. The symmetric obligation — every reasoning pass searches
for weakening evidence with the same effort as supporting — is nowhere enforced.

**R7 — The Morning Brief is designed to never be quiet.** `morningBriefingEngine.ts`,
verbatim: *"All functions are designed to always return meaningful content — tiered
thresholds with fallbacks prevent blank sections."* That is the anti-pattern the
quiet-day rule bans: fill beats floor, in the one artifact that most needs to be
trustworthy at 7am. (The B3 Read work fixed catalysts — `verifiedCatalystsFor` — but
the engine's fallback-tier design remains.)

**R8 — The register gate watches and does nothing.** `language_quality.py` encodes
the institutional register (banned phrases with alternatives) but is debug-only.
LLM prose ships to users unchecked by the one module built to check it.

### 1.3 What already meets the bar (build on, do not rebuild)

The M3.4 analog engine is the discipline this document generalizes: deterministic,
decomposed similarity with null components excluded (both-empty is never agreement),
outcomes as "N of M" counts, censoring flagged, credibility-gated with shortfalls
listed, `insufficient_history` as a designed state. The prediction ledger's
admission/resolution split, the evidence engine's verdict + breakdown shape, The
Read's humility rule (a thesis never renders without falsifiers; missing falsifiers
are themselves flagged), and riskRead's consolidation pattern are all correct and
are promoted below from module conventions to product law.

---

## PART 2 — THE ENGINE: SEVEN REASONING STAGES

The engine answers one question: **given a Market Event, what is the complete
institutional explanation?** It reads knowledge-model objects (strata W/S/M/A),
computes once at the spine, and emits one Explanation object per subject. It mints
no canonical objects: anything it detects that deserves persistence (a transition,
a contradiction, a prediction trigger) is emitted through the existing stage-4/5
writers. An Explanation is derived and cacheable — never stored as truth, always
recomputable from the records it cites.

Stages run in order; each consumes recorded objects plus prior stages' outputs;
each may halt the ladder with a designed uncertainty state (Part 5) instead of
guessing. The same ladder runs entity-first (Entity Intelligence asks about a UID;
stage R0 then anchors on the file instead of an event) — one engine, two entry
points.

**R0 · IDENTIFY — what happened.**
Inputs: the MarketEvent (class, first-seen, lane), resolver-named companies
(`companies_direct`), interpreted theme links, attribution classes (direct / peer /
industry_exposure / theme_exposure — recorded reasons, never inferred).
Output: the factual identity block. Nothing interpretive; nothing beyond the record.

**R1 · CORROBORATE — how we know.**
Inputs: the cluster's source list with tiers and qualification, evidence `kind`
(sec_filing / transcript / ir_release / news), lane (`developing` vs corroborated),
corroboration velocity. The engine consumes the Wire desk's work verbatim — it never
re-counts sources. Output: the evidence block, quality-tiered, with independence
stated (distinct qualified sources, not raw counts).

**R2 · LOCATE — where it sits in the model.**
Inputs: the recorded graph. The event's themes, their drivers, the regime, and the
**transmission chain as a typed path object** — an ordered list of recorded
Relationship UIDs (`driver → theme → company/industry`), every hop citable, no hop
invented. Replaces the `transmission` prose string (R3). If the event touches no
recorded structure, that is the finding: "not connected to any standing thesis" is
an institutional answer, not a failure.

**R3 · ASSESS — what it changes, in both directions.**
The symmetric stage (fixes R6). For every located theme and relationship the engine
evaluates support AND opposition with equal effort: does this evidence confirm the
standing belief, weaken it, or neither? Outputs: recorded-state deltas where they
exist (conviction/breadth movement, relationship changes — read from what stage 3–4
actually wrote, never re-derived), a contradiction assessment (Part 6), and — first-
class — **"this changes nothing"** when thresholds did not move. The quiet answer is
a complete answer.

**R4 · CONTEXTUALIZE — what history says.**
Inputs: the M3 archive (the subject's file: first seen, persistence, prior
transitions) and the M3.4 analog engine, consumed with its gates intact.
`insufficient_history` renders verbatim; below-gate analogs never leak. Output: the
memory block — "Argus has tracked this theme for N sealed days; the last comparable
episode…" or the honest gate state.

**R5 · STAKE — what is on the record.**
Inputs: the prediction ledger. Which open predictions name this subject or its
relationships (what Argus has staked that this event tests), which outcomes resolved
on it, calibration state (gated). The engine never issues predictions — issuance
stays in the ledger under its admission rules; the engine *reports the stakes* and
may emit an issuance trigger through the ledger's own gate. Output: the
accountability block.

**R6 · COMPOSE — the Explanation object.**
Assembles stages R0–R5 into the typed contract of Part 3, computes the decomposed
confidence (Part 4), attaches falsifiers (what would change this read — from
recorded invalidation conditions and weakens-edges; if none exist, that absence is
itself stated, per the humility rule), and stamps provenance (engine version, graph
version, record ids consulted). **Data, not prose:** consumers render in their own
voice; every string template lives at the surface edge under 4B; the engine's output
is decomposable structure.

LLM prose has exactly one lawful place after this design: **labeled voice riding
NEXT to a deterministic explanation, never inside it and never as it** (the
theRead.ts rule, promoted to law). `summarizer.py`'s summary may survive as the
labeled color it is; its WHY IT MATTERS and IMPACT fields are superseded by R2/R3
outputs and retire from authority (migration, Part 9).

---

## PART 3 — REQUIRED OUTPUTS: THE EXPLANATION CONTRACT

One typed object, eight sections. Every section is status-wrapped
(`live | partial | unavailable | gated`) with a machine-readable reason — the
ProfileSection honesty pattern, promoted to contract. A consumer must branch on
status; an `unavailable` section renders as a designed absence, never a default.

| # | Section | Contains | Must answer |
|---|---|---|---|
| 1 | **Identity** | event class, subjects (UIDs), attribution with recorded reasons, first-seen, lane | "What happened, to whom?" |
| 2 | **Evidence** | tiered source list, kinds, independence count, developing/corroborated state | "How do we know?" |
| 3 | **Position** | theme links, transmission chain as recorded-edge path objects, regime context | "Where does this sit in the model?" |
| 4 | **Delta** | recorded state changes (or the explicit quiet answer), thresholds crossed | "What did it change?" |
| 5 | **Counter** | contradiction assessment: what this weakens, what weakens it, unresolved standing contradictions | "What cuts against this?" |
| 6 | **Confidence** | one decomposed confidence per claim, per Part 4 — never a bare number | "How sure are we, and why?" |
| 7 | **Memory** | file context + gated analogs (M3.4 payload verbatim) | "Has this happened before?" |
| 8 | **Stakes & falsifiers** | open predictions tested, resolved outcomes, invalidation conditions; absence of falsifiers flagged | "What is on the record, and what would change our mind?" |

Ordering is fixed (it is the dossier's Answer Order, generalized); consumers may
truncate depth but never reorder, and a consumer that renders section 4 or 6 must
render (or link one tap deep to) sections 2 and 5 — benefit claims never travel
without their evidence and their countercase.

---

## PART 4 — CONFIDENCE RULES

1. **Three numbers stay distinct** (existence, directional conviction, relationship
   confidence — INTELLIGENCE_MODEL §6.1). The Explanation never blends them without
   a label.
2. **One grammar for every confidence figure:** bounded 0–100 or a named verdict
   band; monotone in its factors; deterministic (same records → same number);
   **decomposable on demand** into the seven factors (quality, quantity,
   independence, recency, market confirmation capped as confirmatory-only,
   persistence, contradictions). A figure that cannot return its decomposition may
   not be displayed. EventScore keeps its own formula (it ranks; it does not
   believe) — but it, too, must decompose, and no surface may present EventScore as
   belief.
3. **The weakest-hop rule.** A transmission chain's confidence is capped by its
   weakest recorded hop. Chains never average up; a strong driver and a strong
   company do not rescue a weak middle edge.
4. **The honest floor.** Below minimum evidence, output `insufficient_signal` —
   a state, not a small number. Below the analog gates, `insufficient_history`.
   Never numerically encode ignorance.
5. **Asymmetry.** Confidence is slow to gain, fast to lose; unresolved
   contradictions cap the maximum verdict (they do not merely subtract).
6. **No probabilities without a decomposable canonical method** (the M3.3 rule,
   product-wide): none exists, so no Explanation carries a probability.
7. **Independence beats repetition.** Two independent qualified sources outrank
   five restatements; the decomposition must show source-distinct counts.

## PART 5 — UNCERTAINTY HANDLING

Uncertainty is a designed output, not an error path. The closed vocabulary:

| State | Meaning | Rendering law |
|---|---|---|
| `insufficient_signal` | evidence below floor | state it plainly; never a low score |
| `insufficient_history` | analog gates unmet | verbatim, with shortfalls listed |
| `developing` | single qualified source | labeled lane; excluded from lead/slots; auto-promotes |
| `contested` | unresolved contradiction active | verdict capped; both sides cited |
| `data_gap` | writer/provider absence proven | "unresolvable", never a negative verdict |
| `not_connected` | event touches no recorded structure | a finding, stated as such |
| `reserved` | kind/source not admitted | designed not-covered state; no stub |
| `quiet` | thresholds unmoved | "this changes nothing" as a complete answer |

Rules: uncertainty states propagate (a section built on a gated input is itself
gated, with the reason chained); they are never silently downgraded to empty
strings; and no fallback tier may replace an uncertainty state with filler content —
the R7 defect is the canonical violation. **Fill never beats floor.**

## PART 6 — CONTRADICTION HANDLING

1. **The symmetric obligation.** Every reasoning pass searches for opposition with
   the same machinery it uses for support (stage R3). An engine that only looks for
   confirmation is a marketing engine.
2. **Contradiction is additive and visible.** Weakening evidence appends its own
   trail; it never silently decrements a counter. Both sides remain citable forever.
3. **Contradictions cap, then surface.** An active contradiction caps the claim's
   verdict AND must appear in the Explanation's Counter section of every consumer
   that shows the claim — a drawer may not show conviction 78 while the file shows
   the contradiction that caps it.
4. **Resolution is recorded, not edited.** A contradiction resolves by a new record
   (superseding evidence, an outcome, an identity-lifecycle event) — never by
   deleting the contradicting trail.
5. **Self-contradiction is reportable.** When two recorded claims oppose each other,
   the engine reports `contested` on both; it never picks a winner without a rule it
   can cite.
6. **The humility rule** (from The Read, now law): no thesis renders without its
   falsifiers; when no falsifier is recorded, that absence is surfaced as a warning,
   because an unfalsifiable read is the weakest kind.

## PART 7 — EXPLANATION STANDARDS: WHAT "INSTITUTIONAL-QUALITY" MEANS

An explanation is institutional-quality when it passes all seven:

1. **Cited or absent.** Every claim resolves one tap deep to record UIDs. Ink that
   cannot answer for itself is not printed.
2. **Decomposable.** Every figure returns its factors; every chain returns its hops;
   every analog returns its components. Nothing is "just a number".
3. **Deterministic.** Same records, same explanation, byte-identical. LLM text never
   sits inside the explanation — at most beside it, labeled as voice.
4. **Symmetric.** The counter-case is present with the case. A reader can always see
   what cuts against the read.
5. **Falsifiable.** The explanation states what would change the conclusion, or
   flags that nothing recorded would — and treats that as a weakness.
6. **Quiet-capable.** "Nothing changed" and "we don't know" are complete, designed
   answers, rendered with the same craft as strong signals.
7. **In register.** The 4B voice: numbers over adjectives, absence stated plainly,
   no hedging fog, no news-copy phrasing. `language_quality.py` is promoted from
   debug scoring to an acceptance gate on every template a consumer ships (a build
   check on surface strings, not a runtime mutation).

The morning-meeting test binds: a professional must be able to read any Explanation
aloud to a desk and defend every sentence by pointing at a record.

## PART 8 — WHAT MUST NEVER BE FABRICATED

The consolidated ban list. No engine output, and no consumer rendering of it, may
ever contain:

- **LLM-minted meaning wearing reasoning's authority** — no generated "why it
  matters", no generated impact direction, no generated thesis. Voice is labeled
  and lives beside, never inside (R1/R2 retire).
- **Direction without a recorded basis** — a bullish/bearish claim requires a
  recorded exposure edge plus evidence; price action alone never creates causality.
- **Chain hops that are not recorded edges** — no invented intermediaries, ever.
- **Probabilities, price forecasts, or "outperformed"** — the M3.3/M3.4 boundaries,
  product-wide.
- **Filled quiet days** — no fallback tier, no padded section, no manufactured
  urgency; the R7 pattern is banned everywhere.
- **Confidence without decomposition; ignorance as a small number.**
- **Analogs below the gates; history that predates the archive; backdated anything.**
- **Blended member values** (narrative-level confidence, summed member evidence).
- **A hidden contradiction** — showing a claim while suppressing its active counter.
- **Un-labeled derived content** — derived narratives, regimes, attributions always
  carry their derived nature.
- **Explanations for the un-admitted** — reserved kinds and unresolved identities
  get designed absence, never a thin fake read.

## PART 9 — THE CONSUMPTION CONTRACT AND MIGRATION

### 9.1 One engine, six consumers

| Consumer | Entry point | Renders (of the 8 sections) | Depth |
|---|---|---|---|
| **Feed story** | `explain(event)` | 1–3 summary lines + status chips; 5/6 as affordances | shallow; links to record |
| **Event Intelligence** | `explain(event)` | ALL — the record IS the rendered Explanation | full |
| **Entity Intelligence** | `explain(uid)` | all, accumulated per file (Standing View voices §3–4; Event Record lists §1–2 per event) | full, per-UID |
| **Morning Brief** | `explain(uid)` over the dominant narrative + movers | 3, 4, 5, 8 — deltas and stakes since yesterday; quiet-capable | medium |
| **Alert** | a TransitionEvent + `explain(subject)` | 4 (the change) + 2 (provenance one tap deep) | one screen |
| **Network explanation** | `explain(uid)` / `explain(rel_uid)` | 3 (chains), 5, 6, 8 — the inspector dossier sections | embedded dossier |

Consumers may truncate and voice; they may not compute, reorder, or substitute. Two
consumers rendering the same subject in the same cycle show the same sections with
the same statuses — the EI convergence test extended to reasoning.

### 9.2 Migration (in spine order, each independently shippable)

| Phase | Scope | Retires |
|---|---|---|
| **IRE-1** | Backend Explanation assembly for events: R0–R2 from existing records (identity, evidence, typed transmission chains replacing the prose string) served on `MarketEvent` | R3 (prose transmission); `crossIntel.firstSentence` surgery |
| **IRE-2** | R3 assessment + contradiction stage at the spine; symmetric search; quiet answer | R6 |
| **IRE-3** | Confidence grammar unification: decomposition contract over EventScore, theme confidence, verdicts | R5 |
| **IRE-4** | R4/R5 blocks (memory + stakes) composed in; M3.4 and the ledger consumed verbatim | — |
| **IRE-5** | Consumer migration in EI-doc order (Event record → Entity files → Feed cards → Network inspector → Morning Brief rebuilt on `explain()` with quiet capability → Alerts when they ship) | R7 (fallback tiers); R1/R2 (LLM fields demoted to labeled voice) |
| **IRE-6** | `language_quality.py` promoted to a template acceptance gate | R8 |

The frontend engines (evidence, inference, causal map, riskRead, theRead) are not
deleted: they are the working prototypes of stages R1–R3/R6 and become renderers of
(then thin caches over) backend Explanations as IRE phases land — the same
demotion path localStorage memory took when the archive shipped.

## GOVERNANCE

This is the canonical reasoning contract. Amendments V1.x for new sections, stages,
uncertainty states, or consumers; changing the stage order, the section order, the
confidence grammar, or Part 8 requires V2.0. A feature that renders market reasoning
must name, in writing, which Explanation sections it consumes and at what depth; a
feature that cannot is computing meaning locally and is rejected. This document and
the knowledge model change together where they touch (an Explanation is a derived
read, never a stratum object; if that ever changes, both documents amend in one PR).

| Version | Date | Change |
|---|---|---|
| V1.0 | 2026-07-16 | Engine audit (R1–R8); the seven-stage ladder (R0–R6); the eight-section Explanation contract; confidence grammar, uncertainty vocabulary, contradiction law, institutional-quality standards, the fabrication ban list; consumption contract for six surfaces; IRE-1…6 migration. M3.4's analog engine incorporated as stage R4, unchanged. |

---

*Related canon: ARGUS_KNOWLEDGE_MODEL_V1.md (the objects reasoned over) ·
ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1.md (the spine and pipeline rule) ·
ARGUS_INSTITUTIONAL_REASONING_V1.md (M3.4 analogs — stage R4 of this engine) ·
ARGUS_PREDICTION_OUTCOME_LEDGER_V1.md (stage R5's records) ·
ARGUS_FEED_EDITORIAL_STANDARD_V1.md (EventScore; ranking vs believing) ·
ARGUS_ENTITY_INTELLIGENCE_V1.md (dossier grammar; Answer Order) ·
ARGUS_INTELLIGENCE_NETWORK_V2.md Part 4B (the voice at the edge).*
