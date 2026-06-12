"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, User, ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type Tab      = "signin" | "signup";
type InputKey = "name" | "lastname" | "email" | "password";

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
  const [tab,          setTab]          = useState<Tab>("signin");
  const [firstName,    setFirstName]    = useState("");
  const [lastName,     setLastName]     = useState("");
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [message,      setMessage]      = useState<string | null>(null);
  const [focusedInput, setFocusedInput] = useState<InputKey | null>(null);

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
        const err = await signUp(
          email,
          password,
          firstName.trim() || undefined,
          lastName.trim()  || undefined,
        );
        if (err) {
          setError(friendlyError(err.message));
        } else {
          setMessage(
            "Check your email to confirm your account, then return to Argus to open your briefing.",
          );
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

  function inputStyle(name: InputKey): React.CSSProperties {
    const focused = focusedInput === name;
    return {
      background:   "rgba(255,255,255,0.035)",
      border:       `1px solid ${focused ? "rgba(83,150,220,0.48)" : "rgba(255,255,255,0.09)"}`,
      borderRadius: "5px",
      color:        "rgba(255,255,255,0.82)",
      fontSize:     "13px",
      padding:      "11px 12px 11px 34px",
      width:        "100%",
      outline:      "none",
      transition:   "border-color 0.15s ease, background 0.15s ease",
    };
  }

  const isSignUp = tab === "signup";

  return (
    <div
      style={{
        minHeight:  "calc(100vh - 3.5rem)",
        background: "#030710",
        display:    "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:    "32px 16px",
        position:   "relative",
        overflow:   "hidden",
      }}
    >
      {/* Grid */}
      <div aria-hidden className="absolute inset-0 pointer-events-none select-none"
        style={{ backgroundImage: GRID_BG, backgroundRepeat: "repeat" }} />

      {/* Radial glow */}
      <div aria-hidden className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 110% 70% at 50% 0%, rgba(8,20,70,0.50) 0%, rgba(5,12,40,0.18) 55%, transparent 80%)" }} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: [0.25, 0, 0.25, 1] }}
        style={{ width: "100%", maxWidth: "380px", position: "relative", zIndex: 1 }}
      >

        {/* ── Back link / classification label ──────────────────────────────── */}
        <div className="flex items-center justify-between mb-7">
          <Link
            href="/"
            className="flex items-center gap-2 group"
            style={{ textDecoration: "none" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/argus-icon.png" alt="Argus"
              style={{ width: 24, height: 24, borderRadius: 6, opacity: 0.75 }} />
            <span style={{
              fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em",
              color: "rgba(255,255,255,0.44)", transition: "color 0.15s",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.72)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.44)"; }}
            >
              Argus
            </span>
          </Link>
          <span style={{
            fontSize: "8.5px", letterSpacing: "0.20em", fontWeight: 600,
            color: "rgba(255,255,255,0.18)",
          }}>
            INTELLIGENCE PLATFORM
          </span>
        </div>

        {/* ── Card ──────────────────────────────────────────────────────────── */}
        <div style={{
          background:     "rgba(4,8,20,0.82)",
          border:         "1px solid rgba(255,255,255,0.08)",
          borderRadius:   "9px",
          overflow:       "hidden",
          backdropFilter: "blur(16px)",
        }}>
          {/* Accent line */}
          <div style={{ height: "1.5px", background: "linear-gradient(to right, transparent, rgba(83,150,220,0.40), transparent)" }} />

          <div style={{ padding: "28px 28px 26px" }}>

            {/* ── Heading ─────────────────────────────────────────────────── */}
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.20 }}
                style={{ marginBottom: "22px" }}
              >
                <h1 style={{
                  fontSize: "18px", fontWeight: 500, letterSpacing: "-0.01em",
                  color: "rgba(255,255,255,0.84)", marginBottom: "6px", lineHeight: 1.2,
                }}>
                  {isSignUp ? "Create your access." : "Access your briefing."}
                </h1>
                <p style={{
                  fontSize: "12px", color: "rgba(255,255,255,0.28)",
                  letterSpacing: "0.02em", lineHeight: 1.58,
                }}>
                  {isSignUp
                    ? "Set up your Argus account to receive your daily briefing."
                    : "Sign in to open your morning intelligence feed."}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* ── Tab switcher ────────────────────────────────────────────── */}
            <div style={{
              display: "flex",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              marginBottom: "22px",
              gap: 0,
            }}>
              {(["signin", "signup"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchTab(t)}
                  style={{
                    padding:       "8px 0",
                    paddingBottom: "9px",
                    marginRight:   "20px",
                    fontSize:      "9.5px",
                    fontWeight:    700,
                    letterSpacing: "0.16em",
                    border:        "none",
                    borderBottom:  tab === t
                      ? "1.5px solid rgba(83,150,220,0.65)"
                      : "1.5px solid transparent",
                    marginBottom:  "-1px",
                    background:    "transparent",
                    cursor:        "pointer",
                    color:         tab === t ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.28)",
                    transition:    "color 0.15s, border-color 0.15s",
                  }}
                >
                  {t === "signin" ? "SIGN IN" : "CREATE ACCESS"}
                </button>
              ))}
            </div>

            {/* ── Feedback banners ────────────────────────────────────────── */}
            <AnimatePresence>
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{
                    display:      "flex",
                    alignItems:   "flex-start",
                    gap:          "9px",
                    padding:      "10px 12px",
                    marginBottom: "16px",
                    borderLeft:   "2px solid rgba(220,60,60,0.55)",
                    borderRadius: "0 5px 5px 0",
                    background:   "rgba(220,60,60,0.06)",
                  }}
                >
                  <AlertCircle size={12} style={{ color: "#e05555", flexShrink: 0, marginTop: 2 }} />
                  <p style={{ fontSize: "12px", color: "rgba(218,128,128,0.90)", lineHeight: 1.5 }}>{error}</p>
                </motion.div>
              )}
              {message && (
                <motion.div
                  key="message"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{
                    display:      "flex",
                    alignItems:   "flex-start",
                    gap:          "9px",
                    padding:      "10px 12px",
                    marginBottom: "16px",
                    borderLeft:   "2px solid rgba(58,184,128,0.55)",
                    borderRadius: "0 5px 5px 0",
                    background:   "rgba(58,184,128,0.06)",
                  }}
                >
                  <CheckCircle size={12} style={{ color: "#3ab880", flexShrink: 0, marginTop: 2 }} />
                  <p style={{ fontSize: "12px", color: "rgba(128,210,168,0.90)", lineHeight: 1.5 }}>{message}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Form ────────────────────────────────────────────────────── */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "13px" }}>

              {/* First name + Last name — signup only */}
              <AnimatePresence>
                {isSignUp && (
                  <motion.div
                    key="namefields"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    style={{ overflow: "hidden", display: "flex", flexDirection: "column", gap: "13px" }}
                  >
                    <div>
                      <FieldLabel>First name</FieldLabel>
                      <div style={{ position: "relative" }}>
                        <User size={12} style={iconStyle} />
                        <input
                          type="text"
                          value={firstName}
                          onChange={e => setFirstName(e.target.value)}
                          placeholder="Edward"
                          autoComplete="given-name"
                          required={isSignUp}
                          style={inputStyle("name")}
                          onFocus={() => setFocusedInput("name")}
                          onBlur={() => setFocusedInput(null)}
                        />
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Last name</FieldLabel>
                      <div style={{ position: "relative" }}>
                        <User size={12} style={iconStyle} />
                        <input
                          type="text"
                          value={lastName}
                          onChange={e => setLastName(e.target.value)}
                          placeholder="O'Neill"
                          autoComplete="family-name"
                          required={isSignUp}
                          style={inputStyle("lastname")}
                          onFocus={() => setFocusedInput("lastname")}
                          onBlur={() => setFocusedInput(null)}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Email */}
              <div>
                <FieldLabel>Email address</FieldLabel>
                <div style={{ position: "relative" }}>
                  <Mail size={12} style={iconStyle} />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
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
                <FieldLabel>Password</FieldLabel>
                <div style={{ position: "relative" }}>
                  <Lock size={12} style={iconStyle} />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    required
                    minLength={8}
                    style={inputStyle("password")}
                    onFocus={() => setFocusedInput("password")}
                    onBlur={() => setFocusedInput(null)}
                  />
                </div>
                {isSignUp && (
                  <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.20)", marginTop: "5px" }}>
                    Minimum 8 characters.
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width:           "100%",
                  display:         "flex",
                  alignItems:      "center",
                  justifyContent:  "center",
                  gap:             "8px",
                  padding:         "12px",
                  borderRadius:    "5px",
                  border:          "none",
                  background:      loading ? "rgba(37,99,235,0.45)" : "#2563EB",
                  color:           "rgba(255,255,255,0.92)",
                  fontSize:        "10.5px",
                  fontWeight:      700,
                  letterSpacing:   "0.14em",
                  cursor:          loading ? "default" : "pointer",
                  marginTop:       "3px",
                  transition:      "background 0.15s ease, transform 0.08s ease",
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#1d4ed8"; }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.background = "#2563EB"; }}
                onMouseDown={e =>  { if (!loading) e.currentTarget.style.transform = "scale(0.990)"; }}
                onMouseUp={e =>    { e.currentTarget.style.transform = "scale(1)"; }}
              >
                {loading ? (
                  <>
                    <span className="inline-block w-3 h-3 border border-white/30 border-t-white/70 rounded-full animate-spin" />
                    <span style={{ opacity: 0.65 }}>
                      {isSignUp ? "Creating account…" : "Signing in…"}
                    </span>
                  </>
                ) : (
                  <>
                    {isSignUp ? "CREATE ACCOUNT" : "SIGN IN"}
                    <ArrowRight size={12} />
                  </>
                )}
              </button>
            </form>

          </div>

          {/* Card footer */}
          <div style={{
            padding:     "14px 28px",
            borderTop:   "1px solid rgba(255,255,255,0.05)",
            background:  "rgba(255,255,255,0.012)",
            textAlign:   "center",
          }}>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.22)" }}>
              {isSignUp ? "Already have access? " : "New to Argus? "}
            </span>
            <button
              type="button"
              onClick={() => switchTab(isSignUp ? "signin" : "signup")}
              style={{
                fontSize:      "11px",
                color:         "rgba(255,255,255,0.46)",
                background:    "none",
                border:        "none",
                cursor:        "pointer",
                letterSpacing: "0.02em",
                padding:       0,
                transition:    "color 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.72)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.46)"; }}
            >
              {isSignUp ? "Sign in →" : "Create access →"}
            </button>
          </div>
        </div>

        {/* ── Guest link ────────────────────────────────────────────────────── */}
        <div style={{ marginTop: "18px", textAlign: "center" }}>
          <Link
            href="/"
            style={{
              fontSize:      "11px",
              color:         "rgba(255,255,255,0.20)",
              letterSpacing: "0.03em",
              textDecoration: "none",
              transition:    "color 0.15s ease",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.44)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.20)"; }}
          >
            Continue without an account →
          </Link>
        </div>

      </motion.div>
    </div>
  );
}

// ── Shared field primitives ───────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display:       "block",
      fontSize:      "8.5px",
      fontWeight:    700,
      letterSpacing: "0.18em",
      color:         "rgba(255,255,255,0.28)",
      marginBottom:  "6px",
      textTransform: "uppercase" as const,
    }}>
      {children}
    </label>
  );
}

const iconStyle: React.CSSProperties = {
  position:      "absolute",
  left:          10,
  top:           "50%",
  transform:     "translateY(-50%)",
  color:         "rgba(255,255,255,0.25)",
  pointerEvents: "none",
};

// ── Error helpers ─────────────────────────────────────────────────────────────

function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("network request failed") ||
    lower.includes("networkerror") ||
    lower.includes("fetch error") ||
    lower.includes("load failed") ||
    lower.includes("supabase credentials not configured")
  ) {
    return "Could not reach the authentication service. Check your internet connection or try again shortly.";
  }

  if (lower.includes("invalid login") || lower.includes("invalid credentials"))
    return "Incorrect email or password.";
  if (lower.includes("email not confirmed"))
    return "Please confirm your email before signing in. Check your inbox.";
  if (lower.includes("already registered") || lower.includes("already exists") || lower.includes("user already registered"))
    return "An account with this email already exists. Sign in instead.";
  if (lower.includes("rate limit"))
    return "Too many attempts. Please wait a moment and try again.";
  if (lower.includes("signup is disabled"))
    return "New sign-ups are currently disabled.";
  if (lower.includes("password should be") || lower.includes("password must be"))
    return "Password must be at least 8 characters.";

  return raw;
}
