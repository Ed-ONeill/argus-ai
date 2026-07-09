# Argus Morning Brief v2 - the Intelligence Briefing

**Status:** Information-architecture specification (Intelligence Surface 1 sprint, 2026-07). No code changed in this sprint; this document is the contract for the migration sprints in section 8.
**Parents:** `docs/ARGUS_INTELLIGENCE_MODEL_V1.md` (invariants, layering), `docs/ARGUS_INTELLIGENCE_PROFILE_V1.md` (per-entity read model), `docs/ARGUS_NARRATIVE_ENGINE_V1.md` (DerivedNarrative)
**Scope:** Information architecture only. The visual identity - dark theme, typography, density, the institutional voice - is explicitly out of scope and unchanged.

---

## 1. The question the homepage must answer

> "If I only had five minutes before the market opens, what does Argus believe I need to know?"

The emphasis is **change, causality, conviction, opportunity** - not chronology, not news. Bloomberg has the news. CNBC has the chronology. A generic LLM has the summary. The only thing Argus has that they do not is a causal graph with memory: it can say *what changed, why it changed, what that implies next, and how sure it is* - with every claim decomposable to evidence.

Every section below is held to one test, applied throughout this document:

> **The test:** does this help a professional investor understand the market better than Bloomberg, CNBC, or a generic AI summary? If no, the section does not ship in that form.

## 2. Critical evaluation of the current Morning Brief

What the homepage (`frontend/src/app/page.tsx`) actually renders today, and why it fails the test:

| # | Current element | What it actually is | Verdict |
|---|---|---|---|
| C1 | **The brief core** (`MarketBrief`: primary_driver, narrative_shift, trade_implication, risk_scenario) | An LLM summary of the top ~8 scored stories (`app/summarizer.py generate_market_brief`), memory-grounded but still prose-first | This is the "daily AI summary" problem verbatim. A generic AI product can produce this. **Demote from spine to voice** (section 6) |
| C2 | **"Confidence 50-95"** shown as the brief's conviction bar | An LLM self-assessment emitted by the summarizer, rendered with the same authority as engine numbers | **Violation of I4 in spirit**: the number decomposes into nothing. Replace with evidence-engine verdicts and theme convictions, which decompose. The LLM number must stop being displayed as intelligence |
| C3 | **Upcoming Catalysts** | A hardcoded constant (`UPCOMING_CATALYSTS`) claiming "CPI Release - Tomorrow", "FOMC - In 4 Days" **every day, forever** | **Fabrication (I1), full stop.** It is static marketing copy wearing a data badge. Delete in the first migration sprint regardless of what replaces it |
| C4 | **Opportunities** | Top-3 non-bearish theme names, no reasoning | Names without "why" fail the test - a theme name is not an opportunity. Replace with the prediction engine's ranked opportunities, which carry `why[]` |
| C5 | **Key Risks** | LLM `risk_scenario` prose + bearish theme names | Same failure: undifferentiated. No falsifiers, no contradictions. The engines have both |
| C6 | **Active Themes chips** | Six theme names | Redundant once the dominant narrative shows its members. **Remove** |
| C7 | **Regime change badge** | localStorage tracking of yesterday's regime string - the only "what changed" element on the page | Right instinct, one fact. Generalize into Section 1 (What Changed) |
| C8 | **Sealed envelope -> Open Brief click** | Theater between the user and the intelligence | Charming once, friction daily. Recommendation: signed-in users get the brief open by default; the seal remains only as the signed-out/guest entry |
| C9 | **Intelligence Layers / Capabilities sections** | Static marketing copy, shown to signed-in users on every visit | Marketing on the primary intelligence surface. Move to signed-out view only |
| C10 | **Engine wiring** | None. The homepage consumes `market_brief` + raw `theme_intelligence` only; it never builds the graph and touches none of: profiles, derived narratives, evidence engine, prediction engine, causal map, frontend memory, backend memory API | The intelligence architecture is invisible on the front door. This is the gap this redesign closes |

Summary: the current brief tells you *what the top stories say*. It does not tell you *what Argus believes*, because nothing that constitutes Argus's beliefs (the graph, the engines, the memory) is connected to it.

## 3. Design rules for v2

Inherited: I1 no fabrication, I2 descriptive market data, I3 determinism, I4 every number decomposes, I5 read-only projection. Brief-specific:

- **R1 - Change outranks state.** Yesterday's reader already knows the state. Lead with deltas.
- **R2 - Claims over stories.** Stories appear only as evidence under the claim they support, never as the organizing unit.
- **R3 - Argus has an opinion, and shows its work.** Every opinionated line (dominant narrative, next transmission, ranked opportunity) must carry its decomposition: the edges, verdicts, and deltas behind it - one tap away at most.
- **R4 - Honest sections or no sections.** Every section renders from live data, renders partial with a visible note, or does not render. No placeholder intelligence. (This rule is what kills C3.)
- **R5 - The LLM writes voice, never facts.** Numbers, deltas, rankings, chains come from engines; the summarizer may phrase a headline over them (section 6).

## 4. The v2 information hierarchy

> **Supersession note (2026-07-09):** sections 4.2-4.5 are now specified in detail by `docs/ARGUS_NARRATIVE_CENTERPIECE_V1.md` ("The Read"), which merges them into one flagship experience (thesis + evidence spine + exposure map + transmission chain + falsifiers, with the B2 change ledger as its opening zone and a personalization rail governed by prioritization-never-truth). Where that document and these sections differ, it wins. Sections 4.1, 4.6, and 4.7 remain governed here.

Seven sections, in priority order. "Powered by" names the exact existing system; **Status** is live / partial / future *for the data*, independent of wiring effort.

---

### 4.1 WHAT CHANGED SINCE YESTERDAY (new - leads the brief)

The delta ledger. Five to eight lines, each a single change with magnitude and direction:

- "AI Infrastructure conviction 61 -> 66 (+5)"
- "Oil Supply Shock weakening: evidence flow stopped 2 cycles ago"
- "2 new relationships discovered around NVDA (supplier, macro)"
- "Utilities entered the AI Capex transmission chain"
- "Regime: Risk-On, unchanged 4 sessions"

**Powered by:**
- **Backend theme memory** (`app/theme_memory.py` via `/api/memory/changes`, `/strengthening`, `/weakening`, `/stale`): per-cycle conviction/momentum/lifecycle deltas, confirming/contradicting evidence counts, persisted server-side across pipeline cycles. **This exists today and is consumed by nothing.** It is the single biggest unlock in this redesign - real cross-session "what changed" data, already on disk, already behind an API.
- Frontend memory engine (`compareSnapshots`, `themeSnapshots.getThemeDelta`) for graph-level deltas (relationships discovered, evidence gained) - **partial**: device-local, only as old as the user's own usage; each line badges its basis.
- Regime tracking (C7) folds in as one line.

**Status:** live (backend deltas) + partial (frontend graph deltas, badged). **Future:** `diffProfiles` (profile doc section 6.3) upgrades this to per-entity profile deltas; narrative-key deltas arrive when server memory accrues under DerivedNarrative keys.

**Rationale / the test:** Bloomberg cannot tell you what *its own model* believed yesterday. This section is pure memory - the one asset a stateless news feed and a stateless LLM both lack. It is first because it re-anchors a returning reader in seconds.

---

### 4.2 DOMINANT MARKET NARRATIVE (the centerpiece)

Not "Primary Narrative" prose. A structured object:

| Element | Source |
|---|---|
| The narrative + member themes | `deriveNarratives()[0]` - the top-ranked DerivedNarrative (breadth, then coherence), labeled derived per its contract |
| Current status | member forward views (`forward` section: per-theme direction/probability), member lifecycle states from backend memory |
| Conviction | **per-member theme conviction and evidence verdicts, listed - never one blended number** (Narrative doc section 7.1). The C2 LLM confidence bar dies here |
| Why Argus believes it | driver edges with strength/trend + evidence verdicts + distinct source pages (`DerivedNarrative.members`, `.evidence`) |
| Most exposed sectors / companies | `DerivedNarrative.exposure` - already deduped with member counts (an asset exposed by 3 themes shows once, x3) |
| Potential next transmission | prediction engine `nextLikelyEvents` + downstream expansion candidates not yet in the chain (`findExpansionCandidates(map, "downstream")`) - labeled as derived expectation |
| Most important contradiction | evidence engine `contradictions` across members, highest severity first |

**Powered by:** narrativeDerivation (System 2, currently unwired), evidenceEngine, predictionEngine, causalMap. When `deriveNarratives()` returns nothing (sparse graph), fall back to the strongest single theme's profile - honestly labeled as a theme, not a narrative.

**Status:** live. Every field above exists; none is wired to any surface.

**Rationale / the test:** CNBC gives you ten stories; a PM wants the one story that organizes them, with its exposure map and its strongest counter-argument attached. Showing the top contradiction *inside* the centerpiece is the anti-Bloomberg move: news products never argue against their own headline.

---

### 4.3 MARKET TRANSMISSION (curated causal chain)

One clean chain, not the full network:

`AI Capex -> AI Infrastructure -> Semiconductors / Utilities -> NVDA, VST -> "Blackwell sold out"`

- One representative strongest path: the profile engine already computes exactly this (`transmission.strongestPath` + stage summaries) for the narrative's anchor driver.
- Each hop carries its real edge (type, strength, trend); a weakening hop renders as weakening - the chain is allowed to look broken, because that IS the intelligence.
- Link to the Explorer for the full network. The brief explains; the Explorer explores.

**Powered by:** `buildIntelligenceProfile(anchorDriver).transmission` + `causalMap` stages; visual grammar reuses the existing graph components (`components/graph/*`, as `marketMap.ts` already proves).

**Status:** live.

**Rationale / the test:** "Why is this stock moving" is the question every terminal answers with a chart. Argus answers with the causal chain upstream of the chart. Curated to one path because the brief's job is explanation; the full map's job is discovery.

---

### 4.4 SECOND-ORDER OPPORTUNITIES

Answers exactly: *"what is likely to benefit next if the dominant narrative continues?"* - with reasons.

- `rankFutureOpportunities()` (prediction engine) already ranks themes by expected upside, evidence quality, transmission velocity, cross-market confirmation - **and carries `why[]`**. It is consumed by nothing today.
- Filter/boost candidates causally adjacent to the dominant narrative (downstream expansion candidates not yet strongly priced into the chain: present in the graph, low current edge strength, rising trend).
- Each entry: entity, the causal route from the dominant narrative, the why lines, and its evidence verdict. Three items maximum.

**Powered by:** predictionEngine (`rankFutureOpportunities`), causalMap (`findExpansionCandidates("downstream")`), evidenceEngine verdicts.

**Status:** live (engine exists); **partial** honesty note - "second-order" reach is bounded by graph depth today (two hops); deeper inference chains are future work.

**Rationale / the test:** replaces C4's bare theme names. A ranked list with decomposable reasons ("supplier edge to the narrative's strongest company, evidence moderate, velocity +4") is something neither a news feed nor a naive summary can produce.

---

### 4.5 KEY RISKS (three kinds, kept distinct)

What would invalidate today's dominant thesis - separated, because they behave differently:

1. **Contradictions** (active now): evidence engine `contradictions` with severity - opposing edges that already exist.
2. **Invalidation conditions** (falsifiers): prediction engine `invalidationConditions` per member theme - explicit "this breaks if X".
3. **Narrative breakers** (structural): `weakens`-group edges into the narrative's drivers/members, plus `rankFutureRisks()` (downside momentum, contradiction, crowding - also unwired today) and `warningSignals`.

**Powered by:** evidenceEngine, predictionEngine (`invalidationConditions`, `rankFutureRisks`, `warningSignals`), graph weakens edges.

**Status:** live. LLM `risk_scenario` (C5) is retired from this section; if kept at all it becomes voice over the falsifiers (R5).

**Rationale / the test:** "Key risks: volatility" is filler. "This thesis inverts if datacenter power capex guidance rolls over - and two contradicting observations already exist (severity 12)" is a risk section a desk would read. The falsifier-first framing is the model doc's own standard (question 6 of the profile).

---

### 4.6 UPCOMING CATALYSTS (kept, made honest)

The current section is deleted outright (C3 - fabricated). Its replacement renders only what is real:

- **Derived expectations** (live): prediction engine `nextLikelyEvents` per relevant theme - labeled "derived from the graph", not presented as a calendar.
- **Known release cadences** (partial): FRED `EconomicRelease` entities carry series cadence; "CPI prints monthly; last observed print moved this driver" is honest without a calendar.
- **A real economic/earnings calendar** (future): requires a calendar provider (the model doc's Event entity, section 2.2 "proposed"). Until it lands, this section is small - and that is correct. Prioritization, when it lands: catalyst importance = (strength of edges from the affected driver into the dominant narrative) x proximity - i.e. *why it matters* is the transmission path it would move, rendered per item.

**Status:** partial today, honest-by-construction; full version gated on the Event/calendar provider.

**Rationale / the test:** every terminal has a calendar. Argus's version is only better if each catalyst is wired to the chain it would move - which requires the graph, not the calendar, to be the organizing layer. Ship small and honest until then (R4).

---

### 4.7 SUPPORTING EVIDENCE (stories move to the bottom)

Stories are evidence, not the product.

- Grouped **beneath the claim they reinforce**: dominant narrative first (via `contributing_cluster_ids` + graph `mentions` edges), then other active themes.
- Each story carries its role ("supports AI Infrastructure, tier-1 source") - the feed's source-tier authority and the evidence engine's reliability weights already exist to power the badge.
- Capped; the Feed remains the full surface. The brief shows the evidence spine, not the stream.

**Powered by:** story clusters + `feedRanker` theme-gating + evidence engine source reliability.

**Status:** live.

**Rationale / the test:** this is the structural inversion that makes the page a briefing instead of a feed: Bloomberg organizes claims under stories; Argus organizes stories under claims.

---

## 5. Sections removed or demoted (and why)

| Current | Disposition |
|---|---|
| "Why Today Matters" (`narrative_shift`) | **Merged into 4.1** - it was a prose version of "what changed"; the delta ledger replaces it with decomposable lines. May survive as the LLM voice-over of 4.1 (R5) |
| "Primary Narrative" (`primary_driver` prose) | **Replaced by 4.2** - prose demoted to optional headline voice over the DerivedNarrative |
| Confidence bar (LLM 50-95) | **Removed** (C2). Conviction is shown per-theme/per-edge where it decomposes |
| Trade Implication | **Removed from v2.** It is unsourced advice-shaped prose. Its honest successor is a positioning read derived from sector-rotation predictions (`predictSectorRotation`) - future, and clearly labeled analysis, not advice |
| Active Themes chips | **Removed** (C6) - redundant with 4.2 members |
| Upcoming Catalysts (hardcoded) | **Deleted** (C3); replaced per 4.6 |
| Sealed envelope | **Demoted** to signed-out/guest entry; signed-in users land on the open brief (C8) |
| Intelligence Layers / Capabilities marketing | **Signed-out view only** (C9). The signed-in homepage is the briefing, full stop |

## 6. The role of the LLM brief after v2

`generate_market_brief` is not deleted - it is **demoted from spine to voice**:

- It may phrase the dominant-narrative headline and the "what changed" lead sentence, *grounded in the engine outputs it is handed* (it already receives memory grounding; v2 hands it the delta ledger and DerivedNarrative instead of raw stories).
- Its `market_regime` remains useful as a regime label (cross-checked against `useMarketState`).
- Its `confidence` number is never rendered again (C2).
- Every LLM-phrased line renders with the engine data that grounds it reachable in one tap - if the voice and the data disagree, the data wins and the line is a bug.

This keeps the institutional voice without letting a summarizer impersonate the intelligence.

## 7. Engine coverage map

| Section | Engine(s) | Data status | Wiring status today |
|---|---|---|---|
| 4.1 What Changed | backend theme_memory API; frontend memoryEngine/themeSnapshots; (future diffProfiles) | live + partial | **unwired** |
| 4.2 Dominant Narrative | narrativeDerivation; evidenceEngine; predictionEngine; backend lifecycle | live | **unwired** |
| 4.3 Transmission | intelligenceProfile.transmission; causalMap | live | **unwired** |
| 4.4 Second-Order Opportunities | predictionEngine.rankFutureOpportunities; causalMap expansion | live (partial depth) | **unwired** |
| 4.5 Key Risks | evidenceEngine contradictions; predictionEngine invalidations/rankFutureRisks | live | **unwired** |
| 4.6 Catalysts | predictionEngine.nextLikelyEvents; FRED cadence; (future Event/calendar provider) | partial | current version fabricated - delete |
| 4.7 Evidence | clusters + feedRanker + evidence source tiers | live | partially wired (feed only) |

The pattern is stark: six of seven sections are powered by engines that exist and are consumed by nothing on the homepage. This redesign is overwhelmingly *wiring*, not new intelligence.

## 8. Migration plan

Incremental, one sprint each, mirroring the System 1/2 pattern (contract -> tests -> integration; zero visual-identity change; old renders remain as fallbacks until their replacement section is live):

1. **Sprint B1 - Brief view model (no UI). Done (2026-07-08):** `lib/morningBrief.ts` (`buildMorningBrief(inputs)`, section-status-wrapped, injected inputs) + `hooks/useMorningBrief.ts` (feed read, graph build via `useIntelligenceGraph`, memoized VM). The page consumes the VM everywhere. Delivered honesty fixes: `UPCOMING_CATALYSTS` deleted and replaced by a dateless derived "What to Watch" section (badge DERIVED, no timing column); the C2 summarizer confidence is gone - conviction is the leading theme's backend conviction with a full decomposition (evidence counts, ThemeMemory cross-session trend, evidence-engine verdict when the graph resolves), exposed as a tooltip; risks gain the prediction engine's invalidation condition when the graph resolves it; summarizer prose carries the voice note in the VM. Cross-session memory arrives via the `ThemeIntelligence.memory` payload (already attached server-side) rather than a separate `/api/memory/*` fetch. Tests 78.x cover determinism, honest degradation, no-summarizer-confidence, dateless watch items, and the falsifier honesty branch.
2. **Sprint B2 - Section 4.1, the change ledger. Done (2026-07-08):** `lib/intelligenceDeltas.ts` is the canonical change-detection layer (`MorningBriefDelta`, kinds NEW / STRENGTHENED / WEAKENED / EXPANDED / CONTRADICTED / BROKEN / REMOVED; BROKEN is vocabulary-only in v1 - no system records a terminal invalidation yet, and deriving one from thresholds would fabricate it). Precedence: server memory (the `ThemeIntelligence.memory` payload from `app/theme_memory.py`) is authoritative; device snapshots (`themeSnapshots.getTrackedThemes`, new export) cover absence detection only, badged LOCAL and time-bounded to 3 days. Every delta answers the four questions (what / why / matters / watch) with recorded numbers; watch/driver derivations consolidated here (morningBrief imports them - one logic home). Rendered as the first content section of `BriefOpen` in the existing row grammar; matters+watch ride in the tooltip until B3. `vm.changes` degrades to unavailable on first cycle. Tests 79.x. Deferred to B3: evidence regrouping (4.7) and the summarizer-prose demotion, which belong with the narrative centerpiece layout.
3. **Sprint B3 - Sections 4.2 + 4.3.** DerivedNarrative centerpiece + curated transmission chain (first production consumer of System 2, exactly as Explorer was for System 1). Homepage layout reflows to the new hierarchy; envelope demotes (C8); marketing sections move signed-out (C9).
4. **Sprint B4 - Sections 4.4 + 4.6.** Opportunity ranker wiring; honest catalysts (derived expectations + cadences). The full calendar remains gated on the Event provider (model doc sequencing).
5. **Later (data work, already sequenced in the model doc):** diffProfiles -> richer 4.1; server memory under narrative keys -> narrative lifecycle in 4.2; Event/calendar provider -> full 4.6.

Each sprint runs the standing gates: `npx tsc --noEmit`, `npx tsx src/lib/intelligenceTests.ts`, `npm run build`, plus the honesty tests for any new section.

## 9. The test, applied one last time

| Section | Better than Bloomberg/CNBC/generic AI because... |
|---|---|
| What Changed | requires a persistent model of yesterday's beliefs - stateless products cannot have one |
| Dominant Narrative | one organizing story with exposure map AND its strongest contradiction attached |
| Transmission | answers "why" with a causal chain, not a chart |
| Second-Order | ranked, reasoned, decomposable - not a listicle |
| Key Risks | falsifiers, not vibes |
| Catalysts | small and honest now; graph-prioritized when real - never a fake calendar again |
| Evidence | stories under claims, not claims under stories |

## 10. Maintenance

This document governs the Morning Brief's information architecture. Section additions/removals require updating it in the same PR. Engine contracts are governed by their own docs (model, profile, narrative); where this document and an engine doc disagree about a field's honesty status, the engine doc wins.
