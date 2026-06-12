"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";

// ── Option data ───────────────────────────────────────────────────────────────

const SECTORS = [
  "Technology",        "Healthcare",        "Financial Services",
  "Energy",            "Industrials",       "Consumer Discretionary",
  "Materials",         "Real Estate",       "Communication Services",
  "Consumer Staples",  "Utilities",
] as const;

const ASSET_CLASSES = [
  "Equities",           "Fixed Income",  "FX / Currencies",
  "Commodities",        "Crypto",        "Private Equity",
  "Real Estate",        "Derivatives",
] as const;

const ROLES = [
  { id: "professional", label: "Investment Professional", desc: "Portfolio manager, analyst, or trader" },
  { id: "operator",     label: "Executive / Operator",    desc: "CEO, CFO, or business leader"         },
  { id: "researcher",   label: "Researcher",              desc: "Academic or independent research"      },
  { id: "student",      label: "Student",                 desc: "Finance, economics, or related field"  },
  { id: "other",        label: "Other",                   desc: ""                                      },
] as const;

const REGIONS = [
  "North America",    "Europe",        "Asia Pacific",
  "Emerging Markets", "Latin America", "Middle East & Africa",
  "Global",
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "welcome" | "sectors" | "assets" | "role" | "region" | "done";

const STEPS: Step[] = ["welcome", "sectors", "assets", "role", "region", "done"];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: Props) {
  const { user } = useAuth();
  const supabase  = useMemo(() => createClient(), []);

  const [step,           setStep]           = useState<Step>("welcome");
  const [selectedSectors, setSectors]       = useState<string[]>([]);
  const [selectedAssets,  setAssets]        = useState<string[]>([]);
  const [selectedRole,    setRole]          = useState<string>("");
  const [selectedRegion,  setRegion]        = useState<string>("");
  const [saving,          setSaving]        = useState(false);
  const [direction,       setDirection]     = useState(1);

  const stepIndex = STEPS.indexOf(step);

  function advance(nextStep?: Step) {
    setDirection(1);
    setStep(nextStep ?? STEPS[stepIndex + 1]);
  }
  function back() {
    setDirection(-1);
    setStep(STEPS[stepIndex - 1]);
  }

  async function finish() {
    setSaving(true);
    if (user) {
      try {
        await supabase.from("user_preferences").upsert({
          user_id:                user.id,
          followed_sectors:       selectedSectors,
          followed_asset_classes: selectedAssets,
          user_role:              selectedRole || null,
          region_focus:           selectedRegion || null,
          updated_at:             new Date().toISOString(),
        }, { onConflict: "user_id" });

        await supabase.from("profiles")
          .update({ onboarding_completed: true })
          .eq("id", user.id);
      } catch {
        // Non-fatal — mark complete in localStorage regardless
      }
      localStorage.setItem("argus_onboarding_v1", "done");
    }
    setSaving(false);
    onComplete();
  }

  const variants = {
    enter:   (d: number) => ({ opacity: 0, x: d > 0 ? 24 : -24 }),
    center:  { opacity: 1, x: 0 },
    exit:    (d: number) => ({ opacity: 0, x: d > 0 ? -24 : 24 }),
  };

  function toggle<T>(list: T[], setList: (v: T[]) => void, val: T) {
    setList(list.includes(val) ? list.filter(x => x !== val) : [...list, val]);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        background: "rgba(3,7,16,0.92)",
        backdropFilter: "blur(10px)",
      }}
    >
      {/* Card */}
      <div
        style={{
          width:          "100%",
          maxWidth:       "520px",
          margin:         "16px",
          background:     "rgba(5,9,22,0.96)",
          border:         "1px solid rgba(255,255,255,0.09)",
          borderRadius:   "10px",
          overflow:       "hidden",
          boxShadow:      "0 32px 80px rgba(0,0,0,0.55)",
        }}
      >
        {/* Top accent */}
        <div style={{ height: "1.5px", background: "linear-gradient(to right, transparent, rgba(83,150,220,0.40), transparent)" }} />

        {/* Progress bar */}
        {step !== "welcome" && step !== "done" && (
          <div style={{ height: "1.5px", background: "rgba(255,255,255,0.05)", position: "relative" }}>
            <motion.div
              animate={{ width: `${(stepIndex / (STEPS.length - 1)) * 100}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              style={{ position: "absolute", inset: 0, background: "rgba(83,150,220,0.45)" }}
            />
          </div>
        )}

        {/* Step content */}
        <div style={{ padding: "32px 32px 28px", minHeight: "380px", display: "flex", flexDirection: "column" }}>
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={step}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.25, 0, 0.25, 1] }}
              style={{ flex: 1, display: "flex", flexDirection: "column" }}
            >
              {step === "welcome" && <Welcome onNext={() => advance()} />}
              {step === "sectors" && (
                <MultiSelect
                  label="Which sectors do you follow?"
                  sub="Select all that apply."
                  options={[...SECTORS]}
                  selected={selectedSectors}
                  onToggle={v => toggle(selectedSectors, setSectors, v)}
                  onNext={() => advance()}
                  onBack={back}
                />
              )}
              {step === "assets" && (
                <MultiSelect
                  label="Which asset classes matter most?"
                  sub="Select all that apply."
                  options={[...ASSET_CLASSES]}
                  selected={selectedAssets}
                  onToggle={v => toggle(selectedAssets, setAssets, v)}
                  onNext={() => advance()}
                  onBack={back}
                />
              )}
              {step === "role" && (
                <RoleSelect
                  selected={selectedRole}
                  onSelect={setRole}
                  onNext={() => advance()}
                  onBack={back}
                />
              )}
              {step === "region" && (
                <SingleSelect
                  label="Primary region focus?"
                  options={[...REGIONS]}
                  selected={selectedRegion}
                  onSelect={setRegion}
                  onNext={() => advance()}
                  onBack={back}
                />
              )}
              {step === "done" && (
                <Done onFinish={finish} saving={saving} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ── Step components ───────────────────────────────────────────────────────────

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center" style={{ gap: "20px", paddingTop: "12px" }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: "radial-gradient(circle at 38% 38%, rgba(83,150,220,0.22) 0%, rgba(83,150,220,0.06) 60%, transparent 100%)",
        border: "1px solid rgba(83,150,220,0.22)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: "18px", fontWeight: 700, color: "rgba(83,150,220,0.72)", letterSpacing: "-0.02em" }}>A</span>
      </div>

      <div style={{ gap: "8px", display: "flex", flexDirection: "column" }}>
        <p style={{ fontSize: "17px", fontWeight: 500, color: "rgba(255,255,255,0.80)", letterSpacing: "-0.01em" }}>
          Welcome to Argus.
        </p>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.34)", lineHeight: 1.65, maxWidth: "360px" }}>
          Let&apos;s configure your intelligence feed. This takes about a minute and helps Argus surface what matters to you.
        </p>
      </div>

      <button
        onClick={onNext}
        style={primaryBtn}
        onMouseEnter={e => { e.currentTarget.style.background = "#1d4ed8"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "#2563EB"; }}
      >
        Get started
        <ArrowRight size={13} />
      </button>

      <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.18)", letterSpacing: "0.06em" }}>
        You can update these anytime in settings.
      </p>
    </div>
  );
}

function MultiSelect({ label, sub, options, selected, onToggle, onNext, onBack }: {
  label: string;
  sub:   string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>
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
                border:        active ? "1px solid rgba(83,150,220,0.50)" : "1px solid rgba(255,255,255,0.09)",
                background:    active ? "rgba(83,150,220,0.12)"           : "rgba(255,255,255,0.030)",
                color:         active ? "rgba(255,255,255,0.80)"          : "rgba(255,255,255,0.40)",
                display:       "flex", alignItems: "center", gap: "6px",
              }}
            >
              {active && <Check size={10} style={{ color: "rgba(83,150,220,0.80)" }} />}
              {opt}
            </button>
          );
        })}
      </div>

      <StepFooter onBack={onBack} onNext={onNext} canSkip />
    </div>
  );
}

function RoleSelect({ selected, onSelect, onNext, onBack }: {
  selected: string;
  onSelect: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <p style={{ fontSize: "14.5px", fontWeight: 500, color: "rgba(255,255,255,0.76)", marginBottom: "5px" }}>
          How do you use market intelligence?
        </p>
        <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.28)" }}>Select the option that best describes you.</p>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "7px" }}>
        {ROLES.map(r => {
          const active = selected === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              style={{
                display:       "flex",
                alignItems:    "center",
                gap:           "12px",
                padding:       "11px 14px",
                borderRadius:  "5px",
                border:        active ? "1px solid rgba(83,150,220,0.45)" : "1px solid rgba(255,255,255,0.07)",
                background:    active ? "rgba(83,150,220,0.10)"           : "rgba(255,255,255,0.022)",
                cursor:        "pointer",
                transition:    "all 0.12s ease",
                textAlign:     "left",
              }}
            >
              <div
                style={{
                  width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                  border:     active ? "4px solid rgba(83,150,220,0.70)" : "1.5px solid rgba(255,255,255,0.18)",
                  background: active ? "transparent" : "transparent",
                  transition: "all 0.12s ease",
                }}
              />
              <div>
                <p style={{ fontSize: "12.5px", fontWeight: 500, color: active ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.50)" }}>
                  {r.label}
                </p>
                {r.desc && (
                  <p style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.24)", marginTop: 2 }}>
                    {r.desc}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <StepFooter onBack={onBack} onNext={onNext} canSkip />
    </div>
  );
}

function SingleSelect({ label, options, selected, onSelect, onNext, onBack }: {
  label: string;
  options: string[];
  selected: string;
  onSelect: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>
      <p style={{ fontSize: "14.5px", fontWeight: 500, color: "rgba(255,255,255,0.76)" }}>{label}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", flex: 1 }}>
        {options.map(opt => {
          const active = selected === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onSelect(opt)}
              style={{
                padding:      "7px 14px",
                borderRadius: "4px",
                fontSize:     "11.5px",
                cursor:       "pointer",
                transition:   "all 0.12s ease",
                border:       active ? "1px solid rgba(83,150,220,0.50)" : "1px solid rgba(255,255,255,0.09)",
                background:   active ? "rgba(83,150,220,0.12)"           : "rgba(255,255,255,0.030)",
                color:        active ? "rgba(255,255,255,0.80)"          : "rgba(255,255,255,0.40)",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>

      <StepFooter onBack={onBack} onNext={onNext} canSkip />
    </div>
  );
}

function Done({ onFinish, saving }: { onFinish: () => void; saving: boolean }) {
  return (
    <div className="flex flex-col items-center text-center" style={{ gap: "20px", paddingTop: "16px" }}>
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        background: "rgba(58,184,128,0.10)",
        border: "1px solid rgba(58,184,128,0.28)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Check size={20} style={{ color: "#3ab880" }} />
      </div>

      <div style={{ gap: "7px", display: "flex", flexDirection: "column" }}>
        <p style={{ fontSize: "16px", fontWeight: 500, color: "rgba(255,255,255,0.78)" }}>
          Your Argus feed is ready.
        </p>
        <p style={{ fontSize: "12.5px", color: "rgba(255,255,255,0.30)", lineHeight: 1.6, maxWidth: "320px" }}>
          Preferences saved. You can update them anytime in your account settings.
        </p>
      </div>

      <button
        onClick={onFinish}
        disabled={saving}
        style={{ ...primaryBtn, opacity: saving ? 0.65 : 1 }}
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
            Enter platform
            <ArrowRight size={13} />
          </>
        )}
      </button>
    </div>
  );
}

function StepFooter({ onBack, onNext, canSkip }: {
  onBack: () => void;
  onNext: () => void;
  canSkip?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          fontSize: "11px", color: "rgba(255,255,255,0.28)", background: "none",
          border: "none", cursor: "pointer", letterSpacing: "0.04em", padding: "4px 0",
        }}
        onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.52)"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.28)"; }}
      >
        ← Back
      </button>

      <div className="flex items-center gap-3">
        {canSkip && (
          <button
            type="button"
            onClick={onNext}
            style={{
              fontSize: "11px", color: "rgba(255,255,255,0.24)", background: "none",
              border: "none", cursor: "pointer", letterSpacing: "0.04em",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.44)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.24)"; }}
          >
            Skip
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "8px 18px", borderRadius: "4px",
            fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.10em",
            border: "none", background: "#2563EB", color: "rgba(255,255,255,0.90)",
            cursor: "pointer", transition: "background 0.12s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#1d4ed8"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#2563EB"; }}
        >
          Continue
          <ArrowRight size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Primitives ────────────────────────────────────────────────────────────────

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
