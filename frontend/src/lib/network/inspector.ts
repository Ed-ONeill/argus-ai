/**
 * lib/network/inspector.ts — the Intelligence Inspector dossier (M4.3A).
 *
 * PURE PROJECTION (Design Bible 4A/4B): one DossierVM shape serves both
 * inspector states — the dominant thesis at rest, a selected entity when the
 * graph navigates. Sections follow the canonical dossier order (identity →
 * why → transmission → exposure → memory → ledger → watch), which is the
 * Answer Order rule rendered as a document. Every field is read from records
 * other modules own:
 *
 *   ReadVM / MarketStoryVM        dominant thesis, whyDominant, coherence,
 *                                 evidence, falsifiers (canonical reads)
 *   NetworkModel                  chains, exposure, drivers (the projection)
 *   theme.memory (ThemeMemory)    sessions, first seen, peaks, confirmations
 *   HistoricalContext (M3.4)      analog maturity — gated states verbatim
 *   CalibrationStatus (M3.3)      platform self-measurement
 *   PredictionRow[] (M3.3)        per-entity ledger items
 *
 * Voice: every string here obeys Part 4B — numbers over adjectives, absence
 * stated plainly, no hedging fog, falsifiers as the closing section.
 */

import type { ReadVM } from "@/lib/theRead";
import type { MarketStoryVM } from "@/lib/feedNarrative";
import type { ThemeIntelligence } from "@/lib/types";
import type { HistoricalContext, CalibrationStatus, PredictionRow } from "@/lib/api";
import { themeWatch } from "@/lib/themeTransmission";
import { cleanThemeName } from "@/app/markets/marketsShared";
import type { NetworkModel, NetworkNode, ChainHop } from "./model";
import { representativeChain, themeNodeId } from "./model";
import { focalNodeId } from "./layout";

// ── section view models ─────────────────────────────────────────────────────────

export interface DossierIdentity {
  eyebrow: string;                    // "DOMINANT NARRATIVE" / "THEME · BULLISH" / …
  title: string;
  figure: { label: string; value: number } | null;   // CONVICTION 78 / COHERENCE 71
  delta: number | null;
  stateLine: string | null;           // momentum · breadth · regime
  archiveLine: string | null;         // tenure, from ThemeMemory only
}

export interface ReasoningRow { kind: "driver" | "evidence" | "memory" | "structure"; text: string }

export interface ExposureItem { id: string | null; label: string; direction?: string }

export interface InspectorMemoryVM {
  state: "ok" | "accruing" | "none" | "unavailable";
  firstSeen: string | null;
  sessions: number | null;
  peak: number | null;
  trough: number | null;
  maturityLine: string;
}

export interface LedgerItem { statement: string; status: string }
export interface InspectorLedgerVM {
  state: "active" | "empty" | "disabled" | "unavailable";
  line: string;
  gateNote: string | null;
  items: LedgerItem[];
}

export interface DossierVM {
  scope: "dominant" | "entity";
  identity: DossierIdentity;
  lead: string | null;
  reasoning: ReasoningRow[];
  chain: ChainHop[];
  exposure: { industries: ExposureItem[]; companies: ExposureItem[] } | null;
  memory: InspectorMemoryVM;
  ledger: InspectorLedgerVM;
  watch: string[];
}

// ── shared assemblers ───────────────────────────────────────────────────────────

function memoryVM(theme: ThemeIntelligence | null,
                  ctx: HistoricalContext | null | undefined): InspectorMemoryVM {
  const mem = theme?.memory;
  const base = {
    firstSeen: mem?.first_seen ?? null,
    sessions: typeof mem?.sessions_observed === "number" ? mem.sessions_observed : null,
    peak: typeof mem?.conviction_peak === "number" ? mem.conviction_peak : null,
    trough: typeof mem?.conviction_trough === "number" ? mem.conviction_trough : null,
  };
  if (theme && !mem) {
    return { ...base, state: "none",
             maturityLine: "No cross-session memory for this theme yet — first cycle on record." };
  }
  if (ctx === undefined || ctx === null) {
    return { ...base, state: "unavailable",
             maturityLine: "Institutional memory service unreachable — history not shown." };
  }
  if (ctx.status === "insufficient_history") {
    const gate = ctx.credibility?.gates?.min_archive_days;
    return { ...base, state: "accruing",
             maturityLine: gate
               ? `Institutional history accruing: ${gate.actual} of ${gate.required} required archive days.`
               : "Institutional history accruing — analog reasoning unlocks when the credibility gates pass." };
  }
  if (ctx.status === "no_subject_history") {
    return { ...base, state: "none",
             maturityLine: "No sealed institutional history for this subject yet." };
  }
  const n = ctx.episodes?.length ?? 0;
  return { ...base, state: "ok",
           maturityLine: n > 0
             ? `${n} similar historical episode${n > 1 ? "s" : ""} on record.`
             : "Credibility gates passed — no sufficiently similar historical episodes." };
}

function ledgerVM(cal: CalibrationStatus | null | undefined,
                  rows: PredictionRow[] | null | undefined): InspectorLedgerVM {
  const items: LedgerItem[] = (rows ?? []).slice(0, 3)
    .map(r => ({ statement: r.statement, status: r.status }));
  if (cal === undefined || cal === null) {
    return { state: "unavailable", line: "Prediction ledger unreachable.", gateNote: null, items };
  }
  if (!cal.ledger_enabled) {
    return { state: "disabled", line: "Prediction ledger not yet active for this deployment.",
             gateNote: null, items };
  }
  const open = cal.open_predictions ?? 0;
  const o = cal.overall;
  if (!o || (o.sample_size === 0 && open === 0)) {
    return { state: "empty", gateNote: null, items,
             line: "Ledger active — first structural predictions pending resolution." };
  }
  const v = o.by_verdict ?? {};
  const bits = [
    `${open} open`, `${o.tested} resolved`,
    v.confirmed ? `${v.confirmed} confirmed` : null,
    v.contradicted ? `${v.contradicted} contradicted` : null,
    v.invalidated ? `${v.invalidated} invalidated` : null,
  ].filter(Boolean);
  return {
    state: "active", items, line: bits.join(" · "),
    gateNote: o.credible ? null
      : "Diagnostics only — credibility gates not yet met; no accuracy claim.",
  };
}

function exposureFromModel(model: NetworkModel, fromIds: string[]):
  { industries: ExposureItem[]; companies: ExposureItem[] } | null {
  const byId = new Map(model.nodes.map(n => [n.id, n]));
  const industries = new Map<string, ExposureItem>();
  const companies = new Map<string, ExposureItem>();
  const seen = new Set(fromIds);
  const queue = [...fromIds];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of model.edges.filter(e => e.source === id)) {
      const n = byId.get(e.target);
      if (!n || seen.has(n.id)) continue;
      seen.add(n.id);
      if (n.cls === "industry") { industries.set(n.id, { id: n.id, label: n.label, direction: n.direction }); queue.push(n.id); }
      else if (n.cls === "asset") companies.set(n.id, { id: n.id, label: n.ticker ?? n.label, direction: n.direction });
      else queue.push(n.id);
    }
  }
  if (!industries.size && !companies.size) return null;
  return { industries: [...industries.values()].slice(0, 5),
           companies: [...companies.values()].slice(0, 6) };
}

/** Canonical institutional UID for the M3 read APIs, per entity class. */
export function entityUid(node: NetworkNode, themes: ThemeIntelligence[]): string | null {
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (node.cls === "theme") {
    const t = themes.find(t => cleanThemeName(t.name).toLowerCase() === node.label.toLowerCase());
    return t ? `theme:ontology:${t.id}` : null;
  }
  if (node.cls === "asset" && node.ticker) return `company:ticker:${node.ticker.toUpperCase()}`;
  if (node.cls === "industry") return `industry:taxonomy:${slugify(node.label)}`;
  if (node.cls === "driver") return `driver:ontology:${slugify(node.label)}`;
  return null;
}

// ── the dominant dossier (nothing selected) ─────────────────────────────────────

export function buildDominantInspector(args: {
  read: ReadVM;
  story: MarketStoryVM | null;
  themes: ThemeIntelligence[];
  model: NetworkModel;
  regimeLabel: string;
  historicalContext?: HistoricalContext | null;
  calibration?: CalibrationStatus | null;
  predictions?: PredictionRow[] | null;
}): DossierVM | null {
  const { read, story, themes, model } = args;
  const thesis = read.thesis.data;
  if (!thesis) return null;

  const themeByName = new Map(themes.map(t => [t.name.toLowerCase(), t]));
  const anchorTheme = thesis.members.length
    ? themeByName.get(thesis.members[0].name.toLowerCase()) ?? null : null;

  const reasoning: ReasoningRow[] = [];
  if (thesis.whyDominant) reasoning.push({ kind: "structure", text: thesis.whyDominant });
  for (const m of thesis.members.slice(0, 4)) {
    reasoning.push({ kind: "memory", text: `${m.name} — conviction ${m.conviction}, ${m.trend ?? "stable"}.` });
  }
  const evidenceRows = read.evidence.data ?? [];
  for (const r of evidenceRows.slice(0, 2)) {
    reasoning.push({ kind: "evidence", text: `${r.sourceClass}: ${r.assertion}` });
  }

  const focal = focalNodeId(model);
  const chain = focal ? representativeChain(model, focal) : [];
  const memberIds = thesis.members
    .map(m => themeNodeId(m.name))
    .filter(id => model.nodes.some(n => n.id === id));

  const risks: string[] = [];
  if (thesis.contradiction) risks.push(thesis.contradiction.detail);
  for (const inv of read.falsifiers.data?.invalidations ?? []) {
    if (risks.length >= 3) break;
    if (!risks.includes(inv.text)) risks.push(inv.text);
  }
  const watchLine = read.watch.data?.[0]?.text ?? story?.watch ?? null;
  if (watchLine && !risks.includes(watchLine)) risks.push(watchLine);

  const mem = anchorTheme?.memory;
  return {
    scope: "dominant",
    identity: {
      eyebrow: thesis.mode === "narrative" ? "DOMINANT NARRATIVE" : "DOMINANT THEME",
      title: thesis.label,
      figure: thesis.mode === "narrative"
        ? (thesis.coherence ? { label: "COHERENCE", value: Math.round(thesis.coherence.score) } : null)
        : (thesis.members[0] ? { label: "CONVICTION", value: thesis.members[0].conviction } : null),
      delta: null,
      stateLine: `${thesis.members.length} theme${thesis.members.length > 1 ? "s" : ""} · ${args.regimeLabel}`,
      archiveLine: mem
        ? `Tracked ${mem.sessions_observed} sessions · first observed ${new Date(mem.first_seen).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : null,
    },
    lead: story?.paragraph ?? thesis.thesisLine,
    reasoning,
    chain,
    exposure: exposureFromModel(model, memberIds.length ? memberIds : (focal ? [focal] : [])),
    memory: memoryVM(anchorTheme, args.historicalContext),
    ledger: ledgerVM(args.calibration, args.predictions),
    watch: risks,
  };
}

// ── the entity dossier (graph navigation) ───────────────────────────────────────

export function buildEntityDossier(args: {
  nodeId: string;
  model: NetworkModel;
  themes: ThemeIntelligence[];
  historicalContext?: HistoricalContext | null;
  calibration?: CalibrationStatus | null;
  predictions?: PredictionRow[] | null;
}): DossierVM | null {
  const { nodeId, model, themes } = args;
  const node = model.nodes.find(n => n.id === nodeId);
  if (!node) return null;

  const theme = node.cls === "theme"
    ? themes.find(t => cleanThemeName(t.name).toLowerCase() === node.label.toLowerCase()) ?? null
    : null;

  // linking themes (why non-theme entities matter): upstream theme neighbors
  const linkingThemes = model.edges
    .filter(e => e.target === nodeId)
    .map(e => model.nodes.find(n => n.id === e.source))
    .filter((n): n is NetworkNode => !!n && (n.cls === "theme" || n.cls === "narrative"));

  const reasoning: ReasoningRow[] = [];
  if (node.cls === "theme" && theme) {
    const drivers = model.edges.filter(e => e.target === nodeId && e.source.startsWith("drv:"))
      .map(e => model.nodes.find(n => n.id === e.source)?.label).filter(Boolean);
    if (drivers.length) reasoning.push({ kind: "driver", text: `Driven by ${drivers.join(", ")} — derived from the recorded causal head.` });
    const stories = theme.contributing_story_count ?? 0;
    const sources = theme.evidence_count ?? 0;
    if (stories || sources) reasoning.push({ kind: "evidence", text: `${stories} contributing stories across ${sources} sources this cycle.` });
    const mem = theme.memory;
    if (mem) reasoning.push({ kind: "memory", text: `Confirmed ${mem.confirming_total} vs ${mem.contradicting_total} contradicting across ${mem.sessions_observed} sessions.` });
    if (typeof theme.breadth_score === "number" && theme.breadth_score > 0)
      reasoning.push({ kind: "structure", text: `Breadth ${theme.breadth_score} — distinct industries with contributing clusters.` });
  } else if (node.cls === "narrative") {
    reasoning.push({ kind: "structure",
      text: `${node.members?.length ?? 0} member themes grouped by shared recorded drivers${typeof node.coherence === "number" ? ` — coherence ${node.coherence}` : ""}.` });
  } else if (linkingThemes.length) {
    for (const t of linkingThemes.slice(0, 3)) {
      reasoning.push({ kind: "structure",
        text: `${t.label}${typeof t.confidence === "number" ? ` (conviction ${t.confidence})` : ""} transmits into this ${node.cls === "asset" ? "instrument" : node.cls}.` });
    }
  }

  const figure = node.cls === "narrative"
    ? (typeof node.coherence === "number" ? { label: "COHERENCE", value: node.coherence } : null)
    : typeof node.confidence === "number"
      ? { label: node.cls === "industry" ? "SUPPORT" : "CONVICTION",
          value: node.cls === "industry" ? (node.supportCount ?? 0) : node.confidence }
      : node.cls === "industry" && typeof node.supportCount === "number"
        ? { label: "SUPPORTING THEMES", value: node.supportCount } : null;

  const mem = theme?.memory;
  const CLASS_EYEBROW: Record<string, string> = {
    driver: "MACRO DRIVER", narrative: "NARRATIVE", theme: "THEME",
    industry: "INDUSTRY", asset: "ASSET",
  };
  return {
    scope: "entity",
    identity: {
      eyebrow: [CLASS_EYEBROW[node.cls], node.direction?.toUpperCase()].filter(Boolean).join(" · "),
      title: node.name ?? node.label,
      figure,
      delta: typeof node.delta === "number" && node.delta !== 0 ? node.delta : null,
      stateLine: node.cls === "theme" && node.momentumLabel ? node.momentumLabel : null,
      archiveLine: mem
        ? `Tracked ${mem.sessions_observed} sessions · first observed ${new Date(mem.first_seen).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : null,
    },
    lead: node.reason ?? null,
    reasoning,
    chain: representativeChain(model, nodeId),
    exposure: exposureFromModel(model, [nodeId]),
    memory: node.cls === "theme"
      ? memoryVM(theme, args.historicalContext)
      : { state: "none", firstSeen: null, sessions: null, peak: null, trough: null,
          maturityLine: "No entity-level memory summary on this surface yet — theme memory is the canonical record." },
    ledger: ledgerVM(args.calibration, args.predictions),
    watch: theme ? [themeWatch(theme)] : [],
  };
}
