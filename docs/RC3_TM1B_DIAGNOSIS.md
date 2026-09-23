# RC3-TM1b: generic theme-contribution diagnosis

Status at diagnosis: READ-ONLY DIAGNOSIS COMPLETE; HUMAN POLICY REVIEW PENDING.

Update 2026-09-22: all 23 human judgments are complete and the user accepted the
review milestone, authorizing only TM1b1. The diagnosis below is preserved as
historical analysis. See [TM1b1 implementation](RC3_TM1B1_IMPLEMENTATION.md).

Date: 2026-09-16. Inspected revision: `fe93a34`; runtime matcher: `01301d2`.
TM1a remains closed. ET1a, EA1, EA2a and RC2 remain closed.

## Verdict and primary answer

**Mixed.** The causal mechanism is proven: one generic word can make an article a
theme contributor, affect aggregate confidence/source breadth, enter a retained
top-five set, and produce an event theme attachment. The current code does not
require event-specific evidence of the theme's mechanism. But generic-only hits
include useful associations as well as suspected false relevance. A blanket ban
is not supported by the retained examples.

This diagnosis establishes technical behavior, not a human-labeled false-positive
rate. Six particularly discriminating suspected false-positive pairs are included
in the decision batch below; their labels remain null. No model judgment has been
promoted into benchmark truth. Where this report calls an association unsupported,
it means the retained title/snippet does not establish the specific theme thesis;
it does not claim that the unread article body could not contain more evidence.

## Earliest causal divergence

`app/theme_graph.py:414-475` scores the cluster PRIMARY title, snippet, and entity
hints. It does not inspect every member, the article body, or a claim-level link.

1. TM1a gates canonical ticker contributions through the existing resolver. It
   deliberately leaves non-ticker ontology terms and keyword matching unchanged.
2. Entity hints contribute three points each, capped at nine. One additional
   literal entity hit can count even when the same identity already hit a hint.
3. The first three matching keyword LIST ENTRIES contribute two points for a
   title hit or one for a snippet hit. These are normalized, boundary-delimited
   phrase matches, not an unrestricted substring search. Duplicate entries and
   overlapping phrases can consume multiple hits; they are not independent facts.
4. **Any raw score greater than zero enters `contributing`.** Its weight is
   `1 + min(cluster_score, 2) * 0.4`. A generic title hit can therefore contribute
   2-3.6 weighted points with no entity or theme-specific mechanism.
5. Every contribution affects total score, story count, source labels, categories,
   recency, sentiment and potentially emission. The generic-ratio penalty applies
   to aggregate theme confidence, not individual membership. The actual penalty
   is 15-30% above a 60% generic ratio, when confidence is at least 25; the older
   docstring's 12% description is stale.
6. Emission requires two clusters, two distinct primary source-label strings,
   breadth of two, and confidence at least 20, followed by competition and another
   confidence check. Ontology `confidence_floor` is metadata, not this gate.
   Breadth is derived from configured theme industries and number of contributors,
   **not measured distinct source-supported sectors**. This is a trace observation,
   not authorization to change scoring or source semantics.
7. The five highest weighted contributors become `contributing_cluster_ids`.
   Only those IDs link directly to events, while lower-ranked contributors can
   still influence the aggregate theme and other stories' resulting attachments.

The first divergence is **positive lexical overlap being treated as eligibility
for a specific investment theme**, before ranking, event propagation, or display.
The global confidence penalty cannot establish that missing event-level relation.

## Eight trigger classes

Classes overlap. The diagnostic records both component classes and mutually
exclusive mechanism buckets; neither is a semantic correctness label.

| Class | How distinguished | Required caution |
|---|---|---|
| Explicitly resolved company/entity | Current resolver output, actual ontology hit and full source context recorded separately | Identity is not evidence of every theme associated with that company |
| Explicit ticker | Case-preserved registry ticker token plus successful current resolver grounding | An AVGO filing resolves identity; its headline alone may not establish capex |
| Specific multi-word phrase | Counted phrase absent from that theme's `generic_keywords` | Dictionary specificity is provisional: `energy demand` need not mean AI demand |
| Multiple reinforcing keywords | Multiple distinct specific matches flagged for review; overlapping/duplicate matches retained visibly | Two phrases may concern equity rather than credit; reinforcement needs semantic review |
| Single generic only | One generic keyword, no counted entity or specific keyword | Single **word** and single **phrase** are counted separately |
| Generic plus contextual support | Resolved companies, raw entity/sector hints and category recorded even if they did not score for this theme | `Energy` supports context, not all energy-related theses; category alone is weak |
| Non-company ontology term | Matching terms that do not resolve as a registry company in this text | Geography, indicators, institutions and unresolved/private company names are distinguished by typed resolver output; not automatically company evidence |
| Ambiguous/unresolved | No accepted company identity or no established theme mechanism | Abstain/review; do not repair the resolver or relabel a company in this slice |

`Inflation` is both an ontology entity and a generic keyword. The same occurrence
can score as both. Similar overlap exists for `China` and `Treasury`. Requiring
"generic + any entity" would retain this false reassurance. Conversely, Broadcom
can resolve to AVGO in the source while legacy hint/literal routes fail to count
it for a particular theme. The diagnostic preserves that distinction.

## Data and reproducibility

- All **125** existing evaluation candidates joined to their original ledger
  source lines and content hashes. All remain unreviewed. Eighty had exact
  title/snippet/URL matches to retained scored items; the remaining 45 use current
  entity extraction with category explicitly unknown. No historical category,
  cluster weight or admission result is invented for those observations.
- Three retained cache snapshots: July 25 full feed (75 clusters), July 25 Markets
  (54), and June 3 retained target (67). The two July targets overlap.
- Exact authenticated cycle-139 snapshot: September 16,
  `2026-09-16T16:42:43.576105+00:00`, 62 items, 60 clusters, 33 admitted events.
  Its freshness/deployment provenance is the closed A1 record.
- 391 recoverable contribution rows, representing 295 distinct source-text/theme
  pairs across these overlapping inputs. These are not 391 independent events.
- Current-behavior arithmetic independently reproduced the actual current
  extractor's emitted IDs, contributor ordering, confidence and evidence counts
  on all four cluster snapshots. The fresh result also exactly matches the
  supplied production payload. Historical stored outputs differ from current
  replay and are explicitly retained separately; they are not TM1a regressions.
- Replays used fresh in-memory momentum trackers, disabled rehydration and
  persistence, original timestamps and existing source inputs. No network,
  production refresh, event admission recomputation or persistence writes.

Artifacts in [diagnostics/rc3-tm1b](diagnostics/rc3-tm1b/):
`contributions.json` contains every trigger, counted/unscored keyword, source
text, entity support, category, weight, rank/top status, stored event fields and
candidate-rule outcome; `sources.json` identifies inputs and hashes;
`summary.json` and `policies.json` hold measurements; `manifest.json` pins source
and benchmark hashes; `analysis-recipe.py.txt` preserves the offline recipe.
The recipe is diagnostic text, not an installed runtime or test change.

## Measured retained-data results

Denominator is an article/cluster-theme pair with a positive CURRENT raw score.
"Generic only" means all counted keywords are ontology-designated generic and
there is no counted entity; contextual hints can still exist outside the match.
Generic-plus-specific counts below include both with-entity and without-entity cases.

| Input | All contributing pairs | Generic only | Generic + entity, no specific keyword | Generic + specific keyword | Generic-only emitted top pairs | Single-word-only emitted top pairs |
|---|---:|---:|---:|---:|---:|---:|
| 125 observation candidates | 171 | 14 | 10 | 9 | Not inferable as one cycle | Not inferable as one cycle |
| July 25 full-feed replay | 56 | 13 | 9 | 8 | 8 / 43 | 7 / 43 |
| July 25 Markets replay | 58 | 10 | 12 | 11 | 2 / 40 | 2 / 40 |
| June 3 replay | 46 | 19 | 13 | 3 | 12 / 36 | 12 / 36 |
| Fresh cycle-139 | 60 | 18 | 5 | 10 | 7 / 39 | 3 / 39 |

Of the 125 observations, 74 have at least one current contribution. Thirteen of
the 14 generic-only pairs use one word; the other uses the phrase `private equity`.
In the fresh cycle, 13 pairs use one generic word only; 16 use one generic keyword
entry only, including phrases; two use multiple generic keywords. This distinction
explains why five emitted pairs have a single generic keyword but only three
have a single generic word. None of these quantities is a false-positive rate.

Ten of the ledger's 14 generic-only pairs and seven of the fresh 18 have some
entity/sector hint. A hint's presence alone therefore does not separate the
problem. The June Broadcom case has resolver-confirmed company support outside
the current theme's counted entity route.

Selected generic-token frequencies (pairs containing that counted token, not
independent articles or false positives):

| Token | 125 observations | Fresh cycle | June replay |
|---|---:|---:|---:|
| ai | 6 | 6 | 12 |
| inflation | 3 | 1 | 3 |
| spending | 0 | 0 | 3 |
| retail | 0 | 0 | 0 |
| oil | 2 | 4 | 4 |
| private equity | 2 | 4 | 4 |
| credit | 1 | 2 | 0 |

Bare `energy` is not a standalone keyword in the current ontology. Specific
phrases such as `energy demand` and `energy security` are present and exercised.
`retail` is configured but produced no counted match in any inspected input;
there is no fabricated live retail control. Broad terms are not defective by
definition. Duplicate `blackstone`/`apollo` keyword entries and nested phrases
also show why raw hit count must not be called multiple independent signals.

## False-positive candidates and legitimate controls

Six focal suspected false-positive pairs for human adjudication:

| Retained example | Target theme and exact trigger | Measured result / concern |
|---|---|---|
| Google upsizes equity raising to back AI spending | consumer-stress: title `spending`, raw/weighted 2 | June replay top contributor; corporate investment is not evidence of household real-income compression |
| GE HealthCare cancer-scan acquisition | glp1-healthcare-revolution: title `healthcare`, raw/weighted 2 | Fresh contributor; theme does not emit. No GLP-1 mechanism in retained text |
| Buyout groups hunt for software bargains | ai-energy-demand: snippet `ai`, raw/weighted 1 | July contributor below top five; software substitution/fundraising does not establish power demand |
| Big Tech Debt Flood / Credit Weekly | direct-lending-expansion: title `credit`, raw/weighted 2 | July replay top contributor and historical event attachment; snippet describes corporate bond sales |
| Chinese oil prices / Saudi pipeline | china-stimulus-rotation: title `chinese` + snippet `beijing`, raw/weighted 3 | Fresh top contributor and event attachment; geography/supply shock does not establish the PBOC-easing thesis |
| Heat Bakes Central US, Raising Energy Demand | ai-energy-demand: title `energy demand`, raw/weighted 2 | July contribution below top five; a supposedly specific phrase still describes weather demand, not AI-driven structural load |

These are a selected challenge set, not six approved false labels or a prevalence
estimate. Additional ambiguous name/phrase cases are in the review packet.

Strong keyword-dependent preservation candidates, also awaiting human labels:

- **Household spending pressure** (`50a4632f9a27`, June): snippet says higher
  prices crimp lower-/middle-income consumer spending. `spending` alone contributes
  one point to consumer-stress and reaches its top set. B/C/D remove it. This is
  the same generic word as the corporate-spending negative candidate.
- **Goodman data-center construction** (`386e06ec2a09`, fresh): title says funds
  raised for a data-center partnership; snippet explicitly says construction.
  `data center` is generic for data-center-buildout and contributes two points.
  B/C/D remove it. That theme currently fails aggregate emission already; this
  is a candidate-recall loss, not removal of a currently displayed event theme.
- **Oil inventory depletion** (`1cb5daad94ae`, June): `oil` alone contributes two
  points; inventory/supply context is explicit. It reaches energy-security's top
  set; B/C/D remove it despite the supporting context not being a dictionary hit.
- **Broadcom AI-chip growth** (`fbd5ae5b9a93`, June): ai-compute-arms-race gets only
  `ai` through current matching, weighted 2.29648. Broadcom resolves to AVGO and
  the source specifies AI-chip growth. B removes it; C/D's contextual-company
  signal retains it. Semiconductor-capex separately scores an entity plus `ai
  chip` and `broadcom`; this is not interchangeable with the generic route.
- **CVC/Recordati take-private** (`fd5de1111776`, fresh): `take private` + `private
  equity` contributes three points to private-capital-takeover. All simulations
  retain its individual eligibility, but B/C/D remove the whole theme after
  excluding enough other contributors. This is an indirect retained-match loss.
- **Buyout software bargains** has a keyword-only `buyout` path to
  private-capital-takeover, distinct from its suspect AI-power association.

## Candidate correction options, not implementations

The user named broad policy families. The simulations instantiate them explicitly
so the numbers are reproducible, not presented as the only possible designs:

- **A / current:** existing TM1a matcher and all current downstream theme gates.
- **B / no generic-only evidence:** exclude a pair when it has only generic
  keywords and no counted entity/specific keyword. This intentionally strict
  instance includes generic phrases and multiple generic keywords. Keep remaining
  scores and aggregate gates unchanged. It does not reject generic-plus-broad-entity cases.
- **C / additional specific signal:** for generic-bearing pairs require a counted
  non-generic keyword, a distinct non-generic entity proxy, or a source-resolved
  company that belongs to this theme's canonical entity list and is not merely
  the generic word reinterpreted as a company. Entity proxies here are resolved
  names or non-generic multi-word/uppercase ontology terms. Bare category/sector
  hints do not qualify. Non-generic-only cases retain A eligibility. These are
  mechanical proxies for review, not verified semantic support. C can retain
  Broadcom where B rejects it, so the policies are not strictly nested.
- **D / illustrative weighted model:** deduplicate eligible entity identities
  and give three points each, capped at nine; non-nested specific phrases three,
  specific single words two, distinct generic keywords 0.25. Require raw score
  at least two. Apply original cluster weighting and aggregate gates afterward.
  Generic ratio still uses original counted keyword entries. Weights/threshold
  are an explicit uncalibrated sensitivity experiment, not recommended constants.

All matching support in these simulations is bounded to current counted keyword
hits plus the expressly described contextual company signal. Unscored fourth and
later hits are retained in the rows for review, not silently added as evidence.

| Input | A eligible / themes / top pairs | B | C | D |
|---|---|---|---|---|
| 125 observations | 171 / — / — | 157 / — / — | 147 / — / — | 139 / — / — |
| July full feed | 56 / 10 / 43 | 43 / 9 / 34 | 34 / 8 / 27 | 27 / 5 / 16 |
| July Markets | 58 / 11 / 40 | 48 / 10 / 36 | 41 / 10 / 33 | 38 / 10 / 30 |
| June retained | 46 / 9 / 36 | 27 / 7 / 22 | 19 / 4 / 14 | 17 / 4 / 14 |
| Fresh cycle-139 | 60 / 9 / 39 | 42 / 8 / 31 | 39 / 7 / 29 | 38 / 7 / 29 |

In fresh data B loses eight A top pairs. C loses eleven and adds one replacement;
D loses twelve and adds two. Therefore equal final top counts do not mean equal
membership. B removes private-capital-takeover; C/D also remove
china-stimulus-rotation. In June, B removes consumer-stress, taking the useful
household-spending candidate with the suspect corporate-spending attachment.

Expected tradeoffs, not measured semantic performance:

- A preserves coverage but has no event-level minimum evidence contract.
- B should remove generic-only false candidates, but demonstrably removes
  keyword-dependent positive candidates and leaves entity/phrase false candidates.
- C differentiates some contextual positives and generic/entity duplication,
  but misses valid context absent from the dictionary and can remove macro themes.
- D reorders membership and changes aggregate confidence much more broadly. It
  still admits wrong-mechanism phrases; weighting cannot substitute for relevance.
- Competition makes some outcomes non-monotonic: removing a competing theme can
  let another pass. Pair removal counts alone are not a downstream forecast.

No precision, recall, F1 or claimed improvement percentage is justified while
human labels are absent. Existing candidate themes are not an exhaustive universe
of true themes; even review of every current hit would not measure all false negatives.

## Downstream impact and limits

`app/events.py:499-505` links retained cluster IDs to themes, then lines 601-645
sort themes by global confidence, append all theme assets and industries, and
preserve `companies_direct` separately. Companies cap at eight; industries at six.
`app/explanations.py:320-354` takes those companies' intersection with theme assets
for chain candidates; the strongest chain becomes the event's payload chain.

Two mechanically traced examples (semantic judgments still require review):

1. **Fresh `a571ef55089d`:** `chinese`/`beijing` creates a score-three contributor
   to china-stimulus-rotation, retained in its three-member top set (confidence
   32). Its event has both energy-security and china-stimulus-rotation. Direct
   companies are empty. Companies contain energy-theme assets XOM/CVX/COP/LNG
   followed by FCX/VALE/BHP/AA from the China theme. Its six industries are Energy,
   Utilities, Consumer, Aerospace & Defense, Semiconductors and Industrials.
   The selected payload chain belongs to the stronger energy theme; do not claim
   the suspect China association caused that selected chain. It does create a
   second theme's candidacy and the extra company exposure.
2. **Retained `de6ac9b5f265`:** the Big Tech bond-sale article's `credit` hit
   contributes to direct-lending-expansion. Its historical event carries that
   theme and ai-compute-arms-race, no directly resolved companies, and
   NVDA/AVGO/AMD/MSFT/ORCL/ARES/OWL/ARCC as companies. Current replay also retains
   the direct-lending pair. Historical payload and current replay are distinct
   evidence, not a claim that old stored confidence equals current computation.

`frontend/src/lib/eventView.ts:191-238` can use propagated companies when direct
companies are absent. It separately enforces ET1a: with empty direct companies,
the chain fails the display gate. That gate remains correct; this task makes no
new authenticated UI claim and does not reopen it. The propagation contract is
traced only, not redesigned under TM1b.

Home reads the leading event's first theme in `homeBriefing.ts:109-114` and its
companies through `topStories.ts:26-36` and `adaptiveHero.ts:55`. Its interpretation
can therefore inherit an upstream attachment, but no specific Home rendering
change is asserted here. Server What Matters Now and industry activation also
consume theme membership/confidence (`app/themes.py:59-119`,
`app/theme_graph.py:746-813`). Workstation and theme drawers consume theme payloads.
The canonical **Markets Rotation Map is price-derived** (`MarketPage.tsx:6`);
this audit does not claim that changing theme matching would alter its prices.

No human-approved false labels exist yet, so there is no invented collection of
"proven false events." The trigger-to-payload consequences above are proven;
their semantic suitability is explicitly included in the review gate.

## Minimum association contract and recommended next slice

Proposed contract for human approval:

1. Event association needs a source-grounded connection to the theme's stated
   mechanism, not merely its vocabulary or a nearby sector/company.
2. A theme-specific phrase can establish that connection when used in the right
   sense; phrase length alone is insufficient.
3. A broad keyword needs additional **distinct, relevant context**. That may be
   a resolved theme participant plus a relevant action, a compatible mechanism
   phrase, or explicit source sector/action context. The same word in two ontology
   fields, generic category, duplicate phrase, or theme-injected company cannot
   supply the second signal.
4. Multiple keywords must reinforce one mechanism. Company identity by itself
   proves identity, not thematic relevance. Directional disagreement is separate
   from relevance; a relevant report can weaken a theme.
5. Insufficient retained evidence means no confident association. Preserve the
   report; do not manufacture companies or a causal chain to compensate.

**Recommended single possible implementation slice: RC3-TM1b1 — contextual
qualification of single-generic-trigger contributions.** Scope its first rules
to human-reviewed trigger families and preserve validated keyword-dependent
positives. Keep existing score weights/aggregate gates, propagation, graph and
display contracts separate. Start at contributor eligibility so a rejected weak
pair cannot continue affecting aggregate theme confidence while merely disappearing
from the displayed top set.

This is a scope recommendation, not a selected universal algorithm or authorization.
Do not ship B/C/D as written. The review must resolve whether the legitimate
single-word/phrase controls should remain direct associations, contextual-only,
or abstentions, and which explicit context is sufficient. Entity-only and
specific-phrase wrong-mechanism cases are recorded limits, not automatically
bundled into this first correction. A general retail rule requires real retail
coverage beyond this sample.

## Exact human-review gate

Read [the 16-packet / 23-judgment batch](diagnostics/rc3-tm1b/HUMAN_REVIEW.md).
Its paired examples cover the eight requested classes and the main policy
disagreements. The 125-candidate IDs and source lines are preserved where
applicable. Every requested decision is blank in `human-review.json`.

The six focal false-positive candidates are R01/consumer-stress,
R05/ai-energy-demand, R06/glp1-healthcare-revolution, R07/ai-energy-demand,
R12/direct-lending-expansion and R14/china-stimulus-rotation. They are candidates,
not prefilled answers. Positive/ambiguous contrasts deliberately share words with
them. Review the source and theme description before inspecting engine outcomes.

Complete all 23 with a source span, mechanism, reviewer/date and one of directly
relevant, contextual only, unrelated or insufficient evidence. Resolve disagreements
with a second reviewer before choosing a rule. This is a small development
decision batch, not a statistically sufficient evaluation or held-out benchmark.
Extend only unresolved strata; do not automatically turn model proposals into labels.

## Scope verification and stop

Only new local diagnostic artifacts were written. No application, ontology,
threshold, existing benchmark, frontend, event propagation, graph, admission,
historical data or production changes. No deployment or production recomputation.
The pre-existing `frontend/tsconfig.tsbuildinfo` modification was left unchanged.
Four independent replay comparisons passed; tests/type/lint/build were not rerun
because no implementation changed. Artifacts are local, uncommitted and unpublished.

Stop after this diagnosis. A1/TM1a stays closed. TM1b diagnosis awaits user review;
TM1b1 implementation and all subsequent milestones require separate authorization.
