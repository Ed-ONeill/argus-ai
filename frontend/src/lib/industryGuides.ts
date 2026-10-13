// Editorial background, independent of live signals. No scores, forecasts or company rankings.
export interface IndustryGuide {
  overview: string;
  segments: { name: string; role: string; revenue: string; watch: string }[];
  measures: { term: string; meaning: string; question: string }[];
  distinction: string;
  source: { label: string; url: string };
}
const segment = (name: string, role: string, revenue: string, watch: string) => ({ name, role, revenue, watch });
const measure = (term: string, meaning: string, question: string) => ({ term, meaning, question });
const bls = (id: string, label: string) => ({ label: `BLS: ${label}`, url: `https://www.bls.gov/iag/tgs/iag${id}.htm` });

export const INDUSTRY_GUIDES: Record<string, IndustryGuide> = {
  semiconductors: {
    overview: "Semiconductors turn designs into the chips that process, store and transmit information. Designers, factories and equipment suppliers occupy different parts of the same production system.",
    segments: [
      segment("Design & intellectual property", "Create chip architectures and designs.", "Chip sales or licensing fees and royalties.", "Design wins must become shipped products to produce revenue."),
      segment("Fabrication & memory", "Manufacture chips in specialized factories called fabs.", "Manufacturing services or sales of finished chips.", "Factory utilization and usable output affect the cost per chip."),
      segment("Equipment & packaging", "Supply fabrication tools and assemble and test chips.", "Equipment, materials and service contracts.", "Customer factory spending can move differently from chip demand."),
    ],
    measures: [measure("Yield", "The share of production that meets specifications.", "Is better output reducing unit costs?"), measure("Inventory", "Products held before sale or use.", "Is stock building faster than customer demand?"), measure("Capital expenditure", "Spending on long-lived production assets.", "When will new capacity become productive?")],
    distinction: "More demand for one chip type does not mean every supplier benefits equally. Identify the product and production stage first.",
    source: { label: "SIA: how semiconductors are made", url: "https://www.semiconductors.org/semiconductors-101/how-are-semiconductors-made/" },
  },
  software: {
    overview: "Software sells digital capabilities: running a business, storing and processing information, or protecting systems. Revenue may depend on subscriptions, licenses or actual usage.",
    segments: [
      segment("Business applications", "Support workflows such as sales, finance and design.", "Subscriptions, licenses and implementation services.", "Customer renewals and seat counts reveal demand beyond new bookings."),
      segment("Cloud & data platforms", "Provide computing, storage and tools for applications.", "Usage charges or committed spending contracts.", "A signed commitment may be consumed over several years."),
      segment("Cybersecurity", "Protect identities, devices, applications and networks.", "Subscriptions and security services.", "Product adoption and renewals matter alongside new customer wins."),
    ],
    measures: [measure("ARR", "Annual recurring revenue: an annualized recurring revenue measure; definitions vary.", "What does this company include?"), measure("Net retention", "Existing-customer revenue after expansion, contraction and churn.", "Are existing customers spending more?"), measure("Gross margin", "Revenue left after direct delivery costs, as a percentage of revenue.", "Are hosting costs growing with usage?")],
    distinction: "Bookings, recurring revenue metrics and revenue recognized in financial statements measure different things. They are not interchangeable.",
    source: bls("511", "publishing and software publishers"),
  },
  "aerospace-defense": {
    overview: "This industry builds and supports aircraft, defense systems and related components. Commercial airline demand and government procurement create different business cycles.",
    segments: [
      segment("Aircraft & systems", "Integrate complex equipment into finished platforms.", "Deliveries and contractual milestones.", "An order is not a delivery; delays can postpone cash collection."),
      segment("Components & engines", "Supply specialized parts and propulsion.", "Original equipment sales and replacement parts.", "Production rates and supplier quality affect deliveries."),
      segment("Maintenance & services", "Keep installed equipment operating.", "Repairs, spare parts and long-term support contracts.", "Fleet usage creates service demand; contract terms affect margins."),
    ],
    measures: [measure("Backlog", "Orders not yet recognized as revenue.", "How much is funded and when will it be delivered?"), measure("Book-to-bill", "New orders divided by recognized sales in a period.", "Is order growth turning into delivery growth?"), measure("Free cash flow", "Typically operating cash flow less capital spending; check the definition.", "Are inventory and milestones delaying cash?")],
    distinction: "A larger defense budget does not establish revenue for a particular contractor. Contract awards, funding and execution still matter.",
    source: bls("336", "transportation equipment manufacturing"),
  },
  energy: {
    overview: "Energy businesses find fuels, transport them and turn them into usable products. The same oil-price move can have different consequences at each stage.",
    segments: [
      segment("Upstream", "Explore for and produce oil and natural gas.", "Production volumes multiplied by realized selling prices.", "Drilling costs, depletion and hedges affect the benefit from higher prices."),
      segment("Midstream", "Gather, store and transport fuels.", "Transportation and processing fees, with some commodity exposure.", "Contract terms and throughput matter more than the headline oil price alone."),
      segment("Refining & services", "Refiners make fuels; service firms support drilling and production.", "Product margins or equipment and service fees.", "Refiners track input-output spreads; service firms track customer spending."),
    ],
    measures: [measure("Realized price", "The actual average selling price after relevant adjustments.", "Does it differ from the quoted benchmark?"), measure("Production volume", "The quantity produced in a period.", "Is growth offsetting natural field decline?"), measure("Refining spread", "The difference between product prices and crude input prices.", "Are input costs rising faster than product prices?")],
    distinction: "Oil producers, pipeline operators and refiners are not a single oil-price trade. Start with the company's revenue model.",
    source: { label: "EIA: oil and petroleum products", url: "https://www.eia.gov/energyexplained/oil-and-petroleum-products/" },
  },
  financials: {
    overview: "Financial businesses move capital, process payments and take or manage risk. A bank's balance sheet, an insurer's underwriting and an asset manager's fee business need different measures.",
    segments: [
      segment("Banks & lending", "Take deposits and extend credit.", "Interest spreads and service fees.", "Funding costs and loan losses can offset higher interest income."),
      segment("Insurance", "Pool risk and pay covered claims.", "Premiums and income on invested funds.", "Pricing must cover claims, expenses and uncertainty."),
      segment("Markets, payments & management", "Execute transactions and manage client assets.", "Transaction, advisory and management fees.", "Volume, asset values and fee rates drive different businesses."),
    ],
    measures: [measure("Net interest margin", "Net interest income relative to average earning assets.", "Are deposit costs catching up with loan yields?"), measure("Credit losses", "Losses or provisions associated with borrowers not repaying.", "Are losses increasing as lending grows?"), measure("Assets under management", "Client assets managed by a firm.", "Did growth come from client inflows or market prices?")],
    distinction: "Higher rates do not automatically help every financial company. Funding, credit quality and business mix can change the outcome.",
    source: bls("52", "finance and insurance"),
  },
  industrials: {
    overview: "Industrials supply the equipment and services that let other businesses build, manufacture and move goods. Orders, production and cash collection often occur at different times.",
    segments: [
      segment("Machinery", "Build equipment for factories, construction and agriculture.", "Equipment sales, parts and service.", "Customers may defer purchases when their own demand weakens."),
      segment("Automation & components", "Supply controls, electrical equipment and precision parts.", "Product sales and ongoing maintenance.", "Order growth needs production capacity and reliable suppliers."),
      segment("Freight & logistics", "Move and coordinate the flow of goods.", "Shipment volumes and prices charged per shipment.", "Fuel, labor and network utilization affect profitability."),
    ],
    measures: [measure("Orders", "New customer commitments received during a period.", "Are orders firm or cancellable?"), measure("Backlog", "Work ordered but not yet delivered.", "Is it converting to sales on schedule?"), measure("Operating margin", "Operating profit as a share of revenue.", "Are volume gains covering fixed costs?")],
    distinction: "A full order book can coexist with weak cash flow if inventory, delays or customer payment timing absorb cash.",
    source: bls("333", "machinery manufacturing"),
  },
  consumer: {
    overview: "Consumer businesses sell goods and experiences to households. Essential purchases, discretionary products and leisure can respond differently to household budgets.",
    segments: [
      segment("Retail & distribution", "Buy and sell products through stores or online.", "Product markups, memberships and sometimes marketplace fees.", "Traffic, basket size and markdowns explain more than revenue alone."),
      segment("Brands & manufacturers", "Design, market and produce consumer goods.", "Wholesale and direct-to-consumer sales.", "Brand demand must translate into sell-through, not just shipments."),
      segment("Restaurants & leisure", "Provide meals, travel and experiences.", "Customer spending, franchise royalties and service fees.", "Labor, occupancy and food costs can pressure margins."),
    ],
    measures: [measure("Comparable sales", "Sales growth for a defined set of existing locations or channels.", "How much came from prices versus customer visits?"), measure("Inventory turnover", "How quickly stock is sold relative to average inventory.", "Will unsold products need discounts?"), measure("Gross margin", "The share of revenue remaining after direct product costs.", "Are promotions offsetting sales growth?")],
    distinction: "Higher sales can reflect higher prices without more items sold. Separate price, volume and product mix.",
    source: bls("44-45", "retail trade"),
  },
  healthcare: {
    overview: "Healthcare spans medicines, medical technology, care delivery and payment for care. Patients, providers and insurers often play different roles in who chooses, uses and pays for a product.",
    segments: [
      segment("Medicines & biotechnology", "Discover, develop and sell treatments.", "Product sales, licensing and partnership payments.", "Trial results, approvals and competition affect commercial prospects."),
      segment("Devices & diagnostics", "Provide tools for diagnosis and treatment.", "Equipment, consumables and service contracts.", "Procedure volumes, adoption and reimbursement affect demand."),
      segment("Care & insurance", "Deliver healthcare or finance covered treatment.", "Care payments, premiums and service fees.", "More procedures can help providers while increasing insurers' claims costs."),
    ],
    measures: [measure("Trial endpoint", "The outcome a clinical study is designed to measure.", "Was the result clinically meaningful as well as statistically significant?"), measure("Medical cost ratio", "Medical claims costs as a share of premium revenue.", "Are claims growing faster than premiums?"), measure("Reimbursement", "Payment allowed for a treatment or service.", "Who pays and under what conditions?")],
    distinction: "A promising trial is not the same as regulatory approval, broad reimbursement or profitable sales.",
    source: bls("62", "healthcare delivery and social assistance"),
  },
  "real-estate": {
    overview: "Real estate businesses own, operate, finance or service property. A property owner's rental economics differ from those of a mortgage lender or transaction broker.",
    segments: [
      segment("Property ownership", "Lease space in housing, logistics, offices or other properties.", "Rent and related property services.", "Occupancy, renewals and maintenance spending shape cash generation."),
      segment("Specialized infrastructure", "Operate assets such as data centers or communications sites.", "Lease and service contracts.", "Power, capacity and tenant commitments constrain expansion."),
      segment("Finance & services", "Provide property financing, brokerage or management.", "Interest spreads, transaction fees and management fees.", "Refinancing conditions and transaction activity affect different models."),
    ],
    measures: [measure("Occupancy", "The proportion of available space that is leased or occupied.", "Are rents holding up as leases renew?"), measure("Net operating income", "Property revenue less property-level operating expenses.", "Is growth from existing assets or acquisitions?"), measure("Capitalization rate", "Property operating income relative to property value.", "Are valuation changes coming from income or the required yield?")],
    distinction: "A REIT is a business structure, not a single property type. Tenant demand and debt maturities vary across portfolios.",
    source: { label: "Investor.gov: REITs", url: "https://www.investor.gov/introduction-investing/investing-basics/investment-products/real-estate-investment-trusts-reits" },
  },
  crypto: {
    overview: "Digital assets combine networks, tokens and businesses that provide access or infrastructure. Owning a token is not generally the same as owning equity in a company serving that network.",
    segments: [
      segment("Networks & tokens", "Maintain ledgers and enable transfers or applications.", "Economic designs vary; activity may generate network fees.", "Network usage does not necessarily create cash flows for every token holder."),
      segment("Trading & custody", "Help customers trade or safeguard assets.", "Trading fees, custody charges and other services.", "Volumes, fee rates and counterparty protections matter."),
      segment("Mining & infrastructure", "Provide computing and infrastructure for network operation.", "Network rewards, transaction fees or service revenue.", "Energy costs and competition can offset a higher token price."),
    ],
    measures: [measure("Trading volume", "The value or quantity traded during a period.", "Where was it measured, and is activity recurring?"), measure("Network fees", "Charges paid to use a network.", "Who receives the fees?"), measure("Hash rate", "Computing effort directed at proof-of-work mining.", "How does rising competition affect an individual miner?")],
    distinction: "Token prices, exchange earnings and mining profits are different outcomes. Identify the asset or business before interpreting a headline.",
    source: { label: "Investor.gov: crypto assets", url: "https://www.investor.gov/crypto-assets" },
  },
  utilities: {
    overview: "Utilities provide essential services such as electricity, gas and water. Within electricity, producing power and delivering it through networks are distinct activities.",
    segments: [
      segment("Regulated networks", "Deliver electricity or gas through local infrastructure.", "Customer tariffs under regulatory frameworks.", "Investment recovery and allowed returns depend on regulatory decisions."),
      segment("Power generation", "Produce electricity from different energy sources.", "Wholesale sales or contracted power deliveries.", "Fuel costs, outages and contract prices affect margins."),
      segment("Water & infrastructure", "Treat and distribute water and maintain service assets.", "Customer bills and service arrangements.", "Maintenance needs and financing costs affect investment capacity."),
    ],
    measures: [measure("Rate base", "The asset base used in setting a regulated utility's allowed return.", "Which investments can enter it, and when?"), measure("Load", "Electricity demand over time.", "Can the network serve new demand without costly upgrades?"), measure("Power purchase agreement", "A contract governing power purchases over a period.", "What price, term and delivery obligations are agreed?")],
    distinction: "More electricity demand is not an automatic earnings increase. Capacity, contracts and regulation determine how it reaches a business.",
    source: { label: "EIA: electricity explained", url: "https://www.eia.gov/energyexplained/electricity/" },
  },
  "media-telecom": {
    overview: "Media businesses compete for attention; telecom businesses provide connectivity. Advertising, subscriptions and network services respond to different demand and cost drivers.",
    segments: [
      segment("Advertising platforms", "Connect advertisers with audiences.", "Advertising sold by impression, click or other outcomes.", "Audience engagement and ad pricing can move in different directions."),
      segment("Content & streaming", "Produce, license and distribute entertainment.", "Subscriptions, advertising and content licensing.", "Subscriber growth must cover content and distribution costs."),
      segment("Telecom networks", "Provide mobile, broadband and other connectivity.", "Recurring service charges and equipment sales.", "Competition, retention and network spending affect cash flow."),
    ],
    measures: [measure("ARPU", "Average revenue per user or account; definitions vary.", "Is growth from pricing, customer mix or added services?"), measure("Churn", "The share of customers leaving during a period.", "Are acquisition offers retaining customers after discounts end?"), measure("Capital intensity", "Capital expenditure relative to revenue.", "How much cash is needed to sustain the network?")],
    distinction: "More subscribers or viewers do not necessarily mean more profit. Pricing, engagement and the cost to serve them matter.",
    source: bls("51", "information industries"),
  },
};
