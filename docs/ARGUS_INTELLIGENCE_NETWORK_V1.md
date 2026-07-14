# ARGUS INTELLIGENCE NETWORK V1 (M4.0)

**Status: CANONICAL PRODUCT SPECIFICATION. M4.0 is the audit + spec; no production code
changes ship in this phase.** The current Argus Market Map (Feed hero) is the starting
surface; this document defines its evolution into the flagship Intelligence Network.

Core product question the surface must answer:

> "What is moving the market, how is it transmitting, who is exposed, what changed, how
> persistent is it, and what does Argus's memory know about this structure?"

---

## 1. Current implementation audit

### 1.1 Component map (all verified in code)

| Piece | File | Role |
|---|---|---|
| Feed hero | `components/feed/ArgusMarketMap.tsx` (205 ln) | header, replay scrubber, "Today's Market Story" panel |
| Graph engine | `components/graph/NetworkGraph.tsx` (981 ln) | reusable Canvas 2D renderer + interactions (shared with M&A page) |
| Layout | `lib/graph/forceSimulation.ts` | radial transmission tree + springs/repulsion/collision + perpetual drift |
| Contract | `lib/graph/types.ts` | `GraphModel/GraphNode/GraphEdge`, `RelationType` (M&A vocabulary) |
| Adapter | `lib/marketMap.ts::buildMarketMap` | page-owned projection: top-6 themes → driver/theme/sector/asset nodes |
| Driver/sector heuristics | `lib/themeTransmission.ts` | `deriveDriver` / `deriveSector` (first related industry) |
| Story panel | `lib/feedNarrative.ts::buildMarketStoryVM` | re-voices the canonical DerivedNarrative thesis (good) |

### 1.2 What is genuinely good (evolve, don't discard)

1. **Canvas 2D, dependency-free** — the right rendering technology for this node count;
   no library to replace.
2. **Deterministic seeding intent** — FNV hashes, sorted BFS, no `Math.random()`.
3. **Selection as page controller** — `onFocusChange` drives the whole Feed (Focus mode),
   a genuinely differentiated interaction worth keeping.
4. **Trace Transmission** — hover isolates the full ancestor→consequence chain; the
   concept is exactly right, only its rendering language needs discipline.
5. **The story panel already reads canonical narrative state** (`buildMarketStoryVM` over
   The Read), not page-local synthesis.
6. **Position carry-over on re-root** — smooth reflow instead of layout resets.

### 1.3 Material problems found

**Data ownership (architectural):**
- The map is a **page-owned projection**: `buildMarketMap` re-derives drivers
  (`deriveDriver`) and sectors (`deriveSector` = first related industry) from raw themes —
  a visual component calculating market meaning, violating the M4 product model. It does
  NOT read the canonical `intelligenceGraph`, DerivedNarratives, or any M3 record.
- **No narrative node class exists.** The five-class hierarchy (driver → narrative →
  theme → industry → asset) is currently three-and-a-half: drivers are `kind:"group"`
  with M&A role `cross-sector`; narratives are absent entirely.
- **Vocabulary is borrowed from M&A** and semantically misused: a bearish-theme asset is
  rendered as role `competitor`; edge types are `theme/sector/beneficiary`, not the model
  doc's canonical `drives/supports/pressures/exposed_to`. Recorded vs derived is
  indistinguishable — every edge looks equally authoritative.
- The center node **"Market Center" is synthetic and ambiguous** (flagged in the brief) —
  it exists to give the radial tree a root, not because it means anything.

**Determinism (broken in three places):**
- `GraphModel.id = "market:" + Date.now()` and layout rotation = `jit(model.id)` → the
  whole ring **rotates to a new random angle on every rebuild** (every feed refresh).
  Spatial memory is impossible.
- Perpetual orbital drift + sway (`time`-based in `step()`) means positions **never**
  settle; identical graph state ≠ identical pixels at any two moments.
- Ring/angle layout depends on BFS insertion order of a synthetic root; theme set changes
  reshuffle angular slices wholesale rather than locally.

**The replay is fabricated.** `replayProgress` reconstructs "9:30 AM → Now" from
`stage + confidence + hash(id)` — pure fiction. No intraday data exists anywhere in the
platform; M3 explicitly documents daily-only reconstruction. This is the single worst
honesty violation on the surface and must be replaced by real `/api/memory/v2/graph/at`
daily replay (or removed until M4.4).

**Visual language:**
- Every node is a glowing circle (radial-gradient glass ball + additive bloom + breathing
  + up to five kinds of pulse ring). Class identity is carried by color alone.
- Continuous animation everywhere: all edges dash-march permanently, particles flow on
  ~half the edges at rest, sectors pulse in waves above energy 0.42, everything breathes.
  Animation carries no information because it never stops.
- Labels: single-line ellipsis below circles, x-clamped, **no label-vs-label collision
  handling** → overlaps in dense rings; 8–10px text at 0.3–0.5 alpha (weak gray text).
- Edge meaning is under-specified: no arrowheads (direction only via a subtle gradient),
  confidence multiplies opacity together with weight (indistinguishable), dashes are the
  default texture rather than a signal.

**Interaction gaps:** no wheel/pinch zoom (buttons only), no Escape key, no keyboard
navigation, no density controls, no low-confidence filter, no reduced-motion support.

**Performance:** a permanent rAF loop with O(n²) repulsion + collision every frame,
per-frame gradient allocation per edge and node, and time-based motion that prevents idle.
Fine at ~40 nodes on a desktop; wasteful always, fragile on low-power laptops, and
incompatible with `prefers-reduced-motion`.

**Memory integration: none.** No node or edge exposes first-seen, persistence,
transitions, predictions, or outcomes, despite M3.1–M3.4 providing all of it via
`/api/memory/v2/*` and `theme.memory` already arriving on every feed theme.

**Mobile:** the desktop canvas is simply rendered at full width; no focused-chain mode.

**Duplicate/ambiguity check:** sector and driver nodes are deduped by slug (OK); each
theme maps to exactly ONE sector (first related industry) so breadth is under-represented;
`in-graph side panel` (210px, inside NetworkGraph) duplicates the canonical
IntelligenceDrawer's meaning system — a second drawer, explicitly disallowed by M4.

### 1.4 Available canonical inputs (what the projection must consume)

| Source | Contract |
|---|---|
| Canonical graph | `lib/intelligenceGraph.ts` (IntelNode/IntelEdge, typed directional edges, evidence counts) via `useIntelligenceGraph` — provisioned once per payload (P2.0) |
| Narratives | `narrativeDerivation.deriveNarratives()` — driver-set keyed DerivedNarratives with members, coherence, exposure |
| Profiles / drawer | `intelligenceProfile.ts` + canonical IntelligenceDrawer + FocusBar (cross-page store) |
| Live memory | `theme.memory` (ThemeMemory summary attached to every feed theme) |
| Durable memory | `/api/memory/v2`: entity/narrative/relationship snapshots + transitions, relationship registry (first/last seen), predictions + outcomes, `graph/at` daily reconstruction, `themes/{uid}/historical-context` (M3.4, credibility-gated) |

---

## 2. M4 product model (binding)

The Intelligence Network is a **projection**, never an engine. One new pure module —
`lib/networkProjection.ts` — builds the view model (`NetworkModel v2`) from: canonical
graph + DerivedNarratives + theme memory + (async) M3 records. No component computes
meaning; `buildMarketMap`, `deriveDriver`, `deriveSector` retire once the projection
lands (M4.2). The M&A page keeps the existing `NetworkGraph` until separately migrated —
the Intelligence Network becomes a new component family (`components/network/*`) so the
flagship redesign cannot regress M&A.

---

## 3. Layout strategy (decision)

**Default view: staged directed transmission layout (Option A).** Five fixed columns,
left → right, causes before effects:

```
DRIVERS    NARRATIVES     THEMES        INDUSTRIES     ASSETS
(macro)    (driver-set)   (canonical)   (taxonomy)     (tickers)
```

- **Column = ontology class.** The transmission sequence is legible before a single label
  is read. No synthetic "Market Center" node — the regime lives in the frame's status
  rail, not as a fake root.
- **Row order is deterministic**: within a column, sort by (narrative rank, conviction
  desc, canonical UID) — identical graph state → identical pixel layout, verified by test.
- **Stability rule**: an entity's row is keyed by canonical UID; when the set changes,
  existing rows keep their slots where possible and new entities fill gaps (minimal
  movement between updates; users build spatial memory).
- **No physics at rest.** Layout is computed once per graph state, outside the render
  loop. Collision is solved at layout time (column lanes + measured label boxes), not by
  simulation. Transitions between two layouts are 240ms eased tweens, then the canvas is
  static (rAF stops).
- Edges route as restrained horizontal Béziers between columns; same-column relations
  (theme↔theme correlation) arc shallowly outside the lane.
- **Radial causal layout (Option B) is retained as the Narrative/Entity Focus mode**:
  selected subject centered, concentric rings = transmission distance. Same node/edge
  grammar, different positioning function.
- Density controls: default ≤ ~48 nodes (top narratives + their members + top industries
  + ≤3 assets/theme); a density toggle reveals the longer tail; a confidence slider hides
  low-confidence edges.

Hybrid physics (Option C) is rejected for the default view: residual motion is what makes
the current surface feel like a demo.

## 4. Rendering technology (decision)

**Keep Canvas 2D. No new graph dependency.** Justification: target density is 40–120
nodes / 60–200 edges — far below WebGL's break-even; SVG would simplify labels but
complicate the path-tracing and replay compositing already proven on canvas; the existing
engine demonstrates the team can own canvas quality. Required changes are architectural,
not technological:

- layout computed outside the loop; **render-on-demand** (dirty flag) — rAF runs only
  during transitions, traces, replay, and hover; zero CPU when idle;
- pre-rendered node sprites / cached gradients (no per-frame gradient allocation);
- label placement solved at layout time with measured boxes and priority eviction
  (never two overlapping labels; lower-priority label hides, revealed on zoom);
- `prefers-reduced-motion`: transitions become instant, traces render as static
  highlighted paths;
- DPR-aware, ResizeObserver-driven (keep), lazy-loaded component (keep Next dynamic).

## 5. Node grammar

One silhouette per ontology class — class is readable from shape before color:

| Class | Form | Default-zoom content | Size logic |
|---|---|---|---|
| **Macro driver** | small anchored **diamond** + horizontal label tag | label only | fixed, small — authority from position (leftmost), not size |
| **Narrative** | **capsule hub** (rounded rect, 2px border) | title · lifecycle chip · conviction figure · daily Δ | width by title, height fixed; dominant narrative gets the single accent border |
| **Theme** | **rounded rectangle** with a 2px conviction bar along the bottom edge | name · conviction · trajectory arrow · memory-age tick marks | height fixed; bar length = conviction |
| **Industry** | compact rect, squared corners | label · exposure direction glyph (▲▼) · supporting-edge count | fixed |
| **Company/asset** | **ticker chip** (smallest; monospace ticker) | ticker · direction glyph; live move ONLY if a reliable quote source exists (none today → omitted) | fixed |

Rules: no radial-gradient glass balls; no additive bloom as base treatment; **glow is a
status signal only** (exactly two uses: selected-path emphasis, and a one-shot change
flash in Change mode/replay). No breathing. Hover = border brightens + hover card;
selection = 1px high-contrast outline + path emphasis.

**Palette behavior** (state, not decoration): structure slate/graphite (`#94a3b8` family
on the dark canvas); strengthening/supportive restrained teal `#2dd4bf`/green; weakening/
risk restrained red `#f87171`; unresolved/contradictory amber `#fbbf24`; narrative
emphasis Argus blue `#52b0c8` (sparing); selected path high-contrast white/blue. Class
identity comes from shape + column; color is reserved for state.

## 6. Edge grammar

Edges are the intelligence. One grammar, every mode:

| Dimension | Encoding |
|---|---|
| Direction | small arrowhead at target + gradient tail (keep gradient, add the arrow) |
| Type | canonical vocabulary label on hover/selection: `drives · supports · pressures · exposed_to · member_of · correlates` (from the model doc; `correlates` renders undirected). NO M&A vocabulary on this surface |
| Strength | line width (3 steps) |
| Confidence | line continuity: solid ≥70, long-dash 40–70, short-dash <40 — never color |
| Change | delta badge at midpoint (▲/▼ + since-yesterday) shown in Change mode / on hover; one-shot draw animation when an edge is new this session |
| Persistence | hover card: first seen, days active, strength history (from relationship registry + snapshots) |
| **Recorded vs derived** | recorded edges (backend graph / M3 registry): full-color stroke. Derived edges (frontend inference): 60% opacity + hollow arrowhead + "derived" tag on the hover card. Never identical |

**Animation restraint (binding):** edges are static at rest. Flow particles/dash-march
occur ONLY during: (a) an edge that changed (one-shot), (b) an active path trace,
(c) replay playback, (d) a selected narrative propagating its chain. The permanent
dash-offset march and ambient particles are removed.

## 7. Focus modes

Compact segmented control in the canvas frame's top rail (not five equal tabs):
`Overview ▾ | Change | Replay` with Narrative/Entity focus entered by click (not a tab)
and Prediction mode as a toggle chip.

1. **Market Overview (default)** — top narratives by rank, their member themes, activated
   industries, ≤3 representative assets per theme, drivers on the left rail.
2. **Narrative Focus** — click a narrative capsule: radial layout centered on it —
   members, driver set, exposure, contradictions, falsifiers (from the canonical
   narrative read); everything else exits the stage.
3. **Entity Focus** — click any theme/industry/asset: nearest meaningful relationships
   (1-hop recorded + trace to driver), radial.
4. **Change Mode** — only nodes/edges with a transition since the previous sealed
   snapshot (M3.2 `transition_events` / `relationship_transitions`); everything else
   ghosted at 15%.
5. **Historical Replay** — §9.
6. **Prediction Mode** — active structural predictions pinned to their subjects/edges
   (M3.3): small `P` chips; resolved outcomes render ✓/✗/– with verdict on hover.

## 8. Network Inspector (right panel redesign)

"Today's Market Story" becomes the **Network Inspector** — same position, three states,
canonical renderers only (shares components with the IntelligenceDrawer; the 210px
in-canvas panel inside NetworkGraph is removed from this surface — one drawer meaning
system):

- **Default (nothing selected):** dominant thesis (The Read, kept) · top causal path
  (rendered as a mini chain, click-to-trace) · strongest new relationship ·
  largest weakening relationship · "what changed since yesterday" (top 3 transitions) ·
  one watch condition (kept from current story.watch).
- **Node selected:** entity header (shared EntityChip) · role in transmission · why it
  matters (canonical profile read) · upstream drivers / downstream impacts (clickable) ·
  memory summary (§10) · predictions/outcomes count → expandable · "Open full profile"
  handoff to the IntelligenceDrawer.
- **Edge selected** (edges become first-class selectable): relationship statement
  ("AI Capex Supercycle **drives** Power Infrastructure") · direction/type/strength/
  confidence · recorded-or-derived provenance · first seen + persistence ·
  strengthening/weakening history · evidence references · active predictions and outcome
  history for this rel_uid · invalidation condition when a prediction carries one.

## 9. Replay (real, daily, honest)

The fabricated "9:30 AM → Now" intraday scrubber is **removed** and replaced by
institutional-memory replay over `/api/memory/v2/graph/at`:

- date selector + step ◀ ▶ + play/pause (~1.2s per day);
- header always shows **"Daily UTC boundary — sealed end-of-day state"**; no intraday
  claim anywhere;
- reconstruction badge: `completeness.status` (`daily / partial / empty`) rendered
  verbatim; missing dates show the honest empty/partial state, never interpolation;
- changed nodes/edges get the one-shot change flash; unchanged structure keeps exact
  positions (UID-keyed rows make this automatic);
- "compare to today" toggle: ghost of current state behind the historical one;
- dates before M3.2 deployment show the `partial` badge and theme-only structure.

## 10. Memory integration map

| Surface element | Source |
|---|---|
| Node hover: first seen, days observed, conviction now vs peak/trough, status streak | `theme.memory` (already on every feed theme; zero fetch) |
| Node inspector: lifecycle history, recent transitions, narrative membership history | `/api/memory/v2/themes/{uid}/snapshots` + `/transitions`, `narratives/{uid}/snapshots` |
| Node inspector: prediction/outcome counts + list | `/entities/{uid}/predictions`, `/predictions/{uid}/outcome` |
| Edge hover/inspector: first seen, days active, strength history, transitions | `institutional_relationships` registry via `/entities/{uid}/relationships` + `/relationships/{rel_uid}/snapshots` + `/transitions` |
| Narrative inspector: member changes, coherence history, dominance history | `/narratives/{uid}/snapshots` + `/transitions` |
| Historical analogs panel | `/themes/{uid}/historical-context` (M3.4) |
| Replay | `/graph/at?date=` |

**Honesty rules (binding):** M3.4 `insufficient_history` renders as a maturity state —
*"Institutional history accruing: N of 60 required archive days"* — never a fake analog.
Prediction surfaces never show accuracy numbers while calibration gates are unmet.
Derived (frontend) values are labeled derived. Fetches are lazy (on hover/selection),
cached per session, and degrade to the maturity state on API absence.

## 11. Interaction model

Pan: drag (keep). Zoom: wheel/pinch + buttons + double-click. Search: existing box, adds
type-ahead over canonical entities; match → camera focus + highlight (keep). Click node =
lock selection + inspector; click edge = edge selection; Escape or canvas click = reset
(add Escape). Hover = preview trace **without layout movement** (positions frozen during
hover). Path tracing: staged reveal kept, 480ms total, once — not looping. Upstream/
downstream expansion: +/- affordances on selection. Density + confidence filters in the
top rail. Keyboard: arrows walk the selected node's neighbors, Enter opens drawer, `/`
focuses search. Loading = skeleton frame; sparse = current limited-signal strip (kept).
All transitions ≤ 240ms, ease-out, functional only.

## 12. Desktop wireframe

```
┌──────────────────────────────────────────────────────────────┬───────────────────┐
│ ARGUS INTELLIGENCE NETWORK      Risk-On · Conv 68 · 12 themes│  NETWORK INSPECTOR│
│ [Overview ▾] [Change] [Replay]     [density|conf]  [search 🔍]│  ────────────────│
├──────────────────────────────────────────────────────────────┤  Dominant thesis  │
│  DRIVERS     NARRATIVES        THEMES         INDUSTRIES  ASSETS  "AI capex is…" │
│                                                              │                   │
│  ◆ AI Capex  ╔════════════╗   ┌──────────┐   ┌─────────┐ NVDA│  Top causal path │
│      ├──────▶║ AI Compute ║──▶│ Power    │──▶│ Semis ▲ │─┐CEG│  ◆→║AI║→Power→…  │
│  ◆ Power     ║ Arms Race  ║   │ Infra 72▲│   └─────────┘ └VST│                   │
│    Demand    ║ dominant 74║   │ ▂▂▂▂▂▂▂  │   ┌─────────┐    │  New: Semis↗Utils │
│      │       ╚════════════╝   └──────────┘   │ Utils ▲ │────┤  Weakening: …     │
│  ◆ Term ────▶╔════════════╗   ┌──────────┐   └─────────┘ TLT│                   │
│    Rate      ║ Higher-for-║──▶│ Duration  │──▶┌─────────┐ JPM│  Changed today(3)│
│              ║ Longer  61 ║   │ Reprice 61│   │ Fincl ▼ │─┘  │  Watch: 10Y >4.6 │
│              ╚════════════╝   └──────────┘   └─────────┘    │                   │
├──────────────────────────────────────────────────────────────┤  [asof 2026-07-13]│
│ ⏮ ◀ 2026-07-12 ▶ ⏭  ▷ play   Daily UTC boundary · daily ✓   │  completeness ✓   │
└──────────────────────────────────────────────────────────────┴───────────────────┘
```

## 13. Mobile adaptation

No full graph on phones. The hero becomes: (1) **causal chain card** — the dominant
narrative's driver→…→asset chain as a vertical swipeable sequence using the same node
grammar; (2) horizontal swipe moves between narratives (rank order); (3) tap = same
inspector as a bottom sheet (canonical drawer); (4) compact change list ("What changed
today"); (5) optional static mini-map thumbnail linking to desktop. Breakpoint `lg`
(matches the current grid split).

## 14. Implementation roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| **M4.1 — deterministic layout + visual redesign** | new `components/network/*` + `lib/networkLayout.ts`; staged columnar layout; node/edge grammar of §5–6; label collision at layout time; render-on-demand loop; remove perpetual motion, fake replay scrubber hidden; keep existing `buildMarketMap` inputs (zero new intelligence behavior); M&A untouched | identical graph state → identical layout (test); rAF idle at rest; no label overlaps; screenshot passes the "institutional workstation" bar |
| **M4.2 — canonical projection + inspector + focus modes** | `lib/networkProjection.ts` over intelligenceGraph + DerivedNarratives (narrative node class appears; `buildMarketMap`/`deriveDriver`/`deriveSector` retire); edge selection; Network Inspector (3 states) on shared drawer renderers; Overview/Narrative/Entity modes; internal 210px panel removed | no page-owned meaning left; inspector reuses drawer components; recorded vs derived visibly distinct |
| **M4.3 — institutional memory projection** | node/edge memory cards; transitions; prediction/outcome chips; Change mode; maturity/credibility states incl. M3.4 gate rendering | every hover exposes first-seen/persistence; insufficient_history renders as maturity text; no fake analogs |
| **M4.4 — historical replay** | `/graph/at` date reconstruction; stepper; change emphasis; compare-to-today; completeness badges | replays any sealed date; positions stable across dates; zero intraday claims |
| **M4.5 — polish + performance + mobile** | reduced motion; keyboard nav; mobile causal-chain mode; render profiling; final visual QA | 60fps transitions on a mid laptop; idle CPU ~0; Lighthouse/axe pass; mobile mode ships |

## 15. Risks

1. **Shared-engine regression** — NetworkGraph also powers M&A. Mitigation: new component
   family; M&A migrates later on its own sprint.
2. **Columnar layout with dense edge sets** can produce crossing spaghetti. Mitigation:
   lane-ordered row assignment minimizes crossings (barycenter pass); confidence filter
   defaults on; density cap.
3. **Losing the "alive" feel.** The current surface's charm is motion; removing it
   without adding information density will read as regression. Mitigation: M4.1 ships the
   grammar AND the richer node content in one phase — stillness must coincide with more
   meaning per pixel.
4. **API chattiness in M4.3** (per-hover memory fetches). Mitigation: session cache keyed
   by (uid, sealed_through); batch the overview's day-one fetches.
5. **Replay dates before M3.2** look sparse. Mitigation: completeness badge + partial
   styling designed up front, not retrofitted.
6. **`Date.now()` model ids** leak into other consumers of the graph engine — fix must
   land in the projection layer, not by patching the old adapter twice.

## 16. Acceptance criteria (M4 overall)

As specified in the M4 brief §15, plus: deterministic-layout unit test; zero permanent
rAF at rest (verified via performance profile); no M&A visual change in M4.1–M4.4; every
memory figure traceable to a canonical record; fabricated intraday replay removed by the
end of M4.1 (hidden) and replaced by M4.4 (real).

---

*Related: ARGUS_INTELLIGENCE_MODEL_V1.md (vocabulary this surface must project),
ARGUS_INTELLIGENCE_SURFACES_V1.md (pipeline rule + ownership),
ARGUS_INSTITUTIONAL_MEMORY_V2.md §15–18 (the records M4.3/M4.4 project),
ARGUS_INSTITUTIONAL_REASONING_V1.md (analog honesty rules),
ARGUS_HISTORICAL_REPLAY_V1.md (replay contract).*
