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
        if (!cancelled) {
          setProfile((data as Profile) ?? null);
          setProfLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [user?.id, supabase]);

  const firstName = useMemo(() => {
    if (profile?.display_name?.trim()) {
      return profile.display_name.trim().split(/\s+/)[0];
    }
    if (user?.email) {
      const prefix = user.email.split("@")[0];
      // edward.oneill → Edward, john_doe → John
      return prefix
        .replace(/[._-]+(\w)/g, (_, c: string) => ` ${c.toUpperCase()}`)
        .replace(/^\w/, (c) => c.toUpperCase())
        .split(" ")[0];
    }
    return "there";
  }, [profile, user]);

  return {
    profile,
    firstName,
    loading: authLoading || profLoading,
  };
}
