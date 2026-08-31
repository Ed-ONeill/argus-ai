/**
 * lib/evidenceEngine.ts - the Argus Evidence Engine.
 *
 * LEGACY-PATH (IRE-1, ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1): this module is
 * the session-scoped prototype of the engine's R1/R3 stages. Canonical
 * reasoning now assembles on the backend (app/explanations.py), served per
 * event as FeedResponse.explanations. During the IRE migration compare outputs
 * against the backend sections; new reasoning capability lands in the backend
 * engine, not here.
 *
 * The graph stores facts, the inference engine reasons, the narrative engine explains
 * propagation. The Evidence Engine explains WHY Argus should believe a conclusion:
 * it scores the quality, freshness, independence, and cross-source confirmation of the
 * evidence behind a claim, and surfaces what contradicts it. Every score is
 * reproducible from graph relationships and node metadata, never fabricated.
 *
 * Pure library. No React, no UI. Degrades to insufficient_signal. No em/en dashes.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import { PAGE_THEMES } from "./intelligenceGraphAdapters";
import type { IntelNode, IntelEdge, NodeType, SourcePage } from "./intelligenceGraph";
import type { ReasoningStep, SourceType, ThemeInference, CompanyInference, SectorInference, MarketStateInference } from "./inferenceEngine";
import { inferTheme, inferCompany, inferSector } from "./inferenceEngine";
import type { NarrativePath, NarrativeExplanation, PathStep, NodeRef } from "./narrativeTransmission";
import { num, clamp01, round, avg, uniq, list, plural } from "./intelligenceUtils";

/* ------------------------------------------------------------------ *
 * 4 - Source reliability (centralized, editable)
 * ------------------------------------------------------------------ */

/**
 * Named source reliability weights, 0..100. Ordered by specificity: the first
 * pattern that matches a source name wins. Edit weights here to retune trust.
 */
export const SOURCE_RELIABILITY: Array<{ source: string; weight: number; pattern: RegExp }> = [
  { source: "SEC filing",                        weight: 100, pattern: /\bsec\b|edgar|10-?k|10-?q|8-?k|\bs-?1\b/i },
  { source: "Official government release",       weight: 100, pattern: /federal reserve|\bfed\b|fomc|treasury|\bbls\b|\bbea\b|bureau|\.gov\b|central bank/i },
  { source: "Company earnings or filing",        weight: 98,  pattern: /earnings|guidance|investor relations|shareholder|prospectus|annual report/i },
  { source: "Major M&A announcement",            weight: 97,  pattern: /definitive agreement|merger agreement|to acquire|takeover bid/i },
  { source: "Bloomberg",                         weight: 95,  pattern: /bloomberg/i },
  { source: "Reuters",                           weight: 94,  pattern: /reuters/i },
  { source: "Wall Street Journal",               weight: 93,  pattern: /wall street journal|wsj/i },
  { source: "Financial Times",                   weight: 92,  pattern: /financial times|\bft\.com\b|\bft\b/i },
  { source: "Sell-side research",                weight: 90,  pattern: /research|analyst|goldman|morgan stanley|jpmorgan|jp morgan|barclays|\bubs\b|citigroup|\bciti\b/i },
  { source: "Major institutional podcast",       weight: 75,  pattern: /odd lots|goldman|jpmorgan|blackrock|bridgewater/i },
  { source: "Industry podcast or interview",     weight: 68,  pattern: /podcast|interview|\bshow\b/i },
  { source: "Social media",                      weight: 35,  pattern: /twitter|\bx\.com\b|reddit|threads|substack|medium\.com|linkedin|tiktok|youtube/i },
  { source: "Unknown blog or source",            weight: 15,  pattern: /.*/ },
];

/** Structural reliability by node type, used when no explicit outlet name exists. */
const STRUCTURAL_WEIGHT: Partial<Record<NodeType, number>> = {
  EconomicRelease: 100, Deal: 97, Fund: 80, Macro: 70, Theme: 70, Podcast: 68, Story: 60,
};

/** Outlet reliability for a source name, or null when no name is present. */
export function sourceReliability(name: string | null | undefined): number | null {
  if (!name || !name.trim()) return null;
  for (const s of SOURCE_RELIABILITY) if (s.pattern.test(name)) return s.weight;
  return SOURCE_RELIABILITY[SOURCE_RELIABILITY.length - 1].weight;
}

export interface SourceRank { source: string; weight: number; tier: "primary" | "major" | "expert" | "low" }
const tierOf = (w: number): SourceRank["tier"] => (w >= 95 ? "primary" : w >= 85 ? "major" : w >= 60 ? "expert" : "low");

/** Ranked, transparent view of the reliability table. */
export function rankEvidenceSources(): SourceRank[] {
  return SOURCE_RELIABILITY
    .map(s => ({ source: s.source, weight: s.weight, tier: tierOf(s.weight) }))
    .sort((a, b) => b.weight - a.weight);
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const POSITIVE_REL = new Set(["supports", "drives", "raises_demand_for", "supplies", "owns", "mentions", "affects", "correlates"]);
const NEGATIVE_REL = new Set(["weakens", "reduces_supply_of", "competes_with"]);

/**
 * RC2-G5: STRUCTURAL relationships are membership, not evidence.
 *
 * `belongs_to` (Industry -> Sector, RC2-G3) says where a node sits in the
 * taxonomy; it asserts nothing about whether a view is supported. Counting it
 * made a sector's own child industry its single strongest "supporting evidence"
 * at strength 100, inflating verdicts to `strong` on structure alone. On Energy,
 * where the Industry and Sector share a label, it rendered as the sector
 * supporting ITSELF.
 *
 * Excluded once, at the only place edges enter this engine, so it can never
 * reach an evidence item, a source list, a support count, or the verdict.
 * intelligenceProfile already excludes it from drivers/beneficiaries by causal
 * layer; this closes the same hole here.
 */
const STRUCTURAL_REL = new Set(["belongs_to"]);
const isStructural = (e: IntelEdge): boolean => STRUCTURAL_REL.has(e.relationshipType);

/**
 * RC2-E1: DECLARED ONTOLOGY is not evidence.
 *
 * `ingestThemes` writes a curated theme's own ontology into the graph:
 *   related_assets        -> Theme --supports--> Company
 *   related_industries    -> Theme --affects/correlates--> Industry
 *   related_macro_factors -> Macro --drives--> Theme
 *
 * Those edges were then read back as support for the very thesis that declared
 * them, and listed in `sourceBreakdown` as independent sources with reliability
 * scores. Measured on a theme with zero stories: verdict `moderate`, trust 48,
 * three "supporting" items and three "sources" — the claim was its own evidence.
 * Measured on live data it was worse for companies: 38 of 46 had no observed
 * backing at all, yet 44 of 46 carried a forward view.
 *
 * The discriminator is PROVENANCE, not vocabulary. The same verb is legitimate
 * when observed:
 *   t --supports--> nvda           pages ["Theme Intelligence"]  declared  -> inadmissible
 *   nvidia-beats --supports--> t   pages ["Feed"]                observed  -> admissible
 *
 * A verb blacklist would destroy both. An edge is inadmissible only when EVERY
 * page that asserted it is the theme-ontology adapter; one observed page anywhere
 * in `originatingPages` restores it, because that means something was actually
 * seen.
 *
 * The edges are NOT removed from the graph. They remain ontology/exposure
 * structure for neighbours and transmission views — they simply carry no
 * evidentiary authority. Same choke point as the G5 `belongs_to` exclusion.
 */
const isOntologyOnly = (e: IntelEdge): boolean =>
  e.originatingPages.length > 0 && e.originatingPages.every(p => p === PAGE_THEMES);

/**
 * RC2-E3: a MENTION is coverage, not corroboration.
 *
 * `mentions` means "this source discussed/named this entity". It does not mean
 * the entity's thesis is supported. Every production producer uses it that way -
 * Story->Company/Theme (Feed), Event->Company, Podcast->Company/Theme and
 * Person->Theme (Listen), Deal->Company (M&A) - and the codebase says so itself:
 * `ingestEvents` notes the edge "stays `mentions` (contextual) - never
 * conflated", and ExplorerGraph renders it as "Coverage link: reporting names the
 * entity".
 *
 * `maIntel.ts` and `listenIntel.ts` already implement an explicit classification
 * - SUPPORTS / CONTRADICTS / MENTIONS / CONTEXT - documented "never conflated",
 * with listenIntel noting that supporting-type edges are "none are emitted for
 * podcasts today". This engine was the one place that broke that contract, by
 * listing `mentions` in POSITIVE_REL beside `supports` and `drives`.
 *
 * Measured before this change: a single mention of any provenance produced
 * verdict `moderate` with trust ~50 (Listen 49, Feed 51, M&A 51). Worse, it
 * defeated the RC2-E1 forecast guard: E1 refuses when the verdict is
 * `insufficient_signal`, so one mention lifted the verdict and re-enabled a
 * forecast whose entire evidentiary basis was "one article named this company"
 * (measured: strengthening, confidence 51, probability 44).
 *
 * The edge is NOT removed from the graph. It stays traversable and remains
 * available to every coverage consumer - "most discussed", "entered the
 * conversation", heatmaps, discussion counts, entity context. It simply carries
 * no thesis authority: no supporting item, no sourceBreakdown entry, no trust, no
 * verdict lift, and therefore no forecast eligibility.
 *
 * Deliberately NOT implemented: any "many mentions = weak corroboration" rule.
 * There is no calibrated authority for converting mention volume into thesis
 * support. If attention/momentum from mention volume is wanted later, it belongs
 * in its own measured feature with its own semantics, not in evidence trust.
 *
 * `POSITIVE_REL` is left untouched - it is a polarity vocabulary, not an
 * admissibility list - so stronger observed relations (`supports`, `drives`,
 * `weakens`, and observed Event/Deal/Story supporting edges) are unaffected.
 */
const MENTION_REL = new Set(["mentions"]);
const isMention = (e: IntelEdge): boolean => MENTION_REL.has(e.relationshipType);

/**
 * RC2-L1: M&A INVOLVEMENT is not thesis corroboration.
 *
 * `acquires` is the remaining half of the same contract breach E3 fixed.
 * `maIntel.ts` - the M&A surface's own classifier - files this exact edge under
 * MENTIONS, not SUPPORTS:
 *
 *     MENTIONS - a recorded "mentions"/"acquires" edge, or resolved-entity
 *                metadata overlap
 *
 * and its code implements that (maIntel.ts:159-161): NEG_REL_RE -> CONTRADICTS,
 * SUP_REL_RE -> SUPPORTS, everything else -> MENTIONS. `acquires` matches neither
 * regex, so the M&A surface treats it as involvement. This engine disagreed - not
 * by classification, but by ACCIDENT: `acquires` is in neither POSITIVE_REL nor
 * NEGATIVE_REL, and `toEvidenceItem` assigns polarity through
 * `NEGATIVE_REL.has(...) ? -1 : 1`, so it fell through to +1.
 *
 * Measured before this change: MSFT --acquires--> WDAY gave BOTH endpoints
 * verdict `moderate`, trust 46, one supporting item [acquires/+]. The sponsor
 * case (KKR --acquires--> WDAY) gave the target trust 51. The evidence item
 * carried `sourceName: null`, so a deal party was also counted as an independent
 * source via the `type:M&A` fallback.
 *
 * The edge is broader than "an acquisition" in three ways, none of which the
 * engine could see:
 *   - roles are POSITIONAL (`companies[0]` acquires `companies[1]`, the order of
 *     `affected_entities`), so which party is the acquirer is unverified;
 *   - `dealType` is never consulted at the link site, so `rumored` and
 *     `withdrawn` deals write the identical edge with identical authority;
 *   - `strength`/`confidence` carry `signalScore`, which is the feed item's
 *     newsworthiness, not any property of the deal.
 *
 * So the edge records that two parties co-occur in an M&A story. That is
 * involvement. Whether it supports or weakens either party's thesis would need a
 * deal-quality authority that does not exist, and inventing one is out of scope.
 *
 * As with E3, the edge is NOT removed. It stays in the graph, stays traversable,
 * and remains available to the M&A relationship map, the transmission graph and
 * `intelligenceGraphDebug`'s M&A reporting. It simply carries no thesis
 * authority.
 *
 * RC2-L2 settles the follow-up this block recorded: `names` joins the set below,
 * and `evidenced_by` gets its own provenance exclusion. `depends_on` is
 * deliberately still NOT ruled - see the note on PROVENANCE_REL.
 *
 * The binary `polarity` type, `POSITIVE_REL`, `NEGATIVE_REL` and the relationship
 * vocabulary are all unchanged - this is an admissibility rule, not a polarity or
 * vocabulary change.
 */
/**
 * RC2-L2: `names` is attribution, and attribution is involvement.
 *
 * `Event --names--> Company` is written from `companies_direct`, which
 * `types.ts` documents as "Named by the event itself (registry resolver) -
 * strict subset of `companies`... Attribution (what happened to X vs what may
 * affect X) keys on this field", and the adapter states the same law: "companies
 * NAMED by the event link `names` (attributed); theme-transmitted exposure stays
 * `mentions` (contextual) - never conflated".
 *
 * That is a NAMING distinction, not a directional one. A guidance cut and a
 * guidance raise both produce `names`. `MarketEvent` carries no directional field
 * at all - `event_type` is a taxonomy of kind, `corroboration_count` and
 * `source_count` establish that the event OCCURRED, `confidence` is the linked
 * theme's own conviction (circular under RC2-E1), `editorial_score` is
 * newsworthiness, and `why_it_matters` is marked LEGACY LLM-derived with "Do not
 * build new consumers on it". So there is no honest basis for a direction.
 *
 * Same class as `acquires`: recorded involvement, zero thesis authority.
 */
/**
 * RC2-N1: `affects` is a structural/involvement relation, not a thesis claim.
 *
 * Two producers write it, and neither asserts a direction:
 *
 *   Theme --affects--> Industry   (adapters.ts:260, page "Theme Intelligence")
 *       declared ontology exposure: "this theme concerns this industry". Already
 *       inadmissible via RC2-E1 (ontology-only provenance). Still read by
 *       `sectorTaxonomy.ts` to project which themes reach a sector through its
 *       industries — a structural use that must keep working.
 *
 *   Deal --affects--> Sector      (adapters.ts:539 and :549, page "M&A")
 *       "this deal concerns this sector". The sector comes from `inferSector`,
 *       a regex sweep over the headline (/software|saas|cloud|cyber|ai|chip|.../
 *       -> "Technology"), defaulting to "Other". `dealType` is never consulted,
 *       so announced, rumored, withdrawn, completed, strategic and sponsor deals
 *       all write the identical edge. Direction must not be inferred from any of
 *       them, nor from the verb's name.
 *
 * The M&A form was OBSERVED provenance, so E1 did not touch it, and `affects`
 * sits in POSITIVE_REL - so it was admitted at +1. Measured before this change,
 * a single deal:
 *
 *   Sector "Technology"  items=1  verdict=moderate  trust=51  rels=[affects]
 *   sourceBreakdown      [{ source: "Deal", type: "Deal", count: 1, reliability: 97 }]
 *
 * The reliability 97 is `STRUCTURAL_WEIGHT["Deal"]`, not a source rating, so a
 * headline regex match presented as a near-maximum-reliability source.
 *
 * UNLIKE the other exclusions, this one reached FORECASTS. RC2-E2 established
 * that sector forwards were unavailable because sector confidence was
 * structurally 0; E2 blocks only `confidence === 0`. Measured:
 *
 *   without the deal   trust 0   -> confidence 0  -> E2 blocks  -> forward null
 *   with the deal      trust 51  -> confidence 51 -> E2 passes  -> forward PRESENT
 *                      { direction: "rotating in", confidence: 51,
 *                        reasons: [..., "Cross-source evidence"] }
 *
 * One Deal node is not cross-source. Excluding `affects` restores E2's intended
 * state rather than adding a new rule.
 *
 * Same class as `acquires` and `names`: recorded involvement, zero thesis
 * authority. The edges are NOT removed - they stay in the graph and traversable,
 * so `sectorTaxonomy`'s projection and every other structural consumer are
 * unaffected. `POSITIVE_REL` is deliberately left alone: it is a polarity
 * vocabulary, not an admissibility list, exactly as RC2-E3 recorded for
 * `mentions`.
 */
const INVOLVEMENT_REL = new Set(["acquires", "names", "affects"]);
const isInvolvement = (e: IntelEdge): boolean => INVOLVEMENT_REL.has(e.relationshipType);

/**
 * RC2-L2: PROVENANCE is where a record came from, never corroboration of it.
 *
 * `Event --evidenced_by--> Story` links an Event to the Story node aliasing the
 * SAME cluster id (`ev.id`) - the story the event was built from. Admitting it
 * closes a loop:
 *
 *     Story --(builds)--> Event --evidenced_by--> Story
 *
 * The Story would gain trust from an Event that is a restatement of itself. That
 * is the RC2-E1 self-evidence pattern with one extra hop. It is worse than E1's
 * case in one respect: the Story item carries `sourceName` "Reuters" while the
 * Event node has no `metadata.source`, so its item falls back to `type:Feed` -
 * and `independentSources` would count one observation as TWO distinct sources.
 *
 * NOT RULED HERE: `depends_on`. It shares the silent-positive fall-through and
 * has no producer, so excluding it would be inert - but the diagnosis did not
 * establish it as contextual. It sits directly beside `supplies` in the
 * vocabulary as that verb's converse, and `supplies` IS classified thesis-bearing
 * in POSITIVE_REL. Ruling it inadmissible without that analysis would encode an
 * inconsistency. It stays an open ledger item.
 *
 * ALSO NOT RULED HERE, and live rather than inert: `transacted`,
 * `has_market_metric` and `has_financial_metric`, written by
 * `dataAdapters/observationGraphBridge` on every provision. They are unclassified
 * and therefore also fall through to +1, and unlike the Event verbs NOTHING
 * blocks them. Measured: a company carrying only a price observation, a financial
 * metric and an insider filing reads verdict `moderate`, trust 52, three
 * supporting items, with the metric attachment counted as an independent source.
 * Excluding them would CHANGE LIVE OUTPUT, so it cannot ride this
 * zero-output hardening slice. Recorded as its own ledger item.
 */
const PROVENANCE_REL = new Set(["evidenced_by"]);
const isProvenance = (e: IntelEdge): boolean => PROVENANCE_REL.has(e.relationshipType);

/**
 * RC2-L3: a data ATTACHMENT is not a thesis claim.
 *
 * `dataAdapters/observationGraphBridge` links provider observations onto the
 * entity they describe:
 *
 *   Company --has_market_metric-->    MarketMetric      (price / volume / liquidity / ohlcv)
 *   Company --has_financial_metric--> FinancialMetric   (revenue, margin, ...)
 *   Person  --transacted-->           Company           (an insider filing exists)
 *
 * All three say "this datum belongs to this entity". None asserts a direction.
 * The bridge is explicit about this - `handleMarket` is documented "Purely
 * descriptive: no bullish or bearish inference from a price move", and the module
 * header states "When direction is ambiguous it uses mentions or correlates
 * rather than inventing a claim". The bridge's representation is already MORE
 * precise than this engine's; the engine was the side losing information, by
 * assigning +1 through the `NEGATIVE_REL.has(...) ? -1 : 1` fall-through.
 *
 * Measured before this change - opposite states were indistinguishable:
 *
 *   price   +7.1%  -> moderate, trust 46, +[has_market_metric]
 *   price   -8.2%  -> moderate, trust 46, +[has_market_metric]      IDENTICAL
 *   revenue +200   -> moderate, trust 54, +[has_financial_metric]
 *   revenue -200   -> moderate, trust 54, +[has_financial_metric]   IDENTICAL
 *
 * THIS IS AN UNMASKING FIX, not only an exclusion. `handleInsider` already
 * derives direction from deterministic SEC Form 4 fields (`acquiredDisposedCode`,
 * `transactionCode`) with no LLM anywhere, and already encodes it with CLASSIFIED
 * verbs beside the bare fact:
 *
 *   link(pid, "transacted", cid, o);                                  // the fact
 *   buy     -> link(pid, "owns", cid) + link(pid, "supports", cid)    // +1
 *   sell    -> link(pid, "weakens", cid)                              // -1
 *   unknown -> link(pid, "mentions", cid)                             // E3-excluded
 *
 * But `transacted` is written FIRST, and `admissibleNeighbors` keeps the first
 * ADMISSIBLE edge per neighbour - so it masked the directional edge entirely.
 * Measured: buy, sell and unknown all produced verdict `moderate`, trust 54, one
 * `+[transacted]` item, with `contradictingEvidence` EMPTY on the sell. An insider
 * SALE read as positive thesis support. Excluding `transacted` restores the
 * distinction the adapter already encodes: buy keeps `supports`, sell keeps
 * `weakens`, unknown keeps only an E3-excluded `mentions`.
 *
 * Attachment multiplicity was also inflating scoring: six observations from ONE
 * provider produced six items and `evidenceCount` 6 (trust 46 -> 49). It did not
 * inflate `independentSources` - all six share a `sourceName`, so they collapse to
 * a single `sourceBreakdown` entry - but the item count fed the score regardless.
 *
 * The edges are NOT removed. They stay in the graph and traversable for
 * contextual and diagnostic consumers; `node.metadata.latestMarketData` and the
 * OHLCV series are untouched.
 *
 * Production effect today is ZERO: the producers are unreachable.
 * `ingestProviderObservations` has no caller in the app, `ingestionScheduler` is
 * mounted nowhere, and `isProviderIngestionEnabled` reads a non-NEXT_PUBLIC_ env
 * var that a browser cannot see while this graph runs client-side. The correction
 * is pinned through the real bridge in `attachmentNotEvidence.test.ts`.
 *
 * NOT ruled here: `depends_on`, still the only remaining unclassified verb and
 * still inert (no producer). It is the converse of `supplies`, which IS classified
 * thesis-bearing, so it keeps its own ledger item.
 */
const ATTACHMENT_REL = new Set(["transacted", "has_market_metric", "has_financial_metric"]);
const isAttachment = (e: IntelEdge): boolean => ATTACHMENT_REL.has(e.relationshipType);

/**
 * Per-neighbour selection of an ADMISSIBLE edge.
 *
 * `G.getNeighbors` returns one entry per neighbour node, keeping the FIRST edge
 * it encounters. `ingestStories` writes `mentions` before `supports` for the same
 * Story->Theme pair, so the mention masks the support. Filtering the output of
 * `getNeighbors` would therefore discard that neighbour entirely and take its
 * genuine `supports` edge with it - silently destroying real evidence while
 * appearing to remove only mentions.
 *
 * Measured on the live payload: 49 `supports[Feed]` edges exist, every one of
 * them paired with a `mentions[Feed]` edge on the same pair. Naive filtering
 * dropped all 49.
 *
 * So the walk is done over the full relationship list, keeping the first
 * ADMISSIBLE edge per neighbour. A neighbour connected only by a mention
 * contributes nothing; a neighbour connected by both contributes its support.
 */
function admissibleNeighbors(nodeId: string): Neigh[] {
  const self = G.getNode(nodeId);
  if (!self) return [];
  const out: Neigh[] = [];
  const seen = new Set<string>();
  for (const edge of G.getRelationships(self.id)) {
    if (!admissibleAsEvidence(edge)) continue;
    const otherId = edge.source === self.id ? edge.target : edge.source;
    if (seen.has(otherId)) continue;
    const node = G.getNode(otherId);
    if (!node || node.type === "Event") continue;   // matches getNeighbors' default
    seen.add(otherId);
    out.push({ node, edge });
  }
  return out;
}

/** The single admissibility test for anything entering this engine as evidence. */
const admissibleAsEvidence = (e: IntelEdge): boolean =>
  !isStructural(e) && !isOntologyOnly(e) && !isMention(e) && !isInvolvement(e)
  && !isProvenance(e) && !isAttachment(e);
const recencyDaysOf = (node: IntelNode): number => Math.max(0, (Date.now() - num(node.lastSeen)) / 86_400_000);

interface Neigh { node: IntelNode; edge: IntelEdge }

/** Reliability for one evidence node: max of its named outlet and its structural weight. */
function reliabilityFor(other: IntelNode): number {
  const name = str(other.metadata?.source) || str(other.metadata?.publisher);
  const byName = sourceReliability(name);
  const structural = STRUCTURAL_WEIGHT[other.type] ?? 40;
  return Math.max(byName ?? 0, structural);
}

export interface EvidenceItem {
  from:          string;
  type:          NodeType;
  relationship:  string;
  pages:         SourcePage[];
  sourceName:    string | null;
  reliability:   number;
  strength:      number;
  confidence:    number;
  evidenceCount: number;
  recencyDays:   number;
  polarity:      1 | -1;
}

function toEvidenceItem(n: Neigh): EvidenceItem {
  const name = str(n.node.metadata?.source) || str(n.node.metadata?.publisher) || null;
  return {
    from: n.node.label, type: n.node.type, relationship: n.edge.relationshipType,
    pages: n.edge.originatingPages, sourceName: name, reliability: reliabilityFor(n.node),
    strength: num(n.edge.strength), confidence: num(n.edge.confidence), evidenceCount: num(n.edge.evidenceCount),
    recencyDays: round(recencyDaysOf(n.node)),
    polarity: NEGATIVE_REL.has(n.edge.relationshipType) ? -1 : 1,
  };
}

/* ------------------------------------------------------------------ *
 * 5 - Contradiction detection
 * ------------------------------------------------------------------ */

export interface Contradiction { kind: string; detail: string; severity: number }

function contradictionsForNode(node: IntelNode): Contradiction[] {
  const findings: Contradiction[] = [];
  // RC2-G5: structural membership edges are excluded here too, so they cannot
  // move confidence or diversity findings either.
  const neigh = admissibleNeighbors(node.id);
  const edges = G.getRelationships(node.id).filter(e => admissibleAsEvidence(e));

  // Weakening / competing relationships (graph evidence only).
  for (const x of neigh) {
    if (!NEGATIVE_REL.has(x.edge.relationshipType)) continue;
    const src = G.getNode(x.edge.source)?.label ?? x.edge.source;
    const tgt = G.getNode(x.edge.target)?.label ?? x.edge.target;
    findings.push({ kind: "weakening_relationship", detail: `${src} ${x.edge.relationshipType.replace(/_/g, " ")} ${tgt}`, severity: 55 });
  }

  // Negative momentum on the node itself, or on connected themes.
  if (num(node.momentum) < 0) {
    findings.push({ kind: "negative_momentum", detail: `${node.label} momentum is ${round(num(node.momentum))}`, severity: 65 });
  } else {
    const negThemes = neigh.filter(x => x.node.type === "Theme" && num(x.node.momentum) < 0).map(x => x.node.label);
    if (negThemes.length) findings.push({ kind: "negative_momentum", detail: `Connected theme(s) weakening: ${list(negThemes)}`, severity: 50 });
  }

  // Low-confidence relationships.
  const avgConf = avg(edges.map(e => num(e.confidence)));
  if (edges.length && avgConf < 40) findings.push({ kind: "low_confidence", detail: `Average relationship confidence is ${round(avgConf)}`, severity: 40 });

  // Low source diversity.
  const pages = uniq(edges.flatMap(e => e.originatingPages));
  if (edges.length && pages.length < 2) findings.push({ kind: "low_diversity", detail: `Only ${plural(pages.length, "source type")} confirms this`, severity: 35 });

  // Stale evidence.
  const recency = recencyDaysOf(node);
  if (recency > 30) findings.push({ kind: "stale_evidence", detail: `Latest evidence is ${round(recency)} days old`, severity: 30 });

  // Conflicting exposure (a company pulled by both positive and negative themes).
  if (node.type === "Company") {
    const pos = neigh.filter(x => x.node.type === "Theme" && POSITIVE_REL.has(x.edge.relationshipType)).length;
    const neg = neigh.filter(x => x.node.type === "Theme" && NEGATIVE_REL.has(x.edge.relationshipType)).length;
    if (pos && neg) findings.push({ kind: "conflicting_exposure", detail: `${node.label} has positive (${pos}) and negative (${neg}) theme exposure`, severity: 50 });
  }

  return findings;
}

export function detectContradictions(nodeIdOrLabel: string): Contradiction[] {
  const node = G.getNode(nodeIdOrLabel);
  return node ? contradictionsForNode(node) : [];
}

/* ------------------------------------------------------------------ *
 * 7 - scoreEvidence (reusable, explainable)
 * ------------------------------------------------------------------ */

export interface ScoreEvidenceInput {
  sourceReliability?:     number;   // 0..100 average outlet reliability
  independentSources?:    number;   // distinct independent origins
  relationshipStrength?:  number;   // 0..100 average
  relationshipConfidence?: number;  // 0..100 average
  evidenceCount?:         number;   // total observations
  originatingPages?:      number;   // distinct source types
  recencyDays?:           number;   // days since latest evidence
  contradictionSeverity?: number;   // sum of contradiction severities
  persistence?:           number;   // 0..100
  conviction?:            number;   // 0..100
}

export interface EvidenceComponents {
  evidenceQuality:      number;
  freshness:            number;
  independence:         number;
  confirmation:         number;
  contradictionPenalty: number;
}
export interface EvidenceScore { totalScore: number; components: EvidenceComponents }

const QUALITY_W = { reliability: 0.40, confidence: 0.25, strength: 0.20, conviction: 0.15 };
const TOTAL_W = { quality: 0.35, confirmation: 0.25, independence: 0.20, freshness: 0.20 };

export function scoreEvidence(input: ScoreEvidenceInput): EvidenceScore {
  const reliability = clamp01(num(input.sourceReliability) / 100);
  const confidence  = clamp01(num(input.relationshipConfidence) / 100);
  const strength    = clamp01(num(input.relationshipStrength) / 100);
  const conviction  = clamp01(num(input.conviction) / 100);
  const quality = reliability * QUALITY_W.reliability + confidence * QUALITY_W.confidence + strength * QUALITY_W.strength + conviction * QUALITY_W.conviction;

  const freshness    = input.recencyDays == null ? 1 : clamp01(1 - num(input.recencyDays) / 30);
  const independence = clamp01(num(input.independentSources) / 4);                                  // 4+ origins is full
  const evidenceSat  = clamp01(Math.log2(1 + num(input.evidenceCount)) / Math.log2(1 + 16));        // ~16 obs saturates
  const confirmation = clamp01((num(input.originatingPages) / 4) * 0.5 + evidenceSat * 0.3 + clamp01(num(input.persistence) / 100) * 0.2);
  const penalty      = clamp01(num(input.contradictionSeverity) / 200);                             // two strong contradictions saturate

  const positive = quality * TOTAL_W.quality + confirmation * TOTAL_W.confirmation + independence * TOTAL_W.independence + freshness * TOTAL_W.freshness;
  const total = clamp01(positive * (1 - 0.5 * penalty)); // contradictions cut up to 50 percent

  return {
    totalScore: round(total * 100),
    components: {
      evidenceQuality: round(quality * 100), freshness: round(freshness * 100), independence: round(independence * 100),
      confirmation: round(confirmation * 100), contradictionPenalty: round(penalty * 100),
    },
  };
}

/* ------------------------------------------------------------------ *
 * 1 - evaluateEvidenceForNode
 * ------------------------------------------------------------------ */

export type EvidenceVerdict = "strong" | "moderate" | "weak" | "insufficient_signal";

export interface SourceBreakdownEntry { source: string; type: NodeType; count: number; reliability: number }

export interface NodeEvidence {
  found:                boolean;
  node:                 IntelNode | null;
  evidenceScore:        number;
  evidenceQuality:      number;
  freshnessScore:       number;
  independenceScore:    number;
  confirmationScore:    number;
  contradictionScore:   number;
  overallTrust:         number;
  supportingEvidence:   EvidenceItem[];
  contradictingEvidence: EvidenceItem[];
  contradictions:       Contradiction[];
  sourceBreakdown:      SourceBreakdownEntry[];
  reasoningSteps:       ReasoningStep[];
  verdict:              EvidenceVerdict;
}

function emptyNodeEvidence(node: IntelNode | null): NodeEvidence {
  return {
    found: !!node, node, evidenceScore: 0, evidenceQuality: 0, freshnessScore: 0, independenceScore: 0,
    confirmationScore: 0, contradictionScore: 0, overallTrust: 0, supportingEvidence: [], contradictingEvidence: [],
    contradictions: [], sourceBreakdown: [],
    reasoningSteps: [{ claim: node ? `Insufficient evidence for ${node.label}` : "No node resolved", evidence: node ? "The node has no supporting relationships in the graph." : "The entity is not present in the graph.", confidence: 0, sourceType: "graph" }],
    verdict: "insufficient_signal",
  };
}

const verdictOf = (score: number, hasEvidence: boolean): EvidenceVerdict =>
  !hasEvidence ? "insufficient_signal" : score >= 70 ? "strong" : score >= 45 ? "moderate" : "weak";

export function evaluateEvidenceForNode(nodeIdOrLabel: string): NodeEvidence {
  const node = G.getNode(nodeIdOrLabel);
  if (!node) return emptyNodeEvidence(null);

  const items = admissibleNeighbors(node.id).map(toEvidenceItem);
  if (items.length === 0) return emptyNodeEvidence(node);

  const supporting = items.filter(i => i.polarity === 1);
  const contradicting = items.filter(i => i.polarity === -1);
  const findings = contradictionsForNode(node);
  const contradictionSeverity = findings.reduce((s, f) => s + f.severity, 0);

  const pages = uniq(supporting.flatMap(i => i.pages));
  const independentSources = uniq(supporting.map(i => i.sourceName ?? `type:${i.pages[0] ?? i.type}`)).length;
  const relStrength = avg(supporting.map(i => i.strength));
  const relConfidence = avg(supporting.map(i => i.confidence));
  const reliability = avg(supporting.map(i => i.reliability));
  const evidenceCount = supporting.reduce((s, i) => s + i.evidenceCount, 0);
  const recencyDays = supporting.length ? avg(supporting.map(i => i.recencyDays)) : recencyDaysOf(node);

  const { totalScore, components } = scoreEvidence({
    sourceReliability: reliability, independentSources, relationshipStrength: relStrength,
    relationshipConfidence: relConfidence, evidenceCount, originatingPages: pages.length,
    recencyDays, contradictionSeverity, persistence: node.persistence, conviction: node.conviction,
  });

  // Source breakdown, grouped by outlet or structural type.
  const groups = new Map<string, SourceBreakdownEntry>();
  for (const i of supporting) {
    const key = i.sourceName ?? i.type;
    const g = groups.get(key) ?? { source: key, type: i.type, count: 0, reliability: i.reliability };
    g.count += 1; g.reliability = Math.max(g.reliability, i.reliability);
    groups.set(key, g);
  }
  const sourceBreakdown = [...groups.values()].sort((a, b) => b.reliability - a.reliability || b.count - a.count);

  const verdict = verdictOf(totalScore, supporting.length > 0);
  const topSource = sourceBreakdown[0];

  const reasoningSteps: ReasoningStep[] = [
    { claim: `Evidence for ${node.label} is ${verdict}`, evidence: `${plural(supporting.length, "supporting link")} across ${plural(pages.length, "source type")}.`, confidence: totalScore, sourceType: pages.length >= 2 ? "cross_market" : "graph" },
  ];
  if (topSource) reasoningSteps.push({ claim: `Highest-reliability source: ${topSource.source}`, evidence: `Reliability ${topSource.reliability} of 100.`, confidence: topSource.reliability, sourceType: "graph" });
  if (pages.length) reasoningSteps.push({ claim: `Confirmed by ${plural(pages.length, "source type")}`, evidence: list(pages as string[]), confidence: components.confirmation, sourceType: "cross_market" });
  reasoningSteps.push({ claim: "Freshness", evidence: `Latest supporting evidence is about ${round(recencyDays)} days old.`, confidence: components.freshness, sourceType: "graph" });
  if (findings.length) reasoningSteps.push({ claim: `${plural(findings.length, "contradiction")} detected`, evidence: list(uniq(findings.map(f => f.kind.replace(/_/g, " ")))), confidence: components.contradictionPenalty, sourceType: "graph" });

  return {
    found: true, node,
    evidenceScore: totalScore, evidenceQuality: components.evidenceQuality, freshnessScore: components.freshness,
    independenceScore: components.independence, confirmationScore: components.confirmation,
    contradictionScore: components.contradictionPenalty, overallTrust: totalScore,
    supportingEvidence: supporting, contradictingEvidence: contradicting, contradictions: findings,
    sourceBreakdown, reasoningSteps, verdict,
  };
}

/* ------------------------------------------------------------------ *
 * 2 - evaluateEvidenceForInference
 * ------------------------------------------------------------------ */

type AnyInference = ThemeInference | CompanyInference | SectorInference | MarketStateInference;
const isTheme  = (i: AnyInference): i is ThemeInference  => "beneficiaryCompanies" in i;
const isCompany = (i: AnyInference): i is CompanyInference => "activeThemes" in i;
const isSector = (i: AnyInference): i is SectorInference => "strengtheningThemes" in i;
const isMarket = (i: AnyInference): i is MarketStateInference => "oneLineRead" in i;

export interface InferenceEvidence {
  originalInference:     AnyInference;
  trustScore:            number;
  evidenceQuality:       number;
  crossSourceConfirmation: number;
  sourceIndependence:    number;
  freshness:             number;
  contradictions:        Contradiction[];
  adjustedConfidence:    number;
  whyTrustThis:          string[];
  whyBeCareful:          string[];
  evidenceSummary:       string;
}

function fromNodeEvidence(inference: AnyInference, ev: NodeEvidence, originalConfidence: number): InferenceEvidence {
  const adjustedConfidence = round(originalConfidence * (1 - ev.contradictionScore / 200));
  const whyTrustThis: string[] = [];
  if (ev.confirmationScore >= 40) whyTrustThis.push(`Confirmed across ${plural(uniq(ev.supportingEvidence.flatMap(i => i.pages)).length, "source type")}.`);
  if (ev.sourceBreakdown[0]) whyTrustThis.push(`Top source ${ev.sourceBreakdown[0].source} (reliability ${ev.sourceBreakdown[0].reliability}).`);
  if (ev.independenceScore >= 50) whyTrustThis.push(`${plural(uniq(ev.supportingEvidence.map(i => i.sourceName ?? i.type)).length, "independent source")}.`);
  const whyBeCareful: string[] = ev.contradictions.slice(0, 3).map(c => c.detail);
  if (ev.freshnessScore < 50) whyBeCareful.push("Evidence is aging.");
  if (ev.independenceScore < 40) whyBeCareful.push("Few independent sources.");

  return {
    originalInference: inference, trustScore: ev.overallTrust,
    evidenceQuality: ev.evidenceQuality, crossSourceConfirmation: ev.confirmationScore,
    sourceIndependence: ev.independenceScore, freshness: ev.freshnessScore,
    contradictions: ev.contradictions, adjustedConfidence,
    whyTrustThis, whyBeCareful,
    evidenceSummary: `${ev.verdict} evidence: trust ${ev.overallTrust}, confirmation ${ev.confirmationScore}, ${plural(ev.contradictions.length, "contradiction")}.`,
  };
}

export function evaluateEvidenceForInference(inference: AnyInference): InferenceEvidence {
  if (isMarket(inference)) {
    const briefs = uniq([...inference.strongestThemes, ...inference.mostConfirmedThemes].map(b => b.label));
    const evs = briefs.map(label => evaluateEvidenceForNode(label)).filter(e => e.found);
    const contradictions = evs.flatMap(e => e.contradictions).slice(0, 6);
    const trustScore = round(avg(evs.map(e => e.overallTrust)));
    const originalConfidence = round(avg(inference.strongestThemes.map(b => b.score)));
    return {
      originalInference: inference, trustScore,
      evidenceQuality: round(avg(evs.map(e => e.evidenceQuality))),
      crossSourceConfirmation: round(avg(evs.map(e => e.confirmationScore))),
      sourceIndependence: round(avg(evs.map(e => e.independenceScore))),
      freshness: round(avg(evs.map(e => e.freshnessScore))),
      contradictions,
      adjustedConfidence: round(originalConfidence * (1 - round(avg(evs.map(e => e.contradictionScore))) / 200)),
      whyTrustThis: [`${evs.length} themes evaluated`, `Strongest: ${inference.strongestThemes.map(b => b.label).slice(0, 3).join(", ")}`],
      whyBeCareful: contradictions.slice(0, 3).map(c => c.detail),
      evidenceSummary: `Market evidence: average trust ${trustScore} across ${plural(evs.length, "theme")}.`,
    };
  }

  const label = isTheme(inference) ? inference.theme?.id ?? inference.theme?.label
    : isCompany(inference) ? inference.company?.id ?? inference.company?.label
    : isSector(inference) ? inference.sector?.id ?? inference.sector?.label
    : undefined;
  const originalConfidence = (inference as ThemeInference | CompanyInference | SectorInference).confidence ?? 0;

  const ev = label ? evaluateEvidenceForNode(label) : emptyNodeEvidence(null);
  return fromNodeEvidence(inference, ev, originalConfidence);
}

/* ------------------------------------------------------------------ *
 * 3 - evaluateEvidenceForNarrative
 * ------------------------------------------------------------------ */

export interface NarrativeEvidence {
  originalNarrative: NarrativePath | NarrativeExplanation;
  pathEvidenceScore: number;
  weakestLink:       { node: NodeRef; trust: number } | null;
  strongestLink:     { node: NodeRef; trust: number } | null;
  sourceDiversity:   number;
  contradictionRisk: number;
  trustScore:        number;
  explanation:       string;
}

export function evaluateEvidenceForNarrative(narrative: NarrativePath | NarrativeExplanation): NarrativeEvidence {
  const steps: PathStep[] = "path" in narrative ? narrative.path : narrative.transmissionPath;
  const themeRef = narrative.theme;

  if (!steps.length || !themeRef) {
    return {
      originalNarrative: narrative, pathEvidenceScore: 0, weakestLink: null, strongestLink: null,
      sourceDiversity: 0, contradictionRisk: 0, trustScore: 0,
      explanation: "Insufficient signal to grade this narrative path.",
    };
  }

  const scored = steps.map(s => {
    const nodeEv = evaluateEvidenceForNode(s.node.id);
    const trust = round(num(s.confidence) * 0.4 + nodeEv.overallTrust * 0.6);
    return { node: s.node, trust };
  });
  const pathEvidenceScore = round(avg(scored.map(s => s.trust)));
  const weakestLink = scored.reduce((a, b) => (b.trust < a.trust ? b : a), scored[0]);
  const strongestLink = scored.reduce((a, b) => (b.trust > a.trust ? b : a), scored[0]);
  const sourceDiversity = uniq(steps.flatMap(s => s.supportingSources)).length;

  const themeEv = evaluateEvidenceForNode(themeRef.id);
  const contradictionRisk = themeEv.contradictionScore;
  const trustScore = round(clamp01((pathEvidenceScore / 100) * (1 - 0.5 * contradictionRisk / 100)) * 100);

  return {
    originalNarrative: narrative, pathEvidenceScore, weakestLink, strongestLink, sourceDiversity,
    contradictionRisk, trustScore,
    explanation: `Path trust ${trustScore} over ${plural(steps.length, "step")}, ${plural(sourceDiversity, "distinct source type")}. Weakest link: ${weakestLink.node.label} (${weakestLink.trust}). ${contradictionRisk > 0 ? `Contradiction risk ${contradictionRisk}.` : "No contradictions detected."}`,
  };
}

/* ------------------------------------------------------------------ *
 * 6 - explainTrust
 * ------------------------------------------------------------------ */

export interface TrustExplanation {
  found:           boolean;
  node:            IntelNode | null;
  believes:        string;
  whyBelieves:     string[];
  confirmedBy:     string[];
  conflicts:       string[];
  trust:           { score: number; verdict: EvidenceVerdict };
  whatWouldChange: string[];
}

export function explainTrust(nodeIdOrLabel: string): TrustExplanation {
  const node = G.getNode(nodeIdOrLabel);
  if (!node) return {
    found: false, node: null, believes: `No belief: ${nodeIdOrLabel} is not in the graph.`,
    whyBelieves: [], confirmedBy: [], conflicts: [], trust: { score: 0, verdict: "insufficient_signal" },
    whatWouldChange: [],
  };

  const ev = evaluateEvidenceForNode(node.id);
  const believes = node.type === "Theme" ? inferTheme(node.id).thesis
    : node.type === "Company" ? inferCompany(node.id).thesis
    : node.type === "Sector" ? inferSector(node.id).thesis
    : `${node.label} is tracked as a ${String(node.type).toLowerCase()}.`;
  const invalidation = node.type === "Theme" ? inferTheme(node.id).invalidation
    : node.type === "Company" ? inferCompany(node.id).invalidation
    : node.type === "Sector" ? "Its leading themes reverse or their drivers fade."
    : "Connected evidence reverses.";

  const whyBelieves = ev.reasoningSteps.filter(s => s.sourceType !== "graph" || s.claim.startsWith("Highest")).map(s => `${s.claim}: ${s.evidence}`);
  const confirmedBy = ev.sourceBreakdown.map(s => `${s.source} (${plural(s.count, "link")}, reliability ${s.reliability})`);
  const conflicts = ev.contradictions.map(c => c.detail);
  const whatWouldChange = uniq([
    invalidation,
    "A higher-tier source publishes a contradicting report.",
    "Source diversity falls below two independent types.",
    "Evidence goes stale beyond 30 days without refresh.",
  ]);

  return {
    found: true, node, believes, whyBelieves, confirmedBy, conflicts,
    trust: { score: ev.overallTrust, verdict: ev.verdict }, whatWouldChange,
  };
}

/* ------------------------------------------------------------------ *
 * 8 - debugEvidence
 * ------------------------------------------------------------------ */

export interface DebugEvidence {
  resolvedNode:      { id: string; label: string; type: NodeType } | null;
  supportingEdges:   Array<{ from: string; relationship: string; reliability: number; pages: SourcePage[] }>;
  contradictingEdges: Array<{ from: string; relationship: string; pages: SourcePage[] }>;
  sourceWeights:     Record<string, number>;
  scoreComponents:   EvidenceComponents | null;
  finalVerdict:      EvidenceVerdict;
}

export function debugEvidence(nodeIdOrLabel: string): DebugEvidence {
  const node = G.getNode(nodeIdOrLabel);
  if (!node) return { resolvedNode: null, supportingEdges: [], contradictingEdges: [], sourceWeights: {}, scoreComponents: null, finalVerdict: "insufficient_signal" };

  const ev = evaluateEvidenceForNode(node.id);
  const sourceWeights: Record<string, number> = {};
  for (const i of ev.supportingEvidence) sourceWeights[i.sourceName ?? i.type] = i.reliability;

  return {
    resolvedNode: { id: node.id, label: node.label, type: node.type },
    supportingEdges: ev.supportingEvidence.map(i => ({ from: i.from, relationship: i.relationship, reliability: i.reliability, pages: i.pages })),
    contradictingEdges: ev.contradictingEvidence.map(i => ({ from: i.from, relationship: i.relationship, pages: i.pages })),
    sourceWeights,
    scoreComponents: {
      evidenceQuality: ev.evidenceQuality, freshness: ev.freshnessScore, independence: ev.independenceScore,
      confirmation: ev.confirmationScore, contradictionPenalty: ev.contradictionScore,
    },
    finalVerdict: ev.verdict,
  };
}

/* Re-export for convenience so callers can pull evidence types from one module. */
export type { SourceType };
