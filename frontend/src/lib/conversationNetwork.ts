/**
 * lib/conversationNetwork.ts — Listen's idea-propagation graph adapter.
 *
 * Turns what podcasts are collectively discussing into a GraphModel for the shared
 * NetworkGraph engine (the same one behind the Argus Market Map): mentioned orgs →
 * themes → sectors → companies, where entities reused across themes become the
 * bridges that show how an idea spreads from one conversation to the next.
 *
 * Pure read of stored fields. Dependency-light (types + the person detector) so
 * the heavy graph stays the only weight, and that is lazy-loaded.
 */

import type { GraphModel, GraphNode, GraphEdge, RelationType } from "./graph/types";
import type { Episode, ThemeIntelligence } from "./types";
import { looksLikePerson, type ThemeEpisodeGroup } from "./listenIntelligence";

const slug      = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const cleanName = (s: string) => s.replace(/\s*[-–—:].*$/, "").trim();
const isTicker  = (s: string) => /^[A-Z][A-Z.]{0,5}$/.test(s);

/** Build the Conversation Network: orgs → themes → sectors → companies. */
export function buildConversationNetwork(groups: ThemeEpisodeGroup[]): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add  = (n: GraphNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
  const link = (s: string, t: string, type: RelationType, weight: number, stage: number, reason?: string) => {
    if (seen.has(s) && seen.has(t) && s !== t) edges.push({ source: s, target: t, type, weight, stage, reason });
  };

  const centerId = "conversations";
  add({ id: centerId, label: "Today's Conversations", kind: "event", role: "event", stage: 0, name: "Conversation Network", reason: "How ideas spread across podcasts" });

  const ranked = [...groups].sort((a, b) => b.matchCount - a.matchCount).slice(0, 6);

  for (const g of ranked) {
    const t    = g.theme;
    const name = cleanName(t.name);
    const conf = Math.round(t.confidence ?? 60);
    const dir  = t.momentum_direction;
    const coRole: RelationType = dir === "bearish" ? "competitor" : dir === "neutral" ? "supplier" : "beneficiary";

    // Theme node — the narrative
    const thId = `th:${slug(name)}`;
    add({ id: thId, label: name, kind: "theme", role: "theme", stage: 1, confidence: conf, themes: [name], reason: t.causal_narrative || `Discussed across ${g.matchCount} podcasts` });
    link(centerId, thId, "theme", Math.max(0.5, conf / 100), 1, `${g.matchCount} podcasts`);

    // Mentioned orgs (non-person, non-ticker) from this theme's episodes — what's
    // actually being talked about (e.g. "OpenAI"). Reused ids bridge conversations.
    const orgCount = new Map<string, number>();
    for (const ep of g.episodes) for (const e of ep.entities) {
      if (!looksLikePerson(e) && !isTicker(e)) orgCount.set(e, (orgCount.get(e) ?? 0) + 1);
    }
    [...orgCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).forEach(([org]) => {
      const id = `org:${slug(org)}`;
      add({ id, label: org, kind: "company", role: "second-order", stage: 1, name: org, themes: [name], reason: `Discussed under ${name}` });
      link(id, thId, "second-order", 0.5, 1, "Discussed");
    });

    // Sector — where the narrative transmits
    const sector = (t.related_industries ?? []).find(i => t.relationship_weights?.[i]?.direction === "positive")
      ?? (t.related_industries ?? [])[0];
    let secId: string | null = null;
    if (sector) {
      secId = `sec:${slug(sector)}`;
      add({ id: secId, label: sector, kind: "sector", role: "sector", stage: 2, themes: [name], reason: "Sector in the conversation" });
      link(thId, secId, "sector", 0.6, 2, "Sector");
    }

    // Companies (tickers) — the named expressions; shared tickers bridge themes
    (t.related_assets ?? []).filter(isTicker).slice(0, 3).forEach((tk, i) => {
      const id = `co:${tk}`;
      add({ id, label: tk, kind: "company", role: coRole, stage: 3, ticker: tk, confidence: Math.max(40, conf - 6 - i * 4), themes: [name], isPublic: true, reason: dir === "bearish" ? "Pressured in the narrative" : "Expression of the narrative" });
      link(secId ?? thId, id, coRole, 0.55 - i * 0.06, 3, dir === "bearish" ? "Pressured" : "Expression");
    });
  }

  return { id: `conv:${Date.now()}`, centerId, title: "Conversation Network", subtitle: "Idea Propagation", nodes, edges };
}

/** Episodes whose conversation connects to the selected node (drives the filter). */
export function episodesForNode(
  node: GraphNode, episodes: Episode[], episodeThemes: Map<string, ThemeIntelligence[]>,
): Episode[] {
  if (node.kind === "event") return [];
  const lc  = (s: string) => s.toLowerCase();
  const tok = lc(node.ticker ?? node.label);
  const out: Episode[] = [];
  for (const ep of episodes) {
    const ths = episodeThemes.get(ep.id) ?? [];
    let hit = false;
    if (node.kind === "theme") {
      hit = ths.some(t => lc(cleanName(t.name)) === tok || lc(t.name).includes(tok));
    } else if (node.kind === "sector") {
      hit = ths.some(t => (t.related_industries ?? []).some(i => lc(i) === tok));
    } else {
      hit = ep.entities.some(e => lc(e) === tok || lc(e).includes(tok))
        || ths.some(t => (t.related_assets ?? []).some(a => lc(a) === tok));
    }
    if (hit) out.push(ep);
  }
  return out;
}
