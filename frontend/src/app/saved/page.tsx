"use client";

import { motion } from "framer-motion";
import { Bookmark } from "lucide-react";
import Link from "next/link";
import { useSaved } from "@/hooks/useSaved";
import { useAuth } from "@/context/AuthContext";
import { StoryCard } from "@/components/feed/StoryCard";

export default function SavedPage() {
  const { savedItems, toggleSave } = useSaved();
  const { user, loading }          = useAuth();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-1">
        <Bookmark size={18} className="text-navy" />
        <h1 className="text-xl font-semibold text-ink">Saved</h1>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <p className="text-sm text-ink-secondary">
          {loading
            ? "Loading…"
            : user
            ? "Synced across all your devices."
            : "Saved locally on this device."}
        </p>
        {!loading && !user && (
          <Link
            href="/auth"
            className="text-sm text-accent font-medium hover:underline shrink-0"
          >
            Sign in to sync →
          </Link>
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {savedItems.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20 text-ink-muted"
        >
          <Bookmark size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No saved stories yet.</p>
          <p className="text-xs mt-1 opacity-70">
            Bookmark articles from the feed using the save button.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {savedItems.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <StoryCard
                item={item}
                isSaved={true}
                onSave={() => toggleSave(item)}
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
