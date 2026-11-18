"""Offline impact measurement; no network, runtime persistence or truth-label writes."""
import hashlib
import json
import logging
from pathlib import Path
import pickle
import sys
from datetime import datetime
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app import theme_graph as graph  # noqa: E402 -- standalone script bootstrap
from scripts.replay_tm1b1 import obj, run  # noqa: E402


def measure(clusters, now):
    policy = graph.mechanism_supported
    try:
        graph.mechanism_supported = lambda *args: True
        before, _ = run(graph, clusters, now)
        graph.mechanism_supported = policy
        after, _ = run(graph, clusters, now)
    finally:
        graph.mechanism_supported = policy
    rows = []
    for tid, old in before["themes"].items():
        new = after["themes"].get(tid, {})
        old_ids = {r["id"] for r in old["ranked_contributors"]}
        new_ids = {r["id"] for r in new.get("ranked_contributors", [])}
        if old_ids != new_ids:
            rows.append({"theme": tid, "before_contributors": len(old_ids),
                         "after_contributors": len(new_ids), "removed": sorted(old_ids - new_ids),
                         "emitted_before": old["emitted"], "emitted_after": new.get("emitted", False)})
    return {"clusters": len(clusters), "changes": rows,
            "emitted_before": sum(t["emitted"] for t in before["themes"].values()),
            "emitted_after": sum(t["emitted"] for t in after["themes"].values()),
            "events_before": len(before["events"]), "events_after": len(after["events"]),
            "interpretation": "Eligibility changes, not automatically labelled false positives or measured precision."}


def main():
    logging.disable(logging.CRITICAL)
    sources = json.loads((ROOT / "docs/diagnostics/rc3-tm1b/sources.json").read_text(encoding="utf-8-sig"))
    report = {}
    for source in sources:
        if "corpus" not in source:
            continue
        path = Path(source["path"])
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != source["sha256"]:
            raise ValueError("Retained input changed: " + source["corpus"])
        if path.suffix == ".pkl":
            feed = pickle.loads(raw)  # only hash-pinned trusted project caches
            clusters, now = feed.clusters, feed.generated_at
        else:
            feed = json.loads(raw.decode("utf-8-sig"))
            clusters = [SimpleNamespace(**dict(c, primary=obj(c["primary"]),
                        related=[obj(i) for i in c["related"]])) for c in feed["clusters"]]
            now = datetime.fromisoformat(feed["generated_at"])
        report[source["corpus"]] = measure(clusters, now)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
