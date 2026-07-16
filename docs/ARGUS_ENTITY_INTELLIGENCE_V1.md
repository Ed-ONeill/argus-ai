# ARGUS ENTITY INTELLIGENCE V1

**Status: ARCHITECTURE AMENDMENT — the canonical research surface, re-founded.**
This document records a deliberate challenge to ARGUS_COMPANY_INTELLIGENCE_V1's
founding assumption, the verdict, and the resulting amendment to the Product
Intelligence Architecture. Design phase only; no production code. It amends
ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1 §4.4 (by its V1.1 log entry) and recasts
ARGUS_COMPANY_INTELLIGENCE_V1 (by its V1.1 log entry) without invalidating its
content. Where this document is silent, those documents and the Design Bible govern.

---

## PART 0 — THE CHALLENGE AND THE VERDICT

**The challenged assumption:** that "Company Intelligence" — a research surface whose
unit is the public company — is the right abstraction for Argus's flagship research
experience.

**The verdict: the assumption is wrong, in a specific and repairable way.** The
correct canonical surface is **Entity Intelligence**: one research experience that
renders any subject the spine knows — companies, themes, industries, narratives,
regimes, and (by strict admission) future kinds — through one shared intelligence
model. Company Intelligence V1 survives *in full* as the richest kind of that
surface: nothing in its anatomy was company-page decoration; roughly four-fifths of
it was never about companies at all.

**The qualification that keeps the verdict honest:** naive unification would be worse
than the mistake it fixes. A single generic page that renders every kind through
lowest-common-denominator panels is the financial-dashboard genre wearing a new
badge. The superior architecture is therefore not "one page for everything" but **one
dossier grammar + kind facets under an admission law** (Part 3). The grammar is
universal; the facts are not; and no kind may pretend to facts its engines cannot
produce.

## PART 1 — THE EVALUATION (evidence, not taste)

### 1.1 What the system already says

The challenge is settled by the system's own structure, all of it pre-existing:

1. **Identity is already kind-generic.** The canonical UID layer
   (`institutional_memory/identity.py`) is `{type}:{namespace}:{key}` with seven
   live namespaces — `theme:ontology:`, `company:ticker:`, `industry:taxonomy:`,
   `driver:ontology:`, `regime:taxonomy:`, `narrative:driverset:`, plus reserved
   `sector:taxonomy:` and the honesty lane `<type>:unresolved:`. The archive was
   never a company archive.
2. **Memory is already kind-generic.** The memory v2 API is keyed by uid, not kind:
   `/entities/{uid}/snapshots`, `/entities/{uid}/relationships`,
   `/entities/{uid}/predictions` serve a theme, a company, or a driver identically.
   The prediction ledger's subjects and scope keys are uids.
3. **The dossier already exists, twice, kind-generically.** The Network inspector
   builds dossiers for the dominant narrative *and* arbitrary entities through one
   `DossierVM`; the Intelligence Drawer is a kind-agnostic travel dossier over the
   shared active-context store. Argus has been converging on Entity Intelligence
   without naming it.
4. **The Company Intelligence anatomy is mostly kind-agnostic.** Of sections A–K:
   masthead/coverage line, Standing View, Exposure & Transmission, Event Record,
   Relationship Graph, Institutional Memory, Accountability, and Watch (8 of 11)
   apply verbatim to a theme, an industry, or a narrative. Only Earnings, SEC, and
   Management Intelligence are company-specific — and they were already designed as
   gated, self-contained disciplines.
5. **The product's first principle demands it.** "One understanding, many windows":
   a per-kind family of research pages is how the P2-era divergence disease starts —
   N surfaces each growing local projections, honesty gates, and evidence renderers
   that drift apart. The consistency test (same entity, same cycle, no
   contradictions) is only cheap to enforce when there is one renderer to audit.

### 1.2 What would have made Company Intelligence the right call

For the record, the strongest arguments the other way, and why they do not hold here:

- *"Professionals' questions differ by kind, so surfaces should too."* True of the
  questions; false of the grammar. An analyst's file on a company and a desk's file
  on a thesis differ in their facts, not in their form: identity → belief →
  evidence → memory → accountability → watch is the shape of institutional research
  regardless of subject. Kind facets carry the difference (Part 4).
- *"Generic abstractions built early are premature."* This one is usually decisive —
  but the abstraction here is not being built early; it is being *named late*. Three
  concrete convergent implementations already exist (inspector, drawer, and the
  Themes/Industries detail idioms). Consolidating convergent code is the opposite of
  premature abstraction; it is the A1–A5 playbook.
- *"Companies deserve flagship treatment."* They keep it: the company kind ships the
  most facets. Flagship is a property of depth, not of route naming.

### 1.3 Where the user-proposed kind list meets the honesty boundary

Entity Intelligence renders **kinds, not wishes**. Of the kinds proposed
(companies, people, themes, industries, events, institutions, governments, private
companies), today's engines support:

| Kind | Identity today | File content today | V1 status |
|---|---|---|---|
| Theme | `theme:ontology:` | richest: conviction, lifecycle, memory, ledger | **ships** |
| Company | `company:ticker:` + registry | events, exposures, filings, ledger | **ships** |
| Industry | `industry:taxonomy:` | activation, theme links, memory | **ships** |
| Narrative | `narrative:driverset:` | member sets, transitions, dominance | **ships** |
| Regime | `regime:taxonomy:` | derived regime, transition history | **ships (thin)** |
| Macro driver | `driver:ontology:` | theme membership, narrative roles | **ships (thin)** |
| Event | cluster id (F1 identity) | evidence, transmission — a **record**, not a file (§2.2) | **ships as record** |
| Institution / government | none (Fed exists as *source* and *driver*, not subject) | — | **reserved** |
| Person | none | — | **reserved** |
| Private company | none (M&A parties / private-markets names are labels; `unresolved:` lane exists) | — | **reserved, nearest** |

Reserved kinds get no page, no placeholder, no "coming soon": a kind is admitted by
amendment when it has (a) a uid scheme, (b) a deterministic resolver, and (c) at
least one spine engine producing facts for it. This is the registry rule from the
company work, generalized: **coverage grows by identity, not by guess.**

## PART 2 — THE ENTITY INTELLIGENCE MODEL

### 2.1 The one question

**"What does Argus know about this?"** — where *this* is any admitted subject. The
surface is the terminal projection of the spine onto one uid: everything stages 1–5
have observed, corroborated, interpreted, remembered, and staked on that subject,
rendered as the analyst's file. All five laws of the research doctrine
(COMPANY_INTELLIGENCE V1 Part 1) apply unchanged to every kind: accumulation not
aggregation; evidence-or-blank; time first-class; accountability outranks narrative
pride; refusal is a designed state.

### 2.2 Files and records

Two subject temporalities, one grammar:

- **Files** — standing subjects that accumulate: themes, companies, industries,
  narratives, regimes, drivers. Files carry the full grammar including memory,
  accountability, and watch.
- **Records** — moments: Market Events (and, through the M&A lens, deals-as-events).
  A record renders identity, evidence, corroboration, transmission, and *what
  changed in the model* — but has no watch and no accumulating ledger; its
  accountability lives on the files it touched. Records deep-link to every file they
  name; files list the records that built them. This distinction prevents the
  category error of pretending an event is a research subject while still giving
  every event a citable page.

### 2.3 Addressing

Canonical route: **`/intel/<uid>`** — the uid *is* the address
(`/intel/theme:ontology:power_infrastructure`, `/intel/company:ticker:VRT`).
Kind aliases exist for human ergonomics and redirect to canonical:
`/company/<TICKER>`, `/theme/<id>`, `/industry/<slug>`, `/event/<cluster_id>`.
URLs remain stable research artifacts, citable in memos. The not-covered state is
kind-aware and honest.

## PART 3 — ONE GRAMMAR, KIND FACETS, AND THE EXTENSION LAW

### 3.1 The core grammar (every file, every kind)

The invariant skeleton, inherited verbatim from COMPANY_INTELLIGENCE Part 3 with
company-specific sections lifted out:

1. **Masthead + coverage line** — identity, kind chip, and the file's credentials in
   figures (since-when, evidence counts, ledger counts), every figure clickable.
2. **Standing View** — what Argus currently believes about this subject, 2–4
   sentences in the 4B voice with inline provenance, plus its structural summary.
3. **Exposure & Transmission** — the subject's live edges in the canonical graph,
   with verbs, convictions, and expandable chains. (For a theme these are members
   and drivers; for a company, the theses transmitting into it; same table.)
4. **The Event Record** — dated Market Events naming the subject, evidence attached,
   lanes honest, one event once.
5. **Kind facets** — the subject-specific disciplines (Part 4), in a fixed slot
   between the record and memory.
6. **Institutional Memory** — the archive trail for the uid; gates verbatim.
7. **Accountability** — ledger entries naming the uid; verdicts unabridged;
   calibration gated.
8. **Watch** — derived-only forward conditions naming the uid.
9. **Graph exhibit** — the 2-hop neighborhood in the Network's exact grammar.

Evidence model, interrogation model, interaction philosophy, hierarchy rules, and
acceptance tests carry over from COMPANY_INTELLIGENCE Parts 4–7 and 16 without
modification — they were written kind-agnostically and are hereby promoted to
Entity Intelligence law.

### 3.2 The extension law (what keeps this from becoming a dashboard)

- A **facet** is a named, versioned section a kind adds to the core grammar
  (company → Earnings / SEC / Management; theme → Lifecycle & Contradictions; …).
- A facet ships only when a spine engine produces its facts. No facet renders
  another facet's data. No facet computes meaning page-side.
- Facets may not reorder or interleave the core grammar; they occupy slot 5 only.
  The file reads identically across kinds until the facts themselves differ.
- A kind with zero facets is legitimate (regime, driver): the core grammar alone is
  a complete honest file. Thin kinds are thin because the truth is thin — they are
  not padded.

## PART 4 — THE FACET MAP, V1

| Kind | Facets at V1 | Source engines |
|---|---|---|
| Company | **Earnings Intelligence** (per-period record, document kinds, recorded deltas; consensus/price banned as specified) · **SEC Intelligence** (extracted-or-blank) · **Management Intelligence** (attribution-or-silence) | F1/F2 events, reporting periods, evidence kinds, SEC watchlist |
| Theme | **Lifecycle & Trajectory** (conviction history, states, sessions) · **Contradiction Ledger** (confirm vs contradict) · **Historical Context** (gated analogs, verbatim refusals) | ThemeMemory, M3 snapshots, reasoning engine |
| Industry | **Activation** (score, breadth, momentum) · **Membership** (companies and themes crossing it) | industry_activation, taxonomy |
| Narrative | **Composition** (driver set, member themes, dominance history) | M3.2 narrative history |
| Regime | *(none — core grammar only)* | derived_regime, transitions |
| Driver | *(none — core grammar only)* | ontology, narrative membership |
| Event (record) | **Evidence & Corroboration** (the F1/F2 evidence list as the primary content) · **Model Impact** (recorded post-event deltas) | events engine, archive |

The Company Intelligence V1 specification remains the governing text for the three
company facets and for all shared law it defined; its Parts 10–12 are unmodified.

## PART 5 — CONVERGENCE: HOW THE SURFACES MEET ONE RESEARCH EXPERIENCE

The five surfaces named below do not become Entity Intelligence; they remain what
the architecture says they are — *windows* with single responsibilities — and they
all **hand their subjects to one research surface** instead of growing private ones.

- **Network.** Stays the operating system: the model as structure. Its inspector
  is re-founded as the *embedded* Entity Intelligence dossier — same DossierVM
  family, same sections at aside scale — and every "read more" lands on
  `/intel/<uid>` with the active context intact. The Network never grows a second
  dossier dialect again; convergence retires that risk permanently.
- **Feed.** Stays the stream of now. Event cards link to event *records*; company
  and theme chips link to *files*. The Feed's evidence popovers use the same
  evidence renderer as the dossier, so the stream and the file can never disagree
  about a source list.
- **Themes.** The Themes detail page **is retired as a bespoke construction** and
  becomes the theme-kind file — the first migration, because the theme kind is the
  richest and the existing page already approximates the grammar. The Themes index
  survives as a browse window over theme files.
- **Markets.** Stays the regime surface ("what kind of market is this"). Its deep
  reads — the regime itself, leaderboard entries, evidence-by-theme rows — link to
  regime, company, and theme files respectively. The regime file (thin kind) gives
  Markets its first-ever citable long-form read without Markets computing one.
- **M&A.** Stays the transaction lens. A deal is an event *record* wearing the
  facts-extracted-or-blank facet; parties resolve to company files (or, honestly,
  to no file — a private counterparty renders as an unresolved identity with its
  extracted facts, not a fake page). M&A's graph already migrates to the canonical
  grammar per the Bible; its research reads now migrate to the canonical dossier.
- **Unchanged by this amendment:** Private Markets, Listen, Saved — their §4
  contracts already describe lenses and shelves, not research files; they link into
  Entity Intelligence like everything else.

The migration ordering principle: **kinds ship where pages already exist** (theme
first, company second as the CI1 sprint, industry third), so convergence is
experienced as pages getting *better*, never as a new page family appearing beside
the old ones. At no point do two competing dossiers for the same kind coexist in
navigation.

## PART 6 — AMENDMENTS ISSUED BY THIS DOCUMENT

1. **ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1 §4.4** is amended (V1.1): the
   surface formerly titled "Company Intelligence" is re-founded as **Entity
   Intelligence** — *"What does Argus know about this?"* — owning the per-subject
   accumulation for every admitted kind. Its must-nevers extend to: never render a
   kind without identity + resolver + engine; never let facets compute meaning;
   never allow two dossier grammars to coexist.
2. **ARGUS_COMPANY_INTELLIGENCE_V1** is recast (V1.1): from standalone surface
   specification to (a) the governing text of the company kind's three facets and
   (b) the source of the shared research doctrine, evidence model, interrogation
   model, and acceptance tests, which are promoted to Entity Intelligence law.
   Nothing in it is deprecated; its route `/company/<TICKER>` survives as the
   company kind's alias.
3. **Kind admission** becomes governed process: new kinds (people, institutions,
   governments, private companies) enter only by amendment to this document with
   uid scheme, resolver, and producing engine named — the same discipline that
   gates data sources (price, consensus, transcripts) elsewhere.

## PART 7 — RISKS OF THE UNIFICATION, NAMED

- **Lowest-common-denominator drift** — the grammar degrades into generic panels.
  Mitigation: the extension law (3.2) plus the acceptance rule that a professional
  reading a company file and a theme file must find them *identically shaped and
  differently substantive*. If a section reads the same for every subject, it is
  ink, and ink is banned.
- **Facet sprawl** — kinds accrete sections until the file becomes a dashboard.
  Mitigation: facets are amendments here, each naming its engine; the file's fixed
  hierarchy caps where they render.
- **Premature people/institution pages** — the most-requested kinds are the least
  supported. Mitigation: the admission table (1.3) is normative; reserved means
  absent, not stubbed.
- **Migration limbo** — old bespoke pages and new files coexisting. Mitigation: the
  Part 5 ordering rule; each kind migration is one sprint that ends with the old
  construction gone.

## PART 8 — ACCEPTANCE

1. All COMPANY_INTELLIGENCE Part 16 tests pass **per kind** (Five Second Test,
   interrogation, honesty sweep, genre test, consistency test).
2. **The shape test:** theme file and company file, side by side — same grammar,
   same interrogation, entirely different facts.
3. **The convergence test:** from Network, Feed, Themes, Markets, and M&A, the
   research read on any shared subject lands on the same `/intel/<uid>` and shows
   the same truth in the same cycle.
4. **The admission test:** requesting a person or private company yields the
   designed not-covered state that names what admission requires — never a thin
   fake file.

## GOVERNANCE

This document sits with the surface specifications under the master architecture
and the Design Bible. Amendments V1.x with a log; changing the core grammar, the
files/records distinction, or the extension law requires V2.0. Kind admissions and
facet additions are V1.x amendments here *before* implementation.

| Version | Date | Change |
|---|---|---|
| V1.0 | 2026-07-16 | Challenge evaluated; verdict recorded; Entity Intelligence founded: model, files/records, grammar + facet law, facet map, convergence plan for Network/Feed/Themes/Markets/M&A, amendments to the architecture and to Company Intelligence V1. |
| V1.1 | 2026-07-16 | **EI1 shipped — the company kind in production.** Canonical route `/intel/<uid>` (admission law enforced: company renders; valid non-company kinds get the designed reserved state; malformed uids the invalid state); `/company/<TICKER>` alias redirects to canonical. Dossier grammar's data layer in `lib/intel/dossier.ts` (parseUid/admitUid/buildCompanyDossier — pure, deterministic, 11 tests); sections in `components/intel/CompanyDossier.tsx`: masthead + coverage line, Standing View (derived, 4B voice), Event Record (F1/F2 events, evidence expansion, developing labels), Relationship Map (canonical network grammar, focal company), Institutional Memory + Prediction Ledger (M3 read APIs, honest-null states, gated calibration copy), Watch (themeWatch-derived, cited). Feed entry: the Intelligence Drawer's company view gains a Dossier handoff. Fixed en route: IntelligenceNetwork render-on-demand gate leaked under StrictMode double-mount (cancelled frame left `needRef` true → permanently blank canvas on interaction-less pages) — cleanup now releases the gate. |

---

*Related: ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1.md (amended §4.4),
ARGUS_COMPANY_INTELLIGENCE_V1.md (recast; company facets + shared law),
ARGUS_INTELLIGENCE_NETWORK_V2.md (grammar, interrogation, voice),
ARGUS_INSTITUTIONAL_MEMORY_V2.md (the uid layer this surface projects).*
