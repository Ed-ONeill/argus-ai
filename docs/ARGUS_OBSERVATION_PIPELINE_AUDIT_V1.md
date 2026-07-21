# ARGUS OBSERVATION PIPELINE AUDIT — V1

**Date:** 2026-07-21
**Scope:** Every observation entering Argus, traced through four stages: (1) ingestion (`app/feeds.py` and satellites), (2) reasoning & memory (`app/theme_graph.py`, `app/explanations.py`, `app/theme_memory.py`, `app/institutional_memory/`), (3) the API boundary (`api/routes/*` ↔ frontend fetch layer), (4) the frontend intelligence layer (`lib/intelligenceGraph*`, legacy reasoning engines, surfaces).
**Question asked at every point:** where is institutional information **lost**, **degraded**, **delayed**, or **never captured**?
**Prioritization rule:** expected increase in intelligence quality, not implementation difficulty.
**UI rule:** no UI changes are proposed except where they directly expose intelligence this audit shows is already computed and unreachable.

Finding IDs are local to this document: `I#` ingestion, `T#` reasoning/memory, `B#` boundary, `C#` client/frontend. Cross-references to existing registers (E1–E8 feed editorial, R1–R8 reasoning engine, Memory V2 audit facts) are noted inline.

---

## 0. The shape of the problem

Four structural facts explain most of the individual findings:

1. **The pipeline destroys its own primary currency at the front door.** The editorial and reasoning engines are built on corroboration and first-observation decay (E1/E2 fixes, event lanes, confidence bands). But ingestion-stage dedup deletes corroborating articles *before anything counts them*, and keeps the freshest duplicate rather than the earliest. Corroboration counts and first-seen times downstream are systematically wrong, so every stage that spends them is spending counterfeit currency.

2. **The system has no memory of its own observations.** The raw observation store is a set of pickles overwritten every 5 minutes; event identity changes across cycles; the momentum tracker resets on restart; Explanations are never persisted; Supabase institutional memory is off by default; the frontend's longitudinal layer is per-device localStorage. Argus re-derives the world every 5 minutes and calls the residue "memory."

3. **The best intelligence Argus produces is computed, shipped, and not consumed.** The canonical Explanation, the typed `transmission_chain`, the theme-memory evidence trails, the v2 archive (relationship registry, historical graph reconstruction), and the historical-analog engine all exist and are paid for every cycle. Almost none of it reaches a surface; legacy client-side engines re-derive weaker versions instead (R4 split-brain, confirmed still live).

4. **Where real data is missing, several layers fabricate it** — fake live quotes, back-extrapolated momentum trends, fabricated ingest timestamps, breadth derived from ontology size, a counterevidence search that can never match. Fabricated intelligence is worse than absent intelligence: it spends the product's epistemic credibility.

---

## 1. Stage 1 — Ingestion findings

### Field capture

- **I1 — Only title + ≤500-char snippet ever captured; body text never fetched. HIGH.** `feeds.py:1702-1715`, `_MAX_SNIPPET` at `feeds.py:34`. RSS fields dropped: author, categories, GUID, `content:encoded` full text, updated-vs-published. Every downstream stage — classification, entity extraction, clustering, LLM summarization (`summarizer.py:110` "Base everything strictly on the headline and snippet"), event specificity regexes (`events.py:281-285`) — reasons over teaser text. Deal terms, figures, and quoted guidance in bodies are structurally unreachable.
- **I2 — Argus never records when it first observed an item. MED-HIGH.** Only publisher `published_dt` is kept (`feeds.py:1419`); no `fetched_at`. Items without a parseable date are sorted to epoch, excluded in `fresh_only` mode (`feeds.py:1546`), scored 0 recency, or treated as 24h old (`top_stories.py:215`).
- **I3 — Per-source fetch caps. MED.** `_ITEMS_PER_FEED = 12` (`feeds.py:29`); SEC watchlist capped at 5 filings/company (`feeds.py:867`). Busy-day coverage past the cap is never seen.

### Dedup / clustering

- **I4 — Cross-source dedup destroys corroboration before it is counted. HIGH — the single worst loss in the pipeline.** `_dedup_items` (`feeds.py:1460-1473`) runs before scoring/clustering/events and deletes any item at title-Jaccard ≥ 0.50, keeping one survivor with no merge record. `corroboration_count` (`events.py:504-505`), the confirmed/developing lanes, and the 1.5× corroboration multiplier (`events.py:310`) then count *survivors*. Reuters + FT + Bloomberg running the same story — the classic confirmation signal — registers as `corroboration_count=1`, "developing." E2 ("corroboration computed and not spent") is understated: it is unspendable, because ingestion burns it.
- **I5 — Dedup keeps the freshest duplicate; true first-seen is deleted. HIGH.** Items are sorted newest-first before dedup (`feeds.py:1541,1549,1462`), so the survivor is the latest re-report. `events.py:34-36` claims decay runs "from the EVENT's first observation — never the latest re-report," but upstream dedup guarantees the earliest telling usually isn't in the member set. Decay under-applies; "who reported it first" is unrecoverable.
- **I6 — Merged duplicates' distinct snippets/facts are discarded** (follows I4); clusters retain primary + ≤6 related (`clustering.py:32`), and evidence lists/corroboration are computed from the ≤7 retained members only.
- **I7 — Event identity is unstable across cycles. HIGH.** `cluster.id = md5(primary.title + primary.url)` (`clustering.py:306-308`) and `MarketEvent.id == cluster.id` by design (`events.py:9-15`). The primary is whichever item ranks first *this cycle*, so the same real-world event changes id as scores drift. Everything keyed on event ids — theme `contributing_cluster_ids`, archive `evidence_refs`, `feed.explanations` keys, prediction-ledger refs — silently fragments. There is no cross-cycle event registry.
- **I8 — Clustering windows (3–8h) are far shorter than the 48h feed window. MED-HIGH.** `clustering.py:28-39`. Day-2 follow-ups can never join day-1's cluster: stories fragment, corroboration splits, events double-surface. `_fold_near_duplicates` (`events.py:403`) patches only near-identical titles.
- **I9 — Feed-stage entity extraction misses plain company names. MED.** `_extract_entities` (`feeds.py:395-429`) sees only `$TICKER` / ALL-CAPS tokens; the registry resolver runs only at event build (`events.py:523`), so the shared-entity clustering path (`clustering.py:258`) is blind to "Apple" written normally.

### Delay

- **I10 — Hung feeds silently stall workers. LOW-MED.** `feedparser.parse(url)` has no HTTP timeout (`feeds.py:32` admits it); `future.result(timeout=8)` (`feeds.py:1519`) abandons the future while the thread still blocks one of 6 workers.
- **I11 — Relative-age strings frozen at fetch time. LOW.** `feeds.py:1713` bakes `format_age()` into the item.

### Classification

- **I12 — Suppressed items are unrecoverable and mostly uncounted. MED.** Hard-excluded and below-threshold items are dropped (`feeds.py:1330-1341`, `feeds.py:1556-1572`) with a DEBUG line and one counter. `PerSourceStats` (`feeds.py:604-622` — the purpose-built funnel diagnostic: `raw_fetched`, `post_dedup`, `hard_excluded`, `dropped_titles`) is defined but no counts ever reach `ProcessedFeed` or the API; there is no way to measure what the hundreds of regex walls (`feeds.py:56-1221`) are killing.
- **I13 — 4-category display taxonomy + Markets soft-cap deletes weak corroborators before clustering/themes. LOW-MED.** `feeds.py:510-569`, `background.py:158`.
- **I14 — Title-regex penalties keep no near-miss record.** An event phrased as a question is buried; no penalized-but-tier-1 sample is retained to tune against (compounds I12).

### Coverage (never captured)

- **I15 — No market/price data anywhere in the spine. HIGH.** No prices, yields, spreads, volumes, FX in `app/`. Items assert "IMPACT: Bearish for IG spreads" (`summarizer.py:93`) with no ground truth to validate any directional claim. The prediction-outcome ledger and M8.1 say-do layers have no data source. (See B14: real market routes exist in the Next.js server and never reach the backend.)
- **I16 — Wire coverage has quietly collapsed. HIGH.** Reuters, WSJ, AP, Benzinga, BusinessWire, GlobeNewswire, PR Newswire all dead (`feeds.py:869-880`); live tier-1 is effectively Bloomberg RSS + FT + CNBC + Nikkei. Feed failures log at DEBUG (`feeds.py:1724`), so the next death will also be silent.
- **I17 — SEC ingestion is 12 hand-picked tickers, 8-K only. MED-HIGH.** `_SEC_WATCHLIST` (`feeds.py:824-840`): no 10-K/10-Q, S-1, 13D/13F; filing content reduced to item-code labels (`feeds.py:1652-1654`) — filing text never fetched.
- **I18 — Never ingested at all: earnings transcripts (the M8.1 dependency — `events.py:158` classifies a "transcript" kind no source can produce), issuer IR releases, analyst estimates, positioning/short interest, economic-calendar futures.**

### Persistence

- **I19 — No durable observation store; latest snapshot only. HIGH.** In-memory RSS cache (`feeds.py:1483`) + `ProcessedFeed` pickles overwritten every cycle (`processed_cache.py:185`, 3 files in `data/feed_cache/`). Items that age out or lose the score race cease to exist. Supabase institutional memory is **off by default** (`config.py:80`). The `new_this_cycle` diff (`background.py:609-617`) is computed, logged, and discarded.
- **I20 — LLM enrichment capped at 15 items/refresh and cache-volatile. MED.** `MAX_AI_ITEMS = 15` (`summarizer.py:40`); `_SUMMARY_CACHE` in-memory; restarts re-spend LLM calls and degrade top-story selection until re-summarized.

---

## 2. Stage 2 — Reasoning & memory findings

### Evidence grounding

- **T1 — The counterevidence search is structurally empty. HIGH.** `explanations.py:402-440` filters edges *into* theme nodes for `relationship == "pressures"`, but `narrative_graph.py:309-337` only creates `pressures` edges theme→sector; edges into themes are `drives`/`correlates` only. `recorded_pressures_edges` can never match; the Explanation still claims "Symmetric search executed." The contradiction cap (`explanations.py:466`) almost never fires from graph structure. R6 in its sharpest form.
- **T2 — Explanations are ephemeral. HIGH.** `background.py:483-498` + `processed_cache.py:64`: verdict bands, counterevidence, chains, `content_hash` live only in the in-memory `ProcessedFeed`; the institutional-memory writer never persists them. No record of how any event's confidence band evolved.
- **T3 — Briefs reason over `(summary or title)[:120]` for 6–8 items. MED.** `summarizer.py:389-469,533-623`. Magnitudes truncated before the LLM sees them; LLM self-reports `confidence` 50–95 with no evidence linkage; no provenance of which stories fed the brief.
- **T4 — The evidence trail stores ontology as observation. MED.** `theme_memory.py:349-359`: `risks` = static `second_order_effects` config; `root_causes` and `catalysts` are the *same* `macros` list under two names. Only `story_ids`/`sources` are observational.
- **T5 — Theme evidence capped at top-5 clusters. MED.** `theme_graph.py:444-447`: corroborating stories 6+ leave no trace in theme records, memory trails, archive refs, or narrative refs (`graph_adapter.py:411`).

### Memory persistence & read-back

- **T6 — Momentum/persistence reset on every restart and pollute the sealed archive. HIGH.** `ThemeMomentumTracker` (`theme_graph.py:118-211`) is process-lifetime and never rehydrates from `theme_memory.json`. Restarts reset mature themes to "emerging"/delta 0/persistence 0; the resets flow into archive snapshots (`snapshot_builder.py:142`) as spurious state changes, and `_delta_section` reads "unchanged," masking real moves.
- **T7 — "Sessions" are 5-minute cycles. HIGH (vocabulary inflation).** `theme_memory.py:55-60,391-403`: "Strengthening for 6 sessions" = 30 minutes; the ring holds ~10h of observations while the language implies multi-day persistence.
- **T8 — Sub-threshold observations leave zero trace. MED.** Emission gates run before memory update (`theme_graph.py:411-428`); memory cannot distinguish "not observed" from "observed below the bar"; competition-suppressed themes (`theme_graph.py:481-511`) are recorded as absent and go stale in 6h.
- **T9 — Memory, stakes, and falsifiers are gated off while their engines exist. HIGH.** `explanations.py:528-533` hard-gates the Explanation `memory` section ("Reserved (IRE-4)") even though the M3.4 analog engine runs and is served (`memory_v2.py:343-360`); the prediction ledger exists but `stakes` is never reported; themes carry `second_order_effects` and the graph has `pressures` edges but no falsifier is ever attached. Memory is write-mostly with respect to reasoning.
- **T10 — Confirm/contradict counts accrue from largely unlabeled data. MED.** `theme_memory.py:76-108`: inspects only `cluster.primary`; depends on the LLM `impact` label that exists for ≤15 items/refresh and dies on restart; for neutral themes *any* story confirms (`:106-107`), so `is_persistent_pattern` inflates permanently.

### Aggregation

- **T11 — Breadth is fabricated from ontology size. HIGH.** `theme_graph.py:408`: `breadth_raw = min(len(cfg["related_industries"]), max(1, n_clusters))` — actual industries of contributing clusters are never computed. This pseudo-breadth gates WMN promotion (`themes.py:28,84`), is archived as `breadth`, and renders as "N sectors."
- **T12 — Industry activation is winner-take-all. MED.** `theme_graph.py:581-648`: only the best theme's score/sentiment survives; mixed bullish/bearish pressure on an industry is unrepresentable, and the archive inherits the single-winner state.
- **T13 — Direction is majority-vote over coarse labels everywhere. MED.** `sectors.py:825-839` and every `_majority_sentiment`: magnitude and split (5 bull vs 4 bear) discarded at each rollup.
- **T14 — Narrative graph caps (18 nodes / 25 edges) truncate silently; rotation/correlation edges are appended last and die first.** `narrative_graph.py:257,386`. LOW-MED.

### LLM-stage degradation

- **T15 — LLM `impact`/`why_it_matters` re-enter the "no-LLM" deterministic layers unmarked. MED.** `summarizer.py:86-141`: minted from headline+snippet, stored without model version/confidence/timestamp, then consumed by `_item_sentiment` (theme momentum, sector sentiment, memory confirm/contradict) and the WMN thesis (`themes.py:262`). R2 confirmed live, with the added fact that provenance is absent.
- **T16 — `_select_narrative_variant` uses builtin `hash()` → varies per process restart. LOW.** `sectors.py:481-483`.
- **T17 — Two regime labels persist in parallel with no disagreement record. LOW.** `summarizer.py:497-507` vs `sectors.py:745`.

### Temporal reasoning

- **T18 — Materiality judged on a 5-minute delta with a ±3 deadband. MED.** `explanations.py:365-394`: a theme drifting +2/cycle all day never registers as material; multi-day trend data in ThemeMemory is not consulted. "No material change" asserted on minute-scale evidence.
- **T19 — The daily seal is 23:55 UTC state, not market-close, and intra-day peaks/troughs never reach the archive. LOW (documented).** `institutional_memory/writer.py:8-15`.
- **T20 — ThemeMemory trails carry ingestion time only; contributing stories' publication times are not in the trail.** (Event vs snapshot time is otherwise sound.)
- **T21 — Credibility gate keeps the analog engine dark ~2 months with no progress signal. MED.** `institutional_memory/reasoning.py:39-44,74-76`: ≥60 sealed days, ≥2 regimes, ≥10 tested outcomes; silently returns `insufficient_history`.

### Dead compute

- **T22 — `language_quality.score_text_quality` computed per theme per cycle; debug-log only.** LOW.
- **T23 — `PropagationChain`s built every cycle; persisted nowhere, consumed nowhere in backend.** LOW.
- **T24 — `causal_chain.py:65` treats ontology list order as strength (`upstream[0]`), and the archive keeps this weak prose while the typed hop chains (rel UIDs + confidences) are *not* archived.** LOW-MED.

---

## 3. Stage 3 — API boundary findings

### Computed but never serialized

- **B1 — All nine per-item scoring components dropped. HIGH.** `feeds.py:590-598` computes `source_quality_score`, `institutional_score`, `graph_alignment_score`, penalties/bonuses; `FeedItemSchema` (`api/routes/feed.py:49-84`) serializes only the blended `signal_score`. The frontend re-ranks blind (see C15).
- **B2 — `published_dt` not serialized on primary feed items; only the display string "2h ago" crosses. HIGH.** (`RelatedStorySchema` *does* get `published_ts` — `feed.py:135,147` — the inconsistency is per-schema.) Direct cause of C12.
- **B3 — Ingestion funnel diagnostics unreachable** (pairs with I12): nothing from the suppression funnel crosses the boundary; only error strings and kept-counts do. MED.

### Transmitted but never consumed

- **B4 — `transmission_chain` (IRE-1 typed transmission) has zero consumers. HIGH.** Serialized on every event (`feed.py:296,534`), typed in `lib/types.ts:81,94-103`; no frontend code reads it. The UI renders the LEGACY prose `ev.transmission` (`EventDossier.tsx:351-354`, `CompanyDossier.tsx:236-238`). R3's fix shipped to the wire and stopped one hop short of the screen.
- **B5 — Canonical `Explanation` consumed on exactly one surface. MED.** `FeedResponse.explanations` is read only by `lib/intel/dossier.ts:584`; Feed, Morning Brief, Markets still run the legacy client engines. The canonical reasoning is paid for every cycle and displayed almost nowhere (R4 confirmed live).
- **B6 — Dead diagnostics:** `/api/feed/status`, `/api/feed/activation-debug`, listen aux endpoints uncalled; `top_stories_debug`, `promo_excluded`, breakdowns shipped in every FeedResponse and unread; per-source error messages reduced to a count (`app/feed/page.tsx:508-510`). LOW.

### No reachable path

- **B7 — All 8 theme-memory v1 endpoints (`api/routes/memory.py`) have zero frontend callers. HIGH.** Observation series, per-theme evidence trails, strengthening/weakening/stale lists — unreachable. Only the compact `memory` blob embedded per theme in FeedResponse (`feed.py:444-451,486`) reaches the UI.
- **B8 — Most of the v2 archive is unreachable. HIGH.** Of ~12 read endpoints in `memory_v2.py`, the frontend wraps four (`lib/api.ts:122-164`), consumed only by `ArgusMarketMap.tsx` and `CompanyDossier.tsx`. The relationship registry and daily historical graph reconstruction — the deepest memory in the system — have no consumer.

### Client re-derivation at lower fidelity

- **B9 — Recency re-derived by regex-parsing "2h ago" display strings. HIGH.** `ClusterCard.tsx:248`, `IntelligenceStream.tsx:149`; items formatted in days silently fail the breaking test. The backend has the exact datetime and drops it (B2).
- **B10 — Synthetic momentum history fabricated while real history sits unread. HIGH.** `lib/themeMomentum.ts:300-333` back-extrapolates a "3M/1M/1W/Now" trend from a single `momentum_delta` ("we have no stored history") — while `/api/memory/theme/{id}` and v2 snapshots store the real series (B7/B8).
- **B11 — Episode entities re-derived client-side. MED.** `api/podcast_feeds.py:1478` always emits `entities: []`; `useListen.ts:11-14` regex-extracts. Listen never joins the backend graph/archive/memory.
- **B12 — localStorage theme snapshots duplicate server memory as a third scheme.** `lib/themeSnapshots.ts` — device-local, invisible to the backend. MED. (Memory V2 audit facts confirmed still true.)

### Truncation, freshness, fallback

- **B13 — Saved items: in-memory dict, erased on restart (`saved.py:16`); schema drops `affected_entities`/`signal_strength` (`saved.py:19-30`) — saved research permanently loses entity linkage.** MED.
- **B14 — Market data never enters the spine. MED (HIGH in combination with I15).** `app/api/market-data/route.ts` (Yahoo), `explorer-market/route.ts` (FMP), `ipo-pipeline/route.ts` (EDGAR) run in the Next.js server only; price observations and filings never reach the Python backend, archive, or event/theme reasoning.
- **B15 — Effective staleness ~15 min despite 60s detection. MED.** Backend 5-min cycle; `useFeed.ts:24-25` staleTime 5 min / poll 10 min; `useFeedFreshness` sets a passive flag.
- **B16 — Proxy timeout 30s can 502 a cold-start pipeline run whose result then lands in cache unseen.** LOW.

---

## 4. Stage 4 — Frontend intelligence layer findings

### Adapter losses

- **C1 — The canonical event/Explanation layer never enters the graph. HIGH.** `lib/intelligenceGraphAdapters.ts` ingests `StoryCluster`/`FeedItem` only; `FeedResponse.events` (corroboration, tiered evidence, `companies_direct`, typed chains) and `explanations` reach only `lib/intel/dossier.ts:584`. The evidence engine, inference engine, profiles, and drawer reason over article-level Story nodes without any of it.
- **C2 — Story provenance timestamps fabricated at ingest. HIGH.** `ingestStories` (adapters:191-198) never sets `firstSeen`/`lastSeen`; they default to `Date.now()` (intelligenceGraph.ts:189-190). Every story appears ~0 days old after each rebuild: freshness is saturated at ~100, the `stale_evidence` contradiction (evidenceEngine.ts:153-154) can never fire — staleness detection across the evidence layer is dead.
- **C3 — `cluster.related`, `story_count`, `cluster_score` never enter the graph** — corroborating articles lost a second time, client-side. HIGH.
- **C4 — `ThemeIntelligence.relationship_weights` (signed, weighted theme→sector) dropped;** every related industry gets uniform `affects`+`correlates` at strength = confidence (adapters:163-166). Some surfaces read the field directly (ThemeDrawer.tsx:215), so surfaces and graph disagree about polarity. HIGH.
- **C5 — Theme signals collapsed:** `conviction := importance := confidence` (adapters:139-141); drops `second_order_effects`, `volatility_score`, `signal_quality`, `competition_penalty`, and the entire backend ThemeMemory object; drops FeedItem `why_it_matters`/`impact`/`signal_strength`. MED-HIGH.
- **C6 — Edges carry no evidence links, and upserts ratchet:** `IntelEdge` holds only counts + page names; `Math.max` merge (intelligenceGraph.ts:266-267) means one early overconfident assertion floors confidence forever. MED-HIGH.

### Never captured client-side

- **C7 — SEC/FRED provider pipeline (companyfacts, Form 4, 13F, FRED → `observationGraphBridge.ts`) is built, tested, and reaches no user-facing surface. HIGH.** Only invoked by the server-side `ingestionScheduler` whose in-memory graph dies with the process.
- **C8 — Private Markets signals never enter the canonical graph** (`useArgusIntelligence.ts:66` omits `privateSignals`; only debug fixtures pass them). HIGH.
- **C9 — Listen speakers never captured** (production never passes `speakersByEpisode`); **C10 — theme snapshots' `listenMentionCount` is permanently 0** (`useArgusIntelligence.ts:59` omits the arg) yet memory lines render "Mentions increased across Listen" from it (themeSnapshots.ts:158). MED.

### Client memory & determinism

- **C11 — The entire longitudinal memory layer is per-device localStorage. HIGH.** `themeSnapshots.ts` + `memoryEngine.ts` (`argus.themeSnapshots.v1`, `argus.memoryEngine.v1`): history exists only for days the user opened the app; devices diverge; cache clear erases it; `PredictionRecord`s never scored. Snapshot `conviction` is `t.confidence` re-rounded.
- **C12 — Recency regex-parsing** (see B9). **C13 — Regime day-over-day change in page-local localStorage** (`app/page.tsx:948-971`). LOW-MED.
- **C14 — Industries detail page fabricates a live tape. HIGH (fabrication).** `app/industries/[slug]/page.tsx:452-479`: seeded fake quotes nudged ±0.11% by `Math.random()` every 2.6s with flash effects — fabricated market data on a page one hook away from real FMP quotes. The M4 "fake replay" pattern survives here.

### Confidence & slicing

- **C15 — Three independently drifting source-authority tables:** backend `_SOURCE_TIERS`, `feedRanker.ts:302-317` hardcoded mirror (unknown publishers → Tier-4 −25), `evidenceEngine.ts:35-49` regex table. MED.
- **C16 — Default-50 confidence pervades the graph** (intelligenceGraph.ts:185-186, 275-276; most `link()` calls pass none) — `relationshipConfidence` averages a fabricated constant. MED.
- **C17 — Followed themes outside the ~20-entry hardcoded `THEME_TIERS` contribute nothing** (feedRanker.ts:259-260) and their stories can hit `NO_OVERLAP_PENALTY` — the user's explicit preference silently dropped. HIGH.
- **C18 — Quality gates and event caps suppress without record** (relevance <70 / conviction <72 dropped; >2 per anchor dropped; no counter, no memory). MED. **C19 — Market Map drops top-6-ineligible themes silently** (marketMap.ts:67-72). MED. **C20 — Uniform top-K truncation inside reasoning engines** (beneficiaries 8, sectors 6, contradictions 6…). LOW-MED systemic. **C21 — Static ~200-symbol `tickerMetadata` splits unknown tickers into permanently separate nodes.** MED.
- **C22 — Legacy engines remain the live compute path for profiles/drawer while self-marked LEGACY-PATH** — an active dual-source-of-truth risk until IRE migration completes (R4). MED.

---

## 5. Compounding chains (why single-point fixes underdeliver)

- **Corroboration:** I4 deletes duplicates → I6/T5 cap survivors → C3 drops `related` client-side → E-lane verdicts and confidence bands undercount at three consecutive stages. Fixing any one stage alone still undercounts.
- **Time:** I2 (no fetched_at) → I5 (first-seen deleted) → B2 (datetime not serialized) → C2 (fabricated `Date.now()`) → C12/B9 (regex-parsing "2h ago"). Every stage invents its own clock because the real one was dropped one stage earlier.
- **Memory:** I7 (unstable event ids) → T2 (explanations unpersisted) → T6 (momentum resets) → I19/config (durable store off by default) → C11 (localStorage). No layer can trust another layer's history, so each grows its own, and none survives.
- **Reasoning consumption:** T9 (sections gated) → B4/B5/B7/B8 (shipped but unconsumed) → C1 (graph never ingests it) → C22 (legacy engines fill the vacuum). The canonical engine's output is blocked at four consecutive doors.

---

## 6. Prioritized improvement program

Ordered by expected intelligence-quality gain. Difficulty noted but not weighted. IDs `OP1–OP12`.

### Tier 1 — Keystone: stop destroying signal, start remembering

**OP1 — Corroboration-preserving ingestion.** Replace delete-dedup with merge-dedup: the survivor carries `merged_sources[]` (source, tier, url, published_dt, snippet) and `first_seen` = earliest member. Corroboration counting (`events.py:504`) reads merged provenance; decay anchors to true first observation. Raise cluster member caps or count beyond them (`story_count` already survives — spend it). *Fixes I4, I5, I6; unblocks E1/E2 for real; makes the confirmed/developing epistemology honest.* **Expected gain: highest in the audit — every downstream corroboration and decay consumer is currently wrong.**

**OP2 — Stable event identity.** A cross-cycle event registry: match this cycle's clusters to last cycle's events (anchor entities + time window + title similarity), persist `event_uid` independent of the current primary's md5, keep `first_seen`/`last_seen`/membership history. Widen or chain clustering windows (I8) so multi-day stories keep one identity. *Fixes I7, I8; prerequisite for any event-keyed memory, the prediction ledger, and Explanation continuity.*

**OP3 — Durable observation ledger + memory rehydration.** (a) Append-only store of admitted observations and events per cycle (start: JSONL/SQLite next to `data/feed_cache/`) with `fetched_at`; (b) enable institutional memory persistence by default (`config.py:80`); (c) rehydrate `ThemeMomentumTracker` from `theme_memory.json` on boot (T6); (d) persist Explanations per cycle keyed by `event_uid` (T2); (e) move saved items out of the in-memory dict (B13). *Fixes I19, I2, T6, T2, B13; stops archive pollution; makes "what changed since yesterday" answerable from data instead of vibes.*

**OP4 — Consume the canonical reasoning (the cheapest large win).** The intelligence already exists and ships. (a) Ingest `FeedResponse.events` + `explanations` into the intelligence graph as first-class Event nodes with evidence links (C1, C6); (b) render `transmission_chain` wherever prose `transmission` renders today (B4 — a UI change that directly exposes shipped, unconsumed intelligence, per the rule); (c) migrate Feed/Brief/Markets/drawer off the LEGACY engines onto Explanations (B5, C22, R4); (d) un-gate the Explanation `memory`/`stakes`/`falsifiers` sections now that their engines exist (T9); (e) replace the synthetic momentum trend with the real series from `/api/memory/*` (B10, B7). *Retires the split-brain; the product starts showing the reasoning it already pays for.*

### Tier 2 — Integrity: make the numbers mean what they say

**OP5 — One clock.** Serialize `published_dt` (+ new `fetched_at`) on `FeedItemSchema` (B2); set `firstSeen`/`lastSeen` from payload in `ingestStories` (C2); delete every regex-parse of display strings (B9/C12) and frozen-age string (I11); compute ages at render from the canonical helpers. *Revives the entire staleness/freshness axis of the evidence layer, currently dead.*

**OP6 — Measured, not minted, derived metrics.** (a) Compute breadth from actual contributing clusters' industries (T11); (b) fix the counterevidence query to the edge types the graph actually creates, or create theme-inbound `pressures` edges (T1); (c) rename/rescale "sessions" to honest units and judge materiality on multi-cycle windows ThemeMemory already holds (T7, T18); (d) stop counting unlabeled stories as confirmation (T10); (e) separate observed catalysts from ontology priors in the evidence trail (T4); (f) preserve vote splits and magnitudes through rollups (T13, T12).

**OP7 — Kill fabrication.** Remove the fake live tape (C14 — wire `useExplorerMarketData` or show nothing); stop rendering Listen-mention memory lines from permanently-zero data (C10 — pass the arg or drop the line); serialize backend source tier per item and delete the two frontend tier tables (C15, B1); stop defaulting confidence to 50 where no evidence exists — carry backend confidence through or mark edges unscored (C16, C6 ratchet → time-decayed merge).

**OP8 — Scoring transparency across the boundary.** Serialize the per-item scoring decomposition (B1) and the suppression funnel (B3/I12 — actually populate `PerSourceStats`, persist per cycle, expose one diagnostic endpoint); record what quality gates and caps suppress client-side (C18, C19). *This is the tuning loop for every regex wall and gate in the system; today they are unmeasurable.*

### Tier 3 — Coverage: capture what is never captured

**OP9 — Market data into the spine.** Route the already-built Next.js market providers (Yahoo/FMP/EDGAR — B14) through the Python backend as observation ingestion; key price observations to `event_uid`/theme; start the outcome-resolution loop the prediction ledger and M8.1 say-do layer require (I15, T21 progress). *Turns every directional claim from unfalsifiable prose into a testable prediction — the single biggest epistemic upgrade available after Tier 1.*

**OP10 — Deepen text capture.** Fetch full text (or `content:encoded`) for event-admitted items at minimum (I1); run the registry entity resolver at feed stage (I9); expand SEC beyond 12 tickers/8-K and fetch filing text (I17); repair or replace dead wire feeds and alert at WARNING on feed death (I16, I10 real HTTP timeouts); add transcript/IR ingestion for M8.1 (I18).

**OP11 — Connect the orphan pipelines.** SEC/FRED provider observations into the canonical graph and a durable health store (C7); Private Markets signals into `useArgusIntelligence` (C8); Listen speakers + server-side episode entities (C9, B11); teach `feedRanker` to honor followed themes beyond the hardcoded tier map (C17); replace the static ticker dict with registry-backed resolution (C21).

**OP12 — Retire or promote dead compute.** `language_quality` gate acts or goes (T22, R8); `PropagationChain`s persisted+served or deleted (T23); archive the typed causal chains instead of ontology-ordered prose (T24); reconcile the two regime labels (T17); remove uncalled debug endpoints or wire them into OP8's diagnostics (B6).

---

## 7. Relationship to existing registers

- **E1–E8 (feed editorial):** E2 is confirmed and *understated* — corroboration is not merely unspent, it is destroyed pre-count (I4). OP1 is the real E2 fix.
- **R1–R8 (reasoning engine):** R2 (T15), R4 (B5/C22), R6 (T1), R8 (T22) confirmed live. R3's typed chain shipped but has zero consumers (B4) — the fix stalled at the last hop.
- **Memory V2 audit facts:** localStorage schemes confirmed still live (C11, B12); the resolution is OP3 + OP4(e), not another client store.
- **M4 audit:** the deterministic network shipped, but the fake-replay pattern survives on the industries tape (C14).
- **M8.1 (earnings intelligence):** blocked on I17/I18 (no transcripts, no filing text) and OP9 (no outcome data). OP2/OP3 are its identity and persistence prerequisites.

---

## 8. Non-goals

- No visual/UX redesign. The only surface changes proposed (OP4b/e, OP7) expose intelligence this audit shows is already computed and currently unreachable, per the audit's UI rule.
- No new LLM stages. Every Tier 1–2 item is deterministic plumbing; the LLM findings here (T3, T15, I20) are about provenance and inputs, not about adding generation.
