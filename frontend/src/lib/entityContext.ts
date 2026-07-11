/**
 * lib/entityContext.ts - THE canonical Entity Context view model (Phase 2.7,
 * roadmap abstraction A4). One entity -> one profile -> one set of risks ->
 * one forward view -> one narrative membership -> one delta history. Every
 * drawer and quick-read panel projects THIS object; none may compute
 * competing meaning.
 *
 * Pure composition of the canonical reads:
 *   profile        <- lib/profileCache (A2: one build per entity per graph
 *                     version, so two drawers showing the same entity hold
 *                     the SAME object)
 *   risks/watch/   <- lib/riskRead (evidence + prediction + weakens edges,
 *   catalysts         verified dateless catalysts)
 *   narrative      <- narrativeDerivation.findNarrativeForTheme (injectable)
 *   latest change  <- the canonical ledger, records by OBJECT IDENTITY
 *
 * Nothing here recomputes engine semantics; missing reads degrade to nulls
 * with an explicit completeness status. Exercised by intelligenceTests.ts
 * (90.x). Pure module, relative imports only. No em/en dashes.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import { cachedProfile } from "./profileCache";
import { buildRiskRead, type RiskRead } from "./riskRead";
import { findNarrativeForTheme } from "./narrativeDerivation";
import type { IntelligenceProfile, ProfileForward, ProfileLink, ProfileStatus } from "./intelligenceProfile";
import type { CatalystItem } from "./theRead";
import type { MorningBriefDelta } from "./intelligenceDeltas";
import type { ThemeIntelligence } from "./types";

/* ------------------------------------------------------------------ *
 * Contract
 * ------------------------------------------------------------------ */

export interface EntityContextInputs {
  entityKey:  string;
  /** The pipeline theme object when the entity is a theme (adds the stored
      conviction/watch derivation inputs; facts, not meaning). */
  theme?:     ThemeIntelligence | null;
  /** The canonical change ledger (canonical order). */
  deltas?:    MorningBriefDelta[];
  /** Narrative resolver override (defaults to the shared derivation). */
  narrativeOf?: (name: string) => { label: string } | null;
  graphReady?: boolean;
}

export interface EntityContextVM {
  entityKey: string;
  /** "live" = resolved through the shared engines; "partial" = stored-field
      reads only; "unavailable" = nothing resolvable. */
  status:    ProfileStatus;
  /** Identity (profile read; null when the entity is not in the graph). */
  identity:  { label: string; kind: string; nodeType: string; description: string } | null;
  /** THE cached profile - the same object Explorer holds this graph version. */
  profile:   IntelligenceProfile | null;
  /** THE shared risk read - contradictions/invalidation/weakening/watch/catalysts. */
  risks:     RiskRead;
  /** Pipeline conviction for themes; profile conviction otherwise. */
  conviction:      number | null;
  convictionBasis: "theme pipeline" | "graph profile" | null;
  /** Canonical decomposition (profile confidence explanation). */
  convictionExplanation: string | null;
  evidenceVerdict: string | null;
  forward:   ProfileForward | null;
  drivers:   ProfileLink[];
  beneficiaries: ProfileLink[];
  narrative: string | null;
  /** One recorded transmission path (profile strongest path). */
  transmission: string[] | null;
  /** Cross-session evolution lines (memory engine via the profile). */
  evolutionLines: string[];
  watchItems: string[];
  catalysts:  CatalystItem[];
  /** The canonical ledger record touching this entity, VERBATIM. */
  latestChange: MorningBriefDelta | null;
}

/* ------------------------------------------------------------------ *
 * buildEntityContext
 * ------------------------------------------------------------------ */

export function buildEntityContext(inputs: EntityContextInputs): EntityContextVM {
  const { entityKey } = inputs;
  const theme = inputs.theme ?? null;
  const deltas = inputs.deltas ?? [];
  const graphReady = inputs.graphReady !== false;

  const node = graphReady ? G.getNode(entityKey) : undefined;
  const profile = node ? cachedProfile(node.label) : null;
  const live = !!profile && profile.identity.status !== "unavailable";
  const risks = buildRiskRead(node?.label ?? entityKey, theme);

  const conviction = theme
    ? Math.round(theme.confidence ?? 0)
    : live ? profile!.confidence.data?.conviction ?? null : null;

  const ledgerKey = (node?.label ?? theme?.name ?? entityKey).toLowerCase();
  const ledgerIdx = deltas.findIndex(d => d.entity.toLowerCase() === ledgerKey);

  const narrativeName = node?.label ?? theme?.name ?? entityKey;
  const narrative = live || theme
    ? (inputs.narrativeOf ?? findNarrativeForTheme)(narrativeName)?.label ?? null
    : null;

  return {
    entityKey,
    status: live ? "live" : theme ? "partial" : "unavailable",
    identity: live
      ? {
          label: profile!.identity.data!.label,
          kind: profile!.identity.data!.kind,
          nodeType: profile!.identity.data!.nodeType,
          description: profile!.identity.data!.description,
        }
      : null,
    profile,
    risks,
    conviction,
    convictionBasis: theme ? "theme pipeline" : conviction !== null ? "graph profile" : null,
    convictionExplanation: live ? profile!.confidence.data?.explanation ?? null : null,
    evidenceVerdict: live ? profile!.evidence.data?.verdict ?? null : null,
    forward: live ? profile!.thesis.data?.forward ?? null : null,
    drivers: live ? (profile!.drivers.data ?? []).slice(0, 6) : [],
    beneficiaries: live
      ? (profile!.beneficiaries.data ?? []).filter(l => l.nodeType === "Company" || l.nodeType === "ETF").slice(0, 6)
      : [],
    narrative,
    transmission: live && (profile!.transmission.data?.strongestPath ?? []).length >= 2
      ? profile!.transmission.data!.strongestPath
      : null,
    evolutionLines: live ? profile!.evolution.data?.lines ?? [] : [],
    watchItems: risks.watchItems,
    catalysts: risks.catalysts,
    latestChange: ledgerIdx >= 0 ? deltas[ledgerIdx] : null,
  };
}
