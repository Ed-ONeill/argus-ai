# ARGUS PRODUCT INTELLIGENCE ARCHITECTURE V1

**Status: CANONICAL MASTER ARCHITECTURE.** This document defines what Argus
fundamentally is at the product level: how every piece of market information flows
through the system, and what each surface exists to do. It sits above the engineering
specifications and beside the Design Bible. When a feature proposal, surface change, or
pipeline modification conflicts with this document, the conflict is resolved explicitly
— by changing the work or amending this document by versioned decision. Nothing drifts
silently.

Relationship to existing canon: the Design Bible (ARGUS_INTELLIGENCE_NETWORK_V2.md)
owns identity, visual language, and interaction; ARGUS_INTELLIGENCE_MODEL_V1.md owns
the ontology and vocabulary; ARGUS_INSTITUTIONAL_MEMORY_V2.md owns the memory doctrine;
ARGUS_INTELLIGENCE_SURFACES_V1.md's pipeline rule and ownership registry are subsumed
and superseded where this document is more specific. This document owns **information
flow and surface responsibility.**

---

## 1. WHAT ARGUS IS

> **Argus is an institutional market reasoning system.** It continuously **constructs**
> a model of market structure from evidence, **maintains** that model with
> institutional memory, **tests** it on the record through predictions and outcomes,
> and **explains** it in structure and language a professional can interrogate.
>
> **"Argus exists to transform market complexity into institutional understanding."**

The consequence that drives this entire document: **Argus has exactly one
understanding of the market at any moment, and every surface is a window onto it.**
No page computes its own truth. No widget holds a private opinion. Information enters
once, is reasoned over once, is remembered once — and is then *viewed* from many
perspectives. A dashboard is many small products in boxes; Argus is one product seen
through many windows. This is the difference the architecture exists to protect.

## 2. THE SPINE — ONE PIPELINE, SIX STAGES

Every piece of market information, regardless of type or source, passes through the
same six cognitive stages. No stage may be skipped; no surface may inject meaning
mid-stream; nothing reaches a screen without a position in this sequence.

| Stage | Question answered | What happens | System of record |
|---|---|---|---|
| **1 · Observe** | What was published? | ingestion from tiered sources; classification (event vs opinion, promo suppression); entity extraction | feed pipeline, processed cache |
| **2 · Corroborate** | Is this one event or one article? | clustering into story events; source counting; cross-source confirmation | story clusters |
| **3 · Interpret** | What does it mean for the model? | theme extraction against the curated ontology; conviction, breadth, momentum; graph provisioning; narrative derivation | theme intelligence, canonical graph, DerivedNarratives |
| **4 · Remember** | How does this change what we know? | ThemeMemory accrual; sealed daily snapshots (entities, narratives, relationships); transition events | institutional archive (M3.1–M3.2) |
| **5 · Test** | What do we now expect — and were we right? | structural prediction issuance under admission rules; daily resolution against sealed records; calibration behind credibility gates | prediction & outcome ledger (M3.3) |
| **6 · Explain** | How is this shown and defended? | reads, dossiers, chains, historical context — projections of stages 3–5, never new computation | the surfaces (this document, §4) |

**The pipeline rule (binding):** meaning is created only in stages 3–5, by canonical
engines, once. Stage 6 *projects*. A surface that computes market meaning locally is an
architecture violation regardless of how useful the result is — it reintroduces the
split-brain this architecture eliminated.

**Importance is scored once, at the spine.** An event's weight is a deterministic
composition of: source tier (institutional wire > trade press > aggregator), event
classification (events outrank articles; opinion and SEO content is suppressed),
corroboration (multi-source clusters outrank single-source), theme gating (on-thesis
stories outrank off-thesis regardless of recency), and institutional score (the
composite the ranker consumes). Surfaces may *re-order for a person* (§5.3); they may
never *re-score for the market*.

## 3. THE EVENT TAXONOMY — HOW EACH KIND OF INFORMATION FLOWS

The routing matrix, then the reasoning per type. ● = always, ○ = when thresholds/
conditions met, — = never. "Network" means the canonical graph and therefore the
Intelligence Network surface; "Memory" means the sealed institutional archive;
"Predict" means the structural prediction ledger; "Alert" is defined in §3.11.

| Event type | Feed story | Markets | Company page | Network | Memory | Predict | Alert |
|---|---|---|---|---|---|---|---|
| Corroborated market story | ● | ○ | ○ | ○ | ● (as evidence) | — | — |
| Earnings / guidance event | ● | ○ | ● | ○ | ● (as evidence) | — | ○ |
| Macro release / policy event | ● | ● | — | ○ | ● (as evidence) | — | ○ |
| Geopolitical event | ● | ● | ○ | ○ | ● (as evidence) | — | ○ |
| Price / market move | ○ | ● | ● | — (until recorded) | — (until sourced) | — | ○ |
| M&A transaction event | ● | ○ | ● | ○ | ● | — | ○ |
| Private-markets event | ○ | — | ○ | ○ | ● | — | — |
| Conversation episode (Listen) | ○ | — | ○ | — (evidence only) | ● (as evidence) | — | — |
| Opinion / analysis piece | suppressed | — | — | — | — | — | — |
| **Theme transition** (internal) | ○ | ● | ○ | ● | ● (it *is* memory) | ○ | ● |
| **Narrative emergence/dissolution** (internal) | ○ | ● | — | ● | ● | ○ | ● |
| **Relationship change** (internal) | — | ○ | ○ | ● | ● | ○ | ● |
| **Prediction resolution** (internal) | ○ | — | ○ | ● (Seal beat) | ● | (is one) | ● |
| **Memory milestone** (gates passing) | — | — | — | ● (maturity states) | ● | — | ○ |

### 3.1 Corroborated market stories
**Origin:** tiered external sources, stage 1–2. **Scoring:** the spine composite (§2).
**Flow:** becomes a Feed story when it survives classification and ranking; updates
Markets only through the themes it feeds (never directly); attaches to Company pages
via extracted entities; reaches the Network only *through* stage 3 — a story never adds
a node, it adds **evidence** that may move conviction, breadth, or relationships;
enters Memory as evidence references on the themes it confirmed or contradicted. A
story is an input to understanding, never understanding itself.

### 3.2 Earnings and guidance events
The highest-privilege company-scoped external event. Always a Feed story; always
lands on the Company Intelligence page as a dated, sourced event; moves Markets and
the Network only through theme interpretation (a beat that confirms an active thesis
matters; one that confirms nothing is just a company fact). Alert-eligible only when
it *changes recorded state* — a guidance event that flips a theme's direction is
alertable; the earnings item itself is not.

### 3.3 Macro releases and policy events
The raw material of drivers. Always Feed; always Markets (regime inputs); never a
Company page item directly (their company impact arrives via transmission, which is
the Network's job to show). They shift the Network by re-weighting driver→theme
transmission in stage 3, and are remembered as evidence on the themes they moved.

### 3.4 Price and market moves
**Honesty boundary:** Argus currently has no institutional-grade price feed. Price
moves therefore update Markets' live displays and Company pages where reliable data
exists, are Feed-eligible only when they *are* the story (a dislocation, not a tick),
and are **excluded from Memory and Prediction resolution until a canonical price
source with explicit measurement rules exists** (the M3.3 rule). No surface may imply
Argus remembers or predicts prices before that day. When a price source is
canonicalized, this section is amended by version — not worked around.

### 3.5 M&A transaction events
Facts-first doctrine (the M&A page's existing law): extracted deal facts or blank,
never inferred facts. A deal is a Feed story, a permanent Company-page event for both
parties, a Network change where it alters recorded relationships, and a Memory write
(deals are exactly the kind of thing an institution remembers). Deal *speculation* is
an opinion piece (§3.9) until corroborated.

### 3.6 Private-markets events
Fund closes, commitments, secondaries. Feed-eligible when they cross the general
importance bar; otherwise they accrue to the Private Markets surface and to Memory.
Their Network presence is through the capital-flow relationships they record.

### 3.7 Conversation episodes (Listen)
Podcasts and long-form conversation are **evidence density, not events**: an episode
discussing a theme raises that theme's conversational confirmation and appears on
Listen; it never creates structure by itself. Feed-eligible only for genuine news made
*in* a conversation (rare, and then it is a story, not an episode).

### 3.8 Analyst notes and opinion pieces
Classified and suppressed at stage 1 (the events-not-articles doctrine). Opinions are
not events; they may never move conviction, create Feed stories, or touch Memory. The
only path an opinion has into Argus is if the *fact it reports* is corroborated
elsewhere — at which point the fact flows, not the opinion.

### 3.9 Internal cognition events — Argus as its own source
The architecture's most important idea: **stages 4 and 5 emit events too.** A theme
crossing a conviction threshold, a narrative dissolving, a relationship strengthening,
a prediction resolving, a credibility gate passing — these are first-class events with
provenance (the sealed records that produced them), and they outrank most external
news for a professional user, because they are *changes in understanding*, not changes
in headlines. They flow: to the Feed as "what changed" items (clearly marked as
Argus-derived); to Markets and the Network as state; to Memory trivially (they are
memory); to the ledger where they trigger issuance or resolution; and they are the
**only source of alerts** (§3.11).

### 3.10 Prediction resolutions
A resolution is the accountability moment. It updates the ledger (stage 5), lands on
the Network as the Seal beat (the one sacred motion), appears on the subject's Company
or Theme page as record, is Feed-eligible ("Argus expected persistence; the
relationship held / lapsed — on the record"), and always alerts users following the
subject. Resolutions are never buried, especially the wrong ones — accountability
outranks narrative pride (Design Bible 4B.4).

### 3.11 Alerts — the doctrine (system not yet built; the rules are set now)
Alerts derive **exclusively from internal cognition events crossing pre-registered
thresholds** — never from raw news volume, never from price ticks, never from anything
Argus has not already reasoned over. An alert is Argus saying *"my understanding
changed in a way you told me you care about."* Consequences: every alert carries its
provenance chain one tap deep; alert thresholds are the same canonical thresholds the
transition engines use (no per-user redefinition of market truth — users choose
*which* events, never *what counts* as an event); and the quiet-day rule is absolute —
a system that can send zero alerts on an unchanged day is a system whose alerts mean
something. Until the alert system ships, nothing on any surface may simulate one.

## 4. THE SURFACES — ONE RESPONSIBILITY EACH

Every surface answers exactly one question about the single understanding. A surface
that answers two questions is two surfaces; a question no surface answers is a gap in
this table, not a license for a widget.

### 4.1 Feed — *"What is happening right now, ranked by what we believe?"*
The stream perspective. Consumes stages 2–3 (ranked story events) plus internal
cognition events; leads with the Intelligence Network instrument as its masthead
because the stream only makes sense against the standing model. Owns: story ranking
presentation, the reading flow, focus filtering. Must never: re-score importance,
synthesize its own thesis (it voices The Read), or surface uncorroborated items above
corroborated ones for engagement. Hands off to: everything (the Feed is the front
door, not the destination).

### 4.2 Markets — *"What kind of market is this?"*
The regime perspective. Consumes stage 3–4 aggregates: regime, sector leadership,
rotation, breadth, theme leaderboards, market context. Owns: regime presentation and
cross-sector comparison. Must never: tell company stories (that is Company
Intelligence) or maintain its own theme rankings apart from canonical conviction.

### 4.3 Intelligence Network — *"What is the understanding itself?"*
The operating system (Design Bible Part 0). The one surface that shows the model
*as a structure*: entities, transmission, conviction, provenance, memory, and
accountability in one instrument. Owns: the visual reasoning experience, the dossier,
focus/selection as the product-wide lens. Must never: compute meaning (it is the
purest projection), display an estimate where a gated state exists, or become a page
among pages — every other surface deep-links into it, and its selection grammar is the
product's navigation spine.

### 4.4 Company Intelligence — *"What do we know about this specific entity?"*
The terminal-expression dossier: identity, exposures (which theses transmit into it
and in which direction), dated event history, relationships, memory (first seen,
persistence), predictions and outcomes naming it. Owns: the per-entity accumulation of
everything the spine has routed to that entity. Must never: carry unsourced
fundamentals, price-derived claims beyond the honesty boundary (§3.4), or entity-local
"analysis" not present in the canonical model.

### 4.5 Themes — *"What is the standing thesis, and how has it aged?"*
The dossier of one thesis over time: conviction trajectory, evidence trail,
contradictions, lifecycle, memory maturity, historical context (gated), predictions
and their outcomes. The long-form of the Network's Entity Focus. Owns: the deep
single-thesis read. Must never: blend member convictions into narrative-level numbers,
or show analog content below the credibility gates.

### 4.6 M&A — *"What do transactions tell us about the model?"*
The transaction lens. Owns: deal facts (extracted-or-blank), deal-derived transmission,
deal timelines. Must never: speculate parties or terms, or maintain a second graph
grammar (its network migrates to the canonical grammar per the Bible's evolution path).

### 4.7 Private Markets — *"How is private capital flowing through the same structure?"*
The capital-flow lens over the same ontology. Owns: fund/commitment/stage flow
presentation. Must never: invent liquidity or mark-to-model values Argus does not have.

### 4.8 Listen — *"What is the market talking about, as evidence?"*
The conversation lens: episodes as evidence density on themes, most-discussed as a
confirmation signal. Owns: conversational evidence presentation and playback. Must
never: present discussion volume as conviction (talk is corroboration at low weight,
never thesis).

### 4.9 Saved — *"What has this person chosen to keep?"*
The personal shelf — the one surface whose truth is per-user. Owns: saves, follows,
personal organization. Must never: leak into institutional records (no personal signal
may alter market-global state — the M3 firewall), or be confused with memory: Saved is
what *you* kept; Memory is what *Argus* knows.

## 5. THE NON-NEGOTIABLES

1. **One understanding, many windows.** Every surface projects the same canonical
   model. Two surfaces disagreeing is a severity-one defect, not a styling issue.
2. **The pipeline rule.** Meaning is computed in stages 3–5 only, once. Surfaces
   project.
3. **Personalization ranks; it never rewrites.** A user's preferences may re-order
   what they see first; they may never alter a conviction, a verdict, a threshold, or
   any stored value. Ordering is the entire personalization surface area.
4. **Provenance is load-bearing.** Recorded and derived are visually and verbally
   distinct everywhere; every figure traces to a record; ink that cannot answer for
   itself is not printed (no dead ink).
5. **Absence is data.** Gated, immature, unreachable, and empty states are designed
   first-class answers. Nothing is estimated into a gap, on any surface, ever.
6. **Accountability outranks narrative pride.** Resolved predictions — especially
   contradicted ones — surface with at least the prominence of the theses they tested.
7. **The quiet-day rule.** When little changed, Argus says so. No surface manufactures
   urgency; no alert fires without a recorded state change.
8. **Identity gates from the Bible apply to every surface:** the Five Second Test, the
   anti-pattern question ("does this increase institutional understanding?"), and the
   morning-meeting copy test are architecture requirements, not visual preferences.

## 6. GOVERNANCE

This is V1.0 of the master architecture. Amendments follow the Design Bible's model:
V1.x for routing changes, new event types, or new surfaces (each logged below); a
fundamental change to the spine or to §5 requires V2.0. Every new feature proposal
must answer, in writing, three questions before implementation: *which stage of the
spine does it extend, which single surface does it belong to, and which rows of the
routing matrix does it touch?* A proposal that cannot answer all three is not ready.

**Amendment log**

| Version | Date | Change |
|---|---|---|
| V1.0 | 2026-07-16 | First approved master architecture: the spine, the event taxonomy and routing matrix, surface responsibilities, non-negotiables. |

---

*Related canon: ARGUS_INTELLIGENCE_NETWORK_V2.md (identity, design, interaction),
ARGUS_INTELLIGENCE_MODEL_V1.md (ontology), ARGUS_INSTITUTIONAL_MEMORY_V2.md (memory),
ARGUS_PREDICTION_OUTCOME_LEDGER_V1.md (accountability),
ARGUS_INTELLIGENCE_SURFACES_V1.md (superseded where this document is more specific).*
