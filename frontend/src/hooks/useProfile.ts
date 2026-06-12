"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";

interface Profile {
  display_name:         string | null;
  first_name:           string | null;
  last_name:            string | null;
  avatar_url:           string | null;
  created_at:           string | null;
  onboarding_completed: boolean;
}

export function useProfile() {
  const { user, loading: authLoading } = useAuth();
  const [profile,     setProfile]     = useState<Profile | null>(null);
  const [profLoading, setProfLoading] = useState(false);
  const [rev,         setRev]         = useState(0);
  const supabase = useMemo(() => createClient(), []);

  const refetch = useCallback(() => setRev(r => r + 1), []);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    let cancelled = false;
    setProfLoading(true);

    supabase
      .from("profiles")
      .select("display_name, first_name, last_name, avatar_url, created_at, onboarding_completed")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (cancelled) return;

        const fetched = (data as Profile) ?? null;
        setProfile(fetched);
        setProfLoading(false);

        // Backfill names from signup metadata if the profile row is missing them
        const meta = user.user_metadata as Record<string, string | undefined> | undefined;
        const metaFirst = meta?.first_name?.trim();
        const metaLast  = meta?.last_name?.trim();
        const needsBackfill = fetched && (!fetched.first_name || !fetched.last_name);
        if (needsBackfill && (metaFirst || metaLast)) {
          const patch: Record<string, string> = { id: user.id };
          if (metaFirst && !fetched?.first_name) patch.first_name = metaFirst;
          if (metaLast  && !fetched?.last_name)  patch.last_name  = metaLast;
          if (metaFirst && !fetched?.display_name) patch.display_name = metaFirst;
          supabase
            .from("profiles")
            .upsert(patch, { onConflict: "id" })
            .then(() => {
              if (!cancelled) {
                setProfile(prev => prev
                  ? { ...prev, ...patch }
                  : prev,
                );
              }
            });
        }
      });

    return () => { cancelled = true; };
  }, [user, supabase, rev]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const firstName = useMemo(() => {
    // 1. profiles.first_name
    if (profile?.first_name?.trim()) return profile.first_name.trim().split(/\s+/)[0];
    // 2. profiles.display_name
    if (profile?.display_name?.trim()) return profile.display_name.trim().split(/\s+/)[0];
    // 3. user_metadata
    const meta = user?.user_metadata as Record<string, string | undefined> | undefined;
    if (meta?.first_name?.trim()) return meta.first_name.trim().split(/\s+/)[0];
    if (meta?.full_name?.trim())  return meta.full_name.trim().split(/\s+/)[0];
    // 4. Clean email fallback
    if (user?.email) {
      const raw = user.email.split("@")[0]
        .replace(/\d+/g, "")
        .replace(/[._-]+(\w)/g, " $1")
        .trim();
      const clean = raw.replace(/^\w/, c => c.toUpperCase());
      return clean.split(/\s+/)[0] || "there";
    }
    return "there";
  }, [profile, user]);

  const lastName = useMemo(() => {
    if (profile?.last_name?.trim()) return profile.last_name.trim();
    const meta = user?.user_metadata as Record<string, string | undefined> | undefined;
    if (meta?.last_name?.trim()) return meta.last_name.trim();
    return "";
  }, [profile, user]);

  const fullName = useMemo(() => {
    const parts = [firstName !== "there" ? firstName : "", lastName].filter(Boolean);
    return parts.join(" ") || firstName;
  }, [firstName, lastName]);

  const initials = useMemo(() => {
    const f = firstName !== "there" ? firstName[0]?.toUpperCase() : "";
    const l = lastName[0]?.toUpperCase() ?? "";
    return (f ?? "") + (l ?? "") || user?.email?.[0]?.toUpperCase() || "?";
  }, [firstName, lastName, user]);

  const memberSince = useMemo(() => {
    const dt = profile?.created_at;
    if (!dt) return null;
    return new Date(dt).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [profile]);

  const onboardingCompleted = useMemo(() => {
    // localStorage is the primary signal; DB is secondary
    const localDone =
      typeof window !== "undefined" &&
      localStorage.getItem("argus_onboarding_v1") === "done";
    return localDone || (profile?.onboarding_completed ?? false);
  }, [profile]);

  return {
    profile,
    firstName,
    lastName,
    fullName,
    initials,
    memberSince,
    onboardingCompleted,
    loading: authLoading || profLoading,
    refetch,
  };
}
