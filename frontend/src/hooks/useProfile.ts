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

        const meta = user.user_metadata as Record<string, string | undefined> | undefined;

        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[useProfile] row\n" +
            `  profiles.first_name:   ${fetched?.first_name   ?? "null"}\n` +
            `  profiles.last_name:    ${fetched?.last_name    ?? "null"}\n` +
            `  profiles.display_name: ${fetched?.display_name ?? "null"}\n` +
            `  metadata.first_name:   ${meta?.first_name      ?? "null"}\n` +
            `  metadata.last_name:    ${meta?.last_name       ?? "null"}\n` +
            `  metadata.full_name:    ${meta?.full_name       ?? "null"}`
          );
        }

        // Backfill DB from auth metadata when profile row exists but is missing names
        // (accounts created after the name fields were added to signup).
        const metaFirst = meta?.first_name?.trim();
        const metaLast  = meta?.last_name?.trim();
        if (fetched && !fetched.first_name && (metaFirst || metaLast)) {
          const patch: Record<string, string | null> = { id: user.id };
          if (metaFirst) patch.first_name = metaFirst;
          if (metaLast)  patch.last_name  = metaLast;
          if (!fetched.display_name) {
            patch.display_name = [metaFirst, metaLast].filter(Boolean).join(" ") || null;
          }
          supabase
            .from("profiles")
            .upsert(patch, { onConflict: "id" })
            .then(() => {
              if (!cancelled) setProfile(prev => prev ? { ...prev, ...patch } : prev);
            });
        }
      });

    return () => { cancelled = true; };
  }, [user, supabase, rev]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const firstName = useMemo(() => {
    // Trusted sources only — no email-derived guessing.
    // Returns "there" when no trusted first name is available; callers should
    // treat "there" as a signal to prompt profile completion.
    let source = "none";
    let result = "there";

    if (profile?.first_name?.trim()) {
      source = "profiles.first_name";
      result = profile.first_name.trim().split(/\s+/)[0];
    } else {
      const meta = user?.user_metadata as Record<string, string | undefined> | undefined;
      if (meta?.first_name?.trim()) {
        source = "metadata.first_name";
        result = meta.first_name.trim().split(/\s+/)[0];
      } else if (meta?.full_name?.trim()) {
        source = "metadata.full_name";
        result = meta.full_name.trim().split(/\s+/)[0];
      } else if (profile?.display_name?.trim()?.includes(" ")) {
        // display_name is only usable as a name source when it has a space —
        // that guarantees it's a "First Last" format, not an email-derived slug.
        source = "profiles.display_name";
        result = profile.display_name!.trim().split(/\s+/)[0];
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.warn(`[useProfile] firstName="${result}" source="${source}"`);
    }

    return result;
  }, [profile, user]);

  const lastName = useMemo(() => {
    if (profile?.last_name?.trim()) return profile.last_name.trim();
    const meta = user?.user_metadata as Record<string, string | undefined> | undefined;
    if (meta?.last_name?.trim()) return meta.last_name.trim();
    return "";
  }, [profile, user]);

  const fullName = useMemo(() => {
    if (firstName === "there") return "";
    return [firstName, lastName].filter(Boolean).join(" ");
  }, [firstName, lastName]);

  const initials = useMemo(() => {
    if (firstName === "there") return user?.email?.[0]?.toUpperCase() || "?";
    const f = firstName[0]?.toUpperCase() ?? "";
    const l = lastName[0]?.toUpperCase() ?? "";
    return (f + l) || user?.email?.[0]?.toUpperCase() || "?";
  }, [firstName, lastName, user]);

  const memberSince = useMemo(() => {
    const dt = profile?.created_at;
    if (!dt) return null;
    return new Date(dt).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [profile]);

  const onboardingCompleted = useMemo(() => {
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
