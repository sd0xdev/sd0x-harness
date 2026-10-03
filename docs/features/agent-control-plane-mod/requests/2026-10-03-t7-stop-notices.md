# T7 — Stop control and local notices

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-10-03
> **Status**: Candidate Complete
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) — § 5 task 7
> **Requirements**: [1-requirements.md](../1-requirements.md) — FR-12, FR-18, FR-24
> **Code location**: `~/Projects/agentctl-mod` (outside sd0x-dev-flow, per the intent's Non-goals)

## Background

Stop must report only what it observed, and a blocking reason must notify once, not repeatedly.

## Requirements

- `/agentctl stop`: save the hand-over, then `$.turn.abort` for the held turn; report per tech spec § 3.4 Stop
- Notices: one per intervention reason, repeated only on clear-and-return or rising severity, 10-minute cool-down

## Scope

| Scope | Description |
| ----- | ----------- |
| In | Tech spec § 5 task 7 |
| Out | Other § 5 tasks; anything in tech spec § 1 Out |

## Related Files

| File (in `~/Projects/agentctl-mod`) | Action | Description |
| ---- | ------ | ----------- |
| `hooks/register.js` | Modify | Stop and notices |
| `tests/stop.test.ts` | New | Stop and notice tests |

## Acceptance Criteria

- [x] Signal 7: stop during a running tool reports the turn and each tracked operation separately; the text never says all stopped
- [x] A rejected abort reads 'cancellation request failed; turn outcome unconfirmed'
- [x] The hand-over is saved even when the abort fails
- [x] Signal 11: the same reason raised three times yields one notice; cleared and re-raised yields a second
- [x] `claude plugin test` passes
- [x] Pass /codex-review-fast

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | Tech spec § 3–§ 5 |
| Development | Done | agentctl-mod `c22cf03` |
| Testing | Done | `claude plugin test .` 100 pass at `c22cf03`; `claude plugin validate .` passes |
| Acceptance | Done | immediate stop, subagent turns ignored, notices de-duplicated; Codex ✅ Ready. Not yet verified live — see T8 |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md)
- Feasibility: [0-feasibility-study.md](../0-feasibility-study.md)
