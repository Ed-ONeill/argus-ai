"use client";
import type { ThemeIntelligence } from "@/lib/types";
import { useMemo } from "react";
import { useResearchState } from "./useResearchState";
export interface FollowedTheme { id: string; name: string; followedAt: string; }
export function useFollowedThemes() {
  const state = useResearchState();
  const followed: FollowedTheme[] = useMemo(() => state.rows.flatMap(row => {
    if (!row.key.startsWith("theme:") || typeof row.value.name !== "string") return [];
    return [{ id: row.key.slice(6), name: row.value.name, followedAt: row.updated_at }];
  }), [state.rows]);
  const isFollowed = (id: string) => followed.some(f => f.id === id);
  const follow = (theme: Pick<ThemeIntelligence, "id">, name: string) => {
    void state.put(`theme:${theme.id}`, { name }).catch(() => {});
  };
  const unfollow = (id: string) => { void state.remove(`theme:${id}`).catch(() => {}); };
  return { followed, followedIds: followed.map(f => f.id), isFollowed, follow, unfollow,
    toggle: (theme: ThemeIntelligence, name: string) => isFollowed(theme.id) ? unfollow(theme.id) : follow(theme, name),
    error: state.error, isLoading: state.isLoading };
}
