# ARGUS V2 — INSTITUTIONAL EXPERIENCE ARCHITECTURE

**Status: Chapter 1 (Vision) — APPROVED. This document is the canonical experience-layer apex (its rank is ratified at that scope; see below). Later chapters are pending. It inherits, and never overrides, the existing technical canon.**

This document defines the **experience-layer vision** for Argus V2: what Argus is becoming as a
product, how the parts cohere into one experience, and the durable principles future architecture
and product decisions can be tested against. It is being written one chapter at a time.

### Position in the canon (read before treating anything here as authority)

This document is the **canonical experience-layer apex**: it governs how users *experience and
interact with* Argus intelligence — the surfaces, their behavior, their coherence, and the target
experience. Its authority is ratified at that scope, and only that scope. It **inherits, and never
overrides,** the existing technical canon, and it claims **no authority over the object universe,
the reasoning contract, or the intelligence spine.** It defers, without exception, to the V2.0-gated
cores it depends on:

- `ARGUS_KNOWLEDGE_MODEL_V1` (M6.0) owns the **object universe** (what exists, its laws, identity,
  relationships). Nothing here introduces or redefines an object, relationship verb, or identity
  scheme; anything that appears to must land as an amendment there.
- `ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1` owns the **six-stage spine** (Observe → Corroborate
  → Interpret → Remember → Test → Explain), the routing matrix, and the eight non-negotiables. This
  document restates them at the experience level; it does not amend them.
- `ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1` (M7.0) owns the **reasoning contract** — `explain(event)`
  / `explain(uid)` / `explain(rel)`, the R0–R6 ladder, and the eight-section Explanation. This
  document treats that contract as the substance every experience renders.
- `ARGUS_INTELLIGENCE_NETWORK_V2` (the **Design Bible**) owns **visual identity, form language, and
  interaction**. Where this document speaks about how Argus should *feel*, the Bible remains the
  authoritative expression of product intent; this document names principles, never pixels.
- `ARGUS_INSTITUTIONAL_MEMORY_V2`, `ARGUS_ENTITY_INTELLIGENCE_V1`, `ARGUS_FEED_EDITORIAL_STANDARD_V1`,
  `ARGUS_MORNING_BRIEF_V2` / `ARGUS_NARRATIVE_CENTERPIECE_V1` ("The Read"), and
  `ARGUS_EARNINGS_INTELLIGENCE_V1` each retain their stated specialties.

**A new top-level surface, object, or product (e.g. Universal Search, a Workstation, a promoted
Prediction Ledger destination) is a proposal in this document, not a fact.** Each must clear the
existing gates before it is real: the Knowledge Model's extension law for objects, the Master
Architecture's three-question test for surfaces (which spine stage, which single surface, which
routing rows), and the Design Bible's identity gates for anything visible. These land in later
chapters, not here.

### Chapter index

- **Chapter 1 — Vision** *(this chapter; drafted)*
- **Chapter 2 — The Unified Intelligence Experience** *(the projection model across surfaces; drafted)*
- **Chapter 3 — Intelligence Network 2.0** *(drafted; extends the Design Bible)*
- **Chapter 4 — Entity Intelligence & the Company experience** *(drafted; a **deepening of the existing Entity Intelligence dossier / company-kind grammar**, never a second company-specific intelligence architecture)*
- **Chapter 5 — Universal Search & Navigation** *(APPROVED; new-surface proposal)*
- **Chapter 6 — Accountability & the Prediction Ledger's placement** *(APPROVED — founder decisions K-1…K-6)*
- **Chapter 7 — The Product Family: Intelligence, Workstation, Mobile** *(APPROVED — founder decisions L-1…L-11)*
- **Chapter 8 — Experience & Aesthetic Principles** *(APPROVED — founder decisions O-1…O-13; reconciled with the Design Bible)*
- **Chapter 9 — Learning, Personalization & User Intelligence** *(APPROVED — founder decisions UI-1…UI-13)*
- **Chapter 10 — Architecture Closure & Build Sequence** *(drafted — pending founder approval; the architecture-to-execution bridge)*

Chapters 3–8 are named here only to fix the destination. This chapter is deliberately **not** a
feature specification; where it names a future capability it does so to set direction, and marks
the decisions it does not make.

---

## Chapter 1 — Vision

### 1.1 What Argus ultimately is

**Argus is a market intelligence operating system: a single, continuously maintained model of
market structure, made legible through many surfaces, that reasons from events to their
consequences and keeps a record of its own thinking.**

This is an evolution of the already-canonical definition (*"Argus is an institutional market
reasoning system… it continuously constructs a model of market structure from evidence, maintains
it with institutional memory, tests it on the record, and explains it in structure and language a
professional can interrogate."* — Master Architecture). Chapter 1 changes emphasis, not substance:
the earlier docs establish that Argus *has one model*; this document commits to the *experience* of
living inside that model — surfacing what matters, explaining why, and letting a professional
interrogate it to any depth.

Two terms need discipline before they become load-bearing:

- **"Operating system" (resolved, U2).** The **"market intelligence operating system"** names
  **Argus as a whole** — the entire product, not any one surface. The **Intelligence Network** is
  reframed as Argus's **canonical interactive visual intelligence layer/environment**: the
  structural home and primary surface through which the model is explored, but *not itself* the
  operating system. This reconciliation does **not** rewrite the approved Network Design Bible,
  which currently words the Network as *"the visual operating system of the platform."* That exact
  wording stands until amended and will require an **explicit, governed amendment** to the Bible to
  align it with this terminology (flagged, not made here — see 1.10, A1).
- **"Website."** Argus is ceasing to be a website in the sense of pages-you-browse; it is becoming
  a place you *consult*. The unit of value is not a page view — it is an answered question.

### 1.2 The problem Argus exists to solve

Markets produce far more information than any professional can convert into understanding. The
existing tools split into two failing shapes:

1. **Information products** (news, terminals, data feeds, chart tools) deliver *more* — more
   headlines, more tickers, more panels — and leave the reasoning to the reader. They are fast and
   comprehensive and structurally incapable of telling you *what it means*.
2. **Answer products** (chatbots, AI summaries) deliver a fluent sentence and no accountable
   structure beneath it. They cannot show their evidence, cannot say what would change their mind,
   and cannot remember what they told you yesterday. A confident summary with no falsifier is
   indistinguishable from a good guess.

The gap between them is the job: **turning a continuous stream of events into a maintained,
evidenced, falsifiable understanding of what is changing and what it implies.** That is what no
existing product does well, and it is the only thing Argus should try to be excellent at.

A blunt internal finding sharpens the problem statement. Argus's own audits
(`ARGUS_OBSERVATION_PIPELINE_AUDIT_V1`, and defect R4 "split-brain" in the Reasoning Engine) record
that **Argus already computes this understanding and then fails to consume it** — the canonical
reasoning ships and surfaces re-derive weaker versions locally, and in several places fabricate
(fake catalysts, an LLM's self-scored "confidence," a fake live tape, "sessions" that are five
minutes long). So the problem V2 solves is not only external (the market's complexity) but
internal: **make every surface a faithful projection of the one model, and delete every place that
invents.** The most dangerous competitor to Argus's credibility is Argus's own fabrication.

### 1.3 The fundamental product thesis

**The event is the trigger; the maintained network of evidenced consequences is the product.**

An event — an earnings surprise, a policy move, a geopolitical development, an M&A transaction, a
macro release, a material company development — should enter Argus as fast as is reasonable, and a
high-priority event relevant to a user should surface rapidly in that user's briefing. But the
event itself is commodity; wire services already deliver events. Argus's value begins the moment it
connects the event into its standing model and answers, once and citably, the questions the
Reasoning Engine already formalizes as the R0–R6 ladder and The Read formalizes as Z1–Z7:

> **What happened · how we know · where it sits · what it changes (both directions) · what history
> says · what is now on the record · and what would prove us wrong.**

Three commitments make this thesis honest rather than grandiose:

- **Surfacing over hunting.** Argus should never make a user navigate Industries → sector → company
  to reach intelligence that already exists. What matters comes to the user; depth is available on
  demand. (This is the founder's clearest experience mandate and the motivation for Universal
  Search — Chapter 5.)
- **Consequences must be evidenced or typed-absent, never asserted.** A "network of consequences"
  is only an asset if every edge is backed by evidence or explicitly marked absent
  (`insufficient_signal`, `not_connected`, `data_gap` — the Reasoning Engine's uncertainty
  vocabulary). An unevidenced consequence graph is the *worst* version of this product: it looks
  authoritative and is wrong. The thesis is therefore inseparable from the no-fabrication law.
- **The falsifier travels with the claim.** Every forward-looking statement carries what would
  invalidate it. This is already canon ("Confidence without a falsifier is marketing"); V2 makes it
  an experience-wide, non-optional rendering rule, not a section that can be dropped.

### 1.4 What Argus is explicitly not

Argus's differentiation is as much in what it refuses as in what it builds. Argus is **not**:

- **A faster news reader.** More or fresher headlines is not the product; the reasoning downstream
  of the headline is.
- **A dashboard.** *"A dashboard is many small products in boxes; Argus is one product seen through
  many windows"* (Master Architecture). Grids of KPI cards are explicitly banned by the Design Bible.
- **A stock screener or a charting app.** Price is *"the last, most compressed expression"* of the
  causal chain (Intelligence Model), not the subject. Charts may appear as **descriptive evidence**;
  they may never become the product. (This constrains the "richer charting" ambition — see 1.10, U7.)
- **A chatbot.** A fluent answer with no interrogable structure beneath it is the thing Argus exists
  to replace, not to become. Language is voice over structure, never structure itself.
- **A Bloomberg clone.** *"Feature-matching Bloomberg is a strategy for becoming a worse Bloomberg"*
  (Design Bible). This is the single greatest risk to the Workstation ambition (1.7): a professional
  desktop product that competes on breadth of panels rather than depth of understanding would
  abandon the only ground Argus can win on.
- **A predictor of prices.** Argus records forward-looking claims to *hold itself accountable*, not
  to emit trading signals. The Prediction & Outcome Ledger deliberately carries no probabilities and
  no price forecasts, and stays silent until credibility gates pass.

### 1.5 What makes Argus defensible

Speed, data breadth, and model quality are all rentable and all being commoditized. Argus's
defensibility must come from properties competitors structurally lack:

1. **One maintained model instead of per-view computation.** Because meaning is computed once, in
   the pipeline, and every surface projects it, Argus can be internally consistent — two surfaces
   disagreeing is a severity-one defect. A collection of independently-reasoning pages (or three
   independently-reasoning products) can never make that guarantee. Consistency at scale is a moat.
2. **Institutional memory.** Argus remembers what it believed, what changed, what it predicted, and
   what happened — sealed, append-only, and re-readable at any past date. Stateless products
   (chatbots, most terminals) structurally cannot open with *"here is what changed since yesterday's
   beliefs."* Memory compounds; a competitor starting today cannot buy Argus's accumulated record.
3. **Accountability as a feature, not a liability.** Argus keeps a falsifiable record of its own
   reasoning and is willing to show where it was wrong. Over time this is the credibility no
   confident-but-unaccountable product can match — *provided* the ledger is gated honestly until it
   has signal (it is, today, structurally empty; see 1.4 and 1.10, U4).
4. **Evidence and provenance as load-bearing.** Every claim decomposes to sources or is typed as
   absent. This is slow to build and easy to skip; a competitor optimizing for demo polish will skip
   it, and that is precisely the gap Argus occupies.
5. **A distinctive, legible experience.** The Design Bible's form language is meant to make a
   logo-less screenshot unmistakably Argus. Experience distinctiveness is defensible *only if it
   serves legibility* — decoration is not a moat (see 1.6 and 1.8).

None of these is defensible in isolation; the moat is their *combination held to one model*. The
fastest way to destroy all five at once is to let a surface (or a second product) compute its own
truth.

### 1.6 The relationship between intelligence and presentation

This is the load-bearing law of the whole architecture, restated here so no experience decision can
forget it:

> **Argus has exactly one understanding of the market at any moment. Every surface is a window onto
> it. No surface computes its own truth; surfaces select, rank, phrase, and render.**

Presentation is not subordinate — a premium, legible, alive experience is a first-class goal of V2
— but it operates on a strict boundary: **surfaces may be as smart as they like about presentation
and must be dumb about meaning.** Concretely:

- Intelligence semantics (scores, verdicts, confidence, narrative, evidence, deltas, predictions)
  live in the pipeline's stage-3–5 engines, with tests. A surface that computes any of these is an
  architecture violation — the "second brain" the canon forbids.
- The LLM writes **voice, never facts.** An LLM-authored number displayed as intelligence (e.g. a
  self-assessed confidence score) is a fabrication and must not appear.
- Personalization **ranks and prioritizes; it never rewrites.** The lead event is market truth and
  is identical for every user; relevance is an additive annotation, never a filter that changes what
  is true.

"Premium" in V2 therefore has a specific, testable meaning: **premium is legibility, hierarchy, and
aliveness in service of understanding — not ornament.** Motion should encode change and only change;
contrast and color should encode meaning, not attract attention for its own sake. The experience the
founder admires in reference products (strong contrast, controlled color, subtle lighting, large
primary work areas, excellent hierarchy, information that feels alive) is adopted as a set of
*principles*, not a visual identity — and any concrete direction must reconcile with the Design
Bible's already-approved, protected form language rather than restyle over it (see 1.10, U6). Argus
should learn how great products make information feel alive; it should copy no other product's
identity.

### 1.7 The long-term product family

Long term, Argus is one intelligence consumed through several experiences — not several
intelligences. The unifying law is non-negotiable and precedes any product decision:

> **All Argus experiences consume the same canonical intelligence and data services. There is one
> model, one memory, one reasoning contract. A new experience is a new *client*, never a new brain.**

Within that law, three experiences are envisioned:

- **Argus Intelligence** — the current web product, evolving into the primary intelligence and
  research experience (the Network as its spine, the briefing as its front door, the Entity
  dossier as its depth). This is where V2 work begins.
- **Argus Workstation** — a future professional desktop experience for intensive workflows:
  configurable workspaces, multiple charts, market/economic data, intelligence, watchlists, network
  views, calendars, eventually multi-monitor. It is *a delivery form of the one model*, not a new
  product with new reasoning. **This is the highest-risk item in the vision** (1.4): a workstation
  that competes on panel breadth becomes the "worse Bloomberg," and a workstation built before the
  model-consumption gap is closed would almost certainly grow a second brain. Its sequencing is an
  open decision (1.10, U5); the safe default is *last, and only over shared services*.
- **Argus Mobile** — a purpose-built mobile experience for briefing, alerts, saved intelligence,
  quick lookup, and monitoring — *not* a shrunken desktop. This is consistent with the existing
  canonical position for Mobile (Surfaces §7: brief + drawer-depth reads, investigation deferred to
  desktop); V2 enriches that role, it does not redefine it.

The danger this section exists to prevent is three products silently diverging into three
understandings. The safeguard is architectural, not cultural: the shared-services boundary must be a
hard constraint enforced in code, or the moat in 1.5 dissolves.

### 1.8 Durable principles

These are the tests a future architecture or product decision must pass to be consistent with the
V2 vision. They are stated so a proposal can be checked against them; several restate existing
non-negotiables at the experience level, by design. A "no" on any of these is a reason to stop.

- **P1 — One model, many windows.** Does this surface/product project the single canonical model,
  or does it compute meaning locally? Local computation is rejected.
- **P2 — Surface what matters; never make the user hunt.** Does important, relevant intelligence
  come *to* the user, with depth on demand — or does it require navigation to discover?
- **P3 — The event is the trigger, the consequence network is the product.** Does this connect an
  event into the standing model (what changed, why, what it affects, what next), or does it stop at
  presenting the event?
- **P4 — Evidenced or typed-absent, never asserted.** Is every claim and every edge backed by
  evidence or explicitly marked absent? Fabrication — including plausible-looking invented data — is
  a severity-one *experience* defect, not a cosmetic one.
- **P5 — The falsifier travels with the claim.** Does every forward-looking statement render what
  would invalidate it? A confidence without a falsifier does not ship.
- **P6 — Change before state.** Does the experience lead with what changed since the user's last
  beliefs, rather than re-describing a static snapshot?
- **P7 — Accountability outranks narrative pride.** Are predictions and outcomes preserved and
  reachable, including where Argus was wrong — and gated honestly when signal is insufficient?
- **P8 — Personalization ranks; it never rewrites.** Does personalization only re-order and
  prioritize, leaving market truth identical for every user?
- **P9 — Premium means legibility, not ornament.** Does the visual/interaction choice increase
  understanding (hierarchy, contrast-as-meaning, motion-as-change) — or is it decoration? And does
  it reconcile with the Design Bible rather than restyle over it?
- **P10 — One intelligence, many clients.** Does a new experience consume the shared canonical
  services, or does it risk a second brain?
- **P11 — Voice, never facts, from the LLM.** Is the language layer writing prose over
  engine-computed structure — never minting numbers, directions, or verdicts?
- **P12 — Extend through the gates, don't route around them.** Does a new object clear the Knowledge
  Model's extension law, a new surface the Master Architecture's three-question test, and anything
  visible the Design Bible's identity gates?

### 1.9 Where this vision challenges itself

Per the mandate to challenge rather than flatter the vision, the tensions that are real and must be
resolved (not hand-waved) in later chapters:

1. **The consequence network can become a fabrication engine.** The most seductive failure mode is a
   dense, beautiful graph of consequences that are not evidenced. The audits show Argus already does
   versions of this (a counterevidence search that can never match; direction minted at ingestion).
   The thesis in 1.3 is only safe when yoked to P4/P5; a "network of consequences" pursued for visual
   richness would be the most dangerous product Argus could build.
2. **"Terminal / Workstation" pulls toward the genre Argus refuses.** The founder wants an
   institutional-terminal-grade workstation and richer company charting; the canon bans becoming a
   Bloomberg/dashboard clone. These are reconcilable only if "terminal" means *the one model,
   deepened and made workflow-grade* — specifically, the **existing Entity Intelligence dossier's
   company-kind grammar deepened, never a second company-specific intelligence architecture** — with
   charts as evidence, not feature parity with incumbents. If Argus starts matching panels, it has lost.
3. **Three products risk three brains.** "One intelligence, many experiences" is correct and is also
   the hardest thing to actually hold. It is an aspiration until the shared-services boundary is a
   hard, enforced constraint; stated softly, it fails.
4. **Accountability shown too early undermines the very credibility it's meant to build.** A
   Prediction Ledger promoted to a destination while it is structurally empty (or low-signal) would
   showcase Argus's weakest surface. Accountability should stay woven and gated until it has a record
   worth standing behind.
5. **A distinctive aesthetic can drift into decoration and into conflict with the approved identity.**
   The reference-product principles are worth learning; taken as license to restyle, they collide
   with the Bible's protected form language. Principle, not repaint.

### 1.10 Open / unresolved decisions

Most of these are deliberately **not** answered in Chapter 1. Each open item is a decision for a
later chapter and, in most cases, an amendment through an existing gate. They are recorded so no
reader mistakes silence for a resolved position.

**Resolved in this revision:**

- **U1 — This document's rank. RESOLVED.** V2 is the **canonical experience-layer apex** — it
  governs the user-facing experience and interaction with Argus intelligence and claims no authority
  over the object universe, the reasoning contract, or the intelligence spine (see *Position in the
  canon*).
- **U2 — "Operating system" terminology. RESOLVED.** "Market intelligence operating system" names
  **Argus as a whole**; the **Intelligence Network** is Argus's **canonical interactive visual
  intelligence layer/environment**, not the operating system itself (see §1.1).
- **A1 — Amendment flagged (not made here).** The Network Design Bible's exact phrase *"the visual
  operating system of the platform"* must eventually be amended — through the Bible's own governance,
  not this document — to the "canonical interactive visual intelligence layer/environment" framing.
  The Bible is not edited here; this records the debt so the wording does not silently diverge.

**Still open (each a decision for a later chapter):**

- **U3 — Universal Search: surface vs behavior.** Is Universal Search a *first-class standalone
  surface* resolving to `/intel/<uid>`, or the Design Bible's "global search lands on the Network"
  behavior — or both? This is a genuine whitespace with a live tension. (Chapter 5.)
- **U4 — Prediction Ledger placement.** Distributed (Network mode + dossier Accountability, as today)
  or a promoted destination? Must also decide the honesty gate on visibility. (Chapter 6.)
- **U5 — Workstation existence, form, and sequencing.** Separate installed app vs advanced web
  workspace; and *when* — the default recommendation is "not before the consumption gap is closed."
  (Chapter 7.)
- **U6 — Experience principles vs the approved Form Language.** Where a reference-derived principle
  conflicts with the Design Bible's protected identity, which wins, and who adjudicates? (Chapter 8,
  reconciled with the Bible's governance.)
- **U7 — "Richer charting" in the company terminal.** How far can charts go before they cross from
  *descriptive evidence* (permitted) into *price-derived analysis / the dashboard genre* (banned)?
  (Chapter 4, reconciled with Entity Intelligence's no-price-claims doctrine.)
- **U8 — Whether any of Workstation / Universal Search / a promoted Ledger introduces new canonical
  *objects*.** If so, they require Knowledge Model amendments before design proceeds.

---

*End of Chapter 1 (Vision), approved. This document changes nothing in the existing canon; its
authority is the experience layer only (U1 resolved), and it flags — but does not make — the one
Network Design Bible wording amendment it implies (A1).*

---

## Chapter 2 — The Unified Intelligence Experience

*Draft for review. Chapter 1 (Vision) is approved and is not revisited here except by short
cross-reference. This chapter defines how the **one** canonical Argus intelligence is prioritized,
personalized, projected, explained, and explored across the product. It defines behavior and
architecture, not visual design (visual redesign of the Network and the Company experience belongs
to Chapters 3–4). Every factual claim about the current product is tagged with its verified state.*

### 2.0 Status legend and how to read this chapter

Every claim carries one tag so the reader never confuses what exists with what is proposed:

- **[IMPLEMENTED]** — verified in the repository at a named file/path.
- **[CANONICAL · UNCONSUMED]** — built or specified in canon but not consumed by the surfaces that
  should read it (the "computed, shipped, not consumed" gap from Chapter 1).
- **[APPROVED-FUTURE]** — founder-approved behavior for V2 that does not exist yet.
- **[PROPOSAL]** — an architectural proposal made in this chapter, subject to the existing gates.
- **[UNRESOLVED]** — a decision deliberately not made here (collected in §2.15).

This chapter is grounded in a read-only code audit (2026-07-31). Where it names a file, that file
was verified. It does not claim any capability exists unless tagged **[IMPLEMENTED]**.

### 2.1 The Unified Intelligence Experience thesis

**Argus is one maintained understanding, delivered as a spectrum of projections that differ in
priority, depth, voice, and form — never in conclusion.** A user should experience Argus as a
single mind seen from different distances and angles: the briefing is that mind's lead; the Feed is
its live state; the Network is its structure; a dossier is its complete file on one subject; Learn
is the same mind explaining itself more slowly. The moment two of these disagree about what is true,
Argus has failed its one differentiator (Chapter 1, §1.5–1.6).

The current product is **partway** there and the gap is specific and documented, not vague:

- The canonical reasoning engine exists and is honest — `app/explanations.py` produces one
  deterministic `Explanation` per admitted event, stages R0–R3 live (identity, evidence,
  position/transmission, delta, counter, a confidence band), R4–R6 shipped as honest `gated`
  sections. **[IMPLEMENTED]**
- But it is consumed as reasoning by **exactly one surface** — the Event Dossier
  (`lib/intel/dossier.ts` → `components/intel/EventDossier.tsx`); one further consumer ingests its
  R2 transmission chains as graph edges. **[CANONICAL · UNCONSUMED]** for every other surface.
- Every other surface re-derives its own reasoning through a client-side engine stack
  (`lib/intelligenceProfile.ts` composing `inferenceEngine`, `evidenceEngine`, `predictionEngine`,
  `causalMap`, `crossIntel`, `narrativeTransmission`, `themeTransmission`), most of which **label
  their own headers `LEGACY-PATH (IRE-1)`**. This is the split-brain (§2.14). **[IMPLEMENTED]** (as
  debt).

So the Unified Intelligence Experience is, first, a **consumption program**: make each surface a
projection of the one `Explanation`/canonical read, and retire the second, client-side assembler.
The experience improvements the founder wants (time-aware briefing, systemic-importance safety,
progressive disclosure, Learn) are all *projections of that one understanding* and are unsafe to
build on top of a split brain.

### 2.2 Push intelligence vs pull exploration

The default posture is **push**: when a user opens Argus, the product states *"these are the things
you need to understand right now"* and why — it never asks the user to assemble significance from a
dashboard (Chapter 1, P2). Underneath the push, **pull** exploration is unrestricted: the user may
interrogate any claim to any depth.

The interrogation vocabulary is **already the reasoning contract**, not a new system. The pull
questions the founder names —

> *Why? · Evidence? · What changed? · What is connected? · What would invalidate this? · What
> happened historically? · What does Argus expect next?*

— map one-to-one onto the eight-section `Explanation` (Identity / Evidence / Position / Delta /
Counter / Confidence / Memory / Stakes & falsifiers) and the R0–R6 ladder in
`ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1`. **[CANONICAL]** This is the chapter's most important
reuse: *push and pull are the same object at two depths.* Push renders the lead sections in a
person-appropriate voice; pull expands the same object's deeper sections and walks its edges. There
is no separate "exploration engine" to build; there is one `Explanation` and one graph, rendered at
different depths.

Data flow (target):

```
   canonical model ── explain(event|uid|rel) ──▶ Explanation (R0–R6) + graph edges
                                                   │
                    ┌──────────────────────────────┼───────────────────────────────┐
              PUSH  ▼                               ▼                          PULL  ▼
        briefing lead / Feed lead          Feed stream / Network        interrogation: expand the
        (top Explanation sections,         (same Explanations,          same Explanation's deeper
         ranked, voiced)                    projected as structure)      sections; walk its edges
```

Today the push surfaces (brief, Feed hero) largely read canonical narrative
(`lib/feedNarrative.ts` injects The Read's `thesisLine` verbatim, so the Feed hero and brief "can
never tell different stories" **[IMPLEMENTED]**), but the pull surfaces (Drawer, Explorer) read the
client engine stack, so push and pull can still diverge (§2.14).

### 2.3 The time-aware briefing model

**Founder decision 1.** The briefing must answer *what matters at this point in the market day*, and
evolve automatically across the session. This is **[APPROVED-FUTURE]**; the substrate exists and the
change is one of **selection and ordering, not new reasoning**.

Verified today: the homepage brief is a disciplined projection —
`lib/morningBrief.ts` wraps The Read (`lib/theRead.ts`, zones Z2 thesis … Z7 falsifiers, with typed
absence and no live fabrication) plus the change ledger (`lib/intelligenceDeltas.ts`) plus quarantined
summarizer voice. **[IMPLEMENTED]** But it is **not time-aware**: labels are hardcoded "MORNING"
(`app/page.tsx`), `buildMorningBrief` takes no session parameter, and the one real market-session
function — `isMarketOpen()` in `app/api/market-data/route.ts` (uses `America/New_York`) — feeds only
the live status strip, never brief content. **[IMPLEMENTED]** (as a gap).

**[PROPOSAL] The session dimension.** Introduce a deterministic **market session** derived from an
authoritative clock (extending the existing ET logic): `pre-market · open/intraday · after-hours ·
evening/overnight` (exact boundaries and holiday handling are an implementation detail). The session
selects **which canonical facts lead and in what order** — it does not compute new ones:

| Session | Leads with (selection over existing canonical objects) |
|---|---|
| Pre-market | overnight deltas (Z1 ledger); large overnight/global moves; today's scheduled catalysts (earnings/FOMC/CPI — from verified `EconomicRelease`/`MacroSeries` graph neighbors, already `verifiedCatalystsFor`); what to watch; relevant opportunities/risks |
| Intraday | what has happened so far (realized deltas); major movers; events already occurred + a concise canonical explanation and what it affects; **what changed in Argus's prior view** (deltas against yesterday's beliefs, already the ledger's job); upcoming after-market events; what matters for the rest of the session |
| Evening/post-market | what happened today; why (canonical Explanation); which consequences matter; what changed in the model (sealed transitions / memory); what carries into tomorrow |

Every one of these is a *reordering of objects Argus already produces* (deltas, Explanations,
verified catalysts, movers). The only genuinely new dependencies are (a) an authoritative session
clock and market-status feed and (b) a scheduled-events/economic-calendar provider with **real
dates** — the same `Event`-provider gap The Read's Z6 already records as future. **[APPROVED-FUTURE]**

**Naming** (e.g. whether "Morning Brief" is renamed to a time-neutral "Briefing") is deferred to a
later experience decision, per the founder. **[UNRESOLVED]** The *behavior* is defined here; the
label is not.

### 2.4 Universal vs personalized intelligence

Two tiers of intelligence, one set of facts:

- **Universal intelligence** — events every relevant market participant should know regardless of
  their interests: an unexpected Fed decision, a major geopolitical shock, a liquidity/credit event,
  a broad selloff. Universal intelligence is **personalization-immune**: its presence and lead
  position are identical for every user.
- **Personalized intelligence** — events whose *priority, emphasis, and delivery* change because of
  the user's interests, followed entities, saved intelligence, behavior, and (later) holdings.
  Personalization **re-orders and emphasizes; it never changes the underlying facts and never
  suppresses universal intelligence.**

This is the experience-level generalization of an existing law:
`ARGUS_FEED_EDITORIAL_STANDARD_V1` already states *"importance is scored once at the spine; the Feed
ranks presentation; personalization re-orders, never re-scores"* and *"the lead is market truth and
is identical for every user."* **[CANONICAL]** Chapter 2 adopts that law product-wide and names its
two tiers explicitly.

### 2.5 The priority contract (ranking philosophy)

**Founder decision 2.** The founder's proposed shape — *systemic importance + market impact + user
relevance + freshness + Argus conviction* — is adopted **as a philosophy, not as five equally
weighted numeric fields**. The determinism the founder requires already has a canonical home, and
the safe contract is **two scores, computed in two different places, with an inviolable ordering
between them**:

- **Universal importance (spine-owned, personalization-immune).** Computed once, deterministically,
  in the pipeline — the existing `EventScore` (`Base × Corroboration × Relevance × Decay`, backend
  Feed spine) extended to carry **systemic impact and Argus conviction** as first-class components.
  This score is identical for every user and is the sole basis for whether something is *universal*
  (§2.6). **[IMPLEMENTED]** as `EventScore`; **[PROPOSAL]** to extend it with an explicit systemic
  component.
- **Personal relevance (personalization-owned).** A per-user score that re-orders and emphasizes
  *within* the priority bands and can lift personally-relevant items — but is **clamped so it can
  never demote an item below the universal floor** (§2.6). Today this layer is `lib/feedRanker.ts`.

**Determinism/auditability requirement.** Both scores must be inspectable and decomposable — every
priority position must be explainable as "universal importance X (components …) + personal relevance
Y (components …), floor-protected." This satisfies the founder's "deterministic and auditable"
requirement and matches the existing non-negotiable that *every important number decomposes*. The
contract is **not** "one blended magic number"; it is *two named, decomposable scores with a
one-way clamp.* **[PROPOSAL]**

**The optimization objective (founder decision D-D).** The personal-relevance layer — and the learned
model that later informs it (§2.15, D-D) — is optimized for **decision relevance, not engagement or
time-on-platform.** Personalization answers *"what does this user need to know that changes their
understanding of the market?"* — never *"what will keep this user consuming content?"* This is the
guardrail that keeps an institutional relevance model from drifting into an attention-maximizing feed,
and it is inseparable from Chapter 1's stance that Argus is not a consumption product. The principle
to preserve across every personalization change: **personalized institutional intelligence, without
personalized reality.** **[APPROVED · D-D]**

### 2.6 The systemic-importance safeguard (anti-filter-bubble) — load-bearing

**Founder decision 2, and the single most important correction in this chapter.** Personalization
must never create a market-information filter bubble. A technology-focused user must not be allowed
to miss a Fed surprise, a geopolitical shock, a liquidity event, or a systemic credit development.

**Verified conflict — the current product violates this.** `lib/feedRanker.ts` does not merely
re-order; it **filters**:

- an off-thesis story (no followed-theme/sector match) receives `NO_OVERLAP_PENALTY = −200`, whose
  own comment notes it "exceeds the max positive… so secondary signals can never lift an off-thesis
  story into the on-thesis band";
- `passesQualityGate` then **drops** anything below `relevance ≥ 70` **and** `signal ≥ 72`, and the
  feed is capped at 15 items;
- there is **no systemic / market-wide / always-show override** anywhere in the ranker (verified
  absence). The institutional-topic bonus (+28) is far too small to offset −200 and does not bypass
  the gate.

Consequently, **a Fed decision or geopolitical shock that does not lexically match a user's followed
themes can be penalized and removed entirely for a personalized user.** The same filtering feeds the
homepage modules (`rankThemes`, `rankWhatMattersNow`). **[IMPLEMENTED]** (as the core conflict). This
is migration debt D-1 (§2.14) and must not be shipped forward.

**[PROPOSAL] The safeguard: a universal floor personalization cannot cross.**

1. Any event whose **universal importance** (§2.5, spine-owned) clears a **systemic threshold** is
   **universal**: it is present and holds a protected lead position for every user, authenticated or
   not. Personalization may annotate it ("less relevant to you") but may **never** demote it below
   the floor or drop it.
2. Personalization operates **only above the floor** — it re-orders and emphasizes personally
   relevant items among the non-systemic remainder. It may **never** apply a suppress-to-drop
   penalty to systemic content.
3. The clamp is deterministic and one-way: `final_rank = max(personal_rank, universal_floor(event))`.
   No personal signal can produce a rank beneath the floor.

**[APPROVED · D-A] How universal membership is determined — a composite, not a whitelist.**
Universal intelligence is **not** a fixed event-category whitelist. Membership is a deterministic,
auditable function of a composite of independently-inspectable factors:

- inherent event significance;
- realized / expected market impact;
- transmission breadth across sectors, assets, and entities;
- surprise / deviation from expectations (where applicable);
- confidence / evidence quality;
- potential systemic consequence.

Certain **classes receive mandatory systemic *consideration*** — major central-bank decisions/
surprises, material macro releases, geopolitical/conflict escalation, systemic credit/liquidity
developments, extraordinary broad-market/cross-asset moves, major government/regulatory actions,
market-structure disruptions, and other broadly-transmissible events. **Mandatory consideration is
not automatic membership:** an instance of such a class becomes universal only if the composite
clears the floor, and an event *outside* these classes becomes universal if its measured impact/
transmission warrants it. The classes force evaluation and raise the priors; the composite decides.

The **hard rule is preserved**: once an event clears the universal/systemic threshold, personalization
can neither suppress it nor push it below the protected floor
(`final_rank = max(personal_rank, universal_floor(event))`).

**[UNRESOLVED · calibration only]** The final **weights, the systemic threshold, and the class
priors** are not invented here; they require later calibration and testing against the sealed record.
Chapter 2 fixes the *contract* (composite inputs + mandatory-consideration classes + one-way floor
clamp); it does not fix the numbers (§2.15, D-A).

### 2.7 Progressive disclosure model

**Founder decision 4.** The generalized principle, product-wide:

```
   summary  ─▶  explanation  ─▶  exploration  ─▶  institutional depth
   (the lead)   (why + what it   (interactive       (the complete sealed
                 affects)         investigation)     record: events, memory, ledger)
```

Each level is a **deeper projection of the same conclusions**, never a different derivation. This is
Chapter 1's P1 applied to depth: going deeper reveals *more of the same understanding*, it does not
switch brains.

**Verified today (company-kind).** The three tiers the founder describes already exist and ship:

- **Tier 1 — Quick Company Panel** = `components/common/IntelligenceDrawer.tsx` ("the travel-size
  dossier"): current read, active themes/drivers, forward view, evidence preview. **[IMPLEMENTED]**
- **Tier 2 — Intelligence Explorer** = `app/explore/[entity]/page.tsx`: three-column workspace, chart
  + thesis + forward view + catalysts + risks + network + evidence/timeline. **[IMPLEMENTED]**
- **Tier 3 — Institutional Dossier** = `app/intel/[uid]/page.tsx` → `components/intel/CompanyDossier.tsx`:
  fixed-order record (Standing View, Event Record, Relationship Map, Institutional Memory, Prediction
  Ledger, Watch). Addressing is canonical — `/company/[ticker]` redirects to
  `/intel/company:ticker:*`. **[IMPLEMENTED]**

**Verified defect.** The three tiers **do not share one intelligence source**: Drawer and Explorer
read the client `intelligenceGraph` singleton + `intelligenceProfile` + `crossIntel`; the Dossier
reads `buildCompanyDossier` over feed fields + backend memory/ledger APIs. *Same company, three
derivations.* **[IMPLEMENTED]** (as debt D-2). Additionally, Tier 2's `components/explore/MarketView.tsx`
falls back to **badged SAMPLE scaffolding** (hash-seeded synthetic conviction/catalyst/theme-exposure
curves) when data is absent, and a **device-local "institutional timeline"** (`localStorage`
snapshots, "tracking begins today") is dressed in an institutional register. The Tier-3 Dossier, by
contrast, fabricates nothing (every empty section is a typed `Absence`). **[IMPLEMENTED]**

**[PROPOSAL]** Progressive disclosure is correct as an *experience* and is already reified in canon
as **one dossier grammar with kind facets** (`ARGUS_ENTITY_INTELLIGENCE_V1`). Chapter 2 reframes the
three company tiers as **three depths of one Entity-Intelligence source** (not three engines), and
generalizes the four-level ladder to every entity *kind* (theme, industry, event, later assets/
countries/commodities) and to events. The migration is convergence onto one source (§2.14), not new
surfaces. This preserves Chapter 1's reconciliation: the premium company experience is a *deepening
of the existing Entity-Intelligence company-kind grammar, never a second company architecture.*

### 2.8 Explanation depth / the "Learn" concept

**Founder decision 5.** Argus should help users understand markets and economics *where useful*,
without becoming an educational app or degrading the experience for experts.

**[PROPOSAL] Learn is a projection concern, not a reasoning engine.** The hard constraint the founder
sets — *Learn must consume the same canonical intelligence and evidence; it cannot become a separate
educational reasoning engine producing different explanations of reality* — makes its architecture
clear: Learn is an **adjustable-depth voice layer over the one `Explanation` and its evidence**, plus
**contextual definitions** for the vocabulary that appears in canonical claims. It adds *pedagogy and
verbosity*, never facts.

Worked example (the founder's): when Argus states *"real yields rose sharply and pressured
long-duration equities,"* Learn expands, in place: *what real yields are* (a definition), *why they
changed* (the canonical driver/transmission already in the Explanation's Position section), *why
higher real yields pressure long-duration assets* (a canonical **relationship** already carried as a
typed graph edge, not a new claim), and *why it matters to the specific subject in view* (the same
Explanation, deeper). A sophisticated user collapses all of it and sees the one-line claim. The
causal content Learn "teaches" is **the same transmission edge the Network draws** — one model,
explained more slowly.

**[APPROVED · D-B] The delivery model — hybrid.** Learn has two parts:

- an **optional persistent explanation-depth preference** that sets a user's *default* explanatory
  depth/verbosity; and
- a **per-interaction "Explain this"** capability available to **any** user regardless of that
  preference — on any claim, relationship, chart movement, economic concept, event, or conclusion.

The persistent preference controls the default depth; "Explain this" lets anyone request deeper
context for a specific thing on demand. **Repeated use of Learn must not be inferred to mean the user
is inexperienced** — a sophisticated user may open deep context on an unfamiliar corner of the
market; Learn is not a proficiency signal and must not feed a "beginner" inference or the behavioral
model (§2.15, D-D).

Learn remains **strictly a projection / voice / context layer over canonical intelligence, evidence,
and relationships**: it may explain more; it may not create new market truth. A canonical,
evidence-linked **definitions/concepts** resource may be appropriate; whether that constitutes a new
canonical object is flagged for a **Knowledge Model check** (§2.15, D-B) rather than declared here.

### 2.9 Feed's role in the unified experience

**Founder decision 3.** Feed is the **live state-of-market experience** and is broadly correct today;
the Network does not replace it. **Verified:** the Feed already renders the founder's intended
hierarchy top-to-bottom — Argus Market Map hero (`components/feed/ArgusMarketMap.tsx`) → focus/
Intelligence Workspace → Live Intelligence Stream → Signal Picks — over ranked clusters, not a flat
news list. **[IMPLEMENTED]** The conceptual hierarchy the founder names is therefore already the
shipped shape:

```
   live market state  ─▶  premium Intelligence Network  ─▶  intelligence stream / explanation
                                                                     ─▶  important underlying developments (evidence, entry points)
```

Chapter 2 affirms this and adds three requirements, deferring **visual** design to Chapter 3:

- The Network is the **premium visual centerpiece** (drivers, themes, sectors, entities, cross-asset
  and causal relationships, propagation of consequences). Its interactive/visual redesign is Chapter 3.
- The **intelligence stream must make the Network understandable in natural language** — the user
  must never have to decode a graph to learn Argus's conclusion. Today the *global* market take is
  canonical (`feedNarrative.ts` reuses The Read verbatim); the *focused* desk note (`lib/feedFocus.ts`
  `FocusStory`) is computed **locally** and is migration debt D-3 (§2.14).
- Headlines/developments remain as **evidence and entry points**, never the product. Argus must not
  regress into a news feed (Chapter 1, §1.4).

One caveat the redesign must respect: `lib/marketMap.ts`'s `buildMarketMap` is **dead code** (no
consumers); the live projection is `lib/network/model.ts` (`buildNetworkModel`, self-described "A
PROJECTION, never an engine"). But a **second, parallel graph builder** persists — the Drawer/
Explorer network renders `buildRelationshipMap` (`lib/causalMap.ts`) over the client singleton rather
than `buildNetworkModel`. Two graph systems is debt D-4 (§2.14). **[IMPLEMENTED]**

### 2.10 The surface projection & ownership model

**Founder decision 7.** The layered ownership the founder proposes is adopted, with one refinement
forced by the repo (there is currently a *second* conclusion-owner that must be named as debt, not
enshrined):

| Layer | Owns | Canonical home (today) | Rule |
|---|---|---|---|
| **Canonical intelligence / reasoning** | conclusions: what is true, why, what it affects, evidence, confidence, falsifiers, memory, predictions | pipeline stages 3–5; `app/explanations.py` (`Explanation`); institutional memory/ledger APIs | computed **once**; the only writer of meaning |
| **Personalization** | prioritization: ordering, emphasis, delivery — **above the universal floor only** | `EventScore` (universal) + `feedRanker` (personal) | ranks/emphasizes; **never** re-scores facts or suppresses universal intelligence |
| **Projection** | surface-appropriate representation: which sections, what depth, session selection | The Read / dossier builders / `network/model.ts` | selects and shapes; computes no meaning |
| **Presentation** | visual hierarchy, form language, motion | Design Bible (Chapter 3) | motion encodes change; contrast encodes meaning |
| **Surface** | interaction and context (focus, navigation) | each page | owns interaction, **not** market truth |

**Refinement (challenge to the proposed separation, per the repo).** The founder's model assumes a
single conclusion-owner. The repo has **two**: the backend `Explanation` (R0–R3, deterministic,
consumed by one surface) *and* `lib/intelligenceProfile.ts` (a client-side assembler composing the
`LEGACY-PATH` engines, consumed by Drawer/Explorer). The correct contract is: **the backend
`Explanation`/pipeline is the sole conclusion-owner; `intelligenceProfile.ts` and its engine stack
are the client second-brain to retire** (§2.14). The chapter names this rather than pretending the
separation already holds.

### 2.11 Cross-surface consistency requirements

The consistency law is inherited, not invented: *Argus has exactly one understanding at any moment;
two surfaces disagreeing about an object is a severity-one defect* (`ARGUS_PRODUCT_INTELLIGENCE_
ARCHITECTURE_V1`, non-negotiable #1). **[CANONICAL]** Chapter 2 makes it a testable cross-surface
requirement for V2:

- **CS-1.** For a given event or entity, every surface that shows reasoning must render the **same
  `Explanation`/canonical read** at its own depth and voice. It may truncate, order, and phrase; it
  may not compute, reorder the reasoning ladder, or substitute a conclusion.
- **CS-2.** The **lead** (briefing lead, Feed lead) is universal — identical for every user — and only
  its *annotations* are personalized.
- **CS-3.** A surface that lacks canonical input renders **typed absence**, never a locally-derived
  substitute (§2.13).
- **CS-4.** No surface may display a number, verdict, narrative, or confidence not produced by a
  canonical engine; the LLM writes voice, never facts.

**Current conformance:** CS-1 holds for the Event Dossier and (for the *global* market take) the Feed
hero and brief; it is **violated** by the Drawer, Explorer, and the three-source company tiers (§2.14).
CS-4 is mostly honored on the brief (summarizer voice is quarantined with a VOICE badge; the LLM
confidence number is not surfaced) but the `LEGACY-PATH` engines compute confidence/verdicts
client-side. **[IMPLEMENTED]** (mixed conformance).

### 2.12 Authenticated vs unauthenticated experience

**Founder decision 2 (delivery).** Unauthenticated users may receive a **largely universal**
experience; authenticated users receive the **personalized layer** on top. This is architecturally
elegant because **the universal tier is the same object as the systemic floor (§2.6)** — building the
anti-filter-bubble safeguard *produces* the anonymous experience for free:

- **Unauthenticated:** the universal experience — universal intelligence, the market's live state,
  the canonical briefing lead, and unrestricted read/pull exploration of public intelligence. No
  personal signals; nothing personalized. **[PROPOSAL / APPROVED-FUTURE]**
- **Authenticated:** everything above, plus the personal layer — re-ordering and emphasis by
  interests/followed entities/saved/behavior, plus personal artifacts (saved, watchlists, later
  alerts). Personalization is **additive and floor-clamped**.

**Verified state, and the D-C decision.** There is **no** universal anonymous experience today:
`middleware.ts` hard-redirects `!user` requests for `/` and `/feed` to `/auth` (only `/auth` and
static assets are public); the coded signed-out landing hero, guest-mode escape, and feed
`unauthenticated` gate are therefore **dead branches**. **[IMPLEMENTED].** Founder decision D-C:
**approve the architecture conceptually, defer implementation.** Argus is to be *designed* so the
universal tier could later power a useful signed-out/public experience — but the **current
authentication gate remains unchanged during the immediate V2 migration** unless a later explicit
product/security decision changes it. Accordingly, the "Unauthenticated" row above is
**[APPROVED-FUTURE]**, not immediate work, and **D-5 is reclassified as future / public-experience
debt — not a blocker** to the authenticated V2 experience (§2.14). Standing design constraint: because
the universal tier and the systemic floor are the same object (§2.6), the authenticated migration must
not make a future public tier *harder* — but no gate change ships now, and the backend continues to
independently authorize all personalized/private data.

### 2.13 Failure and degradation principles

The experience must fail like an institution, not like a demo. Principles (mostly inherited, made
cross-surface here):

- **F-1. Absence is typed, never filled.** A missing input renders a typed absence
  (`insufficient_signal`, `not_connected`, `data_gap`, `insufficient_history`, `quiet`) — the
  Reasoning Engine's uncertainty vocabulary — never invented content. The Tier-3 Dossier already
  models this (*"Nothing is simulated in its place"*). **[IMPLEMENTED]** (Dossier); **[APPROVED-FUTURE]**
  (product-wide).
- **F-2. Fill never beats floor (the quiet-day rule).** A surface must be willing to be quiet. This
  is **violated** today by `lib/morningBriefingEngine.ts` (self-labeled "always return meaningful
  content" fallbacks) and by Tier-2 `MarketView` SAMPLE scaffolding — both migration debt (§2.14).
- **F-3. Degrade toward the canonical source, never toward a legacy engine.** When a surface loses
  its canonical read it shows typed absence; it must **not** silently fall back to a client engine
  that re-derives a weaker answer. (This is the failure mode that created the split-brain.)
- **F-4. Provenance survives degradation.** Every rendered claim remains decomposable to evidence or
  is marked derived/absent, even in a degraded state.
- **F-5. Personalization degrades to universal.** If personal signals are unavailable or fail, the
  user receives the universal experience — never a broken or empty personalized one. (Today the
  ranker already short-circuits to an unranked full feed when preferences are empty. **[IMPLEMENTED]**)

### 2.14 Existing architectural conflicts and migration debt

Per the founder: **identify and classify; do not remove yet.** This register is the backlog Chapter 2
hands to implementation. Every row is verified in code. **The immediate architectural priority is not
adding more independent intelligence engines — it is converging existing surfaces onto the canonical
intelligence (D-3 and its dependents). New reasoning is not the work; consumption is.**

| ID | Debt | Evidence | Conflicts with | Target |
|---|---|---|---|---|
| **D-1** | Feed ranker **filters** (off-thesis −200 + drop-gate + cap 15) with **no systemic override** | `lib/feedRanker.ts` (`NO_OVERLAP_PENALTY`, `passesQualityGate`) | §2.6 safeguard; decision 2 | universal floor + rank-not-suppress (§2.5–2.6). **Highest priority.** |
| **D-2** | Company tiers use **three reasoning sources** | Drawer/Explorer (`intelligenceProfile`+`crossIntel`+singleton) vs Dossier (`buildCompanyDossier`+backend APIs) | §2.7, CS-1 | one Entity-Intelligence source, three depths |
| **D-3** | Split-brain: canonical `Explanation` consumed by **one** surface; everything else re-derives | `app/explanations.py` consumed only by `EventDossier`; `intelligenceProfile` + `inference/evidence/prediction/causalMap/crossIntel/narrativeTransmission/themeTransmission` (`LEGACY-PATH`) | §2.1, §2.10, CS-1/CS-4 | migrate surfaces onto the backend `Explanation`; retire the client assembler |
| **D-4** | **Two parallel graph builders** | `network/model.ts` (feed+dossier) vs `causalMap.buildRelationshipMap` over client singleton (drawer+explorer); `marketMap.ts` dead | §2.9 | one canonical graph projection; delete dead `buildMarketMap` |
| **D-5** *(future / public-experience debt — NOT a V2 blocker; D-C)* | No universal anonymous experience | `middleware.ts` gates `/`,`/feed`; guest UI is dead branches | §2.12 | keep the gate unchanged now; design so the universal tier *could* later serve signed-out — without blocking authed V2 |
| **D-6** | Fabrication in the mid-tier | `components/explore/MarketView.tsx` SAMPLE scaffolding; device-local "institutional timeline" (`intelligenceShared.buildTimeline`, "tracking begins today") | F-1, F-2 | typed absence; source memory from the backend archive, not one device |
| **D-7** | Quiet-day violation in the brief | `lib/morningBriefingEngine.ts` "always return meaningful content" | F-2 | consume canonical; allow quiet |
| **D-8** | Personal artifacts don't inform ranking; onboarding misses the dominant signal | saved/watchlist ignored by `feedRanker`; onboarding never captures `followed_themes` | §2.5; decision 2 | make saved/followed/behavior signals (floor-clamped); capture themes at onboarding |
| **D-9** | Focused desk note computed locally | `lib/feedFocus.ts` `FocusStory` | §2.9, CS-1 | project the canonical narrative |

Already-migrated (not debt — models to copy): `lib/marketsIntel.ts`, `lib/feedNarrative.ts`,
`lib/episodeIntel.ts` are thin projections that inject the shared canonical read; the Tier-3
`CompanyDossier` and `EventDossier` are pure projections with honest absence. These prove the target
pattern is achievable.

### 2.15 Decisions deferred to later chapters / requiring founder input

Recorded rather than invented (Chapter 1 §1.10 convention). The founder's D-A…D-F decisions resolved
the **architecture** of each item; what remains open is **calibration, sequencing, timing, data, and
naming** — none of which blocks the authenticated V2 migration.

**Architecture approved in this revision (open only where noted):**

- **D-A (§2.6) — Universal-membership model: APPROVED as a composite (not a whitelist)** with
  mandatory-consideration classes that raise priors but do not auto-qualify. **Open: calibration
  only** — final weights, the systemic threshold, and class priors, to be tuned/tested against the
  sealed record. **[UNRESOLVED · calibration]**
- **D-B (§2.8) — Learn: APPROVED as a hybrid** (persistent depth preference + universal per-interaction
  "Explain this"); repeated use is *not* a proficiency signal. **Open: Knowledge Model check** on
  whether a canonical evidence-linked definitions/concepts resource is a new object. **[UNRESOLVED ·
  KM check]**
- **D-C (§2.12) — Universal anonymous experience: APPROVED conceptually, implementation DEFERRED.** The
  auth gate stays unchanged during immediate V2; D-5 reclassified as future/public-experience debt,
  not a blocker. **Open: timing**, by a later explicit product/security decision. **[DEFERRED]**
- **D-D (§2.5) — Behavioral personalization: sequencing and objective APPROVED.** Order is **systemic
  floor → explicit preference/saved/followed signals → high-intent behavioral signals → learned
  personalization**; systemic protection must exist before behavioral learning; the model optimizes
  for **decision relevance, not engagement**. Later behavioral signals may include searches,
  repeatedly-explored companies/themes, dossiers opened, Network exploration, saved intelligence,
  followed entities, alerts/watchlists. **Open: signal scope, storage, and privacy posture** — a later
  chapter. **[UNRESOLVED · scope/privacy]**

**Still fully open:**

- **D-E (§2.3) — Briefing naming.** Deferred; keep existing naming; time-aware *behavior* is approved,
  final naming decided after that experience is designed/built. **[DEFERRED]**
- **D-F (§2.3, §2.6) — External data dependencies.** The full time-aware experience requires
  authoritative market-session/status, economic-calendar, and real-dated `Event` data. **No vendor or
  provider is selected in Chapter 2.** **[UNRESOLVED · data/integration]**

**Deferred to later chapters by scope:** Network visual/interaction redesign (**Chapter 3**); the
Company terminal's chart-as-evidence boundary and premium experience (**Chapter 4**); Universal
Search surface-vs-behavior (**Chapter 5**, Chapter 1 U3); Prediction Ledger placement (**Chapter 6**,
Chapter 1 U4); Workstation/Mobile (**Chapter 7**); aesthetic principles vs the Form Language
(**Chapter 8**, Chapter 1 U6).

### 2.16 What Chapter 2 extends and what it will require amending

- **Extends (inherits, does not override):** `ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1`
  (non-negotiables, spine), `ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1` (the `explain()` contract as the
  push/pull object), `ARGUS_FEED_EDITORIAL_STANDARD_V1` (importance-once-at-the-spine), The Read /
  `ARGUS_MORNING_BRIEF_V2`, `ARGUS_ENTITY_INTELLIGENCE_V1` (progressive tiers as depths of one
  grammar), `ARGUS_INSTITUTIONAL_MEMORY_V2` / `ARGUS_PREDICTION_OUTCOME_LEDGER_V1` (dossier depth).
- **Will require explicit amendments (later, through each doc's own gate — flagged, not made here):**
  - **A2 — Feed Editorial Standard:** add the **systemic-importance floor** and reclassify the
    frontend drop-filter as debt, so "personalization re-orders, never re-scores" is enforced with a
    floor personalization cannot cross (§2.6).
  - **A3 — The Read / Morning Brief:** add the **session-aware selection** dimension (§2.3).
  - **A4 — Entity Intelligence:** record the **three tiers (Drawer/Explorer/Dossier) as three depths
    of one source** and the convergence target (§2.7, D-2).
  - **A5 — Surfaces / Intelligence Everywhere:** name `lib/intelligenceProfile.ts` + the `LEGACY-PATH`
    stack as the client **second-brain to retire** (§2.10, D-3).
  - **A6 — Knowledge Model check** *only if* Learn's definitions/concepts or a systemic-importance
    marker turn out to be new objects (§2.8, §2.15).

*End of Chapter 2 (approved). No implementation performed; no product surface modified. The migration
debt in §2.14 is catalogued, not removed.*

---

## Chapter 3 — Intelligence Network 2.0

*Draft for review. This chapter defines the premium interactive visual expression of Argus's
intelligence. It **extends** the approved Network Design Bible (`ARGUS_INTELLIGENCE_NETWORK_V2`) and
its engineering spec (`ARGUS_INTELLIGENCE_NETWORK_V1`); it supersedes essentially nothing in them
(§3.20). It defines behavior, grammar, data boundaries, and a convergence/migration direction — not
code, and not a new reasoning engine. The Network is a **projection**; Chapter 3 never makes it an
engine. Grounded in a read-only code audit (2026-07-31); every product claim is tagged.*

### 3.0 Relationship to the Design Bible, and what this chapter is

The Bible already specifies, in depth and validly, most of the Network's *design* — node grammar,
edge grammar, focus modes, the inspector, the Interrogation ladder, the closed motion table and ban
list, memory, replay-over-sealed-data, empty states, accessibility, the protected Form Language
(Cut/Rail/Figure/Notch/Thread) and the protected signature gestures (Trace, Return, Seal beat,
Interrogation ladder). **Chapter 3 does not re-invent any of that.** Its job is narrower and harder:

1. **Converge the data.** Make the one Network *project the canonical, sealed relationship record* —
   which today exists on the backend and is consumed by no graph — and retire the two frontend paths
   that manufacture or client-derive relationships (§3.3, §3.4–3.5, §3.21).
2. **Absorb, then retire, the second graph.** Move the genuinely useful relationship grammar and
   interaction from the `causalMap` path into the canonical Network before deleting it (§3.5, §3.9,
   §3.21).
3. **Raise execution to the premium bar** the founder wants — *within* the Bible's already-approved
   visual language and ban list, not by inventing a new identity (§3.14).
4. **Close the two real experience gaps:** mobile (currently broken) and honest temporal/replay
   (currently absent) (§3.10, §3.18).

The A1 terminology reconciliation is now made (Bible V2.4): Argus as a whole is the market
intelligence operating system; the Network is Argus's **canonical interactive visual intelligence
layer/environment** and spine. Chapter 3 assumes that reconciliation.

**Status legend:** **[IMPLEMENTED]** verified in code · **[BIBLE]** already specified in the approved
Design Bible (carry forward) · **[CANON · UNCONSUMED]** built/sealed but not consumed by any graph ·
**[CH3]** a proposal in this chapter (extends the Bible via a later V2.x amendment) · **[NEEDS DATA]**
requires new or matured data · **[LATER IMPL]** requires later implementation.

### 3.1 What the Network must let a user *see* (acceptance intent)

The founder's bar: the user should **see the state of the market**, not "nodes connected by lines."
Restated as standing acceptance intent (an extension of the Bible's Five-Second Test, not a
replacement): within seconds a user should read **what is driving markets now, the major themes, the
sectors/industries and entities being affected, cross-asset and macro/geopolitical transmission, the
direction and strength/confidence of influence, the propagation event → theme → industry/sector →
company/asset, what changed, and what Argus believes matters most** — and be able to select any
event, theme, sector, company, or relationship and learn *why it is here, what affects it, what it
affects next, how strong the link is, what evidence supports it, what changed, and what would
invalidate it*. The **inspector must answer these in natural language** so the user is never required
to decode the visualization (§3.8). "Visual complexity is not sophistication" (Bible Principle-aligned):
the graph must stay legible; the premium upgrade increases *clarity and depth-of-meaning*, not density.

### 3.2 Current-state audit (verified)

Two disjoint graph stacks exist:

- **Canonical M4.1 stack** — `lib/network/model.ts` (a genuinely pure, deterministic projection:
  content-hash identity, no `Date.now`, five node classes, five-verb edges with an explicit
  `recorded | derived` provenance flag) rendered by `components/network/IntelligenceNetwork.tsx`
  (canvas, **render-on-demand with zero idle rAF**, node/edge grammar already drawn close to the
  Bible: tiered nodes, verb-colored edges, arrowhead = provenance, dash = confidence, width =
  strength, glow only on active elements, reduced-motion honored). Powers the **Feed hero**
  (`ArgusMarketMap`) and the **Dossier**. **[IMPLEMENTED]** and clean.
- **Legacy stack** — `components/graph/NetworkGraph.tsx` (force-simulation, **constant** rAF,
  ambient particles/breathing/pulses/dash-flow, additive blooms). Used **only on the M&A page**. This
  is the "elementary/cinematic" graph; it also contains a **dormant, synthetic** replay path
  (hash-seeded activation order, never wired). **[IMPLEMENTED]** (legacy).

Three verified gaps: **(a)** the canonical model **manufactures its edges** from theme prose/ontology
fields and frontend heuristics rather than projecting the sealed relationship record (§3.3);
**(b) mobile is degrade-by-hiding** — the entire inspector/story is `hidden lg:flex` and there is
**no touch handling**, so pan/zoom break on phones (§3.18); **(c) no temporal/replay** in the
canonical Network — deliberately removed and test-guarded; only a per-cycle `delta` badge ("▲N
today") exists (§3.10). Also: `lib/marketMap.ts` `buildMarketMap` is **fully dead code**; no
`Math.random`/fabrication exists in the canonical render path.

### 3.3 The canonical-data boundary — the architectural core of Chapter 3

**The keystone finding.** A **canonical, sealed relationship record already exists** and is consumed
by **no** graph — while two frontend paths *manufacture* relationships instead (`network/model.ts`
derives edges from theme prose/ontology fields; `causalMap` derives trend from a device-scoped client
singleton's `Date.now()`). Before any premium visual work, Chapter 3 must fix *what the graph is a
picture of.* This requires an explicit **relationship-authority hierarchy** — the four backend
representations are **not co-equal sources of truth.**

**The relationship-authority hierarchy (verified in code).**

| Rank | Object | Role | Evidence |
|---|---|---|---|
| **1 · Identity (source of truth)** | `institutional_relationships` | The relationship *exists*: `rel_uid` (deterministic `rel:{source}\|{type}\|{target}`), verbatim `relationship_type`, `first_seen_at`/`last_seen_at`. The identity registry. | `005:74-84`; `identity.py:173`; `models.py:161` ("identity registry") |
| **2 · Current sealed state** | latest `relationship_snapshots` row | The relationship's *observed present*: daily-sealed `strength`, `confidence`, `evidence_count`, `source_count`, evidence refs (FK → identity). | `005:96-121` |
| **3 · Historical change** | `relationship_transitions` | The relationship's *history*: appeared / disappeared / strengthened / weakened / confidence_changed, `effective_at` (FK → identity). | `005:135-160` |
| **4 · Event projection (NOT a source of truth)** | R2 transmission chains (`explanations.py`) | A *reading* of relationships along **one event's** path; each hop carries `rel_uid` + `basis` (`recorded_graph` / `curated_ontology` / `recorded_trend`); "replaces the transmission prose." A **reader/composer**, never the authority. | `explanations.py:193-202, 335-341, 298` |

**The seven answers.**
1. **Canonical identity / source of truth?** → `institutional_relationships` (the `rel_uid` *is* the identity).
2. **Current sealed observed state?** → the **latest `relationship_snapshots`** row for that `rel_uid`.
3. **Historical state / change record?** → `relationship_transitions`.
4. **What is merely a projection?** → **R2 transmission chains** — a per-event path over relationships, never an authority.
5. **If R2 and the sealed record disagree, which wins?** → **the sealed record wins.** R2's authority is confined to "how *this event* transmitted"; a relationship's existence, type, and current strength/confidence are owned by the identity + latest snapshot. On `recorded_graph` hops there is nothing to reconcile (R2 references the sealed `rel_uid`); any numeric conflict on a recorded relationship resolves to the snapshot.
6. **Can R2 carry a `curated_ontology` relationship that is not (yet) recorded?** → **Yes** — verified: `explanations.py:341` emits the theme→company `exposed_to` hop as `basis: curated_ontology`. Such a hop is a **derived** ontology association, *not* an observed sealed relationship. **The Network must render it with the Bible's DERIVED provenance treatment** (hollow arrowhead; "recorded vs derived must never be confusable") and the Voice's *derived* register — **never** the RECORDED treatment. Provenance is a pure function of basis: `recorded_graph` / `recorded_trend` → **recorded**; `curated_ontology` → **derived**. A derived relationship may be *visible and useful*; it may **never** look like one Argus has actually observed and sealed.
7. **Exact contract the frontend consumes?** → **one backend-assembled canonical relationship read model — never the raw tables.** The backend owns all reconciliation across identity + snapshot + transitions (+ R2 for event context on the Feed); the frontend receives, per relationship, a single record:
   `{ rel_uid, source_uid, target_uid, relationship_type (verbatim), provenance: recorded | derived, current: { strength, confidence, evidence_count, source_count } (latest sealed snapshot), trend (from transitions), first_seen_at, last_seen_at }`.
   Today only **per-table raw reads** exist (`/api/memory/v2/entities/{uid}/relationships`, `/relationships/{rel_uid}/snapshots`, `/…/transitions`); the frontend must **not** be handed three representations to reconcile. The reconciled read model is a **[CH3 / LATER IMPL]** backend projection (not a new reasoning engine) over **[CANON tables · UNCONSUMED]**.

**The boundary rule.** The one Network **projects that reconciled canonical relationship read model**
and **manufactures nothing.** `network/model.ts` **survives as the canonical Network for its
deterministic projection and layout responsibilities only** — its current **heuristic
relationship-generation** (driver edges from causal-narrative prose, sector edges from theme fields,
company edges from ThemeMemory) is **migration debt that disappears** once the canonical relationship
contract is consumed; `causalMap`'s client-clock trend is likewise retired in favor of
`relationship_transitions`. The founder's architecture, exactly: **one relationship authority → sealed
observations/history → one canonical Network projection → many visual surfaces** — never *several
backend representations → the frontend decides market truth.* Wiring this is the **single
highest-value Network change** and the precondition for every visual investment below. **[CH3 / LATER IMPL]**

Data-flow (target):

```
  1 IDENTITY         institutional_relationships   (rel_uid = the relationship exists — source of truth)
  2 SEALED STATE     latest relationship_snapshots (observed strength/confidence/evidence)
  3 HISTORY          relationship_transitions       (appeared/strengthened/weakened/…)
  4 EVENT PROJECTION R2 chains                      (per-event reading; recorded vs curated_ontology by `basis`)
        │  backend reconciles ──▶ ONE canonical relationship read model (per relationship)
        ▼
  canonical Network projection  (network/model.ts: deterministic layout ONLY — no edge manufacturing)
        ▼
  Feed hero · Company/Entity dossier · (retired: causalMap edge-derivation, buildMarketMap)
```

### 3.4 Node grammar

**[BIBLE]** Five node classes (Macro Driver, Narrative, Theme, Industry, Company/Asset); position =
causal role, size = tier (institutional standing, never physics), shape = ontology class, color =
state, motion = change; geometry narrates causality (diamonds/forces → cut plates/reasoning →
squares/junctions → pills/terminals). **[IMPLEMENTED]** — the canonical renderer already draws tiered
nodes with these encodings.

**[CH3] extensions (small, additive):** add per-node **degree/relCount** and the per-node "why does
this matter" read (composed from the node's *real* canonical edges) — capabilities proven in the
`causalMap`/Explorer path (§3.9) and absorbed here. No new node *class* is proposed; any new class
would require a Bible amendment.

### 3.5 Edge grammar

**[BIBLE]** width = strength; continuity/dash = confidence; arrowhead fill = provenance (filled
recorded, hollow derived — "must never be confusable"); hue = effect (teal supports, red pressures,
slate structural); direction by arrowhead. **[IMPLEMENTED]** in the canonical renderer.

**[CH3] absorb from `causalMap`, sourced from sealed records (not the client clock):** carry on each
edge its **recorded life** — `rel_uid`, verbatim relationship type, `first_observed`/`last_observed`,
`evidence_count`, `source_count`, and a **trend** (strengthening/weakening/stable) taken from
`relationship_transitions`, plus a deterministic, templated **per-edge natural-language explanation**
("why this edge exists"). Keep the Bible's `recorded | derived` provenance flag (which `causalMap`
lacks). Preserve the display grammar of ~five effect-verbs on the canvas while carrying the open
relationship vocabulary underneath for the inspector. **[CH3 / LATER IMPL]**

### 3.6 Hierarchy & layout

**[BIBLE + APPROVED · G-1]** The canonical layout identity is the Bible's **asymmetric center-left
causal-fan** — dominant mass at optical center-left, consequences fanning right; "upstream left,
downstream right, always" — carrying the **causal left→right propagation** (event → theme →
industry/sector → company/asset). The literal **fixed five-column** staged layout is **[V1
engineering]**, an implementation artifact, **not** the future visual identity, and is set aside as
such (§3.20). Per the founder: the graph should feel **spatial and organic rather than like a
flowchart**, while remaining **deterministic and causally legible** — the content-hash layout
identity (as implemented) is preserved so identical intelligence always yields the same picture.
Confirm non-contradiction with Bible Part 5.

### 3.7 Focus mode & interrogation

**[BIBLE]** Exclusive focus modes (Overview, Narrative Focus, Entity Focus, Change, Replay,
Prediction), a persistent mode chip, and the Interrogation Model (every gesture is a question;
staged reasoning as the answer). **[IMPLEMENTED]** (Feed selection drives the page; Entity Focus
resolves an entity dossier VM). **[CH3]** binds the founder's seven pull questions — *why here · what
affects it · what it affects next · how strong · what evidence · what changed · what would
invalidate* — to the existing `Explanation` sections + the sealed relationship record, so focus
answers them from canonical data, not a local re-derivation (Chapter 2 §2.2).

### 3.8 Inspector

**[BIBLE]** "The Network shows; the inspector tells" — a permanent right column (never a modal),
three states (default/entity/relationship), prose + records + history. **[IMPLEMENTED]** (canonical
`NetworkInspector`, enriched with session-cached memory/prediction/calibration reads).
**[CH3] hard requirement:** the inspector must render Argus's conclusion in **natural language** such
that a user **never has to decode the graph** — the graph is the structure, the inspector is the
sentence. Absorb the `causalMap`/Explorer **per-edge and per-node inspectors** (relationship dossier:
type, strength, confidence, evidence, sources, trend, first/last seen; node "why it matters"), sourced
from canonical records.

### 3.9 Progressive disclosure

**[BIBLE]** "Earned depth" and the Interrogation ladder (hover → select → expand → inspector → full
profile). **[CH3] absorb from `causalMap`:** the **intent-driven progressive expansion** — direction-
aware modes (upstream, downstream, competitors, suppliers, customers, regulation, macro, themes) that
reveal *existing* canonical edges only, one ring at a time (never a dump, never fabricated). This is
the richest interaction in the current product and belongs in the canonical Network. Generalize the
entity-centric **N-hop neighborhood** builder (keyed on any node) — the canonical model today only
projects a fixed market-wide top-6-theme view; entity focus needs the any-node neighborhood the
`causalMap` path already has. **[CH3 / LATER IMPL]**

### 3.10 Temporal change, memory, and replay — honesty-bound

- **What changed / motion = change.** **[BIBLE]** "nothing moves unless information changes"; Change
  Mode lights only transitioned objects with their deltas. **[IMPLEMENTED]** only as a per-cycle
  `delta` badge ("▲N today"). **[CH3]** promote "what changed" to a first-class Change view sourced
  from `relationship_transitions` + node deltas (real, sealed), not a client diff.
- **Memory.** **[BIBLE]** Memory object + Memory mode (re-light by epistemic age); the Notch (age
  tally). **[CANON · UNCONSUMED / CH3]** source memory from the sealed archive, never from a device's
  `localStorage` session (Chapter 2 §2.14 D-6).
- **Replay (APPROVED · G-2).** **[BIBLE]** replay shows **sealed daily reconstructions, never
  intraday**, with a completeness badge and empty days that "look deliberately empty." **[IMPLEMENTED
  as ABSENT]** — the canonical Network has **no** replay (deliberately removed, test-guarded); the only
  replay code is the legacy M&A path's **dormant, synthetic** activation order. **[CH3 / NEEDS DATA /
  LATER IMPL]** Replay is added **only** as an honest projection over the sealed archive
  (`/api/memory/v2/graph/at`), and **only when the sealed historical archive satisfies the existing
  credibility/completeness requirements**. Argus must **never synthesize historical market states
  merely to provide a replay experience.** Until sufficient history exists, the Network **explicitly
  communicates that historical replay is not yet available** (it does not hide the feature silently or
  fake a timeline).

### 3.11 Evidence access & relationship confidence

**[BIBLE]** Evidence never renders on the canvas (counts are its only trace); the inspector shows a
source-attributed list; click-through to the underlying story leaves the Network. Relationship
confidence is edge continuity; an edge-select opens a relationship dossier (direction, type, strength,
confidence, recorded/derived, first seen, persistence, evidence, predictions). **[IMPLEMENTED /
CH3]** — carry forward; source confidence/evidence counts from `relationship_snapshots`, not client
counts.

### 3.12 Cross-asset & geopolitical / macro representation

- **Cross-asset.** **[BIBLE]** a multi-exposure asset sits with its strongest cluster and keeps
  visible edges to the others; industry is "the switchboard between themes and tradeable
  expressions." **[CH3]** carry forward; ensure cross-asset edges come from the sealed relationship
  record.
- **Macro / geopolitical (REFINED · G-3).** **[BIBLE]** represented via the **Macro Driver** class
  (rates, liquidity, geopolitics, capex; drivers have no direction — their consequences do).
  **Decision: do NOT create a separate geopolitical intelligence architecture.** Geopolitical events
  stay within Argus's canonical **Driver / Event / relationship** model. **[CH3]** Chapter 3
  *anticipates* richer **driver/event subtypes** and canonical **transmission relationships** where
  geopolitics requires them — e.g. conflict, sanctions, tariffs/trade restrictions, elections/political
  transitions, regulation/government action, shipping/logistics disruption, diplomatic escalation,
  resource restrictions — transmitting through commodities, FX, rates, sovereign risk, industries,
  supply chains, themes, companies, and other assets. **The Network may display such a relationship
  only when it is supported by canonical Argus intelligence/evidence** (a sealed or R2-`recorded`
  relationship, or an honestly-`derived` `curated_ontology` hop rendered as derived); it must **never**
  invent a geopolitical edge merely because it is economically plausible.
  **Knowledge-Model determination:** the existing ontology appears to express this cleanly **without a
  new object** — geopolitics is already the Macro Driver class, "event" is a canonical object, and the
  relationship vocabulary is **open/verbatim** (any `relationship_type` string is carried through the
  `rel_uid`), with the `basis`/provenance flag distinguishing recorded from ontology-derived. So the
  richer subtypes are, on current evidence, **typed values within existing objects**, not new objects.
  This remains a **check, not a settled amendment**: a Knowledge-Model amendment is flagged **only if**
  a specific geopolitical driver/event subtype or transmission relationship genuinely cannot be
  represented by a typed Driver/Event + the open relationship vocabulary (§3.23, G-3). No amendment is
  made here.

### 3.13 Empty & uncertain states

**[BIBLE]** first-class: "sparse days look deliberately sparse, never padded"; refusals are first-class
answers; four designed uncertainty patterns; the Voice model's recorded/derived/gated/absent states.
**[CH3]** this is also the failure principle from Chapter 2 §2.13 (F-1/F-2): the Network shows typed
absence, never fabricated nodes/edges to avoid looking empty. The removed intraday-replay fabrication
must never return.

### 3.14 The premium visual upgrade — execution, not a new identity

The founder wants a substantial premium upgrade: vibrant-but-institutional, dark/high-contrast,
stronger lighting/depth/glow, excellent legibility, meaningful use of Argus's colors, sophisticated
motion, hierarchy obvious within seconds, "significantly more premium than the current elementary
graph," inspired by the polish/vibrancy/lighting/chart-quality/readability of products such as
Robinhood Legend while keeping an original Argus identity.

**[BIBLE + CH3] Framing:** the premium *visual language* is **already canon** — the Bible's Part 2
(lighting, depth, color, motion, stillness), Part 3/3A (object vocabulary + Form Language), and Part 6
(the closed motion table) define a premium, distinctive look, and the ban list already forbids the
decoration Robinhood-derived inspiration could smuggle in (ambient particles, breathing, pulses,
parallax). **So the gap is execution quality, not visual definition:** the *current renderer is
elementary relative to the Bible it is supposed to implement.* Chapter 3's premium work is to
**execute the Bible to that fidelity** — depth/lighting/glow used as *meaning* (glow only on the one
active path; size = tier; opacity = provenance/strength; edge treatment = strength/confidence/
provenance; color = state), legibility and hierarchy first — and to **borrow craft, not identity**
from Robinhood Legend (rendering polish, contrast discipline, chart readability), while every genuinely
new visual element lands as a **Bible V2.x amendment**, never as a silent restyle over the protected
Form Language and signature gestures. **The Network feels alive because the market changes, not
because things animate** (§3.15). "Vibrant" must remain "one bright thing at a time."

### 3.15 Motion & animation rules

**[BIBLE — carry forward verbatim]** the closed motion table (bounded durations) + the permanent ban
list (no breathing, orbiting, marching dashes, ambient particles, looping pulses, parallax, hover
wobble, celebration effects); "one bright thing at a time" (the selected path); the protected Seal
beat (a prediction resolving — one 300ms fill to verdict) and the other signature gestures. **[CH3]**
the canonical renderer's **event-driven, zero-idle-rAF** motion model **[IMPLEMENTED]** is the correct
model and must be preserved through the premium upgrade; the legacy constant-rAF cinematic engine is
**not** the target and is retired with the M&A migration (§3.21).

### 3.16 Performance budgets

**[BIBLE]** qualitative (≈25–50 entities default; bounded motion durations). **[V1]** numeric (60fps
transitions on a mid laptop, idle CPU ≈0, render-on-demand). **[IMPLEMENTED]** the canonical stack
already honors these (render-on-demand, DPR cap ≤2, memoized layout, cached atmosphere layer, counts
bounded at source). **[CH3]** as the entity-centric N-hop view (§3.9) and the sealed-relationship
projection (§3.3) add nodes/edges, keep an **explicit node/edge budget with graceful thinning** (drop
to the strongest edges, never freeze), and keep idle CPU ≈0. Budgets are tunable, not identity.

### 3.17 Desktop behavior

**[BIBLE]** Part 5 — the stage (canvas ≈two-thirds, inspector ≈one-third, one frame; ultrawide rules;
keyboard). **[IMPLEMENTED]** on the Feed. **[CH3]** carry forward; the entity-centric focus and the
richer inspector (§3.8–3.9) live within this stage.

### 3.18 Mobile degradation — the real gap

**[BIBLE]** a genuine mobile *strategy* exists: "Mobile receives the objects, not the canvas: the
focal card, the causal chain as a swipeable vertical sequence, the inspector as the native reading
surface, change chips… the constellation remains a desktop instrument; the language travels without
it." **[IMPLEMENTED as BROKEN]** — reality is *degrade-by-hiding*: the inspector/story is entirely
`hidden lg:flex` (disappears below `lg`), the canvas merely shrinks, and there is **no touch handling
at all** (only mouse events; pan and pinch-zoom are non-functional on phones). **[CH3 / LATER IMPL]**
implement the Bible's objects-not-canvas mobile mode: on small screens present the focal card + the
causal chain as a swipeable vertical sequence + the inspector as the primary reading surface + change
chips — and ensure the desktop canvas has real touch (tap-select, drag-pan, pinch-zoom) so it is not
merely inert. Mobile is a first-class delivery of the *language*, not a shrunken canvas.

### 3.19 Accessibility & legibility

**[BIBLE]** reduced-motion (transitions become instant state changes), color independence (direction
and provenance co-encoded by glyph *and* line style, not color alone), contrast, and — importantly —
**the inspector is the screen-reader's view of the graph** (the canvas exposes selection/hover as
structured text). **[IMPLEMENTED]** (reduced-motion honored; glyph co-encoding present). **[CH3]**
treat the inspector-as-accessible-view as a hard requirement of the convergence: because the inspector
renders canonical prose, accessibility and the "never decode the graph" mandate are the same
requirement satisfied once.

### 3.20 What Chapter 3 extends vs supersedes in the Bible

- **Extends (via later V2.x amendments — flagged, not made here):** per-edge recorded life + trend +
  explanation on the canvas grammar (§3.5); per-node degree + "why it matters" (§3.4); intent-driven
  expansion + any-node N-hop focus (§3.9); the sealed-relationship data boundary (§3.3); the honest
  replay-when-archive-matures rule (§3.10); the objects-not-canvas mobile mode as an implementation of
  the Bible's stated strategy (§3.18).
- **Reconciles (already made):** the "operating system" terminology (Bible V2.4, §3.0).
- **Supersedes:** **nothing** in the Bible's philosophy, identity, Form Language, motion table, ban
  list, or signature gestures. The only thing Chapter 3 sets aside is the **V1 fixed-column layout**
  as the visual identity (it was V1 engineering, not Bible), in favor of the Bible's own center-left
  causal-fan composition (§3.6).
- **Governance (APPROVED · G-5).** Every extension above touches implementation-level grammar, not
  Parts 0–2 / the identity statement / the Five-Second Test / the Form Language / the anti-patterns,
  so each lands as a **V2.x** amendment to the Bible, not a V3.0 successor, and **none is made in this
  chapter.** Hard rule: **a change that actually crosses that protected boundary must be explicitly
  escalated to V3.0 — never silently classified as V2.x.** The premium upgrade (§3.14, G-4) executes
  and *deepens* the existing Form Language, borrowing *craft* — lighting, contrast, depth, chart
  legibility, hierarchy, rendering polish — not identity, from reference products; any genuinely new
  visual **primitive** goes through the Design Bible amendment process.

### 3.21 The second-graph removal / migration plan (classify, do not implement)

Per the founder: audit and identify what to absorb; **do not delete or migrate yet.**

| Path | State | Plan (later) |
|---|---|---|
| `lib/network/model.ts` + `IntelligenceNetwork` (Feed, Dossier) | **[IMPLEMENTED]** canonical, clean, deterministic layout — but currently manufactures edges from theme fields | **Surviving canonical Network — for its deterministic projection/layout responsibilities only.** Its **heuristic relationship-generation is migration debt that disappears** once the reconciled canonical relationship read model (§3.3) is consumed; thereafter it *projects* relationships, never manufactures them |
| `causalMap.buildRelationshipMap` + `ExplorerGraph` + client singleton (Drawer, Explorer) | **[IMPLEMENTED]** richest relationship grammar/interaction, but client-session-scoped and clock-derived | **Absorb, then retire:** move per-edge life/trend/explanation, N-hop focus, and intent-expansion into the canonical Network (sourced from sealed records); then point Drawer/Explorer at the canonical projection |
| `components/graph/NetworkGraph` (M&A page) | **[IMPLEMENTED]** legacy cinematic; dormant synthetic replay | **Migrate M&A onto the canonical renderer;** delete the constant-rAF engine and the synthetic replay |
| `lib/marketMap.ts` `buildMarketMap` | **[IMPLEMENTED]** fully **dead code** | **Delete** (keep only the still-used `MarketSnapshot` type / re-exports until those move) |

Absorb-before-delete is the rule: the `causalMap` grammar is the best in the product and must not be
lost. **No code is changed in this chapter.**

### 3.22 Data & engine gaps preventing the desired experience

- **G-DATA-1 (the keystone).** The sealed relationship record exists (identity + snapshots +
  transitions, §3.3) but **no frontend consumes it**, and there is **no single reconciled read model** —
  only per-table raw endpoints. The gap is a backend **relationship read-model projection** (reconciling
  the authority hierarchy into one per-relationship contract) plus its frontend consumption — a
  *consumption/projection* gap, **not** a new reasoning engine. **[CANON tables · UNCONSUMED / LATER IMPL]**
- **G-DATA-2. Honest replay** requires the sealed daily archive to **satisfy its credibility/
  completeness requirements** (Institutional Memory / Reasoning canon). Until then replay stays absent
  and says so (§3.10, G-2). **[NEEDS DATA]**
- **G-DATA-3. Temporal "what changed"** at full fidelity depends on `relationship_transitions` being
  populated over time and (for scheduled/known-future change) the economic-calendar/`Event` provider
  flagged in Chapter 2 (§2.15 D-F). **[NEEDS DATA]**
- **G-DATA-4. Geopolitical transmission** stays inside the canonical Driver/Event/relationship model
  (§3.12, G-3): richer subtypes are typed values within existing objects + the open relationship
  vocabulary, displayed only when supported by canonical evidence. A Knowledge-Model amendment is
  flagged **only if** a specific subtype genuinely cannot be typed — a *check*, not a settled gap.
  **[G-3 · KM check]**
- **G-ENGINE-1.** Trend/strength must come from **sealed records** (`relationship_snapshots` /
  `relationship_transitions`), not the device clock; the current `causalMap` trend is session-scoped.
  Fixing this is part of G-DATA-1's wiring. **[LATER IMPL]**

Nothing here proposes a *new reasoning engine*; the reasoning already exists (Chapter 2). The gaps are
consumption (the read model), data maturity (archive / transitions / calendar), and one geopolitical
Knowledge-Model check — none a new engine.

### 3.23 Decisions — resolved this revision, and the remaining checks

**G-1…G-5 are RESOLVED (folded into the sections above), and the relationship-authority hierarchy
(§3.3) is resolved.** What remains is one *check* and a set of *implementation/data* items — no open
architectural decision:

- **G-1 — Layout identity. RESOLVED** → Bible center-left causal-fan with left→right propagation;
  spatial/organic yet deterministic; V1 fixed columns set aside as an implementation artifact (§3.6).
- **G-2 — Replay. RESOLVED** → absent until the sealed archive meets credibility/completeness; never
  synthesized; explicitly communicated as "not yet available" (§3.10).
- **G-3 — Geopolitical. REFINED/RESOLVED** → no separate geopolitical architecture; typed Driver/Event
  subtypes + open relationship vocabulary, evidence-gated (§3.12). **Remaining: a Knowledge-Model
  *check*** — raise an amendment only if a specific subtype cannot be typed. Preliminary determination:
  no new object appears required.
- **G-4 — Premium vs Form Language. RESOLVED** → execute/deepen the Bible's language; craft-not-
  identity from references; new visual primitives via the Bible amendment process (§3.14, §3.20).
- **G-5 — Governance. RESOLVED** → §3.20 extensions are **V2.x** Bible amendments; any boundary-
  crossing change escalates to **V3.0**, never a silent V2.x (§3.20).
- **Relationship authority — RESOLVED (§3.3)** → identity (`institutional_relationships`) → sealed
  state (latest `relationship_snapshots`) → history (`relationship_transitions`) → projection (R2);
  one backend-reconciled read model; recorded-vs-derived preserved and never confusable.

**Remaining before/at implementation (not chapter-blocking, no decision owed):** build the backend
reconciled relationship read model (§3.22 G-DATA-1); archive maturity for replay (G-DATA-2);
`relationship_transitions` population + the Chapter 2 event-calendar for temporal (G-DATA-3); and the
G-3 Knowledge-Model check *when a geopolitical subtype is first needed*.

### 3.24 Migration implications (stated, not implemented)

- **Order:** (1) wire the sealed relationship object to the canonical Network (§3.3) — precondition for
  everything; (2) absorb `causalMap` grammar/interaction onto that projection (§3.5, §3.9); (3) point
  Drawer/Explorer at the canonical Network and retire `causalMap`/the client-graph edge derivation;
  (4) migrate the M&A page onto the canonical renderer and delete the legacy cinematic engine + dead
  `buildMarketMap`; (5) implement the objects-not-canvas mobile mode + real touch (§3.18); (6) add
  honest replay only once the archive matures (§3.10).
- **Ordering constraint from Chapter 2:** this sits after (or alongside) the D-3 reasoning-consumption
  convergence — the Network projecting canonical *relationships* is the graph-shaped instance of "one
  intelligence, many projections." Absorb-before-delete throughout; no capability is lost.
- **Risk to avoid:** shipping the premium visual upgrade on top of *manufactured* edges — that would
  make a beautiful, authoritative-looking graph of relationships Argus has not actually recorded
  (Chapter 1's most dangerous failure mode). Data convergence (§3.3) precedes visual investment.

*End of Chapter 3 (APPROVED). No product code changed; no graph migrated; no second path deleted.
The only canon edit in that step is the A1 terminology reconciliation to the Network Design Bible
(V2.4), authorized in the Chapter 2 closeout.*

---

## Chapter 4 — Entity Intelligence & the Company Experience

*Draft for review. This chapter makes a company a **first-class intelligence object** — not a ticker
page — by defining the **Company Panel → Intelligence Explorer → Institutional Dossier** as three
**progressive depths of one canonical Entity Intelligence (company kind)**, not three independent
company systems. It inherits Chapter 2 (one canonical intelligence → many projections; push leads,
pull follows) and Chapter 3 (one canonical relationship model → every company surface sees the same
market relationships). It defines behavior, boundaries, and a convergence direction — not code, and
no new company reasoning engine. Grounded in a read-only code audit (2026-07-31); every product claim
is tagged. Visual identity remains the Design Bible's; premium execution follows Chapter 3's
craft-not-identity rule.*

**Status legend:** **[IMPLEMENTED]** verified in code · **[CANON · UNCONSUMED]** built/sealed but
not consumed by the company surfaces · **[LEGACY-DEBT]** migration debt · **[CH4]** a proposal in this
chapter · **[NEEDS DATA]** requires new/matured data · **[LATER IMPL]** requires later implementation.

### 4.0 Inheritance and non-negotiables

Two rules from earlier chapters govern everything here and are not re-opened:

- **One canonical Entity Intelligence, many depths** (Chapter 2). Panel, Explorer, and Dossier are
  *projections at increasing depth of the same assessment of the company* — they may differ in
  breadth, interactivity, and voice; they may **never** disagree about what Argus believes.
- **One canonical relationship model** (Chapter 3). Every company surface projects the sealed
  relationship read model (identity → snapshots → transitions → R2), never a per-surface graph.

The founder's mandate is explicit: **do not preserve a separate company reasoning system merely
because one currently exists.** Chapter 4's core is therefore a *convergence*, not a redesign of
reasoning.

### 4.1 The core finding — one Entity kind, shipped as two parallel brains

Company is already, canonically, **a kind of one Entity Intelligence grammar**: `admitUid` gates
`company:ticker:<T>` as the `company` kind alongside `event`; `/company/<T>` redirects to
`/intel/company:ticker:<T>`; the Dossier is a pure projection with typed absence
(`lib/intel/dossier.ts`, `components/intel/CompanyDossier.tsx`, `app/company/[ticker]/page.tsx`).
**[IMPLEMENTED]**. But the *lived* company experience is **two independently-sourced brains that merely
share a ticker** (verified):

- **Brain A — Drawer (Tier 1) + Explorer (Tier 2):** the **client** intelligence-graph singleton +
  `crossIntel.what` (a **templated** "current read" string) + client `predictionEngine` (the "forward
  view") + **device-local `localStorage`** memory (`buildTimeline`). Addressed by **ticker/graphKey**.
- **Brain B — Dossier (Tier 3):** **feed projection** + **backend M3** sealed memory and prediction
  ledger + `standingSentences` (an **independent** thesis composition, **no forward view**) +
  `buildNetworkModel`. Addressed by the **canonical uid**. The cleanest tier — no fabrication.

And crucially: the canonical reasoning engine (`app/explanations.py`, `explain()`) feeds the **event**
dossier, **not** the company — so a company's "Argus opinion" is *not* produced by the canonical
Explanation anywhere today. Six verified split-brain points for the same company: **thesis text**
(templated `crossIntel.what` vs independent `standingSentences`); **forward view** (client forecast vs
backend ledger / none); **memory** (device `localStorage` vs backend M3 archive); **network**
(`causalMap` vs `buildNetworkModel`); **events** (none/sample vs attributed record); **identity**
(ticker vs canonical uid). **[LEGACY-DEBT]** — this is the debt Chapter 4 targets.

### 4.2 The one canonical company assessment (the convergence spine)

**[CH4]** There must be **one canonical assessment of a company** that all three tiers project:

- **Its reasoning** comes from the **one reasoning authority** via the **already-canonical
  `explain(uid)`** — *not* a new schema, and *not* the event schema reused. The Reasoning Engine
  contract already defines `explain(uid)` as **kind-appropriate**: for an Entity/company file it
  accumulates the *same* sections **per UID** — the **Standing View voices §3–4** (position/delta: the
  standing read) and the **Event Record lists §1–2** (identity/evidence) **per event**
  (`ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1`, consumer table). `app/explanations.py` today ships only
  `explain(event)` (event-keyed: `event_uid`, R0 "what happened") — the **company/entity projection is
  IRE-5, defined-but-unimplemented**: a *consumption/implementation* gap, **not** a contract redesign
  and **not** a new engine. Implementing it **retires** `crossIntel.what` and the independent
  `standingSentences` as *sources*; both become presentation of the one `explain(uid)`. The rule
  (verified against the contract): **one reasoning authority → kind-appropriate canonical assessment →
  Panel/Explorer/Dossier projections** — never a generic event schema forced onto every kind.
  **[CANON contract · UNCONSUMED for company / LATER IMPL (IRE-5)]**
- **Its relationships** come from the Chapter 3 sealed relationship read model — one graph across
  Panel, Explorer, and Dossier (retiring the `causalMap`-vs-`buildNetworkModel` split for company).
- **Its memory, predictions, and outcomes** come from the **backend M3 archive/ledger** everywhere
  (retiring the device-local `localStorage` timeline in the Explorer). The Dossier already does this
  correctly and is the template.
- **Its identity** is the **canonical uid** everywhere (retiring ticker/graphKey addressing in the
  Drawer and Explorer).

The company's forward-looking view is governed by Chapter 2's accountability stance and Chapter 1's
no-fabrication law: the accountable position is the **canonical read + the registered Prediction
Ledger**; a client probabilistic "forward view" may survive only if it is unmistakably a **derived
estimate**, never dressed as the company's recorded position (§4.8, decision I-3).

### 4.3 Panel → Explorer → Dossier — the progressive-depth boundaries

The generalized ladder from Chapter 2 (summary → explanation → exploration → institutional depth),
instantiated for the company kind. All three project the **one assessment** (§4.2):

| Depth | Surface | Question it answers | Emphasis |
|---|---|---|---|
| **1 · Summary** | **Quick Company Panel** (evolves `IntelligenceDrawer` company view) | "What is this company and what matters about it right now?" | glance; identity + the canonical lead + paths deeper |
| **2 · Exploration** | **Intelligence Explorer** (`/explore/company:<T>` → canonical uid) | "Let me investigate — thesis, why, evidence, relationships, chart, developments, what changed, what to watch." | interactive, current, investigative |
| **3 · Institutional depth** | **Institutional Dossier** (`/intel/company:ticker:<T>`) | "Show me the sealed record — events, memory, predictions/outcomes, evidence, relationship history." | recorded, historical, accountable |

**The Explorer↔Dossier boundary (the boundary the founder asked us to fix):** the **Explorer is the
live investigative read** (current thesis + interactive exploration + the intelligence chart); the
**Dossier is the sealed record** (what Argus recorded and when, accountability, relationship history).
They are **the same assessment at two emphases** — current/interactive vs recorded/historical — and
must never disagree. Anything on the Explorer that is a *conclusion* is the same conclusion the
Dossier records; anything on the Dossier that is *live context* is the same the Explorer shows. The
Panel is the shallow projection of both.

### 4.4 Tier 1 — the Quick Company Panel

**Founder intent:** selecting a company (e.g. Nvidia) should first present a concise, premium panel of
immediately useful context + the canonical lead + clear paths deeper.

**Verified today:** the Drawer's company branch shows name/ticker, parent theme, price/vol/cap, a
templated "Current Read," active themes, a client forward view, and an evidence preview — but **no
sector line, no description, no CEO**, memory suppressed, network suppressed to a text "spine".
**[IMPLEMENTED, thin]**.

**[CH4] The Panel should carry:** company **name/ticker**; **share price and relevant movement**;
**industry/sector**; a **concise description/background**; **CEO/key identity where useful**; **"what
matters now"** and **important current Argus intelligence** (the shallow projection of the one
canonical read, §4.2); and **clear paths** into the Explorer and Dossier. Identity fields
(name/sector/description/CEO) are **descriptive context, not Argus intelligence** (§4.9) and must be
visibly distinct from Argus's assessment. The Panel is a **projection depth of the one assessment**,
not its own reasoning — so it retires `crossIntel.what` as its "read."

### 4.5 Tier 2 — the Intelligence Explorer

**Founder intent:** a substantially richer investigation — price/chart, current thesis/theses, why
Argus believes them, supporting *and* contradicting evidence, themes affecting the company,
upstream/downstream relationships, macro/geopolitical exposure where supported, developments/events,
institutional memory, prediction/outcome history, what changed, catalysts, risks/falsifiers, what to
watch.

**Verified today:** the three-column workspace exists (`app/explore/[entity]/page.tsx`) with the read
column (thesis/forward/drivers/watch), a tabbed Market View + Intelligence Network, and an
evidence/timeline/evolution column — but the thesis is the templated `crossIntel.what`, the forward
view is the client `predictionEngine`, the timeline is **device-local `localStorage`**, the network is
the `causalMap` client path, and several panels (Conviction History, Catalyst Timeline, Theme
Exposure) fall back to **badged SAMPLE scaffolding** on thin entities. **[IMPLEMENTED, split-brain +
sample scaffolding]**.

**[CH4] Convergence:** the Explorer becomes the **interactive projection of the one canonical
assessment** — thesis + why from the canonical Explanation; evidence (support **and** contradiction)
from canonical evidence; relationships from the Chapter 3 read model; memory/predictions from backend
M3; developments from the attributed event record (§4.7); catalysts/risks/falsifiers/what-changed/
watch from the same Explanation sections. **SAMPLE scaffolding is replaced by typed absence** (§4.13):
a thin company looks honestly thin, never sample-filled.

### 4.6 The premium intelligence chart

**Verified today (important):** the chart is **not elementary** — `components/explore/MarketView.tsx`
is a sophisticated, **hand-rolled SVG** terminal (candlesticks / line+area / volume / crosshair / pan
/ wheel-zoom / ATR·RSI·liquidity), **no charting library**. Price is **real** FMP (live quote + daily
EOD capped at ~100 bars + optional 5-min intraday, often plan-blocked) and is **never sampled** —
empty states are honest. **[IMPLEMENTED]**. And the **intelligence-overlay harness already exists**:
event markers and a catalyst timeline share the price time axis — but they plot only the Memory
Engine's **internal metric deltas** (conviction_up, evidence_up…), or badged samples; the real
catalyst classes (earnings, FOMC, news) are **unimplemented "future data classes."** **[PARTIAL /
CANON-UNCONSUMED]**.

**[CH4] Direction — an *intelligence* chart, not a decorative one.** The premium work is (a) execution
polish to Chapter 3's craft-not-identity bar (legibility, depth, lighting — Argus's identity, not
Robinhood's), and (b) **wiring the existing overlay harness to canonical intelligence**: align to the
price axis the company's **events/developments** (attributed event record), **Argus predictions**
(M3 ledger, and the Seal-beat when one resolves), **thesis/relationship changes** (`relationship_
transitions`, sealed memory), and **catalysts** (real, from the Chapter 2 event-calendar). Deeper
price history relaxes the ~100-bar cap. **[CH4 / NEEDS DATA / LATER IMPL]**.

**Epistemic-honesty guard (hard rule).** An overlay marker asserts **temporal coincidence and, where
one exists, Argus's *attributed* explanation — never causation from proximity.** A marker links to the
canonical Explanation that connects the event to the move *if and only if* such a canonical
attribution exists; absent it, the marker states only "an event occurred here," never "this caused the
move." Price is descriptive context; it never becomes an Argus causal claim it has not recorded
(Chapter 1 §1.4, Chapter 2 §2.13). "What Argus believes explains the movement" is shown only when
Argus has actually recorded that belief.

**Visual enforcement (I-4).** The distinction is enforced **visually, not only textually**: a marker
must **not** imply stronger causal confidence — through prominence, connector treatment, labeling, or
animation — than the underlying intelligence supports. A coincident-but-unattributed event is quiet
and unconnected; only an Argus-*attributed* one earns the connector and the causal sentence.
**The long-term Argus Intelligence Chart** lets a user move through time and understand, at any point:
what the stock did · what happened around it · what Argus believed then · what changed in the thesis ·
what Argus predicted · what eventually happened · which relationships strengthened/weakened · and what
Argus **actually attributed** to the movement — every layer sourced from canonical records, never
inferred from proximity.

### 4.7 Tier 3 — the Institutional Dossier

**Verified today:** the Dossier is the **cleanest** company surface — one column, fixed order
(Masthead, Standing View, Event Record [direct], Related Market Developments [exposure-attributed],
Relationship Map, Institutional Memory [backend M3], Prediction Ledger [backend M3 + calibration
gate], Watch), pure projection with **typed absence everywhere and no fabrication**
(`CompanyDossier.tsx`, `lib/intel/dossier.ts`). **[IMPLEMENTED]**. It is the template the other tiers
converge toward.

**[CH4]** The Dossier remains the **record/institutional view** and keeps its sections. Two small
gaps: its **Relationship Map does not navigate** (dead-end viz — make nodes deep-link to the focal
entity, as the Explorer graph does); and the canonical **`relationship_exposure` development class is
defined but never emitted** (returns null "never guessed") — it populates once the Chapter 3 sealed
relationship read model is consumed. The Dossier should read the **same canonical assessment and
relationship model** as the Panel/Explorer (it already reads backend M3 for memory/ledger; it should
read the canonical company Explanation for its Standing View rather than composing an independent one).

### 4.8 Prediction / memory / relationship integration

- **Forward-looking intelligence (refined I-3) — two distinct concepts.** Convergence does **not**
  remove forward-looking company intelligence. Argus keeps answering *what it believes is likely next,
  why, with what confidence, and what would invalidate it* — via two related-but-distinct objects:
  - **Current Forward View** = the **canonical** reasoning's read of what may happen next, with
    evidence, confidence, **assumptions**, and **falsifiers** — from `explain(uid)` (§4.2), not a
    client forecast. The canonical engine **deliberately emits no probability** (`explanations.py`:
    "probability always null"), so the Forward View's certainty is the canonical **confidence band**,
    never a manufactured percentage.
  - **Prediction Ledger** = the sealed/**accountable** predictions Argus *chose to register*, with
    outcomes and calibration (backend M3 — already on the Dossier). A current thesis does **not**
    automatically become a registered prediction; it enters the ledger only when Argus makes a
    sufficiently explicit/testable forecast, by that ledger's canonical rules.
  The client `predictionEngine` **must not survive as an independent source of Argus truth** — the
  browser may not manufacture a second forecast that can disagree with canonical intelligence.
  **Absorb-before-retire:** its epistemically-valid mechanics — qualitative direction/scenario
  derivation, invalidation conditions, decomposed claim→evidence reasoning steps, honest
  `insufficient_signal` states — may be absorbed into the canonical reasoning/presentation; its
  **manufactured probability is not absorbed** (the canonical stance withholds probability by design).
  **[IMPLEMENTED on Dossier only · client engine = LEGACY-DEBT retire-as-authority]**
- **Memory.** **[IMPLEMENTED on Dossier]** backend M3 sealed archive; **[LEGACY-DEBT on Explorer]**
  device-local `localStorage` "tracking begins today." **[CH4]** all tiers read the **backend sealed
  archive**; the device-local timeline is retired (Chapter 2 §2.14 D-6).
- **Relationships.** **[IMPLEMENTED, split]** Dossier `buildNetworkModel` vs Explorer `causalMap` vs
  Drawer suppressed-to-spine. **[CH4]** one Chapter 3 relationship projection across all three; absorb
  `causalMap`'s per-edge grammar and interaction (Chapter 3 §3.5/§3.9) into it.

### 4.9 Company identity / profile data

**Verified today:** name/sector/exchange come from a **static ~130-ticker dictionary**
(`lib/tickerMetadata.ts`); market cap/beta/52-week are **real FMP**. **CEO and company description do
not exist at all** — FMP's `/profile` returns both, but the adapter parses only
name/price/cap/beta/range/exchange/sector and **discards `ceo` and `description`**
(`lib/dataAdapters/marketData/fmp.ts`), and the market VM drops sector too. **[NOT-PRESENT — but
trivially available]**.

**[CH4]** Read CEO, description, sector, and other identity fields from the profile the adapter
already fetches. **Boundary:** this is **descriptive identity/context** (permitted descriptive market
data), **not Argus intelligence** — it must be presented as identity, visually and epistemically
distinct from Argus's assessment, and never dressed as reasoning. A concise Argus-authored "what this
company is to the market" is *intelligence* and comes from the canonical assessment, not from the FMP
description.

**Identity authority (clarification).** Two authorities, cleanly separated:
- **Canonical company identity** = the backend **uid scheme** — `company:ticker:<T>`, minted by
  `app/institutional_memory/identity.py::company_uid(ticker)` ("never guessed into a canonical
  namespace"). The ticker is the key; the uid **is** the identity. The mint is **deterministic for any
  ticker** — it already scales far beyond the ~130 dictionary and is **not** a coverage cap. Legal/
  display name is descriptive, not part of the uid.
- **Descriptive profile** (sector, industry, exchange, CEO, description, display name) comes from a
  **profile data source** (FMP today, already fetched then discarded), **cached/persisted** per entity
  — **descriptive context, not Argus intelligence.**
The static ~130-ticker `lib/tickerMetadata.ts` is **bootstrap metadata / migration debt**, **not** the
eventual coverage boundary; keeping it as the canonical company directory would cap coverage at ~130
and contradict universal company search (§4.10). **A new/unsupported company becomes a recognized
Argus Entity** by minting its uid (already deterministic) and resolving + caching its descriptive
profile from the profile source on first reference/search — **the identity authority never gates
coverage; only the descriptive-metadata source does.** No vendor selection or ingestion is decided
here — authority boundary only. **[CH4 · authority boundary]**

### 4.10 Company discovery / search — requirements (Chapter 5 owns the architecture)

**Verified today (the founder's exact pain point):** there is **no company search anywhere**. The
global nav has no search input; the only "search" boxes are **in-graph node filters** (Explorer/
Network) that filter already-present nodes and **do not resolve or navigate to a company**; the
Industries page has **no search box**. **You cannot type "NVDA" or "Nvidia" and reach the company** —
the canonical routes are reachable only by clicking a pre-existing chip/node or hand-typing the URL.
**[NOT-PRESENT]**.

**[CH4] Requirements (behavior only; Chapter 5 owns the full Universal Search architecture):**
- A user must be able to resolve a **name or ticker → the canonical company uid → the company
  experience**, without navigating Industries manually.
- Resolution goes **through the canonical uid** (`company:ticker:<T>`), never an ad-hoc ticker string;
  search must **not** become a second entity resolver or a second identity scheme.
- Default entry **opens the Quick Panel** (summary depth), with one gesture into Explorer/Dossier.
- Search returns **canonical entities**, honestly (no fabricated matches); an unknown ticker is a
  typed "not covered," consistent with the Dossier's "Argus does not guess."
- This is **not** the full search surface — Chapter 5 defines the omnibox, its scope (themes,
  industries, events, assets, later), and where it lives in global navigation (Chapter 1 U3).

### 4.11 Navigation & identity addressing

**Verified:** entry to a company is dominated by **chip → active context → the app-wide Intelligence
Overlay "Focused on" bar → Drawer → Dossier/Explorer buttons** (`EntityChip`/`TickerChip` set context;
chips do **not** deep-link directly); plus Explorer graph nodes, Home "The Read" nodes, Event Dossier
hops, Saved/Listen, and the direct `/company/<T>` URL. **[IMPLEMENTED, indirect]**. Tiers 1–2 key off
**ticker/graphKey**; only Tier 3 uses the canonical uid. **[CH4]** unify on the **canonical uid**
across all tiers and entry paths, so one company = one identity everywhere (prerequisite for search,
§4.10, and for the one-assessment convergence, §4.2).

### 4.12 Mobile

**Verified:** the **Explorer is unusable on mobile** — three **fixed** columns (320 + flex + 360px),
**no breakpoints, no stacking**; on a phone the asides alone exceed the width and the right panel is
clipped. The **Drawer** is partial (92vw cap, dense, no touch). The **Dossier** degrades well (single
column, flex-wrap, stacks). So the **richest tier is the least usable on mobile.** **[Explorer
NOT-PRESENT / Drawer PARTIAL / Dossier IMPLEMENTED]**.

**[CH4]** Apply Chapter 3's objects-not-canvas discipline to the company experience on small screens:
the Explorer stacks into a vertical sequence (identity + chart → the read/thesis → relationships as a
swipeable sequence → developments/record), the chart and graph get real touch (pan/pinch/tap), and the
Dossier's graceful degradation is the baseline. Mobile is a first-class delivery of the company
*intelligence*, not a shrunken three-column desktop workspace.

### 4.13 Epistemic honesty & failure principles

Inherited from Chapter 2 §2.13 and Chapter 1, made specific to the company:
- **Typed absence, never sample.** Retire the Explorer's SAMPLE scaffolding (Conviction/Catalyst/
  Theme-Exposure) — a thin company looks honestly thin. The Dossier's typed-absence model is the
  standard.
- **Identity ≠ intelligence.** FMP descriptive fields are context, never Argus reasoning (§4.9).
- **Price proximity ≠ causation** (§4.6).
- **One recorded position.** The accountable forward view is the M3 ledger; client estimates are
  labeled derived (§4.8).
- **Degrade toward the canonical source, never a legacy engine** (retire `crossIntel`/client
  `predictionEngine`/device memory as the company's *sources*).

### 4.14 Migration debt (classify — do not remove)

| ID | Debt | Evidence | Target |
|---|---|---|---|
| **C-1** | Two parallel company brains (client graph+`crossIntel`+`predictionEngine` vs backend-M3+`standingSentences`) | §4.1 (six split-brain points) | one canonical company assessment (§4.2), three depths |
| **C-2** | Company thesis/"read" is templated `crossIntel.what` / independent `standingSentences`, not the canonical `explain()` | `crossIntel.ts`, `dossier.ts` `standingSentences`; `explain()` serves events only | project the company-kind Explanation |
| **C-3** | Explorer memory is device-local `localStorage` | `intelligenceShared.buildTimeline`, `memoryEngine` | backend M3 sealed archive (Dossier already does) |
| **C-4** | Company relationship graph split (`causalMap` vs `buildNetworkModel`) | §4.8 | one Chapter 3 relationship read model |
| **C-5** | Explorer SAMPLE scaffolding (conviction/catalyst/theme-exposure) | `MarketView.tsx` `sampleConviction`/`sampleEvents` | typed absence / canonical data |
| **C-6** | Tiers 1–2 address by ticker/graphKey, not canonical uid | `IntelligenceDrawer`, `explore/page.tsx` | canonical uid everywhere |
| **C-7** | CEO/description discarded from FMP; sector dropped from VM; **static ~130-ticker dict is bootstrap debt, not the coverage boundary** | `fmp.ts` parser; `intelligenceShared` VM; `lib/tickerMetadata.ts` | descriptive profile from a cached profile source; uid mint (deterministic) is the identity authority (§4.9) |
| **C-8** | Chart overlay plots internal metric deltas, not canonical catalysts/predictions | `MarketView.tsx` overlay; "future data classes" | wire canonical events/predictions/catalysts (§4.6) |
| **C-9** | Dossier relationship map is non-navigable | `IntelligenceNetwork.tsx` (no href) | deep-link nodes |
| **C-10** | No company search/discovery | §4.10 | search requirement (Chapter 5 architecture) |

**No code is changed in this chapter.**

### 4.15 Data & engine gaps

- **G-A. Company-kind reasoning = implement the already-canonical `explain(uid)` (IRE-5).** The
  Reasoning Engine contract already defines `explain(uid)` kind-appropriately (Standing View §3–4;
  Event Record §1–2 per event); only `explain(event)` is implemented (IRE-1, event-keyed). The gap is
  the **entity/company consumer implementation (IRE-2…IRE-5)** — a *consumption/implementation* gap,
  **not a schema reshape and not a new engine**. Retires `crossIntel.what` + `standingSentences` as
  sources. **[CANON contract · UNCONSUMED / LATER IMPL (IRE-5)]**
- **G-B. Real catalysts** (earnings/FOMC/news) for the intelligence chart = the Chapter 2 event-
  calendar/`Event` provider (Chapter 2 §2.15 D-F). **[NEEDS DATA]**
- **G-C. Price history depth** beyond ~100 daily bars (and reliable intraday) for the premium chart.
  **[NEEDS DATA / provider]**
- **G-D. Identity fields** (CEO/description) — trivial: read fields FMP already returns. **[LATER IMPL]**
- **G-E. Macro/geopolitical exposure "where supported"** depends on the Chapter 3 sealed relationship
  model + geopolitical subtypes (Chapter 3 §3.12, G-3). Displayed only when evidenced. **[NEEDS DATA]**
- **G-F. The Chapter 3 sealed relationship read model** is the shared precondition for §4.8 and the
  Dossier's `relationship_exposure` class. **[CANON tables · UNCONSUMED / LATER IMPL]**

None proposes a new company reasoning engine; the reasoning exists (extend its consumption).

### 4.16 What Chapter 4 extends / amends

- **Extends (inherits):** Chapter 2 (progressive disclosure; accountability), Chapter 3 (relationship
  read model), `ARGUS_ENTITY_INTELLIGENCE_V1` (company as the richest kind of one dossier grammar),
  `ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1` (the **already-canonical `explain(uid)`**, implemented as
  IRE-5 — the contract is not changed), `ARGUS_INSTITUTIONAL_MEMORY_V2` /
  `ARGUS_PREDICTION_OUTCOME_LEDGER_V1` (Dossier depth; Current Forward View vs registered Ledger).
- **Amendments flagged (later, through each doc's gate — not made here):** **AE-1** Entity Intelligence
  — record the **three tiers (Panel/Explorer/Dossier) as three depths of one company assessment**, the
  canonical-uid-everywhere rule, the **identity-authority boundary** (uid scheme scales; the ~130 dict
  is bootstrap debt; descriptive profile from a cached source), and the retirement of `crossIntel` /
  client-`predictionEngine` / device-memory as company *sources*. **AE-2** Reasoning Engine — note the
  **entity/company `explain(uid)` consumer (IRE-5)**; no contract change (the `explain(uid)` shape is
  already defined). **AE-3** Knowledge Model check **only if** the intelligence chart's price/overlay
  linkage or a new identity/exposure field turns out to need a new object (likely not — price is
  descriptive, identity is context, exposures use existing relationships).

### 4.17 Decisions — resolved this revision

**I-1…I-5 are RESOLVED (folded above); the reasoning-contract and identity-authority clarifications are
resolved.**

- **I-1 — Panel→Explorer→Dossier. APPROVED** (§4.3): three depths of one assessment; Explorer = live
  read, Dossier = sealed record; overlap allowed where useful, duplicate pages not.
- **I-2 — Canonical company reasoning. APPROVED + CLARIFIED** (§4.2, G-A): use the **already-canonical
  `explain(uid)`** kind-appropriate projection (Standing View §3–4; Event Record §1–2 per event) —
  **not** the event schema reused, **not** a new engine; it is **IRE-5, defined-but-unimplemented**.
  One reasoning authority → kind-appropriate assessment → projections.
- **I-3 — Forward view. REFINED/RESOLVED** (§4.8): preserve the **Current Forward View** (canonical,
  no manufactured probability — canonical withholds it) *and* the **Prediction Ledger** (sealed/
  registered, no auto-promotion) as **distinct** concepts; **retire the client `predictionEngine` as an
  independent authority**, absorbing its valid mechanics (direction/scenario/invalidation/decomposed
  reasoning) but not its probability.
- **I-4 — Chart causation honesty. APPROVED** (§4.6): coincidence + Argus-attributed-only, **visually**
  enforced (prominence/connector/label/animation must not overstate causal confidence); the
  move-through-time Intelligence Chart vision recorded.
- **I-5 — Company-search boundary. APPROVED** (§4.10): Chapter 4 owns requirements + entry behavior;
  Chapter 5 owns the omnibox/global-nav/non-company architecture.
- **Identity authority — RESOLVED** (§4.9): canonical identity = the deterministic **uid scheme**
  (scales to any ticker); descriptive profile = a **cached profile source**; the ~130-ticker dict is
  **bootstrap debt, not the coverage boundary.**

**Remaining (implementation/data — not decisions):** implement `explain(uid)` for the company kind
(IRE-5); real catalysts + deeper price history for the chart (Ch2/provider); cache descriptive profile
from the profile source; consume the Chapter 3 relationship read model; mobile. **Nothing here is an
open architectural decision.**

### 4.18 Migration implications (stated, not implemented)

- **Order (inherits Chapter 3's convergence-first rule):** (1) extend `explain(uid)` to the company
  kind + consume the Chapter 3 relationship read model → **one canonical assessment**; (2) point all
  three tiers at it (canonical uid, backend M3 memory/ledger everywhere) — retire `crossIntel.what`,
  the client company forecast-as-position, the device timeline, and the SAMPLE scaffolding; (3) absorb
  `causalMap`'s grammar into the one relationship projection (Chapter 3) and repoint Explorer/Drawer;
  (4) wire the intelligence chart to canonical events/predictions/catalysts + read the FMP identity
  fields; (5) fix mobile (objects-not-canvas) and make the Dossier map navigable; (6) deliver the
  company-search entry behavior (full architecture in Chapter 5).
- **Hard ordering constraint (from Chapter 3):** **canonical relationship/assessment truth first →
  canonical projection → absorbed interaction grammar → premium visual execution.** Do **not** polish
  the chart or the company visuals on top of the client-brain/templated thesis before the assessment
  convergence lands — a premium company page over a templated `crossIntel` read would be Chapter 1's
  most dangerous failure mode (authoritative-looking, not canonical).
- **Absorb-before-retire** throughout: the Explorer's rich interaction and the chart's harness are
  assets to keep; only their *manufactured/device-local sources* are retired.

*End of Chapter 4 (APPROVED). No product code changed; no company surface modified; no source retired.
No canon amended in that step (the AE-1…AE-3 amendments are flagged, not made).*

---

## Chapter 5 — Universal Search & Navigation

*Draft for review. This chapter defines how a user reaches any canonical Argus object directly —
"you should not need to know where Argus stores something before searching for it." It inherits
Chapter 2 (one canonical intelligence; personalized ranking with a universal floor; auth model),
Chapter 3 (the canonical relationship model), and Chapter 4 (a company resolves to its Quick Panel,
with paths to Explorer/Dossier). It defines the **resolution contract, the search surface, and the
navigation model** — not code, and **not a new intelligence or identity system.** Search resolves
*into* the canonical UID scheme (Chapter 4); it never mints a second one. Grounded in a read-only code
audit (2026-07-31); every product claim is tagged.*

**Status legend:** **[IMPLEMENTED]** verified in code · **[CANON · UNCONSUMED]** built/sealed but not
consumed · **[LEGACY-DEBT]** migration debt · **[CH5]** a proposal in this chapter · **[NEEDS
DATA/INDEX]** requires new data/indexing · **[LATER IMPL]** requires later implementation.

**Status: APPROVED (founder decisions J-1…J-7).**

### 5.0 Non-negotiables inherited (and the locked principles)

- **Search resolves into the one canonical identity, never a new one.** `query → canonical resolution
  → canonical UID → appropriate Argus projection`. Never `query → ad-hoc page result → another
  ticker/name mapping.` (Chapter 4 identity authority.)
- **One intelligence, many projections** (Chapter 2). Search is an *entry point*, not a reasoning
  system; entity resolution is deterministic and trustworthy.
- **Absorb, don't stack.** Argus already has one app-wide focused-entity system (the Intelligence
  Overlay). Universal Search **feeds** it; it does not add a third global interaction layer (§5.6).

**Locked principles (approved, binding on all Chapter 5 implementation):**
1. **A valid but previously unseen company must not be falsely represented as nonexistent** merely
   because Argus has not yet accumulated intelligence about it (the six-state coverage model, §5.3).
2. **FIND must remain deterministic. ASK must operate over canonical Argus intelligence with
   evidence/provenance and must never become the identity resolver** (§5.5).
3. **Search/index implementation may evolve without changing canonical identity** (directory =
   service, index = swappable, §5.16).
4. **Universal Search must make the intelligence architecture easier to access — not create another
   intelligence, identity, focus, or routing system** (§5.6, §5.11, §5.13).

### 5.1 What Chapter 5 must deliver (acceptance intent)

A user should type a name or ticker and reach that entity's intelligence directly — **no navigating
Industries → sector → company.** Search should ultimately resolve every canonical Argus object kind
where supported — **companies, themes, industries/sectors, events/developments, macro drivers,
relevant assets** — always into the canonical UID and its appropriate projection. It must be **fast,
deterministic, and trustworthy for direct entity navigation** (an LLM box is not assumed and is not
the answer for entity resolution), while remaining friendly to non-experts and instant for keyboard
experts. The default company behavior (Chapter 4): **search → canonical company → Quick Panel**, with
one-gesture paths to Explorer and Dossier.

### 5.2 Current-state audit (verified)

- **No global search, no keyboard entry, no palette.** `components/layout/TopNav.tsx` has 7 nav links
  + Refresh/Theme-Terminal/Settings/Account and **no search input**; there is **no sidebar**, **no
  ⌘K / global shortcut** (the keyboard namespace is entirely free), and **no command-palette/omnibox
  scaffolding** anywhere. **[NOT-PRESENT]**.
- **The only "search" boxes are graph-node filters** (`ExplorerGraph`, `IntelligenceNetwork`,
  `NetworkGraph`) — they filter/highlight nodes already on a canvas and **resolve/navigate to
  nothing**. **[IMPLEMENTED as filters, NOT search]**.
- **No name→UID resolver exists.** Resolution is entirely **click-driven**: you resolve an entity by
  clicking a pre-built chip/node. The only name→UID path is `coerce_theme_uid` (themes, exact-slug).
  The canonical UID scheme (`app/institutional_memory/identity.py`) is complete and **deterministically
  mintable for any ticker** — but minting is a pure string transform, **not** a resolver/search.
  **[NOT-PRESENT]**.
- **The Intelligence Overlay is a standalone app-wide focus system** — a routeless module-singleton
  (`lib/intelligenceContext.tsx`) + a "Focused on" bar + the body-portaled `IntelligenceDrawer`;
  `EntityChip`/`TickerChip` **set context, never navigate**. **[IMPLEMENTED]** (see §5.6).
- **Duplicated resolvers/dictionaries** (§5.13): **3 independent ticker tables** (`tickerMetadata.ts`
  ~130, `themeCompany.ts`, `marketMap.ts`), **≥5 non-shared resolvers**, **3 different normalizers**.
  A backend directory table `institutional_entities` exists (uid + `display_label` + `aliases`) but is
  **theme-only and not name-searchable**. **[LEGACY-DEBT / CANON-UNCONSUMED]**.
- **Dead-ends and 3-hop friction** (§5.12): reaching `/company/NVDA` from the UI is a 3-hop
  chip→overlay→drawer→Dossier path; several surfaces show an entity that cannot be opened.

### 5.3 The resolution contract & the canonical entity directory

**[CH5] The one contract:** `query → one canonical resolver → canonical UID → projection`. Search
**never** becomes a fourth resolver or a second identity scheme; it consumes the Chapter 4 identity
authority (the deterministic UID scheme). Identity, discovery, profile, and admitted-intelligence are
**separate concerns** (coverage model below), so a missing index row must never become a false,
permanent "not covered."

**[CH5] The canonical entity directory is a *resolution service*, not a table.** Define it as **one
authoritative canonical entity directory / resolution service, keyed by the canonical UID**, with the
contract: `UID → { display_label, aliases, kinds, coverage-state }` and `label/alias → UID`
(deterministic + fuzzy). Its **current backing store** is the backend `institutional_entities` table
(migration `004`: `uid` PK, `display_label`, `aliases` jsonb, `status`) — today **theme-only** (a CHECK
constraint; comment: "widening requires a new migration") and fetched by UID only. That table is the
right migration target, but the architecture is the **service contract, not a permanent coupling to
one Postgres table**: the durable directory and its **search index are separable** (§5.16), and the
index implementation may change without changing canonical identity. One label/alias→UID resolver
**replaces** the five ad-hoc resolvers (§5.13) — the only new one.

**[CH5] Coverage is six distinct states, not a boolean (refined).** "In the directory" ≠ "Argus covers
it." Verified against on-demand behavior:
1. **Canonical identity exists** — *always* for a valid ticker/kind: the UID mint is a deterministic
   transform (`company_uid("NVDA") → company:ticker:NVDA`), **no directory row required**.
2. **Discoverable / resolvable** — findable by name/alias in the directory **or**, for a valid ticker
   pattern, resolvable **on demand** (mint identity + fetch profile). Resolvability ⊋ directory presence.
3. **Descriptive profile available** — on-demand for any valid listed symbol (`explorer-market` accepts
   arbitrary `SYMBOL_RE` symbols and fetches FMP quote/profile) — descriptive context, not intelligence
   (Chapter 4 §4.9).
4. **Argus has admitted intelligence** — only where the pipeline has actually produced a read (theme
   membership, relationships, events, an `explain(uid)`). The real "does Argus have a view" state.
5. **A projection has sufficient evidence/data** — *per projection*: the chart needs price, the thesis
   needs admitted intelligence, memory needs sealed history, the ledger needs registered predictions.
6. **Genuinely unsupported** — an unresolvable identity or an unsupported kind.

**[CH5] The honest typed-absence model.** A previously-unseen valid ticker can be **minted +
profile-resolved + admitted on demand**, so a missing directory row must **not** become a permanent
"not covered":
- **Valid, resolvable, profile available, no admitted intelligence** → *"Argus has no intelligence on
  this yet"* — identity + price/profile render; intelligence sections are typed-absent — **never "not
  found"** (first reference may trigger admission).
- **Admitted, but a projection lacks data** → per-projection typed absence (the Dossier already does
  this; it generalizes).
- **Genuinely unresolvable** → the only true *"not a covered entity."*
The **directory drives *discovery* (fuzzy find), not the identity/coverage *verdict*.** "Not covered"
is reserved for state 6.

Data-flow (target):

```
  query "nvidia" / "NVDA" / "Semiconductors"
        │  ONE canonical resolver (directory service): label/alias → UID (fuzzy),
        │  OR on-demand mint + profile for a valid unseen ticker  →  identity always resolvable
        ▼
  canonical UID  (company:ticker:NVDA · theme:ontology:… · industry:taxonomy:… · driver:ontology:…)
        │  hand the UID to the focus/projection layer (§5.6) + report coverage-state (typed absence, not false "not found")
        ▼
  Quick Panel (default, company) · or the surface for the kind · with paths to Explorer / Dossier
```
*(Events/developments resolve via a separate ephemeral index, not this durable standing-entity
directory — §5.16.)*

### 5.4 Search modality — options and recommendation

**Options considered:** (a) a traditional always-visible search box; (b) a command palette (⌘K
overlay, keyboard-first); (c) a Bloomberg-style command line (terse verbs + tickers); (d) a modern
omnibox (single field, entity + action + query); (e) a **hybrid**.

**[CH5] Recommendation — a hybrid: a persistent search affordance in the (currently search-less)
TopNav *and* a ⌘K command palette over one engine.** Rationale: the keyboard namespace is free and a
palette gives Bloomberg-command-line *speed* for experts (⌘K → type ticker → Enter) without the
Bloomberg-command-line *hostility* for novices (a visible box, grouped/typed results, plain language).
Both are the same surface and the same resolver — one experience, not two systems. It is **not an LLM
generative box**: entity resolution is a deterministic directory lookup + fuzzy match; the reasoning-
query mode (§5.5) is a *later, separate* capability layered on the same entry, never a generative
substitute for entity resolution.

### 5.5 FIND vs ASK — the two conceptually distinct modes

Two categories, distinct in kind:

- **FIND / NAVIGATE** — `NVDA` · `Nvidia` · `Semiconductors` · `AI infrastructure`: **deterministic
  canonical entity resolution** (name/ticker/label → canonical UID → projection). Fast, deterministic,
  trustworthy. **This is Universal Search v1.**
- **ASK / INTELLIGENCE RETRIEVAL** — `Why is Nvidia falling?` · `Companies exposed to copper` · `What
  changed in AI infrastructure overnight?`: **retrieval/reasoning over canonical Argus intelligence
  with evidence/provenance** — never an ad-hoc generative answer, only evidenced results. A **later
  mode.**

**[CH5] Decision: implement/design FIND now; reserve ASK as the later intelligence-search mode — and
ensure FIND's resolver/directory/UI contract does not constrain ASK.** FIND resolves to UIDs
deterministically over the directory service (§5.3); ASK queries the intelligence model (relationships,
themes, events, deltas) on the Chapter 2/3 convergence + a content index that do **not** yet exist.
They **share the entry surface, not the engine** — so FIND never depends on ASK's reasoning (it stays
deterministic), and ASK is not shipped or fully architected here. Chapter 5 **architects FIND** and
**reserves the slot** for ASK.

**[CH5] One affordance, two modes — not two global systems.** The single global search affordance
(§5.4) can host both without fragmenting: **intent-shaped behavior** (a short entity-like token
resolves as FIND instantly; a natural-language question offers/switches to ASK) plus a clear,
lightweight mode indicator. Result types are visually distinct — FIND yields **resolved entities**
(→ UID → projection); ASK yields **evidenced answers** (claim + evidence + provenance). One control,
two labeled modes, one entry — the way Argus expresses *find* and *ask* without two unrelated surfaces.
Until ASK ships, the affordance is FIND-only and says so honestly.

### 5.6 Relationship to the Intelligence Overlay — absorb, don't stack

**Verified:** the Intelligence Overlay is a **standalone, app-wide focus system** — its own routeless
singleton, its own "Focused on" bar, its own drawer — and it already **owns the "focused entity"
concept** and already bridges shallow→deep (`setActiveContext` → drawer → `/company` Dossier /
`/explore` Explorer). Universal Search's result-selection produces exactly that: a focused entity.

**[CH5] Absorb — but distinguish the *contract* from today's *implementation*.** Universal Search is
the **missing entry point** into the existing focus/projection layer, reusing the whole
overlay→drawer→deep-route pipeline rather than duplicating it. Two refinements:

- **Selection is not one act — it is a ladder, and not every step sets global focus.** Four distinct
  steps: **(1) highlighted/previewed** — arrow through results in the palette with a lightweight
  preview (identity + one-line read), *no* global commit; **(2) Quick Panel opened** — commit
  (Enter/click) to the shallow projection; **(3) entity focused** — the app-wide active lens is set;
  **(4) deep surface navigated** — Explorer/Dossier route. Do **not** assume every selected result
  immediately sets the global focus context; previewing and opening a Panel are lighter than committing
  the app-wide lens.
- **`setActiveContext` is today's *implementation*, not necessarily the long-term *contract*.** It is a
  single-focus module singleton — one active entity at a time. The **canonical interaction contract**
  Chapter 5 defines is abstract: *select a canonical UID → {preview | focus | open}*. Search
  **interoperates with the current `setActiveContext` singleton initially** (absorb), but is written
  against the abstract contract so a future **multi-context** surface (e.g. the Workstation, Chapter 7 —
  multiple entities focused at once) can implement the focus layer differently **without changing
  Search's resolver contract.** Search hands a UID to the focus layer; it does not hard-couple to a
  single global slot.

The "Focused on" pill and the search/command surface — both pinned under the nav, both expressing "the
current entity" — **unify into one focus-and-find control** (find → focus → go deeper), adding **no**
third global system. Chips may additionally gain deep-link affordances (§5.12), but the UID-keyed
focus/projection model remains the spine.

### 5.7 Result behavior, grouping, ranking, absence

- **Default result behavior (company, Chapter 4):** open the **Quick Panel** (via the focus context),
  with one-gesture paths to Explorer and Dossier. Other kinds open their appropriate projection
  (theme/industry/event file or drawer).
- **Entity-type grouping:** results grouped by canonical kind — Companies · Themes · Industries/Sectors
  · Events/Developments · Drivers · Assets — each labeled with its kind.
- **Recent entities & personalized ranking:** recent focuses surface first; result ranking uses
  Chapter 2's personal signals (followed/saved/explored) **within the universal-floor discipline** —
  personalization orders results, it never hides a correct canonical match. **[CH5, inherits Ch2]**.
- **Typed absence / not-covered:** an unknown or uncovered query yields a **typed "not covered yet"**
  (consistent with the Dossier's "Argus does not guess"), never a fabricated match. **[CH5]**.
- **Direct actions (progressive):** beyond navigation, results may expose canonical actions (open
  Panel/Explorer/Dossier; follow/save later) — but v1's core is resolution + navigation.
- **Loading/error states:** honest, fast, non-blocking; a slow index degrades to "still resolving,"
  never to a guess.

### 5.8 Desktop & keyboard interaction

**[CH5]** Persistent search in the TopNav + **⌘K** to open the palette anywhere (namespace free).
Keyboard-first: type-ahead, arrow-key navigation, Enter to open, Esc to dismiss; a company ticker
typed exactly resolves instantly. Expert speed without modality hostility; the palette is discoverable
(the visible affordance advertises the shortcut). No conflict with existing keys (only component-scoped
Escape handlers exist today).

### 5.9 Mobile search

**[CH5]** A real mobile search entry — a full-screen search sheet reachable from the (currently
hamburger-less, cramped-icon) mobile nav — not a shrunken desktop box. This doubles as a fix for the
weak mobile navigation (§5.2): on small screens, *find* becomes the primary way to move, complementing
the Chapter 4 mobile company experience. Touch-first, large targets.

### 5.10 Accessibility

**[CH5]** The palette is an accessible **combobox/listbox** (ARIA roles, managed focus, screen-reader
labels for each result and its kind); keyboard operation is first-class (it is the expert path, so
a11y and expert-UX coincide). Results announce kind + coverage state; "not covered" is announced, not
silent.

### 5.11 Canonical URL & entity-addressing contract

**Verified inventory of today's entity/deep-surface URLs:** `/intel/<uid>` (**the canonical identity
address**; `admitUid` dispatch); `/company/<T>` → **redirects** to `/intel/company:ticker:<T>`;
`/event/<id>` → **redirects** to `/intel/event:cluster:<id>`; `/explore/<entity>` — a **parallel
vocabulary** (`parseExplorerEntity`: `kind:id` *or* a bare ticker, validating nothing);
`/industries/<slug>` — an industry **slug** vocabulary. So identity is addressed **four different
ways**.

**[CH5] The addressing contract — identity and projection are distinct.** Define **one canonical
entity address = the canonical UID (`/intel/<uid>`)**. **Panel / Explorer / Dossier are projections
(depths), not separate identities** — every projection keys off the *same* UID. Concretely:
- Alias routes that **redirect to the canonical UID** (`/company/<T>`, `/event/<id>`) are fine — they
  *converge* on identity. Keep them.
- The `/explore/<kind:id | bare-ticker>` scheme and the `/industries/<slug>` scheme are a **second and
  third addressing vocabulary** — **routing-identity debt** (§5.17, S-10) to converge so the deep
  surfaces address entities by the **canonical UID** (a projection *mode* over `/intel/<uid>`, or an
  explorer route keyed by `<uid>`), not a parallel `kind:id`/bare-ticker/slug string.
- **Universal Search must resolve into the canonical UID and dispatch to the projection — it must not
  introduce a new URL vocabulary.** This is the rule that **fixes resolver-identity debt (§5.13)
  without creating routing-identity debt** in its place.

**Behavior:** selecting a result sets the focus context (Quick Panel, a focus state over the current
route) **and** "open full surface" navigates to the canonical URL, so intelligence is **shareable and
linkable**. Direct-URL dispatch already works cleanly (reserved kinds → typed "not covered," malformed
→ typed invalid); Search resolves into these same routes, never a parallel scheme.

### 5.12 Navigation dead-ends & friction to fix (so no entity is unreachable)

**[LEGACY-DEBT — classify, fix during Chapter 5 work]:**
- **Dossier Relationship Map is a dead-end** (`IntelligenceNetwork.tsx` node click → inspector only, no
  `onNavigate`/href) — a company's own relationship map cannot open its neighbors. Make its nodes
  deep-link (as the Explorer graph already does). **N-1**
- **Story/deal rows and TopStoriesGrid dead-end to the publisher** (external `item.url`; deal tickers
  are plain `<span>`) — entities inside stories aren't reachable. Chip-ify them. **N-2**
- **Industry-detail company chips are context-only** (never links) — reaching a company still needs the
  overlay detour. Universal Search removes the *need* to path through Industries at all; chips can also
  deep-link. **N-3**
- **3-hop company access** (chip → "Intelligence" → "Dossier") — Universal Search makes it 1 step;
  keep the context model but add the direct entry. **N-4**
- **Inconsistent graph navigability** (Explorer graph navigates; Dossier/dev graphs don't) — unify.
  **N-5**
- **Orphan routes** `/sectors`, `/analyze` exist but aren't in nav — reconcile (surface or retire).
  **N-6**

Search fixes the *entry* friction; N-1…N-3/N-5 fix *dead-ends* so no displayed entity is unreachable —
both are needed for "the whole intelligence system feels immediately accessible."

### 5.13 Convergence of duplicated resolvers/dictionaries (the identity-hygiene mandate)

**Verified debt:** 3 independent ticker tables (`tickerMetadata.ts`, `themeCompany.ts`,
`marketMap.ts`), ≥5 non-shared resolvers (`resolveEntity`, `resolveDrawerEntity`, `buildSymbolContext`,
`explorerHrefForNode`/`parseExplorerEntity`, `tickerInfo`, graph `getNode`), 3 normalizers. **[LEGACY-
DEBT]**.

**[CH5]** Universal Search is the forcing function to converge these onto **one canonical resolver over
one canonical directory with one normalizer** (§5.3). This is a hard requirement, not a nicety: adding
a search box *without* converging would create a **fourth** resolver — the exact "another identity
system" the founder forbids. Absorb-before-retire: the useful matching behaviors (alias index, fuzzy
ticker, kind detection) move into the one resolver; the ad-hoc tables/resolvers retire as consumers
repoint. Resolution must agree everywhere (chip, search, URL) because it is the same resolver.

### 5.14 Authenticated vs unauthenticated

Auth is a hard server gate today (all routes except `/auth` + static). **[CH5]** Universal Search is
part of the authenticated experience in v1; whether a *universal* (personalization-free) search powers
a future signed-out/public experience is tied to Chapter 2's deferred D-C (public tier) — **flagged,
not decided here.** Personalized ranking (§5.7) is authenticated-only; the underlying resolution is
identical for everyone (personalization orders, never resolves differently).

### 5.15 Workstation forward-compatibility (note only — Chapter 7 owns it)

The resolver + palette are a **shared service**: a future Argus Workstation (Chapter 7) would consume
the **same** canonical resolver and directory, likely surfacing a command-line over them. Chapter 5
keeps the resolver a clean service (query → UID) so the Workstation reuses it — **without** designing
the Workstation here.

### 5.16 Directory-vs-index authority & data requirements

**[CH5] Directory (authority) vs index (derived, swappable) — the separation.**
- The **canonical entity directory** is the **authority**: durable, keyed by canonical UID, owning
  `display_label`, **aliases**, kinds, and status for **standing entities**. Its backing store is
  `institutional_entities` (widen it), but the *contract* is a resolution service, not that table.
- The **search index** (the fuzzy label/alias→UID matching structure) is a **derived, replaceable
  implementation** over the directory. It may be Postgres trigram/`pg_trgm` today and a dedicated
  search engine later — **changing the index must never change canonical identity.** Identity is
  stable; the index is swappable.

**[CH5] Persistent vs ephemeral kinds (verified).**
- **Durable standing entities → the directory:** **company, theme, industry/sector, driver, asset** —
  persistent identities with display + aliases; bounded and slow-changing. **Aliases are owned here**
  (curated + pipeline-added).
- **Ephemeral / append records → NOT the standing-entity directory:** **events/developments** are feed
  records (`MarketEvent.id == StoryCluster.id`, `event:cluster:<id>`) — a continuous, high-cardinality,
  time-bound stream (and `transition_events` are the sealed change-ledger) — served by the **feed/event
  registry and its own time-bound index**, resolvable by search (especially in ASK mode) but **not**
  co-located in the durable directory. Different cardinality and lifetime justify separate stores.

**Scale note (order-of-magnitude, for storage/index choice, not a decision):** companies/assets →
thousands (broad coverage); themes/industries/sectors/drivers → dozens–hundreds; events/developments →
thousands and continuously growing; aliases → several per standing entity. The directory (standing
entities) is bounded; the event index is unbounded/append — reinforcing the split.

**Data requirements:**
- **G-IDX-1 (keystone).** Widen the directory beyond themes and **populate** the standing kinds
  (company, industry/sector, driver, asset) with `display_label` + `aliases`, from the pipeline as
  entities are admitted (backing store: `institutional_entities` + migration). **[NEEDS DATA/INDEX]**
- **G-IDX-2.** One **label/alias → UID resolver service** (endpoint + one shared frontend caller) —
  the single canonical resolver; on-demand mint+profile for a valid unseen ticker (§5.3). **[CH5 / LATER IMPL]**
- **G-IDX-3.** Fuzzy-match quality depends on populated aliases (G-IDX-1). **[NEEDS DATA]**
- **G-IDX-4.** Personalized ranking consumes Chapter 2 signals (floor-safe). **[inherits Ch2]**
- **G-IDX-5.** ASK mode (§5.5) needs the Chapter 2/3 convergence + a content/relationship index +
  the separate event index — deferred. **[LATER IMPL]**

No new *reasoning* engine, no new *identity* scheme, and **no permanent coupling to one table** — the
gap is a **directory service + a swappable index over the existing UID scheme**, plus one resolver.

### 5.17 Migration debt (classify — do not remove)

| ID | Debt | Evidence | Target |
|---|---|---|---|
| **S-1** | No global search / keyboard entry / palette | `TopNav.tsx`; no ⌘K | the hybrid palette+omnibox (§5.4) |
| **S-2** | No name→UID resolver (click-driven only) | `identity.py` mints, doesn't resolve; `coerce_theme_uid` theme-only | one canonical resolver over the directory (§5.3) |
| **S-3** | Directory theme-only, not name-searchable | `institutional_entities` CHECK=theme; fetch-by-uid only | widen + populate + label/alias index (§5.16) |
| **S-4** | 3 duplicate ticker tables + ≥5 resolvers + 3 normalizers | `tickerMetadata`/`themeCompany`/`marketMap`; `resolveEntity`/`resolveDrawerEntity`/… | converge to one resolver/normalizer (§5.13) |
| **S-5** | Entity dead-ends | Dossier map, story/deal rows, industry chips | deep-link (N-1…N-3, §5.12) |
| **S-6** | 3-hop company access; Industries intermediate pages | §5.12 | search entry + direct links |
| **S-7** | Overlay could be duplicated by a naive search | `intelligenceContext` singleton | absorb: search feeds `setActiveContext` (§5.6) |
| **S-8** | Weak mobile nav (no hamburger; cramped icons) | `TopNav.tsx` responsive gap | mobile search sheet (§5.9) |
| **S-9** | Orphan routes `/sectors`, `/analyze` | not in `NAV_LINKS` | reconcile (N-6) |
| **S-10** | **Routing-identity debt: parallel entity-address vocabularies** | `/explore/<kind:id\|bare-ticker>` (`parseExplorerEntity`, validates nothing); `/industries/<slug>` | one canonical entity address (`/intel/<uid>`); projections key off the same UID; converge the parallel vocabularies (§5.11) |
| **S-11** | Directory risks being coupled to one Postgres table | `institutional_entities` | directory = resolution **service** keyed by UID; index swappable (§5.16) |

**No code is changed in this chapter.**

### 5.18 What Chapter 5 extends / amends

- **Extends (inherits):** Chapter 2 (personalized ranking + universal floor; auth), Chapter 3
  (relationship model for intelligence-search later), Chapter 4 (identity authority; company →
  Panel → Explorer/Dossier), `ARGUS_ENTITY_INTELLIGENCE_V1` (canonical UID addressing).
- **Amendments flagged (later, through each doc's gate — not made here):** **AS-1** the Master
  Architecture / Surfaces docs — register **Universal Search as a new surface** (its one question:
  "take me to any canonical Argus object"; its projection: resolve → focus/route) via the three-question
  test. **AS-2** the entity/identity canon — record the **one-resolver, one-directory** rule and the
  widened `institutional_entities` as the canonical searchable directory. **AS-3** Knowledge Model check
  **only if** widening the directory or the resolver introduces a new object/namespace (likely not — it
  indexes existing UID kinds).

### 5.19 Decisions requiring founder input

- **J-1 — Search modality.** Confirm the **hybrid** (persistent TopNav affordance + ⌘K palette) over one
  resolver, not an LLM box for entity resolution (§5.4).
- **J-2 — FIND now, ASK later, one affordance / two modes.** Confirm **FIND (deterministic entity
  resolution) ships v1; ASK (intelligence retrieval) is a later mode of the same entry**, visually/
  behaviorally distinct, and FIND's contract does not constrain ASK (§5.5).
- **J-3 — Overlay absorption via an abstract focus contract.** Confirm Universal Search **feeds** the
  focus/projection layer, that **preview ≠ focus ≠ navigate** (not every selection sets global focus),
  and that `setActiveContext` is the **current single-focus implementation** Search interoperates with —
  not the permanent contract (multi-context Workstation stays possible) (§5.6).
- **J-4 — One-resolver convergence.** Confirm the identity-hygiene mandate: converge the 3 dicts / 5
  resolvers / 3 normalizers onto **one** resolver — it must not add a fourth (§5.13).
- **J-5 — Directory *service*, not a table; coverage is six states.** Confirm the **canonical entity
  directory/resolution service keyed by UID** (backing store `institutional_entities`, but not
  permanently coupled; index swappable), the **standing-durable vs events-ephemeral** split, and that
  **coverage is the six-state model** (a missing row is not permanent "not covered"; on-demand mint +
  profile for valid tickers) (§5.3, §5.16).
- **J-6 — Public search (defer).** Whether a universal (personalization-free) search backs a future
  signed-out experience is tied to Chapter 2 D-C — confirm it stays deferred (§5.14).
- **J-7 — Canonical entity-addressing contract (new).** Confirm **one canonical entity address (the
  UID / `/intel/<uid>`) with Panel/Explorer/Dossier as projections keyed by that UID**; redirecting
  aliases are fine, but the parallel `/explore/<kind:id|bare-ticker>` and `/industries/<slug>`
  vocabularies are **routing-identity debt** to converge — Search must resolve into the canonical UID,
  not introduce a new URL vocabulary (§5.11, S-10).

### 5.20 Migration implications (stated, not implemented)

- **Order:** (1) **backend index** — widen + populate `institutional_entities`; add the label/alias→UID
  resolver endpoint (G-IDX-1/2); (2) **one frontend resolver** consuming it — converge the 5 resolvers /
  3 dicts / 3 normalizers (§5.13); (3) **the search surface** — ⌘K palette + TopNav affordance — feeding
  `setActiveContext` and unifying with the "Focused on" control (§5.4, §5.6); (4) **fix dead-ends/
  friction** (N-1…N-6) so no displayed entity is unreachable; (5) **mobile search** (§5.9); (6)
  **intelligence-search mode** later, on the Chapter 2/3 convergence (§5.5).
- **Ordering constraint:** the **index/resolver precede the surface** — a search box over the current
  duplicated resolvers would ship a fourth identity path (the founder's forbidden outcome). Directory +
  one resolver first; surface second. **Converge, don't stack.**
- **Inheritance:** Chapter 4's company default (search → Quick Panel → Explorer/Dossier) is honored;
  Chapter 7 (Workstation) later reuses the same resolver/directory (§5.15).

*End of Chapter 5 (APPROVED, decisions J-1…J-7 + the four locked principles). No product code changed;
no search shipped; no resolver converged; no directory widened. No canon amended in this step
(AS-1…AS-3 flagged, not made).*

---

## Chapter 6 — Accountability & the Prediction Ledger's Placement

*Architecture/design only. This chapter answers one product question — **how does
Argus prove that its intelligence deserves to be trusted?** — and decides **where accountability
belongs** across the product (resolving Chapter 1's open decision U4). It inherits Chapter 2
(accountability outranks narrative pride; the Current Forward View), Chapter 3 (the Seal beat over the
canonical relationship model), and Chapter 4 (the Dossier is the sealed record; Current Forward View
vs Prediction Ledger are distinct). It **defines placement and doctrine, not code, and invents no new
accountability mechanics** — the ledger, gates, and honesty boundaries already exist and are canonical.
Grounded in a read-only code audit (2026-07-31); every product claim is tagged.*

> **Status: APPROVED — founder decisions K-1…K-6 (2026-07-31).** Locked principles:
> 1. **Trust = institutional accountability**, never a stock-pick leaderboard or product-level "AI
>    accuracy %" (K-1).
> 2. **Accountability is woven** from the one canonical M3 ledger across existing surfaces; the **Quick
>    Panel stays contextual** (nothing / active *On the Record* / resolution note / quiet record entry) —
>    no zero-count stats or gate jargon in premium shallow UI (K-2).
> 3. **A dedicated destination is deferred**; passing gates is necessary-but-not-sufficient — it requires
>    convergence of credibility, record depth, resolved-outcome volume, cross-entity history, user value,
>    and a distinct job. **"Argus on the Record" is an unapproved working name** (K-3).
> 4. **Current Forward View ≠ Prediction Ledger**; a current thesis never auto-becomes a registered
>    prediction; the client `predictionEngine` is retired as an independent authority (manufactured
>    probability does not survive) (K-4).
> 5. **Resolutions surface in Feed/Brief and the Seal beat only when important** (Brief stricter, with
>    personal relevance; Feed broader) — never a ledger activity stream (K-5).
> 6. **A smaller user-facing lifecycle** (*On the Record / Confirmed / Partly confirmed / Not confirmed /
>    View changed / Untested* — provisional copy) maps onto the **unchanged seven canonical verdicts**;
>    the mapping/semantics are locked, distinctions are never collapsed for simpler UI; **calibration
>    language hierarchy** (Panel: no jargon/numbers · Explorer: plain maturity state · Dossier: full
>    mechanics · post-gate: modest calibrated treatment, never "AI accuracy %") (K-6).
>
> Locked doctrine: recorded-at-the-time vs reconstructed history stay visibly distinct; no retroactive
> predictions; backend verdicts and credibility gates unchanged; **no new prediction/scoring/confidence/
> calibration/reasoning engine** is introduced. The accountability lifecycle is: *current intelligence →
> explicit registered prediction → sealed recorded-at-the-time thesis → expected horizon → confidence
> basis → realized outcome → deterministic resolution/scoring → revision/invalidation → institutional
> memory.* Implementation deferred unless the broader architecture process calls for it.

**Status legend:** **[IMPLEMENTED]** verified in code · **[GATED-OFF]** built but disabled/withheld by
design · **[CANON · UNCONSUMED]** built but not surfaced · **[LEGACY-DEBT]** migration debt · **[CH6]**
a placement/doctrine proposal here · **[NEEDS DATA]** requires archive maturity/data · **[LATER IMPL]**.

### 6.0 The central question and the answer

**How does Argus prove its intelligence deserves to be trusted? — By keeping an institutional
record: what it believed, when it believed it, why, with what confidence, what would invalidate it,
and what actually happened — sealed at the time, scored honestly, and gated until it has enough
history to be credible.** Trust is earned by *accountability*, not by a confidence adjective or an
accuracy percentage. This is already Argus's canonical stance; Chapter 6 places it in the experience.

**What this must never become** (all already enforced in code — Chapter 6 affirms them as binding):
a **leaderboard of stock picks**, an **"AI accuracy %"**, a **win-rate scoreboard**, a **price
forecaster**, or a set of **retroactively-invented "calls."** The goal is *institutional
accountability*, not a scoreboard.

### 6.1 The accountability lifecycle (verified end-to-end, mostly gated)

The founder's lifecycle maps one-to-one onto existing backend objects — the spine exists; it is
gated and barely surfaced, not missing:

| Stage | Canonical object (verified) | State |
|---|---|---|
| **Current intelligence** | the canonical read — `explain(uid)` / thesis (Chapter 4) | live belief, restated each cycle; *not* a prediction |
| **Explicit prediction** | a **registered** ledger prediction (`predictions.py` `issue_predictions`), 3 types (`relationship_persistence`, `narrative_membership`, `conviction_threshold`); **no probability issued** | **[IMPLEMENTED · GATED-OFF]** (`prediction_ledger_enabled` default false) |
| **Recorded-at-the-time thesis** | the sealed prediction row: `issued_at`, `issuance_boundary`, `statement`, `assumptions`, `invalidation_conditions` — **immutable after issuance** | **[IMPLEMENTED]** |
| **Expected horizon** | `horizon_label`, `resolve_after`/`resolve_before` (grace 7d) | **[IMPLEMENTED]** |
| **Calibrated confidence** | calibration status (gated), **not** a per-prediction probability; "diagnostics, not an accuracy claim" | **[IMPLEMENTED · GATED]** |
| **Realized outcome** | `OutcomeRecord`, 7 verdicts (confirmed / partially_confirmed / contradicted / invalidated / unresolved / unresolvable_data_gap / expired_without_test) | **[IMPLEMENTED]** |
| **Scoring** | deterministic (confirmed 1.0 / partial 0.5 / contradicted 0.0; others **None**, never silently 0); **no price-based scoring** | **[IMPLEMENTED]** |
| **Revision / broken thesis** | `invalidated` verdict (an assumption/identity broke — *not* incorrectness) + `transition_events` (relationship/narrative dissolutions, conviction crossings) | **[IMPLEMENTED]** |
| **Institutional memory** | the sealed M3 archive | **[IMPLEMENTED]** |

The lifecycle is real and honest; the gap is **placement + enablement**, not mechanics.

### 6.2 Current-state audit (verified)

- **The Prediction & Outcome Ledger is implemented but GATED-OFF by default** (`prediction_ledger_enabled`
  = false; type allowlist defaults to `relationship_persistence` only). Three narrow, testable
  prediction types; **no probabilities are ever issued** (the schema field stays null — admission
  requires a decomposable `confidence_basis` that does not exist). **[IMPLEMENTED · GATED-OFF]**
- **Two credibility gate sets, pre-registered:** calibration (≥30 tested outcomes/type, ≤20% untested)
  and analog/reasoning (≥60 sealed days, ≥2 regimes, ≥10 tested outcomes). Until they pass, every
  calibration response is labeled *"Credibility gates NOT met — diagnostics, not an accuracy claim,"*
  and **no product-level accuracy number may surface (enforced at the API).** **[IMPLEMENTED · GATED]**
- **Recorded-at-the-time is immutable and cannot be retroactively invented** (identity binds
  `issuance_boundary`; DB unique constraint; predictions never deleted); replay/reconstruction is a
  **distinctly labeled** path (`reconstruction_kind`; "the future never leaks"). **[IMPLEMENTED]**
- **Only two surfaces consume the real M3 ledger:** the **Institutional Dossier** (section F: verdicts +
  statements + the calibration gate + sealed memory, honest and gated) and the **Markets Network
  Inspector** (per-entity ledger list, gated "no accuracy claim"). **[IMPLEMENTED]** Everywhere else is
  unconsumed.
- **No dedicated accountability route/surface exists** (only a **dev-only mock** harness with hardcoded
  "14 open · 11 resolved …" — not user-facing). **[NOT-PRESENT]**
- **No leaderboard / accuracy scoreboard exists anywhere** — the codebase actively guards against it (a
  test asserts the "no accuracy claim" gate; the LLM's self-assessed confidence is suppressed
  everywhere). **[verified ABSENT — keep it that way]**
- **The R5 stakes/falsifiers Explanation stage is gated** ("reports ledger entries when it ships, never
  creates predictions; predictions are never evidence"). **[GATED-OFF]**

### 6.3 The two distinct objects — Current Forward View vs Prediction Ledger (the spine)

This distinction (Chapter 4 I-3) is the backbone of accountability and must be visible everywhere:

- **Current Forward View** = what the canonical reasoning **currently** believes may happen next — with
  evidence, **confidence (a band, no manufactured probability)**, assumptions, and falsifiers. It is
  *restated every cycle* and is **not** an on-the-record call. Source: `explain(uid)` (Chapter 4).
- **Prediction Ledger** = the subset Argus **chose to register** as explicit, testable predictions —
  sealed at the time, immutable, then resolved to outcomes and calibrated. This is the accountable
  record.

**A current thesis does not automatically become a registered prediction** — it enters the ledger only
when Argus makes a sufficiently explicit/testable forecast, by the ledger's canonical rules. The two
must be **labelled distinctly** on every surface that shows a forward-looking statement.

### 6.4 Recorded-at-the-time vs reconstructed — the honesty boundary (and its one real gap)

Recorded-at-time (sealed, immutable) and reconstructed (replay/derived, labeled) are **already
architecturally separate** and must remain so — **no retroactively-invented predictions, ever**
(verified: immutable issuance, no delete, "the future never leaks"). Two verified UI gaps to close:

- **The client `predictionEngine` "Forward View" (Explorer + Drawer)** shows a **manufactured
  probability %** labeled only "prediction engine," **not distinguished from a recorded call** — a user
  could read the animated probability bar as an implied historical prediction. **[LEGACY-DEBT — the
  Chapter 4 I-3 debt.]** Resolution: it is a *Current Forward View* (a projection), must be labeled as
  such (never "a recorded call"), and its manufactured probability is **not** shown (canonical
  withholds probability); the accountable record is the Ledger.
- **The Explorer's "Intelligence Timeline / Evolution / Historical Analogs"** are **session-reconstructed
  (device-local)** yet framed as history without a "reconstructed" tag. **[LEGACY-DEBT — Chapter 4
  C-3.]** Resolution: source from the sealed M3 archive, or label reconstructed.

The Dossier already models the boundary correctly ("sealed as recorded … not a recollection";
`recorded`/`derived` provenance chips) — it is the template.

### 6.5 What accountability is NOT (affirmed, binding)

- **Not a leaderboard / stock-pick scoreboard.** No ranking of picks by return.
- **Not an "AI accuracy %."** No product-level accuracy metric surfaces until the credibility gates
  pass — and even then it is a *calibration* diagnostic, not a marketing score (API-enforced today).
- **Not price forecasting.** No price-based scoring exists and none is introduced (no canonical asset/
  adjusted-price/measurement-window contract).
- **Not retroactive.** No prediction is ever invented after the fact; recorded-at-time is immutable.
- **Not an LLM self-grade.** The summarizer's self-assessed confidence never surfaces (already guarded).

### 6.6 Placement across surfaces (the core proposal)

Accountability is **woven into the surfaces that already exist**, each carrying the depth appropriate
to it — one canonical ledger, many projections (Chapter 2):

| Surface | Accountability placement | Depth | State |
|---|---|---|---|
| **Institutional Dossier** | the **home of the record** — registered predictions + outcomes + verdicts + calibration gate + sealed memory + the **evolution of Argus's view** (a recorded-call trail) | full | **[IMPLEMENTED]** — extend with the call-trail |
| **Intelligence Explorer** | the **Current Forward View** (canonical, no probability) **plus** the entity's recorded-call record (a link/section into the Dossier accountability), clearly separated | interactive | **[CH6]** — replace/relabel the client forward view (§6.4) |
| **Quick Company Panel** | **contextual** — an understated *On the Record* state **only when** a relevant active/recently-resolved registered call exists, with access to the record; **never** zero-count stats or gate jargon (§6.6a) | glance | **[CH6]** |
| **Themes** | theme/narrative-scoped predictions (`narrative_membership`, `conviction_threshold`) + their outcomes in the theme file | full (theme kind) | **[CANON · UNCONSUMED]** |
| **Markets** | the **platform-wide calibration status** (gated, plain language at this depth — §6.8) + the per-entity ledger already in the Network inspector — **not** a market-wide accuracy number | aggregate/status | **[IMPLEMENTED (inspector) / CH6 (status)]** |
| **Brief / Feed** | prediction **resolutions** as first-class events — **only when they clear the eligibility contract** (§6.6b); the personalized Brief uses a higher bar than the universal Feed; **neither is a ledger activity log** | event | **[CANON · UNCONSUMED]** |
| **Network** | **Prediction mode** + the **Seal beat** (a prediction resolving — the Bible's "one sacred motion") — accountability made visible in the structure | structural | **[BIBLE · design-only — not implemented]** |

Every placement reads the **one M3 ledger** (never a re-derivation); the client `predictionEngine`
never supplies an accountable record.

**§6.6a — Quick Panel accountability (contextual, four states).** The Panel's primary job is *what
Argus thinks about the company now*; accountability appears **only when it adds context**, never as
diagnostic clutter:
- **No registered predictions** → **nothing** accountability-related (no "0 calls", no gate terms); the
  Panel stays about the current read.
- **Active registered prediction (relevant)** → an understated **"On the Record"** affordance — Argus
  has a live, dated call — tap to open it; the statement is not dumped into the Panel.
- **Recently resolved important prediction** → a brief, understated **resolution note** (the call + its
  user-facing outcome, §6.6c) — only when recent and material; with access to the record.
- **Historical record available (no active call)** → a quiet **"On the Record"** entry point — access
  to the record; **no counts, no gate vocabulary.**
Zero-count ledger statistics and internal gate terminology never occupy premium company UI.

**§6.6b — Feed/Brief resolution eligibility contract.** A ledger resolution becomes an intelligence
event **only when it earns the space** — scored by the **same importance/priority contract as any
event** (Chapter 2 §2.5: universal importance + personal relevance, floor-safe), with resolution-
specific factors: **materiality** (a meaningful thesis confirmed/broken, not a routine persistence
tick), **whether Argus previously elevated the thesis**, **magnitude of the change in Argus's
understanding**, **breadth of affected companies/themes/sectors/assets**, **market significance**, and
(for the Brief) **personal relevance**. The **personalized Brief** surfaces a resolution only when it
deserves space alongside earnings, macro, major developments, and opportunities/risks; the **universal
Feed** may use a broader threshold. **Neither becomes a ledger activity log** — a background call quietly
confirming as expected is *not* an event. No new mechanism: a resolution is an internal-cognition event
ranked exactly like an earnings print or a macro release.

**§6.6c — User-facing prediction lifecycle (premium language) mapped to the seven canonical verdicts.**
The backend's seven verdicts remain canonical and **unchanged** — and appear in full, with the
resolution rule and score, in the **Dossier**. Shallow/mid surfaces use a **smaller, honest** product
vocabulary — the smallest set that communicates the lifecycle without database terms or a betting-ticket
feel:

> **On the Record → { Confirmed · Partly confirmed · Not confirmed } | View changed | Untested**

| Canonical verdict (Dossier keeps verbatim) | User-facing state | Meaning (never "win/loss") |
|---|---|---|
| *(open, within horizon)* | **On the Record** | Argus made an explicit, dated call and is watching it |
| `confirmed` | **Confirmed** | the call held |
| `partially_confirmed` | **Partly confirmed** | held in part |
| `contradicted` | **Not confirmed** | the call did not hold (honest, not "lost") |
| `invalidated` | **View changed** | an assumption/identity broke — **superseded, not a miss** |
| `unresolved` (expiry) · `unresolvable_data_gap` · `expired_without_test` | **Untested** | Argus could not verify it — **never scored as wrong** |

*(Labels are provisional pending copy; the mapping and the smallest-honest-set principle are the
proposal — the Dossier never loses the precise verdict.)* **Visual treatment — "showing its work," not
a betting ticket:** each registered call renders, at appropriate depth, its **recorded made-at date**
(recorded-at-the-time, prominent), **expected horizon**, **recorded thesis** (verbatim), **evidence at
issuance**, **falsifiers/invalidation conditions**, **what happened** (outcome + the deterministic
resolution rule), and **whether Argus's understanding changed afterward** (the revision/transition
trail). An institutional research desk showing its work — made-when, thesis, evidence, falsifier,
horizon, outcome, revision — never a score or a ticket.

### 6.7 The dedicated-accountability-surface question (resolving Chapter 1 U4)

**[CH6] Decision: accountability is woven first; a dedicated surface is deferred until the record is
credible.** A standalone "Argus on the Record" / track-record destination built while the ledger is
gated-off and the archive is pre-credibility would **showcase Argus's weakest, emptiest surface and
undermine the very trust it is meant to build** (Chapter 1 §1.9; the ledger's own gates say as much).
So:
- **Now / near-term:** accountability lives **woven** — the Dossier record, the Explorer forward-view↔
  record separation, the Panel signal, theme predictions, the Markets calibration status, Feed/Brief
  resolutions, and the Network Seal beat.
- **Later — only once the credibility gates pass** and there is a real, calibrated record: Argus **may**
  gain a **dedicated accountability surface** — and even then it is **institutional accountability**
  (what Argus believed, when, why, with what confidence, what would invalidate it, what happened),
  **never** a leaderboard or accuracy score. This **resolves Chapter 1 U4** (Prediction Ledger
  placement): distributed/woven now; a dedicated destination is a gated, later, honesty-bound option.

**Reconsideration criteria — passing the gates is necessary but NOT sufficient.** Passing credibility
does not automatically earn a nav item. A dedicated destination is justified only when **several
converge**:
- the **credibility gates have passed** (a genuinely calibrated record) — the precondition;
- **sufficient record depth** — enough registered *and resolved* calls that a consolidated view is
  substantive, not a handful;
- **useful cross-entity history** — the record spans enough entities/themes that a cross-cutting view
  adds value the per-entity Dossiers cannot;
- **enough resolved outcomes** (not just open calls) to show a track record rather than a pending queue;
- **demonstrated user value/demand** — evidence users want to interrogate the record across entities;
- **a job the woven placements cannot do** — e.g. "show every call Argus made on rates and how they
  resolved."
Only when these converge does a dedicated surface earn placement. **"Argus on the Record" is a working
concept/name, not approved product naming.**

### 6.8 Calibration & gates — an honest language depth hierarchy

Preserve the two credibility gate sets **exactly** — do not weaken, bypass, or reword them, and never
imply reliability not yet demonstrated. But **technical gate vocabulary belongs at depth, not on the
surface.** Gate *status* is honest at every depth; its *vocabulary* scales with depth: **[CH6]**

- **Shallow (Quick Panel):** **no** gate jargon and **no** numbers. If a track-record affordance appears
  at all, use plain institutional language — e.g. *"Building a verified track record"* / *"Record still
  maturing"* — and only where there is something worth linking. Never "calibration gated"; never a
  number; never phrasing that implies proven reliability.
- **Mid (Explorer):** a concise institutional line — *"Track record still maturing — Argus is
  accumulating verified outcomes"* — linking to the record; honest that a score is withheld, but **no
  raw gate numbers**.
- **Deep (Dossier / technical):** the **full** treatment — tested-outcome counts, sealed days, regimes,
  unresolved percentages, the calibration diagnostic, and the exact **"diagnostics, not an accuracy
  claim"** label. This is where the mechanics live.
- **After the gates eventually pass:** a **calibrated** record may be shown — still as *institutional
  accountability* (the record's calibration/reliability), **never** an "AI accuracy %" marketing number;
  shallow surfaces may then carry a modest, honest calibrated indicator, with the precise diagnostic
  still reserved for Dossier depth.

Visibility of accountability scales with credibility: while gated, surfaces show the **record and its
gate status** (thesis, falsifiers, outcomes) but **no aggregate accuracy** — the record is honest even
when the score is withheld. Enablement (`prediction_ledger_enabled`, the type allowlist) is turned on as
the sealed archive matures — an operational, gated rollout, not a product decision to fabricate coverage.

### 6.9 The accountability moment — resolution & the Seal beat

Today a prediction *resolving* is **invisible** on every live surface (no resolution, no seal, no
"understanding changed"). **[CH6]** The moment a registered call resolves is Argus's most important
trust event and — **when it clears the eligibility contract (§6.6b)** — must be **placed**: as a
**Feed/Brief event** (a call resolved, shown in user-facing lifecycle language per §6.6c — *Confirmed /
Not confirmed / View changed / Untested* — with its recorded thesis and outcome) and as the **Network
Seal beat** (the Bible's one sacred 300ms fill-to-verdict). This is accountability made *felt*, sourced
entirely from the sealed outcome record — never staged or synthesized. An unimportant background
resolution is **not** an event: the Brief and Feed are not a ledger activity log.

### 6.10 Migration debt (classify — do not remove)

| ID | Debt | Evidence | Target |
|---|---|---|---|
| **P-1** | Ledger consumed by only 2 surfaces; gated-off by default | Dossier §F + Markets inspector; `prediction_ledger_enabled` false | woven placement (§6.6); enable as archive matures |
| **P-2** | Client `predictionEngine` Forward View shows a manufactured probability, not distinguished from a recorded call | `predictionEngine.ts`; Explorer/Drawer forward view | Current Forward View (canonical, no probability), labeled projection; retire client as authority (Ch4 I-3) |
| **P-3** | Explorer timeline/analogs are session-reconstructed, framed as history without a "reconstructed" tag | `intelligenceShared.buildTimeline`, device-local | sealed M3 archive or explicit "reconstructed" label (Ch4 C-3) |
| **P-4** | Prediction *resolution* / Seal beat / "understanding changed" not surfaced anywhere | no matches in Feed/Network | place resolutions as Feed/Brief events + the Network Seal beat (§6.9) |
| **P-5** | R5 stakes/falsifiers Explanation stage gated | `explanations.py` gated sections | ship IRE-4/5 so stakes **report** ledger entries (never create them) |
| **P-6** | No dedicated accountability surface | routes audit | deferred until credible (§6.7) — not built now |

**No code is changed in this chapter.**

### 6.11 Data & engine gaps

- **G-ACC-1.** Ledger **enablement + coverage** grows only as the **sealed archive matures past the
  credibility gates** (≥60 sealed days, ≥2 regimes, ≥10–30 tested outcomes). Accountability visibility
  is **time-gated**, honestly. **[NEEDS DATA]**
- **G-ACC-2.** Per-prediction **probability** is deliberately absent (no decomposable canonical method);
  do not manufacture one. Confidence remains the canonical **band** + the calibration gate. **[by design]**
- **G-ACC-3.** Broader prediction *types* (beyond the three) or price-response outcomes require new
  canonical contracts (asset, adjusted price, measurement window) that do **not** exist — out of scope;
  do not invent. **[by design / later]**
- **G-ACC-4.** Surfacing resolutions in Feed/Brief and the Network Seal beat needs the ledger consumed
  by those surfaces (P-1/P-4). **[LATER IMPL]**

No new reasoning or scoring engine; the mechanics exist. The gaps are **consumption, enablement, and
archive maturity.**

### 6.12 What Chapter 6 extends / amends

- **Extends (inherits):** `ARGUS_PREDICTION_OUTCOME_LEDGER_V1` (the ledger contract, gates, non-goals),
  `ARGUS_INSTITUTIONAL_MEMORY_V2` (sealed archive), `ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1` (R5 stakes;
  Current Forward View), the Design Bible (the Seal beat), Chapter 2 (accountability outranks narrative
  pride) and Chapter 4 (Dossier record; Forward View vs Ledger).
- **Amendments flagged (later, through each doc's gate — not made here):** **AA-1** the Prediction &
  Outcome Ledger doc — record the **placement model** (woven across surfaces; dedicated surface deferred
  until credible) since the doc left placement unspecified (resolving Chapter 1 U4). **AA-2** Surfaces/
  Master Architecture — register accountability placements (Panel signal, Explorer record section,
  theme predictions, Markets calibration status, Feed/Brief resolutions, Network Seal beat) via the
  three-question test; a **dedicated accountability surface** is a later, gated proposal. **AA-3** no
  Knowledge Model change (no new object — predictions/outcomes O13/O14 already exist).

### 6.13 Decisions requiring founder input

- **K-1 — The trust thesis.** Confirm Argus proves trust through **institutional accountability**
  (recorded thesis → horizon → outcome → gated calibration), **not** a leaderboard or "AI accuracy %"
  (§6.0, §6.5).
- **K-2 — Woven placement, contextual not diagnostic.** Confirm the per-surface placement map (§6.6)
  reading the one M3 ledger — and specifically that the **Quick Panel is contextual** (the four states
  of §6.6a: nothing when there is no relevant call; an understated *On the Record* / resolution note
  when there is), with **no zero-count stats or gate jargon** in premium company UI.
- **K-3 — Dedicated surface deferral (U4), with reconsideration criteria.** Confirm accountability is
  **woven now** and a **dedicated surface is deferred** — and that **passing the gates is necessary but
  not sufficient**: a destination is justified only when record depth, cross-entity history, resolved-
  outcome volume, demonstrated user value, and a job the woven placements cannot do **converge** (§6.7).
  Resolves Chapter 1 U4. *("Argus on the Record" is a working name, not approved.)*
- **K-4 — Forward View vs Ledger, made visible.** Confirm the Current Forward View (canonical, no
  probability, restated) and the Prediction Ledger (sealed, registered, resolved) are **labelled
  distinctly** on every surface, and the client `predictionEngine` forward view is relabeled a
  projection / retired as an authority (§6.3, §6.4).
- **K-5 — Resolution as a first-class moment, editorially gated.** Confirm placing prediction
  resolutions as Feed/Brief events + the Network Seal beat, sourced from the sealed outcome record
  (§6.9) — **only through the eligibility contract (§6.6b)**: scored by the Chapter 2 importance/priority
  contract plus resolution-specific factors (materiality, prior elevation, magnitude, affected entities,
  market significance; the Brief stricter than the Feed). **Neither surface is a ledger activity log.**
- **K-6 — User-facing prediction lifecycle + calibration language hierarchy.** Confirm (a) a **smaller,
  honest** premium vocabulary — *On the Record → { Confirmed · Partly confirmed · Not confirmed } | View
  changed | Untested* — mapped onto the **seven canonical verdicts, which stay unchanged and precise in
  the Dossier** (§6.6c: `contradicted`→"Not confirmed" not "lost"; `invalidated`→"View changed" not a
  miss; the three non-scoring verdicts→"Untested", never scored as wrong); and (b) the **calibration/gate
  language depth hierarchy** (§6.8): no gate jargon or numbers at the Panel, plain "record still
  maturing" language mid-surface, full mechanics ("diagnostics, not an accuracy claim") only at Dossier
  depth — and even after the gates pass, an honest calibrated indicator, **never** an "AI accuracy %".
  *(Labels provisional; the mapping, the smallest-honest-set principle, and the depth hierarchy are the
  decision.)*

### 6.14 Migration implications (stated, not implemented)

- **Order (inherits convergence-first):** (1) close the honesty gaps — relabel/replace the client
  Forward View (P-2) and the reconstructed timeline (P-3) so nothing implies a recorded call it doesn't
  hold; (2) consume the one M3 ledger on the placement surfaces (Explorer record section, Panel signal,
  theme predictions, Markets calibration status) — P-1; (3) place **resolutions** (Feed/Brief events +
  Network Seal beat) — P-4/§6.9; (4) ship the R5 **stakes** section to *report* ledger entries — P-5;
  (5) **enable** the ledger + widen types as the archive matures past the gates — G-ACC-1; (6) only then
  consider a **dedicated accountability surface** — §6.7.
- **Ordering constraint:** **honesty first, enablement gated.** Do not surface accountability more
  widely — and never build a dedicated destination — before the record is credible; a premature or
  empty accountability surface is Chapter 1's most dangerous failure mode (authoritative-looking, not
  earned).
- **Absorb-before-retire:** the client `predictionEngine`'s valid *mechanics* (scenario/direction/
  invalidation/decomposed reasoning) may inform the Current Forward View (Chapter 4 I-3); its
  manufactured probability and any implied record status are retired.

*End of Chapter 6 — **APPROVED** (founder decisions K-1…K-6, 2026-07-31). No product code changed; no
ledger enabled; no surface modified. No canon amended in this chapter (AA-1…AA-3 remain flagged for each
doc's own gate, not made here). Implementation deferred unless the broader architecture process calls
for it.*

---

## Chapter 7 — The Product Family: Intelligence, Workstation, Mobile

*Architecture/design only. This chapter decides the **shape of the product family** — whether Argus
Intelligence (web), a future Argus Workstation (dense professional environment), and Argus Mobile are
separate products, clients, modes, or surfaces — and what must be **shared, never duplicated, and
deliberately different** across them. It inherits Chapter 2 (one intelligence, many projections),
Chapter 3 (the Network as the canonical visual layer), Chapter 4 (the entity Dossier grammar), Chapter 5
(Universal Search / FIND, later ASK), and Chapter 6 (accountability woven from the one ledger). It
**designs boundaries and contracts, not clients, not pricing, and no code.** Grounded in a read-only code
audit (2026-07-31); every product claim is tagged. It does **not** visually redesign any client, does
**not** choose a desktop shell technology, and does **not** design pricing.*

**Status legend:** **[IMPLEMENTED]** verified in code · **[CLIENT-LOCAL]** exists but device-bound (does
not sync) · **[SHARED]** already server-persisted / client-agnostic · **[STRANDED]** logic trapped in the
web frontend that a second client would have to re-port · **[CH7]** a family/boundary proposal here ·
**[LATER IMPL]** · **[NEEDS DECISION]**.

> **Status: APPROVED — founder decisions L-1…L-11 (2026-07-31).** Locked doctrine:
> 1. **Three clients over one platform** — Argus Intelligence (web), Argus Workstation, Argus Mobile are
>    distinct client experiences over **one canonical Argus intelligence platform**; **intelligence never
>    forks by client** (L-1, L-2).
> 2. **Identity resolution + Universal Search/FIND are platform-owned capabilities** consumed identically
>    by every client; **no client reimplements** UID resolution or search semantics; endpoint/API shape is
>    an implementation decision, not doctrine; **Chapter 5 FIND/ASK doctrine unchanged** (L-3).
> 3. **Context is a first-class multiplicable object** — Web/Mobile project N = 1, Workstation N > 1;
>    today's scalar `active` must **never become a platform constraint** (L-4).
> 4. **One canonical composed intelligence** — every client renders/projects the same Brief + graph/memory;
>    the Web client stops recomputing it; **server / deterministic shared package / dedicated service /
>    hybrid all valid** given one canonical computation contract (L-5).
> 5. **Sync by account, not device**, and the **account schema must eventually be source-controlled** —
>    baselining the live production tables **safely, never destructively**; not authorised now (L-6).
> 6. **Workstation = manipulable intelligence across many simultaneous contexts**, not a Bloomberg clone
>    and not "web + panels"; Web stays focused/progressive; **Mobile deliberately optimises for
>    prioritisation** (Brief, alerts, FIND/later ASK, fast single-entity investigation) (L-7, L-8).
> 7. **Network model/logic reusable; rendering/interaction adapt per client** (incl. pointer/touch;
>    mobile gets a simplified/read-only relationship view) (L-9).
> 8. **Workstation delivery mechanism deliberately unresolved** (browser/PWA, installed shell, native, or
>    other) until requirements are established; an installed client later **must never require a second
>    intelligence stack** (L-10).
> 9. **Entitlements never create contradictory canonical truth** — same canonical intelligence → different
>    access/depth is allowed; different entitlement → an independently recomputed Argus thesis is
>    prohibited; tiers/pricing deferred (L-11, §7.12 canonical-truth invariant).
>
> **Anti-duplication doctrine: build Argus intelligence once; project it differently** (§7.13). **Working
> labels only:** "Argus Intelligence / Workstation / Mobile" are **internal working labels**, not branding
> or marketing canon — Chapter 1's naming-deferral posture is preserved. No product code, schema, or
> migration was produced; no canon amended (BA-1…BA-3 flagged, not made).

### 7.0 The central question and the answer

**Are Intelligence, Workstation, and Mobile separate products, clients, modes, or surfaces? — They are
three *clients* over one Argus intelligence platform.** Not three products (that would build three Argus
systems); not mere modes of one web app (Workstation's multi-context density and monitoring exceed what a
responsive breakpoint can carry); not just surfaces (a surface lives *inside* a client — Feed, Markets,
the Dossier are surfaces; a client is a whole delivered environment with its own interaction posture).

The family is organised on **one axis the current product already implies**: how many intelligence
**contexts** you hold at once, and at what **density**.

| Client | Context cardinality | Density | Primary job |
|---|---|---|---|
| **Argus Mobile** | **one** (aggressively prioritised) | low | awareness, Brief, alerts, fast entity investigation |
| **Argus Intelligence (web)** | **one focused** context (progressive disclosure) | medium | intelligence-led reading & exploration — the product being built now |
| **Argus Workstation** | **many simultaneous** contexts | high | persistent multi-context research, monitoring, comparison |

The differentiator across the family is **never *what Argus knows*** — the intelligence (relationships,
narratives, memory, causal reasoning, accountability, personalised relevance) is **one platform, computed
once**. The differentiator is **posture**: how many contexts are live, how dense the presentation, and how
much simultaneous manipulation the client affords. **[CH7]** This is the direct extension of Chapter 2's
"one intelligence, many projections": a *client* is the largest projection unit.

**The two findings that decide the whole chapter.** The audit surfaced exactly two places where the
current code, left unchanged, would silently force three separate Argus systems:
1. **Context is a scalar.** `frontend/src/lib/intelligenceContext.tsx` holds a single `active` module
   variable, overwritten on every selection, in-memory only, and the single-context assumption is baked
   into every consumer (EntityChip highlight, the global FocusBar, the Drawer) plus a **second** per-page
   focus system (`lib/feedFocus.ts`, the feed page's `focusNode`). **[IMPLEMENTED]** A Workstation is, at
   its core, *many contexts at once* — so **today's single-slot must be generalised into a first-class,
   addressable, persistable *context set*, not enshrined as a platform limit** (§7.7). This is the
   founder's explicit warning made concrete.
2. **Identity resolution and search are stranded in the web frontend.** UID *minting* is deterministic and
   backend-owned (`app/institutional_memory/identity.py`, pure `type:namespace:key` functions) — a good
   foundation. But the label→UID **resolver** and **search** exist only in the browser, in *three*
   divergent copies: `lib/tickerMetadata.ts` (~150 hardcoded companies), a re-ported UID grammar in
   `lib/intel/dossier.ts` (already at risk of drift from the Python source), and a non-canonical tooltip
   registry `lib/entity.ts`. There is **no backend resolve/search endpoint** — and no Universal Search /
   FIND exists yet at all (only in-graph node filtering). **[STRANDED]** A second client would have to
   re-port all three. So the FIND/ASK backbone and the resolver **must become platform-owned
   capabilities** (§7.6, §7.9).

Everything else in the family design follows from fixing these two and honouring one rule: **build the
platform once; give each client a distinct posture over it; never fork the intelligence.**

### 7.1 Current product/client boundary audit (A)

What exists today is **one client** (the Next.js web app) over an **already-client-agnostic backend** —
with meaningful intelligence logic leaking into that one client.

**Already shared / client-agnostic — a real platform is present. [SHARED]**
- **Auth:** Supabase JWT, ES256-pinned, verified in `app/auth.py` (JWKS/`kid`, rotation-aware; HS256 and
  `alg:none` rejected). The backend only reads the `Authorization` bearer — **any** client with a session
  works; no web-specific session assumption. **[IMPLEMENTED]**
- **Intelligence API:** `api/main.py` registers read-oriented routers under `/api` — `feed`, `analyze`,
  `listen`, `briefings`, `intelligence` (`/network`), `memory`, `memory/v2` (snapshots, transitions,
  relationships, predictions, **calibration**, `graph/at`). It carries **no per-user mutable state**.
  **[IMPLEMENTED]**
- **Account state in Supabase (RLS, per `user_id`):** `profiles`, `user_preferences`
  (`followed_themes/sectors/asset_classes`, `user_role`, `region_focus`), `saved_items`, `watchlist` —
  the client hits Supabase (PostgREST) **directly**, not through FastAPI (the old backend `saved` route is
  a deliberate **410 Gone** stub after an IDOR fix). **[SHARED]**
- **Deterministic identity minting:** `identity.py` pure functions. **[IMPLEMENTED]**

**Leaking into the one client — would have to be re-ported for a second client. [STRANDED]**
- **Label→UID resolution & the ticker dictionary** (`tickerMetadata.ts`, `dossier.ts` re-ported grammar,
  `entity.ts` non-canonical registry) — three frontend copies, no backend resolver.
- **The Morning Brief is assembled *in the browser*** (`lib/morningBrief.ts` + `intelligenceDeltas`,
  `evidenceEngine`, `predictionEngine`, `theRead`, `morningBriefingEngine`), building the intelligence
  graph client-side and reading device-local signals. A second client cannot get the same brief without
  re-porting this or lifting it server-side. **[STRANDED]**
- **Intelligence graph + memory computed client-side** (`useArgusIntelligence`, `lib/memoryEngine.ts`,
  `lib/themeSnapshots.ts`) — localStorage-backed. **[CLIENT-LOCAL]**

**Client-local personalisation that does *not* sync. [CLIENT-LOCAL]**
- `useFollowedThemes` (`argus:followed-themes`), `useThemeWatchlist` (`argus:theme-watchlist`), theme
  snapshots, the memory engine, terminal settings — all localStorage-only. **Naming collision to resolve:**
  `user_preferences.followed_themes` (server, synced) is a *different store* from `useFollowedThemes`
  (localStorage, device-bound), and the Brief reads the **localStorage** one — so today's personalised
  Brief is device-bound even though a synced preference of the same name exists. **[CLIENT-LOCAL]**

**No mobile client, no Workstation client.** Mobile today is **responsive reflow only** — no device
detection (`useIsMobile`/`matchMedia` absent except `prefers-reduced-motion`), no mobile components, no
hamburger nav; the flagship canvas graphs bind **mouse-only** handlers (zero `onTouch*`/`onPointer*`), and
the Network inspector is `hidden lg:flex` — so on a phone the flagship visuals are **static and
non-interactive** and the inspector is dropped. **[IMPLEMENTED / gap]**

> **Audit verdict (A):** the *backend* is already a client-agnostic platform; the *web app* is the only
> client, but it has quietly become the home of three things that belong to the platform — **identity
> resolution, universal search (unbuilt), and the Morning Brief's intelligence computation.** The
> product-family work is mostly **moving these behind the platform line**, then giving each client a
> posture — not building three stacks.

### 7.2 The shared Argus platform architecture (B)

One platform, five shared layers. Everything above the line is computed **once** and consumed identically
by every client; only presentation/interaction lives per-client.

1. **Identity & resolution.** Deterministic UID minting (`identity.py`) **plus a platform-owned resolver
   and Universal Search/FIND capability** — canonical identity resolution and search consumed identically
   by every client, replacing the three divergent frontend copies; **no client reimplements UID
   resolution or search semantics**. The API shape (e.g. a resolve capability and a search/FIND
   capability, later the ASK entry) is an **implementation decision, not doctrine**. **[CH7 · the keystone
   platform capability]**
2. **Intelligence core.** The 6-stage spine (Observe→Corroborate→Interpret→Remember→Test→Explain), the
   canonical relationship model (Ch3), `explain(uid)`/`explain(event)` (the Reasoning Engine), the M3
   ledger + calibration (Ch6). Already backend-owned; **[IMPLEMENTED / partially unconsumed]**.
3. **The intelligence graph & memory.** Today browser-assembled and device-local; the family requires
   **one canonical computation** of the graph/memory that every client consumes identically — realised
   server-side, as a deterministic shared package, a dedicated service, or a hybrid, **provided there is a
   single canonical contract**. This is the precondition for a portable Brief. **[STRANDED → CH7]**
4. **Account & sync state.** Auth (client-agnostic), preferences, saved, watchlist — and **new**
   server-persisted homes for the currently-local personalisation (followed themes/snapshots) and for
   **workspaces/context-sets** (§7.7). **[SHARED + CH7 additions]**
5. **Composed intelligence products.** The **Morning Brief** and any cross-entity briefing are **one
   canonical composed intelligence** that clients *render/project* rather than *recompute* — via any
   implementation (server, deterministic shared package, dedicated service, hybrid) that preserves a
   **single canonical computation contract** (§7.10). **[CH7]**

Below the line, **per client**: layout, density, interaction (pointer/touch), navigation chrome, and
which surfaces are present. The rule: **a client is a renderer and an interaction posture over the shared
five layers — it never owns intelligence.** **[CH7]**

### 7.3 Argus Intelligence — the web client's role (C)

Argus Intelligence (web) is **the product being built now** and the **reference client**: intelligence-led
reading and exploration at **one focused context** with progressive disclosure (Panel→Explorer→Dossier).
Its single-context posture is **correct for web** and should not be apologised for — the web client is
where a user follows *one* thread deeply. It stays the proving ground for every surface (Feed, Markets,
Listen, the Dossier, the Network hero, Universal Search).

Its role in the family: **define the canonical surfaces and the intelligence contracts** that the other
clients project. What it must **stop owning**: the resolver, search, and the Brief's computation — those
move to the platform (§7.2) so web becomes the *first consumer* of shared services, not their home. **[CH7]**
Web is **not** the thing Workstation should grow into by adding panels — see §7.4.

### 7.4 Argus Workstation — role and unique jobs (D)

Workstation is a **future high-density professional client** for **persistent, multi-context** research —
inspired by the *density and simultaneity* of professional terminals, but **explicitly not a Bloomberg
clone**. A terminal's advantage is raw data density; **Argus's advantage is manipulable *intelligence*** —
relationships, narratives, institutional memory, causal reasoning, prediction accountability, personalised
relevance, and the ability to explain *what matters and why*. Workstation's job is to make that
intelligence **manipulable across many simultaneous contexts**. **[CH7]**

**What Workstation uniquely enables (and the web client should *not* try to become):**
- **Many live contexts at once** — several entities/themes/events open side by side, each a full
  intelligence context, not a compressed tab. **[CH7]**
- **Cross-context reasoning made visible** — the *one* relationship model spanning panels: an entity in
  panel A links to its counterpart in panel B; the Network becomes a manipulable instrument *across*
  contexts, not one hero per page (§7.8). **[CH7]**
- **Persistent, restorable workspaces** — named arrangements of contexts + lenses that survive sessions
  and sync per account (§7.7). **[CH7]**
- **Live monitoring & accountability at rest** — watchlists, alerts, and the **Seal beat** (Ch6
  resolutions) updating in place across many contexts; the accountability moment *felt* on a standing
  board. **[CH7 · gated by Ch6 importance contract]**
- **Dense comparison** — several Dossiers / Forward Views / ledgers compared simultaneously.

**What Workstation must not be:** a data-feed terminal, a chat window, or "the web app with more panels."
Adding panels to web does not make Workstation; **multi-context, persistence, monitoring, and density** do.
The web client stays single-context and progressive; Workstation is a **distinct client**, not a web mode.

### 7.5 Argus Mobile — role and deliberate omissions (E)

Mobile goes the **opposite direction** from Workstation: **fewer objects, stronger prioritisation.** Its
job is **awareness and fast investigation** — the Morning Brief, alerts/notifications, and a compressed
Panel→Dossier investigation of a single entity — **not** a shrunken terminal. **[CH7]**

**Mobile keeps:** the Brief (its centre of gravity), alerts/awareness (push — a job web does poorly),
single-entity investigation (Panel→Explorer→Dossier, one context), Universal **FIND**, and later **ASK**
(a phone is an excellent question-asking surface). **[CH7]**

**Mobile deliberately omits: [CH7]**
- **Multi-context** — always exactly one context; no side-by-side, no workspaces.
- **The dense Network canvas as a primary instrument** — the mouse-only canvas is non-interactive on touch
  today; mobile gets a **simplified, tap-first** relationship view or a **read-only** relationship summary
  that drills into the Dossier, **never** the full manipulable graph.
- **Dense simultaneous panels, high-information dashboards, and heavy comparison** — replaced by
  prioritised, sequential, single-focus reading.
- **Authoring-heavy workflows** — mobile is consume-and-investigate first.

Mobile is a **first-class client with a narrow, excellent job**, not a coverage checkbox. Building it
forces the healthy discipline of §7.6 (the resolver, search, and Brief must be shared before a second
client can exist at all).

### 7.6 Cross-client identity / search / personalisation contract (F)

The contract that makes one intelligence reachable identically from every client:

- **Identity is one canonical UID, minted deterministically, resolved by the platform.** Minting stays in
  `identity.py`. **Resolution (label/ticker/free-text → UID) is a platform-owned capability**; the three
  frontend copies (`tickerMetadata.ts`, `dossier.ts` grammar, `entity.ts`) collapse to a thin client
  binding over it — **no client reimplements resolution semantics**. The canonical route stays
  **`/intel/<uid>`** on every client (mobile deep-links, Workstation opens a panel). *(A resolve endpoint
  is a plausible shape; the final API is an implementation decision.)* **[STRANDED → CH7]**
- **Universal Search/FIND is one platform capability.** A **single** platform-owned FIND over
  entities/themes/events; every client renders the same results and navigates to `/intel/<uid>`. **ASK**
  (Ch5) is later, and lands as the **same** capability's question mode — never re-implemented per client.
  Today no universal search exists (only in-graph node filtering), so this is **net-new but built once**.
  The endpoint/API shape is an implementation decision; **Chapter 5's FIND/ASK doctrine is unchanged**.
  **[CH7 · realises Chapter 5 across the family]**
- **Personalisation syncs by account, not device.** `user_preferences` already syncs; the currently
  device-bound stores (`argus:followed-themes`, `argus:theme-watchlist`, theme snapshots) must be
  **promoted to server** so a user's Argus is the same on web, Workstation, and phone — and the
  `followed_themes` naming collision resolved with **the server as the single source of truth**. **[CLIENT-LOCAL → CH7]**
- **Saved intelligence / watchlists / workspaces sync by account.** `saved_items` and `watchlist` already
  sync (Supabase RLS); **workspaces/context-sets** are a **new** synced account object (§7.7). **[SHARED + CH7]**

**One-line contract:** *identity, resolution, search, personalisation, saved intelligence, and workspaces
are all account-scoped platform services; a client is where they are rendered, never where they are
defined.* **[CH7]**

### 7.7 The multi-context Workstation model (G)

**Context becomes a first-class object.** Today's scalar `active` context (`intelligenceContext.tsx`)
generalises to a **context set** at the model layer: **[CH7]**

- A **Context** = `{ uid, kind, lens/view state }` — an addressable intelligence focus (the existing
  `IntelContext` shape, made persistable and given identity).
- A **Workspace** = an **ordered set of Contexts** + arrangement + shared lens state, **named, saved, and
  synced per account**.
- **Every client is a projection of the same model by cardinality:** Mobile and Web project the set at
  **N = 1** (the current single-slot behaviour, preserved — one "primary/last-touched" context);
  Workstation projects **N > 1** (many panels). The single-context store is **not** deleted — it becomes
  the **N = 1 view of a context set**, so web/mobile keep their exact posture while Workstation is the same
  model unbounded.

**Cross-context behaviour.** Because the relationship model is **one** (Ch3), a relationship touched in one
context resolves across the set: selecting an entity in panel A can **open it in panel B**, **link/pin**
across panels, or **trace** a path spanning contexts. This is the job web structurally *cannot* do and
Workstation uniquely can (§7.4). **[CH7]**

**Migration guardrail (the founder's explicit concern).** The consumers that assume one context
(EntityChip highlight-match, the global FocusBar, the Drawer) and the **second** per-page focus system
(`feedFocus.ts`, the feed `focusNode`) must be refactored to read *"is this context in the active set?"*
rather than *"is this THE context?"* — and reconciled into the one context model. **Today's single-slot,
and the parallel per-page focus, must not become platform-level limitations.** The store change is small
and localised; the **consumer contracts and a new persistence story are the real work** — do it at the
platform/model layer, once, not per client. **[CH7 · keystone migration — §7.12]**

### 7.8 The Intelligence Network & Intelligence Chart across clients (H)

**Separate the reusable cores from the web-bound renderers — then give each client an adapter.** The audit
shows the *model* layers are already portable and the *renderers* are not: **[CH7]**

- **Reusable, DOM-free cores** (pure TypeScript, no browser deps): `lib/network/layout.ts`,
  `lib/network/model.ts`, `lib/network/inspector.ts`, `lib/graph/forceSimulation.ts`, `lib/graph/types.ts`.
  These become the **shared graph engine** every client runs. **[IMPLEMENTED — reusable]**
- **Web-bound renderers** (Canvas2D + `ResizeObserver` + `devicePixelRatio` + **mouse-only** handlers):
  `components/network/IntelligenceNetwork.tsx`, `components/graph/NetworkGraph.tsx`. A cross-client Network
  needs a **rendering/interaction adapter** and, critically, **pointer/touch support** (there are zero
  touch/pointer handlers today). **[IMPLEMENTED / gap → CH7]**

**Per-client Network posture:** **Web** — one hero per surface + inspector (today's behaviour). **Workstation**
— the Network as a **manipulable multi-context instrument** (many nodes, cross-panel trace, dense
inspector always visible), the same cores at higher density. **Mobile** — a **simplified tap-first** or
**read-only** relationship view that drills into the Dossier; **never** the full manipulable canvas.

**The "Intelligence Chart" is the Dossier, not a plotting engine.** There is no chart library or timeline
canvas; the entity intelligence "chart" is the **DOM/JSX Dossier** (`CompanyDossier`/`EventDossier`,
shared `primitives.tsx`), with quantitative values as DOM bars and memory shown as text ranges. It
**reflows** rather than needing a rendering adapter: **Mobile** single-column (already), **Web** as today,
**Workstation** several Dossiers/Forward Views/ledgers **side by side**. Any future *plotted* chart is a
new shared engine, not assumed here. **[IMPLEMENTED]**

### 7.9 Data / API / state implications (I)

Concrete platform-line moves (contracts, not code): **[CH7 unless tagged]**
1. **Establish platform-owned identity resolution + Universal Search/FIND** (entities/themes/events →
   canonical UIDs); retire the three frontend resolver copies to a thin client binding — **no client
   reimplements resolution/search**. Realises Chapter 5 FIND/ASK once. *(API shape — e.g. resolve/search
   endpoints — is an implementation decision, not doctrine.)* **[keystone]**
2. **Establish one canonical composed intelligence** (Morning Brief + graph/memory) that clients
   **render, not recompute** — via any implementation (server, deterministic shared package, dedicated
   service, hybrid) preserving a **single canonical computation contract**; resolve the `followed_themes`
   collision with a **single source of truth**. **[STRANDED → CH7]**
3. **Promote client-local personalisation** (`argus:followed-themes`, `argus:theme-watchlist`, theme
   snapshots, memory engine) to **server-persisted, account-scoped** stores so they sync. **[CLIENT-LOCAL → CH7]**
4. **Add a `workspaces` / context-set account object** (synced) for Workstation restore (§7.7). **[CH7]**
5. **Generalise the context model** from scalar to context-set (§7.7); keep N = 1 as the web/mobile
   projection. **[CH7]**
6. **Add pointer/touch + a rendering adapter** to the Network cores; keep the DOM-free cores as the shared
   engine (§7.8). **[CH7]**
7. **Schema versioning (founder-locked, L-6 — architectural requirement, not authorised now).** Argus's
   persistent account schema **must ultimately be source-controlled and reproducible.** The existing
   production-managed Supabase tables (`profiles`, `user_preferences`, `saved_items`, `watchlist`) have
   **no DDL in the repo**; they — together with future personalisation/workspace state — must **eventually
   be baselined into the source-controlled migration history** (`supabase/migrations/*`). **This does not
   authorise a migration now.** When implemented later, the process must treat the **live production schema
   as authoritative** and **baseline/adopt it safely — never blindly recreate, drop, or destructively
   alter live tables.** This **records the resolution of the existing schema-versioning gap.** **[LOCKED · LATER IMPL]**

State ownership stays clean: **read-oriented intelligence** via the FastAPI proxy; **per-user mutable
state** via Supabase RLS (direct); **auth** via the ES256 bearer — all already client-agnostic, so new
clients inherit them for free.

### 7.10 How the Morning Brief changes by client (part of C/E/I)

One **canonical** brief, **projected by posture** (§7.9-2): **[CH7]**
- **Mobile** — the Brief is the **home**: prioritised, sequential, single-focus, push-delivered; the
  centre of the mobile experience.
- **Web** — the Brief as today's intelligence briefing surface, at one focused context with progressive
  disclosure.
- **Workstation** — the Brief as a **standing board** feeding multiple contexts: its items open as panels;
  resolutions (Ch6, importance-gated) land as live Seal beats across the workspace.
The **intelligence is identical**; only prioritisation depth and delivery differ. This is only possible
once the Brief is **one canonical composed intelligence** rather than independently recomputed by the Web
client (§7.9-2).

### 7.11 Workstation delivery mechanism — deliberately unresolved (J)

**Determine required capabilities first; the delivery mechanism is deliberately left open** (founder
instruction — do **not** pick browser/PWA vs installed vs Electron/Tauri/native now). **[CH7 · NEEDS DECISION]**

**Capabilities that would genuinely justify an installed desktop app:**
- **Always-on monitoring** that runs when no tab is open (alerts/Seal beats while away).
- **Multi-window / multi-monitor** context sets beyond a single browser viewport.
- **OS-level notifications** and **global hotkeys / deep-links** into a specific context.
- **Local caching / local compute** for instant switching across *many* live contexts (dense-workspace
  performance a tab cannot hold).
- **Background streaming** and a larger memory footprint for many simultaneous contexts.

**Verdict:** Workstation is a **distinct high-density professional client concept over the same Argus
platform**, and its **initial delivery mechanism — browser/PWA, installed desktop shell, native client, or
another approach — is deliberately left unresolved** until its real requirements are established: the
capabilities above **plus** performance, offline behaviour, streaming, local compute/cache, and OS
integration. **We do not yet know enough to choose.** The architectural obligation is fixed regardless of
that choice: **whatever the delivery mechanism, and even if an installed client is chosen later, it wraps
the same shared platform and must never require a second intelligence stack.** The shell technology
(Electron/Tauri/native) is chosen **after** the requirements are committed — no recommendation is made now.

### 7.12 The product-family entitlement boundary (K)

**No pricing here** — only the invariant along which entitlements must run. **[CH7]**
- **The invariant: entitlements must never create contradictory Argus intelligence truth.** All clients and
  tiers operate over the **same canonical intelligence, identity, reasoning, and accountability
  semantics**; a lower entitlement must **never cause Argus to hold a different canonical thesis merely for
  commercial segmentation**.
- **What entitlements *may* legitimately govern:** client capabilities; context/workspace scale;
  monitoring and alerts; historical depth; **licensed/premium datasets or research sources**; data
  granularity; refresh frequency; advanced analytics; professional workflows; compute-intensive
  functionality. So **product depth and available evidence/data may legitimately differ** across tiers —
  the **canonical truth does not**.
- **Enforced at the platform (API) layer** via the **same bearer identity** — the client asks, the
  platform authorises by entitlement claims; a client can never grant itself capability the platform
  withholds, and **the intelligence core is never forked by tier**.
- **Explicitly deferred:** actual tiers, prices, and packaging are **[NEEDS DECISION / LATER]**.

> **Canonical-truth invariant (founder-locked, L-11).** There is **one canonical Argus intelligence
> computation.** Entitlements may govern **how much** evidence, underlying data, history, granularity,
> analytical depth, tooling, monitoring, compute, and explanation a user can access — but they must
> **never cause Argus to recompute a different canonical thesis for a commercial tier.** Premium/licensed
> data may therefore **deepen what a user can inspect** or **what supporting evidence is exposed**, but
> entitlement segmentation must **never create separate tier-specific Argus truths.** Hold the distinction
> firmly: **same canonical intelligence → different access/depth** is allowed; **different entitlement →
> independently recomputed Argus thesis** is prohibited. This is consistent with **L-5's one canonical
> computation contract** and **Chapter 6's single accountability/reasoning architecture.** No pricing or
> tier packaging is designed here.

### 7.13 What must never be duplicated

The anti-"three Argus systems" list — each of these is **one** platform artifact, consumed by all clients:
identity **minting + resolution**; **universal search / FIND / ASK**; the **relationship model**; the
**reasoning / `explain()` contract**; the **M3 ledger + calibration**; **personalisation semantics**; the
**Morning Brief's intelligence computation**; the **canonical UID + `/intel/<uid>` route**; the **graph
engine cores**. Clients duplicate **only** presentation, layout, density, and interaction adapters (incl.
pointer/touch). **If a second client re-ports any item on this list, the architecture has failed.** **[CH7]**

### 7.14 What Chapter 7 extends / amends

- **Extends (inherits):** Chapter 2 (one intelligence, many projections — a client is the largest
  projection), Chapter 3 (the Network cores as the shared visual engine), Chapter 4 (the Dossier grammar
  reflowed per client), Chapter 5 (FIND/ASK realised as a platform service), Chapter 6 (accountability
  woven; Seal beats on the Workstation board), and `ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1` (the
  6-stage spine as the shared core).
- **Amendments flagged (later, through each doc's gate — not made here):** **BA-1** the Product/Master
  Architecture — register the **client/platform boundary** (three clients over one platform; the shared
  five layers; the never-duplicate list). **BA-2** the Surfaces doc — note that a **client** is a
  projection unit above a surface, and that resolver/search/Brief move to the platform line. **BA-3** the
  Knowledge Model — add **Context** and **Workspace** as first-class *experience* objects (not new
  *intelligence* objects) **only if** the model chooses to represent them; no new intelligence object is
  required. **No canon amended in this step.**

### 7.15 Decisions requiring founder input (M)

- **L-1 — Family shape.** Confirm **three clients over one platform** (not three products, not modes of
  one web app), organised by **context cardinality + density** — intelligence identical across all (§7.0).
- **L-2 — The platform line.** Confirm the **shared five layers** (identity+resolution, intelligence core,
  shared graph/memory, account+sync, composed products) and that a client is **presentation + interaction
  posture only** (§7.2, §7.13).
- **L-3 — Identity resolution & search are platform-owned capabilities.** Confirm the **invariant**:
  canonical identity resolution and Universal Search/FIND are **platform-owned capabilities consumed
  identically by every client — no client independently reimplements UID resolution or search
  semantics**; retire the three divergent frontend copies. The **final endpoint/API shape is an
  implementation decision** (the `/api/resolve` + `/api/search` sketch in §7.6/§7.9 is illustrative, **not
  canon**); **Chapter 5's FIND/ASK doctrine is unchanged** (§7.6, §7.9-1). *(Keystone — also unblocks any
  second client.)*
- **L-4 — Context becomes a first-class, multiplicable object.** Confirm generalising the scalar active
  context into a **context set** (web/mobile = N = 1 projection; Workstation = N > 1), reconciling the
  second per-page focus system, so **today's single-slot is not a platform limit** (§7.7). *(Directly
  answers the founder's `setActiveContext` concern.)*
- **L-5 — One canonical composed intelligence.** Confirm the **invariant**: every client consumes the
  **same canonical composed intelligence** (Morning Brief, shared graph/memory) — clients render/project
  it, they **never independently produce divergent versions of Argus's reasoning**; the Web client stops
  independently owning/recomputing it. **Server-side computation, a deterministic shared package, a
  dedicated service, or a hybrid all remain valid** provided there is **one canonical computation
  contract**; the `followed_themes` collision resolves to a **single source of truth** (§7.9-2, §7.10).
- **L-6 — Personalisation & workspaces sync by account; account schema must be source-controlled.**
  **[LOCKED]** Promote device-local personalisation to server, add a synced **workspaces** object, and hold
  the **architectural requirement** that the persistent account schema — incl. the currently un-versioned
  `profiles`/`user_preferences`/`saved_items`/`watchlist` — be **eventually baselined into source-controlled
  migrations**, treating the **live production schema as authoritative** and adopting it **safely, never
  destructively recreating/dropping/altering live tables**. Resolves the schema-versioning gap; **not
  authorised now** (§7.6, §7.9-3/4/7).
- **L-7 — Workstation = manipulable intelligence, not a Bloomberg clone.** Confirm Workstation's unique
  jobs (multi-context, cross-context reasoning, workspaces, monitoring, dense comparison) and that **web
  must not grow into it by adding panels** (§7.4).
- **L-8 — Mobile's deliberate omissions.** Confirm mobile omits multi-context, the dense manipulable
  Network, and heavy dashboards — keeping Brief, alerts, single-entity investigation, FIND (later ASK)
  (§7.5).
- **L-9 — Network cores shared; renderers per client + touch.** Confirm the DOM-free cores as the shared
  engine and per-client rendering/interaction adapters (adding pointer/touch), with mobile getting a
  simplified/read-only relationship view (§7.8).
- **L-10 — Workstation delivery mechanism deliberately unresolved.** Confirm the **capability-first**
  analysis and that Electron/Tauri/native is deferred — **and** that Workstation's **initial delivery
  mechanism (browser/PWA, installed desktop shell, native, or other) is deliberately left unresolved**
  until its real requirements are established (persistent monitoring, multi-window/multi-monitor,
  notifications, local compute/cache, streaming, performance, offline, OS integration). Architecture must
  ensure choosing an installed client later **never requires a second intelligence stack** (§7.11). *(No
  delivery-mechanism recommendation is made now.)*
- **L-11 — Entitlements never create contradictory intelligence truth.** Confirm the **invariant**:
  entitlements must **never cause Argus to hold a different canonical thesis for commercial segmentation**
  — all clients/tiers operate over the same canonical intelligence, identity, reasoning, and accountability
  semantics. Entitlements **may** legitimately govern client capabilities, context/workspace scale,
  monitoring/alerts, historical depth, **licensed/premium datasets**, data granularity, refresh frequency,
  advanced analytics, professional workflows, and compute-intensive functionality — so **product depth and
  available evidence/data may differ, but never the canonical truth**. **Same canonical intelligence →
  different access/depth is allowed; different entitlement → independently recomputed Argus thesis is
  prohibited** (the founder-locked canonical-truth invariant, §7.12). Enforced at the platform by the same
  bearer identity; **actual tiers and pricing deferred** (§7.12).

### 7.16 Migration implications (stated, not implemented) (L)

**Order (platform-first — never build client-specific intelligence):** **[CH7 · design-only]**
1. **Generalise the context model** scalar→set and reconcile the second per-page focus system (§7.7) — the
   keystone that stops the single-slot becoming a platform limit. Web/mobile keep N = 1.
2. **Establish platform-owned identity resolution + Universal Search/FIND**; collapse the three frontend
   copies to one binding (§7.6) — no client reimplements resolution/search. Realises Chapter 5 and unblocks
   any second client. *(API shape is an implementation decision, not doctrine.)*
3. **Establish one canonical composed intelligence** (Brief + graph/memory) that clients render — server,
   deterministic shared package, dedicated service, or hybrid, preserving one canonical contract; fix the
   `followed_themes` collision (single source of truth) (§7.9-2).
4. **Sync personalisation + add workspaces**, landing account schema as source-controlled migrations
   (§7.9-3/4/7).
5. **Split Network cores from renderers; add pointer/touch + adapter** (§7.8).
6. **Only then** build the **Workstation dense client** and the **Mobile client** as postures over the now-
   shared platform; **choose Workstation's delivery mechanism (browser/PWA, installed shell, native, or
   other) only when §7.11's requirements are established** — never a second intelligence stack.

**Ordering constraint: platform before clients.** Every client-specific step (Workstation density, Mobile
omissions, the eventual delivery-mechanism choice) is **downstream** of establishing platform-owned
resolution, search, and canonical composed-intelligence computation. Building a second client *before* that guarantees the three-Argus-systems failure this
chapter exists to prevent. Nothing here enables code; the two audited leak points (context scalar; stranded
resolver/search/Brief) are the ordered first work.

*End of Chapter 7 — **APPROVED** (founder decisions L-1…L-11, 2026-07-31). The refinement pass recast four
decisions to invariants rather than implementations — **L-3** (identity resolution + search are
platform-owned capabilities; endpoint shape is not doctrine), **L-5** (one canonical composed intelligence;
server / shared package / service / hybrid all valid), **L-10** (Workstation delivery mechanism deliberately
unresolved), **L-11** (entitlements must never create contradictory canonical truth) — and the final lock
added the **§7.12 canonical-truth invariant**, the **L-6 source-controlled-schema requirement** (baseline
live tables safely, not authorised now), and **working-labels-only** naming (Chapter 1 deferral preserved).
Anti-duplication doctrine: **build Argus intelligence once; project it differently.** Architecture/design
only. **No product code changed; no client built; no schema migrated; no Supabase change; no delivery
mechanism or shell technology chosen; no pricing designed. No canon amended (BA-1…BA-3 flagged, not made);
no commit.** Chapter 8 has not been started.*

---

## Chapter 8 — Experience & Aesthetic Principles

*Architecture/design only. This chapter answers: **what should using Argus feel like, and what visual/
interaction laws make every surface feel like part of the same premium intelligence system?** It is **not**
a token/component spec and does **not** reduce the answer to "dark institutional UI." It inherits every
prior chapter (the surfaces, the entity grammar, the Network, accountability, the client family) and is
**subordinate to `ARGUS_INTELLIGENCE_NETWORK_V2.md` (the Design Bible)** for the Network's Form Language and
protected gestures — where Chapter 8 would touch those, it **flags for the Bible's own amendment gate,
never overrides.** Grounded in a read-only visual audit of the frontend (2026-07-31). It designs doctrine
only: **no tokens, components, or styles are implemented; the product is not redesigned or rewritten.***

**Proposal tags (used on every major item):** **[EXISTING / KEEP]** already true and correct ·
**[REFINE]** exists, evolve it · **[REPLACE]** exists, supersede it · **[NEW]** does not exist ·
**[DESIGN-BIBLE GATE]** touches the Bible's protected language — flag for its V2.x/V3.0 gate, do not act here.

> **Status: APPROVED — founder decisions O-1…O-13 (2026-07-31).** Locked doctrine:
> 1. **One canonical dark theme** at the shell; current palette kept directionally; **light mode deferred**
>    as a future coherent second theme, never per-page divergence (O-1).
> 2. **The aesthetic thesis — "the lit instrument"** (quiet analytical field + earned luminance + strategist
>    restraint), an **internal** experience name, **not external branding** (O-2).
> 3. **Colour = meaning** (semantic role tokens; honesty colours for recorded-vs-reconstructed) and
>    **controlled/earned luminosity** (light only at live/focus/certainty/resolution/newness; matte
>    elsewhere) (O-3).
> 4. **Typography + hierarchy** — `next/font`, resolve the mono role, a semantic type scale, and
>    **ambient→structural→informational→actionable→critical** driven by weight/ink/light, not new colours (O-4).
> 5. **Surface/depth model** — a named vocabulary + **one card idiom**; the "AI-dashboard" look forbidden (O-5).
> 6. **Motion moves only to communicate**; discrete terminal beats; protected gestures preserved;
>    reduced-motion first-class (O-6).
> 7. **The Argus Intelligence Chart** — a reusable signature object showing **price + what Argus understood
>    around it**, using the same canonical intelligence, not a second engine (O-7).
> 8. **Network experience levers + a performance/experience *invariant*** (premium fidelity, idle-when-quiet,
>    reduced-motion, explicit budgets); **the renderer is an implementation decision, not locked here** (O-8).
> 9. **Company-ladder continuity *invariant*** — identity/investigation-state/context continuous across
>    Panel→Explorer→Dossier, no dead end (the Dossier `/feed` dead-end must not remain); mechanism is
>    implementation (O-9).
> 10. **One visual system across clients**, varied only by density/interaction posture (O-10).
> 11. **Accessibility + performance are premium quality** — reduced-motion everywhere (close the
>     `NetworkGraph` gap), rationed luminosity within budget, legibility/contrast floors (O-11).
> 12. **All protected-gesture/generalisation questions route through the Design Bible's own gate; the Bible
>     is not modified here** (O-12).
> 13. **Information-gravity doctrine** — visual hierarchy reflects **intelligence significance**, not
>     content/component type or recency; ordinary intelligence recedes; equal-card/equal-row treatment
>     forbidden; universally material intelligence can command gravity, personal relevance never suppresses
>     it; **importance earns clarity and gravity, not alarmism**; **driven by the existing Ch2/Ch6 ranking
>     architecture — no second significance engine** (O-13).
>
> Design-Bible items (§8.13) are **flagged for the Bible's V2.x/V3.0 gate, not made here.** No product code,
> tokens, components, or styles implemented; the product was not redesigned. Other canon: **CA-1…CA-2
> flagged, not made.** Implementation deferred unless the broader architecture process calls for it.

### 8.0 The central question and the aesthetic thesis

**What should Argus feel like? — Like a quiet dark instrument that lights only where it is thinking.** Not a
dashboard of glowing cards; not a neon trading toy; not a utilitarian terminal. A calm analytical field,
matte and precise at rest, where **luminosity is *earned by cognition*** — light marks where intelligence
is live, changing, focused, certain, or being interrogated. The premium feeling the founder described
(vibrancy, lighting, dimensionality, "financial information visually alive") is delivered **as contrast**:
quiet space is the ground; luminance is the event. This is exactly the founder's own phrasing — *"contrast
between quiet analytical space and moments where intelligence visually comes alive"* — and it is already the
Design Bible's law for the Network (**Still Cognition §3A.4**: *"rare single beats on a still field read as
deliberation; continuous animation would read as noise"*; *"new objects may be briefly luminous; old
objects are notched, settled, matte"*). **Chapter 8 generalises that one doctrine from the Network to the
whole product.** **[REFINE — generalises an existing Network doctrine · see §8.13 DESIGN-BIBLE GATE]**

**Three commitments give Argus its own recognisable language** (neither Robinhood nor Bloomberg):
1. **The instrument, not the dashboard.** One canonical dark analytical field; not endless rounded
   rectangles floating on black. Robinhood Legend is inspiration for *how financial data can feel lit and
   alive* — **for charts**; it is **not** an identity to imitate. **[NEW doctrine over EXISTING dark palette]**
2. **Light is earned by cognition.** Glow/bloom/gradient appear only where the mind is working — live
   change, focus/trace, high certainty, a resolving prediction, newly-arrived intelligence. Everywhere else
   is quiet. **[REFINE — extends the Bible's "briefly luminous / lit path only" rule product-wide]**
3. **The measurement is the jewelry.** Certainty is legible as visual *weight* (the Bible's **ink
   discipline / Figure §3A.2**: a 78 printed heavier than a 42); the numbers and the lit paths are the
   decoration budget — not chrome, gradients, or ornament. **[EXISTING / KEEP — already Bible law; adopt product-wide]**

Bloomberg is inspiration for **information utility/density** (Chapter 7's Workstation), never for Argus's
look. Argus's visual identity is the **Form Language DNA + earned luminance + senior-strategist restraint**
(Bible §4B: *"states, never exclaims"*). The five-second recognisability test (Bible Part 1A, no-logo crop
§3A.5) is the acceptance gate.

### 8.1 Current visual-system audit (A)

Grounded in the five-part read-only audit. Every claim is verifiable in-repo.

**Token foundation — a good skeleton, one page deep.** `frontend/src/app/globals.css` defines **11 semantic
colour channels** as RGB CSS vars (`--canvas/surface/raised/edge{,-subtle,-strong}/ink{,-secondary,-muted,
-faint}`) on a **light-by-default `:root`**, with **one** dark override — the `.markets-dark` scope class.
`tailwind.config.ts` has a genuinely good `boxShadow` scale (`card/card-hover/card-lift/top-story/drawer/
modal/nav`), a `navy` brand ramp, `accent`, `cat` (category) and `impact` palettes, and `fontFamily`
sans=Inter / mono=JetBrains Mono. **[EXISTING]**

**But adoption is thin and the skin is inline.** No `darkMode` strategy in Tailwind (dark = the one scope
class). **`.markets-dark` is used on exactly one page** (`markets/page.tsx`). Colour at the point of use is
overwhelmingly ad-hoc: **~1,989 inline `style` colour declarations + ~652 raw hex literals across ~60
files** (worst: `ma/page.tsx` 219, `ThemeDrawer.tsx` 208, `page.tsx` 141). There is **no reusable Card/
Panel/Surface component** — the card look is re-declared per file. **[LEGACY-DEBT]**

**Typography is fragile.** **No `next/font`**; Inter is pulled via a render-blocking Google-Fonts `@import`
in `globals.css`. **JetBrains Mono is referenced 68× across 14 files but never actually loaded** — every
"terminal" ticker/figure silently falls back to generic `monospace`. The type scale is minimal (only
`2xs`/`xs` custom); most sizing is **inline pixel strings** (`fontSize:"8.5px"`). The **one** disciplined
exception is `NetworkInspector.tsx`, which consumes a real ramp (`TYPE`/`SPACE`/`INK` from
`lib/network/tokens.ts`). **[LEGACY-DEBT + one EXISTING model to promote]**

**Surfaces — no shared shell; "dark" achieved four incompatible ways.** `app/layout.tsx` delegates
background, width, and theme entirely to each route (no `PageShell`). The dark pages don't agree on a
black: Home & M&A `#030710`; Feed `#0A0F1C`; Markets token-scoped; **Industries is a light/dark hybrid**;
**Listen is fully light**. Two non-interoperable card systems coexist: **token-light** (`bg-surface
rounded-xl shadow-card border-edge`) vs **inline-dark** (`rgba(5,9,x)` fills, 5–8px radii, coloured
left-border). Max-width varies (`5xl` norm, M&A `7xl`, Feed `6xl`). The nav is hardcoded dark glass over
every page, light or dark. **[LEGACY-DEBT]**

**Charts — the doctrine skeleton already exists, hand-built.** **No chart library** anywhere; all visuals
are hand-authored SVG/canvas/DOM. **`components/explore/MarketView.tsx` is already "price + what Argus
understood around it"**: real OHLCV candlestick/line (from `lib/marketSeries.ts`, with honest empty
states), an **Intelligence Overlay** dropping catalyst markers on the price axis, a synchronised
**Conviction History** line, a **Catalyst Timeline**, crosshair, zoom/pan, volume, dual axes.
`ExplorerGraph.tsx` is a high-quality SVG causal-flow graph. **[EXISTING — a strong, exact foundation]** But
it is a **local, un-tokenised** implementation (geometry as local constants), the conviction/catalyst
layers **fall back to badged `Sample` scaffolding** when memory is thin, the **markets page has no chart at
all**, institutional memory is shown as **text ranges, never a plotted band**, and the DOM-bar idiom
(`width:%`+gradient) is re-invented across **29 files**. **[LEGACY-DEBT]**

**Motion & luminosity — "restrained-present, trending alive," concentrated in the canvas.** framer-motion
in **46 files**, deliberately small (0.14–0.22s fades, micro hover lifts; no springs/scroll/layout motion).
`globals.css` has a named, reduced-motion-gated **"computational ambient" CSS library** (`tg-breathe/
live-dot/band/tape/halo/wave/glow/recalc/packet/chip`) — data-bindable, doctrine already codified (*"subtle,
never decorative, no physics no glow no chaos"*). **[EXISTING — a real asset]** Real lighting exists **only
inside the canvas graphs**: `IntelligenceNetwork.tsx` (render-on-demand, disciplined: vignette + dot-field
atmosphere cached offscreen, modest active-node `shadowBlur`, zero idle frames) and `NetworkGraph.tsx`
(continuous rAF, luminous Palantir-style **confidence-encoded additive bloom**, cluster haze, glass nodes).
The **DOM UI is intentionally matte** (real `backdrop-blur` ≈ nav only; glow confined to `tg-glow` rails,
live dots, card lifts). **[EXISTING]**

**Signature gestures — Trace/Rail/Figure/Notch built; Seal beat/Interrogation ladder/Cut/Thread doc-only.**
Implemented today: **Trace** (two implementations — one-shot cause-first reveal), the **Rail** (measure on
the left spine), the **Figure** (conviction numeral as boldest ink), the **Notch** (faceted memory corner),
delta "▲N today" beats, a recalculation ripple. **Absent from code** (Bible concepts only): the **Seal
beat** (300ms fill-to-verdict), the **Interrogation ladder** (as a named five-depth path), the **Cut**, the
**Thread** as a named primitive. **[EXISTING partial + build targets]**

**States & accessibility.** Skeletons exist and are the norm (`animate-pulse`, not shimmer). Hover/focus/
selection is rich but understated (251 `hover:/focus:/ring-` usages). Live/change is where Argus is most
alive (`tg-wave` new-item sweep, breathing nodes, delta badges, `NewStoriesBanner`). Reduced-motion is
honoured in `globals.css`, `IntelligenceNetwork.tsx`, and `model.ts` (test-enforced) — **but the
continuous-rAF `NetworkGraph.tsx` ignores it entirely** and never idles (the heaviest GPU pattern), and
framer-motion components don't gate on it. **[EXISTING + accessibility gap]**

**Company depth ladder — four surfaces, two design families.** `EntityChip` tooltip (glance) →
`IntelligenceDrawer` (Quick Panel) → `/explore/[entity]` (Explorer) → `CompanyDossier`/`EventDossier`
(Dossier). **Panel + Explorer are one family** ("dark terminal": `#080c14/#05080f`, `rgba(255,255,255,x)`
via a local `A(n)` helper, micro type, data from `lib/intelligenceShared`). **Dossier is a second,
deliberately different family** ("editorial file": `#0A0F1C`, tokenised `INK/BORDER/TYPE`, document-scale
prose, `Absence` empty states, no motion, disciplined shared `primitives.tsx`). The **section-header
primitive is defined three different ways**; entity chrome differs three ways (`EntityChip` vs `TickerChip`
vs raw buttons); the ladder is **one-directional** (the Dossier is a dead-end, exiting only to `/feed`).
Only the **accent `#7cc7d8`** is shared across all four. **[LEGACY-DEBT + continuity substrate to build on]**

### 8.2 Cohesion problems / visual debt (B)

What makes Argus feel like **one product today** is a *thin decorative skin*, not a system: the teal accent,
wide-tracked uppercase eyebrow labels, the pulsing Live dot, the `tg-*` ambient vocabulary, and the shared
dark-glass nav. What makes it feel like **separately designed pages** is that there is no shared surface
system beneath that skin. The visual debt, ranked:

1. **No canonical theme.** Light-by-default + a single `.markets-dark` opt-in → four incompatible "darks"
   and two fully-light outliers (**Listen**, **Industries**). *The single highest-leverage fix.* **[REPLACE]**
2. **No page shell / surface primitive.** Background, width, theme, and cards are re-declared per route;
   two card systems that never meet. **[NEW / REPLACE]**
3. **Colour lives inline, not in tokens.** ~2,600 inline colour/hex sites; tokens exist but are bypassed. **[REFINE]**
4. **No semantic type or spacing scale** (except `NetworkInspector`); mono font referenced but unloaded. **[REFINE / REPLACE]**
5. **The company depth ladder is two families**, not three depths of one experience; no return path up. **[REFINE]**
6. **Charts are a one-off, not a system**; the "what Argus understood" layer is often placeholder. **[REFINE / NEW]**
7. **Luminosity is canvas-trapped**; the DOM has no earned-light language. **[NEW]**
8. **Accessibility/perf gaps:** `NetworkGraph` ignores reduced-motion & never idles; framer-motion ungated. **[REFINE]**

**Outliers to name (from the audit):** Listen (hardest break — fully light), Industries (hybrid), M&A
(purple accent + `7xl` width, off the teal norm), and **Markets as the *positive* outlier** — the one page
built on the token system, i.e. the template the others should have followed.

### 8.3 The Argus aesthetic thesis (C)

**"The lit instrument."** Argus is a **dark analytical instrument** whose recognisable signature is:
*Form-Language material + earned luminance + strategist restraint.* *("The lit instrument" is an **internal
experience/aesthetic thesis name — not external branding or marketing canon**; Chapter 1's naming-deferral
posture holds.)* The thesis resolves the founder's
"premium/alive/luminous" intent against the Bible's "restraint = perceived cognition" without compromise,
because in both the *same rule* holds: **light is the visible trace of the mind working, on a quiet ground.**
Concretely, the product-wide laws that follow (§8.4–§8.12) all serve one identity:

- **Premium** = restraint + precision + earned light, not ornament. **[NEW doctrine]**
- **Alive** = data-bound beats and earned luminance on *change/focus*, never ambient decoration. **[REFINE]**
- **Legible & never exhausting** = quiet matte default; the eye rests, then is drawn to what changed. **[NEW]**
- **Dense when appropriate** = density is a *client posture* (Ch7: Mobile selective → Web focused →
  Workstation dense), carried by **one** visual system, not three. **[EXISTING link to Ch7]**
- **Recognisable** = passes the no-logo crop test product-wide (Bible §3A.5). **[DESIGN-BIBLE GATE — extends the test's scope]**

### 8.4 Colour + luminosity doctrine (D)

**Colour communicates meaning, never decoration** — the founder's rule, made into tokens.

**(a) One canonical dark theme. [REPLACE — the keystone visual decision]** Promote a single dark token set
to the **shell default** (a canonical dark `:root`, or a shell wrapper), collapsing the four hand-rolled
darks and the two light outliers onto **one** field. The current dark palette is *directionally kept, not
discarded* (founder intent). A **light mode is deferred, not built ad-hoc** — if ever offered it is a second
tokenised theme, never a per-page divergence. *(Founder decision — §8.15 O-1.)*

**(b) Semantic colour roles, not raw hex. [REFINE]** Extend the existing 11 channels into a role set that
carries meaning: *background structure · navigation · ordinary intelligence · important intelligence ·
selected/focused · opportunity · risk · live/change · prediction (open) · resolved (confirmed / not / view-
changed / untested — Ch6 §6.6c) · uncertainty · stale · reconstructed-vs-recorded (Ch6) · interactive
control.* Reuse the palette already in practice (up/strength `#34d399`, risk `#f87171`, accent `#7cc7d8`,
driver `#f0b429`, theme `#a78bfa`) but bind it to **named roles** so meaning is centralised and the ~2,600
inline sites migrate to tokens over time. **Honesty is a colour rule:** reconstructed history and derived
provenance are visibly *quieter* (the Bible's opacity discipline), never styled identically to recorded
fact. **[REFINE + EXISTING Bible ink discipline]**

**(c) Controlled luminosity — where light is earned. [NEW product doctrine; REFINE of canvas practice]**
Light appears **only** at these earned moments, and is otherwise absent:

| Earned luminance | Where | Restraint rule |
|---|---|---|
| **Live / just-changed** | delta beats, new-item `tg-wave`, strengthening rails | one discrete beat, then settles (Bible "thoughts arrive as beats") |
| **Focus / trace** | the lit path on selection; focused entity | *only* the traced path is bright (Bible: "the only bright thread is the one being traced") |
| **Certainty** | Figure weight, conviction rail, confidence-encoded node bloom | intensity ∝ conviction; certainty reads as pressure, not glow-for-glow's-sake |
| **Resolution** | the Seal beat (Ch6) | the single sacred 300ms motion; everything else holds still |
| **Newness** | briefly-luminous new objects | new is luminous; **old is matte & notched** (Bible Notch) |

Everywhere else — structure, ordinary intelligence, navigation, rest state — is **quiet and matte**. Glow/
bloom/gradient/edge-lighting/atmosphere are **rationed**: the canvas already does this well (vignette + dot
field, confidence-encoded bloom); the DOM currently does not, and gains a *restrained* earned-light layer
(hero/selected/live states), **never** neon, never ambient, never on threads at rest. This is a **product-
wide extension of the Bible's Still-Cognition/luminance rules** → **[DESIGN-BIBLE GATE — §8.13]**.

### 8.5 Typography + information hierarchy (E)

**(a) Fix the foundation. [REFINE]** Load fonts via `next/font` (preload, no render-blocking `@import`);
**either load JetBrains Mono or drop the mono role** — today 68 "terminal" usages silently fall back to
generic monospace, which quietly undercuts the premium data aesthetic. **[LEGACY-DEBT → REFINE]**

**(b) A real semantic type scale. [NEW / promote EXISTING]** Promote the `NetworkInspector`/`primitives.tsx`
model (`TYPE`/`INK` ramp) to a **product-wide named scale**, retiring inline pixel strings. Named roles:
*headline · intelligence statement (the lead thesis) · narrative explanation (prose) · data/figure (mono,
tabular) · ticker · label (wide-tracked uppercase eyebrow — already a de-facto signature) · metadata ·
timestamp · confidence/accountability language · chart annotation.* **[REFINE]**

**(c) The visual hierarchy — ambient → structural → informational → actionable → critical. [NEW]** Adopt this
five-band hierarchy product-wide (the audit supports it; it maps cleanly onto the Bible's ink discipline):
*ambient* (atmosphere, quiet ground) → *structural* (shell, nav, section rules) → *informational* (ordinary
intelligence, prose, data) → *actionable* (controls, the focused/selected object, opportunities) →
*critical* (risk, a resolving prediction, a live regime change). **Weight, ink, and earned light — not new
colours per element — move an object up the hierarchy.** The Figure is the boldest ink; certainty is
pressure; importance is luminance. **[NEW doctrine, EXISTING mechanisms]**

**(d) Information-gravity doctrine (founder-locked, O-13). [NEW]** Argus's visual hierarchy must reflect
**intelligence significance — not content type, component type, or recency alone.** Intelligence with
materially greater expected consequence can **earn proportionally greater visual prominence** through
spatial allocation, hierarchy, Figure/ink weight, contextual depth, and controlled luminance; **ordinary
intelligence recedes.** The interface must **avoid equal-card / equal-row treatment that visually implies
all information matters equally** — the audited "everything is a card" pattern is precisely the anti-pattern
this principle forbids (and it reinforces §8.6). Universally material intelligence — e.g. major macro
releases/surprises, central-bank decisions, major earnings shocks, severe geopolitical developments,
substantial market dislocations, or other events Argus's architecture determines have broad consequence —
can command gravity on any surface; **personal relevance may alter ranking/prominence but must never
suppress universally material intelligence** (the Chapter 2 universal-floor + systemic-importance composite,
and the Chapter 6 §6.6b resolution-eligibility contract, expressed visually). This is **not permission for
sensational UI — importance earns *clarity and gravity, not alarmism*** (Bible voice §4B: *"states, never
exclaims; a crisis gets shorter sentences, not louder ones"*). **Crucially, this creates no new visual
importance score:** prominence is driven by the **existing canonical intelligence/ranking architecture**
(Chapter 2 systemic-importance composite; Chapter 6 materiality) *rendered* — **never a second significance
or ranking engine.**

### 8.6 Surface / depth model (F)

**Replace "everything is a card" with a named surface vocabulary. [REPLACE / NEW]** The audit shows a rich
but ad-hoc set; Chapter 8 names it and assigns each a job, so complexity is solved by *depth*, not by piling
cards on black:

| Surface | Job | Status |
|---|---|---|
| **Canvas** | the living instrument (Network, Chart) — full-bleed, lit | **[EXISTING / KEEP]** |
| **Panel** | a bounded standing region of intelligence (inspector, Quick Panel) | **[REFINE — unify]** |
| **Rail** | a thin standing measure/margin (the Bible Rail; left-spine meters) | **[EXISTING / KEEP]** |
| **Row** | one item in a scannable sequence (Feed stream, ledger rows) | **[REFINE]** |
| **Card** | a *self-contained* object worth lifting off the field — **used sparingly**, one idiom | **[REPLACE the two systems with one]** |
| **Overlay** | transient cross-page focus/command (IntelligenceOverlay, FocusBar) | **[EXISTING / KEEP]** |
| **Drawer** | a summoned depth beside context (unify the four widths/z-scales) | **[REFINE]** |
| **Workspace** | the full multi-context investigation environment (Ch7 Workstation) | **[NEW — Ch7 link]** |

**Anti-pattern named:** the "AI-dashboard" look — endless equal rounded rectangles floating on dark — is
prohibited (echoes the Bible's anti-patterns §4A.6). One **Card** idiom replaces the two competing systems;
**negative space and one spacing scale** replace ad-hoc pixel padding; cards earn their lift, they are not
the default container. **[REPLACE]**

### 8.7 Motion doctrine (G)

**Argus moves only to say something. [REFINE — extends the existing codified budget]** The audit found the
doctrine *already written* in `globals.css` (*"meaningful motion only … no physics, no glow, no chaos"*,
240/480ms) and in the Bible (Still Cognition). Chapter 8 makes it product-law: motion is permitted **only**
to communicate one of —

*new intelligence · causal propagation (the Trace) · focus / context transition · state change · resolution
(the Seal beat) · loading/computation · relationship tracing* —

and is **prohibited as ambient decoration** ("animation to look alive"). Beats are **discrete and terminal**
(the change lands, then stillness returns); continuous motion is reserved for the *instrument at work*, not
the page at rest. **Protected Network gestures are preserved exactly** — Trace, Return, the Seal beat, the
Interrogation ladder are the Bible's and are **not** to be diluted or casually reused (§8.13). **Reduced
motion is a first-class path, not an afterthought** (§8.12). **[REFINE + EXISTING + DESIGN-BIBLE GATE for any generalisation]**

### 8.8 Chart doctrine (H) — charts become first-class Argus objects

**The goal is not "price over time" but "price + what Argus understood was happening around that price."**
The audit's key finding: **that chart already exists** (`MarketView.tsx`) — it is not a library component in
a dark card, it is a hand-built instrument with an intelligence overlay. Chapter 8's doctrine is to
**promote it into the canonical *Argus Intelligence Chart*, tokenised and reusable**, and connect it to
Chapters 3/4/6 **without inventing a second intelligence system.**

- **[REFINE → NEW]** Extract a **reusable, tokenised chart primitive** (shared axis/scale/crosshair/tooltip/
  marker kit) from `MarketView`'s local geometry, so every surface (Explorer, a future Markets chart, the
  Dossier, Workstation) draws from **one** chart grammar instead of re-inventing bars across 29 files.
- **Line/fill/lighting. [REFINE]** Illuminated line (the Legend-inspired premium quality — earned, §8.4c),
  gradient area fill, quiet grid, restrained crosshair. Lighting is earned by *the current/traced series*,
  not sprayed across the panel.
- **The intelligence layer is canonical, not optional. [REFINE]** Event markers on the price axis
  (earnings/macro/development — Ch4), **thesis overlays** (Argus's Current Forward View — Ch4 I-3),
  **prediction overlays** and the resolving **Seal beat** (Ch6), regime/theme/relationship bands **only
  where justified** (never clutter). Each overlay obeys provenance honesty: **recorded ≠ reconstructed**
  (Ch6) is a visible distinction, and today's **`Sample` fallback must stay explicitly badged** — a premium
  chart never dresses placeholder as fact. **[REFINE + EXISTING honesty law]**
- **[NEW] A plotted institutional-memory band** — conviction range / first-seen / regime history drawn *on
  the time axis* (today it is text only), so the chart shows Argus's evolving understanding, not just price.
- **Axes/grids/tooltips/selected-ranges/transitions/loading/comparison/accessibility. [REFINE]** One kit,
  honest empty states (already a strength of `marketSeries.ts`), keyboard/AT access (§8.12), comparison as a
  Workstation posture (Ch7). **The chart connects to the Network and Dossier as the *same* intelligence in a
  different projection — never a parallel engine.** **[EXISTING architecture law, Ch7 L-5]**

### 8.9 Intelligence Network experience doctrine (I)

The Network is the Bible's domain; Chapter 8 only states *why it doesn't yet reach the target and which
levers are experience-level*, and **flags Bible-touching changes for its gate.** The target (founder): a
**living map of the current market state** where the user instantly reads *what matters, what is
strengthening/weakening, what affects what, who is involved, where to look next* — **not "more nodes / more
animation."**

- **[EXISTING / KEEP]** The Form Language DNA (Cut/Rail/Figure/Notch/Thread), Still Cognition, the protected
  gestures — **preserved, not weakened.**
- **[REFINE]** Composition, depth, lighting, labelling, hierarchy, inspector behaviour, and the transition
  between market-wide and entity-specific context are the levers most able to raise perceived quality —
  applying §8.4c earned-luminance and §8.5 hierarchy so the *dominant chain* reads first and the rest
  recedes (the Bible's "train of thought"). Better labelling/typography (the loaded mono, §8.5a) and the
  quiet→lit contrast do more than node count.
- **[REFINE — performance/experience *invariant*, not a renderer choice]** The canonical Network rendering
  architecture must **preserve premium visual fidelity and responsive interaction while idling when no
  meaningful visual work exists, respecting reduced-motion, and operating within explicit CPU/GPU/battery
  budgets.** Two engines exist today — the render-on-demand `IntelligenceNetwork` (already idles, respects
  reduced-motion) and the continuous-rAF `NetworkGraph` (luminous but **ignores reduced-motion and never
  idles** — the heaviest GPU cost, the audited gap). **Which engine survives — consolidation, modifying
  `NetworkGraph`, render-on-demand, hybrid rendering, or another approach — is an implementation decision
  subject to later audit** (intersects Ch3/M4). The invariant is locked; the renderer is not (§8.12).
- **[NEW build target, per the Bible] The Seal beat and the Interrogation ladder** are specified but **not
  implemented**; building them realises accountability-made-felt (Ch6) and the five-depth question path.
  Building to spec is implementation, not a Bible change — **but any appearance of the Seal beat *outside*
  the Network (e.g. on the Chart or in Feed on resolution, per Ch6) is a generalisation of a protected
  gesture → §8.13 gate.** **[NEW + DESIGN-BIBLE GATE for out-of-Network use]**

### 8.10 Company Panel / Explorer / Dossier continuity (J)

**Make the four surfaces read as one company experience at four depths — glance → inspect → investigate →
deep record — not two design families wearing one accent.** The audit's substrate makes this a
*reconciliation*, not a rebuild:

- **[REFINE]** One shared **section/stat/entity-chrome** primitive across all four (today the section header
  is defined three ways; entity chrome is `EntityChip` vs `TickerChip` vs raw buttons). Promote
  `components/intel/primitives.tsx` + `EntityChip` as the **single** grammar; retire the copy-pasted `A(n)`
  ink helper onto the tokenised `INK` ramp (§8.5b).
- **[EXISTING / KEEP]** The *depths themselves are right*: **Quick Panel = concise** (what Argus thinks now,
  Ch4/Ch6 contextual), **Explorer = investigative** (the company alive through time — chart + events +
  thesis + relationships + predictions + memory), **Dossier = the deep institutional record.** Keep the
  distinct jobs; unify the skin.
- **[REFINE — continuity *invariant*, not a fixed mechanism]** **Entity identity, investigation state, and
  context must remain continuous across Quick Panel → Explorer → Dossier, and users must be able to move
  naturally between appropriate investigation depths without reaching a dead end.** Today the ladder is
  one-directional and the **Dossier is a dead-end (exits only to `/feed`) — which must not remain.** The
  exact navigation mechanism is an **implementation decision**; where it draws on the Bible's Interrogation
  ladder beyond the Network, that is a **[DESIGN-BIBLE GATE]**.
- **[EXISTING / KEEP]** The Explorer's `MarketView` chart and the Dossier's discipline are the two strongest
  assets — unify *around* them, don't replace them.

### 8.11 Cross-client aesthetic contract (K)

**Same institution, different density and interaction** (Ch7 L-1). **One visual system serves all three
client postures; it is never re-skinned per client.** **[NEW doctrine, EXISTING Ch7 link]**

- **Canonical across clients:** the dark field, the colour *roles* and their meanings, the type/hierarchy
  system, the Form-Language identity, earned-luminance law, motion doctrine, honesty rules, the chart & entity
  grammars. A crop from any client passes the no-logo test as *Argus*.
- **Varies by posture (density & interaction only, not identity):** Mobile — selective, larger touch
  targets, fewer simultaneous objects, the dense manipulable Network replaced by a read-only/tap-first view
  (Ch7 L-8/L-9); Web — one focused context, progressive disclosure; Workstation — substantially denser,
  multi-context, the instrument at full manipulability (Ch7 L-7). Density is a **posture of one system**, not
  a different aesthetic. **Do not design Workstation or Mobile visuals here** (Ch7 defers the clients).

### 8.12 Accessibility + performance constraints (L)

**Accessibility and performance are part of premium quality, not later optimisation. [REFINE — close real gaps]**

- **Reduced motion is canonical.** Every motion path must honour `prefers-reduced-motion`. **Close the audited
  gap:** `NetworkGraph.tsx` ignores it and never idles; framer-motion components don't gate. The
  render-on-demand engine already models the right behaviour. **[REFINE]**
- **Luminosity within budget.** Glow/bloom/blur/gradients are rationed (§8.4c) partly *because* they are GPU/
  battery cost: cap `shadowBlur`, prefer cached atmosphere (as `IntelligenceNetwork` does), avoid always-on
  additive-blend rAF, cap DPR. Earned light is cheaper than ambient light. **[REFINE]**
- **Legibility floors.** Contrast minimums on the dark field (ink roles must clear WCAG on `canvas`), no
  meaning by colour alone (pair with weight/shape/label — already true of the Form Language), keyboard/AT
  access to chart and graph readouts, respect for text scaling. **[NEW as an explicit floor]**
- **Performance floors.** No page ships an always-on rAF that ignores idleness; heavy surfaces stay
  code-split (`next/dynamic`, already practised); the chart kit must degrade gracefully on low-power devices
  (Mobile posture, Ch7). **[REFINE]**

### 8.13 Existing Design Bible conflicts / amendments required (M)

Chapter 8 **does not modify** `ARGUS_INTELLIGENCE_NETWORK_V2.md`. It flags the following for that document's
**own amendment gate** (the Bible's governance: **V2.x** for extensions/adoption notes; **V3.0** for changes
to identity/philosophy/anti-patterns/Five-Second-Test). **No conflicts weaken the Bible; all items are
extensions or clarifications.** **[ALL DESIGN-BIBLE GATE]**

1. **Generalising Still Cognition → product-wide "earned luminance / lit instrument."** Chapter 8 lifts the
   Network's luminance/restraint doctrine to the whole product. **Likely a V2.x adoption note** (it extends,
   does not weaken); **but** if the Bible's owners judge product-wide philosophy a fundamental identity
   statement, it escalates to **V3.0**. *Flag; defer to the gate.*
2. **Extending the no-logo crop test (§3A.5) to all surfaces** as a product acceptance gate. **V2.x** (scope
   extension of an existing test).
3. **The Seal beat / Trace / Interrogation ladder used *outside* the Network** (Chart, Feed, Panel→Explorer→
   Dossier ladder). Reusing protected gestures beyond their home is exactly what the Bible warns against
   diluting — **requires an explicit adoption ruling**: does each gesture remain Network-exclusive, or become
   a governed product motion with the same grammar everywhere? **V2.x adoption note per gesture** (or V3.0 if
   deemed identity-level). *Flag; do not generalise until ruled.*
4. **Rail/Figure/Notch DNA informing DOM data-viz.** Borrowing the *principles* (measure-as-left-rail,
   figure-as-boldest-ink, age-as-notch) is safe; **replicating the literal Network object silhouettes
   elsewhere would dilute distinctiveness** and is discouraged. **V2.x clarification** of the DNA's scope.
5. **Building the currently-doc-only gestures to spec** (Seal beat, Interrogation ladder, Cut, Thread) is
   **implementation, not amendment** — no gate needed *inside* the Network; only their out-of-Network use
   (item 3) needs a ruling.

### 8.14 What Chapter 8 extends / amends

- **Extends (inherits):** every prior chapter — the surfaces (Ch2), the Network (Ch3), the entity depth
  ladder (Ch4), Universal Search chrome (Ch5), accountability visuals incl. the Seal beat and lifecycle
  colours (Ch6), the client postures (Ch7) — and is **subordinate to the Design Bible** for the Network.
- **Amendments flagged (later, through each doc's gate — not made here):** the **Design-Bible items in
  §8.13** (V2.x/V3.0, the Bible's own gate). **CA-1** the Product/Master Architecture — register the
  aesthetic doctrine (the lit-instrument thesis, colour roles, the surface model, earned-luminance,
  motion/chart/typography law) as the product-wide experience standard. **CA-2** the Surfaces doc — note the
  canonical theme + one card/surface primitive + the company-ladder unification. **No Knowledge-Model
  change** (aesthetics add no intelligence object). **No canon amended in this step.**

### 8.15 Decisions requiring founder input (N)

- **O-1 — One canonical dark theme (keystone).** Commit Argus to a **single canonical dark theme at the
  shell**, migrating the four hand-rolled darks and the two light outliers (Listen, Industries) onto it;
  current palette kept directionally; **light mode deferred** as a future second tokenised theme, never a
  per-page divergence (§8.4a). **[REPLACE]**
- **O-2 — The aesthetic thesis (internal).** Confirm **"the lit instrument": dark analytical field + earned
  luminance + strategist restraint**, with the three commitments (instrument-not-dashboard; light earned by
  cognition; measurement is the jewelry) as product-wide identity — an **internal experience/aesthetic
  thesis name, not external branding or marketing canon** (§8.0, §8.3). **[NEW]**
- **O-3 — Colour + luminosity doctrine.** Confirm **colour = meaning** (semantic role tokens, honesty
  colours for recorded-vs-reconstructed) and **controlled/earned luminosity** (light only at live/focus/
  certainty/resolution/newness; matte everywhere else) (§8.4). **[REFINE + NEW]**
- **O-4 — Typography + hierarchy.** Confirm `next/font` + resolve the mono role, a semantic type scale
  (promote the inspector model), and the **ambient→structural→informational→actionable→critical** hierarchy
  driven by weight/ink/light, not new colours (§8.5). **[REFINE + NEW]**
- **O-5 — Surface/depth model.** Confirm the named surface vocabulary (canvas/panel/rail/row/card/overlay/
  drawer/workspace), **one card idiom** replacing the two systems, and the anti-"AI-dashboard" rule (§8.6). **[REPLACE]**
- **O-6 — Motion doctrine.** Confirm motion-only-to-communicate, discrete terminal beats, ambient decoration
  prohibited, protected gestures preserved, reduced-motion first-class (§8.7). **[REFINE]**
- **O-7 — The Argus Intelligence Chart.** Confirm promoting `MarketView` into a **reusable tokenised chart
  primitive** with a canonical intelligence layer (events/thesis/prediction/Seal/memory band), honest
  Sample-vs-real and recorded-vs-reconstructed, connected to Ch3/4/6 as one intelligence in another
  projection (§8.8). **[REFINE → NEW]**
- **O-8 — Network experience levers + performance *invariant*.** Confirm the experience-level levers
  (composition/lighting/hierarchy/labelling/inspector/transitions) and building the Seal beat & Interrogation
  ladder to Bible spec — **all preserving the Bible**. Lock the **performance/experience invariant** (premium
  fidelity + responsive interaction while **idling when no meaningful visual work exists, respecting
  reduced-motion, within explicit CPU/GPU/battery budgets**); **the renderer — engine consolidation,
  modifying `NetworkGraph`, render-on-demand, hybrid, or another — is an implementation decision subject to
  later audit** (§8.9). **[REFINE + NEW + DESIGN-BIBLE GATE]**
- **O-9 — Company-ladder continuity (*invariant*).** Confirm unifying Panel/Explorer/Dossier onto one shared
  grammar (primitives + EntityChip + one ink ramp), keeping the three distinct jobs, and the **continuity
  invariant**: **entity identity, investigation state, and context stay continuous across Quick Panel →
  Explorer → Dossier, and users move naturally between depths without a dead end** (the Dossier `/feed`
  dead-end must not remain); **the exact navigation mechanism is an implementation decision** (§8.10). **[REFINE]**
- **O-10 — Cross-client aesthetic contract.** Confirm **one visual system, varied only by density/interaction
  posture**; no per-client re-skin; clients themselves not designed here (§8.11, Ch7). **[NEW]**
- **O-11 — Accessibility + performance as premium quality.** Confirm reduced-motion everywhere (close the
  `NetworkGraph` gap), rationed luminosity within GPU/battery budget, legibility/contrast floors, no always-on
  rAF (§8.12). **[REFINE]**
- **O-12 — Design-Bible gate items.** Confirm that §8.13 items are **flagged for the Bible's own V2.x/V3.0
  gate** and that **nothing here modifies the Bible** or generalises a protected gesture until ruled. **[DESIGN-BIBLE GATE]**
- **O-13 — Information-gravity doctrine (founder-locked).** Confirm that **visual hierarchy reflects
  intelligence significance — not content/component type or recency alone**: materially more consequential
  intelligence earns proportionally greater prominence (space, hierarchy, Figure/ink weight, depth,
  controlled luminance); ordinary intelligence recedes; **equal-card/equal-row treatment that implies all
  information matters equally is forbidden**. Universally material intelligence (major macro / central-bank /
  earnings / geopolitical / dislocation events) can command gravity anywhere; **personal relevance may alter
  prominence but never suppresses universally material intelligence**. Importance earns **clarity and
  gravity, not alarmism** — no sensational UI. **Drives prominence from the *existing* canonical
  intelligence/ranking architecture (Ch2 systemic-importance composite; Ch6 materiality), rendered — creates
  no new visual significance score or second ranking engine** (§8.5d). **[NEW]**

### 8.16 Migration implications (stated, not implemented)

**Order (foundation-first — cohesion before ornament):** **[CH8 · design-only]**
1. **Canonical dark theme at the shell** (O-1) + **one card/surface primitive** (O-5) — the two changes that
   convert "separately designed pages" into one instrument; migrate Listen & Industries first (the outliers).
2. **Type + font foundation** (O-4): `next/font`, resolve mono, semantic scale — retire inline pixel type.
3. **Colour roles + honesty colours** (O-3): migrate the ~2,600 inline colour sites to role tokens over time.
4. **Earned-luminance layer** (O-3/O-6) in the DOM (hero/selected/live), within the a11y/perf budget (O-11);
   **close the reduced-motion gaps** first.
5. **The Argus Intelligence Chart primitive** (O-7): extract from `MarketView`, add the memory band, keep
   Sample honesty; then bring a chart to the Markets page.
6. **Company-ladder continuity** (O-9) and **Network experience levers** (O-8) — meeting the Network
   **performance/experience invariant** (idle-when-quiet, reduced-motion, explicit budgets); the **renderer
   choice is a later implementation/audit decision**, coordinated with Ch3/M4.
7. **Design-Bible gate** (O-12): file §8.13 items for the Bible's V2.x/V3.0 process **before** any protected
   gesture is generalised or the Bible's doctrine is restated.

**Ordering constraint: cohesion before luminosity before charts.** Earned light on an incoherent surface set
just makes the incoherence shinier; the canonical theme, one card idiom, and the type foundation come first.
Nothing here implements code; the audited debt (no theme, no shell, inline colour, unloaded mono, two card
systems, canvas-trapped light, the reduced-motion gap) is the ordered first work.

*End of Chapter 8 — **APPROVED** (founder decisions O-1…O-13, 2026-07-31). The refinement pass clarified O-2
(internal thesis, not branding), recast **O-8** to a **performance/experience invariant** (renderer left as
an implementation decision) and **O-9** to a **continuity invariant** (navigation mechanism left as
implementation), and added **O-13 information-gravity** (prominence driven by the existing Ch2/Ch6 ranking
architecture — **no second significance engine**). Architecture/design only. **No product code changed; no
tokens, components, or styles implemented; the product was not redesigned or rewritten. The Design Bible was
not modified** (§8.13 items flagged for its own V2.x/V3.0 gate). No other canon amended (CA-1…CA-2 flagged,
not made); no commit. Chapter 9 has not been started.*

---

## Chapter 9 — Learning, Personalization & User Intelligence

*Architecture/design only. This chapter answers: **how should Argus learn what matters to each user over
time, personalise the experience around them, and adapt explanatory depth — without an echo chamber, without
hiding universally important intelligence, without manufacturing user-specific truth, and without creating
another intelligence/ranking system?** It inherits Chapter 2 (one intelligence, many projections; the
systemic-importance composite), Chapter 5 (FIND/ASK), Chapter 6 (materiality; the reasoning ladder),
Chapter 7 (one platform, account-scoped state, L-11 no contradictory truth), and Chapter 8 (O-13
information-gravity; the universal-materiality floor). It **designs a coherent User Intelligence
architecture, not code** — no recommendation algorithm, no ranking weights, no tracking, no migrations.
Grounded in a read-only repo audit (2026-07-31); every claim traces to actual consumers.*

**Proposal tags:** **[EXISTING / KEEP]** · **[REFINE]** · **[REPLACE]** · **[NEW]** · **[MIGRATION DEBT]**.
Decisions are **UI-1…UI-n** (§9.18).

> **Status: APPROVED — founder decisions UI-1…UI-13 (2026-07-31).** Locked doctrine:
> 1. **One canonical account-level User Intelligence Profile (UIP)** — the sole personalisation authority,
>    separate from market intelligence, replacing the three competing theme stores (UI-1).
> 2. **Personalisation is projection, never truth** — it may influence ranking/prominence/ordering/selection/
>    explanation-depth/alerting/composition, and **never** thesis/confidence/relationships/outcomes/history/
>    memory/facts/systemic-importance (UI-2).
> 3. **Universal floor = the existing systemic-importance/EventScore architecture, made a non-suppressible
>    gate — not a second score**; fixes the audited Feed suppression so systemically material intelligence
>    reaches any user (UI-3).
> 4. **Signal taxonomy**: explicit > implicit; situational ≠ durable; **user correction overrides inference**;
>    suppression cannot breach the universal floor (UI-4).
> 5. **Brief** — universal significance first, personalisation prioritisation-only/never-omit; **Feed**
>    optimises **decision relevance/understanding, not engagement**, with the floor + discovery/diversity +
>    decay (UI-5).
> 6. **Learn = explanatory depth over the same canonical reasoning** (the R0–R6 ladder projected at a chosen
>    depth), not a beginner destination and not different intelligence (UI-6).
> 7. **Control + data-minimisation** — full user control (edit/reset/disable/why-am-I-seeing-this/separate
>    research context) and **derived/minimal state, not a raw behavioural clickstream**; telemetry separate (UI-7).
> 8. **Explanation-depth authority is explicit/user-controlled (durable).** Argus may later **offer or
>    temporarily surface** more explanation from contextual signals, but must **never silently assign or
>    persist an inferred knowledge level**; **any future inference requires a separate design/validation gate** (UI-8).
> 9. **Account-level, cross-client UIP** — client-aware, **not** client-forked; retires the identity-leaking
>    device stores (UI-9).
> 10. **Measurement** = decision relevance (saves, follows, useful investigation, corrections-as-signal),
>     **never** clicks/session-duration/opens; no vanity score (UI-10).
> 11. **FIND stays deterministic**; later **ASK** keeps canonical evidence/reasoning/provenance —
>     personalisation never manufactures an unsupported answer (UI-11).
> 12. **Consolidation + schema debt** — fold the theme authorities into the UIP, retire the device orphans,
>     baseline the drifted account schema safely (Ch7 L-6); **not authorised now** (UI-12).
> 13. **Semantics only — no ranking weights, no recommendation algorithm, no behavioural tracking** at this
>     stage (UI-13).
>
> Canon amendments **queued, not made:** **DA-1** Product/Master Architecture (register the User Intelligence
> layer), **DA-2** Surfaces doc (UIP consolidation + Feed-floor fix), **DA-3** Knowledge Model (UIP is an
> experience/account object — add only if the model chooses; no new intelligence object). Implementation and
> migration deferred; no code, tracking, weights, or migration produced.

### 9.0 The central question and the answer

**How should Argus learn what matters to each user without ever learning a different market truth for them?
— With a single canonical *User Intelligence Profile* (UIP) that personalises the *projection* of the one
canonical Argus intelligence, gated by a non-suppressible universal-materiality floor.** Three sentences
fix the whole chapter:

1. **The UIP learns *what deserves this user's attention* and *how they prefer it explained* — never *what
   is true*.** It is an account-level model of how to *serve* the user, completely separate from canonical
   market intelligence (the truth boundary, §9.5). **[NEW — one authority replacing today's three]**
2. **Personalisation is a projection force, not a truth force.** It may reorder, select, emphasise, and set
   explanatory depth; it may **never** alter thesis, confidence, relationships, outcomes, history, memory,
   facts, or systemic importance (already true in code — the audit found personalisation only ever changes
   position/visibility). **[EXISTING / KEEP — lock the invariant]**
3. **A universal-materiality floor sits above personal relevance and cannot be suppressed by it.** It is the
   **existing** systemic-importance/EventScore architecture (Ch2/Ch6/Ch8 O-13) — **not a second score** —
   positioned so that a major macro/central-bank/geopolitical/liquidity event breaks through to *any* user
   regardless of what they follow. **[REFINE — route personalisation *through* the existing floor]**

Argus should learn *what deserves attention*, never *what the user wants to hear.* That distinction is the
chapter. The goal is the increasing relevance of a consumer product (TikTok/Instagram *become* more relevant
through use) applied to an institutional intelligence product with far stricter truth, transparency, control,
privacy, and systemic-importance requirements — **personalisation makes Argus more useful, never
narrower-minded.**

**The keystone audit finding this chapter must fix.** Today two importance systems live on opposite sides of
the wire: the backend **`EventScore`** (`app/events.py`) is a genuine *universal, user-independent* floor
(`ADMISSION_FLOOR`; macro/policy relevance floored so *"a genuine off-thesis shock must still surface"*) — but
it gates the `events[]` surface. The **personalised homepage** ranks `data.clusters` through the frontend
**`feedRanker.ts`**, which is preference-first/theme-gated and has **no universal floor**: once a user sets
any preference, `NO_OVERLAP_PENALTY = −200` plus a drop-don't-backfill quality gate can rank a systemically
material off-thesis story *negative* and **remove it from that user's feed entirely** (the universal-
consequence signals that could rescue it sum to ~158, below the penalty). **The echo-chamber failure mode is
live in code today** on the personalised Feed. Chapter 9's first job is not to *build* a floor — it is to
**route the personalised stream through the floor that already exists** (§9.6).

### 9.1 Current personalization/user-state audit (A)

Traced to actual consumers across three read-only sub-audits.

**Explicit preferences — the only personalisation that ships. [IMPLEMENTED · SERVER/PERSISTENT]**
- **Onboarding** (`OnboardingFlow.tsx`, a homepage modal — *not* a `/onboarding` route) collects **sectors,
  asset classes, role, region** (+ name); it does **not** ask about themes, explanation depth, or
  notifications. It upserts `user_preferences` + sets `profiles.onboarding_completed`. Persistence failure is
  **silently swallowed** (`try/catch {}` "// Non-fatal").
- **`user_preferences`** (Supabase, RLS `auth.uid()=user_id`) — columns `followed_themes, followed_sectors,
  followed_asset_classes, user_role, region_focus`, upserted on `user_id`; read via `useUserPreferences` →
  `preferenceState.ts` (`PREF_COLUMNS`). This is the **real consumed authority** — `feedRanker.ts` ranks on
  it. `followed_themes` is editable **only** in Settings.
- **Settings** exposes exactly the five intelligence fields + profile/email/password. **No explanation-depth,
  notification/alert, or experience-level setting exists anywhere in the codebase** (grep-confirmed). `role`
  is the only experience proxy and feeds only a small ranking nudge, not verbosity.

**Feed / Brief / surfaces. [IMPLEMENTED, CLIENT-SIDE compute; prefs SERVER/PERSISTENT]**
- **Feed** — `feedRanker.ts` is *preference-first, theme-gated*; ranks server-loaded `UserPrefs`, **no
  behavioural signal**. **No universal floor** (the keystone gap, §9.0). Gate is **skipped when prefs are
  empty** → an unpersonalised user sees the full stream (the correct cold-start default).
- **Morning Brief** — personalisation is a single input (`followedThemeNames`) applied as a **bounded, always-
  badged +8 ordering nudge** in `theRead` research priorities; every section is ordered by *universal* fields;
  it **never omits**. Doctrine already in comments: *"prioritization only, never truth."* **[EXISTING / KEEP]**
- **Markets** personalises only a watchlist widget (universal ranking otherwise); **Industries and Company
  pages have zero personalisation.** **[UNIVERSAL]**
- **`EventScore`** (`app/events.py`) — the **existing universal, user-independent systemic-importance floor**
  (class weights macro>policy>earnings>…; `ADMISSION_FLOOR`; off-thesis macro/policy relevance floored). **This
  is the floor to reuse — not to rebuild.** **[EXISTING / KEEP]**
- **Personalisation never changes content/thesis/confidence — only position/visibility.** Confirmed across
  every touchpoint. **[EXISTING / KEEP — the truth boundary already holds in code]**

**Learned / implicit personalisation — ~0% exists (clean greenfield). [NONE FOUND / NEW]**
- **No behavioural capture at all:** entity clicks are ephemeral (`intelligenceContext.tsx` `active` is a bare
  module variable, discarded on reload); no dwell, no search history, no dismissals, no view history. **No
  analytics SDK installed**; no telemetry; no backend user-event ingestion.
- **No recent/history / "continue investigating"**; **no recommender / collaborative filtering** (all
  "relevance" is explicit-preference filtering); **no Learn / explanation-depth / experience-level / glossary
  / "explain this"** (only a **static** `why_it_matters` string, identical for every user); **no notifications
  / alerts**; **no "show less like this"**; **no relevance feedback / measurement.**
- Nearest primitives to build on: (a) the ephemeral `intelligenceContext` active-lens (*a click is already
  captured in memory — just discarded*), and (b) the static `why_it_matters` field (could become depth-aware).

### 9.2 Existing authorities, duplication, and migration debt (B)

**There is no single personalisation authority today. [MIGRATION DEBT · DUPLICATED]** Five preference stores
across two tiers, with **three competing "theme" authorities**:

| Store | Tier | Drives | Problem |
|---|---|---|---|
| `user_preferences.followed_themes` | Supabase (account) | **feed ranking** (the real authority) | label-strings; editable only in Settings |
| `argus:followed-themes` | localStorage (device) | UI toggles, Saved page | **identity-blind → leaks across accounts on a shared device**; ranking never reads it |
| `argus:theme-watchlist` | localStorage (device) | UI toggles, Saved page | same; a *third* "themes I care about" store |
| `watchlist` table (+ `argus_watchlist` anon) | Supabase (+ localStorage) | watchlist widgets | the **one** pair that reconciles (merges on login) |

Following a theme on `/markets` writes a **dead-end localStorage** store the ranker never reads. Precedent
exists for the fix: the former device alert store (`useThemeAlerts`) was **already consolidated** onto the
canonical ledger — **the theme-preference fork is the remaining un-consolidated one.** **[MIGRATION DEBT → consolidate]**

**Schema-versioning (continues Chapter 7 L-6). [MIGRATION DEBT]** Refining the Ch7 finding: `profiles`,
`user_preferences`, `saved_items`, `watchlist` **do** have source-controlled DDL (`frontend/supabase/
schema.sql` + migrations `002`/`003`). The debt is **process, not absence**: application is a manual "paste
into the Supabase SQL editor" runbook, there is **no migration runner or ordering guarantee**, DDL is split
across two roots, and **`schema.sql` has already drifted** (dead columns `default_categories/default_sources/
ai_enabled`; missing `followed_themes`). L-6's "baseline live tables safely, source-controlled" applies.

### 9.3 The User Intelligence model + authority (C)

**Argus should have one canonical, account-level User Intelligence Profile (UIP): the single authority for
*how to serve* a user, held entirely separate from canonical market intelligence. [NEW]** It replaces the
three competing theme stores with one. The UIP holds four kinds of thing (never any market truth):

1. **Explicit preferences** — what the user directly tells Argus: companies, sectors/industries, themes,
   asset classes, macro/geopolitical/research interests, Brief preferences, alert preferences, explanation
   depth, experience/knowledge preferences. Today only sectors/assets/role/region/themes exist; the rest are
   **[NEW]** (esp. explanation depth, alerts, companies/macro/geo interests).
2. **Implicit interests** — inferred from behaviour *only where a reliable signal exists*: repeated company
   investigation, themes explored, industries opened, saved/watchlisted intelligence, repeated searches,
   Explorer/Dossier depth, recurring relationship investigation, dismissals, alert engagement, later ASK
   queries, eventual Workstation contexts. **All [NEW / greenfield]**, always overridable by explicit.
3. **Situational / contextual interest** — what matters *temporarily* because of the current investigation.
   *A user researching NVDA → AI infra → power demand → utilities must not permanently become a utilities
   user from one session.* Situational interest **expires and does not silently become durable interest.** **[NEW]**
4. **Suppression / negative preferences** — explicit "show less like this," **bounded by the universal floor**
   (§9.6): a user may downrank a category but **never** below the floor for systemically material events. **[NEW]**

**The authority model (evaluating the founder's proposed flow — it is correct, with one strengthening):** the
personalisation flow is *canonical Argus intelligence + canonical UIP + current context + universal/systemic
floor → personalised projection/ranking → Brief / Feed / alerts / discovery / explanation depth.* The one
strengthening: **the universal floor is a non-suppressible gate, not merely an input** — personal relevance
composes *above* it, never *through* it. **The personalisation layer decides what deserves this user's
attention and how it is explained — never what is true. No second intelligence or ranking engine is
created** (it consumes the existing systemic-importance/EventScore and reasoning outputs). **[NEW authority · EXISTING engines]**

### 9.4 Explicit vs implicit vs contextual signal taxonomy (D)

Each signal class has a **different persistence and authority** — semantics before any algorithm (§9.12):

| Class | Source | Persistence | Authority | Tag |
|---|---|---|---|---|
| **Explicit** | user declares it | durable; user-owned | **highest** — corrections override inference | **[EXISTING sectors/assets/role/region/themes + NEW fields]** |
| **Implicit** | inferred from behaviour | decays over time | below explicit; always overridable | **[NEW / greenfield]** |
| **Situational** | current investigation context | **ephemeral / expires** | shapes *this session* only; does **not** become durable interest | **[NEW]** |
| **Suppression** | explicit "less like this" | durable but revocable | downranks — **capped by the universal floor** | **[NEW]** |

Rules that hold regardless of weights: **explicit > implicit; situational ≠ durable; user corrections always
override inference; suppression never breaches the floor.** **[NEW doctrine]**

### 9.5 The personalization truth boundary (E)

**Non-negotiable, and already respected in code — now locked. [EXISTING / KEEP + lock]** Reconciles directly
with Ch7 L-11 (no contradictory canonical truth) and Ch8 O-13.

- **Personalisation MAY influence:** ranking, prominence, ordering, selection among otherwise-eligible
  intelligence, explanation depth, alerting, recommended investigation paths, Brief composition, Feed
  composition, surfaced companies/themes, saved/followed context, notification timing.
- **Personalisation MUST NOT change:** canonical thesis, canonical confidence, causal relationships,
  prediction outcomes, recorded history, institutional memory, event facts, **or systemic importance itself.**
- **The contract:** *same canonical intelligence → personalised relevance/projection*; **prohibited:**
  *different user → different underlying Argus thesis.* The audit confirms today's code already only changes
  position/visibility (never content) — Chapter 9 makes that an **invariant every future personalisation
  feature inherits**, not an accident of the current implementation.

### 9.6 The universal-intelligence floor (F)

**Argus becomes highly personalised without becoming an information bubble — by routing personalisation
through the systemic-importance floor that already exists, never a second score. [REFINE — the keystone fix]**

- **Reuse, don't rebuild.** The floor is the **existing** `EventScore`/systemic-importance architecture
  (Ch2 composite; Ch6 materiality; Ch8 O-13) — which *already* floors off-thesis macro/policy so *"a genuine
  off-thesis shock must still surface."* Chapter 9 **creates no second systemic-importance score** (explicit
  founder constraint; also Ch8 O-13). **[EXISTING / KEEP the score · REFINE its reach]**
- **The fix.** The personalised Feed (and any personalised surface) must **consume the universal floor as a
  non-suppressible admission gate**: an item the canonical architecture deems systemically material is
  **never** droppable by preference penalty. This repairs the audited `feedRanker` gap where `−200` + the
  quality gate can delete a systemic off-thesis story. Universally material intelligence (FOMC/CPI/jobs
  surprises, central-bank decisions, major earnings shocks, severe geopolitical escalation, banking stress,
  liquidity events, oil shocks, major credit events, broad dislocations — *as the canonical architecture
  determines*) **breaks through to any user.** **[REFINE]**
- **The composition (conceptual, no weights).** *Systemic importance (universal floor — canonical,
  non-suppressible) → then personal relevance (UIP) reorders/selects/emphasises **above** the floor → with
  freshness/change and the existing canonical priority.* Personal relevance is a **prominence force above the
  floor, never a suppression force through it** — the exact reconciliation Ch8 O-13 demands (*"personal
  relevance may alter prominence but never suppress universally material intelligence"*). **No competing
  ranking authority is introduced.** **[REFINE + EXISTING]**

### 9.7 Morning Brief personalization contract (G)

Reconciles with the approved **time-aware** Brief (Ch2). The Brief is the most important personalisation
surface — and today already has the **right posture** (reorder/badge, never omit). Chapter 9 keeps that and
extends it under the floor.

- **[EXISTING / KEEP]** The time-aware structure stands: **Morning** — what changed overnight, major moves,
  today's events/earnings, scheduled macro (CPI/FOMC/jobs), major developments, what to watch, opportunities/
  risks. **Later in the day** — what happened, what releases/results meant, big movers, changes in Argus's
  understanding, upcoming after-hours/next-session events, relevant opportunities/risks.
- **[EXISTING / KEEP]** Personalisation stays **prioritisation-only, always badged** (today's +8 nudge model,
  *"prioritization only, never truth"*). The Brief must **never omit something the user genuinely needs to
  know merely because they haven't historically clicked that subject** — the universal floor (§9.6) governs
  Brief composition too.
- **[REFINE]** The composition is **universal market significance first, personalised relevance around it**:
  systemic material items lead regardless of follows; personal relevance orders and emphasises the rest and
  surfaces the user's followed entities/themes higher **within** what's already eligible. Learned interests
  (§9.3) may join explicit follows as ordering inputs — under the same badged, never-omit, floor-gated rule.

### 9.8 Feed personalization contract (H)

**Evolve the Feed from a broadly-filtered stream into a *learned* personalised intelligence stream that
optimises for decision relevance and understanding — never engagement. [REFINE]** Explicitly **not** a
social-media engagement algorithm.

- **Universal Feed floor [REFINE — the fix]:** the systemic-importance floor (§9.6) is a non-suppressible
  admission gate on the personalised stream; preferences reorder above it but cannot delete material items.
  Repairs the audited `−200`/quality-gate suppression.
- **Personalised ranking [REFINE]:** explicit + implicit + situational relevance orders the *eligible*
  stream; **content/thesis/confidence never change** (§9.5).
- **Exploration / discovery / diversity [NEW]:** deliberate cross-domain diversity and discovery so the Feed
  widens understanding, not narrows it — a structural guard against the bubble (complements the floor).
- **Repetition control [EXISTING / KEEP]:** the universal `capEventDominance` (max-per-event) already exists;
  keep and generalise.
- **Stale-interest decay + new-interest learning [NEW]:** recent behaviour strengthens relevance; old
  implicit interest decays; explicit follows do not silently decay (§9.12).
- **Temporary session context [NEW]:** situational interest shapes the current session without becoming
  durable (§9.3/§9.4).
- **User corrections + "why am I seeing this" + direct tuning [NEW]:** every ranked item can explain why it
  surfaced; users can correct/tune (§9.10); corrections override inference.
- **Runaway-loop guard [NEW]:** clicking one topic must **not** progressively eliminate everything else —
  enforced by the floor + diversity + decay + explicit>implicit + situational≠durable, and by optimising for
  decision relevance, not time-on-site (§9.14).

### 9.9 Learn / adaptive-explanation architecture (I)

**Learn is a *capability/layer* — adaptive explanatory *depth* over the same canonical intelligence — not a
standalone beginner destination. [NEW · built on EXISTING reasoning]** Same intelligence, same conclusion,
different depth (the founder's CPI example: the terminal line vs the optional "why this matters" expansion).

- **Built on what exists, not a new engine. [REFINE + EXISTING]** The **Reasoning Engine's layered
  explanation ladder (R0–R6, Ch M7)** already *is* depth: the explanation depth a user sees is **which rungs
  of the existing ladder are surfaced**, not new content. The static `why_it_matters` field is the nearest
  shipped primitive to fold into this layered `explain()` output. **No second explanation engine; no
  different intelligence for beginners.**
- **Mechanisms [NEW]:** a **depth preference** (a continuous "more/less explanation" preference is likely
  better than rigid beginner/intermediate/expert *modes*, which risk implying different intelligence);
  contextual **"explain this"** actions; on-demand **definitions / causal-chain expansion / concept
  explanations.** Depth is **explicit/user-controlled — the durable authority (founder-locked, UI-8).** Argus
  may later use contextual signals to **offer or temporarily surface** more explanation, but must **never
  silently assign or persist a knowledge level from inferred behaviour**; any future inference of depth
  requires a **separate design/validation gate.**
- **Across surfaces [NEW]:** Brief, Feed, charts, Company Panel, Explorer, Dossier, Markets, macro events,
  the Intelligence Network, and later ASK — the *same* layered explanation, projected at the chosen depth.
- **Guardrails:** never condescending language; **never auto-oversimplify sophisticated users**; **never
  different market intelligence for inexperienced users** (depth ≠ substance). Connects to Ch8 (explanation-
  depth is an experience projection, not new colour/content).

### 9.10 User control + transparency model (J)

**A personalised institutional product must not feel mysteriously manipulative. [NEW]** Controls users need:

- View/edit **explicit preferences**; follow/unfollow companies/themes. **[EXISTING partial → REFINE/unify]**
- **"Reduce recommendations like this"** (suppression, floor-bounded); **reset learned personalisation**;
  **temporarily disable personalisation** (see the universal view); **inspect "why was this surfaced."** **[NEW]**
- **Separate temporary research context from durable interest** — an explicit control so a research session
  doesn't permanently reshape the profile (§9.3 situational). **[NEW]**
- **Clear behavioural history** (if retained) and **explanation-depth controls.** **[NEW]**
- **Boundary:** enough transparency to trust and correct Argus, **without exposing internal ranking machinery
  unnecessarily** — "why am I seeing this" gives honest reasons (you follow X; systemically material; you
  investigated related Y), not raw weights.

### 9.11 Privacy / data-minimization model (K)

**Architecture, not legal policy. Collect only what personalisation genuinely needs; never data merely
because it's available. [NEW]** Argus starts from **zero behavioural collection today** (a clean, privacy-
favourable baseline to protect).

- **Distinguish and treat differently:** *ephemeral session state* (never persisted) · *short-lived
  behavioural signals* (decaying, minimal) · *durable learned interests* (**store derived interest, not a raw
  clickstream**) · *explicit preferences* · *saved/watchlist state* · *analytics/telemetry* (kept **separate**
  and **never** a personalisation input) · *sensitive/unnecessary behaviour that must not become a signal.*
- **Data-minimisation as architecture:** prefer persisting **aggregated/derived interest weights** over raw
  event logs; define **retention, decay, deletion, and reset** semantics up front (§9.10 reset/clear). No
  tracking is implemented here.

### 9.12 Cold-start + learning/decay model (L)

**Cold start [REFINE — keep the good default].** For a **new authenticated user**: onboarding preferences
provide an **initial relevance prior**, but the product must be **fully useful even if the user skips optional
configuration** — the universal floor guarantees high-quality universal intelligence with zero personalisation.
Today's `feedRanker` already does the right thing (gate skipped when prefs empty → full stream); **keep it.**
For an **anonymous/unauthenticated user** (if supported later): the universal experience, no personalisation
required. **Personalisation is never a prerequisite for high-quality universal Argus intelligence.** **[EXISTING / KEEP + REFINE]**

**Learning & decay — semantics before algorithms; no numeric weights chosen here. [NEW]** Distinguish:
*durable interest* (explicit follow / sustained repeated behaviour) · *recent interest* (recent behaviour,
strengthens then decays) · *temporary research session* (situational, expires) · *dormant interest* (old,
decays but is not deleted) · *explicit follow* (user-owned, **does not silently decay**) · *inferred interest*
(decays, always overridable). Rules: **recent repeated behaviour strengthens; old implicit decays; explicit
preferences/follows do not silently decay like inferred ones; user corrections override inference.** Onboarding
is a **prior, not a prison** — it must be able to decay/shift, never permanently label the user. **[NEW — semantics only]**

### 9.13 Cross-client synchronization contract (M)

Reconciles with Chapter 7. **The UIP follows the *account*, not the browser. [REFINE — fixes the device-orphan leak]**

- **Syncs by account:** explicit preferences, learned interests, watchlists, saved intelligence, explanation
  depth, notification preferences, recent research (where appropriate), workspaces/context (where appropriate).
  This **directly retires** today's identity-blind device stores (`argus:followed-themes`, `argus:theme-
  watchlist`) that leak across accounts on a shared device (§9.2). **[REFINE + MIGRATION DEBT]**
- **Client-aware, not client-forked:** behaviour carries client context — ten minutes monitoring in
  Workstation ≠ opening a Mobile alert. **One user model interprets client-tagged signals; it never becomes
  three personalisation systems** (Ch7 L-1 anti-fork applied to the UIP). **[NEW]**

### 9.14 Personalization measurement doctrine (N)

**Measure whether personalisation improves the *product*, not engagement. [NEW]** Explicitly **do not** optimise
for clicks, session duration, addictive engagement, or Feed opens. Better outcomes: relevance feedback, saves,
follows, useful investigation depth, dismissals-as-signal, whether surfaced intelligence led to **meaningful
investigation**, whether users **repeatedly correct** Argus (a negative signal about the model), Brief
usefulness, alert usefulness. **No vanity personalisation score.** Argus optimises **decision relevance and
understanding** — the north star that structurally rules out the engagement-maximising failure mode.

### 9.15 FIND / later-ASK boundary (O)

Reconciles with Chapter 5 and Ch7 L-3 (platform-owned resolution). **[REFINE — boundary only, ASK not designed]**

- **FIND stays deterministic.** Personalisation may influence ranking **among ambiguous/equally-relevant
  results** where appropriate, but must **never make canonical identity resolution nondeterministic or
  incorrect** — the same query resolves to the same canonical UID for everyone.
- **Later ASK** may use the UIP to understand relevance/context, but **evidence remains canonical, reasoning
  remains canonical, provenance stays visible, and personalisation can never manufacture an answer the
  intelligence architecture does not support.** The boundary is fixed now; ASK is not designed here.

### 9.16 Failure modes / safeguards (P)

Each audited failure mode maps to a structural safeguard already established above:

| Failure mode | Safeguard |
|---|---|
| Financial echo chamber | universal-materiality floor (§9.6) + discovery/diversity (§9.8) |
| Engagement-maximising ranking | measurement doctrine — decision-relevance, not time-on-site (§9.14) |
| Overfitting to recent clicks | decay + explicit>implicit + situational≠durable (§9.4/§9.12) |
| Permanent onboarding labels | prior-not-prison; decay; corrections override (§9.12) |
| Hiding systemic events | the floor is a **non-suppressible gate**, not an input (§9.6) |
| Every click = durable preference | signal taxonomy; situational context expires (§9.3/§9.4) |
| Personalisation changing truth | the truth boundary (§9.5) — position/visibility only |
| Three client personalisation systems | one account-level UIP, client-aware not client-forked (§9.13) |
| Opaque inference, no correction | "why am I seeing this" + corrections + reset (§9.10) |
| Collecting unnecessary data | data-minimisation; derived-not-raw; separate telemetry (§9.11) |
| Fake precision in weights | semantics before algorithms; no weights chosen (§9.12/UI-*) |
| Beginner/expert contradictory intelligence | Learn = depth of the *same* canonical explanation (§9.9) |
| Separate recommender as second authority | one UIP consuming existing engines; **no second engine** (§9.3) |

### 9.17 What Chapter 9 extends / amends

- **Extends (inherits):** Ch2 (projection model; systemic-importance composite), Ch5 (FIND/ASK), Ch6
  (materiality; the reasoning ladder that Learn projects), Ch7 (account-scoped state, L-1 anti-fork, L-6
  schema, L-11 no contradictory truth), Ch8 (O-13 information-gravity, the universal-materiality floor).
- **Amendments flagged (later, through each doc's gate — not made here):** **DA-1** the Product/Master
  Architecture — register the **User Intelligence layer** (the UIP as sole personalisation authority; the
  truth boundary; the floor-through-existing-score; the projection flow). **DA-2** the Surfaces doc — note the
  UIP consolidation (retire the device theme orphans) and the personalised-Feed floor fix. **DA-3** the
  Knowledge Model — the UIP is an **experience/account object, not a market-intelligence object**; add it only
  if the model chooses to represent it; **no new intelligence object.** **No canon amended in this step.**

### 9.18 Decisions requiring founder input (R)

- **UI-1 — One canonical User Intelligence Profile.** Confirm a single account-level UIP as the **sole
  personalisation authority**, separate from market intelligence, replacing the three competing theme stores
  (§9.3, §9.2). **[NEW]**
- **UI-2 — The truth boundary (lock).** Confirm personalisation may influence ranking/prominence/ordering/
  selection/explanation-depth/alerting/composition, and **never** thesis/confidence/relationships/outcomes/
  history/memory/facts/systemic-importance (§9.5). **[EXISTING / KEEP + lock]**
- **UI-3 — Universal floor via the existing score (keystone).** Confirm the universal-materiality floor is the
  **existing** systemic-importance/EventScore (no second score), made a **non-suppressible admission gate** on
  personalised surfaces, fixing the audited Feed-suppression gap (§9.6, §9.0). **[REFINE]**
- **UI-4 — Signal taxonomy.** Confirm the four signal classes and their authority rules (explicit > implicit;
  situational ≠ durable; corrections override; suppression floor-bounded) (§9.4). **[NEW]**
- **UI-5 — Brief & Feed contracts.** Confirm Brief personalisation stays prioritisation-only/never-omit under
  the floor, and the Feed evolves to learned personalisation optimising decision relevance (not engagement),
  with a non-suppressible floor + discovery/diversity + decay (§9.7, §9.8). **[REFINE + NEW]**
- **UI-6 — Learn as a depth layer on the reasoning ladder.** Confirm adaptive explanation is **depth over the
  same canonical intelligence** (the R0–R6 ladder projected at a chosen depth; `why_it_matters` folded in),
  **not** a beginner destination and **not** different intelligence (§9.9). **[NEW · EXISTING engine]**
- **UI-7 — Control, transparency & privacy.** Confirm the control set (view/edit, follow/unfollow, reduce-
  like-this, reset, temporarily-disable, why-am-I-seeing-this, separate research context, clear history,
  depth controls) and **data-minimisation** (derived-not-raw, telemetry separate, retention/decay/reset)
  (§9.10, §9.11). **[NEW]**
- **UI-8 — Explanation-depth authority (founder-locked).** **Explicit/user-controlled explanation depth is
  the durable authority.** Argus may later use contextual signals to **offer or temporarily surface**
  additional explanation, but must **not silently assign or persist a user's knowledge level from inferred
  behaviour.** **Any future inference of explanation depth requires a separate design/validation gate** (§9.9). **[NEW]**
- **UI-9 — Cross-client UIP.** Confirm the UIP syncs by account (retiring device orphans) and is **client-
  aware, not client-forked** — one user model, client-tagged signals (§9.13, Ch7 L-1). **[REFINE]**
- **UI-10 — Measurement doctrine.** Confirm success is decision-relevance/understanding (saves, follows,
  useful investigation, corrections-as-signal, Brief/alert usefulness) — **never** clicks/session-duration/
  opens; no vanity score (§9.14). **[NEW]**
- **UI-11 — FIND/ASK boundary.** Confirm FIND stays deterministic (personalisation only among
  equally-relevant results, never altering resolution) and the later-ASK boundary (canonical evidence/
  reasoning/provenance; personalisation never manufactures an unsupported answer) (§9.15). **[REFINE]**
- **UI-12 — Consolidation & schema debt.** Confirm the migration intent: consolidate the theme authorities
  into the UIP, retire the identity-leaking device stores, and baseline/clean the drifted account schema
  **safely** (Ch7 L-6) — **not authorised now** (§9.2, §9.19). **[MIGRATION DEBT]**
- **UI-13 — No weights, no tracking now.** Confirm Chapter 9 defines **semantics only** — no ranking weights,
  no recommendation algorithm, no behavioural tracking is designed or implemented here (§9.12). **[design-only]**

### 9.19 Migration implications (stated, not implemented)

**Order (truth-safety first, then consolidation, then learning):** **[CH9 · design-only]**
1. **Close the echo-chamber gap first (UI-3):** route the personalised Feed through the **existing** systemic-
   importance floor as a non-suppressible gate — the one change that fixes a *live* suppression risk. No new
   score.
2. **Lock the truth boundary (UI-2)** as an invariant every personalisation feature inherits (already true in
   code — make it non-optional).
3. **Consolidate to one UIP (UI-1, UI-12):** fold the three theme authorities into the account-level profile;
   **retire the identity-blind device stores** (`argus:followed-themes`, `argus:theme-watchlist`); reconcile
   with L-6 schema hygiene (baseline live tables safely, clean the `schema.sql` drift, add a migration runner).
4. **Only then, learning (UI-4…UI-10):** privacy-minimal implicit signal capture (derived-not-raw), decay
   semantics, the Learn depth layer on the reasoning ladder, transparency/control surfaces, and the
   measurement doctrine.
5. **Cross-client (UI-9)** and **FIND/ASK boundary (UI-11)** ride on the platform work from Ch7.

**Ordering constraint: safety before intelligence-about-the-user.** The floor fix and the truth-boundary lock
come **before** any behavioural learning — because learning on a stream that can already suppress systemic
events would deepen the exact failure this chapter exists to prevent. Nothing here implements code, adds
tracking, chooses weights, or writes migrations; the audited debt (three theme authorities, the device-orphan
identity leak, the missing Feed floor, the schema drift) is the ordered first work.

*End of Chapter 9 — **APPROVED** (founder decisions UI-1…UI-13, 2026-07-31). The refinement pass locked
**UI-8**: explicit/user-controlled explanation depth is the durable authority; Argus may later offer/
temporarily surface additional explanation from contextual signals but must never silently assign or persist
an inferred knowledge level — any future depth inference requires a separate design/validation gate.
Architecture/design only. **No product code changed; no recommendation algorithm, ranking weights, or
behavioural tracking designed or implemented; no database migration created; no Supabase change; no commit.**
No canon amended (DA-1…DA-3 **queued**, not made). Chapter 10 has not been started.*

---

## Chapter 10 — Architecture Closure & Build Sequence

*The architecture-to-execution bridge — the final major architecture chapter before Argus V2 implementation
begins. It answers: **given the Argus that exists today and the V2 architecture approved in Chapters 1–9,
what must be preserved, repaired, consolidated, migrated, replaced, built, validated, or deliberately
deferred — and in what dependency order — to reach the approved product safely while the live product keeps
improving?** It transforms the approved destination into a **dependency-ordered executable program.** It
invents no new product concept, implements no code, modifies no schema/migration, enables no gated feature,
and amends no canon. Grounded in a fresh read-only repo audit (2026-07-31) reconciled against Chapters 1–9;
every claim traces to an actual consumer.*

**Classification tags (per capability):** **[KEEP]** aligned · **[HARDEN]** correct, needs reliability/
security/perf/validation · **[CONVERGE]** multiple implementations → one authority · **[REFACTOR]** useful
but wrong boundary · **[REPLACE]** conflicts with approved architecture · **[BUILD]** substantially absent ·
**[MIGRATE]** controlled persistence/schema move · **[VERIFY]** source looks right, production unproven ·
**[DEFER]** approved future, not in the first program · **[RETIRE]** obsolete, remove eventually.

### 10.0 Central question and the closure verdict

**Is Argus V2 architecturally ready to move from design into implementation? — Yes, once two now-owned
prerequisites are honoured:** (a) the universal-materiality **membership contract is founder-locked (RD-5,
§10.18a)** and built/calibrated by **Wave 0** before Wave 1; and (b) **event-consumer UID convergence is an
owned work package (Wave 2c + EA-1)**, not an assumed "done." With those, Chapters 1–9 are approved,
internally consistent, and free of blocking contradictions (§10.18); the **backend is a strong, largely
V2-aligned foundation** — but **not yet a fully converged single authority**: it carries real **transitional
consumer debt** (legacy `MarketEvent.id`/cluster refs) and the live graph authority is **`narrative_graph.py`**
(with `graph_adapter.py` a durable projection). The divergence is **concentrated in the frontend and in
operational/data readiness, not in the approved architecture.** What remains is an **execution program**, not
more design — "architecturally ready" ≠ "everything is built."

**The decisive closure finding.** The fresh audit overturns the intuition that V2 is a ground-up rebuild:

- **The backend is a clean, largely V2-aligned foundation. [KEEP + HARDEN/MIGRATE consumers]** One pipeline
  orchestrator (`app/background.py`), **one canonical event architecture** (`app/events.py` `MarketEvent` +
  `app/event_identity.py` — a durable ULID identity **journal = truth, registry = cache**), an **immutable M3
  ledger** with honest calibration gates, and a **cleanly separated LLM boundary** — the LLM is *never*
  authoritative for identity, facts, scoring, outcomes, or persistence (every truth-writing module disclaims
  LLM use; the two per-request LLM endpoints are self-labelled **legacy paths for retirement**). **Two
  precisions the correction pass adds:** (i) the durable UID authority exists but **consumer migration is
  incomplete** — `MarketEvent.id` is still the **cycle-local/legacy** cluster key while `uid` is durable, and
  several consumers retain legacy cluster/event references or dual-key transitional behaviour (§10.1, §10.3);
  and (ii) the **live graph authority is `narrative_graph.py` / `build_narrative_graph(feed)`** — the
  per-cycle graph builder — while `institutional_memory/graph_adapter.py` is a **durable projection** of that
  cycle graph into institutional-memory history, **not** the upstream live graph.
- **The divergence lives in the frontend.** Client graph *elaboration* treated as authority, a client
  `predictionEngine.ts` with **manufactured probability** (self-labelled legacy), the Morning Brief
  *composed* client-side from backend ingredients, **three competing theme stores**, **no canonical resolver
  or Universal Search**, and a single-context scalar. Much of "foundation" is therefore **making the frontend
  *consume* the clean backend authorities rather than recompute** — convergence, not invention.
- **The gated features appear suppressed by *source default* — but their *production* state is unproven. [VERIFY]**
  The **source** shows the M3 ledger defaulting off (`prediction_ledger_enabled=False`; institutional memory
  derived from Supabase-cred presence) and calibration/analog gates (**≥30 resolved/type, ≤20% untested; ≥60
  sealed days, ≥2 regimes, ≥10 tested outcomes**) that a young archive would not meet. **But the repository
  proves only configuration/default behaviour, not deployment state:** the deployed ledger enablement, the
  deployed Supabase archive depth, and durability are **unknown until the running environment is inspected**
  (the checked-in ~1-day ledger does **not** prove deployed history depth). Treat these as **Wave 2 VERIFY
  items**, not facts; accountability UI remains calibration/time-gated regardless.
- **The one live *personalisation* correctness defect** is Chapter 9's universal-floor gap: the frontend
  `feedRanker.ts` can suppress off-preference intelligence via a large ranking penalty + the quality gate, and
  the Feed page **does not even provide the admitted `events[]` to cluster ranking.** **The universal floor does
  NOT already exist:** `EventScore` is a *scoring/evidence foundation*, **not** the universal-materiality
  *membership* contract (admission ≠ membership). The fix is real and first, **but it is gated by Wave 0**,
  which **builds and calibrates** the founder-locked RD-5 membership contract atop EventScore (no second score)
  and likely needs backend/contract work (the event→cluster carry) — **it is not frontend-only and not
  categorically low-risk.** **[BUILD the membership contract (Wave 0) + REPLACE the enforcement (Wave 1); §10.18a, §10.20]**

### 10.1 Fresh audit reconciliation (the closure baseline)

Reconciled against Chapters 1–9; the material facts that shape the roadmap:

- **Identity:** minting is backend-deterministic (`identity.py`; `event_identity.py` ULID). **Resolution
  (label→UID) and Universal Search do not exist** as a shared capability — three divergent frontend copies,
  no endpoint (Ch5/Ch7 L-3). **[BUILD]**
- **Event architecture:** one canonical system with a durable UID authority — **a major closure win** (no
  second event system needed) — **but consumer migration is incomplete.** `MarketEvent.id` remains the
  cycle-local/legacy cluster key while `uid` is durable; audit-identified consumers still on legacy cluster/
  event references or dual-key transitional behaviour include **theme extraction (`contributing_cluster_ids`),
  the institutional graph adapter and prediction-ledger evidence references (cluster-id-keyed), the canonical
  `Explanation` keying, and the frontend `event:cluster:<clusterId>` uid scheme** (`lib/intel/dossier.ts`).
  **[KEEP UID authority + HARDEN/MIGRATE consumers]** — durable-UID navigation and event-linked work (Waves
  3b, 6, 7, 9) depend on this convergence; **Wave 3a (standing-entity FIND) and Wave 1's within-cycle
  event↔cluster relationship do not.**
- **Graph authority:** the **live per-cycle graph authority is `narrative_graph.py`** (`build_narrative_graph
  (feed)`); `graph_adapter.py` is a **durable projection/history** of that cycle graph, not the upstream
  authority. The **frontend elaborates** the graph as if authoritative — a convergence target. **[CONVERGE]**
- **Intelligence composition:** backend produces canonical ingredients; the **Brief is composed client-side**
  and the **client graph elaboration is treated as authority** (Ch7 L-5 wants one canonical composed
  intelligence, with `narrative_graph.py` as the live graph authority the client should consume). **[CONVERGE]**
- **Personalisation:** explicit-only; **feedRanker floor defect (live)**; three theme stores incl. identity-
  blind device orphans; **~0% behavioural/learned personalisation exists** (clean greenfield). **[REPLACE floor; CONVERGE stores; BUILD learning later]**
- **Data:** OHLCV integration **implemented and key-gated** (FMP via `frontend/.../api/explorer-market/
  route.ts`, `FMP_API_KEY`-gated, **fails honestly** with empty states — never sample; production availability
  is a **VERIFY** item); news/M&A **implemented (RSS, keyless; prod availability VERIFY)**; macro **INCOMPLETE** (release RSS, not a structured
  calendar); **structured earnings-calendar ABSENT** (though earnings events are already detectable via news/
  filings); private **INCOMPLETE**; prediction outcomes **ABSENT in source archive** (deployed depth unknown).
  **[DATA GATES + VERIFY]**
- **Persistence:** durable-*capable* by design (`storage.py` resolver + `readiness.py` production fail-fast on
  ephemeral/unwritable storage). **The repository proves the mechanism, not the deployed state:** whether the
  Railway volume + `ARGUS_DATA_DIR` + Supabase creds are attached is **unknown until the running environment
  is inspected** — do not assert production is ephemeral (or durable) without deployment evidence. **[VERIFY (Wave 2) → MIGRATE]**
- **Security:** substantial hardening **completed** (ES256/JWKS auth, transport/bearer-downgrade guard,
  anti-cache proxy, cookie identity, readiness RLS/JWKS boot gate); remaining work is **deployment
  verification**, separable from app changes. **[VERIFY]**
- **Infra:** two Railway services (Nixpacks); a **single in-process 5-min refresher thread** (no distributed
  lock); no Redis; observability = stdlib logging + a bespoke diagnostics endpoint (**no Sentry/metrics/
  tracing**); **~40 backend pytest suites + 29 frontend Vitest files** strong on identity/memory/auth/
  readiness, thin on live-network and E2E. **[HARDEN]**
- **Visual:** no canonical theme (light-default + one `.markets-dark` scope), two card systems, ~2,600
  inline-colour sites, unloaded mono, canvas-trapped luminosity (Ch8). **[REFACTOR/BUILD incrementally]**

### 10.2 Current-state → V2 destination matrix (B)

| V2 capability | Current authority | Desired authority | Class | Blocks other work? |
|---|---|---|---|---|
| Canonical event **UID authority** | `event_identity.py` (journal=truth) | same | **[KEEP]** | durable-UID navigation |
| Event **consumer migration** (legacy `MarketEvent.id`/cluster refs → durable uid) | mixed / dual-key transitional | uid throughout | **[HARDEN/MIGRATE]** | **yes — durable-UID nav; Waves 3b/6/7/9** (not 3a) |
| Backend pipeline / scoring / EventScore | `background.py`, `events.py`, `feeds.py` | reused/extended as scoring foundation | **[KEEP + extend for materiality]** | Wave 1 materiality contract |
| **Live** cycle graph authority | `narrative_graph.py` (`build_narrative_graph`) | same (client consumes it) | **[KEEP]** | Network/Explorer |
| Durable graph **projection/history** | `graph_adapter.py` | same (projection, not live authority) | **[KEEP]** | memory history |
| M3 ledger + outcomes + calibration | `institutional_memory/*` (source default off; **deployed state VERIFY**) | enabled when durable + archive matures | **[KEEP · gate · VERIFY]** | accountability UI (calibration/time-gated) |
| LLM boundary | interpretation/presentation only | same; retire 2 legacy endpoints | **[KEEP + RETIRE legacy]** | — |
| Canonical entity **resolver** + Universal Search/FIND | 3 frontend copies; no endpoint | one platform-owned capability | **[BUILD]** | **yes — company experience, saved, personalisation, ASK** |
| Intelligence graph on the client | client elaboration as authority | consume the **live** `narrative_graph` (via canonical composition) | **[CONVERGE/REFACTOR]** | Network/Explorer premium |
| Morning Brief composition | `lib/morningBrief.ts` (client) | one canonical composed intelligence (L-5) | **[CONVERGE]** | cross-client Brief |
| Client prediction engine | `predictionEngine.ts` (manufactured prob.) | retire as authority; consume ledger/Forward View | **[REPLACE/RETIRE]** | accountability honesty |
| **Universal-materiality membership** | **policy founder-locked (RD-5 §10.18a)**; classifier, calibration, versioned membership output, and event→cluster carry **not yet implemented** (EventScore is scoring/evidence, not membership; admission ≠ membership) | the RD-5 membership contract extending EventScore | **[BUILD — Wave 0]** | **yes — Wave 1** |
| Feed universal-floor enforcement (whole visible pipeline) | **missing**; `events[]` not even passed to cluster ranking | non-suppressible across rank→gate→dominance-cap→ceiling | **[REPLACE — the live defect]** | **yes — safe personalisation** |
| User Intelligence Profile (one authority) | 3 theme stores + device orphans | one account-level UIP | **[CONVERGE/MIGRATE]** | personalisation, cross-client |
| Behavioural / learned personalisation | none (greenfield) | UIP-driven, floor-gated | **[BUILD — later]** | gated on floor + UIP + truth boundary |
| Account schema versioning | DDL exists; manual paste-runbook, drifted | source-controlled, runner, baselined | **[MIGRATE]** (Ch7 L-6) | UIP migration |
| Company depth ladder (Panel/Explorer/Dossier) | two design families, dead-end Dossier | one experience, continuous ladder | **[REFACTOR]** (Ch8 O-9) | company experience |
| Argus Intelligence Chart | `MarketView.tsx` (real, local, un-tokenised) | reusable tokenised signature object | **[REFACTOR + BUILD]** (Ch8 O-7) | data-gated (earnings/macro) |
| Intelligence Network | two engines (one disciplined, one heavy) | premium living map; perf invariant | **[HARDEN + REFACTOR]** (Ch8 O-8) | — |
| Canonical dark theme / surface primitive | none; two card systems | one shell theme + one card idiom | **[REFACTOR]** (Ch8 O-1/O-5) | visual coherence |
| Persistence durability | durable-capable by design; **deployed state unproven** | volume + Supabase confirmed in prod | **[VERIFY/MIGRATE]** | durable memory, ledger |
| Deployment security posture | hardened in code | verified in production | **[VERIFY]** | production trust |
| Observability | logging + diagnostics endpoint | + error tracking/metrics | **[HARDEN]** | operational confidence |
| Price / earnings / macro-calendar data | OHLCV integration implemented + key-gated (FMP), **prod availability VERIFY**; earnings intelligence already arrives via news/filings where detected, **structured earnings calendar/data source absent**; macro incomplete | structured earnings + macro calendar | **[BUILD — data]** | full Brief/Chart depth |
| Workstation / Mobile / ASK | not built | Ch7 destinations | **[DEFER]** | — |

### 10.3 Canonical authority map (C)

Every engine, its authority, and whether V2 requires convergence:

Layer legend: **live authority** (computed fresh each cycle, upstream) · **durable projection/history** ·
**presentation projection** · **cache** · **transitional/compat** (dual-key or legacy-ref, mid-migration).

| System | Authoritative for | Layer | V2 verdict |
|---|---|---|---|
| `event_identity.py` | durable event **UID** (ULID journal=truth, registry=cache) | live authority (+cache) | **[KEEP]** |
| `MarketEvent.id` / cluster + event evidence refs | within-cycle event↔cluster join; legacy references | **transitional/compat** | **[HARDEN/MIGRATE consumers → uid]** |
| `events.py` / `feeds.py` | event classification + **EventScore (scoring, not membership)** + ingestion | live authority (derived) | **[KEEP + extend for universal-materiality membership]** |
| `theme_memory.py` | rolling theme lifecycle (working tier) | live authority (working truth) | **[KEEP]** |
| `narrative_graph.py` (`build_narrative_graph`) | **the live per-cycle graph** | **live authority** | **[KEEP]** |
| `institutional_memory/*` (writer/**graph_adapter**/predictions/outcomes/resolution/reasoning) | sealed daily snapshots + prediction→outcome ledger + calibration; `graph_adapter` = durable **projection of the cycle graph into history** | **durable projection/history** (service-role sole writer) | **[KEEP · enable on maturity · deployed state VERIFY]** |
| `summarizer.py` (market_take/brief/summary) | LLM prose ingredients | cache / presentation | **[KEEP · RETIRE legacy per-item path]** |
| Frontend `lib/intelligenceGraph` | client graph elaboration | presentation (**wrongly treated as authority**) | **[CONVERGE — consume the live `narrative_graph`]** |
| Frontend `lib/morningBrief.ts` | client Brief composition | presentation | **[CONVERGE per L-5]** |
| Frontend `predictionEngine.ts` | session projection w/ manufactured probability | presentation (legacy) | **[REPLACE/RETIRE as authority]** |
| Frontend `feedRanker.ts` | personalised ranking (no floor; `events[]` not passed in) | presentation | **[REPLACE — enforce floor across whole pipeline]** |
| 3 theme stores (`user_preferences.followed_themes` + 2 device) | "themes I care about" | account/device state (**triplicated**) | **[CONVERGE → UIP]** |

**Rule for V2 (from the map):** recorded/live truth is backend-and-single-writer; the frontend **projects**,
never authors. The live graph authority is **`narrative_graph.py`** (the client should consume it), and
`graph_adapter.py` is its **durable history projection**, not the upstream. Every place the client currently
*authors* intelligence (graph elaboration, Brief composition, manufactured prediction probability) is a
convergence target, not a new engine. **A durable UID authority existing ≠ all consumers migrated** — the
`MarketEvent.id`/cluster-ref transitional layer is real work, not done.

### 10.4 Existing systems: KEEP / HARDEN / CONVERGE / REPLACE / RETIRE (D)

- **[KEEP]** the backend truth layer: pipeline, **event UID authority**, EventScore **as a scoring/evidence
  foundation** (not the universal-materiality membership decision — that is the RD-5 contract Wave 0 builds
  atop it), theme memory, institutional memory + M3 ledger, the **live `narrative_graph`**, the clean LLM
  boundary.
- **[HARDEN/MIGRATE]** **event-consumer convergence** (legacy `MarketEvent.id`/cluster refs → durable `ev_…`
  uid — Wave 2c; **transitional debt, not done**); infra reliability (single refresher thread → distributed-
  safe when scaling; add error tracking/metrics), test coverage (live-network + E2E gaps), Network engine
  performance invariant (Ch8 O-8).
- **[CONVERGE]** client graph elaboration → consume the **live `narrative_graph`**; client Brief composition →
  one canonical composed intelligence (L-5); three theme stores → one UIP.
- **[REFACTOR]** company depth ladder → one experience; MarketView → tokenised chart primitive; visual system
  → canonical theme + one card/surface primitive.
- **[BUILD + REPLACE]** the **universal-materiality membership contract** (RD-5 — Wave 0 *builds/calibrates* it
  by extending EventScore; **it does not already exist and is not "just routing"**) and the **Feed enforcement**
  across the whole visible pipeline (Wave 1 — **has a gate (Wave 0) and is not categorically low-risk**;
  materiality classification + calibration + edge semantics are non-trivial); **remove** client
  `predictionEngine` manufactured probability as an authority (Wave 4 — remove, not relabel).
- **[RETIRE]** the two self-labelled legacy LLM endpoints (`analyze.py` per-request enrichment, `summarizer`
  per-item path) once the canonical Explanation path fully covers them; the identity-blind device theme stores.

### 10.5 Foundation dependency analysis (E)

The four candidate foundations, pressure-tested against the repo:

- **F1 — Canonical entity identity + resolution + Universal Search/FIND. [BUILD — the true keystone]**
  *Minting* is already canonical (`identity.py`, `event_identity.py`); **resolution and search are not** (three
  frontend copies, no endpoint). This is the single most upstream unlock: it gates FIND, the Quick Panel,
  Explorer, Dossier, Network entity focus, saved intelligence, watchlists, personalisation, Workstation
  contexts, and later ASK. **Endpoint names stay implementation (Ch7 L-3); the *capability* is foundation.**
- **F2 — Event identity / event architecture. [KEEP UID authority + HARDEN/MIGRATE consumers]** The one event
  system with a **durable ULID authority** is the right foundation — **do not build a second event system.**
  But it is **not "done":** `MarketEvent.id` is still the cycle-local/legacy cluster key while `uid` is
  durable, and consumers remain mid-migration (theme `contributing_cluster_ids`; institutional graph-adapter
  and prediction-ledger evidence refs; the `Explanation` keying; the frontend `event:cluster:<clusterId>`
  scheme). **Event-consumer convergence to the durable uid is a prerequisite for durable-UID navigation and
  event-linked work** (Waves 3b, 6, 7, 9); it does **not** block **Wave 3a (standing-entity FIND)** or Wave
  1's within-cycle event↔cluster relation.
  Structured earnings/macro **coverage** (§10.6) is a separate data gap, not an identity gap.
- **F3 — Canonical intelligence composition. [CONVERGE]** Clients recompute in two places: the intelligence
  graph (client elaboration — the live authority it should consume is **`narrative_graph.py`**, not the
  durable `graph_adapter` projection) and the Morning Brief (client composition). Per L-5, one canonical
  composed intelligence must exist (server / shared package / hybrid — implementation open) before V2 rebuilds
  the Brief and the premium Network as cross-client surfaces. **This wave (7) is therefore an explicit
  dependency of the premium Network (Wave 9).**
- **F4 — Account/user state. [MIGRATE + BUILD]** The UIP foundation for preferences/Saved/watchlists/
  explanation-depth/personalisation/cross-client — requires consolidating the three theme stores and
  baselining the account schema (source-controlled, runner) per Ch7 L-6 and Ch9 UI-12.

**Foundation ordering:** **F2's durable `ev_…` UID authority exists and is canonical, but consumer
convergence remains incomplete and is owned by Wave 2c** (legacy/cycle-local `MarketEvent.id`/cluster refs are
transitional; migration is not complete); **F1 is the keystone build**; F4 (UIP + schema) and the **floor
fix** are the safety-critical account-side foundation; F3 convergence rides on top for the Brief/Network
rebuilds.

### 10.6 Data-readiness analysis (F)

| Domain | State | Implication |
|---|---|---|
| Market prices / OHLCV | **integration implemented and key-gated** (FMP, `FMP_API_KEY`-gated; honest-empty otherwise, never Sample); **production availability VERIFY** | Chart price layer buildable now; verify the key/availability in prod (Wave 2) |
| News / headlines | **implemented** (curated RSS/Atom, tiered, keyless); **prod availability VERIFY** | Feed/Brief buildable now |
| M&A / deals | **implemented** deal facts (RSS-derived, keyless); heuristic analysis; **prod availability VERIFY** | M&A intelligence buildable; no structured deal DB |
| Macro / economic calendar | **INCOMPLETE** (release-headline RSS, not a structured forward calendar w/ consensus/actuals) | Brief "scheduled macro / CPI-FOMC-jobs" and chart macro markers are **partially data-gated** |
| Private markets / VC | **INCOMPLETE** (RSS headlines only) | Private surface stays headline-grade |
| Earnings | earnings intelligence **can already arrive through news/filings**; **structured earnings-calendar/data capability absent** (no calendar/API; regex + 8-K only) | Brief earnings + chart earnings markers are **structured-data-gated** |
| Prediction outcomes | **ABSENT in source archive; deployed depth VERIFY** | accountability UI calibration/time-gated (§10.7) |

**Rule (founder priority):** *do not let unavailable premium data block work that can be built honestly with
current data.* Charts (price + events + thesis), Feed, Brief (news/theme/change-driven), and the company
experience are **buildable now** with honest empty states. **Structured earnings + a macro calendar are the
two data acquisitions that most raise Brief/Chart depth** — a **[BUILD-data]** decision (§10.18), not a
vendor lock-in for the architecture. No vendor is chosen here.

### 10.7 Calibration / validation gates (G)

**V2 must not visually outrun epistemic readiness — and the gate machinery is built to prevent it.**
Classification (source-level; production state is a Wave 2 VERIFY — §10.8):

- **Decision-ready now:** live market charts, news/Feed intelligence, M&A/theme intelligence, the canonical
  Explanation — all deterministic with self-labelling empty states.
- **Architecturally supported but calibration/data-gated:** the **M3 Prediction Ledger** (**source default**
  `prediction_ledger_enabled=False`; memory derived from Supabase-cred presence — **deployed enablement is
  VERIFY**), **outcome resolution**, **calibrated confidence / reliability curves**, **historical analogs**,
  and the **accountability UI** (Ch6). Gates: **≥30 resolved/type, ≥10/bucket, ≤20% untested** (outcomes);
  **≥60 sealed days, ≥2 regimes, ≥10 tested outcomes** (analogs). Whether these are met depends on **deployed
  archive depth, which the repository does not prove** (the checked-in ~1-day ledger is not evidence of
  production history). The engines **self-suppress** (`insufficient_history` / `credible:false`) until met.
- **Not yet sufficiently backed:** user-facing confidence is **raw heuristic, not calibrated** (theme
  conviction is the model number; the only calibrated figure is the separate gated *diagnostic*).

**Crucial roadmap consequence (§10.13 Wave 2b):** because calibration/accountability require **elapsed real
history**, an **early operational gate must actually start the prediction-history clock** — verify
durability, verify deployed config, enable **one** allowlisted prediction type when the existing safety/
readiness requirements are satisfied, and begin accumulating issuance/resolution/outcome evidence — running
**in parallel** with product waves. That gate is **not** permission to expose accountability UI; **Wave 10
remains calibration/time-gated.**

**Dependency for accountability UI (Ch6):** durable Supabase archive (§10.10) → ledger enablement (one type at
a time, per the allowlist) → **time** to accrue sealed days/regimes/outcomes → gates pass → *then* Quick-Panel
On-the-Record, Explorer accountability, Dossier record, and Feed/Brief resolution events become legitimate.
**Do not enable any gated feature because a roadmap exists** (explicit constraint). Preserve **Current Forward
View ≠ Prediction Ledger** and **no retroactive predictions**.

### 10.8 Security / reliability baseline (H)

**Completed (do not reopen without evidence):** ES256/JWKS bearer auth with RS/HS-confusion + `alg:none`
rejection; the transport/bearer-downgrade guard (`secureBackendFetch`, `isSafeInitialDestination`); the
catch-all authenticated proxy **uniform no-store/anti-cache** policy; production cookie `Secure` + Supabase
anti-cache propagation; the read-only activation-debug surface; the `readiness.py` production boot gate
(RLS/JWKS/storage fail-fast).

**Remaining — deployment *verification*, separable from application changes: [VERIFY]** actual production
cookie attributes; Railway transport/TLS + HSTS/edge behaviour; intermediary cache behaviour; **deployed
migrations/RLS/grants**; secrets present (`SUPABASE_*`, `FMP_API_KEY`, `ARGUS_DATA_DIR`); allowed origins; and
**the Railway volume actually attached** (the durability precondition, §10.10). **Reliability:** the
single-thread in-process refresher (no distributed lock) and thin observability (no error tracking/metrics)
are **[HARDEN]** items to reconcile into the roadmap so security/reliability doesn't detach from product work.

### 10.9 Canon-amendment queue (I)

Audited from the document, not memory. **None are applied in Chapter 10.** Classification:

| Queued amendment | Source | Class |
|---|---|---|
| **AA-1/AA-2/AA-3** — Ledger doc placement; Surfaces accountability placements; (no Knowledge-Model change) | Ch6 | **AMEND WITH RELATED PHASE** (accountability waves) |
| **BA-1** — Master Arch: the **platform/multi-client boundary** | Ch7 | **MUST-AMEND-BEFORE Wave 3a AND Wave 7** — those are the *first implementation* of the platform-owned resolver/search (3a) and the canonical Brief/composition boundary (7) that BA-1 exists to register; **does not block unrelated frontend work** |
| **BA-2/BA-3** — Surfaces client-projection note; Knowledge-Model Context/Workspace *(only if represented)* | Ch7 | **AMEND WITH RELATED PHASE** (later cross-client work) |
| **EA-1 (new) — Chapter 5: establish durable `ev_…` UID as the canonical event address** | Ch5 (Ch10-raised) | **MUST-AMEND-BEFORE / WITH Wave 2c** (event-consumer UID convergence) and event FIND/nav (Wave 3b) |
| **§8.13 Design-Bible items** (generalise Still-Cognition; extend no-logo test; out-of-Network gesture use; Rail/Figure/Notch scope; build doc-only gestures) | Ch8 | **DESIGN-BIBLE GATE** — file to the Bible's V2.x/V3.0 process **before** any protected gesture is generalised (Wave 9); not before other work |
| **CA-1/CA-2** — Master Arch aesthetic doctrine; Surfaces theme/card/ladder note | Ch8 | **AMEND WITH RELATED PHASE** (visual waves 5/9) |
| **DA-1** — Master Arch: register the User Intelligence layer | Ch9 | **MUST-AMEND-BEFORE / WITH Wave 1** — Wave 1 establishes the personalisation boundary + Feed universal-floor contract |
| **DA-2** — Surfaces: UIP consolidation + **Feed universal-floor correction** | Ch9 | **AMEND WITH Wave 1** (it *is* the floor-contract amendment), extended at the UIP wave |
| **DA-3** — Knowledge Model: UIP as experience/account object *(only if represented; never a market-intelligence object)* | Ch9 | **OPTIONAL / DOCUMENTATION-ONLY** |

None are **SUPERSEDED**. The corrected **MUST-AMEND-BEFORE** set is: **DA-1 + DA-2 before/with Wave 1**;
**BA-1 before Wave 3a and Wave 7** (the first resolver/search and Brief/composition boundary — *corrected*
from the earlier exemption); **EA-1 before/with Wave 2c** (durable event address); and the **Design-Bible gate
before generalising any protected gesture** (Wave 9). Every "must-precede" amendment is attached to the wave
that actually depends on it (§10.13). *(Amendments remain flagged, not made — constraint.)*

### 10.10 Migration queue (J)

| Migration | From → To | Risk | Gate |
|---|---|---|---|
| **Persistence durability** | **VERIFY deployed storage** (volume + `ARGUS_DATA_DIR` + Supabase M3 creds) — repo proves the mechanism, not the deployed state | **high if unmet** (silent data loss on deploy) | **VERIFY first (Wave 2) — precedes ledger enablement & durable memory** |
| **Account schema baselining** (Ch7 L-6, Ch9 UI-12) | manual paste-runbook + drifted `schema.sql` → source-controlled, a runner, baselined-from-live | medium (live tables — adopt safely, never destructively recreate) | before UIP writes |
| **Theme-store consolidation** (Ch9 UI-1/UI-12) | 3 stores (incl. identity-blind device orphans) → one account-level UIP | medium (preserve existing users' follows; retire orphans) | after schema baselining |
| **Universal-materiality membership + Feed enforcement** (Ch9 UI-3; RD-5) | no membership contract + no floor → **Wave 0 builds/calibrates the RD-5 membership signal (extending EventScore), Wave 1 enforces it across the whole pipeline** | **not low** — new materiality classification, a calibration/acceptance contract, event→cluster carry, and full-pipeline edge semantics (overflow/missing/mapping/rollback) | **gated by Wave 0 (RD-5)**; no DB schema change, but not a trivial reorder |
| **Event-consumer UID convergence** (Wave 2c; EA-1) | legacy `MarketEvent.id`/cluster refs → durable `ev_…` uid | medium (distinguish durable identity from within-cycle joins; no blind replace) | before event-linked parts of Waves 3b/6/7/9 |
| **Client-authority demotions** | client graph/Brief/predictionEngine authoring → consuming backend | low-medium (behaviour parity); **predictionEngine probability is *removed*, not relabelled** | after canonical composition (F3) |

**Migration discipline (Ch7 L-6 locked):** treat the **live production schema as authoritative**; baseline/
adopt safely; **never blindly recreate, drop, or destructively alter live tables.** No migration is created
or run in Chapter 10.

### 10.11 The dependency graph (K)

Derived from the repo (→ = hard dependency; ⇢ = soft/quality dependency; ‖ = parallelisable):

```
[KEEP] event UID authority (event_identity.py) ─┐  [Wave 2c + EA-1] event-consumer UID convergence
[KEEP] backend truth layer (pipeline/EventScore  │        (legacy MarketEvent.id/cluster refs → durable ev_… uid)
       =scoring foundation / live graph           │        └─→ durable-UID nav: event FIND (3b), chart markers (6),
       =narrative_graph.py / M3)                   │            Brief/graph event links (7), Network event focus (9)
                                                   └─→ within-cycle event↔cluster (Wave 1 uses this; not migrated)

[Wave 0] BUILD+CALIBRATE the RD-5 universal-materiality MEMBERSHIP contract  (LOCKED §10.18a; extends EventScore, no 2nd score)
        └─→ Wave 1: enforce across WHOLE visible pipeline
                    (rank → quality gate → dominance cap → bounded ceiling → ordering/lead;
                     overflow=deterministic universal ranking; missing=neutral; mapping-fail=event-native; safe rollback)
                    incl. event→cluster carry so membership reaches cluster ranking
              └─→ SAFE personalisation ──→ UIP consumption ──→ behavioural learning (later)

[BA-1 before] Wave 3a: standing-entity resolver + FIND (needs a verified canonical directory/index — Wave 2 data VERIFY)
        ├─→ company discovery (visible)  ├─→ Panel→Explorer→Dossier (Wave 4)  ├─→ saved/watchlists  └─→ later ASK
        └─→ Wave 3b: event FIND/nav (needs Wave 2c UID convergence)

persistence durability VERIFY (Wave 2) ──→ [Wave 2b] INVENTORY deployed ledger state → preserve/reconcile →
        enable ONE type only if disabled+ready (idempotent) → history clock ──(elapsed time)──→ gates pass ──→ accountability UI (Wave 10)

account schema baselining ──→ UIP authority ──→ Brief/Feed consume UIP  ‖  cross-client sync
[BA-1 before] Wave 7 canonical composition (consume live narrative_graph + Brief server/shared) ──→ premium Network (Wave 9)
canonical dark theme + one card idiom ──→ visual coherence ⇢ Chart · Company ladder · Network premium
MarketView → tokenised Intelligence Chart ⇢ (data VERIFY: FMP prod; data gates: earnings/macro) ──→ full "price + what Argus understood"
```

**Gates on the graph:** **Wave 0 (RD-5 membership build/calibration) precedes Wave 1**; **Wave 2c + EA-1
(event-consumer UID convergence) precede durable-UID navigation and event-linked Waves 3b/6/7/9**; **BA-1
precedes Wave 3a and Wave 7**; a **VERIFY gate** (durability, Wave 2) precedes ledger work, and the
**state-preserving Wave 2b** starts the history clock the **calibration/time gate** on accountability UI (Wave
10) depends on; **Wave 3a needs a verified canonical directory/index (Wave 2 data VERIFY)**; **data gates**
(earnings/macro) precede full Brief/Chart depth; **canonical composition (Wave 7) precedes the premium Network
(Wave 9)**. Parallelisable early: the resolver/FIND track (3a), the visual track (5), the floor/UIP track, and
the durability+ledger-clock track (2/2b), plus Wave 2c. **Every hard dependency shown here appears in the
affected wave's dependency list (§10.13).**

### 10.12 Foundation vs Product vs Later-Capability (L)

Deliberately interleaved (foundation is **not** automatically higher priority than visible product):

- **FOUNDATION (unlocks several systems):** the Feed floor fix; canonical resolver + Universal Search;
  persistence-durability verification; account-schema baselining + UIP authority; canonical intelligence
  composition (F3); canonical dark theme + one surface primitive.
- **PRODUCT (user-visible, materially better Argus):** a genuinely useful Brief; a Feed that explains the
  market; company discovery via FIND; the Panel→Explorer→Dossier experience; the Argus Intelligence Chart;
  Network premium quality; incremental visual coherence.
- **LATER-CAPABILITY (prerequisites immature / not needed for core V2 excellence):** Workstation, Mobile,
  behavioural learning, ASK, advanced alerts, a dedicated accountability destination, structured premium
  datasets beyond earnings/macro, any new engine.

### 10.13 Proposed implementation waves in dependency order (M)

Small, independently reviewable/committable waves that **interleave foundation and visible product**. Each is
compact by design; full detail for **Wave 1** is in §10.20. Rollback is a **config flag** wherever possible
(the repo already uses `merge_dedup`, `registry_folding`, `event_identity`, `prediction_ledger_enabled` as
rollback hatches — extend that pattern).

- **Wave 0 — Implement + calibrate the RD-5 universal-materiality *membership* contract.** *Why now:* Wave 1
  cannot enforce a floor without the **membership decision** the founder locked (§10.18a). `EventScore` is the
  **scoring/evidence foundation Wave 0 extends** into a **deterministic, recorded-evidence membership signal**
  (no second, no frontend, no LLM importance score); the LLM may only *explain* a decision. *Deps:* none.
  *Affects:* a backend membership classifier over the allowed recorded inputs (magnitude · breadth · cross-
  asset/sector transmission · policy/macro significance · market/risk/liquidity · corroboration · valid
  canonical conviction), emitting a **decomposable, versioned** decision (auditable: *"why is this in
  everyone's market view?"*); the **calibration/acceptance contract** (not a magic number) proving *clearly
  systemic events qualify · routine/noise doesn't flood · mandatory-consideration classes are evaluated not
  auto-admitted · deterministic for same inputs+policy version · explainable*; and the **event→cluster carry**
  so membership reaches ranking (the Feed page passes no `events[]` today). *Non-goals:* a new importance
  engine; class-auto-admission; visual work. *Exit:* a calibrated, versioned, decomposable membership signal
  meeting the acceptance contract, carried to clusters. **(FOUNDATION — backend/contract + calibration; not frontend-only)**
- **Wave 1 — Enforce the universal-materiality invariant across the WHOLE visible Feed pipeline + truth-boundary
  lock.** *Why now:* fixes a **live personalisation correctness defect** (Ch9 UI-3) and is the safety
  precondition for all personalisation. *Deps:* **Wave 0 (the RD-5 membership signal); DA-1 + DA-2 amended
  before/with this wave.** *Affects:* `feedRanker.ts`, `feed/page.tsx` (which must **provide `events[]`/
  membership to ranking**), and the event→cluster carry. A **universal-member event** must survive **every**
  downstream stage — **preference/relevance ranking → `passesQualityGate` → `capEventDominance` → final visible
  ceiling/slice → ordering → required lead position.** *Overflow (per §10.18a):* the ceiling stays **bounded** —
  when universal members exceed it, rank the universal set **deterministically via the canonical materiality
  authority** and show the highest-materiality members that fit; **a personalised item never displaces a
  higher-ranked universal member**, and the Feed never grows unbounded (the Brief may signal an unusually
  material session). *Missing signal:* fail toward a **neutral canonical projection** (no aggressive
  personalised suppression of the unresolved item; never fabricate membership). *Mapping failure:* preserve the
  event via an **honest event-native/fallback representation** (never invent a cluster). *Unpersonalised:*
  preserve except where the invariant requires correction; **no byte-for-byte ordering promise** if the old
  order violated the floor. *Debt retired:* the echo-chamber path across the full pipeline. *Migration:* none.
  *Validate (edge semantics — Codex Blocker 2):* universal-member count > ceiling; multiple universal members +
  deterministic ordering; **absent `events[]`**; universal event with **no matching cluster**; **duplicate**
  event→cluster mapping; **dominance-cap collisions** between universal events; unpersonalised order conflicting
  with universal lead; **safe rollback**. *Non-goals:* behavioural learning; ranking-weight tuning; a second
  score. *Rollback (per §10.18a):* **may never restore the unsafe personalised-suppression path** — instead
  disable/reduce personalisation or fall back to a canonical non-personalised projection, retaining universal
  safety. *Exit:* **an item admitted to canonical universal membership cannot be suppressed by personalisation
  or any downstream client presentation filter Chapter 2 says the floor overrides.** **(FOUNDATION+PRODUCT)**
- **Wave 2 — Durability + deployment verification + observability baseline.** *Why now:* precondition for
  ledger enablement and durable memory; parallelisable with Waves 0–1. *Deps:* none. *Affects:* Railway config
  (volume/`ARGUS_DATA_DIR`/Supabase creds/`FMP_API_KEY`/origins), add error tracking/metrics. *Visible:*
  reliability (indirect). *Debt retired:* the ephemeral-FS production risk (VERIFY). *Validate:* deploy-marker
  survives redeploy; RLS/JWKS/cookie/HSTS checks pass; **FMP/OHLCV available in prod**. *Non-goals:* no
  distributed-refresher rebuild yet. *Rollback:* config. *Exit:* durability + security + data availability
  **proven in production** (no longer assumed from source defaults). **(FOUNDATION/VERIFY)**
- **Wave 2b — Prediction-history clock (owned, *state-preserving* operational gate).** *Why now:* accountability
  (Wave 10) needs **elapsed real history**, so something must *start* accruing it early. *Deps:* Wave 2
  (durability proven). *Affects:* **begin by inventorying deployed state** — enablement flags, enabled/
  allowlisted types, active predictions, existing historical predictions, resolution state, archive/history
  depth (**do not assume the ledger is disabled in production**). **Preserve and reconcile existing state.**
  **Enable one allowlisted type only if it is currently disabled and readiness is proven.** If production
  already holds legitimate active predictions/history, **do not reset, destructively narrow, reissue, or break
  resolution continuity**; require **idempotence / no duplicate issuance.** Then monitor issuance/resolution
  and accrue outcome/calibration evidence, **in parallel** with product waves. *Non-goals:* **NOT permission to
  expose any Prediction Ledger / accountability UI** (Wave 10 stays calibration/time-gated); no retroactive
  predictions; no product accuracy claim. *Rollback:* `prediction_ledger_enabled` flag + type allowlist (state-
  preserving). *Exit:* deployed state inventoried and reconciled; one type issuing/resolving idempotently
  against a durable archive; the clock running. **(FOUNDATION/ops · parallel)**
- **Wave 2c — Event-consumer UID convergence (owned foundation).** *Why now:* a durable UID authority exists
  but consumers are mid-migration; **durable-UID navigation and event-linked work (event FIND, chart markers,
  Brief/graph event links, Network event focus) depend on convergence.** *Deps:* the UID authority (exists).
  *Affects:* migrate appropriate **durable** references from legacy/cycle-local `MarketEvent.id`/cluster-derived
  addresses to the canonical durable `ev_…` UID — **retaining cluster id only for legitimate within-cycle joins
  and transitional compat** (no blind global replace). Known consumers: **Explanation identity/keying; frontend
  Dossier event addressing; redirects/navigation; institutional graph-adapter evidence refs (where durable);
  prediction-ledger evidence refs (where durable); theme contributing refs (where durability requires UID);
  event-linked chart markers; Brief/graph event links; Network event focus/navigation.** *Amend:* **EA-1**
  (Chapter 5 canon — establish durable `ev_…` UID as the canonical event address) filed with this wave.
  *Validate:* durable refs resolve by uid across cycles; within-cycle joins still work; no orphaned addresses.
  *Non-goals:* rewriting within-cycle cluster joins; Wave 1's within-cycle relation is untouched. *Exit:*
  durable event refs on `ev_…`; EA-1 amended. **(FOUNDATION · precedes event-linked parts of Waves 3b/6/7/9)**
- **Wave 3a — Standing-entity resolver + Universal Search/FIND (F1 keystone).** *Why now:* the biggest upstream
  unlock and a dramatic visible win; **can proceed independently of UID convergence.** *Deps:* identity minting
  (exists); **a canonical entity directory/index (see prerequisite below).** *Affects:* a platform resolve/
  search capability (endpoint shape = implementation, L-3); collapse the three frontend copies (`tickerMetadata.ts`,
  `dossier.ts` grammar, `entity.ts`) to one binding; wire a FIND surface (Ch5). *Directory/data prerequisite
  (Codex Blocker 6 — replaces "migration: none"):* **select the permitted canonical directory/index for fuzzy
  FIND and verify its data source.** If it uses deployed `institutional_entities`, **Wave 2 must verify**
  required migration/schema state, population/data sufficiency, service-role access, and **alias/label
  availability** for fuzzy discovery; any alternative index must remain **single-authority and Ch7-compliant.**
  *Amend:* **BA-1 precedes this wave** (first platform-owned resolver/search — the boundary BA-1 registers).
  *Visible:* **company discovery becomes dramatically easier.** *Debt retired:* stranded/divergent resolution.
  *Validate:* contract tests (same query → same UID for all users; deterministic). *Non-goals:* ASK;
  personalised ranking beyond ties; **event** FIND. *Exit:* one entity resolver, deterministic standing-entity
  FIND, `/intel/<uid>` navigation. **(FOUNDATION+PRODUCT)**
- **Wave 3b — Event FIND / navigation.** *Why now:* completes FIND for events once addresses are durable.
  *Deps:* **Wave 2c (UID convergence)**; Wave 3a. *Affects:* event search/navigation on durable `ev_…` UID.
  *Validate:* durable event nav; deterministic resolution. *Non-goals:* ASK. *Exit:* event FIND on durable UID.
  **(PRODUCT)**
- **Wave 4 — Company depth ladder (Panel→Explorer→Dossier) + *retire* client `predictionEngine` manufactured
  probability.** *Why now:* consumes the resolver; delivers a signature company experience. *Deps:* Wave 3a.
  *Affects:* `IntelligenceDrawer`, `explore/[entity]`, `CompanyDossier`/`primitives.tsx`, `predictionEngine.ts`.
  *Visible:* one continuous company-intelligence experience, no dead-end (Ch8 O-9). *Debt retired:* two design
  families; the manufactured-probability authority. **Chapter 4 correction (explicit):** Chapter 4 prohibits
  *absorbing* the manufactured client probability — so Wave 4 must **remove manufactured probability as an
  authority, not preserve it by relabelling.** **Only evidence-bound qualitative mechanics that independently
  satisfy the canonical truth boundary may survive**; the fabricated 0–100 number does not. *Validate:*
  continuity + honesty; **assert no manufactured probability persists in any user-facing authority.**
  *Non-goals:* full accountability UI (calibration-gated). *Exit:* continuous ladder; manufactured probability
  **removed**; only truth-boundary-compliant mechanics retained. **(PRODUCT)**
- **Wave 5 — Canonical dark theme + one card/surface primitive + type foundation.** *Why now:* converts
  "separately designed pages" into one instrument; broadly visible. *Deps:* none (parallel to 3–4). *Affects:*
  `globals.css`, `tailwind.config.ts`, shell, `next/font`, migrate Listen/Industries outliers. *Visible:*
  immediate coherence (Ch8 O-1/O-4/O-5). *Debt retired:* four darks, two card systems, unloaded mono. *Validate:*
  visual regression + a11y/contrast. *Amend:* **CA-1/CA-2** with this wave. *Non-goals:* full inline-colour
  migration in one branch. *Exit:* one theme, one card idiom, fonts loaded. **(FOUNDATION-VISUAL+PRODUCT)**
- **Wave 6 — Argus Intelligence Chart primitive.** *Why now:* signature object; price+events+thesis buildable
  now. *Deps:* Wave 5 (tokens); **Wave 2c (event markers → durable `ev_…` uid); Wave 2 (FMP prod availability
  VERIFIED).** *Affects:* extract a tokenised chart kit from `MarketView.tsx`;
  intelligence overlay honesty (Sample badged; recorded≠reconstructed). *Visible:* a premium signature chart
  (Ch8 O-7). *Data:* earnings/macro markers **data-gated** (§10.6) — ship price+event+thesis first. *Validate:*
  honest empty states; perf budget. *Non-goals:* a chart-specific intelligence engine. *Exit:* reusable chart;
  "price + what Argus understood" for available/verified data. **(PRODUCT)**
- **Wave 7 — Canonical intelligence composition: Brief + graph convergence + Feed market-map/stream.** *Why
  now:* makes the Brief useful every open and the Feed explain the market; **establishes graph convergence**
  (the frontend consumes the **live `narrative_graph`** instead of elaborating its own authority). *Deps:*
  Waves 1, 3a; **Wave 2c (event-consumer convergence);** **BA-1 amended before this wave** (first canonical
  Brief/composition boundary); the **RD-1** L-5 computation-location decision (§10.18). *Affects:* Brief
  composition (server/shared per L-5), graph convergence, Feed hero + stream. *Visible:* better Brief and Feed.
  *Debt retired:* client-recomposition divergence + client-graph-as-authority (F3). *Data:* fuller with
  earnings/macro. *Validate (corrected — only one client exists today):* **one canonical composition contract +
  a correct web projection**; *cross-client parity is a **future** validation once another client exists* — do
  not claim cross-client parity now. *Non-goals:* personalised learning. *Exit:* one canonical composition;
  correct web projection; client consumes live graph; Feed = market state + understandable stream. **(FOUNDATION+PRODUCT)**
- **Wave 8 — UIP consolidation + account-schema baselining (explicit-only).** *Why now:* one personalisation
  authority, floor-gated; account-scoped. *Deps:* Waves 1, 2. *Affects:* consolidate three theme stores → UIP;
  baseline schema (runner, source-controlled, safe adoption — L-6/UI-12); Brief/Feed consume UIP. *Visible:*
  preferences that follow the account and never suppress systemic events. *Debt retired:* three stores; device-
  orphan identity leak. *Migration:* **account-schema baselining first, then controlled theme-store
  consolidation** (the correct order — schema before UIP writes); **careful, non-destructive.** *Amend:* DA-1/
  DA-2 already applied at Wave 1; **extend DA-2** for the consolidation here. *Non-goals:* **behavioural
  tracking, ranking weights** (deferred, UI-13). *Exit:* one UIP; orphans retired. **(FOUNDATION)**
- **Wave 9 — Intelligence Network premium experience.** *Why now:* the living-market-map quality goal. *Deps:*
  Waves 3a, 5; **Wave 7 (canonical composition / graph convergence — the client must consume the live
  `narrative_graph`, not its own elaboration); Wave 2c (event-consumer convergence for event focus/nav); file
  the §8.13 Design-Bible gate items first.** *Affects:* composition/lighting/hierarchy/labelling/inspector/transitions within the
  **performance/experience invariant** (Ch8 O-8; renderer = implementation). *Visible:* premium Network.
  *Validate:* idle-when-quiet, reduced-motion, GPU/battery budget. *Non-goals:* new gestures outside the
  Network until Bible-gated. *Exit:* living map meeting the invariant, over the canonical live graph. **(PRODUCT)**
- **Wave 10 — Accountability UI (time/calibration-gated).** *Why now:* **only when** the sealed archive matures
  past the gates. *Deps:* **Wave 2b (the history clock must have been running)** → **elapsed time** → gates
  pass. *Affects:* Quick-Panel On-the-Record, Explorer accountability, Dossier record, Feed/Brief resolution
  events (Ch6). *Visible:* Argus on the record. *Validate:* calibration gates genuinely met; no product
  accuracy claim. *Amend:* **AA-1/AA-2** with this wave. *Non-goals:* retroactive predictions; a dedicated
  destination. *Exit:* gated accountability exposed **only** when credible. **(PRODUCT · deferred by data/time)**

Waves 0–2/2b and the visual track (5) are largely parallelisable with the resolver track (3–4). **Wave 2b runs
in parallel from just after Wave 2 so the accountability clock accrues while product waves proceed.**

### 10.14 Earliest user-visible wins (N)

Honest wins (never faking an experience before its intelligence is trustworthy):
1. **Systemic events stop vanishing** from personalised feeds (Wave 1) — small change, real trust gain.
2. **Company discovery via FIND** (Wave 3a) — the single most-felt product improvement.
3. **A coherent premium look** (Wave 5) — the whole product reads as one instrument.
4. **A signature chart** (Wave 6) and **a continuous company experience** (Wave 4).
5. **A Brief worth opening every day + a Feed that explains the market** (Wave 7).

### 10.15 Explicit defer / do-not-build-yet list (O)

Approved architecturally ≠ in the first program. **Defer:** Workstation implementation; the Mobile app; **ASK**;
**behavioural personalisation / learned interests** (until floor + UIP + truth boundary are correct — UI-13);
a **dedicated Prediction Ledger page** (until calibration matures and the woven placements prove insufficient,
Ch6); **complex alerting**; collaboration; **pricing/tier engineering** (Ch7 deferred); **large premium-data
contracts** beyond the earnings/macro decision; **any new engine**; and a **full design-system rewrite before
visible product improvement** (Wave 5 is incremental, not a big-bang redesign). Deferring these is how the live
product keeps improving without an invisible-infrastructure detour.

### 10.16 Proposed V2 milestones (P)

Each is a genuinely more capable **live** product, not a sprint count (names provisional):
- **M-A — "Argus never hides what matters"** (Wave 1) — the floor is honest.
- **M-B — "Argus is durable and observable"** (Wave 2) — production-trustworthy.
- **M-C — "Argus knows what everything is"** (Wave 3a/3b) — resolver + FIND.
- **M-D — "Argus explains companies coherently"** (Wave 4) — the ladder.
- **M-E — "Argus feels like one premium instrument"** (Waves 5–6) — theme + chart.
- **M-F — "Argus's Brief and Feed explain the market"** (Wave 7).
- **M-G — "Argus understands the user safely"** (Wave 8) — UIP, floor-gated, no tracking.
- **M-H — "Argus visualises the market as a system"** (Wave 9) — premium Network.
- **M-I — "Argus is on the record"** (Wave 10) — accountability, **when calibrated.**

### 10.17 Testing / review / deployment discipline (Q)

Reuse the security-hardening cadence — **small phase → implement → targeted review → correction → PASS →
commit → deploy → production verification** — and make it **mandatory** for: any migration, any auth/RLS/
security change, the Feed floor fix (correctness tests), ledger enablement, and schema baselining. Per wave:
**unit + contract tests** (resolver determinism), **migration tests** (non-destructive, reversible),
**calibration/data-quality checks** (gated features stay suppressed until met), **performance budgets**
(Network/Chart), **accessibility checks** (visual waves), **deployment verification** (§10.8 VERIFY list), and
an explicit **rollback boundary** (a config flag). Each wave states its **exit criteria** and does not proceed
until met. Observability (Wave 2) is the precondition that makes production verification real.

### 10.18 Final architecture closure check + remaining founder decisions (R)

**Closure inspection of Chapters 1–9 — no blocking contradiction *within the approved chapters*.** Explicitly
checked: duplicate authorities (resolved by the §10.3 map — the client authors nothing canonical), unresolved
founder decisions in Ch1–9 (**none remain open**; UI-8 was the last, now locked), implementation choices
canonised as architecture (Ch7 L-3/L-5, Ch8 O-8/O-9 correctly leave endpoints/renderer/mechanism as
implementation), ownerless systems (none), missing migration paths (durability + schema scheduled, §10.10),
and security/calibration/cross-client/aesthetic conflicts (none). The client `predictionEngine` vs Ch6 honesty
is **scheduled debt (Wave 4), not a contradiction.**

**The Codex review surfaced one genuine open item that the approved architecture had not resolved — the
universal-materiality *membership* contract (RD-5). It is now founder-locked (§10.18a).** RD-1…RD-4 remain
scheduled roadmap/engineering decisions (not closure blockers).

#### 10.18a — RD-5 (FOUNDER-LOCKED) — Universal-materiality policy

**Definition (locked).** *An event is universally material when Argus has **sufficient recorded evidence**
that the event is likely to materially change the market's shared information set, risk pricing, liquidity
conditions, policy expectations, or transmission across economically significant companies, sectors, asset
classes, or geographies — regardless of whether it matches an individual user's interests.*

- **Mandatory consideration ≠ universal membership.** Chapter 2's mandatory-consideration classes (earnings,
  FOMC, CPI, major geopolitical, major transactions, …) **must always be *evaluated*** for universal
  materiality, but **class membership alone does not automatically confer universal membership.**
- **Allowed decision inputs.** Membership **must extend/reuse the canonical backend scoring/evidence
  architecture** — **no independent frontend or LLM importance score.** It may use deterministic, recorded
  evidence of: magnitude/material impact; breadth of affected entities/sectors/assets/geographies; cross-
  asset/cross-sector transmission; policy/macro significance; market/risk/liquidity implications; corrobora-
  tion/evidence quality; canonical conviction/evidence strength where already valid. **Do not canonise
  implementation-specific formulas unnecessarily.**
- **LLM boundary.** An LLM may **explain** why an event was classified universally material; it may **not**
  author the membership decision, fabricate evidence, or override deterministic truth.
- **Auditability.** Every membership decision must be **decomposable into recorded contributing evidence/
  reasons** sufficient to answer *"why did Argus put this in everyone's market view?"* The **policy/
  calibration version** used must be recordable so historical membership stays interpretable across future
  calibration changes.
- **Threshold governance (no magic number).** Architecture does **not** fix a numeric threshold; the eventual
  number is produced by **bounded calibration against representative historical/current events.** Chapter 10
  defines a **calibration/acceptance contract**, demonstrating at minimum that: clearly systemic events
  reliably qualify; routine/noise events do not flood the universal set; mandatory-consideration classes are
  *evaluated*, not auto-admitted; results are **deterministic** for the same recorded inputs + policy version;
  and membership stays explainable/decomposable.
- **Universal overflow.** The Feed visible ceiling stays **bounded.** If universal members exceed it, rank the
  universal set **deterministically via the canonical materiality authority** and show the highest-materiality
  members that fit — **never expand the Feed without bound, and never let a personalised item displace a
  higher-ranked universal member.** Other surfaces (e.g. the Brief) may communicate that the session holds an
  unusually large number of materially significant events.
- **Missing membership signal.** Missing/unavailable classification is **not** "not universal"; **do not
  fabricate membership.** Until classification is available, **fail toward a neutral canonical projection that
  does not apply aggressive personalised suppression** to the unresolved item (defined deterministically in the
  implementation contract).
- **Event→cluster mapping failure.** A universal event must **not silently disappear** because cluster mapping
  fails; **do not invent a cluster relationship.** Preserve it through an **honest event-native/fallback
  representation** (or equivalent canonical mechanism) until mapping is available.
- **Unpersonalised behaviour.** Preserve existing unpersonalised behaviour **except where correction is
  required** to satisfy the universal-materiality invariant. **Do not promise byte-for-byte ordering** if the
  existing order violates the new canonical floor.
- **Rollback.** Rollback **may never restore the known-unsafe personalised-suppression path.** A safe rollback
  **disables/reduces personalisation or falls back to a canonical non-personalised market projection**, while
  retaining universal-materiality safety.

This policy is the RD-5 contract that **Wave 0 implements/calibrates** and **Wave 1 enforces**.

**Remaining decisions (RD-1…RD-4 are roadmap/engineering; RD-5 is now LOCKED above):**
- **RD-1 — Brief/graph computation location (resolves the L-5 open implementation choice).** Server endpoint,
  deterministic shared package, dedicated service, or hybrid — needed **before Wave 7**. *(Architecture permits
  any; engineering choice.)*
- **RD-2 — Structured earnings + macro-calendar data.** Whether/when to acquire — needed for full Wave 6/7
  depth; not a vendor lock-in. **[BUILD-data decision]**
- **RD-3 — Ledger enablement timing & ownership.** Who confirms durability (Wave 2) and enables the first
  prediction type via **Wave 2b**, and when — a safety/durability-gated ops decision, never enabled to satisfy
  the roadmap; **Wave 10 stays calibration/time-gated.**
- **RD-4 — Confirm the wave order and that Wave 1 (after Wave 0/RD-5) is first.**
- **RD-5 — LOCKED (§10.18a).** The universal-materiality **membership policy** is founder-locked; Wave 0
  implements/calibrates the contract, Wave 1 enforces it. No longer open.

### 10.19 Proposed post-closure working process

The founder's loop is sound; pressure-tested with four additions (in **bold**):

> Architecture **locked** → select next approved wave → Claude audits the exact affected code → Claude writes a
> narrow implementation plan **(with exit criteria + rollback flag)** → founder/ChatGPT review → **apply this
> wave's queued canon amendments (§10.9)** → implement **behind a flag** → Codex independent review → fix
> findings → Codex PASS → commit → push/deploy → **production verification (§10.8 VERIFY where relevant)** →
> next wave.

**The load-bearing guardrail (the whole point of Chapter 10):** *if a wave uncovers a genuine architecture
gap, STOP and return to the document as a founder decision — never improvise architecture inside a coding
session.* This is what stops the "repeatedly redesigning architecture while coding" failure. Architecture
changes are document changes, gated; code waves consume locked architecture.

### 10.20 First implementation wave recommendation (S)

**Recommended first *implementation* wave is Wave 0 (build/calibrate the founder-locked RD-5 membership
contract); the first *enforcement* wave is Wave 1 (whole-pipeline floor + truth-boundary lock).** RD-5 is now
locked (§10.18a), so the prerequisite is resolved as a **build**, not an open decision.

- **Why it comes first.** It fixes a currently-occurring correctness defect — today a user who sets
  preferences can have off-preference intelligence ranked negative and dropped, and the Feed page does not even
  pass the admitted `events[]` to cluster ranking. Those `events[]` **carry the existing canonical scoring/
  evidence inputs (e.g. `editorial_score`) that Wave 0 will extend into the universal-membership contract; the
  membership signal itself does not exist yet.** It is the **safety precondition**
  for every later personalisation wave (never learn on a stream that can suppress systemic events), and it is
  independently reviewable and committable. It delivers a real, if quiet, trust win immediately.
- **The prerequisite is Wave 0 (RD-5 is now LOCKED, §10.18a).** Wave 1 is **not** a pure frontend "route the
  existing floor in" change. `EventScore` is a **scoring foundation, not the universal-materiality membership
  contract**; admission (`score≥10` + qualified source) ≠ membership. **Wave 0 builds and calibrates the
  founder-locked RD-5 membership contract** (a deterministic, recorded-evidence, decomposable, versioned
  signal extending EventScore — **no second, no LLM, no frontend score**) against the RD-5 **calibration/
  acceptance contract**, and provides the **event→cluster carry** so membership reaches cluster ranking. Wave 1
  then enforces it.
- **Exact dependency it resolves.** *Safe personalisation requires the universal floor first* — the top gate on
  the §10.11 personalisation branch — converting Ch9 UI-3 from doctrine into a live, whole-pipeline guarantee
  and unblocking Waves 7–8.
- **Expected files/systems affected.** The RD-5 membership signal (extending `app/events.py` EventScore) + the
  **event→cluster mapping**; `frontend/src/lib/feedRanker.ts` (a non-suppressible gate spanning **preference
  ranking → `passesQualityGate` → `capEventDominance` → final ceiling/slice → ordering → lead position**);
  `frontend/src/app/feed/page.tsx` (which must **provide `events[]`/membership to ranking**). Consume the
  signal, **never recompute or invent a second score.** A config flag guards rollback.
- **The overflow/ceiling interaction (per §10.18a — must not imply an unlimited Feed).** The ceiling stays
  bounded; when universal members exceed it, rank the universal set **deterministically via the canonical
  materiality authority** and show the highest-materiality members that fit — **a personalised item never
  displaces a higher-ranked universal member**, and the Feed never grows unbounded (the Brief may signal an
  unusually material session). **Missing signal:** fail to a neutral canonical projection (no aggressive
  suppression; never fabricate membership). **Mapping failure:** preserve via an honest event-native/fallback
  representation (never invent a cluster).
- **Expected user-visible impact.** A technology-focused user still gets highly relevant tech intelligence, but
  a major inflation shock, central-bank surprise, liquidity event, or geopolitical escalation **now breaks
  through the entire pipeline** rather than surviving ranking only to be culled by the dominance cap or ceiling.
- **Risks.** Over-broad membership (too much off-thesis content) — mitigated by tuning the RD-5 threshold
  against the **existing** EventScore, **not** new personalisation weights (UI-13), and by the flag. Ranking/
  ceiling parity regressions — mitigated by golden/regression tests across the full pipeline.
- **Validation (edge semantics — Codex Blocker 2).** Tests asserting a **universal-member event** survives max
  preference penalty, the quality gate, the event-dominance cap, and the final ceiling, and appears in required
  lead position; plus: **universal count > ceiling** (deterministic universal ranking, bounded feed); **multiple
  universal members** deterministically ordered; **absent `events[]`**; **universal event with no matching
  cluster** (event-native fallback); **duplicate event→cluster mapping**; **dominance-cap collisions** between
  universal events; **unpersonalised order conflicting with universal lead**; and **safe rollback** (never
  restores the unsafe suppression path). Ordinary personalised ordering otherwise unchanged.
- **Explicit non-goals.** No behavioural tracking; no ranking-weight tuning beyond the RD-5 membership
  calibration; **no second importance score**; no Feed visual redesign; no UIP work (Wave 8). **Canon:** apply
  **DA-1 + DA-2** with Wave 1 (it *is* the personalisation-boundary + floor contract). *(This is the
  recommendation and its shape — **not** the implementation prompt, which is written only after closure is
  approved and the wave is selected; RD-5 is already locked.)*

*End of Chapter 10 (drafted — **second (final) Codex correction pass applied; RD-5 founder-locked**). This
pass: locked the **RD-5 universal-materiality policy** (§10.18a) — definition, mandatory-consideration ≠
membership, allowed evidence inputs, LLM-explain-not-author, auditability + policy-version recording, a
**calibration/acceptance contract instead of a magic number**, bounded-overflow, missing-signal, mapping-
failure, unpersonalised, and safe-rollback rules; split Wave 0 (build/calibrate membership) from Wave 1
(enforce whole-pipeline) with full **edge-semantics tests**; added an **owned Wave 2c + EA-1** for event-
consumer UID convergence and **split Wave 3 into 3a (standing-entity FIND) / 3b (event FIND on durable uid)**;
corrected **BA-1 to precede Wave 3a and Wave 7**; added a **Wave 3a directory/data prerequisite**; made **Wave
2b state-preserving** (inventory→preserve→idempotent-enable); made **Wave 4 remove** manufactured probability
(not relabel); corrected **Wave 7 validation** to one-canonical-composition + web projection (no cross-client
parity while one client exists); and swept remaining **stale EventScore/floor/deployment claims** (no "floor
already exists / just routing / low-risk / no gate"; deployment states are VERIFY). Architecture direction and
Wave-0→Wave-1-first priority preserved. **No product code changed; no schema or migration created or run; no
production config changed; no gated feature enabled; the Prediction Ledger was not enabled/disabled; no
behavioural tracking; no personalisation weights chosen; the Network Design Bible was not modified; no
AA/BA/CA/DA/EA amendment applied; no commit; no push.** All queued amendments remain flagged. Implementation
begins only after closure is approved and a wave is selected. Chapter 10 does not start implementation.*
