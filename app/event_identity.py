"""
app/event_identity.py — OP2.1: the identity authority
(OP1_IMPLEMENTATION_PLAN §2.0/§OP2.1 as amended per OP2_SPRINT3_DESIGN_REVIEW
C1/C2/C3/C6/C7).

Authority model [C1, C6]:
  - The append-only IDENTITY JOURNAL (the `identity-` stream on the OP3.1a
    ledger substrate) is the permanent source of truth. Every mutation is
    journaled BEFORE it is applied to the in-memory view — the view is,
    definitionally, a replay of the journal.
  - The REGISTRY is a bounded hot materialized view: disposable, rebuilt by
    replay on startup (snapshot + watermark fast path; full replay when the
    snapshot is absent or corrupt). Deleting the snapshot can never destroy
    identity.
  - Identity mutation is SINGLE-WRITER: only the full-feed background cycle
    calls mutating operations; partial/warm runs resolve read-only. All
    mutation serializes through this one class behind one lock. Ingestion may
    fan out; minting never does.

uid contract [C2]: `ev_` + 26-char Crockford ULID (48-bit timestamp ms +
80-bit randomness). Opaque — never parsed for meaning. Permanent once minted;
replay READS mint records and never re-mints, so rebuilt views carry the
originally assigned uids exactly.

Identity is annotated, never rewritten [C3]: merges alias, splits supersede,
retractions mark. No journal record is mutated or deleted; no uid is ever
reassigned. Sprint 3 ships the full record vocabulary (mint / attach / alias /
supersede / retract / evict) with replay support; production flow currently
emits mint / attach / evict only — aliasing and folding activate in Sprint 4.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.observation_ledger import LEDGER_DIR, LedgerStream, shared_stream

log = logging.getLogger(__name__)

from app.storage import REGISTRY_PATH  # PH1 (C5): volume-backed durable root

BASE_DIR = Path(__file__).resolve().parent.parent
SNAPSHOT_PATH = REGISTRY_PATH

SNAPSHOT_VERSION = 1
TTL_DAYS = 14                 # hot-view residency, NEVER identity lifetime
MAX_ENTRIES = 5_000           # hot-view cap; eviction is journaled
MATCH_WINDOW_H = 72
MEMBER_URL_CAP = 64
_ALIAS_HOP_CAP = 10           # corruption armor; writes are single-hop

_J_ENTITY = 0.4               # rule 2: entity + title similarity
_J_TITLE = 0.6                # rule 3: title-only
_J_ORIGIN_ANCHOR = 0.4        # drift guard fallback for entity-less stories

_ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _ulid(ts: datetime) -> str:
    """26-char Crockford ULID: 48-bit unix-ms timestamp + 80-bit randomness.
    Opaque by contract — nothing anywhere may parse meaning out of it."""
    ms = int(ts.timestamp() * 1000) & ((1 << 48) - 1)
    rand = int.from_bytes(os.urandom(10), "big")
    value = (ms << 80) | rand
    chars = []
    for _ in range(26):
        chars.append(_ULID_ALPHABET[value & 0x1F])
        value >>= 5
    return "".join(reversed(chars))


def _words(title: str) -> set[str]:
    return {w for w in "".join(c.lower() if c.isalnum() else " " for c in title or "").split() if w}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


# ── Registry entry (hot-view row; final amended-plan fields) ──────────────────

@dataclass
class RegistryEntry:
    uid:                    str
    status:                 str = "active"   # active | dormant | superseded | retracted
    event_type:             str = ""
    origin_title_words:     set[str] = field(default_factory=set)   # frozen at mint
    origin_anchor_entities: set[str] = field(default_factory=set)   # frozen at mint
    latest_title_words:     set[str] = field(default_factory=set)   # updates on attach
    natural_keys:           list[str] = field(default_factory=list)
    member_urls:            set[str] = field(default_factory=set)   # capped
    first_seen:             str = ""
    last_seen:              str = ""
    cycles_observed:        int = 0
    last_cluster_id:        str = ""
    last_cycle_id:          str = ""
    aliases_in:             list[str] = field(default_factory=list)
    superseded_by:          list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = self.__dict__.copy()
        for k in ("origin_title_words", "origin_anchor_entities", "latest_title_words", "member_urls"):
            d[k] = sorted(d[k])
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "RegistryEntry":
        known = {f for f in cls.__dataclass_fields__}     # tolerate additive fields
        kw = {k: v for k, v in d.items() if k in known}
        for k in ("origin_title_words", "origin_anchor_entities", "latest_title_words", "member_urls"):
            if k in kw:
                kw[k] = set(kw[k])
        return cls(**kw)


@dataclass(frozen=True)
class _Candidate:
    cluster_id:   str
    title_words:  set[str]
    entities:     set[str]
    urls:         set[str]
    event_type:   str
    first_seen:   str
    natural_keys: tuple[str, ...]


def _candidate_from_event(event: Any) -> _Candidate:
    urls = {e.url for e in (getattr(event, "evidence", None) or []) if getattr(e, "url", "")}
    return _Candidate(
        cluster_id=getattr(event, "id", "") or "",
        title_words=_words(getattr(event, "title", "") or ""),
        entities=set(getattr(event, "companies_direct", None) or []),
        urls=urls,
        event_type=getattr(event, "event_type", "") or "",
        first_seen=getattr(event, "first_seen", "") or "",
        natural_keys=tuple(getattr(event, "natural_keys", None) or []),
    )


class IdentityAuthority:
    """THE single mutation boundary for event identity [C6]. One instance,
    one lock; mutating entry points check the master flag and the full-feed
    guard. This interface is the future service boundary if ingestion ever
    fans out across workers — minting never does."""

    def __init__(self, journal: LedgerStream | None = None,
                 snapshot_path: Path = SNAPSHOT_PATH) -> None:
        # Sprint 3.1 (Finding 2): the default journal is the process-wide
        # shared identity stream — the same instance ObservationLedger holds —
        # so one seq cache governs the stream. Explicit `journal` injection is
        # for tests (fresh-process simulation).
        self._journal = journal or shared_stream("identity", LEDGER_DIR)
        self._snapshot_path = snapshot_path
        self._lock = threading.RLock()
        self.entries: dict[str, RegistryEntry] = {}
        self.aliases: dict[str, str] = {}          # younger uid -> canonical uid (single hop at write)
        self._nk_index: dict[str, str] = {}        # natural key -> uid
        self._url_index: dict[str, str] = {}       # member url -> uid
        self._watermark: tuple[str, int] = ("", 0) # (day, seq) of last applied journal row
        self._load()

    # ── startup: snapshot fast path, replay as truth [C1] ─────────────────────

    def _load(self) -> None:
        with self._lock:
            snap_ok = False
            try:
                if self._snapshot_path.exists():
                    data = json.loads(self._snapshot_path.read_text(encoding="utf-8"))
                    if isinstance(data, dict) and data.get("v") == SNAPSHOT_VERSION:
                        for d in data.get("entries", []):
                            e = RegistryEntry.from_dict(d)
                            self.entries[e.uid] = e
                        self.aliases = dict(data.get("aliases", {}))
                        wm = data.get("watermark") or {}
                        self._watermark = (str(wm.get("day", "")), int(wm.get("seq", 0)))
                        snap_ok = True
                    else:
                        log.warning("[identity] snapshot unrecognized — full replay")
            except Exception as exc:
                log.warning("[identity] snapshot corrupt (%s) — full replay", exc)

            if not snap_ok:
                self.entries, self.aliases = {}, {}
                self._watermark = ("", 0)

            replayed = self._replay(after=self._watermark if snap_ok else None)
            self._reindex()
            log.info(
                "[identity] hot view ready: %d entries, %d aliases (snapshot=%s, replayed %d journal records, watermark=%s#%d)",
                len(self.entries), len(self.aliases), "hit" if snap_ok else "rebuilt",
                replayed, self._watermark[0] or "-", self._watermark[1],
            )

    def _replay(self, after: tuple[str, int] | None) -> int:
        """Apply journal rows past the watermark (or ALL rows when after is
        None). Replay reads recorded uids — it never mints [C2]."""
        n = 0
        for day, row in self._journal.read_rows():
            seq = int(row.get("seq", 0))
            if after is not None and (day, seq) <= after:
                continue
            self._apply(row)
            self._watermark = (day, seq)
            n += 1
        return n

    def _reindex(self) -> None:
        self._nk_index = {}
        self._url_index = {}
        for e in self.entries.values():
            for nk in e.natural_keys:
                self._nk_index[nk] = e.uid
            for u in e.member_urls:
                self._url_index[u] = e.uid

    # ── the one record-application path (live == replay) ──────────────────────

    def _apply(self, row: dict) -> None:
        kind = row.get("kind")
        try:
            if kind == "mint":
                e = RegistryEntry(
                    uid=row["uid"],
                    event_type=row.get("event_type", ""),
                    origin_title_words=set(row.get("origin_fingerprint", {}).get("title_words", [])),
                    origin_anchor_entities=set(row.get("origin_fingerprint", {}).get("anchor_entities", [])),
                    latest_title_words=set(row.get("origin_fingerprint", {}).get("title_words", [])),
                    natural_keys=list(row.get("natural_keys", [])),
                    member_urls=set(row.get("member_urls", [])[:MEMBER_URL_CAP]),
                    first_seen=row.get("first_seen", "") or row.get("ts", ""),
                    last_seen=row.get("ts", ""),
                    cycles_observed=1,
                    last_cluster_id=row.get("cluster_id", ""),
                    last_cycle_id=row.get("cycle_id", ""),
                )
                self.entries[e.uid] = e
                for nk in e.natural_keys:
                    self._nk_index[nk] = e.uid
                for u in e.member_urls:
                    self._url_index[u] = e.uid
            elif kind == "attach":
                e = self.entries.get(row["uid"])
                if e is None:
                    return
                e.latest_title_words = set(row.get("latest_fingerprint", []) or e.latest_title_words)
                new_urls = row.get("member_urls_added", [])
                for u in new_urls:
                    if len(e.member_urls) >= MEMBER_URL_CAP:
                        break
                    e.member_urls.add(u)
                    self._url_index[u] = e.uid
                for nk in row.get("natural_keys_added", []):
                    if nk not in e.natural_keys:
                        e.natural_keys.append(nk)
                        self._nk_index[nk] = e.uid
                e.last_seen = row.get("last_seen", row.get("ts", "")) or e.last_seen
                if row.get("cycle_id", "") != e.last_cycle_id:
                    e.cycles_observed += 1
                    e.last_cycle_id = row.get("cycle_id", "")
                e.last_cluster_id = row.get("cluster_id", "") or e.last_cluster_id
            elif kind == "alias":
                younger, canonical = row["uid"], row["canonical_uid"]
                # Defensive mirror of _validate_alias for the replay path:
                # journals written through this authority always pass, but a
                # hand-edited or corrupted journal must not poison the view.
                if younger == canonical:
                    log.warning("[identity] replay skipped self-alias record for %s", younger)
                    return
                if younger in self.aliases and self.aliases[younger] != canonical:
                    log.warning("[identity] replay skipped re-alias of %s (%s kept, %s refused) "
                                "— identity is never rewritten",
                                younger, self.aliases[younger], canonical)
                    return
                if self.resolve(canonical) == younger:
                    log.warning("[identity] replay skipped cycle-closing alias %s → %s",
                                younger, canonical)
                    return
                self.aliases[younger] = canonical
                moved = self.entries.pop(younger, None)
                canon = self.entries.get(canonical)
                if canon is not None:
                    if younger not in canon.aliases_in:
                        canon.aliases_in.append(younger)
                    if moved is not None:
                        for u in moved.member_urls:
                            if len(canon.member_urls) < MEMBER_URL_CAP:
                                canon.member_urls.add(u)
                            self._url_index[u] = canonical
                        for nk in moved.natural_keys:
                            if nk not in canon.natural_keys:
                                canon.natural_keys.append(nk)
                            self._nk_index[nk] = canonical
            elif kind == "supersede":
                e = self.entries.get(row["uid"])
                if e is not None:
                    e.status = "superseded"
                    e.superseded_by = list(row.get("superseded_by", []))
            elif kind == "retract":
                e = self.entries.get(row["uid"])
                if e is not None:
                    e.status = "retracted"
            elif kind == "evict":
                e = self.entries.pop(row["uid"], None)
                if e is not None:
                    for nk in e.natural_keys:
                        self._nk_index.pop(nk, None)
                    for u in e.member_urls:
                        self._url_index.pop(u, None)
            # unknown kinds: tolerated (additive schema growth)
        except Exception as exc:
            log.warning("[identity] journal record skipped (kind=%s, %s)", kind, exc)

    def _validate_alias(self, record: dict) -> dict | None:
        """Alias write-path validation (Sprint 3.1, verification Finding 3).

        Rules, enforced BEFORE anything reaches the journal:
          1. canonical_uid is resolved to its terminal uid at write time —
             every stored alias is a single hop [C3];
          2. self-aliases are rejected (uid == resolved canonical — this is
             also the complete cycle guard: writing uid→canonical can only
             create a cycle if canonical's chain terminates at uid, i.e.
             resolve(canonical) == uid, because an un-aliased uid is always
             a chain terminus);
          3. re-aliasing is rejected — an aliased uid's identity is never
             rewritten.
        Returns the normalized record, or None to refuse the write."""
        younger = record.get("uid") or ""
        canonical_raw = record.get("canonical_uid") or ""
        if not younger or not canonical_raw:
            log.warning("[identity] alias refused: missing uid/canonical_uid")
            return None
        canonical = self.resolve(canonical_raw)
        if canonical == younger:
            log.warning("[identity] alias refused: %s → %s would self-alias or "
                        "close a cycle", younger, canonical_raw)
            return None
        if younger in self.aliases:
            log.warning("[identity] alias refused: %s is already aliased to %s — "
                        "identity is never rewritten", younger, self.aliases[younger])
            return None
        return {**record, "canonical_uid": canonical}

    def _journal_apply(self, kind: str, record: dict, *, ts: datetime, cycle_id: str) -> bool:
        """Append-before-apply [C1]: the view mutates only after the journal
        accepted the record. A failed append means no state change."""
        if kind == "alias":
            validated = self._validate_alias(record)
            if validated is None:
                return False
            record = validated
        pos = self._journal.append(kind, record, ts=ts, cycle_id=cycle_id)
        if pos is None:
            log.warning("[identity] journal append failed — %s NOT applied", kind)
            return False
        self._apply({**record, "kind": kind, "ts": ts.isoformat(), "cycle_id": cycle_id,
                     "seq": pos[1]})
        self._watermark = pos
        return True

    # ── alias-safe resolution [C3] ────────────────────────────────────────────

    def resolve(self, uid: str) -> str:
        """Canonical uid for any uid ever exposed. Writes are single-hop by
        contract; the visited-set + hop cap is corruption armor only."""
        seen: set[str] = set()
        cur = uid
        for _ in range(_ALIAS_HOP_CAP):
            if cur in seen:
                log.warning("[identity] alias cycle detected at %s — returning last stable uid", cur)
                return cur
            seen.add(cur)
            nxt = self.aliases.get(cur)
            if nxt is None:
                return cur
            cur = nxt
        return cur

    # ── matching (rules 0-3 + drift guard [C7]) ───────────────────────────────

    def _drift_anchored(self, cand: _Candidate, e: RegistryEntry) -> bool:
        """A candidate may match the LATEST fingerprint, but must remain
        anchored to ORIGIN: shared origin entity, shared member URL, or (for
        entity-less stories) direct origin-title similarity. Chained headline
        drift dies here."""
        if cand.entities & e.origin_anchor_entities:
            return True
        if cand.urls & e.member_urls:
            return True
        return _jaccard(cand.title_words, e.origin_title_words) >= _J_ORIGIN_ANCHOR

    def _match(self, cand: _Candidate, now: datetime) -> tuple[str, str, float] | None:
        """Returns (uid, rule, score) or None. Deterministic: rules in order;
        within a rule, best score then lowest uid."""
        # rule 0 — natural key: exact identity, bypasses everything
        for nk in cand.natural_keys:
            uid = self._nk_index.get(nk)
            if uid is not None:
                return (self.resolve(uid), "natural_key", 1.0)
        # rule 1 — shared member URL: definitionally the same event
        for url in sorted(cand.urls):
            uid = self._url_index.get(url)
            if uid is not None:
                return (self.resolve(uid), "url", 1.0)
        # rules 2-3 — fingerprint matching within the window, drift-guarded
        window_floor = now - timedelta(hours=MATCH_WINDOW_H)
        best: tuple[float, str, str] | None = None   # (score, uid, rule)
        for e in self.entries.values():
            if e.status != "active" or e.event_type != cand.event_type:
                continue
            try:
                if datetime.fromisoformat(e.last_seen) < window_floor:
                    continue
            except Exception:
                continue
            j = max(_jaccard(cand.title_words, e.origin_title_words),
                    _jaccard(cand.title_words, e.latest_title_words))
            rule = None
            if cand.entities & e.origin_anchor_entities and j >= _J_ENTITY:
                rule = "entity_title"
            elif j >= _J_TITLE:
                rule = "title"
            if rule is None or not self._drift_anchored(cand, e):
                continue
            if best is None or j > best[0] or (j == best[0] and e.uid < best[1]):
                best = (j, e.uid, rule)
        if best is not None:
            return (best[1], best[2], best[0])
        return None

    # ── the authority entry point ─────────────────────────────────────────────

    def process_cycle(self, events: list, *, now: datetime, cycle_id: str,
                      full_feed: bool = True) -> dict[str, str]:
        """Resolve identity for one cycle's admitted events. Returns
        {cluster_id: canonical_uid}.

        full_feed=False (partial / Markets-only / warm runs) is READ-ONLY:
        matches resolve, but nothing mints, attaches, evicts, or snapshots
        [C6]. Flag off → no-op (Sprint 2 behavior, the master rollback hatch).
        Candidates are processed in deterministic order and match against
        entries minted earlier in the same cycle — two same-story candidates
        can never both mint."""
        from app.config import settings
        if not getattr(settings, "event_identity", True):
            return {}
        mapping: dict[str, str] = {}
        minted = attached = 0
        with self._lock:
            for ev in sorted(events or [], key=lambda e: getattr(e, "id", "") or ""):
                cand = _candidate_from_event(ev)
                if not cand.cluster_id:
                    continue
                hit = self._match(cand, now)
                if hit is not None:
                    uid, rule, score = hit
                    if full_feed:
                        ok = self._journal_apply("attach", {
                            "uid": uid,
                            "member_urls_added": sorted(cand.urls - self.entries[uid].member_urls)
                            if uid in self.entries else sorted(cand.urls),
                            "natural_keys_added": [nk for nk in cand.natural_keys
                                                   if nk not in self._nk_index],
                            "latest_fingerprint": sorted(cand.title_words),
                            "match_rule": rule,
                            "match_score": round(score, 3),
                            "last_seen": now.isoformat(),
                            "cluster_id": cand.cluster_id,
                        }, ts=now, cycle_id=cycle_id)
                        attached += 1 if ok else 0
                    mapping[cand.cluster_id] = self.resolve(uid)
                else:
                    if not full_feed:
                        continue          # read-only runs never mint
                    uid = "ev_" + _ulid(now)
                    ok = self._journal_apply("mint", {
                        "uid": uid,
                        "event_type": cand.event_type,
                        "origin_fingerprint": {
                            "title_words": sorted(cand.title_words),
                            "anchor_entities": sorted(cand.entities),
                        },
                        "natural_keys": list(cand.natural_keys),
                        "member_urls": sorted(cand.urls)[:MEMBER_URL_CAP],
                        "first_seen": cand.first_seen or now.isoformat(),
                        "cluster_id": cand.cluster_id,
                    }, ts=now, cycle_id=cycle_id)
                    if ok:
                        mapping[cand.cluster_id] = uid
                        minted += 1
            if full_feed:
                self._evict_sweep(now, cycle_id)
                self.snapshot()
                log.info("[identity] cycle %s: %d events → %d minted, %d attached, view=%d entries",
                         cycle_id, len(events or []), minted, attached, len(self.entries))
        return mapping

    # ── hygiene: eviction is journaled and hot-view-only [C1/C5] ─────────────

    def _evict_sweep(self, now: datetime, cycle_id: str) -> None:
        cutoff = now - timedelta(days=TTL_DAYS)
        victims: list[str] = []
        for e in self.entries.values():
            try:
                if datetime.fromisoformat(e.last_seen) < cutoff:
                    victims.append(e.uid)
            except Exception:
                continue
        if len(self.entries) - len(victims) > MAX_ENTRIES:
            by_age = sorted(
                (e for e in self.entries.values() if e.uid not in set(victims)),
                key=lambda e: e.last_seen,
            )
            victims.extend(e.uid for e in by_age[: len(self.entries) - len(victims) - MAX_ENTRIES])
        for uid in victims:
            self._journal_apply("evict", {"uid": uid, "reason": "ttl"}, ts=now, cycle_id=cycle_id)

    # ── snapshot (cache, not truth) ───────────────────────────────────────────

    def snapshot(self) -> None:
        try:
            data = {
                "v": SNAPSHOT_VERSION,
                "watermark": {"day": self._watermark[0], "seq": self._watermark[1]},
                "entries": [e.to_dict() for e in self.entries.values()],
                "aliases": self.aliases,
            }
            self._snapshot_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self._snapshot_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                           encoding="utf-8")
            tmp.replace(self._snapshot_path)
        except Exception as exc:
            log.warning("[identity] snapshot write failed (%s) — journal remains authoritative", exc)


    # ── read-only continuity accessors (OP2.3/OP2.4) ──────────────────────────

    def entry_for(self, uid: str) -> RegistryEntry | None:
        """Read-only hot-view lookup (alias-resolved). Callers must never
        mutate the returned entry — all mutation goes through the journal."""
        return self.entries.get(self.resolve(uid))

    def record_fold_alias(self, younger_uid: str, canonical_uid: str, *,
                          now: datetime, cycle_id: str) -> bool:
        """Journal a fold alias (OP2.4 [C3]): the younger uid becomes a
        permanent alias of the elder canonical. Single-writer discipline: only
        the full-feed background path may call this. Validation (self-alias,
        cycle, re-alias) is enforced by _validate_alias; a refused alias never
        reaches the journal."""
        from app.config import settings
        if not getattr(settings, "event_identity", True):
            return False
        with self._lock:
            return self._journal_apply("alias", {
                "uid": younger_uid, "canonical_uid": canonical_uid,
                "reason": "fold", "match_rule": "registry_fold",
            }, ts=now, cycle_id=cycle_id)


# Module-level singleton, constructed lazily so importing this module never
# performs IO at import time.
_authority: IdentityAuthority | None = None
_authority_lock = threading.Lock()


def get_authority() -> IdentityAuthority:
    global _authority
    with _authority_lock:
        if _authority is None:
            _authority = IdentityAuthority()
        return _authority


# ── Sprint 4 continuity glue (OP2.2 / OP2.3 / OP2.4) ──────────────────────────
# The one place identity meets the event list. Called ONLY from the full-feed
# background cycle (single-writer [C6]); warm/partial runs never reach it.


def _iso_min(a: str, b: str) -> str:
    """Earlier of two ISO timestamps; tolerant of parse failures."""
    try:
        return a if datetime.fromisoformat(a) <= datetime.fromisoformat(b) else b
    except Exception:
        return min(a, b) if a and b else (a or b)


def resolve_and_fold(events: list, *, now: datetime, cycle_id: str) -> list:
    """Resolve identity for one full-feed cycle's admitted events, then apply
    registry-backed continuity:

      OP2.2 — every event carries its canonical (alias-resolved) uid;
      OP2.3 — behind settings.registry_decay: first_seen anchors to the
              registry's lifetime first observation and the event is rescored,
              so decay runs from the TRUE first telling; cycles_observed rides
              along;
      OP2.4 — behind settings.registry_folding: current-cycle events resolving
              to the SAME uid fold into the elder telling (evidence union via
              the existing _merge_into law, rescored) — one institutional
              event, once. Identity matching decided sameness; folding only
              enacts it, so unrelated stories can never fold.

    MarketEvent.id is never touched. Returns the (possibly shorter) list,
    re-ranked by editorial score."""
    from app.config import settings
    if not getattr(settings, "event_identity", True) or not events:
        return events
    from app.events import _merge_into, editorial_score

    auth = get_authority()
    uid_map = auth.process_cycle(events, now=now, cycle_id=cycle_id, full_feed=True)
    for ev in events:
        ev.uid = uid_map.get(ev.id, "")

    # OP2.3 — registry-anchored decay (flagged)
    for ev in events:
        entry = auth.entry_for(ev.uid) if ev.uid else None
        if entry is None:
            continue
        ev.cycles_observed = entry.cycles_observed
        if getattr(settings, "registry_decay", True) and entry.first_seen:
            anchored = _iso_min(ev.first_seen, entry.first_seen)
            if anchored != ev.first_seen:
                ev.first_seen = anchored
                ev.editorial_score = editorial_score(ev, now)

    # OP2.4 — same-uid folding (flagged)
    if getattr(settings, "registry_folding", True):
        by_uid: dict[str, list] = {}
        out: list = []
        for ev in events:
            if ev.uid:
                by_uid.setdefault(ev.uid, []).append(ev)
            else:
                out.append(ev)
        folded = 0
        for uid, group in by_uid.items():
            if len(group) == 1:
                out.append(group[0])
                continue
            # elder telling keeps the file: earliest first observation, then
            # earliest latest-report (shared provenance can tie first_seen),
            # then cluster id as the deterministic last resort
            group.sort(key=lambda e: (e.first_seen, e.last_updated, e.id))
            keeper = group[0]
            for ev in group[1:]:
                # cross-cycle duplicate discovery: a younger event that had
                # already minted its own uid aliases to the canonical [C3]
                if ev.uid and ev.uid != uid:
                    auth.record_fold_alias(ev.uid, uid, now=now, cycle_id=cycle_id)
                _merge_into(keeper, ev)
                folded += 1
            keeper.editorial_score = editorial_score(keeper, now)
            out.append(keeper)
        if folded:
            log.info("[identity] folded %d same-uid sibling event(s) this cycle", folded)
        events = out
        events.sort(key=lambda e: -e.editorial_score)

    return events


def dual_key_explanations(explanations: dict, events: list) -> int:
    """OP2.2 transition: every explanation stays reachable by legacy id AND
    becomes reachable by uid (same dict object — keys only). Returns the
    number of uid keys added."""
    added = 0
    for ev in events or []:
        uid = getattr(ev, "uid", "") or ""
        eid = getattr(ev, "id", "") or ""
        if uid and eid in explanations and uid not in explanations:
            explanations[uid] = explanations[eid]
            added += 1
    return added
