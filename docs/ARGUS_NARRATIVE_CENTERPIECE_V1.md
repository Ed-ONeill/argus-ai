# Argus Narrative Centerpiece v1 - "The Read"

**Status:** Product definition (Flagship Experience Sprint, 2026-07). Documentation only; implementation begins in Morning Brief Sprint B3.
**Parents:** `docs/ARGUS_MORNING_BRIEF_V2.md` (the brief's IA - this document specifies and supersedes its section 4.2 centerpiece and absorbs 4.3-4.5 into one experience), `docs/ARGUS_INTELLIGENCE_SURFACES_V1.md` (pipeline rule, ownership, principles), `docs/ARGUS_NARRATIVE_ENGINE_V1.md`, `docs/ARGUS_INTELLIGENCE_PROFILE_V1.md`, `docs/ARGUS_INTELLIGENCE_MODEL_V1.md`.
**Working name:** **The Read** - the one screen a portfolio manager sees before the open. If users remember one screen from Argus, it is this one.

---

## 1. Purpose

The Read is the daily answer to four questions, in order: **what changed, why, what matters, what next.** It is not a summary of the news; it is the state of Argus's beliefs, rendered as an intelligence briefing - the software equivalent of the morning meeting where the senior analyst stands up and says: *"Here is the story that matters today, here is the evidence, here is how it spreads, here is what would prove us wrong, and here is what to watch before lunch."*

Three commitments distinguish it from every news product and every AI summary:

1. **It argues from evidence, not prose.** Every claim on the screen is a projection of the graph and engines; text exists to connect evidence, never to replace it.
2. **It remembers.** The Read opens with deltas against yesterday's beliefs - the one thing stateless products structurally cannot do.
3. **It carries its own falsifier.** The dominant thesis is never shown without what would break it. Confidence without a falsifier is marketing; the Read is intelligence.

Boundary with other surfaces (surfaces doc): the Morning Brief is the synthesis environment and The Read is its centerpiece; Explorer remains the investigation environment - The Read creates curiosity, Explorer satisfies it. The Read owns editorial ordering and voice; it owns no intelligence semantics.

### What this replaces (assumption challenged)

The current open-brief core - "Why Today Matters" prose, "Primary Narrative" prose, the generic Opportunities/Risks grid, and the Active Themes chips - **does not survive**. Those sections are the summarized-report pattern the v2 doc already condemned; The Read replaces all four with one coherent experience. The change ledger (B2, shipped) becomes The Read's opening zone. The summarizer survives only as the optional one-line voice over the thesis (grounded phrasing; its numbers never render). What remains around The Read in the brief: the regime strip above it, What to Watch and Supporting Evidence below it.

## 2. User questions answered

The nine questions, each mapped to a zone (section 3) and an engine (section 4):

| # | Question | Zone |
|---|---|---|
| 1 | What changed overnight? | Z1 The Ledger |
| 2 | What is the dominant narrative, as a thesis? | Z2 The Thesis |
| 3 | Why - what evidence carries it? | Z3 The Evidence Spine |
| 4 | Who is affected - across entity classes? | Z4 The Exposure Map |
| 5 | How does it propagate? | Z5 The Transmission Chain |
| 6 | What should I watch today, and why? | Z6 The Watch |
| 7 | What would invalidate it? | Z7 The Falsifier Block |
| 8 | Why does this matter to me? | R The Relevance Rail (overlay, not a zone) |
| 9 | Where do I investigate next? | Every zone's handoff (section 7) |

## 3. Information hierarchy

Seven zones plus one overlay, in strict priority order. The hierarchy encodes the doctrine: **change → belief → proof → blast radius → mechanism → agenda → humility.**

### Z1 - The Ledger (what changed)
The B2 change ledger, unchanged in derivation: up to six `MorningBriefDelta` rows (NEW / STRENGTHENED / WEAKENED / EXPANDED / CONTRADICTED / REMOVED), contradictions first, every row carrying recorded numbers. In The Read it gains one behavior: deltas that touch the dominant narrative's members visually associate with Z2 (same accent), so "what changed" flows into "what we believe."

### Z2 - The Thesis (the dominant narrative, argued)
Not a label - a claim with its credentials:

- **The narrative:** top-ranked `DerivedNarrative` (breadth, then coherence), labeled derived, with its member themes as chips.
- **The thesis line:** one sentence, deterministic template over real fields (driver -> mechanism -> exposure), optionally LLM-voiced per the voice rule. Example shape: *"AI capex is the organizing force: it is driving datacenter power demand and semiconductor capacity at once, with conviction rising in both."*
- **Why Argus believes it is dominant:** the ranking decomposed - member count, per-member conviction and trend (listed, never blended), coherence score with its explanation, distinct source pages. This is the anti-"AI Infrastructure, confidence 78%" move: the user sees the argument, not a number wearing a suit.
- **The standing contradiction:** the highest-severity active contradiction across members, rendered inside the thesis block, not hidden in a risks tab.

### Z3 - The Evidence Spine (why)
Four to six evidence rows, each: source class icon (filing / macro release / deal / wire / conversation / market confirmation), the assertion, the entities it links, tier badge, recency. Sourced from member themes' evidence reads and story clusters, ordered by tier then recency. Market data appears only as *confirmation* rows, never as thesis-creating evidence (I2). Rows are citations, not cards: one line each, click-through to the source surface.

### Z4 - The Exposure Map (who is affected)
The DerivedNarrative's deduped exposure, widened beyond tickers: **sectors, companies/ETFs, and - as the graph holds them - commodities, currencies, countries, and supply-chain links** (the ontology supports all of these today; coverage is data-dependent and renders only what exists). Grouped by entity class, each item carrying its member-count weight ("exposed through 3 themes") and trend. Consumer/capital-flow classes are future (marked, not faked).

### Z5 - The Transmission Chain (how it propagates)
One curated causal path - the signature visual. The profile engine's `transmission.strongestPath` for the narrative's anchor driver, rendered as a vertical spine of 4-6 hops with the real edge on every hop (type, strength, trend). A weakening hop renders weakened - **the chain is allowed to look broken, because that is the intelligence.** Never the full network: one path, with "N other paths" as the Explorer handoff. Adjacent-but-unpriced candidates (downstream expansion, low current strength, rising trend) may render as one ghost hop labeled derived - the "what benefits next" seed that B4's opportunity ranking will formalize.

### Z6 - The Watch (what to watch today, and why)
The agenda: derived watch items (shipped, dateless, honest) each bound to the zone it would move - *"utility and grid orders - confirms hop 3 of the chain"*; *"whether follow-up coverage resolves the contradiction - clears Z2's cap."* When the Event/calendar provider lands (v2 doc 4.6), items gain real dates and importance = strength of edges into the dominant narrative x proximity. Until then, no dates, ever.

### Z7 - The Falsifier Block (what breaks it)
Three kinds, kept distinct as in B1/B2: active **contradictions** (evidence engine, with severity), explicit **invalidation conditions** per member theme (prediction engine, verbatim), and structural **narrative breakers** (weakens-edges into the driver set). Standing rule: **Z2 may not render without Z7.** If no falsifier is derivable, that absence renders as its own honest warning ("no recorded falsifier - treat conviction with suspicion"), which is itself intelligence.

### R - The Relevance Rail (why it matters to you)
An overlay on Z2/Z4/Z5, not a content zone: relevance chips computed from the intersection of the user's followed themes and saved entities with the narrative's members and exposure. *"2 followed themes are members." "3 saved entities in the exposure map." "The chain passes through a sector you follow."* Section 5 governs it.

## 4. Which engine powers every section

> **Implementation status (B3+B4, 2026-07-09):** Z1-Z7 are live in production via `lib/theRead.ts` (zones Z2-Z7, composed into the Morning Brief VM) and `lib/intelligenceDeltas.ts` (Z1). B4 added Research Priority (ranked attention, decomposed; first consumer of `rankFutureOpportunities`), verified-dateless Catalysts, the Investigation Queue (Explorer exit ramp), and the first slice of the Relevance Rail (followed-theme priority boosts, badged YOURS, ordering-only). Still future: Z6 real dates (Event provider), Z4 consumer/flows classes, richer relevance signals (research history, portfolio).

| Zone | Engine(s) | Status today |
|---|---|---|
| Z1 Ledger | `intelligenceDeltas` (server ThemeMemory authoritative, device absence-only) | **live** (shipped, B2) |
| Z2 Thesis | `deriveNarratives()[0]`; member convictions + ThemeMemory trends; coherence + explanation; evidence-engine contradictions; summarizer as optional voice | **live** (engine unwired to UI) |
| Z3 Evidence Spine | member themes' evidence reads (`evaluateEvidenceForNode`, source tiers) + story clusters via `contributing_cluster_ids`; market rows from descriptive market data | **live**, evidence-class icons partial (atomic evidence log is future) |
| Z4 Exposure Map | `DerivedNarrative.exposure` (deduped, member-counted) + graph neighbors of non-equity classes | **live** for sectors/tickers; other classes data-dependent; consumer/flows **future** |
| Z5 Transmission Chain | `buildIntelligenceProfile(anchorDriver).transmission.strongestPath` + real edges (`causalMap`); ghost hop from `findExpansionCandidates("downstream")` | **live**; ghost hop **partial** (labeled derived) |
| Z6 Watch | `watchLineOf` derivations bound to zones; Event/calendar provider | **partial** (dateless); calendar **future** |
| Z7 Falsifiers | prediction engine `invalidationConditions`; evidence engine contradictions; weakens-edges | **live** |
| R Relevance | followed themes (`useFollowedThemes`) x saved entities (`useSaved`) x narrative membership/exposure | **live** signals; richer signals future (section 6) |

Every zone renders through the ProfileSection status discipline: live, partial with a visible note, or absent. Nothing in The Read may fabricate; sparse-graph mornings produce a smaller Read, and that is correct.

## 5. Universal vs personalized

**The doctrine: Argus personalizes prioritization, never truth.**

| Universal (identical for every user) | Personalized (per user) |
|---|---|
| The ledger's deltas and their derivations | Nothing - Z1 order may boost followed-theme deltas *within* severity class, never across it (a contradiction never sinks below a confirmation because the user likes the theme) |
| The dominant narrative, its ranking, thesis, coherence, contradiction | Nothing - the dominant narrative is the dominant narrative for everyone |
| Evidence rows, verdicts, tiers | Nothing |
| Exposure map contents and weights | Ordering within a class may float followed/saved entities first, visibly badged |
| The transmission chain and its edges | Nothing |
| Watch items and falsifiers | Ordering only |
| - | The Relevance Rail itself: which chips appear is per-user by definition |

Hard rules: relevance chips are **additive annotations** ("3 saved entities exposed"), never filters - hiding universal intelligence because it seems irrelevant is how users get blindsided. Personalized emphasis is always visibly badged (a "yours" accent), so a user can always distinguish "Argus believes" from "Argus knows you care." A signed-out or first-time user sees the full Read with an empty rail - the product is complete without personalization.

## 6. How personalization evolves

1. **v1 (implementable now):** followed themes + saved entities intersected with narrative membership and exposure. Deterministic, client-side, explainable ("because you follow X").
2. **v2 - observed research behavior:** Explorer visits and drawer focus events recorded (device-first, then per-workspace) as an implicit interest graph; chips gain "you have researched this driver 4 times this month." Requires an explicit, inspectable activity store - never silent tracking the user cannot view.
3. **v3 - portfolio awareness (opt-in):** a held-positions watchlist upgrades relevance from "you follow" to "you own," and the exposure map gains a your-book column. High trust requirement; explicitly opt-in.
4. **v4 - relevance memory:** personalization itself gets the memory treatment - "this narrative entered your relevance rail 6 sessions ago" - powered by the same snapshot machinery as market memory.
Every stage obeys the same constraint: relevance annotations must decompose ("why am I seeing this?") exactly as confidence does (I4 applied to personalization).

## 7. Explorer handoff strategy

The Read is a system of doors. Every zone hands off with **context**, via the existing entity routing (`explorerHref`) and cross-page focus system:

| From | Click | Lands |
|---|---|---|
| Z1 delta row | the entity | Explorer profile, evolution/timeline section (the delta's receipts) |
| Z2 member chip / driver | the entity | Explorer profile, left column (thesis, drivers, forward view) |
| Z2 "why dominant" decomposition | any member conviction | that theme's Explorer evidence stack |
| Z3 evidence row | the assertion | source surface (Feed story, M&A deal, Listen episode); the linked entity routes to Explorer |
| Z4 exposure item | the entity | Explorer profile; ETF/company rows open Market View |
| Z5 chain hop | the hop entity or edge | Explorer network view centered there, edge card open; "N other paths" opens the full network for the anchor driver |
| Z6 watch item | the bound zone reference | the Explorer section that item would confirm or deny |
| Z7 falsifier | the subject theme | Explorer forward view with invalidation conditions visible |
| R relevance chip | the followed/saved entity | Explorer profile; chip explains itself en route |

Handoff acceptance test: from any pixel of The Read, the user is at most two clicks from the underlying evidence record. If a zone cannot satisfy that, it is not ready to render.

## 8. Desktop layout

Within the existing brief container and visual identity (dark, dense, existing type scale - this document changes information architecture, not skin):

```
┌─ REGIME STRIP (existing) ──────────────────────────────────────────────┐
├────────────────────────────────────────────────────────────────────────┤
│ Z1 THE LEDGER - what changed since yesterday          (full width)     │
│   [CONTRADICTED] Oil Shock ... 2 contradicting stories this cycle      │
│   [STRENGTHENED] AI Infrastructure 58 -> 74 (+16) ...                  │
├──────────────────────────────────────────┬─────────────────────────────┤
│ Z2 THE THESIS                            │ Z5 TRANSMISSION             │
│   DERIVED · AI Capex                     │      AI Capex               │
│   thesis line (voice over engine data)   │        │ drives · 82 ↑      │
│   members: [AI Infra 74 ↑] [DC Power 61] │      AI Infrastructure      │
│   why dominant: 2 themes · coherence 71  │        │ drives · 76 →      │
│   standing contradiction: ...            │      Semiconductors         │
│ Z3 EVIDENCE SPINE                        │        │ supports · 88 ↑    │
│   ▸ [WIRE·T1] assertion ... 2h           │      NVDA                   │
│   ▸ [MACRO]   assertion ... today        │        │ (derived) ghost    │
│   ▸ [DEAL]    assertion ... 1d           │      Grid Equipment         │
│ Z4 EXPOSURE MAP                          │   [N other paths →Explorer] │
│   Sectors: Semis x2 ↑ · Utilities x1     ├─────────────────────────────┤
│   Companies: NVDA x2 · VST · AMD         │ Z7 FALSIFIERS               │
│   Commodities/FX/Countries: (as held)    │   invalidation · contradic- │
│   [R: 3 saved entities exposed]          │   tions · breakers          │
├──────────────────────────────────────────┴─────────────────────────────┤
│ Z6 THE WATCH - today's agenda, each item bound to the zone it moves    │
├────────────────────────────────────────────────────────────────────────┤
│ (existing brief sections follow: What to Watch merges into Z6;         │
│  Supporting Evidence groups under Z2's narrative)                      │
└────────────────────────────────────────────────────────────────────────┘
```

Reading gravity: top-left to bottom-right = change → belief → proof → exposure, with the chain and falsifiers as the persistent right rail - the mechanism and the humility always in view. The Relevance Rail renders as chips inside Z2/Z4, never as its own column (personalization annotates; it does not occupy structure).

## 9. Mobile adaptation

Mobile is the five-minute pre-open read in its purest form - one column, same order, aggressive economy:

- **Z1** capped at 3 rows ("+N more" expands). **Z2** thesis line + member chips + the contradiction; "why dominant" collapses behind one tap.
- **Z5** renders as a compact vertical spine (it is already vertical); hops are tappable, edge detail on tap rather than hover.
- **Z3/Z4** become horizontal snap-scroll rows of citation chips rather than lists.
- **Z7 never collapses.** The falsifier block is the one zone that must not be hidden behind a tap - shipping conviction while burying the falsifier violates the product's core promise.
- Explorer handoffs deep-link; investigation happens on desktop, and mobile says so honestly rather than shipping a cramped network view.

## 10. Future evolution

**Engine-driven upgrades (in dependency order):** `diffProfiles` upgrades Z1 to per-entity profile deltas -> Event/calendar provider gives Z6 real dates and graph-weighted importance -> server memory under narrative keys gives Z2 lifecycle ("building, 6 sessions") and The Read a same-narrative-yesterday diff -> resolved-prediction history lets Z7 show engine calibration ("this falsifier class has fired 3 of 11 times") -> B4 opportunity ranking formalizes Z5's ghost hop into a ranked second-order block.

**Experience-driven:** the Email Brief is The Read serialized (same VM); the Assistant answers "why?" questions by walking the same zones and citing the same evidence; a "Read replay" uses market memory to show what The Read said N days ago - the accountability loop that builds decade-scale trust.

### Example mornings

- **AI-focused user (follows AI Infrastructure, saved NVDA/VST/ASML):** identical Read to everyone; rail shows "2 followed themes are members · 3 saved entities exposed"; NVDA floats first within the companies class, badged. Z1 boosts the AI delta within its severity class.
- **Macro-focused user (follows Rates, Oil Supply):** same dominant AI narrative - the rail is honest about distance: "your followed themes are not members of today's dominant narrative"; the CONTRADICTED Oil Shock delta in Z1 carries their accent, and Z4's currencies/commodities classes order first. The macro user learns the AI story anyway - that is the point of never filtering.
- **Energy-focused user:** rail lights up where the chain crosses their world: "the transmission chain passes through Utilities, which you follow" - the hop is badged, and its Explorer handoff is their natural door.
- **First-time / signed-out user:** the complete Read with an empty rail and one quiet affordance ("follow themes to see what touches your book"). No personalization theater, no fake examples; the universal briefing must stand on its own - it is the product's best argument for creating an account.

## 11. Maintenance

This document governs The Read's product definition; the v2 brief doc governs the surrounding brief IA (its 4.2-4.5 are superseded by reference to this document); engine docs govern semantics. Implementation sprints (B3+) update section 4's status column as zones go live, in the same PR.
