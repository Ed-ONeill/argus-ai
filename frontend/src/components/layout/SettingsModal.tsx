"use client";

import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";

const MODELS = [
  "gemma3:12b",
  "gemma3:4b",
  "llama3.1:8b",
  "mistral:7b",
  "qwen2.5:7b",
];

interface SettingsModalProps {
  open:       boolean;
  onClose:    () => void;
  modelName:  string;
  onChange:   (model: string) => void;
}

export function SettingsModal({ open, onClose, modelName, onChange }: SettingsModalProps) {
  const [draft, setDraft] = useState(modelName);

  function save() {
    onChange(draft);
    onClose();
  }

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
            <div className="pointer-events-auto w-full max-w-sm bg-surface rounded-2xl shadow-modal
                            border border-edge overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-edge">
                <h2 className="text-sm font-semibold text-ink">Settings</h2>
                <button onClick={onClose} className="p-1.5 rounded-md hover:bg-raised text-ink-muted hover:text-ink transition-colors">
                  <X size={15} />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-5">
                <div className="space-y-2">
                  <label className="text-2xs font-semibold uppercase tracking-widest text-ink-muted block">
                    LLM Model
                  </label>
                  <div className="space-y-1">
                    {MODELS.map(m => (
                      <button
                        key={m}
                        onClick={() => setDraft(m)}
                        className={cn(
                          "w-full text-left text-sm px-3 py-2 rounded-lg transition-colors font-mono",
                          draft === m
                            ? "bg-navy text-white"
                            : "text-ink-secondary hover:bg-raised"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                    {/* Custom model entry */}
                    <input
                      value={!MODELS.includes(draft) ? draft : ""}
                      onChange={e => setDraft(e.target.value)}
                      placeholder="Custom model name…"
                      className="w-full text-sm px-3 py-2 rounded-lg border border-edge
                                 bg-raised text-ink placeholder:text-ink-muted
                                 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
                                 font-mono mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-2 px-5 py-4 border-t border-edge">
                <button
                  onClick={onClose}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-ink-secondary hover:bg-raised transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-navy text-white
                             hover:bg-navy-600 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
