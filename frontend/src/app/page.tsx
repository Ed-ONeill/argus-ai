"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useMarketState } from "@/hooks/useMarketState";
import { MarketNarrativeNetwork } from "@/components/feed/MarketNarrativeNetwork";
import { MarketPressureMap } from "@/components/feed/MarketPressureMap";

// ── Grid background — institutional reference depth ────────────────────────────

const GRID_BG = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">'
  + '<path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.016)" stroke-width="0.5"/>'
  + '</svg>'
)}")`;

// ── Philosophy pillars ─────────────────────────────────────────────────────────

const PILLARS = [
  {
    index: "01",
    title: "CAUSAL CHAINS",
    body:  "Markets propagate through cause-and-effect sequences across asset classes, geographies, and sectors. Argus maps active transmission paths in real time — not correlations, but causation.",
  },
  {
    index: "02",
    title: "TEMPORAL LAYERS",
    body:  "Intraday emotion, swing positioning, and structural fragility operate at fundamentally different velocities. Argus reads all three simultaneously and surfaces the conflicts between them.",
  },
  {
    index: "03",
    title: "EMERGENT STRUCTURE",
    body:  "Market regimes and stress conditions form organically from interacting participant forces. Argus detects these structures as they emerge — before they reach consensus.",
  },
] as const;

// ── Platform capabilities ──────────────────────────────────────────────────────

const CAPABILITIES = [
  { label: "Narrative Network",    desc: "Live causal transmission map across all market layers" },
  { label: "Temporal Cognition",   desc: "Three-horizon analysis: intraday · swing · structural" },
  { label: "Participant Dynamics", desc: "CTA, vol-targeting, macro, retail — live crowd detection" },
  { label: "Systemic Risk",        desc: "Feedback loops, contagion depth, capital hierarchy stress" },
] as const;

// ── Animation variants ─────────────────────────────────────────────────────────

const fadeUp = {
  hidden:  { opacity: 0, y: 18 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.55, ease: [0.25, 0, 0.25, 1] as const },
  }),
};

// ── Live pulse dot ─────────────────────────────────────────────────────────────

function PulseDot({ color = "#3ab880" }: { color?: string }) {
  return (
    <span className="relative inline-flex" style={{ width: 7, height: 7 }}>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
        style={{ background: color }} />
      <span className="relative inline-flex rounded-full" style={{ width: 7, height: 7, background: color }} />
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const ms = useMarketState();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Regime-reactive hero gradient
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

  // Live regime color
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

        {/* Atmospheric gradients */}
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: heroGrad }} />
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: sideGrad }} />
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 55% 40% at 88% 70%, rgba(6,12,38,0.22) 0%, transparent 70%)",
          }} />
        <div aria-hidden className="absolute inset-0 pointer-events-none select-none"
          style={{ backgroundImage: GRID_BG, backgroundRepeat: "repeat" }} />

        {/* Content */}
        <div className="relative max-w-5xl mx-auto w-full px-6 sm:px-10 py-24">

          {/* Live status */}
          {mounted && (
            <motion.div
              custom={0} variants={fadeUp} initial="hidden" animate="visible"
              className="flex items-center gap-3 mb-10">
              <PulseDot color={pulseDotColor} />
              <span style={{
                fontSize: "10px", letterSpacing: "0.20em", fontWeight: 600,
                color: "rgba(255,255,255,0.38)",
              }}>
                LIVE
              </span>
              <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.10)" }} />
              <span style={{ fontSize: "10px", letterSpacing: "0.14em", color: regimeColor }}>
                {ms.riskRegime === "risk-on" ? "RISK ON" : ms.riskRegime === "risk-off" ? "RISK OFF" : "NEUTRAL"}
              </span>
              <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.08)" }} />
              <span style={{ fontSize: "10px", letterSpacing: "0.14em", color: volColor }}>
                {ms.volRegime.toUpperCase()} VOL
              </span>
              <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.08)" }} />
              <span style={{ fontSize: "10px", letterSpacing: "0.14em", color: "rgba(255,255,255,0.30)" }}>
                RATES {ratesArrow}
              </span>
            </motion.div>
          )}

          {/* Wordmark */}
          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
            <h1 style={{
              fontSize: "clamp(52px, 8vw, 88px)",
              fontWeight: 700,
              letterSpacing: "0.28em",
              color: "rgba(255,255,255,0.96)",
              lineHeight: 1,
              marginBottom: "20px",
            }}>
              ARGUS
            </h1>
          </motion.div>

          {/* Tagline */}
          <motion.p
            custom={2} variants={fadeUp} initial="hidden" animate="visible"
            style={{
              fontSize: "clamp(14px, 2vw, 18px)",
              fontWeight: 300,
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.48)",
              marginBottom: "20px",
            }}>
            Market Cognition Infrastructure
          </motion.p>

          {/* Description */}
          <motion.p
            custom={3} variants={fadeUp} initial="hidden" animate="visible"
            style={{
              fontSize: "14px",
              lineHeight: "1.85",
              color: "rgba(255,255,255,0.32)",
              maxWidth: "520px",
              marginBottom: "44px",
            }}>
            Institutional market intelligence engineered for the way capital markets actually
            move — through causal chains, across temporal layers, with emergent structural
            awareness that surfaces before consensus forms.
          </motion.p>

          {/* CTA */}
          <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
            <Link href="/feed">
              <button
                className="group flex items-center gap-3 transition-all duration-200"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.13)",
                  borderRadius: "5px",
                  padding: "13px 28px",
                  color: "rgba(255,255,255,0.80)",
                  fontSize: "11.5px",
                  letterSpacing: "0.18em",
                  fontWeight: 600,
                  cursor: "pointer",
                  backdropFilter: "blur(8px)",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.20)";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.96)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.13)";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.80)";
                }}
              >
                ENTER INTELLIGENCE
                <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1"
                  style={{ opacity: 0.60 }} />
              </button>
            </Link>
          </motion.div>
        </div>

        {/* Scroll fade at bottom */}
        <div aria-hidden className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(3,7,16,0.80))" }} />
      </section>

      {/* ── PHILOSOPHY ────────────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-10 py-20">

          {/* Section label */}
          <div className="flex items-center gap-4 mb-14">
            <span style={{
              fontSize: "9px", letterSpacing: "0.24em", fontWeight: 600,
              color: "rgba(255,255,255,0.24)",
            }}>
              COGNITION ARCHITECTURE
            </span>
            <div className="flex-1 h-px"
              style={{ background: "linear-gradient(to right, rgba(255,255,255,0.07), transparent)" }} />
          </div>

          {/* Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            {PILLARS.map((p, i) => (
              <motion.div
                key={p.index}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.10, duration: 0.50, ease: [0.25, 0, 0.25, 1] }}
                style={{
                  padding: "0 32px 0 0",
                  paddingLeft: i > 0 ? "32px" : 0,
                  borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}>
                <span style={{
                  fontSize: "10px", letterSpacing: "0.16em",
                  color: "rgba(255,255,255,0.20)", display: "block", marginBottom: "14px",
                }}>
                  {p.index}
                </span>
                <h3 style={{
                  fontSize: "10.5px", letterSpacing: "0.16em", fontWeight: 700,
                  color: "rgba(255,255,255,0.70)", marginBottom: "12px",
                }}>
                  {p.title}
                </h3>
                <p style={{
                  fontSize: "13px", lineHeight: "1.85",
                  color: "rgba(255,255,255,0.32)",
                }}>
                  {p.body}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE INTELLIGENCE PREVIEW ─────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>

        {/* Section label */}
        <div className="max-w-5xl mx-auto px-6 sm:px-10 pt-14 pb-6">
          <div className="flex items-center gap-4">
            {mounted && <PulseDot color={pulseDotColor} />}
            <span style={{
              fontSize: "9px", letterSpacing: "0.24em", fontWeight: 600,
              color: "rgba(255,255,255,0.24)",
            }}>
              LIVE MARKET STRUCTURE
            </span>
            <div className="flex-1 h-px"
              style={{ background: "linear-gradient(to right, rgba(255,255,255,0.07), transparent)" }} />
          </div>
        </div>

        <MarketNarrativeNetwork />

        {/* Pressure map below network */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-8">
          <MarketPressureMap regime="" />
        </div>
      </section>

      {/* ── CAPABILITIES ──────────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-10 py-16">

          <div className="flex items-center gap-4 mb-10">
            <span style={{
              fontSize: "9px", letterSpacing: "0.24em", fontWeight: 600,
              color: "rgba(255,255,255,0.24)",
            }}>
              PLATFORM CAPABILITIES
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
                transition={{ delay: i * 0.06, duration: 0.40 }}
                style={{
                  padding: "20px 24px",
                  background: "rgba(255,255,255,0.018)",
                  borderRight: i % 2 === 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.05)" : "none",
                }}>
                <p style={{
                  fontSize: "10.5px", fontWeight: 600, letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.68)", marginBottom: "6px",
                }}>
                  {c.label}
                </p>
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.32)", lineHeight: "1.6" }}>
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
            viewport={{ once: true }} transition={{ duration: 0.6 }}
            style={{
              fontSize: "12px", letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.24)", marginBottom: "28px",
            }}>
            The market is always moving. Argus is always watching.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ delay: 0.12, duration: 0.50 }}>
            <Link href="/feed">
              <button
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.13)",
                  borderRadius: "5px",
                  padding: "13px 36px",
                  color: "rgba(255,255,255,0.78)",
                  fontSize: "11.5px",
                  letterSpacing: "0.18em",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "12px",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.94)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.78)";
                }}
              >
                ENTER INTELLIGENCE
                <ArrowRight size={14} style={{ opacity: 0.55 }} />
              </button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", padding: "24px 0" }}>
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
          <span style={{ fontSize: "10px", letterSpacing: "0.16em", color: "rgba(255,255,255,0.18)" }}>
            ARGUS
          </span>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.14)" }}>
            Institutional Market Intelligence
          </span>
        </div>
      </div>
    </div>
  );
}
