// lib/workstationView.ts — the Workstation's canonical View Model (Surface #7). The Workstation
// is the product's INTERROGATION surface: "How do I investigate this view?" Its centerpiece is
// the INVESTIGATION THREAD (the case), the graph is its exhibit, the ledger its historical
// record. Two states: a Docket ("what's worth investigating?") and a Case (a seven-beat thread).
//
// This is a PURE orchestrator: it translates the existing engines (IntelligenceProfile, causal
// map, evidence, prediction, memory) into DESCRIPTORS. It never exposes React / SVG / canvas /
// CSS / component names / hook names — exactly the Event/Company/Market/Drawer pattern.
//
// WORKSTATION LAW: no beat may answer a question another surface owns (Feed=what happened,
// Event=why, Market=how it's changing, Company=what I know, Evidence=what supports it). The
// Workstation only INVESTIGATES a view. The seven-beat order is frozen grammar.

import type { IntelligenceProfile } from "./intelligenceProfile";
import type { ThemeIntelligence } from "./types";

export type BeatId = "hypothesis" | "transmission" | "evidence" | "support" | "breaks" | "history" | "watch";
export type BeatStatus = "present" | "insufficient";
export type SupportLevel = "Strong" | "Moderate" | "Thin" | "Insufficient";

export interface DocketItem { id: string; kind: string; label: string; reason: string }

export interface Hypothesis { statement: string; basis: string | null }
export interface TransmissionExhibit {
  reading: string;                                   // one plain line reading the dominant chain
  primaryChain: string[];                            // strongest path — the graph's INITIAL reveal
  stages: { caption: string; entities: string[] }[]; // full stages — revealed as evidence is read
  weakLinks: string[];                               // links to highlight at "what breaks it"
}
export interface EvidenceLink { link: string; sources: number; strength: "strong" | "moderate" | "thin"; outlets: string[] }
export interface EvidenceBeat { links: EvidenceLink[]; independentSources: number }
export interface Support { level: SupportLevel; supports: string[]; against: string[] }
export interface BreakConditions { invalidation: string | null; conflicts: string[] }
export interface HistoricalRecord {
  gated: boolean;
  counts: { open: number; resolved: number; confirmed: number; contradicted: number } | null;
  note: string;                                      // credibility-gate language, always present
}
export interface Watch { items: string[] }

export interface Beat<T> { id: BeatId; question: string; status: BeatStatus; data: T | null; transitionToNext: string | null }

export interface WorkstationView {
  mode: "docket" | "case";
  docket: DocketItem[];
  header: { label: string; kindLabel: string } | null;
  beats: [
    Beat<Hypothesis>, Beat<TransmissionExhibit>, Beat<EvidenceBeat>, Beat<Support>,
    Beat<BreakConditions>, Beat<HistoricalRecord>, Beat<Watch>,
  ] | null;
}

export interface LedgerCounts { open: number; resolved: number; confirmed: number; contradicted: number }
export interface WorkstationInputs {
  subject: { kind: string; id: string; label: string } | null;   // null => docket
  profile: IntelligenceProfile | null;
  ledger: LedgerCounts | null;                                    // outcome ledger; gated when absent
  themes: ThemeIntelligence[];
}

// The frozen seven-beat grammar: each beat's unique question, and the tiny transition that
// carries the reader to the next beat so the case reads continuously (like turning pages).
const QUESTION: Record<BeatId, string> = {
  hypothesis: "What is Argus currently testing?",
  transmission: "By what mechanism would it be true?",
  evidence: "What proves each link, and how good are the sources?",
  support: "How much supports this view?",
  breaks: "Where does it fail?",
  history: "How has reasoning like this performed?",
  watch: "What should I watch next?",
};
const TRANSITION: Record<Exclude<BeatId, "watch">, string> = {
  hypothesis: "Testing that hypothesis",
  transmission: "Looking for what proves it",
  evidence: "Weighing that evidence",
  support: "Stress-testing it",
  breaks: "Checking the record",
  history: "Looking ahead",
};

const KIND_LABEL: Record<string, string> = {
  theme: "Market theme", narrative: "Market theme", sector: "Sector", driver: "Market force", etf: "ETF",
};
const cleanName = (s: string): string => s.replace(/^(the|a)\s+/i, "").trim();
const present = <T>(data: T | null): BeatStatus => (data != null ? "present" : "insufficient");

// ── Docket ("what's worth investigating?") ────────────────────────────────────
const DOCKET_REASON = (t: ThemeIntelligence): string => {
  const m = t.momentum_label;
  if (t.signal_quality === "speculative") return "contested";
  if (m === "accelerating" || m === "strengthening") return "gaining ground";
  if (m === "cooling" || m === "reversing") return "losing ground";
  if (m === "emerging") return "newly emerging";
  return "developing";
};
export function buildDocket(themes: ThemeIntelligence[]): DocketItem[] {
  return [...themes]
    .sort((a, b) => Math.abs(b.momentum_delta ?? 0) - Math.abs(a.momentum_delta ?? 0))
    .slice(0, 8)
    .map((t) => ({ id: t.id, kind: "theme", label: cleanName(t.name), reason: DOCKET_REASON(t) }));
}

export function buildCaseHeader(subject: WorkstationInputs["subject"]): { label: string; kindLabel: string } | null {
  return subject ? { label: subject.label, kindLabel: KIND_LABEL[subject.kind] ?? "Subject" } : null;
}

// ── Beat builders (each reads one profile section; honest absence when unavailable) ──
export function buildHypothesis(p: IntelligenceProfile | null): Hypothesis | null {
  if (!p || p.thesis.status === "unavailable" || !p.thesis.data) return null;
  const statement = p.thesis.data.headline ?? (p.identity.data ? p.identity.data.label : null);
  if (!statement) return null;
  const basis = p.identity.status !== "unavailable" && p.identity.data?.description ? firstSentence(p.identity.data.description) : null;
  return { statement, basis };
}

export function buildTransmission(p: IntelligenceProfile | null): TransmissionExhibit | null {
  if (!p || p.transmission.status === "unavailable" || !p.transmission.data) return null;
  const t = p.transmission.data;
  const path = t.strongestPath ?? [];
  const weakLinks = p.risks.status !== "unavailable" && p.risks.data ? p.risks.data.weakening.map((w) => w.label) : [];
  const reading = path.length >= 2 ? `${path[0]} leads through to ${path[path.length - 1]}.` : "The mechanism is still forming.";
  return {
    reading,
    primaryChain: path,
    stages: (t.stages ?? []).map((s) => ({ caption: s.caption, entities: s.entities })),
    weakLinks,
  };
}

export function buildEvidence(p: IntelligenceProfile | null): EvidenceBeat | null {
  if (!p || p.evidence.status === "unavailable" || !p.evidence.data) return null;
  const e = p.evidence.data;
  const links: EvidenceLink[] = e.supporting.slice(0, 6).map((s) => {
    const n = new Set(s.pages ?? []).size;
    return { link: s.from, sources: n, strength: n >= 3 ? "strong" : n === 2 ? "moderate" : "thin", outlets: (s.pages ?? []).slice(0, 4) };
  });
  const independentSources = new Set(e.supporting.flatMap((s) => s.pages ?? [])).size;
  return links.length ? { links, independentSources } : null;
}

// "How much SUPPORTS this view?" — support only, decomposed. No score, no "confidence".
export function buildSupport(p: IntelligenceProfile | null): Support | null {
  if (!p || p.evidence.status === "unavailable" || !p.evidence.data) return null;
  const e = p.evidence.data;
  const risks = p.risks.status !== "unavailable" ? p.risks.data : null;
  const evo = p.evolution.status !== "unavailable" ? p.evolution.data : null;
  const independent = new Set(e.supporting.flatMap((s) => s.pages ?? [])).size;
  const links = e.supporting.length;
  const contradictions = risks?.contradictions.length ?? 0;

  const supports: string[] = [];
  if (independent >= 1) supports.push(`${independent} independent ${independent === 1 ? "source" : "sources"}`);
  if (links >= 2) supports.push(`corroborated across ${links} links in the chain`);
  const against: string[] = [];
  if (contradictions > 0) against.push(`${contradictions === 1 ? "an unresolved contradiction" : `${contradictions} unresolved contradictions`}`);
  if (e.supporting.some((s) => new Set(s.pages ?? []).size <= 1)) against.push("one link rests on a single source");
  if (evo && evo.sessions < 3) against.push("limited historical precedent");

  const level: SupportLevel = independent >= 3 && contradictions === 0 ? "Strong"
    : independent >= 2 ? "Moderate" : independent >= 1 ? "Thin" : "Insufficient";
  return { level, supports, against };
}

export function buildBreakConditions(p: IntelligenceProfile | null): BreakConditions | null {
  if (!p || p.risks.status === "unavailable" || !p.risks.data) return null;
  const r = p.risks.data;
  const conflicts: string[] = [
    ...r.weakening.map((w) => `${w.label} could weaken the chain.`),
    ...r.contradictions.map((c) => c.detail),
  ].slice(0, 5);
  if (!r.invalidation && conflicts.length === 0) return null;
  return { invalidation: r.invalidation, conflicts };
}

// The accountability record for reasoning LIKE THIS. Credibility-gated: no accuracy claim
// until enough predictions have resolved. Honest gate is always shown.
export function buildHistoricalRecord(ledger: LedgerCounts | null): HistoricalRecord {
  if (!ledger || ledger.resolved < 10) {
    return { gated: true, counts: ledger, note: "Not yet enough resolved predictions of this kind to claim accuracy. Shown for context, not proof." };
  }
  return { gated: false, counts: ledger, note: "Track record of resolved predictions of this kind." };
}

export function buildWatch(p: IntelligenceProfile | null): Watch | null {
  if (!p || p.watch.status === "unavailable" || !p.watch.data) return null;
  const items = p.watch.data.items.slice(0, 4);
  return items.length ? { items } : null;
}

function firstSentence(text: string): string {
  const clean = (text ?? "").trim();
  const m = clean.match(/^[\s\S]*?[.!?](?=\s+[A-Z]|\s*$)/);
  return (m ? m[0] : clean).trim();
}

function beat<T>(id: BeatId, data: T | null): Beat<T> {
  return { id, question: QUESTION[id], status: present(data), data, transitionToNext: id === "watch" ? null : TRANSITION[id] };
}

// ── orchestrator: compose the docket or the seven-beat case ───────────────────
export function buildWorkstationView(input: WorkstationInputs): WorkstationView {
  if (!input.subject) {
    return { mode: "docket", docket: buildDocket(input.themes), header: null, beats: null };
  }
  const p = input.profile;
  return {
    mode: "case",
    docket: [],
    header: buildCaseHeader(input.subject),
    beats: [
      beat("hypothesis", buildHypothesis(p)),
      beat("transmission", buildTransmission(p)),
      beat("evidence", buildEvidence(p)),
      beat("support", buildSupport(p)),
      beat("breaks", buildBreakConditions(p)),
      beat("history", buildHistoricalRecord(input.ledger)),
      beat("watch", buildWatch(p)),
    ],
  };
}
