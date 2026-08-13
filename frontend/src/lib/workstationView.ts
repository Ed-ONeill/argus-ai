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
import type { SectorForwardView } from "./sectorForward";
import type { ThemeIntelligence } from "./types";
import { num } from "./intelligenceUtils";

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
  /** RC2-G5: the Industry whose recorded profile produced this chain, when the
   *  subject is a Sector. The chain ends AT the industry; the structural
   *  Industry -> Sector hop is membership and is never rendered as a link. */
  viaIndustry: string | null;
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
  /** RC2-G5: profiles of the carrying INDUSTRIES, keyed by lower-cased industry
   *  name. A Sector cannot see its own macro head - it sits three hops away
   *  through the structural belongs_to edge - so the chain is taken from the
   *  industry that actually carries it (the same source RC2-G4 gave Industries).
   *  Optional: absent falls back to the subject's own recorded path. */
  industryProfiles?: Map<string, IntelligenceProfile>;
  /** RC2-G5: the canonical forward projection for a Sector subject (RC2-G2). */
  forward?: SectorForwardView | null;
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
export function buildHypothesis(
  p: IntelligenceProfile | null,
  ctx?: { forward?: SectorForwardView | null; chain?: string[] | null; viaIndustry?: string | null } | null,
): Hypothesis | null {
  const label = p && p.identity.status !== "unavailable" ? p.identity.data?.label ?? null : null;
  const thesis = p && p.thesis.status !== "unavailable" ? p.thesis.data : null;
  const headline = thesis?.headline ?? null;
  const fwd = thesis?.forward ?? null;

  // 1. A recorded narrative IS a stated hypothesis and always wins.
  if (headline) {
    const basis = p && p.identity.status !== "unavailable" && p.identity.data?.description
      ? firstSentence(p.identity.data.description) : null;
    return { statement: headline, basis };
  }

  // RC2-G5.1: the bare-label fallback is GONE. `p.thesis.data.headline ?? identity.label`
  // returned the subject's own name - "Energy" - as the hypothesis whenever a Sector had a
  // recorded forward view but no injected narrative, and returned EARLY, pre-empting the
  // composition below. A subject label by itself is never a hypothesis.
  //
  // The recorded forward is still real intelligence, so it is carried as a clause rather
  // than discarded. confidence 0 is reported as NOT ESTABLISHED, never as conviction.
  const fwdClause = fwd
    ? `Recorded rotation: ${fwd.direction}${num(fwd.confidence) > 0
        ? ` (confidence ${Math.round(num(fwd.confidence))})`
        : " (confidence not established)"}.`
    : null;

  // 2. Compose from the two canonical projections: the recorded chain and the
  //    RC2-G2 forward state. Recorded fields only - no inference, no scoring.
  const f = ctx?.forward ?? null;
  const chain = ctx?.chain ?? null;
  if (f && f.exposure.length > 0) {
    const lead = f.exposure[0];
    const via = ctx?.viaIndustry ?? lead.viaIndustry;
    const statement = `Testing whether ${lead.theme}, carried through ${via}, shows up in ${f.sector} leadership.`;
    const support = `${f.exposure.length} recorded theme${f.exposure.length === 1 ? "" : "s"}${lead.signalQuality ? `, lead support ${lead.signalQuality}` : ""}`;
    const price =
      f.reconciliation === "confirmed" ? "price confirms it"
      : f.reconciliation === "divergent" ? "price disagrees"
      : f.reconciliation === "price-only" ? "no established thematic direction yet"
      : f.price.direction === "unavailable" ? "no price confirmation available"
      : "no directional price evidence";
    const head = chain && chain.length >= 2 ? `${chain[0]} -> ${chain[chain.length - 1]}. ` : "";
    return { statement, basis: `${head}${support}; ${price}.${fwdClause ? ` ${fwdClause}` : ""}` };
  }

  // 3. No canonical exposure, but a recorded forward direction exists: state THAT,
  //    which is a recorded fact, rather than the subject's name.
  if (fwd && label) {
    return { statement: `Testing whether ${label} keeps ${fwd.direction}.`, basis: fwdClause };
  }

  // 4. Nothing recorded to test - stay honestly insufficient.
  return null;
}

export function buildTransmission(
  p: IntelligenceProfile | null,
  carrying?: { profile: IntelligenceProfile; industry: string } | null,
  subjectLabel?: string | null,
): TransmissionExhibit | null {
  // RC2-G5: prefer the CARRYING INDUSTRY's recorded chain. Reading the Sector's
  // own path collapsed "Power Load Growth -> Grid Bottleneck Trade ->
  // Semiconductors" into "Grid Bottleneck Trade -> Technology", losing both the
  // macro head and the industry that carries the exposure.
  const src = carrying?.profile ?? p;
  if (!src || src.transmission.status === "unavailable" || !src.transmission.data) return null;
  const t = src.transmission.data;
  const path = t.strongestPath ?? [];
  // Weak links stay the SUBJECT's own recorded risks, never the industry's.
  const weakLinks = p && p.risks.status !== "unavailable" && p.risks.data ? p.risks.data.weakening.map((w) => w.label) : [];
  const via = carrying?.industry ?? null;
  // RC2-G5.1: the clause is only worth showing when it names something the sentence
  // does not already contain. The chain TERMINATES at the carrying industry by
  // design, so "leads through to Semiconductors, carried by Semiconductors" is
  // always redundant, and Industry("Energy") vs Sector("Energy") made it read
  // circular as well. Suppress the VISIBLE clause whenever the carrier is already
  // on screen (either end of the rendered path) or is the subject itself.
  // `viaIndustry` below is UNCHANGED, so typed provenance survives for every
  // consumer - this is presentation only.
  const shown = new Set([path[0], path[path.length - 1], subjectLabel ?? ""]);
  const showVia = via !== null && !shown.has(via);
  const reading = path.length >= 2
    ? `${path[0]} leads through to ${path[path.length - 1]}${showVia ? `, carried by ${via}` : ""}.`
    : "The mechanism is still forming.";
  return {
    reading,
    primaryChain: path,
    stages: (t.stages ?? []).map((s) => ({ caption: s.caption, entities: s.entities })),
    weakLinks,
    viaIndustry: via,
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
  // RC2-G5: pick the carrying industry deterministically - the forward
  // projection's own canonical order, first one with a recorded chain.
  const carrying = (() => {
    const profiles = input.industryProfiles;
    const order = input.forward?.carryingIndustries ?? [];
    if (!profiles || order.length === 0) return null;
    for (const ind of order) {
      const ip = profiles.get(ind.toLowerCase());
      if ((ip?.transmission.data?.strongestPath ?? []).length >= 2) return { profile: ip!, industry: ind };
    }
    return null;
  })();
  return {
    mode: "case",
    docket: [],
    header: buildCaseHeader(input.subject),
    beats: [
      beat("hypothesis", buildHypothesis(p, { forward: input.forward ?? null, chain: carrying?.profile.transmission.data?.strongestPath ?? p?.transmission.data?.strongestPath ?? null, viaIndustry: carrying?.industry ?? null })),
      beat("transmission", buildTransmission(p, carrying, input.subject.label)),
      beat("evidence", buildEvidence(p)),
      beat("support", buildSupport(p)),
      beat("breaks", buildBreakConditions(p)),
      beat("history", buildHistoricalRecord(input.ledger)),
      beat("watch", buildWatch(p)),
    ],
  };
}
