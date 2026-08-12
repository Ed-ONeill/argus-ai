/**
 * lib/industriesIntel.ts - the Industries / Sectors surface view model
 * (Phase 2.5 Industries unification, docs/ARGUS_INTELLIGENCE_EVERYWHERE_V1.md).
 *
 * Industries answers "which sectors are changing, why, who is exposed, and
 * what could invalidate the view?" as a PURE PROJECTION of injected shared
 * intelligence:
 *
 *   conviction / evidence  <- Intelligence Profile (the same numbers Explorer
 *                             shows for the same Sector entity)
 *   forward view           <- profile.thesis.forward (prediction engine)
 *   drivers                <- profile.drivers (recorded upstream edges)
 *   beneficiaries          <- profile.beneficiaries (recorded downstream
 *                             Company/ETF edges)
 *   risks / contradictions <- the shared risk read (lib/riskRead, verbatim)
 *   transmission           <- profile.transmission.strongestPath (recorded)
 *   what changed           <- the canonical change ledger, records VERBATIM
 *   narrative membership   <- DerivedNarrative exposure (injected)
 *   evolution              <- profile.evolution (memory engine)
 *
 * Industries OWNS ONLY: ranking, grouping, comparison SELECTION, and
 * presentation. It derives no sector meaning; missing reads degrade to nulls
 * with section notes, never to editorial prose. Exercised by
 * intelligenceTests.ts (88.x). Pure module, relative imports only. No em/en
 * dashes.
 */

import type { ThemeIntelligence } from "./types";
import type { IntelligenceProfile, ProfileSection, ProfileStatus, ProfileForward } from "./intelligenceProfile";
import { sectorExposure } from "./sectorTaxonomy";
import type { RiskRead } from "./riskRead";
import type { MorningBriefDelta } from "./intelligenceDeltas";
import type { DerivedNarrative } from "./narrativeDerivation";

/* ------------------------------------------------------------------ *
 * Contract
 * ------------------------------------------------------------------ */

export interface SectorLink { label: string; nodeType: string; relationship: string; strength: number }

export interface SectorIntelVM {
  /** Canonical entity key (the sector name Explorer resolves). */
  key:      string;
  nodeType: "Sector";
  /** Whether the shared engines resolved this sector. */
  live:     boolean;
  /** Profile conviction - the same number Explorer shows. Null when unresolved. */
  conviction:      number | null;
  evidenceVerdict: string | null;
  /** Prediction-engine forward view, verbatim from profile.thesis.forward. */
  forward:  ProfileForward | null;
  /** Recorded upstream drivers (profile.drivers). */
  drivers:  SectorLink[];
  /** Recorded downstream tradeables (profile.beneficiaries, Company/ETF only). */
  beneficiaries: SectorLink[];
  /** Recorded weakening-edge labels (shared risk read). */
  weakening: string[];
  /** Evidence-engine contradiction records, verbatim. */
  contradictions: Array<{ detail: string; severity: number }>;
  invalidation: string | null;
  /** The canonical derived watch item (shared risk read). */
  watch: string | null;
  /** Dominant derived narrative whose recorded exposure touches this sector. */
  narrative: string | null;
  /** The canonical ledger record touching a theme exposed to this sector, VERBATIM. */
  latestChange: MorningBriefDelta | null;
  /** Canonical themes recording exposure to this sector (selection). */
  themes: ThemeIntelligence[];
  /** RC2-G4: which Industry carried each exposed theme into this sector.
   *  Provenance is NEVER collapsed — a theme reaches Technology because it
   *  affects Semiconductors, and the surface must be able to say so. */
  themeProvenance: { theme: string; viaIndustry: string }[];
  /** One recorded transmission path. RC2-G4: the causal chain is computed on
   *  the CARRYING INDUSTRY (Macro -> Theme -> Industry), because that is where
   *  the recorded relationships live. The structural Industry -> Sector hop is
   *  deliberately absent: belongs_to is membership, not transmission. */
  transmission: string[] | null;
  /** The Industry whose profile produced `transmission` (attribution for the
   *  chain shown on a Sector surface). Null when the chain came from the
   *  Sector's own profile or is unavailable. */
  transmissionVia: string | null;
  /** Cross-session evolution lines (memory engine via profile). */
  evolutionLines: string[];
}

export interface IndustriesIntelInputs {
  /** Canonical sector names to project (the page's taxonomy selection). */
  sectors?:    string[];
  themes?:     ThemeIntelligence[];
  /** Injected shared profiles / risk reads, keyed by lower-cased sector name. */
  profiles?:   Map<string, IntelligenceProfile>;
  risks?:      Map<string, RiskRead>;
  /** RC2-G4: profiles of the CARRYING INDUSTRIES, keyed by lower-cased
   *  industry name. Supplies the upstream causal chain that the Sector node
   *  cannot see (the Macro head sits three hops away through belongs_to).
   *  Optional: absent means the chain falls back to the Sector's own profile. */
  industryProfiles?: Map<string, IntelligenceProfile>;
  /** Derived narratives (shared derivation), for exposure membership. */
  narratives?: DerivedNarrative[];
  /** The canonical change ledger, canonical order. */
  deltas?:     MorningBriefDelta[];
  graphReady?: boolean;
}

export interface IndustriesIntelVM {
  sectors: ProfileSection<SectorIntelVM[]>;
}

/* ------------------------------------------------------------------ *
 * buildIndustriesIntel
 * ------------------------------------------------------------------ */

const section = <T>(status: ProfileStatus, data: T | null, note?: string): ProfileSection<T> =>
  ({ status, data, ...(note ? { note } : {}) });

export function buildIndustriesIntel(inputs: IndustriesIntelInputs = {}): IndustriesIntelVM {
  const sectors = inputs.sectors ?? [];
  const themes = inputs.themes ?? [];
  const profiles = inputs.profiles ?? new Map<string, IntelligenceProfile>();
  const risks = inputs.risks ?? new Map<string, RiskRead>();
  const industryProfiles = inputs.industryProfiles ?? new Map<string, IntelligenceProfile>();
  const narratives = inputs.narratives ?? [];
  const deltas = inputs.deltas ?? [];
  const graphReady = inputs.graphReady === true;

  if (sectors.length === 0) {
    return { sectors: section<SectorIntelVM[]>("unavailable", null, "No sectors selected.") };
  }

  const themeByName = new Map(themes.map(t => [t.name.toLowerCase(), t]));

  const vms: Array<SectorIntelVM & { _ledgerIdx: number }> = sectors.map(name => {
    const key = name.toLowerCase();
    const profile = profiles.get(key) ?? null;
    const risk = risks.get(key) ?? null;
    const live = !!profile && profile.identity.status !== "unavailable";

    // RC2-G4: thematic exposure now rolls up through the canonical hierarchy
    // (Theme -> Industry -> Sector) instead of string-matching the sector name
    // against related_industries — which silently returned nothing for a sector
    // whose industries are named differently (Technology / Semiconductors).
    const exposure = sectorExposure(name);
    const themeProvenance = exposure.themes.map(t => ({ theme: t.label, viaIndustry: t.viaIndustry }));
    const sectorThemes = exposure.themes
      .map(t => themeByName.get(t.label.toLowerCase()))
      .filter((t): t is ThemeIntelligence => !!t);
    const sectorThemeNames = new Set(sectorThemes.map(t => t.name.toLowerCase()));

    // The canonical ledger record touching an exposed theme, in ledger order.
    const exposedIndustries = new Set(exposure.industries.map(i => i.toLowerCase()));
    const ledgerIdx = deltas.findIndex(d =>
      sectorThemeNames.has(d.entity.toLowerCase()) ||
      (themeByName.get(d.entity.toLowerCase())?.related_industries ?? [])
        .some(s => exposedIndustries.has(s.toLowerCase())));
    const latestChange = ledgerIdx >= 0 ? deltas[ledgerIdx] : null;

    // Derived-narrative membership by recorded exposure.
    const narrative = narratives.find(n =>
      (n.exposure.data?.sectors ?? []).some(s => s.label.toLowerCase() === key))?.label ?? null;

    const drivers: SectorLink[] = live
      ? (profile!.drivers.data ?? []).map(l => ({ label: l.label, nodeType: l.nodeType, relationship: l.relationship, strength: l.strength }))
      : [];
    // Upstream causal chain: prefer the carrying Industry's own profile, which
    // holds the Macro -> Theme -> Industry path. Industries are tried in the
    // exposure's canonical order, so the choice is deterministic. The Sector's
    // own path is the fallback (it still holds story/deal-side context).
    const chain: { path: string[] | null; via: string | null } = (() => {
      for (const ind of exposure.industries) {
        const ip = industryProfiles.get(ind.toLowerCase());
        const p = ip?.transmission.data?.strongestPath ?? [];
        if (p.length >= 2) return { path: p, via: ind };
      }
      const own = live ? profile!.transmission.data?.strongestPath ?? [] : [];
      return own.length >= 2 ? { path: own, via: null } : { path: null, via: null };
    })();

    const beneficiaries: SectorLink[] = live
      ? (profile!.beneficiaries.data ?? [])
          .filter(l => l.nodeType === "Company" || l.nodeType === "ETF")
          .map(l => ({ label: l.label, nodeType: l.nodeType, relationship: l.relationship, strength: l.strength }))
      : [];

    return {
      key: name, nodeType: "Sector" as const, live,
      conviction: live ? profile!.confidence.data?.conviction ?? null : null,
      evidenceVerdict: live ? profile!.evidence.data?.verdict ?? null : null,
      forward: live ? profile!.thesis.data?.forward ?? null : null,
      drivers: drivers.slice(0, 6),
      beneficiaries: beneficiaries.slice(0, 6),
      weakening: risk ? risk.weakening.map(w => w.label) : [],
      contradictions: risk ? risk.contradictions : [],
      invalidation: risk?.invalidation ?? null,
      watch: risk?.watchItems[0] ?? null,
      narrative,
      latestChange,
      themes: sectorThemes,
      themeProvenance,
      transmission: chain.path,
      transmissionVia: chain.via,
      evolutionLines: live ? profile!.evolution.data?.lines ?? [] : [],
      _ledgerIdx: ledgerIdx >= 0 ? ledgerIdx : Number.POSITIVE_INFINITY,
    };
  });

  /* -- surface-owned ranking: canonical ledger order (changes lead), then
        conviction, then name -- */
  vms.sort((a, b) =>
    (a._ledgerIdx - b._ledgerIdx) ||
    ((b.conviction ?? -1) - (a.conviction ?? -1)) ||
    a.key.localeCompare(b.key));
  const ranked: SectorIntelVM[] = vms.map(({ _ledgerIdx: _drop, ...rest }) => rest);

  return {
    sectors: graphReady
      ? section("live", ranked)
      : section("partial", ranked, "Intelligence graph not provisioned; sector profile reads unavailable (stored theme exposure only)."),
  };
}

/**
 * Comparison SELECTION (surface behavior): pick the named sectors from an
 * already-built VM. Pure filtering - no field is recomputed, so adding or
 * removing a comparison target can never change another sector's values
 * (pinned by 88.x).
 */
export function compareSectors(vm: IndustriesIntelVM, keys: string[]): SectorIntelVM[] {
  const want = new Set(keys.map(k => k.toLowerCase()));
  return (vm.sectors.data ?? []).filter(s => want.has(s.key.toLowerCase()));
}
