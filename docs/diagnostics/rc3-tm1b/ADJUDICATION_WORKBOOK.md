# TM1b human adjudication workbook

Derived from the existing HUMAN_REVIEW.md packets. All 23 decisions have been human-adjudicated; none remain pending. Authoritative review records and user-message provenance are in human-adjudications.json. Recorded counts: A=9, B=5, C=9, D=0. These are development adjudications, not promoted benchmark truth labels. The source material is retained title/snippet text, not an independently retrieved full article. No model recommendations or benchmark truth labels are supplied here.

A. **Directly relevant** — The article materially concerns the theme's actual mechanism.

B. **Contextually relevant** — The theme is useful context, but the article should not receive the same contributor authority as a directly relevant article.

C. **Irrelevant** — The match is lexical/topical coincidence and should not contribute.

D. **Unclear / insufficient evidence** — Cannot responsibly determine from available source material.

Choose based on the source and theme definition. Current scores, membership and asset propagation describe software behavior; they are not evidence that a theme is relevant. A resolved company proves identity, not the theme mechanism. A missing resolved company does not establish absence of an entity in the article. Ontology generic/specific classifications are implementation metadata, not human judgments.

Human choices will be recorded separately in human-adjudications.json, with user-message provenance. Optional rationale/evidence spans are welcome; none will be invented or attributed to the reviewer. Model interpretations, if later needed, must be explicitly separate. Existing evaluation/argus-trust-v1 labels remain untouched.

Conditional downstream behavior: if a contribution reaches an emitted theme's top-five list and its event is admitted, the theme can enter event theme_ids and append the listed contextual assets/industries, subject to existing caps and other themes. It can create chain candidates; ET1a still independently requires direct company grounding before rendering an Event chain. Lower-ranked contributors can affect aggregate theme confidence, source counts and emission. No new UI observation is claimed.

## J01 — TM1B-R01 / consumer-stress

**Article:** Google upsizes historic equity raising to $85bn to back AI spending spree

**Source:** FT Companies. [Original source link](https://www.ft.com/content/85299cdd-d9b3-4b40-8d10-73fc9ddb4573). Retained corpus: retained-3a7b87bcf0f9; record: fd245bd14b0b.

**Relevant snippet:** Tech giant’s first stock offering in more than two decades gets strong demand as investors shrug off huge investment plans

**Proposed theme:** Real Income Compression (consumer-stress).

**Theme mechanism/definition:** Persistent real-wage compression, revolving credit utilisation approaching cycle highs, and accelerating delinquency rates signal that the consumer spending-velocity normalisation is transmitting into earnings pressure across discretionary and lower-income spending channels.

**Exact keyword/phrase triggers:**
- spending — title; ontology-designated generic; 2 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_only; component tags: single_generic_only, generic_with_contextual_entity_or_sector. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** GOOGL. Raw upstream entity/sector hints: none. Source category: Markets.

**Current contribution:** raw score 2. Retained in an emitted theme top-five set in current-code offline replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Real Income Compression; contextual asset candidates WMT, TGT, HD, AMZN; industry candidates Consumer, Financials, Real Estate, Industrials. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** C — Irrelevant. **Human rationale (user supplied):** “Spending” refers to Google’s corporate AI investment, not household spending, real-income pressure, revolving credit, or consumer earnings pressure. This is exactly the kind of lexical collision TM1b should eliminate.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J02 — TM1B-R01 / ai-energy-demand

**Article:** Google upsizes historic equity raising to $85bn to back AI spending spree

**Source:** FT Companies. [Original source link](https://www.ft.com/content/85299cdd-d9b3-4b40-8d10-73fc9ddb4573). Retained corpus: retained-3a7b87bcf0f9; record: fd245bd14b0b.

**Relevant snippet:** Tech giant’s first stock offering in more than two decades gets strong demand as investors shrug off huge investment plans

**Proposed theme:** Grid Bottleneck Trade (ai-energy-demand).

**Theme mechanism/definition:** AI data-centre buildout has created a structural capacity deficit in dispatchable power that cannot be resolved within the typical 3-5 year grid-upgrade cycle, generating sustained pricing power for merchant generators.

**Exact keyword/phrase triggers:**
- ai spending — title; ontology-designated specific; 2 raw keyword points.
- ai — title; ontology-designated generic; 2 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: Google. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_plus_entity_plus_specific; component tags: resolved_company_entity, specific_multiword_phrase, generic_with_contextual_entity_or_sector. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** GOOGL. Raw upstream entity/sector hints: none. Source category: Markets.

**Current contribution:** raw score 7. Retained in an emitted theme top-five set in current-code offline replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Grid Bottleneck Trade; contextual asset candidates NVDA, CEG, VST, NEE, EQIX; industry candidates Semiconductors, Software, Utilities, Energy, Real Estate. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** B — Contextually relevant. **Human rationale (user supplied):** Google’s AI spending is an upstream driver of data-center and power demand, so there is a legitimate relationship. But this article does not establish grid shortages, dispatchable-power scarcity, power pricing, or the theme’s actual bottleneck mechanism. It should not receive full-strength contributor authority.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J03 — TM1B-R02 / consumer-stress

**Article:** ‘Squeezing more life out of every dollar’: How inflation is forcing a new reality on American families and amplifying the economy’s ‘K shape’

**Source:** MarketWatch. [Original source link](https://www.marketwatch.com/story/squeezing-more-life-out-of-every-dollar-how-inflation-is-forcing-a-new-reality-on-american-families-and-amplifying-the-economys-k-shape-c3ba42de?mod=mw_rss_topstories). Retained corpus: retained-3a7b87bcf0f9; record: 50a4632f9a27.

**Relevant snippet:** Higher prices are crimping spending among lower- and middle-income consumers, the Fed’s beige book reports.

**Proposed theme:** Real Income Compression (consumer-stress).

**Theme mechanism/definition:** Persistent real-wage compression, revolving credit utilisation approaching cycle highs, and accelerating delinquency rates signal that the consumer spending-velocity normalisation is transmitting into earnings pressure across discretionary and lower-income spending channels.

**Exact keyword/phrase triggers:**
- spending — snippet; ontology-designated generic; 1 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_only; component tags: single_generic_only. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: none. Source category: Markets.

**Current contribution:** raw score 1. Retained in an emitted theme top-five set in current-code offline replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Real Income Compression; contextual asset candidates WMT, TGT, HD, AMZN; industry candidates Consumer, Financials, Real Estate, Industrials. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** A — Directly relevant. **Human rationale (user supplied):** Inflation squeezing lower- and middle-income consumers and crimping spending is essentially the stated Real Income Compression mechanism.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J04 — TM1B-R03 / data-center-buildout

**Article:** Goodman raises $455m for its Hong Kong data center partnership

**Source:** Data Center Dynamics. [Original source link](https://www.datacenterdynamics.com/en/news/goodman-raises-455m-for-its-hong-kong-data-center-partnership/). Retained corpus: fresh-cycle139; record: 386e06ec2a09.

**Relevant snippet:** Will fund construction of Hong Kong data center, due to open in 2028

**Proposed theme:** Data Center Buildout (data-center-buildout).

**Theme mechanism/definition:** Hyperscaler and AI demand has turned physical data-centre capacity. Land, power interconnection, and cooling. Into the scarce input, re-rating colocation REITs and the electrical/thermal equipment supply chain on multi-year pre-leased backlogs.

**Exact keyword/phrase triggers:**
- data center — title; ontology-designated generic; 2 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_only; component tags: single_generic_only. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: none. Source category: Markets.

**Current contribution:** raw score 2. Not retained in an emitted theme top-five set in current-code offline replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Data Center Buildout; contextual asset candidates EQIX, DLR, VRT, ETN, GEV; industry candidates Real Estate, Utilities, Industrials, Semiconductors. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** A — Directly relevant. **Human rationale (user supplied):** The article is specifically about financing construction of a new data center. That directly concerns physical data-center capacity buildout, rather than merely mentioning “data center” incidentally.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J05 — TM1B-R04 / energy-security

**Article:** Trump’s Iran war drains US oil stocks to lowest level since 2004

**Source:** FT Companies. [Original source link](https://www.ft.com/content/d0be73c8-b8d8-4ffd-874e-e97a6ecffef7). Retained corpus: retained-3a7b87bcf0f9; record: 1cb5daad94ae.

**Relevant snippet:** Industry warns prices could soon jump as inventories reach ‘critically low’ threshold

**Proposed theme:** Supply-Side Energy Shock (energy-security).

**Theme mechanism/definition:** Geopolitical supply-chain fragmentation and OPEC+ quota discipline are sustaining energy price volatility above mean-reversion levels, creating a persistent inflation-expectation anchor and sector-rotation catalyst.

**Exact keyword/phrase triggers:**
- oil — title; ontology-designated generic; 2 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_only; component tags: single_generic_only, generic_with_contextual_entity_or_sector. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: Energy. Source category: Geopolitical.

**Current contribution:** raw score 2. Retained in an emitted theme top-five set in current-code offline replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Supply-Side Energy Shock; contextual asset candidates XOM, CVX, COP, LNG; industry candidates Energy, Utilities, Consumer, Aerospace & Defense. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** A — Directly relevant. **Human rationale (user supplied):** The article is directly about an oil-supply shock, critically low inventories, geopolitical disruption, and potential price spikes. That maps closely to the Supply-Side Energy Shock mechanism.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J06 — TM1B-R05 / ai-energy-demand

**Article:** Heat Bakes Central US, Raising Energy Demand as East Stays Cool

**Source:** Bloomberg Markets. [Original source link](https://www.bloomberg.com/news/articles/2026-07-25/heat-bakes-central-us-raising-energy-demand-as-east-stays-cool). Retained corpus: evaluation125; record: observation:547ec59b12c7700b701a.

**Relevant snippet:** Baking temperatures will sear the central US from the Rocky Mountains to the Mississippi River and eventually push down into the Gulf Coast for the rest of the month, putting regional power grids to the test.

**Proposed theme:** Grid Bottleneck Trade (ai-energy-demand).

**Theme mechanism/definition:** AI data-centre buildout has created a structural capacity deficit in dispatchable power that cannot be resolved within the typical 3-5 year grid-upgrade cycle, generating sustained pricing power for merchant generators.

**Exact keyword/phrase triggers:**
- energy demand — title; ontology-designated specific; 2 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** specific_only; component tags: specific_multiword_phrase. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: Energy. Source category: Markets.

**Current contribution:** raw score 2. Observation-level input: inspect linked retained snapshots below; no single-cycle top status assigned.
- Linked retained snapshot retained-0f875b7be67b, cluster ffeec6879917: current-replay top status False; stored historical top status False. Historical output is not asserted identical to current replay.
- Linked retained snapshot retained-9ac9473db0fa, cluster ffeec6879917: current-replay top status False; stored historical top status False. Historical output is not asserted identical to current replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Grid Bottleneck Trade; contextual asset candidates NVDA, CEG, VST, NEE, EQIX; industry candidates Semiconductors, Software, Utilities, Energy, Real Estate. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** C — Irrelevant. **Human rationale (user supplied):** The article is about weather-driven electricity demand from heat, not AI/data-center-driven structural power scarcity. The phrase `energy demand` is too broad here and creates the wrong causal theme.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J07 — TM1B-R06 / glp1-healthcare-revolution

**Article:** GE HealthCare in talks over $1bn deal for maker of cancer scan chemicals

**Source:** FT Deals. [Original source link](https://www.ft.com/content/21b663e4-60ee-4937-a561-5b0f505676a2?syn-25a6b1a6=1). Retained corpus: fresh-cycle139; record: 09f1b49bd14e.

**Relevant snippet:** Acquisition of Sofie Biosciences is second big purchase for medical imaging specialist after split from General Electric

**Proposed theme:** Metabolic Disease Repricing (glp1-healthcare-revolution).

**Theme mechanism/definition:** The GLP-1 drug class is forcing a structural re-rating of healthcare subsectors as the market reprices the long-run prevalence of obesity-related comorbidities, with second-order volume headwinds hitting medical devices and surgical-volume chains.

**Exact keyword/phrase triggers:**
- healthcare — title; ontology-designated generic; 2 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_only; component tags: single_generic_only, generic_with_contextual_entity_or_sector. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** GE. Raw upstream entity/sector hints: GE. Source category: M&A.

**Current contribution:** raw score 2. Not retained in an emitted theme top-five set in current-code offline replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Metabolic Disease Repricing; contextual asset candidates LLY, NVO, UNH, ABBV; industry candidates Healthcare, Consumer. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** C — Irrelevant. **Human rationale (user supplied):** This is a cancer-imaging acquisition. `Healthcare` is only a sector word here and does not connect the article to GLP-1, obesity-related disease prevalence, or the repricing mechanism of that theme.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J08 — TM1B-R07 / ai-energy-demand

**Article:** Buyout groups hunt for software bargains after ‘SaaS-pocalypse’

**Source:** FT Deals. [Original source link](https://www.ft.com/content/d331c1f5-27c0-4d5a-a4ab-7a52e1119cc5?syn-25a6b1a6=1). Retained corpus: evaluation125; record: observation:1f912cddde1a0a9f5bbd.

**Relevant snippet:** Francisco Partners co-founder Dipanjan ‘DJ’ Deb says AI will not kill software sector as firm raises $21bn

**Proposed theme:** Grid Bottleneck Trade (ai-energy-demand).

**Theme mechanism/definition:** AI data-centre buildout has created a structural capacity deficit in dispatchable power that cannot be resolved within the typical 3-5 year grid-upgrade cycle, generating sustained pricing power for merchant generators.

**Exact keyword/phrase triggers:**
- ai — snippet; ontology-designated generic; 1 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_only; component tags: single_generic_only, generic_with_contextual_entity_or_sector. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: Technology. Source category: M&A.

**Current contribution:** raw score 1. Observation-level input: inspect linked retained snapshots below; no single-cycle top status assigned.
- Linked retained snapshot retained-0f875b7be67b, cluster 7e245817ec2b: current-replay top status False; stored historical top status False. Historical output is not asserted identical to current replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Grid Bottleneck Trade; contextual asset candidates NVDA, CEG, VST, NEE, EQIX; industry candidates Semiconductors, Software, Utilities, Energy, Real Estate. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** C — Irrelevant. **Human rationale (user supplied):** The article mentions AI in the context of whether AI will disrupt software, not data-center buildout, power demand, grid scarcity, or merchant-generation pricing. `ai` alone is not enough here.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J09 — TM1B-R07 / private-capital-takeover

**Article:** Buyout groups hunt for software bargains after ‘SaaS-pocalypse’

**Source:** FT Deals. [Original source link](https://www.ft.com/content/d331c1f5-27c0-4d5a-a4ab-7a52e1119cc5?syn-25a6b1a6=1). Retained corpus: evaluation125; record: observation:1f912cddde1a0a9f5bbd.

**Relevant snippet:** Francisco Partners co-founder Dipanjan ‘DJ’ Deb says AI will not kill software sector as firm raises $21bn

**Proposed theme:** Private Capital Takeover (private-capital-takeover).

**Theme mechanism/definition:** Record private-equity dry powder, paired with deep private-credit financing, is accelerating take-privates and sponsor-led buyouts. Migrating value creation off public exchanges and shrinking the listed-equity universe in targeted sectors.

**Exact keyword/phrase triggers:**
- buyout — title; ontology-designated generic; 2 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_only; component tags: single_generic_only, generic_with_contextual_entity_or_sector. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: Technology. Source category: M&A.

**Current contribution:** raw score 2. Observation-level input: inspect linked retained snapshots below; no single-cycle top status assigned.
- Linked retained snapshot retained-0f875b7be67b, cluster 7e245817ec2b: current-replay top status True; stored historical top status True. Historical output is not asserted identical to current replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Private Capital Takeover; contextual asset candidates BX, KKR, APO, CG, TPG; industry candidates Financials, Real Estate, Industrials. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** A — Directly relevant. **Human rationale (user supplied):** The article is explicitly about buyout groups seeking software acquisition opportunities. That directly concerns sponsor-led buyouts and private-capital takeovers.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J10 — TM1B-R07 / private-credit-expansion

**Article:** Buyout groups hunt for software bargains after ‘SaaS-pocalypse’

**Source:** FT Deals. [Original source link](https://www.ft.com/content/d331c1f5-27c0-4d5a-a4ab-7a52e1119cc5?syn-25a6b1a6=1). Retained corpus: evaluation125; record: observation:1f912cddde1a0a9f5bbd.

**Relevant snippet:** Francisco Partners co-founder Dipanjan ‘DJ’ Deb says AI will not kill software sector as firm raises $21bn

**Proposed theme:** Non-Bank Lending Ascendancy (private-credit-expansion).

**Theme mechanism/definition:** Structural capital-requirement increases under Basel III are accelerating the transfer of lending market share from regulated banks to alternative credit managers. A secular shift that is creating fee-income winners irrespective of the credit cycle.

**Exact keyword/phrase triggers:**
- buyout — title; ontology-designated generic; 2 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_only; component tags: single_generic_only, generic_with_contextual_entity_or_sector. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: Technology. Source category: M&A.

**Current contribution:** raw score 2. Observation-level input: inspect linked retained snapshots below; no single-cycle top status assigned.
- Linked retained snapshot retained-0f875b7be67b, cluster 7e245817ec2b: current-replay top status True; stored historical top status True. Historical output is not asserted identical to current replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Non-Bank Lending Ascendancy; contextual asset candidates ARES, APO, BX, KKR, OWL; industry candidates Financials, Real Estate. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** B — Contextually relevant. **Human rationale (user supplied):** Buyouts often use private credit, so the article is relevant to the broader non-bank lending ecosystem, but the excerpt does not establish the mechanism at the heart of this theme: bank-capital constraints shifting lending share to alternative managers. This should be context, not full contributor authority.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J11 — TM1B-R08 / treasury-yield-pressure

**Article:** These 16 states are offering tax-free shopping days as back-to-school costs soar to over $800 per student

**Source:** MarketWatch. [Original source link](https://www.marketwatch.com/story/these-16-states-are-offering-tax-holidays-as-back-to-school-costs-soar-to-over-800-per-student-0ec92464?mod=mw_rss_topstories). Retained corpus: evaluation125; record: observation:43237f13ae73e9cede70.

**Relevant snippet:** As inflation continues to squeeze household budgets, parents and students are on a mission to find back-to-school bargains.

**Proposed theme:** Higher-for-Longer Repricing (treasury-yield-pressure).

**Theme mechanism/definition:** The market has systematically under-priced the degree to which neutral rates have structurally re-anchored, generating ongoing multiple compression risk for duration-sensitive assets across the capital structure.

**Exact keyword/phrase triggers:**
- inflation — snippet; ontology-designated generic; 1 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: Inflation. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_plus_entity; component tags: noncompany_ontology_term, ambiguous_or_unresolved_semantics. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: none. Source category: Markets.

**Current contribution:** raw score 4. Observation-level input: inspect linked retained snapshots below; no single-cycle top status assigned.
- Linked retained snapshot retained-0f875b7be67b, cluster 36e35f2ad29e: current-replay top status True; stored historical top status True. Historical output is not asserted identical to current replay.
- Linked retained snapshot retained-9ac9473db0fa, cluster 36e35f2ad29e: current-replay top status True; stored historical top status True. Historical output is not asserted identical to current replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Higher-for-Longer Repricing; contextual asset candidates TNX, TLT, JPM, BAC, EQIX; industry candidates Software, Real Estate, Financials, Utilities, Consumer. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** C — Irrelevant. **Human rationale (user supplied):** The article is about household budgets and back-to-school costs. `Inflation` appears, but there is no evidence here about structurally higher neutral rates, long-duration valuation pressure, or Treasury repricing. The same word being counted twice as keyword + ontology term should not make this relevant.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J12 — TM1B-R09 / ai-compute-arms-race

**Article:** Broadcom’s stock falls despite accelerating AI-chip growth

**Source:** MarketWatch. [Original source link](https://www.marketwatch.com/story/broadcoms-stock-falls-despite-accelerating-ai-chip-growth-7731ee89?mod=mw_rss_topstories). Retained corpus: retained-3a7b87bcf0f9; record: fbd5ae5b9a93.

**Relevant snippet:** Latest revenue figures lack meaningful upside after the stock’s sharp recent rally.

**Proposed theme:** AI Compute Arms Race (ai-compute-arms-race).

**Theme mechanism/definition:** Frontier-model labs and hyperscalers are committing to multi-gigawatt training clusters faster than accelerator supply can scale, turning raw compute access into the binding competitive constraint and a durable demand floor under the entire AI hardware stack.

**Exact keyword/phrase triggers:**
- ai — title; ontology-designated generic; 2 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_only; component tags: single_generic_only, generic_with_contextual_entity_or_sector. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** AVGO. Raw upstream entity/sector hints: Semiconductors. Source category: Markets.

**Current contribution:** raw score 2. Retained in an emitted theme top-five set in current-code offline replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with AI Compute Arms Race; contextual asset candidates NVDA, AVGO, AMD, MSFT, ORCL; industry candidates Semiconductors, Software, Utilities, Energy. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** A — Directly relevant. **Human rationale (user supplied):** The article is explicitly about Broadcom’s AI-chip growth. That directly concerns AI compute demand and hardware supply, which is the core of the AI Compute Arms Race theme.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J13 — TM1B-R09 / semiconductor-capex-cycle

**Article:** Broadcom’s stock falls despite accelerating AI-chip growth

**Source:** MarketWatch. [Original source link](https://www.marketwatch.com/story/broadcoms-stock-falls-despite-accelerating-ai-chip-growth-7731ee89?mod=mw_rss_topstories). Retained corpus: retained-3a7b87bcf0f9; record: fbd5ae5b9a93.

**Relevant snippet:** Latest revenue figures lack meaningful upside after the stock’s sharp recent rally.

**Proposed theme:** Silicon Sovereignty Capex (semiconductor-capex-cycle).

**Theme mechanism/definition:** AI-driven chip demand and export-control-induced supply concentration are sustaining an elevated semiconductor equipment investment cycle, with TSMC capacity expansion and domestic-fab subsidies creating multi-year earnings visibility for the equipment-and-materials stack.

**Exact keyword/phrase triggers:**
- ai chip — title; ontology-designated specific; 2 raw keyword points.
- broadcom — title; ontology-designated generic; 2 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: Broadcom. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_plus_entity_plus_specific; component tags: resolved_company_entity, specific_multiword_phrase, generic_with_contextual_entity_or_sector. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** AVGO. Raw upstream entity/sector hints: Semiconductors. Source category: Markets.

**Current contribution:** raw score 7. Retained in an emitted theme top-five set in current-code offline replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Silicon Sovereignty Capex; contextual asset candidates NVDA, AMD, ASML, MU, AMAT; industry candidates Semiconductors, Software, Energy, Real Estate. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** A — Directly relevant. **Human rationale (user supplied):** `AI-chip` demand and Broadcom are directly connected to semiconductor-capex dynamics. The article materially concerns one of the demand drivers behind equipment and capacity investment, so this is strong enough for full contributor authority.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J14 — TM1B-R10 / private-capital-takeover

**Article:** CVC faces shareholder revolt over €10.7bn Recordati take-private

**Source:** FT Deals. [Original source link](https://www.ft.com/content/a4a22443-2082-409b-96e1-650c44a40f44?syn-25a6b1a6=1). Retained corpus: fresh-cycle139; record: fd5de1111776.

**Relevant snippet:** Investors accuse private equity group of pressuring them into selling at ‘lowball’ price

**Proposed theme:** Private Capital Takeover (private-capital-takeover).

**Theme mechanism/definition:** Record private-equity dry powder, paired with deep private-credit financing, is accelerating take-privates and sponsor-led buyouts. Migrating value creation off public exchanges and shrinking the listed-equity universe in targeted sectors.

**Exact keyword/phrase triggers:**
- take private — title; ontology-designated specific; 2 raw keyword points.
- private equity — snippet; ontology-designated generic; 1 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_plus_specific; component tags: specific_multiword_phrase. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: none. Source category: M&A.

**Current contribution:** raw score 3. Retained in an emitted theme top-five set in current-code offline replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Private Capital Takeover; contextual asset candidates BX, KKR, APO, CG, TPG; industry candidates Financials, Real Estate, Industrials. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** A — Directly relevant. **Human rationale (user supplied):** The article is explicitly about a private-equity-led take-private. That directly matches the Private Capital Takeover mechanism.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J15 — TM1B-R10 / private-credit-expansion

**Article:** CVC faces shareholder revolt over €10.7bn Recordati take-private

**Source:** FT Deals. [Original source link](https://www.ft.com/content/a4a22443-2082-409b-96e1-650c44a40f44?syn-25a6b1a6=1). Retained corpus: fresh-cycle139; record: fd5de1111776.

**Relevant snippet:** Investors accuse private equity group of pressuring them into selling at ‘lowball’ price

**Proposed theme:** Non-Bank Lending Ascendancy (private-credit-expansion).

**Theme mechanism/definition:** Structural capital-requirement increases under Basel III are accelerating the transfer of lending market share from regulated banks to alternative credit managers. A secular shift that is creating fee-income winners irrespective of the credit cycle.

**Exact keyword/phrase triggers:**
- private equity — snippet; ontology-designated specific; 1 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** specific_only; component tags: specific_multiword_phrase. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: none. Source category: M&A.

**Current contribution:** raw score 1. Retained in an emitted theme top-five set in current-code offline replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Non-Bank Lending Ascendancy; contextual asset candidates ARES, APO, BX, KKR, OWL; industry candidates Financials, Real Estate. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** B — Contextually relevant. **Human rationale (user supplied):** Private equity is adjacent to private credit and non-bank lending, but this excerpt does not establish the actual mechanism of bank-capital constraints shifting lending share to alternative credit managers. It is relevant context, not full-strength evidence.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J16 — TM1B-R11 / ai-energy-demand

**Article:** Blockbuster I.P.O.s Are Creating New Millionaires. Philanthropies Want a Cut.

**Source:** NYT DealBook. [Original source link](https://www.nytimes.com/2026/07/25/business/dealbook/spacex-anthropic-philanthropy.html). Retained corpus: evaluation125; record: observation:7c19f9aa793b7aab7f5c.

**Relevant snippet:** As start-ups like Anthropic and OpenAI prepare to go public, nonprofits are hoping for a secondary giving windfall from the new tech ultrawealthy.

**Proposed theme:** Grid Bottleneck Trade (ai-energy-demand).

**Theme mechanism/definition:** AI data-centre buildout has created a structural capacity deficit in dispatchable power that cannot be resolved within the typical 3-5 year grid-upgrade cycle, generating sustained pricing power for merchant generators.

**Exact keyword/phrase triggers:**
- openai — snippet; ontology-designated generic; 1 raw keyword points.
- anthropic — snippet; ontology-designated generic; 1 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: Anthropic, OpenAI. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_plus_entity; component tags: noncompany_ontology_term, ambiguous_or_unresolved_semantics. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: none. Source category: Markets.

**Current contribution:** raw score 5. Observation-level input: inspect linked retained snapshots below; no single-cycle top status assigned.
- Linked retained snapshot retained-0f875b7be67b, cluster 30f444a72dfe: current-replay top status True; stored historical top status True. Historical output is not asserted identical to current replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Grid Bottleneck Trade; contextual asset candidates NVDA, CEG, VST, NEE, EQIX; industry candidates Semiconductors, Software, Utilities, Energy, Real Estate. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** C — Irrelevant. **Human rationale (user supplied):** Anthropic and OpenAI are named because of IPO wealth and philanthropy. The article does not concern data-center construction, power shortages, grid upgrades, or merchant-generator pricing. Those organization names should not be enough by themselves to attach the Grid Bottleneck Trade theme.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J17 — TM1B-R12 / ai-compute-arms-race

**Article:** Big Tech Debt Flood Is Taking Over Risk In Market: Credit Weekly

**Source:** Bloomberg Markets. [Original source link](https://www.bloomberg.com/news/articles/2026-07-25/big-tech-debt-flood-is-taking-over-risk-in-market-credit-weekly). Retained corpus: evaluation125; record: observation:addecfa32a9a4bdd1714.

**Relevant snippet:** Big Tech’s insatiable appetite for AI investment is unleashing a relentless wave of bond sales — and having a bigger impact on the US corporate bond market than might be obvious.

**Proposed theme:** AI Compute Arms Race (ai-compute-arms-race).

**Theme mechanism/definition:** Frontier-model labs and hyperscalers are committing to multi-gigawatt training clusters faster than accelerator supply can scale, turning raw compute access into the binding competitive constraint and a durable demand floor under the entire AI hardware stack.

**Exact keyword/phrase triggers:**
- ai — snippet; ontology-designated generic; 1 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_only; component tags: single_generic_only. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: none. Source category: Markets.

**Current contribution:** raw score 1. Observation-level input: inspect linked retained snapshots below; no single-cycle top status assigned.
- Linked retained snapshot retained-0f875b7be67b, cluster de6ac9b5f265: current-replay top status True; stored historical top status True. Historical output is not asserted identical to current replay.
- Linked retained snapshot retained-9ac9473db0fa, cluster de6ac9b5f265: current-replay top status False; stored historical top status False. Historical output is not asserted identical to current replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with AI Compute Arms Race; contextual asset candidates NVDA, AVGO, AMD, MSFT, ORCL; industry candidates Semiconductors, Software, Utilities, Energy. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** B — Contextually relevant. **Human rationale (user supplied):** The article is genuinely about Big Tech’s AI investment cycle, so it belongs in the broader AI-capex context. But it does not establish the specific AI Compute Arms Race mechanism of accelerator scarcity, training-cluster expansion, or compute access constraints. Useful context, not full contributor authority.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J18 — TM1B-R12 / direct-lending-expansion

**Article:** Big Tech Debt Flood Is Taking Over Risk In Market: Credit Weekly

**Source:** Bloomberg Markets. [Original source link](https://www.bloomberg.com/news/articles/2026-07-25/big-tech-debt-flood-is-taking-over-risk-in-market-credit-weekly). Retained corpus: evaluation125; record: observation:addecfa32a9a4bdd1714.

**Relevant snippet:** Big Tech’s insatiable appetite for AI investment is unleashing a relentless wave of bond sales — and having a bigger impact on the US corporate bond market than might be obvious.

**Proposed theme:** Direct Lending Expansion (direct-lending-expansion).

**Theme mechanism/definition:** Permanent and insurance-linked capital is flooding into direct lending, extending non-bank credit beyond the middle market into investment-grade and asset-based finance. A fund-formation supercycle that compounds fee-related earnings for the largest credit platforms.

**Exact keyword/phrase triggers:**
- credit — title; ontology-designated generic; 2 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_only; component tags: single_generic_only. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: none. Source category: Markets.

**Current contribution:** raw score 2. Observation-level input: inspect linked retained snapshots below; no single-cycle top status assigned.
- Linked retained snapshot retained-0f875b7be67b, cluster de6ac9b5f265: current-replay top status True; stored historical top status True. Historical output is not asserted identical to current replay.
- Linked retained snapshot retained-9ac9473db0fa, cluster de6ac9b5f265: current-replay top status False; stored historical top status False. Historical output is not asserted identical to current replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Direct Lending Expansion; contextual asset candidates ARES, OWL, ARCC, OBDC; industry candidates Financials, Real Estate. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** C — Irrelevant. **Human rationale (user supplied):** `Credit` here refers to the corporate bond market. The article does not concern non-bank direct lending, asset-based finance, private-credit platforms, or alternative lenders taking share. This is lexical overlap.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J19 — TM1B-R13 / private-credit-expansion

**Article:** LLCP hits $2bn hard cap for oversubscribed lower-middle market fund

**Source:** PE Wire. [Original source link](https://www.privateequitywire.co.uk/llcp-hits-2bn-hard-cap-for-oversubscribed-lower-middle-market-fund/). Retained corpus: evaluation125; record: observation:672b7511005202844a22.

**Relevant snippet:** Los Angeles-based private equity firm LLCP has closed its fourth lower-middle-market fund – LLCP Lower Middle Market IV– at its $2bn hard cap after attracting commitments well above its original $1.7bn target.

**Proposed theme:** Non-Bank Lending Ascendancy (private-credit-expansion).

**Theme mechanism/definition:** Structural capital-requirement increases under Basel III are accelerating the transfer of lending market share from regulated banks to alternative credit managers. A secular shift that is creating fee-income winners irrespective of the credit cycle.

**Exact keyword/phrase triggers:**
- middle market — title; ontology-designated specific; 2 raw keyword points.
- private equity — snippet; ontology-designated specific; 1 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** specific_only; component tags: specific_multiword_phrase, multiple_specific_keywords_candidate. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: LLCP. Source category: M&A.

**Current contribution:** raw score 3. Observation-level input: inspect linked retained snapshots below; no single-cycle top status assigned.
- Linked retained snapshot retained-0f875b7be67b, cluster 44057695f2a5: current-replay top status True; stored historical top status True. Historical output is not asserted identical to current replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Non-Bank Lending Ascendancy; contextual asset candidates ARES, APO, BX, KKR, OWL; industry candidates Financials, Real Estate. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** C — Irrelevant. **Human rationale (user supplied):** This is private-equity fundraising for a lower-middle-market fund, not private-credit expansion or lending displacement from banks. `Middle market` and `private equity` are adjacent terms, but the article does not concern the theme’s lending mechanism.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J20 — TM1B-R14 / china-stimulus-rotation

**Article:** Chinese oil prices hit record highs after attacks on Saudi pipeline

**Source:** FT Companies. [Original source link](https://www.ft.com/content/3a88d016-9575-4c11-bd34-14606964a867?syn-25a6b1a6=1). Retained corpus: fresh-cycle139; record: a571ef55089d.

**Relevant snippet:** Beijing has cushioned global impact of Iran war by drawing down stocks but is now ‘coming off its crash diet’

**Proposed theme:** PBOC Easing Rotation (china-stimulus-rotation).

**Theme mechanism/definition:** PBOC policy support and Chinese domestic demand recovery are creating a rotation opportunity into EM equities, base metals, and commodity-linked sectors as positioning unwinds from China-underweight consensus.

**Exact keyword/phrase triggers:**
- chinese — title; ontology-designated generic; 2 raw keyword points.
- beijing — snippet; ontology-designated generic; 1 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_only; component tags: generic_with_contextual_entity_or_sector. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: Energy. Source category: Geopolitical.

**Current contribution:** raw score 3. Retained in an emitted theme top-five set in current-code offline replay.

**Observed stored event:** theme IDs: energy-security, china-stimulus-rotation; companies: XOM, CVX, COP, LNG, FCX, VALE, BHP, AA; direct companies: ; industries: Energy, Utilities, Consumer, Aerospace & Defense, Semiconductors, Industrials. This is existing payload state, not a human relevance decision.

**Downstream consequence if admitted:** association with PBOC Easing Rotation; contextual asset candidates FCX, VALE, BHP, AA; industry candidates Energy, Semiconductors, Industrials, Consumer. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** C — Irrelevant. **Human rationale (user supplied):** China/Beijing are only geographic references here. The article is about an oil-price shock and inventory drawdowns, not PBOC easing, domestic-demand recovery, EM rotation, or China stimulus.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J21 — TM1B-R14 / energy-security

**Article:** Chinese oil prices hit record highs after attacks on Saudi pipeline

**Source:** FT Companies. [Original source link](https://www.ft.com/content/3a88d016-9575-4c11-bd34-14606964a867?syn-25a6b1a6=1). Retained corpus: fresh-cycle139; record: a571ef55089d.

**Relevant snippet:** Beijing has cushioned global impact of Iran war by drawing down stocks but is now ‘coming off its crash diet’

**Proposed theme:** Supply-Side Energy Shock (energy-security).

**Theme mechanism/definition:** Geopolitical supply-chain fragmentation and OPEC+ quota discipline are sustaining energy price volatility above mean-reversion levels, creating a persistent inflation-expectation anchor and sector-rotation catalyst.

**Exact keyword/phrase triggers:**
- oil prices — title; ontology-designated specific; 2 raw keyword points.
- oil — title; ontology-designated generic; 2 raw keyword points.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: none. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** generic_plus_specific; component tags: specific_multiword_phrase, generic_with_contextual_entity_or_sector. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: Energy. Source category: Geopolitical.

**Current contribution:** raw score 4. Retained in an emitted theme top-five set in current-code offline replay.

**Observed stored event:** theme IDs: energy-security, china-stimulus-rotation; companies: XOM, CVX, COP, LNG, FCX, VALE, BHP, AA; direct companies: ; industries: Energy, Utilities, Consumer, Aerospace & Defense, Semiconductors, Industrials. This is existing payload state, not a human relevance decision.

**Downstream consequence if admitted:** association with Supply-Side Energy Shock; contextual asset candidates XOM, CVX, COP, LNG; industry candidates Energy, Utilities, Consumer, Aerospace & Defense. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** A — Directly relevant. **Human rationale (user supplied):** This directly matches the Supply-Side Energy Shock mechanism: geopolitical disruption, oil-price volatility, supply stress, and inventory depletion.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J22 — TM1B-R15 / semiconductor-capex-cycle

**Article:** AVGO 8-K — Results of Operations and Financial Condition

**Source:** SEC Filings. [Original source link](https://www.sec.gov/Archives/edgar/data/1730168/000173016826000076/0001730168-26-000076-index.htm). Retained corpus: fresh-cycle139; record: 709162e2cefe.

**Relevant snippet:** SEC 8-K filing by AVGO: Item 2.02 Results of Operations; Item 8.01 Other Material Event

**Proposed theme:** Silicon Sovereignty Capex (semiconductor-capex-cycle).

**Theme mechanism/definition:** AI-driven chip demand and export-control-induced supply concentration are sustaining an elevated semiconductor equipment investment cycle, with TSMC capacity expansion and domestic-fab subsidies creating multi-year earnings visibility for the equipment-and-materials stack.

**Exact keyword/phrase triggers:**
- None; contribution came through an entity route.

**Entity match routes:** upstream hint hits: AVGO; matching literal ontology terms: AVGO. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** entity_only; component tags: resolved_company_entity, explicit_ticker. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** AVGO. Raw upstream entity/sector hints: AVGO. Source category: Company.

**Current contribution:** raw score 6. Retained in an emitted theme top-five set in current-code offline replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Silicon Sovereignty Capex; contextual asset candidates NVDA, AMD, ASML, MU, AMAT; industry candidates Semiconductors, Software, Energy, Real Estate. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** B — Contextually relevant. **Human rationale (user supplied):** AVGO is directly identified, so the article belongs to Broadcom/semiconductor context, but the supplied excerpt is only filing metadata and does not establish semiconductor capex, capacity expansion, equipment demand, or subsidy-driven investment. It should not receive full contributor authority from this excerpt alone.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.

## J23 — TM1B-R16 / private-capital-takeover

**Article:** EU review of airline ownership rules clouds Apollo’s £5.7bn easyJet bid

**Source:** FT Deals. [Original source link](https://www.ft.com/content/8c3a155b-03c0-4034-9403-839674a3df9e?syn-25a6b1a6=1). Retained corpus: evaluation125; record: observation:c845c6b635a8c64f72d0.

**Relevant snippet:** Shares in UK low-cost carrier slide as Brussels move casts doubt on takeover

**Proposed theme:** Private Capital Takeover (private-capital-takeover).

**Theme mechanism/definition:** Record private-equity dry powder, paired with deep private-credit financing, is accelerating take-privates and sponsor-led buyouts. Migrating value creation off public exchanges and shrinking the listed-equity universe in targeted sectors.

**Exact keyword/phrase triggers:**
- None; contribution came through an entity route.

**Entity match routes:** upstream hint hits: none; matching literal ontology terms: Apollo. The literal route adds at most one hit even if several alternatives match.

**Trigger class:** entity_only; component tags: noncompany_ontology_term, ambiguous_or_unresolved_semantics. Generic-only describes the counted route, not all source context; a single generic entry may be a multi-word phrase.

**Resolved entity/ticker support:** none accepted by the current resolver. Raw upstream entity/sector hints: Airlines. Source category: M&A.

**Current contribution:** raw score 3. Observation-level input: inspect linked retained snapshots below; no single-cycle top status assigned.
- Linked retained snapshot retained-0f875b7be67b, cluster 2019eb91c0fe: current-replay top status True; stored historical top status True. Historical output is not asserted identical to current replay.

**Observed stored event:** no event joined for this record in this input; no rendered UI effect is asserted.

**Downstream consequence if admitted:** association with Private Capital Takeover; contextual asset candidates BX, KKR, APO, CG, TPG; industry candidates Financials, Real Estate, Industrials. Existing ranking, admission, caps and the separate ET1a display gate still apply, as described above.

**Human decision:** A — Directly relevant. **Human rationale (user supplied):** This is explicitly an Apollo takeover bid for easyJet, with regulatory review affecting the deal. That materially concerns sponsor-led private-capital takeover activity, even though the resolver failed to canonicalize Apollo in this retained record.

**Model recommendation:** not supplied. **Human review status:** human-adjudicated; reviewer: user; recorded date: 2026-09-22. Separate source-span field remains unset because no exact span was submitted as such.
