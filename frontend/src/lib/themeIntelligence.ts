/**
 * themeIntelligence.ts, Argus Intelligence Layer
 *
 * Pure deterministic functions over existing ThemeIntelligence data.
 * Zero LLM calls. Zero new API calls. Everything derived from feed response fields.
 */

import type { ThemeIntelligence, SectorData } from "./types";

// ── Phase 2: Memory-Aware Intelligence ────────────────────────────────────────
// Consume the persistent cross-session theme memory (theme.memory, attached
// server-side from app/theme_memory.py) so conclusions reflect how a theme has
// evolved across sessions, not just today's snapshot. Every helper no-ops
// gracefully when memory is absent (cold start), so behaviour is unchanged until
// memory accumulates, and every emitted figure traces to a stored observation.

const _MEM_STRONG_PERSIST = 6;   // sessions before a theme counts as established

/**
 * Weight a theme's influence by how persistent / confirmed it is across
 * sessions. Persistent, confirmed themes carry MORE weight; brand-new / one-off
 * themes are discounted until confirmation accumulates; stale/contradicted
 * themes are penalised. Returns ~0.5–1.35 (1.0 = neutral / no memory yet).
 * Used by Sector Positioning scoring and (mirrored on the backend) feed ranking.
 */
export function themePersistenceWeight(t: ThemeIntelligence): number {
  const m = t.memory;
  if (!m) return 1.0;
  let w = 1.0;
  if (m.is_persistent_pattern)                    w += 0.25;
  else if (m.sessions_observed >= _MEM_STRONG_PERSIST) w += 0.12;
  if (m.is_new)                                   w -= 0.30;   // reduced until confirmed
  else if (m.is_one_off)                          w -= 0.18;
  if (m.status === "strengthening")               w += 0.10;
  else if (m.status === "weakening")              w -= 0.08;
  else if (m.status === "stale")                  w -= 0.35;
  if (m.contradicting_total > m.confirming_total) w -= 0.12;
  return Math.max(0.5, Math.min(1.35, w));
}

/**
 * Memory-grounded sentences for drawers / narrative copy. Returns [] when there
 * is no memory yet, so callers fall back to their existing copy. Every sentence
 * is a stored fact (status streaks, first-seen, conviction trajectory, per-sector
 * confirmation counts, today's confirmations/contradictions). No invented history.
 */
export function memorySentences(t: ThemeIntelligence, maxSectors = 1): string[] {
  const m = t.memory;
  if (!m || m.sessions_observed < 2) return [];
  const out: string[] = [];

  // "First detected 18 days ago and conviction has increased from 58 to 81."
  // User-facing memory copy uses conviction_first, the persistent first-detection
  // anchor, so it states the true full-history move, not the recent ~6-cycle
  // window. (conviction_window_start stays on the type/store for internal use.)
  const d = m.first_seen_days_ago;
  const since = d >= 1 ? `${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"} ago`
              : d >= 0.04 ? `${Math.max(1, Math.round(d * 24))}h ago` : "today";
  const a = m.conviction_first, b = m.conviction_current;
  if (Math.abs(b - a) >= 3) {
    out.push(`First detected ${since}; conviction has ${b > a ? "increased" : "decreased"} from ${a} to ${b} since.`);
  } else {
    out.push(`Tracked since ${since}; conviction has held near ${b} across ${m.sessions_observed} sessions.`);
  }

  // "Power Infrastructure has strengthened for 8 consecutive sessions."
  if (m.status === "strengthening" && m.sessions_in_status >= 2) {
    out.push(`Strengthening for ${m.sessions_in_status} consecutive sessions.`);
  } else if (m.status === "weakening" && m.sessions_in_status >= 2) {
    out.push(`Weakening for ${m.sessions_in_status} consecutive sessions.`);
  } else if (m.status === "recurring") {
    out.push(`A recurring theme, observed across ${m.sessions_observed} sessions.`);
  } else if (m.status === "stale") {
    out.push(`Dormant, last confirmed ${Math.round(m.last_seen_hours_ago)}h ago.`);
  }

  // "Semiconductors have confirmed this theme in 6 of 9 sessions."
  const sectors = Object.entries(m.sector_sessions ?? {}).sort((x, y) => y[1] - x[1]);
  for (const [sector, cnt] of sectors.slice(0, maxSectors)) {
    if (cnt >= 2 && m.sessions_observed >= 3) {
      out.push(`${sector} has confirmed this theme in ${cnt} of ${m.sessions_observed} sessions.`);
    }
  }

  // "Contradicted by 2 stories today." / "3 new confirmations today."
  if (m.contradictions_today >= 1) {
    out.push(`Contradicted by ${m.contradictions_today} ${m.contradictions_today === 1 ? "story" : "stories"} today${m.confirmations_today > 0 ? `, confirmed by ${m.confirmations_today}` : ""}.`);
  } else if (m.confirmations_today >= 2) {
    out.push(`${m.confirmations_today} new confirmations today.`);
  }

  return out;
}

/** A short cross-session status clause for inline use, or null when no memory. */
export function memoryStatusClause(t: ThemeIntelligence): string | null {
  const m = t.memory;
  if (!m || m.sessions_observed < 2) return null;
  if (m.status === "strengthening" && m.sessions_in_status >= 2) return `strengthening for ${m.sessions_in_status} sessions`;
  if (m.status === "weakening" && m.sessions_in_status >= 2)     return `weakening for ${m.sessions_in_status} sessions`;
  if (m.status === "stale")          return `dormant ${Math.round(m.last_seen_hours_ago)}h`;
  if (m.is_persistent_pattern)       return `persistent across ${m.sessions_observed} sessions`;
  if (m.is_new)                      return "newly detected";
  return null;
}

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

  // Evidence base, evidence_count scaled to 0-100 (10 strong pieces = full)
  const evidencePct = Math.min(Math.round((t.evidence_count ?? 0) * 10), 100);
  components.push({
    label: "Evidence",
    value: evidencePct,
    direction: evidencePct >= 60 ? "positive" : evidencePct >= 30 ? "neutral" : "negative",
    description: `${t.evidence_count ?? 0} evidence points`,
  });

  // Persistence, directly from field
  const persist = t.persistence_score ?? 50;
  components.push({
    label: "Persistence",
    value: persist,
    direction: persist >= 60 ? "positive" : "neutral",
    description: `${t.persistence_days ?? 0}d, ${t.persistence_cycles ?? 0} cycles`,
  });

  // Breadth, sector spread
  const breadth = t.breadth_score ?? 50;
  components.push({
    label: "Breadth",
    value: breadth,
    direction: breadth >= 55 ? "positive" : "neutral",
    description: `${t.related_industries.length} industries`,
  });

  // Competition penalty, shown as a drag (negative component)
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
// Phase 2.4: FALLBACK ONLY. The owner of contradictions is the evidence engine
// (evidenceEngine.detectContradictions, projected through profile.risks and
// lib/riskRead). This stored-field theme-vs-theme overlap detector may run
// ONLY when the graph is unavailable, and its output must be rendered with an
// explicit STORED-FIELD READ label (see lib/intelligenceOwnership.ts).

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

  // Deduplicate by severity, keep highest severity when multiple conflicts reference same theme
  return result
    .sort((a, b) => {
      const r = { high: 0, moderate: 1, low: 2 } as const;
      return r[a.severity] - r[b.severity];
    });
}

// getConflictedThemeIds: deleted (Phase 2.4) - no consumers remained.

// ── 4. M&A Intelligence, why deal activity is occurring ─────────────────────

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

// ── Catalysts: RETIRED HERE (Phase 2.4 Intelligence Consistency) ─────────────
// The provider-backed economic catalyst calendar, its placeholder date source,
// generateNextCatalysts, and marketCatalystRadar were deleted. Catalyst
// semantics have ONE owner: lib/theRead.verifiedCatalystsFor (recorded
// series/releases in the shared graph - verified, DATELESS). A dated catalyst
// is unavailable until a real Event provider exists; indicative dates are
// fabrication, not intelligence (see lib/intelligenceOwnership.ts).

// Bull/Bear case generator: DELETED (Phase 2.7, D12) - drawer prose templates may not generate
// meaning; pipeline fields and shared-engine records are rendered instead.

// Keyword watch-signal rules: DELETED (Phase 2.7, D12) - drawer prose templates may not generate
// meaning; pipeline fields and shared-engine records are rendered instead.

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

// Keyword invalidation rules: DELETED (Phase 2.7, D12) - drawer prose templates may not generate
// meaning; pipeline fields and shared-engine records are rendered instead.

// generateThesis / mechanism library / explainMechanism: DELETED (Phase 2.7, D12) - drawer prose templates may not generate
// meaning; pipeline fields and shared-engine records are rendered instead.

// ── Security Expression Library: DELETED (Phase 2.5, D11) ────────────────────
// The curated ticker/winWhy/loseWhy dictionary (SECURITY_LIBRARY, secEntryFor,
// securitiesForSector, bestExpressions, themeLosers) was editorial exposure and
// risk authority wearing intelligence. Exposure now comes from RECORDED data
// only: graph beneficiaries / weakening edges (profiles, riskRead) and the
// pipeline fields below.

const TICKER_RE = /^[A-Z][A-Z.]{0,5}$/;

// Primary beneficiary tickers from RECORDED data only (P2.5): server-memory
// ticker sessions first (historically-confirmed beneficiaries), then the
// pipeline's related_assets. The curated-library fallback tail is deleted -
// a theme with little recorded exposure shows few chips, honestly.
export function themeBeneficiaries(theme: ThemeIntelligence, max = 4): string[] {
  const out: string[] = [];

  const ts = theme.memory?.ticker_sessions;
  if (ts) {
    for (const [tk, cnt] of Object.entries(ts).sort((a, b) => b[1] - a[1])) {
      if (cnt >= 2 && TICKER_RE.test(tk) && !out.includes(tk)) out.push(tk);
      if (out.length >= max) break;
    }
  }

  for (const a of (theme.related_assets ?? [])) {
    if (TICKER_RE.test(a) && !out.includes(a)) out.push(a);
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

// generateWhyItMattersNow: RETIRED (Phase 2.4). Its advice-template bullets
// ("investors may have less time to build exposure") were page-local meaning.
// Market impact is now a shared read: marketsIntel.impact (Read exposure +
// ledger matters lines) and marketsIntel.themeImpactBullets (recorded facts).

// generateIntelligenceBriefing / computeIntelligenceScore: DELETED (Phase 2.7, D12) - drawer prose templates may not generate
// meaning; pipeline fields and shared-engine records are rendered instead.

