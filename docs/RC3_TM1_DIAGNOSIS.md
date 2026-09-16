# RC3-TM1: Theme Matching Integrity

Status: CAUSALLY PROVEN for resolver-bypassing ticker matches. Generic-only
contribution is also established, but its appropriate policy needs a separate
relevance evaluation. Baseline: `5049643`. No closed RC2, EA1, EA2a, or ET1a
contract is reopened by this diagnosis.

## Source to display

1. Ingestion uses `app.companies.resolve_entities` to extract company hints.
2. `app/theme_graph.py:extract_themes` independently matches ontology entities
   against uppercased hints and lowercased primary title/snippet text. The second
   route bypasses the canonical resolver's case/context rules. It adds one entity
   hit even when the matched word is ordinary language. Keyword contributions
   are a separate route.
3. Each entity hit contributes 3 raw points, capped at 9. Cluster weighting,
   source/category/recency bonuses, aggregate emission gates, and competition
   operate after contribution. They do not validate each story/theme association.
4. Generic-keyword penalties reduce aggregate confidence but do not themselves
   remove a contributing story. The ontology-specific confidence floor is metadata;
   actual emission still has separate minimum story/source/breadth/confidence gates.
5. The top five contributing cluster IDs become event theme associations.
   `app/events.py` adds linked theme assets to contextual company lists. Frontend
   consumers display those associations. ET1a gates one Event chain presentation;
   it does not change the upstream association or every other surface.

## Reproduction

Run the offline diagnostic without fetching or rewriting historical data:

```powershell
.\.venv\Scripts\python.exe scripts/audit_theme_matches.py --input data/ledger/observations-2026-07-25.jsonl --output "$env:TEMP/argus-tm1-baseline.json"
```

The retained ledger contains 125 unique observation revisions. Against the 19
current ontology themes, the diagnosis found six article/theme pairs containing
a registry ticker not accepted by `resolve_companies` on that same text:

| Observation | Theme | Collision |
|---|---|---|
| Pay raises keep shrinking | utility-capex-supercycle | snippet "so" becomes SO |
| Zelensky counts the cost | consumer-stress | title "cost" becomes COST |
| EU airline ownership / easyJet bid | consumer-stress | snippet "low-cost" becomes COST |
| Generic drug tariffs | consumer-stress | snippet "low-cost" becomes COST |
| Ukraine-Canada energy pact | energy-security | commodity LNG becomes a company-token hit |
| Decisioning in power markets | energy-security | commodity LNG becomes a company-token hit |

There are also 14 generic-keyword-only article/theme pairs. They include a NATO
spying story contributing to china-stimulus-rotation via "chinese" and buyout
coverage contributing to ai-energy-demand via "ai". Some generic matches are
topically legitimate; this count is not a false-positive count.

These are historical observation-level mechanisms reconstructed with current
entity extraction, not an exact replay of old scores, old clustering, or current
production membership. An invalid ticker contribution does not prove that every
theme association on that article is wrong. In particular, LNG energy keywords
may independently justify the energy theme.

## First correction: TM1a only

Require a registry ticker to pass the existing canonical company resolver before
it can contribute through either of the matcher's entity routes. Preserve
non-ticker ontology terms, keyword matching, score weights, limits, emission
gates, competition, and the existing duplicate-hit arithmetic. Do not broaden
matching to aliases that the current matcher never matched.

Controls must demonstrate ordinary SO/COST suppression, explicit $SO/$COST and
company-name survival, unchanged unrelated positive themes, and unchanged input
clusters/evidence. Use real ontology configurations with enough legitimate
contributors to exercise emitted membership, not just an isolated regex test.

Hold generic-keyword policy for TM1b. Hold company propagation, instrument
identity, M&A classification, Home grounding, provenance, full-chain relevance,
source normalization, URL identity, OP1.2, and historical remediation separately.

## Evaluation status

The 125 observations can seed development examples, but they are not 125
independently annotated events. No 150-200 event benchmark, held-out precision
score, or improvement percentage is claimed. New event-level examples and
independent review are required before reporting semantic quality metrics.
