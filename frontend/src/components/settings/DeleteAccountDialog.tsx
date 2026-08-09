"use client";

// DeleteAccountDialog — the H6 account-deletion confirmation (irreversible, permanent).
// Requires the user to type their exact account email before the delete action enables. On
// success it clears this device's Argus caches, signs out, and leaves for /auth. On FAILURE it
// keeps the session and never claims the account was deleted.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { deleteAccount } from "@/lib/api";
import { clearArgusLocalData } from "@/lib/argusLocalData";

export function DeleteAccountDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = email.length > 0 && typed.trim().toLowerCase() === email.trim().toLowerCase();

  async function onConfirm() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(); // throws unless the backend CONFIRMS success
    } catch {
      // Failure: session stays intact; do not tell the user the account was deleted.
      setError("We couldn't delete your account. No changes were made — please try again.");
      setBusy(false);
      return;
    }
    // Success only: clear this device's Argus caches, sign out, then leave for /auth.
    clearArgusLocalData();
    try { await signOut(); } catch { /* proceed to /auth regardless */ }
    router.replace("/auth");
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="del-title"
      onClick={busy ? undefined : onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center",
               justifyContent: "center", padding: 16, background: "rgba(3,6,12,0.72)", backdropFilter: "blur(2px)" }}
    >
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, borderRadius: 14, background: "#0c131f",
                 border: "1px solid rgba(248,113,113,0.28)", boxShadow: "0 24px 60px rgba(0,0,0,0.6)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <AlertTriangle size={18} style={{ color: "#f87171" }} />
          <span id="del-title" style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.94)" }}>Delete account</span>
          <button onClick={onClose} disabled={busy} aria-label="Close" style={{ marginLeft: "auto", color: "rgba(255,255,255,0.4)", padding: 4 }}><X size={16} /></button>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.78)" }}>
            This <b style={{ color: "#f87171" }}>permanently deletes</b> your Argus account and everything tied to it — your
            profile, saved items, watchlist, and preferences. This cannot be undone.
          </p>
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "rgba(255,255,255,0.55)" }}>
            Type your email <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>{email}</span> to confirm.
          </p>
          <input
            value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy}
            type="email" autoComplete="off" spellCheck={false} placeholder="you@example.com"
            style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)",
                     border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)", fontSize: 13, outline: "none" }}
          />
          {error && <p role="alert" style={{ fontSize: 12.5, color: "#f87171", lineHeight: 1.5 }}>{error}</p>}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button onClick={onClose} disabled={busy}
              style={{ padding: "9px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                       color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.14)", background: "transparent" }}>
              Cancel
            </button>
            <button onClick={onConfirm} disabled={!matches || busy}
              style={{ padding: "9px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                       color: "#fff", border: "1px solid transparent",
                       background: !matches || busy ? "rgba(248,113,113,0.32)" : "#dc2626",
                       cursor: !matches || busy ? "not-allowed" : "pointer" }}>
              {busy ? "Deleting…" : "Permanently delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
