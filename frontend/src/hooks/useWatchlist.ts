"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import type { WatchlistItem } from "@/lib/types";

// ── localStorage helpers (anonymous fallback) ─────────────────────────────────

const STORAGE_KEY = "argus_watchlist";

function localLoad(): WatchlistItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function localSave(items: WatchlistItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

// ── Merge localStorage → Supabase on first login ──────────────────────────────

async function mergeLocalToSupabase(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
) {
  const local = localLoad();
  if (local.length === 0) return;

  await supabase.from("watchlist").upsert(
    local.map((w) => ({
      user_id:   userId,
      item_id:   w.id,
      item_type: w.type,
    })),
    { onConflict: "user_id,item_id", ignoreDuplicates: true },
  );

  localStorage.removeItem(STORAGE_KEY);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWatchlist() {
  const { user }    = useAuth();
  const supabase    = createClient();
  const queryClient = useQueryClient();
  const queryKey    = ["watchlist", user?.id ?? "anon"] as const;

  // Anonymous state — local only
  const [localItems, setLocalItems] = useState<WatchlistItem[]>(() =>
    user ? [] : localLoad(),
  );

  // On login: merge localStorage → Supabase and clear local state
  useEffect(() => {
    if (user) {
      mergeLocalToSupabase(user.id, supabase);
      setLocalItems([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Keep localStorage in sync while anonymous
  useEffect(() => {
    if (!user) localSave(localItems);
  }, [localItems, user]);

  // ── Supabase query (logged-in only) ──────────────────────────────────────────
  const { data: remoteItems = [] } = useQuery<WatchlistItem[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watchlist")
        .select("item_id, item_type, added_at")
        .eq("user_id", user!.id)
        .order("added_at", { ascending: false });

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id:      row.item_id as string,
        type:    row.item_type as WatchlistItem["type"],
        addedAt: row.added_at as string,
      }));
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Active list: remote when logged in, local when anonymous
  const watchlist: WatchlistItem[] = user ? remoteItems : localItems;

  const watchedSet = useMemo(
    () => new Set(watchlist.map((w) => w.id.toLowerCase())),
    [watchlist],
  );

  const isWatched = useCallback(
    (entityName: string) => watchedSet.has(entityName.toLowerCase()),
    [watchedSet],
  );

  // ── Add ─────────────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: WatchlistItem["type"] }) => {
      if (!user) {
        setLocalItems((prev) => {
          if (prev.some((w) => w.id.toLowerCase() === id.toLowerCase())) return prev;
          return [...prev, { id, type, addedAt: new Date().toISOString() }];
        });
        return;
      }
      const { error } = await supabase
        .from("watchlist")
        .upsert(
          { user_id: user.id, item_id: id, item_type: type },
          { onConflict: "user_id,item_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey });
    },
  });

  // ── Remove ───────────────────────────────────────────────────────────────────
  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) {
        setLocalItems((prev) =>
          prev.filter((w) => w.id.toLowerCase() !== id.toLowerCase()),
        );
        return;
      }
      const { error } = await supabase
        .from("watchlist")
        .delete()
        .eq("user_id", user.id)
        .eq("item_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey });
    },
  });

  const addItem = useCallback(
    (id: string, type: WatchlistItem["type"] = "ticker") =>
      addMutation.mutate({ id, type }),
    [addMutation],
  );

  const removeItem = useCallback(
    (id: string) => removeMutation.mutate(id),
    [removeMutation],
  );

  const toggleItem = useCallback(
    (id: string, type: WatchlistItem["type"] = "ticker") => {
      if (watchedSet.has(id.toLowerCase())) removeItem(id);
      else addItem(id, type);
    },
    [watchedSet, addItem, removeItem],
  );

  const matchesWatchlist = useCallback(
    (entities: string[]) => entities.some((e) => watchedSet.has(e.toLowerCase())),
    [watchedSet],
  );

  return {
    watchlist,
    isWatched,
    addItem,
    removeItem,
    toggleItem,
    matchesWatchlist,
  };
}
