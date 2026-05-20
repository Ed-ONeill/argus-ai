"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronLeft, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Globe, BarChart3, Zap,
  Radio, ShieldAlert, Target, Shuffle, RefreshCw,
  Headphones, ArrowUpRight, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSectors } from "@/hooks/useSectors";
import { useFeed } from "@/hooks/useFeed";
import {
  getIndustryBySlug,
  getSectorIntelligence,
  getIndustrySignals,
  getTopTheme,
  filterIndustryClusters,
  type IndustryConfig,
} from "@/lib/industryConfig";
import {
  generateThesis,
  getCrossAssetEffects,
  getRiskFactors,
  getKeyDrivers,
} from "@/lib/sectorIntelligence";
import type { SectorIntelligence, IndustrySignal, StoryCluster } from "@/lib/types";

// ── Regime badge (dark-hero variant) ─────────────────────────────────────────

const REGIME_DARK: Record<string, { cls: string; label: string }> = {
  "Risk-Off Hawkish":      { cls: "bg-red-500/20    text-red-300    border-red-400/30",     label: "Risk-Off · Hawkish" },
  "Risk-Off Neutral":      { cls: "bg-orange-500/20 text-orange-300 border-orange-400/30",  label: "Risk-Off · Neutral" },
  "Risk-On Dovish":        { cls: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30", label: "Risk-On · Dovish"  },
  "Risk-On Neutral":       { cls: "bg-blue-500/20   text-blue-300   border-blue-400/30",    label: "Risk-On · Neutral"  },
  "Stagflationary":        { cls: "bg-amber-500/20  text-amber-300  border-amber-400/30",   label: "Stagflationary"     },
  "Neutral/Consolidating": { cls: "bg-slate-500/20  text-slate-300  border-slate-400/30",   label: "Neutral"            },
};

// ── Section label ─────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, children }: {
  icon: React.FC<{ size?: number; className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <Icon size={11} className="text-ink-secondary shrink-0" strokeWidth={2} />
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink">
        {children}
      </span>
      <span className="h-px flex-1 bg-edge" />
    </div>
  );
}

// ── Sentiment meta ────────────────────────────────────────────────────────────

const SENTIMENT = {
  bullish: { label: "Bullish", Icon: TrendingUp,    heroText: "text-emerald-300", bg: "bg-emerald-500/20 border-emerald-400/30 text-emerald-300" },
  bearish: { label: "Bearish", Icon: TrendingDown,  heroText: "text-red-300",     bg: "bg-red-500/20    border-red-400/30    text-red-300"     },
  mixed:   { label: "Mixed",   Icon: AlertTriangle, heroText: "text-amber-300",   bg: "bg-amber-500/20  border-amber-400/30  text-amber-300"   },
  neutral: { label: "Neutral", Icon: Minus,         heroText: "text-white/50",    bg: "bg-white/10      border-white/20       text-white/60"    },
} as const;

// ── Story row ─────────────────────────────────────────────────────────────────

function StoryRow({ cluster, color }: { cluster: StoryCluster; color: string }) {
  const item = cluster.primary;
  const signalCls =
    item.signal_strength === "strong" ? "text-emerald-600 bg-emerald-50 border-emerald-100" :
    item.signal_strength === "medium" ? "text-amber-600   bg-amber-50   border-amber-100"   :
                                        "text-ink-muted   bg-raised     border-edge";
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2.5 group py-2.5 border-b border-edge/50 last:border-0"
    >
      <span
        className="w-[2.5px] shrink-0 self-stretch rounded-full"
        style={{ background: `${color}60` }}
      />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-[12px] font-medium text-ink leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {item.title}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-ink-muted">{item.source}</span>
          <span className={cn(
            "text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-px rounded border",
            signalCls,
          )}>
            {item.signal_strength}
          </span>
          {cluster.related.length > 0 && (
            <span className="text-[9.5px] text-ink-muted/70">
              +{cluster.related.length} related
            </span>
          )}
        </div>
      </div>
      <ArrowUpRight size={10} className="text-ink-muted/30 group-hover:text-accent transition-colors shrink-0 mt-0.5" />
    </a>
  );
}

// ── Theme cluster row ─────────────────────────────────────────────────────────

function ThemeRow({ cluster, color, index }: { cluster: StoryCluster; color: string; index: number }) {
  const score     = cluster.cluster_score;
  const scoreColor = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : color;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.06, duration: 0.22, ease: "easeOut" }}
      className="flex items-start gap-3 py-2 border-b border-edge/40 last:border-0"
    >
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ background: `${scoreColor}60` }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-ink leading-tight mb-0.5">
          {cluster.theme_label}
        </p>
        <p className="text-[10px] text-ink-muted">
          {cluster.story_count} {cluster.story_count === 1 ? "story" : "stories"}
          {cluster.primary.affected_entities.length > 0 && (
            <span> · {cluster.primary.affected_entities.slice(0, 3).join(", ")}</span>
          )}
        </p>
      </div>
      <span
        className="text-[12px] font-black tabular-nums shrink-0"
        style={{ color: scoreColor }}
      >
        {score.toFixed(0)}
      </span>
    </motion.div>
  );
}

// ── Macro driver chip ─────────────────────────────────────────────────────────

function DriverChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[9.5px] font-bold px-2.5 py-1 rounded-lg leading-none"
      style={{ color, background: `${color}12` }}
    >
      {label}
    </span>
  );
}

// ── Industry signal bar ───────────────────────────────────────────────────────

function IndustryBar({ sig, max, color }: { sig: IndustrySignal; max: number; color: string }) {
  const pct = max > 0 ? (sig.signal_score / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-secondary truncate">{sig.name}</span>
        <span className="text-[10px] font-mono text-ink-muted tabular-nums shrink-0">
          {sig.signal_score.toFixed(0)}
        </span>
      </div>
      <div className="h-[2.5px] rounded-full bg-raised overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `${color}80` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
        />
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function DetailSkeleton({ color }: { color: string }) {
  return (
    <div className="min-h-screen bg-canvas">
      <div
        className="h-[280px]"
        style={{ background: "linear-gradient(135deg, #090F21 0%, #0F1A3D 55%, #1A2B5F 100%)" }}
      />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-surface rounded-xl border border-edge p-5 space-y-3">
            <div className="h-3 w-32 bg-raised rounded animate-pulse" />
            <div className="space-y-2">
              <div className="h-2.5 w-full bg-raised rounded animate-pulse" />
              <div className="h-2.5 w-5/6 bg-raised rounded animate-pulse" />
              <div className="h-2.5 w-4/5 bg-raised rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IndustryDetailPage() {
  const params   = useParams();
  const slug     = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug ?? "");
  const industry = getIndustryBySlug(slug);

  const { sectorData, regime, clusters, isLoading, isFetching, cacheAge } = useSectors();
  const { data: feedData } = useFeed({});
  const whatMattersNow = feedData?.what_matters_now ?? [];

  // Not found state
  if (!industry) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-ink-muted">Industry not found</p>
          <Link
            href="/industries"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
          >
            <ChevronLeft size={14} /> Back to Industries
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) return <DetailSkeleton color={industry.color} />;

  // ── Derived data ────────────────────────────────────────────────────────────
  const sectorIntel  = getSectorIntelligence(industry, sectorData?.sectors ?? []);
  const indSignals   = getIndustrySignals(industry, sectorData?.industries ?? []);
  const topClusters  = filterIndustryClusters(industry, clusters, 8);

  const thesis  = sectorIntel ? generateThesis(sectorIntel, indSignals, regime) : null;
  const [cxA, cxB] = sectorIntel ? getCrossAssetEffects(industry.sector, regime) : ["", ""];
  const [rkA, rkB] = sectorIntel ? getRiskFactors(industry.sector, regime)       : ["", ""];
  const drivers = sectorIntel
    ? getKeyDrivers(sectorIntel, indSignals, topClusters)
    : industry.macroDrivers.slice(0, 6);

  const maClusters    = topClusters.filter(c => c.primary.category === "M&A").slice(0, 3);
  const storyClusters = topClusters.filter(c => c.primary.category !== "M&A").slice(0, 5);
  const themeClusters = topClusters.slice(0, 4);
  const topTheme      = getTopTheme(industry, clusters, whatMattersNow);

  const score     = sectorIntel?.signal_score     ?? 0;
  const sentiment = (sectorIntel?.impact_sentiment ?? "neutral") as keyof typeof SENTIMENT;
  const count     = sectorIntel?.signal_count     ?? 0;
  const alignment = sectorIntel?.regime_alignment ?? "neutral";
  const hasData   = sectorIntel !== null && score > 0;

  const sc         = SENTIMENT[sentiment] ?? SENTIMENT.neutral;
  const SIcon      = sc.Icon;
  const scoreColor = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : score > 0 ? industry.color : "#C2CBD8";
  const regimeMeta = regime ? (REGIME_DARK[regime] ?? null) : null;
  const maxInd     = indSignals[0]?.signal_score ?? 1;

  return (
    <div className="min-h-screen bg-canvas">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #090F21 0%, #0F1A3D 55%, #1A2B5F 100%)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: [
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12">

          {/* Back + breadcrumb */}
          <Link
            href="/industries"
            className="inline-flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors mb-6 group"
          >
            <ChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-xs font-medium">Industries</span>
          </Link>

          {/* Status row */}
          <div className="flex flex-wrap items-center gap-2.5 mb-4">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inset-0 rounded-full bg-emerald-400 opacity-75" />
                <span className="relative rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/40">
                {industry.shortName} · Live
              </span>
            </div>
            {regimeMeta && (
              <span className={cn(
                "text-[9px] font-bold uppercase tracking-widest px-2 py-[3px] rounded-full border",
                regimeMeta.cls,
              )}>
                {regimeMeta.label}
              </span>
            )}
            {isFetching && !isLoading && (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                className="text-white/25"
              >
                <RefreshCw size={9} />
              </motion.span>
            )}
          </div>

          {/* Industry name */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="text-[32px] sm:text-[40px] font-black text-white tracking-tight leading-none mb-2"
          >
            {industry.name}
          </motion.h1>
          <p className="text-sm text-white/45 mb-7 leading-relaxed">
            {industry.description}
          </p>

          {/* Live metrics row */}
          <div className="flex flex-wrap items-end gap-6 mb-7">
            {/* Sentiment */}
            <div>
              <span className={cn(
                "inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest",
                "px-2.5 py-1 rounded-full border",
                sc.bg,
              )}>
                <SIcon size={10} strokeWidth={2.5} />
                {sc.label}
              </span>
            </div>

            {/* Signal score */}
            {hasData && (
              <>
                <div className="w-px h-9 bg-white/10" />
                <div>
                  <p className="text-[28px] font-black tabular-nums leading-none"
                     style={{ color: scoreColor }}>
                    {score.toFixed(0)}
                  </p>
                  <p className="text-[9px] font-medium text-white/35 uppercase tracking-[0.14em] mt-0.5">
                    Signal Score
                  </p>
                </div>
              </>
            )}

            {/* Stories */}
            {hasData && (
              <>
                <div className="w-px h-9 bg-white/10" />
                <div>
                  <p className="text-[28px] font-black text-white tabular-nums leading-none">
                    {count}
                  </p>
                  <p className="text-[9px] font-medium text-white/35 uppercase tracking-[0.14em] mt-0.5">
                    Active Stories
                  </p>
                </div>
              </>
            )}

            {/* Regime alignment */}
            {hasData && (
              <>
                <div className="w-px h-9 bg-white/10" />
                <div>
                  <p className={cn(
                    "text-[13px] font-bold leading-none",
                    alignment === "tailwind" ? "text-emerald-400" :
                    alignment === "headwind" ? "text-red-400"     : "text-white/40",
                  )}>
                    {alignment === "tailwind" ? "↑ Tailwind" :
                     alignment === "headwind" ? "↓ Headwind" : "→ Neutral"}
                  </p>
                  <p className="text-[9px] font-medium text-white/35 uppercase tracking-[0.14em] mt-0.5">
                    Regime
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Key asset chips */}
          <div className="flex flex-wrap gap-1.5">
            {industry.keyAssets.map(ticker => (
              <span
                key={ticker}
                className="text-[10px] font-bold font-mono px-2.5 py-[5px] rounded-lg leading-none"
                style={{ color: industry.color, background: `${industry.color}22` }}
              >
                {ticker}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── What Matters ──────────────────────────────────────────────── */}
        {thesis && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.25, ease: "easeOut" }}
            className="bg-surface rounded-xl border border-edge p-5"
            style={{ borderLeftColor: industry.color, borderLeftWidth: "3px" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Zap size={11} className="shrink-0" style={{ color: industry.color }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink">
                What Matters Now
              </span>
              {topTheme && (
                <span
                  className="text-[9px] font-bold px-2 py-px rounded-full ml-1"
                  style={{ color: industry.color, background: `${industry.color}14` }}
                >
                  {topTheme}
                </span>
              )}
            </div>
            <p className="text-[13px] text-ink-secondary leading-relaxed">
              {thesis}
            </p>
          </motion.section>
        )}

        {/* ── Main 2-col grid ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left column (2/3) */}
          <div className="lg:col-span-2 space-y-6">

            {/* Live Themes */}
            {themeClusters.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.25, ease: "easeOut" }}
                className="bg-surface rounded-xl border border-edge p-5"
              >
                <SectionHeader icon={Activity}>Live Themes</SectionHeader>
                <div>
                  {themeClusters.map((cl, i) => (
                    <ThemeRow key={cl.id} cluster={cl} color={industry.color} index={i} />
                  ))}
                </div>
              </motion.section>
            )}

            {/* Top Stories */}
            {storyClusters.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16, duration: 0.25, ease: "easeOut" }}
                className="bg-surface rounded-xl border border-edge p-5"
              >
                <SectionHeader icon={BarChart3}>Top Stories</SectionHeader>
                <div>
                  {storyClusters.map(cl => (
                    <StoryRow key={cl.id} cluster={cl} color={industry.color} />
                  ))}
                </div>
              </motion.section>
            )}

            {/* M&A Activity */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.25, ease: "easeOut" }}
              className="bg-surface rounded-xl border border-edge p-5"
            >
              <SectionHeader icon={Shuffle}>M&A Activity</SectionHeader>
              {maClusters.length > 0 ? (
                <div>
                  {maClusters.map(cl => (
                    <StoryRow key={cl.id} cluster={cl} color={industry.color} />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11.5px] text-ink-secondary leading-relaxed">
                    {industry.maTheme}
                  </p>
                  <p className="text-[10px] text-ink-muted">
                    No active M&A stories in the current feed window.
                  </p>
                </div>
              )}
            </motion.section>

            {/* Cross-Asset Effects */}
            {(cxA || cxB) && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24, duration: 0.25, ease: "easeOut" }}
                className="bg-surface rounded-xl border border-edge p-5"
              >
                <SectionHeader icon={Target}>Cross-Asset Effects</SectionHeader>
                <ul className="space-y-3">
                  {[cxA, cxB].filter(Boolean).map((line, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span
                        className="w-1 h-1 rounded-full mt-[6px] shrink-0"
                        style={{ background: industry.color }}
                      />
                      <p className="text-[12px] text-ink-secondary leading-relaxed">{line}</p>
                    </li>
                  ))}
                </ul>
              </motion.section>
            )}
          </div>

          {/* Right column (1/3) */}
          <div className="space-y-5">

            {/* Sub-industry signals */}
            {indSignals.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14, duration: 0.25, ease: "easeOut" }}
                className="bg-surface rounded-xl border border-edge p-4"
              >
                <SectionHeader icon={BarChart3}>Sub-Industries</SectionHeader>
                <div className="space-y-3">
                  {indSignals.slice(0, 5).map(sig => (
                    <IndustryBar key={sig.name} sig={sig} max={maxInd} color={industry.color} />
                  ))}
                </div>
              </motion.section>
            )}

            {/* Macro Drivers */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.17, duration: 0.25, ease: "easeOut" }}
              className="bg-surface rounded-xl border border-edge p-4"
            >
              <SectionHeader icon={BarChart3}>Macro Drivers</SectionHeader>
              <div className="flex flex-wrap gap-1.5">
                {drivers.map(d => (
                  <DriverChip key={d} label={d} color={industry.color} />
                ))}
              </div>
            </motion.section>

            {/* Bullish / Bearish Positioning */}
            {sectorIntel && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.25, ease: "easeOut" }}
                className="bg-surface rounded-xl border border-edge p-4"
              >
                <SectionHeader icon={TrendingUp}>Positioning</SectionHeader>
                <div className="space-y-2.5">
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-widest text-emerald-600 mb-1">
                      Bullish Case
                    </p>
                    <p className="text-[11px] text-ink-secondary leading-relaxed">
                      {alignment === "tailwind"
                        ? `Regime tailwind supports ${industry.name} leadership. Signal strength is ${score >= 70 ? "high" : score >= 40 ? "moderate" : "building"}.`
                        : `${industry.name} signal at ${score.toFixed(0)} — ${count} active stories sustaining the upside thesis.`
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-widest text-red-600 mb-1">
                      Bearish Case
                    </p>
                    <p className="text-[11px] text-ink-secondary leading-relaxed">
                      {alignment === "headwind"
                        ? `Current regime is a headwind. Positioning requires evidence of mean reversion before adding risk.`
                        : `Watch for regime shift or signal deterioration below 20 as a rotation warning signal.`
                      }
                    </p>
                  </div>
                </div>
              </motion.section>
            )}

            {/* Risk Factors */}
            {(rkA || rkB) && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.23, duration: 0.25, ease: "easeOut" }}
                className="bg-surface rounded-xl border border-edge p-4"
              >
                <SectionHeader icon={ShieldAlert}>Risk Factors</SectionHeader>
                <ul className="space-y-3">
                  {[rkA, rkB].filter(Boolean).map((line, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <AlertTriangle size={10} className="text-amber-500/70 mt-[2px] shrink-0" />
                      <p className="text-[11px] text-ink-secondary leading-relaxed">{line}</p>
                    </li>
                  ))}
                </ul>
              </motion.section>
            )}

            {/* Geopolitical Exposure */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.26, duration: 0.25, ease: "easeOut" }}
              className="bg-surface rounded-xl border border-edge p-4"
            >
              <SectionHeader icon={Globe}>Geopolitical Exposure</SectionHeader>
              <p className="text-[11.5px] text-ink-secondary leading-relaxed">
                {industry.geopoliticalExposure}
              </p>
            </motion.section>

            {/* Related Listening */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.29, duration: 0.25, ease: "easeOut" }}
              className="rounded-xl overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${industry.color}18 0%, ${industry.color}08 100%)` }}
            >
              <div className="border border-edge p-4 rounded-xl">
                <SectionHeader icon={Headphones}>Listen & Learn</SectionHeader>
                <p className="text-[11.5px] text-ink-secondary leading-relaxed mb-3">
                  Find podcasts and briefings covering {industry.name} themes, earnings, and macro drivers.
                </p>
                <Link
                  href={`/listen`}
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold",
                    "transition-all duration-150 hover:opacity-90 hover:-translate-y-px",
                  )}
                  style={{ background: industry.color, color: "#fff" }}
                >
                  <Radio size={11} />
                  Open Listen
                  <ArrowUpRight size={10} />
                </Link>
              </div>
            </motion.section>

          </div>
        </div>

        {/* ── Market Sensitivity (full width) ──────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.25, ease: "easeOut" }}
          className="bg-surface rounded-xl border border-edge p-5"
        >
          <SectionHeader icon={BarChart3}>Market Sensitivity</SectionHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {industry.macroDrivers.map(driver => (
              <div
                key={driver}
                className="rounded-lg p-3 text-center"
                style={{ background: `${industry.color}0a`, border: `1px solid ${industry.color}20` }}
              >
                <p className="text-[11px] font-semibold text-ink leading-tight">{driver}</p>
                <div className="mt-1.5 h-[2px] rounded-full bg-raised overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: "70%", background: industry.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.section>

      </div>
    </div>
  );
}
