"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { useMarketState } from "@/hooks/useMarketState";
import { useFeed } from "@/hooks/useFeed";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { useFollowedThemes } from "@/hooks/useFollowedThemes";
import { useSaved } from "@/hooks/useSaved";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import type { MarketBrief, ThemeIntelligence } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GRID_BG = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">'
  + '<path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.016)" stroke-width="0.5"/>'
  + '</svg>'
)}")`;

const INTELLIGENCE_LAYERS = [
  {
    index: "01",
    title: "CAUSAL TRANSMISSION",
    body:  "Capital moves across asset classes in sequence. Credit spreads widen before equities fall. Dollar strength compresses EM liquidity. Argus maps live transmission paths: causal flow, not static correlation.",
  },
  {
    index: "02",
    title: "MULTI-HORIZON ANALYSIS",
    body:  "Intraday momentum, swing positioning, and structural regime operate at different speeds. When they conflict, inflection points form. Argus reads all three at once.",
  },
  {
    index: "03",
    title: "REGIME DETECTION",
    body:  "Volatility regimes, liquidity conditions, and participant crowding accumulate gradually. Argus flags the shift as it forms, before price confirms it.",
  },
] as const;

const CAPABILITIES = [
  { label: "Narrative Network",    desc: "Live causal mapping across equities, credit, rates, FX, and commodities" },
  { label: "Multi-Horizon View",   desc: "Simultaneous intraday, swing, and structural timeframe analysis" },
  { label: "Participant Dynamics", desc: "Live positioning model: CTAs, vol-targeters, macro funds, passive flows, dealers" },
  { label: "Systemic Risk",        desc: "Liquidity stress, dealer positioning, and forced-unwind cascade risk" },
] as const;

const fadeUp = {
  hidden:  { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.50, ease: [0.25, 0, 0.25, 1] as const },
  }),
};

const UPCOMING_CATALYSTS = [
  { label: "CPI Release",           importance: "HIGH",   timing: "Tomorrow",   why: "Core inflation data will reprice rate expectations and sovereign yields." },
  { label: "Non-Farm Payrolls",     importance: "HIGH",   timing: "In 3 Days",  why: "Labor market strength signals Fed trajectory and consumption durability." },
  { label: "FOMC Decision",         importance: "HIGH",   timing: "In 4 Days",  why: "Rate guidance sets the tone for equity valuations and credit spreads."    },
  { label: "Treasury Auction",      importance: "MEDIUM", timing: "Next Week",  why: "Demand for duration reveals institutional appetite for sovereign risk."   },
  { label: "Major Earnings Season", importance: "MEDIUM", timing: "In 14 Days", why: "Forward guidance from large-caps will drive near-term sector rotation."   },
] as const;

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─────────────────────────────────────────────────────────────────────────────
// Small shared components
// ─────────────────────────────────────────────────────────────────────────────

function PulseDot({ color = "#3ab880" }: { color?: string }) {
  return (
    <span className="relative inline-flex" style={{ width: 6, height: 6 }}>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-55"
        style={{ background: color }} />
      <span className="relative inline-flex rounded-full" style={{ width: 6, height: 6, background: color }} />
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: "8.5px", letterSpacing: "0.18em", fontWeight: 700,
      color: "rgba(255,255,255,0.22)", marginBottom: "6px", textTransform: "uppercase",
    }}>
      {children}
    </p>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Morning Brief — signed-out prompt
// ─────────────────────────────────────────────────────────────────────────────

function BriefSignOutPrompt({ regimeColor, pulseDotColor, onContinue }: {
  regimeColor: string;
  pulseDotColor: string;
  onContinue: () => void;
}) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).toUpperCase();

  return (
    <motion.div
      key="prompt"
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.40, ease: [0.25, 0, 0.25, 1] } }}
      exit={{ opacity: 0, scale: 0.95, y: -6, transition: { duration: 0.24 } }}
      className="flex justify-center"
    >
      <div
        className="relative w-full max-w-lg"
        style={{
          background: "rgba(5,9,22,0.85)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: "8px",
          backdropFilter: "blur(12px)",
          overflow: "hidden",
        }}
      >
        {/* Corner fold */}
        <div aria-hidden style={{
          position: "absolute", top: 0, right: 0, width: 0, height: 0,
          borderStyle: "solid", borderWidth: "0 28px 28px 0",
          borderColor: `transparent rgba(255,255,255,0.035) transparent transparent`,
        }} />

        {/* Top accent */}
        <div style={{ height: 2, background: `linear-gradient(to right, transparent, ${regimeColor}44, transparent)` }} />

        <div className="px-10 py-10 flex flex-col items-center text-center gap-6">

          {/* Header */}
          <div className="flex items-center gap-2.5">
            <PulseDot color={pulseDotColor} />
            <span style={{ fontSize: "9px", letterSpacing: "0.24em", fontWeight: 700, color: "rgba(255,255,255,0.28)" }}>
              ARGUS · MORNING BRIEF
            </span>
            <div style={{ width: 1, height: 10, background: "rgba(255,255,255,0.10)" }} />
            <span style={{ fontSize: "9px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.18)" }}>
              {today}
            </span>
          </div>

          {/* Seal */}
          <motion.div
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: 72, height: 72, borderRadius: "50%",
              background: `radial-gradient(circle at 38% 38%, ${regimeColor}28 0%, ${regimeColor}10 60%, transparent 100%)`,
              border: `1px solid ${regimeColor}30`,
              display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 2,
            }}
          >
            <span style={{ fontSize: "18px", fontWeight: 700, color: regimeColor, opacity: 0.65, letterSpacing: "-0.02em" }}>A</span>
            <div style={{ width: 20, height: 1, background: `${regimeColor}35` }} />
          </motion.div>

          {/* Copy */}
          <div className="space-y-1.5">
            <p style={{ fontSize: "14px", fontWeight: 500, color: "rgba(255,255,255,0.75)", letterSpacing: "0.02em" }}>
              Your Morning Brief is ready.
            </p>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.30)", lineHeight: 1.55 }}>
              Sign in to personalize your intelligence feed<br />and sync saved items across devices.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col items-center gap-2.5 w-full"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "20px" }}>
            <Link href="/auth" className="w-full max-w-[220px]">
              <button
                className="w-full flex items-center justify-center gap-2 transition-all duration-150"
                style={{
                  background: `${regimeColor}18`,
                  border: `1px solid ${regimeColor}38`,
                  borderRadius: "5px",
                  padding: "10px 24px",
                  color: "rgba(255,255,255,0.82)",
                  fontSize: "10.5px",
                  letterSpacing: "0.16em",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = `${regimeColor}28`;
                  e.currentTarget.style.color = "rgba(255,255,255,0.96)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = `${regimeColor}18`;
                  e.currentTarget.style.color = "rgba(255,255,255,0.82)";
                }}
              >
                SIGN IN
                <ArrowRight size={11} style={{ opacity: 0.55 }} />
              </button>
            </Link>

            <button
              onClick={onContinue}
              className="transition-colors duration-150"
              style={{ fontSize: "11px", color: "rgba(255,255,255,0.28)", letterSpacing: "0.04em", background: "none", border: "none", cursor: "pointer" }}
              onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.52)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.28)"; }}
            >
              Continue without signing in →
            </button>
          </div>

        </div>

        <div style={{ height: 1, background: `linear-gradient(to right, transparent, ${regimeColor}22, transparent)` }} />
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Morning Brief — sealed envelope state
// ─────────────────────────────────────────────────────────────────────────────

type RegimeStatus = "unchanged" | "stronger" | "weaker" | "changed";

function regimeStatusLabel(s: RegimeStatus) {
  return s === "unchanged" ? "UNCHANGED" : s === "stronger" ? "↑ STRONGER" : s === "weaker" ? "↓ WEAKER" : "CHANGED";
}
function regimeStatusColor(s: RegimeStatus) {
  return s === "unchanged" ? "rgba(255,255,255,0.32)" : s === "stronger" ? "rgba(70,168,110,0.80)" : s === "weaker" ? "rgba(200,80,80,0.80)" : "rgba(196,160,52,0.80)";
}
function regimeStatusBorder(s: RegimeStatus) {
  return s === "unchanged" ? "rgba(255,255,255,0.14)" : s === "stronger" ? "rgba(70,168,110,0.30)" : s === "weaker" ? "rgba(200,80,80,0.30)" : "rgba(196,160,52,0.30)";
}
function regimeStatusBg(s: RegimeStatus) {
  return s === "unchanged" ? "rgba(255,255,255,0.04)" : s === "stronger" ? "rgba(70,168,110,0.07)" : s === "weaker" ? "rgba(200,80,80,0.07)" : "rgba(196,160,52,0.07)";
}

function BriefSealed({
  isLoading, themeCount, regimeLabel, regimeColor, pulseDotColor, confidence, regimeStatus, onOpen,
}: {
  isLoading: boolean;
  themeCount: number;
  regimeLabel: string;
  regimeColor: string;
  pulseDotColor: string;
  confidence?: number;
  regimeStatus?: RegimeStatus | null;
  onOpen: () => void;
}) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).toUpperCase();

  return (
    <motion.div
      key="sealed"
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0, 0.25, 1] } }}
      exit={{ opacity: 0, scale: 0.95, y: -6, transition: { duration: 0.28, ease: [0.5, 0, 1, 0] } }}
      className="flex justify-center"
    >
      <div
        className="relative w-full max-w-lg"
        style={{
          background: "rgba(5,9,22,0.85)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: "8px",
          backdropFilter: "blur(12px)",
          overflow: "hidden",
        }}
      >
        <div aria-hidden style={{
          position: "absolute", top: 0, right: 0, width: 0, height: 0,
          borderStyle: "solid", borderWidth: "0 28px 28px 0",
          borderColor: `transparent rgba(255,255,255,0.035) transparent transparent`,
        }} />
        <div style={{ height: 2, background: `linear-gradient(to right, transparent, ${regimeColor}44, transparent)` }} />

        <div className="px-10 py-10 flex flex-col items-center text-center gap-6">
          <div className="flex items-center gap-2.5">
            <PulseDot color={pulseDotColor} />
            <span style={{ fontSize: "9px", letterSpacing: "0.24em", fontWeight: 700, color: "rgba(255,255,255,0.28)" }}>
              ARGUS · MORNING BRIEF
            </span>
            <div style={{ width: 1, height: 10, background: "rgba(255,255,255,0.10)" }} />
            <span style={{ fontSize: "9px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.18)" }}>
              {today}
            </span>
          </div>

          <div style={{ width: "100%" }}>
            <p style={{ fontSize: "12.5px", letterSpacing: "0.12em", fontWeight: 600, color: "rgba(255,255,255,0.68)", marginBottom: "3px", textAlign: "center" }}>
              MORNING INTELLIGENCE BRIEF
            </p>
            <p style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.26)", letterSpacing: "0.04em", textAlign: "center" }}>
              Daily market intelligence briefing
            </p>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            width: "100%",
            gap: "1px",
            background: "rgba(255,255,255,0.055)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "5px",
            overflow: "hidden",
          }}>
            <div style={{ background: "rgba(5,9,22,0.92)", padding: "11px 14px" }}>
              <p style={{ fontSize: "7.5px", letterSpacing: "0.18em", fontWeight: 700, color: "rgba(255,255,255,0.22)", marginBottom: "5px" }}>REGIME</p>
              {isLoading
                ? <div className="h-2.5 rounded animate-pulse" style={{ width: "70%", background: "rgba(255,255,255,0.07)" }} />
                : (
                  <>
                    <p style={{ fontSize: "13px", fontWeight: 700, color: regimeColor, opacity: 0.94, letterSpacing: "0.02em" }}>{regimeLabel}</p>
                    {regimeStatus && (
                      <span style={{ fontSize: "7.5px", letterSpacing: "0.12em", fontWeight: 700, color: regimeStatusColor(regimeStatus), display: "block", marginTop: "4px" }}>
                        {regimeStatusLabel(regimeStatus)}
                      </span>
                    )}
                  </>
                )
              }
            </div>

            <div style={{ background: "rgba(5,9,22,0.92)", padding: "11px 14px" }}>
              <p style={{ fontSize: "7.5px", letterSpacing: "0.18em", fontWeight: 700, color: "rgba(255,255,255,0.22)", marginBottom: "5px" }}>CONVICTION</p>
              {isLoading
                ? <div className="h-2.5 rounded animate-pulse" style={{ width: "50%", background: "rgba(255,255,255,0.07)" }} />
                : (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.68)" }}>
                      {confidence ? `${Math.round(confidence)}%` : "—"}
                    </span>
                    {confidence && (
                      <div style={{ flex: 1, height: "2px", background: "rgba(255,255,255,0.08)", borderRadius: "1px" }}>
                        <div style={{ height: "100%", width: `${Math.round(confidence)}%`, background: regimeColor, opacity: 0.55, borderRadius: "1px" }} />
                      </div>
                    )}
                  </div>
                )
              }
            </div>

            <div style={{ background: "rgba(5,9,22,0.92)", padding: "11px 14px", borderTop: "1px solid rgba(255,255,255,0.055)" }}>
              <p style={{ fontSize: "7.5px", letterSpacing: "0.18em", fontWeight: 700, color: "rgba(255,255,255,0.22)", marginBottom: "5px" }}>ACTIVE THEMES</p>
              {isLoading
                ? <div className="h-2.5 rounded animate-pulse" style={{ width: "35%", background: "rgba(255,255,255,0.07)" }} />
                : <p style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>{themeCount}</p>
              }
            </div>

            <div style={{ background: "rgba(5,9,22,0.92)", padding: "11px 14px", borderTop: "1px solid rgba(255,255,255,0.055)" }}>
              <p style={{ fontSize: "7.5px", letterSpacing: "0.18em", fontWeight: 700, color: "rgba(255,255,255,0.22)", marginBottom: "5px" }}>UPCOMING CATALYSTS</p>
              {isLoading
                ? <div className="h-2.5 rounded animate-pulse" style={{ width: "35%", background: "rgba(255,255,255,0.07)" }} />
                : <p style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>{UPCOMING_CATALYSTS.length}</p>
              }
            </div>
          </div>

          <button
            onClick={onOpen}
            disabled={isLoading}
            className="group flex items-center gap-2.5 transition-all duration-200"
            style={{
              background: isLoading ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${isLoading ? "rgba(255,255,255,0.07)" : regimeColor + "40"}`,
              borderRadius: "5px",
              padding: "10px 24px",
              color: isLoading ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.78)",
              fontSize: "10.5px",
              letterSpacing: "0.18em",
              fontWeight: 600,
              cursor: isLoading ? "default" : "pointer",
              backdropFilter: "blur(8px)",
            }}
            onMouseEnter={e => {
              if (isLoading) return;
              e.currentTarget.style.background = "rgba(255,255,255,0.10)";
              e.currentTarget.style.color = "rgba(255,255,255,0.95)";
            }}
            onMouseLeave={e => {
              if (isLoading) return;
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              e.currentTarget.style.color = "rgba(255,255,255,0.78)";
            }}
          >
            {isLoading ? (
              <>
                <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin opacity-50" />
                PREPARING…
              </>
            ) : (
              <>
                ▶ OPEN BRIEF
                <ArrowRight size={11} className="transition-transform duration-200 group-hover:translate-x-0.5"
                  style={{ opacity: 0.55 }} />
              </>
            )}
          </button>
        </div>

        <div style={{ height: 1, background: `linear-gradient(to right, transparent, ${regimeColor}22, transparent)` }} />
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Morning Brief — opened state
// ─────────────────────────────────────────────────────────────────────────────

function BriefOpen({
  brief, themes, regimeColor, regimeStatus, onClose,
}: {
  brief: MarketBrief | null | undefined;
  themes: ThemeIntelligence[];
  regimeColor: string;
  regimeStatus?: RegimeStatus | null;
  onClose: () => void;
}) {
  const today = new Date().toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  }).toUpperCase();

  const opportunities = useMemo(() =>
    themes
      .filter(t => t.momentum_direction !== "bearish")
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 3),
    [themes],
  );

  const risks = useMemo(() =>
    themes
      .filter(t => t.momentum_direction === "bearish" || (t.volatility_score ?? 0) > 0.55)
      .sort((a, b) => (b.volatility_score ?? 0) - (a.volatility_score ?? 0))
      .slice(0, 3),
    [themes],
  );

  const activeThemes = useMemo(() => themes.slice(0, 6), [themes]);
  const confPct = brief?.confidence ? `${Math.round(brief.confidence)}%` : null;

  const sv = {
    hidden:  { opacity: 0 },
    visible: (i: number) => ({
      opacity: 1,
      transition: { delay: i * 0.07, duration: 0.35, ease: "easeOut" as const },
    }),
  };

  return (
    <motion.div
      key="open"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.25, 0, 0.25, 1] } }}
      exit={{ opacity: 0, y: 6, transition: { duration: 0.22 } }}
      style={{
        background: "rgba(5,9,22,0.88)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: "8px",
        backdropFilter: "blur(14px)",
        overflow: "hidden",
      }}
    >
      <div style={{ height: 2, background: `linear-gradient(to right, transparent, ${regimeColor}55, transparent)` }} />

      <motion.div custom={0} variants={sv} initial="hidden" animate="visible"
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: "9px", letterSpacing: "0.22em", fontWeight: 700, color: "rgba(255,255,255,0.30)" }}>
            ARGUS MORNING BRIEF
          </span>
          <div style={{ width: 1, height: 10, background: "rgba(255,255,255,0.10)" }} />
          <span style={{ fontSize: "9px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.18)" }}>
            {today}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 transition-opacity duration-150 hover:opacity-80"
          style={{ color: "rgba(255,255,255,0.28)", fontSize: "9px", letterSpacing: "0.12em", background: "none", border: "none", cursor: "pointer" }}
        >
          <X size={11} /> CLOSE
        </button>
      </motion.div>

      {brief?.market_regime && (
        <motion.div custom={1} variants={sv} initial="hidden" animate="visible"
          className="flex items-center justify-between px-6 py-3"
          style={{
            background: `${regimeColor}12`,
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            borderLeft: `4px solid ${regimeColor}65`,
          }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: "11.5px", fontWeight: 700, letterSpacing: "0.12em", color: regimeColor, opacity: 0.92 }}>
              {brief.market_regime.toUpperCase()}
            </span>
            {regimeStatus && (
              <span style={{
                fontSize: "8px", letterSpacing: "0.12em", fontWeight: 700,
                color: regimeStatusColor(regimeStatus),
                background: regimeStatusBg(regimeStatus),
                border: `1px solid ${regimeStatusBorder(regimeStatus)}`,
                borderRadius: "3px", padding: "1.5px 6px",
              }}>
                {regimeStatusLabel(regimeStatus)}
              </span>
            )}
            {brief.assets_impacted?.length > 0 && (
              <span style={{ fontSize: "9.5px", color: "rgba(255,255,255,0.28)" }}>
                {brief.assets_impacted.slice(0, 4).join(" · ")}
              </span>
            )}
          </div>
          {confPct && brief?.confidence && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "44px", height: "2px", background: "rgba(255,255,255,0.10)", borderRadius: "1px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.round(brief.confidence)}%`, background: regimeColor, opacity: 0.65 }} />
              </div>
              <span style={{ fontSize: "9px", letterSpacing: "0.10em", fontWeight: 600, color: "rgba(255,255,255,0.35)" }}>
                {confPct}
              </span>
            </div>
          )}
        </motion.div>
      )}

      <div className="px-6 py-4 space-y-4">
        {brief?.narrative_shift && (
          <motion.div custom={2} variants={sv} initial="hidden" animate="visible"
            style={{
              background: `${regimeColor}08`,
              border: "1px solid rgba(255,255,255,0.055)",
              borderLeft: `2px solid ${regimeColor}44`,
              borderRadius: "5px",
              padding: "10px 14px",
            }}>
            <SectionLabel>Why Today Matters</SectionLabel>
            <p style={{ fontSize: "12px", lineHeight: "1.58", color: "rgba(255,255,255,0.60)" }}>
              {brief.narrative_shift}
            </p>
          </motion.div>
        )}

        {brief?.primary_driver && (
          <motion.div custom={3} variants={sv} initial="hidden" animate="visible">
            <SectionLabel>Primary Narrative</SectionLabel>
            <p style={{
              fontSize: "12.5px", lineHeight: "1.62", color: "rgba(255,255,255,0.58)",
              borderLeft: "2px solid rgba(255,255,255,0.10)", paddingLeft: "14px",
            }}>
              {brief.primary_driver}
            </p>
          </motion.div>
        )}

        {(opportunities.length > 0 || brief?.risk_scenario) && (
          <motion.div custom={4} variants={sv} initial="hidden" animate="visible"
            className="grid grid-cols-2 gap-4">
            <div>
              <SectionLabel>Opportunities</SectionLabel>
              {opportunities.length > 0 ? (
                <div className="space-y-2">
                  {opportunities.map((t, i) => (
                    <div key={t.id} className="flex items-start gap-2">
                      <span style={{ fontSize: "10px", fontWeight: 600, color: "#3ab880", opacity: 0.60, minWidth: 14, marginTop: 1 }}>
                        {i + 1}
                      </span>
                      <p style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.52)", lineHeight: 1.45 }}>
                        {t.name}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.22)" }}>No directional opportunities identified.</p>
              )}
            </div>

            <div>
              <SectionLabel>Key Risks</SectionLabel>
              <div className="space-y-2">
                {brief?.risk_scenario && (
                  <div className="flex items-start gap-2">
                    <span style={{ fontSize: "10px", color: "#e05555", opacity: 0.65, marginTop: 1 }}>⚠</span>
                    <p style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.52)", lineHeight: 1.45 }}>
                      {brief.risk_scenario}
                    </p>
                  </div>
                )}
                {risks.map((t) => (
                  <div key={t.id} className="flex items-start gap-2">
                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.22)", marginTop: 1 }}>◦</span>
                    <p style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.40)", lineHeight: 1.45 }}>
                      {t.name}
                    </p>
                  </div>
                ))}
                {!brief?.risk_scenario && risks.length === 0 && (
                  <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.22)" }}>No elevated risk signals.</p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {brief?.trade_implication && (
          <motion.div custom={5} variants={sv} initial="hidden" animate="visible"
            style={{
              background: "rgba(255,255,255,0.022)",
              border: "1px solid rgba(255,255,255,0.055)",
              borderRadius: "5px",
              padding: "10px 14px",
            }}>
            <SectionLabel>Trade Implication</SectionLabel>
            <p style={{ fontSize: "12px", lineHeight: "1.58", color: "rgba(255,255,255,0.52)" }}>
              {brief.trade_implication}
            </p>
          </motion.div>
        )}

        {activeThemes.length > 0 && (
          <motion.div custom={6} variants={sv} initial="hidden" animate="visible">
            <SectionLabel>Active Themes</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {activeThemes.map((t) => (
                <span key={t.id} style={{
                  fontSize: "10px", letterSpacing: "0.04em", color: "rgba(255,255,255,0.48)",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "4px", padding: "3px 9px",
                }}>
                  {t.name}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        <motion.div custom={7} variants={sv} initial="hidden" animate="visible">
          <SectionLabel>Upcoming Catalysts</SectionLabel>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            {UPCOMING_CATALYSTS.map((c, idx) => {
              const impColor =
                c.importance === "HIGH"   ? "#c8a040" :
                c.importance === "MEDIUM" ? "#5390c8" : "rgba(255,255,255,0.28)";
              return (
                <div key={c.label} style={{
                  display: "grid",
                  gridTemplateColumns: "82px 1fr auto",
                  alignItems: "center",
                  gap: "10px",
                  padding: "6px 0",
                  borderBottom: idx < UPCOMING_CATALYSTS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : undefined,
                }}>
                  <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.28)", letterSpacing: "0.02em" }}>
                    {c.timing}
                  </span>
                  <span style={{ fontSize: "11.5px", fontWeight: 500, color: "rgba(255,255,255,0.60)" }}>
                    {c.label}
                  </span>
                  <span style={{
                    fontSize: "7.5px", fontWeight: 700, letterSpacing: "0.14em",
                    color: impColor, opacity: 0.82,
                    border: `1px solid ${impColor}40`,
                    borderRadius: "3px", padding: "2px 5px",
                  }}>
                    {c.importance === "MEDIUM" ? "MED" : c.importance}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div custom={8} variants={sv} initial="hidden" animate="visible"
          className="flex justify-end pt-1"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <Link href="/feed">
            <button
              className="group flex items-center gap-2.5 transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.11)",
                borderRadius: "5px", padding: "10px 22px", color: "rgba(255,255,255,0.72)",
                fontSize: "10.5px", letterSpacing: "0.18em", fontWeight: 600, cursor: "pointer",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.94)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.055)"; e.currentTarget.style.color = "rgba(255,255,255,0.72)"; }}
            >
              ENTER PLATFORM
              <ArrowRight size={12} className="transition-transform duration-200 group-hover:translate-x-0.5" style={{ opacity: 0.55 }} />
            </button>
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const ms = useMarketState();
  const [mounted,           setMounted]           = useState(false);
  const [briefOpen,         setBriefOpen]         = useState(false);
  const [guestMode,         setGuestMode]         = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [regimeStatus, setRegimeStatus] = useState<null | "unchanged" | "stronger" | "weaker" | "changed">(null);
  const briefSectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMounted(true); }, []);

  const { user, loading: authLoading } = useAuth();
  const { firstName, onboardingCompleted, profile, refetch: refetchProfile } = useProfile();
  const meta = user?.user_metadata as Record<string, string | undefined> | undefined;
  const needsNameCapture = !authLoading && !!user && !profile?.first_name && !meta?.first_name;
  const { followed } = useFollowedThemes();
  const { savedIds } = useSaved();
  const { data: feedData, isLoading: feedLoading } = useFeed();

  const brief  = feedData?.market_brief;
  const themes = useMemo(() => feedData?.theme_intelligence ?? [], [feedData?.theme_intelligence]);

  // Persist yesterday's regime in localStorage to derive change indicators.
  useEffect(() => {
    if (!brief?.market_regime || !mounted) return;
    const KEY = "argus_regime_track_v1";
    const today = new Date().toDateString();
    const dir = (prev: string, curr: string) => {
      const p = prev.toLowerCase(), c = curr.toLowerCase();
      if (p === c) return "unchanged" as const;
      if (c.includes("risk-on")  && p.includes("risk-off")) return "stronger" as const;
      if (c.includes("risk-off") && p.includes("risk-on"))  return "weaker"   as const;
      return "changed" as const;
    };
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        localStorage.setItem(KEY, JSON.stringify({ prev: null, date: today, current: brief.market_regime }));
        return;
      }
      const s = JSON.parse(raw) as { prev: string | null; date: string; current: string };
      if (s.date === today) {
        if (s.prev) setRegimeStatus(dir(s.prev, brief.market_regime));
      } else {
        setRegimeStatus(dir(s.current, brief.market_regime));
        localStorage.setItem(KEY, JSON.stringify({ prev: s.current, date: today, current: brief.market_regime }));
      }
    } catch {}
  }, [brief?.market_regime, mounted]);

  // ── Regime colors ───────────────────────────────────────────────────────────

  const heroGrad =
    ms.riskRegime === "risk-off"
      ? "radial-gradient(ellipse 140% 90% at 50% -10%, rgba(48,8,8,0.70) 0%, rgba(28,6,6,0.30) 40%, transparent 70%)"
      : (ms.volRegime === "elevated" || ms.volRegime === "high")
      ? "radial-gradient(ellipse 140% 90% at 50% -10%, rgba(36,20,4,0.65) 0%, rgba(24,14,4,0.28) 40%, transparent 70%)"
      : "radial-gradient(ellipse 140% 90% at 50% -10%, rgba(8,24,72,0.72) 0%, rgba(6,16,50,0.32) 40%, transparent 70%)";

  const sideGrad =
    ms.riskRegime === "risk-off"
      ? "radial-gradient(ellipse 55% 40% at 12% 60%, rgba(44,10,10,0.28) 0%, transparent 70%)"
      : "radial-gradient(ellipse 55% 40% at 12% 60%, rgba(8,18,52,0.30) 0%, transparent 70%)";

  const regimeColor =
    ms.riskRegime === "risk-on"  ? "#52b0c8" :
    ms.riskRegime === "risk-off" ? "#c05858" : "#8898b8";

  const volColor =
    ms.volRegime === "high"     ? "#c05858" :
    ms.volRegime === "elevated" ? "#c8a040" : "rgba(255,255,255,0.36)";

  const ratesArrow =
    ms.ratesRegime === "rising"  ? "↑" :
    ms.ratesRegime === "falling" ? "↓" : "—";

  const pulseDotColor =
    ms.riskRegime === "risk-on"  ? "#3ab880" :
    ms.riskRegime === "risk-off" ? "#c05858" : "#52b0c8";

  const regimeLabel =
    ms.riskRegime === "risk-on"  ? "Risk On" :
    ms.riskRegime === "risk-off" ? "Risk Off" : "Neutral";

  // ── Derived ─────────────────────────────────────────────────────────────────

  const isSignedIn    = !authLoading && !!user;
  const showBriefCard = isSignedIn || guestMode;
  const greeting      = getGreeting();

  const todayLong = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).toUpperCase();

  const followedCount = followed.length;
  const savedCount    = savedIds.length;

  function handleOpenBriefFromHero() {
    setBriefOpen(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        briefSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    });
  }

  // Live status strip (shared between both hero variants)
  const statusStrip = mounted && (
    <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible"
      className="flex items-center gap-3 mb-8">
      <PulseDot color={pulseDotColor} />
      <span style={{ fontSize: "10px", letterSpacing: "0.20em", fontWeight: 600, color: "rgba(255,255,255,0.36)" }}>LIVE</span>
      <div style={{ width: 1, height: 11, background: "rgba(255,255,255,0.10)" }} />
      <span style={{ fontSize: "10px", letterSpacing: "0.14em", color: regimeColor }}>
        {ms.riskRegime === "risk-on" ? "RISK ON" : ms.riskRegime === "risk-off" ? "RISK OFF" : "NEUTRAL"}
      </span>
      <div style={{ width: 1, height: 11, background: "rgba(255,255,255,0.08)" }} />
      <span style={{ fontSize: "10px", letterSpacing: "0.14em", color: volColor }}>
        {ms.volRegime.toUpperCase()} VOL
      </span>
      <div style={{ width: 1, height: 11, background: "rgba(255,255,255,0.08)" }} />
      <span style={{ fontSize: "10px", letterSpacing: "0.14em", color: "rgba(255,255,255,0.28)" }}>
        RATES {ratesArrow}
      </span>
    </motion.div>
  );

  // Show onboarding for new users who haven't completed it, OR for any signed-in
  // user who has no trusted first name (nameOnly overlay to collect it).
  const showOnboarding =
    !authLoading && !!user &&
    ((!onboardingCompleted && !onboardingDismissed) || needsNameCapture);

  return (
    <div style={{ background: "#030710", minHeight: "100vh" }}>

      {/* Onboarding overlay — new users only */}
      {showOnboarding && (
        <OnboardingFlow
          onComplete={() => {
            setOnboardingDismissed(true);
            handleOpenBriefFromHero();
          }}
          needsNameCapture={needsNameCapture}
          nameOnly={needsNameCapture && onboardingCompleted}
          firstName={firstName}
          onRefetchProfile={refetchProfile}
        />
      )}

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col justify-center pt-14" style={{ overflow: "hidden" }}>

        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: heroGrad }} />
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: sideGrad }} />
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 55% 40% at 88% 70%, rgba(6,12,38,0.22) 0%, transparent 70%)" }} />
        <div aria-hidden className="absolute inset-0 pointer-events-none select-none"
          style={{ backgroundImage: GRID_BG, backgroundRepeat: "repeat" }} />

        <div className="relative max-w-5xl mx-auto w-full px-6 sm:px-10 py-10 sm:py-14">

          {isSignedIn ? (
            /* ── Signed-in: personalized morning hero ── */
            <>
              {statusStrip}

              {/* Greeting */}
              <motion.p
                custom={1} variants={fadeUp} initial="hidden" animate="visible"
                style={{
                  fontSize: "clamp(22px, 4vw, 32px)",
                  fontWeight: 300,
                  letterSpacing: "0.01em",
                  color: "rgba(255,255,255,0.82)",
                  marginBottom: "8px",
                  lineHeight: 1.2,
                }}
              >
                {firstName !== "there" ? `${greeting}, ${firstName}.` : `${greeting}.`}
              </motion.p>

              {/* Sub-headline */}
              <motion.p
                custom={2} variants={fadeUp} initial="hidden" animate="visible"
                style={{
                  fontSize: "14px",
                  fontWeight: 300,
                  letterSpacing: "0.04em",
                  color: "rgba(255,255,255,0.38)",
                  marginBottom: "18px",
                }}
              >
                Your Argus Brief is ready.
              </motion.p>

              {/* Date stamp */}
              <motion.p
                custom={3} variants={fadeUp} initial="hidden" animate="visible"
                style={{
                  fontSize: "9px",
                  letterSpacing: "0.20em",
                  color: "rgba(255,255,255,0.22)",
                  marginBottom: "20px",
                }}
              >
                {todayLong}
              </motion.p>

              {/* Stats row */}
              {(followedCount > 0 || savedCount > 0) && (
                <motion.div
                  custom={4} variants={fadeUp} initial="hidden" animate="visible"
                  className="flex items-center gap-4 mb-8"
                >
                  {followedCount > 0 && (
                    <>
                      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)", letterSpacing: "0.03em" }}>
                        <span style={{ color: regimeColor, opacity: 0.65, fontWeight: 600 }}>{followedCount}</span>
                        {" "}theme{followedCount !== 1 ? "s" : ""} followed
                      </span>
                      {savedCount > 0 && (
                        <div style={{ width: 1, height: 11, background: "rgba(255,255,255,0.10)" }} />
                      )}
                    </>
                  )}
                  {savedCount > 0 && (
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)", letterSpacing: "0.03em" }}>
                      <span style={{ color: regimeColor, opacity: 0.65, fontWeight: 600 }}>{savedCount}</span>
                      {" "}saved
                    </span>
                  )}
                </motion.div>
              )}

              {/* Action buttons */}
              <motion.div
                custom={followedCount > 0 || savedCount > 0 ? 5 : 4}
                variants={fadeUp} initial="hidden" animate="visible"
                className="flex items-center gap-3"
              >
                <button
                  onClick={handleOpenBriefFromHero}
                  className="group flex items-center gap-2.5 transition-all duration-200"
                  style={{
                    background: `${regimeColor}18`,
                    border: `1px solid ${regimeColor}38`,
                    borderRadius: "5px",
                    padding: "11px 24px",
                    color: "rgba(255,255,255,0.82)",
                    fontSize: "10.5px",
                    letterSpacing: "0.18em",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${regimeColor}28`; e.currentTarget.style.color = "rgba(255,255,255,0.96)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = `${regimeColor}18`; e.currentTarget.style.color = "rgba(255,255,255,0.82)"; }}
                >
                  OPEN BRIEF ▾
                </button>

                <Link href="/feed">
                  <button
                    className="group flex items-center gap-2.5 transition-all duration-200"
                    style={{
                      background: "rgba(255,255,255,0.055)",
                      border: "1px solid rgba(255,255,255,0.11)",
                      borderRadius: "5px",
                      padding: "11px 24px",
                      color: "rgba(255,255,255,0.60)",
                      fontSize: "10.5px",
                      letterSpacing: "0.18em",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.90)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.055)"; e.currentTarget.style.color = "rgba(255,255,255,0.60)"; }}
                  >
                    ENTER PLATFORM
                    <ArrowRight size={11} className="transition-transform duration-200 group-hover:translate-x-0.5" style={{ opacity: 0.50 }} />
                  </button>
                </Link>
              </motion.div>
            </>
          ) : (
            /* ── Signed-out: landing hero ── */
            <>
              {statusStrip}

              <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible"
                style={{ marginBottom: "28px" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/argus-logo-hero.png"
                  alt="Argus Market Intelligence"
                  style={{ display: "block", width: "min(100%, 460px)", height: "auto" }}
                />
              </motion.div>

              <motion.p custom={2} variants={fadeUp} initial="hidden" animate="visible"
                style={{ fontSize: "14px", fontWeight: 300, letterSpacing: "0.05em", color: "rgba(255,255,255,0.40)", marginBottom: "12px" }}>
                Real-time market intelligence.
              </motion.p>

              <motion.p custom={3} variants={fadeUp} initial="hidden" animate="visible"
                style={{ fontSize: "13.5px", lineHeight: "1.80", color: "rgba(255,255,255,0.28)", maxWidth: "460px", marginBottom: "28px" }}>
                Tracks liquidity conditions, volatility regimes, participant positioning,
                and cross-asset flows in real time. Built for the speed and structure
                of live capital markets.
              </motion.p>

              <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
                <Link href="/feed">
                  <button
                    className="group flex items-center gap-3 transition-all duration-200"
                    style={{
                      background: "rgba(255,255,255,0.055)",
                      border: "1px solid rgba(255,255,255,0.11)",
                      borderRadius: "5px", padding: "12px 26px",
                      color: "rgba(255,255,255,0.76)",
                      fontSize: "11px", letterSpacing: "0.18em", fontWeight: 600,
                      cursor: "pointer", backdropFilter: "blur(8px)",
                    }}
                    onMouseEnter={e => {
                      const b = e.currentTarget as HTMLButtonElement;
                      b.style.background = "rgba(255,255,255,0.09)";
                      b.style.borderColor = "rgba(255,255,255,0.18)";
                      b.style.color = "rgba(255,255,255,0.94)";
                    }}
                    onMouseLeave={e => {
                      const b = e.currentTarget as HTMLButtonElement;
                      b.style.background = "rgba(255,255,255,0.055)";
                      b.style.borderColor = "rgba(255,255,255,0.11)";
                      b.style.color = "rgba(255,255,255,0.76)";
                    }}
                  >
                    OPEN PLATFORM
                    <ArrowRight size={13} className="transition-transform duration-200 group-hover:translate-x-1"
                      style={{ opacity: 0.55 }} />
                  </button>
                </Link>
              </motion.div>
            </>
          )}
        </div>

        <div aria-hidden className="absolute bottom-0 left-0 right-0 h-28 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(3,7,16,0.80))" }} />
      </section>

      {/* ── INTELLIGENCE LAYERS ───────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-10 py-12">
          <div className="flex items-center gap-4 mb-8">
            <span style={{ fontSize: "9.5px", letterSpacing: "0.18em", fontWeight: 600, color: "rgba(255,255,255,0.32)" }}>
              INTELLIGENCE LAYERS
            </span>
            <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, rgba(255,255,255,0.07), transparent)" }} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            {INTELLIGENCE_LAYERS.map((p, i) => (
              <motion.div
                key={p.index}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.09, duration: 0.45, ease: [0.25, 0, 0.25, 1] }}
                style={{
                  padding: "0 28px 0 0",
                  paddingLeft: i > 0 ? "28px" : 0,
                  borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.055)" : "none",
                }}>
                <span style={{ fontSize: "10px", letterSpacing: "0.14em", color: "rgba(255,255,255,0.18)", display: "block", marginBottom: "12px" }}>
                  {p.index}
                </span>
                <h3 style={{ fontSize: "10px", letterSpacing: "0.16em", fontWeight: 700, color: "rgba(255,255,255,0.66)", marginBottom: "12px" }}>
                  {p.title}
                </h3>
                <p style={{ fontSize: "13px", lineHeight: "1.72", color: "rgba(255,255,255,0.32)" }}>
                  {p.body}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MORNING BRIEF ─────────────────────────────────────────────────── */}
      <section ref={briefSectionRef} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-10 pt-8 pb-12">

          <div className="flex items-center gap-4 mb-7">
            {mounted && <PulseDot color={pulseDotColor} />}
            <span style={{ fontSize: "9.5px", letterSpacing: "0.18em", fontWeight: 600, color: "rgba(255,255,255,0.32)" }}>
              MORNING BRIEF
            </span>
            <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, rgba(255,255,255,0.07), transparent)" }} />
          </div>

          <AnimatePresence mode="wait">
            {showBriefCard ? (
              briefOpen ? (
                <BriefOpen
                  key="open"
                  brief={brief}
                  themes={themes}
                  regimeColor={regimeColor}
                  regimeStatus={regimeStatus}
                  onClose={() => setBriefOpen(false)}
                />
              ) : (
                <BriefSealed
                  key="sealed"
                  isLoading={feedLoading}
                  themeCount={themes.length}
                  regimeLabel={brief?.market_regime ?? regimeLabel}
                  regimeColor={regimeColor}
                  pulseDotColor={pulseDotColor}
                  confidence={brief?.confidence}
                  regimeStatus={regimeStatus}
                  onOpen={() => setBriefOpen(true)}
                />
              )
            ) : (
              <BriefSignOutPrompt
                key="prompt"
                regimeColor={regimeColor}
                pulseDotColor={pulseDotColor}
                onContinue={() => setGuestMode(true)}
              />
            )}
          </AnimatePresence>

        </div>
      </section>

      {/* ── CAPABILITIES ──────────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-10 py-9">
          <div className="flex items-center gap-4 mb-7">
            <span style={{ fontSize: "9.5px", letterSpacing: "0.18em", fontWeight: 600, color: "rgba(255,255,255,0.32)" }}>
              CAPABILITIES
            </span>
            <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, rgba(255,255,255,0.07), transparent)" }} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px"
            style={{ border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px", overflow: "hidden" }}>
            {CAPABILITIES.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.38 }}
                style={{
                  padding: "20px 24px",
                  background: "rgba(255,255,255,0.016)",
                  borderRight: i % 2 === 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.05)" : "none",
                }}>
                <p style={{ fontSize: "10.5px", fontWeight: 600, letterSpacing: "0.06em", color: "rgba(255,255,255,0.64)", marginBottom: "6px" }}>
                  {c.label}
                </p>
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.30)", lineHeight: "1.60" }}>
                  {c.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ENTER CTA ─────────────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="max-w-5xl mx-auto px-6 py-14 text-center">
          <motion.p
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
            viewport={{ once: true }} transition={{ duration: 0.55 }}
            style={{ fontSize: "13px", letterSpacing: "0.04em", color: "rgba(255,255,255,0.22)", marginBottom: "22px" }}>
            Markets don&apos;t wait. Neither does Argus.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ delay: 0.10, duration: 0.45 }}>
            <Link href="/feed">
              <button
                style={{
                  background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.11)",
                  borderRadius: "5px", padding: "12px 34px", color: "rgba(255,255,255,0.74)",
                  fontSize: "11px", letterSpacing: "0.18em", fontWeight: 600, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: "12px", transition: "all 0.2s ease",
                }}
                onMouseEnter={e => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.background = "rgba(255,255,255,0.09)";
                  b.style.color = "rgba(255,255,255,0.92)";
                }}
                onMouseLeave={e => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.background = "rgba(255,255,255,0.055)";
                  b.style.color = "rgba(255,255,255,0.74)";
                }}
              >
                OPEN PLATFORM
                <ArrowRight size={13} style={{ opacity: 0.50 }} />
              </button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", padding: "20px 0" }}>
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/argus-icon.png" alt="Argus" style={{ width: 22, height: 22, borderRadius: 5 }} />
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.14)", letterSpacing: "0.04em" }}>
            Market Intelligence Platform
          </span>
        </div>
      </div>

    </div>
  );
}
