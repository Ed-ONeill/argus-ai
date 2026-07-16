# ARGUS COMPANY INTELLIGENCE V1

**Status: GOVERNING SPECIFICATION — the canonical research surface.** Design phase
only; no production code accompanies this document. Governed by
ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1 (§4.4 defines this surface's single
question and its must-nevers), the Design Bible (ARGUS_INTELLIGENCE_NETWORK_V2 —
identity, Five Second Test, form language, interrogation model, 4B voice), the Feed
Editorial Standard (events and evidence), and the Institutional Memory corpus
(ARGUS_INSTITUTIONAL_MEMORY_V2, PREDICTION_OUTCOME_LEDGER_V1, INSTITUTIONAL_REASONING_V1).
Where this document conflicts with any of those, they win and this document is amended.

---

## PART 0 — WHAT COMPANY INTELLIGENCE IS

**The question this surface answers: "What do we know about this specific entity?"**
Not "what is this stock doing" — what does *Argus* know: what the spine has observed,
corroborated, interpreted, remembered, and staked its name on about one company,
accumulated over time and laid out the way a senior analyst keeps a file.

The governing metaphor is **the analyst's file, opened**. A markets desk that has
covered a company for two years does not greet you with a dashboard of widgets. It
hands you the file: what the company is, what the desk currently believes and why,
every dated event with its documents attached, what management has actually said (with
the transcript page number), what the desk predicted and how those calls resolved. The
file is the institution's memory of the company made inspectable. That is this page.

**What this page is not.** It is not a financial dashboard. The financial-dashboard
genre fakes breadth: a price chart from one vendor, fundamentals from another,
news from a third, none of them reconciled, none of them remembered, none of them
accountable. Argus refuses the genre. Company Intelligence V1 contains **zero
unsourced fundamentals, zero price-derived claims, zero invented analysis** — if the
spine has not routed it, the page does not show it, and the absence is stated in the
product's own voice rather than papered over with a vendor widget. A short honest file
beats a full fake one; this is the quiet-day rule applied to research.

**Canonical statement, applied:** Argus exists to transform market complexity into
institutional understanding. The Network shows the understanding as a structure; the
Feed shows it as a stream; **Company Intelligence shows it accumulated onto one name.**

## PART 1 — THE RESEARCH DOCTRINE (five laws of the page)

1. **Accumulation, not aggregation.** Every fact on this page is the spine's output
   routed to this entity over time — never a page-local computation, never a re-scored
   number, never third-party content pasted in. The page is the purest *terminal
   projection*: it renders what stages 3–5 concluded and adds nothing.
2. **Evidence-or-blank.** Every claim carries its provenance (source, date, document
   kind, recorded/derived). A field with no evidence renders as an honest blank with
   the reason — "No filing observed." — never as a dash that could mean anything.
   Dead ink is banned: if a chip or figure cannot be interrogated, it does not ship.
3. **Time is the first axis.** A research file is a chronology before it is anything
   else. Every section is dated, orderable, and anchored to *event time* (first
   observation), never to re-report time. The page must make "how long has Argus known
   this" a first-class, visible fact.
4. **Accountability outranks narrative pride.** Predictions naming this entity and
   their outcomes — including the wrong ones — are a permanent section of the file,
   placed above forward-looking content. A file that hides its misses is marketing.
5. **Refusal is a designed state.** Gated history, missing transcripts, absent
   filings, uncalibrated predictions — each has designed copy in the 4B voice, stated
   plainly ("Two predictions named this company. Neither has resolved. Calibration
   requires 30 tested outcomes; Argus has 11."). The page never simulates knowledge
   it does not have.

## PART 2 — IDENTITY AND THE CANONICAL SPINE

- **One company, one page, one uid.** The page keys on the canonical entity uid
  `company:ticker:<TICKER>` — the same identity used by the institutional archive,
  the prediction ledger, the intelligence graph, and (by the F1 identity) every
  Market Event's `companies` field. Route: `/company/<ticker>` (uppercase canonical;
  lowercase redirects).
- **The registry is the gate.** A page exists only for companies resolvable through
  the canonical registry (`app/companies.py`) or named by theme ontology assets. No
  registry resolution → no page → a designed not-covered state ("Argus does not cover
  this entity. Coverage grows by registry, not by guess.") — never an empty shell.
- **Identity strip contents** (the masthead): canonical name, ticker, sector/industry
  from the registry and ontology, and the **coverage line** — the file's own
  credentials, in figures: *"In the file since Mar 2026 · 214 events · 41 filings ·
  6 predictions, 4 resolved."* Every number in the coverage line is a real count from
  the archive and is clickable (it scrolls to its section). Nothing decorative.
- **Ambiguity discipline carries over.** The page never guesses: "CAT scan" prose in
  an article does not create Caterpillar events (the resolver already enforces this at
  the spine); the page inherits that cleanliness and must not add its own looser
  matching.

## PART 3 — PAGE ANATOMY (every section, in order)

The page is a single vertical dossier — one column of full-width sections in fixed
order, with a persistent right rail. No tabs (tabs hide the file; a file is read top
to bottom). No cards-in-grids (grids are dashboards). Section order **is** the
information hierarchy and it is not user-configurable — the file reads the same way
for every professional, like a prospectus.

**A. Masthead — identity + coverage line** (Part 2). Height ≤ 96px. The Five Second
Test happens here and in section B.

**B. The Standing View — what Argus currently believes.** One short passage in the 4B
voice plus its structural facts: which theses currently transmit into this entity,
in which direction, at what conviction; whether the entity sits on the dominant
narrative's transmission path; what changed most recently. Rendered as 2–4 sentences
with inline provenance chips, followed by the exposure table (section C data, compact).
Example copy: *"Vertiv sits downstream of Power Infrastructure (conviction 78,
strengthening, 6th session) via datacenter capex. Two events this week corroborated
the link; nothing contradicts it. On the dominant path."* If no theme names the
entity: *"No standing thesis names this company. 12 events in the file; none currently
transmit."* — the honest version of "neutral."

**C. Exposure & Transmission.** The full table of theme exposures: theme, direction
(supports / pressures / exposed_to, the canonical edge verbs), conviction (mono
figure), evidence count, first-linked date, trend glyph. Each row expands (Notch
pattern) into the transmission chain — the same `Upstream → Theme → This company`
thread grammar the Network draws, in miniature. Rows deep-link to the Theme page and
to Network focus on that edge.

**D. The Event Record.** The company's dated event history — every Market Event whose
`companies` names this entity, newest first, grouped by day, unlimited depth with
progressive loading. Each entry: event headline, class chip, event-time age, source
count ("3 sources", corroboration made visible), developing label where honest ("One
source; not yet corroborated."), and its evidence list on expansion — each article
with source, tier, document kind, timestamp, and outbound link. One event appears
once (the engine guarantees it; the page must not re-split). This section is the
file's spine and typically its longest.

**E. Earnings Intelligence.** The reporting record, one row per reporting period
(the engine's `reporting_period` identity — Q1–Q4/FY, explicit-only), newest first.
Per period: the folded earnings event, its corroboration count, its document kinds
present (filing / transcript / IR release / coverage — shown as four presence marks),
and *what changed in the model afterwards*: theme conviction deltas within the
following two sessions, recorded not inferred, each with its snapshot provenance.
**Gated absent:** consensus, surprise, beat/miss framing, and any price reaction —
Argus has no canonical estimates or price source (architecture §3.4), so V1 says so:
*"Surprise vs. consensus requires an estimates source Argus does not yet have."*
The section reserves the slot; nothing simulates it.

**F. SEC Intelligence.** Filings as first-class evidence, not links: the dated stream
of observed filings for this entity (8-K, 10-Q, 10-K, S-1 …), each with form type,
filed date, the material trigger that admitted it (the watchlist admits material 8-Ks,
not all paper), and the event it evidences. Fields are **extracted-or-blank** in the
M&A-page discipline: anything shown from a filing is a quoted extraction with the
form as provenance; nothing is summarized into existence. A company with no observed
filings shows: *"No filings observed. Coverage began Mar 2026; the file is not the
company's full EDGAR history."* — the boundary between "Argus's file" and "the world"
stated plainly.

**G. Management Intelligence.** What management has actually said — **attributable
commentary only**. Every entry requires a document of kind `transcript`, `sec_filing`,
or `ir_release`, or attributed reporting from a qualified source, and renders as:
speaker (when the document names one), quotation or tight paraphrase, document kind,
source, date. The honesty rule from the editorial standard is load-bearing here:
**Argus never invents management explanations.** When earnings exist but no transcript
or filing does: *"No transcript or filing in the file for Q2. Commentary unavailable —
not inferred."* V1 acknowledges its ingestion reality: transcripts are not yet a wired
source, so this section will often show honest absence — that is correct behavior,
and the section exists now so the contract (attribution-or-silence) governs the day
transcripts arrive.

**H. Relationship Graph.** The entity's neighborhood in the canonical intelligence
graph — this company, the themes and narratives that touch it, sibling entities on
shared edges — rendered by the **same graph engine and form language as the Network**
(one grammar; a second graph dialect is banned by the Bible and by §4.6's precedent).
Scope: 2 hops, focal-centered, deterministic layout. Every edge carries its verb and
provenance and is interrogable (Part 6). A "open in Network" affordance hands the
selection to the Network page with context preserved.

**I. Institutional Memory.** The file's long axis: first-seen date, sessions observed,
the entity's archived snapshot trail (M3.2 entity history), relationship formation
and dissolution dates, narrative memberships over time, and theme-linkage history —
each fact from sealed daily snapshots with their dates. Where the archive is younger
than the claim requires, the reasoning engine's gates apply verbatim: the page prints
`insufficient_history` copy exactly as the engine returns it, never a softened
paraphrase. This section is recorded-only: it renders archive rows, not recollections.

**J. Accountability — predictions and outcomes.** Every prediction whose subject or
scope names this entity: wording as registered (immutable), registered date, boundary,
verdict (confirmed / partially_confirmed / contradicted / invalidated / unresolved /
unresolvable_data_gap / expired_without_test), resolved date, and the evidence ref
that resolved it. Calibration context appears only when the ledger's gates pass
(≥30 tested outcomes, ≤20% untested) and always with the standing disclaimer:
diagnostics, not an accuracy claim. Misses render at equal visual weight to hits —
by doctrine, accountability outranks narrative pride.

**K. Watch.** Forward-looking, derived-only: the conditions under which the standing
view changes, sourced from live theme watch conditions and open prediction boundaries
that name this entity. Each item cites what generates it. No page-local speculation;
if nothing is watched, the section says *"No open conditions name this company."*

**Right rail (persistent):** the coverage line repeated in figures, section index with
scroll position, and the active-context handoff (Part 7). The rail is navigation and
state — it computes nothing.

## PART 4 — INFORMATION HIERARCHY

1. **Identity → belief → evidence → memory → accountability → watch.** The order of
   Part 3 is the hierarchy: who this is; what we think; what happened (with documents);
   what we've learned over time; how our calls aged; what would change our mind. A
   professional can stop reading at any depth and have a complete (shallower) truth.
2. **The Five Second Test for this page:** a professional landing cold must know
   within five seconds — *what company, what Argus believes about it, on how much
   evidence, and for how long Argus has known it.* All four are in the masthead +
   Standing View above the fold. If any requires scrolling, the composition fails.
3. **Figures dominate prose** (M5 typography doctrine): conviction, counts, dates in
   the mono ramp; sentences are short and load-bearing. The page has at most one
   passage of connected prose (the Standing View); everything else is structured.
4. **Depth is progressive, never hidden.** Expansion (Notch) reveals evidence in
   place; nothing important lives only behind interaction. Collapsed states must be
   honest summaries, not teasers.

## PART 5 — THE EVIDENCE MODEL

- **Unit:** the Market Event (F1/F2 engine) with its evidence list — articles,
  filings, transcripts, IR releases — each with source, tier, document kind,
  qualification flag, and timestamp. The page introduces no second evidence shape.
- **Provenance is load-bearing ink.** Every claim renders its provenance chip:
  `recorded` (archive/snapshot/ledger fact) or `derived` (live-model projection),
  plus document kind where applicable. Clicking provenance opens the underlying
  record (evidence list, snapshot row, prediction record, filing link).
- **Corroboration is visible editorial information:** source counts on events,
  qualification marks on evidence, developing labels on single-source items —
  the same lanes the Feed uses, so the file and the stream never disagree.
- **The four document kinds** (sec_filing / transcript / ir_release / news) are the
  page's honesty vocabulary: they gate Management Intelligence (Part 3G), annotate
  Earnings Intelligence (3E), and let every section state absence precisely.
- **Nothing external embeds.** Links go out to documents; content does not come in
  unattributed. No iframes, no vendor widgets, no scraped fundamentals.

## PART 6 — INTERACTION PHILOSOPHY

The Bible's interrogation model, applied to research: **every interaction answers
"why do you say that?"** — never "show me more stuff."

- **Click a claim → its evidence.** Conviction figure → the snapshots behind it.
  Event → its documents. Exposure row → the transmission chain. Verdict → the
  resolving record. One interaction depth: claim → basis. No drill-down mazes.
- **Hover traces, click commits.** Hovering an exposure row ghosts its path in the
  relationship graph (H); clicking focuses it and updates the URL (shareable state).
- **Selection is the product-wide lens.** Selecting any entity, theme, or narrative
  on this page writes the shared active-context store — the same grammar as Network
  focus and the Intelligence Drawer. The drawer is this page's travel-size expression;
  "Open full dossier" in the drawer lands here, context intact, and this page's
  FocusBar hands context onward identically.
- **No dead interactions:** anything that highlights must resolve to evidence or
  navigation. Anything purely decorative is removed rather than animated.
- **Reading is the default.** The page must work fully with zero interactions — print
  it and it is still a correct research file. Interaction adds inspection, not content.

## PART 7 — NAVIGATION (arriving, leaving, addressing)

- **Arriving:** every EntityChip anywhere in the product; event cards' company chips;
  Network node context ("Open Company Intelligence"); Intelligence Drawer's "full
  dossier"; M&A party names; theme pages' related-asset lists; direct URL.
- **Leaving:** theme rows → Theme dossier; graph edges → Network focus; evidence →
  source documents; prediction rows → ledger record. Every exit preserves the shared
  active context so the product feels like one instrument, not linked pages.
- **Addressing:** `/company/<TICKER>` plus optional deep anchors
  (`#events`, `#earnings`, `#filings`, `#memory`, `#ledger`) and a focus query for
  section D filtering by event class. URLs are stable research artifacts — a
  professional can cite them in a memo.
- **The not-covered state** (Part 2) is itself addressable and explains coverage
  honestly rather than 404ing.

## PART 8 — INSTITUTIONAL MEMORY INTEGRATION

- **Sources:** memory v2 API — entity snapshots (`/entities/{uid}/snapshots`),
  relationship history (`/entities/{uid}/relationships`), narrative history, theme
  historical context — all keyed by the canonical uid this page already carries.
- **Recorded vs. derived is never blurred:** section I renders archive rows with
  their sealed dates; the Standing View renders the live model. The page labels which
  is which and never backfills one from the other.
- **Gates print verbatim.** `insufficient_history` and the reasoning engine's
  requirement statements ("Historical analogs require 60 archived days across 2
  regimes; the archive holds 38.") render as returned. The page never rounds a gate
  down to a spinner or an empty box.
- **Data-gap honesty carries over:** where the archive distinguishes writer-alive
  gaps from data gaps, the file says "no observation recorded" rather than implying
  the company was quiet.
- **Future (out of V1 scope, slot reserved):** as-of replay of the file via
  `/graph/at` — "read this file as it stood on May 3."

## PART 9 — PREDICTION INTEGRATION

- **Source:** the prediction ledger via `/entities/{uid}/predictions` and outcome
  records; subjects and scope keys already use the canonical uid.
- **Immutability is visible:** registered wording renders as registered, dated;
  amendments do not exist (a changed mind is a new prediction, and the page shows
  both, linked).
- **Verdict vocabulary is the ledger's, unabridged** — including
  `unresolvable_data_gap` and `expired_without_test`, which most products would hide.
  Argus shows them because they are the honest cost of the honesty boundary.
- **Calibration language is gated** (Part 3J) and never entity-local: Argus does not
  compute "our accuracy on AAPL" from three observations. Below gates, the copy names
  the requirement rather than showing a small-n percentage.

## PART 10 — EARNINGS ANALYSIS (the discipline in detail)

- **Identity:** one reporting period, one row, keyed by the engine's explicit-only
  `reporting_period`. Periods the company never stated do not exist on the page
  (nothing inferred from dates), and un-perioded earnings events list beneath the
  perioded record, labeled as such.
- **The row is the folded event** — corroboration earned across wire + coverage +
  filing + release, documents attached, exactly once (engine-guaranteed).
- **"What changed" is recorded, not narrated:** post-event conviction deltas come
  from archived snapshots with dates; if no theme moved, the row says so — an
  earnings event that changed nothing in the model is itself information.
- **Banned until canonical sources exist:** consensus/surprise framing, price
  reaction, "the market's verdict," implied guidance math. Each banned item has
  designed absence copy naming the missing source. Magnitude's honest proxy
  (corroboration velocity, editorial standard §3.2) may annotate rows when F5 ships —
  by amendment, not silently.

## PART 11 — SEC INTELLIGENCE (the discipline in detail)

- **Filings are events' strongest evidence** (tier-1 source; often the event itself,
  per the source-tier table). The section lists observed filings with form type,
  date, and materiality trigger, and links each to the event it evidences.
- **Extracted-or-blank:** any field shown from a filing (deal terms, guidance
  language, risk-factor changes) is a quoted extraction with form + section cited.
  No summaries without quotes; blank cells state "not extracted," not "none."
- **Coverage honesty:** the watchlist ingests material 8-Ks for covered tickers —
  the page states its observation window and does not present the file as the
  company's complete regulatory history.
- **Future slots (reserved, gated):** full-text diffing of 10-K risk factors,
  ownership filings (13D/G, 13F), insider transactions (Form 4) — each arrives only
  with a canonical ingestion source and an amendment here.

## PART 12 — MANAGEMENT INTELLIGENCE (the discipline in detail)

- **The attribution grammar:** *who said it* (speaker or "the company"), *where*
  (document kind + source), *when* (document date). All three or the entry does not
  render.
- **Quotation over paraphrase;** paraphrase only when marked and adjacent to its
  source link. No sentiment scores on management language (uncomputable honestly
  today), no "management sounded confident" — tone claims are banned.
- **Absence is a designed state, not an apology:** the section renders its empty
  state at full quality because for most companies in V1 it will be the common state
  (transcript ingestion is not yet wired). The contract exists before the content so
  the content can never arrive un-governed.

## PART 13 — RELATIONSHIP GRAPH (the discipline in detail)

- **One grammar.** The neighborhood view is the canonical graph engine with the
  Network's form language — Cut, Rail, Figure, Notch, Thread — at dossier scale.
  Deterministic layout, content-hash keys, no page-local physics, no second visual
  dialect. Anything the Network banned (fabricated replay, decorative motion) is
  banned here by inheritance.
- **Edges are claims:** each carries verb, provenance, first-recorded date, and is
  interrogable to its evidence — the graph is the Standing View drawn as structure,
  and the two must never disagree (they read from the same model in the same cycle).
- **Scale discipline:** 2 hops maximum, focal always the company, tier emphasis
  resting on the dominant path. The full market view belongs to the Network page;
  this is the file's exhibit, not a second observatory.

## PART 14 — PLACE IN THE PRODUCT INTELLIGENCE ARCHITECTURE

- **Spine stages consumed:** everything; computed: nothing. Stage 1–2 (observed,
  corroborated events via the editorial engine), stage 3 (theme/graph interpretation),
  stage 4 (archive), stage 5 (ledger), stage 6 (this page — pure explanation). The
  pipeline rule holds absolutely: meaning is made upstream, once.
- **Routing matrix rows rendered:** corroborated stories (D), earnings (E), M&A facts
  naming the company (D + link to M&A lens), macro/policy events that transmit into
  the entity via themes (C), filings (F), internal cognition events naming the entity
  — conviction crossings, relationship changes, prediction resolutions (B, I, J).
- **Relations to sibling surfaces:** the Network is the structure of the whole model;
  this page is one entity's accumulation. Themes is the thesis dossier; this is the
  entity dossier — exposures link them. The Feed is now; this is the file. The
  Intelligence Drawer is this page's summary form. M&A/Private are lenses that
  deep-link in for parties they name. Saved may bookmark it; nothing personal leaks in.
- **Must never (restating §4.4 as law):** carry unsourced fundamentals; make
  price-derived claims beyond the honesty boundary; compute entity-local analysis
  absent from the canonical model; re-score, re-rank, or re-interpret spine output;
  grow a second graph grammar or a second evidence shape.

## PART 15 — EXPLICITLY OUT OF V1 (slots reserved, arrivals by amendment)

Price and volume context; fundamentals and financial statements; consensus estimates
and surprise; ownership, holders, and insider activity; peer comparison; transcript
ingestion (the section ships with its contract and honest absence); as-of file replay;
alerts on file changes (owned by the alerts doctrine, architecture §3.11). Each
requires a canonical source or an upstream engine that does not exist yet. **V1 ships
the file, complete and honest, out of what the spine already knows** — which audit
shows is already substantial: events with documents, exposures, memory, and an
accountability ledger, which is more than any dashboard in the genre actually has.

## PART 16 — ACCEPTANCE

1. **Five Second Test:** cold professional, masthead + Standing View visible → can
   state the company, Argus's current read, evidence volume, and coverage age.
2. **Interrogation test:** pick any figure or claim at random → at most one
   interaction reaches its evidence or its honest gate.
3. **Honesty sweep:** empty registry ticker, young archive, unresolved ledger, no
   transcripts → every state renders designed copy; zero spinners-as-answers, zero
   dashes-as-unknowns, zero simulated content.
4. **Genre test:** shown the page, a professional investor asks "what platform is
   that?" — and does not say "another finance dashboard."
5. **Consistency test:** the Standing View, the graph exhibit, the Feed's events, and
   the Drawer for the same entity in the same cycle never contradict each other.

## GOVERNANCE

This document is the law of the Company Intelligence surface under the master
architecture and the Design Bible. Amendments are V1.x with a log; changing the
section order, the evidence model, or any Part 10–12 honesty rule requires V2.0 with
explicit conflict resolution. Implementation sprints (CI1…) must name the parts they
implement and may not reorder the hierarchy ad hoc. Every future data source lands
here as an amendment *before* it lands in code.

| Version | Date | Change |
|---|---|---|
| V1.0 | 2026-07-16 | Initial governing specification: doctrine, anatomy (A–K), hierarchy, evidence model, interrogation, navigation, memory/prediction integration, earnings/SEC/management disciplines, graph exhibit, architecture fit, V1 exclusions, acceptance. |
| V1.1 | 2026-07-16 | Recast by ARGUS_ENTITY_INTELLIGENCE_V1 after a governed challenge to this document's founding assumption: this specification now governs (a) the **company kind** of the canonical Entity Intelligence surface — its three facets (Earnings / SEC / Management Intelligence, Parts 10–12) unchanged — and (b) the shared research doctrine, evidence model, interrogation model, and acceptance tests (Parts 1, 4–7, 16), which are promoted to Entity Intelligence law for every kind. Route `/company/<TICKER>` survives as the company-kind alias of `/intel/company:ticker:<TICKER>`. Nothing is deprecated. |

---

*Related: ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1.md §4.4 (the surface contract),
ARGUS_INTELLIGENCE_NETWORK_V2.md (form language, interrogation, voice),
ARGUS_FEED_EDITORIAL_STANDARD_V1.md (events, evidence kinds, lanes),
ARGUS_INSTITUTIONAL_MEMORY_V2.md + ARGUS_PREDICTION_OUTCOME_LEDGER_V1.md (the file's
long axis and its accountability).*
