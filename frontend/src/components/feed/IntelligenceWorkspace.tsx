"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  themeBeneficiaries, bestExpressions, themeLosers, generateBullBearCases,
  generateNextCatalysts, generateEvidenceItems, computeThemeHealth, computeIntelligenceScore,
} from "@/lib/themeIntelligence";
import { deriveDriver, deriveSector, dirOf, themeWatch } from "@/lib/themeTransmission";
import { focusedThemes, focusKindLabel, type FeedFocus } from "@/lib/feedFocus";
import { Beam } from "@/lib/feedHighlight";
import { cleanThemeName, confColor } from "@/app/markets/marketsShared";
import { timeAgo } from "@/lib/utils";
import type { ThemeIntelligence, StoryCluster } from "@/lib/types";

/**
 * IntelligenceWorkspace — the adaptive intelligence dashboard that replaces the
 * old "What Matters Now" card grid. One Bloomberg-style workspace, not a list:
 * the theme behind the selected graph node becomes the centerpiece and every
 * panel (metrics, positioning, capital destination, beneficiaries, risks,
 * catalysts, confirmations, competing themes, transmission, supporting stories)
 * is a read of that one entity. Whenever the graph focus changes, the whole
 * workspace re-renders — the user is exploring the graph, not reading news.
 *
 * Pure reads of stored theme intelligence + existing derivation helpers.
 */

interface Props {
  focus:      FeedFocus | null;
  themes:     ThemeIntelligence[];
  clusters:   StoryCluster[];
  isLoading?: boolean;
}

const GREEN = "#34d399", RED = "#f87171", AMBER = "#fbbf24", SLATE = "#8ea3c4", CYAN = "#7cc7d8";
const dirColor = (d: string) => d === "bullish" ? GREEN : d === "bearish" ? RED : AMBER;
const scale = (v: number) => v >= 70 ? GREEN : v >= 45 ? AMBER : SLATE;
const signed = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n)}`;

// ── Derivations local to the workspace (qualitative reads of stored fields) ────
function marketPressure(theme: ThemeIntelligence, stories: StoryCluster[]): number {
  const top = stories.reduce((m, c) => Math.max(m, c.primary.signal_score ?? 0), 0);
  if (top) return Math.round(top);
  return Math.round((theme.breadth_score ?? 0) * 0.4 + (theme.confidence ?? 0) * 0.6);
}

function positioning(theme: ThemeIntelligence): { label: string; color: string; note: string } {
  const dir = dirOf(theme), mom = theme.momentum_label, accel = theme.momentum_delta ?? 0;
  const m = theme.memory;
  const trend = m ? ` · conviction ${m.conviction_window_start}→${m.conviction_current}` : "";
  if (dir === "bullish" && (mom === "accelerating" || mom === "strengthening"))
    return { label: "Accumulating", color: GREEN, note: `Conviction building (${signed(accel)} vs prior cycle)${trend}` };
  if (dir === "bearish")
    return { label: "Reducing · Defensive", color: RED, note: `Flows rotating away from exposed names${trend}` };
  if (mom === "cooling" || mom === "reversing")
    return { label: "Distributing", color: AMBER, note: `Momentum fading; positioning unwinding${trend}` };
  return { label: "Building · Watching", color: SLATE, note: `Positioning forming; no decisive tilt yet${trend}` };
}

function competingThemes(center: ThemeIntelligence, themes: ThemeIntelligence[]): ThemeIntelligence[] {
  const sec = deriveSector(center), drv = deriveDriver(center);
  return themes
    .filter(t => t.id !== center.id && (deriveSector(t) === sec || deriveDriver(t) === drv))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 4);
}

function storiesForTheme(theme: ThemeIntelligence, clusters: StoryCluster[]): StoryCluster[] {
  const ids = new Set(theme.contributing_cluster_ids ?? []);
  const direct = clusters.filter(c => ids.has(c.id));
  if (direct.length) return direct;
  const kw = [cleanThemeName(theme.name), ...(theme.related_industries ?? []), ...(theme.related_macro_factors ?? [])]
    .flatMap(s => s.toLowerCase().split(/\W+/).filter(w => w.length >= 5));
  return clusters.filter(c => {
    const hay = [c.primary.title, ...(c.primary.affected_entities ?? [])].join(" ").toLowerCase();
    return kw.some(k => hay.includes(k));
  });
}

export function IntelligenceWorkspace({ focus, themes, clusters, isLoading }: Props) {
  // Resolve the centerpiece theme: the lead theme behind the selected node, or —
  // in Global mode — the market-leading theme so the workspace is always live.
  const centerpiece = useMemo(() => {
    const byConf = (a: ThemeIntelligence, b: ThemeIntelligence) => (b.confidence ?? 0) - (a.confidence ?? 0);
    if (focus) {
      const ft = focusedThemes(focus, themes).slice().sort(byConf);
      if (ft.length) return ft[0];
    }
    return themes.slice().sort(byConf)[0] ?? null;
  }, [focus, themes]);

  const m = useMemo(() => {
    if (!centerpiece) return null;
    const t = centerpiece;
    const stories = storiesForTheme(t, clusters).slice(0, 5);
    const best = bestExpressions(t);
    const losers = themeLosers(t, 3);
    const cases = generateBullBearCases(t);
    const cats = generateNextCatalysts(t);
    const catalyst = cats.find(c => c.direction === "confirming" && c.imminent) ?? cats.find(c => c.direction === "confirming") ?? cats[0] ?? null;
    return {
      name:      cleanThemeName(t.name),
      dir:       dirOf(t),
      health:    computeThemeHealth(t),
      iScore:    computeIntelligenceScore(t),
      driver:    deriveDriver(t),
      sector:    deriveSector(t),
      pressure:  marketPressure(t, stories),
      pos:       positioning(t),
      beneficiaries: themeBeneficiaries(t, 6),
      best, losers, cases, catalyst,
      evidence:  generateEvidenceItems(t).filter(e => e.type === "positive").slice(0, 4),
      watch:     themeWatch(t),
      competing: competingThemes(t, themes),
      related:   [...new Set([...themeBeneficiaries(t, 6), ...(t.memory?.historical_tickers ?? [])])].slice(0, 10),
      stories,
      transmission: [
        { label: "Driver", value: deriveDriver(t) },
        { label: "Theme",  value: cleanThemeName(t.name) },
        { label: "Sector", value: deriveSector(t) ?? "—" },
        { label: "Assets", value: themeBeneficiaries(t, 3).join(" · ") || "—" },
      ],
    };
  }, [centerpiece, themes, clusters]);

  if (isLoading) return <WorkspaceSkeleton />;
  if (!centerpiece || !m) return null;

  const dc = dirColor(m.dir);
  const t = centerpiece;
  const contextLabel = focus && focus.kind !== "theme" ? `${focusKindLabel(focus.kind)} · ${focus.label}` : focus ? "Selected theme" : "Market-leading theme";
  // Context tokens shared by everything in this workspace — hovering any chip
  // lights the matching theme/sector/driver/company across the whole page.
  const ctx: (string | null)[] = [m.name, m.sector, m.driver];
  // Confidence halo, data-bound: brighter with conviction, faster with momentum.
  const conf = t.confidence ?? 0;
  const haloDur = t.momentum_label === "accelerating" ? 2.6 : t.momentum_label === "strengthening" ? 3.1
    : t.momentum_label === "emerging" ? 3.6 : (t.momentum_label === "cooling" || t.momentum_label === "reversing") ? 5.4 : 4.3;
  const haloAlpha = Math.round((0.10 + (conf / 100) * 0.30) * 255).toString(16).padStart(2, "0");

  return (
    <section className="mb-9">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.62)" }}>Intelligence Workspace</span>
        <span className="text-[9px] font-medium hidden sm:inline" style={{ color: "rgba(255,255,255,0.36)" }}>the selected node, decoded</span>
        <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, rgba(255,255,255,0.09), transparent)" }} />
        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
          style={{ color: CYAN, background: "rgba(82,176,200,0.12)" }}>{contextLabel}</span>
      </div>

      {/* The workspace re-mounts (cross-fades) whenever the centerpiece changes. */}
      <motion.div
        key={t.id}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 0, 0.36, 1] }}
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "linear-gradient(180deg, rgba(18,26,42,0.55), rgba(8,12,20,0.85))" }}
      >
        {/* Centerpiece header */}
        <div className="relative px-5 pt-4 pb-4 border-b overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at left top, ${dc}10 0%, transparent 55%)` }} />
          {/* Conviction halo around the confidence number — strengthens & quickens with momentum */}
          <div aria-hidden className="tg-halo absolute -top-12 -right-10 w-52 h-52 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${dc}${haloAlpha} 0%, transparent 70%)`, animationDuration: `${haloDur}s` }} />
          <div className="relative flex items-start gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: dc, boxShadow: `0 0 10px ${dc}` }} />
                <span className="text-[8px] font-bold uppercase tracking-[0.16em]" style={{ color: dc }}>
                  {m.dir === "bullish" ? "Risk-On" : m.dir === "bearish" ? "Risk-Off" : "Two-Way"}
                </span>
                <span className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ color: m.health.color, background: `${m.health.color}1a` }}>{m.health.label}</span>
              </div>
              <h2 className="text-[22px] sm:text-[26px] font-black uppercase leading-none tracking-tight truncate" style={{ color: "rgba(255,255,255,0.97)" }}>{m.name}</h2>
              <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.42)" }}>
                {m.driver}{m.sector ? <span> → <span style={{ color: "rgba(255,255,255,0.6)" }}>{m.sector}</span></span> : null} · {m.iScore.label}
              </p>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className="text-[30px] font-black tabular-nums leading-none" style={{ color: confColor(t.confidence ?? 0) }}>{Math.round(t.confidence ?? 0)}</span>
              <span className="text-[7.5px] font-bold uppercase tracking-wider mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{t.confidence_label || "Conviction"}</span>
            </div>
          </div>

          {/* Metrics strip */}
          <div className="relative grid grid-cols-3 sm:grid-cols-6 gap-px mt-4 rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
            <Metric label="Confidence"  value={Math.round(t.confidence ?? 0)} color={confColor(t.confidence ?? 0)} bar />
            <Metric label="Momentum"    text={t.momentum_label} color={dc} arrow={m.dir} />
            <Metric label="Breadth"     value={Math.round(t.breadth_score ?? 0)} color={scale(t.breadth_score ?? 0)} bar />
            <Metric label="Acceleration" text={signed(t.momentum_delta ?? 0)} color={(t.momentum_delta ?? 0) >= 0 ? GREEN : RED} />
            <Metric label="Mkt Pressure" value={m.pressure} color={scale(m.pressure)} bar />
            <Metric label="Persistence" value={Math.round(t.persistence_score ?? 0)} color={scale(t.persistence_score ?? 0)} bar />
          </div>
        </div>

        {/* Panel grid */}
        <div className="grid lg:grid-cols-3 gap-px" style={{ background: "rgba(255,255,255,0.05)" }}>
          {/* Institutional Positioning */}
          <Panel title="Institutional Positioning">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[13px] font-bold" style={{ color: m.pos.color }}>{m.pos.label}</span>
            </div>
            <p className="text-[10.5px] leading-snug" style={{ color: "rgba(255,255,255,0.55)" }}>{m.pos.note}</p>
          </Panel>

          {/* Capital Destination */}
          <Panel title="Capital Destination">
            <p className="text-[10.5px] leading-snug mb-2" style={{ color: "rgba(255,255,255,0.62)" }}>
              {m.sector ? <>Flowing into <Beam tokens={[m.sector, m.name, m.driver]}><b style={{ color: "rgba(255,255,255,0.85)" }}>{m.sector}</b></Beam></> : "Destination forming"}
            </p>
            <TickerChips tickers={m.best?.tickers ?? m.beneficiaries.slice(0, 4)} color={CYAN} context={ctx} />
            {m.best?.why && <p className="text-[9.5px] leading-snug mt-2" style={{ color: "rgba(255,255,255,0.42)" }}>{m.best.why}</p>}
          </Panel>

          {/* Next Confirmation Event */}
          <Panel title="Next Confirmation Event">
            {m.catalyst ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[12px] font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>{m.catalyst.label}</span>
                  <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ml-auto shrink-0" style={{ color: m.catalyst.imminent ? AMBER : CYAN, background: m.catalyst.imminent ? "rgba(251,191,36,0.14)" : "rgba(82,176,200,0.12)" }}>{m.catalyst.dateLabel}</span>
                </div>
                <p className="text-[9.5px] leading-snug" style={{ color: "rgba(255,255,255,0.5)" }}>{m.catalyst.reason}</p>
                <p className="text-[8.5px] mt-1.5" style={{ color: "rgba(255,255,255,0.36)" }}>{m.catalyst.sensitivity} sensitivity · in {m.catalyst.daysAway}d</p>
              </>
            ) : (
              <p className="text-[10.5px] leading-snug" style={{ color: "rgba(255,255,255,0.5)" }}>Watch {m.watch}.</p>
            )}
          </Panel>

          {/* Primary Beneficiaries */}
          <Panel title="Primary Beneficiaries">
            <TickerChips tickers={m.beneficiaries} color={GREEN} context={ctx} />
            {m.cases?.bull && <p className="text-[9.5px] leading-snug mt-2" style={{ color: "rgba(255,255,255,0.48)" }}>{m.cases.bull}</p>}
          </Panel>

          {/* Primary Risks */}
          <Panel title="Primary Risks">
            {m.losers ? (
              <>
                <Beam tokens={[m.losers.sector, m.name, m.driver]} className="text-[10px] font-semibold mb-1.5 inline-block" style={{ color: RED }}>{m.losers.sector}</Beam>
                <TickerChips tickers={m.losers.tickers} color={RED} context={[m.losers.sector, m.name, m.driver]} />
                <p className="text-[9.5px] leading-snug mt-2" style={{ color: "rgba(255,255,255,0.48)" }}>{m.losers.risk}</p>
              </>
            ) : (
              <p className="text-[9.5px] leading-snug" style={{ color: "rgba(255,255,255,0.5)" }}>{m.cases?.bear ?? "Risk concentrates if the macro driver reverses."}</p>
            )}
          </Panel>

          {/* Recent Confirmations */}
          <Panel title="Recent Confirmations">
            {t.memory && (t.memory.confirmations_today > 0 || t.memory.confirming_total > 0) && (
              <p className="text-[9.5px] mb-1.5" style={{ color: GREEN }}>
                {t.memory.confirmations_today > 0 ? `${t.memory.confirmations_today} new today · ` : ""}{t.memory.confirming_total} total confirming
              </p>
            )}
            <ul className="space-y-1">
              {m.evidence.length ? m.evidence.map((e, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[9.5px] leading-snug" style={{ color: "rgba(255,255,255,0.55)" }}>
                  <span className="shrink-0 mt-0.5" style={{ color: GREEN }}>✓</span>{e.label}
                </li>
              )) : <li className="text-[9.5px]" style={{ color: "rgba(255,255,255,0.4)" }}>Awaiting independent confirmation.</li>}
            </ul>
          </Panel>

          {/* Competing Themes */}
          <Panel title="Competing Themes">
            {m.competing.length ? (
              <div className="space-y-1.5">
                {m.competing.map(c => (
                  <Beam key={c.id} tokens={[cleanThemeName(c.name)]} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dirColor(dirOf(c)) }} />
                    <span className="text-[10.5px] font-medium truncate" style={{ color: "rgba(255,255,255,0.7)" }}>{cleanThemeName(c.name)}</span>
                    <span className="text-[9.5px] font-bold tabular-nums ml-auto shrink-0" style={{ color: confColor(c.confidence ?? 0) }}>{Math.round(c.confidence ?? 0)}</span>
                  </Beam>
                ))}
              </div>
            ) : <p className="text-[9.5px]" style={{ color: "rgba(255,255,255,0.4)" }}>No directly competing narratives.</p>}
          </Panel>

          {/* Related Companies */}
          <Panel title="Related Companies">
            <TickerChips tickers={m.related} color={SLATE} context={ctx} />
          </Panel>

          {/* Transmission Timeline */}
          <Panel title="Transmission Timeline">
            <div className="space-y-2">
              {m.transmission.map((s, i) => (
                <div key={s.label} className="flex items-start gap-2">
                  <div className="flex flex-col items-center shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: i === 1 ? dc : "rgba(255,255,255,0.4)" }} />
                    {i < m.transmission.length - 1 && <span className="w-px h-4" style={{ background: "rgba(255,255,255,0.12)" }} />}
                  </div>
                  <div className="min-w-0 -mt-0.5">
                    <span className="text-[7.5px] font-bold uppercase tracking-wider block" style={{ color: "rgba(255,255,255,0.34)" }}>{s.label}</span>
                    <Beam tokens={[s.value, m.name, m.sector, m.driver]} className="text-[10.5px] font-semibold inline-block" style={{ color: i === 1 ? dc : "rgba(255,255,255,0.72)" }}>{s.value}</Beam>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Recent supporting stories — full width footer */}
        <div className="px-5 py-3.5 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <p className="text-[7.5px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: "rgba(255,255,255,0.34)" }}>Recent Supporting Stories</p>
          {m.stories.length ? (
            <div className="space-y-1.5">
              {m.stories.map(c => (
                <Beam key={c.id} tokens={[...ctx, ...(c.primary.affected_entities ?? [])]} className="w-full flex items-center gap-2.5 text-left">
                  <button onClick={() => { const el = document.querySelector(`[data-cluster-id="${c.id}"]`); el?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                    className="w-full flex items-center gap-2.5 text-left group">
                    <span className="w-1 h-1 rounded-full shrink-0" style={{ background: dc, opacity: 0.6 }} />
                    <span className="text-[11px] leading-snug truncate flex-1 transition-colors group-hover:text-white" style={{ color: "rgba(255,255,255,0.66)" }}>{c.primary.title}</span>
                    <span className="text-[8.5px] tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.34)" }}>{c.primary.source} · {timeAgo(c.primary.published)}</span>
                  </button>
                </Beam>
              ))}
            </div>
          ) : <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>No supporting stories in the current stream yet.</p>}
        </div>
      </motion.div>
    </section>
  );
}

// ── Building blocks ───────────────────────────────────────────────────────────
function Metric({ label, value, text, color, bar, arrow }: {
  label: string; value?: number; text?: string; color: string; bar?: boolean; arrow?: string;
}) {
  return (
    <div className="px-2.5 py-2" style={{ background: "rgba(10,15,28,0.92)" }}>
      <div className="flex items-baseline gap-1">
        <span className="text-[15px] font-black tabular-nums leading-none capitalize" style={{ color }}>
          {arrow ? (arrow === "bullish" ? "▲ " : arrow === "bearish" ? "▼ " : "● ") : ""}{text ?? value}
        </span>
      </div>
      {bar && value !== undefined && (
        <div className="relative h-[2px] rounded-full overflow-hidden mt-1" style={{ background: "rgba(255,255,255,0.07)" }}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, value))}%`, background: color }} />
          {/* Live sheen — the signal is being continuously recomputed (strong bars only) */}
          {value >= 55 && <div aria-hidden className="tg-sheen absolute inset-y-0 left-0 w-1/3" style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.4), transparent)" }} />}
        </div>
      )}
      <span className="text-[7.5px] font-bold uppercase tracking-wider block mt-1" style={{ color: "rgba(255,255,255,0.36)" }}>{label}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3" style={{ background: "rgba(10,15,28,0.92)" }}>
      <p className="text-[7.5px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: "rgba(255,255,255,0.34)" }}>{title}</p>
      {children}
    </div>
  );
}

function TickerChips({ tickers, color, context = [] }: { tickers: string[]; color: string; context?: (string | null)[] }) {
  if (!tickers.length) return <span className="text-[9.5px]" style={{ color: "rgba(255,255,255,0.4)" }}>—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tickers.map(tk => (
        <Beam key={tk} tokens={[tk, ...context]} className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ color, background: `${color}14`, border: `1px solid ${color}22` }}>{tk}</Beam>
      ))}
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <section className="mb-9">
      <div className="h-2.5 w-40 rounded animate-pulse mb-3" style={{ background: "rgba(255,255,255,0.06)" }} />
      <div className="rounded-2xl border overflow-hidden animate-pulse" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(12,18,32,0.6)" }}>
        <div className="px-5 pt-4 pb-4 border-b space-y-3" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="h-7 w-1/2 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="grid grid-cols-6 gap-px h-12 rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
        <div className="grid lg:grid-cols-3 gap-px" style={{ background: "rgba(255,255,255,0.05)" }}>
          {[...Array(6)].map((_, i) => <div key={i} className="h-24" style={{ background: "rgba(10,15,28,0.92)" }} />)}
        </div>
      </div>
    </section>
  );
}
