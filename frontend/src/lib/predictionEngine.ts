/**
 * lib/predictionEngine.ts - the Argus Prediction Engine.
 *
 * Forward-looking intelligence built strictly on top of the existing stack:
 * intelligenceGraph (facts), inferenceEngine (conclusions), narrativeTransmission
 * (propagation), and evidenceEngine (trust). It predicts the most likely evolution
 * of narratives using only graph relationships, evidence scores, transmission paths,
 * historical snapshots, momentum, persistence, conviction, relationship strength, and
 * cross-source confirmation.
 *
 * Hard rules: deterministic, no LLM, no fabricated macro events, no price or return
 * predictions. Every prediction is explainable and lists why it exists. When the data
 * does not support a call, it returns insufficient_signal. Pure library, no UI, no
 * React. No em/en dashes anywhere.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import type { IntelNode, IntelEdge, NodeType } from "./intelligenceGraph";
import { inferTheme, inferCompany, inferSector, inferMarketState } from "./inferenceEngine";
import { buildNarrativePath, rankNarratives, detectEmergingNarratives } from "./narrativeTransmission";
import type { NodeRef } from "./narrativeTransmission";
import { evaluateEvidenceForNode } from "./evidenceEngine";
import type { NodeEvidence } from "./evidenceEngine";
import { num, clamp01, round, avg, uniq, list, plural } from "./intelligenceUtils";

/* ------------------------------------------------------------------ *
 * Shared vocabulary + transparent weightings
 * ------------------------------------------------------------------ */

export type PredictedDirection = "strengthening" | "weakening" | "stable" | "reversing" | "insufficient_signal";
export type PredictionSource = "graph" | "inference" | "evidence" | "narrative" | "history" | "cross_market";

export interface PredictionStep {
  claim:      string;
  evidence:   string;
  confidence: number;      // 0..100
  source:     PredictionSource;
}

/** All weightings are centralized and transparent so any score is reproducible. */
export const PREDICTION_WEIGHTS = {
  themeProbability: { momentum: 0.30, evidence: 0.30, persistence: 0.20, crossSource: 0.20 },
  themeStable:      { persistence: 0.50, evidence: 0.30, calm: 0.20 },
  opportunity:      { upside: 0.30, evidenceQuality: 0.25, velocity: 0.20, crossConfirm: 0.15, conviction: 0.10 },
  risk:             { downside: 0.30, contradiction: 0.25, crowding: 0.20, lowEvidence: 0.15, weakening: 0.10 },
  company:          { magnitude: 0.60, trust: 0.40 },
} as const;

const ref = (n: IntelNode | null | undefined): NodeRef | null => (n ? { id: n.id, label: n.label, type: n.type } : null);

/* ------------------------------------------------------------------ *
 * History (snapshot) trend, graph-only
 * ------------------------------------------------------------------ */

interface HistoryTrend { hasHistory: boolean; sessions: number; convictionDelta: number; momentumDelta: number }
function historyTrend(node: IntelNode): HistoryTrend {
  const h = node.metadata?.history;
  if (!Array.isArray(h) || h.length < 2) return { hasHistory: false, sessions: Array.isArray(h) ? h.length : 0, convictionDelta: 0, momentumDelta: 0 };
  const first = h[0] as { conviction?: number; acceleration?: number };
  const last = h[h.length - 1] as { conviction?: number; acceleration?: number };
  return { hasHistory: true, sessions: h.length, convictionDelta: round(num(last.conviction) - num(first.conviction)), momentumDelta: round(num(last.acceleration) - num(first.acceleration)) };
}

/* ------------------------------------------------------------------ *
 * Theme prediction core (numeric, reused by ranking and market views)
 * ------------------------------------------------------------------ */

interface ThemeCore {
  found:            boolean;
  node:             IntelNode | null;
  direction:        PredictedDirection;
  probability:      number;
  confidence:       number;
  timeframe:        string;
  momentum:         number;
  persistence:      number;
  conviction:       number;
  evidenceScore:    number;
  confirmation:     number;
  contradiction:    number;
  crossSourceCount: number;
  history:          HistoryTrend;
  ev:               NodeEvidence | null;
}

function timeframeOf(m: number, p: number): string {
  const mag = Math.abs(m);
  if (mag >= 8) return "near-term (this cycle)";
  if (mag >= 4 && p >= 55) return "multi-week continuation";
  if (p >= 65) return "durable, multi-week";
  if (mag < 3) return "range-bound, no clear timeframe";
  return "developing, uncertain timeframe";
}

function directionOf(m: number, convictionDelta: number, contradiction: number): PredictedDirection {
  if (contradiction >= 55 && m < 3) return "reversing";
  if (m >= 5) return "strengthening";
  if (m <= -5) return "weakening";
  if (m >= 3 && convictionDelta >= 0) return "strengthening";
  if (m <= -3 || convictionDelta <= -6) return "weakening";
  return "stable";
}

function themeCore(themeIdOrLabel: string): ThemeCore {
  const node = G.getNode(themeIdOrLabel);
  const empty: ThemeCore = {
    found: false, node: node ?? null, direction: "insufficient_signal", probability: 0, confidence: 0,
    timeframe: "unknown", momentum: 0, persistence: 0, conviction: 0, evidenceScore: 0, confirmation: 0,
    contradiction: 0, crossSourceCount: 0, history: { hasHistory: false, sessions: 0, convictionDelta: 0, momentumDelta: 0 }, ev: null,
  };
  if (!node) return empty;

  const ti = inferTheme(node.id);
  const ev = evaluateEvidenceForNode(node.id);
  if (!ti.found || ti.direction === "insufficient_signal" || !ev.found || ev.verdict === "insufficient_signal") {
    return { ...empty, node, ev };
  }

  const m = num(node.momentum), p = num(node.persistence), c = num(node.conviction);
  const trust = ev.overallTrust, confirmation = ev.confirmationScore, contradiction = ev.contradictionScore;
  const crossSourceCount = ti.confirmingSources.length;
  const hist = historyTrend(node);
  const direction = directionOf(m, hist.convictionDelta, contradiction);

  const W = PREDICTION_WEIGHTS.themeProbability;
  const dirMag = clamp01(Math.abs(m) / 12);
  const support = clamp01(trust / 100);
  const persist = clamp01(p / 100);
  const cross = clamp01(confirmation / 100);
  let prob: number;
  if (direction === "stable") {
    const S = PREDICTION_WEIGHTS.themeStable;
    prob = persist * S.persistence + support * S.evidence + (1 - dirMag) * S.calm;
  } else {
    prob = dirMag * W.momentum + support * W.evidence + persist * W.persistence + cross * W.crossSource;
  }

  return {
    found: true, node, direction, probability: round(clamp01(prob) * 100), confidence: trust,
    timeframe: timeframeOf(m, p), momentum: round(m), persistence: round(p), conviction: round(c),
    evidenceScore: ev.evidenceScore, confirmation, contradiction, crossSourceCount, history: hist, ev,
  };
}

/* ------------------------------------------------------------------ *
 * 1 - predictThemeTrajectory
 * ------------------------------------------------------------------ */

export interface ThemeTrajectoryPrediction {
  found:                 boolean;
  theme:                 NodeRef | null;
  currentState:          string;
  predictedDirection:    PredictedDirection;
  probability:           number;
  confidence:            number;
  expectedTimeframe:     string;
  why:                   string[];
  supportingEvidence:    string[];
  invalidationConditions: string[];
  confirmingSignals:     string[];
  warningSignals:        string[];
  nextLikelyEvents:      string[];
  reasoningSteps:        PredictionStep[];
}

function insufficientTheme(node: IntelNode | null, label: string): ThemeTrajectoryPrediction {
  return {
    found: false, theme: ref(node), currentState: "insufficient_signal",
    predictedDirection: "insufficient_signal", probability: 0, confidence: 0, expectedTimeframe: "unknown",
    why: [`Insufficient graph evidence to predict ${label}.`], supportingEvidence: [], invalidationConditions: [],
    confirmingSignals: [], warningSignals: [], nextLikelyEvents: [],
    reasoningSteps: [{ claim: `No forecast for ${label}`, evidence: node ? "The theme has too little supporting evidence in the graph." : "The theme is not present in the graph.", confidence: 0, source: "graph" }],
  };
}

export function predictThemeTrajectory(idOrLabel: string): ThemeTrajectoryPrediction {
  const core = themeCore(idOrLabel);
  if (!core.found || !core.node || !core.ev) return insufficientTheme(core.node, idOrLabel);

  const node = core.node;
  const ti = inferTheme(node.id);
  const np = buildNarrativePath(node.id);

  const why: string[] = [
    `Momentum is ${core.momentum} with persistence ${core.persistence} and conviction ${core.conviction}.`,
    `Evidence trust ${core.confidence} (${core.ev.verdict}), confirmed across ${plural(core.crossSourceCount, "source type")}.`,
  ];
  if (core.history.hasHistory) why.push(`Snapshot history: conviction moved ${core.history.convictionDelta >= 0 ? "up" : "down"} ${Math.abs(core.history.convictionDelta)} over ${plural(core.history.sessions, "session")}.`);
  if (core.contradiction > 0) why.push(`Contradiction pressure is ${core.contradiction} of 100.`);

  const supportingEvidence = uniq([
    ...ti.supportingEvidence,
    ...core.ev.sourceBreakdown.slice(0, 3).map(s => `${s.source} (reliability ${s.reliability})`),
    ...(core.history.hasHistory ? [`Tracked across ${plural(core.history.sessions, "session")} of snapshots`] : []),
  ]);

  const invalidationConditions = uniq([
    ti.invalidation,
    "Momentum turns negative across consecutive readings.",
    "Cross-source confirmation falls below two source types.",
    ...core.ev.contradictions.map(c => c.detail),
  ]);

  const confirmingSignals = uniq([
    `Watch ${ti.nextWatch}.`,
    "Momentum holds at or above the current level.",
    ...(core.ev.sourceBreakdown[0] ? [`Fresh corroboration from a ${core.ev.sourceBreakdown[0].source}-tier source.`] : []),
  ]);

  const warningSignals = uniq([
    ...core.ev.contradictions.map(c => c.detail),
    ...(core.ev.freshnessScore < 50 ? ["Supporting evidence is aging."] : []),
    ...(core.ev.independenceScore < 40 ? ["Few independent sources behind the move."] : []),
  ]);

  const nextLikelyEvents: string[] = [];
  if (np.found && np.terminalNodes.length) nextLikelyEvents.push(`Narrative likely propagates further into ${list(np.terminalNodes.slice(0, 4).map(t => t.label))}.`);
  if (ti.macroDrivers.length) nextLikelyEvents.push(`Confirmation hinges on ${list(ti.macroDrivers.slice(0, 2))}.`);
  if (core.direction === "strengthening" && core.crossSourceCount < 3) nextLikelyEvents.push("Additional source types may confirm as the narrative broadens.");
  if (core.direction === "reversing") nextLikelyEvents.push("Beneficiary names may de-rate if the reversal confirms.");

  const reasoningSteps: PredictionStep[] = [
    { claim: `${node.label} is predicted ${core.direction}`, evidence: `Momentum ${core.momentum}, persistence ${core.persistence}, conviction ${core.conviction}.`, confidence: core.probability, source: "inference" },
    { claim: `Evidence trust ${core.confidence}`, evidence: `${core.ev.verdict} verdict across ${plural(core.crossSourceCount, "source type")}.`, confidence: core.confidence, source: "evidence" },
  ];
  if (core.history.hasHistory) reasoningSteps.push({ claim: "Historical trajectory", evidence: `Conviction delta ${core.history.convictionDelta} over ${plural(core.history.sessions, "session")}.`, confidence: round(clamp01(core.history.sessions / 5) * 100), source: "history" });
  if (np.found) reasoningSteps.push({ claim: "Transmission path intact", evidence: np.explanation, confidence: np.confidence, source: "narrative" });
  if (core.contradiction > 0) reasoningSteps.push({ claim: "Contradictions weigh on the forecast", evidence: list(uniq(core.ev.contradictions.map(c => c.kind.replace(/_/g, " ")))), confidence: core.contradiction, source: "evidence" });

  return {
    found: true, theme: ref(node),
    currentState: `${node.label} is currently ${ti.direction} (confidence ${ti.confidence}, evidence ${core.ev.verdict}).`,
    predictedDirection: core.direction, probability: core.probability, confidence: core.confidence,
    expectedTimeframe: core.timeframe, why, supportingEvidence, invalidationConditions,
    confirmingSignals, warningSignals, nextLikelyEvents, reasoningSteps,
  };
}

/* ------------------------------------------------------------------ *
 * 2 - predictCompanyTrajectory
 * ------------------------------------------------------------------ */

interface ThemeSignal { label: string; momentum: number; trust: number; conviction: number; direction: PredictedDirection }
function quickThemeSignal(idOrLabel: string): ThemeSignal | null {
  const n = G.getNode(idOrLabel);
  if (!n || n.type !== "Theme") return null;
  const ev = evaluateEvidenceForNode(n.id);
  const m = num(n.momentum);
  const dir = m >= 3 ? "strengthening" : m <= -3 ? "weakening" : "stable";
  return { label: n.label, momentum: round(m), trust: ev.overallTrust, conviction: round(num(n.conviction)), direction: dir };
}

export interface CompanyTrajectoryPrediction {
  found:              boolean;
  company:            NodeRef | null;
  exposedThemes:      string[];
  strongestTailwinds: string[];
  strongestHeadwinds: string[];
  expectedDirection:  PredictedDirection;
  probability:        number;
  confidence:         number;
  catalysts:          string[];
  risks:              string[];
  invalidation:       string;
  reasoningSteps:     PredictionStep[];
}

export function predictCompanyTrajectory(idOrLabel: string): CompanyTrajectoryPrediction {
  const node = G.getNode(idOrLabel);
  const ci = node ? inferCompany(node.id) : null;
  const ev = node ? evaluateEvidenceForNode(node.id) : null;
  if (!node || !ci || !ci.found || !ci.activeThemes.length || !ev || !ev.found) {
    return {
      found: false, company: ref(node), exposedThemes: [], strongestTailwinds: [], strongestHeadwinds: [],
      expectedDirection: "insufficient_signal", probability: 0, confidence: 0, catalysts: [], risks: [],
      invalidation: ci?.invalidation ?? "No connected intelligence to forecast.",
      reasoningSteps: [{ claim: `No forecast for ${idOrLabel}`, evidence: node ? "The company has no active theme exposure in the graph." : "The company is not present in the graph.", confidence: 0, source: "graph" }],
    };
  }

  const posSignals = ci.positiveExposures.map(quickThemeSignal).filter(Boolean) as ThemeSignal[];
  const negSignals = ci.negativeExposures.map(quickThemeSignal).filter(Boolean) as ThemeSignal[];

  const tailwinds = posSignals.filter(s => s.direction === "strengthening");
  const headwinds = [...negSignals, ...posSignals.filter(s => s.direction === "weakening")];

  const tailSum = tailwinds.reduce((s, t) => s + Math.max(0, t.momentum) * (t.trust / 100), 0);
  const headSum = headwinds.reduce((s, t) => s + Math.abs(t.momentum) * (t.trust / 100), 0);
  const net = tailSum - headSum;
  const expectedDirection: PredictedDirection = net > 3 ? "strengthening" : net < -3 ? "weakening" : "stable";

  const W = PREDICTION_WEIGHTS.company;
  const mag = clamp01(Math.abs(net) / 15);
  const probability = round(clamp01(mag * W.magnitude + (ev.overallTrust / 100) * W.trust) * 100);

  const strongestTailwinds = tailwinds.sort((a, b) => b.momentum * b.trust - a.momentum * a.trust).map(t => t.label).slice(0, 5);
  const strongestHeadwinds = headwinds.sort((a, b) => Math.abs(b.momentum) * b.trust - Math.abs(a.momentum) * a.trust).map(t => t.label).slice(0, 5);

  const catalysts = uniq([...ci.recentDrivers, ...(strongestTailwinds.length ? [`Continued strength in ${list(strongestTailwinds.slice(0, 2))}`] : [])]);
  const risks = uniq([...strongestHeadwinds.map(h => `Exposure to weakening ${h}`), ...ev.contradictions.map(c => c.detail)]);

  const reasoningSteps: PredictionStep[] = [
    { claim: `${node.label} outlook is ${expectedDirection}`, evidence: `Net theme pull ${round(net)} (tailwinds ${round(tailSum)} vs headwinds ${round(headSum)}).`, confidence: probability, source: "inference" },
    { claim: `Exposed to ${plural(ci.activeThemes.length, "active theme")}`, evidence: list(ci.activeThemes), confidence: ev.overallTrust, source: "cross_market" },
    { claim: `Evidence trust ${ev.overallTrust}`, evidence: `${ev.verdict} verdict on the company node.`, confidence: ev.overallTrust, source: "evidence" },
  ];
  if (strongestTailwinds.length) reasoningSteps.push({ claim: `Tailwinds: ${list(strongestTailwinds)}`, evidence: "Positive exposure to strengthening themes.", confidence: probability, source: "inference" });
  if (strongestHeadwinds.length) reasoningSteps.push({ claim: `Headwinds: ${list(strongestHeadwinds)}`, evidence: "Exposure to weakening or opposing themes.", confidence: probability, source: "inference" });

  return {
    found: true, company: ref(node), exposedThemes: ci.activeThemes, strongestTailwinds, strongestHeadwinds,
    expectedDirection, probability, confidence: ev.overallTrust, catalysts, risks, invalidation: ci.invalidation, reasoningSteps,
  };
}

/* ------------------------------------------------------------------ *
 * 3 - predictSectorRotation
 * ------------------------------------------------------------------ */

export interface SectorRotationPrediction {
  found:               boolean;
  sector:              NodeRef | null;
  currentRotation:     string;
  likelyNextRotation:  string;
  leadingThemes:       string[];
  leadingMacroDrivers: string[];
  companiesBenefiting: string[];
  companiesAtRisk:     string[];
  confidence:          number;
  evidence:            string[];
  reasoningSteps:      PredictionStep[];
}

export function predictSectorRotation(idOrLabel: string): SectorRotationPrediction {
  const node = G.getNode(idOrLabel);
  const si = node ? inferSector(node.id) : null;
  const ev = node ? evaluateEvidenceForNode(node.id) : null;
  if (!node || !si || !si.found || (!si.strengtheningThemes.length && !si.weakeningThemes.length)) {
    return {
      found: false, sector: ref(node), currentRotation: "insufficient_signal", likelyNextRotation: "insufficient_signal",
      leadingThemes: [], leadingMacroDrivers: [], companiesBenefiting: [], companiesAtRisk: [], confidence: 0, evidence: [],
      reasoningSteps: [{ claim: `No rotation forecast for ${idOrLabel}`, evidence: node ? "The sector has no active theme linkage in the graph." : "The sector is not present in the graph.", confidence: 0, source: "graph" }],
    };
  }

  const firming = si.strengtheningThemes.length >= si.weakeningThemes.length;
  const currentRotation = firming
    ? `Capital appears to be rotating into ${node.label}, led by ${list(si.strengtheningThemes)}.`
    : `Capital appears to be rotating out of ${node.label}, pressured by ${list(si.weakeningThemes)}.`;

  // Likely destination: the strongest sector elsewhere in the market (from strongest themes' sectors).
  const market = inferMarketState();
  const leaderSectors = uniq(market.strongestThemes.flatMap(b => {
    const t = G.getNode(b.label);
    return t ? G.getNeighbors(t.id, { direction: "out" }).filter(x => x.node.type === "Sector").map(x => x.node.label) : [];
  })).filter(s => s.toLowerCase() !== node.label.toLowerCase());

  const likelyNextRotation = firming
    ? `If confirmation holds, leadership stays with ${list(si.strengtheningThemes.slice(0, 2))} inside ${node.label}.`
    : leaderSectors.length
    ? `Flow may continue toward ${list(leaderSectors.slice(0, 2))}.`
    : "Direction of the next rotation is not yet distinguishable in the graph.";

  // Companies benefiting vs at risk, read from the sector's strengthening / weakening themes.
  const companiesUnder = (themes: string[]): string[] => uniq(themes.flatMap(label => {
    const t = G.getNode(label);
    return t ? G.getNeighbors(t.id, { direction: "out" }).filter(x => x.node.type === "Company").map(x => x.node.label) : [];
  }));
  const companiesBenefiting = companiesUnder(si.strengtheningThemes).slice(0, 8);
  const companiesAtRisk = companiesUnder(si.weakeningThemes).slice(0, 8);

  const evidence = uniq([
    ...si.dealActivity.map(d => `Deal activity: ${d}`),
    ...(si.listenConfirmation ? ["Confirmed in podcast discussion"] : []),
    ...(si.privateCapitalConfirmation ? ["Private-capital flow present"] : []),
    ...(ev ? ev.sourceBreakdown.slice(0, 2).map(s => `${s.source} (reliability ${s.reliability})`) : []),
  ]);

  const reasoningSteps: PredictionStep[] = [
    { claim: firming ? `${node.label} is firming` : `${node.label} is softening`, evidence: `Strengthening themes ${si.strengtheningThemes.length} vs weakening ${si.weakeningThemes.length}.`, confidence: ev?.overallTrust ?? si.confidence, source: "inference" },
    { claim: "Rotation read", evidence: likelyNextRotation, confidence: ev?.confirmationScore ?? 50, source: "cross_market" },
  ];
  if (si.macroDrivers.length) reasoningSteps.push({ claim: `Macro backdrop: ${list(si.macroDrivers)}`, evidence: "Drivers behind the sector's themes.", confidence: ev?.overallTrust ?? 50, source: "inference" });
  if (evidence.length) reasoningSteps.push({ claim: "Cross-source evidence", evidence: list(evidence), confidence: ev?.confirmationScore ?? 50, source: "evidence" });

  return {
    found: true, sector: ref(node), currentRotation, likelyNextRotation,
    leadingThemes: si.strengtheningThemes, leadingMacroDrivers: si.macroDrivers,
    companiesBenefiting, companiesAtRisk, confidence: ev?.overallTrust ?? si.confidence, evidence, reasoningSteps,
  };
}

/* ------------------------------------------------------------------ *
 * Theme metrics (shared by ranking, market view, inflection points)
 * ------------------------------------------------------------------ */

interface ThemeMetric {
  node:            IntelNode;
  label:           string;
  momentum:        number;
  persistence:     number;
  conviction:      number;
  mentionCount:    number;
  degree:          number;
  crowd:           number;
  evidenceScore:   number;
  evidenceQuality: number;
  confirmation:    number;
  contradiction:   number;
  velocity:        number;   // signed transmission velocity
  reach:           number;
  direction:       PredictedDirection;
  convictionDelta: number;
  macroStrength:   number;   // avg strength of incoming macro drive edges
}

function macroSupportStrength(node: IntelNode): number {
  const incoming = G.getRelationships(node.id, "in").filter(e => e.relationshipType === "drives" && G.getNode(e.source)?.type === "Macro");
  return incoming.length ? round(avg(incoming.map(e => num(e.strength)))) : 0;
}

function allThemeMetrics(): ThemeMetric[] {
  const velocityMap = new Map<string, { velocity: number; reach: number }>();
  for (const r of rankNarratives(500)) velocityMap.set(r.theme.id, { velocity: r.transmissionVelocity, reach: r.crossMarketReach });

  return G.nodesOfType("Theme").map(node => {
    const ev = evaluateEvidenceForNode(node.id);
    const degree = G.getRelationships(node.id).length;
    const v = velocityMap.get(node.id) ?? { velocity: round(num(node.momentum)), reach: 0 };
    const hist = historyTrend(node);
    const m = num(node.momentum);
    return {
      node, label: node.label, momentum: round(m), persistence: round(num(node.persistence)), conviction: round(num(node.conviction)),
      mentionCount: round(num(node.mentionCount)), degree, crowd: round(num(node.mentionCount)) + degree,
      evidenceScore: ev.evidenceScore, evidenceQuality: ev.evidenceQuality, confirmation: ev.confirmationScore, contradiction: ev.contradictionScore,
      velocity: v.velocity, reach: v.reach, direction: directionOf(m, hist.convictionDelta, ev.contradictionScore),
      convictionDelta: hist.convictionDelta, macroStrength: macroSupportStrength(node),
    };
  });
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/* ------------------------------------------------------------------ *
 * 5 - rankFutureOpportunities  /  6 - rankFutureRisks
 * ------------------------------------------------------------------ */

export interface FutureOpportunity {
  theme:                 NodeRef;
  score:                 number;
  expectedUpside:        number;
  evidenceQuality:       number;
  transmissionVelocity:  number;
  crossMarketConfirmation: number;
  conviction:            number;
  why:                   string[];
}

export function rankFutureOpportunities(limit = 10): FutureOpportunity[] {
  const W = PREDICTION_WEIGHTS.opportunity;
  return allThemeMetrics()
    .filter(m => m.evidenceScore > 0)
    .map(m => {
      const upside = clamp01((Math.max(0, m.momentum) / 12) * 0.6 + (m.conviction / 100) * 0.4);
      const velocity = clamp01(Math.max(0, m.velocity) / 12);
      const cross = clamp01(m.confirmation / 100);
      const quality = clamp01(m.evidenceQuality / 100);
      const conviction = clamp01(m.conviction / 100);
      const score = round(clamp01(upside * W.upside + quality * W.evidenceQuality + velocity * W.velocity + cross * W.crossConfirm + conviction * W.conviction) * 100);
      const why = [
        `Upside from momentum ${m.momentum} and conviction ${m.conviction}.`,
        `Evidence quality ${m.evidenceQuality}, confirmation ${m.confirmation}.`,
        `Transmission velocity ${m.velocity}.`,
      ];
      return { theme: ref(m.node)!, score, expectedUpside: round(upside * 100), evidenceQuality: m.evidenceQuality, transmissionVelocity: m.velocity, crossMarketConfirmation: m.confirmation, conviction: m.conviction, why };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export interface FutureRisk {
  theme:            NodeRef;
  score:            number;
  downsideMomentum: number;
  contradiction:    number;
  crowding:         number;
  evidenceScore:    number;
  why:              string[];
}

export function rankFutureRisks(limit = 10): FutureRisk[] {
  const W = PREDICTION_WEIGHTS.risk;
  const metrics = allThemeMetrics().filter(m => m.evidenceScore > 0);
  const maxCrowd = Math.max(1, ...metrics.map(m => m.crowd));
  return metrics
    .map(m => {
      const downside = clamp01(Math.max(0, -m.momentum) / 12);
      const contradiction = clamp01(m.contradiction / 100);
      const crowding = clamp01(m.crowd / maxCrowd);
      const lowEvidence = clamp01(1 - m.evidenceScore / 100);
      const weakening = m.direction === "weakening" || m.direction === "reversing" ? 1 : 0;
      const score = round(clamp01(downside * W.downside + contradiction * W.contradiction + crowding * W.crowding + lowEvidence * W.lowEvidence + weakening * W.weakening) * 100);
      const why = [
        m.momentum < 0 ? `Negative momentum ${m.momentum}.` : `Momentum ${m.momentum}, direction ${m.direction}.`,
        m.contradiction > 0 ? `Contradiction pressure ${m.contradiction}.` : "No direct contradictions, risk is positioning based.",
        `Crowding ${m.crowd} (mentions ${m.mentionCount}, degree ${m.degree}).`,
      ];
      return { theme: ref(m.node)!, score, downsideMomentum: m.momentum, contradiction: m.contradiction, crowding: m.crowd, evidenceScore: m.evidenceScore, why };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * 7 - detectInflectionPoints
 * ------------------------------------------------------------------ */

export interface InflectionPoint {
  theme:         NodeRef;
  readiness:     number;
  evidenceScore: number;
  momentum:      number;
  persistence:   number;
  crowding:      number;
  macroStrength: number;
  reason:        string;
}

export function detectInflectionPoints(limit = 8): InflectionPoint[] {
  const metrics = allThemeMetrics();
  if (!metrics.length) return [];
  const crowdMedian = median(metrics.map(m => m.crowd));

  return metrics
    .filter(m =>
      m.evidenceScore >= 55 &&
      (m.momentum >= 3 || m.convictionDelta >= 4) &&
      m.crowd <= crowdMedian &&
      m.persistence >= 55 &&
      m.macroStrength >= 55)
    .map(m => {
      const readiness = round(clamp01(
        (m.evidenceScore / 100) * 0.3 +
        clamp01(Math.max(m.momentum, m.convictionDelta) / 10) * 0.3 +
        (m.persistence / 100) * 0.2 +
        (m.macroStrength / 100) * 0.2,
      ) * 100);
      const reason = `High evidence (${m.evidenceScore}), rising signal (momentum ${m.momentum}, conviction delta ${m.convictionDelta}), low crowding (${m.crowd} vs median ${round(crowdMedian)}), persistence ${m.persistence}, macro support ${m.macroStrength}.`;
      return { theme: ref(m.node)!, readiness, evidenceScore: m.evidenceScore, momentum: m.momentum, persistence: m.persistence, crowding: m.crowd, macroStrength: m.macroStrength, reason };
    })
    .sort((a, b) => b.readiness - a.readiness)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * 4 - predictMarketEvolution
 * ------------------------------------------------------------------ */

export interface LabeledProbability { label: string; probability: number }
export interface LabeledReason { label: string; reason: string }

export interface MarketEvolutionPrediction {
  found:                     boolean;
  mostLikelyStrengthening:   LabeledProbability[];
  mostLikelyWeakening:       LabeledProbability[];
  emergingNarratives:        string[];
  crowdedNarratives:         string[];
  potentialReversals:        LabeledReason[];
  topOpportunities:          string[];
  largestRisks:              string[];
  morningBriefForecast:      string[];
}

export function predictMarketEvolution(): MarketEvolutionPrediction {
  const metrics = allThemeMetrics();
  if (!metrics.length) return {
    found: false, mostLikelyStrengthening: [], mostLikelyWeakening: [], emergingNarratives: [], crowdedNarratives: [],
    potentialReversals: [], topOpportunities: [], largestRisks: [],
    morningBriefForecast: ["Insufficient signal across the market to forecast."],
  };

  const probFor = (m: ThemeMetric): number => predictThemeTrajectory(m.node.id).probability;

  const mostLikelyStrengthening = metrics.filter(m => m.direction === "strengthening")
    .map(m => ({ label: m.label, probability: probFor(m) })).sort((a, b) => b.probability - a.probability).slice(0, 5);
  const mostLikelyWeakening = metrics.filter(m => m.direction === "weakening" || m.direction === "reversing")
    .map(m => ({ label: m.label, probability: probFor(m) })).sort((a, b) => b.probability - a.probability).slice(0, 5);

  const emerging = detectEmergingNarratives();
  const emergingNarratives = emerging.map(e => `${e.theme.label}: ${e.reason}`);
  const crowdMedian = median(metrics.map(m => m.crowd));
  const crowdedNarratives = [...metrics].sort((a, b) => b.crowd - a.crowd).slice(0, 5).map(m => `${m.label} (crowd ${m.crowd})`);

  const potentialReversals: LabeledReason[] = metrics
    .filter(m => (m.crowd > crowdMedian && m.momentum < 3) || m.contradiction >= 55 || (m.convictionDelta <= -6 && m.momentum <= 0))
    .map(m => ({ label: m.label, reason: m.contradiction >= 55 ? `Contradiction pressure ${m.contradiction} with momentum ${m.momentum}.` : `Crowded (${m.crowd}) while momentum cools to ${m.momentum}.` }))
    .slice(0, 5);

  const topOpportunities = rankFutureOpportunities(5).map(o => `${o.theme.label} (score ${o.score})`);
  const largestRisks = rankFutureRisks(5).map(r => `${r.theme.label} (score ${r.score})`);
  const inflections = detectInflectionPoints(3);

  const morningBriefForecast: string[] = [];
  if (mostLikelyStrengthening.length) morningBriefForecast.push(`Most likely to strengthen: ${mostLikelyStrengthening.map(t => `${t.label} (${t.probability})`).join(", ")}.`);
  if (mostLikelyWeakening.length) morningBriefForecast.push(`Most likely to weaken: ${mostLikelyWeakening.map(t => `${t.label} (${t.probability})`).join(", ")}.`);
  if (inflections.length) morningBriefForecast.push(`Watch for acceleration: ${inflections.map(i => i.theme.label).join(", ")}.`);
  if (potentialReversals.length) morningBriefForecast.push(`Reversal risk: ${potentialReversals.map(r => r.label).join(", ")}.`);
  if (emerging.length) morningBriefForecast.push(`Emerging: ${emerging.map(e => e.theme.label).join(", ")}.`);
  if (!morningBriefForecast.length) morningBriefForecast.push("No decisive forward signal in the graph yet.");

  return {
    found: true, mostLikelyStrengthening, mostLikelyWeakening, emergingNarratives, crowdedNarratives,
    potentialReversals, topOpportunities, largestRisks, morningBriefForecast,
  };
}

/* ------------------------------------------------------------------ *
 * 8 - debugPrediction
 * ------------------------------------------------------------------ */

export interface DebugPrediction {
  resolvedNode:       { id: string; label: string; type: NodeType } | null;
  weightings:         typeof PREDICTION_WEIGHTS;
  scoreComponents:    Record<string, number>;
  relationshipsUsed:  Array<{ source: string; relationship: string; target: string; strength: number }>;
  inferencesUsed:     string[];
  evidenceItemsUsed:  Array<{ source: string; reliability: number; relationship: string }>;
  finalProbability:   number;
  finalConfidence:    number;
}

export function debugPrediction(idOrLabel: string): DebugPrediction {
  const node = G.getNode(idOrLabel);
  if (!node) return {
    resolvedNode: null, weightings: PREDICTION_WEIGHTS, scoreComponents: {}, relationshipsUsed: [],
    inferencesUsed: [], evidenceItemsUsed: [], finalProbability: 0, finalConfidence: 0,
  };

  const ev = evaluateEvidenceForNode(node.id);
  const relationshipsUsed = G.getRelationships(node.id).map((e: IntelEdge) => ({
    source: G.getNode(e.source)?.label ?? e.source, relationship: e.relationshipType,
    target: G.getNode(e.target)?.label ?? e.target, strength: e.strength,
  }));
  const evidenceItemsUsed = ev.supportingEvidence.map(i => ({ source: i.sourceName ?? i.type, reliability: i.reliability, relationship: i.relationship }));

  let finalProbability = 0, finalConfidence = 0;
  const inferencesUsed: string[] = [];
  const scoreComponents: Record<string, number> = {
    momentum: round(num(node.momentum)), persistence: round(num(node.persistence)), conviction: round(num(node.conviction)),
    evidenceScore: ev.evidenceScore, evidenceQuality: ev.evidenceQuality, confirmation: ev.confirmationScore,
    contradiction: ev.contradictionScore, freshness: ev.freshnessScore, independence: ev.independenceScore,
  };

  if (node.type === "Company") {
    const p = predictCompanyTrajectory(node.id);
    inferencesUsed.push("inferCompany", "evaluateEvidenceForNode");
    finalProbability = p.probability; finalConfidence = p.confidence;
  } else if (node.type === "Sector") {
    const p = predictSectorRotation(node.id);
    inferencesUsed.push("inferSector", "inferMarketState", "evaluateEvidenceForNode");
    finalProbability = p.confidence; finalConfidence = p.confidence;
  } else {
    const core = themeCore(node.id);
    const p = predictThemeTrajectory(node.id);
    inferencesUsed.push("inferTheme", "buildNarrativePath", "evaluateEvidenceForNode");
    finalProbability = p.probability; finalConfidence = p.confidence;
    scoreComponents.crossSourceCount = core.crossSourceCount;
    scoreComponents.historyConvictionDelta = core.history.convictionDelta;
  }

  return {
    resolvedNode: { id: node.id, label: node.label, type: node.type },
    weightings: PREDICTION_WEIGHTS, scoreComponents, relationshipsUsed, inferencesUsed, evidenceItemsUsed,
    finalProbability, finalConfidence,
  };
}
