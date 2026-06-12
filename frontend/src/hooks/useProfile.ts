"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";

interface Profile {
  display_name: string | null;
  avatar_url:   string | null;
}

export function useProfile() {
  const { user, loading: authLoading } = useAuth();
  const [profile,     setProfile]     = useState<Profile | null>(null);
  const [profLoading, setProfLoading] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setProfLoading(true);

    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (cancelled) return;

        const fetched = (data as Profile) ?? null;
        setProfile(fetched);
        setProfLoading(false);

        // If the profile row has no display_name, backfill it from signup metadata
        // so future reads come from the table without hitting metadata each time.
        if (!fetched?.display_name) {
          const meta = user.user_metadata as Record<string, string | undefined> | undefined;
          const metaName = meta?.first_name?.trim() || meta?.full_name?.trim();
          if (metaName) {
            supabase
              .from("profiles")
              .upsert({ id: user.id, display_name: metaName }, { onConflict: "id" })
              .then(() => {
                if (!cancelled) {
                  setProfile(prev => ({
                    avatar_url:   prev?.avatar_url ?? null,
                    display_name: metaName,
                  }));
                }
              });
          }
        }
      });

    return () => { cancelled = true; };
  }, [user?.id, supabase]);

  const firstName = useMemo(() => {
    // 1. Profiles table — most authoritative, explicitly set by user or backfilled
    if (profile?.display_name?.trim()) {
      return profile.display_name.trim().split(/\s+/)[0];
    }

    // 2. Supabase user_metadata — set at signup via options.data.first_name
    const meta = user?.user_metadata as Record<string, string | undefined> | undefined;
    if (meta?.first_name?.trim()) {
      return meta.first_name.trim().split(/\s+/)[0];
    }
    if (meta?.full_name?.trim()) {
      return meta.full_name.trim().split(/\s+/)[0];
    }

    // 3. Clean email fallback — strip numbers and separators, capitalize
    if (user?.email) {
      const raw = user.email.split("@")[0]
        .replace(/\d+/g, "")           // strip all digits  (edwardoneill910 → edwardoneill)
        .replace(/[._-]+(\w)/g, " $1") // separators → spaces  (edward.oneill → edward oneill)
        .trim();
      const clean = raw.replace(/^\w/, c => c.toUpperCase());
      return clean.split(/\s+/)[0] || "there";
    }

    return "there";
  }, [profile, user]);

  return {
    profile,
    firstName,
    loading: authLoading || profLoading,
  };
}
