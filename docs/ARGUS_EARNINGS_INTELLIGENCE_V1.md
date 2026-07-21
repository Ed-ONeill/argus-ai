# ARGUS EARNINGS INTELLIGENCE V1 (M8.1)

**Status: CANONICAL GOVERNING SPECIFICATION — design only, no production code.** This
document defines how Argus permanently understands an earnings release. It extends
ARGUS_KNOWLEDGE_MODEL_V1 (two new first-class objects, O15 and O16), ARGUS_PRODUCT_
INTELLIGENCE_ARCHITECTURE_V1 (routing matrix detail for the earnings row), ARGUS_
INSTITUTIONAL_REASONING_ENGINE_V1 (an additional interpretation input to stages
R0–R5, not a competing reasoning path), ARGUS_ENTITY_INTELLIGENCE_V1 (the company
kind's Earnings and Management facets, upgraded from reserved-and-thin to
specified-and-gated), and ARGUS_FEED_EDITORIAL_STANDARD_V1 (unchanged — earnings
remains a class-weighted event; this document adds what rides beside it). Where this
document is silent, those five govern. Where it conflicts, it amends them explicitly,
logged in Part 9.

**What this document is not.** It is not a summarization spec. Summarizing an
earnings release produces a shorter version of the same disposable artifact. This
document produces the opposite: a permanent, structured, falsifiable record that
outlives the article, the quarter, and the person who read it — consistent with the
knowledge model's founding claim that Argus has exactly one understanding of the
market, sealed once, remembered forever.

---

## PART 0 — THE CENTRAL QUESTION AND WHY THIS IS THE HARD VERSION

**When a portfolio manager opens a company six months after earnings, what
institutional understanding should still remain?**

Not the article. Not the transcript. Not even the summary. What remains is: what
changed, what management said would happen, whether it happened, what themes that
release strengthened or weakened, and whether Argus's own predictions about this
company held up. Everything else — the headline, the beat/miss framing, the stock's
same-day reaction — is exactly the kind of information a research desk discards
within a week, because it was never institutional knowledge to begin with. It was
weather.

**What Bloomberg, AlphaSense, Tegus, and FactSet would build tomorrow:** better
transcript search, better NLP-tagged sentiment on the call, faster consensus-vs-actual
deltas, a chatbot over the filing corpus. All four are retrieval products with a
generation layer on top — they make yesterday's documents easier to search and easier
to summarize. None of them stake a claim. None of them remember whether what
management said in Q1 came true by Q3. None of them connect one company's earnings
release to the standing thesis of every other entity exposed to the same theme,
through a graph that already exists and already has conviction, evidence, and
memory attached to it.

**What Argus can build that they structurally cannot, without becoming a different
company:** an earnings engine that (1) writes every extracted fact into the *same*
graph that already carries themes, drivers, industries, relationships, and
predictions — so an earnings release doesn't just update a company file, it updates
the market model; (2) treats management's own stated guidance as a falsifiable claim
and scores it against the outcome the same way it scores its own predictions —
say-do accountability applied to the subject, not just to Argus; and (3) accretes a
Management Intelligence record that remembers what a management team said last time,
automatically, forever, without a human re-reading four quarters of transcripts to
notice the emphasis shifted. Bloomberg has the documents. Argus has the *model* the
documents update. This document specifies how an earnings release becomes structure
in that model rather than a well-summarized dead end.

The honesty doctrine binds throughout: every field below either has a source Argus
can cite today, or it ships `gated` with the exact missing source named (Part 8). No
field is filled with inference to look complete. A short honest record beats a full
fabricated one, exactly as it does everywhere else in the product.

---

## PART 1 — THE CANONICAL EARNINGS OBJECT

Two new first-class objects are admitted to ARGUS_KNOWLEDGE_MODEL_V1 by this
document, following the nine-clause law of Part 2 of that document. Both are logged
as amendments in Part 9.

### O15 · EARNINGS RECORD — *stratum S, mutable-until-sealed*

- **Purpose.** The structured, permanent extraction of one company's one reporting
  period: what changed, why, what guidance moved, and what it means for the model —
  as facts and attributed statements, never as narrated summary. It is the object
  that makes an earnings release *legible to the graph* instead of legible only to a
  reader.
- **Lifecycle.** `pending` does not exist — an Earnings Record is never pre-created
  from a calendar guess (that would be inventing data). It is minted the moment the
  first earnings-class Market Event names a company and a `reporting_period`
  (`app/companies.py` resolver + the existing explicit-only period identity, Feed
  Editorial Standard V1.2) → `accreting` while further evidence for the same
  company+period arrives (the transcript posted a day later, the 10-Q filed a week
  later, folding by the existing near-duplicate rule) → `extraction_complete` when
  the document-kind quorum for its class is met (Part 2.4) or a fixed extraction
  window elapses (10 sessions), whichever first — a record that never reaches quorum
  seals anyway, honestly incomplete, never held open indefinitely → sealed into an
  **EarningsSnapshot** (a new Memory Record subtype, Part 5) at the next daily
  boundary after reaching `extraction_complete`. Post-seal, new evidence (a delayed
  filing) appends a correction record under the same natural key; the sealed
  snapshot is never rewritten (K4).
- **Identity.** `earnings:{company_uid}:{reporting_period}` — e.g.
  `earnings:company:ticker:VRT:2026-Q2`. Natural key, immutable once minted, in the
  style of `deal:ma:` and snapshot natural keys. **[decision]** This document reserves
  the `earnings:` namespace in the identity registry (ARGUS_KNOWLEDGE_MODEL_V1 §O12).
  Un-perioded earnings evidence (a company reports without a stated period Argus can
  parse) never mints a record — it remains MarketEvent-only evidence, exactly as
  Company Intelligence Part 10 already specifies for un-perioded events.
- **Source of truth.** A new interpretation-stage module (conceptually
  `app/earnings_intelligence.py`, stage 3, siblings with `app/themes.py`), run when an
  earnings-class Market Event folds or when new evidence attaches to an existing
  company+period key.
- **Created by.** The earnings extraction engine, and only from evidence already
  admitted by the Wire desk (stages 1–2) — it mints no evidence of its own kind that
  the spine has not already classified as `sec_filing / transcript / ir_release /
  news`.
- **Modified by.** Only the earnings extraction engine, and only additively before
  sealing: fields fill in as documents arrive; nothing already extracted is
  retracted, only superseded by a dated correction (mirroring O2 Evidence's
  write-once law).
- **Rendered by.** Entity Intelligence (Company Intelligence Part 10, upgraded by
  this document, Part 6), Feed (as the raw event *and*, separately, as the
  understanding-changed items it triggers, Part 7), Network (through the Theme/
  Relationship deltas it writes — an Earnings Record is never itself a graph node,
  exactly as a Market Event is never a graph node, O1's rule extended verbatim).
- **May reference.** Its source Market Events (`source_event_ids[]`), its company UID,
  the Themes/Relationships/Drivers/Industries its evidence moved, its Evidence items
  (typed by document kind), the Management Intelligence Records its attributed
  statements feed, and — as a scope key the same way a Relationship is — any
  Prediction that names it.
- **Relationship to Market Events.** An Earnings Record is downstream of one or more
  earnings-class Market Events (O1); it never replaces them. The Market Event stays
  the Feed-ranked, decay-clocked, admission-floored citizen the editorial standard
  already governs unchanged. The Earnings Record is the *interpretation* layered on
  top, the same relationship a Theme has to the events that evidence it.
- **Relationship to Entity Intelligence.** It is the source engine for the company
  kind's Earnings Intelligence facet (Company Intelligence Part 10) and a
  contributing evidence source for the Management Intelligence facet (Part 12). It
  mints no new UI section by itself — it fills the reserved slots those sections
  already have.
- **Relationship to Institutional Memory.** It seals into an EarningsSnapshot at
  period close (Part 5); its Tier-3 classifications (Part 2.3) seal as marked-derived
  payload, never as recorded fact; it emits TransitionEvents when it moves recorded
  state (Part 5.2).
- **Relationship to Predictions.** It never issues predictions itself — issuance stays
  with the ledger under its own admission rules (O13). It is a **stakes subject**:
  the Reasoning Engine's R5 stage reports which open predictions name this company,
  its themes, or its relationships when explaining this record (Part 4.5), and its
  guidance deltas are the natural future admission candidate for a new prediction
  type (Part 4.5, Part 9 — not built at V1).
- **Never.** Never a graph node; never carries a probability, a price target, a
  consensus figure, or a beat/miss framing (the honesty boundary, restated); never
  infers a reporting period from a date; never blends its Tier-1/2/3 fields into one
  undifferentiated "insight"; never rewritten after sealing; never renders where its
  source documents are absent (an Earnings Record with zero qualifying evidence does
  not exist — it is a Market Event, nothing more, until evidence arrives).

### O16 · MANAGEMENT INTELLIGENCE RECORD — *stratum M, derived, append-only*

- **Purpose.** The permanent, per-company, per-topic ledger of what management has
  said across calls — the object that lets Argus notice a talking point recurring,
  fading, gaining emphasis, or contradicting itself, without a human re-reading a
  year of transcripts. It is memory *of a pattern*, not of a single quarter.
- **Lifecycle.** Minted the first time an attributed management statement (Part 2.3)
  classifies against a curated topic for a company that has no existing record for
  that topic → accretes one dated entry per Earnings Record that produces a
  classified statement on the topic → each entry is append-only (K4); the record's
  *trend fields* (recurrence, emphasis direction, last-mentioned gap) are recomputed
  each time an entry appends, never stored as a separately-editable opinion — they
  are always a live query over the entry list, exactly as O6 Theme's
  `first_seen`/`persistence` are queries over snapshots, never stored cumulative
  fields. Never retired; a topic that stops being mentioned is itself the signal
  (Part 3.3), not a reason to delete the record.
- **Identity.** `management:{company_uid}:{topic}` where `topic` is a key in the
  curated **management topic ontology** (Part 3.1) — a closed vocabulary, admitted by
  curation the same way theme and driver ontologies are, never a freeform label an
  extraction pass invents on the fly.
- **Source of truth.** The Management Intelligence accretion job (stage 3/4
  boundary — it runs as an interpretation step but writes append-only history, so it
  is memory-adjacent like ThemeMemory), consuming Earnings Records' Tier-2/3 fields
  only.
- **Created by / modified by.** The accretion job only, and only by appending dated
  entries. No entry is ever edited or deleted; a misclassification is corrected by a
  superseding entry that references the one it corrects, never by silent removal —
  the same discipline O2 Evidence uses for weakening evidence.
- **Rendered by.** Entity Intelligence (Company Intelligence Part 12, upgraded, Part 6
  of this document), Theme dossiers (Contradiction Ledger facet, when a management
  statement contradicts a theme's standing thesis, Part 4.4).
- **May reference.** Its company UID, its topic, the Earnings Records each entry
  derives from, the source quote's Evidence item, and — for track-record entries —
  the sealed record that confirmed or contradicted a prior statement.
- **Never.** Never a sentiment score; never a tone claim ("management sounded
  confident") — the Company Intelligence Part 12 ban is restated and extended
  verbatim to this object; never a freeform topic string; never blends multiple
  speakers' statements into one company-level view without listing each speaker;
  never infers a talking point from silence alone without a defined comparison window
  (Part 3.3); never computed from anything but sealed Earnings Records.

### Reference matrix additions (ARGUS_KNOWLEDGE_MODEL_V1 §3.4)

| holds ↓ refs → | Event | Evidence | Company | Theme | Driver | Industry | Relationship | Memory | Prediction | Earnings Record | Mgmt Intel Record |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Earnings Record (O15)** | ● (source events) | ● | ● (subject) | ● (moved) | ● (moved) | ● (moved) | ● (moved) | — | ● (scope) | — | ● (feeds) |
| **Management Intelligence Record (O16)** | — | ● (quotes) | ● (subject) | ● (contradiction target, when applicable) | — | — | — | — | — | ● (source) | — |
| **Memory Record (O11)** | (unchanged) | (unchanged) | (unchanged) | (unchanged) | (unchanged) | (unchanged) | (unchanged) | — | — | ● (seals) | ● (seals) |

Nothing in Stratum W or S references Stratum A (unchanged, restated): an Earnings
Record never cites a Prediction as if it were evidence.

---

## PART 2 — THE EXTRACTION MODEL

### 2.1 The governing discipline: three tiers, never blended

The brief asks for a long list of extracted knowledge — what changed, why, guidance,
assumptions, segments, confidence, capital allocation, risks, opportunities,
priorities, demand/supply/pricing signals, macro/industry/theme exposure. Every one
of these falls into exactly one of three tiers, and the tiers are never blended into
one undifferentiated "insight," on pain of repeating the Reasoning Engine's R1/R2
defect (LLM-minted meaning wearing recorded authority).

| Tier | What it is | How it is produced | Authority |
|---|---|---|---|
| **1 — Recorded fact** | Numbers and structured data literally present in a filing or a structured feed (revenue, segment revenue if tagged, guidance ranges, buyback authorization, headcount if disclosed) | Deterministic extraction against structured sources (XBRL tags, IR release tables); zero LLM | Recorded. Cited to the filing, quotable verbatim. |
| **2 — Attributed commentary** | A specific thing a named speaker (or "the company") said, in a transcript, filing, or IR release | Exact quotation or tight paraphrase, selected by deterministic or LLM-assisted retrieval — but the *content* rendered is never generated, only located and quoted, per Company Intelligence Part 12's attribution grammar | Recorded (the fact that they said it), attributed to a document + date + speaker. |
| **3 — Derived classification** | A label applied to a Tier-2 statement: which curated topic it belongs to, whether it reads as a change from a prior period, whether it is a demand/supply/pricing signal | May use LLM assistance for classification only, never for content generation | **Derived, marked, low-authority** — always rides beside its Tier-2 source, never replaces it, never gates conviction alone (Part 2.5) |

This mirrors the Reasoning Engine's law verbatim: "LLM prose has exactly one lawful
place... labeled voice riding NEXT to a deterministic explanation, never inside it
and never as it." Tier 3 is that lawful place. A reader must always be able to click
a Tier-3 tag and land on the exact Tier-2 quote it classifies, and the quote's exact
Tier-1 filing citation where one exists.

### 2.2 What Argus determines, mapped to tier and object

| Requested extraction | Tier | Lands as | V1 status |
|---|---|---|---|
| What changed (revenue, margin, headline figures) | 1 | `EarningsRecord.reported_metrics[]`, each with prior-period link | **gated** — requires structured filing ingestion (Part 8) |
| Why management says it changed | 2 | Attributed quote, classified (Tier 3) against the topic ontology | **gated** — requires transcript ingestion (Part 8) |
| What guidance changed | 1 | `EarningsRecord.guidance[]` — metric, prior stated value, new stated value, period, direction (`raised / cut / reiterated / withdrawn / initiated`), each linked to the prior period's guidance entry so the delta is a query, not a re-derivation | **gated** — requires guidance to be extracted from IR releases/transcripts, and a **guidance history table** that does not exist yet (Part 8) |
| What assumptions changed | 2+3 | Attributed statement of a stated assumption, classified `assumption`; compared to the prior period's `assumption`-classified entries for the same topic — a changed assumption is a Tier-3 *comparison*, always showing both quotes | **gated** |
| Which segments strengthened/weakened | 1 where a canonical segment taxonomy exists, else 2+3 | `EarningsRecord.segment_deltas[]` (Tier 1, requires per-company segment taxonomy, Part 8) or classified commentary tagged to the closest management topic (Tier 2+3, no fabricated segment structure) | **gated** — Argus has no canonical per-company segment taxonomy; V1 ships the honest fallback (classified commentary), never invents segment boundaries |
| Management confidence | — | **Reframed, not shipped as sentiment.** See Part 3.4 — track-record confidence only, never tone. | **gated**, and permanently excludes tone-based scoring by design, not by missing data |
| Capital allocation changes | 1+2 | Buyback/dividend/capex figures (Tier 1 where structured) plus classified commentary (Tier 2+3, topic = `capital_allocation`) | **gated** |
| Risks | 2+3, feeds existing `EntitySnapshot.risks[]` | Classified statements tagged `risk`, evidence-refed to the Earnings Record | **gated**; slot already reserved by O11/EntitySnapshot |
| Opportunities | 2+3, topic `opportunity` | Same mechanism as risks, opposite polarity | **gated** |
| Strategic priorities | 2+3, topic `strategic_priority` | Classified statements; recurrence across periods is the Management Intelligence signal (Part 3) | **gated** |
| Demand signals | 2+3, topic `demand` | Classified commentary; moves `exposed_to`/`supports` edge conviction when it corroborates a standing theme (Part 4.2) | **gated** |
| Supply signals | 2+3, topic `supply` | Same mechanism | **gated** |
| Pricing signals | 2+3, topic `pricing` | Same mechanism | **gated** |
| Macro exposure | 3, cross-referenced to Driver (O7) | Classified commentary linked to the curated macro factor it cites | **gated** |
| Industry exposure | 3, cross-referenced to Industry (O4) | Classified commentary linked to curated industry taxonomy | **gated** |
| Theme exposure | 3, cross-referenced to Theme (O6) | Classified commentary linked to ontology theme id; this is the highest-value mapping — it is the direct feed into Part 4 | **gated**, but the mechanism (curated ontology id as the join key) already exists and needs no new taxonomy |

Every "gated" row ships with the exact designed-absence copy pattern the rest of the
product uses (Company Intelligence Part 3E precedent): *"Guidance deltas require
transcript and IR-release ingestion Argus does not yet have. The slot is reserved;
nothing is simulated."* Nothing here is speculative work Argus does today — Part 8
names precisely what must land before each row activates.

### 2.3 The topic ontology (curation, not invention)

Tier-3 classification requires a closed vocabulary, exactly as theme/driver/sector
identity requires curation rather than freeform labels. This document proposes a
**management topic ontology** (`app/data/management_topic_ontology.py`, by analogy to
`theme_ontology.py`), seeded with: `demand`, `supply`, `pricing`, `margin_outlook`,
`capital_allocation`, `capex`, `hiring_headcount`, `supply_chain`, `regulatory`,
`competitive_position`, `m_and_a_appetite`, `risk`, `opportunity`,
`strategic_priority`, `assumption`, `macro_exposure:{driver_uid}`,
`industry_exposure:{industry_uid}`, `theme_exposure:{theme_uid}`. The last three are
parameterized topics that bind directly to existing O7/O4/O6 UIDs — classification
here *is* the extraction of macro/industry/theme exposure asked for above; no
separate mechanism is needed. A classification pass may only select from this closed
set; it may never mint a topic. New topics enter by curation amendment to this
document, the same discipline theme ontology admission already uses.

### 2.4 Document-kind quorum (when is a record "complete")

Reusing the four document kinds already in the model (`sec_filing / transcript /
ir_release / news`, O2), the quorum for `extraction_complete` is: at least one
`sec_filing` or `ir_release` (Tier-1 source) **and** at least one `transcript`
**or** the 10-session window elapsing first. A record that seals with only `news`
evidence is honestly labeled `commentary_only` — no Tier-1 or Tier-2 extraction was
possible, and the facet says so rather than pretending completeness.

### 2.5 The blending ban, stated once

No figure, tag, or claim produced by this engine may move a Theme's conviction, a
Relationship's status, or a Management Intelligence Record's trend fields **alone**
if it is Tier 3. A Tier-3 classification may only *contribute* alongside Tier-1/2
evidence, under the existing evidence-accrual rules (O2, O6) — this closes the loop
that would otherwise let an LLM's topic tag silently become market-moving fact.

---

## PART 3 — MANAGEMENT INTELLIGENCE

### 3.1 What "permanently updates" means, precisely

A Management Intelligence Record (O16) does not store a running score. It stores a
list of dated, evidence-refed entries. Everything the brief asks for — recurring
talking points, disappearing talking points, increasing/decreasing emphasis,
contradictions, consistency, leadership confidence — is a **query over that list**,
computed fresh each time it is read, never a cached opinion. This is the same
discipline O6 Theme already uses for `first_seen`/`persistence` and is chosen for
the same reason: cumulative fields drift; queries over sealed entries cannot.

### 3.2 Recurring and disappearing talking points

- **Recurring**: a topic with entries across ≥3 consecutive Earnings Records for the
  same company. Rendered with the full entry list — every quarter it appeared, its
  exact quote — never collapsed into a single synthesized "management has
  consistently emphasized X."
- **Disappearing**: a topic with entries in every one of the prior N periods and none
  in the current sealed period, where the current period's record reached
  `extraction_complete` with a `transcript` present (i.e., the absence is meaningful
  — management had the opportunity to raise it and did not — not a data gap). This
  mirrors O11's `theme_absent` discipline exactly: absence with a live writer is a
  genuine negative; absence without one is a data gap, never conflated.

### 3.3 Emphasis direction

Emphasis is **mention count and specificity per period**, not a sentiment score:
number of classified statements on the topic in the period, and whether each
statement is Tier 1-backed (a number was given) versus Tier 2-only (a qualitative
claim with no attached figure). "Increasing emphasis" = mention count and/or
Tier-1-backing rising period over period; "decreasing emphasis" = the reverse. Both
render as the literal counts and the entries behind them — the count is the whole
claim; there is no hidden weighting function to audit.

### 3.4 Confidence, reframed: track record, never tone

Company Intelligence Part 12 already bans tone claims ("management sounded
confident") and sentiment scores. This document does not weaken that ban — it
answers the brief's request for "management confidence" the only way the honesty
doctrine permits: **say-do accountability**, structurally identical to how Argus
scores its own predictions.

A Tier-1 or Tier-2 statement that constitutes a testable claim about the future
(explicit guidance, a stated capital-allocation plan, a stated timeline) is tracked
as an **implicit external claim**: recorded verbatim with its period and horizon,
and checked against the subsequent sealed Earnings Record the same horizon resolves
in. The verdict vocabulary is borrowed directly from O14 Outcome:
`confirmed | partially_confirmed | contradicted | unresolvable_data_gap`. A
company's "management confidence" is never a number Argus invents — it is the
visible, citable list of what management said would happen and what the next sealed
record shows actually happened, exactly as unglamorous and exactly as honest as the
prediction ledger is about Argus's own calls. This is deliberately the same
accountability instrument turned outward, and it is precisely the kind of thing a
retrieval-and-summarize competitor has no reason to build, because it requires
memory across periods and a willingness to show management being wrong — which no
vendor selling access to that management's IR relationship has an incentive to do.
Argus has no such conflict.

### 3.5 Contradictions

Two kinds, both additive per the Reasoning Engine's contradiction law (Part 6 of
that document, applied here verbatim):

1. **In-call contradiction**: two classified statements in the same Earnings Record
   oppose each other (e.g., a `demand`-topic statement claiming strength alongside a
   `guidance` cut on the same segment). Both render; neither is suppressed; the
   record is marked `contested` on that topic.
2. **Cross-period contradiction**: a statement in the current period opposes a
   statement classified on the same topic in a prior period, without an intervening
   event that would explain the reversal. Rendered as both quotes, dated, side by
   side — never resolved by picking a winner, per the reasoning engine's rule that
   self-contradiction is reportable, not adjudicated.

### 3.6 Consistency

The positive case of 3.5: a topic with the same directional claim across periods,
each entry corroborating the last. Rendered as the entry list; "consistent" is a
description of what the list shows, never a separate score.

---

## PART 4 — THEME TRANSMISSION

Earnings evidence never adds a graph node or a new relationship verb. It moves
conviction and status on **existing** O6/O7/O4/O10 objects, through the same
evidence-accrual law every other Market Event uses (O2, O6) — earnings simply
arrives as an unusually rich evidence source. Nothing here is a new mechanism; this
section states how the existing mechanism consumes the new extraction.

### 4.1 Which themes strengthened / weakened

A Tier-1 guidance raise or a Tier-2+3 demand/pricing/supply signal classified against
`theme_exposure:{theme_uid}` is evidence that may move that theme's conviction under
the existing rules (O6: "Modified by. Interpretation (state per cycle); ThemeMemory
(accrual)"). The direction follows the classified signal's polarity; the magnitude
follows the existing evidence-weight rules — an Earnings Record contributes no
special multiplier. A guidance cut on a segment tagged to a theme is opposition
evidence (R3's symmetric obligation, restated): it must be searched for and surfaced
with the same effort as confirming evidence, never omitted because the company
"beat."

### 4.2 Which narratives changed

Narratives (O8) are derived from theme membership and driver sets; they are never
written directly. An earnings-driven theme conviction move participates in the next
narrative derivation cycle exactly as any other theme conviction move does — no
earnings-specific narrative logic exists or should exist (the extension law, O8's
"Never: never carries a blended confidence," applies unchanged).

### 4.3 Which relationships changed

Segment-level commentary classified `supply` or naming a specific counterparty
(where the counterparty resolves to a company UID via the existing resolver) is
evidence on the relevant Relationship (O10) — a supplier or customer relationship's
`status` (`active | weakening | aged_out`) may move under existing rules. **Honesty
constraint, stated explicitly**: Argus has no canonical supplier/customer
relationship extraction engine today (Entity Intelligence V1 names
`relationship_exposure` attribution as "defined but never produced" for exactly this
reason). This document does not build one. Earnings commentary naming a supplier or
customer is captured as classified Tier-2/3 evidence attached to the Earnings
Record and rendered in the Management/Earnings facets; it moves a Relationship only
where one is already recorded by an existing engine. Inventing a supplier/customer
graph from earnings-call mentions alone would be exactly the fabrication this
document is bound to avoid.

### 4.4 Which industries, suppliers, customers, competitors are affected

- **Industries**: via `industry_exposure:{industry_uid}` classification — moves
  industry activation the same way any theme-linked event does (O4).
- **Suppliers / customers**: per 4.3, evidence-only until a relationship engine
  exists; never a fabricated edge.
- **Competitors**: a competitor named in commentary and resolved to a company UID is
  recorded as attributed evidence on *that* company's Earnings-adjacent record only
  if that company also reports — Argus does not synthesize a competitive-set graph
  from one side's commentary. Competitive-position commentary (`topic:
  competitive_position`) renders on the reporting company's own Management
  Intelligence facet, quoting the claim, never asserting it as fact about the named
  competitor.

### 4.5 Which predictions become more or less likely

No new mechanism: the Reasoning Engine's R5 (STAKE) stage already reports which open
predictions name a subject, its themes, or its relationships (O13's reference
rights). When explaining an Earnings Record, R5 looks up predictions scoped to the
company UID and to every theme/relationship the record's evidence touched — exactly
as it would for any other event. No probability is ever attached (the M3.3 rule,
unchanged); the output is the list of what is on the record, nothing more.

**Future admission candidate, not built at V1**: a `guidance_accuracy` prediction
type — "the metric guided to in period N lands within its stated range when period
N is sealed" — would extend the ledger's three existing types (O13) with a fourth,
using the guidance history this document proposes (Part 8) as its subject. This
requires a ledger amendment under O13's own admission rules and is named here as the
natural next step, not implemented.

---

## PART 5 — INSTITUTIONAL MEMORY: WHAT BECOMES PERMANENT

### 5.1 The separation, stated as a table

| Layer | Example | Permanent? | Why |
|---|---|---|---|
| The article / press coverage of earnings | "Vertiv beats on revenue" | **No.** Decays under the Feed's normal class half-life (12h) like any earnings-class event; persists only as an evidence reference on whatever it corroborated (O1's rule, unchanged) | It is weather, not knowledge — the events-not-articles doctrine applied to earnings specifically |
| Un-sealed (`accreting`) Earnings Record | mid-quorum extraction, fields still filling | **No, mutable.** Same status O11 gives the current UTC day's snapshot row | It has not finished accreting; sealing it early would be a false completeness claim |
| Tier-1 recorded facts | guidance figures, reported metrics | **Yes**, sealed into the EarningsSnapshot, cited to the filing forever | Recorded fact; no reason to forget it |
| Tier-2 attributed quotes | a named speaker's statement | **Yes**, sealed with the quote, speaker, document, date | The permanent record is exactly what was said and by whom — the whole point of institutional memory |
| Tier-3 classification tags | "this quote is topic `pricing`, read as a change from Q1" | **Yes, but marked derived and versioned.** Sealed alongside the quote it classifies, carrying `method` and a version stamp, so it is auditable and reproducible — never presented as fact independent of the quote | K6: derived content is marked to every renderer, forever, not just at read time |
| Management Intelligence trend computation (recurring/emphasis/contradiction) | "this is the 4th consecutive quarter this topic appeared" | **Yes as a query, not as a stored verdict.** The entries are permanent; the trend description is recomputed from them each time, so it can never drift from what the entries actually show | Same discipline as O6 `persistence` |
| The say-do track-record verdict (Part 3.4) | "management guided X in Q1; Q2's sealed record shows Y; contradicted" | **Yes**, permanently, at full visual weight, including when management was wrong | Accountability outranks narrative pride (architecture non-negotiable #6), applied to the subject as well as to Argus |

### 5.2 New Memory Record subtypes and TransitionEvent kinds

Two additions to ARGUS_INSTITUTIONAL_MEMORY_V2's record model (§2), following its
exact shape (natural key, `schema_version`, `writer`, `provenance`):

- **EarningsSnapshot** — `{earnings_uid}:sealed` natural key (one seal per record,
  not daily-cadence — an earnings period seals once, at `extraction_complete` + next
  boundary, not every day it sits open). Payload: the full Tier-1/2/3 field set from
  Part 2, `completeness` (`complete | commentary_only | partial_window_expired`),
  and `graph_version`.
- **ManagementIntelligenceSnapshot** — `{management_uid}:{as_of}:event` cadence,
  written each time an entry appends (not daily — the entry list itself is the
  history; the snapshot exists so downstream memory tooling has one shape for every
  archived object, per O11's uniform family).

`transition_event.kind` (ARGUS_INSTITUTIONAL_MEMORY_V2 §2.D) gains, by amendment:
`earnings_extraction_complete`, `guidance_raised`, `guidance_cut`,
`guidance_reiterated`, `guidance_withdrawn`, `management_topic_emerged`,
`management_topic_disappeared`, `management_emphasis_increased`,
`management_emphasis_decreased`, `management_contradiction_flagged`,
`management_claim_confirmed`, `management_claim_contradicted`. Each carries
`from_value`/`to_value` typed by kind and anchors to the sealing snapshots it
compares, exactly as every other transition kind already does.

### 5.3 What this buys the architecture's alert doctrine

Per Product Architecture §3.11 (unchanged, restated): none of the above are alerts by
themselves. `guidance_cut` and `management_claim_contradicted` are internal cognition
events (§3.9) — they become alert-eligible only insofar as they cross a
pre-registered threshold that also changes recorded theme/relationship state, the
same rule that already governs every other transition.

---

## PART 6 — ENTITY INTELLIGENCE INTEGRATION

### 6.1 Earnings Intelligence facet (Company Intelligence Part 10), upgraded

The existing facet already specifies the row identity (`reporting_period`), the
folded event, and the four document-kind presence marks. This document fills the
"what changed in the model afterwards" clause with the full Part 2 extraction,
gated field by field per §2.2's table, and adds:

- **Guidance sub-row**: prior stated value → new stated value → direction, linked
  across periods (`guidance:gated` until Part 8's guidance history exists).
- **Segment sub-row**: Tier-1 structured deltas where a segment taxonomy exists,
  else the honest classified-commentary fallback (§2.2), never a fabricated
  breakdown.
- **Theme/industry/driver exposure links**: every Tier-3 `theme_exposure` /
  `industry_exposure` / `macro_exposure` classification on this period's record
  renders as a deep link into that Theme/Industry/Driver's file — this is what
  makes an earnings release navigable *into* the model instead of read once and
  discarded.

### 6.2 Management Intelligence facet (Company Intelligence Part 12), upgraded

Part 12's attribution grammar (speaker, document, date, quote-or-paraphrase) is
unchanged and remains the entry-level law. This document adds the **accretion view**:
grouped by topic (the closed ontology, §2.3), each topic showing its full dated
entry list, its recurring/disappearing/emphasis computation (Part 3, always shown as
the entries plus the plain-language description of what they show — never a hidden
score), and its say-do track record where the topic contains a testable claim
(Part 3.4). The section's existing honest-absence behavior (most companies show
nothing until transcript ingestion lands) is unchanged — this document specifies
what fills the section the day it does, not a change to today's empty state.

### 6.3 Cross-link to the Theme file's Contradiction Ledger facet

Where a management statement contradicts a theme's standing thesis (Entity
Intelligence Part 4, theme kind's Contradiction Ledger facet), the contradiction
renders on **both** files: the company's Management Intelligence facet (as a
cross-period or in-call contradiction) and the theme's Contradiction Ledger (as
opposing evidence from a named company), each linking to the other. This is the
same "never a hidden contradiction" law (Reasoning Engine Part 8) applied across two
files instead of one.

### 6.4 What a buy-side analyst gets, concretely, six months later

Opening the company file: the Standing View still names which theses transmit into
this company and at what conviction (unchanged mechanism, richer evidence). The
Earnings Intelligence facet shows every reporting period since coverage began, each
with its guidance trail and theme links. The Management Intelligence facet shows,
per topic, exactly what this management team has said every quarter, whether they
followed through, and whether their language changed. The Accountability section
shows Argus's own predictions about this company and how they resolved. None of it
is prose generated to sound complete — every line traces to a document, a quote, or
a sealed comparison, and every gap states exactly what is missing rather than
guessing.

---

## PART 7 — FEED INTEGRATION

Per Product Architecture §3.2 (unchanged): an earnings-class Market Event is always
a Feed story, ranked by the existing EventScore (class weight 24, decay half-life
12h) — nothing in this document changes that ranking. Two additions:

### 7.1 The raw event stays a fact, not an understanding

The Feed's earnings-class card states what happened (company, period, that a
release occurred, source count) — it never carries the extraction's conclusions
inline, per the same rule that keeps LLM summary beside, never inside, reasoning.

### 7.2 The understanding-changed item is what actually earns attention

The Feed's internal-cognition-event lane (Architecture §3.9, Feed Editorial Standard
F4) is where this engine's output actually surfaces, exactly as the brief demands:
never "Company beat earnings," always the model change the earnings evidence
produced. Example, in the 4B voice:

> **UNDERSTANDING CHANGED** — Power Infrastructure conviction 82, +4 — crossed the
> strengthening threshold. Vertiv's guidance raise on datacenter capex corroborated
> the standing thesis. 3 sources, 1 filing.

This is a `guidance_raised` or `conviction_crossed` transition (Part 5.2), rendered
per F4's existing rules — Argus-derived provenance, ranked by transition magnitude
on the same decay clock as any other internal cognition event. Per Architecture
§3.2, this item is alert-eligible; the raw earnings item is not.

### 7.3 The quiet case

An earnings release whose extraction moves nothing recorded (no theme crossed a
threshold, no guidance changed, no contradiction flagged) produces **no**
understanding-changed item — the quiet answer is a complete answer (Reasoning Engine
Part 5, `quiet` state), restated here so earnings coverage does not become the
one place fill beats floor.

---

## PART 8 — FUTURE DATA REQUIREMENTS

### 8.1 Required now (what Argus already has, that this design ships on top of)

| Source | Status today | What it already unlocks |
|---|---|---|
| Earnings-class Market Event classification + resolver | **Live** (Feed Editorial Standard V1.2) | EarningsRecord minting trigger, company+period identity |
| Evidence with `kind` (`sec_filing / transcript / ir_release / news`) | **Live** (vocabulary exists; ingestion pipelines for filings/transcripts are the gap, not the schema) | Document-kind quorum, tier routing |
| Theme/driver/industry ontologies | **Live** | Tier-3 classification targets (§2.3) |
| Prediction ledger (three existing types) | **Live, gated by env flag** | R5 stakes reporting (§4.5), unchanged |
| Memory Record family + transition machinery | **Live** (M3.1/M3.2) | EarningsSnapshot / ManagementIntelligenceSnapshot as a same-shape extension (§5.2) |

Nothing above requires new infrastructure to *begin* shipping the object model,
identity scheme, and honest-gated facets specified in Parts 1, 6, and 7. What is
gated is the extraction content, not the architecture.

### 8.2 Future institutional upgrades, in the order that unlocks the most

| Source | Unlocks | Priority rationale |
|---|---|---|
| **SEC EDGAR structured ingestion (XBRL)** | Tier-1 reported metrics, segment deltas where tagged, buyback/dividend figures | Highest leverage: deterministic, zero-LLM, matches "extracted-or-blank" exactly; also the SEC Intelligence facet's own reserved slot (Company Intelligence Part 11) |
| **Earnings call transcripts** (conference call transcripts) | Tier-2 attributed commentary — the entire Management Intelligence engine depends on this | Second priority: without it, Part 3 ships structurally complete but empty for nearly every company, same honest state Part 12 already describes today |
| **Earnings presentations / IR releases** | Tier-1 guidance figures, capital allocation figures, often the cleanest structured source for guidance specifically | Cheapest per unit of Tier-1 value; frequently machine-readable already |
| **Guidance history table (new, Argus-internal)** | The guidance delta mechanism (§2.2, §6.1) — without a stored prior-period value, "what guidance changed" cannot be computed even once transcripts exist | Must land alongside transcripts/IR releases, not after — it is the join key the delta depends on |
| **Canonical per-company segment taxonomy** | Tier-1 segment deltas (§2.2); without it, segment commentary stays Tier-2/3 fallback forever | Lower priority — the honest fallback is usable; this is a completeness upgrade, not a blocker |
| **Analyst consensus estimates** | Would enable beat/miss and surprise framing | **Explicitly not pursued as a priority under the current honesty boundary** — Argus's differentiation (Part 0) is structural, not consensus-relative; this stays behind the same gate price/consensus already sits behind (Architecture §3.4) until a canonical source is deliberately admitted by amendment |
| **Historical filings backfill** | Deeper `first_linked` dates, longer guidance history for say-do scoring | Value grows with time regardless; not urgent relative to live ingestion |

Each future source, when it lands, activates its named gated fields **by version
amendment to this document**, per the extension law (ARGUS_KNOWLEDGE_MODEL_V1 Part
5) — never silently, never simulated in the interim.

---

## PART 9 — AMENDMENTS ISSUED BY THIS DOCUMENT

1. **ARGUS_KNOWLEDGE_MODEL_V1** is amended: two new first-class objects, O15
   (Earnings Record, stratum S) and O16 (Management Intelligence Record, stratum M),
   admitted with full object law (Part 1 of this document); the `earnings:` and
   `management:` UID namespaces are reserved in §O12; the reference matrix (§3.4)
   gains the rows/columns in Part 1 of this document.
2. **ARGUS_INSTITUTIONAL_MEMORY_V2** is amended: two new Memory Record subtypes
   (EarningsSnapshot, ManagementIntelligenceSnapshot, §5.2 of this document) and
   twelve new `transition_event.kind` values (§5.2), following the existing record
   family's exact shape.
3. **ARGUS_ENTITY_INTELLIGENCE_V1 / ARGUS_COMPANY_INTELLIGENCE_V1** are amended: the
   Earnings Intelligence facet (Part 10) and Management Intelligence facet (Part 12)
   gain the specified content (Part 6 of this document); their existing honesty
   rules, attribution grammar, and banned-content list are extended, not replaced —
   the tone/sentiment ban is explicitly reaffirmed and generalized to the Management
   Intelligence Record (O16).
4. **ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1** §3.2 (earnings and guidance events)
   is clarified, not changed: this document specifies *how* earnings evidence moves
   themes/relationships (Part 4) and confirms the existing alert rule (a guidance
   event that flips recorded state is alertable; the earnings item itself is not)
   applies unchanged to every transition kind this document adds.
5. **ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1** is not amended — Earnings Records are
   additional Stratum-S input to stages R0–R5 for earnings-class subjects; the
   seven-stage ladder, the Explanation contract, and the confidence grammar apply
   unchanged. This document supplies richer facts; it does not add a reasoning
   stage.
6. **ARGUS_PREDICTION_OUTCOME_LEDGER_V1** is not amended at V1. A fourth prediction
   type, `guidance_accuracy`, is named as a future admission candidate (§4.5) and
   requires its own amendment under O13's rules before it exists.

---

## GOVERNANCE

This is the canonical specification for every future earnings-related feature.
Amendments are V1.x with a log; changing the tier discipline (§2.1), the
confidence-as-track-record reframing (§3.4), the blending ban (§2.5), or the object
identity schemes (Part 1) requires V2.0. Every future earnings feature must name,
in writing, which extraction tier it produces, which object it writes, and which
gated row of §2.2/§8.2 it activates — a feature that cannot is inventing a parallel
structure and is rejected under the knowledge model's extension law.

| Version | Date | Change |
|---|---|---|
| V1.0 | 2026-07-21 | First canonical specification: O15 Earnings Record and O16 Management Intelligence Record admitted to the knowledge model; the three-tier extraction discipline; the curated management topic ontology; management confidence reframed as say-do track record (tone/sentiment ban reaffirmed); theme/narrative/relationship/prediction transmission mechanics (reusing existing objects, no new verbs); institutional memory permanence rules and two new Memory Record subtypes with twelve transition kinds; Entity Intelligence facet upgrades (Earnings, Management, cross-linked Contradiction Ledger); Feed integration (raw event vs. understanding-changed item, quiet-case rule); required-now vs. future data source inventory. |

---

*Related canon: ARGUS_KNOWLEDGE_MODEL_V1.md (the object universe this document
extends) · ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1.md (the spine and routing
matrix) · ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1.md (the explanation this engine
feeds) · ARGUS_ENTITY_INTELLIGENCE_V1.md + ARGUS_COMPANY_INTELLIGENCE_V1.md (the
facets this document fills) · ARGUS_FEED_EDITORIAL_STANDARD_V1.md (unchanged
earnings ranking law) · ARGUS_INSTITUTIONAL_MEMORY_V2.md (record model extended) ·
ARGUS_PREDICTION_OUTCOME_LEDGER_V1.md (the ledger this document's stakes clause
reads, unchanged at V1).*
