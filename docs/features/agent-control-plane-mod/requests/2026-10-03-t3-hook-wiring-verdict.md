# T3 — tool.call / tool.check wiring with .catch and the never-weaken table

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-10-03
> **Status**: Candidate Complete
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) — § 5 task 3
> **Requirements**: [1-requirements.md](../1-requirements.md) — FR-7, FR-9, FR-10, NFR-3
> **Code location**: `~/Projects/agentctl-mod` (outside sd0x-dev-flow, per the intent's Non-goals)

## Background

The classifier only protects anything once it is wired ahead of core with a fail-closed catch, and once `tool.check` is guaranteed never to weaken a downstream deny.

## Requirements

- `hooks/register.js`: policy hook on `tool.call` with `.catch` (`called` → replay, else deny)
- `lib/verdict.js`: `combine(outcome, downstream, surfaceVerified)` per tech spec § 3.4; the mod never creates an `allow` and never upgrades a downstream verdict
- `tool.check` hook with its own deny catch; the verified-surface list is empty in v1
- Refusal reasons name the rule and are sanitized

## Scope

| Scope | Description |
| ----- | ----------- |
| In | Tech spec § 5 task 3 |
| Out | Other § 5 tasks; anything in tech spec § 1 Out |

## Related Files

| File (in `~/Projects/agentctl-mod`) | Action | Description |
| ---- | ------ | ----------- |
| `hooks/register.js` | New | Wiring |
| `lib/verdict.js` | New | Verdict table |
| `tests/hooks.test.ts` | New | Hook tests with core stubs |

## Acceptance Criteria

- [x] Signal 5: a `kubectl rollout restart` call is refused with the rule named before core runs; a log read reaches core unchanged
- [x] Signal 6: a classifier throw is refused through `.catch`; a failure after delegation replays the settled result
- [x] Signal 10: downstream deny stays deny for needs-user; needs-user on an unverified surface is denied; pass-through keeps the downstream verdict
- [x] The mod never creates an allow: tests assert that `tool.check` returns `allow` only when the downstream verdict was `allow` on a pass-through call, and never upgrades a downstream `ask` or `deny`
- [x] `claude plugin test` passes
- [x] Pass /codex-review-fast

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | Tech spec § 3–§ 5 |
| Development | Done | agentctl-mod `0c6a29b` |
| Testing | Done | `claude plugin test .` 100 pass at `c22cf03`; `claude plugin validate .` passes |
| Acceptance | Done | hook tests with core stubs; combine never creates an allow; Codex ✅ Ready. Not yet verified live — see T8 |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md)
- Feasibility: [0-feasibility-study.md](../0-feasibility-study.md)
