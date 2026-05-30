"use client";

import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

const STORAGE_KEY = "argus_terminal_settings";

interface TerminalSettings {
  compactMode:       boolean;
  showAlerts:        boolean;
  showMomentum:      boolean;
  autoRefresh:       boolean;
}

function loadSettings(): TerminalSettings {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
  } catch {
    return defaults();
  }
}

function defaults(): TerminalSettings {
  return { compactMode: false, showAlerts: true, showMomentum: true, autoRefresh: false };
}

interface SettingsModalProps {
  open:    boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<TerminalSettings>(defaults);

  useEffect(() => {
    if (open) setSettings(loadSettings());
  }, [open]);

  function toggle(key: keyof TerminalSettings) {
    setSettings(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const rows: { key: keyof TerminalSettings; label: string; description: string }[] = [
    { key: "compactMode",  label: "Compact Mode",       description: "Hide theme descriptions in the terminal grid" },
    { key: "showAlerts",   label: "Show Signal Alerts",  description: "Display alert badges when signals change"      },
    { key: "showMomentum", label: "Momentum Changes",    description: "Show momentum score and trend history"         },
    { key: "autoRefresh",  label: "Auto Refresh",        description: "Refresh feed data every 5 minutes"            },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="modal-bg"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1,    y: 0 }}
            exit={{   opacity: 0, scale: 0.95,  y: 8 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-sm rounded-2xl overflow-hidden"
              style={{
                background: "rgba(5,8,18,0.97)",
                border:     "1px solid rgba(255,255,255,0.07)",
                boxShadow:  "0 24px 64px rgba(0,0,0,0.60)",
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div>
                  <h2 className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.80)" }}>
                    Terminal Settings
                  </h2>
                  <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.28)" }}>
                    Intelligence display preferences
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.05]"
                  style={{ color: "rgba(255,255,255,0.32)" }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Settings rows */}
              <div className="p-4 space-y-1">
                {rows.map(({ key, label, description }) => (
                  <button
                    key={key}
                    onClick={() => toggle(key)}
                    className="w-full flex items-center justify-between px-3 py-3 rounded-xl transition-colors"
                    style={{ background: settings[key] ? "rgba(82,176,200,0.06)" : "transparent" }}
                  >
                    <div className="text-left">
                      <p className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.72)" }}>
                        {label}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.28)" }}>
                        {description}
                      </p>
                    </div>
                    <div
                      className="shrink-0 w-8 h-4.5 rounded-full transition-colors ml-3 relative"
                      style={{
                        width:      32,
                        height:     18,
                        background: settings[key] ? "#52b0c8" : "rgba(255,255,255,0.10)",
                        border:     `1px solid ${settings[key] ? "rgba(82,176,200,0.40)" : "rgba(255,255,255,0.10)"}`,
                      }}
                    >
                      <span
                        className="absolute top-0.5 rounded-full transition-all"
                        style={{
                          width:      14,
                          height:     14,
                          background: "rgba(255,255,255,0.90)",
                          left:       settings[key] ? 15 : 2,
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>

              {/* Footer */}
              <div
                className="px-5 py-3.5"
                style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
              >
                <button
                  onClick={onClose}
                  className="w-full py-2 rounded-xl text-[12px] font-medium transition-colors"
                  style={{ background: "rgba(82,176,200,0.10)", color: "#52b0c8" }}
                >
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
