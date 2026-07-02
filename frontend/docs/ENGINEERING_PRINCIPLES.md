# Argus Engineering Principles

These principles govern development of the Argus intelligence layer. They exist to
keep the architecture understandable, maintainable, and ready for years of growth.
When a change conflicts with a principle, change the plan, not the principle, unless
the team agrees to revise it here.

House rule: no em dashes or en dashes anywhere in generated copy. Use commas, colons,
normal hyphens, or arrows.

---

## Source of truth

1. The graph is the single source of truth. All shared intelligence lives in the
   Market Intelligence Graph. If two surfaces disagree, they are reading different
   data, not different truths. Fix the ingestion, not the reader.

2. Intelligence is computed once, rendered everywhere. Reason in the engines, then
   let every page read the same conclusion. Do not recompute the same intelligence
   per page.

3. Avoid duplicate intelligence. Before adding a computation, check whether an engine
   already produces it. Extend the engine or read its output instead of forking logic.

---

## Layer boundaries

4. UI never owns business logic. Components render conclusions and handle interaction.
   Reasoning belongs in `src/lib` engines, not in components or hooks.

5. Adapters never reason. Adapters translate external data into nodes and edges and
   nothing more. Scoring, direction, and thesis logic belong to the engines.

6. Engines are pure and framework-agnostic. No React, no DOM, no network inside an
   engine. This keeps them testable, portable, and cheap to reason about.

---

## Truth and explainability

7. Engines never fabricate evidence. Only infer from graph nodes and relationships.
   No invented relationships, no hardcoded financial claims, no AI-generated
   storytelling.

8. Every inference must be explainable. Each conclusion carries reasoning steps that
   reference the graph evidence behind it.

9. Confidence must always be traceable. A score is a function of visible components
   (strength, confidence, evidence, cross-source, persistence, momentum, conviction,
   recency). No fake precision, no magic numbers without a reason.

10. Insufficient signal is a valid answer. When the graph does not support a claim,
    return `insufficient_signal` rather than guessing.

---

## Resilience

11. Everything degrades gracefully. Missing data is skipped, not fatal. Reports return
    `found: false` or empty results rather than throwing. The UI shows nothing rather
    than a blank or broken widget.

12. Rebuilds are idempotent. Re-ingesting the same data converges (upsert plus alias
    merge plus edge dedup), it never doubles. Callers can rebuild freely.

---

## Evolution

13. Prefer extending engines over creating new systems. New capability should read the
    graph and existing engine outputs. Do not stand up a parallel intelligence system.

14. Types are open by design. Node and relationship type unions accept new string
    values without code changes. Add a new kind by using it, not by editing a union.

15. Keep scoring simple and understandable. A reader should be able to predict the
    direction of a score change from the inputs. Complexity that cannot be explained
    does not ship.

16. Document the why. When behavior is non-obvious, a short comment or a note in
    ARCHITECTURE.md should explain the reasoning, not just the mechanics.

---

## Working rules of thumb

- Run typecheck and the intelligence test suite before and after intelligence changes.
- Refactor only where behavior is unchanged, and prove it with the test suite.
- Keep developer diagnostics (health, tests, sample data) out of the production bundle:
  never import them from a page or component.
- No em or en dashes in any generated string.
