"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Loader2, Zap, AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { analyzeItem } from "@/lib/api";
import { impactStyle, cn } from "@/lib/utils";
import { classifyImpact } from "@/lib/types";
import type { AnalyzeResult } from "@/lib/api";

// ── Signal strength ───────────────────────────────────────────────────────────

function signalMeta(impact: string): { label: string; sublabel: string; icon: React.ReactNode; ring: string } {
  const s = classifyImpact(impact);
  if (s === "bullish") return {
    label: "Strong Signal", sublabel: "Bullish",
    icon: <TrendingUp size={13} />,
    ring: "ring-emerald-200 bg-emerald-50 text-emerald-700",
  };
  if (s === "bearish") return {
    label: "Strong Signal", sublabel: "Bearish",
    icon: <TrendingDown size={13} />,
    ring: "ring-red-200 bg-red-50 text-red-700",
  };
  if (s === "mixed") return {
    label: "Mixed Signal", sublabel: "Watch closely",
    icon: <AlertTriangle size={13} />,
    ring: "ring-amber-200 bg-amber-50 text-amber-700",
  };
  return {
    label: "Neutral", sublabel: "Limited market impact",
    icon: <Minus size={13} />,
    ring: "ring-gray-200 bg-gray-50 text-gray-600",
  };
}

// ── Result sections ───────────────────────────────────────────────────────────

const RESULT_SECTIONS = [
  {
    key:     "summary"        as const,
    label:   "Summary",
    desc:    "What happened",
    accent:  "#1A2B5F",
  },
  {
    key:     "why_it_matters" as const,
    label:   "Why It Matters",
    desc:    "Institutional perspective",
    accent:  "#2563EB",
  },
  {
    key:     "impact"         as const,
    label:   "Market Impact",
    desc:    "Signal classification",
    accent:  "#0891B2",
  },
];

function ResultPanel({ result }: { result: AnalyzeResult }) {
  const impact     = result.impact ? impactStyle(result.impact) : null;
  const signal     = result.impact ? signalMeta(result.impact) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-3"
    >
      {/* Signal strength banner */}
      {signal && (
        <div className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl border ring-1",
          signal.ring
        )}>
          <span className="shrink-0">{signal.icon}</span>
          <div>
            <p className="text-sm font-bold leading-none">{signal.label}</p>
            <p className="text-xs mt-0.5 opacity-80">{signal.sublabel}</p>
          </div>
          {impact && (
            <span className={cn(
              "ml-auto text-xs font-semibold px-3 py-1 rounded-full shrink-0",
              impact.bg, impact.text
            )}>
              {result.impact}
            </span>
          )}
        </div>
      )}

      {/* Content sections */}
      {RESULT_SECTIONS.map(({ key, label, desc, accent }, i) => {
        const content = result[key];
        if (!content) return null;
        // The impact section shows differently (already shown in banner)
        if (key === "impact") return null;
        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.25, ease: "easeOut" }}
            className="bg-surface rounded-xl border border-edge shadow-card overflow-hidden"
          >
            <div className="h-[3px]" style={{ background: accent }} />
            <div className="px-5 py-4">
              <div className="flex items-baseline gap-2 mb-2">
                <p className="text-xs font-bold uppercase tracking-widest text-ink">{label}</p>
                <p className="text-2xs text-ink-muted">{desc}</p>
              </div>
              <p className={cn(
                "text-sm leading-relaxed",
                key === "why_it_matters" ? "text-ink-secondary italic" : "text-ink"
              )}>
                {content}
              </p>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

// ── Input examples ────────────────────────────────────────────────────────────

const EXAMPLES = [
  "Fed holds rates steady, signals caution on 2025 cuts",
  "Apple misses earnings, guidance disappoints Wall Street",
  "OPEC+ agrees to deeper production cuts through Q2",
];

// ── Main page (inner — needs searchParams) ────────────────────────────────────

function AnalyzePageInner() {
  const searchParams = useSearchParams();

  const [title,   setTitle]   = useState(searchParams.get("title")   ?? "");
  const [snippet, setSnippet] = useState(searchParams.get("snippet") ?? "");
  const [result,  setResult]  = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);

  // Auto-focus and auto-run when navigated here with URL params
  useEffect(() => {
    const t = searchParams.get("title");
    if (t) {
      setTitle(t);
      setSnippet(searchParams.get("snippet") ?? "");
      titleRef.current?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAnalyze() {
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await analyzeItem(title, snippet);
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAnalyze();
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-7">
      {/* Page header */}
      <div className="flex items-center gap-2.5 mb-1">
        <Brain size={18} className="text-navy" />
        <h1 className="text-xl font-bold text-ink">Analyze</h1>
      </div>
      <p className="text-sm text-ink-secondary mb-6">
        Paste any headline to get AI-generated summary, investor perspective, and market impact.
      </p>

      {/* Input card */}
      <div className="bg-surface rounded-2xl border border-edge shadow-card p-5 space-y-4 mb-5">
        <div>
          <label className="text-2xs font-bold uppercase tracking-widest text-ink-muted block mb-1.5">
            Headline
          </label>
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={EXAMPLES[0]}
            autoComplete="off"
            className="w-full text-sm px-3 py-2.5 rounded-lg border border-edge bg-canvas text-ink
                       placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/30
                       focus:border-accent transition-all"
          />
          {/* Quick-fill examples */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {EXAMPLES.slice(1).map(ex => (
              <button
                key={ex}
                onClick={() => { setTitle(ex); setSnippet(""); titleRef.current?.focus(); }}
                className="text-2xs text-ink-muted hover:text-accent hover:bg-accent/8 px-2 py-0.5
                           rounded-full border border-edge hover:border-accent/30 transition-all truncate
                           max-w-[200px]"
                title={ex}
              >
                {ex.slice(0, 40)}{ex.length > 40 ? "…" : ""}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-2xs font-bold uppercase tracking-widest text-ink-muted block mb-1.5">
            Context <span className="normal-case font-normal text-ink-muted">(optional)</span>
          </label>
          <textarea
            value={snippet}
            onChange={e => setSnippet(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder="Paste article excerpt for more accurate analysis…"
            className="w-full text-sm px-3 py-2.5 rounded-lg border border-edge bg-canvas text-ink
                       placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/30
                       focus:border-accent resize-none transition-all"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-2xs text-ink-muted">⌘ + Enter to run</span>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleAnalyze}
            disabled={loading || !title.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold
                       bg-navy text-white hover:bg-navy-600 disabled:opacity-50
                       disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? <Loader2 size={14} className="animate-spin" />
              : <Zap size={14} />
            }
            {loading ? "Analyzing…" : "Analyze"}
          </motion.button>
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200
                       rounded-xl p-4 mb-5"
          >
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result */}
      <AnimatePresence>
        {result && !loading && <ResultPanel result={result} />}
      </AnimatePresence>
    </div>
  );
}

// ── Export with Suspense (required by Next.js for useSearchParams) ─────────────

export default function AnalyzePage() {
  return (
    <Suspense fallback={
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-7">
        <div className="h-8 w-32 bg-raised rounded animate-pulse mb-6" />
        <div className="bg-surface rounded-2xl border border-edge p-5 space-y-4">
          <div className="h-10 bg-raised rounded-lg animate-pulse" />
          <div className="h-20 bg-raised rounded-lg animate-pulse" />
          <div className="h-10 bg-raised rounded-lg animate-pulse" />
        </div>
      </div>
    }>
      <AnalyzePageInner />
    </Suspense>
  );
}
