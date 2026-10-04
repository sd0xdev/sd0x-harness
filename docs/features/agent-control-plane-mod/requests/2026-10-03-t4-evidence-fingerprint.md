# T4 — Evidence hook and Git-derived fingerprint

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-10-03
> **Status**: Completed
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) — § 5 task 4
> **Requirements**: [1-requirements.md](../1-requirements.md) — FR-5, FR-6
> **Code location**: `~/Projects/agentctl-mod` (outside sd0x-dev-flow, per the intent's Non-goals)

## Background

A claimed test pass must be bound to the tree it ran against and shown stale after a later edit; started background work must never read as passed.

## Requirements

- `lib/fingerprint.js`: the git argv lists of tech spec § 3.4 Evidence and the fold into a fingerprint with coverage
- Evidence hook beneath the policy hook: brackets calls matching a `check` executor, keyed by `tool_use_id`; every subprocess carries a timeout
- Partial coverage for `assume-unchanged`/`skip-worktree`, conflicts, submodules, unreadable paths, timeouts
- Background results recorded as backgrounded; only a terminal `GetTask` result closes them; Stop `background_tasks` updates in-flight state

## Scope

| Scope | Description |
| ----- | ----------- |
| In | Tech spec § 5 task 4 |
| Out | Other § 5 tasks; anything in tech spec § 1 Out |

## Related Files

| File (in `~/Projects/agentctl-mod`) | Action | Description |
| ---- | ------ | ----------- |
| `lib/fingerprint.js` | New | Fingerprint builder |
| `hooks/register.js` | Modify | Evidence hook |
| `tests/evidence.test.ts` | New | Process-stub tests |

## Acceptance Criteria

- [x] Signal 3: an edit after a passing check shows the check stale against the new fingerprint, and gate state is shown separately from evidence
- [x] Signal 4: a backgrounded check reads started / completion unobserved until a terminal result
- [x] A fingerprint read that throws records evidence unavailable and never refuses the call
- [x] Partial-coverage cases each produce `coverage: partial` with the reason
- [x] Re-editing an already-dirty file changes the fingerprint
- [x] `claude plugin test` passes
- [x] Pass /codex-review-fast

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | Tech spec § 3–§ 5 |
| Development | Done | agentctl-mod `c22cf03` |
| Testing | Done | `claude plugin test .` 124 pass and `claude plugin validate .` passes on the working tree after the AC-verification fixes (agentctl-mod, 2026-10-04) |
| Acceptance | Done | evidence brackets, 30 s tree refresh, GetTask terminal close, unavailable on failed reads; Codex ✅ Ready (thorough, round 4). Verified live — see T8. `/codex-review-fast` (thorough): ✅ Ready on every round touching this task, latest on the AC-verification fixes. Related Files deviation: the evidence tests were written in `tests/flows.test.ts` (no `tests/evidence.test.ts` was created). `--verify-ac` (2026-10-04): every AC Complete at High, accounted one result per AC |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md)
- Feasibility: [0-feasibility-study.md](../0-feasibility-study.md)
