"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { GitMerge, Building2, TrendingUp, AlertCircle, ExternalLink, Clock, ChevronRight, Network, Lightbulb } from "lucide-react";
import { useMAIntelligence, type MADeal, type DealType } from "@/hooks/useMAIntelligence";
import { useMarketState } from "@/hooks/useMarketState";
import { useMarketData } from "@/hooks/useMarketData";
import { useFeed } from "@/hooks/useFeed";
import { computeThemeEvolutionState, getEvolutionNarrative, filterMAThemes, THEME_EVOLUTION_META } from "@/lib/themeEvolution";
import { explainMAActivity } from "@/lib/themeIntelligence";
import { computeCapitalFlow } from "@/lib/capitalFlow";
import { cn } from "@/lib/utils";

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

function formatRelativeTime(published: string): string {
  try {
    const ms  = Date.now() - new Date(published).getTime();
    const h   = Math.floor(ms / 3_600_000);
    if (h < 1)  return `${Math.floor(ms / 60_000)}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return published;
  }
}

function DealCard({ deal, index }: { deal: MADeal; index: number }) {
  const hasEntities = deal.entities.length > 0;
  return (
    <motion.a
      href={deal.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.035, duration: 0.25 }}
      className="group block rounded-xl border p-4 transition-all duration-200 hover:border-white/10"
      style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <DealTypeBadge type={deal.dealType} />
            {deal.peFirm && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                style={{ background: "rgba(167,139,250,0.08)", color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.15)" }}>
                <Building2 size={9} />
                {deal.peFirm}
              </span>
            )}
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>
              {deal.sector}
            </span>
          </div>
          <p className="text-sm font-medium leading-snug group-hover:text-white/90 transition-colors"
            style={{ color: "rgba(255,255,255,0.82)" }}>
            {deal.title}
          </p>
          {deal.whyItMatters && (
            <p className="text-xs mt-1.5 leading-relaxed line-clamp-2"
              style={{ color: "rgba(255,255,255,0.42)" }}>
              {deal.whyItMatters}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2.5">
            {hasEntities && (
              <div className="flex items-center gap-1 flex-wrap">
                {deal.entities.slice(0, 4).map(e => (
                  <span key={e} className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.52)" }}>
                    {e}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 ml-auto shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>
              <Clock size={10} />
              <span className="text-[10px]">{formatRelativeTime(deal.published)}</span>
            </div>
          </div>
        </div>
        <ExternalLink size={13} className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-40 transition-opacity"
          style={{ color: "rgba(255,255,255,0.6)" }} />
      </div>
    </motion.a>
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
  const { deals, breakdown, sponsors, sectorDistribution, totalDealCount, isLoading, isError } = useMAIntelligence();
  const { riskRegime, volRegime } = useMarketState();
  const { data: feedData }  = useFeed();
  const { data: marketData } = useMarketData();

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

  const regimeColor =
    riskRegime === "risk-on"  ? "#52b0c8" :
    riskRegime === "risk-off" ? "#f87171" : "#94a3b8";

  const topSectors = useMemo(() =>
    Object.entries(sectorDistribution).sort((a, b) => b[1] - a[1]).slice(0, 6),
    [sectorDistribution],
  );

  const activeDeals  = deals.filter(d => d.dealType !== "withdrawn");
  const rumored      = deals.filter(d => d.dealType === "rumored");
  const sponsorDeals = deals.filter(d => d.dealType === "sponsor");

  return (
    <div className="min-h-screen pb-24" style={{ background: "#050812" }}>

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

            <div className="space-y-3">
              {deals.map((deal, i) => (
                <DealCard key={deal.id} deal={deal} index={i} />
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

            {/* Active sponsors */}
            {sponsors.length > 0 && (
              <div className="rounded-xl border p-5"
                style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
                <h3 className="text-xs font-semibold uppercase tracking-widest mb-4"
                  style={{ color: "rgba(255,255,255,0.36)", letterSpacing: "0.1em" }}>
                  Active Sponsors
                </h3>
                <div className="space-y-2">
                  {sponsors.map(s => (
                    <div key={s.firm} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 size={11} style={{ color: "#a78bfa" }} />
                        <span className="text-xs" style={{ color: "rgba(255,255,255,0.72)" }}>{s.firm}</span>
                      </div>
                      <span className="text-xs font-mono" style={{ color: "#a78bfa" }}>
                        {s.deals} deal{s.deals > 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sector distribution */}
            {topSectors.length > 0 && (
              <div className="rounded-xl border p-5"
                style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
                <h3 className="text-xs font-semibold uppercase tracking-widest mb-4"
                  style={{ color: "rgba(255,255,255,0.36)", letterSpacing: "0.1em" }}>
                  Sector Distribution
                </h3>
                <div className="space-y-2.5">
                  {topSectors.map(([sector, count]) => (
                    <BreakdownRow
                      key={sector}
                      label={sector}
                      count={count}
                      total={totalDealCount}
                      color="#52b0c8"
                    />
                  ))}
                </div>
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
  );
}
