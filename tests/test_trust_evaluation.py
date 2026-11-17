"""Synthetic runner controls. These examples are not benchmark truth labels."""
import pytest
from scripts.evaluate_trust import score


def human(labels, **kwargs):
    return dict(id="synthetic", provenance="human", reviewer="test fixture", split="holdout", labels=labels, **kwargs)


def test_unreviewed_is_not_negative_and_missing_is_not_success():
    report = score([human({"themes": None, "transaction": "buyer A"})], [])
    assert "themes" not in report["dimensions"]
    assert report["dimensions"]["transaction"]["exact_rate"] == 0
    assert report["dimensions"]["transaction"]["missing_prediction"] == 1


def test_separates_precision_and_recall():
    r = score([human({"direct_companies": ["A", "B"]})],
              [{"id": "synthetic", "predictions": {"direct_companies": ["A", "C"]}}])
    d = r["dimensions"]["direct_companies"]
    assert d["precision"] == d["recall"] == 0.5


def test_no_model_labels_or_exposed_holdout():
    row = human({"themes": []})
    row["provenance"] = "model"
    with pytest.raises(ValueError, match="human"):
        score([row], [])
    with pytest.raises(ValueError, match="Development"):
        score([human({"themes": []})], [], {"synthetic"})


def test_no_labels_means_no_accuracy_claim():
    assert score([], [])["status"] == "insufficient_human_labels"
