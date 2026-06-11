"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mail, Lock, ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type Tab = "signin" | "signup";

const GRID_BG = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">'
  + '<path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.014)" stroke-width="0.5"/>'
  + '</svg>'
)}")`;

export default function AuthPage() {
  return (
    <Suspense>
      <AuthPageInner />
    </Suspense>
  );
}

function AuthPageInner() {
  const [tab,      setTab]      = useState<Tab>("signin");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [message,  setMessage]  = useState<string | null>(null);
  const [focusedInput, setFocusedInput] = useState<"email" | "password" | null>(null);

  const { signIn, signUp, user } = useAuth();
  const router       = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

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

    try {
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
          setMessage("Account created. Check your email to confirm, then sign in.");
          switchTab("signin");
        }
      }
    } catch (thrown) {
      const msg = thrown instanceof Error ? thrown.message : "An unexpected error occurred.";
      setError(friendlyError(msg));
    } finally {
      setLoading(false);
    }
  }

  function inputStyle(name: "email" | "password"): React.CSSProperties {
    const focused = focusedInput === name;
    return {
      background:  "rgba(255,255,255,0.04)",
      border:      `1px solid ${focused ? "rgba(83,150,220,0.50)" : "rgba(255,255,255,0.10)"}`,
      borderRadius: "6px",
      color:       "rgba(255,255,255,0.82)",
      fontSize:    "13px",
      padding:     "11px 12px 11px 34px",
      width:       "100%",
      outline:     "none",
      transition:  "border-color 0.15s ease",
    };
  }

  return (
    <div
      style={{
        minHeight: "calc(100vh - 3.5rem)",
        background: "#030710",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Atmospheric grid */}
      <div aria-hidden className="absolute inset-0 pointer-events-none select-none"
        style={{ backgroundImage: GRID_BG, backgroundRepeat: "repeat" }} />

      {/* Radial glow */}
      <div aria-hidden className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 100% 80% at 50% 0%, rgba(8,20,70,0.55) 0%, rgba(5,12,40,0.22) 50%, transparent 80%)" }} />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        style={{ width: "100%", maxWidth: "360px", position: "relative", zIndex: 1 }}
      >
        {/* ── Logo ──────────────────────────────────────────────────────────── */}
        <Link href="/" className="flex items-center gap-2.5 mb-9">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/argus-icon.png"
            alt="Argus"
            style={{ width: 28, height: 28, borderRadius: 7 }}
          />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.72)", letterSpacing: "0.04em" }}>
            Argus
          </span>
        </Link>

        {/* ── Card ──────────────────────────────────────────────────────────── */}
        <div style={{
          background: "rgba(5,9,22,0.80)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: "10px",
          overflow: "hidden",
          backdropFilter: "blur(14px)",
        }}>
          {/* Top accent line */}
          <div style={{ height: 2, background: "linear-gradient(to right, transparent, rgba(83,150,220,0.45), transparent)" }} />

          <div style={{ padding: "28px 28px 24px" }}>

            {/* ── Heading ─────────────────────────────────────────────────── */}
            <div style={{ marginBottom: "22px" }}>
              <h1 style={{
                fontSize: "17px", fontWeight: 600, letterSpacing: "0.01em",
                color: "rgba(255,255,255,0.82)", marginBottom: "5px",
              }}>
                {tab === "signin" ? "Welcome back." : "Create your account."}
              </h1>
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.30)", letterSpacing: "0.02em", lineHeight: 1.55 }}>
                {tab === "signin"
                  ? "Sign in to access your personalized intelligence feed."
                  : "Sync saved stories and your watchlist across all devices."}
              </p>
            </div>

            {/* ── Tab switcher ────────────────────────────────────────────── */}
            <div style={{
              display: "flex",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: "6px",
              padding: "3px",
              marginBottom: "20px",
              gap: "2px",
            }}>
              {(["signin", "signup"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchTab(t)}
                  style={{
                    flex: 1,
                    padding: "7px",
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    borderRadius: "4px",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    background: tab === t ? "rgba(255,255,255,0.08)" : "transparent",
                    color: tab === t ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.30)",
                  }}
                >
                  {t === "signin" ? "SIGN IN" : "SIGN UP"}
                </button>
              ))}
            </div>

            {/* ── Feedback banners ────────────────────────────────────────── */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  display: "flex", alignItems: "flex-start", gap: "8px",
                  padding: "10px 12px", borderRadius: "6px", marginBottom: "14px",
                  background: "rgba(200,60,60,0.10)", border: "1px solid rgba(200,60,60,0.22)",
                }}
              >
                <AlertCircle size={13} style={{ color: "#e05555", flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: "12px", color: "rgba(220,130,130,0.90)", lineHeight: 1.45 }}>{error}</p>
              </motion.div>
            )}
            {message && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  display: "flex", alignItems: "flex-start", gap: "8px",
                  padding: "10px 12px", borderRadius: "6px", marginBottom: "14px",
                  background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.20)",
                }}
              >
                <CheckCircle size={13} style={{ color: "#3ab880", flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: "12px", color: "rgba(130,210,160,0.90)", lineHeight: 1.45 }}>{message}</p>
              </motion.div>
            )}

            {/* ── Form ────────────────────────────────────────────────────── */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

              {/* Email */}
              <div>
                <label style={{
                  display: "block", fontSize: "9px", fontWeight: 600,
                  letterSpacing: "0.16em", color: "rgba(255,255,255,0.30)", marginBottom: "6px",
                }}>
                  EMAIL
                </label>
                <div style={{ position: "relative" }}>
                  <Mail size={13} style={{
                    position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                    color: "rgba(255,255,255,0.28)", pointerEvents: "none",
                  }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    style={inputStyle("email")}
                    onFocus={() => setFocusedInput("email")}
                    onBlur={() => setFocusedInput(null)}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={{
                  display: "block", fontSize: "9px", fontWeight: 600,
                  letterSpacing: "0.16em", color: "rgba(255,255,255,0.30)", marginBottom: "6px",
                }}>
                  PASSWORD
                </label>
                <div style={{ position: "relative" }}>
                  <Lock size={13} style={{
                    position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                    color: "rgba(255,255,255,0.28)", pointerEvents: "none",
                  }} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={tab === "signin" ? "current-password" : "new-password"}
                    required
                    minLength={8}
                    style={inputStyle("password")}
                    onFocus={() => setFocusedInput("password")}
                    onBlur={() => setFocusedInput(null)}
                  />
                </div>
                {tab === "signup" && (
                  <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.22)", marginTop: "5px", letterSpacing: "0.02em" }}>
                    Minimum 8 characters.
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "11px",
                  borderRadius: "6px",
                  border: "none",
                  background: loading ? "rgba(37,99,235,0.50)" : "#2563EB",
                  color: "rgba(255,255,255,0.90)",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  cursor: loading ? "default" : "pointer",
                  marginTop: "4px",
                  transition: "background 0.15s ease, transform 0.1s ease",
                }}
                onMouseEnter={e => {
                  if (!loading) e.currentTarget.style.background = "#1d4ed8";
                }}
                onMouseLeave={e => {
                  if (!loading) e.currentTarget.style.background = "#2563EB";
                }}
                onMouseDown={e => {
                  if (!loading) e.currentTarget.style.transform = "scale(0.988)";
                }}
                onMouseUp={e => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                {loading ? (
                  <span style={{ opacity: 0.70 }}>
                    <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white/80 rounded-full animate-spin mr-1.5" />
                    {tab === "signin" ? "Signing in…" : "Creating account…"}
                  </span>
                ) : (
                  <>
                    {tab === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
                    <ArrowRight size={13} />
                  </>
                )}
              </button>
            </form>

          </div>
        </div>

        {/* ── Guest link ────────────────────────────────────────────────────── */}
        <div style={{ marginTop: "20px", textAlign: "center" }}>
          <Link
            href="/"
            style={{
              fontSize: "11.5px",
              color: "rgba(255,255,255,0.24)",
              letterSpacing: "0.03em",
              textDecoration: "none",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.50)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.24)"; }}
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

  // Network / connectivity failures
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network request failed") ||
    lower.includes("networkerror") ||
    lower.includes("fetch error") ||
    lower.includes("load failed") ||
    lower.includes("supabase credentials not configured")
  ) {
    return "Could not reach the authentication service. Check your internet connection, or the service may be temporarily unavailable.";
  }

  if (lower.includes("invalid login") || lower.includes("invalid credentials"))
    return "Incorrect email or password.";
  if (lower.includes("email not confirmed"))
    return "Please confirm your email address before signing in.";
  if (lower.includes("already registered") || lower.includes("already exists"))
    return "An account with this email already exists. Try signing in.";
  if (lower.includes("rate limit"))
    return "Too many attempts. Please wait a moment and try again.";
  if (lower.includes("user already registered"))
    return "An account with this email already exists. Try signing in.";
  if (lower.includes("signup is disabled"))
    return "New sign-ups are currently disabled. Contact support.";
  if (lower.includes("password should be"))
    return "Password must be at least 8 characters.";

  return raw;
}
