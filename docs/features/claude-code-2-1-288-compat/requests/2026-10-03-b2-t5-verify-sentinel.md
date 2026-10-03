# `/verify` prints `## Verify:`, never the precommit sentinel (task 5)

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see the tech spec.
> **Created**: 2026-10-03
> **Status**: Candidate Complete
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)

## Background

Claude Code 2.1.286 tells Claude to run a skill named `verify` before commits. `verify-runner.js`
ends its report with `## Overall: ✅ PASS / ❌ FAIL`, which `rules/auto-loop.md` § Gate Sentinels
reserves for the precommit runner, so a verification run reads as a precommit verdict.

## Requirements

- `verify-runner.js` ends its summary with `## Verify: ✅ PASS` or `## Verify: ❌ FAIL`
- Both output templates in `skills/verify/SKILL.md` follow
- `rules/auto-loop.md` is unchanged: `## Overall:` stays the precommit runner's alone

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `scripts/verify-runner.js`, `skills/verify/SKILL.md`, `test/scripts/verify-runner.test.js` |
| Out | Commit-context behaviour (task 6); the precommit runner |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `scripts/verify-runner.js` | Modify | Summary sentinel |
| `skills/verify/SKILL.md` | Modify | Fast and full output templates |
| `test/scripts/verify-runner.test.js` | Modify | Sentinel assertions |

## Acceptance Criteria

- [x] The runner's stdout contains `## Verify: ✅ PASS` on a passing run and `## Verify: ❌ FAIL` on a failing one, and never `## Overall:`
- [x] A run whose every step is skipped still reports `## Verify: ✅ PASS`
- [x] Neither template in `skills/verify/SKILL.md` contains `## Overall:`
- [x] `/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec § 3.4 Batch 2 |
| Development | Done | Runner prints `## Verify:`. Code review round 1 added the case of a child step that prints `## Overall:` itself: the live stream drops it and the summary tail shows it as `## (child) Overall:` |
| Testing | Done | Pass, fail and all-skipped runs, plus a child step that prints the reserved sentinel; a mutant without the neutralization leaks it |
| Acceptance | Done | `/codex-review-fast` ✅ Ready → `/precommit` `## Overall: ✅ PASS` (code review: 2 rounds) |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.4, § 5 task 5, § 6 Verify
- Intent: [intent-claude-code-2-1-288-compat.md](../intent-claude-code-2-1-288-compat.md) INV-003
