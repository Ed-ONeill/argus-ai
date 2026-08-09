// lib/marketBrief.ts — the "Before the Bell" lead, written deterministically from REAL
// signals only. No pre-market futures and no forward calendar exist yet, so this never
// claims them: it describes the tape (delayed closes we actually have), the day's lead
// story, and the session. A morning-note voice built from facts, not a model narrative.
// Pure; honest by omission — absent inputs are simply left out, and an empty note is null.

export interface AssetMove { label: string; pct: number | null; }

export interface MarketBriefInput {
  index: AssetMove | null;    // S&P 500 (delayed close)
  rates: AssetMove | null;    // Treasuries via TLT (price up => yields lower)
  oil: AssetMove | null;      // Oil via USO
  topStory: string | null;    // the day's real lead headline
  sessionLabel: string | null;
  live: boolean;
}

const pct = (p: number): string => `${p >= 0 ? "+" : "-"}${Math.abs(p).toFixed(1)}%`;

function sessionPrefix(label: string | null, live: boolean): string {
  if (live) return "With markets open";
  const l = (label ?? "").toLowerCase();
  if (l.includes("pre")) return "Ahead of the open";
  if (l.includes("after")) return "After the close";
  if (l.includes("weekend")) return "Heading into the week";
  return "";
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function buildMarketBrief(input: MarketBriefInput): string | null {
  const moves: string[] = [];
  if (input.index?.pct != null) moves.push(`the S&P 500 last closed ${pct(input.index.pct)}`);
  if (input.rates?.pct != null) {
    // TLT up => bond prices up => yields lower (a real inverse mapping, not a guess).
    moves.push(input.rates.pct > 0 ? "Treasury yields eased"
      : input.rates.pct < 0 ? "Treasury yields pushed higher" : "Treasury yields held");
  }
  if (input.oil?.pct != null) moves.push(`oil ${pct(input.oil.pct)}`);

  const prefix = sessionPrefix(input.sessionLabel, input.live);
  let note = "";

  if (moves.length > 0) {
    note = prefix ? `${prefix}, ${joinList(moves)}.` : `${joinList(moves).replace(/^the/, "The")}.`;
  } else if (prefix) {
    note = `${prefix}.`;
  }

  if (input.topStory) {
    note += (note ? " " : "") + `In focus: ${input.topStory.replace(/\.$/, "")}.`;
  }

  return note.trim() ? note.trim() : null;
}
