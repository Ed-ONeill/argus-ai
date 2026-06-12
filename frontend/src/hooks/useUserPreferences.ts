"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { UserPrefs } from "@/lib/feedRanker";

const DEFAULT_PREFS: UserPrefs = {
  followed_themes:        [],
  followed_sectors:       [],
  followed_asset_classes: [],
  user_role:              "",
  region_focus:           "",
};

export function useUserPreferences(): { prefs: UserPrefs; loading: boolean } {
  const { user }  = useAuth();
  const supabase  = useMemo(() => createClient(), []);
  const [prefs,   setPrefs]   = useState<UserPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    supabase
      .from("user_preferences")
      .select("followed_themes, followed_sectors, followed_asset_classes, user_role, region_focus")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setLoading(false);
        if (!data) return;
        const p = data as {
          followed_themes:        string[] | null;
          followed_sectors:       string[] | null;
          followed_asset_classes: string[] | null;
          user_role:              string   | null;
          region_focus:           string   | null;
        };
        setPrefs({
          followed_themes:        p.followed_themes        ?? [],
          followed_sectors:       p.followed_sectors       ?? [],
          followed_asset_classes: p.followed_asset_classes ?? [],
          user_role:              p.user_role              ?? "",
          region_focus:           p.region_focus           ?? "",
        });
      });
  }, [user, supabase]);

  return { prefs, loading };
}
