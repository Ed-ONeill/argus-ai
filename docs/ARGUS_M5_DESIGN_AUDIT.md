# ARGUS M5.0 — INSTITUTIONAL DESIGN AUDIT

**Status: AUDIT + ROADMAP. No interface changes ship in M5.0.** This document is the
lead-designer audit of the Intelligence Network surface (canvas + Intelligence
Inspector + frame, as of M4.3A), ranked findings, and the M5.1–M5.5 roadmap. It is
governed by the Design Bible (ARGUS_INTELLIGENCE_NETWORK_V2.md, V2.0–V2.3); where a
finding hardens into law, the fix lands as a V2.x amendment in its phase.

Benchmark: not "beautiful" — **"could plausibly be used every day by portfolio
managers, macro researchers, and institutional investors."** The test for every
finding: does the current treatment read as *institutional operating system* or as
*startup dashboard*?

Audit basis: current-build screenshots (default/dense/sparse/narrow + dossier), plus a
mechanical inventory of every typographic, spacing, radius, and shadow value in
`components/network/*`, `components/feed/ArgusMarketMap.tsx`.

---

## 1. What the restraint benchmarks actually teach

Extracted principles (not appearances), used as audit criteria below:

- **Bloomberg:** one type system carries everything; numerals are the interface;
  nothing is styled twice. → *Criterion: count the systems. More than one = drift.*
- **Palantir Gotham:** the instrument is one housing; chrome never competes with the
  canvas. → *Criterion: frame unity.*
- **Apple HIG:** one physics — light, depth, and motion obey a single model; nothing
  half-aligned. → *Criterion: could you write the elevation/motion rules on an index
  card?*
- **Linear:** speed + typographic discipline + a visible motion budget = premium;
  every size on a scale, every duration on a scale. → *Criterion: no arbitrary values.*
- **Figma:** camera dignity; chrome recedes totally behind content. → *Criterion: does
  any control call attention to itself?*
- **Bridgewater publications:** the page argues; numbers dominate; labels serve;
  metadata whispers in one consistent register. → *Criterion: squint — do the figures
  win?*

## 2. The audit

### 2.1 Typography — the largest gap ⚠⚠⚠

Measured: **12 distinct DOM sizes** (7 / 7.5 / 8 / 8.5 / 9 / 9.5 / 10 / 10.5 / 11 /
11.5 / 12 / 13.5 / 14 / 16 px) plus **a second, independent canvas type system** with
~12 more (6.8–14 px × a scale multiplier). Two systems, ~24 sizes, no scale.

Findings:
- **T1. No modular scale.** Sizes differ by 0.5px steps chosen per-element — the
  defining "startup dashboard" tell. An institution has a scale; a prototype has
  opinions per line.
- **T2. The mass of text sits at 7.5–10px** — below comfortable arm's-length reading
  (violates Bible 2.7). Metadata should whisper by *contrast and weight*, not by
  becoming illegible.
- **T3. Uppercase-tracked micro-labels are doing hierarchy work everywhere** (≥10
  eyebrow instances at 7.5px/0.16em). Bloomberg uses case+weight sparingly; here
  tracking is a crutch replacing a real scale.
- **T4. Numerals do not reliably dominate.** The dossier's 16px figure is right; on
  the canvas, theme titles (10.8) and conviction numerals (12) are near-parity, and
  the focal narrative — the most important object — carries *no* dominant numeral
  ink, so it loses the squint test to its own members.
- **T5. No tabular-figure guarantee.** `ui-sans-serif` gives no `tnum`; conviction
  columns and deltas can jitter width. Institutional surfaces set numerals in tabular
  figures, always.
- **T6. Canvas and DOM do not share a type ramp** — same information class (a
  conviction figure) renders at different sizes/weights depending on which renderer
  draws it. One instrument, one ramp.

### 2.2 Spacing — undisciplined but mechanical to fix ⚠⚠

Measured: gaps/paddings drawn from {0.5, 1, 1.5, 2, 2.5, 3, 3.5, 6} Tailwind units ad
hoc; canvas layout metrics (padX 14, padY 10, node paddings 8·s) live on a separate,
unrelated scale.

- **S1. No named scale.** Adopt one geometric scale (base-4: 4/8/12/16/24/32/48) and
  audit every value onto it. "No arbitrary padding" becomes enforceable only when the
  scale has names.
- **S2. Section rhythm in the Inspector is too tight**: ~20px between sections vs 6px
  within — sections blur; hairlines carry all the separation. Whitespace should do
  the separating (Bible 2.5), rules should merely confirm it.
- **S3. Canvas and DOM spacing are two systems** (same issue as T6). Node metrics,
  fan offsets, and frame paddings should be expressed on the same scale tokens.

### 2.3 Composition & housing ⚠⚠

- **C1. Two housings, one instrument.** The canvas has a hard frame; the Inspector
  floats on a radial wash with no frame. Bible 5.1/5.5 requires one housing, shared
  chrome, aligned baselines. Currently the Inspector reads as a page column beside an
  instrument, not the instrument's voice. (Screenshot: the canvas rail baseline and
  "NETWORK INSPECTOR" baseline do not align.)
- **C2. Double identity.** The page header says "Argus Market Map"; the frame rail
  says "INTELLIGENCE NETWORK"; the panel says "Intelligence Inspector." Three names on
  one screen. One name must win (the Bible's name), stated once.
- **C3. Vertical dead zones.** Sparse days leave the lower third of the canvas and the
  area beneath a short dossier empty in an *unintentional* way (Bible 2.5: emptiness
  must read as structure, not shortage).
- **C4. Floating furniture.** The whisper legend (bottom-left) and CAUSE → EFFECT cue
  (bottom-right) hover unanchored; they belong in a composed baseline strip of the
  frame, aligned to the spacing scale.

### 2.4 Canvas hierarchy ⚠⚠

- **H1. The focal object under-dominates.** Tier-1 metrics (≤236×64) vs tier-2
  (≤186×48): only ~1.5× area for the object the whole composition serves. With no
  numeral ink (correct per canon), it needs compensating mass: size, border weight,
  and local illumination one step up. Squint at the default screenshot: *Power
  Infrastructure 78* wins, and it shouldn't.
- **H2. Drivers still read as a stacked list** (five diamonds, even vertical rhythm,
  same x). The Bible's upper-left/lower-left grouping isn't legible at n=5; group
  spacing must exceed within-group spacing by a clear ratio.
- **H3. Tier-4 color noise.** Fifteen direction glyphs in full teal/red across the
  asset field spend the color budget on the least important tier. Direction at tier 4
  should be border-tint + glyph at reduced chroma; full-chroma direction is earned at
  tier 2–3.

### 2.5 Depth, shadow, glow ⚠

- **D1. One ad-hoc heavy shadow** (`0 12px 34px rgba(0,0,0,.6)` on the hover card) —
  the definition of a "CSS-looking" shadow. Design an elevation system: **ambient**
  (large radius, ≤0.25 alpha) + **contact** (≤2px, tighter, darker) per level: L0
  in-frame content (none), L1 frame (ambient only), L2 hover card (ambient+contact),
  L3 none (nothing floats higher).
- **D2. Plates are optically unground** — canvas nodes sit on the field with no
  contact shadow; depth currently comes only from the vignette. A 1px dark contact
  line under plates grounds them without decoration.
- **D3. Glow discipline is already close to canon** (selection + cluster illumination
  + lit path only). Codify the budget: exactly three glow sources, alpha-capped;
  everything else banned. No action beyond codification.

### 2.6 Motion & interaction ⚠⚠

Idle motion is already zero (M4.1). Remaining violations of "nothing moves unless
information changes":

- **M1. The full 480ms chain trace fires on every hover.** Sweeping the cursor across
  the canvas replays cinematic traces continuously — the single busiest behavior left.
  Per Bible 4A, hover asks "what is this?" (static neighborhood attention); the trace
  is selection's answer to "explain this." Demoting hover to static emphasis removes
  ≈70% of observed motion in normal use by itself.
- **M2. Camera easing is exponential lerp (0.22)** — asymptotic, never lands crisply;
  reads floaty. Replace with fixed-duration eased tweens (240ms, ease-out) that
  *arrive*.
- **M3. The Inspector snaps between dossiers** — no 180ms crossfade (Bible 6 table).
- **M4. Tooltip appears/moves instantly with no grace** — flickers when sweeping;
  needs 120ms fade + ~80ms intent delay + stable placement (flip once, not per-pixel).
- **M5. `transition-all` on the search input** — lazy transition scoping; each
  transition names its property and duration from the motion scale.
- **M6. Keyboard coverage** is Esc-only; `/` for search and arrow-walks are specified
  (4A.12) and absent.
- **M7. Loading/empty states are generic** (pulsing gray bars; plain-text "Limited
  signal"). Bible 6 calls for designed placeholder geometry — a still skeleton of the
  actual composition (frame, rails, focal placeholder), and the sparse state should
  render the guaranteed-honest chain rather than prose alone.

### 2.7 Color ⚠ (minor)

- **K1. The Inspector concentrates four signal colors** (accent eyebrows, teal chips,
  red falsifiers, amber gate note) in one column — each individually correct, together
  slightly bazaar-like. Demote beneficiary chips to slate + glyph; reserve chroma for
  state that changed.
- **K2. Canvas/DOM color constants are duplicated** (two `C`/`T` palettes drifting by
  hand). One token source.

## 3. The "startup dashboard tells" (summary list)

1. Per-element font sizes (no scale) — T1
2. Sub-9px body text everywhere — T2
3. Tracking-and-uppercase as the only hierarchy tool — T3
4. Numerals that don't win the squint — T4
5. Unframed panel beside a framed canvas — C1
6. Three product names on one screen — C2
7. One big blurry box-shadow — D1
8. Hover that plays a movie — M1
9. Floaty asymptotic camera — M2
10. Pulsing skeleton bars — M7

## 4. Ranked findings (impact × effort)

| Rank | Finding | Impact | Effort |
|---|---|---|---|
| 1 | T1–T6 typography system (one ramp, tabular numerals, numeral dominance) | transforms every pixel | M |
| 2 | M1 hover-trace demotion + M2 camera arrival | calm = trust; biggest felt change | S |
| 3 | C1–C2 one housing, one name, aligned baselines | "one instrument" in a glance | S–M |
| 4 | S1–S3 spacing tokens across DOM + canvas | rhythm; enables everything after | M |
| 5 | H1–H3 focal dominance, driver grouping, tier-4 chroma demotion | the story wins the squint | M |
| 6 | D1–D2 elevation system + plate grounding | optical grounding | S |
| 7 | M3–M5 inspector crossfade, tooltip grace, scoped transitions | engineered feel | S |
| 8 | M7 designed loading/empty/sparse states | first-touch trust | M |
| 9 | M6 keyboard (`/`, arrows) | workstation credibility | S |
| 10 | K1–K2 color budget + single token source | polish | S |

## 5. Roadmap — each phase independently shippable

**M5.1 — Typography & Hierarchy** *(findings T1–T6, H1, K2-tokens)*
One type ramp for DOM *and* canvas (proposed: 9 / 10.5 / 12 / 14 / 18 / 24 with
weights doing the whispering; metadata = smallest step at reduced contrast, never
smaller), tabular numerals everywhere, numeral-dominance pass (figures one step larger
and one weight heavier than their labels, ink-weight rule from Bible 3A.2 applied),
focal object mass increase. *Exit: squint test — figures and the focal win on every
screenshot; zero font sizes off the ramp (greppable).*

**M5.2 — Composition & Layout** *(C1–C4, S1–S3)*
Spacing token scale adopted across DOM and canvas metrics; single instrument housing
(inspector enters the frame, shared rail, aligned baselines); one name ("Intelligence
Network", stated once); legend/cue anchored in a composed baseline strip; sparse-state
composition (content scales and centers with intent). *Exit: overlay a 4px grid —
everything lands; the frame screenshot reads as one housing; zero off-scale spacing
values.*

**M5.3 — Motion & Interaction** *(M1–M6)*
Hover = static attention (trace reserved for selection) — ≥70% observed-motion
reduction; fixed-duration camera tweens that arrive; 180ms inspector crossfade;
tooltip intent-delay + fade + stable placement; scoped transitions on a duration
scale (120/180/240/480); `/` and arrow-walk keyboard. *Exit: screen-record a normal
browse — motion occurs only on selection, topology change, or camera command; every
duration is from the scale.*

**M5.4 — Visual Language** *(D1–D3, H2–H3, K1)*
Elevation system (ambient+contact, three levels); plate contact grounding; one radius
family (2 values: plate 4-6px, pill full); glow budget codified (three sources, alpha
caps); driver group rhythm; tier-4 chroma demotion; single color-token source shared
by canvas and DOM. *Exit: the index-card test — border, radius, shadow, glow, and
color rules each fit on one line and the build greps clean against them.*

**M5.5 — Final Polish** *(M7 + QA)*
Designed loading skeleton (the instrument's own still geometry), designed sparse and
error states, hit-target audit (≥24px effective), contrast audit, reduced-motion
re-verification, then the full gate suite: Five Second Test (1A), no-logo crop test
(3A.5), screenshot test (8), morning-meeting copy read (4B.8), plus fresh
before/after screenshots at default/dense/sparse/narrow. *Exit: all four Bible gates
pass, judged cold.*

Each phase ends with harness screenshots and a Bible amendment (V2.x) where the phase
hardened a rule (M5.1 → the type ramp; M5.2 → the spacing scale; M5.4 → elevation/glow
budgets), so drift after M5 is a governance violation, not an opinion.

## 6. What is explicitly out of scope

No new intelligence, AI, APIs, backend, or business logic anywhere in M5. No
feature-shaped "polish" (tabs, filters, panels). If a proposed change adds capability
rather than quality, it is not M5.

---

*Related: ARGUS_INTELLIGENCE_NETWORK_V2.md (the law this audit enforces),
ARGUS_INTELLIGENCE_NETWORK_V1.md (engineering constraints all phases inherit —
determinism, render-on-demand, M&A isolation).*
