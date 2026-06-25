"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GitMerge, Building2, TrendingUp, AlertCircle, ExternalLink, Clock, ChevronRight, Network, Lightbulb, Target, Landmark } from "lucide-react";
import { useMAIntelligence, type MADeal, type DealType } from "@/hooks/useMAIntelligence";
import { useMarketState } from "@/hooks/useMarketState";
import { useMarketData } from "@/hooks/useMarketData";
import { useFeed } from "@/hooks/useFeed";
import { computeThemeEvolutionState, getEvolutionNarrative, filterMAThemes, THEME_EVOLUTION_META } from "@/lib/themeEvolution";
import { explainMAActivity, extractAcquirerProfiles, enrichSponsorProfiles } from "@/lib/themeIntelligence";
import { clusterDealsByTheme } from "@/lib/industryIntelligence";
import { computeCapitalFlow } from "@/lib/capitalFlow";
import { useThemeWatchlist } from "@/hooks/useThemeWatchlist";
import { timeAgo, cn } from "@/lib/utils";
import { enrichDeal, rankAdvisors, rankIndustries, type DealContext } from "@/lib/maIntelligence";
import type { ThemeIntelligence } from "@/lib/types";

// Code-split the theme drawer — it only mounts when a theme is selected, so it
// stays out of the M&A page's First Load JS.
const ThemeDrawer = dynamic(
  () => import("@/components/themes/ThemeDrawer").then(m => m.ThemeDrawer),
  { ssr: false },
);

// ── Deal type config ──────────────────────────────────────────────────────────

const DEAL_TYPE_META: Record<DealType, { label: string; color: string; bg: string }> = {
  strategic: { label: "Strategic",  color: "#52b0c8", bg: "rgba(82,176,200,0.12)"  },
  sponsor:   { label: "Sponsor",    color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  merger:    { label: "Merger",     color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  rumored:   { label: "Rumored",    color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  withdrawn: { label: "Withdrawn",  color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  spac:      { label: "SPAC",       color: "#fb923c", bg: "rgba(251,146,60,0.12)"  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function DealTypeBadge({ type }: { type: DealType }) {
  const { label, color, bg } = DEAL_TYPE_META[type];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase"
      style={{ color, background: bg, border: `1px solid ${color}22` }}>
      {label}
    </span>
  );
}

// Relative stamp for a deal; if the source value is not a parseable date (it may
// already be a pre-formatted relative string) fall back to showing it as-is.
function formatRelativeTime(published: string): string {
  return timeAgo(published) || published;
}

// Compact metadata chip used across the deal intelligence header.
function MetaChip({ label, color, mono }: { label: string; color?: string; mono?: boolean }) {
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none", mono && "font-mono")}
      style={{ color: color ?? "rgba(255,255,255,0.5)", background: color ? `${color}14` : "rgba(255,255,255,0.05)", border: `1px solid ${color ? `${color}26` : "rgba(255,255,255,0.07)"}` }}>
      {label}
    </span>
  );
}

// Labeled block inside the expanded intelligence panel.
function IntelBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: "rgba(255,255,255,0.34)" }}>{label}</p>
      {children}
    </div>
  );
}

function DealCard({ deal, index, ctx }: { deal: MADeal; index: number; ctx: DealContext }) {
  const [open, setOpen] = useState(false);
  const intel = useMemo(() => enrichDeal(deal, ctx), [deal, ctx]);
  const hasAdvisors = intel.advisors.banks.length > 0 || intel.advisors.legal.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.03, duration: 0.22 }}
      className="group rounded-xl border transition-colors duration-200 hover:border-white/10"
      style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}
    >
      <div className="p-3.5">
        {/* Intelligence header — type · status · txn · value */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <DealTypeBadge type={deal.dealType} />
          <MetaChip label={intel.status} color={intel.statusColor} />
          <MetaChip label={intel.txnType} />
          {intel.financing && <MetaChip label={intel.financing} color="#52b0c8" />}
          {deal.peFirm && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none"
              style={{ background: "rgba(167,139,250,0.08)", color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.15)" }}>
              <Building2 size={9} />{deal.peFirm}
            </span>
          )}
          {intel.crossBorder && <MetaChip label="Cross-border" />}
          <span className="text-[10px] ml-auto" style={{ color: "rgba(255,255,255,0.26)" }}>{deal.sector}</span>
          {intel.dealValue && (
            <span className="text-[13px] font-black tabular-nums tracking-tight" style={{ color: "rgba(255,255,255,0.92)" }}>
              {intel.dealValue}
            </span>
          )}
        </div>

        {/* Headline (links to source) */}
        <a href={deal.url} target="_blank" rel="noopener noreferrer"
          className="block text-sm font-medium leading-snug hover:text-white/95 transition-colors"
          style={{ color: "rgba(255,255,255,0.84)" }}>
          {deal.title}
          <ExternalLink size={11} className="inline-block ml-1.5 -translate-y-px opacity-0 group-hover:opacity-40 transition-opacity" />
        </a>

        {/* Buyer → Target */}
        {(intel.buyer || intel.target) && (
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px]">
            <span className="font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>{intel.buyer ?? "—"}</span>
            <span style={{ color: "rgba(255,255,255,0.28)" }}>→</span>
            <span className="font-semibold" style={{ color: deal.dealType === "withdrawn" ? "rgba(248,113,113,0.7)" : "rgba(82,176,200,0.85)" }}>{intel.target ?? "—"}</span>
          </div>
        )}

        {deal.whyItMatters && (
          <p className="text-xs mt-1.5 leading-relaxed line-clamp-2" style={{ color: "rgba(255,255,255,0.42)" }}>
            {deal.whyItMatters}
          </p>
        )}

        {/* Footer: rationale + advisors hint + time + expand */}
        <div className="flex items-center gap-2.5 mt-2.5">
          <span className="text-[10px] font-semibold" style={{ color: "rgba(167,139,250,0.7)" }}>{intel.rationale}</span>
          {hasAdvisors && (
            <span className="text-[9.5px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              · {intel.advisors.banks.length + intel.advisors.legal.length} advisor{intel.advisors.banks.length + intel.advisors.legal.length > 1 ? "s" : ""}
            </span>
          )}
          <div className="flex items-center gap-1 ml-auto shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>
            <Clock size={10} /><span className="text-[10px]">{formatRelativeTime(deal.published)}</span>
          </div>
          <button onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1 text-[10px] font-semibold transition-colors hover:text-white/70"
            style={{ color: "rgba(255,255,255,0.42)" }}>
            {open ? "Less" : "Intelligence"}
            <ChevronRight size={11} className={cn("transition-transform", open && "rotate-90")} />
          </button>
        </div>
      </div>

      {/* Expanded intelligence object */}
      {open && (
        <div className="px-3.5 pb-3.5 pt-1 border-t grid sm:grid-cols-2 gap-x-5 gap-y-3"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <IntelBlock label="Deal Thesis">
            <ul className="space-y-1">
              {intel.thesis.map((b, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.6)" }}>
                  <span className="shrink-0 mt-[5px] w-1 h-1 rounded-full" style={{ background: "rgba(167,139,250,0.6)" }} />{b}
                </li>
              ))}
            </ul>
          </IntelBlock>
          <IntelBlock label="Market Implications">
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>{intel.implications}</p>
          </IntelBlock>
          <IntelBlock label="Why Now">
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{intel.whyNow}</p>
          </IntelBlock>
          <IntelBlock label="What's Next">
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{intel.whatNext}</p>
          </IntelBlock>
          {intel.readThrough.length > 0 && (
            <IntelBlock label="Potential Read-Through">
              <div className="flex flex-wrap gap-1">
                {intel.readThrough.map(p => (
                  <span key={p} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(82,176,200,0.1)", color: "rgba(82,176,200,0.8)", border: "1px solid rgba(82,176,200,0.16)" }}>{p}</span>
                ))}
              </div>
            </IntelBlock>
          )}
          {hasAdvisors && (
            <IntelBlock label="Advisor Intelligence">
              <div className="space-y-1">
                {intel.advisors.banks.length > 0 && (
                  <div className="flex items-start gap-1.5 flex-wrap">
                    <span className="text-[9px] font-bold uppercase tracking-wide shrink-0 mt-0.5" style={{ color: "rgba(255,255,255,0.34)" }}>Financial</span>
                    {intel.advisors.banks.map(b => <span key={b} className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.66)" }}>{b}</span>)}
                  </div>
                )}
                {intel.advisors.legal.length > 0 && (
                  <div className="flex items-start gap-1.5 flex-wrap">
                    <span className="text-[9px] font-bold uppercase tracking-wide shrink-0 mt-0.5" style={{ color: "rgba(255,255,255,0.34)" }}>Legal</span>
                    {intel.advisors.legal.map(l => <span key={l} className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.66)" }}>{l}</span>)}
                  </div>
                )}
              </div>
            </IntelBlock>
          )}
        </div>
      )}
    </motion.div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
      <p className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.38)" }}>{label}</p>
      <p className="text-2xl font-bold tracking-tight" style={{ color: color ?? "rgba(255,255,255,0.88)" }}>
        {value}
      </p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.32)" }}>{sub}</p>}
    </div>
  );
}

function BreakdownRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-20 shrink-0" style={{ color: "rgba(255,255,255,0.52)" }}>{label}</span>
      <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs w-6 text-right font-mono" style={{ color: "rgba(255,255,255,0.44)" }}>{count}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MAPage() {
  const [selectedTheme, setSelectedTheme] = useState<ThemeIntelligence | null>(null);

  const { deals, breakdown, sponsors, totalDealCount, isLoading, isError } = useMAIntelligence();
  const { riskRegime, volRegime } = useMarketState();
  const { data: feedData }  = useFeed();
  const { data: marketData } = useMarketData();
  const { isWatched, toggle: toggleThemeWatch } = useThemeWatchlist();

  const maThemes = useMemo(() => {
    const all = feedData?.theme_intelligence ?? [];
    return filterMAThemes(all).slice(0, 4);
  }, [feedData]);

  // Capital flow layers for M&A rationale context
  const capitalFlow = useMemo(() => {
    const tnxRate = marketData?.["TNX"]?.price ?? null;
    return computeCapitalFlow({
      riskRegime,
      volRegime,
      regime: feedData?.sector_data?.derived_regime ?? null,
      tnxRate,
      maDealCount:   deals.length,
      vcDealCount:   0,
      ipoFilerCount: 0,
    });
  }, [riskRegime, volRegime, feedData, marketData, deals.length]);

  const maRationale = useMemo(() => {
    const creditLayer = capitalFlow.layers[2]; // Credit/Leverage
    const maLayer     = capitalFlow.layers[3]; // M&A Activity
    if (!creditLayer || !maLayer) return null;
    return explainMAActivity(
      deals.map(d => ({ dealType: d.dealType, sector: d.sector, peFirm: d.peFirm })),
      maThemes,
      feedData?.sector_data?.derived_regime ?? null,
      { status: creditLayer.status, signal: creditLayer.signal, detail: creditLayer.detail },
      { status: maLayer.status,     signal: maLayer.signal },
    );
  }, [deals, maThemes, feedData, capitalFlow]);

  // Deal-intelligence context: financing window state from the credit layer.
  const dealCtx: DealContext = useMemo(() => {
    const creditLayer = capitalFlow.layers[2];
    return {
      creditOpen: creditLayer ? (creditLayer.status === "accelerating" || creditLayer.status === "expanding") : undefined,
      regime: feedData?.sector_data?.derived_regime ?? undefined,
    };
  }, [capitalFlow, feedData]);

  // League-table aggregates (advisors detected in deal text; industries + capital).
  const advisorTable   = useMemo(() => rankAdvisors(deals), [deals]);
  const industryTable  = useMemo(() => rankIndustries(deals), [deals]);

  const acquirerProfiles = useMemo(
    () => extractAcquirerProfiles(deals.map(d => ({ entities: d.entities, sector: d.sector, dealType: d.dealType }))),
    [deals],
  );

  const dealClusters = useMemo(
    () => clusterDealsByTheme(
      deals.map(d => ({ sector: d.sector, dealType: d.dealType, entities: d.entities })),
      maThemes,
    ),
    [deals, maThemes],
  );

  const enrichedSponsors = useMemo(
    () => enrichSponsorProfiles(sponsors, deals.map(d => ({ peFirm: d.peFirm, sector: d.sector }))),
    [sponsors, deals],
  );

  const regimeColor =
    riskRegime === "risk-on"  ? "#52b0c8" :
    riskRegime === "risk-off" ? "#f87171" : "#94a3b8";


  const activeDeals  = deals.filter(d => d.dealType !== "withdrawn");
  const rumored      = deals.filter(d => d.dealType === "rumored");
  const sponsorDeals = deals.filter(d => d.dealType === "sponsor");

  return (
    <>
    <div className="min-h-screen pb-24" style={{ background: "#030710" }}>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.2)" }}>
                  <GitMerge size={15} style={{ color: "#a78bfa" }} />
                </div>
                <span className="text-xs font-semibold tracking-widest uppercase"
                  style={{ color: "rgba(255,255,255,0.32)", letterSpacing: "0.12em" }}>
                  M&A Intelligence
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2" style={{ color: "rgba(255,255,255,0.92)" }}>
                Deal Flow & Acquisition Activity
              </h1>
              <p className="text-sm max-w-xl" style={{ color: "rgba(255,255,255,0.42)" }}>
                Strategic acquisitions, sponsor buyouts, rumored transactions, and consolidation themes — extracted from live deal intelligence.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs px-2.5 py-1 rounded-full border font-medium"
                style={{ borderColor: `${regimeColor}33`, color: regimeColor, background: `${regimeColor}0f` }}>
                {riskRegime === "risk-on" ? "Risk-On" : riskRegime === "risk-off" ? "Risk-Off" : "Neutral"} Regime
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
            <StatCard label="Active Deals" value={activeDeals.length} sub="strategic + sponsor" color="#52b0c8" />
            <StatCard label="Sponsor / PE" value={sponsorDeals.length} sub="buyouts & take-privates" color="#a78bfa" />
            <StatCard label="Rumored" value={rumored.length} sub="reported / exploring" color="#fbbf24" />
            <StatCard label="Total Tracked" value={totalDealCount} sub="all categories" />
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {isError && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: "rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.06)", color: "#fca5a5" }}>
            <AlertCircle size={14} />
            Unable to load M&A intelligence — feed data unavailable.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Deal Feed ──────────────────────────────────────────────── */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} style={{ color: "#a78bfa" }} />
              <h2 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.72)" }}>
                Deal Flow
              </h2>
              {isLoading && (
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>Loading…</span>
              )}
            </div>

            {/* M&A Rationale */}
            {maRationale && !isLoading && deals.length > 0 && (
              <div
                className="rounded-xl border px-4 py-3 mb-4 flex items-start gap-2.5"
                style={{ background: "rgba(167,139,250,0.05)", borderColor: "rgba(167,139,250,0.14)" }}
              >
                <Lightbulb size={12} className="shrink-0 mt-[2px]" style={{ color: "rgba(167,139,250,0.60)" }} />
                <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.52)" }}>
                  {maRationale}
                </p>
              </div>
            )}

            {/* Consolidation Themes */}
            {dealClusters.length > 0 && !isLoading && (
              <div
                className="rounded-xl border px-4 py-3 mb-4"
                style={{ background: "rgba(82,176,200,0.04)", borderColor: "rgba(82,176,200,0.12)" }}
              >
                <p className="text-[9px] font-bold uppercase tracking-[0.13em] mb-2.5" style={{ color: "rgba(82,176,200,0.50)" }}>
                  Consolidation Themes
                </p>
                <div className="flex flex-wrap gap-2">
                  {dealClusters.map(dc => (
                    <button
                      key={dc.theme.id}
                      onClick={() => setSelectedTheme(dc.theme)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-opacity hover:opacity-80 text-left"
                      style={{ background: "rgba(82,176,200,0.07)", border: "1px solid rgba(82,176,200,0.12)" }}
                    >
                      <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.72)" }}>
                        {dc.theme.name}
                      </span>
                      <span className="text-[9px] font-bold tabular-nums" style={{ color: "rgba(82,176,200,0.70)" }}>
                        {dc.dealCount}
                      </span>
                      {dc.sectors.length > 0 && (
                        <span className="text-[8.5px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                          · {dc.sectors.join(", ")}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isLoading && deals.length === 0 && (
              <div className="rounded-xl border p-8 text-center"
                style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
                <GitMerge size={24} className="mx-auto mb-3" style={{ color: "rgba(255,255,255,0.16)" }} />
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.32)" }}>
                  No M&A deals in the current feed window.
                </p>
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
                  Deals appear when PE Hub, PE Wire, or financial sources report activity.
                </p>
              </div>
            )}

            {/* First-load skeleton — keeps the column from reading blank */}
            {isLoading && deals.length === 0 && (
              <div className="space-y-3" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-xl border animate-pulse"
                    style={{ height: 86, background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.06)" }} />
                ))}
              </div>
            )}

            <div className="space-y-2.5">
              {deals.map((deal, i) => (
                <DealCard key={deal.id} deal={deal} index={i} ctx={dealCtx} />
              ))}
            </div>
          </div>

          {/* ── Sidebar ────────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Deal type breakdown */}
            <div className="rounded-xl border p-5"
              style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
              <h3 className="text-xs font-semibold uppercase tracking-widest mb-4"
                style={{ color: "rgba(255,255,255,0.36)", letterSpacing: "0.1em" }}>
                Deal Type Breakdown
              </h3>
              <div className="space-y-2.5">
                {(Object.entries(DEAL_TYPE_META) as [DealType, typeof DEAL_TYPE_META[DealType]][]).map(([type, meta]) => (
                  <BreakdownRow
                    key={type}
                    label={meta.label}
                    count={breakdown[type]}
                    total={totalDealCount}
                    color={meta.color}
                  />
                ))}
              </div>
            </div>

            {/* Top Financial Advisors — league table from detected advisors */}
            {advisorTable.length > 0 && (
              <div className="rounded-xl border p-5"
                style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2 mb-4">
                  <Landmark size={12} style={{ color: "rgba(82,176,200,0.5)" }} />
                  <h3 className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "rgba(255,255,255,0.36)", letterSpacing: "0.1em" }}>
                    Top Advisors
                  </h3>
                  <span className="text-[9px] ml-auto" style={{ color: "rgba(255,255,255,0.24)" }}>active deals</span>
                </div>
                <div className="space-y-2">
                  {advisorTable.map(a => (
                    <div key={a.name} className="flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: a.legal ? "#fbbf24" : "#52b0c8" }} />
                      <span className="text-[11.5px] font-medium flex-1 min-w-0 truncate" style={{ color: "rgba(255,255,255,0.74)" }}>{a.name}</span>
                      <span className="text-[8px] uppercase tracking-wide shrink-0" style={{ color: "rgba(255,255,255,0.26)" }}>{a.legal ? "Legal" : "Financial"}</span>
                      <span className="text-[10.5px] font-mono font-bold tabular-nums shrink-0 w-5 text-right" style={{ color: a.legal ? "#fbbf24" : "#52b0c8" }}>{a.deals}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sponsor Intelligence — enriched with sector breakdown */}
            {enrichedSponsors.length > 0 && (
              <div className="rounded-xl border p-5"
                style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2 mb-4">
                  <Building2 size={12} style={{ color: "rgba(167,139,250,0.50)" }} />
                  <h3 className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "rgba(255,255,255,0.36)", letterSpacing: "0.1em" }}>
                    Sponsor Intelligence
                  </h3>
                </div>
                <div className="space-y-3">
                  {enrichedSponsors.map(s => (
                    <div key={s.firm}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.72)" }}>{s.firm}</span>
                        <span className="text-[10px] font-mono font-bold" style={{ color: "#a78bfa" }}>
                          {s.deals} deal{s.deals > 1 ? "s" : ""}
                        </span>
                      </div>
                      {s.sectors.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {s.sectors.map((sec, i) => (
                            <span
                              key={sec}
                              className="text-[9px] px-1.5 py-px rounded"
                              style={{
                                background: i === 0 ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.04)",
                                color:      i === 0 ? "#c4b5fd"                : "rgba(255,255,255,0.34)",
                                border:     `1px solid ${i === 0 ? "rgba(167,139,250,0.20)" : "rgba(255,255,255,0.06)"}`,
                              }}
                            >
                              {i === 0 && "● "}{sec}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Acquirer Intelligence — strategic deal entity activity */}
            {acquirerProfiles.length > 0 && (
              <div className="rounded-xl border p-5"
                style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2 mb-4">
                  <Target size={12} style={{ color: "rgba(82,176,200,0.50)" }} />
                  <h3 className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "rgba(255,255,255,0.36)", letterSpacing: "0.1em" }}>
                    Strategic Entities
                  </h3>
                </div>
                <p className="text-[9.5px] mb-3 leading-snug" style={{ color: "rgba(255,255,255,0.24)" }}>
                  Most active entities in strategic &amp; merger deals this window.
                </p>
                <div className="space-y-2.5">
                  {acquirerProfiles.map(p => (
                    <div key={p.name} className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] font-bold font-mono" style={{ color: "#52b0c8" }}>
                          {p.name}
                        </span>
                        {p.sectors.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {p.sectors.map(sec => (
                              <span
                                key={sec}
                                className="text-[8px] px-1 py-px rounded"
                                style={{ background: "rgba(82,176,200,0.08)", color: "rgba(82,176,200,0.60)", border: "1px solid rgba(82,176,200,0.12)" }}
                              >
                                {sec}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-mono shrink-0 mt-0.5" style={{ color: "rgba(255,255,255,0.30)" }}>
                        ×{p.dealCount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Most Active Industries — deal count + disclosed capital deployed */}
            {industryTable.length > 0 && (
              <div className="rounded-xl border p-5"
                style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "rgba(255,255,255,0.36)", letterSpacing: "0.1em" }}>
                    Most Active Industries
                  </h3>
                  <span className="text-[9px] ml-auto" style={{ color: "rgba(255,255,255,0.24)" }}>deals · capital</span>
                </div>
                <div className="space-y-2.5">
                  {industryTable.map(ind => {
                    const pct = totalDealCount > 0 ? Math.round((ind.deals / totalDealCount) * 100) : 0;
                    return (
                      <div key={ind.sector}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11.5px] flex-1 min-w-0 truncate" style={{ color: "rgba(255,255,255,0.62)" }}>{ind.sector}</span>
                          {ind.capital && <span className="text-[10px] font-mono font-bold tabular-nums shrink-0" style={{ color: "rgba(82,176,200,0.85)" }}>{ind.capital}</span>}
                          <span className="text-[10px] font-mono tabular-nums w-5 text-right shrink-0" style={{ color: "rgba(255,255,255,0.44)" }}>{ind.deals}</span>
                        </div>
                        <div className="h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: "#52b0c8" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[8.5px] mt-3 leading-snug" style={{ color: "rgba(255,255,255,0.2)" }}>
                  Capital = sum of disclosed deal values; deals without a stated value are counted but excluded from capital.
                </p>
              </div>
            )}

            {/* M&A Narrative Themes */}
            {maThemes.length > 0 && (
              <div className="rounded-xl border p-5"
                style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2 mb-4">
                  <Network size={12} style={{ color: "rgba(255,255,255,0.36)" }} />
                  <h3 className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "rgba(255,255,255,0.36)", letterSpacing: "0.1em" }}>
                    Narrative Themes
                  </h3>
                </div>
                <div className="space-y-3">
                  {maThemes.map(t => {
                    const evState = computeThemeEvolutionState(t);
                    const evMeta  = THEME_EVOLUTION_META[evState];
                    return (
                      <div key={t.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                            style={{ color: evMeta.color, background: evMeta.bg, borderColor: evMeta.border }}>
                            {evMeta.icon} {evMeta.label}
                          </span>
                          <span className="text-xs font-medium flex-1 truncate"
                            style={{ color: "rgba(255,255,255,0.72)" }}>
                            {t.name}
                          </span>
                        </div>
                        <p className="text-[10px] italic leading-snug"
                          style={{ color: "rgba(255,255,255,0.34)" }}>
                          {getEvolutionNarrative(t.name, evState)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Context note */}
            <div className="rounded-xl border p-4"
              style={{ background: "rgba(255,255,255,0.015)", borderColor: "rgba(255,255,255,0.05)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.32)" }}>
                Deals sourced from PE Hub, PE Wire, FT Deals, and DealBook via live RSS. PE firm detection uses title pattern matching. Sector classification is heuristic — verify independently for investment decisions.
              </p>
              <a
                href="/private-markets"
                className="flex items-center gap-1 mt-3 text-xs font-medium group"
                style={{ color: "rgba(82,176,200,0.72)" }}
              >
                View Capital Flow Transmission
                <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* ── Theme Drawer ─────────────────────────────────────────────────── */}
    {selectedTheme && (
      <ThemeDrawer
        theme={selectedTheme}
        clusters={feedData?.clusters ?? []}
        deals={deals.map(d => ({ title: d.title, sector: d.sector, dealType: d.dealType, entities: d.entities, url: d.url }))}
        isWatched={isWatched(selectedTheme.id)}
        hasAlert={false}
        onToggleWatch={() => toggleThemeWatch(selectedTheme.id)}
        onClose={() => setSelectedTheme(null)}
      />
    )}
    </>
  );
}
