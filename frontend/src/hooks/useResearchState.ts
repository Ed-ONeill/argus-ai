"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";

export interface ResearchRecord { key: string; value: Record<string, unknown>; updated_at: string; }
const LOCAL_KEY = "argus:research:anonymous:v1";
const EMPTY_ROWS: ResearchRecord[] = [];
function localRows(): ResearchRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(r => r && typeof r.key === "string" && r.value && typeof r.value === "object") : [];
  } catch { return []; }
}

/** Account identity scopes both cache and database. Local data is imported only
 * at the user's explicit request, never adopted on an account switch. */
export function useResearchState() {
  const { user, loading, invalidatingSession } = useAuth();
  const client = createClient();
  const cache = useQueryClient();
  const owner = user?.id ?? null;
  const queryKey = ["research-state", owner ?? "anonymous"] as const;
  const enabled = !loading && !invalidatingSession;
  const query = useQuery<ResearchRecord[]>({
    queryKey, enabled,
    queryFn: async () => {
      if (!owner) return localRows();
      const { data, error } = await client.from("research_state")
        .select("key,value,updated_at").eq("user_id", owner);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
  const mutation = useMutation({
    mutationFn: async ({ key, value, owner: mutationOwner }: { key: string; value: Record<string, unknown> | null; owner: string | null }) => {
      if (!enabled) throw new Error("Wait for your account to finish loading.");
      const updated_at = new Date().toISOString();
      if (!mutationOwner) {
        const rows = localRows().filter(r => r.key !== key);
        if (value) rows.push({ key, value, updated_at });
        localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
      } else {
        const result = value
          ? await client.from("research_state").upsert({ user_id: mutationOwner, key, value, updated_at }, { onConflict: "user_id,key" })
          : await client.from("research_state").delete().eq("user_id", mutationOwner).eq("key", key);
        if (result.error) throw result.error;
      }
      await cache.invalidateQueries({ queryKey: ["research-state", mutationOwner ?? "anonymous"] });
    },
  });
  return {
    rows: enabled ? query.data ?? EMPTY_ROWS : EMPTY_ROWS, ready: enabled && query.isSuccess,
    isLoading: !enabled || query.isPending, isSaving: mutation.isPending,
    error: query.error || mutation.error,
    put: (key: string, value: Record<string, unknown>) => mutation.mutateAsync({ key, value, owner }),
    remove: (key: string) => mutation.mutateAsync({ key, value: null, owner }),
  };
}
