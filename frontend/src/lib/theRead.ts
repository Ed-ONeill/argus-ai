/**
 * lib/theRead.ts - "The Read": the Narrative Centerpiece view model (Sprint B3,
 * implementing docs/ARGUS_NARRATIVE_CENTERPIECE_V1.md).
 *
 * Assembles zones Z2-Z7 (Z1, the change ledger, ships separately in
 * lib/intelligenceDeltas.ts) as pure projections of the existing engines:
 *
 *   Z2 Thesis       <- deriveNarratives()[0] + member convictions/ThemeMemory
 *                      trends + coherence + the standing contradiction
 *   Z3 Evidence     <- evaluateEvidenceForNode per member + injected story
 *                      clusters (matched by contributing_cluster_ids)
 *   Z4 Exposure     <- DerivedNarrative.exposure + non-equity graph neighbors
 *   Z5 Chain        <- a real recorded path walked layer-by-layer from the
 *                      narrative's anchor driver (every hop is a real edge)
 *   Z6 Watch        <- watchLineOf derivations bound to the zone they confirm
 *   Z7 Falsifiers   <- prediction invalidations + evidence contradictions +
 *                      weakens-edges (three kinds, kept distinct)
 *
 * Honesty rules: nothing is fabricated (I1); every zone is ProfileSection-
 * wrapped; when no multi-theme narrative is derivable the thesis falls back to
 * the strongest single theme, labeled a THEME, never dressed as a narrative;
 * Z2 never renders without Z7 - when no falsifier is recorded, that absence is
 * itself surfaced as a warning (the doc's humility rule). The thesis line is a
 * deterministic template over real fields; summarizer prose may ride NEXT to
 * it as voice (the page renders that separately), never inside it.
 *
 * Pure module, relative imports only, exercised by intelligenceTests.ts
 * (80.x). No em/en dashes.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import type { IntelNode } from "./intelligenceGraph";
import { causalLayerOfType, deriveEdgeTrend, type EdgeTrend } from "./causalMap";
import { evaluateEvidenceForNode } from "./evidenceEngine";
import { predictThemeTrajectory, rankFutureOpportunities } from "./predictionEngine";
import { deriveNarratives, type DerivedNarrative } from "./narrativeDerivation";
import { buildIntelligenceProfile, type ProfileSection, type ProfileStatus } from "./intelligenceProfile";
import { watchLineOf, type MorningBriefDelta } from "./intelligenceDeltas";
import type { ThemeIntelligence } from "./types";

/* ------------------------------------------------------------------ *
 * Contract
 * ------------------------------------------------------------------ */

export interface ReadMember { name: string; conviction: number; trend: "rising" | "falling" | "stable" | null }

export interface ReadThesis {
  /** "narrative" = derived multi-theme grouping; "theme" = honest single-theme fallback. */
  mode:          "narrative" | "theme";
  label:         string;
  thesisLine:    string;    // deterministic template over real fields
  members:       ReadMember[];
  /** Why Argus ranks this dominant - the decomposition, in plain language. */
  whyDominant:   string;
  coherence:     { score: number; explanation: string } | null;
  /** The standing contradiction: highest severity across members, in the thesis block by design. */
  contradiction: { detail: string; severity: number; entity: string } | null;
}

export interface ReadEvidenceRow {
  sourceClass: string;          // story | conversation | macro | deal | market | link
  assertion:   string;
  entity:      string;          // the member theme it supports
  reliability: number | null;   // evidence engine source reliability (raw, unbucketed)
  strength:    number | null;   // edge strength for graph rows; null for cluster rows
}

export interface ReadExposureItem { label: string; nodeType: string; memberCount: number }
export interface ReadExposure {
  sectors:   ReadExposureItem[];
  companies: ReadExposureItem[];
  /** Commodities / currencies / countries, as the graph holds them. */
  other:     ReadExposureItem[];
}

export interface ReadChainHop {
  label:    string;
  nodeType: string;
  /** The real recorded edge from the previous hop; null on the anchor. */
  edge:     { relationship: string; strength: number; trend: EdgeTrend } | null;
}

export interface ReadWatchItem { text: string; theme: string; binding: string; derived: true }

export interface ReadFalsifiers {
  invalidations:  Array<{ text: string; theme: string }>;
  contradictions: Array<{ detail: string; severity: number }>;
  breakers:       Array<{ from: string; relationship: string; target: string }>;
  /** Set exactly when the thesis exists but no falsifier is recorded (the honest warning). */
  noneNote:       string | null;
}

/* -- Sprint B4: research prioritization, catalysts, investigation queue -- */

export interface ReadEntityRef { label: string; nodeType: string }

export interface ResearchPriority {
  entity:   ReadEntityRef;
  /** Deterministic prioritization score, 0..100. A research-attention ranking
      composed of real recorded factors - decomposed in `reasons`, item by
      item. Explicitly NOT a confidence and NOT a trade signal. */
  score:    number;
  reasons:  string[];
  /** True when a followed-theme boost was applied (prioritization only,
      always badged; the underlying facts are identical for every user). */
  personal: boolean;
}

export interface CatalystItem {
  label:    string;   // the recorded series/release entity
  nodeType: string;
  detail:   string;   // what is verified (dateless until the Event provider)
  feeds:    string;   // the driver/theme it is recorded against
}

export type QueueAction = "Open Narrative" | "View Transmission" | "Inspect Evidence" | "Trace Relationships";
export interface QueueItem { action: QueueAction; entity: ReadEntityRef; reason: string }

export interface ReadVM {
  thesis:     ProfileSection<ReadThesis>;
  evidence:   ProfileSection<ReadEvidenceRow[]>;
  exposure:   ProfileSection<ReadExposure>;
  chain:      ProfileSection<ReadChainHop[]>;
  watch:      ProfileSection<ReadWatchItem[]>;
  falsifiers: ProfileSection<ReadFalsifiers>;
  /** B4: where the investor should spend research attention next. */
  priorities: ProfileSection<ResearchPriority[]>;
  /** B4: verified upcoming-event material only; degrades honestly. */
  catalysts:  ProfileSection<CatalystItem[]>;
  /** B4: The Read's exit ramp into Explorer. */
  queue:      ProfileSection<QueueItem[]>;
}

/** Minimal injected story-cluster shape (the page maps StoryCluster to this). */
export interface ReadClusterInput { id: string; title: string; source?: string | null }

export interface ReadInputs {
  themes?:             ThemeIntelligence[];
  clusters?:           ReadClusterInput[];
  /** Today's change ledger (lib/intelligenceDeltas), injected by the brief VM
      so the priority ranking never re-derives it. */
  deltas?:             MorningBriefDelta[];
  /** Followed-theme names: personalization input. Adjusts ordering/emphasis
      only, never facts (surfaces doc: prioritize, never personalize truth). */
  followedThemeNames?: string[];
  graphReady?:         boolean;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const section = <T>(status: ProfileStatus, data: T | null, note?: string): ProfileSection<T> =>
  ({ status, data, ...(note ? { note } : {}) });
const unavailable = <T>(note: string): ProfileSection<T> => section<T>("unavailable", null, note);

const WEAKENS_RE = /weaken|contradict|revers|disrupt|pressur|risk/i;

const SOURCE_CLASS: Record<string, string> = {
  Story: "story", Podcast: "conversation",
  Macro: "macro", MacroSeries: "macro", EconomicRelease: "macro", InterestRate: "macro",
  Deal: "deal", MarketMetric: "market",
};
const sourceClassOf = (nodeType: string): string => SOURCE_CLASS[nodeType] ?? "link";

const trendOf = (t: ThemeIntelligence): ReadMember["trend"] => t.memory?.conviction_trend ?? null;

const firstSentence = (s: string | null | undefined): string | null => {
  const c = (s ?? "").replace(/→/g, ", ").replace(/ {2,}/g, " ").trim();
  if (!c) return null;
  const dot = c.indexOf(". ");
  return dot > 12 ? c.slice(0, dot + 1) : c;
};

/** Strongest recorded next-layer hop from any of `fromNodes`, preferring
    `prefer` ids (the narrative's own members) over raw strength. */
function nextHop(fromNodes: IntelNode[], layer: number, seen: Set<string>, prefer?: Set<string>):
  { node: IntelNode; edge: { relationship: string; strength: number; trend: EdgeTrend } } | null {
  let best: { node: IntelNode; strength: number; preferred: boolean; edge: { relationship: string; strength: number; trend: EdgeTrend } } | null = null;
  for (const fn of fromNodes) {
    for (const { node, edge } of G.getNeighbors(fn.id)) {
      if (seen.has(node.id) || causalLayerOfType(String(node.type)) !== layer) continue;
      const preferred = prefer?.has(node.id) ?? false;
      if (best && (best.preferred && !preferred)) continue;
      if (best && best.preferred === preferred && edge.strength <= best.strength) continue;
      best = {
        node, strength: edge.strength, preferred,
        edge: { relationship: edge.relationshipType, strength: Math.round(edge.strength), trend: deriveEdgeTrend(edge, fn, node) },
      };
    }
  }
  return best ? { node: best.node, edge: best.edge } : null;
}

/* ------------------------------------------------------------------ *
 * buildTheRead
 * ------------------------------------------------------------------ */

/** Assemble The Read's zones from injected data + the graph singleton.
    Deterministic for fixed inputs; degrades zone by zone, never fabricates. */
export function buildTheRead(inputs: ReadInputs = {}): ReadVM {
  const themes = inputs.themes ?? [];
  const clusters = inputs.clusters ?? [];
  const graphReady = inputs.graphReady === true;

  if (themes.length === 0) {
    const missing = "No themes available yet.";
    return {
      thesis: unavailable(missing), evidence: unavailable(missing), exposure: unavailable(missing),
      chain: unavailable(missing), watch: unavailable(missing), falsifiers: unavailable(missing),
      priorities: unavailable(missing), catalysts: unavailable(missing), queue: unavailable(missing),
    };
  }

  const themeByName = new Map(themes.map(t => [t.name.toLowerCase(), t]));
  const narrative: DerivedNarrative | null = graphReady ? deriveNarratives()[0] ?? null : null;

  /* -- resolve the thesis subject: narrative first, single-theme fallback -- */
  const leading = [...themes].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
  const memberThemes: ThemeIntelligence[] = narrative
    ? (narrative.members.data ?? [])
        .map(m => themeByName.get(m.label.toLowerCase()))
        .filter((t): t is ThemeIntelligence => !!t)
    : [leading];
  if (narrative && memberThemes.length === 0) memberThemes.push(leading);

  const members: ReadMember[] = memberThemes.map(t => ({
    name: t.name, conviction: Math.round(t.confidence ?? 0), trend: trendOf(t),
  }));

  /* -- the standing contradiction: highest severity across members (graph-gated) -- */
  let contradiction: ReadThesis["contradiction"] = null;
  if (graphReady) {
    for (const t of memberThemes) {
      const ev = evaluateEvidenceForNode(t.name);
      if (!ev.found) continue;
      for (const c of ev.contradictions) {
        if (!contradiction || c.severity > contradiction.severity) contradiction = { detail: c.detail, severity: c.severity, entity: t.name };
      }
    }
  }

  /* -- Z2 thesis -- */
  let thesis: ProfileSection<ReadThesis>;
  if (narrative) {
    const driverLabels = (narrative.driverSet.data ?? []).map(d => d.label);
    const exp = narrative.exposure.data;
    const topSectors = (exp?.sectors ?? []).slice(0, 2).map(s => s.label);
    const topCompany = (exp?.assets ?? [])[0]?.label ?? null;
    const thesisLine =
      `${driverLabels.join(" + ")} is the organizing force: ${members.map(m => m.name).join(" and ")} hang off it` +
      (topSectors.length ? `, transmitting through ${topSectors.join(" and ")}` : "") +
      (topCompany ? ` into ${topCompany}` : "") + ".";
    const pages = narrative.evidence.data?.distinctPages ?? [];
    const whyDominant =
      `${members.length} member theme${members.length === 1 ? "" : "s"} share ${driverLabels.join(" + ")}` +
      (narrative.coherence.data ? `; structural coherence ${narrative.coherence.data.score}` : "") +
      (pages.length ? `; evidence spans ${pages.length} source page${pages.length === 1 ? "" : "s"}` : "") + ".";
    thesis = section("live", {
      mode: "narrative", label: narrative.label, thesisLine, members, whyDominant,
      coherence: narrative.coherence.data ? { score: narrative.coherence.data.score, explanation: narrative.coherence.data.explanation } : null,
      contradiction,
    });
  } else {
    const t = leading;
    const thesisLine = firstSentence(t.causal_narrative)
      ?? `${t.name} is the strongest active theme (conviction ${Math.round(t.confidence ?? 0)}).`;
    thesis = section("partial", {
      mode: "theme", label: t.name, thesisLine, members,
      whyDominant: graphReady
        ? "No multi-theme narrative is derivable from the current graph; showing the strongest single theme."
        : "Intelligence graph not built yet; showing the strongest single theme from the pipeline.",
      coherence: null, contradiction,
    }, "Single-theme read: no derived narrative available. Labeled a theme, not a narrative.");
  }

  /* -- Z3 evidence spine: graph-backed supporting reads first, then stories -- */
  const rows: ReadEvidenceRow[] = [];
  if (graphReady) {
    const seen = new Set<string>();
    for (const t of memberThemes) {
      const ev = evaluateEvidenceForNode(t.name);
      if (!ev.found || ev.verdict === "insufficient_signal") continue;
      for (const item of [...ev.supportingEvidence].sort((a, b) => b.strength - a.strength).slice(0, 3)) {
        const key = `${item.from}|${item.relationship}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          sourceClass: sourceClassOf(String(item.type)),
          assertion: `${item.from} ${item.relationship.replace(/_/g, " ")} ${t.name}`,
          entity: t.name, reliability: Math.round(item.reliability), strength: Math.round(item.strength),
        });
      }
    }
  }
  const memberClusterIds = new Set(memberThemes.flatMap(t => t.contributing_cluster_ids ?? []));
  for (const c of clusters) {
    if (rows.length >= 6) break;
    if (!memberClusterIds.has(c.id)) continue;
    rows.push({ sourceClass: "story", assertion: c.title, entity: thesis.data?.label ?? "", reliability: null, strength: null });
  }
  const graphBacked = rows.some(r => r.strength !== null);
  const evidence = rows.length > 0
    ? section<ReadEvidenceRow[]>(graphBacked ? "live" : "partial", rows.slice(0, 6),
        graphBacked ? undefined : "Story citations only; graph-backed evidence reads need the intelligence graph.")
    : unavailable<ReadEvidenceRow[]>("No evidence rows resolvable for the current thesis.");

  /* -- Z4 exposure map -- */
  let exposure: ProfileSection<ReadExposure>;
  {
    const sectors: ReadExposureItem[] = (narrative?.exposure.data?.sectors ?? []).map(s => ({ label: s.label, nodeType: s.nodeType, memberCount: s.memberCount }));
    const companies: ReadExposureItem[] = (narrative?.exposure.data?.assets ?? []).map(a => ({ label: a.label, nodeType: a.nodeType, memberCount: a.memberCount }));
    if (!narrative) {
      // Theme fallback: stored pipeline fields (data, not graph).
      for (const s of (leading.related_industries ?? []).slice(0, 4)) sectors.push({ label: s, nodeType: "Sector", memberCount: 1 });
      for (const a of (leading.related_assets ?? []).slice(0, 6)) companies.push({ label: a, nodeType: "Company", memberCount: 1 });
    }
    const other: ReadExposureItem[] = [];
    if (graphReady) {
      const seen = new Set<string>();
      for (const t of memberThemes) {
        const node = G.getNode(t.name);
        if (!node) continue;
        for (const { node: n } of G.getNeighbors(node.id)) {
          const ty = String(n.type);
          if (ty !== "Commodity" && ty !== "Currency" && ty !== "Country") continue;
          if (seen.has(n.id)) { const hit = other.find(o => o.label === n.label); if (hit) hit.memberCount += 1; continue; }
          seen.add(n.id);
          other.push({ label: n.label, nodeType: ty, memberCount: 1 });
        }
      }
    }
    exposure = sectors.length + companies.length + other.length > 0
      ? section("live", { sectors: sectors.slice(0, 6), companies: companies.slice(0, 8), other: other.slice(0, 6) })
      : section<ReadExposure>("partial", { sectors: [], companies: [], other: [] }, "No recorded exposure for the current thesis yet.");
  }

  /* -- Z5 transmission chain: one real recorded path, walked layer by layer
        from the anchor driver. Every hop is a real edge; missing layers are
        skipped, never invented. -- */
  let chain: ProfileSection<ReadChainHop[]>;
  if (!graphReady) {
    chain = unavailable("Intelligence graph not built yet.");
  } else {
    // Anchor: the narrative's strongest driver, or the fallback theme's own driver.
    let anchor: IntelNode | undefined;
    if (narrative) {
      const drivers = narrative.driverSet.data ?? [];
      let bestStrength = -1;
      for (const d of drivers) {
        const strongest = Math.max(0, ...(narrative.members.data ?? []).flatMap(m => m.driverLinks.filter(l => l.driverId === d.id).map(l => l.strength)));
        if (strongest > bestStrength) { bestStrength = strongest; anchor = G.getNode(d.id); }
      }
    } else {
      const node = G.getNode(leading.name);
      const up = node ? G.getNeighbors(node.id).filter(x => causalLayerOfType(String(x.node.type)) === 0).sort((a, b) => b.edge.strength - a.edge.strength)[0] : undefined;
      anchor = up?.node;
    }
    if (!anchor) {
      chain = unavailable("No recorded driver to anchor a transmission path.");
    } else {
      const memberIds = new Set(memberThemes.map(t => G.getNode(t.name)?.id).filter((x): x is string => !!x));
      const hops: ReadChainHop[] = [{ label: anchor.label, nodeType: String(anchor.type), edge: null }];
      const seen = new Set<string>([anchor.id]);
      let current: IntelNode = anchor;
      let hub: IntelNode | null = null;   // the theme hop: sectors/companies usually hang off it
      for (const layer of [1, 2, 3, 4]) {
        const from = hub && hub.id !== current.id ? [current, hub] : [current];
        const hop = nextHop(from, layer, seen, layer === 1 ? memberIds : undefined);
        if (!hop) continue;
        hops.push({ label: hop.node.label, nodeType: String(hop.node.type), edge: hop.edge });
        seen.add(hop.node.id);
        current = hop.node;
        if (layer === 1) hub = hop.node;
      }
      chain = hops.length >= 2
        ? section("live", hops)
        : unavailable("The anchor driver has no recorded downstream path yet.");
    }
  }

  /* -- Z7 falsifiers: three kinds, kept distinct; absence is a warning -- */
  let falsifiers: ProfileSection<ReadFalsifiers>;
  if (!graphReady) {
    falsifiers = unavailable("Falsifier reads need the intelligence graph.");
  } else {
    const invalidations: ReadFalsifiers["invalidations"] = [];
    const contradictionsList: ReadFalsifiers["contradictions"] = [];
    const breakers: ReadFalsifiers["breakers"] = [];
    const breakerSeen = new Set<string>();
    for (const t of memberThemes) {
      const p = predictThemeTrajectory(t.name);
      const inv = p.found ? p.invalidationConditions[0] : undefined;
      if (inv) invalidations.push({ text: inv, theme: t.name });
      const ev = evaluateEvidenceForNode(t.name);
      if (ev.found) for (const c of ev.contradictions) contradictionsList.push({ detail: c.detail, severity: c.severity });
      const node = G.getNode(t.name);
      if (node) {
        for (const e of G.getRelationships(node.id)) {
          if (!WEAKENS_RE.test(e.relationshipType) || breakerSeen.has(e.id)) continue;
          breakerSeen.add(e.id);
          const from = G.getNode(e.source)?.label ?? e.source;
          const target = G.getNode(e.target)?.label ?? e.target;
          breakers.push({ from, relationship: e.relationshipType, target });
        }
      }
    }
    contradictionsList.sort((a, b) => b.severity - a.severity);
    const any = invalidations.length + contradictionsList.length + breakers.length > 0;
    falsifiers = any
      ? section("live", { invalidations: invalidations.slice(0, 3), contradictions: contradictionsList.slice(0, 3), breakers: breakers.slice(0, 3), noneNote: null })
      : section<ReadFalsifiers>("partial",
          { invalidations: [], contradictions: [], breakers: [], noneNote: "No recorded falsifier for this thesis. Treat conviction with suspicion until one exists." },
          "Absence of a falsifier is itself surfaced (centerpiece doc Z7).");
  }

  /* -- Z6 watch: member watch lines bound to the zone they would move -- */
  const watchItems: ReadWatchItem[] = memberThemes.slice(0, 3).map(t => ({
    text: watchLineOf(t), theme: t.name, derived: true as const,
    binding: chain.data && chain.data.some(h => h.label.toLowerCase() === t.name.toLowerCase())
      ? "confirms the transmission chain"
      : "confirms today's dominant thesis",
  }));
  if (contradiction) {
    watchItems.unshift({
      text: "whether follow-up coverage resolves the standing contradiction",
      theme: contradiction.entity, derived: true as const,
      binding: "clears the thesis contradiction cap",
    });
  }
  const watch = watchItems.length > 0
    ? section<ReadWatchItem[]>("partial", watchItems.slice(0, 4), "Derived, dateless watch items; a real catalyst calendar requires the Event provider (v2 doc 4.6).")
    : unavailable<ReadWatchItem[]>("No watch items derivable.");

  /* -- B4: research priority - where to spend attention next. A deterministic
        ranking over REAL recorded factors, decomposed reason by reason.
        Personalization adds a fixed, badged ordering boost for followed
        themes; it never touches the underlying factors (prioritization, never
        truth). Marked "partial" by design: it is a heuristic ranking, not a
        measured quantity. -- */
  const followed = new Set((inputs.followedThemeNames ?? []).map(s => s.toLowerCase()));
  const deltas = inputs.deltas ?? [];
  const memberNameSet = new Set(memberThemes.map(t => t.name.toLowerCase()));
  const DELTA_WEIGHT: Record<MorningBriefDelta["kind"], number> = {
    BROKEN: 26, CONTRADICTED: 24, NEW: 18, WEAKENED: 15, STRENGTHENED: 12, EXPANDED: 9, REMOVED: 6,
  };
  const oppRank = graphReady ? rankFutureOpportunities(10) : [];

  const scoreTarget = (entity: ReadEntityRef, theme: ThemeIntelligence | null, extraReasons: Array<[number, string]>): ResearchPriority => {
    const parts: Array<[number, string]> = [...extraReasons];
    if (theme) {
      const conv = Math.round(theme.confidence ?? 0);
      if (conv > 0) parts.push([Math.round(conv * 0.3), `conviction ${conv} (theme pipeline)`]);
      const mem = theme.memory ?? null;
      if (mem && mem.confirmations_today > 0) parts.push([Math.min(12, mem.confirmations_today * 3), `${mem.confirmations_today} confirming stor${mem.confirmations_today === 1 ? "y" : "ies"} this cycle (memory)`]);
      if (mem && mem.contradictions_today > 0) parts.push([Math.min(15, mem.contradictions_today * 5), `${mem.contradictions_today} unresolved contradiction${mem.contradictions_today === 1 ? "" : "s"} (memory)`]);
      if (memberNameSet.has(theme.name.toLowerCase()) && thesis.data?.mode === "narrative") parts.push([10, "member of the dominant narrative"]);
      const opp = oppRank.findIndex(o => o.theme.label.toLowerCase() === theme.name.toLowerCase());
      if (opp >= 0) parts.push([Math.max(2, 10 - opp * 2), `prediction engine ranks it #${opp + 1} future opportunity${oppRank[opp].why[0] ? ` (${oppRank[opp].why[0]})` : ""}`]);
    }
    for (const d of deltas) {
      if (d.entity.toLowerCase() !== entity.label.toLowerCase()) continue;
      parts.push([DELTA_WEIGHT[d.kind], `${d.kind.toLowerCase()} this cycle: ${d.what}`]);
    }
    if (graphReady) {
      const p = buildIntelligenceProfile(entity.label);
      if (p.identity.status !== "unavailable") {
        const thin = [p.thesis, p.drivers, p.transmission, p.beneficiaries, p.risks, p.evidence, p.evolution, p.watch]
          .filter(s => s.status === "unavailable").length;
        if (thin >= 3) parts.push([Math.min(10, thin * 2), `${thin} profile sections unresolved: signal without depth`]);
      }
    }
    const personal = followed.has(entity.label.toLowerCase());
    const base = parts.reduce((s, [w]) => s + w, 0);
    const reasons = parts.map(([, r]) => r);
    if (personal) reasons.push("you follow this theme (ordering boost only)");
    return { entity, score: Math.min(100, base + (personal ? 8 : 0)), reasons, personal };
  };

  const priorityItems: ResearchPriority[] = [];
  for (const t of themes.slice(0, 6)) priorityItems.push(scoreTarget({ label: t.name, nodeType: "Theme" }, t, []));
  const anchorHop = chain.data?.[0] ?? null;
  if (anchorHop) priorityItems.push(scoreTarget({ label: anchorHop.label, nodeType: anchorHop.nodeType }, null, [[12, "anchors the dominant narrative's transmission"]]));
  for (const c of (exposure.data?.companies ?? []).slice(0, 2)) {
    priorityItems.push(scoreTarget({ label: c.label, nodeType: c.nodeType }, null,
      [[Math.min(12, c.memberCount * 4), `exposed through ${c.memberCount} member theme${c.memberCount === 1 ? "" : "s"}`]]));
  }
  priorityItems.sort((a, b) => (b.score - a.score) || a.entity.label.localeCompare(b.entity.label));
  const rankedPriorities = priorityItems.filter(p => p.reasons.length > 0).slice(0, 4);
  const priorities = rankedPriorities.length > 0
    ? section<ResearchPriority[]>("partial", rankedPriorities,
        "Heuristic research prioritization over recorded factors; every reason names its source. Not a confidence, not a trade signal.")
    : unavailable<ResearchPriority[]>("No prioritization factors recorded yet.");

  /* -- B4: catalysts - verified event material only. Today that means macro
        series/releases actually recorded in the graph against this thesis's
        drivers and members. They are real and linked but DATELESS: no dated
        event source is ingested yet, so no dates are shown, ever. -- */
  let catalysts: ProfileSection<CatalystItem[]>;
  if (!graphReady) {
    catalysts = unavailable<CatalystItem[]>("Catalyst reads need the intelligence graph.");
  } else {
    const items: CatalystItem[] = [];
    const seenCat = new Set<string>();
    const hosts: IntelNode[] = [];
    if (anchorHop) { const n = G.getNode(anchorHop.label); if (n) hosts.push(n); }
    for (const t of memberThemes) { const n = G.getNode(t.name); if (n) hosts.push(n); }
    for (const host of hosts) {
      for (const { node } of G.getNeighbors(host.id)) {
        const ty = String(node.type);
        if (ty !== "MacroSeries" && ty !== "EconomicRelease") continue;
        if (seenCat.has(node.id)) continue;
        seenCat.add(node.id);
        items.push({
          label: node.label, nodeType: ty, feeds: host.label,
          detail: `Recorded ${ty === "EconomicRelease" ? "economic release" : "macro series"} linked to ${host.label}; prints on a known provider cadence. No dated calendar is ingested, so no date is shown.`,
        });
      }
    }
    catalysts = items.length > 0
      ? section<CatalystItem[]>("partial", items.slice(0, 4), "Verified, dateless: series exist and are linked, but the Event provider (dated calendar) is future work. Nothing is simulated.")
      : unavailable<CatalystItem[]>("No verified upcoming catalysts: no dated event source is ingested yet (Event provider is future work).");
  }

  /* -- B4: the investigation queue - The Read's exit ramp into Explorer.
        Recommendations derive from the zones above; each names its reason. -- */
  const queueItems: QueueItem[] = [];
  const queued = new Set<string>();
  const enqueue = (action: QueueAction, entity: ReadEntityRef, reason: string) => {
    const k = entity.label.toLowerCase();
    if (queued.has(k)) return;
    queued.add(k);
    queueItems.push({ action, entity, reason });
  };
  if (thesis.data) {
    if (anchorHop) enqueue("Open Narrative", { label: anchorHop.label, nodeType: anchorHop.nodeType }, "the driver anchoring today's dominant narrative");
    else enqueue("Open Narrative", { label: thesis.data.label, nodeType: "Theme" }, "today's strongest theme");
  }
  const midHop = (chain.data ?? []).find(h => h.edge !== null);
  if (midHop) enqueue("View Transmission", { label: midHop.label, nodeType: midHop.nodeType }, "the strongest recorded transmission path runs through it");
  const evidenceTarget = thesis.data?.contradiction
    ? { label: thesis.data.contradiction.entity, nodeType: "Theme", reason: "carries the standing contradiction against the thesis" }
    : rankedPriorities[0]
      ? { label: rankedPriorities[0].entity.label, nodeType: rankedPriorities[0].entity.nodeType, reason: "highest research priority this morning" }
      : null;
  if (evidenceTarget) enqueue("Inspect Evidence", { label: evidenceTarget.label, nodeType: evidenceTarget.nodeType }, evidenceTarget.reason);
  const topCo = (exposure.data?.companies ?? [])[0];
  if (topCo) enqueue("Trace Relationships", { label: topCo.label, nodeType: topCo.nodeType }, `the most exposed tradeable${topCo.memberCount > 1 ? ` (${topCo.memberCount} member themes)` : ""}`);
  const queue = queueItems.length > 0
    ? section<QueueItem[]>("live", queueItems.slice(0, 4))
    : unavailable<QueueItem[]>("Nothing to investigate yet.");

  return { thesis, evidence, exposure, chain, watch, falsifiers, priorities, catalysts, queue };
}
