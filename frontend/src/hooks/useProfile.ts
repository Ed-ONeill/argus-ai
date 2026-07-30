"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { profileIdentityKey, classifyProfileResult } from "@/lib/profileLoad";

interface Profile {
  display_name:         string | null;
  first_name:           string | null;
  last_name:            string | null;
  created_at:           string | null;
  onboarding_completed: boolean;
}

export function useProfile() {
  const { user, authReady, accessToken, authLoading } = useAuth();
  // Store the profile ALONGSIDE the identity it belongs to. The returned profile
  // is then ownership-gated during render (see `visibleProfile`) — the moment
  // the identity changes, the previous owner's profile stops painting WITHOUT
  // waiting for any effect to run.
  const [owned,       setOwned]       = useState<{ ownerId: string | null; profile: Profile | null }>(
    { ownerId: null, profile: null });
  const [profLoading, setProfLoading] = useState(false);
  const [rev,         setRev]         = useState(0);
  const supabase = useMemo(() => createClient(), []);

  const refetch = useCallback(() => setRev(r => r + 1), []);

  // Key on the STABLE identity, not the user object (which changes reference on
  // every token refresh — the cause of the repeated profiles?select=… requests).
  const userId = profileIdentityKey(user);
  const hasSession = !!accessToken;

  // ── Synchronous ownership gate (defect 2) ────────────────────────────────────
  // Derived during render: a profile is visible ONLY if it was loaded for the
  // CURRENT identity. On the very first render after A→B (before any effect
  // runs), owned.ownerId still equals "A" while userId is "B" → null. A's data
  // can never paint for B; a late A response can never become visible for B; and
  // logout returns null immediately.
  const visibleProfile: Profile | null = owned.ownerId === userId ? owned.profile : null;

  useEffect(() => {
    if (!userId) { setProfLoading(false); return; }  // logged out → nothing to fetch
    // Only query once auth has settled with a usable session — never fire during
    // the initial race (a stale/absent token is what produced the 400 loop).
    if (!authReady || !hasSession) return;

    let cancelled = false;
    setProfLoading(true);

    supabase
      .from("profiles")
      // NOTE: avatar_url removed — that column does not exist in the production
      // profiles table (no migration adds it; it is read nowhere in the app), so
      // selecting it produced a persistent PostgREST 400 "column does not exist".
      .select("display_name, first_name, last_name, created_at, onboarding_completed")
      .eq("id", userId)
      .maybeSingle()   // zero rows → { data: null } success, never a 406/PGRST116
      .then(({ data, error }) => {
        if (cancelled) return;
        setProfLoading(false);

        // A profile-fetch failure must NOT invalidate the Supabase session, and
        // must NOT restore a previous owner — we leave `owned` as-is, and the
        // ownership gate keeps B's visible profile null (metadata fallback only).
        const outcome = classifyProfileResult({ data, error });
        if (outcome === "error") return;

        const fetched = (data as Profile) ?? null;
        setOwned({ ownerId: userId, profile: fetched });

        const meta = user?.user_metadata as Record<string, string | undefined> | undefined;

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
          const patch: Record<string, string | null> = { id: userId };
          if (metaFirst) patch.first_name = metaFirst;
          if (metaLast)  patch.last_name  = metaLast;
          if (!fetched.display_name) {
            patch.display_name = [metaFirst, metaLast].filter(Boolean).join(" ") || null;
          }
          supabase
            .from("profiles")
            .upsert(patch, { onConflict: "id" })
            .then(() => {
              if (cancelled) return;
              // Only patch if this identity still owns the loaded profile.
              setOwned(prev => (prev.ownerId === userId && prev.profile
                ? { ownerId: userId, profile: { ...prev.profile, ...patch } }
                : prev));
            });
        }
      });

    return () => { cancelled = true; };
    // Depend on the STABLE identity + session readiness — NOT the user object,
    // so a token refresh does not re-fire the profile query. One fetch per user.
  }, [userId, authReady, hasSession, supabase, rev]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const firstName = useMemo(() => {
    // Trusted sources only — no email-derived guessing.
    // Returns "there" when no trusted first name is available; callers should
    // treat "there" as a signal to prompt profile completion.
    let source = "none";
    let result = "there";

    if (visibleProfile?.first_name?.trim()) {
      source = "profiles.first_name";
      result = visibleProfile.first_name.trim().split(/\s+/)[0];
    } else {
      const meta = user?.user_metadata as Record<string, string | undefined> | undefined;
      if (meta?.first_name?.trim()) {
        source = "metadata.first_name";
        result = meta.first_name.trim().split(/\s+/)[0];
      } else if (meta?.full_name?.trim()) {
        source = "metadata.full_name";
        result = meta.full_name.trim().split(/\s+/)[0];
      } else if (visibleProfile?.display_name?.trim()?.includes(" ")) {
        // display_name is only usable as a name source when it has a space —
        // that guarantees it's a "First Last" format, not an email-derived slug.
        source = "profiles.display_name";
        result = visibleProfile.display_name!.trim().split(/\s+/)[0];
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.warn(`[useProfile] firstName="${result}" source="${source}"`);
    }

    return result;
  }, [visibleProfile, user]);

  const lastName = useMemo(() => {
    if (visibleProfile?.last_name?.trim()) return visibleProfile.last_name.trim();
    const meta = user?.user_metadata as Record<string, string | undefined> | undefined;
    if (meta?.last_name?.trim()) return meta.last_name.trim();
    return "";
  }, [visibleProfile, user]);

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
    const dt = visibleProfile?.created_at;
    if (!dt) return null;
    return new Date(dt).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [visibleProfile]);

  const onboardingCompleted = useMemo(() => {
    const localDone =
      typeof window !== "undefined" &&
      localStorage.getItem("argus_onboarding_v1") === "done";
    return localDone || (visibleProfile?.onboarding_completed ?? false);
  }, [visibleProfile]);

  return {
    profile: visibleProfile,
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
