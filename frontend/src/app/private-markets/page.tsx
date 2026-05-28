"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Layers, ArrowDown, ExternalLink, Building2, FileText, RefreshCw, AlertCircle, ChevronRight } from "lucide-react";
import { useMarketState } from "@/hooks/useMarketState";
import { useMarketData } from "@/hooks/useMarketData";
import { useMAIntelligence } from "@/hooks/useMAIntelligence";
import { useIPOPipeline, type IPOFiler } from "@/hooks/useIPOPipeline";
import {
  computeCapitalFlow,
  FLOW_STATUS_COLOR,
  FLOW_STATUS_LABEL,
  type CapitalFlowLayer,
  type FlowStatus,
} from "@/lib/capitalFlow";
import { useFeed } from "@/hooks/useFeed";

// ── Capital Flow Transmission ─────────────────────────────────────────────────

function FlowStatusBadge({ status }: { status: FlowStatus }) {
  const color = FLOW_STATUS_COLOR[status];
  const label = FLOW_STATUS_LABEL[status];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide"
      style={{ color, background: `${color}14`, border: `1px solid ${color}28` }}>
      {label}
    </span>
  );
}

function FlowConnector({ status }: { status: FlowStatus }) {
  const color = FLOW_STATUS_COLOR[status];
  const flowing = status === "accelerating" || status === "expanding";
  return (
    <div className="flex flex-col items-center py-0.5">
      <div className="w-px h-4 relative overflow-hidden" style={{ background: `${color}22` }}>
        {flowing && (
          <motion.div
            className="absolute inset-x-0 h-2"
            style={{ background: `linear-gradient(to bottom, transparent, ${color}, transparent)` }}
            animate={{ y: [-8, 16] }}
            transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
          />
        )}
      </div>
      <ArrowDown size={10} style={{ color: `${color}60` }} />
    </div>
  );
}

function FlowLayerCard({ layer, index }: { layer: CapitalFlowLayer; index: number }) {
  const color   = FLOW_STATUS_COLOR[layer.status];
  const isOpen  = layer.status === "accelerating" || layer.status === "expanding";
  const isClosed = layer.status === "contracting" || layer.status === "blocked";

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      className="relative rounded-xl border p-4"
      style={{
        background:   isOpen  ? `${color}08` : isClosed ? "rgba(248,113,113,0.04)" : "rgba(255,255,255,0.025)",
        borderColor:  isOpen  ? `${color}22` : isClosed ? "rgba(248,113,113,0.14)" : "rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.82)" }}>
              {layer.label}
            </span>
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>
              {layer.sublabel}
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.44)" }}>
            {layer.detail}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <FlowStatusBadge status={layer.status} />
          <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.32)" }}>
            {layer.indicator}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ── IPO Pipeline ──────────────────────────────────────────────────────────────

function IPOFilerRow({ filer, index }: { filer: IPOFiler; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      className="flex items-center gap-3 py-2.5 border-b"
      style={{ borderColor: "rgba(255,255,255,0.05)" }}
    >
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <FileText size={12} style={{ color: "rgba(255,255,255,0.36)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: "rgba(255,255,255,0.78)" }}>
          {filer.companyName}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {filer.sector && (
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.32)" }}>
              {filer.sector}
            </span>
          )}
          {filer.stateOfIncorp && (
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.22)" }}>
              {filer.stateOfIncorp}
            </span>
          )}
          {filer.sicDescription && !filer.sector && (
            <span className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.28)" }}>
              {filer.sicDescription}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>
          {filer.filingDate}
        </p>
        <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.20)" }}>
          CIK {filer.cik}
        </p>
      </div>
    </motion.div>
  );
}

// ── Sponsor deals section ─────────────────────────────────────────────────────

function SponsorDealRow({ deal, index }: { deal: { title: string; peFirm: string | null; sector: string; url: string; published: string }; index: number }) {
  return (
    <motion.a
      href={deal.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.22 }}
      className="group flex items-start gap-3 py-2.5 border-b hover:bg-white/[0.02] transition-colors rounded"
      style={{ borderColor: "rgba(255,255,255,0.05)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium leading-snug group-hover:text-white/90 transition-colors"
          style={{ color: "rgba(255,255,255,0.72)" }}>
          {deal.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {deal.peFirm && (
            <span className="text-[10px] flex items-center gap-1" style={{ color: "#c4b5fd" }}>
              <Building2 size={9} />
              {deal.peFirm}
            </span>
          )}
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>{deal.sector}</span>
        </div>
      </div>
      <ExternalLink size={11} className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-30 transition-opacity" style={{ color: "rgba(255,255,255,0.5)" }} />
    </motion.a>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PrivateMarketsPage() {
  const { riskRegime, volRegime } = useMarketState();
  const { data: marketData }      = useMarketData();
  const { data: feedData }        = useFeed();
  const { deals, totalDealCount, isLoading: maLoading } = useMAIntelligence();
  const { filers, isLoading: ipoLoading, isError: ipoError, refetch: ipoRefetch } = useIPOPipeline();

  const tnxRate = useMemo(() => {
    const tnx = marketData?.["TNX"];
    return tnx?.price ?? null;
  }, [marketData]);

  const regime = feedData?.sector_data?.derived_regime ?? null;

  const sponsorDeals = useMemo(() =>
    deals.filter(d => d.dealType === "sponsor" || d.dealType === "strategic").slice(0, 10),
    [deals],
  );

  const vcDealCount = useMemo(() =>
    deals.filter(d => d.dealType === "sponsor").length,
    [deals],
  );

  const capitalFlow = useMemo(() => computeCapitalFlow({
    riskRegime,
    volRegime,
    regime,
    tnxRate,
    maDealCount:   totalDealCount,
    vcDealCount,
    ipoFilerCount: filers.length,
  }), [riskRegime, volRegime, regime, tnxRate, totalDealCount, vcDealCount, filers.length]);

  const openLayers   = capitalFlow.layers.filter(l => l.status === "accelerating" || l.status === "expanding").length;
  const closedLayers = capitalFlow.layers.filter(l => l.status === "contracting"  || l.status === "blocked").length;

  return (
    <div className="min-h-screen pb-24" style={{ background: "#050812" }}>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(82,176,200,0.12)", border: "1px solid rgba(82,176,200,0.18)" }}>
              <Layers size={15} style={{ color: "#52b0c8" }} />
            </div>
            <span className="text-xs font-semibold tracking-widest uppercase mt-2"
              style={{ color: "rgba(255,255,255,0.32)", letterSpacing: "0.12em" }}>
              Private Markets
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2" style={{ color: "rgba(255,255,255,0.92)" }}>
            Capital Flow Intelligence
          </h1>
          <p className="text-sm max-w-2xl" style={{ color: "rgba(255,255,255,0.42)" }}>
            {capitalFlow.summary}
          </p>

          {/* Regime summary chips */}
          <div className="flex items-center gap-2 mt-5 flex-wrap">
            <span className="text-[10px] px-2.5 py-1 rounded-full border font-medium"
              style={{
                borderColor: openLayers >= 4 ? "#22c55e33" : closedLayers >= 4 ? "#ef444433" : "#fbbf2433",
                color:       openLayers >= 4 ? "#22c55e"   : closedLayers >= 4 ? "#ef4444"   : "#fbbf24",
                background:  openLayers >= 4 ? "#22c55e0f" : closedLayers >= 4 ? "#ef44440f" : "#fbbf240f",
              }}>
              {openLayers >= 4 ? "Capital Flowing" : closedLayers >= 4 ? "Capital Constrained" : "Mixed Transmission"}
            </span>
            <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.36)" }}>
              {openLayers} of 8 layers open
            </span>
            {regime && (
              <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.36)" }}>
                {regime}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* ── Capital Flow Chain — main column ─────────────────────── */}
          <div className="lg:col-span-3">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#52b0c8" }} />
              <h2 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.72)" }}>
                Capital Flow Transmission
              </h2>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>
                Monetary Policy → IPO Window
              </span>
            </div>

            <div>
              {capitalFlow.layers.map((layer, i) => (
                <div key={layer.id}>
                  <FlowLayerCard layer={layer} index={i} />
                  {i < capitalFlow.layers.length - 1 && (
                    <FlowConnector status={layer.status} />
                  )}
                </div>
              ))}
            </div>

            <p className="mt-4 text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.22)" }}>
              Capital flow status derived from live market regime, 10Y yield, M&A deal activity, and SEC EDGAR S-1 pipeline. Updated in real time as conditions change.
            </p>
          </div>

          {/* ── Right column ─────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* IPO Pipeline */}
            <div className="rounded-xl border p-5"
              style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.78)" }}>
                    IPO Pipeline
                  </h3>
                  <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                    SEC EDGAR S-1 filings
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!ipoLoading && (
                    <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.36)" }}>
                      {filers.length} filers
                    </span>
                  )}
                  <button
                    onClick={() => ipoRefetch()}
                    className="p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors"
                    style={{ color: "rgba(255,255,255,0.28)" }}
                    title="Refresh IPO data"
                  >
                    <RefreshCw size={11} className={ipoLoading ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {ipoError && (
                <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-2 mb-3"
                  style={{ background: "rgba(248,113,113,0.08)", color: "#fca5a5" }}>
                  <AlertCircle size={11} />
                  Unable to fetch EDGAR data.
                </div>
              )}

              {ipoLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                  ))}
                </div>
              ) : filers.length === 0 ? (
                <div className="text-center py-6">
                  <FileText size={20} className="mx-auto mb-2" style={{ color: "rgba(255,255,255,0.14)" }} />
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>No recent S-1 filings</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {filers.slice(0, 20).map((filer, i) => (
                    <IPOFilerRow key={`${filer.cik}-${i}`} filer={filer} index={i} />
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between">
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.22)" }}>
                  Data sourced from SEC EDGAR. Refreshes hourly.
                </p>
                <a
                  href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] hover:opacity-70 transition-opacity"
                  style={{ color: "rgba(82,176,200,0.6)" }}
                >
                  View on EDGAR
                  <ExternalLink size={9} />
                </a>
              </div>
            </div>

            {/* PE / Sponsor deals */}
            {sponsorDeals.length > 0 && (
              <div className="rounded-xl border p-5"
                style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.78)" }}>
                    Sponsor Activity
                  </h3>
                  <a href="/ma" className="flex items-center gap-0.5 text-[10px] group"
                    style={{ color: "rgba(82,176,200,0.6)" }}>
                    All deals
                    <ChevronRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
                  </a>
                </div>
                <div>
                  {sponsorDeals.map((deal, i) => (
                    <SponsorDealRow key={deal.id} deal={deal} index={i} />
                  ))}
                </div>
              </div>
            )}

            {!maLoading && sponsorDeals.length === 0 && (
              <div className="rounded-xl border p-5"
                style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.05)" }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: "rgba(255,255,255,0.72)" }}>
                  Sponsor Activity
                </h3>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                  No sponsor or PE-backed deals in the current feed window.
                </p>
                <a href="/ma" className="flex items-center gap-1 text-xs mt-3 group"
                  style={{ color: "rgba(82,176,200,0.6)" }}>
                  View full M&A intelligence
                  <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
