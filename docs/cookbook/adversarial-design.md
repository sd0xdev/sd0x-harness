# Stress-Test a Design Decision with Adversarial Debate

## Use this when

You face a design decision with strong trade-offs (performance vs. simplicity, consistency vs. availability, etc.) and want to pressure-test your choice before committing.

## Core skills

| Skill | Role |
|-------|------|
| `/codex-brainstorm` | Multi-round adversarial debate that stops when a round raises no new objection |
| `/codex-architect` | Architecture advice grounded in the codebase |
| `/deep-research` | Research prior art and industry patterns |
| `/feasibility-study` | Quantitative evaluation of alternatives |

## Command flow

1. Frame the decision: define the trade-off axes (e.g., "monolith vs. microservice for auth")
2. `/deep-research <topic>` — gather how others solved similar problems
3. `/codex-brainstorm <decision>` — adversarial debate: pro vs. con perspectives argue until a round raises no new objection (or the round limit is hit)
4. Review the report: which options the evidence leaves standing, with their trade-offs and evidence gaps — decide from that — and, separately, the debate status (converged, agreed trade-off, or diverged), which tells you what the two sides agreed on or left open
5. If architecture is involved: `/codex-architect` — validate against the existing codebase
6. `/feasibility-study` — if multiple viable approaches survived the debate, quantify them

## How adversarial debate works

```
Round 1: Advocate A argues for Option X
         Advocate B argues for Option Y
Round 2: Each responds to the other's strongest points
         ...
Round N: no new objections — debate status + retained options
         with clear trade-off acknowledgment
```

The debate isn't about "winning" — it's about finding blind spots that a single perspective would miss.

## Decision points

| Situation | Choice |
|-----------|--------|
| Debate reveals a third option? | Add it to the debate; run another round |
| One option retained, no evidence gap? | Proceed with it and document the rationale — whatever the debate status |
| Several options retained? | Pick by constraint priority, using the trade-off the report states; close any evidence gap it lists first |
| Debate `Diverged`? | Read the open objections: they say what is unresolved, not which options stand — the retained set does that |
| Need codebase-specific validation? | `/codex-architect` to check feasibility in existing code |

## Gates

No enforced gates — this is a decision-making workflow. Output is a documented decision with trade-off rationale.

## Expected outcome

- Design decision pressure-tested from multiple angles
- Blind spots surfaced and addressed
- Trade-offs explicitly documented (not hidden)
- Clear rationale for the chosen approach
- Ready to proceed to `/tech-spec` or implementation

## Related scenarios

- [Validate a feature direction](validate-direction.md) — broader direction validation before a specific design decision
- [Rough request to tech spec](request-to-spec.md) — turning the validated decision into a spec
