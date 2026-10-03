# T5 — Band and /agentctl status, policy, events

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-10-03
> **Status**: Candidate Complete
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) — § 5 task 5
> **Requirements**: [1-requirements.md](../1-requirements.md) — FR-2, FR-3, FR-17, FR-23
> **Code location**: `~/Projects/agentctl-mod` (outside sd0x-dev-flow, per the intent's Non-goals)

## Background

The user needs one glanceable band and a text form for surfaces that draw nothing.

## Requirements

- `ui/band.js`: `AbovePrompt` element from state, coexisting with other bands
- `/agentctl`, `/agentctl policy`, `/agentctl events [n]` registered via `$.command.register`, answered without a model call
- Every field carries source and age; missing / unavailable / stale rendering per FR-3
- `/agentctl policy` lists the disclosed limits (host skips, other mods, text-matching native rules)

## Scope

| Scope | Description |
| ----- | ----------- |
| In | Tech spec § 5 task 5 |
| Out | Other § 5 tasks; anything in tech spec § 1 Out |

## Related Files

| File (in `~/Projects/agentctl-mod`) | Action | Description |
| ---- | ------ | ----------- |
| `ui/band.js` | New | Band component |
| `hooks/register.js` | Modify | Commands |
| `tests/ui.test.ts` | New | Mount and command tests |

## Acceptance Criteria

- [x] Signal 2: with the gate reader removed, returning non-JSON, or exiting non-zero, gate fields read unavailable and nothing else changes
- [x] The band keeps another mod's band output
- [x] Usage windows are read by `kind`; a missing window reads missing, never 0%
- [x] `/agentctl` under `claude -p` stubs returns the status text with no `model.*` or `http.*` call
- [x] `claude plugin test` passes
- [x] Pass /codex-review-fast

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | Tech spec § 3–§ 5 |
| Development | Done | agentctl-mod `c22cf03` |
| Testing | Done | `claude plugin test .` 100 pass at `c22cf03`; `claude plugin validate .` passes |
| Acceptance | Done | band with gate age and stale marker, /agentctl status/policy/events; Codex ✅ Ready. Not yet verified live — see T8 |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md)
- Feasibility: [0-feasibility-study.md](../0-feasibility-study.md)
