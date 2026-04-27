"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import type { FeedItem } from "@/lib/types";

// ── localStorage helpers (anonymous fallback) ─────────────────────────────────

const LS_IDS   = "argus_saved_ids";
const LS_ITEMS = "argus_saved_items";

function localGetIds(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_IDS)   ?? "[]"); } catch { return []; }
}
function localGetItems(): FeedItem[] {
  try { return JSON.parse(localStorage.getItem(LS_ITEMS) ?? "[]"); } catch { return []; }
}
function localSave(item: FeedItem) {
  if (localGetIds().includes(item.id)) return;
  localStorage.setItem(LS_IDS,   JSON.stringify([...localGetIds(), item.id]));
  localStorage.setItem(LS_ITEMS, JSON.stringify([...localGetItems(), item]));
}
function localRemove(id: string) {
  localStorage.setItem(LS_IDS,   JSON.stringify(localGetIds().filter(i => i !== id)));
  localStorage.setItem(LS_ITEMS, JSON.stringify(localGetItems().filter(i => i.id !== id)));
}
function localClear() {
  localStorage.removeItem(LS_IDS);
  localStorage.removeItem(LS_ITEMS);
}

// ── Supabase row → FeedItem ───────────────────────────────────────────────────

function rowToFeedItem(row: Record<string, unknown>): FeedItem {
  return {
    id:                String(row.item_id          ?? ""),
    title:             String(row.title             ?? ""),
    url:               String(row.url               ?? ""),
    source:            String(row.source            ?? ""),
    category:          String(row.category          ?? ""),
    published:         String(row.published         ?? ""),
    signal_score:      row.signal_score != null ? Number(row.signal_score) : null,
    signal_strength:   String(row.signal_strength   ?? ""),
    summary:           String(row.summary           ?? ""),
    why_it_matters:    String(row.why_it_matters    ?? ""),
    impact:            String(row.impact            ?? ""),
    snippet:           "",
    affected_entities: [],
  } as FeedItem;
}

// ── Merge localStorage → Supabase on first login ──────────────────────────────

async function mergeLocalToSupabase(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
) {
  const items = localGetItems();
  if (items.length === 0) return;

  await supabase.from("saved_items").upsert(
    items.map((item) => ({
      user_id:         userId,
      item_id:         item.id,
      title:           item.title,
      url:             item.url,
      source:          item.source          ?? null,
      category:        item.category        ?? null,
      published:       item.published       ?? null,
      signal_score:    item.signal_score    ?? null,
      signal_strength: item.signal_strength ?? null,
      summary:         item.summary         ?? null,
      why_it_matters:  item.why_it_matters  ?? null,
      impact:          item.impact          ?? null,
    })),
    { onConflict: "user_id,item_id", ignoreDuplicates: true },
  );

  localClear();
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSaved() {
  const { user }    = useAuth();
  const supabase    = createClient();
  const queryClient = useQueryClient();
  const queryKey    = ["saved", user?.id ?? "anon"] as const;

  // On login: silently migrate any localStorage saves to Supabase
  useEffect(() => {
    if (user) mergeLocalToSupabase(user.id, supabase);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Query ────────────────────────────────────────────────────────────────────
  const { data: savedItems = [] } = useQuery<FeedItem[]>({
    queryKey,
    queryFn: async () => {
      if (!user) return localGetItems();

      const { data, error } = await supabase
        .from("saved_items")
        .select("*")
        .eq("user_id", user.id)
        .order("saved_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map(rowToFeedItem);
    },
    // Anonymous reads come from localStorage — never stale until invalidated
    staleTime: user ? 60_000 : Infinity,
    gcTime:    user ? 5 * 60_000 : Infinity,
  });

  const savedIds = savedItems.map((i) => i.id);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async (item: FeedItem) => {
      if (!user) {
        localSave(item);
        return;
      }
      const { error } = await supabase.from("saved_items").upsert(
        {
          user_id:         user.id,
          item_id:         item.id,
          title:           item.title,
          url:             item.url,
          source:          item.source          ?? null,
          category:        item.category        ?? null,
          published:       item.published       ?? null,
          signal_score:    item.signal_score    ?? null,
          signal_strength: item.signal_strength ?? null,
          summary:         item.summary         ?? null,
          why_it_matters:  item.why_it_matters  ?? null,
          impact:          item.impact          ?? null,
        },
        { onConflict: "user_id,item_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!user) {
        localRemove(id);
        return;
      }
      const { error } = await supabase
        .from("saved_items")
        .delete()
        .eq("user_id", user.id)
        .eq("item_id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    savedIds,
    savedItems,
    isSaved:    (id: string)     => savedIds.includes(id),
    save:       (item: FeedItem) => save.mutate(item),
    remove:     (id: string)     => remove.mutate(id),
    toggleSave: (item: FeedItem) => {
      if (savedIds.includes(item.id)) remove.mutate(item.id);
      else save.mutate(item);
    },
  };
}
