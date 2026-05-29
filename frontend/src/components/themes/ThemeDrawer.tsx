"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { X, Bookmark, BookmarkCheck, ExternalLink, Headphones } from "lucide-react";
import type { ThemeIntelligence, StoryCluster, Episode } from "@/lib/types";
import { matchEpisodeThemes } from "@/lib/listenIntelligence";

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Color helpers ──────────────────────────────────────────────────────────────

const SIGNAL_COLOR: Record<string, string> = {
  strong: "#10B981",
  medium: "#F59E0B",
  weak:   "#6B7280",
};

function momentumColor(label: string): string {
  if (label === "accelerating" || label === "strengthening") return "#10B981";
  if (label === "cooling"      || label === "reversing")     return "#EF4444";
  if (label === "emerging")                                  return "#52b0c8";
  return "rgba(255,255,255,0.42)";
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-2"
        style={{ color: "rgba(255,255,255,0.28)" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

// ── Deal shape accepted by the drawer ─────────────────────────────────────────

export interface DrawerDeal {
  title?:    string;
  sector:    string;
  dealType:  string;
  entities?: string[];
  url?:      string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ThemeDrawerProps {
  theme:            ThemeIntelligence;
  clusters:         StoryCluster[];
  deals:            DrawerDeal[];
  episodes?:        Episode[];
  isWatched:        boolean;
  hasAlert:         boolean;
  alertDirection?:  "up" | "down";
  onToggleWatch:    () => void;
  onClose:          () => void;
  sourceContext?:   "listen";  // elevates Podcasts section when opened from Listen
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ThemeDrawer({
  theme, clusters, deals, episodes = [],
  isWatched, hasAlert, alertDirection,
  onToggleWatch, onClose, sourceContext,
}: ThemeDrawerProps) {

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sColor = SIGNAL_COLOR[theme.signal_strength] ?? "#6B7280";

  // Connected stories — clusters referenced by this theme
  const connectedClusters = clusters
    .filter(c => theme.contributing_cluster_ids.includes(c.id))
    .slice(0, 6);

  // Connected deals — sector or entity match
  const assetSet = new Set(theme.related_assets.map(a => a.toUpperCase()));
  const indTerms = theme.related_industries.map(i => i.toLowerCase());
  const connectedDeals = deals
    .filter(d => {
      const sec = d.sector.toLowerCase();
      return (
        indTerms.some(ind => sec.includes(ind) || ind.includes(sec)) ||
        (d.entities ?? []).some(e => assetSet.has(e.toUpperCase()))
      );
    })
    .slice(0, 5);

  // Connected podcasts — episodes that match this theme
  const connectedEpisodes = episodes
    .filter(ep => matchEpisodeThemes(ep, [theme], 1).length > 0)
    .slice(0, 5);

  // Top relationship weights
  const topRelationships = Object.entries(theme.relationship_weights ?? {})
    .sort(([, a], [, b]) => b.weight - a.weight)
    .slice(0, 5);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 34, stiffness: 290 }}
        className="relative flex flex-col overflow-y-auto"
        style={{
          width:      "min(480px, 100vw)",
          height:     "100vh",
          background: "#050c1e",
          borderLeft: "1px solid rgba(255,255,255,0.07)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Signal stripe */}
        <div className="h-[3px] shrink-0" style={{ background: sColor }} />

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="sticky top-0 z-10 px-5 py-4 flex items-start gap-3 shrink-0"
          style={{ background: "#050c1e", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span
                className="text-[9.5px] font-bold uppercase tracking-[0.13em] px-2 py-0.5 rounded-full"
                style={{
                  background: `${sColor}18`,
                  color:       sColor,
                  border:      `1px solid ${sColor}30`,
                }}
              >
                {theme.signal_strength}
              </span>
              {hasAlert && (
                <span
                  className="text-[9.5px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: alertDirection === "up" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                    color:      alertDirection === "up" ? "#10B981" : "#EF4444",
                    border:     `1px solid ${alertDirection === "up" ? "#10B981" : "#EF4444"}30`,
                  }}
                >
                  Signal {alertDirection === "up" ? "↑" : "↓"}
                </span>
              )}
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.30)" }}>
                {theme.confidence_label}
              </span>
            </div>
            <h2 className="text-[15px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.88)" }}>
              {theme.name}
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            <button
              onClick={onToggleWatch}
              className="p-2 rounded-lg transition-colors hover:bg-white/[0.05]"
              style={{ color: isWatched ? "#F59E0B" : "rgba(255,255,255,0.28)" }}
              title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
            >
              {isWatched ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-colors hover:bg-white/[0.05]"
              style={{ color: "rgba(255,255,255,0.28)" }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 px-5 py-5 space-y-5">

          {/* Description */}
          {theme.description && (
            <p className="text-[12.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.50)" }}>
              {theme.description}
            </p>
          )}

          {/* Podcasts — hoisted here when opened from Listen */}
          {sourceContext === "listen" && connectedEpisodes.length > 0 && (
            <Section title={`Podcasts · ${connectedEpisodes.length}`}>
              <div className="space-y-3">
                {connectedEpisodes.map(ep => (
                  <div key={ep.id} className="flex items-start gap-2.5">
                    <div
                      className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
                      style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.14)" }}
                    >
                      <Headphones size={11} style={{ color: "rgba(16,185,129,0.70)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] leading-snug line-clamp-2"
                        style={{ color: "rgba(255,255,255,0.72)" }}>
                        {ep.title}
                      </p>
                      <p className="text-[10px] mt-0.5 flex items-center gap-1.5"
                        style={{ color: "rgba(255,255,255,0.30)" }}>
                        <span>{ep.show_name}</span>
                        {ep.duration_seconds > 0 && (
                          <><span style={{ color: "rgba(255,255,255,0.16)" }}>·</span>
                          <span>{fmtDur(ep.duration_seconds)}</span></>
                        )}
                      </p>
                    </div>
                    {ep.external_url && (
                      <a
                        href={ep.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-1.5 rounded-lg transition-colors hover:bg-white/[0.05]"
                        style={{ color: "rgba(16,185,129,0.60)" }}
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Causal narrative */}
          {theme.causal_narrative && (
            <div
              className="rounded-xl p-4"
              style={{ background: "rgba(82,176,200,0.05)", border: "1px solid rgba(82,176,200,0.12)" }}
            >
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-2"
                style={{ color: "rgba(82,176,200,0.55)" }}>
                Causal Narrative
              </p>
              <p className="text-[12.5px] leading-relaxed italic" style={{ color: "rgba(255,255,255,0.70)" }}>
                {theme.causal_narrative}
              </p>
            </div>
          )}

          {/* Signal metrics */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Persistence", value: String(theme.persistence_score ?? 0), unit: "/100" },
              { label: "Breadth",     value: String(theme.breadth_score ?? 0),      unit: "/100" },
              { label: "Evidence",    value: String(theme.evidence_count ?? 0),     unit: " sources" },
            ].map(m => (
              <div
                key={m.label}
                className="rounded-lg p-3 text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                <p className="text-[9px] font-bold uppercase tracking-[0.10em] mb-1"
                  style={{ color: "rgba(255,255,255,0.26)" }}>{m.label}</p>
                <p className="text-[17px] font-bold tabular-nums leading-tight"
                  style={{ color: "rgba(255,255,255,0.82)" }}>
                  {m.value}
                  <span className="text-[9px] font-normal" style={{ color: "rgba(255,255,255,0.26)" }}>
                    {m.unit}
                  </span>
                </p>
              </div>
            ))}
          </div>

          {/* Momentum row */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "rgba(255,255,255,0.28)" }}>Momentum</span>
            <span className="text-[11px] font-semibold capitalize"
              style={{ color: momentumColor(theme.momentum_label) }}>
              {theme.momentum_label}
            </span>
            {theme.momentum_delta !== 0 && (
              <span className="text-[10px] font-mono"
                style={{ color: theme.momentum_delta > 0 ? "#10B981" : "#EF4444" }}>
                {theme.momentum_delta > 0 ? "+" : ""}{theme.momentum_delta.toFixed(0)}
              </span>
            )}
            <span style={{ color: "rgba(255,255,255,0.18)" }}>·</span>
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>
              {theme.persistence_cycles} cycle{theme.persistence_cycles !== 1 ? "s" : ""}
            </span>
            {theme.cross_category_confirmed && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: "rgba(16,185,129,0.10)", color: "#10B981" }}
              >
                Cross-confirmed
              </span>
            )}
          </div>

          {/* Second order effects */}
          {(theme.second_order_effects ?? []).length > 0 && (
            <Section title="Second Order Effects">
              <ul className="space-y-1.5">
                {theme.second_order_effects.map((effect, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px]"
                    style={{ color: "rgba(255,255,255,0.52)" }}>
                    <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full"
                      style={{ background: "rgba(82,176,200,0.55)" }} />
                    {effect}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Connected stories */}
          {connectedClusters.length > 0 && (
            <Section title={`Stories · ${connectedClusters.length}`}>
              <div className="space-y-2">
                {connectedClusters.map(c => (
                  <a
                    key={c.id}
                    href={c.primary.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2.5 group"
                  >
                    <span
                      className="mt-0.5 shrink-0 text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.28)" }}
                    >
                      {c.cluster_score}
                    </span>
                    <p
                      className="text-[12px] leading-snug group-hover:text-white/80 transition-colors"
                      style={{ color: "rgba(255,255,255,0.58)" }}
                    >
                      {c.primary.title}
                      <ExternalLink size={8} className="inline ml-1 opacity-40" />
                    </p>
                  </a>
                ))}
              </div>
            </Section>
          )}

          {/* Connected industries */}
          {(theme.related_industries ?? []).length > 0 && (
            <Section title="Industries">
              <div className="flex flex-wrap gap-1.5">
                {theme.related_industries.map(ind => (
                  <span
                    key={ind}
                    className="text-[11px] font-medium px-2.5 py-0.5 rounded-full"
                    style={{
                      background: "rgba(82,176,200,0.08)",
                      color:      "rgba(82,176,200,0.80)",
                      border:     "1px solid rgba(82,176,200,0.14)",
                    }}
                  >
                    {ind}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Connected assets */}
          {(theme.related_assets ?? []).length > 0 && (
            <Section title="Assets">
              <div className="flex flex-wrap gap-1.5">
                {theme.related_assets.map(asset => (
                  <span
                    key={asset}
                    className="text-[11px] font-bold px-2 py-0.5 rounded font-mono"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      color:      "rgba(255,255,255,0.65)",
                      border:     "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {asset}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Macro factors */}
          {(theme.related_macro_factors ?? []).length > 0 && (
            <Section title="Macro Factors">
              <div className="flex flex-wrap gap-1.5">
                {theme.related_macro_factors.map(f => (
                  <span
                    key={f}
                    className="text-[11px] px-2.5 py-0.5 rounded"
                    style={{
                      background: "rgba(251,191,36,0.06)",
                      color:      "rgba(251,191,36,0.70)",
                      border:     "1px solid rgba(251,191,36,0.12)",
                    }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Connected deals */}
          {connectedDeals.length > 0 && (
            <Section title={`Related Deals · ${connectedDeals.length}`}>
              <div className="space-y-2">
                {connectedDeals.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <span
                      className="shrink-0 text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(167,139,250,0.10)", color: "#c4b5fd" }}
                    >
                      {d.dealType}
                    </span>
                    {d.url ? (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white/80 transition-colors"
                        style={{ color: "rgba(255,255,255,0.60)" }}
                      >
                        {d.title ?? d.sector}
                        <ExternalLink size={8} className="inline ml-1 opacity-40" />
                      </a>
                    ) : (
                      <span style={{ color: "rgba(255,255,255,0.60)" }}>{d.title ?? d.sector}</span>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Theme relationship weights */}
          {topRelationships.length > 0 && (
            <Section title="Theme Relationships">
              <div className="space-y-2.5">
                {topRelationships.map(([name, rel]) => {
                  const barColor =
                    rel.direction === "positive" ? "#10B981" :
                    rel.direction === "negative" ? "#EF4444" : "#F59E0B";
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] truncate" style={{ color: "rgba(255,255,255,0.65)" }}>{name}</p>
                        <p className="text-[9.5px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                          {rel.type} · {rel.direction}
                        </p>
                      </div>
                      <div className="w-20 h-1.5 rounded-full overflow-hidden shrink-0"
                        style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.round(rel.weight * 100)}%`, background: barColor }}
                        />
                      </div>
                      <span className="text-[9.5px] font-mono w-6 text-right shrink-0"
                        style={{ color: "rgba(255,255,255,0.32)" }}>
                        {Math.round(rel.weight * 100)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Connected podcasts — default position (below relationships) */}
          {sourceContext !== "listen" && connectedEpisodes.length > 0 && (
            <Section title={`Podcasts · ${connectedEpisodes.length}`}>
              <div className="space-y-3">
                {connectedEpisodes.map(ep => (
                  <div key={ep.id} className="flex items-start gap-2.5">
                    <div
                      className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
                      style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.14)" }}
                    >
                      <Headphones size={11} style={{ color: "rgba(16,185,129,0.70)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] leading-snug line-clamp-2"
                        style={{ color: "rgba(255,255,255,0.72)" }}>
                        {ep.title}
                      </p>
                      <p className="text-[10px] mt-0.5 flex items-center gap-1.5"
                        style={{ color: "rgba(255,255,255,0.30)" }}>
                        <span>{ep.show_name}</span>
                        {ep.duration_seconds > 0 && (
                          <><span style={{ color: "rgba(255,255,255,0.16)" }}>·</span>
                          <span>{fmtDur(ep.duration_seconds)}</span></>
                        )}
                      </p>
                    </div>
                    {ep.external_url && (
                      <a
                        href={ep.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-1.5 rounded-lg transition-colors hover:bg-white/[0.05]"
                        style={{ color: "rgba(16,185,129,0.60)" }}
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Podcast topics */}
          {(theme.podcast_topics ?? []).length > 0 && (
            <Section title="Podcast Topics">
              <div className="flex flex-wrap gap-1.5">
                {theme.podcast_topics.map(t => (
                  <span
                    key={t}
                    className="text-[11px] px-2.5 py-0.5 rounded-full"
                    style={{
                      background: "rgba(16,185,129,0.07)",
                      color:      "rgba(16,185,129,0.75)",
                      border:     "1px solid rgba(16,185,129,0.12)",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Bottom padding */}
          <div className="h-4" />
        </div>
      </motion.div>
    </div>
  );
}
