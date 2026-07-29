"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { UserPrefs } from "@/lib/feedRanker";
import {
  PreferenceLoader, classifyPrefResult, queryUserPreferences,
  type PrefsRow, type PrefState, type PreferenceLoadStatus, type PrefQuerySource,
} from "@/lib/preferenceState";

export function useUserPreferences(): {
  prefs: UserPrefs;
  loading: boolean;
  ready: boolean;
  preferenceRevision: number;
  preferenceLoadStatus: PreferenceLoadStatus;
} {
  const { user, loading: authLoading } = useAuth();
  const supabase  = useMemo(() => createClient(), []);
  // One authoritative loader per hook instance (the tested single source of
  // truth for reset-on-identity-change and stale-request dropping).
  const loaderRef = useRef<PreferenceLoader | null>(null);
  if (loaderRef.current === null) loaderRef.current = new PreferenceLoader();
  const loader = loaderRef.current;
  const [snapshot, setSnapshot] = useState<PrefState>(loader.snapshot);
  const [revision, setRevision] = useState<number>(loader.preferenceRevision);
  // Key the effect on the identity itself, not the user object (which changes
  // on token refresh), so we only reset/refetch when the user actually changes.
  const userId = user?.id ?? null;

  useEffect(() => {
    // Reset to a clean slate for the new identity and mark not-yet-settled.
    const fetchUserId = loader.beginIdentity(authLoading, userId);
    setSnapshot(loader.snapshot);
    setRevision(loader.preferenceRevision);
    if (fetchUserId === null) return;   // auth resolving or signed out

    let active = true;                  // secondary guard alongside loader identity
    (async () => {
      try {
        // Destructure BOTH data and error — a returned Supabase/PostgREST error
        // is a distinct outcome from a legitimate no-row result. The shared
        // queryUserPreferences() helper uses maybeSingle() (NOT single()), so
        // zero rows is a { data: null, error: null } success (→ EMPTY) rather
        // than a PGRST116 error; multiple rows / RLS / operational faults still
        // return an error (→ FAILED).
        const { data, error } = await queryUserPreferences(
          supabase as unknown as PrefQuerySource, fetchUserId);
        if (!active) return;
        // Classify via the pure production helper. The loader methods drop the
        // result if the identity has since changed, so a stale user's outcome
        // can never overwrite the current user's state, status, or revision.
        const kind = classifyPrefResult({ data: (data as PrefsRow | null) ?? null, error });
        if (kind === "loaded") loader.resolve(fetchUserId, data as PrefsRow);
        else if (kind === "empty") loader.empty(fetchUserId);
        else loader.fail(fetchUserId);   // error object — no raw content read
      } catch {
        // Network/thrown rejection: settle as failed with defaults and never
        // surface raw error content. The hook must not stay permanently pending.
        if (!active) return;
        loader.fail(fetchUserId);
      }
      if (!active) return;
      setSnapshot(loader.snapshot);
      setRevision(loader.preferenceRevision);
    })();

    return () => { active = false; };
  }, [userId, authLoading, supabase, loader]);

  return {
    prefs: snapshot.prefs,
    loading: snapshot.loading,
    ready: snapshot.ready,
    preferenceRevision: revision,
    preferenceLoadStatus: snapshot.status,
  };
}
