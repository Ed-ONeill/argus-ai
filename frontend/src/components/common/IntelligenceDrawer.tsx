"use client";

import { useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { X, ArrowUpRight } from "lucide-react";
import { TickerChip } from "@/components/common/TickerChip";
import { useFeed } from "@/hooks/useFeed";
import { useMAIntelligence } from "@/hooks/useMAIntelligence";
import { useListenRails } from "@/hooks/useListen";
import { buildCrossIntel } from "@/lib/crossIntel";
import { createDailyThemeSnapshots, getThemeMemory, getThemeHistory, themeKey } from "@/lib/themeSnapshots";
import { useIntelligenceGraph } from "@/hooks/useIntelligenceGraph";
import { predictThemeTrajectory, predictCompanyTrajectory, predictSectorRotation } from "@/lib/predictionEngine";
import { confColor } from "@/app/markets/marketsShared";
import type { IntelContext } from "@/lib/intelligenceContext";

/**
 * IntelligenceDrawer - the reusable cross-page intelligence panel (Phase 5).
 * Opens from any active context and shows the connected picture across Feed,
 * Markets, Industries, M&A, Private and Listen, plus historical memory. Dark and
 * institutional, self-contained so it overlays cleanly on any page. No em/en dashes.
 */

const A = (n: number) => `rgba(255,255,255,${n})`;

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-t" style={{ borderColor: A(0.06) }}>
      <p className="text-[8px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: A(0.34) }}>{label}</p>
      {children}
    </div>
  );
}

interface GraphRel { source: string; target: string; type: string; strength: number }

interface ForecastVM {
  direction:    string;
  probability:  number | null;
  confidence:   number;
  timeframe:    string | null;
  reasons:      string[];
  invalidation: string | null;
}

function RelList({ rels, accent }: { rels: GraphRel[]; accent: string }) {
  return (
    <ul className="space-y-1">
      {rels.map((r, i) => (
        <li key={i} className="text-[10.5px] leading-snug flex items-center gap-1.5" style={{ color: A(0.7) }}>
          <span className="truncate" style={{ color: A(0.9) }}>{r.source}</span>
          <span className="shrink-0 px-1 py-px rounded text-[8px] font-semibold uppercase tracking-wide" style={{ color: accent, background: `${accent}1f` }}>{r.type.replace(/_/g, " ")}</span>
          <span className="truncate" style={{ color: A(0.9) }}>{r.target}</span>
          <span className="ml-auto shrink-0 tabular-nums text-[9px]" style={{ color: A(0.4) }}>{r.strength}</span>
        </li>
      ))}
    </ul>
  );
}

function DrawerBody({ ctx, onClose }: { ctx: IntelContext; onClose: () => void }) {
  const { data } = useFeed();
  const { deals } = useMAIntelligence();
  const { allEpisodes } = useListenRails();

  const themes   = useMemo(() => data?.theme_intelligence ?? [], [data?.theme_intelligence]);
  const clusters = useMemo(() => data?.clusters ?? [], [data?.clusters]);
  const episodes = allEpisodes ?? [];

  const intel = useMemo(
    () => buildCrossIntel(ctx, { themes, clusters, deals, episodes }),
    [ctx, themes, clusters, deals, episodes],
  );

  // Accrue daily memory whenever themes are available (idempotent per day).
  useEffect(() => {
    if (themes.length === 0) return;
    const dealCountBySector: Record<string, number> = {};
    for (const d of deals) dealCountBySector[d.sector] = (dealCountBySector[d.sector] ?? 0) + 1;
    createDailyThemeSnapshots(themes, { dealCountBySector });
  }, [themes, deals]);

  const memory = useMemo(
    () => (intel.theme ? getThemeMemory(themeKey(intel.theme)) : { hasHistory: false, lines: [] as string[] }),
    [intel.theme],
  );

  // Graph-backed enrichment. The graph is rebuilt from the same loaded data the
  // drawer already reads, then queried for the active entity's connective picture.
  const snapshots = useMemo(() => themes.flatMap(t => getThemeHistory(themeKey(t))), [themes]);
  const graph = useIntelligenceGraph({
    enabled: true, themes, stories: clusters, storyThemes: themes,
    episodes, matchedThemes: themes, deals, snapshots,
  });

  const isCompany = ctx.kind === "company";
  const companyReport = useMemo(
    () => (graph.ready && isCompany ? graph.getCompanyReport(ctx.id || ctx.label) : null),
    [graph, isCompany, ctx.id, ctx.label],
  );
  const themeReport = useMemo(
    () => (graph.ready && !isCompany ? graph.getThemeReport(intel.theme?.name ?? ctx.label) : null),
    [graph, isCompany, intel.theme, ctx.label],
  );
  const strongest = (isCompany ? companyReport?.strongestRelationships : themeReport?.strongestRelationships) ?? [];

  const accentColor = ctx.color ?? "#52b0c8";

  // Forward-looking forecast, normalized across theme / company / sector predictions.
  // Renders only when the prediction resolved and is not insufficient_signal.
  const forecast = useMemo<ForecastVM | null>(() => {
    if (!graph.ready) return null;
    if (ctx.kind === "company") {
      const p = predictCompanyTrajectory(ctx.id || ctx.label);
      if (!p.found || p.expectedDirection === "insufficient_signal") return null;
      return { direction: p.expectedDirection, probability: p.probability, confidence: p.confidence, timeframe: null, reasons: p.reasoningSteps.map(s => s.claim).slice(0, 3), invalidation: p.invalidation || null };
    }
    if (ctx.kind === "sector") {
      const p = predictSectorRotation(ctx.label);
      if (!p.found || p.currentRotation === "insufficient_signal") return null;
      const inflow = p.companiesBenefiting.length >= p.companiesAtRisk.length;
      return { direction: inflow ? "rotating in" : "rotating out", probability: null, confidence: p.confidence, timeframe: null, reasons: p.reasoningSteps.map(s => s.claim).slice(0, 3), invalidation: null };
    }
    if (ctx.kind === "theme" || ctx.kind === "driver" || ctx.kind === "narrative") {
      const p = predictThemeTrajectory(intel.theme?.name ?? ctx.label);
      if (!p.found || p.predictedDirection === "insufficient_signal") return null;
      return { direction: p.predictedDirection, probability: p.probability, confidence: p.confidence, timeframe: p.expectedTimeframe, reasons: p.why.slice(0, 3), invalidation: p.invalidationConditions[0] || null };
    }
    return null;
  }, [graph, ctx.kind, ctx.id, ctx.label, intel.theme]);

  const dirColor = (d: string) => /strength|rotating in|accelerat/i.test(d) ? "#34d399" : /weak|revers|rotating out/i.test(d) ? "#f87171" : accentColor;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b shrink-0" style={{ borderColor: A(0.08) }}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor }} />
              <span className="text-[8px] font-bold uppercase tracking-[0.16em]" style={{ color: accentColor }}>{intel.kindLabel}</span>
              <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: A(0.35) }}>Intelligence</span>
            </div>
            <h2 className="text-[17px] font-black leading-tight" style={{ color: A(0.96) }}>{intel.title}</h2>
          </div>
          {intel.conviction !== null && (
            <div className="text-right shrink-0">
              <p className="text-[20px] font-black tabular-nums leading-none" style={{ color: confColor(intel.conviction) }}>{intel.conviction}</p>
              <p className="text-[7px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>Conviction</p>
            </div>
          )}
          <button onClick={onClose} className="shrink-0 p-1 rounded transition-colors hover:bg-white/10" style={{ color: A(0.5) }}><X size={15} /></button>
        </div>
        {/* metrics row */}
        {intel.theme && (
          <div className="flex items-center gap-4 mt-3">
            {intel.momentum && <Metric label="Momentum" value={intel.momentum} />}
            {intel.persistence !== null && <Metric label="Persistence" value={String(intel.persistence)} />}
            {intel.acceleration !== null && <Metric label="Acceleration" value={`${intel.acceleration > 0 ? "+" : ""}${intel.acceleration}`} color={intel.acceleration >= 0 ? "#34d399" : "#f87171"} />}
          </div>
        )}
      </div>

      <div className="overflow-y-auto flex-1 scrollbar-hide">
        <Section label="What it is"><p className="text-[11.5px] leading-relaxed" style={{ color: A(0.82) }}>{intel.what}</p></Section>
        <Section label="Why it matters now"><p className="text-[11.5px] leading-relaxed" style={{ color: A(0.72) }}>{intel.why}</p></Section>

        <Section label="Related pages">
          <div className="flex flex-wrap gap-1.5">
            {intel.relatedPages.map(p => (
              <Link key={p.label} href={p.href} onClick={onClose}
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md transition-colors hover:bg-white/10"
                style={{ color: A(0.8), border: `1px solid ${A(0.12)}`, background: A(0.03) }}>
                {p.label} <span style={{ color: A(0.4) }}>{p.note}</span> <ArrowUpRight size={9} style={{ color: A(0.4) }} />
              </Link>
            ))}
          </div>
        </Section>

        {intel.companies.length > 0 && (
          <Section label="Related companies">
            <div className="flex flex-wrap gap-x-2.5 gap-y-1">{intel.companies.map(c => <TickerChip key={c} ticker={c} size="md" color="#7cc7d8" />)}</div>
          </Section>
        )}
        {intel.sectors.length > 0 && (
          <Section label="Related sectors">
            <div className="flex flex-wrap gap-1.5">{intel.sectors.map(s => <span key={s} className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "rgba(82,176,200,0.12)", color: "rgba(124,199,216,0.9)" }}>{s}</span>)}</div>
          </Section>
        )}

        {intel.stories.length > 0 && (
          <Section label="Related stories">
            <ul className="space-y-1.5">{intel.stories.map(c => (
              <li key={c.id} className="text-[10.5px] leading-snug flex gap-1.5" style={{ color: A(0.66) }}>
                <span className="shrink-0 mt-0.5" style={{ color: accentColor }}>•</span>{c.primary.title}
              </li>
            ))}</ul>
          </Section>
        )}
        {intel.deals.length > 0 && (
          <Section label="Related M&A deals">
            <ul className="space-y-1.5">{intel.deals.map(d => (
              <li key={d.id} className="text-[10.5px] leading-snug flex gap-1.5" style={{ color: A(0.66) }}>
                <span className="shrink-0 mt-0.5" style={{ color: "#a78bfa" }}>•</span>{d.title}
              </li>
            ))}</ul>
          </Section>
        )}
        {intel.listen.length > 0 && (
          <Section label="Related Listen conversations">
            <ul className="space-y-1.5">{intel.listen.map(ep => (
              <li key={ep.id} className="text-[10.5px] leading-snug flex gap-1.5" style={{ color: A(0.66) }}>
                <span className="shrink-0 mt-0.5" style={{ color: "#2563eb" }}>•</span>{ep.title}
              </li>
            ))}</ul>
          </Section>
        )}

        <Section label="Private capital read"><p className="text-[11px] leading-snug" style={{ color: A(0.7) }}>{intel.privateRead}</p></Section>

        <Section label="Recent change">
          {memory.hasHistory
            ? <ul className="space-y-1">{memory.lines.map((l, i) => <li key={i} className="text-[11px] leading-snug flex gap-1.5" style={{ color: A(0.72) }}><span className="shrink-0" style={{ color: "#34d399" }}>+</span>{l}</li>)}</ul>
            : <p className="text-[10.5px] italic" style={{ color: A(0.42) }}>Historical memory begins tracking from today.</p>}
        </Section>

        <div className="grid grid-cols-2 gap-px" style={{ background: A(0.06) }}>
          <div className="px-4 py-3" style={{ background: "#0b0f18" }}>
            <p className="text-[8px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(52,211,153,0.7)" }}>Opportunity</p>
            <p className="text-[10.5px] leading-snug" style={{ color: A(0.66) }}>{intel.opportunity}</p>
          </div>
          <div className="px-4 py-3" style={{ background: "#0b0f18" }}>
            <p className="text-[8px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(248,113,113,0.75)" }}>Risk</p>
            <p className="text-[10.5px] leading-snug" style={{ color: A(0.66) }}>{intel.risk}</p>
          </div>
        </div>

        <Section label="Next thing to watch"><p className="text-[11px] leading-snug" style={{ color: A(0.72) }}>Watch {intel.nextWatch}.</p></Section>

        {/* Forecast. Forward-looking, probabilistic, graph-derived. Renders only when
            the prediction resolved (never on insufficient_signal). No price targets. */}
        {forecast && (
          <Section label="Forecast">
            <div className="flex items-center gap-4 mb-2">
              <span className="text-[12.5px] font-black capitalize leading-none" style={{ color: dirColor(forecast.direction) }}>{forecast.direction}</span>
              {forecast.probability !== null && (
                <span className="flex items-baseline gap-1"><span className="text-[13px] font-black tabular-nums leading-none" style={{ color: A(0.9) }}>{forecast.probability}%</span><span className="text-[7px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>probability</span></span>
              )}
              <span className="flex items-baseline gap-1"><span className="text-[13px] font-black tabular-nums leading-none" style={{ color: A(0.9) }}>{forecast.confidence}</span><span className="text-[7px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>confidence</span></span>
            </div>
            {forecast.timeframe && <p className="text-[10px] mb-1.5" style={{ color: A(0.55) }}>Expected timeframe: {forecast.timeframe}.</p>}
            <ul className="space-y-1 mb-1.5">
              {forecast.reasons.map((r, i) => (
                <li key={i} className="text-[10.5px] leading-snug flex gap-1.5" style={{ color: A(0.7) }}>
                  <span className="shrink-0 mt-0.5" style={{ color: accentColor }}>›</span>{r}
                </li>
              ))}
            </ul>
            {forecast.invalidation && <p className="text-[10px] leading-snug mb-1.5" style={{ color: A(0.55) }}>Invalidated if: {forecast.invalidation}</p>}
            <p className="text-[9px] italic leading-snug" style={{ color: A(0.38) }}>Probabilistic estimate derived from current signals, not a certainty and not investment advice.</p>
          </Section>
        )}

        {/* Graph-backed enrichment. Renders only when the graph resolved the entity
            and has something to add, so nothing shows blank. */}
        {isCompany && companyReport?.found && companyReport.relatedThemes.length > 0 && (
          <Section label="Connected themes (graph)">
            <div className="flex flex-wrap gap-1.5">
              {companyReport.relatedThemes.map(t => (
                <span key={t.id} className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "rgba(82,176,200,0.12)", color: "rgba(124,199,216,0.9)" }}>{t.label}</span>
              ))}
            </div>
          </Section>
        )}
        {isCompany && companyReport?.found && companyReport.maRelationships.length > 0 && (
          <Section label="M&A links (graph)"><RelList rels={companyReport.maRelationships} accent="#a78bfa" /></Section>
        )}
        {isCompany && companyReport?.found && companyReport.privateMarketRelationships.length > 0 && (
          <Section label="Private market links (graph)"><RelList rels={companyReport.privateMarketRelationships} accent="#34d399" /></Section>
        )}
        {strongest.length > 0 && (
          <Section label="Strongest connections (graph)"><RelList rels={strongest} accent={accentColor} /></Section>
        )}

        {process.env.NODE_ENV !== "production" && graph.ready && (
          <div className="px-4 py-2 border-t" style={{ borderColor: A(0.06) }}>
            <p className="text-[8px] font-bold uppercase tracking-[0.14em]" style={{ color: A(0.3) }}>
              Graph: {graph.integrity.ok ? "healthy" : "issues"} · {graph.summary.totalNodes} nodes · {graph.summary.totalRelationships} relationships
            </p>
          </div>
        )}
        <div className="h-6" />
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[13px] font-black tabular-nums capitalize leading-none" style={{ color: color ?? A(0.85) }}>{value}</p>
      <p className="text-[7px] font-bold uppercase tracking-wider mt-0.5" style={{ color: A(0.36) }}>{label}</p>
    </div>
  );
}

export function IntelligenceDrawer({ ctx, open, onClose }: { ctx: IntelContext | null; open: boolean; onClose: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && ctx && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={onClose} className="fixed inset-0 z-[998]" style={{ background: "rgba(0,0,0,0.5)" }} />
          <motion.aside initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }} transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="fixed top-0 right-0 bottom-0 z-[999] w-[380px] max-w-[92vw]"
            style={{ background: "#080c14", borderLeft: "1px solid rgba(255,255,255,0.1)", boxShadow: "-20px 0 60px rgba(0,0,0,0.5)" }}>
            <DrawerBody ctx={ctx} onClose={onClose} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
