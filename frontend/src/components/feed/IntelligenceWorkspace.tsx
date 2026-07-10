"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  generateBullBearCases,
  generateInvalidationSignals, themeBeneficiaries, explainMechanism,
} from "@/lib/themeIntelligence";
import { buildRiskRead } from "@/lib/riskRead";
import { deriveDriver, deriveSector, dirOf, themeWatch } from "@/lib/themeTransmission";
import { focusedThemes, focusKindLabel, type FeedFocus } from "@/lib/feedFocus";
import { Beam } from "@/lib/feedHighlight";
import { TickerChip } from "@/components/common/TickerChip";
import { EntityChip } from "@/components/common/EntityChip";
import { themeEntity, sectorEntity, tickerEntity, useRegisterEntities, type EntityInfo } from "@/lib/entity";
import { cleanThemeName, confColor } from "@/app/markets/marketsShared";
import { timeAgo } from "@/lib/utils";
import type { ThemeIntelligence, StoryCluster } from "@/lib/types";

/**
 * IntelligenceWorkspace, the selected theme, read the way a strategist would
 * think about it, NOT a wall of dashboard widgets. Every theme immediately answers
 * five questions in priority order:
 *
 *   1. What changed?      2. Why does it matter?   3. Who benefits?
 *   4. Who is hurt?       5. What should I watch next?
 *
 * Beneficiaries, risks, the transmission path, catalysts and supporting stories
 * are demoted to SUPPORT the read rather than compete for attention. The only
 * surviving "metric" is conviction (+ momentum), because it changes the decision.
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

function firstSentence(text?: string | null): string | null {
  if (!text) return null;
  const clean = text.replace(/→/g, ", ").replace(/ {2,}/g, " ").trim();
  const dot = clean.indexOf(". ");
  return dot > 12 ? clean.slice(0, dot + 1) : clean.length <= 180 ? clean : null;
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

// ── The reasoning: five answers + the evidence that supports them ─────────────
function buildReasoning(theme: ThemeIntelligence, clusters: StoryCluster[]) {
  const dir = dirOf(theme);
  const name = cleanThemeName(theme.name);
  const driver = deriveDriver(theme);
  const sector = deriveSector(theme);
  const stories = storiesForTheme(theme, clusters).slice(0, 4);
  // P2.5 (D11): recorded exposure only - the curated securities dictionary
  // (bestExpressions/themeLosers winWhy/loseWhy) is deleted.
  const beneficiaries = themeBeneficiaries(theme, 6);
  const negSectors = (theme.related_industries ?? []).filter(s => theme.relationship_weights?.[s]?.direction === "negative");
  const cases = generateBullBearCases(theme);
  // Phase 2.4: catalyst and invalidation are the shared per-entity risk read
  // (verified dateless catalysts + the prediction engine's condition - the
  // same records Explorer shows). The keyword-template invalidation survives
  // only as the graphless fallback; dated catalysts are gone entirely.
  const shared = buildRiskRead(theme.name, theme);
  const hasShared = shared.basis === "graph";
  const catalyst = hasShared ? (shared.catalysts[0] ?? null) : null;
  const invalidation = hasShared
    ? shared.invalidation
    : (generateInvalidationSignals(theme)[0]?.condition ?? null);
  const mem = theme.memory;

  // 1, What changed?
  let whatChanged: string;
  if (mem && mem.conviction_window_start !== mem.conviction_current) {
    const verb = mem.conviction_current > mem.conviction_window_start ? "strengthened" : "softened";
    whatChanged = `Conviction has ${verb} from ${mem.conviction_window_start} to ${mem.conviction_current} across ${mem.sessions_observed} sessions`;
  } else if (theme.momentum_label === "accelerating") {
    whatChanged = `Momentum has entered an acceleration phase${(theme.momentum_delta ?? 0) > 0 ? ` (+${Math.round(theme.momentum_delta ?? 0)} vs prior cycle)` : ""}`;
  } else if (theme.momentum_label === "reversing") {
    whatChanged = `${name} has begun to reverse, a positioning event rather than a consolidation`;
  } else if (theme.momentum_label === "emerging") {
    whatChanged = `${name} is newly emerging as a distinct, tradable narrative`;
  } else {
    whatChanged = `${name} is ${theme.momentum_label}, holding ${dir === "bullish" ? "a constructive bias" : dir === "bearish" ? "downside pressure" : "a two-way tape"}`;
  }
  if (mem && mem.confirmations_today > 0) whatChanged += `, with ${mem.confirmations_today} fresh confirmation${mem.confirmations_today > 1 ? "s" : ""} today`;
  else if (stories[0]) whatChanged += `; the latest read: “${stories[0].primary.title}”`;
  whatChanged += ".";

  // 2, Why does it matter?
  const whyMatters = explainMechanism(theme)
    || firstSentence(theme.causal_narrative)
    || `${driver} is transmitting into ${sector ?? "the broader tape"}; ${dir === "bearish" ? "that pressures" : "that rewards"} the names with the most direct exposure, and the move tends to spread before it is fully priced.`;

  // 3, Who benefits? (recorded exposure; stored-field re-voice as fallback)
  const benefitsText = cases.bull
    || `Most direct recorded exposure sits with ${beneficiaries.slice(0, 2).join(" and ") || `the leaders in ${sector ?? "the theme's core sector"}`}.`;

  // 4, Who is hurt? Recorded negative-weight sectors only - never dictionary risk prose.
  const hurt = negSectors.length > 0
    ? { text: `Recorded negative exposure: ${negSectors.slice(0, 2).join(", ")} (pipeline relationship weights).`, tickers: [] as string[], label: negSectors[0] as string | null }
    : cases.bear
    ? { text: cases.bear, tickers: [] as string[], label: null as string | null }
    : null;

  return {
    name, dir, driver, sector, stories, beneficiaries, catalyst, invalidation,
    benefitsTickers: beneficiaries.slice(0, 4),
    whatChanged, whyMatters, benefitsText, hurt,
    watch: themeWatch(theme),
    transmission: [
      driver ? { kind: "macro" as const, label: driver } : null,
      { kind: "theme" as const, label: name },
      sector ? { kind: "sector" as const, label: sector } : null,
      beneficiaries.length ? { kind: "raw" as const, label: beneficiaries.slice(0, 3).join(" · ") } : null,
    ].filter(Boolean) as { kind: "macro" | "theme" | "sector" | "raw"; label: string }[],
    ctx: [name, sector, driver] as (string | null)[],
  };
}

export function IntelligenceWorkspace({ focus, themes, clusters, isLoading }: Props) {
  const centerpiece = useMemo(() => {
    const byConf = (a: ThemeIntelligence, b: ThemeIntelligence) => (b.confidence ?? 0) - (a.confidence ?? 0);
    if (focus) { const ft = focusedThemes(focus, themes).slice().sort(byConf); if (ft.length) return ft[0]; }
    return themes.slice().sort(byConf)[0] ?? null;
  }, [focus, themes]);

  const r = useMemo(() => (centerpiece ? buildReasoning(centerpiece, clusters) : null), [centerpiece, clusters]);

  // Register the themes + derived sectors as entities, so any EntityChip on the
  // page (here or future sections) resolves their hover read automatically.
  const entities = useMemo<EntityInfo[]>(() => {
    const out: EntityInfo[] = [];
    const bySector = new Map<string, ThemeIntelligence[]>();
    const byTicker = new Map<string, ThemeIntelligence[]>();
    for (const th of themes) {
      out.push(themeEntity(cleanThemeName(th.name), {
        confidence: th.confidence, momentum: th.momentum_label,
        beneficiaries: themeBeneficiaries(th, 3), primarySector: deriveSector(th) ?? undefined,
      }));
      const sec = deriveSector(th);
      if (sec) { const arr = bySector.get(sec) ?? []; arr.push(th); bySector.set(sec, arr); }
      for (const tk of themeBeneficiaries(th, 5)) { const arr = byTicker.get(tk) ?? []; arr.push(th); byTicker.set(tk, arr); }
    }
    for (const [sec, ths] of bySector) {
      const sorted = [...ths].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
      out.push(sectorEntity(sec, {
        conviction: sorted.reduce((s, t) => s + (t.confidence ?? 0), 0) / sorted.length,
        leadingThemes: sorted.slice(0, 2).map(t => cleanThemeName(t.name)),
        topCompanies: [...new Set(sorted.flatMap(t => themeBeneficiaries(t, 3)))].slice(0, 4),
      }));
    }
    for (const [tk, ths] of byTicker) {
      const sorted = [...ths].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
      out.push(tickerEntity(tk, {
        exposureTheme: cleanThemeName(sorted[0].name),
        conviction: sorted[0].confidence,
        relatedThemes: sorted.slice(1, 4).map(t => cleanThemeName(t.name)),
      }));
    }
    return out;
  }, [themes]);
  useRegisterEntities(entities);

  if (isLoading) return <WorkspaceSkeleton />;
  if (!centerpiece || !r) return null;

  const t = centerpiece;
  const dc = dirColor(r.dir);
  const conf = Math.round(t.confidence ?? 0);
  const contextLabel = focus && focus.kind !== "theme" ? `${focusKindLabel(focus.kind)} · ${focus.label}` : focus ? "Selected theme" : "Market-leading theme";
  const stateWord = r.dir === "bullish" ? "Risk-On" : r.dir === "bearish" ? "Risk-Off" : "Two-Way";
  const haloDur = t.momentum_label === "accelerating" ? 2.6 : t.momentum_label === "emerging" ? 3.6 : (t.momentum_label === "cooling" || t.momentum_label === "reversing") ? 5.4 : 4.3;
  const haloAlpha = Math.round((0.10 + (conf / 100) * 0.30) * 255).toString(16).padStart(2, "0");
  const mem = t.memory;

  return (
    <section className="mb-12">
      {/* Eyebrow */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.5)" }}>Strategist&apos;s Read</span>
        <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, rgba(255,255,255,0.10), transparent)" }} />
        <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: CYAN }}>{contextLabel}</span>
      </div>

      {/* The read flows as an article, no box; depth comes from light + spacing. */}
      <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 0, 0.36, 1] }} className="relative">
        <div aria-hidden className="tg-halo absolute -top-20 -left-16 w-80 h-80 rounded-full pointer-events-none -z-10"
          style={{ background: `radial-gradient(circle, ${dc}${haloAlpha} 0%, transparent 70%)`, animationDuration: `${haloDur}s` }} />

        {/* Masthead, headline + conviction, no container */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full" style={{ background: dc, boxShadow: `0 0 10px ${dc}` }} />
              <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: dc }}>{stateWord}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.45)" }}>· {t.momentum_label}</span>
            </div>
            <h2 className="text-[22px] sm:text-[28px] font-black uppercase leading-[0.95] tracking-[-0.01em]" style={{ color: "rgba(255,255,255,0.96)" }}>{r.name}</h2>
          </div>
          <div className="flex items-baseline gap-2 shrink-0">
            <CountUp value={conf} className="text-[30px] font-black tabular-nums leading-none" style={{ color: confColor(conf), transition: "color 500ms ease" }} />
            <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>{t.confidence_label || "Conviction"}</span>
          </div>
        </div>

        {/* fading hairline, a rule, not a box */}
        <div className="h-px mt-5 mb-7" style={{ background: "linear-gradient(to right, rgba(255,255,255,0.16), rgba(255,255,255,0.04) 55%, transparent)" }} />

        {/* The five questions, flowing sections separated by air, cascade on change */}
        <motion.div key={t.id} initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.07 } } }} className="space-y-8">

          {/* 1, What changed? (the lead, largest type) */}
          <Section n="01" label="What changed">
            <p className="text-[16px] sm:text-[17px] leading-[1.55] font-light" style={{ color: "rgba(255,255,255,0.9)" }}>{r.whatChanged}</p>
            {mem && mem.conviction_window_start !== mem.conviction_current && (
              <div className="flex items-center gap-1.5 mt-3 text-[11px] tabular-nums" style={{ color: "rgba(255,255,255,0.5)" }}>
                <span className="uppercase tracking-wide text-[8px] font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>conviction</span>
                <span className="font-bold" style={{ color: "rgba(255,255,255,0.62)" }}>{mem.conviction_window_start}</span>
                <span style={{ color: dc }}>→</span>
                <span className="font-black text-[13px]" style={{ color: confColor(mem.conviction_current) }}>{mem.conviction_current}</span>
                <span className="ml-1 text-[8.5px] font-bold uppercase" style={{ color: dc }}>{mem.conviction_trend}</span>
              </div>
            )}
          </Section>

          {/* 2, Why does it matter? */}
          <Section n="02" label="Why it matters">
            <p className="text-[14px] leading-[1.6] font-light" style={{ color: "rgba(255,255,255,0.8)" }}>{r.whyMatters}</p>
            <div className="flex items-center gap-2 flex-wrap mt-3.5">
              {r.transmission.map((node, i) => (
                <span key={node.label} className="flex items-center gap-2">
                  {i > 0 && <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.24)" }}>→</span>}
                  {node.kind === "raw" ? (
                    <Beam tokens={[node.label, ...r.ctx]} className="text-[10px] font-semibold tracking-wide inline-block" style={{ color: "rgba(255,255,255,0.6)" }}>{node.label}</Beam>
                  ) : (
                    <Beam tokens={[node.label, ...r.ctx]}>
                      <EntityChip kind={node.kind} label={node.label} mono={false} className="text-[10px] font-semibold tracking-wide inline-block"
                        style={{ color: node.kind === "theme" ? dc : "rgba(255,255,255,0.6)" }} />
                    </Beam>
                  )}
                </span>
              ))}
            </div>
          </Section>

          {/* 3 + 4, Who benefits / Who is hurt, two columns, thin accent rules only */}
          <motion.div variants={CELL} className="grid md:grid-cols-2 gap-x-10 gap-y-7">
            <div className="pl-4" style={{ borderLeft: `2px solid ${GREEN}` }}>
              <SecLabel n="03" label="Who benefits" color={GREEN} />
              <div className="mt-2"><TickerChips tickers={r.benefitsTickers} color={GREEN} context={r.ctx} /></div>
              <p className="text-[12px] leading-[1.6] font-light mt-2.5" style={{ color: "rgba(255,255,255,0.6)" }}>{r.benefitsText}</p>
            </div>
            <div className="pl-4" style={{ borderLeft: `2px solid ${r.hurt ? RED : "rgba(255,255,255,0.12)"}` }}>
              <SecLabel n="04" label="Who is hurt" color={r.hurt ? RED : SLATE} />
              {r.hurt ? (
                <>
                  {r.hurt.label && <Beam tokens={[r.hurt.label, ...r.ctx]} className="text-[10.5px] font-semibold mt-2 mb-1.5 inline-block" style={{ color: RED }}>{r.hurt.label}</Beam>}
                  {r.hurt.tickers.length > 0 && <TickerChips tickers={r.hurt.tickers} color={RED} context={r.ctx} />}
                  <p className="text-[12px] leading-[1.6] font-light mt-2.5" style={{ color: "rgba(255,255,255,0.6)" }}>{r.hurt.text}</p>
                </>
              ) : (
                <p className="text-[12px] leading-[1.6] font-light mt-2.5" style={{ color: "rgba(255,255,255,0.5)" }}>No clearly exposed losers, the risk is crowding into the same beneficiaries, which leaves the trade vulnerable to a reversal in {r.driver.toLowerCase()}.</p>
              )}
            </div>
          </motion.div>

          {/* 5, What to watch next */}
          <Section n="05" label="What to watch next" color={CYAN}>
            <p className="text-[14px] leading-[1.6] font-light" style={{ color: "rgba(255,255,255,0.8)" }}>
              Watch <b className="font-semibold" style={{ color: "rgba(255,255,255,0.94)" }}>{r.watch}</b>.
            </p>
            <div className="flex flex-col gap-2 mt-3">
              {r.catalyst && (
                <div className="flex items-baseline gap-2.5 text-[11px]" title={r.catalyst.detail}>
                  <span className="text-[8px] font-bold uppercase tracking-wide shrink-0" style={{ color: AMBER }}>Verified · no date</span>
                  <span className="font-light" style={{ color: "rgba(255,255,255,0.58)" }}>{r.catalyst.label}, feeds {r.catalyst.feeds}</span>
                </div>
              )}
              {r.invalidation && (
                <div className="flex items-baseline gap-2.5 text-[11px]">
                  <span className="text-[8px] font-bold uppercase tracking-wide shrink-0" style={{ color: RED }}>Invalidates</span>
                  <span className="font-light" style={{ color: "rgba(255,255,255,0.48)" }}>{r.invalidation}</span>
                </div>
              )}
            </div>
          </Section>
        </motion.div>

        {/* Supporting evidence, quiet footnotes under a single hairline */}
        {r.stories.length > 0 && (
          <div className="mt-9 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-[8px] font-bold uppercase tracking-[0.18em] mb-2.5" style={{ color: "rgba(255,255,255,0.3)" }}>Supporting Evidence</p>
            <motion.div key={t.id} initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.05 } } }} className="space-y-1.5">
              {r.stories.map(c => (
                <motion.div key={c.id} variants={{ hidden: { opacity: 0, x: -6 }, visible: { opacity: 1, x: 0, transition: { duration: 0.28, ease: "easeOut" } } }}>
                  <Beam tokens={[...r.ctx, ...(c.primary.affected_entities ?? [])]} className="w-full flex items-center gap-2.5">
                    <button onClick={() => { const el = document.querySelector(`[data-cluster-id="${c.id}"]`); el?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                      className="w-full flex items-center gap-2.5 text-left group">
                      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: dc, opacity: 0.5 }} />
                      <span className="text-[11px] leading-snug truncate flex-1 transition-colors group-hover:text-white font-light" style={{ color: "rgba(255,255,255,0.55)" }}>{c.primary.title}</span>
                      <span className="text-[8px] tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>{c.primary.source} · {timeAgo(c.primary.published)}</span>
                    </button>
                  </Beam>
                </motion.div>
              ))}
            </motion.div>
          </div>
        )}
      </motion.article>
    </section>
  );
}

// ── Building blocks ───────────────────────────────────────────────────────────
const CELL = {
  hidden:  { opacity: 0, y: 7 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 0, 0.36, 1] } },
};

function SecLabel({ n, label, color }: { n: string; label: string; color: string }) {
  return (
    <div className="flex items-baseline gap-2.5 mb-1">
      <span className="text-[11px] font-black tabular-nums" style={{ color }}>{n}</span>
      <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.42)" }}>{label}</span>
    </div>
  );
}

function Section({ n, label, color, children }: { n: string; label: string; color?: string; children: React.ReactNode }) {
  return (
    <motion.div variants={CELL}>
      <SecLabel n={n} label={label} color={color ?? "rgba(255,255,255,0.3)"} />
      <div className="mt-2">{children}</div>
    </motion.div>
  );
}

function TickerChips({ tickers, color, context = [] }: { tickers: string[]; color: string; context?: (string | null)[] }) {
  if (!tickers.length) return <span className="text-[9.5px]" style={{ color: "rgba(255,255,255,0.4)" }}>-</span>;
  return (
    <div className="flex flex-wrap gap-x-2.5 gap-y-1">
      {tickers.map(tk => (
        <Beam key={tk} tokens={[tk, ...context]}>
          <TickerChip ticker={tk} color={color} size="md" className="tracking-wide" />
        </Beam>
      ))}
    </div>
  );
}

function CountUp({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const [disp, setDisp] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current, to = value, t0 = performance.now(), dur = 620;
    if (from === to) return;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setDisp(Math.round(from + (to - from) * e));
      if (p < 1) raf = requestAnimationFrame(tick); else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className} style={style}>{disp}</span>;
}

function WorkspaceSkeleton() {
  return (
    <section className="mb-9">
      <div className="h-2.5 w-40 rounded animate-pulse mb-3" style={{ background: "rgba(255,255,255,0.06)" }} />
      <div className="rounded-2xl border overflow-hidden animate-pulse" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(12,18,32,0.6)" }}>
        <div className="px-5 pt-4 pb-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="h-7 w-1/2 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="px-5 py-4 border-b space-y-2" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
            <div className="h-2 w-24 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
            <div className="h-3 w-full rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="h-3 w-3/4 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
          </div>
        ))}
      </div>
    </section>
  );
}
