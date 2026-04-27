"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const LISTEN_TOPICS: { label: string; value: string; color?: string }[] = [
  { label: "All",             value: "",                color: undefined   },
  { label: "Markets",         value: "Markets",         color: "#2563EB"   },
  { label: "Macro",           value: "Macro",           color: "#D97706"   },
  { label: "M&A",             value: "M&A",             color: "#7C3AED"   },
  { label: "Company",         value: "Company",         color: "#0891B2"   },
  { label: "Geopolitical",    value: "Geopolitical",    color: "#DC2626"   },
  { label: "Tech / AI",       value: "Tech / AI",       color: "#10B981"   },
  { label: "Private Markets", value: "Private Markets", color: "#64748B"   },
];

export const TOPIC_COLOR: Record<string, string> = Object.fromEntries(
  LISTEN_TOPICS.filter(t => t.color).map(t => [t.value, t.color as string]),
);

interface TopicFilterBarProps {
  active:   string;
  onChange: (topic: string) => void;
}

export function TopicFilterBar({ active, onChange }: TopicFilterBarProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
      {LISTEN_TOPICS.map(({ label, value, color }) => {
        const isActive = active === value;
        return (
          <motion.button
            key={value || "all"}
            whileHover={isActive ? {} : { scale: 1.025, y: -1, transition: { duration: 0.15, ease: "easeOut" } }}
            whileTap={{ scale: 0.93, transition: { duration: 0.1 } }}
            onClick={() => onChange(value)}
            className={cn(
              "shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full",
              "text-xs font-semibold outline-none select-none transition-shadow duration-200",
              isActive
                ? "text-white shadow-md"
                : "bg-surface border border-edge text-ink-secondary hover:border-edge-strong hover:text-ink hover:shadow-sm",
            )}
            style={
              isActive && color
                ? { background: color }
                : isActive
                  ? { background: "#0F1623" }
                  : undefined
            }
          >
            {!isActive && color && (
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
            )}
            {label}
          </motion.button>
        );
      })}
    </div>
  );
}
