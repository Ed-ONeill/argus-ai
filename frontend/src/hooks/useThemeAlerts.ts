"use client";

import { useState, useEffect, useCallback } from "react";
import type { ThemeIntelligence } from "@/lib/types";

const STORAGE_KEY = "argus:theme-signals";

type SignalMap = Record<string, string>; // themeId → signal_strength

export interface ThemeAlert {
  themeId:   string;
  themeName: string;
  from:      string;
  to:        string;
  direction: "up" | "down";
}

const SIGNAL_RANK: Record<string, number> = { strong: 3, medium: 2, weak: 1 };

export function useThemeAlerts(themes: ThemeIntelligence[]) {
  const [alerts, setAlerts] = useState<ThemeAlert[]>([]);

  useEffect(() => {
    if (themes.length === 0) return;

    let stored: SignalMap = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw) as SignalMap;
    } catch {}

    const newSignals: SignalMap = {};
    const newAlerts: ThemeAlert[] = [];

    for (const t of themes) {
      const prev = stored[t.id];
      const curr = t.signal_strength;
      newSignals[t.id] = curr;
      if (prev && prev !== curr) {
        const fromRank = SIGNAL_RANK[prev] ?? 0;
        const toRank   = SIGNAL_RANK[curr] ?? 0;
        newAlerts.push({
          themeId:   t.id,
          themeName: t.name,
          from:      prev,
          to:        curr,
          direction: toRank > fromRank ? "up" : "down",
        });
      }
    }

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newSignals)); } catch {}
    if (newAlerts.length > 0) setAlerts(prev => [...prev, ...newAlerts]);
  }, [themes]);

  const dismiss = useCallback((themeId: string) => {
    setAlerts(prev => prev.filter(a => a.themeId !== themeId));
  }, []);

  const hasAlert = useCallback(
    (themeId: string) => alerts.some(a => a.themeId === themeId),
    [alerts],
  );

  const alertFor = useCallback(
    (themeId: string) => alerts.find(a => a.themeId === themeId),
    [alerts],
  );

  return { alerts, hasAlert, alertFor, dismiss };
}
