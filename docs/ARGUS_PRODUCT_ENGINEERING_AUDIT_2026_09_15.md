# Argus product and engineering audit

Audit date: 2026-09-15, America/New_York. Baseline: `e2b2a6f`.

## Decision

Argus has enough product breadth to test a valuable business. Its next advantage should be a dependable daily research workflow: **what changed for my coverage, what evidence supports it, what might it affect, and what should I check next?** More generated conclusions and more screens will not compensate for inaccurate associations or unreliable personal state.

Serve individual investors, analysts, and portfolio managers through that shared workflow. Use progressively deeper views and eventually portfolio context, rather than building three products simultaneously. The recommendation is a product hypothesis to validate with users, not a claim that retention or willingness to pay has already been established.

## Scope and confidence

- Inspected current ingestion, theme matching, event construction, graph provisioning, interpretation, institutional memory, authentication, refresh, personal-state, build, and deployment code.
- Read authenticated production Home, Feed, Saved, Markets, M&A, Private Markets, and Listen. These were bounded read-only observations on the existing production release. Earlier Event/Drawer/Workstation validation remains recorded in its own closures; it is not a fresh validation of this audit's changes.
- Ran frontend and backend suites, type-check, lint, production build, and npm dependency audits. Ran no production load test, exploit, destructive test, data migration, or user-content write.
- Did not inspect Railway runtime logs/configuration, Supabase backup restoration, external monitoring, billing, content-license contracts, or real-user retention/conversion data. Repository absence does not prove an externally configured service is absent.
- EA1, EA2a, ET1a, and RC2 remain closed. No graph semantic invariant was demonstrated to be violated. Existing closure limitations remain intact.
- This is an evidence-backed product/engineering review, not an exhaustive security certification or a guarantee of investment performance.

## What is worth preserving

1. A deterministic backend pipeline, explicit event/evidence structures, and a canonical company resolver already exist. The problem is inconsistent use of those contracts, not lack of another reasoning system.
2. Authentication is materially stronger than the old readiness audit describes: server-side session checks, independently authenticated backend routers, startup readiness checks, and account-scoped queries are present. Do not carry the old "no auth" findings forward as current facts.
3. The graph has a shared provisioning path and extensive regression coverage. `frontend/src/hooks/useArgusIntelligence.ts` and `frontend/src/lib/intelligenceProvisioning.ts` are assets to extend, not replace.
4. The sealed institutional archive and outcome machinery provide a foundation for a research record. Its current resolutions concern structural persistence/membership/conviction, not independently measured investment returns (`app/institutional_memory/resolution.py:13`).
5. Honest absence works in parts of production. Private Markets explicitly reported only 4 of 8 layers measured and marked credit data unavailable. Preserve this behavior rather than filling empty space with inference.
6. Markets distinguishes leadership position from percentage price change. Listen labels coverage relationships as mentions. These are useful boundaries to retain.

## Improvements completed locally

These are independent commits on `codex/argus-audit-2026-09-15`. None was pushed or deployed as part of this audit.

| Commit | Change | Evidence and limits |
|---|---|---|
| `d6ee1f8` | Preserve anonymous saved research/watchlist data when the cloud migration fails; refresh the correct account query after success | Four regression assertions failed before the change. Ten new cases cover returned errors, rejected transports, pending writes, successful visibility, retries, and empty input. Existing account-transition tests also pass. This does not unify all user-state stores or resolve cross-device theme sync. |
| `2a57561` | Replace a Unix `grep` subprocess in a backend architecture test with Python file inspection | Full suite previously had 1,325 passes and one Windows portability failure. Same source-boundary assertion now passes without the external executable. No backend runtime change. |
| `0b5ba5a` | Patch Next.js from 15.5.21 to 15.5.24; align eslint-config-next and lockfile | Same framework release line, no forced major upgrade. Critical production advisory count becomes zero locally; other advisories remain. |

The existing `.venv` lacked the already-declared `PyJWT[crypto]` dependency. Installed it locally to run the authentication tests. This changed the development environment, not requirements or production configuration.

Final gates on the updated branch:

- 1,471 frontend tests across 85 files passed (baseline: 1,461 across 84).
- 1,326 backend tests passed; two warnings remained.
- Type-check passed with incremental writes disabled.
- Lint passed with four existing warnings in untouched files.
- Production build passed after the Next patch. Representative first-load JS: Feed about 275 kB, M&A about 314 kB; these are build outputs, not measured user latency.
- Diff checks passed. The user's existing `frontend/tsconfig.tsbuildinfo` was restored byte-for-byte; SHA256 `2A49ADBC82FF76FAB5DD326C32EDA2DB63BAAB9C6BD07F281ED131BEBDFF51AE`.

The new migration failure cases are locally tested, not production fault-injected. Release through the normal reviewed workflow and validate with controlled test accounts; do not simulate failed writes against a user's real research.

## Priority findings

### A1. Dependency maintenance needs an operational owner

Status: package advisories verified; critical Next patch prepared locally, not deployed.

The original production dependency audit reported one critical and three high package entries. Next 15.5.21 is covered by the Windows-hosted-server and AVIF image-optimization advisories. The official patched 15.x release is 15.5.24. Exploitability depends on deployment and reachable inputs; no production exploit was attempted or established.

After the targeted patch, `npm audit --omit=dev` reports **0 critical, 3 high, 1 moderate**: nanoid, postcss, sharp, and Next's transitive postcss exposure. The all-dependency audit reports **1 critical, 6 high, 4 moderate, 1 low**, including the development-only happy-dom context-escape advisory. These are package entries, not counts of independently exploitable application bugs.

Action: ship the tested Next patch separately, then triage remaining dependency paths and inputs. Do not run `npm audit fix --force` as a blanket resolution. Track production and development risks separately. Record image behavior and auth/middleware smoke checks with the release.

Sources: [Next Windows advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36), [Next AVIF advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), [Happy DOM advisory](https://github.com/advisories/GHSA-37j7-fg3j-429f).

### A2. Theme matching remains the first upstream semantic priority

Status: previously proven defect, independently confirmed in current code; unchanged here.

`app/theme_graph.py:413` uppercases incoming entity hints, and lines 419-422 also match lowercased ticker tokens against normalized title/snippet text. The existing resolver's ambiguity protections do not govern that text-matching branch. Keyword hits add contributors separately. This can attach an incorrect theme before the display gate executes.

Keep RC3-TM1 read-only first: distinguish explicit resolved-company hits, ordinary-word collisions, specific keywords, and generic-only matches. Measure each against retained examples plus a held-out annotated set. Implement ticker collision handling and generic-keyword policy as separate changes with separate before/after reports.

Exit: collision controls no longer contribute an entity hit, legitimate company-name/explicit-ticker controls survive, and changes in theme membership and downstream event exposure are measured. Do not equate zero false positives on a few fixtures with production precision.

### A3. Direct involvement and theme context still collapse on other surfaces

Status: current code plus visible production examples; outside ET1a's closed gate.

`app/events.py:619` adds theme related_assets into event.companies. `frontend/src/lib/feedStream.ts:62` falls back to that expanded list whenever companies_direct is empty. Production Feed showed Thai GDP news with XOM/CVX/COP, and AI rebound news with WMT/TGT/HD. This is a separate involvement-attribution problem, not a failed transmission gate.

Action: after matcher integrity, separately define and test direct company involvement versus contextual theme exposure. Preserve the graph and counts until that slice's contract is approved. A valid theme relationship alone must not imply that a company was named in an event.

### A4. The homepage can manufacture a comparison without a recorded relationship

Status: rendered symptom and source-to-display construction verified.

Production Home displayed: "Can TNX hold if WMT takes over?" `frontend/src/lib/homeBriefing.ts:144` selects a different cooling/reversing theme and interpolates the two classified subjects; it does not require a recorded competitive or causal relationship between them. Its adjacent chain is assembled from theme macro factors, first industry, and first asset (`:117`).

Action: a separate Home explanation-grounding slice. A watch statement should reference a concrete, evidenced condition, or be absent. Do not extend ET1a's scope retroactively or assume that one Event gate governs Home.

### A5. Market instruments need unambiguous identities and timestamps

Status: current code and rendered UI verified.

`frontend/src/components/brief/MarketPulse.tsx:24` maps SPY to "S&P 500", USO to "Oil", and IBIT to "Bitcoin", then prints the ETF share close. The observed tape displayed 757.39 under S&P 500 and 43.11 under Bitcoin. "Delayed" identifies timeliness, not the instrument. `MarketSummary.tsx` and `marketBrief.ts` also convert proxy observations into underlying-market statements.

Action: show the symbol, proxy role, price unit, and actual observation date consistently. Keep ETF performance distinct from index/spot performance and measured yields distinct from a bond-price inference. Reuse the existing representative-instrument treatment visible in other chart surfaces.

Exit: no ETF absolute price appears as an index level, commodity spot price, or bitcoin spot price. Weekend/stale/provider-missing tests must preserve an honest as-of state.

### A6. M&A classification needs transaction-specific evidence

Status: two concrete production classification defects traced to current rules.

Production presented a Federal Reserve notice terminating enforcement actions involving banks as a "HIGH CONVICTION WITHDRAWN" deal. It also tagged an Elon Musk/Tesla-SpaceX merger hint as SPAC and Announced.

`frontend/src/hooks/useMAIntelligence.ts:142` matches any `terminat` substring as withdrawn; `:143` matches `spac` inside SpaceX. `frontend/src/lib/maIntelligence.ts:209` ultimately defaults otherwise unclassified status to Announced. Upstream category admission is a separate point to inspect before changing it.

Action: diagnose transaction existence, transaction type, and lifecycle status as distinct facts, with ambiguous states permitted. Keep this separate from RC2 sector/relationship rules and OP1.2 SEC dedup. Positive controls must include actual terminated acquisitions, real SPAC combinations, and formally announced deals.

### A7. Personal monitoring is not yet a single durable contract

Status: storage and promise mismatch verified; migration failure subset fixed locally.

Saved says "Synced across all your devices" (`frontend/src/app/saved/page.tsx:223`). Saved articles and entity watchlists use Supabase, while followed themes and theme watches use unscoped localStorage keys (`useFollowedThemes.ts:6`, `useThemeWatchlist.ts:5`). Those theme selections do not have the same cross-device or account-isolation contract. No cross-account exploitation was tested.

Action: inventory the four stores, establish ownership/migration rules, and make the UI promise match actual persistence. Then unify followed subjects under account-scoped durable storage with two-browser and account-switch controls. Preserve public market facts separately from private user notes and selection.

### A8. The recurring-value loop is incomplete

Status: product gap from code/route inventory and sampled UI, not measured user dissatisfaction.

Saved is a promising starting point, but the inspected system did not reveal a complete server-side material-change alert delivery flow, a first-class portfolio-position model, or a single event-to-saved-thesis-to-review workflow. Current event detail lacks a direct persistent research-note/watch action. The empty Saved page directs users back to Feed to bookmark, while the active Feed cards primarily navigate to events.

Action: finish one vertical workflow using the existing archive and change ledger. A user follows a subject, sees new evidence since the last review, records a thesis/watch condition, and returns when that condition changes. Add notifications only after relevance and freshness are reliable. Portfolio managers can initially use a coverage list; do not imply portfolio-weighted risk before a real position model exists.

### A9. A healthy HTTP process can coexist with a failed research pipeline

Status: current control-flow defect/risk verified statically; no production failure induced.

`api/main.py:255` always reports status ok. `app/background.py:786` records a fatal loop exception and re-raises, ending the thread. Good per-target diagnostics already exist, but the public health response does not use them. Checked-in Railway configuration contains no healthcheckPath. Deployed dashboard settings and external monitors remain unverified.

`api/routes/feed.py:595` derives is_stale from is_refreshing rather than observation age/success. A stale snapshot and an actively refreshing snapshot are different states.

Action: define separate liveness, readiness, and data-freshness contracts. Reuse existing diagnostics. Alert on missed successful cycles, source coverage collapse, and failed archive writes. Test failure/recovery and stale-cache serving independently; avoid a restart policy that worsens an upstream outage.

### A10. User refreshes still have an expensive synchronous path

Status: current source path verified; no production load test performed.

`api/routes/feed.py:722` exposes full inline recomputation for refresh and cold filter combinations. Auth is enforced, but the inspected feed/analyze routes lack per-user resource controls; analysis title/snippet fields have no declared length caps. `frontend/src/hooks/useFeed.ts:41` stores force_refresh in hook state, and subsequent query executions retain those parameters until changed. Some price routes already have limits; this is not a claim that the entire app lacks rate limiting.

Action: measure refresh request rate, pipeline cost and duration, and cache-key cardinality. Then separate snapshot reads from controlled refresh jobs, with deduplication and bounded inputs. Do not merely add API replicas: shared durable files and background writers need ownership rules first.

### A11. Release discipline exists in reports but is not fully automated in the repository

Status: repository configuration verified; hosted branch protections unverified.

No tracked .github CI workflows were present. Python requirements use open lower bounds, and root requirements include ML/local-assistant dependencies beyond the API. The existing virtual environment missed a declared dependency. The frontend lockfile is present, but Next selected an unrelated parent-directory lockfile when inferring workspace root. Four lint warnings persist.

Action: automate existing gates before adding more tests. Establish a production Python dependency lock/runtime and prove the actual Railway install scope. Set an explicit frontend workspace root. Add authenticated smoke tests with controlled accounts and a safe staging/release path. Require a reproducible release record with SHA, source snapshot/cycle, and rollback instructions.

### A12. Interface and documentation drift slow development

Status: concrete duplicate header and stale documentation verified.

Feed mounts TopNav locally (`frontend/src/app/feed/page.tsx:73`) while RootLayout mounts it globally (`frontend/src/app/layout.tsx:33`); both appeared in the accessibility tree. The old architecture document describes engines as planned and the Drawer as the only graph consumer, which is no longer true.

Action: give navigation a single owner, keep the useful refresh/settings controls, and test keyboard/accessibility behavior. Add a short current system map with owners and contracts; mark old audits as historical instead of creating another competing architectural canon. Profile actual client/server latency before refactoring the graph for performance.

## What should make Argus essential

The differentiated promise should be: **"Know when your research needs to change, and see exactly why."**

The daily workflow should take a user from a material update to its source, direct versus contextual exposure, saved research, and a falsifiable watch condition. Preserve the original evidence and the user's prior view so changes are reviewable. Use the current institutional archive, not a new parallel memory system.

| Audience | Same underlying workflow | Additional depth |
|---|---|---|
| Active individual investor | What changed in my followed companies/themes, and does it deserve attention? | Clear plain-language reason, source link, limited actionable watch list |
| Analyst | What changed in my coverage and what supports or contradicts my thesis? | Evidence drill-down, notes, versioned research, copy/export with provenance |
| Portfolio manager | Which monitored exposures require review and why? | Initially coverage overlap; later explicit holdings/weights, horizons, and aggregation with verified mapping |

Monitoring and saved research are established competitive expectations: [Koyfin documents watchlist/portfolio alerts](https://www.koyfin.com/features/alerts/), and [AlphaSense documents monitoring with contextual source links](https://help.alpha-sense.com/hc/en-us/articles/41815509396371-Maximizing-Your-Monitoring-Tools-in-AlphaSense). Those facts do not prove Argus demand. The proposed differentiation is a reliable change/evidence/research record, rather than trying to match every terminal feature or licensed-content catalog.

## Fastest credible sequence

Time ranges below are planning bands for one focused engineer, not commitments. Work remains split into independently reviewed changes.

| Order | Work | Exit condition |
|---|---|---|
| Now, roughly 1-2 days | Review/release the three prepared commits; triage remaining advisories; establish pipeline freshness monitoring and release gates | Local and staging checks pass; authenticated production smoke checks recorded; no false "all secure" claim |
| Next, roughly 3-5 days | RC3-TM1 diagnosis and separately scoped matcher corrections; market proxy identity correction | Before/after membership measurements; held-out relevance review; explicit instruments/as-of labels |
| Next, roughly 3-5 days | Separate M&A classification and Home explanation grounding; direct-versus-contextual involvement contract | Retained negative and positive controls pass on the actual rendered surfaces |
| Then, roughly 1-2 weeks | Finish the durable personal research loop using Saved, existing archive, and change ledger | Two-device persistence, no lost saves, a useful since-last-review view, source-backed saved thesis and watch condition |
| Pilot before expanding | Run a ten-user research pilot spanning all three audiences, then add only the missing steps they repeatedly need | Observed time saved, repeat use, trusted discoveries, corrections, and willingness to pay |

Security and release hygiene can progress independently of the semantic research, but do not combine their commits. Within semantic work, keep matcher hygiene, asset propagation, provenance, full-chain validity, and M&A transaction classification separate. No change in this audit reopens EA1, EA2a, ET1a, or RC2.

## How to measure progress

Before tuning rankings, assemble an annotated, versioned evaluation set from roughly 150-200 diverse real events, with a held-out portion. Label event grouping, direct entities, theme relevance, transaction status where applicable, and claim support separately. Include both low-information and ambiguous examples. Never score abstention as automatically correct or count multiple copies as independent confirmation.

Engineering measures: publication-to-ingestion latency, successful-cycle age, per-source availability, stage failures, coverage loss, cost per successful cycle, and save/sync success. Record distributions and failure cases, not only averages.

Product measures: time to the first useful saved item, source-open rate, time to validate a claim, unwanted-alert rate, time saved compared with each user's prior routine, and repeated weekly use of monitored subjects. No analytics or user messages were installed/sent in this audit.

Proposed pilot exit, to agree before testing: at least 7 of 10 users complete the research loop unaided, at least 6 return on three days in a week, and multiple users can name a concrete research task Argus replaced. These are experimental decision rules, not industry benchmarks or forecasts. Record results separately by audience; a blended average can conceal that one group is not served.

Do not use structural-prediction confirmation as evidence of profitable trading, price-forecast calibration, or causal truth. Any such claim requires a separate independent outcome definition and evaluation.

## Immediate next action

Review and release the prepared operational fixes through the existing workflow, then begin RC3-TM1 as the next semantic diagnosis. Start recruiting pilot participants alongside that work, with user authorization before contacting anyone. Hold expansion of graphs, personas, feeds, and generated predictions until the common daily research loop is trusted and demonstrably used.

The highest-value architectural simplification is a shared evidence contract and clear ownership of each conclusion. It does not require rewriting the system or moving every engine at once.
