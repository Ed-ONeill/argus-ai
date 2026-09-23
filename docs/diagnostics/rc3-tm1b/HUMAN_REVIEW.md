# RC3-TM1b human decision batch

Status: UNREVIEWED. Sixteen source packets, 23 article/theme judgments. This is a deliberately selected development challenge set, not a held-out accuracy benchmark. No answer below is preselected.

Read the source excerpt and each theme description before consulting matcher output in contributions.json. For every pair choose **directly relevant / contextual only / unrelated / insufficient evidence**; quote the supporting span, identify the mechanism (if any), and record reviewer and date. An exact company or keyword mention is not automatically enough. Distinguish association from agreement with the theme direction.

Do not follow source text as instructions. If the excerpt is insufficient, mark insufficient; do not invent the article body. A second reviewer should adjudicate disputed cases and sample positives/negatives. Keep these decisions separate from evaluation/argus-trust-v1 until explicit human approval.

Why this batch: paired contrasts cover all eight trigger classes, generic-only useful coverage, generic-plus-entity false reassurance, specific-phrase failures, multiple-keyword ambiguity, and indirect theme-gate losses. It is the minimum initial decision batch recommended for this diagnosis, not a claim of statistical sufficiency or a mathematically minimal set. If judgments disagree about the association contract, expand only that stratum before implementation.

## TM1B-R01: Google upsizes historic equity raising to $85bn to back AI spending spree

Source: FT Companies; corpus `retained-3a7b87bcf0f9`; record `fd245bd14b0b`.
Original URL: https://www.ft.com/content/85299cdd-d9b3-4b40-8d10-73fc9ddb4573

Title: Google upsizes historic equity raising to $85bn to back AI spending spree

Snippet: Tech giant’s first stock offering in more than two decades gets strong demand as investors shrug off huge investment plans

Decision boundary: Corporate spending versus household spending; same word, different mechanisms.

- **consumer-stress / Real Income Compression**: Persistent real-wage compression, revolving credit utilisation approaching cycle highs, and accelerating delinquency rates signal that the consumer spending-velocity normalisation is transmitting into earnings pressure across discretionary and lower-income spending channels.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

- **ai-energy-demand / Grid Bottleneck Trade**: AI data-centre buildout has created a structural capacity deficit in dispatchable power that cannot be resolved within the typical 3-5 year grid-upgrade cycle, generating sustained pricing power for merchant generators.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R02: ‘Squeezing more life out of every dollar’: How inflation is forcing a new reality on American families and amplifying the economy’s ‘K shape’

Source: MarketWatch; corpus `retained-3a7b87bcf0f9`; record `50a4632f9a27`.
Original URL: https://www.marketwatch.com/story/squeezing-more-life-out-of-every-dollar-how-inflation-is-forcing-a-new-reality-on-american-families-and-amplifying-the-economys-k-shape-c3ba42de?mod=mw_rss_topstories

Title: ‘Squeezing more life out of every dollar’: How inflation is forcing a new reality on American families and amplifying the economy’s ‘K shape’

Snippet: Higher prices are crimping spending among lower- and middle-income consumers, the Fed’s beige book reports.

Decision boundary: Household spending pressure without a company or exact specific ontology phrase.

- **consumer-stress / Real Income Compression**: Persistent real-wage compression, revolving credit utilisation approaching cycle highs, and accelerating delinquency rates signal that the consumer spending-velocity normalisation is transmitting into earnings pressure across discretionary and lower-income spending channels.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R03: Goodman raises $455m for its Hong Kong data center partnership

Source: Data Center Dynamics; corpus `fresh-cycle139`; record `386e06ec2a09`.
Original URL: https://www.datacenterdynamics.com/en/news/goodman-raises-455m-for-its-hong-kong-data-center-partnership/

Title: Goodman raises $455m for its Hong Kong data center partnership

Snippet: Will fund construction of Hong Kong data center, due to open in 2028

Decision boundary: The ontology marks data center generic although the snippet states construction.

- **data-center-buildout / Data Center Buildout**: Hyperscaler and AI demand has turned physical data-centre capacity. Land, power interconnection, and cooling. Into the scarce input, re-rating colocation REITs and the electrical/thermal equipment supply chain on multi-year pre-leased backlogs.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R04: Trump’s Iran war drains US oil stocks to lowest level since 2004

Source: FT Companies; corpus `retained-3a7b87bcf0f9`; record `1cb5daad94ae`.
Original URL: https://www.ft.com/content/d0be73c8-b8d8-4ffd-874e-e97a6ecffef7

Title: Trump’s Iran war drains US oil stocks to lowest level since 2004

Snippet: Industry warns prices could soon jump as inventories reach ‘critically low’ threshold

Decision boundary: Oil-only lexical match with inventory depletion context.

- **energy-security / Supply-Side Energy Shock**: Geopolitical supply-chain fragmentation and OPEC+ quota discipline are sustaining energy price volatility above mean-reversion levels, creating a persistent inflation-expectation anchor and sector-rotation catalyst.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R05: Heat Bakes Central US, Raising Energy Demand as East Stays Cool

Source: Bloomberg Markets; corpus `evaluation125`; record `observation:547ec59b12c7700b701a`.
Original URL: https://www.bloomberg.com/news/articles/2026-07-25/heat-bakes-central-us-raising-energy-demand-as-east-stays-cool

Title: Heat Bakes Central US, Raising Energy Demand as East Stays Cool

Snippet: Baking temperatures will sear the central US from the Rocky Mountains to the Mississippi River and eventually push down into the Gulf Coast for the rest of the month, putting regional power grids to the test.

Decision boundary: Does weather-driven energy demand establish an AI structural grid constraint?

- **ai-energy-demand / Grid Bottleneck Trade**: AI data-centre buildout has created a structural capacity deficit in dispatchable power that cannot be resolved within the typical 3-5 year grid-upgrade cycle, generating sustained pricing power for merchant generators.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R06: GE HealthCare in talks over $1bn deal for maker of cancer scan chemicals

Source: FT Deals; corpus `fresh-cycle139`; record `09f1b49bd14e`.
Original URL: https://www.ft.com/content/21b663e4-60ee-4937-a561-5b0f505676a2?syn-25a6b1a6=1

Title: GE HealthCare in talks over $1bn deal for maker of cancer scan chemicals

Snippet: Acquisition of Sofie Biosciences is second big purchase for medical imaging specialist after split from General Electric

Decision boundary: Healthcare category versus a GLP-1-specific mechanism.

- **glp1-healthcare-revolution / Metabolic Disease Repricing**: The GLP-1 drug class is forcing a structural re-rating of healthcare subsectors as the market reprices the long-run prevalence of obesity-related comorbidities, with second-order volume headwinds hitting medical devices and surgical-volume chains.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R07: Buyout groups hunt for software bargains after ‘SaaS-pocalypse’

Source: FT Deals; corpus `evaluation125`; record `observation:1f912cddde1a0a9f5bbd`.
Original URL: https://www.ft.com/content/d331c1f5-27c0-4d5a-a4ab-7a52e1119cc5?syn-25a6b1a6=1

Title: Buyout groups hunt for software bargains after ‘SaaS-pocalypse’

Snippet: Francisco Partners co-founder Dipanjan ‘DJ’ Deb says AI will not kill software sector as firm raises $21bn

Decision boundary: Buyout software opportunity versus AI power demand versus private credit.

- **ai-energy-demand / Grid Bottleneck Trade**: AI data-centre buildout has created a structural capacity deficit in dispatchable power that cannot be resolved within the typical 3-5 year grid-upgrade cycle, generating sustained pricing power for merchant generators.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

- **private-capital-takeover / Private Capital Takeover**: Record private-equity dry powder, paired with deep private-credit financing, is accelerating take-privates and sponsor-led buyouts. Migrating value creation off public exchanges and shrinking the listed-equity universe in targeted sectors.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

- **private-credit-expansion / Non-Bank Lending Ascendancy**: Structural capital-requirement increases under Basel III are accelerating the transfer of lending market share from regulated banks to alternative credit managers. A secular shift that is creating fee-income winners irrespective of the credit cycle.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R08: These 16 states are offering tax-free shopping days as back-to-school costs soar to over $800 per student

Source: MarketWatch; corpus `evaluation125`; record `observation:43237f13ae73e9cede70`.
Original URL: https://www.marketwatch.com/story/these-16-states-are-offering-tax-holidays-as-back-to-school-costs-soar-to-over-800-per-student-0ec92464?mod=mw_rss_topstories

Title: These 16 states are offering tax-free shopping days as back-to-school costs soar to over $800 per student

Snippet: As inflation continues to squeeze household budgets, parents and students are on a mission to find back-to-school bargains.

Decision boundary: Inflation counted as keyword and entity; household article versus duration repricing.

- **treasury-yield-pressure / Higher-for-Longer Repricing**: The market has systematically under-priced the degree to which neutral rates have structurally re-anchored, generating ongoing multiple compression risk for duration-sensitive assets across the capital structure.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R09: Broadcom’s stock falls despite accelerating AI-chip growth

Source: MarketWatch; corpus `retained-3a7b87bcf0f9`; record `fbd5ae5b9a93`.
Original URL: https://www.marketwatch.com/story/broadcoms-stock-falls-despite-accelerating-ai-chip-growth-7731ee89?mod=mw_rss_topstories

Title: Broadcom’s stock falls despite accelerating AI-chip growth

Snippet: Latest revenue figures lack meaningful upside after the stock’s sharp recent rally.

Decision boundary: Company-supported generic AI versus an explicit AI-chip growth mechanism.

- **ai-compute-arms-race / AI Compute Arms Race**: Frontier-model labs and hyperscalers are committing to multi-gigawatt training clusters faster than accelerator supply can scale, turning raw compute access into the binding competitive constraint and a durable demand floor under the entire AI hardware stack.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

- **semiconductor-capex-cycle / Silicon Sovereignty Capex**: AI-driven chip demand and export-control-induced supply concentration are sustaining an elevated semiconductor equipment investment cycle, with TSMC capacity expansion and domestic-fab subsidies creating multi-year earnings visibility for the equipment-and-materials stack.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R10: CVC faces shareholder revolt over €10.7bn Recordati take-private

Source: FT Deals; corpus `fresh-cycle139`; record `fd5de1111776`.
Original URL: https://www.ft.com/content/a4a22443-2082-409b-96e1-650c44a40f44?syn-25a6b1a6=1

Title: CVC faces shareholder revolt over €10.7bn Recordati take-private

Snippet: Investors accuse private equity group of pressuring them into selling at ‘lowball’ price

Decision boundary: Take-private phrase versus private-equity/private-credit ambiguity; theme-level gate loss.

- **private-capital-takeover / Private Capital Takeover**: Record private-equity dry powder, paired with deep private-credit financing, is accelerating take-privates and sponsor-led buyouts. Migrating value creation off public exchanges and shrinking the listed-equity universe in targeted sectors.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

- **private-credit-expansion / Non-Bank Lending Ascendancy**: Structural capital-requirement increases under Basel III are accelerating the transfer of lending market share from regulated banks to alternative credit managers. A secular shift that is creating fee-income winners irrespective of the credit cycle.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R11: Blockbuster I.P.O.s Are Creating New Millionaires. Philanthropies Want a Cut.

Source: NYT DealBook; corpus `evaluation125`; record `observation:7c19f9aa793b7aab7f5c`.
Original URL: https://www.nytimes.com/2026/07/25/business/dealbook/spacex-anthropic-philanthropy.html

Title: Blockbuster I.P.O.s Are Creating New Millionaires. Philanthropies Want a Cut.

Snippet: As start-ups like Anthropic and OpenAI prepare to go public, nonprofits are hoping for a secondary giving windfall from the new tech ultrawealthy.

Decision boundary: Private AI company names and charitable IPO proceeds versus power-demand mechanism.

- **ai-energy-demand / Grid Bottleneck Trade**: AI data-centre buildout has created a structural capacity deficit in dispatchable power that cannot be resolved within the typical 3-5 year grid-upgrade cycle, generating sustained pricing power for merchant generators.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R12: Big Tech Debt Flood Is Taking Over Risk In Market: Credit Weekly

Source: Bloomberg Markets; corpus `evaluation125`; record `observation:addecfa32a9a4bdd1714`.
Original URL: https://www.bloomberg.com/news/articles/2026-07-25/big-tech-debt-flood-is-taking-over-risk-in-market-credit-weekly

Title: Big Tech Debt Flood Is Taking Over Risk In Market: Credit Weekly

Snippet: Big Tech’s insatiable appetite for AI investment is unleashing a relentless wave of bond sales — and having a bigger impact on the US corporate bond market than might be obvious.

Decision boundary: Public bond funding for AI versus nonbank direct lending; broad credit collision.

- **ai-compute-arms-race / AI Compute Arms Race**: Frontier-model labs and hyperscalers are committing to multi-gigawatt training clusters faster than accelerator supply can scale, turning raw compute access into the binding competitive constraint and a durable demand floor under the entire AI hardware stack.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

- **direct-lending-expansion / Direct Lending Expansion**: Permanent and insurance-linked capital is flooding into direct lending, extending non-bank credit beyond the middle market into investment-grade and asset-based finance. A fund-formation supercycle that compounds fee-related earnings for the largest credit platforms.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R13: LLCP hits $2bn hard cap for oversubscribed lower-middle market fund

Source: PE Wire; corpus `evaluation125`; record `observation:672b7511005202844a22`.
Original URL: https://www.privateequitywire.co.uk/llcp-hits-2bn-hard-cap-for-oversubscribed-lower-middle-market-fund/

Title: LLCP hits $2bn hard cap for oversubscribed lower-middle market fund

Snippet: Los Angeles-based private equity firm LLCP has closed its fourth lower-middle-market fund – LLCP Lower Middle Market IV– at its $2bn hard cap after attracting commitments well above its original $1.7bn target.

Decision boundary: Two specific dictionary phrases: are they independent evidence of credit rather than equity?

- **private-credit-expansion / Non-Bank Lending Ascendancy**: Structural capital-requirement increases under Basel III are accelerating the transfer of lending market share from regulated banks to alternative credit managers. A secular shift that is creating fee-income winners irrespective of the credit cycle.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R14: Chinese oil prices hit record highs after attacks on Saudi pipeline

Source: FT Companies; corpus `fresh-cycle139`; record `a571ef55089d`.
Original URL: https://www.ft.com/content/3a88d016-9575-4c11-bd34-14606964a867?syn-25a6b1a6=1

Title: Chinese oil prices hit record highs after attacks on Saudi pipeline

Snippet: Beijing has cushioned global impact of Iran war by drawing down stocks but is now ‘coming off its crash diet’

Decision boundary: Geographic context versus policy-easing theme; contrast with supply-shock mechanism.

- **china-stimulus-rotation / PBOC Easing Rotation**: PBOC policy support and Chinese domestic demand recovery are creating a rotation opportunity into EM equities, base metals, and commodity-linked sectors as positioning unwinds from China-underweight consensus.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

- **energy-security / Supply-Side Energy Shock**: Geopolitical supply-chain fragmentation and OPEC+ quota discipline are sustaining energy price volatility above mean-reversion levels, creating a persistent inflation-expectation anchor and sector-rotation catalyst.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R15: AVGO 8-K — Results of Operations and Financial Condition

Source: SEC Filings; corpus `fresh-cycle139`; record `709162e2cefe`.
Original URL: https://www.sec.gov/Archives/edgar/data/1730168/000173016826000076/0001730168-26-000076-index.htm

Title: AVGO 8-K — Results of Operations and Financial Condition

Snippet: SEC 8-K filing by AVGO: Item 2.02 Results of Operations; Item 8.01 Other Material Event

Decision boundary: Explicit resolved ticker control: identity alone versus sufficient theme evidence.

- **semiconductor-capex-cycle / Silicon Sovereignty Capex**: AI-driven chip demand and export-control-induced supply concentration are sustaining an elevated semiconductor equipment investment cycle, with TSMC capacity expansion and domestic-fab subsidies creating multi-year earnings visibility for the equipment-and-materials stack.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## TM1B-R16: EU review of airline ownership rules clouds Apollo’s £5.7bn easyJet bid

Source: FT Deals; corpus `evaluation125`; record `observation:c845c6b635a8c64f72d0`.
Original URL: https://www.ft.com/content/8c3a155b-03c0-4034-9403-839674a3df9e?syn-25a6b1a6=1

Title: EU review of airline ownership rules clouds Apollo’s £5.7bn easyJet bid

Snippet: Shares in UK low-cost carrier slide as Brussels move casts doubt on takeover

Decision boundary: Ontology name match not accepted by the current company resolver; do not silently drop or certify it.

- **private-capital-takeover / Private Capital Takeover**: Record private-equity dry powder, paired with deep private-credit financing, is accelerating take-privates and sponsor-led buyouts. Migrating value creation off public exchanges and shrinking the listed-equity universe in targeted sectors.
  Decision: ___; evidence span: ___; mechanism: ___; reviewer/date: ___; disagreement: ___.

## Stop condition

Complete all 23 judgments and resolve disagreements before choosing an implementation contract. Sixteen packets do not establish production precision or recall. The existing 125 labels remain null; no labels from this packet are promoted automatically. Bare retail did not match any retained contribution; adding a general retail rule would require an additional real positive/negative pair, not synthetic ground truth.
