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
from dataclasses import dataclass
from enum import Enum

log = logging.getLogger(__name__)

# ── Policy / calibration version ──────────────────────────────────────────────
# Stable, explicit identifier recorded with every assessment so later stages can
# detect incompatible/stale assessments. The "uncalibrated" suffix is load-
# bearing: this version does NOT represent a calibrated production classifier.
# It must change when the decision logic or its calibration changes.
POLICY_VERSION = "umc-0.1.0-uncalibrated"


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

    # ── Explicitly excluded / missing inputs (recorded, never consumed) ────────
    reasons.append(ReasonCode(
        "confidence", "excluded: uncalibrated theme-conviction proxy (not decision-ready)", False))
    reasons.append(ReasonCode(
        "transmission_chain", "excluded: populated later in explanation construction; unavailable here", False))
    reasons.append(ReasonCode(
        "magnitude", "missing: raw figures untyped; not a Wave-0.1 input", False))

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
    reason_keys = sorted({(r.factor, r.detail, r.available) for a in items for r in a.reasons})
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
