/**
 * lib/maIntel.ts - the M&A and Private capital-intelligence view models
 * (Phase 2.6 unification, docs/ARGUS_INTELLIGENCE_EVERYWHERE_V1.md).
 *
 * Deals and rounds are FACTS. Their MEANING - what activity confirms or
 * contradicts, who is exposed, what could invalidate the read - is a pure
 * projection of injected shared intelligence:
 *
 *   entity resolution      <- the shared graph (the Deal adapter records
 *                             Deal nodes, mentions/acquires edges, sectors)
 *   acquirer/target reads  <- Intelligence Profiles (same numbers as Explorer)
 *   risks / contradictions <- lib/riskRead, records VERBATIM
 *   narrative membership   <- DerivedNarrative exposure (injected)
 *   what changed           <- the canonical change ledger, object identity
 *
 * Evidence classification (same model as Listen; never conflated):
 *   SUPPORTS    - a recorded supporting-type edge connects the deal (or its
 *                 resolved companies) to the theme/narrative
 *   CONTRADICTS - a recorded weakening-type edge
 *   MENTIONS    - a recorded "mentions"/"acquires" edge, or resolved-entity
 *                 metadata overlap
 *   CONTEXT     - sector/keyword-level overlap only
 *   UNCLEAR     - conflicting recorded signals
 * A deal in the same sector is NOT automatically support; a headline keyword
 * is NOT evidence (89.x pins it).
 *
 * Pure module, relative imports only. No em/en dashes.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import type { ThemeIntelligence } from "./types";
import type { IntelligenceProfile, ProfileSection, ProfileStatus, ProfileForward } from "./intelligenceProfile";
import type { RiskRead } from "./riskRead";
import type { MorningBriefDelta } from "./intelligenceDeltas";
import type { DerivedNarrative } from "./narrativeDerivation";

/* ------------------------------------------------------------------ *
 * Contract
 * ------------------------------------------------------------------ */

export type DealRelation = "SUPPORTS" | "CONTRADICTS" | "MENTIONS" | "CONTEXT" | "UNCLEAR";

/** Minimal injected deal facts (the page maps MADeal / rounds onto this). */
export interface DealFactsInput {
  id:        string;
  title:     string;
  sector?:   string | null;
  /** Extracted entity names/tickers (facts; unresolved stays unresolved). */
  entities?: string[];
  acquirer?: string | null;
  target?:   string | null;
}

export interface ResolvedEntity {
  /** The name as extracted (fact). */
  raw:      string;
  /** Canonical graph key when the shared graph resolves it; null otherwise -
      unknown entities stay explicitly unresolved, never silently mapped. */
  key:      string | null;
  nodeType: string | null;
  /** Profile reads, verbatim - the same numbers Explorer shows. */
  conviction: number | null;
  verdict:    string | null;
  forward:    ProfileForward | null;
}

export interface DealIntelShared {
  dealId:   string;
  acquirer: ResolvedEntity | null;
  target:   ResolvedEntity | null;
  /** Recorded-edge classification of the deal against the theme set. */
  relation: DealRelation;
  relationBasis: "graph" | "metadata" | "none";
  /** The theme/narrative object the relation was classified against. */
  relatedTheme: string | null;
  narrative:    string | null;
  /** Shared risk records for the acquirer (verbatim riskRead). */
  risks: { contradictions: Array<{ detail: string; severity: number }>; invalidation: string | null; watch: string | null } | null;
  /** Recorded beneficiaries around the deal's sector entity (profile read). */
  sectorBeneficiaries: string[];
  /** The canonical ledger record touching the related theme, VERBATIM. */
  latestChange: MorningBriefDelta | null;
}

export interface MAIntelInputs {
  deals?:      DealFactsInput[];
  themes?:     ThemeIntelligence[];
  /** Injected shared profiles / risk reads, keyed by lower-cased entity key. */
  profiles?:   Map<string, IntelligenceProfile>;
  risks?:      Map<string, RiskRead>;
  narratives?: DerivedNarrative[];
  deltas?:     MorningBriefDelta[];
  graphReady?: boolean;
}

export interface MAIntelVM {
  deals: ProfileSection<DealIntelShared[]>;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const section = <T>(status: ProfileStatus, data: T | null, note?: string): ProfileSection<T> =>
  ({ status, data, ...(note ? { note } : {}) });

const NEG_REL_RE = /weaken|contradict|revers|disrupt|pressur|risk/i;
const SUP_REL_RE = /support|confirm|drive|strengthen|benefit/i;

function resolveEntity(raw: string | null | undefined, profiles: Map<string, IntelligenceProfile>, graphReady: boolean): ResolvedEntity | null {
  if (!raw) return null;
  const node = graphReady ? G.getNode(raw) : undefined;
  if (!node) return { raw, key: null, nodeType: null, conviction: null, verdict: null, forward: null };
  const p = profiles.get(node.label.toLowerCase()) ?? null;
  const live = !!p && p.identity.status !== "unavailable";
  return {
    raw,
    key: node.label,
    nodeType: String(node.type),
    conviction: live ? p!.confidence.data?.conviction ?? null : null,
    verdict: live ? p!.evidence.data?.verdict ?? null : null,
    forward: live ? p!.thesis.data?.forward ?? null : null,
  };
}

/* ------------------------------------------------------------------ *
 * buildMAIntel
 * ------------------------------------------------------------------ */

export function buildMAIntel(inputs: MAIntelInputs = {}): MAIntelVM {
  const deals = inputs.deals ?? [];
  const themes = inputs.themes ?? [];
  const profiles = inputs.profiles ?? new Map<string, IntelligenceProfile>();
  const risks = inputs.risks ?? new Map<string, RiskRead>();
  const narratives = inputs.narratives ?? [];
  const deltas = inputs.deltas ?? [];
  const graphReady = inputs.graphReady === true;

  if (deals.length === 0) {
    return { deals: section<DealIntelShared[]>("unavailable", null, "No deals to project.") };
  }

  const out: DealIntelShared[] = deals.map(d => {
    const acquirer = resolveEntity(d.acquirer ?? d.entities?.[0] ?? null, profiles, graphReady);
    const target = resolveEntity(d.target ?? d.entities?.[1] ?? null, profiles, graphReady);

    /* -- relation classification: recorded edges first, metadata second -- */
    let relation: DealRelation = "CONTEXT";
    let relationBasis: DealIntelShared["relationBasis"] = "none";
    let relatedTheme: string | null = null;

    if (graphReady) {
      const dealNode = G.getNode(d.id) ?? G.getNode(d.title);
      if (dealNode) {
        let sawNeg = false, sawSup = false, sawMention = false;
        for (const { node, edge } of G.getNeighbors(dealNode.id)) {
          const ty = String(node.type);
          if (ty !== "Theme" && ty !== "Narrative") continue;
          if (NEG_REL_RE.test(edge.relationshipType)) { sawNeg = true; relatedTheme ??= node.label; }
          else if (SUP_REL_RE.test(edge.relationshipType)) { sawSup = true; relatedTheme ??= node.label; }
          else { sawMention = true; relatedTheme ??= node.label; }
        }
        if (sawNeg && sawSup) { relation = "UNCLEAR"; relationBasis = "graph"; }
        else if (sawNeg) { relation = "CONTRADICTS"; relationBasis = "graph"; }
        else if (sawSup) { relation = "SUPPORTS"; relationBasis = "graph"; }
        else if (sawMention) { relation = "MENTIONS"; relationBasis = "graph"; }
      }
    }
    if (relationBasis !== "graph") {
      // Metadata: resolved-entity overlap with a theme's recorded exposure is
      // a MENTION; sector-name overlap alone is CONTEXT. NEVER support.
      const dealEnts = new Set([d.acquirer, d.target, ...(d.entities ?? [])].filter(Boolean).map(e => (e as string).toUpperCase()));
      const entityHit = themes.find(t => (t.related_assets ?? []).some(a => dealEnts.has(a.toUpperCase())));
      const sectorHit = d.sector ? themes.find(t => (t.related_industries ?? []).some(s => s.toLowerCase() === d.sector!.toLowerCase())) : undefined;
      if (entityHit) { relation = "MENTIONS"; relationBasis = "metadata"; relatedTheme = entityHit.name; }
      else if (sectorHit) { relation = "CONTEXT"; relationBasis = "metadata"; relatedTheme = sectorHit.name; }
      else { relation = "CONTEXT"; relationBasis = "none"; relatedTheme = null; }
    }

    const narrative = relatedTheme
      ? narratives.find(n => (n.members.data ?? []).some(m => m.label.toLowerCase() === relatedTheme!.toLowerCase()))?.label ?? null
      : null;

    const acquirerRisk = acquirer?.key ? risks.get(acquirer.key.toLowerCase()) ?? null : null;

    /* -- recorded beneficiaries around the deal's sector entity -- */
    const sectorProfile = d.sector ? profiles.get(d.sector.toLowerCase()) ?? null : null;
    const sectorBeneficiaries = sectorProfile && sectorProfile.identity.status !== "unavailable"
      ? (sectorProfile.beneficiaries.data ?? []).filter(l => l.nodeType === "Company" || l.nodeType === "ETF").slice(0, 4).map(l => l.label)
      : [];

    const ledgerIdx = relatedTheme ? deltas.findIndex(x => x.entity.toLowerCase() === relatedTheme!.toLowerCase()) : -1;

    return {
      dealId: d.id,
      acquirer, target,
      relation, relationBasis, relatedTheme, narrative,
      risks: acquirerRisk && acquirerRisk.basis === "graph"
        ? { contradictions: acquirerRisk.contradictions, invalidation: acquirerRisk.invalidation, watch: acquirerRisk.watchItems[0] ?? null }
        : null,
      sectorBeneficiaries,
      latestChange: ledgerIdx >= 0 ? deltas[ledgerIdx] : null,
    };
  });

  return {
    deals: graphReady
      ? section("live", out)
      : section("partial", out, "Intelligence graph not provisioned; metadata-level resolution only."),
  };
}

/* ------------------------------------------------------------------ *
 * buildPrivateIntel - the Private surface projection
 * ------------------------------------------------------------------ */

export interface PrivateFlowItem {
  theme:        string;
  conviction:   number;
  direction:    string;
  beneficiaries: string[];
  invalidation: string | null;
  watch:        string | null;
  latestChange: MorningBriefDelta | null;
  narrative:    string | null;
}

export interface PrivateIntelVM {
  /** The dominant flow read = the SAME thesis The Read shows (injected). */
  thesisLine: ProfileSection<string>;
  /** Themes recording private-capital-relevant exposure, with shared reads. */
  flows: ProfileSection<PrivateFlowItem[]>;
}

interface _Unused { _x?: Array<{
    theme:        string;
    conviction:   number;             // pipeline conviction (canonical owner)
    direction:    string;             // canonical momentum_direction
    beneficiaries: string[];          // recorded pipeline assets
    invalidation: string | null;      // shared riskRead, verbatim
    watch:        string | null;
    latestChange: MorningBriefDelta | null;   // ledger, object identity
    narrative:    string | null;
  }>;
}

export interface PrivateIntelInputs {
  themes?:     ThemeIntelligence[];
  /** The Read's thesis line (the dominant narrative, shared). */
  readThesisLine?: string | null;
  risks?:      Map<string, RiskRead>;
  narratives?: DerivedNarrative[];
  deltas?:     MorningBriefDelta[];
  graphReady?: boolean;
}

const isTicker = (s: string) => /^[A-Z][A-Z.]{0,5}$/.test(s);

export function buildPrivateIntel(inputs: PrivateIntelInputs = {}): PrivateIntelVM {
  const themes = inputs.themes ?? [];
  const risks = inputs.risks ?? new Map<string, RiskRead>();
  const narratives = inputs.narratives ?? [];
  const deltas = inputs.deltas ?? [];
  const graphReady = inputs.graphReady === true;

  const thesisLine: ProfileSection<string> = inputs.readThesisLine
    ? section("live", inputs.readThesisLine)
    : section<string>("unavailable", null, "No shared Read thesis available yet.");

  if (themes.length === 0) {
    return { thesisLine, flows: section<PrivateFlowItem[]>("unavailable", null, "No themes available yet.") };
  }

  const flows = [...themes]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 6)
    .map(t => {
      const rr = risks.get(t.name.toLowerCase()) ?? null;
      const idx = deltas.findIndex(d => d.entity.toLowerCase() === t.name.toLowerCase());
      return {
        theme: t.name,
        conviction: Math.round(t.confidence ?? 0),
        direction: t.momentum_direction ?? "neutral",
        beneficiaries: (t.related_assets ?? []).filter(isTicker).slice(0, 4),
        invalidation: rr && rr.basis === "graph" ? rr.invalidation : null,
        watch: rr?.watchItems[0] ?? null,
        latestChange: idx >= 0 ? deltas[idx] : null,
        narrative: narratives.find(n => (n.members.data ?? []).some(m => m.label.toLowerCase() === t.name.toLowerCase()))?.label ?? null,
      };
    });

  return {
    thesisLine,
    flows: graphReady
      ? section("live", flows)
      : section("partial", flows, "Intelligence graph not provisioned; pipeline reads only."),
  };
}
