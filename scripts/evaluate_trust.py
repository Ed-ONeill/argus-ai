"""Score explicit human-reviewed holdout labels, never promote model annotations.

JSONL labels: id, split='holdout', reviewer, provenance='human', labels={dimension: value}.
JSONL predictions: id, predictions={dimension: value}. Null means not adjudicated.
List dimensions use set precision/recall; scalar dimensions use exact match.
This is an evaluation runner, not an annotation or ground-truth generator.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

DIMENSIONS = {
    "event_group", "direct_companies", "contextual_companies", "themes", "sectors",
    "transaction", "claim_support", "chain_grounding", "abstention",
}


def score(labels: list[dict], predictions: list[dict], exposed_ids: set[str] | None = None) -> dict:
    indexed = {p["id"]: p["predictions"] for p in predictions}
    if len(indexed) != len(predictions):
        raise ValueError("Duplicate prediction IDs")
    seen: set[str] = set()
    counts: dict[str, Counter] = {}
    for row in labels:
        if row.get("provenance") != "human" or not str(row.get("reviewer", "")).strip():
            raise ValueError("A human reviewer and provenance are required")
        if row.get("split") != "holdout" or row["id"] in (exposed_ids or set()):
            raise ValueError("Development examples cannot be scored as unseen holdout")
        if row["id"] in seen:
            raise ValueError("Duplicate label IDs")
        seen.add(row["id"])
        pred = indexed.get(row["id"], {})
        for dimension, truth in row["labels"].items():
            if dimension not in DIMENSIONS:
                raise ValueError(f"Unknown dimension: {dimension}")
            if truth is None:
                continue
            c = counts.setdefault(dimension, Counter())
            c["reviewed"] += 1
            if dimension not in pred:
                c["missing_prediction"] += 1
                if isinstance(truth, list):
                    c["false_negative"] += len({json.dumps(x, sort_keys=True) for x in truth})
                continue
            actual = pred[dimension]
            c["predicted"] += 1
            if isinstance(truth, list):
                if not isinstance(actual, list):
                    raise ValueError("List-valued labels require list-valued predictions")
                expected = {json.dumps(x, sort_keys=True) for x in truth}
                observed = {json.dumps(x, sort_keys=True) for x in actual}
                c["true_positive"] += len(expected & observed)
                c["false_positive"] += len(observed - expected)
                c["false_negative"] += len(expected - observed)
                c["exact"] += expected == observed
            else:
                c["exact"] += actual == truth
    report = {}
    for dimension, c in sorted(counts.items()):
        tp, fp, fn = (c[k] for k in ("true_positive", "false_positive", "false_negative"))
        report[dimension] = dict(c, exact_rate=c["exact"] / c["reviewed"],
            precision=tp / (tp + fp) if tp + fp else None,
            recall=tp / (tp + fn) if tp + fn else None)
    return {"holdout_events": len(seen), "dimensions": report,
        "status": "measured" if counts else "insufficient_human_labels"}


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--labels", type=Path, required=True)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--development-candidates", type=Path,
        default=Path("evaluation/argus-trust-v1/candidates.jsonl"))
    args = parser.parse_args()
    exposed = {r.get("id", r.get("candidate_id")) for r in read_jsonl(args.development_candidates)}
    report = score(read_jsonl(args.labels), read_jsonl(args.predictions), exposed)
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "measured" else 2


if __name__ == "__main__":
    raise SystemExit(main())
