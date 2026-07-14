# ARGUS INSTITUTIONAL REASONING V1 (M3.4)

"When has this happened before, and what usually happened next?" — answered
exclusively from Argus's own sealed institutional archive. No LLM calls, no
price data, no speculation: every similarity is a decomposed deterministic
calculation, every outcome is a count over recorded state, and every figure
carries its sample size.

Implementation: `app/institutional_memory/reasoning.py`
Endpoint: `GET /api/memory/v2/themes/{uid}/historical-context?window&horizon&limit`

## 1. What the product vision maps to (and what it must not claim)

| Pitch | Shipped as | Honesty boundary |
|---|---|---|
| "Similar historical episodes: March 2024 · 91%" | episodes = (theme, anchor date) pairs in the sealed archive, similarity 0-100 with full component decomposition | episodes can only come from the archive, which begins July 2026 — earlier dates cannot exist |
| "68% Semiconductors **outperformed**" | "Semiconductors **activation strengthened** in N of M episodes" (recorded industry state) | *outperformed* is a price claim; no price source exists (M3.3 §9) — never emitted |
| "Average duration: 18 **trading days**" | average duration in **observed UTC days**, censored runs flagged and excluded from the mean | trading-day math needs a market calendar the backend does not have |
| "Why? identical relationship structure…" (Sprint 3) | the `components` + `why` fields on every episode — the similarity decomposition IS the explanation | facts listed are the actual matched records, never generated prose |
| "Historically evolved into: Power Demand" (Sprint 4) | `most_common_follow_up_narratives`: narratives whose first-ever appearance falls in the episode's horizon and contains the subject | labeled "observed evolution — not a recommendation or prediction" |
| Theme-page UI (Sprint 2) | **not in this sprint** — backend payload is UI-ready; frontend integration is a separate sprint | analog surfaces must render `insufficient_history` verbatim until gates pass |

## 2. Episode model

An episode is a `(subject theme, anchor date)` pair. The subject's **current
state** (trailing `window` = 5 sealed days) is compared against every
candidate anchor of every theme in the archive, subject to:

- the candidate's follow-up horizon (`horizon` = 10 days) is fully sealed —
  the future can never leak into an outcome;
- a same-theme candidate may not overlap the current window (never compare a
  window against itself);
- at most one episode per (theme, ISO week) so one persistent week cannot
  fill the whole list;
- similarity ≥ 60 and ≥ 3 comparable components, else skipped.

## 3. Similarity (deterministic, decomposed)

| Component | Formula | Weight |
|---|---|---|
| conviction_level | 100 − 2·\|Δconviction\| | 0.20 |
| trajectory | 100 − 10·mean\|Δdelta\| over aligned day-deltas | 0.20 |
| relationships | 100·Jaccard of typed edge sets at the anchors | 0.25 |
| narratives | 100·Jaccard of narrative driver-UID sets | 0.15 |
| transitions | 100·Jaccard of transition-type sets in the windows | 0.10 |
| regime | 100 if same recorded regime UID else 0 | 0.10 |

A component with no evidence on either side is **null** and excluded (weights
renormalize) — both-empty is treated as absence of evidence, never as
agreement. The `why` array lists the matched facts (shared edges, shared
drivers, regime label, conviction values), which is the Sprint-3 explanation
without any generation step.

## 4. Outcomes ("what happened next")

Per episode, over the `horizon` sealed days after the anchor:

- the theme's own conviction change and transitions fired;
- industries whose recorded activation moved ≥ ±10 pts
  (`activation_strengthened` / `activation_weakened`);
- narratives that first emerged containing the subject (follow-up evolution);
- duration = consecutive presence from the anchor to the first *observed*
  absence (a day with archive writes but no subject snapshot); runs still
  alive at the archive edge are `duration_censored` and excluded from means.

Aggregates always read "N of M episodes" with both numbers present; nothing
is a bare percentage.

## 5. Credibility gate (pre-registered, V2 doc §9)

Analog output is suppressed — with the exact shortfalls listed — until ALL of:

- ≥ 60 distinct sealed archive days;
- ≥ 2 distinct recorded regimes (regime UIDs observed in relationship
  snapshots);
- ≥ 10 tested prediction outcomes (M3.3 ledger).

At current accrual (archive live since 2026-07-12), the gate is expected to
pass no earlier than **mid-September 2026**, and only if a second regime is
recorded by then. Until that day every response is
`status: "insufficient_history"` — this is correct behavior, not an error,
and any surface consuming this API must display it as such.

## 6. Determinism, performance, security

Deterministic for a fixed archive (tested: byte-identical repeat responses).
Reads use paged archive fetches (`fetch_table_snapshots_between_paged`) so
PostgREST's row cap cannot silently truncate months of history. Read-only:
no writer changes, no new tables, no new environment flags — the engine is
available whenever institutional memory is configured, and the gate does the
honesty enforcement. Served only through FastAPI (service role stays
backend-side).

## 7. Known limitations / next steps

1. Corpus is Argus's recorded state only — the curated backend graph, not the
   frontend Explorer graph; regime detection relies on the recorded
   regime→driver edges.
2. Cross-theme analogs share one feature space; no per-type weighting yet.
3. No market-context records (V2 §2.G) — regime is the only macro dimension.
4. Computation is per-request (bounded by archive size); add caching keyed on
   (uid, sealed_through) if endpoint traffic grows.
5. Sprint 2 (theme-page "Institutional Memory" panel) is frontend work on top
   of this payload, including verbatim insufficient-history rendering.
