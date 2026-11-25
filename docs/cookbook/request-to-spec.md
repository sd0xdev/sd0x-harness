# Turn a Rough Request into a Tech Spec

## Use this when

You have a vague idea or stakeholder request and need to turn it into a concrete, implementable technical specification.

## Core skills

| Skill | Role |
|-------|------|
| `/req-analyze` | Decompose requirements, stakeholder scan, structuring |
| `/feasibility-study` | Evaluate solution approaches with quantitative comparison |
| `/tech-spec` | Generate the technical specification document |
| `/review-spec` | Review spec for completeness and feasibility |
| `/codex-brainstorm` | Adversarial debate for design decisions |

## Command flow

1. `/req-analyze` — decompose the request into structured requirements (produces `1-requirements.md`)
2. `/feasibility-study` — evaluate 2-3 solution approaches with trade-off analysis
3. `/codex-brainstorm` — adversarial debate on key design decisions (stops when no new objections remain)
4. `/tech-spec` — generate the full technical spec (produces `2-tech-spec.md`)
5. `/review-spec` — review for completeness, feasibility, and risk coverage
6. `/create-request` — create a trackable request doc with acceptance criteria

## Decision points

| Situation | Choice |
|-----------|--------|
| Request is well-defined already? | Skip `/req-analyze`, go straight to `/feasibility-study` |
| Only one viable approach? | Skip `/feasibility-study`, go to `/tech-spec` |
| Key design decision is controversial? | `/codex-brainstorm` for adversarial validation |
| Need architecture diagram? | Add `/architecture` after `/tech-spec` |
| Want PM/CTO summary? | `/project-brief` to convert spec into executive summary |

## Gates

| Gate | Enforced by | Sentinel |
|------|------------|----------|
| Spec review | Behavior (not hook-enforced) | `✅ Approved` / `⚠️ Needs revision` / `❌ Needs redesign` |

This is a planning workflow — no hook enforcement. Quality is validated by `/review-spec`.

## Expected outcome

- `1-requirements.md` — structured requirements
- `2-tech-spec.md` — full technical specification with architecture, risks, WBS
- Request doc with trackable acceptance criteria
- Clear implementation plan ready for `/feature-dev`

## Related scenarios

- [Implement a new feature](new-feature.md) — start building after spec is approved
- [First day in a repo](first-day.md) — if you need to understand the project first
