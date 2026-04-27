"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mail, Lock, ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

type Tab = "signin" | "signup";

export default function AuthPage() {
  const [tab,      setTab]      = useState<Tab>("signin");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [message,  setMessage]  = useState<string | null>(null);

  const { signIn, signUp, user } = useAuth();
  const router       = useRouter();
  const searchParams = useSearchParams();

  // Redirect already-authenticated users away from this page
  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  // Surface ?error= flag from the OAuth callback route
  useEffect(() => {
    if (searchParams.get("error") === "auth_failed") {
      setError("Authentication failed. Please try again.");
    }
  }, [searchParams]);

  function switchTab(t: Tab) {
    setTab(t);
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (tab === "signin") {
      const err = await signIn(email, password);
      if (err) {
        setError(friendlyError(err.message));
      } else {
        router.push("/");
        router.refresh();
      }
    } else {
      const err = await signUp(email, password);
      if (err) {
        setError(friendlyError(err.message));
      } else {
        setMessage(
          "Account created. Check your email to confirm, then sign in.",
        );
        switchTab("signin");
      }
    }

    setLoading(false);
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        {/* ── Logo ──────────────────────────────────────────────────────── */}
        <Link href="/" className="flex items-center gap-2.5 mb-8">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm"
            style={{
              background: "linear-gradient(135deg, #1A2B5F 0%, #2563EB 100%)",
            }}
          >
            <span className="text-white font-bold text-xs tracking-wide">AI</span>
          </div>
          <span className="font-semibold text-sm text-ink tracking-tight">Argus</span>
        </Link>

        {/* ── Heading ───────────────────────────────────────────────────── */}
        <h1 className="text-xl font-bold text-ink mb-1">
          {tab === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="text-sm text-ink-secondary mb-6">
          {tab === "signin"
            ? "Sign in to sync saved stories and your watchlist."
            : "Sync saved stories and your watchlist across all devices."}
        </p>

        {/* ── Tab switcher ──────────────────────────────────────────────── */}
        <div className="flex bg-raised rounded-lg p-0.5 mb-6">
          {(["signin", "signup"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchTab(t)}
              className={cn(
                "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all duration-150",
                tab === t
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {t === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        {/* ── Feedback banners ──────────────────────────────────────────── */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 mb-4"
          >
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 leading-snug">{error}</p>
          </motion.div>
        )}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-100 mb-4"
          >
            <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-700 leading-snug">{message}</p>
          </motion.div>
        )}

        {/* ── Form ──────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-2xs font-medium text-ink-muted block mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className={cn(
                  "w-full pl-8 pr-3 py-2.5 text-sm rounded-lg border",
                  "bg-surface text-ink placeholder:text-ink-muted",
                  "border-edge focus:outline-none focus:border-accent",
                  "focus:ring-2 focus:ring-accent/20 transition-all duration-150",
                )}
              />
            </div>
          </div>

          <div>
            <label className="text-2xs font-medium text-ink-muted block mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={
                  tab === "signin" ? "current-password" : "new-password"
                }
                required
                minLength={8}
                className={cn(
                  "w-full pl-8 pr-3 py-2.5 text-sm rounded-lg border",
                  "bg-surface text-ink placeholder:text-ink-muted",
                  "border-edge focus:outline-none focus:border-accent",
                  "focus:ring-2 focus:ring-accent/20 transition-all duration-150",
                )}
              />
            </div>
            {tab === "signup" && (
              <p className="text-2xs text-ink-muted mt-1">Minimum 8 characters.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg",
              "bg-accent text-white text-sm font-semibold",
              "hover:bg-accent/90 active:scale-[0.98]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-all duration-150",
            )}
          >
            {loading ? (
              <span className="opacity-70">Loading…</span>
            ) : (
              <>
                {tab === "signin" ? "Sign In" : "Create Account"}
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        {/* ── Guest link ────────────────────────────────────────────────── */}
        <div className="mt-6 pt-5 border-t border-edge text-center">
          <Link
            href="/"
            className="text-xs text-ink-muted hover:text-ink transition-colors"
          >
            Continue browsing without an account →
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("invalid credentials"))
    return "Incorrect email or password.";
  if (lower.includes("email not confirmed"))
    return "Please confirm your email address before signing in.";
  if (lower.includes("already registered") || lower.includes("already exists"))
    return "An account with this email already exists. Try signing in.";
  if (lower.includes("rate limit"))
    return "Too many attempts. Please wait a moment and try again.";
  return raw;
}
