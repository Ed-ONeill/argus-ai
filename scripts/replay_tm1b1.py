"""Offline TM1b1 before/after replay. Never fetches or writes runtime state.

Run with --capture-baseline before editing runtime to pin unrelated fixture output.
Retained input paths and hashes come from the TM1b diagnostic source manifest.
"""
import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import inspect
import json
import logging
from pathlib import Path
import pickle
import subprocess
import sys
from types import ModuleType, SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import app.theme_graph as current
from app.clustering import StoryCluster
from app.events import build_market_events
from app.feeds import FeedItem, _extract_entities

BASE_REF = "fe93a34"
FIXTURES = ROOT / "tests/fixtures"
OUT = ROOT / "docs/diagnostics/rc3-tm1b1"


def baseline_module():
    code = subprocess.check_output(["git", "show", f"{BASE_REF}:app/theme_graph.py"], cwd=ROOT).decode("utf-8-sig")
    module = ModuleType("app._tm1b1_baseline")
    sys.modules[module.__name__] = module
    module._source = code
    exec(compile(code, "<tm1b1-baseline>", "exec"), module.__dict__)
    return module


def run(module, clusters, now):
    module._momentum_tracker = module.ThemeMomentumTracker()
    module._momentum_rehydrated = True
    module._persist_momentum_state = lambda now: None
    source = getattr(module, "_source", None) or inspect.getsource(module)
    capture_line = next(i for i, s in enumerate(source.splitlines(), 1) if s.strip() == "gate_fail = []")
    metrics = {}

    def trace(frame, event, arg):
        if frame.f_code is module.extract_themes.__code__ and event == "line" and frame.f_lineno == capture_line:
            v = frame.f_locals
            ranked = sorted(v["contributing"], key=lambda row: row[1], reverse=True)
            metrics[v["theme_id"]] = {
                "ranked_contributors": [{"id": c.id, "rank": i + 1, "weight": w} for i, (c, w) in enumerate(ranked)],
                "confidence_pre_competition": v["confidence"], "evidence_count": v["evidence_count"],
                "story_count": v["n_clusters"], "breadth": v["breadth_raw"],
            }
        return trace

    previous_trace = sys.gettrace()
    try:
        sys.settrace(trace)
        themes = module.extract_themes(clusters, now=now)
    finally:
        sys.settrace(previous_trace)
    for tid, row in metrics.items():
        emitted = next((t for t in themes if t.id == tid), None)
        row.update(emitted=emitted is not None, confidence=emitted.confidence if emitted else None,
                   top_five=emitted.contributing_cluster_ids if emitted else [])
    events = build_market_events(clusters, themes, now=now)
    return {"themes": metrics, "events": {e.id: e.theme_ids for e in events}}, themes


def capture_controls(module):
    now = datetime(2026, 6, 3, 23, 45, tzinfo=timezone.utc)
    records = json.loads((FIXTURES / "theme_spending_controls.json").read_text(encoding="utf-8"))
    unrelated, eligibility = {}, {}
    for r in records:
        clusters = []
        for key, title, snippet, source, hints in [
            ("anchor-1", "$COST reports results", "", "Bloomberg Markets", None),
            ("anchor-2", "$WMT reports results", "", "Financial Times", None),
            (r["id"], r["title"], r["snippet"], "Bloomberg Markets", r.get("entity_hints")),
            ("ai-1", "Nvidia reports results", "", "Bloomberg Markets", None),
            ("ai-2", "Broadcom reports results", "", "Financial Times", None),
            ("defense-1", "Lockheed Martin reports results", "", "Bloomberg Markets", None),
            ("defense-2", "Northrop Grumman reports results", "", "Financial Times", None),
        ]:
            item = FeedItem(title=title, snippet=snippet, url=f"https://fixture.test/{key}", source=source,
                            category="Markets", published_dt=now)
            item.affected_entities = _extract_entities(item) if hints is None else hints
            clusters.append(StoryCluster(key, item, [], 1.0, title, 1))
        _, themes = run(module, clusters, now)
        actual = {t.id: asdict(t) for t in themes}
        eligibility[r["id"]] = r["id"] in actual.pop("consumer-stress")["contributing_cluster_ids"]
        unrelated[r["id"]] = actual
    return unrelated, eligibility


def obj(data):
    data = dict(data)
    if data.get("published_ts"):
        data["published_dt"] = datetime.fromisoformat(data["published_ts"])
    return SimpleNamespace(**data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--capture-baseline", action="store_true")
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)
    baseline = baseline_module()
    before_unrelated, before_controls = capture_controls(baseline)
    if args.capture_baseline:
        (FIXTURES / "theme_spending_unrelated_baseline.json").write_text(json.dumps(before_unrelated, indent=2) + "\n", encoding="utf-8")
    after_unrelated, after_controls = capture_controls(current)
    assert before_unrelated == after_unrelated, "Unrelated focused theme payload changed"
    report = {"baseline_ref": BASE_REF, "controls_before": before_controls, "controls_after": after_controls,
              "unrelated_focused_payloads_equal": True, "corpora": {}}
    sources = json.loads((ROOT / "docs/diagnostics/rc3-tm1b/sources.json").read_text(encoding="utf-8-sig"))
    for entry in sources:
        if "corpus" not in entry:
            continue
        path = Path(entry["path"])
        raw = path.read_bytes()
        assert hashlib.sha256(raw).hexdigest() == entry["sha256"], f"Retained source changed: {path}"
        if path.suffix == ".pkl":
            feed = pickle.loads(raw)  # trusted, hash-pinned project cache only
            clusters, now = feed.clusters, feed.generated_at
        else:
            feed = json.loads(raw.decode("utf-8-sig"))
            clusters = [SimpleNamespace(**dict(c, primary=obj(c["primary"]), related=[obj(i) for i in c["related"]])) for c in feed["clusters"]]
            now = datetime.fromisoformat(feed["generated_at"])
        before, _ = run(baseline, clusters, now)
        after, _ = run(current, clusters, now)
        changed = [tid for tid in before["themes"].keys() | after["themes"].keys() if before["themes"].get(tid) != after["themes"].get(tid)]
        event_changes = {eid: {"before": before["events"].get(eid), "after": after["events"].get(eid)}
                         for eid in before["events"].keys() | after["events"].keys()
                         if before["events"].get(eid) != after["events"].get(eid)}
        report["corpora"][entry["corpus"]] = {"input_sha256": entry["sha256"], "cluster_count": len(clusters),
            "generated_at": now.isoformat(), "changed_themes": changed,
            "consumer_stress_before": before["themes"].get("consumer-stress"),
            "consumer_stress_after": after["themes"].get("consumer-stress"),
            "event_theme_changes": event_changes, "event_count_before": len(before["events"]), "event_count_after": len(after["events"])}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "replay.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
