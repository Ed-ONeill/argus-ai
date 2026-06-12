"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";

// Derives a clean first name from an email prefix.
// Strips domain, digits, and separators; takes the first segment only.
// e.g. "edward.oneill910@gmail.com" → "Edward"
// Cannot reliably split unsepeated concatenations like "edwardoneill".
function normalizeFirstName(email: string): string {
  const prefix = email.split("@")[0];
  const noDigits = prefix.replace(/\d+/g, "");
  const parts = noDigits.split(/[._\-+\s]+/).map(s => s.trim()).filter(Boolean);
  const first = parts[0];
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

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

        if (process.env.NODE_ENV === "development") {
          const m = user.user_metadata as Record<string, unknown> | undefined;
          console.group("[useProfile] profile row fetched");
          console.log("  profiles.first_name:   ", fetched?.first_name   ?? "(null)");
          console.log("  profiles.last_name:    ", fetched?.last_name    ?? "(null)");
          console.log("  profiles.display_name: ", fetched?.display_name ?? "(null)");
          console.log("  metadata.first_name:   ", m?.first_name         ?? "(null)");
          console.log("  metadata.last_name:    ", m?.last_name          ?? "(null)");
          console.log("  metadata.full_name:    ", m?.full_name          ?? "(null)");
          console.groupEnd();
        }

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
    let source = "";
    let result = "";

    if (profile?.first_name?.trim()) {
      // Best: explicit first_name column in DB
      source = "profiles.first_name";
      result = profile.first_name.trim().split(/\s+/)[0];
    } else {
      const meta = user?.user_metadata as Record<string, string | undefined> | undefined;
      if (meta?.first_name?.trim()) {
        // Explicit first_name stored in auth metadata at signup
        source = "metadata.first_name";
        result = meta.first_name.trim().split(/\s+/)[0];
      } else if (meta?.full_name?.trim()) {
        // Full name from metadata — take first word
        source = "metadata.full_name";
        result = meta.full_name.trim().split(/\s+/)[0];
      } else if (profile?.display_name?.trim()?.includes(" ")) {
        // display_name only when it has a space — single-word values are often
        // email-derived concatenations (e.g. "Edwardoneill") and cannot be used.
        source = "profiles.display_name";
        result = profile.display_name!.trim().split(/\s+/)[0];
      } else if (user?.email) {
        source = "email";
        result = normalizeFirstName(user.email);
      } else {
        source = "fallback";
        result = "there";
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`[useProfile] firstName = "${result}" (source: ${source})`);
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
