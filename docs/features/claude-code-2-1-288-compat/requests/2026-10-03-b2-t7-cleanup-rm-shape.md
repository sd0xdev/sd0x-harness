# Run-owned cleanup under the host's dangerous-`rm` check (task 7)

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see the tech spec.
> **Created**: 2026-10-03
> **Status**: Candidate Complete
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)

## Background

Claude Code 2.1.281 holds a removal of a critical path for approval and, in `auto` mode, denies it after two
minutes. `/epic-merge --cleanup` removes its manifest directory with a path derived in the same
fence; `/create-pr` removes its `mktemp -d` run directory. Whether the host flags the first shape
decides whether it is rewritten (tech spec § 7 Q1).

## Requirements

- Run the `/epic-merge` cleanup fence's exact shape on a fixture under the host in auto mode and
  record the classification in the skill, as measured with the host version and date
- If flagged: rewrite to derive and validate in one call and remove the literal path in the next.
  If not: no rewrite
- `/create-pr`: a test that every removal operand is the literal `mktemp -d` path, never an
  expansion
- No env opt-out, tool substitution or retry loop around the host's check (INV-006)

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `skills/epic-merge/SKILL.md`, `test/skills/epic-merge.test.js`, `test/skills/create-pr.test.js` |
| Out | Any change to the host's safeguard |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `skills/epic-merge/SKILL.md` | Modify | Measured host classification of the cleanup shape |
| `test/skills/epic-merge.test.js` | Modify | The record is present and names version, mode and result |
| `test/skills/create-pr.test.js` | Modify | Removal operands are single-quoted literals |

## Acceptance Criteria

- [x] The cleanup section records the measured classification with host version, mode and date
- [x] The fence is rewritten only if the measurement flagged it
- [x] Every `rm` in `/create-pr`'s fences takes a single-quoted `<PR_BODY_DIR>` literal; a fence removing `"$DIR"` fails the check (negative control)
- [x] `/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec § 3.4 Batch 2, § 7 |
| Development | Done | Measured 2026-10-03 on Claude Code 2.1.288 in `auto` mode: the cleanup shape ran with no prompt and removed the fixture manifests, so the fence was recorded, not rewritten |
| Testing | Done | Record test in `test/skills/epic-merge.test.js`; literal-operand test with a negative control in `test/skills/create-pr.test.js` |
| Acceptance | Done | `/codex-review-fast` ✅ Ready → `/precommit` `## Overall: ✅ PASS` |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.4, § 5 task 7, § 6 Cleanup, § 7
- Intent: [intent-claude-code-2-1-288-compat.md](../intent-claude-code-2-1-288-compat.md) INV-006, INV-007
