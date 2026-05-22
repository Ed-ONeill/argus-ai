"""
app/causal_chain.py — Lightweight causal reasoning over active market themes.

Walks causal_inputs/causal_outputs from THEME_ONTOLOGY to build directional
narrative chains between active themes. Maximum chain depth: 4 nodes.
Zero LLM calls.
"""

from __future__ import annotations

from app.data.theme_ontology import THEME_ONTOLOGY


def build_causal_narrative(active_theme_ids: list[str]) -> dict[str, str]:
    """
    For each active theme, construct a causal chain narrative string.

    Returns a dict mapping theme_id → narrative string, e.g.:
      "defense-reindustrialization → energy-security → treasury-yield-pressure"

    Only includes themes present in active_theme_ids. Chains are built by
    following causal_outputs forward (depth ≤ 2) and causal_inputs backward
    (depth ≤ 1) from each theme, then merging into the longest coherent path.
    """
    active_set = set(active_theme_ids)
    narratives: dict[str, str] = {}

    for theme_id in active_theme_ids:
        cfg = THEME_ONTOLOGY.get(theme_id)
        if not cfg:
            continue

        # Walk backward: find active upstream inputs (depth 1)
        upstream: list[str] = [
            inp for inp in cfg.get("causal_inputs", [])
            if inp in active_set and inp != theme_id
        ]

        # Walk forward: find active downstream outputs (depth up to 2)
        downstream: list[str] = []
        for out_id in cfg.get("causal_outputs", []):
            if out_id not in active_set or out_id == theme_id:
                continue
            downstream.append(out_id)
            # One more hop
            out_cfg = THEME_ONTOLOGY.get(out_id)
            if out_cfg:
                for out2 in out_cfg.get("causal_outputs", []):
                    if out2 in active_set and out2 != theme_id and out2 not in downstream:
                        downstream.append(out2)

        if not upstream and not downstream:
            continue

        # Build chain: [best upstream] → theme → [downstream chain]
        chain: list[str] = []
        if upstream:
            chain.append(upstream[0])  # take strongest (first listed) upstream
        chain.append(theme_id)
        chain.extend(downstream[:2])   # cap at 2 downstream hops

        # Enforce max 4 nodes
        chain = chain[:4]

        # Convert IDs to institutional names
        def _name(tid: str) -> str:
            entry = THEME_ONTOLOGY.get(tid, {})
            return entry.get("label") or entry.get("name") or tid

        narrative = " → ".join(_name(n) for n in chain)
        if len(chain) >= 2:
            narratives[theme_id] = narrative

    return narratives
