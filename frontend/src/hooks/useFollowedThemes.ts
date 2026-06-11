"use client";

import { useState, useEffect, useCallback } from "react";
import type { ThemeIntelligence } from "@/lib/types";

const STORAGE_KEY = "argus:followed-themes";

export interface FollowedTheme {
  id:         string;
  name:       string;   // public-facing name at time of follow
  followedAt: string;   // ISO timestamp
}

function load(): FollowedTheme[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}

function persist(themes: FollowedTheme[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(themes)); }
  catch {}
}

export function useFollowedThemes() {
  const [followed, setFollowed] = useState<FollowedTheme[]>([]);

  useEffect(() => { setFollowed(load()); }, []);

  const follow = useCallback((theme: ThemeIntelligence, publicName: string) => {
    setFollowed(prev => {
      if (prev.some(f => f.id === theme.id)) return prev;
      const next: FollowedTheme[] = [
        { id: theme.id, name: publicName, followedAt: new Date().toISOString() },
        ...prev,
      ];
      persist(next);
      return next;
    });
  }, []);

  const unfollow = useCallback((id: string) => {
    setFollowed(prev => {
      const next = prev.filter(f => f.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const isFollowed = useCallback(
    (id: string) => followed.some(f => f.id === id),
    [followed],
  );

  const toggle = useCallback(
    (theme: ThemeIntelligence, publicName: string) => {
      if (followed.some(f => f.id === theme.id)) unfollow(theme.id);
      else follow(theme, publicName);
    },
    [followed, follow, unfollow],
  );

  return {
    followed,
    followedIds: followed.map(f => f.id),
    follow,
    unfollow,
    isFollowed,
    toggle,
  };
}
