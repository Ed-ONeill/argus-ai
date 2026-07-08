"use client";

/**
 * /explore/[entity] - Intelligence Explorer v1 (deep-research workspace).
 *
 * The Intelligence Drawer stays the quick-read surface; this page is the deep
 * surface: a full-screen, three-column institutional workspace around any entity
 * in the Intelligence Graph. It creates no new engines: it is the first
 * production consumer of the canonical Intelligence Profile (System 1,
 * lib/intelligenceProfile.ts via useIntelligenceProfile), reading profile
 * sections first and keeping the pre-profile derivations (crossIntel,
 * useIntelligenceGraph, drawerEntity routing, evidence / prediction / memory
 * engines through lib/intelligenceShared) as fallbacks whenever a section is
 * unavailable. Sections with no real data are hidden, never faked.
 * Dark, dense, Bloomberg / Palantir inspired. No em/en dashes.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, CandlestickChart, Network } from "lucide-react";
import { useFeed } from "@/hooks/useFeed";
import { useMAIntelligence } from "@/hooks/useMAIntelligence";
import { useListenRails } from "@/hooks/useListen";
import { buildCrossIntel } from "@/lib/crossIntel";
import { createDailyThemeSnapshots, getThemeHistory, themeKey } from "@/lib/themeSnapshots";
import { useIntelligenceGraph } from "@/hooks/useIntelligenceGraph";
import { useIntelligenceProfile, profileKindOfIntelKind } from "@/hooks/useIntelligenceProfile";
import { evaluateEvidenceForNode } from "@/lib/evidenceEngine";
import { resolveDrawerEntity, type DrawerEntity } from "@/lib/drawerEntity";
import {
  parseExplorerEntity, explorerHrefForNode, buildForecast, buildTimeline, buildRelationshipMap,
  buildMarketStructure, buildPriceSeries, buildConvictionHistory, buildThemeExposure,
  collectCurrentThemes, recordDailyMemorySnapshot, expandMap, countExpansion, EXPANSION_MODES,
  dirColor, verdictColor, evColor, fmtDate, fmtDay,
  EMPTY_TIMELINE, EMPTY_MAP, EMPTY_SERIES,
  type ForecastVM, type TimelineVM, type MapVM, type MarketStructureVM, type PriceSeriesVM,
  type ConvictionPoint, type ThemeExposureItem, type ExpansionMode,
} from "@/lib/intelligenceShared";
import { confColor, cleanThemeName } from "@/app/markets/marketsShared";
import type { IntelContext } from "@/lib/intelligenceContext";
import { ExplorerGraph } from "@/components/explore/ExplorerGraph";
import { MarketView } from "@/components/explore/MarketView";
import { useExplorerMarketData } from "@/hooks/useExplorerMarketData";

const A = (n: number) => `rgba(255,255,255,${n})`;

// Large-canvas selection limits for the shared map builder (the network component
// computes its own layered layout from the nodes and edges).
const EXPLORER_LAYOUT = { width: 1000, height: 720, r1: 230, r2: 340, maxFirst: 16, secondStrength: 55, maxSecond: 14, nodeScale: 2 };
const EXPANDED_LAYOUT = { ...EXPLORER_LAYOUT, maxFirst: 30, maxSecond: 26 };

const KIND_LABEL: Record<string, string> = {
  theme: "Theme", company: "Company", etf: "ETF", sector: "Sector", driver: "Macro Driver", deal: "M&A Deal", narrative: "Narrative",
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3.5 border-t" style={{ borderColor: A(0.06) }}>
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: A(0.34) }}>{label}</p>
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[13px] font-black tabular-nums leading-none" style={{ color: accent ? "#7cc7d8" : A(0.9) }}>{value}</p>
      <p className="text-[7.5px] font-bold uppercase tracking-wider mt-1" style={{ color: A(0.4) }}>{label}</p>
    </div>
  );
}

function ExplorerWorkspace({ ctx }: { ctx: IntelContext }) {
  const router = useRouter();
  const { data } = useFeed();
  const { deals } = useMAIntelligence();
  const { allEpisodes } = useListenRails();

  const themes   = useMemo(() => data?.theme_intelligence ?? [], [data?.theme_intelligence]);
  const clusters = useMemo(() => data?.clusters ?? [], [data?.clusters]);
  const episodes = useMemo(() => allEpisodes ?? [], [allEpisodes]);

  const intel = useMemo(
    () => buildCrossIntel(ctx, { themes, clusters, deals, episodes }),
    [ctx, themes, clusters, deals, episodes],
  );

  // Accrue daily memory whenever themes are available (idempotent per day),
  // exactly as the drawer does, so both surfaces build the same history.
  useEffect(() => {
    if (themes.length === 0) return;
    const dealCountBySector: Record<string, number> = {};
    for (const d of deals) dealCountBySector[d.sector] = (dealCountBySector[d.sector] ?? 0) + 1;
    createDailyThemeSnapshots(themes, { dealCountBySector });
  }, [themes, deals]);

  // Same graph build as the drawer: rebuilt from the loaded app data, then queried.
  const snapshots = useMemo(() => themes.flatMap(t => getThemeHistory(themeKey(t))), [themes]);
  const graph = useIntelligenceGraph({
    enabled: true, themes, stories: clusters, storyThemes: themes,
    episodes, matchedThemes: themes, deals, snapshots,
  });

  const isSymbol = ctx.kind === "company" || ctx.kind === "etf";

  // Live market pipeline: fetch server-normalized FMP observations for the focused
  // symbol and ingest them into the graph this page reads. market.version bumps
  // after each ingest so graph-reading memos below re-resolve.
  const market = useExplorerMarketData({ enabled: isSymbol, ticker: ctx.id, isEtf: ctx.kind === "etf" });

  const entity = useMemo<DrawerEntity>(
    () => resolveDrawerEntity(ctx, { themeName: intel.theme?.name ?? null, relatedCompanies: intel.companies }),
    // graph.ready re-resolves once the graph singleton is built; market.version
    // re-resolves once ingested market data lands on the ticker node
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph.ready, market.version, ctx, intel.theme, intel.companies],
  );

  const companyReport = useMemo(
    () => (graph.ready && isSymbol ? graph.getCompanyReport(entity.graphKey) : null),
    [graph, isSymbol, entity.graphKey],
  );
  const themeReport = useMemo(
    () => (graph.ready && !isSymbol ? graph.getThemeReport(entity.graphKey) : null),
    [graph, isSymbol, entity.graphKey],
  );
  const strongest = (isSymbol ? companyReport?.strongestRelationships : themeReport?.strongestRelationships) ?? [];

  // Memory Engine accrual (read-only; one snapshot accrued per day per session).
  const [memVersion, setMemVersion] = useState(0);
  useEffect(() => {
    if (!graph.ready) return;
    if (recordDailyMemorySnapshot()) setMemVersion(v => v + 1);
  }, [graph.ready]);

  // System 1: the canonical Intelligence Profile. Explorer is its first
  // production consumer: one assembly over the same graph and engines the
  // legacy memos read, re-run on the graph's invalidation ticks. The page
  // injects its crossIntel narrative (the assembler never fetches page data).
  // Every consumer below branches on section status and falls back to the
  // pre-profile derivation, so the rendered output is unchanged.
  const profile = useIntelligenceProfile(
    entity.graphKey,
    { kindHint: profileKindOfIntelKind(ctx.kind), narrative: { headline: intel.what || null, nextWatch: intel.nextWatch || null } },
    [graph.ready, market.version, memVersion],
  );

  const currentThemes = useMemo<string[]>(() => {
    if (!isSymbol) return [];
    // Theme exposure: the profile's upstream theme links first; the graph report
    // keeps contributing labels the trimmed profile selection may not carry.
    const profileThemes = (profile.drivers.data ?? [])
      .filter(l => l.nodeType === "Theme" || l.nodeType === "Narrative")
      .map(l => l.label);
    return collectCurrentThemes(intel.theme?.name, [...profileThemes, ...(companyReport?.relatedThemes ?? []).map(t => t.label)]);
  }, [isSymbol, intel.theme, profile.drivers.data, companyReport]);

  // Evidence read (profile section first, direct engine read as fallback);
  // hidden on thin signal and symbols-only, exactly like before.
  const evidence = useMemo(() => {
    if (!isSymbol) return null;
    if (profile.evidence.status === "live" && profile.evidence.data) {
      const d = profile.evidence.data;
      return { overallTrust: d.overallTrust, verdict: d.verdict, supporting: d.supporting, contradictions: profile.risks.data?.contradictions ?? [] };
    }
    if (!graph.ready) return null;
    const ev = evaluateEvidenceForNode(entity.graphKey);
    if (!ev.found || ev.verdict === "insufficient_signal") return null;
    return {
      overallTrust: ev.overallTrust, verdict: ev.verdict,
      supporting: [...ev.supportingEvidence].sort((a, b) => (b.strength - a.strength) || (b.confidence - a.confidence)).slice(0, 8),
      contradictions: ev.contradictions,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.ready, isSymbol, entity.graphKey, profile.evidence, profile.risks.data]);

  // Forward view: the profile's thesis section first (the same prediction
  // engine reads, assembled centrally), the legacy normalizer as fallback.
  const forecast = useMemo<ForecastVM | null>(() => {
    const f = profile.thesis.data?.forward;
    if (f) {
      return {
        direction: f.direction, probability: f.probability, confidence: f.confidence,
        timeframe: f.timeframe, reasons: f.reasons,
        invalidation: profile.risks.data?.invalidation ?? null,
      };
    }
    return graph.ready ? buildForecast(ctx.kind, ctx.label, entity.graphKey) : null;
  }, [profile.thesis.data, profile.risks.data, graph, ctx.kind, ctx.label, entity.graphKey]);

  // Watch next: the profile carries the injected crossIntel watch item verbatim
  // (derived falsifiers arrive prefixed); fall back to the direct read.
  const nextWatch = useMemo(() => {
    const injected = (profile.watch.data?.items ?? []).find(i => !i.startsWith("Invalidation: ") && !i.startsWith("Weakening link: "));
    return injected ?? intel.nextWatch;
  }, [profile.watch.data, intel.nextWatch]);
  const timeline = useMemo<TimelineVM>(() => {
    if (!graph.ready) return EMPTY_TIMELINE;
    return buildTimeline(entity.graphKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.ready, memVersion, entity.graphKey]);

  // The large network map: same builder as the drawer, explorer-sized, with the
  // causal-chain selection so Driver -> Theme -> Sector -> Company -> Evidence
  // paths surface. Expansion progressively reveals EXISTING graph relationships:
  // either by analyst intent (expandMap modes) or by raising the neighbor caps.
  const [mapExpanded, setMapExpanded] = useState(false);
  const [expansionModes, setExpansionModes] = useState<ExpansionMode[]>([]);
  const baseMap = useMemo<MapVM>(() => {
    if (!graph.ready && market.version === 0) return EMPTY_MAP;
    return buildRelationshipMap(entity.graphKey, { ...(mapExpanded ? EXPANDED_LAYOUT : EXPLORER_LAYOUT), causalChains: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.ready, market.version, entity.graphKey, mapExpanded]);
  const map = useMemo<MapVM>(
    () => expansionModes.reduce((m, mode) => expandMap(m, mode), baseMap),
    [baseMap, expansionModes],
  );
  const expansionOptions = useMemo(
    () => (map.available ? EXPANSION_MODES.map(m => ({ ...m, count: countExpansion(map, m.key) })) : []),
    [map],
  );
  const canExpandCount = useMemo(() => {
    if (mapExpanded || !map.available) return 0;
    const center = map.nodes.find(n => n.degree === 0);
    if (!center) return 0;
    return Math.max(0, center.relCount - map.nodes.filter(n => n.degree === 1).length);
  }, [map, mapExpanded]);

  // Market terminal data (symbols only): the latest snapshot on the routed node and
  // whatever OHLCV bars the pipeline has recorded. Reads work as soon as the market
  // ingest lands, even before the feed-driven graph build finishes.
  const marketStructure = useMemo<MarketStructureVM | null>(() => {
    if (!isSymbol) return null;
    const lmd = entity.node?.metadata?.latestMarketData;
    return lmd && typeof lmd === "object" ? buildMarketStructure(lmd as Record<string, unknown>) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.ready, market.version, isSymbol, entity]);
  const priceSeries = useMemo<PriceSeriesVM>(() => {
    if (!isSymbol) return EMPTY_SERIES;
    return buildPriceSeries(entity.graphKey, "daily");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.ready, market.version, isSymbol, entity.graphKey]);
  const intradaySeries = useMemo<PriceSeriesVM>(() => {
    if (!isSymbol) return EMPTY_SERIES;
    return buildPriceSeries(entity.graphKey, "intraday");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.ready, market.version, isSymbol, entity.graphKey]);

  // Workstation sub-panel data: real Memory Engine history and graph edge strengths
  // when they exist; the panels themselves fall back to badged sample scaffolding.
  const convictionHistory = useMemo<ConvictionPoint[]>(() => {
    if (!graph.ready || !isSymbol) return [];
    return buildConvictionHistory(entity.graphKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.ready, isSymbol, memVersion, entity.graphKey]);
  const themeExposure = useMemo<ThemeExposureItem[]>(() => {
    if (!graph.ready || !isSymbol) return [];
    return buildThemeExposure(entity.graphKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.ready, isSymbol, entity.graphKey]);

  // Center workspace tabs: companies and ETFs open on the market terminal;
  // theme-shaped entities only have the network view.
  const [tab, setTab] = useState<"market" | "network">(isSymbol ? "market" : "network");

  const accent = ctx.color ?? "#52b0c8";
  const parentTheme = isSymbol ? (entity.subtitle ?? intel.theme?.name ?? null) : null;
  const dCol = (d: string) => dirColor(d, accent);
  const chipHref = (type: string, label: string) => explorerHrefForNode({ type, label }, accent);

  // Evolution summary and analogs: profile evolution section first, timeline
  // fallback (same memory engine underneath; labels and similarity match).
  const evolutionLines = profile.evolution.data?.lines.length ? profile.evolution.data.lines : timeline.evolution;
  const analogs = profile.evolution.data?.analogs.length ? profile.evolution.data.analogs : timeline.analogs;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden" style={{ background: "#05080f" }}>
      {/* Left column: the entity read */}
      <aside className="w-[320px] shrink-0 border-r overflow-y-auto scrollbar-hide" style={{ borderColor: A(0.08), background: "#070b13" }}>
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
            <span className="text-[8.5px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>{KIND_LABEL[ctx.kind] ?? ctx.kind}</span>
            <span className="text-[8.5px] font-bold uppercase tracking-wide" style={{ color: A(0.35) }}>Intelligence Explorer</span>
          </div>
          <h1 className={`${isSymbol ? "text-[30px] tracking-tight" : "text-[22px]"} font-black leading-none`} style={{ color: A(0.97) }}>
            {isSymbol ? entity.title : intel.title}
          </h1>
          {parentTheme && (
            <p className="text-[10.5px] font-semibold mt-1.5" style={{ color: A(0.48) }}>
              Exposed to <span style={{ color: A(0.7) }}>{cleanThemeName(parentTheme)}</span>
            </p>
          )}
          {(evidence || intel.conviction !== null) && (
            <div className="flex items-end gap-6 mt-4">
              {evidence && (
                <div>
                  <p className="text-[30px] font-black tabular-nums leading-none tracking-tight" style={{ color: confColor(evidence.overallTrust) }}>{evidence.overallTrust}</p>
                  <p className="text-[7.5px] font-bold uppercase tracking-[0.2em] mt-1" style={{ color: A(0.42) }}>Signal</p>
                </div>
              )}
              {evidence && (
                <div>
                  <p className="text-[13px] font-black capitalize leading-none" style={{ color: verdictColor(evidence.verdict) }}>{evidence.verdict.replace(/_/g, " ")}</p>
                  <p className="text-[7.5px] font-bold uppercase tracking-wider mt-1" style={{ color: A(0.42) }}>Evidence</p>
                </div>
              )}
              {intel.conviction !== null && (
                <div>
                  <p className="text-[22px] font-black tabular-nums leading-none" style={{ color: confColor(intel.conviction) }}>{intel.conviction}</p>
                  <p className="text-[7.5px] font-bold uppercase tracking-wider mt-1" style={{ color: A(0.42) }}>Conviction</p>
                </div>
              )}
            </div>
          )}
        </div>

        <Section label="Current Thesis">
          <p className="text-[13px] font-medium leading-relaxed" style={{ color: A(0.9) }}>{profile.thesis.data?.headline ?? intel.what}</p>
          {intel.why && <p className="text-[11px] leading-relaxed mt-1.5" style={{ color: A(0.58) }}>{intel.why}</p>}
        </Section>

        {forecast && (
          <Section label="Forward View">
            <div className="flex items-center gap-4 mb-2">
              <span className="text-[16px] font-black capitalize leading-none tracking-tight" style={{ color: dCol(forecast.direction) }}>{forecast.direction}</span>
              {forecast.probability !== null && (
                <span className="flex items-baseline gap-1"><span className="text-[14px] font-black tabular-nums leading-none" style={{ color: A(0.9) }}>{forecast.probability}%</span><span className="text-[7.5px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>probability</span></span>
              )}
              <span className="flex items-baseline gap-1"><span className="text-[14px] font-black tabular-nums leading-none" style={{ color: A(0.9) }}>{forecast.confidence}</span><span className="text-[7.5px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>confidence</span></span>
            </div>
            {forecast.probability !== null && (
              <div className="h-[3px] rounded-full mb-2 overflow-hidden" style={{ background: A(0.08) }}>
                <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${forecast.probability}%` }}
                  transition={{ duration: 0.7, ease: "easeOut" }} style={{ background: dCol(forecast.direction) }} />
              </div>
            )}
            {forecast.timeframe && <p className="text-[10.5px] mb-2" style={{ color: A(0.55) }}>Expected timeframe: {forecast.timeframe}.</p>}
            <ul className="space-y-1.5">
              {forecast.reasons.map((r, i) => (
                <li key={i} className="text-[11px] leading-snug flex gap-1.5" style={{ color: A(0.7) }}>
                  <span className="shrink-0 mt-0.5" style={{ color: accent }}>›</span>{r}
                </li>
              ))}
            </ul>
            <p className="text-[9px] italic leading-snug mt-2" style={{ color: A(0.38) }}>Probabilistic estimate derived from current signals, not a certainty and not investment advice.</p>
          </Section>
        )}

        {(currentThemes.length > 0 || intel.drivers.length > 0 || intel.sectors.length > 0) && (
          <Section label="Drivers & Themes">
            <div className="flex flex-wrap gap-1.5">
              {currentThemes.map(t => {
                const href = chipHref("Theme", t);
                return (
                  <button key={t} onClick={() => href && router.push(href)}
                    className="text-[9.5px] font-bold uppercase tracking-wide px-2 py-1 rounded-sm transition-colors hover:bg-white/10"
                    style={{ color: "rgba(124,199,216,0.92)", background: "rgba(82,176,200,0.10)", border: "1px solid rgba(82,176,200,0.3)" }}>
                    {t}
                  </button>
                );
              })}
              {intel.drivers.slice(0, 3).map(d => {
                const href = chipHref("Macro", d);
                return (
                  <button key={d} onClick={() => href && router.push(href)}
                    className="text-[9.5px] font-bold uppercase tracking-wide px-2 py-1 rounded-sm transition-colors hover:bg-white/10"
                    style={{ color: A(0.72), background: A(0.04), border: `1px solid ${A(0.16)}` }}>
                    {d}
                  </button>
                );
              })}
              {intel.sectors.slice(0, 3).map(s => {
                const href = chipHref("Sector", s);
                return (
                  <button key={s} onClick={() => href && router.push(href)}
                    className="text-[9.5px] font-bold uppercase tracking-wide px-2 py-1 rounded-sm transition-colors hover:bg-white/10"
                    style={{ color: A(0.6), background: "transparent", border: `1px dashed ${A(0.18)}` }}>
                    {s}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        <div className="border-t" style={{ borderColor: A(0.06) }}>
          <div className="grid grid-cols-2 gap-px" style={{ background: A(0.06) }}>
            <div className="px-5 py-3" style={{ background: "#0b0f18" }}>
              <p className="text-[8.5px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(52,211,153,0.7)" }}>Opportunity</p>
              <p className="text-[11px] leading-snug" style={{ color: A(0.66) }}>{intel.opportunity}</p>
            </div>
            <div className="px-5 py-3" style={{ background: "#0b0f18" }}>
              <p className="text-[8.5px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(248,113,113,0.75)" }}>Risk</p>
              <p className="text-[11px] leading-snug" style={{ color: A(0.66) }}>{intel.risk}</p>
            </div>
          </div>
          {forecast?.invalidation && (
            <div className="px-5 py-2.5 border-t" style={{ borderColor: A(0.06), background: "#0b0f18" }}>
              <p className="text-[8.5px] font-bold uppercase tracking-[0.14em] mb-0.5" style={{ color: "rgba(245,158,11,0.7)" }}>Invalidation</p>
              <p className="text-[11px] leading-snug" style={{ color: A(0.66) }}>{forecast.invalidation}</p>
            </div>
          )}
        </div>

        <Section label="Next Thing to Watch">
          <p className="text-[11.5px] leading-snug" style={{ color: A(0.72) }}>Watch {nextWatch}.</p>
        </Section>
        <div className="h-6" />
      </aside>

      {/* Center column: the tabbed workspace. Market View is the terminal default
          for symbols; the Intelligence Network is the relationship view. */}
      <section className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-1.5 px-5 py-2.5 border-b shrink-0" style={{ borderColor: A(0.08) }}>
          {isSymbol && (
            <button onClick={() => setTab("market")}
              className="flex items-center gap-1.5 text-[9.5px] font-black uppercase tracking-[0.14em] px-3 py-1.5 rounded-md transition-colors"
              style={tab === "market"
                ? { color: "#7cc7d8", background: "rgba(82,176,200,0.14)", border: "1px solid rgba(82,176,200,0.3)" }
                : { color: A(0.45), background: "transparent", border: `1px solid ${A(0.08)}` }}>
              <CandlestickChart size={12} /> Market View
            </button>
          )}
          <button onClick={() => setTab("network")}
            className="flex items-center gap-1.5 text-[9.5px] font-black uppercase tracking-[0.14em] px-3 py-1.5 rounded-md transition-colors"
            style={tab === "network" || !isSymbol
              ? { color: "#7cc7d8", background: "rgba(82,176,200,0.14)", border: "1px solid rgba(82,176,200,0.3)" }
              : { color: A(0.45), background: "transparent", border: `1px solid ${A(0.08)}` }}>
            <Network size={12} /> Intelligence Network
          </button>
          {tab === "network" && map.available && (
            <span className="ml-2 text-[9px] tabular-nums" style={{ color: A(0.35) }}>
              {map.nodes.length} entities · {map.edges.length} connections
            </span>
          )}
          {graph.ready && (
            <span className="ml-auto text-[8.5px] font-bold uppercase tracking-[0.14em] tabular-nums" style={{ color: A(0.28) }}>
              Graph {graph.summary.totalNodes} nodes · {graph.summary.totalRelationships} relationships
            </span>
          )}
        </div>

        {tab === "market" && isSymbol ? (
          !graph.ready && market.version === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[12px]" style={{ color: A(0.45) }}>Loading market intelligence…</p>
            </div>
          ) : (
            <MarketView structure={marketStructure} series={priceSeries} intraday={intradaySeries}
              intradayStatus={market.intradayStatus} ticker={entity.title}
              accent={accent} timeline={timeline} conviction={convictionHistory}
              themeExposure={themeExposure} fallbackThemes={currentThemes} />
          )
        ) : map.available ? (
          <ExplorerGraph map={map} accent={accent} onNavigate={href => router.push(href)}
            onExpand={() => setMapExpanded(true)} canExpandCount={canExpandCount}
            expansionOptions={expansionOptions} appliedExpansions={expansionModes}
            onExpandMode={mode => setExpansionModes(prev => (prev.includes(mode) ? prev : [...prev, mode]))}
            onResetExpansions={() => { setExpansionModes([]); setMapExpanded(false); }} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            {!graph.ready ? (
              <p className="text-[12px]" style={{ color: A(0.45) }}>Assembling the intelligence network…</p>
            ) : (
              <>
                <p className="text-[13px] font-semibold" style={{ color: A(0.6) }}>No connected intelligence yet</p>
                <p className="text-[11px] leading-snug max-w-[340px] mt-1.5" style={{ color: A(0.38) }}>
                  Argus has not identified graph relationships for this entity. The network renders as connections are discovered.
                </p>
                {strongest.length > 0 && (
                  <ul className="mt-4 space-y-1.5 w-full max-w-[420px]">
                    {strongest.slice(0, 4).map((r, i) => (
                      <li key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="shrink-0 font-semibold" style={{ color: A(0.88) }}>{r.source}</span>
                        <span className="h-px flex-1" style={{ background: A(0.14) }} />
                        <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider" style={{ color: accent }}>{r.type.replace(/_/g, " ")}</span>
                        <span className="h-px flex-1" style={{ background: A(0.14) }} />
                        <span className="shrink-0 font-semibold" style={{ color: A(0.88) }}>{r.target}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {/* Right column: evidence, memory, discovery */}
      <aside className="w-[360px] shrink-0 border-l overflow-y-auto scrollbar-hide" style={{ borderColor: A(0.08), background: "#070b13" }}>
        {evidence && evidence.supporting.length > 0 && (
          <Section label="Evidence Stack">
            <ul className="space-y-1.5">
              {evidence.supporting.map((ev, i) => (
                <li key={i} className="text-[11px] leading-snug flex items-center gap-1.5" style={{ color: A(0.7) }}>
                  <span className="truncate" style={{ color: A(0.9) }}>{ev.from}</span>
                  <span className="shrink-0 px-1 py-px rounded-sm text-[8.5px] font-semibold uppercase tracking-wide" style={{ color: accent, background: `${accent}1f` }}>{ev.relationship.replace(/_/g, " ")}</span>
                  {ev.pages.length > 0 && <span className="shrink-0 text-[8.5px] tabular-nums" style={{ color: A(0.35) }}>{ev.pages.length} src</span>}
                  <span className="ml-auto shrink-0 tabular-nums text-[9.5px] font-bold" style={{ color: A(0.55) }}>{ev.strength}</span>
                </li>
              ))}
            </ul>
            {evidence.contradictions.length > 0 && (
              <p className="text-[10px] leading-snug mt-2" style={{ color: "#f59e0b" }}>
                {evidence.contradictions.length} contradiction{evidence.contradictions.length === 1 ? "" : "s"}: {evidence.contradictions[0].detail}
              </p>
            )}
          </Section>
        )}

        {timeline.available && (
          <Section label="Intelligence Timeline">
            <div className="grid grid-cols-3 gap-y-3 gap-x-3 mb-3.5">
              <Stat label="First Seen" value={fmtDate(timeline.firstSeen!)} />
              <Stat label="Snapshots" value={String(timeline.snapshots)} />
              <Stat label="Streak" value={`${timeline.streak} session${timeline.streak === 1 ? "" : "s"}`} />
              <Stat label="Conviction" value={String(timeline.conviction)} accent />
              <Stat label="Analogs" value={String(timeline.analogsCount)} />
              {timeline.confidenceGained !== undefined && <Stat label="Conf. Gained" value={`${timeline.confidenceGained > 0 ? "+" : ""}${timeline.confidenceGained}`} />}
            </div>
            {timeline.patterns.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {timeline.patterns.map(p => (
                  <span key={p} className="text-[8.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color: accent, background: `${accent}1a` }}>{p.replace(/_/g, " ")}</span>
                ))}
              </div>
            )}
            <ul className="space-y-2.5">
              {timeline.events.map((e, i) => (
                <li key={i} className="flex gap-2">
                  <div className="flex flex-col items-center pt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: evColor(e.type) }} />
                    {i < timeline.events.length - 1 && <span className="w-px flex-1 mt-1" style={{ background: A(0.08) }} />}
                  </div>
                  <div className="min-w-0 flex-1 pb-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold" style={{ color: A(0.9) }}>{e.title}</span>
                      {e.confidence !== undefined && <span className="text-[8.5px] tabular-nums" style={{ color: A(0.4) }}>{e.confidence}</span>}
                      <span className="ml-auto text-[8.5px] tabular-nums shrink-0" style={{ color: A(0.35) }}>{fmtDay(e.date)}</span>
                    </div>
                    <p className="text-[10.5px] leading-snug mt-0.5" style={{ color: A(0.6) }}>{e.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {evolutionLines.length > 0 && (
          <Section label="Evolution">
            <ul className="space-y-1.5">
              {evolutionLines.map((l, i) => (
                <li key={i} className="text-[10.5px] leading-snug flex gap-1.5" style={{ color: A(0.66) }}>
                  <span className="shrink-0 mt-0.5" style={{ color: accent }}>›</span>{l}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {analogs.length > 0 && (
          <Section label="Historical Analogs">
            <ul className="space-y-2">
              {analogs.map((a, i) => (
                <li key={i} className="flex items-center gap-2 text-[11px]" style={{ color: A(0.8) }}>
                  <span className="w-1 h-1 rounded-full shrink-0" style={{ background: accent }} />
                  <span className="truncate">{a.label}</span>
                  <span className="ml-auto tabular-nums text-[9.5px] shrink-0" style={{ color: A(0.45) }}>Similarity {a.similarity}%</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {intel.stories.length > 0 && (
          <Section label="Supporting Stories">
            <ul className="space-y-2">
              {intel.stories.map(c => (
                <li key={c.id} className="text-[11px] leading-snug flex gap-1.5" style={{ color: A(0.66) }}>
                  <span className="shrink-0 mt-0.5" style={{ color: accent }}>•</span>{c.primary.title}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {intel.relatedPages.length > 0 && (
          <Section label="Related Pages">
            <div className="flex flex-wrap gap-1.5">
              {intel.relatedPages.map(p => (
                <Link key={p.label} href={p.href}
                  className="flex items-center gap-1 text-[10.5px] font-semibold px-2 py-1 rounded-md transition-colors hover:bg-white/10"
                  style={{ color: A(0.8), border: `1px solid ${A(0.12)}`, background: A(0.03) }}>
                  {p.label} <span style={{ color: A(0.4) }}>{p.note}</span> <ArrowUpRight size={9} style={{ color: A(0.4) }} />
                </Link>
              ))}
            </div>
          </Section>
        )}
        <div className="h-6" />
      </aside>
    </div>
  );
}

function ExplorerInner() {
  const params = useParams<{ entity: string }>();
  const search = useSearchParams();
  const ctx = useMemo(() => parseExplorerEntity(params.entity ?? "", search), [params.entity, search]);

  if (!ctx) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-3" style={{ background: "#05080f" }}>
        <p className="text-[14px] font-semibold" style={{ color: A(0.7) }}>Unknown entity</p>
        <p className="text-[11px]" style={{ color: A(0.4) }}>Expected /explore/kind:id, e.g. /explore/company:NVDA or /explore/theme:ai-infrastructure.</p>
        <Link href="/feed" className="text-[11px] font-semibold px-3 py-1.5 rounded-md transition-colors hover:bg-white/10"
          style={{ color: "#7cc7d8", border: "1px solid rgba(82,176,200,0.3)" }}>Back to Feed</Link>
      </div>
    );
  }
  // Key on the entity so all workspace state resets when exploring a new node.
  return <ExplorerWorkspace key={`${ctx.kind}:${ctx.id}`} ctx={ctx} />;
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="h-[calc(100vh-3.5rem)]" style={{ background: "#05080f" }} />}>
      <ExplorerInner />
    </Suspense>
  );
}
