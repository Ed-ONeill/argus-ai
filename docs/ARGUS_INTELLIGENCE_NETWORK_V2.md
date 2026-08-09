# ARGUS INTELLIGENCE NETWORK V2 — The Design Bible

**Status: V2.0 — THE FIRST APPROVED DESIGN BIBLE.** This is the product-design
definition of the flagship Argus experience. It governs every future implementation
sprint of the Intelligence Network and every surface that later adopts its language.
It contains no code and proposes none. When an implementation and this document
disagree, one of them is wrong — resolve explicitly, never silently. Versioning and
amendment rules: see DOCUMENT GOVERNANCE at the end of this document.

## Table of Contents

- **Part 0 — What Argus Is** (product identity; canonical product statement)
- **Part 1 — Design Philosophy** (why the Network exists; emotional target; differentiation)
- **Part 1A — The Five Second Test** (the permanent first-impression acceptance gate)
- **Part 2 — Visual Philosophy** (hierarchy, density, balance, lighting, space, depth, typography, color, motion, stillness)
- **Part 3 — Visual Language** (the 13-object vocabulary and state systems)
- **Part 3A — The Argus Form Language** (V2.1: the five-element DNA that makes a logo-less screenshot unmistakably Argus)
- **Part 4 — Interaction Philosophy** (hover, selection, camera, zoom, modes, search, tracing, replay, keyboard, accessibility)
- **Part 4A — The Interrogation Model** (V2.2: every gesture is a question; every response is staged reasoning)
- **Part 4B — The Voice & Cognition Model** (V2.3: how Argus thinks, speaks, prioritizes, and handles uncertainty — the permanent personality)
- **Part 5 — Composition** (the desktop stage, the eye's path, whitespace, ultrawide)
- **Part 6 — Motion Language** (the closed table of legal motion; the ban list)
- **Part 7 — Design Principles** (the thirty principles)
- **Part 7A — What Argus Will Never Become** (canonical anti-patterns)
- **Part 8 — The Screenshot Test** (the still-image standard)
- **Part 9 — Competitive Analysis** (Bloomberg, Gotham, Bloom, Figma, Linear, Apple, Bridgewater)
- **Part 10 — Future Evolution** (the Network as the spine / visual intelligence layer of Argus)
- **Document Governance** (versioning, amendment, and conflict rules)

---

# PART 0 — WHAT ARGUS IS

Before any pixel is designed, the identity it serves must be stated — because every
anti-pattern in this document's history began as a reasonable feature attached to the
wrong identity.

**Argus is not a dashboard.** Dashboards organize information into tiles and leave the
understanding to the reader. Argus arrives already understanding.

**Argus is not a news reader.** News is an input. Argus consumes news the way an
analyst does — as evidence for or against a standing model of the market — and what it
publishes is the model, not the feed.

**Argus is not an AI chatbot.** A chatbot answers the question it was asked and forgets.
Argus maintains a position: persistent, versioned, contradicted in public, corrected on
the record.

**Argus is not a graph visualization.** A graph visualization renders connectivity.
The Intelligence Network renders a *reasoned structure* — causality, conviction,
provenance, and memory — of which the graph shape is merely the geometry.

**Argus is not a Bloomberg clone.** Bloomberg is the world's best instrument for
inspecting raw market state. Argus is an instrument for inspecting a *thesis about*
market state — with the evidence and track record attached.

What Argus is:

> **Argus is an institutional market reasoning system.** It continuously
> **constructs** a model of market structure from evidence, **maintains** that model
> with institutional memory across every cycle, **tests** it on the record through
> predictions and outcomes, and **explains** it — its causes, transmissions,
> exposures, and confidence — in language and structure a professional can interrogate.

The division of labor in one line each: dashboards organize information; search engines
retrieve information; LLMs summarize information; **Argus builds an evidence-backed
understanding of market structure.**

Every page in the product exists to inspect that one understanding from a different
perspective — the Feed inspects it as a stream, Markets as a regime, Themes as a
dossier, M&A as a transaction lens, Listen as a conversation, the Morning Brief as a
narrative. The Intelligence Network is therefore not another page. **It is Argus's
canonical interactive visual intelligence layer/environment** [V2.4] — the understanding
itself, made visible, the spine from which every other surface is a projection.

The permanent product statement, canonical from this version forward:

> **"Argus exists to transform market complexity into institutional understanding."**

Every feature, surface, and redesign is measured against that sentence.

Audience: product designers, interaction designers, visual designers, and the engineers
who will build from their work. The test of this document: five engineers, working
independently, should converge on the same product.

Relationship to existing canon: ARGUS_INTELLIGENCE_NETWORK_V1.md remains the M4
engineering specification (data ownership, determinism, performance). This document
sits above it and defines *what the thing is* — V1 defines how it is honestly built.
The honesty doctrine of ARGUS_INSTITUTIONAL_MEMORY_V2.md and
ARGUS_INTELLIGENCE_MODEL_V1.md is binding on every visual decision here.

---

# PART 1 — DESIGN PHILOSOPHY

## 1.1 Why the Intelligence Network exists

Every market product answers "what is happening?" Argus exists to answer four harder
questions in a single glance: **what is driving markets, how is it transmitting, who is
exposed, and how sure are we — given everything we remember.**

The Intelligence Network is the one surface where Argus's entire epistemology is visible
at once: its ontology (what exists), its causality (what drives what), its memory (how
long this has been true), and its accountability (what it predicted and what happened).
Every other page of Argus is a projection of this structure into prose, lists, or
tables. The Network is the structure itself, made visible.

It exists because the thing Argus actually knows — a causal, evidence-bearing,
memory-backed model of the market — is a *shape*, and no list can show a shape.

## 1.2 The emotional reaction

The target feeling, in order of arrival:

1. **Orientation** (0–5 seconds): "I can see what matters." Not impressed yet — oriented.
2. **Trust** (5–30 seconds): "This is drawn from records, not vibes." The provenance
   styling, the conviction numerals, the memory ages — the surface visibly shows its work.
3. **Ownership** (first week): "This is my map." Spatial memory forms because positions
   are stable. The user starts noticing *change* rather than reading *state* — the
   moment a strengthening edge or a moved conviction registers as news, the product has
   succeeded.
4. **Calm** (always): the surface never performs. It is still when nothing has changed,
   and that stillness is the promise that when something *does* move, it means something.

The composite emotion is **calm authority** — the feeling of standing in a quiet room
where someone already understands the situation. Never excitement. Excitement is what
consumer trading apps sell; it is the opposite of institutional.

## 1.3 Why it is not Bloomberg

Bloomberg's genius is density without opinion: every number, no synthesis. The terminal
trusts the user to build the picture, and its aesthetic — amber-on-black, zero
decoration — signals "we will not waste a pixel entertaining you."

Argus inverts the contract. **Argus's product is the synthesis itself** — the causal
picture, pre-built, with its evidence trail attached. So where Bloomberg shows ten
thousand numbers and no shape, the Network shows one shape and perhaps forty numbers,
each of which earns its place. We borrow Bloomberg's refusal to decorate, and reject
its refusal to conclude.

## 1.4 Why it is not Palantir

Palantir Gotham renders entity-link graphs for *investigation*: the analyst assembles
meaning by expanding nodes, and the graph is a workspace of raw connections. Its power
is open-endedness; its cost is that the graph means nothing until a human makes it mean
something.

The Argus Network is not a workspace — it is a *finding*. The picture arrives already
formed: a dominant narrative, its transmission, its exposures, ranked and provenanced.
The user interrogates a conclusion rather than assembling one. Where Gotham says "here
is everything, explore," Argus says "here is what matters, verify me" — and hands over
the memory and prediction ledger to make verification possible.

## 1.5 Why it is not a generic graph visualization

Generic network visualizations (D3 demos, Neo4j Bloom, crypto maps) share one flaw:
**topology is their only message.** Nodes are circles, edges are lines, position is
physics, color is category — nothing on the canvas encodes state, time, confidence, or
provenance, so everything reads as equally true and equally important.

In the Argus Network, every visual channel is a claim with a source:

- **position** encodes causal role (upstream forces left, expressions right);
- **size** encodes institutional standing (tier), never degree or physics;
- **shape** encodes ontology class;
- **color** encodes state (supportive, pressured, contradictory) — never identity;
- **line style** encodes confidence and provenance (recorded vs derived);
- **motion** encodes change, and only change;
- **age and memory** are visible on demand for every object.

A graph where visual channels are claims must be still, deterministic, and restrained —
because every pixel is asserting something Argus must be able to defend.

## 1.6 The five-second understanding

A first-time viewer, five seconds, no explanation, must correctly answer:

1. **What is the dominant story?** (the focal object — largest, center-left, named)
2. **What is causing it?** (the anchored forces on the left, connected by visible flow)
3. **Who is affected, and in which direction?** (downstream clusters, teal/red state)
4. **How convinced is Argus?** (the conviction numerals on every major object)

And must correctly *feel* one thing: this is an instrument, not an illustration.

---

# PART 1A — THE FIVE SECOND TEST

The permanent acceptance gate for every visual revision of Argus, and the
operationalization of §1.6 into review procedure. It applies to the Intelligence
Network first and to every surface that adopts its language thereafter.

**Within five seconds of opening Argus, a first-time user must be able to say:**

1. **What is driving today's market.** The dominant forces are visible, named, and
   positioned as origins — not buried in a list or behind a click.
2. **Which narratives are transmitting.** The market's active stories are the largest,
   most legible objects on the surface, ranked by Argus's actual conviction.
3. **Where those effects are flowing.** Direction is readable as geometry: the eye can
   follow cause to consequence to exposed instrument without instruction.
4. **Why Argus believes those relationships exist.** Confidence and provenance are
   visible properties — conviction numerals, recorded-versus-derived styling, evidence
   counts — not claims the user must take on faith.
5. **That Argus remembers, learns, and improves over time.** Ages, deltas, and the
   prediction ledger's presence signal — even before they are read — that this system
   has a past and is accountable to it.

**The failure rule:** if a redesign cannot communicate these five ideas in five
seconds, the redesign has failed — *regardless of visual beauty.* Elegance that
obscures the model is regression. A redesign may be austere and pass; it may be
stunning and fail.

**Review procedure:** every future visual review — mockup, prototype, or shipped build
— begins by showing the default view cold to someone unfamiliar with the change and
scoring these five questions before any other feedback is taken. The Screenshot Test
(Part 8) then judges the still image; this test judges the first five live seconds.
Both must pass; neither substitutes for the other.

---

# PART 2 — VISUAL PHILOSOPHY

Each element of the philosophy exists to serve the epistemology. None is aesthetic
preference.

## 2.1 Hierarchy

One object dominates; everything else serves it. The eye must land within 300ms on the
focal intelligence object (dominant narrative), then flow left to its causes and right
to its consequences. Hierarchy is expressed through four channels in fixed priority:
**size, then position, then contrast, then color.** If two objects compete for
dominance, the composition is wrong — canonical intelligence (conviction, dominance
rank) decides, never layout convenience.
*Why: markets have a dominant story every day; a surface that renders all stories at
equal weight is lying about how conviction works.*

## 2.2 Density

Target: **high information per object, moderate objects per screen.** Roughly 25–50
entities on a default desktop view; each major object carries 3–5 live facts (title,
conviction, delta, state, age). Density comes from making every object rich, never from
adding objects. When the intelligence is genuinely sparse, the surface admits it —
fewer, larger, calmer objects — rather than padding.
*Why: institutional users equate emptiness with immaturity and clutter with noise;
richness-per-object is the only density that signals expertise.*

## 2.3 Balance

The composition is deliberately **asymmetric**: mass sits center-left (the story),
consequences fan right, and the inspector column holds the right edge. Vertical balance
keeps the canvas from tipping — upstream forces distribute across the left band's upper
and lower thirds, downstream clusters stagger rather than stack. Perfect symmetry is
forbidden; it reads as decoration.
*Why: causality is directional; a balanced-but-directional composition lets the eye
read time (cause → effect) as space (left → right) without a legend.*

## 2.4 Lighting

The canvas is lit like a control room at night: a dark field, slightly deeper at the
edges (vignette), with **localized illumination where intelligence concentrates** —
a soft field under the focal object, faint pools under downstream clusters. Light means
"attention lives here," never "look how pretty." There is exactly one bright thing at a
time: the selected path.
*Why: light is the scarcest resource on a dark surface; spending it everywhere spends
it nowhere.*

## 2.5 Negative space

Emptiness is structural, not accidental. Space between clusters *is* the cluster
boundary — no drawn bubbles, no containers. The margin around the focal object is its
authority. Negative space must always be readable as "these things are separate,"
never as "we ran out of content." The fit-to-content rule (content occupies 75–90% of
the analytical area) keeps space intentional at every density.
*Why: containers and boxes are the vocabulary of dashboards; separation by space is
the vocabulary of maps.*

## 2.6 Depth

Three planes, strictly ordered: **atmosphere** (vignette, faint field texture, cluster
illumination) behind; **relationships** (edges) in the middle; **intelligence objects**
(nodes) in front. Depth cues are opacity and layering only — no drop-shadow stacks, no
3D, no parallax. An object may cast the faintest ground shadow to sit *on* the field
rather than *in* it. Focus adds one temporary plane: the selected path lifts above
everything.
*Why: depth exists to guarantee nodes always beat edges; the moment a line crosses in
front of a conviction numeral, the instrument is broken.*

## 2.7 Typography

Typography is the voice of the instrument. The primary Argus sans carries all
intelligence (titles, states, drivers). Tabular/monospace figures carry all tradeable
identifiers (tickers) — monospace signals "this is a symbol, not a word." Rules:

- Titles of major objects: medium-large, high contrast, never uppercase-tracked.
- Conviction numerals: the boldest text on the canvas — they are the product.
- Micro-labels (states, ages, classes): small but never below comfortable reading at
  arm's length; low contrast but never ghostly. If a label must shrink below
  readability, it must instead move to hover.
- Long names wrap; truncation is a last resort and always recoverable on hover.
- At most three text sizes visible per object; at most five on the whole canvas.

*Why: a workstation is read for hours; every failed squint is a withdrawn unit of trust.*

## 2.8 Color

The canvas is grayscale-plus-signals. Structure — bodies, borders, edges at rest, all
text — lives in the slate/graphite family on the near-black field. Color appears only
as **state**:

| Signal | Meaning | Feel |
|---|---|---|
| Restrained teal | supportive / strengthening / bullish exposure | cold, factual positive |
| Restrained red | pressured / weakening / bearish exposure | alert without alarm |
| Amber | contradictory / unresolved / caution | honest uncertainty |
| Argus blue | narrative emphasis, selection, "Argus is speaking" | the brand's voice, used sparingly |
| High-contrast white-blue | the selected path — the one bright thing | focus |

Anchors (design tokens, shared with the wider Argus system): field `#070B13`, structure
slate `#94A3B8`, teal `#2DD4BF`, red `#F87171`, amber `#FBBF24`, Argus blue `#52B0C8`,
focus `#DBEAFE`. Saturation stays low everywhere; nothing neon, nothing gradient-happy.
A colorblind-safe reading must always exist through glyphs (▲▼), position, and line
style — color is reinforcement, never the sole carrier.
*Why: when color only ever means state, the user's peripheral vision becomes a risk
monitor for free.*

## 2.9 Motion

Motion is reserved for **information changing**. Four legitimate motions exist:
transition (layout/topology changed), trace (a causal path being revealed once),
arrival (a new object entering), and resolution (a prediction or replay step landing).
Every motion is short (under half a second), eased, and terminal — it ends in
stillness. Motion never loops, never idles, never decorates.
*Why: if the surface moves when nothing changed, movement can never again mean
something changed.*

## 2.10 Stillness

Stillness is the signature. At rest the Network is a perfectly still instrument — and
because position, light, and color are all meaningful, the stillness reads as loaded,
not dead. Stillness is what makes the Network screenshot-able, printable, and
trustworthy; it is also what makes the rare motion feel like news.
*Why: authority is still. Everything that blinks is asking for attention; everything
still is assumed to deserve it.*

---

# PART 3 — VISUAL LANGUAGE

The object vocabulary. Every object is defined by: Purpose · Hierarchy · Shape ·
Visual weight · Behavior · Interaction · Animation · States · Example.

**Global state system** (applies to every object unless overridden):
`rest → hovered → in-path → selected → dimmed(out-of-path) → entering → aged/stale`.
Dimming is severe (objects fall to near-invisibility when excluded from a focused
path); hover is subtle (border clarifies, tooltip appears); selection is unmistakable
(one bright outline + the only glow on the surface).

## 3.1 Macro Driver

- **Purpose:** an external force entering the system — rates, liquidity, geopolitics,
  capex cycles. The "why" behind every narrative.
- **Hierarchy:** Tier 2. Authority from *position* (leftmost, origin of all flow),
  never from size.
- **Shape:** a small filled diamond with the label set beside it, underlined by a thin
  "authority line" that extends toward the system — the visual of a force anchored
  outside, pushing in.
- **Visual weight:** light. A driver is a label with gravity, not a card.
- **Behavior:** groups with related drivers; sits vertically near the mean of the
  themes it feeds.
- **Interaction:** hover reveals full name, definition, and the themes it drives;
  select traces every transmission path it originates.
- **Animation:** none at rest. On selection, its outgoing paths trace once.
- **States:** rest / hovered / selected / dimmed. Drivers have no direction state —
  forces are not bullish or bearish; their consequences are.
- **Example:** ◆ **AI Capex Supercycle** ———

## 3.2 Narrative

- **Purpose:** the largest unit of meaning — a driver-set grouping of themes ("what
  story is the market telling"). The dominant narrative is the focal object of the
  entire surface.
- **Hierarchy:** Tier 1 when dominant; Tier 2 otherwise. Nothing outranks the dominant
  narrative.
- **Shape:** a wide faceted capsule — the Argus silhouette (one notched corner, a slim
  conviction rail on the leading spine). Structured like an instrument face: eyebrow
  class label, title, member count, coherence, dominance state.
- **Visual weight:** the heaviest object on the canvas when dominant: widest, brightest
  border (Argus blue), local illumination beneath.
- **Behavior:** organizes its member themes spatially around itself; when dominance
  changes (canonically), the focal position transfers in one deliberate transition.
- **Interaction:** hover previews members and coherence; select enters Narrative Focus
  (its chain becomes the composition; everything else recedes); inspector fills with
  thesis, members, contradictions, falsifiers.
- **Animation:** entrance fade on first derivation; a single border-pulse when
  membership changes (one beat, then still).
- **States:** dominant / secondary / dissolving (members departing — border cools to
  slate) / plus global states. Never renders without ≥2 members (a one-theme narrative
  is a theme).
- **Example:** the "AI COMPUTE ARMS RACE" capsule: eyebrow `DOMINANT NARRATIVE`, title,
  `4 themes · coherence 71`, teal rail.

## 3.3 Theme

- **Purpose:** the workhorse intelligence unit — an evidence-bearing market thesis with
  conviction, trajectory, and memory.
- **Hierarchy:** Tier 2 (Tier 1 while standing in for a missing narrative class).
- **Shape:** the faceted Argus object at medium scale: notched corner, left conviction
  rail (fills with conviction, colored by direction), title (wrapping to two lines),
  bold conviction numeral with delta arrow, momentum micro-label.
- **Visual weight:** medium-heavy; the most numerous "card-class" object, so its
  restraint sets the canvas's tone.
- **Behavior:** constellates around its narrative; sits left of the industries it
  drives; carries its ThemeMemory age invisibly until asked.
- **Interaction:** hover reveals full thesis line, first-seen age, streak; select
  focuses the page (the Feed contract: selection drives everything below); the
  inspector shows drivers, exposures, memory summary, predictions.
- **Animation:** conviction numeral ticks once when the value changes on a refresh;
  the rail refills in the same beat.
- **States:** direction (supportive rail teal / pressured red / neutral slate),
  strengthening/weakening (delta arrow), new (subtle "NEW" eyebrow during its first
  session), stale (desaturated, conviction dimmed), plus global states.
- **Example:** `Power Infrastructure — 78 ▲6 — ACCELERATING`, teal rail at 78%.

## 3.4 Industry

- **Purpose:** the junction where narrative becomes sector reality; the switchboard
  between themes and tradeable expressions.
- **Hierarchy:** Tier 3.
- **Shape:** a compact squared plate with a directional edge-tab (a thin colored tab on
  the leading edge showing net exposure direction), label, direction glyph, breadth
  count (×N supporting themes).
- **Visual weight:** light-medium; junctions must never compete with themes.
- **Behavior:** anchors a local constellation of its assets; staggered against sibling
  industries so downstream space reads as clusters, not a rail.
- **Interaction:** hover reveals which themes transmit into it and net direction; select
  focuses its cluster and upstream chain.
- **Animation:** none of its own; participates in traces.
- **States:** exposure direction (tab color), contested (fed by opposing themes — tab
  splits teal/red, amber glyph), plus global states.
- **Example:** `Utilities ▲ ×2` with a teal tab, three ticker satellites.

## 3.5 Company / Asset

- **Purpose:** the terminal expression — where the story becomes a position.
- **Hierarchy:** Tier 4, deliberately the smallest voice on the canvas.
- **Shape:** a ticker pill: monospace symbol, direction glyph, hairline border tinted by
  state. Nothing else at rest — a ticker is an address, not a story.
- **Visual weight:** minimal individually; meaningful as constellation patterns around
  industries.
- **Behavior:** orbits its primary industry in a stable fan; a multi-exposure asset
  sits with its strongest cluster and keeps visible edges to the others.
- **Interaction:** hover names the company and the themes exposing it; select traces
  the full chain from macro force to this ticker — the signature demo of the product.
- **Animation:** none at rest; arrives with the standard entrance fade. (Live price
  motion is out of scope until a reliable quote source exists — honesty rule.)
- **States:** direction (glyph + border tint), multi-exposure (small stacked-link mark),
  plus global states.
- **Example:** `NVDA ▲` in a quiet pill, teal hairline.

## 3.6 Prediction

- **Purpose:** visible accountability — a structural expectation Argus has put on the
  record (M3.3), attached to the subject it is about.
- **Hierarchy:** annotation tier — never competes with intelligence objects.
- **Shape:** a small square badge bearing `P`, docked to the subject's corner; an open
  square while active, filled on resolution: ✓ (confirmed), ✕ (contradicted),
  – (invalidated/data-gap, amber).
- **Visual weight:** whisper at rest; prediction *mode* raises all badges one step.
- **Behavior:** appears only when a ledger record exists; counts collapse (`P3`) when a
  subject carries several.
- **Interaction:** hover states the expectation verbatim with its horizon; click opens
  the ledger view in the inspector: statement, assumptions, invalidation conditions,
  outcome, resolution rules.
- **Animation:** exactly one motion — the resolution beat: open square fills to
  verdict in a single 300ms step on the day it resolves. This is the accountability
  moment; nothing else on the surface may move during it.
- **States:** active / confirmed / contradicted / invalidated / expired — colors follow
  the state palette; invalidated is amber and never disguised as failure or success.
- **Example:** the Utilities↗Power edge carrying `P ✓` after a persistence prediction
  confirmed.

## 3.7 Memory

- **Purpose:** the credibility layer — how long Argus has known something, how it has
  moved, what changed. Memory is what separates a finding from a guess.
- **Hierarchy:** ambient annotation; visible on demand, legible everywhere.
- **Shape:** three quiet forms: an **age tick row** (small marks on major objects —
  more ticks, older knowledge), a **memory line** in every hover ("First seen 12 May ·
  41 sessions · peak 84"), and the **memory panel** in the inspector (conviction
  sparkline over sealed history, lifecycle row, transition list).
- **Visual weight:** near-zero at rest. Memory whispers.
- **Behavior:** every fact traces to a sealed record; when history is younger than the
  credibility gates, the object says so: *"Institutional history accruing — 12 of 60
  archive days."* Maturity states are designed, first-class visuals, not error text.
- **Interaction:** memory mode tints object borders by age (older = more settled, new =
  faintly luminous) for one sweeping read of "what here is established vs new."
- **Animation:** none. Memory is the stillest thing on the surface — by definition.
- **States:** accruing (gated) / young / established / deep — thresholds from the
  canonical gates, never invented per-surface.
- **Example:** hovering the focal narrative: "Tracked 47 sessions · conviction 62→78 ·
  2 contradictions resolved."

## 3.8 Relationship (Edge)

- **Purpose:** the causal claim — *this drives that*. Edges are the intelligence; they
  are also the most dangerous element, because an overdrawn edge is a shouted claim.
- **Hierarchy:** beneath all nodes at rest; the selected path outranks everything.
- **Shape:** a restrained curve (gentle bow, never orthogonal elbows, never straight
  lasers) terminating in a refined arrowhead at the target's boundary. Grammar:
  **width = strength; continuity = confidence** (solid / long-dash / short-dash);
  **arrowhead fill = provenance** (filled = recorded, hollow = derived, with derived
  edges also fainter); **hue = effect** (teal supports, red pressures, slate
  structural).
- **Visual weight:** quiet at rest — the field of edges should read as texture from
  arm's length, individually legible on attention.
- **Behavior:** recorded and derived edges must never be confusable; a verb label
  (DRIVES, PRESSURES, EXPOSED TO) appears on the traced path only.
- **Interaction:** edges are selectable; hover thickens gently and names the claim;
  select fills the inspector with the relationship record: direction, type, strength,
  confidence, provenance, first seen, persistence, transitions, predictions.
- **Animation:** the trace — a path draws itself cause→effect exactly once (≤480ms)
  on selection; a changed edge brightens for one beat in change contexts. No marching
  dashes, no particles, ever.
- **States:** rest / hovered / in-path (bright, labeled) / dimmed / changed
  (strengthened teal beat, weakened red beat) / aged-out (ghost, memory contexts only).
- **Example:** AI Capex ◆ ——▶ `DRIVES` ——▶ Power Infrastructure, solid, filled head.

## 3.9 Evidence

- **Purpose:** the ground truth beneath every claim — the stories, filings, and
  observations that make an edge or theme assertable.
- **Hierarchy:** inspector-tier; evidence never renders on the canvas itself (counts
  are the canvas's only trace of it).
- **Shape:** in hovers: a count with quality ("14 observations · 6 sources"). In the
  inspector: a source-attributed list — publisher, age, one-line relevance — in the
  established Argus evidence style.
- **Visual weight:** textual, quiet, dense.
- **Behavior:** evidence counts on edges are honest (theme-scoped counts labeled as
  such until per-edge evidence exists). Zero evidence is stated, never padded.
- **Interaction:** click-through to the underlying story where one exists; the handoff
  leaves the Network (deliberately — reading is a different mode).
- **Animation:** none.
- **States:** fresh / aging / aged-out (struck from active counts, visible in memory).
- **Example:** inspector row: "Reuters · 2h · Data-center power contracts signed at
  premium rates."

## 3.10 Historical Analog

- **Purpose:** the reasoning layer made visible — "when has this happened before, and
  what usually happened next" (M3.4).
- **Hierarchy:** inspector-tier module, plus an optional quiet "resonance" marker on
  subjects that currently have credible analogs.
- **Shape:** an episode row: date range, similarity figure with its decomposition
  ("relationships 84 · trajectory 71 · regime match"), then observed-outcome lines in
  the canonical "N of M episodes" form. Never a bare percentage, never a forecast.
- **Visual weight:** reserved; analogs are context, not signal.
- **Behavior:** **gated by design.** Below the credibility gates the module shows the
  maturity state — the accruing-history line with its progress figure — and shows it
  with the same typographic dignity as real content. No placeholder charts, no greyed
  fake rows.
- **Interaction:** selecting an episode may ghost its historical configuration behind
  the present one (replay integration) for direct visual comparison.
- **Animation:** none beyond the standard module fade-in.
- **States:** insufficient-history / credible / credible-with-outcomes.
- **Example:** "Similar episode · 14–19 Sep · similarity 87 — in 3 of 4 such episodes,
  Utilities activation strengthened within 10 days."

## 3.11 Inspector

- **Purpose:** the reading pane — where the selected thing explains itself in prose,
  records, and history. The Network shows; the inspector tells.
- **Hierarchy:** co-star. Permanent right column, never floating over the canvas,
  never a modal.
- **Shape:** a calm text column with a fixed skeleton — identity header, role, "why it
  matters," upstream/downstream, memory, predictions, evidence — so the eye learns
  where answers live. Three states: market default (dominant thesis, top path, biggest
  changes, one watch condition), entity selected, relationship selected.
- **Visual weight:** typographic; no cards-within-cards, at most hairline dividers.
- **Behavior:** always in lock-step with canvas selection — the canvas is the pointer,
  the inspector is the sentence. Uses canonical shared renderers (one drawer meaning
  system product-wide).
- **Interaction:** entities named in the inspector highlight their canvas objects on
  hover (the reverse pointer); a single handoff opens the full profile.
- **Animation:** content crossfades in ~180ms on selection change; never slides,
  never bounces.
- **States:** default / entity / relationship / loading (skeleton) / gated (maturity
  language for memory-dependent modules).
- **Example:** select the Utilities↗CEG edge → "Utilities exposure expresses through
  Constellation Energy — recorded, strength 0.6, held 41 sessions, prediction ✓."

## 3.12 Legend

- **Purpose:** decode line-style grammar (recorded/derived, confidence) — the only
  visual codes not self-evident.
- **Hierarchy:** the quietest element on the surface.
- **Shape:** one whisper-line of samples in the canvas's lower corner: solid `recorded`,
  dashed `derived`, ▲▼ meanings. No box, no title, no shape chart (shapes are learned
  in a minute; the legend doesn't teach the alphabet).
- **Visual weight:** near-invisible until sought.
- **Behavior:** static; collapsible to a `?` glyph on narrow canvases.
- **Interaction:** hovering a legend item briefly emphasizes matching edges — the
  legend as filter-preview.
- **Animation:** none.
- **States:** expanded / collapsed.

## 3.13 Controls

- **Purpose:** the few analytical verbs: search, zoom, reset, density/confidence
  filter, mode selection (overview / change / replay).
- **Hierarchy:** workstation chrome — present, aligned, never expressive.
- **Shape:** one slim rail on the canvas frame: identity label left ("INTELLIGENCE
  NETWORK · 31 entities · 28 relationships" — the count line doubles as a health
  indicator), controls right. Icon buttons with text only where ambiguity exists.
- **Visual weight:** matches the inspector's chrome exactly; the two must feel like one
  instrument housing.
- **Behavior:** controls apply instantly; no apply buttons, no dialogs on the canvas.
- **Interaction:** search focuses-and-highlights with type-ahead over canonical
  entities; density and confidence are the only filters (both honest — they hide, never
  re-rank); every control state is keyboard-reachable.
- **Animation:** none beyond the camera moves they cause.
- **States:** rest / active-filter (the rail shows a small persistent chip naming any
  active filter — hidden state is never silent).

---

# PART 3A — THE ARGUS FORM LANGUAGE *(V2.1)*

Part 3 defines what each object contains. This part defines what makes all of them
**unmistakably Argus** — the irreducible geometric DNA. Recognizable systems are never
fifty rules; they are a handful of invariants applied without exception (Bloomberg is
amber-on-black plus tabular density; Linear is violet-dark plus typographic calm; Apple
is one radius plus one physics). Argus's invariants are derived from what the product
*is*: conviction, memory, provenance, causality. Each becomes a physical property of
the surface.

## 3A.1 The recognition problem

The no-logo test fails when identity lives in a masthead, a color, or a single hero
element — crop those away and the product vanishes. Identity must live in the **grain**:
any 300×300 crop of the canvas must contain at least two DNA elements. The five
elements below are therefore not decorations placed on objects; they are the material
every object is made of.

## 3A.2 The five elements

**1. The Cut.** Every intelligence plate (narrative, theme) carries exactly one 45°
chamfered corner — always the top-right, always the same angle. One cut, never two,
never rounded. *Meaning:* the plate is open toward its consequences; a thesis is
unfinished business. *Rule:* the Cut appears only on reasoning objects — junctions and
terminals never carry it, which is precisely what makes plates read as "Argus is
thinking here." The Cut is the closest thing Argus has to a wordless logo.

**2. The Rail.** Every measurable object mounts one thin bar on its left spine, filled
to its governing measure — conviction for themes, coherence for narratives, activation
for industries — colored by state, never by identity. *Meaning:* the measure is the
edge the object stands on; it enters from the left like its causes do. *Rule:* one rail
per object, always the same edge, always the same width. Rails are the surface's
peripheral-vision instrument: a room of rails can be read from across a desk.

**3. The Figure.** Each object carries at most one bold tabular numeral — and the
Figures are collectively the *boldest ink on the canvas*, deliberately heavier than any
title. *Meaning:* Argus's decoration budget is spent on its measurements; the numbers
are the jewelry. *Rule:* conviction ink scales with conviction — a 78 is printed
heavier than a 42 (weight, not size) — so certainty is legible as pressure on the page.
This is the **ink discipline**: everything else on the surface gets thinner as it gets
less certain, including edges (confidence = continuity) and derived provenance
(reduced opacity). One glance separates what Argus knows from what Argus suspects,
purely by how hard it pressed.

**4. The Notch.** Institutional memory is rendered as physical tally: small tick marks
accumulate along a plate's bottom edge, one per completed span of sessions (the span is
canonical, from the memory gates — never invented per surface). A young theme is
clean-edged; an established one is visibly *worn in*, like a well-used instrument.
*Meaning:* age as material history, not metadata — the anti-flash. New objects may be
briefly luminous; old objects are notched, settled, and matte. *Rule:* notches are
never simulated. No sealed history, no notch. The gated state ("accruing N of 60")
renders as a single hollow notch — honesty has a glyph.

**5. The Thread.** All relationships are fine threads with one grammar and no
exceptions: direction by arrowhead, strength by width, confidence by continuity
(solid → long dash → short dash), provenance by head (filled = recorded, hollow =
derived) and by ink (derived is always fainter). *Meaning:* claims are stitching, not
plumbing — the intelligence objects are the fabric; threads hold them together
quietly until a chain is pulled. *Rule:* threads never glow, march, or carry
particles; the only bright thread is the one being traced.

## 3A.3 The object identity matrix

Silhouette recognition must survive three altitudes. At **far zoom** the canvas must
still parse by shape alone:

| Class | Silhouette (far) | Standard | Close |
|---|---|---|---|
| Driver — *the Anchor* | solid diamond + leader line, left field | + label | + definition on hover |
| Narrative — *the Masthead* | the one wide double-height cut plate, crown rule above its title | + members · coherence row, Argus-blue border | + lifecycle, dominance state |
| Theme — *the Plate* | cut plate with rail | + title, Figure, delta | + momentum, notches legible |
| Industry — *the Junction* | square plate, edge-tab, **no cut** | + label, direction, ×breadth | + contested split-tab |
| Company — *the Terminal* | small pill (round = nothing flows out) | + mono ticker, direction glyph | + exposure list on hover |
| Evidence — *the Ledger* | never on canvas; counts only | "14 recorded assertions" | attributed rows in inspector |
| Memory — *the Notches* | worn vs clean bottom edges | + first-seen on hover | + sparkline in inspector |
| Prediction — *the Seal* | tiny square docked to a corner | open = active; filled ✓ ✕ – | + statement, horizon, rules |

The geometry itself narrates causality: **diamonds (forces) → cut plates (reasoning) →
squares (junctions) → pills (terminals)**. Angular things cause; rounded things
receive. A reader who has never seen a legend can reconstruct the ontology from shape
alone — that is the standard.

## 3A.4 Still cognition — the market thinking in front of the user

The Network must feel less like a diagram and more like *watching a mind hold a
position*. This is achieved without motion, through three standing behaviors:

1. **The train of thought.** The dominant chain carries its quiet standing emphasis at
   rest — the surface is always visibly "holding" one line of reasoning from force to
   ticker. A diagram shows everything equally; a mind is always mid-thought.
2. **Thoughts arrive as beats.** Nothing idles, but when intelligence changes — a
   conviction ticks, a prediction seals, an edge strengthens — the change lands as one
   discrete, terminal beat. The rhythm of rare single beats on a still field reads as
   deliberation; continuous animation would read as noise, i.e., not thinking.
3. **The inner voice.** The inspector narrates whatever the canvas is holding, in the
   same breath (shared band, instant lock-step). Surface and voice together are the
   experience of being shown a thought process, not a picture.

Corollary: any feature that makes the surface busier at rest makes it *less*
intelligent-looking. Perceived cognition scales with restraint.

## 3A.5 The no-logo test, operationalized

Any crop, any day, must show at least two of: a Cut, a Rail with its Figure, a notched
edge, a hollow-vs-filled thread head, the Masthead's crown rule. Review procedure:
crop three random 300×300 regions of a production screenshot; if any crop could
plausibly be another product, the surface has drifted. This test joins Part 1A and
Part 8 as a standing visual-review gate.

---

# PART 4 — INTERACTION PHILOSOPHY

The governing rule: **the user is aiming an instrument, not playing with a toy.** Every
interaction has a question behind it; the response answers the question and nothing else.

## 4.1 Hover — "what is this?"

Hover is a glance. Within ~120ms: the object's border clarifies, its causal
neighborhood gains a whisper of emphasis, unrelated objects dim one step (never
vanish), and a tooltip appears beside — never under — the cursor with identity, class,
conviction, delta, and the memory line. **Layout never moves on hover.** Leaving
restores rest instantly. Hover states never stack: one hovered object at a time.

## 4.2 Selection — "tell me about this"

Click locks intent. The causal path traces once; off-path content falls to
near-invisibility; the selected object gains the surface's only bright outline; the
inspector rewrites; on the Feed, the page below follows (the selection *is* the page's
lens). Clicking the field, or Escape, releases everything in a single restoring
transition. Selection is exclusive — one subject at a time, because the inspector tells
one story at a time.

## 4.3 Camera — the user's neck, not a cinematographer

The camera never moves on its own initiative. It eases modestly toward a selection
(fractional recentering — never a violent snap-to-center), honors search focus, and
otherwise belongs entirely to the user. Every camera move is short, eased, and
interruptible: user input during any camera motion cancels it immediately.

## 4.4 Zoom — altitude, not magnification

Zoom is semantic. Far: shapes, clusters, the story's silhouette — micro-labels retire
gracefully rather than shrinking into noise. Standard: the designed reading. Close:
objects reveal their second row of state (momentum labels, breadth details, memory
ticks). Wheel/pinch zooms only with intent (modifier key or captured canvas) — the
Network never hijacks a scrolling page.

## 4.5 Focus modes — one question at a time

Overview (default), Narrative Focus, Entity Focus, Change, Replay, Prediction. Modes
are exclusive, entered deliberately, exited obviously (a persistent mode chip names any
non-default mode — the user must never wonder why the canvas looks different). Each
mode is the same world re-lit, never a different world: positions persist across modes
wherever the subject exists in both.

## 4.6 Search — teleport with dignity

`/` focuses search. Type-ahead over canonical entities (tickers, themes, narratives,
industries, drivers). Selecting a result eases the camera to the entity, highlights it,
and pre-fills hover state — it does not auto-select (the user confirms with Enter or
click; search is navigation, not commitment). No-hit states say so plainly.

## 4.7 Path tracing — the signature gesture

Selecting any object reveals its complete causal chain — every upstream ancestor to the
originating force, every downstream consequence to the terminal tickers — drawn
cause-first in a single sub-half-second reveal with verbs labeled on the lit path. The
trace runs once and holds still. This gesture is the product's thesis in one motion:
*everything on this surface is connected, and Argus knows the direction.*

## 4.8 Historical replay — memory you can scrub

Replay is a mode, entered from the rail, showing **sealed daily reconstructions**
(never intraday — the boundary is labeled on the scrubber itself). Stepping between
days: unchanged structure stays perfectly still; changed objects and edges receive one
change-beat each; departed objects ghost out; arrived ones fade in. A completeness
badge (daily / partial / empty) is always visible, and empty days look deliberately
empty. Replay answers "how did this build?" — it is analysis, never cinema.

## 4.9 Prediction mode — accountability on demand

A toggle, not a page. Prediction badges rise one visual step; subjects without
predictions dim slightly; the inspector aggregates the open ledger ("14 active · 9
confirmed · 2 contradicted · 1 invalidated — resolution rules attached"). Verdict
distribution appears only with its sample size; below credibility gates the mode says
"diagnostics, not an accuracy claim" in designed, first-class language.

## 4.10 Memory mode — the age of knowledge

A toggle that re-lights the canvas by epistemic age: established objects settle
(cooler, solid), young objects carry a faint luminous edge, gated objects show their
accruing state. One glance answers "what here is new information vs long-held
structure?" — arguably the most institutional question a surface can answer.

## 4.11 Transitions

One family: short (≤240ms structural, ≤480ms trace, ~180ms inspector), eased-out,
terminal. Nothing overshoots, bounces, or springs. Transitions communicate *what
changed between two truths* — they are diffs, not choreography.

## 4.12 Keyboard

`/` search · `Esc` release/exit mode · arrows walk the selected object's causal
neighbors (up/down = siblings, left/right = upstream/downstream) · `Enter` opens the
full profile · `[ ]` step replay days · mode keys for power users. Every keyboard path
mirrors a pointer path exactly — no keyboard-only or pointer-only capabilities.

## 4.13 Accessibility

Reduced motion: every transition becomes an instant state change; traces render as
already-lit paths — the product loses nothing but choreography. Color independence:
direction and provenance always co-encoded by glyph and line style. Contrast: all
persistent text meets readable contrast on the field; whisper-tier content has a
high-contrast mode. Focus states are visible for every control. The canvas exposes its
selection and hover state to assistive technology as structured text (the inspector is,
by design, the screen-reader's view of the graph).

---

# PART 4A — THE INTERROGATION MODEL *(V2.2)*

Part 4 defines the mechanics of each interaction. This part defines their *meaning*.
The Intelligence Network is the primary product of Argus, and its product experience is
a single sustained act: **interrogating a standing mind.** The user is not operating a
viewer; they are questioning a system that already holds a position. Every gesture is
therefore designed as a question, and every response is choreographed as reasoning.

## 4A.1 Retrieval versus reasoning

The difference between "displaying data" and "revealing causal structure" is not
content — it is **order, pacing, and grammar of response**:

- *Retrieval* presents everything at once, at equal weight, instantly. It answers
  "what is stored?" It is what dashboards and node graphs do, and it is why they feel
  like furniture.
- *Reasoning* unfolds. Causes render before effects. The justification arrives in the
  same breath as the claim. The response has a beginning (acknowledgment), a middle
  (derivation), and an end (stillness).

**The Answer Order rule (binding):** every response on this surface renders in causal
order — upstream before downstream, claim before elaboration, provenance attached, not
appended. The trace draws driver-first. The inspector's skeleton reads claim → why →
evidence → memory → accountability. Even a tooltip orders identity → state →
provenance. Argus never shows a conclusion whose lineage is more than one gesture away.

## 4A.2 The question grammar

Each gesture maps to exactly one question, with a scripted response. This mapping is
canonical across every surface that adopts the Network's language:

| Gesture | The question it asks | The choreographed answer |
|---|---|---|
| Hover | "What is this?" | instant acknowledgment (<100ms: border clarifies); the neighborhood *attends* (one-step emphasis); tooltip states identity → state → provenance. Nothing moves. |
| Click a node | "Explain this." | the Trace: the object's full causal chain **re-derives itself** on screen, cause-first, verbs labeled, ≤480ms, once — a reasoning replay, not a highlight; the inspector narrates in lock-step |
| Click an edge | "Defend this claim." | the relationship dossier: direction, type, strength, confidence, recorded-or-derived, first seen, persistence, evidence, predictions — the full defense, nothing withheld |
| Re-click / expand | "Go deeper." | one ring of additional upstream causes or downstream consequences joins the held chain; depth is earned gesture by gesture, never dumped |
| Escape / field click | "Return to your own view." | **the Return**: focus releases and the market's own train of thought — the dominant chain's standing emphasis — re-establishes itself. Exiting never leaves a blank stage; the mind resumes what *it* was considering |
| Search | "Bring me to X." | camera eases to the entity, pre-attends it; the user confirms before anything commits — navigation is not commitment |
| Replay | "How did you come to believe this?" | sealed days step past; only what changed beats; the belief is shown *forming* |
| Change mode | "What changed your mind?" | only transitioned objects remain lit, each carrying its delta |
| Prediction mode | "Where could you be wrong — and what's your record?" | Seals rise; the open ledger and its verdicts present themselves, gates and all |

If a proposed interaction cannot be phrased as a question about the market's structure,
it does not belong on this surface.

## 4A.3 The tempo of thought

Reasoning has a recognizable rhythm, and the Network keeps it deliberately asymmetric —
**acknowledgment is instant; elaboration is deliberate; rest is absolute**:

1. *Acknowledgment* (<100ms): the surface registers the question — cursor, border,
   attention shift. The user is never unsure whether they were heard.
2. *Derivation* (≤480ms): the answer stages itself in causal order. This is the ONLY
   phase in which the surface may be in motion, and it always terminates.
3. *Stillness*: the answer holds. No residue, no idle motion, no follow-up flourish.

"Thinking" is expressed exclusively by staged reveal — never by spinners, shimmer, or
busy-waiting on the canvas. A system that fidgets while answering reads as unsure; a
system that stages its answer and then stands still reads as certain. Latency honesty:
when real data is genuinely not yet available, the surface says so in a designed state;
it never performs fake deliberation over content it already has, and never fakes
instant knowledge of content it lacks.

## 4A.4 Trust mechanics

Institutional trust is accumulated through interaction habits, not claimed through copy:

1. **No dead ink.** Every number, edge, badge, and label on the surface answers when
   touched. If it cannot produce its provenance on interrogation, it may not be
   printed. (A surface where some ink is inert teaches users to stop asking.)
2. **Refusals are first-class answers.** Interrogating a gated or unavailable record
   returns the designed honest state — "accruing 12 of 60," "ledger unreachable" —
   with the same typographic dignity as a result. The system never answers with
   silence, and never fills the gap with an estimate.
3. **Every gesture is reversible in one act.** Escape always returns home; the camera
   never strands the user; curiosity is never punished. Fearless interrogation is the
   goal state.
4. **Same question, same answer, everywhere.** The grammar of 4A.2 is identical across
   the Feed, every focus mode, and every future surface that adopts the language.
   Consistency is what turns gestures into instincts, and instincts into trust.
5. **The user may question the mind but never edit it.** Nodes cannot be dragged into
   new arrangements, values cannot be adjusted, structure cannot be rearranged by
   hand. Argus's position is Argus's — users interrogate it, follow it, or reject it,
   but the record of what Argus believed is never user-editable. (This is also why
   spatial memory holds: the map is testimony, not a whiteboard.)

## 4A.5 The signature experience

Four interactions constitute the unmistakable Argus feel — the interactive equivalents
of Part 3A's visual DNA. They are protected: no redesign may remove or dilute them.

1. **The Trace** — click anything, watch its reasoning re-derive cause-first with
   verbs on the lit path. The product's thesis in one gesture.
2. **The Return** — release focus and the surface resumes *its own* train of thought.
   The moment users feel the system "was thinking about something before I arrived,"
   the diagram has become a mind.
3. **The Seal beat** — a prediction resolving is the only sacred motion: one 300ms
   fill to verdict while everything else holds still. Accountability, witnessed.
4. **The Interrogation ladder** — hover → select → expand → inspector → full profile:
   five depths of the same question, each one gesture apart, each answer carrying its
   lineage.

## 4A.6 Interaction anti-patterns

Never: drag-to-rearrange nodes; spring/jiggle on any gesture; context menus of
miscellaneous actions; modal dialogs over the canvas; infinite-canvas wandering (the
stage is bounded and composed); gamified affordances (streaks, badges-as-rewards,
celebratory effects); hover states that reflow layout; multi-selection (the inspector
tells one story at a time); any interaction whose response is instantaneous *and*
total (that is retrieval — stage it or cut it).

---

# PART 4B — THE VOICE & COGNITION MODEL *(V2.3)*

The visual language (3A) defines how Argus looks; the interrogation model (4A) defines
how it responds. This part defines **who is responding** — the permanent personality.
Every sentence, label, refusal, and priority decision anywhere in Argus is written by
this one character, so implementation never again makes voice decisions locally.

## 4B.1 The character

Argus is **the senior strategist who has been at the desk for twenty years**: economical,
precise, unimpressed, and accountable. It has seen enough cycles to be calm, keeps its
own score, and respects the reader too much to entertain them.

| Trait | Meaning | Never becomes |
|---|---|---|
| Calm | states, never exclaims; a crisis gets shorter sentences, not louder ones | detachment, vagueness |
| Exact | numbers over adjectives; names over categories; dates over "recently" | pedantry, jargon walls |
| Accountable | every claim carries its source, its age, and what would falsify it | defensiveness, disclaimers-as-wallpaper |
| Unhurried | leads with what matters; refuses to pad; silence over filler | slowness, withholding |
| Unimpressed | no marketing register, no self-praise, no excitement about its own outputs | cynicism, world-weariness |

Argus is not an assistant (it does not serve), not a chatbot (it does not converse for
rapport), not a professor (it does not lecture), not a salesman (it does not persuade).
It is a colleague whose desk you walk to because their book is marked to market.

## 4B.2 How Argus thinks — the four knowledge states

Every statement Argus makes exists in exactly one epistemic state, and the state is
always legible in both form (3A ink discipline) and language:

1. **Recorded** — traceable to a stored record (ontology field, sealed snapshot,
   evidence row, ledger entry). Spoken plainly, with attribution: *"Utilities exposure
   recorded across 41 sessions."*
2. **Derived** — computed by a named deterministic method from recorded inputs.
   Spoken with its method visible: *"Derived narrative — themes grouped by shared
   recorded drivers."* Derived is a provenance, not an apology.
3. **Gated** — real machinery whose sample is still immature (credibility gates).
   Spoken as progress, never as failure: *"Institutional history accruing: 12 of 60
   required archive days."*
4. **Absent** — genuinely not known or not collected. Spoken as plain absence:
   *"No sealed history for this subject yet."* Absence is data; it is never filled,
   estimated, or decorated.

Vocabulary law (binding, from the model docs): **conviction** is a theme's evidence-
weighted confidence; **coherence** is a narrative's structural overlap and *is not a
confidence*; **recorded/derived** is provenance; **sealed** means an immutable daily
record. These words are never used loosely, and no synonyms are introduced for style.

## 4B.3 How Argus speaks — the register

1. **Declarative, present tense, active voice.** "AI capex is repricing the power
   complex," never "the power complex may be experiencing repricing pressure."
2. **Numbers do the talking.** "Conviction 78, up 6 today" — never "very strong and
   rising." Adjectives of degree (major, significant, massive, key) are banned where a
   figure exists.
3. **Hedging fog is banned.** *May, could, might, potentially, possibly, arguably* are
   never used as insurance. Uncertainty is expressed as a measurement, a named
   condition, or a labeled state (4B.5) — never as mush. The word "risk" is always
   followed by a specific mechanism.
4. **Attribution is part of the sentence.** "Reuters, 2h: data-centre power contracts
   signed at premium rates" — the source is content, not a footnote.
5. **Economy.** Leads are one sentence, two clauses maximum. If a section cannot
   justify its length in information, it shrinks. Argus never writes to fill a panel.
6. **No performance.** No exclamation marks, no emoji, no rhetorical questions, no
   "interestingly," no praise of the user, no praise of itself, no "insights,"
   "AI-powered," "cutting-edge," or any word from a pitch deck.
7. **Third person or no person.** Argus refers to itself as "Argus" and only when the
   subject is its own record ("Argus expected persistence; the relationship held").
   Never "we believe," never "I think," never "our AI."
8. **Falsifiability is politeness.** The highest respect Argus pays the reader is
   telling them what would prove it wrong. Watch conditions and falsifiers are voice,
   not features.

## 4B.4 How Argus prioritizes — the speaking order

When Argus has many things to say, the order is law:

1. **What changed** — deltas, transitions, resolved predictions. To a returning
   professional, change is the only news.
2. **What dominates** — the one dominant thesis and its conviction. Exactly one; a
   surface with two lead stories has none.
3. **Where it lands** — exposure: industries and instruments, with direction.
4. **What would change Argus's mind** — the standing contradiction, the watch
   condition, the falsifier. Always present, always last-but-never-omitted.
5. **Context** — everything else, on demand, one interrogation gesture away (4A).

Discipline rules: hard caps everywhere (one watch condition, ≤3 risks, ≤5
beneficiaries, ≤4 members listed — beyond the cap is a count, not a list); the lead
never buries a resolved prediction (accountability outranks narrative pride); and when
nothing changed, Argus says the market is quiet rather than manufacturing urgency —
**a system that can say "little changed today" is a system whose alerts mean something.**

## 4B.5 How Argus handles uncertainty — the register of doubt

Uncertainty is never one gray wash; it is four distinct, designed statements:

| Kind | The sentence pattern | Example |
|---|---|---|
| Measured | figure + basis | "Conviction 52 — 14 assertions, 2 contradicting." |
| Structural | derived + method | "Derived exposure — inferred from recorded sector links." |
| Immature | gate + progress | "Calibration diagnostic only — 11 of 30 resolved predictions." |
| Absent | plain absence + what would create the data | "No outcome yet; the horizon seals Friday." |

Contradictions ride **with** the thesis, never in an appendix: the standing
contradiction is part of the dominant-thesis block itself, at full typographic
dignity. Prohibited forever: false balance ("some say X, others Y"), fabricated
precision (a decimal place the method cannot support), silent omission of weakening
evidence, and confidence theater (restating one number three ways to seem sure).

## 4B.6 How Argus presents reasoning — the argument form

Every reasoned statement follows one skeleton, which is also the inspector's skeleton
and the Answer Order rule (4A.1) rendered as prose:

**Claim → because → evidence → memory → falsifier.**

*"Power infrastructure is the dominant thesis (conviction 78, up 6) — because AI capex
and grid constraints are transmitting through the same recorded channels. 14 assertions
across 6 sources support it; Argus has tracked it 41 sessions, peak 84. It breaks if
power capex slows or the 10Y holds above 4.6."*

Rules: the "because" is causal, not decorative; evidence is counted and attributed;
memory states tenure honestly (including "first observed today"); the falsifier is
specific enough to check. A reasoned statement without a falsifier is not finished.

## 4B.7 How Argus interacts — the conversational stance

- **Acknowledgment without servility.** Argus never says "How can I help?", "Great
  question!", or "Here's what I found." The answer simply begins.
- **Refusal as professional statement.** Gated and unavailable states are complete
  sentences with a consequence: *"Institutional memory service unreachable — history
  not shown."* State + consequence. No apology, no "Oops," no sad-face empty states.
- **No simulated effort.** Argus never says "thinking…", "crunching the numbers," or
  animates fake deliberation (4A.3). It either answers, stages an answer, or states
  why it cannot.
- **Corrections on the record.** When Argus was wrong, the outcome ledger says so in
  the same calm register: *"Expected persistence; the relationship lapsed after 3
  sessions — contradicted."* Self-assessment uses the same voice as market assessment.
- **The user is a professional.** No onboarding baby-talk, no gamified encouragement,
  no "you're all caught up!" The product assumes competence and earns attention with
  content.

## 4B.8 Rewrite table (the practical law)

| Never ship | Ship |
|---|---|
| "AI-powered insights suggest tech could be poised for gains!" | "Semis conviction 58, up 2 — capex assertions broadened to 3 sources." |
| "Confidence: HIGH" | "Conviction 78 — 14 assertions, 1 contradicting." |
| "Data unavailable 😕" | "No sealed history for this subject yet." |
| "Our AI predicts NVDA will rise" | "Argus expects the Utilities→CEG relationship to persist through Friday's boundary. It has been wrong twice this month." |
| "Loading your personalized market experience…" | (a still skeleton, then the answer) |
| "This may potentially indicate possible weakness" | "Conviction fell 6; two supporting sources aged out." |
| "Trusted by leading institutions" | (nothing — the record speaks or nothing does) |

The test for any string in the product: **read it aloud in a morning meeting of
portfolio managers. If it would embarrass the speaker, it does not ship.**

---

# PART 5 — COMPOSITION

## 5.1 The stage

The Network owns the width of the analytical area, structured as two locked panels of
one instrument: **the canvas (≈ two-thirds) and the inspector (≈ one-third)**, sharing
one frame, one chrome weight, one baseline grid. The canvas is never full-bleed — a
defined frame separates the instrument from the page and makes screenshots
self-contained.

## 5.2 The center

The **dominant narrative occupies the optical center-left** of the canvas (roughly the
left golden-section point, slightly above vertical center). It is deliberately not the
geometric center: the composition must leave leftward room for its causes and rightward
room for its consequence fan — the object sits at the fulcrum of its own story.

## 5.3 The eye's path

Designed reading order: **focal object → left to its drivers → right along the traced
spine to industries and tickers → down-right into the inspector's prose.** The
composition succeeds when a viewer's eye completes this circuit unprompted. Every
compositional decision (mass center-left, fans rightward, inspector right) exists to
close this loop; the graph's last visual gesture points at the story panel, so the
canvas hands the reader to the words.

## 5.4 Whitespace and density placement

Density concentrates in two bands: the narrative/theme constellation (center-left) and
the downstream clusters (right-center). Deliberate space lives: around the focal object
(authority), between downstream clusters (boundary), along the left margin between
driver groups (grouping), and in a breathing channel between canvas content and the
inspector edge. The lower-left region stays quietest — it holds only the legend, so the
composition grounds toward calm.

## 5.5 Balance against the inspector

The inspector must read as the canvas's voice, not a sidebar that happens to be there.
Locks: shared frame and chrome; the inspector's header baseline aligns with the canvas
rail; the focal object's vertical position and the inspector's lead paragraph sit in
the same band, so selection feels like the same object continuing across the boundary.
The inspector never scrolls the page — it scrolls internally past its fixed skeleton.

## 5.6 Ultrawide

Extra width is spent on **space, then satellites, then never on stretching**: cluster
separation grows first (the constellation breathes), then additional Tier 4 satellites
and secondary narratives earn placement, then the inspector may split into two reading
columns (narrative + records). Node sizes and type scale do not grow — an ultrawide
Network is a wider view of the same world, not a zoomed poster. Beyond ~21:9 the canvas
caps its analytical width and centers, gaining margin rather than emptiness.

---

# PART 6 — MOTION LANGUAGE

**Axiom: nothing moves unless information changes.** The complete legal motion set:

| Motion | Trigger | Duration | Character |
|---|---|---|---|
| Selection trace | user selects | ≤480ms, once | the chain draws cause→effect, verbs label the lit path, then stillness |
| Selection settle | selection/lock | ≤240ms | outline appears, off-path recedes, camera eases fractionally |
| Hover clarify | pointer enters | ≤120ms | border sharpens, neighborhood whispers, tooltip fades in |
| Graph update | topology/values changed | ≤240ms | changed objects move/refill; unchanged objects DO NOT MOVE — stability is the message |
| Arrival / departure | entity enters/leaves the model | ≤240ms | fade+settle in; ghost out. Never pop |
| Prediction resolution | ledger verdict lands | one 300ms beat | badge fills to verdict; the surface's most sacred motion — nothing else moves during it |
| Replay step | user steps a day | ≤300ms per step | changed elements beat once; still structure stays put |
| Inspector rewrite | selection changed | ~180ms | crossfade, no slide |
| Loading | data not yet present | skeleton fade | calm placeholder geometry; no spinners on the canvas |

Everything else is still. Explicitly banned forever: breathing, orbiting, marching
dashes, ambient particles, looping pulses, parallax, hover wobble, celebration effects.
Easing: ease-out family everywhere; nothing springs or overshoots. Reduced-motion
collapses every row of this table to an instant state change.

---

# PART 7 — DESIGN PRINCIPLES

1. Story before structure — the dominant narrative organizes the canvas, not the schema.
2. Meaning before decoration — if a pixel asserts nothing, remove it.
3. Color communicates state, never identity.
4. Shape communicates class; size communicates standing.
5. Position communicates causality — upstream left, downstream right, always.
6. Motion communicates change, and only change.
7. Stillness is authority.
8. Hierarchy is opinionated — Argus says what matters most, visibly.
9. Memory communicates credibility — age is visible, on demand, everywhere.
10. Prediction communicates accountability — the ledger is worn on the sleeve.
11. Provenance is visible — recorded and derived may never be confused.
12. Absence is data — sparse days look deliberately sparse, never padded.
13. Honesty over polish — a maturity state is designed with the same care as a result.
14. One bright thing at a time.
15. Light is spent where intelligence concentrates.
16. Nodes beat edges; the selected path beats everything.
17. Every number earns its place; every number is defensible from a record.
18. The instrument never performs — no motion, color, or sound seeks attention.
19. Density through richer objects, never more objects.
20. Space is structure — separation replaces containers.
21. Determinism is a design property — the same truth always looks the same.
22. Spatial memory is sacred — positions persist; users navigate by remembering.
23. The canvas shows, the inspector tells — one meaning system, two voices.
24. Selection is the lens — choosing an object re-focuses the whole product.
25. The camera belongs to the user.
26. Interactions answer questions; anything that doesn't answer a question is removed.
27. Typography is the voice — numerals bold, labels calm, nothing squints.
28. Degrade with dignity — reduced motion, narrow screens, and empty states are
    first-class designs, not fallbacks.
29. Every surface of Argus is a projection of one intelligence — the Network is that
    intelligence made visible, so it may never contradict a sibling surface.
30. When honesty and beauty conflict, honesty wins — and is then made beautiful.

---

# PART 7A — WHAT ARGUS WILL NEVER BECOME

The principles say what Argus is; this section guards what it must never drift into.
Each anti-pattern below is seductive precisely because it is easy to build, easy to
demo, and locally reasonable. Each is rejected because it violates the identity in
Part 0: they organize, retrieve, or display — none of them *understand*.

**Argus will never become another finance dashboard.** A dashboard is a grid of
answers to questions nobody asked in a particular order. It abandons hierarchy (Part
2.1) and story (Principle 1): everything shouts equally, so nothing is understood.
The moment Argus renders as tiles, it has stopped having an opinion.

**Argus will never become another collection of KPI cards.** KPI cards present numbers
stripped of their causes, evidence, and history — the exact three things Argus exists
to attach. A number without provenance violates Principle 17; a card without causality
violates the entire transmission model.

**Argus will never become another stock screener.** Screeners rank instruments by
user-chosen filters — they outsource the reasoning to the user and reduce the market
to a sortable table. Argus's rankings are conclusions with evidence, not filter
outputs; the tradeable instrument is the *end* of a causal chain (Tier 4), never the
organizing unit.

**Argus will never become another AI chatbot.** A chat answer is unversioned,
unaccountable, and forgotten on send. Argus's claims persist, carry conviction, accrue
memory, and get resolved against outcomes on the record (Principle 10). Conversational
access to Argus may exist; conversation as the *product* may not.

**Argus will never become another chat-first interface.** Chat-first inverts the
burden: the user must know what to ask. The Network's entire purpose is to show what
matters *before* any question is formed (the Five Second Test). A blank input box as a
front door is the abdication of the product's one job.

**Argus will never become another generic node graph.** Circles and lines whose
positions mean nothing violate every channel rule in §1.5: position, size, shape,
color, and motion must all carry recorded meaning, or the surface is decoration.

**Argus will never become another force-directed visualization demo.** Physics layouts
are non-deterministic, destroy spatial memory (Principle 22), and animate without
information (Principle 6). The Network's stillness and determinism are load-bearing;
the demo aesthetic is their negation.

**Argus will never become another Bloomberg clone.** Cloning Bloomberg means adopting
density-without-synthesis — the opposite contract (Part 1.3). Argus competes on
understanding, not on terminal parity; feature-matching Bloomberg is a strategy for
becoming a worse Bloomberg.

**Argus will never become another financial social network.** Sentiment, follows, and
engagement mechanics optimize for attention and consensus; Argus optimizes for
evidence and accountability. Popularity is not provenance. The moment engagement
becomes a metric, honesty (Principle 30) acquires a competitor.

**Argus will never become another collection of disconnected widgets.** Every surface
is a projection of one canonical understanding (Principle 29). A widget with its own
private truth reintroduces the split-brain the entire M3/M4 program eliminated;
disconnection is not a layout problem, it is an epistemology failure.

**The permanent gate.** Every feature proposal, from any source, must answer one
question first:

> **"Does this increase institutional understanding?"**

If the answer is no, the feature should not exist — regardless of implementation
quality, visual polish, competitive pressure, or how little it would cost to ship.

---

# PART 8 — THE SCREENSHOT TEST

Any unedited screenshot of the default view must pass all of these, judged cold by
someone who has never seen Argus:

1. **Institutional** — a portfolio manager would leave it on a wall monitor; nothing
   reads as consumer, game, or crypto.
2. **Premium** — typography, spacing, and restraint signal craft; no element looks
   default, library-issued, or unstyled.
3. **Proprietary** — the faceted objects, conviction rails, provenance line grammar,
   and constellation composition are recognizably one designed system. **With the logo
   removed, it is still obviously Argus** — the silhouette of the focal object alone
   should identify it.
4. **Alive** — visibly current (deltas, dates, conviction figures) even though nothing
   is animating; a reader can tell *when* it was taken from content, not chrome.
5. **Intelligent** — a causal story is legible in the still image: someone can narrate
   "this force drives this narrative, which pressures these sectors" from the
   screenshot alone.
6. **Not a dashboard** — no grid of cards, no chart zoo, no KPI tiles.
7. **Not a graph demo** — no uniform circles, no hairball, no physics smell; a
   designer can tell every position was decided.

Operational bar: the screenshot could open a fund's pitch deck or a product keynote
without retouching. If any element must be cropped out to look credible, that element
is a defect. The reaction sought is exactly: **"What platform is that?"**

---

# PART 9 — COMPETITIVE ANALYSIS

**Bloomberg Terminal.** Does well: unmatched information trust; zero decoration; total
keyboard fluency; an aesthetic so consistent it became a brand. Does poorly: no
synthesis, no hierarchy (everything shouts equally), hostile learnability, dated
composition. Borrow: the refusal to entertain; density with a straight face; keyboard
seriousness. Avoid: uniform density with no opinion; leaving the picture entirely to
the user.

**Palantir Gotham.** Does well: makes graphs feel operational, not academic; dark
control-room gravity; investigation flows where the graph is a working object. Does
poorly: meaning-free topology until an analyst works it; ontology as visual noise at
scale; intimidating emptiness at session start. Borrow: graph-as-instrument
seriousness; entity-centric inspection. Avoid: raw-connection displays that outsource
meaning; power-user aesthetics that punish first sessions.

**Neo4j Bloom.** Does well: approachable graph exploration; clean queries-to-picture
flow. Does poorly: everything the Network must never be — bubble nodes, physics
layouts, color-as-category, positions that mean nothing and never repeat. Borrow:
search-first entry into a graph. Avoid: literally the entire visual language; Bloom is
the "generic graph demo" the acceptance criteria name.

**Figma.** Does well: an infinite canvas that always feels controlled; flawless
camera/zoom mechanics; multiplayer presence without noise; chrome that recedes
completely behind content. Does poorly (for our purpose): a blank-page tool with no
opinion about content. Borrow: camera dignity, canvas mechanics, chrome restraint.
Avoid: neutrality — Argus's canvas must arrive opinionated.

**Linear.** Does well: the strongest recent proof that speed + typographic discipline +
motion restraint reads as premium; every transition earns itself; dark UI without
gloom. Does poorly: its language serves lists and forms, not spatial reasoning. Borrow:
motion budget philosophy, type discipline, "quality is pace" ethos. Avoid: nothing —
but note its patterns don't transfer to canvases wholesale.

**Apple.** Does well: material honesty (light, depth, and motion obey one physics);
ruthless subtraction; hardware-grade tolerances in software layout. Does poorly (for
this domain): emotional warmth and marketing gloss would undermine an instrument's
neutrality. Borrow: one-physics discipline — our light, depth, and motion also obey a
single consistent model; tolerance culture (nothing half-aligned). Avoid: gloss,
delight-for-delight's-sake, launch-film aesthetics.

**Bridgewater research visuals.** Does well: charts that argue — a thesis, its
evidence, its history in one figure; long-horizon context as a default; unapologetic
annotation. Does poorly: print-era density and aesthetics; inaccessible to
non-specialists. Borrow: the argumentative figure — every Network view should *argue*
its dominant thesis the way a Bridgewater chart argues its line; memory-as-context by
default. Avoid: wall-of-annotation density on an interactive surface.

**Synthesis:** Argus = Bloomberg's seriousness × Palantir's graph-gravity × Linear's
restraint × Bridgewater's argumentativeness — rendered as a still, opinionated,
provenance-bearing constellation none of them has built.

---

# PART 10 — FUTURE EVOLUTION

The Network's language is the Argus language. Adoption path, per surface:

**Morning Brief.** The brief becomes the Network's opening argument: its lead reuses
the focal object (same silhouette, same conviction rail) as a compact masthead, and
"what changed overnight" reuses the change-beat vocabulary as static change chips. The
brief is the Network narrated — same objects, prose-first.

**Markets.** The transmission map already on the Markets page becomes a true sub-view
of the Network (same grammar, filtered to regime/sector altitude). Leaderboards adopt
theme-object rows: conviction rail, delta arrow, memory ticks — list-shaped Network
objects rather than a second design system.

**Themes.** Every theme page header becomes that theme's Tier 1 object rendered large
— the page *is* Entity Focus mode in long form. History modules reuse the memory
panel; the M3.4 analog module ships in the gated form defined here.

**M&A.** The deal graph migrates from the legacy engine to the Network grammar: deal
event as focal object, acquirer/target as companies, deal-specific relationship verbs
drawn in the same edge grammar with recorded/derived provenance (facts-extracted vs
analysis-inferred maps perfectly onto the existing M&A doctrine).

**Listen.** Conversation intelligence joins as evidence density: episodes are evidence
objects; a theme's "most discussed" state is a memory-adjacent annotation. Listen's
light theme keeps its identity while adopting object silhouettes and state colors.

**Private Markets.** The capital-flow chain is re-expressed as a directed Network
corridor — stages as junction objects, commitments as recorded edges — replacing its
bespoke packet animation with the trace gesture.

**Mobile.** Mobile receives the objects, not the canvas: the focal card, the causal
chain as a swipeable vertical sequence, the inspector as the native reading surface,
change chips as the daily rhythm. The constellation remains a desktop instrument; the
language travels without it.

**Endgame — the spine.** The Network becomes the product's spine: global
search lands on it; every entity mention anywhere in Argus deep-links to Entity Focus;
the daily brief, alerts, and replay are its narrated projections; every future record
type (outcomes, analogs, market context) arrives as a new annotation tier in an
already-learned grammar. Pages stop being destinations and become views of one living
structure. At that point the Intelligence Network is not merely a feature of Argus — it
is the spine every screen is a window onto. *(V2.4: Argus **as a whole** is the market
intelligence operating system; the Network is its canonical interactive visual
intelligence layer/environment and spine — not the operating system itself.)*

---

# DOCUMENT GOVERNANCE

**V2.0 is the first approved Design Bible.** From this version forward:

1. **Versioning.** Minor amendments — new object definitions, clarified rules,
   additional anti-patterns, per-surface adoption notes — are versioned as **V2.x**
   and recorded in an amendment log appended to this section. **Fundamental changes to
   the philosophy (Parts 0–2), the identity statement, the Five Second Test, or the
   anti-pattern list require V3.0** — a deliberate, named successor, never an edit.
2. **Authority.** Engineering implementation documents (ARGUS_INTELLIGENCE_NETWORK_V1,
   the M-series memory specs, and their successors) evolve independently on their own
   cadence — but **the Design Bible remains the authoritative expression of product
   intent.** Implementation documents describe how the intent is honestly built; they
   never redefine the intent.
3. **Conflict rule.** When an implementation conflicts with the Design Bible, the
   conflict must be resolved **explicitly**: either the implementation changes, or
   this document is amended by a versioned decision that names what changed and why.
   Silent drift from the product vision — shipping around the Bible and letting the
   document rot — is the one failure mode this governance exists to prevent.
4. **Review hooks.** The Five Second Test (Part 1A) and the Screenshot Test (Part 8)
   are the standing acceptance gates for every visual change; the anti-pattern gate
   (Part 7A) — *"does this increase institutional understanding?"* — is the standing
   acceptance gate for every feature.

**Amendment log**

| Version | Date | Change |
|---|---|---|
| V2.0 | 2026-07-15 | First approved Design Bible: Parts 0–10 plus Parts 1A (Five Second Test), 7A (anti-patterns), and this governance section. |
| V2.1 | 2026-07-15 | Added Part 3A, The Argus Form Language: the five-element DNA (Cut, Rail, Figure, Notch, Thread), the object identity matrix with far-zoom silhouettes, the ink discipline (conviction = ink weight), the Still Cognition doctrine, and the operationalized no-logo crop test (a standing visual-review gate alongside Parts 1A and 8). |
| V2.2 | 2026-07-15 | Added Part 4A, The Interrogation Model: retrieval-vs-reasoning distinction and the binding Answer Order rule; the canonical question grammar (gesture → question → choreographed answer); the tempo of thought (instant acknowledgment, staged derivation, absolute rest); trust mechanics (no dead ink, refusals as first-class answers, reversibility, cross-surface consistency, question-but-never-edit); the four protected signature interactions (Trace, Return, Seal beat, Interrogation ladder); interaction anti-patterns. |
| V2.3 | 2026-07-15 | Added Part 4B, The Voice & Cognition Model: the character (senior strategist — calm, exact, accountable, unhurried, unimpressed); the four knowledge states (recorded / derived / gated / absent) with vocabulary law; the speaking register (numbers over adjectives, hedging fog banned, attribution in the sentence, falsifiability as politeness); the speaking order (change → dominance → exposure → falsifier → context, with hard caps and the "little changed today" doctrine); the register of doubt (four designed uncertainty patterns; contradictions ride with the thesis); the argument form (claim → because → evidence → memory → falsifier); the conversational stance (no servility, refusal as professional statement, corrections on the record); the rewrite table and the morning-meeting test. Design phases complete — V2.3 closes the pre-implementation design cycle. |
| V2.4 | 2026-07-31 | **Terminology / authority reconciliation (not a philosophy change).** Per the ratified `ARGUS_V2_INSTITUTIONAL_EXPERIENCE_ARCHITECTURE` (Ch.1 U2, Ch.2): **Argus as a whole is the "market intelligence operating system"**; the Intelligence Network is **Argus's canonical interactive visual intelligence layer/environment** — the visible understanding and the spine from which every surface projects, but **not itself "the operating system."** Amended the three places that called the Network *itself* the operating system: Part 0 identity line, the Part 10 title, and the Part 10 "Endgame" heading/closer. **Preserved verbatim and unchanged:** the identity statement ("Argus exists to transform market complexity into institutional understanding"), the Part 0 philosophy, the Five Second Test, the anti-pattern list, and every one of the Network's substantive canonical responsibilities (position=causality, size=tier, motion=change; node/edge grammar; focus modes; inspector; replay-over-sealed-data; the protected Form Language and signature gestures). Only the operating-system *label* is reassigned to the product as a whole. **Governance note:** because the touched wording sits in Part 0, this is filed as a V2.x clarification on the basis that no philosophy, identity statement, test, or anti-pattern changed — only a metaphor's referent; if a Part-0 wording touch is judged to require V3.0 under this document's governance, this reconciliation should be escalated to a named V3.0 rather than treated as silent drift. |

---

*Related canon: ARGUS_INTELLIGENCE_NETWORK_V1.md (M4 engineering spec),
ARGUS_INTELLIGENCE_MODEL_V1.md (ontology and vocabulary),
ARGUS_INSTITUTIONAL_MEMORY_V2.md (memory and honesty doctrine),
ARGUS_PREDICTION_OUTCOME_LEDGER_V1.md (accountability records),
ARGUS_INSTITUTIONAL_REASONING_V1.md (analog credibility gates),
ARGUS_INTELLIGENCE_SURFACES_V1.md (surface ownership).*
