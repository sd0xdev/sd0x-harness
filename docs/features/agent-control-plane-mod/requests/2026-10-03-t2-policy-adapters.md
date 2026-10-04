# T2 — Policy classifier and argument-aware adapters

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-10-03
> **Status**: Completed
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) — § 5 task 2
> **Requirements**: [1-requirements.md](../1-requirements.md) — FR-7, FR-8, FR-25
> **Code location**: `~/Projects/agentctl-mod` (outside sd0x-dev-flow, per the intent's Non-goals)

## Background

Task-scoped refusal needs a pure classifier with deny precedence and per-command allow grammars, so that ordinary investigation works and anything it cannot classify is refused.

## Requirements

- `lib/policy.js`: `classify(task, call)` in the tech spec § 3.4 order — forbidden first, needs-user, adapters, executors, unknown
- `lib/adapters.js`: argv grammars for `git` read forms, `ls`, `cat`, `head`, `tail`, `wc`, `rg`/`grep`; unknown options refused; ambient execution channels declared
- Non-Bash rules: Read inside the worktree; edits only inside allowed roots; MCP and other tools unknown unless named
- `task set` validation rejects executors or needs-user entries that overlap forbidden classes

## Scope

| Scope | Description |
| ----- | ----------- |
| In | Tech spec § 5 task 2 |
| Out | Other § 5 tasks; anything in tech spec § 1 Out |

## Related Files

| File (in `~/Projects/agentctl-mod`) | Action | Description |
| ---- | ------ | ----------- |
| `lib/policy.js` | New | Classifier |
| `lib/adapters.js` | New | Command grammars |
| `tests/policy.test.ts` | New | Table tests |

## Acceptance Criteria

- [x] Table tests cover pass, deny, needs-user and unknown for Bash and non-Bash calls
- [x] `git branch -D`, `git diff --output=x`, `rg --pre=x`, `git -C . push`, command substitution, redirection and `sh -c` are refused
- [x] An authorized executor that matches a forbidden class is denied
- [x] A task whose executors overlap its forbidden classes is rejected at `task set`
- [x] No Bash call with a bound task returns pass without matching an adapter grammar or an executor
- [x] Non-Bash rules hold: Read passes only inside the worktree; Write/Edit/NotebookEdit pass only when the task allows edits and the path is inside an allowed root; MCP and other tools are unknown unless the task names them
- [x] `claude plugin test` passes
- [x] Pass /codex-review-fast

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | Tech spec § 3–§ 5 |
| Development | Done | agentctl-mod `0c6a29b` |
| Testing | Done | `claude plugin test .` 124 pass and `claude plugin validate .` passes on the working tree after the AC-verification fixes (agentctl-mod, 2026-10-04) |
| Acceptance | Done | policy and adapter tables incl. evasions and overlaps; Codex ✅ Ready. Host-internal AskUserQuestion, TodoWrite, GetTask pass (they change nothing outside the session) — recorded in the tech spec. Verified live — see T8. `/codex-review-fast` (thorough): ✅ Ready on every round touching this task, latest on the AC-verification fixes. `--verify-ac` (2026-10-04): every AC Complete at High, accounted one result per AC |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md)
- Feasibility: [0-feasibility-study.md](../0-feasibility-study.md)
