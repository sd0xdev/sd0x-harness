# T6 — Task command, binding, resume and hand-over

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-10-03
> **Status**: Completed
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) — § 5 task 6
> **Requirements**: [1-requirements.md](../1-requirements.md) — FR-1, FR-13, FR-15, FR-16, FR-25
> **Code location**: `~/Projects/agentctl-mod` (outside sd0x-dev-flow, per the intent's Non-goals)

## Background

The task record must come only from the user, survive a reopen, and produce a model-free hand-over that answers the eight questions.

## Requirements

- `/agentctl task show|set|clear`; `set`/`clear` refused unless `e.origin.kind === 'composer'`
- Binding by worktree key; `classic.SessionStart` re-reads branch, fingerprint and policy and shows the newest checkpoint; nothing is replayed
- `lib/handoff.js`: pure formatter answering the eight UC-6 questions from records; Claude's claims marked as claims
- `/agentctl handoff` saves to `checkpoint/<taskId>/<sessionId>`

## Scope

| Scope | Description |
| ----- | ----------- |
| In | Tech spec § 5 task 6 |
| Out | Other § 5 tasks; anything in tech spec § 1 Out |

## Related Files

| File (in `~/Projects/agentctl-mod`) | Action | Description |
| ---- | ------ | ----------- |
| `lib/handoff.js` | New | Formatter |
| `hooks/register.js` | Modify | Task command and SessionStart |
| `tests/task.test.ts` | New | Task and resume tests |

## Acceptance Criteria

- [x] Signal 1: declare a task, end the session, start a new one: the task and the last hand-over show before any tool runs, and a forbidden call is refused again
- [x] A `task set` from a non-composer origin is refused
- [x] Signal 8: `/agentctl handoff` prints the eight answers; `model.complete`, `http.fetch` and `process.run` stubs fail the test if called on that path
- [x] The hand-over separates verified, unverified and still-running work
- [x] `claude plugin test` passes
- [x] Pass /codex-review-fast

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | Tech spec § 3–§ 5 |
| Development | Done | agentctl-mod `c22cf03` |
| Testing | Done | `claude plugin test .` 124 pass and `claude plugin validate .` passes on the working tree after the AC-verification fixes (agentctl-mod, 2026-10-04) |
| Acceptance | Done | composer-only task set, allowlisted task record and id validation, full checkpoint logged on reopen, model-free hand-over; Codex ✅ Ready. Verified live — see T8. `/codex-review-fast` (thorough): ✅ Ready on every round touching this task, latest on the AC-verification fixes. Related Files deviation: the task and resume tests are in `tests/flows.test.ts` (no `tests/task.test.ts`). `--verify-ac` (2026-10-04): every AC Complete at High, accounted one result per AC |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md)
- Feasibility: [0-feasibility-study.md](../0-feasibility-study.md)
