// lib/marketLandscape.ts — "Today's Market Landscape" model (Law-10 Feed centerpiece).
//
// A calm, composed picture of the market concepts that matter today and how today's REAL
// events connect them. Nodes are only recognizable market concepts — a fixed cross-asset
// spine (context) plus the day's event protagonists (companies, macro actors, countries),
// which receive the emphasis. Edges exist ONLY because a real event connects two concepts
// (no inferred relationships). Deterministic placement (no force-directed cloud). Pure; the
// reasoning engine is untouched — no themes, conviction, transmission, or graph metrics
// ever appear here.

import type { FeedResponse, MarketEvent } from "./types";

export type LandscapeNodeKind = "market" | "company" | "macro" | "country";

export interface LandscapeNode {
  id: string;              // "spine:oil" | "co:NVDA" | "macro:Fed"
  label: string;           // "Oil" | "NVIDIA" | "Fed"
  kind: LandscapeNodeKind;
  spine: boolean;          // cross-asset spine = context, priced
  symbol?: string;         // spine only, for delayed pricing (SPY/QQQ/TLT/USO/GLD/UUP/IBIT)
  eventIds: string[];      // events that place / connect this node
  x: number;               // 0..100
  y: number;               // 0..100 (spine near the bottom; protagonists above)
}

// Every edge carries the plain-language reason it exists — the real event headline that
// connects the two concepts. An edge with no such one-sentence explanation is not drawn.
export interface LandscapeEdge { from: string; to: string; reason: string; }

export interface MarketLandscape {
  nodes: LandscapeNode[];
  edges: LandscapeEdge[];
  protagonistCount: number;
}

const isTicker = (s: string): boolean => /^[A-Z]{1,5}$/.test(s.trim());

// The fixed cross-asset spine — stable order and placement, always present.
const SPINE: { id: string; label: string; symbol: string }[] = [
  { id: "spine:sp500", label: "S&P 500", symbol: "SPY" },
  { id: "spine:nasdaq", label: "Nasdaq", symbol: "QQQ" },
  { id: "spine:treasuries", label: "Treasuries", symbol: "TLT" },
  { id: "spine:oil", label: "Oil", symbol: "USO" },
  { id: "spine:gold", label: "Gold", symbol: "GLD" },
  { id: "spine:dollar", label: "Dollar", symbol: "UUP" },
  { id: "spine:bitcoin", label: "Bitcoin", symbol: "IBIT" },
];

// What spine market an event is ABOUT (its own subject — event-driven, not inferred).
const SPINE_SUBJECT: [RegExp, string][] = [
  [/\bcrude\b|\boil\b|\bbrent\b|\bopec\b|energy/i, "spine:oil"],
  [/\bgold\b|bullion/i, "spine:gold"],
  [/treasur|\byields?\b|federal reserve|\bfed\b|\bfomc\b|rate cut|rate hike|\brates?\b|\bcpi\b|inflation|\bpce\b/i, "spine:treasuries"],
  [/\bdollar\b|\bdxy\b|currency/i, "spine:dollar"],
  [/bitcoin|crypto|\bbtc\b|ether/i, "spine:bitcoin"],
  [/nasdaq|\btech\b|semiconduc|\bai\b|chip/i, "spine:nasdaq"],
  [/s&p|\bstocks?\b|equit|\bmarket\b|wall street/i, "spine:sp500"],
];

// Macro actors and countries that can be protagonists (event-driven, plain-language).
const ACTORS: [RegExp, string, LandscapeNodeKind][] = [
  [/federal reserve|\bfed\b|\bfomc\b/i, "Fed", "macro"],
  [/\bcpi\b|inflation/i, "CPI", "macro"],
  [/\bopec\b/i, "OPEC", "macro"],
  [/\bchina\b/i, "China", "country"],
  [/\brussia\b/i, "Russia", "country"],
  [/\biran\b/i, "Iran", "country"],
  [/\btaiwan\b/i, "Taiwan", "country"],
  [/\bukraine\b/i, "Ukraine", "country"],
];

function spineSubjectOf(ev: MarketEvent): string | null {
  const hay = `${ev.title} ${(ev.industries ?? []).join(" ")}`;
  for (const [re, id] of SPINE_SUBJECT) if (re.test(hay)) return id;
  return null;
}

function actorOf(ev: MarketEvent): { id: string; label: string; kind: LandscapeNodeKind } | null {
  const hay = `${ev.title} ${(ev.industries ?? []).join(" ")}`;
  for (const [re, label, kind] of ACTORS) if (re.test(hay)) return { id: `macro:${label}`, label, kind };
  return null;
}

const MAX_PROTAGONISTS = 7;   // 7 spine + up to 7 protagonists = the 8-14 density band

export function buildMarketLandscape(feed: FeedResponse | undefined): MarketLandscape {
  const events = [...(feed?.events ?? [])].sort((a, b) => (b.editorial_score ?? 0) - (a.editorial_score ?? 0));

  const spineNodes: LandscapeNode[] = SPINE.map((s, i) => ({
    id: s.id, label: s.label, kind: "market", spine: true, symbol: s.symbol,
    eventIds: [], x: ((i + 0.5) / SPINE.length) * 100, y: 84,
  }));
  const spineById = new Map(spineNodes.map((n) => [n.id, n]));

  const protagonists = new Map<string, LandscapeNode>();
  const marketVotes = new Map<string, Map<string, number>>();   // protagonist -> market -> count
  const edgeKeys = new Set<string>();
  const edges: LandscapeEdge[] = [];

  for (const ev of events) {
    const market = spineSubjectOf(ev);
    if (market) spineById.get(market)?.eventIds.push(ev.id);

    const prots: { id: string; label: string; kind: LandscapeNodeKind }[] = [];
    const companies = (ev.companies_direct?.length ? ev.companies_direct : ev.companies) ?? [];
    for (const c of companies) {
      if (isTicker(c)) prots.push({ id: `co:${c.trim().toUpperCase()}`, label: c.trim().toUpperCase(), kind: "company" });
    }
    const actor = actorOf(ev);
    if (actor) prots.push(actor);

    for (const p of prots) {
      if (!protagonists.has(p.id)) {
        if (protagonists.size >= MAX_PROTAGONISTS) continue;   // ranked: top events' protagonists win
        protagonists.set(p.id, { ...p, spine: false, eventIds: [], x: 0, y: 0 });
        marketVotes.set(p.id, new Map());
      }
      const node = protagonists.get(p.id);
      if (!node) continue;
      if (!node.eventIds.includes(ev.id)) node.eventIds.push(ev.id);
      if (market) {
        const key = `${p.id}|${market}`;
        const reason = (ev.title ?? "").trim();   // the one plain sentence explaining the link
        // Only draw a connection that can be explained simply (Refinement 2).
        if (!edgeKeys.has(key) && reason) { edgeKeys.add(key); edges.push({ from: p.id, to: market, reason }); }
        const votes = marketVotes.get(p.id)!;
        votes.set(market, (votes.get(market) ?? 0) + 1);
      }
    }
  }

  layoutProtagonists([...protagonists.values()], marketVotes, spineById);

  return {
    nodes: [...spineNodes, ...protagonists.values()],
    edges,
    protagonistCount: protagonists.size,
  };
}

// Deterministic, composed placement: each protagonist sits ABOVE its primary connected
// market (short, near-vertical edge); ones with no market link form a top row. No physics.
function layoutProtagonists(
  prots: LandscapeNode[],
  votes: Map<string, Map<string, number>>,
  spineById: Map<string, LandscapeNode>,
): void {
  const columns = new Map<string, LandscapeNode[]>();   // market id -> its protagonists
  const lone: LandscapeNode[] = [];

  for (const p of prots) {
    const v = votes.get(p.id);
    let best: string | null = null;
    let bestN = 0;
    if (v) for (const [m, n] of v) if (n > bestN) { bestN = n; best = m; }
    if (best) (columns.get(best) ?? columns.set(best, []).get(best)!).push(p);
    else lone.push(p);
  }

  const clamp = (n: number) => Math.max(5, Math.min(95, n));
  // Fan protagonists AROUND their anchored spine market (dynamic positions, not a rigid
  // column) — the spine never moves; the protagonists arrange themselves around it.
  const FAN: [number, number][] = [[0, 44], [-10, 31], [10, 31], [-10, 18], [10, 18], [0, 18]];
  for (const [marketId, list] of columns) {
    const mx = spineById.get(marketId)?.x ?? 50;
    list.forEach((p, k) => {
      const [dx, y] = FAN[Math.min(k, FAN.length - 1)];
      const overflow = k >= FAN.length ? (k - FAN.length + 1) * 7 : 0;
      p.x = clamp(mx + dx + overflow);
      p.y = y;
    });
  }
  lone.forEach((p, k) => {
    p.x = lone.length === 1 ? 50 : clamp(((k + 0.5) / lone.length) * 100);
    p.y = 10;
  });
}
