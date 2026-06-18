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
          description: `Bullish accelerating theme active while market regime is ${riskRegime === "risk-off" ? "risk-off" : "high volatility"}. Conviction may fade.`,
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
    parts.push(`Deal activity is persisting despite tightened credit conditions. Buyers are prioritizing all-equity or lower-leverage structures.`);
  }

  // Characterise buyer mix
  if (sponsorCount > 0 && strategicCount > 0) {
    parts.push(`Both strategic acquirers (${strategicCount}) and PE sponsors (${sponsorCount}) are active. Broad-based deal appetite rather than opportunistic buying.`);
  } else if (sponsorCount > strategicCount) {
    parts.push(`Sponsor-led activity is dominant (${sponsorCount} PE-backed deals). Private equity is deploying dry powder into motivated sellers.`);
  } else if (strategicCount > 0) {
    parts.push(`Strategic acquirers are leading (${strategicCount} deals). Corporate balance sheets funding transactions without leverage dependency.`);
  }

  // Rumor signal
  if (rumoredCount > 2) {
    parts.push(`Elevated rumor activity (${rumoredCount} reported deals) indicates buyer interest ahead of formal processes. Expect announcement flow to follow.`);
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
    : `${deals.length} deals active, ${maLayer.signal.toLowerCase()} environment with ${creditLayer.signal.toLowerCase()} credit conditions.`;
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
    return mk("major", "down", `Signal reversal underway (${delta.toFixed(0)} delta), ${persist < 40 ? "low persistence increases downside risk" : "persistence provides partial support"}`);
  }
  if (confirmed && delta > 8) {
    return mk("major", "up", `Cross-category confirmation triggered with +${delta.toFixed(0)} delta. Broadening beyond primary sector`);
  }

  // ── NOTABLE ────────────────────────────────────────────────────────────────
  if (breadth >= 68 && delta > 5) {
    const indCount = Math.max(2, Math.round(breadth / 18));
    return mk("notable", "up", `Breadth expanded across ~${indCount} industries with ${delta > 0 ? "+" : ""}${delta.toFixed(0)} delta`);
  }
  if (persist >= 80 && delta >= 0) {
    return mk("notable", "up", `Persistence crossed 80th percentile, ${Math.round(persist)} score suggests a durable, structurally embedded trend`);
  }
  if (delta >= 8) {
    return mk("notable", "up", `${ind0} exposure increased materially (+${delta.toFixed(0)} signal delta)`);
  }
  if (breadth < 28 && delta < -5) {
    return mk("notable", "down", `Breadth narrowing (score: ${Math.round(breadth)}) with negative delta. Watch for sector exit`);
  }
  if (stories <= 2 && delta < -5) {
    return mk("notable", "down", `Story activity declining, ${stories} active ${stories === 1 ? "source" : "sources"} remaining with ${delta.toFixed(0)} delta`);
  }

  // ── MINOR ──────────────────────────────────────────────────────────────────
  if (momentum === "strengthening" && delta >= 6) {
    return mk("minor", "up", `Momentum strengthening (+${delta.toFixed(0)}) in ${ind0}`);
  }
  if (momentum === "cooling" && delta <= -7) {
    return mk("minor", "down", `Cooling signal in ${ind0} (${delta.toFixed(0)} delta). Monitor for reversal confirmation`);
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
  label:       string;
  direction:   "confirming" | "risk";
  reason:      string;
  sensitivity: "High" | "Medium" | "Low";
}

const CATALYST_RULES: Array<{
  regex:          RegExp;
  label:          string;
  getDir:         (t: ThemeIntelligence) => "confirming" | "risk";
  getReason:      (t: ThemeIntelligence) => string;
  getSensitivity: (t: ThemeIntelligence) => "High" | "Medium" | "Low";
}> = [
  {
    regex:          /\bfed\b|fomc|federal reserve|monetary policy/,
    label:          "FOMC Meeting",
    getDir:         t => t.momentum_direction === "bearish" ? "confirming" : "risk",
    getReason:      t => t.momentum_direction === "bearish"
      ? "Rate path directly determines duration pressure on leveraged sectors central to this thesis"
      : "Dovish pivot would compress the rate differential this theme's thesis depends on",
    getSensitivity: t => t.signal_strength === "strong" ? "High" : "Medium",
  },
  {
    regex:          /\bcpi\b|inflation|price level|core pce/,
    label:          "CPI Report",
    getDir:         _t => "confirming",
    getReason:      t => t.momentum_direction === "bullish"
      ? "Cooling inflation would accelerate the rate relief that underpins margin expansion for this theme"
      : "Re-acceleration would validate the inflationary pressure central to the bearish case",
    getSensitivity: _t => "High",
  },
  {
    regex:          /\bnvda\b|nvidia|\bgpu\b|data center capacity/,
    label:          "NVDA Earnings",
    getDir:         t => t.momentum_direction === "bullish" ? "confirming" : "risk",
    getReason:      _t => "Capex guidance is the leading indicator for downstream AI infrastructure demand. Directly links to this theme's beneficiary thesis",
    getSensitivity: _t => "High",
  },
  {
    regex:          /\boil\b|opec|crude|energy supply/,
    label:          "OPEC Production Decision",
    getDir:         _t => "risk",
    getReason:      _t => "Supply-side production shifts create direct commodity price pressure that transmits into input costs and margin assumptions",
    getSensitivity: _t => "Medium",
  },
  {
    regex:          /\bjpm\b|jpmorgan|bank earnings|major bank/,
    label:          "Major Bank Earnings",
    getDir:         _t => "confirming",
    getReason:      _t => "Loan book quality and lending standard guidance reveals whether credit tightening is affecting the sectors this theme is exposed to",
    getSensitivity: _t => "Medium",
  },
  {
    regex:          /china|pboc|yuan|rmb|prc\b/,
    label:          "China Macro Data",
    getDir:         _t => "risk",
    getReason:      t => {
      const ind0 = (t.related_industries ?? [])[0] ?? "core sectors";
      return `Chinese demand weakness would remove the global demand floor supporting ${ind0} positioning`;
    },
    getSensitivity: t => (t.related_industries ?? []).some(i => /commodity|material|energy|industrial/i.test(i)) ? "High" : "Low",
  },
  {
    regex:          /jobs|payroll|unemployment|labor market/,
    label:          "Nonfarm Payrolls",
    getDir:         t => t.momentum_direction === "bullish" ? "confirming" : "risk",
    getReason:      _t => "Labor market resilience sustains consumer demand visibility. A beat validates the top-line revenue assumptions embedded in this theme",
    getSensitivity: _t => "Medium",
  },
  {
    regex:          /treasury|t-bill|yield curve|10.?year/,
    label:          "Treasury Auction",
    getDir:         _t => "risk",
    getReason:      _t => "Weak demand at auction steepens the long end, increasing discount rates for rate-sensitive holdings in this theme",
    getSensitivity: _t => "Low",
  },
  {
    regex:          /semiconductor|chip|tsmc|asml|fab/,
    label:          "Semiconductor Earnings",
    getDir:         t => t.momentum_direction === "bullish" ? "confirming" : "risk",
    getReason:      _t => "Order backlog and capex guidance determines whether the supply cycle is inflecting. The clearest leading indicator for this theme's duration",
    getSensitivity: _t => "High",
  },
  {
    regex:          /\bmsft\b|microsoft|azure|cloud spending/,
    label:          "Cloud Earnings (MSFT/AMZN)",
    getDir:         _t => "confirming",
    getReason:      _t => "Enterprise AI and cloud spend growth rate is the primary validation signal for the infrastructure buildout thesis. A miss would reduce conviction materially",
    getSensitivity: _t => "High",
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
        label:       rule.label,
        direction:   rule.getDir(theme),
        reason:      rule.getReason(theme),
        sensitivity: rule.getSensitivity(theme),
      });
      if (matched.length >= 4) break;
    }
  }

  // Always return at least one catalyst
  if (matched.length === 0) {
    matched.push({
      label:       "Macro Data Release",
      direction:   "risk",
      reason:      "An unexpected macro regime shift would remove the structural basis for current positioning",
      sensitivity: "Medium",
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
    bull: `A decisive catalyst from ${macros[0] ?? "macro data"} could resolve the current ambiguity in favor of ${ind0}. Breadth expansion would confirm which way the theme resolves.`,
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

// ── Phase 9: Evidence & Validation Layer ────────────────────────────────────

export interface EvidenceItem {
  label: string;
  type:  "positive" | "neutral";
}

export function generateEvidenceItems(theme: ThemeIntelligence): EvidenceItem[] {
  const delta    = theme.momentum_delta           ?? 0;
  const breadth  = theme.breadth_score            ?? 0;
  const persist  = theme.persistence_score        ?? 0;
  const cycles   = theme.persistence_cycles       ?? 0;
  const stories  = theme.contributing_story_count ?? 0;
  const evidence = theme.evidence_count           ?? 0;
  const momentum = theme.momentum_label;
  const confirmed = theme.cross_category_confirmed;
  const inds     = theme.related_industries       ?? [];
  const ind0     = inds[0] ?? null;
  const ind1     = inds[1] ?? null;
  const relCount = Object.keys(theme.relationship_weights ?? {}).length;
  const out: EvidenceItem[] = [];

  if (delta >= 14) {
    out.push({ type: "positive", label: `Signal velocity is surging (+${Math.round(delta)}). This looks like an institutional attention event rather than incremental noise` });
  } else if (delta >= 6) {
    out.push({ type: "positive", label: `Positive signal drift (+${Math.round(delta)}) confirms the thesis is gaining traction above the noise floor` });
  }

  if (confirmed) {
    const note = ind1 ? `across ${ind0} and ${ind1}` : ind0 ? `into ${ind0}` : "beyond the primary sector";
    out.push({ type: "positive", label: `Cross-category confirmation active. Signal has propagated ${note}, reducing false-positive risk` });
  }

  if (breadth >= 80) {
    const indNote = ind0 && ind1 ? `${ind0} and ${ind1}` : ind0 ? ind0 : "multiple sectors";
    out.push({ type: "positive", label: `Demand is broadening across ${indNote}. This is thematic, not sector-specific` });
  } else if (breadth >= 58 && !confirmed) {
    const cnt  = Math.max(2, Math.round(breadth / 18));
    const note = ind0 && ind1 ? `${ind0} and ${ind1}` : ind0 ? ind0 : `${cnt} sectors`;
    out.push({ type: "positive", label: `Exposure is expanding, ${note} both showing active participation` });
  }

  if (stories >= 10) {
    out.push({ type: "positive", label: `Coverage density is high (${stories} active sources). Signal has institutional attention, not just retail noise` });
  } else if (stories >= 5) {
    out.push({ type: "positive", label: `${stories} active sources confirming. Broad enough to rule out single-outlet bias` });
  } else if (stories >= 2) {
    out.push({ type: "neutral", label: `${stories} sources in active coverage. Adequate for monitoring, not broad confirmation` });
  }

  if (cycles >= 8) {
    out.push({ type: "positive", label: `${cycles}-cycle persistence classifies this as structurally embedded. Not a news-cycle phenomenon` });
  } else if (cycles >= 4) {
    out.push({ type: "positive", label: `${cycles} consecutive cycles of sustained signal. Persistence is a structural characteristic, not survival bias` });
  }

  if (evidence >= 8) {
    out.push({ type: "positive", label: `${evidence} independent evidence sources. Corroboration depth supports higher conviction allocation` });
  } else if (evidence >= 4) {
    out.push({ type: "neutral", label: `${evidence} confirming sources. Sufficient for thesis support, short of high-conviction threshold` });
  }

  if (momentum === "accelerating" && delta < 14) {
    out.push({ type: "positive", label: `Acceleration confirmed in ${ind0 ?? "tracked sectors"}. Institutions appear to be positioning early` });
  } else if (momentum === "strengthening") {
    out.push({ type: "positive", label: "Signal quality is improving. Strengthening momentum reduces the probability this is noise" });
  }

  if (relCount >= 4) {
    out.push({ type: "positive", label: `${relCount} confirmed links to related themes. Systematic exposure rather than isolated move` });
  }

  if (persist >= 78 && cycles < 4) {
    out.push({ type: "positive", label: `Persistence score of ${Math.round(persist)} exceeds structural threshold. Foundational characteristics present despite early stage` });
  }

  return out.slice(0, 5);
}

// ── Conviction Explanation ────────────────────────────────────────────────────

export interface ConvictionExplanation {
  tone:    "driven" | "limited";
  factors: Array<{ label: string; positive: boolean }>;
}

export function explainConviction(theme: ThemeIntelligence, conviction: number): ConvictionExplanation {
  const breadth  = theme.breadth_score            ?? 0;
  const persist  = theme.persistence_score        ?? 0;
  const delta    = theme.momentum_delta           ?? 0;
  const cycles   = theme.persistence_cycles       ?? 0;
  const stories  = theme.contributing_story_count ?? 0;
  const evidence = theme.evidence_count           ?? 0;
  const penalty  = theme.competition_penalty      ?? 0;
  const confirmed = theme.cross_category_confirmed;
  const inds     = theme.related_industries       ?? [];
  const ind0     = inds[0] ?? null;
  const ind1     = inds[1] ?? null;

  const pos: string[] = [];
  const neg: string[] = [];

  if (breadth >= 65) {
    pos.push(
      ind0 && ind1 ? `Broad participation, ${ind0} and ${ind1} both confirming` :
      ind0         ? `Broad participation, ${ind0} and adjacent sectors confirming` :
                     "Broad sector participation"
    );
  }
  if (confirmed)                            pos.push("Cross-category confirmation. Signal extends beyond primary sector");
  if (persist >= 70)                        pos.push(`Persistence at ${Math.round(persist)}. Signal has structural durability`);
  if (stories >= 6)                         pos.push(`${stories} active sources. Coverage depth supports thesis`);
  if (evidence >= 5)                        pos.push(`${evidence} independent evidence points. Corroboration is broad`);
  if (theme.signal_strength === "strong")  pos.push("Strong signal classification. Above institutional attention threshold");
  if (delta >= 8)                           pos.push(`Accelerating delta (+${Math.round(delta)}). Momentum is building`);
  if (cycles >= 5)                          pos.push(`${cycles}-cycle track record. Structural credibility established`);

  if (breadth < 35) {
    neg.push(
      ind0 ? `Confirmation concentrated in ${ind0} only. Breadth has not yet confirmed the move` :
              "Sector participation is narrow"
    );
  }
  if (persist < 30)   neg.push("Persistence below threshold. Signal may not sustain");
  if (evidence < 3)   neg.push("Thin evidence base. Corroboration insufficient for high conviction");
  if (penalty > 30)   neg.push("Signal crowding detected. The edge may be competed away");
  if (stories <= 2)   neg.push("Low coverage depth. Signal may be premature or noise");
  if (delta < -8)     neg.push(`Declining velocity (${Math.round(delta)}). Thesis is losing momentum`);

  const tone = conviction >= 55 ? "driven" : "limited";
  const factors =
    tone === "driven"
      ? [
          ...pos.slice(0, 3).map(l => ({ label: l, positive: true  })),
          ...neg.slice(0, 1).map(l => ({ label: l, positive: false })),
        ]
      : [
          ...neg.slice(0, 3).map(l => ({ label: l, positive: false })),
          ...pos.slice(0, 1).map(l => ({ label: l, positive: true  })),
        ];

  return { tone, factors };
}

// ── Theme Health Score ────────────────────────────────────────────────────────

export interface ThemeHealthScore {
  label: "Excellent" | "Healthy" | "Watch" | "Fragile" | "Breaking";
  score: number;   // 0-100
  color: string;
}

const HEALTH_COLORS: Record<string, string> = {
  Excellent: "#10B981",
  Healthy:   "#34D399",
  Watch:     "#F59E0B",
  Fragile:   "#EF4444",
  Breaking:  "#DC2626",
};

export function computeThemeHealth(theme: ThemeIntelligence): ThemeHealthScore {
  const momentum = theme.momentum_label;
  const persist  = theme.persistence_score        ?? 0;
  const breadth  = theme.breadth_score            ?? 0;
  const delta    = theme.momentum_delta           ?? 0;
  const stories  = theme.contributing_story_count ?? 0;

  const signalPts =
    theme.signal_strength === "strong" ? 100 :
    theme.signal_strength === "medium" ? 60  : 20;

  const momentumPts =
    momentum === "accelerating" ? 100 :
    momentum === "strengthening" ? 80 :
    momentum === "emerging"      ? 70 :
    momentum === "stable"        ? 50 :
    momentum === "cooling"       ? 20 :
    momentum === "reversing"     ? 0  : 50;

  let raw = signalPts * 0.35 + momentumPts * 0.25 + persist * 0.25 + breadth * 0.15;
  if (delta < -12)     raw -= 12;
  else if (delta < -6) raw -= 6;
  if (stories <= 1)    raw -= 14;
  else if (stories <= 3) raw -= 5;

  const score = Math.round(Math.max(0, Math.min(100, raw)));
  const label: ThemeHealthScore["label"] =
    score >= 78 ? "Excellent" :
    score >= 58 ? "Healthy"   :
    score >= 38 ? "Watch"     :
    score >= 20 ? "Fragile"   : "Breaking";

  return { label, score, color: HEALTH_COLORS[label] };
}

// ── Thesis Invalidation Signals ───────────────────────────────────────────────

export interface InvalidationSignal {
  condition: string;
  impact:    string;
}

const INVALIDATION_RULES: Array<{ regex: RegExp; condition: string; impact: string }> = [
  {
    regex:     /utility|grid|power.grid|electric/,
    condition: "Utility capex growth decelerates materially",
    impact:    "Removes the demand floor for grid infrastructure spend, collapsing the primary revenue driver for exposed beneficiaries",
  },
  {
    regex:     /\bai\b|data.center|gpu|nvidia/,
    condition: "AI demand weakens or hyperscaler capex guidance misses",
    impact:    "Invalidates the AI infrastructure buildout thesis and collapses forward earnings estimates for primary beneficiary tickers",
  },
  {
    regex:     /\bfed\b|rate.hike|monetary|fomc/,
    condition: "Policy reversal removes rate-pressure narrative",
    impact:    "Eliminates the macro regime justification for this theme. Positions built on rate-pressure assumptions would need to be unwound",
  },
  {
    regex:     /inflation|cpi|price.level/,
    condition: "Inflation normalization alters the macro regime",
    impact:    "Softens the pricing power and margin expansion thesis. Reduces the premium assigned to inflation beneficiaries in this theme",
  },
  {
    regex:     /credit|lending|private.credit/,
    condition: "Bank lending reaccelerates, displacing alternative credit",
    impact:    "Removes the supply constraint that created the private credit opportunity. Compresses yields and reduces deal flow",
  },
  {
    regex:     /semiconductor|chip|wafer/,
    condition: "Semiconductor inventory correction extends into demand cycle",
    impact:    "Pushes out the supply-demand balance recovery, reducing near-term earnings visibility and compressing multiples",
  },
  {
    regex:     /reshoring|supply.chain|nearshore/,
    condition: "Supply chain normalization removes nearshoring urgency",
    impact:    "Reduces the policy and operational motivation for domestic capacity buildout. Capital redirected to cheaper offshore alternatives",
  },
  {
    regex:     /china|export|tariff|trade/,
    condition: "Trade normalization reduces domestic manufacturing premium",
    impact:    "Narrows the cost advantage for domestic producers. Competitive moat diminishes as tariff premium compresses",
  },
  {
    regex:     /consumer|retail|spending/,
    condition: "Consumer spending softens materially below consensus",
    impact:    "Removes top-line revenue support for consumer-exposed names. Margin compression follows volume deterioration",
  },
  {
    regex:     /\boil\b|opec|crude/,
    condition: "OPEC supply increase creates energy price headwind",
    impact:    "Lowers realized energy prices below the breakeven embedded in current positioning. Upstream profitability deteriorates rapidly",
  },
  {
    regex:     /biotech|pharma|drug/,
    condition: "Regulatory setback invalidates approval timeline assumptions",
    impact:    "Removes the near-term catalyst that is pricing-in peak probability of approval. Binary downside on a rejection",
  },
  {
    regex:     /real.estate|reit|property/,
    condition: "Rate relief removes distress thesis in real estate",
    impact:    "Diminishes the discounted asset opportunity. Competing buyers return as financing costs normalize",
  },
];

export function generateInvalidationSignals(theme: ThemeIntelligence): InvalidationSignal[] {
  const text = [
    ...(theme.related_macro_factors ?? []),
    ...(theme.related_industries    ?? []),
    ...(theme.related_assets        ?? []),
    theme.name             ?? "",
    theme.description      ?? "",
    theme.causal_narrative ?? "",
  ].join(" ").toLowerCase();

  const signals: InvalidationSignal[] = [];
  for (const rule of INVALIDATION_RULES) {
    if (rule.regex.test(text)) {
      signals.push({ condition: rule.condition, impact: rule.impact });
      if (signals.length >= 4) break;
    }
  }

  if (signals.length < 2) {
    const chain = (theme.causal_narrative ?? "")
      .split(/→|->|;/)
      .map(s => s.trim())
      .filter(s => s.length > 4);
    if (chain[0] && chain[0].length < 60) {
      const cap = chain[0].charAt(0).toUpperCase() + chain[0].slice(1);
      signals.push({
        condition: `${cap} reversal undermines the primary driver`,
        impact:    "Removes the foundational causal link. The investment thesis loses its structural basis",
      });
    }
    if (theme.momentum_direction === "bullish") {
      signals.push({
        condition: "Signal degradation below medium threshold removes conviction basis",
        impact:    "Indicates institutional positioning is reversing. The opportunity narrows as the reading weakens",
      });
    } else if (theme.momentum_direction === "bearish") {
      signals.push({
        condition: "Macro stabilization or policy support removes the bearish catalyst",
        impact:    "Re-prices the downside risk. Short positions face squeeze as the macro backstop returns",
      });
    }
  }

  return signals.slice(0, 4);
}

// ── Phase 12: Institutional Thesis & Timing ───────────────────────────────────

export function generateThesis(theme: ThemeIntelligence): string {
  const chain  = parseCausalChain(theme.causal_narrative);
  const macros = theme.related_macro_factors ?? [];
  const inds   = theme.related_industries    ?? [];
  const assets = theme.related_assets        ?? [];
  const dir    = theme.momentum_direction;

  const driver = chain[0] ?? macros[0] ?? "macro conditions";
  const mech   = chain[1] ?? macros[1] ?? null;
  const ind0   = inds[0] ?? "primary sectors";
  const ind1   = inds[1] ?? "adjacent sectors";
  const asset0 = assets[0] ?? null;

  const stateVerb =
    theme.momentum_label === "accelerating"  ? "is accelerating"  :
    theme.momentum_label === "strengthening" ? "is strengthening" :
    theme.momentum_label === "emerging"      ? "is emerging"      :
    theme.momentum_label === "cooling"       ? "is cooling"       :
    theme.momentum_label === "reversing"     ? "is reversing"     : "is active";

  const scopeNote = inds.length >= 3
    ? `with participation broadening across ${ind0}, ${ind1}, and ${inds.length - 2} additional sector${inds.length - 2 > 1 ? "s" : ""}`
    : inds.length === 2
    ? `concentrated in ${ind0} and ${ind1}`
    : `centered in ${ind0}`;

  const s1 = `${theme.name} ${stateVerb}, ${scopeNote}.`;

  const s2 = mech && mech.length > 8
    ? `${mech.charAt(0).toUpperCase() + mech.slice(1)} is the primary transmission mechanism linking ${driver} to downstream positioning.`
    : `The investment case rests on ${driver} sustaining directional pressure into ${ind0}.`;

  const s3 = dir === "bullish"
    ? `Continued validation would disproportionately benefit ${asset0 ? `${asset0} and related exposures in ${ind0}` : `exposures in ${ind0}`}.`
    : dir === "bearish"
    ? `The primary headwind falls on ${asset0 ?? ind0}, with spillover risk into ${ind1}.`
    : `Resolution of current ambiguity in ${driver} would clarify directional exposure across ${ind0}.`;

  return `${s1} ${s2} ${s3}`;
}

// ── Mechanism Library ─────────────────────────────────────────────────────────
// Each entry teaches HOW a driver transmits into prices, so a reader leaves the
// page understanding the cause-and-effect, not just a label. Matched against the
// theme's macro factors, name, industries and description.
const MECHANISM_LIBRARY: Array<{ regex: RegExp; explain: string }> = [
  { regex: /discount rate|\byield|treasury|\brates?\b|fed funds|duration/,
    explain: "Valuations rest on the present value of future cash flows. When Treasury yields rise, that future cash is discounted more steeply, so multiples compress even when earnings estimates are unchanged. Long-duration sectors like software and biotech feel it first." },
  { regex: /ai (compute|infra|capex)|\bgpu\b|accelerat|data ?center|hyperscal|model training/,
    explain: "AI capability scales with compute, so every model advance pulls forward orders for GPUs, networking and memory. Hyperscaler capex commitments convert almost directly into revenue for the chip and equipment suppliers upstream, which is why their backlogs move before earnings do." },
  { regex: /nuclear|smr|uranium/,
    explain: "Data centers need power that runs around the clock with no carbon, and nuclear is the only source that delivers all three at scale. That structural demand reprices merchant nuclear generators the market had been valuing as declining assets." },
  { regex: /grid|electric|\bpower\b|utility|transmission|baseload/,
    explain: "Data centers draw constant baseload power that grids built for household demand cannot supply. Meeting it requires new generation and transmission, which redirects utility capital toward buildout and lifts demand for anything that produces dispatchable power." },
  { regex: /private credit|direct lending|private capital|alternative (asset|credit)/,
    explain: "Tighter bank capital rules push leveraged lending off bank balance sheets and into private funds. Those funds earn fees on assets under management regardless of where the credit cycle turns, so the shift creates fee-income winners even if defaults rise." },
  { regex: /credit spread|high.?yield|\bhy\b|investment grade|\big\b|default/,
    explain: "A credit spread is the extra yield lenders demand to hold risky debt over Treasuries. When spreads widen, borrowing costs rise across the economy and risk assets reprice lower, which is why spreads often warn before equities weaken." },
  { regex: /\boil\b|crude|opec|brent|wti|gasoline/,
    explain: "Oil feeds into transport, input and energy costs across the economy. A sustained price rise compresses margins for energy consumers while lifting cash flow for producers, so the same move helps one set of sectors and hurts another." },
  { regex: /inflation|\bcpi\b|\bpce\b|core price/,
    explain: "Persistent inflation forces central banks to hold policy rates high. That keeps discount rates and financing costs elevated, which pressures rate-sensitive valuations and delays the relief that risk assets are already pricing in." },
  { regex: /\bdollar\b|\bdxy\b|currency|\busd\b|\bfx\b/,
    explain: "A stronger dollar makes dollar debt and commodities more expensive abroad. That pressures emerging markets and commodity exporters, while flattering the import costs of domestic-facing US firms." },
  { regex: /semiconductor|\bchip|tsmc|wafer|foundry|fab\b/,
    explain: "Chip demand is cyclical and capital-intensive, so order books lead the cycle. A rising backlog signals capacity expansion upstream, while a falling one warns the build cycle is peaking before it shows up in reported earnings." },
  { regex: /\bm&a\b|merger|acquisition|dealmaking|consolidat|takeover/,
    explain: "A wave of deals re-rates a whole sector because acquirers reveal what assets are worth. Targets reprice toward takeout value, and advisers and lenders capture fees on the deal volume itself." },
  { regex: /defense|geopolit|tariff|trade war|sanction|reshoring/,
    explain: "Geopolitical stress pushes governments to spend on defense and supply-chain security. That spending is policy-driven rather than demand-driven, so it can persist even through an economic slowdown." },
  { regex: /housing|mortgage|homebuild|residential|construction/,
    explain: "Mortgage rates set housing affordability. When they fall, demand and construction recover with a lag, which pulls through building materials, appliances and the credit that finances them." },
];

// Returns a teaching explanation of how the theme's dominant driver transmits,
// or null when no mechanism matches (so callers emit no generic filler).
export function explainMechanism(theme: ThemeIntelligence): string | null {
  const text = [
    ...(theme.related_macro_factors ?? []),
    theme.name        ?? "",
    ...(theme.related_industries    ?? []),
    ...(theme.related_assets        ?? []),
    theme.description ?? "",
  ].join(" ").toLowerCase();
  for (const m of MECHANISM_LIBRARY) {
    if (m.regex.test(text)) return m.explain;
  }
  return null;
}

// ── Security Expression Library ───────────────────────────────────────────────
// Maps a sector/theme keyword to the securities that most directly express the
// view, plus a concrete one-line reason a buyer wins and a seller loses. Lets
// the page name instruments and investment implications, not just themes.
const TICKER_RE = /^[A-Z][A-Z.]{0,5}$/;
interface SecEntry { regex: RegExp; tickers: string[]; winWhy: string; loseWhy: string; }
const SECURITY_LIBRARY: SecEntry[] = [
  { regex: /semiconductor|\bchip|\bgpu\b|accelerat|foundry/, tickers: ["NVDA", "AVGO", "AMD", "TSM"],
    winWhy: "Direct leverage to AI accelerator and data-center chip demand.", loseWhy: "A capex slowdown shows up in order books before earnings." },
  { regex: /semi.?cap|wafer|lithograph|etch|deposition|fab\b/, tickers: ["ASML", "AMAT", "LRCX", "KLAC"],
    winWhy: "Fab buildout converts into multi-year equipment orders.", loseWhy: "Capex cuts hit equipment makers first in the cycle." },
  { regex: /ai (compute|infra)|data ?center|hyperscal|server|networking/, tickers: ["NVDA", "AVGO", "DELL", "SMCI"],
    winWhy: "Hyperscaler capex converts almost directly into hardware orders.", loseWhy: "A capex pause stalls the hardware build cycle." },
  { regex: /nuclear|smr|uranium/, tickers: ["CEG", "VST", "TLN", "CCJ"],
    winWhy: "Round-the-clock carbon-free demand reprices merchant generators.", loseWhy: "A power-demand miss deflates the re-rating." },
  { regex: /utilit|grid|electric|\bpower\b|transmission|baseload/, tickers: ["NEE", "SO", "DUK", "AEP"],
    winWhy: "Grid buildout expands rate base and load growth.", loseWhy: "Rising rates raise financing costs for regulated utilities." },
  { regex: /electrical equip|power equip|cooling|grid equip/, tickers: ["ETN", "GEV", "PWR", "VRT"],
    winWhy: "Grid and data-center buildout drives an equipment order cycle.", loseWhy: "Buildout delays push the order cycle out." },
  { regex: /\boil\b|crude|\be&p\b|exploration|upstream|opec/, tickers: ["XOM", "CVX", "COP", "EOG"],
    winWhy: "Higher crude lifts upstream cash flow and buybacks.", loseWhy: "Falling crude compresses upstream margins." },
  { regex: /oil ?service|drilling|oilfield/, tickers: ["SLB", "HAL", "BKR"],
    winWhy: "Rising activity drives oilfield service pricing.", loseWhy: "Producer capex cuts hit service demand first." },
  { regex: /software|saas|application|enterprise app/, tickers: ["CRM", "NOW", "WDAY", "ADBE"],
    winWhy: "Recurring revenue and pricing power compound through cycles.", loseWhy: "Higher discount rates compress long-duration multiples." },
  { regex: /cybersecur|security software/, tickers: ["PANW", "CRWD", "ZS", "FTNT"],
    winWhy: "Security budgets are defended even in downturns.", loseWhy: "Higher rates compress high-multiple growth names." },
  { regex: /private credit|direct lending|alternative (asset|credit)|private capital/, tickers: ["BX", "KKR", "APO", "ARES"],
    winWhy: "Fee income grows as lending shifts off bank balance sheets.", loseWhy: "A credit-cycle turn raises default losses on the book." },
  { regex: /\bbank|deposit|regional bank|net interest/, tickers: ["JPM", "BAC", "WFC", "C"],
    winWhy: "Wider net interest margins lift earnings.", loseWhy: "Tighter credit and deposit flight pressure earnings." },
  { regex: /defense|aerospace|military|missile|munition/, tickers: ["LMT", "RTX", "NOC", "GD"],
    winWhy: "Rising defense budgets back multi-year backlogs.", loseWhy: "Budget delays slip the backlog to the right." },
  { regex: /homebuild|housing|residential|mortgage/, tickers: ["DHI", "LEN", "PHM"],
    winWhy: "Lower mortgage rates revive demand and starts.", loseWhy: "Higher mortgage rates choke affordability and volume." },
  { regex: /copper|industrial metal|\bmining\b/, tickers: ["FCX", "SCCO", "BHP"],
    winWhy: "Electrification tightens copper supply against demand.", loseWhy: "A demand slowdown softens metal prices." },
  { regex: /pharma|biotech|drug|therapeut/, tickers: ["LLY", "MRK", "PFE", "AMGN"],
    winWhy: "Pipeline depth and pricing drive durable cash flow.", loseWhy: "Patent cliffs and pricing pressure weigh on earnings." },
  { regex: /natural gas|\blng\b|pipeline|midstream/, tickers: ["LNG", "WMB", "KMI", "ET"],
    winWhy: "Export demand underpins volumes and fee income.", loseWhy: "Low prices pressure producer economics upstream." },
  { regex: /\bgold\b|precious metal|bullion/, tickers: ["GLD", "NEM", "AEM"],
    winWhy: "Falling real rates lift gold and the miners' leverage to it.", loseWhy: "Rising real rates weigh on gold." },
];

function secEntryFor(text: string): SecEntry | null {
  const lc = text.toLowerCase();
  for (const e of SECURITY_LIBRARY) if (e.regex.test(lc)) return e;
  return null;
}

// Primary beneficiary tickers: prefer the theme's own related_assets, fall back
// to the library keyed off non-negative industries and the theme name.
export function themeBeneficiaries(theme: ThemeIntelligence, max = 4): string[] {
  const out: string[] = (theme.related_assets ?? []).filter(a => TICKER_RE.test(a));
  if (out.length < 2) {
    const posInds = (theme.related_industries ?? []).filter(
      i => (theme.relationship_weights ?? {})[i]?.direction !== "negative",
    );
    for (const key of [...posInds, theme.name]) {
      const e = secEntryFor(key);
      if (e) for (const t of e.tickers) if (!out.includes(t)) out.push(t);
      if (out.length >= max) break;
    }
  }
  return out.slice(0, max);
}

// Best expressions: top beneficiary tickers + a concrete reason to own them.
export interface BestExpression { tickers: string[]; why: string; }
export function bestExpressions(theme: ThemeIntelligence): BestExpression | null {
  const tickers = themeBeneficiaries(theme, 4);
  if (tickers.length === 0) return null;
  const posInds = (theme.related_industries ?? []).filter(
    i => (theme.relationship_weights ?? {})[i]?.direction !== "negative",
  );
  let why = "";
  for (const key of [...posInds, theme.name, ...(theme.related_macro_factors ?? [])]) {
    const e = secEntryFor(key);
    if (e) { why = e.winWhy; break; }
  }
  return { tickers, why: why || "Most direct exposure to the theme's primary driver." };
}

// Most exposed losers: the hurt sector, its securities, and the concrete risk.
// Returns null when nothing is clearly hurt (so the section only shows when real).
export interface ExposedLosers { sector: string; tickers: string[]; risk: string; }
export function themeLosers(theme: ThemeIntelligence, max = 3): ExposedLosers | null {
  const negInds = (theme.related_industries ?? []).filter(
    i => (theme.relationship_weights ?? {})[i]?.direction === "negative",
  );
  let sector: string | null = null;
  let entry: SecEntry | null = null;
  for (const i of negInds) { const e = secEntryFor(i); if (e) { sector = i; entry = e; break; } }
  if (!entry && theme.momentum_direction === "bearish") {
    for (const i of (theme.related_industries ?? [])) { const e = secEntryFor(i); if (e) { sector = i; entry = e; break; } }
  }
  if (!entry || !sector) return null;
  return { sector, tickers: entry.tickers.slice(0, max), risk: entry.loseWhy };
}

export function generateWhyItMattersNow(theme: ThemeIntelligence): string[] {
  const delta    = theme.momentum_delta           ?? 0;
  const breadth  = theme.breadth_score            ?? 0;
  const cycles   = theme.persistence_cycles       ?? 0;
  const momentum = theme.momentum_label;
  const confirmed = theme.cross_category_confirmed;
  const inds     = theme.related_industries       ?? [];
  const relCount = Object.keys(theme.relationship_weights ?? {}).length;
  const ind0     = inds[0] ?? "primary sector";
  const ind1     = inds[1] ?? null;

  const bullets: string[] = [];

  // Bullet 1: Signal velocity / state
  if (momentum === "accelerating" && delta >= 10) {
    bullets.push(`Signal is accelerating rapidly (+${Math.round(delta)} velocity). Investors may have less time to build exposure before institutional flows arrive`);
  } else if (momentum === "accelerating") {
    bullets.push(`Signal has entered acceleration phase. Momentum is building above prior-cycle baseline`);
  } else if (momentum === "strengthening" && delta >= 5) {
    bullets.push(`Strengthening momentum (+${Math.round(delta)} delta) indicates the signal is not yet peaking. Further appreciation is plausible`);
  } else if (momentum === "reversing") {
    bullets.push(`Signal is reversing. This is a positioning risk event, not a consolidation`);
  } else if (delta >= 6) {
    bullets.push(`Positive signal delta of +${Math.round(delta)} marks a departure from the prior trend. Early re-engagement signal`);
  } else if (delta <= -8) {
    bullets.push(`Signal delta of ${Math.round(delta)} confirms deterioration is not noise. Exit thesis is building`);
  } else {
    bullets.push(`Theme signal is ${momentum}. Not yet an entry signal, though it is worth tracking`);
  }

  // Bullet 2: Breadth / sector confirmation
  if (confirmed && breadth >= 65) {
    const indNote = ind1 ? `${ind0} and ${ind1}` : ind0;
    bullets.push(`Cross-category confirmation is active. Signal has spread beyond ${indNote}, reducing false-positive risk`);
  } else if (breadth >= 70) {
    const cnt = Math.max(2, Math.round(breadth / 18));
    bullets.push(`Sector breadth at ${Math.round(breadth)}%. Participation across ~${cnt} industries reduces single-sector concentration risk`);
  } else if (breadth >= 45 && inds.length >= 2) {
    bullets.push(`Signal is present in ${inds.length} tracked sectors. Breadth is building but not yet broad-based`);
  } else {
    bullets.push(`Exposure is concentrated in ${ind0}. Breadth has not confirmed, so the move could stay sector-specific rather than become thematic`);
  }

  // Bullet 3: Persistence / structural durability
  if (cycles >= 8) {
    bullets.push(`${cycles}-cycle persistence establishes this as a structural theme. A multi-quarter holding period is justified rather than a tactical trade`);
  } else if (cycles >= 4) {
    bullets.push(`${cycles} consecutive signal cycles with ${relCount >= 3 ? `${relCount} confirmed links to related themes` : "sustained presence"}. The thesis is consolidating into a structural one`);
  } else if (cycles >= 2 && relCount >= 3) {
    bullets.push(`Early persistence (${cycles} cycles) combined with ${relCount} related themes suggests a systematic driver rather than an idiosyncratic one`);
  } else {
    bullets.push(`Signal is ${cycles <= 1 ? "newly emerging" : "early-stage"}. Treat it as a monitoring position rather than a core holding until it persists`);
  }

  // Lead with the economic mechanism so the reader learns WHY before the signal stats
  const mech = explainMechanism(theme);
  if (mech) bullets.unshift(mech);

  return bullets;
}

// ── Phase 18: Intelligence Briefing & Score ───────────────────────────────────

export function generateIntelligenceBriefing(theme: ThemeIntelligence): string[] {
  const chain   = parseCausalChain(theme.causal_narrative);
  const macros  = theme.related_macro_factors ?? [];
  const inds    = theme.related_industries    ?? [];
  const assets  = theme.related_assets        ?? [];
  const delta   = theme.momentum_delta        ?? 0;
  const breadth = theme.breadth_score         ?? 0;
  const persist = theme.persistence_score     ?? 0;
  const cycles  = theme.persistence_cycles    ?? 0;
  const dir     = theme.momentum_direction;
  const ml      = theme.momentum_label;
  const ss      = theme.signal_strength;
  const name    = theme.name;

  const driver = chain[0]  ?? macros[0] ?? null;
  const mech   = chain[1]  ?? macros[1] ?? null;
  const ind0   = inds[0]   ?? "primary sectors";
  const ind1   = inds[1]   ?? null;
  const asset0 = assets[0] ?? null;

  const sentences: string[] = [];

  // Sentence 1: What is happening — theme state and primary driver
  const stateVerb =
    ml === "accelerating"  ? "continues to accelerate" :
    ml === "strengthening" ? "is strengthening"        :
    ml === "emerging"      ? "is emerging as a structural theme" :
    ml === "cooling"       ? "is showing signs of cooling" :
    ml === "reversing"     ? "is reversing" : "remains active";

  const driverClause = driver && driver.length > 4
    ? `, driven by ${driver.charAt(0).toLowerCase() + driver.slice(1)}`
    : "";

  sentences.push(`${name} ${stateVerb}${driverClause}.`);

  // Sentence 2: Why it matters — teach the economic transmission first
  const eduMech = explainMechanism(theme);
  if (eduMech) {
    sentences.push(eduMech);
  } else if (mech && mech.length > 8) {
    const mechCap   = mech.charAt(0).toUpperCase() + mech.slice(1);
    const impactVerb = dir === "bullish" ? "raises pricing power for"
      : dir === "bearish" ? "raises input and financing costs for" : "reshapes demand across";
    const indScope   = ind1 ? `${ind0} and ${ind1}` : ind0;
    sentences.push(`${mechCap}, which ${impactVerb} ${indScope}.`);
  } else {
    const verbPhrase = dir === "bullish" ? `lifts pricing power in ${ind0}`
      : dir === "bearish" ? `raises costs and compresses margins in ${ind0}`
      : `pulls in both directions across ${ind0}`;
    const assetClause = asset0 ? `, with the most direct exposure in ${asset0}` : "";
    const indExt = ind1 ? ` and ${ind1}` : "";
    sentences.push(`That dynamic ${verbPhrase}${indExt}${assetClause}.`);
  }

  // Sentence 3: Why it matters now, framed to teach the underlying mechanism
  if (ml === "accelerating" && delta >= 10) {
    sentences.push(`A move of this velocity (+${Math.round(delta)}) usually draws institutional capital before fundamentals fully reset, which is what tends to carry these trends past fair value before they peak.`);
  } else if (ml === "accelerating" && delta >= 5) {
    sentences.push(`The trend is broadening before it is widely recognized. That is typically the stage at which positions get built, because the move is still cheap relative to where consensus eventually settles.`);
  } else if (theme.cross_category_confirmed && breadth >= 60) {
    const cnt = Math.max(2, Math.round(breadth / 18));
    sentences.push(`Confirmation now spans roughly ${cnt} sectors. Broad participation, rather than a single-sector move, is what separates a durable regime from a short-lived rotation.`);
  } else if (ml === "reversing") {
    sentences.push(`The unwind is gathering pace. After ${cycles} cycle${cycles !== 1 ? "s" : ""} of prior strength, the risk is that crowded positions exit faster than they were built, which is how reversals tend to overshoot.`);
  } else if (cycles >= 6) {
    sentences.push(`After ${cycles} consecutive cycles, this is no longer a tactical trade. The relevant question shifts from when to enter to how much to hold and for how long.`);
  } else if (persist >= 70 && ss === "strong") {
    sentences.push(`The thesis has held at a persistence reading of ${Math.round(persist)} across changing conditions. A position that survives multiple regimes depends far less on any single macro assumption holding.`);
  } else if (ml === "strengthening" && delta >= 5) {
    sentences.push(`The trend is gaining traction (+${Math.round(delta)}) ahead of consensus. Risk-reward is usually most favorable at this stage, before the move is fully recognized and priced.`);
  } else {
    sentences.push(`The setup is still early. What decides it is whether breadth expands from here or the move stays confined to its first sector.`);
  }

  return sentences;
}

export interface IntelligenceScore {
  score: number;
  label: "High confidence narrative" | "Moderate confidence" | "Developing narrative" | "Early signal";
}

export function computeIntelligenceScore(theme: ThemeIntelligence): IntelligenceScore {
  const ss      = theme.signal_strength;
  const ml      = theme.momentum_label;
  const breadth = theme.breadth_score    ?? 0;
  const persist = theme.persistence_score ?? 0;
  const evidence = theme.evidence_count  ?? 0;

  const signalPts =
    ss === "strong" ? 30 :
    ss === "medium" ? 15 : 5;

  const momentumPts =
    ml === "accelerating"  ? 20 :
    ml === "strengthening" ? 18 :
    ml === "emerging"      ? 14 :
    ml === "stable"        ? 10 :
    ml === "cooling"       ? 4  : 0;

  const breadthPts  = Math.round(breadth  * 0.15);
  const persistPts  = Math.round(persist  * 0.10);
  const evidencePts = Math.min(Math.round(evidence * 5), 20);
  const crossPts    = theme.cross_category_confirmed ? 5 : 0;

  const score = Math.min(100, Math.round(
    signalPts + momentumPts + breadthPts + persistPts + evidencePts + crossPts,
  ));

  const label =
    score >= 80 ? "High confidence narrative" :
    score >= 60 ? "Moderate confidence"       :
    score >= 40 ? "Developing narrative"      : "Early signal";

  return { score, label };
}
