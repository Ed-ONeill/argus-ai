"""Offline RC3-TM1 diagnostics over retained observation JSONL.

No fetch, clustering mutation, scoring mutation, or persistence writes. This
reports match mechanisms, not human-judged theme precision. Run from repo root:
python scripts/audit_theme_matches.py --input data/ledger/observations-2026-07-25.jsonl
"""
from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.companies import COMPANY_REGISTRY, resolve_companies
from app.data.theme_ontology import THEME_CATALOG
from app.feeds import FeedItem, _extract_entities
from app.theme_graph import _norm, _PUNCT_RE


def audit(rows: list[dict]) -> dict:
    # The ledger can repeat an observation across cycles. Keep source content
    # revisions distinct, but never count repeated snapshots as new examples.
    unique = {(r['url'], r.get('content_hash', '')): r for r in rows}
    collisions, generic_only = [], []
    for row in unique.values():
        item = FeedItem(title=row['title'], snippet=row.get('snippet', ''),
                        url=row['url'], source=row['source'], category='Markets')
        hints = _extract_entities(item)
        text = f'{item.title} {item.snippet}'
        resolved = set(resolve_companies(text, entities=hints,
                                        limit=len(COMPANY_REGISTRY)))
        title, snippet = _norm(item.title), _norm(item.snippet)
        for theme_id, cfg in THEME_CATALOG.items():
            literal = sorted(e for e in cfg['entities']
                             if f' {e.lower()} ' in title or f' {e.lower()} ' in snippet)
            hint_hits = sorted(e for e in cfg['entities']
                               if e.upper() in {h.upper() for h in hints})
            invalid = [e for e in set(literal + hint_hits)
                       if e in COMPANY_REGISTRY and e not in resolved]
            if invalid:
                collisions.append(dict(url=row['url'], title=item.title,
                                       theme_id=theme_id, rejected_tickers=sorted(invalid),
                                       resolved_companies=sorted(resolved)))
            keywords = []
            for keyword in cfg['keywords']:
                pattern = f' {_PUNCT_RE.sub(" ", keyword.lower())} '
                if pattern in title or pattern in snippet:
                    keywords.append(keyword)
                if len(keywords) == 3:
                    break
            if (keywords and not literal and not hint_hits
                    and set(keywords) <= set(cfg.get('generic_keywords', []))):
                generic_only.append(dict(url=row['url'], title=item.title,
                                         theme_id=theme_id, keywords=keywords))
    return dict(
        schema_version=1,
        method='Historical observation-level mechanism audit; not event precision or live validation',
        observation_rows=len(rows), unique_observations=len(unique),
        collision_pairs=len(collisions),
        observations_with_collisions=len({r['url'] for r in collisions}),
        collision_tokens=dict(Counter(t for r in collisions for t in r['rejected_tickers'])),
        generic_only_pairs=len(generic_only),
        collisions=collisions, generic_only=generic_only,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    rows = [json.loads(line) for line in args.input.read_text(encoding='utf-8').splitlines() if line.strip()]
    result = audit(rows)
    result['input'] = args.input.as_posix()
    result['catalog_themes'] = len(THEME_CATALOG)
    rendered = json.dumps(result, indent=2, ensure_ascii=False) + '\n'
    if args.output:
        args.output.write_text(rendered, encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k not in ('collisions', 'generic_only')}, indent=2))


if __name__ == '__main__':
    main()
