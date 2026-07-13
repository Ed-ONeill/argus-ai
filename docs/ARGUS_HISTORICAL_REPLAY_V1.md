# ARGUS HISTORICAL REPLAY V1 — Daily Reconstruction Contract (M3.2)

What "replay" means in Argus today, exactly what it returns, and what it must never claim.
Implementation: `app/institutional_memory/replay.py`; endpoint:
`GET /api/memory/v2/graph/at?date=YYYY-MM-DD`.

## 1. The contract

`HistoricalIntelligenceState` — the durable record's answer to "what did Argus know on
date D":

| Field | Meaning |
|---|---|
| `as_of_date` | the requested UTC date |
| `reconstruction_kind` | always `"daily_historical_reconstruction"` |
| `sealed_through` | the last sealed UTC date actually used (≤ as_of_date); null when empty |
| `graph_version` | most common `gv1-*` stamp on the newest included sealed day; null for M3.1-era rows; mixed coverage is flagged in notes |
| `entities` | latest sealed `entity_snapshots` row per UID at or before the date (themes + industries) |
| `relationships` | latest sealed `relationship_snapshots` row per rel_uid |
| `narratives` | latest sealed `narrative_snapshots` row per narrative UID |
| `completeness` | `status` ∈ `daily` / `partial` / `empty`, lookback, counts, notes |
| `provenance` | builder, writer/schema versions, generation time |

## 2. Rules (enforced, tested)

1. **Sealed rows only.** A daily row participates only once its UTC day has closed. A request
   for today reconstructs through yesterday and says so in `completeness.notes`.
2. **The future never leaks.** No included record has `snapshot_date` after the requested
   date (test: `test_no_future_record_leaks_into_past`).
3. **Daily precision only.** Each record is the sealed end-of-UTC-day state. Intraday shape
   is not persisted and is never claimed — every response carries the note.
4. **Lookback bound (31 days).** A subject whose latest sealed snapshot is older than the
   lookback is treated as not part of the active state at that date. This is a deliberate
   "active graph" semantic and is reported in `completeness.lookback_days`.
5. **Honest partials.** Dates before M3.2 deployment return `status: "partial"` (theme
   history exists, narrative/relationship history does not). Dates before M3.1 return
   `status: "empty"`. Absence of data is stated, never interpolated.
6. **Future dates are rejected** (HTTP 400).

## 3. What replay is NOT (yet)

- Not the frontend Explorer graph: coverage is the curated backend graph (§16.8 of the
  memory doc).
- Not deep replay: engines are not re-run over archived payloads; this returns stored
  projection inputs. Re-derivation needs the optional raw payload archive (V2 doc §4).
- Not an analog engine, not calibration — explicitly out of scope until their phases.

## 4. Verification queries

```sql
-- what dates can be reconstructed with full M3.2 coverage?
select min(snapshot_date), max(snapshot_date) from narrative_snapshots;

-- reconstruction spot-check for a date D: latest sealed theme rows
select distinct on (entity_uid) entity_uid, snapshot_date, conviction
from entity_snapshots
where snapshot_kind = 'daily_utc' and snapshot_date <= 'D'
order by entity_uid, snapshot_date desc;
```
