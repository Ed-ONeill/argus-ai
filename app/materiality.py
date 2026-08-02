"""
app/materiality.py — Wave 0.1: the Universal-Materiality classifier contract.

This module owns the *deterministic contract and primitives* for universal
materiality (RD-5 / Chapter 2 §2.6). Wave 0.1 is SKELETON ONLY: it establishes
the assessment structures, the state/mode enums, the policy-version contract,
provenance, the reason/evidence decomposition, the assessor interface, the
fold-aggregation mechanic, and safe configuration semantics — but it MANUFACTURES
NO true/false membership and CHOOSES NO threshold. Every assessment it produces
is `unresolved` (decision-ready membership arrives only with the calibrated
Wave 0.4 logic).

Locked doctrine encoded here (do not weaken without reopening architecture):

  • Universal membership is NOT event admission and NOT `editorial_score`. This
    module never reads ADMISSION_FLOOR and never reuses it as a threshold.
  • Deterministic authority: assessments are pure functions of recorded event
    evidence. No LLM participates. An LLM may later *explain* a decision; it may
    never author one.
  • Decision-input guards (RD-5 / Chapter 6 validation doctrine):
        - MarketEvent.confidence is an UNCALIBRATED theme-conviction proxy →
          NOT a decision input (recorded only as an excluded diagnostic).
        - transmission_chain is populated later, during explanation construction,
          and is unavailable at the assessment point → NOT a Wave-0 decision input.
        - raw numeric figures are untyped → NOT materiality magnitude (not a
          Wave-0.1 input at all).
        - companies / industries are capped/censored arrays → presence only, a
          weak lower bound, never treated as exact breadth.
    Missing evidence stays missing/partial; it is never fabricated.
  • Explainability: every assessment carries a decomposable reason set and a
    recordable policy/calibration version.

Wave 0.1 is additive and dark-launchable. It is consumed by no feed / identity /
memory surface; the assessment lives only as an in-memory attribute and an
isolated, explicitly NON-AUTHORITATIVE shadow log.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from enum import Enum

log = logging.getLogger(__name__)

# ── Policy / calibration version ──────────────────────────────────────────────
# Stable, explicit identifier recorded with every assessment so later stages can
# detect incompatible/stale assessments. The "uncalibrated" suffix is load-
# bearing: this version does NOT represent a calibrated production classifier.
# It must change when the decision logic or its calibration changes.
POLICY_VERSION = "umc-0.1.0-uncalibrated"

# Reason factors derived from typed-figure evidence (Wave 0.2b). aggregate() drops
# these from its reason union so no figure-derived data survives aggregation while
# figure folding is deferred to N3 (aggregate sets figure_evidence=None).
_FIGURE_DERIVED_REASONS = frozenset({"typed_figures"})


class MaterialityState(str, Enum):
    """The tri-state membership lattice. `unresolved` is a first-class third
    state — it is never coerced to `not_universal`."""
    UNIVERSAL = "universal"
    NOT_UNIVERSAL = "not_universal"
    UNRESOLVED = "unresolved"


class MaterialityMode(str, Enum):
    """Configuration modes. Wave 0.1 operates only OFF / SHADOW; ACTIVE is
    reserved for Wave 1 enforcement (see `effective_mode`)."""
    OFF = "off"
    SHADOW = "shadow"
    ACTIVE = "active"


def parse_mode(raw: object) -> MaterialityMode:
    """Fail-safe parse: any unknown/invalid value → OFF."""
    try:
        return MaterialityMode(str(raw).strip().lower())
    except Exception:
        return MaterialityMode.OFF


def effective_mode(raw: object) -> MaterialityMode:
    """Resolve the mode Wave 0.1 will actually operate in.

    Wave 0.1 may operate only as OFF / SHADOW. ACTIVE is reserved for later
    Wave 1 enforcement and must never become usable accidentally now, so it is
    downgraded to a non-authoritative SHADOW (there is no Wave-0.1 consumer that
    could enforce it in any case). Invalid values fail safe to OFF.
    """
    m = parse_mode(raw)
    if m is MaterialityMode.ACTIVE:
        log.warning(
            "[materiality] mode=active is reserved for Wave 1 enforcement; "
            "operating as non-authoritative shadow (Wave 0.1)."
        )
        return MaterialityMode.SHADOW
    return m


# ── Mandatory-consideration classes (Chapter 2 §2.6) ──────────────────────────
# Class membership forces EVALUATION and (later) raises priors; it NEVER confers
# universal membership on its own (RD-5). In Wave 0.1 every candidate is assessed
# regardless of class, so "always evaluated" holds structurally; this flag only
# records that the event belongs to a mandatory-consideration class.
#
# Only the classes that the CURRENT taxonomy proves are recorded here. Chapter 2
# also names geopolitical/conflict, systemic credit/liquidity, broad-market/
# cross-asset moves, and market-structure disruptions — none of which are
# distinct `event_type`s today (they fall into the `market_event` catch-all).
# Wave 0.1 does NOT fabricate detection for them; that coverage gap is recorded
# honestly and left to later evidence work.
_MANDATORY_CONSIDERATION_TYPES = frozenset({"macro", "policy", "earnings", "ma"})


def _is_mandatory_class(event: object) -> bool:
    return str(getattr(event, "event_type", "") or "") in _MANDATORY_CONSIDERATION_TYPES


@dataclass(frozen=True)
class ReasonCode:
    """One decomposable contributing factor — enough, in aggregate, to answer
    'why did Argus put this in everyone's market view?'. `available` records
    whether the factor's evidence was actually present."""
    factor: str
    detail: str
    available: bool


# ── Wave 0.2a evidence: source-kind + censored breadth (deterministic) ─────────
# The canonical evidence-kind vocabulary produced by app.events.evidence_kind().
# Do NOT invent new kinds here.
SOURCE_KINDS = ("sec_filing", "transcript", "ir_release", "news")
# Primary sources per the repo's "management commentary honesty rule"
# (app/events.py:152-154): transcript / sec_filing / ir_release are the ONLY
# first-party (management / regulatory / IR) document kinds; `news` is
# third-party reporting.
PRIMARY_SOURCE_KINDS = frozenset({"sec_filing", "transcript", "ir_release"})

# Canonical caps applied in app.events.build_market_events (companies[:8],
# industries[:6]) — used only to mark censoring honestly, never to claim exactness.
COMPANIES_CAP = 8
INDUSTRIES_CAP = 6


@dataclass(frozen=True)
class SourceEvidence:
    """Higher-fidelity source-quality evidence, derived deterministically from the
    canonical EventEvidence.kind / tier values already on the event.

    For a SINGLE event's assessment the kind counts and `evidence_count` are EXACT
    document counts (each document has exactly one kind, so the four counts sum to
    `evidence_count`) and `counts_are_lower_bounds` is False. For an AGGREGATE of
    several assessments (evidence identities unavailable), the per-kind counts are
    overlap-safe LOWER BOUNDS (aggregated by max), `evidence_count` is at least the
    sum of the disjoint per-kind lower bounds, and `counts_are_lower_bounds` is
    True — the aggregate never presents counts as exact."""
    sec_filing_count: int = 0
    transcript_count: int = 0
    ir_release_count: int = 0
    news_count: int = 0
    has_primary_source: bool = False
    # `has_primary_source_known` distinguishes "complete evidence proves no primary
    # source" (False, known) from "no evidence / incomplete observation" (False,
    # unknown). Never assert absence of a primary source on incomplete information.
    has_primary_source_known: bool = True
    best_tier: int = 4
    best_tier_known: bool = True         # False when the best tier is not globally observed
    qualified_source_count: int = 0      # distinct qualified sources (== event.corroboration_count);
    #                                      on an aggregate this is an OVERLAP-SAFE LOWER BOUND (max),
    #                                      not an exact distinct-source total.
    evidence_count: int = 0              # total evidence documents (>= sum of the disjoint kind counts)
    counts_are_lower_bounds: bool = False  # True unless exactly one complete exact contributor
    observation_complete: bool = True    # False on an aggregate when a contributor's source obs. is missing/incomplete


@dataclass(frozen=True)
class BreadthEvidence:
    """Censored / lower-bound breadth. Counts are honest lower bounds only: the
    canonical arrays are capped and registry-limited, so a value at the cap means
    '>= cap' (possibly more), never an exact population. Diagnostic / weak only —
    asset-class, geography, and cross-*-transmission remain MISSING.

    Theme status is tri-valued via (`unthemed`, `unthemed_known`): all observed and
    all unthemed → (True, True); any observed themed → (False, True); a missing
    observation with no themed contributor → (False, False) = UNKNOWN — never
    asserted unthemed on incomplete information."""
    company_count: int = 0              # lower bound (companies[:8], registry-limited)
    company_capped: bool = False        # reached the cap → possibly more
    industry_count: int = 0             # lower bound (theme-derived industries[:6])
    industry_capped: bool = False
    unthemed: bool = False              # no linked themes → industries are [] by construction
    unthemed_known: bool = True         # False on an aggregate when some contributor's theme status is unobserved


@dataclass(frozen=True)
class MaterialityAssessment:
    """The deterministic assessment record for a candidate/canonical event. It
    records the canonical inputs present on the event it was computed from, so a
    fresh post-identity assessment faithfully reflects whatever identity
    resolution changed. Every field is one of three explicit roles:

      • DECISION INPUT — a valid signal the calibrated 0.4 logic may threshold.
      • DIAGNOSTIC     — recorded evidence/context; NEVER a universal threshold.
      • PROVENANCE     — identity/lineage; not a signal.

    Wave 0.1: `state` is always UNRESOLVED and `materiality_rank` is None (no
    calibrated decision value exists yet)."""
    # ── the decision ──
    state: MaterialityState                          # DECISION (0.1: always UNRESOLVED)
    policy_version: str                              # PROVENANCE (recordable version)
    # ── provenance / lineage ──
    event_id: str                                   # PROVENANCE: surviving cycle-local id (required)
    merged_event_ids: tuple[str, ...] = ()          # PROVENANCE: folded contributor ids
    contributing_ids: tuple[str, ...] = ()          # PROVENANCE: event_id + merged_event_ids (complete)
    event_uid: str | None = None                    # PROVENANCE: durable uid (None pre-identity / when ambiguous)
    contributing_event_uids: tuple[str, ...] = ()   # PROVENANCE: ALL contributor uids (state-independent union)
    universal_event_uids: tuple[str, ...] = ()      # PROVENANCE: uids of UNIVERSAL contributors only (aggregation)
    # ── decision inputs (valid; recorded now, thresholded by 0.4) ──
    event_type: str = ""                            # DECISION INPUT: event-class significance
    corroboration_count: int = 0                    # DECISION INPUT: distinct qualified sources
    best_evidence_tier: int = 4                     # DECISION INPUT: best source tier (quality)
    mandatory_class: bool = False                   # DECISION INPUT: mandatory-consideration class flag
    # `inputs_present` = names of valid decision features whose evidence was
    # AVAILABLE/computable for this event — i.e. the feature could be evaluated —
    # NOT "the feature evaluated true". (mandatory_class is a boolean that is
    # always computable, so it is always listed when the event carries a class.)
    inputs_present: tuple[str, ...] = ()
    # ── diagnostic inputs (recorded evidence/context; NEVER a universal threshold) ──
    first_seen: str | None = None                   # DIAGNOSTIC: canonical decay/time anchor
    editorial_score: float | None = None            # DIAGNOSTIC ONLY — the ordinary-feed score, never a universal threshold
    source_count: int | None = None                 # DIAGNOSTIC: distinct sources of any tier
    companies_count: int = 0                        # DIAGNOSTIC: censored breadth lower bound (weak; not exact)
    industries_count: int = 0                       # DIAGNOSTIC: censored breadth lower bound (weak; not exact)
    # ── Wave 0.2a typed evidence (higher-fidelity source quality; censored breadth) ──
    source_evidence: SourceEvidence | None = None   # refines the evidence-quality DECISION INPUT
    breadth_evidence: BreadthEvidence | None = None  # DIAGNOSTIC only — censored lower bounds
    # ── Wave 0.2b typed-figure evidence (N2.1: capture-only, title-only) ──
    # DIAGNOSTIC ONLY. Parsed deterministically from recorded headline text; it
    # influences NO decision (state stays UNRESOLVED, never enters inputs_present /
    # materiality_rank / membership) and is aggregate-dropped until N3. `FigureEvidence`
    # is defined later in this module; the string annotation (PEP 563) forward-refs it.
    figure_evidence: FigureEvidence | None = None
    # ── explainability + rollup ──
    reasons: tuple[ReasonCode, ...] = ()            # decomposable "why" evidence
    materiality_rank: float | None = None           # None in 0.1 — no calibrated ordering value
    version_mismatch: bool = False                  # set by aggregate() when versions differ


@dataclass(frozen=True)
class MaterialityShadowResult:
    """The single, explicit, TRANSIENT per-cycle shadow result. It is the only
    place a cycle's materiality assessments live, and it is:

      • transient — built in the pipeline, observed, then discarded;
      • non-pickled — never attached to ProcessedFeed or any MarketEvent, so it
        never enters the disk-cache object graph;
      • non-public — never serialized to /api/feed;
      • non-canonical — never reaches identity registration, explanations,
        institutional memory, or the assessment ledger;
      • non-authoritative — `authoritative` is always False in Wave 0.1.

    `pre_admission` holds the assessments of all post-fold QUALIFIED candidates
    (including those the admission floor drops — cycle-local id provenance only,
    no durable uid). `admitted` holds a FRESH assessment of each FINAL canonical
    admitted event AFTER identity resolution/folding (durable uid when present).
    """
    policy_version: str
    pre_admission: tuple[MaterialityAssessment, ...] = ()
    admitted: tuple[MaterialityAssessment, ...] = ()
    authoritative: bool = False
    # Wave 0.2b N2.2: typed-figure evidence propagates through the shadow pipeline
    # via each assessment's own field — `admitted[*].figure_evidence` (and
    # `pre_admission[*].figure_evidence`). There is intentionally NO top-level
    # figure projection: a single field cannot represent many events without
    # aggregation, which is deferred to N3. DIAGNOSTIC / capture-only throughout.


def assess(event: object, *, policy_version: str = POLICY_VERSION) -> MaterialityAssessment:
    """Assess one canonical/candidate event. Deterministic; pure function of the
    event's recorded evidence. No LLM, no clock, no randomness.

    Wave 0.1 returns UNRESOLVED unconditionally — it decomposes the AVAILABLE
    valid evidence and records which inputs are present, but it neither chooses a
    threshold nor manufactures true/false membership. The excluded/missing inputs
    (confidence, transmission_chain, magnitude) are recorded as non-consumed so
    the guard is auditable, never silently fed into a decision.
    """
    reasons: list[ReasonCode] = []
    present: list[str] = []      # valid decision features whose evidence is AVAILABLE/computable

    # ── Valid decision inputs (recorded now; used by the calibrated 0.4 logic) ─
    # Event-class significance — always available (the event always has a class).
    event_type = str(getattr(event, "event_type", "") or "")
    reasons.append(ReasonCode("event_class", f"class={event_type or '<none>'}", True))
    present.append("event_class")

    # Evidence quality / source tier — available iff the event carries evidence
    # (no evidence → no source-quality signal to compute).
    evidence = list(getattr(event, "evidence", None) or [])
    best_tier = min((int(getattr(e, "tier", 4) or 4) for e in evidence), default=4)
    any_qualified = any(bool(getattr(e, "qualified", False)) for e in evidence)
    reasons.append(ReasonCode(
        "evidence_tier",
        f"best_tier={best_tier} any_qualified={any_qualified}",
        bool(evidence),
    ))
    if evidence:
        present.append("evidence_tier")

    # Corroboration — distinct qualified sources; the count is always computable
    # (0 is a valid observation), so the feature is always available.
    corroboration = int(getattr(event, "corroboration_count", 0) or 0)
    reasons.append(ReasonCode("corroboration", f"qualified_sources={corroboration}", True))
    present.append("corroboration")

    # Mandatory-consideration class flag — always computable from the event class.
    mandatory = _is_mandatory_class(event)
    reasons.append(ReasonCode("mandatory_class", f"mandatory={mandatory}", True))
    present.append("mandatory_class")

    # Source-kind evidence (Wave 0.2a) — deterministic higher-fidelity refinement
    # of the already-valid evidence-quality input, from EventEvidence.kind/tier.
    _kc = {k: 0 for k in SOURCE_KINDS}
    for e in evidence:
        k = str(getattr(e, "kind", "news") or "news")
        _kc[k if k in _kc else "news"] += 1
    has_primary = any(_kc[k] > 0 for k in PRIMARY_SOURCE_KINDS)
    _has_evidence = bool(evidence)
    source_evidence = SourceEvidence(
        sec_filing_count=_kc["sec_filing"], transcript_count=_kc["transcript"],
        ir_release_count=_kc["ir_release"], news_count=_kc["news"],
        has_primary_source=has_primary,
        # single event: we observed its complete recorded evidence set, but the
        # primary/tier facts are only KNOWN if there was any evidence to judge.
        has_primary_source_known=_has_evidence,
        best_tier=best_tier, best_tier_known=_has_evidence,
        qualified_source_count=corroboration, evidence_count=len(evidence),
        counts_are_lower_bounds=False,      # exact document counts for one event
        observation_complete=True,          # complete for the event's recorded evidence set
    )
    reasons.append(ReasonCode(
        "source_kinds",
        f"sec_filing={_kc['sec_filing']} transcript={_kc['transcript']} "
        f"ir_release={_kc['ir_release']} news={_kc['news']} primary={has_primary}",
        bool(evidence),
    ))
    if evidence:
        present.append("source_kinds")     # available evidence-quality refinement

    # Breadth — CENSORED presence only. companies (cap 8) / industries (cap 6)
    # are lower bounds, never exact counts; DIAGNOSTIC / weak, never in
    # inputs_present.
    n_companies = len(getattr(event, "companies", None) or [])
    n_industries = len(getattr(event, "industries", None) or [])
    theme_ids = list(getattr(event, "theme_ids", None) or [])
    breadth_evidence = BreadthEvidence(
        company_count=n_companies, company_capped=(n_companies >= COMPANIES_CAP),
        industry_count=n_industries, industry_capped=(n_industries >= INDUSTRIES_CAP),
        unthemed=(not theme_ids),
    )
    reasons.append(ReasonCode(
        "breadth_censored",
        f"companies>={n_companies}{'(capped)' if n_companies >= COMPANIES_CAP else ''} "
        f"industries>={n_industries}{'(capped)' if n_industries >= INDUSTRIES_CAP else ''} "
        f"unthemed={not theme_ids} (censored lower bound)",
        (n_companies + n_industries) > 0,
    ))

    # Typed-figure evidence (Wave 0.2b N2.1) — DIAGNOSTIC capture only. Parsed
    # deterministically from recorded headline text in a fixed order: the event
    # title first, then each EventEvidence.title in canonical list order; empty
    # titles are skipped. It reads NO LLM-authored / later-built field (why_it_matters,
    # impact, summary, transmission, transmission_chain) and feeds NO decision — it
    # is never added to inputs_present and is not a materiality input.
    _fig_titles = [str(getattr(event, "title", "") or "")]
    _fig_titles += [str(getattr(e, "title", "") or "") for e in evidence]
    figure_evidence = build_figure_evidence([t for t in _fig_titles if t])
    reasons.append(ReasonCode(
        "typed_figures",
        f"distinct money={figure_evidence.distinct_money_values} "
        f"percentage={figure_evidence.distinct_percentage_values} "
        f"basis_points={figure_evidence.distinct_basis_points_values} "
        f"per_share={figure_evidence.distinct_per_share_values} "
        f"complete={figure_evidence.figures_complete} "
        "(diagnostic capture only; not a decision input; no magnitude interpretation)",
        bool(figure_evidence.distinct_figures),
    ))

    # ── Explicitly excluded / missing inputs (recorded, never consumed) ────────
    reasons.append(ReasonCode(
        "confidence", "excluded: uncalibrated theme-conviction proxy (not decision-ready)", False))
    reasons.append(ReasonCode(
        "transmission_chain", "excluded: populated later in explanation construction; unavailable here", False))
    reasons.append(ReasonCode(
        "magnitude",
        "excluded from decision: typed figures may now be captured (see typed_figures) but "
        "remain diagnostic only — no magnitude interpretation or calibration exists yet",
        False))

    # ── Provenance + canonical diagnostic inputs (reflect the FINAL event) ─────
    event_id = str(getattr(event, "id", "") or "")
    merged = tuple(str(m) for m in (getattr(event, "merged_event_ids", None) or []))
    contributing = ((event_id,) if event_id else ()) + merged
    event_uid = (str(getattr(event, "uid", "") or "") or None)
    first_seen = (str(getattr(event, "first_seen", "") or "") or None)
    _score = getattr(event, "editorial_score", None)
    editorial_score = float(_score) if _score is not None else None
    source_count = int(getattr(event, "source_count", 0) or 0)

    return MaterialityAssessment(
        state=MaterialityState.UNRESOLVED,          # Wave 0.1: never true/false
        policy_version=policy_version,
        event_id=event_id,
        merged_event_ids=merged,
        contributing_ids=contributing,             # event_id + merged (complete provenance)
        event_uid=event_uid,
        contributing_event_uids=((event_uid,) if event_uid else ()),
        universal_event_uids=(),
        event_type=event_type,
        corroboration_count=corroboration,
        best_evidence_tier=best_tier,
        mandatory_class=mandatory,
        inputs_present=tuple(present),
        first_seen=first_seen,                      # DIAGNOSTIC canonical decay anchor
        editorial_score=editorial_score,            # DIAGNOSTIC only — never a universal threshold
        source_count=source_count,
        companies_count=n_companies,
        industries_count=n_industries,
        source_evidence=source_evidence,
        breadth_evidence=breadth_evidence,
        figure_evidence=figure_evidence,            # Wave 0.2b N2.1: DIAGNOSTIC capture only
        reasons=tuple(reasons),
        materiality_rank=None,                      # Wave 0.1: no calibrated ordering value
    )


def build_shadow_result(pre_admission, admitted_events, *,
                        policy_version: str = POLICY_VERSION) -> MaterialityShadowResult:
    """Assemble the transient shadow result from the pipeline's two moments.

    `admitted_events` are the FINAL canonical admitted events AFTER identity
    resolution/folding. Each is assessed FRESH here — never a mutation of the
    pre-admission assessment — so the authoritative shadow assessment reflects
    whatever identity resolution changed (re-anchored first_seen / decay,
    recomputed editorial_score, merged same-uid siblings and their evidence,
    corroboration, breadth, provenance) and carries the durable uid when the
    identity authority has attached one. Pure and deterministic."""
    admitted = tuple(assess(e, policy_version=policy_version) for e in (admitted_events or []))
    return MaterialityShadowResult(
        policy_version=policy_version,
        pre_admission=tuple(pre_admission or []),
        admitted=admitted,
        authoritative=False,
    )


def aggregate(assessments) -> MaterialityAssessment | None:
    """Deterministic tri-state fold aggregation for when a fold combines the
    assessments of several contributing events (wired into the fold path in a
    later subphase; provided + fixture-tested here).

    FULLY permutation-invariant AND evidence/provenance preserving. There is NO
    keeper: EVERY retained field is an explicit commutative function of the input
    SET, so ties in any subset of fields cannot change the result. Rules:

      • state — lattice-max: universal > unresolved > not_universal;
      • event_id — lexicographically smallest non-empty id (all ids preserved in
        contributing_ids);
      • event_type — the single value if unanimous, else "mixed" (never silently
        inherit one input's type);
      • first_seen — earliest valid timestamp (canonical temporal semantics);
      • editorial_score — max (DIAGNOSTIC only, never a universal threshold);
      • source_count — max (honest representative; sources may overlap so never sum);
      • corroboration_count — max (exact qualified-source union is unavailable);
      • best_evidence_tier — min tier number (best quality);
      • companies_count / industries_count — max (censored lower bounds, never sum);
      • mandatory_class — logical OR;
      • materiality_rank — max over universal contributors;
      • contributing_ids — sorted de-dup union of every contributor's event_id,
        contributing_ids, and merged_event_ids (nested lineage);
      • merged_event_ids — sorted de-dup union;
      • contributing_event_uids — sorted de-dup union of every contributor's own
        event_uid AND its contributing_event_uids, INDEPENDENT of state (no uid is
        ever lost merely because no contributor is universal);
      • universal_event_uids — union of EVERY contributor's nested
        universal_event_uids (state-independent — prior-universal provenance
        survives a later UNRESOLVED wrapper) PLUS the direct event_uid of
        contributors that are CURRENTLY universal; sorted + de-duplicated;
      • event_uid — the one distinct uid across the COMPLETE contributing_event_uids
        union if exactly one exists, else None (the full set is always preserved
        in contributing_event_uids);
      • reasons — de-dup union keyed by (factor, detail, available), sorted;
      • inputs_present — sorted de-dup union;
      • policy_version — a mismatch is NEVER silently combined: state forced
        UNRESOLVED, flagged, stamped with the smallest version deterministically.
    """
    items = [a for a in assessments if a is not None]
    if not items:
        return None

    versions = sorted({a.policy_version for a in items})
    mismatch = len(versions) > 1

    if any(a.state is MaterialityState.UNIVERSAL for a in items):
        state = MaterialityState.UNIVERSAL
    elif any(a.state is MaterialityState.UNRESOLVED for a in items):
        state = MaterialityState.UNRESOLVED
    else:
        state = MaterialityState.NOT_UNIVERSAL
    if mismatch:
        log.warning(
            "[materiality] policy-version mismatch in aggregation %r → UNRESOLVED "
            "(never silently combining incompatible assessments)", versions)
        state = MaterialityState.UNRESOLVED

    # provenance unions
    contributing_ids = tuple(sorted({
        cid for a in items
        for cid in ((a.event_id,) + tuple(a.contributing_ids) + tuple(a.merged_event_ids))
        if cid
    }))
    merged = tuple(sorted({m for a in items for m in a.merged_event_ids}))
    contributing_uids = tuple(sorted({
        u for a in items
        for u in (((a.event_uid,) if a.event_uid else ()) + tuple(a.contributing_event_uids))
    }))
    # Singular event_uid is derived from the COMPLETE provenance union (direct +
    # nested): exactly one distinct uid → that uid; zero or many → None.
    event_uid = contributing_uids[0] if len(contributing_uids) == 1 else None
    universal = [a for a in items if a.state is MaterialityState.UNIVERSAL]
    # Nested universal provenance is preserved from EVERY contributor regardless
    # of its current state (a prior-universal assessment later wrapped/forced to
    # UNRESOLVED must not lose its universal uids); a contributor's DIRECT uid is
    # added only when that contributor is currently UNIVERSAL.
    universal_uids = tuple(sorted(
        {u for a in items for u in a.universal_event_uids}
        | {a.event_uid for a in items
           if a.state is MaterialityState.UNIVERSAL and a.event_uid}
    ))
    # Figure-derived reasons (typed_figures) are EXCLUDED from the aggregate union:
    # aggregate() intentionally sets figure_evidence=None (N3 owns figure folding),
    # so no figure-derived data may survive indirectly through reasons either. The
    # `magnitude` guard is NOT figure evidence (a static excluded-input marker,
    # available=False) and is preserved.
    reason_keys = sorted({
        (r.factor, r.detail, r.available)
        for a in items for r in a.reasons
        if r.factor not in _FIGURE_DERIVED_REASONS
    })
    reasons = tuple(ReasonCode(f, d, av) for (f, d, av) in reason_keys)
    inputs = tuple(sorted({i for a in items for i in a.inputs_present}))

    # commutative scalar rules (no keeper)
    ids = sorted(i for i in {a.event_id for a in items} if i)
    types = {a.event_type for a in items}
    first_seens = sorted(f for f in {a.first_seen for a in items} if f)
    scores = [a.editorial_score for a in items if a.editorial_score is not None]
    source_counts = [a.source_count for a in items if a.source_count is not None]
    ranks = [a.materiality_rank for a in universal if a.materiality_rank is not None]

    # Wave 0.2a evidence aggregation — deterministic, commutative, and HONEST about
    # overlap: contributor evidence identities are not available here, so kind
    # counts and breadth counts are combined by MAX (a lower-bound representative),
    # NEVER summed; boolean flags by OR; best tier by min; unthemed only when ALL
    # contributors are unthemed.
    _n = len(items)
    ses = [a.source_evidence for a in items if a.source_evidence is not None]
    if not ses:
        source_evidence = None
    else:
        _sec = max(s.sec_filing_count for s in ses)
        _tr = max(s.transcript_count for s in ses)
        _ir = max(s.ir_release_count for s in ses)
        _nw = max(s.news_count for s in ses)
        # Kinds are DISJOINT, so the aggregate total is at least the sum of the
        # per-kind lower bounds (and at least the largest single contributor's
        # total). Never sum contributor totals (documents may overlap).
        _ev = max(max(s.evidence_count for s in ses), _sec + _tr + _ir + _nw)
        _src_present_all = (len(ses) == _n)
        _src_complete_all = _src_present_all and all(s.observation_complete for s in ses)
        _any_primary = any(s.has_primary_source for s in ses)
        # has_primary known iff we found one, or every contributor is completely
        # observed AND each individually knew its primary-source status.
        _primary_known = _any_primary or (
            _src_complete_all and all(s.has_primary_source_known for s in ses))
        # best tier known only if every contributor observed AND each knew it.
        _best_tier_known = _src_present_all and all(s.best_tier_known for s in ses)
        # exact only for exactly one complete, exact contributor.
        _single_exact = (_n == 1 and len(ses) == 1
                         and ses[0].observation_complete
                         and not ses[0].counts_are_lower_bounds)
        source_evidence = SourceEvidence(
            sec_filing_count=_sec, transcript_count=_tr, ir_release_count=_ir, news_count=_nw,
            has_primary_source=_any_primary, has_primary_source_known=_primary_known,
            best_tier=min(s.best_tier for s in ses), best_tier_known=_best_tier_known,
            qualified_source_count=max(s.qualified_source_count for s in ses),
            evidence_count=_ev,
            counts_are_lower_bounds=(not _single_exact),
            observation_complete=_src_complete_all,
        )
    bes = [a.breadth_evidence for a in items if a.breadth_evidence is not None]
    if not bes:
        breadth_evidence = None
    else:
        # A contributor is KNOWN-THEMED only when its own status is known AND
        # themed. Theme status is complete only when every input was observed AND
        # every input's status is known (an UNKNOWN nested aggregate is NOT
        # observed-themed just because its `unthemed` is False).
        _brd_complete = (len(bes) == _n) and all(b.unthemed_known for b in bes)
        _any_known_themed = any(b.unthemed_known and not b.unthemed for b in bes)
        breadth_evidence = BreadthEvidence(
            company_count=max(b.company_count for b in bes),
            company_capped=any(b.company_capped for b in bes),
            industry_count=max(b.industry_count for b in bes),
            industry_capped=any(b.industry_capped for b in bes),
            unthemed=(_brd_complete and all(b.unthemed for b in bes)),
            unthemed_known=(_brd_complete or _any_known_themed),
        )

    return MaterialityAssessment(
        state=state,
        policy_version=versions[0],
        event_id=(ids[0] if ids else ""),
        merged_event_ids=merged,
        contributing_ids=contributing_ids,
        event_uid=event_uid,
        contributing_event_uids=contributing_uids,
        universal_event_uids=universal_uids,
        event_type=(next(iter(types)) if len(types) == 1 else "mixed"),
        corroboration_count=max(a.corroboration_count for a in items),
        best_evidence_tier=min(a.best_evidence_tier for a in items),
        mandatory_class=any(a.mandatory_class for a in items),
        inputs_present=inputs,
        first_seen=(first_seens[0] if first_seens else None),
        editorial_score=(max(scores) if scores else None),
        source_count=(max(source_counts) if source_counts else None),
        companies_count=max(a.companies_count for a in items),
        industries_count=max(a.industries_count for a in items),
        source_evidence=source_evidence,
        breadth_evidence=breadth_evidence,
        # figure_evidence is intentionally NOT folded here — the aggregate leaves it
        # None (its default). N2.1 does no figure aggregation; the exact key union,
        # occurrence-bound folding, completeness propagation, and permutation/nesting
        # guarantees are owned by N3. Dropping it (rather than combining partially) is
        # the documented, non-authoritative behavior until then.
        reasons=reasons,
        materiality_rank=(max(ranks) if ranks else None),
        version_mismatch=mismatch,
    )


def observe(result: MaterialityShadowResult) -> None:
    """Isolated, explicitly NON-AUTHORITATIVE shadow observation channel. Emits a
    single per-cycle summary log line from the transient shadow result and
    touches no feed / identity / memory / API consumer."""
    pre = result.pre_admission
    adm = result.admitted
    if not pre and not adm:
        return
    n_unresolved = sum(1 for a in adm if a.state is MaterialityState.UNRESOLVED)
    n_mandatory = sum(1 for a in adm if a.mandatory_class)
    n_primary = sum(1 for a in adm if a.source_evidence and a.source_evidence.has_primary_source)
    n_comp_capped = sum(1 for a in adm if a.breadth_evidence and a.breadth_evidence.company_capped)
    n_ind_capped = sum(1 for a in adm if a.breadth_evidence and a.breadth_evidence.industry_capped)
    n_unthemed = sum(1 for a in adm if a.breadth_evidence and a.breadth_evidence.unthemed)
    log.info(
        "[materiality:shadow NON-AUTHORITATIVE] policy=%s pre_admission_qualified=%d "
        "admitted=%d admitted_unresolved=%d admitted_mandatory_class=%d "
        "primary_source=%d company_capped=%d industry_capped=%d unthemed=%d",
        result.policy_version, len(pre), len(adm), n_unresolved, n_mandatory,
        n_primary, n_comp_capped, n_ind_capped, n_unthemed,
    )


# ══════════════════════════════════════════════════════════════════════════════
# Wave 0.2b (N1): deterministic typed-figure extraction — PARSER ONLY.
#
# This block is fully SELF-CONTAINED and NOT WIRED into anything: it is not
# referenced by assess(), aggregate(), observe(), MaterialityAssessment, or the
# background pipeline. It exists so N1 can be reviewed and tested in isolation
# before N2 wires it into a fresh assessment (capture-only, diagnostic).
#
# Contract (from the approved Wave 0.2b plan):
#   • Parses ONLY deterministic-recorded headline text (MarketEvent.title /
#     EventEvidence.title). It NEVER parses LLM-authored or built-later fields.
#   • Integer-exact normalization to a canonical minor unit; NO floats anywhere
#     (Decimal in, int out). A value that cannot be represented EXACTLY in the
#     minor unit is EXCLUDED (never rounded) and flags `truncated`.
#   • Exclusion-on-ambiguity: unit-anchored matching ($, %, bps, per-share) plus
#     explicit guards, so tickers / years / quarter+FY labels / filing codes /
#     index labels / tenors / FX-slash forms / retirement-plan codes / bare
#     unit-less numbers never become figures.
#   • Occurrence counts are HONEST: `max_occurrences_per_title` records only
#     provable textual repetition within one title; it does NOT claim distinct
#     semantic facts. Distinct-normalized-value counts are exact; occurrence
#     totals are lower bounds; the raw mention tally is diagnostic and may be
#     duplicate-inflated across overlapping titles.
#   • CAPTURE-ONLY: nothing here participates in any decision, threshold,
#     membership, admission, ranking, serialization, or persistence.
# ══════════════════════════════════════════════════════════════════════════════

# Deterministic caps (fail-closed: excluded/flagged, never rounded, never raised).
MAX_TITLE_SCAN_CHARS = 512            # per-title scan ceiling (headlines are short)
MAX_FIGURE_KEYS = 16                  # cap on distinct normalized figure keys
MAX_SIGNIFICANT_DIGITS = 15           # a numeric token with more digits is excluded
MAX_MONEY_MINOR = 10_000_000_000_000_000   # $100 trillion in integer cents (inclusive)
MAX_PERCENTAGE_BPS = 1_000_000        # 10,000% in integer basis points (inclusive)

FIGURE_KINDS = ("money", "percentage", "basis_points", "per_share")

# A candidate's numeric core is detected PERMISSIVELY (a maximal `[\d.,]` run)
# so a malformed token like "5.00.1" or "12,34" is captured WHOLE and then
# rejected — never silently shrunk to a valid-looking prefix. Matching never uses
# a permissive subpattern that can backtrack to a shorter match.
_NUM_RUN = r"[\d.,]+"
# A well-formed number: grouped (1,200,000) OR plain (500000), optional decimal.
# NO leading/trailing separators — trailing sentence punctuation is handled by
# the money path explicitly, never absorbed here.
_NUM_STRICT = re.compile(r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?")
_ALPHA_RUN = re.compile(r"[A-Za-z]+")

# Scale words GLUED to the digits (no space). A glued alpha run MUST be a
# supported abbreviation, else the whole candidate is rejected (so "$5k",
# "$5x", "$5quadrillion" never fall back to a bare "$5").
_GLUED_SCALE: dict[str, int] = {
    "b": 10**9, "bn": 10**9, "billion": 10**9,
    "m": 10**6, "mn": 10**6, "million": 10**6,
    "t": 10**12, "tn": 10**12, "trillion": 10**12,
}
# Scale words SEPARATED from the digits by whitespace. Only these are honoured;
# a following prose word (e.g. "$5 deal") is not a scale and yields plain $5.
_SPACED_SCALE: dict[str, int] = {
    "billion": 10**9, "bn": 10**9,
    "million": 10**6, "mn": 10**6,
    "trillion": 10**12, "tn": 10**12,
}
# Explicitly UNSUPPORTED magnitude words — a following one of these REJECTS the
# whole candidate (never a silent fall-back to a bare dollar amount).
_UNSUPPORTED_SCALE = frozenset({
    "thousand", "thousands", "hundred", "hundreds", "k", "grand",
    "quadrillion", "quintillion", "sextillion", "septillion", "zillion",
    "gazillion", "bajillion",
})

# Unit anchors. Each detector grabs the PERMISSIVE numeric run bounded by its
# unit; the run is then strictly validated. `%`/bps bound the run on the right,
# so a trailing malformed continuation is caught by strict validation.
_PER_SHARE_RE = re.compile(
    rf"\$\s?({_NUM_RUN})\s*(?:per[\s-]+share|a\s+share|/\s*share)",
    re.IGNORECASE,
)
_MONEY_RE = re.compile(r"\$\s?(\d[\d.,]*)")   # must start with a digit ($AAPL, "$." never match)
_PCT_RE = re.compile(rf"({_NUM_RUN})\s?%")
_BPS_RE = re.compile(rf"({_NUM_RUN})\s?(?:basis\s+points?|bps|bp)\b", re.IGNORECASE)

# Words that, appearing as the FIRST DISCARDED token at the scan boundary, could
# grammatically complete an otherwise-incomplete multi-token figure head left in
# the retained prefix — a bare/`$` amount + a spaced scale ("$5" + "billion"), a
# number + basis-point unit ("50" + "basis points"), or a `$` amount + per-share
# unit ("$1.25" + "per share"). Only then is the retained numeric head dropped; a
# self-contained figure ("$5B", "8%", "25bps") is NEVER removed.
_BOUNDARY_CONTINUATIONS = frozenset({
    # spaced scale words
    "billion", "bn", "million", "mn", "trillion", "tn", "b", "m", "t",
    "thousand", "thousands", "hundred", "hundreds", "k", "grand",
    "quadrillion", "quintillion", "sextillion", "septillion",
    "zillion", "gazillion", "bajillion",
    # basis-point words
    "basis", "point", "points", "bps", "bp",
    # per-share words
    "per", "a", "share", "shares",
})


@dataclass(frozen=True)
class FigureFact:
    """One distinct normalized figure key parsed from recorded headline text.

    `value_minor` is an integer canonical minor unit: USD cents for
    money / per_share, integer basis points for percentage / basis_points.

    `max_occurrences_per_title` is the maximum number of times this exact
    (kind, value_minor, currency) key was parsed in ANY ONE scanned title. It
    records provable textual repetition / co-occurrence ONLY. It does NOT claim
    that those occurrences are distinct semantic facts — headline syntax alone
    cannot establish that (e.g. "worth $5B, nearly $5B" is one fact stated
    twice). Aggregated by max, so cross-title re-reports never inflate it."""
    kind: str                        # one of FIGURE_KINDS
    value_minor: int                 # USD cents (money/per_share) or basis points (percentage/bps)
    currency: str | None             # "USD" for money/per_share; None otherwise
    max_occurrences_per_title: int = 1


@dataclass(frozen=True)
class FigureEvidence:
    """Deterministic typed-figure evidence for a set of recorded headline titles.

    CAPTURE-ONLY / DIAGNOSTIC: never a decision input, never thresholded, never
    a membership signal. Names are chosen so no quantity is mistaken for a
    distinct-semantic-fact count:

      • distinct_<kind>_values      — EXACT count of unique normalized values.
      • <kind>_occurrence_lower_bound — sum of per-key max_occurrences_per_title;
                                        a LOWER BOUND on textual occurrences.
      • mention_count               — raw parsed-occurrence tally across titles;
                                        DIAGNOSTIC, may be duplicate-inflated
                                        across overlapping titles; never exact.
      • max_<kind>_minor            — largest magnitude of a kind; DIAGNOSTIC only.
    """
    distinct_figures: tuple[FigureFact, ...] = ()

    distinct_money_values: int = 0
    money_occurrence_lower_bound: int = 0
    distinct_percentage_values: int = 0
    percentage_occurrence_lower_bound: int = 0
    distinct_basis_points_values: int = 0
    basis_points_occurrence_lower_bound: int = 0
    distinct_per_share_values: int = 0
    per_share_occurrence_lower_bound: int = 0

    has_money: bool = False
    has_percentage: bool = False
    has_basis_points: bool = False
    has_per_share: bool = False

    max_money_minor: int | None = None       # DIAGNOSTIC only — largest money magnitude (cents)
    max_percentage_bps: int | None = None    # DIAGNOSTIC only — largest percentage (bps)

    mention_count: int = 0                    # raw diagnostic tally (lower bound; may double-count)
    truncated: bool = False                   # information was dropped (key/scan cap, precision, bound)
    # figures_complete is the honest completeness contract: the returned figure
    # set losslessly represents every figure in the source. In N1 it is exactly
    # `not truncated` (any dropped candidate ⇒ incomplete). When N3 folds several
    # sources it additionally requires every contributor's figure evidence to be
    # present — so `truncated` and `figures_complete` are never both "clean" over
    # a parse that discarded information.
    figures_complete: bool = True


def _to_minor(num_str: str, kind: str, multiplier: int) -> int | None:
    """Convert a STRICT-VALIDATED numeric string (already `_NUM_STRICT`) plus a
    scale multiplier to an EXACT integer minor unit, or None if it is imprecise,
    over-digit, or out of bounds. No floats (Decimal in, int out)."""
    core = num_str.replace(",", "")
    bare = core.replace(".", "")
    if not bare.isdigit() or len(bare) > MAX_SIGNIFICANT_DIGITS:
        return None
    try:
        dec = Decimal(core)
    except InvalidOperation:
        return None

    if kind in ("money", "per_share"):
        minor = dec * multiplier * 100                           # → cents
    elif kind == "percentage":
        minor = dec * 100                                        # 1% = 100 bps
    else:  # basis_points already in bps
        minor = dec

    if minor != minor.to_integral_value():
        return None                          # not exactly representable → exclude
    minor_int = int(minor)
    if minor_int < 0:
        return None
    if kind in ("money", "per_share"):
        if minor_int > MAX_MONEY_MINOR:
            return None
    elif minor_int > MAX_PERCENTAGE_BPS:
        return None
    return minor_int


def _overlaps(start: int, end: int, spans: list[tuple[int, int]]) -> bool:
    return any(start < e and s < end for (s, e) in spans)


def _signed_before(text: str, start: int) -> bool:
    """True if the character immediately before `start` is a +/- sign (Wave 0.2b
    rejects signed candidates rather than converting them to unsigned)."""
    return start > 0 and text[start - 1] in "+-"


def _left_boundary_ok(text: str, start: int) -> bool:
    """True if a bare number begins at a clean left boundary. A preceding
    alphanumeric / `$` / `.` / `,` means we are inside or glued to a larger
    token (ambiguous) → the caller rejects it. A `+`/`-` is handled separately as
    a signed rejection."""
    if start == 0:
        return True
    p = text[start - 1]
    if p in "+-":
        return True                          # sign handled by _signed_before
    return not (p.isalnum() or p in "$.,")


def _scan_prefix(text: str) -> tuple[str, bool]:
    """Return (scannable_text, over_cap). If the title exceeds the scan cap, cut
    at the last whitespace within the cap so every RETAINED token is whole (a
    token straddling the boundary is never parsed). A retained figure is dropped
    ONLY when the discarded text could grammatically complete it — i.e. the last
    retained token is a numeric head and the first discarded token is a boundary
    continuation ("$5"+"billion", "50"+"basis points", "$1.25"+"per share"). A
    self-contained figure that ends safely before the boundary ("$5B", "8%",
    "25bps") is preserved. over_cap is True whenever the original exceeded the cap
    — the parse is then always incomplete, even if the retained prefix is
    figure-free."""
    if len(text) <= MAX_TITLE_SCAN_CHARS:
        return text, False
    prefix = text[:MAX_TITLE_SCAN_CHARS]
    cut = prefix.rfind(" ")
    if cut == -1:
        return "", True                      # no safe delimiter in the prefix
    tokens = prefix[:cut].split()
    # First discarded token, read from the FULL text so a token straddling the
    # boundary is seen whole (not as a truncated fragment).
    rest = text[cut:].lstrip()
    first_discarded = rest.split(None, 1)[0] if rest else ""
    # Classify by the token's LEADING ALPHABETIC COMPONENT, so a compound
    # continuation still counts: "per-share"→per, "billion-dollar"/"billion2"→
    # billion, "basis-point"→basis. Unrelated words stay unrelated.
    lead = _ALPHA_RUN.search(first_discarded)
    disc_word = lead.group(0).lower() if lead else ""
    # Deterministic boundary-continuation check: only remove the retained tail
    # when discarded text can complete an incomplete multi-token figure head.
    if (tokens
            and disc_word in _BOUNDARY_CONTINUATIONS
            and any(ch.isdigit() for ch in tokens[-1])):
        tokens.pop()
    return " ".join(tokens), True


def _scan_title(text: str) -> tuple[dict[tuple[str, int, str | None], int], bool]:
    """Parse one title into {(kind, value_minor, currency): occurrences_in_title}
    plus a `truncated` flag. truncated is True whenever information was lost or a
    candidate was rejected: scan-cap overflow, a boundary-discarded token, a
    signed candidate, a malformed numeric token, an unsupported scale/unit
    continuation, or a precision/bounds/digit exclusion. Deterministic, pure,
    title-only. Uses permissive candidate detection + strict validation so a
    malformed token is rejected WHOLE, never shrunk to a valid-looking prefix."""
    text, truncated = _scan_prefix(str(text))
    counts: dict[tuple[str, int, str | None], int] = {}
    claimed: list[tuple[int, int]] = []      # per-share/money spans, to avoid double counting

    def _add(kind: str, minor: int | None, currency: str | None) -> bool:
        nonlocal truncated
        if minor is None:
            truncated = True
            return False
        key = (kind, minor, currency)
        counts[key] = counts.get(key, 0) + 1
        return True

    # 1. per-share (highest priority; masks the underlying `$` from money).
    for m in _PER_SHARE_RE.finditer(text):
        claimed.append((m.start(), m.end()))
        if _signed_before(text, m.start()):
            truncated = True
            continue
        raw = m.group(1)
        if not _NUM_STRICT.fullmatch(raw):
            truncated = True
            continue
        _add("per_share", _to_minor(raw, "per_share", 1), "USD")

    # 2. money — permissive `$`+run, then trailing-punctuation / scale analysis.
    for m in _MONEY_RE.finditer(text):
        if _overlaps(m.start(), m.end(), claimed):
            continue
        if _signed_before(text, m.start()):
            truncated = True
            continue
        minor = _money_minor(text, m)
        _add("money", minor, "USD")

    # 3. percentage — `%` bounds the run on the right; strict-validate the run.
    for m in _PCT_RE.finditer(text):
        if _signed_before(text, m.start(1)) or not _left_boundary_ok(text, m.start(1)):
            truncated = True
            continue
        raw = m.group(1)
        if not _NUM_STRICT.fullmatch(raw):
            truncated = True
            continue
        _add("percentage", _to_minor(raw, "percentage", 1), None)

    # 4. basis points — unit bounds the run on the right.
    for m in _BPS_RE.finditer(text):
        if _signed_before(text, m.start(1)) or not _left_boundary_ok(text, m.start(1)):
            truncated = True
            continue
        raw = m.group(1)
        if not _NUM_STRICT.fullmatch(raw):
            truncated = True
            continue
        _add("basis_points", _to_minor(raw, "basis_points", 1), None)

    return counts, truncated


# Characters that close a token/phrase without continuing a number, identifier,
# or unit. A recognized amount (bare or scaled) may be followed by a run of these
# and still be validly terminated.
_CLOSING_PUNCT = frozenset("\"')]}")
# Ordinary sentence/terminal punctuation. Like '.'/',' it terminates a token ONLY
# when what immediately follows is not an alphanumeric/underscore continuation.
_TERMINAL_PUNCT = frozenset(".,;:!?")


def _terminated(text: str, p: int) -> bool:
    """The SINGLE terminator contract, shared by bare amounts and recognized scale
    tokens (money). A token ending at index `p` is validly terminated iff —
    skipping a run of genuine closing punctuation (" ' ) ] }) and ordinary
    terminal punctuation (. , ; : ! ?) — we reach whitespace or end of text.

    Terminal/closing punctuation is a valid terminator ONLY when it actually ends
    the token: a '.'/','/';'/':'/'!'/'?' immediately followed by an alphanumeric
    or underscore is a numeric/identifier continuation and does NOT terminate
    ("$5B.5", "$5,2", "$5;foo", "$5!2"). A letter, digit, or underscore never
    terminates ("$5B2", "$5B_foo"). Closing punctuation must itself resolve to
    whitespace/end ("$5.)" ok, but "$5.)2" rejected because a digit follows ')')."""
    while p < len(text):
        c = text[p]
        if c.isspace():
            return True
        if c in _CLOSING_PUNCT:
            p += 1
            continue
        if c in _TERMINAL_PUNCT:
            nxt = text[p + 1] if p + 1 < len(text) else ""
            if nxt.isalnum() or nxt == "_":
                return False
            p += 1
            continue
        return False                         # letter / digit / underscore / other
    return True


def _money_minor(text: str, m: re.Match) -> int | None:
    """Resolve a `$`+run money candidate to an exact cents value, or None if the
    token is malformed, has a malformed numeric/identifier continuation, or
    carries an unsupported scale/unit. Returning None makes the caller flag
    truncation. All boundary decisions go through the shared `_terminated` rule."""
    raw = m.group(1)
    end = m.end(1)

    # Split at most ONE trailing '.'/',' off the permissive run: it is sentence
    # punctuation re-examined by the shared terminator (so "$5," / "$5." / "$5.)"
    # parse, while "$5,," / "$5." → core "5." fail as malformed). A second trailing
    # separator survives in the core and fails strict validation below.
    if raw and raw[-1] in ".,":
        core = raw[:-1]
        term_start = end - 1                 # re-examine the split punctuation
        has_trailing_punct = True
    else:
        core = raw
        term_start = end
        has_trailing_punct = False
    if not _NUM_STRICT.fullmatch(core):
        return None                          # "12,34", "5.00.1", "5,,", "5."

    multiplier = 1
    p = term_start
    if not has_trailing_punct:
        after = text[end] if end < len(text) else ""
        if after.isalpha():                  # GLUED scale — must be supported
            alpha = _ALPHA_RUN.match(text, end).group(0)
            factor = _GLUED_SCALE.get(alpha.lower())
            if factor is None:
                return None                  # "$5k", "$5x", "$5quadrillion"
            multiplier = factor
            p = end + len(alpha)
        elif after.isspace():                # SPACED word — scale, or prose, or unsupported
            j = end
            while j < len(text) and text[j].isspace():
                j += 1
            wm = _ALPHA_RUN.match(text, j)
            if wm:
                word = wm.group(0).lower()
                if word in _SPACED_SCALE:
                    multiplier = _SPACED_SCALE[word]
                    p = j + len(wm.group(0))
                elif word in _UNSUPPORTED_SCALE:
                    return None              # "$5 thousand", "$5 quadrillion"
                # else: prose word ("$5 deal") → plain dollars; p stays at the space

    if not _terminated(text, p):             # "$5B2", "$5 million2", "$5,B", "$5.)2"
        return None
    return _to_minor(core, "money", multiplier)


def build_figure_evidence(titles: Iterable[str]) -> FigureEvidence:
    """Build FigureEvidence from an ordered iterable of recorded headline titles.

    Pure and deterministic. Per normalized key, `max_occurrences_per_title` is
    the MAX occurrences seen in any single title (cross-title re-reports never
    inflate it). Distinct-value counts are exact; occurrence totals are lower
    bounds; `mention_count` is the raw duplicate-prone tally. This helper is for
    isolated N1 testing; it is NOT called by assess() in N1."""
    per_key_max: dict[tuple[str, int, str | None], int] = {}
    mention_count = 0
    truncated = False

    for title in titles:
        if not title:
            continue
        counts, trunc = _scan_title(str(title))
        truncated = truncated or trunc
        for key, c in counts.items():
            mention_count += c
            if c > per_key_max.get(key, 0):
                per_key_max[key] = c

    # Deterministic LEXICOGRAPHIC ordering by the normalized key
    # (kind, value_minor, currency) — NOT largest-magnitude and NOT
    # first-encountered. When the distinct-key cap trips, the lexicographically
    # smallest MAX_FIGURE_KEYS keys are retained; this ordering is the stable
    # reproducibility contract and must not change silently.
    keys_sorted = sorted(per_key_max, key=lambda k: (k[0], k[1], k[2] or ""))
    if len(keys_sorted) > MAX_FIGURE_KEYS:
        keys_sorted = keys_sorted[:MAX_FIGURE_KEYS]
        truncated = True

    distinct_figures = tuple(
        FigureFact(kind=k[0], value_minor=k[1], currency=k[2],
                   max_occurrences_per_title=per_key_max[k])
        for k in keys_sorted
    )

    def _distinct(kind: str) -> int:
        return sum(1 for f in distinct_figures if f.kind == kind)

    def _occ(kind: str) -> int:
        return sum(f.max_occurrences_per_title for f in distinct_figures if f.kind == kind)

    def _max_minor(kind: str) -> int | None:
        vals = [f.value_minor for f in distinct_figures if f.kind == kind]
        return max(vals) if vals else None

    return FigureEvidence(
        distinct_figures=distinct_figures,
        distinct_money_values=_distinct("money"),
        money_occurrence_lower_bound=_occ("money"),
        distinct_percentage_values=_distinct("percentage"),
        percentage_occurrence_lower_bound=_occ("percentage"),
        distinct_basis_points_values=_distinct("basis_points"),
        basis_points_occurrence_lower_bound=_occ("basis_points"),
        distinct_per_share_values=_distinct("per_share"),
        per_share_occurrence_lower_bound=_occ("per_share"),
        has_money=any(f.kind == "money" for f in distinct_figures),
        has_percentage=any(f.kind == "percentage" for f in distinct_figures),
        has_basis_points=any(f.kind == "basis_points" for f in distinct_figures),
        has_per_share=any(f.kind == "per_share" for f in distinct_figures),
        max_money_minor=_max_minor("money"),
        max_percentage_bps=_max_minor("percentage"),
        mention_count=mention_count,
        truncated=truncated,
        figures_complete=not truncated,      # honest: any dropped candidate ⇒ incomplete
    )
