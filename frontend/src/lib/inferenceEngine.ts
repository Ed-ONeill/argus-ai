/**
 * lib/inferenceEngine.ts - the Argus Inference Engine (v1).
 *
 * LEGACY-PATH (IRE-1, ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1): this module is
 * the session-scoped prototype of the engine's R2/R3 stages. Canonical
 * reasoning now assembles on the backend (app/explanations.py), served per
 * event as FeedResponse.explanations. During the IRE migration compare outputs
 * against the backend sections; new reasoning capability lands in the backend
 * engine, not here.
 *
 * The Market Intelligence Graph stores facts (nodes + evidence-weighted edges).
 * This engine reads those facts and produces reasoned, explainable conclusions:
 * what is strengthening or weakening, why, what confirms it across sources, who
 * benefits, who is at risk, what to watch, and what would invalidate the thesis.
 *
 * Rules:
 *  - Infer only from graph nodes and relationships. No fabricated thesis language,
 *    no hardcoded financial claims. Missing evidence => insufficient_signal.
 *  - Every inference carries reasoningSteps (claim, evidence, confidence, sourceType).
 *  - Scoring is a simple, understandable weighted blend. No fake precision.
 *  - No UI. No em/en dashes anywhere: commas, colons, hyphens and arrows only.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import type { IntelNode, IntelEdge, NodeType, SourcePage } from "./intelligenceGraph";
import { num, clamp01, round, avg, uniq, list, plural } from "./intelligenceUtils";

/* ------------------------------------------------------------------ *
 * Shared vocabulary
 * ------------------------------------------------------------------ */

export type Direction = "strengthening" | "weakening" | "mixed" | "insufficient_signal";

export type SourceType =
  | "theme" | "story" | "listen" | "ma" | "private" | "macro"
  | "sector" | "company" | "cross_market" | "graph";

export interface ReasoningStep {
  claim:      string;
  evidence:   string;
  confidence: number;      // 0..100
  sourceType: SourceType;
}

const POSITIVE_REL = new Set(["supports", "drives", "raises_demand_for", "supplies", "owns"]);
const NEGATIVE_REL = new Set(["weakens", "reduces_supply_of", "competes_with"]);

const PAGE_SOURCE: Record<string, SourceType> = {
  "Feed": "story",
  "Markets": "theme",
  "Industries": "sector",
  "Listen": "listen",
  "M&A": "ma",
  "Private Markets": "private",
  "Theme Intelligence": "theme",
  "Cross-page Intelligence": "cross_market",
  "Historical Snapshots": "theme",
};


const recencyDaysOf = (node: IntelNode): number => Math.max(0, (Date.now() - num(node.lastSeen)) / 86_400_000);

interface Neigh { node: IntelNode; edge: IntelEdge }

/** Group a node's neighbors by type in one pass. */
function grouped(id: string) {
  const all = G.getNeighbors(id);
  const by = (t: NodeType): Neigh[] => all.filter(x => x.node.type === t);
  return {
    all,
    companies: by("Company"),
    sectors:   by("Sector"),
    macros:    by("Macro"),
    stories:   by("Story"),
    podcasts:  by("Podcast"),
    deals:     by("Deal"),
    funds:     by("Fund"),
    themes:    by("Theme"),
    persons:   by("Person"),
  };
}

interface EdgeStats { count: number; evidence: number; pages: SourcePage[]; strength: number; confidence: number }
function edgeStats(edges: IntelEdge[]): EdgeStats {
  return {
    count:      edges.length,
    evidence:   edges.reduce((s, e) => s + num(e.evidenceCount), 0),
    pages:      uniq(edges.flatMap(e => e.originatingPages)),
    strength:   avg(edges.map(e => num(e.strength))),
    confidence: avg(edges.map(e => num(e.confidence))),
  };
}

/* ------------------------------------------------------------------ *
 * scoreInference - the reusable, understandable score
 * ------------------------------------------------------------------ */

export interface ScoreInput {
  strength?:         number;   // 0..100 average relationship strength
  confidence?:       number;   // 0..100 average confidence
  evidenceCount?:    number;   // total supporting observations
  originatingPages?: number;   // distinct source pages
  persistence?:      number;   // 0..100
  momentum?:         number;   // signed rate of change
  conviction?:       number;   // 0..100
  recencyDays?:      number;   // days since last observation (optional)
}

export interface ScoreComponents {
  confidence:  number; conviction: number; persistence: number;
  evidence:    number; crossSource: number; strength: number;
  momentum:    number; recency: number;    // all normalized to 0..100
}
export interface InferenceScore { score: number; components: ScoreComponents }

const WEIGHTS = { confidence: 0.22, conviction: 0.16, persistence: 0.14, evidence: 0.16, crossSource: 0.16, strength: 0.10, momentum: 0.06 };

/**
 * Blend the signal components into one 0..100 score. Evidence and cross-source
 * saturate (diminishing returns), momentum counts by magnitude, and recency gently
 * scales the whole thing so a stale signal reads lower without being erased.
 */
export function scoreInference(input: ScoreInput): InferenceScore {
  const confidence  = clamp01(num(input.confidence) / 100);
  const conviction  = clamp01(num(input.conviction) / 100);
  const persistence = clamp01(num(input.persistence) / 100);
  const strength    = clamp01(num(input.strength) / 100);
  const evidence    = clamp01(Math.log2(1 + num(input.evidenceCount)) / Math.log2(1 + 16)); // ~16 obs saturates
  const crossSource = clamp01(num(input.originatingPages) / 4);                              // 4+ pages is full
  const momentum    = clamp01(Math.abs(num(input.momentum)) / 20);                           // |delta| >= 20 is full
  const recency     = input.recencyDays == null ? 1 : clamp01(1 - num(input.recencyDays) / 30);

  const raw =
    confidence  * WEIGHTS.confidence  + conviction * WEIGHTS.conviction +
    persistence * WEIGHTS.persistence + evidence   * WEIGHTS.evidence   +
    crossSource * WEIGHTS.crossSource + strength   * WEIGHTS.strength   +
    momentum    * WEIGHTS.momentum;

  const recencyScale = 0.6 + 0.4 * recency; // old but strong still counts (floor 0.6)
  const score = round(clamp01(raw) * recencyScale * 100);

  return {
    score,
    components: {
      confidence: round(confidence * 100), conviction: round(conviction * 100),
      persistence: round(persistence * 100), evidence: round(evidence * 100),
      crossSource: round(crossSource * 100), strength: round(strength * 100),
      momentum: round(momentum * 100), recency: round(recency * 100),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Direction + evidence primitives
 * ------------------------------------------------------------------ */

function directionOf(node: IntelNode, es: EdgeStats): Direction {
  if (es.evidence + es.count < 2 && num(node.mentionCount) < 1) return "insufficient_signal";
  const m = num(node.momentum);
  if (m >= 3) return "strengthening";
  if (m <= -3) return "weakening";
  return "mixed";
}

/** Human-readable, graph-derived evidence fragments (only non-zero ones). */
function evidenceParts(g: ReturnType<typeof grouped>): string[] {
  const parts: string[] = [];
  if (g.stories.length)  parts.push(plural(g.stories.length, "supporting story", "supporting stories"));
  if (g.podcasts.length) parts.push(plural(g.podcasts.length, "podcast mention"));
  if (g.deals.length)    parts.push(plural(g.deals.length, "M&A relationship"));
  if (g.funds.length)    parts.push(plural(g.funds.length, "private-capital link"));
  if (g.companies.length) parts.push(plural(g.companies.length, "linked company", "linked companies"));
  return parts;
}

const sourceTypeForPages = (pages: SourcePage[]): SourceType =>
  pages.length >= 2 ? "cross_market" : (PAGE_SOURCE[pages[0] ?? ""] ?? "graph");

/* ------------------------------------------------------------------ *
 * 1 - inferTheme
 * ------------------------------------------------------------------ */

export interface ThemeInference {
  found:               boolean;
  theme:               IntelNode | null;
  thesis:              string;
  direction:           Direction;
  confidence:          number;
  evidenceCount:       number;
  supportingEvidence:  string[];
  confirmingSources:   SourcePage[];
  beneficiaryCompanies: string[];
  atRiskCompanies:     string[];
  relatedSectors:      string[];
  macroDrivers:        string[];
  nextWatch:           string;
  invalidation:        string;
  reasoningSteps:      ReasoningStep[];
}

function emptyTheme(label: string): ThemeInference {
  return {
    found: false, theme: null,
    thesis: `Insufficient signal to form a thesis for ${label}.`,
    direction: "insufficient_signal", confidence: 0, evidenceCount: 0,
    supportingEvidence: [], confirmingSources: [], beneficiaryCompanies: [], atRiskCompanies: [],
    relatedSectors: [], macroDrivers: [], nextWatch: "fresh confirmation across sources",
    invalidation: "Cross-source confirmation does not appear.",
    reasoningSteps: [{ claim: `No graph node resolved for ${label}`, evidence: "The entity is not present in the current graph.", confidence: 0, sourceType: "graph" }],
  };
}

export function inferTheme(themeIdOrLabel: string): ThemeInference {
  const node = G.getNode(themeIdOrLabel);
  if (!node) return emptyTheme(themeIdOrLabel);

  const g = grouped(node.id);
  const es = edgeStats(G.getRelationships(node.id));
  const direction = directionOf(node, es);

  const { score } = scoreInference({
    strength: es.strength, confidence: Math.max(es.confidence, num(node.confidence)),
    evidenceCount: es.evidence, originatingPages: es.pages.length,
    persistence: node.persistence, momentum: node.momentum, conviction: node.conviction,
    recencyDays: recencyDaysOf(node),
  });

  if (direction === "insufficient_signal") {
    const out = emptyTheme(node.label);
    out.found = true; out.theme = node;
    return out;
  }

  const supportCos = g.companies.filter(x => POSITIVE_REL.has(x.edge.relationshipType)).map(x => x.node.label);
  const weakenCos  = g.companies.filter(x => NEGATIVE_REL.has(x.edge.relationshipType)).map(x => x.node.label);
  const strengthening = direction === "strengthening" || direction === "mixed";
  const beneficiaryCompanies = uniq(strengthening ? supportCos : weakenCos).slice(0, 8);
  const atRiskCompanies      = uniq(strengthening ? weakenCos : supportCos).slice(0, 8);

  const relatedSectors = uniq(g.sectors.map(x => x.node.label)).slice(0, 6);
  const macroDrivers   = uniq(g.macros.map(x => x.node.label)).slice(0, 5);
  const supportingEvidence = evidenceParts(g);
  const primaryDriver = macroDrivers[0];

  const nextWatch = primaryDriver
    ? `the ${primaryDriver} driver and fresh cross-source confirmation`
    : "fresh confirmation across Feed, Listen and M&A";
  const invalidation = primaryDriver
    ? `The ${primaryDriver} driver reverses, or cross-source confirmation fades.`
    : "Cross-source confirmation fades and momentum stalls.";

  const thesis = buildThemeThesis(node, direction, es.pages, supportingEvidence, beneficiaryCompanies);

  const steps: ReasoningStep[] = [
    { claim: `${node.label} is ${direction}`,
      evidence: supportingEvidence.length ? `Supported by ${list(supportingEvidence)}.` : `Based on ${plural(es.count, "graph connection")}.`,
      confidence: score, sourceType: sourceTypeForPages(es.pages) },
  ];
  if (es.pages.length >= 2) steps.push({
    claim: `Confirmed across ${plural(es.pages.length, "source")}`,
    evidence: list(es.pages as string[]), confidence: round(clamp01(es.pages.length / 4) * 100), sourceType: "cross_market",
  });
  if (beneficiaryCompanies.length) steps.push({
    claim: `Primary beneficiaries: ${list(beneficiaryCompanies)}`,
    evidence: `Linked by ${plural(supportCos.length || beneficiaryCompanies.length, "positive relationship")}.`,
    confidence: round(es.strength), sourceType: "company",
  });
  if (primaryDriver) steps.push({
    claim: `Driven by ${primaryDriver}`,
    evidence: macroDrivers.length > 1 ? `Macro drivers: ${list(macroDrivers)}.` : `${primaryDriver} drives this theme.`,
    confidence: round(Math.max(es.confidence, num(node.confidence))), sourceType: "macro",
  });

  return {
    found: true, theme: node, thesis, direction,
    confidence: score, evidenceCount: es.evidence,
    supportingEvidence, confirmingSources: es.pages,
    beneficiaryCompanies, atRiskCompanies, relatedSectors, macroDrivers,
    nextWatch, invalidation, reasoningSteps: steps,
  };
}

function buildThemeThesis(node: IntelNode, direction: Direction, pages: SourcePage[], evidence: string[], beneficiaries: string[]): string {
  const bits: string[] = [`${node.label} is ${direction}`];
  if (pages.length >= 2) bits.push(`confirmed across ${list(pages as string[])}`);
  if (evidence.length)   bits.push(`with ${list(evidence)}`);
  let s = bits.join(", ") + ".";
  if (beneficiaries.length) s += ` Beneficiaries: ${list(beneficiaries)}.`;
  return s;
}

/* ------------------------------------------------------------------ *
 * 2 - inferCompany
 * ------------------------------------------------------------------ */

export interface CompanyInference {
  found:             boolean;
  company:           IntelNode | null;
  activeThemes:      string[];
  positiveExposures: string[];
  negativeExposures: string[];
  sectorContext:     string[];
  recentDrivers:     string[];
  confidence:        number;
  thesis:            string;
  nextWatch:         string;
  invalidation:      string;
  reasoningSteps:    ReasoningStep[];
}

export function inferCompany(tickerOrName: string): CompanyInference {
  const node = G.getNode(tickerOrName);
  if (!node) return {
    found: false, company: null, activeThemes: [], positiveExposures: [], negativeExposures: [],
    sectorContext: [], recentDrivers: [], confidence: 0,
    thesis: `Insufficient signal to form a thesis for ${tickerOrName}.`,
    nextWatch: "the company appearing in themes, stories or deals",
    invalidation: "No connected intelligence emerges.",
    reasoningSteps: [{ claim: `No graph node resolved for ${tickerOrName}`, evidence: "The entity is not present in the current graph.", confidence: 0, sourceType: "graph" }],
  };

  const g = grouped(node.id);
  const themeNeigh = g.themes;
  const activeThemes = uniq(themeNeigh.map(x => x.node.label)).slice(0, 8);

  // Exposure sign comes from the relationship type on the theme->company edge.
  const positiveExposures = uniq(themeNeigh.filter(x => POSITIVE_REL.has(x.edge.relationshipType)).map(x => x.node.label)).slice(0, 8);
  const negativeExposures = uniq(themeNeigh.filter(x => NEGATIVE_REL.has(x.edge.relationshipType)).map(x => x.node.label)).slice(0, 8);

  const metaSector = typeof node.metadata?.sector === "string" ? String(node.metadata.sector) : null;
  const sectorContext = uniq([...(metaSector ? [metaSector] : []), ...g.sectors.map(x => x.node.label)]).slice(0, 6);

  // Recent drivers: macros driving this company's active themes (a 2-hop read).
  const recentDrivers = uniq(themeNeigh.flatMap(x => G.getNeighbors(x.node.id).filter(n => n.node.type === "Macro").map(n => n.node.label))).slice(0, 5);

  // Confidence blends the company's connected themes (their momentum / conviction) with edge quality.
  const es = edgeStats(G.getRelationships(node.id));
  const themeMomentum = avg(themeNeigh.map(x => num(x.node.momentum)));
  const themeConviction = avg(themeNeigh.map(x => num(x.node.conviction)));
  const themePersistence = avg(themeNeigh.map(x => num(x.node.persistence)));
  const { score } = scoreInference({
    strength: es.strength, confidence: Math.max(es.confidence, num(node.confidence)),
    evidenceCount: es.evidence, originatingPages: es.pages.length,
    persistence: themePersistence, momentum: themeMomentum, conviction: themeConviction,
    recencyDays: recencyDaysOf(node),
  });

  const lean: Direction = themeMomentum >= 3 ? "strengthening" : themeMomentum <= -3 ? "weakening" : "mixed";
  const thesis = activeThemes.length
    ? `${node.label} is exposed to ${list(activeThemes)}, currently ${lean}${sectorContext.length ? ` within ${list(sectorContext)}` : ""}.`
    : `${node.label} has no active theme exposure in the current graph.`;

  const steps: ReasoningStep[] = [];
  if (activeThemes.length) steps.push({
    claim: `${node.label} is exposed to ${plural(activeThemes.length, "active theme")}`,
    evidence: list(activeThemes), confidence: score, sourceType: "theme",
  });
  if (positiveExposures.length) steps.push({
    claim: `Positive exposure: ${list(positiveExposures)}`, evidence: `Linked by positive theme relationships.`,
    confidence: round(Math.max(0, themeMomentum >= 0 ? score : score - 15)), sourceType: "cross_market",
  });
  if (negativeExposures.length) steps.push({
    claim: `Negative exposure: ${list(negativeExposures)}`, evidence: `Linked by weakening relationships.`,
    confidence: round(score), sourceType: "cross_market",
  });
  if (recentDrivers.length) steps.push({
    claim: `Recent drivers: ${list(recentDrivers)}`, evidence: `Macro drivers behind the connected themes.`,
    confidence: round(es.confidence || node.confidence), sourceType: "macro",
  });
  if (!steps.length) steps.push({ claim: `${node.label} has thin connectivity`, evidence: `Only ${plural(es.count, "graph connection")}.`, confidence: score, sourceType: "graph" });

  return {
    found: true, company: node, activeThemes, positiveExposures, negativeExposures,
    sectorContext, recentDrivers, confidence: score, thesis,
    nextWatch: recentDrivers.length ? `${list(recentDrivers.slice(0, 2))} and new theme confirmation` : "new theme, story or deal linkage",
    invalidation: activeThemes.length ? `The ${activeThemes[0]} thesis reverses or its drivers fade.` : "No connected intelligence emerges.",
    reasoningSteps: steps,
  };
}

/* ------------------------------------------------------------------ *
 * 3 - inferSector
 * ------------------------------------------------------------------ */

export interface SectorInference {
  found:                     boolean;
  sector:                    IntelNode | null;
  strengtheningThemes:       string[];
  weakeningThemes:           string[];
  exposedCompanies:          string[];
  macroDrivers:              string[];
  dealActivity:              string[];
  listenConfirmation:        boolean;
  privateCapitalConfirmation: boolean;
  confidence:                number;
  thesis:                    string;
  nextWatch:                 string;
  reasoningSteps:            ReasoningStep[];
}

export function inferSector(sectorOrIndustry: string): SectorInference {
  const node = G.getNode(sectorOrIndustry);
  if (!node) return {
    found: false, sector: null, strengtheningThemes: [], weakeningThemes: [], exposedCompanies: [],
    macroDrivers: [], dealActivity: [], listenConfirmation: false, privateCapitalConfirmation: false,
    confidence: 0, thesis: `Insufficient signal to form a thesis for ${sectorOrIndustry}.`,
    nextWatch: "themes, deals or capital flows referencing the sector",
    reasoningSteps: [{ claim: `No graph node resolved for ${sectorOrIndustry}`, evidence: "The entity is not present in the current graph.", confidence: 0, sourceType: "graph" }],
  };

  const g = grouped(node.id);
  const themeNeigh = g.themes;
  const strengtheningThemes = uniq(themeNeigh.filter(x => num(x.node.momentum) >= 3).map(x => x.node.label)).slice(0, 8);
  const weakeningThemes     = uniq(themeNeigh.filter(x => num(x.node.momentum) <= -3).map(x => x.node.label)).slice(0, 8);

  // Companies and macros are read one hop out from the sector's themes.
  const twoHop = (type: NodeType): string[] =>
    uniq(themeNeigh.flatMap(x => G.getNeighbors(x.node.id).filter(n => n.node.type === type).map(n => n.node.label)));
  const exposedCompanies = twoHop("Company").slice(0, 10);
  const macroDrivers     = twoHop("Macro").slice(0, 5);

  const dealActivity = uniq(g.deals.map(x => x.node.label)).slice(0, 6);

  // Confirmation flags: any listen / private edge touching the sector or its themes.
  const relevantIds = [node.id, ...themeNeigh.map(x => x.node.id)];
  const relevantEdges = uniq(relevantIds.flatMap(id => G.getRelationships(id)));
  const listenConfirmation = relevantEdges.some(e => e.originatingPages.includes("Listen"))
    || twoHop("Podcast").length > 0;
  const privateCapitalConfirmation = relevantEdges.some(e => e.originatingPages.includes("Private Markets"));

  const es = edgeStats(G.getRelationships(node.id));
  const sectorMomentum = avg(themeNeigh.map(x => num(x.node.momentum)));
  const { score } = scoreInference({
    strength: es.strength, confidence: Math.max(es.confidence, num(node.confidence)),
    evidenceCount: es.evidence, originatingPages: uniq(relevantEdges.flatMap(e => e.originatingPages)).length,
    persistence: avg(themeNeigh.map(x => num(x.node.persistence))), momentum: sectorMomentum,
    conviction: avg(themeNeigh.map(x => num(x.node.conviction))), recencyDays: recencyDaysOf(node),
  });

  const lean = strengtheningThemes.length > weakeningThemes.length ? "firming"
    : weakeningThemes.length > strengtheningThemes.length ? "softening" : "mixed";
  const confirmBits: string[] = [];
  if (dealActivity.length) confirmBits.push(plural(dealActivity.length, "deal"));
  if (listenConfirmation) confirmBits.push("podcast discussion");
  if (privateCapitalConfirmation) confirmBits.push("private-capital flow");

  const thesis = themeNeigh.length
    ? `${node.label} is ${lean}${strengtheningThemes.length ? `, led by ${list(strengtheningThemes)}` : ""}${confirmBits.length ? `, with ${list(confirmBits)}` : ""}.`
    : `${node.label} has no active theme linkage in the current graph.`;

  const steps: ReasoningStep[] = [];
  if (strengtheningThemes.length) steps.push({ claim: `Strengthening themes in ${node.label}: ${list(strengtheningThemes)}`, evidence: `Positive momentum themes linked to the sector.`, confidence: score, sourceType: "theme" });
  if (weakeningThemes.length) steps.push({ claim: `Weakening themes in ${node.label}: ${list(weakeningThemes)}`, evidence: `Negative momentum themes linked to the sector.`, confidence: score, sourceType: "theme" });
  if (exposedCompanies.length) steps.push({ claim: `Exposed companies: ${list(exposedCompanies)}`, evidence: `Reached through the sector's themes.`, confidence: round(es.strength || 50), sourceType: "company" });
  if (confirmBits.length) steps.push({ claim: `Confirmed by ${list(confirmBits)}`, evidence: `Cross-source activity around the sector.`, confidence: round(clamp01(uniq(relevantEdges.flatMap(e => e.originatingPages)).length / 4) * 100), sourceType: "cross_market" });
  if (!steps.length) steps.push({ claim: `${node.label} has thin connectivity`, evidence: `Only ${plural(es.count, "graph connection")}.`, confidence: score, sourceType: "graph" });

  return {
    found: true, sector: node, strengtheningThemes, weakeningThemes, exposedCompanies, macroDrivers,
    dealActivity, listenConfirmation, privateCapitalConfirmation, confidence: score, thesis,
    nextWatch: macroDrivers.length ? `${list(macroDrivers.slice(0, 2))} and new deal or capital activity` : "new theme, deal or capital activity",
    reasoningSteps: steps,
  };
}

/* ------------------------------------------------------------------ *
 * 4 - inferMarketState
 * ------------------------------------------------------------------ */

export interface ThemeBrief { label: string; direction: Direction; score: number; confirmingSources: SourcePage[]; evidenceCount: number }

export interface MarketStateInference {
  strongestThemes:         ThemeBrief[];
  weakestThemes:           ThemeBrief[];
  mostConfirmedThemes:     ThemeBrief[];
  mostCrowdedThemes:       ThemeBrief[];
  contrarianOpportunities: ThemeBrief[];
  crossMarketConfirmations: ThemeBrief[];
  topRisks:                string[];
  oneLineRead:             string;
  morningBriefBullets:     string[];
}

interface ScoredTheme { node: IntelNode; es: EdgeStats; score: number; direction: Direction; degree: number }

export function inferMarketState(): MarketStateInference {
  const themes = G.nodesOfType("Theme");
  if (themes.length === 0) return {
    strongestThemes: [], weakestThemes: [], mostConfirmedThemes: [], mostCrowdedThemes: [],
    contrarianOpportunities: [], crossMarketConfirmations: [], topRisks: [],
    oneLineRead: "Insufficient signal across the market right now.",
    morningBriefBullets: ["No themes are present in the graph yet."],
  };

  const scored: ScoredTheme[] = themes.map(node => {
    const es = edgeStats(G.getRelationships(node.id));
    const score = scoreInference({
      strength: es.strength, confidence: Math.max(es.confidence, num(node.confidence)),
      evidenceCount: es.evidence, originatingPages: es.pages.length,
      persistence: node.persistence, momentum: node.momentum, conviction: node.conviction,
      recencyDays: recencyDaysOf(node),
    }).score;
    return { node, es, score, direction: directionOf(node, es), degree: es.count };
  });

  const brief = (t: ScoredTheme): ThemeBrief => ({ label: t.node.label, direction: t.direction, score: t.score, confirmingSources: t.es.pages, evidenceCount: t.es.evidence });

  const strongestThemes = [...scored].filter(t => num(t.node.momentum) >= 0).sort((a, b) => b.score - a.score).slice(0, 5).map(brief);
  const weakestThemes   = [...scored].filter(t => num(t.node.momentum) < 0).sort((a, b) => a.score - b.score).slice(0, 5).map(brief);
  const mostConfirmedThemes = [...scored].sort((a, b) => (b.es.pages.length - a.es.pages.length) || (b.es.evidence - a.es.evidence)).slice(0, 5).map(brief);
  const mostCrowdedThemes   = [...scored].sort((a, b) => (num(b.node.mentionCount) + b.degree) - (num(a.node.mentionCount) + a.degree)).slice(0, 5).map(brief);
  const contrarianOpportunities = [...scored]
    .filter(t => num(t.node.momentum) <= 0 && num(t.node.persistence) >= 55 && num(t.node.conviction) >= 50)
    .sort((a, b) => num(b.node.persistence) - num(a.node.persistence)).slice(0, 5).map(brief);
  const crossMarketConfirmations = [...scored].filter(t => t.es.pages.length >= 3).sort((a, b) => b.es.pages.length - a.es.pages.length).slice(0, 5).map(brief);

  const topRisks = weakestThemes.map(t => `${t.label} is weakening`).slice(0, 4);

  const lead = strongestThemes[0];
  const oneLineRead = lead
    ? `Market read: ${lead.label} is the strongest theme${lead.confirmingSources.length >= 2 ? `, confirmed across ${list(lead.confirmingSources as string[])}` : ""}${weakestThemes[0] ? `; ${weakestThemes[0].label} is the weakest` : ""}.`
    : "Market read: signal is mixed with no dominant theme.";

  const morningBriefBullets: string[] = [];
  if (lead) morningBriefBullets.push(`Strongest: ${strongestThemes.map(t => t.label).join(", ")}.`);
  if (crossMarketConfirmations.length) morningBriefBullets.push(`Confirmed across sources: ${crossMarketConfirmations.map(t => t.label).join(", ")}.`);
  if (weakestThemes.length) morningBriefBullets.push(`Weakening: ${weakestThemes.map(t => t.label).join(", ")}.`);
  if (contrarianOpportunities.length) morningBriefBullets.push(`Contrarian watch: ${contrarianOpportunities.map(t => t.label).join(", ")}.`);
  if (topRisks.length) morningBriefBullets.push(`Risks: ${topRisks.join(", ")}.`);
  if (!morningBriefBullets.length) morningBriefBullets.push("No decisive theme signal in the graph yet.");

  return {
    strongestThemes, weakestThemes, mostConfirmedThemes, mostCrowdedThemes,
    contrarianOpportunities, crossMarketConfirmations, topRisks, oneLineRead, morningBriefBullets,
  };
}

/* ------------------------------------------------------------------ *
 * 9 - debugInference
 * ------------------------------------------------------------------ */

export interface DebugInference {
  resolvedNode:   { id: string; label: string; type: NodeType } | null;
  neighborsUsed:  Array<{ label: string; type: NodeType; via: string; direction: "out" | "in" }>;
  edgesUsed:      Array<{ source: string; target: string; type: string; strength: number; confidence: number; evidenceCount: number; pages: SourcePage[] }>;
  scoreComponents: ScoreComponents | null;
  finalInference:  ThemeInference | CompanyInference | SectorInference | null;
}

/** Readable trace of how an inference was formed. For development only. */
export function debugInference(themeOrCompany: string): DebugInference {
  const node = G.getNode(themeOrCompany);
  if (!node) return { resolvedNode: null, neighborsUsed: [], edgesUsed: [], scoreComponents: null, finalInference: null };

  const neighborsUsed = G.getNeighbors(node.id).map(x => ({
    label: x.node.label, type: x.node.type, via: x.edge.relationshipType,
    direction: (x.edge.source === node.id ? "out" : "in") as "out" | "in",
  }));
  const edges = G.getRelationships(node.id);
  const edgesUsed = edges.map(e => ({
    source: G.getNode(e.source)?.label ?? e.source, target: G.getNode(e.target)?.label ?? e.target,
    type: e.relationshipType, strength: e.strength, confidence: e.confidence, evidenceCount: e.evidenceCount, pages: e.originatingPages,
  }));

  const es = edgeStats(edges);
  const { components } = scoreInference({
    strength: es.strength, confidence: Math.max(es.confidence, num(node.confidence)),
    evidenceCount: es.evidence, originatingPages: es.pages.length,
    persistence: node.persistence, momentum: node.momentum, conviction: node.conviction, recencyDays: recencyDaysOf(node),
  });

  const finalInference: DebugInference["finalInference"] =
    node.type === "Company" ? inferCompany(node.id)
    : node.type === "Sector" ? inferSector(node.id)
    : inferTheme(node.id);

  return {
    resolvedNode: { id: node.id, label: node.label, type: node.type },
    neighborsUsed, edgesUsed, scoreComponents: components, finalInference,
  };
}
