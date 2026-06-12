"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Check, AlertCircle, Mail, Lock, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { createClient } from "@/lib/supabase/client";

const GRID_BG = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">'
  + '<path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.013)" stroke-width="0.5"/>'
  + '</svg>'
)}")`;

// ── Shared field styles ───────────────────────────────────────────────────────

function inputCss(focused: boolean): React.CSSProperties {
  return {
    width:        "100%",
    padding:      "10px 12px 10px 34px",
    borderRadius: "5px",
    fontSize:     "13px",
    background:   "rgba(255,255,255,0.032)",
    border:       `1px solid ${focused ? "rgba(83,150,220,0.45)" : "rgba(255,255,255,0.09)"}`,
    color:        "rgba(255,255,255,0.80)",
    outline:      "none",
    transition:   "border-color 0.14s ease",
  };
}

const iconCss: React.CSSProperties = {
  position:      "absolute",
  left:          10,
  top:           "50%",
  transform:     "translateY(-50%)",
  color:         "rgba(255,255,255,0.22)",
  pointerEvents: "none",
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display:       "block",
      fontSize:      "8.5px",
      fontWeight:    700,
      letterSpacing: "0.18em",
      color:         "rgba(255,255,255,0.26)",
      marginBottom:  "6px",
      textTransform: "uppercase" as const,
    }}>
      {children}
    </label>
  );
}

function Banner({ type, text }: { type: "error" | "success"; text: string }) {
  const isError = type === "error";
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display:      "flex",
        alignItems:   "flex-start",
        gap:          "9px",
        padding:      "10px 12px",
        marginBottom: "14px",
        borderLeft:   `2px solid ${isError ? "rgba(220,60,60,0.55)" : "rgba(58,184,128,0.50)"}`,
        borderRadius: "0 5px 5px 0",
        background:   isError ? "rgba(220,60,60,0.06)" : "rgba(58,184,128,0.06)",
      }}
    >
      {isError
        ? <AlertCircle size={12} style={{ color: "#e05555", flexShrink: 0, marginTop: 2 }} />
        : <Check size={12} style={{ color: "#3ab880", flexShrink: 0, marginTop: 2 }} />
      }
      <p style={{ fontSize: "12px", lineHeight: 1.5, color: isError ? "rgba(218,128,128,0.90)" : "rgba(128,210,168,0.90)" }}>
        {text}
      </p>
    </motion.div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background:     "rgba(4,8,20,0.78)",
      border:         "1px solid rgba(255,255,255,0.07)",
      borderRadius:   "8px",
      overflow:       "hidden",
      backdropFilter: "blur(12px)",
    }}>
      {children}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding:     "14px 22px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      background:   "rgba(255,255,255,0.016)",
    }}>
      <p style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.18em", color: "rgba(255,255,255,0.28)" }}>
        {label}
      </p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, firstName, lastName, fullName, initials, memberSince, refetch } = useProfile();
  const supabase = useMemo(() => createClient(), []);

  // Redirect if not signed in
  useEffect(() => {
    if (user === null) router.replace("/auth");
  }, [user, router]);

  // ── Profile form state ────────────────────────────────────────────────────

  const [pFirstName,    setPFirstName]    = useState("");
  const [pLastName,     setPLastName]     = useState("");
  const [pDisplayName,  setPDisplayName]  = useState("");
  const [pLoading,      setPLoading]      = useState(false);
  const [pError,        setPError]        = useState<string | null>(null);
  const [pSuccess,      setPSuccess]      = useState<string | null>(null);
  const [pFocus,        setPFocus]        = useState<string | null>(null);

  // Populate form from profile once loaded
  useEffect(() => {
    setPFirstName(profile?.first_name   ?? firstName ?? "");
    setPLastName( profile?.last_name    ?? lastName  ?? "");
    setPDisplayName(profile?.display_name ?? "");
  }, [profile, firstName, lastName]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setPLoading(true);
    setPError(null);
    setPSuccess(null);

    const { error } = await supabase
      .from("profiles")
      .upsert({
        id:           user.id,
        first_name:   pFirstName.trim()   || null,
        last_name:    pLastName.trim()    || null,
        display_name: pDisplayName.trim() || pFirstName.trim() || null,
      }, { onConflict: "id" });

    setPLoading(false);
    if (error) {
      setPError(error.message);
    } else {
      setPSuccess("Profile updated.");
      refetch();
    }
  }

  // ── Password form state ───────────────────────────────────────────────────

  const [pwNew,      setPwNew]      = useState("");
  const [pwConfirm,  setPwConfirm]  = useState("");
  const [pwLoading,  setPwLoading]  = useState(false);
  const [pwError,    setPwError]    = useState<string | null>(null);
  const [pwSuccess,  setPwSuccess]  = useState<string | null>(null);
  const [pwFocus,    setPwFocus]    = useState<string | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwNew !== pwConfirm) { setPwError("Passwords do not match."); return; }
    if (pwNew.length < 8)    { setPwError("Password must be at least 8 characters."); return; }
    setPwLoading(true);
    setPwError(null);
    setPwSuccess(null);

    const { error } = await supabase.auth.updateUser({ password: pwNew });
    setPwLoading(false);
    if (error) {
      setPwError(error.message);
    } else {
      setPwSuccess("Password updated.");
      setPwNew("");
      setPwConfirm("");
    }
  }

  // ── Email form state ──────────────────────────────────────────────────────

  const [newEmail,    setNewEmail]    = useState("");
  const [emLoading,   setEmLoading]   = useState(false);
  const [emError,     setEmError]     = useState<string | null>(null);
  const [emSuccess,   setEmSuccess]   = useState<string | null>(null);
  const [emFocus,     setEmFocus]     = useState(false);

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setEmLoading(true);
    setEmError(null);
    setEmSuccess(null);

    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmLoading(false);
    if (error) {
      setEmError(error.message);
    } else {
      setEmSuccess(`Confirmation sent to ${newEmail.trim()}. Check your inbox to confirm the change.`);
      setNewEmail("");
    }
  }

  if (!user) return null;

  return (
    <div style={{ background: "#030710", minHeight: "100vh", position: "relative" }}>
      <div aria-hidden className="absolute inset-0 pointer-events-none select-none"
        style={{ backgroundImage: GRID_BG, backgroundRepeat: "repeat" }} />
      <div aria-hidden className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 100% 60% at 50% 0%, rgba(8,20,70,0.40) 0%, transparent 70%)" }} />

      <div className="relative max-w-2xl mx-auto px-6 py-12 sm:py-16" style={{ zIndex: 1 }}>

        {/* ── Back nav ──────────────────────────────────────────────────── */}
        <Link href="/" className="inline-flex items-center gap-2 mb-10 group" style={{ textDecoration: "none" }}>
          <ArrowLeft size={12} style={{ color: "rgba(255,255,255,0.28)", transition: "color 0.15s" }} />
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.28)", letterSpacing: "0.04em", transition: "color 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.28)"; }}
          >
            Back
          </span>
        </Link>

        {/* ── Page heading ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.30 }}
          className="flex items-center gap-5 mb-10"
        >
          {/* Avatar */}
          <div
            style={{
              width:      64,
              height:     64,
              borderRadius: "50%",
              background: "linear-gradient(145deg, #152550 0%, #1a3a72 100%)",
              display:    "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize:   "20px",
              fontWeight: 700,
              color:      "rgba(255,255,255,0.72)",
              flexShrink: 0,
              boxShadow:  "0 4px 16px rgba(26,58,114,0.40)",
              letterSpacing: "0.04em",
            }}
          >
            {initials}
          </div>

          <div>
            <h1 style={{
              fontSize: "18px", fontWeight: 500, letterSpacing: "-0.01em",
              color: "rgba(255,255,255,0.80)", marginBottom: "4px", lineHeight: 1.2,
            }}>
              {fullName !== "there" ? fullName : "Your Account"}
            </h1>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.30)" }}>
              {user.email}
            </p>
            {memberSince && (
              <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.18)", marginTop: "2px", letterSpacing: "0.04em" }}>
                Member since {memberSince}
              </p>
            )}
          </div>
        </motion.div>

        <div className="flex flex-col gap-5">

          {/* ── Profile ─────────────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06, duration: 0.30 }}>
            <SectionCard>
              <SectionHeader label="Profile Information" />
              <form onSubmit={saveProfile} style={{ padding: "20px 22px 22px" }}>
                {pError   && <Banner type="error"   text={pError} />}
                {pSuccess  && <Banner type="success" text={pSuccess} />}

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <FieldLabel>First name</FieldLabel>
                    <div style={{ position: "relative" }}>
                      <User size={12} style={iconCss} />
                      <input
                        type="text"
                        value={pFirstName}
                        onChange={e => setPFirstName(e.target.value)}
                        placeholder="Edward"
                        autoComplete="given-name"
                        style={inputCss(pFocus === "first")}
                        onFocus={() => setPFocus("first")}
                        onBlur={() => setPFocus(null)}
                      />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Last name</FieldLabel>
                    <div style={{ position: "relative" }}>
                      <User size={12} style={iconCss} />
                      <input
                        type="text"
                        value={pLastName}
                        onChange={e => setPLastName(e.target.value)}
                        placeholder="O'Neill"
                        autoComplete="family-name"
                        style={inputCss(pFocus === "last")}
                        onFocus={() => setPFocus("last")}
                        onBlur={() => setPFocus(null)}
                      />
                    </div>
                  </div>
                </div>

                <div className="mb-5">
                  <FieldLabel>Display name <span style={{ fontWeight: 400, opacity: 0.45 }}>(used in greetings)</span></FieldLabel>
                  <div style={{ position: "relative" }}>
                    <User size={12} style={iconCss} />
                    <input
                      type="text"
                      value={pDisplayName}
                      onChange={e => setPDisplayName(e.target.value)}
                      placeholder={pFirstName || "Edward"}
                      autoComplete="nickname"
                      style={inputCss(pFocus === "display")}
                      onFocus={() => setPFocus("display")}
                      onBlur={() => setPFocus(null)}
                    />
                  </div>
                  <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.18)", marginTop: "5px" }}>
                    Defaults to first name if left blank.
                  </p>
                </div>

                <SaveButton loading={pLoading} />
              </form>
            </SectionCard>
          </motion.div>

          {/* ── Email ───────────────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10, duration: 0.30 }}>
            <SectionCard>
              <SectionHeader label="Email Address" />
              <form onSubmit={changeEmail} style={{ padding: "20px 22px 22px" }}>
                {emError   && <Banner type="error"   text={emError}   />}
                {emSuccess  && <Banner type="success" text={emSuccess} />}

                <div className="mb-3">
                  <FieldLabel>Current email</FieldLabel>
                  <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.36)", padding: "10px 0 0 2px" }}>
                    {user.email}
                  </p>
                </div>

                <div className="mb-5">
                  <FieldLabel>New email address</FieldLabel>
                  <div style={{ position: "relative" }}>
                    <Mail size={12} style={iconCss} />
                    <input
                      type="email"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      placeholder="new@example.com"
                      autoComplete="email"
                      style={inputCss(emFocus)}
                      onFocus={() => setEmFocus(true)}
                      onBlur={() => setEmFocus(false)}
                    />
                  </div>
                  <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.18)", marginTop: "5px" }}>
                    A confirmation link will be sent to the new address.
                  </p>
                </div>

                <SaveButton loading={emLoading} label="Send confirmation" />
              </form>
            </SectionCard>
          </motion.div>

          {/* ── Password ────────────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14, duration: 0.30 }}>
            <SectionCard>
              <SectionHeader label="Security" />
              <form onSubmit={changePassword} style={{ padding: "20px 22px 22px" }}>
                {pwError   && <Banner type="error"   text={pwError}   />}
                {pwSuccess  && <Banner type="success" text={pwSuccess} />}

                <div className="mb-4">
                  <FieldLabel>New password</FieldLabel>
                  <div style={{ position: "relative" }}>
                    <Lock size={12} style={iconCss} />
                    <input
                      type="password"
                      value={pwNew}
                      onChange={e => setPwNew(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      minLength={8}
                      style={inputCss(pwFocus === "new")}
                      onFocus={() => setPwFocus("new")}
                      onBlur={() => setPwFocus(null)}
                    />
                  </div>
                </div>

                <div className="mb-5">
                  <FieldLabel>Confirm new password</FieldLabel>
                  <div style={{ position: "relative" }}>
                    <Lock size={12} style={iconCss} />
                    <input
                      type="password"
                      value={pwConfirm}
                      onChange={e => setPwConfirm(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      style={inputCss(pwFocus === "confirm")}
                      onFocus={() => setPwFocus("confirm")}
                      onBlur={() => setPwFocus(null)}
                    />
                  </div>
                  <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.18)", marginTop: "5px" }}>
                    Minimum 8 characters.
                  </p>
                </div>

                <SaveButton loading={pwLoading} label="Update password" />
              </form>
            </SectionCard>
          </motion.div>

          {/* ── Account details ─────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.30 }}>
            <SectionCard>
              <SectionHeader label="Account Details" />
              <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <DetailRow label="Account ID" value={user.id.slice(0, 8).toUpperCase() + "…"} />
                {memberSince && <DetailRow label="Member since" value={memberSince} />}
                <DetailRow label="Status" value="Active" valueColor="rgba(58,184,128,0.70)" />
              </div>
            </SectionCard>
          </motion.div>

        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SaveButton({ loading, label = "Save changes" }: { loading: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           "7px",
        padding:       "10px 20px",
        borderRadius:  "5px",
        fontSize:      "10.5px",
        fontWeight:    700,
        letterSpacing: "0.12em",
        border:        "none",
        background:    loading ? "rgba(37,99,235,0.45)" : "rgba(37,99,235,0.85)",
        color:         "rgba(255,255,255,0.88)",
        cursor:        loading ? "default" : "pointer",
        transition:    "background 0.14s",
      }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#2563EB"; }}
      onMouseLeave={e => { if (!loading) e.currentTarget.style.background = "rgba(37,99,235,0.85)"; }}
    >
      {loading && (
        <span className="inline-block w-3 h-3 border border-white/30 border-t-white/70 rounded-full animate-spin" />
      )}
      {loading ? "Saving…" : label}
    </button>
  );
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.28)", letterSpacing: "0.04em" }}>{label}</span>
      <span style={{ fontSize: "11.5px", color: valueColor ?? "rgba(255,255,255,0.50)", fontFamily: "monospace" }}>
        {value}
      </span>
    </div>
  );
}
