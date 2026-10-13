// Homepage interpretation must be anchored in the same event as the lead.
// Theme configuration and unrelated momentum are context, never causal evidence.
import type { EntityKind } from "./entity";
import type { FeedResponse } from "./types";
import { leadEventOf } from "./adaptiveHero";
import { directCompanies, IMPLICATION_LIMIT } from "./eventPresentation";

export type MarketCategory = "Company" | "Index" | "Macro" | "Commodity" | "Geopolitics" | "Sector";
export interface CausalActor { label: string; kind: EntityKind; }
export interface WhyItsMoving {
  subject: string;
  read: string;
  chain: CausalActor[];
  benefits: CausalActor[];
  atRisk: CausalActor[];
}
export interface HomeBriefingVM {
  hasIntelligence: boolean;
  why: WhyItsMoving | null;
  watchLine: string | null;
}
export function buildHomeBriefing(feed: FeedResponse | undefined): HomeBriefingVM {
  const lead = leadEventOf(feed);
  const named = lead ? directCompanies(lead) : [];
  return {
    hasIntelligence: !!lead,
    why: lead ? {
      subject: lead.title,
      read: `${named.length ? `Reporting names ${named.join(", ")}. ` : ""}${IMPLICATION_LIMIT}`,
      chain: [], benefits: [], atRisk: [],
    } : null,
    watchLine: null,
  };
}
