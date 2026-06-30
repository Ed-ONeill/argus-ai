import type { ThemeIntelligence } from "@/lib/types";

// ── Snapshot persistence ───────────────────────────────────────────────────────

const SNAPSHOT_KEY = "argus:watchlist-snapshot";

interface ThemeRecord {
  signal_strength:   string;
  momentum_label:    string;
  breadth_score:     number;
  persistence_score: number;
  evidence_count:    number;
}

export interface StoredSnapshot {
  timestamp: number;
  themes:    Record<string, ThemeRecord>;
}

export function saveSnapshot(themes: ThemeIntelligence[]): void {
  const data: StoredSnapshot = {
    timestamp: Date.now(),
    themes: Object.fromEntries(
      themes.map(t => [t.id, {
        signal_strength:   t.signal_strength,
        momentum_label:    t.momentum_label,
        breadth_score:     t.breadth_score     ?? 0,
        persistence_score: t.persistence_score ?? 0,
        evidence_count:    t.evidence_count    ?? 0,
      } satisfies ThemeRecord]),
    ),
  };
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data)); } catch {}
}

export function loadSnapshot(): StoredSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as StoredSnapshot) : null;
  } catch { return null; }
}

// ── Delta types ────────────────────────────────────────────────────────────────

export interface AlertChip {
  label:     string;
  direction: "up" | "down";
}

export interface WatchlistDelta {
  id:                  string;
  momentumLabelChanged: boolean;
  prevMomentumLabel:   string;
  signalChanged:       boolean;
  prevSignal:          string;
  breadthDiff:         number;
  persistenceDiff:     number;
  evidenceDiff:        number;
  priorityScore:       number;
  alertChip:           AlertChip | null;
  changeSentence:      string | null;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

const SIGNAL_RANK: Record<string, number> = { strong: 2, medium: 1, weak: 0 };

function deriveAlertChip(
  theme:           ThemeIntelligence,
  prev:            ThemeRecord | null,
  momentumChanged: boolean,
  signalChanged:   boolean,
  breadthDiff:     number,
): AlertChip | null {
  const ml = theme.momentum_label;

  if (momentumChanged) {
    if (ml === "accelerating")  return { label: "Accelerating",  direction: "up" };
    if (ml === "strengthening") return { label: "Strengthening", direction: "up" };
    if (ml === "emerging")      return { label: "Emerging",      direction: "up" };
    if (ml === "reversing")     return { label: "At Risk",       direction: "down" };
    if (ml === "cooling")       return { label: "Cooling",       direction: "down" };
  }
  if (signalChanged && prev) {
    const cur  = SIGNAL_RANK[theme.signal_strength] ?? 0;
    const past = SIGNAL_RANK[prev.signal_strength]  ?? 0;
    if (cur > past) return { label: "Signal ↑", direction: "up" };
    if (cur < past) return { label: "Signal ↓", direction: "down" };
  }
  if (breadthDiff >=  10) return { label: "Broadening", direction: "up" };
  if (breadthDiff <= -10) return { label: "Narrowing",  direction: "down" };

  // No previous snapshot, fall back to API-reported delta
  if (!prev) {
    const d = theme.momentum_delta ?? 0;
    if (d >= 12 && ml === "accelerating")                   return { label: "Accelerating",  direction: "up" };
    if (d >=  8 && (ml === "strengthening" || ml === "accelerating")) return { label: "Strengthening", direction: "up" };
    if (d <= -10)                                           return { label: "Weakening",     direction: "down" };
    if (ml === "reversing")                                 return { label: "At Risk",       direction: "down" };
  }

  return null;
}

function deriveChangeSentence(
  theme:           ThemeIntelligence,
  prev:            ThemeRecord | null,
  momentumChanged: boolean,
  signalChanged:   boolean,
  breadthDiff:     number,
): string | null {
  const n = theme.name;

  if (momentumChanged) {
    const ml = theme.momentum_label;
    if (ml === "accelerating")  return `${n} accelerated`;
    if (ml === "strengthening") return `${n} strengthened`;
    if (ml === "reversing")     return `${n} moved to At Risk`;
    if (ml === "cooling")       return `${n} is cooling`;
    if (ml === "emerging")      return `${n} emerged`;
  }
  if (breadthDiff >=  10) return `${n} broadened across sectors`;
  if (breadthDiff <= -10) return `${n} narrowed, concentration risk`;
  if (signalChanged && prev) {
    const cur  = SIGNAL_RANK[theme.signal_strength] ?? 0;
    const past = SIGNAL_RANK[prev.signal_strength]  ?? 0;
    if (cur > past) return `${n} signal strengthened`;
    if (cur < past) return `${n} signal weakened`;
  }

  // No previous snapshot, fall back to API delta
  if (!prev) {
    const d = theme.momentum_delta ?? 0;
    if (d >= 12) return `${n} accelerated, momentum +${Math.round(d)}`;
    if (d <= -10) return `${n} weakened, momentum ${Math.round(d)}`;
    if (theme.momentum_label === "accelerating") return `${n} is accelerating`;
    if (theme.momentum_label === "reversing")    return `${n} moved to At Risk`;
  }

  return null;
}

// ── Main export ────────────────────────────────────────────────────────────────

export function computeWatchlistDeltas(
  themes:     ThemeIntelligence[],
  watchedIds: Set<string>,
  snapshot:   StoredSnapshot | null,
): Record<string, WatchlistDelta> {
  const out: Record<string, WatchlistDelta> = {};

  for (const theme of themes) {
    if (!watchedIds.has(theme.id)) continue;

    const prev = snapshot?.themes[theme.id] ?? null;

    const momentumLabelChanged = !!prev && prev.momentum_label  !== theme.momentum_label;
    const signalChanged        = !!prev && prev.signal_strength !== theme.signal_strength;
    const breadthDiff          = prev ? (theme.breadth_score     ?? 0) - prev.breadth_score     : 0;
    const persistenceDiff      = prev ? (theme.persistence_score ?? 0) - prev.persistence_score : 0;
    const evidenceDiff         = prev ? (theme.evidence_count    ?? 0) - prev.evidence_count    : 0;
    const apiDelta             = Math.abs(theme.momentum_delta ?? 0);

    const priorityScore =
      (signalChanged        ? 8   : 0)
      + (momentumLabelChanged ? 5   : 0)
      + Math.abs(breadthDiff)
      + Math.abs(persistenceDiff)
      + apiDelta * 1.5;

    out[theme.id] = {
      id:                  theme.id,
      momentumLabelChanged,
      prevMomentumLabel:   prev?.momentum_label  ?? theme.momentum_label,
      signalChanged,
      prevSignal:          prev?.signal_strength ?? theme.signal_strength,
      breadthDiff,
      persistenceDiff,
      evidenceDiff,
      priorityScore,
      alertChip:      deriveAlertChip(theme, prev, momentumLabelChanged, signalChanged, breadthDiff),
      changeSentence: deriveChangeSentence(theme, prev, momentumLabelChanged, signalChanged, breadthDiff),
    };
  }

  return out;
}
