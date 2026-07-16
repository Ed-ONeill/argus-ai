# ARGUS FEED EDITORIAL STANDARD V1

**Status: EDITORIAL AUDIT + CANONICAL RANKING DESIGN.** The Feed audited as a markets
desk would audit it — does the most market-moving event reliably lead, and does
low-signal material reliably die? — followed by the designed event-ranking and
story-selection process. Governed by ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1
(importance is scored once at the spine; the Feed ranks presentation; personalization
re-orders, never re-scores) and the Design Bible 4B voice.

Audit basis: the live scoring pipeline (`app/feeds.py` signal/institutional scoring,
`app/background.py` composite sort, `app/top_stories.py` slotting, `app/clustering.py`
corroboration, `frontend/src/lib/feedRanker.ts` personalization).

---

## 1. HOW THE DESK WORKS TODAY (verified)

1. **Per-article scoring** (`score_item`): source tier (0–50, dominant) + keyword hits
   (≤40) + linear recency (≤20 over 48h) + bonuses (macro +10, ticker +8,
   institutional-structure +8, cross-asset +8, event-verb +6) − penalties (PR noise
   −75, opinion/SEO −60, retail −50, consumer −30, plus hard excludes). A parallel
   quality-only `institutional_score` weights source prestige most heavily.
2. **Composite sort** (`background.py`): `(−hour_bucket, strength_tier,
   −(inst·0.40 + graph_alignment·0.20 + signal·0.40))` — the hour bucket sorts FIRST.
3. **Caps**: per-source-tier item caps (12/6/3/2) and a Markets-category soft cap.
4. **Corroboration**: stories cluster into events with `story_count` and source lists —
   consumed by themes and What Matters Now, **not by feed ranking**.
5. **Top-story slots**: five fixed slots (Deal / Macro / Single Name / Price Move /
   Policy) with floors (signal ≥60, institutional ≥55).
6. **Personalization** (`feedRanker.ts`): preference-first affinity with theme gating —
   off-thesis stories buried; conviction scaled from the spine's signal score.

What already meets a professional desk's bar: the **opinion/retail suppression
machinery is genuinely strong** (events-not-articles is enforced with teeth), source
tiering is real, theme gating keeps the stream on-thesis, and clustering exists — the
raw material of an event-centric desk is all present.

## 2. THE EDITORIAL AUDIT — WHERE THE DESK FAILS ITS EDITOR

**E1 — Recency tyranny (the lead is wrong by construction).** The hour bucket sorts
before importance: a 55-score aggregator item published at 12:40 outranks a 95-score
CPI shock from 11:55. No markets desk leads with "newest"; it leads with "most
important, still live." This is the single largest defect.

**E2 — Corroboration is computed and then not spent.** The desk knows an event has
three independent tier-1 confirmations — and ranks it identically to a single-source
aggregator restatement, because ranking is per-*article*, not per-*event*. Worse, each
re-report of the same event re-enters a fresher hour bucket, so **recency resets per
article instead of decaying from the event** — old news keeps resurfacing in new
clothes.

**E3 — No magnitude axis.** An in-line CPI print and a shock CPI print carry the same
keywords, the same source tier, the same score. Surprise-versus-expectation is the
first thing a markets editor asks and the one thing the scorer cannot see. (Honest
constraint: Argus has no consensus-estimate or reliable price source today, so
magnitude cannot be computed numerically yet — but the design must reserve the slot
and use the honest proxy available: corroboration *velocity*, see §3.2.)

**E4 — Keyword stuffing pays.** Additive keyword scoring (≤40 pts) rewards headline
density, not meaning. Topicality already has a better owner — theme gating and graph
alignment — and keywords should route, not score.

**E5 — Prestige without a scoop lane.** `institutional_score` is dominated by source
prestige, so a tier-1 wire's routine item outranks a tier-3 trade publication's
specific, dated, named-parties scoop. A desk holds scoops visibly, labeled
*developing*, pending corroboration — it neither leads with them nor buries them.

**E6 — The desk's own reporting never runs.** The architecture (§3.9) makes internal
cognition events — conviction crossings, narrative dissolutions, prediction
resolutions — first-class, and for professionals they outrank most headlines. The Feed
currently prints none of them.

**E7 — Slots without a front page.** The five top-story slots are a fine briefing rail,
but nothing designates *the lead* — the one event that owns the day. The dominant
thesis exists (The Read); the stream is not anchored to it.

**E8 — Fill beats floor on quiet days.** The ranker always produces a full page, so on
a dead Sunday the junk rises to fill it. The quiet-day rule (architecture §5.7) demands
the opposite: a short honest feed over a padded one.

## 3. THE DESIGNED PROCESS — TWO DESKS

The redesign keeps every suppression rule and source tier, and changes the unit, the
clock, and the chooser. Model: a wire desk that scores events once (the spine), and an
editor that composes the page (the Feed surface). No meaning is created in desk two.

### 3.1 Desk One — the Wire (spine, stages 2–3): rank EVENTS, not articles

**The ranking unit becomes the story cluster.** Articles keep their quality scores
(suppression happens before clustering, unchanged), but everything after clustering
ranks the event and selects its best-sourced representative for display.

**EventScore = Base × Corroboration × Relevance × Decay**, all deterministic:

- **Base** — the event's intrinsic class and quality: best-source tier in the cluster
  (not the average, not the latest) + event-class weight, ranked as a desk ranks them:
  macro release/central bank > policy/geopolitical > M&A (confirmed) > earnings/
  guidance > single-name catalyst > price echo. The existing regex classifiers already
  distinguish these; the weight table replaces the flat keyword sum (E4: keywords
  route to classes; they no longer add points).
- **Corroboration** — `1 + min(log₂(distinct qualified sources), 2) × 0.25` (up to
  1.5×): two independent confirmations are a different animal from one, five aren't
  much more than three. *Qualified* = tier ≤2 or named-party specificity. (Fixes E2.)
- **Relevance** — the graph-alignment/theme-gate factor already computed at the spine
  (on-thesis events matter more; off-thesis is discounted, never zeroed — a genuine
  shock off-thesis must still surface, so Relevance floors at 0.6 for Base ≥ the
  macro-class weight).
- **Decay** — from the **event's first-seen time** (the cluster's earliest member),
  never from the latest re-report (fixes E2's resurfacing). Exponential, class-specific
  half-lives: macro/policy ≈ 18h, M&A ≈ 24h, earnings ≈ 12h, single-name ≈ 8h, price
  echo ≈ 3h. A CPI shock at 8:30 still leads at 14:00; a mover note dies by lunch.

**The magnitude slot (reserved, gated).** Until a consensus/price source is
canonicalized, magnitude uses its honest proxy: **corroboration velocity** — distinct
qualified sources arriving within the first 90 minutes (a shock print gets five wires
in an hour; an in-line print gets two in a day). When real surprise data exists, this
section is amended by version; nothing simulates magnitude before then. (E3.)

**The developing lane (E5).** A single-source item from a qualified source with
specificity markers (named parties, dated figures, quoted documents) enters as
`developing` — visible in the stream, labeled as single-source in the honest 4B voice
("One source; not yet corroborated."), excluded from the lead and slots, and promoted
automatically the moment a second qualified source lands. Scoops are held in view,
never buried and never led with.

**Admission floor (E8).** An event below the quality floor does not enter the Feed at
any rank. The floor does not flex with supply: on a quiet day the Feed is short and
says so ("A quiet tape — little changed today."), per the quiet-day rule.

### 3.2 Desk Two — the Editor (stage 6, Feed surface): compose the page

1. **The lead.** One event owns the page: highest EventScore, with dominant-thesis
   alignment as the tiebreak, corroboration as the second tiebreak. The lead block sits
   above personalization's reach — **the lead is market truth and is identical for
   every user** (architecture §5.3). (E7.)
2. **The briefing rail.** The five slots survive with unified floors (they become
   consumers of EventScore rather than a parallel scorer), each slot filled by the top
   *event* of its class, one representative article per event, source count shown
   ("3 sources") — corroboration becomes visible editorial information.
3. **The desk's own reporting (E6).** Internal cognition events interleave as marked
   items — eyebrow `UNDERSTANDING CHANGED`, Argus-derived provenance, 4B voice
   ("Power Infrastructure conviction 78, up 6 — crossed the strengthening threshold.
   14 assertions.") — ranked by transition magnitude against the same decay clock.
   Prediction resolutions are never rankable below the fold on the day they resolve
   (accountability outranks narrative pride).
4. **The stream.** Everything admitted, ordered by EventScore; personalization
   re-orders *below the lead block* per the existing feedRanker affinity (theme
   gating, sector/asset preference), which keeps its current role unchanged — it
   re-orders presentation and never touches EventScore.
5. **One event, one appearance.** An event appears exactly once per view (lead OR slot
   OR stream), with follow-up coverage folded into it, not listed under it.

### 3.3 The editor's checklist (QA that keeps the desk honest)

A standing daily review harness, measured not vibed: **lead precision** (was the lead
the day's most market-moving corroborated event? — spot-audited against a human call),
**resurfacing rate** (same event re-entering the top 10 on re-reports — target ~zero),
**opinion leakage** (suppressed-class items reaching the stream — target zero),
**scoop latency** (time from single-source arrival to post-corroboration promotion),
**quiet-day honesty** (items shown on low-signal days — should fall, not hold), and
**slot integrity** (slots filled by class-correct events at or above floors). These six
numbers are the Feed's own prediction ledger: the desk measures itself.

## 4. IMPLEMENTATION ROADMAP (in spine order; each independently shippable)

| Phase | Scope | Fixes |
|---|---|---|
| **F1 — Event-centric ranking** | rank clusters not articles; best-source representative; decay from event first-seen with class half-lives; retire hour-bucket-first sort | E1, E2 (resurfacing) |
| **F2 — Corroboration & floors** | corroboration multiplier + visible source counts; admission floor + quiet-day short feed; developing lane for qualified single-source scoops | E2, E5, E8 |
| **F3 — The front page** | lead selection (thesis-aligned tiebreak, personalization-immune lead block); slots unified onto EventScore; one-event-one-appearance | E7 |
| **F4 — The desk's own reporting** | internal cognition events into the stream (transitions, resolutions) with Argus-derived marking and 4B copy | E6 |
| **F5 — Magnitude (gated)** | corroboration-velocity proxy now; true surprise-vs-consensus only when a canonical source ships, by amendment | E3 |

Keyword scoring (E4) retires gradually inside F1–F2 as class weights take over; the
regex classifiers are kept as the class routers they already are.

## 5. GOVERNANCE

This document is the Feed's editorial law under the master architecture. The routing
matrix rows it implements: corroborated stories, earnings, macro/policy, and internal
cognition events (§3 of the architecture). Amendments V1.x with a log; changing the
two-desk split or the personalization-immune lead requires V2.0.

| Version | Date | Change |
|---|---|---|
| V1.0 | 2026-07-16 | Editorial audit (E1–E8) and the two-desk ranking design. |
| V1.1 | 2026-07-16 | F1 implemented: `app/events.py` — canonical `MarketEvent` (id ≡ `StoryCluster.id`, which is the id themes and the M3 archive already record as evidence refs), EventScore = Base × Corroboration × Relevance × Decay with decay from event first-seen and class half-lives; events built each pipeline cycle (`background.py`), cached (`ProcessedFeed.events`), served (`FeedResponse.events`). Desk One is live at the spine; Desk Two (feed surface consumption, lead, slots-on-EventScore) lands in F2–F3. |
| V1.2 | 2026-07-16 | F1 validation amendment — company-agnostic earnings coverage. Canonical company registry + deterministic resolver (`app/companies.py`): an uppercase token is not a company until it resolves; ambiguous ticker-words (CAT, ON, ALL, IT, A, FOR, AI…) need explicit context ($-prefix, name mention, or market noun). Earnings language broadened (financial/quarterly/annual results, trading update, fiscal quarters, 10-Q/10-K, earnings release/call, investor presentation, revenue verbs). Evidence carries `kind` (sec_filing / transcript / ir_release / news) — the only honest bases for management commentary; absence is derivable. One company + one stated reporting period folds to one Feed event (`merged_event_ids` preserves cluster linkage). IBM confirmed as a test fixture only. |

---

*Related: ARGUS_PRODUCT_INTELLIGENCE_ARCHITECTURE_V1.md (the spine this desk serves),
ARGUS_INTELLIGENCE_NETWORK_V2.md Part 4B (the voice of every feed string),
feedback doctrine: events-not-articles; preference-first, theme-gated ranking.*
