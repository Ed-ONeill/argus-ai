"use client";

import { useEffect, useRef, useState } from "react";
import { X, Play, Pause, ExternalLink, Headphones } from "lucide-react";
import { motion } from "framer-motion";
import { TOPIC_COLOR } from "./TopicFilterBar";
import { formatDuration } from "./EpisodeCard";
import type { Episode } from "@/lib/types";

function pad(n: number) { return String(Math.floor(n)).padStart(2, "0"); }
function formatTime(s: number) { return `${pad(s / 60)}:${pad(s % 60)}`; }

interface MiniPlayerProps {
  episode: Episode;
  onClose: () => void;
}

export function MiniPlayer({ episode, onClose }: MiniPlayerProps) {
  const audioRef                = useRef<HTMLAudioElement>(null);
  const [playing,  setPlaying]  = useState(false);
  const [current,  setCurrent]  = useState(0);
  const [duration, setDuration] = useState(episode.duration_seconds);

  const color    = TOPIC_COLOR[episode.topics[0]] ?? "#2563EB";
  const initials = episode.show_name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const progress = duration > 0 ? (current / duration) * 100 : 0;

  // Start audio when episode changes (only if audio_url present)
  useEffect(() => {
    if (!episode.audio_url || !audioRef.current) return;
    audioRef.current.src = episode.audio_url;
    audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    return () => { audioRef.current?.pause(); };
  }, [episode.id, episode.audio_url]);

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else         { audioRef.current.play();  setPlaying(true);  }
  }

  // ── Shared wrapper ────────────────────────────────────────────────────────────

  const wrapper = (children: React.ReactNode) => (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0,  opacity: 1 }}
      exit={{   y: 80,  opacity: 0 }}
      transition={{ type: "spring", bounce: 0.1, duration: 0.38 }}
      className="fixed bottom-0 inset-x-0 z-50 bg-surface/95 backdrop-blur-md border-t border-edge shadow-modal"
    >
      {children}
    </motion.div>
  );

  // ── Artwork chip ──────────────────────────────────────────────────────────────

  const artwork = (
    <div
      className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center"
      style={{
        background: `linear-gradient(135deg, ${color}14 0%, ${color}28 100%)`,
        border:     `1px solid ${color}20`,
      }}
    >
      <span className="font-extrabold text-[10px]" style={{ color }}>{initials}</span>
    </div>
  );

  // ── External-only mode ────────────────────────────────────────────────────────

  if (!episode.audio_url) {
    return wrapper(
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
        {artwork}

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-ink truncate">{episode.title}</p>
          <p className="text-2xs text-ink-muted">
            {episode.show_name} · {formatDuration(episode.duration_seconds)} · Opens externally
          </p>
        </div>

        <a
          href={episode.external_url ?? "#"}
          target="_blank"
          rel="noopener,noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0"
          style={{ background: color }}
        >
          <Headphones size={11} />
          Open
          <ExternalLink size={9} className="opacity-70" />
        </a>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-raised transition-colors shrink-0"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>,
    );
  }

  // ── In-app audio player ───────────────────────────────────────────────────────

  return wrapper(
    <>
      {/* Seek progress bar */}
      <div className="h-[2px] bg-edge">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${progress}%`, background: color }}
        />
      </div>

      <audio
        ref={audioRef}
        onTimeUpdate={() => setCurrent(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? episode.duration_seconds)}
        onEnded={() => setPlaying(false)}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
        {artwork}

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-ink truncate">{episode.title}</p>
          <p className="text-2xs text-ink-muted">{episode.show_name}</p>
        </div>

        {/* Time display */}
        <span className="text-2xs text-ink-muted tabular-nums hidden sm:block shrink-0">
          {formatTime(current)} / {formatTime(duration)}
        </span>

        {/* Play / Pause */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={togglePlay}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
          style={{ background: color }}
          title={playing ? "Pause" : "Play"}
        >
          {playing
            ? <Pause size={13} fill="currentColor" />
            : <Play  size={13} fill="currentColor" />
          }
        </motion.button>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-raised transition-colors shrink-0"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </>,
  );
}
