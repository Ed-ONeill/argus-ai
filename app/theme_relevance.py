"""Minimum text evidence for full contributor authority in reviewed theme families.

This is a conservative lexical eligibility gate, not semantic agreement analysis.
Names and broad sector words cannot substitute for the theme's mechanism. A
rejected contribution may still be useful context; we do not label it irrelevant.
Unreviewed theme families retain their existing matching contract.
"""
import re


def _has(text: str, pattern: str) -> bool:
    return re.search(r"\b(?:" + pattern + r")\b", text) is not None


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
        return ai and _has(text, r"chips?|gpus?|accelerators?|training clusters?|"
                          r"compute (?:capacity|access|constraints?|scarcity)|"
                          r"training (?:capacity|infrastructure)|inference (?:chips?|capacity)")
    if theme_id == "semiconductor-capex-cycle":
        semiconductor = _has(text, r"semiconductors?|chips?|fabs?|foundr\w*|wafer\w*|lithography")
        return semiconductor and _has(text, r"capex|capital (?:spending|expenditure)|"
                          r"capacity|equipment|construction|subsid\w*|investment|"
                          r"expansion|demand|growth")
    return True
