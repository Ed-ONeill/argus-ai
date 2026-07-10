"use client";

/**
 * IntelLedSections - the intelligence-led episode sections (Phase 2.4 Listen
 * unification): A Relevant to Today's Read, B New Evidence, C Contrarian /
 * Contradicting Views, D For Your Watch. Thin renderers over the pure
 * ListenIntelVM (lib/listenIntel) - every intelligence value on these cards
 * is a shared-engine record; this component only presents and routes.
 */

import Link from "next/link";
import { ArrowUpRight, Radio, AlertTriangle, Eye, Sparkles } from "lucide-react";
import { timeAgo, sanitizeCopy } from "@/lib/utils";
import { explorerHrefForNode } from "@/lib/intelligenceShared";
import { cleanThemeName } from "@/app/markets/marketsShared";
import type { ListenIntelVM, ListenEpisodeVM, EpisodeAttachment, EpisodeRelation } from "@/lib/listenIntel";
import type { ProfileSection } from "@/lib/intelligenceProfile";
import type { ThemeIntelligence } from "@/lib/types";

const RELATION_META: Record<EpisodeRelation, { color: string; title: string }> = {
  SUPPORTS:    { color: "#059669", title: "Recorded supporting relationship in the shared graph" },
  CONTRADICTS: { color: "#dc2626", title: "Recorded contradicting/weakening relationship in the shared graph" },
  MENTIONS:    { color: "#475569", title: "Recorded mention, or entity-anchored metadata match (inferred)" },
  CONTEXT:     { color: "#94a3b8", title: "Topic/keyword-level metadata match (inferred context)" },
  UNCLEAR:     { color: "#d97706", title: "Conflicting recorded signals" },
};

const WHY_SOURCE_LABEL: Record<NonNullable<ListenEpisodeVM["whySource"]>, string> = {
  "narrative-thesis":      "shared narrative thesis",
  "ledger":                "change ledger",
  "theme-narrative-field": "theme pipeline narrative",
};

function AttachmentChips({ attachments, themeByName, onThemeClick }: {
  attachments:  EpisodeAttachment[];
  themeByName:  Map<string, ThemeIntelligence>;
  onThemeClick: (t: ThemeIntelligence) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {attachments.slice(0, 3).map(a => {
        const meta = RELATION_META[a.relation];
        const theme = a.nodeType === "Theme" ? themeByName.get(a.entityKey.toLowerCase()) : undefined;
        const href = explorerHrefForNode({ type: a.nodeType, label: a.entityKey });
        const chip = (
          <span
            className="inline-flex items-center gap-1 text-[8.5px] font-semibold px-1.5 py-0.5 rounded-full border leading-none"
            style={{ color: meta.color, borderColor: `${meta.color}40`, background: `${meta.color}0d` }}
            title={`${meta.title}${a.relationship ? ` (${a.relationship.replace(/_/g, " ")})` : ""} - ${a.basis}`}
          >
            <span className="font-bold tracking-wide">{a.relation}</span>
            {a.nodeType === "Theme" ? cleanThemeName(a.entityKey) : a.entityKey}
          </span>
        );
        if (theme) {
          return (
            <button key={`${a.entityKey}-${a.relation}`} onClick={() => onThemeClick(theme)} className="hover:opacity-75 transition-opacity">
              {chip}
            </button>
          );
        }
        return href
          ? <Link key={`${a.entityKey}-${a.relation}`} href={href} className="hover:opacity-75 transition-opacity">{chip}</Link>
          : <span key={`${a.entityKey}-${a.relation}`}>{chip}</span>;
      })}
    </span>
  );
}

function EpisodeRow({ vm, variant, themeByName, onThemeClick }: {
  vm:           ListenEpisodeVM;
  variant:      "read" | "evidence" | "contrarian" | "watch";
  themeByName:  Map<string, ThemeIntelligence>;
  onThemeClick: (t: ThemeIntelligence) => void;
}) {
  const ep = vm.episode;
  const explorerHref = vm.primaryTheme
    ? explorerHrefForNode({ type: "Theme", label: vm.primaryTheme })
    : null;

  return (
    <div className="rounded-xl border border-edge bg-surface px-4 py-3 hover:border-edge-strong transition-colors">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* headline: the episode is the evidence, not the intelligence */}
          <p className="text-[12.5px] font-semibold text-ink leading-snug line-clamp-2">
            {ep.external_url
              ? <a href={ep.external_url} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors">{sanitizeCopy(ep.title)}</a>
              : sanitizeCopy(ep.title)}
          </p>
          <p className="text-[9.5px] text-ink-muted mt-0.5">
            {ep.show_name} · {timeAgo(ep.published_at)}
            {vm.evidenceTier && (
              <span
                className="ml-1.5 text-[7.5px] font-bold tracking-[0.1em] px-1 py-px rounded border align-middle"
                style={vm.evidenceTier === "recorded"
                  ? { color: "#059669", borderColor: "#05966940" }
                  : { color: "#94a3b8", borderColor: "#94a3b840" }}
                title={vm.evidenceTier === "recorded"
                  ? "At least one recorded graph relationship backs this attachment"
                  : "Metadata-level match (deterministic fallback matcher) - inferred relevance"}
              >
                {vm.evidenceTier === "recorded" ? "RECORDED" : "METADATA MATCH"}
              </span>
            )}
          </p>
        </div>
        {explorerHref && (
          <Link href={explorerHref} className="shrink-0 p-1 rounded text-ink-muted/50 hover:text-accent transition-colors" title="Open in Explorer">
            <ArrowUpRight size={13} />
          </Link>
        )}
      </div>

      {/* attachments: what this episode is evidence FOR, honestly classified */}
      {vm.attachments.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
          <AttachmentChips attachments={vm.attachments} themeByName={themeByName} onThemeClick={onThemeClick} />
          {vm.narrative && (
            <span className="text-[8.5px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20"
              title="Derived-narrative membership of the matched theme (shared derivation)">
              {cleanThemeName(vm.narrative)}
            </span>
          )}
        </div>
      )}

      {/* why it matters: a shared object, its source named - never local copy */}
      {vm.whyMatters && vm.whySource && (
        <p className="text-[10.5px] text-ink-secondary leading-snug mt-1.5 break-words">
          {vm.whyMatters}
          <span className="ml-1.5 text-[7px] font-bold tracking-[0.1em] px-1 py-px rounded border border-edge text-ink-muted/70 align-middle uppercase">
            {WHY_SOURCE_LABEL[vm.whySource]}
          </span>
        </p>
      )}

      {/* section-specific shared record, verbatim */}
      {variant === "evidence" && vm.changed && (
        <p className="text-[10.5px] text-ink-secondary leading-snug mt-1.5" title={vm.changed.why}>
          <span className="text-[7.5px] font-bold tracking-[0.12em] px-1 py-0.5 rounded border border-sky-500/40 text-sky-600 mr-1.5 align-middle">{vm.changed.kind}</span>
          {vm.changed.what}
        </p>
      )}
      {variant === "contrarian" && (vm.contradictions.length > 0 || vm.invalidation) && (
        <div className="mt-1.5 space-y-0.5">
          {vm.contradictions.slice(0, 2).map((c, i) => (
            <p key={i} className="text-[10.5px] text-ink-secondary leading-snug flex items-start gap-1.5">
              <AlertTriangle size={10} className="text-red-500/80 shrink-0 mt-0.5" />
              <span>{c.detail} <span className="text-ink-muted">sev {c.severity} · evidence engine</span></span>
            </p>
          ))}
          {vm.invalidation && (
            <p className="text-[10.5px] text-ink-secondary leading-snug">
              <span className="text-[7.5px] font-bold tracking-[0.1em] text-amber-600 mr-1">INVALIDATES</span>
              {vm.invalidation}
            </p>
          )}
        </div>
      )}
      {variant === "watch" && vm.priority && (
        <p className="text-[9.5px] text-ink-muted mt-1.5">
          <span className="text-[7.5px] font-bold tracking-[0.1em] text-accent/70 mr-1">RESEARCH PRIORITY</span>
          score {vm.priority.score}{vm.priority.personal ? " · follows your themes (ordering only)" : ""}
        </p>
      )}
    </div>
  );
}

function Section({ icon, label, sub, section, variant, themeByName, onThemeClick }: {
  icon:         React.ReactNode;
  label:        string;
  sub:          string;
  section:      ProfileSection<ListenEpisodeVM[]>;
  variant:      "read" | "evidence" | "contrarian" | "watch";
  themeByName:  Map<string, ThemeIntelligence>;
  onThemeClick: (t: ThemeIntelligence) => void;
}) {
  // Unavailable sections render nothing when they carry no note worth showing;
  // partial-but-empty sections state their honest empty note inline.
  if (section.status === "unavailable") return null;
  const items = section.data ?? [];
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">{label}</span>
        <span className="text-[9px] text-ink-muted">{sub}</span>
        <span className="h-px flex-1 bg-edge" />
      </div>
      {items.length === 0 ? (
        <p className="text-[10.5px] text-ink-muted italic">{section.note ?? "Nothing this cycle."}</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {items.map(vm => (
            <EpisodeRow key={`${variant}-${vm.episode.id}`} vm={vm} variant={variant} themeByName={themeByName} onThemeClick={onThemeClick} />
          ))}
        </div>
      )}
    </div>
  );
}

export function IntelLedSections({ vm, themes, onThemeClick }: {
  vm:           ListenIntelVM;
  themes:       ThemeIntelligence[];
  onThemeClick: (t: ThemeIntelligence) => void;
}) {
  const themeByName = new Map(themes.map(t => [t.name.toLowerCase(), t]));
  return (
    <div className="mb-2">
      <Section icon={<Sparkles size={12} className="text-accent shrink-0" />}
        label="Relevant to Today's Read" sub="episodes on the dominant narrative's member themes"
        section={vm.relevantToRead} variant="read" themeByName={themeByName} onThemeClick={onThemeClick} />
      <Section icon={<Radio size={12} className="text-sky-600 shrink-0" />}
        label="New Evidence" sub="episodes on themes the shared change ledger moved this cycle"
        section={vm.newEvidence} variant="evidence" themeByName={themeByName} onThemeClick={onThemeClick} />
      <Section icon={<AlertTriangle size={12} className="text-red-500/80 shrink-0" />}
        label="Contrarian / Contradicting Views" sub="episodes on themes carrying active contradiction or invalidation records"
        section={vm.contrarian} variant="contrarian" themeByName={themeByName} onThemeClick={onThemeClick} />
      <Section icon={<Eye size={12} className="text-accent shrink-0" />}
        label="For Your Watch" sub="followed themes, saved entities, research priorities · ordering only"
        section={vm.forYourWatch} variant="watch" themeByName={themeByName} onThemeClick={onThemeClick} />
    </div>
  );
}
