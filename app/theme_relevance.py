"""Minimum text evidence for full contributor authority in reviewed theme families.

This is a conservative lexical eligibility gate, not semantic agreement analysis.
Names and broad sector words cannot substitute for the theme's mechanism. A
rejected contribution may still be useful context; we do not label it irrelevant.
Unreviewed theme families retain their existing matching contract.
"""
import re

from app.companies import resolve_companies
from app.data.theme_ontology import THEME_CATALOG


_SEMICONDUCTOR_COMPANIES = frozenset(resolve_companies(
    " ".join(sorted(THEME_CATALOG["semiconductor-capex-cycle"]["entities"])), limit=100))


def _has(text: str, pattern: str) -> bool:
    return re.search(r"\b(?:" + pattern + r")\b", text) is not None


def _company_demand(title: str) -> bool:
    # A resolved chip supplier's operating demand can be explicit without the
    # word "chip". Company presence alone, filings and demand for securities
    # are insufficient. Keep the subject and demand in the same headline clause.
    for clause in re.split(r"[,;.!?]|\b(?:but|while)\b", title):
        normalized = re.sub(r"[^a-z0-9]+", " ", clause.lower())
        if _has(normalized, r"demand for (?:its |the )?(?:shares?|stock|bonds?|options?|securities)"):
            continue
        match = re.search(
            r"(.+?)(?:['’]s|\s+(?:sees|faces|reports))\s+"
            r"(?:booming|surging|rising|growing|strong|weak|slowing|soaring|falling)\s+demand\b",
            clause, re.IGNORECASE)
        if match and _SEMICONDUCTOR_COMPANIES.intersection(resolve_companies(match.group(1))):
            return True
    return False


def _copper_constraint(title: str, snippet: str) -> bool:
    # The reviewed material constraint is copper explicitly needed for AI.
    # Do not stitch unrelated commodity and AI sentences into causal support.
    for passage in [title, *re.split(r"[.!?;\n]+", snippet)]:
        p = re.sub(r"[^a-z0-9]+", " ", passage.lower())
        if (_has(p, r"copper")
                and _has(p, r"(?:ai|artificial intelligence)(?: s)? (?:demand|buildout)")
                and _has(p, r"shortages?|scarcity|insufficient|not enough|"
                            r"not be able to (?:mine|produce|supply) enough")):
            return True
    return False


def mechanism_supported(theme_id: str, title: str, snippet: str) -> bool:
    text = re.sub(r"[^a-z0-9]+", " ", (title + " " + snippet).lower())
    ai = _has(text, r"ai|artificial intelligence|hyperscalers?|data cent(?:er|re)s?")
    if theme_id == "ai-energy-demand":
        # Both AI/compute demand and its physical power constraint must appear.
        # Do not stitch an AI headline to an unrelated weather/power sentence.
        passages = [title, *re.split(r"[.!?;\n]+", snippet)]
        title_n = re.sub(r"[^a-z0-9]+", " ", title.lower())
        if _has(title_n, r"ai|artificial intelligence|hyperscalers?|data cent(?:er|re)s?") and _has(
                title_n, r"power|electricity|grid|nuclear|generation"):
            passages.append(title + " " + snippet)
        for passage in passages:
            p = re.sub(r"[^a-z0-9]+", " ", passage.lower())
            if (_has(p, r"ai|artificial intelligence|hyperscalers?|data cent(?:er|re)s?")
                    and _has(p, r"power|electricity|grid|nuclear|generation") and _has(
                        p, r"shortages?|scarcity|bottlenecks?|deficits?|constraints?|capacity|"
                           r"interconnection|upgrades?|pricing|prices?|costs?|ppa|power contracts?")):
                return True
        return False
    if theme_id == "glp1-healthcare-revolution":
        return _has(text, r"glp 1|semaglutide|tirzepatide|ozempic|wegovy|mounjaro|zepbound|"
                          r"obesity|weight loss drugs?|metabolic disease")
    if theme_id == "treasury-yield-pressure":
        return _has(text, r"neutral rates?|r star|term premi(?:a|um)|higher for longer|"
                          r"(?:treasury|bond|gilt|bund) yields?|long duration|"
                          r"(?:treasury|bond) (?:prices?|repricing|sell off)|discount rates?")
    if theme_id in {"private-credit-expansion", "direct-lending-expansion"}:
        lending = _has(text, r"private credit|direct lending|non bank lend\w*|"
                             r"alternative lend\w*|asset based (?:finance|lending)|"
                             r"private debt|unitranche")
        displacement = _has(text, r"bank\w*") and _has(text, r"capital constraints?|"
                             r"capital requirements?|retreat\w*|pull\w* back") and _has(text, r"lend\w*|credit")
        return lending or displacement
    if theme_id == "china-stimulus-rotation":
        china = _has(text, r"china|chinese|beijing|pboc")
        return china and _has(text, r"stimulus|easing|reserve requirement|rrr|"
                             r"rate cuts?|domestic demand|consumption recover\w*|"
                             r"property (?:rescue|support)|monetary support")
    if theme_id == "ai-compute-arms-race":
        return _copper_constraint(title, snippet) or (ai and _has(text, r"chips?|gpus?|accelerators?|training clusters?|"
                          r"compute (?:capacity|access|constraints?|scarcity)|"
                          r"training (?:capacity|infrastructure)|inference (?:chips?|capacity)"))
    if theme_id == "semiconductor-capex-cycle":
        semiconductor = _has(text, r"semiconductors?|chips?|fabs?|foundr\w*|wafer\w*|lithography")
        return _company_demand(title) or (semiconductor and _has(text, r"capex|capital (?:spending|expenditure)|"
                          r"capacity|equipment|construction|subsid\w*|investment|"
                          r"expansion|demand|growth"))
    return True
