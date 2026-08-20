import type { IndustryConfig } from "./industryConfig";
import type { SectorIntelligence, IndustrySignal } from "./types";

/**
 * RC2-F1 — the Industry card's honesty boundary.
 *
 * An industry with no derived coverage used to fall through to STATIC
 * CONFIGURATION in the slots a reader takes as measurement. Measured on the live
 * pipeline, Healthcare, Crypto & Digital Assets and Media & Telecom score 0 with
 * 0 stories, and their cards rendered:
 *
 *   narrative slot   industry.macroDrivers[0]    -> "FDA Calendar" / "BTC ETF
 *                                                   Flows" / "Ad Spend"
 *   driver chips     industry.keyAssets[0..4]    -> JNJ · LLY · MRK · ABBV · UNH
 *   footer           "-> Regime Neutral"          <- a CURRENT-STATE claim from
 *                                                   `alignment ?? "neutral"`
 *   sentiment badge  "Neutral"                    <- likewise, from
 *                                                   `sentiment ?? "neutral"`
 *
 * The first two are configuration wearing the costume of intelligence. The last
 * two are worse: they synthesise a current reading (regime neutral, sentiment
 * neutral) for an industry Argus has measured nothing about. The score already
 * read "-" and the count "No data", so the card contradicted itself.
 *
 * The invariant: derived intelligence must never be indistinguishable from static
 * reference. This view model is the single place that decides which is which.
 *
 * It adds no source, no scoring and no inference. Static config is preserved and
 * still shown - it is simply labelled as reference and moved out of the slots
 * that assert a current reading.
 */

export type IndustryIntelSource = "sector" | "theme" | "none";

export interface ThemeSignalFallback {
  score:         number;
  sentiment:     "bullish" | "bearish" | "neutral";
  storyCount:    number;
  narrative:     string;
  chips:         string[];
  themeName:     string;
  momentumLabel: string;
}

export interface IndustryReference {
  /** Always present so the UI can mark the block as non-derived. */
  label:   string;
  /** The static macro driver, if the config has one. */
  driver:  string | null;
  /** The static ticker set. Preserved verbatim - only its framing changes. */
  tickers: string[];
}

export interface IndustryCardView {
  /** Where the intelligence came from. "none" means nothing was measured. */
  source:          IndustryIntelSource;
  hasIntelligence: boolean;
  /** null when unmeasured — the card renders "-" rather than a number. */
  score:           number | null;
  /** null when unmeasured — no sentiment is inferred. */
  sentiment:       "bullish" | "bearish" | "mixed" | "neutral" | null;
  /**
   * The state chip. When nothing is measured this says so explicitly rather than
   * disappearing: a missing badge reads as an oversight, whereas "Not measured"
   * is the finding. `measured: false` also tells the UI to style it as an
   * absence, never as a neutral reading.
   */
  stateBadge:      { label: string; measured: boolean };
  /** Derived narrative, or an honest statement of absence. Never static config. */
  intelligenceText: string;
  /** Derived drivers ONLY. Empty when nothing was derived. */
  drivers:         string[];
  /** Static context, present only when there is no derived intelligence. */
  reference:       IndustryReference | null;
  /** Story-count caption. */
  storyLabel:      string;
  /** Regime/momentum footer, or an honest not-measured state. */
  footer:          string;
  /** Theme provenance chip, when the intelligence came from a theme. */
  themeName:       string | null;
}

export interface IndustryCardInput {
  industry:       IndustryConfig;
  sectorData:     SectorIntelligence | null;
  industrySignal: IndustrySignal | null;
  topTheme:       string | null;
  themeSignal:    ThemeSignalFallback | null;
}

/** The honest empty state for the intelligence slot. */
export const NO_SIGNAL_TEXT = "No current derived signal for this industry.";
/** The label that marks a block as static configuration, not measurement. */
export const REFERENCE_LABEL = "Reference";
/** The footer when nothing has been measured. */
export const NOT_MEASURED_FOOTER = "Not measured";
/** The state chip when nothing has been measured. */
export const NOT_MEASURED_BADGE = "Not measured";

const SENTIMENT_LABEL: Record<"bullish" | "bearish" | "mixed" | "neutral", string> = {
  bullish: "Bullish", bearish: "Bearish", mixed: "Mixed", neutral: "Neutral",
};

export function buildIndustryCardView(input: IndustryCardInput): IndustryCardView {
  const { industry, sectorData, industrySignal, topTheme, themeSignal } = input;

  const score = sectorData?.signal_score ?? 0;
  const count = sectorData?.signal_count ?? 0;
  const hasData  = sectorData !== null && score > 0;
  const hasTheme = !hasData && themeSignal !== null && (themeSignal.score ?? 0) > 0;
  const source: IndustryIntelSource = hasData ? "sector" : hasTheme ? "theme" : "none";

  // ── No derived coverage: state the absence, and demote the static config ──
  if (source === "none") {
    return {
      source,
      hasIntelligence: false,
      // Unmeasured. Not zero, not neutral - absent.
      score:     null,
      sentiment: null,
      stateBadge: { label: NOT_MEASURED_BADGE, measured: false },
      intelligenceText: NO_SIGNAL_TEXT,
      drivers:   [],
      reference: {
        label:   REFERENCE_LABEL,
        driver:  industry.macroDrivers?.[0] ?? null,
        tickers: (industry.keyAssets ?? []).slice(0, 5),
      },
      storyLabel: "No data",
      footer:     NOT_MEASURED_FOOTER,
      themeName:  null,
    };
  }

  // ── Derived coverage exists: behaviour is unchanged ───────────────────────
  const alignment = industrySignal?.regime_alignment ?? sectorData?.regime_alignment ?? "neutral";
  const sentiment = (
    industrySignal?.momentum_direction ??
    sectorData?.impact_sentiment       ??
    (hasTheme ? themeSignal!.sentiment : null) ??
    "neutral"
  ) as IndustryCardView["sentiment"];

  const drivers = industrySignal?.primary_drivers?.length
    ? industrySignal.primary_drivers.slice(0, 5)
    : (hasTheme && themeSignal!.chips.length)
    ? themeSignal!.chips.slice(0, 5)
    : [];

  const footer = hasData
    ? (alignment === "tailwind" ? "↑ Regime Tailwind"
      : alignment === "headwind" ? "↓ Regime Headwind"
      : "→ Regime Neutral")
    : `✦ ${themeSignal!.momentumLabel}`;

  return {
    source,
    hasIntelligence: true,
    score: hasData ? score : (themeSignal!.score ?? 0),
    sentiment,
    stateBadge: { label: SENTIMENT_LABEL[sentiment ?? "neutral"], measured: true },
    // Derived narrative only. The static macroDrivers fallback is gone from here.
    intelligenceText:
      industrySignal?.narrative || topTheme || themeSignal?.narrative || NO_SIGNAL_TEXT,
    drivers,
    reference: null,
    storyLabel: hasData
      ? `${count} ${count === 1 ? "story" : "stories"}`
      : `${themeSignal!.storyCount} via theme`,
    footer,
    themeName: hasTheme ? themeSignal!.themeName : null,
  };
}
