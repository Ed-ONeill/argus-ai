"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useMarketState } from "@/hooks/useMarketState";
import { MarketNarrativeNetwork } from "@/components/feed/MarketNarrativeNetwork";
import { MarketPressureMap } from "@/components/feed/MarketPressureMap";
import { ArgusLogo } from "@/components/brand/ArgusLogo";

const GRID_BG = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">'
  + '<path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.016)" stroke-width="0.5"/>'
  + '</svg>'
)}")`;

const INTELLIGENCE_LAYERS = [
  {
    index: "01",
    title: "CAUSAL TRANSMISSION",
    body:  "Capital moves across asset classes in sequence. Credit spreads widen before equities fall. Dollar strength compresses EM liquidity. Argus maps live transmission paths — not correlations, but actual propagation.",
  },
  {
    index: "02",
    title: "MULTI-HORIZON ANALYSIS",
    body:  "Intraday momentum, swing positioning, and structural regime operate at different speeds. When they conflict, inflection points form. Argus tracks all three simultaneously.",
  },
  {
    index: "03",
    title: "REGIME DETECTION",
    body:  "Volatility regimes, liquidity conditions, and participant crowding build incrementally. Argus detects regime shifts as they form — before price confirms.",
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

function PulseDot({ color = "#3ab880" }: { color?: string }) {
  return (
    <span className="relative inline-flex" style={{ width: 6, height: 6 }}>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-55"
        style={{ background: color }} />
      <span className="relative inline-flex rounded-full" style={{ width: 6, height: 6, background: color }} />
    </span>
  );
}

export default function LandingPage() {
  const ms = useMarketState();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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

  return (
    <div style={{ background: "#030710", minHeight: "100vh" }}>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col justify-center pt-14"
        style={{ overflow: "hidden" }}>

        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: heroGrad }} />
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: sideGrad }} />
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 55% 40% at 88% 70%, rgba(6,12,38,0.22) 0%, transparent 70%)" }} />
        <div aria-hidden className="absolute inset-0 pointer-events-none select-none"
          style={{ backgroundImage: GRID_BG, backgroundRepeat: "repeat" }} />

        <div className="relative max-w-5xl mx-auto w-full px-6 sm:px-10 py-24">

          {/* Live status strip */}
          {mounted && (
            <motion.div
              custom={0} variants={fadeUp} initial="hidden" animate="visible"
              className="flex items-center gap-3 mb-12">
              <PulseDot color={pulseDotColor} />
              <span style={{ fontSize: "10px", letterSpacing: "0.20em", fontWeight: 600, color: "rgba(255,255,255,0.36)" }}>
                LIVE
              </span>
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
          )}

          {/* Logo lockup */}
          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible"
            style={{ marginBottom: "28px" }}>
            <ArgusLogo variant="full" iconSize={52} wordmarkSize={40} />
          </motion.div>

          {/* Tagline */}
          <motion.p
            custom={2} variants={fadeUp} initial="hidden" animate="visible"
            style={{
              fontSize: "15px",
              fontWeight: 300,
              letterSpacing: "0.06em",
              color: "rgba(255,255,255,0.42)",
              marginBottom: "20px",
            }}>
            Real-time market intelligence.
          </motion.p>

          {/* Description */}
          <motion.p
            custom={3} variants={fadeUp} initial="hidden" animate="visible"
            style={{
              fontSize: "14px",
              lineHeight: "1.80",
              color: "rgba(255,255,255,0.30)",
              maxWidth: "480px",
              marginBottom: "44px",
            }}>
            Tracks liquidity conditions, volatility regimes, participant positioning,
            and cross-asset flows in real time. Built for the speed and structure
            of live capital markets.
          </motion.p>

          {/* CTA */}
          <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
            <Link href="/feed">
              <button
                className="group flex items-center gap-3 transition-all duration-200"
                style={{
                  background: "rgba(255,255,255,0.055)",
                  border: "1px solid rgba(255,255,255,0.11)",
                  borderRadius: "5px",
                  padding: "12px 26px",
                  color: "rgba(255,255,255,0.76)",
                  fontSize: "11px",
                  letterSpacing: "0.18em",
                  fontWeight: 600,
                  cursor: "pointer",
                  backdropFilter: "blur(8px)",
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
        </div>

        <div aria-hidden className="absolute bottom-0 left-0 right-0 h-28 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(3,7,16,0.80))" }} />
      </section>

      {/* ── INTELLIGENCE LAYERS ───────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-10 py-20">

          <div className="flex items-center gap-4 mb-14">
            <span style={{ fontSize: "9px", letterSpacing: "0.24em", fontWeight: 600, color: "rgba(255,255,255,0.22)" }}>
              INTELLIGENCE LAYERS
            </span>
            <div className="flex-1 h-px"
              style={{ background: "linear-gradient(to right, rgba(255,255,255,0.07), transparent)" }} />
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
                <span style={{
                  fontSize: "10px", letterSpacing: "0.14em",
                  color: "rgba(255,255,255,0.18)", display: "block", marginBottom: "12px",
                }}>
                  {p.index}
                </span>
                <h3 style={{
                  fontSize: "10px", letterSpacing: "0.16em", fontWeight: 700,
                  color: "rgba(255,255,255,0.66)", marginBottom: "12px",
                }}>
                  {p.title}
                </h3>
                <p style={{ fontSize: "13px", lineHeight: "1.80", color: "rgba(255,255,255,0.30)" }}>
                  {p.body}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE MARKET STRUCTURE ─────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-10 pt-14 pb-6">
          <div className="flex items-center gap-4">
            {mounted && <PulseDot color={pulseDotColor} />}
            <span style={{ fontSize: "9px", letterSpacing: "0.24em", fontWeight: 600, color: "rgba(255,255,255,0.22)" }}>
              LIVE MARKET STRUCTURE
            </span>
            <div className="flex-1 h-px"
              style={{ background: "linear-gradient(to right, rgba(255,255,255,0.07), transparent)" }} />
          </div>
        </div>

        <MarketNarrativeNetwork />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-8">
          <MarketPressureMap regime="" />
        </div>
      </section>

      {/* ── CAPABILITIES ──────────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-10 py-16">

          <div className="flex items-center gap-4 mb-10">
            <span style={{ fontSize: "9px", letterSpacing: "0.24em", fontWeight: 600, color: "rgba(255,255,255,0.22)" }}>
              CAPABILITIES
            </span>
            <div className="flex-1 h-px"
              style={{ background: "linear-gradient(to right, rgba(255,255,255,0.07), transparent)" }} />
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
                <p style={{
                  fontSize: "10.5px", fontWeight: 600, letterSpacing: "0.06em",
                  color: "rgba(255,255,255,0.64)", marginBottom: "6px",
                }}>
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
        <div className="max-w-5xl mx-auto px-6 py-28 text-center">
          <motion.p
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
            viewport={{ once: true }} transition={{ duration: 0.55 }}
            style={{
              fontSize: "13px", letterSpacing: "0.04em",
              color: "rgba(255,255,255,0.22)", marginBottom: "28px",
            }}>
            Markets don&apos;t wait. Neither does Argus.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ delay: 0.10, duration: 0.45 }}>
            <Link href="/feed">
              <button
                style={{
                  background: "rgba(255,255,255,0.055)",
                  border: "1px solid rgba(255,255,255,0.11)",
                  borderRadius: "5px",
                  padding: "12px 34px",
                  color: "rgba(255,255,255,0.74)",
                  fontSize: "11px",
                  letterSpacing: "0.18em",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "12px",
                  transition: "all 0.2s ease",
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
          <ArgusLogo variant="icon" iconSize={22} />
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.14)", letterSpacing: "0.04em" }}>
            Market Intelligence Platform
          </span>
        </div>
      </div>
    </div>
  );
}
