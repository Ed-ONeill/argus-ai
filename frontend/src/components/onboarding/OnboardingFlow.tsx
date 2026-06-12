"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";

// ── Data ─────────────────────────────────────────────────────────────────────

const SECTORS = [
  "Technology",           "Healthcare",          "Financial Services",
  "Energy",               "Industrials",         "Consumer Discretionary",
  "Materials",            "Real Estate",         "Communication Services",
  "Consumer Staples",     "Utilities",
] as const;

const ASSET_CLASSES = [
  "Equities",     "Fixed Income",  "FX / Currencies",
  "Commodities",  "Crypto",        "Private Equity",
  "Real Estate",  "Derivatives",
] as const;

const ROLES = [
  { id: "professional", label: "Investment Professional", desc: "Portfolio manager, analyst, or trader"  },
  { id: "pm",           label: "Portfolio Manager",       desc: "Active portfolio construction and risk"  },
  { id: "operator",     label: "Executive / Operator",    desc: "CEO, CFO, or business leader"            },
  { id: "researcher",   label: "Researcher",              desc: "Academic or independent research"        },
  { id: "student",      label: "Student",                 desc: "Finance, economics, or related field"    },
  { id: "other",        label: "Other",                   desc: ""                                        },
] as const;

const MARKETS = [
  "United States", "Europe",          "China",
  "Japan",         "India",           "Emerging Markets",
  "Global",
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "welcome" | "name" | "sectors" | "assets" | "role" | "region" | "summary";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onComplete:         () => void;
  needsNameCapture?:  boolean;
  firstName?:         string;
  onRefetchProfile?:  () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OnboardingFlow({ onComplete, needsNameCapture, firstName: propFirstName, onRefetchProfile }: Props) {
  const { user }  = useAuth();
  const supabase  = useMemo(() => createClient(), []);

  const steps = useMemo<Step[]>(() => [
    "welcome",
    ...(needsNameCapture ? (["name"] as Step[]) : []),
    "sectors",
    "assets",
    "role",
    "region",
    "summary",
  ], [needsNameCapture]);

  const [step,             setStep]    = useState<Step>("welcome");
  const [direction,        setDir]     = useState(1);
  const [capturedFirst,    setCapFirst] = useState("");
  const [capturedLast,     setCapLast]  = useState("");
  const [nameError,        setNameError] = useState<string | null>(null);
  const [selectedSectors,  setSectors]  = useState<string[]>([]);
  const [selectedAssets,   setAssets]   = useState<string[]>([]);
  const [selectedRole,     setRole]     = useState<string>("");
  const [selectedRegion,   setRegion]   = useState<string>("");
  const [saving,           setSaving]   = useState(false);

  const stepIndex = steps.indexOf(step);

  function advance() {
    // Validate name step before advancing
    if (step === "name" && !capturedFirst.trim()) {
      setNameError("First name is required.");
      return;
    }
    setDir(1);
    setStep(steps[stepIndex + 1]);
  }
  function back() {
    setDir(-1);
    setStep(steps[stepIndex - 1]);
  }

  function toggle<T>(list: T[], setList: (v: T[]) => void, val: T) {
    setList(list.includes(val) ? list.filter(x => x !== val) : [...list, val]);
  }

  async function finish() {
    setSaving(true);
    if (user) {
      try {
        // Save name if captured in this session
        if (needsNameCapture && capturedFirst.trim()) {
          await supabase.auth.updateUser({
            data: { first_name: capturedFirst.trim(), last_name: capturedLast.trim() },
          });
          await supabase.from("profiles").upsert({
            id:           user.id,
            first_name:   capturedFirst.trim(),
            last_name:    capturedLast.trim() || null,
            display_name: capturedFirst.trim(),
          }, { onConflict: "id" });
        }

        // Save preferences
        await supabase.from("user_preferences").upsert({
          user_id:                user.id,
          followed_sectors:       selectedSectors,
          followed_asset_classes: selectedAssets,
          user_role:              selectedRole  || null,
          region_focus:           selectedRegion || null,
          updated_at:             new Date().toISOString(),
        }, { onConflict: "user_id" });

        await supabase.from("profiles")
          .update({ onboarding_completed: true })
          .eq("id", user.id);

        onRefetchProfile?.();
      } catch {
        // Non-fatal
      }
      localStorage.setItem("argus_onboarding_v1", "done");
    }
    setSaving(false);
    onComplete();
  }

  const variants = {
    enter:  (d: number) => ({ opacity: 0, x: d > 0 ? 28 : -28 }),
    center: { opacity: 1, x: 0 },
    exit:   (d: number) => ({ opacity: 0, x: d > 0 ? -28 : 28 }),
  };

  const showProgress = step !== "welcome" && step !== "summary";
  const progressPct  = showProgress ? (stepIndex / (steps.length - 1)) * 100 : 0;

  const displayFirstName =
    (needsNameCapture && capturedFirst.trim()) ? capturedFirst.trim()
    : (propFirstName && propFirstName !== "there") ? propFirstName
    : null;

  const roleLabel = ROLES.find(r => r.id === selectedRole)?.label ?? selectedRole;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(3,7,16,0.93)", backdropFilter: "blur(12px)" }}
    >
      <div
        style={{
          width:        "100%",
          maxWidth:     "520px",
          margin:       "16px",
          background:   "rgba(5,9,22,0.97)",
          border:       "1px solid rgba(255,255,255,0.09)",
          borderRadius: "10px",
          overflow:     "hidden",
          boxShadow:    "0 32px 80px rgba(0,0,0,0.60)",
        }}
      >
        {/* Accent */}
        <div style={{ height: "1.5px", background: "linear-gradient(to right, transparent, rgba(83,150,220,0.42), transparent)" }} />

        {/* Progress */}
        {showProgress && (
          <div style={{ height: "1.5px", background: "rgba(255,255,255,0.05)", position: "relative" }}>
            <motion.div
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              style={{ position: "absolute", inset: 0, background: "rgba(83,150,220,0.50)" }}
            />
          </div>
        )}

        <div style={{ padding: "32px 32px 28px", minHeight: "400px", display: "flex", flexDirection: "column" }}>
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={step}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.20, ease: [0.25, 0, 0.25, 1] }}
              style={{ flex: 1, display: "flex", flexDirection: "column" }}
            >
              {step === "welcome" && <StepWelcome onNext={advance} />}

              {step === "name" && (
                <StepName
                  firstName={capturedFirst}
                  lastName={capturedLast}
                  error={nameError}
                  onChangeFirst={v => { setCapFirst(v); setNameError(null); }}
                  onChangeLast={setCapLast}
                  onNext={advance}
                  onBack={back}
                />
              )}

              {step === "sectors" && (
                <StepMultiSelect
                  label="Which sectors should Argus prioritize?"
                  sub="Select the sectors most relevant to your work."
                  options={[...SECTORS]}
                  selected={selectedSectors}
                  onToggle={v => toggle(selectedSectors, setSectors, v)}
                  onNext={advance}
                  onBack={back}
                />
              )}

              {step === "assets" && (
                <StepMultiSelect
                  label="Which asset classes should shape your briefing?"
                  sub="Select the markets you actively follow."
                  options={[...ASSET_CLASSES]}
                  selected={selectedAssets}
                  onToggle={v => toggle(selectedAssets, setAssets, v)}
                  onNext={advance}
                  onBack={back}
                />
              )}

              {step === "role" && (
                <StepRoleSelect
                  selected={selectedRole}
                  onSelect={setRole}
                  onNext={advance}
                  onBack={back}
                />
              )}

              {step === "region" && (
                <StepSingleSelect
                  label="Which markets do you track most closely?"
                  sub="Select your primary geographic focus."
                  options={[...MARKETS]}
                  selected={selectedRegion}
                  onSelect={setRegion}
                  onNext={advance}
                  onBack={back}
                />
              )}

              {step === "summary" && (
                <StepSummary
                  firstName={displayFirstName}
                  sectors={selectedSectors}
                  assets={selectedAssets}
                  role={roleLabel}
                  region={selectedRegion}
                  saving={saving}
                  onFinish={finish}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ── Step: Welcome ─────────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center" style={{ gap: "22px", paddingTop: "8px" }}>
      <div style={{
        width: 58, height: 58, borderRadius: "50%",
        background: "radial-gradient(circle at 38% 38%, rgba(83,150,220,0.20) 0%, rgba(83,150,220,0.05) 60%, transparent 100%)",
        border: "1px solid rgba(83,150,220,0.20)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: "20px", fontWeight: 700, color: "rgba(83,150,220,0.70)", letterSpacing: "-0.02em" }}>A</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        <p style={{ fontSize: "17px", fontWeight: 500, color: "rgba(255,255,255,0.82)", letterSpacing: "-0.01em" }}>
          Welcome to Argus.
        </p>
        <p style={{ fontSize: "12.5px", color: "rgba(255,255,255,0.34)", lineHeight: 1.70, maxWidth: "340px" }}>
          Argus delivers institutional-grade market intelligence tailored to your focus areas.
          This takes under a minute.
        </p>
      </div>

      <button
        onClick={onNext}
        style={primaryBtn}
        onMouseEnter={e => { e.currentTarget.style.background = "#1d4ed8"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "#2563EB"; }}
      >
        Configure my profile
        <ArrowRight size={13} />
      </button>

      <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.16)", letterSpacing: "0.06em" }}>
        Adjustable at any time in account settings.
      </p>
    </div>
  );
}

// ── Step: Name Capture (existing users without a stored name) ─────────────────

function StepName({ firstName, lastName, error, onChangeFirst, onChangeLast, onNext, onBack }: {
  firstName:      string;
  lastName:       string;
  error:          string | null;
  onChangeFirst:  (v: string) => void;
  onChangeLast:   (v: string) => void;
  onNext:         () => void;
  onBack:         () => void;
}) {
  const [focusFirst, setFocusFirst] = useState(false);
  const [focusLast,  setFocusLast]  = useState(false);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "22px" }}>
      <div>
        <p style={{ fontSize: "14.5px", fontWeight: 500, color: "rgba(255,255,255,0.76)", marginBottom: "6px" }}>
          Tell Argus who you are.
        </p>
        <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.28)", lineHeight: 1.55 }}>
          Your name is used to personalize your morning briefing and profile.
        </p>
      </div>

      {error && (
        <p style={{ fontSize: "11px", color: "rgba(220,80,80,0.80)", margin: "-8px 0" }}>{error}</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <label style={labelCss}>First name <span style={{ color: "rgba(220,80,80,0.60)" }}>*</span></label>
          <div style={{ position: "relative" }}>
            <User size={12} style={inputIconCss} />
            <input
              type="text"
              value={firstName}
              onChange={e => onChangeFirst(e.target.value)}
              placeholder="Edward"
              autoComplete="given-name"
              autoFocus
              style={inputCss(focusFirst)}
              onFocus={() => setFocusFirst(true)}
              onBlur={() => setFocusFirst(false)}
            />
          </div>
        </div>
        <div>
          <label style={labelCss}>Last name <span style={{ color: "rgba(255,255,255,0.20)" }}>*</span></label>
          <div style={{ position: "relative" }}>
            <User size={12} style={inputIconCss} />
            <input
              type="text"
              value={lastName}
              onChange={e => onChangeLast(e.target.value)}
              placeholder="O'Neill"
              autoComplete="family-name"
              style={inputCss(focusLast)}
              onFocus={() => setFocusLast(true)}
              onBlur={() => setFocusLast(false)}
            />
          </div>
        </div>
      </div>

      <StepFooter onBack={onBack} onNext={onNext} />
    </div>
  );
}

// ── Step: Multi-select ────────────────────────────────────────────────────────

function StepMultiSelect({ label, sub, options, selected, onToggle, onNext, onBack }: {
  label:    string;
  sub:      string;
  options:  string[];
  selected: string[];
  onToggle: (v: string) => void;
  onNext:   () => void;
  onBack:   () => void;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "18px" }}>
      <div>
        <p style={{ fontSize: "14.5px", fontWeight: 500, color: "rgba(255,255,255,0.76)", marginBottom: "5px" }}>{label}</p>
        <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.28)" }}>{sub}</p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", flex: 1 }}>
        {options.map(opt => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              style={{
                padding:       "7px 14px",
                borderRadius:  "4px",
                fontSize:      "11.5px",
                letterSpacing: "0.02em",
                cursor:        "pointer",
                transition:    "all 0.12s ease",
                border:        active ? "1px solid rgba(83,150,220,0.52)" : "1px solid rgba(255,255,255,0.09)",
                background:    active ? "rgba(83,150,220,0.13)"           : "rgba(255,255,255,0.028)",
                color:         active ? "rgba(255,255,255,0.82)"          : "rgba(255,255,255,0.40)",
                display:       "flex", alignItems: "center", gap: "6px",
              }}
            >
              {active && <Check size={10} style={{ color: "rgba(83,150,220,0.82)", flexShrink: 0 }} />}
              {opt}
            </button>
          );
        })}
      </div>

      <StepFooter onBack={onBack} onNext={onNext} />
    </div>
  );
}

// ── Step: Role select ─────────────────────────────────────────────────────────

function StepRoleSelect({ selected, onSelect, onNext, onBack }: {
  selected: string;
  onSelect: (v: string) => void;
  onNext:   () => void;
  onBack:   () => void;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "18px" }}>
      <div>
        <p style={{ fontSize: "14.5px", fontWeight: 500, color: "rgba(255,255,255,0.76)", marginBottom: "5px" }}>
          What best describes your role?
        </p>
        <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.28)" }}>
          This shapes the framing of your intelligence briefings.
        </p>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
        {ROLES.map(r => {
          const active = selected === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "10px 14px", borderRadius: "5px", textAlign: "left",
                border:     active ? "1px solid rgba(83,150,220,0.45)" : "1px solid rgba(255,255,255,0.07)",
                background: active ? "rgba(83,150,220,0.10)"           : "rgba(255,255,255,0.020)",
                cursor: "pointer", transition: "all 0.12s ease",
              }}
            >
              <div style={{
                width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                border:     active ? "4.5px solid rgba(83,150,220,0.72)" : "1.5px solid rgba(255,255,255,0.18)",
                transition: "all 0.12s ease",
              }} />
              <div>
                <p style={{ fontSize: "12.5px", fontWeight: 500, color: active ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.50)" }}>
                  {r.label}
                </p>
                {r.desc && (
                  <p style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.22)", marginTop: 1 }}>
                    {r.desc}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <StepFooter onBack={onBack} onNext={onNext} />
    </div>
  );
}

// ── Step: Single select ───────────────────────────────────────────────────────

function StepSingleSelect({ label, sub, options, selected, onSelect, onNext, onBack }: {
  label:    string;
  sub:      string;
  options:  string[];
  selected: string;
  onSelect: (v: string) => void;
  onNext:   () => void;
  onBack:   () => void;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "18px" }}>
      <div>
        <p style={{ fontSize: "14.5px", fontWeight: 500, color: "rgba(255,255,255,0.76)", marginBottom: "5px" }}>{label}</p>
        <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.28)" }}>{sub}</p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", flex: 1 }}>
        {options.map(opt => {
          const active = selected === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onSelect(opt)}
              style={{
                padding: "8px 18px", borderRadius: "4px", fontSize: "12px",
                cursor: "pointer", transition: "all 0.12s ease",
                border:     active ? "1px solid rgba(83,150,220,0.52)" : "1px solid rgba(255,255,255,0.09)",
                background: active ? "rgba(83,150,220,0.13)"           : "rgba(255,255,255,0.028)",
                color:      active ? "rgba(255,255,255,0.82)"          : "rgba(255,255,255,0.40)",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>

      <StepFooter onBack={onBack} onNext={onNext} />
    </div>
  );
}

// ── Step: Summary ─────────────────────────────────────────────────────────────

function StepSummary({ firstName, sectors, assets, role, region, saving, onFinish }: {
  firstName: string | null;
  sectors:   string[];
  assets:    string[];
  role:      string;
  region:    string;
  saving:    boolean;
  onFinish:  () => void;
}) {
  const MAX_SHOWN = 4;

  function ChipList({ items }: { items: string[] }) {
    const shown = items.slice(0, MAX_SHOWN);
    const rest  = items.length - MAX_SHOWN;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "6px" }}>
        {shown.map(s => (
          <span key={s} style={{
            fontSize: "10.5px", padding: "3px 9px", borderRadius: "3px",
            background: "rgba(83,150,220,0.10)", border: "1px solid rgba(83,150,220,0.22)",
            color: "rgba(255,255,255,0.60)",
          }}>{s}</span>
        ))}
        {rest > 0 && (
          <span style={{
            fontSize: "10.5px", padding: "3px 9px", borderRadius: "3px",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.30)",
          }}>+{rest} more</span>
        )}
        {items.length === 0 && (
          <span style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.22)" }}>Not specified</span>
        )}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Heading */}
      <div style={{ textAlign: "center", paddingTop: "4px" }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%", margin: "0 auto 14px",
          background: "rgba(58,184,128,0.10)", border: "1px solid rgba(58,184,128,0.26)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Check size={18} style={{ color: "#3ab880" }} />
        </div>
        <p style={{ fontSize: "17px", fontWeight: 500, color: "rgba(255,255,255,0.82)", letterSpacing: "-0.01em", marginBottom: "5px" }}>
          {firstName ? `Welcome to Argus, ${firstName}.` : "Welcome to Argus."}
        </p>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.30)" }}>
          Your intelligence profile is calibrated.
        </p>
      </div>

      {/* Summary grid */}
      <div style={{
        background: "rgba(255,255,255,0.020)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "6px",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: "13px",
      }}>
        <SummaryRow label="SECTORS">
          <ChipList items={sectors} />
        </SummaryRow>
        <SummaryRow label="ASSET CLASSES">
          <ChipList items={assets} />
        </SummaryRow>
        <SummaryRow label="ROLE">
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", marginTop: "4px" }}>
            {role || <span style={{ color: "rgba(255,255,255,0.22)" }}>Not specified</span>}
          </p>
        </SummaryRow>
        <SummaryRow label="MARKET FOCUS">
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", marginTop: "4px" }}>
            {region || <span style={{ color: "rgba(255,255,255,0.22)" }}>Not specified</span>}
          </p>
        </SummaryRow>
      </div>

      {/* CTA */}
      <button
        onClick={onFinish}
        disabled={saving}
        style={{ ...primaryBtn, opacity: saving ? 0.65 : 1, justifyContent: "center", width: "100%" }}
        onMouseEnter={e => { if (!saving) e.currentTarget.style.background = "#1d4ed8"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "#2563EB"; }}
      >
        {saving ? (
          <>
            <span className="inline-block w-3 h-3 border border-white/30 border-t-white/70 rounded-full animate-spin" />
            Saving…
          </>
        ) : (
          <>
            Open Morning Brief
            <ArrowRight size={13} />
          </>
        )}
      </button>
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "12px" }}>
      <p style={{ fontSize: "8.5px", fontWeight: 700, letterSpacing: "0.18em", color: "rgba(255,255,255,0.22)" }}>
        {label}
      </p>
      {children}
    </div>
  );
}

// ── Footer navigation ─────────────────────────────────────────────────────────

function StepFooter({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between pt-2"
      style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: "auto" }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          fontSize: "11px", color: "rgba(255,255,255,0.28)", background: "none",
          border: "none", cursor: "pointer", letterSpacing: "0.04em", padding: "4px 0",
          transition: "color 0.14s",
        }}
        onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.54)"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.28)"; }}
      >
        ← Back
      </button>

      <button
        type="button"
        onClick={onNext}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "8px 20px", borderRadius: "4px",
          fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.10em",
          border: "none", background: "#2563EB", color: "rgba(255,255,255,0.92)",
          cursor: "pointer", transition: "background 0.12s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#1d4ed8"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "#2563EB"; }}
      >
        Continue
        <ArrowRight size={11} />
      </button>
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

const primaryBtn: React.CSSProperties = {
  display:       "flex",
  alignItems:    "center",
  gap:           "8px",
  padding:       "11px 28px",
  borderRadius:  "5px",
  fontSize:      "11px",
  fontWeight:    700,
  letterSpacing: "0.10em",
  border:        "none",
  background:    "#2563EB",
  color:         "rgba(255,255,255,0.92)",
  cursor:        "pointer",
  transition:    "background 0.12s ease",
};

const labelCss: React.CSSProperties = {
  display:       "block",
  fontSize:      "8.5px",
  fontWeight:    700,
  letterSpacing: "0.18em",
  color:         "rgba(255,255,255,0.26)",
  marginBottom:  "6px",
  textTransform: "uppercase",
};

const inputIconCss: React.CSSProperties = {
  position:      "absolute",
  left:          10,
  top:           "50%",
  transform:     "translateY(-50%)",
  color:         "rgba(255,255,255,0.22)",
  pointerEvents: "none",
};

function inputCss(focused: boolean): React.CSSProperties {
  return {
    width:        "100%",
    padding:      "10px 12px 10px 32px",
    borderRadius: "5px",
    fontSize:     "13px",
    background:   "rgba(255,255,255,0.032)",
    border:       `1px solid ${focused ? "rgba(83,150,220,0.48)" : "rgba(255,255,255,0.09)"}`,
    color:        "rgba(255,255,255,0.80)",
    outline:      "none",
    transition:   "border-color 0.14s ease",
  };
}
