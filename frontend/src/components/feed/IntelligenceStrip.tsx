"use client";

import { useMemo } from "react";
import type { ThemeIntelligence } from "@/lib/types";
import { getThemeChangeLeaderboard } from "@/lib/themeSignalDelta";

// ── Bloomberg-style change sentences from deterministic theme data ─────────────

function generateThemeChanges(themes: ThemeIntelligence[]): string[] {
  const updates: string[] = [];

  for (const t of themes) {
    if (updates.length >= 7) break;

    const name  = t.name;
    const delta = t.momentum_delta   ?? 0;
    const inds  = t.related_industries ?? [];
    const ind0  = inds[0] ?? null;
    const ind1  = inds[1] ?? null;

    if (t.momentum_label === "accelerating" && delta >= 10) {
      const note = ind0 ? ` — ${ind0} leading` : "";
      updates.push(`${name} accelerated${note}`);
    } else if (t.cross_category_confirmed && (t.breadth_score ?? 0) >= 65 && ind0 && ind1) {
      updates.push(`${name} broadened into ${ind0} and ${ind1}`);
    } else if (t.cross_category_confirmed && ind0) {
      updates.push(`${name} confirmed cross-sector into ${ind0}`);
    } else if (t.momentum_label === "reversing" || delta <= -12) {
      updates.push(`${name} reversal — signal delta ${Math.round(delta)}`);
    } else if ((t.persistence_cycles ?? 0) >= 8) {
      updates.push(`${name} reached ${t.persistence_cycles}-cycle persistence`);
    } else if ((t.evidence_count ?? 0) >= 8 && delta > 0) {
      updates.push(`${name} added ${t.evidence_count} confirming sources`);
    } else if ((t.breadth_score ?? 0) < 25 && delta < -5 && ind0) {
      updates.push(`${name} narrowing — concentration to ${ind0}`);
    } else if (t.momentum_label === "strengthening" && t.signal_strength === "strong" && delta > 5) {
      updates.push(`${name} strengthening — elevated signal quality`);
    }
  }

  // Backfill if few high-signal events
  if (updates.length < 4) {
    for (const t of themes) {
      if (updates.length >= 6) break;
      const stories = t.contributing_story_count ?? 0;
      const ind0    = (t.related_industries ?? [])[0] ?? null;
      if (stories >= 5 && ind0) {
        updates.push(`${t.name} — ${stories} active sources across ${ind0}`);
      }
    }
  }

  return updates.slice(0, 7);
}

// ── Component ─────────────────────────────────────────────────────────────────

interface IntelligenceStripProps {
  themes: ThemeIntelligence[];
}

export function IntelligenceStrip({ themes }: IntelligenceStripProps) {
  if (themes.length === 0) return null;

  const board   = useMemo(() => getThemeChangeLeaderboard(themes), [themes]);
  const changes = useMemo(() => generateThemeChanges(themes),      [themes]);

  const newEvidence = useMemo(
    () => [...themes]
      .filter(t => (t.evidence_count ?? 0) >= 6 && (t.momentum_delta ?? 0) > 3)
      .sort((a, b) => (b.evidence_count ?? 0) - (a.evidence_count ?? 0))
      .slice(0, 3),
    [themes],
  );

  const hasBoard =
    board.risers.length > 0 || board.decliners.length > 0 ||
    board.broadening.length > 0 || board.narrowing.length > 0;

  if (!hasBoard && changes.length === 0) return null;

  return (
    <div
      className="rounded-xl mb-5 overflow-hidden"
      style={{
        background: "rgba(4,8,18,0.90)",
        border:     "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-2 flex items-center gap-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
          style={{ background: "#52b0c8" }} />
        <span
          className="text-[8.5px] font-bold uppercase tracking-[0.20em]"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          Today's Intelligence
        </span>
      </div>

      {/* Leaderboard rows */}
      {hasBoard && (
        <div className="px-4 py-3 space-y-2">
          {board.risers.length > 0 && (
            <BoardRow icon="▲" color="#10B981" label="Risers"
              items={board.risers.map(t => ({
                name:  t.name,
                value: `+${Math.round(t.momentum_delta ?? 0)}`,
              }))} />
          )}
          {board.decliners.length > 0 && (
            <BoardRow icon="▼" color="#EF4444" label="Decliners"
              items={board.decliners.map(t => ({
                name:  t.name,
                value: `${Math.round(t.momentum_delta ?? 0)}`,
              }))} />
          )}
          {board.broadening.length > 0 && (
            <BoardRow icon="◈" color="#52b0c8" label="Broadening"
              items={board.broadening.map(t => ({
                name:  t.name,
                value: t.cross_category_confirmed
                  ? `${Math.round(t.breadth_score ?? 0)} ✓`
                  : `${Math.round(t.breadth_score ?? 0)}`,
              }))} />
          )}
          {board.narrowing.length > 0 && (
            <BoardRow icon="▼" color="#F59E0B" label="Narrowing"
              items={board.narrowing.map(t => ({
                name:  t.name,
                value: `${Math.round(t.breadth_score ?? 0)}`,
              }))} />
          )}
          {newEvidence.length > 0 && (
            <BoardRow icon="★" color="#A78BFA" label="Evidence"
              items={newEvidence.map(t => ({
                name:  t.name,
                value: `${t.evidence_count ?? 0}e`,
              }))} />
          )}
        </div>
      )}

      {/* Change feed */}
      {changes.length > 0 && (
        <div
          className="px-4 py-3"
          style={{
            borderTop: hasBoard ? "1px solid rgba(255,255,255,0.05)" : undefined,
          }}
        >
          <p
            className="text-[7.5px] font-bold uppercase tracking-[0.18em] mb-2"
            style={{ color: "rgba(255,255,255,0.20)" }}
          >
            Changes
          </p>
          <div className="space-y-1.5">
            {changes.map((line, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[8px] shrink-0 mt-px"
                  style={{ color: "rgba(255,255,255,0.22)" }}>·</span>
                <p className="text-[11.5px] leading-snug"
                  style={{ color: "rgba(255,255,255,0.60)" }}>
                  {line}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── BoardRow ──────────────────────────────────────────────────────────────────

function BoardRow({
  icon, color, label, items,
}: {
  icon:  string;
  color: string;
  label: string;
  items: Array<{ name: string; value: string }>;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex items-center gap-1.5 shrink-0" style={{ width: 90 }}>
        <span className="text-[9px]" style={{ color }}>{icon}</span>
        <span
          className="text-[8.5px] font-bold uppercase tracking-[0.08em]"
          style={{ color: "rgba(255,255,255,0.28)" }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-center flex-wrap gap-x-5 gap-y-1 flex-1 min-w-0">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-[10.5px] truncate"
              style={{ color: "rgba(255,255,255,0.68)", maxWidth: 140 }}
            >
              {item.name}
            </span>
            <span
              className="text-[8.5px] font-mono font-bold tabular-nums shrink-0"
              style={{ color }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
