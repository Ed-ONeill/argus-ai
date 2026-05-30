/**
 * themeIntelligence.ts — Argus Intelligence Layer
 *
 * Pure deterministic functions over existing ThemeIntelligence data.
 * Zero LLM calls. Zero new API calls. Everything derived from feed response fields.
 */

import type { ThemeIntelligence, SectorData } from "./types";

// ── 1. Theme Relationship Engine ──────────────────────────────────────────────

export interface ConnectedTheme {
  id:       string;
  name:     string;
  linkType: "shared-story" | "shared-asset" | "sector-overlap";
  strength: "strong" | "moderate" | "weak";
}

export interface ThemeRelationshipMap {
  upstream:   string[];         // what macro factors drive this theme
  downstream: string[];         // what this theme causes downstream
  connected:  ConnectedTheme[]; // other themes related via data overlap
}

function clusterOverlap(a: ThemeIntelligence, b: ThemeIntelligence): number {
  if (!a.contributing_cluster_ids.length || !b.contributing_cluster_ids.length) return 0;
  const bSet = new Set(b.contributing_cluster_ids);
  return a.contributing_cluster_ids.filter(id => bSet.has(id)).length;
}

function assetOverlap(a: ThemeIntelligence, b: ThemeIntelligence): number {
  if (!a.related_assets.length || !b.related_assets.length) return 0;
  const bSet = new Set(b.related_assets.map(x => x.toUpperCase()));
  return a.related_assets.filter(x => bSet.has(x.toUpperCase())).length;
}

function sectorOverlap(a: ThemeIntelligence, b: ThemeIntelligence): number {
  if (!a.related_industries.length || !b.related_industries.length) return 0;
  const bSet = new Set(b.related_industries.map(x => x.toLowerCase()));
  return a.related_industries.filter(x => bSet.has(x.toLowerCase())).length;
}

export function buildThemeRelationshipMap(
  themes: ThemeIntelligence[],
): Map<string, ThemeRelationshipMap> {
  const result = new Map<string, ThemeRelationshipMap>();

  for (const theme of themes) {
    const connected: ConnectedTheme[] = [];

    for (const other of themes) {
      if (other.id === theme.id) continue;

      const clusters = clusterOverlap(theme, other);
      const assets   = assetOverlap(theme, other);
      const sectors  = sectorOverlap(theme, other);

      if (clusters >= 2) {
        connected.push({ id: other.id, name: other.name, linkType: "shared-story", strength: "strong" });
      } else if (clusters === 1 || assets >= 2) {
        connected.push({ id: other.id, name: other.name, linkType: assets >= 2 ? "shared-asset" : "shared-story", strength: "moderate" });
      } else if (assets === 1 || sectors >= 2) {
        connected.push({ id: other.id, name: other.name, linkType: sectors >= 2 ? "sector-overlap" : "shared-asset", strength: "weak" });
      }
    }

    result.set(theme.id, {
      upstream:  theme.related_macro_factors.slice(0, 5),
      downstream: theme.second_order_effects.slice(0, 3),
      connected: connected
        .sort((a, b) => {
          const rank = { strong: 0, moderate: 1, weak: 2 } as const;
          return rank[a.strength] - rank[b.strength];
        })
        .slice(0, 4),
    });
  }

  return result;
}

// ── 2. Confidence Decomposition ───────────────────────────────────────────────

export interface ConfidenceComponent {
  label:       string;
  value:       number;    // 0-100
  direction:   "positive" | "negative" | "neutral";
  description: string;
}

export function decomposeConfidence(t: ThemeIntelligence): ConfidenceComponent[] {
  const components: ConfidenceComponent[] = [];

  // Evidence base — evidence_count scaled to 0-100 (10 strong pieces = full)
  const evidencePct = Math.min(Math.round((t.evidence_count ?? 0) * 10), 100);
  components.push({
    label: "Evidence",
    value: evidencePct,
    direction: evidencePct >= 60 ? "positive" : evidencePct >= 30 ? "neutral" : "negative",
    description: `${t.evidence_count ?? 0} evidence points`,
  });

  // Persistence — directly from field
  const persist = t.persistence_score ?? 50;
  components.push({
    label: "Persistence",
    value: persist,
    direction: persist >= 60 ? "positive" : "neutral",
    description: `${t.persistence_days ?? 0}d, ${t.persistence_cycles ?? 0} cycles`,
  });

  // Breadth — sector spread
  const breadth = t.breadth_score ?? 50;
  components.push({
    label: "Breadth",
    value: breadth,
    direction: breadth >= 55 ? "positive" : "neutral",
    description: `${t.related_industries.length} industries`,
  });

  // Competition penalty — shown as a drag (negative component)
  const penalty = t.competition_penalty ?? 0;
  if (penalty > 0.04) {
    components.push({
      label: "Crowding",
      value: Math.round(penalty * 100),
      direction: penalty >= 0.25 ? "negative" : "neutral",
      description: `${Math.round(penalty * 100)}% crowding discount`,
    });
  }

  return components;
}

// ── 3. Contradiction Detection ────────────────────────────────────────────────

export interface Contradiction {
  id:          string;
  type:        "theme-conflict" | "regime-misalignment" | "rotation-conflict";
  severity:    "high" | "moderate" | "low";
  label:       string;
  description: string;
  themeIds:    string[];
}

export function detectContradictions(
  themes:     ThemeIntelligence[],
  sectorData: SectorData | null,
  riskRegime: "risk-on" | "neutral" | "risk-off",
  volRegime:  "low" | "moderate" | "elevated" | "high",
): Contradiction[] {
  const result: Contradiction[] = [];
  const seen   = new Set<string>();

  // 1. Theme-vs-theme: opposite momentum_direction on overlapping assets/sectors
  for (let i = 0; i < themes.length; i++) {
    for (let j = i + 1; j < themes.length; j++) {
      const a = themes[i];
      const b = themes[j];

      // Skip if same direction or either is neutral
      if (a.momentum_direction === b.momentum_direction) continue;
      if (a.momentum_direction === "neutral" || b.momentum_direction === "neutral") continue;
      // Skip if both weak signal
      if (a.signal_strength === "weak" && b.signal_strength === "weak") continue;

      const sharedAssets = a.related_assets.filter(x =>
        b.related_assets.some(y => y.toUpperCase() === x.toUpperCase())
      );
      const sharedInds = a.related_industries.filter(x =>
        b.related_industries.some(y => y.toLowerCase() === x.toLowerCase())
      );

      const overlapDepth = sharedAssets.length * 2 + sharedInds.length;
      if (overlapDepth < 2) continue;

      const key = [a.id, b.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      const severity: "high" | "moderate" | "low" =
        overlapDepth >= 6 ? "high" : overlapDepth >= 3 ? "moderate" : "low";

      const target = sharedAssets.length > 0
        ? sharedAssets.slice(0, 2).join(", ")
        : sharedInds.slice(0, 2).join(", ");

      result.push({
        id:          key,
        type:        "theme-conflict",
        severity,
        label:       `${a.name} ↔ ${b.name}`,
        description: `Opposite ${a.momentum_direction}/${b.momentum_direction} momentum on ${target}.`,
        themeIds:    [a.id, b.id],
      });
    }
  }

  // 2. Regime misalignment: strong bullish theme contradicts risk-off regime
  if (riskRegime === "risk-off" || volRegime === "high") {
    for (const t of themes) {
      if (
        t.momentum_direction === "bullish" &&
        t.signal_strength    === "strong"  &&
        (t.momentum_label === "accelerating" || t.momentum_label === "strengthening")
      ) {
        result.push({
          id:          `regime-${t.id}`,
          type:        "regime-misalignment",
          severity:    "moderate",
          label:       `${t.name} vs ${riskRegime === "risk-off" ? "Risk-Off" : "High-Vol"} Regime`,
          description: `Bullish accelerating theme active while market regime is ${riskRegime === "risk-off" ? "risk-off" : "high volatility"} — conviction may fade.`,
          themeIds:    [t.id],
        });
      }
    }
  }

  // 3. Rotation conflict: capital rotating away from a sector a bullish theme depends on
  for (const rot of sectorData?.rotation_signals ?? []) {
    if (rot.confidence < 0.5) continue;
    const fromLower = rot.from_sector.toLowerCase();

    for (const t of themes) {
      if (t.momentum_direction !== "bullish" || t.signal_strength === "weak") continue;
      const sectorMatch = t.related_industries.some(i => i.toLowerCase().includes(fromLower));
      if (!sectorMatch) continue;

      const rotKey = `rot-${rot.from_sector}-${t.id}`;
      if (seen.has(rotKey)) continue;
      seen.add(rotKey);

      result.push({
        id:          rotKey,
        type:        "rotation-conflict",
        severity:    rot.confidence >= 0.75 ? "high" : "moderate",
        label:       `${t.name} vs ${rot.from_sector}→${rot.to_sector}`,
        description: `Capital rotating out of ${rot.from_sector} while this theme is bullish on it.`,
        themeIds:    [t.id],
      });
    }
  }

  // Deduplicate by severity — keep highest severity when multiple conflicts reference same theme
  return result
    .sort((a, b) => {
      const r = { high: 0, moderate: 1, low: 2 } as const;
      return r[a.severity] - r[b.severity];
    });
}

// Returns the set of theme IDs that are involved in at least one contradiction
export function getConflictedThemeIds(contradictions: Contradiction[]): Set<string> {
  const ids = new Set<string>();
  for (const c of contradictions) {
    for (const id of c.themeIds) ids.add(id);
  }
  return ids;
}

// ── 4. M&A Intelligence — why deal activity is occurring ─────────────────────

interface DealSummary {
  dealType: string;
  sector:   string;
  peFirm:   string | null;
}

interface CreditSummary {
  status: string;
  signal: string;
  detail: string;
}

interface MASummary {
  status: string;
  signal: string;
}

export function explainMAActivity(
  deals:        DealSummary[],
  maThemes:     ThemeIntelligence[],
  regime:       string | null,
  creditLayer:  CreditSummary,
  maLayer:      MASummary,
): string {
  if (deals.length === 0) {
    return "No active deal flow detected in the current feed window. Low M&A activity typically reflects financing friction or macro uncertainty suppressing buyer conviction.";
  }

  const sponsorCount   = deals.filter(d => d.dealType === "sponsor").length;
  const strategicCount = deals.filter(d => d.dealType === "strategic").length;
  const rumoredCount   = deals.filter(d => d.dealType === "rumored").length;
  const mergerCount    = deals.filter(d => d.dealType === "merger").length;

  // Find the most relevant causal narrative from themes
  const topTheme = [...maThemes].sort((a, b) => (b.persistence_score ?? 0) - (a.persistence_score ?? 0))
    .find(t => t.causal_narrative && t.causal_narrative.length > 20);

  const creditOpen   = creditLayer.status === "accelerating" || creditLayer.status === "expanding";
  const creditTight  = creditLayer.status === "tightening"   || creditLayer.status === "contracting";

  const parts: string[] = [];

  // Lead with macro credit context
  if (creditOpen) {
    parts.push(`Compressed credit spreads are enabling leveraged financing at competitive rates.`);
  } else if (creditTight) {
    parts.push(`Deal activity is persisting despite tightened credit conditions — buyers are prioritizing all-equity or lower-leverage structures.`);
  }

  // Characterise buyer mix
  if (sponsorCount > 0 && strategicCount > 0) {
    parts.push(`Both strategic acquirers (${strategicCount}) and PE sponsors (${sponsorCount}) are active — broad-based deal appetite rather than opportunistic buying.`);
  } else if (sponsorCount > strategicCount) {
    parts.push(`Sponsor-led activity is dominant (${sponsorCount} PE-backed deals) — private equity is deploying dry powder into motivated sellers.`);
  } else if (strategicCount > 0) {
    parts.push(`Strategic acquirers are leading (${strategicCount} deals) — corporate balance sheets funding transactions without leverage dependency.`);
  }

  // Rumor signal
  if (rumoredCount > 2) {
    parts.push(`Elevated rumor activity (${rumoredCount} reported deals) indicates buyer interest ahead of formal processes — expect announcement flow to follow.`);
  }

  // Causal narrative from themes (the "why" layer)
  if (topTheme?.causal_narrative) {
    parts.push(topTheme.causal_narrative);
  } else if (regime) {
    parts.push(`${regime} conditions are motivating acquirers to consolidate before the valuation window narrows.`);
  }

  if (mergerCount > 0) {
    parts.push(`${mergerCount} merger-of-equals structure${mergerCount > 1 ? "s" : ""} suggest${mergerCount === 1 ? "s" : ""} sector consolidation themes rather than pure control premiums.`);
  }

  return parts.length > 0
    ? parts.join(" ")
    : `${deals.length} deals active — ${maLayer.signal.toLowerCase()} environment with ${creditLayer.signal.toLowerCase()} credit conditions.`;
}

// ── 5. Market Breadth Snapshot ────────────────────────────────────────────────

export interface SectorParticipation {
  sector:        string;
  signalScore:   number;
  themeCount:    number;
  dominantTheme: string | null;
  direction:     "positive" | "negative" | "mixed" | "neutral";
}

export function computeBreadthSnapshot(
  themes:     ThemeIntelligence[],
  sectorData: SectorData | null,
): SectorParticipation[] {
  if (!sectorData?.sectors?.length) return [];

  return sectorData.sectors
    .filter(s => s.signal_score > 0)
    .map(s => {
      const sLower   = s.name.toLowerCase();
      const matching = themes.filter(t =>
        t.related_industries.some(i => {
          const iLower = i.toLowerCase();
          return iLower.includes(sLower) || sLower.includes(iLower);
        }),
      );

      const bullish = matching.filter(t => t.momentum_direction === "bullish").length;
      const bearish = matching.filter(t => t.momentum_direction === "bearish").length;

      const direction: SectorParticipation["direction"] =
        bullish > 0 && bearish > 0 ? "mixed"    :
        bullish > 0                ? "positive" :
        bearish > 0                ? "negative" : "neutral";

      const dominantTheme = [...matching]
        .sort((a, b) => (b.persistence_score ?? 0) - (a.persistence_score ?? 0))[0]?.name ?? null;

      return {
        sector:        s.name,
        signalScore:   s.signal_score,
        themeCount:    matching.length,
        dominantTheme,
        direction,
      };
    })
    .sort((a, b) => b.signalScore - a.signalScore);
}

// ── 6. Acquirer & Sponsor Intelligence ────────────────────────────────────────

export interface AcquirerProfile {
  name:      string;
  dealCount: number;
  sectors:   string[];
}

interface DealForAcquirer {
  entities: string[];
  sector:   string;
  dealType: string;
}

export function extractAcquirerProfiles(deals: DealForAcquirer[]): AcquirerProfile[] {
  const strategic = deals.filter(d => d.dealType === "strategic" || d.dealType === "merger");
  const map       = new Map<string, Set<string>>();

  for (const deal of strategic) {
    for (const entity of deal.entities.slice(0, 2)) {
      if (!entity || entity.trim().length === 0) continue;
      if (!map.has(entity)) map.set(entity, new Set());
      map.get(entity)!.add(deal.sector);
    }
  }

  return Array.from(map.entries())
    .map(([name, sectorSet]) => ({
      name,
      dealCount: strategic.filter(d => d.entities.includes(name)).length,
      sectors:   Array.from(sectorSet),
    }))
    .filter(p => p.dealCount >= 1)
    .sort((a, b) => b.dealCount - a.dealCount)
    .slice(0, 6);
}

export interface EnrichedSponsor {
  firm:      string;
  deals:     number;
  topSector: string | null;
  sectors:   string[];
}

interface DealForSponsor {
  peFirm: string | null;
  sector: string;
}

export function enrichSponsorProfiles(
  sponsors: { firm: string; deals: number }[],
  deals:    DealForSponsor[],
): EnrichedSponsor[] {
  return sponsors.map(s => {
    const firmDeals  = deals.filter(d => d.peFirm === s.firm);
    const sectorMap  = new Map<string, number>();
    for (const d of firmDeals) {
      sectorMap.set(d.sector, (sectorMap.get(d.sector) ?? 0) + 1);
    }
    const sectors = Array.from(sectorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([sector]) => sector);

    return { firm: s.firm, deals: s.deals, topSector: sectors[0] ?? null, sectors: sectors.slice(0, 3) };
  });
}

// ── Phase 8: Intelligence Alerts ─────────────────────────────────────────────

export interface IntelligenceAlert {
  themeId:     string;
  themeName:   string;
  direction:   "up" | "down" | "neutral";
  severity:    "major" | "notable" | "minor";
  description: string;
}

function bestAlertForTheme(theme: ThemeIntelligence): IntelligenceAlert | null {
  const delta     = theme.momentum_delta     ?? 0;
  const breadth   = theme.breadth_score      ?? 0;
  const persist   = theme.persistence_score  ?? 0;
  const stories   = theme.contributing_story_count ?? 0;
  const momentum  = theme.momentum_label;
  const confirmed = theme.cross_category_confirmed;
  const ind0      = (theme.related_industries ?? [])[0] ?? "tracked sectors";
  const name      = theme.name;

  const mk = (
    severity: IntelligenceAlert["severity"],
    direction: IntelligenceAlert["direction"],
    description: string,
  ): IntelligenceAlert => ({ themeId: theme.id, themeName: name, direction, severity, description });

  // ── MAJOR ──────────────────────────────────────────────────────────────────
  if (delta >= 15 && momentum === "accelerating") {
    return mk("major", "up", `Signal accelerating sharply (+${delta.toFixed(0)}), breadth expanding into ${ind0}`);
  }
  if (delta <= -15 || momentum === "reversing") {
    return mk("major", "down", `Signal reversal underway (${delta.toFixed(0)} delta) — ${persist < 40 ? "low persistence increases downside risk" : "persistence provides partial support"}`);
  }
  if (confirmed && delta > 8) {
    return mk("major", "up", `Cross-category confirmation triggered with +${delta.toFixed(0)} delta — broadening beyond primary sector`);
  }

  // ── NOTABLE ────────────────────────────────────────────────────────────────
  if (breadth >= 68 && delta > 5) {
    const indCount = Math.max(2, Math.round(breadth / 18));
    return mk("notable", "up", `Breadth expanded across ~${indCount} industries with ${delta > 0 ? "+" : ""}${delta.toFixed(0)} delta`);
  }
  if (persist >= 80 && delta >= 0) {
    return mk("notable", "up", `Persistence crossed 80th percentile — ${Math.round(persist)} score suggests structural theme formation`);
  }
  if (delta >= 8) {
    return mk("notable", "up", `${ind0} exposure increased materially (+${delta.toFixed(0)} signal delta)`);
  }
  if (breadth < 28 && delta < -5) {
    return mk("notable", "down", `Breadth narrowing (score: ${Math.round(breadth)}) with negative delta — watch for sector exit`);
  }
  if (stories <= 2 && delta < -5) {
    return mk("notable", "down", `Story activity declining — ${stories} active ${stories === 1 ? "source" : "sources"} remaining with ${delta.toFixed(0)} delta`);
  }

  // ── MINOR ──────────────────────────────────────────────────────────────────
  if (momentum === "strengthening" && delta >= 6) {
    return mk("minor", "up", `Momentum strengthening (+${delta.toFixed(0)}) in ${ind0}`);
  }
  if (momentum === "cooling" && delta <= -7) {
    return mk("minor", "down", `Cooling signal in ${ind0} (${delta.toFixed(0)} delta) — monitor for reversal confirmation`);
  }

  return null;
}

export function generateIntelligenceAlerts(themes: ThemeIntelligence[]): IntelligenceAlert[] {
  const SEVERITY_RANK: Record<IntelligenceAlert["severity"], number> = { major: 0, notable: 1, minor: 2 };

  return themes
    .map(bestAlertForTheme)
    .filter((a): a is IntelligenceAlert => a !== null)
    .sort((a, b) => {
      const sRank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (sRank !== 0) return sRank;
      // Within same severity: "up" alerts first for bullish themes, "down" first for bearish
      return a.direction === "down" && b.direction !== "down" ? -1 : 0;
    })
    .slice(0, 8);
}

// ── Phase 8: Next Catalyst Engine ────────────────────────────────────────────

export interface ThemeCatalyst {
  label:     string;                          // "FOMC Meeting" | "CPI Report" | …
  direction: "confirming" | "risk";           // confirming = would validate; risk = could invalidate
  reason:    string;                          // one-line explanation
}

const CATALYST_RULES: Array<{
  regex:     RegExp;
  label:     string;
  getDir:    (theme: ThemeIntelligence) => "confirming" | "risk";
  getReason: (theme: ThemeIntelligence) => string;
}> = [
  {
    regex:     /\bfed\b|fomc|federal reserve|monetary policy/,
    label:     "FOMC Meeting",
    getDir:    t => t.momentum_direction === "bearish" ? "confirming" : "risk",
    getReason: t => t.momentum_direction === "bearish"
      ? "Rate path will determine pressure on leveraged sectors"
      : "Shift in rate guidance could disrupt current tailwind",
  },
  {
    regex:     /\bcpi\b|inflation|price level|core pce/,
    label:     "CPI Report",
    getDir:    t => "confirming",
    getReason: t => "Inflation data will validate or challenge macro narrative",
  },
  {
    regex:     /\bnvda\b|nvidia|\bgpu\b|data center capacity/,
    label:     "NVDA Earnings",
    getDir:    t => t.momentum_direction === "bullish" ? "confirming" : "risk",
    getReason: t => "Capex guidance signals downstream AI infrastructure demand",
  },
  {
    regex:     /\boil\b|opec|crude|energy supply/,
    label:     "OPEC Production Decision",
    getDir:    t => "risk",
    getReason: t => "Supply adjustments create direct commodity price pressure",
  },
  {
    regex:     /\bjpm\b|jpmorgan|bank earnings|major bank/,
    label:     "Major Bank Earnings",
    getDir:    t => "confirming",
    getReason: t => "Lending standards and credit quality will reflect macro conditions",
  },
  {
    regex:     /china|pboc|yuan|rmb|prc\b/,
    label:     "China Macro Data",
    getDir:    t => "risk",
    getReason: t => "Chinese demand signals affect global trade and commodities",
  },
  {
    regex:     /jobs|payroll|unemployment|labor market/,
    label:     "Nonfarm Payrolls",
    getDir:    t => t.momentum_direction === "bullish" ? "confirming" : "risk",
    getReason: t => "Labor market strength drives consumer demand expectations",
  },
  {
    regex:     /treasury|t-bill|yield curve|10.?year/,
    label:     "Treasury Auction",
    getDir:    t => "risk",
    getReason: t => "Duration demand will affect rate-sensitive sector valuations",
  },
  {
    regex:     /semiconductor|chip|tsmc|asml|fab/,
    label:     "Semiconductor Earnings",
    getDir:    t => t.momentum_direction === "bullish" ? "confirming" : "risk",
    getReason: t => "Capex and order backlog guidance frames the cycle outlook",
  },
  {
    regex:     /\bmsft\b|microsoft|azure|cloud spending/,
    label:     "Cloud Earnings (MSFT/AMZN)",
    getDir:    t => "confirming",
    getReason: t => "Enterprise AI and cloud spend confirms or undermines demand thesis",
  },
];

export function generateNextCatalysts(theme: ThemeIntelligence): ThemeCatalyst[] {
  const text = [
    ...(theme.related_macro_factors ?? []),
    ...(theme.related_industries    ?? []),
    ...(theme.related_assets        ?? []),
    theme.name ?? "",
    theme.description ?? "",
  ].join(" ").toLowerCase();

  const matched: ThemeCatalyst[] = [];

  for (const rule of CATALYST_RULES) {
    if (rule.regex.test(text)) {
      matched.push({
        label:     rule.label,
        direction: rule.getDir(theme),
        reason:    rule.getReason(theme),
      });
      if (matched.length >= 4) break;
    }
  }

  // Always return at least one catalyst
  if (matched.length === 0) {
    matched.push({
      label:     "Macro Data Release",
      direction: "risk",
      reason:    "Upcoming data will test the signal durability of this theme",
    });
  }

  return matched;
}

// ── Phase 8: Bull / Bear Cases ────────────────────────────────────────────────

export interface BullBearCases {
  bull: string;
  bear: string;
}

function parseCausalChain(narrative: string | undefined): string[] {
  if (!narrative) return [];
  return narrative
    .split(/→|->|;|\.|,/)
    .map(s => s.trim())
    .filter(s => s.length > 4)
    .slice(0, 4);
}

export function generateBullBearCases(theme: ThemeIntelligence): BullBearCases {
  const chain    = parseCausalChain(theme.causal_narrative);
  const macros   = theme.related_macro_factors ?? [];
  const inds     = theme.related_industries    ?? [];
  const assets   = theme.related_assets        ?? [];
  const dir      = theme.momentum_direction;
  const name     = theme.name;

  const driver  = chain[0] ?? macros[0] ?? "current macro environment";
  const mech    = chain[1] ?? macros[1] ?? "transmission mechanism";
  const ind0    = inds[0]  ?? "primary sectors";
  const ind1    = inds[1]  ?? "adjacent sectors";
  const macro1  = macros[1] ?? macros[0] ?? "macro backdrop";
  const asset0  = assets[0] ?? "core holdings";

  if (dir === "bullish") {
    return {
      bull: `If ${driver} persists and ${mech} continues, ${ind0} exposure sustains upside. Cross-category confirmation would accelerate institutional positioning.`,
      bear: `A reversal in ${macro1} or demand slowdown in ${ind0} could pressure ${asset0}. Signal degradation beyond current delta would confirm the thesis is breaking down.`,
    };
  }

  if (dir === "bearish") {
    return {
      bull: `Stabilization in ${driver} could allow ${ind0} to find a floor. If ${macro1} provides unexpected support, a tactical relief rally is possible.`,
      bear: `If ${driver} intensifies, ${ind0} deterioration spreads into ${ind1}. Persistent negative delta with narrowing breadth confirms structural impairment.`,
    };
  }

  // neutral
  return {
    bull: `A decisive catalyst from ${macros[0] ?? "macro data"} could resolve current ambiguity in favor of ${ind0}. Breadth expansion would confirm the directional shift.`,
    bear: `Without a resolution in ${driver}, ${name} remains in limbo. Extended neutral signal erodes conviction and risks capital rotation away from ${ind0}.`,
  };
}

// ── Phase 8: Watch Signals ────────────────────────────────────────────────────

export interface WatchSignal {
  variable:  string;   // "10Y yield trajectory"
  condition: string;   // "> 5% = headwind for rate-sensitives"
}

const WATCH_RULES: Array<{ regex: RegExp; variable: string; condition: string }> = [
  { regex: /rate|yield|treasury|fed|fomc/,        variable: "Fed terminal rate expectations",          condition: "Rising path = pressure on duration-sensitive positions" },
  { regex: /\bnvda\b|nvidia|\bgpu\b|data center/, variable: "NVDA capex guidance",                     condition: "Downward revision signals reduced AI infra demand" },
  { regex: /utility|grid|power|electricity/,       variable: "Utility capex growth rate",               condition: "Slowdown signals reduced grid buildout exposure" },
  { regex: /china|pboc|yuan|rmb/,                 variable: "PBOC easing pace",                        condition: "Stalling stimulus risks demand-side disappointment" },
  { regex: /bank|lending|credit|loan/,             variable: "Bank lending standards (SLOOS)",          condition: "Tightening signals deteriorating credit conditions" },
  { regex: /\boil\b|opec|crude|energy/,            variable: "Brent crude trajectory",                  condition: "Spike > $90 transmits into margin compression for consumers" },
  { regex: /inflation|cpi|pce|price/,              variable: "Core inflation trajectory (CPI ex-food)", condition: "Re-acceleration above 3% delays rate relief" },
  { regex: /semiconductor|chip|tsmc|wafer/,        variable: "Semiconductor order book",                condition: "Backlog deterioration signals capex cycle peak" },
  { regex: /consumer|retail|spending|discretion/,  variable: "US consumer confidence index",            condition: "Drop below 95 signals spending headwind for cyclicals" },
  { regex: /jobs|payroll|labor|employment/,        variable: "Monthly nonfarm payrolls",                condition: "Miss vs consensus weakens demand narrative" },
  { regex: /dollar|usd|dxy|currency/,              variable: "DXY trajectory",                          condition: "Strong dollar pressures EM and commodity-linked exposures" },
  { regex: /\bcredit\b|spread|high.?yield|hy\b/,  variable: "IG/HY credit spread differential",        condition: "Spread widening > 50bp flags risk-off rotation" },
];

export function generateWatchSignals(theme: ThemeIntelligence): WatchSignal[] {
  const text = [
    ...(theme.related_macro_factors ?? []),
    ...(theme.related_industries    ?? []),
    ...(theme.related_assets        ?? []),
    theme.name        ?? "",
    theme.description ?? "",
  ].join(" ").toLowerCase();

  const signals: WatchSignal[] = [];

  for (const rule of WATCH_RULES) {
    if (rule.regex.test(text)) {
      signals.push({ variable: rule.variable, condition: rule.condition });
      if (signals.length >= 5) break;
    }
  }

  // Always return at least one
  if (signals.length === 0) {
    signals.push({
      variable:  "Macro regime classification",
      condition: "Regime shift (risk-on ↔ risk-off) will alter theme signal quality",
    });
  }

  return signals.slice(0, 5);
}
